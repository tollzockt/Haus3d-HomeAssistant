// Kleine 3D-Vorschaubilder der Möbel für die Auswahlliste im Editor.
// Ein einziger, kurzlebiger WebGL-Renderer zeichnet alle Typen nacheinander (in Häppchen, damit die
// Oberfläche nicht hängt); die Bilder bleiben als data:-URLs im Speicher. Eigene 3D-Modelle bekommen ihr
// Bild, sobald sie geladen sind (renderModelThumbs).

import * as THREE from "./vendor/three.module.min.js";
import { FURNITURE, buildFurniture, furnitureMaterials } from "./furniture.js";
import { loadModel } from "./models.js";

const SIZE = 96;
const cache = new Map(); // "stil:typ" bzw. "stil:model:kennung" -> data-URL
let job = null;
let chain = Promise.resolve();

/** Vorschaubild eines Typs (oder null, solange es noch nicht gerendert ist). */
export function furnitureThumb(type, style = "standard") {
  return cache.get(`${style}:${type}`) ?? null;
}

/** Vorschaubild eines eigenen 3D-Modells (oder null). */
export function modelThumb(id, style = "standard") {
  return cache.get(`${style}:model:${id}`) ?? null;
}

/** Aufnahmeraum mit Licht und Kamera; null ohne WebGL. shot(obj) gibt eine data-URL zurück, close() räumt auf. */
function studio(style) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null; // ohne WebGL keine Bilder, die Liste zeigt dann nur Namen
  }
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const M = furnitureMaterials(style);
  return {
    M,
    shot(obj) {
      scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(0.15, box.getSize(new THREE.Vector3()).length() / 2);
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02;
      camera.position.copy(center).add(new THREE.Vector3(0.55, 0.6, 0.85).normalize().multiplyScalar(dist));
      camera.lookAt(center);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      scene.remove(obj);
      obj.traverse((o) => o.geometry && !o.geometry.userData.keep && o.geometry.dispose());
      return url;
    },
    close() {
      renderer.dispose();
      renderer.forceContextLoss();
      for (const m of Object.values(M).flat()) m?.dispose?.();
    },
  };
}

/**
 * Rendert alle noch fehlenden Vorschaubilder. onThumb(type, url) wird je fertigem Bild aufgerufen.
 * @returns {Promise<void>}
 */
export function renderThumbs(onThumb = () => {}, style = "standard") {
  if (job) {
    job.listeners.add(onThumb);
    return job.done;
  }
  const listeners = new Set([onThumb]);
  const todo = Object.keys(FURNITURE).filter((t) => !cache.has(`${style}:${t}`));
  const done = new Promise((resolve) => {
    if (!todo.length) return resolve();
    const st = studio(style);
    if (!st) return resolve();
    const step = () => {
      // einige Bilder je Durchgang
      for (let k = 0; k < 6 && todo.length; k++) {
        const type = todo.shift();
        const [, w, d, h] = FURNITURE[type];
        const url = st.shot(buildFurniture({ id: type, type, x: 0, z: 0, rotation: 0, w, d, h, mount_y: 0 }, st.M, 0, h ? Math.max(h + 0.1, 0.5) : 2.5));
        cache.set(`${style}:${type}`, url);
        for (const fn of listeners) fn(type, url);
      }
      if (todo.length) setTimeout(step, 0);
      else {
        st.close();
        resolve();
      }
    };
    step();
  }).finally(() => {
    job = null;
  });
  job = { listeners, done };
  return done;
}

/**
 * Vorschaubilder für eigene 3D-Modelle (Kennungen): jedes Modell wird geladen, in seiner natürlichen Größe
 * gebaut und aufgenommen. onThumb(id, url) je fertigem Bild; Modelle, die sich nicht laden lassen, bleiben ohne Bild.
 */
export function renderModelThumbs(ids, onThumb = () => {}, style = "standard") {
  chain = chain
    .then(async () => {
      const todo = ids.filter((id) => !cache.has(`${style}:model:${id}`));
      if (!todo.length) return;
      await job?.done; // ein WebGL-Kontext zur Zeit
      let st = null;
      try {
        for (const id of todo) {
          let tpl;
          try {
            tpl = await loadModel(id);
          } catch {
            continue;
          }
          st ??= studio(style);
          if (!st) return;
          const [w, d, h] = tpl.size;
          const url = st.shot(buildFurniture({ id, type: "custom_model", model: id, x: 0, z: 0, rotation: 0, w, d, h, mount_y: 0 }, st.M, 0, Math.max(h + 0.1, 0.5)));
          cache.set(`${style}:model:${id}`, url);
          onThumb(id, url);
          await new Promise((r) => setTimeout(r, 0));
        }
      } finally {
        st?.close();
      }
    })
    .catch(() => {});
  return chain;
}
