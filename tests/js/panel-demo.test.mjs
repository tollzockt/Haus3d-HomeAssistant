// Demo-Haus im Panel (panel-demo.js, ohne DOM): Sitzung je Haus, Tippen (demoAction), PV-Schlüssel der Energie-Karte,
// Türen und Fenster im 3D, Export ohne Demo-Kennungen – und nichts davon erreicht das echte hass.
process.env.TZ = "Europe/Berlin";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { DemoMethods } from "../../custom_components/haus3d/frontend/panel-demo.js";
import { buildingLinks, entitiesByArea } from "../../custom_components/haus3d/frontend/devices.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const made = []; // Panels der Tests: Takt (setInterval) nach jedem Test beenden
afterEach(() => {
  for (const p of made.splice(0)) p._demoStop();
});

function building() {
  return {
    version: 1,
    settings: { roof: { type: "gable", pitch: 35, overhang: 0.4, items: [{ id: "pv_s", type: "pv", x: 5, z: 6.5, cols: 4, rows: 2 }] } },
    floors: [{
      id: "eg", elevation: 0, height: 2.5,
      rooms: [{ id: "wz", name: "Wohnzimmer", area_id: null, points: rect(0, 0, 6, 8) }, { id: "ga", name: "Garage", area_id: null, points: rect(6, 0, 10, 8) }],
      openings: [
        { id: "f1", room_id: "wz", edge: 0, offset: 2, width: 1.2, type: "window", contact: null, cover: null },
        { id: "fix", room_id: "wz", edge: 3, offset: 2, width: 1, type: "window", fixed: true, contact: null, cover: null },
        { id: "tor", room_id: "ga", edge: 0, offset: 2, width: 2.5, type: "garage", contact: null, cover: null },
      ],
      furniture: [{ id: "l1", type: "lamp_floor", x: 1, z: 1, entity: null }],
    }],
  };
}

/** Echtes hass: jeder Aufruf wird gezählt, Dienste und callApi dürfen nie ankommen. */
function realHass(b) {
  const calls = [];
  return {
    calls,
    states: { "light.echt": { entity_id: "light.echt", state: "on", attributes: { friendly_name: "Echt" } } },
    entities: { "light.echt": { entity_id: "light.echt", area_id: null } },
    devices: {},
    areas: {},
    config: { latitude: 51, longitude: 10 },
    user: { is_admin: true },
    themes: {},
    callService: async (...a) => calls.push(["service", ...a]),
    callApi: async (...a) => calls.push(["api", ...a]),
    callWS: async (msg) => {
      calls.push(["ws", msg.type]);
      if (msg.type === "haus3d/building/get") return { building: structuredClone(b), revision: 1, demo: true };
      return {};
    },
  };
}

/** Panel-Ersatz mit dem Demo-Mixin (nur das, was die Methoden brauchen). */
async function panel() {
  const real = realHass(building());
  const p = Object.assign(Object.create(null), DemoMethods, {
    _house: { id: "test1", name: "Vorführhaus", live: false, demo: true },
    _realHass: real,
    toasts: [],
    runs: [],
    infos: [],
    _isDemo() {
      return this._house?.demo === true;
    },
    _toast(t) {
      this.toasts.push(t);
    },
    _runAction(id, o) {
      this.runs.push([id, o]);
    },
    _moreInfo(id) {
      this.infos.push(id);
    },
    _closeDialog() {},
    setHass(r) {
      this._hass = this._demoWrap(r);
    },
  });
  made.push(p);
  Object.defineProperty(p, "hass", { set(r) { this.setHass(r); } }); // wie im Panel: onChange setzt hass neu
  p.setHass(real);
  const res = await p._hass.callWS({ type: "haus3d/building/get", house: "test1" });
  p._building = res.building;
  p.setHass(real);
  p._links = buildingLinks(p._building, p._hass, entitiesByArea(p._hass));
  return { p, real };
}

test("Sitzung je Haus: eine DemoHouse je Haus, ein anderes Haus fängt neu an, Beenden räumt auf", async () => {
  const { p, real } = await panel();
  const first = p._demo;
  assert.equal(first.houseId, "test1");
  assert.ok(p._demoTimer);
  p.setHass(real);
  assert.equal(p._demo, first, "gleiches Haus: gleiche Sitzung");
  p._house = { id: "test2", name: "Zwei", live: false, demo: true };
  p.setHass(real);
  assert.notEqual(p._demo, first);
  assert.equal(p._demo.houseId, "test2");
  p._demoReset();
  assert.equal(p._demo, null);
  assert.equal(p._demoTimer, null);
});

test("Tippen: Licht schaltet simuliert, Kontakte schalten um, PV öffnet den PV-Dialog – nichts geht ans echte hass", async () => {
  const { p, real } = await panel();
  const lamp = p._building.floors[0].furniture[0].entity;
  assert.match(lamp, /^light\.h3demo_/);
  const act = p._demoAction(lamp, p._hass.states[lamp], { source: "tap" });
  assert.deepEqual(act.call, ["light", "toggle"]);
  await p._hass.callService(...act.call, { entity_id: lamp });
  assert.equal(p._hass.states[lamp].state, "on");
  const contact = p._links.get("eg").get("f1").contact;
  assert.deepEqual(p._demoAction(contact, p._hass.states[contact]).call, ["binary_sensor", "toggle"]);
  const pv = p._demo.model.sources.find((s) => s.key === "roof:pv_s");
  const pvAct = p._demoAction(pv.entity, p._hass.states[pv.entity]);
  assert.equal(pvAct.dialog, "pv");
  assert.equal(pvAct.key, "roof:pv_s");
  assert.equal(pvAct.call, null);
  // Ertrag des Feldes und Erzeuger der Energie-Karte führen zum selben Dialog
  assert.equal(p._demoPvKey(pv.energyEntity), "roof:pv_s");
  const gen = p._building.settings.energy.sources.find((s) => s.type === "pv");
  assert.equal(p._demoPvKey(gen.power), "roof:pv_s");
  assert.equal(p._demoPvKey("light.echt"), null);
  assert.deepEqual(real.calls.filter(([k]) => k !== "ws"), []);
  assert.deepEqual(real.calls.map(([, t]) => t), ["haus3d/building/get"]);
  p._demoStop();
});

test("Türen und Fenster im 3D: Kontakt umschalten, Garagentor über den Antrieb, gedrückt halten → Demo-Dialog", async () => {
  const { p } = await panel();
  const l = p._links.get("eg");
  p._demoOpening({ floorId: "eg", id: "f1" });
  assert.deepEqual(p.runs.at(-1), [l.get("f1").contact, { source: "tap", name: "Fenster Wohnzimmer", quiet: false }]);
  p._demoOpening({ floorId: "eg", id: "tor" });
  assert.equal(p.runs.at(-1)[0], l.get("tor").cover);
  assert.match(p.runs.at(-1)[0], /^cover\.h3demo_/);
  p._demoOpening({ floorId: "eg", id: "f1" }, { long: true });
  assert.equal(p.infos.at(-1), l.get("f1").cover ?? l.get("f1").contact);
  // festes Fenster: nichts zu öffnen
  const n = p.runs.length;
  p._demoOpening({ floorId: "eg", id: "fix" });
  assert.equal(p.runs.length, n);
  assert.match(p.toasts.at(-1), /^Demo: Fenster Wohnzimmer lässt sich nicht öffnen\.$/);
  // ohne Demo-Sitzung: nichts
  p._demoStop();
  p._demoOpening({ floorId: "eg", id: "f1" });
  assert.equal(p.runs.length, n);
});

test("Export: Demo-Kennungen und eingesetzte Energie-Einstellung kommen nicht mit", async () => {
  const { p } = await panel();
  assert.ok(JSON.stringify(p._building).includes("h3demo"));
  const out = p._demoStrip(p._building);
  assert.ok(!JSON.stringify(out).includes("h3demo"));
  assert.equal(out.settings.energy, undefined);
  p._demoStop();
});
