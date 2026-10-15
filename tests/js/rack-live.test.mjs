// Live-Werte eingebauter Geräte: Farbe der Status-LED und Leistungssumme eines Schranks (rack-live.js)
import assert from "node:assert/strict";
import { test } from "node:test";

import { deviceEntities, rackEntities, rackLedKind, rackPower } from "../../custom_components/haus3d/frontend/rack-live.js";

const st = (state, attributes = {}, entity_id = "sensor.test") => ({ entity_id, state, attributes });

test("rackLedKind: Tabelle der Zustände", () => {
  // kein Zustand
  for (const v of [undefined, null, 0, "on"]) assert.equal(rackLedKind(v), "off", String(v));
  // nicht erreichbar → rot
  assert.equal(rackLedKind(st("unavailable")), "red");
  // Fehlerzustände → rot (auch in anderer Schreibweise)
  for (const s of ["error", "fault", "problem", "failed", "Error", "FAILED"]) assert.equal(rackLedKind(st(s, {}, "sensor.x")), "red", s);
  // aus / unbekannt → grau
  for (const s of ["off", "standby", "unknown", "not_home", "closed", ""]) assert.equal(rackLedKind(st(s, {}, "switch.x")), "off", JSON.stringify(s));
  // an und alles andere → grün
  for (const s of ["on", "home", "open", "playing", "idle", "heat", "online"]) assert.equal(rackLedKind(st(s, {}, "switch.x")), "green", s);
  // Zahlen: 0 → grau, sonst grün
  assert.equal(rackLedKind(st("0", { unit_of_measurement: "W" })), "off");
  assert.equal(rackLedKind(st("0.0")), "off");
  assert.equal(rackLedKind(st("12.5", { unit_of_measurement: "W" })), "green");
  assert.equal(rackLedKind(st("-3")), "green");
  assert.equal(rackLedKind(st("0 W")), "green", "keine reine Zahl: alles andere");
});

test("rackLedKind: Störungs- und Verbindungsmelder kehren die Bedeutung um", () => {
  const bin = (state, device_class) => st(state, { device_class }, "binary_sensor.t");
  assert.equal(rackLedKind(bin("on", "problem")), "red");
  assert.equal(rackLedKind(bin("off", "problem")), "green");
  assert.equal(rackLedKind(bin("on", "connectivity")), "green");
  assert.equal(rackLedKind(bin("off", "connectivity")), "red");
  assert.equal(rackLedKind(bin("unavailable", "connectivity")), "red");
  assert.equal(rackLedKind(bin("unavailable", "problem")), "red");
  assert.equal(rackLedKind(bin("unknown", "problem")), "off");
  // andere Klassen bzw. andere Bereiche: normale Regel
  assert.equal(rackLedKind(bin("on", "motion")), "green");
  assert.equal(rackLedKind(bin("off", "motion")), "off");
  assert.equal(rackLedKind(st("on", { device_class: "problem" }, "switch.t")), "green");
});

const cab = { id: "c1", type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2 };
const dev = (id, type, u, o = {}) => ({ id, type, in_rack: "c1", rack_u: u, x: 5, z: 5, rotation: 0, ...o });
const states = (o) => Object.fromEntries(Object.entries(o).map(([id, [state, unit]]) => [id, { entity_id: id, state, attributes: unit ? { unit_of_measurement: unit } : {} }]));

test("Leistungssumme: W und kW, jede Entität einmal, Info-Werte zählen mit", () => {
  const floor = {
    id: "eg",
    furniture: [
      cab,
      dev("a", "tech_srv_1u", 1, { entity: "sensor.srv_w", info: [{ entity: "sensor.srv_kw", name: null }, { entity: "sensor.srv_temp", name: null }] }),
      dev("b", "tech_ups_2u", 2, { entity: "sensor.ups_w", info: [{ entity: "sensor.srv_w" }] }), // doppelt
      dev("c", "tech_switch_24", 4, { info: [{ entity: "sensor.sw_w" }] }),
    ],
  };
  const hass = { states: states({ "sensor.srv_w": ["100", "W"], "sensor.srv_kw": ["0.2", "kW"], "sensor.srv_temp": ["45", "°C"], "sensor.ups_w": ["25.5", "W"], "sensor.sw_w": ["10", "W"] }) };
  const r = rackPower(floor, cab, hass);
  assert.ok(Math.abs(r.w - (100 + 200 + 25.5 + 10)) < 1e-9, String(r.w));
  assert.deepEqual([...r.ids].sort(), ["sensor.srv_kw", "sensor.srv_w", "sensor.sw_w", "sensor.ups_w"]);
  // Reihenfolge der Entitäten: von oben nach unten (Switch auf HE 4 zuerst)
  assert.deepEqual(rackEntities(floor, cab), ["sensor.sw_w", "sensor.ups_w", "sensor.srv_w", "sensor.srv_kw", "sensor.srv_temp"]);
});

test("Leistungssumme: mW und MW, andere Einheiten und ungültige Werte werden übersprungen", () => {
  const floor = { id: "eg", furniture: [cab, dev("a", "tech_srv_1u", 1, { entity: "sensor.a" }), dev("b", "tech_switch_24", 2, { entity: "sensor.b", info: [{ entity: "sensor.c" }, { entity: "sensor.d" }, { entity: "sensor.e" }, { entity: "sensor.f" }, { entity: "sensor.fehlt" }] })] };
  const hass = { states: states({ "sensor.a": ["500", "mW"], "sensor.b": ["unavailable", "W"], "sensor.c": ["abc", "W"], "sensor.d": ["12", "kWh"], "sensor.e": ["0.001", "MW"], "sensor.f": ["7", null] }) };
  const r = rackPower(floor, cab, hass);
  assert.ok(Math.abs(r.w - (0.5 + 1000)) < 1e-9, String(r.w));
  assert.deepEqual([...r.ids].sort(), ["sensor.a", "sensor.e"]);
});

test("Leistungssumme: ohne gültigen Wert w = null; Schrank selbst und freie Geräte zählen nicht", () => {
  const own = { ...cab, entity: "sensor.schrank_w", info: [{ entity: "sensor.schrank_summe" }] };
  const floor = {
    id: "eg",
    furniture: [
      own,
      dev("a", "tech_srv_1u", 1, { entity: "sensor.kaputt" }),
      { id: "frei", type: "tech_srv_1u", x: 9, z: 9, rotation: 0, entity: "sensor.frei_w" }, // nicht eingebaut
      { id: "fern", type: "tech_srv_1u", in_rack: "c2", rack_u: 1, entity: "sensor.fern_w" }, // anderer Schrank
    ],
  };
  const hass = { states: states({ "sensor.schrank_w": ["999", "W"], "sensor.schrank_summe": ["888", "W"], "sensor.kaputt": ["unavailable", "W"], "sensor.frei_w": ["77", "W"], "sensor.fern_w": ["66", "W"] }) };
  assert.deepEqual(rackPower(floor, own, hass), { w: null, ids: [] });
  // ohne hass, ohne Geräte
  assert.deepEqual(rackPower(floor, own, null), { w: null, ids: [] });
  assert.deepEqual(rackPower({ id: "eg", furniture: [cab] }, cab, hass), { w: null, ids: [] });
  assert.deepEqual(rackPower(null, cab, hass), { w: null, ids: [] });
  // Wert 0 ist gültig: w = 0
  const zero = { states: states({ "sensor.kaputt": ["0", "W"] }) };
  assert.deepEqual(rackPower(floor, own, zero), { w: 0, ids: ["sensor.kaputt"] });
});

test("deviceEntities: Entität und Info-Entitäten ohne Wiederholung, Unsinn wird übersprungen", () => {
  assert.deepEqual(deviceEntities({ entity: "switch.a", info: [{ entity: "sensor.b" }, { entity: "switch.a" }, { entity: "" }, { entity: 5 }, null, { entity: "ohnepunkt" }] }), ["switch.a", "sensor.b"]);
  assert.deepEqual(deviceEntities({ entity: "none" }), []);
  assert.deepEqual(deviceEntities({}), []);
  assert.deepEqual(deviceEntities(null), []);
});
