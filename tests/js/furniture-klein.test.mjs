// Sehr kleine Maße dürfen keine NaN-Geometrie ergeben (ein einziger NaN-Punkt bringt die Schatten der ganzen Szene
// durcheinander): alle Möbeltypen mit Breite/Tiefe/Höhe 0,02 und 0,05 m bauen, jede Position und jede Box muss endlich sein.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { FURNITURE, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";

const M = furnitureMaterials("standard");

/** Erster Verstoß (Beschreibung) oder null: NaN/Infinity in Positionen, Matrizen oder der Hülle. */
function problem(obj) {
  let bad = null;
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (bad) return;
    if (![...o.position.toArray(), ...o.scale.toArray(), o.rotation.x, o.rotation.y, o.rotation.z].every(Number.isFinite)) bad = `Transform von ${o.name || o.type}`;
    const pos = o.geometry?.attributes?.position;
    if (pos && !pos.array.every(Number.isFinite)) bad = `Eckpunkte von ${o.name || o.type}`;
  });
  if (bad) return bad;
  const box = new THREE.Box3().setFromObject(obj);
  return box.isEmpty() || [box.min, box.max].every((p) => p.toArray().every(Number.isFinite)) ? null : "Hülle";
}

for (const size of [0.001, 0.01, 0.02, 0.05, 0.1]) {
  test(`Alle Möbeltypen mit ${size} m Breite, Tiefe und Höhe: keine NaN-Geometrie`, () => {
    const failures = [];
    for (const type of Object.keys(FURNITURE)) {
      for (const [w, d, h] of [[size, size, size], [size, 1, 1], [1, size, 1], [1, 1, size]]) {
        let g;
        try {
          g = buildFurniture({ id: "m", type, x: 1, z: 1, rotation: 0, w, d, h }, M, 0, 2.5);
        } catch (err) {
          failures.push(`${type} ${w}×${d}×${h}: Ausnahme ${err.message}`);
          continue;
        }
        const p = problem(g);
        if (p) failures.push(`${type} ${w}×${d}×${h}: ${p}`);
      }
    }
    assert.deepEqual(failures, []);
  });
}
