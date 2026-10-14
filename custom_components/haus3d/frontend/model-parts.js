// Bausteine für die Katalog-Modelle (ohne DOM, mit node testbar): Grundkörper im Einheitsrahmen wie in
// furniture.js – Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Vorderseite nach +z – und
// Zusatzfarben je Stil (Cyberpunk: dunkel mit leuchtender Eigenfarbe).

import * as THREE from "./vendor/three.module.min.js";

/** Quader mit Unterkante bei y. */
export function box(g, mat, w, h, d, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.004), Math.max(h, 0.004), Math.max(d, 0.004)), mat);
  mesh.position.set(x, y + h / 2, z);
  g.add(mesh);
  return mesh;
}

/** Zylinder (oben r2, unten r) mit Unterkante bei y. */
export function cyl(g, mat, r, h, x = 0, y = 0, z = 0, seg = 16, r2 = r) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, Math.max(h, 0.004), seg), mat);
  mesh.position.set(x, y + h / 2, z);
  g.add(mesh);
  return mesh;
}

/** Kugel mit Mittelpunkt (x, y, z). */
export function ball(g, mat, r, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Stab von a nach b (Rohr, Kabel, Bein). */
export function rod(g, mat, a, b, r = 0.012, seg = 8) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 0.001), seg), mat);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  if (len > 0) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  g.add(mesh);
  return mesh;
}

/** Fertiges Mesh an (x, y, z) einhängen. */
export function place(g, mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

// Zusatzfarben je Material-Satz M (Stil) – einmal erzeugt, dann geteilt
const cache = new WeakMap();
/**
 * Material in einer Farbe für den Stil von M: standard matt, Cyberpunk dunkel mit Eigenleuchten.
 * extra: weitere MeshStandardMaterial-Werte (metalness, roughness, transparent, opacity …).
 */
export function tint(M, color, extra = {}) {
  let per = cache.get(M);
  if (!per) cache.set(M, (per = new Map()));
  const key = `${color}:${JSON.stringify(extra)}`;
  let mat = per.get(key);
  if (!mat) {
    mat = M.edge
      ? new THREE.MeshStandardMaterial({ color: 0x150a2c, emissive: color, emissiveIntensity: 0.25, roughness: 0.6, ...extra })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
    per.set(key, mat);
  }
  return mat;
}
