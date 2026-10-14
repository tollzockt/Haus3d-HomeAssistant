// Modelle „Heizungsraum“ (catalog-tech.js): stark vereinfachte Geräte aus Grundkörpern im Einheitsrahmen (Breite w entlang x, Tiefe d
// entlang z, Höhe h nach oben, Vorderseite nach +z). Wandgeräte hängen in ihrer Montagehöhe (Rückseite bei z = −d/2); Statusleuchten
// stehen in bulbs und folgen einer verknüpften Entität.

import { ball, box, cyl, rod } from "./model-parts.js";
import { cbox, colors, cylX, cylZ, disc, ring } from "./tech-parts.js";

/** Kleine Statusleuchte vorn (z = Frontfläche). */
function status(g, M, bulbs, x, y, z) {
  bulbs.push(cbox(g, M.bulb, 0.012, 0.012, 0.004, x, y, z + 0.002));
}

/** Bedienfeld mit Anzeige und Drehknopf. */
function panel(g, M, bulbs, w, y, z, pw, ph) {
  cbox(g, M.dark, pw, ph, 0.008, 0, y, z + 0.004);
  cbox(g, M.screen, pw * 0.42, ph * 0.5, 0.004, -pw * 0.18, y, z + 0.0095);
  disc(g, M.metal, Math.min(ph * 0.3, 0.022), 0.01, pw * 0.22, y, z + 0.012, 16);
  status(g, M, bulbs, pw * 0.4, y + ph * 0.28, z + 0.008);
}

/** Baut einen Heizungsraum-Typ; false, wenn der Typ nicht dazugehört. */
export function buildHeat(type, w, d, h, M, g, bulbs) {
  const x = colors(M);
  const rmin = Math.min(w, d) / 2;
  switch (type) {
    case "tech_buffer": {
      // stehender, gedämmter Speicher mit Deckel, Zierbändern und Anschlüssen am Umfang
      cyl(g, M.dark, rmin * 0.92, 0.04, 0, 0, 0, 32);
      cyl(g, M.light, rmin, h - 0.1, 0, 0.04, 0, 40);
      cyl(g, M.dark, rmin * 0.98, 0.05, 0, h - 0.06, 0, 36, rmin * 0.82);
      for (const f of [0.3, 0.62]) cyl(g, M.dark, rmin + 0.002, 0.012, 0, h * f, 0, 40);
      for (const [f, a] of [[0.14, -0.9], [0.34, 0.9], [0.54, -0.9], [0.74, 0.9], [0.9, 0.45]]) {
        const s = Math.sin(a);
        const c = Math.cos(a);
        rod(g, x.insul, [s * (rmin - 0.02), h * f, c * (rmin - 0.02)], [s * (rmin + 0.06), h * f, c * (rmin + 0.06)], 0.034);
        rod(g, M.metal, [s * (rmin + 0.06), h * f, c * (rmin + 0.06)], [s * (rmin + 0.075), h * f, c * (rmin + 0.075)], 0.022);
      }
      cbox(g, M.white, 0.2, 0.12, 0.004, 0, h * 0.46, rmin + 0.002); // Typenschild
      break;
    }
    case "tech_gas_boiler": {
      const y0 = 0.1;
      const bh = h - y0 - 0.1;
      box(g, M.white, w, bh, d, 0, y0, 0);
      cbox(g, M.dark, w * 0.86, bh * 0.22, 0.008, 0, y0 + bh * 0.78, d / 2 + 0.004);
      cbox(g, M.screen, w * 0.3, bh * 0.1, 0.004, -w * 0.16, y0 + bh * 0.78, d / 2 + 0.0095);
      for (const sx of [0.14, 0.26]) disc(g, M.metal, 0.016, 0.01, w * sx, y0 + bh * 0.78, d / 2 + 0.012, 14);
      status(g, M, bulbs, w * 0.4, y0 + bh * 0.9, d / 2 + 0.006);
      cyl(g, M.white, 0.05, 0.1, -w * 0.15, y0 + bh, -d * 0.15, 20); // Abgas-/Zuluftrohr
      cyl(g, M.metal, 0.058, 0.02, -w * 0.15, y0 + bh, -d * 0.15, 20);
      [x.brass, x.red, M.metal, x.blue, M.metal].forEach((m, i) => cyl(g, m, 0.012, y0, -w * 0.3 + i * w * 0.15, 0, d * 0.22, 10)); // Anschlüsse unten
      break;
    }
    case "tech_condensing_boiler": {
      const top = h - 0.12;
      box(g, M.white, w, top, d, 0, 0, 0);
      cbox(g, M.dark, w * 0.92, 0.2, 0.01, 0, top - 0.16, d / 2 + 0.005);
      cbox(g, M.screen, w * 0.4, 0.09, 0.004, -w * 0.16, top - 0.16, d / 2 + 0.012);
      disc(g, M.metal, 0.024, 0.012, w * 0.22, top - 0.16, d / 2 + 0.016, 16);
      status(g, M, bulbs, w * 0.4, top - 0.09, d / 2 + 0.01);
      cbox(g, M.dark, w * 0.96, 0.006, 0.004, 0, top * 0.5, d / 2 + 0.002); // Fuge der unteren Tür
      cbox(g, M.metal, 0.12, 0.014, 0.014, 0, top * 0.42, d / 2 + 0.008); // Griff
      box(g, M.light, w * 0.98, 0.03, d * 0.98, 0, top, 0);
      cyl(g, M.metal, 0.06, h - top - 0.03, w * 0.2, top + 0.03, -d * 0.15, 20); // Abgasrohr
      [x.red, x.blue, x.brass, M.metal].forEach((m, i) => cyl(g, m, 0.02, 0.07, -w * 0.32 + i * 0.1, top + 0.03, -d * 0.3, 10));
      for (const sx of [-1, 1]) box(g, M.dark, 0.05, 0.02, 0.05, sx * (w / 2 - 0.05), 0, d / 2 - 0.05);
      break;
    }
    case "tech_pellet_boiler": {
      const bw = w * 0.55;
      const hw = w - bw - 0.02;
      const bx = w / 2 - bw / 2;
      const hx = -w / 2 + hw / 2;
      // Kessel rechts, Vorratsbehälter links mit schräg aufliegendem Deckel
      box(g, M.white, bw, h * 0.88, d, bx, 0, 0);
      cbox(g, M.dark, bw * 0.84, 0.18, 0.01, bx, h * 0.88 - 0.16, d / 2 + 0.005);
      cbox(g, M.screen, bw * 0.36, 0.08, 0.004, bx - bw * 0.16, h * 0.88 - 0.16, d / 2 + 0.012);
      disc(g, M.metal, 0.022, 0.012, bx + bw * 0.22, h * 0.88 - 0.16, d / 2 + 0.016, 16);
      status(g, M, bulbs, bx + bw * 0.38, h * 0.88 - 0.08, d / 2 + 0.01);
      cbox(g, M.dark, bw * 0.94, 0.006, 0.004, bx, h * 0.4, d / 2 + 0.002);
      cyl(g, M.metal, 0.07, h * 0.12, bx, h * 0.88, -d * 0.25, 20); // Abgasrohr
      box(g, x.steel, hw, h * 0.72, d * 0.92, hx, 0.08, 0);
      const lid = cbox(g, M.dark, hw * 1.03, 0.04, d * 0.95, hx, h * 0.8 + 0.04, 0);
      lid.rotation.z = -0.1;
      cylX(g, M.metal, 0.05, hw * 0.4, hx + hw / 2 + 0.01, h * 0.38, 0, 14); // Förderschnecke zum Kessel
      for (const sx of [-1, 1]) box(g, M.dark, 0.05, 0.08, 0.05, sx * (w / 2 - 0.05), 0, d / 2 - 0.06);
      break;
    }
    case "tech_pellet_store": {
      // Gewebetank im Stahlrahmen: vier Pfosten, Rahmen oben und unten, Gewebekörper, Befüllstutzen, Saugschlauch
      const px = w / 2 - 0.03;
      const pz = d / 2 - 0.03;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, x.steel, 0.06, h - 0.1, 0.06, sx * px, 0, sz * pz);
      for (const y of [0, h - 0.16]) {
        for (const sz of [-1, 1]) box(g, x.steel, w, 0.04, 0.05, 0, y, sz * pz);
        for (const sx of [-1, 1]) box(g, x.steel, 0.05, 0.04, d - 0.1, sx * px, y, 0);
      }
      box(g, x.fabric, w - 0.1, h - 0.3, d - 0.1, 0, 0.12, 0);
      for (const f of [0.33, 0.66]) box(g, M.dark, w - 0.08, 0.025, d - 0.08, 0, h * f, 0);
      box(g, x.fabric, w - 0.14, 0.06, d - 0.14, 0, h - 0.18, 0);
      for (const sx of [-1, 1]) cyl(g, M.metal, 0.06, 0.1, sx * w * 0.22, h - 0.1, -d * 0.2, 16); // Befüllstutzen
      cylZ(g, x.insul, 0.04, d / 2 - 0.12, d / 2 + 0.0, w * 0.22, 0.32, 12); // Saugschlauch
      break;
    }
    case "tech_oil_tank": {
      // zwei Kunststofftanks nebeneinander mit Auffangwanne, Rippen, Stutzen und Verbindungsrohr
      const tw = (w - 0.1) / 2;
      box(g, M.dark, w, 0.1, d, 0, 0, 0);
      for (const s of [-1, 1]) {
        const tx = s * (tw / 2 + 0.025);
        box(g, x.oil, tw, h - 0.2, d - 0.12, tx, 0.1, 0);
        for (const f of [0.3, 0.55, 0.8]) box(g, x.oil, tw + 0.012, 0.03, d - 0.1, tx, h * f, 0);
        box(g, x.oil, tw * 0.8, 0.06, d * 0.7, tx, h - 0.1, 0);
        cyl(g, M.dark, 0.07, 0.05, tx - tw * 0.2, h - 0.04, 0, 16); // Einfüllstutzen
        cyl(g, M.white, 0.04, 0.03, tx + tw * 0.22, h - 0.04, 0, 12); // Grenzwertgeber / Anzeige
        cyl(g, M.metal, 0.02, 0.1, tx + tw * 0.1, 0.1, d / 2 - 0.06, 8); // Entnahme
      }
      cylX(g, M.metal, 0.02, 0.12, 0, 0.25, 0, 8); // Verbindungsrohr zwischen den Tanks
      break;
    }
    case "tech_expansion_vessel": {
      // Wandhalter hinten, rotes Gefäß mit gewölbtem Kopf, Luftventil und Anschluss unten
      const r = rmin - 0.01;
      box(g, M.metal, 0.12, 0.22, 0.02, 0, h * 0.18, -d / 2 + 0.01);
      cyl(g, x.red, r, h * 0.66, 0, h * 0.14, 0, 28);
      cyl(g, x.red, r, h * 0.12, 0, h * 0.8, 0, 28, r * 0.45);
      cyl(g, M.dark, 0.012, 0.02, 0, h - 0.02, 0, 8);
      cyl(g, M.dark, r + 0.002, 0.012, 0, h * 0.5, 0, 28);
      cyl(g, M.metal, 0.02, h * 0.14, 0, 0, 0, 10);
      break;
    }
    case "tech_floor_manifold": {
      // zwei Balken (Rücklauf unten mit Stellantrieben, Vorlauf oben mit Durchflussmessern), Halterungen, Endkappen
      const yLo = 0.1;
      const yHi = 0.3;
      cylX(g, M.metal, 0.016, w - 0.08, 0, yLo, 0, 12);
      cylX(g, M.metal, 0.016, w - 0.08, 0, yHi, 0, 12);
      for (const sx of [-1, 1]) box(g, M.dark, 0.03, 0.34, 0.02, sx * (w / 2 - 0.06), 0.03, -d / 2 + 0.01);
      const n = Math.max(2, Math.floor((w - 0.14) / 0.05) + 1);
      for (let i = 0; i < n; i++) {
        const cx = -((n - 1) * 0.05) / 2 + i * 0.05;
        cyl(g, M.white, 0.016, 0.075, cx, 0.012, 0, 10); // Stellantrieb
        cyl(g, M.dark, 0.017, 0.012, cx, 0.012, 0, 10);
        cyl(g, M.glass, 0.011, 0.07, cx, yHi + 0.016, 0, 8); // Durchflussmesser
        cyl(g, x.red, 0.014, 0.012, cx, yHi + 0.086, 0, 8);
      }
      cylX(g, x.blue, 0.02, 0.02, -w / 2 + 0.032, yLo, 0, 10);
      cylX(g, x.red, 0.02, 0.02, -w / 2 + 0.032, yHi, 0, 10);
      cylX(g, M.metal, 0.02, 0.02, w / 2 - 0.032, yLo, 0, 10);
      cylX(g, M.metal, 0.02, 0.02, w / 2 - 0.032, yHi, 0, 10);
      break;
    }
    case "tech_circuit_manifold": {
      // Verteilerbalken oben (gedämmt), darunter drei Pumpengruppen mit Pumpenkopf, Mischermotor und Thermometern
      box(g, x.insul, w * 0.98, 0.16, d * 0.55, 0, h - 0.18, -d * 0.12);
      cylX(g, x.red, 0.034, 0.05, -w * 0.4, h - 0.1, d * 0.2, 14);
      cylX(g, x.blue, 0.034, 0.05, -w * 0.4, h - 0.16, d * 0.2, 14);
      const gw = w * 0.27;
      for (let i = 0; i < 3; i++) {
        const gx = (i - 1) * w * 0.32;
        box(g, x.insul, gw, h - 0.26, d * 0.78, gx, 0.06, -d * 0.04);
        cylZ(g, M.metal, 0.052, d * 0.34, d / 2 - 0.01, gx, h * 0.52, 16);
        cbox(g, M.dark, 0.06, 0.04, 0.05, gx, h * 0.52 + 0.075, d * 0.4);
        cylZ(g, M.white, 0.03, d * 0.34, d / 2 - 0.01, gx, h * 0.22, 14);
        disc(g, x.red, 0.014, 0.004, gx - gw * 0.28, h * 0.76, d * 0.35 + 0.002, 14);
        disc(g, x.blue, 0.014, 0.004, gx + gw * 0.28, h * 0.76, d * 0.35 + 0.002, 14);
      }
      break;
    }
    case "tech_water_works": {
      // Grundplatte, Motor und Pumpengehäuse liegend, stehender Druckbehälter mit Manometer
      box(g, M.dark, w, 0.04, d, 0, 0, 0);
      cylX(g, M.dark, 0.085, 0.13, -w * 0.36, 0.125, 0, 18);
      cbox(g, x.steel, 0.12, 0.15, 0.18, -w * 0.12, 0.115, 0);
      cylX(g, M.metal, 0.02, 0.14, w * 0.03, 0.115, 0, 8);
      cyl(g, x.blue, 0.12, h - 0.12, w * 0.24, 0.04, 0, 24);
      cyl(g, x.blue, 0.12, 0.06, w * 0.24, h - 0.08, 0, 24, 0.05);
      disc(g, M.white, 0.025, 0.012, w * 0.24, h * 0.55, 0.12, 16);
      cbox(g, M.dark, 0.05, 0.05, 0.05, w * 0.24, h * 0.3, 0.13); // Druckschalter
      break;
    }
    case "tech_softener": {
      // Harzbehälter mit Steuerkopf, daneben der Salzbehälter mit Deckel
      cyl(g, x.blue, 0.11, h - 0.14, 0, 0.04, -d * 0.24, 24);
      cyl(g, x.blue, 0.11, 0.05, 0, h - 0.1, -d * 0.24, 24, 0.07);
      cbox(g, M.dark, 0.14, 0.1, 0.14, 0, h - 0.05, -d * 0.24);
      cbox(g, M.screen, 0.08, 0.03, 0.004, 0, h - 0.045, -d * 0.24 + 0.072);
      box(g, M.light, w * 0.94, h * 0.62, d * 0.46, 0, 0, d * 0.22);
      box(g, M.dark, w * 0.96, 0.03, d * 0.48, 0, h * 0.62, d * 0.22);
      box(g, M.white, 0.08, 0.012, 0.025, 0, h * 0.62 + 0.03, d * 0.34);
      rod(g, M.dark, [0.04, h * 0.5, -d * 0.1], [0.06, h - 0.1, -d * 0.2], 0.008);
      break;
    }
    case "tech_water_filter": {
      // Wandhalter, Kopf aus Messing mit Anschlussstutzen und Manometer, Glasglocke mit Filterpatrone, Ablassventil
      cbox(g, M.dark, 0.1, 0.3, 0.02, 0, h * 0.5, -d / 2 + 0.01);
      cbox(g, x.brass, 0.12, 0.09, 0.1, 0, h - 0.1, 0);
      cylX(g, x.brass, 0.014, w, 0, h - 0.085, 0, 12);
      cyl(g, x.brass, 0.032, 0.04, 0, h - 0.04, 0, 14);
      disc(g, M.white, 0.02, 0.01, 0, h - 0.1, 0.055, 16);
      cyl(g, M.glass, 0.052, h * 0.52, 0, 0.05, 0, 20);
      cyl(g, M.white, 0.034, h * 0.44, 0, 0.07, 0, 16);
      cyl(g, x.brass, 0.02, 0.05, 0, 0, 0, 10);
      break;
    }
    case "tech_water_meter": {
      // Rohr mit zwei Verschraubungen und messingfarbenem Zählergehäuse, Zifferblatt vorn
      const y = h / 2;
      cylX(g, M.metal, 0.014, w, 0, y, 0, 12);
      for (const sx of [-1, 1]) cylX(g, x.brass, 0.022, 0.03, sx * 0.055, y, 0, 6);
      cylZ(g, x.brass, 0.04, -0.04, 0.02, 0, y, 20);
      disc(g, M.white, 0.033, 0.004, 0, y, 0.022, 20);
      cbox(g, M.screen, 0.04, 0.012, 0.002, 0, y + 0.01, 0.025);
      ring(g, M.metal, 0.036, 0.0025, 0, y, 0.021);
      break;
    }
    case "tech_ventilation": {
      // Wandgerät: Gehäuse mit Frontdeckel, Bedienteil, je zwei Rohranschlüsse (mit Dämmring) oben und unten
      const body = h - 0.16;
      box(g, M.white, w, body, d, 0, 0.08, 0);
      cbox(g, M.light, w * 0.9, body * 0.82, 0.006, 0, 0.08 + body * 0.5, d / 2 + 0.003);
      cbox(g, M.dark, 0.12, 0.05, 0.006, w * 0.25, 0.08 + body * 0.85, d / 2 + 0.007);
      cbox(g, M.screen, 0.06, 0.025, 0.004, w * 0.22, 0.08 + body * 0.85, d / 2 + 0.012);
      status(g, M, bulbs, w * 0.31, 0.08 + body * 0.85, d / 2 + 0.01);
      for (const sx of [-1, 1]) {
        cyl(g, M.metal, 0.065, 0.1, sx * w * 0.24, h - 0.09, 0, 18);
        cyl(g, x.insul, 0.075, 0.03, sx * w * 0.24, h - 0.09, 0, 18);
        cyl(g, M.metal, 0.065, 0.1, sx * w * 0.24, 0, 0, 18);
        cyl(g, x.insul, 0.075, 0.03, sx * w * 0.24, 0.07, 0, 18);
      }
      break;
    }
    case "tech_hydromodule": {
      // stehende Inneneinheit: Mantel, Bedienblende, Türfuge, Lüftungsschlitze, gedämmte Anschlüsse und Kältemittelleitungen oben
      const top = h - 0.1;
      box(g, M.white, w, top, d, 0, 0, 0);
      cbox(g, M.dark, w * 0.7, 0.16, 0.01, 0, h * 0.72, d / 2 + 0.005);
      cbox(g, M.screen, w * 0.34, 0.09, 0.004, -w * 0.12, h * 0.72, d / 2 + 0.012);
      disc(g, M.metal, 0.022, 0.012, w * 0.2, h * 0.72, d / 2 + 0.016, 16);
      status(g, M, bulbs, w * 0.32, h * 0.72 + 0.06, d / 2 + 0.01);
      cbox(g, M.dark, w * 0.94, 0.006, 0.004, 0, h * 0.48, d / 2 + 0.002);
      for (let i = 0; i < 4; i++) cbox(g, M.dark, w * 0.5, 0.008, 0.004, 0, 0.1 + i * 0.03, d / 2 + 0.002);
      box(g, M.light, w * 0.98, 0.03, d * 0.98, 0, top, 0);
      for (const sx of [-1, 1]) {
        cyl(g, x.insul, 0.026, h - top - 0.03, sx * 0.17, top + 0.03, -d * 0.25, 10);
        cyl(g, x.copper, 0.012, h - top - 0.03, sx * 0.06, top + 0.03, -d * 0.25, 8);
      }
      break;
    }
    case "tech_solar_station": {
      // gedämmte Pumpengruppe mit Pumpenkopf, Manometern und Durchflussmesser, Regler oben
      box(g, x.insul, w * 0.66, h * 0.72, d * 0.6, -w * 0.12, 0.02, -d * 0.12);
      box(g, M.white, w * 0.9, 0.1, d * 0.7, 0, h - 0.1, -d * 0.1);
      cbox(g, M.screen, w * 0.34, 0.04, 0.004, -w * 0.12, h - 0.05, d * 0.25 + 0.002);
      status(g, M, bulbs, w * 0.3, h - 0.05, d * 0.25);
      cylZ(g, M.dark, 0.04, d * 0.18, d * 0.42, -w * 0.12, h * 0.3, 16);
      for (const gx of [-0.2, 0.1]) disc(g, M.white, 0.02, 0.01, w * gx, h * 0.62, d * 0.18 + 0.006, 16);
      cyl(g, M.glass, 0.011, h * 0.52, w * 0.34, 0.06, 0, 8);
      cyl(g, x.red, 0.015, 0.014, w * 0.34, 0.06 + h * 0.52, 0, 8);
      break;
    }
    case "tech_dehumidifier": {
      // Gehäuse auf Rollen, Bedienfeld oben, Lamellen vorn, durchscheinender Wassertank unten
      box(g, M.white, w, h - 0.06, d, 0, 0.05, 0);
      cbox(g, M.dark, w * 0.9, 0.012, d * 0.4, 0, h - 0.006, d * 0.12);
      cbox(g, M.screen, w * 0.3, 0.004, d * 0.18, -w * 0.1, h + 0.001, d * 0.12);
      status(g, M, bulbs, w * 0.3, h - 0.006, d * 0.12);
      for (let i = 0; i < 5; i++) cbox(g, M.dark, w * 0.7, 0.008, 0.004, 0, h * (0.52 + i * 0.07), d / 2 + 0.002);
      cbox(g, M.glass, w * 0.8, h * 0.3, 0.012, 0, h * 0.25, d / 2 + 0.006);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cylX(g, M.dark, 0.025, 0.02, sx * (w / 2 - 0.04), 0.025, sz * (d / 2 - 0.05), 10);
      break;
    }
    case "tech_circ_pump": {
      // Rohr mit Verschraubungen, Pumpengehäuse, liegender Motorkopf mit Wählknopf und Klemmenkasten
      const y = 0.06;
      cylX(g, M.metal, 0.014, w, 0, y, 0, 12);
      for (const sx of [-1, 1]) cylX(g, x.brass, 0.022, 0.03, sx * (w / 2 - 0.04), y, 0, 6);
      cyl(g, x.steel, 0.045, 0.09, 0, y - 0.045, 0, 16);
      cylZ(g, M.dark, 0.05, -d / 2 + 0.01, d / 2 - 0.02, 0, y, 18);
      disc(g, M.white, 0.034, 0.004, 0, y, d / 2 - 0.018, 18);
      cbox(g, M.dark, 0.03, 0.006, 0.004, 0.012, y, d / 2 - 0.014);
      cbox(g, M.dark, 0.05, 0.04, 0.05, 0, h - 0.02, -0.01);
      break;
    }
    case "tech_pipe_group": {
      // Vorlauf (oben) und Rücklauf (unten) gedämmt mit farbigen Bändern, zwei Steigleitungen, Absperrhahn
      const yF = h * 0.7;
      const yR = h * 0.3;
      const ex = w / 2 - 0.05;
      cylX(g, x.insul, 0.04, w - 0.1, 0, yF, 0, 16);
      cylX(g, x.insul, 0.04, w - 0.1, 0, yR, 0, 16);
      cylX(g, x.red, 0.043, 0.04, -w * 0.22, yF, 0, 16);
      cylX(g, x.blue, 0.043, 0.04, -w * 0.22, yR, 0, 16);
      cyl(g, x.insul, 0.04, yF + 0.04, -ex, 0, 0, 16);
      cyl(g, x.insul, 0.04, h - yR + 0.04, ex, yR - 0.04, 0, 16);
      ball(g, x.insul, 0.045, -ex, yF, 0, 14);
      ball(g, x.insul, 0.045, ex, yR, 0, 14);
      cbox(g, x.brass, 0.06, 0.07, 0.06, w * 0.16, yF, 0);
      cyl(g, x.red, 0.022, 0.012, w * 0.16, yF + 0.035, 0, 10);
      break;
    }
    default:
      return false;
  }
  return true;
}

