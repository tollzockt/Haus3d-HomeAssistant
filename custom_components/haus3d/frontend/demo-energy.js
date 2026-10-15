// Demo-Modus, Energie-Modell (rein, ohne DOM, mit node testbar): Sonnenzeiten, Wolken, PV-Kurve je Quelle,
// Bilanz aus Erzeugung, Last, Speicher und Netz, Tagesverlauf (Ladestand und „Ertrag heute“ deterministisch).
//
// Zeit: alle Zeitpunkte sind ms (Date.now()-Zählung). „Minute m“ = Minuten seit Mitternacht der Ortszeit des
// Browsers. Gleiche Zeit ⇒ gleicher Wert in allen Browsern (Wolken-Rauschen aus Zeit und Haus-Kennung).
//
// Kurve einer PV-Quelle (cfg = {min, max, from, to}; min/max in W, from/to in Minuten oder null = Sonnenauf-/
// -untergang): innerhalb des Zeitfensters, x = (m − from)/(to − from) in (0, 1):
//   P = (min + (max − min) · sin(πx)^1.5) · wolke(t), auf 1 W gerundet; außerhalb 0 W.
// „von“ gilt also am Rand des Zeitfensters, „bis“ ist die Spitze zur Mitte.

import { simEnergy } from "./sim.js";
import { normalizeEnergy } from "./energymodel.js";
import { sunPosition } from "./sun.js";

export const PV_MAX_W = 100000;
export const STEP_MS = 5 * 60000;
export const START_SOC = 30;
export const DEFAULT_CAPACITY = 10;
const DAY_MIN = 1440;
const HORIZON = -0.83; // Sonnenoberkante am Horizont (Refraktion)

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Beginn des Tages (Ortszeit des Browsers) zu einem Zeitpunkt in ms. */
export function dayStart(t) {
  const d = new Date(Number(t));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 32-Bit-Hash einer Zeichenkette (FNV-1a), z. B. als Saat aus der Haus-Kennung. */
export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s ?? "")) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// Zufallswert [0, 1) je Gitterpunkt
function cell(seed, i) {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// glattes Wertrauschen (Smoothstep zwischen den Gitterpunkten)
function smooth(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return cell(seed, i) * (1 - u) + cell(seed, i + 1) * u;
}

/** Wolkenrauschen n(t) in [0, 1]: 10-min-Abschnitte plus zweite Oktave (2,5 min, halbe Stärke). */
export function cloudNoise(t, seed = 0) {
  const s = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return (smooth(s, Number(t) / 600000) + 0.5 * smooth(s ^ 0x5bd1e995, Number(t) / 150000)) / 1.5;
}

/** Wolkenfaktor in [0,85; 1]: Wolken nehmen höchstens 15 % der Leistung. */
export const cloudFactor = (t, seed = 0) => 1 - 0.15 * cloudNoise(t, seed);

/** Wetterzustand des Demo-Hauses: nachts „clear-night“, tagsüber „sunny“ bzw. „partlycloudy“. */
export function demoWeather(t, seed, elevation) {
  if (Number.isFinite(elevation) && elevation <= HORIZON) return "clear-night";
  return cloudNoise(t, seed) < 0.5 ? "sunny" : "partlycloudy";
}

/** Minuten seit Mitternacht als „HH:MM“. */
export function minutesText(m) {
  const r = (((Math.round(Number(m)) % DAY_MIN) + DAY_MIN) % DAY_MIN) | 0;
  return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
}

/**
 * Sonnenauf- und -untergang eines Tages in Minuten seit Mitternacht der Ortszeit (auf 5 min gerundet):
 * Nullstellen von Sonnenhöhe + 0,83° per Halbierung. Polartag/-nacht: 06:00–18:00 (polar: true).
 * @param {Date|number} day beliebiger Zeitpunkt des Tages
 * @returns {{rise: number, set: number, polar: boolean}}
 */
export function sunTimes(day, lat = 51, lon = 10) {
  const d0 = dayStart(day instanceof Date ? day.getTime() : day);
  const la = Number.isFinite(Number(lat)) ? Number(lat) : 51;
  const lo = Number.isFinite(Number(lon)) ? Number(lon) : 10;
  const h = (m) => sunPosition(d0 + m * 60000, la, lo).elevation - HORIZON;
  let best = -Infinity;
  let low = Infinity;
  let noon = 0;
  for (let m = 0; m <= DAY_MIN; m += 10) {
    const e = h(m);
    if (e > best) {
      best = e;
      noon = m;
    }
    if (e < low) low = e;
  }
  if (best <= 0 || low >= 0) return { rise: 360, set: 1080, polar: true };
  // Mittag verfeinern (flaches Maximum: Dreiteilungssuche)
  let a = noon - 10;
  let b = noon + 10;
  for (let i = 0; i < 40; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (h(m1) < h(m2)) a = m1;
    else b = m2;
  }
  noon = (a + b) / 2;
  const cross = (neg, pos) => {
    let n = neg;
    let p = pos;
    for (let i = 0; i < 40; i++) {
      const mid = (n + p) / 2;
      if (h(mid) > 0) p = mid;
      else n = mid;
    }
    return (n + p) / 2;
  };
  const r5 = (m) => Math.round(m / 5) * 5;
  return { rise: r5(cross(noon - 720, noon)), set: r5(cross(noon + 720, noon)), polar: false };
}

// Sonnenzeiten je Tag zwischenspeichern (ctx.sunCache)
function sunOf(ctx, t) {
  const d0 = dayStart(t);
  if (!ctx || typeof ctx !== "object") return sunTimes(d0);
  const cache = (ctx.sunCache ??= new Map());
  let s = cache.get(d0);
  if (!s) {
    s = sunTimes(d0, ctx.lat, ctx.lon);
    cache.set(d0, s);
    if (cache.size > 14) cache.delete(cache.keys().next().value);
  }
  return s;
}

const clampW = (v) => (isNum(v) ? Math.min(PV_MAX_W, Math.max(0, v)) : null);
const minute = (v) => (v === null || v === undefined || v === "" ? null : isNum(Number(v)) && Number(v) >= 0 && Number(v) <= DAY_MIN - 1 ? Math.round(Number(v)) : null);

/** Wirksame Einstellung einer Quelle: Vorgaben der Quelle, überlagert von cfg ({min, max, from, to}). */
export function resolvePv(source, cfg) {
  const d = source?.defaults ?? {};
  const min = clampW(cfg?.min) ?? clampW(d.min) ?? 0;
  const max = Math.max(min, clampW(cfg?.max) ?? clampW(d.max) ?? 0);
  return { min, max, from: cfg ? minute(cfg.from) : minute(d.from), to: cfg ? minute(cfg.to) : minute(d.to) };
}

/** Prüfung für den PV-Dialog: Fehlertext oder null. */
export function validateDemoPv(cfg) {
  const min = Number(cfg?.min);
  const max = Number(cfg?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "Leistung als Zahl eingeben.";
  if (min < 0 || max > PV_MAX_W) return "Die Leistung liegt zwischen 0 und 100 000 W.";
  if (max < min) return "„bis“ muss mindestens so groß sein wie „von“.";
  const from = minute(cfg?.from);
  const to = minute(cfg?.to);
  if ((cfg?.from ?? null) !== null && cfg.from !== "" && from === null) return "Zeitfenster „von“ ungültig.";
  if ((cfg?.to ?? null) !== null && cfg.to !== "" && to === null) return "Zeitfenster „bis“ ungültig.";
  if (from !== null && to !== null && to <= from) return "Das Zeitfenster endet vor seinem Anfang.";
  return null;
}

/**
 * settings.demo lesen (weich): {pv: {<Schlüssel>: {min, max, from, to}}}. Ungültiges wird verworfen, Leistung
 * auf 0…100 000 W begrenzt, bis ≥ von; from/to: Minuten 0…1439 oder null (Sonne), ein Fenster, das vor seinem
 * Anfang endet, fällt auf Sonnenauf-/-untergang zurück. Höchstens 200 Einträge.
 */
export function normalizeDemoSettings(raw) {
  const out = { pv: {} };
  const pv = raw && typeof raw === "object" && raw.pv && typeof raw.pv === "object" && !Array.isArray(raw.pv) ? raw.pv : {};
  let n = 0;
  for (const [key, v] of Object.entries(pv)) {
    if (n >= 200) break;
    if (!key || key.length > 80 || !v || typeof v !== "object") continue;
    const min = clampW(typeof v.min === "string" && v.min.trim() !== "" ? Number(v.min) : v.min);
    const max = clampW(typeof v.max === "string" && v.max.trim() !== "" ? Number(v.max) : v.max);
    if (min === null || max === null) continue;
    let from = minute(v.from);
    let to = minute(v.to);
    if (from !== null && to !== null && to <= from) from = to = null;
    out.pv[key] = { min, max: Math.max(min, max), from, to };
    n++;
  }
  return out;
}

/** Kurve einer PV-Quelle zur Zeit t (W, ganz). ctx = {lat, lon, seed, sunCache?, clouds?}. */
export function pvPower(source, cfg, t, ctx = {}) {
  const c = resolvePv(source, cfg);
  const day0 = dayStart(t);
  const m = (Number(t) - day0) / 60000;
  let { from, to } = c;
  if (from === null || to === null) {
    const s = sunOf(ctx, t);
    from ??= s.rise;
    to ??= s.set;
  }
  if (!(to > from)) return 0;
  const x = (m - from) / (to - from);
  if (!(x > 0 && x < 1)) return 0;
  const cloud = ctx?.clouds === false ? 1 : cloudFactor(t, ctx?.seed ?? 0); // clouds: false = glatte Kurve (Vorschau)
  return Math.max(0, Math.round((c.min + (c.max - c.min) * Math.sin(Math.PI * x) ** 1.5) * cloud));
}

/** Grundlast des Hauses im Tagesverlauf (ohne Sitzungsschaltungen): morgens und abends höher, nachts niedriger. */
export function baseLoadProfile(t, baseW = 300) {
  const m = (Number(t) - dayStart(t)) / 60000;
  const g = (c, w) => Math.exp(-(((m - c) / w) ** 2));
  return Math.round(baseW * (0.8 + 0.6 * g(450, 60) + 0.9 * g(1140, 120) + 0.3 * g(750, 60)));
}

/** Kapazität der Speicher (kWh): Summe der eingestellten Kapazitäten, sonst 10 kWh. */
export function storeCapacity(cfg) {
  const e = normalizeEnergy(cfg);
  const sum = e.sources.filter((s) => s.type === "speicher" || s.soc || s.bat_power).reduce((a, s) => a + (s.capacity ?? 0), 0);
  return sum > 0 ? sum : DEFAULT_CAPACITY;
}

// Bilanz zu einer Leistung: simEnergy, aber ein voller Speicher lädt nicht weiter
function balanceAt(cfg, solar, load, soc) {
  const b = simEnergy(cfg, solar, load, soc);
  if (soc >= 100 - 1e-9) {
    let fixed = 0;
    for (const [id, w] of b.stores) {
      if (w > 0) {
        b.stores.set(id, 0);
        fixed += w;
      }
    }
    b.netz -= fixed;
  }
  return b;
}

/**
 * Augenblickswerte zur Zeit t: PV je Quelle, Summe über die Erzeuger der Energie-Einstellung (o.cfg), Bilanz.
 * Quellen mit kind "cfg" gehören genau einem Erzeuger der Einstellung (cfgId), alle anderen teilen sich je
 * Gruppe ("pv" / "bkw") auf die gleichartigen Erzeuger.
 */
function instant(o, t, load, soc) {
  const pv = new Map();
  for (const s of o.sources ?? []) pv.set(s.key, pvPower(s, o.pvCfg?.[s.key], t, o.ctx));
  const e = normalizeEnergy(o.cfg);
  const gensCfg = e.sources.filter((s) => s.type !== "speicher" && s.power);
  const byType = new Map();
  const byCfg = new Map();
  for (const s of o.sources ?? []) {
    const w = pv.get(s.key);
    if (s.kind === "cfg") byCfg.set(s.cfgId, (byCfg.get(s.cfgId) ?? 0) + w);
    else byType.set(s.group, (byType.get(s.group) ?? 0) + w);
  }
  const shared = (type) => gensCfg.filter((g) => g.type === type && !byCfg.has(g.id)).length || 1;
  const gens = new Map(gensCfg.map((g) => [g.id, byCfg.has(g.id) ? byCfg.get(g.id) : Math.round((byType.get(g.type) ?? 0) / shared(g.type))]));
  const solar = [...gens.values()].reduce((a, b) => a + b, 0);
  const bal = balanceAt(o.cfg, solar, load, soc);
  return { pv, solar, gens, bal };
}

// Tag ab Mitternacht in 5-min-Schritten integrieren (Start 30 %, Grundlast-Profil); onStep(b, Zustand) nach jedem Schritt
function integrate(o, day0, until, onStep = null) {
  const cap = storeCapacity(o.cfg);
  const loadAt = o.loadAt ?? ((t) => baseLoadProfile(t, o.baseW ?? 300));
  const st = { soc: START_SOC, kwhToday: 0, pvKwh: new Map(), gensKwh: new Map() };
  const stop = Math.min(until, dayStart(day0 + 30 * 3600000));
  for (let a = day0; a < stop; ) {
    const b = Math.min(a + STEP_MS, stop);
    const mid = (a + b) / 2;
    const dt = (b - a) / 3600000;
    const r = instant(o, mid, loadAt(mid), st.soc);
    for (const [k, w] of r.pv) st.pvKwh.set(k, (st.pvKwh.get(k) ?? 0) + (w * dt) / 1000);
    for (const [k, w] of r.gens) st.gensKwh.set(k, (st.gensKwh.get(k) ?? 0) + (w * dt) / 1000);
    st.kwhToday += (r.solar * dt) / 1000;
    const charge = [...r.bal.stores.values()].reduce((x, y) => x + y, 0);
    st.soc = Math.min(100, Math.max(0, st.soc + ((charge * dt) / 1000 / cap) * 100));
    a = b;
    onStep?.(b, st);
  }
  return st;
}

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Bilanz zur Zeit t. Eingabe o: {cfg, sources, pvCfg, ctx, t, load, loadAt?, baseW?}
 *   cfg      settings.energy (Erzeuger, Speicher, Netz)
 *   sources  Liste aus demoSources (key, kind, group, cfgId, defaults)
 *   pvCfg    {<Schlüssel>: {min, max, from, to}} (gespeichert, ggf. mit Vorschau überlagert)
 *   ctx      {lat, lon, seed}
 *   load     Hausverbrauch jetzt in W (Sitzung); ohne: Grundlast-Profil
 * @returns {{pv: Map<string, number>, pvKwh: Map<string, number>, gens: Map<string, number>, gensKwh: Map<string, number>,
 *   solar: number, haus: number, netz: number, stores: Map<string, number>, soc: number, kwhToday: number}}
 *   netz > 0 = Bezug, Speicherleistung > 0 = laden, soc in %, kwhToday = Ertrag heute aller Erzeuger in kWh
 */
export function demoBalance(o) {
  const t = Number(o.t ?? Date.now());
  const acc = integrate(o, dayStart(t), t);
  const load = isNum(o.load) ? o.load : (o.loadAt ?? ((x) => baseLoadProfile(x, o.baseW ?? 300)))(t);
  const r = instant(o, t, load, acc.soc);
  return {
    pv: r.pv,
    pvKwh: new Map([...acc.pvKwh].map(([k, v]) => [k, round3(v)])),
    gens: r.gens,
    gensKwh: new Map([...acc.gensKwh].map(([k, v]) => [k, round3(v)])),
    solar: r.solar,
    haus: r.bal.haus,
    netz: r.bal.netz,
    stores: r.bal.stores,
    soc: round1(acc.soc),
    kwhToday: round3(acc.kwhToday),
  };
}

/**
 * Schnappschüsse im 5-min-Raster für [from, to] (mit Grundlast-Profil statt Sitzungslast); jeder Tag wird ab
 * Mitternacht integriert. Schnappschuss t = Ende des Abschnitts; Form wie demoBalance plus t.
 */
export function demoSweep(o, from, to) {
  const out = [];
  for (let day0 = dayStart(from); day0 < to; day0 = dayStart(day0 + 30 * 3600000)) {
    integrate(o, day0, to, (b, st) => {
      if (b <= from || b - STEP_MS >= to) return;
      const loadAt = o.loadAt ?? ((x) => baseLoadProfile(x, o.baseW ?? 300));
      const r = instant(o, b, loadAt(b), st.soc);
      out.push({
        t: b,
        pv: r.pv,
        pvKwh: new Map([...st.pvKwh].map(([k, v]) => [k, round3(v)])),
        gens: r.gens,
        gensKwh: new Map([...st.gensKwh].map(([k, v]) => [k, round3(v)])),
        solar: r.solar,
        haus: r.bal.haus,
        netz: r.bal.netz,
        stores: r.bal.stores,
        soc: round1(st.soc),
        kwhToday: round3(st.kwhToday),
      });
    });
  }
  return out;
}

/**
 * Zeitreihen im Format von recorder/statistics_during_period (period „5minute“, Mittelwert):
 * {<Entität>: [{start, end, mean}]} (ms). Nur Entitäten, für die ctx.value einen Wert liefert.
 * @param {string[]} ids
 * @param {number} start ms
 * @param {number} end ms
 * @param {{sweep: (from: number, to: number) => object[], value: (id: string, snap: object) => number|null, step?: number}} ctx
 */
export function demoSeries(ids, start, end, ctx) {
  const step = ctx.step ?? STEP_MS;
  const snaps = ctx.sweep(start, end);
  const out = {};
  for (const id of ids ?? []) {
    const rows = [];
    for (const s of snaps) {
      const v = ctx.value(id, s);
      if (Number.isFinite(v)) rows.push({ start: s.t - step, end: s.t, mean: v });
    }
    if (rows.length) out[id] = rows;
  }
  return out;
}
