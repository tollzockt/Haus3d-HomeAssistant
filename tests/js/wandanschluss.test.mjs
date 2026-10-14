// Wandanschlüsse (walls.js): Gehrung, T-Stoß bis Wandmitte, bündige Raumseite, freie Wände
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { wallFaces } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { computeWalls, flushFootprint, pieceFootprint, planFootprints, wallPieces } from "../../custom_components/haus3d/frontend/walls.js";

const DATA = new URL("../../custom_components/haus3d/haus-daten.json", import.meta.url);
const building = JSON.parse(readFileSync(DATA, "utf8"));
const settings = building.settings;
const floorById = (id) => building.floors.find((f) => f.id === id);
const S = { wall_exterior: 0.24, wall_interior: 0.12 };

const rect = (id, x0, z0, x1, z1) => ({ id, name: id, points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
const floorOf = (rooms, walls = [], openings = []) => ({ id: "f", rooms, walls, openings });
const freeWall = (id, a, b, thickness) => ({ id, a, b, ...(thickness ? { thickness } : {}) });
const close = (p, q, eps = 1e-6) => Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps;
const at = (segs, a, b) => segs.find((s) => (close(s.a, a) && close(s.b, b)) || (close(s.a, b) && close(s.b, a)));
const endAt = (s, v) => (close(s.a, v) ? "A" : close(s.b, v) ? "B" : null);

// --- Strahltests im Grundriss --------------------------------------------------------------------
const area = (P) => {
  let a = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
function inside(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i];
    const b = P[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
/**
 * Doppelte Flächen (flimmern in 3D): Kanten zweier Fußabdrücke liegen auf derselben Geraden, überdecken sich, zeigen in
 * dieselbe Richtung, und ein Strahl 1 mm vor der Fläche trifft keinen Fußabdruck (die Fläche ist sichtbar).
 */
function doubleFaces(fps) {
  const edges = fps.map((P) => {
    const sgn = Math.sign(area(P));
    return P.map((p, i) => {
      const q = P[(i + 1) % P.length];
      const d = [q[0] - p[0], q[1] - p[1]];
      const l = Math.hypot(d[0], d[1]);
      return l < 1e-3 ? null : { p, q, l, u: [d[0] / l, d[1] / l], o: [(sgn * d[1]) / l, (-sgn * d[0]) / l] };
    }).filter(Boolean);
  });
  const found = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      for (const e of edges[i]) {
        for (const f of edges[j]) {
          if (e.o[0] * f.o[0] + e.o[1] * f.o[1] < 0.999) continue;
          const off = (x) => (x[0] - e.p[0]) * e.o[0] + (x[1] - e.p[1]) * e.o[1];
          if (Math.abs(off(f.p)) > 1e-4 || Math.abs(off(f.q)) > 1e-4) continue;
          const t = (x) => (x[0] - e.p[0]) * e.u[0] + (x[1] - e.p[1]) * e.u[1];
          const lo = Math.max(0, Math.min(t(f.p), t(f.q)));
          const hi = Math.min(e.l, Math.max(t(f.p), t(f.q)));
          if (hi - lo < 2e-3) continue;
          const m = (lo + hi) / 2;
          const ray = [e.p[0] + e.u[0] * m + e.o[0] * 1e-3, e.p[1] + e.u[1] * m + e.o[1] * 1e-3];
          if (!fps.some((P) => inside(ray, P))) found.push({ i, j, from: e.p, to: e.q });
        }
      }
    }
  }
  return found;
}
/** Spalte (Löcher): Strahlen in x- und z-Richtung alle 1 cm; Lücken unter 5 cm zwischen Fußabdrücken. */
function holes(fps) {
  const pts = fps.flat();
  const found = [];
  for (const axis of [0, 1]) {
    const cs = pts.map((p) => p[1 - axis]);
    const [lo, hi] = [Math.min(...cs), Math.max(...cs)];
    for (let c = lo + 0.0037; c < hi; c += 0.01) {
      const iv = [];
      for (const P of fps) {
        const ts = [];
        for (let i = 0; i < P.length; i++) {
          const p = P[i];
          const q = P[(i + 1) % P.length];
          const a = p[1 - axis];
          const b = q[1 - axis];
          if (a > c !== b > c) ts.push(p[axis] + ((c - a) / (b - a)) * (q[axis] - p[axis]));
        }
        ts.sort((x, y) => x - y);
        for (let k = 0; k + 1 < ts.length; k += 2) iv.push([ts[k], ts[k + 1]]);
      }
      iv.sort((x, y) => x[0] - y[0]);
      let end = -Infinity;
      for (const [a, b] of iv) {
        if (end > -Infinity && a - end > 1e-4 && a - end < 0.05) found.push({ axis, c, from: end, to: a });
        end = Math.max(end, b);
      }
    }
  }
  return found;
}
/** Keine umgedrehten Stücke: je Wandseite liegt der Anfang nicht hinter dem Ende; alle Zahlen endlich. */
function assertPieces(segments, openings, label) {
  for (const seg of segments) {
    const t = (p) => (p[0] - seg.a[0]) * seg.u[0] + (p[1] - seg.a[1]) * seg.u[1];
    const pieces = [{ s0: 0, s1: seg.length }, ...wallPieces(seg, openings, 2.5)];
    for (const pc of pieces) {
      for (const fp of [pieceFootprint(seg, pc.s0, pc.s1), flushFootprint(seg, pc.s0, pc.s1)].filter(Boolean)) {
        assert.equal(fp.length, 4);
        for (const p of fp) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${label} ${seg.id}: ${p}`);
        const [l0, r0, r1, l1] = fp;
        assert.ok(t(l0) <= t(l1) + 1e-9 && t(r0) <= t(r1) + 1e-9, `${label} ${seg.id} [${pc.s0}, ${pc.s1}] umgedreht: ${JSON.stringify(fp)}`);
      }
    }
  }
}

// --- Beispielhaus ---------------------------------------------------------------------------------
// Vor 0.23.0b2: KG 3 und EG 7 doppelte Flächen (T-Stöße mit 6 cm in eine Innenwand, stumpfe Enden an Gehrungen), 0 Spalte.
for (const id of ["kg", "eg"]) {
  test(`Beispielhaus ${id}: keine doppelten Flächen und keine Spalte`, () => {
    const floor = floorById(id);
    const { segments, openings } = computeWalls(floor, settings);
    const fps = planFootprints(segments);
    assert.deepEqual(doubleFaces(fps), []);
    assert.deepEqual(holes(fps), []);
    assertPieces(segments, openings, id);
  });
}

test("Gehrung, wo eine Innenwand gerade in eine Außenwand übergeht: EG (7,7) und KG (6,5)", () => {
  const eg = computeWalls(floorById("eg"), settings).segments;
  const schlaf = at(eg, [7, 7], [7, 8]);
  const flur = at(eg, [7, 7], [11, 7]);
  assert.equal(schlaf.kind, "exterior");
  assert.ok(close(schlaf[`outer${endAt(schlaf, [7, 7])}`], [7.24, 7.24]), JSON.stringify(schlaf));
  assert.ok(close(flur[`outer${endAt(flur, [7, 7])}`], [7.24, 7.24]));
  const kg = computeWalls(floorById("kg"), settings).segments;
  const hobby = at(kg, [6, 5], [6, 7]);
  const garage = at(kg, [0, 5], [6, 5]);
  assert.ok(close(hobby[`outer${endAt(hobby, [6, 5])}`], [5.76, 5.24]), JSON.stringify(hobby));
  assert.ok(close(garage[`outer${endAt(garage, [6, 5])}`], [5.76, 5.24]));
  // die Innenwand davor endet stumpf
  const inner = at(kg, [6, 3], [6, 5]);
  assert.equal(inner.extendA + inner.extendB, 0);
});

test("Bündige Raumseite: Streifen von 6 cm und sein Fußabdruck", () => {
  const eg = computeWalls(floorById("eg"), settings).segments;
  assert.deepEqual(eg.filter((s) => s.flush).map((s) => s.id), [at(eg, [7, 7], [7, 8]).id]);
  const schlaf = at(eg, [7, 7], [7, 8]);
  assert.equal(schlaf.flush, 0.06);
  const fp = flushFootprint(schlaf, 0, schlaf.length);
  const xs = fp.map((p) => +p[0].toFixed(6)).sort();
  const zs = fp.map((p) => +p[1].toFixed(6)).sort();
  assert.deepEqual(xs, [6.94, 6.94, 7, 7]); // zur Raumseite (Schlafzimmer liegt bei x < 7)
  assert.deepEqual(zs, [7, 7, 8, 8]);
  assert.equal(flushFootprint(schlaf, 0.2, 0.5).length, 4);
  // ohne Streifen: null; Innenwände und andere Außenwände bekommen keinen
  assert.equal(flushFootprint(at(eg, [7, 5], [7, 7]), 0, 1), null);
  const kg = computeWalls(floorById("kg"), settings).segments;
  const hobby = at(kg, [6, 5], [6, 7]);
  assert.equal(hobby.flush, 0.06);
  assert.deepEqual(flushFootprint(hobby, 0, hobby.length).map((p) => +p[0].toFixed(6)).sort(), [6, 6, 6.06, 6.06]);
  // Felder nur zur Laufzeit: an jedem Segment vorhanden
  for (const s of [...eg, ...kg]) assert.ok("joinA" in s && "joinB" in s && "flush" in s);
});

test("T-Stöße enden in der Mitte der durchgehenden Wand: Innenwand 0, Außenwand 0,12", () => {
  const eg = computeWalls(floorById("eg"), settings).segments;
  const kf = at(eg, [7, 4], [11, 4]); // Küche|Flur stößt bei (7,4) auf die Innenwand x = 7
  assert.equal(kf[`extend${endAt(kf, [7, 4])}`], 0);
  const wk = at(eg, [7, 0], [7, 4]); // Wohnzimmer|Küche stößt bei (7,0) auf die Außenwand z = 0
  assert.ok(Math.abs(wk[`extend${endAt(wk, [7, 0])}`] - 0.12) < 1e-9);
  const fp = pieceFootprint(wk, 0, wk.length);
  assert.ok(Math.min(...fp.map((p) => p[1])) > -0.12 - 1e-9 && Math.min(...fp.map((p) => p[1])) < -0.12 + 1e-9);
});

test("L-Ecke aus zwei Innenwänden bekommt eine Gehrung", () => {
  // L-Raum a umschließt b; die Wände a|b bilden bei (3,2) eine L-Ecke
  const a = { id: "a", points: [[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]] };
  const b = rect("b", 3, 2, 6, 5);
  const { segments } = computeWalls(floorOf([a, b]), S);
  const h = at(segments, [3, 2], [6, 2]);
  const v = at(segments, [3, 2], [3, 5]);
  assert.equal(h.kind, "interior");
  assert.equal(v.kind, "interior");
  const jh = h[`join${endAt(h, [3, 2])}`];
  const jv = v[`join${endAt(v, [3, 2])}`];
  assert.ok(jh && jv);
  const pts = (j) => j.map((p) => p.map((x) => +x.toFixed(6))).sort((p, q) => p[0] - q[0]);
  assert.deepEqual(pts(jh), [[2.94, 1.94], [3.06, 2.06]]);
  assert.deepEqual(pts(jv), pts(jh));
  assert.equal(h[`extend${endAt(h, [3, 2])}`], 0);
  const fps = planFootprints(segments);
  assert.deepEqual(doubleFaces(fps), []);
  assert.deepEqual(holes(fps), []);
});

test("Freie Wände: enden auf einer Wand, bis 10 cm davor oder ragen hinein – bis zu deren Mitte", () => {
  const room = rect("a", 0, 0, 4, 3); // Außenwand x = 4 liegt zwischen 4 und 4,24, Mitte 4,12
  const cases = [
    [4.12, 0], // genau in der Mitte
    [4.3, 0.18], // 6 cm vor der Außenseite
    [4.24, 0.12], // auf der Außenseite
    [4.0, -0.12], // bis zur Raumseite durchgezogen: kürzen
    [4.4, 0], // 16 cm davor: kein Anschluss
  ];
  for (const [x, ext] of cases) {
    const { segments } = computeWalls(floorOf([room], [freeWall("w", [6, 1.5], [x, 1.5])]), S);
    const w = segments.find((s) => s.freeId === "w");
    assert.ok(Math.abs(w.extendB - ext) < 1e-9, `Ende bei ${x}: ${w.extendB}`);
    const fp = pieceFootprint(w, 0, w.length);
    const endX = Math.min(...fp.map((p) => p[0]));
    assert.ok(Math.abs(endX - (ext ? 4.12 : x)) < 1e-9, `Ende bei ${x}: x = ${endX}`);
  }
  // von innen auf die Außenwand oben (z = 3, Mitte 3,12) und auf eine Innenwand (Mitte x = 4)
  const inner = computeWalls(floorOf([room], [freeWall("w", [2, 1.5], [2, 2.95])]), S).segments.find((s) => s.freeId === "w");
  assert.ok(Math.abs(inner.extendB - 0.17) < 1e-9);
  const two = [room, rect("b", 4, 0, 8, 3)];
  const toInterior = computeWalls(floorOf(two, [freeWall("w", [6, 1.5], [4.1, 1.5])]), S).segments.find((s) => s.freeId === "w");
  assert.ok(Math.abs(toInterior.extendB - 0.1) < 1e-9);
  // freie Wand stößt mitten auf eine andere freie Wand: bis zu deren Mitte (0)
  const t = computeWalls(floorOf([], [freeWall("l", [0, 0], [4, 0]), freeWall("t", [2, 2], [2, 0.03])]), S).segments.find((s) => s.freeId === "t");
  assert.ok(Math.abs(t.extendB - 0.03) < 1e-9);
  // ganz durchgezogen (50 cm in den Raum): kein Anschluss, Wand bleibt wie gezeichnet
  const through = computeWalls(floorOf([room], [freeWall("w", [6, 1.5], [3.5, 1.5])]), S).segments.find((s) => s.freeId === "w");
  assert.equal(through.extendB, 0);
  // eine sehr kurze freie Wand wird höchstens bis auf 5 cm gekürzt
  const tiny = computeWalls(floorOf([room], [freeWall("w", [4.08, 1.5], [4.0, 1.5])]), S).segments.find((s) => s.freeId === "w");
  assert.ok(tiny.length - -tiny.extendB >= 0.05 - 1e-9);
});

test("Ketten freier Wände: L-Ecken mit Gehrung, gerade Fortsetzung stumpf", () => {
  const walls = [freeWall("a", [10, 0], [12, 0]), freeWall("b", [12, 0], [12, 2]), freeWall("c", [12, 2], [10, 2]), freeWall("d", [10, 2], [9, 2])];
  const { segments } = computeWalls(floorOf([], walls), S);
  const by = (id) => segments.find((s) => s.freeId === id);
  const pts = (j) => j.map((p) => p.map((x) => +x.toFixed(6))).sort((p, q) => p[0] - q[0]);
  assert.deepEqual(pts(by("a").joinB), [[11.94, 0.06], [12.06, -0.06]]);
  assert.deepEqual(pts(by("b").joinA), pts(by("a").joinB));
  assert.deepEqual(pts(by("b").joinB), [[11.94, 1.94], [12.06, 2.06]]);
  assert.deepEqual(pts(by("c").joinA), pts(by("b").joinB));
  // c läuft in d gerade weiter: stumpf, ohne Gehrung und ohne Verlängerung
  assert.equal(by("c").joinB, null);
  assert.equal(by("c").extendB, 0);
  assert.equal(by("d").extendA, 0);
  // freies Ende bleibt, wie es ist
  assert.equal(by("a").extendA, 0);
  assert.equal(by("a").joinA, null);
  const fps = planFootprints(segments);
  assert.deepEqual(doubleFaces(fps), []);
  assert.deepEqual(holes(fps), []);
});

test("Bündige Raumseite wird in Ketten von Außenwänden desselben Raums weitergegeben", () => {
  // Innenwand a|b auf x = 4 von z 0 bis 2, darüber Außenwand von a; c teilt sie bei z = 2,5 (Ecke von a und c auf der Linie)
  const a = { id: "a", points: [[0, 0], [4, 0], [4, 2.5], [4, 3], [0, 3]] };
  const b = rect("b", 4, 0, 8, 2);
  const c = { id: "c", points: [[4, 2.5], [6, 2.5], [6, 3.5], [4.5, 3.5]] };
  const { segments } = computeWalls(floorOf([a, b, c]), S);
  const s1 = at(segments, [4, 2], [4, 2.5]);
  const s2 = at(segments, [4, 2.5], [4, 3]);
  assert.equal(s1.kind, "exterior");
  assert.equal(s2.kind, "exterior");
  assert.equal(s1.flush, 0.06);
  assert.equal(s2.flush, 0.06);
  // Außenwände anderer Räume auf derselben Linie bekommen keinen Streifen
  for (const s of segments) if (s !== s1 && s !== s2) assert.equal(s.flush, 0, s.id);
  // ohne Innenwand kein Streifen
  assert.ok(computeWalls(floorOf([a, c]), S).segments.every((s) => s.flush === 0));
});

test("Wandflächen zum Einrasten liegen auf dem bündigen Streifen", () => {
  const { segments } = computeWalls(floorById("kg"), settings);
  const faces = wallFaces(segments);
  const hobby = faces.find((f) => Math.abs(f.u[0]) < 1e-9 && f.n[0] > 0 && f.p[1] >= 5 - 1e-9 && Math.abs(f.p[0] - 6.06) < 1e-9);
  assert.ok(hobby, JSON.stringify(faces.filter((f) => Math.abs(f.p[0] - 6) < 0.1)));
  // die Innenwand darunter hat ihre Fläche ebenfalls bei 6,06: Möbel stehen bündig an beiden
  assert.ok(faces.some((f) => Math.abs(f.p[0] - 6.06) < 1e-9 && f.n[0] > 0 && f.p[1] < 5));
  assert.equal(faces.length, segments.reduce((n, s) => n + (s.roomLeft ? 1 : 0) + (s.roomRight ? 1 : 0), 0));
});

test("planFootprints: eine Fläche je Wand plus Streifen", () => {
  for (const floor of building.floors) {
    const { segments } = computeWalls(floor, settings);
    const fps = planFootprints(segments);
    assert.equal(fps.length, segments.length + segments.filter((s) => s.flush > 0).length);
    for (const fp of fps) for (const p of fp) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }
  assert.deepEqual(planFootprints([]), []);
});

// Zufallsgrundrisse: Rechteck in Räume zerlegt (Schnitte im 0,5-m-Raster), dazu Fenster und Türen
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomPlan(seed) {
  const rnd = mulberry32(seed);
  const W = 6 + Math.floor(rnd() * 16) * 0.5;
  const D = 5 + Math.floor(rnd() * 14) * 0.5;
  let boxes = [[0, 0, W, D]];
  const n = 3 + Math.floor(rnd() * 6);
  for (let guard = 0; boxes.length < n && guard < 50; guard++) {
    boxes.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]));
    const [x0, z0, x1, z1] = boxes[0];
    const alongX = x1 - x0 >= z1 - z0;
    const lo = alongX ? x0 : z0;
    const hi = alongX ? x1 : z1;
    if (hi - lo < 3) break;
    const cut = lo + 1.5 + Math.floor(rnd() * ((hi - lo - 3) / 0.5 + 1)) * 0.5;
    boxes = [...boxes.slice(1), alongX ? [x0, z0, cut, z1] : [x0, z0, x1, cut], alongX ? [cut, z0, x1, z1] : [x0, cut, x1, z1]];
  }
  const rooms = boxes.map((b, i) => rect(`r${i}`, ...b));
  const openings = rooms.flatMap((r, i) =>
    [0, 1, 2, 3].filter(() => rnd() < 0.5).map((edge) => {
      const p = r.points[edge];
      const q = r.points[(edge + 1) % 4];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const width = Math.min(0.9, l - 0.2);
      return { id: `o${i}_${edge}`, room_id: r.id, edge, offset: width / 2 + rnd() * (l - width), width, type: rnd() < 0.5 ? "door" : "window", sill: 0.9, height: 1.2 };
    }),
  );
  return { rooms, openings };
}

test("30 Zufallsgrundrisse: keine doppelten Flächen, keine Spalte, keine umgedrehten Stücke", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { rooms, openings } = randomPlan(seed);
    const { segments, openings: placed } = computeWalls(floorOf(rooms, [], openings), S);
    const fps = planFootprints(segments);
    assert.deepEqual(doubleFaces(fps), [], `Plan ${seed}`);
    assert.deepEqual(holes(fps), [], `Plan ${seed}`);
    assertPieces(segments, placed, `Plan ${seed}`);
    // ohne einen Raum am Rand (L-förmiger Umriss): Gehrungen und Streifen bleiben sauber
    const corner = rooms.find((r) => r.points.some((p) => p[0] === 0 && p[1] === 0));
    const rest = rooms.filter((r) => r !== corner);
    const cut = computeWalls(floorOf(rest, [], openings.filter((o) => o.room_id !== corner.id)), S);
    const fps2 = planFootprints(cut.segments);
    assert.deepEqual(doubleFaces(fps2), [], `Plan ${seed} ohne Ecke`);
    assert.deepEqual(holes(fps2), [], `Plan ${seed} ohne Ecke`);
    assertPieces(cut.segments, cut.openings, `Plan ${seed} ohne Ecke`);
  }
});

test("Robustheit: spitze Winkel, Kleinstwände, Kreuzungen und Ecken mit freien Wänden bleiben endlich", () => {
  const sharp = { id: "s", points: [[0, 0], [6, 0], [6, 0.4]] }; // sehr spitzer Winkel
  const room = rect("a", 10, 0, 14, 3);
  const walls = [
    freeWall("w1", [20, 0], [20.04, 0]), // kürzer als die Mindestlänge (5 cm): entfällt
    freeWall("w2", [20, 1], [21, 1.02]),
    freeWall("w3", [20.5, 0.5], [20.5, 1.5]), // kreuzt w2
    freeWall("w4", [16, 0], [14, 0]), // endet auf einer Hausecke
    freeWall("w5", [22, 0], [23, 0]),
    freeWall("w6", [23, 0], [22.05, 0.2]), // spitze L-Ecke zweier freier Wände
    freeWall("w7", [12, 1.5], [12, 1.5]), // Länge 0
  ];
  const { segments, openings } = computeWalls(floorOf([sharp, room], walls), S);
  assert.ok(!segments.some((s) => s.freeId === "w1" || s.freeId === "w7"));
  assertPieces(segments, openings, "robust");
  for (const fp of planFootprints(segments)) for (const p of fp) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  for (const s of segments) assert.ok(Number.isFinite(s.extendA) && Number.isFinite(s.extendB) && Number.isFinite(s.flush));
});

test("Keine umgedrehten Stücke: Fenster dicht an einer Gehrung im Innenwinkel", () => {
  // Schlafzimmer-Außenwand x = 7 (z 7..8) hat die Gehrung bei z = 7,24 auf der Außenseite; das Fenster beginnt bei 7,1
  const floor = structuredClone(floorById("eg"));
  floor.openings = [
    { id: "nah", room_id: "schlafzimmer", edge: 1, offset: 2.5, width: 0.8, type: "window", sill: 0.9, height: 1.2 },
    { id: "nah2", room_id: "flur", edge: 2, offset: 3.85, width: 0.2, type: "window", sill: 0.9, height: 1.2 },
  ];
  const { segments, openings, warnings } = computeWalls(floor, settings);
  assert.equal(openings.length, 2, warnings.join("; "));
  const seg = at(segments, [7, 7], [7, 8]);
  const first = wallPieces(seg, openings, 2.6)[0];
  assert.ok(first.s1 < 0.24, JSON.stringify(first));
  assertPieces(segments, openings, "nah");
});
