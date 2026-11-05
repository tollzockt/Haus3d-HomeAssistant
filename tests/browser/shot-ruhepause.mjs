// Hintergrund-Takt und Pause der Animationen: am Tablet (grober Zeiger) in „Ausgewogen“ 15 Bilder/s, auf langsamen
// Geräten (beim Drehen gemessen zu langsam, nicht schon die anfangs niedrigere Bewegungs-Auflösung) 12, Desktop wie die
// Stufe; der Energiefluss zeichnet nur, solange er im Bild ist; Blitz ohne Niederschlag tickt mit 8/s und zeichnet nur
// beim Aufleuchten und Erlöschen. Pause auf Touch-Geräten ohne Wandtablet-Modus: nach 10 min ohne Eingabe halten die
// Hintergrund-Animationen an (setPerf({frozen:true})), Zustände zeichnen weiter, Fenster bleiben offen, die nächste
// Berührung bzw. das Wiederzeigen weckt; Dauer in den Einstellungen (Wandtablet, dieses Gerät, 0 = aus);
// Wandtablet-Modus wie bisher (Ruhe nach 5 min, keine Pause).
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = await t.page("ruhepause", "?quality=ausgewogen", { touch: true, scale: 2, wait: 4000 });
const E = (fn, arg) => tab.evaluate(fn, arg);

/** Bilder (stats.renders) und Gründe in ms Millisekunden; vorher optional fn in der Seite. */
const frames = (ms, fn = null) =>
  E(async ([m, f]) => {
    if (f) await new Function(`return (async () => { ${f} })()`)();
    const s = window.panel._scene;
    const n0 = s.stats.renders;
    const r0 = { ...s.stats.reasons };
    await new Promise((r) => setTimeout(r, m));
    const g = {};
    for (const [k, v] of Object.entries(s.stats.reasons)) if (v - (r0[k] ?? 0)) g[k] = v - (r0[k] ?? 0);
    return { bilder: s.stats.renders - n0, gruende: g };
  }, [ms, fn]);
/** Warten, bis die Kamera ruht (keine Bilder durch Bewegung mehr, z. B. nach der Fahrt zum gewählten Raum). */
async function calm() {
  for (let i = 0; i < 40; i++) if (!(await frames(800)).gruende.bewegung) return true;
  return false;
}

// ------------------------------------------------------------------ Takt
const takt = await E(() => {
  const s = window.panel._scene;
  return { fps: s._ambientFps(), grob: s._loop.coarse, still: s._loop.still, move: s._loop.move, slow: s._loop.slow, flow: s.flow?.speed > 0 };
});
t.results.takt = takt;
t.check(takt.grob && takt.still === 1.5 && takt.move === 1 && !takt.slow && takt.fps === 15 && takt.flow, `ruhepause: Takt am Tablet ab Werk ${JSON.stringify(takt)}`);
const langsam = await E(() => {
  const L = window.panel._scene._loop;
  L.slow = true; // beim Drehen zu langsam gemessen (scene-loop.js:_adaptMove)
  const fps = window.panel._scene._ambientFps();
  L.slow = false;
  return fps;
});
t.check(langsam === 12, `ruhepause: Takt am langsamen Tablet ${langsam} statt 12`);
// Energiefluss läuft im Hintergrund, höchstens im Takt (SwiftShader schafft oft weniger)
const fluss = await frames(3000);
t.results.fluss = fluss;
t.check((fluss.gruende.hintergrund ?? 0) >= 2 && fluss.bilder <= 15 * 3 + 2, `ruhepause: Energiefluss ${JSON.stringify(fluss)}`);

// --- Energiefluss außerhalb des Bilds: keine Hintergrund-Bilder
const view0 = await E(() => window.panel._scene.getView());
const weg = await E(async () => {
  const s = window.panel._scene;
  const box = s.viewBox();
  const c = s.flow.line.geometry.boundingSphere ?? (s.flow.line.geometry.computeBoundingSphere(), s.flow.line.geometry.boundingSphere);
  // Ecke des Hauses, die am weitesten vom Fluss entfernt ist, von knapp darüber
  const corners = [[box.min[0], box.min[2]], [box.min[0], box.max[2]], [box.max[0], box.min[2]], [box.max[0], box.max[2]]];
  const [x, z] = corners.sort((a, b) => Math.hypot(b[0] - c.center.x, b[1] - c.center.z) - Math.hypot(a[0] - c.center.x, a[1] - c.center.z))[0];
  s.setView({ target: [x, 0, z], position: [x + 0.3, 2.5, z + 0.3] }, { duration: 0 });
  await new Promise((r) => setTimeout(r, 1500));
  return { imBild: s._inView(s.flow.line), view: s.getView() };
});
t.check(!weg.imBild, `ruhepause: Energiefluss nach dem Wegdrehen noch im Bild ${JSON.stringify(weg)}`);
const wegBilder = await frames(2000);
t.check(wegBilder.bilder === 0, `ruhepause: Energiefluss außerhalb des Bilds zeichnet ${JSON.stringify(wegBilder)}`);
await E((v) => window.panel._scene.setView(v, { duration: 0 }), view0);
await sleep(800);
const zurueck = await frames(2000);
t.check((zurueck.gruende.hintergrund ?? 0) >= 1, `ruhepause: Energiefluss nach dem Zurückdrehen still ${JSON.stringify(zurueck)}`);

// --- Blitz ohne Niederschlag: 8 Takte/s, gezeichnet nur beim Aufleuchten und Erlöschen
const blitz = await E(async () => {
  const s = window.panel._scene;
  const flow = s.flow.speed;
  s.flow.speed = 0; // nur der Blitz
  s.setWeather({ kind: null, lightning: true });
  await new Promise((r) => setTimeout(r, 600));
  let ticks = 0;
  const of = s._frame;
  s._frame = function () {
    ticks++;
    return of.call(this);
  };
  const rnd = Math.random;
  const base = s.hemi.intensity;
  Math.random = () => 1; // kein Blitz
  let n0 = s.stats.renders;
  await new Promise((r) => setTimeout(r, 2000));
  const ruhig = { bilder: s.stats.renders - n0, takte: ticks };
  Math.random = () => 0; // sofort ein Blitz, nach 0,12 s aus, beim nächsten Takt wieder
  n0 = s.stats.renders;
  ticks = 0;
  let hell = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 2000) {
    if (s.hemi.intensity > base + 1) hell++;
    await new Promise((r) => setTimeout(r, 20));
  }
  const blitze = { bilder: s.stats.renders - n0, takte: ticks, hell };
  Math.random = rnd;
  // Ruhe mitten im Blitz: im nächsten Bild wieder dunkel (SwiftShader braucht unter Last je Bild mehr als 0,5 s)
  s._flash = 0.12;
  s.hemi.intensity = base + 2.5;
  const n1 = s.stats.renders;
  s.setPerf({ frozen: true });
  for (let i = 0; i < 60 && s.stats.renders === n1; i++) await new Promise((r) => setTimeout(r, 50));
  const dunkel = Math.abs(s.hemi.intensity - base) < 1e-6 && s._flash === 0;
  s.setPerf({ frozen: false });
  s._frame = of;
  s.setWeather(null);
  s.flow.speed = flow;
  return { ruhig, blitze, dunkel };
});
t.results.blitz = blitz;
t.check(blitz.ruhig.bilder === 0 && blitz.ruhig.takte >= 4 && blitz.ruhig.takte <= 8 * 2 + 3, `ruhepause: Blitz ohne Aufleuchten ${JSON.stringify(blitz.ruhig)}`);
t.check(blitz.blitze.bilder >= 2 && blitz.blitze.hell >= 1 && blitz.blitze.takte <= 8 * 2 + 3, `ruhepause: Blitz zeichnet nicht beim Aufleuchten ${JSON.stringify(blitz.blitze)}`);
t.check(blitz.dunkel, "ruhepause: Blitz bleibt in der Ruhe hell");

// ------------------------------------------------------------------ Pause (Touch-Gerät ohne Wandtablet-Modus)
const cfg = await E(() => ({ ...window.panel._idleCfg, timer: !!window.panel._idleTimer, kiosk: window.panel.hasAttribute("kiosk") }));
t.results.cfg = cfg;
t.check(cfg.pauseMs === 600000 && cfg.idleMs === 0 && cfg.timer && !cfg.kiosk, `ruhepause: Pause am Tablet ${JSON.stringify(cfg)}`);
// vor 10 min: noch keine Pause; danach Pause, Raumfenster und Etage bleiben
const vorher = await E(() => {
  const p = window.panel;
  p._selectRoom({ floorId: "eg", roomId: "wohnzimmer" });
  p._lastInput = Date.now() - 9 * 60000;
  p._shownAt = p._lastInput;
  p._idleTick();
  return { paused: !!p._paused, frozen: p._scene._frozen, panels: (p._panels ?? []).length, filter: p._filter };
});
t.check(await calm(), "ruhepause: Kamera kommt nach der Raumwahl nicht zur Ruhe");
t.check(!vorher.paused && !vorher.frozen && vorher.panels >= 1, `ruhepause: Pause vor 10 min ${JSON.stringify(vorher)}`);
const pause = await E(() => {
  const p = window.panel;
  p._lastInput = Date.now() - 10 * 60000 - 5000;
  p._shownAt = p._lastInput;
  p._idleTick();
  return { paused: !!p._paused, idle: !!p._idle, frozen: p._scene._frozen, panels: (p._panels ?? []).length, filter: p._filter, dimmer: !!p.shadowRoot.querySelector(".dimmer") };
});
t.results.pause = pause;
t.check(pause.paused && !pause.idle && pause.frozen && pause.panels === vorher.panels && pause.filter === vorher.filter && !pause.dimmer, `ruhepause: Pause nach 10 min ${JSON.stringify(pause)}`);
// das Bild von setPerf abwarten (unter Last mehr als 0,5 s)
await tab.waitForFunction(() => !window.panel._scene._raf && !window.panel._scene._dirty, null, { timeout: 10000 }).catch(() => {});
await sleep(600);
const still = await frames(2500);
t.check(still.bilder === 0, `ruhepause: in der Pause noch ${JSON.stringify(still)}`);
// Zustände zeichnen weiter
const lampe = await frames(1500, `
  const p = window.panel;
  const h = p._realHass;
  const i = "light.kueche";
  p.hass = { ...h, states: { ...h.states, [i]: { ...h.states[i], state: h.states[i].state === "on" ? "off" : "on", last_changed: new Date().toISOString() } } };
`);
t.results.lampe = lampe;
const nochPause = await E(() => !!window.panel._paused && window.panel._scene._frozen);
t.check(lampe.bilder >= 1 && lampe.bilder <= 3 && nochPause, `ruhepause: Licht in der Pause ${JSON.stringify(lampe)} (Pause ${nochPause})`);
await t.shot(tab, "pause.png");
// die nächste Berührung weckt (freie Stelle: ohne Antippbares)
const spot = await E(() => {
  const p = window.panel;
  const r = p._scene.renderer.domElement.getBoundingClientRect();
  for (let y = r.top + r.height * 0.85; y > r.top + r.height * 0.15; y -= 25) {
    for (let x = r.left + r.width * 0.15; x < r.left + r.width * 0.6; x += 25) {
      const el = p.shadowRoot.elementFromPoint(x, y);
      if (el === p._scene.renderer.domElement && p._scene.pick(x, y) === null) return { x, y };
    }
  }
  return null;
});
t.check(!!spot, "ruhepause: keine freie Stelle zum Antippen");
if (spot) await tab.touchscreen.tap(spot.x, spot.y);
await sleep(300);
const wach = await E(() => ({ paused: !!window.panel._paused, frozen: window.panel._scene._frozen, eingabe: Date.now() - window.panel._lastInput }));
t.check(!wach.paused && !wach.frozen && wach.eingabe < 2000, `ruhepause: Berührung weckt nicht ${JSON.stringify(wach)}`);
const wieder = await frames(2000);
t.check((wieder.gruende.hintergrund ?? 0) >= 1, `ruhepause: nach dem Wecken kein Energiefluss ${JSON.stringify(wieder)}`);
// Wiederzeigen (Tab, Bildschirm an) beendet die Pause; die 10 min laufen neu
const gezeigt = await E(() => {
  const p = window.panel;
  p._lastInput = Date.now() - 30 * 60000;
  p._shownAt = p._lastInput;
  p._idleTick();
  const a = !!p._paused;
  p._idleShown();
  const b = { paused: !!p._paused, frozen: p._scene._frozen };
  p._idleTick();
  return { vorher: a, ...b, danach: !!p._paused };
});
t.check(gezeigt.vorher && !gezeigt.paused && !gezeigt.frozen && !gezeigt.danach, `ruhepause: Wiederzeigen ${JSON.stringify(gezeigt)}`);

// --- Einstellung (Admin → Wandtablet, dieses Gerät)
await unlock(tab, "admin", { cat: "kiosk" });
const feld = await E(() => {
  const i = window.panel.shadowRoot.querySelector("input[data-k=pauseMin]");
  return i ? { placeholder: i.placeholder, value: i.value, label: i.closest("label")?.textContent.trim() } : null;
});
t.results.feld = feld;
t.check(feld?.placeholder === "10" && feld.value === "" && feld.label === "Pause nach (min)", `ruhepause: Feld in den Einstellungen ${JSON.stringify(feld)}`);
const setPause = (v) =>
  E((val) => {
    const p = window.panel;
    const i = p.shadowRoot.querySelector("input[data-k=pauseMin]");
    i.value = val;
    i.dispatchEvent(new Event("change"));
    return { saved: p._settings.kiosk?.pauseMin ?? null, pauseMs: p._idleCfg.pauseMs, timer: !!p._idleTimer, stored: JSON.parse(localStorage.getItem("haus3d.settings") ?? "{}").kiosk?.pauseMin ?? null };
  }, v);
await E(() => {
  const p = window.panel;
  p._lastInput = Date.now() - 20 * 60000;
  p._shownAt = p._lastInput;
  p._idleTick();
});
const aus = await setPause("0");
const ausPause = await E(() => ({ paused: !!window.panel._paused, frozen: window.panel._scene._frozen }));
t.check(aus.saved === 0 && aus.pauseMs === 0 && !aus.timer && aus.stored === 0 && !ausPause.paused && !ausPause.frozen, `ruhepause: Pause aus ${JSON.stringify({ aus, ausPause })}`);
const drei = await setPause("3");
t.check(drei.saved === 3 && drei.pauseMs === 180000 && drei.timer, `ruhepause: Pause 3 min ${JSON.stringify(drei)}`);
const leer = await setPause("");
t.check(leer.saved === null && leer.pauseMs === 600000, `ruhepause: Pause ab Werk ${JSON.stringify(leer)}`);
await t.shot(tab, "einstellung.png");

// ------------------------------------------------------------------ Desktop und Wandtablet
const desk = await t.page("ruhepause-desktop", "?quality=ausgewogen", { wait: 3000 });
const d = await desk.evaluate(() => ({ pauseMs: window.panel._idleCfg.pauseMs, timer: !!window.panel._idleTimer, fps: window.panel._scene._ambientFps() }));
t.results.desktop = d;
t.check(d.pauseMs === 0 && !d.timer && d.fps === 24, `ruhepause: Desktop ${JSON.stringify(d)}`);
const kiosk = await t.page("ruhepause-kiosk", "?quality=ausgewogen&kiosk", { touch: true, scale: 2, wait: 3000 });
const k = await kiosk.evaluate(() => {
  const p = window.panel;
  const c = { ...p._idleCfg };
  p._lastInput = Date.now() - 4 * 60000;
  p._shownAt = p._lastInput;
  p._idleTick();
  const vorRuhe = { paused: !!p._paused, idle: !!p._idle, frozen: p._scene._frozen };
  return { pauseMs: c.pauseMs, idleMs: c.idleMs, vorRuhe };
});
t.results.kiosk = k;
t.check(k.pauseMs === 0 && k.idleMs === 300000 && !k.vorRuhe.paused && !k.vorRuhe.idle && !k.vorRuhe.frozen, `ruhepause: Wandtablet wie bisher ${JSON.stringify(k)}`);
await t.done();
