// Treppenformen: L mit Podest/gewendelt, U, Wendeltreppe (links und rechts herum); Lauflinie; Deckenöffnung je Form
import assert from "node:assert/strict";
import { test } from "node:test";

import { STAIR_SHAPES, slabOpenings, stairHole, stairLayout } from "../../custom_components/haus3d/frontend/stairs.js";
import { pointInPolygon } from "../../custom_components/haus3d/frontend/walls.js";

const pts = (t) => t.poly ?? [[t.x0, t.z0], [t.x1, t.z0], [t.x1, t.z1], [t.x0, t.z1]];
const inside = (t, w, d) => pts(t).every(([x, z]) => x >= -w / 2 - 1e-9 && x <= w / 2 + 1e-9 && z >= -d / 2 - 1e-9 && z <= d / 2 + 1e-9);
const area = (p) => Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2;

test("Alle Formen: oberste Stufe = Höhe, steigend, in der Grundfläche", () => {
  for (const [shape] of STAIR_SHAPES) {
    const s = stairLayout({ shape, w: 2.2, d: 3.2, h: 2.8 });
    assert.ok(Math.abs(s.treads.at(-1).top - 2.8) < 1e-9, shape);
    const tops = s.treads.map((t) => t.top);
    assert.deepEqual(tops, [...tops].sort((a, b) => a - b), shape);
    assert.ok(s.treads.every((t) => inside(t, 2.2, 3.2)), shape);
    assert.equal(s.count, s.treads.length, shape);
    assert.ok(s.path.length >= 2, shape);
  }
});

test("L gewendelt: 3 Wendelstufen füllen das Eckquadrat, kein Podest", () => {
  for (const shape of ["lw_left", "lw_right"]) {
    const s = stairLayout({ shape, w: 2, d: 3, h: 2.6, run: 0.9 });
    const w = s.treads.filter((t) => t.winder);
    assert.equal(w.length, 3);
    assert.equal(s.treads.filter((t) => t.landing).length, 0);
    assert.ok(Math.abs(w.reduce((a, t) => a + area(t.poly), 0) - 0.81) < 1e-9, shape);
    assert.equal(s.run, 0.9);
  }
  // Kehre links: zweite Flucht läuft nach −x
  const l = stairLayout({ shape: "lw_left", w: 2, d: 3 });
  assert.ok(l.treads.at(-1).x0 < -0.5);
  assert.ok(stairLayout({ shape: "lw_right", w: 2, d: 3 }).treads.at(-1).x1 > 0.5);
});

test("U: zwei Fluchten nebeneinander, Podest über die ganze Breite", () => {
  const s = stairLayout({ shape: "u_left", w: 2.2, d: 3, h: 2.6 });
  const land = s.treads.filter((t) => t.landing);
  assert.equal(land.length, 1);
  assert.ok(Math.abs(land[0].x1 - land[0].x0 - 2.2) < 1e-9);
  const before = s.treads.slice(0, s.treads.indexOf(land[0]));
  const after = s.treads.slice(s.treads.indexOf(land[0]) + 1);
  assert.ok(before.every((t) => t.x0 > 0) && after.every((t) => t.x1 < 0));
});

test("Wendeltreppe: Fächer um die Spindel, höchstens eine Umdrehung", () => {
  const s = stairLayout({ shape: "spiral", w: 1.6, d: 1.6, h: 2.7 });
  assert.ok(s.treads.every((t) => t.spiral && t.poly.length === 5));
  assert.ok(s.spindle > 0 && s.radius === 0.8);
});

test("Deckenöffnung je Form: Kopfhöhe, L als Winkel, Wendel rund und am Podest bündig", () => {
  const base = { x: 5, z: 5, w: 2, d: 3, rotation: 0 };
  // gerade (h 2,6 → 14 Stufen, Decke 2,45): offen ab der dritten Stufe, 8 cm Luft, am Austritt bündig
  const st = stairHole({ ...base, stair_shape: "straight" });
  const zs = st.map((p) => p[1]);
  const xs = st.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...zs) - 3.5) < 1e-6, `min z ${Math.min(...zs)}`);
  assert.ok(Math.abs(Math.max(...zs) - (6.5 - 6 / 14 + 0.08)) < 1e-6, `max z ${Math.max(...zs)}`);
  assert.ok(Math.abs(Math.max(...xs) - 6.08) < 1e-6, `max x ${Math.max(...xs)}`);
  // L gewendelt: Winkel aus erster Flucht und Eck + zweiter Flucht
  const lw = stairHole({ ...base, stair_shape: "lw_left", run_width: 1 });
  assert.equal(lw.length, 6);
  assert.equal(pointInPolygon([4.5, 5.5], lw), false);
  // Wendeltreppe: rund, nie innerhalb des Radius, außerhalb des Podests 8 cm Luft, alle Stufen in der Öffnung
  const R = 1;
  const item = { ...base, stair_shape: "spiral" };
  const sp = stairHole(item);
  assert.equal(sp.length, 32);
  const lay = stairLayout({ shape: "spiral", w: 2, d: 3, h: 2.6 });
  const rel = (p) => {
    const a = (Math.atan2(p[0] - 5, p[1] - 5) * 180) / Math.PI;
    const v = (((a - lay.turn) % 360) + 360) % 360;
    return v > 360 - 1e-6 ? 0 : v;
  };
  for (let i = 0; i < sp.length; i++) {
    const p = sp[i];
    const q = sp[(i + 1) % sp.length];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const r = Math.hypot(m[0] - 5, m[1] - 5);
    assert.ok(r >= R - 1e-9, `Kante ${i}: ${r}`);
    if (rel(p) > 90 + 1e-6 && rel(q) > 90 + 1e-6) assert.ok(r >= R + 0.08 - 1e-9, `außerhalb des Podests ${i}: ${r}`);
  }
  for (const t of lay.treads) for (const [x, z] of t.poly) assert.ok(pointInPolygon([5 + x, 5 + z], sp), `Stufenecke ${x},${z}`);
  const b = { floors: [{ id: "kg", name: "KG", elevation: -2.6, furniture: [{ ...base, type: "stairs", h: 2.6, stair_shape: "l_right" }] }, { id: "eg", elevation: 0, furniture: [] }] };
  assert.equal(slabOpenings(b, "eg").length, 1);
});

test("Wendeltreppe: Lauflinie endet bei jeder Stufenzahl genau am Austritt (n + 1 Punkte)", () => {
  for (let h = 0.5; h <= 6; h += 0.01) {
    const s = stairLayout({ shape: "spiral", w: 1.6, d: 1.6, h });
    assert.equal(s.path.length, s.count + 1, `h = ${h.toFixed(2)}`);
    // volle Umdrehung: das Ende liegt wieder über dem Anfang (dort beginnt das Austrittspodest)
    if (s.turn === 360) assert.ok(Math.hypot(s.path.at(-1)[0] - s.path[0][0], s.path.at(-1)[1] - s.path[0][1]) < 1e-9, `h = ${h.toFixed(2)}`);
  }
});

test("Treppenloch über einer Treppenöffnung mit Geländer: Geländer läuft um die gemeinsame Öffnung, Austritt frei", async () => {
  const { mergeHoles, roomHole } = await import("../../custom_components/haus3d/frontend/stairs.js");
  const room = { id: "r", points: [[0, 0], [8, 0], [8, 8], [0, 8]] };
  for (const rotation of [0, 90, 33]) {
    const b = {
      floors: [
        { id: "eg", elevation: 0, height: 2.5, rooms: [room], furniture: [{ id: "s", type: "stairs", x: 4, z: 3, w: 1, d: 3, h: 2.65, railing: "left", rotation }] },
        { id: "og", elevation: 2.65, height: 2.5, rooms: [room], furniture: [{ id: "w", type: "stairwell", x: 4, z: 3, w: 1, d: 3, rotation }] },
      ],
    };
    const ops = slabOpenings(b, "og");
    const stair = ops.find((o) => !o.well);
    assert.ok(stair.edges.length >= 3, `${rotation}°: Geländer`);
    const holes = mergeHoles(ops.map((o) => o.poly)).map((p) => roomHole(room.points, p)).filter(Boolean);
    for (const [a, c] of stair.edges) {
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      assert.ok(!holes.some((h) => pointInPolygon(mid, h)), `${rotation}°: Kante ${JSON.stringify([a, c])} hängt über dem Loch`);
    }
    // Austritt (bei 0° die Seite z = 1,5) bleibt offen
    if (rotation === 0) assert.ok(!stair.edges.some(([a, c]) => a[1] < 1.55 && c[1] < 1.55), "Austritt offen");
  }
});
