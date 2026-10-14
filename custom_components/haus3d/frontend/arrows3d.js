// Achsen-Pfeile im Editor-3D (ohne DOM, mit node testbar): Anker am gewählten Möbelstück oder Verteiler,
// Zugwert entlang einer Achse (Raster, Grenzen), Strg bzw. „Nur Ansicht“ = nur Kamera, Hinweistexte.

import { FURNITURE, furnitureBaseY } from "./furniture.js";
import { NODE_BODY, nodeBaseY, nodeMaxY } from "./pipenodes.js";

/** Achsen: Schlüssel, Richtung (Welt), Farbe (rot X, grün Höhe, blau Z). */
export const AXES = [
  ["x", [1, 0, 0], 0xe53935],
  ["y", [0, 1, 0], 0x43a047],
  ["z", [0, 0, 1], 0x1e88e5],
];
export const AXIS_DIR = Object.fromEntries(AXES.map(([k, d]) => [k, d]));
export const AXIS_LABEL = { x: "X", y: "Höhe über Boden", z: "Z" };
/** Grenze für x/z (m), wie die Koordinaten im Schema. */
export const COORD = 1000;
/** Flach liegende Dinge: nur auf dem Boden verschieben (kein Höhen-Pfeil). */
export const FLAT = new Set(["stairs", "stairwell", "parking"]);

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const vec = (p) => (Array.isArray(p) ? p : [p?.x, p?.y, p?.z]).map(Number);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Nächster Punkt zwischen Achse (origin + t·dir) und Zeigerstrahl (ro + s·rd): Parameter t entlang der Achse.
 * null, wenn Achse und Strahl fast parallel sind, der Punkt hinter der Kamera liegt oder ins Unendliche läuft.
 * Punkte und Richtungen als [x, y, z] oder {x, y, z}.
 */
export function axisParam(origin, dir, ro, rd) {
  const o = vec(origin);
  const u = vec(dir);
  const r = vec(ro);
  const len = Math.hypot(...vec(rd));
  if (!(len > 0)) return null;
  const v = vec(rd).map((x) => x / len);
  const w = [o[0] - r[0], o[1] - r[1], o[2] - r[2]];
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const den = a * c - b * b;
  if (!(Math.abs(den) >= 1e-6)) return null;
  const t = (b * e - c * d) / den;
  const s = (a * e - b * d) / den;
  if (!(s >= 0) || !(Math.abs(t) <= 1e4)) return null;
  return t;
}

/**
 * Neuer Wert einer Achse beim Ziehen: Start + Versatz, im Raster (Höhe höchstens 5 cm, „Frei“ 1 cm) und in den
 * Grenzen (Höhe 0 … min(20, max), x/z ±1000), auf mm gerundet.
 */
export function axisValue(axis, start, delta, { grid = 0.05, free = false, max = 20 } = {}) {
  const g = grid > 0 ? grid : 0.05;
  const step = free ? 0.01 : axis === "y" ? Math.min(g, 0.05) : g;
  const hi = axis === "y" ? Math.min(20, fin(max) ? Math.max(0, max) : 20) : COORD;
  const lo = axis === "y" ? 0 : -COORD;
  let v = Number(start) + Number(delta);
  if (!Number.isFinite(v)) v = Number.isFinite(Number(start)) ? Number(start) : 0;
  return r3(clamp(Math.round(v / step) * step, lo, hi));
}

/** Wie sehr zeigt eine Achse zur Kamera (0 = quer, 1 = genau darauf)? Ab 0,97 wird der Arm ausgeblendet. */
export function axisFacing(dir, view) {
  const a = vec(dir);
  const b = vec(view);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n > 0 && Number.isFinite(n) ? Math.min(1, Math.abs(dot(a, b)) / n) : 0;
}

/**
 * Anker der Pfeile an der Auswahl: Lage x/z, Mitte y (über dem Boden der Etage), Unterkante base, größte Höhe
 * max (Verteiler: Decke minus Gehäuse, mit building wie bei den Leitungen unter Platte bzw. Dachschräge) und die
 * ziehbaren Achsen ("xyz" bzw. "xz" für Flaches, Säulen bis zur Decke und Durchführungen).
 * @returns {{x: number, z: number, y: number, base: number, max: number, axes: string}|null}
 */
export function arrowAnchor(floor, sel, building = null) {
  if (!floor || !sel?.id) return null;
  const fh = Number(floor.height) || 2.5;
  if (sel.kind === "furniture") {
    const m = (floor.furniture ?? []).find((q) => q.id === sel.id);
    if (!m || !fin(m.x) || !fin(m.z)) return null;
    const def = FURNITURE[m.type] ?? ["", 0.6, 0.6, 0.8];
    const rawH = Number(m.h) || def[3];
    const h = rawH || fh;
    const b = Number(furnitureBaseY(m, fh, h));
    const base = Number.isFinite(b) ? b : 0;
    return { x: m.x, z: m.z, y: base + h / 2, base, max: 20, axes: FLAT.has(m.type) || !rawH ? "xz" : "xyz" };
  }
  if (sel.kind === "pnode") {
    const n = (floor.nodes ?? []).find((q) => q.id === sel.id);
    if (!n || !fin(n.x) || !fin(n.z)) return null;
    if (n.kind === "durch") return { x: n.x, z: n.z, y: fh / 2, base: 0, max: fh, axes: "xz" };
    const base = nodeBaseY(n, floor);
    return { x: n.x, z: n.z, y: base + (NODE_BODY[n.kind]?.h ?? 0.2) / 2, base, max: nodeMaxY(n, floor, building), axes: "xyz" };
  }
  return null;
}

/**
 * Wert einer Achse in die (kopierte) Etage schreiben: Möbel x/z bzw. Höhe als mount_y, Verteiler x/z/y.
 * Nur Achsen, die der Anker anbietet; die Höhe bleibt in 0 … max des Ankers (Verteiler unter der Decke); gibt
 * nichts zurück (change-Rückruf).
 */
export function applyAxis(floor, sel, axis, v, building = null) {
  const a = fin(v) ? arrowAnchor(floor, sel, building) : null;
  if (!a?.axes.includes(axis)) return;
  const val = axis === "y" ? r3(clamp(v, 0, a.max)) : v;
  if (sel.kind === "furniture") {
    const m = floor.furniture.find((q) => q.id === sel.id);
    if (axis === "y") m.mount_y = val;
    else m[axis] = val;
  } else {
    const n = floor.nodes.find((q) => q.id === sel.id);
    n[axis] = val;
  }
}

/** Nur Ansicht: Strg bzw. ⌘ gehalten oder der Knopf „Nur Ansicht“ an. */
export const viewOnly = (ev, mods) => !!(ev?.ctrlKey || ev?.metaKey || mods?.view);

/**
 * Maustasten der Kamera: in der Ansicht mit Strg/⌘/Umschalt links und rechts tauschen, damit links dreht und
 * rechts schiebt (die Kamera-Steuerung tauscht mit diesen Tasten selbst). Werte wie THREE.MOUSE.
 */
export function orbitButtons(view, ev) {
  if (view && (ev?.ctrlKey || ev?.metaKey || ev?.shiftKey)) return { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
  return { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
}

/** Hinweis oben links im Editor-3D. */
export function hint3d({ view = false, coarse = false, roof = false, mac = false } = {}) {
  if (roof) return coarse ? "3D: ein Finger dreht · zwei Finger schieben und zoomen" : "3D: Ziehen dreht · rechte Maustaste schiebt · Rad zoomt";
  if (view) return coarse ? "Nur Ansicht: ein Finger dreht · zwei Finger schieben und zoomen" : "Nur Ansicht: Ziehen dreht · rechte Maustaste schiebt · Rad zoomt";
  if (coarse) return "3D: Antippen wählt · Teil oder Pfeil ziehen verschiebt · leere Fläche dreht · „Nur Ansicht“: nur drehen und zoomen";
  return `3D: Möbel und Verteiler ziehen · Pfeile: rot X, blau Z, grün Höhe · leere Fläche dreht · ${mac ? "⌘" : "Strg"} halten = nur Ansicht`;
}
