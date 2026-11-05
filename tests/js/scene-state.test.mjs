// Fingerabdruck der Zustände (scene-state.js): jede Eingabe-Art von applyStates ändert ihn, reine Leistungswerte nicht
// (Einspeisung nur aktiv ja/nein, Sensoren ohne eigenes Möbelstück, Raumwerte außerhalb der Werte-Ansicht bzw. mit gleicher
// Ergebnisfarbe); Mengen und Maps unabhängig von der Reihenfolge.
import assert from "node:assert/strict";
import { test } from "node:test";

import { encodeValue, stateSignature } from "../../custom_components/haus3d/frontend/scene-state.js";

const COLOR = (v) => [Math.min(1, Math.max(0, (v - 15) / 15)), 0.5, Math.min(1, Math.max(0, (30 - v) / 15))];
const CURTAIN = { entity_id: "cover.vorhang", state: "closed", attributes: {} };

/** Zustand wie im Panel (_updateStates); patch überschreibt einzelne Schlüssel. */
function base(patch = {}) {
  return {
    security: { tilted: new Set(), closed: new Set(["eg:f1"]) },
    lit: new Set(["eg:wz", "eg:kue"]),
    temps: new Map([["eg:wz", 21.4], ["eg:kue", null]]),
    tempMode: false,
    tempColor: COLOR,
    open: new Set(["eg:t1"]),
    covers: new Map([["eg:f1", 0.5]]),
    feedIn: 380,
    onEntities: new Set(["light.a", "switch.b"]),
    heating: new Set(["climate.wz"]),
    heatRooms: new Set(["eg:bad"]),
    alerts: new Map([["eg:kue", "warn"]]),
    lights: new Map([["eg:wz", { color: [1, 0.8, 0.5], level: 0.7 }]]),
    lightLooks: new Map([["light.a", { color: [1, 0.8, 0.5], level: 0.7 }]]),
    states: { "cover.vorhang": CURTAIN, "sensor.leistung": { state: "120" } },
    ...patch,
  };
}
const OPT = { entities: ["cover.vorhang"], style: "standard", dark: false, glow: true };
const sig = (s, o = {}) => stateSignature(s, { ...OPT, ...o });

test("gleicher Zustand, gleicher Fingerabdruck; Mengen und Maps unabhängig von der Reihenfolge", () => {
  assert.equal(sig(base()), sig(base()));
  const umgekehrt = base({
    lit: new Set(["eg:kue", "eg:wz"]),
    temps: new Map([["eg:kue", null], ["eg:wz", 21.4]]),
    onEntities: new Set(["switch.b", "light.a"]),
    tempColor: (v) => COLOR(v), // neue Funktion je Aufruf (Panel): zählt nicht
  });
  assert.equal(sig(umgekehrt), sig(base()));
  assert.equal(sig(base(), { entities: ["cover.vorhang", "cover.vorhang"] }), sig(base()));
});

test("jede Eingabe-Art ändert den Fingerabdruck", () => {
  const ref = sig(base());
  const m = new Map([["eg:wz", { color: [1, 0.8, 0.5], level: 0.7 }]]);
  const changes = {
    lit: { lit: new Set(["eg:wz"]) },
    tempMode: { tempMode: true },
    open: { open: new Set() },
    covers: { covers: new Map([["eg:f1", 0.6]]) },
    "covers ohne Wert": { covers: new Map([["eg:f1", null]]) },
    gekippt: { security: { tilted: new Set(["eg:f1"]), closed: new Set(["eg:f1"]) } },
    zu: { security: { tilted: new Set(), closed: new Set() } },
    "Einspeisung aus": { feedIn: 0 },
    "Einspeisung fehlt": { feedIn: null },
    onEntities: { onEntities: new Set(["light.a"]) },
    heating: { heating: new Set() },
    heatRooms: { heatRooms: new Set(["eg:bad", "eg:wz"]) },
    alerts: { alerts: new Map([["eg:kue", "critical"]]) },
    "alerts weg": { alerts: new Map() },
    "Lichtfarbe Raum": { lights: new Map([["eg:wz", { color: [1, 0.8, 0.6], level: 0.7 }]]) },
    "Helligkeit Raum": { lights: new Map([["eg:wz", { color: [1, 0.8, 0.5], level: 0.71 }]]) },
    "Lichtfarbe Lampe": { lightLooks: new Map([["light.a", { color: [0.2, 0.8, 0.5], level: 0.7 }]]) },
    "Lampe ohne Farbe": { lightLooks: new Map([["light.a", null]]) },
    "Zustandsobjekt Möbel": { states: { "cover.vorhang": { ...CURTAIN }, "sensor.leistung": { state: "120" } } },
    "Möbel-Entität fehlt": { states: { "sensor.leistung": { state: "120" } } },
    "neuer Schlüssel": { extra: new Set(["x"]) },
  };
  assert.equal(sig(base({ lights: m })), ref, "gleiche Werte in neuen Objekten");
  for (const [name, patch] of Object.entries(changes)) assert.notEqual(sig(base(patch)), ref, name);
  // Darstellung der Szene
  assert.notEqual(sig(base(), { style: "cyber" }), ref, "Stil");
  assert.notEqual(sig(base(), { dark: true }), ref, "dunkel");
  assert.notEqual(sig(base(), { glow: false }), ref, "Glühen");
  assert.notEqual(sig(base(), { entities: [] }), ref, "Möbel mit Entität");
});

test("Raumwerte als Ergebnisfarbe, nur in der Werte-Ansicht", () => {
  const an = (temps, tempColor = COLOR) => sig(base({ tempMode: true, temps, tempColor }));
  const ref = an(new Map([["eg:wz", 21.4], ["eg:kue", null]]));
  assert.notEqual(an(new Map([["eg:wz", 21.5], ["eg:kue", null]])), ref, "andere Farbe");
  assert.notEqual(an(new Map([["eg:wz", 21.4], ["eg:kue", 20]])), ref, "Wert statt grau");
  assert.notEqual(an(new Map([["eg:wz", 21.4]])), ref, "Raum fehlt");
  assert.notEqual(an(new Map([["eg:wz", 21.4], ["eg:kue", null]]), (v) => [0.6, 0.6, v / 100]), ref, "andere Ansicht (Farbskala)");
  // gleiche Farbe (oberhalb der Skala), andere Werte: kein neues Bild
  assert.equal(an(new Map([["eg:wz", 35]])), an(new Map([["eg:wz", 40]])));
  // ohne Werte-Ansicht zeichnet applyStates die Werte nicht
  assert.equal(sig(base({ temps: new Map([["eg:wz", 25]]) })), sig(base()));
});

test("reine Leistungswerte ändern den Fingerabdruck nicht", () => {
  const ref = sig(base());
  assert.equal(sig(base({ feedIn: 1200 })), ref, "Einspeisung höher, weiter aktiv");
  assert.equal(sig(base({ feedIn: 1.5 })), ref, "knapp aktiv");
  assert.equal(sig(base({ feedIn: 0 })), sig(base({ feedIn: 0.8 })), "Einspeisung unter 1 W: aus");
  assert.equal(sig(base({ feedIn: 0 })), sig(base({ feedIn: null })), "kein Wert: aus");
  // Home Assistant ersetzt bei jeder Änderung das ganze states-Objekt und die Zustände geänderter Sensoren
  assert.equal(sig(base({ states: { "cover.vorhang": CURTAIN, "sensor.leistung": { state: "135" } } })), ref, "Leistungssensor");
  assert.equal(sig(base({ states: { "cover.vorhang": CURTAIN } })), ref, "anderer Sensor fehlt");
  // ohne Möbel mit eigener Entität zählt states gar nicht
  assert.equal(sig(base({ states: {} }), { entities: [] }), sig(base(), { entities: [] }));
});

test("encodeValue: Reihenfolge, Typen, Ringe", () => {
  assert.equal(encodeValue(new Set(["b", "a"])), encodeValue(new Set(["a", "b"])));
  assert.equal(encodeValue({ b: 1, a: [2, 3] }), encodeValue({ a: [2, 3], b: 1 }));
  assert.notEqual(encodeValue([1, 2]), encodeValue([2, 1]), "Felder in Reihenfolge");
  assert.notEqual(encodeValue("1"), encodeValue(1));
  assert.notEqual(encodeValue(new Set(["a,b"])), encodeValue(new Set(["a", "b"])), "Trennzeichen im Text");
  assert.equal(encodeValue(null), encodeValue(undefined));
  const ring = { name: "x" };
  ring.self = ring;
  assert.equal(typeof encodeValue(ring), "string");
  assert.equal(encodeValue(ring), encodeValue(ring), "Ring: gleiche Identität");
});
