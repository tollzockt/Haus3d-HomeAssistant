// Fingerabdruck der Zustände (ohne DOM, mit node testbar): HouseScene.applyStates überträgt immer alle Zustände, zeichnet
// aber nur, wenn sich der Fingerabdruck ändert. Er erfasst jeden Schlüssel des Zustands (Mengen und Maps sortiert), die
// Raumwerte als Ergebnisfarbe (tempColor, nur in der Werte-Ansicht), die Einspeisung nur als „aktiv“ (das Tempo des
// Energieflusses übernimmt die Hintergrund-Schleife), für Möbel mit eigener Entität die Identität ihres Zustandsobjekts
// (Home Assistant ersetzt es bei jeder Änderung) und dazu Stil, Dunkel und Glühen der Szene. Was die Materialien außerhalb
// von applyStates ändert (Auswahl der Räume), setzt den gemerkten Fingerabdruck zurück.

const ids = new WeakMap();
let nextId = 0;

/** Identität eines Objekts als Text (gleich, solange es dasselbe Objekt ist); null bzw. fehlend: „-“. */
function identity(o) {
  if (o === null || o === undefined) return "-";
  if (typeof o !== "object" && typeof o !== "function") return `=${encodeValue(o)}`;
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++nextId));
  return `#${id}`;
}

/**
 * Wert als Text: Mengen und Maps sortiert, Felder in Reihenfolge, Objekte nach Schlüsseln, Zahlen genau, Funktionen ohne
 * Inhalt. Tiefer als depth: nur die Identität (schützt vor Ringen).
 */
export function encodeValue(v, depth = 6) {
  if (v === null || v === undefined) return "-";
  const t = typeof v;
  if (t === "number" || t === "bigint") return String(v);
  if (t === "boolean") return v ? "1" : "0";
  if (t === "string") return JSON.stringify(v);
  if (t !== "object") return t[0];
  if (depth <= 0) return identity(v);
  const d = depth - 1;
  if (v instanceof Set) return `[${[...v].map((x) => encodeValue(x, d)).sort().join(",")}]`;
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${encodeValue(k, d)}:${encodeValue(x, d)}`).sort().join(",")}}`;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return `(${Array.from(v, (x) => encodeValue(x, d)).join(",")})`;
  return `<${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${encodeValue(v[k], d)}`).join(",")}>`;
}

/** Raumwerte als Farbe je Raum (wie applyStates: fehlender Wert grau, sonst tempColor(v)). */
function tempColors(temps, color) {
  if (!(temps instanceof Map)) return encodeValue(temps);
  return [...temps].map(([k, v]) => `${encodeValue(k)}:${v == null ? "-" : encodeValue(typeof color === "function" ? color(v) : v)}`).sort().join(",");
}

/**
 * Fingerabdruck eines Zustands für applyStates(s). entities: Entitäten der Möbel, die ihrem Zustandsobjekt folgen
 * (stateParts); style, dark, glow: Darstellung der Szene (Stil, dunkles Thema, quality.glow).
 * @returns {string}
 */
export function stateSignature(s, { entities = [], style = "standard", dark = false, glow = true } = {}) {
  const parts = [`style:${encodeValue(style)}`, `dark:${dark ? 1 : 0}`, `glow:${glow === false ? 0 : 1}`];
  for (const k of Object.keys(s ?? {}).sort()) {
    const v = s[k];
    if (k === "tempColor") continue; // steckt in den Farben von temps
    if (k === "temps") parts.push(`temps:${s.tempMode ? tempColors(v, s.tempColor) : "-"}`);
    else if (k === "feedIn") parts.push(`feedIn:${(v ?? 0) > 1 ? 1 : 0}`);
    else if (k === "states") parts.push(`states:${[...new Set(entities)].sort().map((e) => `${JSON.stringify(e)}${identity(v?.[e])}`).join(",")}`);
    else parts.push(`${k}:${encodeValue(v)}`);
  }
  return parts.join("|");
}
