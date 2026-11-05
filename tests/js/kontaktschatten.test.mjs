// Kontaktschatten (scene-fx.js:_contactShadows): im Editor (live) ein Mesh je Möbelstück, in der Hauptansicht (live: false)
// ein InstancedMesh je Elterngruppe mit denselben Matrizen; ?instanzen=aus (flags.instances false) wieder einzeln.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { SceneFx } from "../../custom_components/haus3d/frontend/scene-fx.js";
import { buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";

const M = furnitureMaterials("standard");

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

const EG = [
  { id: "k_tisch", type: "desk", x: 1, z: 1 },
  { id: "k_lampe", type: "lamp_table", x: 1.2, z: 1, mount_y: 0.75 }, // auf dem Tisch: kein Schatten
  { id: "k_sofa", type: "sofa", x: 4, z: 2, rotation: 30 },
  { id: "k_bett", type: "bed_double", x: 6, z: 5, rotation: -120 },
  { id: "k_regal", type: "shelf", x: 2, z: 6, rotation: 45 },
];
const GARTEN = [
  { id: "k_baum", type: "tree", x: 14, z: 3, rotation: 25 },
  { id: "k_bank", type: "garden_table", x: 16, z: 6, rotation: 15 },
];
const OG = [{ id: "k_schrank", type: "wardrobe", x: 3, z: 3, rotation: 90 }];

/** Szene mit zwei Etagen, je Möbel innen und im Garten (wie scene.js:_buildFloor). */
function scene(opts = {}) {
  const root = new THREE.Group();
  const floors = new Map();
  for (const [id, elev, inside, outside] of [["eg", 0, EG, GARTEN], ["og", 2.8, OG, []]]) {
    const floor = { id, elevation: elev, height: 2.5, furniture: [...inside, ...outside] };
    const group = new THREE.Group();
    const garden = new THREE.Group();
    garden.userData.layer = "garden";
    const furn = new THREE.Group();
    furn.userData.layer = "furniture";
    const gardenFurn = new THREE.Group();
    gardenFurn.userData.layer = "furniture";
    for (const item of inside) furn.add(buildFurniture(item, M, elev, 2.5));
    for (const item of outside) gardenFurn.add(buildFurniture(item, M, elev, 2.5));
    group.add(furn);
    garden.add(gardenFurn);
    root.add(group, garden);
    floors.set(id, { floor, group, garden, furn, gardenFurn });
  }
  const sc = { root, floors, quality: {}, style: "standard", ...opts };
  withDocument(() => SceneFx._contactShadows.call(sc));
  root.updateMatrixWorld(true);
  return sc;
}

const blobs = (sc) => {
  const out = [];
  sc.root.traverse((o) => o.userData.blob && out.push(o));
  return out;
};

/** Je Möbelstück die lokale Matrix des Schattens (einzeln: Mesh.matrix, instanziert: Instanz-Matrix) und die Gruppe. */
function matrices(sc) {
  const out = new Map();
  for (const o of blobs(sc)) {
    if (o.isInstancedMesh) {
      o.userData.blobIds.forEach((id, i) => {
        const m = new THREE.Matrix4();
        o.getMatrixAt(i, m);
        out.set(id, { m: m.elements, parent: o.parent });
      });
    } else {
      o.updateMatrix();
      out.set(o.userData.blobOf, { m: [...o.matrix.elements], parent: o.parent });
    }
  }
  return out;
}

test("Kontaktschatten: Hauptansicht ein InstancedMesh je Elterngruppe, Matrizen wie einzeln", () => {
  const one = scene(); // live nicht gesetzt (wie der Editor): einzeln
  const inst = scene({ live: false, flags: { instances: true } });
  const single = blobs(one);
  assert.ok(single.length === 7 && single.every((o) => o.isMesh && !o.isInstancedMesh && typeof o.userData.blobOf === "string"));
  const im = blobs(inst);
  // EG innen, EG Garten, OG innen
  assert.equal(im.length, 3);
  const parents = new Set(im.map((o) => o.parent));
  assert.ok(parents.has(inst.floors.get("eg").furn) && parents.has(inst.floors.get("eg").gardenFurn) && parents.has(inst.floors.get("og").furn));
  for (const o of im) {
    assert.ok(o.isInstancedMesh);
    assert.equal(o.renderOrder, 1);
    assert.equal(o.userData.noShadow, true);
    assert.equal(o.userData.layer, "furniture");
    assert.equal(o.userData.blobOf, undefined);
    assert.equal(o.count, o.userData.blobIds.length);
    assert.equal(o.geometry, inst._blobGeo); // eine Ebene je Szene, von allen geteilt
    assert.ok(o.boundingSphere && o.boundingBox, "Bounding-Sphere und -Box berechnet");
    assert.ok(o.material.transparent && o.material.depthWrite === false);
  }
  assert.deepEqual(im.map((o) => o.count).sort(), [1, 2, 4]);
  // gleiche Stücke, gleiche Gruppen, gleiche Matrizen (bis auf Float32 der Instanz-Matrizen)
  const a = matrices(one);
  const b = matrices(inst);
  assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort());
  assert.ok(!a.has("k_lampe"));
  const sameGroup = (x, y) => x.userData.layer === y.userData.layer && x.parent.userData.layer === y.parent.userData.layer;
  for (const [id, { m, parent }] of a) {
    const got = b.get(id);
    assert.ok(sameGroup(parent, got.parent), id);
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(m[k] - got.m[k]) <= 1e-6 * Math.max(1, Math.abs(m[k])), `${id}[${k}]: ${m[k]} / ${got.m[k]}`);
  }
});

test("Kontaktschatten: Bounding-Sphere und Box umfassen jede Instanz (Sortierung und Sichtbarkeit)", () => {
  const sc = scene({ live: false, flags: { instances: true } });
  const pos = blobs(sc)[0].geometry.getAttribute("position");
  for (const o of blobs(sc)) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      // Ecken der Schattenfläche dieser Instanz
      for (let k = 0; k < pos.count; k++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(m);
        assert.ok(o.boundingSphere.distanceToPoint(p) < 1e-6, `${o.userData.blobIds[i]} außerhalb der Sphere`);
        assert.ok(o.boundingBox.clone().expandByScalar(1e-9).containsPoint(p), `${o.userData.blobIds[i]} außerhalb der Box`);
      }
    }
  }
  // Schattenbereich der Sonne (Box3.expandByObject über die Gruppen) wie einzeln (bis auf Float32)
  const one = scene();
  for (const id of ["eg", "og"]) {
    const box = (s) => new THREE.Box3().expandByObject(s.floors.get(id).group).expandByObject(s.floors.get(id).garden);
    const x = box(one);
    const y = box(sc);
    for (const k of ["min", "max"]) assert.ok(x[k].distanceTo(y[k]) < 1e-6, `${id} ${k}: ${x[k].toArray()} / ${y[k].toArray()}`);
  }
});

test("Kontaktschatten: ?instanzen=aus und Editor einzeln, Cyberpunk und ohne Kontaktschatten keine", () => {
  for (const opts of [{ live: false, flags: { instances: false } }, { live: true, flags: { instances: true } }, {}]) {
    const list = blobs(scene(opts));
    assert.equal(list.length, 7, JSON.stringify(opts));
    assert.ok(list.every((o) => !o.isInstancedMesh && o.userData.blobOf), JSON.stringify(opts));
  }
  assert.equal(blobs(scene({ live: false, flags: { instances: true }, style: "cyber" })).length, 0);
  assert.equal(blobs(scene({ live: false, flags: { instances: true }, quality: { contact: false } })).length, 0);
});

test("Kontaktschatten: Gruppe ohne Schatten bekommt kein leeres InstancedMesh", () => {
  const root = new THREE.Group();
  const group = new THREE.Group();
  const garden = new THREE.Group();
  const furn = new THREE.Group();
  furn.add(buildFurniture({ id: "k_l", type: "lamp_table", x: 1, z: 1, mount_y: 0.75 }, M, 0, 2.5));
  group.add(furn);
  root.add(group, garden);
  const sc = { root, floors: new Map([["eg", { floor: { id: "eg", elevation: 0 }, group, garden }]]), quality: {}, style: "standard", live: false, flags: { instances: true } };
  withDocument(() => SceneFx._contactShadows.call(sc));
  assert.equal(blobs(sc).length, 0);
  assert.equal(furn.children.length, 1);
});
