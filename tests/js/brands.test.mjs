// Marken-Regeln (CONTRIBUTING.md): fremde Namen nur als Bezug, nie als Kategorie, Typ-Bezeichnung oder Anspielung
import assert from "node:assert/strict";
import { test } from "node:test";

import { EXTRA } from "../../custom_components/haus3d/frontend/catalog-extra.js";
import { FURNITURE, FURNITURE_CATEGORIES, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { SUPPORT_LINKS } from "../../custom_components/haus3d/frontend/panel-util.js";

const BRANDS = /ikea|playstation|xbox|nintendo|sony|microsoft|valve|steam|tesla|apple|google|amazon|samsung|philips|hue\b/i;
// Möbelserien und Spielkonsolen: Typ zuerst, der Produktname nur als „Maße wie …“
const REFERENCED = Object.keys(EXTRA).filter((k) => k.startsWith("ikea_") || k.startsWith("console_") || k === "steam_deck");

test("Kategorien tragen keine Markennamen", () => {
  for (const [cat] of FURNITURE_CATEGORIES) assert.doesNotMatch(cat, BRANDS, cat);
});

test("Möbelserien und Konsolen: Gattung zuerst, Produkt nur als „(Maße wie …)“", () => {
  assert.ok(REFERENCED.length >= 30);
  for (const k of REFERENCED) {
    const label = EXTRA[k][0];
    const m = label.match(/^([^()]+) \(Maße wie [^()]+\)$/);
    assert.ok(m, `${k}: ${label}`);
    assert.doesNotMatch(m[1], BRANDS, label);
    assert.doesNotMatch(m[1], /[A-ZÄÖÜÅ]{3,}/, label); // keine Serien-Namen in Großbuchstaben vorne
  }
});

test("Keine Anspielungen auf fremde Modellnamen in Gattungs-Möbeln", () => {
  const generic = Object.entries(FURNITURE).filter(([k]) => !REFERENCED.includes(k) && !/^(wallbox_|inv_|bat_|micro_)/.test(k));
  for (const [k, [label]] of generic) {
    assert.doesNotMatch(label, BRANDS, `${k}: ${label}`);
    assert.doesNotMatch(label, /O11|Play-Bar|Arco|Solarbank/i, `${k}: ${label}`);
  }
});

test("Spenden-Links ohne Marken-Symbole", () => {
  for (const [, , , icon] of SUPPORT_LINKS) assert.doesNotMatch(icon, /^mdi:(github|patreon|paypal|ko-?fi)/, icon);
});

test("Geräte-Modelle ohne Herstellerfarben: Wallboxen, Wechselrichter, Speicher, Konsolen", () => {
  // Akzentfarben des Katalogs (rot, orange, grün, petrol) dürfen an Marken-Geräten nicht vorkommen
  const ACCENTS = new Set([0xc62828, 0xe8710a, 0x2e7d32, 0x00897b]);
  const M = furnitureMaterials("standard");
  const types = Object.keys(FURNITURE).filter((k) => /^(wallbox|inv_|bat_|micro_|console_)|^steam_deck$/.test(k));
  assert.ok(types.length >= 40);
  const look = new Map();
  for (const type of types) {
    const g = buildFurniture({ id: type, type, x: 0, z: 0 }, M, 0, 2.5);
    const colors = new Set();
    g.traverse((o) => o.isMesh && colors.add(o.material.color.getHex()));
    for (const c of colors) assert.ok(!ACCENTS.has(c), `${type}: Farbe #${c.toString(16)}`);
    const group = type.replace(/_.*/, "");
    const key = [...colors].sort().join();
    if (["wallbox", "inv", "bat", "micro"].includes(group)) {
      look.set(group, look.get(group) ?? key);
      assert.equal(key, look.get(group), `${type}: weicht vom einheitlichen Aussehen ab`);
    }
  }
});
