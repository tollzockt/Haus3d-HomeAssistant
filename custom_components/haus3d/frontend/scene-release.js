// Szene samt Renderer abgeben, ohne dass geteilte Objekte den Renderer festhalten. three.js hängt je Renderer einen
// „dispose“-Listener an jede Geometrie, jeden Stoff und jede Textur, die er zeichnet; renderer.dispose() nimmt sie
// nicht wieder ab. Nutzt die Szene Objekte, die länger leben als sie (Textur-Cache aus textures.js, Kontaktschatten-
// Textur, Vorlagen eigener 3D-Modelle), hält jeder dieser Listener den alten Renderer samt Leinwand, Kontext und
// Zwischenspeichern fest – beim Editor einmal je Öffnen.

import * as THREE from "./vendor/three.module.min.js";
import { sharedTextures } from "./textures.js";
import { sharedModelParts } from "./models.js";

/** Höchstens so tief werden Felder durchsucht (Szene → Stoff-Sammlung → Liste → Stoff). */
const DEPTH = 3;

const plain = (v) => v && typeof v === "object" && (Array.isArray(v) || v instanceof Map || v instanceof Set || Object.getPrototypeOf(v) === Object.prototype);

/**
 * Geometrien, Stoffe und Texturen in items: 3D-Objekte samt Kindern, Stoffe (mit ihren Texturen, auch in uniforms),
 * Geometrien, Texturen sowie einfache Objekte, Listen, Maps und Sets davon (bis DEPTH Ebenen).
 * @returns {Set<object>}
 */
export function threeResources(items) {
  const out = new Set();
  const seen = new Set();
  const tex = (t) => {
    if (t?.isTexture) out.add(t);
  };
  const mat = (m) => {
    if (out.has(m)) return;
    out.add(m);
    for (const v of Object.values(m)) tex(v);
    for (const u of Object.values(m.uniforms ?? {})) tex(u?.value);
  };
  const obj = (o) => {
    if (o.geometry?.isBufferGeometry) out.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) if (m?.isMaterial) mat(m);
    if (o.isScene) {
      tex(o.background);
      tex(o.environment);
    }
  };
  const add = (x, depth) => {
    if (!x || typeof x !== "object" || seen.has(x)) return;
    seen.add(x);
    if (x.isObject3D) x.traverse(obj);
    else if (x.isMaterial) mat(x);
    else if (x.isBufferGeometry || x.isTexture) out.add(x);
    else if (depth > 0 && plain(x)) for (const v of x instanceof Map || x instanceof Set ? x.values() : Object.values(x)) add(v, depth - 1);
  };
  for (const x of items) add(x, DEPTH);
  return out;
}

/**
 * dispose() aufrufen (räumt die Szene auf und gibt den Renderer frei) und danach die Listener dieses Renderers von
 * allen Objekten in items abnehmen, die weiterleben.
 *
 * Welche Listener dem Renderer gehören, zeigen frische Proben (three.js nutzt je Renderer und Art eine Funktion): eine
 * 1×1-Textur und ein Dreieck ohne Fläche mit eigener Geometrie und eigenem Stoff, einmal gezeichnet. Aus dem Aufräumen
 * ablesen ginge fehl, wenn die Szene ein Objekt entsorgt, das auch ein anderer Renderer zeichnet (modulweit geteilte
 * Blatt-Geometrie, Flammen-Stoffe): dessen Listener verschwindet dabei ebenfalls und würde sonst auch von den Vorlagen
 * genommen. Nur wenn die Proben nicht zeichnen (Kontext verloren), wird wie früher aus dem Aufräumen abgelesen.
 * Gelesen wird dafür `_listeners` von three.js (EventDispatcher), abgenommen über removeEventListener.
 * @returns {number} abgenommene Listener
 */
export function disposeReleasing(renderer, items, dispose) {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  tex.needsUpdate = true;
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const probes = [tex, geo, mat];
  try {
    renderer.initTexture(tex);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    renderer.render(new THREE.Scene().add(mesh), new THREE.Camera());
  } catch {
    /* ohne Kontext */
  }
  const mine = new Set(probes.flatMap((r) => [...(r._listeners?.dispose ?? [])]));
  for (const r of probes) r.dispose();
  const list = [...threeResources(items)];
  const before = mine.size < probes.length ? list.map((r) => [...(r._listeners?.dispose ?? [])]) : null;
  dispose();
  before?.forEach((fs, i) => {
    for (const f of fs) if (!list[i].hasEventListener("dispose", f)) mine.add(f);
  });
  let n = 0;
  for (const r of list) {
    for (const f of mine) {
      if (!r.hasEventListener("dispose", f)) continue;
      r.removeEventListener("dispose", f);
      n++;
    }
  }
  return n;
}

/**
 * HouseScene entsorgen (scene.dispose()) und ihren Renderer von allem lösen, was weiterlebt: Szenengraph und
 * Stoff-Sammlungen der Szene, Textur-Cache und Modell-Vorlagen.
 * @returns {number} abgenommene Listener
 */
export function disposeScene(sc) {
  return disposeReleasing(sc.renderer, [sc.scene, ...Object.values(sc), ...sharedTextures(), ...sharedModelParts()], () => {
    sc.dispose();
  });
}
