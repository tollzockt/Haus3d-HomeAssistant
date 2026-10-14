// Editor: Verteiler drehen und an die Wand stellen, Leitungen auf Decken-Höhe (Mixins ohne DOM an einem
// nachgebauten FloorEditor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FloorEditor } from "../../custom_components/haus3d/frontend/editor.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** Etage mit einer Küche 7…11 × 0…4 (Wandflächen an den Raumkanten), darüber ein OG. */
function makeEditor({ nodes = [], pipes = [], furniture = [], egHeight = 2.6, ogElevation = 2.9 } = {}) {
  const eg = { id: "eg", name: "EG", elevation: 0, height: egHeight, rooms: [{ id: "k", name: "Küche", points: rect(7, 0, 11, 4) }], furniture, nodes, pipes, openings: [], walls: [] };
  const og = { id: "og", name: "OG", elevation: ogElevation, height: 2.5, rooms: [], furniture: [], nodes: [], pipes: [], openings: [], walls: [] };
  const field = { value: "" };
  const ed = Object.create(FloorEditor.prototype);
  Object.assign(ed, {
    b: { version: 1, floors: [eg, og], settings: {} },
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
    propsRenders: 0,
    field,
    props: { querySelector: (s) => (s === "[data-nrot]" ? field : null) },
    render() {},
    renderBar() {},
    renderProps() {
      this.propsRenders++;
    },
    _sync3d() {},
    _queueDraft() {},
    _toast(t) {
      this.toasts.push(t);
    },
  });
  return ed;
}

const node = (ed, id) => ed.floor.nodes.find((n) => n.id === id);

test("Verteiler setzen: rastet an der Wand ein und dreht sich zum Raum", () => {
  const ed = makeEditor();
  ed.nodeOpts = { kind: "hv" };
  ed._nodeTap({}, [10.9, 2.0]);
  const n = ed.floor.nodes.at(-1);
  assert.equal(n.rotation, 90);
  assert.equal(n.x, 10.94);
  assert.equal(n.z, 2);
  assert.match(ed.toasts.at(-1), /^Hauptverteilung gesetzt und zur Wand gedreht – rechts Name und Zähler wählen\.$/);
  // Ecke: bleibt mit halber Breite aus der Ecke heraus
  ed._nodeTap({}, [7.15, 0.15]);
  const c = ed.floor.nodes.at(-1);
  assert.ok(c.x >= 7.35 && c.rotation === 0 && c.z === 0.06, JSON.stringify(c));
  // kleiner Maßstab: _pipeSnap rastet von 0,6 m an der Ecke ein, die Wandzone (0,3 m) gilt aber am Zeiger
  const small = makeEditor();
  small.scale = 20;
  small.nodeOpts = { kind: "hv" };
  small._nodeTap({}, [7.5, 0.6]);
  assert.deepEqual([small.floor.nodes[0].x, small.floor.nodes[0].z, small.floor.nodes[0].rotation], [7.06, 0.06, 0]);
  assert.doesNotMatch(small.toasts.at(-1), /gedreht/);
  // mitten im Raum: Drehung 0, Toast ohne Wand; Abzweigdose und Durchführung ohne Wand-Rasten
  ed._nodeTap({}, [9, 2]);
  assert.deepEqual([ed.floor.nodes.at(-1).x, ed.floor.nodes.at(-1).rotation], [9, 0]);
  assert.doesNotMatch(ed.toasts.at(-1), /Wand/);
  ed.nodeOpts = { kind: "durch" };
  ed._nodeTap({}, [10.8, 2.0]);
  assert.equal(ed.floor.nodes.at(-1).rotation, 0);
  // Umschalt = frei: nicht zur Wand gedreht
  ed.nodeOpts = { kind: "uv" };
  ed._nodeTap({ shiftKey: true }, [10.8, 3.0]);
  assert.equal(ed.floor.nodes.at(-1).rotation, 0);
  assert.doesNotMatch(ed.toasts.at(-1), /gedreht/);
});

test("Plan: Gehäuse gedreht, Spitze nur bei drehbaren, Drehgriff nur gewählt; alter Knoten zur Wand", () => {
  const ed = makeEditor({ nodes: [
    { id: "a", kind: "hv", x: 10.94, z: 2, rotation: 90 },
    { id: "b", kind: "uv", x: 7.06, z: 2 },
    { id: "c", kind: "wasser_in", x: 9, z: 0.06 },
    { id: "d", kind: "abzweig", x: 9, z: 2, model: false },
  ] });
  const px = (v) => v / 50;
  let svg = ed._nodeParts(px);
  assert.match(svg, /rotate\(90\)/);
  assert.match(svg, /rotate\(270\)/); // ohne gespeicherte Drehung: zur Wand (Normale +x)
  assert.equal((svg.match(/<path /g) ?? []).length, 2); // Spitzen nur hv/uv
  assert.equal((svg.match(/data-kind="nrotate"/g) ?? []).length, 0);
  assert.match(svg, /pointer-events="none"><circle cx="0" cy="0.01"/); // runder Wasseranschluss mit Rückseite an der Wand
  ed.sel = { kind: "pnode", id: "a" };
  svg = ed._nodeParts(px);
  const grip = svg.match(/<circle data-kind="nrotate" data-id="a" cx="([\d.-]+)" cy="([\d.-]+)"/);
  assert.ok(grip, svg);
  assert.ok(Number(grip[1]) < 10.94 - 0.3 && Math.abs(Number(grip[2]) - 2) < 1e-9, grip[0]);
  ed.sel = { kind: "pnode", id: "d" };
  assert.doesNotMatch(ed._nodeParts(px), /nrotate/);
});

test("Drehen: R, Umschalt+R, Drehgriff mit 15°-Raster, ein Rückgängig-Schritt je Zug", () => {
  const ed = makeEditor({ nodes: [{ id: "b", kind: "uv", x: 7.06, z: 2 }, { id: "w", kind: "wasser_in", x: 9, z: 2 }] });
  ed.sel = { kind: "pnode", id: "b" };
  assert.equal(ed._nodeTurnable(), true);
  ed.rotateSel(90); // ab der abgeleiteten Drehung 270
  assert.equal(node(ed, "b").rotation, 0);
  ed.rotateSel(-15);
  assert.equal(node(ed, "b").rotation, 345);
  assert.equal(ed.undoStack.length, 2);
  // Taste R über _onKey
  const key = (k, shift = false) => ed._onKey({ key: k, shiftKey: shift, composedPath: () => [{}], preventDefault() {} });
  key("r");
  assert.equal(node(ed, "b").rotation, 75);
  key("R", true);
  assert.equal(node(ed, "b").rotation, 60);
  // Drehgriff: Vorderseite zeigt zum Zeiger
  const before = ed.undoStack.length;
  const renders = ed.propsRenders;
  const drag = ed._pipeStartDrag({}, [0, 0], "nrotate", { dataset: { id: "b" } });
  assert.deepEqual(drag, { mode: "nrotate", id: "b", first: true });
  ed._moveDrag(drag, {}, [7.06, 3]); // +z → 0°
  assert.equal(node(ed, "b").rotation, 0);
  assert.equal(ed.field.value, "0");
  ed._moveDrag(drag, {}, [8.06, 3.02]); // knapp −45° → −45 → 315
  assert.equal(node(ed, "b").rotation, 315);
  ed._moveDrag(drag, { shiftKey: true }, [8.06, 3]);
  assert.equal(node(ed, "b").rotation, 315);
  ed._moveDrag(drag, { shiftKey: true }, [8.06, 2.5]);
  assert.ok(Math.abs(node(ed, "b").rotation - 296.565) < 1e-3, String(node(ed, "b").rotation));
  assert.equal(ed.undoStack.length, before + 1);
  assert.equal(ed.propsRenders, renders);
  // runde Körper drehen nicht
  ed.sel = { kind: "pnode", id: "w" };
  assert.equal(ed._nodeTurnable(), false);
  const n = ed.undoStack.length;
  ed.rotateSel(90);
  assert.equal(ed.undoStack.length, n);
  assert.equal(node(ed, "w").rotation, undefined);
});

test("An die Wand stellen: Verteiler bis 1,2 m, Möbel ersetzen die Etage nicht mehr", () => {
  const ed = makeEditor({ nodes: [{ id: "a", kind: "hv", x: 10, z: 2, rotation: 0 }, { id: "f", kind: "hv", x: 9, z: 2 }], furniture: [{ id: "m_tv", type: "sofa", x: 9, z: 3.5, rotation: 0 }] });
  ed.sel = { kind: "pnode", id: "a" };
  ed.snapSelToWall();
  assert.deepEqual([node(ed, "a").x, node(ed, "a").z, node(ed, "a").rotation], [10.94, 2, 90]);
  ed.sel = { kind: "pnode", id: "f" };
  ed.snapSelToWall();
  assert.equal(ed.toasts.at(-1), "Keine Wand in der Nähe (bis 1,2 m).");
  assert.equal(node(ed, "f").rotation, undefined);
  ed.sel = { kind: "furniture", id: "m_tv" };
  ed.snapSelToWall();
  assert.equal(ed.floor?.id, "eg");
  assert.ok(Array.isArray(ed.floor.rooms) && ed.b.floors.length === 2);
  const m = ed.floor.furniture[0];
  assert.ok(m.z > 3.5 && m.rotation === 180, JSON.stringify(m));
});

test("Pfeiltasten schieben Verteiler; Ziehen an die Wand dreht ihn", () => {
  const ed = makeEditor({ nodes: [{ id: "a", kind: "router", x: 9, z: 2, rotation: 0 }] });
  ed.sel = { kind: "pnode", id: "a" };
  ed.nudge(0.05, 0);
  ed.nudge(0, -0.01);
  assert.deepEqual([node(ed, "a").x, node(ed, "a").z], [9.05, 1.99]);
  assert.equal(ed.undoStack.length, 1);
  const drag = ed._pipeStartDrag({}, [9, 2], "pnode", { dataset: { id: "a" } });
  ed._moveDrag(drag, {}, [10.85, 1.5]);
  assert.deepEqual([node(ed, "a").x, node(ed, "a").z, node(ed, "a").rotation], [10.94, 1.5, 90]);
  assert.equal(ed.field.value, "90");
  ed._moveDrag(drag, {}, [9, 1.5]); // weg von der Wand: Drehung bleibt
  assert.deepEqual([node(ed, "a").x, node(ed, "a").rotation], [9, 90]);
  assert.equal(ed.undoStack.length, 2);
});

test("Leitungen: Standard Decke für Strom und Netzwerk, Boden für Wasser; Wahl, Mediumwechsel, Abschluss", () => {
  const ed = makeEditor();
  ed.tool = "pipe";
  const o = ed._pipeOpts();
  assert.deepEqual(o, { type: "strom", pick: null });
  ed._pipeTap({}, [9, 1]);
  ed._pipeTap({}, [9, 3]);
  assert.deepEqual(ed.draft.heights, [2.45, 2.45]);
  assert.deepEqual(ed.draft.picks, [null, null]);
  // Steckdose gewählt: an derselben Stelle = senkrechter Wechsel, nicht Ende
  o.pick = "steckdose";
  ed._pipeTap({}, [9, 3]);
  assert.equal(ed.draft.line.length, 3);
  assert.deepEqual(ed.draft.heights, [2.45, 2.45, 0.3]);
  // Medium wechseln: Standard-Punkte neu, gewählte bleiben
  o.type = "wasser_kalt";
  ed._pipeRetype();
  assert.deepEqual(ed.draft.heights, [0.03, 0.03, 0.3]);
  o.type = "strom";
  ed._pipeRetype();
  // eigene Höhe, begrenzt auf die lichte Höhe
  o.pick = 9;
  assert.equal(ed._pipeHeight([9, 3]), 2.6);
  o.pick = 0.6;
  ed._pipeTap({}, [10, 3]);
  assert.equal(ed.draft.heights.at(-1), 0.6);
  // gleiche Wahl erneut an derselben Stelle: fertig, Wahl zurückgesetzt
  ed._pipeTap({}, [10, 3]);
  assert.equal(ed.draft, null);
  const p = ed.floor.pipes.at(-1);
  assert.deepEqual(p.heights, [2.45, 2.45, 0.3, 0.6]);
  assert.equal(p.height, 0.6);
  assert.equal(o.pick, null);
  // Punkt zurück und Länge setzen halten Höhen und Wahl gleich lang
  ed.tool = "pipe";
  ed._pipeTap({}, [8, 1]);
  ed._pipeTap({}, [8, 2]);
  ed._draftAction("back");
  assert.deepEqual([ed.draft.line.length, ed.draft.heights.length, ed.draft.picks.length], [1, 1, 1]);
});

test("Leitungen: Decke im KG unter dem EG und mit tieferer Etage darüber", () => {
  const ed = makeEditor({ egHeight: 2.6, ogElevation: 2.5 });
  assert.equal(ed._pipeHeight([9, 1], null, null), 2.2); // lichte Höhe 2,35 − 0,15
  assert.equal(ed._pipeHeight([9, 1], null, "boden"), 0.03);
  ed._pipeOpts().type = "netzwerk";
  assert.equal(ed._pipeHeight([9, 1], null, null), 2.2);
  ed._pipeOpts().type = "wasser_warm";
  assert.equal(ed._pipeHeight([9, 1], null, null), 0.03);
});
