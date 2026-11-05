// Bildschleife (scene-loop.js) mit nachgebauter Szene: Nach stop()/start() (Tab verborgen, Bildschirm aus, Editor) beginnt
// der gemessene Bildabstand frisch, sonst zählte die Pause als Abstand und die erste Geste danach schaltete gleich nach dem
// Loslassen auf ruhend. Hintergrund-Takt am Tablet: 15, erst beim Drehen gemessen zu langsam 12 (auch mit Faktor 1).
import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";

const rafs = new Map();
let seq = 0;
globalThis.requestAnimationFrame = (fn) => (rafs.set(++seq, fn), seq);
globalThis.cancelAnimationFrame = (id) => rafs.delete(id);
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { devicePixelRatio: 2, matchMedia: (q) => ({ matches: q.includes("coarse") && window.coarse !== false }) };

const { SceneLoop } = await import("../../custom_components/haus3d/frontend/scene-loop.js");
const { resolveQuality } = await import("../../custom_components/haus3d/frontend/perf.js");

/** Szene mit allem, was die Bildschleife braucht; controls.spin: Drehung je update() (Dämpfung wie OrbitControls). */
function loopScene({ dpr = 2, coarse = true } = {}) {
  window.devicePixelRatio = dpr;
  window.coarse = coarse;
  store.clear();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(10, 18, 22);
  camera.lookAt(0, 0, 0);
  const on = { start: [], end: [] };
  let pr = 1;
  const sc = Object.assign(
    {
      camera,
      controls: {
        target: new THREE.Vector3(),
        spin: 0,
        addEventListener: (t, f) => on[t]?.push(f),
        fire: (t) => on[t].forEach((f) => f({ type: t })),
        update() {
          if (Math.abs(this.spin) < 1e-4) return !!(this.spin = 0);
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.spin);
          camera.lookAt(0, 0, 0);
          this.spin *= 0.88;
          return true;
        },
      },
      renderer: { getPixelRatio: () => pr, setPixelRatio: (v) => (pr = v), shadowMap: { enabled: false, autoUpdate: false, needsUpdate: false }, info: { reset() {}, render: { calls: 0, triangles: 0 } }, render() {} },
      quality: resolveQuality("auto", { coarse }),
      flags: { progressive: true },
      stats: { renders: 0, shadowRenders: 0, reasons: {} },
      sun: { castShadow: false },
      hemi: { intensity: 1 },
      layers: {},
      _dirty: true,
      onCameraChange() {},
      _lodCheck() {},
      _applyBackground() {},
      _houseFlowActive: () => false,
      _pipesActive: () => false,
      isFloorVisible: () => true,
      resize() {
        this._draw("neuzeichnen");
        this._dirty = false;
        this._kick();
      },
    },
    SceneLoop,
  );
  sc._initLoop();
  sc._loop.probed = true; // keine Takt-Messung (Zeitgeber)
  return sc;
}
/** Anstehende Bildaufbauten (rAF) ausführen, bis keiner mehr ansteht (höchstens n). */
function frames(n = 200) {
  let k = 0;
  while (rafs.size && k++ < n) {
    const list = [...rafs.values()];
    rafs.clear();
    for (const fn of list) fn();
  }
}

test("stop()/start(): der Bildabstand zählt die Pause nicht mit", () => {
  const sc = loopScene();
  sc.start();
  frames();
  // eine Tür-Animation läuft, als der Tab verborgen wird: das letzte Bild hat das nächste verkettet
  let n = 5;
  sc._animating = true;
  sc._animate = () => {
    sc._dirty = true;
    return --n > 0;
  };
  sc.redraw = () => {
    sc._dirty = true;
    sc._kick();
  };
  sc.redraw();
  frames(1);
  assert.equal(sc._loop.chained, true, "Bild verkettet");
  sc.stop();
  sc._animating = false;
  // 50 min verborgen
  sc._lastRender -= 3_000_000;
  sc._lastAnim -= 3_000_000;
  sc.start();
  // Wischgeste nach der Rückkehr: Bildabstand wie vorher (Echtzeit, wenige ms), nicht die Pause
  sc.controls.fire("start");
  sc.controls.spin = 0.05;
  sc._kick();
  frames(10);
  assert.ok(sc._loop.gap < 1000, `Bildabstand ${Math.round(sc._loop.gap)} ms`);
  sc.controls.fire("end");
  sc.stop();
});

test("Hintergrund-Takt am Tablet: ab Werk 15 (auch Faktor 1), beim Drehen gemessen zu langsam 12, wieder schnell 15", () => {
  for (const dpr of [1, 1.5, 2, 2.625]) {
    const sc = loopScene({ dpr });
    const L = sc._loop;
    assert.equal(L.still, Math.min(dpr, 1.5));
    assert.equal(L.move, 1);
    assert.equal(sc._ambientFps(), 15, `Faktor ${dpr} ab Werk`);
    /** 20 Bildabstände in Bewegung von ms Millisekunden (wie _frame: prevAt vom Bild davor). */
    const measure = (ms) => {
      let t = 100000 + L.samples.length;
      for (let i = 0; i < 20; i++) {
        L.prevAt = t;
        t += ms;
        sc._adaptMove(t);
      }
    };
    measure(40);
    assert.equal(sc._ambientFps(), 12, `Faktor ${dpr}: p75 40 ms`);
    assert.equal(L.move, 1, "Bewegungs-Auflösung schon am unteren Rand");
    measure(25);
    assert.equal(sc._ambientFps(), 15, `Faktor ${dpr}: p75 25 ms`);
  }
  // Desktop und andere Stufen: wie die Stufe
  const desk = loopScene({ dpr: 1, coarse: false });
  desk._loop.slow = true;
  assert.equal(desk._ambientFps(), desk.quality.ambientFps);
});
