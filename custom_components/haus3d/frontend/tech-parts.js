// Gemeinsame Bausteine der Technik-Modelle (furniture-tech*.js): mittig gesetzte Körper, Scheiben und Ringe mit Achse nach +z,
// Zusatzfarben je Stil und die Kontroll-LED, die dem Zustand einer verknüpften Entität folgt.

import * as THREE from "./vendor/three.module.min.js";
import { box, tint } from "./model-parts.js";

export const HALF_PI = Math.PI / 2;

/** Quader mit Mittelpunkt (x, y, z). */
export function cbox(g, mat, w, h, d, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.002), Math.max(h, 0.002), Math.max(d, 0.002)), mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Scheibe (Zylinder) mit Achse nach +z, Mittelpunkt (x, y, z), Dicke t. */
export function disc(g, mat, r, t, x = 0, y = 0, z = 0, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(t, 0.002), seg), mat);
  mesh.rotation.x = HALF_PI;
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Zylinder mit Achse nach x: Mittelpunkt (x, y, z), Länge len. */
export function cylX(g, mat, r, len, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 0.002), seg), mat);
  mesh.rotation.z = HALF_PI;
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Zylinder mit Achse nach z: von z0 bis z1, Mitte (x, y). */
export function cylZ(g, mat, r, z0, z1, x = 0, y = 0, seg = 14) {
  return disc(g, mat, r, Math.abs(z1 - z0), x, y, (z0 + z1) / 2, seg);
}

/** Ring (Torus) mit Achse nach +z. */
export function ring(g, mat, r, tube, x = 0, y = 0, z = 0, seg = 28) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg), mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Flaches Dreieck in der xy-Ebene (Pfeil), Spitze nach oben (up) oder unten; Mitte (x, y, z). */
export function arrow(g, mat, size, x, y, z, up = true) {
  const s = new THREE.Shape();
  const k = up ? 1 : -1;
  // gegen den Uhrzeigersinn, damit die Vorderseite nach +z zeigt (bei Spitze unten die Seiten tauschen)
  s.moveTo(0, k * size * 0.6);
  s.lineTo(-k * size * 0.55, -k * size * 0.4);
  s.lineTo(k * size * 0.55, -k * size * 0.4);
  s.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Zusatzfarben für den Stil von M (nur Farbe, im Cyberpunk-Stil dunkel mit Eigenleuchten). */
export function colors(M) {
  return {
    red: tint(M, 0xb3261e),
    blue: tint(M, 0x2f6aa8),
    insul: tint(M, 0x2b2d30),
    grey: tint(M, 0x8a8f96),
    greyLight: tint(M, 0xc4c8cd),
    copper: tint(M, 0xb4733f, { metalness: 0.5, roughness: 0.4 }),
    brass: tint(M, 0xb59a52, { metalness: 0.5, roughness: 0.4 }),
    cream: tint(M, 0xeee9dc),
    fabric: tint(M, 0x9aa1a8, { roughness: 0.95 }),
    oil: tint(M, 0xd6cfb9, { roughness: 0.5 }),
    pellet: tint(M, 0x8a6a42, { roughness: 0.9 }),
    steel: tint(M, 0xa9aeb5, { metalness: 0.55, roughness: 0.4 }),
    slate: tint(M, 0x4b5057),
  };
}

/** Kontroll-LED-Farben (einmal je Material-Satz): aus, grün, gelb, rot. */
const ledCache = new WeakMap();
export function ledMats(M) {
  let m = ledCache.get(M);
  if (!m) {
    const glow = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3 });
    m = { off: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6 }), green: glow(0x00e676), amber: glow(0xffb300), red: glow(0xff3d3d) };
    ledCache.set(M, m);
  }
  return m;
}

/**
 * Farbe der Kontroll-LED zu einem Zustandsobjekt: "off" (aus oder unbekannt), "green" (an), "amber" (Licht an, Heizen) oder "red"
 * (Melder löst aus).
 */
export function ledKind(st) {
  if (!st || typeof st !== "object") return "off";
  const state = String(st.state ?? "");
  const domain = String(st.entity_id ?? "").split(".")[0];
  if (domain === "climate") {
    if (["off", "unavailable", "unknown", ""].includes(state)) return "off";
    return st.attributes?.hvac_action === "heating" ? "amber" : "green";
  }
  if (!["on", "open", "playing", "home", "heat", "cool", "auto"].includes(state)) return "off";
  if (domain === "light") return "amber";
  if (domain === "binary_sensor") return "red";
  return "green";
}

/**
 * Hängt die Kontroll-LEDs an den Zustand der verknüpften Entität (g.userData.onState): grün bei an, gelb bei einem Licht, rot bei
 * einem auslösenden Melder, sonst aus. leds sind die Meshes, die ihr Material wechseln.
 */
export function stateLeds(g, M, leds) {
  const mats = ledMats(M);
  for (const l of leds) l.material = mats.off;
  g.userData.onState = (st) => {
    const mat = mats[ledKind(st)];
    for (const l of leds) if (l.material !== mat) l.material = mat;
  };
}

export { box, tint };
