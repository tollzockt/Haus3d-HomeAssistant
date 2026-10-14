// 3D-Modelle des Katalogs „Hydroponik & Anzucht“ (catalog-garden.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Mitte der Grundfläche im Ursprung, Vorderseite nach +z.
// Zuchtlichter und LED-Leisten (bulbs) folgen einem verknüpften Licht.

import { THREE, at, ballG, boxG, cylG, merged, palette, plants, rodG, tint } from "./garden-parts.js";
import { parts, xCylG } from "./furniture-garage2.js";

/** Baut einen Typ dieses Moduls in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildHydro(type, w, d, h, M, g, bulbs, item = {}) {
  const P = palette(M);
  const add = parts(g);
  /** Leuchtleiste: eigenes Mesh mit M.bulb, folgt dem Licht. */
  const led = (...geos) => bulbs.push(merged(g, M.bulb, geos));
  switch (type) {
    // Hydroponik-Turm: Wasserbehälter mit Pumpe unten, weiße Säule, versetzte Pflanztaschen mit Salat, Steigschlauch, Kappe
    case "garden_hydro_tower": {
      const R = Math.min(w, d) / 2;
      const tankH = 0.22;
      const colR = 0.09;
      add(M.dark, cylG(R * 0.96, tankH, 0, 0, 0, 24));
      add(P.steelD, cylG(R * 0.98, 0.025, 0, tankH, 0, 24));
      add(M.white, cylG(colR, h - tankH - 0.2, 0, tankH, 0, 20), cylG(colR + 0.025, 0.04, 0, h - 0.2, 0, 20), cylG(colR + 0.012, 0.03, 0, tankH + 0.025, 0, 20));
      const levels = 7;
      const spots = [];
      for (let i = 0; i < levels; i++) {
        const y = 0.4 + i * ((h - 0.7) / (levels - 1));
        for (let k = 0; k < 3; k++) {
          const a = i * 0.7 + (k * Math.PI * 2) / 3;
          const x = Math.cos(a) * (colR + 0.045);
          const z = Math.sin(a) * (colR + 0.045);
          add(P.black, cylG(0.05, 0.07, x, y, z, 10, 0.038));
          spots.push([x * 1.12, y + 0.02, z * 1.12, 0.055 + 0.01 * ((i + k) % 3)]);
        }
      }
      // Pumpe und Steigschlauch an der Rückseite
      add(P.black, boxG(0.1, 0.08, 0.08, R * 0.55, tankH, -R * 0.4));
      add(P.black, rodG([R * 0.55, tankH + 0.08, -R * 0.4], [R * 0.52, h - 0.14, -R * 0.45], 0.011, 6), rodG([R * 0.52, h - 0.14, -R * 0.45], [0.02, h - 0.16, 0], 0.011, 6));
      add.done();
      plants(g, P, spots, { seed: 5 });
      // Kräuterkrone oben
      plants(g, P, [[0, h - 0.17, 0, 0.1], [0.05, h - 0.2, 0.04, 0.07]], { seed: 9 });
      return true;
    }
    // Rinnenanlage (NFT): Stahlgestell, drei Ebenen mit je zwei leicht geneigten Rinnen voller Pflanzen, Tank mit Pumpe, Schläuche
    case "garden_hydro_nft": {
      const hw = w / 2;
      const hd = d / 2;
      const Lc = w - 0.24;
      const ys = [0.5, 0.72, 0.94];
      const slope = -0.014; // Gefälle zur Tankseite (rechts)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steelD, boxG(0.04, ys[2] + 0.06, 0.04, sx * (hw - 0.1), 0, sz * (hd - 0.05)));
      for (const sx of [-1, 1]) for (const y of ys) add(P.steelD, boxG(0.03, 0.03, d - 0.06, sx * (hw - 0.1), y - 0.04, 0));
      add(P.steelD, boxG(w - 0.16, 0.025, 0.025, 0, ys[0] - 0.12, hd - 0.05), boxG(w - 0.16, 0.025, 0.025, 0, ys[0] - 0.12, -hd + 0.05));
      const spots = [];
      for (const y of ys) for (const sz of [-1, 1]) {
        const z = sz * (hd - 0.2);
        add(M.white, boxG(Lc, 0.055, 0.1, 0, y - 0.01, z, [0, 0, slope]));
        add(P.black, boxG(0.05, 0.05, 0.1, -Lc / 2 + 0.01, y - 0.012, z, [0, 0, slope]));
        for (let i = 0; i < 7; i++) {
          const x = -Lc / 2 + 0.14 + (i * (Lc - 0.28)) / 6;
          const yy = y + 0.045 + x * slope;
          add(P.black, cylG(0.03, 0.02, x, yy - 0.01, z, 10));
          spots.push([x, yy + 0.01, z, 0.062 + 0.012 * ((i + sz) % 2)]);
        }
      }
      // Tank unter dem Gestell, Pumpe, Zuleitung rechts hoch, Rücklauf links
      add(M.dark, boxG(0.62, 0.26, 0.4, 0.2, 0.02, 0), boxG(0.64, 0.02, 0.42, 0.2, 0.28, 0));
      add(P.black, boxG(0.12, 0.09, 0.1, 0.38, 0.3, 0.06), rodG([0.38, 0.38, 0.06], [hw - 0.07, ys[2] + 0.08, hd - 0.05], 0.012, 6));
      add(P.black, rodG([hw - 0.07, ys[2] + 0.08, hd - 0.05], [hw - 0.07, ys[2] + 0.08, -hd + 0.05], 0.011, 6), rodG([-hw + 0.1, ys[0] - 0.05, 0.1], [-0.05, 0.3, 0.1], 0.013, 6));
      add.done();
      plants(g, P, spots, { seed: 4 });
      return true;
    }
    // Growbox / Anzuchtzelt: dunkles Zelt mit reflektierendem Futter, Rahmenstangen, hochgerollte Tür, LED-Panel (leuchtet), Pflanzen, Abluft
    case "garden_growbox": {
      const hw = w / 2;
      const hd = d / 2;
      const t = 0.012;
      add(P.black, boxG(w, 0.04, d, 0, 0, 0));
      add(M.dark, boxG(w, h - 0.04, t, 0, 0.04, -hd + t / 2), boxG(t, h - 0.04, d, -hw + t / 2, 0.04, 0), boxG(t, h - 0.04, d, hw - t / 2, 0.04, 0), boxG(w, t, d, 0, h - t, 0));
      // reflektierendes Futter innen
      add(P.steel, boxG(w - 0.04, h - 0.1, 0.006, 0, 0.06, -hd + 0.016), boxG(0.006, h - 0.1, d - 0.04, -hw + 0.016, 0.06, 0), boxG(0.006, h - 0.1, d - 0.04, hw - 0.016, 0.06, 0), boxG(w - 0.04, 0.006, d - 0.04, 0, h - 0.026, 0));
      // Rahmen aus Stahlrohr
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steel, boxG(0.026, h, 0.026, sx * (hw - 0.013), 0, sz * (hd - 0.013)));
      add(P.steel, boxG(w, 0.026, 0.026, 0, h - 0.026, hd - 0.013), boxG(w, 0.026, 0.026, 0, h - 0.026, -hd + 0.013), boxG(0.026, 0.026, d, -hw + 0.013, h - 0.026, 0), boxG(0.026, 0.026, d, hw - 0.013, h - 0.026, 0));
      // Tür: Rolle oben, Streifen links und rechts, Reißverschluss
      add(M.dark, xCylG(0.045, w - 0.06, 0, h - 0.09, hd + 0.005, 14), boxG(0.14, h - 0.2, 0.012, -hw + 0.08, 0.04, hd - 0.004), boxG(0.14, h - 0.2, 0.012, hw - 0.08, 0.04, hd - 0.004));
      add(P.black, boxG(0.012, h - 0.22, 0.016, -hw + 0.16, 0.04, hd), boxG(0.012, h - 0.22, 0.016, hw - 0.16, 0.04, hd));
      // Lüfter und Abluftschlauch auf dem Dach
      add(P.steelD, xCylG(0.07, 0.34, 0.25, h + 0.075, -0.1, 16), cylG(0.07, 0.07, 0.25, h - 0.01, -0.1, 14));
      add(P.black, xCylG(0.075, 0.03, 0.42, h + 0.075, -0.1, 16), rodG([0.1, h + 0.075, -0.1], [-0.2, h + 0.1, 0.1], 0.04, 8));
      // Pflanzen in vier Töpfen
      const spots = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 0.28;
        const z = sz * 0.25;
        add(P.black, cylG(0.1, 0.22, x, 0.04, z, 14, 0.085));
        add(P.rubber, cylG(0.09, 0.012, x, 0.25, z, 14));
        spots.push([x, 0.5, z, 0.2], [x + 0.04, 0.75, z - 0.03, 0.15], [x - 0.03, 0.95, z + 0.02, 0.11]);
        add(P.leafD, rodG([x, 0.25, z], [x, 0.9, z], 0.012, 5));
      }
      // LED-Panel unter der Decke an zwei Seilen: Gehäuse und leuchtende Fläche
      const ly = h - 0.36;
      add(P.black, boxG(0.74, 0.05, 0.52, 0, ly + 0.012, 0), rodG([-0.3, ly + 0.06, 0], [-0.3, h - 0.03, 0], 0.005, 4), rodG([0.3, ly + 0.06, 0], [0.3, h - 0.03, 0], 0.005, 4));
      led(boxG(0.66, 0.012, 0.44, 0, ly, 0));
      add.done();
      plants(g, P, spots, { seed: 6 });
      return true;
    }
    // Anzuchtregal: Metallregal mit vier Ebenen, unter jeder Ebene eine LED-Leiste (leuchtet), Anzuchtschalen mit Setzlingen und Hauben
    case "garden_seed_rack": {
      const hw = w / 2;
      const hd = d / 2;
      const ys = [0.1, 0.55, 1.0, 1.45];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steelD, boxG(0.03, h, 0.03, sx * (hw - 0.015), 0, sz * (hd - 0.015)));
      for (const y of ys) add(M.metal, boxG(w - 0.01, 0.014, d - 0.01, 0, y - 0.014, 0), boxG(w, 0.022, 0.02, 0, y - 0.02, hd - 0.012));
      add(M.metal, boxG(w - 0.01, 0.02, d - 0.01, 0, h - 0.02, 0));
      const spots = [];
      const bars = [];
      ys.forEach((y, i) => {
        for (const sx of [-1, 1]) {
          const x = sx * (hw / 2 - 0.02);
          add(P.black, boxG(0.52, 0.045, 0.26, x, y, 0));
          add(P.soil, boxG(0.48, 0.012, 0.22, x, y + 0.036, 0));
          for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 2; iz++) spots.push([x - 0.19 + ix * 0.095, y + 0.045, -0.055 + iz * 0.11, 0.03 + 0.006 * ((ix + iz + i) % 3)]);
          if ((i + (sx > 0 ? 1 : 0)) % 2) add(M.glass, boxG(0.52, 0.1, 0.26, x, y + 0.045, 0));
        }
        const top = i < ys.length - 1 ? ys[i + 1] - 0.036 : h - 0.036;
        bars.push(boxG(w - 0.12, 0.018, 0.05, 0, top, 0.0));
      });
      add.done();
      plants(g, P, spots, { seed: 8, squash: 1.2 });
      led(...bars);
      return true;
    }
    // Mikrogrün-Regal: schmales Holzregal mit vier flachen Schalen voller Mikrogrün und LED-Streifen (leuchten) unter den Ebenen
    case "garden_microgreens": {
      const hw = w / 2;
      const hd = d / 2;
      const ys = [0.06, 0.38, 0.7, 1.02];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(M.wood, boxG(0.03, h, 0.03, sx * (hw - 0.015), 0, sz * (hd - 0.015)));
      for (const y of ys) add(M.wood, boxG(w, 0.02, d, 0, y - 0.02, 0));
      add(M.wood, boxG(w, 0.025, d, 0, h - 0.025, 0));
      const bars = [];
      ys.forEach((y, i) => {
        add(P.black, boxG(w - 0.1, 0.035, d - 0.06, 0, y, 0));
        // Mikrogrün: Reihen in zwei Grüntönen mit leicht unterschiedlicher Höhe
        const rows = 6;
        for (let r = 0; r < rows; r++) add(r % 2 ? P.leaf : P.leafD, boxG(w - 0.14, 0.04 + 0.014 * ((r + i) % 3), (d - 0.1) / rows - 0.004, 0, y + 0.03, -(d - 0.1) / 2 + ((r + 0.5) * (d - 0.1)) / rows));
        const top = i < ys.length - 1 ? ys[i + 1] - 0.036 : h - 0.03;
        bars.push(boxG(w - 0.14, 0.012, 0.04, 0, top, 0));
      });
      add.done();
      led(...bars);
      return true;
    }
    // Nährstofftank mit Pumpe: Kunststofftank mit Deckel und Füllstandsanzeige, Pumpe mit Schläuchen, Dosierflaschen
    case "garden_nutrient_tank": {
      const tw = w * 0.68;
      add(M.white, boxG(tw, h - 0.03, d - 0.05, -w / 2 + tw / 2, 0, 0), boxG(tw + 0.012, 0.03, d - 0.038, -w / 2 + tw / 2, h - 0.04, 0));
      // Versteifungsrippen rundum
      for (const y of [h * 0.3, h * 0.62]) add(P.plastic, boxG(tw + 0.014, 0.03, d - 0.036, -w / 2 + tw / 2, y, 0));
      add(P.blue, cylG(0.07, 0.06, -w / 2 + tw * 0.4, h - 0.01, 0.02, 16));
      add(P.steelD, cylG(0.075, 0.012, -w / 2 + tw * 0.4, h + 0.05 - 0.01, 0.02, 16));
      // Füllstandsanzeige: Glasstreifen mit blauer Flüssigkeit und Strichen
      const fx = -w / 2 + tw + 0.002;
      add(M.glass, boxG(0.02, h * 0.7, 0.05, fx, h * 0.12, d / 2 - 0.1));
      add(P.water, boxG(0.012, h * 0.4, 0.04, fx, h * 0.12, d / 2 - 0.1));
      for (let i = 0; i < 6; i++) add(P.black, boxG(0.008, 0.006, 0.07, fx + 0.005, h * 0.14 + i * (h * 0.1), d / 2 - 0.1));
      // Pumpe vorn rechts mit Schläuchen zum Tank
      const px = w / 2 - 0.09;
      add(P.black, boxG(0.14, 0.1, 0.12, px, 0, d / 2 - 0.1), cylG(0.035, 0.05, px, 0.1, d / 2 - 0.1, 10));
      add(P.plasticG, rodG([px, 0.14, d / 2 - 0.1], [-w / 2 + tw, h * 0.6, 0.06], 0.012, 6), rodG([px - 0.07, 0.05, d / 2 - 0.1], [-w / 2 + tw, h * 0.2, 0.0], 0.011, 6));
      // Dosierflaschen hinten rechts
      [P.yellow, P.blue, P.red].forEach((mat, i) => {
        const x = w / 2 - 0.05 - i * 0.075;
        add(mat, cylG(0.03, 0.16, x, 0, -d / 2 + 0.1, 12), cylG(0.018, 0.03, x, 0.16, -d / 2 + 0.1, 10));
        add(P.black, cylG(0.02, 0.02, x, 0.19, -d / 2 + 0.1, 10));
      });
      add.done();
      return true;
    }
    // Aquaponik-Becken: Unterschrank, Fischtank (Glas, Wasser, Fische), darüber ein Pflanzbett mit Kies, Pumpenrohr
    case "garden_aquaponics": {
      const hw = w / 2;
      const hd = d / 2;
      const cab = 0.45;
      const tank = 0.4;
      add(M.wood, boxG(w, cab - 0.03, d, 0, 0, 0));
      add(P.steelD, boxG(w + 0.02, 0.03, d + 0.02, 0, cab - 0.03, 0));
      add(P.steel, boxG(0.012, 0.18, 0.02, -w * 0.17, cab * 0.55, hd + 0.008), boxG(0.012, 0.18, 0.02, w * 0.17, cab * 0.55, hd + 0.008));
      // Fischtank: Rahmen, Glas, Wasser, Kies, Fische
      add(P.steelD, boxG(w, 0.02, d, 0, cab, 0), boxG(w, 0.02, d, 0, cab + tank, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(P.steelD, boxG(0.025, tank, 0.025, sx * (hw - 0.0125), cab, sz * (hd - 0.0125)));
      add(P.water, boxG(w - 0.06, tank * 0.82, d - 0.06, 0, cab + 0.02, 0));
      add(P.sand, boxG(w - 0.06, 0.04, d - 0.06, 0, cab + 0.02, 0));
      add(M.glass, boxG(w - 0.02, tank - 0.02, d - 0.02, 0, cab + 0.02, 0));
      const orange = tint(M, 0xf07c3a, { roughness: 0.5 });
      const fish = [[-0.4, 0.2, 0.05, 0], [-0.1, 0.27, -0.1, 1], [0.2, 0.17, 0.08, 0], [0.45, 0.25, -0.05, 1], [0.1, 0.12, 0.15, 0]];
      for (const [x, y, z, k] of fish) add(k ? M.white : orange, ballG(0.04, x, cab + y, z, [1.5, 0.7, 0.5], 8), at(new THREE.ConeGeometry(0.025, 0.05, 4), [x - 0.07, cab + y, z], [0, 0, Math.PI / 2]));
      add(P.leaf, ballG(0.05, -0.55, cab + 0.12, -0.1, [1, 2, 1], 6), ballG(0.04, -0.52, cab + 0.1, -0.05, [1, 2.2, 1], 6));
      // Pflanzbett oben: Wanne mit Kies
      const by = cab + tank + 0.02;
      add(P.plastic, boxG(w, 0.2, 0.02, 0, by, hd - 0.01), boxG(w, 0.2, 0.02, 0, by, -hd + 0.01), boxG(0.02, 0.2, d, -hw + 0.01, by, 0), boxG(0.02, 0.2, d, hw - 0.01, by, 0), boxG(w, 0.02, d, 0, by, 0));
      add(P.gravel, boxG(w - 0.04, 0.16, d - 0.04, 0, by + 0.02, 0));
      // Pumpenrohr vom Tank ins Beet
      add(P.black, rodG([hw - 0.08, cab + 0.04, -hd + 0.08], [hw - 0.08, by + 0.2, -hd + 0.08], 0.013, 6), rodG([hw - 0.08, by + 0.2, -hd + 0.08], [hw - 0.3, by + 0.2, -hd + 0.14], 0.013, 6));
      add.done();
      const spots = [];
      for (let i = 0; i < 7; i++) spots.push([-hw + 0.14 + i * ((w - 0.28) / 6), by + 0.16, (i % 2 ? 0.1 : -0.08), 0.085 + 0.015 * (i % 3)]);
      plants(g, P, spots, { seed: 3, blossom: P.tomato, squash: 1.1 });
      return true;
    }
    default:
      return false;
  }
}
