// Tests der Dachformen eigener Dächer und freier Dachteile (roofshapes.js)
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GROUP_TYPES,
  PART_PITCH,
  ROOF_PART_TYPES,
  ROOM_ROOF_TYPES,
  SINGLE_TYPES,
  circleOf,
  circlePoints,
  convexHull,
  framesFor,
  newRoofPart,
  offsetPolygon,
  partSettings,
  partShape,
  rectInFrame,
  roofParts,
} from "../../custom_components/haus3d/frontend/roofshapes.js";
import { roofModel, roofSurfaceAt } from "../../custom_components/haus3d/frontend/exterior.js";
import { signedArea } from "../../custom_components/haus3d/frontend/walls.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const tan = (deg) => Math.tan((deg * Math.PI) / 180);
const shape = (type, points = rect(0, 0, 8, 5), extra = {}, ctx = {}) => partShape({ id: "t", type, points, ...extra }, { wall: 0.24, top: 2.5, ...ctx });

test("Dachteil-Einstellungen: Standard je Form, Grenzen, Neigung 0 → Standard der Form", () => {
  const g = partSettings({ type: "shed" });
  assert.equal(g.pitch, PART_PITCH.shed);
  assert.equal(g.overhang, 0.4);
  assert.equal(g.direction, "auto");
  assert.equal(partSettings({ type: "cone", pitch: 0 }).pitch, 55);
  assert.equal(partSettings({ type: "quatsch" }).type, "gable");
  assert.equal(partSettings({ type: "gable", pitch: 95, overhang: 9, base: -9 }).pitch, 80);
  assert.equal(partSettings({ type: "gable", overhang: 9 }).overhang, 1.5);
  assert.equal(partSettings({ type: "gable", overhang: 0 }).overhang, 0);
  assert.equal(partSettings({ type: "gable", base: -9 }).base, -5);
  const t = partSettings({ type: "terrace", overhang: 1, base: 3, railing: "gold" });
  assert.deepEqual([t.overhang, t.base, t.railing, t.railing_height], [0, 0, "glass", 1]);
  // Mansarddach: unten mindestens 5° steiler als oben
  assert.equal(partSettings({ type: "mansard", pitch: 70, pitch_low: 60 }).pitch_low, 75);
  assert.equal(partSettings({ type: "mansard", pitch: 80 }).pitch_low, 85);
  assert.equal(partSettings({ type: "halfhip", hip_ratio: 5 }).hip_ratio, 0.9);
  assert.equal(partSettings({ type: "gable", direction: "y" }).direction, "auto");
  assert.equal(partSettings({ type: "gable", direction: "cross" }).direction, "cross");
});

test("Umriss versetzen: nach außen, auch je Kante und bei Uhrzeigersinn", () => {
  assert.deepEqual(offsetPolygon(rect(0, 0, 2, 1), 0.5), [[-0.5, -0.5], [2.5, -0.5], [2.5, 1.5], [-0.5, 1.5]]);
  assert.deepEqual(offsetPolygon([...rect(0, 0, 2, 1)].reverse(), 0.5).map((p) => p.map((v) => v + 0)), [[-0.5, 1.5], [2.5, 1.5], [2.5, -0.5], [-0.5, -0.5]]);
  // Kante 1 (x = 2) nur 0,1
  const p = offsetPolygon(rect(0, 0, 2, 1), [0.5, 0.1, 0.5, 0.5]);
  assert.deepEqual(p[1], [2.1, -0.5]);
  assert.deepEqual(p[2], [2.1, 1.5]);
  // spitze Ecke wird gekürzt
  const spike = offsetPolygon([[0, 0], [10, 0], [0, 0.5]], 0.2);
  assert.ok(spike.every((q, i) => Math.hypot(q[0] - [[0, 0], [10, 0], [0, 0.5]][i][0], q[1] - [[0, 0], [10, 0], [0, 0.5]][i][1]) <= 0.6 + 1e-9));
  assert.deepEqual(convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0]]), [[0, 0], [2, 0], [2, 2], [0, 2]]);
  const c = circleOf(circlePoints([5, 5], 2, 24));
  near(c.center[0], 5, 1e-3);
  near(c.r, 2, 1e-3);
  assert.ok(signedArea(circlePoints([0, 0], 1)) > 0);
});

test("roofParts: ausgeschlossene Räume füllen die Lücke im Haus nicht", () => {
  const ring = [rect(0, 0, 10, 3), rect(0, 5, 10, 8), rect(0, 3, 3, 5), rect(7, 3, 10, 5)].map((points) => ({ points }));
  const covers = (frames, p) => frames.some((fr) => Math.abs((p[0] - fr.center[0]) * fr.u[0] + (p[1] - fr.center[1]) * fr.u[1]) <= fr.length / 2 && Math.abs((p[0] - fr.center[0]) * fr.v[0] + (p[1] - fr.center[1]) * fr.v[1]) <= fr.width / 2);
  assert.ok(covers(roofParts(ring, { wall: 0, overhang: 0 }), [5, 4])); // Lücke gefüllt
  assert.ok(!covers(roofParts(ring, { wall: 0, overhang: 0, exclude: [{ points: rect(3, 3, 7, 5) }] }), [5, 4]));
});

test("Satteldach: Traufe an der Wand auf der Ansatzhöhe, First in der Mitte, zwei Giebel", () => {
  const sh = shape("gable");
  assert.equal(sh.faces.length, 2);
  assert.equal(sh.frames.length, 1);
  near(sh.eave, 2.5 - 0.4 * tan(35));
  near(sh.at(4, -0.24).y, 2.5); // Wandlinie
  assert.deepEqual(sh.at(4, -0.24).out, [0, -1]);
  near(sh.at(4, 2.5).y, sh.eave + 3.14 * tan(35));
  near(sh.ridgeY, sh.eave + 3.14 * tan(35));
  assert.equal(sh.gableTris.length, 2);
  assert.equal(sh.ridges.length, 1);
  assert.equal(sh.at(20, 2), null);
  assert.ok(sh.pitched);
});

test("Walmdach: Walm an beiden Enden, First kürzer, keine Giebel", () => {
  const sh = shape("hip");
  assert.equal(sh.faces.length, 4);
  assert.equal(sh.gableTris.length, 0);
  const h = sh.at(-0.24, 2.5);
  near(h.y, 2.5);
  assert.deepEqual(h.out, [-1, 0]);
  near(h.tan, tan(30));
  const [a, b] = sh.ridges[0];
  near(Math.min(a[0], b[0]), -0.64 + 3.14);
  near(Math.max(a[0], b[0]), 8.64 - 3.14);
});

test("Zeltdach: Spitze über dem Schwerpunkt, flachste Fläche trifft die Wandlinie", () => {
  const sh = shape("pyramid");
  assert.equal(sh.faces.length, 4);
  near(sh.at(4, 2.5).y, sh.ridgeY);
  near(sh.at(-0.24, 2.5).y, 2.5); // Schmalseite (flacher)
  assert.ok(sh.at(4, -0.24).y >= 2.5 - 1e-9); // Längsseite (steilste Fläche mit der Neigung)
  near(sh.at(4, 0).tan, tan(35));
  assert.ok(sh.at(0, 2.5).tan < tan(35));
  assert.equal(sh.ridges.length, 4);
  assert.equal(sh.gableTris.length, 0);
});

test("Mansarddach: unten steil, oben flach, Giebel mit Knick", () => {
  const sh = shape("mansard", undefined, { pitch: 30, pitch_low: 70 });
  assert.equal(sh.faces.length, 4);
  near(sh.at(4, -0.24).y, 2.5); // an der Wand: Ansatzhöhe
  near(sh.at(4, 0).tan, tan(70));
  near(sh.at(4, 2.4).tan, tan(30));
  const d1 = 3.14 * 0.35;
  near(sh.ridgeY, sh.eave + d1 * tan(70) + (3.14 - d1) * tan(30));
  assert.equal(sh.gableTris.length, 6); // je Giebel ein Fünfeck
  const hip = shape("mansard", undefined, { ends: "hip" });
  assert.equal(hip.gableTris.length, 0);
  assert.equal(hip.faces.length, 8);
});

test("Krüppelwalmdach: unten Giebel, oben ein kleiner Walm", () => {
  const sh = shape("halfhip", undefined, { pitch: 40, hip_ratio: 0.35 });
  const top = sh.at(-0.63, 2.5); // Ende, Mitte: Walm
  assert.deepEqual(top.out, [-1, 0]);
  near(top.y, sh.eave + 3.14 * 0.65 * tan(40), 0.02);
  assert.deepEqual(sh.at(-0.5, -0.5).out, [0, -1]); // Ende unten: Dachfläche der Seite
  assert.ok(sh.gableTris.length > 0);
  assert.equal(sh.faces.length, 4);
});

test("Kegeldach: Kreis um den Umriss, Höhe analytisch", () => {
  const sh = shape("cone", circlePoints([5, 5], 2, 24));
  assert.ok(sh.cone);
  near(sh.cone.r, 2 + 0.64, 1e-3);
  near(sh.at(5, 5).y, sh.cone.apex, 1e-3);
  near(sh.at(5 + 2.24, 5).y, 2.5, 1e-3); // Wandlinie
  assert.deepEqual(sh.at(7, 5).out.map((v) => Math.round(v * 1000) / 1000), [1, 0]);
  assert.equal(sh.at(5 + 2.7, 5), null);
  assert.equal(sh.roofTris.length, 0); // 3D über ConeGeometry
});

test("Flachdach und Dachterrasse: Platte, Belag, Geländer nur an freien Kanten", () => {
  const f = shape("flat");
  near(f.at(-0.6, -0.6).y, 2.75);
  assert.equal(f.at(-0.7, 0), null);
  assert.equal(f.at(1, 1).out, null);
  assert.equal(f.pitched, false);
  const t = shape("terrace", undefined, {}, { deck: 2.74, edgeOffsets: [0.24, 0.06, 0.24, 0.24], railFree: [true, false, true, true] });
  near(t.at(8.05, 2.5).y, 2.74);
  assert.equal(t.at(8.1, 2.5), null);
  assert.deepEqual([t.slab.y0, t.slab.y1], [2.5, 2.74]);
  assert.equal(t.rail.edges.length, 3);
  assert.equal(t.rail.style, "glass");
  near(t.rail.y, 2.74);
  assert.equal(shape("terrace", undefined, { railing: "none" }).rail, null);
  near(shape("terrace").at(1, 1).y, 2.65); // ohne Etage darüber: 15 cm Aufbau
});

test("untere Hülle: Flächen und at() stimmen bei allen Formen überein, Dreiecke nach oben", () => {
  const all = ["gable", "hip", "shed", "mansard", "halfhip", "pyramid", "cone", "flat", "terrace"].map((t) => shape(t, t === "cone" ? circlePoints([4, 2.5], 2.5) : rect(0, 0, 8, 5), { ends: "hip", flip: true }));
  all.push(shape("gable", [[0, 0], [10, 0], [10, 4], [4, 4], [4, 9], [0, 9]], { direction: "cross" }));
  for (const sh of all) {
    for (const f of sh.faces) {
      // Ebene durch drei Ecken, geprüft am Schwerpunkt der Fläche
      const [a, b, c] = f.poly.map((p, i) => [p[0], f.y[i], p[1]]);
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const m = [f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length, f.poly.reduce((s, p) => s + p[1], 0) / f.poly.length];
      const y = a[1] - (n[0] * (m[0] - a[0]) + n[2] * (m[1] - a[2])) / n[1];
      const hit = sh.at(m[0], m[1]);
      if (sh.frames.length > 1) assert.ok(hit.y >= y - 1e-9, `${sh.type}`);
      else near(hit.y, y, sh.type === "cone" ? 0.05 : 1e-9); // Kegel: Flächen nur als Näherung (24 Stücke)
      for (const v of f.y) assert.ok(Number.isFinite(v));
    }
    for (const [p, q, r] of sh.roofTris) {
      const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
      assert.ok(ny > 0, `${sh.type}: Dreieck zeigt nach unten`);
      assert.ok([...p, ...q, ...r].every(Number.isFinite));
    }
    for (const tri of sh.gableTris) assert.ok(tri.flat().every(Number.isFinite));
  }
});

test("L-Umriss als Dachteil ergibt dieselben Höhen wie das Hausdach", () => {
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 9], [0, 9]];
  const house = roofModel({ settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35, overhang: 0.4 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 10, 4) }, { id: "b", points: rect(0, 4, 4, 9) }] }] });
  const sh = shape("gable", L, { pitch: 35, overhang: 0.4 });
  assert.equal(sh.frames.length, house.parts.length);
  for (let x = -0.5; x <= 10.5; x += 0.37) {
    for (let z = -0.5; z <= 9.5; z += 0.41) {
      const a = roofSurfaceAt(house, [x, z]);
      const b = sh.at(x, z);
      assert.equal(!!a, !!b, `${x},${z}`);
      if (a) near(a.y, b.y, 1e-3);
    }
  }
});

test("offene Enden: kein Giebel und kein Walm am offenen Ende", () => {
  assert.equal(shape("gable", undefined, {}, { open: [[true, false]] }).gableTris.length, 1);
  const hip = shape("hip", undefined, {}, { open: [[true, false]] });
  near(hip.at(-0.5, 2.5).y, hip.ridgeY); // kein Walm am Anfang
  assert.ok(hip.at(8.5, 2.5).y < hip.ridgeY - 1); // Walm am Ende
  assert.equal(hip.probes.length, 1); // nur das geschlossene Ende wird geprüft
  assert.equal(shape("gable").probes.length, 2);
});

test("neues Dachteil: ohne Raum, Farbe und Deckung vom Hausdach (nicht bei der Dachterrasse)", () => {
  const roof = { color: "#112233", texture: "roof_tiles", gable_color: "#ffffff" };
  const p = newRoofPart("gable", [[0.0004, 0], [2, 0], [2, 1]], { id: "dach_1", name: "Garage", roof });
  assert.deepEqual(p, { id: "dach_1", type: "gable", points: [[0, 0], [2, 0], [2, 1]], name: "Garage", pitch: 35, color: "#112233", texture: "roof_tiles" });
  assert.ok(!("room" in p));
  const t = newRoofPart("terrace", rect(0, 0, 1, 1), { id: "dach_2", roof });
  assert.equal(t.color, undefined);
  assert.equal(t.pitch, undefined);
});

test("Rechteck am Haus ausgerichtet", () => {
  assert.deepEqual(rectInFrame([2, 1], [0, 0], 0), rect(0, 0, 2, 1));
  near(Math.abs(signedArea(rectInFrame([0, 0], [1, 1], Math.PI / 4))), 0, 1e-3); // a und b auf einer Achse des Hauses
  const q = rectInFrame([0, 0], [0, 2], Math.PI / 4);
  assert.ok(signedArea(q) > 0);
  near(signedArea(q), 2, 1e-3);
});

test("Kanten anpassen an Bandformen: Anfang +1 m verlängert, at() folgt", () => {
  const sh = shape("gable", undefined, { adjust: [{ lo: 1 }] });
  near(sh.frames[0].length, 10.28);
  assert.ok(sh.at(-1.3, 2.5));
  assert.equal(shape("gable").at(-1.3, 2.5), null);
  // Pultdach andersherum: hohe Seite getauscht
  const a = shape("shed");
  const b = shape("shed", undefined, { flip: true });
  assert.ok(a.at(4, 4.5).y > a.at(4, 0.5).y);
  assert.ok(b.at(4, 4.5).y < b.at(4, 0.5).y);
});

test("framesFor: „kurze Seite“ tauscht Länge und Breite bei einem Rahmen", () => {
  const [a] = framesFor([{ points: rect(0, 0, 8, 5) }], { wall: 0.24, overhang: 0.4 });
  const [b] = framesFor([{ points: rect(0, 0, 8, 5) }], { wall: 0.24, overhang: 0.4, direction: "cross" });
  assert.deepEqual([a.length, a.width], [9.28, 6.28]);
  assert.deepEqual([b.length, b.width], [6.28, 9.28]);
  assert.deepEqual(b.u, a.v);
  assert.deepEqual(b.v, [-a.u[0] + 0, -a.u[1] + 0]);
  const sh = shape("gable", undefined, { direction: "cross" });
  assert.deepEqual(sh.at(4, 1).out, [-1, 0]); // First jetzt entlang z
});

test("Typlisten: Raumdach = Kein Dach + 9 Formen, Einzel- und Gruppenformen getrennt", () => {
  const keys = ROOF_PART_TYPES.map(([k]) => k);
  assert.equal(keys.length, 9);
  assert.deepEqual(ROOM_ROOF_TYPES.map(([k]) => k), ["none", ...keys]);
  assert.ok(!SINGLE_TYPES.some((t) => GROUP_TYPES.includes(t)));
  assert.deepEqual(new Set([...SINGLE_TYPES, ...GROUP_TYPES]), new Set(keys));
  for (const k of keys) assert.ok(PART_PITCH[k] >= 5);
});

test("Flächen tragen ihren Rahmen k, Firstlinien; Punkte auf einer Linie ergeben keine Form", () => {
  const sh = shape("gable", [[0, 0], [10, 0], [10, 4], [4, 4], [4, 9], [0, 9]]);
  assert.deepEqual([...new Set(sh.faces.map((f) => f.k))], [0, 1]);
  assert.equal(sh.ridges.length, 2);
  assert.equal(partShape({ type: "gable", points: [[0, 0], [1, 0], [2, 0]] }), null);
  assert.equal(partShape({ type: "gable", points: [[0, 0], [1, 0]] }), null);
  assert.equal(partShape({ type: "gable", points: [[0, 0], [1, 0], [NaN, 1]] }), null);
  assert.equal(partShape({ type: "gable", points: rect(0, 0, 0.2, 0.2) }), null); // 0,04 m²
});

test("Dachform ohne Lage (NaN/undefined): at liefert null statt eines Fehlers, PV-Feld ohne x/z zählt 0 Module", async () => {
  const { roofItemsAll } = await import("../../custom_components/haus3d/frontend/roofunits.js");
  const { fieldInfo } = await import("../../custom_components/haus3d/frontend/exterior.js");
  for (const type of ["gable", "hip", "shed", "mansard", "halfhip", "cone", "pyramid", "flat", "terrace"]) {
    const sh = shape(type, rect(0, 0, 8, 6), { pitch: 30 });
    assert.equal(sh.at(NaN, NaN), null, type);
    assert.equal(sh.at(undefined, undefined), null, type);
    assert.equal(roofSurfaceAt(sh, [undefined, 2]), null, type);
    assert.ok(sh.at(4, 3), `${type}: Mitte trägt`);
  }
  const sq = rect(0, 0, 8, 6);
  const b = { settings: { roof: { type: "none" } }, floors: [{ id: "eg", elevation: 0, height: 2.6, rooms: [{ id: "r1", name: "R", points: sq }], roofs: [{ id: "p1", type: "gable", pitch: 30, points: sq, items: [{ type: "pv", id: "pv1", cols: 2, rows: 1 }] }] }] };
  const [x] = roofItemsAll(b);
  assert.equal(fieldInfo(x.unit.model, x.item, 0, x.unit.items, x.others).count, 0);
});
