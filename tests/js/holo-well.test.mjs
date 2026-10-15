// 0.23: Info-Hologramme (welche Gegenstände, Titel, Werte) und Lichtschacht vor Kellerfenstern
import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_RACK_ROWS, holoEntities, holoItems, holoRows, holoRowsFor, holoTitle, holoValue } from "../../custom_components/haus3d/frontend/holo.js";
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

// ---------------------------------------------------------------- Tafel des Schranks (Geräte, Leistung gesamt, Status-Punkte)

const st = (state, attributes = {}) => ({ state, attributes });
const rackStates = (o = {}) => ({
  states: {
    "sensor.test_usv_leistung": st("180", { unit_of_measurement: "W" }),
    "switch.test_nas": st("on"),
    "sensor.test_nas_temp": st("41.2", { unit_of_measurement: "°C", friendly_name: "NAS Temperatur" }),
    "sensor.test_nas_leistung": st("65", { unit_of_measurement: "W" }),
    "sensor.test_srv_leistung": st("0.5", { unit_of_measurement: "kW" }),
    "sensor.test_sw_temp": st("33", { unit_of_measurement: "°C" }),
    ...o,
  },
});
const rackFloor = (devices) => ({
  id: "eg", elevation: 0, rooms: [room], outdoor: [],
  furniture: [{ id: "cab", type: "network_cabinet", x: 2, z: 1.5, rotation: 0, w: 0.6, d: 0.6, h: 1.2 }, ...devices.map((d) => ({ x: 2, z: 1.5, in_rack: "cab", ...d }))],
});
const devices = () => [
  { id: "usv", type: "tech_ups_2u", rack_u: 1, name: "USV", entity: "sensor.test_usv_leistung" },
  { id: "nas", type: "tech_nas_rack", rack_u: 3, name: "NAS", entity: "switch.test_nas", info: [{ entity: "sensor.test_nas_temp" }, { entity: "sensor.test_nas_leistung", name: "Leistung" }] },
  { id: "srv", type: "tech_srv_1u", rack_u: 5, name: "Server", entity: "sensor.test_srv_leistung" },
  { id: "sw", type: "tech_switch_24", rack_u: 20, name: "Switch", info: [{ entity: "sensor.test_sw_temp", name: "Temperatur" }] },
  { id: "blank", type: "tech_blank_panel", rack_u: 21 }, // ohne Entität und Info: keine Zeile
];

test("Tafel des Schranks: Leistung gesamt, dann je Gerät (oben zuerst) mit Status-Punkt, Werte eingerückt; keine Tafeln im Schrank", () => {
  const fl = rackFloor(devices());
  const hass = rackStates();
  // eine Tafel am Schrank, nicht eine je Gerät
  assert.deepEqual(holoItems(fl, "buero").map((m) => m.id), ["cab"]);
  const rows = holoRowsFor(fl, fl.furniture[0], hass);
  assert.deepEqual(rows.map((r) => [r.sub === true ? "  " : "", r.name, r.value, r.led ?? null, r.entity]), [
    ["", "Leistung gesamt", "745 W", null, null],
    ["", "Switch", "", "green", null], // Gerät nur mit Info: Punkt grün wie im Modell, kein Antippen
    ["  ", "Temperatur", "33 °C", null, "sensor.test_sw_temp"],
    ["", "Server", "0,5 kW", "green", "sensor.test_srv_leistung"],
    ["", "NAS", "an", "green", "switch.test_nas"],
    ["  ", "NAS Temperatur", "41,2 °C", null, "sensor.test_nas_temp"],
    ["  ", "Leistung", "65 W", null, "sensor.test_nas_leistung"],
    ["", "USV", "180 W", "green", "sensor.test_usv_leistung"],
  ]);
  assert.equal(rows.find((r) => r.name === "Leistung gesamt").power, true);
  // Punkt nach rackLedKind: aus grau, nicht erreichbar rot
  const other = holoRowsFor(fl, fl.furniture[0], rackStates({ "switch.test_nas": st("off"), "sensor.test_usv_leistung": st("unavailable"), "sensor.test_srv_leistung": st("0", { unit_of_measurement: "kW" }) }));
  assert.deepEqual(other.filter((r) => r.led).map((r) => [r.name, r.value, r.led]), [["Switch", "", "green"], ["Server", "0 kW", "off"], ["NAS", "aus", "off"], ["USV", "–", "red"]]);
  // fehlt der Zustand ganz (Entität gibt es nicht): grau
  assert.equal(holoRowsFor(fl, fl.furniture[0], { states: {} }).find((r) => r.name === "NAS").led, "off");
  // ohne hass: nichts bricht
  assert.ok(holoRowsFor(fl, fl.furniture[0], null).length > 0);
});

test("Tafel des Schranks: Leistung gesamt in kW ab 1000 W, fehlt ohne gültigen Leistungswert; eigene Werte des Schranks stehen vorn", () => {
  const fl = rackFloor(devices());
  const cab = fl.furniture[0];
  const kw = holoRowsFor(fl, cab, rackStates({ "sensor.test_usv_leistung": st("1200", { unit_of_measurement: "W" }) }));
  assert.deepEqual(kw[0], { entity: null, name: "Leistung gesamt", value: "1,77 kW", power: true });
  // alle Leistungswerte unbrauchbar: keine Summenzeile
  const none = holoRowsFor(fl, cab, rackStates({ "sensor.test_usv_leistung": st("unavailable"), "sensor.test_nas_leistung": st("unknown"), "sensor.test_srv_leistung": st("kaputt", { unit_of_measurement: "kW" }) }));
  assert.ok(!none.some((r) => r.power));
  // eigene Werte des Schranks zählen nicht zur Summe, stehen aber ganz oben
  cab.info = [{ entity: "sensor.test_schrank_leistung", name: "Schrank" }];
  const own = holoRowsFor(fl, cab, rackStates({ "sensor.test_schrank_leistung": st("9000", { unit_of_measurement: "W" }) }));
  assert.deepEqual(own.slice(0, 2).map((r) => [r.name, r.value]), [["Schrank", "9.000 W"], ["Leistung gesamt", "745 W"]]);
  // andere Gegenstände: ihre Info-Werte wie bisher, auch mit floor
  assert.deepEqual(holoRowsFor(floor, floor.furniture[0], hass), holoRows(floor.furniture[0], hass));
});

test("Tafel des Schranks: höchstens 12 Zeilen, dann „+ n weitere“; beobachtet werden trotzdem alle Entitäten", () => {
  const many = devices();
  many[1].info = Array.from({ length: 10 }, (_, i) => ({ entity: `sensor.test_nas_${i}`, name: `Wert ${i}` }));
  const fl = rackFloor(many);
  const rows = holoRowsFor(fl, fl.furniture[0], rackStates());
  // Summe 1 + Switch 2 + Server 1 + NAS 11 + USV 1 = 16 Zeilen
  assert.equal(MAX_RACK_ROWS, 12);
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.at(-1), { entity: null, name: "+ 4 weitere", value: "", more: true });
  assert.equal(rows.at(-2).sub, true);
  const ids = holoEntities(fl, fl.furniture[0]);
  assert.ok(ids.includes("sensor.test_nas_9") && ids.includes("sensor.test_usv_leistung") && ids.includes("sensor.test_sw_temp"));
  assert.equal(new Set(ids).size, ids.length, "jede Entität einmal");
  // genau 12: keine „weitere“-Zeile
  many[1].info = many[1].info.slice(0, 6);
  const fl12 = rackFloor(many);
  const r12 = holoRowsFor(fl12, fl12.furniture[0], rackStates());
  assert.equal(r12.length, 12);
  assert.ok(!r12.some((r) => r.more));
  // ohne Entität gibt es nichts zu beobachten
  assert.deepEqual(holoEntities(rackFloor([{ id: "b", type: "tech_blank_panel", rack_u: 1 }]), rackFloor([]).furniture[0]), []);
});

test("Tafel des Schranks: eine Entität am Gerät genügt für die Tafel; Geräte ohne Entität und Info nicht; ausgebaute Geräte haben eine eigene", () => {
  const blank = { id: "b", type: "tech_blank_panel", rack_u: 1 };
  assert.deepEqual(holoItems(rackFloor([blank]), "buero"), []);
  const onlyEntity = rackFloor([blank, { id: "s", type: "tech_srv_1u", rack_u: 2, entity: "switch.test_server" }]);
  assert.deepEqual(holoItems(onlyEntity, "buero").map((m) => m.id), ["cab"]);
  assert.deepEqual(holoRowsFor(onlyEntity, onlyEntity.furniture[0], { states: { "switch.test_server": st("on") } }).map((r) => [r.name, r.value, r.led]), [["Server 1 HE", "an", "green"]]);
  // Entität ohne Info-Werte: das ausgebaute Gerät hat keine eigene Tafel (nur Info-Werte zählen für frei stehende Geräte)
  const out = structuredClone(onlyEntity);
  delete out.furniture[2].in_rack;
  assert.deepEqual(holoItems(out, "buero"), []);
  // ausgebaut mit Info: eigene Tafel, die Tafel des Schranks verschwindet
  out.furniture[2].info = [{ entity: "sensor.x" }];
  assert.deepEqual(holoItems(out, "buero").map((m) => m.id), ["s"]);
  // Gerät ohne gültige HE (rack_u fehlt) steht nicht in der Tafel
  const lost = rackFloor([{ id: "s", type: "tech_srv_1u", entity: "switch.test_server" }]);
  assert.deepEqual(holoItems(lost, "buero"), []);
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
