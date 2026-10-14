// 3D-Modelle des Katalogs „Wohnen, Küche, Kamin, Vorhänge“ (catalog-home.js): Einheitsrahmen wie in furniture.js – Breite w entlang x,
// Tiefe d entlang z, Höhe h nach oben, Vorderseite nach +z. Leuchtende Teile kommen in bulbs. Dieses Modul verteilt auf die
// Untermodule und baut „Wohnen & Deko“ selbst (Pflanzen und Küche: furniture-home2.js, Kamin und Vorhänge: furniture-home3.js,
// Haustiere und Kinderzimmer: furniture-home4.js).

import * as THREE from "./vendor/three.module.min.js";
import { KITCHEN, PLANTS } from "./furniture-home2.js";
import { CURTAINS, FIRE } from "./furniture-home3.js";
import { KIDS, PETS } from "./furniture-home4.js";
import { art, arcYZ, ball, barX, barZ, box, books, clamp, cyl, disc, flameMat, lathe, leaf, picture, place, pot, rnd, rod, tint } from "./home-parts.js";

/** Zahl aus der Kennung des Möbelstücks: gleiche Teile sehen gleich aus, mehrere nebeneinander unterscheiden sich. */
const seedOf = (item) => [...String(item?.id ?? "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

/** Kissen: flacher Quader mit abgesetzten Kanten, steht unten auf y = 0 und lehnt nach hinten. */
function pillow(g, mat, pw, ph, t, x, z, lean = 0.2, spin = 0) {
  const p = new THREE.Group();
  // Mittelpunkt des Kissens im Ursprung der Gruppe: drehen und neigen, dann auf den Boden setzen
  box(p, mat, pw * 0.94, ph * 0.94, t * 0.5, 0, -ph * 0.47, 0);
  const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
  puff.scale.set((pw / 2) * 1.02, (ph / 2) * 1.02, t / 2);
  p.add(puff);
  p.rotation.order = "XYZ";
  p.rotation.set(-lean, 0, spin);
  const c = Math.abs(Math.cos(spin));
  const s = Math.abs(Math.sin(spin));
  p.position.set(x, ((ph * c + pw * s) / 2) * Math.cos(lean) + (t / 2) * Math.sin(lean), z);
  g.add(p);
  return p;
}

/** Spiegelfläche: hell mit leichtem Glanz. */
const mirrorMat = (T) => T(0xd6e8f0, { roughness: 0.2 });

const DECO = {
  home_frame({ g, M, w, d, h, seed }) {
    picture(g, M, w, h, d, 0, 0, 0, seed % 4);
  },

  home_canvas({ g, M, w, d, h, T, seed }) {
    const t = Math.max(0.01, d - 0.012);
    box(g, T(0xf1ebdd), w, h, t, 0, 0, -d / 2 + t / 2);
    art(g, M, w - 0.016, h - 0.016, 0, 0.008, -d / 2 + t + 0.001, (seed + 1) % 4);
  },

  home_gallery({ g, M, w, d, h, seed }) {
    const gap = 0.065 * w;
    let x = -w / 2 + (w - (0.87 + 0.13) * w) / 2;
    [[0.27, 0.7, 0.15, 0x7a5230], [0.33, 1, 0, 0x2e2a28], [0.27, 0.7, 0.15, 0xf0ece4]].forEach(([fw, fh, fy, wood], i) => {
      picture(g, M, fw * w, fh * h, d, x + (fw * w) / 2, fy * h, 0, seed + i + 1, wood);
      x += fw * w + gap;
    });
  },

  home_mirror_round({ g, M, w, d, h, T }) {
    const R = Math.min(w, h) / 2;
    const t = Math.min(0.02, d / 2);
    const brass = T(0xc9a24a, { metalness: 0.7, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - t, t, 8, 40), brass);
    place(g, ring, 0, h / 2, -d / 2 + t);
    disc(g, mirrorMat(T), R - 2 * t, 0, h / 2, -d / 2 + t, 0.008, 40);
    // Haken am oberen Rand
    box(g, brass, 0.03, 0.025, 0.012, 0, h - 0.02, -d / 2 + 0.006);
  },

  home_mirror_floor({ g, M, w, d, h, T }) {
    // lehnt mit der Oberkante an der Wand
    const phi = Math.asin(clamp((d - 0.06) / h, 0.02, 0.5));
    const L = h / Math.cos(phi);
    const t = 0.035;
    const b = 0.035;
    const wood = T(0xd2bd95);
    const p = new THREE.Group();
    box(p, wood, w, b, t, 0, 0, 0);
    box(p, wood, w, b, t, 0, L - b, 0);
    box(p, wood, b, L - 2 * b, t, -w / 2 + b / 2, b, 0);
    box(p, wood, b, L - 2 * b, t, w / 2 - b / 2, b, 0);
    box(p, mirrorMat(T), w - 2 * b, L - 2 * b, 0.008, 0, b, t / 2 - 0.006);
    box(p, T(0xffffff, { transparent: true, opacity: 0.4, depthWrite: false }), 0.04, (L - 2 * b) * 0.4, 0.0015, -w * 0.12, b + (L - 2 * b) * 0.45, t / 2 - 0.0015).rotation.z = 0.4;
    p.rotation.x = -phi;
    p.position.set(0, (t / 2) * Math.sin(phi) + 0.002, d / 2 - 0.035);
    g.add(p);
  },

  home_wall_shelf({ g, M, w, d, h, T, seed }) {
    const th = 0.035;
    box(g, M.wood, w, th, d, 0, 0, 0);
    // zwei kleine Konsolen unter dem Brett (innerhalb der Gesamthöhe, das Brett sitzt darüber)
    const y = th;
    const ph = Math.min(0.28, h - y - 0.02);
    picture(g, M, ph * 0.72, ph, 0.02, -w * 0.3, y, -d / 2 + 0.03, seed + 1);
    // Vase mit Zweigen
    const vase = tint(M, 0xe9e1d0, { side: THREE.DoubleSide });
    lathe(g, vase, [[0.001, 0], [0.032, 0], [0.045, 0.05], [0.028, 0.1], [0.03, 0.13], [0.024, 0.13], [0.02, 0.1]], -w * 0.05, y, 0);
    for (const [dx, tip] of [[-0.03, 0.55], [0.0, 0.8], [0.03, 0.62]]) rod(g, T(0x6b4a2f), [-w * 0.05, y + 0.11, 0], [-w * 0.05 + dx * 1.6, Math.min(h - 0.02, y + (h - y) * tip + 0.1), 0], 0.003, 5);
    for (const [dx, f] of [[-0.05, 0.6], [0.05, 0.62], [0, 0.82]]) ball(g, T(0x7fa35a), 0.022, -w * 0.05 + dx, Math.min(h - 0.025, y + (h - y) * f + 0.11), 0, 8);
    // liegender Bücherstapel mit Schale
    for (let i = 0; i < 3; i++) box(g, T([0x3b5c8a, 0xb04a3a, 0xd0a23a][i]), 0.2 - i * 0.015, 0.03, 0.13, w * 0.2 + (i - 1) * 0.008, y + i * 0.03, 0.01);
    lathe(g, T(0x8a6a4a, { side: THREE.DoubleSide }), [[0.001, 0], [0.02, 0], [0.045, 0.035], [0.04, 0.04], [0.035, 0.035]], w * 0.2, y + 0.09, 0.01);
    // Topfpflanze
    pot(g, M, 0.04, 0.07, w * 0.37, y, 0.01, 0xe8e0d0);
    for (let i = 0; i < 5; i++) leaf(g, T(i % 2 ? 0x3f8f4a : 0x56a24c), 0.1, 0.04, w * 0.37, y + 0.065, 0.01, i * 1.26, 0.9 - (i % 2) * 0.3);
  },

  home_clock({ g, M, w, d, h, T }) {
    const R = Math.min(w, h) / 2;
    const zc = -d / 2;
    const zf = zc + d * 0.75; // Vorderkante des Rahmens
    disc(g, T(0x3a2f27), R, 0, h / 2, (zc + zf) / 2, zf - zc, 36);
    disc(g, T(0xf6f1e6), R - 0.02, 0, h / 2, zf + 0.002, 0.004, 36);
    const dark = T(0x2a2522);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const big = i % 3 === 0;
      const tick = box(g, dark, big ? 0.012 : 0.007, big ? 0.04 : 0.025, 0.002, Math.sin(a) * (R - 0.045), h / 2 + Math.cos(a) * (R - 0.045) - (big ? 0.02 : 0.0125), zf + 0.005);
      tick.rotation.z = -a;
    }
    // Zeiger auf zehn nach zehn
    for (const [len, a, wd, k] of [[R * 0.5, -0.9, 0.012, 0], [R * 0.72, 0.6, 0.007, 1]]) {
      const hand = box(g, dark, wd, len, 0.003, 0, 0, 0);
      hand.geometry.translate(0, len / 2, 0);
      hand.position.set(0, h / 2, zf + 0.0065 + k * 0.003);
      hand.rotation.z = -a;
    }
    ball(g, T(0xc9a24a), 0.01, 0, h / 2, zf + 0.006, 8).scale.z = 0.4;
  },

  home_fairy_lights({ g, M, w, d, h, bulbs, T }) {
    const cable = T(0x2a2a2a);
    const swags = Math.max(2, Math.round(w / 0.65));
    const z = -d / 2 + 0.012;
    const top = h - 0.015;
    const sag = Math.max(0.05, h - 0.075);
    const per = Math.max(4, Math.round(w / swags / 0.11));
    for (let k = 0; k < swags; k++) {
      const xa = -w / 2 + 0.02 + (k * (w - 0.04)) / swags;
      const xb = -w / 2 + 0.02 + ((k + 1) * (w - 0.04)) / swags;
      cyl(g, T(0xb0a58f), 0.006, 0.012, xa, top - 0.006, -d / 2 + 0.006, 8).rotation.x = Math.PI / 2;
      let prev = null;
      for (let j = 0; j <= per; j++) {
        const t = j / per;
        const p = [xa + (xb - xa) * t, top - sag * 4 * t * (1 - t) * (0.7 + 0.3 * rnd(k * 9 + 1)), z];
        if (prev) rod(g, cable, prev, p, 0.0035, 5);
        if (j > 0 && j < per) bulbs.push(ball(g, M.bulb, 0.017, p[0], p[1] - 0.02, z + 0.006, 8));
        prev = p;
      }
    }
    cyl(g, T(0xb0a58f), 0.006, 0.012, w / 2 - 0.02, top - 0.006, -d / 2 + 0.006, 8).rotation.x = Math.PI / 2;
  },

  home_books_row({ g, M, w, d, h, T, seed }) {
    const row = new THREE.Group();
    const used = books(row, M, w - 0.04, 0, 0, 0, h * 0.95, d * 0.95, seed);
    row.position.set(-used / 2, 0, 0);
    g.add(row);
    // Buchstützen
    box(g, M.metal, 0.012, h * 0.9, d * 0.85, -used / 2 - 0.007, 0, 0);
    box(g, M.metal, 0.012, h * 0.9, d * 0.85, used / 2 + 0.007, 0, 0);
  },

  home_books_stack({ g, M, w, d, h, T, seed }) {
    const n = 5;
    const th = (h - 0.05) / n;
    for (let i = 0; i < n; i++) {
      const sw = w * (1 - 0.1 * ((i * 2 + seed) % 3));
      const sd = d * (1 - 0.08 * ((i + seed) % 3));
      const col = [0xb04a3a, 0x3b5c8a, 0x4f7a4c, 0xd0a23a, 0x7a4a7a][(i + seed) % 5];
      const b = box(g, T(col), sw * 0.96, th * 0.84, sd * 0.96, 0, i * th, 0);
      b.rotation.y = (rnd(seed + i) - 0.5) * 0.4;
      box(g, T(0xf3ecd9), sw * 0.9, th * 0.6, sd * 0.9, 0.012, i * th + th * 0.12, 0.004).rotation.y = b.rotation.y;
    }
    // Tasse oben auf dem Stapel
    cyl(g, T(0xf4efe4), 0.035, 0.05, 0.03, n * th, 0.01, 16);
    cyl(g, T(0x4a2f1c), 0.03, 0.004, 0.03, n * th + 0.044, 0.01, 16);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 6, 10, Math.PI), T(0xf4efe4));
    handle.rotation.z = -Math.PI / 2;
    place(g, handle, 0.065, n * th + 0.026, 0.01);
  },

  home_vase({ g, M, w, d, h, T, seed }) {
    const r = Math.min(w, d) / 2;
    const vh = h * 0.34;
    const col = [0xf2efe6, 0x6c93a8, 0xc77d4f][seed % 3];
    lathe(g, tint(M, col, { side: THREE.DoubleSide }), [[0.001, 0], [0.5 * r, 0], [0.82 * r, vh * 0.35], [0.8 * r, vh * 0.55], [0.45 * r, vh * 0.88], [0.5 * r, vh], [0.4 * r, vh], [0.38 * r, vh * 0.9]], 0, 0, 0, 24);
    const heads = [0xe0457b, 0xf2c84b, 0xf5f2ea, 0xe8844a, 0x8e6ae0];
    const n = 9;
    const mouth = [0, vh * 0.92, 0];
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + seed;
      const rr = r * (0.2 + 0.7 * ((i * 5) % 9) / 9);
      const ty = vh + (h - vh - 0.05) * (0.35 + 0.65 * (((i * 7) % 9) / 9));
      const tip = [Math.cos(a) * rr, ty, Math.sin(a) * rr * 0.9];
      rod(g, T(0x4d7a3c), [Math.cos(a) * 0.01, mouth[1], Math.sin(a) * 0.01], tip, 0.0035, 5);
      ball(g, T(heads[i % heads.length]), 0.034, tip[0], tip[1] + 0.012, tip[2], 9);
      ball(g, T(0xf2c84b), 0.012, tip[0], tip[1] + 0.03, tip[2] + 0.008, 6);
    }
    for (let i = 0; i < 4; i++) leaf(g, T(i % 2 ? 0x3f8f4a : 0x56a24c), 0.12, 0.035, 0, vh * 0.95, 0, i * 1.57 + 0.4, 0.55);
  },

  home_candles({ g, M, w, d, h, T }) {
    box(g, T(0xb08a52, { metalness: 0.5, roughness: 0.4 }), w, 0.014, d, 0, 0, 0);
    const wax = [0xf2ead8, 0xc77d4f, 0xe9dcc0, 0x7a8c6e];
    const list = [[-0.3, 0.0, 0.034, 0.9], [0.0, -0.02, 0.027, 0.62], [0.27, 0.02, 0.032, 0.48], [-0.1, 0.05, 0.02, 0.34]];
    list.forEach(([fx, z, r, fh], i) => {
      const ch = (h - 0.05) * fh;
      cyl(g, T(wax[i]), r, ch, fx * w, 0.014, z * d / 0.18 * 0.6, 16);
      cyl(g, T(0x2a2522), 0.0025, 0.012, fx * w, 0.014 + ch, z * d / 0.18 * 0.6, 5);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.032, 7), flameMat("core"));
      place(g, fl, fx * w, 0.014 + ch + 0.024, z * d / 0.18 * 0.6);
    });
  },

  home_globe({ g, M, w, d, h, T }) {
    const RR = Math.min(w / 2 - 0.02, (h - 0.07) / 2);
    const R = RR - 0.02;
    const cy = 0.06 + RR;
    cyl(g, T(0x5a3d28), Math.min(0.1, w * 0.3), 0.02, 0, 0, 0, 24);
    cyl(g, T(0x5a3d28), 0.012, 0.045, 0, 0.02, 0, 8);
    const brass = T(0xc9a24a, { metalness: 0.7, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RR, 0.006, 6, 40), brass);
    place(g, ring, 0, cy, 0);
    const tilt = new THREE.Group();
    tilt.position.set(0, cy, 0);
    tilt.rotation.z = 0.41;
    g.add(tilt);
    ball(tilt, T(0x3f7fb0), R, 0, 0, 0, 24);
    const land = [0x5a9a54, 0x8aa65a, 0xcdb87a];
    [[0.6, 0.5, 0.65], [-0.5, 0.6, 0.62], [0.2, -0.2, 0.96], [-0.7, -0.3, 0.64], [0.45, -0.7, 0.55], [0.0, 0.92, 0.38]].forEach(([x, y, z], i) => {
      const v = new THREE.Vector3(x, y, z).normalize();
      const patch = ball(tilt, T(land[i % 3]), R * (0.26 + 0.08 * rnd(i + 3)), v.x * R * 0.97, v.y * R * 0.97, v.z * R * 0.97, 8);
      patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().negate()); // flache Seite zur Kugelmitte
      patch.scale.z = 0.3;
    });
    rod(tilt, brass, [0, -R - 0.012, 0], [0, R + 0.012, 0], 0.004, 6);
  },

  home_cushions({ g, M, w, d, h, T }) {
    const s = Math.min(w / 0.8, h / 0.45);
    pillow(g, T(0xd9a93a), 0.38 * s, 0.38 * s, 0.16, -0.27 * w, -d * 0.05, 0.28);
    pillow(g, T(0x2f7d7a), 0.3 * s, 0.3 * s, 0.14, 0, d * 0.02, 0.2, 0.785);
    const right = pillow(g, T(0xb8643b), 0.36 * s, 0.36 * s, 0.16, 0.27 * w, -d * 0.04, 0.26);
    // Knopf in der Mitte (in der Gruppe des Kissens, damit er mitkippt)
    ball(right, T(0xf2ead8), 0.014, 0, 0, 0.082, 6);
  },

  home_blanket({ g, M, w, d, h, T }) {
    const lh = h / 3;
    const cols = [0xcfc6b4, 0xe7dfce, 0xd7cdb8];
    for (let i = 0; i < 3; i++) {
      const l = box(g, T(cols[i]), w * (1 - i * 0.04), lh * 0.92, d * (1 - i * 0.05), (i - 1) * 0.008, i * lh, 0);
      l.rotation.y = (i - 1) * 0.05;
      box(g, T(0xc9863a), w * (1 - i * 0.04) * 1.002, lh * 0.2, 0.006, (i - 1) * 0.008, i * lh + lh * 0.4, d * (1 - i * 0.05) * 0.5 + 0.002).rotation.y = (i - 1) * 0.05;
    }
    // Fransen
    for (let i = 0; i < 12; i++) box(g, T(0xcfc6b4), 0.006, lh * 0.5, 0.012, -w / 2 + 0.02 + (i * (w - 0.04)) / 11, 0, d / 2 + 0.002);
  },

  home_magazines({ g, M, w, d, h, T }) {
    const rattan = T(0xc9a06a);
    box(g, rattan, w, h * 0.62, d, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      box(g, T(0xa97f4a), w * 1.01, 0.012, d * 1.01, 0, h * (0.07 + i * 0.11), 0);
    }
    box(g, T(0xa97f4a), w * 1.03, 0.025, d * 1.03, 0, h * 0.6, 0);
    for (const sx of [-1, 1]) barX(g, T(0xa97f4a), 0.012, 0.02, sx * (w / 2 + 0.008), h * 0.45, 0, 8);
    const covers = [0xb04a3a, 0x3b5c8a, 0xe8c25a, 0x4f7a4c, 0x7a4a7a];
    for (let i = 0; i < 5; i++) {
      const mw = d * 0.7;
      const mh = h * 0.7;
      const m = box(g, T(covers[i]), mw, mh, 0.005, -w * 0.3 + i * w * 0.15, h * 0.1, (i % 2 ? 1 : -1) * d * 0.04);
      m.rotation.set(-0.12 + (i % 2) * 0.05, Math.PI / 2 + (i - 2) * 0.05, (i - 2) * 0.05);
      m.position.y = h * 0.1 + mh / 2 * 0.97;
    }
  },

  home_pouf({ g, M, w, d, h, T }) {
    const R = Math.min(w, d) / 2;
    const fy = 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, T(0x7a5230), 0.02, fy, sx * R * 0.5, 0, sz * R * 0.5, 8, 0.016);
    lathe(g, tint(M, 0xc98a5a, { side: THREE.DoubleSide }), [[0.001, fy], [0.84 * R, fy], [R, fy + (h - fy) * 0.18], [R, fy + (h - fy) * 0.78], [0.92 * R, h - 0.012], [0.55 * R, h], [0.001, h]], 0, 0, 0, 28);
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 0.006, 6, 36), T(0x6a4a30));
    band.rotation.x = Math.PI / 2;
    place(g, band, 0, fy + (h - fy) * 0.5, 0);
    // Knopf oben
    ball(g, T(0x6a4a30), 0.018, 0, h, 0, 8);
  },

  home_beanbag({ g, M, w, d, h, T }) {
    const seat = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.fabric);
    seat.scale.set(w * 0.5, h * 0.42, d * 0.5);
    place(g, seat, 0, h * 0.42, d * 0.02);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.fabric);
    back.scale.set(w * 0.44, h * 0.48, d * 0.28);
    back.rotation.x = -0.3;
    place(g, back, 0, h * 0.5, -d * 0.2);
    // Haltegriff
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), T(0x3a3a3a));
    place(g, loop, 0, h * 0.88, -d * 0.25);
  },

  home_side_table({ g, M, w, d, h, T }) {
    const R = Math.min(w, d) / 2;
    cyl(g, M.wood, R, 0.03, 0, h - 0.03, 0, 32);
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 + 0.5;
      rod(g, T(0x5a3d28), [Math.cos(a) * R * 0.62, h - 0.03, Math.sin(a) * R * 0.62], [Math.cos(a) * R * 0.86, 0, Math.sin(a) * R * 0.86], 0.014, 8);
    }
    cyl(g, T(0x5a3d28), R * 0.72, 0.02, 0, h * 0.28, 0, 28);
    // Zeitschrift unten, Untersetzer und Tasse oben wären zu hoch – nur eine Zeitschrift im Ablageboden
    box(g, T(0x3b5c8a), R * 0.7, 0.012, R * 0.5, 0.02, h * 0.28 + 0.02, 0.01).rotation.y = 0.3;
  },

  home_reading_chair({ g, M, w, d, h, T }) {
    const fab = M.fabric;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, T(0x7a5230), 0.016, 0.16, sx * (w / 2 - 0.09), 0, sz * (d / 2 - 0.09), 8, 0.022);
    box(g, fab, w, 0.2, d, 0, 0.15, 0);
    box(g, fab, w - 0.28, 0.1, d - 0.22, 0, 0.35, 0.08);
    const back = new THREE.Group();
    box(back, fab, w, h - 0.35, 0.2, 0, 0, 0);
    back.rotation.x = -0.12;
    back.position.set(0, 0.35, -d / 2 + 0.17);
    g.add(back);
    for (const sx of [-1, 1]) {
      box(g, fab, 0.14, 0.27, d - 0.1, sx * (w / 2 - 0.07), 0.35, 0.05);
      barZ(g, fab, 0.075, d - 0.1, sx * (w / 2 - 0.07), 0.64, 0.05, 14);
    }
    // Wolldecke über der linken Armlehne und auf dem Sitz
    const wool = T(0xe7dfce);
    box(g, wool, 0.15, 0.035, 0.55, -(w / 2 - 0.075), 0.7, 0.1);
    box(g, T(0xc9863a), 0.15, 0.037, 0.05, -(w / 2 - 0.075), 0.7, 0.3);
    box(g, T(0xc9863a), 0.15, 0.037, 0.05, -(w / 2 - 0.075), 0.7, -0.1);
    const fall = box(g, wool, 0.34, 0.035, 0.45, -w * 0.12, 0.45, 0.16);
    fall.rotation.z = -0.1;
    // kleines Kissen im Rücken
    pillow(g, T(0xd9a93a), 0.3, 0.3, 0.14, w * 0.18, -d / 2 + 0.3, 0.25).position.y += 0.45;
  },

  home_rocking_chair({ g, M, w, d, h, T }) {
    const wood = T(0x8a5a32);
    const R = 1.0;
    const half = Math.asin(Math.min(0.99, d / 2 / R));
    const sx = w / 2 - 0.045;
    const seatY = 0.44;
    const yAt = (z) => R + 0.015 - Math.sqrt(R * R - z * z);
    for (const s of [-1, 1]) {
      arcYZ(g, wood, R, 0.015, Math.PI - half, Math.PI + half, s * sx, R + 0.015, 0, 28);
      for (const z of [-d * 0.28, d * 0.28]) rod(g, wood, [s * (sx - 0.01), yAt(z), z], [s * (sx - 0.02), seatY, z * 0.8], 0.016, 8);
      // Armlehne
      rod(g, wood, [s * (sx - 0.02), seatY + 0.22, -d * 0.2], [s * (sx - 0.02), seatY + 0.2, d * 0.2], 0.02, 8);
      rod(g, wood, [s * (sx - 0.02), seatY, d * 0.18], [s * (sx - 0.02), seatY + 0.2, d * 0.18], 0.014, 6);
    }
    box(g, wood, w - 0.1, 0.04, d * 0.55, 0, seatY - 0.04, 0.02);
    box(g, T(0xcfc6b4), w - 0.14, 0.06, d * 0.5, 0, seatY, 0.03);
    // Rückenlehne mit Sprossen
    const back = new THREE.Group();
    back.rotation.x = -0.22;
    back.position.set(0, seatY - 0.02, -d * 0.2);
    g.add(back);
    for (let i = 0; i < 5; i++) box(back, wood, 0.03, h - seatY - 0.06, 0.02, -w * 0.32 + i * w * 0.16, 0.04, 0);
    box(back, wood, w - 0.1, 0.07, 0.03, 0, h - seatY - 0.15, 0);
    box(back, wood, w - 0.1, 0.05, 0.03, 0, 0.03, 0);
  },

  home_piano({ g, M, w, d, h, T }) {
    const body = M.dark;
    const dc = d - 0.12;
    const zc = -d / 2 + dc / 2;
    const frontZ = -d / 2 + dc;
    const side = 0.07;
    box(g, body, w - 0.04, 0.08, dc - 0.04, 0, 0, zc);
    box(g, body, w, 0.54, dc, 0, 0.08, zc);
    box(g, T(0x1f1c1a), w - 0.2, 0.36, 0.01, 0, 0.14, frontZ + 0.002);
    // Tastaturplatte, Tasten, Filz
    box(g, body, w - 0.04, 0.07, 0.14, 0, 0.62, frontZ + 0.03);
    const kx0 = -w / 2 + 0.1;
    const kw = w - 0.2;
    box(g, T(0xf6f2ea), kw, 0.02, 0.15, 0, 0.69, frontZ + 0.025);
    const white = Math.max(14, Math.round(kw / 0.0235 / 7) * 7);
    const wk = kw / white;
    for (let o = 0; o * 7 < white; o++) for (const i of [0, 1, 3, 4, 5]) if (o * 7 + i + 1 < white) box(g, T(0x1a1a1c), wk * 0.58, 0.014, 0.09, kx0 + (o * 7 + i + 1) * wk, 0.71, frontZ - 0.005);
    box(g, T(0x8a2a2a), kw, 0.012, 0.02, 0, 0.71, frontZ - 0.045);
    // Seitenwangen und Rückteil über der Tastatur
    for (const s of [-1, 1]) box(g, body, side, 0.9 - 0.7 + 0.35, dc, s * (w / 2 - side / 2), 0.7, zc);
    box(g, body, w - 2 * side, 0.4, dc * 0.55, 0, 0.7, -d / 2 + dc * 0.275);
    // Notenpult
    const stand = box(g, T(0x5a3d28), w * 0.6, 0.26, 0.015, 0, 0, 0);
    stand.geometry.translate(0, 0.13, 0);
    stand.position.set(0, 0.95, -d / 2 + dc * 0.55 + 0.02);
    stand.rotation.x = -0.2;
    const notes = box(g, T(0xf6f2ea), w * 0.4, 0.2, 0.004, 0, 0, 0);
    notes.geometry.translate(0, 0.1, 0);
    notes.position.set(0, 0.97, -d / 2 + dc * 0.55 + 0.035);
    notes.rotation.x = -0.2;
    for (let i = 0; i < 4; i++) {
      const l = box(g, T(0x1a1a1c), w * 0.34, 0.003, 0.002, 0, 0, 0);
      l.position.set(0, 1.0 + i * 0.04, -d / 2 + dc * 0.55 + 0.028 - i * 0.008);
      l.rotation.x = -0.2;
    }
    // Deckel und Pedale
    box(g, body, w + 0.02, 0.05, dc + 0.03, 0, h - 0.05, zc + 0.01);
    for (const s of [-1, 1]) box(g, M.metal, 0.04, 0.012, 0.07, s * w * 0.04, 0.0, frontZ + 0.03);
    for (const s of [-1, 1]) rod(g, M.metal, [s * w * 0.04, 0.012, frontZ + 0.001], [s * w * 0.04, 0.12, frontZ + 0.001], 0.004, 5);
  },

  home_guitar({ g, M, w, d, h, T }) {
    const brass = M.metal;
    // Ständer: Dreibein mit Auflage
    const topY = 0.46;
    rod(g, brass, [0, topY, 0], [0, 0.06, 0], 0.012, 8);
    for (const [x, z] of [[0, d * 0.42], [-w * 0.4, -d * 0.36], [w * 0.4, -d * 0.36]]) rod(g, brass, [0, 0.12, 0], [x, 0, z], 0.01, 6);
    box(g, T(0x2a2522), w * 0.5, 0.03, 0.05, 0, 0.14, 0.0);
    // Gitarre, leicht nach hinten geneigt
    const gt = new THREE.Group();
    gt.position.set(0, 0.16, 0.0);
    gt.rotation.x = -0.1;
    g.add(gt);
    const body = T(0xc98a4a);
    const lower = ball(gt, body, 1, 0, 0.16, 0, 18);
    lower.scale.set(w * 0.42, 0.17, 0.05);
    const upper = ball(gt, body, 1, 0, 0.36, 0, 18);
    upper.scale.set(w * 0.32, 0.13, 0.05);
    const waist = ball(gt, body, 1, 0, 0.27, 0, 14);
    waist.scale.set(w * 0.27, 0.1, 0.05);
    disc(gt, T(0x1f1a17), 0.045, 0, 0.3, 0.049, 0.006, 20);
    box(gt, T(0x3a2a1c), 0.1, 0.02, 0.01, 0, 0.14, 0.05);
    box(gt, T(0x3a2a1c), 0.04, 0.34, 0.025, 0, 0.4, -0.005);
    box(gt, T(0x1f1a17), 0.043, 0.28, 0.004, 0, 0.44, 0.01);
    box(gt, T(0x3a2a1c), 0.06, 0.12, 0.02, 0, 0.72, -0.008);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ball(gt, M.metal, 0.008, s * 0.036, 0.745 + i * 0.035, -0.008, 6);
  },

  home_turntable({ g, M, w, d, h, T }) {
    const pw = w * 0.56;
    const px = -w / 2 + pw / 2;
    const wood = T(0x6a4a30);
    box(g, wood, pw, 0.085, d, px, 0, 0);
    box(g, T(0x1f1c1a), pw - 0.04, 0.004, d - 0.04, px, 0.085, 0);
    // Schallplatte liegt flach auf dem Teller, mit rotem Etikett und Spindel
    cyl(g, T(0x151515), 0.14, 0.008, px - 0.04, 0.089, 0.0, 32);
    cyl(g, T(0xc43a2f), 0.045, 0.002, px - 0.04, 0.097, 0.0, 20);
    cyl(g, M.metal, 0.006, 0.012, px - 0.04, 0.097, 0.0, 8);
    // Tonarm
    cyl(g, M.metal, 0.018, 0.03, px + pw * 0.34, 0.085, -d * 0.3, 12);
    rod(g, M.metal, [px + pw * 0.34, 0.11, -d * 0.3], [px + 0.02, 0.1, d * 0.12], 0.004, 6);
    box(g, T(0x2a2522), 0.025, 0.012, 0.03, px + 0.02, 0.1, d * 0.12);
    // Plattenregal: Kiste mit Hüllen
    const rw = w - pw - 0.04;
    const rx = w / 2 - rw / 2;
    box(g, wood, rw, 0.02, d, rx, 0, 0);
    box(g, wood, 0.02, h, d, rx - rw / 2 + 0.01, 0, 0);
    box(g, wood, 0.02, h, d, rx + rw / 2 - 0.01, 0, 0);
    box(g, wood, rw, h * 0.45, 0.02, rx, 0, d / 2 - 0.01);
    const cols = [0xb04a3a, 0x3b5c8a, 0xd0a23a, 0x2e3a4a, 0x4f7a4c, 0xc8b89a, 0x8a3b4a, 0x5a8a8a];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const s = box(g, T(cols[i % cols.length]), 0.008, h * 0.92, d * 0.9, rx - rw / 2 + 0.04 + (i * (rw - 0.08)) / (n - 1), 0.02, -0.01);
      s.rotation.z = (i - 3) * 0.015;
    }
  },

  home_screen({ g, M, w, d, h, T }) {
    const n = 4;
    const depth = Math.max(0.05, d - 0.05);
    const th = Math.atan2(depth, w / n);
    const pw = w / n / Math.cos(th);
    const wood = T(0x8a5a32);
    const cloth = T(0xe3d7bd);
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? -1 : 1;
      const p = new THREE.Group();
      box(p, wood, 0.035, h, 0.03, -pw / 2 + 0.0175, 0, 0);
      box(p, wood, 0.035, h, 0.03, pw / 2 - 0.0175, 0, 0);
      box(p, wood, pw, 0.05, 0.03, 0, 0, 0);
      box(p, wood, pw, 0.06, 0.03, 0, h - 0.06, 0);
      box(p, cloth, pw - 0.06, h - 0.15, 0.012, 0, 0.05, 0);
      for (let k = 1; k < 4; k++) box(p, T(0xc9b890), pw - 0.06, 0.008, 0.016, 0, 0.05 + ((h - 0.15) * k) / 4, 0);
      for (let k = 1; k < 3; k++) box(p, T(0xc9b890), 0.008, h - 0.15, 0.016, -pw / 2 + 0.03 + ((pw - 0.06) * k) / 3, 0.05, 0);
      p.position.set(-w / 2 + (i + 0.5) * (w / n), 0, 0);
      p.rotation.y = s * th;
      g.add(p);
    }
  },

  home_rug_round({ g, M, w, d, h, T }) {
    const R = Math.min(w, d) / 2;
    const rings = [[1, 0x8a6a4a], [0.9, 0xe7dfce], [0.78, 0xb8643b], [0.62, 0xe7dfce], [0.46, 0x5f7a8a], [0.3, 0xe7dfce], [0.14, 0xd9a93a]];
    rings.forEach(([k, c], i) => cyl(g, T(c), R * k, h * (0.55 + (0.45 * (i + 1)) / rings.length), 0, 0, 0, 40));
  },
};

const BUILDERS = { ...DECO, ...PLANTS, ...KITCHEN, ...FIRE, ...CURTAINS, ...PETS, ...KIDS };

/** Typen mit Griffen, Knöpfen oder Türen vorn: so viel flacher wird der Körper gebaut (m). */
const FRONT_DETAILS = { home_oven_tall: 0.05, home_play_kitchen: 0.04, home_espresso: 0.04, home_microwave: 0.03, home_toaster: 0.03, home_wine_fridge: 0.03, home_hood_wall: 0.03 };

/**
 * Baut einen Typ dieses Katalogs in die Gruppe g; false, wenn der Typ nicht dazugehört.
 * M: Materialien des Stils (furnitureMaterials), item: das Möbelstück (eigene Felder wie fire und open).
 */
export function buildHome(type, w, d, h, M, g, bulbs, item = {}) {
  if (!Object.hasOwn(BUILDERS, type)) return false;
  const T = (c, extra) => tint(M, c, extra);
  const inset = FRONT_DETAILS[type] ?? 0;
  if (!inset) {
    BUILDERS[type]({ g, M, w, d, h, bulbs, item, T, seed: seedOf(item) });
    return true;
  }
  // Geräte mit Griffen und Knöpfen vorn: Körper etwas flacher bauen und nach hinten schieben, damit die Details im Rahmen bleiben
  const sub = new THREE.Group();
  sub.position.z = -inset / 2;
  g.add(sub);
  BUILDERS[type]({ g: sub, M, w, d: d - inset, h, bulbs, item, T, seed: seedOf(item) });
  return true;
}
