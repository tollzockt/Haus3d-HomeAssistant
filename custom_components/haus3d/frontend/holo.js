// Info-Hologramme (ohne DOM, mit node testbar): Möbel und Geräte mit hinterlegten Werten (furniture.info)
// zeigen diese als schwebende Tafel, solange ihr Raum angetippt ist. Geräte im Schrank (in_rack) haben keine eigene
// Tafel (sie lägen übereinander im Schrank): ihre Entität und ihre Werte stehen in der Tafel des Schranks (holoRowsFor):
// eigene Werte des Schranks, „Leistung gesamt“, dann je Gerät eine Zeile mit Status-Punkt und die Werte des Geräts eingerückt darunter.

import { placesOf } from "./devices.js";
import { FURNITURE } from "./furniture.js";
import { fmtPower } from "./panel-util.js";
import { cabinetInfo, isCabinet } from "./rack.js";
import { deviceEntities, rackEntities, rackLedKind, rackPower } from "./rack-live.js";
import { pointInPolygon } from "./walls.js";

export const MAX_HOLO = 8;
/** Zeilen einer Schrank-Tafel, danach steht „+ n weitere“. */
export const MAX_RACK_ROWS = 12;
const STATE_DE = { on: "an", off: "aus", open: "offen", closed: "zu", home: "zu Hause", not_home: "weg", idle: "bereit", playing: "spielt", paused: "pausiert", printing: "druckt", heating: "heizt", cooling: "kühlt", charging: "lädt", standby: "Standby" };

const hasInfo = (m) => Array.isArray(m?.info) && m.info.some((r) => typeof r?.entity === "string" && r.entity.includes("."));

/** Der Schrank, in dem ein Gerät sitzt (oder null: frei stehend bzw. Schrank fehlt). */
const cabinetOf = (floor, m) => (m?.in_rack != null ? (floor.furniture ?? []).find((c) => c.id === m.in_rack && isCabinet(c)) ?? null : null);

/**
 * Gegenstände mit Tafel in einem Raum (bzw. einer Gartenfläche), höchstens MAX_HOLO: Möbel mit Info-Werten, bei Geräten
 * im Schrank der Schrank (eine Tafel für alle seine Geräte, an der Stelle des Schranks). Ein Schrank hat eine Tafel, wenn er
 * selbst Info-Werte hat oder eines seiner eingebauten Geräte eine verknüpfte Entität oder Info-Werte.
 */
export function holoItems(floor, roomId) {
  const place = floor && placesOf(floor).find((r) => r.id === roomId);
  if (!place?.points?.length) return [];
  const owners = new Set();
  for (const m of floor.furniture ?? []) {
    if (isCabinet(m)) {
      if (hasInfo(m) || rackEntities(floor, m).length) owners.add(m);
    } else if (!cabinetOf(floor, m) && hasInfo(m)) owners.add(m);
  }
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

/** Zeilen einer Tafel: [{entity, name, value}] aus den eigenen Info-Werten des Gegenstands (ohne Geräte im Schrank). */
export const holoRows = (m, hass) =>
  (m.info ?? [])
    .filter((r) => typeof r?.entity === "string" && r.entity.includes("."))
    .map((r) => {
      const st = hass?.states?.[r.entity];
      return { entity: r.entity, name: r.name || st?.attributes?.friendly_name || r.entity, value: holoValue(st) };
    });

/**
 * Zeilen der Tafel eines Gegenstands: [{entity|null, name, value, led?, sub?, power?, more?}]. Für Schränke:
 * 1. eigene Info-Werte des Schranks,
 * 2. „Leistung gesamt“ (Summe der Leistungswerte seiner Geräte, W bzw. kW; nur mit mindestens einem gültigen Wert; ohne Entität),
 * 3. je eingebautem Gerät mit Entität oder Info-Werten (von oben nach unten) eine Zeile mit Namen und Wert seiner Entität (led = Farbe
 *    der Status-Leuchte: "green", "off", "red"; ohne Entität "green" wie das Modell) und darunter seine Info-Werte (sub = eingerückt).
 * Höchstens MAX_RACK_ROWS Zeilen, dann eine Zeile „+ n weitere“ (more). Alle anderen Gegenstände: ihre Info-Werte.
 */
export function holoRowsFor(floor, m, hass) {
  const rows = holoRows(m, hass);
  if (!floor || !isCabinet(m)) return rows;
  const { w } = rackPower(floor, m, hass);
  if (w !== null) rows.push({ entity: null, name: "Leistung gesamt", value: fmtPower(w), power: true });
  for (const { item } of cabinetInfo(floor, m).devices) {
    if (!deviceEntities(item).length) continue;
    const id = typeof item.entity === "string" && item.entity.includes(".") && item.entity !== "none" ? item.entity : null;
    const st = id ? hass?.states?.[id] : null;
    rows.push({ entity: id, name: holoTitle(item), value: id ? holoValue(st) : "", led: id ? rackLedKind(st) : "green" });
    for (const r of holoRows(item, hass)) rows.push({ ...r, sub: true });
  }
  if (rows.length <= MAX_RACK_ROWS) return rows;
  const rest = rows.length - MAX_RACK_ROWS;
  return [...rows.slice(0, MAX_RACK_ROWS), { entity: null, name: `+ ${rest} weitere`, value: "", more: true }];
}

/** Alle Entitäten, deren Werte die Tafel eines Gegenstands zeigt (Info-Werte; beim Schrank auch die seiner Geräte) – ohne Anzeigelimit. */
export function holoEntities(floor, m) {
  const out = holoRows(m, null).map((r) => r.entity);
  if (floor && isCabinet(m)) for (const e of rackEntities(floor, m)) if (!out.includes(e)) out.push(e);
  return out;
}
