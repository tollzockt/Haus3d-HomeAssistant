// Einbau in Schränke – reine Rechnung (ohne Three.js und DOM, mit node testbar).
//
// Schränke sind „network_cabinet“ (Netzwerkschrank) und „server_rack“ (Serverschrank). Ihre nutzbaren Höheneinheiten (HE, je
// 0,0445 m) ergeben sich aus der Höhe abzüglich Sockel (unter der ersten HE) und Deckel (über der letzten):
//   Netzwerkschrank: Sockel 0,12 m + Deckel 0,10 m (Füße, Lüfterdach) → 1,2 m = 22 HE
//   Serverschrank:   Sockel 0,08 m + Deckel 0,05 m                      → 2,0 m = 42 HE
// Eingebaute Geräte sind ganz normale Möbelstücke mit zwei Zusatzfeldern: in_rack (ID des Schranks) und rack_u (unterste
// belegte HE, ab 1 von unten). Ihre Lage (x, z, Drehung, mount_y) wird daraus abgeleitet: gleiche Drehung wie der Schrank,
// mittig, mit der Front kurz hinter der Schranktür. Der Schrank führt zusätzlich rack_used (belegte HE; fehlt, wenn leer).

import { HE, RACK_DESK, RACK_HE, SHELF, TECH_PACK } from "./catalog-tech.js";

export { HE, SHELF };

/** Schränke: Standardmaße sowie Sockel und Deckel in m (siehe oben). */
export const CABINETS = {
  network_cabinet: { w: 0.6, d: 0.6, h: 1.2, base: 0.12, top: 0.1 },
  server_rack: { w: 0.6, d: 1.0, h: 2.0, base: 0.08, top: 0.05 },
};
/** Abstand der Gerätefront hinter der Schrankfront (Tür und Schiene), Luft hinter dem Gerät und seitlich je Seite (m). */
export const FRONT = 0.04;
export const BACK = 0.03;
export const SIDE = 0.035;

/** Das vorhandene Möbel „nas“ (NAS / Heimserver) passt ebenfalls in einen Schrank. */
const NAS = ["NAS / Heimserver", 0.22, 0.25, 0.25];
const DESK = new Set(RACK_DESK);

const r4 = (v) => Math.round(v * 10000) / 10000;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const rad = (deg) => ((Number(deg) || 0) * Math.PI) / 180;

/** Ist das Möbelstück ein Schrank, in den sich Geräte einbauen lassen? */
export const isCabinet = (m) => !!m && has(CABINETS, m.type);

/** Einbauart eines Typs: "unit" (19-Zoll-Gerät), "desk" (Tischgerät auf einem Fachboden) oder null. */
export function rackKind(type) {
  if (has(RACK_HE, type)) return "unit";
  return DESK.has(type) ? "desk" : null;
}

/** Lässt sich das Möbelstück in einen Schrank einbauen? */
export const isRackable = (m) => !!m && rackKind(m.type) !== null;

/** Maße und nutzbare Höheneinheiten eines Schranks (eigene Maße des Möbelstücks gehen vor). */
export function cabinetLayout(m) {
  const c = CABINETS[m.type];
  const h = Number(m.h) || c.h;
  return { w: Number(m.w) || c.w, d: Number(m.d) || c.d, h, base: c.base, top: c.top, units: Math.max(0, Math.floor((h - c.base - c.top) / HE + 1e-6)) };
}

/** Maße eines einbaubaren Geräts (eigene Maße gehen vor, sonst Katalog). */
export function deviceDims(m) {
  const def = m.type === "nas" ? NAS : TECH_PACK.items[m.type] ?? [null, 0.482, 0.4, HE];
  return { w: Number(m.w) || def[1], d: Number(m.d) || def[2], h: Number(m.h) || def[3] };
}

/** Belegte Höheneinheiten: 19-Zoll-Geräte nach ihrer Höhe, Tischgeräte samt Fachboden (aufgerundet, mindestens 1). */
export function heOf(m) {
  const { h } = deviceDims(m);
  return Math.max(1, Math.ceil((h + (rackKind(m.type) === "desk" ? SHELF : 0)) / HE - 0.06));
}

/** Passt das Gerät in Breite und Tiefe in den Schrank? "" = ja, sonst der Grund ("zu breit", "zu tief"). */
export function fitsCabinet(cab, dev) {
  const L = cabinetLayout(cab);
  const D = deviceDims(dev);
  if (D.w > L.w - 2 * SIDE + 1e-6) return "zu breit";
  if (D.d > L.d - FRONT - BACK + 1e-6) return "zu tief";
  return "";
}

/** Liegt der Punkt (x, z) in der Grundfläche des Schranks (gedrehtes Rechteck)? */
export function inFootprint(cab, x, z) {
  const L = cabinetLayout(cab);
  const a = rad(cab.rotation);
  const dx = x - (Number(cab.x) || 0);
  const dz = z - (Number(cab.z) || 0);
  const lx = dx * Math.cos(a) + dz * Math.sin(a);
  const lz = -dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(lx) <= L.w / 2 + 1e-9 && Math.abs(lz) <= L.d / 2 + 1e-9;
}

/** Lage eines eingebauten Geräts auf der HE u: {x, z, rotation, mount_y}. */
export function rackPose(cab, dev, u) {
  const L = cabinetLayout(cab);
  const D = deviceDims(dev);
  const a = rad(cab.rotation);
  const zl = L.d / 2 - FRONT - D.d / 2;
  return {
    x: r4((Number(cab.x) || 0) - Math.sin(a) * zl),
    z: r4((Number(cab.z) || 0) + Math.cos(a) * zl),
    rotation: cab.rotation ?? 0,
    mount_y: r4((Number(cab.mount_y) || 0) + L.base + (u - 1) * HE + (rackKind(dev.type) === "desk" ? SHELF : 0)),
  };
}

/** Lage eines ausgebauten Geräts: vor der Schrankfront, gleiche Drehung. */
export function unrackPose(cab, dev) {
  const L = cabinetLayout(cab);
  const D = deviceDims(dev);
  const a = rad(cab.rotation);
  const zl = L.d / 2 + D.d / 2 + 0.1;
  return { x: r4((Number(cab.x) || 0) - Math.sin(a) * zl), z: r4((Number(cab.z) || 0) + Math.cos(a) * zl), rotation: cab.rotation ?? 0 };
}

/** Belegung: Feld u (1…units) = ID des Geräts oder null. */
export function newOccupancy(units) {
  return new Array(units + 2).fill(null);
}

/** Sind die HE u … u+he−1 frei (und liegen im Schrank)? */
export function slotFree(occ, units, u, he) {
  if (u < 1 || u + he - 1 > units) return false;
  for (let k = u; k < u + he; k++) if (occ[k]) return false;
  return true;
}

/** HE u … u+he−1 mit der ID belegen. */
export function markSlot(occ, u, he, id) {
  for (let k = u; k < u + he; k++) occ[k] = id;
}

/**
 * Unterste HE einer freien Lücke für he Einheiten. Ohne want die unterste Lücke, sonst die dem Wunsch nächste (bei
 * Gleichstand die untere); null, wenn keine Lücke groß genug ist.
 */
export function findSlot(occ, units, he, want = null) {
  const last = units - he + 1;
  if (last < 1) return null;
  if (want === null || !Number.isFinite(want)) {
    for (let u = 1; u <= last; u++) if (slotFree(occ, units, u, he)) return u;
    return null;
  }
  const w = Math.min(last, Math.max(1, Math.round(want)));
  for (let dist = 0; dist < last; dist++) for (const u of [w - dist, w + dist]) if (slotFree(occ, units, u, he)) return u;
  return null;
}

/**
 * Belegung eines Schranks in der Etage: {units, used, free, devices (von oben nach unten: {id, u, he, item}), occ}.
 * Geräte ohne gültige Lage (rack_u fehlt) zählen nicht.
 */
export function cabinetInfo(floor, cab) {
  const L = cabinetLayout(cab);
  const occ = newOccupancy(L.units);
  const devices = [];
  for (const d of floor?.furniture ?? []) {
    if (d.in_rack !== cab.id || !isRackable(d)) continue;
    const u = Math.round(Number(d.rack_u));
    const he = heOf(d);
    if (!Number.isFinite(u) || !slotFree(occ, L.units, u, he)) continue;
    markSlot(occ, u, he, d.id);
    devices.push({ id: d.id, u, he, item: d });
  }
  devices.sort((a, b) => b.u - a.u);
  const used = devices.reduce((n, d) => n + d.he, 0);
  return { units: L.units, used, free: L.units - used, devices, occ };
}
