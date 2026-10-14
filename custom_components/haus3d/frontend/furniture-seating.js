// 3D-Modelle des Katalogs „Gartenmöbel“ (catalog-garden.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.
// Sitzmöbel und Tische hier, Pavillon, Sonnensegel, Feuerschale, Außenküche und Bar in furniture-seating2.js.

import { THREE, at, boxG, cylG, merged, palette, rodG, tint } from "./garden-parts.js";
import { barG, bezier, buildSeating2, cylX, polyBarG, scallopsG, sheetG, tiltG } from "./furniture-seating2.js";

/**
 * Lattenstuhl/-bank: Vorderbeine bis unter die Armlehnen, Hinterbeine mit geneigtem Lehnenholm, Zargen, Fußstege,
 * Sitzlatten und Lehnenlatten (quer oder senkrecht). Liefert die Lehnenebene back(y) und die Neigung tilt für Polster.
 */
function slatSeat(g, w, d, h, o) {
  const { frame, slat, sy, ay, lean, zb, t = 0.045, nSeat = 5, nBack = 4, vertical = false, xs = w / 2 - 0.035, zf = d / 2 - 0.05, mids = [] } = o;
  const back = (y) => zb - (lean * (y - sy)) / (h - sy);
  const tilt = -Math.atan(lean / (h - sy));
  const fr = [];
  for (const x of [-xs, xs]) {
    fr.push(boxG(t, ay, t, x, 0, zf)); // Vorderbein bis Armlehne
    fr.push(barG([x, 0.01, zb + 0.03], [x, sy, zb], t, t)); // Hinterbein
    fr.push(barG([x, sy - 0.03, zb], [x, h - 0.012, back(h - 0.012)], t, t)); // Lehnenholm
    fr.push(boxG(0.025, 0.035, zf - zb, x, 0.13, (zf + zb) / 2)); // Fußsteg
    const za = back(ay) - 0.02;
    fr.push(boxG(0.075, 0.026, zf + 0.06 - za, x, ay, (zf + 0.06 + za) / 2)); // Armlehne
  }
  for (const x of [-xs, ...mids, xs]) fr.push(boxG(0.03, 0.06, zf - zb, x, sy - 0.085, (zf + zb) / 2)); // Zargen seitlich
  fr.push(boxG(2 * xs, 0.06, 0.025, 0, sy - 0.085, zf), boxG(2 * xs, 0.06, 0.025, 0, sy - 0.085, zb));
  merged(g, frame, fr);
  const sl = [];
  const sd = Math.min(0.08, (zf - zb + 0.04) / nSeat - 0.015);
  for (let i = 0; i < nSeat; i++) sl.push(boxG(2 * xs - t, 0.024, sd, 0, sy - 0.025, zb + 0.02 + ((zf - zb + 0.02) * i) / (nSeat - 1)));
  const off = t / 2 + 0.011;
  const y0 = sy + 0.12;
  const y1 = h - 0.06;
  if (vertical) {
    // Querriegel unten und oben, dazwischen senkrechte Latten
    sl.push(tiltG(2 * xs + t, 0.06, 0.022, 0, y0, back(y0) + off, tilt), tiltG(2 * xs + t, 0.1, 0.022, 0, y1 - 0.01, back(y1) + off, tilt));
    for (let i = 0; i < nBack; i++) {
      const x = -xs + ((i + 0.5) * 2 * xs) / nBack;
      sl.push(barG([x, y0, back(y0) + off + 0.004], [x, y1, back(y1) + off + 0.004], 0.055, 0.02));
    }
  } else
    for (let i = 0; i < nBack; i++) {
      const y = y0 + ((y1 - y0) * i) / (nBack - 1);
      sl.push(tiltG(2 * xs + t, i === nBack - 1 ? 0.1 : 0.07, 0.022, 0, y, back(y) + off, tilt));
    }
  merged(g, slat, sl);
  return { back, tilt, xs, zf, off };
}

/** Lounge-Möbel: Geflechtsockel mit Armlehnen und Rücken, dicke Sitz- und Rückenkissen, Zierkissen. */
function lounge(g, M, P, w, d, h, seats) {
  const aw = seats > 1 ? 0.17 : 0.15;
  const feet = 0.04;
  const sy = 0.33;
  const ya = 0.6;
  const yb = 0.6;
  const bt = 0.16;
  merged(g, P.black, [-1, 1].flatMap((sx) => [-1, 1].map((sz) => boxG(0.06, feet, 0.06, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)))));
  const wi = w - 2 * aw;
  merged(g, P.rattan, [boxG(wi, sy - feet, d - bt, 0, feet, bt / 2), boxG(w, yb - feet, bt, 0, feet, -d / 2 + bt / 2), ...[-1, 1].map((sx) => boxG(aw, ya - feet, d, sx * (w / 2 - aw / 2), feet, 0))]);
  // Geflecht: feine Rillen quer und längs auf den Außenflächen
  const ln = [];
  for (let y = feet + 0.03; y < ya - 0.015; y += 0.042) {
    for (const sx of [-1, 1]) ln.push(boxG(aw + 0.004, 0.008, 0.004, sx * (w / 2 - aw / 2), y, d / 2 + 0.002), boxG(0.004, 0.008, d + 0.004, sx * (w / 2 + 0.002), y, 0));
    if (y < sy - 0.015) ln.push(boxG(wi, 0.008, 0.004, 0, y, d / 2 + 0.002));
    ln.push(boxG(w + 0.004, 0.008, 0.004, 0, y, -d / 2 - 0.002));
  }
  for (let x = -wi / 2 + 0.05; x < wi / 2; x += 0.1) ln.push(boxG(0.006, sy - feet - 0.01, 0.004, x, feet + 0.005, d / 2 + 0.003));
  for (const sx of [-1, 1]) for (let z = -d / 2 + 0.06; z < d / 2; z += 0.1) ln.push(boxG(0.004, ya - feet - 0.01, 0.006, sx * (w / 2 + 0.003), feet + 0.005, z));
  merged(g, tint(M, 0x4a3b2e, { roughness: 0.9 }), ln);
  // Kissen: Sitz vorn gerundet, Rücken geneigt
  const cw = wi / seats - 0.012;
  const ct = 0.12;
  const zb = -d / 2 + bt;
  const zfront = d / 2 + 0.01;
  const cush = [];
  const tilt = -0.24;
  const yB = sy + ct - 0.01;
  const bh = (h - yB) / Math.cos(tilt) - 0.03;
  const bth = 0.15;
  const zc = zb + bth / 2 + 0.04;
  for (let i = 0; i < seats; i++) {
    const x = -wi / 2 + ((i + 0.5) * wi) / seats;
    cush.push(boxG(cw, ct, zfront - zb - ct / 2, x, sy, (zb + zfront - ct / 2) / 2));
    cush.push(cylX(ct / 2, cw, x, sy + ct / 2, zfront - ct / 2, 14));
    cush.push(tiltG(cw, bh, bth, x, (yB + h) / 2 - 0.01, zc, tilt));
  }
  merged(g, M.light, cush);
  // Zierkissen an den Enden (beim Sessel eins)
  const pil = [];
  const ends = seats > 1 ? [-1, 1] : [1];
  for (const s of ends) pil.push(at(new THREE.SphereGeometry(0.19, 12, 8), [s * (wi / 2 - (seats > 1 ? 0.24 : 0.2)), sy + ct + 0.17, zc + bth / 2 + 0.07], [tilt, 0, -s * 0.18], [1, 1, 0.42]));
  merged(g, tint(M, 0xb85c38, { roughness: 0.95 }), pil);
}

/** Bistrostuhl (Gruppe, Vorderseite +z): Rohrgestell, Sitz- und Lehnenlatten. */
function bistroChair(M, P, cw, cd, ch) {
  const c = new THREE.Group();
  const sy = 0.45;
  const r = 0.011;
  const xb = cw / 2 - 0.02;
  const xt = cw / 2 - 0.04;
  const zft = cd / 2 - 0.05;
  const zbt = -cd / 2 + 0.08;
  const tube = [];
  for (const sx of [-1, 1]) {
    tube.push(rodG([sx * xb, 0, cd / 2 - 0.025], [sx * xt, sy - 0.02, zft], r, 6));
    tube.push(rodG([sx * xb, 0, -cd / 2 + 0.03], [sx * xt, sy - 0.02, zbt], r, 6));
    tube.push(rodG([sx * xt, sy - 0.02, zbt], [sx * (xt - 0.01), ch - 0.012, -cd / 2 + 0.012], r, 6));
    tube.push(rodG([sx * xt, sy - 0.02, zft], [sx * xt, sy - 0.02, zbt], r, 6));
    tube.push(rodG([sx * (xb - 0.008), 0.15, cd / 2 - 0.035], [sx * (xb - 0.008), 0.15, -cd / 2 + 0.045], r * 0.8, 6));
  }
  tube.push(rodG([-xt, sy - 0.02, zft], [xt, sy - 0.02, zft], r, 6), rodG([-xb + 0.01, 0.15, cd / 2 - 0.035], [xb - 0.01, 0.15, cd / 2 - 0.035], r * 0.8, 6));
  merged(c, P.steelD, tube);
  const wd = [];
  for (let i = 0; i < 4; i++) wd.push(boxG(2 * xt + 0.03, 0.018, (zft - zbt + 0.04) / 4 - 0.01, 0, sy - 0.01, zbt + 0.01 + ((zft - zbt + 0.02) * (i + 0.5)) / 4));
  const lean = cd / 2 - 0.08 - 0.012;
  const back = (y) => zbt - ((lean + 0.0) * (y - sy)) / (ch - sy) + 0.0;
  const tilt = -Math.atan(lean / (ch - sy));
  for (const [y, hh] of [
    [sy + 0.2, 0.05],
    [sy + 0.3, 0.05],
    [ch - 0.06, 0.09],
  ])
    wd.push(tiltG(2 * xt + 0.01, hh, 0.016, 0, y, back(y) + 0.02, tilt));
  merged(c, M.wood, wd);
  return c;
}

/** Baut einen Typ dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildSeating(type, w, d, h, M, g, bulbs, item = {}) {
  const P = palette(M);
  switch (type) {
    // Gartenstuhl: Holzrahmen, fünf Sitzlatten, vier Lehnenlatten (oben breiter), Armlehnen auf den Vorderbeinen
    case "garden_chair":
      slatSeat(g, w, d, h, { frame: M.wood, slat: M.wood, sy: h * 0.52, ay: h * 0.76, lean: d * 0.16, zb: -d / 2 + 0.13 });
      return true;
    // Stapelstuhl: Alurohr mit gespreizten Beinen, Kunststoff-Sitzschale mit gerundeter Kante, Sprossenlehne, Armauflagen
    case "garden_chair_stack": {
      const sy = h * 0.54;
      const ys = sy - 0.035;
      const r = 0.012;
      const xb = w / 2 - 0.025;
      const xt = w / 2 - 0.06;
      const zfb = d / 2 - 0.025;
      const zft = d / 2 - 0.08;
      const zbb = -d / 2 + 0.03;
      const zbt = -d / 2 + 0.09;
      const zTop = -d / 2 + 0.015;
      const yTop = h - 0.02;
      const bz = (y) => zbt + ((zTop - zbt) * (y - ys)) / (yTop - ys);
      const tilt = -Math.atan((zbt - zTop) / (yTop - ys));
      const ya = sy + 0.2;
      const tube = [];
      for (const sx of [-1, 1]) {
        tube.push(rodG([sx * xb, 0.01, zfb], [sx * xt, ys, zft], r), rodG([sx * xb, 0.01, zbb], [sx * xt, ys, zbt], r));
        tube.push(rodG([sx * xt, ys, zbt], [sx * (xt - 0.012), yTop, zTop], r), rodG([sx * xt, ys, zft], [sx * xt, ys, zbt], r));
        tube.push(rodG([sx * (xt - 0.006), ya, bz(ya)], [sx * xt, ya, zft - 0.03], r), rodG([sx * xt, ya, zft - 0.03], [sx * xt, ys, zft], r));
      }
      tube.push(rodG([-xt, ys, zft], [xt, ys, zft], r), rodG([-xt, ys, zbt], [xt, ys, zbt], r));
      merged(g, P.steel, tube);
      merged(g, P.rubber, [-1, 1].flatMap((sx) => [zfb, zbb].map((z) => cylG(r + 0.004, 0.02, sx * xb, 0, z, 8))));
      const pl = [boxG(2 * xt + 0.03, 0.028, zft - zbt + 0.02, 0, ys + 0.004, (zft + zbt) / 2 - 0.01), cylX(0.018, 2 * xt + 0.03, 0, ys + 0.016, zft + 0.002, 12)];
      const y0 = sy + 0.11;
      const y1 = yTop - 0.06;
      pl.push(tiltG(2 * xt + 0.02, 0.1, 0.024, 0, y1, bz(y1) + 0.008, tilt), tiltG(2 * xt - 0.01, 0.035, 0.02, 0, y0, bz(y0) + 0.008, tilt));
      for (let i = 0; i < 5; i++) {
        const x = -xt * 0.72 + i * xt * 0.36;
        pl.push(barG([x, y0, bz(y0) + 0.008], [x, y1, bz(y1) + 0.008], 0.024, 0.016));
      }
      for (const sx of [-1, 1]) pl.push(boxG(0.04, 0.022, zft - bz(ya) - 0.02, sx * xt, ya, (zft + bz(ya)) / 2 - 0.01));
      merged(g, M.white, pl);
      return true;
    }
    // Hochlehner: Teakrahmen mit hoher Lehne aus senkrechten Latten, Armlehnen, Sitz- und Rückenauflage mit Knöpfen
    case "garden_chair_high": {
      const sy = h * 0.37;
      const s = slatSeat(g, w, d, h, { frame: P.teak, slat: P.teak, sy, ay: h * 0.58, lean: d * 0.2, zb: -d / 2 + 0.19, t: 0.05, nBack: 5, vertical: true, xs: w / 2 - 0.04, zf: d / 2 - 0.06 });
      const cw = 2 * s.xs - 0.06;
      const zb = s.back(sy);
      const pad = [boxG(cw, 0.06, s.zf - zb - 0.01, 0, sy, (s.zf + zb) / 2 + 0.005), cylX(0.03, cw, 0, sy + 0.03, s.zf + 0.0, 12)];
      const yb0 = sy + 0.07;
      const yb1 = h - 0.13;
      const bl = (yb1 - yb0) / Math.cos(s.tilt);
      const ym = (yb0 + yb1) / 2;
      const zo = s.off + 0.04;
      pad.push(tiltG(cw, bl, 0.06, 0, ym, s.back(ym) + zo, s.tilt));
      // Knöpfe im Rückenpolster
      for (const y of [ym - 0.18, ym, ym + 0.18]) pad.push(at(new THREE.SphereGeometry(0.018, 8, 6), [0, y, s.back(y) + zo + 0.03], [s.tilt, 0, 0], [1, 1, 0.5]));
      merged(g, M.fabric, pad);
      return true;
    }
    // Gartenbank (Dreisitzer): dunkle Metallwangen mit Zierschnörkel, Mittelträger, Holzlatten für Sitz und Lehne, Holz-Armlehnen
    case "garden_bench": {
      const sy = h * 0.52;
      const ay = h * 0.75;
      const lean = d * 0.22;
      const xs = w / 2 - 0.04;
      const zf = d / 2 - 0.07;
      const zb = -d / 2 + 0.17;
      const back = (y) => zb - (lean * (y - sy)) / (h - sy);
      const tilt = -Math.atan(lean / (h - sy));
      const iron = [];
      for (const x of [-xs, 0, xs]) {
        if (x) {
          iron.push(barG([x, 0.01, zf + 0.03], [x, ay, zf], 0.035, 0.04));
          iron.push(barG([x, 0.01, zb - 0.08], [x, sy - 0.03, zb], 0.035, 0.04));
          iron.push(barG([x, sy - 0.06, zb], [x, h - 0.012, back(h - 0.012)], 0.035, 0.04));
          iron.push(barG([x, 0.12, zf + 0.025], [x, 0.12, zb - 0.055], 0.025, 0.03));
          iron.push(at(new THREE.TorusGeometry(0.075, 0.012, 6, 18), [x, 0.27, (zf + zb) / 2 - 0.01], [0, Math.PI / 2, 0]));
          iron.push(at(new THREE.TorusGeometry(0.04, 0.01, 6, 14), [x, ay - 0.07, zf - 0.06], [0, Math.PI / 2, 0]));
        }
        iron.push(barG([x, sy - 0.055, zf + 0.04], [x, sy - 0.055, zb - 0.01], 0.03, 0.05));
      }
      iron.push(barG([-xs, 0.2, zb - 0.035], [xs, 0.2, zb - 0.035], 0.02, 0.02));
      merged(g, P.steelD, iron);
      const wood = [];
      for (let i = 0; i < 5; i++) wood.push(boxG(2 * xs + 0.05, 0.026, 0.075, 0, sy - 0.026, zb - 0.0 + ((zf + 0.04 - zb) * i) / 4));
      for (let i = 0; i < 4; i++) {
        const y = sy + 0.12 + ((h - 0.07 - sy - 0.12) * i) / 3;
        wood.push(tiltG(2 * xs + 0.02, i === 3 ? 0.09 : 0.07, 0.024, 0, y, back(y) + 0.032, tilt));
      }
      for (const x of [-xs, xs]) wood.push(boxG(0.08, 0.03, zf + 0.07 - back(ay) + 0.02, x, ay, (zf + 0.07 + back(ay) - 0.02) / 2));
      merged(g, M.wood, wood);
      return true;
    }
    // Lounge-Sofa und -Sessel: Geflechtsockel, dicke Kissen, Zierkissen
    case "garden_lounge_sofa":
      lounge(g, M, P, w, d, h, 3);
      return true;
    case "garden_lounge_chair":
      lounge(g, M, P, w, d, h, 1);
      return true;
    // Liegestuhl: Klappgestell aus Buchenleisten (Lehnenrahmen, Sitzrahmen, Stütze), gestreifte Stoffbahn hängt durch;
    // Lehne oben hinten (−z), Sitzkante vorn (+z)
    case "garden_deckchair": {
      const xo = w / 2 - 0.012;
      const xi = w / 2 - 0.046;
      const xp = w / 2 - 0.08;
      const L0 = [0.015, 0.33 * d];
      const L1 = [h - 0.025, -0.47 * d];
      const S0 = [0.015, -0.43 * d];
      const S1 = [0.47 * h, 0.47 * d];
      const lp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const Pa = lp(S0, S1, 0.13);
      const Pb = lp(L0, L1, 0.6);
      const wood = [];
      for (const sx of [-1, 1]) {
        wood.push(barG([sx * xo, ...L0], [sx * xo, ...L1], 0.022, 0.045));
        wood.push(barG([sx * xi, ...S0], [sx * xi, ...S1], 0.022, 0.045));
        wood.push(barG([sx * xp, ...Pa], [sx * xp, ...Pb], 0.022, 0.04));
      }
      const cross = (x, [y, z]) => cylX(0.014, 2 * x + 0.024, 0, y, z, 8);
      wood.push(cross(xo, lp(L0, L1, 0.97)), cross(xo, lp(L0, L1, 0.07)), cross(xi, lp(S0, S1, 0.96)), cross(xi, lp(S0, S1, 0.06)), cross(xp, Pb));
      merged(g, P.woodL, wood);
      // Stoffbahn: vom oberen Querholz durchhängend zum vorderen Querholz, fünf Streifen
      const A = lp(L0, L1, 0.97);
      const C = lp(S0, S1, 0.96);
      const curve = bezier([A[0] + 0.012, A[1] + 0.015], [0.02 * h, 0.04 * d], [C[0] + 0.016, C[1] - 0.004], 14);
      const cw = 2 * xp - 0.04;
      const stripes = [[], []];
      for (let i = 0; i < 5; i++) {
        const x0 = -cw / 2 + (i * cw) / 5;
        stripes[i % 2].push(sheetG(curve.map(([y, z]) => [[x0, y, z], [x0 + cw / 5, y, z]]), 0.008));
      }
      merged(g, M.fabric, stripes[0]);
      merged(g, P.cream, stripes[1]);
      return true;
    }
    // Hängematte mit Gestell: zwei parallele Bogenholme längs z, zwei Querfüße mit Klötzen, Haken oben,
    // Spreizstäbe mit aufgefächerten Schnüren, durchhängendes Tuch mit Streifen, Kissen
    case "garden_hammock": {
      const zE = d / 2 - 0.075;
      const yTop = h - 0.07;
      const y0 = 0.17;
      const arcY = (z) => y0 + (yTop - y0) * Math.pow(Math.abs(z) / zE, 2.7);
      const fr = [];
      const N = 18;
      for (const x of [-0.07, 0.07]) {
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const z = -zE + (2 * zE * i) / N;
          pts.push([x, arcY(z), z]);
        }
        fr.push(...polyBarG(pts, 0.06, 0.09));
      }
      const zF = d * 0.24;
      for (const s of [-1, 1]) {
        fr.push(boxG(w, 0.07, 0.12, 0, 0, s * zF), boxG(0.24, arcY(zF) - 0.07 - 0.03, 0.1, 0, 0.07, s * zF));
      }
      merged(g, P.teak, fr);
      merged(g, P.black, [-1, 1].flatMap((s) => [-1, 1].map((x) => boxG(0.08, 0.012, 0.13, x * (w / 2 - 0.05), 0.0, s * zF))));
      // Haken, Seile, Spreizstäbe
      const zS = d * 0.35;
      const yS = h * 0.72;
      const steel = [];
      const rope = [];
      const sb = [];
      for (const s of [-1, 1]) {
        const hz = s * (zE - 0.02);
        steel.push(at(new THREE.TorusGeometry(0.035, 0.007, 5, 12), [0, yTop - 0.08, hz], [0, Math.PI / 2, 0]));
        steel.push(rodG([0, yTop - 0.045, hz], [0, yTop, hz], 0.007, 5));
        sb.push(cylX(0.016, w * 0.88, 0, yS, s * zS, 8));
        for (let k = 0; k < 7; k++) rope.push(rodG([0, yTop - 0.11, hz - s * 0.02], [-w * 0.4 + (k * w * 0.8) / 6, yS, s * zS], 0.0045, 4));
      }
      merged(g, P.steel, steel);
      merged(g, P.woodL, sb);
      merged(g, tint(M, 0xd8c8a0, { roughness: 0.95 }), rope);
      // Tuch: Durchhang längs und quer, in der Mitte etwas schmaler
      const sag = yS - h * 0.36;
      const yAt = (z, u) => yS - sag * (1 - (z / zS) ** 2) - 0.07 * (1 - u * u) * (1 - (z / zS) ** 2);
      const cloth = [[], []];
      const hw = w * 0.42;
      for (let i = 0; i < 5; i++) {
        const u0 = -1 + (i * 2) / 5;
        const u1 = u0 + 2 / 5;
        const rows = [];
        for (let k = 0; k <= 16; k++) {
          const z = -zS + (2 * zS * k) / 16;
          const sh = 1 - 0.14 * (1 - (z / zS) ** 2);
          rows.push([u0, u1].map((u) => [u * hw * sh, yAt(z, u), z]));
        }
        cloth[i % 2].push(sheetG(rows, 0.01));
      }
      merged(g, M.fabric, cloth[0]);
      merged(g, P.cream, [...cloth[1], at(new THREE.SphereGeometry(0.17, 12, 8), [0, yAt(-zS + 0.35, 0) + 0.06, -zS + 0.35], [0.35, 0, 0], [1.35, 0.42, 0.8])]);
      return true;
    }
    // Hollywoodschaukel: A-Gestell aus Rohr mit Querholm, Schrägdach aus Stoff mit Volant, hängende Bank mit Armlehnen,
    // Sitz- und drei Rückenpolster, Hängestreben
    case "garden_swing_seat": {
      const r = 0.024;
      const xa = w / 2 - 0.03;
      const za = d / 2 - 0.04;
      const ya = h * 0.85;
      const st = [];
      for (const sx of [-1, 1]) {
        const x = sx * xa;
        st.push(rodG([x, 0.02, za], [x, ya, 0], r, 8), rodG([x, 0.02, -za], [x, ya, 0], r, 8), rodG([x, 0.025, za + 0.02], [x, 0.025, -za - 0.02], r, 8));
        st.push(rodG([x, ya * 0.32, za * 0.68], [x, ya * 0.32, -za * 0.68], r * 0.8, 8));
        // Dachstreben
        st.push(rodG([x, ya, 0], [x, h - 0.08, 0], r * 0.8, 8));
      }
      st.push(cylX(r * 1.3, 2 * xa + 0.04, 0, ya, 0, 10), cylX(r * 0.8, 2 * xa, 0, 0.03, -za * 0.98, 8));
      // Dachrahmen: vorn niedriger, hinten höher
      const yF = h - 0.15;
      const yB = h - 0.015;
      const zr = za + 0.03;
      for (const sx of [-1, 1]) st.push(rodG([sx * (xa + 0.02), yF, zr], [sx * (xa + 0.02), yB, -zr], 0.014, 6));
      st.push(cylX(0.014, 2 * xa + 0.04, 0, yF, zr, 6), cylX(0.014, 2 * xa + 0.04, 0, yB, -zr, 6));
      merged(g, P.steelD, st);
      const roof = [];
      const rows = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const y = yF + (yB - yF) * t + 0.018 - 0.035 * Math.sin(Math.PI * t);
        const z = zr - 2 * zr * t;
        rows.push([[-xa - 0.04, y, z], [xa + 0.04, y, z]]);
      }
      roof.push(sheetG(rows, 0.012));
      roof.push(boxG(2 * xa + 0.08, 0.09, 0.012, 0, yF - 0.07, zr + 0.01), ...scallopsG(2 * xa + 0.08, 0, yF - 0.07, zr + 0.01, "x", 0.045));
      roof.push(boxG(2 * xa + 0.08, 0.09, 0.012, 0, yB - 0.07, -zr - 0.01), ...scallopsG(2 * xa + 0.08, 0, yB - 0.07, -zr - 0.01, "x", 0.045));
      // Bank: Rahmen, Armlehnen, Hängestreben zum Querholm
      const bx = xa - 0.17;
      const ys = 0.46;
      const zs = 0.27;
      const ba = ys + 0.24;
      const zt = -zs - 0.14;
      const yt = ys + 0.58;
      const bench = [];
      for (const sx of [-1, 1]) {
        const x = sx * bx;
        bench.push(rodG([x, ys, zs], [x, ys, -zs], 0.016, 6), rodG([x, ys, -zs], [x, yt, zt], 0.016, 6));
        bench.push(rodG([x, ba, zs], [x, ba, -zs - 0.06], 0.016, 6), rodG([x, ys, zs], [x, ba, zs], 0.016, 6));
        bench.push(rodG([x, ba, zs - 0.02], [sx * (bx + 0.02), ya - 0.02, 0.02], 0.008, 5), rodG([x, ba, -zs - 0.05], [sx * (bx + 0.02), ya - 0.02, -0.02], 0.008, 5));
        bench.push(at(new THREE.TorusGeometry(0.03, 0.007, 5, 10), [sx * (bx + 0.02), ya - 0.05, 0], [0, Math.PI / 2, 0]));
      }
      bench.push(cylX(0.016, 2 * bx, 0, ys, zs, 6), cylX(0.016, 2 * bx, 0, ys, -zs, 6), cylX(0.016, 2 * bx, 0, yt, zt, 6));
      merged(g, P.steel, bench);
      // Polster
      const cw = 2 * bx - 0.04;
      const pad = [boxG(cw, 0.09, 2 * zs - 0.04, 0, ys + 0.015, -0.02), cylX(0.045, cw, 0, ys + 0.06, zs - 0.04, 12)];
      const tilt = -Math.atan((zs + zt) / -(yt - ys));
      for (let i = 0; i < 3; i++) {
        const x = -cw / 2 + ((i + 0.5) * cw) / 3;
        pad.push(tiltG(cw / 3 - 0.012, yt - ys - 0.14, 0.1, x, (ys + yt) / 2 + 0.05, (-zs + zt) / 2 + 0.07, tilt));
      }
      merged(g, M.fabric, [...roof, ...pad]);
      return true;
    }
    // Strandkorb: helles Geflecht (Seitenwände mit Haubenprofil, Rückwand, Sockel), gewölbte Haube mit gestreiftem Futter,
    // Sitzpolster, gestreifte Rückenlehne, Holz-Armauflagen, zwei Fußstützen vorn (+z)
    case "garden_beach_chair": {
      const hw = w / 2;
      const zb = -d / 2;
      const zf = d / 2 - 0.15;
      const tw = 0.07;
      const ya = h * 0.435;
      const ys = h * 0.255;
      const F = [h * 0.945, 0.2 * d]; // Vorderkante der Haube (y, z)
      const Q2 = [h * 1.055, -0.46 * d];
      const B = [h * 0.667, zb];
      const prof = new THREE.Shape();
      prof.moveTo(-zb, 0);
      prof.lineTo(-zf, 0);
      prof.lineTo(-zf, ya);
      prof.lineTo(-0.04 * d, ya);
      prof.quadraticCurveTo(0.04 * d, h * 0.68, -F[1], F[0]);
      prof.quadraticCurveTo(-Q2[1], Q2[0], -B[1], B[0]);
      prof.lineTo(-zb, 0);
      const wick = [];
      for (const sx of [-1, 1]) {
        const geo = new THREE.ExtrudeGeometry(prof, { depth: tw, bevelEnabled: false, curveSegments: 10 });
        geo.rotateY(Math.PI / 2);
        geo.translate(sx * (hw - tw / 2) - tw / 2, 0, 0);
        wick.push(geo);
      }
      const xi = hw - tw;
      wick.push(boxG(2 * xi, B[0], 0.06, 0, 0, zb + 0.03), boxG(2 * xi, ys, zf - zb - 0.06, 0, 0, (zf + zb + 0.06) / 2));
      // Haube: Schale über die volle Breite, Futter in Streifen darunter
      const curve = bezier(F, Q2, B, 14);
      const nrm = curve.map(([y, z], i) => {
        const [y2, z2] = curve[Math.min(i + 1, curve.length - 1)];
        const [y1, z1] = curve[Math.max(i - 1, 0)];
        let ny = z2 - z1;
        let nz = -(y2 - y1);
        const l = Math.hypot(ny, nz);
        ny /= l;
        nz /= l;
        // nach innen (zur Sitzfläche)
        return ny * (1.0 - y) + nz * (-0.1 - z) > 0 ? [ny, nz] : [-ny, -nz];
      });
      wick.push(sheetG(curve.map(([y, z]) => [[-hw, y, z], [hw, y, z]]), 0.03));
      // Fußstützen
      for (const sx of [-1, 1]) wick.push(boxG(hw - 0.08, 0.15, 0.15, sx * (hw / 2 - 0.02), 0.04, zf + 0.075));
      merged(g, M.light, wick);
      const lines = [];
      for (let y = 0.05; y < B[0] - 0.02; y += 0.045) {
        if (y < ya - 0.02) for (const sx of [-1, 1]) lines.push(boxG(0.004, 0.008, zf - zb, sx * (hw + 0.002), y, (zf + zb) / 2), boxG(tw, 0.008, 0.004, sx * (hw - tw / 2), y, zf + 0.002));
        if (y < ys - 0.02) lines.push(boxG(2 * xi, 0.008, 0.004, 0, y, zf + 0.002));
        lines.push(boxG(w, 0.008, 0.004, 0, y, zb - 0.002));
      }
      for (const t of [0.12, 0.3, 0.48, 0.66, 0.84]) {
        const i = Math.round(t * 14);
        const [y, z] = curve[i];
        lines.push(cylX(0.007, w + 0.004, 0, y - nrm[i][0] * 0.016, z - nrm[i][1] * 0.016, 6));
      }
      lines.push(cylX(0.02, w + 0.01, 0, F[0], F[1], 10));
      merged(g, tint(M, 0xb7a684, { roughness: 0.9 }), lines);
      // Polster und Streifenfutter (Haube und Rücken)
      const stripe = [[], []];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x0 = -xi + (i * 2 * xi) / n;
        const x1 = x0 + (2 * xi) / n;
        stripe[i % 2].push(sheetG(curve.slice(0, 13).map(([y, z], k) => [x0, x1].map((x) => [x, y + nrm[k][0] * 0.026, z + nrm[k][1] * 0.026])), 0.008));
        stripe[i % 2].push(tiltG(x1 - x0, B[0] - ys - 0.1, 0.04, (x0 + x1) / 2, (B[0] + ys + 0.1) / 2, zb + 0.09, -0.08));
      }
      stripe[0].push(boxG(2 * xi - 0.02, 0.08, zf - zb - 0.12, 0, ys, (zf + zb + 0.12) / 2 + 0.01));
      for (const sx of [-1, 1]) stripe[0].push(boxG(hw - 0.1, 0.025, 0.13, sx * (hw / 2 - 0.02), 0.19, zf + 0.075));
      merged(g, M.fabric, stripe[0]);
      merged(g, P.cream, stripe[1]);
      merged(g, P.teak, [-1, 1].map((sx) => boxG(tw + 0.03, 0.025, zf + 0.02 - 0.04 * d, sx * (hw - tw / 2), ya, (zf + 0.02 + 0.04 * d) / 2)));
      return true;
    }
    // Runder Gartentisch: Platte aus Holzlatten (Sehnen), Zarge als Ring, drei schräge Beine mit Sternstreben, Schirmloch
    case "garden_table_round": {
      const R = Math.min(w, d) / 2;
      const tt = 0.032;
      const yt = h - tt;
      const n = 9;
      const gap = 0.012;
      const sw = (2 * R - (n - 1) * gap) / n;
      const top = [];
      for (let i = 0; i < n; i++) {
        const z = -R + sw / 2 + i * (sw + gap);
        top.push(boxG(2 * Math.sqrt(Math.max(R * R - z * z, 0.01)), tt, sw, 0, yt, z));
      }
      top.push(at(new THREE.TorusGeometry(R - 0.08, 0.022, 6, 36), [0, yt - 0.04, 0], [Math.PI / 2, 0, 0], [1, 1, 1.8]));
      const yh = 0.24;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        top.push(barG([c * (R - 0.04), 0.01, s * (R - 0.04)], [c * (R - 0.12), yt - 0.02, s * (R - 0.12)], 0.055, 0.055));
        const k = (yh - 0.01) / (yt - 0.03);
        const lr = R - 0.04 - 0.08 * k;
        top.push(barG([0, yh, 0], [c * lr, yh, s * lr], 0.035, 0.04));
      }
      top.push(cylG(0.055, 0.07, 0, yh - 0.035, 0, 12));
      merged(g, M.wood, top);
      merged(g, P.black, [cylG(0.025, 0.004, 0, h, 0, 12)]);
      return true;
    }
    // Bistro-Set: kleiner runder Tisch (Rohrbeine, Fußring) und zwei Klappstühle links und rechts, einander zugewandt
    case "garden_bistro": {
      const R = Math.min(0.275, d / 2);
      const th = h * 0.8;
      merged(g, M.wood, [cylG(R, 0.022, 0, th - 0.022, 0, 28)]);
      const fr = [at(new THREE.TorusGeometry(R, 0.012, 6, 32), [0, th - 0.012, 0], [Math.PI / 2, 0, 0]), at(new THREE.TorusGeometry(R * 0.55, 0.01, 6, 24), [0, 0.22, 0], [Math.PI / 2, 0, 0])];
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        fr.push(rodG([c * R * 0.3, th - 0.025, s * R * 0.3], [c * R * 0.82, 0.01, s * R * 0.82], 0.013, 6));
      }
      merged(g, P.steelD, fr);
      const cd = 0.42;
      for (const s of [-1, 1]) {
        const c = bistroChair(M, P, Math.min(0.42, d - 0.06), cd, h);
        c.rotation.y = (-s * Math.PI) / 2;
        c.position.x = s * (w / 2 - cd / 2);
        g.add(c);
      }
      return true;
    }
    default:
      return buildSeating2(type, w, d, h, M, g, bulbs, item);
  }
}
