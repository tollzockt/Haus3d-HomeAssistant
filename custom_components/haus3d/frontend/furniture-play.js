// 3D-Modelle des Katalogs „Spiel & Freizeit“ (catalog-garden.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.

import { THREE, at, ballG, box, boxG, cyl, cylG, merged, palette, place, ring, rng, rodG, tint } from "./garden-parts.js";

const PI = Math.PI;

/** Geometrie flach schattiert (Prismen, Stümpfe mit wenigen Ecken). */
function flat(geo) {
  const out = geo.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

/** Dreiecksprisma (Giebel): Grundbreite bw entlang x, Höhe ph, Tiefe pd entlang z, Unterkante bei y, Spitze oben. */
const prismG = (bw, ph, pd, x = 0, y = 0, z = 0) => flat(at(new THREE.CylinderGeometry(1, 1, 1, 3), [x, y + ph / 3, z], [-PI / 2, 0, 0], [bw / Math.sqrt(3), pd, ph / 1.5]));

/** Satteldach, First entlang z: zwei geneigte Platten (Mitte cx, First yr, halbe Spannweite s, Fall t, Länge dl, Mitte z). */
function roofG(cx, yr, s, t, dl, z = 0, th = 0.03) {
  const a = Math.atan2(t, s);
  const L = Math.hypot(s, t) + th;
  return [-1, 1].map((k) => boxG(L, th, dl, cx + (k * s) / 2, yr - t / 2 - th / 2, z, [0, 0, -k * a]));
}

/** Geneigte Platte von (xa, ya) nach (xb, yb) in der x-y-Ebene: Dicke th, Breite wz, Mitte z, Versatz off senkrecht zur Bahn. */
function slabG(xa, ya, xb, yb, th, wz, z = 0, off = 0) {
  const a = Math.atan2(yb - ya, xb - xa);
  const L = Math.hypot(xb - xa, yb - ya);
  return boxG(L, th, wz, (xa + xb) / 2 - Math.sin(a) * off, (ya + yb) / 2 + Math.cos(a) * off - th / 2, z, [0, 0, a]);
}

/** Platte aus einem Vieleck in der x-z-Ebene (pts: [[x, z], …]), Dicke th, Unterkante bei y. */
function plateG(pts, th, y = 0) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  return at(new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false }), [0, y + th, 0], [PI / 2, 0, 0]);
}

/** Flaches Vieleck in der z-y-Ebene bei x (Netz-Seitenteil): pts [[z, y], …]. */
function sideG(pts, x) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  return at(new THREE.ShapeGeometry(shape), [x, 0, 0], [0, -PI / 2, 0]);
}

/** Baut einen Typ dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildPlay(type, w, d, h, M, g, bulbs, item = {}) {
  switch (type) {
    // Schaukel: A-Böcke aus Rundholz mit Querriegeln und Bodenankern, Querbalken längs x, Brettsitz und Kleinkindsitz an Seilen,
    // Schwingebene entlang z
    case "garden_swing": {
      const P = palette(M);
      const rope = tint(M, 0xcdb78a, { roughness: 0.95 });
      const bh = 0.12;
      const yb = h - bh; // Unterkante Balken
      const yk = yb + bh / 2; // Kopfpunkt der Beine
      const lx = w / 2 - 0.12;
      const sp = d / 2 - 0.06; // halbe Spreizung am Boden
      const yq = Math.min(0.8, h * 0.38);
      const zq = sp * (1 - yq / yk);
      box(g, M.wood, w, bh, 0.1, 0, yb, 0);
      const legs = [];
      const iron = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          legs.push(rodG([sx * lx, 0, sz * sp], [sx * lx, yk, sz * 0.03], 0.055, 8));
          iron.push(boxG(0.13, 0.05, 0.13, sx * lx, 0, sz * sp));
        }
        legs.push(boxG(0.04, 0.09, 2 * zq + 0.16, sx * (lx + 0.075), yq, 0));
        // Kopfbeschlag über der Gabel
        iron.push(boxG(0.012, 0.22, 0.24, sx * (lx + 0.062), yb - 0.1, 0));
      }
      merged(g, M.wood, legs);
      const xa = -w * 0.2;
      const xb = w * 0.21;
      const ys = Math.min(0.45, h * 0.22);
      const ropes = [];
      // Brettsitz
      for (const s of [-1, 1]) {
        ropes.push(rodG([xa + s * 0.21, yb, 0], [xa + s * 0.21, ys + 0.03, 0], 0.011, 5));
        iron.push(boxG(0.03, 0.05, 0.05, xa + s * 0.21, yb - 0.04, 0));
      }
      box(g, P.teak, 0.5, 0.035, 0.18, xa, ys, 0);
      // Kleinkindsitz: Wanne mit Rücken, Seitenwangen, Steg und Bügel vorn
      const y0 = ys + 0.06;
      merged(g, P.red, [
        boxG(0.34, 0.04, 0.26, xb, y0, 0),
        boxG(0.34, 0.3, 0.04, xb, y0, -0.13),
        boxG(0.035, 0.2, 0.26, xb - 0.17, y0, 0),
        boxG(0.035, 0.2, 0.26, xb + 0.17, y0, 0),
        boxG(0.08, 0.13, 0.04, xb, y0 - 0.02, 0.12),
        rodG([xb - 0.17, y0 + 0.19, 0.13], [xb + 0.17, y0 + 0.19, 0.13], 0.024, 8),
      ]);
      for (const s of [-1, 1]) {
        iron.push(boxG(0.03, 0.05, 0.05, xb + s * 0.17, yb - 0.04, 0));
        for (const [zz, yy] of [[0.12, y0 + 0.2], [-0.13, y0 + 0.3]]) ropes.push(rodG([xb + s * 0.17, yb - 0.03, 0], [xb + s * 0.17, yy, zz], 0.011, 5));
      }
      merged(g, rope, ropes);
      merged(g, P.steelD, iron);
      return true;
    }

    // Spielturm: Holzturm links auf vier Pfosten mit Plattform und Brüstung, Satteldach als gestreifte Plane, Leiter vorn,
    // Kletterwand mit Griffen links, Rutsche mit Seitenborden nach rechts, Sandkiste unter dem Turm
    case "garden_play_tower": {
      const P = palette(M);
      const tw = Math.min(1.2, d - 0.2);
      const tx = -w / 2 + tw / 2 + 0.1;
      const yp = Math.min(1.25, h * 0.47); // Plattform
      const ye = h - 0.62; // Oberkante Pfosten
      const yr = h - 0.035; // First
      const ps = 0.09;
      const hp = tw / 2 - ps / 2;
      const wood = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(boxG(ps, ye, ps, tx + sx * hp, 0, sz * hp));
      for (const s of [-1, 1]) {
        wood.push(boxG(tw - 2 * ps, 0.09, 0.05, tx, ye - 0.09, s * hp)); // Rähm
        wood.push(boxG(0.05, 0.1, tw - 2 * ps, tx + s * hp, yp - 0.15, 0)); // Riegel unter der Plattform
      }
      merged(g, M.wood, wood);
      // Plattform und Brüstung (Bretter hinten und links, rechts mit Öffnung für die Rutsche, vorn Handlauf)
      const deck = [boxG(tw, 0.05, tw, tx, yp - 0.05, 0)];
      for (const yy of [0.1, 0.3, 0.5]) {
        deck.push(boxG(tw - ps, 0.13, 0.025, tx, yp + yy, -hp));
        deck.push(boxG(0.025, 0.13, tw - ps, tx - hp, yp + yy, 0));
        for (const s of [-1, 1]) deck.push(boxG(0.025, 0.13, hp - 0.3, tx + hp, yp + yy, s * (0.3 + (hp - 0.3) / 2)));
      }
      deck.push(boxG(tw - ps, 0.07, 0.04, tx, yp + 0.62, hp));
      merged(g, P.woodL, deck);
      // Dach: Plane in Bahnen grün/weiß, Giebelbretter vorn und hinten
      const s = tw / 2 + 0.12;
      const t = ((yr - ye - 0.03) * s) / (tw / 2);
      const n = 6;
      const lanes = [[], []];
      for (let i = 0; i < n; i++) lanes[i % 2].push(...roofG(tx, yr, s, t, (tw + 0.2) / n, -(tw + 0.2) / 2 + ((i + 0.5) * (tw + 0.2)) / n, 0.025));
      merged(g, tint(M, 0x3a8a4a, { roughness: 0.9 }), lanes[0]);
      merged(g, P.cream, lanes[1]);
      merged(g, M.wood, [prismG(tw - 0.04, yr - ye - 0.07, 0.03, tx, ye, hp), prismG(tw - 0.04, yr - ye - 0.07, 0.03, tx, ye, -hp)]);
      // Leiter vorn (schräg)
      const z0 = hp + 0.05;
      const z1 = Math.min(d / 2 + 0.22, z0 + 0.32);
      const lad = [];
      for (const k of [-1, 1]) lad.push(rodG([tx + k * 0.23, 0, z1], [tx + k * 0.23, yp + 0.1, z0], 0.03, 6));
      merged(g, M.wood, lad);
      const steps = [];
      for (let i = 1; i <= 4; i++) {
        const f = i / 5;
        steps.push(boxG(0.44, 0.03, 0.1, tx, yp * f, z1 + (z0 - z1) * f));
      }
      merged(g, P.woodL, steps);
      // Kletterwand links mit Griffen in zwei Farben
      const xw = tx - tw / 2 - 0.02;
      box(g, P.blue, 0.03, yp - 0.12, tw - 0.24, xw, 0.08, 0);
      const r = rng(5);
      const holds = [[], []];
      for (let i = 0; i < 9; i++) {
        const yy = 0.22 + ((yp - 0.35) * i) / 8;
        holds[i % 2].push(ballG(0.04, xw - 0.025, yy, (i % 3 - 1) * 0.25 + (r() - 0.5) * 0.12, [0.6, 0.8, 1.2], 6));
      }
      merged(g, P.yellow, holds[0]);
      merged(g, P.red, holds[1]);
      // Rutsche: geneigte Bahn und flacher Auslauf mit Seitenborden, Stützen am Ende
      const x0 = tx + tw / 2 - 0.02;
      const x2 = w / 2 - 0.02;
      const x1 = x2 - 0.45;
      const y1 = 0.32;
      const slide = tint(M, 0x2f7fd0, { roughness: 0.35 });
      merged(g, slide, [slabG(x0, yp, x1 + 0.02, y1 - 0.01, 0.03, 0.5, 0, -0.015), slabG(x1 - 0.02, y1 + 0.01, x2, y1 - 0.03, 0.03, 0.5, 0, -0.015)]);
      const rim = [];
      for (const k of [-1, 1]) rim.push(slabG(x0, yp, x1 + 0.02, y1 - 0.01, 0.15, 0.035, k * 0.265, 0.06), slabG(x1 - 0.02, y1 + 0.01, x2, y1 - 0.03, 0.15, 0.035, k * 0.265, 0.06));
      merged(g, P.yellow, rim);
      merged(g, P.steel, [rodG([x2 - 0.14, 0, -0.2], [x2 - 0.14, y1 - 0.05, -0.2], 0.022, 6), rodG([x2 - 0.14, 0, 0.2], [x2 - 0.14, y1 - 0.05, 0.2], 0.022, 6), rodG([x2 - 0.14, 0.1, -0.2], [x2 - 0.14, 0.1, 0.2], 0.015, 6)]);
      // Sandkiste unter dem Turm
      const sb = tw - 2 * ps;
      merged(g, P.woodD, [boxG(sb, 0.14, 0.03, tx, 0, sb / 2 - 0.015), boxG(sb, 0.14, 0.03, tx, 0, -sb / 2 + 0.015), boxG(0.03, 0.14, sb, tx - sb / 2 + 0.015, 0, 0), boxG(0.03, 0.14, sb, tx + sb / 2 - 0.015, 0, 0)]);
      merged(g, P.sand, [boxG(sb - 0.06, 0.09, sb - 0.06, tx, 0, 0), ballG(0.2, tx + 0.12, 0.09, -0.1, [1, 0.35, 1], 8)]);
      return true;
    }

    // Trampolin: Rahmenring auf sechs Beinen mit W-Füßen, schwarze Sprungmatte, Federkranz unter dem Randpolster,
    // Sicherheitsnetz als offener Zylinder an sechs gepolsterten Stangen mit Netzring, Reißverschluss und Leiter vorn
    case "garden_trampoline": {
      const P = palette(M);
      const R = Math.min(w, d) / 2 - 0.06;
      const yf = Math.min(0.85, h * 0.36);
      const n = 6;
      const ang = Array.from({ length: n }, (_, i) => (i / n) * 2 * PI);
      const cs = (a, rr, y) => [Math.cos(a) * rr, y, Math.sin(a) * rr];
      ring(g, P.steel, R, 0.025, 0, yf, 0, "y", 48, 6);
      cyl(g, P.black, R - 0.25, 0.012, 0, yf - 0.02, 0, 40);
      const springs = [];
      for (let i = 0; i < 40; i++) {
        const a = ((i + 0.5) / 40) * 2 * PI;
        springs.push(rodG(cs(a, R - 0.26, yf - 0.012), cs(a, R - 0.02, yf), 0.008, 4));
      }
      merged(g, P.steel, springs);
      const pad = ring(g, P.blue, R - 0.14, 0.14, 0, yf + 0.025, 0, "y", 48, 8);
      pad.scale.z = 0.24;
      // Beine: senkrecht, je zwei unten zu einem Bogen verbunden; Netzstangen außen
      const legs = [];
      const poles = [];
      const foam = [];
      const Rp = R + 0.05;
      ang.forEach((a, i) => {
        legs.push(rodG(cs(a, R, 0.025), cs(a, R, yf), 0.022, 8));
        if (i % 2 === 0) legs.push(rodG(cs(a, R, 0.022), cs(ang[i + 1], R, 0.022), 0.022, 8));
        poles.push(rodG(cs(a, Rp, yf - 0.14), cs(a, Rp, h - 0.03), 0.02, 8), rodG(cs(a, R, yf - 0.1), cs(a, Rp, yf - 0.1), 0.015, 6), rodG(cs(a, Rp, h - 0.03), cs(a, R - 0.03, h - 0.08), 0.015, 6));
        foam.push(cylG(0.045, h - 0.28 - yf, ...cs(a, Rp, 0).map((v, k) => (k === 1 ? yf + 0.1 : v)), 10));
      });
      merged(g, P.steel, legs);
      merged(g, P.steelD, poles);
      merged(g, P.blue, foam);
      // Netz: offener Zylinder, oben ein Netzring, vorn ein Reißverschluss als Einstieg
      const hn = h - 0.08 - (yf + 0.03);
      place(g, new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, hn, 36, 1, true), P.mesh), 0, yf + 0.03 + hn / 2, 0);
      ring(g, P.black, R - 0.03, 0.012, 0, h - 0.08, 0, "y", 48, 4);
      // Einstiegsleiter vorn
      const lad = [rodG([0, yf + 0.05, R - 0.02], [0, h - 0.1, R - 0.02], 0.008, 4)];
      for (const k of [-1, 1]) lad.push(rodG([k * 0.22, 0, R + 0.32], [k * 0.22, yf - 0.03, R + 0.04], 0.02, 6));
      merged(g, P.black, lad);
      merged(g, P.steelD, [1, 2].map((i) => boxG(0.44, 0.025, 0.12, 0, (yf * i) / 3 - 0.02, R + 0.32 - (0.28 * i) / 3)));
      return true;
    }

    // Sandkasten: Rahmen aus Bohlen mit dreieckigen Eckbänkchen, Sandfüllung mit Hügel, Eimer mit Henkel und Schaufel
    case "garden_sandbox": {
      const P = palette(M);
      const t = 0.045;
      const fh = Math.min(0.25, h * 0.84);
      const frame = [boxG(w, fh, t, 0, 0, d / 2 - t / 2), boxG(w, fh, t, 0, 0, -d / 2 + t / 2), boxG(t, fh, d - 2 * t, -w / 2 + t / 2, 0, 0), boxG(t, fh, d - 2 * t, w / 2 - t / 2, 0, 0)];
      // Eckbänkchen
      const c = 0.3;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(plateG([[sx * (w / 2), sz * (d / 2)], [sx * (w / 2 - c), sz * (d / 2)], [sx * (w / 2), sz * (d / 2 - c)]], 0.03, fh));
      merged(g, M.wood, frame);
      // Fugen zwischen den Bohlen
      const ys = fh / 2;
      merged(g, P.woodD, [boxG(w + 0.004, 0.008, 0.004, 0, ys, d / 2), boxG(w + 0.004, 0.008, 0.004, 0, ys, -d / 2), boxG(0.004, 0.008, d, -w / 2, ys, 0), boxG(0.004, 0.008, d, w / 2, ys, 0)]);
      const yS = fh - 0.07;
      merged(g, P.sand, [boxG(w - 2 * t, yS, d - 2 * t, 0, 0, 0), ballG(0.24, -w * 0.15, yS, -d * 0.12, [1, 0.3, 0.9], 8), cylG(0.07, 0.07, w * 0.18, yS, -d * 0.2, 8, 0.04)]);
      // Eimer mit Henkel, Schaufel
      const bx = w * 0.22;
      const bz = d * 0.15;
      cyl(g, P.red, 0.055, 0.1, bx, yS, bz, 14, 0.072);
      ring(g, P.red, 0.07, 0.005, bx, yS + 0.1, bz, "x", 16, 4);
      const a = -0.6;
      const sx0 = -w * 0.25;
      const sz0 = d * 0.24;
      merged(g, P.yellow, [rodG([sx0, yS + 0.012, sz0], [sx0 + Math.cos(a) * 0.22, yS + 0.012, sz0 + Math.sin(a) * 0.22], 0.012, 6), boxG(0.1, 0.012, 0.09, sx0 - 0.05 * Math.cos(a), yS, sz0 - 0.05 * Math.sin(a), [0, -a, 0])]);
      return true;
    }

    // Fußballtor: weiße Pfosten und Latte vorn mit runden Ecken, Netzbügel und Bodenrahmen hinten (Stahl),
    // Netz mit Tiefe: Dach, schräge Rückwand, zwei Seitenteile
    case "garden_goal": {
      const P = palette(M);
      const r = 0.04;
      const xp = w / 2 - r;
      const zf = d / 2 - r - 0.01;
      const yt = h - r;
      const zt = zf - Math.min(0.45, d * 0.35); // hinterer Dachrand
      const zb = -d / 2 + 0.03; // hinterer Bodenrahmen
      merged(g, M.white, [rodG([-xp, 0, zf], [-xp, yt, zf], r, 12), rodG([xp, 0, zf], [xp, yt, zf], r, 12), rodG([-xp, yt, zf], [xp, yt, zf], r, 12), ballG(r, -xp, yt, zf, [1, 1, 1], 10), ballG(r, xp, yt, zf, [1, 1, 1], 10)]);
      const back = [rodG([-xp, yt, zt], [xp, yt, zt], 0.018, 6), rodG([-xp, 0.02, zb], [xp, 0.02, zb], 0.02, 6)];
      for (const s of [-1, 1]) {
        back.push(rodG([s * xp, yt, zf], [s * xp, yt, zt], 0.018, 6), rodG([s * xp, yt, zt], [s * xp, 0.02, zb], 0.018, 6), rodG([s * xp, 0.02, zf], [s * xp, 0.02, zb], 0.02, 6));
      }
      merged(g, P.steel, back);
      // Netz
      const L = Math.hypot(yt - 0.02, zt - zb);
      const net = [
        at(new THREE.PlaneGeometry(2 * xp, zf - zt), [0, yt, (zf + zt) / 2], [-PI / 2, 0, 0]),
        at(new THREE.PlaneGeometry(2 * xp, L), [0, (yt + 0.02) / 2, (zt + zb) / 2], [Math.atan2(zt - zb, yt - 0.02), 0, 0]),
      ];
      for (const s of [-1, 1]) net.push(sideG([[zf, 0], [zf, yt], [zt, yt], [zb, 0.02]], s * xp));
      merged(g, P.mesh, net);
      // Maschen angedeutet: einige Netzschnüre auf Rückwand und Dach
      const cords = [];
      for (let i = 1; i < 10; i++) {
        const x = -xp + (2 * xp * i) / 10;
        cords.push(rodG([x, 0.02, zb], [x, yt, zt], 0.004, 3), rodG([x, yt, zt], [x, yt, zf], 0.004, 3));
      }
      for (let i = 1; i < 4; i++) {
        const f = i / 4;
        cords.push(rodG([-xp, 0.02 + (yt - 0.02) * f, zb + (zt - zb) * f], [xp, 0.02 + (yt - 0.02) * f, zb + (zt - zb) * f], 0.004, 3));
      }
      merged(g, tint(M, 0xf0f0f0), cords);
      return true;
    }

    // Tischtennisplatte: blaue Platte mit weißen Linien, Netz quer in der Mitte mit Pfosten, Zarge und Stahlgestell
    // mit Außenbeinen, Mittelfahrwerk mit Rollen und Streben
    case "garden_pingpong": {
      const P = palette(M);
      const yt = h - 0.025;
      box(g, tint(M, 0x1f4f8f, { roughness: 0.45 }), w, 0.025, d, 0, yt, 0);
      const lw = 0.02;
      const yl = h - 0.0005;
      merged(g, tint(M, 0xf4f4f4), [
        boxG(w, 0.002, lw, 0, yl, d / 2 - lw / 2),
        boxG(w, 0.002, lw, 0, yl, -d / 2 + lw / 2),
        boxG(lw, 0.002, d, -w / 2 + lw / 2, yl, 0),
        boxG(lw, 0.002, d, w / 2 - lw / 2, yl, 0),
        boxG(w, 0.002, 0.003, 0, yl, 0),
      ]);
      // Netz mit weißer Kante und Pfosten
      const nw = d + 0.1;
      box(g, P.mesh, 0.006, 0.14, nw, 0, h, 0);
      box(g, tint(M, 0xf4f4f4), 0.01, 0.016, nw, 0, h + 0.138, 0);
      merged(g, P.black, [boxG(0.025, 0.17, 0.025, 0, h - 0.03, nw / 2), boxG(0.025, 0.17, 0.025, 0, h - 0.03, -nw / 2)]);
      // Gestell
      const fr = [];
      for (const s of [-1, 1]) {
        fr.push(boxG(w - 0.1, 0.05, 0.03, 0, yt - 0.05, s * (d / 2 - 0.08)));
        fr.push(boxG(0.03, 0.05, d - 0.16, s * (w / 2 - 0.08), yt - 0.05, 0));
        fr.push(boxG(0.03, 0.05, d - 0.16, s * 0.04, yt - 0.05, 0));
      }
      const xo = w / 2 - 0.22;
      const xi = 0.32;
      const zo = d / 2 - 0.16;
      const zi = d / 2 - 0.3;
      const feet = [];
      const wheels = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          fr.push(boxG(0.04, yt - 0.08, 0.04, sx * xo, 0.03, sz * zo));
          feet.push(cylG(0.025, 0.03, sx * xo, 0, sz * zo, 8));
          fr.push(boxG(0.035, yt - 0.18, 0.035, sx * xi, 0.13, sz * zi));
          wheels.push(rodG([sx * xi, 0.065, sz * zi - 0.025], [sx * xi, 0.065, sz * zi + 0.025], 0.065, 12));
          fr.push(rodG([sx * xo, 0.3, sz * zo], [sx * xi, yt - 0.06, sz * zi], 0.014, 6));
        }
        fr.push(boxG(0.035, 0.035, 2 * zi, sx * xi, 0.13, 0), boxG(0.035, 0.035, 2 * zo, sx * xo, 0.25, 0));
      }
      merged(g, P.steelD, fr);
      merged(g, P.black, feet);
      merged(g, P.rubber, wheels);
      return true;
    }

    // Aufstellpool: Stahlwand (Hauptfarbe) mit Stützen und Bodenschiene, blaue Innenfolie, Wasser knapp unter dem Randprofil,
    // A-Leiter vorn über die Wand, Filterpumpe mit Schläuchen
    case "garden_pool_above": {
      const P = palette(M);
      const R = Math.min(w, d) / 2 - 0.04;
      const hw = h - 0.07;
      const seg = 56;
      place(g, new THREE.Mesh(new THREE.CylinderGeometry(R, R, hw, seg, 1, true), M.light), 0, hw / 2, 0);
      const liner = tint(M, 0x4f9fc8, { roughness: 0.6, side: THREE.BackSide });
      place(g, new THREE.Mesh(new THREE.CylinderGeometry(R - 0.01, R - 0.01, hw, seg, 1, true), liner), 0, hw / 2, 0);
      cyl(g, tint(M, 0x4f9fc8, { roughness: 0.6 }), R - 0.01, 0.01, 0, 0, 0, seg);
      cyl(g, P.water, R - 0.02, hw - 0.11, 0, 0.012, 0, seg);
      const rim = ring(g, P.plastic, R + 0.005, 0.045, 0, hw + 0.012, 0, "y", 64, 6);
      rim.scale.z = 0.45;
      ring(g, P.steel, R + 0.005, 0.02, 0, 0.02, 0, "y", 48, 4);
      // senkrechte Stützen außen
      const ups = [];
      for (let i = 0; i < 16; i++) {
        const a = ((i + 0.5) / 16) * 2 * PI;
        ups.push(boxG(0.06, hw, 0.02, Math.cos(a) * (R + 0.012), 0, Math.sin(a) * (R + 0.012), [0, PI / 2 - a, 0]));
      }
      merged(g, P.steel, ups);
      // Leiter (A-Form) vorn
      const zw = R;
      const yt = hw + 0.17;
      const zo = R + 0.42;
      const zi = R - 0.42;
      const lad = [];
      const st = [boxG(0.56, 0.03, 0.2, 0, yt, zw)];
      for (const k of [-1, 1]) {
        lad.push(rodG([k * 0.26, 0, zo], [k * 0.26, yt, zw + 0.08], 0.02, 6), rodG([k * 0.26, 0.01, zi], [k * 0.26, yt, zw - 0.08], 0.02, 6));
        lad.push(rodG([k * 0.26, yt, zw + 0.08], [k * 0.26, yt + 0.1, zw], 0.018, 6), rodG([k * 0.26, yt + 0.1, zw], [k * 0.26, yt, zw - 0.08], 0.018, 6));
      }
      for (let i = 1; i <= 3; i++) {
        const f = i / 4;
        st.push(boxG(0.5, 0.025, 0.1, 0, yt * f - 0.02, zo + (zw + 0.08 - zo) * f), boxG(0.5, 0.025, 0.1, 0, 0.01 + (yt - 0.01) * f - 0.02, zi + (zw - 0.08 - zi) * f));
      }
      merged(g, P.steel, lad);
      merged(g, P.plastic, st);
      // Filterpumpe neben der Wand, zwei Schläuche über den Rand
      const pa = 0.65;
      const pr = R + 0.26;
      const px = Math.cos(pa) * pr;
      const pz = Math.sin(pa) * pr;
      box(g, P.plastic, 0.3, 0.22, 0.26, px, 0, pz).rotation.y = PI / 2 - pa;
      cyl(g, P.blue, 0.1, 0.18, px, 0.22, pz, 14);
      const hose = [];
      for (const k of [-0.06, 0.06]) {
        const a = pa + k;
        hose.push(rodG([Math.cos(a) * (pr - 0.08), 0.3, Math.sin(a) * (pr - 0.08)], [Math.cos(a) * (R + 0.04), hw - 0.25, Math.sin(a) * (R + 0.04)], 0.02, 6));
      }
      merged(g, P.black, hose);
      return true;
    }

    // Gartenteich: unregelmäßig ovale Wasserfläche über dunklem Grund, Steinkranz in zwei Steinfarben, Seerosen mit Blüten,
    // zwei niedrige Binsenhorste (Höhe bleibt beim Steinkranz)
    case "garden_pond": {
      const P = palette(M);
      const rx = w / 2 - 0.17;
      const rz = d / 2 - 0.17;
      const wob = (a) => 1 + 0.07 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 5 + 2.1);
      const N = 40;
      const outline = (k) => Array.from({ length: N }, (_, i) => {
        const a = (i / N) * 2 * PI;
        return new THREE.Vector2(Math.cos(a) * rx * wob(a) * k, Math.sin(a) * rz * wob(a) * k);
      });
      // Formfläche liegt flach: Form-y wird Welt −z
      const flatG = (pts, y) => at(new THREE.ShapeGeometry(new THREE.Shape(pts)), [0, y, 0], [-PI / 2, 0, 0]);
      merged(g, tint(M, 0x2b4a40, { roughness: 1 }), [flatG(outline(1.02), 0.012)]);
      merged(g, P.water, [flatG(outline(1.04), 0.055)]);
      // Steinkranz
      const r = rng(11);
      const stones = [[], []];
      const ns = 26;
      for (let i = 0; i < ns; i++) {
        const a = ((i + r() * 0.4) / ns) * 2 * PI;
        const rs = 0.12 + r() * 0.05;
        const sy = Math.min(0.55, 0.075 / rs);
        const f = wob(a) + 0.03;
        const geo = at(new THREE.DodecahedronGeometry(1, 0), [Math.cos(a) * rx * f, rs * sy * 0.72, -Math.sin(a) * rz * f], [0, r() * PI, 0], [rs, rs * sy, rs * 0.85]);
        stones[r() < 0.5 ? 0 : 1].push(geo);
      }
      // einige kleine Steine außen
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 2 * PI + 0.3;
        const rs = 0.07 + r() * 0.03;
        const f = wob(a) + 0.16;
        stones[i % 2].push(at(new THREE.DodecahedronGeometry(1, 0), [Math.cos(a) * rx * f, rs * 0.4, -Math.sin(a) * rz * f], [0, r() * PI, 0], [rs, rs * 0.55, rs]));
      }
      merged(g, M.stone, stones[0]);
      merged(g, M.stoneLight, stones[1]);
      // Seerosen
      const pads = [];
      const blooms = [[], []];
      [[-0.35, 0.15, 0.11], [-0.15, 0.3, 0.08], [0.25, -0.2, 0.1], [0.42, 0.05, 0.075], [0.05, -0.38, 0.09]].forEach(([fx, fz, pr], i) => {
        const x = fx * rx * 1.2;
        const z = fz * rz * 1.2;
        pads.push(cylG(pr, 0.006, x, 0.055, z, 12));
        if (i % 2 === 0) blooms[i % 4 ? 1 : 0].push(ballG(0.032, x + pr * 0.25, 0.075, z, [1, 0.6, 1], 7));
      });
      merged(g, P.leaf, pads);
      merged(g, P.flower, blooms[0]);
      merged(g, P.cream, blooms[1]);
      // Binsen
      const blades = [];
      for (const [ca, cnt, hh] of [[0.55, 14, 0.16], [3.6, 9, 0.12]]) {
        const cx = Math.cos(ca) * rx * 0.86;
        const cz = -Math.sin(ca) * rz * 0.86;
        for (let i = 0; i < cnt; i++) {
          const bh = hh * (0.7 + r() * 0.3);
          blades.push(cylG(0.007, bh, cx + (r() - 0.5) * 0.16, 0.03, cz + (r() - 0.5) * 0.12, 4, 0.001, [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4]));
        }
      }
      merged(g, P.leafD, blades);
      return true;
    }

    // Badeteich-Steg: Querbohlen auf Längsträgern, Querjochen und Rundpfählen (Länge entlang z, Ende bei +z),
    // niedriges Seilgeländer an Pollern auf einer Seite, Badeleiter mit Griffbügeln am Ende
    case "garden_jetty": {
      const P = palette(M);
      const pw = 0.14;
      const gap = 0.012;
      const n = Math.max(2, Math.floor((d + gap) / (pw + gap)));
      const z0 = -((n * pw + (n - 1) * gap) / 2) + pw / 2;
      const yd = h - 0.035;
      const planks = [];
      for (let i = 0; i < n; i++) planks.push(boxG(w, 0.035, pw, 0, yd, z0 + i * (pw + gap)));
      merged(g, M.wood, planks);
      const xs = w / 2 - 0.15;
      const yj = yd - 0.12;
      const under = [-xs, 0, xs].map((x) => boxG(0.08, 0.12, d - 0.04, x, yj, 0));
      const posts = [];
      const np = Math.max(2, Math.round(d / 0.9) + 1);
      for (let i = 0; i < np; i++) {
        const z = -d / 2 + 0.12 + ((d - 0.24) * i) / (np - 1);
        under.push(boxG(w - 0.1, 0.1, 0.08, 0, yj - 0.1, z));
        for (const s of [-1, 1]) posts.push(cylG(0.065, yj - 0.1, s * xs, 0, z, 10));
      }
      merged(g, P.woodD, under);
      merged(g, P.woodG, posts);
      // Seilgeländer: Poller und durchhängendes Seil auf der rechten Seite
      const xr = w / 2 - 0.06;
      const yb = Math.min(h + 0.11, h * 1.2);
      const bol = [];
      const rope = [];
      const nb = Math.max(2, Math.round(d / 0.7) + 1);
      for (let i = 0; i < nb; i++) {
        const z = -d / 2 + 0.1 + ((d - 0.2) * i) / (nb - 1);
        bol.push(cylG(0.045, yb - yd, xr, yd, z, 10));
        if (i) {
          const zp = -d / 2 + 0.1 + ((d - 0.2) * (i - 1)) / (nb - 1);
          const zm = (z + zp) / 2;
          rope.push(rodG([xr, yb - 0.03, zp], [xr, yb - 0.065, zm], 0.012, 5), rodG([xr, yb - 0.065, zm], [xr, yb - 0.03, z], 0.012, 5));
        }
      }
      merged(g, P.woodG, bol);
      merged(g, tint(M, 0xcdb78a, { roughness: 0.95 }), rope);
      // Badeleiter am Ende
      const zl = d / 2 + 0.06;
      const lad = [];
      const yg = Math.min(h + 0.09, h * 1.2);
      for (const s of [-1, 1]) {
        const x = s * 0.2;
        lad.push(rodG([x, 0.02, zl], [x, yd + 0.035, zl], 0.02, 6), rodG([x, yd + 0.035, zl], [x, yg, zl - 0.06], 0.02, 6), rodG([x, yg, zl - 0.06], [x, yd + 0.035, zl - 0.17], 0.02, 6));
      }
      for (let i = 1; i <= 3; i++) lad.push(boxG(0.38, 0.025, 0.06, 0, (yd * i) / 4, zl));
      merged(g, P.steel, lad);
      return true;
    }

    // Kinderhaus: Holzhaus auf Sockel mit Satteldach (First entlang z), Giebel mit Rundfenster, Tür vorn (+z), Fenster mit Läden
    // und Blumenkasten, Seitenfenster, Eckleisten, Veranda mit Pfosten, Geländer und Stufe
    case "garden_kids_house": {
      const P = palette(M);
      const bw = w - 0.3; // Wandbreite
      const zb0 = -d / 2 + 0.08;
      const zb1 = d / 2 - 0.42; // Vorderwand
      const bd = zb1 - zb0;
      const zc = (zb0 + zb1) / 2;
      const yf = 0.12; // Fußboden
      const yr = h - 0.035; // First
      const s = w / 2; // Dachüberstand bis zur Breite
      const t = Math.min(0.75, h * 0.4);
      const yw = yr - (t * (bw / 2 + 0.02)) / s - 0.04; // Wandoberkante unter dem Dach
      // Sockel und Veranda
      merged(g, P.woodD, [boxG(bw + 0.08, yf, d - 0.12, 0, 0, -0.02), boxG(0.5, yf / 2, 0.12, 0, 0, d / 2 - 0.08)]);
      // Wände und Giebel
      box(g, M.wood, bw, yw - yf, bd, 0, yf, zc);
      merged(g, M.wood, [prismG(bw, yr - yw - 0.07, bd, 0, yw, zc)]);
      // Bretterfugen
      const lines = [];
      for (let y = yf + 0.16; y < yw - 0.05; y += 0.16) {
        lines.push(boxG(bw + 0.004, 0.008, 0.004, 0, y, zb1), boxG(bw + 0.004, 0.008, 0.004, 0, y, zb0));
        for (const k of [-1, 1]) lines.push(boxG(0.004, 0.008, bd, k * (bw / 2), y, zc));
      }
      merged(g, P.woodD, lines);
      // Dach
      const roof = tint(M, 0xa3412f, { roughness: 0.8 });
      const rl = d - 0.02;
      merged(g, roof, roofG(0, yr, s, t, rl, -0.01, 0.035));
      box(g, P.woodD, 0.06, 0.04, rl + 0.02, 0, yr - 0.01, -0.01);
      // Eckleisten, Fensterrahmen, Rundfenster im Giebel
      const trim = [];
      for (const kx of [-1, 1]) for (const z of [zb0, zb1]) trim.push(boxG(0.05, yw - yf, 0.05, kx * (bw / 2), yf, z));
      const zf = zb1 + 0.01;
      const wx = bw * 0.24;
      const wy = yf + 0.42;
      const ws = 0.34;
      trim.push(boxG(ws + 0.05, 0.03, 0.03, wx, wy - 0.03, zf), boxG(ws + 0.05, 0.03, 0.03, wx, wy + ws, zf), boxG(0.03, ws, 0.03, wx - ws / 2 - 0.01, wy, zf), boxG(0.03, ws, 0.03, wx + ws / 2 + 0.01, wy, zf));
      trim.push(boxG(0.02, ws, 0.025, wx, wy, zf), boxG(ws, 0.02, 0.025, wx, wy + ws / 2 - 0.01, zf));
      const yg = yw + (yr - yw) * 0.32;
      trim.push(at(new THREE.TorusGeometry(0.085, 0.015, 6, 16), [0, yg, zb1 + 0.012]));
      // Seitenfenster
      const sz = zc;
      for (const kx of [-1, 1]) {
        const xw = kx * (bw / 2 + 0.01);
        trim.push(boxG(0.03, 0.03, ws + 0.05, xw, wy - 0.03, sz), boxG(0.03, 0.03, ws + 0.05, xw, wy + ws, sz), boxG(0.03, ws, 0.03, xw, wy, sz - ws / 2 - 0.01), boxG(0.03, ws, 0.03, xw, wy, sz + ws / 2 + 0.01), boxG(0.025, 0.02, ws, xw, wy + ws / 2 - 0.01, sz));
      }
      merged(g, M.white, trim);
      const glass = [boxG(ws, ws, 0.01, wx, wy, zb1 + 0.003), cylG(0.08, 0.01, 0, yg, zb1 + 0.003, 14, 0.08, [PI / 2, 0, 0])];
      for (const kx of [-1, 1]) glass.push(boxG(0.01, ws, ws, kx * (bw / 2 + 0.003), wy, sz));
      merged(g, M.glass, glass);
      // Fensterläden und Blumenkasten
      const shut = tint(M, 0x3f7a5a, { roughness: 0.8 });
      merged(g, shut, [boxG(ws / 2, ws + 0.03, 0.02, wx - ws * 0.78, wy - 0.015, zf + 0.005), boxG(ws / 2, ws + 0.03, 0.02, wx + ws * 0.78, wy - 0.015, zf + 0.005)]);
      box(g, P.woodD, ws + 0.06, 0.08, 0.1, wx, wy - 0.12, zf + 0.05);
      merged(g, P.leaf, [-1, 0, 1].map((k) => ballG(0.05, wx + k * 0.12, wy - 0.03, zf + 0.05, [1.2, 0.7, 0.9], 7)));
      merged(g, P.flower, [-1.5, -0.5, 0.5, 1.5].map((k) => ballG(0.022, wx + k * 0.08, wy + 0.01, zf + 0.07, [1, 1, 1], 6)));
      // Tür mit Fensterchen und Knauf
      const dx = -bw * 0.22;
      const dw = 0.42;
      const dh = Math.min(0.82, (yw - yf) * 0.85);
      box(g, tint(M, 0x3d6f9b, { roughness: 0.7 }), dw, dh, 0.03, dx, yf, zb1 + 0.005);
      box(g, M.glass, 0.16, 0.16, 0.01, dx, yf + dh - 0.26, zb1 + 0.022);
      box(g, M.white, dw + 0.06, 0.035, 0.035, dx, yf + dh, zb1 + 0.01);
      merged(g, P.steel, [ballG(0.022, dx + dw / 2 - 0.07, yf + dh * 0.5, zb1 + 0.035, [1, 1, 1], 8)]);
      // Veranda: Pfosten bis unters Dach, seitliches Geländer, Brüstung vorn mit Durchgang
      const zp = d / 2 - 0.16;
      const xp = bw / 2 - 0.04;
      const yp = yr - (t * (xp + 0.03)) / s - 0.04;
      const rail = [];
      for (const k of [-1, 1]) {
        rail.push(boxG(0.06, yp - yf, 0.06, k * xp, yf, zp));
        rail.push(boxG(0.04, 0.04, zp - zb1, k * xp, yf + 0.42, (zp + zb1) / 2), boxG(0.03, 0.4, 0.03, k * xp, yf, (zp + zb1) / 2));
        rail.push(boxG(xp - 0.28, 0.04, 0.04, k * (xp + 0.28) / 2, yf + 0.42, zp), boxG(0.03, 0.4, 0.03, k * (xp + 0.28) / 2, yf, zp));
      }
      merged(g, M.white, rail);
      return true;
    }

    default:
      return false;
  }
}
