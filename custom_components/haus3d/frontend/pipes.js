// Leitungen (ohne DOM, mit node testbar): Strom, Wasser kalt, Wasser warm und Netzwerk – je Etage in
// floor.pipes als Linie an Decke, Wand oder Boden mit Höhe je Punkt. Fluss nach Leistung bzw. Durchfluss.

export const PIPE_TYPES = [
  ["strom", "Strom", "#fbc02d", "mdi:flash"],
  ["wasser_kalt", "Wasser kalt", "#1e88e5", "mdi:water"],
  ["wasser_warm", "Wasser warm", "#e53935", "mdi:water-thermometer"],
  ["netzwerk", "Netzwerk", "#00acc1", "mdi:lan"],
];

export const pipeColor = (type) => (PIPE_TYPES.find((t) => t[0] === type) ?? PIPE_TYPES[0])[2];

/**
 * 3D-Weg einer Leitung: path aus [x, y, z]-Punkten (y = base + Höhe über dem Boden, mindestens min). Wechselt
 * die Höhe zwischen zwei Punkten, geht es erst senkrecht am Punkt hoch/runter, dann waagerecht weiter (wie an
 * der Wand verlegt). head/tail: Höhe eines senkrechten Anschlussstücks am Anfang/Ende (Verteiler, Leitung),
 * erst ab 1 cm Unterschied. segs je Stück {start, vert, hor}; lenAt(s) = Länge bis Stelle s (Stück + Anteil).
 */
export function pipeRoute(pipe, { base = 0, min = -Infinity, head = null, tail = null } = {}) {
  const pts = pipe.points ?? [];
  const at = (v) => base + Math.max(min, v);
  const h = (i) => {
    const v = Number(pipe.heights?.[i]);
    return at(Number.isFinite(v) ? v : Number(pipe.height) || 0.03);
  };
  const path = [];
  const segs = [];
  let len = 0;
  const go = (x, y, z) => {
    const q = path.at(-1);
    if (q) len += Math.hypot(x - q[0], y - q[1], z - q[2]);
    path.push([x, y, z]);
  };
  if (!pts.length) return { path, segs, len, lenAt: () => 0 };
  const drop = (v, y) => v != null && Number.isFinite(v) && Math.abs(at(v) - y) > 0.01;
  if (drop(head, h(0))) go(pts[0][0], at(head), pts[0][1]);
  go(pts[0][0], h(0), pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const start = len;
    const y = h(i);
    const vert = Math.abs(y - h(i - 1));
    if (vert > 1e-6) go(pts[i - 1][0], y, pts[i - 1][1]);
    go(pts[i][0], y, pts[i][1]);
    segs.push({ start, vert: vert > 1e-6 ? vert : 0, hor: len - start - (vert > 1e-6 ? vert : 0) });
  }
  const e = pts.at(-1);
  if (drop(tail, h(pts.length - 1))) go(e[0], at(tail), e[1]);
  const lenAt = (s) => {
    if (s <= 0 || !segs.length) return 0;
    if (s >= segs.length) return len;
    const i = Math.floor(s);
    const t = s - i;
    const g = segs[i];
    return t <= 0 ? g.start : g.start + g.vert + t * g.hor;
  };
  return { path, segs, len, lenAt };
}

/** 3D-Weg einer Leitung ohne Anschlussstücke (y relativ zum Boden). */
export function pipePath(pipe) {
  return pipeRoute(pipe).path;
}

/** Länge (m) eines 3D-Wegs. */
export function pathLength(path) {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
  return l;
}

const num = (st) => {
  if (!st || st.state === "unavailable" || st.state === "unknown") return null;
  const v = Number(st.state);
  return Number.isFinite(v) ? v : null;
};

/**
 * Fluss einer Leitung: {active, speed (Umläufe/s ~ m/s), reverse}.
 * Strom: Sensor in W/kW (negativ = Gegenrichtung), sonst Leistung des Zielraums (roomW).
 * Wasser: Durchfluss (> 0) oder Schalter/Ventil/Binärsensor an.
 */
export function pipeFlow(pipe, hass, roomW = null) {
  const st = pipe.entity ? hass?.states?.[pipe.entity] : null;
  if (pipe.type === "strom") {
    let w = null;
    if (st) {
      const v = num(st);
      const u = String(st.attributes?.unit_of_measurement ?? "W").toLowerCase();
      w = v === null ? null : u === "kw" ? v * 1000 : v;
    } else if (Number.isFinite(roomW)) w = roomW;
    if (w === null || Math.abs(w) < 3) return { active: false, speed: 0, reverse: false };
    return { active: true, speed: Math.min(1.6, 0.25 + Math.abs(w) / 1500), reverse: w < 0 };
  }
  if (!st) return { active: false, speed: 0, reverse: false };
  if (["on", "open", "opening"].includes(st.state)) return { active: true, speed: 0.6, reverse: false };
  const v = num(st);
  if (v === null || v <= 0) return { active: false, speed: 0, reverse: false };
  return { active: true, speed: Math.min(1.5, 0.2 + v / 15), reverse: false };
}
