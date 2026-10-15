// Demo-Modus, Gebäude-Ansicht: Demo-Geräte einsetzen und wieder bereinigen, Gerätearten, PV-Quellen
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEMO_PREFIX, demoInject, demoKind, demoLabel, demoSources, demoStrip, isDemoId } from "../../custom_components/haus3d/frontend/demo-build.js";
import { EXTRA } from "../../custom_components/haus3d/frontend/catalog-extra.js";
import { buildingIcons, buildingLinks, entitiesByArea } from "../../custom_components/haus3d/frontend/devices.js";
import { FURNITURE, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { normalizeEnergy } from "../../custom_components/haus3d/frontend/energymodel.js";
import { rackLedKind, rackPower } from "../../custom_components/haus3d/frontend/rack-live.js";
import { EnergyCfgMethods } from "../../custom_components/haus3d/frontend/panel-energycfg.js";
import { houseStatus } from "../../custom_components/haus3d/frontend/status.js";
import { roofItemsAll } from "../../custom_components/haus3d/frontend/roofunits.js";

const sample = JSON.parse(readFileSync(new URL("../../custom_components/haus3d/haus-daten.json", import.meta.url), "utf8"));
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const clone = (v) => structuredClone(v);
// Gerätegruppen des Katalogs ohne Markenschlüssel im Test: jeweils der erste Typ mit dem Präfix
const first = (prefix) => Object.keys(EXTRA).find((k) => k.startsWith(prefix));
const [BAT, MICRO, INV, CONSOLE, WALLBOX] = ["bat_", "micro_", "inv_", "console_", "wallbox_"].map(first);

// kleines Haus: zwei Räume, Fenster/Tür, Möbel mit und ohne Gerät, Dach mit zwei PV-Feldern
function house() {
  return {
    version: 1,
    settings: { wall_exterior: 0.24, wall_interior: 0.12, roof: { type: "gable", pitch: 35, overhang: 0.4, items: [{ id: "pv_s", type: "pv", x: 5, z: 6.5, cols: 4, rows: 2 }, { id: "pv_n", type: "pv", x: 5, z: 1.5, cols: 3, rows: 1, wp: 450 }] } },
    floors: [
      {
        id: "eg", elevation: 0, height: 2.5,
        rooms: [{ id: "wz", name: "Wohnzimmer", area_id: null, points: rect(0, 0, 6, 8) }, { id: "ku", name: "Küche", area_id: null, points: rect(6, 0, 10, 8) }],
        openings: [
          { id: "f1", room_id: "wz", edge: 0, offset: 2, width: 1.2, type: "window", sill: 1, height: 1.2, contact: null, cover: null },
          { id: "t1", room_id: "wz", edge: 1, offset: 2, width: 0.9, type: "door", height: 2, contact: null, cover: null },
        ],
        furniture: [
          { id: "l1", type: "lamp_floor", x: 1, z: 1, entity: null },
          { id: "l2", type: "lamp_ceiling", x: 8, z: 4, entity: null },
          { id: "w1", type: "washer", x: 7, z: 1, entity: null },
          { id: "c1", type: "home_curtain_pair", x: 2, z: 0.2, entity: null },
          { id: "k1", type: "home_fireplace_open", x: 4, z: 7, entity: null },
          { id: "s1", type: "tech_switch", x: 0.1, z: 3, entity: null },
          { id: "b1", type: BAT, x: 9, z: 7, entity: null },
          { id: "m1", type: MICRO, x: 9.5, z: 1, entity: null },
          { id: "p1", type: "pv_balcony", x: 5, z: 0.1, entity: null },
          { id: "p2", type: "pv_flat_south", x: 3, z: 7, entity: null },
          { id: "t0", type: "hot_tub", x: 1, z: 6, entity: null },
          { id: "sofa", type: "sofa", x: 3, z: 4, entity: null },
        ],
      },
    ],
  };
}

test("Demo-Kennungen erkennen", () => {
  assert.equal(DEMO_PREFIX, "h3demo_");
  for (const v of ["h3demo_eg_wz", "light.h3demo_eg_wz_licht", "binary_sensor.h3demo_o_eg_f1", "weather.h3demo"]) assert.ok(isDemoId(v), v);
  for (const v of ["light.kueche", "sensor.my_h3demo_x", "", null, undefined, 5, "h3demox", "Light.h3demo_x"]) assert.ok(!isDemoId(v), String(v));
});

test("Gerätearten: Lampen, LED, Verbraucher, Kamin, Whirlpool, Schalter, PV", () => {
  assert.deepEqual([demoKind("lamp_floor").kind, demoKind("lamp_floor").watts], ["light", 40]);
  assert.deepEqual([demoKind("led_strip").kind, demoKind("led_strip").watts], ["light", 15]);
  assert.deepEqual([demoKind("washer").watts, demoKind("dryer").watts, demoKind("dishwasher").watts, demoKind("stove").watts], [2000, 2200, 1800, 2500]);
  assert.deepEqual([demoKind("fridge").watts, demoKind("fridge").on, demoKind("washer").on], [100, true, undefined]);
  assert.deepEqual([demoKind("tv_wall").watts, demoKind("gaming_pc").watts, demoKind("wallbox").watts], [120, 300, 7400]);
  assert.equal(demoKind(CONSOLE).watts, 150);
  assert.deepEqual([demoKind("home_fireplace_open").kind, demoKind("home_fireplace_open").watts], ["fire", 0]);
  assert.deepEqual([demoKind("hot_tub").domain, demoKind("hot_tub").watts], ["cover", 1500]);
  assert.deepEqual([demoKind("home_curtain_pair").domain, demoKind("home_curtain_pair").cls], ["cover", "curtain"]);
  assert.deepEqual([demoKind("tech_socket").domain, demoKind("tech_socket").watts], ["switch", 60]);
  assert.equal(demoKind("tech_switch").link, "light");
  assert.equal(demoKind("tech_blind_switch").link, "cover");
  assert.equal(demoKind("radiator").domain, "climate");
  assert.equal(demoKind(MICRO).kind, "bkw");
  assert.equal(demoKind("pv_flat_south").kind, "pv");
  assert.equal(demoKind("pv_balcony").group, "bkw");
  for (const t of ["sofa", "table", "custom_box", "tree", "", undefined]) assert.equal(demoKind(t), null, String(t));
});

test("Abdeckungs-Wächter: jeder Katalogtyp mit Leuchtmitteln oder Zustandsmodell hat eine Geräteart", () => {
  const M = furnitureMaterials("standard");
  const missing = [];
  let checked = 0;
  for (const [type, [, w, d, h]] of Object.entries(FURNITURE)) {
    const g = buildFurniture({ id: type, type, x: 0, z: 0, rotation: 0, w, d, h }, M, 0, 2.5);
    const live = g.userData.bulbs?.length > 0 || typeof g.userData.onState === "function";
    if (live) checked++;
    if (live && !demoKind(type)) missing.push(type);
  }
  assert.ok(checked > 150, `${checked} Typen geprüft`);
  assert.deepEqual(missing, []);
});

test("Namen: eigener Name, sonst allgemein – keine Hersteller- oder Produktnamen", () => {
  assert.equal(demoLabel("washer"), "Waschmaschine");
  assert.equal(demoLabel("lamp_floor", { name: "Leselampe" }), "Leselampe");
  assert.equal(demoLabel(WALLBOX), "Wallbox");
  assert.equal(demoLabel(INV), "Wechselrichter");
  assert.equal(demoLabel(BAT), "Batteriespeicher");
  assert.equal(demoLabel(MICRO), "Balkonkraftwerk");
  assert.equal(demoLabel(CONSOLE), "Spielkonsole");
  // Markenwörter aus den Typschlüsseln der Gerätegruppen (erstes Wort hinter dem Präfix): keines darf im Anzeigenamen stehen
  const words = new Set(Object.keys(EXTRA).filter((k) => /^(bat|micro|inv|console|wallbox|ikea)_/.test(k)).map((k) => k.split("_")[1]).filter((w) => w.length > 2 && w !== "switch"));
  assert.ok(words.size > 20, `${words.size} Markenwörter`);
  const brands = new RegExp(`\\b(${[...words].join("|")})\\b`, "i");
  for (const type of Object.keys(FURNITURE)) {
    const k = demoKind(type);
    if (k) assert.doesNotMatch(demoLabel(type, null, k), brands, type);
  }
});

test("Einsetzen: Bereiche, Raumgeräte, Öffnungen, Möbel – nur wo nichts verknüpft ist", () => {
  const b = house();
  const r = demoInject(b);
  assert.deepEqual(b, house(), "Eingabe bleibt unverändert");
  const f = r.building.floors[0];
  assert.deepEqual(f.rooms.map((x) => x.area_id), ["h3demo_eg_wz", "h3demo_eg_ku"]);
  assert.deepEqual(Object.keys(r.areas), ["h3demo_eg_wz", "h3demo_eg_ku"]);
  assert.equal(r.areas.h3demo_eg_wz.name, "Wohnzimmer");
  const d = r.devices;
  // Wohnzimmer: Lampe im Raum → kein Raumlicht; Küche: ebenfalls eine Lampe → kein Raumlicht
  assert.ok(!d.has("light.h3demo_eg_wz_licht") && !d.has("light.h3demo_eg_ku_licht"));
  for (const room of ["wz", "ku"]) {
    for (const [what, domain] of [["temperatur", "sensor"], ["feuchte", "sensor"], ["bewegung", "binary_sensor"], ["leistung", "sensor"]]) assert.ok(d.has(`${domain}.h3demo_eg_${room}_${what}`), `${room} ${what}`);
  }
  assert.equal(d.get("binary_sensor.h3demo_eg_wz_bewegung").attrs.device_class, "motion");
  assert.equal(d.get("sensor.h3demo_eg_wz_leistung").dyn, "roomPower");
  const t = Number(d.get("sensor.h3demo_eg_wz_temperatur").state);
  assert.ok(t >= 19.5 && t <= 23, `${t}`);
  const h = Number(d.get("sensor.h3demo_eg_ku_feuchte").state);
  assert.ok(h >= 45 && h <= 58);
  // Öffnungen
  const [win, door] = f.openings;
  assert.equal(win.contact, "binary_sensor.h3demo_o_eg_f1");
  assert.equal(d.get(win.contact).attrs.device_class, "window");
  assert.equal(d.get(win.contact).area, null, "Kontakt ohne Bereich");
  assert.equal(win.cover, "cover.h3demo_o_eg_f1");
  assert.deepEqual([d.get(win.cover).state, d.get(win.cover).attrs.device_class, d.get(win.cover).area], ["open", "shutter", "h3demo_eg_wz"]);
  assert.equal(door.contact, "binary_sensor.h3demo_o_eg_t1");
  assert.equal(d.get(door.contact).attrs.device_class, "door");
  assert.equal(door.cover, null, "Zimmertür ohne Rollladen");
  // Möbel
  const by = Object.fromEntries(f.furniture.map((m) => [m.id, m.entity]));
  assert.equal(by.l1, "light.h3demo_m_eg_l1");
  assert.equal(d.get(by.l1).area, "h3demo_eg_wz", "Lampe mit Bereich (Symbol an der Lampe)");
  assert.equal(by.w1, "switch.h3demo_m_eg_w1");
  assert.equal(d.get(by.w1).watts, 2000);
  assert.equal(d.get(by.w1).area, null, "Verbraucher ohne Bereich");
  assert.deepEqual([d.get(by.c1).state, d.get(by.c1).attrs.device_class, d.get(by.c1).attrs.current_position], ["open", "curtain", 100]);
  assert.equal(d.get(by.k1).domain, "switch");
  assert.deepEqual([d.get(by.t0).domain, d.get(by.t0).state, d.get(by.t0).watts], ["cover", "closed", 1500]);
  assert.equal(by.s1, by.l1, "Lichtschalter zeigt auf die Lampe im Raum");
  assert.equal(by.sofa, null);
  assert.equal(d.get(by.b1).kind, "tech");
});

test("Einsetzen: Verknüpftes bleibt, „none“ bleibt, nichts wird überschrieben", () => {
  const b = house();
  const f = b.floors[0];
  f.rooms[0].area_id = "wohnzimmer";
  f.rooms[1].area_id = "none";
  f.openings[0].contact = "binary_sensor.echt";
  f.openings[0].cover = "none";
  f.furniture[0].entity = "light.echt";
  f.furniture[1].entity = "none";
  b.settings.weather = "weather.zuhause";
  b.settings.energy = { haus: "sensor.haus_echt", sources: [{ id: "pv_1", type: "pv", power: "sensor.pv_echt" }] };
  b.settings.roof.items[0].entity = "sensor.dach_echt";
  const realEntities = Object.fromEntries(["binary_sensor.echt", "light.echt"].map((id) => [id, { entity_id: id }])); // gibt es im echten hass
  const r = demoInject(b, { realEntities });
  const o = r.building.floors[0];
  assert.equal(o.rooms[0].area_id, "wohnzimmer");
  assert.equal(o.rooms[1].area_id, "none");
  assert.equal(o.openings[0].contact, "binary_sensor.echt");
  assert.equal(o.openings[0].cover, "none");
  assert.equal(o.furniture[0].entity, "light.echt");
  assert.equal(o.furniture[1].entity, "none");
  assert.equal(r.building.settings.weather, "weather.zuhause");
  assert.deepEqual(r.building.settings.energy, b.settings.energy);
  assert.equal(roofItemsAll(r.building)[0].item.entity, "sensor.dach_echt");
  // Raum mit Bereich ohne echte Geräte bekommt Raumgeräte im vorhandenen Bereich; „none“-Raum keine
  assert.equal(r.devices.get("sensor.h3demo_eg_wz_temperatur").area, "wohnzimmer");
  assert.ok(![...r.devices.keys()].some((id) => id.includes("_ku_")));
  assert.deepEqual(Object.keys(r.areas), []);
  // gleiche Eingabe, gleiches Ergebnis
  assert.deepEqual(demoInject(b, { realEntities }).building, r.building);
  assert.ok(!JSON.stringify(r.building).includes("h3demo_link"), "nichts ersetzt, nichts gemerkt");
});

test("Echte Geräte im Bereich: Raum bekommt keine Raumgeräte, echte Kontakte und Rollläden werden erkannt", () => {
  const b = house();
  b.floors[0].rooms[0].area_id = "wohnzimmer";
  b.floors[0].furniture = [];
  const realEntities = {
    "light.wz_decke": { entity_id: "light.wz_decke", area_id: "wohnzimmer" },
    "binary_sensor.wz_fenster": { entity_id: "binary_sensor.wz_fenster", area_id: "wohnzimmer" },
    "cover.wz_rollo": { entity_id: "cover.wz_rollo", area_id: "wohnzimmer" },
  };
  const realStates = {
    "light.wz_decke": { entity_id: "light.wz_decke", state: "off", attributes: {} },
    "binary_sensor.wz_fenster": { entity_id: "binary_sensor.wz_fenster", state: "off", attributes: { device_class: "window" } },
    "cover.wz_rollo": { entity_id: "cover.wz_rollo", state: "open", attributes: { device_class: "shutter" } },
  };
  const r = demoInject(b, { realEntities, realStates });
  const win = r.building.floors[0].openings[0];
  assert.equal(win.contact, null, "echter Kontakt wird automatisch verknüpft – nicht überdecken");
  assert.equal(win.cover, null);
  assert.ok(![...r.devices.keys()].some((id) => id.includes("_wz_")), "Wohnzimmer hat eigene Geräte");
  assert.ok(r.devices.has("sensor.h3demo_eg_ku_temperatur"));
  const hass = { states: realStates, entities: realEntities };
  assert.equal(buildingLinks(r.building, hass, entitiesByArea(hass)).get("eg").get("f1").contact, "binary_sensor.wz_fenster");
  // Tür ohne echten Kontakt bekommt einen Demo-Kontakt
  assert.equal(r.building.floors[0].openings[1].contact, "binary_sensor.h3demo_o_eg_t1");
});

test("Öffnungen: Klassen je Typ – Fenster, Türen, Glas/Schiebetür, Garage, feste Fenster, Durchgang", () => {
  const b = {
    floors: [{
      id: "eg", rooms: [{ id: "r", name: "Raum", area_id: null, points: rect(0, 0, 8, 8) }],
      openings: [
        { id: "fe", room_id: "r", type: "window" },
        { id: "fest", room_id: "r", type: "window", fixed: true },
        { id: "fest2", room_id: "r", type: "window", name: "Fenster (nicht zu öffnen)" },
        { id: "tz", room_id: "r", type: "door", style: "interior" },
        { id: "gl", room_id: "r", type: "door", style: "glass" },
        { id: "sl", room_id: "r", type: "door", style: "sliding" },
        { id: "ht", room_id: "r", type: "door", style: "front_glass" },
        { id: "dg", room_id: "r", type: "door", style: "passage" },
        { id: "ga", room_id: "r", type: "garage" },
      ],
    }],
  };
  const r = demoInject(b);
  const d = r.devices;
  const o = Object.fromEntries(r.building.floors[0].openings.map((x) => [x.id, x]));
  const cls = (id) => d.get(id)?.attrs.device_class;
  assert.equal(cls(o.fe.contact), "window");
  assert.equal(cls(o.fe.cover), "shutter");
  assert.deepEqual([o.fest.contact, o.fest.cover, o.fest2.contact, o.fest2.cover], [undefined, undefined, undefined, undefined]);
  assert.equal(cls(o.tz.contact), "door");
  assert.equal(o.tz.cover, undefined);
  for (const id of ["gl", "sl"]) {
    assert.equal(cls(o[id].contact), "door", id);
    assert.equal(cls(o[id].cover), "shutter", id);
  }
  assert.equal(cls(o.ht.contact), "door");
  assert.equal(o.ht.cover, undefined);
  assert.deepEqual([o.dg.contact, o.dg.cover], [undefined, undefined]);
  assert.equal(o.ga.contact, undefined, "Garage: nur das Tor");
  assert.deepEqual([cls(o.ga.cover), d.get(o.ga.cover).state, d.get(o.ga.cover).attrs.current_position], ["garage", "closed", 0]);
  // Kontakte ohne Bereich, Rollläden mit Bereich
  assert.equal(d.get(o.fe.contact).area, null);
  assert.equal(d.get(o.fe.cover).area, "h3demo_eg_r");
  // im Gebäude wirken sie wie echte: Auto-Verknüpfung + Status zählt geöffnete Fenster
  const hass = { states: {}, entities: {} };
  for (const [id, s] of d) {
    hass.states[id] = { entity_id: id, state: s.state, attributes: { friendly_name: s.name, ...s.attrs } };
    hass.entities[id] = { entity_id: id, area_id: s.area };
  }
  const byArea = entitiesByArea(hass);
  const links = buildingLinks(r.building, hass, byArea);
  assert.equal(links.get("eg").get("fe").contact, o.fe.contact);
  assert.equal(houseStatus(r.building, hass, byArea, links).open.length, 0);
  hass.states[o.fe.contact] = { ...hass.states[o.fe.contact], state: "on" };
  const st = houseStatus(r.building, hass, byArea, links);
  assert.deepEqual(st.open.map((x) => [x.entity_id, x.kind]), [[o.fe.contact, "window"]]);
});

test("Möbel: Raumlicht nur ohne Lampen, Schalter folgen Raumlicht und -rollladen, Lampen im Garten", () => {
  const b = {
    floors: [{
      id: "eg",
      rooms: [{ id: "a", name: "A", area_id: null, points: rect(0, 0, 4, 4) }, { id: "b", name: "B", area_id: null, points: rect(4, 0, 8, 4) }],
      outdoor: [{ id: "g", name: "Garten", points: rect(0, 5, 8, 9) }],
      openings: [{ id: "fb", room_id: "b", type: "window" }],
      furniture: [
        { id: "ls", type: "tech_switch", x: 0.1, z: 1 },
        { id: "js", type: "tech_blind_switch", x: 7.9, z: 1 },
        { id: "ls2", type: "tech_switch", x: 7.9, z: 3 },
        { id: "garten", type: "lamp_garden", x: 2, z: 7 },
        { id: "sk", type: "tech_blind_switch", x: 0.1, z: 3 },
        { id: "led", type: "led_strip", x: 6, z: 3 },
        { id: "vh", type: "home_curtain_single", x: 4.5, z: 0.2 },
      ],
    }],
  };
  const r = demoInject(b);
  const d = r.devices;
  const m = Object.fromEntries(r.building.floors[0].furniture.map((x) => [x.id, x.entity]));
  assert.ok(d.has("light.h3demo_eg_a_licht"), "Raum A ohne Lampen: Raumlicht");
  assert.ok(!d.has("light.h3demo_eg_b_licht"), "Raum B hat eine LED");
  assert.equal(m.ls, "light.h3demo_eg_a_licht");
  assert.equal(m.ls2, m.led, "Schalter in B zeigt auf die LED");
  assert.equal(m.js, "cover.h3demo_o_eg_fb", "Jalousieschalter in B: erster Rollladen des Raums");
  assert.equal(m.sk, undefined, "Raum A hat keinen Rollladen/Vorhang → kein Verweis");
  assert.equal(d.get(m.garten).area, "h3demo_eg_g", "Gartenlampe im Bereich der Gartenfläche");
  assert.equal(r.building.floors[0].outdoor[0].area_id, "h3demo_eg_g");
  assert.ok(![...d.keys()].some((id) => id.includes("_g_temperatur")), "Gartenfläche ohne Raumgeräte");
  assert.equal(d.get(m.vh).kind, "curtain");
});

test("PV-Quellen: Dach-Felder, Aufständerung, Balkonkraftwerk mit Balkonmodulen, Vorgaben", () => {
  const r = demoInject(house());
  const src = Object.fromEntries(r.sources.map((s) => [s.key, s]));
  assert.deepEqual(Object.keys(src), ["roof:pv_s", "roof:pv_n", "item:eg:m1", "item:eg:p2"]);
  const s = src["roof:pv_s"];
  assert.equal(s.group, "pv");
  assert.equal(s.kind, "roof");
  assert.ok(s.kwp > 0 && s.modules > 0);
  assert.equal(s.kwp, (s.modules * 400) / 1000);
  assert.equal(s.defaults.max, Math.round((s.kwp * 850) / 10) * 10);
  assert.deepEqual([s.defaults.min, s.defaults.from, s.defaults.to], [0, null, null]);
  assert.equal(src["roof:pv_n"].kwp, (src["roof:pv_n"].modules * 450) / 1000);
  assert.match(s.dir, /^(S|SSO|SSW|SO|SW)$/);
  assert.ok(s.name.startsWith("PV "));
  // Balkonkraftwerk: 800 W, Balkonmodul zählt zu ihm und öffnet dessen Dialog
  const bkw = src["item:eg:m1"];
  assert.equal(bkw.group, "bkw");
  assert.equal(bkw.name, "Balkonkraftwerk");
  assert.equal(bkw.defaults.max, 800);
  assert.ok(bkw.modules >= 1 && bkw.kwp > 0);
  const by = Object.fromEntries(r.building.floors[0].furniture.map((m) => [m.id, m.entity]));
  assert.equal(by.p1, by.m1);
  assert.equal(r.pvKeyByEntity.get(by.m1), "item:eg:m1");
  assert.equal(r.pvKeyByEntity.get(by.p2), "item:eg:p2");
  assert.equal(src["item:eg:p2"].group, "pv");
  // Dach-Felder: Entität im Feld der Kopie (nicht im Original)
  const items = roofItemsAll(r.building).filter((x) => x.item.type === "pv").map((x) => [x.item.id, x.item.entity, x.item.energy_entity]);
  assert.deepEqual(items, [["pv_s", "sensor.h3demo_pv_pv_s", "sensor.h3demo_pv_pv_s_ertrag"], ["pv_n", "sensor.h3demo_pv_pv_n", "sensor.h3demo_pv_pv_n_ertrag"]]);
  assert.equal(roofItemsAll(house())[0].item.entity, undefined);
  // Energie-Einstellung: Haus, Netz, PV-Anlage, Balkonkraftwerk, Speicher (weil ein Speicher-Gerät steht)
  const e = r.building.settings.energy;
  assert.equal(e.demo, true);
  assert.deepEqual(e.sources.map((x) => x.type), ["pv", "bkw", "speicher"]);
  assert.ok(isDemoId(e.haus) && isDemoId(e.netz) && e.sources.every((x) => isDemoId(x.power)));
});

test("Energie ohne Speicher-Gerät und ohne PV: nur Haus und Netz", () => {
  const b = { floors: [{ id: "eg", rooms: [{ id: "r", name: "R", area_id: null, points: rect(0, 0, 4, 4) }], furniture: [] }] };
  const r = demoInject(b);
  assert.deepEqual(r.building.settings.energy.sources, []);
  assert.equal(r.sources.length, 0);
  const noStore = house();
  noStore.floors[0].furniture = noStore.floors[0].furniture.filter((m) => m.id !== "b1");
  assert.deepEqual(demoInject(noStore).building.settings.energy.sources.map((x) => x.type), ["pv", "bkw"]);
});

test("Virtuelle Quellen für Erzeuger der Einstellung ohne PV-Objekt gleicher Art", () => {
  const b = { floors: [], settings: { energy: { haus: "sensor.h", netz: "sensor.n", sources: [{ id: "pv_1", type: "pv", name: "Dach", power: "sensor.pv", energy: "sensor.pv_e" }, { id: "bkw_1", type: "bkw", power: "sensor.bkw" }, { id: "s", type: "speicher", power: "sensor.s" }, { id: "pv_2", type: "pv" }] } } };
  const src = demoSources(b);
  assert.deepEqual(src.map((s) => [s.key, s.kind, s.group, s.cfgId, s.entity, s.defaults.max]), [
    ["cfg:pv_1", "cfg", "pv", "pv_1", "sensor.pv", 5000],
    ["cfg:bkw_1", "cfg", "bkw", "bkw_1", "sensor.bkw", 800],
  ]);
  assert.equal(src[0].name, "Dach");
  // mit eigenem Dach-Feld entfällt die virtuelle PV-Quelle
  b.settings.roof = { type: "gable", pitch: 35, items: [{ id: "pv_1", type: "pv", x: 5, z: 6.5, cols: 2, rows: 1 }] };
  b.floors = [{ id: "eg", rooms: [{ id: "r", points: rect(0, 0, 10, 8) }] }];
  assert.deepEqual(demoSources(b).map((s) => s.key), ["roof:pv_1", "cfg:bkw_1"]);
  // gespeicherte Einstellung wird an der Quelle mitgeführt
  b.settings.demo = { pv: { "cfg:bkw_1": { min: 10, max: 700, from: 480, to: 1020 } } };
  assert.deepEqual(demoSources(b)[1].cfg, { min: 10, max: 700, from: 480, to: 1020 });
  assert.equal(demoSources(b)[0].cfg, null);
});

test("Bereinigen: Rundlauf auf dem Beispielhaus, leerem Haus und einem Haus mit Dach, PV und Möbeln", () => {
  assert.deepEqual(demoStrip(demoInject(clone(sample)).building), sample);
  const empty = { version: 1, floors: [], settings: {} };
  assert.deepEqual(demoStrip(demoInject(empty).building), empty);
  const h = house();
  assert.deepEqual(demoStrip(demoInject(h).building), h);
  const withEnergy = house();
  withEnergy.settings.energy = { solar: null, einspeisung: null };
  assert.deepEqual(demoStrip(demoInject(withEnergy).building), withEnergy);
  // nirgends bleibt eine Demo-Kennung
  assert.ok(!JSON.stringify(demoStrip(demoInject(h).building)).includes("h3demo"));
  // Beispielhaus eingesetzt: Demo-Kennungen drin
  assert.ok(JSON.stringify(demoInject(clone(sample)).building).includes("h3demo_"));
});

test("Bereinigen: fehlende Schlüssel kommen als null zurück, wo der Editor null schreibt", () => {
  const b = { floors: [{ id: "eg", rooms: [{ id: "r", name: "R", points: rect(0, 0, 4, 4) }], openings: [{ id: "f", room_id: "r", type: "window" }], furniture: [{ id: "l", type: "lamp_floor", x: 1, z: 1 }], outdoor: [{ id: "g", points: rect(5, 0, 8, 4) }] }] };
  const s = demoStrip(demoInject(b).building);
  const f = s.floors[0];
  assert.deepEqual([f.rooms[0].area_id, f.openings[0].contact, f.openings[0].cover, f.furniture[0].entity], [null, null, null, null]);
  assert.ok(!("area_id" in f.outdoor[0]), "Gartenfläche: Schlüssel wird wieder gelöscht");
  assert.equal(s.settings.energy, undefined);
  assert.equal(s.settings.weather, undefined);
});

test("Bereinigen: Demo-Kennungen aus Nutzereingaben im Demo-Haus verschwinden, Namen bleiben", () => {
  const r = demoInject(house());
  const b = r.building;
  b.settings.hidden_entities = ["light.echt", "light.h3demo_m_eg_l1"];
  b.settings.quick = [{ entity: "light.h3demo_m_eg_l1", name: "Lampe" }, { entity: "light.echt" }];
  b.settings.cards = [{ id: "c", name: "light.h3demo_name_bleibt", entities: ["sensor.h3demo_eg_wz_temperatur", { entity: "sensor.h3demo_eg_wz_leistung" }, "sensor.echt"] }];
  b.settings.functions = [{ key: "licht", entity: "light.h3demo_m_eg_l2" }];
  b.floors[0].placements = [{ entity_id: "light.h3demo_m_eg_l1", x: 1, z: 1 }, { entity_id: "light.echt", x: 2, z: 2 }];
  b.floors[0].rooms[0].panel = ["switch.h3demo_m_eg_w1", "switch.echt"];
  b.floors[0].rooms[0].title = "h3demo_titel";
  b.settings.demo = { pv: { "roof:pv_s": { min: 0, max: 3000, from: 480, to: 1080 } } };
  const s = demoStrip(b);
  assert.deepEqual(s.settings.hidden_entities, ["light.echt"]);
  assert.deepEqual(s.settings.quick, [{ entity: "light.echt" }]);
  assert.deepEqual(s.settings.cards[0].entities, ["sensor.echt"]);
  assert.equal(s.settings.cards[0].name, "light.h3demo_name_bleibt", "name/title werden nicht angefasst");
  assert.deepEqual(s.settings.functions, [{ key: "licht" }]);
  assert.deepEqual(s.floors[0].placements, [{ entity_id: "light.echt", x: 2, z: 2 }]);
  assert.deepEqual(s.floors[0].rooms[0].panel, ["switch.echt"]);
  assert.equal(s.floors[0].rooms[0].title, "h3demo_titel");
  assert.deepEqual(s.settings.demo, b.settings.demo, "PV-Demo-Einstellung bleibt erhalten");
  // Eingabe bleibt unverändert
  assert.ok(JSON.stringify(b).includes("h3demo_m_eg_l1"));
  // ohne Objekt: unverändert zurück
  assert.equal(demoStrip(null), null);
});

test("Ungültige Gebäude brechen das Einsetzen nicht", () => {
  for (const b of [null, undefined, {}, { floors: "x" }, { floors: [null, 5, { id: "e", rooms: "kaputt", openings: [null, { id: 3 }], furniture: [{ id: "x" }, { type: 5 }] }] }]) {
    const r = demoInject(b);
    assert.ok(Array.isArray(r.building.floors));
    assert.ok(r.devices instanceof Map);
  }
});

// ------------------------------------------------------------------ Korrekturrunde 0.24.0b1

const real = (...ids) => Object.fromEntries(ids.map((id) => [id, { entity_id: id, area_id: "wohnzimmer" }]));

test("Schalter auf echte Lichter und Rollläden: nach dem Bereinigen steht keine echte Kennung im Haus", () => {
  const b = {
    version: 1,
    settings: {},
    floors: [{
      id: "eg",
      rooms: [{ id: "a", name: "A", area_id: "wohnzimmer", points: rect(0, 0, 6, 6) }],
      furniture: [
        { id: "ls", type: "tech_switch", x: 0.1, z: 1, entity: null },
        { id: "js", type: "tech_blind_switch", x: 0.1, z: 3 }, // Schlüssel fehlt
        { id: "ls2", type: "tech_dimmer", x: 0.1, z: 4, entity: "" },
      ],
    }],
  };
  const r = demoInject(clone(b), { realEntities: real("light.echt_decke", "cover.echt_rollo") });
  const by = Object.fromEntries(r.building.floors[0].furniture.map((m) => [m.id, m.entity]));
  assert.deepEqual([by.ls, by.js, by.ls2], ["light.echt_decke", "cover.echt_rollo", "light.echt_decke"], "Schalter zeigen auf die echten Geräte des Raums");
  assert.ok(r.building.floors[0].furniture[0].h3demo_link, "die Verknüpfung ist als eingesetzt gemerkt");
  // Rundlauf: exakt das Original (null, fehlender Schlüssel, leere Zeichenkette)
  const s = demoStrip(r.building);
  assert.ok(!JSON.stringify(s).includes("echt_") && !JSON.stringify(s).includes("h3demo"));
  assert.deepEqual(s, b);
  // wer die Verknüpfung im Editor ändert, behält seinen Wert
  const edited = clone(r.building);
  edited.floors[0].furniture[0].entity = "light.mein_licht";
  assert.equal(demoStrip(edited).floors[0].furniture[0].entity, "light.mein_licht");
});

test("Beispielhaus als Demo: die Stehlampe (Entität gibt es nicht) wird ein schaltbares Demo-Licht, Rundlauf exakt", () => {
  const r = demoInject(clone(sample));
  const lamp = r.building.floors.flatMap((f) => f.furniture).find((m) => m.id === "m_lamp");
  assert.match(lamp.entity, /^light\.h3demo_m_/);
  const dev = r.devices.get(lamp.entity);
  assert.deepEqual([dev.domain, dev.area, dev.kind], ["light", "wohnzimmer", "light"]);
  assert.ok([...r.devices.values()].some((d) => d.domain === "light" && d.area === "wohnzimmer"), "das Wohnzimmer hat ein schaltbares Licht");
  assert.deepEqual(demoStrip(r.building), sample);
  assert.equal(demoStrip(r.building).floors.flatMap((f) => f.furniture).find((m) => m.id === "m_lamp").entity, "light.wohnzimmer_stehlampe");
  // gibt es die Entität im echten hass, bleibt sie verknüpft
  const linked = demoInject(clone(sample), { realEntities: real("light.wohnzimmer_stehlampe") });
  assert.equal(linked.building.floors.flatMap((f) => f.furniture).find((m) => m.id === "m_lamp").entity, "light.wohnzimmer_stehlampe");
  assert.deepEqual(demoStrip(linked.building), sample);
  // auch ein Zustand ohne Eintrag in der Registrierung zählt als vorhanden
  const st = demoInject(clone(sample), { realStates: { "light.wohnzimmer_stehlampe": { entity_id: "light.wohnzimmer_stehlampe", state: "off", attributes: {} } } });
  assert.equal(st.building.floors.flatMap((f) => f.furniture).find((m) => m.id === "m_lamp").entity, "light.wohnzimmer_stehlampe");
});

test("Verknüpfungen auf nicht vorhandene Entitäten: Öffnungen und Möbel bekommen Demo-Geräte, das Original kommt zurück", () => {
  const b = house();
  const f = b.floors[0];
  f.openings[0].contact = "binary_sensor.gibt_es_nicht";
  f.openings[0].cover = "cover.gibt_es_nicht";
  f.openings[1].contact = "binary_sensor.tuer_echt";
  f.furniture[2].entity = "switch.waschmaschine_weg"; // washer
  const r = demoInject(clone(b), { realEntities: real("binary_sensor.tuer_echt") });
  const o = r.building.floors[0];
  assert.equal(o.openings[0].contact, "binary_sensor.h3demo_o_eg_f1");
  assert.equal(o.openings[0].cover, "cover.h3demo_o_eg_f1");
  assert.equal(o.openings[1].contact, "binary_sensor.tuer_echt", "vorhandene Entität bleibt");
  assert.equal(o.furniture[2].entity, "switch.h3demo_m_eg_w1");
  assert.equal(r.devices.get(o.furniture[2].entity).watts, 2000);
  const s = demoStrip(r.building);
  assert.equal(s.floors[0].openings[0].contact, "binary_sensor.gibt_es_nicht");
  assert.equal(s.floors[0].openings[0].cover, "cover.gibt_es_nicht");
  assert.equal(s.floors[0].furniture[2].entity, "switch.waschmaschine_weg");
  assert.deepEqual(s, b);
});

test("Energie: Rundlauf unverändert, nach Admin → Energie → Speichern (Merker weg) und mit geänderten Werten", () => {
  const withOrig = house();
  withOrig.settings.energy = { solar: null, einspeisung: null };
  for (const b of [house(), withOrig]) {
    const inj = demoInject(clone(b)).building;
    assert.equal(inj.settings.energy.demo, true);
    assert.deepEqual(demoStrip(inj), b, "unverändert: Original zurück");
  }
  // wie das Panel speichert (Entwurf aus der eingesetzten Einstellung, Merker und Original gehen verloren)
  const draftOf = (energy, tweak = () => {}) => {
    const e = normalizeEnergy(energy);
    e.extra = e.extra.map((x) => (typeof x === "string" ? { entity: x } : x));
    e.ueberschuss = energy.ueberschuss;
    tweak(e);
    return EnergyCfgMethods._energyDraft(e, "one");
  };
  const inj = demoInject(house()).building;
  assert.ok(inj.settings.energy.sources.length >= 2);
  // 1) nichts geändert, gespeichert: die Demo-Teile sind weg, es bleibt eine leere (neu einsetzbare) Einstellung
  const saved = clone(inj);
  saved.settings.energy = draftOf(inj.settings.energy);
  assert.ok(!("demo" in saved.settings.energy) && isDemoId(saved.settings.energy.haus));
  const s1 = demoStrip(saved).settings.energy;
  assert.ok(!JSON.stringify(demoStrip(saved)).includes("h3demo"));
  assert.deepEqual([s1.haus, s1.netz, s1.sources], [null, null, []]);
  const again = demoInject(demoStrip(saved)).building.settings.energy;
  assert.equal(again.demo, true, "die leere Einstellung wird wieder mit Demo-Energie versehen");
  assert.ok(again.sources.length >= 2);
  // 2) Eigenes bleibt: Kurzanzeige, Überschuss, eine eigene Quelle mit echter Entität, ein echter Hausverbrauch, ein Mischfall
  const mine = clone(inj);
  mine.settings.energy = draftOf(inj.settings.energy, (e) => {
    e.kurz = "pv";
    e.ueberschuss = { hoch: 900, mittel: 300 };
    e.haus = "sensor.haus_echt";
    e.sources.push({ id: "pv_9", type: "pv", name: "Dach", power: "sensor.dach_echt", energy: null, soc: null, invert: false, capacity: null, reserve: 10 });
    e.sources[0].power = "sensor.pv_echt"; // Demo-Ertrag bleibt, Leistung ist echt
    e.extra.push({ entity: "sensor.h3demo_x" }, { entity: "sensor.mehr_echt" });
  });
  const s2 = demoStrip(mine).settings.energy;
  assert.ok(!JSON.stringify(s2).includes("h3demo"));
  assert.deepEqual([s2.haus, s2.netz, s2.kurz, s2.ueberschuss], ["sensor.haus_echt", null, "pv", { hoch: 900, mittel: 300 }]);
  assert.deepEqual(s2.sources.map((x) => [x.type, x.power ?? null]), [["pv", "sensor.pv_echt"], ["pv", "sensor.dach_echt"]], "reine Demo-Quellen entfallen, Mischfälle behalten ihre echten Teile");
  assert.deepEqual(s2.extra, [{ entity: "sensor.mehr_echt" }]);
  // eine echte Einstellung wird nie angefasst
  const own = house();
  own.settings.energy = { haus: "sensor.h", netz: "sensor.n", sources: [{ id: "pv_1", type: "pv", name: "PV", power: "sensor.p" }] };
  assert.deepEqual(demoStrip(demoInject(clone(own)).building), own);
});

test("Gartenflächen: ein Demo-Bereich entsteht erst mit der ersten Lampe, Name wie die Fläche, sonst „Garten“", () => {
  const b = {
    version: 1,
    settings: {},
    floors: [{
      id: "eg",
      rooms: [{ id: "r", name: "R", area_id: null, points: rect(0, 0, 4, 4) }],
      outdoor: [
        { id: "leer", name: "Rasen", points: rect(5, 0, 8, 4) },
        { id: "lampe", name: "Terrasse", area_id: null, points: rect(0, 5, 4, 9) },
        { id: "anon", points: rect(5, 5, 8, 9) },
        { id: "echt", name: "Beet", area_id: "beet", points: rect(9, 0, 12, 4) },
      ],
      furniture: [
        { id: "l1", type: "lamp_garden", x: 2, z: 7, entity: null },
        { id: "l2", type: "lamp_bollard", x: 6, z: 7, entity: null },
        { id: "l3", type: "lamp_garden", x: 10, z: 2, entity: null },
        { id: "t", type: "hot_tub", x: 6.5, z: 1, entity: null },
      ],
    }],
  };
  const r = demoInject(clone(b));
  const out = Object.fromEntries(r.building.floors[0].outdoor.map((o) => [o.id, o]));
  assert.ok(!("area_id" in out.leer), "Fläche ohne Lampe: kein Bereich");
  assert.equal(out.lampe.area_id, "h3demo_eg_lampe");
  assert.equal(out.anon.area_id, "h3demo_eg_anon");
  assert.equal(out.anon.name, "Garten", "namenlose Fläche heißt „Garten“, nie wie die interne Kennung");
  assert.equal(out.echt.area_id, "beet", "vorhandener Bereich bleibt");
  assert.deepEqual(Object.keys(r.areas).sort(), ["h3demo_eg_anon", "h3demo_eg_lampe", "h3demo_eg_r"], "Räume immer, Gartenflächen nur mit Lampe");
  assert.deepEqual([r.areas.h3demo_eg_lampe.name, r.areas.h3demo_eg_anon.name], ["Terrasse", "Garten"]);
  assert.equal(r.devices.get(r.building.floors[0].furniture[0].entity).area, "h3demo_eg_lampe");
  assert.equal(r.devices.get(r.building.floors[0].furniture[1].entity).area, "h3demo_eg_anon");
  assert.equal(r.devices.get(r.building.floors[0].furniture[2].entity).area, "beet");
  assert.equal(r.devices.get(r.building.floors[0].furniture[3].entity).area, null, "Whirlpool: bedient über das Möbel");
  assert.ok(![...r.devices.values()].some((d) => d.area === "h3demo_eg_leer"));
  // Rundlauf: Bereich und eingesetzter Name verschwinden wieder
  assert.deepEqual(demoStrip(r.building), b);
});

test("Eingebaute Technik (in_rack) läuft: grüne Status-LED und „Leistung gesamt“ am Schrank; frei stehende Technik startet aus", () => {
  const cab = { id: "cab", type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2 };
  const dev = (id, type, u) => ({ id, type, in_rack: "cab", rack_u: u, x: 5, z: 5, rotation: 0 });
  const floor = { id: "eg", rooms: [{ id: "r", name: "R", area_id: null, points: rect(0, 0, 8, 8) }], furniture: [cab, dev("srv", "tech_srv_1u", 1), dev("sw", "tech_switch_24", 3), { id: "frei", type: "tech_srv_1u", x: 2, z: 2 }, { id: "lampe", type: "lamp_floor", x: 3, z: 3, in_rack: "cab" }] };
  const r = demoInject({ floors: [floor] });
  const d = r.devices;
  const srv = d.get("sensor.h3demo_m_eg_srv");
  assert.deepEqual([srv.domain, srv.state, srv.attrs.unit_of_measurement, srv.attrs.device_class, srv.fixed, srv.watts], ["sensor", "20", "W", "power", true, 20]);
  assert.equal(d.get("switch.h3demo_m_eg_frei").state, "off", "frei stehend: Schalter, aus");
  assert.equal(d.get("light.h3demo_m_eg_lampe").state, "off", "nur Technik wird zum Messer");
  // am Schrank: Status-LEDs grün, Leistung gesamt = Summe der eingebauten Geräte
  const f = r.building.floors[0];
  const states = Object.fromEntries([...d].map(([id, s]) => [id, { entity_id: id, state: s.state, attributes: s.attrs }]));
  assert.deepEqual(f.furniture.filter((m) => m.in_rack).map((m) => rackLedKind(states[m.entity])), ["green", "green", "off"]);
  assert.equal(rackPower(f, f.furniture[0], { states }).w, 40);
  assert.deepEqual(rackPower(f, f.furniture[0], { states }).ids.length, 2);
  // Rundlauf
  assert.deepEqual(demoStrip(r.building).floors[0].furniture.map((m) => m.entity ?? null), [null, null, null, null, null]);
});
