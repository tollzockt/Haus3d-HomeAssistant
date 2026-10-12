// Lichtschacht vor Kellerfenstern: Betonschacht mit Gitterrost auf Geländehöhe (opening.well).
// Gebaut im Koordinatensystem der Öffnung (x entlang der Wand, y ab Brüstung, z = Wandnormale).

import * as THREE from "./vendor/three.module.min.js";

export const GROUND = 0.05; // Oberkante Gitterrost über dem Gelände (m)
const WALL = 0.06; // Wandstärke des Schachts

/**
 * Maße des Schachts im Öffnungs-System oder null, wenn das Fenster nicht unter dem Gelände liegt.
 * @param {{width: number, thick: number, outside: number, elev: number, sill: number, well: {depth?: number, width?: number|null}}} o
 */
export function wellBox({ width, thick, outside, elev, sill, well }) {
  if (!well) return null;
  const top = GROUND - (elev + sill); // Geländehöhe relativ zur Brüstung
  if (top < 0.1) return null; // Fenster liegt (fast) über dem Gelände: kein Schacht
  const depth = Math.min(2, Math.max(0.1, Number(well.depth) || 0.4));
  const w = Math.min(6, Math.max(0.2, Number(well.width) || width + 0.2));
  const z0 = outside * (thick / 2);
  return { w, depth, top, bottom: -0.2, z0, z1: z0 + outside * depth, outside };
}

/** 3D-Modell des Schachts (Gruppe) oder null. */
export function buildLightWell(o, M) {
  const b = wellBox(o);
  if (!b) return null;
  const g = new THREE.Group();
  g.userData.lightWell = true;
  const concrete = M.stoneLight ?? M.white;
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const h = b.top - b.bottom;
  const yc = b.bottom + h / 2;
  const zc = (b.z0 + b.z1) / 2;
  // Seitenwände und Vorderwand (zur Wand hin offen)
  for (const sx of [-1, 1]) add(WALL, h, b.depth, concrete, sx * (b.w / 2 - WALL / 2), yc, zc);
  add(b.w, h, WALL, concrete, 0, yc, b.z1 - b.outside * (WALL / 2));
  // Kies am Boden
  add(b.w - 2 * WALL, 0.04, b.depth - WALL, M.stone ?? concrete, 0, b.bottom + 0.02, zc - b.outside * (WALL / 2));
  // Gitterrost: Rahmen und Stäbe quer zur Wand
  const yt = b.top - 0.015;
  add(b.w, 0.03, 0.03, M.metal, 0, yt, b.z0 + b.outside * 0.015);
  add(b.w, 0.03, 0.03, M.metal, 0, yt, b.z1 - b.outside * 0.015);
  const bars = Math.max(4, Math.min(40, Math.round(b.w / 0.06)));
  for (let i = 0; i <= bars; i++) add(0.012, 0.03, b.depth, M.metal, -b.w / 2 + 0.01 + (i * (b.w - 0.02)) / bars, yt, zc);
  if (M.edge) g.traverse((m) => m.isMesh && m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), M.edge)));
  return g;
}
