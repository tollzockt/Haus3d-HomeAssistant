// Fahrzeuge und Gartengeräte der Kategorie „Garage & Werkstatt“ (Fahrräder, Motorrad, Roller, Mäher, Schubkarre):
// Länge entlang z, Vorderseite bzw. Vorderrad bei +z. Gebaut in den Nennmaßen des Katalogs und auf die Maße des
// Möbelstücks gestreckt. Dazu gemeinsame Helfer (Teile-Sammler, Räder, Bögen, Wannen) für furniture-garage.js.

import { THREE, at, ballG, boxG, cylG, merged, palette, rodG, tint } from "./garden-parts.js";

/** Hauptfarbe: eigene Farbe des Möbelstücks (ersetzt M.wood), sonst die Vorgabe des Modells. */
export const own = (M, item, def) => (/^#[0-9a-f]{6}$/i.test(item.color ?? "") ? M.wood : def);

/** Teile-Sammler: add(mat, geo, …) merkt Geometrien je Material, add.done() fasst sie zu je einem Mesh zusammen. */
export function parts(g) {
  const map = new Map();
  const add = (mat, ...geos) => {
    if (!map.has(mat)) map.set(mat, []);
    map.get(mat).push(...geos);
  };
  add.done = () => {
    for (const [mat, geos] of map) merged(g, mat, geos);
    map.clear();
  };
  return add;
}

/** Teilgruppe in Nennmaßen (W, D, H), gestreckt auf die Maße des Möbelstücks. */
export function nominal(g, w, d, h, W, D, H) {
  const k = new THREE.Group();
  k.scale.set(w / W, h / H, d / D);
  g.add(k);
  return k;
}

/** Zylinder-Geometrie mit Achse entlang x (Rad, Welle, Kessel), Mitte (x, y, z). */
export const xCylG = (r, len, x, y, z, seg = 16, r2 = r) => at(new THREE.CylinderGeometry(r2, r, Math.max(len, 0.002), seg), [x, y, z], [0, 0, Math.PI / 2]);
/** Zylinder-Geometrie mit Achse entlang z (Scheinwerfer, Anzeige, Rohr längs), Mitte (x, y, z). */
export const zCylG = (r, len, x, y, z, seg = 16, r2 = r) => at(new THREE.CylinderGeometry(r2, r, Math.max(len, 0.002), seg), [x, y, z], [Math.PI / 2, 0, 0]);
/** Reifen (Torus) mit Außenradius R und Wulst r, Rad in der y-z-Ebene (Achse x); k streckt die Breite. */
export const tireG = (R, r, x, y, z, k = 1, seg = 24, tube = 8) => at(new THREE.TorusGeometry(R - r, r, tube, seg), [x, y, z], [0, Math.PI / 2, 0], [1, 1, k]);
/** Bogen um die Achse x (Schutzblech): Winkel a0 bis a1 (0 = hinten −z, π/2 = oben, π = vorn +z), Band der Breite bw. */
export const arcG = (R, x, y, z, a0, a1, bw = 0.05, t = 0.007) => at(new THREE.TorusGeometry(R, t, 4, 14, a1 - a0), [x, y, z], [0, Math.PI / 2, a0], [1, 1, bw / (2 * t)]);

/** Quader von a nach b (Akku am Rohr, Holm, Leiterholm), Querschnitt wx (entlang x) × t. */
export function beamG(a, b, wx, t) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return at(new THREE.BoxGeometry(wx, Math.max(va.distanceTo(vb), 0.002), t), va.add(vb).multiplyScalar(0.5).toArray(), new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3));
}

/**
 * Offene Wanne zwischen unterem und oberem Viereck (je vier Ecken, reihum): Seitenwände und Boden außen und – um die
 * Wandstärke nach innen versetzt – innen sichtbar (für jedes Material, ohne doppelseitige Flächen).
 */
export function trayG(bottom, top, inset = 0.03) {
  const all = [...bottom, ...top];
  const c = [0, 1, 2].map((i) => all.reduce((s, p) => s + p[i], 0) / 8);
  const quads = [[bottom[0], bottom[1], bottom[2], bottom[3]]];
  for (let i = 0; i < 4; i++) quads.push([bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]]);
  const pos = [];
  const v = (p) => new THREE.Vector3(...p);
  for (const q of quads) {
    const [a, b, d] = [v(q[0]), v(q[1]), v(q[3])];
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    const mid = q.reduce((s, p) => s.add(v(p)), new THREE.Vector3()).multiplyScalar(0.25);
    const out = n.dot(mid.sub(v(c))) > 0;
    const outer = out ? q : [...q].reverse();
    // innen: zur Mitte hin versetzt, umgekehrt gewunden
    const inner = [...outer].reverse().map((p) => p.map((x, i) => x + (c[i] - x) * inset));
    for (const [p0, p1, p2, p3] of [outer, inner]) pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Speichenrad (Achse x) mit Mitte (0, y, z): Reifen, Felge, Nabe, n Speichen. */
function spokeWheel(add, P, R, tire, y, z, n = 16) {
  const ri = R - 2 * tire;
  add(P.rubber, tireG(R, tire, 0, y, z, 1.15));
  add(P.steel, tireG(ri + 0.012, 0.008, 0, y, z, 1.4, 24, 4));
  add(P.steelD, xCylG(0.022, 0.1, 0, y, z, 10));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    add(P.steel, rodG([i % 2 ? 0.035 : -0.035, y, z], [0, y + Math.sin(a) * ri, z + Math.cos(a) * ri], 0.0025, 3));
  }
}

/** Gussrad (Motorrad, Roller): breiter Reifen, Felgenring, Nabe, fünf Speichen, optional Bremsscheibe. */
function castWheel(add, P, R, r, k, y, z, rim, disc = false) {
  const ri = R - 2 * r;
  add(P.rubber, tireG(R, r, 0, y, z, k, 24, 8));
  add(rim, tireG(ri + 0.014, 0.014, 0, y, z, (r * k) / 0.016, 24, 4));
  add(rim, xCylG(0.045, r * k * 1.6, 0, y, z, 12));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    add(rim, rodG([0, y + Math.sin(a) * 0.04, z + Math.cos(a) * 0.04], [0, y + Math.sin(a) * ri, z + Math.cos(a) * ri], 0.012, 4));
  }
  if (disc) add(P.steel, xCylG(ri * 0.8, 0.008, r * k * 0.75, y, z, 20));
}

/** Rad mit Vollreifen (Mäher, Wagen): Reifen als Walze, Nabenkappe; Achse x. */
function plainWheel(add, P, R, wd, x, y, z, hub) {
  add(P.rubber, xCylG(R, wd, x, y, z, 18));
  add(hub, xCylG(R * 0.58, wd + 0.012, x, y, z, 14));
}

/**
 * Fahrrad in Nennmaßen 0.55 × 1.75 × 1.05 (Länge z, vorn +z): Speichenräder, Rahmen (Diamant bzw. beim E-Bike
 * Tiefeinsteiger mit Akku), Gabel, Lenker, Sattel, Tretlager mit Kurbeln und Kette, Schutzbleche, Licht, Ständer.
 */
function bicycle(add, P, M, frame, e = false) {
  const R = 0.35;
  const tire = e ? 0.03 : 0.021;
  const zr = -0.525;
  const zf = 0.525;
  spokeWheel(add, P, R, tire, R, zr);
  spokeWheel(add, P, R, tire, R, zf);
  const tube = (a, b, r = 0.017) => add(frame, rodG(a, b, r, 8));
  const BB = [0, 0.3, -0.06];
  const ST = [0, 0.84, -0.24];
  const HB = [0, 0.72, 0.4];
  tube([0, 0.65, 0.418], [0, 0.9, 0.355], 0.024); // Steuerrohr
  tube(BB, ST, 0.019);
  if (e) {
    const L = [0, 0.4, 0.1];
    tube(HB, L, 0.028);
    tube(L, BB, 0.028);
    // Akku auf dem Unterrohr, Mittelmotor am Tretlager
    add(P.black, beamG([0, 0.66 + 0.05, 0.34 - 0.05], [0, 0.44 + 0.05, 0.12 - 0.05], 0.075, 0.07));
    add(P.steelD, xCylG(0.075, 0.15, 0, 0.3, -0.06, 16));
  } else {
    tube(HB, BB, 0.02);
    tube([0, 0.82, -0.235], [0, 0.87, 0.36], 0.017);
  }
  for (const s of [-1, 1]) {
    tube([s * 0.02, 0.3, -0.07], [s * 0.05, R, zr], 0.011); // Kettenstreben
    tube([s * 0.015, 0.8, -0.23], [s * 0.05, R, zr], 0.01); // Sitzstreben
    add(P.steel, rodG([s * 0.04, 0.655, 0.42], [s * 0.045, R, zf], 0.012, 6)); // Gabel
  }
  add(P.steel, rodG([-0.05, 0.655, 0.42], [0.05, 0.655, 0.42], 0.014, 6)); // Gabelkrone
  // Sattelstütze und Sattel
  add(P.steel, rodG(ST, [0, 0.94, -0.272], 0.012, 6));
  add(P.black, ballG(0.1, 0, 0.955, -0.3, [0.8, 0.24, 0.95], 10), ballG(0.07, 0, 0.958, -0.2, [0.5, 0.22, 1.3], 8));
  // Vorbau, Lenker, Griffe, Bremshebel
  add(P.steel, rodG([0, 0.9, 0.355], [0, 1.0, 0.335], 0.014, 6), rodG([-0.2, 1.0, 0.335], [0.2, 1.0, 0.335], 0.012, 6));
  for (const s of [-1, 1]) {
    add(P.steel, rodG([s * 0.2, 1.0, 0.335], [s * 0.235, 1.0, 0.29], 0.012, 6), rodG([s * 0.17, 1.0, 0.345], [s * 0.235, 0.985, 0.37], 0.005, 4));
    add(P.black, rodG([s * 0.235, 1.0, 0.29], [s * 0.272, 1.0, 0.272], 0.017, 8));
  }
  // Tretlager, Kurbeln, Pedale, Kettenblatt, Kette
  const cx = e ? 0.1 : 0.075;
  add(P.steelD, xCylG(0.022, 2 * cx, 0, 0.3, -0.06, 10));
  add(P.steel, rodG([cx, 0.3, -0.06], [cx, 0.215, 0.087], 0.011, 5), rodG([-cx, 0.3, -0.06], [-cx, 0.385, -0.207], 0.011, 5));
  add(P.black, boxG(0.09, 0.022, 0.065, cx + 0.045, 0.204, 0.087), boxG(0.09, 0.022, 0.065, -cx - 0.045, 0.374, -0.207));
  add(P.steelD, xCylG(0.1, 0.006, cx - 0.018, 0.3, -0.06, 22), xCylG(0.042, 0.012, 0.062, R, zr, 12));
  add(P.black, rodG([0.06, 0.4, -0.06], [0.06, R + 0.042, zr], 0.005, 4), rodG([0.06, 0.2, -0.06], [0.06, R - 0.042, zr], 0.005, 4));
  // Schutzbleche, Licht vorn und hinten, Ständer
  add(e ? P.black : P.steelD, arcG(R + 0.025, 0, R, zr, 0.18, 2.05, e ? 0.075 : 0.055), arcG(R + 0.025, 0, R, zf, 1.05, 2.95, e ? 0.075 : 0.055));
  add(P.black, zCylG(0.028, 0.05, 0, 0.69, 0.47, 10));
  add(tint(M, 0xfff3c4, { roughness: 0.3 }), zCylG(0.023, 0.006, 0, 0.69, 0.497, 10));
  add(P.red, boxG(0.045, 0.03, 0.02, 0, 0.44, -0.885));
  add(P.steelD, rodG([0.05, 0.3, -0.16], [0.15, 0.005, -0.32], 0.01, 5));
  if (e) {
    // Gepäckträger mit Rücklicht, Anzeige am Lenker
    for (const s of [-1, 1]) {
      add(P.black, rodG([s * 0.075, 0.8, -0.26], [s * 0.075, 0.8, -0.79], 0.008, 5), rodG([s * 0.075, 0.8, -0.76], [s * 0.055, R, zr], 0.007, 5));
      add(P.black, rodG([s * 0.075, 0.8, -0.26], [s * 0.02, 0.8, -0.236], 0.007, 5));
    }
    for (const z of [-0.38, -0.52, -0.66, -0.79]) add(P.black, rodG([-0.075, 0.8, z], [0.075, 0.8, z], 0.007, 4));
    add(P.red, boxG(0.08, 0.03, 0.02, 0, 0.775, -0.805));
    add(P.black, boxG(0.075, 0.035, 0.045, 0, 0.995, 0.37));
  }
}

/** Baut ein Fahrzeug oder Gartengerät dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildVehicle(type, w, d, h, M, g, bulbs, item = {}) {
  const P = palette(M);
  const lamp = tint(M, 0xfff3c4, { roughness: 0.3 });
  switch (type) {
    // Fahrrad: Diamantrahmen, Speichenräder, Lenker, Sattel, Pedale, Schutzbleche, Ständer
    case "garden_bike": {
      const add = parts(nominal(g, w, d, h, 0.55, 1.75, 1.05));
      bicycle(add, P, M, own(M, item, P.blue));
      add.done();
      return true;
    }
    // E-Bike: Tiefeinsteiger, Akku am Unterrohr, Mittelmotor, Gepäckträger, breitere Reifen
    case "garden_ebike": {
      const add = parts(nominal(g, w, d, h, 0.55, 1.75, 1.05));
      bicycle(add, P, M, own(M, item, M.white), true);
      add.done();
      return true;
    }
    // Lastenrad (zweirädrig, lang): Hinterrad, kleines Vorderrad ganz vorn, Holzkiste mit Sitzbank vor dem Lenker,
    // Lenkstange unter der Kiste, Mittelständer
    case "garden_cargo_bike": {
      const add = parts(nominal(g, w, d, h, 0.85, 2.5, 1.05));
      const fr = P.steelD;
      const tube = (a, b, r = 0.019) => add(fr, rodG(a, b, r, 8));
      const zr = -0.91;
      const zf = 0.995;
      spokeWheel(add, P, 0.34, 0.022, 0.34, zr);
      spokeWheel(add, P, 0.255, 0.022, 0.255, zf, 12);
      const BB = [0, 0.29, -0.47];
      tube(BB, [0, 0.84, -0.64]); // Sitzrohr
      tube([0, 0.82, -0.635], [0, 0.88, -0.11]); // Oberrohr
      tube([0, 0.62, -0.06], [0, 0.93, -0.12], 0.024); // Steuerrohr
      tube([0, 0.66, -0.07], BB, 0.022); // Unterrohr
      tube([0, 0.64, -0.065], [0, 0.29, 0.02], 0.024);
      for (const s of [-1, 1]) {
        tube([s * 0.02, 0.29, -0.48], [s * 0.05, 0.34, zr], 0.011);
        tube([s * 0.015, 0.8, -0.63], [s * 0.05, 0.34, zr], 0.01);
        tube([s * 0.12, 0.29, 0.0], [s * 0.12, 0.29, 0.74], 0.016); // Träger unter der Kiste
        add(P.steel, rodG([s * 0.04, 0.5, 0.94], [s * 0.045, 0.255, zf], 0.012, 6)); // Gabel
        // Mittelständer
        add(P.steel, rodG([s * 0.12, 0.29, 0.5], [s * 0.3, 0.01, 0.56], 0.011, 5));
      }
      tube([0, 0.29, 0.02], [0, 0.29, 0.74], 0.02);
      tube([-0.12, 0.29, 0.0], [0.12, 0.29, 0.0], 0.016);
      tube([-0.12, 0.29, 0.74], [0.12, 0.29, 0.74], 0.016);
      tube([0, 0.29, 0.73], [0, 0.62, 0.8], 0.022); // über das Vorderrad zum Steuerrohr
      tube([0, 0.62, 0.8], [0, 0.58, 0.92], 0.022);
      tube([0, 0.47, 0.945], [0, 0.64, 0.905], 0.024); // vorderes Steuerrohr
      add(P.steel, rodG([-0.05, 0.5, 0.94], [0.05, 0.5, 0.94], 0.014, 6), rodG([-0.3, 0.012, 0.56], [0.3, 0.012, 0.56], 0.012, 5));
      add(P.steel, rodG([0.07, 0.24, -0.04], [0.07, 0.24, 0.8], 0.007, 5), rodG([0.07, 0.24, 0.8], [0.06, 0.42, 0.955], 0.007, 5)); // Lenkstange
      // Holzkiste mit Bank und Kissen
      const bw = 0.72;
      const bl = 0.7;
      const box = own(M, item, M.wood);
      add(box, boxG(bw, 0.018, bl, 0, 0.31, bl / 2 + 0.01), boxG(bw, 0.36, 0.018, 0, 0.31, 0.019), boxG(bw, 0.42, 0.018, 0, 0.31, bl + 0.001));
      for (const s of [-1, 1]) add(box, boxG(0.018, 0.42, bl, s * (bw / 2 - 0.009), 0.31, bl / 2 + 0.01));
      add(P.woodD, boxG(bw + 0.01, 0.02, 0.03, 0, 0.72, bl + 0.001), boxG(0.03, 0.02, bl, -bw / 2, 0.72, bl / 2 + 0.01), boxG(0.03, 0.02, bl, bw / 2, 0.72, bl / 2 + 0.01));
      add(P.woodL, boxG(bw - 0.04, 0.022, 0.2, 0, 0.5, 0.13));
      add(M.fabric, boxG(bw - 0.08, 0.045, 0.18, 0, 0.522, 0.13));
      // Sattel, Lenker, Antrieb, Schutzbleche, Licht
      add(P.steel, rodG([0, 0.84, -0.64], [0, 0.94, -0.672], 0.012, 6));
      add(P.black, ballG(0.1, 0, 0.955, -0.7, [0.8, 0.24, 0.95], 10), ballG(0.07, 0, 0.958, -0.6, [0.5, 0.22, 1.3], 8));
      add(P.steel, rodG([0, 0.93, -0.12], [0, 1.02, -0.15], 0.014, 6), rodG([-0.26, 1.02, -0.15], [0.26, 1.02, -0.15], 0.012, 6));
      for (const s of [-1, 1]) add(P.black, rodG([s * 0.26, 1.02, -0.15], [s * 0.33, 1.02, -0.19], 0.017, 8));
      add(P.steelD, xCylG(0.022, 0.15, 0, 0.29, -0.47, 10), xCylG(0.1, 0.006, 0.058, 0.29, -0.47, 22), xCylG(0.042, 0.012, 0.062, 0.34, zr, 12));
      add(P.steel, rodG([0.075, 0.29, -0.47], [0.075, 0.205, -0.323], 0.011, 5), rodG([-0.075, 0.29, -0.47], [-0.075, 0.375, -0.617], 0.011, 5));
      add(P.black, boxG(0.09, 0.022, 0.065, 0.12, 0.194, -0.323), boxG(0.09, 0.022, 0.065, -0.12, 0.364, -0.617));
      add(P.black, rodG([0.06, 0.39, -0.47], [0.06, 0.382, zr], 0.005, 4), rodG([0.06, 0.19, -0.47], [0.06, 0.298, zr], 0.005, 4));
      add(P.black, arcG(0.365, 0, 0.34, zr, 0.18, 2.05, 0.06), arcG(0.28, 0, 0.255, zf, 1.0, 2.9, 0.06));
      add(P.black, zCylG(0.03, 0.05, 0, 0.6, bl + 0.035, 10));
      add(lamp, zCylG(0.025, 0.006, 0, 0.6, bl + 0.062, 10));
      add(P.red, boxG(0.045, 0.03, 0.02, 0, 0.43, -1.25 + 0.03));
      add.done();
      return true;
    }
    // Motorrad: breite Gussräder (vorn mit Bremsscheibe), Rahmen, Motorblock mit Rippen, Tank, Sitzbank, Heck mit
    // Rücklicht, Auspuff rechts, Telegabel, Lenker mit Spiegeln, runder Scheinwerfer vorn, Fußrasten, Seitenständer
    case "garden_motorbike": {
      const add = parts(nominal(g, w, d, h, 0.8, 2.1, 1.2));
      const paint = own(M, item, P.red);
      const zr = -0.73;
      const zf = 0.73;
      castWheel(add, P, 0.32, 0.065, 1.25, 0.32, zr, P.steelD);
      castWheel(add, P, 0.32, 0.06, 1.15, 0.32, zf, P.steelD, true);
      // Rahmen und Schwinge
      const fr = (a, b, r = 0.022) => add(P.steelD, rodG(a, b, r, 8));
      fr([0, 0.95, 0.52], [0, 0.84, -0.3], 0.026);
      fr([0, 0.92, 0.5], [0, 0.32, 0.22], 0.024);
      fr([0, 0.84, -0.3], [0, 0.3, -0.22]);
      fr([0, 0.84, -0.3], [0, 0.82, -0.8], 0.016);
      for (const s of [-1, 1]) fr([s * 0.1, 0.38, -0.22], [s * 0.1, 0.32, zr], 0.022);
      add(P.steel, xCylG(0.02, 0.24, 0, 0.32, zr, 8), xCylG(0.02, 0.24, 0, 0.32, zf, 8));
      // Motor: Kurbelgehäuse, Zylinder mit Kühlrippen
      add(P.steelD, boxG(0.3, 0.3, 0.44, 0, 0.22, -0.02));
      add(P.steel, boxG(0.34, 0.1, 0.2, 0, 0.3, 0.02), boxG(0.2, 0.2, 0.2, 0, 0.52, 0.08, [0.25, 0, 0]));
      for (let i = 0; i < 5; i++) add(P.steelD, boxG(0.26, 0.012, 0.25, 0, 0.55 + i * 0.038, 0.08 + i * 0.01, [0.25, 0, 0]));
      // Tank, Sitzbank, Seitendeckel, Heck, Rücklicht
      add(paint, ballG(0.2, 0, 0.88, 0.2, [0.8, 0.55, 1.35], 14), boxG(0.26, 0.2, 0.36, 0, 0.6, -0.3), boxG(0.2, 0.08, 0.36, 0, 0.8, -0.8));
      add(P.black, boxG(0.28, 0.08, 0.56, 0, 0.8, -0.34), ballG(0.14, 0, 0.88, -0.1, [1, 0.35, 0.8], 10));
      add(P.red, boxG(0.12, 0.04, 0.02, 0, 0.82, -0.985));
      // Auspuff rechts: Krümmer und Topf
      add(P.steel, rodG([0.1, 0.55, 0.15], [0.16, 0.25, 0.12], 0.025, 8), rodG([0.16, 0.25, 0.12], [0.2, 0.3, -0.25], 0.025, 8));
      add(P.steel, rodG([0.2, 0.3, -0.25], [0.22, 0.45, -0.85], 0.055, 12));
      // Telegabel, Gabelbrücke, Lenker, Griffe, Spiegel
      for (const s of [-1, 1]) {
        add(P.steel, rodG([s * 0.1, 0.32, zf], [s * 0.1, 1.0, 0.53], 0.024, 8));
        add(P.black, rodG([s * 0.28, 1.07, 0.45], [s * 0.37, 1.07, 0.43], 0.02, 8));
        add(P.steel, rodG([s * 0.24, 1.07, 0.46], [s * 0.3, 1.18, 0.44], 0.007, 5));
        add(P.black, ballG(0.045, s * 0.31, 1.2, 0.44, [1.3, 0.8, 0.35], 8));
        add(P.black, boxG(0.05, 0.02, 0.1, s * 0.2, 0.33, -0.15)); // Fußrasten
      }
      add(P.steelD, boxG(0.26, 0.04, 0.12, 0, 0.98, 0.52));
      add(P.steel, rodG([-0.28, 1.07, 0.45], [0.28, 1.07, 0.45], 0.013, 6), rodG([0, 1.0, 0.52], [0, 1.07, 0.47], 0.016, 6));
      // Scheinwerfer, Schutzblech vorn, Seitenständer
      add(P.steel, zCylG(0.09, 0.1, 0, 0.9, 0.66, 16));
      add(lamp, zCylG(0.078, 0.01, 0, 0.9, 0.712, 16));
      add(paint, arcG(0.35, 0, 0.32, zf, 1.0, 2.6, 0.13, 0.008));
      add(P.steelD, rodG([-0.12, 0.3, -0.1], [-0.3, 0.005, -0.04], 0.012, 5));
      add.done();
      return true;
    }
    // Motorroller: kleine breite Räder, gerundete Heckverkleidung, Trittbrett mit Matte, Beinschild, Lenkerverkleidung
    // mit Scheinwerfer, Sitzbank, Motorschwinge links, Spiegel
    case "garden_scooter": {
      const add = parts(nominal(g, w, d, h, 0.7, 1.8, 1.15));
      const body = own(M, item, M.white);
      const zr = -0.6;
      const zf = 0.69;
      castWheel(add, P, 0.21, 0.06, 1.3, 0.21, zr, P.steel);
      castWheel(add, P, 0.21, 0.06, 1.3, 0.21, zf, P.steel, true);
      add(P.steelD, boxG(0.1, 0.17, 0.48, -0.13, 0.13, -0.42), boxG(0.22, 0.2, 0.2, 0, 0.18, -0.25)); // Motor, Schwinge
      add(body, ballG(0.3, 0, 0.5, -0.5, [0.66, 0.78, 1.36], 18)); // Heck
      add(body, boxG(0.36, 0.08, 0.66, 0, 0.22, 0.12), boxG(0.42, 0.16, 0.3, 0, 0.3, -0.2)); // Trittbrett, Übergang
      add(P.black, boxG(0.32, 0.01, 0.5, 0, 0.3, 0.15), boxG(0.3, 0.07, 0.62, 0, 0.71, -0.45)); // Matte, Sitzbank
      add(P.black, ballG(0.16, 0, 0.78, -0.45, [0.95, 0.35, 2.0], 12));
      add(body, boxG(0.46, 0.66, 0.06, 0, 0.28, 0.47, [-0.18, 0, 0]), ballG(0.2, 0, 0.68, 0.55, [1.1, 1.25, 0.5], 12)); // Beinschild
      add(body, arcG(0.26, 0, 0.21, zf, 1.0, 2.7, 0.18, 0.01)); // Schutzblech vorn
      for (const s of [-1, 1]) add(P.steel, rodG([s * 0.06, 0.21, zf], [s * 0.05, 0.75, 0.55], 0.02, 8));
      add(P.steelD, rodG([0, 0.7, 0.55], [0, 0.98, 0.47], 0.03, 8));
      add(body, boxG(0.3, 0.12, 0.2, 0, 0.94, 0.45));
      add(lamp, zCylG(0.06, 0.02, 0, 1.0, 0.55, 14));
      add(P.steel, rodG([-0.26, 1.03, 0.42], [0.26, 1.03, 0.42], 0.013, 6));
      for (const s of [-1, 1]) {
        add(P.black, rodG([s * 0.24, 1.03, 0.42], [s * 0.33, 1.03, 0.41], 0.019, 8));
        add(P.steel, rodG([s * 0.17, 1.05, 0.43], [s * 0.24, 1.13, 0.43], 0.007, 5));
        add(P.black, ballG(0.04, s * 0.25, 1.14, 0.43, [1.3, 0.8, 0.35], 8));
      }
      add(P.red, boxG(0.12, 0.05, 0.02, 0, 0.6, -0.9));
      add(P.steelD, rodG([-0.12, 0.2, -0.15], [-0.28, 0.005, -0.1], 0.012, 5));
      add.done();
      return true;
    }
    // Rasenmäher: Mähwerk-Haube mit Motor vorn, vier Räder (hinten größer), Fangkorb hinten (−z), Schiebebügel
    case "garden_mower": {
      const add = parts(nominal(g, w, d, h, 0.55, 1.3, 1.0));
      const deck = own(M, item, M.green);
      add(deck, boxG(0.5, 0.14, 0.62, 0, 0.06, 0.3), boxG(0.44, 0.05, 0.54, 0, 0.2, 0.3)); // Haube
      add(P.black, boxG(0.52, 0.03, 0.64, 0, 0.05, 0.3), cylG(0.12, 0.16, 0, 0.25, 0.32, 18)); // Rand, Motor
      add(deck, cylG(0.135, 0.07, 0, 0.4, 0.32, 18, 0.1)); // Motorhaube
      add(P.yellow, cylG(0.022, 0.025, 0.04, 0.465, 0.36, 10));
      plainWheel(add, P, 0.11, 0.05, -0.27, 0.11, 0.06, P.plastic);
      plainWheel(add, P, 0.11, 0.05, 0.27, 0.11, 0.06, P.plastic);
      plainWheel(add, P, 0.085, 0.045, -0.265, 0.085, 0.5, P.plastic);
      plainWheel(add, P, 0.085, 0.045, 0.265, 0.085, 0.5, P.plastic);
      // Fangkorb: Stoffkorb mit Kunststoffdeckel und Griff
      add(P.clothG, boxG(0.4, 0.32, 0.44, 0, 0.1, -0.22));
      add(P.black, boxG(0.44, 0.05, 0.47, 0, 0.42, -0.22), rodG([-0.1, 0.5, -0.2], [0.1, 0.5, -0.2], 0.012, 6));
      add(P.black, rodG([-0.1, 0.47, -0.2], [-0.1, 0.5, -0.2], 0.012, 5), rodG([0.1, 0.47, -0.2], [0.1, 0.5, -0.2], 0.012, 5));
      // Schiebebügel mit Griff und Schaltbügel
      for (const s of [-1, 1]) {
        add(P.steelD, rodG([s * 0.235, 0.24, 0.0], [s * 0.235, 0.97, -0.6], 0.013, 8));
      }
      add(P.steelD, rodG([-0.235, 0.6, -0.3], [0.235, 0.6, -0.3], 0.011, 6));
      add(P.black, rodG([-0.25, 0.97, -0.6], [0.25, 0.97, -0.6], 0.02, 10));
      add(P.steel, rodG([-0.2, 0.93, -0.55], [0.2, 0.93, -0.55], 0.007, 5));
      add.done();
      return true;
    }
    // Mähroboter mit Ladestation: Roboter (links, fährt nach +x) mit flacher Haube, zwei großen Rädern, Stütz-
    // rad und Stopp-Taste; Ladestation (rechts) aus Bodenplatte mit Rampe, Ladesäule mit Kontakten und kleinem Dach
    case "garden_robot_mower": {
      const add = parts(nominal(g, w, d, h, 1.2, 0.5, 0.3));
      const hood = own(M, item, tint(M, 0x7d8a92, { roughness: 0.5 }));
      const rx = -0.32;
      add(P.black, boxG(0.5, 0.07, 0.38, rx, 0.035, 0));
      add(hood, at(new THREE.SphereGeometry(0.25, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), [rx, 0.1, 0], [0, 0, 0], [1.1, 0.48, 0.86]));
      add(P.red, cylG(0.032, 0.03, rx - 0.04, 0.205, 0, 14));
      add(P.black, boxG(0.12, 0.012, 0.09, rx + 0.08, 0.198, 0));
      for (const s of [-1, 1]) {
        add(P.rubber, zCylG(0.105, 0.05, rx - 0.15, 0.105, s * 0.2, 18));
        add(P.steelD, zCylG(0.055, 0.056, rx - 0.15, 0.105, s * 0.2, 12));
      }
      add(P.rubber, zCylG(0.035, 0.03, rx + 0.2, 0.035, 0, 10));
      // Ladestation
      const sx = 0.33;
      add(P.black, boxG(0.5, 0.025, 0.46, sx, 0, 0), boxG(0.1, 0.012, 0.42, sx - 0.28, 0, 0, [0, 0, 0.22]));
      add(P.black, boxG(0.1, 0.2, 0.22, sx + 0.2, 0.025, 0));
      add(P.steel, boxG(0.01, 0.025, 0.04, sx + 0.145, 0.07, -0.05), boxG(0.01, 0.025, 0.04, sx + 0.145, 0.07, 0.05));
      add(M.led, boxG(0.004, 0.012, 0.03, sx + 0.148, 0.18, 0));
      for (const px of [sx - 0.2, sx + 0.22]) for (const pz of [-0.2, 0.2]) add(P.steelD, rodG([px, 0.025, pz], [px, 0.23, pz], 0.008, 5));
      for (const s of [-1, 1]) add(hood, boxG(0.56, 0.015, 0.27, sx, 0.22 + 0.036, s * 0.125, [s * 0.3, 0, 0]));
      add.done();
      return true;
    }
    // Aufsitzmäher: Fahrgestell, große Hinterräder, kleine Vorderräder, Motorhaube mit Kühlergrill und Scheinwerfern,
    // Lenkrad, Sitz mit Lehne, Kotflügel, Trittbretter, Mähwerk mit Auswurf darunter
    case "garden_ride_mower": {
      const add = parts(nominal(g, w, d, h, 1.0, 1.8, 1.1));
      const paint = own(M, item, P.red);
      for (const s of [-1, 1]) {
        plainWheel(add, P, 0.27, 0.2, s * 0.38, 0.27, -0.5, P.steel);
        plainWheel(add, P, 0.17, 0.12, s * 0.36, 0.17, 0.6, P.steel);
        add(P.black, boxG(0.18, 0.025, 0.36, s * 0.28, 0.3, 0.02)); // Trittbretter
      }
      add(P.steelD, boxG(0.5, 0.1, 1.6, 0, 0.2, 0.0), xCylG(0.025, 0.86, 0, 0.27, -0.5, 8), xCylG(0.02, 0.84, 0, 0.17, 0.6, 8));
      // Mähwerk mit Auswurf rechts
      add(paint, boxG(0.92, 0.1, 0.56, 0, 0.06, 0.06), boxG(0.86, 0.04, 0.5, 0, 0.16, 0.06));
      add(P.black, boxG(0.12, 0.1, 0.22, 0.5, 0.07, 0.06, [0, 0, -0.35]));
      // Motorhaube, Grill, Scheinwerfer
      add(paint, boxG(0.56, 0.3, 0.62, 0, 0.32, 0.5), xCylG(0.15, 0.56, 0, 0.47, 0.81, 16), boxG(0.56, 0.15, 0.3, 0, 0.32, 0.78));
      add(P.black, boxG(0.4, 0.16, 0.02, 0, 0.36, 0.95));
      for (const s of [-1, 1]) add(lamp, zCylG(0.035, 0.02, s * 0.2, 0.55, 0.95, 12));
      // Armaturen, Lenksäule, Lenkrad
      add(paint, boxG(0.5, 0.28, 0.16, 0, 0.32, 0.12, [-0.25, 0, 0]));
      add(P.black, rodG([0, 0.6, 0.12], [0, 0.88, 0.0], 0.025, 8));
      add(P.black, at(new THREE.TorusGeometry(0.15, 0.018, 6, 22), [0, 0.9, -0.01], [1.15, 0, 0]));
      add(P.black, rodG([-0.14, 0.9, -0.01], [0.14, 0.9, -0.01], 0.01, 5));
      // Heck mit Kotflügeln, Sitz mit Lehne
      add(paint, boxG(0.96, 0.05, 0.62, 0, 0.55, -0.52), boxG(0.5, 0.25, 0.5, 0, 0.3, -0.45));
      for (const s of [-1, 1]) add(paint, boxG(0.22, 0.12, 0.6, s * 0.38, 0.45, -0.52));
      add(P.black, boxG(0.46, 0.1, 0.42, 0, 0.6, -0.42), boxG(0.46, 0.36, 0.08, 0, 0.66, -0.66, [-0.22, 0, 0]));
      add(P.steelD, boxG(0.16, 0.08, 0.1, 0, 0.3, -0.86));
      add.done();
      return true;
    }
    // Schubkarre: Metallwanne mit gerolltem Rand, ein Luftrad vorn (+z), Rohrrahmen zu den Holmen mit Griffen hinten,
    // zwei Standbeine mit Fußbügel
    case "garden_wheelbarrow": {
      const add = parts(nominal(g, w, d, h, 0.65, 1.55, 0.65));
      const pan = own(M, item, tint(M, 0x3f7f4a, { metalness: 0.3, roughness: 0.5 }));
      const B = [[-0.17, 0.33, -0.33], [0.17, 0.33, -0.33], [0.17, 0.33, 0.12], [-0.17, 0.33, 0.12]];
      const T = [[-0.31, 0.62, -0.47], [0.31, 0.62, -0.47], [0.31, 0.62, 0.46], [-0.31, 0.62, 0.46]];
      add(pan, trayG(B, T, 0.04));
      for (let i = 0; i < 4; i++) add(pan, rodG(T[i], T[(i + 1) % 4], 0.013, 6));
      // Rad mit Felge und Achse
      add(P.rubber, tireG(0.19, 0.06, 0, 0.19, 0.585, 1.15));
      add(P.red, xCylG(0.075, 0.085, 0, 0.19, 0.585, 14));
      add(P.steel, xCylG(0.014, 0.17, 0, 0.19, 0.585, 8));
      for (const s of [-1, 1]) {
        const tube = (a, b) => add(P.steelD, rodG(a, b, 0.017, 8));
        tube([s * 0.08, 0.19, 0.585], [s * 0.13, 0.31, 0.15]);
        tube([s * 0.13, 0.31, 0.15], [s * 0.15, 0.31, -0.33]);
        tube([s * 0.15, 0.31, -0.33], [s * 0.27, 0.47, -0.64]);
        tube([s * 0.145, 0.3, -0.22], [s * 0.21, 0.01, -0.3]); // Standbein
        add(P.black, rodG([s * 0.265, 0.465, -0.62], [s * 0.285, 0.49, -0.77], 0.022, 8)); // Griff
        add(P.steelD, rodG([s * 0.15, 0.31, 0.3], [s * 0.24, 0.47, 0.3], 0.01, 5)); // Strebe zur Wanne
      }
      add(P.steelD, rodG([-0.21, 0.02, -0.3], [0.21, 0.02, -0.3], 0.013, 6), rodG([-0.15, 0.31, -0.25], [0.15, 0.31, -0.25], 0.013, 6));
      add.done();
      return true;
    }
    default:
      return false;
  }
}
