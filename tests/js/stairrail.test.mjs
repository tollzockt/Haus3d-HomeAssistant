// Treppengeländer: durchgehender Handlauf über Läufe, Podeste und Wendelstufen, Pfosten und Stäbe; 3D-Modell
// der Treppe (Röhren, ein Stab-Mesh) und des Treppenlochs (flache Leiste, Mitte offen)
import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { STAIR_SHAPES, stairLayout } from "../../custom_components/haus3d/frontend/stairs.js";
import { BAR_GAP, RAIL_H, RAIL_INSET, offsetPath, stairRails } from "../../custom_components/haus3d/frontend/stairrail.js";
import { buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";

const W = 2.2;
const D = 3;
const H = 2.8;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const thin = (bars) => bars.filter((b) => b[4] < 0.05);

test("Handläufe je Form: von Antritt bis Austritt, steigend, im Grundriss", () => {
  for (const [shape] of STAIR_SHAPES) {
    const lay = stairLayout({ shape, w: W, d: D, h: H });
    const { rails, bars } = stairRails(lay, lay.radius ? "outer" : "both");
    assert.equal(rails.length, 2, shape);
    const main = rails[0];
    assert.ok(main.length >= 2, shape);
    for (let i = 1; i < main.length; i++) assert.ok(main[i][1] >= main[i - 1][1] - 1e-9, `${shape}: steigend bei ${i}`);
    assert.ok(near(main[0][1], lay.rise / 2 + RAIL_H), `${shape}: Anfang ${main[0][1]}`);
    assert.ok(near(main.at(-1)[1], H + RAIL_H), `${shape}: Ende ${main.at(-1)[1]}`);
    for (const r of rails) for (const [x, y, z] of r) assert.ok(Math.abs(x) <= W / 2 + 1e-9 && Math.abs(z) <= D / 2 + 1e-9 && Number.isFinite(y), `${shape}: ${x},${z}`);
    for (const b of bars) assert.ok(b.every(Number.isFinite) && Math.abs(b[0]) <= W / 2 + 1e-9 && Math.abs(b[1]) <= D / 2 + 1e-9 && b[3] > b[2] && b[2] >= 0, `${shape}: Stab ${b}`);
    if (lay.radius) continue;
    // beide Seiten: Antritt vorne, Austritt an der Lauflinie hinten
    for (const r of rails) {
      assert.ok(near(r[0][2], D / 2), `${shape}: Antritt ${r[0][2]}`);
    }
  }
});

test("Stäbe: Lücken höchstens BAR_GAP, Pfosten an Anfang, Ende und Ecken", () => {
  for (const shape of ["straight", "l_left", "lw_right", "u_left"]) {
    const lay = stairLayout({ shape, w: W, d: D, h: H });
    for (const side of ["left", "right"]) {
      const { bars } = stairRails(lay, side);
      const list = thin(bars);
      assert.ok(list.length > 10, shape);
      for (let i = 1; i < list.length; i++) {
        const gap = Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1]);
        assert.ok(gap <= BAR_GAP + 1e-9, `${shape}/${side}: Lücke ${gap} bei ${i}`);
      }
      const posts = bars.filter((b) => b[4] >= 0.05);
      assert.equal(posts.length, lay.path.length, `${shape}/${side}: Pfosten`);
      assert.equal(posts[0][2], 0);
      assert.ok(near(posts.at(-1)[2], H - lay.rise));
      assert.ok(near(posts.at(-1)[3], H + RAIL_H + 0.04));
    }
  }
});

test("Ecken: L und U mit Gehrung am Podest, außen 4 cm von der Treppenkante", () => {
  const sw = 1;
  const l = stairLayout({ shape: "l_left", w: 2, d: 3, h: 2.6, run: sw });
  const outer = stairRails(l, "right").rails[0];
  // erste Flucht rechts (x 0…1), Podest hinten: äußere Ecke bei (1 − 0,04, −1,5 + 0,04)
  assert.ok(outer.some(([x, , z]) => near(x, 1 - RAIL_INSET) && near(z, -1.5 + RAIL_INSET)), JSON.stringify(outer));
  const inner = stairRails(l, "left").rails[0];
  assert.ok(inner.some(([x, , z]) => near(x, RAIL_INSET) && near(z, -1.5 + sw - RAIL_INSET)));
  const u = stairLayout({ shape: "u_left", w: 2.2, d: 3, h: 2.6 });
  const uo = stairRails(u, "right").rails[0];
  assert.ok(uo.some(([x, , z]) => near(x, 1.1 - RAIL_INSET) && near(z, -1.5 + RAIL_INSET)));
  assert.ok(uo.some(([x, , z]) => near(x, -1.1 + RAIL_INSET) && near(z, -1.5 + RAIL_INSET)));
  // auf dem Podest waagrecht (Podesthöhe + Handlauf)
  const land = u.treads.find((t) => t.landing);
  assert.ok(uo.filter(([, , z]) => near(z, -1.5 + RAIL_INSET)).every(([, y]) => near(y, land.top + RAIL_H)));
  // outer wirkt bei geraden Treppen wie beidseitig
  assert.equal(stairRails(stairLayout({ shape: "straight", w: 1, d: 3, h: 2.6 }), "outer").rails.length, 2);
});

test("Wendeltreppe: Schraubenlinie auf R − 4 cm, Stabfuß auf der Stufe, Podestgeländer, gespiegelt", () => {
  const lay = stairLayout({ shape: "spiral", w: 1.6, d: 1.6, h: H });
  const { rails, bars } = stairRails(lay, "left");
  assert.equal(rails.length, 2);
  const [helix, radial] = rails;
  assert.ok(helix.every(([x, , z]) => near(Math.hypot(x, z), 0.8 - RAIL_INSET)));
  assert.ok(helix.length >= lay.turn / 5);
  assert.ok(radial.every(([, y]) => near(y, H + RAIL_H)));
  for (const b of thin(bars)) {
    const k = (b[2] + 0.05) / lay.rise;
    assert.ok(near(k, Math.round(k), 1e-6), `Stabfuß ${b[2]}`);
  }
  const arcBars = thin(bars).filter((b) => near(Math.hypot(b[0], b[1]), 0.8 - RAIL_INSET));
  const step = ((0.8 - RAIL_INSET) * Math.PI * lay.turn) / 180 / arcBars.length;
  assert.ok(step <= BAR_GAP + 1e-9);
  const mirrored = stairRails(stairLayout({ shape: "spiral_right", w: 1.6, d: 1.6, h: H }), "outer");
  mirrored.rails.forEach((r, i) => r.forEach((p, k) => assert.ok(near(p[0], -rails[i][k][0]) && near(p[1], rails[i][k][1]) && near(p[2], rails[i][k][2]))));
});

test("Kein Geländer: none, leer, unbekannt", () => {
  const lay = stairLayout({ shape: "straight", w: 1, d: 3, h: 2.6 });
  for (const r of [undefined, null, "", "none", "quatsch"]) assert.deepEqual(stairRails(lay, r), { rails: [], bars: [] });
  assert.deepEqual(stairRails(stairLayout({ shape: "spiral", w: 1.6, d: 1.6 }), "none"), { rails: [], bars: [] });
});

test("offsetPath: links versetzt mit Gehrung, gleiche Punktzahl", () => {
  const p = offsetPath([[0, 0], [0, -2], [-2, -2]], 0.5);
  assert.equal(p.length, 3);
  // Gehrichtung −z: links ist −x; danach −x: links ist +z
  assert.deepEqual(p.map((q) => q.map((v) => Math.round(v * 1e9) / 1e9)), [[-0.5, 0], [-0.5, -1.5], [-2, -1.5]]);
  const r = offsetPath([[0, 0], [0, -2], [-2, -2]], -0.5);
  assert.deepEqual(r.map((q) => q.map((v) => Math.round(v * 1e9) / 1e9)), [[0.5, 0], [0.5, -2.5], [-2, -2.5]]);
  assert.deepEqual(offsetPath([[1, 1]], 0.3), [[1, 1]]);
});

const meshes = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};

test("3D: Wendeltreppe und gerade Treppe mit genau 2 Röhren und einem Stab-Mesh, Höhe stimmt, keine NaN", () => {
  const M = furnitureMaterials("standard");
  for (const item of [
    { id: "w", type: "stairs", stair_shape: "spiral", railing: "outer", w: 1.6, d: 1.6, h: H },
    { id: "s", type: "stairs", stair_shape: "straight", railing: "both", w: 1, d: 3, h: H },
    { id: "u", type: "stairs", stair_shape: "u_right", railing: "both", w: 2.2, d: 3, h: H },
    { id: "l", type: "stairs", stair_shape: "lw_left", railing: "right", w: 2, d: 3, h: H },
  ]) {
    const g = buildFurniture({ ...item, x: 1, z: 2, rotation: 30 }, M, 0, 2.5);
    g.updateMatrixWorld(true);
    const list = meshes(g);
    const tubes = list.filter((m) => m.geometry.type === "TubeGeometry");
    assert.equal(tubes.length, item.railing === "right" ? 1 : 2, item.id);
    assert.ok(list.filter((m) => m.geometry.type === "BufferGeometry").length <= 1, item.id);
    for (const m of list) assert.ok(m.geometry.attributes.position.array.every(Number.isFinite), `${item.id}: NaN in ${m.geometry.type}`);
    const box = new THREE.Box3().setFromObject(g);
    const top = box.max.y - g.position.y;
    assert.ok(top >= H + 0.9 - 1e-9 && top <= H + 0.96, `${item.id}: ${top}`);
  }
  // ohne Geländer: keine Röhre
  const plain = buildFurniture({ id: "p", type: "stairs", w: 1, d: 3, h: 2.6, x: 0, z: 0 }, M, 0, 2.5);
  assert.equal(meshes(plain).filter((m) => m.geometry.type === "TubeGeometry").length, 0);
  // Cyberpunk: Kanten je Mesh, ebenfalls ohne Fehler
  assert.ok(buildFurniture({ id: "c", type: "stairs", stair_shape: "spiral", railing: "outer", w: 1.6, d: 1.6, h: H, x: 0, z: 0 }, furnitureMaterials("cyber"), 0, 2.5).children.length > 0);
});

test("3D: Treppenloch flach, Mitte offen, Rand trifft; rund ebenso", () => {
  const M = furnitureMaterials("standard");
  for (const hole_round of [false, true]) {
    const g = buildFurniture({ id: "l", type: "stairwell", x: 3, z: 4, w: 1.2, d: 2, h: 0.02, hole_round }, M, 0, 2.5);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    assert.ok(box.max.y - box.min.y < 0.02, `flach: ${box.max.y - box.min.y}`);
    const ray = new THREE.Raycaster(new THREE.Vector3(3, 1, 4), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(g, true).length, 0, "Mitte offen");
    ray.set(new THREE.Vector3(3, 1, 4 + 0.985), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(g, true).length > 0, "Rand");
  }
  // sehr klein: geschlossene Platte, aber ein Modell
  assert.ok(buildFurniture({ id: "k", type: "stairwell", x: 0, z: 0, w: 0.05, d: 0.05, h: 0.02 }, M, 0, 2.5).children.length > 0);
});
