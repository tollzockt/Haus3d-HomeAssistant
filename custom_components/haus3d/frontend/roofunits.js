// Dach-Einheiten ohne Three.js (mit node testbar): Hausdach, eigene Dächer von Räumen (gemeinsam bei gleicher
// Dachform) und freie Dachteile je Etage – Modell, Flächen, Dinge darauf (am Raum darunter), Bearbeiten,
// Umwandeln, Modelle über einem Dachgeschoss.

import { adjustRoofParts, onRoomEdge, partHipEnds, roofBase, roofFacePolys, roofModel, roofSurfaceAt, roomRoofGroups, roomRoofSettings, roomRoofType } from "./exterior.js";
import { GROUP_TYPES, PART_PITCH, ROOM_ROOF_TYPES, SINGLE_TYPES, framesFor, isFlatType, newRoofPart, partSettings, partShape } from "./roofshapes.js";
import { distToEdges, labelPoint, pointInPolygon, signedArea } from "./walls.js";

const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
const tanOf = (deg) => Math.tan((deg * Math.PI) / 180);
const NAMES = Object.fromEntries(ROOM_ROOF_TYPES);
const polyOk = (pts) => Array.isArray(pts) && pts.length >= 3 && pts.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
const itemsOf = (r) => (Array.isArray(r?.items) ? r.items.filter((it) => it && typeof it === "object") : []);
const hasPos = (it) => Number.isFinite(it?.x) && Number.isFinite(it?.z);

/** Schlüssel, die in einer Gruppe auf alle Räume gespiegelt werden (gemeinsames Aussehen). */
export const ROOF_SHARED = ["type", "pitch", "overhang", "direction", "flip", "wing_end", "color", "texture", "gable_color", "gable_texture"];
/** Zusatzfelder der Einzelformen (Mansard-, Krüppelwalmdach, Dachterrasse). */
export const SINGLE_EXTRA = ["pitch_low", "break", "ends", "hip_ratio", "railing", "railing_height"];

/**
 * Schlüssel einer Dach-Einheit: "house", "room:<Etage>:<Leiterraum>" oder "part:<Etage>:<Teil>". Die Etagen-ID
 * steht kodiert drin (eine importierte Etage darf „:“ enthalten); gewöhnliche IDs bleiben unverändert.
 */
export const unitKey = (kind, floorId = null, id = null) => (kind === "house" ? "house" : `${kind}:${encodeURIComponent(floorId)}:${id}`);

/** Schlüssel zerlegen: "house" (oder leer) → {kind}; sonst {kind, floorId, id} (id = Rest mit „:“). */
export function parseUnitKey(key) {
  if (!key || key === "house") return { kind: "house" };
  const [kind, f, ...rest] = String(key).split(":");
  let floorId = f;
  try {
    floorId = decodeURIComponent(f);
  } catch {
    // ungültige Kodierung: roh lassen
  }
  return { kind, floorId, id: rest.join(":") };
}

const LIMITS = { overhang: [0, 1.5], pitch_low: [20, 85], break: [0.1, 0.9], hip_ratio: [0.1, 0.9], railing_height: [0.3, 2.5], base: [-5, 20], diameter: [0.8, 30] };

/** Eingabe eines Formularfelds begrenzen (Neigung 5…60° bei Flach-, Sattel-, Walm- und Pultdach, sonst 5…80°). */
export function clampRoof(key, v, type = "gable") {
  const lim = key === "pitch" ? [5, GROUP_TYPES.includes(type) ? 60 : 80] : LIMITS[key];
  if (!lim) return v;
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(lim[1], Math.max(lim[0], x)) : lim[0];
}

/** Ansatzhöhe eines eigenen Dachs: Flachdach und Dachterrasse auf Raumhöhe, sonst wie das Hausdach (Kniestock). */
export function unitTop(floor, type) {
  return isFlatType(type) ? (floor?.elevation ?? 0) + (floor?.height ?? 2.5) : roofBase(floor);
}

/** Anpassung eines Dachteils setzen (roof.adjust[k]); leere Einträge fallen weg. */
export function setAdjust(roof, k, next) {
  const list = [...(roof.adjust ?? [])];
  while (list.length <= k) list.push(null);
  const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => Math.abs(v) > 1e-9).map(([key, v]) => [key, r3(v)]));
  list[k] = Object.keys(clean).length ? clean : null;
  while (list.length && !list[list.length - 1]) list.pop();
  if (list.length) roof.adjust = list;
  else delete roof.adjust;
}

/** Raum, über dem p liegt; außerhalb aller Räume (z. B. auf dem Überstand) der nächste. null ohne Räume. */
export function ownerRoom(rooms, p) {
  const list = (rooms ?? []).filter((r) => polyOk(r?.points));
  if (!list.length || !p) return null;
  return list.find((r) => pointInPolygon(p, r.points)) ?? list.reduce((best, r) => (distToEdges(p, r.points) < distToEdges(p, best.points) ? r : best));
}

/** Dinge aller rooms[].roof.items nach ihrer Lage an den Raum darunter hängen; leere Listen löschen. */
export function distributeItems(rooms) {
  const list = (rooms ?? []).filter((r) => r?.roof);
  const moves = list.map((r) => itemsOf(r.roof).map((it) => [hasPos(it) ? ownerRoom(list, [it.x, it.z]) ?? r : r, it]));
  for (const r of list) delete r.roof.items;
  for (const [owner, it] of moves.flat()) (owner.roof.items ??= []).push(it);
}

function mirror(from, to, keys) {
  for (const k of keys) {
    if (from[k] === undefined) delete to[k];
    else to[k] = structuredClone(from[k]);
  }
}

const houseUnit = (building, m) => ({ key: "house", kind: "house", floorId: m.floor?.id ?? null, label: "Hausdach", rooms: m.rooms, spec: building.settings?.roof ?? null, items: itemsOf(building.settings?.roof), model: m });

// Dach der alten Arten über einer Gruppe (Rahmen wie das Hausdach)
function groupModel(building, floor, g, key) {
  const roof = g.roof;
  const wall = building.settings?.wall_exterior ?? 0.24;
  const tan = tanOf(roof.pitch);
  const top = unitTop(floor, roof.type);
  const parts = adjustRoofParts(framesFor(g.rooms, { wall, overhang: roof.overhang, direction: roof.direction }), g.leader.roof.adjust, !!roof.flip);
  for (const fr of parts) fr.hipEnds = partHipEnds(fr, roof);
  const eave = top - roof.overhang * tan;
  const ridgeY = !parts.length ? top : roof.type === "flat" ? top + 0.25 : eave + Math.max(...parts.map((fr) => (roof.type === "shed" ? fr.width : fr.width / 2))) * tan;
  return { key, kind: "room", roof, floor, rooms: g.rooms, parts, top, eave, tan, pitched: roof.type !== "flat", ridgeY };
}

// Etage direkt darüber (Belag einer Dachterrasse knapp unter ihrem Boden)
function floorAbove(building, floor) {
  const top = (floor.elevation ?? 0) + (floor.height ?? 2.5);
  return (building.floors ?? []).filter((f) => f !== floor && (f.elevation ?? 0) >= top - 0.1 && (f.elevation ?? 0) <= top + 0.8).sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))[0] ?? null;
}

// Einheiten einer Etage: Raum-Gruppen, dann freie Teile; Formen in zwei Durchgängen (offene Enden)
function floorUnits(building, floor, hm) {
  const wall = building.settings?.wall_exterior ?? 0.24;
  const wallIn = building.settings?.wall_interior ?? 0.12;
  const house = hm && hm.floor?.id === floor.id ? hm : null;
  const groups = roomRoofGroups(floor);
  const parts = (floor.roofs ?? []).filter((p) => p && typeof p === "object" && p.id);
  const rooms = (floor.rooms ?? []).filter((r) => polyOk(r.points));
  const under = (pts) => (polyOk(pts) ? rooms.filter((r) => pointInPolygon(labelPoint(r.points), pts)) : []);
  const partRooms = new Map(parts.map((p) => [p, under(p.points)]));
  // Räume unter Steildächern und Dachterrassen: dort braucht eine Dachterrasse kein Geländer
  const pitched = [
    ...(house && house.roof.type !== "flat" ? house.rooms : []),
    ...groups.filter((g) => !isFlatType(g.roof.type)).flatMap((g) => g.rooms),
    ...parts.filter((p) => !isFlatType(partSettings(p).type)).flatMap((p) => partRooms.get(p)),
  ];
  const terraces = [...groups.filter((g) => g.roof.type === "terrace").map((g) => g.leader), ...parts.filter((p) => p.type === "terrace" && polyOk(p.points))];
  const above = floorAbove(building, floor);
  const units = [];
  const shapes = [];
  for (const g of groups) {
    const key = unitKey("room", floor.id, g.leader.id);
    const unit = { key, kind: "room", floorId: floor.id, label: g.rooms.map((r) => r.name || r.id).join(" + "), rooms: g.rooms, spec: g.leader.roof, items: g.rooms.flatMap((r) => itemsOf(r.roof)), model: null };
    if (GROUP_TYPES.includes(g.roof.type)) {
      unit.model = groupModel(building, floor, g, key);
      // zu schmal (Kanten unter 0,4 m fallen zusammen): wie eine Form ohne Gestalt – rot gestrichelt, wählbar, löschbar
      if (!unit.model.parts.length) {
        unit.model = null;
        unit.broken = true;
      }
    }
    // Raumwände haben keine eigene Höhe: kein Höhenversatz (base) am Raumdach
    else shapes.push({ unit, raw: { ...g.leader.roof, type: g.roof.type, points: g.leader.points, base: 0 }, top: unitTop(floor, g.roof.type), self: g.rooms, own: g.leader });
    units.push(unit);
  }
  for (const p of parts) {
    const s = partSettings(p);
    const unit = { key: unitKey("part", floor.id, p.id), kind: "part", floorId: floor.id, label: p.name || NAMES[s.type], rooms: partRooms.get(p), spec: p, items: itemsOf(p), model: null };
    shapes.push({ unit, raw: p, top: unitTop(floor, s.type) + s.base, self: partRooms.get(p), own: p });
    units.push(unit);
  }
  // Durchgang 1: alle Formen
  for (const sh of shapes) {
    sh.ctx = { wall, top: sh.top };
    if (sh.raw.type === "terrace" && polyOk(sh.raw.points)) {
      const pts = sh.raw.points;
      const n = pts.length;
      const others = rooms.filter((r) => !sh.self.includes(r));
      const blockers = [...(above?.rooms ?? []), ...terraces.filter((t) => t !== sh.own), ...pitched.filter((r) => !sh.self.includes(r))].filter((r) => polyOk(r?.points));
      sh.ctx.deck = above ? Math.max(sh.top + 0.05, (above.elevation ?? 0) - 0.01) : sh.top + 0.15;
      sh.ctx.edgeOffsets = pts.map((a, i) => (onRoomEdge(a, pts[(i + 1) % n], others) ? wallIn / 2 : wall));
      sh.ctx.railFree = pts.map((a, i) => !onRoomEdge(a, pts[(i + 1) % n], blockers));
    }
    sh.shape = partShape(sh.raw, sh.ctx);
  }
  // Durchgang 2: Enden, die unter einem anderen Dach derselben Etage stecken, bleiben offen (ohne Giebel)
  const first = [...(house ? [{ m: house }] : []), ...units.filter((u) => u.model).map((u) => ({ m: u.model })), ...shapes.filter((x) => x.shape).map((x) => ({ m: x.shape, sh: x }))];
  for (const sh of shapes) {
    if (!sh.shape?.probes?.length) continue;
    const others = first.filter((o) => o.sh !== sh).map((o) => o.m);
    const open = sh.shape.frames.map(() => [false, false]);
    let any = false;
    for (const pr of sh.shape.probes) {
      if (pr.pts.every(([x, z, y]) => others.some((m) => (roofSurfaceAt(m, [x, z])?.y ?? -Infinity) >= y - 0.02))) {
        open[pr.k][pr.side] = true;
        any = true;
      }
    }
    if (any) sh.shape = partShape(sh.raw, { ...sh.ctx, open });
  }
  for (const sh of shapes) {
    const u = sh.unit;
    if (!sh.shape) {
      // zu klein oder verdreht: bleibt wählbar und löschbar, alle anderen überspringen es
      u.broken = true;
      if (u.kind === "part") u.rooms = [];
      continue;
    }
    const sp = sh.shape;
    u.model = { key: u.key, kind: u.kind, roof: partSettings(sh.raw), floor, rooms: u.rooms, parts: sp.frames ?? [], top: sp.top, eave: sp.eave, tan: sp.tan, pitched: sp.pitched, ridgeY: sp.ridgeY, shape: sp, at: sp.at };
  }
  return units;
}

/**
 * Dach-Einheiten: das Hausdach (wenn house und auf der Etage), dann je Etage die Raum-Gruppen und die freien
 * Dachteile. Einheit: {key, kind, floorId, label, rooms, spec, items, model, broken?}.
 */
export function roofUnits(building, floorId = null, { house = true, houseModel = roofModel(building) } = {}) {
  const out = [];
  if (house && houseModel && (floorId == null || houseModel.floor?.id === floorId)) out.push(houseUnit(building, houseModel));
  for (const floor of building?.floors ?? []) {
    if (floorId != null && floor.id !== floorId) continue;
    out.push(...floorUnits(building, floor, houseModel));
  }
  return out;
}

/** Einheit zu einem Schlüssel; Räume über die Mitgliedschaft (Ergebnis mit kanonischem Schlüssel). null, wenn unbekannt. */
export function findUnit(building, key) {
  const k = parseUnitKey(key);
  if (k.kind === "house") {
    const m = roofModel(building);
    return m ? houseUnit(building, m) : null;
  }
  if (!(building?.floors ?? []).some((f) => f.id === k.floorId)) return null;
  const units = roofUnits(building, k.floorId, { house: false });
  if (k.kind === "room") return units.find((u) => u.kind === "room" && u.rooms.some((r) => r.id === k.id)) ?? null;
  return units.find((u) => u.key === unitKey(k.kind, k.floorId, k.id)) ?? null;
}

/** Einheit des eigenen Dachs eines Raums (oder null). */
export function unitForRoom(building, floorId, roomId) {
  return findUnit(building, unitKey("room", floorId, roomId));
}

/** Gespeicherte Daten einer Einheit: settings.roof, roof des Leiters bzw. das Dachteil. */
export function unitSpec(building, key) {
  const k = parseUnitKey(key);
  if (k.kind === "house") return building?.settings?.roof ?? null;
  const floor = (building?.floors ?? []).find((f) => f.id === k.floorId);
  if (k.kind === "room") return roomRoofGroups(floor).find((g) => g.rooms.some((r) => r.id === k.id))?.leader.roof ?? null;
  if (k.kind === "part") return (floor?.roofs ?? []).find((p) => p?.id === k.id) ?? null;
  return null;
}

// kanonischer Schlüssel des Raumdachs eines Raums (oder null)
function roomKey(floor, roomId) {
  const g = roomRoofGroups(floor).find((x) => x.rooms.some((r) => r.id === roomId));
  return g ? unitKey("room", floor.id, g.leader.id) : null;
}

/**
 * Nach einer Änderung an Raumdächern: Gruppen mit anderen Mitgliedern oder anderem Leiter verlieren ihre
 * Kanten-Anpassungen (report.droppedAdjust) und bekommen die gemeinsamen Werte des Leiters.
 */
export function settleRoomRoofs(building, floorId, before, report = {}) {
  const floor = (building?.floors ?? []).find((f) => f.id === floorId);
  if (!floor) return;
  const sig = (g) => g.rooms.map((r) => r.id).join(",");
  const old = new Set((before ?? []).map(sig));
  for (const g of roomRoofGroups(floor)) {
    if (old.has(sig(g))) continue;
    let had = false;
    for (const r of g.rooms) {
      if (r.roof.adjust !== undefined) {
        delete r.roof.adjust;
        had = true;
      }
    }
    if (had) report.droppedAdjust = true;
    for (const r of g.rooms) if (r !== g.leader) mirror(g.leader.roof, r.roof, ROOF_SHARED);
  }
}

/**
 * Einheit an Ort und Stelle ändern: fn bekommt settings.roof, das roof des Leiters bzw. das Dachteil. Der
 * Rückgabewert von fn wird ignoriert. Raum-Gruppen: Dinge nur für fn beim Leiter, danach wieder am Raum
 * darunter; gemeinsame Werte auf alle bisherigen Gruppenräume. → kanonischer Schlüssel oder null (Dach weg).
 */
export function editUnit(building, key, fn, report = {}) {
  const k = parseUnitKey(key);
  if (k.kind === "house") {
    building.settings ??= {};
    building.settings.roof = structuredClone(building.settings.roof ?? {});
    fn(building.settings.roof);
    return "house";
  }
  const floor = (building?.floors ?? []).find((f) => f.id === k.floorId);
  if (!floor) return null;
  if (k.kind === "part") {
    const part = (floor.roofs ?? []).find((p) => p?.id === k.id);
    if (!part) return null;
    fn(part);
    if (Array.isArray(part.items) && !part.items.length) delete part.items;
    if (Array.isArray(part.adjust) && !part.adjust.some(Boolean)) delete part.adjust;
    return unitKey("part", floor.id, part.id);
  }
  if (k.kind !== "room") return null;
  const before = roomRoofGroups(floor);
  const g = before.find((x) => x.rooms.some((r) => r.id === k.id));
  if (!g) return null;
  const lead = g.leader;
  const members = g.rooms;
  const oldType = roomRoofType(lead);
  // Dinge aller Gruppenräume nur für fn beim Leiter sammeln
  const items = members.flatMap((r) => r.roof.items ?? []);
  for (const r of members) delete r.roof.items;
  if (items.length) lead.roof.items = items;
  fn(lead.roof);
  if (!lead.roof || roomRoofType(lead) === "none") {
    for (const r of members) delete r.roof; // die Dinge gehen mit (die Rückfrage stellt vorher der Editor)
    settleRoomRoofs(building, floor.id, before, report);
    return null;
  }
  const type = roomRoofType(lead);
  for (const r of members) {
    if (r === lead) continue;
    mirror(lead.roof, r.roof, ROOF_SHARED);
    if (SINGLE_TYPES.includes(type) && type !== oldType) mirror(lead.roof, r.roof, SINGLE_EXTRA);
  }
  distributeItems(members);
  settleRoomRoofs(building, floor.id, before, report);
  return roomKey(floor, k.id);
}

// berühren sich zwei Räume (Rahmen, wie roomRoofGroups)?
function touches(a, b) {
  const box = (r) => {
    const xs = r.points.map((p) => p[0]);
    const zs = r.points.map((p) => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  };
  const [p, q] = [box(a), box(b)];
  return Math.max(p[0] - q[1], q[0] - p[1], p[2] - q[3], q[2] - p[3]) < 0.05;
}

/**
 * Eigenes Dach für einen Raum anlegen. Berührt er eine Gruppe gleicher Form (ohne „separate“), übernimmt er
 * deren gemeinsame Werte (gemeinsames Dach); sonst Startwerte der Form. → {key, joined}
 */
export function addRoomRoof(building, floorId, roomId, type, report = {}) {
  const floor = (building?.floors ?? []).find((f) => f.id === floorId);
  const room = floor?.rooms?.find((r) => r.id === roomId);
  const t = ROOM_ROOF_TYPES.some(([x]) => x === type) && type !== "none" ? type : "gable";
  if (!room || !polyOk(room.points)) return { key: null, joined: false };
  const before = roomRoofGroups(floor);
  const src = GROUP_TYPES.includes(t) ? before.find((g) => g.roof.type === t && !g.rooms.includes(room) && g.rooms.some((r) => !r.roof.separate && touches(r, room))) : null;
  const prev = room.roof ?? {};
  let roof;
  if (src) {
    roof = {};
    mirror(src.leader.roof, roof, ROOF_SHARED);
    roof.type = t;
  } else if (t === "terrace") roof = { type: t, overhang: 0 };
  else if (GROUP_TYPES.includes(t)) roof = { type: t, pitch: 25, overhang: 0.3 };
  else roof = { type: t, pitch: PART_PITCH[t], overhang: 0.3 };
  if (prev.items?.length) roof.items = prev.items;
  if (prev.separate && !src) roof.separate = true;
  const house = roofModel(building);
  room.roof = roof;
  settleRoomRoofs(building, floorId, before, report);
  report.adopted = adoptHouseItems(building, house); // Dinge des Hausdachs über dem Raum ziehen mit
  return { key: roomKey(floor, roomId), joined: !!src };
}

/** Eigenes Dach eines Raums entfernen; seine Dinge gehen an den nächsten Raum der Gruppe. */
export function removeRoomRoof(building, floorId, roomId, report = {}) {
  const floor = (building?.floors ?? []).find((f) => f.id === floorId);
  const room = floor?.rooms?.find((r) => r.id === roomId);
  if (!room?.roof) return false;
  const before = roomRoofGroups(floor);
  const g = before.find((x) => x.rooms.includes(room));
  const rest = (g?.rooms ?? []).filter((r) => r !== room);
  const items = itemsOf(room.roof);
  if (items.length && rest.length) {
    for (const it of items) {
      const owner = (hasPos(it) ? ownerRoom(rest, [it.x, it.z]) : null) ?? rest[0];
      (owner.roof.items ??= []).push(it);
    }
  }
  delete room.roof;
  settleRoomRoofs(building, floorId, before, report);
  return true;
}

/** Raum von seiner Gruppe trennen (on) bzw. wieder verbinden. → kanonischer Schlüssel seines Dachs danach. */
export function setSeparate(building, floorId, roomId, on, report = {}) {
  const floor = (building?.floors ?? []).find((f) => f.id === floorId);
  const room = floor?.rooms?.find((r) => r.id === roomId);
  if (!room?.roof) return null;
  const before = roomRoofGroups(floor);
  if (on) room.roof.separate = true;
  else delete room.roof.separate;
  settleRoomRoofs(building, floorId, before, report);
  return roomKey(floor, roomId);
}

/**
 * Einheit unter einem Punkt (höchste Fläche). Die zuletzt gewählte Einheit gewinnt, wenn ihre Fläche dort
 * höchstens 0,05 m unter der höchsten liegt. → {unit, hit} | null
 */
export function unitAt(units, p, preferKey = null) {
  let best = null;
  let pref = null;
  for (const u of units ?? []) {
    if (!u.model) continue;
    const hit = roofSurfaceAt(u.model, p);
    if (!hit) continue;
    if (!best || hit.y > best.hit.y) best = { unit: u, hit };
    if (preferKey && u.key === preferKey) pref = { unit: u, hit };
  }
  return pref && pref.hit.y >= best.hit.y - 0.05 ? pref : best;
}

/** Höchste Dachfläche über p aus einer Liste von Modellen: {y, out, tan, part, model} | null. */
export function surfaceAt(models, p) {
  let best = null;
  for (const m of models ?? []) {
    const h = roofSurfaceAt(m, p);
    if (h && (!best || h.y > best.y)) best = { ...h, model: m };
  }
  return best;
}

/** Modelle, zu deren Räumen einer der Räume gehört (Hausdach, Raumdach, Dachteil über labelPoint). */
export function ownModels(models, roomIds) {
  const ids = (roomIds ?? []).filter(Boolean);
  return (models ?? []).filter((m) => (m.rooms ?? []).some((r) => ids.includes(r.id)));
}

/** Dachfläche über p: zuerst die Dächer der eigenen Räume, sonst alle Modelle. */
export function surfaceFor(models, p, roomIds = []) {
  const own = ownModels(models, roomIds);
  return surfaceAt(own.length ? own : models, p);
}

/** Modelle der übrigen Einheiten derselben Etage (nur mit Modell). */
export function floorModels(units, floorId, exceptKey = null) {
  return (units ?? []).filter((u) => u.model && u.floorId === floorId && u.key !== exceptKey).map((u) => u.model);
}

const faceOp = (out) => 0.5 + 0.3 * (0.5 + 0.5 * (0.6 * out[0] - 0.8 * out[1]));

/** Flächen einer Einheit für den Plan: {faces: [{poly, op, k}], ridges: [[a, b]]}; kaputte Teile leer. */
export function unitFaces(unit) {
  const m = unit?.model;
  if (!m) return { faces: [], ridges: [] };
  if (m.shape) return { faces: m.shape.faces.map((f) => ({ poly: f.poly, op: f.out ? faceOp(f.out) : 0.6, k: f.k })), ridges: m.shape.ridges };
  const faces = [];
  const ridges = [];
  m.parts.forEach((fr, k) => {
    const r = roofFacePolys(m.roof, fr);
    for (const [poly, op] of r.faces) faces.push({ poly, op, k });
    if (r.ridge) ridges.push(r.ridge);
  });
  return { faces, ridges };
}

/** Alle Dinge auf allen Dächern: [{item, unit, others}] (others: übrige Dächer derselben Etage). */
export function roofItemsAll(building) {
  const units = roofUnits(building ?? {});
  const out = [];
  for (const u of units) {
    if (!u.model) continue;
    const others = floorModels(units, u.floorId, u.key);
    for (const item of u.items) out.push({ item, unit: u, others });
  }
  return out;
}

const RAIL = { glass: "Glas", bars: "Stäbe", wood: "Holzzaun" };
const de2 = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");

/** Kurzbeschreibung: „Satteldach 25° · Überstand 0,30 m“, „Dachterrasse · Geländer Glas“. */
export function roofSummary(roof) {
  const t = roof?.type;
  if (!t || !NAMES[t] || t === "none") return NAMES.none;
  if (t === "terrace") return `${NAMES[t]} · ${RAIL[roof.railing] ? `Geländer ${RAIL[roof.railing]}` : roof.railing === "none" ? "ohne Geländer" : "Geländer Glas"}`;
  const ov = ` · Überstand ${de2(roof.overhang)} m`;
  if (t === "flat") return `${NAMES[t]}${ov}`;
  return `${NAMES[t]} ${Math.round(Number(roof.pitch) || 0)}°${t === "mansard" ? `/${Math.round(Number(roof.pitch_low) || 0)}°` : ""}${ov}`;
}

/**
 * „An der Hauswand kürzen“: Kanten der Bandrahmen, die (ohne Anpassung) über einem anderen Raum derselben
 * Etage liegen, um Wand und Überstand kürzen. → {adjust, count} | null (nichts zu kürzen)
 */
export function trimToHouse(building, unit) {
  const m = unit?.model;
  if (!m || unit.kind === "house" || !m.parts?.length) return null;
  const floor = (building?.floors ?? []).find((f) => f.id === unit.floorId);
  if (!floor) return null;
  const roof = m.roof;
  const wall = building.settings?.wall_exterior ?? 0.24;
  const grow = wall + roof.overhang;
  const flip = unit.kind === "room" ? !!roof.flip : roof.type === "shed" && !!roof.flip;
  const src = unit.kind === "room" ? unit.rooms : [{ points: unit.spec.points }];
  const frames = adjustRoofParts(framesFor(src, { wall, overhang: roof.overhang, direction: roof.direction }), null, flip);
  const mine = new Set(unit.rooms.map((r) => r.id));
  const others = (floor.rooms ?? []).filter((r) => !mine.has(r.id) && polyOk(r.points));
  const adjust = structuredClone(Array.isArray(unit.spec?.adjust) ? unit.spec.adjust : []);
  const inset = grow - 0.15;
  let count = 0;
  frames.forEach((fr, k) => {
    const L = fr.length / 2;
    const W = fr.width / 2;
    const Q = (s, t) => [fr.center[0] + s * fr.u[0] + t * fr.v[0], fr.center[1] + s * fr.u[1] + t * fr.v[1]];
    const f = [0.25, 0.5, 0.75];
    const sides = {
      lo: f.map((x) => Q(-L + inset, -W + 2 * W * x)),
      hi: f.map((x) => Q(L - inset, -W + 2 * W * x)),
      a: f.map((x) => Q(-L + 2 * L * x, -W + inset)),
      b: f.map((x) => Q(-L + 2 * L * x, W - inset)),
    };
    for (const [side, probes] of Object.entries(sides)) {
      if (probes.filter((p) => others.some((r) => pointInPolygon(p, r.points))).length < 2) continue;
      const cur = Number(adjust[k]?.[side]) || 0;
      if (cur <= -grow + 0.01) continue;
      while (adjust.length <= k) adjust.push(null);
      adjust[k] = { ...(adjust[k] ?? {}), [side]: r3(cur - grow) };
      count++;
    }
  });
  return count ? { adjust, count } : null;
}

/** Etagen (außer der eigenen), deren Räume über diesem Dach liegen – von außen ist es dann nicht zu sehen. */
export function coveredBy(building, unit) {
  const m = unit?.model;
  if (!m) return [];
  const polys = unit.rooms?.length ? unit.rooms.map((r) => r.points) : polyOk(unit.spec?.points) ? [unit.spec.points] : [];
  const probes = polys.filter(polyOk).flatMap((poly) => {
    const c = labelPoint(poly);
    return [c, ...poly.map((v) => [(c[0] + v[0]) / 2, (c[1] + v[1]) / 2])];
  });
  return (building?.floors ?? []).filter((f) => f.id !== unit.floorId && (f.elevation ?? 0) >= m.top - 0.3 && (f.rooms ?? []).some((r) => polyOk(r.points) && probes.some((p) => pointInPolygon(p, r.points))));
}

/** Freies Dachteil der Etage, dessen Umriss den labelPoint des Raums enthält (sonst null). */
export function partOver(building, floorId, room) {
  if (!polyOk(room?.points)) return null;
  const c = labelPoint(room.points);
  const floor = (building?.floors ?? []).find((f) => f.id === floorId);
  return (floor?.roofs ?? []).find((p) => p?.id && polyOk(p.points) && pointInPolygon(c, p.points)) ?? null;
}

/**
 * Dach-Modelle über Dachgeschossen: Map Etagen-ID → [Hausdach (wenn es dort sitzt), Modelle der Einheiten
 * dieser Etage]. Etagen ohne Modell fehlen.
 */
export function atticModels(building, { floorId = null, house = roofModel(building), units = null } = {}) {
  const map = new Map();
  const all = units ?? roofUnits(building, floorId, { house: false, houseModel: house });
  for (const f of building?.floors ?? []) {
    if (!f.attic || (floorId != null && f.id !== floorId)) continue;
    const list = [...(house && house.floor?.id === f.id ? [house] : []), ...all.filter((u) => u.model && u.kind !== "house" && u.floorId === f.id).map((u) => u.model)];
    if (list.length) map.set(f.id, list);
  }
  return map;
}

/** Räume unter dem Hausdach als Text (zum Vergleich vorher/nachher). */
export function houseRoomIds(building) {
  return (roofModel(building)?.rooms ?? []).map((r) => r.id).join(",");
}

/** Ändert mutate (an einer Kopie) die Räume unter dem Hausdach? → {before, after, changed} */
export function houseRoomsChange(building, mutate) {
  const before = houseRoomIds(building);
  const copy = structuredClone(building);
  mutate(copy);
  const after = houseRoomIds(copy);
  return { before, after, changed: before !== after };
}

/**
 * Automatisches Hausdach als freie Dachteile: je Rahmen ein Rechteck (um Wand und Überstand verkleinert), gleiche
 * Höhen; Satteldach mit Walm am Flügelende wird am Flügel zum Walmdach. → {floorId, parts: [ohne id]} | null
 */
export function houseToParts(building) {
  const m = roofModel(building);
  if (!m?.parts.length) return null;
  const roof = m.roof;
  const wall = building.settings?.wall_exterior ?? 0.24;
  const grow = wall + roof.overhang;
  const parts = m.parts.map((fr) => {
    const hl = Math.max(0.15, fr.length / 2 - grow);
    const hw = Math.max(0.15, fr.width / 2 - grow);
    const Q = (s, t) => [r3(fr.center[0] + s * fr.u[0] + t * fr.v[0]), r3(fr.center[1] + s * fr.u[1] + t * fr.v[1])];
    const points = [Q(-hl, -hw), Q(hl, -hw), Q(hl, hw), Q(-hl, hw)];
    if (signedArea(points) < 0) points.reverse();
    const [openLo, openHi] = fr.open ?? [false, false];
    const type = roof.type === "gable" && roof.wing_end === "hip" && (openLo || openHi) ? "hip" : roof.type;
    const f0 = framesFor([{ points }], { wall, overhang: roof.overhang })[0];
    const direction = !f0 || Math.abs(f0.u[0] * fr.u[0] + f0.u[1] * fr.u[1]) > 0.5 ? "auto" : "cross";
    const p = { type, points, pitch: roof.pitch, overhang: roof.overhang, direction };
    if (type === "shed") {
      const f1 = framesFor([{ points }], { wall, overhang: roof.overhang, direction })[0];
      if (f1 && f1.v[0] * fr.v[0] + f1.v[1] * fr.v[1] < 0) p.flip = true;
    }
    for (const k of ["color", "texture", "gable_color", "gable_texture"]) if (roof[k]) p[k] = roof[k];
    return p;
  });
  return { floorId: m.floor.id, parts };
}

/**
 * Eigenes Dach (Gruppe) in freie Dachteile umwandeln: je Raum ein Teil mit seinem Umriss und den gemeinsamen
 * Werten, ohne Kanten-Anpassungen; die Dinge nach Lage. → {parts: [ohne id], items: [[Teil-Index, Ding]]} | null
 */
export function roomRoofToParts(building, key) {
  const u = findUnit(building, key);
  if (!u || u.kind !== "room") return null;
  const lead = u.rooms[0];
  const type = roomRoofType(lead);
  const set = roomRoofSettings({ ...lead.roof, type });
  const parts = u.rooms.map((r) => {
    const p = newRoofPart(type, r.points, { name: r.name });
    for (const k of [...ROOF_SHARED, ...SINGLE_EXTRA]) if (lead.roof[k] !== undefined) p[k] = structuredClone(lead.roof[k]);
    p.type = type;
    if (!isFlatType(type)) p.pitch = set.pitch; // Standard der Raumdächer (35°) statt des Teil-Standards
    return p;
  });
  const items = u.items.map((it) => [hasPos(it) ? Math.max(0, u.rooms.indexOf(ownerRoom(u.rooms, [it.x, it.z]))) : 0, structuredClone(it)]);
  return { parts, items };
}

/** room.roof aus einem freien Kegeldach („Runden Raum darunter anlegen“): ohne base, Umriss, Name, ID, Kanten. */
export function towerRoof(part) {
  const roof = {};
  for (const k of [...ROOF_SHARED, ...SINGLE_EXTRA]) if (part?.[k] !== undefined) roof[k] = structuredClone(part[k]);
  const items = itemsOf(part);
  if (items.length) roof.items = structuredClone(items);
  return roof;
}

/** Dachteil samt Dingen verschieben (an Ort und Stelle). */
export function shiftPart(part, dx, dz) {
  part.points = (part.points ?? []).map(([x, z]) => [r3(x + dx), r3(z + dz)]);
  for (const it of part.items ?? []) {
    if (!hasPos(it)) continue;
    it.x = r3(it.x + dx);
    it.z = r3(it.z + dz);
  }
  return part;
}

/** Freies Dachteil löschen; eine leere Liste floor.roofs fällt weg. */
export function deletePart(building, key) {
  const k = parseUnitKey(key);
  const floor = (building?.floors ?? []).find((f) => f.id === k.floorId);
  if (k.kind !== "part" || !Array.isArray(floor?.roofs)) return false;
  const n = floor.roofs.length;
  floor.roofs = floor.roofs.filter((p) => p?.id !== k.id);
  const gone = floor.roofs.length < n;
  if (!floor.roofs.length) delete floor.roofs;
  return gone;
}

/**
 * Dinge des Hausdachs, die nach einer Änderung nicht mehr auf ihm liegen (laut before, dem Modell vorher, aber
 * schon), aufs Dach darunter legen (eigenes Dach eines Raums bzw. Dachteil). all: alle Dinge außerhalb des
 * Hausdachs (ältere Stände, before entfällt). → Anzahl der umgehängten Dinge
 */
export function adoptHouseItems(building, before, { all = false } = {}) {
  const roof = building?.settings?.roof;
  if ((!before && !all) || !Array.isArray(roof?.items)) return 0;
  const after = roofModel(building);
  const floorId = (before ?? after)?.floor?.id;
  if (floorId == null) return 0;
  const units = roofUnits(building, floorId, { house: false, houseModel: after });
  let n = 0;
  for (const it of itemsOf(roof)) {
    if (!hasPos(it)) continue;
    const p = [it.x, it.z];
    if ((!all && !roofSurfaceAt(before, p)) || (after && roofSurfaceAt(after, p))) continue;
    const to = unitAt(units, p)?.unit;
    if (!to) continue;
    // direkt am Hausdach (findUnit("house") ist null, wenn es danach keine Räume mehr deckt)
    roof.items = roof.items.filter((x) => x !== it);
    if (to.kind === "room") ((ownerRoom(to.rooms, p) ?? to.rooms[0]).roof.items ??= []).push(it);
    else (to.spec.items ??= []).push(it);
    n++;
  }
  return n;
}

/** Dinge des Hausdachs außerhalb seiner Flächen, die auf einem anderen Dach der Etage lägen (ältere Stände). */
export function strayHouseItems(building) {
  const m = roofModel(building);
  if (!m) return [];
  const units = roofUnits(building, m.floor?.id, { house: false, houseModel: m });
  return itemsOf(building.settings?.roof).filter((it) => hasPos(it) && !roofSurfaceAt(m, [it.x, it.z]) && unitAt(units, [it.x, it.z]));
}

/** Ding auf ein anderes Dach legen (Ziel Raumdach: an den Raum darunter). */
export function moveItemToUnit(building, fromKey, toKey, id) {
  const from = findUnit(building, fromKey);
  const to = findUnit(building, toKey);
  if (!from || !to || from.key === to.key) return false;
  const it = from.items.find((x) => x.id === id);
  if (!it) return false;
  const take = (roof, keep = false) => {
    if (!Array.isArray(roof?.items)) return;
    roof.items = roof.items.filter((x) => x?.id !== id);
    if (!roof.items.length && !keep) delete roof.items;
  };
  if (from.kind === "house") take(building.settings.roof, true);
  else if (from.kind === "room") for (const r of from.rooms) take(r.roof);
  else take(from.spec);
  if (to.kind === "house") building.settings.roof.items = [...(building.settings.roof.items ?? []), it];
  else if (to.kind === "room") {
    const r = (hasPos(it) ? ownerRoom(to.rooms, [it.x, it.z]) : null) ?? to.rooms[0];
    (r.roof.items ??= []).push(it);
  } else (to.spec.items ??= []).push(it);
  return true;
}
