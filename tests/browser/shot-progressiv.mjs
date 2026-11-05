// Progressive Auflösung (A2): ruhend die Auflösung der Stufe, in Bewegung die Bewegungs-Auflösung (scene-loop.js).
// Prüft je Geste (Antippen, Ziehen, Mausrad, Kamerafahrt, Begehen, Wischen am Tablet): beim Bewegen ist
// getPixelRatio() === Bewegungs-Auflösung, kein unscharfes Bild beginnt später als 300 ms nach dem Loslassen (Fahrt/Begehen:
// 150 ms nach der letzten Bewegung; SwiftShader braucht je Bild 100–500 ms, darum zählt der Beginn des Bilds), das letzte
// Bild ist scharf; Antippen und ein einzelner Sprung schalten nicht um; beim Begehen zeigt das Bild die Blickrichtung;
// umgeschaltet wird nur in _frame, je Bild höchstens ein render(), kein Bild außerhalb von _frame. Dazu: gestoppte Szene
// schaltet nicht, start() beginnt ruhend; Anfangswerte je Gerät, gespeicherter Wert haus3d.moveDpr, alter Schlüssel
// haus3d.dpr wird gelöscht; Anpassung der Bewegungs-Auflösung an langsame Bilder ohne setQuality (gespeichert, danach
// 10 s Pause); ?progressiv=aus schaltet nichts um; die Leistungsanzeige zeigt beide Werte.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZE = { width: 800, height: 500 };

/** Seite mit Faktor 2 (ausgewogen: ruhend 1,5); storage: Einträge in localStorage vor dem Laden. */
async function open(name, query, { storage = {}, touch = false } = {}) {
  const pg = await t.page(name, query, {
    ...SIZE,
    scale: 2,
    touch,
    setup: (p) =>
      p.addInitScript((st) => {
        try {
          if (sessionStorage.getItem("__gesetzt")) return; // nur beim ersten Laden
          sessionStorage.setItem("__gesetzt", "1");
          for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
        } catch {
          /* ohne Speicher */
        }
      }, storage),
  });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0, null, { timeout: 60000 });
  // Aufzeichnung: jedes render() (Zeit, Auflösung, in _frame?), jedes setPixelRatio, Bilder je _frame, start/end der Steuerung
  await pg.evaluate(() => {
    const sc = window.panel._scene;
    sc.setPerf({ frozen: true }); // keine Hintergrund-Bilder: jedes Bild geht auf die Geste zurück
    const r = sc.renderer;
    const rec = (window.__rec = { renders: [], dpr: [], ev: [], at300: [], double: 0, outside: 0, setQuality: 0 });
    let inFrame = false;
    let n = 0;
    let f0 = 0;
    const render = r.render.bind(r);
    r.render = (...a) => {
      // f0: Beginn des Bilds (_frame), hold: ms seit der letzten Eingabe bzw. Fahrt-Bewegung (zur Fehlersuche)
      const now = performance.now();
      rec.renders.push({ t: now, f0, dpr: r.getPixelRatio(), w: r.domElement.width, inFrame, mode: sc._loop.prog.mode, hold: Math.round(now - sc._loop.prog.holdAt) });
      if (inFrame) n++;
      else rec.outside++;
      return render(...a);
    };
    const set = r.setPixelRatio.bind(r);
    r.setPixelRatio = (v) => {
      rec.dpr.push({ t: performance.now(), v, inFrame });
      return set(v);
    };
    const frame = sc._frame.bind(sc);
    sc._frame = () => {
      inFrame = true;
      n = 0;
      f0 = performance.now();
      try {
        frame();
      } finally {
        inFrame = false;
        if (n > 1) rec.double++;
      }
    };
    const sq = sc.setQuality.bind(sc);
    sc.setQuality = (q) => (rec.setQuality++, sq(q));
    sc.controls.addEventListener("start", () => rec.ev.push(["start", performance.now()]));
    sc.controls.addEventListener("end", () => {
      rec.ev.push(["end", performance.now()]);
      setTimeout(() => rec.at300.push(r.getPixelRatio()), 300);
    });
  });
  return pg;
}

const clear = (pg) =>
  pg.evaluate(() => {
    const rec = window.__rec;
    for (const k of ["renders", "dpr", "ev", "at300"]) rec[k].length = 0;
    rec.double = rec.outside = rec.setQuality = 0;
    rec.t0 = performance.now();
  });

/** Warten, bis die Szene ruht: nichts vorgemerkt, ruhend, Kamera steht 600 ms. */
async function quiet(pg, max = 30000) {
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  for (;;) {
    const s = await pg.evaluate(() => {
      const sc = window.panel._scene;
      return { cam: [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(5)).join(","), busy: !!sc._dirty || !!sc._raf || sc._loop.prog.mode !== "still" || !!sc._walkTimer, r: sc.stats.renders };
    });
    const sig = `${s.cam}|${s.busy}|${s.r}`;
    if (sig !== last) {
      last = sig;
      since = Date.now();
    }
    if (!s.busy && Date.now() - since >= 600) return true;
    if (Date.now() - t0 > max) return false;
    await sleep(100);
  }
}

/** Freie Stelle auf der Zeichenfläche (nichts Antippbares darunter). */
const spotOf = (pg) =>
  pg.evaluate(() => {
    const p = window.panel;
    const c = p._scene.renderer.domElement;
    const box = c.getBoundingClientRect();
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      for (const fx of [0.2, 0.15, 0.25, 0.1, 0.3, 0.05, 0.35, 0.8, 0.85]) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        if (p.shadowRoot.elementFromPoint(x, y) === c && p._scene.pick(x, y) === null) return { x, y };
      }
    }
    return null;
  });

/** Aufzeichnung auswerten. */
async function result(pg) {
  const r = await pg.evaluate(() => {
    const sc = window.panel._scene;
    const rec = window.__rec;
    return { ...structuredClone({ renders: rec.renders, dpr: rec.dpr, ev: rec.ev, at300: rec.at300 }), double: rec.double, outside: rec.outside, setQuality: rec.setQuality, still: sc._loop.still, move: sc._loop.move, now: sc.renderer.getPixelRatio(), canvas: [sc.renderer.domElement.width, sc.renderer.domElement.clientWidth], gap: sc._loop.gap };
  });
  const t0 = r.renders[0]?.t ?? 0;
  r.kurz = r.renders.map((x) => `${Math.round(x.t - t0)}:${x.dpr}`).join(" ");
  // ausführlich (Fehlersuche): Beginn des Bilds, Beginn von render(), Auflösung, ms seit der letzten Eingabe
  r.lang = r.renders.map((x) => `${Math.round(x.f0 - t0)}/${Math.round(x.t - t0)}:${x.dpr}:${x.hold}`).join(" ");
  return r;
}

/** Gemeinsame Prüfungen jeder Geste: kein Doppelbild, nichts außerhalb von _frame, Umschalten nur in _frame, letztes Bild scharf. */
function common(name, r) {
  t.check(r.double === 0, `progressiv: ${name}: ${r.double}× mehr als ein render() in einem Bild`);
  t.check(r.outside === 0, `progressiv: ${name}: ${r.outside} Bilder außerhalb von _frame`);
  t.check(r.dpr.every((d) => d.inFrame), `progressiv: ${name}: setPixelRatio außerhalb von _frame ${JSON.stringify(r.dpr)}`);
  t.check(r.renders.length > 0 && r.renders.at(-1).dpr === r.still && r.now === r.still, `progressiv: ${name}: letztes Bild nicht scharf (${r.kurz})`);
  t.check(r.canvas[0] === Math.round(r.canvas[1] * r.still), `progressiv: ${name}: Zeichenfläche ${r.canvas[0]} statt ${r.canvas[1]}×${r.still}`);
  t.check(r.setQuality === 0, `progressiv: ${name}: setQuality während der Geste`);
}

/**
 * Unscharfe Bilder, deren Bild (_frame) später als from (+ 20 ms Spiel) beginnt: muss 0 sein. shown: Zeit der letzten
 * Fahrt-/Begehen-Bewegung – das erste Bild danach zeigt sie noch (bei langsamen Bildern auch nach from) und zählt nicht.
 */
function lateLow(r, from, shown = null) {
  const first = shown === null ? null : r.renders.find((x) => x.f0 >= shown);
  return r.renders.filter((x) => x !== first && x.f0 > from + 20 && x.dpr !== r.still).length;
}

/** Bewegt (Bewegungs-Auflösung) zwischen von und bis; Hinauf-Zeitpunkt danach. */
function phases(r, from, to) {
  const during = r.renders.filter((x) => x.t > from && x.t <= to);
  const up = r.dpr.find((d) => d.t > from && d.v === r.still);
  return { during: during.length, low: during.filter((x) => x.dpr === r.move).length, upAt: up?.t ?? null };
}

// ------------------------------------------------------------------ Desktop, gespeicherte Bewegungs-Auflösung 1
const pg = await open("progressiv", "?quality=ausgewogen", { storage: { "haus3d.moveDpr": "1", "haus3d.dpr": "1.25", "haus3d.editorView": "split" } });
const anfang = await pg.evaluate(() => {
  const sc = window.panel._scene;
  let alt = null;
  let neu = null;
  try {
    alt = localStorage.getItem("haus3d.dpr");
    neu = localStorage.getItem("haus3d.moveDpr");
  } catch {
    /* ohne Speicher */
  }
  return { still: sc._loop.still, move: sc._loop.move, coarse: sc._loop.coarse, dpr: sc.renderer.getPixelRatio(), alt, neu, qualityDpr: window.panel._quality?.dpr ?? null, refreshMs: sc._loop.refreshMs };
});
t.results.anfang = anfang;
t.check(anfang.still === 1.5 && anfang.move === 1 && anfang.dpr === 1.5 && !anfang.coarse, `progressiv: Anfangswerte ${JSON.stringify(anfang)}`);
t.check(anfang.alt === null && anfang.neu === "1" && anfang.qualityDpr === null, `progressiv: Speicher (haus3d.dpr gelöscht, haus3d.moveDpr bleibt) ${JSON.stringify(anfang)}`);
await quiet(pg);
const spot = await spotOf(pg);
t.check(!!spot, "progressiv: keine freie Stelle");

// --- Antippen ohne Bewegung: kein Umschalten, kein Bild mit Bewegungs-Auflösung
await clear(pg);
await pg.mouse.move(spot.x, spot.y);
await pg.mouse.down();
await sleep(120);
await pg.mouse.up();
await sleep(500);
await quiet(pg);
const tippen = await result(pg);
t.results.antippen = { bilder: tippen.renders.length, umschalten: tippen.dpr.length };
t.check(tippen.dpr.length === 0 && tippen.renders.every((x) => x.dpr === 1.5), `progressiv: Antippen schaltete um (${tippen.kurz}, ${JSON.stringify(tippen.dpr)})`);

// --- Ziehen mit der Maus: in Bewegung 1, nach dem Loslassen spätestens 300 ms wieder 1,5
await clear(pg);
await pg.mouse.move(spot.x, spot.y);
await pg.mouse.down();
for (let i = 1; i <= 14; i++) {
  await pg.mouse.move(spot.x + i * 14, spot.y + i);
  await sleep(40);
}
await pg.mouse.up();
t.check(await quiet(pg), "progressiv: Ziehen: Szene kam nicht zur Ruhe");
const ziehen = await result(pg);
common("Ziehen", ziehen);
{
  const s = ziehen.ev.find(([k]) => k === "start")?.[1];
  const e = ziehen.ev.findLast(([k]) => k === "end")?.[1];
  const firstMove = ziehen.dpr.find((d) => d.v === ziehen.move)?.t ?? null;
  const p = phases(ziehen, firstMove ?? s, e);
  const nachEnde = p.upAt === null ? null : p.upAt - e;
  t.results.ziehen = { bilder: ziehen.renders.length, bewegtBilder: p.during, mitBewegungsAufloesung: p.low, hinaufNachEndeMs: nachEnde && Math.round(nachEnde), bei300: ziehen.at300, spaetUnscharf: lateLow(ziehen, e + 300), bildabstandMs: Math.round(ziehen.gap), verlauf: ziehen.kurz };
  t.check(firstMove !== null && p.during >= 3 && p.low === p.during, `progressiv: Ziehen ohne Bewegungs-Auflösung ${JSON.stringify(t.results.ziehen)}`);
  t.check(nachEnde !== null && lateLow(ziehen, e + 300) === 0, `progressiv: Ziehen: unscharfes Bild später als 300 ms nach dem Loslassen ${JSON.stringify(t.results.ziehen)}`);
  t.check(ziehen.dpr.length === 2, `progressiv: Ziehen: ${ziehen.dpr.length} Umschaltungen statt 2 (Pendeln?) ${JSON.stringify(ziehen.dpr)}`);
}

// --- Mausrad: ein Rastschritt schaltet nicht um, mehrere hintereinander schon (scharf 150 ms nach dem letzten)
await clear(pg);
await pg.mouse.move(spot.x, spot.y);
await pg.mouse.wheel(0, 120);
await sleep(400);
await quiet(pg);
const rad1 = await result(pg);
t.results.mausradEinzeln = { bilder: rad1.renders.length, umschalten: rad1.dpr.length };
t.check(rad1.renders.length >= 1 && rad1.dpr.length === 0, `progressiv: ein Mausrad-Schritt schaltete um (${rad1.kurz})`);
// mehrere Schritte in Folge: in der Seite alle 50 ms ein Rad-Ereignis (wie ein echtes Rad: zwischen zwei Bildern kommt
// mindestens eins an; über Playwright käme jedes erst nach dem laufenden Bild, mit Pausen über 150 ms)
await clear(pg);
await pg.evaluate(
  ([x, y]) =>
    new Promise((done) => {
      const c = window.panel._scene.renderer.domElement;
      let i = 0;
      const timer = setInterval(() => {
        c.dispatchEvent(new WheelEvent("wheel", { deltaY: i % 2 ? -120 : 120, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        if (++i >= 8) {
          clearInterval(timer);
          done();
        }
      }, 50);
    }),
  [spot.x, spot.y],
);
await quiet(pg);
const rad = await result(pg);
common("Mausrad", rad);
t.results.mausrad = { bilder: rad.renders.length, mitBewegungsAufloesung: rad.renders.filter((x) => x.dpr === rad.move).length, umschalten: rad.dpr.length, verlauf: rad.kurz };
t.check(rad.renders.some((x) => x.dpr === rad.move) && rad.dpr.length === 2, `progressiv: Mausrad ${JSON.stringify(t.results.mausrad)}`);

// --- Kamerafahrt (eigenes Signal): ab dem zweiten bewegten Bild 1, 150 ms nach der letzten Bewegung wieder 1,5
const fahrt = async (name, fn) => {
  await clear(pg);
  const last = await pg.evaluate(fn);
  await quiet(pg);
  const r = await result(pg);
  common(name, r);
  const lastMove = await pg.evaluate(() => window.__lastMove ?? null);
  const p = phases(r, r.renders[0]?.t ?? 0, lastMove ?? Infinity);
  const up = lastMove === null || p.upAt === null ? null : p.upAt - lastMove;
  // kein unscharfes Bild darf später als 150 ms nach der letzten Fahrt-/Begehen-Bewegung beginnen (ohne eine: gar keins)
  const late = lateLow(r, (lastMove ?? -Infinity) + 150, lastMove);
  const out = { ...(late ? { lang: r.lang } : {}), bilder: r.renders.length, bewegtBilder: p.during, mitBewegungsAufloesung: p.low, hinaufNachLetzterBewegungMs: up && Math.round(up), letzteBewegungMs: lastMove === null ? null : Math.round(lastMove - (r.renders[0]?.t ?? 0)), spaetUnscharf: late, umschalten: r.dpr.length, verlauf: r.kurz, ...(last ?? {}) };
  t.results[name] = out;
  return { r, out, up, p };
};
// letzte Bewegung der Fahrt bzw. des Begehens merken (_viewMoved(true))
await pg.evaluate(() => {
  const sc = window.panel._scene;
  const vm = sc._viewMoved.bind(sc);
  sc._viewMoved = (d) => {
    if (d) window.__lastMove = performance.now();
    return vm(d);
  };
});
{
  const { r, out, up, p } = await fahrt("kamerafahrt", () => {
    window.__lastMove = null;
    window.panel._scene.viewPreset("sued", 0, { duration: 900 });
  });
  t.check(r.renders[0]?.dpr === 1.5 && p.low >= 2 && p.low >= p.during - 2, `progressiv: Kamerafahrt ohne Bewegungs-Auflösung ${JSON.stringify(out)}`);
  t.check(up !== null && out.spaetUnscharf === 0 && r.dpr.length === 2, `progressiv: Kamerafahrt: unscharfes Bild später als 150 ms nach der letzten Bewegung ${JSON.stringify(out)}`);
}
// ein einzelner Sprung (setView ohne Dauer): kein Umschalten
{
  await clear(pg);
  await pg.evaluate(() => window.panel._scene.viewPreset("iso", 0, { duration: 0 }));
  await quiet(pg);
  const r = await result(pg);
  t.results.sprung = { bilder: r.renders.length, umschalten: r.dpr.length };
  t.check(r.renders.length >= 1 && r.dpr.length === 0, `progressiv: Sprung schaltete um (${r.kurz})`);
}
// Begehen: Umsehen per Joystick, danach scharf; Verlassen (Fahrt zurück) ebenso
{
  const { r, out, up } = await fahrt("begehen", async () => {
    window.__lastMove = null;
    const sc = window.panel._scene;
    sc.enterWalk("eg");
    await new Promise((res) => setTimeout(res, 300));
    sc.walkLookInput(0.7, 0);
    await new Promise((res) => setTimeout(res, 700));
    sc.walkLookInput(0, 0);
  });
  t.check(r.renders.some((x) => x.dpr === 1) && up !== null && out.spaetUnscharf === 0, `progressiv: Begehen ${JSON.stringify(out)}`);
  // das Bild zeigt die Blickrichtung des Begehens (die Steuerung drehte die Kamera früher in jedem Bild zum Drehpunkt zurück)
  const blick = await pg.evaluate(() => {
    const sc = window.panel._scene;
    const w = sc._walk;
    const want = [-Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), -Math.cos(w.yaw) * Math.cos(w.pitch)];
    const fwd = sc.camera.getWorldDirection(sc.camera.position.clone());
    return { dot: fwd.x * want[0] + fwd.y * want[1] + fwd.z * want[2], yaw: w.yaw };
  });
  out.blick = blick;
  t.check(blick.dot > 0.999, `progressiv: Begehen: Kamera schaut nicht in Blickrichtung ${JSON.stringify(blick)}`);
  // Verlassen: Fahrt zurück; bei wenigen Bildern/s (SwiftShader) bleibt eine kurze Fahrt ganz scharf
  const ex = await fahrt("begehenEnde", () => {
    window.__lastMove = null;
    window.panel._scene.exitWalk();
  });
  t.check(ex.out.spaetUnscharf === 0 && ex.r.dpr.length <= 2, `progressiv: Begehen verlassen ${JSON.stringify(ex.out)}`);
}

// --- gestoppte Szene schaltet nicht um; start() beginnt ruhend und zeichnet sofort
{
  await clear(pg);
  await pg.mouse.move(spot.x, spot.y);
  await pg.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await pg.mouse.move(spot.x - i * 14, spot.y);
    await sleep(40);
  }
  const mitten = await pg.evaluate(() => {
    const sc = window.panel._scene;
    const r = { dpr: sc.renderer.getPixelRatio(), mode: sc._loop.prog.mode };
    sc.stop();
    window.__nStop = window.__rec.dpr.length;
    return r;
  });
  for (let i = 6; i <= 9; i++) {
    await pg.mouse.move(spot.x - i * 14, spot.y);
    await sleep(40);
  }
  await pg.mouse.up();
  await sleep(500);
  const gestoppt = await pg.evaluate(() => {
    const sc = window.panel._scene;
    const r = { dpr: sc.renderer.getPixelRatio(), umschalten: window.__rec.dpr.length - window.__nStop };
    const n0 = window.__rec.renders.length;
    sc.start();
    return { ...r, nachStart: sc.renderer.getPixelRatio(), sofortGezeichnet: window.__rec.renders.length > n0 };
  });
  await quiet(pg);
  t.results.gestoppt = { mitten, ...gestoppt };
  t.check(mitten.dpr === 1 && mitten.mode === "moving", `progressiv: Ziehen vor dem Stopp ohne Bewegungs-Auflösung ${JSON.stringify(t.results.gestoppt)}`);
  t.check(gestoppt.umschalten === 0 && gestoppt.dpr === 1 && gestoppt.nachStart === 1.5 && gestoppt.sofortGezeichnet, `progressiv: gestoppt bzw. start() ${JSON.stringify(t.results.gestoppt)}`);
}

// --- Leistungsanzeige: ruhend und bewegt
{
  const hud = await pg.evaluate(async () => {
    const p = window.panel;
    p._settings.perfHud = true;
    p._applyQuality();
    await new Promise((r) => setTimeout(r, 100));
    const text = p.shadowRoot.querySelector(".perfhud")?.textContent ?? null;
    p._settings.perfHud = false;
    p._applyQuality();
    return text;
  });
  t.results.anzeige = hud;
  t.check(/Auflösung 1\.50 ruhend · 1\.00 bewegt/.test(hud ?? ""), `progressiv: Leistungsanzeige „${hud}“`);
}

// --- Editor: eigene Szene mit derselben Schleife, demselben gespeicherten Wert und der Stufe der Hauptansicht (ruhend 1,5)
{
  await pg.evaluate(() => window.panel._openEditor());
  await pg.waitForFunction(() => window.panel._editor?.scene3d?._loop, null, { timeout: 90000 });
  const ed = await pg.evaluate(() => {
    const sc = window.panel._editor.scene3d;
    return { live: sc.live, move: sc._loop.move, still: sc._loop.still, dpr: sc.renderer.getPixelRatio() };
  });
  t.results.editor = ed;
  t.check(ed.live && ed.move === 1 && ed.still === 1.5 && ed.dpr === 1.5, `progressiv: Editor ${JSON.stringify(ed)}`);
}

// ------------------------------------------------------------------ Anpassung: Desktop ohne gespeicherten Wert
// Bewegungs-Auflösung anfangs wie ruhend (1,5); SwiftShader ist langsam (Bildabstand > 28 ms): nach 20 Proben eine Stufe
// herunter, gespeichert, ohne setQuality; danach 10 s Pause
{
  const pa = await open("progressiv-anpassung", "?quality=ausgewogen");
  const a0 = await pa.evaluate(() => ({ move: window.panel._scene._loop.move, saved: localStorage.getItem("haus3d.moveDpr") }));
  await quiet(pa);
  const sp = await spotOf(pa);
  await clear(pa);
  await pa.mouse.move(sp.x, sp.y);
  await pa.mouse.down();
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 7000 && (await pa.evaluate(() => window.panel._scene._loop.lastChange)) === -Infinity) {
    i++;
    await pa.mouse.move(sp.x + 160 * Math.sin(i / 6), sp.y + 40 * Math.cos(i / 9));
    await sleep(30);
  }
  // weiter ziehen: innerhalb von 10 s keine zweite Änderung
  for (let k = 0; k < 40; k++) {
    i++;
    await pa.mouse.move(sp.x + 160 * Math.sin(i / 6), sp.y + 40 * Math.cos(i / 9));
    await sleep(30);
  }
  await pa.mouse.up();
  await quiet(pa);
  const r = await result(pa);
  const a1 = await pa.evaluate(() => ({ move: window.panel._scene._loop.move, saved: localStorage.getItem("haus3d.moveDpr"), samples: window.panel._scene._loop.samples.length, refreshMs: window.panel._scene._loop.refreshMs }));
  const p75 = (() => {
    const fr = r.renders.filter((x) => x.mode === "moving");
    const gaps = fr.slice(1).map((x, k) => x.t - fr[k].t).sort((a, b) => a - b);
    return gaps.length ? Math.round(gaps[Math.round(0.75 * (gaps.length - 1))]) : null;
  })();
  t.results.anpassung = { vorher: a0, nachher: a1, bilderBewegt: r.renders.filter((x) => x.mode === "moving").length, bildabstandP75: p75, umschalten: r.dpr.map((d) => d.v), setQuality: r.setQuality };
  t.check(a0.move === 1.5 && a0.saved === null, `progressiv: Desktop-Anfangswert ${JSON.stringify(a0)}`);
  t.check(p75 > 28 ? a1.move === 1.25 && a1.saved === "1.25" : a1.move >= 1.5, `progressiv: Anpassung ${JSON.stringify(t.results.anpassung)}`);
  t.check(r.setQuality === 0 && r.double === 0 && r.outside === 0, `progressiv: Anpassung über setQuality bzw. Doppelbilder ${JSON.stringify(t.results.anpassung)}`);
  t.check(r.renders.at(-1)?.dpr === 1.5, `progressiv: Anpassung: letztes Bild nicht scharf ${JSON.stringify(t.results.anpassung)}`);
}

// ------------------------------------------------------------------ ?progressiv=aus: nie umschalten, nichts speichern
{
  const po = await open("progressiv-aus", "?quality=ausgewogen&progressiv=aus", { storage: { "haus3d.moveDpr": "1" } });
  await quiet(po);
  const sp = await spotOf(po);
  await clear(po);
  await po.mouse.move(sp.x, sp.y);
  await po.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await po.mouse.move(sp.x + i * 8, sp.y);
    await sleep(40);
  }
  await po.mouse.up();
  await quiet(po);
  const r = await result(po);
  const st = await po.evaluate(() => ({ move: window.panel._scene._loop.move, saved: localStorage.getItem("haus3d.moveDpr"), flags: window.panel._scene.flags.progressive }));
  t.results.aus = { ...st, bilder: r.renders.length, umschalten: r.dpr.length };
  t.check(!st.flags && st.move === 1.5 && st.saved === "1" && r.dpr.length === 0 && r.renders.every((x) => x.dpr === 1.5), `progressiv: ?progressiv=aus ${JSON.stringify(t.results.aus)}`);
}

// ------------------------------------------------------------------ Tablet (Touch, grober Zeiger): anfangs 1
{
  const pt = await open("progressiv-tablet", "?quality=ausgewogen", { touch: true });
  const a = await pt.evaluate(() => ({ coarse: window.panel._scene._loop.coarse, move: window.panel._scene._loop.move, still: window.panel._scene._loop.still }));
  await quiet(pt);
  const sp = await spotOf(pt);
  // Tippen: kein Umschalten
  await clear(pt);
  await pt.touchscreen.tap(sp.x, sp.y);
  await sleep(500);
  await quiet(pt);
  const tap = await result(pt);
  // Wischen (CDP-Touch): Bewegungs-Auflösung, danach scharf
  const cdp = await pt.context().newCDPSession(pt);
  await clear(pt);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  await touch("touchStart", sp.x, sp.y);
  for (let i = 1; i <= 16; i++) {
    await touch("touchMove", sp.x + i * 12, sp.y);
    await sleep(30);
  }
  await touch("touchEnd", sp.x + 192, sp.y);
  await quiet(pt);
  const w = await result(pt);
  common("Wischen", w);
  const e = w.ev.findLast(([k]) => k === "end")?.[1];
  const up = w.dpr.find((d) => d.t > e && d.v === 1.5)?.t;
  t.results.tablet = { ...a, tippen: { bilder: tap.renders.length, umschalten: tap.dpr.length }, wischen: { bilder: w.renders.length, mitBewegungsAufloesung: w.renders.filter((x) => x.dpr === 1).length, hinaufNachEndeMs: up && Math.round(up - e), bei300: w.at300, spaetUnscharf: lateLow(w, e + 300), verlauf: w.kurz } };
  t.check(a.coarse && a.move === 1 && a.still === 1.5, `progressiv: Tablet-Anfangswerte ${JSON.stringify(a)}`);
  t.check(tap.dpr.length === 0, `progressiv: Tippen am Tablet schaltete um ${JSON.stringify(t.results.tablet)}`);
  t.check(w.renders.filter((x) => x.dpr === 1).length >= 2 && up !== undefined && lateLow(w, e + 300) === 0, `progressiv: Wischen am Tablet ${JSON.stringify(t.results.tablet)}`);
}

await t.done();
