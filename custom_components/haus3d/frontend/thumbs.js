// Kleine 3D-Vorschaubilder der Möbel für die Auswahlliste im Editor.
// Ein einziger, kurzlebiger WebGL-Renderer zeichnet alle Typen nacheinander (in Häppchen, damit die
// Oberfläche nicht hängt); die Bilder bleiben als data:-URLs im Speicher. Eigene 3D-Modelle bekommen ihr
// Bild einmal beim Hochladen (modelFileThumb); der Server speichert es bei den Angaben des Modells, der Katalog
// lädt dafür keine Modelldatei.

import * as THREE from "./vendor/three.module.min.js";
import { FURNITURE, buildFurniture, furnitureMaterials } from "./furniture.js";
import { MODEL_THUMB_MAX, defaultUp, modelExt } from "./model-fit.js";
import { disposeTemplate, instantiate, normalizeModel, parseModel } from "./models.js";

const SIZE = 96;
const cache = new Map(); // "stil:typ" -> data-URL
let job = null;

/** Vorschaubild eines Typs (oder null, solange es noch nicht gerendert ist). */
export function furnitureThumb(type, style = "standard") {
  return cache.get(`${style}:${type}`) ?? null;
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
 * Rendert die noch fehlenden Vorschaubilder der gewünschten Typen (types; ohne Angabe alle – das sind Hunderte und
 * dauert, darum fordert der Katalog nur an, was gerade zu sehen ist). onThumb(type, url) wird je fertigem Bild aufgerufen.
 * Läuft schon ein Durchgang, gilt ab jetzt die neue Wunschliste: was noch wartet und nicht mehr gewünscht wird
 * (zugeklappte Kategorie, geänderte Suche), entfällt; bereits fertige Bilder bleiben im Speicher. Wer etwas anzeigt,
 * fordert die sichtbaren Typen also bei jeder Änderung erneut an.
 * @param {(type: string, url: string) => void} [onThumb]
 * @param {string} [style]
 * @param {string[] | null} [types]
 * @returns {Promise<void>}
 */
export function renderThumbs(onThumb = () => {}, style = "standard", types = null) {
  const todo = (types ?? Object.keys(FURNITURE)).filter((t, i, all) => FURNITURE[t] && all.indexOf(t) === i && !cache.has(`${style}:${t}`)).map((t) => [style, t]);
  if (job && !job.finished) {
    job.listeners.add(onThumb);
    job.todo = todo;
    return job.done;
  }
  if (!todo.length) return Promise.resolve();
  const j = { listeners: new Set([onThumb]), todo, done: null, finished: false };
  j.done = new Promise((resolve) => {
    let st = null;
    let stStyle = null;
    const step = () => {
      // einige Bilder je Durchgang
      for (let k = 0; k < 6 && j.todo.length; k++) {
        const [sty, type] = j.todo.shift();
        if (cache.has(`${sty}:${type}`)) continue;
        if (!st || stStyle !== sty) {
          st?.close();
          st = studio(sty);
          stStyle = sty;
          if (!st) {
            j.todo.length = 0; // ohne WebGL keine Bilder
            break;
          }
        }
        const [, w, d, h] = FURNITURE[type];
        const url = st.shot(buildFurniture({ id: type, type, x: 0, z: 0, rotation: 0, w, d, h, mount_y: 0 }, st.M, 0, h ? Math.max(h + 0.1, 0.5) : 2.5));
        cache.set(`${sty}:${type}`, url);
        for (const fn of j.listeners) fn(type, url);
      }
      if (j.todo.length) setTimeout(step, 0);
      else {
        j.finished = true; // ein Aufruf noch im selben Durchlauf startet einen neuen Durchgang
        st?.close();
        resolve();
      }
    };
    step();
  }).finally(() => {
    if (job === j) job = null;
  });
  job = j;
  return j.done;
}

/** Läuft gerade ein Durchgang (und hält damit einen WebGL-Kontext)? */
export const thumbsBusy = () => !!job && !job.finished;

/**
 * Offenen Durchgang beenden (nichts Sichtbares mehr, Editor zu): was noch wartet, entfällt; der Kontext der Vorschau wird
 * im nächsten Schritt freigegeben. Bereits fertige Bilder bleiben im Speicher.
 */
export function stopThumbs() {
  if (job && !job.finished) job.todo = [];
}

/**
 * Vorschaubild (kleines PNG als data:-URL) für eine Modelldatei, die gleich hochgeladen wird: Datei lesen, mit der
 * gewählten Einheit und Oben-Achse in natürlicher Größe bauen und aufnehmen; danach ist alles wieder freigegeben.
 * Ohne WebGL oder bei einem Fehler null (das Modell wird dann ohne Bild hochgeladen, die Kachel zeigt ein Symbol).
 */
export async function modelFileThumb(file, { unit = "m", up = null } = {}) {
  const ext = modelExt(file?.name);
  if (!ext) return null;
  await job?.done; // ein WebGL-Kontext zur Zeit
  let tpl = null;
  let st = null;
  try {
    const parsed = await parseModel(await file.arrayBuffer(), ext);
    tpl = normalizeModel(parsed, { unit, up: up || defaultUp(ext) });
    st = studio("standard");
    if (!st) return null;
    const [w, d, h] = tpl.size;
    const g = new THREE.Group();
    g.add(instantiate(tpl, w, d, h, "keep", st.M));
    const url = st.shot(g);
    return url.length <= MODEL_THUMB_MAX ? url : null;
  } catch {
    return null;
  } finally {
    st?.close();
    if (tpl) disposeTemplate(tpl);
  }
}
