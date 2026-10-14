// Neigen und Kippen: reine Rechnungen (pose.js), Modelle (Unterkante = Montagehöhe, Mitte bleibt), Grundfläche im
// Plan und Trefferprüfung, Einrasten an der Wand, 3D-Pfeile und Live-Vorschau mit Drehung.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { NO_POSE, fitHeight, furniturePose, hasPose, normAngle, planSize, poseAngles, poseBox, poseRotate, setPoseKey } from "../../custom_components/haus3d/frontend/pose.js";
import { FURNITURE, buildFurniture, furnitureBaseY, furnitureMaterials, furniturePlanSize, furnitureTopY } from "../../custom_components/haus3d/frontend/furniture.js";
import { footprintSize, furnitureAt, pushOutOfWalls, snapToWall } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { arrowAnchor } from "../../custom_components/haus3d/frontend/arrows3d.js";
import { liveTarget, moveLive } from "../../custom_components/haus3d/frontend/scene-arrows.js";
import { SceneFx } from "../../custom_components/haus3d/frontend/scene-fx.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const DEG = Math.PI / 180;
const M = furnitureMaterials("standard");

/** Weltbox eines Objekts. */
function worldBox(o) {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

test("normAngle: −180 … 180, ungültig 0, gerundet", () => {
  for (const v of [0, null, undefined, "", "abc", true, false, NaN, Infinity, -Infinity, {}]) assert.equal(normAngle(v), 0, String(v));
  assert.equal(normAngle(190), -170);
  assert.equal(normAngle(-180), 180);
  assert.equal(normAngle(540), 180);
  assert.equal(normAngle(-90), -90);
  assert.equal(normAngle("30"), 30);
  assert.equal(normAngle(45.0004), 45);
  assert.equal(normAngle(180.0004), 180);
  assert.equal(normAngle(359.9999), 0);
  assert.ok(Object.is(normAngle(-0), 0) && Object.is(normAngle(-360), 0));
});

test("poseAngles: Treppe, Treppenloch und Stellplatz ohne Neigen/Kippen; fehlend = 0", () => {
  for (const type of NO_POSE) assert.deepEqual(poseAngles({ type, tilt: 30, roll: 10 }), { tilt: 0, roll: 0 });
  assert.deepEqual(poseAngles({ type: "shelf" }), { tilt: 0, roll: 0 });
  assert.deepEqual(poseAngles({ type: "shelf", tilt: 370, roll: "-15" }), { tilt: 10, roll: -15 });
  assert.equal(hasPose({ type: "shelf", tilt: 360 }), false);
  assert.equal(hasPose({ type: "shelf", roll: 5 }), true);
  assert.equal(hasPose(null), false);
});

test("poseRotate wie Three.js: Euler (−tilt, 0, −roll) in der Reihenfolge YXZ", () => {
  const v = new THREE.Vector3();
  for (const [tilt, roll] of [[30, 0], [0, 45], [25, -40], [-120, 170], [90, 90]]) {
    const e = new THREE.Euler(-tilt * DEG, 0, -roll * DEG, "YXZ");
    for (const p of [[0.3, 1.2, -0.4], [-1, 0, 0.5], [0, 2, 0]]) {
      const q = poseRotate(p, tilt, roll);
      v.set(...p).applyEuler(e);
      assert.ok(near(q[0], v.x, 1e-12) && near(q[1], v.y, 1e-12) && near(q[2], v.z, 1e-12), `${tilt}/${roll}: ${q} ≠ ${v.toArray()}`);
    }
  }
  // Richtung: Neigung + = Oberseite nach hinten (−z), Kippen + = Oberseite nach rechts (+x)
  assert.ok(poseRotate([0, 1, 0], 30, 0)[2] < 0);
  assert.ok(poseRotate([0, 1, 0], 0, 30)[0] > 0);
});

test("poseBox: 0° genau wie bisher, 90° liegt auf Rücken bzw. Seite, Schräge und Kombination", () => {
  assert.deepEqual(poseBox(0.9, 0.35, 1.9), { w: 0.9, d: 0.35, h: 1.9, off: [0, 0, 0] });
  assert.deepEqual(poseBox(0.9, 0.35, 1.9, 0, 0), { w: 0.9, d: 0.35, h: 1.9, off: [0, 0, 0] });
  // auf den Rücken gelegt (Oberseite nach hinten): Tiefe wird Höhe, Höhe wird Tiefe, Mitte der Grundfläche bleibt
  assert.deepEqual(poseBox(1, 0.4, 2, 90, 0), { w: 1, d: 2, h: 0.4, off: [0, 0.2, 1] });
  // nach rechts umgekippt: Höhe wird Breite
  assert.deepEqual(poseBox(1, 0.4, 2, 0, 90), { w: 2, d: 0.4, h: 1, off: [-1, 0.5, 0] });
  // 30° geneigt
  const b = poseBox(1, 0.4, 2, 30, 0);
  assert.ok(near(b.h, 2 * Math.cos(30 * DEG) + 0.4 * Math.sin(30 * DEG)));
  assert.ok(near(b.d, 0.4 * Math.cos(30 * DEG) + 2 * Math.sin(30 * DEG)));
  assert.ok(near(b.w, 1));
  // Kombination: Hülle aus allen acht Ecken, tiefste Ecke nach dem Versatz auf 0, Mitte der Grundfläche bei 0/0
  const [w, d, h, tilt, roll] = [0.8, 0.5, 1.2, 25, -40];
  const c = poseBox(w, d, h, tilt, roll);
  const pts = [];
  for (const x of [-w / 2, w / 2]) for (const y of [0, h]) for (const z of [-d / 2, d / 2]) pts.push(poseRotate([x, y, z], tilt, roll).map((v, k) => v + c.off[k]));
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  assert.ok(near(lo[1], 0) && near(hi[1], c.h));
  assert.ok(near(lo[0] + hi[0], 0) && near(lo[2] + hi[2], 0));
  assert.ok(near(hi[0] - lo[0], c.w) && near(hi[2] - lo[2], c.d));
  // Kippen nach links und rechts ergibt dieselbe Grundfläche
  assert.deepEqual(planSize({ type: "x", roll: 20 }, w, d, h), planSize({ type: "x", roll: -20 }, w, d, h));
});

test("fitHeight und furniturePose: bis zur Decke reichende Teile passen geneigt unter die Decke", () => {
  // schräge Stütze: länger als die Raumhöhe, die Hülle reicht genau vom Boden bis zur Decke
  const h0 = fitHeight(0.3, 0.3, 2.5, 20, 0);
  assert.ok(h0 > 2.5 && near(poseBox(0.3, 0.3, h0, 20, 0).h, 2.5, 1e-6), String(h0));
  assert.ok(near(poseBox(0.3, 0.3, fitHeight(0.3, 0.3, 2.5, 25, -35), 25, -35).h, 2.5, 1e-6));
  assert.equal(fitHeight(0.3, 0.3, 2.5, 0, 90), 2.5); // liegt: Länge = Raumhöhe
  const p = furniturePose({ type: "column", tilt: 20 }, 0.3, 0.3, 2.5, 2.5);
  assert.ok(near(p.h0, h0) && near(p.h, 2.5, 1e-6));
  // ohne Neigen/Kippen: unverändert, auch mit Raumhöhe
  assert.deepEqual(furniturePose({ type: "column" }, 0.3, 0.3, 2.5, 2.5), { tilt: 0, roll: 0, h0: 2.5, w: 0.3, d: 0.3, h: 2.5, off: [0, 0, 0] });
});

test("setPoseKey: auf −180 … 180, 0 und leer löschen das Feld", () => {
  const m = { tilt: 5, roll: 5 };
  setPoseKey(m, "tilt", 370);
  setPoseKey(m, "roll", null);
  assert.deepEqual(m, { tilt: 10 });
  setPoseKey(m, "tilt", 0);
  assert.deepEqual(m, {});
});

test("buildFurniture: ohne Neigen/Kippen genau wie bisher", () => {
  const g = buildFurniture({ id: "s", type: "shelf", x: 1, z: 2, rotation: 30, w: 0.9, d: 0.35, h: 1.9 }, M, 0.5, 2.5);
  assert.deepEqual(g.position.toArray(), [1, 0.5, 2]);
  assert.equal(g.rotation.order, "XYZ");
  assert.ok(g.rotation.x === 0 && g.rotation.z === 0 && near(g.rotation.y, -30 * DEG));
  assert.equal(g.userData.poseOff, undefined);
  // Treppe ignoriert Neigen/Kippen aus fremden Daten
  const st = buildFurniture({ id: "t", type: "stairs", x: 0, z: 0, tilt: 30, roll: 20 }, M, 0, 2.5);
  assert.ok(st.rotation.x === 0 && st.rotation.z === 0);
});

test("buildFurniture geneigt/gekippt: tiefste Ecke auf der Montagehöhe, Mitte der Grundfläche bei x/z", () => {
  for (const [tilt, roll, rot] of [[25, 0, 0], [0, -40, 30], [25, -40, 30], [90, 0, 200], [0, 90, 90], [-135, 60, 45]]) {
    for (const mount of [undefined, 0.4]) {
      const item = { id: "k", type: "custom_box", x: 2, z: 3, rotation: rot, w: 0.8, d: 0.5, h: 1.2, tilt, roll, mount_y: mount };
      const g = buildFurniture(item, M, 1, 2.5);
      const b = worldBox(g);
      const tag = `${tilt}/${roll}/${rot}/${mount}`;
      assert.ok(near(b.min.y, 1 + (mount ?? 0), 1e-6), `${tag}: min.y ${b.min.y}`);
      assert.ok(near((b.min.x + b.max.x) / 2, 2, 1e-6) && near((b.min.z + b.max.z) / 2, 3, 1e-6), `${tag}: Mitte ${b.min.toArray()} ${b.max.toArray()}`);
      assert.ok(near(b.max.y - b.min.y, poseBox(0.8, 0.5, 1.2, tilt, roll).h, 1e-6), tag);
      assert.equal(g.rotation.order, "YXZ");
      assert.ok(near(g.rotation.y, -rot * DEG));
    }
  }
  // jedes Modell, das in seinem Rahmen bleibt (ein Bett mit Kopfteil ragt darüber), umgekippt bzw. schräg: liegt
  // auf dem Boden, versinkt nicht und bleibt in seiner Hülle
  let n = 0;
  for (const [type, [, w, d, h]] of Object.entries(FURNITURE)) {
    if (NO_POSE.has(type) || !h) continue;
    const b0 = worldBox(buildFurniture({ id: type, type, x: 0, z: 0, w, d, h, mount_y: 0 }, M, 0, 2.5));
    if (b0.min.y < -0.02 || b0.max.y > h + 0.02 || Math.max(-b0.min.x, b0.max.x) > w / 2 + 0.02 || Math.max(-b0.min.z, b0.max.z) > d / 2 + 0.02) continue;
    for (const pose of [{ roll: 90 }, { tilt: -35, roll: 20 }]) {
      const b = worldBox(buildFurniture({ id: type, type, x: 0, z: 0, w, d, h, mount_y: 0, ...pose }, M, 0, 2.5));
      const H = poseBox(w, d, h, pose.tilt ?? 0, pose.roll).h;
      assert.ok(b.min.y > -0.02 && b.max.y <= H + 0.02, `${type} ${JSON.stringify(pose)}: ${b.min.y} … ${b.max.y} (Hülle ${H})`);
      n++;
    }
  }
  assert.ok(n > 100);
});

test("Später geladene Teile neigen mit (Neigen/Kippen auf der äußeren Gruppe)", () => {
  const g = buildFurniture({ id: "e", type: "custom_box", x: 0, z: 0, w: 1, d: 1, h: 2, tilt: 90 }, M, 0, 2.5);
  const sub = new THREE.Group();
  const late = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  late.position.set(0, 2, 0); // an der Oberseite des Rahmens
  sub.add(late);
  g.add(sub);
  g.updateMatrixWorld(true);
  const p = late.getWorldPosition(new THREE.Vector3());
  // auf den Rücken gelegt: die Oberseite zeigt nach hinten (−z), knapp über dem Boden
  assert.ok(p.z < -0.9 && Math.abs(p.y - 0.5) < 1e-6, p.toArray().join());
});

test("furnitureBaseY: Deckenteile hängen geneigt mit der höchsten Ecke unter der Decke; Säule bis zur Decke", () => {
  const lamp = { id: "l", type: "lamp_ceiling", x: 0, z: 0, tilt: 30 };
  const [, w, d, h] = FURNITURE.lamp_ceiling;
  const H = poseBox(w, d, h, 30, 0).h;
  assert.ok(near(furnitureBaseY(lamp, 2.5), 2.5 - H - 0.01));
  assert.ok(near(furnitureBaseY({ ...lamp, tilt: 0 }, 2.5), 2.5 - h - 0.01));
  const b = worldBox(buildFurniture(lamp, M, 0, 2.5));
  assert.ok(near(b.max.y, 2.49, 1e-6) || b.max.y < 2.49, String(b.max.y));
  // Säule (Höhe 0 = bis zur Decke) schräg: bleibt zwischen Boden und Decke
  const col = worldBox(buildFurniture({ id: "c", type: "column", x: 0, z: 0, w: 0.3, d: 0.3, h: 0, tilt: 20 }, M, 0, 2.5));
  assert.ok(col.min.y > -1e-6 && col.max.y < 2.5 + 1e-6, `${col.min.y} … ${col.max.y}`);
  const pil = worldBox(buildFurniture({ id: "p", type: "pillar", x: 0, z: 0, w: 0.24, d: 0.24, h: 0, roll: 15 }, M, 0, 2.5));
  assert.ok(near(pil.min.y, 0, 1e-6) && near(pil.max.y, 2.5, 1e-6), `${pil.min.y} … ${pil.max.y}`);
  // Oberkante (Info-Hologramm): ohne Neigung wie bisher, geneigt die höchste Ecke
  const shelf = { id: "s", type: "shelf", x: 0, z: 0, w: 0.9, d: 0.35, h: 1.9, mount_y: 0.2 };
  assert.ok(near(furnitureTopY(shelf, 2.5), 2.1));
  assert.ok(near(furnitureTopY({ ...shelf, roll: 90 }, 2.5), 0.2 + 0.9));
  assert.ok(near(furnitureTopY({ id: "c", type: "column", x: 0, z: 0, h: 0 }, 2.5), 2.5));
  assert.ok(near(furnitureTopY(lamp, 2.5), 2.49));
});

test("Grundfläche im Plan, Trefferprüfung und Einrasten nutzen die Hülle", () => {
  const shelf = { id: "r", type: "shelf", x: 2, z: 2, rotation: 0, w: 0.9, d: 0.35, h: 1.9 };
  assert.deepEqual(furniturePlanSize(shelf), [0.9, 0.35]);
  assert.deepEqual(footprintSize(shelf), [0.9, 0.35]);
  const lying = { ...shelf, roll: 90 };
  assert.deepEqual(furniturePlanSize(lying), [1.9, 0.35]);
  assert.deepEqual(footprintSize(lying), [1.9, 0.35]);
  const floor = { height: 2.5, furniture: [lying] };
  assert.equal(furnitureAt(floor, [2.9, 2])?.id, "r"); // seitlich umgekippt: reicht 0,95 m zur Seite
  assert.equal(furnitureAt({ height: 2.5, furniture: [shelf] }, [2.9, 2]), null);
  // gedreht um 90°: die lange Seite liegt entlang z
  assert.equal(furnitureAt({ height: 2.5, furniture: [{ ...lying, rotation: 90 }] }, [2, 2.9])?.id, "r");
  assert.equal(furnitureAt({ height: 2.5, furniture: [{ ...lying, rotation: 90 }] }, [2.9, 2]), null);
  // an die Wand gelehnt (10° nach hinten): Tiefe der Hülle, die Oberkante berührt die Wand
  const faces = [{ p: [0, 0], u: [1, 0], n: [0, 1], t0: 0, t1: 6 }];
  const lean = { ...shelf, z: 0.5, tilt: 10 };
  const s = snapToWall(lean, faces);
  const fd = poseBox(0.9, 0.35, 1.9, 10, 0).d;
  assert.ok(s && near(s.z, Math.round((fd / 2) * 1000) / 1000) && s.rotation === 0, JSON.stringify(s));
  // ragt in die Wand: wird um die Tiefe der Hülle herausgeschoben
  const q = pushOutOfWalls({ ...lean, z: 0.2 }, faces);
  assert.ok(q && near(q.z, Math.round((fd / 2) * 1000) / 1000), JSON.stringify(q));
});

test("3D-Pfeile: Anker in der Mitte der geneigten Hülle", () => {
  const floor = { id: "eg", height: 2.5, furniture: [{ id: "m", type: "custom_box", x: 1, z: 1, w: 1, d: 0.4, h: 2, roll: 90, mount_y: 0.3 }] };
  const a = arrowAnchor(floor, { kind: "furniture", id: "m" });
  assert.ok(near(a.base, 0.3) && near(a.y, 0.3 + 0.5) && a.axes === "xyz", JSON.stringify(a));
  floor.furniture[0].roll = 0;
  assert.ok(near(arrowAnchor(floor, { kind: "furniture", id: "m" }).y, 0.3 + 1));
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

test("Live-Vorschau: Drehen um die Mitte der Grundfläche, Neigen/Kippen bleiben, Schatten unter der Mitte", () => {
  const item = { id: "m", type: "custom_box", x: 3, z: 2, rotation: 20, w: 1.2, d: 0.6, h: 1.8, tilt: 15, roll: 70 };
  const floor = { id: "eg", elevation: 0, height: 2.5, furniture: [item] };
  const group = new THREE.Group();
  const furn = new THREE.Group();
  furn.userData.layer = "furniture";
  group.add(furn);
  furn.add(buildFurniture(item, M, 0, 2.5));
  const root = new THREE.Group();
  const garden = new THREE.Group();
  root.add(group, garden);
  const sc = { root, floors: new Map([["eg", { floor, group, garden }]]), quality: {}, style: "standard", invalidate() {} };
  withDocument(() => SceneFx._contactShadows.call(sc));
  const live = liveTarget(sc, { kind: "furniture", id: "m" });
  assert.equal(live.blobs.length, 1);
  const blob = live.blobs[0].o;
  assert.ok(near(blob.position.x, 3, 1e-6) && near(blob.position.z, 2, 1e-6), blob.position.toArray().join());
  const rx = live.obj.rotation.x;
  const rz = live.obj.rotation.z;
  const center = () => {
    const b = worldBox(live.obj);
    return [(b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2];
  };
  // an der Wand eingerastet: neue Drehung, verschoben
  moveLive(sc, live, [0.5, 0, -1], 110);
  const [cx, cy, cz] = center();
  assert.ok(near(cx, 3.5, 1e-6) && near(cy, 0, 1e-6) && near(cz, 1, 1e-6), `${cx} ${cy} ${cz}`);
  assert.ok(near(live.obj.rotation.y, -110 * DEG) && live.obj.rotation.x === rx && live.obj.rotation.z === rz);
  assert.ok(near(blob.position.x, 3.5, 1e-6) && near(blob.position.z, 1, 1e-6));
  // zurück auf den Start
  moveLive(sc, live, [0, 0, 0]);
  assert.ok(live.obj.position.distanceTo(live.p0) < 1e-9);
});
