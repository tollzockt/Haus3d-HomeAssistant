// Laufende Punkte als InstancedMesh (Leistung A6, scene-pipes.js): je Leitung ein Mesh für die Punkte aller ihrer
// Netzstücke, Lage und Box wie bei einzelnen Punkten (die Box zählt beim Schattenbereich mit, auch unsichtbar), Platz für
// die höchste Dichte (mehr Leistung legt kein neues Mesh an), ohne Schatten und ohne Ausschneiden; sichtbar nur, solange
// es fließt und die Ebene „Energiefluss“ an ist. Der PV-Fluss nutzt dieselben Bausteine (_dotMesh, _setDots).
import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { ScenePipes } from "../../custom_components/haus3d/frontend/scene-pipes.js";
import { flowLook } from "../../custom_components/haus3d/frontend/pipenet.js";

function pipeScene(pipes) {
  const sc = Object.assign(
    {
      layers: {},
      floors: new Map(),
      redraws: 0,
      redraw() {
        this.redraws++;
      },
      isFloorVisible: () => true,
    },
    ScenePipes,
  );
  const floor = { id: "eg", elevation: 0, height: 2.5, pipes, nodes: [] };
  const entry = { floor, group: new THREE.Group(), garden: new THREE.Group() };
  sc.floors.set("eg", entry);
  sc._buildPipes(floor, entry, 0, []);
  return { sc, entry };
}
const strom = (id, points) => ({ id, type: "strom", points, heights: points.map(() => 0.3) });
const edge = (id, pipeId, s0, s1, value, reverse = false) => ({ id, pipeId, s0, s1, value, unit: "W", reverse });

/** Stellen der Punkte eines Stücks wie früher je Punkt-Mesh (scene-pipes.js vor A6). */
function oldSpots(ed) {
  const span = ed.L1 - ed.L0;
  const len = ed.pipe.len || 1;
  const out = [];
  for (let i = 0; i < ed.n; i++) {
    let u = (ed.phase + i / ed.n) % 1;
    if (ed.reverse) u = 1 - u;
    out.push(ed.pipe.curve.getPointAt(Math.min(1, Math.max(0, (ed.L0 + u * span) / len))));
  }
  return out;
}
/** Box wie früher: ein Mesh je Punkt in derselben Gruppe. */
function oldBox(group, geo, spots) {
  const g = new THREE.Group();
  g.position.copy(group.position);
  for (const v of spots) {
    const m = new THREE.Mesh(geo);
    m.position.copy(v);
    g.add(m);
  }
  return new THREE.Box3().setFromObject(g);
}
const instSpots = (mesh) =>
  Array.from({ length: mesh.count }, (_, i) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixPosition(m);
  });
const close = (a, b, tol = 1e-6) => a.distanceTo(b) <= tol;

test("Leitung: ein InstancedMesh für alle Punkte, Lage wie bisher, ohne Schatten und Ausschneiden", () => {
  const { sc } = pipeScene([strom("l1", [[0, 0], [6, 0]]), strom("l2", [[0, 2], [3, 2]])]);
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 0.5, 400), edge("b", "l1", 0.5, 1, 1200, true), edge("c", "l2", 0, 1, 80)] });
  for (const id of ["l1", "l2"]) {
    const p = sc._pipes.get(id);
    const eds = [...sc._pipeEdges.values()].filter((e) => e.pipe === p);
    assert.ok(p.dots?.isInstancedMesh, id);
    assert.equal(p.dots.parent, p.group);
    assert.equal(p.dots.material, p.mats.dot);
    assert.equal(p.dots.frustumCulled, false);
    assert.equal(p.dots.userData.noShadow, true);
    assert.equal(p.dots.castShadow, false);
    assert.equal(p.dots.instanceMatrix.usage, THREE.DynamicDrawUsage);
    assert.equal(p.dots.visible, true);
    // je Stück so viele Punkte wie früher, alle Stücke in einem Mesh
    for (const ed of eds) assert.equal(ed.n, Math.max(1, Math.min(60, Math.round(Math.abs(ed.L1 - ed.L0) * flowLook(ed.value, "W").perMeter))));
    assert.equal(p.dots.count, eds.reduce((n, e) => n + e.n, 0));
    // Platz für die höchste Dichte (flowLook: höchstens 4 Punkte je Meter)
    assert.equal(p.dots.instanceMatrix.count, eds.reduce((n, e) => n + Math.max(1, Math.min(60, Math.round(Math.abs(e.L1 - e.L0) * 4))), 0));
    const want = eds.flatMap(oldSpots);
    const got = instSpots(p.dots);
    assert.equal(got.length, want.length);
    want.forEach((v, i) => assert.ok(close(got[i], v), `${id} Punkt ${i}: ${got[i].toArray()} statt ${v.toArray()}`));
  }
  // nur ein Punkt-Mesh je Leitung in der Gruppe
  const group = sc._pipes.get("l1").group;
  assert.equal(group.children.filter((o) => o.isInstancedMesh).length, 2);
});

test("Leitung: Box wie bei einzelnen Punkten, auch nach dem Weiterschieben", () => {
  const { sc } = pipeScene([strom("l1", [[0, 0], [6, 0], [6, 4]])]);
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1, 900), edge("b", "l1", 1, 2, 2500, true)] });
  const p = sc._pipes.get("l1");
  const eds = [...sc._pipeEdges.values()];
  const check = () => {
    const now = new THREE.Box3().expandByObject(p.dots);
    const before = oldBox(p.group, p.dots.geometry, eds.flatMap(oldSpots));
    assert.ok(now.min.distanceTo(before.min) < 1e-12 && now.max.distanceTo(before.max) < 1e-12, `${JSON.stringify(now)} statt ${JSON.stringify(before)}`);
  };
  check();
  const at0 = instSpots(p.dots);
  sc._stepPipes(0.4);
  check();
  const at1 = instSpots(p.dots);
  assert.ok(at1.some((v, i) => !close(v, at0[i], 1e-3)), "Punkte bewegen sich nicht");
  eds.flatMap(oldSpots).forEach((v, i) => assert.ok(close(at1[i], v)));
});

test("Leitung: Leistung ändert die Punktzahl ohne neues Mesh; aus, Ebene und neue Stücke", () => {
  const { sc } = pipeScene([strom("l1", [[0, 0], [8, 0]])]);
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1, 50)] });
  const p = sc._pipes.get("l1");
  const mesh = p.dots;
  const few = mesh.count;
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1, 3000)] });
  assert.equal(p.dots, mesh);
  assert.ok(mesh.count > few && mesh.count === mesh.instanceMatrix.count, `${few} → ${mesh.count} (Platz ${mesh.instanceMatrix.count})`);
  // Ebene „Energiefluss“ aus: unsichtbar, Punkte bleiben
  sc.layers = { flow: false };
  sc._syncPipeDots();
  assert.equal(mesh.visible, false);
  sc.layers = {};
  sc._syncPipeDots();
  assert.equal(mesh.visible, true);
  // kein Fluss: keine Punkte, unsichtbar, Box leer
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1, 0)] });
  assert.equal(mesh.count, 0);
  assert.equal(mesh.visible, false);
  assert.ok(new THREE.Box3().expandByObject(mesh).isEmpty());
  // Stück weg: ebenso
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1, 500)] });
  assert.ok(mesh.count > 0 && mesh.visible);
  sc.setPipeFlow({ edges: [] });
  assert.equal(sc._pipeEdges.size, 0);
  assert.equal(mesh.count, 0);
  assert.equal(mesh.visible, false);
  // gleich lange Stücke mit gleich viel Platz: dasselbe Mesh
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 0.5, 3000), edge("b", "l1", 0.5, 1, 3000)] });
  assert.equal(p.dots, mesh);
  assert.equal(mesh.count, 32);
  // Stücke brauchen mehr Platz (3 × 11 statt 32): neues Mesh, das alte ist abgehängt und freigegeben
  let disposed = false;
  mesh.addEventListener("dispose", () => (disposed = true));
  sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1 / 3, 3000), edge("b", "l1", 1 / 3, 2 / 3, 3000), edge("c", "l1", 2 / 3, 1, 3000)] });
  assert.notEqual(p.dots, mesh);
  assert.ok(disposed && !mesh.parent && p.dots.parent === p.group);
  assert.equal(p.group.children.filter((o) => o.isInstancedMesh).length, 1);
  assert.equal(p.dots.count, [...sc._pipeEdges.values()].reduce((n, e) => n + e.n, 0));
});

test("setPipeFlow zeichnet nur bei neuer Punktzahl, „aktiv“ oder Leitungsfarbe", () => {
  const { sc } = pipeScene([strom("l1", [[0, 0], [5, 0]])]);
  const at = (w) => {
    const n0 = sc.redraws;
    sc.setPipeFlow({ edges: [edge("a", "l1", 0, 1, w)] });
    return sc.redraws - n0;
  };
  assert.equal(at(500), 1); // an
  const n = sc._pipes.get("l1").dots.count;
  let w = 501;
  while (Math.max(1, Math.min(60, Math.round(sc._pipes.get("l1").len * flowLook(w, "W").perMeter))) === n && w < 700) w++;
  assert.equal(at(w - 1), 0); // gleiche Punktzahl, nur Tempo
  assert.equal(at(3000), 1); // mehr Punkte
  assert.equal(at(0), 1); // aus
});

test("PV-Fluss: 10 Punkte anfangs im Ursprung der Gruppe, Box wie bei einzelnen Punkten", () => {
  const geo = new THREE.SphereGeometry(0.11, 12, 8);
  const mesh = ScenePipes._dotMesh.call(ScenePipes, geo, new THREE.MeshBasicMaterial(), 10);
  assert.equal(mesh.count, 0);
  ScenePipes._setDots.call(ScenePipes, mesh, Array.from({ length: 10 }, () => new THREE.Vector3()));
  const group = new THREE.Group();
  group.position.set(0, 3, 0);
  group.add(mesh);
  assert.equal(mesh.count, 10);
  const zero = Array.from({ length: 10 }, () => new THREE.Vector3());
  assert.deepEqual(new THREE.Box3().expandByObject(group), oldBox(group, geo, zero));
  // Lauf entlang der Kurve wie scene-loop.js (Phase + i/n)
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 3, 1), new THREE.Vector3(5, 1, 2));
  const spots = Array.from({ length: 10 }, (_, i) => curve.getPointAt((0.37 + i / 10) % 1));
  ScenePipes._setDots.call(ScenePipes, mesh, spots);
  instSpots(mesh).forEach((v, i) => assert.ok(close(v, spots[i])));
  const now = new THREE.Box3().expandByObject(group);
  const before = oldBox(group, geo, spots);
  assert.ok(now.min.distanceTo(before.min) < 1e-12 && now.max.distanceTo(before.max) < 1e-12);
  // mehr Stellen als Platz: nur so viele, wie hineinpassen
  ScenePipes._setDots.call(ScenePipes, mesh, [...spots, ...spots]);
  assert.equal(mesh.count, 10);
});
