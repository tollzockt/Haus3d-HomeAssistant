// Dachgeschoss: Giebelflächen des Hausdachs, Löcher mit Laibung für Fenster und Türen darin und Höhe der
// Öffnungen unter der Dachschräge. Ohne Three.js, Koordinaten wie walls.js (Plan [x, z]).

import { atticKnee, partHipEnds } from "./exterior.js";
import { atticModels, ownModels, surfaceAt, surfaceFor } from "./roofunits.js";
import { computeWalls } from "./walls.js";

const GAP = 0.03; // Abstand unter der Dachfläche (Wandstufen, Oberkante von Fenstern und Türen)
const BLIND_OUT = 0.0425; // Außenseite des Behangs (Rollladen) vor der Außenfläche: 3 cm Abstand + halbe Stärke (scene.js)
const neg = (p) => [0 - p[0], 0 - p[1]]; // ohne −0
const pos0 = (p) => [p[0] + 0, p[1] + 0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);

/** Oberkante einer Außenwand im Dachgeschoss: zuerst die Dächer der eigenen Räume (R2), sonst das höchste Dach über p, sonst die Raumhöhe. */
export function exteriorTopAt(models, p, elev, height, roomIds = []) {
  const own = ownModels(models, roomIds);
  if (own.length) return Math.max(0, Math.min(height, Math.max(...own.map((m) => m.top - elev))));
  const h = p ? surfaceAt(models, p) : null;
  return h ? Math.max(0, Math.min(height, h.model.top - elev)) : height;
}

/**
 * Oberkante einer Wand im Dachgeschoss in Stufen (je ~25 cm). Außenwände: mit eigenem Dach (Hausdach, Raumdach,
 * Dachteil) eine Stufe bis zu dessen Ansatz (Kniestock bzw. Raumhöhe unter Flachdach und Dachterrasse), ohne
 * eigenes Dach je Stufe das höchste Dach darüber, sonst die Raumhöhe. Innenwände knapp unter der Dachfläche der
 * eigenen Räume (das Dach ist entlang einer Linie nach unten gewölbt, das Minimum der Stufenenden bleibt darunter),
 * mindestens Kniestock; freie Wände unter der höchsten Dachfläche.
 * @returns {[number, number, number][]} [s0, s1, Höhe über Boden]
 */
export function atticTop(models, seg, elev, height, knee) {
  const L = seg.length;
  const ids = [seg.roomLeft, seg.roomRight].filter(Boolean);
  const n = Math.max(1, Math.ceil(L / 0.25) || 1);
  const P = (s) => [seg.a[0] + seg.u[0] * s, seg.a[1] + seg.u[1] * s];
  if (seg.kind === "exterior") {
    if (ownModels(models, ids).length) return [[0, L, exteriorTopAt(models, null, elev, height, ids)]];
    const out = [];
    for (let i = 0; i < n; i++) {
      const s0 = (L * i) / n;
      const s1 = (L * (i + 1)) / n;
      const top = exteriorTopAt(models, P((s0 + s1) / 2), elev, height);
      const last = out[out.length - 1];
      if (last && Math.abs(last[2] - top) < 1e-9) last[1] = s1;
      else out.push([s0, s1, top]);
    }
    return out;
  }
  const at = (s) => {
    const hit = seg.kind === "free" ? surfaceAt(models, P(s)) : surfaceFor(models, P(s), ids);
    return hit && Number.isFinite(hit.y) ? hit.y - elev - GAP : height;
  };
  // die Wandenden reichen in den Anschluss hinein (extendA/B): dort ebenfalls unter der Dachfläche bleiben
  const out = [];
  let prev = at(-(Number(seg.extendA) || 0));
  for (let i = 0; i < n; i++) {
    const s0 = (L * i) / n;
    const s1 = (L * (i + 1)) / n;
    const next = at(i === n - 1 ? s1 + (Number(seg.extendB) || 0) : s1);
    out.push([s0, s1, Math.max(knee, Math.min(height, prev, next))]);
    prev = next;
  }
  return out;
}

/**
 * Giebelflächen eines Dachs der Rahmen-Art (Satteldach, Walmdach ohne Flächen, Pultdach mit hoher Wand) an der
 * Außenseite der Wand: Ebene durch origin, Achse axis (waagerecht), Normale nach außen; poly in (a, y) mit a
 * entlang axis ab origin und y als Höhe, Unterkante poly[0] → poly[1] von links nach rechts (gegen den
 * Uhrzeigersinn). holes sammelt atticOpenings.
 * @returns {{key:string, origin:number[], axis:number[], normal:number[], poly:number[][], holes:object[]}[]}
 */
export function gableFaces({ roof, parts, top, eave, tan } = {}) {
  const type = roof?.type;
  if (!["gable", "hip", "shed"].includes(type) || !Array.isArray(parts)) return [];
  const ov = Number(roof.overhang) || 0;
  const out = [];
  parts.forEach((fr, k) => {
    const L = fr.length / 2;
    const W = fr.width / 2;
    const Wi = Math.max(0.1, W - ov);
    const [openLo, openHi] = fr.open ?? [false, false];
    const Llo = openLo ? L : Math.max(0.1, L - ov);
    const Lhi = openHi ? L : Math.max(0.1, L - ov);
    const at = (s, t) => pos0([fr.center[0] + s * fr.u[0] + t * fr.v[0], fr.center[1] + s * fr.u[1] + t * fr.v[1]]);
    const u = pos0(fr.u);
    const v = pos0(fr.v);
    const face = (key, origin, axis, normal, poly) => out.push({ key: `${k}:${key}`, origin, axis, normal, poly, holes: [] });
    if (type === "shed") {
      const high = eave + (Wi + W) * tan;
      if (!openLo) face("lo", at(-Llo, 0), v, neg(u), [[-Wi, top], [Wi, top], [Wi, high]]);
      if (!openHi) face("hi", at(Lhi, 0), v, u, [[-Wi, top], [Wi, top], [Wi, high]]);
      face("high", at(0, Wi), u, v, [[-Llo, top], [Lhi, top], [Lhi, high], [-Llo, high]]);
      return;
    }
    const [hipLo, hipHi] = fr.hipEnds ?? partHipEnds(fr, roof);
    const ridge = eave + W * tan;
    const yi = eave + (W - Wi) * tan;
    if (!hipLo && !openLo) face("lo", at(-Llo, 0), v, neg(u), [[-Wi, yi], [Wi, yi], [0, ridge]]);
    if (!hipHi && !openHi) face("hi", at(Lhi, 0), v, u, [[-Wi, yi], [Wi, yi], [0, ridge]]);
  });
  return out;
}

/**
 * Giebelfläche vor einem Wandstück (p0, p1 auf der Außenseite, out nach außen): gleiche Richtung, parallel,
 * höchstens tolIn hinter der Außenseite, im Bereich der Fläche. Gewinner ist die nächste. depth = Abstand des
 * Giebels vor der Außenseite; far = weit davor (dort kein Loch).
 * @returns {{face:object, a0:number, a1:number, depth:number, far:boolean}|null}
 */
export function matchGable(faces, p0, p1, out, { tolIn = 0.05, tolOut = 1 } = {}) {
  let best = null;
  for (const face of faces ?? []) {
    if (dot(face.normal, out) < 0.999) continue;
    const d0 = dot(sub(p0, face.origin), face.normal);
    const d1 = dot(sub(p1, face.origin), face.normal);
    if (!(Math.abs(d0 - d1) <= 0.02)) continue;
    const depth = -(d0 + d1) / 2;
    if (!(depth >= -tolIn)) continue;
    const b0 = dot(sub(p0, face.origin), face.axis);
    const b1 = dot(sub(p1, face.origin), face.axis);
    const [a0, a1] = [Math.min(b0, b1), Math.max(b0, b1)];
    if (a1 <= face.poly[0][0] + 0.02 || a0 >= face.poly[1][0] - 0.02) continue;
    if (!best || Math.abs(depth) < Math.abs(best.depth)) best = { face, a0, a1, depth, far: depth > tolOut };
  }
  return best;
}

// niedrigste Dachfläche über der Linie s0 … s1 im Abstand off entlang dir (alle 25 cm) als Höhe über dem Boden, sonst Infinity
function roofMinAt(models, seg, s0, s1, dir, off, ids, elev) {
  const n = Math.max(1, Math.ceil((s1 - s0) / 0.25) || 1);
  let r = Infinity;
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const y = surfaceFor(models, [seg.a[0] + seg.u[0] * s + dir[0] * off, seg.a[1] + seg.u[1] * s + dir[1] * off], ids)?.y;
    if (Number.isFinite(y)) r = Math.min(r, y - elev);
  }
  return r;
}

// niedrigste Dachfläche über einem Wandstück (beide Wandseiten, alle 25 cm) als Höhe über dem Boden, sonst Infinity
function roofMin(models, seg, s0, s1, ids, elev) {
  return Math.min(roofMinAt(models, seg, s0, s1, seg.n, seg.left, ids, elev), roofMinAt(models, seg, s0, s1, seg.n, -seg.right, ids, elev));
}

/** Giebelflächen für atticOpenings: nur auf der Etage des Hausdachs (houseAttic.floor), sonst []. */
export const atticGables = (houseAttic, gables, floorId) => (houseAttic?.floor?.id === floorId ? gables ?? [] : []);

/**
 * Fenster und Türen im Dachgeschoss: Oberkante unter der Dachschräge bzw. am Kniestock (tops), ganz darüber
 * ausgeblendet (hidden), in einer Giebelwand des Hausdachs (gable) mit Loch im Giebel (schreibt face.holes).
 * openings ist die Liste für wallPieces: gekürzte Öffnungen als Kopie, sonst dasselbe Objekt.
 * blinds: Oberkante des Behangs (Rollladen) vor Außenwänden ohne Giebel, 1 cm unter der Dachfläche davor (an der
 * Traufe liegt sie dort tiefer als an der Wand); fehlt, wenn dort kein Dach ist.
 * faces: Giebelflächen des Hausdachs nur auf dessen Etage, sonst [].
 * @returns {{tops: Map<object, number>, openings: object[], hidden: Set<object>, gable: Set<object>, blinds: Map<object, number>}}
 */
export function atticOpenings(models, faces, segments, placedList, { elev = 0, height = 2.5, knee = 1 } = {}) {
  const tops = new Map();
  const blinds = new Map();
  const hidden = new Set();
  const gable = new Set();
  const openings = [];
  const segById = new Map((segments ?? []).map((s) => [s.id, s]));
  const steps = new Map();
  for (const placed of placedList ?? []) {
    const seg = segById.get(placed.segment);
    const o = placed.opening ?? {};
    const oh = Number(o.height);
    if (!seg || seg.height != null || !Number.isFinite(oh) || !Number.isFinite(height) || !Number.isFinite(placed.s0) || !Number.isFinite(placed.s1)) {
      openings.push(placed);
      continue;
    }
    const ids = [seg.roomLeft, seg.roomRight].filter(Boolean);
    const thick = seg.left + seg.right;
    let top;
    let hit = null;
    if (seg.kind === "exterior") {
      const r = roofMin(models, seg, placed.s0, placed.s1, ids, elev);
      const out = seg.roomLeft ? neg(seg.n) : pos0(seg.n);
      const P = (s) => [seg.a[0] + seg.u[0] * s + out[0] * thick, seg.a[1] + seg.u[1] * s + out[1] * thick];
      hit = matchGable(faces, P(placed.s0), P(placed.s1), out, { tolIn: Math.max(0.05, thick - 0.02) });
      if (hit?.far) hit = null; // Giebel weit vor der Wand: Wand endet am Kniestock wie ohne Giebel
      if (hit) top = Math.min(height, r - GAP);
      else {
        const s = (placed.s0 + placed.s1) / 2;
        const ext = exteriorTopAt(models, [seg.a[0] + seg.u[0] * s, seg.a[1] + seg.u[1] * s], elev, height, [o.room_id]);
        top = Math.min(height, ext, r < ext - 0.01 ? r - GAP : Infinity);
        const b = roofMinAt(models, seg, placed.s0, placed.s1, out, thick + BLIND_OUT, ids, elev);
        if (b < Infinity) blinds.set(placed, b - 0.01);
      }
    } else {
      if (!steps.has(seg.id)) steps.set(seg.id, atticTop(models, seg, elev, height, knee));
      top = Math.min(height, ...steps.get(seg.id).filter(([a, b]) => a < placed.s1 - 1e-6 && b > placed.s0 + 1e-6).map((x) => x[2]));
    }
    top = Math.max(0, Number.isFinite(top) ? top : height);
    const sill = Math.min(num(o.sill, 0), top);
    const h = Math.max(0.05, Math.min(oh, top - sill));
    tops.set(placed, top);
    if (hit) gable.add(placed);
    if (top - sill < 0.1) {
      hidden.add(placed);
      openings.push({ ...placed, opening: { ...o, height: 0 } });
      continue;
    }
    if (hit && sill + h > knee + 0.02) hit.face.holes.push({ id: o.id ?? null, a0: hit.a0, a1: hit.a1, y0: elev + Math.max(knee, sill), y1: elev + sill + h, depth: thick + hit.depth });
    openings.push(h < oh - 1e-9 ? { ...placed, opening: { ...o, height: h } } : placed);
  }
  return { tops, openings, hidden, gable, blinds };
}

// Vieleck (konvex) auf die Seite f(q) ≥ 0 zuschneiden
function clip(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= -1e-12) out.push(a);
    if ((fa < -1e-12 && fb > 1e-12) || (fa > 1e-12 && fb < -1e-12)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const signed2 = (ps) => ps.reduce((s, p, i) => s + p[0] * ps[(i + 1) % ps.length][1] - ps[(i + 1) % ps.length][0] * p[1], 0);

/**
 * Löcher in einer Giebelfläche: Rechtecke (a0..a1, y0..y1) bleiben margin unter dem Rand der Fläche (oben
 * topAt(a) − margin), überlappende werden zusammengefasst. Beginnt ein Loch an der Unterkante (Kniestock), wird
 * es eine Kerbe im Umriss. Laibungen links, rechts und oben, unten nur ohne Kerbe.
 * @returns {{outer:number[][], holes:number[][][], reveals:{a0:number, y0:number, a1:number, y1:number, depth:number}[]}}
 *   ohne Löcher ist outer === face.poly
 */
export function gableCut(face, holes, { margin = 0.02, min = 0.05 } = {}) {
  const poly = face.poly;
  const none = { outer: poly, holes: [], reveals: [] };
  if (!holes?.length || poly.length < 3) return none;
  const yb = poly[0][1];
  const as = poly.map((p) => p[0]);
  const [aLo, aHi] = [Math.min(...as) + margin, Math.max(...as) - margin];
  let rects = holes
    .filter((h) => [h?.a0, h?.a1, h?.y0, h?.y1].every(Number.isFinite))
    .map((h) => ({ a0: Math.max(aLo, Math.min(h.a0, h.a1)), a1: Math.min(aHi, Math.max(h.a0, h.a1)), y0: Math.min(h.y0, h.y1), y1: Math.max(h.y0, h.y1), depth: Math.max(0, num(h.depth, 0)) }))
    .filter((r) => r.a1 - r.a0 >= min && r.y1 - r.y0 >= min);
  // überlappende (um margin aufgeblasen) zusammenfassen, bis nichts mehr überlappt
  const overlaps = (p, q) => p.a0 - margin < q.a1 + margin && q.a0 - margin < p.a1 + margin && p.y0 - margin < q.y1 + margin && q.y0 - margin < p.y1 + margin;
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < rects.length && !changed; i++) {
      for (let j = i + 1; j < rects.length && !changed; j++) {
        if (!overlaps(rects[i], rects[j])) continue;
        const [p, q] = [rects[i], rects[j]];
        rects[i] = { a0: Math.min(p.a0, q.a0), a1: Math.max(p.a1, q.a1), y0: Math.min(p.y0, q.y0), y1: Math.max(p.y1, q.y1), depth: Math.max(p.depth, q.depth) };
        rects = rects.filter((_, k) => k !== j);
        changed = true;
      }
    }
  }
  // Ränder der Fläche (gegen den Uhrzeigersinn: innen links), um margin nach innen versetzt (oben senkrecht)
  const ccw = signed2(poly) > 0 ? 1 : -1;
  const edges = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const nl = [-(q[1] - p[1]) * ccw, (q[0] - p[0]) * ccw]; // Normale nach innen
    const shift = Math.abs(q[0] - p[0]) > 1e-9 ? [0, Math.sign(nl[1]) * margin] : [Math.sign(nl[0]) * margin, 0];
    const p2 = [p[0] + shift[0], p[1] + shift[1]];
    return (x) => (x[0] - p2[0]) * nl[0] + (x[1] - p2[1]) * nl[1];
  });
  const notches = []; // [kleinstes a, Weg um das Loch von links unten nach rechts unten]
  const inner = [];
  const reveals = [];
  const dir = Math.sign(poly[1][0] - poly[0][0]) || 1;
  for (const r of rects) {
    const notch = r.y0 <= yb + 0.005;
    const y0 = notch ? yb : r.y0;
    let P = ccw > 0 ? [[r.a0, y0], [r.a1, y0], [r.a1, r.y1], [r.a0, r.y1]] : [[r.a0, y0], [r.a0, r.y1], [r.a1, r.y1], [r.a1, y0]];
    edges.forEach((f, i) => {
      if (P.length && !(notch && i === 0)) P = clip(P, f);
    });
    if (P.length < 3) continue;
    const xs = P.map((p) => p[0]);
    const ys = P.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) < min || Math.max(...ys) - Math.min(...ys) < min || Math.abs(signed2(P)) / 2 < min * min) continue;
    if (notch) {
      // Kerbe: gegen die Richtung der Fläche um das Loch herum, von links unten nach rechts unten
      const low = P.map((p, i) => [p, i]).filter(([p]) => Math.abs(p[1] - yb) < 1e-9);
      if (low.length < 2) continue;
      const start = low.reduce((m, x) => (dir * x[0][0] < dir * m[0][0] ? x : m))[1];
      const end = low.reduce((m, x) => (dir * x[0][0] > dir * m[0][0] ? x : m))[1];
      const step = ccw > 0 ? -1 : 1;
      const path = [];
      for (let i = start; path.length <= P.length; i = (i + step + P.length) % P.length) {
        path.push(P[i]);
        if (i === end) break;
      }
      notches.push([dir * Math.min(...xs), path]);
    } else inner.push(P);
    const bottom = (p, q) => notch && Math.abs(p[1] - yb) < 1e-9 && Math.abs(q[1] - yb) < 1e-9;
    P.forEach((p, i) => {
      const q = P[(i + 1) % P.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9 && !bottom(p, q)) reveals.push({ a0: p[0], y0: p[1], a1: q[0], y1: q[1], depth: r.depth });
    });
  }
  if (!notches.length && !inner.length) return none;
  // Kerben in die Unterkante (poly[0] → poly[1]) einsetzen
  const outer = [poly[0], ...notches.sort((p, q) => p[0] - q[0]).flatMap((x) => x[1]), ...poly.slice(1)];
  return { outer, holes: inner, reveals };
}

/**
 * Dreiecke einer Giebelfläche (mit Löchern und Laibungen aus gableCut) als Koordinatenliste [x, y, z, …].
 * triangulate(outer, holes) liefert Index-Dreiecke über [...outer, ...holes.flat()] (z. B. THREE.ShapeUtils).
 * Ist die Zerlegung unvollständig, bleibt der Giebel ohne Löcher (nie ganz weg).
 */
export function gableTriangles(list, face, cut, triangulate) {
  const W = (a, y, d = 0) => [face.origin[0] + a * face.axis[0] - d * face.normal[0], y, face.origin[1] + a * face.axis[1] - d * face.normal[1]];
  const area2 = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
  const polyArea = (ps) => Math.abs(ps.reduce((s, p, i) => s + p[0] * ps[(i + 1) % ps.length][1] - ps[(i + 1) % ps.length][0] * p[1], 0)) / 2;
  const fan = (n) => Array.from({ length: n - 2 }, (_, i) => [0, i + 1, i + 2]);
  let [pts, tris, reveals] = [face.poly, fan(face.poly.length), []];
  if (cut.outer !== face.poly) {
    const all = [...cut.outer, ...cut.holes.flat()];
    const t = triangulate(cut.outer, cut.holes) ?? [];
    const want = polyArea(cut.outer) - cut.holes.reduce((s, h) => s + polyArea(h), 0);
    const got = t.reduce((s, [i, j, k]) => s + Math.abs(area2(all[i], all[j], all[k])) / 2, 0);
    // Zerlegung unvollständig: Giebel ohne Löcher (nie ganz weg)
    if (t.length && Math.abs(got - want) <= 1e-6 * Math.max(1, want)) [pts, tris, reveals] = [all, t, cut.reveals];
  }
  const sign = Math.sign(area2(face.poly[0], face.poly[1], face.poly[2]));
  for (const [i, j, k] of tris) {
    const [p, q, r] = area2(pts[i], pts[j], pts[k]) * sign < 0 ? [pts[i], pts[k], pts[j]] : [pts[i], pts[j], pts[k]];
    list.push(...W(...p), ...W(...q), ...W(...r));
  }
  for (const r of reveals) {
    const [a, b, c, d] = [W(r.a0, r.y0), W(r.a1, r.y1), W(r.a1, r.y1, r.depth), W(r.a0, r.y0, r.depth)];
    list.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
}

/**
 * Grenze einer Öffnung im Dachgeschoss für den Editor: Oberkante in 3D (top, über dem Boden), Kniestock,
 * Raumhöhe, in einer Giebelwand des Hausdachs, ganz ausgeblendet, Außenwand. null außerhalb eines
 * Dachgeschosses mit Dach bzw. für unbekannte Öffnungen und Wände mit eigener Höhe.
 * @returns {{top:number, knee:number, height:number, gable:boolean, hidden:boolean, exterior:boolean}|null}
 */
export function atticOpeningLimit(building, floor, id) {
  if (!floor?.attic) return null;
  const models = atticModels(building, { floorId: floor.id }).get(floor.id);
  if (!models?.length) return null;
  const house = models.find((m) => m.key === "house");
  const faces = house ? gableFaces(house) : [];
  const { segments, openings } = computeWalls(floor, building?.settings ?? {});
  const placed = openings.find((p) => p.opening?.id === id);
  if (!placed) return null;
  const height = floor.height ?? 2.5;
  const knee = atticKnee(floor);
  const lim = atticOpenings(models, faces, segments, [placed], { elev: floor.elevation ?? 0, height, knee });
  if (!lim.tops.has(placed)) return null;
  return { top: lim.tops.get(placed), knee, height, gable: lim.gable.has(placed), hidden: lim.hidden.has(placed), exterior: segments.find((s) => s.id === placed.segment)?.kind === "exterior" };
}
