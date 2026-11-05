// Leistungs-Korrekturen: Beschriftungen lesen die Maße der Zeichenfläche einmal je Durchlauf (kein erzwungenes Layout
// je Beschriftung), resize() zeichnet genau ein Bild und lässt kein zweites folgen, ohne dass die Fläche leer bleibt;
// Mess-Schalter aus der Adresse kommen in Hauptansicht (live: false) und Editor (live) an.
// Zähler (A0): Aufrufe inklusive Schattenpass, Schattenpässe und Gründe je Bild, Leistungsanzeige. Schattenkarte nur
// nach Änderungen (A1): kein Schattenpass beim Drehen, bei der Kamerafahrt, beim Begehen, bei Hintergrund-Bildern, beim
// Schalten einer Lampe und bei einem Sensorwert; mindestens einer bei Etagenfilter hin und zurück, Ebene, Dach (auch
// Möbel innen bei Draufsicht), Tür (bis zum Ende), Vorhang über onState, setSun, geladenem eigenen Modell, Stufenwechsel,
// Kontextverlust und Live-Vorschau im Editor; mit ?schattenkarte=immer in jedem Bild.
// Zustands-Fingerabdruck (A4): Sensorwert und Leistungssensoren zeichnen kein Bild, eine Lampe genau eines ohne
// Schattenpass, ein Vorhang über onState genau eines mit Schattenpass; Leitungsfluss zeichnet nur bei neuer Punktzahl,
// „aktiv“ oder Leitungsfarbe (ohne Schattenpass), reines Tempo gar nicht.
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

// --- Mess-Schalter (perf.js:perfFlags) und live: ohne Angabe alles an; mit Angabe in beiden Szenen (Hauptansicht live: false,
// Editor live)
const an = { shadowAlways: false, progressive: true, merge: true, instances: true };
const aus = { shadowAlways: true, progressive: false, merge: false, instances: false };
const vorgabe = await E(() => ({ live: window.panel._scene.live, ...window.panel._scene.flags }));
t.check(vorgabe.live === false && Object.entries(an).every(([k, v]) => vorgabe[k] === v), `leistung: Vorgabe der Mess-Schalter ${JSON.stringify(vorgabe)}`);
const ps = await t.page("leistung-schalter", "?schattenkarte=immer&progressiv=aus&zusammenfuehren=aus&instanzen=aus", { width: 1280, height: 800 });
await ps.waitForFunction(() => window.panel?._building && window.panel._scene, null, { timeout: 30000 });
await ps.evaluate(() => window.panel._openEditor());
await ps.waitForFunction(() => window.panel._editor?.scene3d, null, { timeout: 60000 });
const schalter = await ps.evaluate(() => {
  const p = window.panel;
  return { haupt: { live: p._scene.live, ...p._scene.flags }, editor: { live: p._editor.scene3d.live, ...p._editor.scene3d.flags } };
});
t.check(schalter.haupt.live === false && schalter.editor.live === true, `leistung: live je Szene ${JSON.stringify(schalter)}`);
t.check(Object.entries(aus).every(([k, v]) => schalter.haupt[k] === v && schalter.editor[k] === v), `leistung: Mess-Schalter nicht in beiden Szenen ${JSON.stringify(schalter)}`);
t.results.schalter = { vorgabe, ...schalter };

// ------------------------------------------------------------------ Schattenpässe (A0, A1)
const sp = await t.page("leistung-schatten", "?quality=ausgewogen&schatten=an", {
  width: 900,
  height: 600,
  setup: (p) =>
    p.addInitScript(() => {
      try {
        localStorage.setItem("haus3d.editorView", "split");
      } catch {
        /* ohne Speicher */
      }
    }),
});
const S = (fn, arg) => sp.evaluate(fn, arg);
await sp.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0, null, { timeout: 60000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
t.results.schatten = {};
/** shadowMap.render umhüllen: gezählt wird nur, wenn three.js wirklich einen Schattenpass macht (an, fällig, Licht mit Schatten). */
const hook = (key) =>
  S((k) => {
    const p = window.panel;
    const sc = k === "editor" ? p._editor.scene3d : p._scene;
    const sm = sc.renderer.shadowMap;
    if (sc.__sp?.sm === sm) return sm.enabled;
    const rec = (sc.__sp = { sm, passes: 0, at: [], probe: null });
    const orig = sm.render;
    sm.render = function (lights, ...rest) {
      if (sm.enabled === true && (sm.autoUpdate === true || sm.needsUpdate === true) && lights.length > 0) {
        rec.passes++;
        if (rec.probe) rec.at.push(rec.probe());
      }
      return orig.call(this, lights, ...rest);
    };
    return sm.enabled;
  }, key);
/** Warten, bis die Szene ruht: nichts vorgemerkt, keine Animation, Kamera steht settle ms lang. */
async function quiet(key, { settle = 700, max = 40000 } = {}) {
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  for (;;) {
    const s = await S((k) => {
      const p = window.panel;
      const sc = k === "editor" ? p._editor?.scene3d : p._scene;
      return { cam: [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(5)).join(","), busy: !!sc._dirty || !!sc._animating || !!sc._raf || !!sc._walkTimer, r: sc.stats.renders };
    }, key);
    const sig = `${s.cam}|${s.busy}|${s.r}`;
    if (sig !== last) {
      last = sig;
      since = Date.now();
    }
    if (!s.busy && Date.now() - since >= settle) return true;
    if (Date.now() - t0 > max) return false;
    await sleep(100);
  }
}
/** Aktion ausführen, Ruhe abwarten; Schattenpässe (gezählt und stats.shadowRenders), Bilder und Gründe. */
async function measure(key, name, action, opts) {
  await S((k) => {
    const p = window.panel;
    const sc = k === "editor" ? p._editor.scene3d : p._scene;
    Object.assign(sc.__sp, { passes: 0, at: [], probe: null, r0: sc.stats.renders, s0: sc.stats.shadowRenders, g0: { ...sc.stats.reasons } });
  }, key);
  await action();
  const ruhig = await quiet(key, opts);
  const r = await S((k) => {
    const p = window.panel;
    const sc = k === "editor" ? p._editor.scene3d : p._scene;
    const g = Object.fromEntries(Object.entries(sc.stats.reasons).map(([x, v]) => [x, v - (sc.__sp.g0[x] ?? 0)]).filter(([, v]) => v));
    return { passes: sc.__sp.passes, statsSchatten: sc.stats.shadowRenders - sc.__sp.s0, bilder: sc.stats.renders - sc.__sp.r0, gruende: g, at: sc.__sp.at.length ? sc.__sp.at : undefined };
  }, key);
  r.ruhig = ruhig;
  t.results.schatten[name] = r;
  t.check(ruhig, `leistung: ${name}: Szene kam nicht zur Ruhe`);
  t.check(r.statsSchatten === r.passes, `leistung: ${name}: stats.shadowRenders zählte ${r.statsSchatten}, three.js machte ${r.passes} Schattenpässe`);
  return r;
}
const none = (r, name) => t.check(r.passes === 0, `leistung: ${name}: ${r.passes} Schattenpässe statt keinem (${JSON.stringify(r)})`);
const some = (r, name) => t.check(r.passes >= 1, `leistung: ${name}: kein Schattenpass (${JSON.stringify(r)})`);
const setState = (id, patch) =>
  S(([i, pt]) => {
    const p = window.panel;
    const h = p._realHass;
    const old = h.states[i] ?? { entity_id: i, attributes: {} };
    const now = new Date().toISOString();
    p.hass = { ...h, states: { ...h.states, [i]: { ...old, ...pt, attributes: { ...old.attributes, ...(pt.attributes ?? {}) }, last_changed: now, last_updated: now } } };
  }, [id, patch]);

t.check(await hook("haupt"), "leistung: Schatten der Hauptansicht aus (?schatten=an)");
const grund = await S(() => {
  const sc = window.panel._scene;
  sc.setPerf({ frozen: true }); // Hintergrund-Animationen aus: jedes Bild geht auf die Aktion zurück
  return { autoUpdate: sc.renderer.shadowMap.autoUpdate, autoReset: sc.renderer.info.autoReset, radius: sc.sun.shadow.radius, filter: window.panel._filter };
});
t.results.schatten.grund = grund;
t.check(grund.autoUpdate === false && grund.autoReset === false, `leistung: Schattenkarte bzw. Zähler laufen automatisch ${JSON.stringify(grund)}`);
await quiet("haupt");

// --- keine Schattenpässe: Drehen (Ziehen mit der Maus ab einer freien Stelle, bis die Dämpfung ausläuft)
const spot = await S(() => {
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
t.check(!!spot, "leistung: keine freie Stelle zum Drehen");
const view0 = await S(() => window.panel._scene.getView());
const drehen = await measure("haupt", "drehen", async () => {
  await sp.mouse.move(spot.x, spot.y);
  await sp.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await sp.mouse.move(spot.x + i * 14, spot.y + i);
    await sleep(40);
  }
  await sp.mouse.up();
});
none(drehen, "drehen");
const view1 = await S(() => ({ view: window.panel._scene.getView(), filter: window.panel._filter }));
t.check(JSON.stringify(view1.view) !== JSON.stringify(view0) && view1.filter === grund.filter && drehen.gruende.bewegung >= 3, `leistung: drehen hat die Ansicht nicht gedreht ${JSON.stringify({ view0, view1, drehen })}`);

// --- Kamerafahrt (setView mit Dauer) und Begehen (Schritte, Umsehen, Joystick)
/** Kamerafahrt um die senkrechte Achse (Blickwinkel von oben bleibt: Möbel innen werden nicht ein- oder ausgeblendet). */
const drehe = (a, ms) =>
  S(([w, d]) => {
    const sc = window.panel._scene;
    const v = sc.getView();
    const [tx, , tz] = v.target;
    const dx = v.position[0] - tx;
    const dz = v.position[2] - tz;
    sc.setView({ target: v.target, position: [tx + dx * Math.cos(w) - dz * Math.sin(w), v.position[1], tz + dx * Math.sin(w) + dz * Math.cos(w)] }, { duration: d });
  }, [a, ms]);
const fahrt = await measure("haupt", "kamerafahrt", () => drehe(0.7, 600));
none(fahrt, "kamerafahrt");
t.check(fahrt.gruende.bewegung >= 2, `leistung: kamerafahrt ohne bewegte Bilder ${JSON.stringify(fahrt)}`);
const begehen = await measure("haupt", "begehen", () =>
  S(async () => {
    const sc = window.panel._scene;
    sc.enterWalk("eg");
    await new Promise((r) => setTimeout(r, 300));
    sc.walkStep(0.4, 0);
    sc.walkLookInput(0.6, 0);
    await new Promise((r) => setTimeout(r, 400));
    sc.walkLookInput(0, 0);
    sc.walkInput(0.8, 0);
    await new Promise((r) => setTimeout(r, 400));
    sc.walkInput(0, 0);
    sc.exitWalk();
  }),
);
none(begehen, "begehen");

// --- Lampe schalten und Sensorwert: nur Farben bzw. gar nichts in der Szene
const lampe = await measure("haupt", "lampe", () => setState("light.wohnzimmer_stehlampe", { state: "on" }));
none(lampe, "lampe");
t.check(lampe.bilder === 1, `leistung: lampe zeichnete ${lampe.bilder} statt einem Bild ${JSON.stringify(lampe)}`);
const sensor = await measure("haupt", "sensor", () => setState("sensor.wohnzimmer_temperatur", { state: "22.7" }));
none(sensor, "sensor");
const kein = (r, name) => t.check(r.bilder === 0, `leistung: ${name}: ${r.bilder} Bilder statt keinem (${JSON.stringify(r)})`);
kein(sensor, "sensor");
// Leistungssensoren: Netzzähler ohne Bild in der Szene; Einspeisung bleibt aktiv (nur das Tempo des Energieflusses ändert
// sich; direkt an der Szene, denn der PV-Sensor lässt im Panel auch die Module heller glänzen)
kein(await measure("haupt", "netzzaehler", () => setState("sensor.zaehler_leistung", { state: "-260" })), "netzzaehler");
const tempo0 = await S(() => window.panel._scene.flow?.speed);
kein(await measure("haupt", "einspeisung", () => S(() => window.panel._scene.applyStates({ ...window.panel._scene._lastStates, feedIn: 520 }))), "einspeisung");
const tempo = await S(() => window.panel._scene.flow?.speed);
t.check(tempo0 > 0 && tempo > tempo0, `leistung: Tempo des Energieflusses folgt der Einspeisung nicht (${tempo0} → ${tempo})`);
// abgewählter Raum: die Hervorhebung nimmt erst das nächste applyStates zurück, dann mit Bild (Auswahl setzt den
// Fingerabdruck zurück)
const raum = () =>
  S(() => {
    const sc = window.panel._scene;
    const w = (window.__wahl ??= (() => {
      const [floorId, entry] = [...sc.floors].find(([, e]) => e.rooms.size);
      return { floorId, roomId: [...entry.rooms.keys()][0] };
    })());
    const m = sc.floors.get(w.floorId).rooms.get(w.roomId).mesh.material;
    return `${m.emissive.getHexString()}/${m.emissiveIntensity}`;
  });
const raum0 = await raum();
await S(() => window.panel._scene.selectRooms([window.__wahl], { focus: false }));
await quiet("haupt");
const raumGewaehlt = await raum();
await S(() => window.panel._scene.selectRooms([], { focus: false }));
await quiet("haupt");
const abgewaehlt = await measure("haupt", "abgewaehlt", () => setState("sensor.wohnzimmer_temperatur", { state: "22.9" }));
const raum1 = await raum();
t.results.schatten.abgewaehlt.raum = { raum0, raumGewaehlt, raum1 };
t.check(raumGewaehlt !== raum0 && raum1 === raum0 && abgewaehlt.bilder === 1 && abgewaehlt.passes === 0, `leistung: Hervorhebung nach dem Abwählen ${JSON.stringify(abgewaehlt)}`);

// --- Hintergrund-Bilder (Energiefluss läuft 2 s)
const hinter = await measure(
  "haupt",
  "hintergrund",
  async () => {
    await S(() => window.panel._scene.setPerf({ frozen: false }));
    await sleep(2000);
    await S(() => window.panel._scene.setPerf({ frozen: true }));
  },
  { settle: 500 },
);
none(hinter, "hintergrund");
t.check((hinter.gruende.hintergrund ?? 0) >= 3, `leistung: Energiefluss zeichnete keine Hintergrund-Bilder ${JSON.stringify(hinter)}`);

// --- Zähler (A0): Aufrufe enthalten den Schattenpass; Gründe ergeben zusammen alle Bilder; Leistungsanzeige
const zaehler = await S(async () => {
  const sc = window.panel._scene;
  const frame = () =>
    new Promise((res) => {
      const n0 = sc.stats.renders;
      const f = () => (sc.stats.renders > n0 ? res() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    });
  sc.invalidate();
  await frame();
  const mit = { calls: sc.stats.calls, info: sc.renderer.info.render.calls };
  sc.redraw();
  await frame();
  const ohne = { calls: sc.stats.calls, info: sc.renderer.info.render.calls };
  const st = sc.stats;
  return { mit, ohne, renders: st.renders, summeGruende: Object.values(st.reasons).reduce((a, b) => a + b, 0), shadowRenders: st.shadowRenders, dprStill: st.dprStill, dprMove: st.dprMove };
});
t.results.schatten.zaehler = zaehler;
t.check(zaehler.mit.calls === zaehler.mit.info && zaehler.ohne.calls === zaehler.ohne.info, `leistung: stats.calls ≠ info.render.calls ${JSON.stringify(zaehler)}`);
t.check(zaehler.mit.calls > zaehler.ohne.calls * 1.3, `leistung: Aufrufe mit Schattenpass nicht höher als ohne ${JSON.stringify(zaehler)}`);
t.check(zaehler.summeGruende === zaehler.renders && zaehler.dprStill > 0 && zaehler.dprMove > 0, `leistung: Gründe bzw. Auflösung je Bild ${JSON.stringify(zaehler)}`);
const hud = await S(async () => {
  const p = window.panel;
  p._settings.perfHud = true;
  p._applyQuality();
  await new Promise((r) => setTimeout(r, 100));
  const text = p.shadowRoot.querySelector(".perfhud")?.textContent ?? null;
  p._settings.perfHud = false;
  p._applyQuality();
  return text;
});
t.results.schatten.anzeige = hud;
t.check(/^\d+\.\d Bilder\/s · Auflösung \d\.\d\d ruhend · \d\.\d\d bewegt · \d+ Aufrufe · \d+\.\d Schattenpässe\/s · Ausgewogen$/.test(hud ?? ""), `leistung: Leistungsanzeige „${hud}“`);
await quiet("haupt");

// --- mindestens ein Schattenpass: Etagenfilter hin und zurück, Ebene, Sonne, eigenes Modell, Stufe
some(await measure("haupt", "etage-hin", () => S(() => window.panel._setFilter("eg"))), "etage-hin");
some(await measure("haupt", "etage-zurueck", () => S(() => window.panel._setFilter("all"))), "etage-zurueck");
const ebene = (on) =>
  S((v) => {
    const p = window.panel;
    p._settings.layers.furniture = v;
    p._scene.setLayers(p._settings.layers);
  }, on);
some(await measure("haupt", "ebene-aus", () => ebene(false)), "ebene-aus");
some(await measure("haupt", "ebene-an", () => ebene(true)), "ebene-an");
some(await measure("haupt", "sonne", () => S(() => window.panel._scene.setSun({ azimuth: 120, elevation: 35 }, 0))), "sonne");
await S(() => window.panel._scene.setSun(null));
await quiet("haupt");
some(
  await measure("haupt", "modell", () =>
    S(async () => {
      // models.js meldet „loaded“ auch nach dem Vergessen eines Modells (wie nach dem Laden): die Szene setzt die Schatten neu
      const m = await import("/custom_components/haus3d/frontend/models.js");
      m.forgetModel("gibt_es_nicht");
      await new Promise((r) => setTimeout(r, 100));
    }),
  ),
  "modell",
);
some(
  await measure("haupt", "stufe", () =>
    S(() => {
      const sc = window.panel._scene;
      window.__q = sc.quality;
      sc.setQuality({ ...sc.quality, shadowSize: 2048 });
    }),
  ),
  "stufe",
);
await S(() => window.panel._scene.setQuality(window.__q));
await quiet("haupt");

// --- Tür: Kontakt zu, die Schattenkarte folgt bis zum Ende der Bewegung
const tuer = await measure("haupt", "tuer", async () => {
  await S(() => {
    const sc = window.panel._scene;
    const a = sc.floors.get("eg").openings.get("wz_fenster_west").anim;
    window.__tuer0 = a.open;
    sc.__sp.probe = () => a.open;
  });
  await setState("binary_sensor.terrasse_doppel", { state: "off" });
});
const tuer0 = await S(() => window.__tuer0);
t.check(tuer0 === 1 && tuer.passes >= 2 && tuer.at?.at(-1) === 0 && (tuer.gruende.animation ?? 0) >= 2, `leistung: Tür schließt ohne Schattenpässe bis zum Ende (vorher ${tuer0}) ${JSON.stringify(tuer)}`);

// --- Vorhang über onState (eigene Entität): neuer Zustand mit Schattenpass, ein anderer Sensor danach ohne
await setState("cover.vorhang_test", { state: "closed", attributes: { current_position: 0, friendly_name: "Vorhang" } });
await S(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.floors.find((f) => f.id === "eg").furniture.push({ id: "vorhang_test", type: "home_curtain_pair", x: 3.5, z: 4.9, rotation: 180, w: 2.4, d: 0.12, h: 2.4, entity: "cover.vorhang_test" });
  p._setBuilding(b, p._revision, { keepCamera: true });
});
await sp.waitForFunction(() => window.panel._scene.stateParts?.length === 1, null, { timeout: 15000 }).catch(() => {});
await S(() => window.panel._scene.setPerf({ frozen: true }));
await quiet("haupt");
const offen = () =>
  S(() => {
    let v = null;
    window.panel._scene.root.traverse((o) => {
      if (o.userData.furniture === "vorhang_test" && o.userData.curtain) v = o.userData.curtain.open;
    });
    return v;
  });
const vorhang0 = await offen();
const vorhang = await measure("haupt", "vorhang", () => setState("cover.vorhang_test", { state: "open", attributes: { current_position: 100 } }));
const vorhang1 = await offen();
some(vorhang, "vorhang");
t.check(vorhang.bilder === 1, `leistung: vorhang zeichnete ${vorhang.bilder} statt einem Bild ${JSON.stringify(vorhang)}`);
t.check(vorhang0 === 0 && vorhang1 === 1, `leistung: Vorhang folgt seiner Entität nicht (${vorhang0} → ${vorhang1})`);
const sensorVorhang = await measure("haupt", "sensor-mit-vorhang", () => setState("sensor.wohnzimmer_temperatur", { state: "23.1" }));
none(sensorVorhang, "sensor-mit-vorhang");
kein(sensorVorhang, "sensor-mit-vorhang");

// --- Leitungsfluss (setPipeFlow): neue Punktzahl, „aktiv“ und Leitungsfarbe zeichnen ohne Schattenpass, reines Tempo nicht
await S(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.floors.find((f) => f.id === "eg").pipes = [{ id: "leistung_leitung", type: "strom", points: [[1, 1], [6, 1]], heights: [0.3, 0.3], entity: null, room: null }];
  p._setBuilding(b, p._revision, { keepCamera: true });
});
await sp.waitForFunction(() => window.panel._scene._pipes?.has("leistung_leitung") && window.panel._net?.edges?.some((e) => e.pipeId === "leistung_leitung"), null, { timeout: 15000 }).catch(() => {});
await S(() => window.panel._scene.setPerf({ frozen: true }));
await quiet("haupt");
const fluss = (v) =>
  S(async (w) => {
    const p = window.panel;
    const sc = p._scene;
    const edges = (p._net?.edges ?? []).filter((e) => e.pipeId === "leistung_leitung").map((e) => ({ ...e, value: w, unit: "W" }));
    sc.setPipeFlow({ edges });
    const eds = [...sc._pipeEdges.values()].filter((e) => e.pipe.id === "leistung_leitung");
    return { kanten: eds.length, punkte: eds.reduce((n, e) => n + e.n, 0), aktiv: eds.some((e) => e.active), tempo: eds[0]?.speed ?? null, farbe: sc._pipes.get("leistung_leitung").tube.material === sc._pipes.get("leistung_leitung").mats.on };
  }, v);
/** Leistung über w mit derselben Punktzahl (nur anderes Tempo). */
const gleich = (w) =>
  S(async (w0) => {
    const { flowLook } = await import("/custom_components/haus3d/frontend/pipenet.js");
    const p = window.panel;
    const sc = p._scene;
    const pipe = sc._pipes.get("leistung_leitung");
    const edges = (p._net?.edges ?? []).filter((e) => e.pipeId === "leistung_leitung");
    const want = (v) => edges.map((e) => Math.max(1, Math.min(60, Math.round(Math.abs(pipe.lenAt(e.s1) - pipe.lenAt(e.s0)) * flowLook(v, "W").perMeter)))).join(",");
    for (let v = w0 + 1; v < w0 + 200; v++) if (want(v) === want(w0)) return v;
    return null;
  }, w);
/** Fluss setzen und messen: s = Zustand der Leitung danach, r = Bilder und Schattenpässe. */
const flussMessen = async (name, w) => {
  const out = {};
  out.r = await measure("haupt", name, async () => {
    out.s = await fluss(w);
  });
  return out;
};
const anFluss = await flussMessen("leitung-an", 500);
const w2 = await gleich(500);
const tempoFluss = await flussMessen("leitung-tempo", w2);
const mehrFluss = await flussMessen("leitung-mehr", 3000);
const ausFluss = await flussMessen("leitung-aus", 0);
t.results.leitung = { an: anFluss, tempo: { ...tempoFluss, w: w2 }, mehr: mehrFluss, aus: ausFluss };
t.check(anFluss.s.kanten >= 1 && anFluss.s.aktiv && anFluss.s.farbe && anFluss.r.bilder >= 1 && anFluss.r.passes === 0, `leistung: Leitung an ${JSON.stringify(anFluss)}`);
t.check(w2 !== null && tempoFluss.s.punkte === anFluss.s.punkte && tempoFluss.s.tempo > anFluss.s.tempo && tempoFluss.r.bilder === 0, `leistung: Leitung nur Tempo ${JSON.stringify(tempoFluss)}`);
t.check(mehrFluss.s.punkte > anFluss.s.punkte && mehrFluss.r.bilder >= 1 && mehrFluss.r.passes === 0, `leistung: Leitung mehr Punkte ${JSON.stringify(mehrFluss)}`);
t.check(!ausFluss.s.aktiv && !ausFluss.s.farbe && ausFluss.s.punkte === 0 && ausFluss.r.bilder >= 1 && ausFluss.r.passes === 0, `leistung: Leitung aus ${JSON.stringify(ausFluss)}`);

// --- ?schattenkarte=immer (flags.shadowAlways): Schattenpass in jedem Bild, auch beim Drehen
await S(() => {
  const sc = window.panel._scene;
  sc.flags.shadowAlways = true;
  sc._applyShadows();
});
await quiet("haupt");
const immer = await measure("haupt", "immer-kamerafahrt", () => S(() => window.panel._scene.viewPreset("sued", 0, { duration: 500 })));
t.check(immer.passes === immer.bilder && immer.bilder >= 2, `leistung: schattenkarte=immer ohne Schattenpass je Bild ${JSON.stringify(immer)}`);
const zurueck = await S(() => {
  const sc = window.panel._scene;
  sc.flags.shadowAlways = false;
  sc._applyShadows();
  return sc.renderer.shadowMap.autoUpdate;
});
t.check(zurueck === false, "leistung: schattenkarte=immer lässt sich nicht abschalten");
await quiet("haupt");

// --- Dach: Ebene aus und an; Möbel innen werden bei Draufsicht mit Dach ausgeblendet (lodState) – mit Schattenpass
await S(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.settings = { ...b.settings, roof: { type: "gable", pitch: 30 } };
  p._setBuilding(b, p._revision, { keepCamera: true });
});
await sp.waitForFunction(() => window.panel._scene.roofMeshes?.length > 0, null, { timeout: 15000 }).catch(() => {});
await S(() => window.panel._scene.setPerf({ frozen: true }));
await quiet("haupt");
const dach = (on) =>
  S((v) => {
    const p = window.panel;
    p._settings.layers.roof = v;
    p._scene.setLayers(p._settings.layers);
  }, on);
some(await measure("haupt", "dach-aus", () => dach(false)), "dach-aus");
some(await measure("haupt", "dach-an", () => dach(true)), "dach-an");
const blick = (phi) =>
  S((f) => {
    const sc = window.panel._scene;
    const v = sc.getView();
    const [tx, ty, tz] = v.target;
    const r = Math.hypot(v.position[0] - tx, v.position[1] - ty, v.position[2] - tz);
    sc.setView({ target: v.target, position: [tx + r * Math.sin(f) * 0.6, ty + r * Math.cos(f), tz + r * Math.sin(f) * 0.8] }, { duration: 0 });
  }, phi);
await blick(1.35);
await quiet("haupt");
const draufsicht = await measure("haupt", "draufsicht-mit-dach", () => blick(0.4));
const innen = await S(() => [...window.panel._scene.floors.values()].filter((e) => e.furn).map((e) => e.furn.visible));
some(draufsicht, "draufsicht-mit-dach");
t.check(innen.length > 0 && innen.every((v) => v === false), `leistung: Möbel innen bei Draufsicht mit Dach nicht ausgeblendet ${JSON.stringify(innen)}`);

// --- Kontextverlust: nach der Wiederherstellung neue Schattenkarte (three.js legt dabei eine neue shadowMap an)
await S(() => {
  window.__lose = window.panel._scene.renderer.getContext().getExtension("WEBGL_lose_context");
  window.__lose.loseContext();
});
await sp.waitForFunction(() => window.panel._scene.contextLost === true, null, { timeout: 5000 }).catch(() => {});
const s0 = await S(() => window.panel._scene.stats.shadowRenders);
await S(() => window.__lose.restoreContext());
await sp.waitForFunction(() => window.panel._scene.contextLost === false, null, { timeout: 5000 }).catch(() => {});
await quiet("haupt");
const kontext = await S((a) => ({ schatten: window.panel._scene.stats.shadowRenders - a, autoUpdate: window.panel._scene.renderer.shadowMap.autoUpdate, autoReset: window.panel._scene.renderer.info.autoReset }), s0);
t.results.schatten.kontext = kontext;
t.check(kontext.schatten >= 1 && kontext.autoUpdate === false && kontext.autoReset === false, `leistung: Kontextverlust ${JSON.stringify(kontext)}`);
t.check(await hook("haupt"), "leistung: Schatten nach dem Kontextverlust aus");
none(await measure("haupt", "kamerafahrt-nach-kontext", () => drehe(-0.6, 400)), "kamerafahrt-nach-kontext");

// --- Editor: Live-Vorschau beim Ziehen eines Möbelstücks zeichnet mit Schattenpass
await S(() => window.panel._openEditor());
await sp.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0 && window.panel._editor.scene3d.stats.renders > 0, null, { timeout: 90000 });
t.check(await hook("editor"), "leistung: Schatten im Editor aus");
await quiet("editor");
const live = await measure("editor", "editor-live-vorschau", () =>
  S(() => {
    const e = window.panel._editor;
    const m = e.floor.furniture.find((f) => f.type === "sofa") ?? e.floor.furniture[0];
    e.sel = { kind: "furniture", id: m.id };
    e._liveStart(e.sel);
    m.x += 0.4;
    e._preview3d();
    window.__live = { id: m.id, live: !!e._live3d };
  }),
);
some(live, "editor-live-vorschau");
t.check(await S(() => window.__live.live), "leistung: Live-Vorschau im Editor startete nicht");
const editorDrehen = await measure("editor", "editor-kamerafahrt", () => S(() => window.panel._editor.scene3d.viewPreset("sued", 0, { duration: 400 })));
none(editorDrehen, "editor-kamerafahrt");
const gesamt = await S(() => {
  const st = window.panel._scene.stats;
  return { renders: st.renders, summe: Object.values(st.reasons).reduce((a, b) => a + b, 0), reasons: st.reasons, shadowRenders: st.shadowRenders };
});
t.results.schatten.gesamt = gesamt;
t.check(gesamt.renders === gesamt.summe, `leistung: Gründe ergeben nicht alle Bilder ${JSON.stringify(gesamt)}`);
await t.done();
