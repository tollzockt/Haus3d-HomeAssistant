// Randsteine und Kanten (ohne Three.js, mit node testbar): Arten mit Maßen und Farben, Kantenstücke einer Gartenfläche
// bzw. Linie (ohne Strecken an Hauswänden) und Gehrungsecken. Gebaut werden sie in scene-kerb.js.
//
// Felder: Gartenfläche area.edge (Art, fehlt/"none" = keine) und area.edge_h (Höhe über der Fläche in m, fehlt = Standard der Art);
// Linie „Randstein“: Gartenfläche area.type "kerb" mit line {points, width}, area.edge (Art) und area.edge_h.

/**
 * Arten: w Breite, h Standardhöhe über der Fläche, hLine Standardhöhe als Linie, depth Tiefe im Boden, pitch Steinlänge
 * (0 = durchgehend), gap Fuge, round = runde Pfähle, shades Farben (Steine wechseln sich ab).
 */
export const KERB_KINDS = {
  concrete: { name: "Randstein Beton", w: 0.08, h: 0.05, hLine: 0.1, depth: 0.06, pitch: 1, gap: 0.006, shades: [0xcfcfca, 0xc4c4bf], rough: 0.9, metal: 0 },
  granite: { name: "Granit-Randstein", w: 0.1, h: 0.06, hLine: 0.12, depth: 0.08, pitch: 1, gap: 0.006, shades: [0x92959a, 0x85888d], rough: 0.5, metal: 0 },
  metal: { name: "Rasenkante Metall", w: 0.005, h: 0.02, hLine: 0.05, depth: 0.03, pitch: 0, gap: 0, shades: [0x575c63], rough: 0.4, metal: 0.6 },
  palisade: { name: "Palisaden Holz", w: 0.1, h: 0.15, hLine: 0.3, depth: 0.12, pitch: 0, gap: 0, round: true, shades: [0x8d5c31, 0x7c4e29, 0x9a6a3c], rough: 0.9, metal: 0 },
  paver: { name: "Pflaster-Läufer", w: 0.1, h: 0.03, hLine: 0.03, depth: 0.03, pitch: 0.15, gap: 0.01, shades: [0xa89f92, 0x9a9184, 0xb3a999], rough: 0.95, metal: 0 },
};

/** Auswahl im Editor: [Wert, Beschriftung]. */
export const KERB_CHOICES = [["none", "keine"], ...Object.entries(KERB_KINDS).map(([k, v]) => [k, v.name])];

const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

/**
 * Maße einer Art: Breite und Höhe (über der Fläche) überschreibbar. line: Standardhöhe der Linie statt der Fläche.
 * @returns {object|null} null bei „keine“ oder unbekannter Art
 */
export function kerbSpec(kind, { width, height, line = false } = {}) {
  const k = KERB_KINDS[kind];
  if (!k) return null;
  const w = num(width);
  const h = num(height);
  return {
    kind,
    ...k,
    w: Number.isFinite(w) && w > 0 ? Math.min(0.5, Math.max(0.004, w)) : k.w,
    h: Number.isFinite(h) && h > 0 ? Math.min(0.6, Math.max(0.005, h)) : line ? k.hLine : k.h,
  };
}

/** Standardhöhe einer Art (m) für die Anzeige im Editor. */
export const kerbDefaultHeight = (kind, line = false) => (KERB_KINDS[kind] ? (line ? KERB_KINDS[kind].hLine : KERB_KINDS[kind].h) : 0);

/** Arten von Gartenflächen, an denen ein Rand keinen Sinn hat (Hecke, Zaun, Balkon mit Geländer, Randstein selbst). */
export const NO_EDGE_TYPES = ["hedge", "fence", "balcony", "kerb"];

/**
 * Teilstrecken der Strecke a–b (Meter ab a), die NICHT an einer Raumkante (Hauswand) liegen: Raumkanten, die fast parallel
 * und höchstens tol entfernt sind, decken ihren Abschnitt ab.
 */
export function uncovered(a, b, rooms, tol = 0.3) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return [];
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const cover = [];
  for (const r of rooms ?? []) {
    const pts = r.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const el = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (el < 1e-6) continue;
      const v = [(q[0] - p[0]) / el, (q[1] - p[1]) / el];
      if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 0.05) continue; // nicht parallel
      const off = (c) => Math.abs((c[0] - p[0]) * v[1] - (c[1] - p[1]) * v[0]);
      if (off(a) > tol || off(b) > tol) continue;
      const s0 = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
      const s1 = (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1];
      const lo = Math.max(0, Math.min(s0, s1) - 0.02);
      const hi = Math.min(len, Math.max(s0, s1) + 0.02);
      if (hi > lo) cover.push([lo, hi]);
    }
  }
  cover.sort((x, y) => x[0] - y[0]);
  const free = [];
  let at = 0;
  for (const [lo, hi] of cover) {
    if (lo > at) free.push([at, lo]);
    at = Math.max(at, hi);
  }
  if (at < len) free.push([at, len]);
  return free.filter(([s0, s1]) => s1 - s0 >= 0.03);
}

/**
 * Kantenstücke eines Polygons (closed) bzw. einer Linie: je freier Teilstrecke einer Kante ein Stück
 * {i, a, b, len, ha, hb, prev, next} – i Kante, ha/hb Höhe an den Enden (aus heights je Eckpunkt linear), prev/next die Richtung
 * des anschließenden Stücks (für die Gehrung; null = stumpfes Ende, z. B. an der Hauswand).
 * @param {number[][]} points Eckpunkte [x, z]
 * @param {object[]} rooms Räume der Etage; Strecken an ihren Kanten fallen weg
 * @param {{closed?: boolean, tol?: number, heights?: number[]|null}} opts
 */
export function kerbSegments(points, rooms = [], { closed = true, tol = 0.3, heights = null } = {}) {
  // doppelte Punkte (und den Schlusspunkt eines geschlossenen Polygons) weglassen, Höhen mitführen
  const raw = points ?? [];
  const hRaw = Array.isArray(heights) && heights.length === raw.length ? heights.map((v) => Number(v) || 0) : null;
  const pts = [];
  const hList = [];
  raw.forEach((p, k) => {
    if (pts.length && Math.hypot(p[0] - pts.at(-1)[0], p[1] - pts.at(-1)[1]) <= 1e-6) return;
    pts.push(p);
    hList.push(hRaw ? hRaw[k] : 0);
  });
  if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6) {
    pts.pop();
    hList.pop();
  }
  const n = pts.length;
  if (n < 2) return [];
  const count = closed ? n : n - 1;
  const hs = hRaw ? hList : null;
  const per = [];
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const h0 = hs ? hs[i] : 0;
    const h1 = hs ? hs[(i + 1) % n] : 0;
    const list = uncovered(a, b, rooms, tol).map(([s0, s1]) => ({
      i,
      a: [a[0] + u[0] * s0, a[1] + u[1] * s0],
      b: [a[0] + u[0] * s1, a[1] + u[1] * s1],
      len: s1 - s0,
      ha: h0 + ((h1 - h0) * s0) / len,
      hb: h0 + ((h1 - h0) * s1) / len,
      u,
      prev: null,
      next: null,
      s0,
      s1,
      elen: len,
    }));
    per.push(list);
  }
  // Anschluss an die Nachbarkante: nur wenn beide Stücke bis zur gemeinsamen Ecke reichen
  for (let i = 0; i < count; i++) {
    const j = closed ? (i + 1) % count : i + 1;
    if (j >= count) continue;
    const cur = per[i].at(-1);
    const nxt = per[j][0];
    if (cur && nxt && Math.abs(cur.s1 - cur.elen) < 1e-6 && nxt.s0 < 1e-6) {
      cur.next = nxt.u;
      nxt.prev = cur.u;
    }
  }
  return per.flat().map(({ i, a, b, len, ha, hb, u, prev, next }) => ({ i, a, b, len, ha, hb, u, prev, next }));
}

/**
 * Eckpunkte eines Stücks (Mitte a–b, Breite w): links/rechts am Anfang und am Ende, an Anschlüssen auf Gehrung
 * (Gehrung bis Faktor 2 wie bei offsetPolyline, sonst stumpf). Links = linke Normale (−uz, ux).
 * @returns {{L0: number[], R0: number[], L1: number[], R1: number[]}}
 */
export function kerbCorners(seg, w) {
  const hw = w / 2;
  const u = seg.u;
  const n = [-u[1], u[0]];
  const side = (v, other, atStart) => {
    // v: Eckpunkt, other: Richtung des Nachbarstücks (null = stumpf)
    if (!other) return { l: [v[0] + n[0] * hw, v[1] + n[1] * hw], r: [v[0] - n[0] * hw, v[1] - n[1] * hw] };
    const u0 = atStart ? other : u;
    const u1 = atStart ? u : other;
    const n0 = [-u0[1], u0[0]];
    const n1 = [-u1[1], u1[0]];
    const m = [n0[0] + n1[0], n0[1] + n1[1]];
    const ml = Math.hypot(m[0], m[1]);
    const dot = ml > 1e-9 ? (m[0] * n0[0] + m[1] * n0[1]) / ml : 0;
    if (ml < 1e-9 || 1 / dot > 2) return side(v, null, atStart);
    const k = hw / dot / ml;
    return { l: [v[0] + m[0] * k, v[1] + m[1] * k], r: [v[0] - m[0] * k, v[1] - m[1] * k] };
  };
  const s = side(seg.a, seg.prev, true);
  const e = side(seg.b, seg.next, false);
  return { L0: s.l, R0: s.r, L1: e.l, R1: e.r };
}

/** Anzahl Steine (Blöcke) eines Stücks: Länge ÷ Steinlänge gerundet, mindestens 1; durchgehend = 1. */
export const kerbBlocks = (len, pitch) => (pitch > 0 ? Math.max(1, Math.round(len / pitch)) : 1);
