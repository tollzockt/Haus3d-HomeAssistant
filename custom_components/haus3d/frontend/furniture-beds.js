// 3D-Modelle des Katalogs „Beet & Gewächshaus“ (catalog-garden.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.
// Gewächshäuser und Gartenhäuser stehen in furniture-beds2.js (dort auch die gemeinsamen Bausteine).

import { THREE, at, ballG, boxG, cylG, grid, merged, palette, plants, rng, rodG, tint } from "./garden-parts.js";
import { buildBeds2, prismX, prismZ, seg } from "./furniture-beds2.js";

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Hochbeet aus gestapelten Brettern entlang eines geschlossenen Umrisses pts [[x, z], …] mit Eckpfosten und Abdeckleiste;
 * innen ein Erdblock (Rechtecke fill [x0, z0, x1, z1]), der durch die Fugen dunkel scheint. Oberkante hb.
 */
function boardBed(g, M, P, pts, fill, hb, rows = 5) {
  const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  const t = 0.03;
  const bh = (hb - 0.05) / rows;
  const boards = [];
  for (let r = 0; r < rows; r++) for (const [a, b] of segs) boards.push(seg(a, b, 0.01 + r * bh, bh - 0.012, t, t));
  merged(g, M.wood, [...boards, ...segs.map(([a, b]) => seg(a, b, hb - 0.035, 0.035, 0.11, 0.11))]);
  merged(g, P.woodD, pts.map(([x, z]) => boxG(0.07, hb - 0.04, 0.07, x, 0, z)));
  merged(g, P.soil, fill.map(([x0, z0, x1, z1]) => boxG(x1 - x0, hb - 0.08, z1 - z0, (x0 + x1) / 2, 0.01, (z0 + z1) / 2)));
}

/** Beetbepflanzung in Rechtecken [x0, z0, x1, z1] auf Höhe y (Erde), Pflanzen bis etwa top: vorn Salat, dahinter Kräuter und Mangold. */
function bedPlants(g, M, P, rects, y, top, seed = 1) {
  const r = rng(seed);
  const salad = [];
  const herbs = [];
  const tall = [];
  const room = Math.max(0.08, top - y);
  for (const [x0, z0, x1, z1] of rects) {
    const nx = Math.max(1, Math.round((x1 - x0) / 0.2));
    const nz = Math.max(1, Math.round((z1 - z0) / 0.19));
    grid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, nx, nz).forEach(([px, pz], i) => {
      const row = i % nz;
      const p = [px + (r() - 0.5) * 0.04, y, pz + (r() - 0.5) * 0.04];
      if (row === nz - 1 || (row === nz - 2 && i % 2)) salad.push([...p, Math.min(0.09, room * 0.6) * (0.9 + r() * 0.2)]);
      else if ((i + seed) % 3) herbs.push([...p, Math.min(0.065, room * 0.4) * (0.85 + r() * 0.3)]);
      else tall.push([...p, Math.min(0.11, room * 0.62) * (0.9 + r() * 0.15)]);
    });
  }
  plants(g, { leaf: tint(M, 0x9ccc4f, { roughness: 0.8 }), leafD: tint(M, 0x7cb342, { roughness: 0.8 }) }, salad, { squash: 0.62, seed });
  plants(g, P, herbs, { squash: 1.5, blossom: M.blossom?.[2] ?? P.flower, seed: seed + 1 });
  plants(g, { leaf: P.leafD, leafD: tint(M, 0x3d7a2e, { roughness: 0.8 }) }, tall, { squash: 1.25, blossom: P.yellow, seed: seed + 2 });
}

/** Ranke: Stängel entlang path [[x, y, z], …], Blätter (flach in z, Faktor fz) in L[0]/L[1], Blüten in B[0]/B[1]. */
function vine(S, L, B, path, r, step, size, fz, bloom = 0.45) {
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]];
    S.push(rodG(a, b, 0.006, 4));
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let k = 0; k < n; k++) {
      const t = (k + r()) / n;
      const p = a.map((v, j) => v + (b[j] - v) * t);
      const s = size * (0.75 + r() * 0.5);
      L[(i + k) % 2].push(ballG(s, p[0] + (r() - 0.5) * s * 1.2, p[1] + (r() - 0.5) * s, p[2] + (r() - 0.3) * s * fz, [1, 0.8, fz], 6));
      if (r() < bloom) B[k % 2].push(ballG(s * 0.42, p[0] + (r() - 0.5) * s, p[1] + (r() - 0.5) * s, p[2] + s * fz * 0.7, [1, 0.85, 1], 6));
    }
  }
}

/** Baut einen Typ dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildBeds(type, w, d, h, M, g, bulbs, item = {}) {
  const P = palette(M);
  switch (type) {
    // Hochbeet: gestapelte Bretter mit Fugen, Eckpfosten, Abdeckleiste, Erde; vorn Salat, dahinter Kräuter und Mangold
    case "garden_raised_bed": {
      const hb = h * 0.8;
      const x = w / 2 - 0.035;
      const z = d / 2 - 0.035;
      boardBed(g, M, P, [[-x, -z], [x, -z], [x, z], [-x, z]], [[-x + 0.015, -z + 0.015, x - 0.015, z - 0.015]], hb);
      bedPlants(g, M, P, [[-x + 0.04, -z + 0.04, x - 0.04, z - 0.04]], hb - 0.07, h, 1);
      return true;
    }

    // Hochbeet L-Form: zwei Schenkel im rechten Winkel (hinten über die ganze Breite, links nach vorn), gleiche Machart
    case "garden_raised_bed_l": {
      const hb = h * 0.8;
      const b = Math.min(w, d) * 0.45;
      const x = w / 2 - 0.035;
      const z = d / 2 - 0.035;
      const xi = -x + b;
      const zi = -z + b;
      const e = 0.015;
      boardBed(g, M, P, [[-x, -z], [x, -z], [x, zi], [xi, zi], [xi, z], [-x, z]], [[-x + e, -z + e, x - e, zi - e], [-x + e, zi - e, xi - e, z - e]], hb);
      bedPlants(g, M, P, [[-x + 0.04, -z + 0.04, x - 0.04, zi - 0.04], [-x + 0.04, zi, xi - 0.04, z - 0.04]], hb - 0.07, h, 2);
      return true;
    }

    // Hochbeet (Metall): rostbraune Wellblechwände mit gerolltem Rand, Eckwinkeln und Füßen, Erde, Pflanzen
    case "garden_raised_bed_metal": {
      const hb = h * 0.8;
      const y0 = 0.04;
      const x = w / 2 - 0.025;
      const z = d / 2 - 0.025;
      const walls = [];
      for (const s of [-1, 1]) walls.push(boxG(2 * x, hb - y0, 0.01, 0, y0, s * z), boxG(0.01, hb - y0, 2 * z, s * x, y0, 0));
      const n = Math.max(3, Math.round((hb - y0 - 0.08) / 0.07));
      for (let i = 0; i < n; i++) {
        const y = y0 + 0.05 + (i * (hb - y0 - 0.12)) / (n - 1);
        for (const s of [-1, 1]) walls.push(rodG([-x, y, s * (z + 0.003)], [x, y, s * (z + 0.003)], 0.011, 6), rodG([s * (x + 0.003), y, -z], [s * (x + 0.003), y, z], 0.011, 6));
      }
      merged(g, P.rust, walls);
      merged(g, tint(M, 0x6b3820, { roughness: 0.85 }), [
        ...[-1, 1].flatMap((s) => [rodG([-x - 0.02, hb, s * z], [x + 0.02, hb, s * z], 0.02, 8), rodG([s * x, hb, -z - 0.02], [s * x, hb, z + 0.02], 0.02, 8)]),
        ...CORNERS.map(([sx, sz]) => boxG(0.05, hb - y0, 0.05, sx * x, y0, sz * z)),
      ]);
      merged(g, P.steelD, CORNERS.map(([sx, sz]) => boxG(0.07, y0, 0.07, sx * (x - 0.01), 0, sz * (z - 0.01))));
      merged(g, P.soil, [boxG(2 * x - 0.02, 0.05, 2 * z - 0.02, 0, hb - 0.075, 0)]);
      bedPlants(g, M, P, [[-x + 0.05, -z + 0.05, x - 0.05, z - 0.05]], hb - 0.03, h, 3);
      return true;
    }

    // Frühbeet: Holzkasten, hinten hoch, vorn (+z) niedrig, Mittelsteg; zwei Glasdeckel mit Griff, der rechte mit Stütze
    // aufgestellt; Setzlinge in Reihen auf der Erde
    case "garden_cold_frame": {
      const t = 0.025;
      const hb = h * 0.72;
      const hf = h * 0.4;
      merged(g, M.wood, [
        boxG(w, hf, t, 0, 0, d / 2 - t / 2),
        boxG(w, hb, t, 0, 0, -d / 2 + t / 2),
        ...[-1, 1].map((s) => prismX([[-d / 2, 0], [d / 2, 0], [d / 2, hf], [-d / 2, hb]], t, s * (w / 2 - t / 2))),
        prismX([[-d / 2, hb - 0.04], [d / 2, hf - 0.04], [d / 2, hf], [-d / 2, hb]], 0.04, 0),
      ]);
      merged(g, P.soil, [boxG(w - 2 * t, Math.min(0.1, hf * 0.5), d - 2 * t, 0, 0, 0)]);
      const sy = Math.min(0.1, hf * 0.5);
      plants(g, P, grid(0, 0.01, w - 0.2, d - 0.24, Math.max(2, Math.round(w / 0.2)), Math.max(2, Math.round(d / 0.22))).map(([x, z], i) => [x, sy, z, 0.035 + (i % 3) * 0.006]), { squash: 0.95, seed: 5 });
      const L = Math.hypot(d, hb - hf) + 0.01;
      const lw = w / 2 - 0.012;
      const open = -0.07;
      for (const [s, a] of [[-1, Math.atan2(hb - hf, d)], [1, open]]) {
        const lid = new THREE.Group();
        lid.position.set((s * w) / 4, hb, -d / 2);
        lid.rotation.x = a;
        merged(lid, P.woodL, [boxG(lw, 0.03, 0.045, 0, 0, 0.0225), boxG(lw, 0.03, 0.045, 0, 0, L - 0.0225), boxG(0.045, 0.03, L, -lw / 2 + 0.0225, 0, L / 2), boxG(0.045, 0.03, L, lw / 2 - 0.0225, 0, L / 2), boxG(0.03, 0.03, L - 0.04, 0, 0, L / 2)]);
        merged(lid, M.glass, [boxG(lw - 0.08, 0.005, L - 0.08, 0, 0.012, L / 2)]);
        merged(lid, P.steel, [boxG(0.1, 0.018, 0.022, 0, 0.03, L - 0.03)]);
        g.add(lid);
      }
      const zl = L - 0.09;
      const xs = w / 4 + Math.min(0.15, w * 0.12);
      merged(g, P.woodD, [rodG([xs, hf - 0.01, d / 2 - t / 2], [xs, hb - Math.sin(open) * zl, -d / 2 + Math.cos(open) * zl], 0.012, 5)]);
      return true;
    }

    // Kräuterspirale: Trockenmauer aus Natursteinen, die spiralförmig zur Mitte ansteigt, Erdterrassen dazwischen, Kräuter
    // mit Blüten auf jeder Stufe; am unteren Ende vorn rechts ein kleiner Teich mit Steinrand und Seerose
    case "garden_herb_spiral": {
      const s = Math.min(w, d);
      const cx = -s * 0.07;
      const cz = -s * 0.07;
      const R0 = s * 0.4;
      const R1 = s * 0.085;
      const T = 1.3 * Math.PI * 2;
      const a0 = Math.PI / 4; // Anfang vorn rechts
      const H0 = h * 0.12;
      const H1 = h * 0.72;
      const rad = (t) => R0 + ((R1 - R0) * t) / T;
      const hgt = (t) => H0 + ((H1 - H0) * t) / T;
      const pos = (t, rr = rad(t)) => [cx + rr * Math.cos(a0 + t), cz + rr * Math.sin(a0 + t)];
      const r = rng(7);
      const st = [[], []];
      // Mauer: Steinreihen im Verband, Länge etwa 13 cm
      for (let t = 0; t <= T; ) {
        const dt = 0.13 / rad(t);
        const top = hgt(t);
        const n = Math.max(1, Math.round(top / 0.085));
        for (let i = 0; i < n; i++) {
          const tt = Math.min(T, t + (i % 2) * dt * 0.5);
          const [px, pz] = pos(tt);
          const hh = hgt(tt) / n;
          st[r() < 0.5 ? 0 : 1].push(boxG(0.12 + r() * 0.03, hh * 0.92, 0.1 + r() * 0.03, px, i * hh, pz, [(r() - 0.5) * 0.08, -(a0 + tt) - Math.PI / 2 + (r() - 0.5) * 0.15, (r() - 0.5) * 0.08]));
        }
        t += dt;
      }
      // Teich am unteren Ende
      const pr = s * 0.14;
      const [qx, qz] = [cx + (R0 + pr * 0.95) * Math.cos(a0), cz + (R0 + pr * 0.95) * Math.sin(a0)];
      const ns = Math.max(8, Math.round((2 * Math.PI * pr) / 0.09));
      for (let i = 0; i < ns; i++) {
        const a = (i / ns) * Math.PI * 2;
        st[i % 2].push(boxG(0.08 + r() * 0.03, 0.05 + r() * 0.02, 0.07, qx + Math.cos(a) * (pr + 0.02), 0, qz + Math.sin(a) * (pr + 0.02), [0, -a + Math.PI / 2 + (r() - 0.5) * 0.3, 0]));
      }
      merged(g, M.stone, st[0]);
      merged(g, M.stoneLight, st[1]);
      merged(g, tint(M, 0x2f3a33, { roughness: 1 }), [cylG(pr, 0.01, qx, 0, qz, 18)]);
      merged(g, P.water, [cylG(pr, 0.012, qx, 0.022, qz, 18)]);
      merged(g, P.leaf, [cylG(0.045, 0.006, qx - pr * 0.3, 0.035, qz + pr * 0.2, 9), cylG(0.035, 0.006, qx + pr * 0.25, 0.035, qz - pr * 0.3, 9)]);
      merged(g, P.cream, [ballG(0.022, qx - pr * 0.3, 0.05, qz + pr * 0.2, [1, 0.7, 1], 6)]);
      // Erde: Fächer je Winkelschritt auf Höhe der Mauer, innen ein Hügel
      const N = Math.ceil(T / 0.1);
      const v = [];
      for (let i = 0; i < N; i++) {
        const t1 = (i / N) * T;
        const t2 = ((i + 1) / N) * T;
        const [x1, z1] = pos(t1);
        const [x2, z2] = pos(t2);
        const y1 = hgt(t1) - 0.015;
        v.push(cx, y1, cz, x2, hgt(t2) - 0.015, z2, x1, y1, z1);
      }
      const fan = new THREE.BufferGeometry();
      fan.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      fan.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
      fan.computeVertexNormals();
      merged(g, P.soil, [fan, cylG(R1, H1 - 0.015, cx, 0, cz, 12), ballG(R1, cx, H1 - 0.02, cz, [1, 0.45, 1], 10)]);
      // Kräuter: auf jeder Stufe zwischen innerer und äußerer Mauer
      const low = [];
      const tall = [];
      const bush = [];
      let k = 0;
      for (let t = 0.25; t < T - 0.2; t += 0.62, k++) {
        const ri = t + Math.PI * 2 < T ? rad(t + Math.PI * 2) : 0;
        const [px, pz] = pos(t, (ri + rad(t)) / 2);
        const sp = [px, hgt(t) - 0.02, pz, Math.min(0.08, (rad(t) - ri) * 0.42) * (0.85 + r() * 0.3)];
        [low, tall, bush][k % 3].push(sp);
      }
      tall.push([cx, H1 + R1 * 0.3, cz, Math.min(0.07, R1 * 0.8)]);
      plants(g, P, low, { squash: 0.8, blossom: P.flower, seed: 2 });
      plants(g, { leaf: tint(M, 0x6f8f5a, { roughness: 0.9 }), leafD: tint(M, 0x58764a, { roughness: 0.9 }) }, tall, { squash: 1.7, blossom: M.blossom?.[2] ?? P.flower, seed: 3 });
      plants(g, { leaf: tint(M, 0x8fbf4a, { roughness: 0.8 }), leafD: P.leafD }, bush, { squash: 1.1, blossom: P.cream, seed: 4 });
      return true;
    }

    // Pflanztisch: Lattenplatte auf Gestell, Spritzschutz hinten und seitlich mit Handwerkzeug, Ablageboden; oben Erdschale
    // mit Schaufel und Terrakotta-Töpfe mit Setzlingen, unten Topfstapel, Erdsack und Gießkanne
    case "garden_potting_table": {
      const yt = h * 0.82;
      const lx = w / 2 - 0.04;
      const lz = d / 2 - 0.04;
      const ys = Math.min(0.22, h * 0.22);
      const terra = tint(M, 0xbf6a3f, { roughness: 0.9 });
      const nsl = Math.max(3, Math.round(d / 0.12));
      const fr = [
        ...[-1, 1].flatMap((sx) => [boxG(0.05, yt - 0.03, 0.05, sx * lx, 0, lz), boxG(0.05, h, 0.05, sx * lx, 0, -lz)]),
        ...[-1, 1].flatMap((s) => [boxG(2 * lx, 0.07, 0.02, 0, yt - 0.1, s * (lz + 0.035)), boxG(0.02, 0.07, 2 * lz, s * (lx + 0.035), yt - 0.1, 0), boxG(2 * lx, 0.05, 0.02, 0, ys - 0.07, s * (lz + 0.035))]),
        ...Array.from({ length: nsl }, (_, i) => boxG(w, 0.028, d / nsl - 0.012, 0, yt - 0.028, -d / 2 + ((i + 0.5) * d) / nsl)),
        ...Array.from({ length: nsl }, (_, i) => boxG(2 * lx + 0.05, 0.02, d / nsl - 0.02, 0, ys - 0.02, -d / 2 + ((i + 0.5) * d) / nsl)),
        boxG(w, h - yt, 0.02, 0, yt, -lz + 0.035),
        ...[-1, 1].map((s) => boxG(0.02, (h - yt) * 0.55, d * 0.55, s * (w / 2 - 0.01), yt, -d / 2 + d * 0.275)),
      ];
      merged(g, M.wood, fr);
      // Erdschale (Blechwanne) mit Erde und Handschaufel
      const ex = -w / 2 + Math.min(0.28, w * 0.24);
      const ew = Math.min(0.46, w * 0.38);
      const ed = d * 0.6;
      const ez = 0.02;
      merged(g, P.steel, [boxG(ew, 0.008, ed, ex, yt, ez), boxG(ew, 0.07, 0.008, ex, yt, ez - ed / 2), boxG(ew, 0.07, 0.008, ex, yt, ez + ed / 2), boxG(0.008, 0.07, ed, ex - ew / 2, yt, ez), boxG(0.008, 0.07, ed, ex + ew / 2, yt, ez), boxG(0.05, 0.004, 0.09, ex + ew * 0.15, yt + 0.09, ez + 0.02, [0.6, 0, 0])]);
      merged(g, P.soil, [boxG(ew - 0.016, 0.05, ed - 0.016, ex, yt, ez), ballG(ew * 0.28, ex - ew * 0.1, yt + 0.05, ez - 0.03, [1.2, 0.35, 1])]);
      // Töpfe oben mit Setzlingen, unten Topfstapel
      const pot = (x, y, z, r) => [new THREE.CylinderGeometry(r * 1.3, r, r * 2.2, 10).translate(x, y + r * 1.1, z), new THREE.CylinderGeometry(r * 1.42, r * 1.42, r * 0.4, 10).translate(x, y + r * 2.0, z)];
      const pots = [];
      const seedl = [];
      for (let i = 0; i < 3; i++) {
        const x = w / 2 - 0.1 - i * 0.12;
        const z = i === 1 ? -0.08 : 0.08;
        pots.push(...pot(x, yt, z, 0.04));
        seedl.push([x, yt + 0.085, z, 0.045]);
      }
      for (const [x, z] of [[-w / 2 + 0.14, -0.05], [-w / 2 + 0.3, 0.06]]) for (let i = 0; i < 4; i++) pots.push(...pot(x, ys + i * 0.03, z, 0.045));
      merged(g, terra, pots);
      plants(g, P, seedl, { squash: 1.2, blossom: P.flower, seed: 6 });
      merged(g, tint(M, 0x6e6a3a, { roughness: 0.95 }), [ballG(0.12, 0.02, ys + 0.08, -0.02, [1.3, 0.7, 1], 8)]);
      // Gießkanne auf dem Ablageboden
      const kx = w / 2 - 0.3;
      const kz = 0.04;
      merged(g, P.plasticG, [
        cylG(0.075, 0.17, kx, ys, kz, 14),
        cylG(0.078, 0.012, kx, ys + 0.17, kz, 14),
        rodG([kx + 0.05, ys + 0.04, kz], [kx + 0.2, ys + 0.2, kz], 0.011, 6),
        cylG(0.012, 0.035, kx + 0.205, ys + 0.19, kz, 8, 0.028, [0, 0, -0.7]),
        at(new THREE.TorusGeometry(0.065, 0.011, 5, 10, Math.PI), [kx - 0.01, ys + 0.165, kz]),
      ]);
      // Handwerkzeug am Spritzschutz
      const hz = -lz + 0.055;
      merged(g, P.woodD, [boxG(0.022, 0.08, 0.022, 0.05, h - 0.1, hz), boxG(0.022, 0.08, 0.022, 0.2, h - 0.1, hz)]);
      merged(g, P.steel, [boxG(0.05, 0.08, 0.006, 0.05, h - 0.19, hz), ...[-1, 0, 1].map((i) => boxG(0.008, 0.07, 0.006, 0.2 + i * 0.016, h - 0.18, hz)), boxG(0.05, 0.012, 0.006, 0.2, h - 0.115, hz)]);
      return true;
    }

    // Rankgitter: Holzrahmen mit Pfostenkappen, Diagonalgitter in zwei Lagen, zwei Standfüße; Kletterpflanze mit Blüten
    // rankt links bis oben, rechts bis zur Mitte
    case "garden_trellis": {
      const px = w / 2 - 0.03;
      const pt = Math.min(0.05, d * 0.5);
      merged(g, M.wood, [boxG(pt, h - 0.04, pt, -px, 0, 0), boxG(pt, h - 0.04, pt, px, 0, 0), boxG(2 * px, 0.05, pt * 0.8, 0, h - 0.1, 0), boxG(2 * px, 0.05, pt * 0.8, 0, 0.12, 0)]);
      const lat = [];
      const x0 = -px + pt / 2;
      const x1 = px - pt / 2;
      const y0 = 0.17;
      const y1 = h - 0.1;
      const step = 0.17 * Math.SQRT2;
      for (const sgn of [1, -1]) {
        const cMin = sgn > 0 ? y0 - x1 : y0 + x0;
        const cMax = sgn > 0 ? y1 - x0 : y1 + x1;
        for (let c = cMin + step / 2; c < cMax; c += step) {
          // Gerade y = sgn·x + c im Rechteck
          const p = [];
          for (const x of [x0, x1]) {
            const y = sgn * x + c;
            if (y >= y0 - 1e-9 && y <= y1 + 1e-9) p.push([x, y]);
          }
          for (const y of [y0, y1]) {
            const x = (y - c) / sgn;
            if (x > x0 && x < x1) p.push([x, y]);
          }
          if (p.length < 2) continue;
          const [[ax, ay], [bx, by]] = p;
          const len = Math.hypot(bx - ax, by - ay);
          if (len < 0.03) continue;
          lat.push(boxG(len, 0.028, 0.012, (ax + bx) / 2, (ay + by) / 2 - 0.014, sgn * 0.008, [0, 0, Math.atan2(by - ay, bx - ax)]));
        }
      }
      merged(g, P.woodL, lat);
      merged(g, P.woodD, [
        ...[-px, px].map((x) => at(new THREE.ConeGeometry(0.045, 0.05, 4), [x, h - 0.025, 0], [0, Math.PI / 4, 0])),
        ...[-px, px].map((x) => boxG(0.1, 0.05, Math.min(0.16, d + 0.06), x, 0, 0)),
      ]);
      const r = rng(13);
      const S = [];
      const L = [[], []];
      const B = [[], []];
      const fz = 0.5;
      const zf = 0.035;
      vine(S, L, B, [[-px + 0.1, 0.02, zf], [-px + 0.25, 0.5, zf], [-px + 0.15, 1.0 * (h / 2), zf], [-0.05, 1.45 * (h / 2), zf], [0.1, h - 0.15, zf]], r, 0.11, 0.07, fz);
      vine(S, L, B, [[px - 0.15, 0.02, zf], [px - 0.3, 0.45 * (h / 2), zf], [px - 0.2, 0.9 * (h / 2), zf]], r, 0.11, 0.065, fz);
      merged(g, P.leafD, S);
      merged(g, P.leaf, L[0]);
      merged(g, P.leafD, L[1]);
      merged(g, M.blossom?.[2] ?? P.flower, B[0]);
      merged(g, P.cream, B[1]);
      return true;
    }

    // Rosenbogen: Metallbogen aus zwei Leitern (je zwei Rohre vorn und hinten, Sprossen), doppelter Halbkreis mit Speichen,
    // Querstreben, Erdspieße; Kletterrose rankt links hoch über den Bogen, rechts ein Stück, rote und rosa Blüten
    case "garden_rose_arch": {
      const R = w / 2 - 0.05;
      const Ri = R - Math.min(0.1, w * 0.07);
      const zd = d / 2 - 0.05;
      const hp = h - R - 0.08;
      const r0 = 0.013;
      const fr = [];
      for (const z of [-zd, zd]) {
        for (const x of [-R, -Ri, Ri, R]) fr.push(rodG([x, 0, z], [x, hp, z], r0, 5));
        for (const rr of [R, Ri]) fr.push(at(new THREE.TorusGeometry(rr, r0, 5, 18, Math.PI), [0, hp, z]));
        for (const s of [-1, 1]) for (let y = 0.25; y < hp - 0.05; y += 0.3) fr.push(rodG([s * R, y, z], [s * Ri, y, z], r0 * 0.8, 4));
        for (let i = 1; i < 8; i++) {
          const a = (i / 8) * Math.PI;
          fr.push(rodG([Ri * Math.cos(a), hp + Ri * Math.sin(a), z], [R * Math.cos(a), hp + R * Math.sin(a), z], r0 * 0.8, 4));
        }
      }
      for (const s of [-1, 1]) for (let y = 0.4; y < hp; y += 0.42) fr.push(rodG([s * R, y, -zd], [s * R, y, zd], r0 * 0.8, 4));
      for (let i = 1; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        fr.push(rodG([R * Math.cos(a), hp + R * Math.sin(a), -zd], [R * Math.cos(a), hp + R * Math.sin(a), zd], r0 * 0.8, 4));
      }
      merged(g, M.dark, fr);
      merged(g, P.steelD, [-1, 1].flatMap((s) => [-zd, zd].map((z) => boxG(R - Ri + 0.06, 0.008, 0.06, (s * (R + Ri)) / 2, 0, z))));
      // Kletterrose
      const r = rng(17);
      const S = [];
      const L = [[], []];
      const B = [[], []];
      const arc = (a, z) => [R * Math.cos(a) * 0.96, hp + R * Math.sin(a) * 0.96, z];
      for (const z of [-zd, zd]) {
        vine(S, L, B, [[-R + 0.02, 0.02, z], [-Ri - 0.02, hp * 0.4, z], [-R, hp * 0.8, z], arc(Math.PI, z), arc(Math.PI * 0.75, z), arc(Math.PI * 0.5, z), arc(Math.PI * 0.32, z)], r, 0.12, 0.07, 0.9, 0.4);
        vine(S, L, B, [[R - 0.02, 0.02, z], [Ri + 0.02, hp * 0.3, z], [R, hp * 0.55, z]], r, 0.12, 0.065, 0.9, 0.35);
      }
      merged(g, P.leafD, [...S, ...L[1]]);
      merged(g, P.leaf, L[0]);
      merged(g, tint(M, 0xc4203a, { roughness: 0.6 }), B[0]);
      merged(g, P.flower, B[1]);
      return true;
    }

    // Regentonne: bauchiges Holzfass mit Daubenfugen und Eisenreifen auf zwei Betonsteinen, Deckel mit Griff, Messinghahn
    // vorn unten, oben der Einlauf vom Fallrohr (Bogen nach hinten zur Hauswand)
    case "garden_rain_barrel": {
      const R = Math.min(w, d) / 2 - 0.02;
      const y0 = h * 0.19;
      const yt = h * 0.88;
      const bh = yt - y0;
      const prof = [[0.86, 0], [0.94, 0.15], [1, 0.5], [0.94, 0.85], [0.86, 1]];
      const rAt = (f) => {
        for (let i = 0; i < prof.length - 1; i++) if (f <= prof[i + 1][1]) return R * (prof[i][0] + ((prof[i + 1][0] - prof[i][0]) * (f - prof[i][1])) / (prof[i + 1][1] - prof[i][1]));
        return R * prof[prof.length - 1][0];
      };
      const pts = [new THREE.Vector2(0.001, y0), ...prof.map(([rr, f]) => new THREE.Vector2(R * rr, y0 + bh * f)), new THREE.Vector2(0.001, y0 + bh)];
      merged(g, M.wood, [new THREE.LatheGeometry(pts, 20)]);
      const staves = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.1;
        const pp = [0, 0.15, 0.5, 0.85, 1].map((f) => [Math.cos(a) * (rAt(f) + 0.001), y0 + bh * f, Math.sin(a) * (rAt(f) + 0.001)]);
        for (let k = 0; k < pp.length - 1; k++) staves.push(rodG(pp[k], pp[k + 1], 0.003, 3));
      }
      merged(g, P.woodD, staves);
      merged(g, P.steelD, [0.1, 0.32, 0.68, 0.9].map((f) => at(new THREE.TorusGeometry(rAt(f) + 0.004, 0.009, 4, 22), [0, y0 + bh * f, 0], [Math.PI / 2, 0, 0])));
      merged(g, P.woodD, [cylG(R * 0.9, 0.025, 0, yt, 0, 20), boxG(0.14, 0.025, 0.03, -R * 0.2, yt + 0.025, R * 0.35)]);
      merged(g, M.stone, [boxG(R * 1.7, y0, R * 0.62, 0, 0, -R * 0.42), boxG(R * 1.7, y0, R * 0.62, 0, 0, R * 0.42)]);
      // Hahn
      const ty = y0 + bh * 0.1;
      const tz = rAt(0.1);
      const brass = tint(M, 0xb58b3a, { metalness: 0.6, roughness: 0.35 });
      merged(g, brass, [cylG(0.016, 0.07, 0, ty, tz + 0.03, 8, 0.016, [Math.PI / 2, 0, 0]), cylG(0.012, 0.04, 0, ty - 0.045, tz + 0.055, 8), boxG(0.07, 0.012, 0.012, 0, ty + 0.018, tz + 0.05)]);
      // Fallrohr-Einlauf
      const grey = tint(M, 0x8e9399, { metalness: 0.45, roughness: 0.45 });
      const fx = -R * 0.3;
      const fz = -R * 0.25;
      const fy = h - 0.05;
      merged(g, grey, [cylG(0.05, 0.03, fx, yt + 0.02, fz, 14), cylG(0.038, fy - yt - 0.02, fx, yt + 0.02, fz, 12), ballG(0.038, fx, fy, fz, [1, 1, 1], 10), rodG([fx, fy, fz], [fx, fy, -d / 2 + 0.02], 0.038, 12)]);
      return true;
    }

    // Wurmkiste: drei gestapelte Kunststoffetagen mit Griffmulden und Rand auf Füßen, Deckel mit Lüftungslöchern,
    // Zapfhahn vorn an der untersten Etage
    case "garden_worm_box": {
      const fy = 0.04;
      const lid = 0.05;
      const n = 3;
      const th = (h - fy - lid) / n;
      const tw = w - 0.04;
      const td = d - 0.04;
      const body = [];
      const rims = [];
      const dark = [];
      for (let i = 0; i < n; i++) {
        const y = fy + i * th;
        body.push(boxG(tw, th - 0.012, td, 0, y, 0));
        rims.push(boxG(w - 0.01, 0.014, d - 0.01, 0, y + th - 0.014, 0));
        dark.push(boxG(tw * 0.32, 0.026, 0.006, 0, y + th * 0.55, td / 2 + 0.002), boxG(0.006, 0.026, td * 0.4, -tw / 2 - 0.002, y + th * 0.55, 0), boxG(0.006, 0.026, td * 0.4, tw / 2 + 0.002, y + th * 0.55, 0));
      }
      for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) dark.push(cylG(0.009, 0.004, -w * 0.3 + (i * w * 0.6) / 3, h - 0.002, -d * 0.25 + (k * d * 0.5) / 2, 8));
      merged(g, M.dark, [...body, ...CORNERS.map(([sx, sz]) => cylG(0.022, fy, sx * (tw / 2 - 0.04), 0, sz * (td / 2 - 0.04), 8))]);
      merged(g, P.plasticG, [...rims, boxG(w, lid * 0.55, d, 0, h - lid, 0), boxG(w - 0.05, lid * 0.45, d - 0.05, 0, h - lid * 0.45, 0)]);
      merged(g, P.black, dark);
      const ty = fy + th * 0.3;
      merged(g, P.plastic, [cylG(0.014, 0.05, w * 0.22, ty, td / 2 + 0.025, 8, 0.014, [Math.PI / 2, 0, 0]), cylG(0.01, 0.03, w * 0.22, ty - 0.035, td / 2 + 0.042, 8)]);
      merged(g, P.red, [boxG(0.012, 0.012, 0.05, w * 0.22, ty + 0.014, td / 2 + 0.03)]);
      return true;
    }

    // Insektenhotel: Holzkasten mit Giebeldach auf zwei Pfosten mit Fußbrettern; Fächer mit gebohrtem Holzklotz,
    // Tannenzapfen, Bambusröhrchen, Stroh, Baumscheiben mit Bohrlöchern, Stroh im Giebel
    case "garden_insect_hotel": {
      const bw = w * 0.84;
      const bd = d * 0.8;
      const fx = bw / 2;
      const zf = bd / 2;
      const rise = fx * 0.7;
      const ye = h - 0.04 - rise;
      const yb = ye - h * 0.42;
      const t = 0.02;
      const rowH = (ye - yb - 2 * t - 2 * 0.012) / 3;
      const row = (i) => yb + t + i * (rowH + 0.012);
      const r = rng(23);
      merged(g, P.woodD, [-1, 1].flatMap((s) => [boxG(0.05, yb + 0.02, 0.05, s * fx * 0.6, 0, -bd * 0.15), boxG(0.06, 0.04, d * 0.9, s * fx * 0.6, 0, 0)]));
      merged(g, M.wood, [
        boxG(t, ye - yb, bd, -fx + t / 2, yb, 0),
        boxG(t, ye - yb, bd, fx - t / 2, yb, 0),
        boxG(bw, t, bd, 0, yb, 0),
        boxG(bw, t, bd, 0, ye - t, 0),
        boxG(bw - 2 * t, 0.012, bd, 0, row(1) - 0.012, 0),
        boxG(bw - 2 * t, 0.012, bd, 0, row(2) - 0.012, 0),
        boxG(0.012, 2 * rowH + 0.012, bd, 0, row(0), 0),
        prismZ([[-fx, yb], [fx, yb], [fx, ye], [0, ye + rise], [-fx, ye]], 0.012, -bd / 2 + 0.006),
      ]);
      const cw = fx - t - 0.006; // Fachbreite
      const holes = [];
      const hole = (x, y, rr = 0.008) => holes.push(cylG(rr, 0.006, x, y, zf - 0.002, 6, rr, [Math.PI / 2, 0, 0]));
      // unten links: Holzklotz mit Bohrlöchern
      const lx = -fx + t + cw / 2;
      const endGrain = tint(M, 0xd2aa72, { roughness: 0.9 });
      const blocks = [boxG(cw - 0.01, rowH - 0.01, bd - 0.03, lx, row(0), 0.01)];
      for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) hole(lx - cw * 0.3 + (i * cw * 0.3), row(0) + rowH * (0.22 + k * 0.28), 0.007 + (i + k) % 2 * 0.003);
      // oben: Baumscheiben über die ganze Breite
      const nl = Math.max(2, Math.floor((bw - 2 * t) / (rowH * 1.02)));
      const rl = Math.min(rowH * 0.48, (bw - 2 * t) / nl / 2 - 0.004);
      const bark = [];
      for (let i = 0; i < nl; i++) {
        const x = -fx + t + ((i + 0.5) * (bw - 2 * t)) / nl;
        const y = row(2) + rowH / 2;
        blocks.push(cylG(rl - 0.006, bd - 0.03, x, y, 0.01, 12, rl - 0.006, [Math.PI / 2, 0, 0]));
        bark.push(cylG(rl, bd - 0.05, x, y, 0, 12, rl, [Math.PI / 2, 0, 0]));
        for (let k = 0; k < 5; k++) hole(x + Math.cos(k * 1.3) * rl * 0.5 * (k > 0), y + Math.sin(k * 1.3) * rl * 0.5 * (k > 0), 0.006);
      }
      merged(g, endGrain, blocks);
      merged(g, P.woodD, bark);
      // Mitte links: Bambusröhrchen
      const tubes = [];
      const tr = 0.016;
      const nxT = Math.max(2, Math.floor(cw / (2 * tr + 0.003)));
      const nyT = Math.max(2, Math.floor(rowH / (2 * tr + 0.003)));
      for (let i = 0; i < nxT; i++) {
        for (let k = 0; k < nyT; k++) {
          const x = -fx + t + (i + 0.5) * (cw / nxT);
          const y = row(1) + (k + 0.5) * (rowH / nyT);
          tubes.push(cylG(tr, bd - 0.03, x, y, 0.005, 7, tr, [Math.PI / 2, 0, 0]));
          hole(x, y, tr * 0.6);
        }
      }
      merged(g, tint(M, 0xd8c07a, { roughness: 0.7 }), tubes);
      merged(g, P.black, holes);
      // unten rechts: Tannenzapfen
      const cones = [];
      const rx = fx - t - cw / 2;
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 2; k++) {
          const x = rx - cw * 0.33 + i * cw * 0.33;
          const y = row(0) + rowH * (0.3 + k * 0.42);
          cones.push(ballG(0.03, x, y, zf - 0.06, [1, 1, 1.5], 7), at(new THREE.ConeGeometry(0.026, 0.05, 7), [x, y, zf - 0.005], [Math.PI / 2, 0, 0]));
        }
      }
      merged(g, tint(M, 0x7a5230, { roughness: 0.95 }), cones);
      // Mitte rechts und Giebel: Stroh
      const straw = [];
      for (let i = 0; i < 26; i++) {
        const x = rx + (r() - 0.5) * cw * 0.9;
        const y = row(1) + 0.01 + r() * (rowH - 0.02);
        straw.push(rodG([x, y, zf - 0.01], [x + (r() - 0.5) * 0.08, y + (r() - 0.5) * 0.04, zf - 0.12], 0.004, 3));
      }
      for (let i = 0; i < 16; i++) {
        const y = ye + 0.01 + r() * rise * 0.6;
        const span = fx * (1 - (y - ye) / rise) * 0.85;
        const x = (r() - 0.5) * 2 * span;
        straw.push(rodG([x, y, zf - 0.01], [x + (r() - 0.5) * 0.08, y + (r() - 0.5) * 0.03, zf - 0.1], 0.004, 3));
      }
      merged(g, P.sand, straw);
      // Dach
      const sl = Math.hypot(fx, rise) + 0.05;
      const al = Math.atan2(rise, fx);
      merged(g, P.woodD, [-1, 1].map((s) => boxG(sl, 0.018, d, s * (fx / 2 + 0.018), ye + rise / 2 + 0.005, 0, [0, 0, -s * al])));
      return true;
    }

    // Vogelhaus: Pfahl mit Fußkreuz und Kopfbändern, Nistkasten mit Giebeldach, rundem Einflugloch und Sitzstange
    case "garden_bird_house": {
      const s = Math.min(w, d);
      const bw = s * 0.52;
      const bd = s * 0.5;
      const rise = bw * 0.5;
      const top = h - 0.03;
      const ye = top - rise;
      const yb = ye - bw * 1.15;
      merged(g, M.wood, [boxG(0.06, yb - 0.02, 0.06, 0, 0, 0), prismZ([[-bw / 2, yb], [bw / 2, yb], [bw / 2, ye], [0, ye + rise], [-bw / 2, ye]], bd, 0)]);
      merged(g, P.woodD, [
        boxG(bw + 0.05, 0.02, bd + 0.05, 0, yb - 0.02, 0.01),
        boxG(s * 0.9, 0.05, 0.07, 0, 0, 0),
        boxG(0.07, 0.05, s * 0.9, 0, 0, 0),
        rodG([0, yb - 0.18, 0.03], [0, yb - 0.02, bd / 2], 0.012, 4),
        rodG([0, yb - 0.18, -0.03], [0, yb - 0.02, -bd / 2], 0.012, 4),
        rodG([0, (ye - yb) * 0.3 + yb, bd / 2], [0, (ye - yb) * 0.3 + yb, bd / 2 + 0.06], 0.006, 6),
      ]);
      merged(g, P.black, [cylG(0.027, 0.01, 0, yb + (ye - yb) * 0.62, bd / 2 - 0.003, 16, 0.027, [Math.PI / 2, 0, 0])]);
      const sl = Math.hypot(bw / 2, rise) + 0.05;
      const al = Math.atan2(rise, bw / 2);
      merged(g, tint(M, 0x8a3b2a, { roughness: 0.85 }), [-1, 1].map((sg) => boxG(sl, 0.018, bd + 0.09, sg * (bw / 4 + 0.022), ye + rise / 2 - 0.004, 0.025, [0, 0, -sg * al])));
      return true;
    }

    // Vogeltränke: Steinsockel (Fuß, schlanke Säule, Kapitell) mit flacher Schale und Wasser, ein kleiner Vogel am Rand
    case "garden_bird_bath": {
      const R = Math.min(w, d) / 2;
      const prof = [[0.8, 0], [0.8, 0.06], [0.55, 0.09], [0.36, 0.14], [0.29, 0.45], [0.34, 0.74], [0.52, 0.8], [1, 0.89], [1, 0.94], [0.9, 0.94], [0.8, 0.91], [0.001, 0.91]];
      merged(g, M.stoneLight, [new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), ...prof.map(([rr, f]) => new THREE.Vector2(rr * R, f * h))], 24)]);
      merged(g, P.water, [cylG(R * 0.88, 0.004, 0, h * 0.925, 0, 24)]);
      // Vogel am rechten Rand, trinkt zur Mitte hin
      const bx = R * 0.9;
      const by = h * 0.94;
      merged(g, tint(M, 0x7a6450, { roughness: 0.8 }), [ballG(0.03, bx, by + 0.03, 0.02, [1.35, 0.9, 0.9], 8), ballG(0.019, bx - 0.04, by + 0.045, 0.02, [1, 1, 1], 8), boxG(0.05, 0.008, 0.025, bx + 0.045, by + 0.035, 0.02, [0, 0, 0.35])]);
      merged(g, P.yellow, [at(new THREE.ConeGeometry(0.007, 0.022, 5), [bx - 0.065, by + 0.04, 0.02], [0, 0, Math.PI / 2 + 0.3])]);
      return true;
    }

    default:
      return buildBeds2(type, w, d, h, M, g, bulbs, item);
  }
}
