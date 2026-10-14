// Außenbereich ohne Three.js (mit node testbar): Dachrahmen, Balkonkanten, Wetter, Streupunkte.
// Koordinaten in Metern, Plan [x, z].

import { labelPoint, pointInPolygon } from "./walls.js";
import { GROUP_TYPES, ROOM_ROOF_TYPES, SINGLE_TYPES, adjustRoofParts, mainDirection, partHipEnds, partSettings, roofParts } from "./roofshapes.js";

export { adjustRoofParts, mainDirection, partHipEnds, roofParts };

export const ROOF_TYPES = [
  ["none", "Kein Dach"],
  ["flat", "Flachdach"],
  ["gable", "Satteldach"],
  ["hip", "Walmdach"],
  ["shed", "Pultdach"],
];

export const DEFAULT_ROOF = { type: "none", pitch: 35, overhang: 0.4, direction: "auto", floor: null, color: null };

/** Dacheinstellungen mit Standardwerten. */
export function roofSettings(settings) {
  const r = { ...DEFAULT_ROOF, ...(settings?.roof ?? {}) };
  if (!ROOF_TYPES.some(([k]) => k === r.type)) r.type = "none";
  r.pitch = Math.min(60, Math.max(5, Number(r.pitch) || DEFAULT_ROOF.pitch));
  r.overhang = Math.min(1.5, Math.max(0, Number(r.overhang ?? DEFAULT_ROOF.overhang)));
  return r;
}

/**
 * Rechteck, auf dem das Dach sitzt: an der Hauptrichtung des Hauses ausgerichtet, um Außenwand und
 * Überstand vergrößert. First entlang der langen Seite (oder direction "x"/"z").
 * @returns {{center:[number,number], u:[number,number], v:[number,number], length:number, width:number}|null}
 *   u = Richtung des Firsts, length entlang u, width quer dazu.
 */
export function roofFrame(rooms, { wall = 0.24, overhang = 0.4, direction = "auto" } = {}) {
  const pts = rooms.flatMap((r) => r.points ?? []);
  if (pts.length < 3) return null;
  const ang = mainDirection(rooms);
  const a = [Math.cos(ang), Math.sin(ang)];
  const b = [-a[1], a[0]];
  let [minA, maxA, minB, maxB] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, z] of pts) {
    const pa = x * a[0] + z * a[1];
    const pb = x * b[0] + z * b[1];
    minA = Math.min(minA, pa);
    maxA = Math.max(maxA, pa);
    minB = Math.min(minB, pb);
    maxB = Math.max(maxB, pb);
  }
  const grow = wall + overhang;
  const lenA = maxA - minA + 2 * grow;
  const lenB = maxB - minB + 2 * grow;
  const ca = (minA + maxA) / 2;
  const cb = (minB + maxB) / 2;
  const center = [r3(ca * a[0] + cb * b[0]), r3(ca * a[1] + cb * b[1])];
  // "x"/"z": First möglichst parallel zur Plan-Achse
  let alongA = lenA >= lenB;
  if (direction === "x") alongA = Math.abs(a[0]) >= Math.abs(b[0]);
  else if (direction === "z") alongA = Math.abs(a[1]) >= Math.abs(b[1]);
  return alongA
    ? { center, u: a, v: b, length: r3(lenA), width: r3(lenB) }
    : { center, u: b, v: [-a[0], -a[1]], length: r3(lenB), width: r3(lenA) };
}

/** Kniestock eines Dachgeschosses (m): Höhe der Außenwand bis zum Dachansatz. */
export const DEFAULT_KNEE = 1.0;
export function atticKnee(floor) {
  const k = Number(floor?.knee ?? DEFAULT_KNEE);
  return Math.max(0, Math.min(floor?.height ?? 2.5, Number.isFinite(k) ? k : DEFAULT_KNEE));
}

/** Höhe, auf der das Hausdach über einer Etage ansetzt: Kniestock beim Dachgeschoss, sonst Raumhöhe. */
export function roofBase(floor) {
  return (floor?.elevation ?? 0) + (floor?.attic ? atticKnee(floor) : floor?.height ?? 2.5);
}

/** Dachgeschoss mit Räumen (das Dach sitzt darauf), sonst null. */
export function atticFloor(building) {
  return (building?.floors ?? []).filter((f) => f.attic && (f.rooms ?? []).length).sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0))[0] ?? null;
}

/** Etage unter dem Hausdach: roof.floor, sonst das Dachgeschoss, sonst die oberste Etage mit Räumen. */
export function roofFloor(building, roof) {
  const floors = (building.floors ?? []).filter((f) => (f.rooms ?? []).length);
  if (roof?.floor) {
    const f = floors.find((x) => x.id === roof.floor);
    if (f) return f;
  }
  const attic = atticFloor(building);
  if (attic) return attic;
  return floors.reduce((top, f) => (!top || (f.elevation ?? 0) + (f.height ?? 2.5) > (top.elevation ?? 0) + (top.height ?? 2.5) ? f : top), null);
}

/**
 * Raum mit Balkonkraftwerk (Solarmodule, Energiefluss): room.energy_role, sonst wie früher der Bereich
 * „balkonkraftwerk“ oder ein Raum namens Schuppen/Gartenhaus.
 */
export function isPvShed(room) {
  if (!room) return false;
  if (room.energy_role !== undefined && room.energy_role !== null) return room.energy_role === "balkonkraftwerk";
  return room.area_id === "balkonkraftwerk" || /schuppen|gartenhaus/i.test(room.name ?? "");
}

/** Erster Raum mit Balkonkraftwerk im Gebäude: {floor, room} oder null. Ausdrücklich markierte zuerst. */
export function findPvShed(building) {
  const all = (building?.floors ?? []).flatMap((floor) => (floor.rooms ?? []).map((room) => ({ floor, room })));
  return all.find((x) => x.room.energy_role === "balkonkraftwerk") ?? all.find((x) => isPvShed(x.room)) ?? null;
}

/**
 * Räume mit eigenem Dach (room.roof) oder unter einem freien Dachteil der Etage (labelPoint im Umriss):
 * Sie gehören nicht zum Hausdach.
 * @returns {Set<string>}
 */
export function coveredRoomIds(floor) {
  const out = new Set();
  const parts = (floor?.roofs ?? []).map((p) => p?.points).filter((pts) => Array.isArray(pts) && pts.length >= 3);
  for (const r of floor?.rooms ?? []) {
    if (roomRoofType(r) !== "none") out.add(r.id);
    else if (parts.length && (r.points ?? []).length >= 3) {
      const c = labelPoint(r.points);
      if (parts.some((pts) => pointInPolygon(c, pts))) out.add(r.id);
    }
  }
  return out;
}

/**
 * Räume unter dem Dach: roof.rooms (IDs) oder die größte Gruppe zusammenhängender Räume der Etage
 * (Schuppen, Garage mit Abstand und der Raum des Balkonkraftwerks bleiben ohne dieses Dach). Räume mit eigenem
 * Dach oder unter einem Dachteil (covered) fallen heraus; bleibt von der Liste nichts übrig, gilt „automatisch“.
 */
export function roofRooms(floor, roof, covered = coveredRoomIds(floor)) {
  const rooms = (floor?.rooms ?? []).filter((r) => (r.points ?? []).length >= 3);
  if (Array.isArray(roof?.rooms) && roof.rooms.length) {
    const list = rooms.filter((r) => roof.rooms.includes(r.id) && !covered.has(r.id));
    if (list.length) return list;
  }
  const cand = rooms.filter((r) => !isPvShed(r));
  const box = (r) => {
    const xs = r.points.map((p) => p[0]);
    const zs = r.points.map((p) => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  };
  const boxes = cand.map(box);
  const parent = cand.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      const gap = Math.max(a[0] - b[1], b[0] - a[1], a[2] - b[3], b[2] - a[3]);
      if (gap < 0.5) parent[find(i)] = find(j);
    }
  }
  const area = (r) => {
    let s = 0;
    for (let i = 0; i < r.points.length; i++) {
      const a = r.points[i];
      const b = r.points[(i + 1) % r.points.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  };
  const sum = new Map();
  cand.forEach((r, i) => sum.set(find(i), (sum.get(find(i)) ?? 0) + area(r)));
  const best = [...sum.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  return cand.filter((r, i) => find(i) === best && !covered.has(r.id));
}

/** Liegt die Strecke a-b auf einer Raumkante (kollinear, überlappend)? */
export function onRoomEdge(a, b, rooms, tol = 0.15) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return true;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const r of rooms) {
    const pts = r.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const el = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (el < 1e-6) continue;
      const u = [(q[0] - p[0]) / el, (q[1] - p[1]) / el];
      // parallel?
      const cross = Math.abs(((b[0] - a[0]) * u[1] - (b[1] - a[1]) * u[0]) / len);
      if (cross > 0.05) continue;
      // Abstand der Mitte zur Kantengeraden und Lage auf der Kante
      const t = (mid[0] - p[0]) * u[0] + (mid[1] - p[1]) * u[1];
      const dist = Math.abs((mid[0] - p[0]) * u[1] - (mid[1] - p[1]) * u[0]);
      if (dist <= tol && t >= -tol && t <= el + tol) return true;
    }
  }
  return false;
}

/** Kanten eines Balkons, die nicht am Haus liegen (dort kommt das Geländer hin): Liste von [a, b]. */
export function freeEdges(points, rooms) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!onRoomEdge(a, b, rooms)) out.push([a, b]);
  }
  return out;
}

/** Wetter aus einer weather-Entität: {kind: "rain"|"snow"|"hail"|null, amount: 0..1}. */
export function weatherKind(stateObj) {
  const s = stateObj?.state;
  switch (s) {
    case "rainy":
      return { kind: "rain", amount: 0.5 };
    case "pouring":
      return { kind: "rain", amount: 1 };
    case "lightning-rainy":
      return { kind: "rain", amount: 0.8, lightning: true };
    case "lightning":
      return { kind: null, amount: 0, lightning: true };
    case "snowy":
      return { kind: "snow", amount: 0.6 };
    case "snowy-rainy":
      return { kind: "snow", amount: 0.5, rain: true };
    case "hail":
      return { kind: "hail", amount: 0.7 };
    default:
      return { kind: null, amount: 0 };
  }
}

/** Erste weather-Entität, falls keine eingestellt ist. */
export function weatherEntity(hass, settings) {
  const id = settings?.weather;
  if (id === "none") return null;
  if (id && hass?.states?.[id]) return id;
  return Object.keys(hass?.states ?? {}).sort().find((e) => e.startsWith("weather.")) ?? null;
}

/** Deterministischer Zufall (gleiches Beet = gleiche Blumen bei jedem Aufbau). */
export function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bis zu n Punkte gleichmäßig zufällig im Polygon (Dichte: höchstens perM2 je m²). */
export function scatter(points, { n = 40, perM2 = 6, seed = "x", margin = 0.1 } = {}) {
  const rnd = seeded(seed);
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const want = Math.min(n, Math.round((Math.abs(area) / 2) * perM2));
  const out = [];
  for (let tries = 0; out.length < want && tries < want * 30; tries++) {
    const p = [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)];
    if (!pointInPolygon(p, points)) continue;
    // Abstand zum Rand
    if (margin > 0 && [[margin, 0], [-margin, 0], [0, margin], [0, -margin]].some(([dx, dz]) => !pointInPolygon([p[0] + dx, p[1] + dz], points))) continue;
    out.push(p);
  }
  return out;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Dachform des eigenen Dachs eines Raums (room.roof.type); unbekannt oder fehlend → "none". */
export function roomRoofType(room) {
  const t = room?.roof?.type;
  return ROOM_ROOF_TYPES.some(([k]) => k === t) ? t : "none";
}

/**
 * Einstellungen eines eigenen Dachs mit Standardwerten: neue Formen über partSettings, die alten Arten
 * (Flach-, Sattel-, Walm-, Pultdach) wie das Hausdach (Neigung 5…60°), dazu „cross“ (kurze Seite).
 */
export function roomRoofSettings(raw) {
  const type = ROOM_ROOF_TYPES.some(([k]) => k === raw?.type) ? raw.type : "none";
  if (SINGLE_TYPES.includes(type)) return partSettings({ ...raw, type });
  const r = { ...DEFAULT_ROOF, ...(raw ?? {}), type };
  if (!raw || !("floor" in raw)) delete r.floor; // „Hausdach sitzt auf“ gibt es am Raum nicht
  r.pitch = Math.min(60, Math.max(5, Number(r.pitch) || DEFAULT_ROOF.pitch));
  const ov = Number(r.overhang ?? DEFAULT_ROOF.overhang);
  r.overhang = Math.min(1.5, Math.max(0, Number.isFinite(ov) ? ov : DEFAULT_ROOF.overhang));
  if (!["auto", "cross", "x", "z"].includes(r.direction)) r.direction = "auto";
  return r;
}

/**
 * Eigene Dächer einzelner Räume (room.roof, z. B. Garage, Anbau, Erker): berührende Räume mit gleicher
 * Dachform (nur Flach-, Sattel-, Walm- und Pultdach) bilden eine Gruppe, außer einer der Räume hat
 * „separate“. Die übrigen Formen sind immer ein Dach je Raum. Leiter ist der erste Raum der Gruppe; von
 * ihm kommen die Einstellungen.
 * @returns {{rooms: object[], leader: object, roof: object}[]}
 */
export function roomRoofGroups(floor) {
  const rooms = (floor?.rooms ?? []).filter((r) => roomRoofType(r) !== "none" && (r.points ?? []).length >= 3);
  const joins = (a, b) => GROUP_TYPES.includes(roomRoofType(a)) && roomRoofType(a) === roomRoofType(b) && !a.roof.separate && !b.roof.separate;
  const box = (r) => {
    const xs = r.points.map((p) => p[0]);
    const zs = r.points.map((p) => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  };
  const boxes = rooms.map(box);
  const parent = rooms.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      if (joins(rooms[i], rooms[j]) && Math.max(a[0] - b[1], b[0] - a[1], a[2] - b[3], b[2] - a[3]) < 0.05) parent[find(i)] = find(j);
    }
  const groups = new Map();
  rooms.forEach((r, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  return [...groups.values()].map((list) => ({ rooms: list, leader: list[0], roof: roomRoofSettings({ ...list[0].roof, type: roomRoofType(list[0]) }) }));
}

/** Abstand eines Punkts zum Rand eines Polygons (0, wenn innen). */
function distToPolygon(p, poly) {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t));
  }
  return best;
}

/**
 * Hang automatisch: Höhe je Eckpunkt einer Gartenfläche (relativ zu ihrer Etage). Ecken, die an
 * Gartenflächen einer anderen Etage stoßen, bekommen deren Höhenunterschied, Ecken an Flächen der
 * eigenen Etage 0, die übrigen werden entlang des Umrisses zwischen den bekannten interpoliert.
 * Randsteine (Linie „Randstein“, type "kerb") kennen keinen Hang – sie liegen auf der Etage – und zählen auch nicht als
 * Gelände der Nachbarn.
 * @returns {number[]|null} heights, oder null, wenn die Fläche eben bleibt
 */
export function autoHeights(building, floorId, areaId, tol = 0.5) {
  const floor = building.floors.find((f) => f.id === floorId);
  const area = floor?.outdoor?.find((o) => o.id === areaId);
  if (!area || area.type === "kerb") return null;
  const elev = floor.elevation ?? 0;
  const pts = area.points;
  const known = pts.map((p) => {
    let other = null;
    for (const f of building.floors) {
      if (f.id === floorId) continue;
      const dh = (f.elevation ?? 0) - elev;
      if (Math.abs(dh) < 0.05) continue;
      if ((f.outdoor ?? []).some((o) => o.type !== "balcony" && o.type !== "kerb" && distToPolygon(p, o.points) <= tol)) {
        // mehrere Etagen: die mit dem kleinsten Höhenunterschied (nächste Geländestufe)
        if (other === null || Math.abs(dh) < Math.abs(other)) other = dh;
      }
    }
    if (other !== null) return Math.round(other * 1000) / 1000;
    if ((floor.outdoor ?? []).some((o) => o.id !== areaId && o.type !== "kerb" && distToPolygon(p, o.points) <= tol)) return 0;
    return null;
  });
  if (!known.some((h) => h !== null && h !== 0)) return null;
  // Lücken entlang des Umrisses linear füllen
  const n = pts.length;
  const seg = pts.map((p, i) => Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]));
  return known.map((h, i) => {
    if (h !== null) return h;
    let back = 0;
    let fwd = 0;
    let hb = null;
    let hf = null;
    for (let k = 1; k < n && hb === null; k++) {
      back += seg[(i - k + n) % n];
      hb = known[(i - k + n) % n];
    }
    for (let k = 1; k < n && hf === null; k++) {
      fwd += seg[(i + k - 1) % n];
      hf = known[(i + k) % n];
    }
    if (hb === null || hf === null) return hb ?? hf ?? 0;
    return Math.round((hb + ((hf - hb) * back) / (back + fwd || 1)) * 1000) / 1000;
  });
}

/**
 * Himmelsrichtung einer Richtung im Plan. north: Grad im Uhrzeigersinn, um die der Norden gegenüber
 * „oben im Plan“ (-z) gedreht ist (settings.north, 0 = Norden oben).
 * @returns {"N"|"E"|"S"|"W"}
 */
export function compassOf(dir, north = 0) {
  return ["N", "E", "S", "W"][Math.round(azimuthOf(dir, north) / 90) % 4];
}

/** Richtung im Grundriss [x, z] als Azimut in Grad (0 = Norden, im Uhrzeigersinn). */
export function azimuthOf(dir, north = 0) {
  const n = (north * Math.PI) / 180;
  const N = [Math.sin(n), -Math.cos(n)];
  const E = [Math.cos(n), Math.sin(n)];
  return ((Math.atan2(dir[0] * E[0] + dir[1] * E[1], dir[0] * N[0] + dir[1] * N[1]) * 180) / Math.PI + 360) % 360;
}

/** Himmelsrichtung in 16 Stufen („SSW“). */
export function compass16(az) {
  return ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Achsen eines Moduls flach auf der Dachfläche: U entlang der Traufe, N Flächennormale (nach oben),
 * Z die Neigung hinauf. out: Richtung hangabwärts im Grundriss (null = Flachdach, dann along).
 * @returns {{U: number[], N: number[], Z: number[]}}
 */
export function panelBasis(out, tan, along = null) {
  const o = out ?? [-(along?.[1] ?? 0), along?.[0] ?? 1];
  const U = [o[1], 0, -o[0]];
  const norm = (v) => {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const down = out ? norm([out[0], -tan, out[1]]) : [o[0], 0, o[1]];
  let N = norm(cross(down, U));
  if (N[1] < 0) N = N.map((x) => -x);
  return { U, N, Z: cross(U, N) };
}

/** Standard-Modulleistung, wenn am PV-Feld keine angegeben ist. */
export const DEFAULT_WP = 400;

/**
 * Kenndaten eines PV-Felds: Azimut (null = flach), Neigung, Anzahl passender Module, kWp.
 */
export function fieldInfo(model, item, north = 0, items = [], others = []) {
  const lay = pvLayout(model, item, { obstacles: roofObstacles(model, items), others });
  const wp = Number(item.wp) > 0 ? Number(item.wp) : DEFAULT_WP;
  return {
    azimuth: lay.out ? azimuthOf(lay.out, north) : null,
    tilt: lay.out ? (Math.atan(lay.tan) * 180) / Math.PI : 0,
    count: lay.count,
    blocked: lay.blockedCount,
    wp,
    kwp: (lay.count * wp) / 1000,
  };
}

/**
 * Plätze für PV-Module (1,0 × 1,7 m hochkant) auf einer Dachfläche, von der Traufe aufwärts.
 * @param {{length:number, width:number, inner?:number[]}} part Dachteil aus roofParts
 * @param {object} o
 * @param {number} o.tan Neigung (tan)
 * @param {number} o.count gewünschte Anzahl
 * @param {"gable"|"hip"|"shed"} o.type
 * @param {boolean[]} [o.hipEnds] Walmenden [unten, oben] (dort wird die Fläche schmaler)
 * @returns {{s:number, x:number}[]} s entlang des Firsts (Mitte 0), x waagerecht ab Traufe nach innen (Modulmitte)
 */
export function panelSlots(part, { tan, count, type = "gable", hipEnds = [false, false], blocked = [] }) {
  if (count <= 0) return [];
  const L = part.length / 2;
  const W = type === "shed" ? part.width : part.width / 2; // waagerechte Tiefe der Fläche
  const cos = Math.cos(Math.atan(tan));
  const pw = 1.0;
  const pl = 1.7; // entlang der Neigung
  const gap = 0.05;
  const margin = 0.3;
  const [inLo, inHi] = part.inner ?? [0, 0];
  const out = [];
  for (let row = 0; out.length < count; row++) {
    const x0 = margin + row * (pl + gap) * cos; // Unterkante waagerecht
    const x1 = x0 + pl * cos;
    if (x1 > W - 0.15) break;
    // Walmende: Fläche wird mit der Höhe schmaler (45° im Grundriss bei gleicher Neigung)
    const lo = -L + margin + (inLo || 0) + (hipEnds[0] ? x1 : 0);
    const hi = L - margin - (inHi || 0) - (hipEnds[1] ? x1 : 0);
    // freie Abschnitte der Reihe (ohne Bereiche, die von anderen Dachteilen bedeckt sind)
    let free = [[lo, hi]];
    for (const [b0, b1] of blockedAt(blocked, x0)) free = free.flatMap(([a, b]) => (b1 <= a || b0 >= b ? [[a, b]] : [[a, Math.min(b, b0)], [Math.max(a, b1), b]].filter(([c, d]) => d - c > 0)));
    for (const [a, b] of free.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))) {
      const cols = Math.floor((b - a + gap) / (pw + gap));
      if (cols <= 0 || out.length >= count) continue;
      const n = Math.min(cols, count - out.length);
      const used = n * pw + (n - 1) * gap;
      const start = (a + b) / 2 - used / 2 + pw / 2;
      for (let k = 0; k < n; k++) out.push({ s: Math.round((start + k * (pw + gap)) * 1000) / 1000, x: Math.round(((x0 + x1) / 2) * 1000) / 1000 });
    }
  }
  return out;
}

/**
 * Bedeckte Bereiche einer Dachfläche je Höhe: Rechteck {a, b} oder Kehle {c, hw} (Flügel eines L-Dachs:
 * bei gleicher Neigung schrumpft die bedeckte Breite mit dem Abstand x von der Traufe: hw − x).
 * @returns {number[][]} gesperrte s-Abschnitte für ein Modul, das bei x0 (Unterkante) beginnt
 */
export function blockedAt(blocked, x0) {
  const out = [];
  for (const b of blocked ?? []) {
    if (Array.isArray(b)) out.push(b);
    else if (b.c !== undefined) {
      const hw = b.hw - x0;
      if (hw > 0) out.push([b.c - hw, b.c + hw]);
    }
  }
  return out;
}

/**
 * PV-Feld (Spalten × Reihen) auf einer Dachfläche: Plätze der Modulmitten.
 * @param {object} part Dachteil (length, width, inner)
 * @param {object} o
 * @param {number} o.tan Neigung
 * @param {number} o.cols Module nebeneinander (entlang der Traufe)
 * @param {number} o.rows Reihen die Fläche hinauf
 * @param {"portrait"|"landscape"} [o.orient] hochkant (1,0 × 1,7) oder quer (1,7 × 1,0)
 * @param {number} [o.left] Abstand der linken Feldkante vom linken Flächenrand in m (von außen gesehen)
 * @param {number} [o.row] erste Reihe (0 = an der Traufe)
 * @param {number} [o.flip] 1 oder -1: Richtung von „links nach rechts“ entlang s
 * @returns {{s:number, x:number, w:number, l:number}[]} Mitte (s, x) sowie Modulbreite w und -länge l
 */
export function panelArraySlots(part, { tan, cols = 1, rows = 1, orient = "portrait", left = 0, row = 0, flip = 1, type = "gable", hipEnds = [false, false], blocked = [] }) {
  const L = part.length / 2;
  const W = type === "shed" ? part.width : part.width / 2;
  const cos = Math.cos(Math.atan(tan));
  const w = orient === "landscape" ? 1.7 : 1.0; // entlang der Traufe
  const l = orient === "landscape" ? 1.0 : 1.7; // die Neigung hinauf
  const gap = 0.05;
  const margin = 0.3;
  const [inLo, inHi] = part.inner ?? [0, 0];
  const out = [];
  for (let r = row; r < row + rows; r++) {
    const x0 = margin + r * (l + gap) * cos;
    const x1 = x0 + l * cos;
    if (x1 > W - 0.1) break;
    const lo = -L + margin + (inLo || 0) + (hipEnds[0] ? x1 : 0);
    const hi = L - margin - (inHi || 0) - (hipEnds[1] ? x1 : 0);
    const block = blockedAt(blocked, x0);
    for (let c = 0; c < cols; c++) {
      // Position von links (von außen gesehen) in s umrechnen
      const fromLeft = left + c * (w + gap);
      const sLeft = flip > 0 ? -L + fromLeft : L - fromLeft - w;
      const a = sLeft;
      const b = sLeft + w;
      if (a < lo - 1e-6 || b > hi + 1e-6) continue;
      if (block.some(([p, q]) => b > p && a < q)) continue;
      out.push({ s: Math.round(((a + b) / 2) * 1000) / 1000, x: Math.round(((x0 + x1) / 2) * 1000) / 1000, w, l });
    }
  }
  return out;
}

// ------------------------------------------------------------------ Dach-Ebene: Kamin, Dachfenster, PV-Felder

/** Dinge auf dem Dach (roof.items): Typ, Name, Standardmaße. */
export const ROOF_ITEMS = {
  chimney: { name: "Kamin", w: 0.5, d: 0.5, h: 0.9 },
  skylight: { name: "Dachfenster", w: 0.78, l: 1.18 },
  pv: { name: "PV-Feld", cols: 3, rows: 2, orient: "portrait" },
  dormer: { name: "Gaube", w: 2.0, h: 1.3, pitch: 15, style: "shed", windows: 2 },
};

export const DORMER_STYLES = [["shed", "Schleppgaube"], ["gable", "Satteldachgaube"], ["flat", "Flachdachgaube"]];

/**
 * Hausdach als Modell ohne 3D: Teile, Traufhöhe, Neigung, höchster Punkt. null ohne Dach. Räume mit eigenem
 * Dach oder unter einem Dachteil spart es aus (ihre Lücke wird nicht aufgefüllt).
 * @returns {{key:"house", kind:"house", roof:object, floor:object, rooms:object[], parts:object[], top:number,
 *   eave:number, tan:number, pitched:boolean, ridgeY:number}|null}
 */
export function roofModel(building) {
  const roof = roofSettings(building?.settings);
  if (roof.type === "none") return null;
  const floor = roofFloor(building, roof);
  const covered = coveredRoomIds(floor);
  const rooms = roofRooms(floor, roof, covered);
  if (!rooms.length) return null;
  const wall = building.settings?.wall_exterior ?? 0.24;
  const exclude = (floor?.rooms ?? []).filter((r) => covered.has(r.id) && (r.points ?? []).length >= 3);
  const parts = adjustRoofParts(roofParts(rooms, { wall, overhang: roof.overhang, direction: roof.direction, exclude }), roof.adjust, !!roof.flip);
  const tan = Math.tan((roof.pitch * Math.PI) / 180);
  const top = roofBase(floor);
  for (const fr of parts) fr.hipEnds = partHipEnds(fr, roof);
  const eave = top - roof.overhang * tan;
  const ridgeY = !parts.length ? top : roof.type === "flat" ? top + 0.25 : eave + Math.max(...parts.map((fr) => (roof.type === "shed" ? fr.width : fr.width / 2))) * tan;
  return { key: "house", kind: "house", roof, floor, rooms, parts, top, eave, tan, pitched: roof.type !== "flat", ridgeY };
}

/**
 * Dachfläche an einem Punkt des Grundrisses: Höhe y, Richtung hangabwärts (out, im Grundriss, Länge 1; null
 * beim Flachdach) und Neigung tan. Bei mehreren Dachteilen gilt das höchste. null außerhalb des Dachs.
 * Formen aus roofshapes.js (model.at) liefern das Ergebnis selbst.
 */
export function roofSurfaceAt(model, [x, z]) {
  if (!model || !Number.isFinite(x) || !Number.isFinite(z)) return null; // ohne Lage (unvollständige Daten): kein Dach
  if (model.at) return model.at(x, z);
  const { roof, parts, eave, tan, top } = model;
  let best = null;
  for (const fr of parts) {
    const dx = x - fr.center[0];
    const dz = z - fr.center[1];
    const s = dx * fr.u[0] + dz * fr.u[1];
    const t = dx * fr.v[0] + dz * fr.v[1];
    const L = fr.length / 2;
    const W = fr.width / 2;
    if (Math.abs(s) > L + 1e-6 || Math.abs(t) > W + 1e-6) continue;
    let hit;
    if (roof.type === "flat") hit = { y: top + 0.25, out: null, tan: 0 };
    else if (roof.type === "shed") hit = { y: eave + (t + W) * tan, out: [-fr.v[0], -fr.v[1]], tan };
    else {
      const sg = t >= 0 ? 1 : -1;
      hit = { y: eave + (W - Math.abs(t)) * tan, out: [sg * fr.v[0], sg * fr.v[1]], tan };
      const [hipLo, hipHi] = fr.hipEnds ?? partHipEnds(fr, roof);
      if (hipLo && eave + (s + L) * tan < hit.y) hit = { y: eave + (s + L) * tan, out: [-fr.u[0], -fr.u[1]], tan };
      if (hipHi && eave + (L - s) * tan < hit.y) hit = { y: eave + (L - s) * tan, out: [fr.u[0], fr.u[1]], tan };
    }
    if (!best || hit.y > best.y) best = { ...hit, part: fr };
  }
  return best;
}

/**
 * Flächen eines Dachteils im Grundriss (Dach-Ebene im Editor): Vielecke mit Helligkeit und die Firstlinie.
 * @returns {{faces: [number[][], number][], ridge: number[][]|null}}
 */
export function roofFacePolys(roof, fr) {
  const L = fr.length / 2;
  const W = fr.width / 2;
  const Q = (s, t) => [fr.center[0] + s * fr.u[0] + t * fr.v[0], fr.center[1] + s * fr.u[1] + t * fr.v[1]];
  if (roof.type !== "gable" && roof.type !== "hip") return { faces: [[[Q(-L, -W), Q(L, -W), Q(L, W), Q(-L, W)], 0.6]], ridge: null };
  const [hipLo, hipHi] = fr.hipEnds ?? partHipEnds(fr, roof);
  const rLo = hipLo ? Math.max(0, L - W) : L;
  const rHi = hipHi ? Math.max(0, L - W) : L;
  const faces = [
    [[Q(-L, -W), Q(L, -W), Q(rHi, 0), Q(-rLo, 0)], 0.55],
    [[Q(-L, W), Q(L, W), Q(rHi, 0), Q(-rLo, 0)], 0.75],
  ];
  if (hipLo) faces.push([[Q(-L, -W), Q(-L, W), Q(-rLo, 0)], 0.65]);
  if (hipHi) faces.push([[Q(L, -W), Q(L, W), Q(rHi, 0)], 0.65]);
  return { faces, ridge: [Q(-rLo, 0), Q(rHi, 0)] };
}

/**
 * PV-Feld auf dem Dach (roof.items, type "pv"): Lage der Module im Grundriss. Das Feld richtet sich
 * nach der Dachfläche unter seiner Mitte (Reihen die Neigung hinauf); auf dem Flachdach nach rotation.
 * Ein Modul zählt nur, wenn alle Ecken auf derselben Ebene liegen und kein anderes Dach derselben Etage
 * (others) darüber liegt (Kehle, Flügel, Dachteil).
 * @returns {{center:number[], along:number[], out:number[]|null, tan:number, w:number, l:number, cos:number, panels:number[][], fits:boolean[], count:number, size:number[]}}
 */
export function pvLayout(model, item, { obstacles = [], others = [] } = {}) {
  const cols = Math.max(1, Math.min(30, Math.round(Number(item.cols) || 1)));
  const rows = Math.max(1, Math.min(15, Math.round(Number(item.rows) || 1)));
  const w = item.orient === "landscape" ? 1.7 : 1.0; // entlang der Traufe
  const l = item.orient === "landscape" ? 1.0 : 1.7; // die Neigung hinauf
  const gap = 0.03;
  const hit = roofSurfaceAt(model, [item.x, item.z]);
  const out = hit?.out ?? null;
  const tanH = hit?.tan ?? model?.tan ?? 0;
  // von einem anderen Dach derselben Etage überdeckt (Kehle, Flügel, Dachteil): Modul fällt weg
  const under = (q, y) => others.some((m) => (roofSurfaceAt(m, q)?.y ?? -Infinity) > y + 0.02);
  if (!out) {
    // Flachdach (oder außerhalb): nach rotation ausgerichtet, flach
    const a = ((item.rotation || 0) * Math.PI) / 180;
    const along = [Math.cos(a), Math.sin(a)];
    const down = [-along[1], along[0]];
    return finish(along, down, 1);
  }
  const cos = Math.cos(Math.atan(tanH));
  return finish([out[1], -out[0]], out, cos);

  function finish(along, down, c) {
    const panels = [];
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const a = (k - (cols - 1) / 2) * (w + gap);
        const d = ((rows - 1) / 2 - r) * (l + gap) * c; // Reihe 0 unten an der Traufe
        panels.push([item.x + along[0] * a + down[0] * d, item.z + along[1] * a + down[1] * d]);
      }
    }
    // passt ein Modul nicht auf dieselbe Dachfläche (über First, Kehle oder Rand hinaus), fällt es weg
    const fits = panels.map((p) => {
      // alle vier Ecken (knapp innen) auf derselben Fläche
      const hw = w / 2 - 0.02;
      const hd = (l * c) / 2 - 0.02;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, k]) => {
        const q = [p[0] + along[0] * i * hw + down[0] * k * hd, p[1] + along[1] * i * hw + down[1] * k * hd];
        const h = roofSurfaceAt(model, q);
        if (!h || under(q, h.y)) return false;
        // nur auf derselben Ebene wie die Mitte des Felds
        if (!out) return !h.out && (!hit || Math.abs(h.y - hit.y) < 0.05);
        const dz = (q[0] - item.x) * out[0] + (q[1] - item.z) * out[1];
        return !!h.out && h.out[0] * out[0] + h.out[1] * out[1] > 0.95 && Math.abs((h.tan ?? tanH) - tanH) < 0.02 && Math.abs(h.y - (hit.y - dz * tanH)) < 0.05;
      });
    });
    // von Kamin oder Dachfenster verdeckt (obstacles aus roofObstacles)
    const blocked = panels.map((p) => {
      if (!obstacles.length) return false;
      const hw = w / 2;
      const hd = (l * c) / 2;
      const rect = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [p[0] + along[0] * i * hw + down[0] * k * hd, p[1] + along[1] * i * hw + down[1] * k * hd]);
      return obstacles.some((o) => polygonsOverlap(rect, o.poly));
    });
    const ok = fits.map((f, i) => f && !blocked[i]);
    return { center: [item.x, item.z], along, out, tan: out ? tanH : 0, w, l, cos: c, panels, fits: ok, blocked, blockedCount: blocked.filter((b, i) => b && fits[i]).length, count: ok.filter(Boolean).length, size: [cols * (w + gap) - gap, (rows * (l + gap) - gap) * c] };
  }
}

/**
 * Dachflächen mit Himmelsrichtung, gesperrten Bereichen (Flügel) und Leserichtung „von links“.
 * Für die bisherigen PV-Angaben je Richtung (roof.solar, roof.solar_arrays).
 */
export function roofFaces(model, north = 0) {
  const { roof, parts } = model;
  const faces = [];
  for (const fr of parts) {
    const sides = roof.type === "shed" ? [0] : [-1, 1];
    for (const sg of sides) {
      const out = roof.type === "shed" ? [-fr.v[0], -fr.v[1]] : [sg * fr.v[0], sg * fr.v[1]];
      faces.push({ fr, sg, out, dir: compassOf(out, north) });
    }
  }
  for (const f of faces) {
    const { fr, sg } = f;
    const W = fr.width / 2;
    const blocked = [];
    const tr = roof.type === "shed" ? [-W, W] : sg > 0 ? [0, W] : [-W, 0];
    for (const q of parts) {
      if (q === fr) continue;
      const corners = [-1, 1].flatMap((a) => [-1, 1].map((b) => [q.center[0] + (a * q.length * q.u[0] + b * q.width * q.v[0]) / 2, q.center[1] + (a * q.length * q.u[1] + b * q.width * q.v[1]) / 2]));
      const loc = corners.map(([x, z]) => [(x - fr.center[0]) * fr.u[0] + (z - fr.center[1]) * fr.u[1], (x - fr.center[0]) * fr.v[0] + (z - fr.center[1]) * fr.v[1]]);
      const ts = loc.map((p) => p[1]);
      if (Math.max(...ts) <= tr[0] + 0.05 || Math.min(...ts) >= tr[1] - 0.05) continue;
      const ss = loc.map((p) => p[0]);
      // Flügel quer zum First: nur die Kehle ist bedeckt (wird zum First hin schmaler)
      if (Math.abs(q.u[0] * fr.u[0] + q.u[1] * fr.u[1]) < 0.5) blocked.push({ c: (Math.min(...ss) + Math.max(...ss)) / 2, hw: q.width / 2 });
      else blocked.push([Math.min(...ss) - 0.05, Math.max(...ss) + 0.05]);
    }
    f.blocked = blocked;
    f.fr = blocked.some((x) => !Array.isArray(x)) ? { ...fr, inner: [0, 0], hipEnds: fr.hipEnds } : fr;
    // „links“ von außen gesehen: Blick zur Fläche, rechte Hand = (out.z, -out.x)
    f.flip = f.out[1] * fr.u[0] - f.out[0] * fr.u[1] > 0 ? 1 : -1;
  }
  return faces;
}

/** Modulplätze (s, x auf einer Fläche) in den Grundriss umrechnen. */
export function faceSlotPoint(model, f, { s, x }) {
  const fr = f.fr;
  const t = model.roof.type === "shed" ? -fr.width / 2 + x : f.sg * (fr.width / 2 - x);
  return [fr.center[0] + s * fr.u[0] + t * fr.v[0], fr.center[1] + s * fr.u[1] + t * fr.v[1]];
}

/**
 * Bisherige PV-Angaben (roof.solar je Richtung, roof.solar_arrays) als verschiebbare PV-Felder.
 * Zusammenhängende Module einer Fläche werden je Angabe ein Feld (Mitte = Mittelpunkt der Module).
 */
export function legacyPvItems(model, north = 0) {
  if (!model || !["gable", "hip", "shed"].includes(model.roof.type)) return [];
  const { roof, tan } = model;
  const faces = roofFaces(model, north);
  const items = [];
  const add = (f, slots, orient) => {
    if (!slots.length) return;
    const pts = slots.map((sl) => faceSlotPoint(model, f, sl));
    const cols = new Set(slots.map((sl) => sl.s)).size;
    const rows = new Set(slots.map((sl) => sl.x)).size;
    const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    items.push({ type: "pv", x: r3(c[0]), z: r3(c[1]), cols, rows, orient });
  };
  if (roof.solar_arrays?.length) {
    for (const a of roof.solar_arrays) {
      const f = faces.filter((x) => x.dir === a.dir).sort((p, q) => q.fr.length - p.fr.length)[0];
      if (!f) continue;
      const orient = a.orient === "landscape" ? "landscape" : "portrait";
      add(f, panelArraySlots(f.fr, { tan, type: roof.type, cols: Math.max(1, Number(a.cols) || 1), rows: Math.max(1, Number(a.rows) || 1), orient, left: Math.max(0, Number(a.left) || 0), row: Math.max(0, Number(a.row) || 0), flip: f.flip, hipEnds: f.fr.hipEnds ?? [false, false], blocked: f.blocked }), orient);
    }
    return items;
  }
  for (const dir of ["S", "E", "W", "N"]) {
    let left = Math.max(0, Math.round(Number(roof.solar?.[dir]) || 0));
    for (const f of faces.filter((x) => x.dir === dir).sort((a, b) => b.fr.length - a.fr.length)) {
      if (left <= 0) break;
      const slots = panelSlots(f.fr, { tan, count: left, type: roof.type, hipEnds: f.fr.hipEnds ?? [false, false], blocked: f.blocked });
      left -= slots.length;
      // je Reihe ein Feld (Reihen können unterschiedlich lang sein)
      for (const x of [...new Set(slots.map((sl) => sl.x))]) add(f, slots.filter((sl) => sl.x === x), "portrait");
    }
  }
  return items;
}

/** Grundfläche eines Kamins oder Dachfensters (4 Ecken im Grundriss), sonst null. */
export function roofItemFootprint(model, it, grow = 0) {
  const def = ROOF_ITEMS[it?.type];
  if (!def || it.type === "pv" || !Number.isFinite(it.x) || !Number.isFinite(it.z)) return null;
  if (it.type === "dormer") {
    const g = dormerShape(model, it);
    if (!g) return null;
    const e = (p, a, o) => [p[0] + g.along[0] * a + g.out[0] * o, p[1] + g.along[1] * a + g.out[1] * o];
    return [e(g.f0, -grow, grow), e(g.f1, grow, grow), e(g.b1, grow, -grow), e(g.b0, -grow, -grow)];
  }
  const a = ((it.rotation || 0) * Math.PI) / 180;
  let along = [Math.cos(a), Math.sin(a)];
  let d = Number(it.d) || def.d;
  if (it.type === "skylight") {
    const hit = roofSurfaceAt(model, [it.x, it.z]);
    if (hit?.out) along = [hit.out[1], -hit.out[0]];
    d = (Number(it.l) || def.l) * (model ? Math.cos(Math.atan(hit?.tan ?? model.tan)) : 1);
  }
  const w = (Number(it.w) || def.w) + 2 * grow;
  d += 2 * grow;
  const n = [-along[1], along[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [it.x + (along[0] * i * w) / 2 + (n[0] * k * d) / 2, it.z + (along[1] * i * w) / 2 + (n[1] * k * d) / 2]);
}

/** Hindernisse für PV-Module (Kamine, Dachfenster) mit Abstand clearance. */
export function roofObstacles(model, items, clearance = 0.15) {
  return (items ?? []).map((it) => ({ type: it?.type, poly: roofItemFootprint(model, it, clearance) })).filter((o) => o.poly);
}

/** Überlappen sich zwei konvexe Vierecke? (Ecke innen oder Kanten schneiden sich) */
export function polygonsOverlap(a, b) {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (let i = 0; i < a.length; i++) {
    const [p1, p2] = [a[i], a[(i + 1) % a.length]];
    for (let k = 0; k < b.length; k++) {
      const [q1, q2] = [b[k], b[(k + 1) % b.length]];
      if (cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0) return true;
    }
  }
  return false;
}

/**
 * Gaube auf einer Dachfläche: Front (Traufseite) an der Stelle x/z, Höhe h über der Dachfläche, Dach mit
 * eigener Neigung trifft hinten auf das Hauptdach (Tiefe daraus berechnet). null, wenn sie nicht auf
 * eine geneigte Fläche passt (über First, Rand oder Kehle) oder ihr Dach steiler als das Hauptdach wäre.
 */
export function dormerShape(model, it) {
  const hit = roofSurfaceAt(model, [it.x, it.z]);
  const tanM = hit?.tan ?? model?.tan;
  if (!hit?.out || !(tanM > 0.05)) return null;
  const def = ROOF_ITEMS.dormer;
  const w = Math.max(0.5, Number(it.w) || def.w);
  const h = Math.max(0.4, Number(it.h) || def.h);
  const style = ["shed", "gable", "flat"].includes(it.style) ? it.style : def.style;
  const pitch = style === "flat" ? 2 : Math.max(0, Math.min(60, Number(it.pitch ?? def.pitch)));
  const tanP = Math.tan((pitch * Math.PI) / 180);
  const out = hit.out;
  const along = [out[1], -out[0]];
  let depth;
  let eave = null;
  if (style === "gable") {
    depth = (h + (w / 2) * tanP) / tanM;
    eave = h / tanM;
  } else {
    if (tanP >= tanM - 0.02) return null;
    depth = h / (tanM - tanP);
  }
  const at = (p, k) => [p[0] - out[0] * k, p[1] - out[1] * k];
  const f0 = [it.x - (along[0] * w) / 2, it.z - (along[1] * w) / 2];
  const f1 = [it.x + (along[0] * w) / 2, it.z + (along[1] * w) / 2];
  const b0 = at(f0, depth);
  const b1 = at(f1, depth);
  // alle Ecken auf derselben Dachfläche
  const same = (p) => {
    const q = roofSurfaceAt(model, p);
    return q?.out && q.out[0] * out[0] + q.out[1] * out[1] > 0.95 && Math.abs((q.tan ?? tanM) - tanM) < 0.02 ? q : null;
  };
  const hits = [f0, f1, at(f0, depth * 0.98), at(f1, depth * 0.98)].map(same);
  if (hits.some((x) => !x)) return null;
  const y0 = Math.min(hits[0].y, hits[1].y);
  const yTop = y0 + h;
  return { style, w, h, pitch, tanP, out, along, f0, f1, b0, b1, depth, eave, y0, yTop, yBack: y0 + depth * tanM, ridge: style === "gable" ? yTop + (w / 2) * tanP : null, windows: Math.max(0, Math.min(3, Math.round(Number(it.windows ?? def.windows)))) };
}
