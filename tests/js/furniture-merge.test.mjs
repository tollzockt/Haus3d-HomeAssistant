// Möbel zusammenführen (furniture-merge.js, Hauptansicht): gleiche Box, gleiche Dreiecke, Materialien und Kanten wie die
// einzelnen Teile; Ausnahmen bleiben einzeln.
import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { FURNITURE, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { keepWhole, mergeItem } from "../../custom_components/haus3d/frontend/furniture-merge.js";

const tris = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

/** Kennzahlen eines Stücks: Meshes, Dreiecke je Material, Kanten-Punkte, Box wie der Kontaktschatten (Drehung 0). */
function measure(g) {
  const perMat = new Map();
  let meshes = 0;
  let edgeVerts = 0;
  let lines = 0;
  g.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      perMat.set(o.material, (perMat.get(o.material) ?? 0) + tris(o.geometry));
    } else if (o.isLineSegments) {
      lines++;
      edgeVerts += o.geometry.attributes.position.count;
    }
  });
  const ry = g.rotation.y;
  g.rotation.y = 0;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  g.rotation.y = ry;
  g.updateMatrixWorld(true);
  return { meshes, perMat, edgeVerts, lines, box };
}

const near = (a, b) => Math.abs(a - b) < 1e-9;
const sameBox = (a, b) => ["x", "y", "z"].every((k) => near(a.min[k], b.min[k]) && near(a.max[k], b.max[k]));

test("Alle Typen, Stil Standard und Cyberpunk: Box, Dreiecke, Materialien und Kanten bleiben gleich", () => {
  const counts = {};
  for (const style of ["standard", "cyber"]) {
    const M = furnitureMaterials(style);
    let before = 0;
    let after = 0;
    for (const [type, [, w, d, h]] of Object.entries(FURNITURE)) {
      // gedreht wie im Plan: der Kontaktschatten misst bei Drehung 0 (scene-fx.js: _contactShadows)
      const item = { id: type, type, x: 1.5, z: -2, rotation: 37, w, d, h };
      const g = buildFurniture(item, M, 0.4, 2.5);
      const a = measure(g);
      const res = mergeItem(g, { edges: M.edge, item });
      const b = measure(g);
      assert.ok(sameBox(a.box, b.box), `${style}/${type}: Box ${JSON.stringify(a.box)} → ${JSON.stringify(b.box)}`);
      // Materialmenge (auch Material-Arrays, die einzeln bleiben) nach Identität
      assert.equal(b.perMat.size, a.perMat.size, `${style}/${type}: Materialien`);
      for (const [m, n] of a.perMat) assert.equal(b.perMat.get(m), n, `${style}/${type}: Dreiecke je Material`);
      assert.equal(b.edgeVerts, a.edgeVerts, `${style}/${type}: Kanten`);
      if (style === "standard") assert.equal(b.lines, a.lines, type); // ohne Kanten (nur der Drahtrahmen des Platzhalters)
      // jedes Teil kennt sein Möbelstück, die Gruppe bleibt an ihrem Platz
      g.traverse((o) => assert.equal(o.userData.furniture, item.id, `${style}/${type}: furniture`));
      assert.equal(g.position.x, 1.5);
      if (res) assert.deepEqual(res.meshes, [a.meshes, b.meshes], type);
      assert.ok(b.meshes <= a.meshes, type);
      before += a.meshes;
      after += b.meshes;
    }
    counts[style] = [before, after];
  }
  // Katalog gesamt (Spezifikation: 6.437 → 3.266; einige Modelle würfeln mit der ID)
  assert.deepEqual(counts.standard, [6437, 3266]);
  assert.deepEqual(counts.cyber, [6437, 3266]);
});

test("Zusammengeführte Geometrie: Box ist die Vereinigung der Teil-Boxen, Index vorhanden, keine Gruppen", () => {
  const M = furnitureMaterials("standard");
  // Futternäpfe: ohne vereinigte Box fiele der Kontaktschatten weg (Box nur aus den Ecken der Teile)
  for (const type of ["home_pet_bowls", "sofa", "tree", "server_rack", "bed"]) {
    if (!FURNITURE[type]) continue;
    const item = { id: type, type, x: 0, z: 0 };
    const g = buildFurniture(item, M, 0, 2.5);
    const parts = [];
    g.traverse((o) => o.isMesh && parts.push(o));
    const before = new Set(parts);
    mergeItem(g, { item });
    const merged = g.children.filter((o) => o.isMesh && !before.has(o));
    assert.ok(merged.length > 0, `${type}: nichts zusammengeführt`);
    for (const o of merged) {
      const geo = o.geometry;
      assert.ok(geo.boundingBox && geo.boundingSphere && geo.index, type);
      assert.equal(geo.groups.length, 0, type);
      assert.ok(o.matrix.equals(new THREE.Matrix4()) && o.position.lengthSq() === 0, type);
      // umfasst alle Punkte, ist aber die Vereinigung der Teil-Boxen (nicht enger)
      const exact = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
      assert.ok(geo.boundingBox.containsBox(exact.clone().expandByScalar(-1e-7)), `${type}: Box zu klein`);
      const union = new THREE.Box3();
      for (const p of parts) {
        if (p.parent || p.material !== o.material) continue; // entfernte Teile dieses Materials
        p.geometry.computeBoundingBox();
        const m = new THREE.Matrix4();
        for (let q = p; q && q !== g; q = q.parent) {
          q.updateMatrix();
          m.premultiply(q.matrix);
        }
        union.union(p.geometry.boundingBox.clone().applyMatrix4(m));
      }
      if (!union.isEmpty()) assert.ok(union.containsBox(geo.boundingBox), `${type}: Box größer als die Teile`);
    }
  }
});

test("Ausnahmen bleiben einzeln: Entität, eigenes Modell, Zustand, geneigt; Leuchtmittel, Glas und Heizrippen", () => {
  const M = furnitureMaterials("standard");
  const count = (g) => {
    let n = 0;
    g.traverse((o) => o.isMesh && n++);
    return n;
  };
  const whole = [
    { id: "a", type: "sofa", x: 0, z: 0, entity: "switch.test" },
    { id: "b", type: "custom_model", x: 0, z: 0 },
    { id: "c", type: "home_curtain_pair", x: 0, z: 0 },
    { id: "d", type: "home_fireplace_open", x: 0, z: 0 },
    { id: "e", type: "hot_tub", x: 0, z: 0 },
    { id: "f", type: "sofa", x: 0, z: 0, tilt: 10 },
    { id: "g", type: "sofa", x: 0, z: 0, roll: -5 },
  ];
  for (const item of whole) {
    const g = buildFurniture(item, M, 0, 2.5);
    const n = count(g);
    assert.equal(keepWhole(g, item), true, item.id);
    assert.equal(mergeItem(g, { item }), null, item.id);
    assert.equal(count(g), n, item.id);
  }
  // Entität "none" zählt nicht
  const free = { id: "h", type: "sofa", x: 0, z: 0, entity: "none" };
  const gs = buildFurniture(free, M, 0, 2.5);
  assert.equal(keepWhole(gs, free), false);
  assert.ok(mergeItem(gs, { item: free }).meshes[1] < 4);
  // Lampe ohne Entität: das Leuchtmittel bleibt ein eigenes Mesh (bulbs zeigt weiter darauf)
  const lamp = { id: "l", type: "lamp_floor", x: 0, z: 0 };
  const gl = buildFurniture(lamp, M, 0, 2.5);
  const bulbs = [...gl.userData.bulbs];
  assert.ok(bulbs.length > 0);
  mergeItem(gl, { item: lamp });
  for (const b of bulbs) {
    let inside = false;
    gl.traverse((o) => (inside ||= o === b));
    assert.ok(inside, "Leuchtmittel entfernt");
  }
  // Heizkörper: Rippen mit userData.heat bleiben einzeln (glühen beim Heizen)
  const rad = { id: "r", type: "radiator", x: 0, z: 0 };
  const gr = buildFurniture(rad, M, 0, 2.5);
  const heat = [];
  gr.traverse((o) => o.userData.heat && heat.push(o));
  mergeItem(gr, { item: rad });
  const heatAfter = [];
  gr.traverse((o) => o.userData.heat && heatAfter.push(o));
  assert.ok(heat.length > 2);
  assert.deepEqual(heatAfter, heat);
  // durchsichtige Teile (Glas) bleiben einzeln
  const sh = { id: "s", type: "garden_greenhouse", x: 0, z: 0 };
  const gsh = buildFurniture(sh, M, 0, 2.5);
  const glass = [];
  gsh.traverse((o) => o.isMesh && o.material.transparent && glass.push(o));
  mergeItem(gsh, { item: sh });
  for (const o of glass) assert.ok(o.parent, "Glas zusammengeführt");
});

test("Serverschrank wird zusammengeführt, die Tür-Teile (noPick) bleiben einzeln in ihrer Gruppe", () => {
  for (const style of ["standard", "cyber"]) {
    const M = furnitureMaterials(style);
    const item = { id: "rack", type: "server_rack", x: 0, z: 0 };
    const g = buildFurniture(item, M, 0, 2.5);
    const door = g.userData.door;
    const parts = [];
    door.traverse((o) => o.isMesh && parts.push(o));
    const res = mergeItem(g, { edges: M.edge, item });
    assert.ok(res && res.meshes[0] > 100 && res.meshes[1] < res.meshes[0] / 4, `${style}: ${JSON.stringify(res)}`);
    assert.equal(door.parent, g);
    const after = [];
    door.traverse((o) => o.isMesh && after.push(o));
    assert.deepEqual(after, parts);
    for (const o of after) assert.equal(o.userData.noPick, true);
  }
});

test("Kanten im Cyberpunk-Stil: je Stück ein LineSegments in der Stückgruppe, an der Lage der Teile", () => {
  const M = furnitureMaterials("cyber");
  const item = { id: "t", type: "table", x: 0, z: 0 };
  const a = buildFurniture(item, M, 0, 2.5);
  const g = buildFurniture(item, M, 0, 2.5);
  mergeItem(g, { edges: M.edge, item });
  const lines = g.children.filter((o) => o.isLineSegments);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].material, M.edge);
  // gleiche Punktmenge wie die einzelnen Kanten in Stück-Koordinaten
  const key = (v) => v.toArray().map((x) => x.toFixed(6)).join(",");
  const pts = (root) => {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const out = [];
    root.traverse((o) => {
      if (!o.isLineSegments) return;
      const m = o.matrixWorld.clone().premultiply(inv);
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) out.push(key(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m)));
    });
    return out.sort();
  };
  assert.deepEqual(pts(g), pts(a));
  // Stück mit Glas: Kanten je Teil (umgerechnet), damit sie wie vorher einzeln gegen das Glas sortiert werden
  const sh = { id: "s", type: "garden_greenhouse", x: 0, z: 0 };
  const gs = buildFurniture(sh, M, 0, 2.5);
  const merged = mergeItem(gs, { edges: M.edge, item: sh });
  const own = gs.children.filter((o) => o.isLineSegments);
  assert.ok(merged.meshes[1] < merged.meshes[0] && own.length > 1, JSON.stringify(merged));
  for (const o of own) assert.ok(o.matrix.equals(new THREE.Matrix4()) && o.material === M.edge);
  // ohne Kanten-Material bleiben Teile mit Kanten einzeln
  const h = buildFurniture(item, M, 0, 2.5);
  const res = mergeItem(h, { item });
  assert.equal(res.meshes[1], res.meshes[0]);
});
