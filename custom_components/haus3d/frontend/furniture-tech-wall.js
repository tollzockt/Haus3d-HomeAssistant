// Modelle „Steckdosen & Schalter“ (catalog-tech.js): flache Wandtypen aus Rahmen und Einsatz. Rückseite an der Wand (z = −d/2),
// Vorderseite nach +z. Eine verknüpfte Entität schaltet die Kontroll-LED bzw. den Leuchtring (siehe stateLeds in tech-parts.js).

import * as THREE from "./vendor/three.module.min.js";
import { HALF_PI, arrow, cbox, colors, cylZ, disc, ring, stateLeds } from "./tech-parts.js";

/** Rahmen am Rücken und Einsatz darauf; gibt die Frontfläche (z) des Einsatzes zurück. */
function frame(g, M, w, h, d, inset = 0) {
  const tf = Math.min(0.01, d * 0.55);
  cbox(g, M.white, w, h, tf, 0, h / 2, -d / 2 + tf / 2);
  const top = d / 2 - inset;
  cbox(g, M.light, w - 0.014, h - 0.014, top + d / 2 - tf, 0, h / 2, (top - d / 2 + tf) / 2);
  return top;
}

/** Schuko-Steckdose: runde Fläche, zwei Steckdosenlöcher (dunkle Punkte), zwei Schutzkontakte; Leuchtring außen. */
function schuko(g, M, cx, cy, top, r, leds) {
  disc(g, M.white, r, 0.002, cx, cy, top + 0.001);
  for (const sx of [-1, 1]) disc(g, M.dark, r * 0.145, 0.002, cx + sx * r * 0.37, cy, top + 0.0021, 8);
  for (const sy of [-1, 1]) cbox(g, M.metal, r * 0.4, r * 0.15, 0.002, cx, cy + sy * (r - r * 0.07), top + 0.0021);
  leds.push(ring(g, M.dark, r * 1.14, 0.0018, cx, cy, top + 0.002));
}

/** Kleine Kontroll-LED (Rechteck) am Einsatz. */
function dot(g, M, cx, cy, top, leds, w = 0.007) {
  leds.push(cbox(g, M.dark, w, w * 0.8, 0.002, cx, cy, top + 0.001));
}

/** Wippe (leicht gekippt). */
function rocker(g, M, w, h, top, cx, cy, depth = 0.004, tilt = 0.1) {
  const m = cbox(g, M.white, w, h, depth, cx, cy, top + depth / 2 - 0.0005);
  m.rotation.x = tilt;
  return m;
}

/** Steckdosen-Gruppe (1 bis 3 nebeneinander bzw. übereinander, entlang der längeren Seite). */
function sockets(type, w, h, d, M, g, leds) {
  const n = type === "tech_socket_triple" ? 3 : type === "tech_socket_double" ? 2 : 1;
  const horizontal = w >= h;
  const pitch = (horizontal ? w : h) / n;
  for (let i = 0; i < n; i++) {
    const c = -(horizontal ? w : h) / 2 + pitch * (i + 0.5);
    const cell = Math.min(pitch, horizontal ? h : w);
    const cx = horizontal ? c : 0;
    const cy = h / 2 + (horizontal ? 0 : -c);
    const tf = Math.min(0.01, d * 0.55);
    // je Steckdose ein eigener Einsatz im gemeinsamen Rahmen
    if (i === 0) cbox(g, M.white, w, h, tf, 0, h / 2, -d / 2 + tf / 2);
    cbox(g, M.light, cell - 0.014, cell - 0.014, d - tf, cx, cy, -d / 2 + tf + (d - tf) / 2);
    schuko(g, M, cx, cy, d / 2, Math.min(0.026, cell * 0.33), leds);
  }
}

/** Baut einen Wandtyp; false, wenn der Typ nicht dazugehört. */
export function buildWall(type, w, d, h, M, g, bulbs, item = {}) {
  const x = colors(M);
  const leds = [];
  const cy = h / 2;
  switch (type) {
    case "tech_socket":
    case "tech_socket_double":
    case "tech_socket_triple":
      sockets(type, w, h, d, M, g, leds);
      break;
    case "tech_socket_usb": {
      const top = frame(g, M, w, h, d);
      schuko(g, M, 0, cy + h * 0.14, top, Math.min(w, h) * 0.26, leds);
      // zwei USB-Buchsen darunter
      for (const sx of [-1, 1]) {
        cbox(g, M.dark, 0.016, 0.008, 0.002, sx * 0.014, cy - h * 0.29, top + 0.001);
        cbox(g, M.metal, 0.011, 0.002, 0.002, sx * 0.014, cy - h * 0.29, top + 0.0021);
      }
      break;
    }
    case "tech_socket_outdoor": {
      // Aufputz-Gehäuse mit Klappdeckel (durchscheinend), Scharnier oben
      cbox(g, x.greyLight, w, h, d * 0.7, 0, cy, -d / 2 + d * 0.35);
      schuko(g, M, 0, cy - 0.004, -d / 2 + d * 0.7, Math.min(w, h) * 0.3, leds);
      cbox(g, M.glass, w * 0.92, h * 0.84, d * 0.3, 0, cy - 0.004, d / 2 - d * 0.15);
      cbox(g, M.dark, w * 0.92, 0.008, 0.012, 0, h - 0.008, d / 2 - 0.012);
      cbox(g, M.dark, 0.02, 0.006, 0.01, 0, 0.012, d / 2 - 0.008);
      break;
    }
    case "tech_stove_outlet": {
      const top = frame(g, M, w, h, d);
      disc(g, M.white, Math.min(w, h) * 0.36, 0.003, 0, cy, top + 0.0015, 24);
      disc(g, M.metal, 0.005, 0.004, 0, cy, top + 0.004, 10);
      for (const [dx, dy] of [[-0.022, 0.022], [0.022, 0.022], [-0.022, -0.022], [0.022, -0.022]]) disc(g, M.metal, 0.003, 0.003, dx, cy + dy, top + 0.003, 8);
      dot(g, M, w * 0.37, h * 0.37, top, leds);
      break;
    }
    case "tech_switch": {
      const top = frame(g, M, w, h, d);
      rocker(g, M, w * 0.6, h * 0.6, top, 0, cy);
      dot(g, M, w * 0.34, h * 0.4, top, leds);
      break;
    }
    case "tech_switch_double": {
      const top = frame(g, M, w, h, d);
      for (const sx of [-1, 1]) rocker(g, M, w * 0.28, h * 0.6, top, sx * w * 0.17, cy);
      dot(g, M, 0, h * 0.4, top, leds, 0.006);
      break;
    }
    case "tech_dimmer": {
      const top = frame(g, M, w, h, d, 0.012);
      cylZ(g, M.white, Math.min(w, h) * 0.3, top, d / 2, 0, cy, 24);
      cbox(g, M.dark, 0.003, 0.014, 0.002, 0, cy + Math.min(w, h) * 0.17, d / 2 + 0.0005); // Markierung am Knopf
      leds.push(ring(g, M.dark, Math.min(w, h) * 0.34, 0.0018, 0, cy, top + 0.001));
      break;
    }
    case "tech_button": {
      const top = frame(g, M, w, h, d);
      disc(g, M.white, Math.min(w, h) * 0.26, 0.006, 0, cy, top + 0.003, 24);
      dot(g, M, w * 0.34, h * 0.4, top, leds);
      break;
    }
    case "tech_blind_switch": {
      const top = frame(g, M, w, h, d);
      for (const s of [1, -1]) {
        rocker(g, M, w * 0.62, h * 0.34, top, 0, cy + s * h * 0.2, 0.004, s * 0.1);
        arrow(g, M.dark, 0.012, 0, cy + s * h * 0.2, top + 0.0045, s > 0);
      }
      dot(g, M, w * 0.4, cy, top, leds);
      break;
    }
    case "tech_network_outlet": {
      const top = frame(g, M, w, h, d);
      for (const sx of [-1, 1]) {
        cbox(g, M.dark, 0.022, 0.018, 0.002, sx * 0.016, cy + 0.006, top + 0.001);
        cbox(g, M.metal, 0.014, 0.003, 0.002, sx * 0.016, cy + 0.003, top + 0.0021);
      }
      cbox(g, M.white, 0.05, 0.008, 0.002, 0, cy - 0.022, top + 0.001); // Beschriftungsfeld
      dot(g, M, w * 0.34, h * 0.4, top, leds, 0.006);
      break;
    }
    case "tech_antenna_outlet": {
      const top = frame(g, M, w, h, d);
      // SAT (größer) oben, TV und Radio darunter: Koax-Anschlüsse
      disc(g, M.metal, 0.009, 0.004, 0, cy + 0.016, top + 0.002, 12);
      disc(g, M.dark, 0.0035, 0.005, 0, cy + 0.016, top + 0.0025, 8);
      for (const sx of [-1, 1]) {
        disc(g, M.metal, 0.0065, 0.004, sx * 0.017, cy - 0.016, top + 0.002, 12);
        disc(g, M.dark, 0.0025, 0.005, sx * 0.017, cy - 0.016, top + 0.0025, 8);
      }
      dot(g, M, w * 0.34, h * 0.4, top, leds, 0.006);
      break;
    }
    case "tech_motion_sensor": {
      // Wandmelder: Gehäuse mit Kuppel (Linse) und Schwenkfuß
      cbox(g, M.white, w * 0.6, h * 0.5, d * 0.35, 0, h * 0.28, -d / 2 + d * 0.175);
      cbox(g, M.white, w, h * 0.62, d * 0.62, 0, h * 0.62, -d / 2 + d * 0.5);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, h) * 0.34, 18, 12), x.cream);
      dome.scale.z = 0.75;
      dome.position.set(0, h * 0.62, d / 2 - Math.min(w, h) * 0.3);
      g.add(dome);
      ring(g, M.dark, Math.min(w, h) * 0.35, 0.0025, 0, h * 0.62, d / 2 - 0.02);
      dot(g, M, w * 0.3, h * 0.2, d / 2 - 0.02, leds, 0.007);
      break;
    }
    case "tech_smart_switch": {
      const top = frame(g, M, w, h, d);
      const k = w * 0.4;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        rocker(g, M, k, k, top, sx * w * 0.22, cy + sy * h * 0.22, 0.003, 0);
        // LED unter jeder Taste
        leds.push(cbox(g, M.dark, k * 0.5, 0.0025, 0.002, sx * w * 0.22, cy + sy * h * 0.22 - k * 0.38, top + 0.0045));
      }
      break;
    }
    case "tech_thermostat": {
      const top = frame(g, M, w, h, d);
      cbox(g, M.screen, w * 0.58, h * 0.3, 0.002, 0, cy + h * 0.14, top + 0.001);
      for (const sx of [-1, 1]) disc(g, M.dark, 0.007, 0.004, sx * w * 0.18, cy - h * 0.24, top + 0.002, 12);
      dot(g, M, w * 0.34, h * 0.4, top, leds, 0.006);
      break;
    }
    case "tech_smoke_detector": {
      // an der Decke: Sockel oben, Kuppel mit Schlitzen darunter, Prüftaste und LED unten
      const r = Math.min(w, d) / 2;
      const y = (v) => h * v;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y(0.4), 28), M.white);
      base.position.y = y(0.8);
      g.add(base);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.96, y(0.6), 28), M.white);
      cap.position.y = y(0.3);
      g.add(cap);
      for (const k of [0.45, 0.7, 0.92]) {
        const sl = new THREE.Mesh(new THREE.TorusGeometry(r * k, 0.0012, 4, 28), M.dark);
        sl.rotation.x = HALF_PI;
        sl.position.y = 0.0005;
        g.add(sl);
      }
      const test = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.004, 14), M.light);
      test.position.y = 0.002;
      g.add(test);
      leds.push(cbox(g, M.dark, 0.007, 0.002, 0.007, r * 0.55, 0.0008, 0));
      break;
    }
    case "tech_doorbell": {
      // Außenstelle: Metallblende, Lautsprecher-Schlitze, Kamera, Klingeltaste mit Leuchtring, Namensschild
      cbox(g, x.steel, w, h, d * 0.85, 0, cy, -d / 2 + d * 0.425);
      cbox(g, M.dark, w * 0.86, h * 0.86, 0.002, 0, cy, d / 2 - d * 0.075 + 0.001);
      for (let i = 0; i < 4; i++) cbox(g, x.steel, w * 0.5, 0.0025, 0.002, 0, cy + h * 0.38 - i * 0.008, d / 2 - d * 0.075 + 0.002);
      disc(g, M.glass, 0.0095, 0.004, 0, cy + h * 0.18, d / 2 - d * 0.075 + 0.003, 14); // Kamera
      disc(g, M.dark, 0.006, 0.004, 0, cy + h * 0.18, d / 2 - d * 0.075 + 0.0035, 12);
      disc(g, M.white, 0.011, 0.004, 0, cy - h * 0.05, d / 2 - d * 0.075 + 0.003, 18);
      leds.push(ring(g, M.dark, 0.0145, 0.0016, 0, cy - h * 0.05, d / 2 - d * 0.075 + 0.0025));
      cbox(g, M.white, w * 0.7, h * 0.12, 0.002, 0, cy - h * 0.3, d / 2 - d * 0.075 + 0.001);
      break;
    }
    default:
      return false;
  }
  stateLeds(g, M, leds);
  return true;
}
