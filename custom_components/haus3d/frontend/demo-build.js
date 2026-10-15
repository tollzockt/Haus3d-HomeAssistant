// Demo-Modus, Gebäude-Ansicht mit automatischen Demo-Geräten (rein, ohne DOM, mit node testbar).
//
// demoInject(building) liefert eine Kopie des Gebäudes, in der Räume, Öffnungen, Möbel, PV-Felder und die
// Energie-Einstellung Demo-Kennungen (Präfix h3demo_) tragen – nur dort, wo nichts verknüpft ist; nie
// überschrieben, „none“ bleibt. demoStrip(building) macht das rückgängig: gespeichert wird nie eine Demo-Kennung.
//
// Kennungen: Bereich h3demo_<Etage>_<Raum>, Entität <Domäne>.h3demo_<…> (nur a–z, 0–9, _).
// Rundlauf demoStrip(demoInject(b).building) == b. Eine Ausnahme: ein Raum ohne den Schlüssel area_id bekommt
// beim Bereinigen area_id: null (so schreibt der Editor neue Räume); ebenso openings[].contact/cover und
// furniture[].entity; überall sonst werden eingesetzte Felder wieder gelöscht. Die Energie-Einstellung wird mit
// dem Merker demo: true und der ursprünglichen Einstellung (h3demo_orig) eingesetzt und beim Bereinigen wiederhergestellt;
// hat der Merker unterwegs gefehlt (Admin → Energie speichert neu), gilt sie als eingesetzt, sobald Haus, Netz oder eine
// Quelle eine Demo-Kennung trägt – die Demo-Teile werden entfernt, Eigenes bleibt.
// Eine Verknüpfung, die ein Demo-Gerät ersetzt (Schalter → Raumlicht, Verweis auf eine Entität, die es nicht gibt),
// merkt sich das Feld h3demo_link {Feld: {was, set, had}}; beim Bereinigen kommt der Originalwert zurück, solange das
// Feld noch den eingesetzten Wert trägt (wer es im Editor geändert hat, behält seinen Wert).
//
// Gerät (Eintrag in devices): {id, domain, name, state, attrs, watts, area, floorId, roomId, kind, role, itemId?,
// openingId?, dyn?, fixed?} – watts = Leistung, solange es „an“ ist (Whirlpool: „offen“); dyn "roomPower" = Raum-Leistung;
// fixed = Leistungsmesser (eingebaute Technik): zählt immer, mit seinem Wert als Leistung.

import { buildingLinks, entitiesByArea } from "./devices.js";
import { hashString, normalizeDemoSettings } from "./demo-energy.js";
import { EXTRA, PV_GRID, pvModules } from "./catalog-extra.js";
import { HOME_FIRE_TYPES, HOME_OPEN_TYPES } from "./catalog-home.js";
import { MORE } from "./catalog-more.js";
import { normalizeEnergy } from "./energymodel.js";
import { DEFAULT_WP, compass16, fieldInfo } from "./exterior.js";
import { roofItemsAll } from "./roofunits.js";
import { pointInPolygon } from "./walls.js";

export const DEMO_PREFIX = "h3demo_";
const ID_RE = /^([a-z_]+\.)?h3demo(_|$)/;
const ORIG = "h3demo_orig";
const LINK = "h3demo_link";

/** Ist das eine Demo-Kennung (Bereich oder Entität)? */
export const isDemoId = (v) => typeof v === "string" && ID_RE.test(v);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
const eid = (domain, ...parts) => `${domain}.${DEMO_PREFIX}${parts.map(slug).join("_")}`;
const aid = (...parts) => `${DEMO_PREFIX}${parts.map(slug).join("_")}`;
const linked = (v) => typeof v === "string" && v.includes(".") && v !== "none";
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ Gerätearten nach Möbeltyp

const K = (kind, domain, watts = 0, extra = {}) => Object.freeze({ kind, domain, watts, ...extra });
const FIRE = new Set(HOME_FIRE_TYPES);
const CURTAIN = new Set(HOME_OPEN_TYPES);
const WALL = {
  tech_switch: K("lightswitch", null, 0, { link: "light" }),
  tech_switch_double: K("lightswitch", null, 0, { link: "light" }),
  tech_dimmer: K("lightswitch", null, 0, { link: "light" }),
  tech_smart_switch: K("lightswitch", null, 0, { link: "light" }),
  tech_blind_switch: K("blindswitch", null, 0, { link: "cover" }),
  tech_button: K("aux", "switch", 0),
  tech_network_outlet: K("aux", "switch", 0),
  tech_antenna_outlet: K("aux", "switch", 0),
  tech_doorbell: K("aux", "switch", 0),
  tech_motion_sensor: K("motion", "binary_sensor", 0, { cls: "motion" }),
  tech_smoke_detector: K("smoke", "binary_sensor", 0, { cls: "smoke" }),
  tech_thermostat: K("thermostat", "climate"),
  tech_stove_outlet: K("plug", "switch", 60, { cls: "outlet" }),
};
// Verbraucher: Leistung in W; on = startet an (Kühlschrank, Gefriertruhe)
const LOADS = {
  washer: 2000,
  dryer: 2200,
  dishwasher: 1800,
  stove: 2500,
  home_oven_tall: 2500,
  fridge: [100, true],
  fridge_smart: [100, true],
  home_wine_fridge: [100, true],
  garden_freezer: [100, true],
  tv_wall: 120,
  home_microwave: 1000,
  home_kettle: 2000,
  home_toaster: 800,
  home_coffee_auto: 1400,
  home_espresso: 1200,
  printer_3d: 150,
  tech_dehumidifier: 250,
  tech_ventilation: 40,
};
// weitere Lichter (Leuchtmittel in Möbeln, Hauben, Becken, Pflanzenlicht)
const LIGHTS = { home_fairy_lights: 15, home_hood_wall: 40, home_hood_island: 40, home_aquarium: 40, home_terrarium: 40, garden_growbox: 40, garden_seed_rack: 40, garden_microgreens: 40, gaming_desk: 15 };
const TECH = /^(inv_|bat_|tech_(gas_boiler|condensing_boiler|pellet_boiler|hydromodule|solar_station)$|tech_(srv|nas|ups|switch)_)/;
const TECH_SET = new Set(["nas", "tech_firewall", "tech_pdu", "tech_kvm", "tech_mini_pc", "tech_sbc", "tech_tower_server", "tech_wifi_router", "tech_ap_ceiling", "tech_modem", "keyboard_mouse", "headset_stand", "gamepad", "racing_cockpit", "monitor_27", "monitor_34", "monitor_49", "monitor_dual"]);

/**
 * Art des Demo-Geräts zu einem Möbeltyp oder null. Ergebnis {kind, domain, watts, cls?, on?, link?, group?}:
 * light (Lampen, LED, Möbel mit Leuchtmitteln), curtain (cover), fire (switch), tub (cover, offen = in Betrieb),
 * plug (Steckdose), tech (Technik mit Status-LED), load (Verbraucher), aux, heater/thermostat (climate),
 * lightswitch/blindswitch (verweisen auf Raumlicht bzw. -rollladen), motion/smoke (binary_sensor),
 * pv/bkw (sensor, PV-Aufständerung bzw. Balkonkraftwerk). Nur Präfixe und Listen, keine Markenschlüssel.
 */
export function demoKind(type) {
  const t = String(type ?? "");
  if (Object.hasOwn(PV_GRID, t)) return K("pv", "sensor", 0, { group: t.startsWith("pv_balcony") ? "bkw" : "pv" });
  if (t.startsWith("micro_")) return K("bkw", "sensor", 0, { group: "bkw" });
  if (CURTAIN.has(t)) return K("curtain", "cover", 0, { cls: "curtain" });
  if (FIRE.has(t)) return K("fire", "switch", 0);
  if (t === "hot_tub" || t === "garden_hot_tub_acryl") return K("tub", "cover", 1500);
  if (WALL[t]) return WALL[t];
  if (t.startsWith("tech_socket")) return K("plug", "switch", 60, { cls: "outlet" });
  if (t.startsWith("led_")) return K("light", "light", 15);
  if (t.startsWith("lamp_")) return K("light", "light", 40);
  if (Object.hasOwn(LIGHTS, t)) return K("light", "light", LIGHTS[t]);
  if (t === "radiator") return K("heater", "climate");
  if (t.startsWith("wallbox")) return K("load", "switch", 7400);
  if (t.startsWith("console_")) return K("load", "switch", 150);
  if (t.startsWith("gaming_pc")) return K("load", "switch", 300);
  if (Object.hasOwn(LOADS, t)) {
    const v = LOADS[t];
    return K("load", "switch", Array.isArray(v) ? v[0] : v, Array.isArray(v) && v[1] ? { on: true } : {});
  }
  if (TECH.test(t) || TECH_SET.has(t) || t === "ev_car") return K("tech", "switch", t === "ev_car" ? 0 : 20);
  return null;
}

// allgemeine Namen, wo der Katalog Marken enthält oder der Typ im Grundkatalog steckt
const NAMES = {
  washer: "Waschmaschine", dryer: "Trockner", dishwasher: "Spülmaschine", stove: "Herd", fridge: "Kühlschrank", fridge_smart: "Kühlschrank", tv_wall: "Fernseher",
  radiator: "Heizkörper", hot_tub: "Whirlpool", nas: "NAS", printer_3d: "3D-Drucker", lamp_ceiling: "Deckenleuchte", lamp_downlight: "Einbauspot", lamp_spot: "Spot",
  lamp_panel: "LED-Panel", lamp_pendant: "Pendelleuchte", lamp_floor: "Stehlampe", lamp_table: "Tischlampe", lamp_wall: "Wandleuchte", led_strip: "LED-Streifen",
  lamp_uplight: "Deckenfluter", lamp_bollard: "Pollerleuchte", lamp_garden: "Gartenleuchte", ev_car: "E-Auto",
};
const PREFIX_NAMES = [["wallbox", "Wallbox"], ["console_", "Spielkonsole"], ["gaming_pc", "Gaming-PC"], ["monitor_", "Monitor"], ["inv_", "Wechselrichter"], ["bat_", "Batteriespeicher"], ["micro_", "Balkonkraftwerk"]];
const KIND_NAMES = { light: "Lampe", curtain: "Vorhang", fire: "Kamin", tub: "Whirlpool", plug: "Steckdose", tech: "Gerät", load: "Gerät", aux: "Gerät", heater: "Heizkörper", thermostat: "Thermostat", motion: "Bewegungsmelder", smoke: "Rauchmelder", pv: "PV-Feld", bkw: "Balkonkraftwerk" };
const cleanName = (s) => String(s).replace(/\s*\(Maße[^)]*\)/g, "").trim();

/** Anzeigename eines Möbelstücks: eigener Name, sonst allgemeiner Katalogname bzw. Gattung. */
export function demoLabel(type, item = null, kind = demoKind(type)) {
  if (typeof item?.name === "string" && item.name.trim()) return item.name.trim();
  if (NAMES[type]) return NAMES[type];
  const pre = PREFIX_NAMES.find(([p]) => String(type).startsWith(p));
  if (pre) return pre[1];
  if (MORE[type]) return cleanName(MORE[type][0]);
  if (EXTRA[type] && /^(lamp_|led_|pv_)/.test(type)) return cleanName(EXTRA[type][0]);
  return KIND_NAMES[kind?.kind] ?? "Gerät";
}

// ------------------------------------------------------------------ PV-Quellen

// Objekte im Gebäude, an denen eine Quelle hängt (Dach-Feld, Möbel) – nicht Teil der Quelle selbst
const REFS = new WeakMap();
const reg = (src, refs = []) => {
  REFS.set(src, refs);
  return src;
};
const tenW = (kwp) => Math.round((kwp * 850) / 10) * 10;
const pvDefaults = (max) => ({ min: 0, max, from: null, to: null });

// Quellen aus Dach-Feldern, Aufständerungen und Balkonkraftwerken (ohne virtuelle)
function physicalSources(b, cfgPv) {
  const out = [];
  const north = Number(b.settings?.north) || 0;
  let roof = [];
  try {
    roof = roofItemsAll(b);
  } catch {
    roof = []; // kaputtes Dach: keine Dach-Felder
  }
  for (const { item, unit, others } of roof) {
    if (item?.type !== "pv" || !item.id) continue;
    let f;
    try {
      f = fieldInfo(unit.model, item, north, unit.items, others);
    } catch {
      continue;
    }
    const dir = f.azimuth === null ? "flach" : compass16(f.azimuth);
    const key = `roof:${item.id}`;
    const kwp = round2(f.kwp);
    out.push(reg({
      key, kind: "roof", group: "pv", cfgId: null, name: item.name || `PV ${dir}${unit.kind === "house" ? "" : ` · ${unit.label}`}`, kwp, modules: f.count, wp: f.wp, azimuth: f.azimuth, tilt: Math.round(f.tilt), dir,
      floorId: unit.floorId, itemId: item.id, entity: linked(item.entity) ? item.entity : eid("sensor", "pv", item.id), energyEntity: linked(item.energy_entity) ? item.energy_entity : eid("sensor", "pv", item.id, "ertrag"),
      defaults: pvDefaults(tenW(kwp)), cfg: cfgPv[key] ?? null,
    }, [item]));
  }
  const micros = [];
  const balcony = [];
  for (const floor of list(b.floors)) {
    for (const m of list(floor?.furniture)) {
      if (!isObj(m) || typeof m.type !== "string" || !m.id) continue;
      const k = demoKind(m.type);
      if (k?.kind === "bkw") micros.push({ floor, m });
      else if (k?.kind === "pv") balcony.push({ floor, m, k });
    }
  }
  const modulesOf = (m) => {
    const def = EXTRA[m.type] ?? ["", 1, 1, 1];
    const { across, rows } = pvModules(m.type, Number(m.w) || def[1], Number(m.d) || def[2], m, Number(m.h) || def[3]);
    return across * rows;
  };
  const wpOf = (m) => (Number(m.wp) > 0 ? Number(m.wp) : DEFAULT_WP);
  const made = micros.map(({ floor, m }) => {
    const key = `item:${floor.id}:${m.id}`;
    const src = reg({
      key, kind: "item", group: "bkw", cfgId: null, name: (typeof m.name === "string" && m.name.trim()) || "Balkonkraftwerk", kwp: null, modules: 0, wp: null, azimuth: null, tilt: null, dir: null,
      floorId: floor.id, itemId: m.id, entity: linked(m.entity) ? m.entity : eid("sensor", "pv", floor.id, m.id), energyEntity: null, defaults: pvDefaults(800), cfg: cfgPv[key] ?? null,
    }, [m]);
    out.push(src);
    return { floor, src };
  });
  for (const { floor, m, k } of balcony) {
    const n = modulesOf(m);
    // Balkonmodule gehören zu einem Balkonkraftwerk im Haus (gleiche Etage zuerst), sonst eigene Quelle
    const host = k.group === "bkw" ? made.find((x) => x.floor === floor) ?? made[0] : null;
    if (host) {
      host.src.modules += n;
      host.src.kwp = round2((host.src.kwp ?? 0) + (n * wpOf(m)) / 1000);
      host.src.wp = wpOf(m);
      REFS.get(host.src).push(m);
      continue;
    }
    const key = `item:${floor.id}:${m.id}`;
    const kwp = round2((n * wpOf(m)) / 1000);
    out.push(reg({
      key, kind: "item", group: k.group, cfgId: null, name: demoLabel(m.type, m, k), kwp, modules: n, wp: wpOf(m), azimuth: null, tilt: null, dir: null, floorId: floor.id, itemId: m.id,
      entity: linked(m.entity) ? m.entity : eid("sensor", "pv", floor.id, m.id), energyEntity: null, defaults: pvDefaults(tenW(kwp)), cfg: cfgPv[key] ?? null,
    }, [m]));
  }
  return out;
}

// Erzeuger der Energie-Einstellung ohne PV-Objekt gleicher Art: virtuelle Quelle je Erzeuger
function virtualSources(b, physical, cfgPv) {
  const e = normalizeEnergy(b.settings?.energy);
  const out = [];
  for (const g of e.sources) {
    if (g.type === "speicher" || !g.power || physical.some((s) => s.group === g.type)) continue;
    const key = `cfg:${g.id}`;
    out.push(reg({
      key, kind: "cfg", group: g.type, cfgId: g.id, name: g.name, kwp: null, modules: null, wp: null, azimuth: null, tilt: null, dir: null, floorId: null, itemId: null,
      entity: g.power, energyEntity: g.energy ?? null, defaults: pvDefaults(g.type === "bkw" ? 800 : 5000), cfg: cfgPv[key] ?? null,
    }));
  }
  return out;
}

/**
 * PV-Quellen des Hauses: je Dach-PV-Feld (Schlüssel roof:<id>), je Aufständerung (item:<Etage>:<Möbel>), je
 * Balkonkraftwerk (item:…, Balkonmodule zählen zu ihm) und, wenn die Energie-Einstellung Erzeuger ohne PV-Objekt
 * gleicher Art hat, je Erzeuger eine virtuelle Quelle (cfg:<Quelle>). Quelle:
 * {key, kind: "roof"|"item"|"cfg", group: "pv"|"bkw", cfgId, name, kwp, modules, wp, azimuth, tilt, dir, floorId, itemId,
 *  entity (Leistungssensor), energyEntity, defaults: {min, max, from, to}, cfg (gespeichert oder null)}.
 * Vorgaben: von 0 W; bis = kWp × 850 (auf 10 W), Balkonkraftwerk 800 W, virtuell 5000 W (Balkonkraftwerk 800 W);
 * Zeitfenster = Sonnenauf-/-untergang (from/to null).
 * @param {object} building Gebäude (mit oder ohne eingesetzte Demo-Kennungen)
 * @param {object} [settings] settings.demo (Standard: building.settings.demo)
 */
export function demoSources(building, settings = building?.settings?.demo) {
  const b = isObj(building) ? building : {};
  const cfgPv = normalizeDemoSettings(settings).pv;
  const physical = physicalSources(b, cfgPv);
  return [...physical, ...virtualSources(b, physical, cfgPv)];
}

// ------------------------------------------------------------------ Einsetzen

const placeOf = (floor, x, z) => {
  const p = [Number(x), Number(z)];
  if (!p.every(Number.isFinite)) return null;
  for (const r of list(floor.rooms)) if (Array.isArray(r?.points) && pointInPolygon(p, r.points)) return { room: r, place: r };
  for (const o of list(floor.outdoor)) if (Array.isArray(o?.points) && pointInPolygon(p, o.points)) return { room: null, place: o };
  return null;
};

// Anfangszustand und Attribute eines Demo-Geräts
function initial(domain, o = {}) {
  const attrs = {};
  let state = "off";
  if (domain === "light") Object.assign(attrs, { supported_color_modes: ["brightness"], color_mode: "brightness" });
  else if (domain === "cover") {
    state = o.closed ? "closed" : "open";
    Object.assign(attrs, { current_position: o.closed ? 0 : 100, supported_features: 15 });
    if (o.cls) attrs.device_class = o.cls;
  } else if (domain === "switch") {
    if (o.cls) attrs.device_class = o.cls;
    if (o.on) state = "on";
  } else if (domain === "climate") {
    state = "heat";
    Object.assign(attrs, { temperature: 21, current_temperature: 21, hvac_modes: ["heat", "off"], hvac_action: "idle", min_temp: 5, max_temp: 30, target_temp_step: 0.5, temperature_unit: "°C" });
  } else if (domain === "binary_sensor" && o.cls) attrs.device_class = o.cls;
  return { state, attrs };
}

// Feld auf einen eingesetzten Wert setzen und den Originalwert merken (demoStrip stellt ihn wieder her)
function relink(node, key, set) {
  if (!isObj(node[LINK])) node[LINK] = {};
  node[LINK][key] = { was: node[key] ?? null, set, had: Object.hasOwn(node, key) };
  node[key] = set;
}

/**
 * Demo-Geräte in eine Kopie des Gebäudes einsetzen. Eine Verknüpfung auf eine Entität, die es im echten hass nicht
 * gibt (realEntities, realStates), gilt wie „nicht verknüpft“: das Demo-Gerät tritt an ihre Stelle, das Original
 * merkt sich h3demo_link. Schalter, die auf ein (auch echtes) Raumlicht bzw. einen Rollladen zeigen, merken ebenso.
 * @param {object} building Gebäude (wird nicht verändert)
 * @param {{realEntities?: object, realDevices?: object, realStates?: object}} [real] echte Registrierung (entities,
 *   devices) und Zustände – nur für Bereiche und device_class echter Entitäten (nie Werte)
 * @returns {{building: object, devices: Map<string, object>, areas: object, sources: object[], pvKeyByEntity: Map<string, string>, rooms: {key: string, floorId: string, roomId: string, area: string}[]}}
 */
export function demoInject(building, { realEntities = {}, realDevices = {}, realStates = {} } = {}) {
  const b = isObj(building) ? structuredClone(building) : { version: 1, floors: [], settings: {} };
  if (!Array.isArray(b.floors)) b.floors = [];
  const devices = new Map();
  const areas = {};
  const rooms = [];
  const taken = new Set();
  const uniq = (id) => {
    let x = id;
    for (let i = 2; taken.has(x); i++) x = `${id}_${i}`;
    taken.add(x);
    return x;
  };
  const names = new Map(); // Raum + Name → Anzahl
  const nameIn = (roomKey, base) => {
    const k = `${roomKey}|${base}`;
    const n = (names.get(k) ?? 0) + 1;
    names.set(k, n);
    return n > 1 ? `${base} ${n}` : base;
  };
  const add = (spec) => {
    spec.id = uniq(spec.id);
    spec.watts = spec.watts ?? 0;
    spec.attrs = spec.attrs ?? {};
    devices.set(spec.id, spec);
    return spec;
  };
  const floors = b.floors.filter((f) => isObj(f));

  // echte Entitäten je Bereich (Auto-Verknüpfung der Öffnungen und „eigene Geräte“ eines Raums)
  const states = { ...Object.fromEntries(Object.keys(realEntities).map((id) => [id, { entity_id: id, state: "off", attributes: {} }])), ...realStates };
  const pseudo = { states, entities: realEntities, devices: realDevices };
  const byArea = entitiesByArea(pseudo);
  const stray = (v) => linked(v) && !Object.hasOwn(states, v); // Verknüpfung auf eine Entität, die es nicht gibt
  const addArea = (area_id, name) => (areas[area_id] = { area_id, name, picture: null, aliases: [], floor_id: null, labels: [] });

  // 1) Bereiche für Räume ohne Bereich (Gartenflächen bekommen einen erst, wenn dort eine Lampe steht, siehe 4)
  for (const f of floors) {
    for (const r of list(f.rooms)) {
      if (!isObj(r) || !r.id || r.area_id) continue; // gesetzt (auch „none“) bleibt
      r.area_id = aid(f.id, r.id);
      addArea(r.area_id, r.name || String(r.id));
    }
  }
  let links;
  try {
    links = buildingLinks(b, pseudo, byArea);
  } catch {
    links = new Map(); // unvollständige Öffnungen: keine Auto-Verknüpfung erkannt
  }

  // 2) Geräte je Raum (nur Räume, deren Bereich keine eigenen Geräte hat; je Bereich nur der erste Raum)
  const roomLights = new Map(); // Raum → Lichter
  const roomCovers = new Map(); // Raum → Rollläden, Vorhänge
  const push = (map, key, id) => map.set(key, [...(map.get(key) ?? []), id]);
  const lampsIn = new Set();
  for (const f of floors) {
    for (const m of list(f.furniture)) {
      if (isObj(m) && /^(lamp|led)_/.test(String(m.type))) {
        const pl = placeOf(f, m.x, m.z);
        if (pl?.room) lampsIn.add(`${f.id}:${pl.room.id}`);
      }
    }
  }
  const populated = new Set();
  for (const f of floors) {
    for (const r of list(f.rooms)) {
      if (!isObj(r) || !r.id || !r.area_id || r.area_id === "none") continue;
      const key = `${f.id}:${r.id}`;
      const own = byArea.get(r.area_id) ?? [];
      for (const id of own.filter((x) => x.startsWith("light."))) push(roomLights, key, id);
      for (const id of own.filter((x) => x.startsWith("cover."))) push(roomCovers, key, id);
      if (own.length || populated.has(r.area_id)) continue;
      populated.add(r.area_id);
      const area = r.area_id;
      const name = r.name || String(r.id);
      const h = hashString(key);
      const base = { area, floorId: f.id, roomId: r.id };
      rooms.push({ key, floorId: f.id, roomId: r.id, area });
      if (!lampsIn.has(key)) {
        const l = add({ id: eid("light", f.id, r.id, "licht"), domain: "light", name: `${name} Licht`, ...initial("light"), watts: 40, kind: "light", role: "room-light", ...base });
        push(roomLights, key, l.id);
      }
      add({ id: eid("sensor", f.id, r.id, "temperatur"), domain: "sensor", name: `${name} Temperatur`, state: (19.5 + (h % 36) / 10).toFixed(1), attrs: { device_class: "temperature", unit_of_measurement: "°C", state_class: "measurement" }, kind: "sensor", role: "temperature", ...base });
      add({ id: eid("sensor", f.id, r.id, "feuchte"), domain: "sensor", name: `${name} Feuchte`, state: String(45 + ((h >>> 8) % 14)), attrs: { device_class: "humidity", unit_of_measurement: "%", state_class: "measurement" }, kind: "sensor", role: "humidity", ...base });
      add({ id: eid("binary_sensor", f.id, r.id, "bewegung"), domain: "binary_sensor", name: `${name} Bewegung`, ...initial("binary_sensor", { cls: "motion" }), kind: "motion", role: "motion", ...base });
      add({ id: eid("sensor", f.id, r.id, "leistung"), domain: "sensor", name: `${name} Leistung`, state: "35", attrs: { device_class: "power", unit_of_measurement: "W", state_class: "measurement" }, kind: "sensor", role: "power", dyn: "roomPower", ...base });
    }
  }

  // 3) Öffnungen: Kontakt (ohne Bereich), Rollladen (mit Bereich), Garagentor
  for (const f of floors) {
    for (const o of list(f.openings)) {
      if (!isObj(o) || !o.id) continue;
      const room = list(f.rooms).find((r) => r?.id === o.room_id);
      const rkey = `${f.id}:${o.room_id}`;
      const area = room?.area_id && room.area_id !== "none" ? room.area_id : null;
      const link = links.get(f.id)?.get(o.id);
      const label = o.name || (o.type === "door" ? "Tür" : o.type === "garage" ? "Garagentor" : "Fenster");
      const fixed = o.fixed === true || /nicht zu öffnen|fest/i.test(o.name ?? "");
      const passage = o.type === "door" && o.style === "passage";
      const cover = o.type === "window" || o.type === "garage" || (o.type === "door" && (o.style === "glass" || o.style === "sliding"));
      const base = { floorId: f.id, roomId: o.room_id ?? null, openingId: o.id };
      if (o.type !== "garage" && !fixed && !passage && (o.contact ? stray(o.contact) : !link?.contact)) {
        const s = add({ id: eid("binary_sensor", "o", f.id, o.id), domain: "binary_sensor", name: nameIn(rkey, label), ...initial("binary_sensor", { cls: o.type === "door" ? "door" : "window" }), area: null, kind: "contact", role: "contact", ...base });
        if (o.contact) relink(o, "contact", s.id);
        else o.contact = s.id;
      }
      if (cover && !fixed && !passage && (o.cover ? stray(o.cover) : !link?.cover)) {
        const garage = o.type === "garage";
        const s = add({ id: eid("cover", "o", f.id, o.id), domain: "cover", name: nameIn(rkey, garage ? label : `Rollladen ${label}`), ...initial("cover", { cls: garage ? "garage" : "shutter", closed: garage }), area, kind: garage ? "garage" : "shutter", role: garage ? "garage" : "shutter", ...base });
        if (o.cover) relink(o, "cover", s.id);
        else o.cover = s.id;
      }
      if (linked(o.cover) && o.type !== "garage") push(roomCovers, rkey, o.cover);
    }
  }

  // 4) Möbel
  const pending = [];
  for (const f of floors) {
    for (const m of list(f.furniture)) {
      if (!isObj(m) || typeof m.type !== "string" || !m.id) continue;
      const stale = !!m.entity && stray(m.entity); // verknüpft mit einer Entität, die es nicht gibt: wie unverknüpft
      if (m.entity && !stale) continue;
      const k = demoKind(m.type);
      if (!k || k.kind === "pv" || k.kind === "bkw") continue;
      const pl = placeOf(f, m.x, m.z);
      const rkey = pl?.place ? `${f.id}:${pl.place.id}` : `${f.id}:`;
      if (k.link) {
        pending.push({ f, m, k, rkey });
        continue;
      }
      const lamp = /^(lamp|led)_/.test(m.type) && k.kind === "light";
      let area = null;
      const place = pl?.place;
      if (lamp && place) {
        // Gartenfläche: der Demo-Bereich entsteht erst mit der ersten Lampe (Name wie die Fläche, sonst „Garten“)
        if (!pl.room && !place.area_id) {
          relink(place, "area_id", aid(f.id, place.id));
          if (!place.name) relink(place, "name", "Garten");
          addArea(place.area_id, place.name);
        }
        area = place.area_id && place.area_id !== "none" ? place.area_id : null;
      }
      // Eingebaute Technik (in_rack) läuft: Leistungsmesser statt Schalter – grüne Status-LED, „Leistung gesamt“ am Schrank
      // (ein Tipp öffnet bei eingebauten Geräten ohnehin die Infos); ihre Leistung zählt immer zum Hausverbrauch (fixed)
      const rack = k.kind === "tech" && m.in_rack != null;
      const domain = rack ? "sensor" : k.domain;
      const body = rack ? { state: String(k.watts), attrs: { device_class: "power", unit_of_measurement: "W", state_class: "measurement" }, fixed: true } : initial(k.domain, { cls: k.cls, on: k.on, closed: k.kind === "tub" });
      const spec = add({ id: eid(domain, "m", f.id, m.id), domain, name: nameIn(rkey, demoLabel(m.type, m, k)), ...body, watts: k.watts, area, floorId: f.id, roomId: place?.id ?? null, kind: k.kind, role: "furniture", itemId: m.id });
      if (stale) relink(m, "entity", spec.id);
      else m.entity = spec.id;
      if (lamp) push(roomLights, rkey, spec.id);
      else if (k.kind === "curtain") push(roomCovers, rkey, spec.id);
    }
  }
  // Licht- und Jalousieschalter zeigen auf Raumlicht bzw. -rollladen (auch ein echtes): das Original merkt h3demo_link
  for (const { m, k, rkey } of pending) {
    const target = (k.link === "light" ? roomLights : roomCovers).get(rkey)?.[0];
    if (target) relink(m, "entity", target);
  }

  // 5) PV-Quellen: Sensoren an Dach-Felder, Aufständerungen, Balkonkraftwerke
  const cfgPv = normalizeDemoSettings(b.settings?.demo).pv;
  const physical = physicalSources(b, cfgPv);
  for (const s of physical) {
    for (const o of REFS.get(s) ?? []) {
      if (!o.entity) o.entity = s.entity;
      if (s.kind === "roof" && !o.energy_entity) o.energy_entity = s.energyEntity;
    }
  }

  // 6) Energie und Wetter
  if (!isObj(b.settings)) b.settings = {};
  const energy = normalizeEnergy(b.settings.energy);
  if (!energy.haus && !energy.netz && !energy.netz_bezug && !energy.netz_einspeisung && !energy.sources.length) {
    const groups = new Set(physical.map((s) => s.group));
    const store = floors.some((f) => list(f.furniture).some((m) => isObj(m) && String(m.type).startsWith("bat_")));
    const cfg = { demo: true, haus: eid("sensor", "e", "haus"), netz: eid("sensor", "e", "netz"), sources: [] };
    if (groups.has("pv")) cfg.sources.push({ id: "pv_1", type: "pv", name: "PV-Anlage", power: eid("sensor", "e", "pv"), energy: eid("sensor", "e", "pv", "ertrag") });
    if (groups.has("bkw")) cfg.sources.push({ id: "bkw_1", type: "bkw", name: "Balkonkraftwerk", power: eid("sensor", "e", "bkw"), energy: eid("sensor", "e", "bkw", "ertrag") });
    if (store) cfg.sources.push({ id: "speicher_1", type: "speicher", name: "Speicher", power: eid("sensor", "e", "speicher"), soc: eid("sensor", "e", "speicher", "ladestand"), capacity: 10, reserve: 10 });
    if (Object.hasOwn(b.settings, "energy")) cfg[ORIG] = b.settings.energy;
    b.settings.energy = cfg;
  }
  if (b.settings.weather === undefined || b.settings.weather === null || b.settings.weather === "") b.settings.weather = "weather.h3demo";

  const sources = [...physical, ...virtualSources(b, physical, cfgPv)];
  const pvKeyByEntity = new Map();
  for (const s of sources) if (linked(s.entity)) pvKeyByEntity.set(s.entity, s.key);
  return { building: b, devices, areas, sources, pvKeyByEntity, rooms };
}

// ------------------------------------------------------------------ Bereinigen

const NAME_KEYS = new Set(["name", "title"]);
const DROP_LISTS = new Set(["placements", "quick", "entities", "extra"]);
// Felder, die der Editor mit null belegt (statt sie wegzulassen)
const nullKey = (path, key) => {
  const list = path.at(-2);
  return (list === "rooms" && key === "area_id") || (list === "openings" && (key === "contact" || key === "cover")) || (list === "furniture" && key === "entity");
};

function clean(node, path) {
  if (Array.isArray(node)) {
    const drop = DROP_LISTS.has(path.at(-1));
    for (let i = node.length - 1; i >= 0; i--) {
      const el = node[i];
      if (isDemoId(el) || (drop && isObj(el) && (isDemoId(el.entity) || isDemoId(el.entity_id)))) node.splice(i, 1);
      else if (el && typeof el === "object") clean(el, [...path, i]);
    }
    return;
  }
  // ersetzte Verknüpfungen zuerst zurück (nur, wo das Feld noch den eingesetzten Wert trägt)
  if (isObj(node[LINK])) {
    for (const [key, l] of Object.entries(node[LINK])) {
      if (!isObj(l) || node[key] !== l.set) continue;
      if (l.had) node[key] = l.was;
      else delete node[key];
    }
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (isDemoId(key)) delete node[key];
    else if (typeof v === "string") {
      if (!NAME_KEYS.has(key) && isDemoId(v)) {
        if (nullKey(path, key)) node[key] = null;
        else delete node[key];
      }
    } else if (v && typeof v === "object") clean(v, [...path, key]);
  }
}

const ENERGY_REFS = ["haus", "netz", "netz_bezug", "netz_einspeisung", "verbrauch", "haus_pv", "solar", "einspeisung", "akku_ladestand", "akku_leistung", "ertrag_heute", "pv_zaehler"];
const SOURCE_REFS = ["power", "energy", "soc", "bat_power"];
const realRef = (v) => linked(v) && !isDemoId(v);

/**
 * Eingesetzte Energie-Einstellung zurücknehmen. Mit Merker (demo: true) kommt die ursprüngliche Einstellung zurück bzw.
 * sie entfällt. Ohne Merker (Admin → Energie hat sie neu gespeichert) gilt sie als eingesetzt, sobald Haus, Netz oder
 * eine Quelle eine Demo-Kennung trägt: Demo-Verweise werden leer, Quellen nur aus Demo-Verweisen entfallen, alles
 * Eigene (echte Entitäten, Überschuss-Ampel, Kurzanzeige …) bleibt.
 */
function stripEnergy(b) {
  const e = b.settings?.energy;
  if (!isObj(e)) return;
  if (e.demo === true) {
    if (Object.hasOwn(e, ORIG)) b.settings.energy = e[ORIG];
    else delete b.settings.energy;
    return;
  }
  const srcs = list(e.sources).filter(isObj);
  if (!ENERGY_REFS.some((k) => isDemoId(e[k])) && !srcs.some((s) => SOURCE_REFS.some((k) => isDemoId(s[k])))) return;
  for (const k of ENERGY_REFS) if (isDemoId(e[k])) e[k] = null;
  if (Array.isArray(e.sources)) e.sources = e.sources.filter((s) => !isObj(s) || !SOURCE_REFS.some((k) => isDemoId(s[k])) || SOURCE_REFS.some((k) => realRef(s[k])));
}

/**
 * Demo-Kennungen aus einer Kopie des Gebäudes entfernen (Gegenstück zu demoInject): jede Zeichenkette
 * ^([a-z_]+\.)?h3demo_ (außer in name/title), auch als Schlüssel und in Listen; ersetzte Verknüpfungen (h3demo_link)
 * kommen zurück; die eingesetzte Energie-Einstellung wird durch die ursprüngliche ersetzt bzw. von ihren Demo-Teilen befreit.
 */
export function demoStrip(building) {
  if (!building || typeof building !== "object") return building;
  const b = structuredClone(building);
  stripEnergy(b);
  clean(b, []);
  return b;
}
