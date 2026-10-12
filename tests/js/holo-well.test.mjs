// 0.23: Info-Hologramme (welche Gegenstände, Titel, Werte) und Lichtschacht vor Kellerfenstern
import assert from "node:assert/strict";
import { test } from "node:test";

import { holoItems, holoRows, holoTitle, holoValue } from "../../custom_components/haus3d/frontend/holo.js";
import { buildLightWell, wellBox } from "../../custom_components/haus3d/frontend/well.js";
import { furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";

const room = { id: "buero", name: "Büro", points: [[0, 0], [4, 0], [4, 3], [0, 3]] };
const floor = {
  id: "eg", elevation: 0, rooms: [room], outdoor: [],
  furniture: [
    { id: "pc", type: "gaming_pc", x: 1, z: 1, info: [{ entity: "sensor.cpu_temp", name: "CPU" }, { entity: "sensor.pc_leistung" }] },
    { id: "drucker", type: "printer_3d", x: 3, z: 2, info: [{ entity: "sensor.druck_fortschritt" }] },
    { id: "sofa", type: "sofa", x: 2, z: 2 }, // ohne Werte: keine Tafel
    { id: "draussen", type: "nas", x: 9, z: 9, info: [{ entity: "sensor.nas" }] }, // außerhalb des Raums
    { id: "regal", type: "ikea_kallax_2x2", x: 0.5, z: 2.5, info: [{ entity: "sensor.x" }] },
  ],
};
const hass = { states: {
  "sensor.cpu_temp": { state: "54.26", attributes: { unit_of_measurement: "°C" } },
  "sensor.pc_leistung": { state: "312.4", attributes: { unit_of_measurement: "W", friendly_name: "PC Leistung" } },
  "sensor.druck_fortschritt": { state: "unavailable", attributes: {} },
} };

test("Hologramme: nur Gegenstände mit Werten im angetippten Raum", () => {
  assert.deepEqual(holoItems(floor, "buero").map((m) => m.id), ["pc", "drucker", "regal"]);
  assert.deepEqual(holoItems(floor, "gibtsnicht"), []);
  assert.deepEqual(holoItems({ ...floor, furniture: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, type: "nas", x: 1, z: 1, info: [{ entity: "sensor.a" }] })) }, "buero").length, 8);
});

test("Hologramme: Titel ohne Maßangabe, Werte mit Einheit, Name aus HA", () => {
  assert.equal(holoTitle(floor.furniture[0]), "Gaming-PC (Midi-Tower)");
  assert.equal(holoTitle(floor.furniture[4]), "Würfelregal 2×2");
  assert.equal(holoTitle({ ...floor.furniture[0], name: "Mein PC" }), "Mein PC");
  assert.deepEqual(holoRows(floor.furniture[0], hass), [
    { entity: "sensor.cpu_temp", name: "CPU", value: "54,3 °C" },
    { entity: "sensor.pc_leistung", name: "PC Leistung", value: "312 W" },
  ]);
  assert.equal(holoValue(hass.states["sensor.druck_fortschritt"]), "–");
  assert.equal(holoValue({ state: "on", attributes: {} }), "an");
});

test("Lichtschacht: nur unter dem Gelände, außen vor der Wand, Breite Fenster + 20 cm", () => {
  const base = { width: 1, thick: 0.3, outside: 1, well: { depth: 0.5 } };
  assert.equal(wellBox({ ...base, elev: 0, sill: 0.9 }), null); // EG-Fenster über dem Gelände
  const b = wellBox({ ...base, elev: -2.5, sill: 1.6 });
  assert.ok(b && Math.abs(b.w - 1.2) < 1e-9 && b.depth === 0.5 && b.z0 === 0.15 && Math.abs(b.z1 - 0.65) < 1e-9 && b.top > 0.9);
  assert.equal(wellBox({ ...base, outside: -1, elev: -2.5, sill: 1.6 }).z1, -0.65);
  const g = buildLightWell({ ...base, elev: -2.5, sill: 1.6 }, furnitureMaterials("standard"));
  assert.ok(g.children.length > 8); // Wände, Kies, Rahmen und Stäbe
  assert.equal(buildLightWell({ ...base, elev: 0, sill: 1 }, furnitureMaterials("standard")), null);
});
