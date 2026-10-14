// 3D-Modelle des Katalogs „Gartenmöbel“, zweiter Teil (Pavillon, Sonnensegel, Feuerschale, Außenküche, Gartenbar) und
// gemeinsame Bausteine für furniture-seating.js. Einheitsrahmen wie in furniture.js – Breite w entlang x, Tiefe d entlang z,
// Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.

import { THREE, at, boxG, cyl, cylG, merged, palette, ring, rodG, tint } from "./garden-parts.js";

/** Balken-Geometrie von a nach b, Querschnitt tx × tz (Latten, Holme, schräge Beine); ext verlängert beide Enden. */
export function barG(a, b, tx = 0.04, tz = tx, ext = 0) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va).normalize();
  const len = Math.max(va.distanceTo(vb) + 2 * ext, 0.004);
  const geo = new THREE.BoxGeometry(tx, len, tz);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  geo.translate(...va.add(vb).multiplyScalar(0.5).toArray());
  return geo;
}

/** Zug aus Balken entlang eines Polygonzugs pts [[x, y, z], …] (Bögen, gebogene Holme). */
export const polyBarG = (pts, tx, tz) => pts.slice(1).map((p, i) => barG(pts[i], p, tx, tz, Math.min(tx, tz) * 0.3));

/** Zylinder-Geometrie entlang x (Querholz, Rohr) mit Mitte (x, y, z). */
export const cylX = (r, len, x = 0, y = 0, z = 0, seg = 10) => at(new THREE.CylinderGeometry(r, r, len, seg), [x, y, z], [0, 0, Math.PI / 2]);
/** Zylinder-Geometrie entlang z (Knopf, Scheibe nach vorn) mit Mitte (x, y, z). */
export const cylZ = (r, len, x = 0, y = 0, z = 0, seg = 10) => at(new THREE.CylinderGeometry(r, r, len, seg), [x, y, z], [Math.PI / 2, 0, 0]);
/** Geneigtes Brett (Lehnenlatte): Quader mit Mitte (x, y, z), um die x-Achse um tilt gekippt. */
export const tiltG = (w, h, d, x, y, z, tilt) => at(new THREE.BoxGeometry(w, h, d), [x, y, z], [tilt, 0, 0]);

/**
 * Dünne Platte aus Punkten pts (Vector3) und Dreiecken tris [[a, b, c], …]: Ober- und Unterseite im Abstand t
 * (Stoff, Segel, Haube – von beiden Seiten sichtbar, ohne doppelseitiges Material).
 */
export function shellG(pts, tris, t = 0.01) {
  const n = pts.map(() => new THREE.Vector3());
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const [a, b, c] of tris) {
    e1.subVectors(pts[b], pts[a]);
    e2.subVectors(pts[c], pts[a]);
    const f = e1.clone().cross(e2);
    n[a].add(f);
    n[b].add(f);
    n[c].add(f);
  }
  const pos = [];
  for (const s of [0.5, -0.5]) pts.forEach((p, i) => pos.push(...p.clone().addScaledVector(n[i].clone().normalize(), s * t).toArray()));
  const k = pts.length;
  const idx = [];
  for (const [a, b, c] of tris) idx.push(a, b, c, k + a, k + c, k + b);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Platte aus einem Punktraster rows[i][j] = [x, y, z] (Bespannung, Hängematte, Dach). */
export function sheetG(rows, t = 0.01) {
  const nv = rows[0].length;
  const pts = rows.flat().map((p) => new THREE.Vector3(...p));
  const tris = [];
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j;
      const b = a + nv;
      tris.push([a, b, a + 1], [a + 1, b, b + 1]);
    }
  return shellG(pts, tris, t);
}

/** Dreieckige Platte: f(b1, b2, b3) liefert den Punkt zu baryzentrischen Koordinaten, n Unterteilungen je Kante. */
export function triSheetG(n, f, t = 0.01) {
  const pts = [];
  const tris = [];
  const id = (k, j) => (k * (k + 1)) / 2 + j;
  for (let k = 0; k <= n; k++) for (let j = 0; j <= k; j++) pts.push(new THREE.Vector3(...f(1 - k / n, (k - j) / n, j / n)));
  for (let k = 0; k < n; k++)
    for (let j = 0; j <= k; j++) {
      tris.push([id(k, j), id(k + 1, j), id(k + 1, j + 1)]);
      if (j < k) tris.push([id(k, j), id(k + 1, j + 1), id(k, j + 1)]);
    }
  return shellG(pts, tris, t);
}

/** Quadratische Bézierkurve in (y, z) mit n + 1 Punkten: [[y, z], …]. */
export function bezier(p0, p1, p2, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    const c = t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]);
  }
  return out;
}

/** Halbrunde Zacken (Volant) entlang einer Kante: Mitte der Kante (x, y, z), Länge len, entlang x (axis "x") oder z. */
export function scallopsG(len, x, y, z, axis = "x", r = 0.05) {
  const n = Math.max(2, Math.round(len / (2 * r)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = -len / 2 + ((i + 0.5) * len) / n;
    const geo = new THREE.CylinderGeometry(r, r, 0.01, 8, 1, false, -Math.PI / 2, Math.PI);
    geo.rotateX(Math.PI / 2);
    if (axis === "z") geo.rotateY(Math.PI / 2);
    geo.translate(axis === "x" ? x + s : x, y, axis === "x" ? z : z + s);
    out.push(geo);
  }
  return out;
}

// Flammen: eigene Leuchtmaterialien (nicht in bulbs, brennen unabhängig von einem Licht)
let FIRE = null;
function fire() {
  FIRE ??= {
    outer: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5200, emissiveIntensity: 1.4, roughness: 0.6, transparent: true, opacity: 0.9 }),
    core: new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 1.6, roughness: 0.6 }),
    ember: new THREE.MeshStandardMaterial({ color: 0x5a1a0a, emissive: 0xff3d00, emissiveIntensity: 0.9, roughness: 0.8 }),
  };
  return FIRE;
}

/** Zweiter Teil der Gartenmöbel; false, wenn der Typ nicht dazugehört. */
export function buildSeating2(type, w, d, h, M, g, bulbs, item = {}) {
  const P = palette(M);
  switch (type) {
    // Pavillon: vier Pfosten, umlaufender Rahmen mit Kopfbändern, Pyramidendach mit Lüftungshaube, Volant, Seitenvorhänge gerafft
    case "garden_pavilion": {
      const hw = w / 2;
      const hd = d / 2;
      const eave = h * 0.8;
      const px = hw - 0.06;
      const pz = hd - 0.06;
      const steel = [];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          steel.push(boxG(0.07, eave, 0.07, sx * px, 0, sz * pz), boxG(0.18, 0.012, 0.18, sx * px, 0, sz * pz));
          steel.push(rodG([sx * px, eave - 0.5, sz * pz], [sx * (px - 0.45), eave - 0.06, sz * pz], 0.014));
          steel.push(rodG([sx * px, eave - 0.5, sz * pz], [sx * px, eave - 0.06, sz * (pz - 0.45)], 0.014));
          // Dachgrat bis zur Lüftungshaube
          steel.push(rodG([sx * hw, eave + 0.02, sz * hd], [sx * 0.3, eave + h * 0.125 + 0.02, sz * 0.3], 0.014));
          steel.push(rodG([sx * 0.28, eave + h * 0.125, sz * 0.28], [sx * 0.28, eave + h * 0.14, sz * 0.28], 0.012));
        }
      for (const s of [-1, 1]) steel.push(boxG(2 * px + 0.07, 0.08, 0.05, 0, eave - 0.08, s * pz), boxG(0.05, 0.08, 2 * pz + 0.07, s * px, eave - 0.08, 0));
      merged(g, P.steelD, steel);
      // Dach (Pyramidenstumpf, 4 Ecken auf den Diagonalen), Haube, Volant mit Zacken
      const roofH = h * 0.125;
      const cloth = [
        at(new THREE.CylinderGeometry(0.3 * Math.SQRT2, (hw + 0.02) * Math.SQRT2, roofH, 4), [0, eave + roofH / 2, 0], [0, Math.PI / 4, 0]),
        at(new THREE.ConeGeometry(0.44 * Math.SQRT2, h - eave - roofH - 0.04, 4), [0, (h + eave + roofH + 0.04) / 2, 0], [0, Math.PI / 4, 0]),
      ];
      for (const s of [-1, 1]) {
        cloth.push(boxG(w + 0.04, 0.16, 0.012, 0, eave - 0.16, s * (hd + 0.02)), boxG(0.012, 0.16, d + 0.04, s * (hw + 0.02), eave - 0.16, 0));
        cloth.push(...scallopsG(w, 0, eave - 0.16, s * (hd + 0.02), "x", 0.06), ...scallopsG(d, s * (hw + 0.02), eave - 0.16, 0, "z", 0.06));
      }
      // Seitenvorhänge: an jeder Ecke zwei gerafft (oben weit, Mitte gebunden, unten ausgestellt)
      const ties = [];
      const yt = eave * 0.5;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          for (const [x, z, sc] of [
            [sx * (px - 0.2), sz * (pz + 0.03), [1, 1, 0.45]],
            [sx * (px + 0.03), sz * (pz - 0.2), [0.45, 1, 1]],
          ]) {
            cloth.push(at(new THREE.CylinderGeometry(0.15, 0.05, eave - 0.1 - yt, 10), [x, (eave - 0.1 + yt) / 2, z], [0, 0, 0], sc));
            cloth.push(at(new THREE.CylinderGeometry(0.05, 0.16, yt, 10), [x, yt / 2, z], [0, 0, 0], sc));
            ties.push(at(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 10), [x, yt, z], [0, 0, 0], sc));
          }
      merged(g, M.light, cloth);
      merged(g, P.cream, ties);
      return true;
    }
    // Sonnensegel: drei Pfosten unterschiedlicher Höhe (leicht nach außen geneigt), Dreiecksegel mit durchhängender Mitte und
    // eingezogenen Kanten, Spannseile mit Ringen
    case "garden_sunsail": {
      const tops = [
        [-0.48 * w, h, -0.42 * d],
        [0.48 * w, h * 0.83, -0.28 * d],
        [-0.09 * w, h * 0.72, 0.48 * d],
      ];
      const gx = tops.reduce((s, t) => s + t[0], 0) / 3;
      const gz = tops.reduce((s, t) => s + t[2], 0) / 3;
      const steel = [];
      const foot = [];
      const ropes = [];
      const corners = tops.map(([x, y, z]) => {
        const l = Math.hypot(gx - x, gz - z);
        const ux = (gx - x) / l;
        const uz = (gz - z) / l;
        const bx = x + ux * 0.22;
        const bz = z + uz * 0.22;
        steel.push(rodG([bx, 0, bz], [x, y - 0.04, z], 0.045, 10));
        steel.push(at(new THREE.SphereGeometry(0.055, 10, 6), [x, y - 0.04, z]));
        foot.push(cylG(0.13, 0.05, bx, 0, bz, 12));
        const c = [x + ux * 0.5, y - 0.2, z + uz * 0.5];
        ropes.push(rodG([x + ux * 0.04, y - 0.12, z + uz * 0.04], c, 0.007, 5));
        steel.push(at(new THREE.TorusGeometry(0.035, 0.008, 5, 10), c, [0, Math.atan2(ux, uz), 0]));
        return c;
      });
      merged(g, P.steel, steel);
      merged(g, P.gravel, foot);
      merged(g, P.steelD, ropes);
      // Segel: Dreieck mit Durchhang und nach innen gezogenen Kanten
      const C = corners.map((c) => new THREE.Vector3(...c));
      const G = C[0].clone().add(C[1]).add(C[2]).multiplyScalar(1 / 3);
      const sail = (b1, b2, b3) => {
        const p = C[0].clone().multiplyScalar(b1).addScaledVector(C[1], b2).addScaledVector(C[2], b3);
        p.lerp(G, 0.5 * (b1 * b2 + b2 * b3 + b3 * b1));
        p.y -= 0.3 * 27 * b1 * b2 * b3;
        return p.toArray();
      };
      const parts = [triSheetG(10, sail, 0.016)];
      // Saum entlang der Kanten
      for (const [i, j] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ]) {
        const pts = [];
        for (let k = 0; k <= 10; k++) {
          const b = [0, 0, 0];
          b[i] = 1 - k / 10;
          b[j] = k / 10;
          pts.push(sail(...b));
        }
        parts.push(...pts.slice(1).map((p, k) => rodG(pts[k], p, 0.014, 6)));
      }
      merged(g, M.light, parts);
      return true;
    }
    // Feuerschale: Stahlschale auf Dreibein mit Fußring, Asche, kreuzweise Holzscheite, Flammen (leuchten selbst, ohne Licht)
    case "garden_firebowl": {
      const R = Math.min(w, d) / 2 - 0.015;
      const rimY = h * 0.75;
      const depth = h * 0.42;
      const bowlY = (r) => rimY - depth * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), tint(M, 0x6e4330, { roughness: 0.85, metalness: 0.25, side: THREE.DoubleSide }));
      bowl.scale.y = depth / R;
      bowl.position.y = rimY;
      g.add(bowl);
      const stand = [at(new THREE.TorusGeometry(R, 0.013, 6, 36), [0, rimY, 0], [Math.PI / 2, 0, 0]), at(new THREE.TorusGeometry(R * 0.8, 0.012, 6, 30), [0, 0.014, 0], [Math.PI / 2, 0, 0])];
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        stand.push(rodG([c * R * 0.8, 0.014, s * R * 0.8], [c * R * 0.55, bowlY(R * 0.55) + 0.01, s * R * 0.55], 0.014, 6));
      }
      merged(g, P.black, stand);
      // Asche und Glut
      const ashY = rimY - depth * 0.72;
      cyl(g, tint(M, 0x3b3735, { roughness: 1 }), R * Math.sqrt(1 - 0.72 ** 2) - 0.01, 0.012, 0, ashY, 0, 20);
      const lr = 0.032;
      const ll = R * 1.05;
      const logs = [];
      for (const s of [-1, 1]) {
        logs.push(at(new THREE.CylinderGeometry(lr, lr, ll, 8), [0, ashY + lr + 0.01, s * 0.075], [0.05 * s, 0, Math.PI / 2]));
        logs.push(at(new THREE.CylinderGeometry(lr, lr, ll * 0.9, 8), [s * 0.075, ashY + 3 * lr + 0.01, 0], [Math.PI / 2, 0.06 * s, 0]));
      }
      merged(g, P.woodD, logs);
      const F = fire();
      const yF = ashY + 3 * lr;
      merged(g, F.ember, [boxG(0.05, 0.02, 0.04, -0.03, ashY + 0.01, 0.02, [0, 0.4, 0]), boxG(0.04, 0.02, 0.05, 0.04, ashY + 0.01, -0.03, [0, 0.9, 0]), boxG(0.05, 0.02, 0.03, 0.01, ashY + 0.01, 0.11, [0, 0.2, 0])]);
      merged(g, F.outer, [
        cylG(0.1, h - 0.02 - yF, 0, yF, 0, 9, 0),
        cylG(0.06, (h - yF) * 0.6, 0.085, yF - 0.01, 0.03, 8, 0, [0.1, 0, -0.3]),
        cylG(0.06, (h - yF) * 0.55, -0.08, yF - 0.01, -0.02, 8, 0, [-0.1, 0, 0.32]),
        cylG(0.05, (h - yF) * 0.5, 0, yF - 0.01, -0.09, 8, 0, [-0.35, 0, 0]),
        cylG(0.05, (h - yF) * 0.45, 0.01, yF - 0.01, 0.1, 8, 0, [0.35, 0, 0]),
      ]);
      merged(g, F.core, [cylG(0.055, (h - yF) * 0.6, 0, yF, 0, 8, 0)]);
      return true;
    }
    // Außenküche: Sockel, Unterschränke (offenes Regal, Grill-Fronten mit Bedienleiste, Spülenschrank), Steinplatte,
    // Grill mit gewölbter Haube und Griff, Spüle mit Bogenarmatur, Schneidbrett und Kräutertopf als Ablage
    case "garden_outdoor_kitchen": {
      const hw = w / 2;
      const hd = d / 2;
      const top = h * 0.82; // Oberkante Arbeitsplatte (0.9)
      const ct = 0.04;
      const zf = hd - 0.08; // Korpusfront
      const xA = -hw + 0.58; // Grenze offenes Regal | Grill
      const xC = hw - 0.82; // Grenze Grill | Spüle
      const yb = 0.08;
      merged(g, P.black, [boxG(w - 0.04, yb, d - 0.16, 0, 0, -0.03)]);
      // Korpus: Grill- und Spülenteil massiv, links offenes Regal aus Seiten, Böden und Rückwand
      const body = [boxG(hw - xA, top - ct - yb, zf + hd, (hw + xA) / 2, yb, (zf - hd) / 2)];
      body.push(boxG(0.03, top - ct - yb, zf + hd, -hw + 0.015, yb, (zf - hd) / 2));
      body.push(boxG(xA + hw, 0.03, zf + hd, (xA - hw) / 2, yb, (zf - hd) / 2));
      body.push(boxG(xA + hw, 0.025, zf + hd - 0.02, (xA - hw) / 2, (top + yb) / 2 - 0.02, (zf - hd) / 2 - 0.01));
      body.push(boxG(xA + hw, top - ct - yb, 0.02, (xA - hw) / 2, yb, -hd + 0.01));
      merged(g, M.dark, body);
      // Fronten: Grill (Edelstahl, Bedienleiste mit Knöpfen), Spülenschrank (Holz)
      const fz = zf + 0.01;
      const fy = top - ct - 0.005;
      const ss = [boxG(xC - xA - 0.02, 0.11, 0.02, (xA + xC) / 2, fy - 0.11, fz)];
      const half = (xC - xA - 0.03) / 2;
      for (const s of [0, 1]) ss.push(boxG(half - 0.005, fy - 0.13 - yb - 0.01, 0.02, xA + 0.01 + half / 2 + s * (half + 0.01), yb + 0.01, fz));
      const knobs = [];
      for (let i = 0; i < 4; i++) knobs.push(cylZ(0.022, 0.035, xA + 0.14 + (i * (xC - xA - 0.28)) / 3, fy - 0.055, fz + 0.025, 12));
      const wood = [];
      const hs = (hw - xC - 0.03) / 2;
      for (const s of [0, 1]) wood.push(boxG(hs - 0.005, fy - yb - 0.01, 0.02, xC + 0.01 + hs / 2 + s * (hs + 0.01), yb + 0.01, fz));
      const handles = [];
      for (const s of [-1, 1]) {
        handles.push(boxG(0.012, 0.16, 0.018, (xA + xC) / 2 + s * 0.04, fy - 0.36, fz + 0.018));
        handles.push(boxG(0.14, 0.012, 0.018, xC + 0.01 + hs / 2 + (s > 0 ? hs + 0.01 : 0), fy - 0.1, fz + 0.018));
      }
      // Arbeitsplatte (Stein)
      merged(g, tint(M, 0x8a857c, { roughness: 0.6 }), [boxG(w + 0.02, ct, d, 0, top - ct, 0)]);
      // Grill: Wanne, Haube (halber Zylinder, flach gedrückt), Griff, Thermometer
      const gx = (xA + xC) / 2;
      const gw = xC - xA - 0.12;
      const gz = -0.03;
      const hr = 0.22;
      const hood = h - top - 0.05;
      ss.push(boxG(gw + 0.04, 0.05, 2 * hr + 0.04, gx, top, gz));
      ss.push(at(new THREE.CylinderGeometry(hr, hr, gw, 18, 1, false, 0, Math.PI), [gx, top + 0.05, gz], [0, 0, Math.PI / 2], [hood / hr, 1, 1]));
      for (const s of [-1, 1]) ss.push(rodG([gx + s * gw * 0.32, top + 0.05 + hood * 0.55, gz + hr * 0.8], [gx + s * gw * 0.32, top + 0.05 + hood * 0.55, gz + hr + 0.05], 0.008, 6));
      merged(g, P.steel, ss);
      handles.push(cylX(0.013, gw * 0.7, gx, top + 0.05 + hood * 0.55, gz + hr + 0.05, 8));
      handles.push(at(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), [gx, top + 0.05 + hood * 0.86, gz + hr * 0.5], [Math.PI / 2 - 1.05, 0, 0]));
      merged(g, P.black, [...knobs, ...handles]);
      // Spüle mit Bogenarmatur
      const sx = (xC + hw) / 2;
      const sink = [boxG(0.5, 0.006, 0.38, sx, top, -0.02)];
      sink.push(rodG([sx, top, -hd + 0.08], [sx, top + 0.14, -hd + 0.08], 0.014, 8));
      sink.push(at(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI), [sx, top + 0.14, -hd + 0.13], [0, Math.PI / 2, 0]));
      sink.push(rodG([sx, top + 0.14, -hd + 0.18], [sx, top + 0.1, -hd + 0.18], 0.012, 8));
      sink.push(cylX(0.008, 0.06, sx + 0.04, top + 0.05, -hd + 0.08, 6));
      merged(g, P.steel, sink);
      merged(g, P.steelD, [boxG(0.44, 0.004, 0.32, sx, top + 0.005, -0.02)]);
      // Ablage: Schneidbrett, Kräutertopf; im offenen Regal Teller und Topf
      merged(g, P.woodL, [boxG(0.38, 0.022, 0.26, (xA - hw) / 2 + 0.03, top, 0.02)]);
      merged(g, P.rust, [cylG(0.06, 0.09, -hw + 0.1, top, -hd + 0.12, 12, 0.07)]);
      merged(g, P.leaf, [at(new THREE.SphereGeometry(0.075, 8, 6), [-hw + 0.1, top + 0.12, -hd + 0.12], [0, 0, 0], [1, 0.8, 1])]);
      const ox = (xA - hw) / 2;
      merged(g, P.cream, [cylG(0.11, 0.08, ox - 0.08, yb + 0.03, 0.0, 16), cylG(0.09, 0.05, ox + 0.14, (top + yb) / 2, -0.02, 14)]);
      merged(g, P.steelD, [cylG(0.09, 0.13, ox + 0.13, yb + 0.03, -0.03, 14), cylG(0.095, 0.012, ox + 0.13, yb + 0.16, -0.03, 14)]);
      return true;
    }
    // Gartenbar: Theke mit Überstand nach vorn, Front aus Brettern, Fußstange, Knaggen; dahinter Regalböden mit Flaschen,
    // Gläser auf der Theke
    case "garden_bar": {
      const hw = w / 2;
      const hd = d / 2;
      const ct = 0.05;
      const top = h - 0.1; // Oberkante Theke 1.05
      const zf = hd - 0.18; // Front (Bretter), davor Überstand
      const wood = [];
      const n = 12;
      for (let i = 0; i < n; i++) wood.push(boxG(w / n - 0.008, top - ct - 0.05, 0.028, -hw + ((i + 0.5) * w) / n, 0.05, zf - 0.014));
      for (const s of [-1, 1]) wood.push(boxG(0.04, top - ct, zf + hd - 0.03, s * (hw - 0.02), 0, (zf - 0.03 - hd) / 2));
      wood.push(boxG(0.03, top - ct - 0.06, zf + hd - 0.06, 0, 0.06, (zf - 0.03 - hd) / 2));
      merged(g, M.wood, wood);
      // Regalböden hinten (für den Ausschank)
      const shelf = [];
      const levels = [0.06, (top - ct) * 0.4, (top - ct) * 0.72];
      for (const y of levels) shelf.push(boxG(w - 0.08, 0.03, zf + hd - 0.06, 0, y, (zf - 0.03 - hd) / 2));
      merged(g, P.woodL, shelf);
      merged(g, P.black, [boxG(w - 0.1, 0.05, 0.03, 0, 0, zf - 0.06)]);
      // Theke und Knaggen
      merged(g, P.woodD, [boxG(w + 0.04, ct, d, 0, top - ct, 0)]);
      const metal = [cylX(0.018, w - 0.2, 0, 0.22, zf + 0.1, 10)];
      for (const x of [-hw + 0.15, 0, hw - 0.15]) {
        metal.push(rodG([x, 0.22, zf], [x, 0.22, zf + 0.1], 0.012, 6));
        metal.push(barG([x, top - ct - 0.22, zf + 0.01], [x, top - ct - 0.01, hd - 0.04], 0.03, 0.03));
      }
      merged(g, P.steelD, metal);
      // Flaschen auf den Regalböden: Körper, Schulter, Hals – drei Glasfarben
      const glass = [tint(M, 0x2e6b3c, { roughness: 0.25, metalness: 0.1 }), tint(M, 0x6b3a17, { roughness: 0.25, metalness: 0.1 }), tint(M, 0xbfd8d2, { roughness: 0.2, metalness: 0.1 })];
      const bottles = [[], [], []];
      const bz = -hd + 0.12;
      let k = 0;
      for (const [y, xs] of [
        [levels[1] + 0.03, [-0.7, -0.6, -0.5, 0.15, 0.27]],
        [levels[2] + 0.03, [-0.72, -0.62, -0.38, 0.2, 0.3, 0.42, 0.66]],
      ])
        for (const x of xs) {
          const r = 0.032 + (k % 2) * 0.006;
          const bh = 0.15 + ((k * 7) % 3) * 0.015;
          bottles[k % 3].push(cylG(r, bh, x * (hw / 0.9), y, bz + (k % 2) * 0.05, 10), cylG(r, 0.04, x * (hw / 0.9), y + bh, bz + (k % 2) * 0.05, 10, 0.012), cylG(0.012, 0.05, x * (hw / 0.9), y + bh + 0.04, bz + (k % 2) * 0.05, 6));
          k++;
        }
      bottles.forEach((b, i) => merged(g, glass[i], b));
      // Gläser auf der Theke und im unteren Fach
      merged(g, M.glass, [cylG(0.032, 0.1, hw - 0.3, top, 0.12, 12, 0.038), cylG(0.032, 0.1, hw - 0.2, top, 0.16, 12, 0.038), cylG(0.03, 0.09, -hw + 0.3, top, 0.14, 12, 0.03)]);
      return true;
    }
    default:
      return false;
  }
}
