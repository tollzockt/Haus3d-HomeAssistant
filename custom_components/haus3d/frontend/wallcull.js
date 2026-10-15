// Sichtbare Flächen der Wandstücke einer Etage (ohne Three.js, mit node testbar).
//
// Jedes Wandstück ist ein senkrechtes Prisma: Grundriss-Viereck foot ([x, z] je Ecke), Unterkante y0, Oberkante y1.
// Wo Stücke aneinanderstoßen oder ineinanderstecken (T-Stoß bis zur Wandmitte, Gehrung, gerade weiterlaufende
// Wand, Brüstung und Sturz neben der vollen Wand, Stufen unter der Dachschräge, bündiger Streifen, Wandfuß unter
// dem Boden), liegen Flächen genau an oder in einer anderen Wand. Man sieht sie nie; gezeichnet liegen ihre Kanten
// aber genau in einer sichtbaren Fläche und blitzen dort als feine helle oder dunkle Linie durch (gleiche Tiefe).
// Darum fallen sie hier weg:
//  - Seitenflächen (auch Stirnflächen): die Teile, vor denen (EPS nach außen) ein anderes Stück steht, je Höhenband;
//  - Deck- und Unterflächen: die Teile, über bzw. unter denen ein anderes Stück weitergeht.
// Gleich hohe Deckflächen, die sich überdecken, bleiben beide (gleiche Farbe und Lage: keine Fuge, kein Flimmern).
// above: Stücke einer Etage darüber (Wandfuß): Deckflächen darunter kommen in lids (nur zu sehen, wenn die Etage
// darüber ausgeblendet ist). below: Stücke der Etage darunter verdecken Unterflächen (Wandfuß auf ihren Wänden).

import { flushFootprint, pieceFootprint, wallPieces } from "./walls.js";

const EPS = 1e-4; // Abstand vor einer Fläche, an dem geprüft wird, ob dort Wand steht (Meter)
const MIN = 1e-3; // kleinere Reste einer Seitenfläche (Breite bzw. Höhe) fallen weg
const TOL = 1e-6;
const CELL = 1; // Raster für die Suche nach Nachbarn (Meter)

/** So weit reicht der Wandfuß in die Wände der Etage darunter (überlappende Fassade statt Stoßfuge, Meter). */
export const BASE_OVERLAP = 0.001;

const cross = (ax, az, bx, bz) => ax * bz - az * bx;

/**
 * Wandstücke einer Etage wie in der Szene: je Segment der Wandfuß unter dem Boden (base: Deckenstärke; reicht
 * BASE_OVERLAP in die Wände darunter; Deckfläche nur bei Außenwänden – die Schwelle der Außentür –, unter Innen- und
 * freien Wänden reichen die Böden bis zur Wandmitte, eine Deckfläche dort läge genau in der Bodenfläche und flimmerte
 * in Türöffnungen), die Stücke zwischen den Öffnungen (Brüstung, Sturz), im Dachgeschoss in Stufen unter der
 * Dachschräge (steps(seg) → [[s0, s1, Höhe]] oder null), dazu der bündige Streifen.
 * paint(seg) → {side, cap, flush}: Farben (flush: Farbe des Streifens oder null).
 */
export function floorPrisms(segments, openings, { elev = 0, base = 0.15, height = 2.5, steps = () => null, paint = () => ({}) } = {}) {
  const out = [];
  for (const seg of segments ?? []) {
    const { side = null, cap = null, flush = null } = paint(seg) ?? {};
    out.push({ foot: pieceFootprint(seg, 0, seg.length), y0: elev - base - BASE_OVERLAP, y1: elev, side, cap, top: seg.kind === "exterior", base: true });
    const slope = steps(seg);
    const put = (s0, s1, y0, y1) => {
      out.push({ foot: pieceFootprint(seg, s0, s1), y0: elev + y0, y1: elev + y1, side, cap });
      if (flush) out.push({ foot: flushFootprint(seg, s0, s1), y0: elev + y0, y1: elev + y1, side: flush, cap });
    };
    for (const piece of wallPieces(seg, openings ?? [], slope ? height : seg.height ?? height)) {
      if (!slope) {
        put(piece.s0, piece.s1, piece.y0, piece.y1);
        continue;
      }
      for (const [s0, s1, top] of slope) {
        const a = Math.max(s0, piece.s0);
        const b = Math.min(s1, piece.s1);
        const y1 = Math.min(piece.y1, top);
        if (b - a > 1e-4 && y1 - piece.y0 > 1e-3) put(a, b, piece.y0, y1);
      }
    }
  }
  return out;
}

function area2(P) {
  let a = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/** Vorbereitetes Stück: Grundriss gegen den Uhrzeigersinn (Fläche > 0), konvex, Umriss-Rechteck. */
function prepare(p, index) {
  const foot = (p.foot ?? []).filter((q) => Number.isFinite(q?.[0]) && Number.isFinite(q?.[1]));
  const a = area2(foot);
  const ccw = a >= 0 ? foot : [...foot].reverse();
  let convex = foot.length >= 3 && Math.abs(a) > 1e-9;
  for (let i = 0; convex && i < ccw.length; i++) {
    const p0 = ccw[i];
    const p1 = ccw[(i + 1) % ccw.length];
    const p2 = ccw[(i + 2) % ccw.length];
    if (cross(p1[0] - p0[0], p1[1] - p0[1], p2[0] - p1[0], p2[1] - p1[1]) < -1e-9) convex = false;
  }
  const xs = foot.map((q) => q[0]);
  const zs = foot.map((q) => q[1]);
  return {
    src: p,
    index,
    foot,
    ccw,
    convex,
    y0: p.y0,
    y1: p.y1,
    box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)],
  };
}

/** Raster über die Umriss-Rechtecke: liefert zu einem Rechteck die Stücke, deren Rechteck es berührt. */
function grid(list) {
  const cells = new Map();
  const range = (lo, hi) => [Math.floor(lo / CELL), Math.floor(hi / CELL)];
  for (const s of list) {
    if (!s.convex) continue;
    const [i0, i1] = range(s.box[0] - EPS, s.box[1] + EPS);
    const [k0, k1] = range(s.box[2] - EPS, s.box[3] + EPS);
    for (let i = i0; i <= i1; i++) {
      for (let k = k0; k <= k1; k++) {
        const key = `${i},${k}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(s);
      }
    }
  }
  return (box) => {
    const out = new Set();
    const [i0, i1] = range(box[0] - EPS, box[1] + EPS);
    const [k0, k1] = range(box[2] - EPS, box[3] + EPS);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) for (const s of cells.get(`${i},${k}`) ?? []) out.add(s);
    return [...out].filter((s) => s.box[0] <= box[1] + EPS && s.box[1] >= box[0] - EPS && s.box[2] <= box[3] + EPS && s.box[3] >= box[2] - EPS);
  };
}

/**
 * Teil [t0, t1] der Strecke P → Q (t von 0 bis 1) innerhalb des konvexen Vielecks C (gegen den Uhrzeigersinn,
 * Rand zählt dazu), sonst null.
 */
export function segmentInside(P, Q, C) {
  let t0 = 0;
  let t1 = 1;
  const dx = Q[0] - P[0];
  const dz = Q[1] - P[1];
  for (let i = 0; i < C.length; i++) {
    const a = C[i];
    const b = C[(i + 1) % C.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    if (Math.hypot(ex, ez) < 1e-12) continue;
    // innen: links der Kante (cross ≥ 0)
    const f0 = cross(ex, ez, P[0] - a[0], P[1] - a[1]);
    const df = cross(ex, ez, dx, dz);
    if (Math.abs(df) < 1e-15) {
      if (f0 < -1e-12) return null;
      continue;
    }
    const t = -f0 / df;
    if (df > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t1 - t0 > 1e-12 ? [t0, t1] : null;
}

/** Konvexes Vieleck auf die Seite f(p) ≥ 0 zuschneiden. */
function clipHalf(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Rest einer Fläche zählt nur, wenn er nicht nur ein Splitter ist
function solid(P) {
  if (P.length < 3) return false;
  const a = Math.abs(area2(P)) / 2;
  let long = 0;
  for (let i = 0; i < P.length; i++) long = Math.max(long, Math.hypot(P[(i + 1) % P.length][0] - P[i][0], P[(i + 1) % P.length][1] - P[i][1]));
  return a > 1e-8 && a / long > MIN / 4;
}

/**
 * Konvexes Vieleck P ohne das konvexe Vieleck C (gegen den Uhrzeigersinn): Liste konvexer Teile (ohne Splitter).
 * inside: zusätzlich der Teil in C (oder null).
 */
export function subtractConvex(P, C) {
  const parts = [];
  let rest = P;
  for (let i = 0; i < C.length && rest.length >= 3; i++) {
    const a = C[i];
    const b = C[(i + 1) % C.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    if (len < 1e-12) continue;
    const f = (p) => cross(ex, ez, p[0] - a[0], p[1] - a[1]) / len;
    const outside = clipHalf(rest, (p) => -f(p));
    if (solid(outside)) parts.push(outside);
    rest = clipHalf(rest, f);
  }
  return { parts, inside: solid(rest) ? rest : null };
}

/** Vereinigung von Intervallen [a, b] (sortiert, zusammengefasst). */
function union(ivs) {
  const out = [];
  for (const [a, b] of [...ivs].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Sichtbare Teile einer Seitenfläche (Kante P → Q des Stücks s, nach außen m): Liste [t0, t1, ya, yb] (t längs
 * der Kante von 0 bis 1). near(box): Stücke, die davorstehen können (Raster).
 */
function sideParts(s, P, Q, m, near) {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  const Po = [P[0] + m[0] * EPS, P[1] + m[1] * EPS];
  const Qo = [Q[0] + m[0] * EPS, Q[1] + m[1] * EPS];
  const box = [Math.min(Po[0], Qo[0]), Math.max(Po[0], Qo[0]), Math.min(Po[1], Qo[1]), Math.max(Po[1], Qo[1])];
  const covers = [];
  for (const o of near(box)) {
    if (o === s) continue;
    const ya = Math.max(s.y0, o.y0);
    const yb = Math.min(s.y1, o.y1);
    if (yb - ya <= TOL) continue;
    const iv = segmentInside(Po, Qo, o.ccw);
    if (iv) covers.push({ t0: iv[0], t1: iv[1], ya, yb });
  }
  if (!covers.length) return [[0, 1, s.y0, s.y1]];
  // Höhenbänder an allen Ober- und Unterkanten der Stücke davor
  const ys = [s.y0, s.y1];
  for (const c of covers) ys.push(c.ya, c.yb);
  ys.sort((a, b) => a - b);
  const levels = [];
  for (const y of ys) if (y >= s.y0 - TOL && y <= s.y1 + TOL && (!levels.length || y - levels[levels.length - 1] > TOL)) levels.push(y);
  const out = [];
  let prev = null; // sichtbare Intervalle des vorigen Bands
  for (let k = 0; k + 1 < levels.length; k++) {
    const [ya, yb] = [levels[k], levels[k + 1]];
    if (yb - ya < TOL) continue;
    const hidden = union(covers.filter((c) => c.ya <= ya + TOL && c.yb >= yb - TOL).map((c) => [c.t0, c.t1]));
    const free = [];
    let t = 0;
    for (const [a, b] of hidden) {
      if ((a - t) * L >= MIN) free.push([t, a]);
      t = Math.max(t, b);
    }
    if ((1 - t) * L >= MIN) free.push([t, 1]);
    // Enden am Rand genau auf die Ecken legen (gleiche Punkte wie die Nachbarflächen)
    for (const f of free) {
      if (f[0] < 1e-6) f[0] = 0;
      if (f[1] > 1 - 1e-6) f[1] = 1;
    }
    const same = prev && prev.free.length === free.length && prev.free.every((f, i) => Math.abs(f[0] - free[i][0]) < 1e-9 && Math.abs(f[1] - free[i][1]) < 1e-9);
    if (same) prev.yb = yb;
    else {
      prev = { ya, yb, free };
      out.push(prev);
    }
  }
  return out.flatMap((band) => (band.yb - band.ya >= MIN ? band.free.map(([a, b]) => [a, b, band.ya, band.yb]) : []));
}

/**
 * Sichtbare Flächen aller Stücke.
 * @param {{foot:number[][], y0:number, y1:number, side:any, cap:any, top?:boolean, bottom?:boolean}[]} prisms
 *   side: Farbe oder je Seite [Anfang, rechts, Ende, links] (Grundriss l0, r0, r1, l1); top/bottom: false lässt die
 *   Deck- bzw. Unterfläche ganz weg
 * @param {{above?: {foot:number[][], y0:number, y1:number}[], below?: {foot:number[][], y0:number, y1:number}[]}} opts
 *   above: Wandfuß der Etage darüber (verdeckte Deckflächen → lids), below: Stücke der Etage darunter (verdecken
 *   Unterflächen)
 * @returns {{faces: {pts:number[][], out:number[], color:any}[], lids: {pts:number[][], out:number[], color:any}[]}}
 *   pts: [x, y, z] (Seitenflächen 4 Punkte, Deck- und Unterflächen ein konvexes Vieleck)
 */
export function visibleFaces(prisms, { above = [], below = [] } = {}) {
  const ok = (s) => s.foot.length >= 3 && Number.isFinite(s.y0) && Number.isFinite(s.y1) && s.y1 - s.y0 > TOL;
  const list = (prisms ?? []).map(prepare).filter(ok);
  const near = grid(list);
  const nearUp = grid((above ?? []).map(prepare).filter(ok));
  const nearDown = grid((below ?? []).map(prepare).filter(ok));
  const faces = [];
  const lids = [];
  for (const s of list) {
    const { foot, y0, y1, src } = s;
    // Mitte des Grundrisses: Seitenflächen zeigen von ihr weg
    const cx = foot.reduce((a, q) => a + q[0], 0) / foot.length;
    const cz = foot.reduce((a, q) => a + q[1], 0) / foot.length;
    for (let i = 0; i < foot.length; i++) {
      const P = foot[i];
      const Q = foot[(i + 1) % foot.length];
      const dx = Q[0] - P[0];
      const dz = Q[1] - P[1];
      const L = Math.hypot(dx, dz);
      if (L < 1e-9) continue;
      let m = [dz / L, -dx / L];
      if (((P[0] + Q[0]) / 2 - cx) * m[0] + ((P[1] + Q[1]) / 2 - cz) * m[1] < 0) m = [-m[0], -m[1]];
      const color = Array.isArray(src.side) ? src.side[i] : src.side;
      for (const [ta, tb, ya, yb] of sideParts(s, P, Q, m, near)) {
        const A = [P[0] + dx * ta, P[1] + dz * ta];
        const B = [P[0] + dx * tb, P[1] + dz * tb];
        faces.push({ pts: [[A[0], ya, A[1]], [B[0], ya, B[1]], [B[0], yb, B[1]], [A[0], yb, A[1]]], out: [m[0], 0, m[1]], color });
      }
    }
    if (!s.convex) {
      // ungewöhnlicher Grundriss: Deck- und Unterfläche ungeschnitten
      if (src.top !== false) faces.push({ pts: s.ccw.map((q) => [q[0], y1, q[1]]), out: [0, 1, 0], color: src.cap });
      if (src.bottom !== false) faces.push({ pts: s.ccw.map((q) => [q[0], y0, q[1]]), out: [0, -1, 0], color: Array.isArray(src.side) ? src.side[0] : src.side });
      continue;
    }
    // Deckfläche: ohne die Teile, über denen ein anderes Stück weitergeht
    if (src.top !== false) {
      let parts = [s.ccw];
      for (const o of near(s.box)) {
        if (o === s || !(o.y0 <= y1 + TOL && o.y1 > y1 + TOL)) continue;
        parts = parts.flatMap((p) => subtractConvex(p, o.ccw).parts);
        if (!parts.length) break;
      }
      for (const p of parts) {
        // Etage darüber: deren Wandfuß sitzt hier auf
        let rest = [p];
        for (const o of nearUp(s.box)) {
          if (!(o.y0 <= y1 + TOL && o.y1 > y1 + TOL)) continue;
          rest = rest.flatMap((q) => {
            const cut = subtractConvex(q, o.ccw);
            if (cut.inside) lids.push({ pts: cut.inside.map((x) => [x[0], y1, x[1]]), out: [0, 1, 0], color: src.cap });
            return cut.parts;
          });
        }
        for (const q of rest) faces.push({ pts: q.map((x) => [x[0], y1, x[1]]), out: [0, 1, 0], color: src.cap });
      }
    }
    // Unterfläche: ohne die Teile, unter denen ein anderes Stück weitergeht (auch der Etage darunter)
    if (src.bottom !== false) {
      let parts = [s.ccw];
      for (const o of [...near(s.box), ...nearDown(s.box)]) {
        if (o === s || !(o.y1 >= y0 - TOL && o.y0 < y0 - TOL)) continue;
        parts = parts.flatMap((p) => subtractConvex(p, o.ccw).parts);
        if (!parts.length) break;
      }
      const color = Array.isArray(src.side) ? src.side[0] : src.side;
      for (const p of parts) faces.push({ pts: p.map((x) => [x[0], y0, x[1]]), out: [0, -1, 0], color });
    }
  }
  conform([...faces, ...lids]);
  return { faces, lids };
}

/**
 * Stoßfugen ohne Lichtpunkte: liegt die Ecke einer Fläche auf der Kante einer anderen Fläche derselben Ebene
 * (T-Stelle, z. B. Stufe neben höherer Stufe, Brüstung neben voller Wand, Wandfuß unter den Stücken), rastern
 * beide Kanten leicht verschieden und lassen einzelne Bildpunkte frei. Solche Ecken werden zusätzliche Eckpunkte
 * der Kante; die Fläche bekommt dann einen Fächer aus ihrer Mitte (center = true), damit jede Teilkante eine
 * Dreieckskante ist. Ändert die Flächen in faces.
 */
export function conform(faces) {
  // Ebenen: gleiche Richtung nach außen und gleicher Abstand vom Ursprung
  const groups = new Map();
  for (const f of faces) {
    if (!f.pts?.length) continue;
    const d = f.out[0] * f.pts[0][0] + f.out[1] * f.pts[0][1] + f.out[2] * f.pts[0][2];
    const key = f.out.map((v) => Math.round(v * 1e6)).join();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ f, d });
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.d - b.d);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i].d - list[i - 1].d < 1e-7) continue;
      if (i - start > 1) conformPlane(list.slice(start, i).map((x) => x.f));
      start = i;
    }
  }
  return faces;
}

function conformPlane(faces) {
  const out = faces[0].out;
  // Koordinaten in der Ebene: Deckflächen (x, z), Seitenflächen (waagerecht entlang der Ebene, y)
  const flat = Math.abs(out[1]) > 0.5;
  const uv = (p) => (flat ? [p[0], p[2]] : [p[0] * -out[2] + p[2] * out[0], p[1]]);
  const cells = new Map();
  const C = 0.5;
  const cell = (u, v) => `${Math.floor(u / C)},${Math.floor(v / C)}`;
  for (const f of faces) {
    for (const p of f.pts) {
      const q = uv(p);
      const k = cell(q[0], q[1]);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push({ q, p });
    }
  }
  for (const f of faces) {
    const pts = [];
    let added = false;
    f.pts.forEach((p, i) => {
      pts.push(p);
      const a = uv(p);
      const b = uv(f.pts[(i + 1) % f.pts.length]);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-9) return;
      const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const found = [];
      for (let i0 = Math.floor((Math.min(a[0], b[0]) - 1e-6) / C); i0 <= Math.floor((Math.max(a[0], b[0]) + 1e-6) / C); i0++) {
        for (let k0 = Math.floor((Math.min(a[1], b[1]) - 1e-6) / C); k0 <= Math.floor((Math.max(a[1], b[1]) + 1e-6) / C); k0++) {
          for (const c of cells.get(`${i0},${k0}`) ?? []) {
            const w = [c.q[0] - a[0], c.q[1] - a[1]];
            const along = w[0] * dir[0] + w[1] * dir[1];
            if (along <= 1e-6 || along >= L - 1e-6 || Math.abs(w[0] * dir[1] - w[1] * dir[0]) > 1e-7) continue;
            found.push({ along, p: c.p });
          }
        }
      }
      found.sort((x, y) => x.along - y.along);
      let last = 0;
      for (const x of found) {
        if (x.along - last < 1e-6) continue;
        pts.push(x.p);
        last = x.along;
        added = true;
      }
    });
    if (added) {
      f.pts = pts;
      f.center = true;
    }
  }
}
