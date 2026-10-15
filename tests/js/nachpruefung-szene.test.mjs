// Nachprüfung 0.23.0, zweiter Teil (Logik ohne Browser): Randstein-Linie (Art wechseln, Felder), Live-Vorschau im Editor-3D
// (Geräte im Schrank ziehen mit, Rohre angeschlossener Leitungen), Tafel des Schranks im Info-Hologramm und die Glastür
// des Schranks. Die Bedienung prüft tests/browser/shot-nachpruefung.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { FloorEditor } from "../../custom_components/haus3d/frontend/editor.js";
import { TECH_PACK } from "../../custom_components/haus3d/frontend/catalog-tech.js";
import { offsetPolyline } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { followMoves } from "../../custom_components/haus3d/frontend/follow.js";
import { buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { holoItems, holoRows, holoTitle } from "../../custom_components/haus3d/frontend/holo.js";
import { KERB_KINDS } from "../../custom_components/haus3d/frontend/kerb.js";
import { propsUi } from "../../custom_components/haus3d/frontend/props-ui.js";
import { liveRestore, liveTarget, moveLive } from "../../custom_components/haus3d/frontend/scene-arrows.js";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

let seq = 0;
const dims = (type) => {
  const [, w, d, h] = TECH_PACK.items[type] ?? ["", 0.22, 0.25, 0.25];
  return { w, d, h };
};
const cab = (o = {}) => ({ id: `c${++seq}`, type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2, ...o });
const dev = (type, o = {}) => ({ id: `d${++seq}`, type, x: 5, z: 5, rotation: 0, ...dims(type), ...o });
const get = (floor, id) => floor.furniture.find((m) => m.id === id);
const edit = (floor, fn) => {
  const after = structuredClone(floor);
  fn(after);
  return followMoves(floor, after);
};
/** Schrank mit zwei eingebauten Geräten (Server unten, USV darüber). */
function rackFloor() {
  const c = cab();
  const a = dev("tech_srv_1u");
  const b = dev("tech_ups_2u");
  return { c, a, b, floor: edit({ id: "eg", elevation: 0, height: 2.5, furniture: [c] }, (fl) => fl.furniture.push(a, b)) };
}

function makeEditor(floor, extra = {}) {
  const eg = { name: "EG", rooms: [{ id: "k", name: "Küche", points: rect(0, 0, 12, 10) }], furniture: [], outdoor: [], placements: [], nodes: [], pipes: [], openings: [], walls: [], elevation: 0, height: 2.5, ...floor, id: "eg" };
  const ed = Object.create(FloorEditor.prototype);
  Object.assign(ed, {
    b: { version: 1, floors: [eg], settings: {} },
    floorId: "eg",
    undoStack: [],
    redoStack: [],
    sel: null,
    multi: [],
    mods: { free: false, solo: false, multi: false },
    scale: 50,
    coarse: false,
    nudgeStep: 0.05,
    tool: "select",
    draft: null,
    toasts: [],
    props: { querySelector: () => null },
    render() {},
    renderBar() {},
    renderProps() {},
    _sync3d() {},
    _queueDraft() {},
    _updateTouch() {},
    _houseGuard() {},
    _toast(t) {
      this.toasts.push(t);
    },
    ...extra,
  });
  return ed;
}

// ---------------------------------------------------------------- 3 + 8 Randstein-Linie

const kerbLine = (o = {}) => {
  const pts = [[1, 5], [5, 5], [5, 8]];
  return { id: "k1", type: "kerb", points: offsetPolyline(pts, 0.08), line: { points: pts, width: 0.08 }, edge: "concrete", edge_h: 0.1, ...o };
};

/** Die Felder [data-la] der Linien-Eigenschaften als Attrappen: fields.edge.fire("granite") löst „change“ aus. */
function lineFields(ed, area) {
  const fields = {};
  const el = {
    querySelectorAll: (sel) =>
      sel === "[data-la]"
        ? ["edge", "width", "edge_h"].map((k) => {
            const inp = { dataset: { la: k }, tagName: k === "edge" ? "SELECT" : "INPUT", value: "", fn: null };
            inp.addEventListener = (_, fn) => (inp.fn = fn);
            inp.fire = (v) => {
              inp.value = String(v);
              inp.fn();
            };
            fields[k] = inp;
            return inp;
          })
        : [],
    querySelector: () => null,
  };
  ed._bindLineArea(el, area);
  return fields;
}

test("Randstein-Linie: Art wechseln übernimmt die Breite der Art, löscht die Höhe und berechnet die Fläche neu", () => {
  const area = kerbLine();
  const ed = makeEditor({ outdoor: [area] });
  ed.sel = { kind: "outdoor", id: "k1" };
  const f = lineFields(ed, area);
  f.edge.fire("palisade");
  let o = ed.floor.outdoor[0];
  assert.equal(o.edge, "palisade");
  assert.equal(o.line.width, KERB_KINDS.palisade.w);
  assert.equal(o.edge_h, undefined, "Höhe zurück auf den Standard der Art (als Linie)");
  assert.deepEqual(o.points, offsetPolyline(o.line.points, KERB_KINDS.palisade.w), "Fläche aus der Linie neu");
  assert.deepEqual(o.line.points, [[1, 5], [5, 5], [5, 8]]);
  assert.equal(ed.undoStack.length, 1);
  // Metall ist nur 5 mm breit
  f.edge.fire("metal");
  o = ed.floor.outdoor[0];
  assert.equal(o.line.width, 0.005);
  assert.deepEqual(o.points, offsetPolyline(o.line.points, 0.005));
  // eigene Breite und Höhe lassen sich danach setzen
  f.width.fire(0.2);
  f.edge_h.fire(0.07);
  o = ed.floor.outdoor[0];
  assert.ok(o.line.width === 0.2 && o.edge_h === 0.07 && o.edge === "metal");
  // andere Linien (Zaun) bleiben unberührt
  const fence = { id: "z1", type: "fence", points: offsetPolyline([[0, 0], [4, 0]], 0.05), line: { points: [[0, 0], [4, 0]], width: 0.05 }, fence_style: "wood" };
  const ed2 = makeEditor({ outdoor: [fence] });
  lineFields(ed2, fence).width.fire(0.1);
  assert.equal(ed2.floor.outdoor[0].line.width, 0.1);
  assert.equal(ed2.floor.outdoor[0].edge, undefined);
});

test("Eigenschaften einer Randstein-Linie: keine Textur, kein Geländer, kein Hang; Rasen und Zaun behalten sie", () => {
  const lawn = { id: "r1", type: "lawn", points: rect(10, 0, 14, 4) };
  const ed = makeEditor({ outdoor: [kerbLine(), lawn] }, { hass: { areas: {}, states: {} } });
  const stub = { addEventListener() {}, click() {} };
  const render = (id) => {
    const el = { innerHTML: "", querySelector: () => stub, querySelectorAll: () => [] };
    ed.sel = { kind: "outdoor", id };
    ed._outdoorProps(el, ed.sel, propsUi(ed, el));
    return el.innerHTML;
  };
  const k = render("k1");
  assert.ok(!/Textur|Geländer|Hang:|data-tex|railing/.test(k), k);
  assert.match(k, /Randstein-Art/);
  assert.match(k, /Höhe über dem Boden/);
  assert.match(k, /Bereich \(für Gartenlicht/);
  const l = render("r1");
  assert.match(l, /Textur/);
  assert.match(l, /Geländer \/ Zaun am Rand/);
  assert.match(l, /Geländerhöhe/);
  assert.match(l, /Hang: Höhe je Ecke/);
});

// ---------------------------------------------------------------- 4 Live-Vorschau: Geräte im Schrank, Rohre

const M = furnitureMaterials("standard");

/** Szene mit Schrank, zwei eingebauten Geräten, einem freien Sofa und drei Rohren (am Server, am Schrank, frei). */
function rackScene() {
  const { c, a, b, floor } = rackFloor();
  floor.furniture.push({ id: "sofa", type: "sofa", x: 1, z: 1, rotation: 0 });
  floor.pipes = [
    { id: "p_srv", type: "netzwerk", points: [[5, 5], [5, 8]], ends: { a: { furniture: a.id } } },
    { id: "p_cab", type: "strom", points: [[5, 5], [7, 5]], ends: { b: { furniture: c.id } } },
    { id: "p_frei", type: "strom", points: [[0, 0], [2, 0]] },
  ];
  const furn = new THREE.Group();
  for (const item of floor.furniture) furn.add(buildFurniture(item, M, 0, 2.5));
  const pipes = new THREE.Group();
  const tube = {};
  for (const p of floor.pipes) {
    for (let i = 0; i < 2; i++) {
      // Rohr und Stecker tragen beide userData.pipe (scene-pipes.js)
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
      m.userData.pipe = p.id;
      pipes.add(m);
      (tube[p.id] ??= []).push(m);
    }
  }
  const root = new THREE.Group();
  root.add(furn, pipes);
  const sc = { root, renders: 0, invalidate() { this.renders++; } };
  return { sc, floor, c, a, b, tube };
}
const F = (id) => ({ kind: "furniture", id });
const objOf = (sc, id) => {
  let o = null;
  sc.root.traverse((x) => {
    if (!o && x.userData.furniture === id && x.parent?.userData.furniture !== id) o = x;
  });
  return o;
};

test("Live-Vorschau eines Schranks: Geräte ziehen mit und drehen um die Mitte mit, Rohre angeschlossener Leitungen sind weg", () => {
  const { sc, floor, c, a, b, tube } = rackScene();
  const live = liveTarget(sc, F(c.id), floor);
  assert.equal(live.subs.length, 2);
  assert.deepEqual(live.hide.map((m) => m.userData.pipe).sort(), ["p_cab", "p_cab", "p_srv", "p_srv"]);
  // Schrank und Geräte bewegen sich gemeinsam: +1 m in x, +0,5 in z, +0,2 in der Höhe, gedreht auf 90°
  const g = structuredClone(floor);
  Object.assign(get(g, c.id), { x: 6, z: 5.5, rotation: 90 });
  const target = followMoves(floor, g);
  moveLive(sc, live, [1, 0.2, 0.5], 90);
  for (const id of [c.id, a.id, b.id]) {
    const o = objOf(sc, id);
    const want = get(target, id);
    assert.ok(near(o.position.x, want.x, 1e-9) && near(o.position.z, want.z, 1e-9), `${id}: ${o.position.x},${o.position.z} statt ${want.x},${want.z}`);
    assert.ok(near(o.rotation.y, -Math.PI / 2, 1e-9), id);
  }
  assert.ok(near(objOf(sc, a.id).position.y, live.subs[0].p0.y + 0.2), "die Höhe zieht mit");
  assert.ok(tube.p_srv.concat(tube.p_cab).every((m) => !m.visible), "angeschlossene Rohre ausgeblendet");
  assert.ok(tube.p_frei.every((m) => m.visible), "freie Leitung bleibt");
  assert.deepEqual(objOf(sc, "sofa").position.toArray(), [1, 0, 1], "andere Möbel bleiben");
  // zurück auf den Start (ohne Drehwert bleibt die Startdrehung)
  moveLive(sc, live, [0, 0, 0]);
  for (const s of live.subs) assert.ok(near(s.o.position.x, s.p0.x) && near(s.o.position.z, s.p0.z) && near(s.o.rotation.y, s.r0));
  // ohne Neuaufbau: Rohre wieder zeigen
  liveRestore(live);
  assert.ok(Object.values(tube).flat().every((m) => m.visible));
  liveRestore(null);
});

test("Live-Vorschau: ein eingebautes Gerät allein blendet nur seine Leitung aus; ohne Etage bleibt es beim Schrank selbst", () => {
  const { sc, floor, a, c } = rackScene();
  const live = liveTarget(sc, F(a.id), floor);
  assert.equal(live.subs.length, 0);
  assert.deepEqual([...new Set(live.hide.map((m) => m.userData.pipe))], ["p_srv"]);
  const bare = liveTarget(sc, F(c.id));
  assert.deepEqual([bare.subs, bare.hide], [[], []]);
  assert.equal(moveLive(sc, bare, [1, 0, 0]), true);
  assert.deepEqual(liveTarget(sc, F("nix"), floor), { obj: null, p0: null, r0: 0, blobs: [], subs: [], hide: [] });
});

test("Editor-3D: _liveStart übergibt die Etage; am Zugende zeigt _liveEnd ausgeblendete Rohre wieder, außer es folgt ein Neuaufbau", () => {
  const { sc, floor, c, tube } = rackScene();
  const syncs = [];
  const ed = makeEditor(floor, { scene3d: sc, _sync3d: () => syncs.push(1) });
  ed.sel = F(c.id);
  ed._liveStart(ed.sel);
  assert.equal(ed._live3d.subs.length, 2);
  moveLive(sc, ed._live3d, [0.5, 0, 0]);
  assert.ok(tube.p_srv.every((m) => !m.visible));
  // keine Änderung dazwischen (kein Neuaufbau vorgemerkt): zurück ins Bild
  ed._3dPending = false;
  ed._liveEnd();
  assert.equal(ed._live3d, null);
  assert.ok(tube.p_srv.every((m) => m.visible));
  assert.equal(syncs.length, 0);
  // mit vorgemerktem Neuaufbau übernimmt _sync3d (baut alles neu, die alten Rohre sind ohnehin weg)
  ed._liveStart(ed.sel);
  moveLive(sc, ed._live3d, [0.5, 0, 0]);
  ed._3dPending = true;
  ed._liveEnd();
  assert.equal(syncs.length, 1);
  assert.ok(tube.p_srv.every((m) => !m.visible));
});

// ---------------------------------------------------------------- 6 Info-Hologramm: eine Tafel für den Schrank

const hass = {
  states: {
    "sensor.srv_temp": { state: "41.2", attributes: { unit_of_measurement: "°C", friendly_name: "Server Temperatur" } },
    "sensor.usv_last": { state: "35", attributes: { unit_of_measurement: "%" } },
    "sensor.schrank_temp": { state: "28", attributes: { unit_of_measurement: "°C" } },
  },
};

test("Info-Hologramm: Geräte im Schrank teilen sich die Tafel des Schranks (Zwischenzeile je Gerät), keine Tafeln im Schrank", () => {
  const { c, a, b, floor } = rackFloor();
  const room = { id: "technik", name: "Technik", points: rect(0, 0, 10, 10) };
  const fl = { ...floor, rooms: [room], outdoor: [] };
  get(fl, a.id).info = [{ entity: "sensor.srv_temp", name: "Temperatur" }];
  get(fl, b.id).info = [{ entity: "sensor.usv_last" }];
  get(fl, b.id).name = "Meine USV";
  // vorher: zwei Tafeln übereinander; jetzt eine am Schrank
  assert.deepEqual(holoItems(fl, "technik").map((m) => m.id), [c.id]);
  const rows = holoRows(get(fl, c.id), hass, fl);
  // obere Geräte zuerst (USV auf HE 2 vor dem Server auf HE 1)
  assert.deepEqual(rows.map((r) => [r.group, r.name, r.value]), [
    ["Meine USV", "sensor.usv_last", "35 %"],
    [holoTitle(get(fl, a.id)), "Temperatur", "41,2 °C"],
  ]);
  assert.equal(holoTitle(get(fl, c.id)), "Netzwerkschrank");
  // mit eigenen Werten des Schranks: zuerst diese, ohne Zwischenzeile
  get(fl, c.id).info = [{ entity: "sensor.schrank_temp", name: "Innen" }];
  assert.deepEqual(holoItems(fl, "technik").map((m) => m.id), [c.id]);
  const all = holoRows(get(fl, c.id), hass, fl);
  assert.equal(all.length, 3);
  assert.equal(all[0].group, undefined);
  assert.equal(all[0].value, "28 °C");
  // ohne Etage (alter Aufruf) nur die eigenen Zeilen; ausgebaute Geräte behalten ihre eigene Tafel
  assert.equal(holoRows(get(fl, c.id), hass).length, 1);
  const out = structuredClone(fl);
  delete get(out, a.id).in_rack;
  assert.deepEqual(holoItems(out, "technik").map((m) => m.id).sort(), [c.id, a.id].sort());
  // Schrank in einem anderen Raum: die Geräte zählen nicht für diesen Raum
  const far = structuredClone(fl);
  Object.assign(get(far, c.id), { x: 50, z: 50 });
  assert.deepEqual(holoItems(far, "technik"), []);
  // Schrank ohne Info-Geräte und ohne eigene Werte: keine Tafel
  assert.deepEqual(holoItems({ ...rackFloor().floor, rooms: [room], outdoor: [] }, "technik"), []);
});

// ---------------------------------------------------------------- 7 Glastür des Schranks lässt den Zeiger durch

test("Schrank: die Scheibe der Glastür ist nicht anwählbar (noPick), alles andere schon", () => {
  const c = cab();
  const g = buildFurniture(c, M, 0, 2.5);
  const nopick = [];
  const pickable = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    (o.userData.noPick ? nopick : pickable).push(o);
  });
  assert.equal(nopick.length, 1);
  assert.ok(nopick[0].material.transparent && nopick[0].material.opacity < 0.5, "es ist das getönte Glas");
  assert.ok(pickable.length > 10);
  assert.equal(nopick[0].userData.furniture, c.id);
});
