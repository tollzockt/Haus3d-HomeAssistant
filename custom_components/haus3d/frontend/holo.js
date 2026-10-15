// Info-Hologramme (ohne DOM, mit node testbar): Möbel und Geräte mit hinterlegten Werten (furniture.info)
// zeigen diese als schwebende Tafel, solange ihr Raum angetippt ist. Geräte im Schrank (in_rack) haben keine eigene
// Tafel (sie lägen übereinander im Schrank): ihre Werte stehen in der Tafel des Schranks, unter dem Gerätenamen.

import { placesOf } from "./devices.js";
import { FURNITURE } from "./furniture.js";
import { isCabinet } from "./rack.js";
import { pointInPolygon } from "./walls.js";

export const MAX_HOLO = 8;
const STATE_DE = { on: "an", off: "aus", open: "offen", closed: "zu", home: "zu Hause", not_home: "weg", idle: "bereit", playing: "spielt", paused: "pausiert", printing: "druckt", heating: "heizt", cooling: "kühlt", charging: "lädt", standby: "Standby" };

const hasInfo = (m) => Array.isArray(m?.info) && m.info.some((r) => typeof r?.entity === "string" && r.entity.includes("."));

/** Der Schrank, in dem ein Gerät sitzt (oder null: frei stehend bzw. Schrank fehlt). */
const cabinetOf = (floor, m) => (m?.in_rack != null ? (floor.furniture ?? []).find((c) => c.id === m.in_rack && isCabinet(c)) ?? null : null);

/**
 * Gegenstände mit Tafel in einem Raum (bzw. einer Gartenfläche), höchstens MAX_HOLO: Möbel mit Info-Werten, bei Geräten
 * im Schrank der Schrank (eine Tafel für alle seine Geräte, an der Stelle des Schranks).
 */
export function holoItems(floor, roomId) {
  const place = floor && placesOf(floor).find((r) => r.id === roomId);
  if (!place?.points?.length) return [];
  const owners = new Set();
  for (const m of floor.furniture ?? []) if (hasInfo(m)) owners.add(cabinetOf(floor, m) ?? m);
  return (floor.furniture ?? []).filter((m) => owners.has(m) && Number.isFinite(m.x) && Number.isFinite(m.z) && pointInPolygon([m.x, m.z], place.points)).slice(0, MAX_HOLO);
}

/** Überschrift: eigener Name, sonst die Gattung aus dem Katalog (ohne „(Maße wie …)“). */
export function holoTitle(m) {
  return m.name || String(FURNITURE[m.type]?.[0] ?? "Gerät").replace(/\s*\(Maße wie [^)]*\)\s*$/, "");
}

/** Anzeigewert eines Zustands: Zahl mit Einheit, sonst übersetzter Zustand; „–“ ohne Wert. */
export function holoValue(st) {
  if (!st || st.state === "unavailable" || st.state === "unknown" || st.state === "") return "–";
  const unit = st.attributes?.unit_of_measurement;
  const n = Number(st.state);
  if (Number.isFinite(n)) {
    const v = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
    return `${v.toLocaleString("de-DE")}${unit ? ` ${unit}` : ""}`;
  }
  return STATE_DE[st.state] ?? String(st.state);
}

const ownRows = (m, hass) =>
  (m.info ?? [])
    .filter((r) => typeof r?.entity === "string" && r.entity.includes("."))
    .map((r) => {
      const st = hass?.states?.[r.entity];
      return { entity: r.entity, name: r.name || st?.attributes?.friendly_name || r.entity, value: holoValue(st) };
    });

/**
 * Zeilen einer Tafel: [{entity, name, value}]. Mit floor hat die Tafel eines Schranks danach die Zeilen seiner Geräte
 * (obere zuerst), jede mit group = Name des Geräts (die Tafel zeigt ihn als Zwischenzeile).
 */
export function holoRows(m, hass, floor = null) {
  const rows = ownRows(m, hass);
  if (!floor || !isCabinet(m)) return rows;
  const devices = (floor.furniture ?? []).filter((d) => d.in_rack === m.id && hasInfo(d)).sort((a, b) => (Number(b.rack_u) || 0) - (Number(a.rack_u) || 0));
  for (const d of devices) {
    const group = holoTitle(d);
    for (const r of ownRows(d, hass)) rows.push({ ...r, group });
  }
  return rows;
}
