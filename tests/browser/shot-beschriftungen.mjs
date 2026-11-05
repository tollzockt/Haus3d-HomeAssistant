// Beschriftungen beim Drehen (haus3d-panel.js:_positionOverlays/_checkOcclusion, scene.js:occludedAll): Styles werden nur
// bei Änderung geschrieben; die Bühne trägt beim Drehen die Klasse .moving (Weichzeichnen der Tafeln aus, will-change
// bleibt), bis die Verdeckungsprüfung beginnt – frühestens 250 ms nach der letzten Kamerabewegung, mit einer Zielliste je
// Durchlauf und in Häppchen ≤ 4 ms im Leerlauf (ohne Leerlauf spätestens nach 150 ms, auch bei laufender
// Hintergrund-Animation im großen Haus am Tablet); eine neue Bewegung bricht sie ab. Ergebnis wie die Einzelprüfung.
import { start } from "./lib.mjs";
import { bigHouse } from "./grosshaus.mjs";

const t = await start(process.argv[2], { files: { "/beschriftungen-gross.json": JSON.stringify(await bigHouse()) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Messpunkte in der Seite: Durchläufe von occludedAll, Leerlauf-Häppchen, Style-Schreibzugriffe an Beschriftungen. */
const instrument = (pg) =>
  pg.evaluate(() => {
    const p = window.panel;
    const sc = p._scene;
    const log = (window.__occ = { created: 0, started: 0, done: 0, nexts: 0, items: 0, itemMax: 0, steps: [], starts: [], stepAt: 0, lastStart: 0, startAt: 0, doneAt: 0, lastCam: 0, active: false, writes: { transform: 0, display: 0 } });
    window.__occWrapped = null;
    const orig = sc.occludedAll.bind(sc);
    function* counted(list) {
      log.started++;
      log.items = list.length;
      log.steps = []; // Häppchen dieses Durchlaufs: Dauer und Beginn des letzten Punkts darin
      log.starts = [];
      log.startAt = performance.now();
      log.active = true;
      const it = orig(list);
      for (;;) {
        const t0 = performance.now();
        log.lastStart = t0 - log.stepAt;
        const r = it.next();
        log.itemMax = Math.max(log.itemMax, performance.now() - t0);
        log.nexts++;
        if (r.done) break;
        yield r.value;
      }
      log.active = false;
      log.done++;
      log.doneAt = performance.now();
    }
    sc.occludedAll = (list) => {
      log.created++;
      return counted(list);
    };
    window.__occWrapped = sc.occludedAll;
    const cam = sc.onCameraChange;
    sc.onCameraChange = () => {
      log.lastCam = performance.now();
      cam();
    };
    // Häppchen: Leerlauf-Aufrufe, in denen die Prüfung weiterkam
    const ric = window.requestIdleCallback.bind(window);
    window.requestIdleCallback = (fn, o) =>
      ric((d) => {
        const n0 = log.nexts;
        const t0 = (log.stepAt = performance.now());
        fn(d);
        if (log.nexts === n0) return;
        log.steps.push(performance.now() - t0);
        log.starts.push(log.lastStart);
      }, o);
    // Schreibzugriffe auf transform/display der Beschriftungen zählen: el.style je Beschriftung durch einen Proxy ersetzen
    // (die Eigenschaften von CSSStyleDeclaration liegen in Chromium nicht als Accessor am Prototyp)
    const hook = (el) => {
      if (el.__occStyle) return;
      const real = el.style;
      const proxy = new Proxy(real, {
        get(target, prop) {
          const v = target[prop];
          return typeof v === "function" ? v.bind(target) : v;
        },
        set(target, prop, v) {
          if (prop in log.writes) log.writes[prop]++;
          target[prop] = v;
          return true;
        },
      });
      Object.defineProperty(el, "style", { configurable: true, get: () => proxy });
      el.__occStyle = proxy;
    };
    window.__occRefresh = () => {
      for (const ov of p._overlays.values()) hook(ov.el);
    };
    window.__occRefresh();
    const first = p._overlays.values().next().value?.el;
    const hooked = first && first.style === first.__occStyle && first.style.display === first.style.getPropertyValue("display") ? 1 : 0;
    // Probe-Tafel an der Bühne (nicht in den Beschriftungen, die neu aufgebaut werden können): backdrop-filter je nach .moving
    const h = document.createElement("div");
    h.className = "holo";
    h.innerHTML = `<div class="holocard">Probe</div>`;
    p._els.stage.appendChild(h);
    window.__occCard = h.firstElementChild;
    return { overlays: p._overlays.size, hooked };
  });

/** Warten, bis die Verdeckungsprüfung nach der letzten Bewegung fertig ist. */
const settle = (pg, ms = 30000) => pg.waitForFunction(() => window.__occ.done > 0 && !window.__occ.active && window.__occ.doneAt > window.__occ.lastCam && performance.now() - window.__occ.doneAt > 50, null, { timeout: ms });

/** Kamerafahrt (Voreinstellung mit Dauer) und dabei je Bild .moving und backdrop-filter der Probe-Tafel festhalten. */
const drive = (pg, preset, duration = 700) =>
  pg.evaluate(
    async ([k, d]) => {
      const p = window.panel;
      const stage = p._els.stage;
      const seen = { frames: 0, moving: 0, blurWhileMoving: 0, startedWhileMoving: 0 };
      window.__occRefresh();
      const w0 = { ...window.__occ.writes };
      const s0 = window.__occ.started;
      p._scene.viewPreset(k, 0, { duration: d });
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          seen.frames++;
          if (stage.classList.contains("moving")) {
            seen.moving++;
            if (getComputedStyle(window.__occCard).backdropFilter !== "none") seen.blurWhileMoving++;
            if (window.__occ.started > s0 && window.__occ.startAt > window.__occ.lastCam) seen.startedWhileMoving++;
          }
          if (performance.now() - t0 < d + 100) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      seen.writes = { transform: window.__occ.writes.transform - w0.transform, display: window.__occ.writes.display - w0.display };
      return seen;
    },
    [preset, duration],
  );

/** Nach der Prüfung: Zustand der Klassen gegen die Einzelprüfung (scene.occluded). */
const verify = (pg) =>
  pg.evaluate(() => {
    const p = window.panel;
    const sc = p._scene;
    const log = window.__occ;
    let shown = 0;
    let behind = 0;
    let wrong = 0;
    delete sc.occludedAll; // Einzelprüfung (scene.occluded) ohne Zähler
    for (const ov of p._overlays.values()) {
      if (ov.el.style.display === "none") continue;
      shown++;
      const want = sc.occluded(ov.position, ov.floorId);
      const has = ov.el.classList.contains("hidden-behind");
      if (has) behind++;
      if (want !== has) wrong++;
    }
    sc.occludedAll = window.__occWrapped;
    return {
      shown,
      behind,
      wrong,
      items: log.items,
      delay: Math.round(log.startAt - log.lastCam),
      moving: p._els.stage.classList.contains("moving"),
      blur: getComputedStyle(window.__occCard).backdropFilter,
      willChange: getComputedStyle(window.__occCard).willChange,
      steps: log.steps.length,
      stepMax: Math.round(Math.max(0, ...log.steps) * 100) / 100,
      startMax: Math.round(Math.max(0, ...log.starts) * 100) / 100,
      itemMax: Math.round(log.itemMax * 100) / 100,
    };
  });

async function run(name, query) {
  const pg = await t.page(name, `?quality=ausgewogen${query}`, { width: 1280, height: 800 });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0 && !window.panel._loading, null, { timeout: 120000 });
  await pg.evaluate(() => window.panel._scene.setPerf({ frozen: true }));
  await sleep(1500);
  const info = await instrument(pg);
  const out = { overlays: info.overlays, hooked: info.hooked };
  // Fahrt nach „oben“ (Etagen verdecken einander von oben): während der Fahrt .moving, keine Prüfung
  out.fahrt = await drive(pg, "oben");
  await settle(pg);
  out.oben = await verify(pg);
  // Ruhig: noch einmal positionieren schreibt keine Styles, eine zweite Prüfung ändert keine Klassen
  out.ruhig = await pg.evaluate(async () => {
    const p = window.panel;
    window.__occRefresh();
    const w0 = { ...window.__occ.writes };
    const obs = [];
    const mo = new MutationObserver((list) => obs.push(...list));
    mo.observe(p._els.overlay, { attributes: true, subtree: true, attributeFilter: ["class"] });
    p._positionOverlays();
    p._positionOverlays();
    const d0 = window.__occ.done;
    await new Promise((r) => {
      const wait = () => (window.__occ.done > d0 && !window.__occ.active ? r() : setTimeout(wait, 50));
      wait();
    });
    await new Promise((r) => setTimeout(r, 50));
    mo.disconnect();
    return { transform: window.__occ.writes.transform - w0.transform, display: window.__occ.writes.display - w0.display, classes: obs.length, moving: p._els.stage.classList.contains("moving") };
  });
  // Abbruch: eine neue Bewegung während der Prüfung stoppt sie, die nächste läuft danach ganz
  out.abbruch = await pg.evaluate(async () => {
    const p = window.panel;
    const log = window.__occ;
    const c0 = log.created;
    const s0 = log.started;
    const d0 = log.done;
    p._checkOcclusion();
    p._positionOverlays({ moving: true }); // gleiche Aufgabe: das erste Häppchen kommt nicht mehr dran
    const moving = p._els.stage.classList.contains("moving");
    await new Promise((r) => {
      const wait = () => (log.done > d0 && !log.active ? r() : setTimeout(wait, 50));
      wait();
    });
    return { created: log.created - c0, started: log.started - s0, done: log.done - d0, moving, after: p._els.stage.classList.contains("moving") };
  });
  // Rückfahrt schräg
  out.rueck = await drive(pg, "iso");
  await settle(pg);
  out.iso = await verify(pg);
  await pg.close();
  return out;
}

/**
 * Großes Haus am Tablet (Touch, Faktor 2) mit laufender Hintergrund-Animation, die den Takt nicht schafft (dann gibt es
 * kaum Leerlauf): nach einem Ansichtswechsel stimmt die Verdeckung binnen 4 s mit der Einzelprüfung. Früher kam jedes
 * Häppchen erst nach der Frist von 4 s und prüfte dann nur einen Punkt (timeRemaining() ist danach 0).
 */
async function animated() {
  const pg = await t.page("beschriftungen-animiert", "?quality=ausgewogen&data=/beschriftungen-gross.json", { width: 1280, height: 800, touch: true, scale: 2 });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0 && !window.panel._loading, null, { timeout: 120000 });
  await sleep(1500);
  const out = [];
  for (const [from, to] of [["oben", "sued"], ["sued", "oben"]]) {
    out.push(
      await pg.evaluate(
        async ([a, b]) => {
          const p = window.panel;
          const sc = p._scene;
          const wrong = () => {
            let n = 0;
            let shown = 0;
            for (const ov of p._overlays.values()) {
              if (ov.shown === false) continue;
              shown++;
              if (sc.occluded(ov.position, ov.floorId) !== ov.el.classList.contains("hidden-behind")) n++;
            }
            return { shown, wrong: n };
          };
          sc.setPerf({ frozen: true });
          delete sc._houseFlowActive;
          delete sc._stepHouseFlow;
          sc.viewPreset(a, 0, { duration: 0 });
          await new Promise((r) => setTimeout(r, 2500));
          const vorher = wrong();
          // Hintergrund-Animation dauernd (gleicher Weg in _frame wie PV-Fluss, Leitungen und Regen)
          sc._houseFlowActive = () => true;
          sc._stepHouseFlow = () => {};
          sc.setPerf({ frozen: false });
          await new Promise((r) => setTimeout(r, 1500));
          const r0 = sc.stats.renders;
          sc.viewPreset(b, 0, { duration: 400 });
          const t0 = performance.now();
          let w = wrong();
          await new Promise((r) => setTimeout(r, 900));
          while ((w = wrong()).wrong > 0 && performance.now() - t0 < 4400) await new Promise((r) => setTimeout(r, 100));
          const bilder = sc.stats.renders - r0;
          const ms = Math.round(performance.now() - t0);
          delete sc._houseFlowActive;
          delete sc._stepHouseFlow;
          sc.setPerf({ frozen: true });
          return { von: a, nach: b, vorher, ...w, ms, bilderJeS: +((bilder * 1000) / ms).toFixed(1) };
        },
        [from, to],
      ),
    );
  }
  await pg.close();
  return out;
}

const std = await run("beschriftungen", "");
const big = await run("beschriftungen-gross", "&data=/beschriftungen-gross.json");
const anim = await animated();
t.results.standard = std;
t.results.gross = big;
t.results.animiert = anim;
for (const r of anim) t.check(r.shown > 30 && r.vorher.wrong === 0 && r.wrong === 0, `großes Haus mit Hintergrund-Animation, ${r.von} → ${r.nach}: Verdeckung nach ${r.ms} ms noch falsch ${JSON.stringify(r)}`);

for (const [name, r] of [["standard", std], ["gross", big]]) {
  for (const k of ["fahrt", "rueck"]) {
    const f = r[k];
    t.check(f.moving > 0 && f.blurWhileMoving === 0 && f.startedWhileMoving === 0, `${name} ${k}: .moving/backdrop-filter/Prüfung während der Fahrt ${JSON.stringify(f)}`);
    t.check(f.writes.transform > 0, `${name} ${k}: keine Lage geschrieben ${JSON.stringify(f.writes)}`);
  }
  for (const k of ["oben", "iso"]) {
    const v = r[k];
    t.check(v.shown > 3 && v.wrong === 0 && v.items === v.shown, `${name} ${k}: Verdeckung weicht ab ${JSON.stringify(v)}`);
    t.check(v.delay >= 249, `${name} ${k}: Prüfung schon ${v.delay} ms nach der Bewegung`);
    t.check(!v.moving && v.blur !== "none" && /blur/.test(v.blur) && v.willChange === "auto", `${name} ${k}: Ruhe ${JSON.stringify(v)}`);
    // Häppchen: ≤ 4 ms plus höchstens ein Punkt, d. h. nach 4 ms beginnt kein Punkt mehr. Gemessen wird der Beginn des
    // letzten Punkts je Häppchen, nicht die Dauer: Die enthält unter Last auch Zeit, in der der Rechner den Hauptthread
    // anderen Prozessen gibt (kompletter Lauf mit --jobs 2: Häppchen 37,2 ms bei höchstens 26,3 ms je Punkt)
    t.check(v.startMax <= 4 + 0.5, `${name} ${k}: Punkt ${v.startMax} ms nach Beginn des Häppchens begonnen (Dauer bis ${v.stepMax} ms, Punkt ≤ ${v.itemMax} ms)`);
  }
  t.check(r.ruhig.transform === 0 && r.ruhig.display === 0 && r.ruhig.classes === 0 && !r.ruhig.moving, `${name}: ruhig geschrieben ${JSON.stringify(r.ruhig)}`);
  t.check(r.hooked === 1, `${name}: Style-Zähler nicht eingehängt (${r.hooked})`);
  t.check(r.abbruch.created === 2 && r.abbruch.started === 1 && r.abbruch.done === 1 && r.abbruch.moving && !r.abbruch.after, `${name}: Abbruch ${JSON.stringify(r.abbruch)}`);
}
t.check(std.oben.behind > 0 || std.iso.behind > 0, `keine Beschriftung verdeckt: ${JSON.stringify([std.oben, std.iso])}`);
t.check(big.overlays > 30 && (big.oben.steps > 1 || big.iso.steps > 1), `großes Haus: Prüfung nicht in Häppchen ${JSON.stringify([big.overlays, big.oben, big.iso])}`);
await t.done();
