// Reine Helfer für den Editor (ohne DOM): Fang-Hilfen (Fluchtlinien), Länge/Winkel eintippen,
// Kopieren/Einfügen/Vorlagen mehrerer Teile und das Bauplan-Foto unter dem Grundriss.

import { newId, shiftRoomRoof } from "./edit-ops.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

/**
 * Fluchtlinien: x bzw. z eines vorhandenen Punkts übernehmen, wenn der Zeiger auf weniger als tol daneben
 * liegt. Liefert den Punkt und die Hilfslinien ({axis: "x"|"z", v, from}) zum Anzeigen.
 */
export function alignGuides(p, vertices, tol) {
  let bx = null;
  let bz = null;
  for (const v of vertices) {
    const dx = Math.abs(v[0] - p[0]);
    const dz = Math.abs(v[1] - p[1]);
    if (dx <= tol && dx > 1e-9 && (!bx || dx < bx.d || (dx === bx.d && Math.abs(v[1] - p[1]) < Math.abs(bx.v[1] - p[1])))) bx = { d: dx, v };
    if (dz <= tol && dz > 1e-9 && (!bz || dz < bz.d || (dz === bz.d && Math.abs(v[0] - p[0]) < Math.abs(bz.v[0] - p[0])))) bz = { d: dz, v };
    if (dx <= 1e-9 && (!bx || bx.d > 0)) bx = { d: 0, v };
    if (dz <= 1e-9 && (!bz || bz.d > 0)) bz = { d: 0, v };
  }
  const point = [bx ? bx.v[0] : p[0], bz ? bz.v[1] : p[1]];
  const guides = [];
  if (bx) guides.push({ axis: "x", v: bx.v[0], from: bx.v });
  if (bz) guides.push({ axis: "z", v: bz.v[1], from: bz.v });
  return { point: point.map(r3), guides };
}

/** Punkt in Länge (m) und Winkel (Grad, 0 = rechts, 90 = nach oben im Plan) ab from. */
export function pointAt(from, len, deg) {
  const a = (deg * Math.PI) / 180;
  return [r3(from[0] + len * Math.cos(a)), r3(from[1] - len * Math.sin(a))];
}

/** Winkel (Grad, wie pointAt) und Länge von a nach b. */
export function segmentInfo(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const deg = (((Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI) % 360 + 360) % 360;
  return { len: r3(len), deg: Math.round(deg * 10) / 10 };
}

// ------------------------------------------------------------------ Mehrfachauswahl

export const MULTI_KINDS = ["room", "furniture", "outdoor", "wall"];
const LIST = { room: "rooms", furniture: "furniture", outdoor: "outdoor", wall: "walls" };

/** Punkte eines Teils (für Mittelpunkt, Rahmen und Verschieben). */
function itemPoints(kind, x) {
  if (kind === "furniture") return [[x.x, x.z]];
  if (kind === "wall") return [x.a, x.b];
  return x.points ?? [];
}

/** Gewählte Teile, die es in der Etage (noch) gibt. */
export function resolveRefs(floor, refs) {
  return (refs ?? []).map((r) => ({ ...r, item: (floor[LIST[r.kind]] ?? []).find((x) => x.id === r.id) })).filter((r) => r.item);
}

/** Rahmen (min/max) der gewählten Teile. */
export function refsBounds(floor, refs) {
  const pts = resolveRefs(floor, refs).flatMap((r) => itemPoints(r.kind, r.item));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** Teile, deren Punkte ganz im Rechteck a–b liegen (Rahmen aufziehen). */
export function refsInRect(floor, a, b) {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const z0 = Math.min(a[1], b[1]);
  const z1 = Math.max(a[1], b[1]);
  const inside = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1;
  const out = [];
  for (const kind of MULTI_KINDS) {
    for (const x of floor[LIST[kind]] ?? []) {
      const pts = itemPoints(kind, x);
      if (pts.length && pts.every(inside)) out.push({ kind, id: x.id });
    }
  }
  return out;
}

/** Ein/aus in der Mehrfachauswahl. */
export function toggleRef(refs, ref) {
  const has = refs.some((r) => r.kind === ref.kind && r.id === ref.id);
  return has ? refs.filter((r) => !(r.kind === ref.kind && r.id === ref.id)) : [...refs, { kind: ref.kind, id: ref.id }];
}

const shiftItem = (kind, x, dx, dz) => {
  const m = ([px, pz]) => [r3(px + dx), r3(pz + dz)];
  if (kind === "furniture") return { ...x, x: r3(x.x + dx), z: r3(x.z + dz) };
  if (kind === "wall") return { ...x, a: m(x.a), b: m(x.b) };
  const out = { ...x, points: x.points.map(m) };
  if (x.line) out.line = { ...x.line, points: x.line.points.map(m) };
  // Dinge auf dem eigenen Dach eines Raums gehen mit
  if (kind === "room" && x.roof?.items?.length) out.roof = shiftRoomRoof(x.roof, dx, dz);
  return out;
};

/** Gewählte Teile verschieben (Fenster/Türen hängen an Räumen und gehen so mit). */
export function moveRefs(floor, refs, dx, dz) {
  const out = { ...floor };
  for (const kind of MULTI_KINDS) {
    const ids = new Set(refs.filter((r) => r.kind === kind).map((r) => r.id));
    if (!ids.size) continue;
    out[LIST[kind]] = (floor[LIST[kind]] ?? []).map((x) => (ids.has(x.id) ? shiftItem(kind, x, dx, dz) : x));
  }
  return out;
}

/** Gewählte Teile entfernen, samt Fenster/Türen in gelöschten Räumen und Wänden. */
export function removeRefs(floor, refs) {
  const out = { ...floor };
  const gone = new Set();
  for (const kind of MULTI_KINDS) {
    const ids = new Set(refs.filter((r) => r.kind === kind).map((r) => r.id));
    if (!ids.size) continue;
    if (kind === "room" || kind === "wall") ids.forEach((id) => gone.add(id));
    out[LIST[kind]] = (floor[LIST[kind]] ?? []).filter((x) => !ids.has(x.id));
  }
  out.openings = (floor.openings ?? []).filter((o) => !gone.has(o.room_id) && !gone.has(o.wall));
  return out;
}

/**
 * Kopie der gewählten Teile, Koordinaten relativ zum Mittelpunkt (für Zwischenablage und Vorlagen).
 * Fenster/Türen der kopierten Räume und Wände kommen mit.
 */
export function copyRefs(floor, refs) {
  const list = resolveRefs(floor, refs);
  const b = refsBounds(floor, refs);
  if (!b) return null;
  const cx = r3((b.x0 + b.x1) / 2);
  const cz = r3((b.z0 + b.z1) / 2);
  const clip = { rooms: [], furniture: [], outdoor: [], walls: [], openings: [], size: [r3(b.x1 - b.x0), r3(b.z1 - b.z0)] };
  const owners = new Set();
  for (const r of list) {
    clip[LIST[r.kind]].push(shiftItem(r.kind, structuredClone(r.item), -cx, -cz));
    if (r.kind === "room" || r.kind === "wall") owners.add(r.id);
  }
  clip.openings = (floor.openings ?? []).filter((o) => owners.has(o.room_id) || owners.has(o.wall)).map((o) => structuredClone(o));
  return clip;
}

/** Zwischenablage/Vorlage bei at einfügen: neue IDs, Bezüge (Fenster → Raum) umgeschrieben. */
export function pasteClip(floor, clip, at, taken) {
  const ids = new Set(taken);
  const map = new Map();
  const fresh = (old, prefix) => {
    const id = newId(prefix, ids);
    ids.add(id);
    map.set(old, id);
    return id;
  };
  const out = { ...floor };
  const added = [];
  for (const kind of MULTI_KINDS) {
    const key = LIST[kind];
    const items = (clip[key] ?? []).map((x) => {
      const y = shiftItem(kind, structuredClone(x), at[0], at[1]);
      y.id = fresh(x.id, { room: "room", furniture: "m", outdoor: "aussen", wall: "wand" }[kind]);
      // Platzierte Geräte und HA-Bereich nicht doppelt verknüpfen
      if (kind === "room") y.area_id = null;
      if (kind === "furniture" && y.entity) y.entity = null;
      // Dinge auf dem eigenen Dach: neue IDs, ohne verknüpfte Entitäten
      if (kind === "room" && Array.isArray(y.roof?.items)) {
        for (const it of y.roof.items) {
          if (!it || typeof it !== "object") continue;
          it.id = fresh(it.id, it.type === "pv" ? "pv" : it.type || "dach");
          delete it.entity;
          delete it.energy_entity;
        }
      }
      added.push({ kind, id: y.id });
      return y;
    });
    if (items.length) out[key] = [...(floor[key] ?? []), ...items];
  }
  const ops = (clip.openings ?? [])
    .filter((o) => map.has(o.room_id) || map.has(o.wall))
    .map((o) => {
      const y = structuredClone(o);
      y.id = fresh(o.id, o.type ?? "opening");
      y.room_id = map.get(o.room_id) ?? o.room_id;
      if (o.wall) y.wall = map.get(o.wall);
      // fest verknüpfte Sensoren gehören zum Original
      for (const [k, v] of Object.entries(y)) if (typeof v === "string" && ENTITY.test(v)) delete y[k];
      return y;
    });
  if (ops.length) out.openings = [...(floor.openings ?? []), ...ops];
  return { floor: out, added };
}

/** Kurze Beschreibung einer Auswahl/Vorlage („2 Räume, 3 Möbel“). */
export function clipSummary(clip) {
  const parts = [];
  const n = (k) => (clip?.[k] ?? []).length;
  if (n("rooms")) parts.push(`${n("rooms")} ${n("rooms") === 1 ? "Raum" : "Räume"}`);
  if (n("furniture")) parts.push(`${n("furniture")} Möbel`);
  if (n("outdoor")) parts.push(`${n("outdoor")} ${n("outdoor") === 1 ? "Gartenfläche" : "Gartenflächen"}`);
  if (n("walls")) parts.push(`${n("walls")} ${n("walls") === 1 ? "Wand" : "Wände"}`);
  if (n("openings")) parts.push(`${n("openings")} Fenster/Türen`);
  return parts.join(", ") || "leer";
}

// ------------------------------------------------------------------ Bauplan-Foto

/** Standardlage: Bild füllt den Rahmen der Etage (oder 12 m breit am Ursprung). */
export function defaultBackground(bounds, aspect) {
  const w = bounds ? Math.max(4, (bounds.x1 - bounds.x0) * 1.2) : 12;
  const cx = bounds ? (bounds.x0 + bounds.x1) / 2 : 6;
  const cz = bounds ? (bounds.z0 + bounds.z1) / 2 : 6 * aspect;
  return { x: r3(cx - w / 2), z: r3(cz - (w * aspect) / 2), width: r3(w), aspect: r3(aspect), rotation: 0, opacity: 0.5, visible: true };
}

/**
 * Maßstab aus zwei Punkten: Die Strecke a–b ist in Wirklichkeit real Meter lang. Das Bild wird um a
 * skaliert, a bleibt also, wo es ist.
 */
export function scaleBackground(bg, a, b, real) {
  const cur = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(cur > 1e-6) || !(real > 0)) return bg;
  const k = real / cur;
  return { ...bg, x: r3(a[0] + (bg.x - a[0]) * k), z: r3(a[1] + (bg.z - a[1]) * k), width: r3(bg.width * k) };
}

/** Bild drehen (Grad, im Plan im Uhrzeigersinn), Ergebnis in (−180, 180]. */
export function rotateBackground(bg, deg) {
  let r = (((Number(bg.rotation) || 0) + deg) % 360 + 360) % 360;
  if (r > 180) r -= 360;
  return { ...bg, rotation: r3(r) };
}

/**
 * Bild so drehen, dass die Strecke a–b genau waagrecht bzw. senkrecht liegt (je nachdem, was näher ist);
 * Punkt a bleibt dabei an seiner Stelle. Liefert das neue Bild und die neue Lage von b.
 */
export function alignBackground(bg, a, b) {
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const delta = Math.round(ang / 90) * 90 - ang;
  if (Math.abs(delta) < 1e-9) return { bg: { ...bg }, b2: b, delta: 0 };
  const t = (delta * Math.PI) / 180;
  const rot = ([x, z]) => [x * Math.cos(t) - z * Math.sin(t), x * Math.sin(t) + z * Math.cos(t)];
  const h = bg.width * (bg.aspect || 0.75);
  const c = [bg.x + bg.width / 2, bg.z + h / 2];
  const ra = rot([a[0] - c[0], a[1] - c[1]]);
  const shift = [a[0] - c[0] - ra[0], a[1] - c[1] - ra[1]];
  const rb = rot([b[0] - a[0], b[1] - a[1]]);
  const out = rotateBackground({ ...bg, x: r3(bg.x + shift[0]), z: r3(bg.z + shift[1]) }, delta);
  return { bg: out, b2: [r3(a[0] + rb[0]), r3(a[1] + rb[1])], delta: r3(delta) };
}

/** Bildmaße für das Verkleinern im Browser: längste Seite höchstens max Pixel. */
export function fitSize(w, h, max = 1600) {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}
