// Achsen-Pfeile im Editor-3D (THREE): Pfeile X (rot), Höhe (grün) und Z (blau) in gleichbleibender
// Bildschirmgröße am gewählten Möbelstück oder Verteiler, unsichtbare Griffe zum Anfassen, Rahmen um Verteiler;
// dazu die Live-Vorschau beim Ziehen (Objekt und Kontaktschatten verschieben, ohne die Szene neu aufzubauen).

import * as THREE from "./vendor/three.module.min.js";
import { AXES, AXIS_DIR, axisFacing } from "./arrows3d.js";

const HOVER = 0xffd600;
const OUTLINE = 0x03a9f4;

export class AxisArrows {
  /** sc = HouseScene (scene, camera, renderer, invalidate); coarse = Touch (längere Pfeile, dickere Griffe). */
  constructor(sc, { coarse = false } = {}) {
    this.sc = sc;
    this.lenPx = coarse ? 110 : 80;
    this.axes = "";
    this.hovered = null;
    this._dim = false;
    this._box = null;
    this._dead = false;
    this._ray = new THREE.Raycaster();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    const hitR = (coarse ? 22 : 10) / this.lenPx;
    const flat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false });
    this._geos = [
      new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8),
      new THREE.ConeGeometry(0.065, 0.22, 16),
      new THREE.CylinderGeometry(hitR, hitR, 0.95, 6),
      new THREE.SphereGeometry(0.045, 12, 8),
    ];
    const [shaftGeo, coneGeo, gripGeo, dotGeo] = this._geos;
    const ghost = new THREE.MeshBasicMaterial({ visible: false });
    this._mats = [ghost];
    const g = (this.group = new THREE.Group());
    g.name = "axis-arrows";
    g.visible = false;
    g.userData.noShadow = true;
    this.arms = new Map();
    for (const [axis, , color] of AXES) {
      const mat = flat(color);
      this._mats.push(mat);
      const arm = new THREE.Group();
      arm.userData.axis = axis;
      const shaft = new THREE.Mesh(shaftGeo, mat);
      shaft.position.y = 0.45;
      const cone = new THREE.Mesh(coneGeo, mat);
      cone.position.y = 0.89;
      const grip = new THREE.Mesh(gripGeo, ghost); // unsichtbar, nur zum Anfassen
      grip.position.y = 0.525;
      grip.userData.axis = axis;
      shaft.renderOrder = cone.renderOrder = 1000;
      if (axis === "x") arm.rotation.z = -Math.PI / 2;
      if (axis === "z") arm.rotation.x = Math.PI / 2;
      arm.add(shaft, cone, grip);
      g.add(arm);
      this.arms.set(axis, { arm, mat, color, grip });
    }
    const dotMat = flat(0xffffff);
    this._mats.push(dotMat);
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.renderOrder = 1000;
    g.add(dot);
    sc.scene.add(g);
    // vor jedem Bild an die Kamera anpassen; einen vorhandenen Hook weiter aufrufen
    const scene = sc.scene;
    this._own = Object.prototype.hasOwnProperty.call(scene, "onBeforeRender");
    const prev = (this._prev = scene.onBeforeRender);
    const self = this;
    this._hook = function (...args) {
      prev?.apply(this, args);
      if (!self._dead) self._fit(args[2]);
    };
    scene.onBeforeRender = this._hook;
  }

  /** Größe (lenPx Pixel je Arm) und sichtbare Arme für die Kamera cam. */
  _fit(cam = this.sc.camera) {
    const g = this.group;
    if (!g.visible || !cam) return;
    const el = this.sc.renderer?.domElement;
    const h = el?.clientHeight || el?.getBoundingClientRect?.().height || 600;
    const fwd = cam.getWorldDirection(this._v2);
    const to = this._v1.copy(g.position).sub(cam.position);
    let unit;
    if (cam.isOrthographicCamera) unit = (cam.top - cam.bottom) / (cam.zoom || 1) / h;
    else unit = (2 * Math.max(0.05, to.dot(fwd)) * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 45) / 2)) / (cam.zoom || 1) / h;
    const s = this.lenPx * unit;
    if (Number.isFinite(s) && s > 0) g.scale.setScalar(s);
    const view = cam.isOrthographicCamera ? fwd : to;
    for (const [axis, a] of this.arms) a.arm.visible = this.axes.includes(axis) && axisFacing(AXIS_DIR[axis], view) < 0.97;
    g.updateMatrixWorld(true); // nach dem Abgleich der Szene geändert: für dieses Bild nachziehen
  }

  /** Pfeile an pos ([x, y, z] Welt) zeigen; axes = ziehbare Achsen, outline = Objekt mit Rahmen (Verteiler). */
  attach(pos, { axes = "xyz", outline = null } = {}) {
    this.axes = axes || "";
    this.group.visible = !!this.axes;
    this._outline(outline);
    this.setPosition(pos);
  }

  _outline(obj) {
    if (this._box && this._box.object === obj) return this._box.update();
    if (this._box) {
      this._box.removeFromParent();
      this._box.geometry.dispose();
      this._box.material.dispose();
      this._box = null;
    }
    if (!obj) return;
    const b = new THREE.BoxHelper(obj, OUTLINE);
    b.material.depthTest = false;
    b.renderOrder = 999;
    b.userData.noShadow = true;
    this.sc.scene.add(b);
    this._box = b;
  }

  setPosition(pos) {
    const [x, y, z] = (Array.isArray(pos) ? pos : [pos?.x, pos?.y, pos?.z]).map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    this.group.position.set(x, y, z);
    this._box?.update();
    this._fit(this.sc.camera);
    this.sc.invalidate?.();
  }

  detach() {
    this.group.visible = false;
    this.axes = "";
    this._outline(null);
    this.hover(null);
    this.sc.invalidate?.();
  }

  /** Zeigerstrahl (THREE.Ray, Welt) unter dem Bildschirmpunkt. */
  ray(cx, cy) {
    const r = this.sc.renderer.domElement.getBoundingClientRect();
    this._ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.sc.camera);
    return this._ray.ray;
  }

  /** Welcher Pfeil liegt unter dem Bildschirmpunkt? "x", "y", "z" oder null. */
  hit(cx, cy) {
    if (!this.group.visible) return null;
    this._fit(this.sc.camera);
    this.ray(cx, cy);
    const grips = [...this.arms.values()].filter((a) => a.arm.visible).map((a) => a.grip);
    return this._ray.intersectObjects(grips, false)[0]?.object.userData.axis ?? null;
  }

  /** Pfeil unter dem Zeiger gelb hervorheben (null = keiner). */
  hover(axis) {
    const k = axis && this.arms.has(axis) ? axis : null;
    if (k === this.hovered) return;
    this.hovered = k;
    for (const [a, arm] of this.arms) arm.mat.color.setHex(a === k ? HOVER : arm.color);
    this.sc.invalidate?.();
  }

  /** Abblenden (Nur Ansicht): Pfeile bleiben sichtbar, aber blass. */
  dim(on) {
    if (!!on === this._dim) return;
    this._dim = !!on;
    for (const m of this._mats) if (m.visible) m.opacity = on ? 0.35 : 0.95;
    this.sc.invalidate?.();
  }

  /** Bildschirmpunkt (client) bei t (0 … 1) entlang eines sichtbaren Pfeils, sonst null. */
  screenPoint(axis, t = 0.6) {
    const a = this.arms.get(axis);
    if (!this.group.visible || !a) return null;
    const cam = this.sc.camera;
    this._fit(cam);
    if (!a.arm.visible) return null;
    const p = this._v1.fromArray(AXIS_DIR[axis]).multiplyScalar(t * this.group.scale.x).add(this.group.position).project(cam);
    if (p.z > 1) return null;
    const r = this.sc.renderer.domElement.getBoundingClientRect();
    return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (-p.y * 0.5 + 0.5) * r.height];
  }

  dispose() {
    this._dead = true;
    const scene = this.sc.scene;
    if (scene.onBeforeRender === this._hook) {
      if (this._own) scene.onBeforeRender = this._prev;
      else delete scene.onBeforeRender; // wieder die Methode des Prototyps
    }
    this._outline(null);
    this.group.removeFromParent();
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
  }
}

/** 3D-Objekt der Auswahl: Möbelstück (oberste Gruppe) bzw. Verteiler; sonst null. */
export function targetObject(sc, sel) {
  if (!sc || !sel?.id) return null;
  if (sel.kind === "pnode") return sc._pipeNodes?.get(sel.id)?.obj ?? null;
  if (sel.kind !== "furniture") return null;
  let obj = null;
  sc.root?.traverse((o) => {
    if (!obj && o.userData.furniture === sel.id && o.parent?.userData.furniture !== sel.id) obj = o;
  });
  return obj;
}

/**
 * Startstand der Live-Vorschau: Objekt, Lage und Drehung, Kontaktschatten (scene-fx: userData.blobOf).
 * Mit floor (der Etage des Möbelstücks) ziehen auch die in den Schrank eingebauten Geräte (subs: in_rack === sel.id, samt
 * Schatten) mit, und die Rohre von Leitungen, die an dem Möbelstück oder seinen Geräten enden (pipe.ends), werden für die
 * Dauer des Zugs ausgeblendet (hide) – sie stünden sonst bis zum Neuaufbau am alten Platz.
 */
export function liveTarget(sc, sel, floor = null) {
  const obj = targetObject(sc, sel);
  if (!obj) return { obj: null, p0: null, r0: 0, blobs: [], subs: [], hide: [] };
  const blobs = [];
  const subs = [];
  const hide = [];
  if (sel.kind === "furniture") {
    const ids = new Set([sel.id]);
    for (const m of floor?.furniture ?? []) {
      if (m?.in_rack !== sel.id) continue;
      const o = targetObject(sc, { kind: "furniture", id: m.id });
      if (!o) continue;
      ids.add(m.id);
      subs.push({ o, p0: o.position.clone(), r0: o.rotation.y });
    }
    const pipes = new Set((floor?.pipes ?? []).filter((p) => ids.has(p?.ends?.a?.furniture) || ids.has(p?.ends?.b?.furniture)).map((p) => p.id));
    sc.root?.traverse((o) => {
      if (ids.has(o.userData.blobOf)) blobs.push({ o, p0: o.position.clone(), r0: o.rotation.y });
      if (o.isMesh && pipes.has(o.userData.pipe)) hide.push(o);
    });
  }
  return { obj, p0: obj.position.clone(), r0: obj.rotation.y, blobs, subs, hide };
}

/** Während des Zugs ausgeblendete Rohre wieder zeigen (nur nötig, wenn danach kein Neuaufbau der Szene folgt). */
export function liveRestore(live) {
  for (const o of live?.hide ?? []) o.visible = true;
}

/**
 * Live-Vorschau: Objekt um d ([dx, dy, dz] ab Start) verschieben, optional auf rotationDeg (Grad wie im Plan)
 * um die Mitte seiner Grundfläche drehen; Schatten bleiben am Boden (nur x/z) und drehen mit. Eingebaute Geräte (subs)
 * wandern und drehen um dieselbe Mitte mit, Rohre angeschlossener Leitungen (hide) verschwinden. Ohne Ziel nichts (false).
 */
export function moveLive(sc, live, d, rotationDeg = null) {
  const obj = live?.obj;
  if (!obj || !live.p0) return false;
  const [dx, dy, dz] = (Array.isArray(d) ? d : [d?.x, d?.y, d?.z]).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  const r0 = live.r0 ?? 0;
  const ry = rotationDeg != null && Number.isFinite(Number(rotationDeg)) ? -THREE.MathUtils.degToRad(Number(rotationDeg)) : r0;
  // geneigt/gekippt (furniture.js): der Ursprung liegt um poseOff (eigener Rahmen) neben der Mitte der
  // Grundfläche; gedreht wird um diese Mitte, Neigen/Kippen (rotation.x/z) bleiben
  const off = obj.userData.poseOff;
  const turn = (r) => (off ? [off[0] * Math.cos(r) + off[2] * Math.sin(r), -off[0] * Math.sin(r) + off[2] * Math.cos(r)] : [0, 0]);
  const [ox0, oz0] = turn(r0);
  const [ox, oz] = turn(ry);
  const cx = live.p0.x - ox0;
  const cz = live.p0.z - oz0;
  obj.position.set(cx + dx + ox, live.p0.y + dy, cz + dz + oz);
  obj.rotation.y = ry;
  const dr = ry - r0;
  const c = Math.cos(dr);
  const s = Math.sin(dr);
  // Schatten und eingebaute Geräte: um die Mitte drehen, mit verschieben (Schatten bleiben am Boden)
  const follow = (part, dyPart) => {
    const rx = part.p0.x - cx;
    const rz = part.p0.z - cz;
    part.o.position.set(cx + dx + rx * c + rz * s, part.p0.y + dyPart, cz + dz - rx * s + rz * c);
    part.o.rotation.y = part.r0 + dr;
  };
  for (const b of live.blobs ?? []) follow(b, 0);
  for (const g of live.subs ?? []) follow(g, dy);
  for (const o of live.hide ?? []) o.visible = false;
  obj.updateMatrixWorld(true);
  for (const g of live.subs ?? []) g.o.updateMatrixWorld(true);
  if (sc?._mark && sc._mark.object === obj) sc._mark.update(); // Rahmen der Möbel-Auswahl folgt
  sc?.invalidate?.();
  return true;
}
