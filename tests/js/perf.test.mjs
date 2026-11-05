// Leistung: Qualitätsstufen, Zeichentakt, Schattenpass nur nach Änderungen, Gründe der Bilder, Leistungsanzeige,
// progressive Auflösung und Anpassung der Bewegungs-Auflösung, Takt der Hintergrund-Animationen, Möbel innen ausblenden,
// Ruhemodus und Pause
import assert from "node:assert/strict";
import { test } from "node:test";

import { BOLT_FPS, PROGRESSIVE, QUALITY, RENDER_REASONS, adaptMoveDpr, ambientFps, ambientInterval, initialMoveDpr, lodState, moveTooSlow, perfFlags, perfHudText, progressiveDpr, quantile, refreshFromGaps, renderReason, resolveQuality, shadowNeeded, shouldRender } from "../../custom_components/haus3d/frontend/perf.js";

test("Stufen vollständig, auto: Tablet ausgewogen, PC schön", () => {
  for (const q of Object.values(QUALITY)) for (const k of ["maxDpr", "glow", "weatherScale", "ambientFps", "cullInterior"]) assert.ok(k in q, k);
  assert.equal(resolveQuality("akku").maxDpr, 1);
  assert.equal(resolveQuality("auto", { coarse: true }).name, "ausgewogen");
  assert.equal(resolveQuality("auto").name, "schoen");
  assert.ok(resolveQuality("quatsch").auto);
});

test("Zeichnen: Änderungen sofort, Hintergrund gedrosselt", () => {
  const i = ambientInterval(24);
  assert.ok(Math.abs(i - 41.67) < 0.01);
  assert.equal(shouldRender({ dirty: true }), true);
  assert.equal(shouldRender({ ambient: true, now: 1000, lastRender: 980, interval: i }), false);
  assert.equal(shouldRender({ ambient: true, now: 1000, lastRender: 950, interval: i }), true);
  assert.equal(shouldRender({ ambient: false, now: 5000, lastRender: 0 }), false);
});

test("Hintergrund-Takt: Tablet in Ausgewogen 15, beim Drehen gemessen langsam 12, sonst wie die Stufe; Blitz allein 8", () => {
  const q = (name, auto = false) => resolveQuality(auto ? "auto" : name, { coarse: true });
  // ab Werk (Bewegungs-Auflösung anfangs 1 unter ruhend 1,5) nicht langsam: 15
  assert.equal(ambientFps(q("ausgewogen"), { coarse: true }), 15);
  assert.equal(ambientFps(q("ausgewogen", true), { coarse: true, slow: false }), 15);
  assert.equal(ambientFps(q("ausgewogen"), { coarse: true, slow: true }), 12);
  assert.equal(ambientFps(q("ausgewogen", true), { coarse: true, slow: true }), 12);
  // Desktop und andere Stufen unverändert
  assert.equal(ambientFps(resolveQuality("ausgewogen"), { coarse: false, slow: true }), QUALITY.ausgewogen.ambientFps);
  assert.equal(ambientFps(resolveQuality("auto"), { coarse: false }), QUALITY.schoen.ambientFps);
  assert.equal(ambientFps(q("schoen"), { coarse: true, slow: true }), QUALITY.schoen.ambientFps);
  assert.equal(ambientFps(q("akku"), { coarse: true }), QUALITY.akku.ambientFps);
  assert.equal(ambientFps(null), 30);
  assert.equal(BOLT_FPS, 8);
  assert.ok(ambientInterval(ambientFps(q("ausgewogen"), { coarse: true, slow: true })) > ambientInterval(QUALITY.ausgewogen.ambientFps) * 1.9);
  // langsam: p75 der Bildabstände beim Drehen über der Senk-Schwelle von adaptMoveDpr (28 ms bzw. 1,5 × Bildschirmtakt)
  assert.equal(moveTooSlow(Array(20).fill(28)), false);
  assert.equal(moveTooSlow(Array(20).fill(28.5)), true);
  assert.equal(moveTooSlow([...Array(15).fill(17), ...Array(5).fill(60)]), false, "p75");
  assert.equal(moveTooSlow([...Array(14).fill(17), ...Array(6).fill(60)]), true, "p75");
  assert.equal(moveTooSlow(Array(20).fill(40), 33.3), false, "30 Hz: 40 ms ist das Beste, was geht");
  assert.equal(moveTooSlow(Array(20).fill(51), 33.3), true);
  assert.equal(moveTooSlow(Array(20).fill(30), 0), true, "ohne Takt: 60 Hz");
});

/**
 * Ablauf für progressiveDpr: Liste von Ereignissen ({type, at, …}); Bilder ({type: "frame"}) bekommen gap (Vorgabe 16 ms)
 * und liefern den Zustand je Bild. @returns {{modes: string[], s: object}}
 */
function run(events, s = null) {
  const modes = [];
  for (const ev of events) {
    s = progressiveDpr(s, { gap: 16, ...ev, now: ev.at });
    if (ev.type === "frame") modes.push(s.mode === "moving" ? "M" : "S");
  }
  return { modes: modes.join(""), s };
}
/** n Bilder ab t0 im Abstand dt, alle bewegt (motion je Bild) bzw. ruhend. */
const frames = (t0, n, dt, extra = {}) => Array.from({ length: n }, (_, i) => ({ type: "frame", at: t0 + i * dt, moved: true, motion: 0.02, ...extra }));

test("progressive Auflösung: Antippen schaltet nicht, Ziehen sofort, Hinauf spätestens 300 ms nach dem Loslassen", () => {
  // Antippen ohne Bewegung: kein bewegtes Bild, bleibt ruhend
  let r = run([{ type: "start", at: 0 }, { type: "frame", at: 16, moved: false }, { type: "end", at: 80 }, { type: "frame", at: 96, moved: false }]);
  assert.equal(r.modes, "SS");
  assert.equal(r.s.wakeAt, null);
  // Ziehen: gedrückt und ein bewegtes Bild → sofort Bewegung, solange gedrückt bleibt es dabei (auch ohne Bewegung)
  r = run([{ type: "start", at: 0 }, ...frames(20, 5, 16), { type: "frame", at: 120, moved: false }, { type: "frame", at: 400, moved: false }]);
  assert.equal(r.modes, "MMMMMMM");
  assert.equal(r.s.wakeAt, null, "gedrückt: kein Hinauf-Zeitgeber");
  // Loslassen ohne Restbewegung: das nächste Bild ist scharf (Zeitgeber sofort)
  let e = progressiveDpr(r.s, { type: "end", now: 500 });
  assert.equal(e.wakeAt, 500);
  assert.equal(progressiveDpr(e, { type: "frame", now: 501, moved: false, gap: 16 }).mode, "still");
  // Dämpfungsauslauf nach dem Loslassen (große Restbewegung, 60 Hz): Bewegung bis kurz vor 300 ms, dann scharf, und die
  // weitere Restbewegung schaltet nicht wieder herunter (kein Pendeln)
  r = run([{ type: "start", at: 0 }, ...frames(16, 10, 16), { type: "end", at: 170 }, ...frames(186, 40, 16)]);
  const after = r.modes.slice(10);
  const firstStill = after.indexOf("S");
  const tUp = 186 + firstStill * 16;
  assert.ok(firstStill > 0 && tUp - 170 <= PROGRESSIVE.endMs && tUp - 170 >= PROGRESSIVE.endMs - 32, `hinauf nach ${tUp - 170} ms`);
  assert.ok(!after.slice(firstStill).includes("M"), `Pendeln: ${after}`);
  // Restbewegung klein: sofort scharf (frühestens 150 ms nach dem Start der Steuerung, wie beim Mausrad)
  r = run([{ type: "start", at: 0 }, ...frames(16, 12, 16), { type: "end", at: 200 }, { type: "frame", at: 216, moved: true, motion: PROGRESSIVE.small / 2 }]);
  assert.equal(r.modes, "MMMMMMMMMMMMS");
  // langsames Gerät (Bildabstand 280 ms): schon das erste Bild nach dem Loslassen ist scharf, nicht erst nach der Dämpfung
  r = run([{ type: "start", at: 0 }, ...frames(100, 6, 280, { gap: 280 }), { type: "end", at: 1500 }, ...frames(1580, 4, 280, { gap: 280 })]);
  assert.equal(r.modes, "MMMMMMSSSS");
  // neuer Finger während des Auslaufs: wieder Bewegung
  r = run([{ type: "start", at: 0 }, ...frames(16, 3, 16), { type: "end", at: 60 }, ...frames(76, 20, 16), { type: "start", at: 400 }, ...frames(410, 2, 16)]);
  assert.equal(r.modes.slice(-2), "MM");
});

test("progressive Auflösung: Kamerafahrt und Begehen über das eigene Signal, Hinauf 150 ms nach der letzten Bewegung", () => {
  // Fahrt (driven je Bild): erst das zweite bewegte Bild schaltet, scharf 150 ms nach der letzten Bewegung
  let r = run(frames(0, 10, 16, { driven: true }));
  assert.equal(r.modes, "SMMMMMMMMM");
  assert.equal(r.s.wakeAt, 144 + PROGRESSIVE.holdMs);
  assert.equal(progressiveDpr(r.s, { type: "frame", now: 144 + PROGRESSIVE.holdMs - 1, moved: false }).mode, "moving");
  assert.equal(progressiveDpr(r.s, { type: "frame", now: 144 + PROGRESSIVE.holdMs, moved: false }).mode, "still");
  // ein einzelner Sprung (fitCamera, setView ohne Dauer) und Restbewegung ohne neue Eingabe schalten nicht
  assert.equal(run([{ type: "frame", at: 0, moved: true, driven: true }, { type: "frame", at: 16, moved: false }]).modes, "SS");
  assert.equal(run(frames(0, 10, 16)).modes, "SSSSSSSSSS");
  // Begehen (Joystick im 33-ms-Takt, Bilder langsamer): bleibt in Bewegung, solange gelenkt wird
  r = run(frames(0, 8, 90, { driven: true }));
  assert.equal(r.modes, "SMMMMMMM");
  // langsames Gerät (Bild alle 300 ms): „in Folge“ über den gemessenen Bildabstand (scene-loop.js misst ihn auch beim
  // Begehen), sonst schaltete es nie herunter
  assert.equal(run(frames(0, 5, 300, { driven: true, gap: 300 })).modes, "SMMMM");
  assert.equal(run(frames(0, 5, 300, { driven: true, gap: 0 })).modes, "SSSSS");
  // Mausrad (start/end im selben Ereignis): ein Rastschritt schaltet nicht, mehrere hintereinander schon
  assert.equal(run([{ type: "start", at: 0 }, { type: "end", at: 0 }, { type: "frame", at: 16, moved: true, motion: 0.05 }, { type: "frame", at: 32, moved: false }]).modes, "SS");
  const wheel = [];
  for (let i = 0; i < 5; i++) wheel.push({ type: "start", at: i * 30 }, { type: "end", at: i * 30 }, { type: "frame", at: i * 30 + 10, moved: true, motion: 0.05 });
  r = run(wheel);
  assert.equal(r.modes, "SMMMM");
  assert.equal(r.s.wakeAt, 120 + PROGRESSIVE.holdMs);
  // zwei einzelne Rastschritte mit Pause dazwischen sind nicht „in Folge“
  assert.equal(run([{ type: "start", at: 0 }, { type: "end", at: 0 }, { type: "frame", at: 16, moved: true, motion: 0.05 }, { type: "start", at: 2000 }, { type: "end", at: 2000 }, { type: "frame", at: 2016, moved: true, motion: 0.05 }]).modes, "SS");
  // Fahrt bei wenigen Bildern/s: 150 ms ab der letzten Bewegung (Zeitstempel aus _viewMoved), nicht ab dem Bild danach
  r = run([...frames(0, 3, 250, { gap: 250 }).map((f) => ({ ...f, driven: f.at - 100 }))]);
  assert.equal(r.modes, "SMM");
  assert.equal(r.s.wakeAt, 400 + PROGRESSIVE.holdMs);
  // Ende der Fahrt (letzter Schritt nicht mehr als Fahrt gemeldet): bei wenigen Bildern/s ist das letzte Bild gleich scharf,
  // bei 60 Hz erst 150 ms nach der letzten Fahrt-Bewegung (Zeitgeber)
  r = run([...frames(0, 2, 250, { gap: 250, driven: true }), { type: "frame", at: 500, moved: true, motion: 0.02, gap: 250 }]);
  assert.equal(r.modes, "SMS");
  r = run([...frames(0, 5, 16, { driven: true }), { type: "frame", at: 80, moved: true, motion: 0.02 }]);
  assert.equal(r.modes, "SMMMMM");
  assert.equal(r.s.wakeAt, 64 + PROGRESSIVE.holdMs);
  // Neustart der Szene: immer ruhend
  assert.equal(progressiveDpr(r.s, { type: "reset" }).mode, "still");
});

test("Bewegungs-Auflösung: Anfangswert je Gerät, Mindestwert, Hinauf bei 60 Hz, kein Pendeln", () => {
  // Anfang: Tablet 1, Desktop wie ruhend, gespeicherter Wert begrenzt auf 1..ruhend, ?progressiv=aus wie ruhend
  assert.equal(initialMoveDpr({ still: 1.5, coarse: true }), 1);
  assert.equal(initialMoveDpr({ still: 1.5, coarse: false }), 1.5);
  assert.equal(initialMoveDpr({ still: 1.5, coarse: true, saved: "1.25" }), 1.25);
  assert.equal(initialMoveDpr({ still: 1.5, coarse: true, saved: "2" }), 1.5);
  assert.equal(initialMoveDpr({ still: 1.5, coarse: false, saved: "0.5" }), 1.5);
  assert.equal(initialMoveDpr({ still: 1.5, coarse: true, saved: "quatsch" }), 1);
  assert.equal(initialMoveDpr({ still: 2, coarse: true, progressive: false }), 2);
  // krumme Geräte-Auflösung (Zoom): am Desktop genau gleich ruhend, sonst schaltete jede Geste um
  assert.equal(initialMoveDpr({ still: 1.100000023841858, coarse: false }), 1.100000023841858);
  assert.equal(initialMoveDpr({ still: 1.100000023841858, coarse: false, saved: "1.1" }), 1.100000023841858);
  assert.equal(initialMoveDpr({ still: 1.33333, coarse: true, saved: "1.25" }), 1.25);
  const slow = Array(30).fill(45);
  const at60 = Array(30).fill(17); // 60 Hz erreicht (das frühere adaptDpr verlangte < 14 ms und hob nie an)
  const mid = Array(30).fill(24);
  const opt = { min: 1, max: 1.5, now: 20000 };
  // herunter bei p75 > 28 ms, Mindestwert 1
  assert.equal(adaptMoveDpr(1.5, slow, opt), 1.25);
  assert.equal(adaptMoveDpr(1, slow, opt), 1);
  // hinauf bei p75 ≤ refreshMs × 1,25, höchstens bis ruhend
  assert.equal(adaptMoveDpr(1, at60, { ...opt, refreshMs: 16.7 }), 1.25);
  assert.equal(adaptMoveDpr(1.5, at60, { ...opt, refreshMs: 16.7 }), 1.5);
  assert.equal(adaptMoveDpr(1, at60, { ...opt, max: 1.100000023841858, refreshMs: 16.7 }), 1.100000023841858, "bis genau ruhend");
  assert.equal(adaptMoveDpr(1, at60, { ...opt, refreshMs: 8.3 }), 1, "120 Hz: 17 ms ist keine Reserve");
  // dazwischen: bleibt
  assert.equal(adaptMoveDpr(1.25, mid, { ...opt, refreshMs: 16.7 }), 1.25);
  // langsamer Bildschirmtakt (30 Hz): 34 ms ist das Beste, was geht → nicht herunter
  assert.equal(adaptMoveDpr(1.5, Array(30).fill(34), { ...opt, refreshMs: 33.3 }), 1.5);
  // zu wenige Proben, Pause von 10 s seit der letzten Änderung
  assert.equal(adaptMoveDpr(1.5, slow.slice(0, 10), opt), 1.5);
  assert.equal(adaptMoveDpr(1.5, slow, { ...opt, lastChange: 15000 }), 1.5);
  assert.equal(adaptMoveDpr(1.5, slow, { ...opt, lastChange: 9000 }), 1.25);
  // kein Pendeln: wo es zu langsam war (slowAt), wird nicht wieder angehoben, auch wenn es eine Stufe tiefer flüssig läuft
  assert.equal(adaptMoveDpr(1.25, at60, { ...opt, refreshMs: 16.7, slowAt: 1.5 }), 1.25);
  assert.equal(adaptMoveDpr(1, at60, { ...opt, refreshMs: 16.7, slowAt: 1.5 }), 1.25);
  // Ablauf über die Zeit: 1,5 zu langsam → 1,25 flüssig → bleibt dort (Schritte im Abstand von 12 s)
  const cost = { 1.5: slow, 1.25: at60, 1: at60 };
  let cur = 1.5;
  let slowAt = Infinity;
  let last = -Infinity;
  const seen = [];
  for (let k = 1; k <= 8; k++) {
    const now = k * 12000;
    const next = adaptMoveDpr(cur, cost[cur], { ...opt, refreshMs: 16.7, now, lastChange: last, slowAt });
    if (next !== cur) {
      if (next < cur) slowAt = Math.min(slowAt, cur);
      last = now;
    }
    cur = next;
    seen.push(cur);
  }
  assert.deepEqual(seen, [1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 1.25]);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3);
});

test("Möbel innen nur bei Draufsicht mit Dach und passender Stufe ausblenden", () => {
  assert.equal(lodState(0.6, true, QUALITY.akku).hideInterior, true);
  assert.equal(lodState(1.4, true, QUALITY.akku).hideInterior, false);
  assert.equal(lodState(0.6, false, QUALITY.akku).hideInterior, false);
  assert.equal(lodState(0.6, true, QUALITY.schoen).hideInterior, false);
});

test("Ruhemodus: Standard im Wandtablet 5 min, Dimmen über Mitternacht, Schwelle", async () => {
  const { normalizeIdle, inTimeRange, idleState, parseClock } = await import("../../custom_components/haus3d/frontend/perf.js");
  assert.equal(normalizeIdle({}, { kiosk: true }).idleMs, 300000);
  assert.equal(normalizeIdle({}).idleMs, 0);
  assert.equal(normalizeIdle({ idleMin: 0 }, { kiosk: true }).idleMs, 0);
  assert.equal(normalizeIdle({ idleMin: "2" }).idleMs, 120000);
  const d = normalizeIdle({ dimFrom: "22:00", dimTo: "6:30", dimLevel: 2 });
  assert.deepEqual([d.dimFrom, d.dimTo, d.dimLevel], [1320, 390, 0.95]);
  assert.equal(normalizeIdle({ dimFrom: "22:00" }).dimFrom, null);
  // Pause der Animationen: Touch-Geräte ohne Wandtablet-Modus ab Werk 10 min, einstellbar (0 = aus); Wandtablet wie bisher
  assert.equal(normalizeIdle({}, { coarse: true }).pauseMs, 600000);
  assert.equal(normalizeIdle({}).pauseMs, 0);
  assert.equal(normalizeIdle({ pauseMin: 0 }, { coarse: true }).pauseMs, 0);
  assert.equal(normalizeIdle({ pauseMin: "3" }, { coarse: true }).pauseMs, 180000);
  assert.equal(normalizeIdle({ pauseMin: 2 }).pauseMs, 120000);
  assert.equal(normalizeIdle({ pauseMin: 999 }, { coarse: true }).pauseMs, 240 * 60000);
  assert.equal(normalizeIdle({ pauseMin: "x" }, { coarse: true }).pauseMs, 0);
  for (const cfg of [{}, { pauseMin: 3 }]) {
    const k = normalizeIdle(cfg, { kiosk: true, coarse: true });
    assert.deepEqual([k.pauseMs, k.idleMs], [0, 300000]);
  }
  assert.equal(normalizeIdle({ idleMin: 0 }, { coarse: true }).idleMs, 0);
  assert.equal(parseClock("24:00"), null);
  assert.equal(inTimeRange(23 * 60, 1320, 390), true);
  assert.equal(inTimeRange(3 * 60, 1320, 390), true);
  assert.equal(inTimeRange(12 * 60, 1320, 390), false);
  assert.equal(inTimeRange(13 * 60, 12 * 60, 14 * 60), true);
  assert.equal(inTimeRange(14 * 60, 12 * 60, 14 * 60), false);
  assert.equal(inTimeRange(5, null, 10), false);
  assert.equal(idleState(0, 299999, 300000), "active");
  assert.equal(idleState(0, 300000, 300000), "idle");
  assert.equal(idleState(0, 1e9, 0), "active");
});

test("Mess-Schalter aus der Adresse: ohne Angabe alles an, je Schalter einzeln aus", () => {
  const an = { shadowAlways: false, progressive: true, merge: true, instances: true };
  assert.deepEqual(perfFlags(""), an);
  assert.deepEqual(perfFlags(), an);
  assert.deepEqual(perfFlags(null), an);
  assert.deepEqual(perfFlags("?quality=akku&schatten=aus"), an);
  assert.deepEqual(perfFlags("?schattenkarte=immer"), { ...an, shadowAlways: true });
  assert.deepEqual(perfFlags("?progressiv=aus"), { ...an, progressive: false });
  assert.deepEqual(perfFlags("?zusammenfuehren=aus"), { ...an, merge: false });
  assert.deepEqual(perfFlags("instanzen=aus"), { ...an, instances: false }); // auch ohne „?“
  assert.deepEqual(perfFlags("?schattenkarte=immer&progressiv=aus&zusammenfuehren=aus&instanzen=aus"), { shadowAlways: true, progressive: false, merge: false, instances: false });
  // nur die festen Werte zählen (Groß-/Kleinschreibung und Leerzeichen egal)
  assert.deepEqual(perfFlags("?schattenkarte=IMMER&progressiv=%20Aus"), { ...an, shadowAlways: true, progressive: false });
  assert.deepEqual(perfFlags("?schattenkarte=an&progressiv=ja&zusammenfuehren=&instanzen"), an);
});

test("Schattenpass: nur mit Schatten, dann nach einer Änderung oder mit ?schattenkarte=immer", () => {
  assert.equal(shadowNeeded(), false);
  assert.equal(shadowNeeded({ enabled: true }), false, "Kamera, Farben, Hintergrund: kein Pass");
  assert.equal(shadowNeeded({ enabled: true, dirty: true }), true, "Schatten-Marke");
  assert.equal(shadowNeeded({ enabled: true, always: true }), true, "schattenkarte=immer");
  assert.equal(shadowNeeded({ enabled: false, dirty: true, always: true }), false, "Schatten aus (Stufe, Ebene, Cyberpunk, Kontext weg)");
});

test("Grund je Bild: Bewegung vor Animation vor Änderung vor Neuzeichnen vor Hintergrund", () => {
  assert.deepEqual(RENDER_REASONS, ["bewegung", "animation", "aenderung", "neuzeichnen", "hintergrund"]);
  assert.equal(renderReason({ moving: true, animating: true, dirty: true, shadow: true }), "bewegung");
  assert.equal(renderReason({ animating: true, dirty: true, shadow: true }), "animation");
  assert.equal(renderReason({ dirty: true, shadow: true }), "aenderung");
  assert.equal(renderReason({ dirty: true }), "neuzeichnen");
  assert.equal(renderReason({ shadow: true }), "hintergrund", "Marke ohne Zeichenauftrag: Hintergrund-Bild");
  assert.equal(renderReason(), "hintergrund");
  for (const k of [renderReason({ moving: true }), renderReason({ dirty: true })]) assert.ok(RENDER_REASONS.includes(k));
});

test("Leistungsanzeige: Bilder/s · Auflösung ruhend · bewegt · Aufrufe · Schattenpässe/s · Stufe", () => {
  assert.equal(perfHudText({ fps: 14.26, still: 1.5, move: 1, calls: 269, shadows: 0, label: "Ausgewogen (auto)" }), "14.3 Bilder/s · Auflösung 1.50 ruhend · 1.00 bewegt · 269 Aufrufe · 0.0 Schattenpässe/s · Ausgewogen (auto)");
  assert.equal(perfHudText({ fps: 2, still: 2, calls: 488, shadows: 2 }), "2.0 Bilder/s · Auflösung 2.00 ruhend · – bewegt · 488 Aufrufe · 2.0 Schattenpässe/s");
  assert.match(perfHudText(), /^0\.0 Bilder\/s · Auflösung – ruhend · – bewegt · – Aufrufe · 0\.0 Schattenpässe\/s$/);
});

test("refreshFromGaps: Bildschirmtakt aus rAF-Abständen, unempfindlich gegen ausgelastete Grafik", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.05, `${a} ≠ ${b}`);
  // 60 Hz mit einzelnen ausgelassenen Bildern
  near(refreshFromGaps([...Array(30).fill(16.7), 33.3, 33.4, 50]), 16.7);
  // gemessen am Tablet-Nachbau mit PV-Fluss im Hintergrund: Median 133 ms, der Takt ist 16,7 ms
  near(refreshFromGaps([16.6, 16.7, 116.6, 116.7, 116.7, 133.3, 133.3, 133.4, 133.4, 150]), 16.7);
  // alle Abstände aufgebläht: höchstens 30 Hz annehmen (adaptMoveDpr hebt dann erst unter ~42 ms an)
  near(refreshFromGaps(Array(12).fill(120)), 1000 / 30);
  near(refreshFromGaps(Array(20).fill(8.3)), 8.3); // 120 Hz
  near(refreshFromGaps(Array(20).fill(1)), 1000 / 240);
  assert.equal(refreshFromGaps([16.7, 16.7]), null);
  assert.equal(refreshFromGaps(null), null);
  // mit dem aufgeblähten Median hob adaptMoveDpr bei 84 ms je Bild an, mit dem Takt nicht
  const moving = Array(30).fill(84);
  const opt = { min: 1, max: 1.5, now: 20000 };
  assert.equal(adaptMoveDpr(1, moving, { ...opt, refreshMs: 133.3 }), 1.25);
  assert.equal(adaptMoveDpr(1, moving, { ...opt, refreshMs: refreshFromGaps([16.6, 16.7, 116.6, 116.7, 116.7, 133.3, 133.3, 133.4, 133.4, 150]) }), 1);
});
