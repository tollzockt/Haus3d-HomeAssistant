// Demo-Modus, Energie-Modell: Sonnenzeiten, Wolken, PV-Kurve, Bilanz, Ladestand, Tagesverlauf
process.env.TZ = "Europe/Berlin"; // Ortszeit des Browsers: feste Zeitzone, damit die Sonnenzeiten überall gleich sind
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  START_SOC,
  baseLoadProfile,
  cloudFactor,
  dayStart,
  demoBalance,
  demoSeries,
  demoSweep,
  demoWeather,
  hashString,
  minutesText,
  normalizeDemoSettings,
  pvPower,
  resolvePv,
  sunTimes,
  validateDemoPv,
} from "../../custom_components/haus3d/frontend/demo-energy.js";
import { sunPosition } from "../../custom_components/haus3d/frontend/sun.js";

const CTX = { lat: 51, lon: 10, seed: hashString("haus-1") };
const at = (m, d, h, min = 0) => new Date(2026, m, d, h, min).getTime();
const SRC = { key: "roof:pv_1", kind: "roof", group: "pv", defaults: { min: 0, max: 3000, from: null, to: null } };

test("Sonnenzeiten: 51° N im Juni und Dezember, auf 5 min gerundet, Mitte = Sonnenmittag", () => {
  const jun = sunTimes(new Date(2026, 5, 21, 12), 51, 10);
  const dec = sunTimes(new Date(2026, 11, 21, 12), 51, 10);
  for (const s of [jun, dec]) {
    assert.equal(s.polar, false);
    assert.equal(s.rise % 5, 0);
    assert.equal(s.set % 5, 0);
    assert.ok(s.set > s.rise);
  }
  const len = (s) => (s.set - s.rise) / 60;
  assert.ok(len(jun) > 16 && len(jun) < 17.2, `Juni ${len(jun)} h`);
  assert.ok(len(dec) > 7.5 && len(dec) < 8.8, `Dezember ${len(dec)} h`);
  assert.ok(jun.rise < dec.rise && jun.set > dec.set);
  // Mitte des Tages liegt beim höchsten Sonnenstand (±15 min)
  for (const [s, day] of [[jun, new Date(2026, 5, 21)], [dec, new Date(2026, 11, 21)]]) {
    const d0 = dayStart(day.getTime());
    let best = 0;
    let bm = 0;
    for (let m = 0; m < 1440; m += 5) {
      const e = sunPosition(d0 + m * 60000, 51, 10).elevation;
      if (e > best) [best, bm] = [e, m];
    }
    assert.ok(Math.abs((s.rise + s.set) / 2 - bm) <= 15, `${(s.rise + s.set) / 2} vs ${bm}`);
  }
});

test("Sonnenzeiten: Polartag und Polarnacht → 06:00–18:00", () => {
  assert.deepEqual(sunTimes(new Date(2026, 5, 21, 12), 80, 10), { rise: 360, set: 1080, polar: true });
  assert.deepEqual(sunTimes(new Date(2026, 11, 21, 12), 80, 10), { rise: 360, set: 1080, polar: true });
  assert.equal(minutesText(1080), "18:00");
  assert.equal(minutesText(365), "06:05");
});

test("Wolken: höchstens 15 %, deterministisch, je Haus anders, ohne Sprünge", () => {
  const seeds = [hashString("a"), hashString("b")];
  let lo = 1;
  let hi = 0;
  let jump = 0;
  const t0 = at(5, 21, 0);
  for (let i = 0; i < 24 * 60; i++) {
    const t = t0 + i * 60000;
    const f = cloudFactor(t, seeds[0]);
    assert.ok(f >= 0.85 - 1e-12 && f <= 1 + 1e-12, `${f}`);
    lo = Math.min(lo, f);
    hi = Math.max(hi, f);
    jump = Math.max(jump, Math.abs(f - cloudFactor(t + 60000, seeds[0])));
    assert.equal(f, cloudFactor(t, seeds[0])); // gleiche Zeit, gleicher Wert
  }
  assert.ok(hi - lo > 0.05, "es gibt Wolken");
  assert.ok(jump < 0.06, `Sprung ${jump}`);
  assert.notEqual(cloudFactor(t0 + 3600000, seeds[0]), cloudFactor(t0 + 3600000, seeds[1]));
  assert.equal(cloudFactor(t0, "haus-1"), cloudFactor(t0, hashString("haus-1")));
});

test("Wetter: nachts klar, tagsüber sonnig oder wechselhaft", () => {
  assert.equal(demoWeather(at(5, 21, 2), 7, -30), "clear-night");
  const seen = new Set();
  for (let h = 0; h < 200; h++) seen.add(demoWeather(at(5, 21, 12) + h * 3600000, 7, 50));
  assert.deepEqual([...seen].sort(), ["partlycloudy", "sunny"]);
});

test("PV-Kurve: 0 außerhalb, min am Rand, Spitze zur Mitte, Wolken höchstens 15 %", () => {
  const sun = sunTimes(new Date(2026, 5, 21, 12), 51, 10);
  const day = at(5, 21, 0);
  const p = (m) => pvPower(SRC, null, day + m * 60000, CTX);
  assert.equal(p(sun.rise - 30), 0);
  assert.equal(p(sun.set + 30), 0);
  assert.equal(p(0), 0);
  const mid = Math.round((sun.rise + sun.set) / 2);
  assert.ok(p(mid) >= 3000 * 0.85 - 1 && p(mid) <= 3000, `Mitte ${p(mid)}`);
  assert.ok(p(sun.rise + 10) < 400 && p(sun.rise + 10) > 0);
  // mit „von“: am Rand des Fensters
  const cfg = { min: 200, max: 3000, from: 8 * 60, to: 18 * 60 };
  const q = (m) => pvPower(SRC, cfg, day + m * 60000, CTX);
  assert.equal(q(7 * 60 + 59), 0);
  assert.equal(q(18 * 60 + 1), 0);
  assert.ok(q(8 * 60 + 1) >= 200 * 0.85 - 1 && q(8 * 60 + 1) <= 200 + 1, `Rand ${q(8 * 60 + 1)}`);
  assert.ok(q(17 * 60 + 59) >= 200 * 0.85 - 1 && q(17 * 60 + 59) <= 201);
  assert.ok(q(13 * 60) >= 3000 * 0.85 - 1 && q(13 * 60) <= 3000);
  // Verlauf: steigt bis zur Mitte, fällt danach (Wolken ≤ 15 % stören die Ordnung der Eckpunkte nicht)
  assert.ok(q(9 * 60) < q(11 * 60) && q(17 * 60) < q(15 * 60));
  // glatte Kurve ohne Wolken: genau max in der Mitte
  assert.equal(pvPower(SRC, cfg, day + 13 * 60 * 60000, { ...CTX, clouds: false }), 3000);
  // deterministisch
  assert.equal(q(600), q(600));
});

test("PV-Einstellung: Vorgaben, min/max/Fenster, ungültige Werte", () => {
  assert.deepEqual(resolvePv(SRC, null), { min: 0, max: 3000, from: null, to: null });
  assert.deepEqual(resolvePv(SRC, { min: 100, max: 50, from: 480, to: 1080 }), { min: 100, max: 100, from: 480, to: 1080 });
  assert.equal(validateDemoPv({ min: 0, max: 3000, from: null, to: null }), null);
  assert.equal(validateDemoPv({ min: 500, max: 100 }), "„bis“ muss mindestens so groß sein wie „von“.");
  assert.match(validateDemoPv({ min: -1, max: 10 }), /0 und 100 000/);
  assert.match(validateDemoPv({ min: 0, max: 100001 }), /0 und 100 000/);
  assert.equal(validateDemoPv({ min: 0, max: 1, from: 600, to: 500 }), "Das Zeitfenster endet vor seinem Anfang.");
  assert.match(validateDemoPv({ min: "x", max: 1 }), /Zahl/);
});

test("settings.demo: weich gelesen, begrenzt, höchstens 200 Einträge", () => {
  assert.deepEqual(normalizeDemoSettings(null), { pv: {} });
  assert.deepEqual(normalizeDemoSettings({ pv: "x" }), { pv: {} });
  const n = normalizeDemoSettings({
    pv: {
      "roof:a": { min: 0, max: 3000, from: 480, to: 1080 },
      "roof:b": { min: -5, max: 999999, from: null, to: null },
      "roof:c": { min: 500, max: 100 },
      "roof:d": { min: 0, max: 10, from: 900, to: 800 },
      "roof:e": { min: "12", max: "15", from: "abc" },
      "roof:f": { min: "x", max: 5 },
      "roof:g": "kaputt",
      "": { min: 0, max: 1 },
    },
  });
  assert.deepEqual(n.pv["roof:a"], { min: 0, max: 3000, from: 480, to: 1080 });
  assert.deepEqual(n.pv["roof:b"], { min: 0, max: 100000, from: null, to: null });
  assert.deepEqual(n.pv["roof:c"], { min: 500, max: 500, from: null, to: null });
  assert.deepEqual(n.pv["roof:d"], { min: 0, max: 10, from: null, to: null });
  assert.deepEqual(n.pv["roof:e"], { min: 12, max: 15, from: null, to: null });
  assert.deepEqual(Object.keys(n.pv), ["roof:a", "roof:b", "roof:c", "roof:d", "roof:e"]);
  const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, { min: 0, max: 1 }]));
  assert.equal(Object.keys(normalizeDemoSettings({ pv: many }).pv).length, 200);
});

const CFG = {
  haus: "sensor.haus",
  netz: "sensor.netz",
  sources: [
    { id: "pv_1", type: "pv", power: "sensor.pv", energy: "sensor.pv_e" },
    { id: "sp_1", type: "speicher", power: "sensor.sp", soc: "sensor.soc", capacity: 10, reserve: 10 },
  ],
};
const OPTS = { cfg: CFG, sources: [SRC], pvCfg: {}, ctx: CTX, baseW: 300 };

test("Bilanz: Haus = Last, Netz = Last − PV + Laden, Ladestand 0…100, Speicher lädt bis 2000 W", () => {
  for (const [h, load] of [[0, 400], [6, 450], [9, 800], [12, 500], [14, 5000], [18, 700], [22, 300]]) {
    const b = demoBalance({ ...OPTS, t: at(5, 21, h, 7), load });
    const charge = [...b.stores.values()].reduce((a, c) => a + c, 0);
    assert.equal(b.haus, load);
    assert.equal(b.netz, Math.round(load - b.solar + charge), `${h} Uhr`);
    assert.equal(b.solar, b.pv.get("roof:pv_1"));
    assert.ok(b.soc >= 0 && b.soc <= 100, `${b.soc}`);
    assert.ok(charge <= 2000 && charge >= -1500, `${charge}`);
  }
  // Mittag mit Überschuss: Speicher lädt, Rest ins Netz (negativ = Einspeisung)
  const noon = demoBalance({ ...OPTS, t: at(5, 21, 12), load: 500 });
  assert.equal([...noon.stores.values()][0], 2000);
  assert.ok(noon.netz < 0);
  // Nacht: Speicher deckt die Last (bis 1500 W), kein PV
  const night = demoBalance({ ...OPTS, t: at(5, 21, 2), load: 600 });
  assert.equal(night.solar, 0);
  assert.equal([...night.stores.values()][0], -600);
  assert.equal(night.netz, 0);
});

test("Bilanz: Reserve bleibt, voller Speicher lädt nicht weiter, ohne Speicher alles ins Netz", () => {
  // Reserve 90 %: Start bei 30 % → nie entladen
  const hi = { ...OPTS, cfg: { ...CFG, sources: [CFG.sources[0], { ...CFG.sources[1], reserve: 90 }] } };
  for (const s of demoSweep(hi, at(5, 21, 0), at(5, 21, 8))) assert.ok([...s.stores.values()][0] >= 0, `${s.t}`);
  // sehr kleiner Speicher: wird mittags voll und lädt dann nicht mehr
  const small = { ...OPTS, cfg: { ...CFG, sources: [CFG.sources[0], { ...CFG.sources[1], capacity: 1 }] } };
  const full = demoBalance({ ...small, t: at(5, 21, 15), load: 300 });
  assert.equal(full.soc, 100);
  assert.equal([...full.stores.values()][0], 0);
  assert.equal(full.netz, Math.round(300 - full.solar));
  const none = demoBalance({ ...OPTS, cfg: { haus: "sensor.haus", netz: "sensor.netz", sources: [CFG.sources[0]] }, t: at(5, 21, 13), load: 500 });
  assert.equal(none.stores.size, 0);
  assert.equal(none.netz, Math.round(500 - none.solar));
  assert.equal(none.soc, START_SOC);
});

test("Erzeuger der Einstellung: Gruppen verteilen sich, virtuelle Quelle gehört genau ihrem Erzeuger", () => {
  const cfg = { haus: "sensor.h", netz: "sensor.n", sources: [{ id: "pv_1", type: "pv", power: "sensor.p1" }, { id: "pv_2", type: "pv", power: "sensor.p2" }, { id: "bkw_1", type: "bkw", power: "sensor.b" }] };
  const src = [
    { ...SRC, key: "roof:a", group: "pv" },
    { ...SRC, key: "item:x:y", kind: "item", group: "bkw", defaults: { min: 0, max: 800, from: null, to: null } },
    { key: "cfg:pv_2", kind: "cfg", group: "pv", cfgId: "pv_2", defaults: { min: 0, max: 5000, from: null, to: null } },
  ];
  const b = demoBalance({ cfg, sources: src, pvCfg: {}, ctx: CTX, t: at(5, 21, 13), load: 100 });
  assert.equal(b.gens.get("pv_1"), b.pv.get("roof:a")); // pv_2 hat eine eigene (virtuelle) Quelle und nimmt nicht an der Gruppe teil
  assert.equal(b.gens.get("pv_2"), b.pv.get("cfg:pv_2"));
  assert.equal(b.gens.get("bkw_1"), b.pv.get("item:x:y"));
  assert.equal(b.solar, [...b.gens.values()].reduce((a, c) => a + c, 0));
});

test("Ertrag heute steigt nur, Ladestand deterministisch, gleiche Zeit gleicher Wert", () => {
  let last = -1;
  let lastSrc = -1;
  const snaps = demoSweep(OPTS, at(5, 21, 0), at(5, 22, 0));
  assert.ok(snaps.length >= 286 && snaps.length <= 290, `${snaps.length}`);
  for (const s of snaps) {
    assert.ok(s.kwhToday >= last, `${s.t}`);
    assert.ok(s.pvKwh.get("roof:pv_1") >= lastSrc);
    assert.ok(s.soc >= 0 && s.soc <= 100);
    last = s.kwhToday;
    lastSrc = s.pvKwh.get("roof:pv_1");
  }
  assert.ok(last > 10 && last < 35, `Ertrag ${last} kWh`);
  // Summe der Leistungen im Raster ≈ Ertrag
  const approx = snaps.reduce((a, s) => a + (s.solar * 5) / 60 / 1000, 0);
  assert.ok(Math.abs(approx - last) < 0.8, `${approx} vs ${last}`);
  // Auswertung zu einem Zeitpunkt = Schnappschuss des Rasters
  const t = snaps[100].t;
  const b = demoBalance({ ...OPTS, t, load: baseLoadProfile(t, 300) });
  assert.equal(b.kwhToday, snaps[100].kwhToday);
  assert.equal(b.soc, snaps[100].soc);
  assert.deepEqual([...demoBalance({ ...OPTS, t, load: 100 }).pv], [...b.pv]);
});

test("Grundlast-Profil: abends höher als nachts, immer positiv", () => {
  assert.ok(baseLoadProfile(at(5, 21, 19), 300) > baseLoadProfile(at(5, 21, 3), 300));
  for (let h = 0; h < 24; h++) assert.ok(baseLoadProfile(at(5, 21, h), 300) > 0);
});

test("Zeitreihen im Statistik-Format: 5-min-Abschnitte, nur bekannte Entitäten", () => {
  const start = at(5, 21, 10);
  const end = at(5, 21, 11);
  const ctx = {
    sweep: (a, b) => demoSweep(OPTS, a, b),
    value: (id, s) => (id === "sensor.pv" ? s.solar : id === "sensor.soc" ? s.soc : null),
  };
  const out = demoSeries(["sensor.pv", "sensor.soc", "sensor.unbekannt"], start, end, ctx);
  assert.deepEqual(Object.keys(out), ["sensor.pv", "sensor.soc"]);
  assert.equal(out["sensor.pv"].length, 12);
  const [a, b] = out["sensor.pv"];
  assert.equal(b.start - a.start, 300000);
  assert.equal(a.end - a.start, 300000);
  assert.ok(a.start >= start - 300000 && out["sensor.pv"].at(-1).end <= end + 1);
  assert.ok(out["sensor.pv"].every((r) => Number.isFinite(r.mean) && r.mean > 0));
  // „Gestern“ hat andere Wolken, aber dieselbe Form
  const prev = demoSeries(["sensor.pv"], start - 86400000, end - 86400000, ctx);
  assert.equal(prev["sensor.pv"].length, 12);
  assert.notDeepEqual(prev["sensor.pv"].map((r) => r.mean), out["sensor.pv"].map((r) => r.mean));
});
