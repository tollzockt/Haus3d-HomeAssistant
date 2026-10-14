// Dächer in 3D (Mixin für HouseScene): Hausdach und Dach-Einheiten aller Etagen (eigene Dächer von Räumen,
// Dachteile), PV-Felder (Module als InstancedMesh, Leistung als Glanz), Gauben, Kamine und Dachfenster sowie die
// Dachflächen mit Giebeln (am Hausdach über dem Dachgeschoss mit Löchern für Fenster und Türen, gable.js).

import * as THREE from "./vendor/three.module.min.js";
import { PanelBatch } from "./scene-geo.js";
import { planarUVs } from "./textures.js";
import { textureFor } from "./model.js";
import { ROOF_ITEMS, adjustRoofParts, dormerShape, panelArraySlots, panelBasis, panelSlots, pvLayout, roofFaces, roofModel, roofObstacles, roofParts, roofSurfaceAt } from "./exterior.js";
import { floorModels, roofUnits } from "./roofunits.js";
import { gableCut, gableFaces, gableTriangles } from "./gable.js";

// Dreiecke einer ebenen Fläche mit Löchern (Giebel): Index-Dreiecke über [...außen, ...Löcher]
const tri2d = (o, hs) => THREE.ShapeUtils.triangulateShape(o.map(([a, y]) => new THREE.Vector2(a, y)), hs.map((h) => h.map(([a, y]) => new THREE.Vector2(a, y))));

export const SceneRoof = {
  /**
   * Hausdach (settings.roof, nur in „Alle“) und Dach-Einheiten aller Etagen (roofunits.js): eigene Dächer von
   * Räumen und Dachteile gehören zu ihrer Etage. Einheiten ohne Modell (zu klein oder verdreht) fehlen.
   */
  _buildRoof(building, house = roofModel(building), units = roofUnits(building, null, { house: false, houseModel: house })) {
    this.roofHolder = null;
    this.roofModel = null;
    this.roofMeshes = [];
    this.roomRoofs = new Map(); // roomId -> Dach der Einheit darüber ({group, parts, eave, tan, type, top, items, key, shape})
    this.roofUnitModels = new Map(); // Schlüssel → Modell wie im Bild (Hausdach und Einheiten)
    this.roofUnitGroups = new Map(); // Schlüssel → Hülle der Einheit
    this.roofUnitMeshes = []; // [{key, mesh}]: Dachflächen der Einheiten (Verdeckung der Schilder)
    for (const e of this.floors.values()) e.roofWrappers = [];
    const wall = building.settings?.wall_exterior ?? 0.24;
    // alle Dächer mit Modell (für „others“: Module unter einem anderen Dach derselben Etage fallen weg)
    const all = [...(house ? [{ key: "house", floorId: house.floor?.id, model: house }] : []), ...units];
    if (house?.parts.length) {
      const holder = new THREE.Group();
      const inner = new THREE.Group();
      inner.userData.layer = "roof";
      holder.add(inner);
      const res = this._roofGeometry(house.rooms, house.roof, house.top, wall, inner, { settings: building.settings, parts: house.parts });
      const model = { ...house, parts: res.parts, eave: res.eave, tan: res.tan };
      this.roofModel = model; // für Kenndaten der PV-Felder (gleiche Flächen wie im Bild)
      this.roofUnitModels.set("house", model);
      const items = Array.isArray(house.roof.items) ? house.roof.items : [];
      // verschiebbare PV-Felder (Dach-Ebene im Editor) ersetzen die Angaben je Richtung
      if (!items.some((it) => it.type === "pv")) this._roofPanels(inner, model, building.settings?.north ?? 0);
      this._roofItems(inner, model, items, "house", floorModels(all, house.floor?.id, "house"));
      this.roofMeshes.push(...res.meshes);
      for (const m of res.meshes) m.userData.roof = true;
      this.roofHolder = holder;
      this.root.add(holder);
    }
    for (const u of units) {
      if (!u.model) continue; // Dachteil zu klein oder verdreht: nur im Editor (rot gestrichelt)
      const entry = this.floors.get(u.floorId);
      if (!entry) continue;
      // Hülle ohne Ebene: Etagenwahl blendet sie aus (man schaut hinein), innen die Ebene „roof“
      const wrap = new THREE.Group();
      const group = new THREE.Group();
      group.userData.layer = "roof";
      wrap.add(group);
      const res = u.model.shape
        ? this._buildRoofShape(u.model.shape, group, u, building.settings ?? {})
        : this._roofGeometry(u.rooms, u.model.roof, u.model.top, wall, group, { roomRoof: true, settings: building.settings ?? {}, parts: u.model.parts });
      for (const m of res.meshes) m.userData.roofUnit = u.key;
      this.roofUnitMeshes.push(...res.meshes.map((mesh) => ({ key: u.key, mesh })));
      const model = u.model.shape ? u.model : { ...u.model, parts: res.parts };
      this.roofUnitModels.set(u.key, model);
      this._roofItems(group, model, u.items, u.key, floorModels(all, u.floorId, u.key));
      Object.assign(res, { group, items: u.items, key: u.key, top: model.top, shape: !!u.model.shape });
      for (const r of u.rooms ?? []) this.roomRoofs.set(r.id, res);
      entry.group.add(wrap);
      entry.roofWrappers.push(wrap);
      this.roofUnitGroups.set(u.key, wrap);
    }
  },

  /** Ist das Dach mit diesem Schlüssel zu sehen (Hausdach: _roofShown; Einheit: Ebene „Dach“ und ihre Hülle)? */
  roofKeyShown(key = "house") {
    if (key === "house") return this._roofShown();
    if (this.layers.roof === false || !this.roofUnitGroups?.has(key)) return false;
    for (let o = this.roofUnitGroups.get(key).children[0]; o; o = o.parent) if (!o.visible) return false;
    return true;
  },

  /**
   * Ein PV-Modul (oder Dachfenster) flach auf der Dachfläche: Mitte p (Grundriss), Höhe y, Richtung
   * hangabwärts out. Ziel ist ein PanelBatch (Module) oder eine Gruppe (eigenes Mesh, Dachfenster).
   */
  _panelOnRoof(group, p, y, out, tan, w, l, mats, along = null) {
    const b = panelBasis(out, tan, along);
    const [U, N, Z] = [b.U, b.N, b.Z].map((v) => new THREE.Vector3(...v));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, N, Z));
    const pos = new THREE.Vector3(p[0], y, p[1]).addScaledVector(N, 0.07);
    if (group instanceof PanelBatch) {
      group.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(w, 1, l)));
      return null;
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, l), mats);
    panel.quaternion.copy(q);
    panel.position.copy(pos);
    group.add(panel);
    return panel;
  },

  /** Materialien eines PV-Felds: eigene Kopie der Moduloberseite (glänzt je nach Leistung). */
  _pvMats() {
    const f = this.mats.solarFrame;
    return [f, f, this.mats.solar.clone(), f, f, f];
  },

  /** PV-Feld fertigstellen: InstancedMesh einhängen, für Leistung/Auswahl und Schild merken (roofKey: Dach darunter). */
  _finishPvField(batch, parent, id, label = null, roofKey = "house") {
    const inst = batch.mesh();
    if (!inst) return null;
    parent.add(inst);
    if (id) {
      const solar = Array.isArray(inst.material) ? inst.material[2] : null;
      const box = inst.boundingBox ?? new THREE.Box3();
      const c = box.getCenter(new THREE.Vector3());
      this.pvFields.set(id, { mesh: inst, solar, base: solar?.emissiveIntensity ?? 0, baseColor: solar?.emissive.getHex() ?? 0, label, roofKey });
      this.anchors.push({ key: `pv:${id}`, floorId: null, roof: true, roofKey, position: new THREE.Vector3(c.x, box.max.y + 0.35, c.z) });
    }
    return inst;
  },

  /**
   * Leistung je PV-Feld (Map id → Anteil 0..1 der Spitzenleistung): Module glänzen leicht, ohne
   * Neuaufbau.
   */
  setPvPower(ratios) {
    let changed = false;
    for (const [id, f] of this.pvFields ?? []) {
      if (!f.solar) continue;
      const r = Math.min(1, Math.max(0, Number(ratios?.get(id)) || 0));
      const want = f.base + 0.3 * r;
      if (Math.abs(f.solar.emissiveIntensity - want) < 0.01) continue;
      if (!f.baseColor) f.solar.emissive.setHex(r > 0 ? 0x4f8fe8 : 0x000000);
      f.solar.emissiveIntensity = want;
      changed = true;
    }
    if (changed) this.invalidate();
  },

  /**
   * PV-Module nach Himmelsrichtung (roof.solar = {N, E, S, W} Anzahl) bzw. PV-Felder je Richtung
   * (roof.solar_arrays). Ältere Angaben; die Dach-Ebene im Editor nutzt roof.items.
   */
  _roofPanels(parent, model, north) {
    const { roof, tan } = model;
    const arrays = roof.solar_arrays;
    if ((!roof.solar && !arrays?.length) || !["gable", "hip", "shed"].includes(roof.type)) return;
    const group = new THREE.Group();
    group.userData.layer = "solar";
    const faces = roofFaces(model, north);
    const mats = [this.mats.solarFrame, this.mats.solarFrame, this.mats.solar, this.mats.solarFrame, this.mats.solarFrame, this.mats.solarFrame];
    const batch = new PanelBatch(mats);
    const place = (f, slots) => {
      const fr = f.fr;
      for (const { s, x, w = 1.0, l = 1.7 } of slots) {
        const t = roof.type === "shed" ? -fr.width / 2 + x : f.sg * (fr.width / 2 - x);
        const p = [fr.center[0] + s * fr.u[0] + t * fr.v[0], fr.center[1] + s * fr.u[1] + t * fr.v[1]];
        this._panelOnRoof(batch, p, model.eave + x * tan, f.out, tan, w, l, mats);
      }
    };
    if (arrays?.length) {
      for (const a of arrays) {
        const f = faces.filter((x) => x.dir === a.dir).sort((p, q) => q.fr.length - p.fr.length)[0];
        if (!f) continue;
        place(f, panelArraySlots(f.fr, { tan, type: roof.type, cols: Math.max(1, Number(a.cols) || 1), rows: Math.max(1, Number(a.rows) || 1), orient: a.orient === "landscape" ? "landscape" : "portrait", left: Math.max(0, Number(a.left) || 0), row: Math.max(0, Number(a.row) || 0), flip: f.flip, hipEnds: f.fr.hipEnds ?? [false, false], blocked: f.blocked }));
      }
    } else {
      for (const dir of ["S", "E", "W", "N"]) {
        let left = Math.max(0, Math.round(Number(roof.solar[dir]) || 0));
        for (const f of faces.filter((x) => x.dir === dir).sort((a, b) => b.fr.length - a.fr.length)) {
          if (left <= 0) break;
          const slots = panelSlots(f.fr, { tan, count: left, type: roof.type, hipEnds: f.fr.hipEnds ?? [false, false], blocked: f.blocked });
          left -= slots.length;
          place(f, slots);
        }
      }
    }
    this._finishPvField(batch, group, null);
    if (group.children.length) parent.add(group);
  },

  /**
   * Gaube: Frontwand mit Fenstern, Seitenwangen bis aufs Hauptdach, Dach als Schlepp-, Sattel- oder
   * Flachdach (exterior.js:dormerShape).
   */
  _buildDormer(group, model, it) {
    const g = dormerShape(model, it);
    if (!g) return;
    const V = (p, y) => new THREE.Vector3(p[0], y, p[1]);
    const tri = (list) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(list.flatMap((v) => [v.x, v.y, v.z]), 3));
      geo.computeVertexNormals();
      return geo;
    };
    const quad = (a, b, c, d) => [a, b, c, a, c, d];
    const cyber = this.style === "cyber";
    const wallMat = new THREE.MeshStandardMaterial(cyber ? { color: 0x1b0f33, emissive: 0xff2bd6, emissiveIntensity: 0.2, side: THREE.DoubleSide } : { color: /^#[0-9a-f]{6}$/i.test(it.color ?? "") ? it.color : 0xe9e4dc, roughness: 0.9, side: THREE.DoubleSide });
    const roofMat = this.mats.roof.clone();
    if (!cyber && /^#[0-9a-f]{6}$/i.test(it.roof_color ?? "")) roofMat.color.set(it.roof_color);
    const { f0, f1, b0, b1, y0, yTop, yBack, out } = g;
    const c = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2];
    const back = (p, k) => [p[0] - out[0] * k, p[1] - out[1] * k];
    const wall = [];
    const roof = [];
    wall.push(...quad(V(f0, y0), V(f1, y0), V(f1, yTop), V(f0, yTop)));
    if (g.style === "gable") {
      const e0 = back(f0, g.eave);
      const e1 = back(f1, g.eave);
      const rb = back(c, g.depth);
      wall.push(V(f0, yTop), V(f1, yTop), V(c, g.ridge)); // Giebeldreieck
      wall.push(V(f0, y0), V(f0, yTop), V(e0, yTop), V(f1, y0), V(f1, yTop), V(e1, yTop));
      roof.push(...quad(V(f0, yTop), V(c, g.ridge), V(rb, g.ridge), V(e0, yTop)));
      roof.push(...quad(V(f1, yTop), V(c, g.ridge), V(rb, g.ridge), V(e1, yTop)));
    } else {
      wall.push(V(f0, y0), V(f0, yTop), V(b0, yBack), V(f1, y0), V(f1, yTop), V(b1, yBack));
      // kleiner Überstand vorne
      const o0 = [f0[0] + out[0] * 0.12, f0[1] + out[1] * 0.12];
      const o1 = [f1[0] + out[0] * 0.12, f1[1] + out[1] * 0.12];
      roof.push(...quad(V(o0, yTop + 0.12 * g.tanP + 0.03), V(o1, yTop + 0.12 * g.tanP + 0.03), V(b1, yBack + 0.03), V(b0, yBack + 0.03)));
    }
    const wm = new THREE.Mesh(tri(wall), wallMat);
    const rm = new THREE.Mesh(tri(roof), roofMat);
    group.add(wm, rm);
    // Fenster in der Front
    const n = g.windows;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n - 0.5;
      const ww = Math.min(0.9, (g.w / n) * 0.7);
      const p = [c[0] + g.along[0] * t * g.w + out[0] * 0.02, c[1] + g.along[1] * t * g.w + out[1] * 0.02];
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, g.h * 0.6), this.mats.glass);
      pane.position.set(p[0], y0 + g.h * 0.5, p[1]);
      pane.rotation.y = Math.atan2(out[0], out[1]);
      group.add(pane);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(ww + 0.08, g.h * 0.6 + 0.08), this.mats.frame);
      frame.position.set(p[0] - out[0] * 0.005, y0 + g.h * 0.5, p[1] - out[1] * 0.005);
      frame.rotation.y = pane.rotation.y;
      group.add(frame);
    }
  },

  /**
   * Dinge auf dem Dach (roof.items): Kamin, Dachfenster, PV-Felder; Lage im Grundriss, Höhe und Neigung aus der
   * Dachfläche. others: übrige Dächer derselben Etage (dort verdeckte Module fallen weg).
   */
  _roofItems(parent, model, items, roofKey = "house", others = []) {
    const solar = new THREE.Group();
    solar.userData.layer = "solar";
    const other = new THREE.Group();
    other.userData.layer = "roof";
    const cyber = this.style === "cyber";
    const pvMats = [this.mats.solarFrame, this.mats.solarFrame, this.mats.solar, this.mats.solarFrame, this.mats.solarFrame, this.mats.solarFrame];
    const skyMats = [this.mats.frame, this.mats.frame, this.mats.glass, this.mats.frame, this.mats.frame, this.mats.frame];
    const obstacles = roofObstacles(model, items); // Kamin und Dachfenster: dort keine Module
    for (const it of items) {
      if (!Number.isFinite(it?.x) || !Number.isFinite(it?.z)) continue;
      if (it.type === "pv") {
        const lay = pvLayout(model, it, { obstacles, others });
        const batch = new PanelBatch(this._pvMats(), { pvField: it.id ?? null });
        for (const [i, p] of lay.panels.entries()) {
          const hit = roofSurfaceAt(model, p);
          if (!hit || !lay.fits[i]) continue;
          this._panelOnRoof(batch, p, hit.y, hit.out ? lay.out : null, hit.tan ?? model.tan, lay.w, lay.l, pvMats, lay.along);
        }
        this._finishPvField(batch, solar, it.id ?? null, it.name ?? null, roofKey);
      } else if (it.type === "skylight") {
        const hit = roofSurfaceAt(model, [it.x, it.z]);
        if (!hit) continue;
        const w = Number(it.w) || ROOF_ITEMS.skylight.w;
        const l = Number(it.l) || ROOF_ITEMS.skylight.l;
        this._panelOnRoof(other, [it.x, it.z], hit.y, hit.out, hit.tan ?? model.tan, w, l, skyMats, [1, 0]);
      } else if (it.type === "dormer") {
        this._buildDormer(other, model, it);
      } else if (it.type === "chimney") {
        const w = Number(it.w) || ROOF_ITEMS.chimney.w;
        const d = Number(it.d) || ROOF_ITEMS.chimney.d;
        const above = Number.isFinite(Number(it.h)) && it.h !== null ? Number(it.h) : ROOF_ITEMS.chimney.h;
        const a = ((it.rotation || 0) * Math.PI) / 180;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [it.x + (i * w * Math.cos(a)) / 2 - (k * d * Math.sin(a)) / 2, it.z + (i * w * Math.sin(a)) / 2 + (k * d * Math.cos(a)) / 2]);
        const ys = corners.map((c) => roofSurfaceAt(model, c)?.y).filter(Number.isFinite);
        if (!ys.length) continue;
        const y0 = model.top - 0.3;
        const y1 = Math.max(...ys) + above;
        const base = new THREE.MeshStandardMaterial(cyber ? { color: 0x1b0f33, emissive: 0xff2bd6, emissiveIntensity: 0.3 } : { color: /^#[0-9a-f]{6}$/i.test(it.color ?? "") ? it.color : 0x9c5a44, roughness: 0.9 });
        const mat = this._texMat(base, textureFor("wall", it.texture || "brick"), "chimney", true);
        const geo = planarUVs(new THREE.BoxGeometry(w, y1 - y0, d).toNonIndexed());
        const body = new THREE.Mesh(geo, mat);
        body.position.set(it.x, (y0 + y1) / 2, it.z);
        body.rotation.y = -a;
        other.add(body);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1), this.mats.solarFrame);
        cap.position.set(it.x, y1 + 0.04, it.z);
        cap.rotation.y = -a;
        other.add(cap);
      }
    }
    if (solar.children.length) parent.add(solar);
    if (other.children.length) parent.add(other);
  },

  /**
   * Dachflächen und Giebel für eine Gruppe von Räumen bauen und in parent hängen.
   * @returns {{meshes: THREE.Mesh[], parts: object[], eave: number, tan: number, type: string, top: number}}
   */
  _roofGeometry(rooms, roof, top, wall, parent, { roomRoof = false, settings = {}, parts: given = null } = {}) {
    const ov = roof.overhang;
    // Rahmen des Modells bzw. von Hand angepasste Dachteile (roof.adjust, Dach-Ebene im Editor)
    const parts = given ?? adjustRoofParts(roofParts(rooms, { wall, overhang: ov, direction: roof.direction }), roof.adjust, !!roof.flip);
    const tan = Math.tan(THREE.MathUtils.degToRad(roof.pitch));
    const roofPos = [];
    const gablePos = [];
    const tri = (list, ...pts) => list.push(...pts.flat());
    const quad = (list, a, b, c, d) => tri(list, a, b, c, a, c, d);
    const eave = top - ov * tan; // Dachfläche trifft die Wand genau an ihrer Oberkante
    const meshes = [];
    // eigene Dachfarbe (roof.color), sonst Standard des Stils
    const custom = /^#[0-9a-f]{6}$/i.test(roof.color ?? "") && this.style !== "cyber";
    let roofMat = custom ? this.mats.roof.clone() : this.mats.roof;
    if (custom) roofMat.color.set(roof.color);
    roofMat = this._texMat(roofMat, textureFor("roof", roof.texture, roof.type), "roof", custom);
    // L-/T-Häuser: mehrere Teile; ein Flügel steckt mit einem Ende (open) im Hauptdach
    for (const fr of parts) {
      const L = fr.length / 2;
      const W = fr.width / 2;
      const Wi = Math.max(0.1, W - ov);
      const [openLo, openHi] = fr.open ?? [false, false];
      const P = (s, t, y) => [fr.center[0] + s * fr.u[0] + t * fr.v[0], y, fr.center[1] + s * fr.u[1] + t * fr.v[1]];
      if (roof.type === "flat") {
        const slab = new THREE.Mesh(planarUVs(new THREE.BoxGeometry(2 * L, 0.25, 2 * W).toNonIndexed()), roofMat);
        slab.position.set(fr.center[0], top + 0.125, fr.center[1]);
        slab.rotation.y = -Math.atan2(fr.u[1], fr.u[0]);
        parent.add(slab);
        meshes.push(slab);
      } else if (roof.type === "gable" || roof.type === "hip") {
        const ridge = eave + W * tan;
        // Walm an den freien Enden; beim Satteldach optional am freien Ende eines Flügels (roof.wing_end)
        const wingHip = roof.type === "gable" && roof.wing_end === "hip" && (openLo || openHi);
        const hipLo = !openLo && (roof.type === "hip" || (wingHip && openHi));
        const hipHi = !openHi && (roof.type === "hip" || (wingHip && openLo));
        fr.hipEnds = [hipLo, hipHi];
        const rLo = hipLo ? Math.max(0, L - W) : L;
        const rHi = hipHi ? Math.max(0, L - W) : L;
        // Stück im Nachbardach (inner): ohne seitlichen Überstand, sonst schaut es unter dessen Giebel heraus
        const [inLo, inHi] = fr.inner ?? [0, 0];
        const sA = -L + Math.min(inLo, L);
        const sB = L - Math.min(inHi, L);
        for (const sg of [-1, 1]) {
          quad(roofPos, P(sA, sg * W, eave), P(sB, sg * W, eave), P(Math.min(sB, rHi), 0, ridge), P(Math.max(sA, -rLo), 0, ridge));
          if (inLo) quad(roofPos, P(-L, sg * Wi, top), P(sA, sg * Wi, top), P(sA, 0, ridge), P(-L, 0, ridge));
          if (inHi) quad(roofPos, P(sB, sg * Wi, top), P(L, sg * Wi, top), P(L, 0, ridge), P(sB, 0, ridge));
        }
        if (hipLo) tri(roofPos, P(-L, -W, eave), P(-L, W, eave), P(-rLo, 0, ridge));
        if (hipHi) tri(roofPos, P(L, -W, eave), P(L, W, eave), P(rHi, 0, ridge));
      } else if (roof.type === "shed") {
        const yAt = (t) => eave + (t + W) * tan;
        quad(roofPos, P(-L, -W, eave), P(L, -W, eave), P(L, W, yAt(W)), P(-L, W, yAt(W)));
      }
    }
    // Giebel (beim Pultdach auch die hohe Wand) aus gable.js; am Hausdach mit Löchern für Fenster und Türen im Dachgeschoss
    for (const f of gableFaces({ roof, parts, top, eave, tan })) {
      const same = roomRoof ? null : this._gables?.find((g) => g.key === f.key && Math.hypot(g.origin[0] - f.origin[0], g.origin[1] - f.origin[1]) < 1e-6);
      gableTriangles(gablePos, f, gableCut(f, same?.holes ?? []), tri2d);
    }
    const mesh = (pos, mat) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      planarUVs(geo);
      const m = new THREE.Mesh(geo, mat);
      parent.add(m);
      meshes.push(m);
    };
    mesh(roofPos, roofMat);
    // Giebel: eigene Farbe/Textur (roof.gable_color/gable_texture), bei Raumdächern die Außenwand des Raums,
    // sonst die Außenwände des Hauses
    const hex = (v) => /^#[0-9a-f]{6}$/i.test(v ?? "") && this.style !== "cyber";
    const gCol = hex(roof.gable_color) ? roof.gable_color : roomRoof && hex(rooms[0]?.exterior_color) ? rooms[0].exterior_color : !roomRoof && hex(settings.wall_colors?.exterior) ? settings.wall_colors.exterior : null;
    let gableMat = gCol ? this.mats.gable.clone() : this.mats.gable;
    if (gCol) gableMat.color.set(gCol);
    const gTex = textureFor("wall", roof.gable_texture || (roomRoof ? rooms[0]?.exterior_texture : settings.wall_textures?.exterior) || "");
    gableMat = this._texMat(gableMat, gTex, "gable", !!gCol);
    mesh(gablePos, gableMat);
    // Cyberpunk: Neonkanten (als Kind des Dachs, damit sie dessen Lage übernehmen)
    if (this.mats.roofEdge) for (const m of meshes) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), this.mats.roofEdge));
    return { meshes, parts, eave, tan, type: roof.type, top };
  },
};
