// Verdeckung der Beschriftungen (scene.js:occludedAll): Zielliste je Durchlauf einmal (je Etage), Ergebnis je Punkt wie
// occluded(); als Generator schrittweise abrufbar (Häppchen im Panel).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { HouseScene } from "../../custom_components/haus3d/frontend/scene.js";

const box = (w, h, d, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.position.set(x, y, z);
  m.updateMatrixWorld(true);
  return m;
};

/** Zwei Etagen (Decke des EG verdeckt Punkte im KG), Hausdach und ein Dach einer Einheit; Zugriffe werden gezählt. */
function fakeScene() {
  const sc = Object.create(HouseScene.prototype);
  sc.camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 200);
  sc.camera.position.set(0, 20, 0.001);
  sc.camera.lookAt(0, 0, 0);
  sc.camera.updateMatrixWorld(true);
  sc.raycaster = new THREE.Raycaster();
  sc.count = { occluders: 0, keys: 0 };
  const entry = (visible, meshes) => {
    const e = { group: { visible } };
    Object.defineProperty(e, "occluders", {
      get() {
        sc.count.occluders++;
        return meshes;
      },
    });
    return e;
  };
  sc.floors = new Map([
    ["kg", entry(true, [box(10, 0.2, 10, 0, -2.6, 0)])],
    ["eg", entry(true, [box(10, 0.2, 10, 0, 0, 0)])], // Decke über dem KG
    ["og", entry(false, [box(10, 0.2, 10, 0, 3, 0)])], // ausgeblendet: verdeckt nichts
  ]);
  sc.roofHolder = { visible: true };
  sc.layers = {};
  sc.roofMeshes = [box(3, 0.2, 3, 6, 5, 0)];
  sc.roofUnitMeshes = [{ key: "u1", mesh: box(3, 0.2, 3, -6, 5, 0) }, { key: "u1", mesh: box(3, 0.2, 3, -6, 5, 4) }, { key: "u2", mesh: box(3, 0.2, 3, 0, 5, 6) }]; // u2 verdeckte, wenn gezeigt
  sc.roofKeyShown = (key) => {
    sc.count.keys++;
    return key === "u1";
  };
  return sc;
}

const P = (x, y, z, floorId) => ({ position: new THREE.Vector3(x, y, z), floorId });
const POINTS = [
  P(0, -2, 0, "kg"), // unter der EG-Decke
  P(0, 0.5, 0, "eg"), // eigene Etage verdeckt nicht
  P(0, -2, 0, "eg"), // EG-Punkt unter der eigenen Decke: nicht verdeckt
  P(0, 2.5, 0, "og"), // OG ausgeblendet: frei
  P(6, 1, 0, "eg"), // unter dem Hausdach
  P(-6, 1, 0, "eg"), // unter der Einheit u1
  P(0, 1, 6, "eg"), // u2 nicht gezeigt
  P(6, 1, 0, null), // PV-Schild (ohne Etage): Dach verdeckt
  P(0, -2, 0, null), // ohne Etage: EG-Decke verdeckt
  P(30, 0, 30, "kg"), // außerhalb
];
const WANT = [true, false, false, false, true, true, false, true, true, false];

test("occludedAll: je Punkt wie occluded(), auch mit Dächern, Einheiten und ausgeblendeten Etagen", () => {
  const sc = fakeScene();
  const all = [...sc.occludedAll(POINTS)];
  assert.deepEqual(all, WANT);
  assert.deepEqual(POINTS.map((p) => sc.occluded(p.position, p.floorId)), WANT);
  // ohne Dach: nur die Etagen
  sc.roofHolder.visible = false;
  sc.roofUnitMeshes = [];
  assert.deepEqual([...sc.occludedAll(POINTS)], [true, false, false, false, false, false, false, false, true, false]);
  assert.deepEqual([...sc.occludedAll([])], []);
});

test("occludedAll: Zielliste einmal je Durchlauf (je Etage), nicht je Punkt", () => {
  const sc = fakeScene();
  const many = Array.from({ length: 50 }, (_, i) => POINTS[i % POINTS.length]);
  sc.count.occluders = 0;
  sc.count.keys = 0;
  const all = [...sc.occludedAll(many)];
  assert.deepEqual(all, many.map((_, i) => WANT[i % POINTS.length]));
  // vier verschiedene Etagen-Schlüssel (kg, eg, og, null) über zwei sichtbare Etagen: höchstens 4 × 2 Zugriffe, Dach-Schlüssel je Einheit einmal
  assert.ok(sc.count.occluders <= 8, `${sc.count.occluders} Zugriffe auf occluders`);
  assert.equal(sc.count.keys, 2);
  // einzeln geprüft: je Punkt neu
  sc.count.occluders = 0;
  for (const p of many) sc.occluded(p.position, p.floorId);
  assert.ok(sc.count.occluders >= 50);
});

test("occludedAll: Generator liefert schrittweise (Häppchen), Zielliste erst beim ersten Punkt", () => {
  const sc = fakeScene();
  sc.count.occluders = 0;
  const it = sc.occludedAll(POINTS);
  assert.equal(sc.count.occluders, 0); // noch nichts gebaut
  assert.deepEqual(it.next(), { value: true, done: false });
  assert.ok(sc.count.occluders > 0);
  const rest = [];
  for (let r = it.next(); !r.done; r = it.next()) rest.push(r.value);
  assert.deepEqual(rest, WANT.slice(1));
  assert.equal(it.next().done, true);
});
