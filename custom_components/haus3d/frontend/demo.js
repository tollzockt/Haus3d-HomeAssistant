// Demo-Modus, Kern (ohne DOM, mit node testbar): DemoHouse legt eine Schicht über das echte hass-Objekt.
// Das Demo-hass übernimmt aus dem echten hass nur Kennungen, Registrierung, config, locale, user und themes –
// Zustände, Verbrauch, Sonne, Wetter und PV sind ausgedacht (deterministisch). Dienste gehen nie an Home Assistant,
// callApi wird immer abgelehnt, callWS lässt nur die Erlaubnisliste DEMO_WS_PASS durch.
//
// Ablauf im Panel (Paket C):  real → demo.wrap(real, {onChange, onToast}) → houseGuard(…, {demo: true}).
//   building/get und building/save laufen durch das Wrapper-hass: Antworten bekommen Demo-Geräte eingesetzt
//   (demoInject), ausgehende Gebäude werden bereinigt (demoStrip). Nach einer Antwort ruft der Wrapper (asynchron)
//   onChange auf – das Panel setzt dann hass neu; ein eigenes Neusetzen nach _setBuilding schadet nicht.
//
// API:  new DemoHouse({houseId, now?})
//   wrap(real, {onChange, onToast}) → Demo-hass (gleiches Objekt, solange sich nichts ändert; echte Zustands-
//         änderungen lösen nichts aus – neu gebaut wird bei Änderung von entities/devices/areas/config/locale/
//         user/themes, nach Schaltvorgängen, Uhrzeit, Vorschau, Zurücksetzen und tick())
//   time          null (= jetzt) oder Minuten seit Mitternacht; danach tick() aufrufen
//   tick()        Zustände neu berechnen (Takt alle 30 s und beim Uhrzeit-Regler) und onChange rufen
//   reset()       alle Schaltzustände, Uhrzeit und Vorschauen zurück
//   set(id, state, attrs)   Zustand setzen (Sensor-Dialog), wie Simulator.set
//   setPreview(key, cfg|null)   PV-Vorschau {min, max, from, to} (nur diese Sitzung)
//   pvKeyFor(entityId) → PV-Schlüssel | null;  source(key) → Quelle (siehe demoSources) | null
//   pvConfig(key) → wirksame Einstellung {min, max, from, to} (Vorschau vor gespeichert vor Vorgabe)
//   pvStats(key) → {w, kwh} (Leistung jetzt, Ertrag heute);  curve(key, cfg?, {clouds, step}) → [[Minute, W], …]
//   sunTimes() → {rise, set, polar} des Demo-Tages;  now() → Demo-Zeitpunkt in ms;  ctx → {lat, lon, seed}
//   log           letzte simulierte Dienstaufrufe;  model → Ergebnis von demoInject (devices, sources, …)
//   demoAction(id, st, {pvKey, source, safety, confirm}) → wie entityAction; pvKey = demo.pvKeyFor(id)
//
// Abweichungen von der Spezifikation (Paket 1c-B):
//   - DEMO_WS_PASS enthält zusätzlich haus3d/history/snapshot und /restore (betreffen nur das Testhaus; restore
//     bekommt wie building/get Demo-Geräte eingesetzt).
//   - isDemoId erkennt auch „weather.h3demo“ (Muster ^([a-z_]+\.)?h3demo(_|$)), damit die Wetter-Entität der
//     Spezifikation beim Bereinigen mitgeht.
//   - demoSeries(ids, start, end, ctx) bekommt ctx = {sweep(from, to) → Schnappschüsse, value(id, snap) → Zahl|null, step?};
//     demoBalance bekommt {cfg, sources, pvCfg, ctx, t, load, …} (siehe demo-energy.js).
//   - demoInject liefert zusätzlich rooms (Demo-Räume) und nimmt optional realDevices/realStates (nur für Bereiche und
//     device_class echter Entitäten, nie für Werte).
//   - Virtuelle Quelle eines Balkonkraftwerk-Erzeugers: Vorgabe 800 W (PV-Anlage 5000 W).
//   - Fehlende Schlüssel kommen beim Bereinigen als null zurück, wo der Editor null schreibt (siehe demo-build.js).

import { CONTACT_CLASSES, PRESENCE_CLASSES } from "./devices.js";
import { entityAction } from "./actions.js";
import { demoInject, demoStrip, isDemoId } from "./demo-build.js";
import { baseLoadProfile, dayStart, demoBalance, demoSeries, demoSweep, demoWeather, hashString, normalizeDemoSettings, pvPower, resolvePv, sunTimes } from "./demo-energy.js";
import { normalizeEnergy } from "./energymodel.js";
import { Simulator } from "./sim.js";
import { sunPosition } from "./sun.js";

/** Befehle, die der Demo-Wrapper an Home Assistant bzw. das Backend durchreicht (alles andere wird abgelehnt). */
export const DEMO_WS_PASS = [
  "haus3d/building/get",
  "haus3d/building/save",
  "haus3d/background/get",
  "haus3d/background/set",
  "haus3d/history/list",
  "haus3d/history/snapshot",
  "haus3d/history/restore",
  "haus3d/pin/status",
  "haus3d/pin/verify",
  "haus3d/pin/lock",
  "haus3d/sandbox/list",
  "haus3d/sandbox/create",
  "haus3d/sandbox/delete",
  "haus3d/sandbox/update",
];

const REMOVED = new Set(["person", "device_tracker", "zone", "calendar", "todo", "image", "event", "update"]);
const ATTR_KEEP = ["friendly_name", "device_class", "unit_of_measurement", "state_class", "icon", "supported_features", "min_temp", "max_temp", "target_temp_step", "hvac_modes", "preset_modes", "fan_modes", "swing_modes", "supported_color_modes", "min_color_temp_kelvin", "max_color_temp_kelvin", "options", "min", "max", "step", "mode", "source_list", "effect_list"];
const LIGHT_KEYS = ["brightness", "rgb_color", "hs_color", "xy_color", "color_temp", "color_temp_kelvin", "color_name", "effect"];
const OFFLINE = ["unavailable", "unknown"];
const domainOf = (id) => String(id).slice(0, String(id).indexOf("."));
const round1 = (v) => Math.round(v * 10) / 10;
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
const denied = (what) => Object.assign(new Error(`Demo: ${what}`), { code: "demo", quiet: true });

// ------------------------------------------------------------------ Demo-Zustand zu einer echten Entität

function pick(a, keys) {
  const out = {};
  for (const k of keys) if (a?.[k] !== undefined && a[k] !== null) out[k] = a[k];
  if (Array.isArray(a?.entity_id)) out.entity_id = a.entity_id.filter((x) => typeof x === "string");
  return out;
}

function sensorBase(a, h) {
  const unit = a.unit_of_measurement;
  const kind = a.device_class ?? (unit === "°C" ? "temperature" : unit === "kWh" ? "energy" : unit === "W" || unit === "kW" ? "power" : null);
  const table = {
    temperature: [round1(19.5 + (h % 36) / 10), "°C"],
    humidity: [45 + (h % 14), "%"],
    power: [20 + (h % 180), "W"],
    energy: [round1(1 + (h % 300) / 10), "kWh"],
    battery: [85, "%"],
    illuminance: [0, "lx"],
    carbon_dioxide: [600, "ppm"],
    pm25: [8, "µg/m³"],
    pm10: [10, "µg/m³"],
    voltage: [230, "V"],
    current: [0.5, "A"],
    pressure: [1013, "hPa"],
    signal_strength: [-60, "dBm"],
  };
  const row = table[kind];
  if (!row) return { state: "unknown", attrs: {} };
  return { state: String(row[0]), attrs: { device_class: kind, unit_of_measurement: row[1] }, dyn: kind === "illuminance" ? "lux" : undefined };
}

/** Demo-Zustand zu einer echten Entität (ohne ihren Wert): {state, attrs, dyn?} oder null (entfernte Domänen). */
export function demoBase(id, st) {
  const domain = domainOf(id);
  if (REMOVED.has(domain)) return null;
  const a = st?.attributes ?? {};
  const keep = pick(a, ATTR_KEEP);
  const h = hashString(id);
  switch (domain) {
    case "light":
    case "switch":
    case "fan":
    case "input_boolean":
    case "siren":
    case "humidifier":
    case "media_player":
    case "remote":
    case "water_heater":
      return { state: "off", attrs: keep };
    case "cover": {
      const closed = a.device_class === "garage" || a.device_class === "gate";
      return { state: closed ? "closed" : "open", attrs: { ...keep, current_position: closed ? 0 : 100 } };
    }
    case "binary_sensor":
      return { state: "off", attrs: keep };
    case "lock":
      return { state: "locked", attrs: keep };
    case "climate":
      return { state: "heat", attrs: { ...keep, temperature: 21, current_temperature: 21, hvac_action: "idle" } };
    case "vacuum":
      return { state: "docked", attrs: keep };
    case "alarm_control_panel":
      return { state: "disarmed", attrs: keep };
    case "scene":
      return { state: "unknown", attrs: keep };
    case "script":
      return { state: "off", attrs: keep };
    case "automation":
      return { state: st?.state === "off" ? "off" : "on", attrs: keep };
    case "camera":
      return { state: "idle", attrs: keep };
    case "sensor": {
      const s = sensorBase(a, h);
      return { ...s, attrs: { ...keep, ...s.attrs } };
    }
    case "weather":
    case "sun":
      return { state: "unknown", attrs: keep, dyn: domain };
    case "number":
    case "input_number":
      return { state: String(num(a.min, 0)), attrs: keep };
    case "select":
    case "input_select":
      return { state: Array.isArray(a.options) && a.options.length ? String(a.options[0]) : "unknown", attrs: keep };
    case "input_text":
    case "text":
      return { state: "", attrs: keep };
    case "counter":
      return { state: "0", attrs: keep };
    case "timer":
      return { state: "idle", attrs: keep };
    case "valve":
      return { state: "closed", attrs: keep };
    case "lawn_mower":
      return { state: "docked", attrs: keep };
    default:
      return { state: "unknown", attrs: keep };
  }
}

// ------------------------------------------------------------------ Tippen im Demo-Haus

const MOTION = PRESENCE_CLASSES;

/**
 * Aktion für eine Entität im Demo-Haus – wie entityAction, dazu: Kontakte und Bewegungsmelder schalten um (call
 * binary_sensor.toggle), PV-Sensoren öffnen den PV-Dialog (dialog "pv", key = PV-Schlüssel). dialog "moreinfo"
 * bleibt, das Panel zeigt dann den Demo-Dialog statt des HA-Dialogs.
 * @param {{source?: "tap"|"wheel", safety?: boolean, confirm?: boolean, pvKey?: string|null}} [opts] pvKey = demo.pvKeyFor(id)
 */
export function demoAction(id, st, opts = {}) {
  const domain = domainOf(id);
  const base = entityAction(id, st, opts);
  if (opts.pvKey || (domain === "sensor" && /\.h3demo_pv_/.test(id))) return { ...base, call: null, confirm: null, dialog: "pv", key: opts.pvKey ?? null, verb: "" };
  if (domain === "binary_sensor" && st && !OFFLINE.includes(st.state)) {
    const cls = st.attributes?.device_class;
    const contact = CONTACT_CLASSES.includes(cls);
    if (contact || MOTION.includes(cls)) {
      const on = st.state === "on";
      return { call: ["binary_sensor", "toggle"], data: {}, confirm: null, dialog: null, verb: contact ? (on ? "wird geschlossen" : "wird geöffnet") : on ? "Bewegung aus" : "Bewegung an" };
    }
  }
  return base;
}

// ------------------------------------------------------------------ DemoHouse

export class DemoHouse {
  constructor({ houseId = "", now = () => Date.now() } = {}) {
    this.houseId = String(houseId ?? "");
    this.seed = hashString(this.houseId);
    this.time = null;
    this.sim = new Simulator();
    this.previews = new Map();
    this.model = null;
    this.rev = 0;
    this._clock = now;
    this._since = new Date(now()).toISOString();
    this._real = null;
    this._onChange = () => {};
    this._onToast = () => {};
    this._cache = null;
    this._base = null; // Map id → {state, attrs, dyn}
    this._baseKey = null;
    this._static = null;
    this._objs = new Map();
    this._states = {};
    this._bal = null;
    this._ctx = null;
  }

  get log() {
    return this.sim.log;
  }

  /** Demo-Zeitpunkt in ms: jetzt bzw. heute um die gewählte Uhrzeit. */
  now() {
    const t = this._clock();
    return this.time === null ? t : dayStart(t) + this.time * 60000;
  }

  get ctx() {
    const c = this._real?.config;
    const lat = Number(c?.latitude);
    const lon = Number(c?.longitude);
    const la = Number.isFinite(lat) && c?.latitude != null ? lat : 51;
    const lo = Number.isFinite(lon) && c?.longitude != null ? lon : 10;
    if (!this._ctx || this._ctx.lat !== la || this._ctx.lon !== lo) this._ctx = { lat: la, lon: lo, seed: this.seed, sunCache: new Map() };
    return this._ctx;
  }

  sunTimes() {
    return sunTimes(this.now(), this.ctx.lat, this.ctx.lon);
  }

  _invalidate() {
    this.rev++;
    this._cache = null;
  }

  tick() {
    this._invalidate();
    this._onChange();
  }

  reset() {
    this.sim.reset();
    this.time = null;
    this.previews.clear();
    this.tick();
  }

  // aktueller Demo-Zustand einer Entität (Schaltvorgänge seit dem letzten Aufbau eingerechnet)
  _current(id) {
    return this.sim.overrides.get(id) ?? this._states[id] ?? null;
  }

  set(entityId, state, attributes = {}) {
    this.sim.set(entityId, state, attributes, this._current(entityId));
    this.tick();
  }

  setPreview(key, cfg) {
    if (cfg) this.previews.set(key, cfg);
    else this.previews.delete(key);
    this.tick();
  }

  pvKeyFor(entityId) {
    return this.model?.pvKeyByEntity.get(entityId) ?? null;
  }

  source(key) {
    return this.model?.sources.find((s) => s.key === key) ?? null;
  }

  pvConfig(key) {
    const s = this.source(key);
    return resolvePv(s, this.previews.get(key) ?? this._saved().pv[key] ?? null);
  }

  _saved() {
    return normalizeDemoSettings(this.model?.building?.settings?.demo);
  }

  _opts() {
    const sources = this.model?.sources ?? [];
    const saved = this._saved().pv;
    const pvCfg = {};
    for (const s of sources) pvCfg[s.key] = this.previews.get(s.key) ?? saved[s.key] ?? null;
    return { cfg: this.model?.building?.settings?.energy, sources, pvCfg, ctx: this.ctx, baseW: 200 + 35 * (this.model?.rooms.length ?? 0) };
  }

  /** Leistung jetzt und Ertrag heute einer PV-Quelle (aus dem letzten Aufbau, sonst frisch berechnet). */
  pvStats(key) {
    const b = this._bal ?? demoBalance({ ...this._opts(), t: this.now() });
    return { w: b.pv.get(key) ?? 0, kwh: b.pvKwh.get(key) ?? 0 };
  }

  /** Tageskurve einer Quelle für die Vorschau: [[Minute, W], …] im Abstand step Minuten (clouds: false = glatt). */
  curve(key, cfg = null, { clouds = false, step = 10 } = {}) {
    const s = this.source(key);
    if (!s) return [];
    const c = cfg ?? this.previews.get(key) ?? this._saved().pv[key] ?? null;
    const ctx = { ...this.ctx, clouds };
    const d0 = dayStart(this.now());
    const out = [];
    for (let m = 0; m <= 1440; m += step) out.push([m, pvPower(s, c, d0 + m * 60000, ctx)]);
    return out;
  }

  // ---------------------------------------------------------------- Aufbau

  _makeBase(real) {
    this._base = new Map();
    this._objs.clear();
    for (const [id, st] of Object.entries(real.states ?? {})) {
      const b = demoBase(id, st);
      if (b) this._base.set(id, b);
    }
    this._baseKey = real.entities;
    this._baseCount = Object.keys(real.states ?? {}).length;
    this._static = null;
  }

  _stable(id, state, attrs) {
    const sig = `${state}|${JSON.stringify(attrs)}`;
    const prev = this._objs.get(id);
    if (prev && prev.sig === sig) return prev.obj;
    const stamp = prev ? new Date(this._clock()).toISOString() : this._since;
    const obj = { entity_id: id, state, attributes: attrs, last_changed: stamp, last_updated: stamp, context: { id: null, parent_id: null, user_id: null } };
    this._objs.set(id, { sig, obj });
    return obj;
  }

  _makeStatic() {
    const s = {};
    for (const [id, b] of this._base) s[id] = this._stable(id, b.state, b.attrs);
    for (const [id, d] of this.model?.devices ?? []) s[id] = this._stable(id, d.state, { friendly_name: d.name, ...d.attrs });
    this._static = s;
  }

  _build(real) {
    const t = this.now();
    const ctx = this.ctx;
    const model = this.model;
    if (!this._base || this._baseKey !== real.entities || this._baseCount !== Object.keys(real.states ?? {}).length) this._makeBase(real);
    if (!this._static || this._staticModel !== model) {
      this._makeStatic();
      this._staticModel = model;
    }
    const states = { ...this._static };
    const overrides = this.sim.overrides;
    for (const [id, st] of overrides) if (states[id]) states[id] = st;

    // Verbrauch: Grundlast + eingeschaltete Geräte; Raum-Leistung = 35 W + Geräte im Raum
    const devices = model?.devices ?? new Map();
    let load = 200 + 35 * (model?.rooms.length ?? 0);
    const roomW = new Map();
    for (const [id, d] of devices) {
      if (!d.watts) continue;
      const on = d.fixed || (d.kind === "tub" ? states[id]?.state === "open" : states[id]?.state === "on");
      const w = d.fixed ? Math.max(0, num(states[id]?.state)) : d.watts; // Leistungsmesser: sein Wert (im Dialog änderbar)
      if (!on || !w) continue;
      load += w;
      if (d.roomId != null) roomW.set(`${d.floorId}:${d.roomId}`, (roomW.get(`${d.floorId}:${d.roomId}`) ?? 0) + w);
    }
    for (const [id, st] of overrides) {
      if (devices.has(id) || !states[id]) continue;
      const dom = domainOf(id);
      if (st.state === "on") load += dom === "switch" ? 60 : dom === "light" || dom === "fan" ? 40 : 0;
      else if (st.state === "playing" && dom === "media_player") load += 80;
    }

    const put = (id, value, unit, cls, name = null) => {
      if (!id || overrides.has(id)) return;
      const prev = states[id]?.attributes;
      states[id] = this._stable(id, String(value), { friendly_name: prev?.friendly_name ?? name ?? id, ...(prev ?? {}), unit_of_measurement: unit, device_class: cls, state_class: cls === "energy" ? "total_increasing" : "measurement" });
    };

    // Sonne und Wetter
    const sun = sunPosition(t, ctx.lat, ctx.lon);
    const sunBase = this._base.get("sun.sun")?.attrs ?? {};
    if (!overrides.has("sun.sun")) states["sun.sun"] = this._stable("sun.sun", sun.elevation > -0.83 ? "above_horizon" : "below_horizon", { ...sunBase, friendly_name: sunBase.friendly_name ?? "Sonne", azimuth: round1(sun.azimuth), elevation: round1(sun.elevation), rising: sun.azimuth < 180 });
    const wid = new Set(["weather.h3demo", ...[...this._base].filter(([, b]) => b.dyn === "weather").map(([id]) => id)]);
    const cfgWeather = model?.building?.settings?.weather;
    if (typeof cfgWeather === "string" && cfgWeather.startsWith("weather.")) wid.add(cfgWeather);
    const weather = demoWeather(t, this.seed, sun.elevation);
    for (const id of wid) {
      if (overrides.has(id)) continue;
      const prev = this._base.get(id)?.attrs ?? {};
      states[id] = this._stable(id, weather, { ...prev, friendly_name: prev.friendly_name ?? "Wetter", temperature: 18, temperature_unit: "°C", humidity: 55, pressure: 1015, wind_speed: 8, wind_speed_unit: "km/h" });
    }
    const lux = Math.round(Math.max(0, Math.sin((sun.elevation * Math.PI) / 180)) * 18000 * (weather === "partlycloudy" ? 0.7 : 1));
    for (const [id, b] of this._base) if (b.dyn === "lux") put(id, lux, "lx", "illuminance");

    // PV, Energie
    const o = { ...this._opts(), t, load };
    const bal = demoBalance(o);
    this._bal = bal;
    for (const s of o.sources) {
      put(s.entity, bal.pv.get(s.key) ?? 0, "W", "power", s.name);
      if (s.energyEntity) put(s.energyEntity, bal.pvKwh.get(s.key) ?? 0, "kWh", "energy", `${s.name} Ertrag heute`);
    }
    const e = normalizeEnergy(o.cfg);
    for (const s of e.sources) {
      if (bal.gens.has(s.id)) {
        put(s.power, bal.gens.get(s.id), "W", "power", s.name);
        put(s.energy, bal.gensKwh.get(s.id) ?? 0, "kWh", "energy", `${s.name} Ertrag heute`);
      }
      if (bal.stores.has(s.id)) {
        const w = bal.stores.get(s.id) * (s.invert ? -1 : 1);
        if (s.type === "speicher") put(s.power, w, "W", "power", s.name);
        else put(s.bat_power, w, "W", "power", `${s.name} Speicher`);
        put(s.soc, bal.soc, "%", "battery", `${s.name} Ladestand`);
      }
    }
    put(e.haus, bal.haus, "W", "power", "Hausverbrauch");
    put(e.netz, e.netz_invert ? -bal.netz : bal.netz, "W", "power", "Netz");
    put(e.netz_bezug, Math.max(0, bal.netz), "W", "power", "Netzbezug");
    put(e.netz_einspeisung, Math.max(0, -bal.netz), "W", "power", "Einspeisung");
    for (const [id, d] of devices) if (d.dyn === "roomPower") put(id, 35 + (roomW.get(`${d.floorId}:${d.roomId}`) ?? 0), "W", "power", d.name);
    this._states = states;

    const entities = this._entities(real);
    return {
      ...pickReal(real),
      states,
      entities,
      devices: real.devices,
      areas: this._areas(real),
      connection: null,
      haus3dSimulation: true,
      haus3dDemo: true,
      callApi: async () => {
        throw denied("in Home Assistant wird nichts angelegt.");
      },
      callService: async (domain, service, data = {}, target = null) => this._callService(domain, service, data, target),
      callWS: (msg, ...rest) => this._callWS(msg, rest),
    };
  }

  _entities(real) {
    const k = this._entKey;
    if (k && k.real === real.entities && k.model === this.model) return k.value;
    const value = { ...(real.entities ?? {}) };
    for (const [id, d] of this.model?.devices ?? []) value[id] = { entity_id: id, area_id: d.area ?? null, platform: "haus3d_demo" };
    this._entKey = { real: real.entities, model: this.model, value };
    return value;
  }

  _areas(real) {
    const k = this._areaKey;
    if (k && k.real === real.areas && k.model === this.model) return k.value;
    const value = { ...(real.areas ?? {}), ...(this.model?.areas ?? {}) };
    this._areaKey = { real: real.areas, model: this.model, value };
    return value;
  }

  wrap(real, { onChange, onToast } = {}) {
    if (!real) return real;
    this._real = real;
    if (onChange) this._onChange = onChange;
    if (onToast) this._onToast = onToast;
    const key = [real.entities, real.devices, real.areas, real.themes, real.user, real.config, real.locale];
    const c = this._cache;
    if (c && c.rev === this.rev && c.key.every((v, i) => v === key[i])) return c.hass;
    const hass = this._build(real);
    this._cache = { rev: this.rev, key, hass };
    return hass;
  }

  // ---------------------------------------------------------------- Dienste und Befehle

  _callService(domain, service, data, target) {
    const ids = [].concat(data?.entity_id ?? [], target?.entity_id ?? []).filter((x) => typeof x === "string");
    for (const id of ids) this._apply(domain === "homeassistant" ? domainOf(id) : domain, service, id, this._current(id), data ?? {});
    const sim = this.sim;
    sim.log.push({ domain, service, entity_id: ids.join(",") });
    if (sim.log.length > 50) sim.log.shift();
    if (!ids.length) this._onToast(`Demo: ${domain}.${service}`);
    this._invalidate();
    this._onChange();
  }

  _apply(domain, service, id, st, data) {
    if (!st) return; // unbekannte Entität: nichts anlegen
    if (domain === "light" && (service === "turn_on" || (service === "toggle" && st.state !== "on"))) {
      return this.sim.set(id, "on", pick(data, LIGHT_KEYS), st);
    }
    if (domain === "vacuum") {
      const to = { start: "cleaning", pause: "paused", stop: "idle", return_to_base: "docked" }[service];
      return to ? this.sim.set(id, to, {}, st) : null;
    }
    if (domain === "alarm_control_panel") {
      const to = { alarm_arm_home: "armed_home", alarm_arm_away: "armed_away", alarm_arm_night: "armed_night", alarm_disarm: "disarmed" }[service];
      return to ? this.sim.set(id, to, {}, st) : null;
    }
    if (domain === "fan" && service === "set_percentage") return this.sim.set(id, Number(data.percentage) > 0 ? "on" : "off", { percentage: Number(data.percentage) || 0 }, st);
    return this.sim.service(domain, service, id, st, data);
  }

  _inject(res) {
    const real = this._real;
    if (!res?.building || typeof res.building !== "object") return res;
    try {
      this.model = demoInject(res.building, { realEntities: real?.entities ?? {}, realDevices: real?.devices ?? {}, realStates: real?.states ?? {} });
    } catch {
      this.model = null; // unlesbares Gebäude: ohne Demo-Geräte weiter
      return res;
    }
    this._invalidate();
    setTimeout(() => this._onChange(), 0);
    return { ...res, building: structuredClone(this.model.building) };
  }

  async _callWS(msg, rest) {
    const real = this._real;
    const type = msg?.type ?? "";
    if (type === "haus3d/building/get" || type === "haus3d/history/restore") return this._inject(await real.callWS(msg, ...rest));
    if (type === "haus3d/building/save") return this._inject(await real.callWS(msg?.building ? { ...msg, building: demoStrip(msg.building) } : msg, ...rest));
    if (type === "recorder/statistics_during_period") return this._stats(msg);
    if (type === "history/history_during_period") return {};
    if (!DEMO_WS_PASS.includes(type)) throw denied(`${type} ist gesperrt, es geht nichts an Home Assistant.`);
    return real.callWS(msg, ...rest);
  }

  // Entität → Zeitreihe (Schnappschuss → Wert) für Statistik-Antworten
  _extractors() {
    const m = new Map();
    const o = this._opts();
    const w = (f) => (s) => f(s);
    for (const s of o.sources) {
      m.set(s.entity, w((x) => x.pv.get(s.key)));
      if (s.energyEntity) m.set(s.energyEntity, w((x) => x.pvKwh.get(s.key) ?? 0));
    }
    const e = normalizeEnergy(o.cfg);
    for (const s of e.sources) {
      if (s.type !== "speicher" && s.power) {
        m.set(s.power, w((x) => x.gens.get(s.id)));
        if (s.energy) m.set(s.energy, w((x) => x.gensKwh.get(s.id) ?? 0));
      }
      const store = s.type === "speicher" ? s.power : s.bat_power;
      if (store) m.set(store, w((x) => (x.stores.has(s.id) ? x.stores.get(s.id) * (s.invert ? -1 : 1) : null)));
      if (s.soc) m.set(s.soc, w((x) => (x.stores.has(s.id) ? x.soc : null)));
    }
    if (e.haus) m.set(e.haus, w((x) => x.haus));
    if (e.netz) m.set(e.netz, w((x) => (e.netz_invert ? -x.netz : x.netz)));
    if (e.netz_bezug) m.set(e.netz_bezug, w((x) => Math.max(0, x.netz)));
    if (e.netz_einspeisung) m.set(e.netz_einspeisung, w((x) => Math.max(0, -x.netz)));
    return { m, o };
  }

  _stats(msg) {
    if ((msg.period ?? "5minute") !== "5minute") return {};
    const ids = Array.isArray(msg.statistic_ids) ? msg.statistic_ids.filter((x) => typeof x === "string") : [];
    const { m, o } = this._extractors();
    const known = ids.filter((id) => m.has(id));
    if (!known.length) return {};
    const now = this.now();
    let end = Date.parse(msg.end_time);
    let start = Date.parse(msg.start_time);
    if (!Number.isFinite(end)) end = now;
    if (!Number.isFinite(start)) start = end - 24 * 3600000;
    if (this.time !== null && dayStart(end) === dayStart(now)) end = Math.min(end, now); // Tagesverlauf endet bei der Demo-Uhrzeit
    start = Math.max(start, end - 3 * 24 * 3600000);
    if (!(end > start)) return {};
    return demoSeries(known, start, end, {
      sweep: (a, b) => demoSweep({ ...o, loadAt: (t) => baseLoadProfile(t, o.baseW) }, a, b),
      value: (id, snap) => {
        const v = m.get(id)(snap);
        return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
      },
    });
  }
}

// aus dem echten hass übernommen: nur Konfiguration und reine Formatierfunktionen (kein Zustand, keine Aufrufe)
function pickReal(real) {
  const out = { config: real.config, locale: real.locale, user: real.user, themes: real.themes, language: real.language, selectedLanguage: real.selectedLanguage };
  for (const k of ["localize", "formatEntityState", "formatEntityAttributeName", "formatEntityAttributeValue"]) if (typeof real[k] === "function") out[k] = real[k];
  return out;
}

export { isDemoId };
