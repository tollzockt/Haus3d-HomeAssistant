// Netzwerk- und Serverschrank (network_cabinet, server_rack): Sockel mit Füßen, Deckel, Seitenwände, Rückwand, vordere Rahmenpfosten,
// 19-Zoll-Schienen mit Teilstrichen (jede dritte HE) und eine getönte Glastür (Gruppe "door", mit item.open === true offen), durch die
// man eingebaute Geräte sieht. Die Platzhalter-
// Einschübe mit LEDs (Aussehen älterer Häuser) kommen nur, wenn nichts eingebaut ist (item.rack_used fehlt); eingebaute Geräte sind
// eigene Möbelstücke (siehe rack.js, follow-rack.js).

import * as THREE from "./vendor/three.module.min.js";
import { box, cyl } from "./model-parts.js";
import { HE, cabinetLayout } from "./rack.js";

/** Öffnungswinkel der Tür (Bogenmaß, 100°). */
export const DOOR_OPEN = (100 * Math.PI) / 180;

// getöntes Glas je Material-Satz (an M gebunden)
const smoked = new WeakMap();
function smokedGlass(M) {
  let m = smoked.get(M);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: 0x1d2b33, transparent: true, opacity: 0.26, roughness: 0.15, metalness: 0.1, depthWrite: false });
    smoked.set(M, m);
  }
  return m;
}

/** Baut den Schrank in die Gruppe g (w, d, h aus dem Möbelstück, M: Materialien des Stils). */
export function buildCabinet(type, w, d, h, M, g, item = {}) {
  const { base, top, units } = cabinetLayout({ type, w, d, h });
  const inner = Math.max(0.05, h - base - top);
  const railX = Math.min(0.2325, w / 2 - 0.05);
  const zFront = d / 2 - 0.04; // Vorderkante der Geräte

  // Sockel mit Füßen, Deckel
  box(g, M.dark, w, base - 0.03, d, 0, 0.03, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.metal, 0.025, 0.03, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 10);
  box(g, M.dark, w, top, d, 0, h - top, 0);
  if (type === "network_cabinet") for (const sx of [-1, 1]) cyl(g, M.metal, 0.04, 0.004, sx * w * 0.2, h, -d * 0.12, 18); // Lüfter im Dach

  // Seiten, Rückwand, Eckpfosten vorn
  for (const sx of [-1, 1]) {
    box(g, M.dark, 0.012, inner, d - 0.02, sx * (w / 2 - 0.006), base, 0);
    box(g, M.metal, 0.03, inner, 0.03, sx * (w / 2 - 0.015), base, d / 2 - 0.055);
    box(g, M.metal, 0.03, inner, 0.03, sx * (w / 2 - 0.015), base, -d / 2 + 0.015);
  }
  box(g, M.plasticDark, w - 0.03, inner, 0.01, 0, base, -d / 2 + 0.005);

  // 19-Zoll-Schienen vorn (und hinten bei tiefen Schränken) mit Teilstrichen
  const rails = d > 0.8 ? [zFront - 0.0075, -d / 2 + 0.11] : [zFront - 0.0075];
  for (const z of rails) {
    for (const sx of [-1, 1]) {
      box(g, M.metal, 0.02, units * HE, 0.015, sx * railX, base, z);
      for (let u = 0; u < units; u += 3) box(g, M.dark, 0.012, 0.004, 0.002, sx * railX, base + u * HE + 0.002, z + 0.0085);
    }
  }

  // Platzhalter nur im leeren Schrank (Patchfelder mit LEDs, wie bisher)
  if (!(Number(item.rack_used) > 0)) {
    const n = Math.max(2, Math.floor((h - 0.2) / 0.18));
    for (let i = 0; i < n; i++) {
      const y = 0.1 + i * ((h - 0.2) / n);
      box(g, M.metal, w * 0.8, 0.04, 0.02, 0, y + 0.03, d / 2 - 0.04);
      for (let k = 0; k < 4; k++) box(g, M.led, 0.015, 0.015, 0.01, -w * 0.3 + k * 0.05, y + 0.045, d / 2 - 0.025);
    }
  }

  // Glastür in einer Gruppe "door" (Scheibe, Rahmen, Griff), drehbar am linken Rahmen vorn (von vorn gesehen); mit item.open === true
  // schwenkt sie um 100° nach außen. Alle Teile noPick: im Editor-3D und im Panel trifft der Zeiger durch die Tür das eingebaute
  // Gerät dahinter (bzw. den Schrank), nicht die Tür.
  const dh = inner + 0.02;
  const dw = w - 0.03;
  const hinge = { x: -w / 2 + 0.015, z: d / 2 };
  const door = new THREE.Group();
  door.name = "door";
  door.position.set(hinge.x, 0, hinge.z);
  // Teile in Schrankkoordinaten angeben; die Gruppe sitzt am Drehpunkt, also wird dieser abgezogen
  const dbox = (mat, bw, bh, bd, x, y, z) => box(door, mat, bw, bh, bd, x - hinge.x, y, z - hinge.z);
  dbox(smokedGlass(M), dw - 0.02, dh - 0.04, 0.006, 0, base - 0.01 + 0.02, d / 2 - 0.003);
  for (const sx of [-1, 1]) dbox(M.dark, 0.02, dh, 0.012, sx * (dw / 2 - 0.01), base - 0.01, d / 2 - 0.006);
  for (const y of [base - 0.01, base + inner - 0.01]) dbox(M.dark, dw, 0.02, 0.012, 0, y, d / 2 - 0.006);
  dbox(M.metal, 0.02, Math.min(0.3, inner * 0.25), 0.02, w / 2 - 0.06, base + inner * 0.5 - 0.1, d / 2 - 0.008);
  door.traverse((o) => {
    if (o.isMesh) o.userData.noPick = true;
  });
  if (item?.open === true) door.rotation.y = -DOOR_OPEN;
  g.add(door);
  g.userData.door = door;
  return g;
}
