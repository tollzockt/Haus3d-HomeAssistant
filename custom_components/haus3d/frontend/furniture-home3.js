// Kamin und Ofen sowie Vorhänge des Katalogs „Wohnen, Küche, Kamin, Vorhänge“ (siehe furniture-home.js): jedes Modell ist eine Funktion
// mit { g, M, w, d, h, bulbs, item, T }; Mitte der Grundfläche im Ursprung, Vorderseite nach +z.
// Flammen liegen in einer eigenen Gruppe (userData.flames) und werden ein-/ausgeblendet; Vorhänge bewegen ihre Streifen (userData.curtain).

import * as THREE from "./vendor/three.module.min.js";
import { ball, barZ, bindFire, box, clamp, cyl, disc, flames, foldsX, foldsY, log, openFromItem, openFromState, place, prism, rnd, rod } from "./home-parts.js";

const hexColor = (item, def) => (/^#[0-9a-f]{6}$/i.test(item?.color ?? "") ? parseInt(item.color.slice(1), 16) : def);

// ---------------------------------------------------------------- Feuerraum

/**
 * Innenleben einer Feuerstelle: Schamotte, Scheite (oder Kiesel), Flammen und optional Glastür mit Rahmen.
 * Öffnung ow × oh mit Unterkante yb und Mitte x, Rückwand bei zb, Vorderebene bei zf. Gibt die Flammengruppe zurück.
 */
function interior(g, M, T, { x = 0, yb, oh, ow, zb, zf, glass = true, frame, logs = true, pebbles = false, seed = 0, fh }) {
  const brick = T(0x7a5646);
  const soot = T(0x3a2f2a);
  const dz = zf - zb;
  const zm = (zb + zf) / 2;
  box(g, brick, ow, oh, 0.012, x, yb, zb + 0.006);
  for (const s of [-1, 1]) box(g, brick, 0.012, oh, dz, x + s * (ow / 2 - 0.006), yb, zm);
  box(g, soot, ow, 0.01, dz, x, yb, zm);
  const floor = yb + 0.01;
  let fy = floor + 0.02;
  if (logs) {
    const r = clamp(oh * 0.1, 0.022, 0.05);
    log(g, M, "x", r, ow * 0.7, x, floor + r, zb + dz * 0.3, 0);
    log(g, M, "x", r, ow * 0.62, x + ow * 0.04, floor + r, zb + dz * 0.62, 1);
    log(g, M, "x", r * 0.9, ow * 0.6, x, floor + 2.6 * r, zb + dz * 0.46, 2);
    fy = floor + 2.2 * r;
  }
  if (pebbles) {
    // Brennerschale mit Kieseln
    box(g, T(0x1c1e20), ow * 0.84, 0.03, dz * 0.62, x, floor, zb + dz * 0.5);
    const n = Math.max(6, Math.round((ow * 0.8) / 0.06));
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) ball(g, T([0x3a3d40, 0x55585c, 0x2a2c2e][(i + j) % 3]), 0.022, x - ow * 0.4 + ((i + 0.5 * j) * ow * 0.8) / n, floor + 0.04, zb + dz * (0.38 + 0.24 * j), 6).scale.y = 0.7;
    fy = floor + 0.05;
  }
  const flameH = fh ?? Math.min(oh * 0.6, 0.45);
  const fire = flames(g, x, fy, zb + dz * 0.46, ow * 0.62, Math.max(0.05, dz * 0.28), flameH, seed);
  if (glass) {
    box(g, M.glass, ow, oh, 0.006, x, yb, zf - 0.003);
    const fm = frame ?? T(0x1c1e20);
    box(g, fm, ow, 0.02, 0.012, x, yb + oh - 0.02, zf + 0.001);
    box(g, fm, ow, 0.02, 0.012, x, yb, zf + 0.001);
    for (const s of [-1, 1]) box(g, fm, 0.02, oh, 0.012, x + s * (ow / 2 - 0.01), yb, zf + 0.001);
    const hx = x + ow / 2 - 0.01;
    rod(g, M.metal, [hx, yb + oh * 0.5 - 0.03, zf + 0.007], [hx, yb + oh * 0.5 - 0.03, zf + 0.026], 0.005, 6);
    ball(g, M.metal, 0.011, hx, yb + oh * 0.5 - 0.03, zf + 0.028, 8);
  }
  return fire;
}

/**
 * Feuerraum als Schale mit Öffnung vorn: Außenmaß bw × bh × bd (Mitte x, Unterkante y, Mitte z), Wandstärke t, Öffnung ow × oh mit Unterkante
 * oy über der Schale; shell ist das Material der Hülle. Gibt die Flammengruppe zurück.
 */
function firebox(g, M, T, { x = 0, y = 0, z = 0, bw, bh, bd, t = 0.02, ow, oh, oy, shell, ...rest }) {
  const zb = z - bd / 2;
  const zf = z + bd / 2;
  box(g, shell, bw, bh, t, x, y, zb + t / 2);
  for (const s of [-1, 1]) box(g, shell, t, bh, bd, x + s * (bw / 2 - t / 2), y, z);
  box(g, shell, bw - 2 * t, t, bd - t, x, y + bh - t, z + t / 2);
  box(g, shell, bw - 2 * t, t, bd - t, x, y, z + t / 2);
  const sx = (bw - ow) / 2;
  const top = bh - oy - oh;
  for (const s of [-1, 1]) box(g, shell, sx, bh, t, x + s * (ow / 2 + sx / 2), y, zf - t / 2);
  if (oy > 0) box(g, shell, ow, oy, t, x, y, zf - t / 2);
  if (top > 0) box(g, shell, ow, top, t, x, y + oy + oh, zf - t / 2);
  return interior(g, M, T, { x, yb: y + oy, oh, ow, zb: zb + t, zf, frame: shell, ...rest });
}

/** Kaminofen aus Stahl; up = Rohr gerade nach oben bis zur Decke, sonst im Bogen nach hinten in die Wand. */
function woodStove({ g, M, w, d, h, T, item }, up) {
  const K = up ? 1 : h / 1.1;
  const steel = T(0x26282b, { roughness: 0.55 });
  const dark = T(0x1c1e20, { roughness: 0.5 });
  const bd = d - 0.04;
  const zc = -d / 2 + bd / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, dark, 0.022, 0.12 * K, sx * (w / 2 - 0.05), 0, zc + sz * (bd / 2 - 0.05), 8, 0.03);
  box(g, steel, w, 0.03 * K, bd, 0, 0.12 * K, zc);
  const bh = 0.62 * K;
  const fire = firebox(g, M, T, { y: 0.15 * K, z: zc, bw: w, bh, bd, ow: w * 0.66, oh: 0.36 * K, oy: 0.12 * K, shell: steel, frame: dark });
  box(g, dark, w, 0.03 * K, bd, 0, 0.15 * K + bh, zc);
  box(g, M.metal, w * 0.22, 0.012, 0.02, 0, 0.19 * K, zc + bd / 2 + 0.003);
  for (let i = 0; i < 4; i++) box(g, dark, w * 0.5, 0.006, 0.004, 0, 0.15 * K + bh - 0.03 * K - i * 0.012, zc + bd / 2 + 0.002);
  const pr = clamp(w * 0.13, 0.045, 0.075);
  const pipe = T(0x1c1e20, { metalness: 0.3, roughness: 0.5 });
  const y0 = 0.18 * K + bh;
  const zp = up ? zc - bd * 0.15 : -d / 2 + 0.1;
  cyl(g, pipe, pr * 1.15, 0.025, 0, y0 - 0.005, zp, 16);
  if (up) {
    const yt = h - 0.03;
    cyl(g, pipe, pr, yt - y0, 0, y0, zp, 16);
    for (let y = y0 + 0.3; y < yt - 0.1; y += 0.35) cyl(g, pipe, pr * 1.1, 0.02, 0, y, zp, 16);
    cyl(g, M.metal, pr * 1.7, 0.03, 0, h - 0.03, zp, 20);
  } else {
    const yt = h - pr * 1.6;
    cyl(g, pipe, pr, yt - y0, 0, y0, zp, 16);
    ball(g, pipe, pr * 1.02, 0, yt, zp, 12);
    barZ(g, pipe, pr, zp + d / 2, 0, yt, (zp - d / 2) / 2, 16);
    disc(g, M.metal, pr * 1.55, 0, yt, -d / 2 + 0.004, 0.008, 20);
  }
  bindFire(g, item, fire);
}

export const FIRE = {
  home_stove_wood: (c) => woodStove(c, false),
  home_stove_flue: (c) => woodStove(c, true),

  home_stove_pellet({ g, M, w, d, h, T, item }) {
    const body = T(0x2f3236, { roughness: 0.5 });
    const accent = T(0x8a8f94, { metalness: 0.5, roughness: 0.4 });
    const gap = 0.07; // Platz hinter dem Ofen für das Abgasrohr
    const bd = d - gap - 0.03;
    const zc = -d / 2 + gap + bd / 2;
    const base = 0.06;
    const bh = h * 0.72;
    box(g, M.dark, w * 0.94, base, bd * 0.94, 0, 0, zc);
    const fire = firebox(g, M, T, { y: base, z: zc, bw: w, bh, bd, ow: w * 0.64, oh: bh * 0.46, oy: bh * 0.2, shell: body, frame: accent });
    box(g, accent, w, 0.03, bd, 0, base + bh, zc);
    // Pellet-Behälter mit Deckel
    const top = base + bh + 0.03;
    box(g, body, w * 0.84, h - top - 0.035, bd * 0.72, 0, top, zc - bd * 0.12);
    box(g, accent, w * 0.86, 0.035, bd * 0.74, 0, h - 0.035, zc - bd * 0.12);
    box(g, M.metal, 0.07, 0.012, 0.016, 0, h - 0.03, zc + bd * 0.28);
    // Bedienfeld in der Blende über der Tür, Lüftungsschlitze darunter
    const fz = zc + bd / 2 + 0.003;
    const py = base + bh * 0.2 + bh * 0.46 + bh * 0.1;
    box(g, M.screen, w * 0.22, 0.04, 0.004, -w * 0.12, py, fz);
    for (let i = 0; i < 3; i++) ball(g, M.metal, 0.011, w * 0.14 + i * 0.05, py + 0.02, fz + 0.004, 6).scale.z = 0.4;
    for (let i = 0; i < 6; i++) box(g, M.dark, w * 0.5, 0.005, 0.004, 0, base + 0.02 + i * 0.015, fz);
    // Abgasrohr nach hinten
    barZ(g, T(0x1c1e20, { metalness: 0.3 }), 0.04, gap + 0.01, 0, base + bh * 0.28, -d / 2 + (gap + 0.01) / 2, 14);
    disc(g, M.metal, 0.06, 0, base + bh * 0.28, -d / 2 + 0.004, 0.008, 16);
    bindFire(g, item, fire);
  },

  home_fireplace_open({ g, M, w, d, h, T, item }) {
    const bd = d - 0.1;
    const zc = -d / 2 + bd / 2;
    const hearth = 0.05;
    box(g, M.stone, w, hearth, d, 0, 0, 0);
    const p = clamp(w * 0.23, 0.2, 0.4);
    const ow = w - 2 * p;
    const oh = Math.min(0.8, h * 0.58);
    const mantel = h - 0.16;
    const bricks = [0xa5583c, 0x9a4f36, 0xb0634a, 0xa05a42];
    const ch = 0.065;
    // Pfeiler im Verband, darüber die Brust bis zum Sims
    let k = 0;
    for (let y = hearth; y + 0.03 < mantel; y += ch, k++) {
      const hh = Math.min(ch - 0.008, mantel - y);
      const cut = k % 2 ? 0.32 : 0.62;
      for (const s of [-1, 1]) {
        const x0 = s * (ow / 2) + (s < 0 ? -p : 0);
        box(g, T(bricks[(k * 3 + (s < 0 ? 0 : 1)) % 4]), p * cut - 0.004, hh, bd, x0 + (p * cut) / 2, y, zc);
        box(g, T(bricks[(k * 3 + (s < 0 ? 1 : 2)) % 4]), p * (1 - cut) - 0.004, hh, bd, x0 + p * cut + (p * (1 - cut)) / 2, y, zc);
      }
      if (y >= hearth + oh + 0.08) {
        const n = 3;
        for (let i = 0; i < n; i++) box(g, T(bricks[(k + i) % 4]), ow / n - 0.004, hh, bd, -ow / 2 + ((i + 0.5) * ow) / n + (k % 2 ? 0.05 : -0.05) * (i === 0 || i === n - 1 ? 0 : 1), y, zc);
      }
    }
    // Sturzbalken über der Öffnung, Ruß an der Decke der Feuerstelle
    box(g, M.wood, ow + 0.06, 0.1, bd + 0.02, 0, hearth + oh, zc);
    box(g, T(0x2a2522), ow, 0.01, bd, 0, hearth + oh - 0.01, zc);
    // Sims mit Kerzen und kleinem Bild
    box(g, M.wood, w, 0.05, d - 0.04, 0, mantel, -d / 2 + (d - 0.04) / 2);
    for (const [x, hh] of [[-w * 0.36, 0.1], [-w * 0.3, 0.07], [w * 0.34, 0.09]]) {
      cyl(g, T(0xf2ead8), 0.016, hh, x, mantel + 0.05, -d / 2 + 0.2, 10);
      cyl(g, M.metal, 0.026, 0.008, x, mantel + 0.05, -d / 2 + 0.2, 10);
    }
    ball(g, T(0xe9e1d0), 0.035, w * 0.18, mantel + 0.05 + 0.035, -d / 2 + 0.2, 10).scale.y = 1.2;
    box(g, T(0x7a5230), 0.2, 0.1, 0.012, w * 0.0, mantel + 0.05, -d / 2 + 0.06);
    box(g, T(0xe9a15b), 0.17, 0.07, 0.004, w * 0.0, mantel + 0.065, -d / 2 + 0.069);
    const fire = interior(g, M, T, { x: 0, yb: hearth, oh: oh - 0.01, ow, zb: -d / 2, zf: -d / 2 + bd, glass: false, fh: Math.min(0.45, oh * 0.6) });
    // Rost mit Scheiten liegt im Innenleben; vorn eine niedrige Funkenschutz-Leiste
    box(g, M.metal, ow * 0.9, 0.03, 0.02, 0, hearth, d / 2 - 0.12);
    bindFire(g, item, fire);
  },

  home_fireplace_corner({ g, M, w, d, h, T, item }) {
    // Dreieckiger Grundriss in der Ecke hinten links, Feuerraum an der schrägen Vorderseite
    const L = Math.hypot(w, d);
    const H = (w * d) / L;
    const G = new THREE.Group();
    G.rotation.y = Math.atan2(d, w);
    g.add(G);
    const A = [-L / 2, 0];
    const B = [L / 2, 0];
    const C = [(d * d - w * w) / (2 * L), -H];
    const zL = (x) => (C[1] * (x - A[0])) / (C[0] - A[0]);
    const zR = (x) => (C[1] * (x - B[0])) / (C[0] - B[0]);
    const ow = Math.min(0.62, L * 0.42);
    const bd = Math.min(0.42, 0.9 * Math.min(-zL(-ow / 2), -zR(ow / 2)));
    const base = 0.12;
    const oh = Math.min(0.5, h * 0.42);
    const yt = base + oh;
    const body = h * 0.72;
    const plaster = M.light;
    const shrink = (k) => [A, B, C].map(([x, z]) => [C[0] + (x - C[0]) * k, C[1] + (z - C[1]) * k]);
    prism(G, M.stoneLight, [A, B, C], base, 0);
    prism(G, plaster, [A, [-ow / 2, 0], [-ow / 2, zL(-ow / 2)]], oh, base);
    prism(G, plaster, [B, [ow / 2, zR(ow / 2)], [ow / 2, 0]], oh, base);
    prism(G, plaster, [[-ow / 2, -bd], [ow / 2, -bd], [ow / 2, zR(ow / 2)], C, [-ow / 2, zL(-ow / 2)]], oh, base);
    prism(G, plaster, [A, B, C], body - yt, yt);
    prism(G, M.stoneLight, shrink(0.86), 0.04, body);
    prism(G, plaster, shrink(0.52), h - body - 0.04, body + 0.04);
    box(G, T(0x2a2522), ow, 0.01, bd, 0, yt - 0.01, -bd / 2);
    // Holzsims über der Öffnung, ragt etwas aus der Schrägen
    box(G, M.wood, ow + 0.3, 0.04, 0.1, 0, yt, -0.01);
    const fire = interior(G, M, T, { x: 0, yb: base, oh: oh - 0.01, ow, zb: -bd, zf: 0 });
    bindFire(g, item, fire);
  },

  home_fireplace_ethanol({ g, M, w, d, h, T, item }) {
    const shell = T(0x26282b, { roughness: 0.55 });
    const bd = d - 0.02;
    const fire = firebox(g, M, T, { z: -d / 2 + bd / 2, bw: w, bh: h, bd, t: 0.015, ow: w - 0.12, oh: h - 0.14, oy: 0.07, shell, logs: false, pebbles: true, fh: (h - 0.14) * 0.45 });
    // schmale Zierleiste unten und Aufhängung hinten
    box(g, M.metal, w * 0.9, 0.006, 0.006, 0, 0.03, -d / 2 + bd + 0.002);
    bindFire(g, item, fire);
  },

  home_stove_tile({ g, M, w, d, h, T, item }) {
    const ws = Math.min(0.9, w * 0.52);
    const x0 = -w / 2;
    const xs = x0 + ws / 2;
    const base = 0.12;
    const cornice = 0.1;
    const bd = d - 0.02;
    const zc = -d / 2 + bd / 2;
    const bodyH = h - base - cornice;
    const rows = Math.max(4, Math.round(bodyH / 0.17));
    const th = bodyH / rows;
    const cols = 4;
    const tw = (ws - 0.02) / cols;
    const green = [0x5f7f68, 0x6f9078];
    const tile = (i) => T(green[i % 2]);
    const dark = T(0x35433b);
    box(g, M.stone, ws, base, bd, xs, 0, zc);
    box(g, M.stoneLight, ws, cornice, bd, xs, h - cornice, zc);
    // Kern mit Feuerraum; die Tür füllt zwei Kachelfelder (Spalten 1 und 2, Reihen 3 und 4)
    const bw = ws - 0.02;
    const fire = firebox(g, M, T, { x: xs, y: base, z: zc, bw, bh: bodyH, bd: bd - 0.02, ow: 2 * tw, oh: 2 * th, oy: 3 * th, shell: dark, frame: T(0x1c1e20) });
    const zf = zc + (bd - 0.02) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c === 1 || c === 2) && (r === 3 || r === 4)) continue;
        box(g, tile(r + c), tw - 0.008, th - 0.008, 0.012, xs - bw / 2 + (c + 0.5) * tw, base + r * th + 0.004, zf + 0.004);
      }
    }
    // linke Seite und rechte Seite oberhalb der Bank
    const sd = (bd - 0.02) / 3;
    const bench = 0.42;
    for (let r = 0; r < rows; r++) for (let c = 0; c < 3; c++) {
      box(g, tile(r + c + 1), 0.012, th - 0.008, sd - 0.008, xs - bw / 2 + 0.002, base + r * th + 0.004, zc - (bd - 0.02) / 2 + (c + 0.5) * sd);
      if (base + r * th >= bench) box(g, tile(r + c), 0.012, th - 0.008, sd - 0.008, xs + bw / 2 - 0.002, base + r * th + 0.004, zc - (bd - 0.02) / 2 + (c + 0.5) * sd);
    }
    // Ofenbank rechts: gekachelter Sockel, Holzsitz, Polster und Decke
    const bx0 = x0 + ws;
    const bwid = w - ws;
    const bxc = bx0 + bwid / 2;
    box(g, dark, bwid, bench - 0.05, bd - 0.02, bxc, 0, zc);
    const bcols = Math.max(2, Math.round(bwid / 0.19));
    const btw = bwid / bcols;
    for (let c = 0; c < bcols; c++) for (let r = 0; r < 2; r++) box(g, tile(r + c), btw - 0.008, (bench - 0.05) / 2 - 0.008, 0.012, bx0 + (c + 0.5) * btw, r * ((bench - 0.05) / 2) + 0.004, zf + 0.004);
    box(g, M.wood, bwid, 0.05, bd, bxc, bench - 0.05, zc);
    box(g, T(0xc9863a), bwid * 0.78, 0.06, bd * 0.62, bxc, bench, zc + 0.02);
    box(g, T(0xe7dfce), bwid * 0.5, 0.025, bd * 0.5, bxc + bwid * 0.1, bench + 0.06, zc + 0.02).rotation.y = 0.08;
    bindFire(g, item, fire);
  },

  home_log_rack({ g, M, w, d, h, T }) {
    const frame = T(0x2a2d31, { metalness: 0.4, roughness: 0.5 });
    const t = 0.03;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, frame, t, h, t, sx * (w / 2 - t / 2), 0, sz * (d / 2 - t / 2));
    box(g, M.wood, w, 0.04, d, 0, 0.08, 0);
    for (const y of [0.4, 0.75]) for (const sz of [-1, 1]) box(g, frame, w, 0.015, 0.015, 0, y, sz * (d / 2 - t / 2));
    box(g, frame, w, 0.03, d, 0, h - 0.03, 0);
    // Scheite liegen quer (Achse entlang z), Reihen im Versatz; oben bleibt Platz
    const r = 0.052;
    const per = Math.max(2, Math.floor((w - 2 * t - 0.02) / (2 * r)));
    const top = h - 0.1;
    let row = 0;
    for (let y = 0.12 + r; y + r < top; y += r * 1.82, row++) {
      const n = per - (row % 2);
      for (let i = 0; i < n; i++) {
        const x = -(n - 1) * r + i * 2 * r;
        log(g, M, "z", r * (0.88 + 0.12 * rnd(row * 7 + i)), d - 0.1 - 0.05 * rnd(row * 5 + i * 3), x, y, 0.01 * (rnd(row + i) - 0.5), row * 5 + i);
      }
    }
  },

  home_fire_tools({ g, M, w, d, h, T }) {
    const dark = T(0x1c1e20, { metalness: 0.3, roughness: 0.5 });
    const brass = T(0xc9a24a, { metalness: 0.7, roughness: 0.3 });
    cyl(g, dark, Math.min(w, d) * 0.46, 0.02, 0, 0, 0, 24);
    cyl(g, dark, 0.012, h - 0.03, 0, 0.02, 0, 8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 14), brass);
    ring.rotation.x = Math.PI / 2;
    place(g, ring, 0, h - 0.01, 0);
    // vier Haken in vier Richtungen, daran Schürhaken, Besen, Schaufel und Zange
    const hooks = [[0.1, 0.0], [0.0, 0.08], [-0.1, 0.0], [0.0, -0.08]];
    const hy = h * 0.88;
    hooks.forEach(([dx, dz], i) => {
      rod(g, dark, [0, hy, 0], [dx, hy - 0.02, dz], 0.006, 5);
      const top = hy - 0.04;
      const len = h * 0.62;
      if (i === 0) {
        rod(g, dark, [dx, top, dz], [dx, top - len, dz], 0.006, 6);
        rod(g, dark, [dx, top - len, dz], [dx + 0.02, top - len - 0.04, dz], 0.005, 5);
      } else if (i === 1) {
        rod(g, dark, [dx, top, dz], [dx, top - len * 0.8, dz], 0.006, 6);
        box(g, T(0x3a2f27), 0.05, len * 0.22, 0.03, dx, top - len * 0.8 - len * 0.2, dz);
      } else if (i === 2) {
        rod(g, dark, [dx, top, dz], [dx, top - len * 0.75, dz], 0.006, 6);
        box(g, dark, 0.07, 0.09, 0.006, dx, top - len * 0.75 - 0.09, dz);
      } else {
        rod(g, dark, [dx, top, dz], [dx - 0.012, top - len * 0.9, dz], 0.005, 6);
        rod(g, dark, [dx, top, dz], [dx + 0.012, top - len * 0.9, dz], 0.005, 6);
      }
      ball(g, brass, 0.012, dx, top, dz, 8);
    });
  },
};

// ---------------------------------------------------------------- Vorhänge

/** Gemeinsamer Zustand: Öffnung aus dem Feld, bei verknüpfter Entität aus deren Zustand; set(0…1) bewegt die Teile. */
function bindOpen(g, item, set, extra = {}) {
  const base = openFromItem(item);
  set(base);
  g.userData.curtain = { open: base, set, ...extra };
  g.userData.onState = (s) => {
    const v = openFromState(s) ?? openFromItem(item);
    set(v);
    g.userData.curtain.open = v;
  };
}

/** Stange mit Endknöpfen und Wandhaltern; y Höhe der Stangenmitte, z Tiefe der Stange (Wand bei −d/2). */
function curtainRod(g, d, w, y, mat, endMat = mat) {
  rod(g, mat, [-w / 2 + 0.03, y, 0], [w / 2 - 0.03, y, 0], 0.014, 10);
  const holders = w > 2 ? [-1, 0, 1] : [-1, 1];
  for (const s of [-1, 1]) ball(g, endMat, 0.026, s * (w / 2 - 0.03), y, 0, 10);
  for (const s of holders) {
    const x = s * (w / 2 - 0.1);
    rod(g, mat, [x, y, 0], [x, y, -d / 2 + 0.004], 0.006, 6);
    cyl(g, mat, 0.022, 0.008, x, y - 0.0, -d / 2 + 0.004, 12).rotation.x = Math.PI / 2;
  }
}

/** Vorhang aus Faltenstreifen: zweiteilig (pair) oder einseitig (links gerafft). */
function drapes({ g, M, w, d, h, T, item }, { pair, color, extra = {}, rings = null, rail = "rod", rodColor = 0x2a2d31, fullness = 1.5, thick = 0.01, header = 0, strip = 0.07 }) {
  const fabric = T(hexColor(item, color), extra);
  const brass = T(0xc9a24a, { metalness: 0.7, roughness: 0.3 });
  const rodMat = T(rodColor, { metalness: 0.4, roughness: 0.5 });
  const rodY = h - 0.04;
  const amp = Math.max(0.02, d - 0.04);
  if (rail === "rod") curtainRod(g, d, w, rodY, rodMat, rings?.loops ? rodMat : brass);
  else if (rail === "track") {
    box(g, T(0xf4f1ea), w - 0.04, 0.025, 0.04, 0, h - 0.025, 0);
    for (let i = 0; i < 9; i++) box(g, T(0xd9d6cf), 0.01, 0.012, 0.012, -w / 2 + 0.06 + (i * (w - 0.12)) / 8, h - 0.037, 0);
  } else if (header) box(g, fabric, w, header, Math.max(0.03, d - 0.02), 0, h - header, 0);
  const top = rail === "rod" ? h - 0.06 : header ? h - header - 0.01 : h - 0.04;
  const common = { y: 0, hgt: top, zc: 0, thick, fullness, strip, amp, rings: rings ? { R: rings.R, r: rings.r, every: rings.every, y: rodY, mat: rings.loops ? fabric : brass } : null };
  const parts = pair
    ? [foldsX(g, fabric, { ...common, x0: -w / 2 + 0.04, dir: 1, span: w / 2 - 0.04 }), foldsX(g, fabric, { ...common, x0: w / 2 - 0.04, dir: -1, span: w / 2 - 0.04 })]
    : [foldsX(g, fabric, { ...common, x0: -w / 2 + 0.04, dir: 1, span: w - 0.08 })];
  bindOpen(g, item, (o) => parts.forEach((p) => p.set(o)), { parts: parts.map((p) => p.group) });
}

/** Raffrollo und Plissee: Stoff hängt unter der Kopfschiene und wird nach oben zusammengeschoben. */
function blind({ g, M, w, d, h, T, item }, { color, n, fullness, thick, rail, bar, cord = false, barColor }) {
  const fabric = T(hexColor(item, color), { side: THREE.DoubleSide });
  const white = T(0xf4f1ea);
  box(g, white, w, rail, 0.05, 0, h - rail, -d / 2 + 0.025);
  const top = h - rail - 0.003;
  const span = top - bar;
  const f = foldsY(g, fabric, { top, span, w: w - 0.02, zc: 0.01, thick, fullness, n, amp: Math.max(0.03, d - 0.04) });
  const barMesh = box(g, T(barColor), w - 0.02, bar, 0.022, 0, 0, 0.01);
  const cordMesh = cord ? box(g, T(0xe8e0d0), 0.004, 1, 0.004, w / 2 - 0.04, 0, d / 2 - 0.012) : null;
  bindOpen(g, item, (o) => {
    const bottom = f.set(o);
    barMesh.position.y = bottom - bar / 2;
    if (cordMesh) {
      const len = Math.max(0.01, h - rail - bottom);
      cordMesh.scale.y = len;
      cordMesh.position.y = bottom + len / 2;
    }
  }, { parts: [f.group, barMesh] });
}

export const CURTAINS = {
  home_curtain_pair: (c) => drapes(c, { pair: true, color: 0xc9a27a, rings: { R: 0.022, r: 0.004, every: 2 } }),
  home_curtain_single: (c) => drapes(c, { pair: false, color: 0xd9b88a, rings: { R: 0.022, r: 0.004, every: 2 } }),
  home_curtain_loops: (c) => drapes(c, { pair: true, color: 0xb8643b, rings: { R: 0.026, r: 0.008, every: 1, loops: true }, rodColor: 0x6b4a2f, thick: 0.012 }),
  home_sheer: (c) => drapes(c, { pair: false, color: 0xf4f1ea, extra: { transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }, rail: "track", fullness: 1.25, thick: 0.004 }),
  home_blackout: (c) => drapes(c, { pair: true, color: 0x3a3f4a, rail: "pelmet", header: 0.14, fullness: 1.35, thick: 0.014, strip: 0.08 }),
  home_roman_blind: (c) => blind(c, { color: 0xe4d9c3, n: 20, fullness: 1.2, thick: 0.01, rail: 0.045, bar: 0.03, cord: true, barColor: 0x8a5a32 }),
  home_pleated: (c) => blind(c, { color: 0xf2ede2, n: 60, fullness: 1.15, thick: 0.004, rail: 0.03, bar: 0.02, barColor: 0xe4e0d8 }),
};
