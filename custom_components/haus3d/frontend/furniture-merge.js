// Möbel zusammenführen (nur Hauptansicht, live: false): Teile eines Stücks je Material zu einem Mesh, Cyberpunk-Kanten je
// Stück zu einem LineSegments (Stücke mit Glas: je Teil, damit sie wie vorher gegen das Glas sortiert werden). Spart
// Zeichenaufrufe, das Bild bleibt gleich. Ganz ausgelassen: Entität, eigenes 3D-Modell, Zustand (onState, curtain, tub,
// flames), geneigt/gekippt (Kontaktschatten). Einzeln bleibt jedes Teil mit Sonderrolle: Material-Array, durchsichtig,
// eigenes userData, Vorfahr mit userData oder ausgeblendet, Leuchtmittel, eigenes raycast, Instanzen, renderOrder, Name,
// Determinante ≤ 0, Geometrie mit keep. Gruppen nach Material, Attributen und Schatten, ab zwei Teilen. Die neue Box ist
// die Vereinigung der Teil-Boxen: Box3.setFromObject (Kontaktschatten) misst wie vorher. Ohne DOM, mit node testbar.

import * as THREE from "./vendor/three.module.min.js";

const MESH_RAYCAST = THREE.Mesh.prototype.raycast;
const LINE_RAYCAST = THREE.LineSegments.prototype.raycast;
const NO_HOOK = THREE.Object3D.prototype.onBeforeRender;
const NO_HOOK_AFTER = THREE.Object3D.prototype.onAfterRender;
const DEFAULT_LAYERS = new THREE.Layers().mask;
/** Schlüssel der Stückgruppe, mit denen das Stück einem Zustand folgt: ganz auslassen. */
const STATEFUL = ["onState", "curtain", "tub", "flames"];

/** Nur userData.furniture (oder nichts)? */
const plainData = (o) => {
  for (const k in o.userData) if (k !== "furniture") return false;
  return true;
};

/** Gewöhnliches Objekt ohne Sonderrolle (für Teile und Kanten). */
const plainObject = (o) =>
  o.visible && o.renderOrder === 0 && o.name === "" && plainData(o) && o.layers.mask === DEFAULT_LAYERS && o.frustumCulled &&
  o.onBeforeRender === NO_HOOK && o.onAfterRender === NO_HOOK_AFTER && !o.customDepthMaterial && !o.customDistanceMaterial && !o.morphTargetInfluences;

/** Geometrie, die sich ohne Verlust kopieren lässt: Lage vorhanden, keine Morphs, kein Ausschnitt, nichts verschachtelt. */
function plainGeometry(geo) {
  if (!geo?.isBufferGeometry || geo.userData.keep || !geo.attributes.position) return false;
  for (const k in geo.morphAttributes) if (geo.morphAttributes[k]?.length) return false;
  if (geo.drawRange.start !== 0 || geo.drawRange.count !== Infinity) return false;
  if (geo.index && (geo.index.isInterleavedBufferAttribute || geo.index.count === 0)) return false;
  for (const k in geo.attributes) {
    const a = geo.attributes[k];
    if (a.isInterleavedBufferAttribute) return false;
    // Lage und Normalen werden umgerechnet: nur als Gleitkommazahlen; Tangenten kommen in Möbeln nicht vor
    if (k === "tangent" || ((k === "position" || k === "normal") && (!(a.array instanceof Float32Array) || a.normalized || a.itemSize !== 3))) return false;
  }
  return true;
}

/** Attribut-Signatur: Namen, itemSize, normalized und Zahlentyp. */
const signature = (geo) =>
  Object.keys(geo.attributes)
    .sort()
    .map((k) => `${k}:${geo.attributes[k].itemSize}:${+geo.attributes[k].normalized}:${geo.attributes[k].array.constructor.name}`)
    .join("|");

/** [Meshes, Linien] im Stück. */
function count(g) {
  const n = [0, 0];
  g.traverse((o) => {
    if (o.isMesh) n[0]++;
    else if (o.isLine) n[1]++;
  });
  return n;
}

/** Matrix eines Objekts relativ zur Stückgruppe g (ohne deren eigene Matrix); null, wenn ein Vorfahr nicht passt. */
function relMatrix(o, g, out) {
  if (o.matrixAutoUpdate) o.updateMatrix();
  out.copy(o.matrix);
  for (let p = o.parent; p !== g; p = p.parent) {
    if (!p || !p.visible || !plainData(p)) return null;
    if (p.matrixAutoUpdate) p.updateMatrix();
    out.premultiply(p.matrix);
  }
  return out;
}

/** Ganzes Stück auslassen? item: der Eintrag aus furniture[] (Typ, Entität), sonst zählt nur die Gruppe. */
export function keepWhole(g, item = null) {
  const entity = item?.entity ?? g.userData.entity;
  if (entity && entity !== "none") return true;
  if (item?.type === "custom_model" || g.userData.customModel || g.userData.placeholder) return true;
  if (STATEFUL.some((k) => g.userData[k])) return true;
  return g.rotation.x !== 0 || g.rotation.z !== 0; // geneigt/gekippt (furniture.js: furniturePose)
}

/**
 * Teile des Möbelstücks g je Material zusammenführen (in place). edges: Material der Cyberpunk-Kanten
 * (furnitureMaterials().edge); ein Teil mit anderen Kindern bleibt einzeln. item: Eintrag aus furniture[].
 * @returns {{meshes: [number, number], lines: [number, number]}|null} Anzahl vorher/nachher, null = Stück ausgelassen
 */
export function mergeItem(g, { edges = null, item = null } = {}) {
  if (keepWhole(g, item)) return null;
  const bulbs = new Set(g.userData.bulbs ?? []);
  const groups = new Map(); // Material → Signatur → Teile
  const before = count(g);
  const candidates = [];
  g.traverse((o) => {
    if (o === g || !o.isMesh) return;
    if (o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.raycast !== MESH_RAYCAST) return;
    const mat = o.material;
    if (!mat || Array.isArray(mat) || mat.transparent || bulbs.has(o) || !plainObject(o) || !plainGeometry(o.geometry)) return;
    // Kinder: nur Kanten im Kanten-Material (ohne eigene Kinder, ohne Index, nur Lage)
    for (const c of o.children) {
      if (!edges || !c.isLineSegments || c.material !== edges || c.children.length || c.raycast !== LINE_RAYCAST || !plainObject(c)) return;
      if (!plainGeometry(c.geometry) || c.geometry.index || Object.keys(c.geometry.attributes).length !== 1) return;
    }
    const m = relMatrix(o, g, new THREE.Matrix4());
    if (!m || !(m.determinant() > 0)) return;
    candidates.push({ o, m });
  });
  for (const part of candidates) {
    const { o } = part;
    const key = `${signature(o.geometry)}#${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    let bySig = groups.get(o.material);
    if (!bySig) groups.set(o.material, (bySig = new Map()));
    if (!bySig.has(key)) bySig.set(key, []);
    bySig.get(key).push(part);
  }
  const merged = [];
  const edgeParts = new Map(); // Kanten-Material → [{o: LineSegments, m: Matrix relativ zur Stückgruppe}]
  for (const [mat, bySig] of groups) {
    for (const parts of bySig.values()) {
      if (parts.length < 2) continue;
      const mesh = new THREE.Mesh(mergeParts(parts), mat);
      mesh.castShadow = parts[0].o.castShadow;
      mesh.receiveShadow = parts[0].o.receiveShadow;
      merged.push({ mesh, parts });
      for (const { o, m } of parts) {
        for (const c of o.children) {
          if (c.matrixAutoUpdate) c.updateMatrix();
          if (!edgeParts.has(c.material)) edgeParts.set(c.material, []);
          edgeParts.get(c.material).push({ o: c, m: c.matrix.clone().premultiply(m) });
        }
      }
    }
  }
  if (!merged.length) return { meshes: [before[0], before[0]], lines: [before[1], before[1]] };
  const old = new Set();
  for (const { mesh, parts } of merged) {
    for (const { o } of parts) {
      old.add(o.geometry);
      for (const c of o.children) old.add(c.geometry);
      o.parent.remove(o);
    }
    g.add(mesh);
  }
  // Stück mit durchsichtigen Teilen: Kanten je Teil (Three.js sortiert Durchsichtiges je Objekt von hinten nach vorn)
  let clear = false;
  g.traverse((o) => {
    if (o.isMesh && [].concat(o.material).some((m) => m?.transparent)) clear = true;
  });
  for (const [mat, parts] of edgeParts) {
    if (!clear) {
      g.add(new THREE.LineSegments(mergeParts(parts, { lines: true }), mat));
      continue;
    }
    for (const part of parts) g.add(new THREE.LineSegments(mergeParts([part], { lines: true }), mat));
  }
  // leer gewordene, einfache Untergruppen weg (nicht, wenn das Stück sie kennt, z. B. userData.door)
  const known = new Set(Object.values(g.userData));
  const prune = (o) => {
    for (const c of [...o.children]) prune(c);
    if (o !== g && !o.isMesh && !o.isLine && !o.children.length && o.name === "" && plainData(o) && !known.has(o)) o.parent.remove(o);
  };
  prune(g);
  // Original-Geometrien freigeben, sofern sie im Stück nicht mehr gebraucht werden
  const used = new Set();
  g.traverse((o) => {
    if (o.geometry) used.add(o.geometry);
  });
  for (const geo of old) if (!used.has(geo) && !geo.userData.keep) geo.dispose();
  // alle Teile kennen ihr Möbelstück (wie buildFurniture)
  const id = g.userData.furniture;
  if (id !== undefined) g.traverse((o) => (o.userData.furniture = id));
  const after = count(g);
  return { meshes: [before[0], after[0]], lines: [before[1], after[1]] };
}

const _box = new THREE.Box3();

/**
 * Teile [{o, m}] (Objekt und Matrix relativ zur Stückgruppe) zu einer Geometrie: Lage mit m, Normalen mit der
 * Normalenmatrix; übrige Attribute unverändert. Meshes bekommen einen Index (fehlende
 * ergänzt), Linien bleiben ohne. Box = Vereinigung der umgerechneten Teil-Boxen.
 */
function mergeParts(parts, { lines = false } = {}) {
  const first = parts[0].o.geometry;
  const names = Object.keys(first.attributes);
  let verts = 0;
  let idx = 0;
  for (const { o } of parts) {
    const n = o.geometry.attributes.position.count;
    verts += n;
    idx += o.geometry.index ? o.geometry.index.count : n;
  }
  const geo = new THREE.BufferGeometry();
  const out = {};
  for (const k of names) {
    const a = first.attributes[k];
    out[k] = new a.array.constructor(verts * a.itemSize);
  }
  const index = lines ? null : verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  const nm = new THREE.Matrix3();
  const box = new THREE.Box3();
  let v0 = 0;
  let i0 = 0;
  for (const { o, m } of parts) {
    const g = o.geometry;
    const n = g.attributes.position.count;
    const e = m.elements;
    nm.getNormalMatrix(m);
    const ne = nm.elements;
    // Box der Teil-Geometrie wie Box3.setFromObject (vorhandene Box, sonst aus den Punkten), dann mit m umgerechnet
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (const k of names) {
      const src = g.attributes[k];
      const size = src.itemSize;
      const sa = src.array; // Float32Array ohne Versatz (plainGeometry)
      const dst = out[k];
      const base = v0 * size;
      if (k === "position") {
        for (let i = 0, j = 0; i < n; i++, j += 3) {
          const x = sa[j];
          const y = sa[j + 1];
          const z = sa[j + 2];
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
          const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
          dst[base + j] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
          dst[base + j + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
          dst[base + j + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
        }
      } else if (k === "normal") {
        // Normalenmatrix (inverse Transponierte von m), wieder auf Länge 1
        const [a0, a1, a2, b0, b1, b2, c0, c1, c2] = ne;
        for (let i = 0, j = 0; i < n; i++, j += 3) {
          const x = sa[j];
          const y = sa[j + 1];
          const z = sa[j + 2];
          const nx = a0 * x + b0 * y + c0 * z;
          const ny = a1 * x + b1 * y + c1 * z;
          const nz = a2 * x + b2 * y + c2 * z;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          dst[base + j] = nx / len;
          dst[base + j + 1] = ny / len;
          dst[base + j + 2] = nz / len;
        }
      } else {
        // unverändert kopieren (UV, Farben …), auch normalisierte Ganzzahl-Attribute roh, damit nichts gerundet wird
        dst.set(sa.subarray(0, n * size), base);
      }
    }
    if (index) {
      if (g.index) {
        const src = g.index.array;
        const c = g.index.count;
        for (let i = 0; i < c; i++) index[i0 + i] = src[i] + v0;
        i0 += c;
      } else {
        for (let i = 0; i < n; i++) index[i0 + i] = v0 + i;
        i0 += n;
      }
    }
    if (g.boundingBox) _box.copy(g.boundingBox);
    else {
      _box.min.set(x0, y0, z0);
      _box.max.set(x1, y1, z1);
    }
    box.union(_box.applyMatrix4(m));
    v0 += n;
  }
  for (const k of names) {
    const a = first.attributes[k];
    geo.setAttribute(k, new THREE.BufferAttribute(out[k], a.itemSize, a.normalized));
  }
  if (index) geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingBox = box;
  geo.computeBoundingSphere();
  return geo;
}
