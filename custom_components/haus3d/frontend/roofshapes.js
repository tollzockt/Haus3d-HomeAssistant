// Dachformen ohne Three.js (mit node testbar): Hauptrichtung des Hauses, Zerlegung des Grundrisses in
// Rechtecke (Dachteile), Dachteile von Hand anpassen, Walmenden, Dachformen eigener Dächer und freier
// Dachteile (Sattel-, Walm-, Pult-, Zelt-, Mansard-, Krüppelwalm-, Kegel-, Flachdach, Dachterrasse) mit der
// Höhe an einem Punkt. Koordinaten in Metern, Plan [x, z].

import { centroid, pointInPolygon, signedArea } from "./walls.js";

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Hauptrichtung der Kanten (Winkel in rad, 0 bis PI/2), gewichtet nach Länge. */
export function mainDirection(rooms) {
  // Winkel modulo 90° als Vektor auf dem Vierfach-Kreis mitteln
  let sx = 0;
  let sz = 0;
  for (const r of rooms) {
    const pts = r.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const t = 4 * Math.atan2(dz, dx);
      sx += len * Math.cos(t);
      sz += len * Math.sin(t);
    }
  }
  let ang = Math.atan2(sz, sx) / 4;
  if (ang < 0) ang += Math.PI / 2;
  return Math.abs(ang - Math.PI / 2) < 1e-9 ? 0 : ang;
}

/**
 * Dachteile für beliebige rechtwinklige Grundrisse (L, T, U): Grundriss am Haus ausgerichtet in
 * Rechtecke zerlegen. Der größte Teil ist das Hauptdach; Flügel laufen bis zum First des Teils,
 * an dem sie hängen (so entsteht ein L- oder T-Satteldach).
 * exclude: Räume (mit eigenem Dach oder unter einem Dachteil), deren Lücke im Haus nicht aufgefüllt wird.
 * @returns {{center:number[], u:number[], v:number[], length:number, width:number, open:[boolean, boolean]}[]}
 *   open[0]/open[1]: Ende bei -length/2 bzw. +length/2 steckt im Nachbardach (kein Giebel nötig).
 */
export function roofParts(rooms, { wall = 0.24, overhang = 0.4, direction = "auto", maxParts = 4, exclude = [] } = {}) {
  const all = rooms.flatMap((r) => r.points ?? []);
  if (all.length < 3) return [];
  const ang = mainDirection(rooms);
  const A = [Math.cos(ang), Math.sin(ang)];
  const B = [-A[1], A[0]];
  const loc = (p) => [p[0] * A[0] + p[1] * A[1], p[0] * B[0] + p[1] * B[1]];
  const polys = rooms.map((r) => r.points.map(loc));
  // Räume mit eigenem Dach oder unter einem Dachteil: ihre Lücke im Haus wird nicht aufgefüllt
  const ex = (exclude ?? []).filter((r) => (r.points ?? []).length >= 3).map((r) => r.points.map(loc));
  // Kanten sammeln, nahe Werte (< 0,4 m) zusammenfassen: kleine Nischen und Versätze verschwinden
  const merge = (vals) => {
    const out = [];
    for (const v of vals.sort((x, y) => x - y)) if (!out.length || v - out[out.length - 1] > 0.4) out.push(v);
    return out;
  };
  const xs = merge(polys.flat().map((p) => p[0]));
  const ys = merge(polys.flat().map((p) => p[1]));
  const n = xs.length - 1;
  const m = ys.length - 1;
  if (n < 1 || m < 1) return [];
  const inside = [];
  for (let i = 0; i < n; i++) {
    inside.push([]);
    for (let j = 0; j < m; j++) {
      const c = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
      inside[i].push(polys.some((p) => pointInPolygon(c, p)));
    }
  }
  // schmale Streifen zwischen zwei Räumen (Spalt, Schacht) gehören zum Haus
  const thin = inside.map((row, i) =>
    row.map((v, j) =>
      v ||
      (xs[i + 1] - xs[i] < 0.6 && i > 0 && i < n - 1 && inside[i - 1][j] && inside[i + 1][j]) ||
      (ys[j + 1] - ys[j] < 0.6 && j > 0 && j < m - 1 && inside[i][j - 1] && inside[i][j + 1]),
    ),
  );
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) inside[i][j] = thin[i][j];
  // Löcher (z. B. Schacht zwischen zwei Räumen) füllen: alles, was nicht von außen erreichbar ist
  const outside = inside.map((row) => row.map(() => false));
  const stack = [];
  for (let i = 0; i < n; i++) for (const j of [0, m - 1]) stack.push([i, j]);
  for (let j = 0; j < m; j++) for (const i of [0, n - 1]) stack.push([i, j]);
  while (stack.length) {
    const [i, j] = stack.pop();
    if (i < 0 || j < 0 || i >= n || j >= m || outside[i][j] || inside[i][j]) continue;
    outside[i][j] = true;
    stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  const cell = inside.map((row, i) => row.map((v, j) => v || (!outside[i][j] && !ex.some((p) => pointInPolygon([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], p)))));
  const area = (i0, i1, j0, j1) => (xs[i1] - xs[i0]) * (ys[j1] - ys[j0]);
  const full = (i0, i1, j0, j1, test) => {
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) if (!test(i, j)) return false;
    return true;
  };
  // größtes Rechteck aus Zellen, die test erfüllen
  const largest = (test) => {
    let best = null;
    for (let i0 = 0; i0 < n; i0++)
      for (let i1 = i0 + 1; i1 <= n; i1++)
        for (let j0 = 0; j0 < m; j0++)
          for (let j1 = j0 + 1; j1 <= m; j1++) {
            if (!full(i0, i1, j0, j1, test)) break;
            const a = area(i0, i1, j0, j1);
            if (!best || a > best.a + 1e-9) best = { i0, i1, j0, j1, a };
          }
    return best;
  };
  const covered = cell.map((row) => row.map(() => false));
  const cover = (r) => {
    for (let i = r.i0; i < r.i1; i++) for (let j = r.j0; j < r.j1; j++) covered[i][j] = true;
  };
  const total = cell.flat().reduce((s, v, k) => s + (v ? area(Math.floor(k / m), Math.floor(k / m) + 1, k % m, (k % m) + 1) : 0), 0);
  const main = largest((i, j) => cell[i][j]);
  if (!main) return [];
  cover(main);
  // Rechteck in lokalen Koordinaten [a0, a1] × [b0, b1], ridge: "a" oder "b"
  const lenA = xs[main.i1] - xs[main.i0];
  const lenB = ys[main.j1] - ys[main.j0];
  let mainRidge = lenA >= lenB ? "a" : "b";
  if (direction === "x") mainRidge = Math.abs(A[0]) >= Math.abs(B[0]) ? "a" : "b";
  else if (direction === "z") mainRidge = Math.abs(A[1]) >= Math.abs(B[1]) ? "a" : "b";
  const parts = [{ a0: xs[main.i0], a1: xs[main.i1], b0: ys[main.j0], b1: ys[main.j1], ridge: mainRidge, open: [false, false], ext: {} }];
  while (parts.length < maxParts) {
    const rest = cell.flat().reduce((s, v, k) => s + (v && !covered[Math.floor(k / m)][k % m] ? area(Math.floor(k / m), Math.floor(k / m) + 1, k % m, (k % m) + 1) : 0), 0);
    if (rest < Math.max(4, total * 0.05)) break;
    const stub = largest((i, j) => cell[i][j] && !covered[i][j]);
    if (!stub || stub.a < 3) break;
    cover(stub);
    const part = { a0: xs[stub.i0], a1: xs[stub.i1], b0: ys[stub.j0], b1: ys[stub.j1], open: [false, false], ext: {} };
    // Anschluss an ein vorhandenes Teil suchen, dessen First quer zur Anschlussrichtung läuft
    const eps = 0.01;
    for (const q of parts) {
      const overlapA = Math.min(part.a1, q.a1) - Math.max(part.a0, q.a0) > 0.3;
      const overlapB = Math.min(part.b1, q.b1) - Math.max(part.b0, q.b0) > 0.3;
      // inner: Länge des Stücks, das im Nachbardach steckt (ab dessen Traufe); dort ohne seitlichen Überstand
      if (overlapA && q.ridge === "a" && Math.abs(part.b1 - q.b0) < eps) {
        part.b1 = (q.b0 + q.b1) / 2; part.ridge = "b"; part.open = [false, true]; part.ext.b1 = part.b1 - q.b0; break;
      }
      if (overlapA && q.ridge === "a" && Math.abs(part.b0 - q.b1) < eps) {
        part.b0 = (q.b0 + q.b1) / 2; part.ridge = "b"; part.open = [true, false]; part.ext.b0 = q.b1 - part.b0; break;
      }
      if (overlapB && q.ridge === "b" && Math.abs(part.a1 - q.a0) < eps) {
        part.a1 = (q.a0 + q.a1) / 2; part.ridge = "a"; part.open = [false, true]; part.ext.a1 = part.a1 - q.a0; break;
      }
      if (overlapB && q.ridge === "b" && Math.abs(part.a0 - q.a1) < eps) {
        part.a0 = (q.a0 + q.a1) / 2; part.ridge = "a"; part.open = [true, false]; part.ext.a0 = q.a1 - part.a0; break;
      }
    }
    part.ridge ??= part.a1 - part.a0 >= part.b1 - part.b0 ? "a" : "b";
    parts.push(part);
  }
  const grow = wall + overhang;
  return parts.map((q) => {
    const a0 = q.a0 - (q.ext.a0 ? 0 : grow);
    const a1 = q.a1 + (q.ext.a1 ? 0 : grow);
    const b0 = q.b0 - (q.ext.b0 ? 0 : grow);
    const b1 = q.b1 + (q.ext.b1 ? 0 : grow);
    const ca = (a0 + a1) / 2;
    const cb = (b0 + b1) / 2;
    const center = [r3(ca * A[0] + cb * B[0]), r3(ca * A[1] + cb * B[1])];
    // inner[0]/[1]: Länge ab dem offenen Ende, die im Nachbardach steckt (bis zu dessen Traufe)
    const inLo = q.ridge === "a" ? q.ext.a0 : q.ext.b0;
    const inHi = q.ridge === "a" ? q.ext.a1 : q.ext.b1;
    const inner = [inLo ? r3(inLo + grow) : 0, inHi ? r3(inHi + grow) : 0];
    return q.ridge === "a"
      ? { center, u: A, v: B, length: r3(a1 - a0), width: r3(b1 - b0), open: q.open, inner }
      : { center, u: B, v: [-A[0], -A[1]], length: r3(b1 - b0), width: r3(a1 - a0), open: q.open, inner };
  });
}

/** Walmenden eines Dachteils: [Anfang, Ende]. */
export function partHipEnds(fr, roof) {
  const [openLo, openHi] = fr.open ?? [false, false];
  const wingHip = roof.type === "gable" && roof.wing_end === "hip" && (openLo || openHi);
  return [!openLo && (roof.type === "hip" || (wingHip && openHi)), !openHi && (roof.type === "hip" || (wingHip && openLo))];
}

/**
 * Dachteile von Hand anpassen (Dach-Ebene im Editor): adjust[k] = {lo, hi, a, b} verlängert (+) bzw.
 * kürzt (−) Teil k am Anfang/Ende entlang des Firsts (lo/hi) und an den beiden Traufen (a: Seite −v,
 * b: Seite +v), in Metern. Der First bleibt in der Mitte zwischen den Traufen.
 */
export function adjustRoofParts(parts, adjust, flip = false) {
  // flip: Pultdach andersherum (hohe Seite tauschen) – Querachse v umdrehen
  if (flip) parts = parts.map((fr) => ({ ...fr, v: [-fr.v[0], -fr.v[1]] }));
  if (!Array.isArray(adjust) || !adjust.length) return parts;
  return parts.map((fr, k) => {
    const d = adjust[k];
    if (!d) return fr;
    const lo = Number(d.lo) || 0;
    const hi = Number(d.hi) || 0;
    const a = Number(d.a) || 0;
    const b = Number(d.b) || 0;
    if (!lo && !hi && !a && !b) return fr;
    const length = Math.max(0.3, fr.length + lo + hi);
    const width = Math.max(0.3, fr.width + a + b);
    const ds = (hi - lo) / 2;
    const dt = (b - a) / 2;
    return {
      ...fr,
      length,
      width,
      center: [fr.center[0] + fr.u[0] * ds + fr.v[0] * dt, fr.center[1] + fr.u[1] * ds + fr.v[1] * dt],
    };
  });
}

// ------------------------------------------------------------------ Dachformen eigener Dächer und freier Dachteile

/** Dachformen eigener Dächer und freier Dachteile: Schlüssel und Name. */
export const ROOF_PART_TYPES = [
  ["flat", "Flachdach"],
  ["shed", "Pultdach"],
  ["gable", "Satteldach"],
  ["hip", "Walmdach"],
  ["pyramid", "Zeltdach"],
  ["mansard", "Mansarddach"],
  ["halfhip", "Krüppelwalmdach"],
  ["cone", "Kegeldach (Turm)"],
  ["terrace", "Dachterrasse"],
];
/** Formen für das eigene Dach eines Raums (room.roof): „Kein Dach“ und alle Dachformen. */
export const ROOM_ROOF_TYPES = [["none", "Kein Dach"], ...ROOF_PART_TYPES];
/** Formen mit einem Dach je Raum (nie mit Nachbarräumen zusammengelegt). */
export const SINGLE_TYPES = ["pyramid", "mansard", "halfhip", "cone", "terrace"];
/** Formen, bei denen berührende Räume gleicher Form ein gemeinsames Dach bekommen. */
export const GROUP_TYPES = ["flat", "gable", "hip", "shed"];
/** Formen über Bandrahmen (First entlang, Kanten von Hand anpassbar). */
export const BAND_TYPES = ["gable", "hip", "shed", "mansard", "halfhip"];
/** Standardneigung je Dachform (Grad); bei Flachdach und Dachterrasse ohne Bedeutung. */
export const PART_PITCH = { flat: 35, shed: 15, gable: 35, hip: 30, pyramid: 35, mansard: 30, halfhip: 40, cone: 55, terrace: 35 };
/** Flache Formen (Platte statt Dachflächen). */
export const isFlatType = (t) => t === "flat" || t === "terrace";

const PART_KEYS = ROOF_PART_TYPES.map(([k]) => k);
const rz = (v) => r3(v) + 0; // ohne −0
const clamp = (lo, hi, v) => Math.min(hi, Math.max(lo, v));
const tanOf = (deg) => Math.tan((deg * Math.PI) / 180);
// Zahl aus Zahl oder Text, sonst Standard (null, "" und Wahrheitswerte zählen nicht)
const num = (v, d) => ((typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : d);
const finitePt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * Einstellungen eines Dachteils bzw. eines eigenen Dachs der neuen Formen mit Standardwerten und Grenzen.
 * Unbekannte Form → Satteldach; Dachterrasse ohne Überstand und ohne Höhenversatz.
 */
export function partSettings(p = {}) {
  const raw = p ?? {};
  const type = PART_KEYS.includes(raw.type) ? raw.type : "gable";
  const pitch = clamp(5, 80, Number(raw.pitch) || PART_PITCH[type]);
  const terrace = type === "terrace";
  return {
    ...raw,
    type,
    pitch,
    overhang: terrace ? 0 : clamp(0, 1.5, num(raw.overhang, 0.4)),
    direction: ["auto", "cross", "x", "z"].includes(raw.direction) ? raw.direction : "auto",
    flip: !!raw.flip,
    wing_end: raw.wing_end === "hip" ? "hip" : "gable",
    base: terrace ? 0 : clamp(-5, 20, num(raw.base, 0)),
    // Mansarddach: unten mindestens 5° steiler als oben (sonst wäre das Profil nicht von unten konkav)
    pitch_low: Math.min(85, Math.max(pitch + 5, clamp(20, 85, Number(raw.pitch_low) || 70))),
    break: clamp(0.1, 0.9, Number(raw.break) || 0.35),
    ends: raw.ends === "hip" ? "hip" : "gable",
    hip_ratio: clamp(0.1, 0.9, Number(raw.hip_ratio) || 0.35),
    railing: ["glass", "bars", "wood", "none"].includes(raw.railing) ? raw.railing : "glass",
    railing_height: clamp(0.3, 2.5, Number(raw.railing_height) || 1),
  };
}

/** Neues freies Dachteil (floor.roofs): Farbe und Deckung vom Hausdach (nicht bei der Dachterrasse). */
export function newRoofPart(type, points, { id = null, name = null, roof = null } = {}) {
  const t = PART_KEYS.includes(type) ? type : "gable";
  const part = { ...(id ? { id } : {}), type: t, points: points.map(([x, z]) => [rz(x), rz(z)]) };
  if (name) part.name = String(name).slice(0, 60);
  if (!isFlatType(t)) part.pitch = PART_PITCH[t];
  if (t !== "terrace") for (const k of ["color", "texture"]) if (roof?.[k]) part[k] = roof[k];
  return part;
}

/** Rechteck mit den Ecken a und b, ausgerichtet am Winkel ang (Hauptrichtung des Hauses), gegen den Uhrzeigersinn. */
export function rectInFrame(a, b, ang = 0) {
  const A = [Math.cos(ang), Math.sin(ang)];
  const B = [-A[1], A[0]];
  const sa = [a[0] * A[0] + a[1] * A[1], b[0] * A[0] + b[1] * A[1]];
  const sb = [a[0] * B[0] + a[1] * B[1], b[0] * B[0] + b[1] * B[1]];
  const [a0, a1, b0, b1] = [Math.min(...sa), Math.max(...sa), Math.min(...sb), Math.max(...sb)];
  return [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([s, t]) => [rz(s * A[0] + t * B[0]), rz(s * A[1] + t * B[1])]);
}

/**
 * Umriss um d nach außen versetzt (d als Zahl oder je Kante i = Punkt i → i+1). Ein Punkt je Ecke, gleiche
 * Reihenfolge; spitze Ecken werden auf miter·d gekürzt.
 */
export function offsetPolygon(points, d, miter = 3) {
  const n = points.length;
  if (n < 3) return points.map((p) => [...p]);
  const sg = signedArea(points) >= 0 ? 1 : -1;
  const dist = (i) => (Array.isArray(d) ? Number(d[i]) || 0 : Number(d) || 0);
  const dir = (i) => {
    const a = points[i];
    const b = points[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : null;
  };
  const dirs = points.map((_, i) => dir(i));
  // Kanten der Länge 0 übernehmen die Richtung der nächsten Kante
  for (let i = 0; i < n; i++) if (!dirs[i]) dirs[i] = dirs.find(Boolean) ?? [1, 0];
  return points.map((p, i) => {
    const k = (i - 1 + n) % n;
    const [u0, u1] = [dirs[k], dirs[i]];
    const [n0, n1] = [[sg * u0[1], -sg * u0[0]], [sg * u1[1], -sg * u1[0]]];
    const [d0, d1] = [dist(k), dist(i)];
    const p0 = [p[0] + n0[0] * d0, p[1] + n0[1] * d0];
    const p1 = [p[0] + n1[0] * d1, p[1] + n1[1] * d1];
    const cr = u0[0] * u1[1] - u0[1] * u1[0];
    let q;
    if (Math.abs(cr) < 1e-9) q = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    else {
      const t = ((p1[0] - p0[0]) * u1[1] - (p1[1] - p0[1]) * u1[0]) / cr;
      q = [p0[0] + u0[0] * t, p0[1] + u0[1] * t];
    }
    const lim = miter * Math.max(Math.abs(d0), Math.abs(d1));
    const off = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (off > lim && off > 1e-12) q = [p[0] + ((q[0] - p[0]) * lim) / off, p[1] + ((q[1] - p[1]) * lim) / off];
    return q;
  });
}

/** Konvexe Hülle (gegen den Uhrzeigersinn, ohne Punkte auf Kanten). */
export function convexHull(points) {
  const pts = points.filter(finitePt).map((p) => [p[0], p[1]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-12) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(pts);
  const upper = half([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Kreis um einen Umriss (Mittelpunkt = Schwerpunkt, Radius bis zur entferntesten Ecke). */
export function circleOf(points) {
  const c = centroid(points);
  return { center: c, r: Math.max(0, ...points.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))) };
}

/** n-Eck auf einem Kreis (gegen den Uhrzeigersinn), z. B. Umriss eines Turms. */
export function circlePoints(c, r, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [rz(c[0] + r * Math.cos(a)), rz(c[1] + r * Math.sin(a))];
  });
}

/**
 * Bandrahmen für Räume bzw. einen Umriss: roofParts, dazu „cross“ (First entlang der kurzen Seite) – bei genau
 * einem Rahmen werden Länge und Breite getauscht.
 */
export function framesFor(rooms, { wall = 0.24, overhang = 0.4, direction = "auto" } = {}) {
  const frames = roofParts(rooms, { wall, overhang, direction: direction === "cross" ? "auto" : direction });
  if (direction !== "cross" || frames.length !== 1) return frames;
  const f = frames[0];
  return [{ ...f, u: f.v, v: [-f.u[0] + 0, -f.u[1] + 0], length: f.width, width: f.length }];
}

// Polygon (konvex) auf die Seite f(q) ≤ 0 einer Geraden zuschneiden
function clipHalf(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa <= 1e-12) out.push(a);
    if ((fa < -1e-12 && fb > 1e-12) || (fa > 1e-12 && fb < -1e-12)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const area2d = (ps) => Math.abs(signedArea(ps));

// Dreiecke eines ebenen, konvexen 3D-Vielecks; Normale zeigt in Richtung want
function fan3(pts, want, list) {
  for (let i = 1; i + 1 < pts.length; i++) {
    const [a, b, c] = [pts[0], pts[i], pts[i + 1]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...nrm);
    if (len < 1e-9) continue; // entartet (Punkte auf einer Linie)
    list.push(nrm[0] * want[0] + nrm[1] * want[1] + nrm[2] * want[2] >= 0 ? [a, b, c] : [a, c, b]);
  }
}

// Punkte einer Linie, die nichts zur Form beitragen, entfernen
function dropCollinear(pts) {
  const out = [];
  for (const p of pts) {
    if (out.length && Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) < 1e-9) continue;
    out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const [a, b, c] = [out[(i - 1 + out.length) % out.length], out[i], out[(i + 1) % out.length]];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/*
 * Ebenen eines Bandrahmens: y = o + tan · (n · (s, t) + c), Abstand von einer Kante des Rahmens nach innen.
 * Seiten: n = (0, ∓1) (Traufe +v bzw. −v), Enden: n = (±1, 0). Die Dachfläche ist das Minimum der Ebenen
 * (Profile von unten konkav), über mehrere Rahmen gilt das Maximum.
 */
function framePlanes(fr, type, s, eave, tan, tanLow) {
  const L = fr.length / 2;
  const W = fr.width / 2;
  const ov = s.overhang;
  const P = (o, ns, nt, c, tn) => ({ o, n: [ns, nt], c, tan: tn, side: ns === 0 });
  if (type === "shed") return [P(eave, 0, 1, W, tan)];
  // Profil von einer Kante nach innen: Mansarddach mit Knick bei d1, sonst eine Ebene
  const d1 = Math.min(W - 0.1, Math.max(ov + 0.1, W * s.break));
  const prof = (ns, nt, c) => (type === "mansard" ? [P(eave, ns, nt, c, tanLow), P(eave + d1 * (tanLow - tan), ns, nt, c, tan)] : [P(eave, ns, nt, c, tan)]);
  const planes = [...prof(0, -1, W), ...prof(0, 1, W)];
  const [hipLo, hipHi] = fr.hipEnds;
  if (type === "halfhip") {
    // Krüppelwalm: unten Giebel, oben ein Walm ab der Höhe yc (Anteil hip_ratio)
    const dc = Math.min(W - 0.1, Math.max(ov + 0.1, W * (1 - s.hip_ratio)));
    const ks = Math.min(1, L / Math.max(0.05, W - dc));
    const yc = eave + dc * tan;
    if (!fr.open[0]) planes.push(P(yc, 1, 0, L, tan / ks));
    if (!fr.open[1]) planes.push(P(yc, -1, 0, L, tan / ks));
  } else {
    if (hipLo) planes.push(...prof(1, 0, L));
    if (hipHi) planes.push(...prof(-1, 0, L));
  }
  return planes;
}

// Ebene als y = a·s + b·t + c
const linOf = (p) => [p.tan * p.n[0], p.tan * p.n[1], p.o + p.tan * p.c];

function bandShape(pts, raw, s, { wall, top, open }) {
  const type = s.type;
  const tan = tanOf(s.pitch);
  const tanLow = type === "mansard" ? tanOf(s.pitch_low) : tan;
  const eave = top - s.overhang * tanLow;
  const frames0 = adjustRoofParts(framesFor([{ points: pts }], { wall, overhang: s.overhang, direction: s.direction }), raw.adjust, type === "shed" && s.flip);
  if (!frames0.length) return null;
  const frames = frames0.map((fr, k) => {
    const op = [!!(fr.open?.[0] || open?.[k]?.[0]), !!(fr.open?.[1] || open?.[k]?.[1])];
    const f = { ...fr, open: op };
    if (type === "gable" || type === "hip") f.hipEnds = partHipEnds(f, { type, wing_end: s.wing_end });
    else if (type === "mansard") f.hipEnds = s.ends === "hip" ? [!op[0], !op[1]] : [false, false];
    else if (type === "halfhip") f.hipEnds = [!op[0], !op[1]];
    else f.hipEnds = [false, false];
    return f;
  });
  const out = { eave, tan, frames, faces: [], roofTris: [], gableTris: [], ridges: [], probes: [], outline: [] };
  const data = []; // je Rahmen die Ebenen (für at)
  frames.forEach((fr, k) => {
    const L = fr.length / 2;
    const W = fr.width / 2;
    const Q = (sx, tx) => [fr.center[0] + sx * fr.u[0] + tx * fr.v[0], fr.center[1] + sx * fr.u[1] + tx * fr.v[1]];
    const W3 = (sx, tx, y) => {
      const q = Q(sx, tx);
      return [q[0], y, q[1]];
    };
    const planes = framePlanes(fr, type, s, eave, tan, tanLow);
    const lins = planes.map(linOf);
    data.push({ fr, lins, planes });
    const rect = [[-L, -W], [L, -W], [L, W], [-L, W]];
    out.outline.push(rect.map(([a, b]) => Q(a, b)));
    // Dachflächen: Rechteck dort, wo die Ebene die niedrigste ist
    planes.forEach((pl, i) => {
      const [ai, bi, ci] = lins[i];
      let poly = rect;
      for (let j = 0; j < planes.length && poly.length; j++) {
        if (j === i) continue;
        const [aj, bj, cj] = lins[j];
        const [A, B, C] = [ai - aj, bi - bj, ci - cj];
        if (Math.abs(A) < 1e-12 && Math.abs(B) < 1e-12) {
          if (C > 1e-12 || (C >= -1e-12 && j < i)) poly = [];
          continue;
        }
        poly = clipHalf(poly, (q) => A * q[0] + B * q[1] + C);
      }
      poly = poly.length >= 3 ? dropCollinear(poly) : [];
      if (poly.length < 3 || area2d(poly) < 1e-6) return;
      const fo = [-(pl.n[0] * fr.u[0] + pl.n[1] * fr.v[0]) + 0, -(pl.n[0] * fr.u[1] + pl.n[1] * fr.v[1]) + 0];
      const ys = poly.map(([a, b]) => ai * a + bi * b + ci);
      out.faces.push({ poly: poly.map(([a, b]) => Q(a, b)), y: ys, out: fo, tan: pl.tan, k });
      fan3(poly.map(([a, b], m) => W3(a, b, ys[m])), [0, 1, 0], out.roofTris);
    });
    // Höhe der Seiten allein (ohne Walm), für Firstlinie und Proben an den Enden
    const sides = lins.filter((_, i) => planes[i].side);
    const sideY = (sx, tx) => Math.min(...sides.map(([a, b, c]) => a * sx + b * tx + c));
    if (type !== "shed") {
      const yr = sideY(0, 0);
      let lo = -L;
      let hi = L;
      planes.forEach((pl, i) => {
        if (pl.side) return;
        const [a, , c] = lins[i];
        const sx = (yr - c) / a;
        if (pl.n[0] > 0) lo = Math.max(lo, sx);
        else hi = Math.min(hi, sx);
      });
      if (hi - lo > 0.01) out.ridges.push([Q(lo, 0), Q(hi, 0)]);
    }
    const ov = s.overhang;
    const Wi = Math.max(0.1, W - ov);
    for (const [side, sg] of [[0, -1], [1, 1]]) {
      if (fr.open[side]) continue;
      // Proben am Ende (First und Traufecken): steckt es unter einem anderen Dach, bleibt es offen (roofunits)
      out.probes.push({ k, side, pts: [0, W - 0.05, -(W - 0.05)].map((tx) => [...Q(sg * L, tx), sideY(sg * L, tx)]) });
      // Giebel an der Wandlinie: Fläche unter dem Profil (Walm → keine Fläche)
      const s0 = sg * Math.max(0.1, L - ov);
      const prof = (tx) => Math.max(top, Math.min(...lins.map(([a, b, c]) => a * s0 + b * tx + c)));
      const ts = [-Wi, Wi];
      for (let i = 0; i < lins.length; i++) {
        const [ai, bi, ci] = lins[i];
        if (Math.abs(bi) > 1e-12) ts.push((top - ai * s0 - ci) / bi);
        for (let j = i + 1; j < lins.length; j++) {
          const [aj, bj, cj] = lins[j];
          if (Math.abs(bi - bj) > 1e-12) ts.push(((aj - ai) * s0 + cj - ci) / (bi - bj));
        }
      }
      const tl = [...new Set(ts.filter((tx) => tx >= -Wi - 1e-9 && tx <= Wi + 1e-9).map((tx) => Math.max(-Wi, Math.min(Wi, tx))))].sort((x, y) => y - x);
      const face = dropCollinear([[-Wi, top], [Wi, top], ...tl.map((tx) => [tx, prof(tx)])]);
      if (face.length < 3 || area2d(face) < 1e-4) continue;
      fan3(face.map(([tx, y]) => W3(s0, tx, y)), [sg * fr.u[0], 0, sg * fr.u[1]], out.gableTris);
    }
    if (type === "shed") {
      // hohe Wand des Pultdachs
      const lo = fr.open[0] ? L : Math.max(0.1, L - ov);
      const hi = fr.open[1] ? L : Math.max(0.1, L - ov);
      const high = sideY(0, Wi);
      if (high - top > 0.01) fan3([W3(-lo, Wi, top), W3(hi, Wi, top), W3(hi, Wi, high), W3(-lo, Wi, high)], [fr.v[0], 0, fr.v[1]], out.gableTris);
    }
  });
  // Höhe an einem Punkt: je Rahmen das Minimum der Ebenen, über die Rahmen das Maximum
  out.at = (x, z) => {
    let best = null;
    for (const { fr, lins, planes } of data) {
      const dx = x - fr.center[0];
      const dz = z - fr.center[1];
      const sx = dx * fr.u[0] + dz * fr.u[1];
      const tx = dx * fr.v[0] + dz * fr.v[1];
      if (Math.abs(sx) > fr.length / 2 + 1e-6 || Math.abs(tx) > fr.width / 2 + 1e-6) continue;
      let m = -1;
      let y = Infinity;
      lins.forEach(([a, b, c], i) => {
        const v = a * sx + b * tx + c;
        if (v < y - 1e-12) [m, y] = [i, v];
      });
      if (m < 0) continue; // keine Ebene darunter (NaN-Lage)
      const pl = planes[m];
      const hit = { y, out: [-(pl.n[0] * fr.u[0] + pl.n[1] * fr.v[0]) + 0, -(pl.n[0] * fr.u[1] + pl.n[1] * fr.v[1]) + 0], tan: pl.tan, part: fr };
      if (!best || hit.y > best.y) best = hit;
    }
    return best;
  };
  return out;
}

function slabShape(pts, s, { wall, top, deck, edgeOffsets, railFree }) {
  const terrace = s.type === "terrace";
  const offs = terrace ? edgeOffsets ?? wall : wall + s.overhang;
  const poly = offsetPolygon(pts, offs);
  const y1 = terrace ? (Number.isFinite(deck) ? deck : top + 0.15) : top + 0.25;
  let rail = null;
  if (terrace && s.railing !== "none") {
    const list = Array.isArray(offs) ? offs : pts.map(() => offs);
    const inner = offsetPolygon(pts, list.map((d) => Math.max(0, (Number(d) || 0) - 0.05)));
    const edges = inner.map((a, i) => [a, inner[(i + 1) % inner.length]]).filter((_, i) => railFree?.[i] !== false);
    rail = { style: s.railing, height: s.railing_height, y: y1, edges };
  }
  return {
    eave: top,
    tan: 0,
    slab: { poly, y0: top, y1 },
    rail,
    deck: terrace ? y1 : null,
    edgeOffsets: terrace ? (Array.isArray(offs) ? offs : pts.map(() => offs)) : null,
    railFree: terrace ? pts.map((_, i) => railFree?.[i] !== false) : null,
    faces: [{ poly, y: poly.map(() => y1), out: null, tan: 0, k: 0 }],
    outline: [poly],
    at: (x, z) => (pointInPolygon([x, z], poly) ? { y: y1, out: null, tan: 0, part: null } : null),
  };
}

function pyramidShape(pts, s, { wall, top }) {
  const tan = tanOf(s.pitch);
  const hull = offsetPolygon(convexHull(pts), wall + s.overhang);
  if (hull.length < 3) return null;
  const apex = centroid(hull);
  const edges = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const n = [(b[1] - a[1]) / l + 0, -(b[0] - a[0]) / l + 0]; // nach außen (Hülle gegen den Uhrzeigersinn)
    edges.push({ a, b, n, d: -((apex[0] - a[0]) * n[0] + (apex[1] - a[1]) * n[1]) });
  }
  const dmin = Math.min(...edges.map((e) => e.d));
  const dmax = Math.max(...edges.map((e) => e.d));
  if (!(dmin > 1e-6)) return null;
  // steilste Fläche mit der Neigung; Traufe so, dass auch die flachste Fläche über der Wandlinie liegt
  const eave = top - s.overhang * tan * (dmin / dmax);
  const Y = eave + dmin * tan;
  for (const e of edges) e.tan = (Y - eave) / e.d;
  const out = { eave, tan, faces: [], roofTris: [], ridges: hull.map((p) => [p, apex]), outline: [hull] };
  for (const e of edges) {
    out.faces.push({ poly: [e.a, e.b, apex], y: [eave, eave, Y], out: e.n, tan: e.tan, k: 0 });
    fan3([[e.a[0], eave, e.a[1]], [e.b[0], eave, e.b[1]], [apex[0], Y, apex[1]]], [0, 1, 0], out.roofTris);
  }
  out.at = (x, z) => {
    if (!pointInPolygon([x, z], hull)) return null;
    let best = null;
    for (const e of edges) {
      const y = eave + e.tan * -((x - e.a[0]) * e.n[0] + (z - e.a[1]) * e.n[1]);
      if (!best || y < best.y - 1e-12) best = { y, out: e.n, tan: e.tan, part: null };
    }
    return best;
  };
  return out;
}

function coneShape(pts, s, { wall, top }) {
  const tan = tanOf(s.pitch);
  const { center: c, r: r0 } = circleOf(pts);
  const R = r0 + wall + s.overhang;
  const eave = top - s.overhang * tan;
  const apex = eave + R * tan;
  const N = 24;
  const faces = Array.from({ length: N }, (_, i) => {
    const [a0, a1] = [(2 * Math.PI * i) / N, (2 * Math.PI * (i + 1)) / N];
    const am = (a0 + a1) / 2;
    return { poly: [[c[0] + R * Math.cos(a0), c[1] + R * Math.sin(a0)], [c[0] + R * Math.cos(a1), c[1] + R * Math.sin(a1)], [c[0], c[1]]], y: [eave, eave, apex], out: [Math.cos(am), Math.sin(am)], tan, k: 0 };
  });
  return {
    eave,
    tan,
    cone: { center: c, r: R, eave, apex },
    faces,
    outline: [faces.map((f) => f.poly[0])],
    at: (x, z) => {
      const d = Math.hypot(x - c[0], z - c[1]);
      if (d > R + 1e-6) return null;
      return { y: apex - d * tan, out: d > 1e-9 ? [(x - c[0]) / d, (z - c[1]) / d] : [1, 0], tan, part: null };
    },
  };
}

/**
 * Form eines freien Dachteils bzw. eines eigenen Dachs der neuen Formen (Raumdach: points = Raumumriss).
 * ctx: wall (Außenwand), top (Ansatz an der Wandlinie, bei Teilen samt base), deck (Belag der Dachterrasse),
 * edgeOffsets/railFree (Dachterrasse je Kante), open[k] = [Anfang, Ende] (Ende steckt unter einem anderen Dach).
 * @returns {{id:string|null, type:string, part:object, top:number, eave:number, tan:number, pitched:boolean,
 *   ridgeY:number, bbox:number[], frames:object[], outline:number[][][], faces:{poly:number[][], y:number[],
 *   out:number[]|null, tan:number, k:number}[], roofTris:number[][][], gableTris:number[][][], ridges:number[][][],
 *   probes:object[], slab:object|null, rail:object|null, cone:object|null, at:Function}|null}
 *   null bei weniger als 3 Punkten oder weniger als 0,05 m² (zu klein oder verdreht)
 */
export function partShape(raw, { wall = 0.24, top = 0, deck = null, edgeOffsets = null, railFree = null, open = null } = {}) {
  const pts = raw?.points ?? [];
  if (!Array.isArray(pts) || pts.length < 3 || !pts.every(finitePt) || Math.abs(signedArea(pts)) < 0.05) return null;
  const s = partSettings(raw);
  const t0 = Number.isFinite(top) ? top : 0;
  const ctx = { wall: Number.isFinite(wall) ? wall : 0.24, top: t0, deck, edgeOffsets, railFree, open };
  const sh = isFlatType(s.type) ? slabShape(pts, s, ctx) : s.type === "pyramid" ? pyramidShape(pts, s, ctx) : s.type === "cone" ? coneShape(pts, s, ctx) : bandShape(pts, raw, s, ctx);
  if (!sh) return null;
  const all = sh.outline.flat();
  const xs = all.map((p) => p[0]);
  const zs = all.map((p) => p[1]);
  const bbox = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  const ys = sh.faces.flatMap((f) => f.y);
  const ridgeY = Math.max(t0, ...ys, sh.slab?.y1 ?? -Infinity, sh.cone?.apex ?? -Infinity);
  const inner = sh.at;
  // umgekehrt geprüft: NaN bzw. fehlende Lage liegt nie in der Box → null
  const at = (x, z) => (x >= bbox[0] - 1e-6 && x <= bbox[2] + 1e-6 && z >= bbox[1] - 1e-6 && z <= bbox[3] + 1e-6 ? inner(x, z) : null);
  return { id: raw.id ?? null, type: s.type, part: s, top: t0, pitched: !isFlatType(s.type), frames: [], roofTris: [], gableTris: [], ridges: [], probes: [], slab: null, rail: null, cone: null, deck: null, edgeOffsets: null, railFree: null, ...sh, ridgeY, bbox, at };
}
