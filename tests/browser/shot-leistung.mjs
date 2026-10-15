// Leistungs-Korrekturen: Beschriftungen lesen die Maße der Zeichenfläche einmal je Durchlauf (kein erzwungenes Layout
// je Beschriftung), resize() zeichnet genau ein Bild und lässt kein zweites folgen, ohne dass die Fläche leer bleibt.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("leistung", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);
await pg.waitForFunction(() => window.panel?._building && window.panel._scene && window.panel._overlays.size > 3, null, { timeout: 30000 });

// --- Overlay-Maße: höchstens je einmal clientWidth/clientHeight für alle Beschriftungen
const lesen = await E(() => {
  const p = window.panel;
  const box = p._scene.container;
  let w = 0;
  let h = 0;
  Object.defineProperty(box, "clientWidth", { configurable: true, get: () => (w++, 1280) });
  Object.defineProperty(box, "clientHeight", { configurable: true, get: () => (h++, 800) });
  p._positionOverlays();
  delete box.clientWidth;
  delete box.clientHeight;
  // gleiche Ergebnisse wie die Einzelabfrage (project(v) ohne Maße)
  const ov = [...p._overlays.values()].find((o) => o.el.style.display !== "none");
  const q = p._scene.project(ov.position, { w: 1280, h: 800 });
  const [x, y] = ov.el.style.transform.match(/-?[0-9.]+(?=px)/g).map(Number);
  return { w, h, anzahl: p._overlays.size, x, y, erwartetX: q.x, erwartetY: q.y };
});
t.check(lesen.anzahl > 3, `leistung: zu wenige Beschriftungen zum Prüfen (${lesen.anzahl})`);
t.check(lesen.w <= 1 && lesen.h <= 1, `leistung: Maße je Beschriftung gelesen (clientWidth ${lesen.w}×, clientHeight ${lesen.h}× bei ${lesen.anzahl} Beschriftungen)`);
t.check(Math.abs(lesen.x - lesen.erwartetX) < 0.01 && Math.abs(lesen.y - lesen.erwartetY) < 0.01, `leistung: Beschriftung falsch positioniert (${lesen.x}, ${lesen.y} statt ${lesen.erwartetX}, ${lesen.erwartetY})`);
t.check(await E(() => !!window.panel._scene.project(window.panel._scene.root.position)), "leistung: project(v) ohne Maße liefert nichts");
t.results.overlays = lesen;

// --- resize(): ein Bild, danach kein zweites; Fläche nicht leer
const rz = await E(() => {
  const sc = window.panel._scene;
  let calls = 0;
  const orig = sc.renderer.render.bind(sc.renderer);
  sc.renderer.render = (...a) => (calls++, orig(...a));
  const out = {};
  // laufende Ansicht: ein Bild sofort, kein weiteres vorgemerkt
  sc.invalidate();
  sc._camDirty = false;
  const box = sc.container;
  box.style.width = "1000px";
  sc.resize();
  out.laufend = { bilder: calls, dirty: sc._dirty, camDirty: sc._camDirty, ausgabeLeer: sc.renderer.domElement.toDataURL().length < 50000 };
  // ruhende Ansicht (Editor offen): nichts zeichnen, aber beim nächsten Start nachholen
  calls = 0;
  sc.stop();
  box.style.width = "";
  sc.resize();
  out.ruhend = { bilder: calls, dirty: sc._dirty };
  sc.start();
  sc.renderer.render = orig;
  return out;
});
t.check(rz.laufend.bilder === 1, `leistung: resize() zeichnete ${rz.laufend.bilder} Bilder statt einem`);
t.check(rz.laufend.dirty === false, "leistung: resize() lässt ein zweites Bild vormerken");
t.check(rz.laufend.camDirty === true, "leistung: Beschriftungen werden nach resize() nicht neu positioniert");
t.check(!rz.laufend.ausgabeLeer, "leistung: Zeichenfläche nach resize() leer (Flackern)");
t.check(rz.ruhend.bilder === 0 && rz.ruhend.dirty === true, `leistung: ruhende Ansicht zeichnete (${rz.ruhend.bilder}) bzw. merkte nichts vor (dirty ${rz.ruhend.dirty})`);
t.results.resize = rz;

// --- Größenänderung im laufenden Betrieb (ResizeObserver): am Ende stimmen Fläche und Beschriftungen, Bilder bleiben wenige
await E(() => {
  window.__n = 0;
  const sc = window.panel._scene;
  sc._frozen = true; // keine Hintergrund-Animationen: jedes Bild geht auf die Größenänderung zurück
  const orig = sc.renderer.render.bind(sc.renderer);
  sc.renderer.render = (...a) => (window.__n++, orig(...a));
  window.__orig = orig;
});
await pg.waitForTimeout(800);
const leerlauf = await E(() => window.__n);
await E(() => (window.__n = 0));
await pg.setViewportSize({ width: 900, height: 700 });
await pg.waitForTimeout(800);
const ro = await E(() => {
  const sc = window.panel._scene;
  const c = sc.renderer.domElement;
  const out = { bilder: window.__n, canvas: [c.clientWidth, c.clientHeight], bufferOk: c.width === Math.round(c.clientWidth * sc.renderer.getPixelRatio()) };
  sc.renderer.render = window.__orig;
  return out;
});
t.check(ro.bufferOk, `leistung: Zeichenfläche nach Größenänderung nicht angepasst (${JSON.stringify(ro)})`);
ro.leerlauf = leerlauf;
t.check(leerlauf === 0, `leistung: Bilder im Leerlauf trotz eingefrorener Hintergrund-Animation (${leerlauf})`);
t.check(ro.bilder === 1,`leistung: eine Größenänderung ergab ${ro.bilder} Bilder statt einem`);
t.results.groessenaenderung = ro;
await t.done();
