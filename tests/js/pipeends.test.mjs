// Leitungsenden an Geräten: Bezug pipe.ends, Anschlusspunkt, Einrasten beim Zeichnen und Ziehen (Vorrang
// Verteiler/Leitung), Mitziehen beim Verschieben/Drehen/Löschen, Anschlusshöhe in 3D, Netz und Last am Gerät.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectHeight,
  deviceSnap,
  endAnchor,
  endDevice,
  endRef,
  endTarget,
  followPoint,
  furnitureSpan,
  loadEnd,
  pipeEnds,
  targetMoved,
  unplugEnd,
} from "../../custom_components/haus3d/frontend/pipeends.js";
import { followPipes } from "../../custom_components/haus3d/frontend/follow-pipes.js";
import { pipeEndDrops } from "../../custom_components/haus3d/frontend/pipenodes.js";
import { pipeRoute } from "../../custom_components/haus3d/frontend/pipes.js";
import { computeNet } from "../../custom_components/haus3d/frontend/pipenet.js";
import { pipeEndLoad } from "../../custom_components/haus3d/frontend/panel-pipes.js";
import { watchedEntities } from "../../custom_components/haus3d/frontend/devices.js";
import { FURNITURE, furnitureBaseY, furnitureTopY } from "../../custom_components/haus3d/frontend/furniture.js";
import { FloorEditor } from "../../custom_components/haus3d/frontend/editor.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const near = (a, b, tol = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const SPAN = furnitureSpan(furnitureBaseY, FURNITURE);

/** Waschmaschine an der Nordwand (Rückseite bei z = 0), kleines NAS, platziertes Gerät. */
const washer = () => ({ id: "wm", type: "washer", x: 8, z: 0.3, rotation: 0, w: 0.6, d: 0.6, h: 0.85, entity: "switch.waschmaschine" });
const nas = () => ({ id: "nas", type: "nas", x: 10, z: 3, rotation: 0, w: 0.22, d: 0.25, h: 0.25 });
const placed = () => ({ entity_id: "switch.geraet", x: 10, z: 2, y: null });

/** Nachgebauter FloorEditor (ohne DOM): Küche 7…11 × 0…4. */
function makeEditor({ nodes = [], pipes = [], furniture = [washer(), nas()], placements = [placed()] } = {}) {
  const eg = { id: "eg", name: "EG", elevation: 0, height: 2.6, rooms: [{ id: "k", name: "Küche", points: rect(7, 0, 11, 4) }], furniture, placements, nodes, pipes, openings: [], walls: [] };
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
    tool: "pipe",
    draft: null,
    toasts: [],
    render() {},
    renderBar() {},
    renderProps() {},
    _sync3d() {},
    _queueDraft() {},
    _toast(t) {
      this.toasts.push(t);
    },
  });
  return ed;
}

const pipe = (ed, id) => ed.floor.pipes.find((p) => p.id === id);

test("Bezug: furniture oder entity, genau eins; Ziel fehlt bzw. kein Gerät → null", () => {
  assert.deepEqual(endRef({ furniture: "wm" }), { furniture: "wm" });
  assert.deepEqual(endRef({ entity: "switch.x" }), { entity: "switch.x" });
  for (const bad of [null, "wm", 3, {}, { furniture: "" }, { entity: "kaputt" }, { furniture: "wm", entity: "switch.x" }]) assert.equal(endRef(bad), null, JSON.stringify(bad));
  const floor = { furniture: [washer(), { id: "teppich", type: "rug", x: 9, z: 2, w: 2, d: 1.4 }], placements: [placed()] };
  assert.equal(endTarget(floor, { furniture: "wm" }).kind, "furniture");
  assert.equal(endTarget(floor, { entity: "switch.geraet" }).kind, "placement");
  assert.equal(endTarget(floor, { furniture: "weg" }), null);
  assert.equal(endTarget(floor, { furniture: "teppich" }), null); // Bodenbelag ist kein Gerät
  assert.equal(endTarget({}, { entity: "switch.geraet" }), null);
  assert.deepEqual(pipeEnds({ ends: { b: { furniture: "wm" } } }, floor).a, null);
  const p = { ends: { a: { furniture: "wm" }, b: { entity: "switch.x" } } };
  unplugEnd(p, "a");
  assert.deepEqual(p.ends, { b: { entity: "switch.x" } });
  unplugEnd(p, "b");
  assert.equal(p.ends, undefined);
});

test("Anschlusspunkt: Rückseite 6 cm nach innen, entlang dem Zeiger; klein bzw. flach mittig; gedreht", () => {
  const t = { kind: "furniture", item: washer() };
  assert.deepEqual(endAnchor(t), [8, 0.06]);
  assert.deepEqual(endAnchor(t, [8.1, 0.5]), [8.1, 0.06]);
  assert.deepEqual(endAnchor(t, [9, 0.5]), [8.2, 0.06]); // 10 cm von der Seite
  assert.deepEqual(endAnchor({ kind: "furniture", item: nas() }, [10.05, 3.1]), [10, 3]);
  assert.deepEqual(endAnchor({ kind: "furniture", item: { id: "tv", type: "tv_wall", x: 3, z: 0.05, w: 1.25, d: 0.08 } }, [3.5, 0]), [3, 0.05]);
  // um 90° gedreht: Vorderseite nach -x, Rückseite bei x = Mitte + d/2
  const r = { kind: "furniture", item: { ...washer(), x: 10.7, z: 2, rotation: 90 } };
  assert.deepEqual(endAnchor(r), [10.94, 2]);
  assert.deepEqual(endAnchor({ kind: "placement", item: placed() }), [10, 2]);
});

test("Fang: in der Grundfläche, Steckdose bis zum Fangradius, große Möbel nur am Rand; Platzierung", () => {
  const floor = {
    furniture: [washer(), { id: "dose", type: "fuse_box", x: 9.5, z: 0.03, w: 0.08, d: 0.04, h: 0.08 }, { id: "sb", type: "sideboard", x: 9.6, z: 0.25, w: 1.6, d: 0.45, h: 0.8 }],
    placements: [placed()],
  };
  assert.equal(deviceSnap(floor, [8.1, 0.4], 0.28).ref.furniture, "wm");
  // vor der Wand hinter der Waschmaschine (15 cm daneben): kein Fang, die Wand bleibt maßgebend
  assert.equal(deviceSnap({ furniture: [{ ...washer(), z: 0.45 }] }, [8, 0.0], 0.28), null);
  // kleine Dose vor dem Sideboard: der kleinere Gegenstand gewinnt
  const s = deviceSnap(floor, [9.5, 0.05], 0.28);
  assert.equal(s.ref.furniture, "dose");
  assert.deepEqual(s.q, [9.5, 0.03]);
  const pl = deviceSnap(floor, [10.1, 2.05], 0.28);
  assert.deepEqual(pl.ref, { entity: "switch.geraet" });
  assert.deepEqual(pl.q, [10, 2]);
  assert.equal(deviceSnap(floor, [10.4, 2.4], 0.28), null);
});

test("Zeichnen: Ende rastet an Möbel und platziertem Gerät ein, Bezug wird gespeichert", () => {
  const ed = makeEditor();
  ed._pipeOpts().type = "wasser_kalt";
  ed._pipeTap({}, [7.1, 2]);
  ed._pipeTap({}, [7.1, 0.3]);
  ed._pipeTap({}, [8.1, 0.45]);
  assert.ok(ed._snapDevice && !ed._snapJunction);
  assert.deepEqual(ed.draft.line.at(-1), [8.1, 0.06]);
  ed._finishPipe();
  const p = ed.floor.pipes.at(-1);
  assert.deepEqual(p.ends, { b: { furniture: "wm" } });
  assert.deepEqual(p.points.at(-1), [8.1, 0.06]);
  assert.match(ed.toasts.at(-1), /^Wasser kalt: 3 Punkte, Ende an Waschmaschine – rechts Sensor oder Zielraum wählen\.$/);
  // Anfang an einem platzierten Gerät; Punkt zurück und neu gesetzt: der Bezug des neuen Punkts gilt
  ed.tool = "pipe";
  ed._pipeOpts().type = "netzwerk";
  ed._pipeTap({}, [10.05, 2.05]);
  ed._pipeTap({}, [10.0, 3.6]);
  ed._pipeTap({}, [10.05, 3.05]); // NAS
  ed.draft.line.pop();
  ed.draft.heights.pop();
  ed.draft.picks.pop();
  ed._pipeTap({}, [9, 3.6]);
  ed._finishPipe();
  const q = ed.floor.pipes.at(-1);
  assert.deepEqual(q.ends, { a: { entity: "switch.geraet" } });
  assert.deepEqual(q.points[0], [10, 2]);
  // ohne Geräte in der Nähe: kein ends (wie bisher)
  ed.tool = "pipe";
  ed._pipeTap({}, [7.1, 3]);
  ed._pipeTap({}, [9, 3.6]);
  ed._finishPipe();
  assert.equal("ends" in ed.floor.pipes.at(-1), false);
});

test("Vorrang: Verteiler und Leitungen, wenn sie näher sind; Leitungsende am Anschluss zählt als Gerät", () => {
  const ed = makeEditor({
    nodes: [{ id: "uv", kind: "uv", x: 8.45, z: 0.06 }],
    pipes: [
      { id: "decke", type: "strom", points: [[7.06, 0.5], [10.94, 0.5]], heights: [2.45, 2.45] },
      { id: "dran", type: "strom", points: [[7.06, 1], [7.9, 0.06]], heights: [0.3, 0.3], ends: { b: { furniture: "wm" } } },
    ],
  });
  ed._pipeOpts().type = "strom";
  // Verteiler näher als der Anschluss
  assert.deepEqual(ed._pipeSnap({}, [8.4, 0.1], null), [8.45, 0.06]);
  assert.ok(ed._snapJunction && !ed._snapDevice);
  // Leitung über der Waschmaschine näher als der Anschluss: Abzweig auf der Leitung
  assert.deepEqual(ed._pipeSnap({}, [8.1, 0.52], null), [8.1, 0.5]);
  assert.ok(ed._snapJunction && !ed._snapDevice);
  // hinter dem Ende der Leitung „dran“, das am Anschluss liegt: gleich weit – das Gerät gewinnt
  assert.deepEqual(ed._pipeSnap({}, [7.9, 0.02], null), [7.9, 0.06]);
  assert.equal(ed._snapDevice?.ref.furniture, "wm");
  // auf dieser Leitung kurz davor: sie ist näher (Abzweig)
  assert.deepEqual(ed._pipeSnap({}, [7.75, 0.25], null).map((v) => Math.round(v * 100) / 100), [7.74, 0.24]);
  assert.ok(ed._snapJunction && !ed._snapDevice);
  // Schalter „Frei“: kein Fang an Geräten (wie an Verteilern und Leitungen)
  ed.mods.free = true;
  ed._pipeSnap({}, [8.1, 0.3], null);
  assert.equal(ed._snapDevice, null);
  ed.mods.free = false;
  // Verteiler setzen bzw. ziehen rastet nicht an Geräten ein
  ed.tool = "node";
  ed._pipeSnap({}, [8.1, 0.3], null, { type: "strom" });
  assert.equal(ed._snapDevice, null);
});

test("Ende ziehen: an ein Gerät = angeschlossen, weg = gelöst; Zwischenpunkte nicht", () => {
  const ed = makeEditor({ pipes: [{ id: "l", type: "strom", points: [[7.06, 2], [7.06, 1], [9, 1]], heights: [2.45, 2.45, 2.45] }] });
  ed.tool = "select";
  const drag = { mode: "pipept", id: "l", i: 2, first: true };
  ed._pipeMoveDrag(drag, {}, [8.05, 0.4]);
  assert.deepEqual(pipe(ed, "l").ends, { b: { furniture: "wm" } });
  assert.deepEqual(pipe(ed, "l").points[2], [8.05, 0.06]);
  ed._pipeMoveDrag(drag, {}, [9, 1.5]);
  assert.equal(pipe(ed, "l").ends, undefined);
  assert.equal(ed.undoStack.length, 1);
  ed._pipeMoveDrag({ mode: "pipept", id: "l", i: 1, first: true }, {}, [8.0, 0.35]);
  assert.equal(pipe(ed, "l").ends, undefined);
  assert.notDeepEqual(pipe(ed, "l").points[1], [8, 0.06]);
});

test("Mitziehen: Verschieben und Drehen des Geräts, rechtwinklige Führung bleibt", () => {
  const ed = makeEditor({ pipes: [{ id: "l", type: "wasser_kalt", points: [[7.06, 2], [7.06, 0.06], [8.1, 0.06]], heights: [0.03, 0.03, 0.03], ends: { b: { furniture: "wm" } } }] });
  ed.tool = "select";
  ed.sel = { kind: "furniture", id: "wm" };
  ed.nudge(0.5, 0);
  assert.deepEqual(pipe(ed, "l").points, [[7.06, 2], [7.06, 0.06], [8.6, 0.06]]);
  ed.nudge(0, 0.2);
  assert.deepEqual(pipe(ed, "l").points, [[7.06, 2], [7.06, 0.26], [8.6, 0.26]]);
  // drehen um 90° um die Mitte (8.5, 0.5): lokal (0.1, -0.24) → (8.74, 0.6); Nachbarpunkt geht in z mit
  ed.rotateSel(90);
  const pts = pipe(ed, "l").points;
  assert.ok(near(pts[2], [8.74, 0.6]) && near(pts[1], [7.06, 0.6]), JSON.stringify(pts));
  assert.deepEqual(pipe(ed, "l").ends, { b: { furniture: "wm" } });
  // Größe geändert: Abstand zur Rückseite bleibt 6 cm, quer anteilig
  const before = structuredClone(ed.floor);
  ed.change((fl) => {
    Object.assign(fl.furniture.find((m) => m.id === "wm"), { rotation: 0, d: 0.8, w: 1.2 });
  });
  const t0 = endTarget(before, { furniture: "wm" });
  const t1 = endTarget(ed.floor, { furniture: "wm" });
  assert.deepEqual(pipe(ed, "l").points[2], followPoint(before.pipes[0].points[2], t0, t1));
  assert.deepEqual(followPoint([8.1, 0.06], { kind: "furniture", item: washer() }, { kind: "furniture", item: { ...washer(), d: 0.8, w: 1.2 } }), [8.2, -0.04]);
  // Rückgängig stellt alles wieder her
  ed.undo();
  assert.deepEqual(pipe(ed, "l").points[2].map((v) => Math.round(v * 100) / 100), [8.74, 0.6]);
});

test("Mitziehen: Platzierung ziehen, Gerät löschen = Ende gelöst, eigenes Ziehen und alte Leitungen unverändert", () => {
  const ed = makeEditor({
    pipes: [
      { id: "lan", type: "netzwerk", points: [[10, 2], [10, 3.6], [8, 3.6]], heights: [1.1, 2.45, 2.45], ends: { a: { entity: "switch.geraet" } } },
      { id: "wm1", type: "strom", points: [[7.06, 1], [7.06, 0.06], [8, 0.06]], heights: [0.3, 0.3, 0.3], ends: { b: { furniture: "wm" } } },
      { id: "alt", type: "strom", points: [[7.06, 2], [8, 0.06]], heights: [0.3, 0.3] },
    ],
  });
  ed.tool = "select";
  // platziertes Gerät ziehen (läuft nicht über change)
  ed._placeDevice("switch.geraet", [10.5, 2.5]);
  assert.deepEqual(pipe(ed, "lan").points.slice(0, 2), [[10.5, 2.5], [10.5, 3.6]]);
  // Leitung ohne Bezug bleibt, auch wenn ihr Ende am Anschluss liegt
  ed.sel = { kind: "furniture", id: "wm" };
  ed.nudge(0.3, 0);
  assert.deepEqual(pipe(ed, "alt").points, [[7.06, 2], [8, 0.06]]);
  assert.deepEqual(pipe(ed, "wm1").points.at(-1), [8.3, 0.06]);
  // Gerät und Leitungsende in einem Schritt geändert: das Ende bleibt, wo es gesetzt wurde
  ed.change((fl) => {
    fl.furniture.find((m) => m.id === "wm").x = 9;
    fl.pipes.find((p) => p.id === "wm1").points[2] = [8.5, 0.5];
  });
  assert.deepEqual(pipe(ed, "wm1").points.at(-1), [8.5, 0.5]);
  // löschen: Leitung bleibt stehen, Ende gelöst
  const pts = structuredClone(pipe(ed, "wm1").points);
  ed.sel = { kind: "furniture", id: "wm" };
  ed.deleteSelection();
  assert.equal(pipe(ed, "wm1").ends, undefined);
  assert.deepEqual(pipe(ed, "wm1").points, pts);
  ed.sel = { kind: "device", id: "switch.geraet" };
  ed.deleteSelection();
  assert.equal(pipe(ed, "lan").ends, undefined);
  // Richtung umdrehen tauscht die Enden (Daten wie im Eigenschaftenfeld)
  const p = { points: [[0, 0], [1, 0]], ends: { a: { furniture: "x" } } };
  followPipes({ pipes: [] }, { pipes: [p], furniture: [] });
  assert.equal(p.ends, undefined); // Ziel fehlt in der Etage
});

test("followPipes: ohne ends keine Änderung, Nachbar als Abzweig bleibt, zwei Punkte", () => {
  const f0 = { furniture: [washer()], pipes: [{ id: "a", points: [[7, 1], [8, 0.06]] }, { id: "b", points: [[7, 0.06], [8, 0.06]], ends: { b: { furniture: "wm" } } }, { id: "c", points: [[7, 2], [7, 0.06], [8, 0.06]], joints: [1], ends: { b: { furniture: "wm" } } }] };
  const f1 = structuredClone(f0);
  f1.furniture[0].x = 8.5;
  followPipes(f0, f1);
  assert.deepEqual(f1.pipes[0], f0.pipes[0]);
  assert.deepEqual(f1.pipes[1].points, [[7, 0.06], [8.5, 0.06]]); // Nachbar ist das andere Ende: bleibt
  assert.deepEqual(f1.pipes[2].points, [[7, 2], [7, 0.06], [8.5, 0.06]]); // Abzweig bleibt
});

test("3D: Endstück auf die Anschlusshöhe – Boden (Strom 0,3, Wasser 0,5), Wand (Mitte), Decke (Oberkante), Platzierung", () => {
  const floor = (furniture, pipes, placements = []) => ({ height: 2.6, furniture, pipes, placements, nodes: [{ id: "uv", kind: "uv", x: 8, z: 0.06 }] });
  const strom = { id: "s", type: "strom", points: [[7.06, 2], [8, 0.06]], heights: [2.45, 2.45], ends: { b: { furniture: "wm" } } };
  const water = { ...strom, id: "w", type: "wasser_kalt", heights: [0.03, 0.03] };
  assert.deepEqual(pipeEndDrops(strom, floor([washer()], [strom]), { furnSpan: SPAN }), { head: null, tail: 0.3 });
  assert.deepEqual(pipeEndDrops(water, floor([washer()], [water]), { furnSpan: SPAN }), { head: null, tail: 0.5 });
  // Wandleuchte (Unterkante 1,6 m): Mitte; Sicherungskasten (1,2 m): Mitte
  const wl = { id: "wm", type: "lamp_wall", x: 8, z: 0.06, w: 0.25, d: 0.12, h: 0.25 };
  assert.deepEqual(pipeEndDrops(strom, floor([wl], [strom]), { furnSpan: SPAN }), { head: null, tail: 1.725 });
  const fb = { id: "wm", type: "fuse_box", x: 8, z: 0.06, w: 0.55, d: 0.15, h: 0.75 };
  assert.deepEqual(pipeEndDrops(strom, floor([fb], [strom]), { furnSpan: SPAN }), { head: null, tail: 1.575 });
  // Deckenleuchte: an der Decke (Oberkante 1 cm unter der Decke)
  const lc = { id: "wm", type: "lamp_ceiling", x: 8, z: 0.06, w: 0.4, d: 0.4, h: 0.12 };
  assert.deepEqual(pipeEndDrops(strom, floor([lc], [strom]), { furnSpan: SPAN }), { head: null, tail: 2.59 });
  // Platzierung: eigene Höhe, sonst Licht unter der Decke bzw. 1,1 m
  const ps = { ...strom, ends: { a: { entity: "light.decke" } } };
  const at = (y) => floor([], [ps], [{ entity_id: "light.decke", x: 7.06, z: 2, y }]);
  assert.deepEqual(pipeEndDrops(ps, at(null)), { head: 2.35, tail: 1.5 }); // Ende ohne Gerät: am Verteiler (0,9 … 1,5 m)
  assert.deepEqual(pipeEndDrops(ps, at(1.0)), { head: 1, tail: 1.5 });
  // Gerät gelöscht: wieder wie bisher (Verteiler am Ende)
  assert.deepEqual(pipeEndDrops(strom, floor([], [strom])), { head: null, tail: 1.5 });
  // ohne furnSpan: Boden plus Höhe (eigene Montagehöhe)
  assert.deepEqual(pipeEndDrops(strom, floor([{ ...fb, mount_y: 1 }], [strom])), { head: null, tail: 1.375 });
  // Regel einzeln
  assert.equal(connectHeight([0, 0.1], "strom"), 0.1);
  assert.equal(connectHeight([0, 2], "wasser_warm"), 0.5);
  assert.equal(connectHeight([2.4, 2.59], "strom", 2.6), 2.59);
  assert.equal(connectHeight([1.1, 1.1], "netzwerk"), 1.1);
  // der Weg in 3D endet senkrecht am Gerät (der Fluss läuft bis dorthin)
  const r = pipeRoute(strom, pipeEndDrops(strom, floor([washer()], [strom]), { furnSpan: SPAN }));
  assert.deepEqual(r.path.at(-1), [8, 0.3, 0.06]);
  assert.equal(Math.round(r.lenAt(1) * 1000), Math.round(r.len * 1000));
});

test("Geneigt/gekippt: Anschlusshöhe, Anschlusspunkt und Mitziehen folgen der Hülle (liegendes Regal)", () => {
  const span = furnitureSpan(furnitureBaseY, FURNITURE, furnitureTopY);
  const floor = (furniture, pipes) => ({ height: 2.6, furniture, pipes, placements: [], nodes: [] });
  const water = { id: "w", type: "wasser_kalt", points: [[7.06, 2], [8, 1]], heights: [0.03, 0.03], ends: { b: { furniture: "rg" } } };
  const shelf = (o = {}) => ({ id: "rg", type: "shelf", x: 8, z: 1.5, rotation: 0, w: 0.8, d: 0.3, h: 1.8, ...o });
  const tail = (m, mountY) => pipeEndDrops(water, floor([{ ...m, ...(mountY ? { mount_y: mountY } : {}) }], [water]), { furnSpan: span }).tail;
  // stehend: Wasser 0,5 m; liegend (Neigung 90°) ist das Regal nur 0,3 m hoch → höchstens die Oberkante
  assert.equal(tail(shelf()), 0.5);
  assert.equal(tail(shelf({ tilt: 90 })), 0.3);
  assert.equal(tail(shelf({ roll: 90, w: 0.2 })), 0.2, "gekippt: die Breite wird zur Höhe");
  // erhöht (1 m über dem Boden): Mitte der Hülle statt der Mitte des aufrechten Rahmens
  assert.equal(tail(shelf({ tilt: 90 }), 1), 1.15);
  // ohne furnSpan (Rückfall): ebenfalls die Hülle
  assert.equal(pipeEndDrops(water, floor([shelf({ tilt: 90, mount_y: 1 })], [water])).tail, 1.15);
  // Anschlusspunkt: Rückseite der Hülle (liegend 1,8 m tief statt 0,3 m), 6 cm nach innen
  const t = (m) => ({ kind: "furniture", item: m, ref: { furniture: m.id } });
  assert.deepEqual(endAnchor(t(shelf())), [8, 1.41]);
  assert.deepEqual(endAnchor(t(shelf({ tilt: 90 }))), [8, 0.66]);
  assert.deepEqual(endAnchor(t(shelf({ tilt: 90, rotation: 90 }))), [8.84, 1.5]);
  // Neigen/Kippen ändert die Hülle: das Leitungsende wandert mit; Höhe zählt nur, solange geneigt
  assert.equal(targetMoved(t(shelf()), t(shelf({ tilt: 90 }))), true);
  assert.equal(targetMoved(t(shelf()), t(shelf({ roll: 15 }))), true);
  assert.equal(targetMoved(t(shelf()), t(shelf({ h: 2.1 }))), false);
  assert.equal(targetMoved(t(shelf({ tilt: 30 })), t(shelf({ tilt: 30, h: 2.1 }))), true);
  const before = t(shelf());
  const after = t(shelf({ tilt: 90 }));
  assert.deepEqual(followPoint([8, 1.41], before, after), [8, 0.66]);
});

test("Netz: Geräte sind Blätter – kein Verbinden über den Anschluss, Last am Gerät, keine Quelle", () => {
  const furniture = [{ ...washer(), x: 2, z: 0.3 }];
  const hv = { id: "hv", kind: "hv", x: 0, z: 0.06 };
  const main = { id: "main", type: "strom", points: [[0, 0.06], [4, 0.06]], heights: [2.45, 2.45] };
  const drop = { id: "drop", type: "strom", points: [[2, 3], [2, 0.06]], heights: [0.3, 0.3] };
  const load = (p) => (p.id === "drop" ? 500 : null);
  const value = (net, id) => net.edges.filter((e) => e.pipeId === id).map((e) => e.value);
  // ohne Bezug: das Ende liegt auf der Hauptleitung → verbunden, die Hauptleitung trägt 500 W
  const legacy = computeNet({ floors: [{ id: "eg", furniture, nodes: [hv], pipes: [main, drop] }] }, { load });
  assert.equal(value(legacy, "main")[0], 500);
  // am Gerät: Blatt, die Hauptleitung darüber trägt nichts davon
  const dev = { ...drop, ends: { b: { furniture: "wm" } } };
  const net = computeNet({ floors: [{ id: "eg", furniture, nodes: [hv], pipes: [main, dev] }] }, { load });
  assert.deepEqual(value(net, "main"), [0]); // kein Schnitt am Anschluss
  assert.deepEqual(value(net, "drop"), [500]);
  assert.equal(net.edges.find((e) => e.pipeId === "drop").reverse, false);
  // vom Gerät zur Hauptverteilung gezeichnet: Last am Gerät (Anfang), Fluss zum Anfang
  const back = { id: "back", type: "strom", points: [[2, 0.06], [0, 0.06]], heights: [0.3, 0.3], ends: { a: { furniture: "wm" } } };
  const n2 = computeNet({ floors: [{ id: "eg", furniture, nodes: [hv], pipes: [back] }] }, { load: () => 200 });
  assert.deepEqual(n2.edges.map((e) => [e.value, e.reverse]), [[200, true]]);
  // ohne Hauptverteilung: das Gerät ist keine Quelle
  const n3 = computeNet({ floors: [{ id: "eg", furniture, nodes: [], pipes: [back] }] }, { load: () => 200 });
  assert.deepEqual(n3.edges.map((e) => [e.value, e.reverse]), [[200, true]]);
  // Name des Verbrauchers: Entität des Geräts
  const named = computeNet({ floors: [{ id: "eg", furniture, nodes: [hv], pipes: [{ ...back }] }] }, { load: (p) => (p.endTargets.a ? 100 : null) });
  assert.equal(named.details(named.edges[0].id).sinks[0].name, "switch.waschmaschine");
  assert.equal(loadEnd({ a: null, b: null }), "b");
  assert.equal(endDevice({ a: { kind: "placement", item: placed() }, b: { kind: "furniture", item: nas() } }), "switch.geraet");
});

test("Last aus der Entität des Geräts; Leitung mit eigenem Gerät gewinnt; beobachtet wird sie schon", () => {
  const hass = { states: { "switch.waschmaschine": { entity_id: "switch.waschmaschine", state: "on", attributes: { current_power_w: 1800 } }, "sensor.lan": { state: "40", attributes: { unit_of_measurement: "Mbit/s" } } } };
  assert.equal(pipeEndLoad({ type: "strom" }, hass, null, "switch.waschmaschine"), 1800);
  assert.equal(pipeEndLoad({ type: "strom", device: "switch.andere" }, hass, null, "switch.waschmaschine"), null);
  assert.equal(pipeEndLoad({ type: "netzwerk" }, hass, null, "sensor.lan"), 40);
  assert.equal(pipeEndLoad({ type: "wasser_kalt" }, hass, null, "switch.waschmaschine"), 6);
  assert.equal(pipeEndLoad({ type: "strom" }, hass, 120), 120); // wie bisher: Zielraum
  const building = { floors: [{ id: "eg", rooms: [], furniture: [washer()], placements: [placed()], pipes: [{ id: "l", type: "strom", points: [[0, 0], [1, 0]], ends: { b: { furniture: "wm" } } }] }], settings: {} };
  const ids = watchedEntities(building, { states: {} }, new Map());
  assert.ok(ids.includes("switch.waschmaschine") && ids.includes("switch.geraet"), JSON.stringify(ids));
});
