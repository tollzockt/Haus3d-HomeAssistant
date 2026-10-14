// Randsteine in der 3D-Szene: Steine (Beton, Granit, Läufer) als Blöcke mit Fuge, Rasenkante aus Metall als durchgehender
// Streifen, Palisaden als runde Pfähle – an den freien Kanten einer Gartenfläche (area.edge) und als Linie „Randstein“
// (area.type "kerb"). Die Maße und Kantenstücke berechnet kerb.js; hier entsteht nur die Geometrie.

import * as THREE from "./vendor/three.module.min.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { KERB_KINDS, NO_EDGE_TYPES, kerbBlocks, kerbCorners, kerbSegments, kerbSpec } from "./kerb.js";
import { tint } from "./model-parts.js";
import { rng } from "./garden-parts.js";

/** Fläche mit Normale zur Richtung hint anhängen (Reihenfolge der Ecken wird angepasst). */
function quad(out, a, b, c, d, hint) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n);
  if (l < 1e-12) return;
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
    [b, d] = [d, b];
    n = n.map((x) => -x);
  }
  n = n.map((x) => x / l);
  for (const p of [a, b, c, a, c, d]) {
    out.pos.push(p[0], p[1], p[2]);
    out.nor.push(n[0], n[1], n[2]);
  }
}

const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/**
 * Geometrie je Farbton (Steine wechseln sich ab): Stein = Quader entlang des Stücks, oben und an den vier Seiten, Unterkante im Boden.
 * @returns {{geos: (THREE.BufferGeometry|null)[], blocks: number}}
 */
export function kerbGeometry(segments, spec, baseY) {
  const shades = spec.shades.length;
  const out = spec.shades.map(() => ({ pos: [], nor: [] }));
  const posts = spec.shades.map(() => []);
  let blocks = 0;
  const rand = rng(7);
  segments.forEach((seg, si) => {
    const yAt = (t) => baseY + seg.ha + (seg.hb - seg.ha) * t;
    if (spec.round) {
      // Palisaden: runde Pfähle Seite an Seite, Oberkante leicht unterschiedlich
      const n = Math.max(1, Math.round(seg.len / (spec.w * 1.04)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const c = lerp2(seg.a, seg.b, t);
        const hh = spec.h + spec.depth + (rand() - 0.5) * Math.min(0.03, spec.h * 0.2);
        const geo = new THREE.CylinderGeometry(spec.w / 2, (spec.w / 2) * 0.97, hh, 8);
        geo.translate(c[0], yAt(t) - spec.depth + hh / 2, c[1]);
        posts[(k + si) % shades].push(geo);
        blocks++;
      }
      return;
    }
    const { L0, R0, L1, R1 } = kerbCorners(seg, spec.w);
    const n = kerbBlocks(seg.len, spec.pitch);
    const half = spec.pitch > 0 ? spec.gap / 2 / Math.max(seg.len, 1e-6) : 0;
    const u = seg.u;
    const left = [-u[1], 0, u[0]];
    for (let k = 0; k < n; k++) {
      const t0 = k / n + (k > 0 ? half : 0);
      const t1 = (k + 1) / n - (k < n - 1 ? half : 0);
      const a = lerp2(L0, L1, t0);
      const b = lerp2(R0, R1, t0);
      const c = lerp2(R0, R1, t1);
      const d = lerp2(L0, L1, t1);
      const top0 = yAt(t0) + spec.h;
      const top1 = yAt(t1) + spec.h;
      const bot0 = yAt(t0) - spec.depth;
      const bot1 = yAt(t1) - spec.depth;
      const o = out[(k + si) % shades];
      const P = (p, y) => [p[0], y, p[1]];
      quad(o, P(a, top0), P(b, top0), P(c, top1), P(d, top1), [0, 1, 0]);
      quad(o, P(a, bot0), P(d, bot1), P(d, top1), P(a, top0), left);
      quad(o, P(b, bot0), P(c, bot1), P(c, top1), P(b, top0), [-left[0], 0, -left[2]]);
      quad(o, P(a, bot0), P(b, bot0), P(b, top0), P(a, top0), [-u[0], 0, -u[1]]);
      quad(o, P(d, bot1), P(c, bot1), P(c, top1), P(d, top1), [u[0], 0, u[1]]);
      blocks++;
    }
  });
  const geos = out.map((o, i) => {
    if (posts[i].length) return posts[i].length === 1 ? posts[i][0] : mergeGeometries(posts[i], false);
    if (!o.pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(o.nor, 3));
    geo.computeBoundingSphere();
    return geo;
  });
  return { geos, blocks };
}

/**
 * Randstein aus Kantenstücken (kerbSegments) als Gruppe; baseY = Höhe der Fläche (die Höhen je Stück kommen von ha/hb).
 * M: Materialien der Szene (furnMats), im Cyberpunk-Stil mit Neonkanten.
 */
export function buildKerb(segments, spec, baseY, M) {
  const group = new THREE.Group();
  group.name = "kerb";
  const { geos, blocks } = kerbGeometry(segments, spec, baseY);
  geos.forEach((geo, i) => {
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, tint(M, spec.shades[i], { roughness: spec.rough, metalness: spec.metal }));
    group.add(mesh);
    if (M.edge) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), M.edge));
  });
  group.userData.kerb = { kind: spec.kind, segments: segments.length, blocks, w: spec.w, h: spec.h };
  return group;
}

/** Randstein als Linie (Gartenfläche vom Typ "kerb"): entlang der Mittellinie, ohne Linie rund um das Polygon. */
export function buildKerbArea(sc, area, elev) {
  const group = new THREE.Group();
  const line = Array.isArray(area.line?.points) && area.line.points.length > 1;
  const kind = KERB_KINDS[area.edge] ? area.edge : "concrete";
  const spec = kerbSpec(kind, { width: line ? area.line.width : null, height: area.edge_h, line: true });
  const segs = kerbSegments(line ? area.line.points : area.points, [], { closed: !line });
  if (segs.length) group.add(buildKerb(segs, spec, elev - 0.035, sc.furnMats));
  return group;
}

/**
 * Randstein/Kante an den freien Kanten einer Gartenfläche (area.edge, area.edge_h), nicht an Hauswänden. Bei Hang
 * (heights, Fläche ohne eigene Höhe) folgt die Kante den Eckhöhen, sonst liegt sie auf der Oberkante der Fläche.
 * look: Darstellung der Art ({y, h}), elev: Höhe der Etage, heights: Höhen je Eckpunkt oder null.
 */
export function addAreaKerb(sc, group, area, look, elev, heights, floor) {
  if (NO_EDGE_TYPES.includes(area.type)) return;
  const spec = kerbSpec(area.edge, { height: area.edge_h });
  if (!spec) return;
  const sloped = !!heights && look.h === 0;
  const flat = heights && !sloped ? heights.reduce((s, v) => s + v, 0) / heights.length : 0;
  const baseY = elev + look.y + look.h + flat;
  // Außenwände ragen über die Raumkante hinaus: Strecken dort gelten als Hauswand
  const tol = Math.min(1.05, Math.max(0.15, (Number(sc.building?.settings?.wall_exterior) || 0.24) + 0.05));
  const segs = kerbSegments(area.points, floor?.rooms ?? [], { closed: true, tol, heights: sloped ? heights : null });
  if (segs.length) group.add(buildKerb(segs, spec, baseY, sc.furnMats));
}
