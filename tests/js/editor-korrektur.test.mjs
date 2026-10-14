// Editor (Mixins ohne DOM an einem nachgebauten FloorEditor): Randstein-Linie und Zaun verschieben (Pfeiltasten und
// Ziehen nehmen die Mittellinie mit), Gerät platzieren führt 3D und Entwurf nach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FloorEditor } from "../../custom_components/haus3d/frontend/editor.js";
import { offsetPolyline } from "../../custom_components/haus3d/frontend/edit-ops.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function lineArea(id, type, pts, width) {
  return { id, type, points: offsetPolyline(pts, width), line: { points: pts, width } };
}

function makeEditor({ outdoor = [], placements = [] } = {}) {
  const eg = { id: "eg", name: "EG", elevation: 0, height: 2.6, rooms: [{ id: "k", name: "Küche", points: rect(0, 0, 4, 3) }], furniture: [], outdoor, placements, nodes: [], pipes: [], openings: [], walls: [] };
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
    calls: { sync3d: 0, draft: 0 },
    props: { querySelector: () => null },
    render() {},
    renderBar() {},
    renderProps() {},
    _sync3d() {
      this.calls.sync3d++;
    },
    _queueDraft() {
      this.calls.draft++;
    },
    _updateTouch() {},
    _houseGuard() {},
    _toast(t) {
      this.toasts.push(t);
    },
  });
  return ed;
}

test("Pfeiltasten: Randstein-Linie und Zaun wandern samt Mittellinie, die Fläche springt nicht zurück", () => {
  for (const type of ["kerb", "fence"]) {
    const area = lineArea("l1", type, [[1, 5], [5, 5], [5, 8]], 0.1);
    const ed = makeEditor({ outdoor: [area] });
    ed.sel = { kind: "outdoor", id: "l1" };
    ed.nudge(0.5, -0.25);
    const o = ed.floor.outdoor[0];
    assert.deepEqual(o.line.points, [[1.5, 4.75], [5.5, 4.75], [5.5, 7.75]], type);
    assert.deepEqual(o.points, offsetPolyline(o.line.points, o.line.width), `${type}: Fläche aus der verschobenen Mittellinie`);
    assert.equal(o.line.width, 0.1);
    // editor-lines.js rechnet die Fläche bei jeder Änderung aus der Mittellinie neu: sie bleibt, wo sie ist
    assert.deepEqual(offsetPolyline(o.line.points, 0.1), o.points);
  }
});

test("Ziehen im Plan: Randstein-Linie wandert samt Mittellinie, normale Flächen wie bisher", () => {
  const kerb = lineArea("k1", "kerb", [[1, 5], [5, 5]], 0.08);
  const lawn = { id: "r1", type: "lawn", points: rect(10, 0, 14, 4) };
  const ed = makeEditor({ outdoor: [kerb, lawn] });
  for (const [id, expected] of [["k1", [[2, 5.5], [6, 5.5]]], ["r1", null]]) {
    ed.sel = { kind: "outdoor", id };
    const drag = { mode: "outdoor", id, start: [0, 0], first: true };
    ed._moveDrag(drag, { clientX: 0, clientY: 0, buttons: 1 }, [1, 0.5]);
    ed._moveDrag(drag, { clientX: 0, clientY: 0, buttons: 1 }, [1, 0.5]); // zweiter Schritt ohne Bewegung ändert nichts
    const o = ed.floor.outdoor.find((x) => x.id === id);
    if (expected) {
      assert.deepEqual(o.line.points, expected);
      assert.deepEqual(o.points, offsetPolyline(expected, 0.08));
    } else {
      assert.deepEqual(o.points[0], [11, 0.5]);
      assert.equal("line" in o, false);
    }
  }
  assert.equal(ed.undoStack.length, 2, "ein Rückgängig-Schritt je Zug");
});

test("Gerät platzieren und ziehen: 3D-Ansicht und Entwurf werden nachgeführt", () => {
  const ed = makeEditor();
  ed._placeDevice("light.decke", [1.02, 2.01]);
  assert.deepEqual(ed.floor.placements.map((p) => [p.entity_id, p.x, p.z]), [["light.decke", 1, 2]]);
  assert.deepEqual(ed.calls, { sync3d: 1, draft: 1 });
  assert.equal(ed.dirty, true);
  // Ziehen: weitere Schritte verschmelzen zu einem Rückgängig-Schritt, 3D und Entwurf laufen weiter mit
  ed._placeDevice("light.decke", [2, 2], true);
  ed._placeDevice("light.decke", [3, 2], true);
  assert.deepEqual(ed.calls, { sync3d: 3, draft: 3 });
  assert.equal(ed.undoStack.length, 1);
  assert.equal(ed.floor.placements[0].x, 3);
});
