// Nachprüfung 0.23.0 (Logik ohne Browser; die Bedienung prüft tests/browser/shot-nachpruefung.mjs):
// Schrank duplizieren (Geräte kommen mit, Kopie daneben, ohne Entitäten), eingebaute Geräte (keine Drehung, kein Schieben,
// keine Pfeile, kein leerer Rückgängig-Schritt), Randstein-Linie (Art wechseln, Felder), Live-Vorschau im Editor-3D
// (Geräte im Schrank und Rohre), Tafel des Schranks im Info-Hologramm, Glastür des Schranks.
import assert from "node:assert/strict";
import { test } from "node:test";

import { FloorEditor } from "../../custom_components/haus3d/frontend/editor.js";
import { applyAxis, arrowAnchor } from "../../custom_components/haus3d/frontend/arrows3d.js";
import { followMoves } from "../../custom_components/haus3d/frontend/follow.js";
import { copyRefs, duplicateOffset, pasteClip } from "../../custom_components/haus3d/frontend/plan-tools.js";
import { propsUi } from "../../custom_components/haus3d/frontend/props-ui.js";
import { inFootprint, isCabinet } from "../../custom_components/haus3d/frontend/rack.js";
import { TECH_PACK } from "../../custom_components/haus3d/frontend/catalog-tech.js";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

let seq = 0;
const dims = (type) => {
  const [, w, d, h] = TECH_PACK.items[type] ?? ["", 0.22, 0.25, 0.25];
  return { w, d, h };
};
const cab = (o = {}) => ({ id: `c${++seq}`, type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2, ...o });
const dev = (type, o = {}) => ({ id: `d${++seq}`, type, x: 5, z: 5, rotation: 0, ...dims(type), ...o });
const floorOf = (...furniture) => ({ id: "eg", elevation: 0, height: 2.5, furniture });
const get = (floor, id) => floor.furniture.find((m) => m.id === id);
/** Änderung wie im Editor: Etage klonen, ändern, followMoves. */
const edit = (floor, fn) => {
  const after = structuredClone(floor);
  fn(after);
  return followMoves(floor, after);
};
/** Schrank mit zwei eingebauten Geräten (Server unten, USV darüber). */
function rackFloor(cabOpts = {}) {
  const c = cab(cabOpts);
  const a = dev("tech_srv_1u");
  const b = dev("tech_ups_2u");
  return { c, a, b, floor: edit(floorOf(c), (fl) => fl.furniture.push(a, b)) };
}

// ---------------------------------------------------------------- 9 Schrank duplizieren

test("Duplizieren eines Schranks: Geräte kommen mit, die Kopie steht daneben, ohne Entitäten, die Geräte sitzen im neuen Schrank", () => {
  const c = cab({ entity: "switch.schrank" });
  const a = dev("tech_srv_1u", { entity: "sensor.srv" });
  const b = dev("tech_ups_2u");
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a, b));
  const refs = [{ kind: "furniture", id: c.id }];
  const clip = copyRefs(f0, refs);
  assert.deepEqual(clip.furniture.map((m) => m.type), ["network_cabinet", "tech_srv_1u", "tech_ups_2u"]);
  // Schrank 0,6 m breit: Kopie 0,7 m daneben (Breite + 10 cm), nicht darüber
  assert.deepEqual(duplicateOffset(f0, refs), [0.7, 0]);
  const f1 = followMoves(f0, pasteClip(structuredClone(f0), clip, [c.x + 0.7, c.z], new Set(f0.furniture.map((m) => m.id))).floor);
  const copy = f1.furniture.filter(isCabinet).find((m) => m.id !== c.id);
  assert.ok(copy && near(copy.x, c.x + 0.7) && near(copy.z, c.z));
  assert.equal(copy.entity, null, "Entität der Kopie leer");
  assert.equal(get(f1, c.id).entity, "switch.schrank", "das Original behält sie");
  const mine = f1.furniture.filter((m) => m.in_rack === copy.id);
  assert.equal(mine.length, 2, JSON.stringify(f1.furniture.map((m) => [m.id, m.in_rack])));
  assert.deepEqual(mine.map((m) => m.rack_u).sort(), [1, 2]);
  assert.ok(mine.every((m) => !m.entity && near(m.x, copy.x)), "Geräte stehen im neuen Schrank, ohne Entität");
  assert.equal(copy.rack_used, 3);
  // das Original ist unverändert
  assert.equal(get(f1, c.id).rack_used, 3);
  assert.equal(get(f1, a.id).in_rack, c.id);
  assert.equal(get(f1, b.id).in_rack, c.id);
  assert.equal(get(f1, a.id).entity, "sensor.srv");
  assert.ok(!inFootprint(get(f1, c.id), copy.x, copy.z), "die Kopie überlappt das Original nicht");
  // gedrehter Serverschrank (0,6 × 1,0): daneben um die Tiefe plus 10 cm
  const r = cab({ type: "server_rack", rotation: 90, w: 0.6, d: 1.0, h: 2.0 });
  assert.deepEqual(duplicateOffset(floorOf(r), [{ kind: "furniture", id: r.id }]), [1.1, 0]);
});

test("Duplizieren: Schrank und seine Geräte gemeinsam gewählt ergeben keine doppelten Geräte; Mischauswahl behält den Standardversatz", () => {
  const { c, a, floor } = rackFloor();
  const f0 = edit(floor, (fl) => fl.furniture.push({ id: "sofa", type: "sofa", x: 1, z: 1 }));
  const both = [{ kind: "furniture", id: c.id }, { kind: "furniture", id: a.id }];
  assert.equal(copyRefs(f0, both).furniture.length, 3, "Schrank + zwei Geräte, keins doppelt");
  assert.deepEqual(duplicateOffset(f0, both), [0.7, 0]);
  assert.deepEqual(duplicateOffset(f0, [{ kind: "furniture", id: "sofa" }]), [0.5, 0.5]);
  assert.deepEqual(duplicateOffset(f0, [...both, { kind: "furniture", id: "sofa" }]), [0.5, 0.5]);
  // ein Gerät allein kopiert keinen Schrank mit
  assert.equal(copyRefs(f0, [{ kind: "furniture", id: a.id }]).furniture.length, 1);
});

test("pasteClip: ein Bezug auf einen mitkopierten Schrank zeigt auf die Kopie, sonst bleibt er", () => {
  const { c, a, floor } = rackFloor();
  const clip = copyRefs(floor, [{ kind: "furniture", id: c.id }]);
  const r = pasteClip(structuredClone(floor), clip, [8, 5], new Set(floor.furniture.map((m) => m.id)));
  const newCab = r.floor.furniture.find((m) => m.type === "network_cabinet" && m.id !== c.id);
  const newDevs = r.floor.furniture.filter((m) => m.in_rack === newCab.id);
  assert.equal(newDevs.length, 2);
  assert.ok(newDevs.every((m) => m.id !== a.id));
  // nur das Gerät: der Bezug bleibt (followRack entscheidet nach der Lage)
  const one = pasteClip(structuredClone(floor), copyRefs(floor, [{ kind: "furniture", id: a.id }]), [12, 5], new Set(floor.furniture.map((m) => m.id)));
  assert.equal(one.floor.furniture.at(-1).in_rack, c.id);
});

// ---------------------------------------------------------------- 2 eingebaute Geräte: keine Drehung, Pfeile, Schieben

test("Pfeile im Editor-3D: eingebaute Geräte haben keine Achsen, der Schrank schon; applyAxis ändert nichts", () => {
  const { c, a, floor } = rackFloor();
  const da = arrowAnchor(floor, { kind: "furniture", id: a.id });
  assert.equal(da.axes, "");
  assert.ok(da.x === get(floor, a.id).x && da.z === get(floor, a.id).z, "der Anker (Lage) bleibt");
  assert.equal(arrowAnchor(floor, { kind: "furniture", id: c.id }).axes, "xyz");
  const g = structuredClone(floor);
  for (const axis of ["x", "y", "z"]) applyAxis(g, { kind: "furniture", id: a.id }, axis, 3);
  assert.deepEqual(g, floor);
  // ausgebaut: wieder drei Achsen
  const out = structuredClone(floor);
  delete get(out, a.id).in_rack;
  assert.equal(arrowAnchor(out, { kind: "furniture", id: a.id }).axes, "xyz");
});

function makeEditor(floor, extra = {}) {
  const eg = { name: "EG", rooms: [{ id: "k", name: "Küche", points: rect(0, 0, 12, 10) }], outdoor: [], placements: [], nodes: [], pipes: [], openings: [], walls: [], ...floor };
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

test("Eingebautes Gerät: Pfeiltasten, R und Drehen tun nichts und legen keinen Rückgängig-Schritt an; Schrank und freie Geräte wie bisher", () => {
  const { c, a, floor } = rackFloor();
  const free = { id: "frei", type: "tech_switch_24", x: 8, z: 2, rotation: 0 };
  const ed = makeEditor({ ...floor, furniture: [...floor.furniture, free] });
  const before = JSON.stringify(ed.floor);
  ed.sel = { kind: "furniture", id: a.id };
  assert.equal(ed._selRacked(), true);
  ed.nudge(0.05, 0);
  ed.nudge(0, -0.5);
  ed.rotateSel(90);
  ed.rotateSel(-15);
  ed.snapSelToWall();
  assert.equal(ed.undoStack.length, 0, "kein (leerer) Rückgängig-Schritt");
  assert.equal(JSON.stringify(ed.floor), before);
  assert.equal(ed.toasts.length, 4, "ein kurzer Hinweis je Versuch (Schieben, Drehen)");
  assert.ok(ed.toasts.every((t) => /Schrank/.test(t)));
  // Schrank drehen: Geräte drehen mit (ein Schritt)
  ed.sel = { kind: "furniture", id: c.id };
  assert.equal(ed._selRacked(), false);
  ed.rotateSel(90);
  assert.equal(ed.undoStack.length, 1);
  assert.equal(get(ed.floor, c.id).rotation, 90);
  assert.ok(ed.floor.furniture.filter((m) => m.in_rack === c.id).every((m) => m.rotation === 90));
  // freies Gerät dreht und schiebt
  ed.sel = { kind: "furniture", id: "frei" };
  ed.rotateSel(90);
  ed.nudge(0.5, 0);
  assert.equal(get(ed.floor, "frei").rotation, 90);
  assert.equal(get(ed.floor, "frei").x, 8.5);
  assert.equal(ed.undoStack.length, 3);
});

test("Eigenschaften eines eingebauten Geräts: keine Felder Drehung und Höhe, kein Steuerkreuz; freies Gerät und Schrank behalten sie", () => {
  const { c, a, floor } = rackFloor();
  const free = { id: "frei", type: "tech_switch_24", x: 8, z: 2, rotation: 0 };
  const ed = makeEditor({ ...floor, furniture: [...floor.furniture, free] }, { hass: { areas: {}, states: {} } });
  const stub = { addEventListener() {}, click() {}, value: "" };
  const render = (id) => {
    const el = { innerHTML: "", querySelector: () => stub, querySelectorAll: () => [] };
    ed.sel = { kind: "furniture", id };
    ed._furnitureProps(el, ed.sel, propsUi(ed, el));
    return el.innerHTML;
  };
  const html = render(a.id);
  assert.ok(!/data-num="rotation"|data-num="mount_y"|class="pad"|data-nudge|data-rot=/.test(html), "eingebaut: keine Drehung, Höhe, Steuerkreuz");
  assert.match(html, /sitzt im Schrank/);
  assert.match(html, /data-m="entity"/, "Entität bleibt wählbar");
  for (const id of [c.id, "frei"]) {
    const h = render(id);
    assert.match(h, /data-num="rotation"/, id);
    assert.match(h, /data-num="mount_y"/, id);
    assert.match(h, /class="pad"/, id);
  }
});

