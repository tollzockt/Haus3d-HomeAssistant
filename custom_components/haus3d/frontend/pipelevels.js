// Leitungshöhen (ohne DOM, mit node testbar): Stufen Boden bis Decke, Standard je Medium (Strom und Netzwerk
// an der Decke, Wasser am Boden), lichte Höhe unter der Etage darüber und unter der Dachschräge im Dachgeschoss.

import { pointInPolygon } from "./walls.js";
import { atticModels, surfaceFor } from "./roofunits.js";

/** Deckenstärke (m) zwischen zwei Etagen. */
export const SLAB = 0.15;
/** Abstand der Deckenstufe unter der Decke bzw. Dachschräge (m). */
export const CEILING_GAP = 0.15;
/** Abstand unter der Dachfläche (Dachaufbau), bevor die Leitung die Schräge berührt (m). */
export const ROOF_GAP = 0.03;

/** Höhenstufen: [Schlüssel, Name, Höhe über dem Boden (m); null = unter der Decke]. */
export const PIPE_LEVELS = [
  ["boden", "Boden", 0.03],
  ["sockel", "Sockelleiste", 0.15],
  ["steckdose", "Steckdose", 0.3],
  ["schalter", "Schalter", 1.1],
  ["decke", "Decke", null],
];

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Standard-Stufe eines Mediums: Strom und Netzwerk an der Decke, Wasser am Boden. */
export const defaultLevel = (type) => (type === "strom" || type === "netzwerk" ? "decke" : "boden");

/** Name einer Stufe; unbekannt → „eigene Höhe“. */
export const levelName = (k) => PIPE_LEVELS.find((l) => l[0] === k)?.[1] ?? "eigene Höhe";

/** Lichte Höhe einer Etage (m): Raumhöhe, höchstens bis unter die Decke der nächsten Etage darüber; mindestens 0,5. */
export function clearHeight(building, floor) {
  const elev = Number(floor?.elevation) || 0;
  let h = Number(floor?.height) || 2.5;
  for (const f of building?.floors ?? []) {
    const e = Number(f.elevation) || 0;
    if (f === floor || f.id === floor?.id || !(e > elev + 0.5)) continue;
    h = Math.min(h, e - SLAB - elev);
  }
  return r3(Math.max(0.5, h));
}

/** Dachmodelle über einem Dachgeschoss (Liste: Hausdach, eigene Dächer, Dachteile; roofunits.js) oder null. */
export function floorRoofModels(building, floor) {
  return floor?.attic ? atticModels(building, { floorId: floor.id }).get(floor.id) ?? null : null;
}

const roomAt = (floor, p) => (floor?.rooms ?? []).find((r) => (r.points?.length ?? 0) >= 3 && pointInPolygon(p, r.points)) ?? null;

/**
 * Höhe der Decke (m über dem Boden) entlang a → b: lichte Höhe, im Dachgeschoss zusätzlich unter der
 * Dachschräge (alle 25 cm geprüft, kleinster Wert). Mindestens 0,2.
 */
export function ceilingAlong(building, floor, a, b = a, models = floorRoofModels(building, floor)) {
  let c = clearHeight(building, floor);
  if (models?.length && a && b) {
    const elev = Number(floor?.elevation) || 0;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
    for (let i = 0; i <= n; i++) {
      const p = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
      const y = surfaceFor(models, p, [roomAt(floor, p)?.id])?.y;
      if (Number.isFinite(y)) c = Math.min(c, y - elev - ROOF_GAP);
    }
  }
  return Math.max(0.2, c);
}

/** Höhe einer Stufe (m über dem Boden); Decke = CEILING_GAP unter der Decke, mindestens 5 cm. */
export function levelHeight(level, ceiling = 2.5) {
  if (level === "decke") return r3(Math.max(0.05, ceiling - CEILING_GAP));
  return PIPE_LEVELS.find((l) => l[0] === level)?.[2] ?? 0.03;
}

/** Stufe zu einer Höhe (innerhalb tol), sonst null. */
export function levelOf(h, ceiling, tol = 0.02) {
  if (!Number.isFinite(h)) return null;
  return PIPE_LEVELS.find(([k]) => Math.abs(levelHeight(k, ceiling) - h) <= tol)?.[0] ?? null;
}
