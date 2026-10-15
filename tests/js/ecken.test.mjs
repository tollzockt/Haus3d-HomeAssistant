// Ecken und Wände eines Raums ziehen (edit-ops.js): immer ab dem Stand bei Zugbeginn, Kopplung umschaltbar,
// Andocken an parallele Nachbarwände, Fang des Werkzeugs „Wand“ an Raumkanten
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { dragVertexStep, moveEdge, parallelEdgeOffsets, snapOnEdge, wallEdges } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { LINK_KEY, WallMethods } from "../../custom_components/haus3d/frontend/editor-walls.js";
import { PlanMethods } from "../../custom_components/haus3d/frontend/editor-plan.js";
import { TouchMethods } from "../../custom_components/haus3d/frontend/editor-touch.js";
import { MeasureMethods } from "../../custom_components/haus3d/frontend/editor-measure.js";
import { RoofUnitMethods } from "../../custom_components/haus3d/frontend/editor-roofunits.js";

const DATA = new URL("../../custom_components/haus3d/haus-daten.json", import.meta.url);
const building = JSON.parse(readFileSync(DATA, "utf8"));
const eg = () => structuredClone(building.floors.find((f) => f.id === "eg"));
const rect = (id, x0, z0, x1, z1) => ({ id, name: id, points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
const pts = (floor, id) => floor.rooms.find((r) => r.id === id).points;

test("Ecke ziehen: Standard entkoppelt – nur dieser Raum, Nachbarecke bleibt", () => {
  const base = eg();
  const before = JSON.stringify(base);
  const step = dragVertexStep(base, "wohnzimmer", 2, [7.52, 5.49]);
  assert.deepEqual(step.q, [7.5, 5.5]);
  assert.equal(step.shared, true); // das Schlafzimmer hat dort auch eine Ecke
  assert.deepEqual(pts(step.floor, "wohnzimmer")[2], [7.5, 5.5]);
  assert.deepEqual(pts(step.floor, "schlafzimmer")[1], [7, 5]);
  assert.equal(JSON.stringify(base), before, "Startstand bleibt unverändert");
  // eine Ecke ohne Nachbarn
  assert.equal(dragVertexStep(base, "wohnzimmer", 0, [0.1, 0.2]).shared, false);
});

test("Ecke ziehen gekoppelt: gleich liegende Ecken anderer Räume gehen mit", () => {
  const step = dragVertexStep(eg(), "wohnzimmer", 2, [7.52, 5.49], { linked: true });
  assert.deepEqual(pts(step.floor, "wohnzimmer")[2], [7.5, 5.5]);
  assert.deepEqual(pts(step.floor, "schlafzimmer")[1], [7.5, 5.5]);
});

test("Einrasten: fremde Ecken, die mitwandernden nur ohne Kopplung", () => {
  const base = eg();
  // entkoppelt: die Schlafzimmer-Ecke (7,5) bleibt stehen und fängt
  assert.deepEqual(dragVertexStep(base, "wohnzimmer", 2, [7.06, 5.04]).q, [7, 5]);
  // gekoppelt: sie wandert mit, also Raster statt Fang
  assert.deepEqual(dragVertexStep(base, "wohnzimmer", 2, [7.06, 5.04], { linked: true }).q, [7.05, 5.05]);
  // eigene Ecken fangen nie, Raster einstellbar
  assert.deepEqual(dragVertexStep(base, "wohnzimmer", 2, [6.97, 0.12], { grid: 0.5 }).q, [7, 0]); // Ecke (7,0) der Küche
  assert.deepEqual(dragVertexStep(base, "wohnzimmer", 2, [6.2, 3.2], { grid: 0.5 }).q, [6, 3]);
  assert.equal(dragVertexStep(base, "wohnzimmer", 9, [1, 1]), null);
  assert.equal(dragVertexStep(base, "fehlt", 0, [1, 1]), null);
});

test("Ecke klebt nicht: über eine fremde Ecke gezogen, nimmt sie diese nicht mit", () => {
  for (const linked of [false, true]) {
    const base = eg();
    // erst auf die Ecke (7,4) von Küche und Flur, dann weiter – jeder Schritt rechnet vom Startstand
    const s1 = dragVertexStep(base, "wohnzimmer", 2, [7.03, 4.02], { linked });
    assert.deepEqual(s1.q, [7, 4]);
    const s2 = dragVertexStep(base, "wohnzimmer", 2, [7.5, 3], { linked });
    assert.deepEqual(pts(s2.floor, "wohnzimmer")[2], [7.5, 3]);
    assert.deepEqual(pts(s2.floor, "kueche")[3], [7, 4], `gekoppelt: ${linked}`);
    assert.deepEqual(pts(s2.floor, "flur")[0], [7, 4], `gekoppelt: ${linked}`);
    // gekoppelt geht die Schlafzimmer-Ecke vom Startstand aus mit, entkoppelt nicht
    assert.deepEqual(pts(s2.floor, "schlafzimmer")[1], linked ? [7.5, 3] : [7, 5]);
  }
});

test("Andocken: Lage paralleler Kanten anderer Räume (wie moveEdge), ab 10 cm Überdeckung", () => {
  // Nachbar 13 cm daneben: Wand x = 4 von a dockt bei −0,13 (Normale von moveEdge zeigt nach −x)
  const f = { id: "f", rooms: [rect("a", 0, 0, 4, 3), rect("b", 4.13, 0, 8, 3)], openings: [], walls: [] };
  assert.deepEqual(parallelEdgeOffsets(f, "a", 1), [-4, -0.13]);
  const moved = moveEdge(f, "a", 1, -0.13, { linked: false });
  assert.deepEqual(pts(moved, "a")[1], [4.13, 0]);
  assert.deepEqual(pts(moved, "a")[2], [4.13, 3]);
  // Wohnzimmer, Wand x = 7: die Küche liegt darauf (0, zählt nicht), ihre Außenwand x = 11 bei −4
  assert.deepEqual(parallelEdgeOffsets(eg(), "wohnzimmer", 1), [-4]);
  // zu wenig Überdeckung: Nachbar nur 5 cm neben dem Ende
  const g = { id: "g", rooms: [rect("a", 0, 0, 4, 3), rect("b", 4.5, 2.95, 6, 5)], openings: [], walls: [] };
  assert.deepEqual(parallelEdgeOffsets(g, "a", 1), []);
  assert.deepEqual(parallelEdgeOffsets(g, "a", 1, 0.05), [-2, -0.5]);
  assert.deepEqual(parallelEdgeOffsets(g, "fehlt", 0), []);
});

test("Werkzeug Wand: alle Raumkanten und freien Wände als Fangkanten", () => {
  const f = eg();
  assert.equal(wallEdges(f).length, 24);
  f.walls = [{ id: "w1", a: [12, 0], b: [12, 3] }, { id: "w2", a: [13, 0], b: [14, 0] }];
  assert.equal(wallEdges(f).length, 26);
  assert.equal(wallEdges(f, "w1").length, 25);
  assert.deepEqual(wallEdges(f, "w1").at(-1), [[13, 0], [14, 0]]);
  assert.deepEqual(wallEdges({}), []);
});

test("Fang auf einer Kante ohne Richtung: Lotfußpunkt, an achsparallelen Kanten aufs Raster", () => {
  const edges = wallEdges(eg());
  assert.deepEqual(snapOnEdge([5.02, 0.07], edges, { grid: 0.05 }), [5, 0]);
  assert.deepEqual(snapOnEdge([5.02, -0.1], edges, { grid: 0.05 }), [5, 0]); // auch von außen
  assert.deepEqual(snapOnEdge([5.02, 0.07], edges), [5.02, 0]); // ohne Raster
  assert.deepEqual(snapOnEdge([0.03, 3.21], edges, { grid: 0.5 }), [0, 3]);
  assert.deepEqual(snapOnEdge([11.1, -0.1], edges, { grid: 0.5 }), [11, 0]); // an der Kante begrenzt
  assert.equal(snapOnEdge([5, 1], edges), null); // zu weit weg
  assert.deepEqual(snapOnEdge([5, 0.3], edges, { tol: 0.35 }), [5, 0]);
  // schräge Kante: Lotfußpunkt ohne Raster
  const diag = [[[0, 0], [4, 4]]];
  assert.deepEqual(snapOnEdge([2.1, 1.9], diag, { grid: 0.5 }), [2, 2]);
  // Kanten unter 5 cm zählen nicht
  assert.equal(snapOnEdge([1, 0.01], [[[1, 0], [1.04, 0]]]), null);
});

test("Fang auf einer Kante mit Richtung: Strahl vom Wandanfang, die Richtung bleibt", () => {
  const edges = wallEdges(eg());
  // von außen senkrecht auf die Außenwand z = 0
  assert.deepEqual(snapOnEdge([5, -0.1], edges, { a: [5, -2], q: [5, -0.1] }), [5, 0]);
  // unter 45° auf die Ecke (7,4)
  assert.deepEqual(snapOnEdge([6.95, 3.93], edges, { a: [5, 2], q: [6.95, 3.95] }), [7, 4]);
  // schräg auf die Wand x = 7: Schnittpunkt statt Lotfußpunkt
  const x = snapOnEdge([6.9, 2.95], edges, { a: [5, 2], q: [6.9, 2.95] });
  assert.equal(x[0], 7);
  assert.ok(Math.abs(x[1] - 3) < 1e-3, `${x}`);
  // Kante hinter dem Anfang zählt nicht, parallele Kanten auch nicht
  assert.equal(snapOnEdge([5, -0.1], edges, { a: [5, -0.5], q: [5, -1] }), null);
  assert.equal(snapOnEdge([0.05, 2], [[[0, 0], [0, 5]]], { a: [0.05, 0], q: [0.05, 2] }), null);
  // Wandanfang auf einer Kante: kein Fang auf dieselbe Stelle (Wand hätte die Länge 0)
  assert.equal(snapOnEdge([5, 0.02], [[[0, 0], [7, 0]]], { a: [5, 0], q: [5, 0.02] }), null);
  // flacher Winkel: Schnittpunkt weiter als 1,5 · tol vom Zeiger entfernt
  assert.equal(snapOnEdge([5, 0.14], [[[0, 0], [7, 0]]], { a: [0, 0.5], q: [5, 0.14] }), null);
  assert.deepEqual(snapOnEdge([5.14, 0.1], [[[0, 0], [7, 0]]], { a: [4, 2], q: [5.14, 0.1] }), [5.2, 0]);
});

// --- Editor-Mixin (editor-walls.js) ohne DOM ------------------------------------------------------

// Speicher wie im Browser (node hat keinen localStorage)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

/** Editor-Attrappe: Etage im Gebäude, change()-Vertrag wie in editor.js, Fangradius 10 px bei Maßstab 100 (0,1 m). */
function fakeEditor({ floor = eg(), link = false, coarse = false, sel = { kind: "room", id: "wohnzimmer" } } = {}) {
  return {
    ...WallMethods,
    _align: PlanMethods._align,
    _alignWall: PlanMethods._alignWall,
    _soloLabel: TouchMethods._soloLabel,
    _bindMeasureFields: MeasureMethods._bindMeasureFields,
    _house0: RoofUnitMethods._house0,
    _houseGuard: RoofUnitMethods._houseGuard,
    b: { settings: { grid: 0.05 }, floors: [floor] },
    floorId: floor.id,
    link,
    coarse,
    sel,
    scale: 100,
    mods: { free: false, solo: false, multi: false },
    undo: 0,
    toasts: [],
    calls: [],
    get floor() {
      return this.b.floors.find((f) => f.id === this.floorId);
    },
    set floor(next) {
      this.b.floors = this.b.floors.map((f) => (f.id === this.floorId ? next : f));
    },
    _snapTol() {
      return (this.coarse ? 16 : 10) / this.scale;
    },
    change(fn, { merge = false } = {}) {
      if (!merge) this.undo++;
      const f = structuredClone(this.floor);
      const out = fn(f);
      this.floor = out ?? f;
    },
    _dragChange(drag, fn) {
      this.change(fn, { merge: !drag.first });
      drag.first = false;
    },
    _toast(text) {
      this.toasts.push(text);
      this.calls.push("toast");
    },
    renderBar() {
      this.calls.push("renderBar");
    },
    renderProps() {},
    _updateTouch() {
      this.calls.push("touch");
    },
  };
}
const vertexDrag = (i = 2) => ({ mode: "vertex", i, first: true });
// Wohnzimmer, Wand x = 7 (Kante 1); Normale wie in _startDrag (zeigt nach −x)
const edgeDrag = (id = "wohnzimmer", i = 1, start = [7, 2], n = [-1, 0]) => ({ mode: "edge", id, i, start, n, applied: 0, first: true });

test("Editor: Wahrheitstabelle „Ecken koppeln“ × Alt × Schalter", () => {
  const ed = fakeEditor();
  for (const link of [false, true]) {
    for (const alt of [false, true]) {
      for (const solo of [false, true]) {
        ed.link = link;
        ed.mods.solo = solo;
        assert.equal(ed._linked({ altKey: alt }), link !== (alt || solo), JSON.stringify({ link, alt, solo }));
      }
    }
  }
  ed.mods = undefined; // vor _initTouch
  ed.link = true;
  assert.equal(ed._linked(), true);
  // Beschriftung des Alt-Schalters am Tablet
  assert.equal(fakeEditor()._soloLabel(), "Mitziehen");
  assert.equal(fakeEditor({ link: true })._soloLabel(), "Einzeln");
  assert.equal(fakeEditor({ link: true, sel: { kind: "furniture", id: "x" } })._soloLabel(), "Ohne Magnet");
});

test("Editor: Standard entkoppelt – nur der gewählte Raum, Hinweis nennt Alt bzw. „Mitziehen“", () => {
  const ed = fakeEditor();
  ed._dragRoomVertex(vertexDrag(), {}, [7.52, 5.49]);
  assert.deepEqual(pts(ed.floor, "wohnzimmer")[2], [7.5, 5.5]);
  assert.deepEqual(pts(ed.floor, "schlafzimmer")[1], [7, 5]);
  assert.equal(ed.toasts.at(-1), "Ecke verschoben – nur dieser Raum (Alt kehrt das um)");
  const wall = fakeEditor();
  wall._dragRoomEdge(edgeDrag(), {}, [7.5, 2]);
  assert.equal(pts(wall.floor, "wohnzimmer")[1][0], 7.5);
  assert.deepEqual(pts(wall.floor, "kueche")[0], [7, 0]);
  assert.equal(wall.toasts.at(-1), "Wand verschoben: -0,50 m – nur dieser Raum (Alt kehrt das um)");
  // am Tablet heißt der Schalter „Mitziehen“ (bzw. gekoppelt „Einzeln“)
  const tab = fakeEditor({ coarse: true });
  tab._dragRoomVertex(vertexDrag(), {}, [7.52, 5.49]);
  assert.equal(tab.toasts.at(-1), "Ecke verschoben – nur dieser Raum („Mitziehen“ kehrt das um)");
  const tabLinked = fakeEditor({ coarse: true, link: true });
  tabLinked._dragRoomVertex(vertexDrag(), {}, [7.52, 5.49]);
  assert.equal(tabLinked.toasts.at(-1), "Ecke verschoben – Nachbarräume gehen mit („Einzeln“ kehrt das um)");
  // Ecke ohne Nachbarn: kein Hinweis
  const lone = fakeEditor();
  lone._dragRoomVertex(vertexDrag(0), {}, [0.2, 0.3]);
  assert.deepEqual(lone.toasts, []);
});

test("Editor: gekoppelt bzw. mit Alt gehen angrenzende Räume mit", () => {
  for (const [link, ev] of [[true, {}], [false, { altKey: true }]]) {
    const ed = fakeEditor({ link });
    ed._dragRoomVertex(vertexDrag(), ev, [7.52, 5.49]);
    assert.deepEqual(pts(ed.floor, "schlafzimmer")[1], [7.5, 5.5]);
    assert.match(ed.toasts.at(-1), /Nachbarräume gehen mit/);
    const wall = fakeEditor({ link });
    wall._dragRoomEdge(edgeDrag(), ev, [7.5, 2]);
    assert.deepEqual(pts(wall.floor, "kueche")[0], [7.5, 0]);
    assert.deepEqual(pts(wall.floor, "kueche")[3], [7.5, 4]);
    assert.match(wall.toasts.at(-1), /Nachbarräume gehen mit/);
  }
  // Schalter „Einzeln“ bei gekoppelten Ecken
  const ed = fakeEditor({ link: true });
  ed.mods.solo = true;
  ed._dragRoomEdge(edgeDrag(), {}, [7.5, 2]);
  assert.deepEqual(pts(ed.floor, "kueche")[0], [7, 0]);
});

test("Editor: Alt mitten im Zug losgelassen – Nachbarn kehren zurück, ein Rückgängig-Schritt", () => {
  const ed = fakeEditor();
  const drag = edgeDrag();
  ed._dragRoomEdge(drag, { altKey: true }, [7.5, 2]);
  assert.deepEqual(pts(ed.floor, "kueche")[0], [7.5, 0]);
  ed._dragRoomEdge(drag, {}, [7.5, 2]); // gleiche Stelle, nur Alt los
  assert.deepEqual(pts(ed.floor, "kueche")[0], [7, 0]);
  assert.equal(pts(ed.floor, "wohnzimmer")[1][0], 7.5);
  assert.equal(ed.undo, 1);
  const v = fakeEditor();
  const vd = vertexDrag();
  v._dragRoomVertex(vd, { altKey: true }, [7.52, 5.49]);
  assert.deepEqual(pts(v.floor, "schlafzimmer")[1], [7.5, 5.5]);
  v._dragRoomVertex(vd, {}, [7.52, 5.49]);
  assert.deepEqual(pts(v.floor, "schlafzimmer")[1], [7, 5]);
  assert.equal(v.undo, 1);
});

test("Editor: Ecke und Wand kleben nicht an fremden Ecken und Wänden", () => {
  for (const link of [false, true]) {
    const ed = fakeEditor({ link });
    const drag = vertexDrag();
    ed._dragRoomVertex(drag, {}, [7.03, 4.02]); // fängt die Ecke (7,4) von Küche und Flur
    assert.deepEqual(pts(ed.floor, "wohnzimmer")[2], [7, 4]);
    ed._dragRoomVertex(drag, {}, [7.5, 3]);
    assert.deepEqual(pts(ed.floor, "wohnzimmer")[2], [7.5, 3]);
    assert.deepEqual(pts(ed.floor, "kueche")[3], [7, 4], `gekoppelt: ${link}`);
    assert.deepEqual(pts(ed.floor, "flur")[0], [7, 4], `gekoppelt: ${link}`);
    assert.equal(ed.undo, 1);
    // Wand x = 7 bis auf die Außenwand x = 11 (Andocken) und zurück auf x = 10: x = 11 bleibt stehen
    const w = fakeEditor({ link });
    const wd = edgeDrag();
    w._dragRoomEdge(wd, {}, [10.97, 2]);
    assert.equal(pts(w.floor, "wohnzimmer")[1][0], 11);
    w._dragRoomEdge(wd, {}, [10, 2]);
    assert.equal(pts(w.floor, "wohnzimmer")[1][0], 10);
    assert.deepEqual(pts(w.floor, "kueche").map((p) => p[0]), link ? [10, 11, 11, 10] : [7, 11, 11, 7]);
    assert.deepEqual(pts(w.floor, "flur")[1], [11, 4]);
    assert.equal(w.undo, 1);
  }
});

test("Editor: Antippen ohne Verschieben legt keinen Rückgängig-Schritt an", () => {
  const ed = fakeEditor();
  const before = JSON.stringify(ed.b);
  ed._dragRoomVertex(vertexDrag(), {}, [7.01, 5.02]);
  ed._dragRoomEdge(edgeDrag(), {}, [7.01, 2]);
  ed._dragRoomEdge(edgeDrag(), { altKey: true }, [6.99, 2]);
  assert.equal(ed.undo, 0);
  assert.equal(JSON.stringify(ed.b), before);
  // hin und zurück: ein Schritt, Etage wieder wie vorher
  const drag = edgeDrag();
  ed._dragRoomEdge(drag, {}, [7.5, 2]);
  ed._dragRoomEdge(drag, {}, [7.02, 2]);
  assert.equal(drag.applied, 0);
  assert.equal(ed.undo, 1);
  assert.equal(JSON.stringify(ed.b), before);
});

test("Editor: Andocken an die parallele Nachbarwand (−0,13) mit Hinweis", () => {
  const f = { id: "f", rooms: [rect("a", 0, 0, 4, 3), rect("b", 4.13, 0, 8, 3)], openings: [], walls: [] };
  const ed = fakeEditor({ floor: f, sel: { kind: "room", id: "a" } });
  const drag = edgeDrag("a", 1, [4, 1.5]);
  ed._dragRoomEdge(drag, {}, [4.07, 1.5]); // Raster wäre 4,05 – die Nachbarwand liegt im Fangradius
  assert.equal(drag.applied, -0.13);
  assert.deepEqual(pts(ed.floor, "a")[1], [4.13, 0]);
  assert.deepEqual(pts(ed.floor, "b")[0], [4.13, 0]);
  assert.equal(ed.toasts.at(-1), "Wand verschoben: -0,13 m (an Nachbarwand) – nur dieser Raum (Alt kehrt das um)");
  ed._dragRoomEdge(drag, {}, [4.4, 1.5]); // außerhalb: Raster
  assert.equal(drag.applied, -0.4);
  assert.doesNotMatch(ed.toasts.at(-1), /Nachbarwand/);
});

test("Editor: toggleLink speichert, zeichnet Leiste und Schalter vor dem Hinweis, Feld folgt", () => {
  store.clear();
  const ed = fakeEditor();
  const cb = { checked: false };
  ed.props = { querySelector: (q) => (q === "input[data-link]" ? cb : null) };
  ed.toggleLink();
  assert.equal(ed.link, true);
  assert.equal(store.get(LINK_KEY), "1");
  assert.deepEqual(ed.calls, ["renderBar", "touch", "toast"]);
  assert.equal(cb.checked, true);
  assert.equal(ed.toasts.at(-1), "Ecken koppeln an: Nachbarräume gehen mit (Alt kehrt es einmal um).");
  ed.coarse = true;
  ed.toggleLink();
  assert.equal(store.get(LINK_KEY), "0");
  assert.equal(cb.checked, false);
  assert.equal(ed.toasts.at(-1), "Ecken koppeln aus: nur dieser Raum ändert sich („Mitziehen“ kehrt es einmal um).");
  // Knopf und Feld
  assert.match(ed._linkButton(), /data-act="link" class=""/);
  ed.link = true;
  assert.match(ed._linkButton(), /data-act="link" class="sel"/);
  assert.match(ed._linkField(), /data-link checked/);
  // Feld bindet an toggleLink (nur bei echter Änderung)
  let handler = null;
  const input = { checked: false, addEventListener: (k, fn) => (handler = fn) };
  ed._bindLinkField({ querySelector: () => input });
  handler();
  assert.equal(ed.link, false);
  input.checked = false;
  handler();
  assert.equal(ed.link, false);
});

test("Editor: _initLink liest den Speicher, ohne Speicher entkoppelt", () => {
  const ed = fakeEditor({ link: undefined });
  store.set(LINK_KEY, "1");
  ed._initLink();
  assert.equal(ed.link, true);
  store.set(LINK_KEY, "0");
  ed._initLink();
  assert.equal(ed.link, false);
  store.delete(LINK_KEY);
  ed._initLink();
  assert.equal(ed.link, false);
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("gesperrt"); } };
  ed.link = true;
  ed._initLink();
  assert.equal(ed.link, false);
  globalThis.localStorage = saved;
});

test("Editor: Maßfelder lesen die Kopplung erst beim Ändern, „Einzeln“/„Mitziehen“ gilt einmal", () => {
  const ed = fakeEditor();
  const handlers = {};
  const el = {
    querySelector: (q) => (q === "[data-edgelen]" ? { addEventListener: (k, fn) => (handlers.len = fn) } : null),
    querySelectorAll: () => [],
  };
  ed._bindMeasureFields(el, ed.floor.rooms.find((r) => r.id === "wohnzimmer"), 0);
  ed.link = true; // nach dem Zeichnen des Felds umgeschaltet
  handlers.len({ target: { value: "7.5" } });
  assert.deepEqual(pts(ed.floor, "kueche")[0], [7.5, 0]);
  assert.match(ed.toasts.at(-1), /^Mitgezogen: .*Küche/);
  ed.mods.solo = true; // Schalter „Einzeln“: dieses eine Mal nur der Raum
  handlers.len({ target: { value: "8" } });
  assert.equal(pts(ed.floor, "wohnzimmer")[1][0], 8);
  assert.deepEqual(pts(ed.floor, "kueche")[0], [7.5, 0]);
  assert.equal(ed.mods.solo, false);
  assert.ok(ed.calls.includes("touch"));
});

test("Editor: Werkzeug Wand – Anfang auf Ecke oder Raumkante, Ende auf Ecke oder Kante in Wandrichtung", () => {
  const ed = fakeEditor({ sel: null });
  assert.deepEqual(ed._wallStart([0.04, 3.21]), [0, 3.2]); // Raumkante x = 0, Lage aufs Raster
  assert.deepEqual(ed._wallStart([0.04, 3.21], true), [0.05, 3.2]); // Frei: nur Raster
  assert.deepEqual(ed._wallStart([7.03, 3.98]), [7, 4]); // Ecke
  assert.deepEqual(ed._wallStart([5.02, 2.5]), [5, 2.5]); // nichts in der Nähe: Raster
  // von außen senkrecht auf die Außenwand: Schnitt in Wandrichtung
  ed._guides = { at: [0, 0], list: [] };
  assert.deepEqual(ed._wallToolSnap([5, -2], [5.02, -0.08]), [5, 0]);
  assert.equal(ed._guides, null);
  assert.deepEqual(ed._wallToolSnap([5, -2], [5.02, -0.08], true), [5, -0.1]); // Frei
  // Ecke vor Kante
  assert.deepEqual(ed._wallToolSnap([7, -2], [7.02, -0.04]), [7, 0]);
  // freie Wand: ihre eigenen Enden fangen beim Ziehen nicht (exceptWall)
  ed.floor.walls = [{ id: "w1", a: [12, 0], b: [12, 3] }];
  assert.deepEqual(ed._wallToolSnap([12, 0], [12.01, 3.04]), [12, 3]);
  assert.deepEqual(ed._wallToolSnap([12, 0], [12.01, 3.04], false, "w1"), [12, 3.05]);
  // nächste Wand der Kette beginnt am Ende der vorigen: keine Kante bei Länge 0
  assert.deepEqual(ed._wallToolSnap([12, 3], [13.02, 3.01]), [13, 3]);
  // Fluchtlinie ohne Kante: waagerecht auf die x der Ecke (11,4)
  assert.deepEqual(ed._wallToolSnap([13, 6], [11.04, 6.02]), [11, 6]);
});

test("Editor: Langdruck-Menü nur mit Finger oder Stift – mit der Maus geht es mitten im Zug nicht auf", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const target = { closest: () => ({ dataset: { kind: "furniture" } }) };
  const menus = [];
  const ed = Object.assign(Object.create(TouchMethods), { tool: "select", roofMode: false, sel: { kind: "furniture", id: "m1" }, _ctxMenu: (at) => menus.push(at) });
  for (const pointerType of ["mouse", "touch", "pen", ""]) {
    ed._longPressStart({ pointerType, target, clientX: 10, clientY: 20 });
    t.mock.timers.tick(600);
    if (ed._lpFired) menus.at(-1).push(pointerType);
    ed._longPressCancel();
  }
  assert.deepEqual(menus, [[10, 20, "touch"], [10, 20, "pen"]]);
  // Finger bewegt sich mehr als 6 px: kein Menü
  ed._longPressStart({ pointerType: "touch", target, clientX: 10, clientY: 20 });
  ed._longPressMove({ clientX: 20, clientY: 20 });
  t.mock.timers.tick(600);
  assert.equal(menus.length, 2);
  assert.equal(ed._lpFired, false);
});
