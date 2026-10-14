// Pflanzen und Küchengeräte des Katalogs „Wohnen, Küche, Kamin, Vorhänge“ (siehe furniture-home.js): jedes Modell ist eine
// Funktion mit { g, M, w, d, h, bulbs, T }; Mitte der Grundfläche im Ursprung, Vorderseite nach +z.

import * as THREE from "./vendor/three.module.min.js";
import { SOIL, ball, barX, barZ, box, clamp, cyl, disc, leaf, lathe, place, pot, rnd, rod } from "./home-parts.js";

const GREENS = [0x2f7a3e, 0x3f8f4a, 0x56a24c, 0x24663a, 0x6fae52];
const CREAM = 0xe8e0d0;
const STEEL = { metalness: 0.55, roughness: 0.35 };
const dbl = (T, c, extra = {}) => T(c, { side: THREE.DoubleSide, ...extra });

/** Kleine Topfpflanze (für Regale): kind 0 buschig, 1 Schwertblätter, 2 hängend, 3 Kaktus; Fußpunkt (x, y, z), Größe s (Topf-Radius ≈ 0.045·s). */
function miniPlant(g, M, T, kind, x, y, z, s = 1, i = 0) {
  const pr = 0.045 * s;
  pot(g, M, pr, 0.07 * s, x, y, z, [0xb8643b, CREAM, 0x7a8a8a, 0xd9a93a][i % 4]);
  const top = y + 0.07 * s;
  if (kind === 0) {
    for (let k = 0; k < 4; k++) ball(g, T(GREENS[(k + i) % 5]), pr * (1.2 - k * 0.1), x + (k % 2 ? 1 : -1) * pr * 0.45, top + pr * (0.9 + k * 0.45), z + (k % 3 ? 0.3 : -0.4) * pr, 8);
  } else if (kind === 1) {
    for (let k = 0; k < 7; k++) leaf(g, T(GREENS[(k + i) % 3]), 0.2 * s, 0.032 * s, x + Math.cos(k * 2.4) * pr * 0.4, top, z + Math.sin(k * 2.4) * pr * 0.4, k * 0.9, 1.25 + 0.15 * (k % 3));
  } else if (kind === 2) {
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26;
      rod(g, T(0x4d7a3c), [x + Math.cos(a) * pr * 0.5, top, z + Math.sin(a) * pr * 0.5], [x + Math.cos(a) * pr * 1.9, top - 0.1 * s * (0.6 + 0.3 * (k % 2)), z + Math.sin(a) * pr * 1.9], 0.003, 5);
      for (let j = 1; j <= 3; j++) ball(g, T(GREENS[(k + j) % 5]), 0.016 * s, x + Math.cos(a) * pr * (0.5 + j * 0.45), top - j * 0.03 * s, z + Math.sin(a) * pr * (0.5 + j * 0.45), 6);
    }
  } else {
    cyl(g, T(0x3f7a52), pr * 0.55, 0.1 * s, x, top, z, 10);
    ball(g, T(0x3f7a52), pr * 0.55, x, top + 0.1 * s, z, 8);
    ball(g, T(0xe0457b), 0.012 * s, x, top + 0.1 * s + pr * 0.5, z, 6);
  }
}

/** Palmwedel: Mittelrippe als Bogen von „from“ aus in Richtung yaw (um y; 0 = nach vorn), Fiederblätter paarweise. */
function frond(g, T, from, yaw, len, rise, droop, tone, pairs = 4, lw = 0.04, ll = 0.2) {
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  const at = (s) => [from[0] + ux * len * s, from[1] + rise * s - droop * s * s, from[2] + uz * len * s];
  let prev = at(0);
  for (let k = 1; k <= pairs; k++) {
    const s = k / pairs;
    const p = at(s);
    rod(g, T(0x4a7a3a), prev, p, 0.006, 5);
    const spread = 1.1 - 0.35 * s;
    for (const side of [-1, 1]) leaf(g, T(tone), ll * (1 - 0.45 * Math.abs(s - 0.5)), lw, p[0], p[1], p[2], yaw + side * spread, -0.25 - 0.45 * s);
    prev = p;
  }
  leaf(g, T(tone), ll * 0.9, lw * 0.8, prev[0], prev[1], prev[2], yaw, -0.5);
}

export const PLANTS = {
  home_monstera({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.3, h * 0.24);
    pot(g, M, r * 0.4, ph, 0, 0, 0, CREAM);
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = i * 2.4;
      const rho = r * (0.12 + 0.18 * (1 - t));
      const pitch = -0.2 + 0.7 * t;
      const L = ((r - rho) * 0.95) / Math.cos(pitch);
      const yt = ph + (h - ph - 0.1 - L * Math.sin(Math.max(pitch, 0))) * (0.2 + 0.8 * t);
      const tip = [Math.cos(a) * rho, yt, Math.sin(a) * rho];
      rod(g, T(0x4d7a3c), [Math.cos(a) * 0.02, ph, Math.sin(a) * 0.02], tip, 0.008, 6);
      leaf(g, T(GREENS[i % 4]), L, L * 0.85, tip[0], tip[1], tip[2], Math.PI / 2 - a, pitch, 0.1);
    }
  },

  home_ficus({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.32, h * 0.2);
    pot(g, M, r * 0.42, ph, 0, 0, 0, 0x8a8f94);
    const ty = h * 0.62;
    cyl(g, T(0x6b4a2f), 0.022, ty - ph, 0, ph, 0, 8, 0.03);
    for (const [dx, dz] of [[0.12, 0.05], [-0.1, 0.08], [0.02, -0.12]]) rod(g, T(0x6b4a2f), [0, ty - 0.2, 0], [dx * r * 2, ty + 0.05, dz * r * 2], 0.012, 6);
    const cy = ty + (h - ty) * 0.35;
    const ry = (h - ty) * 0.62;
    const rx = r * 0.86;
    for (let k = 0; k < 4; k++) {
      const b = ball(g, T(GREENS[3 + (k % 2)]), 1, Math.cos(k * 1.7) * rx * 0.3, cy + (k - 1.5) * ry * 0.25, Math.sin(k * 1.7) * rx * 0.3, 10);
      b.scale.set(rx * 0.5, ry * 0.4, rx * 0.5);
    }
    for (let i = 0; i < 84; i++) {
      const u = rnd(i * 3 + 1) * 2 - 1;
      const a = rnd(i * 3 + 2) * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      const px = Math.cos(a) * k * rx * 0.78;
      const pz = Math.sin(a) * k * rx * 0.78;
      const py = cy + u * ry * 0.8;
      leaf(g, T(GREENS[i % 5]), 0.15, 0.085, px, py, pz, Math.PI / 2 - a + (rnd(i) - 0.5) * 0.8, 0.3 + u * 0.4 + (rnd(i + 9) - 0.5) * 0.5, 0.2);
    }
  },

  home_kentia({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.36, h * 0.2);
    pot(g, M, r * 0.36, ph, 0, 0, 0, 0x5a5048);
    // Stiele wachsen ein Stück senkrecht, dann bogen die Wedel nach außen und hängen etwas
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785 + 0.3;
      const reach = r * 0.1;
      const baseTop = ph + (h - ph) * (0.42 + 0.14 * rnd(i + 2));
      rod(g, T(0x6b7a3a), [0, ph, 0], [Math.cos(a) * reach, baseTop, Math.sin(a) * reach], 0.012, 6);
      const ll = Math.min(0.28, r * 0.5);
      const up = i % 4 === 0; // jeder vierte Wedel steht steil, die anderen bogen weit aus
      const len = (r - reach - ll * 0.6) * (up ? 0.5 : 0.92);
      const rise = (h - baseTop) * (up ? 1.0 : 0.85);
      frond(g, T, [Math.cos(a) * reach, baseTop, Math.sin(a) * reach], Math.PI / 2 - a, len, rise, rise * (up ? 0.25 : 0.55 + 0.25 * (i % 2)), GREENS[(i % 3) + 1], 5, 0.05, ll);
    }
  },

  home_cactus({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.14, h * 0.22);
    pot(g, M, r * 0.62, ph, 0, 0, 0, 0xb8643b);
    const green = T(0x3f7a52);
    const cr = r * 0.36;
    const top = h - cr * 0.6;
    cyl(g, green, cr, top - ph, 0, ph, 0, 12);
    ball(g, green, cr, 0, top, 0, 12);
    for (const s of [-1, 1]) {
      const ay = ph + (top - ph) * (s < 0 ? 0.42 : 0.56);
      const ax = r * 0.62;
      barX(g, green, cr * 0.6, ax, s * (cr * 0.4 + ax / 2), ay, 0, 10);
      cyl(g, green, cr * 0.6, (top - ph) * 0.3, s * (cr * 0.4 + ax), ay - cr * 0.6, 0, 10);
      ball(g, green, cr * 0.6, s * (cr * 0.4 + ax), ay - cr * 0.6 + (top - ph) * 0.3, 0, 10);
    }
    // Blüte oben, helle Stacheln als Punktreihen
    ball(g, T(0xe0457b), cr * 0.5, 0, h - cr * 0.3, 0, 8);
    for (let i = 0; i < 12; i++) ball(g, T(0xf0e6c0), 0.006, Math.cos(i * 1.7) * cr, ph + (top - ph) * rnd(i), Math.sin(i * 1.7) * cr, 4);
  },

  home_snake_plant({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.2, h * 0.26);
    pot(g, M, r * 0.62, ph, 0, 0, 0, 0x6a7478);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4;
      const rho = r * 0.3 * rnd(i + 2);
      const L = (h - ph - 0.01) * (0.72 + 0.28 * rnd(i + 5));
      leaf(g, T(i % 3 ? 0x2f5d3a : 0x5a8a4a), L, 0.075, Math.cos(a) * rho, ph, Math.sin(a) * rho, Math.PI / 2 - a, 1.3 + 0.25 * rnd(i + 7), 0.14);
    }
  },

  home_orchid({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.1, h * 0.2);
    pot(g, M, r * 0.5, ph, 0, 0, 0, 0xf2eee6);
    for (let i = 0; i < 4; i++) leaf(g, T(GREENS[i % 3]), r * 1.05, r * 0.5, 0, ph, 0, i * 1.57 + 0.3, 0.35 + 0.1 * (i % 2), 0.12);
    const pts = [[0, ph], [0.012, h * 0.5], [0.04, h * 0.78], [0.075, h * 0.9]].map(([x, y]) => [x - 0.02, y, 0]);
    for (let i = 0; i < 3; i++) rod(g, T(0x5a7a3c), pts[i], pts[i + 1], 0.004, 5);
    for (let i = 0; i < 7; i++) {
      const s = 0.3 + (0.7 * i) / 6;
      const p = [pts[1][0] + (pts[3][0] - pts[1][0]) * s * 0.9, h * (0.46 + 0.5 * s) - 0.03, ((i % 2) - 0.5) * 0.045];
      const f = ball(g, T(i % 3 ? 0xf6f0f4 : 0xe6a8c8), Math.min(r * 0.4, 0.032) - 0.002 * i, p[0], p[1], p[2], 8);
      f.scale.z = 0.35;
      f.rotation.y = (i % 2 ? -1 : 1) * 0.7;
      ball(g, T(0xc43a8a), 0.011, p[0] + (i % 2 ? -0.008 : 0.008), p[1], p[2] + 0.01, 5);
    }
    rod(g, T(0xc9a06a), [-0.02, ph, 0.03], [0.03, h * 0.82, 0.03], 0.003, 4);
  },

  home_hanging({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const bowlY = h * 0.3;
    const bowlH = Math.min(0.14, h * 0.18);
    const bowlR = r * 0.55;
    cyl(g, T(0x4a4540), 0.02, 0.012, 0, h - 0.012, 0, 10);
    lathe(g, dbl(T, 0xe8e0d0), [[0.001, 0], [bowlR * 0.5, 0], [bowlR, bowlH * 0.8], [bowlR * 1.05, bowlH], [bowlR * 0.95, bowlH]], 0, bowlY, 0, 20);
    cyl(g, T(SOIL), bowlR * 0.94, 0.01, 0, bowlY + bowlH * 0.9, 0, 16);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.4;
      rod(g, T(0xc9b48a), [Math.cos(a) * bowlR * 1.0, bowlY + bowlH, Math.sin(a) * bowlR * 1.0], [0, h - 0.015, 0], 0.003, 5);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.2;
      const top = [Math.cos(a) * bowlR * 0.8, bowlY + bowlH, Math.sin(a) * bowlR * 0.8];
      const len = (bowlY + bowlH - 0.02) * (0.65 + 0.35 * rnd(i + 3));
      const end = [Math.cos(a) * (r * 0.9), bowlY + bowlH - len, Math.sin(a) * (r * 0.9)];
      rod(g, T(0x4d7a3c), top, end, 0.003, 5);
      for (let j = 1; j <= 6; j++) {
        const s = j / 6.5;
        ball(g, T(GREENS[(i + j) % 5]), 0.028, top[0] + (end[0] - top[0]) * s, top[1] + (end[1] - top[1]) * s, top[2] + (end[2] - top[2]) * s, 6).scale.y = 0.6;
      }
    }
    for (let i = 0; i < 6; i++) ball(g, T(GREENS[i % 5]), bowlR * 0.5, Math.cos(i * 1.05) * bowlR * 0.4, bowlY + bowlH + bowlR * 0.2, Math.sin(i * 1.05) * bowlR * 0.4, 8);
  },

  home_herbs({ g, M, w, d, h, T }) {
    box(g, M.wood, w, 0.015, d, 0, 0, 0);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      const pr = Math.min(w / n, d) * 0.4;
      pot(g, M, pr, 0.07, x, 0.015, 0, [0xb8643b, CREAM, 0x7a8a8a][i]);
      const top = 0.085;
      if (i === 0) {
        // Basilikum: runde Blätter in Etagen
        for (let k = 0; k < 8; k++) leaf(g, T(GREENS[(k % 3) + 1]), pr * 1.3, pr * 1.1, Math.cos(k * 2.1) * pr * 0.2 + x, top + 0.02 * (k % 4) + 0.025 * Math.floor(k / 4), Math.sin(k * 2.1) * pr * 0.2, k * 0.8, 0.5, 0.15);
        rod(g, T(0x4d7a3c), [x, top, 0], [x, top + 0.1, 0], 0.004, 5);
      } else if (i === 1) {
        // Schnittlauch: viele dünne Halme
        for (let k = 0; k < 16; k++) leaf(g, T(0x3f8f4a), h - top - 0.02, 0.012, x + Math.cos(k * 2.4) * pr * 0.55, top, Math.sin(k * 2.4) * pr * 0.55, k * 0.9, 1.45 + 0.1 * rnd(k), 0.6);
      } else {
        // Petersilie: krause Kugeln
        for (let k = 0; k < 5; k++) ball(g, T(GREENS[(k % 2) + 3]), pr * 0.62, x + Math.cos(k * 1.26) * pr * 0.55, top + pr * 0.5 + 0.015 * (k % 2), Math.sin(k * 1.26) * pr * 0.55, 8);
      }
      // Schildchen
      box(g, T(0xf3ecd9), 0.03, 0.04, 0.003, x, 0.015 + 0.02, pr + 0.002);
    }
  },

  home_olive({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = Math.min(0.4, h * 0.24);
    pot(g, M, r * 0.5, ph, 0, 0, 0, 0x8a8f94);
    const ty = h * 0.58;
    const bark = T(0x7a6a58);
    for (const [dx, dz] of [[0.02, 0.0], [-0.025, 0.02], [0.0, -0.025]]) rod(g, bark, [dx, ph, dz], [dx * 3, ty, dz * 3], 0.026, 7);
    for (const [dx, dz, up] of [[0.14, 0.06, 0.2], [-0.13, 0.09, 0.18], [0.04, -0.15, 0.22]]) rod(g, bark, [0, ty - 0.15, 0], [dx * r * 2.2, ty + up, dz * r * 2.2], 0.014, 6);
    const cy = ty + (h - ty) * 0.42;
    const ry = (h - ty) * 0.55;
    const rx = r * 0.86;
    for (let k = 0; k < 4; k++) {
      const b = ball(g, T(0x6f8a62), 1, Math.cos(k * 1.3) * rx * 0.4, cy + (k % 3 - 1) * ry * 0.35, Math.sin(k * 1.3) * rx * 0.4, 10);
      b.scale.set(rx * 0.4, ry * 0.32, rx * 0.4);
    }
    for (let i = 0; i < 130; i++) {
      const u = rnd(i * 3 + 1) * 2 - 1;
      const a = rnd(i * 3 + 2) * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      leaf(g, T([0x8aa07a, 0x6f8a62, 0xa4b890][i % 3]), 0.13, 0.03, Math.cos(a) * k * rx * 0.8, cy + u * ry * 0.85, Math.sin(a) * k * rx * 0.8, Math.PI / 2 - a + (rnd(i) - 0.5) * 1.4, u * 0.5 + (rnd(i + 4) - 0.5) * 0.9, 0.3);
    }
    for (let i = 0; i < 8; i++) ball(g, T(i % 3 ? 0x4a5a38 : 0x3a2f4a), 0.014, Math.cos(i * 2.2) * rx * 0.7, cy + (rnd(i) - 0.5) * ry * 1.2, Math.sin(i * 2.2) * rx * 0.7, 6);
  },

  home_plant_shelf({ g, M, w, d, h, T }) {
    const wood = M.wood;
    const t = 0.035;
    for (const s of [-1, 1]) box(g, wood, t, h, d, s * (w / 2 - t / 2), 0, 0);
    const levels = [0.027, 0.267, 0.5, 0.733].map((f) => f * h);
    levels.forEach((y) => box(g, wood, w - 2 * t, 0.03, d, 0, y, 0));
    box(g, wood, w - 2 * t, 0.06, 0.02, 0, h - 0.06, -d / 2 + 0.01);
    box(g, wood, w - 2 * t, 0.03, 0.02, 0, levels[1] + 0.1, -d / 2 + 0.01);
    // je Regalboden drei Töpfe unterschiedlicher Art, die Größe passt zum Abstand darüber
    levels.forEach((y, li) => {
      const room = (levels[li + 1] ?? h) - y - 0.03;
      const sc = clamp(room / 0.3, 0.7, 1.15);
      const kinds = [[0, 1, 2], [2, 0, 3], [1, 3, 0], [3, 2, 1]][li];
      kinds.forEach((kind, k) => miniPlant(g, M, T, kind, -w * 0.28 + k * w * 0.28, y + 0.03, ((k % 2) - 0.5) * d * 0.2, sc, li + k));
    });
  },

  home_plant_stand({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const wood = T(0x8a5a32);
    const topY = h * 0.5;
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + Math.PI / 4;
      rod(g, wood, [Math.cos(a) * r * 0.55, topY, Math.sin(a) * r * 0.55], [Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95], 0.014, 8);
    }
    cyl(g, wood, r * 0.78, 0.025, 0, topY - 0.025, 0, 24);
    const pr = r * 0.62;
    const ph = Math.min(0.16, h * 0.2);
    lathe(g, dbl(T, 0xd9d2c3), [[0.001, 0], [pr * 0.7, 0], [pr, ph * 0.85], [pr * 1.04, ph], [pr * 0.94, ph]], 0, topY, 0, 20);
    cyl(g, T(SOIL), pr * 0.92, 0.01, 0, topY + ph * 0.92, 0, 16);
    const top = topY + ph;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      leaf(g, T(GREENS[i % 4]), Math.min(0.2, r - 0.04), 0.13, Math.cos(a) * 0.03, top, Math.sin(a) * 0.03, Math.PI / 2 - a, 0.7 + 0.3 * rnd(i), 0.12);
    }
  },
};

/** Tasse (weiß, Henkel nach rechts) für Küchenszenen. */
function mug(g, T, x, y, z, color = 0xf4efe4, r = 0.035, hh = 0.08) {
  cyl(g, T(color), r, hh, x, y, z, 14);
  cyl(g, T(0x3a2418), r * 0.85, 0.003, x, y + hh - 0.002, z, 14);
  const hnd = new THREE.Mesh(new THREE.TorusGeometry(hh * 0.28, 0.006, 6, 10, Math.PI), T(color));
  hnd.rotation.z = -Math.PI / 2;
  place(g, hnd, x + r, y + hh * 0.5, z);
}

/** Flasche: Körper, Hals, Verschluss; Fußpunkt (x, y, z). */
function bottle(g, T, color, x, y, z, r = 0.035, hh = 0.2, cap = 0xd9a93a) {
  cyl(g, T(color, { transparent: true, opacity: 0.85 }), r, hh * 0.62, x, y, z, 12);
  cyl(g, T(color, { transparent: true, opacity: 0.85 }), r * 0.35, hh * 0.38, x, y + hh * 0.62, z, 10, r * 0.38);
  cyl(g, T(cap), r * 0.4, hh * 0.04, x, y + hh * 0.96, z, 8);
  box(g, T(0xf0e6cf), r * 1.1, hh * 0.18, 0.003, x, y + hh * 0.15, z + r * 0.95);
}

export const KITCHEN = {
  home_coffee_auto({ g, M, w, d, h, T }) {
    const dark = T(0x30343a);
    box(g, M.metal, w * 0.9, 0.02, d * 0.34, 0, 0, d * 0.28);
    for (let i = 0; i < 7; i++) box(g, M.dark, w * 0.84, 0.004, 0.006, 0, 0.021, d * 0.14 + i * (d * 0.28) / 6);
    box(g, dark, w, h * 0.78, d * 0.78, 0, 0.03, -d * 0.11);
    // Bohnenbehälter mit Deckel
    box(g, T(0x4a3426, { transparent: true, opacity: 0.85 }), w * 0.7, h * 0.12, d * 0.4, 0, 0.03 + h * 0.78, -d * 0.28);
    box(g, dark, w * 0.74, 0.015, d * 0.44, 0, 0.03 + h * 0.9, -d * 0.28);
    // Bedienfeld
    box(g, M.screen, w * 0.36, h * 0.09, 0.006, -w * 0.18, h * 0.66, d * 0.28 + 0.003);
    for (let i = 0; i < 3; i++) ball(g, M.metal, 0.011, w * 0.12 + i * w * 0.14, h * 0.7, d * 0.28 + 0.006, 6).scale.z = 0.4;
    // Auslauf und Tasse
    box(g, M.metal, w * 0.3, h * 0.07, d * 0.16, 0, h * 0.5, d * 0.2);
    cyl(g, M.metal, 0.008, 0.03, 0, h * 0.47, d * 0.24, 8);
    cyl(g, T(0xf4efe4), 0.035, 0.07, 0, 0.02, d * 0.24, 14);
    cyl(g, T(0x3a2418), 0.03, 0.003, 0, 0.088, d * 0.24, 14);
    // Wassertank an der Seite
    box(g, T(0x9fc3d6, { transparent: true, opacity: 0.55 }), 0.01, h * 0.52, d * 0.3, w / 2 + 0.002 - 0.012, 0.05, -d * 0.2);
  },

  home_espresso({ g, M, w, d, h, T }) {
    const steel = T(0xc9cdd2, STEEL);
    box(g, T(0x2a2d31), w, 0.03, d, 0, 0, 0);
    for (let i = 0; i < 6; i++) box(g, M.dark, w * 0.5, 0.004, 0.006, 0, 0.031, d * 0.2 + i * 0.03);
    box(g, steel, w, h * 0.78, d * 0.62, 0, 0.03, -d * 0.18);
    box(g, steel, w * 0.96, 0.012, d * 0.62, 0, 0.03 + h * 0.78, -d * 0.18);
    // Tassenwärmer-Reling
    for (const x of [-w * 0.42, w * 0.42]) rod(g, M.metal, [x, 0.03 + h * 0.79, -d * 0.05], [x, 0.03 + h * 0.79 + 0.015, -d * 0.4], 0.004, 5);
    // Brühgruppe, Siebträger, Tasse
    cyl(g, M.metal, 0.034, 0.05, 0, h * 0.5, d * 0.16, 14);
    cyl(g, T(0x1f1c1a), 0.03, 0.028, 0, h * 0.5 - 0.028, d * 0.16, 14);
    rod(g, T(0x1f1c1a), [0, h * 0.5 - 0.016, d * 0.16], [w * 0.2, h * 0.5 - 0.016, d * 0.42], 0.011, 8);
    cyl(g, T(0xf4efe4), 0.03, 0.055, 0, 0.03, d * 0.2, 14);
    // Manometer und Drehknöpfe
    disc(g, T(0xf4efe4), 0.026, -w * 0.22, h * 0.6, d * 0.13 + 0.003, 0.006, 16);
    disc(g, M.dark, 0.02, -w * 0.22, h * 0.6, d * 0.13 + 0.008, 0.003, 16);
    for (const x of [w * 0.2, w * 0.34]) cyl(g, M.dark, 0.016, 0.02, x, h * 0.62, d * 0.13 + 0.02, 10).rotation.x = Math.PI / 2;
    // Dampflanze
    rod(g, M.metal, [-w / 2 + 0.012, h * 0.45, d * 0.12], [-w / 2 + 0.012, h * 0.2, d * 0.2], 0.006, 6);
    rod(g, M.metal, [-w / 2 + 0.012, h * 0.2, d * 0.2], [-w / 2 + 0.03, h * 0.1, d * 0.32], 0.005, 6);
  },

  home_microwave({ g, M, w, d, h, T }) {
    const body = T(0xe8e6e0);
    box(g, body, w, h - 0.015, d, 0, 0.015, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.dark, 0.012, 0.015, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 8);
    const z = d / 2 + 0.003;
    box(g, T(0x15191d, { roughness: 0.15 }), w * 0.62, h * 0.74, 0.006, -w * 0.15, h * 0.13 + 0.015, z);
    box(g, T(0x2c3036), w * 0.58, h * 0.7, 0.003, -w * 0.15, h * 0.15 + 0.015, z + 0.004);
    box(g, M.metal, 0.014, h * 0.62, 0.016, w * 0.18, h * 0.17 + 0.015, z + 0.01);
    // Bedienfeld rechts: Anzeige, Tasten, Drehknopf
    box(g, M.screen, w * 0.14, h * 0.14, 0.004, w * 0.34, h * 0.66, z);
    for (let i = 0; i < 6; i++) box(g, M.dark, w * 0.05, h * 0.06, 0.004, w * 0.3 + (i % 2) * w * 0.08, h * 0.5 - Math.floor(i / 2) * h * 0.1, z);
    cyl(g, M.metal, 0.02, 0.02, w * 0.34, h * 0.14, z + 0.004, 14).rotation.x = Math.PI / 2;
  },

  home_kettle({ g, M, w, d, h, T }) {
    const R = Math.min(w, d) * 0.46;
    cyl(g, T(0x2a2d31), R, 0.022, 0, 0, 0, 20);
    cyl(g, T(0xc9cdd2, STEEL), R * 0.9, (h - 0.04) * 0.82, 0, 0.022, 0, 22, R * 0.74);
    cyl(g, T(0x2a2d31), R * 0.74, 0.02, 0, 0.022 + (h - 0.04) * 0.82, 0, 22);
    ball(g, T(0x2a2d31), R * 0.22, 0, h - 0.012, 0, 8);
    cyl(g, T(0x2a2d31), R * 0.74, 0.014, 0, h - 0.04, 0, 22);
    // Ausguss nach vorn, Griff hinten
    const spout = box(g, T(0xc9cdd2, STEEL), R * 0.4, h * 0.2, R * 0.55, 0, h * 0.6, R * 0.86);
    spout.rotation.x = 0.35;
    const hnd = new THREE.Mesh(new THREE.TorusGeometry(h * 0.3, 0.012, 6, 14, Math.PI * 1.1), T(0x2a2d31));
    hnd.rotation.y = Math.PI / 2;
    hnd.rotation.z = Math.PI * 0.45;
    place(g, hnd, 0, h * 0.5, -R * 0.8);
    box(g, T(0x9fc3d6, { transparent: true, opacity: 0.55 }), 0.014, h * 0.55, 0.004, R * 0.62, 0.05, R * 0.62).rotation.y = 0.8;
  },

  home_toaster({ g, M, w, d, h, T }) {
    const body = T(0xd9d6cf, STEEL);
    const bw = w - 0.02; // Hebel an der Seite ragen 1 cm heraus
    box(g, body, bw, h * 0.76, d, 0, 0.01, 0);
    box(g, M.dark, bw * 0.96, 0.01, d * 0.96, 0, 0, 0);
    for (const x of [-bw * 0.2, bw * 0.2]) {
      box(g, T(0x15191d), bw * 0.3, 0.004, d * 0.78, x, 0.01 + h * 0.76, 0);
      if (x < 0) box(g, T(0xd9a96a), bw * 0.26, h * 0.22, d * 0.08, x, 0.01 + h * 0.7, 0);
    }
    // Hebel, Röstgrad-Regler
    box(g, M.dark, 0.022, 0.016, 0.016, bw / 2 + 0.008, h * 0.5, d * 0.1);
    cyl(g, M.dark, 0.018, 0.02, bw * 0.36, h * 0.45, d / 2 + 0.01 - 0.0, 12).rotation.x = Math.PI / 2;
    cyl(g, M.dark, 0.018, 0.02, -bw * 0.36, h * 0.45, d / 2 + 0.01, 12).rotation.x = Math.PI / 2;
  },

  home_stand_mixer({ g, M, w, d, h, T }) {
    const body = T(0xe4ddcc);
    box(g, body, w * 0.86, 0.04, d * 0.82, 0, 0, -d * 0.05);
    box(g, body, w * 0.46, h * 0.76, d * 0.3, 0, 0.03, -d * 0.36);
    // Kopf mit Rührwerk und Schalter
    box(g, body, w * 0.5, h * 0.2, d * 0.78, 0, h * 0.78, -d * 0.1);
    ball(g, body, w * 0.25, 0, h * 0.88, d * 0.3, 10).scale.set(1, 0.7, 0.8);
    box(g, M.dark, 0.03, 0.012, 0.02, w * 0.26, h * 0.86, -d * 0.32);
    cyl(g, M.metal, 0.012, 0.025, 0, h * 0.745, d * 0.26, 8);
    // Schüssel und Schneebesen
    lathe(g, dbl(T, 0xc9cdd2, STEEL), [[0.001, 0], [w * 0.17, 0], [w * 0.3, h * 0.18], [w * 0.34, h * 0.36], [w * 0.35, h * 0.4], [w * 0.32, h * 0.4]], 0, 0.04, d * 0.26, 24);
    rod(g, M.metal, [0, h * 0.745, d * 0.26], [0, h * 0.42, d * 0.26], 0.007, 6);
    for (const dx of [-0.025, 0.025]) rod(g, M.metal, [0, h * 0.46, d * 0.26], [dx, h * 0.18, d * 0.26], 0.004, 5);
  },

  home_hood_wall({ g, M, w, d, h, bulbs, T }) {
    const steel = T(0xc9cdd2, STEEL);
    const ch = h * 0.22;
    box(g, steel, w, ch, d, 0, 0, 0);
    box(g, steel, w * 0.96, ch * 0.5, d * 0.1, 0, 0, d / 2 + 0.002);
    box(g, steel, w * 0.5, h - ch, d * 0.5, 0, ch, -d * 0.25);
    box(g, steel, w * 0.54, 0.02, d * 0.54, 0, ch, -d * 0.23);
    for (let i = 0; i < 6; i++) box(g, M.dark, w * 0.8, 0.005, 0.005, 0, ch * 0.18 + i * 0.012, d / 2 + 0.005);
    for (let i = 0; i < 3; i++) box(g, M.dark, 0.018, 0.012, 0.006, -w * 0.12 + i * 0.045, ch * 0.7, d / 2 + 0.006);
    for (const x of [-w * 0.25, w * 0.25]) bulbs.push(cyl(g, M.bulb, 0.03, 0.006, x, -0.001, d * 0.05, 14));
  },

  home_hood_island({ g, M, w, d, h, bulbs, T }) {
    const steel = T(0xc9cdd2, STEEL);
    const ch = 0.1;
    box(g, steel, w, ch, d, 0, 0, 0);
    box(g, steel, w * 0.82, ch * 0.7, d * 0.82, 0, ch, 0);
    box(g, steel, w * 0.34, h - ch * 1.7, d * 0.34, 0, ch * 1.7, 0);
    box(g, T(0x9aa0a6), w * 0.4, 0.03, d * 0.4, 0, h - 0.03, 0);
    for (const x of [-w * 0.3, 0, w * 0.3]) bulbs.push(cyl(g, M.bulb, 0.03, 0.006, x, -0.001, 0, 14));
    for (let i = 0; i < 5; i++) box(g, M.dark, w * 0.8, 0.004, 0.004, 0, 0.02 + i * 0.016, d / 2 + 0.002);
  },

  home_oven_tall({ g, M, w, d, h, T }) {
    const k = h / 2.1; // Aufteilung für 2,10 m geplant, bei anderer Höhe mitgeskaliert
    const Y = (v) => v * k;
    box(g, M.white, w, h, d, 0, 0, 0);
    const z = d / 2 + 0.004;
    const glass = T(0x15191d, { roughness: 0.15 });
    const frame = T(0x2c3036);
    const fuge = (y) => box(g, M.dark, w * 0.96, 0.005, 0.004, 0, Y(y), z);
    box(g, M.dark, w * 0.96, Y(0.08), 0.004, 0, 0, z - 0.002);
    // Schublade unten
    fuge(0.83);
    box(g, M.metal, w * 0.5, 0.014, 0.025, 0, Y(0.75), z + 0.012);
    // Backofen: Glastür mit Griffstange, darüber Bedienblende
    box(g, glass, w * 0.92, Y(0.64), 0.008, 0, Y(0.87), z);
    box(g, frame, w * 0.84, Y(0.5), 0.003, 0, Y(0.92), z + 0.006);
    rod(g, M.metal, [-w * 0.4, Y(1.45), z + 0.04], [w * 0.4, Y(1.45), z + 0.04], 0.012, 8);
    for (const x of [-w * 0.4, w * 0.4]) rod(g, M.metal, [x, Y(1.45), z + 0.005], [x, Y(1.45), z + 0.04], 0.008, 6);
    box(g, frame, w * 0.92, Y(0.08), 0.006, 0, Y(1.53), z);
    box(g, M.screen, w * 0.26, Y(0.035), 0.004, 0, Y(1.555), z + 0.004);
    for (const x of [-w * 0.36, -w * 0.22, w * 0.22, w * 0.36]) cyl(g, M.metal, 0.018, 0.02, x, Y(1.57), z + 0.01, 12).rotation.x = Math.PI / 2;
    // zweites Gerät (Dampfgarer) mit kleiner Glastür, oben eine Schranktür
    fuge(1.63);
    box(g, glass, w * 0.92, Y(0.3), 0.008, 0, Y(1.65), z);
    box(g, frame, w * 0.84, Y(0.22), 0.003, 0, Y(1.69), z + 0.006);
    box(g, M.metal, w * 0.5, 0.014, 0.02, 0, Y(1.935), z + 0.01);
    fuge(1.97);
    box(g, M.dark, 0.012, Y(0.1), 0.012, w * 0.4, Y(2.0), z + 0.008);
  },

  home_wine_fridge({ g, M, w, d, h, T }) {
    const steel = T(0xc9cdd2, STEEL);
    const t = 0.03;
    const zf = d / 2;
    // Gehäuse als Schale: durch die Glastür sieht man Böden und Flaschen
    for (const s of [-1, 1]) box(g, steel, t, h, d, s * (w / 2 - t / 2), 0, 0);
    box(g, steel, w, 0.07, d, 0, h - 0.07, 0);
    box(g, M.dark, w, 0.05, d, 0, 0, 0);
    box(g, T(0x1c2024), w - 2 * t, h - 0.12, 0.01, 0, 0.05, -d / 2 + 0.005);
    const fh = h - 0.12;
    const len = d * 0.7;
    const colors = [0x2f4a2f, 0x3a2418, 0x2f4a2f, 0x4a2f2a, 0x2f4a2f];
    for (let r = 0; r < 3; r++) {
      const y = 0.05 + (r * fh) / 3;
      box(g, M.wood, w - 2 * t, 0.014, d - 0.04, 0, y, 0);
      for (let i = 0; i < 5; i++) barZ(g, T(colors[(i + r) % 5], { roughness: 0.4 }), 0.036, len, -(w - 2 * t) / 2 + ((i + 0.5) * (w - 2 * t)) / 5, y + 0.014 + 0.036, -d / 2 + 0.02 + len / 2, 10);
    }
    // Tür: Rahmen, Glas, Griff; Anzeige in der Blende
    const df = zf - 0.01;
    box(g, steel, w - 2 * t, 0.03, 0.02, 0, 0.05 + fh - 0.03, df);
    box(g, steel, w - 2 * t, 0.03, 0.02, 0, 0.05, df);
    for (const s of [-1, 1]) box(g, steel, 0.03, fh - 0.06, 0.02, s * (w / 2 - t - 0.015), 0.08, df);
    box(g, M.glass, w - 2 * t - 0.06, fh - 0.06, 0.008, 0, 0.08, df);
    box(g, M.metal, 0.014, fh * 0.6, 0.02, w / 2 - t - 0.045, 0.05 + fh * 0.2, zf + 0.012);
    box(g, M.screen, w * 0.14, 0.02, 0.004, -w * 0.3, h - 0.05, zf + 0.002);
  },

  home_spice_rack({ g, M, w, d, h, T }) {
    box(g, M.wood, w, h, 0.015, 0, 0, -d / 2 + 0.0075);
    const cols = [0xb04a3a, 0xd0a23a, 0x7a5230, 0x4f7a4c, 0xe08a3a, 0xe8dcc0, 0x5a3a2a, 0x8a3b4a];
    for (let r = 0; r < 2; r++) {
      const y = r * (h / 2);
      box(g, M.wood, w, 0.02, d, 0, y, 0);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        const jr = Math.min(0.028, (w / n) * 0.42);
        const jh = (h / 2 - 0.04) * (0.85 + 0.15 * rnd(i + r * 7));
        cyl(g, T(cols[(i + r * 3) % cols.length]), jr, jh * 0.78, x, y + 0.02, 0.005, 12);
        cyl(g, M.dark, jr * 1.02, jh * 0.2, x, y + 0.02 + jh * 0.78, 0.005, 12);
        box(g, T(0xf3ecd9), jr * 1.4, jh * 0.3, 0.003, x, y + 0.02 + jh * 0.2, jr * 0.95 + 0.005);
      }
    }
    box(g, M.wood, w, 0.02, d, 0, h - 0.02, 0);
  },

  home_fruit_bowl({ g, M, w, d, h, T }) {
    const R = Math.min(w, d) / 2;
    lathe(g, dbl(T, 0xb08a52), [[0.001, 0], [R * 0.4, 0], [R * 0.9, h * 0.38], [R, h * 0.5], [R * 0.94, h * 0.5], [R * 0.85, h * 0.36]], 0, 0, 0, 24);
    const fruits = [[0xd33f2f, 0.3, 0.1, 0.0, 1], [0xe8a03a, -0.25, 0.1, 0.1, 1], [0xe8c42a, 0.05, -0.28, 0.1, 0.95], [0x8aa63a, -0.05, 0.28, -0.1, 1], [0xd33f2f, -0.1, -0.05, 0.0, 1.05], [0xe8a03a, 0.25, 0.3, 0.1, 0.95], [0xe8c42a, 0.0, 0.1, 0.17, 0.9]];
    fruits.forEach(([c, fx, fz, up, s]) => {
      const fr = R * 0.3 * s;
      const f = ball(g, T(c), fr, fx * R * 1.3, h * 0.42 + fr * 0.55 + up * R * 0.6, fz * R * 1.3, 10);
      f.scale.y = c === 0xe8c42a ? 1.15 : 0.95;
    });
    // ein Stiel am roten Apfel
    rod(g, M.wood, [0.3 * R * 1.3, h * 0.42 + R * 0.3 * 1.5, 0.0], [0.3 * R * 1.3 + 0.01, h * 0.42 + R * 0.3 * 1.5 + 0.03, 0.0], 0.003, 4);
  },

  home_bread_bin({ g, M, w, d, h, T }) {
    const enamel = T(0xe6dfc8);
    const bh = h * 0.62;
    box(g, enamel, w, bh, d, 0, 0, 0);
    box(g, T(0x3a3a3a), w * 1.005, 0.012, d * 1.005, 0, bh - 0.006, 0);
    // gewölbter Deckel: halber Zylinder entlang x (Wölbung nach oben)
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w * 0.98, 20, 1, false, 0, Math.PI), enamel);
    lid.rotation.z = Math.PI / 2;
    lid.scale.x = (h - bh) / (d / 2);
    place(g, lid, 0, bh, 0);
    ball(g, M.metal, 0.014, 0, h - 0.012, 0, 8);
    box(g, T(0xc43a2f), w * 0.3, bh * 0.2, 0.004, 0, bh * 0.4, d / 2 + 0.003);
  },

  home_knife_block({ g, M, w, d, h, T }) {
    const R = Math.min(w * 0.18, d * 0.45);
    // Utensilientopf links
    cyl(g, T(0xd9d2c3), R, h * 0.4, -w * 0.28, 0, 0, 16);
    const tools = [[0.0, 0.0, 0.95, 0xc9a06a, 0], [0.5, 0.4, 0.82, 0x333333, 1], [-0.4, 0.5, 0.88, 0xc9a06a, 2], [0.3, -0.6, 0.78, 0xb04a3a, 3]];
    tools.forEach(([dx, dz, f, c, kind]) => {
      const x0 = -w * 0.28 + dx * R * 0.4;
      const z0 = dz * R * 0.4;
      const top = h * f;
      rod(g, T(c), [x0, h * 0.15, z0], [x0 + dx * 0.02, top - 0.06, z0 + dz * 0.015], 0.007, 6);
      if (kind === 0) ball(g, T(c), 0.026, x0 + dx * 0.02, top - 0.03, z0, 8).scale.set(1, 1.3, 0.35);
      else if (kind === 1) box(g, T(c), 0.05, 0.07, 0.004, x0 + dx * 0.02, top - 0.07, z0);
      else if (kind === 2) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.003, 5, 12), M.metal);
        ring.rotation.y = Math.PI / 2;
        place(g, ring, x0 + dx * 0.02, top - 0.035, z0);
      } else cyl(g, T(c), 0.006, 0.03, x0 + dx * 0.02, top - 0.04, z0, 6);
    });
    // Messerblock rechts, Griffe ragen schräg heraus
    const bw = w * 0.32;
    const wood = T(0x8a5a32);
    box(g, wood, bw, h * 0.52, d * 0.78, w * 0.26, 0, 0);
    const top = box(g, wood, bw, 0.03, d * 0.78, w * 0.26, h * 0.52, 0);
    top.rotation.x = -0.3;
    for (let i = 0; i < 4; i++) {
      const hx = w * 0.26 - bw * 0.36 + i * bw * 0.24;
      rod(g, T(0x25282b), [hx, h * 0.5, -d * 0.05], [hx, h * 0.74 + 0.02 * i, -d * 0.12 - 0.01 * i], 0.009 + 0.001 * (i % 2), 6);
    }
  },

  home_herb_pot({ g, M, w, d, h, T }) {
    const r = Math.min(w, d) / 2;
    const ph = h * 0.36;
    pot(g, M, r * 0.9, ph, 0, 0, 0, 0xf2eee6);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      leaf(g, T(GREENS[(i % 3) + 1]), r * 1.1, r * 0.95, Math.cos(a) * r * 0.2, ph * 0.95 + 0.02 * (i % 4) + 0.02 * Math.floor(i / 3), Math.sin(a) * r * 0.2, Math.PI / 2 - a, 0.55 + 0.1 * (i % 3), 0.15);
    }
    ball(g, T(GREENS[2]), r * 0.55, 0, h * 0.88, 0, 8);
    box(g, T(0xc9a06a), 0.004, ph * 1.1, 0.002, r * 0.7, ph * 0.9, r * 0.5);
    box(g, T(0xd0a23a), 0.03, 0.02, 0.002, r * 0.7, ph * 0.9 + ph * 1.1, r * 0.5);
  },

  home_kitchen_cart({ g, M, w, d, h, T }) {
    const frame = T(0x3a3f44, { metalness: 0.5, roughness: 0.4 });
    const post = 0.018;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(g, frame, post, h - 0.05, post, sx * (w / 2 - post), 0.05, sz * (d / 2 - post));
      ball(g, M.dark, 0.026, sx * (w / 2 - post), 0.026, sz * (d / 2 - post), 8);
    }
    // drei Böden; oben bleibt Platz für Geschirr unterhalb der Gesamthöhe
    const lo = 0.09;
    const mid = 0.38;
    const top = h - 0.14;
    for (const y of [lo, mid, top]) box(g, M.wood, w, 0.03, d, 0, y, 0);
    rod(g, frame, [-w / 2 + post, h - 0.015, d / 2 - post], [-w / 2 + post, h - 0.015, -d / 2 + post], 0.008, 6);
    for (const z of [d / 2 - post, -d / 2 + post]) rod(g, frame, [-w / 2 + post, h - 0.015, z], [-w / 2 + post, top, z], 0.006, 5);
    // unten Korb mit Zwiebeln und Schneidebrett, in der Mitte Gläser, oben Tasse und Topf
    box(g, T(0xc9a06a), w * 0.32, 0.1, d * 0.7, -w * 0.28, lo + 0.03, 0);
    for (let i = 0; i < 4; i++) ball(g, T(i % 2 ? 0xd9a93a : 0xb8643b), 0.028, -w * 0.4 + i * 0.05, lo + 0.14, ((i % 2) - 0.5) * 0.08, 8);
    box(g, T(0xe4ddcc), w * 0.3, 0.015, d * 0.7, w * 0.3, lo + 0.03, 0);
    for (let i = 0; i < 3; i++) cyl(g, T(0xcfe3ec, { transparent: true, opacity: 0.6 }), 0.04, 0.1, -w * 0.28 + i * 0.1, mid + 0.03, 0, 12);
    cyl(g, T(0xc9cdd2, STEEL), 0.065, 0.08, w * 0.22, mid + 0.03, 0, 16);
    mug(g, T, -w * 0.25, top + 0.03, 0.0, 0xd9a93a);
    cyl(g, T(0xc9cdd2, STEEL), 0.07, 0.09, w * 0.2, top + 0.03, 0, 16);
  },

  home_bar_cart({ g, M, w, d, h, T }) {
    const brass = T(0xc9a24a, { metalness: 0.7, roughness: 0.3 });
    const post = 0.016;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(g, brass, post, h - 0.05, post, sx * (w / 2 - post), 0.05, sz * (d / 2 - post));
      ball(g, M.dark, 0.025, sx * (w / 2 - post), 0.025, sz * (d / 2 - post), 8);
    }
    // Böden mit Glasplatte; die Flaschen oben reichen bis zur Gesamthöhe
    const levels = [0.1, 0.34, h - 0.27];
    for (const y of levels) {
      box(g, brass, w, 0.012, d, 0, y, 0);
      box(g, M.glass, w - 0.03, 0.01, d - 0.03, 0, y + 0.012, 0);
    }
    rod(g, brass, [-w / 2 + post, h - 0.012, d / 2 - post], [-w / 2 + post, h - 0.012, -d / 2 + post], 0.007, 6);
    for (const z of [d / 2 - post, -d / 2 + post]) rod(g, brass, [-w / 2 + post, h - 0.012, z], [-w / 2 + post, levels[2], z], 0.005, 5);
    const top = levels[2] + 0.022;
    bottle(g, T, 0x8a5a2a, -w * 0.38, top, -d * 0.1, 0.034, 0.24, 0x2a2522);
    bottle(g, T, 0x2f6a4a, -w * 0.24, top, d * 0.05, 0.03, 0.22, 0xd9a93a);
    bottle(g, T, 0xc9e0e8, -w * 0.1, top, -d * 0.12, 0.03, 0.2, 0xb04a3a);
    for (const [x, z] of [[w * 0.12, 0.0], [w * 0.22, d * 0.1], [w * 0.32, -d * 0.05]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 12, 1, true), T(0xcfe3ec, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      c.rotation.x = Math.PI;
      place(g, c, x, top + 0.07, z);
      cyl(g, T(0xcfe3ec, { transparent: true, opacity: 0.6 }), 0.004, 0.035, x, top, z, 6);
    }
    const mid = levels[1] + 0.022;
    cyl(g, T(0xc9cdd2, STEEL), 0.08, 0.13, w * 0.22, mid, 0, 16, 0.07);
    bottle(g, T, 0x3a5a9a, -w * 0.3, mid, 0.0, 0.034, 0.22, 0xd9a93a);
    bottle(g, T, 0x7a2a3a, -w * 0.12, mid, d * 0.05, 0.034, 0.24, 0x2a2522);
    bottle(g, T, 0x8a5a2a, w * 0.02, mid, -d * 0.05, 0.034, 0.22, 0x2a2522);
  },

  home_hang_rail({ g, M, w, d, h, T }) {
    const z = -d / 2 + 0.03;
    const ry = h - 0.04;
    rod(g, M.metal, [-w / 2 + 0.03, ry, z], [w / 2 - 0.03, ry, z], 0.01, 8);
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
      cyl(g, M.metal, 0.02, 0.012, x, ry - 0.006, -d / 2 + 0.006, 12).rotation.x = Math.PI / 2;
      rod(g, M.metal, [x, ry, -d / 2 + 0.01], [x, ry, z], 0.008, 6);
    }
    box(g, M.wood, w, 0.02, d, 0, 0, 0);
    // Haken mit Öse; Rückgabe: Anfang des Hängeteils
    const hook = (x, len) => {
      place(g, new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 5, 10), M.metal), x, ry - 0.016, z);
      rod(g, M.metal, [x, ry - 0.03, z], [x, ry - len, z], 0.003, 5);
      return ry - len;
    };
    // Kupfertopf, Kelle, Pfannenwender, Küchentuch, Tasse – alles hängt höchstens bis 6 cm über das Brett
    const room = ry - 0.09;
    const py = hook(-w * 0.38, 0.1);
    cyl(g, T(0xb8643b, { metalness: 0.5, roughness: 0.4 }), 0.055, 0.07, -w * 0.38, py - 0.07, z + 0.04, 16);
    rod(g, T(0xb8643b), [-w * 0.38 + 0.05, py - 0.03, z + 0.04], [-w * 0.38 + 0.11, py - 0.02, z + 0.04], 0.006, 6);
    const ly = hook(-w * 0.2, 0.05);
    rod(g, M.metal, [-w * 0.2, ly, z], [-w * 0.2, ly - room * 0.6, z], 0.005, 5);
    ball(g, M.metal, 0.034, -w * 0.2, ly - room * 0.6 - 0.02, z, 8).scale.set(1, 0.4, 1);
    const sy = hook(-w * 0.02, 0.05);
    rod(g, T(0xc9a06a), [-w * 0.02, sy, z], [-w * 0.02, sy - room * 0.55, z], 0.006, 5);
    box(g, T(0x2a2d31), 0.05, 0.07, 0.004, -w * 0.02, sy - room * 0.55 - 0.07, z);
    const ty = hook(w * 0.16, 0.06);
    box(g, T(0xf3ecd9), 0.12, ty - 0.04, 0.01, w * 0.16, 0.04, z + 0.01);
    box(g, T(0xb04a3a), 0.12, 0.012, 0.012, w * 0.16, 0.04 + (ty - 0.04) * 0.3, z + 0.012);
    box(g, T(0xb04a3a), 0.12, 0.012, 0.012, w * 0.16, 0.04 + (ty - 0.04) * 0.6, z + 0.012);
    const my = hook(w * 0.34, 0.1);
    mug(g, T, w * 0.34, my - 0.08, z + 0.04, 0x3b5c8a);
    // Gewürzgläser auf dem Brett
    for (let i = 0; i < 3; i++) cyl(g, T([0xb04a3a, 0xd0a23a, 0x4f7a4c][i]), 0.024, 0.065, w * 0.46 - 0.05 - i * 0.055, 0.02, 0.0, 12);
  },

};
