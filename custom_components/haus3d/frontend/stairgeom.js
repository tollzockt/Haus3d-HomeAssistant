// Geometrie für Treppen und Deckenöffnungen ohne THREE (mit node testbar): Rechteck-Vereinigung, Ellipse,
// Hülle, Überlappung, Geländerkanten. Koordinaten in Metern, Plan [x, z].

import { pointInPolygon } from "./walls.js";
import { freeEdges } from "./exterior.js";

/** Abstand einer Kantenmitte zum Austritt, bis zu dem die Kante als Zugang offen bleibt. */
export const OPEN_TOL = 0.12;

const r6 = (v) => Math.round(v * 1e6) / 1e6 || 0;
const cross3 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const signedArea = (p) => p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length];
  return s + a[0] * b[1] - b[0] * a[1];
}, 0) / 2;

/** Sutherland–Hodgman: subject (auch konkav) mit konvexem clip schneiden. */
export function clipPolygon(subject, clip) {
  let out = subject;
  const sign = clip.reduce((s, a, i) => {
    const b = clip[(i + 1) % clip.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9;
    const cut = (p, q) => {
      const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      const t = d1 / (d1 - d2);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k];
      const q = input[(k + 1) % input.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out;
}

/** Doppelte und auf einer Geraden liegende Punkte entfernen. */
function tidy(poly, eps = 1e-9) {
  let p = poly.filter((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-7;
  });
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length];
      const b = p[(i + 1) % p.length];
      if (Math.abs(cross3(a, p[i], b)) < eps) {
        p = p.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return p;
}

/** Konvex (Kreuzprodukte gleichen Vorzeichens; fast gerade Ecken zählen nicht). */
export function isConvex(p) {
  if (!Array.isArray(p) || p.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const c = cross3(p[i], p[(i + 1) % p.length], p[(i + 2) % p.length]);
    if (Math.abs(c) < 1e-12) continue;
    const s = c > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return sign !== 0;
}

/** Konvexe Hülle (Monotone Chain), gegen den Uhrzeigersinn. */
export function convexHull(points) {
  const pts = [...points].filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const half = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross3(h[h.length - 2], h[h.length - 1], p) <= 1e-12) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

export const rectPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** Umschriebenes n-Eck einer Ellipse: die Kantenmitten liegen auf der Ellipse. */
export function ellipsePoly(cx, cz, rx, rz, n = 32) {
  const k = 1 / Math.cos(Math.PI / n);
  return Array.from({ length: n }, (_, i) => {
    const t = Math.PI / 2 - Math.PI / n + (2 * Math.PI * i) / n;
    return [cx + rx * k * Math.cos(t), cz + rz * k * Math.sin(t)];
  });
}

/**
 * Umriss vereinigter Rechtecke {x0, x1, z0, z1} über ein Raster aus allen Kanten. fill: eine freie Zelle
 * zwischen zwei belegten (links und rechts bzw. davor und dahinter) wird mit belegt (Treppenauge der U-Treppe).
 * Liefert die größte Randschleife ohne Punkte auf geraden Strecken.
 */
export function rectUnion(rects, fill = true) {
  const list = (rects ?? [])
    .map((r) => ({ x0: r6(Math.min(r.x0, r.x1)), x1: r6(Math.max(r.x0, r.x1)), z0: r6(Math.min(r.z0, r.z1)), z1: r6(Math.max(r.z0, r.z1)) }))
    .filter((r) => [r.x0, r.x1, r.z0, r.z1].every(Number.isFinite) && r.x1 - r.x0 > 1e-6 && r.z1 - r.z0 > 1e-6);
  if (!list.length) return [];
  const xs = [...new Set(list.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(list.flatMap((r) => [r.z0, r.z1]))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const base = Array.from({ length: nx }, (_, i) => Array.from({ length: nz }, (_, j) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cz = (zs[j] + zs[j + 1]) / 2;
    return list.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1);
  }));
  const occ = base.map((col) => [...col]);
  if (fill) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (base[i][j]) continue;
        if ((i > 0 && i < nx - 1 && base[i - 1][j] && base[i + 1][j]) || (j > 0 && j < nz - 1 && base[i][j - 1] && base[i][j + 1])) occ[i][j] = true;
      }
    }
  }
  const on = (i, j) => i >= 0 && i < nx && j >= 0 && j < nz && occ[i][j];
  // gerichtete Randkanten, das Innere liegt links (gegen den Uhrzeigersinn in x/z)
  const edges = [];
  const from = new Map();
  const add = (a, b) => {
    const e = { a, b, used: false };
    edges.push(e);
    const k = `${a[0]},${a[1]}`;
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(e);
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!occ[i][j]) continue;
      if (!on(i, j - 1)) add([i, j], [i + 1, j]);
      if (!on(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!on(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!on(i - 1, j)) add([i, j + 1], [i, j]);
    }
  }
  const turn = (din, e) => {
    const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    return Math.atan2(din[0] * d[1] - din[1] * d[0], din[0] * d[0] + din[1] * d[1]);
  };
  const loops = [];
  for (const start of edges) {
    if (start.used) continue;
    const loop = [];
    let cur = start;
    start.used = true;
    for (let guard = 0; guard <= edges.length; guard++) {
      loop.push(cur.a);
      const din = [cur.b[0] - cur.a[0], cur.b[1] - cur.a[1]];
      const cands = (from.get(`${cur.b[0]},${cur.b[1]}`) ?? []).filter((e) => !e.used || e === start);
      if (!cands.length) break;
      // an mehrdeutigen Ecken die schärfste Linkskurve
      const next = cands.reduce((best, e) => (turn(din, e) > turn(din, best) ? e : best));
      if (next === start) break;
      next.used = true;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop.map(([i, j]) => [xs[i], zs[j]]));
  }
  if (!loops.length) return [];
  return tidy(loops.reduce((a, b) => (signedArea(b) > signedArea(a) ? b : a)));
}

/** Polygon an der Geraden a→b abschneiden: es bleibt die Seite gegenüber out (Austritt bündig). */
export function clipBehind(poly, a, b, out) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ol = Math.hypot(out?.[0] ?? 0, out?.[1] ?? 0);
  if (!(len > 1e-9) || !(ol > 1e-9) || !poly?.length) return poly ?? [];
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const o = [out[0] / ol, out[1] / ol];
  const quad = [
    [a[0] - 100 * u[0], a[1] - 100 * u[1]],
    [b[0] + 100 * u[0], b[1] + 100 * u[1]],
    [b[0] + 100 * u[0] - 100 * o[0], b[1] + 100 * u[1] - 100 * o[1]],
    [a[0] - 100 * u[0] - 100 * o[0], a[1] - 100 * u[1] - 100 * o[1]],
  ];
  const clipped = clipPolygon(poly, quad).map((p) => [r6(p[0]), r6(p[1])]);
  return clipped.length >= 3 ? tidy(clipped) : clipped;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Kleinster Abstand eines Punkts zu einem Linienzug. */
export function polylineDist(p, line) {
  if (!line?.length) return Infinity;
  if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, segDist(p, line[i], line[i + 1]));
  return best;
}

const boundaryDist = (p, poly) => poly.reduce((m, a, i) => Math.min(m, segDist(p, a, poly[(i + 1) % poly.length])), Infinity);
const strictlyInside = (p, poly) => pointInPolygon(p, poly) && boundaryDist(p, poly) > 1e-9;
const mean = (poly) => [poly.reduce((s, q) => s + q[0], 0) / poly.length, poly.reduce((s, q) => s + q[1], 0) / poly.length];
const bbox = (p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
const opposite = (u, v) => (u > 1e-12 && v < -1e-12) || (u < -1e-12 && v > 1e-12);

/** Überlappen sich zwei Vielecke? Nur Berühren (gemeinsame Kante oder Ecke) zählt nicht. */
export function polysOverlap(a, b) {
  if (!(a?.length >= 3) || !(b?.length >= 3)) return false;
  const A = bbox(a);
  const B = bbox(b);
  if (A[2] <= B[0] + 1e-9 || B[2] <= A[0] + 1e-9 || A[3] <= B[1] + 1e-9 || B[3] <= A[1] + 1e-9) return false;
  if (a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a))) return true;
  if (strictlyInside(mean(a), b) || strictlyInside(mean(b), a)) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j];
      const s = b[(j + 1) % b.length];
      if (opposite(cross3(p, q, r), cross3(p, q, s)) && opposite(cross3(r, s, p), cross3(r, s, q))) return true;
    }
  }
  return false;
}

/** Überlappende Öffnungen zur konvexen Hülle zusammenfassen, bis keine mehr überlappen. */
export function mergeHoles(polys) {
  const list = (polys ?? []).filter((p) => p?.length >= 3);
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < list.length && !merged; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!polysOverlap(list[i], list[j])) continue;
        list[i] = convexHull([...list[i], ...list[j]]);
        list.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return list;
}

/**
 * Geländerkanten rund um eine Öffnung: Kanten am Austritt (Mitte höchstens tol vom Austritt, sonst die
 * nächstgelegene) bleiben offen, ebenso Kanten an Wänden und außerhalb der Räume.
 * @returns {number[][][]} [[a, b], …]
 */
export function guardEdges(poly, exit, rooms, tol = OPEN_TOL) {
  const n = poly?.length ?? 0;
  if (n < 3) return [];
  const list = (rooms ?? []).filter((r) => r?.points?.length >= 3);
  const pairs = poly.map((a, i) => [a, poly[(i + 1) % n]]);
  const mids = pairs.map(([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  const dist = mids.map((m) => polylineDist(m, exit));
  const open = dist.map((d) => d <= tol);
  if (!open.some(Boolean) && dist.some(Number.isFinite)) open[dist.indexOf(Math.min(...dist))] = true;
  // freeEdges liefert die Punkte des Polygons selbst: Kante i über ihren Anfangspunkt erkennen
  const free = new Set(freeEdges(poly, list).map(([a]) => a));
  return pairs.filter(([a, b], i) => !open[i] && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6 && free.has(a) && list.some((r) => pointInPolygon(mids[i], r.points)));
}
