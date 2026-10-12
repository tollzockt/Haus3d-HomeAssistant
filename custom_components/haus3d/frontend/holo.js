// Info-Hologramme (ohne DOM, mit node testbar): Möbel und Geräte mit hinterlegten Werten (furniture.info)
// zeigen diese als schwebende Tafel, solange ihr Raum angetippt ist.

import { placesOf } from "./devices.js";
import { FURNITURE } from "./furniture.js";
import { pointInPolygon } from "./walls.js";

export const MAX_HOLO = 8;
const STATE_DE = { on: "an", off: "aus", open: "offen", closed: "zu", home: "zu Hause", not_home: "weg", idle: "bereit", playing: "spielt", paused: "pausiert", printing: "druckt", heating: "heizt", cooling: "kühlt", charging: "lädt", standby: "Standby" };

const hasInfo = (m) => Array.isArray(m?.info) && m.info.some((r) => typeof r?.entity === "string" && r.entity.includes("."));

/** Gegenstände mit Info-Werten in einem Raum (bzw. einer Gartenfläche), höchstens MAX_HOLO. */
export function holoItems(floor, roomId) {
  const place = floor && placesOf(floor).find((r) => r.id === roomId);
  if (!place?.points?.length) return [];
  return (floor.furniture ?? []).filter((m) => hasInfo(m) && Number.isFinite(m.x) && Number.isFinite(m.z) && pointInPolygon([m.x, m.z], place.points)).slice(0, MAX_HOLO);
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

/** Zeilen einer Tafel: [{entity, name, value}]. */
export function holoRows(m, hass) {
  return (m.info ?? [])
    .filter((r) => typeof r?.entity === "string" && r.entity.includes("."))
    .map((r) => {
      const st = hass?.states?.[r.entity];
      return { entity: r.entity, name: r.name || st?.attributes?.friendly_name || r.entity, value: holoValue(st) };
    });
}
