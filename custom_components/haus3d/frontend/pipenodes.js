// Verteiler-Geometrie (ohne DOM, mit node testbar): Gehäusemaße, Lage an der Wand (Vorderseite zum Raum,
// Rückseite an der Wand), Gehäusehöhe und senkrechte Anschlüsse von Leitungsenden an Verteiler und Leitungen.

import { nodeMedium } from "./pipenet.js";
import { ceilingAlong } from "./pipelevels.js";

/** Abstand Rohrmitte bzw. Verteilerpunkt zur Wandoberfläche (m). */
export const WALL_GAP = 0.06;
/** So nah (m) gilt ein Leitungsende als angeschlossen (wie pipenet). */
export const END_TOL = 0.05;

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Winkel auf 0…360 (Grad, 3 Nachkommastellen); nicht endlich → 0. */
export function normDeg(d) {
  const v = Number(d);
  if (!Number.isFinite(v)) return 0;
  const n = r3(((v % 360) + 360) % 360);
  return n >= 360 ? 0 : n;
}

/** Gehäuse je Art: Breite w, Höhe h, Tiefe d, Unterkante y über dem Boden (null = auf Leitungshöhe), rund. */
export const NODE_BODY = {
  hv: { w: 0.6, h: 0.9, d: 0.16, y: 0.9 },
  uv: { w: 0.45, h: 0.6, d: 0.16, y: 0.9 },
  einspeisung: { w: 0.35, h: 0.45, d: 0.15, y: 1.0 },
  abzweig: { w: 0.1, h: 0.06, d: 0.1, y: null },
  router: { w: 0.28, h: 0.05, d: 0.18, y: 0.8 },
  switch: { w: 0.44, h: 0.05, d: 0.18, y: 0.8 },
  wasser_in: { w: 0.14, h: 0.25, d: 0.14, y: 0.3, round: true },
  warm_in: { w: 0.56, h: 1.5, d: 0.56, y: 0, round: true },
  durch: { w: 0.12, h: null, d: 0.12, y: 0, round: true },
};

const TURN = new Set(["hv", "uv", "einspeisung", "router", "switch"]);

/** Lässt sich der Verteiler drehen (eckiges Gehäuse mit Vorderseite)? */
export const turnable = (n) => TURN.has(n?.kind) && n.model !== false;

/** Kleinster Winkelabstand zweier Richtungen (Grad). */
const angDiff = (a, b) => {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return Math.min(d, 360 - d);
};

/**
 * Platz an der nächsten Wandfläche (edit-ops.wallFaces: p, u, n zum Raum, t0/t1): Punkt im Abstand WALL_GAP
 * vor der Wand, Drehung mit der Vorderseite (lokal +z) zum Raum. half > 0: halbe Gehäusebreite, die neben
 * der Fläche Platz haben muss (bleibt aus der Ecke heraus).
 * @returns {{x: number, z: number, rotation: number, dist: number}|null}
 */
export function wallSpot(faces, p, { tol = 0.3, half = 0 } = {}) {
  let best = null;
  for (const f of faces ?? []) {
    const rel = [p[0] - f.p[0], p[1] - f.p[1]];
    const along = rel[0] * f.u[0] + rel[1] * f.u[1];
    const dist = rel[0] * f.n[0] + rel[1] * f.n[1];
    if (along < f.t0 - 0.05 || along > f.t1 + 0.05 || dist < -0.05 || dist > tol) continue;
    // gleich weit (Ecke, auch mit Rundungsrest): die erste Fläche gewinnt
    if (!best || dist < best.dist - 1e-9) best = { f, along, dist };
  }
  if (!best) return null;
  const { f } = best;
  let along = best.along;
  if (half > 0) {
    const m = half + WALL_GAP;
    along = f.t1 - f.t0 >= 2 * m ? clamp(along, f.t0 + m, f.t1 - m) : (f.t0 + f.t1) / 2;
  }
  return {
    x: r3(f.p[0] + f.u[0] * along + f.n[0] * WALL_GAP),
    z: r3(f.p[1] + f.u[1] * along + f.n[1] * WALL_GAP),
    rotation: normDeg((Math.atan2(-f.n[0], f.n[1]) * 180) / Math.PI),
    dist: best.dist,
  };
}

/**
 * Lage eines Verteilers zum Zeichnen: Drehung rot (Grad) und Versatz back des Gehäuses nach vorn (lokal +z),
 * damit die Rückseite an der Wand liegt. Ohne gespeicherte Drehung (ältere Stände) zur Wand gedreht;
 * runde Körper folgen immer der Wand.
 */
export function nodePose(n, faces = []) {
  const B = NODE_BODY[n?.kind];
  const stored = Number.isFinite(n?.rotation) ? normDeg(n.rotation) : null;
  if (!B || n.kind === "abzweig" || n.kind === "durch") return { rot: stored ?? 0, back: 0 };
  const wall = wallSpot(faces, [n.x, n.z], { tol: 0.15 });
  const rot = B.round ? wall?.rotation ?? stored ?? 0 : stored ?? wall?.rotation ?? 0;
  const back = wall && angDiff(rot, wall.rotation) < 10 ? r3(B.d / 2 - WALL_GAP) : 0;
  return { rot, back };
}

export const nodeRotation = (n, faces) => nodePose(n, faces).rot;

/** Höhe einer Leitung an Punkt i (wie pipes.pipeRoute). */
const heightAt = (pipe, i) => {
  const v = Number(pipe.heights?.[i]);
  return Number.isFinite(v) ? v : Number(pipe.height) || 0.03;
};

/**
 * Höhe einer Leitung an der nächsten Stelle zu p (wie gezeichnet: ein Höhenwechsel geht am Anfang eines
 * Stücks senkrecht, danach gilt die Höhe des Endpunkts). d = Abstand, atEnd = nächste Stelle ist ein Ende.
 * @returns {{d: number, h: number, atEnd: boolean}|null}
 */
export function pipeHeightAt(pipe, p) {
  const pts = pipe?.points ?? [];
  if (!pts.length) return null;
  if (pts.length === 1) return { d: Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]), h: heightAt(pipe, 0), atEnd: true };
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len || 1e-12), 0, 1);
    const d = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
    if (best && d >= best.d) continue;
    const head = t * len < 0.001;
    const tail = (1 - t) * len < 0.001;
    best = { d, h: heightAt(pipe, head ? i : i + 1), atEnd: (i === 0 && head) || (i === pts.length - 2 && tail) };
  }
  return best;
}

/** Höhe der nächsten Stromleitung innerhalb 0,3 m um (x, z), sonst 0,3 m (Abzweigdose sitzt darauf). */
export function pipeHeightNear(floor, x, z) {
  let best = null;
  for (const p of floor?.pipes ?? []) {
    if (p.type !== "strom") continue;
    const at = pipeHeightAt(p, [x, z]);
    if (at && at.d < 0.3 && (!best || at.d < best.d)) best = at;
  }
  return best?.h ?? 0.3;
}

/** Unterkante des Gehäuses über dem Boden (m): eigene Höhe n.y, sonst Standard der Art, Abzweigdose auf der Leitung. */
export function nodeBaseY(n, floor) {
  if (n.kind === "durch") return 0;
  if (Number.isFinite(n.y)) return n.y;
  const B = NODE_BODY[n.kind];
  if (!B) return 0;
  return B.y == null ? Math.max(0, pipeHeightNear(floor, n.x, n.z) - 0.03) : B.y;
}

/**
 * Höchste Unterkante eines Verteilers (m über dem Boden): Decke an der Stelle minus Gehäusehöhe, damit das
 * Gehäuse nie über der Decke sitzt. Mit building wie bei den Leitungen (ceilingAlong: lichte Höhe unter der
 * Etage darüber, im Dachgeschoss unter der Dachschräge), sonst die Raumhöhe (höchstens 20); Durchführung: Raumhöhe.
 */
export function nodeMaxY(n, floor, building = null) {
  const fh = Math.min(20, Number(floor?.height) || 2.5);
  if (n?.kind === "durch") return fh;
  const ceil = building && Number.isFinite(n?.x) && Number.isFinite(n?.z) ? Math.min(fh, ceilingAlong(building, floor, [n.x, n.z])) : fh;
  return r3(Math.max(0, ceil - (NODE_BODY[n?.kind]?.h ?? 0.2)));
}

/** Höhenbereich [unten, oben] des Gehäuses über dem Boden; null ohne Gegenstand. */
export function nodeSpan(n, floor) {
  const B = NODE_BODY[n?.kind];
  if (!B || n.model === false) return null;
  if (n.kind === "durch") return [0, floor?.height || 2.5];
  const y = nodeBaseY(n, floor);
  return [r3(y), r3(y + B.h)];
}

/**
 * Senkrechte Anschlüsse der Leitungsenden: Ende an einem Verteiler gleichen Mediums → auf die Höhe seines
 * Gehäuses; sonst Ende auf einer anderen Leitung gleichen Mediums (mitten darauf, oder Ende an Ende mit einer
 * früheren Leitung) → auf deren Höhe. Werte in m über dem Boden, null = kein Anschlussstück.
 * @returns {{head: number|null, tail: number|null}}
 */
export function pipeEndDrops(pipe, floor) {
  const pts = pipe?.points ?? [];
  if (pts.length < 2) return { head: null, tail: null };
  const pipes = floor?.pipes ?? [];
  let idx = pipes.indexOf(pipe);
  if (idx < 0) idx = pipes.findIndex((q) => q.id != null && q.id === pipe.id);
  if (idx < 0) idx = pipes.length;
  const end = (p, h) => {
    let target = null;
    let node = null;
    for (const n of floor?.nodes ?? []) {
      if ((nodeMedium(n.kind) ?? pipe.type) !== pipe.type) continue;
      const d = Math.hypot(n.x - p[0], n.z - p[1]);
      if (d <= END_TOL && (!node || d < node.d)) node = { n, d };
    }
    const span = node ? nodeSpan(node.n, floor) : null;
    if (span) target = clamp(h, span[0], span[1]);
    else {
      let best = null;
      pipes.forEach((q, i) => {
        if (q === pipe || i === idx || q.type !== pipe.type) return;
        const at = pipeHeightAt(q, p);
        if (!at || at.d > END_TOL || (at.atEnd && i > idx)) return;
        if (!best || at.d < best.d) best = at;
      });
      if (best) target = best.h;
    }
    return target != null && Math.abs(target - h) > 0.01 ? r3(target) : null;
  };
  return { head: end(pts[0], heightAt(pipe, 0)), tail: end(pts.at(-1), heightAt(pipe, pts.length - 1)) };
}
