// Inhalt der Hilfe „?“ (ohne DOM, mit node testbar): Abschnitte, Einträge, Suche und Hervorhebung. Wird erst beim ersten
// Öffnen der Hilfe per import() geladen. Werkzeuge und Dach-Ebene beziehen Titel, Symbol und Text aus den Listen des
// Editors (TOOLS/HINTS, ROOF_TOOLS/ROOF_HINTS, PLAN_HINTS) – eine Quelle; hier stehen nur Suchwörter, Tasten und Links.
// Die Hilfe ist eingebaut und lädt nichts aus dem Netz; nur ein Klick auf einen Link mit „↗“ („Ausführliche Anleitung“,
// „Mehr“) öffnet die README.

import { HINTS, TOOLS } from "./editor-tools.js";
import { ROOF_HINTS, ROOF_TOOLS } from "./editor-roof.js";
import { PLAN_HINTS } from "./editor-plan.js";
import { PIPE_TYPES } from "./pipes.js";
import { VIEW_MODES, viewColor } from "./devices.js";
import { esc } from "./panel-util.js";

export const README_URL = "https://github.com/tollzockt/Haus3d-HomeAssistant";
/** Anker der README, wenn kein passenderer bekannt ist (Panel bzw. Editor ohne bestimmtes Werkzeug). */
export const DEFAULT_ANCHOR = "bedienung";
export const EDITOR_ANCHOR = "editor";

/** Link auf einen README-Abschnitt (Anker = GitHub-Schreibweise der Überschrift). */
export const readmeHref = (anchor) => (anchor ? `${README_URL}#${encodeURIComponent(anchor)}` : README_URL);

// ------------------------------------------------------------------ Suche: Schreibweise vereinheitlichen

const UML = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
const PLAIN = { ä: "a", ö: "o", ü: "u", ß: "ss" };

/** Ein Zeichen vereinheitlichen: klein, Umlaute ausgeschrieben (bzw. einfach), Akzente weg, Rest außer a-z 0-9 + zu Leerzeichen. */
function foldChar(c, map) {
  const low = c.toLowerCase();
  const base = map[low] ?? low.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return base.replace(/[^a-z0-9+]/g, " ");
}

function foldWith(text, map) {
  let out = "";
  for (const c of String(text ?? "")) out += foldChar(c, map);
  return out.replace(/\s+/g, " ").trim();
}

/** „Größe“ → „groesse“, „Strg+Z“ → „strg+z“: Vergleichsform für die Suche. */
export const fold = (text) => foldWith(text, UML);
/** Wie fold, aber ä → a (für Eingaben ohne Umlaute: „zurucksetzen“). */
export const foldPlain = (text) => foldWith(text, PLAIN);

/** Wörter einer Suche (vereinheitlicht, ohne Leerwörter). */
export const searchWords = (q) => fold(q).split(" ").filter(Boolean);

// ------------------------------------------------------------------ Inhalt

// Farbfelder zu einer Bodenfarbe: dieselben Stützwerte wie die Legende im Panel
const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");
function modeSwatches(mode) {
  const def = VIEW_MODES[mode];
  const [lo, hi] = def.range;
  const vals = mode === "power" ? [10, 50, 200, 800, 2000] : Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const out = vals.map((v) => [rgb(viewColor(mode, mode === "humidity" ? Math.min(v, (def.warn ?? 100) - 0.1) : v)), `${num(v)} ${def.unit}`]);
  if (def.warn) out.push([rgb(viewColor(mode, def.warn)), `ab ${def.warn} ${def.unit}`]);
  return out;
}
const COLOR_TEXT = {
  temp: "Funktionsrad → Bodenfarbe: kalt blau, warm rot (18 bis 26 °C). Die Legende unten zeigt den Verlauf.",
  humidity: "Trocken orange, gut grün, feucht blau; ab 65 % violett: Schimmelgefahr.",
  co2: "Grün bis etwa 800 ppm, um 1000 ppm gelb, ab 1400 ppm rot.",
  power: "Leistung der Geräte im Raum, logarithmisch: 10 W grün bis 2 kW rot.",
  energy: "Energie heute, logarithmisch: 0,05 kWh grün bis 10 kWh rot.",
};
const COLOR_TAGS = {
  temp: ["wärme", "kalt", "warm", "heizung"],
  humidity: ["luftfeuchte", "schimmel", "lüften"],
  co2: ["co2", "luft", "kohlendioxid", "lüften"],
  power: ["watt", "strom", "verbrauch"],
  energy: ["kwh", "strom", "verbrauch", "heute"],
};

const colorItems = () => [
  ...Object.entries(VIEW_MODES).map(([mode, def]) => ({
    id: `c:${mode}`,
    title: `Boden: ${def.label}`,
    icon: def.icon,
    text: COLOR_TEXT[mode],
    tags: ["bodenfarbe", "farbe", "legende", "verlauf", ...(COLOR_TAGS[mode] ?? [])],
    swatches: modeSwatches(mode),
  })),
  { id: "c:security", title: "Sicherheit", icon: "mdi:shield-check-outline", text: "Funktionsrad → Sicherheit färbt Fenster und Türen: zu grün, gekippt orange, offen rot.", tags: ["fenster", "tür", "offen", "gekippt", "zu"], swatches: [["#43a047", "zu"], ["#ff8f00", "gekippt"], ["#e53935", "offen"]] },
  { id: "c:alerts", title: "Hinweise im Raum", icon: "mdi:bell-alert-outline", text: "Ein roter Raum meldet Kritisches (Rauch, Wasser, Gas), ein oranger eine Warnung.", tags: ["alarm", "warnung", "rauch", "wasser", "gas", "melder"], swatches: [["#e53935", "kritisch"], ["#ff8f00", "Warnung"]] },
  { id: "c:chips", title: "Statusleiste", icon: "mdi:check-circle-outline", text: "Die Chips oben: grün in Ordnung, orange Hinweis, rot Alarm.", tags: ["chip", "status", "alles zu", "glocke"], swatches: [["#4caf50", "in Ordnung"], ["#f57c00", "Hinweis"], ["#d32f2f", "Alarm"]] },
  { id: "c:modes", title: "Leisten oben", icon: "mdi:pencil-ruler", text: "Grün: Bearbeiten, orange: Admin, lila: Testhaus, türkis: Demo-Haus. „Beenden“ gibt den Modus wieder frei.", tags: ["modus", "bearbeiten", "admin", "testhaus", "demo", "leiste"], swatches: [["#2e7d32", "Bearbeiten"], ["#e65100", "Admin"], ["#7e57c2", "Testhaus"], ["#00897b", "Demo-Haus"]] },
  { id: "c:pipes", title: "Leitungen", icon: "mdi:pipe", text: "Jede Art hat ihre Farbe, im Plan wie in 3D.", tags: ["leitung", "kabel", "rohr", "strom", "wasser", "netzwerk"], swatches: PIPE_TYPES.map(([, name, color]) => [color, name]) },
  { id: "c:arrows", title: "Pfeile in der Editor-3D-Ansicht", icon: "mdi:axis-arrow", text: "Rot (X) und blau (Z) verschieben waagrecht, grün ändert die Höhe über dem Boden.", tags: ["pfeil", "verschieben", "höhe", "achse", "3d"], swatches: [["#e53935", "X"], ["#1e88e5", "Z"], ["#43a047", "Höhe"]] },
  { id: "c:plan", title: "Plan im Editor", icon: "mdi:vector-square", text: "Blau: gewählt. Orange Punkte sind Griffe zum Ziehen. Gestrichelt: die Etage darunter.", tags: ["auswahl", "griff", "punkt", "etage darunter", "gestrichelt"], swatches: [["#03a9f4", "gewählt"], ["#ff9800", "Griff"]] },
];

const gesture = (id, title, text, mouse, touch, group = "Ansicht", icon = undefined) => ({ id: `g:${id}`, title, text, mouse, touch, group, icon });

/** Statische Abschnitte; Werkzeuge und Dach-Ebene kommen aus helpSections(). link = README-Anker. */
export const HELP = [
  {
    id: "start",
    title: "Erste Schritte",
    icon: "mdi:rocket-launch-outline",
    link: "erste-schritte",
    items: [
      { id: "start:pin", title: "PINs ändern", icon: "mdi:lock-outline", text: "Zahnrad → „Admin-Einstellungen“ (ab Werk 0000) → „PIN & Zugang“: neue PINs für Bearbeiten, Admin und Türen festlegen.", tags: ["pin", "code", "passwort", "zugang", "sicherheit"] },
      { id: "start:plan", title: "Grundriss anlegen", icon: "mdi:floor-plan", text: "Zahnrad → „Bearbeiten“ → „Grundriss“. Beim ersten Mal führen die Grundeinstellungen durch Etagen, Wände und Dach.", tags: ["editor", "zeichnen", "anfangen", "bearbeiten", "neu"] },
      { id: "start:area", title: "Geräte in den Raum", icon: "mdi:devices", text: "Im Editor einen Raum wählen und „Bereich in Home Assistant“ einstellen: Die Geräte des Bereichs erscheinen von selbst.", tags: ["bereich", "area", "zuordnen", "gerät", "entität"] },
      { id: "start:energy", title: "Energie einrichten", icon: "mdi:lightning-bolt-outline", text: "Zahnrad → „Admin-Einstellungen“ → „Energie“ → „Aus HA-Energie übernehmen“.", tags: ["solar", "pv", "strom", "akku", "netz"] },
    ],
  },
  {
    id: "gesten",
    title: "Gesten",
    icon: "mdi:gesture-tap",
    link: "ansicht",
    table: true,
    items: [
      gesture("rotate", "Drehen", "Die Kamera dreht um das Haus.", "linke Taste ziehen", "ein Finger ziehen"),
      gesture("pan", "Verschieben", "Das Haus wandert über den Bildschirm.", "rechte Taste ziehen", "zwei Finger ziehen"),
      gesture("zoom", "Zoomen", "Näher heran oder weiter weg.", "Mausrad", "zwei Finger spreizen"),
      gesture("room", "Raum ansehen", "Die Kamera fährt zum Raum.", "Klick", "antippen"),
      gesture("roompanel", "Raumfenster", "Licht, Klima und alle Geräte des Raums.", "Raum gedrückt halten", "Raum gedrückt halten"),
      gesture("device", "Gerät schalten", "Schaltet Licht, Schalter und Lüfter, fährt Rollläden.", "Klick aufs Symbol", "Symbol antippen"),
      gesture("info", "Weitere Infos", "Das Fenster von Home Assistant mit Verlauf und Einstellungen.", "Rechtsklick oder gedrückt halten", "gedrückt halten"),
      gesture("fit", "Etage einpassen", "Die Ansicht passt auf die gewählte Etage (auch der Knopf oben in der Kopfzeile).", "Doppelklick auf die Etage", "Doppeltipp auf die Etage"),
      gesture("wheel", "Räder drehen", "Kurzwahl (unten links) und Funktionsrad (unten rechts): aufklappen, dann drehen.", "Mausrad", "wischen"),
      gesture("walk", "Begehen", "Durchs Haus gehen, aus Augenhöhe (Funktionsrad → Begehen).", "W A S D, Q und E", "zwei Joysticks"),
      gesture("edpan", "Plan verschieben", "Im Editor die Ansicht des Plans bewegen.", "leere Fläche oder rechte Taste ziehen", "leere Fläche ziehen", "Editor"),
      gesture("edzoom", "Plan zoomen", "Im Editor näher heran oder weiter weg.", "Mausrad", "zwei Finger", "Editor"),
      gesture("edmenu", "Kurzmenü", "Duplizieren, Drehen, An die Wand stellen, Löschen.", undefined, "gedrückt halten", "Editor"),
      gesture("ed3d", "3D im Editor", "Teile anklicken und an den Pfeilen ziehen; leere Fläche ziehen dreht die Ansicht.", "Strg halten = nur Ansicht", "Schalter „Nur Ansicht“", "Editor"),
    ],
  },
  {
    id: "tasten",
    title: "Tastenkürzel",
    icon: "mdi:keyboard-outline",
    link: "hilfen",
    items: [
      { id: "k:panel", title: "Hilfe und Fenster", icon: "mdi:help-circle-outline", text: "Gilt im Panel und im Editor, nicht in Eingabefeldern.", keys: [["?", "Hilfe öffnen"], ["F1", "Hilfe öffnen"], ["Esc", "schließt Fenster"]], tags: ["hilfe", "fragezeichen"] },
      { id: "k:walk", title: "Begehen", icon: "mdi:walk", text: "Beim Begehen steuerst du mit der Tastatur.", keys: [["W / S", "vor und zurück (auch Pfeil hoch und runter)"], ["A / D", "seitwärts"], ["Q / E", "drehen (auch Pfeil links und rechts)"], ["Esc", "beenden"]], tags: ["gehen", "laufen", "wasd", "pfeiltasten"] },
      {
        id: "k:edit",
        title: "Editor",
        icon: "mdi:pencil-ruler",
        text: "Doppelklick schließt eine Form oder Wand ab. Am Mac gilt ⌘ statt Strg.",
        keys: [
          ["Esc", "abbrechen oder abwählen"],
          ["Entf", "löschen"],
          ["Strg+Z", "Rückgängig"],
          ["Strg+Y", "Wiederholen (auch Strg+Umschalt+Z)"],
          ["Pfeile", "Auswahl schieben (Umschalt = 1 cm)"],
          ["R", "um 90° drehen (Umschalt+R: 15° zurück)"],
          ["Strg+C", "kopieren"],
          ["Strg+V", "einfügen"],
          ["Strg+D", "duplizieren"],
          ["Strg+A", "alles wählen"],
          ["Umschalt", "beim Zeichnen ohne Einrasten"],
          ["Alt", "beim Ziehen: Ecken koppeln umkehren bzw. ohne Magnet"],
          ["0–9", "beim Zeichnen die Länge eintippen"],
        ],
        tags: ["tastatur", "rückgängig", "wiederholen", "löschen", "kopieren", "einfügen", "mac", "undo", "redo", "doppelklick", "entfernen"],
      },
      { id: "k:ed3d", title: "3D im Editor", icon: "mdi:rotate-3d", text: "Strg halten (Mac: ⌘) heißt „nur Ansicht“: nichts wird gewählt oder verschoben.", keys: [["Strg", "halten: nur Ansicht"], ["Esc", "bricht einen Pfeil-Zug ab"]], tags: ["pfeil", "kamera", "ansicht", "mac"] },
    ],
  },
  {
    id: "werkzeuge",
    title: "Editor-Werkzeuge",
    icon: "mdi:toolbox-outline",
    link: "ansichten-und-werkzeuge",
    items: [], // aus TOOLS (helpSections)
  },
  {
    id: "dach",
    title: "Dach-Ebene",
    icon: "mdi:home-roof",
    link: "dach-und-dachgeschoss",
    items: [], // aus ROOF_TOOLS (helpSections)
  },
  {
    id: "farben",
    title: "Farben",
    icon: "mdi:palette-outline",
    link: "zeitstrahl-bodenfarbe-schatten-und-begehen",
    items: colorItems(),
  },
  {
    id: "daten",
    title: "Daten",
    icon: "mdi:database-outline",
    link: "daten-import-export-und-verlauf",
    items: [
      { id: "d:export", title: "Export und Import", icon: "mdi:file-export-outline", text: "Zahnrad → „Admin-Einstellungen“ → „Daten & Verlauf“: „Exportieren (JSON)“ lädt den Grundriss als Datei, „Importieren (JSON) …“ liest sie wieder ein.", tags: ["sichern", "datei", "json", "backup", "importieren", "exportieren"] },
      { id: "d:history", title: "Verlauf", icon: "mdi:history", text: "Die letzten 20 Stände, gesichert vor jedem Speichern und vor jedem Wiederherstellen. „Verlauf …“ stellt einen davon her.", tags: ["wiederherstellen", "sicherung", "alter stand", "zurück"] },
      { id: "d:print", title: "Plan drucken", icon: "mdi:printer-outline", text: "Admin → „Daten & Verlauf“ oder im Editor „Drucken“ (am Tablet unter „⋯“): Etagen mit Maßen, Maßstab und Nordpfeil; PDF über das Druckfenster.", tags: ["drucken", "pdf", "papier", "maßstab", "png", "exportieren"] },
      { id: "d:reset", title: "Alles zurücksetzen", icon: "mdi:restore-alert", text: "Admin → „Daten & Verlauf“ → „Alles zurücksetzen …“. Vorher wird gesichert: als Download und im Verlauf („vor Zurücksetzen“).", tags: ["löschen", "leeren", "neu anfangen", "von vorn", "zurücksetzen"] },
      { id: "d:privacy", title: "Datenschutz", icon: "mdi:shield-lock-outline", text: "Die Hilfe ist eingebaut und lädt nichts aus dem Netz. Nur die Links mit „↗“ öffnen die Anleitung im Netz.", tags: ["internet", "netz", "offline", "privat"] },
    ],
  },
];

/** Zusätze zu den Werkzeugen des Hausplans: Suchwörter, Tasten, README-Anker (Titel, Symbol und Text kommen aus TOOLS/HINTS). */
export const TOOL_EXTRA = {
  select: { tags: ["auswählen", "markieren", "verschieben", "ziehen", "anfassen", "pfeiltasten"], keys: [["Pfeile", "schieben"], ["R", "drehen"], ["Entf", "löschen"]], link: "räume-wände-fenster-und-türen" },
  rect: { tags: ["rechteck", "raum", "zimmer", "zeichnen"], link: "räume-wände-fenster-und-türen" },
  poly: { tags: ["frei", "polygon", "raum", "zimmer", "ecken", "zeichnen"], keys: [["Esc", "abbrechen"]], link: "räume-wände-fenster-und-türen" },
  wall: { tags: ["wände", "mauer", "innenwand", "außenwand", "zeichnen"], keys: [["Umschalt", "frei, ohne Einrasten"], ["Esc", "beendet"]], link: "räume-wände-fenster-und-türen" },
  window: { tags: ["fenster", "öffnung", "einsetzen"], link: "räume-wände-fenster-und-türen" },
  door: { tags: ["tür", "eingang", "öffnung", "einsetzen"], link: "räume-wände-fenster-und-türen" },
  garage: { tags: ["garagentor", "tor", "öffnung", "einsetzen"], link: "räume-wände-fenster-und-türen" },
  furniture: { tags: ["möbel", "einrichten", "katalog", "gegenstand", "sofa", "tisch", "bett"], link: "einrichten-und-geräte" },
  device: { tags: ["gerät", "lampe", "sensor", "entität", "platzieren", "schalter"], link: "einrichten-und-geräte" },
  outdoor: { tags: ["garten", "terrasse", "rasen", "außen", "pool", "beet", "fläche"], link: "garten" },
  line: { tags: ["linie", "weg", "hecke", "zaun", "mauer", "randstein"], link: "garten" },
  pipe: { tags: ["leitung", "kabel", "rohr", "wasser", "strom", "netzwerk"], link: "leitungen-und-verteiler" },
  node: { tags: ["verteiler", "sicherungskasten", "router", "switch", "knoten"], link: "leitungen-und-verteiler" },
  measure: { tags: ["messen", "abstand", "länge", "maßband", "meter"], link: "hilfen" },
  bgmove: { tags: ["vorlage", "bauplan", "foto", "bild", "hintergrund", "maßstab", "ausrichten"], link: "hilfen" },
};

/** Zusätze zu den Werkzeugen der Dach-Ebene (wie TOOL_EXTRA). */
export const ROOF_EXTRA = {
  select: { tags: ["dach", "auswählen", "neigung", "kante", "form", "dachteil"], keys: [["Pfeile", "schieben"], ["Entf", "löscht bzw. setzt zurück"]], link: "dach-und-dachgeschoss" },
  roofadd: { tags: ["dach setzen", "dachform", "satteldach", "walmdach", "pultdach", "flachdach", "anbau", "erker"], link: "dach-und-dachgeschoss" },
  chimney: { tags: ["kamin", "schornstein", "ofen"], link: "dach-und-dachgeschoss" },
  skylight: { tags: ["dachfenster", "oberlicht", "fenster", "luke"], link: "dach-und-dachgeschoss" },
  pv: { tags: ["pv", "solar", "photovoltaik", "module", "strom"], link: "dach-und-dachgeschoss" },
  dormer: { tags: ["gaube", "gauben", "dachgaube", "aufbau"], link: "dach-und-dachgeschoss" },
};

const toolItem = (prefix, [key, icon, title], hint, extra) => ({ id: `${prefix}:${key}`, title, icon, text: hint ?? "", tags: extra?.tags ?? [], keys: extra?.keys, link: extra?.link });

/**
 * Alle Abschnitte der Hilfe in Anzeigereihenfolge. coarse: Touch-Gerät (Tastenkürzel wandern ans Ende), demo: Demo-Haus
 * (ein Eintrag mehr unter „Erste Schritte“).
 * @returns {Array<{ id: string, title: string, icon: string, link: string, table?: boolean, items: object[] }>}
 */
export function helpSections({ coarse = false, demo = false } = {}) {
  const out = HELP.map((s) => ({ ...s, items: [...s.items] }));
  const by = (id) => out.find((s) => s.id === id);
  by("werkzeuge").items = TOOLS.map((t) => toolItem("tool", t, t[0] === "bgmove" ? PLAN_HINTS.bgmove : HINTS[t[0]], TOOL_EXTRA[t[0]]));
  by("dach").items = ROOF_TOOLS.map((t) => toolItem("roof", t, ROOF_HINTS[t[0]], ROOF_EXTRA[t[0]]));
  if (demo) by("start").items.unshift({ id: "start:demo", title: "Demo-Haus", icon: "mdi:presentation-play", text: "Ein Vorführhaus: Alle Werte sind simuliert, nichts wird wirklich geschaltet. Dein Haus bleibt unverändert.", tags: ["demo", "vorführung", "simulation", "testhaus"] });
  if (coarse) out.push(out.splice(out.findIndex((s) => s.id === "tasten"), 1)[0]);
  return out;
}

// ------------------------------------------------------------------ Suche

const HAYSTACKS = new WeakMap();

/** Vergleichstexte eines Eintrags: Titel, Suchwörter und Tasten, übriger Text – in beiden Schreibweisen, damit „zurucksetzen“ und „zuruecksetzen“ treffen. */
function haystack(item, section) {
  let h = HAYSTACKS.get(item);
  if (!h) {
    const parts = [item.title, [...(item.tags ?? []), ...(item.keys ?? []).map((k) => k[0])].join(" "), [item.text, ...(item.keys ?? []).map((k) => k[1]), item.mouse, item.touch, section.title].filter(Boolean).join(" ")];
    h = { f: parts.map(fold), p: parts.map(foldPlain) };
    HAYSTACKS.set(item, h);
  }
  return h;
}

function scoreWord(w, h) {
  const [tf, kf, xf] = h.f;
  const [tp, kp, xp] = h.p;
  if (tf.startsWith(w) || tp.startsWith(w)) return 5;
  if (tf.includes(w) || tp.includes(w)) return 3;
  if (kf.includes(w) || kp.includes(w)) return 2;
  if (xf.includes(w) || xp.includes(w)) return 1;
  return 0;
}

/**
 * Einträge suchen: jedes Wort der Eingabe muss irgendwo vorkommen (Titel-Anfang 5, Titel 3, Suchwörter und Tasten 2,
 * Text 1); beste zuerst, bei Gleichstand die Reihenfolge der Hilfe. Leere Eingabe = alle Einträge (ohne Grenze).
 * @returns {Array<{ section: object, item: object, score: number }>}
 */
export function searchHelp(q, sections, limit = 30) {
  const words = searchWords(q);
  const all = [];
  for (const section of sections) for (const item of section.items) all.push({ section, item, score: 0 });
  if (!words.length) return all;
  const hits = [];
  for (const r of all) {
    const h = haystack(r.item, r.section);
    let score = 0;
    for (const w of words) {
      const s = scoreWord(w, h);
      if (!s) {
        score = 0;
        break;
      }
      score += s;
    }
    if (score) hits.push({ ...r, score, order: hits.length });
  }
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.slice(0, limit).map(({ order, ...r }) => r);
}

// ------------------------------------------------------------------ Hervorhebung

/** Vergleichsform samt Rückverweis: map[i] = Index des Originalzeichens, aus dem das i-te Zeichen von s entstand. */
function foldMap(text, charMap) {
  let s = "";
  const map = [];
  let i = 0;
  for (const c of String(text ?? "")) {
    const f = foldChar(c, charMap);
    for (let k = 0; k < f.length; k++) map.push(i);
    s += f;
    i += c.length;
  }
  return { s, map };
}

/**
 * Text als HTML mit <mark> um die Fundstellen der Suchwörter (erst escapen, dann markieren; Umlaute und Akzente zählen
 * wie in der Suche).
 */
export function markHtml(text, q) {
  const src = String(text ?? "");
  const words = Array.isArray(q) ? q : searchWords(q);
  if (!words.length || !src) return esc(src);
  const marks = new Array(src.length).fill(false);
  for (const charMap of [UML, PLAIN]) {
    const { s, map } = foldMap(src, charMap);
    for (const w of words) {
      for (let at = s.indexOf(w); at >= 0; at = s.indexOf(w, at + 1)) {
        for (let k = at; k < at + w.length; k++) marks[map[k]] = true;
      }
    }
  }
  // zusammenhängende Fundstellen in ein <mark> fassen, alles einzeln escapen
  let out = "";
  let on = false;
  let buf = "";
  const flush = () => {
    if (buf) out += on ? `<mark>${esc(buf)}</mark>` : esc(buf);
    buf = "";
  };
  for (let i = 0; i < src.length; i++) {
    if (marks[i] !== on) {
      flush();
      on = marks[i];
    }
    buf += src[i];
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ Kontext

/**
 * Welcher Eintrag zum aktuellen Stand gehört: im Editor das aktive Werkzeug (Dach-Ebene: „roof:…“, sonst „tool:…“;
 * der Maßstab-Schritt der Vorlage gehört zu „bgmove“); im Panel null.
 * @returns {string|null}
 */
export function helpContext({ editor = false, tool = null, roofMode = false } = {}) {
  if (!editor) return null;
  const t = tool === "bgscale" ? "bgmove" : tool;
  if (roofMode) return ROOF_TOOLS.some(([k]) => k === t) ? `roof:${t}` : null;
  return TOOLS.some(([k]) => k === t) ? `tool:${t}` : null;
}
