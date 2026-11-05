// Leistungsmessung am nachgebauten Tablet (Messgrundlage für die Arbeit an der Bildrate). Kein "shot-"-Präfix: läuft nicht
// im normalen Testlauf (run.mjs), sondern nur von Hand:
//   NODE_PATH="$(npm root -g)" node tests/browser/bench.mjs <ordner> [Optionen]
// Optionen (Listen mit Komma):
//   --haus standard,demo,gross   Standardhaus der Testseite, Vorführhaus (wie im Backend aus haus-daten.json angelegt),
//                                großes Testhaus (grosshaus.mjs, nur erfundene Daten); Vorgabe alle drei
//   --geraet tablet|desktop      tablet: 1280×800, Faktor 2, Touch, mobil; desktop: 1280×800, Faktor 1, Maus (Vorgabe tablet)
//   --cpu 1,2                    CPU-Drosselung per CDP (Emulation.setCPUThrottlingRate), Vorgabe 1,2
//   --sekunden 5                 Dauer der Kreisfahrt und jeder Leerlauf-Messung
//   --stufen akku,ausgewogen,schoen   Qualitätsstufen (?quality=…), Vorgabe alle drei
//   --schatten an,aus            an: Schatten wie die Stufe (bei „Akku“ von der Messung erzwungen), aus: ?schatten=aus
//   --teile laden,szene,kreis,leerlauf,wetter,editor   welche Messungen laufen (Vorgabe alle; Wetter nur im Standardhaus)
//   --abfrage "&progressiv=aus"  zusätzliche Adress-Parameter (z. B. Mess-Schalter aus perf.js:perfFlags)
//   --name bench                 Dateiname der Ausgabe ohne Endung
//   --nachholen                  vorhandene Ausgabe ergänzen: nur Läufe mit Fehlern bzw. fehlende Läufe neu messen
// Ausgabe: <ordner>/<name>.json (alle Rohwerte) und <ordner>/<name>.md (Übersicht in Tabellen).
// Messwerte je Lauf:
//   Laden       erstes Bild mit Haus, JS-Module und Bytes (bis zum ersten Bild und gesamt), JS-Heap nach GC
//   Szene       „Alle“, eine Etage und Editor-3D: Zeichenaufrufe inklusive Schattenpass (info.autoReset wird dafür je Bild
//               abgeschaltet und vor dem Bild zurückgesetzt), Dreiecke, Meshes, Materialien, Texturen; Bauzeit der
//               Hauptansicht (setBuilding mit demselben Stand, Median aus 3)
//   Kreisfahrt  Wischen über die Zeichenfläche ab einer Stelle ohne Antippbares (Touch bzw. Maus, eine Umdrehung in
//               --sekunden; danach wird geprüft, dass Etage und Raumfenster gleich blieben): render() und Bildabstand
//               als Median/p90/max, Bilder/s, Aufrufe je Bild, Schattenpässe/s, Auflösung ruhend und in Bewegung,
//               Auslastung des Hauptthreads, danach der Auslauf (Dämpfung) bis zum Stillstand und zur Ruhe-Auflösung
//   Leerlauf    nichts bedienen: Bilder/s je Ursache (PV-Fluss, Leitungen, Hausfluss, Wetter, Blitz, Änderung, Animation),
//               Schattenpässe/s, GPU-Zeit je Hintergrund-Bild (gl.finish() und 1 Pixel lesen, nur hier in der Testseite)
//               und je Sekunde;
//               eingefroren (setPerf({frozen:true})): verbleibende Bilder und wer sie auslöst (Aufrufstelle von _dirty)
//   Wetter      wie Leerlauf mit Blitz ohne Niederschlag sowie Regen mit Blitz (nur Standardhaus)
//   Editor      Öffnen auf derselben Etage (Zeit, nachgeladene Module), Szene des Editors, Größe der Hauptfläche bei offenem Editor,
//               DOM-Knoten und Heap vor dem Öffnen und nach dem Schließen
// Die Seite läuft mit fester Uhr (21.06.2026, 12:00 Uhr Berlin, danach normal weiter): Sonnenstand, Jahreszeit und die
// simulierte Uhr des Vorführhauses sind bei jedem Lauf gleich.
// Hinweise: SwiftShader zeichnet auf der CPU – die Zahlen sind nur relativ zueinander aussagekräftig. Die CPU-Drosselung
// bremst nur den Hauptthread der Seite. Andere Browser oder Tests auf dem Rechner verfälschen die Werte; die Rechnerlast
// steht darum mit in der Ausgabe.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cpus, loadavg, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { fixedTimeInit, root, start } from "./lib.mjs";
import { bigHouse, houseStats } from "./grosshaus.mjs";

// ------------------------------------------------------------------ Aufruf

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const list = (v) => String(v).split(",").map((x) => x.trim()).filter(Boolean);
const HOUSES = list(opt("haus", "standard,demo,gross"));
const DEVICE = opt("geraet", "tablet");
const CPUS = list(opt("cpu", "1,2")).map(Number);
const SECS = Math.max(1, Number(opt("sekunden", 5)));
const STAGES = list(opt("stufen", "akku,ausgewogen,schoen"));
const SHADOWS = list(opt("schatten", "an,aus"));
const PARTS = new Set(list(opt("teile", "laden,szene,kreis,leerlauf,wetter,editor")));
const EXTRA = opt("abfrage", "");
const NAME = opt("name", "bench");
// --nachholen: vorhandene <name>.json lesen und nur die Läufe mit Fehlern (oder fehlende) neu messen und ersetzen
const REDO = args.includes("--nachholen");
if (REDO) args.splice(args.indexOf("--nachholen"), 1);
const OUT = args[0] ?? "bench-ausgabe";
// feste Uhr (Sommer, Mittag): Sonnenstand, Jahreszeit und die Uhr des Vorführhauses (PV) hängen nicht von der Tageszeit ab
const CLOCK = Date.parse("2026-06-21T12:00:00+02:00");
await mkdir(OUT, { recursive: true });

const DEVICES = {
  tablet: { name: "Tablet 1280×800, Faktor 2, Touch", width: 1280, height: 800, scale: 2, touch: true },
  desktop: { name: "Desktop 1280×800, Faktor 1, Maus", width: 1280, height: 800, scale: 1, touch: false },
};
const DEV = DEVICES[DEVICE];
if (!DEV) throw new Error(`Unbekanntes Gerät ${DEVICE} (tablet|desktop)`);
for (const h of HOUSES) if (!["standard", "demo", "gross"].includes(h)) throw new Error(`Unbekanntes Haus ${h} (standard|demo|gross)`);
for (const s of STAGES) if (!["akku", "ausgewogen", "schoen"].includes(s)) throw new Error(`Unbekannte Stufe ${s}`);
for (const s of SHADOWS) if (!["an", "aus"].includes(s)) throw new Error(`Schatten ${s}: an oder aus`);

// ------------------------------------------------------------------ kleine Helfer

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const f0 = (x) => (isNum(x) ? Math.round(x).toLocaleString("de-DE") : "–");
const f1 = (x) => (isNum(x) ? x.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "–");
const f2 = (x) => (isNum(x) ? x.toLocaleString("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : "–");
const pct = (x) => (isNum(x) ? `${Math.round(x * 100)} %` : "–");
const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const STAGE_NAME = { akku: "Akku", ausgewogen: "Ausgewogen", schoen: "Schön" };
const HOUSE_NAME = { standard: "Standardhaus", demo: "Vorführhaus", gross: "Großes Haus" };

/** Summe der CPU-Zeiten aller Kerne (für die Rechnerlast zwischen zwei Zeitpunkten). */
function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of cpus()) {
    for (const [k, v] of Object.entries(c.times)) {
      total += v;
      if (k === "idle") idle += v;
    }
  }
  return { idle, total };
}
const busySince = (a) => {
  const b = cpuTimes();
  const dt = b.total - a.total;
  return dt > 0 ? 1 - (b.idle - a.idle) / dt : null;
};

/** Andere Browser-Prozesse auf dem Rechner (vor dem eigenen Start): Anzahl und Summe %CPU. */
function foreignBrowsers() {
  try {
    const out = execFileSync("ps", ["-eo", "pcpu=,comm="], { encoding: "utf8" });
    const rows = out.split("\n").map((l) => l.trim()).filter((l) => /chrom|headless_shell/i.test(l));
    return { prozesse: rows.length, cpuProzent: Math.round(rows.reduce((s, l) => s + (Number(l.split(/\s+/)[0]) || 0), 0)) };
  } catch {
    return null;
  }
}

const stat = (vals) => {
  const v = vals.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return { n: 0, median: null, p90: null, max: null, min: null, mittel: null };
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  return { n: v.length, median: q(0.5), p90: q(0.9), max: v[v.length - 1], min: v[0], mittel: v.reduce((s, x) => s + x, 0) / v.length };
};

// ------------------------------------------------------------------ Messfühler in der Seite

/**
 * Läuft vor jedem Dokument: Long Tasks, erstes Bild mit Haus, Rekorder je Szene (Hauptansicht und Editor).
 * Der Rekorder umhüllt renderer.render und shadowMap.render; gezählt wird nur, solange rec.on gilt.
 */
function benchInit() {
  const B = (window.__bench = { marks: {}, longtasks: [], recs: {} });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) B.longtasks.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* ohne Long Tasks */
  }
  const ambient = (s) => {
    const fz = !!s._frozen;
    const flow = !fz && !!s.flow && s.flow.speed > 0 && s.layers?.flow !== false && !!s.isFloorVisible?.(s.flow.floorId);
    const wx = !fz && !!s._weather && s.layers?.weather !== false;
    return { fluss: flow, leitungen: !!s._pipesActive?.(), hausfluss: !!s._houseFlowActive?.(), wetter: wx && !!s.weather, blitz: wx && !!s._weather?.lightning && !s.weather };
  };
  /** Zähler für eine Szene (einmal je Szene). */
  B.hook = (scene, key) => {
    if (scene.__benchRec) return (B.recs[key] = scene.__benchRec);
    const r = scene.renderer;
    const info = r.info;
    const sm = r.shadowMap;
    const gl = r.getContext();
    const rec = { key, scene, on: false, finish: false, frames: [], first: null, shadowPass: false, shadowCalls: 0, lastCam: null, ev: [], dirty: null };
    scene.__benchRec = rec;
    B.recs[key] = rec;
    const smRender = sm.render;
    sm.render = function (lights, sc, cam) {
      // wie WebGLShadowMap.render: nur dann ein Schattenpass, wenn eingeschaltet, fällig und mit Licht
      const will = sm.enabled === true && (sm.autoUpdate === true || sm.needsUpdate === true) && lights.length > 0;
      const c0 = info.render.calls;
      const out = smRender.call(this, lights, sc, cam);
      if (will) {
        rec.shadowPass = true;
        rec.shadowCalls += info.render.calls - c0;
      }
      return out;
    };
    const render = r.render;
    r.render = function (sc, cam) {
      const on = rec.on;
      const auto = info.autoReset;
      let pre = null;
      if (on) {
        // three.js setzt die Zähler erst nach dem Schattenpass zurück: hier selbst, damit der Schattenpass mitzählt
        info.autoReset = false;
        info.reset();
        rec.shadowPass = false;
        rec.shadowCalls = 0;
        pre = { dirty: !!scene._dirty, anim: !!scene._animating, ...ambient(scene) };
      }
      const t0 = performance.now();
      let out;
      try {
        out = render.call(this, sc, cam);
      } finally {
        info.autoReset = auto;
      }
      const cpu = performance.now() - t0;
      let gpu = null;
      if (on && rec.finish) {
        // nur in der Testseite: warten, bis die Grafik (SwiftShader) das Bild fertig hat. Chromium behandelt gl.finish()
        // wie flush(); erst das Lesen eines Pixels wartet wirklich
        gl.finish();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rec.px ?? (rec.px = new Uint8Array(4)));
        gpu = performance.now() - t0;
      }
      if (rec.first === null && scene.floors?.size > 0 && info.render.calls > 10) rec.first = performance.now();
      if (on) {
        const m = cam.matrixWorld.elements;
        const moved = !!rec.lastCam && m.some((v, i) => Math.abs(v - rec.lastCam[i]) > 1e-7);
        rec.lastCam = Array.from(m);
        rec.frames.push({ t: t0, cpu, gpu, calls: info.render.calls, tris: info.render.triangles, punkte: info.render.points, linien: info.render.lines, shadow: rec.shadowPass, shadowCalls: rec.shadowCalls, dpr: r.getPixelRatio(), w: r.domElement.width, h: r.domElement.height, moved, ...pre });
      }
      return out;
    };
    scene.controls?.addEventListener("start", () => rec.ev.push(["start", performance.now()]));
    scene.controls?.addEventListener("end", () => rec.ev.push(["end", performance.now()]));
    return rec;
  };
  /** Aufnahme starten (Bilder leeren, Kamera als Bezug merken). */
  B.begin = (key, { finish = false } = {}) => {
    const rec = B.recs[key];
    rec.frames = [];
    rec.ev = [];
    rec.finish = finish;
    rec.lastCam = Array.from(rec.scene.camera.matrixWorld.elements);
    rec.reasons0 = rec.scene.stats?.reasons ? { ...rec.scene.stats.reasons } : null;
    rec.shadowRenders0 = rec.scene.stats?.shadowRenders ?? null;
    rec.on = true;
    rec.t0 = performance.now();
  };
  B.end = (key) => {
    const rec = B.recs[key];
    rec.on = false;
    rec.finish = false;
    const s = rec.scene.stats ?? {};
    const reasons = s.reasons && rec.reasons0 ? Object.fromEntries(Object.entries(s.reasons).map(([k, v]) => [k, v - (rec.reasons0[k] ?? 0)])) : null;
    return { t0: rec.t0, t1: performance.now(), frames: rec.frames, ev: rec.ev, reasons, shadowRenders: isFinite(s.shadowRenders) && rec.shadowRenders0 !== null ? s.shadowRenders - rec.shadowRenders0 : null };
  };
  /** Wer setzt _dirty (false → true)? Zählt Aufrufstellen, solange eingeschaltet. */
  B.traceDirty = (key, on) => {
    const rec = B.recs[key];
    const s = rec.scene;
    if (on) {
      let v = s._dirty;
      const counts = (rec.dirty = new Map());
      Object.defineProperty(s, "_dirty", {
        configurable: true,
        enumerable: true,
        get: () => v,
        set: (x) => {
          if (x && !v) {
            const where = (new Error().stack || "").split("\n").slice(2, 5).map((l) => l.trim().replace(/^at /, "").replace(/https?:\/\/[^/]+\/(?:custom_components\/haus3d\/frontend\/|tests\/browser\/)?/, "").replace(/:(\d+):\d+/, ":$1")).join(" ← ");
            counts.set(where, (counts.get(where) ?? 0) + 1);
          }
          v = x;
        },
      });
    } else {
      const v = s._dirty;
      delete s._dirty;
      s._dirty = v;
      return [...(rec.dirty ?? new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8);
    }
    return null;
  };
  /** Meshes, Materialien, Texturen der Szene (sichtbar = alle Vorfahren sichtbar). */
  B.counts = (key) => {
    const s = B.recs[key].scene;
    const c = { meshes: 0, meshesSichtbar: 0, instanziert: 0, schattenwerfer: 0, linien: 0, punkte: 0 };
    const mats = new Set();
    const matsVis = new Set();
    const visit = (o, vis) => {
      const v = vis && o.visible;
      if (o.isMesh) {
        c.meshes++;
        if (v) {
          c.meshesSichtbar++;
          if (o.isInstancedMesh) c.instanziert++;
          if (o.castShadow) c.schattenwerfer++;
        }
      } else if (o.isLine && v) c.linien++;
      else if (o.isPoints && v) c.punkte++;
      for (const m of [].concat(o.material ?? [])) {
        mats.add(m);
        if (v) matsVis.add(m);
      }
      for (const ch of o.children) visit(ch, v);
    };
    visit(s.scene, true);
    const info = s.renderer.info;
    return { ...c, materialien: mats.size, materialienSichtbar: matsVis.size, geometrien: info.memory.geometries, texturen: info.memory.textures, programme: info.programs?.length ?? null, schattenkarte: s.renderer.shadowMap.enabled ? s.sun?.shadow?.mapSize?.x ?? null : 0 };
  };
  // Hauptansicht sofort umhüllen, sobald sie da ist (für das erste Bild)
  const tick = () => {
    const s = window.panel?._scene;
    if (s?.renderer && !s.__benchRec) B.hook(s, "haupt");
    if (s?.__benchRec?.first != null) {
      B.marks.firstRender = s.__benchRec.first;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Vorführhaus wie im Backend (Admin → Häuser, „Beispielhaus“ mit Demo-Modus): Grundriss = haus-daten.json. */
function demoInit({ seed }) {
  try {
    localStorage.setItem("haus3d.house", JSON.stringify({ id: "test1", name: "Vorführhaus", live: false, demo: true }));
  } catch {
    /* ohne Speicher */
  }
  window.sandbox = { test1: { name: "Vorführhaus", revision: 1, demo: true, building: seed } };
}

// ------------------------------------------------------------------ Abläufe in der Seite

const metricsOf = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

async function heapMB(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576;
}

/** Warten auf das erste Bild mit Haus und danach `quiet` ms ohne Long Task. */
async function settle(pg, { quiet = 1500, limit = 150000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const s = await pg.evaluate(() => {
      const B = window.__bench;
      let last = 0;
      for (const [st, d] of B.longtasks) last = Math.max(last, st + d);
      return { now: performance.now(), last, first: B.marks.firstRender ?? null };
    });
    if (s.first !== null && s.now - Math.max(s.last, s.first) >= quiet) return { ...s, ruhig: true };
    if (Date.now() - t0 > limit) return { ...s, ruhig: false };
    await sleep(250);
  }
}

/** Ein ganzes Bild nach invalidate() aufnehmen (mit Schattenpass, wenn die Szene ihn zeichnet) plus Szenen-Zähler. */
async function fullFrame(pg, key) {
  return pg.evaluate(async (k) => {
    const B = window.__bench;
    const rec = B.recs[k];
    B.begin(k);
    rec.scene.invalidate();
    const t0 = performance.now();
    while (performance.now() - t0 < 15000 && !rec.frames.some((f) => f.dirty)) await new Promise((r) => requestAnimationFrame(r));
    const r = B.end(k);
    const f = r.frames.find((x) => x.dirty) ?? r.frames[0] ?? null;
    return { bild: f, ...B.counts(k) };
  }, key);
}

/** Wischen über die Zeichenfläche: Touch (CDP Input.dispatchTouchEvent) bzw. Maus, gleichmäßig über ms. */
async function swipe(pg, cdp, { touch, from, to, ms }) {
  const point = (k) => ({ x: Math.round(from.x + (to.x - from.x) * k), y: Math.round(from.y + (to.y - from.y) * k) });
  const send = (type, p) =>
    touch
      ? cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] })
      : cdp.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const [down, move, up] = touch ? ["touchStart", "touchMove", "touchEnd"] : ["mousePressed", "mouseMoved", "mouseReleased"];
  await send(down, point(0));
  const t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    await send(move, point(k));
    if (k >= 1) break;
    await sleep(16);
  }
  await send(up, point(1));
}

/**
 * Startpunkt fürs Wischen: ein Punkt, an dem wirklich die Zeichenfläche liegt (keine Beschriftung, kein Knopf) und unter
 * dem nichts Antippbares ist. Chromium liefert Fingerbewegungen im Takt der Bilder; bei wenigen Bildern/s käme die erste
 * Bewegung sonst erst nach der Gedrückthalten-Zeit an, und ein Raum unter dem Finger würde gewählt (Etage wechselt).
 */
async function swipeStart(pg) {
  return pg.evaluate(() => {
    const p = window.panel;
    const c = p._scene.renderer.domElement;
    const box = c.getBoundingClientRect();
    const cand = [];
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85]) for (const fx of [0.2, 0.15, 0.25, 0.1, 0.3, 0.05, 0.35]) cand.push([fx, fy]);
    let first = null;
    for (const [fx, fy] of cand) {
      const x = box.left + box.width * fx;
      const y = box.top + box.height * fy;
      if (p.shadowRoot.elementFromPoint(x, y) !== c) continue;
      first ??= { x, y };
      if (p._scene.pick(x, y) === null) return { x, y, w: box.width, h: box.height, frei: true };
    }
    return { ...(first ?? { x: box.left + box.width * 0.2, y: box.top + box.height * 0.5 }), w: box.width, h: box.height, frei: false };
  });
}

/** Leerlauf aufnehmen: nichts bedienen, ms lang (optional mit gl.finish je Bild). */
async function idle(pg, key, ms, { finish = false } = {}) {
  await pg.evaluate(([k, f]) => window.__bench.begin(k, { finish: f }), [key, finish]);
  await sleep(ms);
  return pg.evaluate((k) => window.__bench.end(k), key);
}

/** Bilder einer Leerlauf-Aufnahme nach Ursache. */
function idleSummary(r) {
  const secs = Math.max(0.001, (r.t1 - r.t0) / 1000);
  const fr = r.frames;
  const bg = fr.filter((f) => !f.dirty && !f.anim);
  const per = (pred) => fr.filter(pred).length / secs;
  const out = {
    sekunden: secs,
    bilderProS: fr.length / secs,
    aenderungProS: per((f) => f.dirty),
    animationProS: per((f) => !f.dirty && f.anim),
    hintergrundProS: bg.length / secs,
    flussProS: bg.filter((f) => f.fluss).length / secs,
    leitungenProS: bg.filter((f) => f.leitungen).length / secs,
    hausflussProS: bg.filter((f) => f.hausfluss).length / secs,
    wetterProS: bg.filter((f) => f.wetter).length / secs,
    blitzProS: bg.filter((f) => f.blitz).length / secs,
    sonstProS: bg.filter((f) => !f.fluss && !f.leitungen && !f.hausfluss && !f.wetter && !f.blitz).length / secs,
    schattenProS: fr.filter((f) => f.shadow).length / secs,
    renderMs: stat(fr.map((f) => f.cpu)),
    aufrufe: stat(fr.map((f) => f.calls)),
    gruende: r.reasons,
  };
  return out;
}

const gpuSummary = (r) => {
  const bg = r.frames.filter((f) => !f.dirty && !f.anim && isNum(f.gpu));
  return { bilder: bg.length, gpuMsJeBild: stat(bg.map((f) => f.gpu)), cpuMsJeBild: stat(bg.map((f) => f.cpu)) };
};

/** Kreisfahrt: Aufwärmen, dann eine Umdrehung wischen und den Auslauf abwarten. */
async function circle(pg, cdp, { touch, ms }) {
  const before = await pg.evaluate(() => ({ filter: window.panel._filter, raeume: window.panel._panels?.length ?? 0 }));
  const st0 = await swipeStart(pg);
  const dist = Math.min(st0.w * 0.6, st0.h); // eine Umdrehung = Wischweg so lang wie die Höhe der Fläche
  // aufwärmen (JIT, Zwischenspeicher, Shader), nicht gezählt
  await swipe(pg, cdp, { touch, from: st0, to: { x: st0.x + dist * 0.3, y: st0.y }, ms: 1500 });
  // Auslauf des Aufwärmens abschneiden (bei wenigen Bildern/s dauert die Dämpfung sonst viele Sekunden), bis die Kamera
  // wirklich steht: Fingerbewegungen kommen im Takt der Bilder an und können nach dem ersten Abschneiden noch nachlaufen
  await pg.evaluate(async () => {
    const sc = window.panel._scene;
    const c = sc.controls;
    const t0 = performance.now();
    let sig = "";
    let since = performance.now();
    while (performance.now() - t0 < 15000) {
      c._sphericalDelta?.set(0, 0, 0);
      c._panOffset?.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 100));
      const now = [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(6)).join(",");
      if (now !== sig) {
        sig = now;
        since = performance.now();
      } else if (performance.now() - since > 1200) break;
    }
  });
  // nach dem Aufwärmen zeigt die Ansicht anderes: Startpunkt neu suchen
  const st = await swipeStart(pg);
  const still = await pg.evaluate(() => window.panel._scene.renderer.getPixelRatio());
  const m0 = await metricsOf(cdp);
  const c0 = cpuTimes();
  const load = loadavg()[0];
  await pg.evaluate(() => window.__bench.begin("haupt"));
  await swipe(pg, cdp, { touch, from: st, to: { x: st.x + dist, y: st.y }, ms });
  const m1 = await metricsOf(cdp);
  const busy = busySince(c0);
  // Auslauf (Dämpfung) bis zum Stillstand: kein bewegtes Bild mehr seit 3 Bildabständen (mindestens 1,2 s), höchstens 90 s
  const capped = await pg.evaluate(async () => {
    const rec = window.__bench.recs.haupt;
    const t0 = performance.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 150));
      const now = performance.now();
      const fr = rec.frames;
      const gaps = fr.slice(-6).map((f, i, a) => (i ? f.t - a[i - 1].t : null)).filter((x) => x !== null).sort((a, b) => a - b);
      const gap = Math.max(1200, 3 * (gaps[gaps.length >> 1] ?? 400));
      const last = [...fr].reverse().find((f) => f.moved);
      if (now - t0 > 400 && (!last || now - last.t > gap)) return false;
      if (now - t0 > 90000) return true;
    }
  });
  const r = await pg.evaluate(() => window.__bench.end("haupt"));
  const after0 = await pg.evaluate(() => ({ filter: window.panel._filter, raeume: window.panel._panels?.length ?? 0 }));
  const startEv = r.ev.find(([n]) => n === "start")?.[1] ?? r.t0;
  const endEv = [...r.ev].reverse().find(([n]) => n === "end")?.[1] ?? null;
  const tEnd = endEv ?? r.frames.at(-1)?.t ?? r.t1;
  const during = r.frames.filter((f) => f.t >= startEv && f.t <= tEnd);
  const secs = Math.max(0.001, (tEnd - startEv) / 1000);
  const gaps = during.slice(1).map((f, i) => f.t - during[i].t);
  const after = r.frames.filter((f) => f.t > tEnd);
  const lastMoved = [...after].reverse().find((f) => f.moved);
  // erstes Bild nach dem Loslassen, ab dem alle Bilder die Ruhe-Auflösung haben
  let sharp = null;
  for (let i = after.length - 1; i >= 0 && Math.abs(after[i].dpr - still) < 1e-3; i--) sharp = after[i];
  return {
    wischweg: Math.round(dist),
    start: { x: Math.round(st.x), y: Math.round(st.y), frei: st.frei },
    ansichtGleich: before.filter === after0.filter && before.raeume === after0.raeume,
    ansicht: { vorher: before, nachher: after0 },
    bilder: during.length,
    bilderProS: during.length / secs,
    renderMs: stat(during.map((f) => f.cpu)),
    abstandMs: stat(gaps),
    aufrufe: stat(during.map((f) => f.calls)),
    schattenAufrufe: stat(during.map((f) => f.shadowCalls)),
    dreiecke: stat(during.map((f) => f.tris)),
    schattenProS: during.filter((f) => f.shadow).length / secs,
    bewegtAnteil: during.length ? during.filter((f) => f.moved).length / during.length : null,
    dprRuhend: still,
    dprBewegt: stat(during.map((f) => f.dpr)),
    flaecheBewegt: during.length ? `${during[0].w}×${during[0].h}` : null,
    hauptthread: (m1.TaskDuration - m0.TaskDuration) / Math.max(1e-6, m1.Timestamp - m0.Timestamp),
    skript: (m1.ScriptDuration - m0.ScriptDuration) / Math.max(1e-6, m1.Timestamp - m0.Timestamp),
    rechnerLast: busy,
    lastAnfang: load,
    endeErkannt: endEv !== null,
    auslauf: {
      abgebrochen: capped,
      bilder: after.length,
      bewegteBilder: after.filter((f) => f.moved).length,
      bisStillstandMs: lastMoved ? lastMoved.t + lastMoved.cpu - tEnd : 0,
      ruheAufloesungMs: sharp ? sharp.t + sharp.cpu - tEnd : null,
      schattenPaesse: after.filter((f) => f.shadow).length,
    },
    gruende: r.reasons,
  };
}

// ------------------------------------------------------------------ ein Lauf

async function oneRun(t, cfg, seeds) {
  const { house, cpu, stage, shadow } = cfg;
  let cdp = null;
  const query = `?quality=${stage}&schatten=${shadow}${house === "gross" ? "&data=/bench-gross.json" : ""}${EXTRA}`;
  const pg = await t.page(`${house}-${stage}-${shadow}-${cpu}x`, query, {
    width: DEV.width,
    height: DEV.height,
    scale: DEV.scale,
    touch: DEV.touch,
    wait: 0,
    context: { timezoneId: "Europe/Berlin", locale: "de-DE" },
    setup: async (p, ctx) => {
      cdp = await ctx.newCDPSession(p);
      await cdp.send("Performance.enable");
      await cdp.send("HeapProfiler.enable");
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      await p.addInitScript(fixedTimeInit, CLOCK);
      await p.addInitScript(benchInit);
      if (house === "demo") await p.addInitScript(demoInit, { seed: seeds.demo });
    },
  });
  const run = { haus: house, geraet: DEVICE, cpu, stufe: stage, schatten: shadow, abfrage: query, fehler: [] };
  const errors0 = t.errors.length;
  try {
    const q = await settle(pg, { limit: 90000 + 40000 * cpu });
    await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.__bench?.recs?.haupt, null, { timeout: 30000 });
    if (house === "demo") {
      run.demoAktiv = await pg.evaluate(() => !!window.panel._isDemo?.() && !!window.panel._demo);
      if (!run.demoAktiv) run.fehler.push("Vorführhaus nicht im Demo-Modus");
    }
    // „an“ bei einer Stufe ohne Schatten (Akku): für die Messung erzwingen
    run.schattenErzwungen = await pg.evaluate((want) => {
      const p = window.panel;
      if (want !== "an" || p._quality.shadows) return false;
      p._quality.shadows = true;
      p._scene.setQuality(p._quality);
      return true;
    }, shadow);
    if (run.schattenErzwungen) await sleep(1000);
    if (PARTS.has("laden")) {
      const d = await pg.evaluate(() => {
        const first = window.__bench.marks.firstRender;
        const res = performance.getEntriesByType("resource").filter((e) => /\.js(\?|$)/.test(e.name));
        const until = res.filter((e) => e.responseEnd <= first);
        return { erstesBildMs: first, moduleBisBild: until.length, bytesBisBild: until.reduce((s, e) => s + e.decodedBodySize, 0), module: res.length, bytes: res.reduce((s, e) => s + e.decodedBodySize, 0) };
      });
      run.laden = { ...d, ruhig: q.ruhig, ruheNachMs: Math.max(q.last, q.first ?? 0), heapMB: await heapMB(cdp) };
    }
    if (PARTS.has("szene")) {
      run.szene = { alle: await fullFrame(pg, "haupt") };
      const fl = await pg.evaluate(() => {
        const floors = [...window.panel._building.floors].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
        return (floors.find((f) => f.id === "eg") ?? floors.find((f) => (f.elevation ?? 0) >= 0) ?? floors[0])?.id ?? null;
      });
      if (fl) {
        await pg.evaluate((id) => window.panel._setFilter(id), fl);
        await sleep(800);
        run.szene.etage = { id: fl, ...(await fullFrame(pg, "haupt")) };
        await pg.evaluate(() => window.panel._setFilter("all"));
        await sleep(800);
      }
      run.szene.bauzeitMs = await pg.evaluate(() => {
        const p = window.panel;
        const sc = p._scene;
        const ms = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          sc.setBuilding(sc.building, { keepCamera: true });
          ms.push(performance.now() - t0);
        }
        p._lastStatesKey = null;
        p._updateStates();
        return ms.sort((a, b) => a - b)[1];
      });
      await sleep(800);
    }
    if (PARTS.has("kreis")) {
      run.kreis = await circle(pg, cdp, { touch: DEV.touch, ms: SECS * 1000 });
      if (!run.kreis.ansichtGleich) run.fehler.push(`Kreisfahrt hat die Ansicht geändert: ${JSON.stringify(run.kreis.ansicht)}`);
      if (!run.kreis.start.frei) run.fehler.push("Kein freier Startpunkt fürs Wischen gefunden");
    }
    if (PARTS.has("leerlauf")) {
      await sleep(1000);
      run.leerlauf = idleSummary(await idle(pg, "haupt", SECS * 1000));
      const g = gpuSummary(await idle(pg, "haupt", Math.min(SECS, 3) * 1000, { finish: true }));
      run.leerlauf.gpu = { ...g, gpuMsJeS: isNum(g.gpuMsJeBild.median) ? g.gpuMsJeBild.median * run.leerlauf.hintergrundProS : null };
      // eingefroren (Ruhemodus): was zeichnet dann noch, und wer stößt es an?
      await pg.evaluate(() => {
        window.panel._scene.setPerf({ frozen: true });
      });
      await sleep(800);
      await pg.evaluate(() => window.__bench.traceDirty("haupt", true));
      const fz = idleSummary(await idle(pg, "haupt", SECS * 1000));
      fz.ausloeser = await pg.evaluate(() => window.__bench.traceDirty("haupt", false));
      run.eingefroren = fz;
      await pg.evaluate(() => {
        window.panel._scene.setPerf({ frozen: false });
      });
      await sleep(500);
    }
    if (PARTS.has("wetter") && house === "standard") {
      run.wetter = {};
      for (const [name, w] of [["blitz", { kind: null, lightning: true }], ["regenBlitz", { kind: "rain", amount: 0.6, lightning: true }]]) {
        await pg.evaluate((x) => window.panel._scene.setWeather(x), w);
        await sleep(1000);
        const s = idleSummary(await idle(pg, "haupt", SECS * 1000));
        const g = gpuSummary(await idle(pg, "haupt", Math.min(SECS, 3) * 1000, { finish: true }));
        s.gpu = { ...g, gpuMsJeS: isNum(g.gpuMsJeBild.median) ? g.gpuMsJeBild.median * s.hintergrundProS : null };
        run.wetter[name] = s;
      }
      await pg.evaluate(() => window.panel._scene.setWeather(null));
      await sleep(500);
    }
    run.aufloesung = await pg.evaluate(() => {
      const r = window.panel._scene.renderer;
      return { dpr: r.getPixelRatio(), flaeche: `${r.domElement.width}×${r.domElement.height}`, geraet: window.devicePixelRatio, grob: !!window.matchMedia?.("(pointer: coarse)").matches };
    });
    if (PARTS.has("editor")) run.editor = await editorRun(pg, cdp, cpu, run.szene?.etage?.id ?? "eg");
  } catch (err) {
    run.fehler.push(String(err?.stack ?? err).slice(0, 600));
  }
  run.fehler.push(...t.errors.slice(errors0));
  return run;
}

/** Editor öffnen (Bearbeiten), Szene des Editors messen, Hauptfläche ansehen, schließen, Reste zählen. */
async function editorRun(pg, cdp, cpu, floorId) {
  const m0 = await metricsOf(cdp);
  const heap0 = await heapMB(cdp);
  const nodes0 = (await metricsOf(cdp)).Nodes;
  const r0 = await pg.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\.js(\?|$)/.test(e.name)).length);
  // Bearbeiten freischalten (PIN 0000 wie lib.mjs:unlock), danach erst die Zeit messen
  await pg.evaluate(() => {
    window.__edUnlock = window.panel._startEdit();
  });
  await pg.waitForFunction(() => !!window.panel.shadowRoot.querySelector(".pinpad") || window.panel._editMode, null, { timeout: 30000 });
  if (await pg.evaluate(() => !!window.panel.shadowRoot.querySelector(".pinpad"))) await pg.keyboard.type("0000", { delay: 60 });
  await pg.waitForFunction(() => window.panel._editMode && !window.panel.shadowRoot.querySelector(".pinpad"), null, { timeout: 30000 });
  // der Editor öffnet die gewählte Etage (in „Alle“ die unterste); hier dieselbe wie bei „eine Etage“
  await pg.evaluate((id) => window.panel._setFilter(id), floorId);
  await sleep(500);
  const t0 = await pg.evaluate(() => {
    window.__edOpen = window.panel._openEditor();
    return performance.now();
  });
  await pg.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0, null, { timeout: 60000 + 30000 * cpu });
  await pg.evaluate(() => window.__bench.hook(window.panel._editor.scene3d, "editor"));
  await pg.waitForFunction(() => window.panel._editor.scene3d.stats.renders > 0, null, { timeout: 30000 });
  const tOpen = await pg.evaluate(() => performance.now());
  await settle(pg, { quiet: 1200, limit: 60000 });
  const res = await pg.evaluate((n) => {
    const r = performance.getEntriesByType("resource").filter((e) => /\.js(\?|$)/.test(e.name)).slice(n);
    return { module: r.length, bytes: r.reduce((s, e) => s + e.decodedBodySize, 0) };
  }, r0);
  const scene = await fullFrame(pg, "editor");
  const main = await pg.evaluate(() => {
    const sc = window.panel._scene;
    const c = sc.renderer.domElement;
    const gl = sc.renderer.getContext();
    const samples = gl.getParameter(gl.SAMPLES) || 0;
    const ed = window.panel._editor.scene3d;
    return {
      hauptFlaeche: `${c.width}×${c.height}`,
      hauptPixel: c.width * c.height,
      hauptMB: (c.width * c.height * (samples > 0 ? samples * 8 + 4 : 8)) / 1e6,
      samples,
      hauptLaeuft: !!sc._running,
      editorFlaeche: `${ed.renderer.domElement.width}×${ed.renderer.domElement.height}`,
      editorDpr: ed.renderer.getPixelRatio(),
      ansicht: window.panel._editor.viewMode,
      etage: window.panel._editor.floorId,
    };
  });
  // schließen wie „Abbrechen“ ohne Änderungen
  await pg.evaluate(() => {
    const ed = window.panel._editor;
    ed.clearDraft?.();
    ed.onClose();
    window.panel._endEdit?.();
    // der Messzähler hielte sonst die Editor-Szene samt Leinwand und DOM fest und verfälschte die Reste
    const rec = window.__bench.recs.editor;
    if (rec) rec.scene = null;
    delete window.__bench.recs.editor;
  });
  await sleep(1500);
  const heap1 = await heapMB(cdp);
  const m1 = await metricsOf(cdp);
  return { oeffnenMs: tOpen - t0, nachgeladen: res, szene: scene, ...main, domVorher: nodes0, domNachher: m1.Nodes, heapVorherMB: heap0, heapNachherMB: heap1, listenerVorher: m0.JSEventListeners, listenerNachher: m1.JSEventListeners };
}

// ------------------------------------------------------------------ Ablauf

const seeds = {};
const files = {};
const info = { datum: new Date().toISOString(), uhrInDerSeite: new Date(CLOCK).toISOString(), geraet: DEV, optionen: { haus: HOUSES, cpu: CPUS, sekunden: SECS, stufen: STAGES, schatten: SHADOWS, teile: [...PARTS], abfrage: EXTRA } };
if (HOUSES.includes("demo")) seeds.demo = JSON.parse(await readFile(join(root, "custom_components/haus3d/haus-daten.json"), "utf8"));
if (HOUSES.includes("gross")) {
  const g = await bigHouse();
  files["/bench-gross.json"] = JSON.stringify(g);
  info.grossesHaus = houseStats(g);
}
info.rechner = { cpu: cpus()[0]?.model, threads: cpus().length, ramGB: Math.round(totalmem() / 2 ** 30), last: loadavg(), fremdeBrowser: foreignBrowsers() };
const t = await start(OUT, { files });
info.browser = t.browser.version();
{
  const p = await t.browser.newPage();
  await p.setContent("<canvas id=c></canvas>");
  info.webgl = await p.evaluate(() => {
    const gl = document.getElementById("c").getContext("webgl2");
    const e = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl ? (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "kein WebGL";
  });
  await p.close();
}
say(`# Haus 3D – Leistungsmessung (${new Date().toLocaleString("de-DE")})`);
say(`${DEV.name}; Chromium ${info.browser}; ${info.webgl}`);
say(`Rechner: ${info.rechner.cpu}, ${info.rechner.threads} Threads; Last ${info.rechner.last.map((x) => x.toFixed(2)).join(" / ")}; fremde Browser-Prozesse: ${info.rechner.fremdeBrowser?.prozesse ?? "?"} (${info.rechner.fremdeBrowser?.cpuProzent ?? "?"} % CPU)`);
if (info.rechner.last[0] > 1 || (info.rechner.fremdeBrowser?.prozesse ?? 0) > 0) say("Achtung: Der Rechner ist nicht ruhig – die Werte können streuen.");

const keyOf = (r) => `${r.haus}|${r.geraet}|${r.cpu}|${r.stufe}|${r.schatten}`;
const prev = REDO ? JSON.parse(await readFile(join(OUT, `${NAME}.json`), "utf8")) : null;
const runs = prev ? prev.laeufe : [];
if (prev) Object.assign(info, { ...prev, nachgeholt: [...(prev.nachgeholt ?? []), { datum: info.datum, last: info.rechner.last, laeufe: [] }], rechner: prev.rechner, datum: prev.datum });
const wanted = (cfg) => {
  if (!prev) return true;
  const old = runs.find((r) => keyOf(r) === keyOf({ haus: cfg.house, geraet: DEVICE, cpu: cfg.cpu, stufe: cfg.stage, schatten: cfg.shadow }));
  return !old || old.fehler.length > 0;
};
const t0 = Date.now();
for (const house of HOUSES) {
  if (!CPUS.some((cpu) => STAGES.some((stage) => SHADOWS.some((shadow) => wanted({ house, cpu, stage, shadow }))))) continue;
  // Aufwärmen je Haus (verworfen): der erste Start übersetzt die Shader und wäre sonst langsamer als alle weiteren
  {
    const pg = await t.page(`aufwaermen-${house}`, `?quality=${STAGES[0]}&schatten=${SHADOWS[0]}${house === "gross" ? "&data=/bench-gross.json" : ""}${EXTRA}`, {
      width: DEV.width,
      height: DEV.height,
      scale: DEV.scale,
      touch: DEV.touch,
      wait: 0,
      context: { timezoneId: "Europe/Berlin", locale: "de-DE" },
      setup: async (p) => {
        await p.addInitScript(fixedTimeInit, CLOCK);
        await p.addInitScript(benchInit);
        if (house === "demo") await p.addInitScript(demoInit, { seed: seeds.demo });
      },
    });
    await settle(pg, { limit: 120000 }).catch(() => null);
  }
  for (const cpu of CPUS) {
    for (const stage of STAGES) {
      for (const shadow of SHADOWS) {
        const cfg = { house, cpu, stage, shadow };
        if (!wanted(cfg)) continue;
        const r = await oneRun(t, cfg, seeds);
        const at = runs.findIndex((x) => keyOf(x) === keyOf(r));
        if (at >= 0) runs[at] = r;
        else runs.push(r);
        if (prev) info.nachgeholt.at(-1).laeufe.push(keyOf(r));
        const k = r.kreis;
        say(`${HOUSE_NAME[house]} · CPU ${cpu}× · ${STAGE_NAME[stage]} · Schatten ${shadow}${r.schattenErzwungen ? " (erzwungen)" : ""}: ${k ? `${f1(k.bilderProS)} Bilder/s, Abstand ${f0(k.abstandMs.median)} ms, ${f0(k.aufrufe.median)} Aufrufe` : "–"}${r.leerlauf ? `; Leerlauf ${f1(r.leerlauf.bilderProS)} Bilder/s` : ""}${r.fehler.length ? `; Fehler: ${r.fehler.length}` : ""} (${Math.round((Date.now() - t0) / 1000)} s)`);
        await writeFile(join(OUT, `${NAME}.json`), JSON.stringify({ ...info, laeufe: runs }, null, 1));
      }
    }
  }
}
if (prev) {
  info.nachgeholt.at(-1).dauerS = Math.round((Date.now() - t0) / 1000);
  info.nachgeholt.at(-1).lastEnde = loadavg();
} else {
  info.dauerS = Math.round((Date.now() - t0) / 1000);
  info.lastEnde = loadavg();
}
await writeFile(join(OUT, `${NAME}.json`), JSON.stringify({ ...info, laeufe: runs }, null, 1));
await writeFile(join(OUT, `${NAME}.md`), report(info, runs));
say(`\nRohwerte: ${join(OUT, `${NAME}.json`)}\nÜbersicht: ${join(OUT, `${NAME}.md`)}`);
for (const p of t.browser.contexts().flatMap((c) => c.pages())) await p.close();
t.results.laeufe = runs.length;
t.results.fehler = runs.reduce((s, r) => s + r.fehler.length, 0);
t.errors.length = 0; // Seitenfehler stehen je Lauf in der Ausgabe
await t.done();

// ------------------------------------------------------------------ Übersicht (Markdown)

function report(info, runs) {
  const name = (r) => `${HOUSE_NAME[r.haus]} | ${r.cpu}× | ${STAGE_NAME[r.stufe]} | ${r.schatten}${r.schattenErzwungen ? " (erzwungen)" : ""}`;
  const head = ["Haus", "CPU", "Stufe", "Schatten"];
  const out = [];
  out.push(`# Leistungsmessung Haus 3D (${new Date(info.datum).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })})`);
  out.push("");
  out.push(`- Gerät: ${info.geraet.name}; Chromium ${info.browser}; ${info.webgl}`);
  out.push(`- Rechner: ${info.rechner.cpu}, ${info.rechner.threads} Threads, ${info.rechner.ramGB} GB; Last am Anfang ${info.rechner.last.map((x) => f2(x)).join(" / ")}, am Ende ${(info.lastEnde ?? []).map((x) => f2(x)).join(" / ")}; fremde Browser-Prozesse beim Start: ${info.rechner.fremdeBrowser?.prozesse ?? "?"}`);
  out.push(`- Optionen: ${JSON.stringify(info.optionen)}; Dauer ${info.dauerS ?? "?"} s`);
  if (info.grossesHaus) out.push(`- Großes Haus: ${JSON.stringify(info.grossesHaus)}`);
  for (const n of info.nachgeholt ?? []) out.push(`- Nachgeholt am ${new Date(n.datum).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} (Last ${n.last.map((x) => f2(x)).join(" / ")}): ${n.laeufe.join(", ") || "nichts"}`);
  out.push("- SwiftShader zeichnet auf der CPU: nur Vergleiche untereinander sind aussagekräftig. „Akku“ hat ab Werk keine Schatten; „an (erzwungen)“ schaltet sie nur für die Messung ein.");
  out.push("");
  out.push("## Drehen (Kreisfahrt durch Wischen)");
  out.push("");
  out.push(table([...head, "Bilder/s", "Bildabstand ms (Median / p90 / max)", "render() ms (Median / p90)", "Aufrufe je Bild inkl. Schatten (davon Schatten)", "Schattenpässe/s", "Auflösung ruhend / bewegt", "Hauptthread", "Auslauf bis Stillstand ms (bewegte Bilder)", "Ruhe-Auflösung nach Loslassen ms", "Rechner ausgelastet"], runs.filter((r) => r.kreis).map((r) => {
    const k = r.kreis;
    return [name(r), f1(k.bilderProS), `${f0(k.abstandMs.median)} / ${f0(k.abstandMs.p90)} / ${f0(k.abstandMs.max)}`, `${f1(k.renderMs.median)} / ${f1(k.renderMs.p90)}`, `${f0(k.aufrufe.median)} (${f0(k.schattenAufrufe.median)})`, f1(k.schattenProS), `${f2(k.dprRuhend)} / ${f2(k.dprBewegt.median)}`, pct(k.hauptthread), `${k.auslauf.abgebrochen ? "≥ " : ""}${f0(k.auslauf.bisStillstandMs)} (${f0(k.auslauf.bewegteBilder)} Bilder)`, f0(k.auslauf.ruheAufloesungMs), pct(k.rechnerLast)];
  })));
  out.push("");
  out.push("## Szene (ein ganzes Bild nach invalidate(), CPU 1×)");
  out.push("");
  const sceneRows = [];
  for (const r of runs.filter((x) => x.cpu === Math.min(...CPUS))) {
    for (const [view, s] of [["Alle", r.szene?.alle], [`Etage ${r.szene?.etage?.id ?? ""}`, r.szene?.etage], [`Editor-3D ${r.editor?.etage ?? ""}`, r.editor?.szene]]) {
      if (!s?.bild) continue;
      sceneRows.push([name(r), view, view === "Alle" ? f0(r.szene?.bauzeitMs) : "–", `${f0(s.bild.calls)} (${f0(s.bild.shadowCalls)})`, f0(s.bild.tris), `${f0(s.meshesSichtbar)} / ${f0(s.meshes)}`, f0(s.schattenwerfer), `${f0(s.materialienSichtbar)} / ${f0(s.materialien)}`, f0(s.texturen), f0(s.geometrien), f0(s.programme), f0(s.schattenkarte), f1(s.bild.cpu), `${s.bild.w}×${s.bild.h}`]);
    }
  }
  out.push(table([...head, "Ansicht", "Bauzeit ms", "Aufrufe inkl. Schatten (davon Schatten)", "Dreiecke", "Meshes sichtbar / gesamt", "Schattenwerfer", "Materialien sichtbar / gesamt", "Texturen", "Geometrien", "Shader-Programme", "Schattenkarte", "render() ms", "Fläche px"], sceneRows));
  out.push("");
  out.push("## Leerlauf (nichts bedienen)");
  out.push("");
  out.push("Hintergrund-Bilder je Ursache: ein Bild ohne Änderung und ohne Tür-/Rollladen-Animation zählt bei jeder Hintergrund-Animation, die gerade läuft. GPU-Zeit: render() mit gl.finish() je Hintergrund-Bild; je Sekunde = Median × Hintergrund-Bilder/s.");
  out.push("");
  out.push(table([...head, "Bilder/s", "Änderung/s", "Animation/s", "PV-Fluss/s", "Leitungen/s", "Hausfluss/s", "Schattenpässe/s", "GPU ms je Hintergrund-Bild", "GPU ms je s", "eingefroren Bilder/s", "Auslöser eingefroren (häufigster)"], runs.filter((r) => r.leerlauf).map((r) => {
    const l = r.leerlauf;
    const z = r.eingefroren;
    const top = z?.ausloeser?.[0];
    return [name(r), f1(l.bilderProS), f1(l.aenderungProS), f1(l.animationProS), f1(l.flussProS), f1(l.leitungenProS), f1(l.hausflussProS), f1(l.schattenProS), f1(l.gpu?.gpuMsJeBild?.median), f0(l.gpu?.gpuMsJeS), f1(z?.bilderProS), top ? `${top[1]}× ${top[0].replace(/\|/g, "/")}` : "–"];
  })));
  const wx = runs.filter((r) => r.wetter);
  if (wx.length) {
    out.push("");
    out.push("## Wetter im Leerlauf (Standardhaus)");
    out.push("");
    out.push(table([...head, "Wetter", "Bilder/s", "Wetter/s", "Blitz/s", "PV-Fluss/s", "Schattenpässe/s", "GPU ms je Hintergrund-Bild", "GPU ms je s"], wx.flatMap((r) => Object.entries(r.wetter).map(([k, w]) => [name(r), k === "blitz" ? "Blitz ohne Niederschlag" : "Regen mit Blitz", f1(w.bilderProS), f1(w.wetterProS), f1(w.blitzProS), f1(w.flussProS), f1(w.schattenProS), f1(w.gpu?.gpuMsJeBild?.median), f0(w.gpu?.gpuMsJeS)]))));
  }
  out.push("");
  out.push("## Laden");
  out.push("");
  out.push(table([...head, "erstes Bild ms", "Module bis erstes Bild", "KB bis erstes Bild", "Module gesamt", "KB gesamt", "JS-Heap MB", "ruhig nach ms"], runs.filter((r) => r.laden).map((r) => [name(r), f0(r.laden.erstesBildMs), f0(r.laden.moduleBisBild), f0(r.laden.bytesBisBild / 1024), f0(r.laden.module), f0(r.laden.bytes / 1024), f1(r.laden.heapMB), f0(r.laden.ruheNachMs)])));
  out.push("");
  out.push("## Editor");
  out.push("");
  out.push(table([...head, "Öffnen ms", "nachgeladen Module / KB", "Ansicht", "Auflösung Editor", "Fläche Editor", "Hauptfläche bei offenem Editor", "Hauptfläche MB (geschätzt)", "Hauptansicht läuft", "DOM-Knoten vorher / nachher", "Heap MB vorher / nachher", "Listener vorher / nachher"], runs.filter((r) => r.editor).map((r) => {
    const e = r.editor;
    return [name(r), f0(e.oeffnenMs), `${f0(e.nachgeladen.module)} / ${f0(e.nachgeladen.bytes / 1024)}`, e.ansicht, f2(e.editorDpr), e.editorFlaeche, e.hauptFlaeche, f1(e.hauptMB), e.hauptLaeuft ? "ja" : "nein", `${f0(e.domVorher)} / ${f0(e.domNachher)}`, `${f1(e.heapVorherMB)} / ${f1(e.heapNachherMB)}`, `${f0(e.listenerVorher)} / ${f0(e.listenerNachher)}`];
  })));
  const errs = runs.filter((r) => r.fehler.length);
  if (errs.length) {
    out.push("");
    out.push("## Fehler und Meldungen");
    out.push("");
    for (const r of errs) out.push(`- ${name(r).replace(/ \| /g, " · ")}: ${r.fehler.slice(0, 5).map((e) => e.replace(/\n/g, " ").slice(0, 300)).join("; ")}`);
  }
  out.push("");
  return out.join("\n");
}
