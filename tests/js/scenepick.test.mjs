// Antippen in der Hauptansicht: Wände verdecken, was dahinter liegt (scene-pick.js); Vorschau-Durchgang beenden (thumbs.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { hiddenBehind, inGarden, wallBlockers } from "../../custom_components/haus3d/frontend/scene-pick.js";
import { stopThumbs, thumbsBusy } from "../../custom_components/haus3d/frontend/thumbs.js";

/** Wand: Quader 6 m × 2,5 m × 0,3 m um z = 0, als Wand-Mesh der Ebene „walls“. */
function wall() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 0.3), new THREE.MeshBasicMaterial());
  m.position.set(0, 1.25, 0);
  m.userData.layer = "walls";
  m.updateMatrixWorld(true);
  return m;
}

function camera(x, y, z) {
  const c = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  c.position.set(x, y, z);
  c.lookAt(0, 1, 0);
  c.updateMatrixWorld(true);
  return c;
}

test("hiddenBehind: Punkt hinter der Wand ist verdeckt, davor und knapp vor der Fassade nicht", () => {
  const walls = [wall()];
  const cam = camera(0, 1.2, 10);
  assert.equal(hiddenBehind(cam, new THREE.Vector3(0, 0.5, -3.5), walls), true, "Whirlpool hinter dem Haus");
  assert.equal(hiddenBehind(cam, new THREE.Vector3(1, 1.5, -0.5), walls), true, "im Haus hinter der Vorderwand");
  assert.equal(hiddenBehind(cam, new THREE.Vector3(0, 0.5, 3), walls), false, "vor der Wand");
  assert.equal(hiddenBehind(cam, new THREE.Vector3(0, 0.6, 0.17), walls), false, "Gerät direkt an der Fassade (2 cm vor der Fläche)");
  assert.equal(hiddenBehind(cam, new THREE.Vector3(8, 0.5, -3.5), walls), false, "seitlich am Haus vorbei");
  assert.equal(hiddenBehind(cam, new THREE.Vector3(0, 0.5, -3.5), []), false, "ohne Wände");
  assert.equal(hiddenBehind(cam, cam.position.clone(), walls), false, "Punkt an der Kamera");
});

test("wallBlockers: Wand-Meshes aller Etagen, im Cyberpunk-Stil keine (durchsichtige Wände)", () => {
  const group = new THREE.Group();
  const a = wall();
  const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  other.userData.layer = "floors";
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  line.userData.layer = "walls"; // Neonkanten: keine Fläche
  group.add(a, other, line);
  const upper = new THREE.Group();
  const b = wall();
  upper.add(b);
  const scene = { style: "standard", floors: new Map([["eg", { group }], ["dg", { group: upper }]]) };
  assert.deepEqual(wallBlockers(scene), [a, b]);
  assert.deepEqual(wallBlockers({ ...scene, style: "night" }), [a, b]);
  assert.deepEqual(wallBlockers({ ...scene, style: "cyber" }), []);
});

test("inGarden: nur Meshes unter einer Gartengruppe", () => {
  const garden = new THREE.Group();
  garden.userData.layer = "garden";
  const inner = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  inner.add(tub);
  garden.add(inner);
  const room = new THREE.Group();
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  room.add(lamp);
  assert.equal(inGarden(tub), true);
  assert.equal(inGarden(lamp), false);
  assert.equal(inGarden(garden), false);
});

test("stopThumbs: ohne laufenden Durchgang nichts zu tun", () => {
  assert.equal(thumbsBusy(), false);
  assert.doesNotThrow(() => stopThumbs());
  assert.equal(thumbsBusy(), false);
});
