// Bausteine für die Modelle des Katalogs „Wohnen, Küche, Kamin, Vorhänge“ (ohne DOM, mit node testbar):
// Bilder, Bücher, Pflanzen, Flammen, Faltenwurf und die Zustandsregeln für Kamin und Vorhang.

import * as THREE from "./vendor/three.module.min.js";
import { ball, box, cyl, place, rod, tint } from "./model-parts.js";

export { ball, box, cyl, place, rod, tint };

/** Reproduzierbarer Pseudo-Zufall (0…1): gleiche Zahl, gleicher Wert – Modelle sehen bei jedem Aufbau gleich aus. */
export const rnd = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Buchrücken, Kissen und Deko-Farben (gedeckt, damit es im Raum ruhig wirkt). */
export const SPINES = [0xb04a3a, 0x3b5c8a, 0x4f7a4c, 0xd0a23a, 0x7a4a7a, 0x2e3a4a, 0xc8b89a, 0xa86a3a, 0x5a8a8a, 0x8a3b4a];
export const POT = 0xb8643b;
export const SOIL = 0x40301f;

/** Scheibe, die nach vorn (+z) zeigt (Ziffernblatt, Spiegel, Sonne im Bild). */
export function disc(g, mat, r, x, y, z, th = 0.004, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Zylinder, der entlang der x-Achse liegt (Stange, Rolle): Mittelpunkt (x, y, z), Länge len. */
export function barX(g, mat, r, len, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 0.004), seg), mat);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Zylinder, der entlang der z-Achse liegt (Walze, Scheit): Mittelpunkt (x, y, z), Länge len. */
export function barZ(g, mat, r, len, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 0.004), seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Drehkörper (Vase, Schale) aus einem Profil [[Radius, Höhe], …] von unten nach oben; Unterkante bei y. */
export function lathe(g, mat, profile, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.001), h)), seg), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Vieleck im Grundriss [[x, z], …] nach oben ausgezogen (Eckkamin, Keil); Unterkante bei y. */
export function prism(g, mat, pts, h, y = 0) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Math.max(h, 0.004), bevelEnabled: false }), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  g.add(m);
  return m;
}

/** Teilring/Bogen (Kufe, Bügel) in der y-z-Ebene um den Mittelpunkt (x, y, z): Radius R, Rohr r, Winkel phi0 bis phi1 (rad; 0 = oben, π/2 = nach vorn +z, π = unten). */
export function arcYZ(g, mat, R, r, phi0, phi1, x = 0, y = 0, z = 0, seg = 20) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 6, seg, phi1 - phi0), mat);
  m.rotation.z = phi0 + Math.PI / 2;
  grp.add(m);
  grp.rotation.y = Math.PI / 2;
  grp.position.set(x, y, z);
  g.add(grp);
  return grp;
}

const leafGeo = new THREE.SphereGeometry(1, 8, 6);
/**
 * Blatt als flacher Ellipsoid: Ansatz bei (x, y, z), zeigt in Richtung yaw (um y, 0 = nach vorn) und pitch (nach oben > 0);
 * Länge len, Breite wid.
 */
export function leaf(g, mat, len, wid, x, y, z, yaw = 0, pitch = 0, thin = 0.14) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(leafGeo, mat);
  m.scale.set(wid / 2, Math.max(0.004, (wid / 2) * thin), len / 2);
  m.position.z = len / 2;
  grp.add(m);
  grp.rotation.order = "YXZ";
  grp.rotation.set(-pitch, yaw, 0);
  grp.position.set(x, y, z);
  g.add(grp);
  return grp;
}

/** Topf (leicht konisch, mit Rand und Erde); Unterkante bei y. */
export function pot(g, M, r, h, x = 0, y = 0, z = 0, color = POT) {
  const mat = tint(M, color);
  cyl(g, mat, r * 0.72, h * 0.86, x, y, z, 18, r * 0.96);
  cyl(g, mat, r, h * 0.16, x, y + h * 0.84, z, 18);
  cyl(g, tint(M, SOIL), r * 0.9, 0.012, x, y + h * 0.98 - 0.006, z, 18);
}

/** Stängel von a nach b. */
export function stem(g, M, a, b, r = 0.006, color = 0x3d6b36) {
  return rod(g, tint(M, color), a, b, r, 6);
}

const frameWood = [0x7a5230, 0x2e2a28, 0xd9c7a0, 0xf0ece4, 0xb88a52];
/** Motiv für Bilder: Fläche aw × ah, Mitte x, Unterkante y, vorn bei z; kind 0 Landschaft, 1 Formen, 2 Abendrot, 3 Streifen. */
export function art(g, M, aw, ah, x, y, z, kind = 0) {
  const T = (c) => tint(M, c);
  const e = 0.002;
  const lay = (c, w, h, px, py, k) => box(g, T(c), w, h, e, x + px, y + py, z + e * k);
  switch (kind % 4) {
    case 0: // Landschaft: Himmel, Sonne, zwei Hügelreihen
      lay(0x9cc7e6, aw, ah, 0, 0, 0);
      ball(g, T(0xf2c84b), ah * 0.12, x + aw * 0.22, y + ah * 0.72, z + e * 2, 12).scale.z = 0.1;
      lay(0x5d8f5a, aw, ah * 0.34, 0, 0, 1);
      lay(0x3f7a4d, aw * 0.7, ah * 0.2, -aw * 0.15, 0, 2);
      lay(0xd7c28a, aw, ah * 0.1, 0, 0, 3);
      break;
    case 1: // Formen
      lay(0xf3ead7, aw, ah, 0, 0, 0);
      lay(0xd9534f, aw * 0.42, ah * 0.5, -aw * 0.18, ah * 0.4, 1);
      lay(0x3d6fa5, aw * 0.3, ah * 0.38, aw * 0.24, ah * 0.1, 1);
      lay(0xe8b84a, aw * 0.5, ah * 0.1, 0, ah * 0.12, 2);
      disc(g, T(0x2e3a4a), Math.min(aw, ah) * 0.12, x + aw * 0.2, y + ah * 0.74, z + e * 2, e, 20);
      break;
    case 2: // Abendrot: Himmel, große Sonne, dunkle Berge
      lay(0xe9a15b, aw, ah, 0, 0, 0);
      lay(0xf2c27a, aw, ah * 0.45, 0, ah * 0.55, 1);
      disc(g, T(0xf7e3a0), Math.min(aw, ah) * 0.2, x, y + ah * 0.42, z + e * 2, e, 24);
      lay(0x5a4a6a, aw, ah * 0.3, 0, 0, 3);
      lay(0x3b3350, aw * 0.55, ah * 0.2, aw * 0.18, 0, 4);
      break;
    default:
      // Streifen
      for (let i = 0; i < 6; i++) lay([0xc9a27a, 0xe3d3b5, 0x8aa39b, 0xd88a6a, 0x5f7a8a, 0xf0e6d0][i], aw / 6, ah, -aw / 2 + (i + 0.5) * (aw / 6), 0, 0);
  }
}

/** Bilderrahmen mit Motiv: Außenmaß w × h, Tiefe d, Mitte x, Unterkante y, Mitte z. */
export function picture(g, M, w, h, d, x, y, z, kind = 0, wood = frameWood[kind % frameWood.length]) {
  const b = Math.max(0.012, Math.min(w, h) * 0.07);
  const fm = tint(M, wood);
  box(g, tint(M, 0xf5f1e8), w, h, d * 0.4, x, y, z - d / 2 + d * 0.2);
  box(g, fm, w, b, d, x, y, z);
  box(g, fm, w, b, d, x, y + h - b, z);
  box(g, fm, b, h - 2 * b, d, x - w / 2 + b / 2, y + b, z);
  box(g, fm, b, h - 2 * b, d, x + w / 2 - b / 2, y + b, z);
  const m = b * 1.6; // heller Passepartout-Rand
  box(g, tint(M, 0xfaf7f0), w - 2 * b, h - 2 * b, 0.002, x, y + b, z - d / 2 + d * 0.4 + 0.001);
  art(g, M, w - 2 * b - m, h - 2 * b - m, x, y + b + m / 2, z - d / 2 + d * 0.4 + 0.002, kind);
}

/** Buchreihe von x0 nach rechts über die Breite bw: bunte Rücken, hier und da ein schräg angelehntes Buch. */
export function books(g, M, bw, x0, y, z, hMax, depth, seed = 0) {
  let x = x0;
  let i = seed;
  while (true) {
    const t = 0.018 + rnd(i * 3 + 1) * 0.03;
    if (x + t > x0 + bw) break;
    const h = hMax * (0.72 + rnd(i * 3 + 2) * 0.28);
    const dd = depth * (0.82 + rnd(i * 3 + 3) * 0.18);
    const col = SPINES[Math.floor(rnd(i) * SPINES.length)];
    box(g, tint(M, col), t, h, dd, x + t / 2, y, z - depth / 2 + dd / 2);
    // heller Streifen am Rücken
    box(g, tint(M, 0xf0e6cf), t * 1.04, 0.01, dd * 1.01, x + t / 2, y + h * 0.7, z - depth / 2 + dd / 2);
    x += t + 0.001;
    i++;
  }
  return x - x0;
}

// ---------------------------------------------------------------- Feuer

/** Flammen leuchten immer (auch im Cyberpunk-Stil), unabhängig von den Möbelfarben. */
const fireMats = {};
export function flameMat(key) {
  if (!fireMats[key]) {
    const cfg = {
      outer: [0xff5a1a, 0xff4a00, 1.5, 0.72],
      mid: [0xff9a2a, 0xff7a10, 1.7, 0.85],
      core: [0xffe27a, 0xffcc33, 1.9, 1],
      ember: [0xff7a2a, 0xff5a10, 1.3, 1],
    }[key];
    // äußere Flammenhüllen halbtransparent: der helle Kern leuchtet durch
    fireMats[key] = new THREE.MeshStandardMaterial({ color: cfg[0], emissive: cfg[1], emissiveIntensity: cfg[2], roughness: 1, transparent: cfg[3] < 1, opacity: cfg[3], depthWrite: cfg[3] >= 1 });
  }
  return fireMats[key];
}

/**
 * Flammen und Glut in einer Gruppe (zum Ein-/Ausblenden): Feuerstelle mit Breite fw, Tiefe fd, Flammenhöhe fh;
 * Mitte (x, z), Unterkante y. Die Gruppe hängt an g und trägt userData.flames = true.
 */
export function flames(g, x, y, z, fw, fd, fh, seed = 0) {
  const grp = new THREE.Group();
  grp.userData.flames = true;
  const n = Math.max(3, Math.round(fw / 0.07));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const hh = fh * (0.55 + rnd(seed + i * 5 + 1) * 0.45) * (1 - Math.abs(t) * 0.6);
    const r = Math.max(0.012, Math.min(fw / n, fd) * 0.55);
    const px = x + t * (fw - r * 1.4);
    const pz = z + (rnd(seed + i * 5 + 2) - 0.5) * fd * 0.5;
    const lean = (rnd(seed + i * 5 + 3) - 0.5) * 0.25;
    for (const [key, k, kh] of [["outer", 1, 1], ["mid", 0.68, 0.82], ["core", 0.38, 0.55]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * k, hh * kh, 7), flameMat(key));
      cone.position.set(px, y + (hh * kh) / 2 + 0.01, pz);
      cone.rotation.z = lean;
      grp.add(cone);
    }
  }
  box(grp, flameMat("ember"), fw * 0.9, 0.025, fd * 0.8, x, y, z);
  g.add(grp);
  return grp;
}

/** Zustand eines Kamins aus einem HA-Zustand: true = Feuer an, false = aus, null = unklar (Wert des Feldes gilt). */
export function fireFromState(s) {
  if (!s) return null;
  const st = String(s.state ?? "").toLowerCase();
  const heating = String(s.attributes?.hvac_action ?? "").toLowerCase() === "heating";
  if (heating || st === "on" || st === "heat" || st === "heating") return true;
  if (st === "off") return false;
  if (!st || st === "unavailable" || st === "unknown") return null;
  // Thermostat mit anderem Zustand (idle, auto, cool …): es wird gerade nicht geheizt
  return s.attributes?.hvac_action !== undefined || String(s.entity_id ?? "").startsWith("climate.") ? false : null;
}

const truthy = (v) => v === true || v === 1 || v === "1" || v === "true" || v === "on";
/** Flammen an den Zustand der Entität (oder an das Feld „Feuer an“) binden; ohne Entität bleibt es beim Feld. */
export function bindFire(g, item, fire) {
  const base = truthy(item.fire);
  fire.visible = base;
  g.userData.flames = fire;
  g.userData.onState = (s) => {
    const v = fireFromState(s);
    fire.visible = v ?? base;
  };
}

// ---------------------------------------------------------------- Vorhang

/** Öffnung 0…1 aus dem Feld „Geöffnet (%)“ (fehlt oder ungültig: ganz offen). */
export function openFromItem(item) {
  const v = item?.open;
  const n = v === undefined || v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 100) / 100 : 1;
}

/** Öffnung 0…1 aus dem Zustand einer Rollladen-/Schalter-Entität (null: unklar, das Feld gilt). */
export function openFromState(s) {
  if (!s) return null;
  const a = s.attributes ?? {};
  const pos = a.current_position;
  if (pos !== undefined && pos !== null && pos !== "" && Number.isFinite(Number(pos))) return clamp(Number(pos), 0, 100) / 100;
  const st = String(s.state ?? "").toLowerCase();
  if (st === "open" || st === "opening") return 1;
  if (st === "closed" || st === "closing") return 0;
  if (st === "on") return 0; // Schalter an = Vorhang zu
  if (st === "off") return 1;
  return null;
}

/** Fertige Zickzack-Geometrie: Anzahl Segmente n, Segmentlänge ell, Gesamtlänge L, flachster und engster Zustand (für foldsX/foldsY). */
function foldPlan(span, fullness, n, amp, tight, minSpan) {
  let f = fullness;
  // so voll wie gewünscht, aber die Falten bleiben flacher als die verfügbare Tiefe
  for (let k = 0; k < 3; k++) {
    const ell = (span * f) / n;
    f = Math.min(fullness, 1 / Math.sqrt(1 - Math.min(Math.min(0.999, amp / ell), 0.97) ** 2));
  }
  const L = span * f;
  const ell = L / n;
  const lo = Math.min(span, Math.max(minSpan, L * Math.cos(Math.asin(Math.min(tight, amp / ell)))));
  return { L, ell, extent: (open) => span + (lo - span) * clamp(open, 0, 1) };
}

/**
 * Faltenwurf aus schmalen Streifen im Zickzack, seitlich raffbar. Der Stoff hängt ab x0 in Richtung dir (+1 rechts, −1 links);
 * span: Breite im geschlossenen Zustand, y/hgt: Unterkante und Höhe, zc: Mittelebene, amp: größte Faltentiefe, minSpan: Mindestbreite
 * der Raffung, strip: Wunschbreite eines Streifens, rings: { mat, R, r, y, every } = Ringe an der Stange. Rückgabe: { group, set(offen 0…1), extent(offen), strips }.
 */
export function foldsX(g, mat, { x0, dir = 1, span, y, hgt, zc = 0, thick = 0.008, fullness = 1.45, strip = 0.07, amp = 0.08, minSpan = 0.1, tight = 0.99, rings = null }) {
  const grp = new THREE.Group();
  g.add(grp);
  strip = Math.min(strip, amp * 0.95); // Falten nie länger als tief, sonst lässt sich der Stoff nicht eng raffen
  const n = Math.max(4, Math.round((span * fullness) / strip / 2) * 2);
  const { L, ell, extent } = foldPlan(span, fullness, n, amp, tight, minSpan);
  const strips = [];
  for (let i = 0; i < n; i++) strips.push(box(grp, mat, ell, hgt, thick, x0, y, zc));
  const rs = [];
  if (rings) {
    for (let i = 0; i < n; i += rings.every ?? 2) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(rings.R, rings.r, 6, 12), rings.mat);
      m.rotation.y = Math.PI / 2;
      m.position.set(x0, rings.y, zc);
      grp.add(m);
      rs.push([i, m]);
    }
  }
  const set = (open) => {
    const c = clamp(extent(open) / L, 0, 1);
    const th = Math.acos(c);
    strips.forEach((m, i) => {
      m.position.x = x0 + dir * (i + 0.5) * ell * c;
      m.rotation.y = -dir * (i % 2 ? -1 : 1) * th;
    });
    for (const [i, m] of rs) m.position.x = x0 + dir * (i + 0.5) * ell * c;
  };
  return { group: grp, set, extent, strips };
}

/**
 * Wie foldsX, aber waagerechte Falten: der Stoff hängt von der Oberkante top nach unten (Raffrollo, Plissee) und wird nach oben
 * zusammengeschoben. span: Höhe im heruntergelassenen Zustand, w: Breite, x: Mitte. set(offen) gibt die Unterkante des Stoffs zurück.
 */
export function foldsY(g, mat, { top, span, w, x = 0, zc = 0, thick = 0.008, fullness = 1.25, n = 20, amp = 0.08, minSpan = 0.1, tight = 0.995 }) {
  const grp = new THREE.Group();
  g.add(grp);
  const { L, ell, extent } = foldPlan(span, fullness, n, amp, tight, minSpan);
  const strips = [];
  for (let i = 0; i < n; i++) strips.push(box(grp, mat, w, ell, thick, x, top, zc));
  const set = (open) => {
    const c = clamp(extent(open) / L, 0, 1);
    const th = Math.acos(c);
    strips.forEach((m, i) => {
      m.position.y = top - (i + 0.5) * ell * c;
      m.rotation.x = -(i % 2 ? -1 : 1) * th;
    });
    return top - n * ell * c;
  };
  return { group: grp, set, extent, strips };
}

/** Holzscheit mit hellen Schnittflächen: Achse entlang x oder z, Mittelpunkt (x, y, z), Länge len, Radius r; i wählt Rinde und Schnitt. */
export function log(g, M, axis, r, len, x, y, z, i = 0) {
  const bark = tint(M, [0x5a3d28, 0x6b4a2f, 0x4a3320][i % 3]);
  const cut = tint(M, [0xd9b98a, 0xc9a06a][i % 2]);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 9), [bark, cut, cut]);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

