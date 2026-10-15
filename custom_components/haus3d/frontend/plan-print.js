// Plan drucken (rein, ohne DOM, mit node testbar): Papier und Maßstab wählen, Seiten als SVG-Text bauen, Druck-HTML und
// Dateinamen. Wird nur bei Bedarf per import() geladen (panel-print.js).
//
// Maße: Alle Längen der Seite sind Millimeter auf dem Papier. Die SVG-Seite deckt das bedruckbare Feld ab (Papier minus
// 10 mm Rand), `width="277mm"` + `viewBox="0 0 277 189"` machen eine Einheit zu genau einem Millimeter; der Plan wird
// mit 1000 / Maßstab mm je Meter hineingerechnet. Der Maßstab stimmt deshalb beim Drucken in Originalgröße (100 %).

import { computeWalls, flushFootprint, labelPoint, pieceFootprint, planFootprints, signedArea } from "./walls.js";
import { edgeDimensions, openingGeometry } from "./edit-ops.js";
import { floorColor } from "./model.js";

/** Papier (hoch, mm). */
export const PAPERS = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
/** Maßstäbe 1:n. */
export const SCALES = [50, 100, 200, 250, 500, 1000];
/** Seitenrand (mm), Kopf, Fuß und Platz um den Plan für Maßketten (mm). */
export const MARGIN = 10;
export const HEAD = 14;
export const FOOT = 6;
export const PAD = 15;

/** Farben der Gartenflächen (wie die Auswahl „Art“ im Editor; ein Test vergleicht beide). */
export const OUTDOOR_COLORS = {
  lawn: "#6aa84f", terrace: "#c2b39b", path: "#bcb4a6", driveway: "#8c8c8c", pool: "#2f9fe0", bed: "#6b4a2f", hedge: "#2f6b2a",
  fence: "#8a6f52", balcony: "#b5ada3", gravel: "#c4beb2", paving: "#a39a8e", rockery: "#8a8378", kerb: "#b9b9b4",
};

const num = (v) => Math.round(v * 1000) / 1000;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const p2 = (n) => String(n).padStart(2, "0");
/** Zahl mit Komma (ohne Ortseinstellung, damit der Text überall gleich ist). */
const de = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
const textW = (s, size, bold = false) => [...String(s)].length * size * (bold ? 0.6 : 0.54);

/** Name des Hauses für Kopfzeile und Seitentitel. */
export function houseName(building) {
  return String(building?.settings?.title ?? "").trim() || "Haus 3D";
}

/** „15.10.2026“. */
export function dateText(date = new Date()) {
  return `${p2(date.getDate())}.${p2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Dateiname einer PNG-Seite: haus3d-plan-eg-2026-10-15.png bzw. haus3d-3d-2026-10-15.png. */
export function planFileName(kind, id, date = new Date()) {
  const slug = String(id ?? "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `haus3d-${kind}${slug ? `-${slug}` : ""}-${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}.png`;
}

/** Umfang einer Etage in Metern: Räume, Wandflächen (mit Dicke), freie Wände, optional Gartenflächen; null ohne Inhalt. */
export function floorBounds(floor, settings = {}, { outdoor = true } = {}) {
  if (!floor) return null;
  const pts = [];
  for (const r of floor.rooms ?? []) pts.push(...(r.points ?? []));
  if ((floor.rooms?.length ?? 0) || (floor.walls?.length ?? 0)) {
    try {
      for (const fp of planFootprints(computeWalls(floor, settings).segments)) pts.push(...fp);
    } catch {
      /* ohne Wandflächen: nur die Räume zählen */
    }
  }
  if (outdoor) for (const o of floor.outdoor ?? []) pts.push(...(o.points ?? []));
  const ok = pts.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!ok.length) return null;
  const xs = ok.map((p) => p[0]);
  const zs = ok.map((p) => p[1]);
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}

/** Vereinigung mehrerer Umfänge (null-Einträge zählen nicht); null, wenn nichts übrig bleibt. */
export function unionBounds(list) {
  const b = list.filter(Boolean);
  if (!b.length) return null;
  return { x0: Math.min(...b.map((x) => x.x0)), z0: Math.min(...b.map((x) => x.z0)), x1: Math.max(...b.map((x) => x.x1)), z1: Math.max(...b.map((x) => x.z1)) };
}

/** Bedruckbares Feld (mm) und darin der Platz für den Plan (ohne Kopf, Fuß und Maßketten-Rand). */
function areaOf(paper, orientation) {
  const p = PAPERS[paper] ?? PAPERS.A4;
  const w = (orientation === "portrait" ? p.w : p.h) - 2 * MARGIN;
  const h = (orientation === "portrait" ? p.h : p.w) - 2 * MARGIN - 1; // 1 mm Luft, damit nie eine leere Folgeseite entsteht
  return { w, h, aw: w - 2 * PAD, ah: h - HEAD - FOOT - 2 * PAD };
}

const sizeOf = (bounds) => ({ bw: Math.max(0.5, (bounds?.x1 ?? 1) - (bounds?.x0 ?? 0)), bh: Math.max(0.5, (bounds?.z1 ?? 1) - (bounds?.z0 ?? 0)) });

function fitsAt(bounds, paper, orientation, scale) {
  const { bw, bh } = sizeOf(bounds);
  const a = areaOf(paper, orientation);
  return (bw * 1000) / scale <= a.aw + 1e-6 && (bh * 1000) / scale <= a.ah + 1e-6;
}

/**
 * Seitenlage und Maßstab für einen Umfang (Meter). Ohne `scale` (automatisch) gilt der größte Maßstab aus SCALES, bei dem
 * der Plan passt; quer geht vor, hochkant nur, wenn dort ein größerer Maßstab passt (oder ein vorgegebener nur dort).
 * @returns {{ paper: string, orientation: "landscape"|"portrait", scale: number, fits: boolean, w: number, h: number, bounds: object }}
 */
export function pickLayout(bounds, paper = "A4", scale = null) {
  const b = bounds ?? { x0: 0, z0: 0, x1: 1, z1: 1 };
  const pp = PAPERS[paper] ? paper : "A4";
  const make = (orientation, s, fits) => ({ paper: pp, orientation, scale: s, fits, bounds: b, w: areaOf(pp, orientation).w, h: areaOf(pp, orientation).h });
  const orientations = ["landscape", "portrait"];
  if (scale) {
    const o = orientations.find((x) => fitsAt(b, pp, x, scale));
    return make(o ?? "landscape", scale, !!o);
  }
  for (const s of SCALES) {
    const o = orientations.find((x) => fitsAt(b, pp, x, s));
    if (o) return make(o, s, true);
  }
  return make("landscape", SCALES[SCALES.length - 1], false);
}

/** Maßstäbe, bei denen der Plan auf das Papier passt (quer oder hochkant). */
export function fittingScales(bounds, paper = "A4") {
  const pp = PAPERS[paper] ? paper : "A4";
  return SCALES.filter((s) => ["landscape", "portrait"].some((o) => fitsAt(bounds, pp, o, s)));
}

/** Breite der waagerechten Sehne eines Polygons durch c (Meter); 0, wenn c außen liegt. */
function chordAt(points, c) {
  const xs = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a[1] > c[1] === b[1] > c[1]) continue;
    xs.push(a[0] + ((c[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  xs.sort((p, q) => p - q);
  for (let i = 0; i + 1 < xs.length; i += 2) if (c[0] >= xs[i] - 1e-9 && c[0] <= xs[i + 1] + 1e-9) return xs[i + 1] - xs[i];
  return 0;
}

/** Maßstabsleiste: nächste Länge aus 1-2-5-Stufen zu etwa 50 mm. */
function barLength(k) {
  const steps = [1, 2, 5, 10, 20, 50, 100];
  return steps.reduce((best, s) => (Math.abs(s * k - 50) < Math.abs(best * k - 50) ? s : best), steps[0]);
}

/** Kopfzeile: Titel, Untertitel, Nordpfeil. */
function headSvg({ w, title, sub, north, deg, bw }) {
  const ink = bw ? "#000" : "#222";
  const size = Math.max(3, Math.min(5, (w - (north === null ? 4 : 24)) / (Math.max(1, [...title].length) * 0.6)));
  let out = `<text x="0" y="5" font-size="${num(size)}" font-weight="700" fill="${ink}">${esc(title)}</text><text x="0" y="9.6" font-size="3" fill="#555">${esc(sub)}</text>`;
  if (north !== null) {
    const cx = w - 8;
    const cy = 9.6;
    const a = (deg * Math.PI) / 180;
    // Nadel mit „N“ an der Spitze (Richtung [sin, −cos] wie in der Dach-Ebene); das „N“ bleibt aufrecht
    out += `<g data-north="${num(deg)}" transform="translate(${cx} ${cy})"><circle r="6" fill="#fff" stroke="${ink}" stroke-width=".25"/><g transform="rotate(${num(deg)})"><polygon points="0,-5 1.7,2.4 0,1.1 -1.7,2.4" fill="${bw ? "#000" : "#e53935"}"/></g><text x="${num(Math.sin(a) * 8.2)}" y="${num(-Math.cos(a) * 8.2 + 1)}" text-anchor="middle" font-size="2.8" font-weight="700" fill="${ink}">N</text></g>`;
  }
  return out;
}

/** Fuß: Maßstabsleiste (links) und Hinweis (rechts). */
function footSvg({ w, h, k, note, bar }) {
  let out = "";
  const y = h - 4.6;
  if (bar) {
    const L = barLength(k);
    const len = L * k;
    const n = 4;
    for (let i = 0; i < n; i++) out += `<rect x="${num((len / n) * i)}" y="${num(y)}" width="${num(len / n)}" height="1.5" fill="${i % 2 ? "#fff" : "#000"}" stroke="#000" stroke-width=".2"/>`;
    const lab = (x, t, anchor = "middle") => `<text x="${num(x)}" y="${num(h - 0.6)}" text-anchor="${anchor}" font-size="2.2" fill="#222">${t}</text>`;
    out += lab(0, "0", "start") + lab(len / 2, de(L / 2, L / 2 % 1 ? 1 : 0)) + lab(len, `${de(L, 0)} m`);
  }
  out += `<text x="${w}" y="${num(h - 0.6)}" text-anchor="end" font-size="2.2" fill="#888">${esc(note)}</text>`;
  return out;
}

/**
 * Maßkette: Linie mit Strichen an den Teilpunkten und Maßzahlen. `stops` sind Meter entlang der Achse (aufsteigend),
 * `A` rechnet sie aufs Papier, `fixed` ist die Lage der Linie quer dazu (mm), `edge` der Rand des Hauses (für Hilfslinien).
 */
function dimChain({ stops, axis, A, fixed, edge, totalLabel }) {
  if (stops.length < 2) return "";
  const at = (p) => `${num(p[0])},${num(p[1])}`;
  const path = (d, col, sw) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}"/>`;
  const horiz = axis === "x";
  const papers = stops.map(A);
  const first = papers[0];
  const last = papers[papers.length - 1];
  /** Linie in der Tiefe `off` (mm, nach außen) von first nach last, Schrägstriche bei `marks`. */
  const chain = (off, marks) => {
    const q = (a) => (horiz ? [a, fixed + off] : [fixed - off, a]);
    let out = path(`M${at(q(first))}L${at(q(last))}`, "#444", 0.15);
    for (const a of marks) {
      const [x, y] = q(a);
      out += path(`M${at([x - 0.8, y + 0.8])}L${at([x + 0.8, y - 0.8])}`, "#444", 0.25);
    }
    return out;
  };
  const label = (a0, a1, text, off) => {
    const mid = (a0 + a1) / 2;
    if (Math.abs(a1 - a0) < textW(text, 2.2) + 1) return "";
    return horiz
      ? `<text x="${num(mid)}" y="${num(fixed + off + 2.7)}" text-anchor="middle" font-size="2.2" fill="#222">${text}</text>`
      : `<text x="0" y="0" transform="translate(${num(fixed - off - 0.7)} ${num(mid)}) rotate(-90)" text-anchor="middle" font-size="2.2" fill="#222">${text}</text>`;
  };
  let out = chain(0, papers);
  // Hilfslinien vom Haus bis zur Kette
  for (const a of papers) out += path(horiz ? `M${at([a, edge])}L${at([a, fixed + 1])}` : `M${at([edge, a])}L${at([fixed - 1, a])}`, "#999", 0.1);
  if (stops.length > 2) {
    for (let i = 0; i + 1 < stops.length; i++) out += label(papers[i], papers[i + 1], de(stops[i + 1] - stops[i]), 0);
    const far = 5;
    out += chain(far, [first, last]) + label(first, last, totalLabel, far);
  } else out += label(first, last, totalLabel, 0);
  return out;
}

/**
 * Teilpunkte der Maßkette entlang einer Achse: die Ecken der Räume auf dem äußersten Rand (unten bzw. links) und die
 * Außenkanten der Wände `lo`/`hi` (Meter), damit das Gesamtmaß von Wandaußenkante zu Wandaußenkante misst (gerundet, ohne Doppelte).
 */
function chainStops(rooms, axis, side, lo, hi) {
  const pts = rooms.flatMap((r) => r.points ?? []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) return [];
  const perp = axis === "x" ? 1 : 0; // Querachse: z für waagerechte Ketten, x für senkrechte
  const along = axis === "x" ? 0 : 1;
  const ext = side === "max" ? Math.max(...pts.map((p) => p[perp])) : Math.min(...pts.map((p) => p[perp]));
  const r2 = (v) => Math.round(v * 100) / 100;
  const on = pts.filter((p) => Math.abs(p[perp] - ext) <= 0.05).map((p) => r2(p[along]));
  return [...new Set([r2(lo), ...on, r2(hi)])].sort((a, b) => a - b);
}

/**
 * Eine Seite (Grundriss einer Etage) als SVG-Text.
 * @param {object} building
 * @param {string} floorId
 * @param {ReturnType<typeof pickLayout>} layout gemeinsam für alle Seiten (Ausschnitt `layout.bounds`)
 * @param {{ dims?: boolean, names?: boolean, north?: boolean, outdoor?: boolean, bw?: boolean, date?: Date }} [opts]
 */
export function pageSvg(building, floorId, layout, opts = {}) {
  const o = { dims: true, names: true, north: true, outdoor: true, bw: false, date: new Date(), ...opts };
  const settings = building?.settings ?? {};
  const floor = (building?.floors ?? []).find((f) => f.id === floorId);
  const { w, h, scale } = layout;
  const k = 1000 / scale;
  const own = floorBounds(floor, settings, o);
  const b = layout.bounds ?? own ?? { x0: 0, z0: 0, x1: 1, z1: 1 };
  const ox = w / 2 - (((b.x0 + b.x1) / 2) * k);
  const oz = HEAD + (h - HEAD - FOOT) / 2 - (((b.z0 + b.z1) / 2) * k);
  const X = (x) => ox + x * k;
  const Z = (z) => oz + z * k;
  const P = (p) => `${num(X(p[0]))},${num(Z(p[1]))}`;
  const bw = !!o.bw;
  const ink = bw ? "#000" : "#222";
  const north = o.north ? (((Number(settings.north) || 0) % 360) + 360) % 360 : null;
  const parts = [];

  if (floor) {
    // Außenflächen
    if (o.outdoor) {
      for (const g of floor.outdoor ?? []) {
        if ((g.points?.length ?? 0) < 3) continue;
        const col = OUTDOOR_COLORS[g.type] ?? "#999";
        parts.push(`<polygon points="${g.points.map(P).join(" ")}" fill="${bw ? "#888" : col}" fill-opacity="${bw ? 0.1 : 0.25}" stroke="${bw ? "#999" : col}" stroke-opacity=".6" stroke-width=".15"/>`);
      }
    }
    // Räume
    for (const r of floor.rooms ?? []) {
      if ((r.points?.length ?? 0) < 3) continue;
      parts.push(`<polygon points="${r.points.map(P).join(" ")}" fill="${bw ? "#fff" : floorColor(r)}" fill-opacity="${bw ? 1 : 0.3}" stroke="#666" stroke-width=".15"/>`);
    }
    // Wände und Öffnungen
    let walls = { segments: [], openings: [] };
    try {
      walls = computeWalls(floor, settings);
    } catch {
      /* ohne Wände weiterzeichnen */
    }
    parts.push(`<g fill="#222">${planFootprints(walls.segments).map((fp) => `<polygon points="${fp.map(P).join(" ")}"/>`).join("")}</g>`);
    const segById = new Map(walls.segments.map((s) => [s.id, s]));
    const line = (a, b2, col, sw, dash = "") => `<path d="M${P(a)}L${P(b2)}" fill="none" stroke="${col}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
    let gaps = "";
    let marks = "";
    for (const pl of walls.openings) {
      const op = pl.opening;
      const seg = segById.get(pl.segment);
      if (!seg || !(pl.s1 > pl.s0)) continue;
      const [l0, r0, r1, l1] = pieceFootprint(seg, pl.s0, pl.s1);
      gaps += `<polygon points="${[l0, r0, r1, l1].map(P).join(" ")}" fill="#fff"/>`;
      const strip = flushFootprint(seg, pl.s0, pl.s1);
      if (strip) gaps += `<polygon points="${strip.map(P).join(" ")}" fill="#fff"/>`;
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (op.type === "window") {
        const col = bw ? "#000" : "#29b6f6";
        marks += line(l0, l1, col, 0.35) + line(r0, r1, col, 0.35) + line(mid(l0, r0), mid(l1, r1), col, 0.35);
      } else if (op.type === "garage") {
        marks += line(mid(l0, r0), mid(l1, r1), bw ? "#000" : "#555", 0.35, "1.6 1.2");
      } else if (op.type === "door") {
        if (op.style === "sliding") marks += line(mid(l0, r0), mid(l1, r1), ink, 0.35);
        else if (op.style !== "passage") {
          const g = openingGeometry(floor, op);
          if (!g) continue;
          // Aufschlag zur Raumseite (rein) bzw. zur anderen Seite (raus), wie im Editor
          const n = [-g.u[1], g.u[0]];
          const inside = g.room ? (signedArea(g.room.points) > 0 ? 1 : -1) : 1;
          const side = inside * (op.swing === "out" ? -1 : 1);
          const hingeAtEnd = (op.hinge === "right") === (inside > 0);
          const leaf = (hp, free, width) => {
            const tip = [hp[0] + n[0] * side * width, hp[1] + n[1] * side * width];
            const sweep = side * (hp === g.p1 ? -1 : 1) > 0 ? 1 : 0;
            return `<path d="M${P(tip)}A${num(width * k)} ${num(width * k)} 0 0 ${sweep} ${P(free)}M${P(hp)}L${P(tip)}" fill="none" stroke="${ink}" stroke-width=".25"/>`;
          };
          if (Number(op.leaves) === 2) {
            const half = op.width / 2;
            marks += leaf(g.p0, g.center, half) + leaf(g.p1, g.center, half);
          } else marks += hingeAtEnd ? leaf(g.p1, g.p0, op.width) : leaf(g.p0, g.p1, op.width);
        }
      }
    }
    parts.push(gaps, marks);

    // Raumnamen und Flächen
    if (o.names) {
      for (const r of floor.rooms ?? []) {
        if ((r.points?.length ?? 0) < 3) continue;
        const c = labelPoint(r.points);
        const name = String(r.name ?? "");
        const room = chordAt(r.points, c) * k - 2;
        const roomed = textW(name, 3, true) <= room;
        const size = roomed ? 3 : 2;
        const area = `${de(Math.abs(signedArea(r.points)), 2)} m²`;
        const withArea = roomed && textW(area, 2.5) <= room;
        if (withArea) {
          parts.push(`<text x="${num(X(c[0]))}" y="${num(Z(c[1]) - 0.4)}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${ink}">${esc(name)}</text>`);
          parts.push(`<text x="${num(X(c[0]))}" y="${num(Z(c[1]) + 2.7)}" text-anchor="middle" font-size="2.5" fill="#444">${area}</text>`);
        } else {
          parts.push(`<text x="${num(X(c[0]))}" y="${num(Z(c[1]) + size * 0.35)}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${ink}">${esc(name)}</text>`);
        }
      }
    }

    // Maße: je Raumkante (geteilte Kanten einmal) und als Maßketten außen
    if (o.dims) {
      const seen = new Set();
      for (const r of floor.rooms ?? []) {
        if ((r.points?.length ?? 0) < 3) continue;
        for (const e of edgeDimensions(r.points)) {
          if (e.len < 0.5) continue;
          const a = r.points[e.i];
          const q = r.points[(e.i + 1) % r.points.length];
          const key = [a, q].map((p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`).sort().join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          const inset = 0.06 + 1.7 / k;
          const cx = X(e.mid[0] - e.nOut[0] * inset);
          const cz = Z(e.mid[1] - e.nOut[1] * inset);
          let ang = (Math.atan2(q[1] - a[1], q[0] - a[0]) * 180) / Math.PI;
          if (ang > 90) ang -= 180;
          else if (ang <= -90) ang += 180;
          parts.push(`<text x="${num(cx)}" y="${num(cz + 0.8)}" text-anchor="middle" font-size="2.2" fill="#333" transform="rotate(${num(ang)} ${num(cx)} ${num(cz)})">${de(e.len)}</text>`);
        }
      }
      const rooms = (floor.rooms ?? []).filter((r) => (r.points?.length ?? 0) >= 3);
      const face = floorBounds(floor, settings, { outdoor: false });
      if (rooms.length && face) {
        const xs = chainStops(rooms, "x", "max", face.x0, face.x1);
        const zs = chainStops(rooms, "z", "min", face.z0, face.z1);
        parts.push(dimChain({ stops: xs, axis: "x", A: X, fixed: Z(face.z1) + 6, edge: Z(face.z1) + 1, totalLabel: `${de(xs[xs.length - 1] - xs[0])} m` }));
        parts.push(dimChain({ stops: zs, axis: "z", A: Z, fixed: X(face.x0) - 6, edge: X(face.x0) - 1, totalLabel: `${de(zs[zs.length - 1] - zs[0])} m` }));
      }
    }
  }

  const title = `${houseName(building)} – ${floor?.name ?? ""}`.trim();
  const sub = `Grundriss · Maßstab 1:${scale} · Maße in m · ${dateText(o.date)}`;
  const head = headSvg({ w, title, sub, north, deg: north ?? 0, bw });
  const foot = footSvg({ w, h, k, note: "Haus 3D · Maßstab gilt bei Druck in Originalgröße (100 %)", bar: true });
  return svgRoot(layout, `<g data-plan="" data-scale="${scale}" data-floor="${esc(floorId)}">${parts.join("")}</g>${head}${foot}`, { floor: floorId });
}

/** Seite mit dem 3D-Bild (Daten-URL), eingepasst unter der Kopfzeile. */
export function shotPage(title, dataUrl, layout, opts = {}) {
  const { w, h } = layout;
  const date = opts.date ?? new Date();
  const head = headSvg({ w, title: `${title} – 3D-Ansicht`, sub: `3D-Ansicht der aktuellen Ansicht · ${dateText(date)}`, north: null, deg: 0, bw: false });
  const foot = footSvg({ w, h, k: 1, note: "Haus 3D", bar: false });
  const img = `<image x="0" y="${HEAD + 2}" width="${w}" height="${num(h - HEAD - FOOT - 4)}" preserveAspectRatio="xMidYMid meet" href="${esc(dataUrl)}"/>`;
  return svgRoot(layout, `${img}${head}${foot}`, { shot: true });
}

function svgRoot(layout, inner, attrs = {}) {
  const { w, h } = layout;
  const a = Object.entries(attrs).map(([k, v]) => ` data-${k}="${v === true ? "" : esc(v)}"`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="sans-serif"${a}><rect width="${w}" height="${h}" fill="#fff"/>${inner}</svg>`;
}

/**
 * Alle Seiten für eine Auswahl von Etagen (ein Maßstab, ein Ausschnitt, gleiche Lage), optional mit 3D-Seite.
 * @param {object} building
 * @param {{ floors: string[], paper?: string, scale?: number|null, shot?: string|null, dims?: boolean, names?: boolean, north?: boolean, outdoor?: boolean, bw?: boolean, date?: Date }} sel
 * @returns {{ layout: ReturnType<typeof pickLayout>, pages: { kind: "plan"|"3d", id: string|null, name: string, svg: string }[] }}
 */
export function planPages(building, { floors = [], paper = "A4", scale = null, shot = null, ...opts } = {}) {
  const settings = building?.settings ?? {};
  const list = floors.map((id) => (building?.floors ?? []).find((f) => f.id === id)).filter(Boolean);
  const bounds = unionBounds(list.map((f) => floorBounds(f, settings, opts)));
  const layout = pickLayout(bounds, paper, scale);
  const pages = list.map((f) => ({ kind: "plan", id: f.id, name: f.name, svg: pageSvg(building, f.id, layout, opts) }));
  if (shot) pages.push({ kind: "3d", id: null, name: "3D-Ansicht", svg: shotPage(houseName(building), shot, layout, opts) });
  return { layout, pages };
}

/** Druck-HTML: eine Seite je SVG, Papiergröße und Rand aus `@page`, alles inline. */
export function printHtml(pages, layout, title = "Haus 3D") {
  const css = `
@page { size: ${layout.paper} ${layout.orientation}; margin: ${MARGIN}mm }
html, body { margin: 0; padding: 0; background: #fff; font-family: sans-serif }
.page { box-sizing: content-box; width: ${layout.w}mm; height: ${layout.h}mm; overflow: hidden; break-after: page; page-break-after: always }
.page:last-child { break-after: auto; page-break-after: auto }
.page svg { display: block }
@media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact } }
@media screen { body { background: #8d8d8d; padding: 12px 0 } .page { background: #fff; margin: 0 auto 12px; padding: ${MARGIN}mm; box-shadow: 0 1px 6px rgba(0,0,0,.5) } }`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${pages.map((p) => `<div class="page">${p}</div>`).join("")}</body></html>`;
}
