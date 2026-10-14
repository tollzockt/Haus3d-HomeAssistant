// Treppen (ohne THREE, mit node testbar): gerade, L mit Podest, L gewendelt (Wendelstufen im Eck),
// U mit Podest und Wendeltreppe (links oder rechts herum); Grundfläche, Deckenöffnung in der Etage darüber
// (automatisch nach Kopfhöhe, eigene Maße oder keine) mit Geländerkanten, Treppenloch, Zuschneiden an Räumen.

import { pointInPolygon } from "./walls.js";
import { clipBehind, clipPolygon, convexHull, ellipsePoly, guardEdges, isConvex, polysOverlap, rectPoly, rectUnion } from "./stairgeom.js";

export { clipPolygon, mergeHoles } from "./stairgeom.js";

export const STAIR_SHAPES = [
  ["straight", "gerade"],
  ["l_left", "L mit Podest, Kehre links"],
  ["l_right", "L mit Podest, Kehre rechts"],
  ["lw_left", "L gewendelt, Kehre links"],
  ["lw_right", "L gewendelt, Kehre rechts"],
  ["u_left", "U mit Podest, Kehre links"],
  ["u_right", "U mit Podest, Kehre rechts"],
  ["spiral", "Wendeltreppe, links herum"],
  ["spiral_right", "Wendeltreppe, rechts herum"],
];
export const RAILINGS_STAIR = [
  ["none", "keins"],
  ["left", "links"],
  ["right", "rechts"],
  ["both", "beidseitig"],
];
/** Wendeltreppe: jeder Wert außer none heißt „außen“. */
export const RAILINGS_SPIRAL = [
  ["none", "keins"],
  ["outer", "außen"],
];
export const HOLE_MODES = [
  ["auto", "automatisch"],
  ["custom", "eigene Maße"],
  ["none", "keine"],
];
/** Geländer an der Deckenöffnung einer Treppe ("" = automatisch: Stäbe, wenn die Treppe ein Geländer hat). */
export const HOLE_RAILINGS = [
  ["", "automatisch"],
  ["none", "keins"],
  ["bars", "Stäbe"],
  ["glass", "Glas"],
  ["wood", "Holz"],
];
export const WELL_RAILINGS = [
  ["", "keins"],
  ["bars", "Stäbe"],
  ["glass", "Glas"],
  ["wood", "Holz"],
];
/** Kopfhöhe über den Stufen, Luft rings um die automatische Öffnung, Abstand des Geländers zur Öffnung (m). */
export const STAIR_HEADROOM = 2.0;
export const HOLE_CLEAR = 0.08;
export const RAIL_GAP = 0.03;
const SLAB = 0.15; // Deckenstärke wie in der Szene
const DEFAULT = { w: 1.0, d: 3.0, h: 2.6 };
const RAIL_STYLES = ["bars", "glass", "wood"];

export const isSpiral = (s) => /^spiral/.test(s ?? "");
const shapeKind = (s) => (s === "l_left" || s === "l_right" ? "l" : s === "lw_left" || s === "lw_right" ? "lw" : s === "u_left" || s === "u_right" ? "u" : isSpiral(s) ? "spiral" : "straight");
const turnsLeft = (s) => /_left$/.test(s ?? "");

/** Laufbreite: angegeben oder passend zur Grundfläche (höchstens 1 m). */
export function runWidth({ shape, w = DEFAULT.w, d = DEFAULT.d, run = null } = {}) {
  const k = shapeKind(shape);
  if (k === "straight") return w;
  if (k === "spiral") return Math.min(w, d) / 2;
  const max = k === "u" ? w / 2 : Math.min(w, d) / 2;
  return Math.max(0.5, Math.min(max, Number(run) > 0 ? Number(run) : Math.min(1.0, max)));
}

/** Punkt der Wendeltreppe: Radius, Winkel in Grad ab vorn (+z); sign −1 = rechts herum (an x gespiegelt). */
export const spiralPoint = (sign, rad, deg) => [sign * rad * Math.sin((deg * Math.PI) / 180), rad * Math.cos((deg * Math.PI) / 180)];

/**
 * Stufen im Möbel-System (w entlang x, d entlang z, Antritt vorne bei +z). Je Stufe {x0, x1, z0, z1, top}
 * oder bei Wendel-/Fächerstufen ein Vieleck {poly, top}; Podest mit landing: true. Laufstufen tragen ihre
 * Gehrichtung dir; exit ist die Austrittskante oben (Linienzug).
 * @returns {{treads: object[], count: number, rise: number, run: number, path: number[][], exit: number[][]}} path: Lauflinie
 */
export function stairLayout({ shape = "straight", w = DEFAULT.w, d = DEFAULT.d, h = DEFAULT.h, rise = 0.18, run = null } = {}) {
  const k = shapeKind(shape);
  const n = Math.max(3, Math.round(h / rise));
  const treads = [];
  const sw = runWidth({ shape, w, d, run });
  if (k === "straight") {
    const r = h / n;
    const t = d / n;
    for (let i = 0; i < n; i++) treads.push({ x0: -w / 2, x1: w / 2, z0: d / 2 - (i + 1) * t, z1: d / 2 - i * t, top: (i + 1) * r, dir: [0, -1] });
    return { treads, count: n, rise: r, run: w, path: [[0, d / 2], [0, -d / 2]], exit: [[-w / 2, -d / 2], [w / 2, -d / 2]] };
  }
  if (k === "spiral") return spiralLayout(w, d, h, n, shape === "spiral_right" ? -1 : 1);
  const left = turnsLeft(shape);
  const flip = (x) => (left ? x : -x);
  if (k === "u") {
    // erste Flucht rechts (Kehre links) nach −z, Podest hinten über die ganze Breite, zweite Flucht zurück
    const L = d - sw;
    const n1 = Math.max(1, Math.floor((n - 1) / 2));
    const n2 = Math.max(1, n - 1 - n1);
    const nn = n1 + 1 + n2;
    const r = h / nn;
    const t1 = L / n1;
    const t2 = L / n2;
    const c1 = [w / 2 - sw, w / 2]; // rechte Spalte (bei Kehre links)
    const c2 = [-w / 2, -w / 2 + sw];
    const col = ([a, b]) => (left ? [a, b] : [-b, -a]);
    for (let i = 0; i < n1; i++) {
      const [x0, x1] = col(c1);
      treads.push({ x0, x1, z0: d / 2 - (i + 1) * t1, z1: d / 2 - i * t1, top: (i + 1) * r, dir: [0, -1] });
    }
    treads.push({ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: -d / 2 + sw, top: (n1 + 1) * r, landing: true });
    for (let i = 0; i < n2; i++) {
      const [x0, x1] = col(c2);
      treads.push({ x0, x1, z0: -d / 2 + sw + i * t2, z1: -d / 2 + sw + (i + 1) * t2, top: (n1 + 2 + i) * r, dir: [0, 1] });
    }
    const mx1 = flip(w / 2 - sw / 2);
    const mx2 = flip(-w / 2 + sw / 2);
    const [ex0, ex1] = col(c2);
    return { treads, count: nn, rise: r, run: sw, path: [[mx1, d / 2], [mx1, -d / 2 + sw / 2], [mx2, -d / 2 + sw / 2], [mx2, d / 2]], exit: [[ex0, d / 2], [ex1, d / 2]] };
  }
  // L: erste Flucht an der Seite gegenüber der Kehre nach −z, im hinteren Eck Podest bzw. 3 Wendelstufen,
  // zweite Flucht quer zur Kehrseite
  const winders = k === "lw" ? 3 : 1;
  const L1 = d - sw;
  const L2 = w - sw;
  const n1 = Math.max(1, Math.round(((n - winders) * L1) / (L1 + L2)));
  const n2 = Math.max(1, n - winders - n1);
  const nn = n1 + winders + n2;
  const r = h / nn;
  const t1 = L1 / n1;
  const t2 = L2 / n2;
  const cx0 = left ? w / 2 - sw : -w / 2; // Spalte der ersten Flucht
  for (let i = 0; i < n1; i++) treads.push({ x0: cx0, x1: cx0 + sw, z0: d / 2 - (i + 1) * t1, z1: d / 2 - i * t1, top: (i + 1) * r, dir: [0, -1] });
  if (k === "l") treads.push({ x0: cx0, x1: cx0 + sw, z0: -d / 2, z1: -d / 2 + sw, top: (n1 + 1) * r, landing: true });
  else {
    // Wendelstufen: Fächer um die innere Ecke des Eckquadrats, je 30°
    const pivot = [left ? cx0 : cx0 + sw, -d / 2 + sw];
    const sq = { x0: cx0, x1: cx0 + sw, z0: -d / 2, z1: -d / 2 + sw };
    const dirAt = (deg) => {
      const a = (deg * Math.PI) / 180;
      // 0° = entlang der Eintrittskante (weg von der inneren Ecke), 90° = nach hinten (−z)
      return [left ? Math.cos(a) : -Math.cos(a), -Math.sin(a)];
    };
    const hit = (dir) => {
      const ts = [];
      if (dir[0] > 1e-9) ts.push((sq.x1 - pivot[0]) / dir[0]);
      if (dir[0] < -1e-9) ts.push((sq.x0 - pivot[0]) / dir[0]);
      if (dir[1] < -1e-9) ts.push((sq.z0 - pivot[1]) / dir[1]);
      const t = Math.min(...ts.filter((x) => x > 1e-9));
      return [pivot[0] + dir[0] * t, pivot[1] + dir[1] * t];
    };
    const corner = [left ? sq.x1 : sq.x0, sq.z0];
    for (let j = 0; j < 3; j++) {
      const a0 = j * 30;
      const a1 = (j + 1) * 30;
      const poly = [pivot, hit(dirAt(a0))];
      if (a0 < 45 && a1 > 45) poly.push(corner);
      poly.push(hit(dirAt(a1)));
      // die Kanten liegen auf dem Quadratrand: Ecke einfügen, wenn der Fächer sie überspannt
      treads.push({ poly, top: (n1 + 1 + j) * r, winder: true });
    }
  }
  for (let i = 0; i < n2; i++) {
    const a = left ? w / 2 - sw - (i + 1) * t2 : -w / 2 + sw + i * t2;
    treads.push({ x0: a, x1: a + t2, z0: -d / 2, z1: -d / 2 + sw, top: (n1 + winders + 1 + i) * r, dir: [left ? -1 : 1, 0] });
  }
  const mx = cx0 + sw / 2;
  const mz = -d / 2 + sw / 2;
  const ex = left ? -w / 2 : w / 2;
  return { treads, count: nn, rise: r, run: sw, path: [[mx, d / 2], [mx, mz], [ex, mz]], exit: [[ex, -d / 2], [ex, -d / 2 + sw]] };
}

/**
 * Wendeltreppe um die Spindel (sign 1 = links herum, −1 = rechts herum). platform: Austrittspodest als
 * Ringsektor über [turn, turn + 90°] auf Höhe h (nicht in treads); exit: Außenbogen des Podests.
 */
function spiralLayout(w, d, h, n, sign = 1) {
  const R = Math.min(w, d) / 2;
  const r0 = Math.min(0.12, R * 0.15); // Spindel
  const turn = Math.min(360, n * 22.5); // höchstens eine volle Umdrehung
  const step = turn / n;
  const treads = [];
  const P = (rad, deg) => spiralPoint(sign, rad, deg);
  for (let i = 0; i < n; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    treads.push({ poly: [P(r0, a0), P(R, a0), P(R, (a0 + a1) / 2), P(R, a1), P(r0, a1)], top: ((i + 1) * h) / n, spiral: true });
  }
  const path = [];
  for (let i = 0; i <= n; i++) path.push(P((R + r0) / 2, i * step)); // über den Index: letzter Punkt genau bei turn
  const inner = [];
  const outer = [];
  for (let a = 0; a <= 90; a += 15) {
    inner.push(P(r0, turn + a));
    outer.unshift(P(R, turn + a));
  }
  const exit = [];
  for (let i = 0; i <= 12; i++) exit.push(P(R, turn + i * 7.5));
  return { treads, count: n, rise: h / n, run: R - r0, path, spindle: r0, radius: R, sign, turn, step, platform: { poly: [...inner, ...outer], top: h }, exit };
}

/** Punkt im Möbel-System → Grundriss (gedreht wie in der Szene). */
export function toPlan(item, [x, z]) {
  const a = ((Number(item.rotation) || 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [item.x + x * c - z * s, item.z + x * s + z * c];
}

/** Grundfläche (4 Ecken im Grundriss) eines Möbelstücks mit w × d und Drehung wie in der Szene. */
export function stairFootprint(item) {
  const w = Number(item.w) || DEFAULT.w;
  const d = Number(item.d) || DEFAULT.d;
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map((p) => toPlan(item, p));
}

const r2 = (v) => Math.round(v * 100) / 100 || 0;
const bounds = (poly) => {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};
const dims = (item) => ({ w: Number(item.w) || DEFAULT.w, d: Number(item.d) || DEFAULT.d, h: Number(item.h) || DEFAULT.h });

/**
 * Deckenöffnung einer Treppe im Treppen-System. Eigene Maße (hole.w × hole.d um dx/dz, eckig oder rund);
 * Wendeltreppe rund mit 8 cm Luft, über dem Podest bündig; sonst über allen Stufen, über denen die Kopfhöhe
 * unter 2 m läge (ceil = Decke über dem Treppenfuß), ringsum 8 cm Luft, an der Austrittskante bündig.
 * grow vergrößert ringsum (Geländer neben der Öffnung).
 * @returns {{poly: number[][], exit: number[][]}}
 */
export function stairOpeningLocal(item, ceil = null, grow = 0) {
  const { w, d, h } = dims(item);
  const lay = stairLayout({ shape: item.stair_shape, w, d, h, run: item.run_width });
  const hole = item.hole;
  if (Number(hole?.w) > 0 && Number(hole?.d) > 0) {
    const cx = Number(hole.dx) || 0;
    const cz = Number(hole.dz) || 0;
    const rx = Number(hole.w) / 2 + grow;
    const rz = Number(hole.d) / 2 + grow;
    return { poly: hole.round ? ellipsePoly(cx, cz, rx, rz, grow ? 16 : 32) : rectPoly(cx - rx, cz - rz, cx + rx, cz + rz), exit: lay.exit };
  }
  if (lay.radius) {
    const n = grow ? 16 : 32;
    const poly = [];
    for (let i = 0; i < n; i++) {
      const rel = (360 * i) / n;
      const rad = (lay.radius + (rel <= 90 + 1e-9 ? 0 : HOLE_CLEAR) + grow) / Math.cos(Math.PI / n);
      poly.push(spiralPoint(lay.sign, rad, lay.turn + rel));
    }
    return { poly, exit: lay.exit };
  }
  const thr = (ceil ?? h - SLAB) - STAIR_HEADROOM;
  let first = lay.treads.findIndex((t) => t.top > thr);
  if (first < 0) first = lay.treads.length - 1;
  // Läufe zu je einem Rechteck, Podeste und Wendelstufen einzeln
  const rects = [];
  let run = null;
  for (const t of lay.treads.slice(first)) {
    const b = bounds(t.poly ?? [[t.x0, t.z0], [t.x1, t.z1]]);
    if (t.dir && run?.dir && run.dir[0] === t.dir[0] && run.dir[1] === t.dir[1]) {
      run.x0 = Math.min(run.x0, b.x0);
      run.x1 = Math.max(run.x1, b.x1);
      run.z0 = Math.min(run.z0, b.z0);
      run.z1 = Math.max(run.z1, b.z1);
      continue;
    }
    run = { ...b, dir: t.dir ?? null };
    rects.push(run);
  }
  const g = HOLE_CLEAR + grow;
  const poly = rectUnion(rects.map((r) => ({ x0: r.x0 - g, x1: r.x1 + g, z0: r.z0 - g, z1: r.z1 + g })));
  const a = lay.path.at(-2);
  const b = lay.path.at(-1);
  return { poly: clipBehind(poly, lay.exit[0], lay.exit[1], [b[0] - a[0], b[1] - a[1]]), exit: lay.exit };
}

/** Deckenöffnung einer Treppe im Grundriss (gedreht wie in der Szene), samt Austrittskante. */
export function stairOpening(item, ceil = null, grow = 0) {
  const o = stairOpeningLocal(item, ceil, grow);
  return { poly: o.poly.map((p) => toPlan(item, p)), exit: o.exit.map((p) => toPlan(item, p)) };
}

/** Deckenöffnung einer Treppe (im Grundriss). */
export function stairHole(item, ceil = null) {
  return stairOpening(item, ceil).poly;
}

/** Treppenloch im Möbel-System: Rechteck w × d oder (hole_round) Ellipse; Vorderseite (+z) ist der Zugang. */
export function wellOpeningLocal(item, grow = 0) {
  const w = Number(item.w) || DEFAULT.w;
  const d = Number(item.d) || DEFAULT.d;
  const rx = w / 2 + grow;
  const rz = d / 2 + grow;
  return { poly: item.hole_round ? ellipsePoly(0, 0, rx, rz, grow ? 16 : 32) : rectPoly(-rx, -rz, rx, rz), exit: [[-w / 2, d / 2], [w / 2, d / 2]] };
}

/** Oberkante einer Treppe über Null. */
export function stairTop(floor, item) {
  return (floor.elevation ?? 0) + (Number(item.mount_y) || 0) + (Number(item.h) || DEFAULT.h);
}

/** Etage, in die die Treppe führt: die tiefste darüber, deren Boden höchstens 0,3 m über bzw. 0,5 m unter der Oberkante liegt. */
export function stairTarget(building, floor, item) {
  const e0 = floor?.elevation ?? 0;
  const top = stairTop(floor ?? {}, item);
  return [...(building?.floors ?? [])]
    .filter((f) => (f.elevation ?? 0) > e0)
    .sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))
    .find((f) => top >= (f.elevation ?? 0) - 0.3 && top <= (f.elevation ?? 0) + 0.5) ?? null;
}

/** Decke über dem Treppenfuß: Etagenhöhe bzw. Unterkante der Decke darüber, abzüglich Montagehöhe. */
export function stairCeil(floor, item, upperElev) {
  const e = floor?.elevation ?? 0;
  return Math.min(e + (Number(floor?.height) || 2.5), upperElev - SLAB) - e - (Number(item.mount_y) || 0);
}

/** Startwerte für „eigene Maße“: die automatische Öffnung (Wendeltreppe: Kreis mit 8 cm Luft), auf cm gerundet. */
export function defaultHole(item, ceil = null) {
  const { w, d } = dims(item);
  if (isSpiral(item.stair_shape)) {
    const s = r2(2 * (Math.min(w, d) / 2 + HOLE_CLEAR));
    return { w: s, d: s, dx: 0, dz: 0, round: true };
  }
  const { poly } = stairOpeningLocal({ ...item, hole: null }, ceil);
  if (poly.length < 3) return { w: r2(w), d: r2(d), dx: 0, dz: 0, round: false };
  const b = bounds(poly);
  return { w: r2(b.x1 - b.x0), d: r2(b.z1 - b.z0), dx: r2((b.x0 + b.x1) / 2), dz: r2((b.z0 + b.z1) / 2), round: false };
}

/** Geländer an der Öffnung: Treppenloch nur mit Stil; Treppe ohne Angabe Stäbe, wenn sie ein Geländer hat. */
export function holeRailing(item) {
  const v = item?.hole_railing;
  if (RAIL_STYLES.includes(v)) return v;
  if (item?.type === "stairwell" || v === "none") return null;
  return item?.railing && item.railing !== "none" ? "bars" : null;
}

/**
 * Deckenöffnungen einer Etage: Treppen der Etagen darunter, die bis hierher reichen (cut nicht false),
 * und Treppenlöcher (stairwell) dieser Etage. Mit Geländer zusätzlich railing (Stil) und edges (Kanten
 * im Grundriss, 3 cm neben der Öffnung; Austritt, Wände und Kanten außerhalb der Räume bleiben frei).
 * @returns {{poly: number[][], from: string, fid: string, id: string, well?: boolean, railing?: string, edges?: number[][][]}[]}
 */
export function slabOpenings(building, floorId) {
  const floors = building?.floors ?? [];
  const floor = floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const elev = floor.elevation ?? 0;
  const rooms = floor.rooms ?? [];
  const out = [];
  const guards = new Map(); // Treppenöffnung → um RAIL_GAP vergrößerte Öffnung (fürs Geländer)
  for (const f of floors) {
    if ((f.elevation ?? 0) >= elev) continue;
    for (const m of f.furniture ?? []) {
      if (m?.type !== "stairs" || m.cut === false || !Number.isFinite(m.x) || !Number.isFinite(m.z)) continue;
      const top = stairTop(f, m);
      if (top < elev - 0.3 || top > elev + 0.5) continue;
      const ceil = stairCeil(f, m, elev);
      const o = { poly: stairHole(m, ceil), from: f.name ?? f.id, fid: f.id, id: m.id };
      const style = holeRailing(m);
      if (style) {
        const g = stairOpening(m, ceil, RAIL_GAP);
        Object.assign(o, { railing: style, edges: guardEdges(g.poly, g.exit, rooms) });
        guards.set(o, g);
      }
      out.push(o);
    }
  }
  const stairs = out.slice();
  for (const m of floor.furniture ?? []) {
    if (m?.type !== "stairwell" || !Number.isFinite(m.x) || !Number.isFinite(m.z)) continue;
    const plan = (p) => toPlan(m, p);
    const o = { poly: wellOpeningLocal(m).poly.map(plan), from: floor.name ?? floor.id, fid: floor.id, id: m.id, well: true };
    const style = holeRailing(m);
    // ragt das Treppenloch über eine Treppenöffnung mit Geländer hinaus: deren Geländer läuft um die gemeinsame
    // Öffnung (Hülle beider vergrößerten Vielecke, wie die zusammengelegten Löcher), der Austritt bleibt frei
    const gw = wellOpeningLocal(m, RAIL_GAP).poly.map(plan);
    for (const s of stairs) {
      const g = guards.get(s);
      if (!g || !polysOverlap(s.poly, o.poly)) continue;
      g.poly = convexHull([...g.poly, ...gw]);
      s.edges = guardEdges(g.poly, g.exit, rooms);
    }
    // liegt das Treppenloch über einer Treppenöffnung, gilt deren Geländer
    if (style && !stairs.some((s) => polysOverlap(s.poly, o.poly))) {
      const g = wellOpeningLocal(m, RAIL_GAP);
      Object.assign(o, { railing: style, edges: guardEdges(g.poly.map(plan), g.exit.map(plan), rooms) });
    }
    out.push(o);
  }
  return out;
}

const area = (p) => Math.abs(p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length];
  return s + a[0] * b[1] - b[0] * a[1];
}, 0)) / 2;

/**
 * Loch für einen Raum: Öffnung ∩ Raum, 1 cm eingerückt; zu klein (< 0,1 m²) → null. Zugeschnitten wird mit
 * dem konvexen der beiden Vielecke; sind beide konkav, bleibt eine Öffnung ganz im Raum, sonst gilt ihre Hülle.
 */
export function roomHole(roomPoints, hole, inset = 0.01) {
  if (!(roomPoints?.length >= 3) || !(hole?.length >= 3)) return null;
  const p = isConvex(hole) ? clipPolygon(roomPoints, hole)
    : isConvex(roomPoints) ? clipPolygon(hole, roomPoints)
    : hole.every((q) => pointInPolygon(q, roomPoints)) && !roomPoints.some((q) => pointInPolygon(q, hole)) ? hole
    : clipPolygon(roomPoints, convexHull(hole));
  if (p.length < 3 || area(p) < 0.1) return null;
  const c = [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  return p.map((q) => {
    const dx = c[0] - q[0];
    const dz = c[1] - q[1];
    const l = Math.hypot(dx, dz) || 1;
    return [q[0] + (dx / l) * Math.min(inset * 1.5, l / 2), q[1] + (dz / l) * Math.min(inset * 1.5, l / 2)];
  });
}
