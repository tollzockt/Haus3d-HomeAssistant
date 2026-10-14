// 3D-Modelle des Katalogs „Garage & Werkstatt“ (catalog-garden.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.
// Fahrzeuge und Gartengeräte stehen in furniture-garage2.js, die Werkstattmöbel hier.

import { THREE, at, ballG, boxG, cylG, palette, rodG, tint } from "./garden-parts.js";
import { beamG, buildVehicle, own, parts, xCylG, zCylG } from "./furniture-garage2.js";

/** Pappkarton und Behälter in Regalen: hell, braun, grau. */
const CARDBOARD = 0xb8905a;

/** Baut einen Typ dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildGarage(type, w, d, h, M, g, bulbs, item = {}) {
  if (buildVehicle(type, w, d, h, M, g, bulbs, item)) return true;
  const P = palette(M);
  const card = tint(M, CARDBOARD, { roughness: 0.95 });
  const cardD = tint(M, 0x9a7440, { roughness: 0.95 });
  const grey = tint(M, 0x6b7076, { roughness: 0.7 });
  switch (type) {
    // Werkbank: dicke Holzplatte auf Stahlgestell, Ablageboden, Schubladenblock, Schraubstock, Werkzeug obenauf
    case "garden_workbench": {
      const add = parts(g);
      const hw = w / 2;
      const hd = d / 2;
      add(M.wood, boxG(w, 0.05, d, 0, h - 0.05, 0));
      add(P.woodD, boxG(w + 0.02, 0.012, 0.03, 0, h - 0.062, hd - 0.015), boxG(w + 0.02, 0.012, 0.03, 0, h - 0.062, -hd + 0.015));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steelD, boxG(0.05, h - 0.05, 0.05, sx * (hw - 0.06), 0, sz * (hd - 0.06)));
      add(P.steelD, boxG(w - 0.1, 0.04, 0.03, 0, h - 0.12, hd - 0.06), boxG(w - 0.1, 0.04, 0.03, 0, h - 0.12, -hd + 0.06), boxG(w - 0.1, 0.04, 0.03, 0, 0.12, hd - 0.06), boxG(w - 0.1, 0.04, 0.03, 0, 0.12, -hd + 0.06));
      add(M.wood, boxG(w - 0.2, 0.03, d - 0.1, 0, 0.2, 0));
      // Schubladenblock rechts: Korpus und vier Fronten mit Griffen
      const bw = 0.5;
      const bx = hw - 0.06 - bw / 2 - 0.03;
      add(P.steelD, boxG(bw, h - 0.34, d - 0.1, bx, 0.22, 0));
      for (let i = 0; i < 4; i++) {
        const y = 0.25 + i * ((h - 0.42) / 4);
        add(P.blue, boxG(bw - 0.03, (h - 0.42) / 4 - 0.012, 0.012, bx, y, hd - 0.045));
        add(P.steel, boxG(0.18, 0.012, 0.02, bx, y + (h - 0.42) / 8 - 0.006, hd - 0.035));
      }
      // Schraubstock links vorn
      const vx = -hw + 0.2;
      add(P.steelD, boxG(0.16, 0.1, 0.14, vx, h, hd - 0.08), boxG(0.05, 0.1, 0.06, vx, h, hd + 0.0));
      add(P.steel, xCylG(0.012, 0.16, vx, h + 0.04, hd + 0.04, 8), zCylG(0.011, 0.1, vx, h + 0.04, hd + 0.06, 8));
      // Werkzeug auf der Platte: Hammer, Zange, Werkzeugkasten, Schraubenschlüssel
      add(P.woodD, boxG(0.3, 0.025, 0.025, -0.2, h, 0.0, [0, 0.4, 0]));
      add(P.steelD, boxG(0.04, 0.045, 0.1, -0.3, h, 0.1));
      add(P.red, boxG(0.34, 0.14, 0.17, 0.12, h, -0.1), boxG(0.1, 0.03, 0.12, 0.12, h + 0.14, -0.1));
      add(P.steel, boxG(0.3, 0.012, 0.03, 0.05, h, 0.13, [0, -0.3, 0]), ballG(0.03, 0.2, h + 0.006, 0.17, [1, 0.3, 1], 8));
      add.done();
      return true;
    }
    // Werkzeugwand: Lochplatte mit Haken und Werkzeug-Silhouetten (Rückseite an der Wand)
    case "garden_pegboard": {
      const add = parts(g);
      add(own(M, item, M.light), boxG(w, h, d, 0, 0, 0));
      // Lochraster
      const holes = [];
      for (let ix = 0; ix < 12; ix++) for (let iy = 0; iy < 10; iy++) holes.push(at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 6), [-w / 2 + 0.06 + ix * ((w - 0.12) / 11), 0.05 + iy * ((h - 0.1) / 9), d / 2 + 0.001], [Math.PI / 2, 0, 0]));
      add(P.black, ...holes);
      const zf = d / 2 + 0.02;
      const hook = (x, y) => add(P.steelD, rodG([x, y, d / 2], [x, y, zf + 0.012], 0.0035, 4));
      // Hammer
      add(P.woodD, boxG(0.026, 0.3, 0.022, -0.45, 0.55, zf));
      add(P.steelD, boxG(0.11, 0.045, 0.03, -0.45, 0.82, zf));
      hook(-0.45, 0.58);
      // Schraubenschlüssel (zwei)
      for (const [x, s] of [[-0.3, 0.3], [-0.24, 0.26]]) {
        add(P.steel, boxG(0.02, s, 0.01, x, 0.58, zf), at(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 8), [x, 0.6 + s, zf + 0.005], [Math.PI / 2, 0, 0]));
        hook(x, 0.62);
      }
      // Säge: Blatt und Griff
      add(P.steel, boxG(0.44, 0.1, 0.004, -0.02, 0.62, zf), boxG(0.1, 0.1, 0.02, 0.27, 0.62, zf));
      add(P.woodD, boxG(0.12, 0.11, 0.024, 0.34, 0.615, zf));
      hook(-0.2, 0.74);
      hook(0.2, 0.74);
      // Zangen
      for (const x of [0.0, 0.1]) {
        add(P.steelD, boxG(0.018, 0.13, 0.01, x, 0.38, zf));
        add(P.red, boxG(0.028, 0.1, 0.014, x, 0.26, zf));
        hook(x, 0.42);
      }
      // Schraubendreher
      [P.yellow, P.blue, P.red].forEach((m, i) => {
        add(m, cylG(0.014, 0.08, 0.26 + i * 0.05, 0.3, zf, 8));
        add(P.steel, rodG([0.26 + i * 0.05, 0.3, zf], [0.26 + i * 0.05, 0.14, zf], 0.004, 4));
      });
      // Maßband und Bohrmaschine
      add(P.yellow, boxG(0.08, 0.08, 0.04, 0.42, 0.72, zf - 0.008));
      add(P.blue, boxG(0.16, 0.07, 0.06, 0.36, 0.42, zf), boxG(0.05, 0.14, 0.05, 0.4, 0.28, zf));
      add(P.steelD, xCylG(0.016, 0.07, 0.25, 0.455, zf, 8));
      // Ablageleiste unten mit Schachteln
      add(P.woodD, boxG(w - 0.12, 0.02, 0.06, 0, 0.03, d / 2 + 0.03));
      for (let i = 0; i < 4; i++) add(i % 2 ? P.blue : P.plastic, boxG(0.16, 0.06, 0.05, -w / 2 + 0.16 + i * 0.28, 0.05, d / 2 + 0.035));
      add.done();
      return true;
    }
    // Werkzeugwagen: Stahlkorpus mit Schubladen, Arbeitsplatte, vier Rollen, Schiebegriff
    case "garden_tool_cart": {
      const add = parts(g);
      const body = own(M, item, P.red);
      const top = 0.14;
      add(body, boxG(w, h - top - 0.04, d, 0, top, 0));
      add(P.steelD, boxG(w + 0.02, 0.035, d + 0.02, 0, h - 0.035, 0), boxG(w - 0.04, 0.015, d - 0.04, 0, h - 0.0001, 0));
      const n = 5;
      const dh = (h - top - 0.1) / n;
      for (let i = 0; i < n; i++) {
        const y = top + 0.02 + i * dh;
        add(P.steelD, boxG(w - 0.04, 0.008, 0.014, 0, y + dh - 0.012, d / 2 + 0.002));
        add(P.steel, boxG(w * 0.55, 0.014, 0.022, 0, y + dh * 0.5, d / 2 + 0.014));
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.07);
        const z = sz * (d / 2 - 0.06);
        add(P.steelD, boxG(0.05, 0.02, 0.06, x, top - 0.02, z));
        add(P.rubber, xCylG(0.05, 0.03, x, 0.06, z, 14));
        add(P.steel, boxG(0.012, 0.07, 0.04, x - 0.02, 0.05, z), boxG(0.012, 0.07, 0.04, x + 0.02, 0.05, z));
      }
      // Schiebegriff an der Schmalseite
      add(P.black, rodG([w / 2 + 0.03, h - 0.12, -d / 2 + 0.04], [w / 2 + 0.03, h - 0.12, d / 2 - 0.04], 0.012, 8), rodG([w / 2 + 0.03, h - 0.12, -d / 2 + 0.04], [w / 2, h - 0.34, -d / 2 + 0.04], 0.009, 6), rodG([w / 2 + 0.03, h - 0.12, d / 2 - 0.04], [w / 2, h - 0.34, d / 2 - 0.04], 0.009, 6));
      // Werkzeug obenauf
      add(P.steel, boxG(0.22, 0.012, 0.03, -0.12, h + 0.0, 0.0, [0, 0.3, 0]));
      add(P.yellow, boxG(0.1, 0.05, 0.06, 0.14, h, 0.05));
      add.done();
      return true;
    }
    // Schwerlastregal: vier Steher, Holzböden auf Querträgern, Kartons und Behälter
    case "garden_rack_heavy": {
      const add = parts(g);
      const hw = w / 2;
      const hd = d / 2;
      const levels = [0.18, 0.7, 1.22, 1.74];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.blue, boxG(0.05, h, 0.05, sx * (hw - 0.025), 0, sz * (hd - 0.025)));
      for (const y of levels) {
        add(P.red, boxG(w, 0.045, 0.04, 0, y - 0.045, hd - 0.025), boxG(w, 0.045, 0.04, 0, y - 0.045, -hd + 0.025));
        add(M.wood, boxG(w - 0.05, 0.02, d - 0.04, 0, y - 0.02, 0));
      }
      // Kartons, Behälter und Eimer auf den Böden
      const top = (i) => levels[i];
      add(card, boxG(0.5, 0.3, 0.38, -0.55, top(0), 0), boxG(0.4, 0.22, 0.34, 0.05, top(0), -0.02), boxG(0.32, 0.4, 0.3, 0.6, top(0), 0.02));
      add(cardD, boxG(0.46, 0.04, 0.34, -0.55, top(0) + 0.3, 0), boxG(0.28, 0.02, 0.3, 0.6, top(0) + 0.4, 0.02));
      add(grey, boxG(0.55, 0.28, 0.4, -0.5, top(1), 0), boxG(0.5, 0.2, 0.38, 0.35, top(1), 0));
      add(P.blue, boxG(0.57, 0.04, 0.42, -0.5, top(1) + 0.28, 0), boxG(0.52, 0.03, 0.4, 0.35, top(1) + 0.2, 0));
      add(card, boxG(0.4, 0.34, 0.36, 0.0, top(2), 0), boxG(0.36, 0.26, 0.34, -0.6, top(2), 0.02));
      add(P.plastic, cylG(0.13, 0.3, 0.55, top(2), 0, 14), cylG(0.14, 0.03, 0.55, top(2) + 0.3, 0, 14));
      add(grey, boxG(0.5, 0.26, 0.36, -0.45, top(3), 0), boxG(0.5, 0.3, 0.38, 0.4, top(3), 0));
      add(P.yellow, cylG(0.09, 0.2, 0.0, top(3), 0, 12));
      add.done();
      return true;
    }
    // Reifenstapel: vier Reifen übereinander, oben die Felge sichtbar
    case "garden_tire_stack": {
      const add = parts(g);
      const R = Math.min(w, d) / 2;
      const th = h / 4;
      const r = th / 2;
      for (let i = 0; i < 4; i++) {
        const y = th * (i + 0.5);
        add(P.rubber, at(new THREE.TorusGeometry(R - r, r, 10, 28), [0, y, 0], [Math.PI / 2, 0, 0], [1, 1, 0.97]));
        add(P.steel, cylG(R - 2 * r + 0.015, 0.02, 0, y - 0.01, 0, 20));
      }
      add(P.steelD, cylG(0.04, 0.03, 0, h - th / 2, 0, 10));
      for (let i = 0; i < 5; i++) add(P.steelD, cylG(0.011, 0.02, Math.cos(i * 1.2566) * 0.085, h - th / 2 + 0.004, Math.sin(i * 1.2566) * 0.085, 6));
      add.done();
      return true;
    }
    // Reifenregal: Stahlrahmen mit zwei Ebenen, darauf je zwei liegende Reifen
    case "garden_tire_rack": {
      const add = parts(g);
      const hw = w / 2;
      const hd = d / 2;
      const levels = [0.14, 0.58];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steelD, boxG(0.04, h, 0.04, sx * (hw - 0.02), 0, sz * (hd - 0.02)));
      for (const y of levels) {
        add(P.steelD, boxG(w, 0.035, 0.035, 0, y - 0.035, hd - 0.02), boxG(w, 0.035, 0.035, 0, y - 0.035, -hd + 0.02), boxG(0.03, 0.03, d, -hw + 0.02, y - 0.06, 0), boxG(0.03, 0.03, d, hw - 0.02, y - 0.06, 0), boxG(0.03, 0.03, d, 0, y - 0.06, 0));
      }
      const R = Math.min(0.28, (w / 2) * 0.5, 0.29);
      for (const y of levels) for (const sx of [-1, 1]) {
        const x = sx * (hw / 2);
        add(P.rubber, at(new THREE.TorusGeometry(R - 0.08, 0.08, 10, 24), [x, y + 0.08, 0], [Math.PI / 2, 0, 0]));
        add(P.steel, cylG(R - 0.16 + 0.01, 0.02, x, y + 0.07, 0, 18));
      }
      add(P.steelD, boxG(w, 0.03, d, 0, h - 0.03, 0));
      add.done();
      return true;
    }
    // Anlegeleiter: Alu-Holme mit Sprossen, Fuß vorn (+z), Kopf lehnt hinten an der Wand
    case "garden_ladder": {
      const add = parts(g);
      const zf = d / 2 - 0.04;
      const zb = -d / 2 + 0.03;
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - 0.02);
        add(P.steel, beamG([x, 0.0, zf], [x, h - 0.01, zb], 0.035, 0.05));
        add(P.rubber, boxG(0.045, 0.04, 0.07, x, 0, zf - 0.005));
      }
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.7) / (n + 0.4);
        add(P.steelD, rodG([-w / 2 + 0.02, h * t, zf + (zb - zf) * t], [w / 2 - 0.02, h * t, zf + (zb - zf) * t], 0.014, 8));
      }
      add(P.black, boxG(w - 0.03, 0.03, 0.03, 0, h - 0.04, zb + 0.01));
      add.done();
      return true;
    }
    // Gefriertruhe: weißer Korpus, flacher Deckel mit Griff und Schloss, Füße, Kontrollleuchte
    case "garden_freezer": {
      const add = parts(g);
      add(M.white, boxG(w, h - 0.1, d, 0, 0.05, 0));
      add(P.steelD, boxG(w - 0.08, 0.05, d - 0.08, 0, 0, 0));
      add(M.white, boxG(w + 0.012, 0.055, d + 0.012, 0, h - 0.055, 0));
      add(P.plastic, boxG(w - 0.04, 0.012, d - 0.04, 0, h - 0.0001, 0));
      add(P.black, boxG(w * 0.38, 0.035, 0.03, 0, h - 0.06, d / 2 + 0.014), boxG(0.12, 0.012, 0.012, 0, h - 0.045, d / 2 + 0.03));
      add(P.steelD, boxG(0.06, 0.035, 0.03, -w / 2 + 0.12, h - 0.06, -d / 2 - 0.005), boxG(0.06, 0.035, 0.03, w / 2 - 0.12, h - 0.06, -d / 2 - 0.005));
      add(P.steel, boxG(0.03, 0.04, 0.012, w / 2 - 0.1, h - 0.1, d / 2 + 0.007));
      add(M.led, boxG(0.018, 0.018, 0.01, w / 2 - 0.2, h - 0.2, d / 2 + 0.006));
      add(P.black, boxG(0.5, 0.05, 0.01, -w / 2 + 0.34, h - 0.2, d / 2 + 0.006));
      add.done();
      return true;
    }
    // Getränkekisten: vier Stapel aus je drei Kisten (blau und rot), oben mit Flaschenverschlüssen
    case "garden_crates": {
      const add = parts(g);
      const cw = w / 2;
      const cd = d / 2;
      const ch = h / 3;
      const caps = [];
      [[-1, -1, P.blue], [1, -1, P.red], [-1, 1, P.red], [1, 1, P.blue]].forEach(([sx, sz, mat], k) => {
        const x = sx * cw / 2;
        const z = sz * cd / 2;
        for (let i = 0; i < 3; i++) {
          const y = i * ch;
          // Kiste: Boden, vier Wände, Griffausschnitt dunkel
          add(mat, boxG(cw - 0.012, 0.02, cd - 0.012, x, y, z), boxG(cw - 0.012, ch - 0.02, 0.014, x, y + 0.02, z + cd / 2 - 0.013), boxG(cw - 0.012, ch - 0.02, 0.014, x, y + 0.02, z - cd / 2 + 0.013), boxG(0.014, ch - 0.02, cd - 0.04, x + cw / 2 - 0.013, y + 0.02, z), boxG(0.014, ch - 0.02, cd - 0.04, x - cw / 2 + 0.013, y + 0.02, z));
          add(P.black, boxG(0.1, 0.03, 0.016, x, y + ch - 0.06, z + cd / 2 - 0.004), boxG(0.1, 0.03, 0.016, x, y + ch - 0.06, z - cd / 2 + 0.004));
        }
        // oben: Flaschenverschlüsse 4 × 5 (Reihen von 5)
        for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) caps.push(cylG(0.014, 0.03, x - cw / 2 + 0.05 + ix * ((cw - 0.1) / 3), 3 * ch - 0.06, z - cd / 2 + 0.06 + iz * ((cd - 0.12) / 2), 8));
        add(k % 2 ? P.yellow : P.steel, ...caps.splice(0));
      });
      add.done();
      return true;
    }
    // Kanister: drei Kanister (rot, grün, blau) mit Henkel und Schraubverschluss
    case "garden_jerrycan": {
      const add = parts(g);
      const cw = w / 3;
      [P.red, P.plasticG, P.blue].forEach((mat, i) => {
        const x = -w / 3 + i * cw;
        add(mat, boxG(cw - 0.03, h * 0.76, d, x, 0, 0), boxG(cw - 0.03, h * 0.12, d * 0.68, x, h * 0.76, 0.05), boxG(cw - 0.03, h * 0.04, d * 0.4, x, h * 0.88, 0.05));
        // Henkel: zwei Pfosten und Griff, Verschluss hinten oben
        add(mat, boxG(0.02, h * 0.14, 0.02, x, h * 0.84, -0.06), boxG(0.02, h * 0.14, 0.02, x, h * 0.84, 0.0), boxG(0.02, 0.025, 0.1, x, h * 0.97 - 0.02, -0.03));
        add(P.black, cylG(0.026, 0.035, x, h * 0.92, 0.1, 10), cylG(0.02, 0.012, x, h * 0.92 + 0.035, 0.1, 10));
        // eingeprägtes Kreuz an der Breitseite
        add(P.black, boxG(0.008, h * 0.4, 0.004, x, h * 0.18, d / 2 + 0.001, [0, 0, 0.55]), boxG(0.008, h * 0.4, 0.004, x, h * 0.18, d / 2 + 0.001, [0, 0, -0.55]));
      });
      add.done();
      return true;
    }
    // Fahrradhalter (Wand): Wandplatte, schräger gummierter Arm mit aufgebogenem Haken (Rückseite an der Wand)
    case "garden_bike_hook": {
      const add = parts(g);
      const zb = -d / 2;
      add(P.steelD, boxG(w, h, 0.02, 0, 0, zb + 0.01));
      for (const y of [0.06, h - 0.06]) add(P.black, at(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8), [0, y, zb + 0.025], [Math.PI / 2, 0, 0]));
      const a = [0, 0.1, zb + 0.02];
      const b = [0, 0.14, zb + d * 0.75];
      const c = [0, h - 0.02, zb + d - 0.03];
      add(P.steelD, rodG(a, b, 0.014, 8), rodG(b, c, 0.014, 8), rodG([0, 0.04, zb + 0.02], [0, 0.12, zb + d * 0.45], 0.008, 6));
      add(P.rubber, rodG([0, 0.14, zb + d * 0.3], b, 0.02, 8), rodG(b, c, 0.02, 8), ballG(0.022, c[0], c[1], c[2], [1, 1, 1], 8));
      add.done();
      return true;
    }
    // Garagenregal mit Kisten: Metallgerüst, vier Böden, Stapelkisten (grau/blau) und Behälter
    case "garden_garage_shelf": {
      const add = parts(g);
      const hw = w / 2;
      const hd = d / 2;
      const levels = [0.06, 0.5, 0.94, 1.38];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steelD, boxG(0.035, h, 0.035, sx * (hw - 0.02), 0, sz * (hd - 0.02)));
      for (const y of levels) add(M.wood, boxG(w - 0.01, 0.025, d - 0.01, 0, y - 0.025, 0));
      add(P.steelD, boxG(w, 0.02, 0.02, 0, h - 0.02, hd - 0.02), boxG(w, 0.02, 0.02, 0, h - 0.02, -hd + 0.02));
      // offene Euro-Kisten
      const crate = (mat, x, y, z, cw, ch, cd) => {
        add(mat, boxG(cw, 0.012, cd, x, y, z), boxG(cw, ch, 0.012, x, y, z + cd / 2 - 0.006), boxG(cw, ch, 0.012, x, y, z - cd / 2 + 0.006), boxG(0.012, ch, cd, x + cw / 2 - 0.006, y, z), boxG(0.012, ch, cd, x - cw / 2 + 0.006, y, z));
        add(P.black, boxG(cw * 0.3, 0.025, 0.014, x, y + ch - 0.04, z + cd / 2));
      };
      crate(grey, -0.4, levels[0], 0, 0.38, 0.28, 0.38);
      crate(P.blue, 0.0, levels[0], 0, 0.38, 0.28, 0.38);
      crate(grey, 0.4, levels[0], 0, 0.38, 0.28, 0.38);
      crate(P.blue, -0.4, levels[1], 0, 0.38, 0.22, 0.38);
      crate(grey, 0.0, levels[1], 0, 0.38, 0.22, 0.38);
      add(card, boxG(0.34, 0.3, 0.34, 0.4, levels[1], 0));
      crate(grey, -0.4, levels[2], 0, 0.38, 0.3, 0.38);
      crate(grey, -0.4, levels[2] + 0.3, 0, 0.38, 0.1, 0.38);
      add(P.yellow, cylG(0.07, 0.17, 0.0, levels[2], 0.0, 12), cylG(0.07, 0.17, 0.17, levels[2], 0.0, 12), cylG(0.06, 0.2, 0.4, levels[2], 0.0, 12));
      add(P.red, cylG(0.07, 0.03, 0.0, levels[2] + 0.17, 0.0, 12), cylG(0.07, 0.03, 0.17, levels[2] + 0.17, 0.0, 12));
      add(card, boxG(0.45, 0.26, 0.36, -0.15, levels[3], 0));
      add(cardD, boxG(0.36, 0.2, 0.34, 0.35, levels[3], 0));
      add.done();
      return true;
    }
    // Kompressor: liegender Druckkessel auf Gestell mit Rädern, Motor und Pumpe obenauf, Manometer, Tragegriff
    case "garden_compressor": {
      const add = parts(g);
      const R = Math.min(0.13, d / 2 - 0.02);
      const L = w * 0.78;
      const ty = 0.22;
      const x0 = -w / 2 + 0.03 + L / 2;
      add(P.steelD, xCylG(R, L, x0, ty + R * 0.4, 0, 18));
      // Wölbungen an den Enden
      add(P.steelD, at(new THREE.SphereGeometry(R, 14, 8), [x0 - L / 2, ty + R * 0.4, 0], [0, 0, 0], [0.4, 1, 1]), at(new THREE.SphereGeometry(R, 14, 8), [x0 + L / 2, ty + R * 0.4, 0], [0, 0, 0], [0.4, 1, 1]));
      // Rahmen mit Standfüßen links und Rädern rechts
      add(P.black, boxG(L + 0.04, 0.025, d - 0.06, x0, 0.12, 0));
      for (const s of [-1, 1]) {
        add(P.rubber, xCylG(0.07, 0.045, w / 2 - 0.06, 0.07, s * (d / 2 - 0.03), 14));
        add(P.steel, xCylG(0.03, 0.05, w / 2 - 0.06, 0.07, s * (d / 2 - 0.03), 8));
        add(P.rubber, boxG(0.06, 0.08, 0.05, -w / 2 + 0.07, 0.04, s * (d / 2 - 0.05)));
        add(P.black, rodG([-w / 2 + 0.07, 0.12, s * (d / 2 - 0.05)], [-w / 2 + 0.07, 0.07, s * (d / 2 - 0.05)], 0.012, 6));
      }
      // Motor und Pumpe
      const mx = x0 - 0.04;
      add(P.red, boxG(0.3, 0.13, d - 0.1, mx, ty + R * 0.4 + R * 0.7, 0), xCylG(0.075, 0.12, mx - 0.19, ty + R * 0.4 + R * 0.7 + 0.065, 0, 14));
      add(P.steelD, cylG(0.05, 0.1, mx + 0.07, ty + R * 0.4 + R * 0.7 + 0.13, 0.0, 12), cylG(0.056, 0.012, mx + 0.07, ty + R * 0.4 + R * 0.7 + 0.2, 0, 12), cylG(0.056, 0.012, mx + 0.07, ty + R * 0.4 + R * 0.7 + 0.17, 0, 12));
      // Manometer und Druckregler an der Stirnseite rechts
      add(P.steel, zCylG(0.034, 0.018, x0 + 0.1, ty + R * 0.4 + R * 0.9, R * 0.3, 14));
      add(P.plastic, zCylG(0.028, 0.006, x0 + 0.1, ty + R * 0.4 + R * 0.9, R * 0.3 + 0.012, 14));
      add(P.black, cylG(0.022, 0.03, x0 + 0.2, ty + R * 0.4 + R, 0.0, 10), rodG([x0 + 0.1, ty + R * 0.4 + R * 0.9, R * 0.3], [x0 + 0.2, ty + R * 1.2, 0], 0.007, 5));
      // Tragegriff über dem Motor
      add(P.black, rodG([mx - 0.15, ty + R * 0.4 + R * 0.7 + 0.13, -0.06], [mx - 0.15, h - 0.02, -0.06], 0.01, 6), rodG([mx - 0.15, ty + R * 0.4 + R * 0.7 + 0.13, 0.06], [mx - 0.15, h - 0.02, 0.06], 0.01, 6), rodG([mx - 0.15, h - 0.02, -0.06], [mx - 0.15, h - 0.02, 0.06], 0.014, 8));
      add(P.black, rodG([mx + 0.17, ty + R * 0.4 + R * 0.7 + 0.13, -0.06], [mx + 0.17, h - 0.02, -0.06], 0.01, 6), rodG([mx + 0.17, ty + R * 0.4 + R * 0.7 + 0.13, 0.06], [mx + 0.17, h - 0.02, 0.06], 0.01, 6), rodG([mx + 0.17, h - 0.02, -0.06], [mx + 0.17, h - 0.02, 0.06], 0.014, 8));
      add(P.black, rodG([mx - 0.15, h - 0.02, 0], [mx + 0.17, h - 0.02, 0], 0.016, 8));
      add.done();
      return true;
    }
    default:
      return false;
  }
}
