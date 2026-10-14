// Editor-3D (Mixin an einem nachgebauten FloorEditor, Szene und Pfeile als Attrappen): Pfeile ziehen mit Raster,
// Live-Vorschau ohne Neuaufbau, Esc bricht ab, Kürzel während des Zugs geschluckt, Strg bzw. „Nur Ansicht“,
// Teile über den Boden ziehen, Klick-Reihenfolge Verteiler/Möbel/Raum, Pfeiltasten nur für schiebbare Arten.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { FloorEditor } from "../../custom_components/haus3d/frontend/editor.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeScene() {
  const captured = new Set();
  const canvas = {
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
    captured,
  };
  const root = new THREE.Group();
  return {
    builds: 0,
    controls: { enabled: true, mouseButtons: { LEFT: 0, MIDDLE: 1, RIGHT: 2 }, _controlActive: false },
    renderer: { domElement: canvas },
    layers: {},
    root,
    _pipeNodes: new Map(),
    nodeHit: null,
    hit: null,
    setLayers(l) {
      this.layers = l;
    },
    setBuilding() {
      this.builds++;
    },
    setFilter() {},
    markFurniture() {},
    selectRooms() {},
    invalidate() {},
    planPoint: (cx, cy) => [cx / 100, cy / 100],
    pick() {
      return this.hit;
    },
    pickNode() {
      return this.nodeHit;
    },
  };
}

/** Pfeile als Attrappe: Strahl von oben (x/z ziehen) bzw. von der Seite (Höhe ziehen), 100 px = 1 m. */
function makeArrows() {
  return {
    mode: "top",
    over: null,
    calls: [],
    hit() {
      return this.over;
    },
    ray(cx, cy) {
      if (this.mode === "top") return { origin: { x: cx / 100, y: 20, z: cy / 100 }, direction: { x: 0, y: -1, z: 0 } };
      return { origin: { x: this.x ?? 0, y: -cy / 100, z: (this.z ?? 0) + 10 }, direction: { x: 0, y: 0, z: -1 } };
    },
    attach(pos, o) {
      this.calls.push(["attach", pos, o.axes]);
      this.pos = pos;
    },
    detach() {
      this.calls.push(["detach"]);
    },
    setPosition(pos) {
      this.pos = pos;
    },
    hover(a) {
      this.hovered = a;
    },
    dim(on) {
      this.dimmed = on;
    },
  };
}

function makeEditor({ furniture = [], nodes = [], pipes = [] } = {}) {
  const eg = { id: "eg", name: "EG", elevation: 0, height: 2.6, rooms: [{ id: "k", name: "Küche", points: rect(7, 0, 11, 4) }], furniture, nodes, pipes, openings: [], walls: [] };
  const classes = new Set();
  const ed = Object.create(FloorEditor.prototype);
  Object.assign(ed, {
    b: { version: 1, floors: [eg], settings: {} },
    floorId: "eg",
    viewMode: "3d",
    root: { isConnected: true },
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
    props: { querySelector: () => null },
    box3d: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    classes,
    scene3d: makeScene(),
    _arrows: makeArrows(),
    _3dShown: true,
    _3dFloor: "eg",
    render() {},
    renderBar() {},
    renderProps() {
      this.propsRenders++;
      this._mark3d();
    },
    _queueDraft() {},
    _updateTouch() {},
    _toast(t) {
      this.toasts.push(t);
    },
  });
  return ed;
}

const ev = (o = {}) => ({ button: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0, buttons: 0, pointerType: "mouse", preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...o });
const furn = (ed, id) => ed.floor.furniture.find((m) => m.id === id);
const node = (ed, id) => ed.floor.nodes.find((n) => n.id === id);

test("Pfeil X: Raster, kein mount_y, ein Rückgängig-Schritt, ohne Neuaufbau bis zum Ende", async () => {
  const ed = makeEditor({ furniture: [{ id: "s", type: "sofa", x: 8, z: 2, rotation: 0 }] });
  const sc = ed.scene3d;
  const obj = new THREE.Group();
  obj.userData.furniture = "s";
  obj.position.set(8, 0, 2);
  sc.root.add(obj);
  ed.sel = { kind: "furniture", id: "s" };
  ed._mark3d();
  assert.deepEqual(ed._arrows.calls.at(-1)[2], "xyz");
  const canvas = sc.renderer.domElement;
  ed._arrows.over = "x";
  const down = ev({ target: canvas, clientX: 800, clientY: 200 });
  ed._3dDown(down);
  assert.ok(down.stopped && down.prevented, "Pfeil-Zug schluckt das Ereignis");
  assert.equal(sc.controls.enabled, false);
  assert.ok(canvas.captured.has(1) && ed.classes.has("axis"));
  ed._3dMove(ev({ target: canvas, clientX: 802, clientY: 200, buttons: 1 })); // unter 3 px: nichts
  assert.equal(ed.undoStack.length, 0);
  ed._3dMove(ev({ target: canvas, clientX: 863, clientY: 200, buttons: 1 }));
  assert.equal(furn(ed, "s").x, 8.65);
  assert.equal(ed.toasts.at(-1), "X: 8,65 m");
  ed._3dMove(ev({ target: canvas, clientX: 863, clientY: 200, buttons: 1, shiftKey: true }));
  assert.equal(furn(ed, "s").x, 8.63, "Umschalt = 1 cm");
  ed._3dMove(ev({ target: canvas, clientX: 9000, clientY: 200, buttons: 1 }));
  assert.equal(furn(ed, "s").x, 90);
  assert.ok(!("mount_y" in furn(ed, "s")));
  assert.equal(ed.undoStack.length, 1);
  assert.ok(Math.abs(obj.position.x - 90) < 1e-9, "Live-Vorschau verschiebt das Objekt");
  assert.equal(sc.builds, 0, "kein Neuaufbau während des Zugs");
  ed._3dUp(ev({ pointerId: 1, type: "pointerup" }));
  assert.equal(ed._axisDrag, null);
  assert.equal(sc.controls.enabled, true);
  assert.ok(!canvas.captured.has(1) && !ed.classes.has("axis"));
  await sleep(180);
  assert.equal(sc.builds, 1, "danach genau ein Aufbau");
});

test("Pfeil Höhe: 5-cm-Raster als mount_y; Strg+Z geschluckt; Esc nimmt zurück ohne Wiederholen", () => {
  const ed = makeEditor({ furniture: [{ id: "l", type: "lamp_wall", x: 8, z: 0.2, rotation: 0 }] });
  const canvas = ed.scene3d.renderer.domElement;
  ed.sel = { kind: "furniture", id: "l" };
  ed._mark3d();
  Object.assign(ed._arrows, { mode: "side", x: 8, z: 0.2, over: "y" });
  ed._3dDown(ev({ target: canvas, clientY: 0 }));
  assert.equal(ed._axisDrag.start, 1.6);
  ed._3dMove(ev({ clientY: -42, buttons: 1 }));
  assert.equal(furn(ed, "l").mount_y, 2);
  assert.equal(ed.toasts.at(-1), "Höhe über Boden: 2,00 m");
  ed._3dMove(ev({ clientY: -47, buttons: 1 }));
  assert.equal(furn(ed, "l").mount_y, 2.05);
  ed._3dMove(ev({ clientY: 5000, buttons: 1 }));
  assert.equal(furn(ed, "l").mount_y, 0, "nicht unter den Boden");
  ed._3dMove(ev({ clientY: -47, buttons: 1 }));
  const z = ev({ type: "keydown", key: "z", ctrlKey: true });
  ed._3dKeys(z);
  assert.ok(z.prevented && z.stopped, "Strg+Z während des Zugs geschluckt");
  assert.equal(furn(ed, "l").mount_y, 2.05);
  const shift = ev({ type: "keydown", key: "Shift", shiftKey: true });
  ed._3dKeys(shift);
  assert.ok(!shift.stopped, "Umschalt bleibt frei");
  ed._3dKeys(ev({ type: "keydown", key: "Escape" }));
  assert.equal(ed._axisDrag, null);
  assert.equal(furn(ed, "l").mount_y, undefined);
  assert.deepEqual(ed.sel, { kind: "furniture", id: "l" });
  assert.equal(ed.undoStack.length, 0);
  assert.equal(ed.redoStack.length, 0);
  assert.equal(ed.scene3d.controls.enabled, true);
});

test("Pfeil-Zug endet bei anderer Auswahl; Verteiler-Höhe als node.y bis Raumhöhe minus Gehäuse", () => {
  const ed = makeEditor({ nodes: [{ id: "a", kind: "hv", x: 9, z: 2 }, { id: "d", kind: "durch", x: 8, z: 1 }] });
  const canvas = ed.scene3d.renderer.domElement;
  ed.sel = { kind: "pnode", id: "a" };
  ed._mark3d();
  Object.assign(ed._arrows, { mode: "side", x: 9, z: 2, over: "y" });
  ed._3dDown(ev({ target: canvas, clientY: 0 }));
  const start = ed._axisDrag.start;
  ed._3dMove(ev({ clientY: -50, buttons: 1 }));
  assert.equal(node(ed, "a").y, Math.round((start + 0.5) * 100) / 100);
  ed._3dMove(ev({ clientY: -5000, buttons: 1 }));
  assert.equal(node(ed, "a").y, 1.7, "höchstens Raumhöhe 2,6 minus Gehäuse 0,9: das Gehäuse bleibt unter der Decke");
  ed.sel = null;
  ed._3dMove(ev({ clientY: -10, buttons: 1 }));
  assert.equal(ed._axisDrag, null);
  assert.equal(node(ed, "a").y, 1.7);
  // Durchführung: kein Höhen-Pfeil
  ed.sel = { kind: "pnode", id: "d" };
  ed._mark3d();
  assert.equal(ed._arrows.calls.at(-1)[2], "xz");
  ed._arrows.over = "y";
  ed._3dDown(ev({ target: canvas, clientY: 0 }));
  assert.equal(ed._axisDrag, null);
});

test("Strg bzw. „Nur Ansicht“: nichts wählen, Kamera-Tasten getauscht, Strg+Rad ohne Faktor 10", () => {
  const ed = makeEditor({ furniture: [{ id: "s", type: "sofa", x: 8, z: 2 }] });
  const sc = ed.scene3d;
  const canvas = sc.renderer.domElement;
  sc.hit = { furniture: "s" };
  ed._3dDown(ev({ target: canvas, ctrlKey: true }));
  assert.deepEqual(sc.controls.mouseButtons, { LEFT: 2, MIDDLE: 1, RIGHT: 0 });
  assert.equal(ed.sel, null);
  assert.equal(ed._drag3d ?? null, null);
  assert.ok(ed.classes.has("view") && ed._arrows.dimmed);
  ed._3dKeys(ev({ type: "keyup", key: "Control", ctrlKey: false }));
  assert.ok(!ed.classes.has("view"));
  ed.mods.view = true;
  ed._3dDown(ev({ target: canvas }));
  assert.deepEqual(sc.controls.mouseButtons, { LEFT: 0, MIDDLE: 1, RIGHT: 2 });
  assert.equal(ed.sel, null);
  assert.ok(ed.classes.has("view"));
  ed.mods.view = false;
  ed._3dKeys(ev({ type: "keydown", key: "Control", ctrlKey: true }));
  const w = ev({ ctrlKey: true });
  ed._3dWheel(w);
  assert.ok(sc.controls._controlActive && w.prevented);
  ed._3dKeys({ type: "blur" });
  ed._3dWheel(ev({ ctrlKey: true }));
  assert.equal(sc.controls._controlActive, false, "Zwei-Finger-Geste bleibt schnell");
  assert.ok(!ed.classes.has("view"));
});

test("Klick-Reihenfolge: Verteiler direkt vor Möbeln, Möbel vor Verteiler knapp daneben, sonst Raum", () => {
  const ed = makeEditor({ furniture: [{ id: "s", type: "sofa", x: 8, z: 2 }], nodes: [{ id: "a", kind: "hv", x: 9, z: 2 }] });
  const sc = ed.scene3d;
  sc.nodeHit = { id: "a", direct: true };
  sc.hit = { furniture: "s" };
  assert.deepEqual(ed._pick3d(0, 0), { pnode: "a" });
  sc.nodeHit = { id: "a", direct: false };
  assert.deepEqual(ed._pick3d(0, 0), { furniture: "s" });
  sc.hit = { floorId: "eg", roomId: "k" };
  assert.deepEqual(ed._pick3d(0, 0), { pnode: "a" });
  sc.nodeHit = { id: "fremd", direct: true };
  assert.deepEqual(ed._pick3d(0, 0), { floorId: "eg", roomId: "k" });
  // Klick ohne Teil wählt den Raum, Drehen der Kamera wählt nichts
  sc.nodeHit = null;
  const canvas = sc.renderer.domElement;
  ed._3dDown(ev({ target: canvas, clientX: 10, clientY: 10 }));
  assert.equal(sc.controls.enabled, true, "Kamera bleibt an");
  ed._3dUp(ev({ type: "pointerup", clientX: 10, clientY: 10 }));
  assert.deepEqual(ed.sel, { kind: "room", id: "k" });
  ed._3dDown(ev({ target: canvas, clientX: 10, clientY: 10 }));
  ed._3dMove(ev({ clientX: 60, clientY: 10, buttons: 1 }));
  ed._3dUp(ev({ type: "pointerup", clientX: 60, clientY: 10 }));
  assert.deepEqual(ed.sel, { kind: "room", id: "k" });
  sc.hit = null;
  ed._3dDown(ev({ target: canvas }));
  ed._3dUp(ev({ type: "pointerup" }));
  assert.equal(ed.sel, null);
});

test("Verteiler über den Boden ziehen: Griffversatz, an der Wand gedreht, Vorschau dreht mit (K12)", async () => {
  const ed = makeEditor({ nodes: [{ id: "a", kind: "router", x: 9, z: 2, rotation: 0 }] });
  const sc = ed.scene3d;
  const obj = new THREE.Group();
  obj.position.set(9, 0, 2);
  sc._pipeNodes.set("a", { obj });
  sc.nodeHit = { id: "a", direct: true };
  const canvas = sc.renderer.domElement;
  ed._3dDown(ev({ target: canvas, clientX: 905, clientY: 210 }));
  assert.deepEqual(ed.sel, { kind: "pnode", id: "a" });
  assert.equal(sc.controls.enabled, false);
  ed._3dMove(ev({ clientX: 907, clientY: 210, buttons: 1 })); // unter 4 px
  assert.equal(ed.undoStack.length, 0);
  ed._3dMove(ev({ clientX: 1090, clientY: 160, buttons: 1 }));
  assert.deepEqual([node(ed, "a").x, node(ed, "a").z, node(ed, "a").rotation], [10.94, 1.5, 90]);
  assert.ok(Math.abs(obj.position.x - 10.94) < 1e-9 && Math.abs(obj.position.z - 1.5) < 1e-9);
  assert.ok(Math.abs(obj.rotation.y + Math.PI / 2) < 1e-9, "Live-Objekt zur Wand gedreht");
  ed._3dMove(ev({ clientX: 1e7, clientY: 160, buttons: 1 }));
  assert.ok(node(ed, "a").x <= 990, "innerhalb der Grenze");
  assert.equal(sc.builds, 0);
  ed.mods.free = true;
  ed._3dUp(ev({ type: "pointerup" }));
  assert.equal(ed.mods.free, false, "„Frei“ gilt für einen Zug");
  assert.equal(ed.undoStack.length, 1);
  assert.equal(sc.controls.enabled, true);
  await sleep(180);
  assert.equal(sc.builds, 1);
});

test("Pfeile nur bei Einzelauswahl außerhalb der Dach-Ebene; Pfeiltasten ohne leeren Schritt bei Leitungen", () => {
  const ed = makeEditor({ furniture: [{ id: "s", type: "sofa", x: 8, z: 2 }], pipes: [{ id: "p", type: "strom", points: [[7, 1], [9, 1]] }] });
  ed.sel = { kind: "furniture", id: "s" };
  ed._mark3d();
  assert.equal(ed._arrows.calls.at(-1)[0], "attach");
  ed.multi = [{ kind: "furniture", id: "s" }, { kind: "room", id: "k" }];
  ed._mark3d();
  assert.equal(ed._arrows.calls.at(-1)[0], "detach");
  ed.multi = [];
  ed.roofMode = true;
  ed._mark3d();
  assert.equal(ed._arrows.calls.at(-1)[0], "detach");
  ed.roofMode = false;
  ed.sel = { kind: "pipe", id: "p" };
  ed.nudge(0.05, 0);
  assert.equal(ed.undoStack.length, 0);
  ed.sel = { kind: "furniture", id: "s" };
  ed.nudge(0.05, 0);
  assert.equal(furn(ed, "s").x, 8.05);
  assert.equal(ed.undoStack.length, 1);
});

test("Esc beim Pfeil-Zug lässt den Verlauf wie vorher (Wiederholen bleibt erhalten)", () => {
  const ed = makeEditor({ furniture: [{ id: "s", type: "sofa", x: 8, z: 2, rotation: 0 }] });
  const canvas = ed.scene3d.renderer.domElement;
  ed.change((fl) => {
    fl.furniture[0].color = "#ff0000";
  });
  ed.undo();
  assert.equal(ed.redoStack.length, 1);
  const redo = ed.redoStack[0];
  ed.sel = { kind: "furniture", id: "s" };
  ed._mark3d();
  ed._arrows.mode = "top";
  ed._arrows.over = "x";
  ed._3dDown(ev({ target: canvas, clientX: 800, clientY: 200 }));
  ed._3dMove(ev({ target: canvas, clientX: 863, clientY: 200, buttons: 1 }));
  assert.equal(furn(ed, "s").x, 8.65);
  ed._3dKeys(ev({ type: "keydown", key: "Escape" }));
  assert.equal(furn(ed, "s").x, 8);
  assert.equal(ed.undoStack.length, 0);
  assert.deepEqual(ed.redoStack, [redo], "Wiederholen der Farbe bleibt");
  ed.redo();
  assert.equal(furn(ed, "s").color, "#ff0000");
});

test("Kürzel während eines Zugs über den Boden geschluckt (Strg+Z, Entf); Kamera drehen nicht", () => {
  const ed = makeEditor({ nodes: [{ id: "a", kind: "router", x: 9, z: 2, rotation: 0 }] });
  const sc = ed.scene3d;
  sc._pipeNodes.set("a", { obj: new THREE.Group() });
  sc.nodeHit = { id: "a", direct: true };
  const canvas = sc.renderer.domElement;
  ed._3dDown(ev({ target: canvas, clientX: 905, clientY: 210 }));
  ed._3dMove(ev({ clientX: 1000, clientY: 210, buttons: 1 }));
  assert.equal(ed.undoStack.length, 1);
  for (const k of [{ key: "z", ctrlKey: true }, { key: "Delete" }, { key: "ArrowLeft" }]) {
    const e = ev({ type: "keydown", ...k });
    ed._3dKeys(e);
    assert.ok(e.prevented && e.stopped, JSON.stringify(k));
  }
  const ctrl = ev({ type: "keydown", key: "Control", ctrlKey: true });
  ed._3dKeys(ctrl);
  assert.ok(!ctrl.stopped, "Strg bleibt frei (Nur Ansicht)");
  ed._3dUp(ev({ type: "pointerup" }));
  // Kamera drehen (kein Teil getroffen): Kürzel bleiben
  sc.nodeHit = null;
  ed._3dDown(ev({ target: canvas, clientX: 100, clientY: 100 }));
  assert.ok(ed._drag3d && !ed._drag3d.furn);
  const z = ev({ type: "keydown", key: "z", ctrlKey: true });
  ed._3dKeys(z);
  assert.ok(!z.stopped);
  ed._3dUp(ev({ type: "pointerup" }));
});

test("Wandflächen der Leitungen: nach Änderung an Ort und Stelle (Wanddicke) neu", () => {
  const ed = makeEditor();
  ed.b.floors[0].rooms = [{ id: "a", name: "A", points: rect(0, 0, 11, 8) }, { id: "b", name: "B", points: rect(11, 0, 20, 8) }];
  const f0 = ed._pipeFaces();
  assert.equal(ed._pipeFaces(), f0, "zwischengespeichert");
  ed.changeBuilding((b) => {
    b.settings.wall_interior = 0.4;
  });
  const f1 = ed._pipeFaces();
  assert.notEqual(f1, f0);
  assert.notDeepEqual(f1, f0);
});

test("Hausdach-Wächter: Rechteck-Raum neben dem Haus, Einfügen und Mehrfach-Löschen setzen Kanten-Anpassungen zurück", async () => {
  const ed = makeEditor();
  ed.b.settings.roof = { type: "gable", pitch: 35, overhang: 0.5, adjust: [{ lo: 1 }] };
  ed.b.floors[0].rooms = [{ id: "a", name: "A", points: rect(0, 0, 6, 5) }];
  ed.changeBuilding = function (fn, { merge = false } = {}) {
    this._pushUndo(merge);
    fn(this.b);
  };
  // Rechteck-Werkzeug: Zug wie im Plan (house0 bei pointerdown, Raum entsteht erst in _endDrag)
  const drag = { mode: "rect", house0: ed._house0() };
  ed.tool = "rect";
  ed.draft = { rect: [[6, 0], [9, 5]] };
  ed._endDrag(drag, ev({ type: "pointerup" }), [9, 5]);
  assert.equal(ed.floor.rooms.length, 2);
  assert.equal(ed.b.settings.roof.adjust, undefined, "Rechteck neben dem Haus");
  assert.equal(ed.undoStack.length, 1, "im selben Rückgängig-Schritt");
  assert.match(ed.toasts.at(-1), /Kanten-Anpassungen sind zurückgesetzt/);
  // Mehrfach löschen
  ed.b.settings.roof.adjust = [{ lo: 1 }];
  ed.multi = [{ kind: "room", id: ed.floor.rooms[1].id }];
  ed._deleteMulti();
  assert.equal(ed.b.settings.roof.adjust, undefined, "Mehrfach-Löschen");
  assert.match(ed.toasts.at(-1), /Teile gelöscht.*zurückgesetzt/);
  // Einfügen neben dem Haus
  ed.b.settings.roof.adjust = [{ lo: 1 }];
  const { copyRefs } = await import("../../custom_components/haus3d/frontend/plan-tools.js");
  ed._paste(copyRefs(ed.floor, [{ kind: "room", id: "a" }]), [9, 2.5]);
  assert.equal(ed.floor.rooms.length, 2);
  assert.equal(ed.b.settings.roof.adjust, undefined, "Einfügen");
  // nichts geändert: bleibt
  ed.b.settings.roof.adjust = [{ lo: 1 }];
  ed._houseGuard(ed._house0());
  assert.deepEqual(ed.b.settings.roof.adjust, [{ lo: 1 }]);
});
