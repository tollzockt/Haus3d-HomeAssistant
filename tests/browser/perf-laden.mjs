// Leistungsmessung (Laden, Speicher, Modulnutzung, Bildrate) – misst per Chrome DevTools Protocol im Test-Harness.
// Kein "shot-"-Präfix: läuft nicht im normalen Testlauf (run.mjs), sondern nur von Hand:
//   export PATH="/c/Program Files/nodejs:$PATH"; NODE_PATH="$(npm root -g)" node tests/browser/perf-laden.mjs <ordner> [Optionen]
// Optionen:
//   --gpu real|soft      real = Grafikkarte (ANGLE/D3D11 bzw. Metal), soft = SwiftShader (Standard: real)
//   --runs N             Durchläufe je Messpunkt, Median (Standard 3)
//   --cpu 1,4,6          CPU-Drosselung (Emulation.setCPUThrottlingRate)
//   --haus beispiel,gross  Beispielhaus des Harness und/oder großes Testhaus (wird hier erzeugt, keine echten Daten)
//   --teile ...          welche Messungen laufen (Standard alle):
//                        statisch   Importbaum (Module, Größen, tote Importe, was bei Nachladen entfiele) – ohne Browser
//                        laden      Ladezeiten, Long Tasks, Zerlegung (Median)
//                        speicher   Heap/Prozessspeicher nach Laden, Editor, Katalog, Schließen; Szene-Zähler; 5× Editor auf/zu
//                        module     V8-Abdeckung: welcher Code läuft beim Start, wann wird welches Modul gebraucht
//                        trace      Hauptthread-Zeit nach Art (Kompilieren, Auswerten, Skript, Layout, GC)
//                        profil     CPU-Profil des Ladens (Eigen- und Gesamtzeit je Funktion/Datei)
//                        fps        Bilder/s beim Kreisen (je Stil) und im Leerlauf
//                        varianten  Gedankenspiel: Module nachladen (abwechselnd gemessen)
//                        leck       Gedankenspiel: Editor 18× öffnen/schließen, mit und ohne forceContextLoss()
//   --netz aus|wlan      Netz drosseln (wlan: 20 ms Latenz, 30 Mbit/s) – für Laden und Varianten
//   --komprimiert ja     Testserver liefert gzip aus (Standard nein: unkomprimiert)
//   --runs-var N         Durchläufe je Variante (Standard 3)
//   --datei NAME         Name der JSON-Ausgabe ohne Endung (Standard perf-laden-<gpu>), damit Teilläufe sich nicht überschreiben
// Ausgabe: Tabellen (Markdown) auf stdout und <ordner>/<datei>.json mit allen Rohwerten.
// „Varianten“ und „leck“ sind Gedankenspiele: einzelne Module werden vom Testserver durch leere Hüllen bzw. scene.js durch
// eine geänderte Fassung ersetzt (der Quelltext im Paket bleibt unberührt).
// Hinweise: Die CPU-Drosselung bremst nur den Hauptthread der Seite (Hintergrund-Threads des Browsers, Grafikkarte und Netz
// nicht). Läuft auf dem Rechner nebenher anderes, streuen die Zeiten um 10–25 %; darum Mediane und abwechselnde Messung.
import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { extname, join } from "node:path";
import { cpus, tmpdir, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { root, chromiumPath, unlock } from "./lib.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const FRONT = join(root, "custom_components/haus3d/frontend");
const FRONT_URL = "/custom_components/haus3d/frontend/";

// ------------------------------------------------------------------ Aufruf

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const GPU = opt("gpu", "real");
const RUNS = Math.max(1, Number(opt("runs", 3)));
const RUNS_VAR = Math.max(1, Number(opt("runs-var", 3)));
const CPUS = opt("cpu", "1,4,6").split(",").map(Number);
const HOUSES = opt("haus", "beispiel,gross").split(",");
const PARTS = new Set(opt("teile", "statisch,laden,speicher,module,trace,profil,fps,varianten,leck").split(","));
const NET = opt("netz", "aus");
const COMPRESS = opt("komprimiert", "nein") === "ja";
const NAME = opt("datei", `perf-laden-${GPU}`);
const OUT = args[0] ?? join(tmpdir(), "haus3d-perf");
await mkdir(OUT, { recursive: true });

const VIEWPORTS = {
  quer: { name: "Quer 1280×800", w: 1280, h: 800, dpr: 1, touch: false, quality: "schoen" },
  hoch: { name: "Hoch 820×1180, Touch, 2×", w: 820, h: 1180, dpr: 2, touch: true, quality: "ausgewogen" },
};
const NETS = { aus: null, wlan: { latency: 20, downloadThroughput: (30e6 / 8) | 0, uploadThroughput: (10e6 / 8) | 0 } };

// ------------------------------------------------------------------ kleine Helfer

const median = (list) => {
  const v = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length || v.length * 2 < list.length) return null; // mehr als die Hälfte ohne Wert
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const medianOf = (runs, pick) => median(runs.map(pick));
const f0 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : Math.round(x).toLocaleString("de-DE"));
const f1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
const kb = (x) => (x === null || x === undefined ? "–" : f0(x / 1024));
const mb = (x) => f1(x);
const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { gpu: GPU, runs: RUNS, cpus: CPUS, date: new Date().toISOString(), teile: {} };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ großes Testhaus

/** 3 Etagen, 40 Räume, 300 Möbel (gemischte Kategorien, häufige Typen wiederholen sich), 50 Leitungen – nur erfundene Daten. */
async function bigHouse() {
  const { FURNITURE, FURNITURE_CATEGORIES, FURNITURE_GROUPS } = await import(pathToFileURL(join(FRONT, "furniture.js")).href);
  const base = JSON.parse(await readFile(join(root, "custom_components/haus3d/haus-daten.json"), "utf8"));
  const rnd = rng(20260415);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const skip = new Set(["Bau", "Eigene Körper", "Solar-Aufständerung"]);
  const cats = new Map(FURNITURE_CATEGORIES);
  const groupTypes = (group) => FURNITURE_GROUPS.find(([g]) => g === group)[1].filter((c) => !skip.has(c)).map((c) => ({ c, types: cats.get(c).filter((t) => FURNITURE[t]) }));
  const indoor = groupTypes("Drinnen");
  const outdoor = groupTypes("Draußen");
  // Pool häufiger Typen: je Kategorie zwei, gewichtet nach Rang (Stühle, Lampen … kommen oft vor)
  const poolIn = indoor.flatMap(({ types }) => [pick(types), pick(types)]).sort(() => rnd() - 0.5);
  const poolOut = outdoor.flatMap(({ types }) => [pick(types)]);
  const weighted = (pool) => {
    let r = rnd() * pool.reduce((s, _, i) => s + 1 / (i + 1) ** 0.8, 0);
    for (let i = 0; i < pool.length; i++) if ((r -= 1 / (i + 1) ** 0.8) <= 0) return pool[i];
    return pool[0];
  };
  const typeIn = () => (rnd() < 0.2 ? pick(pick(indoor).types) : weighted(poolIn)); // 20 % Streuung über den ganzen Katalog
  const typeOut = () => (rnd() < 0.3 ? pick(pick(outdoor).types) : weighted(poolOut));
  const names = ["Wohnzimmer", "Küche", "Bad", "Schlafzimmer", "Flur", "Büro", "Kinderzimmer", "Gästezimmer", "Keller", "Technik"];
  const mats = ["oak", "tiles", "concrete", "oak", "tiles"];
  const W = 4.5;
  const D = 4;
  const floors = [];
  let furnId = 0;
  let pipeId = 0;
  const layout = [["eg", "EG", 0, 15], ["og", "OG", 2.8, 15], ["dg", "DG", 5.6, 10]];
  for (const [id, name, elevation, count] of layout) {
    const rooms = [];
    const openings = [];
    for (let k = 0; k < count; k++) {
      const i = k % 5;
      const j = Math.floor(k / 5);
      const x0 = i * W;
      const z0 = j * D;
      const rid = `${id}_r${k}`;
      rooms.push({ id: rid, name: `${names[k % names.length]} ${id.toUpperCase()}${k + 1}`, area_id: null, points: [[x0, z0], [x0 + W, z0], [x0 + W, z0 + D], [x0, z0 + D]], floor_material: mats[k % mats.length] });
      const outer = j === 0 ? 0 : j === 2 || (id === "dg" && j === 1) ? 2 : i === 0 ? 3 : i === 4 ? 1 : null;
      if (outer !== null) openings.push({ id: `${rid}_f`, room_id: rid, edge: outer, offset: 1.2, width: 1.4, type: "window", sill: 0.9, height: 1.3, hinge: "left", leaves: 1, swing: "in" });
      openings.push({ id: `${rid}_t`, room_id: rid, edge: i < 4 ? 1 : 3, offset: 1.5, width: 0.9, type: "door", sill: 0, height: 2.05, hinge: "left", leaves: 1, swing: "in" });
    }
    const furniture = [];
    const perFloor = id === "dg" ? 80 : 110;
    for (let n = 0; n < perFloor; n++) {
      const room = rooms[Math.floor(rnd() * rooms.length)];
      const [x0, z0] = room.points[0];
      const type = typeIn();
      const [, w, d, h] = FURNITURE[type];
      furniture.push({ id: `m${++furnId}`, type, x: +(x0 + 0.7 + rnd() * (W - 1.4)).toFixed(2), z: +(z0 + 0.7 + rnd() * (D - 1.4)).toFixed(2), rotation: pick([0, 90, 180, 270]), w, d, h, variant: null, entity: null });
    }
    if (id === "eg") {
      for (let n = 0; n < 10; n++) {
        const type = typeOut();
        const [, w, d, h] = FURNITURE[type];
        furniture.push({ id: `m${++furnId}`, type, x: +(-2.5 + rnd() * 25).toFixed(2), z: +(-3.5 + rnd() * 1.5).toFixed(2), rotation: pick([0, 90, 180, 270]), w, d, h, variant: null, entity: null });
      }
    }
    const types = ["strom", "wasser_kalt", "wasser_warm", "netzwerk"];
    const pipes = [];
    for (let n = 0; n < (id === "dg" ? 12 : 19); n++) {
      const pts = [];
      let x = rnd() * W * 5;
      let z = rnd() * D * 3;
      for (let q = 0; q < 3 + Math.floor(rnd() * 3); q++) {
        pts.push([+x.toFixed(2), +z.toFixed(2)]);
        if (q % 2) z = Math.min(D * 3, Math.max(0, z + (rnd() - 0.5) * 6));
        else x = Math.min(W * 5, Math.max(0, x + (rnd() - 0.5) * 8));
      }
      const hgt = pick([0.3, 1.1, 2.45]);
      pipes.push({ id: `p${++pipeId}`, type: types[n % 4], points: pts, heights: pts.map(() => hgt) });
    }
    const placements = id === "eg" ? ["light.wohnzimmer_decke", "light.kueche", "switch.kaffeemaschine", "sensor.wohnzimmer_temperatur", "cover.wohnzimmer_rollladen", "binary_sensor.haustuer"].map((e, n) => ({ entity_id: e, x: 2 + n * 3, z: 2, y: 1.2, rotation: 0 })) : [];
    floors.push({ id, name, elevation, height: 2.6, cut_height: 1.15, rooms, openings, furniture, placements, background: null, outdoor: id === "eg" ? [{ id: "rasen", type: "lawn", points: [[-4, -4], [26, -4], [26, 16], [-4, 16]] }] : [], walls: [], pipes, ha_floor: null });
  }
  return { version: base.version, floors, settings: base.settings, energy: base.energy, presence: [] };
}

function houseStats(b) {
  const f = b.floors;
  const types = new Set(f.flatMap((x) => x.furniture.map((m) => m.type)));
  return { etagen: f.length, raeume: f.reduce((n, x) => n + x.rooms.length, 0), moebel: f.reduce((n, x) => n + x.furniture.length, 0), typen: types.size, leitungen: f.reduce((n, x) => n + (x.pipes?.length ?? 0), 0) };
}

// ------------------------------------------------------------------ Testserver (wie lib.mjs, plus Größenprotokoll und Hüllen)

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };

function makeServer(virtual) {
  const state = { stubs: new Map(), log: new Map(), gz: new Map(), files: new Map() };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.startsWith(FRONT_URL) ? path.slice(FRONT_URL.length) : null;
      let body;
      let key = path;
      if (virtual.has(path)) body = Buffer.from(virtual.get(path));
      else if (file && state.stubs.has(file)) {
        body = Buffer.from(state.stubs.get(file));
        key = `stub:${path}`;
      } else {
        body = state.files.get(path) ?? (await readFile(join(root, path)));
        state.files.set(path, body); // im Speicher halten: Plattenzugriffe und gzip sollen die Messung nicht stören
      }
      if (!state.gz.has(key)) {
        const zipped = gzipSync(body, { level: 6 });
        state.gz.set(key, { bytes: body.length, gzip: zipped.length, zipped });
      }
      const sizes = state.gz.get(key);
      state.log.set(path, sizes);
      const headers = { "content-type": mime[extname(path)] ?? "application/octet-stream" };
      // --komprimiert ja: wie ein Server mit gzip (z. B. Home Assistant hinter einem Proxy); sonst unkomprimiert
      if (COMPRESS) headers["content-encoding"] = "gzip";
      res.writeHead(200, headers);
      res.end(COMPRESS ? sizes.zipped : body);
    } catch {
      res.writeHead(404).end();
    }
  }).listen(0);
  return { server, state, port: server.address().port };
}

/** Leere Hülle für ein Modul: gleiche Namen, keine Arbeit (nur für die Gedankenspiele „Varianten“). */
function stubSource(src) {
  const lines = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(class|function\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    const [, kind, name] = m;
    if (name === "onModelsChange") lines.push("export function onModelsChange() { return () => {}; }");
    else if (kind === "class") lines.push(`export class ${name} {}`);
    else if (kind.startsWith("function")) lines.push(`export function ${name}() { return false; }`);
    else lines.push(`export const ${name} = ${/STYLE$/.test(name) ? '""' : /Methods$/.test(name) ? "{}" : "(() => null)"};`);
  }
  return lines.join("\n");
}

const VARIANTEN = {
  basis: [],
  "ohne-editor": ["editor.js"],
  "ohne-bauer": ["furniture-extra.js", "furniture-more.js"],
  "ohne-loader": ["models.js"],
  "ohne-dialoge": ["panel-dialogs.js", "panel-admin.js", "panel-energycfg.js"],
  "ohne-alles": ["editor.js", "furniture-extra.js", "furniture-more.js", "models.js", "panel-dialogs.js", "panel-admin.js", "panel-energycfg.js"],
};

// ------------------------------------------------------------------ Messung in der Seite

/** Wird vor jedem Dokument in die Seite gesetzt: Long Tasks, Markierungen, Zeitmessung der Panel-Bausteine. */
const INSTRUMENT = `(() => {
  const P = (window.__perf = { longtasks: [], paints: [], marks: {}, calls: {}, gl: 0 });
  const T = () => performance.now();
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.paints.push([e.name, e.startTime]); }).observe({ type: "paint", buffered: true }); } catch {}
  const define = customElements.define.bind(customElements);
  customElements.define = (name, cls, o) => {
    if (name === "haus3d-panel") {
      P.marks.define = T();
      const cc = cls.prototype.connectedCallback;
      cls.prototype.connectedCallback = function (...a) { const t0 = T(); try { return cc.apply(this, a); } finally { P.marks.connectedAt = t0; P.marks.connectedMs = T() - t0; } };
    }
    return define(name, cls, o);
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) { if (/webgl/.test(type)) P.gl++; return getContext.call(this, type, ...a); };
  const timed = (obj, name, key) => {
    const f = obj[name];
    if (typeof f !== "function") return;
    obj[name] = function (...a) { const t0 = T(); try { return f.apply(this, a); } finally { (P.calls[key] ??= []).push([t0, T() - t0]); } };
  };
  let value;
  Object.defineProperty(window, "panel", { configurable: true, get: () => value, set(v) {
    value = v;
    if (v && !P.marks.panelSet) {
      P.marks.panelSet = T();
      timed(v, "_setBuilding", "setBuilding");
      if (v._scene) { timed(v._scene, "setBuilding", "sceneBuild"); timed(v._scene, "resize", "resize"); }
    }
  } });
  const tick = () => {
    const s = value?._scene;
    if (s?.floors?.size > 0 && s.renderer?.info?.render?.calls > 10 && !P.marks.firstRender) { P.marks.firstRender = T(); P.marks.firstCalls = s.renderer.info.render.calls; }
    if (!P.marks.firstRender) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

/** Chromium mit Grafikkarte (real) bzw. Software-Rendering (soft); sonst wie lib.mjs: nichts drosseln, wenn die Seite im Hintergrund liegt. */
function launchBrowser() {
  const gpuArgs = GPU === "soft" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : process.platform === "win32" ? ["--use-gl=angle", "--use-angle=d3d11"] : process.platform === "darwin" ? ["--use-gl=angle", "--use-angle=metal"] : [];
  return chromium.launch({
    executablePath: chromiumPath,
    args: [...gpuArgs, "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"],
  });
}

/** Neue Seite im Harness: CPU gedrosselt, Messfühler eingebaut, Navigation gestartet (noch nicht abgewartet). */
async function openPage(env, { house, cpu, vp, net = "aus", coverage = false, trace = false, profile = false, noWarm = false }) {
  // Aufwärmen je Haus und Ansicht (verworfen): der erste Start im Browserprozess übersetzt die Shader der Grafikkarte und
  // wäre sonst viel langsamer als alle weiteren
  const warmKey = `${house}|${vp.name}`;
  if (!noWarm && !env.warm.has(warmKey)) {
    env.warm.add(warmKey);
    const w = await openPage(env, { house, cpu: 1, vp, noWarm: true });
    try {
      await settle(w.pg, { limit: 120000 });
    } finally {
      await w.ctx.close();
    }
  }
  const ctx = await env.browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.touch, isMobile: vp.touch });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(`[console] ${m.text()}`));
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  if (NETS[net]) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETS[net] });
  }
  if (coverage) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.startPreciseCoverage", { callCount: true, detailed: false });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
    await cdp.send("Profiler.start");
  }
  const events = [];
  if (trace) {
    cdp.on("Tracing.dataCollected", (d) => events.push(...d.value));
    await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "disabled-by-default-v8.compile"], recordMode: "recordAsMuchAsPossible" }, transferMode: "ReportEvents" });
  }
  await pg.addInitScript(INSTRUMENT);
  // wie lib.mjs: Stufe festlegen; Schatten nur mit Grafikkarte (SwiftShader zeichnet sie sehr langsam)
  const shadows = GPU === "soft" ? "&schatten=aus" : "";
  const data = house === "gross" ? "&data=/perf-gross.json" : "";
  env.state.log.clear();
  const url = `http://localhost:${env.port}/tests/browser/harness.html?quality=${vp.quality}${shadows}${data}`;
  const t0 = Date.now();
  await pg.goto(url, { waitUntil: "commit" });
  return { ctx, pg, cdp, errors, t0, house, cpu, vp, events };
}

/** Wartet auf das erste 3D-Bild und danach auf `quiet` ms ohne Long Task. */
async function settle(pg, { quiet = 1500, limit = 150000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const s = await pg.evaluate(() => {
      const P = window.__perf;
      let last = 0;
      for (const [s, d] of P.longtasks) last = Math.max(last, s + d);
      return { now: performance.now(), last, first: P.marks.firstRender ?? null };
    });
    if (s.first && s.now - Math.max(s.last, s.first) >= quiet) return { ...s, settled: true };
    if (Date.now() - t0 > limit) return { ...s, settled: false };
    await sleep(200);
  }
}

const metricsOf = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

/** Rohdaten einer geladenen Seite einsammeln. */
async function collect(env, run, quietInfo) {
  const d = await run.pg.evaluate(() => {
    const P = window.__perf;
    const res = performance.getEntriesByType("resource").filter((e) => /\.js(\?|$)/.test(e.name)).map((e) => ({ n: new URL(e.name).pathname, s: e.startTime, e: e.responseEnd, b: e.decodedBodySize }));
    return { marks: P.marks, calls: P.calls, longtasks: P.longtasks, paints: P.paints, gl: P.gl, res, now: performance.now(), renders: window.panel?._scene?.stats?.renders ?? null };
  });
  const metrics = await metricsOf(run.cdp);
  await run.cdp.send("HeapProfiler.collectGarbage"); // nach den Zeitwerten: Heap der lebenden Objekte
  metrics.heapGc = (await run.cdp.send("Runtime.getHeapUsage")).usedSize;
  const log = env.state.log;
  d.res.forEach((r) => (r.gz = log.get(r.n)?.gzip ?? null));
  return { ...d, metrics, settled: quietInfo?.settled ?? true, errors: run.errors.slice() };
}

/** Kennzahlen eines Ladevorgangs aus den Rohdaten. */
function analyse(d) {
  const m = d.marks;
  const f = m.firstRender ?? Infinity;
  const lt = [...d.longtasks].sort((a, b) => a[0] - b[0]);
  // „bedienbar“: nach dem ersten 3D-Bild die erste Ruhe von 1 s ohne Long Task; Ende der Kette davor
  let last = f;
  for (const [s, dur] of lt) {
    if (s + dur <= f) continue;
    if (s - last >= 1000) break;
    last = Math.max(last, s + dur);
  }
  const reached = Number.isFinite(f) && d.now - last >= 1000;
  const bedienbar = reached ? last : null;
  const upto = lt.filter(([s]) => s <= (bedienbar ?? d.now));
  const big = upto.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0]);
  const calls = (k) => d.calls[k] ?? [];
  const first = (k) => calls(k)[0]?.[1] ?? null;
  const sum = (k) => calls(k).reduce((s, c) => s + c[1], 0);
  // Abruf des Startbaums: nur Module, die vor dem Definieren des Panels angefordert wurden (später kommen Vorladen und Nachladen)
  const vorDefine = m.define != null ? d.res.filter((r) => r.s <= m.define) : d.res;
  const jsStart = vorDefine.length ? Math.min(...vorDefine.map((r) => r.s)) : null;
  const jsEnd = vorDefine.length ? Math.max(...vorDefine.map((r) => r.e)) : null;
  const gz = d.res.reduce((s, r) => s + (r.gz ?? 0), 0);
  const vorBild = d.res.filter((r) => r.e <= f); // geladen bis zum ersten 3D-Bild (danach: Vorladen im Leerlauf, Nachladen auf Abruf)
  return {
    module: d.res.length,
    bytes: d.res.reduce((s, r) => s + r.b, 0),
    moduleBisBild: vorBild.length,
    bytesBisBild: vorBild.reduce((s, r) => s + r.b, 0),
    gzip: gz,
    jsStart,
    jsEnd,
    definiert: m.define ?? null,
    modulzeit: m.define != null && jsStart != null ? m.define - jsStart : null,
    panelAufbau: m.connectedMs ?? null,
    hausDaten: first("setBuilding"),
    szeneBauen: first("sceneBuild"),
    szeneBauenSumme: sum("sceneBuild"),
    groessenaenderungen: calls("resize").length,
    groessenaenderungenMs: sum("resize"),
    bilder: d.renders,
    bild3d: Number.isFinite(f) ? f : null,
    bedienbar,
    ltAnzahl: upto.length,
    ltSumme: upto.reduce((s, [, x]) => s + x, 0),
    ltGroesste: big[1],
    ltGroessteBei: big[0],
    tbt: upto.reduce((s, [, x]) => s + Math.max(0, x - 50), 0),
    fcp: d.paints.find((p) => p[0] === "first-contentful-paint")?.[1] ?? null,
    zeichenaufrufe: m.firstCalls ?? null,
    script: (d.metrics.ScriptDuration ?? 0) * 1000,
    abruf: jsStart != null ? jsEnd - jsStart : null,
    auswertung: m.define != null && jsEnd != null ? m.define - jsEnd : null,
    layout: ((d.metrics.LayoutDuration ?? 0) + (d.metrics.RecalcStyleDuration ?? 0)) * 1000,
    aufgaben: (d.metrics.TaskDuration ?? 0) * 1000,
    heapMB: (d.metrics.heapGc ?? d.metrics.JSHeapUsedSize ?? 0) / 1048576,
    glKontexte: d.gl,
    fehler: d.errors.length,
    fehlerText: d.errors.slice(0, 2),
    ruhe: d.settled,
  };
}

const NUM_KEYS = ["module", "bytes", "moduleBisBild", "bytesBisBild", "gzip", "jsStart", "jsEnd", "definiert", "modulzeit", "panelAufbau", "hausDaten", "szeneBauen", "szeneBauenSumme", "groessenaenderungen", "groessenaenderungenMs", "bilder", "bild3d", "bedienbar", "ltAnzahl", "ltSumme", "ltGroesste", "ltGroessteBei", "tbt", "fcp", "zeichenaufrufe", "script", "abruf", "auswertung", "layout", "aufgaben", "heapMB", "glKontexte", "fehler"];

function medianAnalysis(list) {
  const out = {};
  for (const k of NUM_KEYS) out[k] = medianOf(list, (a) => a[k]);
  out.ruhe = list.every((a) => a.ruhe);
  out.fehlerText = list.find((a) => a.fehlerText.length)?.fehlerText ?? [];
  out.n = list.length;
  return out;
}

/** Ein Ladevorgang bis zur Ruhe (oder Zeitgrenze) und Rohdaten. */
async function loadOnce(env, cfg) {
  const run = await openPage(env, cfg);
  try {
    const q = await settle(run.pg, { limit: 60000 + 25000 * cfg.cpu });
    const d = await collect(env, run, q);
    return { d, a: analyse(d), res: d.res };
  } finally {
    await run.ctx.close();
  }
}

// ------------------------------------------------------------------ Teil 0: statische Analyse der Importe

const GROUPS = [
  ["Three.js (Bibliothek)", /^vendor\/three\.module/],
  ["Loader eigene Modelle", /^(vendor\/(GLTF|OBJ|STL)Loader|models|model-fit)\.js$/],
  ["Möbel-Katalog (Daten + Bauer)", /^(furniture|catalog-|cabinet-model|rack\.|garden-parts|home-parts|tech-parts|model-parts|stairs3d|stairrail|pose\.)/],
  ["Editor", /^(editor|edit-ops|plan-tools|follow|setup\.|fields-|arrows3d|scene-arrows|thumbs)/],
  ["Leitungen (Szene + Logik)", /^(pipe|scene-pipes)/],
  ["Panel-Bausteine (panel-*)", /^panel-/],
  ["Szene + Geometrie", /^(scene|textures|walls|well|light|sun|camera|kerb|gable|roof|exterior|stairs|stairgeom|vendor\/(Orbit|BufferGeometry))/],
];
const groupOf = (f) => GROUPS.find(([, re]) => re.test(f))?.[0] ?? "Übrige Logik (Geräte, Energie, Status …)";

/** Lokale Namen aus der Klausel einer Importzeile (`A, { b, c as d }` bzw. `* as NS`). */
function importedNames(clause) {
  const names = [];
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of braces[1].split(",")) {
      const p = part.trim();
      if (p) names.push(p.includes(" as ") ? p.split(/\s+as\s+/)[1].trim() : p);
    }
  }
  const rest = clause.replace(/\{[^}]*\}/, "").trim().replace(/,$/, "").trim();
  const ns = rest.match(/^\*\s+as\s+([\w$]+)$/);
  if (ns) names.push(ns[1]);
  else if (/^[\w$]+$/.test(rest)) names.push(rest);
  return names;
}

async function staticAnalysis() {
  const files = (await readdir(FRONT, { recursive: true })).map((f) => f.replace(/\\/g, "/")).filter((f) => f.endsWith(".js"));
  const src = new Map();
  for (const f of files) src.set(f, await readFile(join(FRONT, f), "utf8"));
  const dirOf = (f) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "");
  const resolveSpec = (from, spec) => {
    const parts = [...dirOf(from).split("/").filter(Boolean)];
    for (const p of spec.split("/")) {
      if (p === "..") parts.pop();
      else if (p !== ".") parts.push(p);
    }
    return parts.join("/");
  };
  const importRe = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s*from\s*["'](\.[^"']+)["']|(?:^|\n)\s*import\s*["'](\.[^"']+)["']/g;
  const edges = new Map();
  const imports = new Map(); // Datei -> [{to, clause, kind}]
  for (const [f, s] of src) {
    const list = [];
    for (const m of s.matchAll(importRe)) list.push({ to: resolveSpec(f, m[3] ?? m[4]), kind: m[1] ?? "import", clause: m[2] ?? "" });
    imports.set(f, list);
    edges.set(f, [...new Set(list.map((x) => x.to))].filter((t) => src.has(t)));
  }
  const entry = "haus3d-panel.js";
  const reach = (skip = null) => {
    const seen = new Set([entry]);
    const stack = [entry];
    while (stack.length) {
      const f = stack.pop();
      for (const t of edges.get(f)) if (t !== skip && !seen.has(t)) (seen.add(t), stack.push(t));
    }
    return seen;
  };
  const all = reach();
  const size = (f) => Buffer.byteLength(src.get(f));
  const gz = new Map([...all].map((f) => [f, gzipSync(src.get(f), { level: 6 }).length]));
  const total = [...all].reduce((s, f) => s + size(f), 0);
  const totalGz = [...gz.values()].reduce((s, x) => s + x, 0);
  // Abruftiefe (kürzester Weg): so viele Anfragen-Runden dauert der Modulbaum mindestens
  const depth = new Map([[entry, 0]]);
  for (let q = [entry]; q.length; ) {
    const f = q.shift();
    for (const t of edges.get(f)) if (!depth.has(t)) (depth.set(t, depth.get(f) + 1), q.push(t));
  }
  const maxDepth = Math.max(...depth.values());
  const perDepth = Array.from({ length: maxDepth + 1 }, (_, d) => [...depth].filter(([, x]) => x === d).length);
  // Gruppen
  const groups = new Map();
  for (const f of all) {
    const g = groupOf(f);
    const e = groups.get(g) ?? { n: 0, bytes: 0, gzip: 0 };
    e.n++;
    e.bytes += size(f);
    e.gzip += gz.get(f);
    groups.set(g, e);
  }
  // Was fällt weg, wenn ein Modul nicht mehr statisch geladen wird (alle Module, die nur über dieses erreichbar sind)?
  const dominated = [];
  for (const f of all) {
    if (f === entry) continue;
    const without = reach(f);
    const gone = [...all].filter((x) => !without.has(x));
    dominated.push({ datei: f, module: gone.length, bytes: gone.reduce((s, x) => s + size(x), 0), gzip: gone.reduce((s, x) => s + gz.get(x), 0), liste: gone });
  }
  dominated.sort((a, b) => b.bytes - a.bytes);
  // vollständig ungenutzte Importe (nur Namen, die im Rest der Datei nirgends vorkommen)
  const dead = [];
  for (const f of all) {
    const rest = src.get(f).replace(importRe, "\n");
    for (const imp of imports.get(f)) {
      if (imp.kind !== "import" || !imp.clause) continue;
      const names = importedNames(imp.clause);
      // Treffer ohne Eigenschaftszugriff (".name"), aber mit Spread ("...name")
      const unused = names.filter((n) => !new RegExp(`(?<![\\w$])(?<!(?<!\\.\\.)\\.)${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(rest));
      if (unused.length && unused.length === names.length && src.has(imp.to)) dead.push({ datei: f, aus: imp.to, namen: unused, bytes: dominated.find((x) => x.datei === imp.to)?.bytes ?? size(imp.to) });
    }
  }
  // grobe Untergrenze für Minifizierung: Einrückung und reine Kommentarzeilen entfernen
  const stripped = [...all].reduce((s, f) => s + Buffer.byteLength(src.get(f).split("\n").map((l) => l.trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l)).join("\n")), 0);
  const own = [...all].filter((f) => !f.startsWith("vendor/"));
  const ownBytes = own.reduce((s, f) => s + size(f), 0);
  const ownStripped = own.reduce((s, f) => s + Buffer.byteLength(src.get(f).split("\n").map((l) => l.trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l)).join("\n")), 0);
  const largest = [...all].map((f) => ({ datei: f, bytes: size(f), gzip: gz.get(f), gruppe: groupOf(f), tiefe: depth.get(f) })).sort((a, b) => b.bytes - a.bytes);
  const r = { module: all.size, bytes: total, gzip: totalGz, maxTiefe: maxDepth, jeTiefe: perDepth, gruppen: Object.fromEntries(groups), eigeneBytes: ownBytes, eigeneOhneKommentare: ownStripped, ohneKommentareAlles: stripped, groesste: largest.slice(0, 25), dominiert: dominated.slice(0, 40).map(({ liste, ...x }) => x), dominiertListen: Object.fromEntries(dominated.slice(0, 40).map((x) => [x.datei, x.liste])), tote: dead.sort((a, b) => b.bytes - a.bytes), alle: largest };
  say(`\n## Statische Analyse (Importbaum ab ${entry})\n`);
  say(`${r.module} Module, ${kb(total)} KB unkomprimiert, ${kb(totalGz)} KB gzip (geschätzt, Stufe 6); eigener Code ${kb(ownBytes)} KB, davon nach Entfernen von Einrückung und Kommentarzeilen noch ${kb(ownStripped)} KB.`);
  say(`Abruftiefe: ${maxDepth + 1} Ebenen (Module je Ebene: ${perDepth.join(", ")}) – so viele Anfrage-Runden braucht der Baum mindestens.\n`);
  say(table(["Gruppe", "Module", "KB", "gzip KB", "Anteil"], [...groups].sort((a, b) => b[1].bytes - a[1].bytes).map(([g, e]) => [g, e.n, kb(e.bytes), kb(e.gzip), `${f0((e.bytes / total) * 100)} %`])));
  say(`\nGrößte Module:\n`);
  say(table(["Datei", "KB", "gzip KB", "Tiefe"], largest.slice(0, 12).map((x) => [x.datei, kb(x.bytes), kb(x.gzip), x.tiefe])));
  say(`\nWas entfällt, wenn ein Modul nicht mehr statisch geladen wird (nur darüber erreichbare Module zählen mit):\n`);
  say(table(["Modul", "Module", "KB", "gzip KB"], r.dominiert.slice(0, 22).map((x) => [x.datei, x.module, kb(x.bytes), kb(x.gzip)])));
  say(`\nImporte, deren Namen in der Datei nie benutzt werden (tote Importe):\n`);
  say(table(["Datei", "importiert aus", "Namen", "KB (mit Abhängigen)"], r.tote.slice(0, 25).map((x) => [x.datei, x.aus, x.namen.join(", "), kb(x.bytes)])));
  results.teile.statisch = r;
  return r;
}

// ------------------------------------------------------------------ Teil 1: Laden

async function partLaden(env) {
  say(`\n## Laden (Median aus ${RUNS} Durchläufen, kalt: neuer Browserkontext, kein Cache; GPU: ${GPU}, Netz: ${NET})\n`);
  const out = {};
  const rows = [];
  for (const house of HOUSES) {
    for (const vpKey of Object.keys(VIEWPORTS)) {
      for (const cpu of CPUS) {
        const list = [];
        for (let i = 0; i < RUNS; i++) list.push((await loadOnce(env, { house, cpu, vp: VIEWPORTS[vpKey], net: NET })).a);
        const m = medianAnalysis(list);
        (out[house] ??= {})[vpKey] ??= {};
        out[house][vpKey][cpu] = { median: m, runs: list };
        rows.push([house, VIEWPORTS[vpKey].name, `${cpu}×`, m.module, kb(m.bytes), m.moduleBisBild, kb(m.bytesBisBild), kb(m.gzip), f0(m.definiert), f0(m.bild3d), m.bedienbar === null ? "nicht erreicht" : f0(m.bedienbar), m.ltAnzahl, f0(m.ltSumme), f0(m.ltGroesste), f0(m.tbt), m.fehler ? `FEHLER ${m.fehler}` : ""]);
        say(`  ${house} ${vpKey} ${cpu}× -> Bild ${f0(m.bild3d)} ms`);
      }
    }
  }
  say(table(["Haus", "Ansicht", "CPU", "Module bis Ruhe", "JS KB bis Ruhe", "Module bis 1. Bild", "JS KB bis 1. Bild", "gzip KB bis Ruhe", "Panel definiert ms", "1. 3D-Bild ms", "bedienbar ms", "Long Tasks", "Σ Long Tasks ms", "größter ms", "TBT ms", "Hinweis"], rows));
  say(`\nZerlegung (Median, ms):\n`);
  say(table(["Haus", "Ansicht", "CPU", "Module: Abruf aller", "Module: Auswertung danach", "Panel-Aufbau (DOM, Szene)", "Haus einlesen+bauen", "davon Szene bauen", "Skript gesamt", "Layout+Stil", "Größenänderungen (je ein volles Bild)", "davon ms", "Bilder bis Ruhe", "Heap MB (nach Bereinigung)"], HOUSES.flatMap((h) => Object.keys(VIEWPORTS).flatMap((v) => CPUS.map((c) => {
    const m = out[h][v][c].median;
    return [h, VIEWPORTS[v].name, `${c}×`, f0(m.abruf), f0(m.auswertung), f0(m.panelAufbau), f0(m.hausDaten), f0(m.szeneBauenSumme), f0(m.script), f0(m.layout), f0(m.groessenaenderungen), f0(m.groessenaenderungenMs), f0(m.bilder), mb(m.heapMB)];
  })))));
  results.teile.laden = out;
  return out;
}

// ------------------------------------------------------------------ Teil 2: Speicher, Editor, Katalog

/** Speicher der Prozesse (privat, MB): Renderer der Seite und GPU-Prozess – über das Betriebssystem, weil der JS-Heap Puffer und Texturen nicht enthält. */
async function procMem(env) {
  try {
    const { processInfo } = await env.bs.send("SystemInfo.getProcessInfo");
    const ids = processInfo.map((p) => p.id);
    const mem = new Map();
    if (process.platform === "win32") {
      const cmd = `@(Get-Process -Id ${ids.join(",")} | Select-Object Id,WorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress`;
      const out = execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
      for (const p of [].concat(JSON.parse(out))) mem.set(p.Id, { ws: p.WorkingSet64 / 1048576, priv: p.PrivateMemorySize64 / 1048576 });
    } else {
      const out = execFileSync("ps", ["-o", "pid=,rss=", "-p", ids.join(",")], { encoding: "utf8" });
      for (const l of out.trim().split("\n")) {
        const [pid, rss] = l.trim().split(/\s+/).map(Number);
        mem.set(pid, { ws: rss / 1024, priv: rss / 1024 });
      }
    }
    const rend = processInfo.filter((p) => p.type === "renderer").map((p) => mem.get(p.id)).filter(Boolean).sort((a, b) => b.priv - a.priv)[0];
    const gpu = processInfo.filter((p) => /gpu/i.test(p.type)).map((p) => mem.get(p.id)).filter(Boolean)[0];
    return { rendererMB: rend?.priv ?? null, rendererArbeitsMB: rend?.ws ?? null, gpuMB: gpu?.priv ?? null };
  } catch {
    return { rendererMB: null, rendererArbeitsMB: null, gpuMB: null };
  }
}

/** Heap nach Speicherbereinigung, dazu Zähler der Szene (Geometrien, Texturen, Zeichenaufrufe …). */
async function snap(run, label, env) {
  for (let i = 0; i < 2; i++) await run.cdp.send("HeapProfiler.collectGarbage");
  const h = await run.cdp.send("Runtime.getHeapUsage");
  const three = await run.pg.evaluate(() => {
    const p = window.panel;
    const s = p?._scene;
    const r = s?.renderer;
    let objekte = 0, meshes = 0, linien = 0, instanziert = 0;
    const geos = new Set();
    const mats = new Set();
    s?.scene.traverse((o) => {
      objekte++;
      if (o.isMesh) meshes++;
      if (o.isLine) linien++;
      if (o.isInstancedMesh) instanziert++;
      if (o.geometry) geos.add(o.geometry.uuid);
      const mm = o.material;
      if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => mats.add(x.uuid));
    });
    const e3 = p?._editor?.scene3d?.renderer;
    return { editor3d: e3 ? `${e3.info.memory.geometries} Geom., ${e3.info.memory.textures} Tex.` : "–", glKontexte: window.__perf.gl, geometrien: r?.info.memory.geometries ?? null, texturen: r?.info.memory.textures ?? null, zeichenaufrufe: r?.info.render.calls ?? null, dreiecke: r?.info.render.triangles ?? null, programme: r?.info.programs?.length ?? null, objekte, meshes, linien, instanziert, geoEinzigartig: geos.size, matEinzigartig: mats.size, dom: document.querySelectorAll("*").length + (p?.shadowRoot?.querySelectorAll("*").length ?? 0) };
  });
  return { label, heapMB: h.usedSize / 1048576, gesamtMB: h.totalSize / 1048576, ...three, ...(await procMem(env)) };
}

/**
 * Ausdruck für page.evaluate: Sparpotenzial der Szene. Wie viele Geometrien sind inhaltlich gleich (Hash der Eckpunkte), und wie viele
 * Zeichenaufrufe blieben, wenn jedes Möbelstück nach Material zusammengefasst bzw. gleiche Möbel (Typ + Maße) instanziert würden?
 */
const GEO_JS = `(() => {
  const p = window.panel;
  const s = p._scene;
  const hash = (g) => {
    const pos = g.attributes.position;
    if (!pos) return "x" + g.uuid;
    const a = pos.array;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ ((a[i] * 1e4) | 0), 16777619) >>> 0;
    return g.type + ":" + pos.count + ":" + (g.index ? g.index.count : 0) + ":" + h;
  };
  const items = new Map();
  for (const f of p._building.floors) for (const m of f.furniture ?? []) items.set(m.id, m);
  const sig = (m) => [m.type, m.w, m.d, m.h, m.color ?? "", m.variant ?? "", m.open ?? ""].join("|");
  const all = new Set(), furnHash = new Set(), allHash = new Set();
  let meshes = 0, furnMeshes = 0, lines = 0;
  const byId = new Map();
  s.scene.traverse((o) => {
    if (!(o.isMesh || o.isLine) || !o.geometry || !o.visible) return;
    meshes++;
    all.add(o.geometry.uuid);
    allHash.add(hash(o.geometry));
    if (o.isLine) lines++;
    const id = o.userData.furniture;
    if (id === undefined) return;
    furnMeshes++;
    furnHash.add(hash(o.geometry));
    const e = byId.get(id) ?? { meshes: 0, mats: new Set() };
    e.meshes++;
    const mm = o.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => e.mats.add(x.uuid));
    byId.set(id, e);
  });
  let merged = 0, instanced = 0, mergedInstanced = 0;
  const seen = new Set();
  for (const [id, e] of byId) {
    merged += e.mats.size;
    const m = items.get(id);
    const k = m ? sig(m) : "id:" + id;
    if (!seen.has(k)) { seen.add(k); instanced += e.meshes; mergedInstanced += e.mats.size; }
  }
  return { meshes, linien: lines, moebelStuecke: byId.size, moebelMeshes: furnMeshes, geometrienGesamt: all.size, geometrienGleichInhalt: allHash.size, moebelGeometrienGleichInhalt: furnHash.size, moebelTypGroessen: seen.size, aufrufeHeute: meshes, aufrufeMoebelJeMaterial: meshes - furnMeshes + merged, aufrufeMoebelInstanziert: meshes - furnMeshes + instanced, aufrufeBeides: meshes - furnMeshes + mergedInstanced };
})()`;

/** Ausdruck für page.evaluate: wie viele Vorschaubilder (Stil „standard“) schon im Speicher des Katalogs liegen. */
const THUMB_JS = `(async () => {
  const T = await import("${FRONT_URL}thumbs.js");
  const F = await import("${FRONT_URL}furniture.js");
  const types = Object.keys(F.FURNITURE);
  let n = 0, chars = 0;
  for (const t of types) { const u = T.furnitureThumb(t, "standard"); if (u) { n++; chars += u.length; } }
  return { n, total: types.length, chars };
})()`;

async function memoryRun(env, { house, cpu }) {
  const run = await openPage(env, { house, cpu, vp: VIEWPORTS.quer });
  const lt0 = () => run.pg.evaluate(() => window.__perf.longtasks.length);
  try {
    await settle(run.pg, { limit: 60000 + 25000 * cpu });
    const r = { house, cpu, stufen: [] };
    r.stufen.push(await snap(run, "nach dem Laden", env));
    r.geo = await run.pg.evaluate(GEO_JS);
    // Editor öffnen
    let n0 = await lt0();
    const tEditor = await run.pg.evaluate(async () => {
      const t0 = performance.now();
      await window.panel._openEditor(); // lädt den Editor beim ersten Mal nach (außer er ist im Leerlauf schon vorgeladen)
      return performance.now() - t0;
    });
    await sleep(800 + 300 * cpu);
    const ltEditor = await run.pg.evaluate((n) => window.__perf.longtasks.slice(n), n0);
    r.editor = { oeffnenMs: tEditor, ltAnzahl: ltEditor.length, ltSumme: ltEditor.reduce((s, [, d]) => s + d, 0), ltGroesste: Math.max(0, ...ltEditor.map(([, d]) => d)) };
    r.stufen.push(await snap(run, "Editor offen", env));
    // Katalog „Einrichten“: Vorschaubilder entstehen für die sichtbaren Kacheln; wartet, bis keine Platzhalter mehr da sind
    // (ältere Fassungen rendern dabei alle Typen im Hintergrund weiter: dann wird zusätzlich gewartet, bis alle fertig sind)
    const PLATZHALTER = () => window.panel.shadowRoot.querySelectorAll(".catalog .tile .ph").length;
    const measureCatalog = async (action) => {
      const n1 = await lt0();
      const t1 = Date.now();
      let peak1 = 0;
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          try {
            peak1 = Math.max(peak1, (await run.cdp.send("Runtime.getHeapUsage")).usedSize / 1048576);
          } catch {
            /* Seite beschäftigt */
          }
          await sleep(300);
        }
      })();
      const tAction = await run.pg.evaluate(action);
      const deadline = Date.now() + 240000 * Math.max(1, cpu / 2);
      let ph;
      do {
        await sleep(500);
        ph = await run.pg.evaluate(PLATZHALTER);
      } while (ph > 0 && Date.now() < deadline);
      const thumbs = await run.pg.evaluate(THUMB_JS);
      sampling = false;
      await sampler;
      const lt = await run.pg.evaluate((n) => window.__perf.longtasks.slice(n), n1);
      return { ...tAction, vorschauenMs: Date.now() - t1, vorschauen: thumbs.n, von: thumbs.total, vorschauZeichen: thumbs.chars, platzhalterRest: ph, spitzeMB: peak1, ltAnzahl: lt.length, ltSumme: lt.reduce((s, [, d]) => s + d, 0), ltGroesste: Math.max(0, ...lt.map(([, d]) => d)) };
    };
    r.katalog = await measureCatalog(() => {
      window.panel.shadowRoot.querySelector('.ed-bar button[data-tool=furniture]').click();
      return { kacheln: window.panel.shadowRoot.querySelectorAll(".catalog .tile").length };
    });
    r.stufen.push(await snap(run, "Katalog 'Einrichten' (Standard): Vorschaubilder der sichtbaren Kacheln", env));
    // alle Gruppen und Kategorien aufklappen (bei neuen Fassungen entstehen jetzt die übrigen Vorschaubilder)
    r.alleAuf = await measureCatalog(() => {
      const t0 = performance.now();
      const root = window.panel.shadowRoot;
      for (let k = 0; k < 120; k++) {
        const b = root.querySelector('.catalog button.grp[aria-expanded="false"], .catalog button.cat[aria-expanded="false"]');
        if (!b) break;
        b.click();
      }
      return { ms: performance.now() - t0, kacheln: root.querySelectorAll(".catalog .tile").length };
    });
    r.stufen.push(await snap(run, "Katalog: alle Gruppen aufgeklappt, alle Vorschaubilder", env));
    // Editor schließen
    await run.pg.evaluate(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]").click());
    await sleep(800 + 300 * cpu);
    r.editorZu = await run.pg.evaluate(() => !window.panel._editor);
    r.stufen.push(await snap(run, "Editor geschlossen", env));
    // Editor noch viermal öffnen und schließen: bleibt etwas hängen (Heap, Prozessspeicher, WebGL-Kontexte)?
    const last = r.stufen.at(-1);
    r.zyklen = [{ n: 1, heapMB: last.heapMB, rendererMB: last.rendererMB, gpuMB: last.gpuMB, glKontexte: last.glKontexte }];
    for (let n = 2; n <= 5; n++) {
      await run.pg.evaluate(() => window.panel._openEditor());
      await sleep(600 + 200 * cpu);
      await run.pg.evaluate(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]").click());
      await sleep(600 + 200 * cpu);
      const s = await snap(run, `Zyklus ${n}`, env);
      r.zyklen.push({ n, heapMB: s.heapMB, rendererMB: s.rendererMB, gpuMB: s.gpuMB, glKontexte: s.glKontexte });
    }
    r.fehler = run.errors.slice(0, 5);
    return r;
  } finally {
    await run.ctx.close();
  }
}

async function partSpeicher(env) {
  say(`\n## Speicher, Editor und Katalog (Kontext ${VIEWPORTS.quer.name}, 1 Durchlauf je Feld; Heap nach Speicherbereinigung)\n`);
  const out = {};
  for (const house of HOUSES) {
    for (const cpu of CPUS) {
      say(`  ${house} ${cpu}× …`);
      (out[house] ??= {})[cpu] = await memoryRun(env, { house, cpu });
    }
  }
  for (const house of HOUSES) {
    const r1 = out[house][CPUS[0]];
    say(`\nHeap und Szene, Haus "${house}" (CPU ${CPUS[0]}×):\n`);
    say(table(["Stufe", "JS-Heap MB", "Renderer-Prozess MB", "GPU-Prozess MB", "Geometrien", "Texturen", "Zeichenaufrufe", "Dreiecke", "Objekte", "Meshes", "einzigartige Geometrien", "Materialien", "Editor-3D", "WebGL-Kontexte", "DOM-Knoten"], r1.stufen.map((s) => [s.label, mb(s.heapMB), f0(s.rendererMB), f0(s.gpuMB), s.geometrien, s.texturen, s.zeichenaufrufe, f0(s.dreiecke), s.objekte, s.meshes, s.geoEinzigartig, s.matEinzigartig, s.editor3d, s.glKontexte, s.dom])));
    say(`\nEditor 5× öffnen und schließen (Haus "${house}", CPU ${CPUS[0]}×; Zyklus 1 = der Ablauf oben):\n`);
    say(table(["Zyklus", "JS-Heap MB", "Renderer-Prozess MB", "GPU-Prozess MB", "WebGL-Kontexte angelegt"], r1.zyklen.map((z) => [z.n, mb(z.heapMB), f0(z.rendererMB), f0(z.gpuMB), z.glKontexte])));
    const g = r1.geo;
    say(`\nSzene "${house}": ${g.meshes} sichtbare Meshes (davon ${g.moebelMeshes} in ${g.moebelStuecke} Möbelstücken, ${g.linien} Linien), ${g.geometrienGesamt} Geometrien, davon nur ${g.geometrienGleichInhalt} verschieden im Inhalt (Möbel: ${g.moebelGeometrienGleichInhalt}); ${g.moebelTypGroessen} verschiedene Möbel nach Typ + Maßen.`);
    say(`Zeichenaufrufe: heute ${g.aufrufeHeute}; Möbel je Stück nach Material zusammengefasst ${g.aufrufeMoebelJeMaterial}; gleiche Möbel instanziert ${g.aufrufeMoebelInstanziert}; beides ${g.aufrufeBeides} (ohne Schatten- und Zusatzdurchgänge, Wände/Böden unverändert).`);
    say(`\nEditor und Katalog, Haus "${house}":\n`);
    say(table(["CPU", "Editor öffnen ms", "Long Tasks (Editor) Σ ms", "größter ms", "Katalog öffnen: Bilder fertig nach ms", "Bilder (fertig/Typen)", "Kacheln", "Long Tasks (Katalog) Σ ms", "größter ms", "Heap-Spitze MB", "Bild-Daten MB"], CPUS.map((c) => {
      const r = out[house][c];
      return [`${c}×`, f0(r.editor.oeffnenMs), f0(r.editor.ltSumme), f0(r.editor.ltGroesste), f0(r.katalog.vorschauenMs), `${r.katalog.vorschauen}/${r.katalog.von}`, r.katalog.kacheln, f0(r.katalog.ltSumme), f0(r.katalog.ltGroesste), mb(r.katalog.spitzeMB), mb(r.katalog.vorschauZeichen / 1048576)];
    })));
    say(`
Alle Gruppen aufklappen (danach alle Vorschaubilder), Haus "${house}":
`);
    say(table(["CPU", "aufklappen ms", "Kacheln", "alle Bilder fertig nach ms", "Bilder (fertig/Typen)", "Long Tasks Σ ms", "größter ms", "Heap-Spitze MB", "Bild-Daten MB"], CPUS.map((c) => {
      const r = out[house][c].alleAuf;
      return [`${c}×`, f0(r.ms), r.kacheln, f0(r.vorschauenMs), `${r.vorschauen}/${r.von}`, f0(r.ltSumme), f0(r.ltGroesste), mb(r.spitzeMB), mb(r.vorschauZeichen / 1048576)];
    })));
  }
  results.teile.speicher = out;
  return out;
}

// ------------------------------------------------------------------ Teil 3: Modulnutzung (V8-Abdeckung)

const PHASEN = ["Laden + Szene", "Einstellungen offen", "Admin-Dialog offen", "Editor offen", "Katalog Einrichten", "Editor zu"];

/** Je Skript ein Byte pro Zeichen: 1 = Code wurde ausgeführt (innerste Funktion zählt). */
function usedMap(len, functions) {
  const u = new Uint8Array(len);
  const ranges = [];
  for (const fn of functions) for (const r of fn.ranges) ranges.push(r);
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) u.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(len, r.endOffset));
  return u;
}

async function coverageRun(env, house) {
  const run = await openPage(env, { house, cpu: 1, vp: VIEWPORTS.quer, coverage: true });
  try {
    await settle(run.pg, { limit: 90000 });
    const lens = new Map();
    const used = new Map(); // Datei -> kumulativ benutzt
    const first = new Map(); // Datei -> erste Phase mit Funktionsaufruf (ohne Modulrumpf)
    const phasesPct = new Map(); // Datei -> [Anteil je Phase kumulativ]
    const take = async (phase) => {
      const { result } = await run.cdp.send("Profiler.takePreciseCoverage");
      for (const s of result) {
        if (!s.url.includes(FRONT_URL)) continue;
        const file = s.url.split(FRONT_URL)[1].split("?")[0];
        if (!lens.has(file)) lens.set(file, (await readFile(join(FRONT, file), "utf8")).length);
        const len = lens.get(file);
        const now = usedMap(len, s.functions);
        const acc = used.get(file) ?? new Uint8Array(len);
        for (let i = 0; i < len; i++) acc[i] |= now[i];
        used.set(file, acc);
        if (!first.has(file) && s.functions.slice(1).some((fn) => fn.ranges[0].count > 0)) first.set(file, phase);
      }
      for (const [file, acc] of used) {
        let n = 0;
        for (let i = 0; i < acc.length; i++) n += acc[i];
        const list = phasesPct.get(file) ?? [];
        list[phase] = n / acc.length;
        phasesPct.set(file, list);
      }
    };
    await take(0);
    await run.pg.evaluate(() => window.panel._openSettings());
    await sleep(600);
    await take(1);
    await run.pg.evaluate(() => window.panel._closeDialog?.());
    await unlock(run.pg, "admin").catch(() => {});
    await sleep(600);
    await take(2);
    await run.pg.evaluate(() => window.panel._closeDialog?.());
    await run.pg.evaluate(() => window.panel._openEditor());
    await sleep(1000);
    await take(3);
    await run.pg.evaluate(() => window.panel.shadowRoot.querySelector('.ed-bar button[data-tool=furniture]')?.click());
    for (let k = 0; k < 240; k++) {
      await sleep(500);
      // fertig, sobald keine sichtbare Kachel mehr auf ihr Vorschaubild wartet (ältere Fassungen: alle Typen gerendert)
      const t = await run.pg.evaluate(THUMB_JS);
      const ph = await run.pg.evaluate(() => window.panel.shadowRoot.querySelectorAll(".catalog .tile .ph").length);
      if (ph === 0 || t.n >= t.total) break;
    }
    await take(4);
    await run.pg.evaluate(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]")?.click());
    await sleep(800);
    await take(5);
    const loadedAtStart = new Set((await run.pg.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname))).filter((p) => p.includes(FRONT_URL)).map((p) => p.split(FRONT_URL)[1]));
    const rows = [];
    for (const [file, len] of lens) {
      const size = Buffer.byteLength(await readFile(join(FRONT, file), "utf8"));
      const pct = phasesPct.get(file) ?? [];
      const start = pct[0] ?? 0;
      rows.push({ datei: file, bytes: size, gruppe: groupOf(file), anteilStart: start, anteilEnde: pct.at(-1) ?? 0, ersteNutzung: first.has(file) ? PHASEN[first.get(file)] : "nur Auswertung des Moduls", ersteNutzungNr: first.has(file) ? first.get(file) : 99, beimStart: loadedAtStart.has(file) });
    }
    return { house, rows, fehler: run.errors.slice(0, 5) };
  } finally {
    await run.ctx.close();
  }
}

async function partModule(env) {
  say(`\n## Modulnutzung (V8-Abdeckung, Funktionsebene; CPU 1×)\n`);
  say(`Phasen: ${PHASEN.map((p, i) => `${i} ${p}`).join(" → ")}. „Nutzung“ = Anteil des Quelltexts, dessen Funktionen bis dahin mindestens einmal liefen.\n`);
  const out = {};
  for (const house of HOUSES) {
    say(`  ${house} …`);
    out[house] = await coverageRun(env, house);
    const rows = out[house].rows;
    const byGroup = new Map();
    for (const r of rows) {
      const e = byGroup.get(r.gruppe) ?? { n: 0, bytes: 0, start: 0, ende: 0 };
      e.n++;
      e.bytes += r.bytes;
      e.start += r.bytes * r.anteilStart;
      e.ende += r.bytes * r.anteilEnde;
      byGroup.set(r.gruppe, e);
    }
    say(`\nHaus "${house}" – Nutzung nach Gruppe (alles, was beim Start geladen wird):\n`);
    say(table(["Gruppe", "Module", "KB", "ausgeführt beim Start", "ausgeführt nach allen Phasen"], [...byGroup].sort((a, b) => b[1].bytes - a[1].bytes).map(([g, e]) => [g, e.n, kb(e.bytes), `${kb(e.start)} KB (${f0((e.start / e.bytes) * 100)} %)`, `${kb(e.ende)} KB (${f0((e.ende / e.bytes) * 100)} %)`])));
    const later = rows.filter((r) => r.bytes > 8000 && r.anteilStart < 0.4 && !r.datei.startsWith("vendor/three")).sort((a, b) => b.bytes - a.bytes);
    say(`\nHaus "${house}" – Module ≥ 8 KB, von denen beim Start weniger als 40 % des Quelltexts ausgeführt wird:\n`);
    say(table(["Modul", "Gruppe", "KB", "erste Nutzung", "Nutzung Start", "Nutzung am Ende"], later.slice(0, 45).map((r) => [r.datei, r.gruppe, kb(r.bytes), r.ersteNutzung, `${f0(r.anteilStart * 100)} %`, `${f0(r.anteilEnde * 100)} %`])));
    const never = rows.filter((r) => r.ersteNutzungNr === 99);
    say(`\nHaus "${house}": ${never.length} Module (${kb(never.reduce((s, r) => s + r.bytes, 0))} KB) werden in keiner Phase aufgerufen (nur Daten/Konstanten bzw. noch nicht erreichte Pfade).`);
    const furn = rows.filter((r) => /^(furniture|catalog-)/.test(r.datei));
    say(`Möbel-Bauer und Kataloge: ${furn.length} Module, ${kb(furn.reduce((s, r) => s + r.bytes, 0))} KB, davon beim Start ausgeführt ${kb(furn.reduce((s, r) => s + r.bytes * r.anteilStart, 0))} KB.`);
  }
  results.teile.module = out;
  return out;
}

// ------------------------------------------------------------------ Teil 3b: Ablaufprotokoll (Tracing) des Ladens

/** Hauptthread-Zeit nach Art (aus dem Chrome-Ablaufprotokoll): Kompilieren, Modul-Auswertung, Skript, Layout, Speicherbereinigung. */
async function traceRun(env, { house, cpu }) {
  const run = await openPage(env, { house, cpu, vp: VIEWPORTS.hoch, trace: true });
  try {
    await settle(run.pg, { limit: 60000 + 25000 * cpu });
    const done = new Promise((r) => run.cdp.once("Tracing.tracingComplete", r));
    await run.cdp.send("Tracing.end");
    await done;
    const ev = run.events;
    const key = (e) => `${e.pid}:${e.tid}`;
    const load = new Map();
    for (const e of ev) if (e.ph === "X" && e.name === "RunTask") load.set(key(e), (load.get(key(e)) ?? 0) + (e.dur ?? 0));
    const main = ev.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain").sort((a, b) => (load.get(key(b)) ?? 0) - (load.get(key(a)) ?? 0))[0];
    const sum = (names, onMain = true) => {
      const list = ev.filter((e) => e.ph === "X" && names.includes(e.name) && e.pid === main.pid && (e.tid === main.tid) === onMain);
      return { n: list.length, ms: list.reduce((s, e) => s + (e.dur ?? 0), 0) / 1000 };
    };
    return {
      aufgaben: sum(["RunTask"]),
      kompilieren: sum(["V8.CompileCode"]),
      modulKompilieren: sum(["v8.compileModule"]),
      modulAuswerten: sum(["v8.evaluateModule"]),
      skriptAufrufe: sum(["FunctionCall"]),
      bildschritt: sum(["FireAnimationFrame"]),
      layout: sum(["Layout", "UpdateLayoutTree"]),
      speicherbereinigung: sum(["MajorGC", "MinorGC"]),
      hintergrundParsen: sum(["v8.parseOnBackground"], false),
      hintergrundOptimieren: sum(["V8.MaglevTask", "V8.TurbofanTask"], false),
      fehler: run.errors.slice(0, 3),
    };
  } finally {
    await run.ctx.close();
  }
}

async function partTrace(env) {
  say(`\n## Hauptthread-Zeit beim Laden nach Art (Ablaufprotokoll, ein Durchlauf, ${VIEWPORTS.hoch.name}; Werte enthalten die Drosselung)\n`);
  say("Die Spalten überlappen sich teilweise (Kompilieren geschieht auch innerhalb von Skript-Aufrufen); „Hintergrund“ läuft auf anderen Threads und wird von der CPU-Drosselung nicht verlangsamt.\n");
  const out = {};
  const rows = [];
  for (const house of HOUSES) {
    for (const cpu of CPUS) {
      const r = await traceRun(env, { house, cpu });
      (out[house] ??= {})[cpu] = r;
      rows.push([house, `${cpu}×`, f0(r.aufgaben.ms), f0(r.kompilieren.ms), f0(r.modulKompilieren.ms), f0(r.modulAuswerten.ms), f0(r.skriptAufrufe.ms), f0(r.bildschritt.ms), f0(r.layout.ms), f0(r.speicherbereinigung.ms), f0(r.hintergrundParsen.ms), f0(r.hintergrundOptimieren.ms)]);
    }
  }
  say(table(["Haus", "CPU", "alle Aufgaben ms", "Kompilieren (Funktionen)", "Module kompilieren", "Module auswerten", "Skript-Aufrufe", "davon Bildschritte", "Layout+Stil", "Speicherbereinigung", "Hintergrund: Parsen", "Hintergrund: Optimieren"], rows));
  results.teile.trace = out;
  return out;
}

// ------------------------------------------------------------------ Teil 3c: CPU-Profil des Ladens

/** Eigen- und Gesamtzeit je Funktion und je Datei aus einem V8-CPU-Profil (Abtastung alle 250 µs). */
function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const fileOf = (cf) => (cf.url.includes(FRONT_URL) ? cf.url.split(FRONT_URL)[1].split("?")[0] : cf.url ? `(extern) ${cf.url.split("/").pop().split("?")[0]}` : `(${cf.functionName.replace(/[()]/g, "") || "nativ"})`);
  const keyOf = (cf) => `${fileOf(cf)}:${cf.functionName || "(anonym)"}:${cf.lineNumber + 1}`;
  const byFile = new Map();
  const byFnSelf = new Map();
  let total = 0;
  for (const [id, us] of self) {
    const cf = nodes.get(id).callFrame;
    if (cf.functionName === "(idle)") continue;
    total += us;
    byFile.set(fileOf(cf), (byFile.get(fileOf(cf)) ?? 0) + us);
    byFnSelf.set(keyOf(cf), (byFnSelf.get(keyOf(cf)) ?? 0) + us);
  }
  // Gesamtzeit je Funktion: rekursive Aufrufe nicht doppelt zählen
  const incl = new Map();
  const walk = (id, active) => {
    const n = nodes.get(id);
    const k = keyOf(n.callFrame);
    let t = n.callFrame.functionName === "(idle)" ? 0 : (self.get(id) ?? 0);
    const mine = active.has(k);
    if (!mine) active.add(k);
    for (const c of n.children ?? []) t += walk(c, active);
    if (!mine) {
      active.delete(k);
      incl.set(k, (incl.get(k) ?? 0) + t);
    }
    return t;
  };
  walk(profile.nodes[0].id, new Set());
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => [k, us / 1000]);
  return { gesamtMs: total / 1000, dateien: top(byFile, 22), selbst: top(byFnSelf, 22), gesamt: top(incl, 40) };
}

async function profileRun(env, { house, cpu }) {
  const run = await openPage(env, { house, cpu, vp: VIEWPORTS.hoch, profile: true });
  try {
    await settle(run.pg, { limit: 60000 + 25000 * cpu });
    const { profile } = await run.cdp.send("Profiler.stop");
    return summarizeProfile(profile);
  } finally {
    await run.ctx.close();
  }
}

async function partProfil(env) {
  const cpu = CPUS.includes(4) ? 4 : CPUS[0];
  say(`\n## CPU-Profil des Ladens (Abtastung, ${VIEWPORTS.hoch.name}, CPU ${cpu}×; Zeiten enthalten die Drosselung und den Aufwand des Profilers)\n`);
  const out = {};
  for (const house of HOUSES) {
    const r = await profileRun(env, { house, cpu });
    out[house] = r;
    say(`\nHaus "${house}": ${f0(r.gesamtMs)} ms Hauptthread im Profil.\n`);
    say(table(["Datei (Eigenzeit)", "ms", "Anteil"], r.dateien.slice(0, 16).map(([k, ms]) => [k, f0(ms), `${f0((ms / r.gesamtMs) * 100)} %`])));
    say(`\nFunktionen mit der größten Gesamtzeit (ohne Hülle):\n`);
    say(table(["Funktion (Datei:Name:Zeile)", "ms gesamt", "Anteil"], r.gesamt.filter(([k]) => !/^\((root|programm|program)\)|\(garbage/.test(k)).slice(0, 22).map(([k, ms]) => [k, f0(ms), `${f0((ms / r.gesamtMs) * 100)} %`])));
    say(`\nFunktionen mit der größten Eigenzeit:\n`);
    say(table(["Funktion (Datei:Name:Zeile)", "ms eigen", "Anteil"], r.selbst.slice(0, 14).map(([k, ms]) => [k, f0(ms), `${f0((ms / r.gesamtMs) * 100)} %`])));
  }
  results.teile.profil = out;
  return out;
}

// ------------------------------------------------------------------ Teil 4: Bildrate beim Kreisen

async function fpsRun(env, { house, cpu }) {
  const run = await openPage(env, { house, cpu, vp: VIEWPORTS.quer });
  try {
    await settle(run.pg, { limit: 60000 + 25000 * cpu });
    const out = {};
    // Leerlauf: nichts bedienen. Wie oft wird gezeichnet (Energiefluss, Wetter …) und wie ausgelastet ist der Hauptthread?
    {
      const m0 = await metricsOf(run.cdp);
      const r0 = await run.pg.evaluate(() => window.panel._scene.stats.renders);
      await sleep(5000);
      const r1 = await run.pg.evaluate(() => window.panel._scene.stats.renders);
      const m1 = await metricsOf(run.cdp);
      out.leerlauf = { bilderProSek: (r1 - r0) / (m1.Timestamp - m0.Timestamp), auslastung: (m1.TaskDuration - m0.TaskDuration) / (m1.Timestamp - m0.Timestamp) };
    }
    for (const style of ["day", "cyber"]) {
      const wechselMs = await run.pg.evaluate((st) => {
        const t0 = performance.now();
        window.panel._settings.style = st;
        window.panel._applyStyle(); // baut bei einem neuen Stil das ganze Haus neu (Materialien, Kanten)
        return performance.now() - t0;
      }, style);
      await settle(run.pg, { quiet: 1200, limit: 60000 + 25000 * cpu });
      // kurz warmdrehen (JIT, Zwischenspeicher), dann messen
      await run.pg.evaluate(async () => {
        const s = window.panel._scene;
        s.controls.autoRotate = true;
        s.controls.autoRotateSpeed = 12;
        s.invalidate();
        await new Promise((r) => setTimeout(r, 1500));
        s.controls.autoRotate = false;
      });
      await settle(run.pg, { quiet: 600, limit: 30000 });
      const m0 = await metricsOf(run.cdp);
      const n0 = await run.pg.evaluate(() => window.__perf.longtasks.length);
      const secs = 5;
      const r = await run.pg.evaluate(async (ms) => {
        const s = window.panel._scene;
        const c = s.controls;
        const orig = s.renderer.render;
        let renderMs = 0;
        let frames = 0;
        s.renderer.render = function (...a) {
          const t = performance.now();
          const v = orig.apply(this, a);
          renderMs += performance.now() - t;
          frames++;
          return v;
        };
        // Overlays (Beschriftungen, Geräte) werden bei jeder Kamerabewegung neu positioniert
        const p = window.panel;
        const origOv = p._positionOverlays;
        let ovMs = 0;
        let ovCalls = 0;
        p._positionOverlays = function (...a) {
          const t = performance.now();
          const v = origOv.apply(this, a);
          ovMs += performance.now() - t;
          ovCalls++;
          return v;
        };
        let raf = 0;
        let stop = false;
        const loop = () => {
          raf++;
          if (!stop) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        c.autoRotate = true;
        c.autoRotateSpeed = 12;
        s.invalidate();
        const r0 = s.stats.renders;
        const t0 = performance.now();
        await new Promise((res) => setTimeout(res, ms));
        const dt = (performance.now() - t0) / 1000;
        stop = true;
        c.autoRotate = false;
        s.renderer.render = orig;
        p._positionOverlays = origOv;
        const info = s.renderer.info;
        return { fps: (s.stats.renders - r0) / dt, rafFps: raf / dt, renderMsProBild: frames ? renderMs / frames : null, overlayMsProAufruf: ovCalls ? ovMs / ovCalls : null, overlays: p._overlays?.size ?? null, zeichenaufrufe: info.render.calls, dreiecke: info.render.triangles, dpr: s.renderer.getPixelRatio() };
      }, secs * 1000);
      const m1 = await metricsOf(run.cdp);
      const lt = await run.pg.evaluate((n) => window.__perf.longtasks.slice(n), n0);
      const calls = await run.pg.evaluate(() => (window.__perf.calls.sceneBuild ?? []).length);
      out[style] = { ...r, wechselMs, auslastung: (m1.TaskDuration - m0.TaskDuration) / (m1.Timestamp - m0.Timestamp), scriptAnteil: (m1.ScriptDuration - m0.ScriptDuration) / (m1.Timestamp - m0.Timestamp), ltAnzahl: lt.length, ltSumme: lt.reduce((s, [, d]) => s + d, 0), szeneBauenAufrufe: calls };
      await sleep(300);
    }
    out.fehler = run.errors.slice(0, 5);
    return out;
  } finally {
    await run.ctx.close();
  }
}

async function partFps(env) {
  say(`\n## Bildrate beim Kreisen (Orbit per autoRotate, 5 s, ${VIEWPORTS.quer.name}, Qualität "${VIEWPORTS.quer.quality}", GPU: ${GPU})\n`);
  const out = {};
  const rows = [];
  for (const house of HOUSES) {
    for (const cpu of CPUS) {
      const list = [];
      for (let i = 0; i < Math.max(1, Math.min(RUNS, 2)); i++) list.push(await fpsRun(env, { house, cpu }));
      (out[house] ??= {})[cpu] = list;
      for (const style of ["day", "cyber"]) {
        const m = (k) => medianOf(list, (x) => x[style][k]);
        rows.push([house, `${cpu}×`, style === "day" ? "standard (day)" : "cyber", f1(m("fps")), f1(m("renderMsProBild")), f1(m("overlayMsProAufruf")), f0(m("overlays")), f0(m("zeichenaufrufe")), f0(m("dreiecke")), `${f0(m("auslastung") * 100)} %`, f0(m("ltAnzahl")), f0(m("wechselMs"))]);
      }
    }
  }
  say(table(["Haus", "CPU", "Stil", "Bilder/s", "ms je render()", "ms Overlays je Bild", "Overlays", "Zeichenaufrufe", "Dreiecke", "Hauptthread ausgelastet", "Long Tasks in 5 s", "Stilwechsel (Neuaufbau) ms"], rows));
  say(`\nLeerlauf nach dem Laden (nichts bedient, 5 s; Median):\n`);
  say(table(["Haus", "CPU", "Bilder/s im Leerlauf", "Hauptthread ausgelastet"], HOUSES.flatMap((h) => CPUS.map((c) => [h, `${c}×`, f1(medianOf(out[h][c], (x) => x.leerlauf.bilderProSek)), `${f0(medianOf(out[h][c], (x) => x.leerlauf.auslastung) * 100)} %`]))));
  results.teile.fps = out;
  return out;
}

// ------------------------------------------------------------------ Teil 5: Varianten (Gedankenspiele)

async function partVarianten(env) {
  say(`\n## Gedankenspiel: Module nachladen statt am Start (Median aus ${RUNS_VAR}, ${VIEWPORTS.hoch.name}, GPU: ${GPU})\n`);
  say(`Die Module werden vom Testserver durch leere Hüllen ersetzt (nur die Ladezeit zählt, die Funktion fehlt dann). „ohne-bauer“ nur mit dem Beispielhaus aussagekräftig, weil das große Haus fast alle Bauer-Module braucht.\n`);
  const out = {};
  const rows = [];
  for (const house of HOUSES) {
    const names = Object.keys(VARIANTEN).filter((n) => !(n === "ohne-bauer" && house === "gross"));
    for (const cpu of CPUS) {
      // abwechselnd statt nacheinander messen: Störungen auf dem Rechner (andere Programme) treffen alle Varianten gleich
      const lists = Object.fromEntries(names.map((n) => [n, []]));
      for (let i = 0; i < RUNS_VAR; i++) {
        for (const name of names) {
          env.state.stubs.clear();
          // das große Haus braucht fast alle Möbel-Bauer: die bleiben dort echt (sonst fehlen ihm die Möbel und es wäre leichter)
          for (const f of VARIANTEN[name].filter((x) => !(house === "gross" && /^furniture-(extra|more)\.js$/.test(x)))) env.state.stubs.set(f, stubSource(await readFile(join(FRONT, f), "utf8")));
          lists[name].push((await loadOnce(env, { house, cpu, vp: VIEWPORTS.hoch, net: NET })).a);
        }
      }
      for (const name of names) {
        const list = lists[name];
        const m = medianAnalysis(list);
        const bilder = list.map((a) => a.bild3d).filter(Number.isFinite);
        ((out[house] ??= {})[name] ??= {})[cpu] = { ...m, bildMin: Math.min(...bilder), bildMax: Math.max(...bilder) };
        rows.push([house, name, `${cpu}×`, m.module, kb(m.bytes), kb(m.gzip), f0(m.definiert), f0(m.bild3d), `${f0(Math.min(...bilder))}–${f0(Math.max(...bilder))}`, f0(m.ltSumme), f0(m.ltGroesste), mb(m.heapMB), m.fehler ? `FEHLER ${m.fehler}: ${(m.fehlerText[0] ?? "").slice(0, 70)}` : ""]);
      }
      say(`  ${house} ${cpu}× fertig`);
    }
  }
  env.state.stubs.clear();
  say(table(["Haus", "Variante", "CPU", "Module", "JS KB", "gzip KB", "Panel definiert ms", "1. 3D-Bild ms (Median)", "1. 3D-Bild min–max", "Σ Long Tasks ms", "größter ms", "Heap MB", "Hinweis"], rows));
  results.teile.varianten = out;
  return out;
}

// ------------------------------------------------------------------ Teil 6: bleibt nach dem Schließen des Editors etwas hängen?

/**
 * Editor mehrmals öffnen und schließen; mit fix = true liefert der Testserver scene.js mit forceContextLoss() in dispose()
 * (nur Gedankenspiel, der Quelltext im Paket bleibt unberührt): gibt die Grafikkarte den Speicher dann wieder her?
 */
async function leakRun(env0, { house, fix, cycles }) {
  // eigener Browser je Durchlauf: Reste eines vorigen Durchlaufs (Grafikkartenspeicher, WebGL-Kontexte) sollen nicht mitzählen
  const browser = await launchBrowser();
  const env = { ...env0, browser, bs: await browser.newBrowserCDPSession(), warm: new Set() };
  const rows = [];
  let fehler = null;
  try {
    env.state.stubs.clear();
    // Steht forceContextLoss() schon in scene.js (Fix im Paket), wird für „ohne Fix“ der Aufruf entfernt, sonst für „mit Fix“ eingefügt
    const src = await readFile(join(FRONT, "scene.js"), "utf8");
    const drin = /\n\s*this\.renderer\.forceContextLoss\(\);/.test(src);
    if (fix !== drin) {
      const out = fix ? src.replace(/(this\.renderer\.dispose\(\);)(\s*this\.renderer\.domElement\.remove\(\);)/, "$1\n    this.renderer.forceContextLoss();$2") : src.replace(/\n\s*this\.renderer\.forceContextLoss\(\);/, "");
      if (out === src) throw new Error("scene.js: dispose() nicht gefunden – Gedankenspiel nicht möglich");
      env.state.stubs.set("scene.js", out);
    }
    const run = await openPage(env, { house, cpu: 1, vp: VIEWPORTS.quer });
    try {
      await settle(run.pg, { limit: 90000 });
      const take = async (n) => {
        const s = await snap(run, `Zyklus ${n}`, env);
        // Ist die Zeichenfläche der Hauptansicht noch da? (Chrome wirft ab etwa 16 WebGL-Kontexten die ältesten raus.)
        const verloren = await run.pg.evaluate(() => window.panel?._scene?.renderer?.getContext?.().isContextLost?.() ?? null);
        rows.push({ n, heapMB: s.heapMB, rendererMB: s.rendererMB, gpuMB: s.gpuMB, glKontexte: s.glKontexte, hauptansichtVerloren: verloren });
      };
      await take(0);
      for (let n = 1; n <= cycles; n++) {
        await run.pg.evaluate(() => window.panel._openEditor());
        await sleep(700);
        await run.pg.evaluate(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]").click());
        await sleep(700);
        await take(n);
      }
    } finally {
      await run.ctx.close();
    }
  } catch (err) {
    fehler = String(err?.message ?? err).split("\n")[0];
  } finally {
    env.state.stubs.clear();
    await browser.close().catch(() => {});
  }
  return { rows, fehler };
}

async function partLeck(env) {
  const cycles = 18;
  say(`\n## Editor ${cycles}× öffnen und schließen (CPU 1×, ${VIEWPORTS.quer.name}); „mit Fix“ = forceContextLoss() in HouseScene.dispose(), „ohne Fix“ = der Testserver liefert scene.js ohne diesen Aufruf (Gedankenspiel, falls er im Paket schon steht)\n`);
  const out = {};
  for (const house of HOUSES) {
    const a = await leakRun(env, { house, fix: false, cycles });
    const b = await leakRun(env, { house, fix: true, cycles });
    out[house] = { ohneFix: a, mitFix: b };
    say(`\nHaus "${house}":\n`);
    const cell = (r, k, f) => (r ? f(r[k]) : "–");
    say(table(["Zyklus", "Renderer MB ohne Fix", "GPU MB ohne Fix", "WebGL-Kontexte ohne Fix", "Hauptansicht verloren ohne Fix", "Renderer MB mit Fix", "GPU MB mit Fix", "WebGL-Kontexte mit Fix", "Hauptansicht verloren mit Fix"], Array.from({ length: Math.max(a.rows.length, b.rows.length) }, (_, i) => [i, cell(a.rows[i], "rendererMB", f0), cell(a.rows[i], "gpuMB", f0), cell(a.rows[i], "glKontexte", String), cell(a.rows[i], "hauptansichtVerloren", String), cell(b.rows[i], "rendererMB", f0), cell(b.rows[i], "gpuMB", f0), cell(b.rows[i], "glKontexte", String), cell(b.rows[i], "hauptansichtVerloren", String)])));
    if (a.fehler || b.fehler) say(`Abbruch: ohne Fix: ${a.fehler ?? "–"}; mit Fix: ${b.fehler ?? "–"}`);
  }
  results.teile.leck = out;
  return out;
}

// ------------------------------------------------------------------ Ablauf

const virtual = new Map();
let gross = null;
if (HOUSES.includes("gross")) {
  gross = await bigHouse();
  virtual.set("/perf-gross.json", JSON.stringify(gross));
  results.grossesHaus = houseStats(gross);
}
const base = JSON.parse(await readFile(join(root, "custom_components/haus3d/haus-daten.json"), "utf8"));
results.beispielhaus = houseStats(base);
say(`# Haus 3D – Leistungsmessung (${new Date().toLocaleString("de-DE")})\n`);
say(`Beispielhaus: ${JSON.stringify(results.beispielhaus)}`);
if (gross) say(`Großes Testhaus: ${JSON.stringify(results.grossesHaus)}`);

if (PARTS.has("statisch")) await staticAnalysis();

const needBrowser = ["laden", "speicher", "module", "trace", "profil", "fps", "varianten", "leck"].some((p) => PARTS.has(p));
if (needBrowser) {
  const { server, state, port } = makeServer(virtual);
  const browser = await launchBrowser();
  const env = { server, state, port, browser, bs: await browser.newBrowserCDPSession(), warm: new Set() };
  try {
    const renderer = await (async () => {
      const pg = await browser.newPage();
      await pg.setContent("<canvas id=c></canvas>");
      const r = await pg.evaluate(() => {
        const gl = document.getElementById("c").getContext("webgl2");
        const e = gl?.getExtension("WEBGL_debug_renderer_info");
        return gl ? (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "kein WebGL";
      });
      await pg.close();
      return r;
    })();
    results.renderer = renderer;
    results.browser = browser.version();
    say(`Browser: Chromium ${browser.version()}, WebGL: ${renderer}`);
    results.rechner = { cpu: cpus()[0]?.model, threads: cpus().length, ramGB: Math.round(totalmem() / 2 ** 30), system: process.platform };
    say(`Rechner: ${results.rechner.cpu}, ${results.rechner.threads} Threads, ${results.rechner.ramGB} GB RAM (${results.rechner.system}); CPU-Drosselung ${CPUS.join("×, ")}× wirkt nur auf den Hauptthread der Seite`);
    if (PARTS.has("laden")) await partLaden(env);
    if (PARTS.has("speicher")) await partSpeicher(env);
    if (PARTS.has("module")) await partModule(env);
    if (PARTS.has("trace")) await partTrace(env);
    if (PARTS.has("profil")) await partProfil(env);
    if (PARTS.has("fps")) await partFps(env);
    if (PARTS.has("varianten")) await partVarianten(env);
    if (PARTS.has("leck")) await partLeck(env);
  } finally {
    await browser.close();
    server.close();
  }
}
await writeFile(join(OUT, `${NAME}.json`), JSON.stringify(results, null, 1));
say(`\nRohwerte: ${join(OUT, `${NAME}.json`)}`);
