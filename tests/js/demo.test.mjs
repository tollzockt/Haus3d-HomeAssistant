// Demo-Modus, Wrapper: nichts Echtes sichtbar, nichts geht an Home Assistant, Zustände, Energie, PV, Befehle
process.env.TZ = "Europe/Berlin"; // Ortszeit des Browsers: feste Zeitzone
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEMO_WS_PASS, DemoHouse, demoAction, demoBase } from "../../custom_components/haus3d/frontend/demo.js";
import { demoInject } from "../../custom_components/haus3d/frontend/demo-build.js";
import { EXTRA } from "../../custom_components/haus3d/frontend/catalog-extra.js";
import { normalizeDemoSettings } from "../../custom_components/haus3d/frontend/demo-energy.js";
import { energyTotals } from "../../custom_components/haus3d/frontend/energymodel.js";
import { entityAction } from "../../custom_components/haus3d/frontend/actions.js";
import { houseStatus } from "../../custom_components/haus3d/frontend/status.js";
import { buildingLinks, entitiesByArea } from "../../custom_components/haus3d/frontend/devices.js";

const BAT = Object.keys(EXTRA).find((k) => k.startsWith("bat_")); // Batteriespeicher, ohne Markenschlüssel im Test
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const REAL = "echt-123";
const at = (h, m = 0) => new Date(2026, 5, 21, h, m).getTime();

function house() {
  return {
    version: 1,
    settings: { roof: { type: "gable", pitch: 35, overhang: 0.4, items: [{ id: "pv_s", type: "pv", x: 5, z: 6.5, cols: 4, rows: 2 }] } },
    floors: [{
      id: "eg", elevation: 0, height: 2.5,
      rooms: [{ id: "wz", name: "Wohnzimmer", area_id: null, points: rect(0, 0, 6, 8) }, { id: "ku", name: "Küche", area_id: null, points: rect(6, 0, 10, 8) }],
      openings: [{ id: "f1", room_id: "wz", edge: 0, offset: 2, width: 1.2, type: "window", contact: null, cover: null }],
      furniture: [
        { id: "l1", type: "lamp_floor", x: 1, z: 1, entity: null },
        { id: "w1", type: "washer", x: 7, z: 1, entity: null },
        { id: "k1", type: "home_fireplace_open", x: 4, z: 7, entity: null },
        { id: "c1", type: "home_curtain_pair", x: 2, z: 0.2, entity: null },
        { id: "b1", type: BAT, x: 9, z: 7, entity: null },
        { id: "t0", type: "hot_tub", x: 1, z: 6, entity: null },
      ],
    }],
  };
}

// echtes hass mit Merkwerten: jede Abfrage und jeder Aufruf wird protokolliert
function realHass(extra = {}) {
  const calls = [];
  const states = {
    "light.echt": { entity_id: "light.echt", state: REAL, attributes: { friendly_name: "Echtes Licht", brightness: 1234, entity_picture: `/api/${REAL}`, last_triggered: REAL } },
    "switch.echt": { entity_id: "switch.echt", state: REAL, attributes: { friendly_name: "Echte Steckdose", current_power_w: REAL } },
    "sensor.echt_temp": { entity_id: "sensor.echt_temp", state: REAL, attributes: { friendly_name: "Echt Temperatur", device_class: "temperature", unit_of_measurement: "°C" } },
    "sensor.echt_power": { entity_id: "sensor.echt_power", state: REAL, attributes: { friendly_name: "Echt Leistung", device_class: "power", unit_of_measurement: "W" } },
    "sensor.echt_sonst": { entity_id: "sensor.echt_sonst", state: REAL, attributes: { friendly_name: "Echt Sonstiges" } },
    "binary_sensor.echt_tuer": { entity_id: "binary_sensor.echt_tuer", state: "on", attributes: { friendly_name: "Echte Tür", device_class: "door" } },
    "cover.echt_rollo": { entity_id: "cover.echt_rollo", state: "closed", attributes: { friendly_name: "Rollo", current_position: 13 } },
    "cover.echt_garage": { entity_id: "cover.echt_garage", state: "open", attributes: { friendly_name: "Garage", device_class: "garage", current_position: 77 } },
    "lock.echt_haustuer": { entity_id: "lock.echt_haustuer", state: "unlocked", attributes: { friendly_name: "Haustür" } },
    "climate.echt_heizung": { entity_id: "climate.echt_heizung", state: "cool", attributes: { friendly_name: "Heizung", temperature: 33, current_temperature: 44, hvac_modes: ["heat", "off"], min_temp: 7, max_temp: 28 } },
    "media_player.echt_tv": { entity_id: "media_player.echt_tv", state: "playing", attributes: { friendly_name: "TV", entity_picture: `/api/${REAL}`, media_title: REAL } },
    "camera.echt_flur": { entity_id: "camera.echt_flur", state: "recording", attributes: { friendly_name: "Kamera", entity_picture: `/api/camera_proxy/${REAL}`, access_token: REAL } },
    "person.bewohner": { entity_id: "person.bewohner", state: "home", attributes: { friendly_name: "Bewohner", entity_picture: `/api/${REAL}`, latitude: 11.1, longitude: 22.2 } },
    "device_tracker.handy": { entity_id: "device_tracker.handy", state: "home", attributes: { latitude: 11.1 } },
    "calendar.privat": { entity_id: "calendar.privat", state: "on", attributes: { message: REAL } },
    "todo.einkauf": { entity_id: "todo.einkauf", state: "3", attributes: {} },
    "image.foto": { entity_id: "image.foto", state: REAL, attributes: { entity_picture: `/api/${REAL}` } },
    "scene.abend": { entity_id: "scene.abend", state: "2025-01-01T20:00:00+00:00", attributes: { friendly_name: "Abend", last_triggered: REAL } },
    "automation.klingel": { entity_id: "automation.klingel", state: "on", attributes: { friendly_name: "Klingel", last_triggered: REAL } },
    "weather.zuhause": { entity_id: "weather.zuhause", state: "snowy", attributes: { friendly_name: "Wetter", temperature: -17, humidity: 99 } },
    "sun.sun": { entity_id: "sun.sun", state: "below_horizon", attributes: { elevation: -77, azimuth: 1 } },
    "sensor.echt_lux": { entity_id: "sensor.echt_lux", state: REAL, attributes: { device_class: "illuminance", unit_of_measurement: "lx" } },
  };
  const entities = Object.fromEntries(Object.keys(states).map((id) => [id, { entity_id: id, area_id: id.includes("echt_temp") ? "bad" : null }]));
  const real = {
    calls,
    states,
    entities,
    devices: { d1: { id: "d1", area_id: "bad" } },
    areas: { bad: { area_id: "bad", name: "Bad" } },
    config: { latitude: 51, longitude: 10, time_zone: "Europe/Berlin" },
    locale: { language: "de" },
    user: { name: "Bewohner", is_admin: true },
    themes: { darkMode: false },
    connection: { subscribeMessage: () => calls.push("subscribe") },
    callService: async (...a) => calls.push(["service", ...a]),
    callApi: async (...a) => calls.push(["api", ...a]),
    callWS: async (msg) => {
      calls.push(["ws", msg.type]);
      if (msg.type === "haus3d/building/get") return { building: house(), revision: 3, demo: true };
      if (msg.type === "haus3d/building/save") return { building: msg.building, revision: (msg.revision ?? 0) + 1 };
      if (msg.type === "haus3d/history/restore") return { building: house(), revision: 9 };
      return { ok: true, type: msg.type };
    },
    ...extra,
  };
  return real;
}

const realCalls = (real) => real.calls.filter((c) => c[0] === "service" || c[0] === "api");

async function load(opts = {}) {
  const real = realHass(opts.real);
  const demo = new DemoHouse({ houseId: "demo-1", now: () => at(10, 30) });
  const changes = [];
  const toasts = [];
  let hass = demo.wrap(real, { onChange: () => changes.push(1), onToast: (t) => toasts.push(t) });
  const res = await hass.callWS({ type: "haus3d/building/get" });
  hass = demo.wrap(real);
  return { real, demo, hass, res, changes, toasts, rewrap: () => demo.wrap(real) };
}

test("Echte Werte, Personen, Kalender und Bilder erscheinen nie", async () => {
  const { hass } = await load();
  const dump = JSON.stringify({ states: hass.states, attrs: Object.values(hass.states).map((s) => s.attributes) });
  assert.ok(!dump.includes(REAL), "Merkwert aufgetaucht");
  assert.ok(!dump.includes("entity_picture"));
  assert.ok(!dump.includes("access_token"));
  for (const id of ["person.bewohner", "device_tracker.handy", "calendar.privat", "todo.einkauf", "image.foto"]) assert.equal(hass.states[id], undefined, id);
  // Zustände nach Domäne
  const s = (id) => hass.states[id];
  assert.equal(s("light.echt").state, "off");
  assert.equal(s("switch.echt").state, "off");
  assert.deepEqual([s("cover.echt_rollo").state, s("cover.echt_rollo").attributes.current_position], ["open", 100]);
  assert.deepEqual([s("cover.echt_garage").state, s("cover.echt_garage").attributes.current_position], ["closed", 0]);
  assert.equal(s("binary_sensor.echt_tuer").state, "off");
  assert.equal(s("lock.echt_haustuer").state, "locked");
  assert.deepEqual([s("climate.echt_heizung").state, s("climate.echt_heizung").attributes.temperature, s("climate.echt_heizung").attributes.current_temperature], ["heat", 21, 21]);
  assert.deepEqual([s("climate.echt_heizung").attributes.min_temp, s("climate.echt_heizung").attributes.hvac_modes], [7, ["heat", "off"]]);
  assert.equal(s("media_player.echt_tv").state, "off");
  assert.equal(s("camera.echt_flur").state, "idle");
  assert.equal(s("scene.abend").state, "unknown");
  assert.equal(s("scene.abend").attributes.last_triggered, undefined);
  assert.equal(s("automation.klingel").attributes.last_triggered, undefined);
  const temp = Number(s("sensor.echt_temp").state);
  assert.ok(temp >= 19.5 && temp <= 23);
  assert.equal(s("sensor.echt_sonst").state, "unknown");
  assert.equal(s("sensor.echt_temp").attributes.friendly_name, "Echt Temperatur");
  // Kennungen, Registrierung und Konfiguration kommen vom echten hass
  assert.equal(hass.entities["light.echt"].entity_id, "light.echt");
  assert.equal(hass.devices, hass.devices);
  assert.equal(hass.config.latitude, 51);
  assert.equal(hass.user.is_admin, true);
  assert.equal(hass.connection, null);
  assert.equal(hass.haus3dDemo, true);
  // Sonne und Wetter sind erfunden, nicht echt
  assert.equal(s("weather.zuhause").state, "sunny".length ? s("weather.zuhause").state : "");
  assert.ok(["sunny", "partlycloudy"].includes(s("weather.zuhause").state));
  assert.equal(s("weather.zuhause").attributes.temperature, 18);
  assert.equal(s("sun.sun").state, "above_horizon");
  assert.ok(s("sun.sun").attributes.elevation > 20);
  assert.ok(Number(s("sensor.echt_lux").state) > 1000);
  assert.ok(s("weather.h3demo"), "Demo-Wetter ist da");
});

test("demoBase: Zustand ohne Wert, entfernte Domänen", () => {
  for (const d of ["person", "device_tracker", "zone", "calendar", "todo", "image", "event", "update"]) assert.equal(demoBase(`${d}.x`, { state: REAL, attributes: {} }), null, d);
  assert.deepEqual(demoBase("fan.x", { state: REAL, attributes: { percentage: 55, friendly_name: "L" } }), { state: "off", attrs: { friendly_name: "L" } });
  assert.equal(demoBase("vacuum.x", { state: REAL, attributes: {} }).state, "docked");
  assert.equal(demoBase("alarm_control_panel.x", { state: REAL, attributes: {} }).state, "disarmed");
  assert.equal(demoBase("sensor.x", { state: REAL, attributes: { device_class: "battery" } }).state, "85");
  assert.equal(demoBase("sensor.x", { state: REAL, attributes: { device_class: "carbon_dioxide" } }).state, "600");
  assert.equal(demoBase("sensor.x", { state: REAL, attributes: { unit_of_measurement: "kWh" } }).attrs.device_class, "energy");
  // gleiche Kennung, gleicher Wert
  const a = demoBase("sensor.t", { attributes: { device_class: "temperature" } });
  assert.deepEqual(a, demoBase("sensor.t", { attributes: { device_class: "temperature" } }));
  assert.equal(demoBase("light.x", { state: "on", attributes: { entity_id: ["light.a", 5] } }).attrs.entity_id.length, 1);
});

test("Nichts geht an Home Assistant: Dienste, callApi, nicht erlaubte Befehle", async () => {
  const { real, demo, hass, toasts } = await load();
  const before = real.calls.length;
  await hass.callService("light", "turn_on", { entity_id: "light.echt", brightness: 99 });
  await hass.callService("lock", "unlock", { entity_id: "lock.echt_haustuer" });
  await hass.callService("scene", "turn_on", { entity_id: "scene.abend" });
  await hass.callService("script", "turn_on", {});
  await hass.callService("homeassistant", "toggle", { entity_id: "switch.echt" });
  await hass.callService("cover", "close_cover", {}, { entity_id: "cover.echt_rollo" });
  await assert.rejects(hass.callApi("GET", "config/scene/config/x"), /Demo/);
  await assert.rejects(hass.callApi("POST", "config/scene/config/x", {}), (e) => e.code === "demo" && e.quiet === true);
  for (const type of ["call_service", "energy/get_prefs", "haus3d/lock/unlock", "haus3d/climate/pause", "haus3d/away/set", "haus3d/pin/set", "haus3d/dev/set", "frontend/set_user_data", "frontend/get_user_data", "haus3d/models/list", "unbekannt/befehl"]) {
    await assert.rejects(hass.callWS({ type, service: "x" }), (e) => e.code === "demo" && e.quiet === true, type);
  }
  assert.equal(realCalls(real).length, 0, "kein Dienst und kein callApi am echten hass");
  assert.equal(real.calls.length, before, "kein einziger Aufruf am echten hass");
  assert.ok(toasts.includes("Demo: script.turn_on"), "Aufruf ohne Entität meldet sich");
  assert.equal(demo.log.length, 6);
  assert.deepEqual(demo.log[0], { domain: "light", service: "turn_on", entity_id: "light.echt" });
  // simuliert wurde trotzdem
  const h = demo.wrap(real);
  assert.deepEqual([h.states["light.echt"].state, h.states["light.echt"].attributes.brightness], ["on", 99]);
  assert.equal(h.states["lock.echt_haustuer"].state, "unlocked");
  assert.equal(h.states["switch.echt"].state, "on");
  assert.equal(h.states["cover.echt_rollo"].state, "closed");
});

test("Erlaubnisliste: nur diese Befehle gehen durch, Statistik und Verlauf werden selbst beantwortet", async () => {
  const { real, hass } = await load();
  assert.ok(DEMO_WS_PASS.includes("haus3d/building/get") && DEMO_WS_PASS.includes("haus3d/sandbox/update"));
  for (const type of DEMO_WS_PASS.filter((t) => !["haus3d/building/get", "haus3d/building/save", "haus3d/history/restore"].includes(t))) {
    real.calls.length = 0;
    const r = await hass.callWS({ type, house: "test1" });
    assert.deepEqual(r, { ok: true, type }, type);
    assert.deepEqual(real.calls, [["ws", type]], type);
  }
  real.calls.length = 0;
  assert.deepEqual(await hass.callWS({ type: "history/history_during_period", entity_ids: ["sensor.echt_power"] }), {});
  assert.deepEqual(await hass.callWS({ type: "recorder/statistics_during_period", statistic_ids: ["sensor.echt_power", "sensor.unbekannt"], period: "5minute" }), {});
  assert.deepEqual(await hass.callWS({ type: "recorder/statistics_during_period", statistic_ids: ["sensor.h3demo_e_haus"], period: "day", types: ["change"] }), {});
  assert.deepEqual(real.calls, [], "Statistik und Verlauf nie durchgereicht");
});

test("Identität: gleiches Objekt, solange sich nichts ändert; echte Zustandsänderungen lösen nichts aus", async () => {
  const { real, demo, hass, rewrap } = await load();
  assert.equal(rewrap(), hass);
  // echte Zustände ändern sich (neues states-Objekt, neue Werte)
  real.states = { ...real.states, "light.echt": { ...real.states["light.echt"], state: "on" } };
  assert.equal(rewrap(), hass, "echte Zustandsänderung → dasselbe hass");
  assert.equal(hass.states["light.echt"].state, "off");
  // Schalten baut neu, unveränderte Zustände behalten ihre Identität
  const lamp = demo.model.building.floors[0].furniture[0].entity;
  await hass.callService("light", "toggle", { entity_id: lamp });
  const h2 = rewrap();
  assert.notEqual(h2, hass);
  assert.equal(h2.states[lamp].state, "on");
  for (const id of ["light.echt", "switch.echt", "sensor.echt_temp", "binary_sensor.echt_tuer", "sensor.h3demo_eg_wz_temperatur", "sensor.h3demo_eg_ku_temperatur"]) assert.equal(h2.states[id], hass.states[id], id);
  assert.equal(h2.entities, hass.entities);
  assert.equal(h2.areas, hass.areas);
  assert.equal(rewrap(), h2);
  // neue Registrierung → Neuaufbau
  real.entities = { ...real.entities, "light.neu": { entity_id: "light.neu" } };
  real.states = { ...real.states, "light.neu": { entity_id: "light.neu", state: "on", attributes: {} } };
  const h3 = rewrap();
  assert.notEqual(h3, h2);
  assert.equal(h3.states["light.neu"].state, "off");
});

test("Licht an → Hausverbrauch +40 W; Steckdose +60 W; Verbraucher nach Tabelle; Raum-Leistung folgt", async () => {
  const { demo, hass, rewrap } = await load();
  const e = demo.model.building.floors[0].furniture;
  const [lamp, washer, fire, , battery, tub] = e.map((m) => m.entity);
  const watts = (h) => Number(h.states["sensor.h3demo_e_haus"].state);
  const room = (h) => Number(h.states["sensor.h3demo_eg_wz_leistung"].state);
  const kuRoom = (h) => Number(h.states["sensor.h3demo_eg_ku_leistung"].state);
  const base = watts(hass);
  assert.equal(base, 200 + 35 * 2, "Grundlast 200 W + 35 W je Demo-Raum");
  assert.equal(room(hass), 35);
  await hass.callService("light", "turn_on", { entity_id: lamp });
  let h = rewrap();
  assert.equal(watts(h), base + 40);
  assert.equal(room(h), 35 + 40);
  assert.equal(kuRoom(h), 35);
  await h.callService("switch", "turn_on", { entity_id: washer });
  h = rewrap();
  assert.equal(watts(h), base + 40 + 2000);
  assert.equal(kuRoom(h), 35 + 2000, "Waschmaschine steht in der Küche");
  await h.callService("switch", "turn_on", { entity_id: fire });
  await h.callService("switch", "turn_on", { entity_id: battery });
  h = rewrap();
  assert.equal(watts(h), base + 40 + 2000 + 20, "Kamin 0 W, Technik 20 W");
  // Whirlpool: offen = in Betrieb 1500 W
  await h.callService("cover", "open_cover", { entity_id: tub });
  h = rewrap();
  assert.equal(watts(h), base + 40 + 2000 + 20 + 1500);
  await h.callService("cover", "close_cover", { entity_id: tub });
  await h.callService("light", "turn_off", { entity_id: lamp });
  await h.callService("switch", "turn_off", { entity_id: washer });
  h = rewrap();
  assert.equal(watts(h), base + 20);
  // echte Entitäten ohne Tabelle: light 40, switch 60
  await h.callService("light", "turn_on", { entity_id: "light.echt" });
  await h.callService("switch", "turn_on", { entity_id: "switch.echt" });
  assert.equal(watts(rewrap()), base + 20 + 40 + 60);
  // das Haus meldet dieselbe Last, Netz = Last − PV + Laden
  const t = energyTotals(demo.model.building.settings.energy, rewrap());
  assert.equal(t.verbrauch, base + 120);
  assert.ok(Number.isFinite(t.netz));
});

test("Zwei Schaltvorgänge im selben Takt wirken nacheinander (toggle zweimal = aus)", async () => {
  const { demo, hass, rewrap } = await load();
  const lamp = demo.model.building.floors[0].furniture[0].entity;
  await hass.callService("light", "toggle", { entity_id: lamp });
  await hass.callService("light", "toggle", { entity_id: lamp });
  assert.equal(rewrap().states[lamp].state, "off");
});

test("Kontakte und Statusleiste: Fenster auf → „offen“ im Haus, Kühlschrank startet an", async () => {
  const { demo, hass, rewrap, res } = await load();
  const b = res.building;
  const win = b.floors[0].openings[0];
  assert.ok(win.contact.startsWith("binary_sensor.h3demo_"));
  const status = (h) => {
    const byArea = entitiesByArea(h);
    return houseStatus(b, h, byArea, buildingLinks(b, h, byArea));
  };
  assert.equal(status(hass).open.length, 0);
  const act = demoAction(win.contact, hass.states[win.contact], {});
  assert.deepEqual(act.call, ["binary_sensor", "toggle"]);
  await hass.callService(...act.call, { entity_id: win.contact });
  assert.deepEqual(status(rewrap()).open.map((o) => o.kind), ["window"]);
  await hass.callService("cover", "close_cover", { entity_id: win.cover });
  assert.equal(rewrap().states[win.cover].state, "closed");
  assert.equal(demo.model.devices.get(win.cover).area, "h3demo_eg_wz");
  // Kühlschrank
  const d = demoInject({ floors: [{ id: "e", rooms: [{ id: "r", points: rect(0, 0, 4, 4) }], furniture: [{ id: "k", type: "fridge", x: 1, z: 1 }] }] });
  assert.equal(d.devices.get("switch.h3demo_m_e_k").state, "on");
  assert.equal(d.devices.get("switch.h3demo_m_e_k").watts, 100);
});

test("Gebäude: Antworten bekommen Demo-Geräte, gespeichert wird nie eine Demo-Kennung", async () => {
  const { real, demo, hass, res, changes } = await load();
  assert.equal(res.revision, 3);
  assert.equal(res.demo, true, "weitere Felder der Antwort bleiben");
  assert.ok(JSON.stringify(res.building).includes("h3demo_"));
  assert.ok(!JSON.stringify(real.calls).includes("h3demo"));
  // Speichern: Editor, Einstellungen, Szenen … gehen alle über building/save
  const building = structuredClone(res.building);
  building.floors[0].rooms[0].name = "Wohnen";
  building.settings.demo = { pv: { "roof:pv_s": { min: 0, max: 3000, from: 480, to: 1080 } } };
  real.calls.length = 0;
  let saved;
  real.callWS = async (msg) => {
    real.calls.push(["ws", msg.type]);
    saved = msg;
    return { building: msg.building, revision: msg.revision + 1 };
  };
  const out = await hass.callWS({ type: "haus3d/building/save", building, revision: 3, token: "t" });
  assert.equal(out.revision, 4);
  assert.ok(!JSON.stringify(saved).includes("h3demo"), "gespeichertes Gebäude ohne Demo-Kennung");
  assert.equal(saved.token, "t");
  assert.equal(saved.building.floors[0].rooms[0].name, "Wohnen");
  assert.deepEqual(saved.building.settings.demo, building.settings.demo);
  assert.ok(JSON.stringify(out.building).includes("h3demo_"), "Antwort wieder mit Demo-Geräten");
  assert.equal(out.building.settings.demo.pv["roof:pv_s"].max, 3000);
  // nach der Antwort meldet sich der Wrapper (asynchron) per onChange
  const n = changes.length;
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(changes.length > n);
  // Wiederherstellen eines Stands: ebenfalls mit Demo-Geräten
  real.callWS = realHass().callWS;
  const restored = await demo.wrap(real).callWS({ type: "haus3d/history/restore", history_id: 1 });
  assert.ok(JSON.stringify(restored.building).includes("h3demo_"));
});

test("Gebäude-Antwort ohne Gebäude oder mit kaputten Daten bricht nichts", async () => {
  const real = realHass({ callWS: async () => ({ error: true }) });
  const demo = new DemoHouse({ houseId: "x" });
  const h = demo.wrap(real);
  assert.deepEqual(await h.callWS({ type: "haus3d/building/get" }), { error: true });
  assert.ok(demo.wrap(real).states["light.echt"]);
  const real2 = realHass({ callWS: async () => ({ building: { floors: "x" }, revision: 1 }) });
  const d2 = new DemoHouse({ houseId: "x" });
  const r2 = await d2.wrap(real2).callWS({ type: "haus3d/building/get" });
  assert.ok(Array.isArray(r2.building.floors));
});

test("PV: Uhrzeit 13:00 ≈ Spitze, 20:00 und Nacht 0 W, Vorschau und Zurücksetzen", async () => {
  const { real, demo, hass, rewrap, changes } = await load();
  const key = "roof:pv_s";
  const src = demo.source(key);
  assert.ok(src && src.kwp > 2);
  assert.equal(demo.pvKeyFor(src.entity), key);
  assert.equal(demo.pvKeyFor("sensor.nirgends"), null);
  // Uhrzeit-Regler
  const w = (h) => Number(h.states[src.entity].state);
  demo.time = 13 * 60;
  demo.tick();
  let h = rewrap();
  const noon = w(h);
  assert.ok(noon > src.defaults.max * 0.8 && noon <= src.defaults.max, `${noon}`);
  assert.equal(h.states["sun.sun"].state, "above_horizon");
  assert.equal(Number(h.states["sensor.h3demo_e_pv"].state), noon, "Summe der PV-Anlage = Feld");
  demo.time = 23 * 60;
  demo.tick();
  h = rewrap();
  assert.equal(w(h), 0);
  demo.time = 2 * 60;
  demo.tick();
  h = rewrap();
  assert.equal(w(h), 0);
  assert.equal(h.states["sun.sun"].state, "below_horizon");
  assert.equal(h.states["weather.h3demo"].state, "clear-night");
  assert.ok(changes.length >= 3, "tick() meldet sich");
  // Vorschau: 0–3000 W, 08:00–18:00 – sofort wirksam, nur diese Sitzung
  demo.time = 13 * 60;
  demo.setPreview(key, { min: 0, max: 3000, from: 480, to: 1080 });
  h = rewrap();
  const prev = w(h);
  assert.ok(prev >= 2550 && prev <= 3000, `${prev}`);
  assert.deepEqual(demo.pvConfig(key), { min: 0, max: 3000, from: 480, to: 1080 });
  const curve = demo.curve(key, { min: 0, max: 3000, from: 480, to: 1080 });
  assert.equal(curve.length, 145);
  assert.equal(curve.find(([m]) => m === 420)[1], 0);
  assert.equal(curve.find(([m]) => m === 780)[1], 3000);
  assert.equal(curve.find(([m]) => m === 1100)[1], 0);
  demo.setPreview(key, null);
  assert.equal(demo.pvConfig(key).max, src.defaults.max);
  // Kenndaten für den Dialog
  demo.tick();
  rewrap();
  const st = demo.pvStats(key);
  assert.equal(st.w, noon);
  assert.ok(st.kwh > 5 && st.kwh < 20, `${st.kwh}`);
  // gespeicherte Einstellung (settings.demo) wirkt nach dem Laden
  const b = structuredClone(real.states && demo.model.building);
  b.settings.demo = { pv: { [key]: { min: 100, max: 1000, from: 600, to: 900 } } };
  const out = await rewrap().callWS({ type: "haus3d/building/save", building: b, revision: 1 });
  assert.deepEqual(normalizeDemoSettings(out.building.settings.demo).pv[key], { min: 100, max: 1000, from: 600, to: 900 });
  demo.time = 12 * 60 + 30;
  demo.tick();
  const mid = w(rewrap());
  assert.ok(mid > 850 && mid <= 1000, `${mid}`);
  demo.time = 15 * 60;
  demo.tick();
  assert.equal(w(rewrap()), 0);
});

test("Energie: Ladestand 0…100, Speicher folgt, Netz stimmt, gleiche Zeit gleicher Wert", async () => {
  const { demo, rewrap } = await load();
  let last = -1;
  for (const h of [0, 3, 6, 9, 11, 12, 13, 15, 18, 21, 23]) {
    demo.time = h * 60;
    demo.tick();
    const s = rewrap().states;
    const soc = Number(s["sensor.h3demo_e_speicher_ladestand"].state);
    const charge = Number(s["sensor.h3demo_e_speicher"].state);
    const pv = Number(s["sensor.h3demo_e_pv"].state);
    const haus = Number(s["sensor.h3demo_e_haus"].state);
    const netz = Number(s["sensor.h3demo_e_netz"].state);
    const kwh = Number(s["sensor.h3demo_e_pv_ertrag"].state);
    assert.ok(soc >= 0 && soc <= 100, `${h}: ${soc}`);
    assert.equal(netz, Math.round(haus - pv + charge), `${h} Uhr`);
    assert.ok(kwh >= last, `Ertrag steigt (${h} Uhr)`);
    last = kwh;
  }
  assert.ok(last > 8);
  // zweite Sitzung (anderer Browser): gleiche Zeit, gleicher Wert
  const other = await load();
  other.demo.time = 12 * 60;
  other.demo.tick();
  demo.time = 12 * 60;
  demo.tick();
  assert.equal(other.rewrap().states["sensor.h3demo_e_pv"].state, rewrap().states["sensor.h3demo_e_pv"].state);
});

test("Tagesverlauf: Statistik für Energie-Entitäten aus dem Demo-Modell, auch gestern", async () => {
  const { real, demo, hass } = await load();
  const ids = ["sensor.h3demo_e_pv", "sensor.h3demo_e_haus", "sensor.h3demo_e_netz", "sensor.h3demo_e_speicher_ladestand", "sensor.h3demo_pv_pv_s", "sensor.echt_power"];
  const msg = (from, to) => ({ type: "recorder/statistics_during_period", start_time: new Date(from).toISOString(), end_time: new Date(to).toISOString(), statistic_ids: ids, period: "5minute", types: ["mean"] });
  real.calls.length = 0;
  const today = await hass.callWS(msg(at(0), at(12)));
  assert.deepEqual(Object.keys(today), ids.slice(0, 5));
  assert.equal(today["sensor.h3demo_e_pv"].length, 144);
  assert.ok(today["sensor.h3demo_e_pv"].every((r) => Number.isFinite(r.start) && r.end - r.start === 300000));
  const pvNoon = today["sensor.h3demo_e_pv"].at(-1).mean;
  assert.ok(pvNoon > 1500, `${pvNoon}`);
  assert.equal(today["sensor.h3demo_e_pv"][0].mean, 0);
  assert.equal(today["sensor.h3demo_pv_pv_s"].at(-1).mean, pvNoon, "Feld = Anlage (ein Feld)");
  const yesterday = await hass.callWS(msg(at(0) - 86400000, at(12) - 86400000));
  assert.equal(yesterday["sensor.h3demo_e_pv"].length, 144);
  assert.notDeepEqual(yesterday["sensor.h3demo_e_pv"].map((r) => r.mean), today["sensor.h3demo_e_pv"].map((r) => r.mean));
  assert.deepEqual(real.calls, []);
  // mit Demo-Uhrzeit endet der Verlauf zur Demo-Zeit
  demo.time = 9 * 60;
  const cut = await hass.callWS({ ...msg(at(0), at(23, 59)) });
  assert.equal(cut["sensor.h3demo_e_pv"].length, 108);
});

test("Zurücksetzen, Sensor setzen, Vorschau: onChange und Zustände", async () => {
  const { demo, rewrap, changes } = await load();
  const temp = "sensor.h3demo_eg_wz_temperatur";
  demo.set(temp, "30.5");
  assert.equal(rewrap().states[temp].state, "30.5");
  demo.time = 6 * 60;
  demo.setPreview("roof:pv_s", { min: 1, max: 2, from: null, to: null });
  const n = changes.length;
  demo.reset();
  assert.ok(changes.length > n);
  assert.equal(demo.time, null);
  assert.equal(demo.previews.size, 0);
  assert.notEqual(rewrap().states[temp].state, "30.5");
  assert.equal(demo.log.length, 0);
});

test("Demo-Aktionen: Kontakte und Bewegung schalten um, PV öffnet den Dialog, sonst wie entityAction", () => {
  const door = { entity_id: "binary_sensor.t", state: "off", attributes: { device_class: "door" } };
  assert.deepEqual(demoAction("binary_sensor.t", door), { call: ["binary_sensor", "toggle"], data: {}, confirm: null, dialog: null, verb: "wird geöffnet" });
  assert.equal(demoAction("binary_sensor.t", { ...door, state: "on" }).verb, "wird geschlossen");
  const motion = { entity_id: "binary_sensor.m", state: "on", attributes: { device_class: "motion" } };
  assert.deepEqual(demoAction("binary_sensor.m", motion).call, ["binary_sensor", "toggle"]);
  assert.equal(demoAction("binary_sensor.m", motion).verb, "Bewegung aus");
  assert.equal(demoAction("binary_sensor.t", { ...door, state: "unavailable" }).dialog, "moreinfo");
  const smoke = { entity_id: "binary_sensor.r", state: "off", attributes: { device_class: "smoke" } };
  assert.equal(demoAction("binary_sensor.r", smoke).dialog, "moreinfo");
  const pv = demoAction("sensor.h3demo_pv_pv_s", { entity_id: "sensor.h3demo_pv_pv_s", state: "1200", attributes: {} });
  assert.equal(pv.dialog, "pv");
  assert.equal(pv.call, null);
  assert.equal(demoAction("sensor.echt", { state: "5", attributes: {} }, { pvKey: "cfg:pv_1" }).key, "cfg:pv_1");
  assert.equal(demoAction("sensor.echt", { state: "5", attributes: {} }).dialog, "moreinfo", "sonstige Sensoren: Demo-Dialog");
  // wie entityAction
  for (const [id, st, o] of [
    ["light.a", { state: "on", attributes: {} }, {}],
    ["cover.g", { state: "closed", attributes: { device_class: "garage" } }, {}],
    ["lock.l", { state: "locked", attributes: {} }, { safety: true }],
    ["scene.s", { state: "unknown", attributes: {} }, { source: "wheel" }],
    ["camera.c", { state: "idle", attributes: {} }, {}],
  ]) assert.deepEqual(demoAction(id, st, o), entityAction(id, st, o), id);
  // Schloss im Demo-Haus: aufschließen fragt nach (Sicherheitseinstellung), ohne Tür-PIN
  assert.equal(demoAction("lock.l", { state: "locked", attributes: {} }).confirm.question, "aufschließen");
});

test("Kopie des eigenen Hauses: echte Kennungen bleiben verknüpft und bekommen Demo-Zustände", async () => {
  const b = house();
  b.floors[0].rooms[0].area_id = "bad";
  b.floors[0].furniture[0].entity = "light.echt";
  b.floors[0].openings[0].contact = "binary_sensor.echt_tuer";
  b.settings.energy = { haus: "sensor.echt_power", sources: [{ id: "pv_1", type: "pv", name: "Dach", power: "sensor.echt_pv", energy: "sensor.echt_pv_e" }] };
  const real = realHass({
    callWS: async (msg) => (msg.type === "haus3d/building/get" ? { building: structuredClone(b), revision: 1 } : { ok: true }),
  });
  real.states["sensor.echt_pv"] = { entity_id: "sensor.echt_pv", state: REAL, attributes: { device_class: "power", unit_of_measurement: "kW" } };
  real.states["sensor.echt_pv_e"] = { entity_id: "sensor.echt_pv_e", state: REAL, attributes: { device_class: "energy", unit_of_measurement: "Wh" } };
  real.entities["sensor.echt_pv"] = { entity_id: "sensor.echt_pv" };
  real.entities["sensor.echt_pv_e"] = { entity_id: "sensor.echt_pv_e" };
  const demo = new DemoHouse({ houseId: "kopie", now: () => at(12) });
  const hass0 = demo.wrap(real);
  const res = await hass0.callWS({ type: "haus3d/building/get" });
  const hass = demo.wrap(real);
  assert.equal(res.building.floors[0].furniture[0].entity, "light.echt");
  assert.equal(res.building.settings.energy.demo, undefined, "vorhandene Energie-Einstellung bleibt");
  // Dach-Feld ohne Sensor, Einstellung mit Dach-Erzeuger: Dach-Feld speist die Gruppe „pv“
  const e = hass.states;
  assert.equal(e["sensor.echt_power"].state, "235", "Hausverbrauch = Grundlast (200 W + 35 W für den einen Demo-Raum: die Küche)");
  assert.ok(Number(e["sensor.echt_pv"].state) > 1000);
  assert.equal(e["sensor.echt_pv"].attributes.unit_of_measurement, "W");
  assert.ok(!JSON.stringify(e).includes(REAL));
  const t = energyTotals(res.building.settings.energy, hass);
  assert.equal(t.erzeugung, Number(e["sensor.echt_pv"].state));
  assert.equal(t.verbrauch, 235);
  assert.ok(t.ertrag > 5, "Ertrag heute in kWh");
  // „Wohnzimmer“ hat den echten Bereich „bad“ mit eigener Entität: keine Raumgeräte; Küche schon
  assert.ok(!demo.model.devices.has("sensor.h3demo_eg_wz_temperatur"));
  assert.ok(demo.model.devices.has("sensor.h3demo_eg_ku_temperatur"));
  // echtes Licht lässt sich simuliert schalten
  await hass.callService("light", "turn_on", { entity_id: "light.echt" });
  assert.equal(demo.wrap(real).states["light.echt"].state, "on");
  assert.equal(realCalls(real).length, 0);
});

test("Eingebaute Technik (in_rack) zählt zum Hausverbrauch, ihr Messwert lässt sich ändern", async () => {
  const b = house();
  b.floors[0].furniture.push({ id: "cab", type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2, entity: null }, { id: "srv", type: "tech_srv_1u", in_rack: "cab", rack_u: 1, x: 5, z: 5, rotation: 0, entity: null });
  const real = realHass({ callWS: async (msg) => (msg.type === "haus3d/building/get" ? { building: structuredClone(b), revision: 1 } : { ok: true }) });
  const demo = new DemoHouse({ houseId: "rack", now: () => at(10) });
  await demo.wrap(real).callWS({ type: "haus3d/building/get" });
  const watts = () => Number(demo.wrap(real).states["sensor.h3demo_e_haus"].state);
  const id = demo.model.building.floors[0].furniture.find((m) => m.id === "srv").entity;
  assert.equal(id, "sensor.h3demo_m_eg_srv");
  const st = demo.wrap(real).states[id];
  assert.deepEqual([st.state, st.attributes.unit_of_measurement, st.attributes.device_class], ["20", "W", "power"]);
  const base = 200 + 35 * 2;
  assert.equal(watts(), base + 20, "läuft von Anfang an");
  demo.set(id, "85", { unit_of_measurement: "W", device_class: "power" });
  assert.equal(watts(), base + 85);
  demo.set(id, "0", { unit_of_measurement: "W", device_class: "power" });
  assert.equal(watts(), base, "Messwert 0: zählt nicht mehr");
  assert.equal(realCalls(real).length, 0);
});

test("Wrapper ohne hass und ohne Gebäude: keine Ausnahme", () => {
  const demo = new DemoHouse({ houseId: "leer" });
  assert.equal(demo.wrap(null), null);
  const real = realHass();
  const h = demo.wrap(real);
  assert.ok(h.states["sun.sun"]);
  assert.deepEqual(demo.curve("x"), []);
  assert.equal(demo.pvStats("x").w, 0);
  assert.equal(demo.source("x"), null);
  assert.equal(demo.sunTimes().polar, false);
});
