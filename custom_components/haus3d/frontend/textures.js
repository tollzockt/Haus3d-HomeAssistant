// Texturen aus dem Canvas (keine Bilddateien, keine Normal-/Reliefkarten): hell und fein gemustert,
// damit die Farbe der Fläche sie tönt. Je Schlüssel einmal erzeugt; UVs der Flächen sind in Metern,
// repeat = 1 / Kachelgröße.

import * as THREE from "./vendor/three.module.min.js";
import { seeded } from "./exterior.js";
import { textureRotation } from "./model.js";

const N = 256;

/** Kachelgröße in Metern [Breite, Höhe] je Textur. */
const TILE = {
  plaster: [1.5, 1.5], brick: [1, 0.5], timber: [2.4, 2.6], stone: [1.2, 1.2], wood_v: [0.96, 1.5], wood_h: [1.5, 0.96], panel: [0.8, 1.5],
  concrete: [2, 1], tiles: [0.6, 0.6], tiles_large: [1.2, 1.2], parquet: [1.2, 1.2], carpet: [0.6, 0.6],
  concrete_polished: [2, 2], concrete_formwork: [2.4, 1.2], screed: [1.5, 1.5], epoxy_chips: [1, 1], concrete_slabs: [1.2, 1.2],
  roof_tiles: [1.2, 1.32], roof_slate: [0.8, 0.8], roof_metal: [1.5, 1.5], roof_shingle: [1, 1],
  grass: [1.5, 1.5], gravel: [1, 1], paving: [1, 1], slabs: [1.2, 1.2], deck: [1.2, 1.2], asphalt: [2, 2], soil: [1.2, 1.2],
};

function canvas() {
  const c = document.createElement("canvas");
  c.width = c.height = N;
  return [c, c.getContext("2d")];
}

/**
 * Grauwert-Rauschen (Körnung) über die ganze Fläche: Grund in base, darauf n Körner (Quadrate der Kantenlänge size
 * an zufälligen Teilpixel-Stellen, Grauwert base ± amount). Die Körner werden direkt in die Pixel geschrieben, mit
 * derselben anteiligen Deckung wie beim Zeichnen mit Kantenglättung – aber ohne je Korn ein fillRect samt eigenem
 * fillStyle (bis zu 20.000 Zeichenbefehle, auf schwachen Geräten ein Vielfaches an Zeit). Reihenfolge der
 * Zufallszahlen und Ergebnis (auf einen Grauwert genau) bleiben wie vorher.
 */
function grain(g, rnd, amount = 14, base = 236, n = 2600, size = 2) {
  const grey = new Uint8ClampedArray(N * N).fill(base); // rundet und begrenzt auf 0 … 255 wie ein Zeichenvorgang
  for (let i = 0; i < n; i++) {
    const v = (base + (rnd() - 0.5) * 2 * amount) | 0;
    const x0 = rnd() * N;
    const y0 = rnd() * N;
    const x1 = x0 + size;
    const y1 = y0 + size;
    const xa = Math.max(0, Math.floor(x0));
    const xb = Math.min(N, Math.ceil(x1));
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(N, Math.ceil(y1)); y++) {
      const cy = Math.min(y + 1, y1) - Math.max(y, y0); // Anteil der Pixelzeile, den das Korn deckt
      for (let x = xa; x < xb; x++) {
        const c = cy * (Math.min(x + 1, x1) - Math.max(x, x0));
        const k = y * N + x;
        grey[k] = grey[k] + (v - grey[k]) * c;
      }
    }
  }
  const img = g.createImageData(N, N);
  const px = img.data;
  for (let k = 0, o = 0; k < grey.length; k++, o += 4) {
    px[o] = px[o + 1] = px[o + 2] = grey[k];
    px[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

const shade = (g, v, a = 1) => (g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${a})`);

/** Reihen von Steinen/Brettern: rows × cols, versetzt, Fuge f (px), Tonwerte schwanken. */
function courses(g, rnd, { rows, cols, joint, mortar, base = 225, spread = 22, offset = 0.5, vertical = false }) {
  shade(g, mortar);
  g.fillRect(0, 0, N, N);
  const h = N / rows;
  const w = N / cols;
  for (let r = 0; r < rows; r++) {
    const shift = (r % 2) * offset * w;
    for (let k = -1; k <= cols; k++) {
      const v = base + (rnd() - 0.5) * 2 * spread;
      shade(g, v);
      const x = k * w + shift;
      if (vertical) g.fillRect(r * h + joint / 2, x + joint / 2, h - joint, w - joint);
      else g.fillRect(x + joint / 2, r * h + joint / 2, w - joint, h - joint);
    }
  }
}

const DRAW = {
  plaster: (g, rnd) => grain(g, rnd, 12, 238, 9000, 1.5),
  brick: (g, rnd) => {
    courses(g, rnd, { rows: 6, cols: 4, joint: 4, mortar: 250, base: 215, spread: 26 });
    grain_overlay(g, rnd, 0.06);
  },
  // Fachwerk: dunkle Balken (Schwelle, Riegel, Rähm, Ständer, Streben), helle Gefache; die Farbe tönt
  // vor allem die Gefache. Kachel 2,4 × 2,6 m: oben Rähm, unten Schwelle (Bild oben = Wand oben)
  timber: (g, rnd) => {
    grain(g, rnd, 8, 246, 6000, 1.5);
    const beam = (draw) => {
      g.save();
      g.fillStyle = "rgb(70,52,40)";
      draw();
      g.restore();
    };
    const b = 11; // Balkenbreite (≈ 11 cm)
    beam(() => {
      g.fillRect(0, 0, N, b); // Rähm
      g.fillRect(0, N - b, N, b); // Schwelle
      g.fillRect(0, N * 0.5 - b / 2, N, b); // Riegel
      for (const x of [0, N / 2]) g.fillRect(x, 0, b, N); // Ständer
      for (const x of [N / 4, (3 * N) / 4]) g.fillRect(x - b / 2, N * 0.5, b, N * 0.5); // Zwischenständer unten
      // Streben im unteren Feld, schräg
      g.lineWidth = b;
      g.strokeStyle = "rgb(70,52,40)";
      g.beginPath();
      g.moveTo(b, N - b);
      g.lineTo(N / 4, N * 0.5);
      g.moveTo(N / 2 + b, N * 0.5 + b / 2);
      g.lineTo((3 * N) / 4, N - b);
      g.stroke();
    });
    // Holzmaserung auf den Balken
    for (let i = 0; i < 400; i++) {
      shade(g, 40 + rnd() * 30, 0.35);
      const y = rnd() < 0.5 ? rnd() * b : N * 0.5 - b / 2 + rnd() * b;
      g.fillRect(rnd() * N, y, 10 + rnd() * 30, 1);
    }
  },
  stone: (g, rnd) => {
    shade(g, 200);
    g.fillRect(0, 0, N, N);
    for (let r = 0, y = 0; y < N; r++) {
      const h = 28 + rnd() * 26;
      for (let x = -rnd() * 40; x < N; ) {
        const w = 34 + rnd() * 60;
        shade(g, 205 + (rnd() - 0.5) * 70);
        g.fillRect(x + 2, y + 2, w - 4, Math.min(h, N - y) - 4);
        x += w;
      }
      y += h;
    }
    grain_overlay(g, rnd, 0.08);
  },
  wood_v: (g, rnd) => boards(g, rnd, 8, true),
  wood_h: (g, rnd) => boards(g, rnd, 8, false),
  panel: (g, rnd) => {
    grain(g, rnd, 6, 232, 3000, 1);
    for (let k = 0; k < 8; k++) {
      shade(g, 170, 0.9);
      g.fillRect(k * 32, 0, 3, N);
      shade(g, 252, 0.7);
      g.fillRect(k * 32 + 3, 0, 2, N);
    }
  },
  concrete: (g, rnd) => {
    grain(g, rnd, 16, 228, 9000, 2);
    shade(g, 185, 0.8);
    g.fillRect(0, N / 2 - 1, N, 2);
    g.fillRect(N / 2 - 1, 0, 2, N);
    for (const [x, y] of [[32, 64], [96, 64], [160, 64], [224, 64], [32, 192], [96, 192], [160, 192], [224, 192]]) {
      shade(g, 175);
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  // Beton geschliffen: glatt, leicht wolkig, feine Körnung (angeschliffene Zuschläge)
  concrete_polished: (g, rnd) => {
    shade(g, 228);
    g.fillRect(0, 0, N, N);
    clouds(g, rnd, 46, 22, 80, 0.22);
    for (let i = 0; i < 2200; i++) {
      shade(g, 165 + rnd() * 90, 0.2 + rnd() * 0.3);
      const s = 0.8 + rnd() * 1.4;
      g.fillRect(rnd() * N, rnd() * N, s, s);
    }
    grain_overlay(g, rnd, 0.03);
  },
  // Sichtbeton: Schaltafel 2,4 × 1,2 m (Fugen an den Kachelrändern), schwach sichtbare Bretter, Ankerlöcher,
  // einzelne Poren. Bild oben = Wand oben
  concrete_formwork: (g, rnd) => {
    shade(g, 222);
    g.fillRect(0, 0, N, N);
    clouds(g, rnd, 26, 18, 60, 0.16);
    const bh = N / 8; // Bretter je 15 cm
    for (let r = 0; r < 8; r++) {
      shade(g, rnd() < 0.5 ? 255 : 150, 0.05 + rnd() * 0.06);
      g.fillRect(0, r * bh, N, bh);
      for (let i = 0; i < 18; i++) {
        shade(g, 170 + rnd() * 40, 0.12);
        g.fillRect(rnd() * N, r * bh + 2 + rnd() * (bh - 4), 20 + rnd() * 60, 1);
      }
      shade(g, 160, 0.35);
      g.fillRect(0, r * bh, N, 1);
    }
    for (let i = 0; i < 70; i++) {
      shade(g, 140 + rnd() * 40, 0.35);
      g.beginPath();
      g.ellipse(rnd() * N, rnd() * N, 0.5 + rnd() * 0.6, 1 + rnd() * 1.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Fugen der Tafel: links und oben je 2 px (die Nachbarkachel setzt die Fuge fort)
    shade(g, 140, 0.8);
    g.fillRect(0, 0, 2, N);
    g.fillRect(0, 0, N, 2);
    // Ankerlöcher: 3 × 2 Raster, Konus von etwa 5 cm mit dunklem Loch (Kachel doppelt so breit wie hoch: im
    // Bild als Ellipse, auf der Wand rund)
    for (const x of [N / 6, N / 2, (5 * N) / 6]) {
      for (const y of [N / 4 + bh / 2, (3 * N) / 4 + bh / 2]) {
        shade(g, 175);
        g.beginPath();
        g.ellipse(x, y, 2.6, 5.2, 0, 0, Math.PI * 2);
        g.fill();
        shade(g, 95);
        g.beginPath();
        g.ellipse(x, y, 1.4, 2.8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  // Estrich: rau und grau, fleckig, Spuren der Glättkelle
  screed: (g, rnd) => {
    grain(g, rnd, 24, 214, 16000, 1.6);
    clouds(g, rnd, 40, 14, 55, 0.2, 0.4);
    g.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      const x = rnd() * N;
      const y = rnd() * N;
      const r = 26 + rnd() * 60;
      const a0 = rnd() * Math.PI * 2;
      const len = 0.6 + rnd() * 1.1;
      const lw = 4 + rnd() * 10;
      const v = rnd() < 0.6 ? 250 : 170;
      const al = 0.08 + rnd() * 0.08;
      wrap(x, y, r + lw, (px, py) => {
        g.strokeStyle = `rgba(${v},${v},${v},${al})`;
        g.lineWidth = lw;
        g.beginPath();
        g.arc(px, py, r, a0, a0 + len);
        g.stroke();
      });
    }
    grain_overlay(g, rnd, 0.06);
  },
  // Epoxid mit Chips (Garagenboden): glatter Grund mit bunten Flocken; die Bodenfarbe tönt alles
  epoxy_chips: (g, rnd) => {
    grain(g, rnd, 4, 232, 3000, 1.2);
    const chips = [[96, 98, 102], [160, 162, 166], [250, 250, 248], [222, 210, 190], [150, 164, 186], [196, 160, 140]];
    for (let i = 0; i < 1100; i++) {
      const [r, gg, b] = chips[Math.floor(rnd() * chips.length)];
      const x = rnd() * N;
      const y = rnd() * N;
      const s = 1 + rnd() * 2;
      const k = 3 + Math.floor(rnd() * 3);
      const a0 = rnd() * Math.PI * 2;
      g.fillStyle = `rgba(${r},${gg},${b},${0.75 + rnd() * 0.25})`;
      g.beginPath();
      for (let j = 0; j < k; j++) {
        const a = a0 + (j / k) * Math.PI * 2;
        const q = s * (0.6 + rnd() * 0.6);
        if (j) g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
        else g.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
      g.fill();
    }
  },
  // Betonplatten 60 × 60 cm mit schmalen Fugen (Kachel 1,2 m = 2 × 2 Platten)
  concrete_slabs: (g, rnd) => {
    shade(g, 150);
    g.fillRect(0, 0, N, N);
    const s = N / 2;
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 2; k++) {
        const x = k * s + 1;
        const y = r * s + 1;
        const w = s - 2;
        shade(g, 214 + (rnd() - 0.5) * 22);
        g.fillRect(x, y, w, w);
        g.save();
        g.beginPath();
        g.rect(x, y, w, w);
        g.clip();
        for (let i = 0; i < 7; i++) {
          const cx = x + rnd() * w;
          const cy = y + rnd() * w;
          const rr = 14 + rnd() * 40;
          const v = rnd() < 0.5 ? 250 : 140;
          const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
          grd.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
          grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
          g.fillStyle = grd;
          g.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr);
        }
        g.restore();
        // leichte Fase: oben/links hell, unten/rechts dunkel
        shade(g, 255, 0.35);
        g.fillRect(x, y, w, 1);
        g.fillRect(x, y, 1, w);
        shade(g, 110, 0.3);
        g.fillRect(x, y + w - 1, w, 1);
        g.fillRect(x + w - 1, y, 1, w);
      }
    }
    for (let i = 0; i < 4000; i++) {
      shade(g, rnd() < 0.5 ? 130 : 250, 0.12);
      g.fillRect(rnd() * N, rnd() * N, 1.3, 1.3);
    }
  },
  tiles: (g, rnd) => tilesGrid(g, rnd, 2),
  tiles_large: (g, rnd) => tilesGrid(g, rnd, 2),
  parquet: (g, rnd) => {
    courses(g, rnd, { rows: 6, cols: 2, joint: 2, mortar: 185, base: 222, spread: 20, offset: 0.37 });
    for (let i = 0; i < 160; i++) {
      shade(g, 200 + rnd() * 20, 0.35);
      g.fillRect(rnd() * N, rnd() * N, 18 + rnd() * 50, 1);
    }
  },
  carpet: (g, rnd) => grain(g, rnd, 22, 225, 16000, 1.2),
  roof_tiles: (g, rnd) => {
    // Pfannen: Reihen mit Schatten unten, gewölbte Helligkeit quer
    const rows = 4;
    const cols = 4;
    const h = N / rows;
    const w = N / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const base = 215 + (rnd() - 0.5) * 30;
        const grd = g.createLinearGradient(k * w, 0, (k + 1) * w, 0);
        grd.addColorStop(0, `rgb(${base - 30 | 0},${base - 30 | 0},${base - 30 | 0})`);
        grd.addColorStop(0.45, `rgb(${base + 22 | 0},${base + 22 | 0},${base + 22 | 0})`);
        grd.addColorStop(1, `rgb(${base - 20 | 0},${base - 20 | 0},${base - 20 | 0})`);
        g.fillStyle = grd;
        g.fillRect(k * w, r * h, w, h);
      }
      shade(g, 120, 0.55);
      g.fillRect(0, r * h + h - 7, N, 7);
    }
  },
  roof_slate: (g, rnd) => {
    courses(g, rnd, { rows: 8, cols: 6, joint: 3, mortar: 150, base: 215, spread: 28 });
  },
  roof_metal: (g, rnd) => {
    grain(g, rnd, 5, 230, 2000, 1);
    for (let k = 0; k < 3; k++) {
      shade(g, 255, 0.8);
      g.fillRect(k * (N / 3), 0, 3, N);
      shade(g, 175, 0.8);
      g.fillRect(k * (N / 3) + 3, 0, 3, N);
    }
  },
  roof_shingle: (g, rnd) => {
    courses(g, rnd, { rows: 8, cols: 3, joint: 3, mortar: 140, base: 210, spread: 18 });
    grain_overlay(g, rnd, 0.1);
  },
  grass: (g, rnd) => {
    grain(g, rnd, 10, 225, 0);
    for (let i = 0; i < 7000; i++) {
      shade(g, 175 + rnd() * 80, 0.8);
      g.fillRect(rnd() * N, rnd() * N, 1.3, 3 + rnd() * 4);
    }
  },
  gravel: (g, rnd) => {
    shade(g, 190);
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 2600; i++) {
      shade(g, 170 + rnd() * 85);
      g.beginPath();
      g.ellipse(rnd() * N, rnd() * N, 2 + rnd() * 3, 1.5 + rnd() * 2.5, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  paving: (g, rnd) => courses(g, rnd, { rows: 8, cols: 4, joint: 3, mortar: 165, base: 215, spread: 22 }),
  slabs: (g, rnd) => {
    courses(g, rnd, { rows: 3, cols: 3, joint: 3, mortar: 170, base: 228, spread: 10, offset: 0 });
    grain_overlay(g, rnd, 0.07);
  },
  deck: (g, rnd) => boards(g, rnd, 9, false),
  asphalt: (g, rnd) => grain(g, rnd, 30, 215, 20000, 1.6),
  soil: (g, rnd) => grain(g, rnd, 35, 205, 14000, 2.5),
};

function boards(g, rnd, n, vertical) {
  const w = N / n;
  for (let k = 0; k < n; k++) {
    const base = 222 + (rnd() - 0.5) * 34;
    shade(g, base);
    if (vertical) g.fillRect(k * w, 0, w, N);
    else g.fillRect(0, k * w, N, w);
    // Maserung
    for (let i = 0; i < 26; i++) {
      shade(g, base - 12 - rnd() * 18, 0.45);
      const p = k * w + 2 + rnd() * (w - 4);
      const q = rnd() * N;
      if (vertical) g.fillRect(p, q, 1, 20 + rnd() * 60);
      else g.fillRect(q, p, 20 + rnd() * 60, 1);
    }
    shade(g, 150, 0.9);
    if (vertical) g.fillRect(k * w, 0, 2, N);
    else g.fillRect(0, k * w, N, 2);
  }
}

function tilesGrid(g, rnd, joint) {
  courses(g, rnd, { rows: 2, cols: 2, joint: joint * 2, mortar: 200, base: 240, spread: 6, offset: 0 });
  grain_overlay(g, rnd, 0.04);
}

function grain_overlay(g, rnd, alpha) {
  const dark = `rgba(120,120,120,${alpha})`;
  const light = `rgba(255,255,255,${alpha})`;
  let cur = null;
  for (let i = 0; i < 5000; i++) {
    const c = rnd() < 0.5 ? dark : light;
    if (c !== cur) g.fillStyle = cur = c; // fillStyle nur bei Wechsel setzen (gleiches Bild, halb so viele Zuweisungen)
    g.fillRect(rnd() * N, rnd() * N, 1.5, 1.5);
  }
}

/** fn(x, y) an der Stelle und – wo Radius r über einen Rand reicht – an den gegenüberliegenden Stellen (nahtlos). */
function wrap(x, y, r, fn) {
  for (const dx of [-N, 0, N]) {
    for (const dy of [-N, 0, N]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r > 0 && px - r < N && py + r > 0 && py - r < N) fn(px, py);
    }
  }
}

/** Weiche Flecken (Verlauf nach außen), hell mit Anteil light, sonst dunkel; nahtlos über die Ränder. */
function clouds(g, rnd, n, rMin, rMax, alpha, light = 0.5) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = rMin + rnd() * (rMax - rMin);
    const v = rnd() < light ? 255 : 120;
    const a = alpha * (0.5 + rnd() * 0.5);
    wrap(x, y, r, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grd;
      g.fillRect(px - r, py - r, 2 * r, 2 * r);
    });
  }
}

/** Schlüssel aller Texturen, die getTexture zeichnen kann. */
export const TEXTURE_KEYS = Object.keys(DRAW);

const cache = new Map();

/**
 * Textur zu einem Schlüssel (oder null). Wird je Schlüssel einmal erzeugt und geteilt. rotation (Grad, im Plan im
 * Uhrzeigersinn um den Weltursprung): eigene Kopie je Drehung, ebenfalls geteilt; Bild und GPU-Textur bleiben
 * dieselben, die geteilte Textur ohne Drehung wird nie verändert.
 */
export function getTexture(key, renderer = null, rotation = 0) {
  if (!key || !DRAW[key]) return null;
  let t = cache.get(key);
  if (!t) {
    const [c, g] = canvas();
    DRAW[key](g, seeded(key));
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    const [w, h] = TILE[key] ?? [1, 1];
    t.repeat.set(1 / w, 1 / h);
    t.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
    cache.set(key, t);
  }
  const deg = textureRotation(rotation);
  if (!deg) return t;
  const k = `${key}@${deg}`;
  let r = cache.get(k);
  if (!r) {
    r = t.clone();
    // UVs der Flächen: u = x, v = −z (Meter, um den Ursprung); mit −Grad dreht das Muster im Plan (x nach
    // rechts, z nach unten) im Uhrzeigersinn wie die Möbel-Drehung
    r.rotation = (-deg * Math.PI) / 180;
    cache.set(k, r);
  }
  return r;
}

/**
 * UVs in Metern je Dreieck: waagerechte Flächen nach Grundriss (x, z), alle anderen entlang der
 * Fläche (u waagerecht, v die Fläche hinauf). Für Wände, Dächer, Giebel.
 */
export function planarUVs(geo) {
  const p = geo.getAttribute("position");
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const bt = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(v.subVectors(c, a)).normalize();
    const flat = Math.abs(n.y) > 0.92;
    if (!flat) {
      t.set(-n.z, 0, n.x).normalize();
      bt.crossVectors(n, t);
      if (bt.y < 0) bt.negate();
      // Wände: v genau die Höhe (Fugen waagerecht durchgehend über Ecken)
      if (Math.abs(n.y) < 0.05) bt.set(0, 1, 0);
    }
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, i + k);
      if (flat) {
        uv[(i + k) * 2] = v.x;
        uv[(i + k) * 2 + 1] = -v.z;
      } else {
        uv[(i + k) * 2] = v.dot(t);
        uv[(i + k) * 2 + 1] = v.dot(bt);
      }
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}
