// Haustiere und Kinderzimmer des Katalogs „Wohnen, Küche, Kamin, Vorhänge“ (siehe furniture-home.js): jedes Modell ist eine Funktion
// mit { g, M, w, d, h, bulbs, T }; Mitte der Grundfläche im Ursprung, Vorderseite nach +z.

import * as THREE from "./vendor/three.module.min.js";
import { arcYZ, ball, box, cyl, disc, leaf, place, rnd, rod } from "./home-parts.js";

/** Plüschtier (Bär): sitzt mit Fußpunkt (x, y, z), Größe s (Höhe ≈ 0.2·s), schaut nach vorn. */
function teddy(g, T, x, y, z, s = 1, color = 0xc9a06a) {
  const fur = T(color);
  const light = T(0xe8d8bc);
  ball(g, fur, 0.07 * s, x, y + 0.07 * s, z, 10).scale.set(1, 1.05, 0.9);
  ball(g, fur, 0.055 * s, x, y + 0.17 * s, z + 0.005 * s, 10);
  for (const sx of [-1, 1]) {
    ball(g, fur, 0.022 * s, x + sx * 0.04 * s, y + 0.215 * s, z, 6);
    ball(g, fur, 0.026 * s, x + sx * 0.07 * s, y + 0.1 * s, z + 0.03 * s, 6);
    ball(g, fur, 0.028 * s, x + sx * 0.04 * s, y + 0.02 * s, z + 0.05 * s, 6);
    ball(g, T(0x2a2522), 0.007 * s, x + sx * 0.02 * s, y + 0.18 * s, z + 0.052 * s, 5);
  }
  ball(g, light, 0.02 * s, x, y + 0.155 * s, z + 0.05 * s, 6);
  ball(g, T(0x2a2522), 0.008 * s, x, y + 0.16 * s, z + 0.068 * s, 5);
}

/** Dreieck aus drei Punkten (beidseitig sichtbar), z. B. Zeltbahn. */
function tri(g, mat, a, b, c) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  g.add(m);
  return m;
}

/** Fische: Körper, Schwanz, Auge. */
function fish(g, T, x, y, z, s, color, dir = 1) {
  ball(g, T(color), 0.03 * s, x, y, z, 8).scale.set(1.5, 1, 0.45);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.022 * s, 0.04 * s, 4), T(color));
  tail.rotation.z = (dir * Math.PI) / 2;
  place(g, tail, x - dir * 0.055 * s, y, z);
  ball(g, T(0x1c1e20), 0.005 * s, x + dir * 0.03 * s, y + 0.008 * s, z + 0.012 * s, 4);
}

export const PETS = {
  home_cat_tree({ g, M, w, d, h, T }) {
    const plush = T(0xb9a98f);
    const dark = T(0x8f8478);
    const sisal = T(0xcbb88f);
    const band = T(0xa8956a);
    box(g, plush, w, 0.05, d, 0, 0, 0);
    // Stämme mit Sisalringen
    const post = (x, z, top) => {
      cyl(g, sisal, 0.045, top - 0.05, x, 0.05, z, 12);
      for (let y = 0.15; y < top - 0.05; y += 0.18) cyl(g, band, 0.049, 0.012, x, y, z, 12);
    };
    post(-w * 0.2, -d * 0.16, h - 0.09);
    post(w * 0.27, d * 0.16, h * 0.48);
    // Höhle unten links
    box(g, dark, w * 0.5, h * 0.2, d * 0.55, -w * 0.25, 0.05, d * 0.2);
    disc(g, T(0x2a2522), h * 0.065, -w * 0.25, 0.05 + h * 0.09, d * 0.2 + d * 0.275 + 0.002, 0.004, 20);
    box(g, plush, w * 0.52, 0.025, d * 0.58, -w * 0.25, 0.05 + h * 0.2, d * 0.2);
    // mittlere Liegefläche und oberer Aussichtspunkt mit Rand und Kissen
    box(g, plush, w * 0.7, 0.04, d * 0.78, w * 0.12, h * 0.48, d * 0.06);
    const top = h - 0.09;
    box(g, plush, w * 0.78, 0.05, d * 0.84, -w * 0.08, top, -d * 0.04);
    for (const [bx, bz, bw, bd] of [[0, d * 0.4, w * 0.78, 0.04], [0, -d * 0.4, w * 0.78, 0.04], [w * 0.37, 0, 0.04, d * 0.8], [-w * 0.37, 0, 0.04, d * 0.8]]) box(g, dark, bw, 0.04, bd, -w * 0.08 + bx, top + 0.05, -d * 0.04 + bz);
    cyl(g, T(0xd9c7a0), Math.min(w, d) * 0.28, 0.025, -w * 0.08, top + 0.05, -d * 0.04, 20);
    // Spielmaus an der Schnur
    rod(g, T(0xd9c7a0), [w * 0.4, h * 0.48, d * 0.28], [w * 0.4, h * 0.48 - 0.28, d * 0.28], 0.003, 4);
    ball(g, T(0xd9534f), 0.035, w * 0.4, h * 0.48 - 0.31, d * 0.28, 8);
  },

  home_dog_bed({ g, M, w, d, h, T }) {
    const rimR = Math.min(0.07, h * 0.4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) / 2 - rimR, rimR, 10, 32), T(0xb08a62));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(w / Math.min(w, d), 1, 1); // Ring in der Breite auf das Oval strecken
    place(g, ring, 0, rimR + 0.01, 0);
    const cush = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 32), T(0xd9c7a0));
    cush.scale.set(w - 2 * rimR - 0.02, 1, d - 2 * rimR - 0.02);
    place(g, cush, 0, 0.03 + 0.01, 0);
    // höhere Rückenrolle
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), T(0xb08a62));
    back.scale.set(w * 0.38, h * 0.5, d * 0.17);
    place(g, back, 0, h * 0.5, -d / 2 + d * 0.17);
    // Knochen und Decke
    const bone = T(0xf0e6cf);
    cyl(g, bone, 0.012, 0.12, 0, 0.1, 0.05, 8).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ball(g, bone, 0.018, sx * 0.06, 0.1, 0.05 + sz * 0.012, 6);
    box(g, T(0x8a9fb0), w * 0.3, 0.02, d * 0.35, w * 0.12, 0.07, d * 0.08).rotation.y = 0.3;
  },

  home_litter_box({ g, M, w, d, h, T }) {
    const tray = T(0xe4ddcc);
    const hood = T(0x8aa39b);
    const tr = h * 0.3;
    box(g, tray, w, tr, d, 0, 0, 0);
    const geo = new THREE.CylinderGeometry(w / 2, w / 2, d * 0.98, 24, 1, false, 0, Math.PI);
    geo.rotateX(Math.PI / 2);
    geo.rotateZ(Math.PI / 2);
    const dome = new THREE.Mesh(geo, hood);
    dome.scale.y = (h - tr) / (w / 2);
    place(g, dome, 0, tr, 0);
    // Eingang vorn, Tragegriff und Filter oben
    disc(g, T(0x2a2522), Math.min(0.11, (h - tr) * 0.48), 0, tr + 0.02 + Math.min(0.11, (h - tr) * 0.48), d / 2 + 0.002, 0.004, 22);
    box(g, T(0x5f7a72), w * 0.4, 0.014, 0.05, 0, h - 0.018, 0);
    box(g, T(0x3a3f44), w * 0.24, 0.01, d * 0.3, 0, h - 0.008, -d * 0.2);
  },

  home_pet_bowls({ g, M, w, d, h, T }) {
    box(g, T(0x2f3236), w, 0.01, d, 0, 0, 0);
    const sh = h * 0.45;
    box(g, T(0xc9a06a), w * 0.94, 0.03, d * 0.7, 0, 0.01 + sh - 0.03, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, T(0xc9a06a), 0.012, sh - 0.03, sx * w * 0.42, 0.01, sz * d * 0.28, 8);
    const R = Math.min(w * 0.2, d * 0.4);
    const steel = T(0xd5d9de, { metalness: 0.2, roughness: 0.4 });
    for (const [i, x] of [-1, 1].entries()) {
      cyl(g, steel, R * 0.7, h - 0.01 - sh + 0.0, x * w * 0.24, 0.01 + sh, 0, 20, R);
      if (i === 0) cyl(g, T(0x7a4a2a), R * 0.92, 0.012, x * w * 0.24, h - 0.025, 0, 20);
      else cyl(g, T(0x6fb0d9, { transparent: true, opacity: 0.8 }), R * 0.92, 0.01, x * w * 0.24, h - 0.025, 0, 20);
    }
    // Futterkörner daneben
    for (let k = 0; k < 6; k++) ball(g, T(0x7a4a2a), 0.007, -w * 0.4 + rnd(k) * 0.05, 0.016, d * 0.38 + rnd(k + 3) * 0.04, 4);
  },

  home_aquarium({ g, M, w, d, h, bulbs, T }) {
    const cab = h * 0.54;
    const rim = 0.03;
    box(g, M.wood, w, cab, d, 0, 0, 0);
    box(g, M.dark, w * 0.96, 0.008, 0.004, 0, cab * 0.5, d / 2 + 0.003);
    box(g, M.dark, 0.008, cab * 0.9, 0.004, 0, cab * 0.05, d / 2 + 0.003);
    for (const sx of [-1, 1]) box(g, M.metal, 0.012, 0.08, 0.016, sx * 0.04, cab * 0.55, d / 2 + 0.01);
    // Becken: Rahmen, Rückwand, Sand, Wasser, Glas
    const ty = cab;
    const tank = h - cab - 0.07;
    box(g, T(0x1c1e20), w - 0.02, rim, d - 0.02, 0, ty, 0);
    box(g, T(0x173a58), w - 0.06, tank, 0.01, 0, ty + rim, -d / 2 + 0.03);
    box(g, T(0xe0cfa0), w - 0.06, 0.05, d - 0.06, 0, ty + rim, 0);
    box(g, T(0x3a8fd0, { transparent: true, opacity: 0.32, depthWrite: false }), w - 0.06, tank - 0.03, d - 0.06, 0, ty + rim, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, T(0x1c1e20), 0.014, tank, 0.014, sx * (w / 2 - 0.03), ty + rim, sz * (d / 2 - 0.03));
    const base = ty + rim + 0.05;
    // Deko: Wurzel, Steine, Pflanzen, Fische, Luftblasen
    rod(g, T(0x6b4a2f), [-w * 0.3, base, 0], [-w * 0.18, base + tank * 0.38, d * 0.05], 0.018, 7);
    rod(g, T(0x6b4a2f), [-w * 0.26, base + tank * 0.14, 0], [-w * 0.4, base + tank * 0.3, d * 0.06], 0.012, 6);
    for (const [x, z, r] of [[w * 0.22, d * 0.1, 0.06], [w * 0.3, -d * 0.05, 0.045], [w * 0.05, d * 0.15, 0.04]]) ball(g, T(0x7a7f85), r, x, base + r * 0.6, z, 8).scale.y = 0.75;
    for (let k = 0; k < 9; k++) {
      const x = w * (0.08 + 0.03 * (k % 4)) + (k > 4 ? w * 0.18 : 0);
      leaf(g, T(k % 2 ? 0x3f8f4a : 0x2f7a3e), tank * (0.4 + 0.3 * rnd(k)), 0.035, x - w * 0.04, base, -d * 0.12 + 0.06 * (k % 3), (k - 4) * 0.4, 1.3, 0.3);
    }
    fish(g, T, -w * 0.05, base + tank * 0.55, d * 0.05, 1.2, 0xff8a2a, 1);
    fish(g, T, w * 0.2, base + tank * 0.7, -d * 0.08, 1, 0xffd84a, -1);
    fish(g, T, w * 0.32, base + tank * 0.42, d * 0.08, 0.9, 0x4aa8ff, -1);
    fish(g, T, -w * 0.28, base + tank * 0.72, -d * 0.05, 1, 0xff8a2a, 1);
    for (let k = 0; k < 6; k++) ball(g, T(0xe8f4ff, { transparent: true, opacity: 0.6 }), 0.008, w * 0.4 - 0.004 * k, base + 0.05 + k * tank * 0.14, -d * 0.2 + 0.01 * (k % 2), 5);
    // Abdeckung mit Beleuchtung darunter
    box(g, T(0x1c1e20), w - 0.02, 0.05, d - 0.02, 0, h - 0.05, 0);
    bulbs.push(box(g, M.bulb, w - 0.1, 0.01, d * 0.4, 0, h - 0.06, d * 0.05));
  },

  home_bird_cage({ g, M, w, d, h, T }) {
    const metal = T(0x3a3f44, { metalness: 0.5, roughness: 0.4 });
    const cw = w * 0.84;
    const cd = d * 0.8;
    const cb = h * 0.55;
    const chh = h * 0.36;
    // Gestell: vier Beine, Querstrebe, Auffangschale
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(g, metal, [sx * (cw / 2 - 0.02), cb, sz * (cd / 2 - 0.02)], [sx * (w / 2 - 0.02), 0.01, sz * (d / 2 - 0.02)], 0.011, 8);
    for (const s of [-1, 1]) rod(g, metal, [s * (w * 0.46), h * 0.2, -d * 0.4], [s * (w * 0.46), h * 0.2, d * 0.4], 0.008, 6);
    box(g, metal, cw + 0.02, 0.02, cd + 0.02, 0, cb - 0.02, 0);
    // Gitterstäbe
    const bars = [];
    const nx = Math.max(1, Math.round(cw / 0.04)); // mindestens 1: sonst 0/0 bei sehr schmalen Maßen
    const nz = Math.max(1, Math.round(cd / 0.04));
    for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) bars.push([-cw / 2 + (i * cw) / nx, sz * cd / 2]);
    for (let i = 1; i < nz; i++) for (const sx of [-1, 1]) bars.push([sx * cw / 2, -cd / 2 + (i * cd) / nz]);
    for (const [x, z] of bars) cyl(g, metal, 0.0035, chh, x, cb, z, 5);
    for (const y of [cb + chh * 0.5]) {
      box(g, metal, cw, 0.006, 0.006, 0, y, cd / 2);
      box(g, metal, cw, 0.006, 0.006, 0, y, -cd / 2);
    }
    box(g, metal, cw + 0.01, 0.014, cd + 0.01, 0, cb + chh, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), metal);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(cw, h * 0.07, cd);
    place(g, roof, 0, cb + chh + 0.014 + (h * 0.07) / 2, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 14), metal);
    place(g, ring, 0, h - 0.03, 0);
    // Sitzstangen, Futternapf, Vogel
    rod(g, T(0xa97f4a), [-cw / 2 + 0.01, cb + chh * 0.35, 0], [cw / 2 - 0.01, cb + chh * 0.35, 0], 0.01, 7);
    rod(g, T(0xa97f4a), [-cw * 0.3, cb + chh * 0.68, cd * 0.12], [cw * 0.3, cb + chh * 0.68, cd * 0.12], 0.009, 7);
    cyl(g, T(0xe8e0d0), 0.03, 0.03, cw * 0.32, cb + 0.02, 0, 12);
    const yel = T(0xf2c84b);
    ball(g, yel, 0.04, cw * 0.1, cb + chh * 0.35 + 0.05, 0, 10).scale.set(0.8, 1, 1.2);
    ball(g, yel, 0.026, cw * 0.1, cb + chh * 0.35 + 0.1, cd * 0.04, 8);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 5), T(0xe08a3a));
    beak.rotation.x = Math.PI / 2;
    place(g, beak, cw * 0.1, cb + chh * 0.35 + 0.1, cd * 0.04 + 0.03);
    ball(g, T(0x1c1e20), 0.004, cw * 0.1 + 0.014, cb + chh * 0.35 + 0.105, cd * 0.04 + 0.016, 4);
    const tail = box(g, yel, 0.02, 0.005, 0.06, cw * 0.1, cb + chh * 0.35 + 0.03, -0.05);
    tail.rotation.x = 0.4;
  },

  home_small_pet({ g, M, w, d, h, T }) {
    const tray = T(0x4a7a9a);
    const th = 0.12;
    box(g, tray, w, th, d, 0, 0, 0);
    box(g, T(0x3a6584), w * 0.97, 0.012, d * 0.97, 0, th, 0);
    // Einstreu und Heu
    box(g, T(0xd9c08a), w * 0.94, 0.02, d * 0.94, 0, th, 0);
    for (let k = 0; k < 9; k++) ball(g, T(0xe0c870), 0.05, -w * 0.3 + rnd(k) * w * 0.35, th + 0.04, -d * 0.1 + rnd(k + 5) * d * 0.3, 7).scale.set(1.5, 0.55, 1);
    // Häuschen mit Dach
    box(g, T(0xc9a06a), w * 0.24, h * 0.34, d * 0.34, w * 0.28, th, -d * 0.2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), T(0xb8643b));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w * 0.28, h * 0.14, d * 0.4);
    place(g, roof, w * 0.28, th + h * 0.34 + (h * 0.14) / 2, -d * 0.2);
    disc(g, T(0x2a2522), 0.04, w * 0.28, th + h * 0.14, -d * 0.2 + d * 0.17 + 0.002, 0.004, 14);
    // Napf, Trinkflasche, Kleintier
    cyl(g, T(0xe8e0d0), 0.05, 0.04, -w * 0.4, th + 0.02, d * 0.2, 14);
    cyl(g, T(0x9fc3d6, { transparent: true, opacity: 0.6 }), 0.016, 0.16, -w / 2 + 0.03, th + 0.2, 0, 8);
    rod(g, M.metal, [-w / 2 + 0.03, th + 0.2, 0], [-w / 2 + 0.03, th + 0.16, d * 0.08], 0.005, 5);
    ball(g, T(0xc9863a), 0.05, -w * 0.05, th + 0.065, d * 0.15, 10).scale.set(1.5, 1, 1);
    ball(g, T(0xc9863a), 0.035, -w * 0.05 + 0.075, th + 0.07, d * 0.15, 8);
    ball(g, T(0x1c1e20), 0.005, -w * 0.05 + 0.104, th + 0.08, d * 0.15 + 0.016, 4);
    // Gitteraufsatz aus Stäben mit Rahmen oben
    const gy = th;
    const gh = h - th;
    const bar = T(0x6a6e73, { metalness: 0.5, roughness: 0.4 });
    const nx = Math.max(1, Math.round(w / 0.07));
    const nz = Math.max(1, Math.round(d / 0.07));
    for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) cyl(g, bar, 0.003, gh, -w / 2 + 0.005 + (i * (w - 0.01)) / nx, gy, sz * (d / 2 - 0.005), 5);
    for (let i = 1; i < nz; i++) for (const sx of [-1, 1]) cyl(g, bar, 0.003, gh, sx * (w / 2 - 0.005), gy, -d / 2 + (i * d) / nz, 5);
    box(g, bar, w, 0.012, 0.012, 0, h - 0.012, d / 2 - 0.006);
    box(g, bar, w, 0.012, 0.012, 0, h - 0.012, -d / 2 + 0.006);
    box(g, bar, 0.012, 0.012, d, w / 2 - 0.006, h - 0.012, 0);
    box(g, bar, 0.012, 0.012, d, -w / 2 + 0.006, h - 0.012, 0);
    box(g, bar, 0.012, 0.012, d, 0, h - 0.012, 0);
  },

  home_terrarium({ g, M, w, d, h, bulbs, T }) {
    const frame = T(0x2a2d31);
    const lid = 0.04;
    const base = 0.04;
    const gh = h - base - lid;
    box(g, frame, w, base, d, 0, 0, 0);
    // Rückwand mit Felsstruktur, Bodengrund, Glasscheiben
    box(g, T(0x4a5a48), w - 0.02, gh, 0.012, 0, base, -d / 2 + 0.01);
    box(g, T(0x7a5a3a), w - 0.02, 0.06, d - 0.02, 0, base, 0);
    box(g, M.glass, w - 0.01, gh, 0.006, 0, base, d / 2 - 0.004);
    for (const s of [-1, 1]) box(g, M.glass, 0.006, gh, d - 0.01, s * (w / 2 - 0.004), base, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, frame, 0.016, gh, 0.016, sx * (w / 2 - 0.008), base, sz * (d / 2 - 0.008));
    box(g, frame, w, lid, d, 0, h - lid, 0);
    for (let i = 0; i < 10; i++) box(g, T(0x3a3f44), w * 0.5 / 10 * 0.6, 0.004, d * 0.4, w * 0.2 + (i - 5) * w * 0.05, h - 0.002, 0);
    // Einrichtung: Steine, Ast, Pflanzen, Wasserschale, Gecko
    const soil = base + 0.06;
    for (const [x, z, r] of [[-w * 0.3, d * 0.1, 0.07], [-w * 0.2, -d * 0.05, 0.05], [w * 0.25, d * 0.15, 0.04]]) ball(g, T(0x8a867e), r, x, soil + r * 0.5, z, 8).scale.y = 0.7;
    rod(g, T(0x6b4a2f), [w * 0.1, soil, -d * 0.2], [w * 0.36, soil + gh * 0.6, -d * 0.1], 0.016, 7);
    rod(g, T(0x6b4a2f), [w * 0.25, soil + gh * 0.35, -d * 0.15], [w * 0.05, soil + gh * 0.55, -d * 0.1], 0.01, 6);
    for (let k = 0; k < 7; k++) leaf(g, T(k % 2 ? 0x3f8f4a : 0x2f7a3e), gh * 0.3, 0.05, -w * 0.05 + (k % 3) * 0.03, soil, -d * 0.15, k * 0.9, 0.9, 0.2);
    cyl(g, T(0x6fb0d9, { transparent: true, opacity: 0.8 }), 0.06, 0.02, w * 0.3, soil, d * 0.2, 14);
    ball(g, T(0x8aa63a), 0.02, -w * 0.16, soil + 0.07, -d * 0.04, 8).scale.set(1.8, 0.8, 1);
    ball(g, T(0x8aa63a), 0.014, -w * 0.16 + 0.04, soil + 0.07, -d * 0.04, 6);
    rod(g, T(0x8aa63a), [-w * 0.16 - 0.03, soil + 0.07, -d * 0.04], [-w * 0.16 - 0.1, soil + 0.05, -d * 0.04 + 0.03], 0.006, 5);
    // Wärmelampe mit Reflektor
    const rf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.07, 14, 1, true), T(0xc9cdd2, { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    rf.rotation.x = Math.PI;
    place(g, rf, w * 0.28, h - lid - 0.035, 0);
    bulbs.push(ball(g, M.bulb, 0.026, w * 0.28, h - lid - 0.075, 0, 10));
  },
};

/** Kinderstuhl: Sitz, Beine und Lehne mit drei Sprossen; Vorderseite nach +z, Sitzhöhe sh. */
function kidChair(g, T, x, z, rotY, sh, hh, size, color) {
  const c = new THREE.Group();
  const mat = T(color);
  box(c, mat, size, 0.025, size, 0, sh - 0.025, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(c, mat, 0.025, sh - 0.025, 0.025, sx * (size / 2 - 0.02), 0, sz * (size / 2 - 0.02));
  for (const sx of [-1, 1]) box(c, mat, 0.025, hh - sh, 0.025, sx * (size / 2 - 0.02), sh, -size / 2 + 0.02);
  for (let i = 0; i < 3; i++) box(c, mat, size - 0.03, 0.03, 0.02, 0, sh + 0.05 + i * ((hh - sh - 0.1) / 2.5), -size / 2 + 0.02);
  c.position.set(x, 0, z);
  c.rotation.y = rotY;
  g.add(c);
}

export const KIDS = {
  home_crib({ g, M, w, d, h, T }) {
    const wood = M.white;
    const post = 0.045;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, wood, post, h, post, sx * (w / 2 - post / 2), 0, sz * (d / 2 - post / 2));
    const my = h * 0.32;
    // Lattenrost, Matratze, Decke, Bär
    box(g, wood, w - 2 * post, 0.03, d - 2 * post, 0, my - 0.04, 0);
    box(g, T(0xf3ecd9), w - 2 * post - 0.01, 0.1, d - 2 * post - 0.01, 0, my - 0.01, 0);
    box(g, T(0xcfe3ec), w - 2 * post - 0.01, 0.025, (d - 2 * post) * 0.6, 0, my + 0.09, d * 0.14);
    box(g, T(0xf2d7d5), (w - 2 * post) * 0.6, 0.04, (d - 2 * post) * 0.22, 0, my + 0.09, -d * 0.38).rotation.x = 0.06;
    teddy(g, T, w * 0.12, my + 0.115, -d * 0.2, 1.1);
    // Seitengitter lang, Kopf- und Fußteil
    const nz = Math.round((d - 2 * post) / 0.075);
    for (const sx of [-1, 1]) {
      box(g, wood, 0.025, 0.04, d - 2 * post, sx * (w / 2 - post / 2), h - 0.05, 0);
      box(g, wood, 0.025, 0.035, d - 2 * post, sx * (w / 2 - post / 2), my + 0.06, 0);
      for (let i = 1; i < nz; i++) cyl(g, wood, 0.008, h - my - 0.1, sx * (w / 2 - post / 2), my + 0.06, -d / 2 + post + (i * (d - 2 * post)) / nz, 6);
    }
    const nx = Math.round((w - 2 * post) / 0.075);
    for (const sz of [-1, 1]) {
      const full = sz < 0;
      box(g, wood, w - 2 * post, 0.04, 0.025, 0, h - 0.05, sz * (d / 2 - post / 2));
      box(g, wood, w - 2 * post, 0.035, 0.025, 0, my + 0.06, sz * (d / 2 - post / 2));
      if (full) box(g, wood, w - 2 * post, h - my - 0.1, 0.02, 0, my + 0.06, sz * (d / 2 - post / 2));
      else for (let i = 1; i < nx; i++) cyl(g, wood, 0.008, h - my - 0.1, -w / 2 + post + (i * (w - 2 * post)) / nx, my + 0.06, sz * (d / 2 - post / 2), 6);
    }
    // Mobile über dem Kopfteil
    rod(g, T(0xa97f4a), [-w * 0.25, h - 0.06, -d * 0.2], [w * 0.25, h - 0.06, -d * 0.2], 0.005, 5);
    for (const [x, c] of [[-0.2, 0xf2c84b], [0, 0xe0457b], [0.2, 0x6fb0d9]]) {
      rod(g, T(0xe8e0d0), [x * w * 1.1, h - 0.06, -d * 0.2], [x * w * 1.1, h - 0.17, -d * 0.2], 0.0015, 4);
      ball(g, T(c), 0.022, x * w * 1.1, h - 0.19, -d * 0.2, 8);
    }
  },

  home_kids_bed({ g, M, w, d, h, T }) {
    const wood = M.wood;
    const fh = h * 0.42;
    box(g, wood, w, fh, d, 0, 0.0, 0);
    box(g, T(0xf3ecd9), w - 0.06, 0.13, d - 0.14, 0, fh - 0.03, 0.02);
    box(g, T(0x8ab8d0), w - 0.06, 0.04, (d - 0.14) * 0.62, 0, fh + 0.1, d * 0.17);
    for (let i = 0; i < 5; i++) box(g, T(0xf3ecd9), w - 0.06, 0.006, 0.03, 0, fh + 0.141, d * 0.17 - 0.2 + i * 0.2);
    box(g, T(0xf8f4ea), w * 0.62, 0.07, 0.3, 0, fh + 0.1, -d / 2 + 0.28).rotation.x = -0.1;
    teddy(g, T, w * 0.26, fh + 0.1, -d * 0.18, 1.1, 0xc98a8a);
    // Kopfteil mit Ausschnitt, niedriges Fußteil
    box(g, wood, w, h, 0.05, 0, 0, -d / 2 + 0.025);
    box(g, T(0xe8d9bc), w * 0.5, 0.04, 0.052, 0, h - 0.1, -d / 2 + 0.026);
    box(g, wood, w, fh + 0.2, 0.05, 0, 0, d / 2 - 0.025);
    // Rausfallschutz an der offenen Längsseite: Pfosten, Holm und Sprossen
    const x = w / 2 - 0.02;
    const z0 = -d * 0.25;
    const z1 = d * 0.35;
    const rail = fh + 0.28;
    for (const z of [z0, z1]) box(g, wood, 0.04, rail + 0.04, 0.04, x, 0, z);
    box(g, wood, 0.03, 0.04, z1 - z0, x, rail, (z0 + z1) / 2);
    for (let i = 1; i < 5; i++) cyl(g, wood, 0.012, rail - fh - 0.05, x, fh + 0.02, z0 + (i * (z1 - z0)) / 5, 8);
  },

  home_changing({ g, M, w, d, h, T }) {
    const body = M.white;
    const bh = h * 0.82;
    const bd = d - 0.06;
    const zc = -d / 2 + bd / 2;
    box(g, body, w, bh, bd, 0, 0, zc);
    box(g, T(0xe8d9bc), w, 0.03, d, 0, bh, 0);
    for (let i = 0; i < 3; i++) {
      const y = 0.06 + i * ((bh - 0.1) / 3);
      box(g, M.dark, w * 0.94, 0.005, 0.004, 0, y, zc + bd / 2 + 0.002);
      box(g, M.metal, 0.1, 0.014, 0.018, 0, y + (bh - 0.1) / 3 * 0.62, zc + bd / 2 + 0.01);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, T(0xe8d9bc), 0.04, 0.05, 0.04, sx * (w / 2 - 0.05), 0, zc + sz * (bd / 2 - 0.05));
    // Wickelauflage mit Rand
    const top = bh + 0.03;
    const rim = h - top;
    box(g, T(0xe8d9bc), w - 0.04, rim, 0.025, 0, top, d / 2 - 0.02);
    box(g, T(0xe8d9bc), w - 0.04, rim, 0.025, 0, top, -d / 2 + 0.02);
    for (const s of [-1, 1]) box(g, T(0xe8d9bc), 0.025, rim, d - 0.04, s * (w / 2 - 0.02), top, 0);
    box(g, T(0xcfe3ec), w - 0.1, rim * 0.6, d - 0.1, 0, top, 0);
    for (let i = 0; i < 4; i++) box(g, T(0xf3ecd9), 0.04, rim * 0.62, d - 0.12, -w * 0.3 + i * w * 0.2, top, 0);
  },

  home_toy_chest({ g, M, w, d, h, T }) {
    const mint = T(0x8ab8a6);
    const bh = h * 0.58;
    box(g, mint, w, bh, d - 0.02, 0, 0, 0.0);
    box(g, T(0xe8d9bc), w * 1.0, 0.03, 0.03, 0, bh * 0.5, d / 2 + 0.002);
    // Buchstabenwürfel vorn
    for (let i = 0; i < 3; i++) box(g, T([0xe0457b, 0xf2c84b, 0x6fb0d9][i]), 0.05, 0.05, 0.02, -0.08 + i * 0.08, bh * 0.2, d / 2 + 0.008);
    // Spielzeug oben, bevor der Deckel aufliegt
    for (const [x, z, c, s] of [[-w * 0.3, -d * 0.05, 0xe0457b, 0.07], [-w * 0.1, d * 0.1, 0xf2c84b, 0.06], [w * 0.15, -d * 0.1, 0x6fb0d9, 0.065], [w * 0.3, d * 0.08, 0x4aa35a, 0.05]]) box(g, T(c), s, s, s, x, bh, z).rotation.y = x;
    ball(g, T(0xd9534f), 0.045, w * 0.0, bh + 0.045, -d * 0.08, 10);
    teddy(g, T, -w * 0.38, bh, d * 0.05, 0.7);
    // Deckel steht schräg offen
    const lid = new THREE.Group();
    box(lid, mint, w, 0.035, d - 0.02, 0, 0, (d - 0.02) / 2);
    lid.position.set(0, bh, -d / 2 + 0.01);
    lid.rotation.x = -0.25; // am hinteren Rand angelenkt, die Vorderkante hebt sich
    g.add(lid);
  },

  home_tipi({ g, M, w, d, h, T }) {
    const hx = w * 0.45;
    const hz = d * 0.45;
    const ap = [0, h * 0.88, 0];
    const c = { fl: [-hx, 0, hz], fr: [hx, 0, hz], bl: [-hx, 0, -hz], br: [hx, 0, -hz] };
    const cream = T(0xf0e6d0, { side: THREE.DoubleSide });
    const mint = T(0x8ab8a6, { side: THREE.DoubleSide });
    const coral = T(0xe9a07a, { side: THREE.DoubleSide });
    tri(g, mint, c.bl, c.br, ap);
    tri(g, cream, c.fl, c.bl, ap);
    tri(g, cream, c.fr, c.br, ap);
    // Eingang: zwei zurückgeschlagene Bahnen, dazwischen offen
    const ml = [-hx * 0.28, 0, hz];
    const mr = [hx * 0.28, 0, hz];
    tri(g, coral, c.fl, ml, ap);
    tri(g, coral, mr, c.fr, ap);
    // Zierband unten
    for (let i = 0; i < 6; i++) tri(g, coral, [-hx + (i * 2 * hx) / 6 + 0.03, 0.001, -hz * 0.995], [-hx + ((i + 1) * 2 * hx) / 6 - 0.03, 0.001, -hz * 0.995], [-hx + ((i + 0.5) * 2 * hx) / 6, h * 0.12, -hz * 0.995 + 0.01]);
    // Stangen kreuzen sich über der Spitze
    for (const k of Object.values(c)) {
      const end = [k[0] + 1.1 * (ap[0] - k[0]), k[1] + 1.1 * (ap[1] - k[1]) * 1.0, k[2] + 1.1 * (ap[2] - k[2])];
      rod(g, T(0xa97f4a), k, [end[0], Math.min(h - 0.01, end[1]), end[2]], 0.014, 8);
    }
    // Boden, Kissen und Wimpelkette
    box(g, T(0xd9c7a0), hx * 1.8, 0.015, hz * 1.8, 0, 0, 0);
    ball(g, T(0xe9a07a), 0.12, -hx * 0.3, 0.07, -hz * 0.2, 10).scale.set(1.2, 0.5, 1);
    teddy(g, T, hx * 0.25, 0.015, -hz * 0.1, 1.3);
  },

  home_play_kitchen({ g, M, w, d, h, T }) {
    const body = T(0x8ab8a6);
    const wood = T(0xe8d9bc);
    const cy = h * 0.58;
    box(g, body, w, cy, d, 0, 0, 0);
    box(g, wood, w, 0.025, d, 0, cy, 0);
    // Rückwand mit Regalen und Gläsern
    box(g, body, w, h - cy - 0.025, 0.03, 0, cy + 0.025, -d / 2 + 0.015);
    for (const y of [cy + 0.13, cy + 0.23]) box(g, wood, w * 0.7, 0.02, 0.08, -w * 0.12, y, -d / 2 + 0.07);
    for (let i = 0; i < 3; i++) cyl(g, T([0xe0457b, 0xf2c84b, 0x6fb0d9][i]), 0.022, 0.07, -w * 0.3 + i * 0.07, cy + 0.15, -d / 2 + 0.07, 10);
    for (let i = 0; i < 2; i++) box(g, T([0xf3ecd9, 0xe9a07a][i]), 0.06, 0.05, 0.05, -w * 0.12 + i * 0.1, cy + 0.25, -d / 2 + 0.07);
    // Kochfeld mit Topf, Spüle mit Hahn
    for (const [x, z] of [[-w * 0.34, -0.02], [-w * 0.34, 0.08]]) cyl(g, T(0x2a2d31), 0.04, 0.006, x, cy + 0.025, z, 16);
    cyl(g, T(0xc9cdd2, { metalness: 0.5, roughness: 0.4 }), 0.045, 0.05, -w * 0.22, cy + 0.025, 0.03, 14);
    box(g, T(0xc9cdd2, { metalness: 0.5, roughness: 0.4 }), w * 0.28, 0.02, d * 0.6, w * 0.3, cy + 0.025, 0.02);
    rod(g, M.metal, [w * 0.3, cy + 0.045, -d * 0.2], [w * 0.3, cy + 0.14, -d * 0.2], 0.007, 6);
    rod(g, M.metal, [w * 0.3, cy + 0.14, -d * 0.2], [w * 0.3, cy + 0.14, -d * 0.06], 0.007, 6);
    // Ofentür mit Fenster und Griff, Drehknöpfe
    const z = d / 2 + 0.003;
    box(g, wood, w * 0.42, cy * 0.62, 0.012, -w * 0.22, cy * 0.12, z);
    box(g, T(0x2c3036), w * 0.3, cy * 0.34, 0.006, -w * 0.22, cy * 0.26, z + 0.008);
    rod(g, M.metal, [-w * 0.38, cy * 0.66, z + 0.025], [-w * 0.06, cy * 0.66, z + 0.025], 0.007, 6);
    for (let i = 0; i < 4; i++) cyl(g, T([0xe0457b, 0xf2c84b, 0x6fb0d9, 0x4aa35a][i]), 0.017, 0.014, -w * 0.4 + i * 0.075, cy * 0.86, z + 0.01, 10).rotation.x = Math.PI / 2;
    box(g, wood, w * 0.4, cy * 0.7, 0.012, w * 0.3, cy * 0.08, z);
    box(g, T(0xe9a07a), 0.1, 0.014, 0.014, w * 0.3, cy * 0.6, z + 0.012);
  },

  home_rocking_horse({ g, M, w, d, h, T }) {
    const wood = T(0xc98a4a);
    const dark = T(0x8a5a32);
    const R = 0.8;
    const half = Math.asin(Math.min(0.99, d / 2 / R));
    const rx = w / 2 - 0.02;
    const yAt = (z) => R + 0.012 - Math.sqrt(R * R - z * z);
    for (const s of [-1, 1]) arcYZ(g, dark, R, 0.015, Math.PI - half, Math.PI + half, s * rx, R + 0.012, 0, 28);
    // Beine zum Körper
    const by = h * 0.4;
    for (const [dz, dx] of [[-0.2, 1], [-0.2, -1], [0.22, 1], [0.22, -1]]) rod(g, dark, [dx * rx, yAt(dz), dz], [dx * w * 0.2, by, dz * 0.8], 0.015, 8);
    // Körper, Sattel, Hals, Kopf, Ohren, Mähne, Schweif
    ball(g, wood, 1, 0, by + 0.06, -0.02, 14).scale.set(w * 0.32, 0.13, 0.27);
    box(g, T(0xc43a2f), w * 0.5, 0.025, 0.2, 0, by + 0.17, -0.02);
    const hy = h * 0.72;
    const hz = d * 0.3;
    rod(g, wood, [0, by + 0.1, d * 0.17], [0, hy, hz - 0.03], 0.065, 10);
    const head = ball(g, wood, 1, 0, hy + 0.01, hz + 0.03, 12);
    head.scale.set(0.07, 0.085, 0.12);
    head.rotation.x = 0.5;
    ball(g, T(0xf3ecd9), 0.03, 0, hy - 0.04, hz + 0.11, 8);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 6), dark);
      place(g, ear, s * 0.04, hy + 0.1, hz - 0.01);
      ball(g, T(0x1c1e20), 0.011, s * 0.06, hy + 0.03, hz + 0.06, 6);
      // Haltegriffe an den Seiten des Kopfes
      rod(g, T(0xf2c84b), [s * 0.05, hy - 0.01, hz - 0.01], [s * 0.12, hy + 0.01, hz - 0.01], 0.011, 6);
    }
    // Mähne entlang des Halses, Schweif hinten
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      box(g, dark, 0.03, 0.06, 0.035, 0, by + 0.12 + (hy - by - 0.02) * t, d * 0.1 + (hz - d * 0.1 - 0.04) * t).rotation.x = -0.35;
    }
    rod(g, dark, [0, by + 0.06, -0.26], [0, by - 0.1, -d * 0.46], 0.02, 6);
    rod(g, dark, [0.012, by + 0.06, -0.26], [0.025, by - 0.12, -d * 0.44], 0.012, 5);
  },

  home_kids_table({ g, M, w, d, h, T }) {
    const ty = h * 0.78;
    const tw = Math.min(0.55, d * 0.9);
    const mint = T(0x8ab8a6);
    box(g, mint, tw, 0.03, tw, 0, ty - 0.03, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, T(0xe8d9bc), 0.035, ty - 0.03, 0.035, sx * (tw / 2 - 0.04), 0, sz * (tw / 2 - 0.04));
    const cs = Math.min(0.28, d * 0.46);
    const x = tw / 2 + cs / 2 - 0.04;
    kidChair(g, T, -x, 0, Math.PI / 2, h * 0.5, h, cs, 0xf2c84b);
    kidChair(g, T, x, 0, -Math.PI / 2, h * 0.5, h, cs, 0xe9786a);
    // Malblatt, Stifte im Becher
    box(g, T(0xf8f4ea), 0.2, 0.003, 0.28, -tw * 0.12, ty, 0.0).rotation.y = 0.15;
    box(g, T(0xe0457b), 0.12, 0.004, 0.02, -tw * 0.12, ty + 0.003, -0.05).rotation.y = 0.4;
    cyl(g, T(0xf3ecd9), 0.032, 0.07, tw * 0.28, ty, -tw * 0.2, 12);
    for (let i = 0; i < 4; i++) cyl(g, T([0xe0457b, 0xf2c84b, 0x6fb0d9, 0x4aa35a][i]), 0.005, 0.06, tw * 0.28 + (i - 1.5) * 0.012, ty + 0.05, -tw * 0.2, 5);
  },

  home_play_rug({ g, M, w, d, h, T }) {
    const top = h;
    const at = (f) => top * f;
    box(g, T(0x7fae5a), w, at(0.6), d, 0, 0, 0);
    // Fluss und Straßen
    const river = box(g, T(0x6fb0d9), w * 0.16, at(0.7), d * 0.95, w * 0.3, 0, 0);
    river.rotation.y = 0.35;
    const road = T(0x6a6e73);
    const dash = T(0xf3ecd9);
    box(g, road, w * 0.96, at(0.8), d * 0.2, 0, 0, -d * 0.02);
    box(g, road, w * 0.2, at(0.8), d * 0.96, -w * 0.28, 0, 0);
    for (let i = 0; i < 9; i++) box(g, dash, w * 0.06, at(0.9), 0.012, -w * 0.45 + i * w * 0.108, 0, -d * 0.02);
    for (let i = 0; i < 6; i++) box(g, dash, 0.012, at(0.9), d * 0.07, -w * 0.28, 0, -d * 0.45 + i * d * 0.18);
    // Brücke über dem Fluss
    box(g, T(0xc9a06a), w * 0.2, at(0.95), d * 0.22, w * 0.3 - 0.0, 0, -d * 0.02);
    // Häuser, Bäume, Teich und Parkplatz
    const houses = [[-w * 0.05, d * 0.3, 0xd9534f, 0.15], [w * 0.12, d * 0.34, 0xf2c84b, 0.13], [-w * 0.45, d * 0.3, 0x6fb0d9, 0.14], [-w * 0.42, -d * 0.34, 0xe9a07a, 0.16], [-w * 0.1, -d * 0.34, 0xf3ecd9, 0.15]];
    for (const [x, z, c, s] of houses) {
      box(g, T(c), s, at(1), s, x, 0, z);
      box(g, T(0x5a3d28), s * 0.2, at(1) + 0.001, s * 0.3, x, 0, z + s * 0.35);
      box(g, T(0x6fb0d9), s * 0.22, at(1) + 0.001, s * 0.22, x - s * 0.25, 0, z - s * 0.1);
    }
    for (const [x, z] of [[w * 0.12, d * 0.08], [w * 0.4, -d * 0.35], [-w * 0.2, d * 0.1], [w * 0.05, -d * 0.35], [w * 0.44, d * 0.3]]) {
      cyl(g, T(0x3f7a40), 0.05, at(0.95), x, 0, z, 14);
      cyl(g, T(0x56a24c), 0.03, at(1), x, 0, z, 12);
    }
    box(g, T(0x4a4e53), w * 0.18, at(0.8), d * 0.22, w * 0.38, 0, d * 0.28);
    for (let i = 0; i < 4; i++) box(g, dash, 0.01, at(0.9), d * 0.18, w * 0.33 + i * w * 0.04, 0, d * 0.28);
  },

  home_loft_bed({ g, M, w, d, h, T }) {
    const wood = M.wood;
    const bw = 0.95;
    const bx = -w / 2 + bw / 2;
    const dz = d - 0.05;
    const py = h * 0.62;
    const post = 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, wood, post, h, post, bx + sx * (bw / 2 - post / 2), 0, sz * (dz / 2 - post / 2));
    box(g, wood, bw - 0.02, 0.04, dz - 0.04, bx, py - 0.04, 0);
    // Matratze, Bettwäsche, Kissen
    box(g, T(0xf3ecd9), bw - 0.1, 0.12, dz - 0.14, bx, py, 0);
    box(g, T(0x8ab8d0), bw - 0.1, 0.04, (dz - 0.14) * 0.62, bx, py + 0.1, dz * 0.14);
    box(g, T(0xf8f4ea), (bw - 0.1) * 0.62, 0.07, 0.3, bx, py + 0.12, -dz / 2 + 0.26).rotation.x = -0.1;
    teddy(g, T, bx + 0.2, py + 0.12, -dz * 0.15, 1.1, 0xc98a8a);
    // Absturzsicherung: zwei Holme auf Länge und Kopfseite, Fußseite offen für die Leiter
    for (const y of [py + 0.3, py + 0.5]) {
      box(g, wood, 0.025, 0.07, dz - post, bx - bw / 2 + post / 2, y, 0);
      box(g, wood, 0.025, 0.07, dz - post, bx + bw / 2 - post / 2, y, 0);
      box(g, wood, bw - post, 0.07, 0.025, bx, y, -dz / 2 + post / 2);
    }
    // Leiter vorn links
    const lx = bx - bw * 0.18;
    const lz = dz / 2 - 0.01;
    for (const s of [-1, 1]) box(g, wood, 0.04, py + 0.3, 0.03, lx + s * 0.16, 0, lz);
    for (let i = 0; i < 5; i++) box(g, wood, 0.32, 0.03, 0.035, lx, 0.15 + i * ((py - 0.2) / 4), lz);
    // Podest rechts und Rutsche nach vorn
    const sx = w / 2 - 0.25;
    const z0 = -d * 0.28;
    box(g, wood, 0.5, 0.035, 0.45, sx, py - 0.035, z0);
    for (const sz of [-1, 1]) box(g, wood, post, py - 0.04, post, sx + 0.22, 0, z0 + sz * 0.18);
    for (const z of [z0 - 0.2, z0 + 0.2]) box(g, wood, 0.03, 0.2, 0.03, sx + 0.22, py, z);
    box(g, wood, 0.03, 0.06, 0.45, sx + 0.22, py + 0.14, z0);
    box(g, wood, 0.5, 0.06, 0.03, sx, py + 0.14, z0 - 0.21);
    const run = d / 2 - z0 - 0.26;
    const drop = py - 0.03;
    const ang = Math.atan2(drop, run);
    const len = Math.hypot(run, drop);
    const sl = new THREE.Group();
    box(sl, T(0xe9a07a), 0.38, 0.025, len, 0, -0.0125, 0);
    for (const s of [-1, 1]) box(sl, wood, 0.03, 0.07, len, s * 0.205, -0.0125, 0);
    sl.rotation.x = ang;
    sl.position.set(sx, py - 0.04 - drop / 2, z0 + 0.2 + run / 2);
    g.add(sl);
  },
};
