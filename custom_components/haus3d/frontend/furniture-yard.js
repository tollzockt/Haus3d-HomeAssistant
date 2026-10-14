// 3D-Modelle des Katalogs „Hof & Einfahrt“ (catalog-garden.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.

import { THREE, at, ballG, box, boxG, cyl, cylG, merged, palette, place, rng, rodG, tint } from "./garden-parts.js";

const PI = Math.PI;

/** Stumpf mit rechteckigem Querschnitt (Tonnenkörper): oben wt × dt, unten k-mal so groß, Höhe hh, Unterkante y; flach schattiert. */
function frustG(wt, dt, k, hh, x = 0, y = 0, z = 0) {
  const geo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * k, hh, 4, 1).toNonIndexed();
  geo.rotateY(PI / 4);
  geo.scale(wt, 1, dt);
  geo.translate(x, y + hh / 2, z);
  geo.computeVertexNormals();
  return geo;
}

/** Halbbogen (Torus-Hälfte) in der z-y-Ebene bei x, Mitte (y, z), Radius R, nach oben offen nach unten. */
const arcG = (R, r, x, y, z) => at(new THREE.TorusGeometry(R, r, 6, 12, PI), [x, y, z], [0, PI / 2, 0]);

/** Baut einen Typ dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildYard(type, w, d, h, M, g, bulbs, item = {}) {
  switch (type) {
    // Mülltonnen (3er): Körper nach unten schmaler (Hauptfarbe dunkel), Deckel grün/gelb/blau mit Griffleiste vorn,
    // Schiebegriff und zwei Räder hinten, Standleiste vorn
    case "garden_bins": {
      const P = palette(M);
      const n = 3;
      const pitch = w / n;
      const wt = Math.min(0.58, pitch - 0.05);
      const dt = Math.min(0.7, d - 0.08);
      const yt = h - 0.05;
      const lids = [tint(M, 0x2f6b3a), P.yellow, P.blue];
      const bodies = [];
      const dark = [];
      const wheels = [];
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + pitch * (i + 0.5);
        bodies.push(frustG(wt, dt, 0.84, yt - 0.03, x, 0.03, 0.01));
        merged(g, lids[i], [boxG(wt + 0.03, 0.04, dt + 0.04, x, yt, 0.01), boxG(0.22, 0.03, 0.03, x, yt - 0.02, dt / 2 + 0.035)]);
        // Griff hinten mit Haltern, Standleiste vorn
        dark.push(rodG([x - wt * 0.36, yt - 0.06, -dt / 2 - 0.035], [x + wt * 0.36, yt - 0.06, -dt / 2 - 0.035], 0.016, 8));
        for (const s of [-1, 1]) dark.push(boxG(0.03, 0.05, 0.06, x + s * wt * 0.36, yt - 0.085, -dt / 2 - 0.01));
        dark.push(boxG(wt * 0.6, 0.035, 0.05, x, 0, dt * 0.38));
        // Räder hinten an der Achse
        const xr = wt * 0.84 * 0.5;
        for (const s of [-1, 1]) wheels.push(rodG([x + s * (xr - 0.02), 0.1, -dt * 0.36], [x + s * (xr + 0.035), 0.1, -dt * 0.36], 0.1, 14));
        dark.push(rodG([x - xr, 0.1, -dt * 0.36], [x + xr, 0.1, -dt * 0.36], 0.015, 6));
      }
      merged(g, M.dark, bodies);
      merged(g, P.black, dark);
      merged(g, P.rubber, wheels);
      return true;
    }

    // Mülltonnenbox: Stahlrahmen (anthrazit) mit Holzlatten an Seiten und Rückwand, zwei Fronttüren mit Lattung und Griffen,
    // zwei Klappdeckel (rechter leicht angehoben, darunter ein Tonnendeckel)
    case "garden_bin_box": {
      const P = palette(M);
      const ps = 0.05;
      const hb = h - 0.12;
      const hx = w / 2 - ps / 2;
      const hz = d / 2 - ps / 2;
      const frame = [];
      for (const x of [-hx, 0, hx]) for (const z of [-hz, hz]) frame.push(boxG(ps, hb, ps, x, 0, z));
      for (const z of [-hz, hz]) frame.push(boxG(w, 0.04, ps, 0, hb - 0.04, z), boxG(w, 0.05, ps, 0, 0, z));
      for (const x of [-hx, hx]) frame.push(boxG(ps, 0.04, d, x, hb - 0.04, 0), boxG(ps, 0.05, d, x, 0, 0));
      // Latten an Rückwand und Seiten
      const slats = [];
      const ns = 8;
      const sh = (hb - 0.12) / ns;
      for (let i = 0; i < ns; i++) {
        const y = 0.06 + i * sh;
        slats.push(boxG(w - 2 * ps, sh - 0.025, 0.02, 0, y, -hz));
        for (const s of [-1, 1]) slats.push(boxG(0.02, sh - 0.025, d - 2 * ps, s * hx, y, 0));
      }
      // Türen: Rahmen und Lattung zwischen den Pfosten, Griffe innen
      const grips = [];
      const dw = hx - ps - 0.01;
      const yd0 = 0.06;
      const ydh = hb - 0.12;
      for (const s of [-1, 1]) {
        const cx = (s * hx) / 2;
        const zf = hz + 0.012;
        frame.push(boxG(dw, 0.04, 0.025, cx, yd0, zf), boxG(dw, 0.04, 0.025, cx, yd0 + ydh - 0.04, zf), boxG(0.04, ydh, 0.025, cx - dw / 2 + 0.02, yd0, zf), boxG(0.04, ydh, 0.025, cx + dw / 2 - 0.02, yd0, zf));
        for (let i = 0; i < ns - 1; i++) slats.push(boxG(dw - 0.08, sh - 0.025, 0.02, cx, yd0 + 0.04 + i * ((ydh - 0.08) / (ns - 1)), hz + 0.005));
        grips.push(boxG(0.025, 0.2, 0.025, s * 0.1, hb * 0.5, zf + 0.03), boxG(0.02, 0.02, 0.03, s * 0.1, hb * 0.5 + 0.02, zf + 0.012), boxG(0.02, 0.02, 0.03, s * 0.1, hb * 0.5 + 0.16, zf + 0.012));
      }
      merged(g, P.steelD, frame);
      merged(g, M.wood, slats);
      merged(g, P.steel, grips);
      // Klappdeckel: an der Hinterkante gelagert, rechter angehoben
      const lw = w / 2 - 0.01;
      const ld = d + 0.04;
      [0, 0.22].forEach((open, i) => {
        const s = i ? 1 : -1;
        const lid = new THREE.Group();
        lid.position.set((s * w) / 4, hb, -d / 2);
        lid.rotation.x = -open;
        merged(lid, M.wood, [boxG(lw, 0.025, ld, 0, 0.005, ld / 2)]);
        merged(lid, P.steelD, [boxG(lw, 0.03, 0.03, 0, 0, ld - 0.015), boxG(0.03, 0.03, ld, -lw / 2 + 0.015, 0, ld / 2), boxG(0.03, 0.03, ld, lw / 2 - 0.015, 0, ld / 2)]);
        g.add(lid);
      });
      box(g, P.blue, w / 2 - 0.3, 0.04, d - 0.25, w / 4, hb - 0.2, 0);
      return true;
    }

    // Fahrradständer (Reihenständer): zwei Stahlschienen am Boden mit Querstücken, vier Klemmbügel-Paare für Vorderräder,
    // abwechselnd hoch und niedrig
    case "garden_bike_stand": {
      const P = palette(M);
      const zr = d / 2 - 0.04;
      const steel = [boxG(w, 0.035, 0.04, 0, 0, zr), boxG(w, 0.035, 0.04, 0, 0, -zr)];
      for (const s of [-1, 1]) steel.push(boxG(0.05, 0.035, 2 * zr + 0.04, s * (w / 2 - 0.025), 0, 0));
      const n = 4;
      const pitch = Math.min(0.45, (w - 0.1) / n);
      const top = h - 0.012;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * pitch;
        const R = i % 2 ? zr * 0.75 : zr;
        const yc = (i % 2 ? top - 0.07 : top) - R;
        for (const k of [-1, 1]) {
          const xk = x + k * 0.035;
          steel.push(arcG(R, 0.011, xk, yc, 0));
          for (const zs of [-1, 1]) steel.push(rodG([xk, 0.03, zs * zr], [xk, yc, zs * R], 0.011, 6));
        }
        // Klemme unten: kurzer Steg zwischen den Bügeln
        steel.push(rodG([x - 0.035, 0.12, 0.6 * zr], [x + 0.035, 0.12, 0.6 * zr], 0.009, 5), rodG([x - 0.035, 0.12, -0.6 * zr], [x + 0.035, 0.12, -0.6 * zr], 0.009, 5));
      }
      merged(g, P.steel, steel);
      merged(g, P.steelD, [-1, 1].map((s) => boxG(0.12, 0.006, 2 * zr + 0.08, s * (w / 2 - 0.06), 0, 0)));
      return true;
    }

    // Briefkasten auf Pfosten: Standplatte, Vierkantpfosten, Kasten (anthrazit) mit runder Haube, Einwurf mit Klappe vorn,
    // Namensschild, Entnahmetür mit Schloss hinten
    case "garden_mailbox": {
      const P = palette(M);
      const bw = w - 0.02;
      const bd = d - 0.02;
      const rh = Math.min(0.1, h * 0.07); // Haube
      const hb = Math.min(0.27, h * 0.19); // Kasten
      const yb = h - rh - hb;
      merged(g, P.steelD, [boxG(0.22, 0.015, 0.22, 0, 0, 0), boxG(0.07, yb, 0.07, 0, 0, 0), boxG(0.16, 0.02, 0.16, 0, yb - 0.02, 0)]);
      box(g, M.dark, bw, hb, bd, 0, yb, 0);
      const hood = at(new THREE.CylinderGeometry(bw / 2, bw / 2, bd, 20, 1, false, PI / 2, PI), [0, 0, 0], [PI / 2, 0, 0], [1, 1, rh / (bw / 2)]);
      place(g, new THREE.Mesh(hood, M.dark), 0, yb + hb, 0);
      // Einwurf vorn: Schlitz und Klappe
      const zf = bd / 2;
      box(g, P.black, bw * 0.66, 0.025, 0.006, 0, yb + hb - 0.07, zf);
      box(g, P.steel, bw * 0.72, 0.05, 0.012, 0, yb + hb - 0.125, zf + 0.002);
      box(g, P.cream, bw * 0.4, 0.04, 0.006, 0, yb + 0.05, zf);
      // Tür hinten mit Fugen und Schloss
      merged(g, P.black, [boxG(bw - 0.05, 0.006, 0.004, 0, yb + 0.02, -zf), boxG(bw - 0.05, 0.006, 0.004, 0, yb + hb - 0.03, -zf), boxG(0.006, hb - 0.05, 0.004, -bw / 2 + 0.025, yb + 0.02, -zf), boxG(0.006, hb - 0.05, 0.004, bw / 2 - 0.025, yb + 0.02, -zf)]);
      merged(g, P.steel, [rodG([bw * 0.3, yb + hb * 0.55, -zf], [bw * 0.3, yb + hb * 0.55, -zf - 0.012], 0.014, 10)]);
      return true;
    }

    // Paketbox: hoher Stahlkasten (Hauptfarbe dunkel) auf vier Füßen, Deckel mit Überstand, oben Einwurfklappe mit Griffleiste,
    // unten Entnahmetür mit Tastenschloss und Griff, umlaufende Fugen
    case "garden_parcel_box": {
      const P = palette(M);
      const yf = 0.06;
      const bw = w - 0.03;
      const bd = d - 0.04;
      const feet = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) feet.push(boxG(0.06, yf, 0.06, sx * (bw / 2 - 0.05), 0, sz * (bd / 2 - 0.05)));
      merged(g, P.black, feet);
      const hb = h - yf - 0.035;
      box(g, M.dark, bw, hb, bd, 0, yf, -0.01);
      box(g, M.dark, w, 0.035, d, 0, h - 0.035, 0);
      const zf = bd / 2 - 0.01;
      const ys = yf + hb * 0.62; // Fuge zwischen Klappe und Tür
      // Klappe oben, leicht vorstehend, mit Griffleiste
      box(g, M.dark, bw - 0.06, hb * 0.33, 0.015, 0, ys + 0.015, zf).rotation.x = 0.06;
      const seams = [boxG(bw - 0.03, 0.008, 0.004, 0, ys, zf + 0.001), boxG(0.008, ys - yf - 0.04, 0.004, -bw / 2 + 0.03, yf + 0.03, zf + 0.001), boxG(0.008, ys - yf - 0.04, 0.004, bw / 2 - 0.03, yf + 0.03, zf + 0.001), boxG(bw - 0.06, 0.008, 0.004, 0, yf + 0.03, zf + 0.001)];
      merged(g, P.black, seams);
      const metal = [rodG([-bw * 0.3, ys + hb * 0.3, zf + 0.04], [bw * 0.3, ys + hb * 0.3, zf + 0.04], 0.012, 8)];
      for (const s of [-1, 1]) metal.push(boxG(0.02, 0.02, 0.035, s * bw * 0.3, ys + hb * 0.3 - 0.01, zf + 0.012));
      // Tür: Griff rechts, Tastenschloss links
      metal.push(boxG(0.025, 0.16, 0.025, bw / 2 - 0.08, yf + hb * 0.35, zf + 0.025));
      metal.push(rodG([-bw / 2 + 0.11, yf + hb * 0.4, zf], [-bw / 2 + 0.11, yf + hb * 0.4, zf + 0.012], 0.016, 10));
      merged(g, P.steel, metal);
      box(g, P.black, 0.09, 0.12, 0.008, -bw / 2 + 0.11, yf + hb * 0.45, zf);
      const keys = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push(boxG(0.018, 0.015, 0.006, -bw / 2 + 0.085 + c * 0.025, yf + hb * 0.45 + 0.015 + r * 0.024, zf + 0.006));
      merged(g, P.plastic, keys);
      return true;
    }

    // Schlauchwagen: Rohrrahmen (Hauptfarbe dunkel) mit Griff und Stützfuß, zwei Räder mit Naben, Trommel mit grünem Schlauch
    // in Windungen, Kurbel, herabhängendes Schlauchende mit Spritze
    case "garden_hose_cart": {
      const P = palette(M);
      const hose = tint(M, 0x2e8b3a, { roughness: 0.5 });
      const xs = w / 2 - 0.07;
      const ya = 0.13;
      const za = -0.06;
      const yd = Math.min(0.45, h * 0.48);
      const zd = -0.02;
      const yh = h - 0.035;
      const frame = [];
      for (const s of [-1, 1]) {
        frame.push(rodG([s * xs, ya, za], [s * xs, yh, -0.13], 0.015, 8));
        frame.push(rodG([s * xs, 0.34, -0.075], [s * xs, 0.012, 0.19], 0.013, 8));
        frame.push(rodG([s * xs, yd, -0.085], [s * xs, yd, zd], 0.012, 6));
      }
      frame.push(rodG([-xs, yh, -0.13], [xs, yh, -0.13], 0.014, 8), rodG([-xs - 0.04, ya, za], [xs + 0.04, ya, za], 0.008, 6), rodG([-xs, yd, zd], [xs + 0.02, yd, zd], 0.01, 6), rodG([-xs, 0.012, 0.19], [xs, 0.012, 0.19], 0.012, 6));
      merged(g, M.dark, frame);
      // Räder
      const wr = Math.min(0.13, ya);
      const wheels = [];
      const hubs = [];
      for (const s of [-1, 1]) {
        wheels.push(rodG([s * (w / 2 - 0.045), ya, za], [s * (w / 2 - 0.005), ya, za], wr, 16));
        hubs.push(rodG([s * (w / 2 - 0.05), ya, za], [s * (w / 2), ya, za], 0.045, 10));
      }
      merged(g, P.rubber, wheels);
      merged(g, P.plastic, hubs);
      // Trommel und Schlauch
      const rf = Math.min(0.17, xs - 0.02);
      const drum = [rodG([-xs + 0.03, yd, zd], [xs - 0.03, yd, zd], 0.09, 16)];
      for (const s of [-1, 1]) drum.push(rodG([s * (xs - 0.035), yd, zd], [s * (xs - 0.015), yd, zd], rf, 20));
      merged(g, tint(M, 0x9aa0a5, { roughness: 0.5 }), drum);
      const turns = [];
      const nt = 9;
      for (let i = 0; i < nt; i++) turns.push(at(new THREE.TorusGeometry(0.115, 0.017, 5, 14), [-xs + 0.06 + ((2 * xs - 0.12) * i) / (nt - 1), yd, zd], [0, PI / 2, 0]));
      turns.push(rodG([0.06, yd + 0.12, zd + 0.03], [0.09, yd + 0.04, zd + 0.15], 0.017, 6), rodG([0.09, yd + 0.04, zd + 0.15], [0.11, 0.16, zd + 0.19], 0.017, 6));
      merged(g, hose, turns);
      merged(g, P.yellow, [cylG(0.022, 0.12, 0.11, 0.05, zd + 0.19, 10)]);
      // Kurbel und Griff
      merged(g, P.black, [rodG([xs + 0.02, yd, zd], [xs + 0.02, yd + 0.1, zd], 0.01, 6), rodG([xs + 0.02, yd + 0.1, zd], [xs + 0.065, yd + 0.1, zd], 0.014, 8), rodG([-0.12, yh, -0.13], [0.12, yh, -0.13], 0.022, 10)]);
      return true;
    }

    // Gartenwasserhahn (Wandtyp, Rückseite an der Wand bei −z): Wandplatte, Rosette, Rohr und Ventilkörper (Messing),
    // Ventilgriff vorn (+z), Auslauf nach unten mit Schlauchanschluss und Tropfen
    case "garden_tap": {
      const P = palette(M);
      const brass = tint(M, 0xb8923a, { metalness: 0.7, roughness: 0.35 });
      const zw = -d / 2;
      const yc = h * 0.66;
      box(g, M.light, w * 0.85, h * 0.78, 0.012, 0, h * 0.18, zw + 0.006);
      merged(g, brass, [
        rodG([0, yc, zw + 0.012], [0, yc, zw + 0.024], 0.032, 16),
        rodG([0, yc, zw + 0.02], [0, yc, zw + 0.08], 0.013, 12),
        rodG([0, yc, zw + 0.08], [0, yc, zw + 0.15], 0.022, 12),
        rodG([0, yc, zw + 0.15], [0, yc, zw + 0.17], 0.008, 8),
        rodG([0, yc - 0.01, zw + 0.12], [0, yc - 0.08, zw + 0.13], 0.012, 10),
        ballG(0.02, 0, yc, zw + 0.115, [1, 1.2, 1], 10),
      ]);
      // Ventilgriff: Kreuz mit Nabe, nach vorn
      const yz = zw + 0.172;
      merged(g, P.red, [boxG(w * 0.75, 0.016, 0.014, 0, yc - 0.008, yz), boxG(0.016, h * 0.36, 0.014, 0, yc - h * 0.18, yz), rodG([0, yc, yz - 0.008], [0, yc, yz + 0.012], 0.016, 10)]);
      // Schlauchanschluss und Tropfen
      cyl(g, P.plasticG, 0.017, 0.035, 0, yc - 0.12, zw + 0.13, 12);
      cyl(g, P.plastic, 0.02, 0.012, 0, yc - 0.1, zw + 0.13, 12);
      merged(g, P.water, [ballG(0.008, 0, yc - 0.135, zw + 0.13, [1, 1.4, 1], 8)]);
      return true;
    }

    // Hausnummer (Wandtyp, Rückseite −z): anthrazit Platte (Hauptfarbe) auf Abstandhaltern, aufgesetzte Zahl „12“ aus weißen
    // Balken wie eine Sieben-Segment-Anzeige
    case "garden_house_number": {
      const P = palette(M);
      const zb = -d / 2;
      const tp = Math.min(0.01, d * 0.35);
      const zp = zb + d * 0.3;
      merged(g, P.steel, [-1, 1].flatMap((sx) => [-1, 1].map((sy) => rodG([sx * w * 0.38, h / 2 + sy * h * 0.38, zb], [sx * w * 0.38, h / 2 + sy * h * 0.38, zp], 0.006, 8))));
      box(g, M.dark, w, h, tp, 0, 0, zp + tp / 2);
      // Ziffern: Segmente a (oben), b, c (rechts), d (unten), e, f (links), g (Mitte)
      const sw = Math.min(0.016, w * 0.08);
      const dh = h * 0.6;
      const dw = w * 0.3;
      const cy = h / 2;
      const zs = zp + tp;
      const ts = d - (zs - zb) - 0.002;
      const seg = (cx, s) => {
        const hy = dh / 2 - sw / 2;
        const hx = dw / 2 - sw / 2;
        const lv = dh / 2 - sw;
        return {
          a: boxG(dw - 2 * sw, sw, ts, cx, cy + hy - sw / 2, zs + ts / 2),
          g: boxG(dw - 2 * sw, sw, ts, cx, cy - sw / 2, zs + ts / 2),
          d: boxG(dw - 2 * sw, sw, ts, cx, cy - hy - sw / 2, zs + ts / 2),
          b: boxG(sw, lv, ts, cx + hx, cy + sw / 2, zs + ts / 2),
          c: boxG(sw, lv, ts, cx + hx, cy - sw / 2 - lv, zs + ts / 2),
          e: boxG(sw, lv, ts, cx - hx, cy - sw / 2 - lv, zs + ts / 2),
          f: boxG(sw, lv, ts, cx - hx, cy + sw / 2, zs + ts / 2),
        }[s];
      };
      // „1“ als einzelner Strich mit kleinem Anstrich, „2“ aus fünf Segmenten
      const x1 = -w * 0.2;
      const x2 = w * 0.14;
      const digits = [boxG(sw, dh, ts, x1, cy - dh / 2, zs + ts / 2), boxG(sw * 2, sw, ts, x1 - sw, cy + dh / 2 - sw * 1.6, zs + ts / 2, [0, 0, -0.5])];
      for (const s of ["a", "b", "g", "e", "d"]) digits.push(seg(x2, s));
      merged(g, tint(M, 0xf4f4f4, { roughness: 0.5 }), digits);
      return true;
    }

    // Brennholzlager: Holzunterstand mit Pultdach (vorn hoch, hinten tief), Lattenrückwand und -seiten, Mittelpfosten,
    // Lattenrost auf Kanthölzern, gestapelte Scheite mit sichtbaren Stirnflächen (Rinde und Hirnholz je ein Mesh)
    case "garden_firewood": {
      const P = palette(M);
      const ps = 0.07;
      const yr0 = h - 0.05; // Pfosten vorn
      const yr1 = h - 0.25; // Pfosten hinten
      const hx = w / 2 - ps / 2;
      const hz = d / 2 - ps / 2 - 0.03;
      const wood = [];
      for (const x of [-hx, 0, hx]) wood.push(boxG(ps, yr0, ps, x, 0, hz), boxG(ps, yr1, ps, x, 0, -hz));
      // Pfetten vorn und hinten, Dachsparren an den Seiten
      wood.push(boxG(w, 0.08, 0.05, 0, yr0 - 0.08, hz), boxG(w, 0.08, 0.05, 0, yr1 - 0.08, -hz));
      // Latten an Rückwand und Seiten
      const ys = [0.22, 0.45, 0.68, 0.91].filter((y) => y < yr1 - 0.15);
      for (const y of ys) {
        wood.push(boxG(w - 0.02, 0.07, 0.02, 0, y, -hz - ps / 2 - 0.01));
        for (const s of [-1, 1]) wood.push(boxG(0.02, 0.07, 2 * hz, s * (hx + ps / 2 + 0.01), y, 0));
      }
      merged(g, M.wood, wood);
      // Boden: Kanthölzer und Rost
      const yb = 0.1;
      const floor = [boxG(w - 0.1, 0.06, 0.06, 0, 0, hz - 0.1), boxG(w - 0.1, 0.06, 0.06, 0, 0, -hz + 0.1)];
      for (let i = 0; i < 4; i++) floor.push(boxG(w - 0.12, yb - 0.06, 0.08, 0, 0.06, -hz + 0.06 + ((2 * hz - 0.12) * i) / 3));
      merged(g, P.woodD, floor);
      // Pultdach mit Überstand
      const a = Math.atan2(yr0 - yr1, 2 * hz);
      const L = Math.hypot(yr0 - yr1, 2 * hz) + 0.16;
      merged(g, tint(M, 0x4b5157, { roughness: 0.85 }), [boxG(w + 0.08, 0.03, L, 0, (yr0 + yr1) / 2 - 0.005, 0, [-a, 0, 0])]);
      // Scheite: zwei Fächer, versetzte Reihen
      const r = rng(17);
      const bark = [];
      const ends = [];
      const sides = 7;
      const lg = 2 * hz - 0.1;
      const top = Math.min(yr1 - 0.12, h * 0.78);
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -hx + ps / 2 + 0.01 : ps / 2 + 0.01;
        const x1 = s < 0 ? -ps / 2 - 0.01 : hx - ps / 2 - 0.01;
        let row = 0;
        for (let y = yb + 0.055; y < top; y += 0.095, row++) {
          for (let x = x0 + 0.055 + (row % 2) * 0.055; x < x1 - 0.05; x += 0.112) {
            const rr = 0.044 + r() * 0.014;
            const zc = (r() - 0.5) * 0.04;
            const sp = r() * PI;
            const yy = y + (rr - 0.055) * 0.5;
            bark.push(at(new THREE.CylinderGeometry(rr, rr, lg, sides, 1, true), [x, yy, zc], [PI / 2, sp, 0]));
            ends.push(at(new THREE.CircleGeometry(rr, sides, sp - PI / 2), [x, yy, zc + lg / 2 + 0.001]));
            ends.push(at(new THREE.CircleGeometry(rr, sides, 1.5 * PI - sp), [x, yy, zc - lg / 2 - 0.001], [0, PI, 0]));
          }
        }
      }
      merged(g, M.bark, bark);
      merged(g, tint(M, 0xd9b98a, { roughness: 0.9 }), ends);
      return true;
    }

    default:
      return false;
  }
}
