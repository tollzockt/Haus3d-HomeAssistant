// Bildschleife (Mixin für HouseScene) mit progressiver Auflösung (perf.js): ruhend min(devicePixelRatio, Stufe.maxDpr), in
// Bewegung die Bewegungs-Auflösung (je Gerät, haus3d.moveDpr), umgeschaltet nur in _frame vor dem einzigen render().
// Hintergrund-Animationen im Takt perf.js:ambientFps, nur sichtbar und im Bild; Blitz allein zeichnet nur beim Wechsel.

import * as THREE from "./vendor/three.module.min.js";
import { BOLT_FPS, adaptMoveDpr, ambientFps, ambientInterval, initialMoveDpr, moveTooSlow, progressiveDpr, refreshFromGaps, renderReason, shadowNeeded, shouldRender } from "./perf.js";

const KEY = "haus3d.moveDpr";

export const SceneLoop = {
  /** Aus dem Konstruktor: gespeicherte Bewegungs-Auflösung, start/end der Steuerung. */
  _initLoop() {
    let saved = null; // alter Schlüssel haus3d.dpr: löschen
    try {
      if (localStorage.getItem("haus3d.dpr") !== null) localStorage.removeItem("haus3d.dpr");
      saved = localStorage.getItem(KEY);
    } catch {
      /* ohne Speicher */
    }
    // skip: Bilder nach einer Umschaltung ohne Messung; slowAt: zu langsam (5 min nicht anheben); slow: zuletzt beim Drehen
    // zu langsam gemessen (Hintergrund-Takt 12 statt 15)
    this._loop = { coarse: !!window.matchMedia?.("(pointer: coarse)").matches, saved, still: 1, move: 1, prog: progressiveDpr(null, { type: "reset" }), samples: [], skip: 0, lastChange: -Infinity, slowAt: Infinity, slowSince: 0, slow: false, prevAt: null, gap: 0, refreshMs: 1000 / 60 };
    this._applyDpr();
    for (const type of ["start", "end"]) {
      this.controls.addEventListener(type, () => {
        this._loop.prog = progressiveDpr(this._loop.prog, { type, now: performance.now() });
        if (type === "end") this._progWake();
      });
    }
  },

  /** Ruhe- und Bewegungs-Auflösung; abweichend sofort umstellen (resize zeichnet). */
  _applyDpr() {
    const L = this._loop;
    const still = Math.min(window.devicePixelRatio || 1, this.quality?.maxDpr ?? 2);
    if (still !== L.still) L.slowAt = Infinity;
    L.still = still;
    L.move = initialMoveDpr({ still, coarse: L.coarse, saved: L.saved, progressive: this.flags.progressive });
    this._setDpr(this._running && L.prog.mode === "moving" ? L.move : still);
  },

  _setDpr(v) {
    if (this.renderer.getPixelRatio() === v) return;
    this.renderer.setPixelRatio(v);
    this.resize();
  },

  /** Hinauf-Zeitgeber: ruft nur _kick. */
  _progWake() {
    const L = this._loop;
    clearTimeout(L.timer);
    const at = L.prog.wakeAt;
    if (this._running && at !== null && !this._raf) L.timer = setTimeout(() => this._kick(), Math.max(0, at - performance.now()));
  },

  /** Kamerabewegung seit dem letzten bewegten Bild (Bogenmaß). */
  _viewDelta() {
    const L = this._loop;
    const { quaternion: q, position: p } = this.camera;
    const d = L.q ? Math.max(2 * Math.acos(Math.min(1, Math.abs(L.q.dot(q)))), L.p.distanceTo(p) / Math.max(0.5, p.distanceTo(this.controls.target))) : Infinity;
    L.q = q.clone();
    L.p = p.clone();
    return d;
  },

  /**
   * Bildschirmtakt aus den rAF-Abständen ohne Bild (einmal, perf.js:refreshFromGaps). Endet mit stop() (Editor zu,
   * Panel weg, geparkt): eine entsorgte Szene hielte sonst über die rAF-Rückrufe samt Editor-Oberfläche noch eine Weile
   * fest; start() misst neu.
   */
  _probeRefresh() {
    const L = this._loop;
    L.probed = true;
    const gaps = [];
    let [last, r0, n] = [0, -1, 0];
    const step = (t) => {
      L.probeRaf = null;
      if (r0 === this.stats.renders && t > last) gaps.push(t - last);
      last = t;
      r0 = this.stats.renders;
      if (++n < 40) L.probeRaf = requestAnimationFrame(step);
      else L.refreshMs = refreshFromGaps(gaps) ?? L.refreshMs;
    };
    L.probeTimer = setTimeout(() => {
      L.probeTimer = null;
      L.probeRaf = requestAnimationFrame(step);
    }, 2000);
  },

  /** Laufende Takt-Messung abbrechen; nicht fertig gemessen: beim nächsten start() noch einmal. */
  _stopProbe() {
    const L = this._loop;
    if (L.probeTimer == null && L.probeRaf == null) return;
    clearTimeout(L.probeTimer);
    if (L.probeRaf != null) cancelAnimationFrame(L.probeRaf);
    L.probeTimer = L.probeRaf = null;
    L.probed = false;
  },

  start() {
    if (this._running || this._parked) return;
    this._running = true;
    const L = this._loop;
    L.prog = progressiveDpr(null, { type: "reset" });
    L.prevAt = null;
    // Bildabstand wie bei einer frischen Szene: sonst zählte das erste Bild die Pause (Tab, Bildschirm aus, Editor) als
    // Abstand, und die nächste Geste schaltete gleich nach dem Loslassen auf ruhend
    L.chained = L.drove = false;
    L.gap = 0;
    this._setDpr(L.still); // immer ruhend beginnen; resize() zeichnet sofort
    if (!L.probed) this._probeRefresh();
    this._kick();
  },

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    clearTimeout(this._timer);
    this._timer = null;
    clearTimeout(this._loop.timer);
    this._stopProbe();
  },

  /**
   * Parken, solange der Editor die Fläche verdeckt: angehalten und 1×1 (gibt den Bildspeicher frei); resize() merkt sich
   * dann nur _dirty. Ausparken: volle Größe, dann start() – das erste Bild kommt vor dem nächsten Bildaufbau.
   */
  park(on) {
    if (on) {
      this.stop();
      this._parked = true;
      this.renderer.setSize(1, 1, false);
    } else if (this._parked) {
      this._parked = false;
      this.resize();
      this.start();
    }
  },

  /** Teile bewegt (Live-Vorschau im Editor): zählt wie Fahrt und Begehen als Bewegung (Bewegungs-Auflösung). */
  _partsMoved() {
    this._viewChanged = true;
    this._viewDriven = performance.now();
  },

  _kick() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (!this._running || this._raf) return;
    this._raf = requestAnimationFrame(() => this._frame());
  },

  /** Bildabstand in Bewegung messen, Bewegungs-Auflösung anpassen (gilt ab diesem Bild). */
  _adaptMove(now) {
    const L = this._loop;
    if (L.skip > 0) {
      L.skip--;
      return;
    }
    if (!this.flags.progressive || L.prevAt === null) return;
    const s = L.samples;
    s.push(now - L.prevAt);
    if (s.length < 20) return;
    L.slow = moveTooSlow(s, L.refreshMs);
    if (now - L.slowSince > 300000) L.slowAt = Infinity;
    const cur = L.move;
    const next = adaptMoveDpr(cur, s, { max: L.still, refreshMs: L.refreshMs, now, lastChange: L.lastChange, slowAt: L.slowAt });
    s.length = 0;
    if (next === cur) return;
    if (next < cur) [L.slowAt, L.slowSince] = [Math.min(L.slowAt, cur), now];
    L.move = next;
    L.saved = String(next);
    L.lastChange = now;
    try {
      localStorage.setItem(KEY, L.saved);
    } catch {
      /* ohne Speicher */
    }
  },

  _frame() {
    this._raf = null;
    if (!this._running) return;
    const L = this._loop;
    // Begehen: ohne Steuerung (sie drehte die Kamera sonst zum Drehpunkt zurück)
    const moving = !this._walk && this.controls.update();
    // Animationen nach echter Zeit (bei wenigen Bildern pro Sekunde nicht langsamer, nur ruckeliger)
    const now = performance.now();
    const animDt = Math.min(0.5, (now - (this._lastAnim ?? now)) / 1000);
    this._lastAnim = now;
    const animating = this._animating && this._animate(animDt);
    // Hintergrund-Animationen nur, wenn sichtbar (Ebene an, im Bild) und die Ansicht nicht ruht
    L.frustum = null;
    const flowing = !this._frozen && this.flow && this.flow.speed > 0 && this.layers.flow !== false && this.isFloorVisible(this.flow.floorId) && this._inView(this.flow.line);
    const weatherOn = !this._frozen && !!this._weather && this.layers.weather !== false;
    const precip = weatherOn && !!this.weather;
    const lightning = weatherOn && this._weather.lightning;
    const flash = this._stepBolt(lightning, now);
    const houseFlow = this._houseFlowActive();
    const pipesOn = this._pipesActive();
    const ambient = flowing || precip || houseFlow || pipesOn;
    const bolt = lightning && !ambient; // Blitz ohne Niederschlag: nur Takt, Bild beim Aufleuchten und Erlöschen
    const interval = ambientInterval(ambient ? this._ambientFps() : BOLT_FPS);
    const moved = moving || this._viewChanged;
    const driven = this._viewDriven; // Zeit der letzten Fahrt-/Begehen-Bewegung (_viewMoved(true))
    this._viewDriven = 0;
    L.prog = progressiveDpr(L.prog, { type: "frame", now, moved, driven, motion: moved ? this._viewDelta() : 0, gap: L.gap });
    const inMove = moved && L.prog.mode === "moving";
    if (inMove) this._adaptMove(now);
    const r = this.renderer;
    const want = L.prog.mode === "moving" ? L.move : L.still;
    const switching = r.getPixelRatio() !== want;
    if (switching || shouldRender({ dirty: this._dirty || flash, moving, animating, ambient, now, lastRender: this._lastRender ?? -Infinity, interval })) {
      // Fluss und Wetter nur weiterrechnen, wenn auch gezeichnet wird (nach echter Zeit)
      const ambDt = Math.min(0.5, (now - (this._lastAmbient ?? now)) / 1000);
      this._lastAmbient = now;
      if (flowing) {
        const f = this.flow;
        f.phase = (f.phase + ambDt * f.speed) % 1;
        const n = f.dots.count;
        this._setDots(f.dots, Array.from({ length: n }, (_, i) => f.curve.getPointAt((f.phase + i / n) % 1)));
      }
      if (precip) this._stepWeather(ambDt);
      if (houseFlow) this._stepHouseFlow(ambDt);
      if (pipesOn) this._stepPipes(ambDt);
      // Bildabstand in Bewegung (Steuerung, Fahrt/Begehen in Folge): größter der letzten, abklingend
      if (L.chained || (driven && L.drove)) L.gap = Math.max(now - this._lastRender, 0.85 * L.gap);
      if (switching) {
        r.setPixelRatio(want); // leert die Zeichenfläche: gleich danach das Bild
        L.skip = 2;
      }
      this._draw(renderReason({ moving: moved, animating, dirty: this._dirty || switching, shadow: this._shadowDirty }));
      this._viewChanged = false;
      this._dirty = false;
      this._lastRender = now;
    }
    if (this._camDirty || moving) {
      this._camDirty = false;
      this.onCameraChange();
      this._lodCheck();
    }
    L.drove = !!driven;
    // weiter: sofort bei Bewegung, sonst Hintergrund-Animation im gedrosselten Takt, sonst schlafen
    L.chained = moving || animating || this._dirty;
    L.prevAt = L.chained && inMove && !switching ? now : null;
    if (L.chained) {
      this._kick();
      return;
    }
    if (ambient || bolt) {
      clearTimeout(this._timer);
      const from = ambient ? this._lastRender : now;
      this._timer = setTimeout(() => {
        this._timer = null;
        this._kick();
      }, Math.max(0, interval - (performance.now() - from)));
    }
    this._progWake();
  },

  /** Bilder/s der Hintergrund-Animationen (perf.js:ambientFps). */
  _ambientFps() {
    const L = this._loop;
    return ambientFps(this.quality, { coarse: L.coarse, slow: L.slow });
  },

  /** Sichtbar (mit allen Eltern) und im Bild (Hülle der Geometrie im Sichtkegel, einmal je Bild berechnet)? */
  _inView(obj) {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    const g = obj.geometry;
    if (!g) return true;
    const L = this._loop;
    if (!L.frustum) {
      const c = this.camera;
      c.updateMatrixWorld();
      L.frustum = (L.fr ??= new THREE.Frustum()).setFromProjectionMatrix((L.pm ??= new THREE.Matrix4()).multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    }
    if (!g.boundingSphere) g.computeBoundingSphere();
    return L.frustum.intersectsSphere((L.sp ??= new THREE.Sphere()).copy(g.boundingSphere).applyMatrix4(obj.matrixWorld));
  },

  /** Blitz ohne Zeichnen: ab und zu kurz hell; true beim Aufleuchten und Erlöschen. Aus (Ebene, Ruhe): sofort dunkel. */
  _stepBolt(on, now) {
    const dt = Math.min(0.5, (now - (this._lastBolt ?? now)) / 1000);
    this._lastBolt = on ? now : null;
    if (this._flash > 0 && (!on || (this._flash -= dt) <= 0)) {
      this._flash = 0;
      this._applyBackground();
      return true;
    }
    if (!on || this._flash > 0 || !(Math.random() < dt / 6)) return false;
    this._flash = 0.12;
    this.hemi.intensity += 2.5;
    return true;
  },

  /**
   * Ein Bild zeichnen (alle Bilder laufen hierüber): Zähler am Bildanfang leeren (Aufrufe mit Schattenpass), mit
   * Schatten-Marke die Schattenkarte neu. reason: perf.js:RENDER_REASONS.
   */
  _draw(reason) {
    const r = this.renderer;
    const sm = r.shadowMap;
    if (this._shadowDirty) {
      sm.needsUpdate = true;
      this._shadowDirty = false;
    }
    const shadow = shadowNeeded({ enabled: sm.enabled && this.sun.castShadow && !this.contextLost, always: sm.autoUpdate, dirty: sm.needsUpdate });
    r.info.reset();
    r.render(this.scene, this.camera);
    const st = this.stats;
    st.renders++;
    if (shadow) st.shadowRenders++;
    st.reasons[reason] = (st.reasons[reason] ?? 0) + 1;
    st.calls = r.info.render.calls;
    st.triangles = r.info.render.triangles;
    st[this._loop?.prog.mode === "moving" ? "dprMove" : "dprStill"] = r.getPixelRatio();
  },
};
