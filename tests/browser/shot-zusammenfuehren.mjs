// Möbel zusammenführen (furniture-merge.js, nur Hauptansicht): dieselbe Szene einmal zusammengeführt und einmal mit
// ?zusammenfuehren=aus. Gleich sein müssen Kontaktschatten (Anzahl, Lage, Größe), Schattenbereich der Sonne, Antippen
// (Raster über die ganze Fläche und die Mitte jedes Geräts), Leuchten der Lampen und Heizkörper, Vorhang, Kamin,
// Whirlpool und Steckdosen-LED nach ihrem Zustand und der Editor (bleibt einzeln). Weniger Meshes und Zeichenaufrufe
// muss es nur zusammengeführt geben.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);

// östlich vom Haus (Garten) und ein Heizkörper ohne Entität im Bad (glüht mit dem Thermostat des Raums)
const EXTRA = [
  { id: "z_lampe", type: "lamp_ceiling", x: 20, z: 1, mount_y: 0, entity: "light.kueche" },
  { id: "z_lampe_frei", type: "lamp_floor", x: 21.6, z: 1 },
  { id: "z_heiz", type: "radiator", x: 23.2, z: 1, entity: "climate.bad" },
  { id: "z_heiz_raum", type: "radiator", x: 1.5, z: 7.85 },
  { id: "z_vorhang", type: "home_curtain_pair", x: 20, z: 4.2, mount_y: 0, entity: "cover.wohnzimmer_rollladen" },
  { id: "z_kamin", type: "home_fireplace_open", x: 22.6, z: 4.2, mount_y: 0, entity: "switch.kaffeemaschine" },
  { id: "z_ofen", type: "home_stove_wood", x: 25, z: 4.2, mount_y: 0, fire: true },
  { id: "z_pool", type: "hot_tub", x: 21, z: 7.8, entity: "switch.kaffeemaschine" },
  { id: "z_dose", type: "tech_socket", x: 24, z: 7.4, mount_y: 0.3, entity: "switch.kaffeemaschine" },
  { id: "z_schrank", type: "server_rack", x: 26.5, z: 1 },
  { id: "z_sofa_schief", type: "sofa", x: 26.5, z: 7.6, rotation: 30, tilt: 8 },
  { id: "z_baum", type: "tree", x: 29.5, z: 4, rotation: 25 },
  { id: "z_regal", type: "shelf", x: 20, z: 10.5, rotation: 45 },
  { id: "z_bank", type: "garden_table", x: 23, z: 10.5, rotation: 15 },
];
const ENTITY_ITEMS = EXTRA.filter((i) => i.entity).map((i) => i.id);

/** Szene einer Seite messen (Hauptansicht). */
const collect = (pg) =>
  pg.evaluate((entityItems) => {
    const sc = window.panel._scene;
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const rootOf = (id) => {
      let g = null;
      sc.root.traverse((o) => {
        if (!g && o.userData.furniture === id && o.parent?.userData.furniture !== id && !o.userData.blob) g = o;
      });
      return g;
    };
    let meshes = 0;
    let furn = 0;
    let lines = 0;
    for (const e of sc.floors.values()) {
      for (const h of [e.group, e.garden]) {
        h.traverse((o) => {
          if (o.isMesh) meshes++;
          else if (o.isLine) lines++;
          if (o.isMesh && o.userData.furniture && !o.userData.blob) furn++;
        });
      }
    }
    // Kontaktschatten je Möbelstück: Lage, Drehung um y und Größe aus der Matrix (Hauptansicht: Instanzen, blobIds)
    const blobs = [];
    sc.root.traverse((o) => {
      if (!o.userData.blob) return;
      const m = o.matrix.clone();
      const ids = o.isInstancedMesh ? o.userData.blobIds : [o.userData.blobOf];
      ids.forEach((id, i) => {
        if (o.isInstancedMesh) o.getMatrixAt(i, m);
        else m.compose(o.position, o.quaternion, o.scale);
        const e = m.elements;
        blobs.push(JSON.stringify([id, o.userData.layer, r6(e[12]), r6(e[13]), r6(e[14]), r6(Math.atan2(-e[2], e[0])), r6(Math.hypot(e[0], e[2])), r6(Math.hypot(e[8], e[10])), o.parent?.userData.layer ?? null]));
      });
    });
    blobs.sort();
    const cam = sc.sun.shadow.camera;
    const shadowCam = [cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far].map(r6);
    // ein Bild mit Schattenpass zählen
    const info = sc.renderer.info;
    info.autoReset = false;
    info.reset();
    sc.renderer.render(sc.scene, sc.camera);
    const calls = info.render.calls;
    info.autoReset = true;
    // Zustände der Stücke
    const st = {};
    const parts = {};
    for (const id of entityItems.concat(["z_ofen", "z_lampe_frei", "z_heiz_raum", "z_schrank", "z_sofa_schief"])) {
      const g = rootOf(id);
      if (!g) {
        st[id] = null;
        continue;
      }
      let n = 0;
      g.traverse((o) => o.isMesh && n++);
      parts[id] = n;
      st[id] = {
        flames: g.userData.flames ? g.userData.flames.visible : null,
        curtain: g.userData.curtain ? r6(g.userData.curtain.open) : null,
        tub: g.userData.tub ? g.userData.tub.view : null,
        bulbsOn: (g.userData.bulbs ?? []).map((b) => b.material !== sc.furnMats.bulb && b.material.emissiveIntensity > 0),
        bulbsInside: (g.userData.bulbs ?? []).every((b) => {
          for (let p = b; p; p = p.parent) if (p === g) return true;
          return false;
        }),
      };
    }
    st.heat = sc.heatParts.map((h) => [h.meshes.length, h.meshes.every((m) => m.material === sc.furnMats.heatOn), h.meshes.every((m) => m.parent)]);
    return { meshes, furn, lines, blobs, shadowCam, calls, states: st, parts };
  }, ENTITY_ITEMS);

/** Antippen: Raster über die Fläche und die Bildschirmmitte jedes Stücks mit Entität (Draufsicht). */
const picks = (pg) =>
  pg.evaluate(async (entityItems) => {
    const sc = window.panel._scene;
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const rect = sc.renderer.domElement.getBoundingClientRect();
    const grid = [];
    for (let iy = 0; iy < 20; iy++) {
      for (let ix = 0; ix < 32; ix++) {
        const x = rect.left + ((ix + 0.5) / 32) * rect.width;
        const y = rect.top + ((iy + 0.5) / 20) * rect.height;
        grid.push(JSON.stringify(sc.pick(x, y)));
      }
    }
    const items = {};
    for (const id of entityItems) {
      const box = new THREE.Box3();
      sc.root.traverse((o) => o.userData.furniture === id && o.isMesh && !o.userData.blob && box.expandByObject(o));
      if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE.Vector3()).project(sc.camera);
      const x = rect.left + ((c.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - c.y) / 2) * rect.height;
      items[id] = sc.pick(x, y);
    }
    return { grid, items };
  }, ENTITY_ITEMS);

/** Kamera fest auf eine Voreinstellung und warten, bis sie 1 s stillsteht (unter Last laufen Kamerafahrten länger). */
async function placeCamera(pg, preset) {
  let last = "";
  let since = Date.now();
  const t0 = Date.now();
  await pg.evaluate((k) => window.panel._scene.viewPreset(k, 0, { duration: 0 }), preset);
  while (Date.now() - t0 < 30000) {
    const sig = await pg.evaluate(() => {
      const sc = window.panel._scene;
      sc.camera.updateMatrixWorld();
      return [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(6)).join(",");
    });
    if (sig !== last) {
      last = sig;
      since = Date.now();
    } else if (Date.now() - since > 1000) break;
    await pg.waitForTimeout(200);
  }
  // nach einer verspäteten Fahrt noch einmal genau setzen
  await pg.evaluate((k) => window.panel._scene.viewPreset(k, 0, { duration: 0 }), preset);
  await pg.waitForTimeout(400);
  return pg.evaluate(() => {
    const sc = window.panel._scene;
    sc.camera.updateMatrixWorld();
    const c = sc.renderer.domElement;
    return [c.clientWidth, c.clientHeight, ...[...sc.camera.matrixWorld.elements].map((x) => x.toFixed(5))].join(",");
  });
}

async function probe(name, query) {
  const pg = await t.page(name, `?climate&quality=ausgewogen&schatten=an${query}`, { width: 1280, height: 800 });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0, null, { timeout: 60000 });
  const build = await pg.evaluate((extra) => {
    const p = window.panel;
    const b = structuredClone(p._building);
    b.floors.find((f) => f.id === "eg").furniture.push(...extra.map((x) => ({ rotation: 0, ...x })));
    p._setBuilding(b, p._revision, { keepCamera: true });
    p._scene.setPerf({ frozen: true });
    const sc = p._scene;
    const t0 = performance.now();
    sc.setBuilding(sc.building, { keepCamera: true }); // Bauzeit (einmal mehr, gleicher Stand)
    const ms = performance.now() - t0;
    p._lastStatesKey = null;
    p._updateStates();
    return { ms: Math.round(ms), merge: sc.flags.merge, live: sc.live };
  }, EXTRA);
  await pg.waitForTimeout(900);
  await placeCamera(pg, "iso");
  const vorher = await collect(pg);
  // Draufsicht für das Antippen
  const kamera = await placeCamera(pg, "oben");
  const tap = { kamera, ...(await picks(pg)) };
  // Zustände wechseln: Licht an, Heizung aus, Schalter aus, Rollladen ganz offen
  await pg.evaluate(() => {
    const p = window.panel;
    const h = p.hass;
    const s = h.states;
    p.hass = {
      ...h,
      states: {
        ...s,
        "light.kueche": { ...s["light.kueche"], state: "on" },
        "climate.bad": { ...s["climate.bad"], state: "off", attributes: { ...s["climate.bad"].attributes, hvac_action: "off" } },
        "switch.kaffeemaschine": { ...s["switch.kaffeemaschine"], state: "off" },
        "cover.wohnzimmer_rollladen": { ...s["cover.wohnzimmer_rollladen"], state: "open", attributes: { ...s["cover.wohnzimmer_rollladen"].attributes, current_position: 100 } },
      },
    };
  });
  await pg.waitForTimeout(800);
  const nachher = (await collect(pg)).states;
  // Editor: bleibt live und einzeln
  await unlock(pg, "edit");
  await pg.evaluate(() => window.panel._openEditor());
  await pg.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0, null, { timeout: 90000 });
  await pg.waitForTimeout(600);
  const editor = await pg.evaluate(() => {
    const sc = window.panel._editor.scene3d;
    let meshes = 0;
    sc.root.traverse((o) => o.isMesh && !o.userData.blob && o.userData.furniture && meshes++);
    return { live: sc.live, merge: sc.flags.merge, meshes };
  });
  return { build, vorher, tap, nachher, editor };
}

const an = await probe("zusammen-an", "");
const aus = await probe("zusammen-aus", "&zusammenfuehren=aus");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diff = (a, b) => a.filter((x, i) => x !== b[i]).length;

t.results.an = { build: an.build, meshes: an.vorher.meshes, moebel: an.vorher.furn, lines: an.vorher.lines, calls: an.vorher.calls, kontaktschatten: an.vorher.blobs.length, editor: an.editor };
t.results.aus = { build: aus.build, meshes: aus.vorher.meshes, moebel: aus.vorher.furn, lines: aus.vorher.lines, calls: aus.vorher.calls, kontaktschatten: aus.vorher.blobs.length, editor: aus.editor };
t.results.zustaende = { vorher: an.vorher.states, nachher: an.nachher };

t.check(an.build.merge === true && aus.build.merge === false && an.build.live === false, `Schalter: ${JSON.stringify([an.build, aus.build])}`);
t.check(an.vorher.furn < aus.vorher.furn * 0.8 && an.vorher.meshes < aus.vorher.meshes, `zusammengeführt kaum weniger Möbel-Meshes: ${an.vorher.furn} statt ${aus.vorher.furn}`);
t.check(an.vorher.calls < aus.vorher.calls, `Zeichenaufrufe nicht weniger: ${an.vorher.calls} statt ${aus.vorher.calls}`);
// Kontaktschatten: Anzahl, Lage, Größe
t.check(an.vorher.blobs.length > 20 && eq(an.vorher.blobs, aus.vorher.blobs), `Kontaktschatten weichen ab (${an.vorher.blobs.length} / ${aus.vorher.blobs.length}): ${an.vorher.blobs.filter((b) => !aus.vorher.blobs.includes(b)).slice(0, 4).join(" ")}`);
t.check(eq(an.vorher.shadowCam, aus.vorher.shadowCam), `Schattenbereich der Sonne: ${an.vorher.shadowCam} / ${aus.vorher.shadowCam}`);
// Antippen
t.check(an.tap.kamera === aus.tap.kamera, `Kamera zum Antippen nicht gleich: ${an.tap.kamera} / ${aus.tap.kamera}`);
t.check(eq(an.tap.grid, aus.tap.grid), `Antippen im Raster: ${diff(an.tap.grid, aus.tap.grid)} von ${an.tap.grid.length} Stellen anders, z. B. ${an.tap.grid.map((x, i) => [i, x, aus.tap.grid[i]]).filter(([, x, y]) => x !== y).slice(0, 4).map((r) => r.join(" ")).join("; ")}`);
t.check(eq(an.tap.items, aus.tap.items), `Antippen der Geräte: ${JSON.stringify(an.tap.items)} / ${JSON.stringify(aus.tap.items)}`);
const want = { z_lampe: "light.kueche", z_heiz: "climate.bad", z_kamin: "switch.kaffeemaschine", z_pool: "switch.kaffeemaschine", z_dose: "switch.kaffeemaschine", z_vorhang: "cover.wohnzimmer_rollladen" };
for (const [id, ent] of Object.entries(want)) t.check(an.tap.items[id]?.entity_id === ent, `Antippen ${id}: ${JSON.stringify(an.tap.items[id])}`);
// Zustände gleich wie einzeln und wie erwartet
t.check(eq(an.vorher.states, aus.vorher.states) && eq(an.nachher, aus.nachher), `Zustände weichen ab: ${JSON.stringify([an.vorher.states, aus.vorher.states])}`);
const v = an.vorher.states;
const n = an.nachher;
t.check(v.heat.length >= 3 && v.heat.every(([, on, inside]) => on && inside), `Heizkörper glühen nicht beim Heizen: ${JSON.stringify(v.heat)}`);
t.check(n.heat.every(([, on]) => !on), `Heizkörper glühen nach dem Ausschalten: ${JSON.stringify(n.heat)}`);
t.check(v.z_lampe.bulbsOn.every((x) => !x) && n.z_lampe.bulbsOn.length && n.z_lampe.bulbsOn.every((x) => x), `Lampe: ${JSON.stringify([v.z_lampe, n.z_lampe])}`);
t.check(v.z_lampe_frei.bulbsInside && v.z_lampe_frei.bulbsOn.every((x) => !x), `Lampe ohne Entität: ${JSON.stringify(v.z_lampe_frei)}`);
t.check(v.z_kamin.flames === true && n.z_kamin.flames === false && v.z_ofen.flames === true && n.z_ofen.flames === true, `Kamin/Ofen: ${JSON.stringify([v.z_kamin, n.z_kamin, v.z_ofen])}`);
t.check(v.z_vorhang.curtain < 0.9 && n.z_vorhang.curtain > 0.95, `Vorhang: ${v.z_vorhang.curtain} → ${n.z_vorhang.curtain}`);
t.check(v.z_pool.tub?.running === true && n.z_pool.tub?.running === false, `Whirlpool: ${JSON.stringify([v.z_pool.tub, n.z_pool.tub])}`);
t.check(eq(v.z_dose, aus.vorher.states.z_dose) && eq(n.z_dose, aus.nachher.z_dose), "Steckdose");
// ganze Stücke ausgelassen bzw. zusammengeführt
const pa = an.vorher.parts;
const pb = aus.vorher.parts;
t.results.teile = { an: pa, aus: pb };
for (const id of [...ENTITY_ITEMS, "z_ofen", "z_sofa_schief"]) t.check(pa[id] === pb[id], `${id} zusammengeführt (${pa[id]} statt ${pb[id]})`);
t.check(pa.z_schrank < pb.z_schrank / 4, `Serverschrank nicht zusammengeführt: ${pa.z_schrank} / ${pb.z_schrank}`);
// Editor unverändert
t.check(an.editor.live === true && an.editor.merge === true && eq(an.editor.meshes, aus.editor.meshes), `Editor: ${JSON.stringify([an.editor, aus.editor])}`);
await t.done();
