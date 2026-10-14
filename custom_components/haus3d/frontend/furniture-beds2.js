// 3D-Modelle des Katalogs „Beet & Gewächshaus“, Teil 2: Gewächshäuser und Gartenhäuser (von furniture-beds.js aufgerufen)
// und gemeinsame Bausteine (Prismen aus Querschnitten, Bretter entlang Strecken, Tomatenpflanzen). Einheitsrahmen wie in
// furniture.js – Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.

import { THREE, at, ballG, boxG, merged, palette, plants, rng, rodG, tint } from "./garden-parts.js";

/** Prisma aus dem Querschnitt pts [[z, y], …] (Seitenansicht), entlang x von x - len/2 bis x + len/2. */
export function prismX(pts, len, x = 0) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: len, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x + len / 2, 0, 0);
  return geo;
}

/** Prisma aus dem Querschnitt pts [[x, y], …] (Vorderansicht), entlang z von z - len/2 bis z + len/2. */
export function prismZ(pts, len, z = 0) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: len, bevelEnabled: false });
  geo.translate(0, 0, z - len / 2);
  return geo;
}

/** Brett/Balken entlang der Strecke a → b in der Draufsicht ([x, z]): Unterkante y, Höhe hh, Dicke t, insgesamt um ext länger. */
export function seg(a, b, y, hh, t, ext = 0) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  return boxG(Math.hypot(dx, dz) + ext, hh, t, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, [0, Math.atan2(-dz, dx), 0]);
}

/** Tomatenpflanze am Stab (Fuß x, y0, z; Höhe ht): Blattbüschel übereinander in L[0]/L[1], Früchte in F, Stab in S. */
export function tomato(L, F, S, x, z, y0, ht, seed = 1) {
  const r = rng(seed);
  S.push(rodG([x, y0 - 0.04, z - 0.05], [x, y0 + ht, z - 0.05], 0.007, 4));
  const n = Math.max(3, Math.round(ht / 0.22));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rad = Math.min(0.14, ht * 0.12) * (1.05 - 0.45 * t);
    const y = y0 + rad * 0.7 + (ht - rad * 1.5) * t;
    L[i % 2].push(ballG(rad, x + (r() - 0.5) * 0.07, y, z + (r() - 0.5) * 0.07, [1, 0.8, 1], 6));
    if (i > 0 && i < n - 1) {
      for (let k = 0; k < 2; k++) {
        const a = r() * Math.PI * 2;
        F.push(ballG(0.027, x + Math.cos(a) * rad * 0.85, y - rad * 0.3 - k * 0.035, z + Math.sin(a) * rad * 0.85, [1, 0.9, 1], 6));
      }
    }
  }
}

/** Tomaten aus tomato() in g einhängen: Blätter, Früchte, Stäbe. */
function tomatoMeshes(g, P, L, F, S) {
  merged(g, P.leaf, L[0]);
  merged(g, P.leafD, L[1]);
  merged(g, P.tomato, F);
  merged(g, P.woodL, S);
}

/** Baut Gewächshäuser und Gartenhäuser in g; false, wenn der Typ nicht dazugehört. */
export function buildBeds2(type, w, d, h, M, g, bulbs, item = {}) {
  const P = palette(M);
  switch (type) {
    // Gewächshaus (Glas): Alu-Rahmen mit Sprossen, Glaswände und Satteldach (First entlang z, Giebel vorn), Flügeltür vorn –
    // rechter Flügel halb nach innen offen –, aufgestelltes Dachfenster; innen links Pflanztisch mit Töpfen, rechts Beet
    // mit Tomaten an Stäben, Plattenweg in der Mitte
    case "garden_greenhouse": {
      const xw = w / 2 - 0.03;
      const zd = d / 2 - 0.03;
      const y0 = 0.08; // Sockel
      const he = h * 0.66; // Traufe
      const yr = h - 0.035; // First
      const roofY = (x) => he + (yr - he) * (1 - Math.abs(x) / xw);
      const dw = Math.min(0.45, w * 0.16); // halbe Türbreite
      const hd = Math.min(roofY(dw) - 0.1, 1.95); // Türhöhe
      const ym = y0 + (he - y0) * 0.42; // Riegel
      const b = 0.035;
      const F = [];
      const gl = [];
      merged(g, M.stone, [boxG(w, y0, 0.08, 0, 0, d / 2 - 0.04), boxG(w, y0, 0.08, 0, 0, -d / 2 + 0.04), boxG(0.08, y0, d - 0.16, -w / 2 + 0.04, 0, 0), boxG(0.08, y0, d - 0.16, w / 2 - 0.04, 0, 0)]);
      // Pfosten der Seitenwände, Sparren, Schwelle, Riegel, Traufe
      const nz = Math.max(2, Math.round(d / 0.6));
      const zs = Array.from({ length: nz + 1 }, (_, i) => -zd + (2 * zd * i) / nz);
      for (const s of [-1, 1]) {
        for (const z of zs) {
          F.push(boxG(b, he - y0, b, s * xw, y0, z));
          F.push(rodG([s * xw, he, z], [0, yr, z], 0.02, 4));
        }
        F.push(boxG(b, b, 2 * zd, s * xw, y0, 0), boxG(b, b, 2 * zd, s * xw, ym, 0), boxG(b * 1.4, b * 1.4, 2 * zd + b, s * xw, he - b, 0));
        // Pfette mitten im Dach
        F.push(rodG([(s * xw) / 2, (he + yr) / 2 + 0.01, -zd], [(s * xw) / 2, (he + yr) / 2 + 0.01, zd], 0.016, 4));
      }
      F.push(boxG(b * 1.3, b * 1.3, 2 * zd + 0.06, 0, yr - b, 0));
      // Giebelwände: Pfosten bis unter die Dachlinie, vorn nicht in der Tür
      const nx = Math.max(2, Math.round(w / 0.6));
      for (let i = 1; i < nx; i++) {
        const x = -xw + (2 * xw * i) / nx;
        for (const z of [-zd, zd]) if (z < 0 || Math.abs(x) > dw + 0.05) F.push(boxG(b, roofY(x) - y0, b, x, y0, z));
      }
      for (const z of [-zd, zd]) {
        for (const y of [y0, ym, he - b]) {
          if (z < 0) F.push(boxG(2 * xw, b, b, 0, y, z));
          else for (const s of [-1, 1]) F.push(boxG(xw - dw, b, b, (s * (xw + dw)) / 2, y, z));
        }
      }
      // Türrahmen vorn
      F.push(boxG(b, hd - y0, b, -dw, y0, zd), boxG(b, hd - y0, b, dw, y0, zd), boxG(2 * dw + b, b, b, 0, hd, zd));
      // Glas: Seiten, Rückgiebel, Vordergiebel mit Türöffnung, Dachflächen
      for (const s of [-1, 1]) gl.push(boxG(0.006, he - y0, 2 * zd, s * xw, y0, 0));
      gl.push(prismZ([[-xw, y0], [xw, y0], [xw, he], [0, yr], [-xw, he]], 0.006, -zd));
      gl.push(prismZ([[-xw, y0], [-dw, y0], [-dw, hd], [dw, hd], [dw, y0], [xw, y0], [xw, he], [0, yr], [-xw, he]], 0.006, zd));
      const sl = Math.hypot(xw, yr - he);
      const al = Math.atan2(yr - he, xw);
      for (const s of [-1, 1]) gl.push(boxG(sl, 0.006, 2 * zd, (s * xw) / 2, (he + yr) / 2 - 0.003, 0, [0, 0, -s * al]));
      // linker Türflügel zu (Rahmen, Glas, Griff)
      const lw = dw - 0.01;
      const leaf = (x0) => [boxG(0.03, hd - y0 - 0.02, 0.025, x0 + 0.015, y0 + 0.01, 0), boxG(0.03, hd - y0 - 0.02, 0.025, x0 + lw - 0.015, y0 + 0.01, 0), boxG(lw, 0.03, 0.025, x0 + lw / 2, y0 + 0.01, 0), boxG(lw, 0.03, 0.025, x0 + lw / 2, hd - 0.04, 0), boxG(lw, 0.025, 0.025, x0 + lw / 2, ym, 0)];
      F.push(...leaf(-dw + 0.005).map((geo) => geo.translate(0, 0, zd + 0.015)));
      gl.push(boxG(lw - 0.04, hd - y0 - 0.08, 0.005, -dw / 2, y0 + 0.04, zd + 0.015));
      merged(g, P.black, [boxG(0.02, 0.1, 0.03, -0.05, y0 + 0.95, zd + 0.035)]);
      // rechter Flügel halb offen (Drehpunkt am rechten Türpfosten, schwenkt nach innen)
      const door = new THREE.Group();
      door.position.set(dw - 0.005, 0, zd + 0.015);
      door.rotation.y = -1.05;
      merged(door, P.steel, leaf(-lw));
      merged(door, M.glass, [boxG(lw - 0.04, hd - y0 - 0.08, 0.005, -lw / 2, y0 + 0.04, 0)]);
      merged(door, P.black, [boxG(0.02, 0.1, 0.03, -lw + 0.05, y0 + 0.95, 0.02)]);
      g.add(door);
      // Dachfenster rechts, am First angeschlagen und aufgestellt
      const vz = (zs[Math.floor(nz / 2)] + zs[Math.floor(nz / 2) + 1]) / 2;
      const vw = Math.min(0.55, (2 * zd) / nz - 0.06);
      const vl = sl * 0.42;
      const vent = new THREE.Group();
      vent.position.set(0.04, yr + 0.005, vz);
      vent.rotation.z = -al + 0.32;
      merged(vent, P.steel, [boxG(vl, 0.03, 0.03, vl / 2, -0.015, -vw / 2 + 0.015), boxG(vl, 0.03, 0.03, vl / 2, -0.015, vw / 2 - 0.015), boxG(0.03, 0.03, vw, vl - 0.015, -0.015, 0), boxG(0.03, 0.03, vw, 0.015, -0.015, 0)]);
      merged(vent, M.glass, [boxG(vl - 0.04, 0.005, vw - 0.04, vl / 2, -0.005, 0)]);
      g.add(vent);
      F.push(rodG([xw * 0.75, roofY(xw * 0.75), vz], [xw * 0.72, roofY(xw * 0.72) + 0.12, vz], 0.008, 4));
      merged(g, P.steel, F);
      merged(g, M.glass, gl);
      // Plattenweg
      const np = Math.max(2, Math.round((2 * zd) / 0.5));
      merged(g, M.stoneLight, Array.from({ length: np }, (_, i) => boxG(Math.min(0.5, dw * 1.1), 0.02, (2 * zd) / np - 0.06, 0, 0, -zd + ((i + 0.5) * 2 * zd) / np)));
      // links: Pflanztisch mit Töpfen und Setzlingen
      const tx = -xw + 0.08 + Math.min(0.32, w * 0.11);
      const tw = Math.min(0.64, w * 0.22);
      const tl = 2 * zd - 0.3;
      const ty = Math.min(0.75, he * 0.5);
      merged(g, P.steelD, [-1, 1].flatMap((sx) => [-1, 1].map((sz) => boxG(0.03, ty, 0.03, tx + sx * (tw / 2 - 0.04), 0, sz * (tl / 2 - 0.05)))));
      merged(g, P.woodL, Array.from({ length: 4 }, (_, i) => boxG(tw / 4 - 0.015, 0.025, tl, tx - tw / 2 + ((i + 0.5) * tw) / 4, ty, 0)));
      const pots = [];
      const spots = [];
      const terra = tint(M, 0xbf6a3f, { roughness: 0.9 });
      const npz = Math.max(2, Math.round(tl / 0.3));
      for (let i = 0; i < npz; i++) {
        for (const k of [-1, 1]) {
          const px = tx + k * tw * 0.24;
          const pz = -tl / 2 + ((i + 0.5) * tl) / npz;
          pots.push(new THREE.CylinderGeometry(0.065, 0.048, 0.11, 10).translate(px, ty + 0.025 + 0.055, pz));
          spots.push([px, ty + 0.13, pz, 0.06 + ((i + k) % 3) * 0.012]);
        }
      }
      merged(g, terra, pots);
      plants(g, P, spots, { squash: 1.1, blossom: P.yellow, seed: 4 });
      // rechts: Beet mit Holzeinfassung und Tomaten
      const bx = xw - 0.06 - Math.min(0.3, w * 0.1);
      const bwid = Math.min(0.6, w * 0.2);
      const bl = 2 * zd - 0.2;
      merged(g, M.wood, [boxG(0.03, 0.22, bl, bx - bwid / 2, 0, 0), boxG(0.03, 0.22, bl, bx + bwid / 2, 0, 0), boxG(bwid, 0.22, 0.03, bx, 0, bl / 2), boxG(bwid, 0.22, 0.03, bx, 0, -bl / 2)]);
      merged(g, P.soil, [boxG(bwid - 0.03, 0.18, bl - 0.03, bx, 0, 0)]);
      const L = [[], []];
      const Fr = [];
      const S = [];
      const nt = Math.max(2, Math.round(bl / 0.5));
      for (let i = 0; i < nt; i++) tomato(L, Fr, S, bx, -bl / 2 + ((i + 0.5) * bl) / nt, 0.18, Math.min(he + 0.1, h * 0.7) - 0.18, 11 + i);
      tomatoMeshes(g, P, L, Fr, S);
      return true;
    }

    // Folien-Gewächshaus (Tomatenhaus): Stahlrohrgestänge mit Satteldach (First entlang x), transparente Folienhaut, Tür vorn
    // mit Reißverschlüssen, Bahn hochgerollt und festgebunden; drinnen drei Tomaten in Pflanzsäcken an Stäben
    case "garden_foil_house": {
      const xw = w / 2 - 0.02;
      const zd = d / 2 - 0.02;
      const he = h * 0.74;
      const yr = h - 0.02;
      const dw = Math.min(0.36, w * 0.18); // halbe Türbreite
      const yRoll = Math.min(he - 0.25, h * 0.55); // Unterkante der hochgerollten Bahn
      const r0 = 0.012;
      const pipe = [];
      const nx = Math.max(2, Math.round(w / 0.7));
      for (let i = 0; i <= nx; i++) {
        const x = -xw + (2 * xw * i) / nx;
        for (const s of [-1, 1]) {
          if (!(s > 0 && Math.abs(x) < dw + 0.03)) pipe.push(rodG([x, 0, s * zd], [x, he, s * zd], r0, 6));
          pipe.push(rodG([x, he, s * zd], [x, yr, 0], r0, 6));
        }
      }
      for (const s of [-1, 1]) pipe.push(rodG([-xw, he, s * zd], [xw, he, s * zd], r0, 6), rodG([-xw, 0.015, s * zd], [xw, 0.015, s * zd], r0, 6), rodG([s * xw, 0.015, -zd], [s * xw, 0.015, zd], r0, 6));
      pipe.push(rodG([-xw, yr, 0], [xw, yr, 0], r0, 6));
      // Türrahmen
      for (const s of [-1, 1]) pipe.push(rodG([s * dw, 0, zd], [s * dw, he, zd], r0, 6));
      // Eckstreben in den Giebeln
      for (const s of [-1, 1]) pipe.push(rodG([s * xw, 0.3, -zd], [s * xw, he - 0.05, 0], r0 * 0.8, 5), rodG([s * xw, 0.3, zd], [s * xw, he - 0.05, 0], r0 * 0.8, 5));
      merged(g, P.steel, pipe);
      // Folie: Rückwand, Vorderwand mit Türöffnung unter der Rolle, Giebel, Dachflächen
      const foil = [boxG(2 * xw, he, 0.004, 0, 0, -zd)];
      foil.push(prismZ([[-xw, 0], [-dw, 0], [-dw, yRoll], [dw, yRoll], [dw, 0], [xw, 0], [xw, he], [-xw, he]], 0.004, zd));
      for (const s of [-1, 1]) foil.push(prismX([[-zd, 0], [zd, 0], [zd, he], [0, yr], [-zd, he]], 0.004, s * xw));
      const sl = Math.hypot(zd, yr - he);
      const al = Math.atan2(yr - he, zd);
      for (const s of [-1, 1]) foil.push(boxG(2 * xw, 0.004, sl, 0, (he + yr) / 2 - 0.002, (s * zd) / 2, [s * al, 0, 0]));
      merged(g, P.foil, foil);
      // hochgerollte Türbahn mit Bändern, Reißverschlüsse an den Türkanten
      merged(g, tint(M, 0xcfe2ea, { transparent: true, opacity: 0.7, roughness: 0.3 }), [at(new THREE.CylinderGeometry(0.045, 0.045, 2 * dw - 0.02, 10), [0, yRoll + 0.045, zd + 0.05], [0, 0, Math.PI / 2])]);
      merged(g, P.black, [
        ...[-1, 1].map((s) => boxG(0.014, he - 0.06, 0.006, s * (dw - 0.02), 0.02, zd + 0.005)),
        boxG(2 * dw - 0.04, 0.014, 0.006, 0, he - 0.05, zd + 0.005),
        ...[-1, 1].map((s) => boxG(0.025, 0.12, 0.1, s * dw * 0.55, yRoll + 0.01, zd + 0.05)),
      ]);
      merged(g, P.steel, [-1, 1].map((s) => boxG(0.02, 0.04, 0.012, s * (dw - 0.02), yRoll - 0.06, zd + 0.01)));
      // Pflanzsäcke mit Tomaten
      const nb = Math.max(2, Math.round((2 * xw) / 0.65));
      const bagW = Math.min(0.42, (2 * xw) / nb - 0.08);
      const bz = -zd * 0.3;
      const bags = [];
      const tops = [];
      const L = [[], []];
      const Fr = [];
      const S = [];
      for (let i = 0; i < nb; i++) {
        const x = -xw + ((i + 0.5) * 2 * xw) / nb;
        bags.push(boxG(bagW, 0.12, Math.min(0.3, d * 0.3), x, 0, bz));
        tops.push(boxG(bagW - 0.04, 0.012, Math.min(0.3, d * 0.3) - 0.04, x, 0.12, bz));
        tomato(L, Fr, S, x, bz, 0.13, Math.min(he + 0.1, yr - 0.2) - 0.13, 21 + i);
      }
      merged(g, tint(M, 0x2f3d2c, { roughness: 0.8 }), bags);
      merged(g, P.soil, tops);
      tomatoMeshes(g, P, L, Fr, S);
      return true;
    }

    // Gartenhaus: Holzhaus mit senkrechten Deckleisten auf Betonsockel, Satteldach mit Dachpappe (First entlang z, Giebel
    // vorn), Windbretter, Vordach mit Kopfbändern, Tür mit Z-Strebe und Sprossenfenster vorn, Blumenkasten, Stufe
    case "garden_shed_house": {
      const ov = Math.min(0.15, w * 0.05);
      const ovF = Math.min(0.4, d * 0.15);
      const ovB = Math.min(0.1, d * 0.04);
      const bw = w - 2 * ov;
      const bx = bw / 2;
      const zf = d / 2 - ovF;
      const zb = -d / 2 + ovB;
      const bd = zf - zb;
      const zc = (zf + zb) / 2;
      const y0 = 0.1;
      const he = h * 0.7;
      const rt = 0.06; // Dachstärke
      const yr = h - rt - 0.03; // Dachunterseite am First
      const slope = (yr - he) / bx;
      const roofY = (x) => yr - slope * Math.abs(x);
      const al = Math.atan(slope);
      merged(g, M.stone, [boxG(bw + 0.08, y0, bd + 0.08, 0, 0, zc)]);
      merged(g, M.wood, [boxG(bw, he - y0, bd, 0, y0, zc), prismZ([[-bx, he - 0.01], [bx, he - 0.01], [0, yr]], bd, zc)]);
      // Tür und Fenster
      const dx = -bx * 0.32;
      const dwid = Math.min(0.85, bw * 0.3);
      const dh = Math.min(1.85, roofY(Math.abs(dx) + dwid / 2) - y0 - 0.12, he * 1.05);
      const wx = bx * 0.52;
      const ww = Math.min(0.72, bw * 0.26);
      const wy = he * 0.56;
      const wh = Math.min(0.62, he * 0.36);
      // Deckleisten (nicht über Tür und Fenster)
      const bat = [];
      const nb = Math.max(1, Math.round(bw / 0.2)); // mindestens 1: sonst 0/0 bei sehr schmalen Maßen
      for (let i = 0; i <= nb; i++) {
        const x = -bx + 0.02 + ((bw - 0.04) * i) / nb;
        if (Math.abs(x - dx) > dwid / 2 + 0.06 && Math.abs(x - wx) > ww / 2 + 0.06) bat.push(boxG(0.04, roofY(x) - y0 - 0.03, 0.015, x, y0, zf + 0.0075));
        else if (Math.abs(x - wx) <= ww / 2 + 0.06) bat.push(boxG(0.04, wy - y0 - 0.1, 0.015, x, y0, zf + 0.0075), boxG(0.04, roofY(x) - wy - wh - 0.1, 0.015, x, wy + wh + 0.06, zf + 0.0075));
        else bat.push(boxG(0.04, roofY(x) - y0 - dh - 0.12, 0.015, x, y0 + dh + 0.08, zf + 0.0075));
        bat.push(boxG(0.04, roofY(x) - y0 - 0.03, 0.015, x, y0, zb - 0.0075));
      }
      const ns = Math.max(1, Math.round(bd / 0.2));
      for (let i = 0; i <= ns; i++) for (const s of [-1, 1]) bat.push(boxG(0.015, he - y0 - 0.02, 0.04, s * (bx + 0.0075), y0, zb + 0.02 + ((bd - 0.04) * i) / ns));
      merged(g, P.woodD, bat);
      // Tür: Bretter, Z-Strebe, Zarge, Griff
      const dz = zf + 0.02;
      merged(g, P.woodL, [boxG(dwid, dh, 0.025, dx, y0 + 0.02, dz)]);
      const zl = Math.hypot(dwid - 0.12, dh - 0.5);
      merged(g, P.woodD, [
        boxG(dwid - 0.06, 0.1, 0.02, dx, y0 + 0.15, dz + 0.02),
        boxG(dwid - 0.06, 0.1, 0.02, dx, y0 + dh - 0.25, dz + 0.02),
        boxG(zl, 0.09, 0.02, dx, y0 + 0.02 + dh / 2 - 0.045, dz + 0.02, [0, 0, Math.atan2(dh - 0.5, dwid - 0.12)]),
        ...Array.from({ length: 4 }, (_, i) => boxG(0.006, dh - 0.02, 0.006, dx - dwid / 2 + ((i + 1) * dwid) / 5, y0 + 0.03, dz + 0.012)),
      ]);
      const tr = [
        boxG(0.06, dh + 0.06, 0.03, dx - dwid / 2 - 0.03, y0, zf + 0.015),
        boxG(0.06, dh + 0.06, 0.03, dx + dwid / 2 + 0.03, y0, zf + 0.015),
        boxG(dwid + 0.18, 0.07, 0.03, dx, y0 + dh + 0.02, zf + 0.015),
        // Fensterrahmen, Sprossenkreuz, Fensterbank
        boxG(ww + 0.08, 0.05, 0.035, wx, wy - 0.05, zf + 0.018),
        boxG(ww + 0.08, 0.05, 0.035, wx, wy + wh, zf + 0.018),
        boxG(0.05, wh, 0.035, wx - ww / 2 - 0.015, wy, zf + 0.018),
        boxG(0.05, wh, 0.035, wx + ww / 2 + 0.015, wy, zf + 0.018),
        boxG(0.03, wh, 0.02, wx, wy, zf + 0.025),
        boxG(ww, 0.03, 0.02, wx, wy + wh / 2 - 0.015, zf + 0.025),
        boxG(ww + 0.14, 0.03, 0.07, wx, wy - 0.075, zf + 0.035),
      ];
      merged(g, P.cream, tr);
      merged(g, tint(M, 0x1e252b, { roughness: 0.5 }), [boxG(ww, wh, 0.01, wx, wy, zf + 0.005)]);
      merged(g, M.glass, [boxG(ww - 0.01, wh - 0.01, 0.005, wx, wy + 0.005, zf + 0.02)]);
      merged(g, P.black, [boxG(0.03, 0.14, 0.04, dx + dwid / 2 - 0.1, y0 + dh * 0.5, dz + 0.03), boxG(0.1, 0.025, 0.04, dx + dwid / 2 - 0.12, y0 + dh * 0.55, dz + 0.045)]);
      // Blumenkasten unter dem Fenster
      merged(g, P.woodD, [boxG(ww, 0.13, 0.14, wx, wy - 0.26, zf + 0.085)]);
      plants(g, P, Array.from({ length: 5 }, (_, i) => [wx - ww / 2 + 0.07 + ((ww - 0.14) * i) / 4, wy - 0.15, zf + 0.085, 0.07]), { squash: 0.9, blossom: P.flower, seed: 9 });
      // Dach mit Dachpappe, First, Windbretter, Kopfbänder unter dem Vordach
      const sl = Math.hypot(w / 2, slope * (w / 2)) + 0.02;
      const roof = [];
      for (const s of [-1, 1]) {
        const cx = (s * w) / 4 + s * Math.sin(al) * (rt / 2);
        const cy = yr - (slope * w) / 4 + Math.cos(al) * (rt / 2);
        roof.push(boxG(sl, rt, d, cx, cy - rt / 2, 0, [0, 0, -s * al]));
      }
      merged(g, tint(M, 0x474a50, { roughness: 1 }), roof);
      merged(g, P.black, [boxG(0.12, 0.035, d + 0.01, 0, yr + rt / Math.cos(al) - 0.03, 0)]);
      const fas = [];
      for (const s of [-1, 1]) {
        for (const z of [d / 2 - 0.012, -d / 2 + 0.012]) fas.push(boxG(sl, 0.13, 0.025, (s * w) / 4, yr - (slope * w) / 4 - 0.07, z, [0, 0, -s * al]));
        fas.push(rodG([s * (bx - 0.12), he - 0.25, zf + 0.02], [s * (bx - 0.12), roofY(bx - 0.12) - 0.02, d / 2 - 0.06], 0.035, 4));
      }
      merged(g, P.woodL, fas);
      // Stufe vor der Tür
      merged(g, M.stoneLight, [boxG(dwid + 0.3, y0 + 0.05, Math.max(0.2, ovF - 0.02), dx, 0, zf + Math.max(0.2, ovF - 0.02) / 2 + 0.02)]);
      return true;
    }

    // Geräteschuppen: schmaler Holzschuppen mit Stülpschalung auf Betonsockel, Pultdach (vorn hoch, nach hinten fallend) mit
    // Überstand, Doppeltür mit Brettfugen, Z-Streben, Bändern, Griffen und Riegel, Lüftungsschlitze oben
    case "garden_tool_shed": {
      const y0 = 0.07;
      const ovF = Math.min(0.1, d * 0.12);
      const ovB = 0.04;
      const ovS = 0.04;
      const bw = w - 2 * ovS;
      const bx = bw / 2;
      const zf = d / 2 - ovF;
      const zb = -d / 2 + ovB;
      const hf = h - 0.09;
      const hb = h * 0.8;
      const slope = (hf - hb) / (zf - zb);
      const a = Math.atan(slope);
      merged(g, M.stone, [boxG(bw + 0.05, y0, zf - zb + 0.05, 0, 0, (zf + zb) / 2)]);
      merged(g, M.wood, [prismX([[zb, y0], [zf, y0], [zf, hf], [zb, hb]], bw, 0)]);
      // Stülpschalung an Seiten und Rückwand (Fugen)
      const lap = [];
      for (let y = y0 + 0.12; y < hb - 0.03; y += 0.12) {
        for (const s of [-1, 1]) lap.push(boxG(0.012, 0.018, zf - zb - 0.01, s * (bx + 0.004), y, (zf + zb) / 2));
        lap.push(boxG(bw - 0.01, 0.018, 0.012, 0, y, zb - 0.004));
      }
      // Eckleisten
      for (const s of [-1, 1]) for (const z of [zf, zb]) lap.push(boxG(0.05, (z > 0 ? hf : hb) - y0 - 0.02, 0.05, s * (bx - 0.015), y0, z - Math.sign(z) * 0.015));
      merged(g, P.woodD, lap);
      // Pultdach mit Überstand und Stirnbrett
      const zr0 = zb - ovB;
      const zr1 = zf + ovF;
      const yr0 = hb - slope * ovB;
      const yr1 = hf + slope * ovF;
      const rl = Math.hypot(zr1 - zr0, yr1 - yr0);
      merged(g, tint(M, 0x474a50, { roughness: 1 }), [boxG(w, 0.04, rl, 0, (yr0 + yr1) / 2 + 0.02 * Math.cos(a) - 0.02, (zr0 + zr1) / 2 - 0.02 * Math.sin(a), [-a, 0, 0])]);
      merged(g, P.woodL, [boxG(w + 0.01, 0.08, 0.025, 0, yr1 - 0.07, zr1), boxG(w + 0.01, 0.06, 0.025, 0, yr0 - 0.05, zr0)]);
      // Doppeltür
      const dh = hf - y0 - 0.32;
      const dwid = (bw - 0.16) / 2;
      const dz = zf + 0.012;
      const leaves = [];
      const det = [];
      for (const s of [-1, 1]) {
        const cx = s * (dwid / 2 + 0.004);
        leaves.push(boxG(dwid, dh, 0.022, cx, y0 + 0.05, dz));
        for (let i = 1; i < 4; i++) det.push(boxG(0.006, dh - 0.02, 0.004, cx - dwid / 2 + (i * dwid) / 4, y0 + 0.06, dz + 0.012));
        const zl = Math.hypot(dwid - 0.1, dh - 0.4);
        det.push(boxG(dwid - 0.04, 0.08, 0.018, cx, y0 + 0.17, dz + 0.018), boxG(dwid - 0.04, 0.08, 0.018, cx, y0 + dh - 0.2, dz + 0.018));
        det.push(boxG(zl, 0.07, 0.018, cx, y0 + 0.05 + dh / 2 - 0.035, dz + 0.018, [0, 0, -s * Math.atan2(dh - 0.4, dwid - 0.1)]));
      }
      merged(g, P.woodL, leaves);
      merged(g, P.woodD, [...det, boxG(bw - 0.02, 0.06, 0.02, 0, y0 + dh + 0.06, zf + 0.01), boxG(0.06, dh + 0.06, 0.02, -bx + 0.03, y0, zf + 0.01), boxG(0.06, dh + 0.06, 0.02, bx - 0.03, y0, zf + 0.01)]);
      // Bänder, Griffe, Riegel, Lüftungsschlitze
      const iron = [];
      for (const s of [-1, 1]) for (const y of [y0 + 0.25, y0 + dh - 0.15]) iron.push(boxG(dwid * 0.4, 0.03, 0.01, s * (dwid - dwid * 0.2 - 0.004), y, dz + 0.03));
      for (let i = 0; i < 3; i++) iron.push(boxG(bw * 0.18, 0.02, 0.01, -bw * 0.22 + i * bw * 0.22, hf - 0.16, zf + 0.012));
      merged(g, P.black, iron);
      merged(g, P.steel, [
        ...[-1, 1].map((s) => boxG(0.02, 0.14, 0.03, s * 0.05, y0 + dh * 0.5, dz + 0.035)),
        boxG(0.16, 0.025, 0.02, 0.03, y0 + dh * 0.62, dz + 0.035),
      ]);
      return true;
    }

    default:
      return false;
  }
}
