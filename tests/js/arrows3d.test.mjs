import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import {
  AXES, AXIS_DIR, AXIS_LABEL, COORD, FLAT, applyAxis, arrowAnchor, axisFacing, axisParam, axisValue, hint3d, orbitButtons, viewOnly,
} from "../../custom_components/haus3d/frontend/arrows3d.js";
import { AxisArrows, liveTarget, moveLive, targetObject } from "../../custom_components/haus3d/frontend/scene-arrows.js";
import { ScenePipes } from "../../custom_components/haus3d/frontend/scene-pipes.js";
import { SceneFx } from "../../custom_components/haus3d/frontend/scene-fx.js";
import { NODE_BODY, nodeBaseY } from "../../custom_components/haus3d/frontend/pipenodes.js";
import { buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const M = furnitureMaterials("standard");

const FLOOR = {
  id: "eg",
  elevation: 0,
  height: 2.5,
  furniture: [
    { id: "m_sofa", type: "sofa", x: 2, z: 3, rotation: 0 },
    { id: "m_wl", type: "lamp_wall", x: 1, z: 0.1 },
    { id: "m_dl", type: "lamp_ceiling", x: 2, z: 2 },
    { id: "m_col", type: "column", x: 4, z: 4 },
    { id: "m_st", type: "stairs", x: 5, z: 1 },
    { id: "m_sw", type: "stairwell", x: 6, z: 1 },
    { id: "m_pk", type: "parking", x: -5, z: 1 },
    { id: "m_up", type: "sofa", x: 1, z: 1, mount_y: 0.4 },
    { id: "m_x", type: "unbekannt", x: 0, z: 0 },
    { id: "m_bad", type: "sofa", z: 0 },
  ],
  pipes: [{ id: "p1", type: "strom", points: [[0, 5], [4, 5]], heights: [2.45, 2.45] }],
  nodes: [
    { id: "n_hv", kind: "hv", x: 1, z: 0.06 },
    { id: "n_ab", kind: "abzweig", x: 8, z: 8 },
    { id: "n_ab2", kind: "abzweig", x: 2, z: 5 },
    { id: "n_du", kind: "durch", x: 3, z: 3 },
    { id: "n_uv", kind: "uv", x: 2, z: 0.06, y: 1.5 },
    { id: "n_kw", kind: "kraftwerk", x: 0, z: 0 },
    { id: "n_bad", kind: "hv", x: NaN, z: 0 },
  ],
};
const F = (id) => ({ kind: "furniture", id });
const N = (id) => ({ kind: "pnode", id });

test("axisParam: nächster Punkt zwischen Achse und Zeigerstrahl", () => {
  assert.equal(axisParam([0, 1, 0], [1, 0, 0], [2, 5, 0], [0, -1, 0]), 2);
  assert.ok(near(axisParam([0, 1, 0], [1, 0, 0], [3, 1, 10], [0, 0, -1]), 3));
  // Strahl nicht normiert, Punkte als Vector3
  assert.ok(near(axisParam(new THREE.Vector3(0, 1, 0), AXIS_DIR.x, new THREE.Vector3(2, 5, 0), new THREE.Vector3(0, -2, 0)), 2));
  // Höhen-Achse
  assert.ok(near(axisParam([1, 0.5, 1], AXIS_DIR.y, [6, 2, 1], [-1, 0, 0]), 1.5));
  // hinter der Kamera, parallel, zu weit, kaputt
  assert.equal(axisParam([0, 1, 0], [1, 0, 0], [2, 5, 0], [0, 1, 0]), null);
  assert.equal(axisParam([0, 1, 0], [1, 0, 0], [2, 5, 0], [1, 0, 0]), null);
  assert.equal(axisParam([0, 1, 0], [1, 0, 0], [2e4, 5, 0], [0, -1, 0]), null);
  assert.equal(axisParam([0, 1, 0], [1, 0, 0], [2, 5, 0], [0, 0, 0]), null);
  assert.equal(axisParam([0, NaN, 0], [1, 0, 0], [2, 5, 0], [0, -1, 0]), null);
});

test("axisValue: Raster, Höhe höchstens 5 cm, frei 1 cm, Grenzen", () => {
  assert.equal(axisValue("x", 1, 0.234), 1.25);
  assert.equal(axisValue("x", 0.1, 0.2), 0.3);
  // grobes Raster: x/z im Raster, Höhe in 5-cm-Schritten
  assert.equal(axisValue("x", 1, 0.234, { grid: 0.5 }), 1);
  assert.equal(axisValue("z", 1, 0.3, { grid: 0.5 }), 1.5);
  assert.equal(axisValue("y", 1, 0.234, { grid: 0.5 }), 1.25);
  assert.equal(axisValue("y", 1, 0.234, { grid: 0.01 }), 1.23);
  assert.equal(axisValue("x", 1, 0.234, { grid: 0.5, free: true }), 1.23);
  assert.equal(axisValue("y", 1, 0.234, { free: true }), 1.23);
  for (const grid of [0, -1, NaN, undefined]) assert.equal(axisValue("x", 1, 0.234, { grid }), 1.25, String(grid));
  // Grenzen
  assert.equal(axisValue("x", 999, 5), COORD);
  assert.equal(axisValue("z", -999, -5), -COORD);
  assert.equal(axisValue("y", 0.2, -1), 0);
  assert.equal(axisValue("y", 10, 30), 20);
  assert.equal(axisValue("y", 1, 5, { max: 2.5 }), 2.5);
  assert.equal(axisValue("y", 1, 50, { max: 99 }), 20);
  assert.equal(axisValue("y", 1, 50, { max: NaN }), 20);
  // nicht endlich: bleibt beim Start
  assert.equal(axisValue("x", 1.2, NaN), 1.2);
  assert.equal(axisValue("x", NaN, NaN), 0);
});

test("axisFacing: Arm zur Kamera", () => {
  assert.equal(axisFacing([0, 1, 0], [0, -1, 0]), 1);
  assert.equal(axisFacing([1, 0, 0], [0, -1, 0]), 0);
  assert.ok(near(axisFacing(AXIS_DIR.y, new THREE.Vector3(0, -1, -1)), Math.SQRT1_2));
  assert.equal(axisFacing([0, 1, 0], [0, 0, 0]), 0);
  assert.equal(axisFacing([0, 1, 0], [NaN, 0, 0]), 0);
});

test("Konstanten: Achsen, Farben, Namen", () => {
  assert.deepEqual(AXES.map((a) => a[0]), ["x", "y", "z"]);
  assert.deepEqual(AXES.map((a) => a[2]), [0xe53935, 0x43a047, 0x1e88e5]);
  assert.deepEqual(AXIS_DIR, { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
  assert.equal(AXIS_LABEL.y, "Höhe über Boden");
  assert.deepEqual([...FLAT].sort(), ["parking", "stairs", "stairwell"]);
});

test("arrowAnchor: Möbel (Boden, Wand, Decke, flach, bis zur Decke)", () => {
  assert.deepEqual(arrowAnchor(FLOOR, F("m_sofa")), { x: 2, z: 3, y: 0.425, base: 0, max: 20, axes: "xyz" });
  const wl = arrowAnchor(FLOOR, F("m_wl"));
  assert.ok(near(wl.base, 1.6) && near(wl.y, 1.725) && wl.axes === "xyz");
  const dl = arrowAnchor(FLOOR, F("m_dl"));
  assert.ok(near(dl.base, 2.37, 1e-9) && near(dl.y, 2.43, 1e-9), JSON.stringify(dl));
  assert.ok(near(arrowAnchor({ ...FLOOR, height: 3 }, F("m_dl")).base, 2.87, 1e-9));
  // Säule bis zur Decke, Treppe, Treppenloch, Stellplatz: nur x/z
  const col = arrowAnchor(FLOOR, F("m_col"));
  assert.deepEqual([col.axes, col.base, col.y], ["xz", 0, 1.25]);
  for (const id of ["m_st", "m_sw", "m_pk"]) assert.equal(arrowAnchor(FLOOR, F(id)).axes, "xz", id);
  const up = arrowAnchor(FLOOR, F("m_up"));
  assert.ok(near(up.base, 0.4) && near(up.y, 0.825));
  const unk = arrowAnchor(FLOOR, F("m_x"));
  assert.deepEqual([unk.y, unk.axes], [0.4, "xyz"]);
});

test("arrowAnchor: Verteiler, Abzweigdose, Durchführung, null-Fälle", () => {
  // höchste Unterkante: Raumhöhe minus Gehäuse (0,9 m), damit der Verteiler unter der Decke bleibt
  assert.deepEqual(arrowAnchor(FLOOR, N("n_hv")), { x: 1, z: 0.06, y: 1.35, base: 0.9, max: 1.6, axes: "xyz" });
  assert.equal(arrowAnchor({ ...FLOOR, height: 30 }, N("n_hv")).max, 19.1);
  assert.equal(arrowAnchor({ ...FLOOR, height: 0.5 }, N("n_hv")).max, 0);
  const ab = arrowAnchor(FLOOR, N("n_ab"));
  assert.ok(near(ab.base, 0.27) && near(ab.y, 0.3), JSON.stringify(ab));
  // Abzweigdose auf einer Stromleitung an der Decke
  assert.ok(near(arrowAnchor(FLOOR, N("n_ab2")).base, 2.42));
  assert.deepEqual(arrowAnchor(FLOOR, N("n_du")), { x: 3, z: 3, y: 1.25, base: 0, max: 2.5, axes: "xz" });
  const uv = arrowAnchor(FLOOR, N("n_uv"));
  assert.ok(near(uv.base, 1.5) && near(uv.y, 1.8));
  assert.deepEqual(arrowAnchor(FLOOR, N("n_kw")), { x: 0, z: 0, y: 0.1, base: 0, max: 2.3, axes: "xyz" });
  assert.ok(near(arrowAnchor(FLOOR, N("n_uv")).max, 1.9));
  for (const [floor, sel] of [
    [null, N("n_hv")],
    [FLOOR, null],
    [FLOOR, N("nix")],
    [FLOOR, F("nix")],
    [FLOOR, { kind: "room", id: "m_sofa" }],
    [FLOOR, N("n_bad")],
    [FLOOR, F("m_bad")],
    [{ id: "leer" }, N("n_hv")],
  ]) assert.equal(arrowAnchor(floor, sel), null, JSON.stringify(sel));
});

test("applyAxis: x/z ohne mount_y, Höhe als mount_y bzw. node.y, nichts zurück", () => {
  const f = structuredClone(FLOOR);
  const sofa = () => f.furniture.find((m) => m.id === "m_sofa");
  assert.equal(applyAxis(f, F("m_sofa"), "x", 2.5), undefined);
  assert.equal(applyAxis(f, F("m_sofa"), "z", 3.5), undefined);
  assert.deepEqual([sofa().x, sofa().z, "mount_y" in sofa()], [2.5, 3.5, false]);
  applyAxis(f, F("m_sofa"), "y", 0.45);
  assert.equal(sofa().mount_y, 0.45);
  // flach liegend und Durchführung: keine Höhe
  applyAxis(f, F("m_sw"), "y", 1);
  assert.equal("mount_y" in f.furniture.find((m) => m.id === "m_sw"), false);
  applyAxis(f, N("n_du"), "y", 1);
  assert.equal("y" in f.nodes.find((n) => n.id === "n_du"), false);
  const hv = f.nodes.find((n) => n.id === "n_hv");
  applyAxis(f, N("n_hv"), "y", 1.25);
  applyAxis(f, N("n_hv"), "x", 999.5);
  assert.deepEqual([hv.x, hv.y], [999.5, 1.25]);
  // höchstens Raumhöhe minus Gehäuse, nicht unter 0
  applyAxis(f, N("n_hv"), "y", 2.5);
  assert.equal(hv.y, 1.6);
  applyAxis(f, N("n_hv"), "y", -1);
  assert.equal(hv.y, 0);
  applyAxis(f, F("m_sofa"), "y", 25);
  assert.equal(sofa().mount_y, 20);
  // ungültig: nichts ändern
  applyAxis(f, N("n_hv"), "x", NaN);
  applyAxis(f, N("n_hv"), "w", 3);
  applyAxis(f, N("nix"), "x", 3);
  assert.deepEqual([hv.x, hv.w], [999.5, undefined]);
});

test("viewOnly und orbitButtons (Werte wie THREE.MOUSE)", () => {
  assert.equal(viewOnly({ ctrlKey: true }), true);
  assert.equal(viewOnly({ metaKey: true }), true);
  assert.equal(viewOnly({}, { view: true }), true);
  assert.equal(viewOnly({ shiftKey: true }), false);
  assert.equal(viewOnly(undefined, undefined), false);
  const std = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  const swap = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  assert.deepEqual(orbitButtons(false, {}), std);
  assert.deepEqual(orbitButtons(true, {}), std);
  assert.deepEqual(orbitButtons(false, { shiftKey: true }), std);
  for (const k of ["ctrlKey", "metaKey", "shiftKey"]) assert.deepEqual(orbitButtons(true, { [k]: true }), swap, k);
});

test("hint3d: Texte für Dach, Nur Ansicht, Touch und Maus", () => {
  assert.equal(hint3d({ roof: true }), "3D: Ziehen dreht · rechte Maustaste schiebt · Rad zoomt");
  assert.equal(hint3d({ roof: true, coarse: true, view: true }), "3D: ein Finger dreht · zwei Finger schieben und zoomen");
  assert.equal(hint3d({ view: true }), "Nur Ansicht: Ziehen dreht · rechte Maustaste schiebt · Rad zoomt");
  assert.equal(hint3d({ view: true, coarse: true }), "Nur Ansicht: ein Finger dreht · zwei Finger schieben und zoomen");
  assert.equal(hint3d({ coarse: true }), "3D: Antippen wählt · Teil oder Pfeil ziehen verschiebt · leere Fläche dreht · „Nur Ansicht“: nur drehen und zoomen");
  assert.equal(hint3d({}), "3D: Möbel und Verteiler ziehen · Pfeile: rot X, blau Z, grün Höhe · leere Fläche dreht · Strg halten = nur Ansicht");
  assert.equal(hint3d({ mac: true }), "3D: Möbel und Verteiler ziehen · Pfeile: rot X, blau Z, grün Höhe · leere Fläche dreht · ⌘ halten = nur Ansicht");
  assert.equal(hint3d(), hint3d({}));
});

// ------------------------------------------------------------------ Szene (THREE in node, ohne Renderer)

function fakeScene({ w = 800, h = 600 } = {}) {
  const rect = { left: 10, top: 20, width: w, height: h };
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(45, w / h, 0.1, 500),
    root: new THREE.Group(),
    renders: 0,
    renderer: { domElement: { clientHeight: h, clientWidth: w, getBoundingClientRect: () => rect } },
    invalidate() {
      this.renders++;
    },
  };
}
const look = (cam, pos, target) => {
  cam.position.set(...pos);
  cam.lookAt(...target);
  cam.updateMatrixWorld();
};
const armPx = (arrows, axis) => {
  const a = arrows.screenPoint(axis, 0);
  const b = arrows.screenPoint(axis, 1);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};

test("AxisArrows: gleiche Bildschirmgröße bei jedem Abstand (±10 %)", () => {
  for (const [coarse, px] of [[false, 80], [true, 110]]) {
    const sc = fakeScene();
    const arrows = new AxisArrows(sc, { coarse });
    assert.equal(arrows.lenPx, px);
    assert.ok(sc.scene.children.includes(arrows.group) && !sc.root.children.includes(arrows.group));
    arrows.attach([0, 1, 0]);
    const scales = [];
    for (const d of [4, 12, 40]) {
      look(sc.camera, [0, 1 + d * 0.5, d], [0, 1, 0]);
      sc.scene.onBeforeRender(null, sc.scene, sc.camera, null); // wie beim Zeichnen
      const len = armPx(arrows, "x");
      assert.ok(Math.abs(len - px) <= px * 0.1, `${coarse} ${d}: ${len}`);
      scales.push(arrows.group.scale.x);
    }
    assert.ok(Math.abs(scales[2] / scales[0] - 10) < 0.2, String(scales));
    // schräg von der Seite: alle drei Arme sichtbar, keiner länger als lenPx
    look(sc.camera, [6, 5, 7], [0, 1, 0]);
    sc.scene.onBeforeRender(null, sc.scene, sc.camera, null);
    for (const k of ["x", "y", "z"]) {
      assert.equal(arrows.arms.get(k).arm.visible, true, k);
      assert.ok(armPx(arrows, k) <= px * 1.1 && armPx(arrows, k) > px * 0.3, k);
    }
    arrows.dispose();
  }
});

test("AxisArrows: Treffer je Arm, Y-Arm von oben aus, nur x/z", () => {
  const sc = fakeScene();
  const arrows = new AxisArrows(sc);
  assert.equal(arrows.hit(400, 300), null); // noch nicht gezeigt
  look(sc.camera, [6, 5, 7], [0, 1, 0]);
  arrows.attach([0, 1, 0]);
  for (const k of ["x", "y", "z"]) {
    const p = arrows.screenPoint(k, 0.6);
    assert.equal(arrows.hit(...p), k, k);
    const tip = arrows.screenPoint(k, 0.95);
    assert.equal(arrows.hit(...tip), k, `${k} Spitze`);
  }
  assert.equal(arrows.hit(15, 25), null);
  // Strahl entlang einer Achse
  const r = arrows.ray(...arrows.screenPoint("x", 0.5));
  const t = axisParam([0, 1, 0], AXIS_DIR.x, r.origin, r.direction);
  assert.ok(Math.abs(t - 0.5 * arrows.group.scale.x) < 1e-3, String(t));
  // von oben: Höhen-Pfeil zeigt in die Kamera und ist aus
  look(sc.camera, [0, 15, 0.01], [0, 1, 0]);
  sc.scene.onBeforeRender(null, sc.scene, sc.camera, null);
  assert.equal(arrows.arms.get("y").arm.visible, false);
  assert.equal(arrows.arms.get("x").arm.visible, true);
  assert.equal(arrows.screenPoint("y"), null);
  assert.equal(arrows.hit(...arrows.screenPoint("x")), "x");
  // nur x/z (flach, Durchführung)
  look(sc.camera, [6, 5, 7], [0, 1, 0]);
  arrows.attach([1, 0.5, 1], { axes: "xz" });
  assert.deepEqual([...arrows.arms].map(([k, a]) => [k, a.arm.visible]), [["x", true], ["y", false], ["z", true]]);
  assert.deepEqual(arrows.group.position.toArray(), [1, 0.5, 1]);
  // ungültige Lage wird ignoriert
  arrows.setPosition([NaN, 0, 0]);
  assert.deepEqual(arrows.group.position.toArray(), [1, 0.5, 1]);
  arrows.detach();
  assert.equal(arrows.group.visible, false);
  assert.equal(arrows.screenPoint("x"), null);
  assert.equal(arrows.hit(...[400, 300]), null);
  arrows.dispose();
});

test("AxisArrows: Hook-Kette, hover, dim, Rahmen, dispose", () => {
  const sc = fakeScene();
  const calls = [];
  const prev = function (...a) {
    calls.push([this, ...a]);
  };
  sc.scene.onBeforeRender = prev;
  const arrows = new AxisArrows(sc);
  look(sc.camera, [6, 5, 7], [0, 1, 0]);
  arrows.attach([0, 1, 0]);
  const s0 = arrows.group.scale.x;
  look(sc.camera, [12, 9, 14], [0, 1, 0]);
  sc.scene.onBeforeRender("r", sc.scene, sc.camera, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], sc.scene);
  assert.equal(calls[0][1], "r");
  assert.equal(calls[0][3], sc.camera);
  assert.ok(arrows.group.scale.x > s0 * 1.5);
  // hover gelb, zurück zur eigenen Farbe
  const col = (k) => arrows.arms.get(k).mat.color.getHex();
  arrows.hover("x");
  assert.deepEqual([col("x"), col("y"), col("z")], [0xffd600, 0x43a047, 0x1e88e5]);
  arrows.hover("z");
  assert.deepEqual([col("x"), col("z")], [0xe53935, 0xffd600]);
  arrows.hover(null);
  assert.equal(col("z"), 0x1e88e5);
  // abblenden
  arrows.dim(true);
  assert.ok([...arrows.arms.values()].every((a) => a.mat.opacity === 0.35));
  arrows.dim(false);
  assert.ok([...arrows.arms.values()].every((a) => a.mat.opacity === 0.95 && a.mat.depthTest === false && a.mat.transparent));
  // Rahmen um einen Verteiler, folgt beim Verschieben
  const obj = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.16));
  obj.position.set(2, 1.35, 2);
  sc.scene.add(obj);
  arrows.attach([2, 1.35, 2], { outline: obj });
  const box = () => sc.scene.children.filter((c) => c.type === "BoxHelper");
  assert.equal(box().length, 1);
  assert.equal(box()[0].object, obj);
  assert.equal(box()[0].material.depthTest, false);
  obj.position.x = 3;
  arrows.setPosition([3, 1.35, 2]);
  box()[0].geometry.computeBoundingBox();
  assert.ok(near(box()[0].geometry.boundingBox.min.x, 2.7, 1e-6));
  arrows.attach([3, 1.35, 2], { outline: obj });
  assert.equal(box().length, 1);
  arrows.attach([0, 1, 0]);
  assert.equal(box().length, 0);
  arrows.attach([2, 1.35, 2], { outline: obj });
  arrows.detach();
  assert.equal(box().length, 0);
  // dispose: Hook zurück, Gruppe weg
  arrows.dispose();
  assert.equal(sc.scene.onBeforeRender, prev);
  assert.ok(!sc.scene.children.includes(arrows.group));
  // ohne eigenen Hook: wieder die Methode des Prototyps
  const sc2 = fakeScene();
  const a2 = new AxisArrows(sc2);
  assert.ok(Object.hasOwn(sc2.scene, "onBeforeRender"));
  sc2.scene.onBeforeRender(null, sc2.scene, sc2.camera, null);
  a2.dispose();
  assert.equal(Object.hasOwn(sc2.scene, "onBeforeRender"), false);
  assert.equal(sc2.scene.onBeforeRender, THREE.Object3D.prototype.onBeforeRender);
});

/** contactTexture braucht ein Canvas: in node ein kleiner Ersatz. */
function withDocument(fn) {
  const had = "document" in globalThis;
  const old = globalThis.document;
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: null };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    return fn();
  } finally {
    if (had) globalThis.document = old;
    else delete globalThis.document;
  }
}

function furnScene() {
  const floor = {
    id: "eg",
    elevation: 0,
    height: 2.5,
    furniture: [
      { id: "m_desk", type: "desk", x: 1, z: 1 },
      { id: "m_lamp", type: "lamp_table", x: 1.2, z: 1, mount_y: 0.75 },
      { id: "m_sofa", type: "sofa", x: 4, z: 2, rotation: 30 },
    ],
  };
  const group = new THREE.Group();
  const garden = new THREE.Group();
  const furn = new THREE.Group();
  furn.userData.layer = "furniture";
  group.add(furn);
  for (const item of floor.furniture) furn.add(buildFurniture(item, M, 0, 2.5));
  const root = new THREE.Group();
  root.add(group, garden);
  const sc = { root, floors: new Map([["eg", { floor, group, garden }]]), quality: {}, style: "standard", renders: 0, invalidate() { this.renders++; } };
  withDocument(() => SceneFx._contactShadows.call(sc));
  return sc;
}
const blobsOf = (sc, id) => {
  const out = [];
  sc.root.traverse((o) => o.userData.blob && o.userData.blobOf === id && out.push(o));
  return out;
};

test("Kontaktschatten: blobOf, im eigenen Rahmen gemessen und mitgedreht", () => {
  const sc = furnScene();
  assert.equal(blobsOf(sc, "m_desk").length, 1);
  assert.equal(blobsOf(sc, "m_lamp").length, 0); // steht auf dem Schreibtisch, nicht auf dem Boden
  const [b] = blobsOf(sc, "m_sofa");
  const sofa = targetObject(sc, F("m_sofa"));
  assert.ok(near(b.rotation.y, sofa.rotation.y) && near(sofa.rotation.y, -Math.PI / 6));
  // schmal wie das Sofa (2,1 × 0,9), nicht wie dessen schräger Umriss
  assert.ok(b.scale.x > 2.6 && b.scale.x < 3, String(b.scale.x));
  assert.ok(b.scale.z > 1.1 && b.scale.z < 1.5, String(b.scale.z));
  assert.ok(Math.hypot(b.position.x - 4, b.position.z - 2) < 0.15, b.position.toArray().join());
  assert.ok(b.position.y > 0 && b.position.y < 0.05);
  // Drehung wurde nach dem Messen zurückgesetzt
  assert.ok(near(new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().extractRotation(sofa.matrixWorld)).y, -Math.PI / 6, 1e-6));
});

test("targetObject, liveTarget, moveLive: Möbel, Schatten über blobOf, Lampe auf dem Schreibtisch", () => {
  const sc = furnScene();
  const desk = targetObject(sc, F("m_desk"));
  const lamp = targetObject(sc, F("m_lamp"));
  assert.equal(desk.userData.furniture, "m_desk");
  assert.notEqual(desk.parent.userData.furniture, "m_desk");
  assert.equal(targetObject(sc, F("nix")), null);
  assert.equal(targetObject(sc, { kind: "room", id: "m_desk" }), null);
  assert.equal(targetObject(null, F("m_desk")), null);

  const liveLamp = liveTarget(sc, F("m_lamp"));
  assert.equal(liveLamp.obj, lamp);
  assert.equal(liveLamp.blobs.length, 0);
  const live = liveTarget(sc, F("m_desk"));
  assert.equal(live.obj, desk);
  assert.equal(live.blobs.length, 1);
  const blob = live.blobs[0].o;
  const b0 = blob.position.clone();
  const l0 = lamp.position.clone();
  // Mark-Rahmen folgt
  sc._mark = new THREE.BoxHelper(desk, 0x03a9f4);
  const r0 = sc.renders;
  assert.equal(moveLive(sc, live, [1, 0.5, -2]), true);
  assert.deepEqual(desk.position.toArray(), [2, 0.5, -1]);
  assert.ok(near(blob.position.x, b0.x + 1) && near(blob.position.z, b0.z - 2) && blob.position.y === b0.y);
  assert.deepEqual(lamp.position.toArray(), l0.toArray());
  sc._mark.geometry.computeBoundingBox();
  assert.ok(Math.abs((sc._mark.geometry.boundingBox.min.x + sc._mark.geometry.boundingBox.max.x) / 2 - 2) < 0.05);
  assert.ok(sc.renders > r0);
  // zurück auf den Start
  moveLive(sc, live, [0, 0, 0]);
  assert.deepEqual(desk.position.toArray(), [1, 0, 1]);
  assert.ok(blob.position.equals(b0));

  // Drehung: Schatten dreht mit, Abstand zur Mitte bleibt
  const ls = liveTarget(sc, F("m_sofa"));
  const sb = ls.blobs[0].o;
  const off0 = Math.hypot(sb.position.x - ls.p0.x, sb.position.z - ls.p0.z);
  moveLive(sc, ls, [0.5, 0, 0], 120);
  assert.ok(near(ls.obj.rotation.y, -(120 * Math.PI) / 180));
  assert.ok(near(sb.rotation.y, -(120 * Math.PI) / 180));
  assert.ok(near(Math.hypot(sb.position.x - ls.obj.position.x, sb.position.z - ls.obj.position.z), off0, 1e-9));
  // ohne Drehwert bleibt die Startdrehung
  moveLive(sc, ls, [0, 0, 0]);
  assert.ok(near(ls.obj.rotation.y, -Math.PI / 6) && near(sb.rotation.y, -Math.PI / 6));
  // null-sicher
  assert.equal(moveLive(sc, null, [1, 0, 0]), false);
  assert.equal(moveLive(sc, liveTarget(sc, F("nix")), [1, 0, 0]), false);
  assert.equal(moveLive(null, liveTarget(sc, F("m_desk")), [NaN, undefined, 1]), true);
  assert.deepEqual(desk.position.toArray(), [1, 0, 2]);
});

test("Verteiler-Modelle: Unterkante = nodeBaseY für alle Arten, ohne NaN", () => {
  const FACES = [{ p: [0, 0], u: [1, 0], n: [0, 1], t0: 0, t1: 4 }];
  const floor = { id: "eg", height: 2.5, pipes: [{ id: "p1", type: "strom", points: [[0, 1], [3, 1]], heights: [2.45, 2.45] }], nodes: [] };
  const box = new THREE.Box3();
  let count = 0;
  for (const kind of Object.keys(NODE_BODY)) {
    for (const extra of [{}, { y: 1.5 }, { rotation: 90 }]) {
      for (const [x, z, faces] of [[2, 3, []], [1.5, 1, []], [2, 0.06, FACES]]) {
        const n = { id: `n_${kind}`, kind, x, z, ...extra };
        const obj = ScenePipes._buildPipeNode.call({ furnMats: M }, n, 0, floor, faces);
        assert.ok(obj, kind);
        obj.updateMatrixWorld(true);
        box.setFromObject(obj);
        const vals = [...box.min.toArray(), ...box.max.toArray()];
        assert.ok(vals.every(Number.isFinite), `${kind} ${vals}`);
        const base = nodeBaseY(n, floor);
        assert.ok(near(box.min.y, base, 1e-6), `${kind} ${JSON.stringify(extra)} (${x},${z}): ${box.min.y} ≠ ${base}`);
        const B = NODE_BODY[kind];
        if (B.h != null) assert.ok(box.max.y <= base + B.h + 0.01, kind);
        count++;
      }
    }
  }
  assert.equal(count, Object.keys(NODE_BODY).length * 9);
  // Abzweigdose auf der Stromleitung an der Decke
  assert.ok(near(nodeBaseY({ kind: "abzweig", x: 1.5, z: 1 }, floor), 2.42));
  // ohne Modell: nichts
  assert.equal(ScenePipes._buildPipeNode.call({ furnMats: M }, { id: "n", kind: "hv", x: 0, z: 0, model: false }, 0, floor, []), null);
  assert.equal(ScenePipes._buildPipeNode.call({ furnMats: M }, { id: "n", kind: "kraftwerk", x: 0, z: 0 }, 0, floor, []), null);
});

function pipeScene() {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  const scene = new THREE.Scene();
  const sc = Object.assign(
    {
      furnMats: M,
      layers: {},
      filter: "all",
      floors: new Map(),
      fingerPx: 30,
      camera: new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 500),
      renderer: { domElement: { getBoundingClientRect: () => rect } },
      isFloorVisible(id) {
        return this.filter === "all" || this.filter === id;
      },
    },
    ScenePipes,
  );
  const floor = {
    id: "eg",
    elevation: 0,
    height: 2.5,
    pipes: [],
    nodes: [
      { id: "n_hv", kind: "hv", x: 0, z: 0 },
      { id: "n_r", kind: "router", x: 3, z: 0 },
      { id: "n_off", kind: "uv", x: 1, z: 1, model: false },
    ],
  };
  const entry = { floor, group: new THREE.Group(), garden: new THREE.Group() };
  sc.floors.set("eg", entry);
  scene.add(entry.group, entry.garden);
  sc._buildPipes(floor, entry, 0, []);
  look(sc.camera, [1.5, 1.5, 6], [1.5, 1, 0]);
  scene.updateMatrixWorld(true);
  sc.root = entry.group;
  return { sc, scene, entry };
}
const toScreen = (sc, v) => {
  const p = v.clone().project(sc.camera);
  return [(p.x * 0.5 + 0.5) * 800, (-p.y * 0.5 + 0.5) * 600];
};
const centerOf = (obj) => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());

test("pickNode: direkter Treffer, knapp daneben, Möbel davor, Ebenen", () => {
  const { sc, scene, entry } = pipeScene();
  assert.equal(sc._pipeNodes.size, 2); // ohne Modell kein Gegenstand
  const hv = sc._pipeNodes.get("n_hv").obj;
  const router = sc._pipeNodes.get("n_r").obj;
  const c = toScreen(sc, centerOf(hv));
  assert.deepEqual(sc.pickNode(...c), { id: "n_hv", direct: true });
  // knapp unter dem flachen Router: kein direkter Treffer, aber nah genug
  const box = new THREE.Box3().setFromObject(router);
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) maxY = Math.max(maxY, toScreen(sc, new THREE.Vector3(x, y, z))[1]);
  const rc = toScreen(sc, centerOf(router));
  const below = [rc[0], maxY + 3];
  assert.ok(below[1] - rc[1] < 14, String(below[1] - rc[1]));
  assert.deepEqual(sc.pickNode(...below), { id: "n_r", direct: false });
  assert.equal(sc.pickNode(...below, 2), null);
  assert.equal(sc.pickNode(5, 5), null);
  // Möbelstück vor dem Verteiler: nicht direkt
  const front = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2));
  front.position.set(0.375, 1.39, 1.5);
  front.userData.furniture = "m_schrank";
  entry.group.add(front);
  scene.updateMatrixWorld(true);
  assert.deepEqual(sc.pickNode(...c), { id: "n_hv", direct: false });
  front.userData.blob = true; // Kontaktschatten zählen nicht
  assert.deepEqual(sc.pickNode(...c), { id: "n_hv", direct: true });
  front.userData.blob = false;
  front.visible = false;
  assert.deepEqual(sc.pickNode(...c), { id: "n_hv", direct: true });
  // Ebenen und Etagen
  sc.layers = { pipes: false };
  assert.equal(sc.pickNode(...c), null);
  sc.layers = { flow: false };
  assert.equal(sc.pickNode(...c), null);
  sc.layers = {};
  sc.filter = "og";
  assert.equal(sc.pickNode(...c), null);
  sc.filter = "all";
  sc._pipeNodes.get("n_hv").obj.parent.visible = false;
  assert.equal(sc.pickNode(...c), null);
});

test("pickPipe: Verteiler auch ohne Leitungen; liveTarget dreht Verteiler (K12)", () => {
  const { sc } = pipeScene();
  assert.equal(sc._pipes.size, 0);
  const hv = sc._pipeNodes.get("n_hv").obj;
  assert.deepEqual(sc.pickPipe(...toScreen(sc, centerOf(hv))), { pipeNode: "n_hv" });
  sc.layers = { pipes: false };
  assert.equal(sc.pickPipe(...toScreen(sc, centerOf(hv))), null);
  sc.layers = {};
  sc._pipeNodes.clear();
  assert.equal(sc.pickPipe(400, 300), null);
  assert.equal(sc.pickNode(400, 300), null);
  // Live-Vorschau eines Verteilers mit gespeicherter Drehung
  const { sc: sc2 } = pipeScene();
  const live = liveTarget(sc2, N("n_hv"));
  assert.equal(live.obj, sc2._pipeNodes.get("n_hv").obj);
  assert.deepEqual(live.blobs, []);
  moveLive(sc2, live, [0.5, 0, 0], 90);
  assert.ok(near(live.obj.rotation.y, -Math.PI / 2));
  assert.ok(near(live.obj.position.x, 0.5));
  assert.equal(targetObject(sc2, N("n_off")), null);
});
