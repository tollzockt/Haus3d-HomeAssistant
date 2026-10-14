// Leitungsenden an Geräten (ohne DOM, mit node testbar): pipe.ends = {a, b} – a = erster, b = letzter Punkt – mit
// Bezug {furniture: id} auf ein Möbelstück bzw. einen Katalog-Gegenstand der Etage oder {entity: entity_id} auf ein
// platziertes Gerät (floor.placements). Anschlusspunkt und Fang beim Zeichnen, Lage relativ zum Gerät (Mitziehen),
// Anschlusshöhe in 3D und das Gerät am Leitungsende (Last, Datenrate). Ein Bezug, dessen Ziel fehlt, zählt nicht.

import { furniturePose, hasPose, planSize } from "./pose.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fin = (...v) => v.every((x) => Number.isFinite(x));

/** Anschluss 6 cm vor der Rückseite: in einer Linie mit Leitungen vor der Wand (pipenodes.WALL_GAP). */
export const END_INSET = 0.06;
/** Abstand des Anschlusses von den Seiten eines Möbelstücks (m). */
const SIDE = 0.1;
/** Kleine (bis 45 × 45 cm) und flache Gegenstände (bis 12 cm tief) werden mittig angeschlossen. */
const SMALL = 0.45;
const FLAT = 0.12;
/** Kein Gerät: Bodenbeläge, Treppen, Stützen, Stellplätze rasten nicht ein. */
const NOT_DEVICE = /^(rug|stairs|stairwell|column|pillar|beam|parking|stepping_stone)$|^stairs_/;
/** Niedrige Anschlusshöhe an Geräten auf dem Boden (m): Strom und Netzwerk auf Steckdosenhöhe, Wasser etwas höher. */
export const FLOOR_CONNECT = { strom: 0.3, netzwerk: 0.3, wasser_kalt: 0.5, wasser_warm: 0.5 };

/** Gültiger Bezug {furniture} bzw. {entity} (genau eins von beiden), sonst null. */
export function endRef(ref) {
  if (!ref || typeof ref !== "object") return null;
  const f = ref.furniture;
  const e = ref.entity;
  if (typeof f === "string" && f && e == null) return { furniture: f };
  if (typeof e === "string" && e.includes(".") && f == null) return { entity: e };
  return null;
}

/** Kann ein Möbelstück Leitungen aufnehmen (alles außer Bodenbelag, Treppe, Stütze …)? */
export const isDevice = (m) => !!m && typeof m.id === "string" && fin(m.x, m.z) && !NOT_DEVICE.test(String(m.type ?? ""));

/**
 * Ziel eines Bezugs in der Etage: {kind: "furniture"|"placement", item, ref} oder null (gelöscht, andere Etage,
 * ungültig).
 */
export function endTarget(floor, ref) {
  const r = endRef(ref);
  if (!r) return null;
  if (r.furniture) {
    const item = (floor?.furniture ?? []).find((m) => m?.id === r.furniture);
    return item && isDevice(item) ? { kind: "furniture", item, ref: r } : null;
  }
  const item = (floor?.placements ?? []).find((p) => p?.entity_id === r.entity && fin(p.x, p.z));
  return item ? { kind: "placement", item, ref: r } : null;
}

/** Ziele beider Enden einer Leitung {a, b} (null = nicht angeschlossen). */
export function pipeEnds(pipe, floor) {
  return { a: endTarget(floor, pipe?.ends?.a), b: endTarget(floor, pipe?.ends?.b) };
}

/** Bezug eines Leitungsendes (k = "a" oder "b") lösen; ohne Bezüge fällt pipe.ends weg. */
export function unplugEnd(pipe, k) {
  if (!pipe?.ends || typeof pipe.ends !== "object") return;
  delete pipe.ends[k];
  if (!pipe.ends.a && !pipe.ends.b) delete pipe.ends;
}

/** Breite und Tiefe des Rahmens eines Möbelstücks (wie edit-ops.furnitureAt: ohne Maß 0,6 m). */
const frame = (m) => ({ w: Number(m.w) > 0 ? Number(m.w) : 0.6, d: Number(m.d) > 0 ? Number(m.d) : 0.6 });

/** Grundfläche im Plan: der Rahmen, geneigt/gekippt seine Hülle (pose.js; ohne Höhe zählt die Raumhöhe wie in edit-ops.footprintSize). */
function dims(m, ceil = 2.5) {
  const { w, d } = frame(m);
  if (!hasPose(m)) return { w, d };
  const h = Number(m.h) > 0 ? Number(m.h) : null;
  const [pw, pd] = planSize(m, w, d, h ?? ceil, h ? null : ceil);
  return { w: pw, d: pd };
}

/** Lage eines Ziels: Mitte und Drehung (Grad; platzierte Geräte drehen ihren Anschluss nicht). */
const poseOf = (t) => ({ x: Number(t.item.x), z: Number(t.item.z), rot: t.kind === "furniture" ? Number(t.item.rotation) || 0 : 0 });

/** Punkt p in lokalen Koordinaten (Breite x, Tiefe z; Vorderseite +z) einer Lage. */
function toLocal(pose, p) {
  const a = (pose.rot * Math.PI) / 180;
  const dx = p[0] - pose.x;
  const dz = p[1] - pose.z;
  return [dx * Math.cos(a) + dz * Math.sin(a), -dx * Math.sin(a) + dz * Math.cos(a)];
}

/** Lokale Koordinaten zurück in die Etage. */
function toWorld(pose, [lx, lz]) {
  const a = (pose.rot * Math.PI) / 180;
  return [pose.x + lx * Math.cos(a) - lz * Math.sin(a), pose.z + lx * Math.sin(a) + lz * Math.cos(a)];
}

/**
 * Anschlusspunkt am Gerät für den Zeiger p: platziertes Gerät = sein Punkt; kleine und flache Möbel mittig;
 * sonst an der Rückseite (6 cm nach innen), entlang der Rückseite dem Zeiger am nächsten (10 cm von den Seiten;
 * ohne p in der Mitte der Rückseite).
 */
export function endAnchor(target, p = null) {
  const m = target.item;
  if (target.kind === "placement") return [r3(Number(m.x)), r3(Number(m.z))];
  const { w, d } = dims(m);
  const pose = poseOf(target);
  if ((w <= SMALL && d <= SMALL) || d <= FLAT) return [r3(pose.x), r3(pose.z)];
  const half = Math.max(0, w / 2 - SIDE);
  const lx = p ? clamp(toLocal(pose, p)[0], -half, half) : 0;
  return toWorld(pose, [lx, -d / 2 + Math.min(END_INSET, d / 2)]).map(r3);
}

/**
 * Nächstes Gerät am Zeiger p: Möbel, wenn p in der Grundfläche (gedrehtes Rechteck) liegt oder knapp daneben – so
 * weit, dass um die Mitte mindestens der Fangradius tol bleibt (schmale Gegenstände wie Steckdosen bis tol, große
 * nur am Rand, damit Punkte an der Wand dahinter weiter an der Wand einrasten); platzierte Geräte bis tol um ihren
 * Punkt. Gewertet wird der Abstand zum Anschlusspunkt (bei bis 2 cm Unterschied gewinnt der kleinere Gegenstand,
 * z. B. die Steckdose vor dem Sideboard).
 * @returns {{target: object, ref: object, q: number[], d: number}|null}
 */
export function deviceSnap(floor, p, tol) {
  let best = null;
  const take = (target, q, area) => {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d - 0.02 || (d <= best.d + 0.02 && area < best.area)) best = { target, ref: target.ref, q, d, area };
  };
  for (const m of floor?.furniture ?? []) {
    if (!isDevice(m)) continue;
    const { w, d } = dims(m);
    const t = { kind: "furniture", item: m, ref: { furniture: m.id } };
    const [lx, lz] = toLocal(poseOf(t), p);
    const out = Math.hypot(Math.max(0, Math.abs(lx) - w / 2), Math.max(0, Math.abs(lz) - d / 2));
    if (out > Math.max(0.02, tol - Math.min(w, d) / 2)) continue;
    take(t, endAnchor(t, p), w * d);
  }
  for (const pl of floor?.placements ?? []) {
    if (typeof pl?.entity_id !== "string" || !fin(pl.x, pl.z) || Math.hypot(p[0] - pl.x, p[1] - pl.z) > tol) continue;
    const t = { kind: "placement", item: pl, ref: { entity: pl.entity_id } };
    take(t, endAnchor(t), 0);
  }
  if (!best) return null;
  const { area, ...out } = best;
  return out;
}

/**
 * Wohin wandert ein Leitungsende q, wenn das Gerät von Lage before nach after geht (verschoben, gedreht, in der
 * Größe geändert)? Die Lage relativ zum Gerät bleibt: nah an Rück- bzw. Vorderseite (bis 10 cm) mit gleichem Abstand
 * zu dieser Seite, sonst anteilig; quer anteilig zur Breite.
 */
export function followPoint(q, before, after) {
  const pb = poseOf(before);
  const pa = poseOf(after);
  if (before.kind !== "furniture" || after.kind !== "furniture") return [r3(q[0] + pa.x - pb.x), r3(q[1] + pa.z - pb.z)];
  const [lx, lz] = toLocal(pb, q);
  const db = dims(before.item);
  const da = dims(after.item);
  const edge = db.d / 2 - Math.abs(lz);
  const lz2 = Math.abs(lz) > 1e-9 && edge <= SIDE ? Math.sign(lz) * Math.max(0, da.d / 2 - edge) : (lz * da.d) / db.d;
  return toWorld(pa, [(lx * da.w) / db.w, lz2]).map(r3);
}

/** Hat sich die Lage (Mitte, Drehung, Maße) eines Ziels geändert? */
export function targetMoved(before, after) {
  const b = before.item;
  const a = after.item;
  const same = (k) => Math.abs((Number(a[k]) || 0) - (Number(b[k]) || 0)) < 1e-9;
  // geneigt/gekippt ändert die Hülle (und bei Neigung auch die Höhe) – dann wandert das Ende mit
  const pose = same("tilt") && same("roll") && (same("h") || !(hasPose(a) || hasPose(b)));
  return !(same("x") && same("z") && (before.kind !== "furniture" || (same("rotation") && same("w") && same("d") && pose)));
}

/** Verknüpfte Entität eines Ziels: Entität des Möbelstücks bzw. das platzierte Gerät; sonst null. */
export function targetEntity(t) {
  const e = t?.kind === "placement" ? t.item.entity_id : t?.item?.entity;
  return typeof e === "string" && e.includes(".") ? e : null;
}

/**
 * Ende, an dem die Last einer Leitung hängt: das Gerät mit Entität (zuerst b), sonst ein angeschlossenes Gerät
 * (zuerst b), sonst wie bisher das Ende b. Geräte sind Verbraucher – eine Leitung, die an einem Gerät beginnt,
 * fließt zu diesem hin.
 */
export function loadEnd(targets) {
  if (targetEntity(targets?.b)) return "b";
  if (targetEntity(targets?.a)) return "a";
  if (targets?.b) return "b";
  return targets?.a ? "a" : "b";
}

/** Gerät (Entität) am Leitungsende aus den Zielen {a, b}: am Ende der Last, sonst null. */
export const endDevice = (targets) => targetEntity(targets?.[loadEnd(targets)]);

/** Standard-Höhe platzierter Geräte (wie im Panel): Licht unter der Decke, Klima 0,6 m, sonst 1,1 m. */
function placementY(pl, floorHeight) {
  const y = Number(pl.y);
  if (pl.y != null && Number.isFinite(y)) return y;
  const domain = String(pl.entity_id).split(".")[0];
  return domain === "light" ? floorHeight - 0.25 : domain === "climate" ? 0.6 : 1.1;
}

/**
 * Höhenbereich [unten, oben] eines Ziels über dem Boden. furnSpan(item, floorHeight) liefert ihn für Möbel
 * (furnitureSpan mit furniture.js:furnitureBaseY); ohne: eigene Montagehöhe bzw. Boden plus Höhe.
 */
export function targetSpan(target, floorHeight = 2.5, furnSpan = null) {
  const m = target.item;
  if (target.kind === "placement") {
    const y = placementY(m, floorHeight);
    return [y, y];
  }
  if (furnSpan) return furnSpan(m, floorHeight);
  const h = Number(m.h) > 0 ? Number(m.h) : 0.6;
  const y = Number.isFinite(Number(m.mount_y)) && m.mount_y != null ? Number(m.mount_y) : 0;
  const { w, d } = frame(m);
  return [y, y + (hasPose(m) ? furniturePose(m, w, d, h).h : h)]; // geneigt/gekippt: Höhe der Hülle
}

/**
 * Höhenbereich eines Möbelstücks mit der Montagehöhe baseY(item, floorHeight, h) und Standardmaßen defs (Typ → [Name, w,
 * d, h]). topY(item, floorHeight) ist die Oberkante (furniture.js:furnitureTopY, geneigt/gekippt: höchste Ecke); ohne
 * sie gilt Unterkante plus Höhe.
 */
export const furnitureSpan = (baseY, defs = {}, topY = null) => (item, floorHeight) => {
  const h = Number(item.h) > 0 ? Number(item.h) : defs[item.type]?.[3] || floorHeight;
  const y = baseY(item, floorHeight, h);
  return [y, topY ? topY(item, floorHeight) : y + h];
};

/**
 * Anschlusshöhe am Gerät (m über dem Boden) aus seinem Höhenbereich: an der Decke (Oberkante bis 5 cm unter der
 * Decke, nicht auf dem Boden) die Oberkante; an der Wand bzw. erhöht (Unterkante über 5 cm) die Mitte; auf dem
 * Boden niedrig (Strom und Netzwerk 0,3 m, Wasser 0,5 m; höchstens die Oberkante).
 */
export function connectHeight([lo, hi], type, floorHeight = 2.5) {
  if (!(hi > lo)) return r3(lo);
  if (lo > 0.05 && hi >= floorHeight - 0.05) return r3(hi);
  if (lo > 0.05) return r3((lo + hi) / 2);
  return r3(Math.min(hi, FLOOR_CONNECT[type] ?? 0.3));
}

/** Anschlusshöhe eines Ziels für eine Leitung des Mediums type in der Etage floor. */
export function endHeight(target, type, floor, furnSpan = null) {
  const fh = Number(floor?.height) || 2.5;
  return connectHeight(targetSpan(target, fh, furnSpan), type, fh);
}
