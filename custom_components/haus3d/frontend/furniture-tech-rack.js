// Modelle „Server & NAS“ (catalog-tech.js): 19-Zoll-Einbaugeräte (Breite 0,482 m, Höhe = HE × 0,0445 m) und Tischgeräte im Einheitsrahmen
// (Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Vorderseite nach +z). Ohne verknüpfte Entität stehen die LEDs in bulbs und
// leuchten grün. Mit Entität folgen alle LEDs des Modells ihrem Zustand über g.userData.onState (rack-live.js, rackLedKind): grün = an,
// dunkelgrau = aus, rot = Fehler; sie stehen dann nicht in bulbs, sonst überschriebe das Licht-an/aus aller Leuchtmittel die Farbe.
// Im Schrank stehen Tischgeräte auf einem Fachboden (siehe rackShelf).

import { cyl, rod } from "./model-parts.js";
import { cbox, colors, disc, ledMats, ring } from "./tech-parts.js";
import { HE, SHELF } from "./catalog-tech.js";
import { rackLedKind } from "./rack-live.js";

/** Kleine LED (grün, folgt einer verknüpften Entität) auf der Frontfläche z. */
function led(g, M, bulbs, x, y, z, s = 0.0045) {
  bulbs.push(cbox(g, M.led, s, s * 0.75, 0.002, x, y, z + 0.001));
}

/** 19-Zoll-Gehäuse: Körper, Frontplatte, Ohren mit Löchern; gibt die Frontfläche (z) zurück. */
function chassis19(g, M, w, h, d, face) {
  cbox(g, M.plasticDark, w - 0.034, h - 0.004, d - 0.012, 0, h / 2, -0.006);
  cbox(g, face, w, h - 0.001, 0.012, 0, h / 2, d / 2 - 0.006);
  const he = Math.max(1, Math.round(h / HE));
  for (const sx of [-1, 1]) {
    cbox(g, M.metal, 0.012, h - 0.001, 0.002, sx * (w / 2 - 0.007), h / 2, d / 2 + 0.001);
    for (let u = 0; u < he; u++) cbox(g, M.dark, 0.0045, 0.008, 0.0022, sx * (w / 2 - 0.007), (u + 0.5) * HE, d / 2 + 0.0011);
  }
  return d / 2;
}

/** Laufwerksschacht (Einschub) mit Griff und Aktivitäts-LED. */
function bay(g, M, x, bulbs, cx, cy, bw, bh, z) {
  cbox(g, x.slate, bw, bh, 0.004, cx, cy, z + 0.002);
  cbox(g, M.metal, bw * 0.6, Math.max(bh * 0.1, 0.002), 0.002, cx, cy - bh * 0.28, z + 0.0045);
  led(g, M, bulbs, cx + bw * 0.34, cy + bh * 0.3, z + 0.004, Math.min(0.004, bw * 0.1));
}

/** Gitter aus Laufwerksschächten in einem Bereich (x0 … x1, y0 … y1). */
function bays(g, M, x, bulbs, z, cols, rows, x0, x1, y0, y1) {
  const pw = (x1 - x0) / cols;
  const ph = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bay(g, M, x, bulbs, x0 + pw * (c + 0.5), y0 + ph * (r + 0.5), pw - 0.006, ph - 0.004, z);
}

/** Lüftungsschlitze (feine Linien) in einem Bereich. */
function vents(g, M, z, x0, x1, y0, y1, n) {
  for (let i = 0; i < n; i++) cbox(g, M.plasticDark, x1 - x0, 0.0018, 0.002, (x0 + x1) / 2, y0 + ((y1 - y0) * (i + 0.5)) / n, z + 0.001);
}

/** Netzwerkbuchsen in einer Reihe: n Stück ab x0 mit Teilung p; optional mit LED darüber. */
function jacks(g, M, bulbs, z, n, x0, p, y, withLed, jw = 0.0105, jh = 0.0085) {
  for (let i = 0; i < n; i++) {
    cbox(g, M.plasticDark, jw, jh, 0.003, x0 + i * p, y, z + 0.0015);
    cbox(g, M.metal, jw * 0.7, 0.0015, 0.002, x0 + i * p, y - jh * 0.25, z + 0.0032);
    if (withLed) led(g, M, bulbs, x0 + i * p, y + jh * 0.5 + 0.004, z, 0.0035);
  }
}

/** Schalter-Frontplatte mit zwei Buchsenreihen (je n Ports), SFP-Käfigen und Status-LEDs. */
function switchFront(g, M, bulbs, w, h, z, ports, sfp) {
  const per = ports / 2;
  const p = 0.0165;
  const x0 = -w / 2 + 0.03;
  jacks(g, M, bulbs, z, per, x0, p, h * 0.68, true);
  jacks(g, M, bulbs, z, per, x0, p, h * 0.27, true);
  for (let i = 0; i < sfp; i++) cbox(g, M.metal, 0.02, 0.011, 0.003, 0.07 + (i % 2) * 0.026, h * (i < 2 ? 0.7 : 0.28), z + 0.0015);
  for (let i = 0; i < 3; i++) led(g, M, bulbs, 0.17 + i * 0.012, h * 0.5, z, 0.0045);
}

/** Baut einen 19-Zoll-Typ; false, wenn der Typ nicht dazugehört. */
function buildUnit(type, w, d, h, M, g, bulbs) {
  const x = colors(M);
  const he = Math.max(1, Math.round(h / HE));
  switch (type) {
    case "tech_srv_1u":
    case "tech_srv_2u":
    case "tech_srv_4u":
    case "tech_nas_rack": {
      const z = chassis19(g, M, w, h, d, M.dark);
      const x0 = -w / 2 + 0.024;
      const x1 = w * 0.18;
      if (type === "tech_srv_1u") bays(g, M, x, bulbs, z, 4, 1, x0, x1, 0.005, h - 0.005);
      else if (type === "tech_srv_2u") bays(g, M, x, bulbs, z, 4, 2, x0, x1, 0.006, h - 0.006);
      else if (type === "tech_srv_4u") bays(g, M, x, bulbs, z, 6, 4, x0, x1 + 0.03, 0.01, h - 0.01);
      else bays(g, M, x, bulbs, z, 6, 2, x0, x1 + 0.03, 0.006, h - 0.006); // 12 Einschübe
      // rechts: Bedienfeld mit Taste, Status-LEDs und Lüftungsschlitzen
      const px = w / 2 - 0.05;
      disc(g, M.metal, 0.0065, 0.004, px, h * 0.72, z + 0.002, 12);
      led(g, M, bulbs, px - 0.02, h * 0.72, z, 0.0045);
      led(g, M, bulbs, px - 0.03, h * 0.72, z, 0.0045);
      vents(g, M, z, px - 0.035, px + 0.018, 0.006, h * 0.55, Math.min(he * 3, 9));
      if (type === "tech_nas_rack") cbox(g, M.screen, 0.032, 0.012, 0.002, px - 0.01, h * 0.72, z + 0.001); // Anzeige
      break;
    }
    case "tech_switch_24":
    case "tech_switch_poe": {
      const poe = type === "tech_switch_poe";
      const z = chassis19(g, M, w, h, d, poe ? x.slate : M.dark);
      switchFront(g, M, bulbs, w, h, z, 24, poe ? 4 : 2);
      break;
    }
    case "tech_patch_panel": {
      const z = chassis19(g, M, w, h, d, M.dark);
      jacks(g, M, bulbs, z, 24, -0.2046, 0.0178, h * 0.42, false, 0.0145, 0.0125);
      for (let i = 0; i < 4; i++) cbox(g, M.white, 0.095, 0.004, 0.002, -0.1515 + i * 0.1068, h * 0.85, z + 0.001); // Beschriftungsstreifen
      break;
    }
    case "tech_firewall": {
      const z = chassis19(g, M, w, h, d, M.dark);
      jacks(g, M, bulbs, z, 6, -w / 2 + 0.04, 0.0175, h * 0.55, true, 0.0115, 0.009);
      for (let i = 0; i < 2; i++) cbox(g, M.metal, 0.02, 0.011, 0.003, -w / 2 + 0.17 + i * 0.026, h * 0.55, z + 0.0015); // SFP
      for (let i = 0; i < 4; i++) led(g, M, bulbs, 0.1 + i * 0.012, h * 0.55, z, 0.0045);
      cbox(g, M.dark, 0.014, 0.008, 0.003, 0.17, h * 0.55, z + 0.0015); // USB
      vents(g, M, z, 0.19, w / 2 - 0.026, 0.006, h - 0.006, 4);
      break;
    }
    case "tech_ups_2u": {
      const z = chassis19(g, M, w, h, d, M.dark);
      cbox(g, M.screen, 0.07, 0.03, 0.002, -0.12, h * 0.5, z + 0.001);
      for (let i = 0; i < 3; i++) disc(g, M.metal, 0.0065, 0.004, -0.04 + i * 0.022, h * 0.35, z + 0.002, 12);
      for (let i = 0; i < 5; i++) led(g, M, bulbs, -0.04 + i * 0.012, h * 0.68, z, 0.005);
      vents(g, M, z, 0.06, w / 2 - 0.026, 0.008, h - 0.008, 8);
      break;
    }
    case "tech_pdu": {
      const z = chassis19(g, M, w, h, d, M.dark);
      for (let i = 0; i < 8; i++) {
        const cx = -0.19 + i * 0.045;
        disc(g, M.white, 0.0155, 0.003, cx, h / 2, z + 0.0015, 18);
        for (const sx of [-1, 1]) disc(g, M.dark, 0.0023, 0.003, cx + sx * 0.0055, h / 2, z + 0.0031, 6);
      }
      cbox(g, x.red, 0.016, 0.022, 0.004, 0.19, h / 2, z + 0.002); // Hauptschalter
      led(g, M, bulbs, 0.19, h * 0.86, z, 0.004);
      break;
    }
    case "tech_rack_shelf": {
      cbox(g, M.dark, w, h - 0.001, 0.008, 0, h / 2, d / 2 - 0.004);
      for (const sx of [-1, 1]) {
        cbox(g, M.metal, 0.012, h - 0.001, 0.002, sx * (w / 2 - 0.007), h / 2, d / 2 + 0.001);
        cbox(g, M.metal, 0.004, 0.012, d - 0.01, sx * (w / 2 - 0.021), 0.006, -0.005); // Seitenwinkel
      }
      cbox(g, M.metal, w - 0.04, 0.003, d - 0.012, 0, 0.0015, -0.006); // Boden
      cbox(g, M.metal, w - 0.04, 0.014, 0.003, 0, 0.007, -d / 2 + 0.003); // hintere Kante
      for (let i = 0; i < 3; i++) cbox(g, M.plasticDark, w - 0.12, 0.0012, 0.03, 0, 0.0033, -0.06 + i * 0.07); // Lüftungsfelder
      break;
    }
    case "tech_blank_panel":
    case "tech_blank_panel_2u": {
      const z = d / 2;
      cbox(g, M.dark, w, h - 0.001, 0.004, 0, h / 2, z - 0.002);
      for (const sx of [-1, 1]) {
        cbox(g, M.metal, 0.012, h - 0.001, 0.001, sx * (w / 2 - 0.007), h / 2, z + 0.0005);
        for (let u = 0; u < he; u++) cbox(g, M.plasticDark, 0.0045, 0.008, 0.0012, sx * (w / 2 - 0.007), (u + 0.5) * HE, z + 0.0006);
      }
      break;
    }
    case "tech_cable_mgmt": {
      const z = chassis19(g, M, w, h, d, M.dark);
      cbox(g, M.plasticDark, w - 0.04, 0.003, d - 0.012, 0, 0.0015, -0.006);
      for (let i = 0; i < 6; i++) ring(g, M.metal, 0.0135, 0.0018, -0.19 + i * 0.076, h / 2, z + 0.004, 20); // Führungsringe
      break;
    }
    case "tech_brush_panel": {
      // Frontplatte mit Ohren, mittiger Schlitz (dunkel) und je einer Bürstenkante oben und unten; keine LEDs
      const z = chassis19(g, M, w, h, d, M.metal);
      const sw = w - 0.08;
      const sh = h * 0.35;
      cbox(g, M.screen, sw, sh, 0.002, 0, h / 2, z + 0.001);
      for (const sy of [-1, 1]) cbox(g, x.slate, sw, Math.min(0.004, sh * 0.3), 0.004, 0, h / 2 + sy * (sh / 2 - 0.0015), z + 0.002);
      break;
    }
    case "tech_kvm": {
      const z = chassis19(g, M, w, h, d, M.dark);
      cbox(g, x.slate, w - 0.07, h - 0.012, 0.003, 0, h / 2, z + 0.0015); // Deckel der Schublade
      cbox(g, M.metal, 0.12, 0.006, 0.01, 0, 0.009, z + 0.006); // Griff
      led(g, M, bulbs, w / 2 - 0.045, h - 0.009, z + 0.003, 0.004);
      led(g, M, bulbs, w / 2 - 0.055, h - 0.009, z + 0.003, 0.004);
      break;
    }
    default:
      return false;
  }
  return true;
}

/** Baut ein Tischgerät; false, wenn der Typ nicht dazugehört. */
function buildDesk(type, w, d, h, M, g, bulbs) {
  const x = colors(M);
  const z = d / 2;
  switch (type) {
    case "tech_nas_2bay":
    case "tech_nas_5bay": {
      const n = type === "tech_nas_2bay" ? 2 : 5;
      cbox(g, M.dark, w, h, d, 0, h / 2, 0);
      bays(g, M, x, bulbs, z, 1, n, -w / 2 + 0.008, w / 2 - 0.008, 0.026, h - 0.008);
      disc(g, M.metal, 0.0065, 0.004, 0, 0.013, z + 0.002, 12);
      break;
    }
    case "tech_nas_8bay": {
      cbox(g, M.dark, w, h, d, 0, h / 2, 0);
      bays(g, M, x, bulbs, z, 8, 1, -w / 2 + 0.012, w / 2 - 0.012, 0.03, h - 0.012);
      disc(g, M.metal, 0.0065, 0.004, w / 2 - 0.03, 0.016, z + 0.002, 12);
      break;
    }
    case "tech_mini_pc": {
      cbox(g, M.dark, w, h, d, 0, h / 2, 0);
      cbox(g, M.metal, w * 0.98, 0.004, d * 0.98, 0, h - 0.002, 0);
      for (let i = 0; i < 2; i++) cbox(g, M.plasticDark, 0.012, 0.005, 0.003, -0.03 + i * 0.016, h * 0.4, z + 0.0015);
      disc(g, M.metal, 0.006, 0.004, 0.03, h * 0.4, z + 0.002, 12);
      led(g, M, bulbs, 0.045, h * 0.7, z, 0.005);
      break;
    }
    case "tech_sbc": {
      cbox(g, M.dark, w, h, d, 0, h / 2, 0);
      vents(g, M, z, -w / 2 + 0.012, w / 2 - 0.012, 0.006, h - 0.006, 3);
      led(g, M, bulbs, w / 2 - 0.012, h * 0.55, z, 0.005);
      break;
    }
    case "tech_tower_server": {
      // Gehäuse auf Füßen, vorn Laufwerksschächte (oben Einschübe, unten Frontgitter), Taste und LEDs
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(g, M.dark, 0.03, 0.012, 0.03, sx * (w / 2 - 0.02), 0.006, sz * (d / 2 - 0.03));
      cbox(g, M.dark, w, h - 0.012, d, 0, 0.012 + (h - 0.012) / 2, 0);
      for (let i = 0; i < 2; i++) cbox(g, M.metal, w - 0.04, 0.032, 0.004, 0, h - 0.04 - i * 0.045, z + 0.002); // Laufwerke 5,25"
      bays(g, M, x, bulbs, z, 4, 1, -w / 2 + 0.016, w / 2 - 0.016, h * 0.62 - 0.06, h * 0.62);
      vents(g, M, z, -w / 2 + 0.02, w / 2 - 0.02, 0.03, h * 0.45, 12);
      disc(g, M.metal, 0.007, 0.004, 0, 0.02, z + 0.002, 12);
      led(g, M, bulbs, 0.04, 0.02, z, 0.005);
      break;
    }
    case "tech_switch_8": {
      cbox(g, M.metal, w, h, d, 0, h / 2, 0);
      jacks(g, M, bulbs, z, 8, -0.0612, 0.0175, h * 0.36, true, 0.0115, 0.0095);
      break;
    }
    case "tech_wifi_router": {
      cbox(g, M.white, w, 0.04, d, 0, 0.02, 0);
      for (let i = 0; i < 5; i++) led(g, M, bulbs, -0.04 + i * 0.02, 0.022, z, 0.0055);
      for (const sx of [-1, 1]) {
        rod(g, M.white, [sx * (w / 2 - 0.02), 0.04, -d * 0.3], [sx * (w / 2 - 0.02), h - 0.01, -d * 0.3], 0.007, 8);
        cbox(g, M.dark, 0.012, 0.012, 0.012, sx * (w / 2 - 0.02), 0.045, -d * 0.3);
      }
      break;
    }
    case "tech_ap_ceiling": {
      // an der Decke: flache Scheibe, unten die Statusleuchte
      const r = Math.min(w, d) / 2;
      cyl(g, M.white, r, h * 0.6, 0, h * 0.4, 0, 36);
      cyl(g, M.light, r * 0.8, h * 0.4, 0, 0, 0, 36, r * 0.92);
      bulbs.push(cyl(g, M.bulb, r * 0.13, 0.003, 0, -0.001, 0, 16)); // Statusleuchte unten
      break;
    }
    case "tech_modem": {
      cbox(g, M.white, w, h, d, 0, h / 2, 0);
      for (let i = 0; i < 4; i++) led(g, M, bulbs, -0.045 + i * 0.03, h * 0.5, z, 0.006);
      break;
    }
    case "tech_ups_tower": {
      cbox(g, M.dark, w, h, d, 0, h / 2, 0);
      cbox(g, M.screen, w * 0.5, h * 0.18, 0.003, -w * 0.12, h * 0.78, z + 0.0015);
      for (let i = 0; i < 3; i++) led(g, M, bulbs, w * 0.2 + i * 0.016, h * 0.78, z, 0.006);
      disc(g, M.metal, 0.012, 0.005, 0, h * 0.5, z + 0.0025, 16);
      vents(g, M, z, -w / 2 + 0.02, w / 2 - 0.02, 0.02, h * 0.38, 6);
      break;
    }
    default:
      return false;
  }
  return true;
}

/** Fachboden unter einem Tischgerät im Schrank (liegt zwischen mount_y − SHELF und mount_y). */
export function rackShelf(g, M, d) {
  const depth = Math.min(Math.max(d + 0.04, 0.2), 0.46);
  cbox(g, M.metal, 0.452, SHELF, depth, 0, -SHELF / 2, 0);
  cbox(g, M.metal, 0.452, 0.012, 0.004, 0, 0.006 - SHELF / 2, -depth / 2 + 0.002);
}

/** Ist eine Entität verknüpft? (Sie folgt dann der Status-LED, siehe buildRackGear.) */
const linked = (item) => typeof item?.entity === "string" && item.entity.includes(".") && item.entity !== "none";

/**
 * Baut einen Typ aus „Server & NAS“; false, wenn der Typ nicht dazugehört. Mit verknüpfter Entität (item.entity) sammelt es die LEDs
 * in einer eigenen Liste (nicht in bulbs) und setzt g.userData.onState: alle LEDs wechseln mit dem Zustand das Material
 * (ledMats: green, off, red). Modelle ohne LEDs (Blenden, Patchfeld) bekommen kein onState.
 */
export function buildRackGear(type, w, d, h, M, g, bulbs, item = {}) {
  const leds = linked(item) ? [] : bulbs;
  if (!buildUnit(type, w, d, h, M, g, leds)) {
    if (!buildDesk(type, w, d, h, M, g, leds)) return false;
    if (item?.in_rack) rackShelf(g, M, d);
  }
  if (leds !== bulbs && leds.length) {
    const mats = ledMats(M);
    g.userData.onState = (st) => {
      const mat = mats[rackLedKind(st)];
      for (const l of leds) if (l.material !== mat) l.material = mat;
    };
  }
  return true;
}
