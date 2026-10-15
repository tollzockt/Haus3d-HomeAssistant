// Hilfe „?“: Inhalt (help-data.js) – Vollständigkeit gegen die Editor-Listen, README-Anker, Suche, Hervorhebung, Kontext,
// keine Markennamen; und die Grenzen des Startbaums (Hilfe nur per import(), kein Editor-Import im Mixin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { HELP, README_URL, DEFAULT_ANCHOR, EDITOR_ANCHOR, ROOF_EXTRA, TOOL_EXTRA, fold, foldPlain, helpContext, helpSections, markHtml, readmeHref, searchHelp, searchWords } from "../../custom_components/haus3d/frontend/help-data.js";
import { HINTS, TOOLS } from "../../custom_components/haus3d/frontend/editor-tools.js";
import { ROOF_HINTS, ROOF_TOOLS } from "../../custom_components/haus3d/frontend/editor-roof.js";
import { PLAN_HINTS } from "../../custom_components/haus3d/frontend/editor-plan.js";
import { PIPE_TYPES } from "../../custom_components/haus3d/frontend/pipes.js";
import { VIEW_MODES } from "../../custom_components/haus3d/frontend/devices.js";

const FRONT = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
const src = (f) => readFileSync(new URL(f, FRONT), "utf8");
// wie tests/js/brands.test.mjs und tests/python/test_schema.py
const BRANDS = /ikea|playstation|xbox|nintendo|sony|microsoft|valve|steam|tesla|apple|google|amazon|samsung|philips|hue\b|unifi|ubiquiti|tibber|victron/i;

const sections = helpSections({});
const items = sections.flatMap((s) => s.items.map((item) => ({ s, item })));
const ids = (list) => list.map((r) => r.item.id);

/** Überschriften der README als GitHub-Anker (klein, Satzzeichen weg, Leerzeichen → „-“; Code-Blöcke überspringen). */
function readmeAnchors() {
  const anchors = new Set();
  let code = false;
  for (const line of readFileSync(new URL("../../README.md", import.meta.url), "utf8").split("\n")) {
    if (/^\s*```/.test(line)) code = !code;
    const m = !code && line.match(/^#{1,6}\s+(.*?)\s*#*$/);
    if (m) anchors.add(m[1].replace(/`/g, "").toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-"));
  }
  return anchors;
}

test("Jedes Werkzeug des Editors hat Zusatz und Eintrag, nichts Verwaistes", () => {
  assert.deepEqual(Object.keys(TOOL_EXTRA).sort(), TOOLS.map(([k]) => k).sort());
  assert.deepEqual(Object.keys(ROOF_EXTRA).sort(), ROOF_TOOLS.map(([k]) => k).sort());
  const by = (id) => sections.find((s) => s.id === id).items;
  assert.deepEqual(by("werkzeuge").map((i) => i.id), TOOLS.map(([k]) => `tool:${k}`));
  assert.deepEqual(by("dach").map((i) => i.id), ROOF_TOOLS.map(([k]) => `roof:${k}`));
  // Titel, Symbol und Text kommen aus den Listen des Editors (eine Quelle)
  for (const [k, icon, name] of TOOLS) {
    const it = by("werkzeuge").find((i) => i.id === `tool:${k}`);
    assert.equal(it.title, name);
    assert.equal(it.icon, icon);
    assert.equal(it.text, k === "bgmove" ? PLAN_HINTS.bgmove : HINTS[k]);
    assert.ok(it.text, k);
    assert.ok(TOOL_EXTRA[k].tags.length && TOOL_EXTRA[k].link, k);
  }
  for (const [k, , name] of ROOF_TOOLS) {
    const it = by("dach").find((i) => i.id === `roof:${k}`);
    assert.equal(it.title, name);
    assert.equal(it.text, ROOF_HINTS[k]);
    assert.ok(ROOF_EXTRA[k].tags.length && ROOF_EXTRA[k].link, k);
  }
});

test("Einträge: ids eindeutig, Titel ≤ 40, alle Texte ≤ 200 Zeichen, Pflichtfelder da", () => {
  const all = helpSections({ demo: true, coarse: true }).flatMap((s) => s.items.map((item) => ({ s, item })));
  const seen = new Set();
  for (const { item } of all) {
    assert.ok(item.id && !seen.has(item.id), `id ${item.id}`);
    seen.add(item.id);
    assert.ok(item.title && item.title.length <= 40, `${item.id}: Titel ${item.title?.length}`);
    assert.ok(item.text && typeof item.text === "string", `${item.id}: Text fehlt`);
    // auch die Werkzeugtexte (aus HINTS/ROOF_HINTS/PLAN_HINTS): kurz genug für die Hilfe
    assert.ok(item.text.length <= 200, `${item.id}: Text ${item.text.length}`);
  }
  assert.equal(new Set(sections.map((s) => s.id)).size, sections.length);
});

test("Jeder Anker ist eine Überschrift der README", () => {
  const anchors = readmeAnchors();
  assert.ok(anchors.has("hilfe-und-einführung") && anchors.has("erste-schritte"));
  const links = [DEFAULT_ANCHOR, EDITOR_ANCHOR, ...sections.map((s) => s.link), ...items.map(({ item }) => item.link), ...Object.values(TOOL_EXTRA).map((e) => e.link), ...Object.values(ROOF_EXTRA).map((e) => e.link)].filter(Boolean);
  assert.ok(links.length > 30);
  for (const a of links) assert.ok(anchors.has(a), `Anker „${a}“ fehlt in der README`);
});

test("Links: README-Adresse, Umlaute kodiert; Leitungsfarben und Bodenfarben aus dem Code", () => {
  assert.equal(README_URL, "https://github.com/tollzockt/Haus3d-HomeAssistant");
  assert.equal(readmeHref("hilfen"), `${README_URL}#hilfen`);
  assert.equal(readmeHref("räume-wände-fenster-und-türen"), `${README_URL}#r%C3%A4ume-w%C3%A4nde-fenster-und-t%C3%BCren`);
  assert.equal(readmeHref(), README_URL);
  const colors = sections.find((s) => s.id === "farben").items;
  const pipes = colors.find((i) => i.id === "c:pipes");
  assert.deepEqual(pipes.swatches, PIPE_TYPES.map(([, name, color]) => [color, name]));
  for (const mode of Object.keys(VIEW_MODES)) {
    const it = colors.find((i) => i.id === `c:${mode}`);
    assert.ok(it, mode);
    assert.ok(it.swatches.length >= 5 && it.swatches.every(([c]) => /^rgb\(\d+,\d+,\d+\)$/.test(c)), mode);
  }
  assert.ok(colors.find((i) => i.id === "c:humidity").swatches.length === 6, "Feuchte: Verlauf plus Warnwert");
  // keine Farbe aus Fremdquellen: Farbfelder sind Hex oder rgb()
  for (const { item } of items) for (const [c] of item.swatches ?? []) assert.match(c, /^(#[0-9a-f]{6}|rgb\(\d+,\d+,\d+\))$/i, item.id);
});

test("Vergleichsform: Umlaute, Akzente, Tasten", () => {
  assert.equal(fold("Zurücksetzen"), "zuruecksetzen");
  assert.equal(foldPlain("Zurücksetzen"), "zurucksetzen");
  assert.equal(fold("Größe  Fußboden"), "groesse fussboden");
  assert.equal(fold("Strg+Z"), "strg+z");
  assert.equal(fold("CO₂ – Café"), "co2 cafe");
  assert.deepEqual(searchWords(" Wand, Etage "), ["wand", "etage"]);
});

test("Suche: Werkzeuge, Tasten, Umlaute, leer und Unsinn", () => {
  const top = (q) => searchHelp(q, sections)[0]?.item.id;
  assert.equal(top("wand"), "tool:wall");
  assert.equal(top("Wand"), "tool:wall");
  assert.equal(top("Strg+Z"), "k:edit");
  assert.equal(top("zurucksetzen"), "d:reset");
  assert.equal(top("Zurücksetzen"), "d:reset");
  assert.equal(top("zuruecksetzen"), "d:reset");
  assert.equal(top("gaube"), "roof:dormer");
  assert.equal(top("druck"), "d:print");
  assert.equal(top("co2"), "c:co2");
  assert.equal(top("tur"), "tool:door"); // ohne Umlaut
  assert.equal(searchHelp("", sections).length, items.length);
  assert.equal(searchHelp("   ", sections).length, items.length);
  assert.deepEqual(searchHelp("xyzqwv", sections), []);
  assert.deepEqual(searchHelp("wand xyzqwv", sections), []); // alle Wörter müssen passen
  assert.ok(searchHelp("licht", sections, 3).length <= 3);
  // mehrere Wörter: alle müssen vorkommen, Titel zuerst
  assert.equal(top("raum rechteck"), "tool:rect");
  assert.ok(!ids(searchHelp("raum rechteck", sections)).includes("tool:poly"));
  // Treffer tragen ihren Abschnitt
  assert.equal(searchHelp("wand", sections)[0].section.id, "werkzeuge");
});

test("Hervorhebung: erst escapen, dann markieren; Umlaute wie in der Suche", () => {
  assert.equal(markHtml("Alles zurücksetzen", "zurucksetzen"), "Alles <mark>zurücksetzen</mark>");
  assert.equal(markHtml("Alles zurücksetzen", "Zurücksetzen"), "Alles <mark>zurücksetzen</mark>");
  assert.equal(markHtml("<b>Wand</b> & Wände", "wand"), "&lt;b&gt;<mark>Wand</mark>&lt;/b&gt; &amp; <mark>Wänd</mark>e");
  assert.equal(markHtml("Strg+Z", "strg+z"), "<mark>Strg+Z</mark>");
  assert.equal(markHtml("nichts", "wand"), "nichts");
  assert.equal(markHtml("<script>", ""), "&lt;script&gt;");
  assert.equal(markHtml("Größe", "gross"), "<mark>Größ</mark>e"); // ß zählt als „ss“
  assert.ok(!/<(?!\/?mark>)/.test(markHtml("a<img src=x onerror=1>b", "img")), "kein rohes Tag");
});

test("Kontext: Editor-Werkzeug, Maßstab zählt zur Vorlage, Dach-Ebene, Panel", () => {
  assert.equal(helpContext({ editor: true, tool: "wall" }), "tool:wall");
  assert.equal(helpContext({ editor: true, tool: "bgscale" }), "tool:bgmove");
  assert.equal(helpContext({ editor: true, tool: "chimney", roofMode: true }), "roof:chimney");
  assert.equal(helpContext({ editor: true, tool: "select", roofMode: true }), "roof:select");
  assert.equal(helpContext({ editor: true, tool: "wall", roofMode: true }), null); // gibt es auf der Dach-Ebene nicht
  assert.equal(helpContext({ editor: true, tool: "gibtsnicht" }), null);
  assert.equal(helpContext({ editor: false, tool: "wall" }), null);
  assert.equal(helpContext(), null);
  for (const [k] of TOOLS) assert.ok(items.some(({ item }) => item.id === helpContext({ editor: true, tool: k })), k);
  for (const [k] of ROOF_TOOLS) assert.ok(items.some(({ item }) => item.id === helpContext({ editor: true, tool: k, roofMode: true })), k);
});

test("Abschnitte: Demo-Zeile nur im Demo-Haus, Tastenkürzel am Touch-Gerät zuletzt", () => {
  assert.ok(!items.some(({ item }) => item.id === "start:demo"));
  assert.ok(helpSections({ demo: true }).flatMap((s) => s.items).some((i) => i.id === "start:demo"));
  assert.equal(helpSections({ coarse: true }).at(-1).id, "tasten");
  assert.equal(sections.at(-1).id, "daten");
  // die statischen Daten werden nicht verändert
  assert.equal(HELP.find((s) => s.id === "werkzeuge").items.length, 0);
  assert.equal(HELP.find((s) => s.id === "start").items.some((i) => i.id === "start:demo"), false);
});

test("Keine Markennamen in der Hilfe, in der Tour und in der Einbindung", () => {
  const texts = items.flatMap(({ s, item }) => [s.title, item.title, item.text, item.mouse, item.touch, ...(item.tags ?? []), ...(item.keys ?? []).flat(), ...(item.swatches ?? []).map((x) => x[1])]).filter(Boolean);
  for (const t of texts) assert.doesNotMatch(t, BRANDS, t);
  for (const f of ["help.js", "help-data.js", "tour.js"]) assert.doesNotMatch(src(f), BRANDS, f);
  for (const { item } of items) if (item.icon) assert.doesNotMatch(item.icon, /^mdi:(github|patreon|paypal|ko-?fi|sony|microsoft|nintendo|tesla|ikea|apple|google|amazon|steam)/, item.id);
});

test("Startbaum: help-data.js nur per import(), help.js und tour.js ohne Editor-Import", () => {
  const files = ["help.js", "tour.js", "panel-help.js"];
  for (const f of files) assert.doesNotMatch(src(f), /from\s+"\.\/editor[^"]*"/, `${f} importiert den Editor statisch`);
  assert.doesNotMatch(src("help.js"), /from\s+"\.\/help-data\.js"/);
  assert.match(src("help.js"), /import\("\.\/help-data\.js"\)/);
  // niemand im Paket importiert help-data.js statisch (außer Tests)
  assert.doesNotMatch(src("haus3d-panel.js"), /help-data/);
  for (const f of ["help.js", "tour.js", "help-data.js"]) assert.ok(src(f).length < 25_000, `${f} ist zu groß`);
});

test("Hilfe lädt nichts aus dem Netz: keine fetch-Aufrufe, einziger Link mit rel=noopener", () => {
  for (const f of ["help.js", "help-data.js", "tour.js"]) {
    assert.doesNotMatch(src(f), /\bfetch\(|XMLHttpRequest|sendBeacon|new Image\(|<img|<script|<link /, f);
  }
  const help = src("help.js");
  for (const a of help.match(/<a [^>]*>/g)) assert.match(a, /target="_blank" rel="noopener noreferrer"/, a);
});

test("Datenschutz-Eintrag: nennt alle Links, die ins Netz führen („Ausführliche Anleitung ↗“ und „Mehr ↗“)", () => {
  const privacy = items.find((x) => x.item.id === "d:privacy").item;
  assert.match(privacy.text, /lädt nichts aus dem Netz/);
  assert.match(privacy.text, /Nur die Links mit „↗“ öffnen die Anleitung im Netz\./);
  // die Hilfe hat genau diese zwei Arten von Links (beide mit „↗“)
  const help = src("help.js");
  assert.match(help, /Ausführliche Anleitung ↗/);
  assert.match(help, /Mehr ↗/);
  assert.doesNotMatch(privacy.text, /Nur „Ausführliche Anleitung ↗“/);
});
