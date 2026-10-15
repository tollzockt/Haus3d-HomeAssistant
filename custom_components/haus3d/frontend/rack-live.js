// Live-Werte eingebauter Geräte (ohne Three.js und DOM, mit node testbar): Farbe der Status-LED nach dem Zustand der
// verknüpften Entität und die Leistungssumme eines Schranks. Genutzt vom Editor (Kopf der HE-Leiste), vom Gerätemodell
// (LEDs) und von der Info-Tafel des Schranks im Panel.

import { powerW } from "./devices.js";
import { cabinetInfo } from "./rack.js";

/** Zustände, die einen Fehler melden. */
const FAULT = new Set(["error", "fault", "problem", "failed"]);
/** Zustände, die „aus“ bedeuten (grau). */
const OFF = new Set(["off", "standby", "unknown", "not_home", "closed", ""]);
/** Einheiten, in denen eine Entität zur Leistungssumme zählt. */
const POWER_UNITS = new Set(["W", "kW", "mW", "MW"]);

const validEntity = (e) => typeof e === "string" && e.includes(".") && e !== "none";

/**
 * Farbe der Status-LED eines eingebauten Geräts zum Zustandsobjekt: "green" (an), "off" (aus oder unbekannt) oder "red" (Fehler).
 * Die Namen entsprechen ledMats() in tech-parts.js.
 */
export function rackLedKind(st) {
  if (!st || typeof st !== "object") return "off";
  const raw = String(st.state ?? "");
  const state = raw.toLowerCase();
  if (state === "unavailable") return "red";
  const domain = String(st.entity_id ?? "").split(".")[0];
  const cls = st.attributes?.device_class;
  if ((domain === "binary_sensor" || !domain) && (cls === "problem" || cls === "connectivity") && (state === "on" || state === "off")) {
    const on = state === "on";
    return cls === "problem" ? (on ? "red" : "green") : on ? "green" : "red";
  }
  if (FAULT.has(state)) return "red";
  if (OFF.has(state)) return "off";
  const n = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(n)) return n === 0 ? "off" : "green";
  return "green";
}

/** Entitäten eines Geräts: verknüpfte Entität, dann die der Info-Werte (jede einmal). */
export function deviceEntities(d) {
  const out = [];
  if (validEntity(d?.entity)) out.push(d.entity);
  for (const r of Array.isArray(d?.info) ? d.info : []) if (validEntity(r?.entity) && !out.includes(r.entity)) out.push(r.entity);
  return out;
}

/** Alle Entitäten der eingebauten Geräte eines Schranks (von oben nach unten, jede einmal) – wofür das Panel Änderungen beobachtet. */
export function rackEntities(floor, cab) {
  const out = [];
  for (const { item } of cabinetInfo(floor, cab).devices) for (const e of deviceEntities(item)) if (!out.includes(e)) out.push(e);
  return out;
}

/**
 * Leistung der eingebauten Geräte eines Schranks: {w, ids}. Es zählen die verknüpfte Entität und die Info-Entitäten jedes
 * eingebauten Geräts, sofern ihre Einheit W, kW, mW oder MW ist; jede Entität nur einmal, ungültige Werte (nicht verfügbar,
 * keine Zahl) werden übersprungen. w = Summe in Watt, null ohne gültigen Wert; ids = die Entitäten, die in der Summe stehen.
 * Eigene Werte des Schranks zählen nicht (sie sind oft schon die Summe).
 */
export function rackPower(floor, cab, hass) {
  const ids = [];
  let w = null;
  for (const id of rackEntities(floor, cab)) {
    const st = hass?.states?.[id];
    if (!POWER_UNITS.has(st?.attributes?.unit_of_measurement)) continue;
    const v = powerW(st);
    if (v === null) continue;
    ids.push(id);
    w = (w ?? 0) + v;
  }
  return { w, ids };
}
