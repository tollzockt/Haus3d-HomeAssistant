// Verdeckte Flächen der Wandstücke (wallcull.js): Stirn-, Seiten-, Deck- und Unterflächen, die an oder in einer
// anderen Wand liegen, fallen weg (sonst blitzen ihre Kanten als Haarlinien durch); die sichtbare Hülle bleibt
// geschlossen (keine Löcher an freien Wandenden, Laibungen, Schwellen und Stufen unter der Dachschräge).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { atticTop } from "../../custom_components/haus3d/frontend/gable.js";
import { atticModels } from "../../custom_components/haus3d/frontend/roofunits.js";
import { computeWalls } from "../../custom_components/haus3d/frontend/walls.js";
import { BASE_OVERLAP, floorPrisms, segmentInside, subtractConvex, visibleFaces } from "../../custom_components/haus3d/frontend/wallcull.js";

const DATA = new URL("../../custom_components/haus3d/haus-daten.json", import.meta.url);
const building = JSON.parse(readFileSync(DATA, "utf8"));
const S = { wall_exterior: 0.24, wall_interior: 0.12 };
const rect = (id, x0, z0, x1, z1) => ({ id, name: id, points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
const paint = (seg) => ({ side: "wand", cap: "deckel", flush: seg.flush ? "streifen" : null });

/** Stücke einer Etage wie in der Szene. */
function prismsOf(floor, { elev = 0, base = 0.15, height = floor.height ?? 2.5, steps } = {}) {
  const { segments, openings } = computeWalls(floor, S);
  return { segments, openings, prisms: floorPrisms(segments, openings, { elev, base, height, paint, steps }) };
}

// --- Geometrie-Helfer --------------------------------------------------------------------------------------
function inPoly(p, P, tol = 0) {
  let sgn = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-12) continue;
    if (Math.abs(c / l) <= tol) continue;
    if (sgn && Math.sign(c) !== sgn) return false;
    sgn = Math.sign(c);
  }
  return true;
}
// Punkt echt in einem Stück (konvexer Grundriss, 1 µm Abstand zum Rand) bzw. mit Rand (closed)
const insidePrism = (p, s, closed = false) => {
  const e = closed ? -1e-7 : 1e-6;
  if (!(p[1] > s.y0 + e && p[1] < s.y1 - e) || !inPoly([p[0], p[2]], s.foot, closed ? 1e-7 : 0)) return false;
  return closed || !s.foot.some((q, i) => {
    const r = s.foot[(i + 1) % s.foot.length];
    const l = Math.hypot(r[0] - q[0], r[1] - q[1]);
    return l > 1e-12 && Math.abs(((r[0] - q[0]) * (p[2] - q[1]) - (r[1] - q[1]) * (p[0] - q[0])) / l) < 1e-6;
  });
};
/** Liegt der Punkt auf einer sichtbaren Fläche? */
function onFace(p, faces) {
  return faces.some(({ pts, out }) => {
    if (Math.abs(out[1]) > 0.5) {
      if (Math.abs(p[1] - pts[0][1]) > 1e-9) return false;
      return inPoly([p[0], p[2]], pts.map((q) => [q[0], q[2]]), 1e-9);
    }
    // Seitenfläche: Abstand zur Ebene, dann im Vieleck (waagerecht entlang der Ebene, Höhe)
    const off = Math.abs((p[0] - pts[0][0]) * out[0] + (p[2] - pts[0][2]) * out[2]);
    const uv = (q) => [q[0] * -out[2] + q[2] * out[0], q[1]];
    return off < 1e-7 && inPoly(uv(p), pts.map(uv), 1e-9);
  });
}
/** Flächen eines Stücks vor dem Weglassen: [{pt(u, v), out}] (u, v von 0 bis 1). */
function rawFaces(s) {
  const f = s.foot;
  const cx = f.reduce((a, q) => a + q[0], 0) / f.length;
  const cz = f.reduce((a, q) => a + q[1], 0) / f.length;
  const list = [];
  f.forEach((P, i) => {
    const Q = f[(i + 1) % f.length];
    const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    if (L < 5e-3 || s.y1 - s.y0 < 5e-3) return;
    let m = [(Q[1] - P[1]) / L, -(Q[0] - P[0]) / L];
    if (((P[0] + Q[0]) / 2 - cx) * m[0] + ((P[1] + Q[1]) / 2 - cz) * m[1] < 0) m = [-m[0], -m[1]];
    list.push({ out: [m[0], 0, m[1]], pt: (u, v) => [P[0] + (Q[0] - P[0]) * u, s.y0 + (s.y1 - s.y0) * v, P[1] + (Q[1] - P[1]) * u] });
  });
  // Deck- und Unterfläche: Punkte zwischen Mitte und Ecken
  const cap = (y, oy) => ({ out: [0, oy, 0], pt: (u, v) => {
    const a = f[Math.floor(u * f.length) % f.length];
    const k = 0.15 + 0.7 * v;
    return [cx + (a[0] - cx) * k, y, cz + (a[1] - cz) * k];
  } });
  if (s.top !== false) list.push(cap(s.y1, 1));
  if (s.bottom !== false) list.push(cap(s.y0, -1));
  return list;
}
const FR = [0.1, 0.3, 0.5, 0.7, 0.9];
/**
 * Prüft: (1) keine sichtbare Fläche liegt an oder in einer anderen Wand (1 mm davor ist keine Wand),
 * (2) jeder Punkt der Hülle (1 mm davor keine Wand) liegt auf einer sichtbaren Fläche.
 */
function checkHull(prisms, faces, label, extra = []) {
  const all = [...prisms, ...extra];
  const near = (p) => all.filter((s) => s.foot && s.foot.some((q) => Math.abs(q[0] - p[0]) < 30 && Math.abs(q[1] - p[2]) < 30));
  const hidden = [];
  for (const f of faces) {
    const c = [0, 1, 2].map((k) => f.pts.reduce((a, q) => a + q[k], 0) / f.pts.length);
    for (const w of [0, 0.4]) {
      const p = c.map((v, k) => v + (f.pts[0][k] - v) * w + f.out[k] * 1e-3);
      if (near(p).some((s) => insidePrism(p, s))) hidden.push({ at: c.map((v) => +v.toFixed(3)), out: f.out });
    }
  }
  assert.deepEqual(hidden.slice(0, 5), [], `${label}: verdeckte Flächen gezeichnet`);
  const holes = [];
  for (const s of prisms) {
    for (const rf of rawFaces(s)) {
      for (const u of FR) {
        for (const v of FR) {
          const p = rf.pt(u, v);
          const q = p.map((x, k) => x + rf.out[k] * 1e-3);
          if (near(q).some((o) => o !== s && insidePrism(q, o, true))) continue; // verdeckt (auch auf einer Stoßfuge)
          if (!onFace(p, faces)) holes.push(p.map((x) => +x.toFixed(4)));
        }
      }
    }
  }
  assert.deepEqual(holes.slice(0, 5), [], `${label}: Loch in der Hülle`);
  // (3) keine T-Stellen: keine Ecke einer Fläche liegt mitten auf der Kante einer anderen Fläche derselben Ebene
  const tees = [];
  const plane = (f) => `${f.out.map((v) => Math.round(v * 1e6))}|${Math.round((f.out[0] * f.pts[0][0] + f.out[1] * f.pts[0][1] + f.out[2] * f.pts[0][2]) * 1e6)}`;
  const byPlane = new Map();
  for (const f of faces) byPlane.set(plane(f), [...(byPlane.get(plane(f)) ?? []), f]);
  for (const list of byPlane.values()) {
    const verts = list.flatMap((f) => f.pts);
    for (const f of list) {
      f.pts.forEach((a, i) => {
        const b = f.pts[(i + 1) % f.pts.length];
        const d = b.map((v, k) => v - a[k]);
        const L = Math.hypot(...d);
        if (L < 1e-9) return;
        for (const p of verts) {
          const w = p.map((v, k) => v - a[k]);
          const along = (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / L;
          const perp = Math.hypot(...w.map((v, k) => v - (d[k] / L) * along));
          if (along > 1e-6 && along < L - 1e-6 && perp < 1e-8) tees.push(p.map((v) => +v.toFixed(4)));
        }
      });
    }
  }
  assert.deepEqual(tees.slice(0, 5), [], `${label}: T-Stellen`);
}

// --- Grundbausteine -------------------------------------------------------------------------------------------
test("segmentInside und subtractConvex", () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.deepEqual(segmentInside([-1, 0.5], [2, 0.5], sq).map((x) => +x.toFixed(9)), [0.333333333, 0.666666667]);
  assert.equal(segmentInside([-1, 2], [2, 2], sq), null);
  assert.deepEqual(segmentInside([0, 0], [1, 0], sq), [0, 1]); // Rand zählt dazu
  const cut = subtractConvex([[0, 0], [4, 0], [4, 1], [0, 1]], [[1, -1], [2, -1], [2, 0.5], [1, 0.5]]);
  const area = (P) => Math.abs(P.reduce((a, p, i) => a + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
  assert.ok(Math.abs(cut.parts.reduce((a, P) => a + area(P), 0) - 3.5) < 1e-12);
  assert.ok(Math.abs(area(cut.inside) - 0.5) < 1e-12);
  // berühren reicht nicht: Fläche bleibt ganz
  const touch = subtractConvex([[0, 0], [1, 0], [1, 1], [0, 1]], [[1, 0], [2, 0], [2, 1], [1, 1]]);
  assert.equal(touch.parts.length, 1);
  assert.equal(touch.inside, null);
});

test("Zwei Stücke hintereinander: Stoßflächen fallen weg, Deckfläche darunter in lids", () => {
  const a = { foot: [[0, 0], [2, 0], [2, 0.2], [0, 0.2]], y0: 0, y1: 2, side: "a", cap: "c" };
  const b = { foot: [[2, 0], [4, 0], [4, 0.2], [2, 0.2]], y0: 0, y1: 1, side: "b", cap: "c" };
  const up = { foot: [[0, -0.1], [1, -0.1], [1, 0.3], [0, 0.3]], y0: 2 - BASE_OVERLAP, y1: 2.2 };
  const { faces, lids } = visibleFaces([a, b], { above: [up] });
  const at2 = faces.filter((f) => f.out[1] === 0 && f.pts.every((p) => Math.abs(p[0] - 2) < 1e-12));
  // Stirn von a bei x = 2 nur über b (1 … 2), Stirn von b ganz weg
  assert.equal(at2.length, 1);
  assert.deepEqual([at2[0].pts[0][1], at2[0].pts[2][1]], [1, 2]);
  assert.deepEqual(at2[0].out, [1, 0, -0]);
  checkHull([a, b], faces, "zwei Stücke", [up]);
  // Deckfläche von a: die Hälfte unter dem Stück darüber als Deckel
  assert.equal(lids.length, 1);
  assert.ok(lids[0].pts.every((p) => p[0] <= 1 + 1e-12 && p[1] === 2));
});

// --- Beispielhaus ----------------------------------------------------------------------------------------------
for (const id of ["kg", "eg"]) {
  test(`Beispielhaus ${id}: Hülle ohne verdeckte Flächen und ohne Löcher`, () => {
    const floor = building.floors.find((f) => f.id === id);
    const { prisms } = prismsOf(floor);
    const { faces, lids } = visibleFaces(prisms);
    assert.equal(lids.length, 0);
    checkHull(prisms, faces, id);
    for (const f of faces) for (const p of f.pts) assert.ok(p.every(Number.isFinite));
  });
}

test("T-Stoß Küche|Flur an die Außenwand x = 11 und Laibungen, Schwellen", () => {
  const eg = building.floors.find((f) => f.id === "eg");
  const { prisms } = prismsOf(eg);
  const { faces } = visibleFaces(prisms);
  const side = (fn) => faces.filter((f) => f.out[1] === 0 && fn(f));
  const xs = (f) => f.pts.map((p) => p[0]);
  const zs = (f) => f.pts.map((p) => p[2]);
  // Stirn der Innenwand in der Außenwand (x = 11,12) und Stoßflächen der geteilten Außenwand (z = 4) fehlen
  assert.deepEqual(side((f) => xs(f).every((x) => Math.abs(x - 11.12) < 1e-9)), []);
  assert.deepEqual(side((f) => zs(f).every((z) => Math.abs(z - 4) < 1e-9) && xs(f).every((x) => x >= 11 - 1e-9)), []);
  // Innenseite der Außenwand hinter der Innenwand (z 3,94 … 4,06) fehlt, daneben ist sie da
  const inner = side((f) => xs(f).every((x) => Math.abs(x - 11) < 1e-9) && f.out[0] < 0);
  const covers = (z, y) => inner.some((f) => Math.min(...zs(f)) <= z && Math.max(...zs(f)) >= z && f.pts[0][1] <= y && f.pts[2][1] >= y);
  assert.equal(covers(4, 1), false);
  assert.equal(covers(3.9, 1), true);
  assert.equal(covers(4.1, 1), true);
  // Fensterlaibung Küche Ost (x = 11, z 1,5 … 2,5, Brüstung 1, Höhe 1,2): nur zwischen 1 und 2,2
  const reveal = side((f) => zs(f).every((z) => Math.abs(z - 1.5) < 1e-9) && f.out[2] > 0);
  assert.deepEqual(reveal.map((f) => [f.pts[0][1], f.pts[2][1]]), [[1, 2.2]]);
  // Durchgang Wohnzimmer|Küche (x = 7, z 1,4 … 2,6): Laibung bis 2,1, keine Deckfläche des Wandfußes (Böden)
  const pass = side((f) => zs(f).every((z) => Math.abs(z - 1.4) < 1e-9) && f.out[2] > 0 && xs(f).every((x) => x > 6.9 && x < 7.1));
  assert.deepEqual(pass.map((f) => [f.pts[0][1], f.pts[2][1]]), [[0, 2.1]]);
  const caps0 = faces.filter((f) => f.out[1] === 1 && f.pts.every((p) => p[1] === 0));
  assert.ok(!caps0.some((f) => f.pts.every((p) => p[0] > 6.9 && p[0] < 7.1 && p[2] > 1.4 && p[2] < 2.6)));
  // Haustür (Flur, Außenwand x = 11): Schwelle bleibt
  assert.ok(caps0.some((f) => f.pts.every((p) => p[0] >= 11 - 1e-9 && p[0] <= 11.24 + 1e-9)));
});

test("Freie Wand: freies Ende bleibt, das Ende in der Außenwand fällt weg", () => {
  const floor = { id: "f", rooms: [rect("a", 0, 0, 5, 4)], walls: [{ id: "w", a: [2, 1.5], b: [2, 4] }], openings: [] };
  const { prisms } = prismsOf(floor);
  const { faces } = visibleFaces(prisms);
  checkHull(prisms, faces, "freie Wand");
  const ends = faces.filter((f) => f.out[1] === 0 && Math.abs(f.out[2]) > 0.99 && f.pts.every((p) => Math.abs(p[0] - 2) <= 0.06 + 1e-9));
  // freies Ende bei z = 1,5 in voller Höhe (Wandfuß darunter: eigene Fläche), keins bei 4,12
  assert.ok(ends.some((f) => f.pts.every((p) => Math.abs(p[2] - 1.5) < 1e-9) && f.pts[0][1] === 0 && f.pts[2][1] === 2.5));
  assert.ok(!ends.some((f) => f.pts.every((p) => p[2] > 3.9)));
});

test("Gehrung (L-Ecke) und bündiger Streifen: Stoßflächen fallen weg", () => {
  const a = { id: "a", points: [[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]] };
  const b = rect("b", 3, 2, 6, 5);
  for (const [label, floor] of [["L", { id: "f", rooms: [a, b], openings: [] }], ["Streifen", building.floors.find((f) => f.id === "kg")]]) {
    const { prisms } = prismsOf(floor);
    const { faces } = visibleFaces(prisms);
    checkHull(prisms, faces, label);
    assert.ok(faces.length < prisms.length * 6, `${label}: ${faces.length} von ${prisms.length * 6}`);
  }
});

test("Dachgeschoss: Stufen unter der Schräge ohne Stoßflächen, Setzstufen bleiben", () => {
  const b = {
    settings: { ...S, roof: { type: "gable", pitch: 40, overhang: 0.4 } },
    floors: [
      { id: "eg", elevation: 0, height: 2.5, rooms: [rect("a", 0, 0, 10, 6)] },
      {
        id: "dg", elevation: 2.75, height: 2.4, attic: true, knee: 1,
        rooms: [rect("w", 0, 0, 6, 6), rect("s", 6, 0, 10, 6)],
        walls: [{ id: "fw", a: [3, 0], b: [3, 2] }],
        openings: [{ id: "it", type: "door", room_id: "w", edge: 1, offset: 0.8, width: 1, height: 2.1, sill: 0 }],
      },
    ],
  };
  const dg = b.floors[1];
  const models = atticModels(b).get("dg");
  const steps = (seg) => atticTop(models, seg, 2.75, 2.4, 1);
  const { prisms, segments } = prismsOf(dg, { elev: 2.75, base: 0.25, height: 2.4, steps });
  const egp = prismsOf(b.floors[0]).prisms;
  const { faces, lids } = visibleFaces(prisms, { below: egp });
  checkHull(prisms, faces, "Dachgeschoss", egp);
  // Innenwand x = 6: viele Stufen, aber je Seite keine Stoßfläche unterhalb der niedrigeren Nachbarstufe
  const inner = segments.find((s) => s.kind === "interior");
  const st = steps(inner);
  assert.ok(st.length > 10);
  const risers = faces.filter((f) => Math.abs(f.out[2]) > 0.99 && f.pts.every((p) => Math.abs(p[0] - 6) <= 0.06 + 1e-9) && f.pts.every((p) => p[2] > 1.4 && p[2] < 5.7)); // ohne die Tür (z 0,3 … 1,3)
  for (const r of risers) assert.ok(r.pts[0][1] >= 2.75 + 1 - 1e-6, `Setzstufe ab ${r.pts[0][1]}`);
  // Unterflächen des Wandfußes auf den EG-Wänden fallen weg, Deckel gibt es nur für die Etage darunter
  assert.equal(lids.length, 0);
  assert.ok(!faces.some((f) => f.out[1] === -1 && Math.abs(f.pts[0][1] - (2.75 - 0.25 - BASE_OVERLAP)) < 1e-9 && f.pts.every((p) => p[0] > 0.1 && p[0] < 9.9 && p[2] < 1e-9 && p[2] > -0.25)));
  const eg = visibleFaces(egp, { above: prisms.filter((p) => p.base) });
  assert.ok(eg.lids.length > 0);
  assert.ok(eg.lids.every((f) => f.out[1] === 1 && f.pts.every((p) => p[1] === 2.5)));
});

// Zufallsgrundrisse wie in wandanschluss.test.mjs (kleiner): Rechteck in Räume zerlegt, Fenster und Türen
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
test("15 Zufallsgrundrisse mit freien Wänden: Hülle ohne verdeckte Flächen und ohne Löcher", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const rnd = mulberry32(seed);
    const W = 6 + Math.floor(rnd() * 10) * 0.5;
    const D = 5 + Math.floor(rnd() * 8) * 0.5;
    let boxes = [[0, 0, W, D]];
    for (let guard = 0; boxes.length < 4 && guard < 20; guard++) {
      const [x0, z0, x1, z1] = boxes.shift();
      const alongX = x1 - x0 >= z1 - z0;
      const [lo, hi] = alongX ? [x0, x1] : [z0, z1];
      if (hi - lo < 3) {
        boxes.push([x0, z0, x1, z1]);
        break;
      }
      const cut = lo + 1.5 + Math.floor(rnd() * ((hi - lo - 3) / 0.5 + 1)) * 0.5;
      boxes.push(alongX ? [x0, z0, cut, z1] : [x0, z0, x1, cut], alongX ? [cut, z0, x1, z1] : [x0, cut, x1, z1]);
    }
    const rooms = boxes.map((b, i) => rect(`r${i}`, ...b));
    const openings = rooms.flatMap((r, i) => [0, 1, 2, 3].filter(() => rnd() < 0.5).map((edge) => {
      const p = r.points[edge];
      const q = r.points[(edge + 1) % 4];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const width = Math.min(0.9, l - 0.2);
      return { id: `o${i}_${edge}`, room_id: r.id, edge, offset: width / 2 + rnd() * (l - width), width, type: rnd() < 0.5 ? "door" : "window", sill: rnd() < 0.5 ? 0 : 0.9, height: 1.2 + rnd() };
    }));
    const walls = [{ id: "fw", a: [W / 2 + 0.25, D / 2], b: [W / 2 + 0.25, D + 0.05], height: rnd() < 0.5 ? 1.2 : null }];
    const { prisms } = prismsOf({ id: "f", rooms, openings, walls });
    const { faces } = visibleFaces(prisms);
    checkHull(prisms, faces, `Plan ${seed}`);
  }
});

test("Robust: leere Listen, kaputte und nicht konvexe Grundrisse", () => {
  assert.deepEqual(visibleFaces([]), { faces: [], lids: [] });
  assert.deepEqual(visibleFaces(null), { faces: [], lids: [] });
  const bad = [
    { foot: [[0, 0], [Number.NaN, 0], [1, 1], [0, 1]], y0: 0, y1: 1, side: "s", cap: "c" },
    { foot: null, y0: 0, y1: 1 },
    { foot: [[0, 0], [1, 0], [1, 1]], y0: 1, y1: 1 },
    { foot: [[5, 0], [7, 0], [6, 0.2], [7, 1], [5, 1]], y0: 0, y1: 1, side: "s", cap: "c" }, // nicht konvex
  ];
  const { faces } = visibleFaces(bad);
  for (const f of faces) for (const p of f.pts) assert.ok(p.every(Number.isFinite));
  assert.ok(faces.some((f) => f.out[1] === 1 && f.pts.length === 5)); // nicht konvex: Deckfläche ungeschnitten
});
