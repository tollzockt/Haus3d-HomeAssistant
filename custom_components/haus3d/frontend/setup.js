// Grundeinstellungen (ohne DOM, mit node testbar): Name, Norden, Etagen und Höhen, Wände und Dach.
// Der Editor fragt sie beim ersten Öffnen ab; vorhandene Etagen bleiben immer erhalten.

import { allIds, newId } from "./edit-ops.js";
import { DEFAULT_KNEE, ROOF_TYPES } from "./exterior.js";

export const SLAB = 0.25; // Decke zwischen zwei Geschossen (m)
export const MAX_FULL = 5;
const FULL_NAMES = ["Erdgeschoss", "1. Obergeschoss", "2. Obergeschoss", "3. Obergeschoss", "4. Obergeschoss"];
const FULL_IDS = ["eg", "og1", "og2", "og3", "og4"];

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);
const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, num(v, d)));

/** Leere Etage mit allen Listen. */
export function newFloor(id, name, elevation = 0, height = 2.5, extra = {}) {
  return { id, name, elevation, height, cut_height: 1.15, rooms: [], openings: [], furniture: [], placements: [], background: null, outdoor: [], walls: [], pipes: [], nodes: [], ha_floor: null, ...extra };
}

const isFull = (f) => !f.attic && f.elevation >= 0 && f.height >= 1;
const isCellar = (f) => !f.attic && f.elevation < 0 && f.height >= 1;
const drawn = (f) => (f.rooms?.length ?? 0) + (f.walls?.length ?? 0) + (f.outdoor?.length ?? 0) + (f.furniture?.length ?? 0) > 0;

/** Soll der Editor die Grundeinstellungen von selbst zeigen? (leeres Haus bzw. noch nie eingerichtet und nichts gezeichnet) */
export function needsSetup(building) {
  const floors = building?.floors ?? [];
  if (!floors.length) return true;
  return !building.settings?.setup_done && !floors.some(drawn);
}

/** Aktueller Stand als Formularwerte. */
export function setupState(building) {
  const s = building?.settings ?? {};
  const floors = building?.floors ?? [];
  const fulls = floors.filter(isFull).sort((a, b) => a.elevation - b.elevation);
  const attic = floors.find((f) => f.attic);
  const roofType = ROOF_TYPES.some(([k]) => k === s.roof?.type) ? s.roof.type : "none";
  return {
    title: typeof s.title === "string" ? s.title : "",
    north: ((Math.round(num(s.north, 0)) % 360) + 360) % 360,
    cellar: floors.some(isCellar),
    full: Math.min(MAX_FULL, Math.max(1, fulls.length)),
    attic: !!attic,
    knee: num(attic?.knee, DEFAULT_KNEE),
    storey: fulls[0] ? r2(fulls[0].height + SLAB) : 2.75,
    restack: false,
    wallExt: num(s.wall_exterior, 0.24),
    wallInt: num(s.wall_interior, 0.12),
    roofType,
    pitch: num(s.roof?.pitch, 35),
  };
}

/**
 * Übernimmt die Grundeinstellungen: legt fehlende Etagen an (nie löschen), setzt Name, Norden, Wände, Dach.
 * @returns {{building: object, added: string[], notes: string[]}}
 */
export function applySetup(building, st) {
  const b = structuredClone(building);
  b.floors = b.floors ?? [];
  b.settings = { ...(b.settings ?? {}) };
  const taken = allIds(b);
  const pick = (want, prefix) => {
    const id = taken.has(want) ? newId(prefix, taken) : want;
    taken.add(id);
    return id;
  };
  const added = [];
  const notes = [];
  const storey = clamp(st.storey, 2.2, 6, 2.75);
  const height = r2(storey - SLAB);
  const knee = clamp(st.knee, 0, 3, DEFAULT_KNEE);
  const fulls = b.floors.filter(isFull).sort((a, b2) => a.elevation - b2.elevation);
  const cellars = b.floors.filter(isCellar).sort((a, b2) => b2.elevation - a.elevation);
  let attic = b.floors.find((f) => f.attic);

  if (st.restack) {
    // Höhe auch für vorhandene Geschosse: von unten nach oben neu stapeln
    fulls.forEach((f, i) => Object.assign(f, { elevation: r2(i * storey), height }));
    cellars.forEach((f, i) => Object.assign(f, { elevation: r2(-(i + 1) * storey), height }));
  }
  if (st.cellar && !cellars.length) {
    const f = newFloor(pick("kg", "floor"), "Keller", r2(-storey), height);
    b.floors.push(f);
    added.push(f.id);
  } else if (!st.cellar && cellars.length) notes.push("Der vorhandene Keller bleibt – löschen geht in den Etagen-Eigenschaften.");

  const want = Math.round(clamp(st.full, 1, MAX_FULL, 1));
  for (let i = fulls.length; i < want; i++) {
    const top = fulls[fulls.length - 1];
    const f = newFloor(pick(FULL_IDS[i], "floor"), FULL_NAMES[i], top ? r2(top.elevation + top.height + SLAB) : 0, height);
    b.floors.push(f);
    fulls.push(f);
    added.push(f.id);
  }
  if (fulls.length > want) notes.push(`Es bleiben ${fulls.length} Vollgeschosse – überzählige löschen geht in den Etagen-Eigenschaften.`);

  const topFull = fulls[fulls.length - 1];
  const atticElev = topFull ? r2(topFull.elevation + topFull.height + SLAB) : 0;
  if (st.attic) {
    if (!attic) {
      attic = newFloor(pick("dg", "floor"), "Dachgeschoss", atticElev, 2.4, { attic: true, knee });
      b.floors.push(attic);
      added.push(attic.id);
    } else attic.knee = knee;
  } else if (attic) notes.push("Das vorhandene Dachgeschoss bleibt – löschen geht in den Etagen-Eigenschaften.");
  // vorhandenes Dachgeschoss über die (neuen bzw. neu gestapelten) Vollgeschosse setzen
  if (attic && !added.includes(attic.id) && (st.restack || attic.elevation < atticElev - 1e-6)) attic.elevation = atticElev;

  const title = String(st.title ?? "").trim().slice(0, 60);
  b.settings.title = title && title !== "Haus 3D" ? title : null;
  b.settings.north = ((Math.round(num(st.north, 0)) % 360) + 360) % 360;
  b.settings.wall_exterior = Math.round(clamp(st.wallExt, 0.05, 1, 0.24) * 1000) / 1000;
  b.settings.wall_interior = Math.round(clamp(st.wallInt, 0.05, 0.6, 0.12) * 1000) / 1000;
  const roofType = ROOF_TYPES.some(([k]) => k === st.roofType) ? st.roofType : "none";
  b.settings.roof = { ...(b.settings.roof ?? {}), type: roofType, ...(roofType === "none" || roofType === "flat" ? {} : { pitch: Math.round(clamp(st.pitch, 5, 60, 35)) }) };
  b.settings.setup_done = true;
  return { building: b, added, notes };
}

/** Vorschau der Etagen (oben nach unten) für das Formular: [{name, elevation, height, isNew}]. */
export function setupPreview(building, st) {
  const { building: nb, added, notes } = applySetup(building, st);
  const rows = [...nb.floors].sort((a, b) => b.elevation - a.elevation).map((f) => ({ id: f.id, name: f.name, elevation: f.elevation, height: f.height, attic: !!f.attic, isNew: added.includes(f.id) }));
  return { rows, notes };
}
