// Bausteine für die Modelle des Katalogs „Garten, Garage, Hydroponik“ (ohne DOM, mit node testbar): Farben je Stil,
// zusammengefasste Teile (viele gleiche Stäbe, Pflanzen, Ziegel in einem Mesh) und kleine Formen.
// Einheitsrahmen wie in furniture.js: Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mittelpunkt der Grundfläche
// im Ursprung, Vorderseite nach +z. Keine InstancedMesh in Modellen (furniture.js zieht Kanten pro Mesh im Cyberpunk-Stil).

import * as THREE from "./vendor/three.module.min.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { ball, box, cyl, place, rod, tint } from "./model-parts.js";

export { ball, box, cyl, place, rod, tint, THREE };

/** Deterministischer Zufall (gleiches Modell sieht bei jedem Aufbau gleich aus). */
export function rng(seed = 1) {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Häufige Farben des Katalogs, je Stil (Cyberpunk: dunkel mit Eigenleuchten). Hauptflächen, die zur „Farbe (statt Standard)“
 * des Möbelstücks passen sollen, nehmen weiter M.wood, M.fabric, M.light, M.white, M.dark, M.stone.
 */
export function palette(M) {
  const t = (c, extra) => tint(M, c, extra);
  return {
    woodL: t(0xc9a06a),
    woodD: t(0x6a4529),
    woodG: t(0x9b958a), // verwittertes Holz
    teak: t(0x9a6a3c),
    steel: t(0x9aa1a8, { metalness: 0.6, roughness: 0.4 }),
    steelD: t(0x3c4147, { metalness: 0.5, roughness: 0.5 }),
    rust: t(0x8a4b2d, { roughness: 0.9 }),
    black: t(0x1d1d20, { roughness: 0.85 }),
    rubber: t(0x141416, { roughness: 0.95 }),
    plastic: t(0xd9dde0, { roughness: 0.5 }),
    plasticG: t(0x4d8f4f, { roughness: 0.6 }),
    red: t(0xb9362c, { roughness: 0.6 }),
    blue: t(0x3b6ea5, { roughness: 0.6 }),
    yellow: t(0xe6b422, { roughness: 0.6 }),
    cream: t(0xefe6d2, { roughness: 0.8 }),
    soil: t(0x4a3426, { roughness: 1 }),
    sand: t(0xe0cf9c, { roughness: 1 }),
    gravel: t(0xa7a299, { roughness: 1 }),
    leaf: t(0x4f9a3d, { roughness: 0.8 }),
    leafD: t(0x2f6f35, { roughness: 0.8 }),
    flower: t(0xe0457b, { roughness: 0.7 }),
    tomato: t(0xd33f2f, { roughness: 0.6 }),
    water: t(0x4cc3d9, { transparent: true, opacity: 0.7, roughness: 0.05, metalness: 0.15, depthWrite: false }),
    foil: t(0xdcecf4, { transparent: true, opacity: 0.32, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    mesh: t(0x2c2f33, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    cloth: t(0xe8dcc0, { roughness: 0.95, side: THREE.DoubleSide }),
    clothG: t(0x5f8f6b, { roughness: 0.95, side: THREE.DoubleSide }),
    clothB: t(0x3d6f9b, { roughness: 0.95, side: THREE.DoubleSide }),
    cushion: t(0xd8d2c4, { roughness: 0.95 }),
    cushionD: t(0x6b7885, { roughness: 0.95 }),
    rattan: t(0x6b5a4a, { roughness: 0.9 }),
    led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb86bff, emissiveIntensity: 1.1 }),
  };
}

/** Geometrie mit Lage: pos [x, y, z], Drehung rot [rx, ry, rz] (rad), Maßstab sc [sx, sy, sz]. */
export function at(geo, pos = [0, 0, 0], rot = [0, 0, 0], sc = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...sc));
  geo.applyMatrix4(m);
  return geo;
}

/** Quader-Geometrie mit Unterkante bei y (wie box, aber ohne Mesh – zum Zusammenfassen). */
export const boxG = (w, h, d, x = 0, y = 0, z = 0, rot = [0, 0, 0]) => at(new THREE.BoxGeometry(Math.max(w, 0.004), Math.max(h, 0.004), Math.max(d, 0.004)), [x, y + h / 2, z], rot);
/** Zylinder-Geometrie (oben r2, unten r) mit Unterkante bei y. */
export const cylG = (r, h, x = 0, y = 0, z = 0, seg = 12, r2 = r, rot = [0, 0, 0]) => at(new THREE.CylinderGeometry(r2, r, Math.max(h, 0.004), seg), [x, y + h / 2, z], rot);
/** Kugel-Geometrie, optional gestreckt (sc) – Pflanzen, Kissen, Früchte. */
export const ballG = (r, x = 0, y = 0, z = 0, sc = [1, 1, 1], seg = 8) => at(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), [x, y, z], [0, 0, 0], sc);
/** Stab-Geometrie von a nach b. */
export function rodG(a, b, r = 0.012, seg = 6) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = Math.max(va.distanceTo(vb), 0.001);
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return at(geo, va.add(vb).multiplyScalar(0.5).toArray(), new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3));
}

/** Mehrere Geometrien (aus boxG, cylG …) zu einem Mesh in einem Material zusammenfassen und in g einhängen. */
export function merged(g, mat, geos) {
  const list = geos.filter(Boolean);
  if (!list.length) return null;
  const indexed = list.every((x) => x.index);
  const geo = list.length === 1 ? list[0] : mergeGeometries(indexed ? list : list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  return mesh;
}

/** Wulst/Reifen: Torus mit Hauptradius R und Rohrradius r, Mitte (x, y, z); axis "y" liegt flach, "x" steht quer, "z" steht längs. */
export function ring(g, mat, R, r, x = 0, y = 0, z = 0, axis = "y", seg = 24, tube = 8) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(R, r, tube, seg), mat);
  if (axis === "y") mesh.rotation.x = Math.PI / 2;
  else if (axis === "x") mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Kegel/Kegelstumpf (unten r, oben r2) mit Unterkante bei y; mehr Ecken = runder. */
export function cone(g, mat, r, h, x = 0, y = 0, z = 0, seg = 16, r2 = 0) {
  return cyl(g, mat, r, h, x, y, z, seg, r2);
}

/**
 * Pflanzenhaufen: viele kleine gestauchte Kugeln in zwei Grüntönen, als zwei Meshes. spots: [[x, y, z, r], …] (Mitte, Radius).
 * Mit blossom (Material) kommt auf jede dritte Pflanze eine kleine Blüte bzw. Frucht dazu.
 */
export function plants(g, P, spots, { blossom = null, squash = 0.8, seed = 3 } = {}) {
  const r = rng(seed);
  const a = [];
  const b = [];
  const fl = [];
  spots.forEach(([x, y, z, rad], i) => {
    (i % 2 ? a : b).push(ballG(rad, x, y + rad * squash * 0.6, z, [1, squash, 1], 7));
    if (blossom && i % 3 === 0) fl.push(ballG(Math.max(0.012, rad * 0.28), x + (r() - 0.5) * rad, y + rad * squash * 1.45, z + (r() - 0.5) * rad, [1, 1, 1], 5));
  });
  merged(g, P.leaf, a);
  merged(g, P.leafD, b);
  if (blossom) merged(g, blossom, fl);
}

/** Raster von Pflanzstellen in einem Rechteck (Mitte cx, cz; Breite w, Tiefe d): [[x, z], …]. */
export function grid(cx, cz, w, d, nx, nz) {
  const out = [];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) out.push([cx - w / 2 + ((i + 0.5) * w) / nx, cz - d / 2 + ((k + 0.5) * d) / nz]);
  return out;
}

/** Leuchtmaterial-Quader für LED-Leisten, Flammen: Mesh in bulbs aufnehmen, damit es einem Licht folgt. */
export function lightBox(g, bulbs, M, w, h, d, x, y, z) {
  const b = box(g, M.bulb, w, h, d, x, y, z);
  bulbs.push(b);
  return b;
}
