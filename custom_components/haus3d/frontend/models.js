// Eigene 3D-Modelle im Browser: Liste der hochgeladenen Modelle, Laden und Lesen (GLB/glTF, OBJ, STL) mit
// Cache, Normieren (Einheit, Oben-Achse, Grundfläche mittig auf dem Ursprung, Unterkante auf 0, Vorderseite +z),
// Platzhalter beim Laden und Hochladen. Beim Import passiert nichts mit dem DOM; Rechnungen ohne Three.js
// stehen in model-fit.js.
//
// Das Möbel „custom_model“ baut zuerst synchron einen Platzhalter (oder gleich das Modell, wenn es schon im
// Cache liegt – dann flackert nichts bei jedem Neuaufbau der Szene) und hängt das Modell nach dem Laden ein.
// Danach melden sich die Zuhörer von onModelsChange("loaded"): die Szene zeichnet neu.

import * as THREE from "./vendor/three.module.min.js";
import { loadOnce } from "./lazy.js";
import { currentToken, touchAccess, withToken } from "./access.js";
import { MODEL_MAX_BYTES, MODEL_URL, defaultUp, fitScale, formatBytes, glbJson, gltfProblem, isModelId, modelExt, unitFactor, uploadMessage } from "./model-fit.js";

/** Ab so vielen Dreiecken gibt es im Cyberpunk-Stil keine Kantenlinien (Leistung). */
export const EDGE_TRIANGLES = 50000;
/** Nach einem Fehler erst nach dieser Zeit (ms) erneut versuchen. */
const RETRY_MS = 10000;

let source = null; // hass: fetchWithAuth, callWS
let metas = new Map(); // Kennung -> Angaben des Servers
let used = 0;
let limits = null;
let listed = false;
let listing = null;
const entries = new Map(); // Kennung -> {state: loading|ready|missing|error, promise, tpl, error, at}
const listeners = new Set();
let timer = null;
const pending = new Set();

// ------------------------------------------------------------------------------------ Verbindung und Meldungen

/** hass für Abrufe und Befehle (das echte Objekt von Home Assistant); keep: ein vorhandenes nicht ersetzen. */
export function setModelHass(hass, { keep = false } = {}) {
  if (hass && !(keep && source)) source = hass;
}

export const hasModelHass = () => !!source;

/**
 * hass für das Demo-Haus: Modelle nur lesen (Liste und Dateien per GET); Hochladen (POST), Umbenennen und Löschen werden
 * abgelehnt, bevor etwas den Server erreicht.
 */
export function readOnlyModelHass(real) {
  if (!real?.callWS) return real;
  const no = () => Promise.reject(Object.assign(new Error("Demo: eigene 3D-Modelle werden hier nicht geändert."), { code: "demo" }));
  const h = Object.create(real);
  h.callWS = (msg, ...rest) => (msg?.type === "haus3d/models/list" ? real.callWS(msg, ...rest) : no());
  if (typeof real.fetchWithAuth === "function") h.fetchWithAuth = (path, init, ...rest) => (String(init?.method ?? "GET").toUpperCase() === "GET" ? real.fetchWithAuth(path, init, ...rest) : no());
  return h;
}

/** Zuhören: fn("loaded") nach dem Laden/Fehler eines Modells, fn("list") nach einer neuen Liste. Gibt „abmelden“ zurück. */
export function onModelsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(kind) {
  pending.add(kind);
  if (timer) return;
  // gebündelt und nach den Rückrufen der Möbel (die hängen das Modell ein), nicht davor
  timer = setTimeout(() => {
    timer = null;
    const kinds = [...pending];
    pending.clear();
    for (const fn of [...listeners]) {
      for (const k of kinds) {
        try {
          fn(k);
        } catch (err) {
          console.error("Haus 3D: Modelle", err);
        }
      }
    }
  }, 0);
}

// ------------------------------------------------------------------------------------ Liste

export const modelList = () => [...metas.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
export const modelMeta = (id) => metas.get(id) ?? null;
export const modelsLoaded = () => listed;
export const modelLimits = () => limits;
export const modelsUsedBytes = () => used;

function apply(res) {
  metas = new Map((res?.models ?? []).map((m) => [m.id, m]));
  used = Number(res?.used) || 0;
  limits = res?.limits ?? limits;
  listed = true;
  for (const [id, e] of [...entries]) {
    if (!metas.has(id)) forgetModel(id); // gelöscht
    else if (e.state === "missing" && !metas.get(id).missing) entries.delete(id); // wieder da: neu versuchen
  }
  notify("list");
  return res;
}

/** Liste vom Server holen (gleichzeitige Aufrufe teilen sich eine Anfrage). */
export function refreshModels() {
  if (!source) return Promise.reject(new Error("Keine Verbindung zu Home Assistant"));
  listing ??= source
    .callWS({ type: "haus3d/models/list" })
    .then(apply)
    .finally(() => (listing = null));
  return listing;
}

const ensureList = () => (listed ? Promise.resolve() : refreshModels());

async function command(msg) {
  if (!source) throw new Error("Keine Verbindung zu Home Assistant");
  return apply(await source.callWS(withToken(msg)));
}

export const renameModel = (id, name) => command({ type: "haus3d/models/rename", model_id: id, name });

export async function deleteModel(id) {
  await command({ type: "haus3d/models/delete", model_id: id });
  forgetModel(id);
}

// ------------------------------------------------------------------------------------ Lesen und Normieren

const PLAIN = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.7 }); // Ersatz, bis die Szene ihren Stoff einsetzt
PLAIN.userData.keep = true;

// Die Loader (GLTF 108 KB, OBJ, STL) erst laden, wenn wirklich eine Modelldatei gelesen wird
const loaders = {
  gltf: () => loadOnce("loader-gltf", () => import("./vendor/GLTFLoader.js")),
  obj: () => loadOnce("loader-obj", () => import("./vendor/OBJLoader.js")),
  stl: () => loadOnce("loader-stl", () => import("./vendor/STLLoader.js")),
};

/** Rohdaten lesen: {object, plain} – plain = ohne eigene Farben (STL, OBJ), die Szene setzt den Stoff ein. */
export async function parseModel(buffer, ext) {
  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await loaders.gltf();
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    const object = gltf.scene ?? gltf.scenes?.[0];
    if (!object) throw new Error("Das Modell enthält keine Szene.");
    const drop = [];
    object.traverse((o) => (o.isLight || o.isCamera) && drop.push(o));
    for (const o of drop) o.parent?.remove(o);
    return { object, plain: false };
  }
  if (ext === "obj") {
    const { OBJLoader } = await loaders.obj();
    const group = new OBJLoader().parse(new TextDecoder().decode(buffer));
    const drop = [];
    group.traverse((o) => (o.isLine || o.isPoints) && drop.push(o));
    for (const o of drop) o.parent?.remove(o);
    return { object: group, plain: true };
  }
  if (ext === "stl") {
    const { STLLoader } = await loaders.stl();
    const geometry = new STLLoader().parse(buffer);
    geometry.deleteAttribute("normal");
    geometry.computeVertexNormals(); // Flächennormalen aus den Dreiecken (die gespeicherten sind oft 0)
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, PLAIN));
    return { object: group, plain: true };
  }
  throw new Error("Diese Dateiart wird nicht unterstützt.");
}

function countTriangles(object) {
  let n = 0;
  object.traverse((o) => {
    if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count ?? 0)) / 3;
  });
  return Math.round(n);
}

/** Ausdehnung [x, y, z] der Datei in Dateiachsen (Einheit 1 = Meter). */
export function rawExtent(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) throw new Error("Das Modell enthält nichts Sichtbares.");
  const s = box.getSize(new THREE.Vector3());
  return [s.x, s.y, s.z];
}

/**
 * Vorlage bauen: Oben-Achse nach Y drehen, Einheit nach Metern, Grundfläche mittig auf (0, 0), Unterkante auf 0.
 * size = [Breite, Tiefe, Höhe] in m. Geometrien und Stoffe gehören der Vorlage und werden von der Szene nicht
 * freigegeben (userData.keep), nur von forgetModel.
 */
export function normalizeModel(parsed, { unit = "m", up = "y" } = {}) {
  const pivot = new THREE.Group();
  pivot.add(parsed.object);
  if (up === "z") pivot.rotation.x = -Math.PI / 2;
  pivot.scale.setScalar(unitFactor(unit));
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot, true);
  if (box.isEmpty()) throw new Error("Das Modell enthält nichts Sichtbares.");
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  pivot.position.set(-center.x, -box.min.y, -center.z);
  const holder = new THREE.Group();
  holder.add(pivot);
  holder.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.userData.keep = true;
    for (const m of [].concat(o.material ?? [])) m.userData.keep = true;
  });
  const r = (v) => Math.round(v * 10000) / 10000;
  return { object: holder, plain: parsed.plain, size: [r(size.x), r(size.z), r(size.y)], tris: countTriangles(holder) };
}

/** Datei prüfen und messen (vor dem Hochladen): {ext, raw: [x, y, z], tris, bytes}. Wirft Fehler mit deutscher Meldung. */
export async function inspectFile(file) {
  const ext = modelExt(file?.name);
  if (!ext) throw new Error("Diese Dateiart geht nicht – erlaubt sind .glb, .gltf, .obj und .stl.");
  if (!file.size) throw new Error("Die Datei ist leer.");
  if (file.size > MODEL_MAX_BYTES) throw new Error(`Die Datei ist zu groß (${formatBytes(file.size)}, höchstens ${formatBytes(MODEL_MAX_BYTES)}).`);
  const buffer = await file.arrayBuffer();
  if (ext === "glb" || ext === "gltf") {
    let doc = null;
    try {
      doc = ext === "glb" ? glbJson(buffer) : JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      /* ungültig: Meldung unten */
    }
    const problem = gltfProblem(doc, ext);
    if (problem) throw new Error(problem.message);
  }
  let parsed;
  try {
    parsed = await parseModel(buffer, ext);
  } catch (err) {
    throw new Error(`Die Datei ließ sich nicht lesen (${err?.message ?? err}).`);
  }
  try {
    return { ext, raw: rawExtent(parsed.object), tris: countTriangles(parsed.object), bytes: file.size };
  } finally {
    disposeObject(parsed.object);
  }
}

function disposeObject(object) {
  object.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      if (m !== PLAIN) m.dispose();
    }
  });
}

// ------------------------------------------------------------------------------------ Laden mit Cache

async function fetchBuffer(id) {
  const path = `${MODEL_URL}/${id}`;
  let res = null;
  if (source?.fetchWithAuth) res = await source.fetchWithAuth(path, {});
  else if (source?.auth?.data?.access_token) res = await fetch(path, { headers: { Authorization: `Bearer ${source.auth.data.access_token}` } });
  if (!res) throw new Error("Keine Verbindung zu Home Assistant");
  if (!res.ok) throw Object.assign(new Error(res.status === 404 ? "Dieses Modell gibt es nicht (mehr)" : `Das Modell ließ sich nicht laden (Status ${res.status})`), { code: res.status === 404 ? "missing" : "http" });
  return res.arrayBuffer();
}

/** Vorlage eines Modells (einmal geladen, von allen Möbeln geteilt). Verwirft mit .code "missing", wenn es das Modell nicht gibt. */
export function loadModel(id) {
  let e = entries.get(id);
  if (e && (e.state !== "error" || Date.now() - e.at < RETRY_MS)) return e.promise;
  e = { state: "loading", promise: null, tpl: null, error: null, at: Date.now() };
  entries.set(id, e);
  e.promise = (async () => {
    await ensureList();
    const meta = metas.get(id);
    if (!meta || meta.missing) throw Object.assign(new Error("Dieses Modell gibt es nicht (mehr)"), { code: "missing" });
    const buffer = await fetchBuffer(id);
    let parsed;
    try {
      parsed = await parseModel(buffer, meta.ext);
    } catch (err) {
      throw Object.assign(new Error(`Das Modell ließ sich nicht lesen (${err?.message ?? err})`), { code: "parse" });
    }
    return normalizeModel(parsed, { unit: meta.unit, up: meta.up || defaultUp(meta.ext) });
  })().then(
    (tpl) => {
      if (entries.get(id) !== e) {
        disposeTemplate(tpl); // inzwischen vergessen (gelöscht)
        throw Object.assign(new Error("Dieses Modell gibt es nicht (mehr)"), { code: "missing" });
      }
      Object.assign(e, { state: "ready", tpl });
      return tpl;
    },
    (err) => {
      Object.assign(e, { state: err.code === "missing" ? "missing" : "error", error: err, at: Date.now() });
      notify("loaded");
      throw err;
    },
  );
  e.promise.catch(() => {}); // Fehler zeigt der Platzhalter, nicht die Konsole
  return e.promise;
}

/** Vorlage, wenn schon geladen, sonst null. */
export const peekModel = (id) => (entries.get(id)?.state === "ready" ? entries.get(id).tpl : null);

/** "ready", "loading", "missing" (gibt es nicht), "error" oder "idle" (noch nicht angefragt). */
export function modelState(id) {
  const e = entries.get(id);
  if (e) return e.state;
  return listed && !metas.has(id) ? "missing" : "idle";
}

export const modelError = (id) => entries.get(id)?.error?.message ?? null;

/** Gemessene Größe [b, t, h] in m, wenn geladen. */
export const loadedSize = (id) => peekModel(id)?.size ?? null;

export function disposeTemplate(tpl) {
  tpl.object.traverse((o) => {
    if (o.geometry) {
      edgeCache.get(o.geometry)?.dispose();
      o.geometry.dispose();
    }
    for (const m of [].concat(o.material ?? [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      if (m !== PLAIN) m.dispose();
    }
  });
}

/** Modell aus dem Cache nehmen (gelöscht): GPU-Speicher freigeben. */
export function forgetModel(id) {
  const e = entries.get(id);
  entries.delete(id);
  if (e?.tpl) disposeTemplate(e.tpl);
  notify("loaded");
}

/** Alles zurücksetzen (Tests). */
export function resetModels() {
  for (const id of [...entries.keys()]) forgetModel(id);
  metas = new Map();
  used = 0;
  limits = null;
  listed = false;
  listing = null;
  source = null;
}

// ------------------------------------------------------------------------------------ Hochladen

/**
 * Modell zum Server schicken. info: {name, unit, up, size, thumb} (size = [b, t, h] in m, gemessen; thumb = kleines
 * Vorschaubild als data:-URL, im Browser gerendert, siehe thumbs.js). Das Token steht vor der Datei im Formular (der
 * Server liest die Datei erst nach gültiger Freigabe). Gibt die Angaben des Modells zurück.
 */
export async function uploadModel(file, { name, unit = "m", up = null, size = null, thumb = null } = {}) {
  if (!source?.fetchWithAuth) throw new Error("Keine Verbindung zu Home Assistant");
  const form = new FormData();
  const token = currentToken();
  if (token) {
    touchAccess();
    form.append("token", token);
  }
  form.append("name", name ?? "");
  form.append("unit", unit);
  if (up) form.append("up", up);
  if (size) form.append("size_m", size.join(","));
  if (thumb) form.append("thumb", thumb);
  form.append("file", file, file.name);
  let res;
  try {
    res = await source.fetchWithAuth(MODEL_URL, { method: "POST", body: form });
  } catch (err) {
    throw new Error(`Keine Verbindung zum Server (${err?.message ?? err}).`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* keine JSON-Antwort (Proxy?) */
  }
  if (!res.ok) throw Object.assign(new Error(uploadMessage(res.status, body)), { code: body?.code, status: res.status });
  await refreshModels().catch(() => {
    metas.set(body.model.id, body.model);
    notify("list");
  });
  return body.model;
}

// ------------------------------------------------------------------------------------ Szene: Platzhalter und Modell

const LOOKS = { loading: [0x5b9bd5, 0.18], none: [0x8a94a6, 0.14], missing: [0xe67e22, 0.22], error: [0xd9534f, 0.22] };
const phMats = {};
function placeholderMats(kind) {
  if (!phMats[kind]) {
    const [color, opacity] = LOOKS[kind] ?? LOOKS.none;
    phMats[kind] = { fill: new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), line: new THREE.LineBasicMaterial({ color }) };
    phMats[kind].fill.userData.keep = phMats[kind].line.userData.keep = true;
  }
  return phMats[kind];
}

/** Platzhalter: halbtransparenter Quader mit Drahtrahmen in der Farbe des Zustands (userData.look(kind) wechselt sie). */
export function placeholder(w, d, h, kind = "loading") {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(Math.max(w, 0.02), Math.max(h, 0.02), Math.max(d, 0.02));
  const m = placeholderMats(kind);
  const fill = new THREE.Mesh(geo, m.fill);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), m.line);
  fill.position.y = lines.position.y = Math.max(h, 0.02) / 2;
  fill.userData.noEdges = fill.userData.noShadow = true;
  g.add(fill, lines);
  g.userData.placeholder = kind;
  g.userData.look = (next) => {
    const n = placeholderMats(next);
    fill.material = n.fill;
    lines.material = n.line;
    g.userData.placeholder = next;
  };
  return g;
}

const edgeCache = new WeakMap(); // Geometrie -> Kanten (je Modell einmal berechnet)
function edgesOf(geometry) {
  let e = edgeCache.get(geometry);
  if (!e) {
    e = new THREE.EdgesGeometry(geometry, 30);
    e.userData.keep = true;
    edgeCache.set(geometry, e);
  }
  return e;
}

/** Eingepasste Kopie der Vorlage (teilt Geometrie und Stoffe) im Einheitsrahmen der Möbel. */
export function instantiate(tpl, w, d, h, fit, M) {
  const [sx, sy, sz] = fitScale(tpl.size, [w, d, h], fit);
  const obj = tpl.object.clone(true);
  const edges = !!M?.edge && tpl.tris <= EDGE_TRIANGLES;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (tpl.plain && M) o.material = M.light; // STL/OBJ: Farbe des Möbels (bzw. Standard), im Cyberpunk-Stil dunkel mit Leuchten
    o.userData.noEdges = true; // furniture.js zeichnet keine Kanten dazu (ungecacht, ohne Grenze)
    if (edges) o.add(new THREE.LineSegments(edgesOf(o.geometry), M.edge));
  });
  const inst = new THREE.Group();
  inst.add(obj);
  inst.scale.set(sx, sy, sz);
  inst.userData.customModel = true;
  return inst;
}

/** Inhalt des Möbels „custom_model“ (aus buildModel): Modell aus dem Cache oder Platzhalter, der nach dem Laden ersetzt wird. */
export function buildCustomModel(g, w, d, h, M, item = {}) {
  const id = item.model;
  const fit = item.fit === "stretch" ? "stretch" : "keep";
  if (!isModelId(id)) {
    g.add(placeholder(w, d, h, "none"));
    return;
  }
  const tpl = peekModel(id);
  if (tpl) {
    g.add(instantiate(tpl, w, d, h, fit, M));
    return;
  }
  const state = modelState(id);
  const ph = placeholder(w, d, h, state === "missing" ? "missing" : state === "error" ? "error" : "loading");
  g.add(ph);
  loadModel(id)
    .then((t) => {
      if (ph.parent !== g) return; // Möbel inzwischen neu gebaut
      const inst = instantiate(t, w, d, h, fit, M);
      // wie buildFurniture / die Szene: alle Teile kennen ihr Möbel bzw. ihre Entität (Anklicken, Zustände)
      const { furniture, entity } = g.userData;
      inst.traverse((o) => {
        if (furniture) o.userData.furniture = furniture;
        if (entity) o.userData.entity = entity;
      });
      g.remove(ph);
      ph.traverse((o) => o.geometry?.dispose());
      g.add(inst);
      notify("loaded");
    })
    .catch((err) => ph.userData.look(err?.code === "missing" ? "missing" : "error"));
}
