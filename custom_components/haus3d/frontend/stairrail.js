// Treppengeländer ohne THREE (mit node testbar): durchgehender Handlauf über Läufe, Podeste und Wendelstufen,
// Pfosten und Stäbe. Eingabe ist das Layout aus stairs.js (Möbel-System, Antritt vorne bei +z).

/** Höhe des Handlaufs über der Stufe, Abstand zur Treppenkante, größter Abstand der Stäbe (m). */
export const RAIL_H = 0.9;
export const RAIL_INSET = 0.04;
export const BAR_GAP = 0.12;
const POST = 0.06;
const BAR = 0.02;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1]);
  return l > 1e-12 ? [v[0] / l, v[1] / l] : [0, 0];
};
const leftOf = (d) => [d[1], -d[0]];

/** Linienzug um o nach links versetzt (links von d = [d.z, −d.x]), mit Gehrung an den Ecken; gleiche Punktzahl. */
export function offsetPath(path, o) {
  const n = path?.length ?? 0;
  if (n < 2) return (path ?? []).map((p) => [...p]);
  const normals = [];
  for (let i = 0; i < n - 1; i++) normals.push(leftOf(unit(sub(path[i + 1], path[i]))));
  return path.map((p, i) => {
    const a = normals[Math.max(0, i - 1)];
    const b = normals[Math.min(n - 2, i)];
    const m = unit([a[0] + b[0], a[1] + b[1]]);
    const c = m[0] * a[0] + m[1] * a[1];
    // fast umkehrender Linienzug: ohne Gehrung (keine Spitze ins Unendliche)
    const k = c > 0.2 ? o / c : o;
    const dir = c > 0.2 ? m : a;
    return [p[0] + dir[0] * k, p[1] + dir[1] * k];
  });
}

/** Lauflinie: Länge bis zu jedem Punkt und Position zu einer Länge (gleicher Abschnittsanteil auf einer zweiten Linie). */
function measure(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const along = (p) => {
    let best = Infinity;
    let at = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const d = sub(path[i + 1], a);
      const l2 = d[0] * d[0] + d[1] * d[1];
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0;
      const dist = Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
      if (dist < best - 1e-12) {
        best = dist;
        at = cum[i] + t * (cum[i + 1] - cum[i]);
      }
    }
    return at;
  };
  const pointOn = (line, l) => {
    let i = 0;
    while (i < path.length - 2 && l > cum[i + 1]) i++;
    const len = cum[i + 1] - cum[i];
    const f = len > 0 ? Math.max(0, Math.min(1, (l - cum[i]) / len)) : 0;
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * f, line[i][1] + (line[i + 1][1] - line[i][1]) * f];
  };
  return { cum, total: cum.at(-1), along, pointOn };
}

const center = (t) => (t.poly ? [t.poly.reduce((s, p) => s + p[0], 0) / t.poly.length, t.poly.reduce((s, p) => s + p[1], 0) / t.poly.length] : [(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2]);
const depth = (t) => (t?.dir ? Math.abs(t.dir[0]) * (t.x1 - t.x0) + Math.abs(t.dir[1]) * (t.z1 - t.z0) : 0);

/** Höhe des Handlaufs entlang der Lauflinie: Stützstellen (Länge, Stufenoberkante), steigend. */
function heightProfile(lay, m) {
  const pts = [[0, lay.rise / 2]];
  lay.treads.forEach((t, i) => {
    if (!t.landing) {
      pts.push([m.along(center(t)), t.top]);
      return;
    }
    const prev = lay.treads[i - 1];
    const next = lay.treads[i + 1];
    if (prev) pts.push([m.along(center(prev)) + depth(prev), t.top]);
    if (next) pts.push([m.along(center(next)) - depth(next), t.top]);
  });
  pts.push([m.total, lay.treads.at(-1)?.top ?? lay.rise]);
  pts.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [l, y] of pts) {
    const ll = Math.max(0, Math.min(m.total, l));
    const last = out.at(-1);
    if (last && Math.abs(ll - last[0]) < 1e-6) last[1] = Math.max(last[1], y);
    else out.push([ll, y]);
  }
  for (let i = 1; i < out.length; i++) out[i][1] = Math.max(out[i][1], out[i - 1][1]);
  const at = (l) => {
    if (l <= out[0][0]) return out[0][1];
    for (let i = 1; i < out.length; i++) {
      if (l <= out[i][0]) {
        const [l0, y0] = out[i - 1];
        const [l1, y1] = out[i];
        return l1 - l0 > 1e-12 ? y0 + ((y1 - y0) * (l - l0)) / (l1 - l0) : y1;
      }
    }
    return out.at(-1)[1];
  };
  return { stops: out.map((p) => p[0]), at };
}

/** Wendeltreppe: Handlauf außen als Schraubenlinie, Pfosten an Anfang und Ende, Podestgeländer radial. */
function spiralRails(lay) {
  const { sign, turn, step, rise, radius: R, spindle: r0 } = lay;
  const h = lay.treads.at(-1)?.top ?? rise * lay.count;
  const rho = R - RAIL_INSET;
  const P = (rad, deg) => [sign * rad * Math.sin((deg * Math.PI) / 180), rad * Math.cos((deg * Math.PI) / 180)];
  const H = (a) => Math.min(h, rise * (a / step + 0.5));
  const stepTop = (a) => Math.min(lay.count, Math.floor(a / step) + 1) * rise;
  const helix = [];
  const segs = Math.max(1, Math.ceil(turn / 5));
  for (let i = 0; i <= segs; i++) {
    const a = (turn * i) / segs;
    const [x, z] = P(rho, a);
    helix.push([x, H(a) + RAIL_H, z]);
  }
  const bars = [];
  const arc = (rho * Math.PI * turn) / 180;
  const nb = Math.max(1, Math.ceil(arc / BAR_GAP));
  for (let k = 0; k < nb; k++) {
    const a = (turn * (k + 0.5)) / nb;
    const [x, z] = P(rho, a);
    bars.push([x, z, stepTop(a) - 0.05, H(a) + RAIL_H, BAR]);
  }
  const [sx, sz] = P(rho, 0);
  const [ex, ez] = P(rho, turn);
  bars.push([sx, sz, 0, H(0) + RAIL_H + 0.04, POST], [ex, ez, h - 0.05, h + RAIL_H + 0.04, POST]);
  // Podest: Geländer quer bei turn + 90° von der Spindel bis zum Rand, der Außenbogen bleibt offen
  const a = P(r0 + 0.04, turn + 90);
  const b = P(R - 0.04, turn + 90);
  const radial = [[a[0], h + RAIL_H, a[1]], [b[0], h + RAIL_H, b[1]]];
  bars.push([a[0], a[1], h - 0.05, h + RAIL_H + 0.04, POST], [b[0], b[1], h - 0.05, h + RAIL_H + 0.04, POST]);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nr = Math.max(1, Math.ceil(len / BAR_GAP));
  for (let k = 1; k < nr; k++) {
    const f = k / nr;
    bars.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, h - 0.05, h + RAIL_H, BAR]);
  }
  return { rails: [helix, radial], bars };
}

/**
 * Geländer einer Treppe: railing left | right | both | outer (Wendeltreppe: alles außer none = außen).
 * @returns {{rails: number[][][], bars: number[][]}} rails: Handläufe als [x, y, z]-Punkte; bars: [x, z, y0, y1, Stärke]
 */
export function stairRails(lay, railing) {
  const empty = { rails: [], bars: [] };
  if (!railing || railing === "none" || !lay?.treads?.length) return empty;
  if (lay.radius) return spiralRails(lay);
  const sides = railing === "left" ? [1] : railing === "right" ? [-1] : railing === "both" || railing === "outer" ? [1, -1] : [];
  if (!sides.length || !(lay.path?.length >= 2)) return empty;
  const m = measure(lay.path);
  if (!(m.total > 1e-6)) return empty;
  const prof = heightProfile(lay, m);
  const h = lay.treads.at(-1).top;
  const rise = lay.rise;
  const ls = [...new Set([...m.cum, ...prof.stops].map((l) => Math.round(l * 1e6) / 1e6))].filter((l) => l >= 0 && l <= m.total + 1e-9).sort((a, b) => a - b);
  const rails = [];
  const bars = [];
  for (const s of sides) {
    const line = offsetPath(lay.path, s * (lay.run / 2 - RAIL_INSET));
    const pts = ls.map((l) => {
      const [x, z] = m.pointOn(line, l);
      return [x, prof.at(l) + RAIL_H, z];
    });
    rails.push(pts);
    // Pfosten: Anfang, Ende und an den Ecken der Lauflinie
    const post = (l, y0) => {
      const [x, z] = m.pointOn(line, l);
      bars.push([x, z, Math.max(0, y0), prof.at(l) + RAIL_H + 0.04, POST]);
    };
    post(0, 0);
    for (let i = 1; i < m.cum.length - 1; i++) post(m.cum[i], prof.at(m.cum[i]) - rise);
    post(m.total, h - rise);
    // Stäbe je Abschnitt des Handlaufs
    for (let i = 0; i < ls.length - 1; i++) {
      const [x0, , z0] = pts[i];
      const [x1, , z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const n = Math.ceil(len / BAR_GAP);
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const l = ls[i] + (ls[i + 1] - ls[i]) * f;
        const y = prof.at(l);
        bars.push([x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, Math.max(0, y - rise), y + RAIL_H, BAR]);
      }
    }
  }
  return { rails, bars };
}
