// Treppen 0.23: Deckenöffnung nach Kopfhöhe (automatisch, eigene Maße, keine), Geländerkanten an der Öffnung,
// Treppenloch rund/eckig, Zuschneiden an konkaven Räumen, Ziel-Etage, Wendeltreppe rechts herum
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HOLE_CLEAR, RAIL_GAP, STAIR_SHAPES, defaultHole, holeRailing, roomHole, slabOpenings, spiralPoint, stairCeil,
  stairFootprint, stairLayout, stairOpening, stairOpeningLocal, stairTarget, wellOpeningLocal,
} from "../../custom_components/haus3d/frontend/stairs.js";
import { convexHull, ellipsePoly, guardEdges, isConvex, mergeHoles, polysOverlap, rectUnion } from "../../custom_components/haus3d/frontend/stairgeom.js";
import { pointInPolygon } from "../../custom_components/haus3d/frontend/walls.js";

const W = 2.2;
const D = 3;
const H = 2.8;
const CEIL = 2.4;
const pts = (t) => t.poly ?? [[t.x0, t.z0], [t.x1, t.z0], [t.x1, t.z1], [t.x0, t.z1]];
const area = (p) => Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2;
const segDist = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1]];
  const l2 = d[0] * d[0] + d[1] * d[1];
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
};
const onBoundary = (p, poly, tol = 1e-6) => poly.some((a, i) => segDist(p, a, poly[(i + 1) % poly.length]) <= tol);
const inOrOn = (p, poly) => pointInPolygon(p, poly) || onBoundary(p, poly);
const mean = (p) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
const room = (id, x0, z0, x1, z1) => ({ id, points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
const house = (stair, upperRooms = [room("flur", 0, 0, 10, 10)], own = []) => ({
  floors: [
    { id: "kg", name: "KG", elevation: -2.8, height: 2.4, rooms: [], furniture: [{ id: "t", type: "stairs", x: 5, z: 5, rotation: 0, w: 1, d: 2.6, h: 2.8, ...stair }] },
    { id: "eg", name: "EG", elevation: 0, height: 2.6, rooms: upperRooms, furniture: own },
  ],
});

test("Automatische Öffnung je Form: Stufen unter 2 m Kopfhöhe in der Öffnung, freie Stufen mit Kopfhöhe, Austritt bündig", () => {
  for (const [shape] of STAIR_SHAPES) {
    const item = { stair_shape: shape, w: W, d: D, h: H };
    const lay = stairLayout({ shape, w: W, d: D, h: H });
    const { poly, exit } = stairOpeningLocal(item, CEIL);
    assert.ok(poly.length >= 4, shape);
    for (const t of lay.treads) {
      if (t.top > CEIL - 2) for (const p of pts(t)) assert.ok(inOrOn(p, poly), `${shape}: Stufe ${t.top} Ecke ${p}`);
      else if (!pointInPolygon(mean(pts(t)), poly)) assert.ok(CEIL - t.top >= 2 - 1e-9, `${shape}: Kopfhöhe über ${t.top}`);
    }
    if (lay.radius) continue;
    // bündig: die Öffnung reicht genau bis zur Austrittskante
    const a = lay.path.at(-2);
    const b = lay.path.at(-1);
    const out = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
    const far = Math.max(...poly.map((p) => p[0] * out[0] + p[1] * out[1]));
    assert.ok(Math.abs(far - (exit[0][0] * out[0] + exit[0][1] * out[1])) < 1e-6, `${shape}: Austritt ${far}`);
  }
  assert.equal(stairOpeningLocal({ stair_shape: "u_left", w: W, d: D, h: H }, CEIL).poly.length, 6);
  assert.equal(stairOpeningLocal({ stair_shape: "u_right", w: W, d: D, h: H }, CEIL).poly.length, 6);
  // ohne Decke: Etagenhöhe = Treppenhöhe − Deckenstärke
  assert.ok(stairOpeningLocal({ stair_shape: "straight", w: 1, d: 3, h: 2.6 }).poly.length === 4);
});

test("Rechteck-Vereinigung: Lücke zwischen zwei Läufen wird gefüllt (4 Ecken), sonst U (8 Ecken)", () => {
  const rects = [{ x0: 0, x1: 1, z0: 0, z1: 3 }, { x0: 1.2, x1: 2.2, z0: 0, z1: 3 }, { x0: 0, x1: 2.2, z0: 3, z1: 4 }];
  const filled = rectUnion(rects);
  assert.equal(filled.length, 4);
  assert.ok(Math.abs(area(filled) - 8.8) < 1e-9);
  const open = rectUnion(rects, false);
  assert.equal(open.length, 8);
  assert.ok(Math.abs(area(open) - 8.2) < 1e-9);
  assert.deepEqual(rectUnion([]), []);
  assert.equal(rectUnion([{ x0: 0, x1: 1, z0: 0, z1: 1 }, { x0: 0.5, x1: 2, z0: 0.5, z1: 1.5 }]).length, 8);
});

test("Eigene Maße: eckig um den Versatz, rund mit 32 Ecken auf der Ellipse; Startwerte", () => {
  const item = { stair_shape: "straight", w: 1, d: 3, h: 2.6, hole: { w: 1.4, d: 2, dx: 0.2, dz: -0.3 } };
  const rect = stairOpeningLocal(item).poly;
  assert.deepEqual(rect.map((p) => p.map((v) => Math.round(v * 1000) / 1000)), [[-0.5, -1.3], [0.9, -1.3], [0.9, 0.7], [-0.5, 0.7]]);
  const round = stairOpeningLocal({ ...item, hole: { ...item.hole, round: true } }).poly;
  assert.equal(round.length, 32);
  for (let i = 0; i < 32; i++) {
    const p = round[i];
    const q = round[(i + 1) % 32];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    assert.ok(Math.abs(((m[0] - 0.2) / 0.7) ** 2 + ((m[1] + 0.3) / 1) ** 2 - 1) < 1e-9, `Kantenmitte ${i}`);
  }
  // 16 Ecken für das Geländer (grow)
  assert.equal(stairOpeningLocal({ ...item, hole: { ...item.hole, round: true } }, null, RAIL_GAP).poly.length, 16);
  // Startwerte: automatische Öffnung, auf cm gerundet; Wendeltreppe Kreis mit 8 cm Luft
  assert.deepEqual(defaultHole({ stair_shape: "straight", w: 1, d: 2.6, h: 2.8 }, 2.4), { w: 1.16, d: 2.36, dx: 0, dz: -0.12, round: false });
  assert.deepEqual(defaultHole({ stair_shape: "spiral", w: 1.6, d: 1.8, h: 2.8, hole: { w: 9, d: 9 } }, 2.4), { w: 1.76, d: 1.76, dx: 0, dz: 0, round: true });
  const lw = defaultHole({ stair_shape: "lw_left", w: W, d: D, h: H }, CEIL);
  assert.equal(lw.round, false);
  assert.ok(lw.w > 2 && lw.d > 2);
});

test("Deckenöffnung keine (cut: false) und eigene Maße in der Etage darüber", () => {
  assert.deepEqual(slabOpenings(house({ cut: false }), "eg"), []);
  assert.deepEqual(slabOpenings(house({ cut: false, hole: { w: 1, d: 1 } }), "eg"), []);
  const own = slabOpenings(house({ hole: { w: 1.4, d: 1.4 } }), "eg");
  assert.equal(own.length, 1);
  assert.equal(own[0].poly.length, 4);
  assert.ok(Math.abs(area(own[0].poly) - 1.96) < 1e-9);
  assert.equal(own[0].fid, "kg");
  assert.equal(own[0].id, "t");
});

test("Geländerkanten: automatisch Stäbe mit Treppengeländer, keins, Glas, an der Wand frei, Austritt offen", () => {
  const auto = slabOpenings(house({ railing: "right" }), "eg")[0];
  assert.equal(auto.railing, "bars");
  assert.equal(auto.edges.length, 3);
  // die offene Kante liegt am Austritt (z = 5 − 1,3), die Kanten stehen 3 cm neben der Öffnung
  assert.ok(auto.edges.every(([a, b]) => !(Math.abs(a[1] - 3.7) < 1e-6 && Math.abs(b[1] - 3.7) < 1e-6)));
  const xs = auto.edges.flat().map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - (5.5 + HOLE_CLEAR + RAIL_GAP)) < 1e-6);
  assert.equal(slabOpenings(house({}), "eg")[0].edges, undefined);
  assert.equal(slabOpenings(house({ railing: "none" }), "eg")[0].railing, undefined);
  assert.equal(slabOpenings(house({ railing: "both", hole_railing: "none" }), "eg")[0].edges, undefined);
  const glass = slabOpenings(house({ hole_railing: "glass" }), "eg")[0];
  assert.equal(glass.railing, "glass");
  assert.equal(glass.edges.length, 3);
  // Treppe an der Wand (Raumkante bei x = 4,39): diese Seite bleibt frei
  const wall = slabOpenings(house({ railing: "left" }, [room("flur", 4.39, 0, 10, 10)]), "eg")[0];
  assert.equal(wall.edges.length, 2);
  assert.ok(wall.edges.every(([a, b]) => !(Math.abs(a[0] - 4.39) < 0.01 && Math.abs(b[0] - 4.39) < 0.01)));
  // außerhalb jedes Raums: kein Geländer
  assert.equal(slabOpenings(house({ railing: "left" }, []), "eg")[0].edges.length, 0);
  assert.equal(holeRailing({ type: "stairs", railing: "left" }), "bars");
  assert.equal(holeRailing({ type: "stairs", railing: "left", hole_railing: "none" }), null);
  assert.equal(holeRailing({ type: "stairs", hole_railing: "wood" }), "wood");
  assert.equal(holeRailing({ type: "stairwell", railing: "left" }), null);
  assert.equal(holeRailing({ type: "stairwell", hole_railing: "glass" }), "glass");
});

test("Wendeltreppe: Geländer rund um die Öffnung, über dem Podest (Viertel) offen", () => {
  const o = slabOpenings(house({ stair_shape: "spiral", w: 1.6, d: 1.6, railing: "outer" }), "eg")[0];
  assert.equal(o.poly.length, 32);
  assert.equal(o.edges.length, 12); // 16 Kanten, 4 über dem Podest offen
  const g = stairOpening({ x: 5, z: 5, w: 1.6, d: 1.6, h: 2.8, stair_shape: "spiral" }, 2.4, RAIL_GAP);
  assert.equal(g.poly.length, 16);
  assert.equal(guardEdges(g.poly, g.exit, [room("r", 0, 0, 10, 10)]).length, 12);
  // keine Kante offen am Austritt → die nächstgelegene bleibt offen
  assert.equal(guardEdges([[0, 0], [1, 0], [1, 1], [0, 1]], [[5, 5], [6, 5]], [room("r", -5, -5, 10, 10)]).length, 3);
});

test("Treppenloch: eckig wie die Grundfläche, rund 32 Ecken, Vorderseite offen, über einer Treppenöffnung ohne Kanten", () => {
  const well = { id: "w", type: "stairwell", x: 3, z: 3, rotation: 90, w: 1.2, d: 2 };
  const plain = slabOpenings(house({}, undefined, [well]), "eg").find((o) => o.well);
  assert.deepEqual(plain.poly, stairFootprint(well));
  assert.equal(plain.edges, undefined);
  assert.equal(plain.fid, "eg");
  assert.equal(plain.from, "EG");
  const round = slabOpenings(house({}, undefined, [{ ...well, hole_round: true, hole_railing: "glass" }]), "eg").find((o) => o.well);
  assert.equal(round.poly.length, 32);
  assert.equal(round.railing, "glass");
  // Vorderseite (+z im Möbel-System, nach der Drehung um 90° bei −x) bleibt offen
  assert.ok(round.edges.length > 8 && round.edges.length < 16);
  const front = [3 - 1, 3];
  assert.ok(round.edges.every(([a, b]) => Math.hypot((a[0] + b[0]) / 2 - front[0], (a[1] + b[1]) / 2 - front[1]) > 0.1));
  const rect = slabOpenings(house({}, undefined, [{ ...well, hole_railing: "bars" }]), "eg").find((o) => o.well);
  assert.equal(rect.edges.length, 3);
  assert.equal(wellOpeningLocal({ w: 1, d: 2 }).exit[0][1], 1);
  // überlappt die Treppenöffnung (Treppe bei 5/5): kein eigenes Geländer
  const over = slabOpenings(house({ railing: "left" }, undefined, [{ ...well, x: 5, z: 5, hole_railing: "bars" }]), "eg");
  assert.equal(over.length, 2);
  assert.equal(over.find((o) => o.well).edges, undefined);
});

test("Zuschneiden an konkaven Räumen (4 Fälle)", () => {
  const L = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  const square = [[0, 0], [4, 0], [4, 4], [0, 4]];
  // 1. konvexe Öffnung im konkaven Raum
  const a = roomHole(L, [[1, 1], [3, 1], [3, 3], [1, 3]]);
  assert.ok(Math.abs(area(a) - 3) < 0.1);
  // 2. konkave Öffnung im konvexen Raum: am Raum abgeschnitten
  const hookHole = [[3, 1], [5, 1], [5, 3], [4.5, 3], [4.5, 1.5], [3, 1.5]];
  const b = roomHole(square, hookHole);
  assert.ok(b.every(([x]) => x < 4));
  assert.ok(Math.abs(area(b) - 0.5) < 0.05);
  // 3. konkave Öffnung ganz im konkaven Raum: bleibt, wie sie ist (nur eingerückt)
  const inner = [[0.5, 0.5], [1.5, 0.5], [1.5, 1], [1, 1], [1, 3], [0.5, 3]];
  const c = roomHole(L, inner);
  assert.equal(c.length, 6);
  assert.ok(Math.abs(area(c) - area(inner)) < 0.1);
  // 4. konkave Öffnung über die Raumecke: Hülle der Öffnung mit dem Raum geschnitten
  const across = [[1, 1], [3, 1], [3, 3], [2.5, 3], [2.5, 1.5], [1, 1.5]];
  const d = roomHole(L, across);
  assert.ok(d && d.every((p) => pointInPolygon(p, L) || onBoundary(p, L, 0.02)));
  assert.equal(isConvex(across), false);
  assert.equal(isConvex(square), true);
  assert.equal(roomHole(L, []), null);
});

test("Öffnungen zusammenfassen: nur echte Überlappung, Berühren nicht", () => {
  const a = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const touch = [[2, 0], [3, 0], [3, 2], [2, 2]];
  const over = [[1, 1], [3, 1], [3, 3], [1, 3]];
  const cross = [[0.5, -1], [1.5, -1], [1.5, 3], [0.5, 3]];
  assert.equal(polysOverlap(a, touch), false);
  assert.equal(polysOverlap(a, over), true);
  assert.equal(polysOverlap(a, cross), true);
  assert.equal(polysOverlap(a, a.map((p) => [...p])), true);
  assert.equal(polysOverlap(a, [[5, 5], [6, 5], [6, 6]]), false);
  assert.equal(mergeHoles([a, touch]).length, 2);
  const m = mergeHoles([a, over, [[10, 10], [11, 10], [11, 11], [10, 11]]]);
  assert.equal(m.length, 2);
  assert.ok(Math.abs(area(m[0]) - area(convexHull([...a, ...over]))) < 1e-9);
  assert.equal(convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]).length, 4);
});

test("Decke über der Treppe und Ziel-Etage", () => {
  const kg = { id: "kg", elevation: -2.8, height: 2.4 };
  assert.ok(Math.abs(stairCeil(kg, {}, 0) - 2.4) < 1e-9);
  assert.ok(Math.abs(stairCeil(kg, { mount_y: 0.2 }, 0) - 2.2) < 1e-9);
  assert.ok(Math.abs(stairCeil({ elevation: 0, height: 2.5 }, {}, 2.35) - 2.2) < 1e-9);
  const b = house({});
  assert.equal(stairTarget(b, b.floors[0], b.floors[0].furniture[0])?.id, "eg");
  assert.equal(stairTarget(b, b.floors[0], { h: 1.2 }), null);
  assert.equal(stairTarget(b, b.floors[1], { h: 2.6 }), null);
});

test("Wendeltreppe rechts herum: gespiegelt, Austrittspodest, 13 Austrittspunkte", () => {
  const l = stairLayout({ shape: "spiral", w: 1.6, d: 1.6, h: 2.8 });
  const r = stairLayout({ shape: "spiral_right", w: 1.6, d: 1.6, h: 2.8 });
  assert.equal(l.sign, 1);
  assert.equal(r.sign, -1);
  l.treads.forEach((t, i) => t.poly.forEach((p, k) => {
    assert.ok(Math.abs(p[0] + r.treads[i].poly[k][0]) < 1e-12 && Math.abs(p[1] - r.treads[i].poly[k][1]) < 1e-12);
  }));
  assert.equal(l.platform.top, 2.8);
  assert.equal(l.platform.poly.length, 14);
  assert.ok(!l.treads.includes(l.platform));
  assert.equal(l.exit.length, 13);
  assert.ok(l.exit.every((p) => Math.abs(Math.hypot(p[0], p[1]) - 0.8) < 1e-9));
  assert.deepEqual(spiralPoint(-1, 1, 90).map((v) => Math.round(v * 1e9) / 1e9), [-1, 0]);
  const hl = stairOpeningLocal({ stair_shape: "spiral", w: 1.6, d: 1.6, h: 2.8 }).poly;
  const hr = stairOpeningLocal({ stair_shape: "spiral_right", w: 1.6, d: 1.6, h: 2.8 }).poly;
  hl.forEach((p, i) => assert.ok(Math.abs(p[0] + hr[i][0]) < 1e-12));
  // über dem Podest bündig (Radius 0,8), sonst 8 cm Luft
  const radii = hl.map((p) => Math.hypot(p[0], p[1]) * Math.cos(Math.PI / 32));
  assert.ok(Math.abs(Math.min(...radii) - 0.8) < 1e-9 && Math.abs(Math.max(...radii) - 0.88) < 1e-9);
});

test("Layout-Felder: Gehrichtung der Laufstufen und Austrittskante", () => {
  const s = stairLayout({ shape: "straight", w: 1, d: 3, h: 2.6 });
  assert.ok(s.treads.every((t) => t.dir[0] === 0 && t.dir[1] === -1));
  assert.deepEqual(s.exit, [[-0.5, -1.5], [0.5, -1.5]]);
  const u = stairLayout({ shape: "u_left", w: 2.2, d: 3, h: 2.6 });
  const li = u.treads.findIndex((t) => t.landing);
  assert.equal(u.treads[li].dir, undefined);
  assert.ok(u.treads.slice(0, li).every((t) => t.dir[1] === -1) && u.treads.slice(li + 1).every((t) => t.dir[1] === 1));
  assert.ok(Math.abs(u.exit[0][0] + 1.1) < 1e-9 && Math.abs(u.exit[1][0] + 0.1) < 1e-9 && u.exit[0][1] === 1.5);
  const ur = stairLayout({ shape: "u_right", w: 2.2, d: 3, h: 2.6 });
  assert.ok(Math.abs(ur.exit[0][0] - 0.1) < 1e-9 && Math.abs(ur.exit[1][0] - 1.1) < 1e-9);
  for (const shape of ["l_left", "lw_left", "l_right", "lw_right"]) {
    const l = stairLayout({ shape, w: 2, d: 3, h: 2.6, run: 1 });
    const left = shape.endsWith("_left");
    const runs = l.treads.filter((t) => t.dir);
    assert.ok(runs.some((t) => t.dir[0] === (left ? -1 : 1)), shape);
    assert.ok(l.treads.filter((t) => t.winder || t.landing).every((t) => !t.dir), shape);
    assert.deepEqual(l.exit, [[left ? -1 : 1, -1.5], [left ? -1 : 1, -0.5]], shape);
  }
  assert.equal(ellipsePoly(0, 0, 1, 1, 8).length, 8);
});

test("Editor-Mixin ohne DOM: Formwechsel, Durchmesser, runde Plan-Form, Decke, Felder und Öffnungen im Plan", async () => {
  const { StairMethods: S } = await import("../../custom_components/haus3d/frontend/editor-stairs.js");
  // Formwechsel: Wendeltreppe quadratisch (zu klein → 1,6), Geländer „außen“; andere Formen „beidseitig“
  const a = { type: "stairs", stair_shape: "spiral", w: 1, d: 2.6, railing: "right" };
  assert.equal(S._stairShapeFix(a), 1.6);
  assert.deepEqual([a.w, a.d, a.railing], [1.6, 1.6, "outer"]);
  const b = { type: "stairs", stair_shape: "spiral_right", w: 2.2, d: 3 };
  assert.equal(S._stairShapeFix(b), 2.2);
  assert.deepEqual([b.w, b.d, b.railing], [2.2, 2.2, undefined]);
  assert.equal(S._stairShapeFix({ type: "stairs", stair_shape: "spiral", w: 1.6, d: 1.6 }), null);
  const c = { type: "stairs", stair_shape: "straight", w: 1, d: 3, railing: "outer" };
  assert.equal(S._stairShapeFix(c), null);
  assert.equal(c.railing, "both");
  // Maße: bei der Wendeltreppe folgen Breite und Tiefe einander
  const sp = { type: "stairs", stair_shape: "spiral", w: 1.8, d: 1.6 };
  S._stairDims(sp, "w");
  assert.equal(sp.d, 1.8);
  S._stairDims(sp, "h");
  const st = { type: "stairs", stair_shape: "straight", w: 1.2, d: 3 };
  S._stairDims(st, "w");
  assert.equal(st.d, 3);
  assert.equal(S._roundPlan({ type: "stairwell", hole_round: true }), true);
  assert.equal(S._roundPlan({ type: "stairwell" }), false);
  assert.equal(S._roundPlan({ type: "stairs", stair_shape: "spiral", w: 1.6, d: 1.6 }), true);
  assert.equal(S._roundPlan({ type: "stairs", stair_shape: "spiral", w: 1.6, d: 2 }), false);
  assert.equal(S._roundPlan({ type: "stairs", stair_shape: "straight", w: 1, d: 1 }), false);
  // Decke über dem Treppenfuß (KG 2,4 m) bzw. null ohne Ziel-Etage
  const bld = house({ railing: "right" });
  const ed = { ...S, b: bld, floor: bld.floors[0], floorId: "eg", tool: "select", coarse: false, roofMode: false };
  assert.ok(Math.abs(ed._stairCeilFor(bld.floors[0].furniture[0]) - 2.4) < 1e-9);
  assert.equal(ed._stairCeilFor({ type: "stairs", h: 1 }), null);
  // Felder: die Stufenzeile ist der erste Hinweis mit „Stufen“, kein anderer Hinweis enthält das Wort
  for (const [shape] of STAIR_SHAPES) {
    for (const extra of [{}, { cut: false }, { hole: { w: 1.4, d: 2, dx: 0.1, dz: 0, round: false } }, { h: 1 }]) {
      const html = ed._stairFields({ type: "stairs", stair_shape: shape, w: 1.6, d: 2.6, h: 2.8, railing: "right", ...extra });
      const muted = [...html.matchAll(/<p class="muted">([^<]*)<\/p>/g)].map((x) => x[1]);
      assert.match(muted[0], /^\d+ Stufen · Steigung /, shape);
      assert.equal(muted.filter((x) => /Stufen/.test(x)).length, 1, shape);
      assert.equal(/data-hole="w"/.test(html), !!extra.hole, shape);
      assert.equal(/data-stair="hole_railing"/.test(html), extra.cut !== false, shape);
    }
  }
  const spiralHtml = ed._stairFields({ type: "stairs", stair_shape: "spiral", w: 1.6, d: 1.6, h: 2.8, railing: "outer" });
  assert.match(spiralHtml, /<select data-stair="railing"><option value="none">keins<\/option><option value="outer" selected>außen<\/option><\/select>/);
  const custom = ed._stairFields({ type: "stairs", w: 1, d: 2.6, h: 2.8, hole: { w: 1.4, d: 2, dx: -0.2, dz: 0.35 } });
  assert.match(custom, /inputmode="decimal" data-hole="w" value="1.4"/);
  assert.match(custom, /step="0.05" data-hole="dx" value="-0.2"/);
  assert.match(custom, /<option value="custom" selected>/);
  assert.match(ed._stairFields({ type: "stairwell", hole_round: true }), /data-holeround><option value="0">eckig<\/option><option value="1" selected>rund/);
  // Öffnung im Plan: genau ein Text, Geländerkanten als Linien, Tippfeld zur Treppe im KG
  const px = (v) => v / 50;
  const P = ([x, z]) => `${x},${z}`;
  const edges = slabOpenings(bld, "eg")[0].edges.length;
  const svg = ed._openingParts(px, P);
  assert.equal((svg.match(/<text /g) ?? []).length, 1);
  assert.match(svg, />Treppe von KG<\/text>/);
  assert.equal((svg.match(/data-slabrail/g) ?? []).length, edges);
  assert.ok(edges >= 1);
  // Tippfeld eigens (vor Möbeln und Griffen gezeichnet), die Umrisse darüber sind nicht antippbar
  assert.ok(!/stairsrc/.test(svg));
  assert.match(ed._stairTapParts(px), /data-kind="stairsrc" data-id="t" data-floor="kg"/);
  assert.equal(ed._stairTapParts.call({ ...ed, tool: "wall" }, px), "");
  assert.match(ed._stairTapParts.call({ ...ed, coarse: true }, px), /height="0.88"/); // 44 px am Finger
  const well = house({ cut: false }, undefined, [{ id: "loch", type: "stairwell", x: 2, z: 2, w: 1, d: 2, hole_railing: "glass" }]);
  const ws = ed._openingParts.call({ ...ed, b: well }, px, P);
  assert.match(ws, />Treppenloch<\/text>/);
  assert.ok(!/stairsrc/.test(ed._stairTapParts.call({ ...ed, b: well }, px)) && /data-slabrail/.test(ws));
});
