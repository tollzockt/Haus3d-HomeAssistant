// Editor und Hauptansicht (A5): Der Editor folgt der Stufe der Hauptansicht (am Tablet „Ausgewogen“: ruhend 1,5,
// Schattenkarte 1024); die Live-Vorschau beim Ziehen zählt als Bewegung (Bewegungs-Auflösung, danach wieder scharf).
// Solange der Editor offen ist, ist die Hauptfläche geparkt: angehalten, 1×1, auch nach einer Größenänderung; der Editor
// verdeckt sie ganz (Bildschirmfoto editorstufe-offen.png). Nach dem Schließen ist sie voll groß und im ersten Bild
// gezeichnet.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pg = await t.page("editorstufe", "?quality=ausgewogen&schatten=an", {
  width: 900,
  height: 600,
  touch: true,
  scale: 2,
  setup: (p) =>
    p.addInitScript(() => {
      try {
        localStorage.setItem("haus3d.editorView", "split");
        localStorage.setItem("haus3d.moveDpr", "1");
      } catch {
        /* ohne Speicher */
      }
    }),
});
const E = (fn, arg) => pg.evaluate(fn, arg);
await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0, null, { timeout: 60000 });

/** Hauptfläche: Puffer, Anzeigegröße, Auflösung, Zustand der Schleife. */
const haupt = () =>
  E(() => {
    const sc = window.panel._scene;
    const c = sc.renderer.domElement;
    return { puffer: [c.width, c.height], anzeige: [c.clientWidth, c.clientHeight], dpr: sc.renderer.getPixelRatio(), parked: !!sc._parked, running: sc._running, dirty: !!sc._dirty, renders: sc.stats.renders };
  });
const voll = (h) => h.puffer[0] === Math.round(h.anzeige[0] * h.dpr) && h.puffer[1] === Math.round(h.anzeige[1] * h.dpr) && h.anzeige[0] > 100;

const vorher = await haupt();
t.results.vorher = vorher;
t.check(voll(vorher) && vorher.dpr === 1.5 && vorher.running && !vorher.parked, `editorstufe: Hauptfläche vor dem Editor ${JSON.stringify(vorher)}`);

// ------------------------------------------------------------------ Editor öffnen: Stufe der Hauptansicht, Hauptfläche geparkt
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0 && window.panel._editor.scene3d.stats.renders > 0, null, { timeout: 90000 });
await sleep(1500);
const stufe = await E(() => {
  const p = window.panel;
  const sc = p._editor.scene3d;
  return { haupt: p._scene.quality.name, editor: sc.quality.name, still: sc._loop.still, move: sc._loop.move, dpr: sc.renderer.getPixelRatio(), schatten: sc.renderer.shadowMap.enabled && sc.sun.castShadow, karte: sc.sun.shadow.mapSize.x, glow: sc.quality.glow };
});
t.results.stufe = stufe;
t.check(stufe.haupt === "ausgewogen" && stufe.editor === "ausgewogen" && stufe.still === 1.5 && stufe.dpr === 1.5 && stufe.move === 1, `editorstufe: Editor folgt der Stufe nicht ${JSON.stringify(stufe)}`);
t.check(stufe.schatten && stufe.karte === 1024, `editorstufe: Schattenkarte im Editor ${JSON.stringify(stufe)}`);

const offen = await haupt();
t.results.offen = offen;
t.check(offen.parked && !offen.running && offen.puffer[0] <= 2 && offen.puffer[1] <= 2, `editorstufe: Hauptfläche bei offenem Editor nicht geparkt ${JSON.stringify(offen)}`);
// Editor verdeckt die Hauptfläche ganz: an keiner Stelle ist sie das oberste Element, der Editor ist undurchsichtig
const deckt = await E(() => {
  const p = window.panel;
  const c = p._scene.renderer.domElement;
  const r = c.getBoundingClientRect();
  let frei = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const x = Math.min(r.right - 1, r.left + (r.width * i) / 10);
      const y = Math.min(r.bottom - 1, r.top + (r.height * j) / 10);
      if (p.shadowRoot.elementFromPoint(x, y) === c) frei++;
    }
  }
  const ed = p.shadowRoot.querySelector(".ed");
  const e = ed.getBoundingClientRect();
  const bg = getComputedStyle(ed).backgroundColor;
  const alpha = /rgba\(/.test(bg) ? Number(bg.split(",")[3]) : 1;
  return { frei, bg, alpha, ueber: e.left <= r.left && e.top <= r.top && e.right >= r.right && e.bottom >= r.bottom };
});
t.results.deckt = deckt;
t.check(deckt.frei === 0 && deckt.alpha === 1 && deckt.ueber, `editorstufe: Editor verdeckt die Hauptfläche nicht ganz ${JSON.stringify(deckt)}`);
await t.shot(pg, "editorstufe-offen.png");

// --- Größenänderung bei offenem Editor (der ResizeObserver ruft resize()): Hauptfläche bleibt 1×1 und zeichnet nicht,
// merkt sich aber das Neuzeichnen
await E(() => {
  const sc = window.panel._scene;
  window.__rz = 0;
  const o = sc.resize;
  sc.resize = function () {
    window.__rz++;
    return o.call(this);
  };
});
await pg.setViewportSize({ width: 800, height: 560 });
await sleep(800);
const groesse = { ...(await haupt()), resize: await E(() => window.__rz), behaelter: await E(() => [window.panel._scene.container.clientWidth, window.panel._scene.container.clientHeight]) };
await E(() => delete window.panel._scene.resize);
t.results.groesse = groesse;
t.check(groesse.resize >= 1 && groesse.behaelter[0] === 800, `editorstufe: Größenänderung kam nicht an ${JSON.stringify(groesse)}`);
t.check(groesse.parked && groesse.puffer[0] <= 2 && groesse.puffer[1] <= 2 && groesse.dirty && groesse.renders === offen.renders, `editorstufe: Größenänderung stellt die Hauptfläche wieder her ${JSON.stringify(groesse)}`);
// start() von außen (z. B. Tab wieder sichtbar) lässt die geparkte Fläche ruhen
const startGeparkt = await E(() => {
  const sc = window.panel._scene;
  sc.start();
  return { running: sc._running, puffer: sc.renderer.domElement.width };
});
t.check(!startGeparkt.running && startGeparkt.puffer <= 2, `editorstufe: start() weckt die geparkte Hauptfläche ${JSON.stringify(startGeparkt)}`);

// ------------------------------------------------------------------ Live-Vorschau: Bewegungs-Auflösung, danach scharf
await sleep(800);
const zug = await E(async () => {
  const e = window.panel._editor;
  const sc = e.scene3d;
  const r = sc.renderer;
  const log = [];
  const orig = r.render.bind(r);
  r.render = (...a) => {
    log.push({ t: performance.now(), dpr: r.getPixelRatio() });
    return orig(...a);
  };
  const m = e.floor.furniture.find((f) => f.type === "sofa") ?? e.floor.furniture[0];
  e.sel = { kind: "furniture", id: m.id };
  e._liveStart(e.sel);
  const t0 = performance.now();
  for (let i = 0; i < 14; i++) {
    m.x += 0.03;
    e._preview3d();
    await new Promise((res) => setTimeout(res, 60));
  }
  const tEnd = performance.now();
  // Ruhe abwarten (150 ms nach der letzten Bewegung hinauf; SwiftShader braucht je Bild bis zu 0,5 s)
  for (let i = 0; i < 40 && (sc._raf || sc._dirty || sc._loop.prog.mode === "moving"); i++) await new Promise((res) => setTimeout(res, 100));
  await new Promise((res) => setTimeout(res, 400));
  r.render = orig;
  e._liveEnd();
  const live = !!e._live3d;
  const im = log.filter((x) => x.t > t0 && x.t <= tEnd + 1);
  return { bilder: log.length, bewegt: im.filter((x) => x.dpr === sc._loop.move).length, im: im.length, letztes: log.at(-1)?.dpr, still: sc._loop.still, mode: sc._loop.prog.mode, live };
});
t.results.zug = zug;
t.check(zug.bewegt >= 2 && zug.letztes === zug.still && zug.mode === "still", `editorstufe: Live-Vorschau ohne Bewegungs-Auflösung bzw. danach nicht scharf ${JSON.stringify(zug)}`);

// ------------------------------------------------------------------ Schließen: voll groß, im ersten Bild gezeichnet
const zu = await E(async () => {
  const p = window.panel;
  const sc = p._scene;
  const r = sc.renderer;
  const c = r.domElement;
  const orig = r.render.bind(r);
  let erstes = null;
  r.render = (...a) => {
    const out = orig(...a);
    if (!erstes) erstes = { puffer: [c.width, c.height], daten: c.toDataURL().length };
    return out;
  };
  const n0 = sc.stats.renders;
  p._editor.onClose();
  const sofort = { parked: !!sc._parked, running: sc._running, puffer: [c.width, c.height], anzeige: [c.clientWidth, c.clientHeight], dpr: r.getPixelRatio() };
  await new Promise((res) => requestAnimationFrame(() => res()));
  const imErsten = sc.stats.renders - n0;
  await new Promise((res) => setTimeout(res, 300));
  r.render = orig;
  return { sofort, imErsten, erstes, editor: !!p._editor };
});
t.results.zu = zu;
const s = zu.sofort;
t.check(!zu.editor && !s.parked && s.running && voll(s), `editorstufe: Hauptfläche nach dem Schließen nicht voll groß ${JSON.stringify(zu)}`);
t.check(zu.imErsten >= 1 && zu.erstes && zu.erstes.puffer[0] === s.puffer[0] && zu.erstes.daten > 50000, `editorstufe: Hauptfläche nach dem Schließen nicht sofort gezeichnet ${JSON.stringify(zu)}`);
await t.shot(pg, "editorstufe-zu.png");
await t.done();
