// Leistung und Qualität (ohne DOM, mit node testbar): Stufen, wann gezeichnet wird, Schattenpass, Gründe der Bilder,
// Leistungsanzeige, progressive Auflösung, Takt der Hintergrund-Animationen, Möbel innen ausblenden, Ruhezeiten.

/** Qualitätsstufen. ambientFps: Bilder/s für Hintergrund-Animationen (Energiefluss, Wetter). */
export const QUALITY = {
  akku: { label: "Akku", maxDpr: 1, glow: false, weatherScale: 0.35, ambientFps: 12, cullInterior: true, shadows: false, shadowSize: 1024 },
  ausgewogen: { label: "Ausgewogen", maxDpr: 1.5, glow: true, weatherScale: 0.7, ambientFps: 24, cullInterior: true, shadows: true, shadowSize: 1024 },
  schoen: { label: "Schön", maxDpr: 2, glow: true, weatherScale: 1, ambientFps: 30, cullInterior: false, shadows: true, shadowSize: 2048 },
};

/** Auswahl in den Einstellungen. */
export const QUALITY_CHOICES = [["auto", "Automatisch"], ["akku", "Akku"], ["ausgewogen", "Ausgewogen"], ["schoen", "Schön"]];

/**
 * Stufe zur Einstellung. „auto“: Touch-Geräte (Tablet) ausgewogen, sonst schön.
 * @returns {{name: string, auto: boolean} & typeof QUALITY.schoen}
 */
export function resolveQuality(name, { coarse = false } = {}) {
  if (QUALITY[name]) return { name, auto: false, ...QUALITY[name] };
  const base = coarse ? "ausgewogen" : "schoen";
  return { name: base, auto: true, ...QUALITY[base] };
}

/**
 * Schalter für Messungen und Bildvergleiche aus der Adresse (location.search). Jeder schaltet eine Sparmaßnahme ab,
 * damit sich Bilder und Messwerte mit dem bisherigen Weg vergleichen lassen; ohne Angabe gilt alles als an.
 * - `?schattenkarte=immer` → shadowAlways: Schattenkarte in jedem Bild neu berechnen
 * - `?progressiv=aus` → progressive false: Auflösung beim Bewegen nicht senken
 * - `?zusammenfuehren=aus` → merge false: Möbelteile nicht zusammenführen
 * - `?instanzen=aus` → instances false: Punkte und Kontaktschatten nicht instanziert zeichnen
 * @returns {{shadowAlways: boolean, progressive: boolean, merge: boolean, instances: boolean}}
 */
export function perfFlags(search = "") {
  let q;
  try {
    q = new URLSearchParams(typeof search === "string" ? search : "");
  } catch {
    q = new URLSearchParams();
  }
  const val = (k) => (q.get(k) ?? "").trim().toLowerCase();
  return { shadowAlways: val("schattenkarte") === "immer", progressive: val("progressiv") !== "aus", merge: val("zusammenfuehren") !== "aus", instances: val("instanzen") !== "aus" };
}

/** Blitz ohne Niederschlag: Takt je Sekunde, in dem ein Blitz beginnen kann; gezeichnet wird nur beim Aufleuchten und Erlöschen. */
export const BOLT_FPS = 8;

/**
 * Bilder/s der Hintergrund-Animationen: am Tablet (grober Zeiger) in „Ausgewogen“ (auch automatisch) 15, auf langsamen
 * Geräten 12; sonst wie die Stufe. slow: beim Drehen gemessen zu langsam (moveTooSlow), nicht schon die anfangs niedrigere
 * Bewegungs-Auflösung des Tablets.
 */
export function ambientFps(quality, { coarse = false, slow = false } = {}) {
  if (!coarse || quality?.name !== "ausgewogen") return quality?.ambientFps ?? 30;
  return slow ? 12 : 15;
}

/** Abstand zwischen zwei Hintergrund-Bildern in ms. */
export function ambientInterval(fps) {
  return 1000 / Math.max(1, Math.min(60, Number(fps) || 30));
}

/**
 * Jetzt zeichnen? Änderungen, Kamerabewegung und Tür-/Rollladen-Animationen sofort; reine
 * Hintergrund-Animationen (Energiefluss, Wetter) höchstens alle interval ms.
 */
export function shouldRender({ dirty = false, moving = false, animating = false, ambient = false, now = 0, lastRender = -Infinity, interval = 33 }) {
  if (dirty || moving || animating) return true;
  return ambient && now - lastRender >= interval - 1;
}

/** Schattenpass im nächsten Bild? Nur mit Schatten (enabled), dann immer (?schattenkarte=immer) oder nach einer Änderung. */
export function shadowNeeded({ enabled = false, always = false, dirty = false } = {}) {
  return !!enabled && (!!always || !!dirty);
}

/** Gründe eines Bilds (stats.reasons, je Bild genau einer). */
export const RENDER_REASONS = ["bewegung", "animation", "aenderung", "neuzeichnen", "hintergrund"];

/** Grund eines Bilds in dieser Rangfolge: bewegung (Kamera), animation (Tür, Rollladen), aenderung (mit Schatten-Marke),
 * neuzeichnen (Farben, Größe, Auflösung), sonst hintergrund (Fluss, Leitungen, Wetter). */
export function renderReason({ moving = false, animating = false, dirty = false, shadow = false } = {}) {
  if (moving) return "bewegung";
  if (animating) return "animation";
  if (dirty) return shadow ? "aenderung" : "neuzeichnen";
  return "hintergrund";
}

/** Leistungsanzeige: Bilder/s · Auflösung ruhend · bewegt · Aufrufe des letzten Bilds · Schattenpässe/s · Stufe („–“ fehlt). */
export function perfHudText({ fps = 0, still = null, move = null, calls = null, shadows = 0, label = "" } = {}) {
  const f = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  return `${f(fps, 1)} Bilder/s · Auflösung ${f(still, 2)} ruhend · ${f(move, 2)} bewegt · ${f(calls, 0)} Aufrufe · ${f(shadows, 1)} Schattenpässe/s${label ? ` · ${label}` : ""}`;
}

/**
 * Bildschirmtakt (ms) aus rAF-Abständen ohne Bild: das 10-%-Quantil statt des Medians, begrenzt auf 30 bis 240 Hz. Eine
 * ausgelastete Grafik (Hintergrund-Animation, SwiftShader) verzögert viele rAF-Rückrufe; der Median lag dann gemessen bei
 * 133 statt 16,7 ms, und adaptMoveDpr hob die Bewegungs-Auflösung mitten im Ruckeln an. null bei weniger als 8 Abständen.
 */
export function refreshFromGaps(gaps) {
  if (!gaps || gaps.length < 8) return null;
  return Math.min(1000 / 30, Math.max(1000 / 240, quantile(gaps, 0.1)));
}

/** p-Quantil (0..1) einer Zahlenliste. */
export function quantile(list, p) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

/** Progressive Auflösung: endMs/holdMs (ms), small: kleine Restbewegung je Bild (Bogenmaß, ~1,5 px). */
export const PROGRESSIVE = { endMs: 300, holdMs: 150, small: 0.0015 };

/**
 * Progressive Auflösung (mode still/moving). ev: start/end der Steuerung, reset oder Bild {type: "frame", now, moved, driven
 * (Zeit der Fahrt-/Begehen-Bewegung), motion, gap}. Herunter: gedrückt und bewegt oder 2 Bilder in Folge durch Eingabe
 * bewegt. Hinauf: holdMs ohne Eingabe, nach end Restbewegung klein oder nächstes Bild nach endMs. wakeAt: Zeitgeber.
 */
export function progressiveDpr(state, ev = {}) {
  const P = PROGRESSIVE;
  const s = { mode: "still", down: false, streak: 0, input: false, endAt: null, holdAt: -Infinity, freshAt: -Infinity, wakeAt: null };
  if (ev.type !== "reset") Object.assign(s, state);
  const now = Number(ev.now) || 0;
  if (ev.type === "start") Object.assign(s, { down: true, input: true, endAt: null, holdAt: now });
  else if (ev.type === "end") Object.assign(s, { down: false, endAt: now });
  else if (ev.type === "frame") {
    const moved = !!ev.moved;
    if (ev.driven) s.holdAt = ev.driven === true ? now : Math.min(now, ev.driven);
    const fresh = moved && (s.down || s.input || !!ev.driven);
    s.input = false;
    // in Folge: bis holdMs + gap
    s.streak = fresh ? (now - s.freshAt <= P.holdMs + (ev.gap || 0) ? s.streak : 0) + 1 : 0;
    if (fresh) s.freshAt = now;
    if (s.mode === "still") {
      if ((s.down && moved) || s.streak >= 2) s.mode = "moving";
    } else if (!s.down && !fresh && now - s.holdAt >= P.holdMs) {
      if (s.endAt === null || !moved || !(ev.motion > P.small) || now + (ev.gap || 0) >= s.endAt + P.endMs) s.mode = "still";
    }
  }
  s.wakeAt = s.mode === "moving" && !s.down ? Math.max(now, s.holdAt + P.holdMs) : null;
  return s;
}

/** Auf lo..hi, gerundet auf 0,01; ab hi genau hi (krumme Geräte-Auflösung: sonst Umschalten bei jeder Geste). */
function clampDpr(v, lo, hi) {
  if (v >= hi - 0.005) return hi;
  return Math.max(Math.min(lo, hi), Math.min(hi, Math.round(v * 100) / 100));
}

/** Anfangs-Bewegungs-Auflösung: gespeichert (haus3d.moveDpr), sonst Tablet (grober Zeiger) 1, Desktop = still; 1..still. */
export function initialMoveDpr({ still = 1, coarse = false, saved = null, progressive = true } = {}) {
  if (!progressive) return still;
  const v = saved === null || saved === "" ? NaN : Number(saved);
  return clampDpr(v >= 1 ? v : coarse ? 1 : still, 1, still);
}

/** Bildabstände in Bewegung (ms) zu langsam: p75 über max(28, 1,5 × refreshMs) (Senk-Schwelle von adaptMoveDpr). */
export function moveTooSlow(samples, refreshMs = 1000 / 60) {
  const f = refreshMs > 0 ? refreshMs : 1000 / 60;
  return quantile(samples, 0.75) > Math.max(28, f * 1.5);
}

/**
 * Bewegungs-Auflösung nach Bildabständen in Bewegung (ms): herunter bei p75 > max(28, 1,5 × refreshMs), hinauf bei p75 ≤
 * 1,25 × refreshMs (rAF-Takt), nie auf slowAt (kein Pendeln); Pause pauseMs seit lastChange, Grenzen min..max.
 */
export function adaptMoveDpr(cur, samples, { min = 1, max = 2, refreshMs = 1000 / 60, step = 0.25, now = 0, lastChange = -Infinity, pauseMs = 10000, minSamples = 20, slowAt = Infinity } = {}) {
  const clamp = (v) => clampDpr(v, min, max);
  const c = clamp(cur);
  if (!samples || samples.length < minSamples || now - lastChange < pauseMs) return c;
  const f = refreshMs > 0 ? refreshMs : 1000 / 60;
  if (moveTooSlow(samples, f)) return clamp(c - step);
  return quantile(samples, 0.75) <= f * 1.25 && c + step < slowAt - 1e-6 ? clamp(c + step) : c;
}

/**
 * Möbel innen ausblenden, solange das Dach drauf ist und man von oben schaut (sieht man ohnehin nicht,
 * kostet aber viele Zeichenaufrufe). Flacher Blick (durch Fenster) zeigt sie weiter.
 */
export function lodState(polar, roofShown, profile) {
  return { hideInterior: !!profile?.cullInterior && !!roofShown && polar < 1.15 };
}

/** „HH:MM“ → Minuten seit Mitternacht, sonst null. */
export function parseClock(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}

/**
 * Ruhemodus, Pause und Dimmen (settings.kiosk, dieses Gerät). Ruhe (idleMin): im Wandtablet-Modus ohne Angabe 5 min. Pause
 * (pauseMin, nur ohne Wandtablet-Modus): Hintergrund-Animationen anhalten, auf Touch-Geräten ohne Angabe nach 10 min.
 * @returns {{idleMs: number, pauseMs: number, dimFrom: number|null, dimTo: number|null, dimLevel: number}}
 */
export function normalizeIdle(cfg, { kiosk = false, coarse = false } = {}) {
  const mins = (raw, def) => (raw === undefined || raw === null || raw === "" ? def : Math.max(0, Math.min(240, Number(raw) || 0)));
  const min = mins(cfg?.idleMin, kiosk ? 5 : 0);
  const pause = kiosk ? 0 : mins(cfg?.pauseMin, coarse ? 10 : 0);
  const dimFrom = parseClock(cfg?.dimFrom);
  const dimTo = parseClock(cfg?.dimTo);
  const lvl = Number(cfg?.dimLevel);
  return { idleMs: min * 60000, pauseMs: pause * 60000, dimFrom: dimFrom !== null && dimTo !== null ? dimFrom : null, dimTo: dimFrom !== null && dimTo !== null ? dimTo : null, dimLevel: Number.isFinite(lvl) && lvl > 0 ? Math.min(0.95, Math.max(0.2, lvl)) : 0.75 };
}

/** Liegt die Uhrzeit (Minuten) im Zeitraum von–bis? Auch über Mitternacht (22:00–06:00). */
export function inTimeRange(nowMin, from, to) {
  if (from === null || to === null || from === undefined || to === undefined || from === to) return false;
  return from < to ? nowMin >= from && nowMin < to : nowMin >= from || nowMin < to;
}

/** Ruhe nach idleMs ohne Eingabe (0 = nie). */
export function idleState(lastInput, now, idleMs) {
  return idleMs > 0 && now - lastInput >= idleMs ? "idle" : "active";
}
