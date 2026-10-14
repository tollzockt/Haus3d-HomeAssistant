// Whirlpools: aufblasbar (rund, hot_tub) und eckig aus Acryl (garden_hot_tub_acryl), abgedeckt oder offen.
// Feld item.open: false/fehlt = abgedeckt (Standard), true = offen (Abdeckung zusammengeklappt an die Seite gelehnt, Wasser sichtbar).
// Ist eine Entität verknüpft, folgt die Darstellung ihr über g.userData.onState (ohne Neuaufbau, nur Sichtbarkeit und Material):
// cover → offen/zu (current_position > 0 = offen), Schalter/Heizung/Klima „an“ bzw. „heat“ = in Betrieb (Wasser heller, Blasen).

import { THREE, at, ballG, box, boxG, cyl, merged, palette, rng, tint } from "./garden-parts.js";

const ON = new Set(["on", "heat", "heat_cool", "auto"]);

/**
 * Darstellung aus dem Feld und dem Zustand einer verknüpften Entität: {open, running}.
 * open: Abdeckung offen? (cover bestimmt es, sonst das Feld item.open); running: in Betrieb (Schalter, Heizung, Klima an).
 */
export function tubView(item, stateObj) {
  let open = !!item?.open;
  let running = false;
  if (stateObj) {
    const s = String(stateObj.state ?? "");
    const domain = String(stateObj.entity_id ?? "").split(".")[0];
    const pos = Number(stateObj.attributes?.current_position);
    if (domain === "cover") {
      if (Number.isFinite(pos) && s !== "unavailable" && s !== "unknown") open = pos > 0;
      else if (s === "open" || s === "opening") open = true;
      else if (s === "closed" || s === "closing") open = false;
    } else running = ON.has(s) || stateObj.attributes?.hvac_action === "heating";
  }
  return { open, running };
}

/** Ausgeblendete Teile nicht anklicken (der Raycaster fragt visible sonst nicht ab). */
function pickable(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.raycast = function (rc, hits) {
      for (let p = this; p; p = p.parent) if (!p.visible) return;
      THREE.Mesh.prototype.raycast.call(this, rc, hits);
    };
  });
}

/** Wasser, Blasen und beide Abdeckungen verbinden: Zustand setzen (nur visible und Material, kein Neuaufbau). */
function wire(g, item, parts) {
  const { cover, coverOpen, water, bubbles, waterOff, waterOn } = parts;
  for (const o of [coverOpen, water, bubbles, cover]) pickable(o);
  const apply = (view) => {
    cover.visible = !view.open;
    coverOpen.visible = view.open;
    water.visible = view.open;
    water.material = view.running ? waterOn : waterOff;
    bubbles.visible = view.open && view.running;
    g.userData.tub.view = view;
  };
  g.userData.tub = { view: null, cover, coverOpen, water, bubbles, apply };
  apply(tubView(item, null));
  g.userData.onState = (stateObj) => apply(tubView(item, stateObj));
}

/** Wasser- und Blasenmaterial je Stil (ruhig und in Betrieb). */
function waterMats(M) {
  return {
    waterOff: tint(M, 0x4cc3d9, { transparent: true, opacity: 0.72, roughness: 0.05, metalness: 0.15, depthWrite: false }),
    waterOn: tint(M, 0x86e6f4, { transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.15, emissive: 0x2ab5c8, emissiveIntensity: 0.5, depthWrite: false }),
    foam: tint(M, 0xffffff, { transparent: true, opacity: 0.6, roughness: 0.1, depthWrite: false }),
  };
}

/** Blasen: kleine helle Kugeln knapp über der Wasserfläche, verteilt im Becken (rund: Radius rx, eckig: halbe Maße rx × rz). */
function bubbleGroup(M, mats, y, rx, rz, n, round) {
  const grp = new THREE.Group();
  grp.name = "tub:bubbles";
  const rand = rng(11);
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const k = round ? Math.sqrt(rand()) * 0.9 : 1;
    const x = round ? Math.cos(a) * rx * k : (rand() * 2 - 1) * rx * 0.9;
    const z = round ? Math.sin(a) * rx * k : (rand() * 2 - 1) * rz * 0.9;
    const r = 0.012 + rand() * 0.024;
    geos.push(ballG(r, x, y + r * 0.6 + rand() * 0.05, z, [1, 0.8, 1], 6));
  }
  merged(grp, mats.foam, geos);
  return grp;
}

/** Runder, aufblasbarer Pool: Wulstwand, Boden, Wasser, Abdeckung als Scheibe (zu) oder als halbe Scheibe angelehnt (offen). */
function inflatable(M, w, d, h, g, bulbs) {
  const P = palette(M);
  const r = Math.min(w, d) / 2;
  const tub = tint(M, 0xcfc6b4, { roughness: 0.6, side: THREE.DoubleSide });
  const wallH = h * 0.88;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, wallH, 40, 1, true), tub);
  wall.position.y = wallH / 2;
  g.add(wall);
  cyl(g, tub, r * 0.97, 0.03, 0, 0, 0, 40);
  // aufgeblasener Wulst oben und Gurtband in halber Höhe
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.07, 0.07, 10, 40), tub);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = wallH;
  g.add(rim);
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.02, 6, 40), M.cover);
  band.rotation.x = Math.PI / 2;
  band.position.y = h * 0.5;
  g.add(band);
  // Bedienteil auf dem Wulst mit Statusleuchte
  box(g, P.black, 0.16, 0.025, 0.09, 0, wallH + 0.06, r - 0.07);
  bulbs.push(box(g, M.bulb, 0.02, 0.012, 0.02, 0.05, wallH + 0.085, r - 0.07));
  // Wasser
  const mats = waterMats(M);
  const level = h * 0.62;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.1, r - 0.1, 0.02, 40), mats.waterOff);
  water.name = "tub:water";
  water.position.y = level;
  g.add(water);
  const bubbles = bubbleGroup(M, mats, level + 0.01, r - 0.2, r - 0.2, 16, true);
  g.add(bubbles);
  // Abdeckung zu: Scheibe auf dem Wulst mit Falzlinie und Griffen
  const cover = new THREE.Group();
  cover.name = "tub:cover";
  cyl(cover, M.cover, r * 0.99, h * 0.1, 0, h * 0.9, 0, 40);
  box(cover, P.black, 0.03, 0.012, r * 1.9, 0, h * 1.0, 0);
  box(cover, P.black, 0.18, 0.03, 0.04, -r * 0.5, h * 1.0, 0);
  box(cover, P.black, 0.18, 0.03, 0.04, r * 0.5, h * 1.0, 0);
  g.add(cover);
  // Abdeckung offen: zusammengeklappt, halbe Scheibe steht außen an der Seite (+x) und lehnt an der Wand
  const open = new THREE.Group();
  open.name = "tub:cover_open";
  const half = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.09, 28, 1, false, Math.PI, Math.PI), M.cover);
  half.rotation.z = -Math.PI / 2;
  open.add(half);
  box(open, P.black, 0.03, 0.14, 0.04, -0.06, r * 0.35, 0);
  open.position.set(r + 0.1, 0, 0);
  open.rotation.z = 0.13;
  g.add(open);
  return { cover, coverOpen: open, water, bubbles, ...mats };
}

/** Eckiger Acryl-Whirlpool: Verkleidung, Acrylschale mit Sitzen und Kopfstützen, Wasser, Abdeckung (zu: Platte, offen: zusammengeklappt). */
function acrylic(M, w, d, h, g, bulbs) {
  const P = palette(M);
  const mats = waterMats(M);
  const t = 0.08; // Verkleidung
  const s = 0.09; // Schalenwand
  const rimT = 0.17;
  const yTop = h * 0.84; // Oberkante Verkleidung
  const yRim = h * 0.88; // Oberkante Rand
  const ow = w - 2 * rimT;
  const od = d - 2 * rimT;
  // Sockel und Verkleidung (vier Wände), innen die weiße Schale
  box(g, P.black, w - 0.06, 0.06, d - 0.06, 0, 0, 0);
  box(g, P.woodD, w, yTop - 0.06, t, 0, 0.06, d / 2 - t / 2);
  box(g, P.woodD, w, yTop - 0.06, t, 0, 0.06, -d / 2 + t / 2);
  box(g, P.woodD, t, yTop - 0.06, d - 2 * t, w / 2 - t / 2, 0.06, 0);
  box(g, P.woodD, t, yTop - 0.06, d - 2 * t, -w / 2 + t / 2, 0.06, 0);
  box(g, M.white, w - 2 * t, yTop - 0.06, s, 0, 0.06, d / 2 - t - s / 2);
  box(g, M.white, w - 2 * t, yTop - 0.06, s, 0, 0.06, -d / 2 + t + s / 2);
  box(g, M.white, s, yTop - 0.06, d - 2 * (t + s), w / 2 - t - s / 2, 0.06, 0);
  box(g, M.white, s, yTop - 0.06, d - 2 * (t + s), -w / 2 + t + s / 2, 0.06, 0);
  box(g, M.white, ow, 0.04, od, 0, 0.06, 0);
  // Rand aus Acryl
  box(g, M.white, w, yRim - yTop, rimT, 0, yTop, d / 2 - rimT / 2);
  box(g, M.white, w, yRim - yTop, rimT, 0, yTop, -d / 2 + rimT / 2);
  box(g, M.white, rimT, yRim - yTop, d - 2 * rimT, w / 2 - rimT / 2, yTop, 0);
  box(g, M.white, rimT, yRim - yTop, d - 2 * rimT, -w / 2 + rimT / 2, yTop, 0);
  // Sitzschalen: Bank an der Rückseite und links, Liegesitz rechts; Kopfstützen auf Wasserhöhe
  const seatTop = h * 0.5;
  box(g, M.white, ow, seatTop - 0.1, 0.42, 0, 0.1, -od / 2 + 0.21);
  box(g, M.white, 0.42, seatTop - 0.1, od - 0.42, -ow / 2 + 0.21, 0.1, 0.21);
  box(g, M.white, 0.5, seatTop * 0.62, od * 0.55, ow / 2 - 0.25, 0.1, od / 2 - od * 0.275 - 0.01);
  const cushions = [];
  for (const x of [-0.5, 0, 0.5]) cushions.push(boxG(0.3, 0.12, 0.09, x * ow * 0.6, h * 0.74, -od / 2 + 0.06));
  for (const z of [-0.2, 0.3]) cushions.push(boxG(0.09, 0.12, 0.3, -ow / 2 + 0.06, h * 0.74, z * od));
  merged(g, P.cushionD, cushions);
  // Düsen als kleine Scheiben an den Innenwänden
  const jets = [];
  for (const x of [-0.6, -0.2, 0.2, 0.6]) jets.push(at(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), [x * ow * 0.5, h * 0.4, -od / 2 + 0.01], [Math.PI / 2, 0, 0]));
  for (const z of [-0.3, 0.1]) jets.push(at(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), [-ow / 2 + 0.01, h * 0.4, z * od], [0, 0, Math.PI / 2]));
  merged(g, P.steel, jets);
  // Wasser
  const level = h * 0.7;
  const water = new THREE.Mesh(new THREE.BoxGeometry(ow - 0.02, 0.02, od - 0.02), mats.waterOff);
  water.name = "tub:water";
  water.position.y = level;
  g.add(water);
  const bubbles = bubbleGroup(M, mats, level + 0.01, ow / 2, od / 2, 22, false);
  g.add(bubbles);
  // Bedienfeld am Rand vorn rechts mit Statusleuchte
  const pan = box(g, P.black, 0.22, 0.02, 0.1, w / 2 - 0.4, yRim, d / 2 - 0.09);
  pan.rotation.x = -0.15;
  bulbs.push(box(g, M.bulb, 0.025, 0.012, 0.02, w / 2 - 0.46, yRim + 0.015, d / 2 - 0.09));
  // Abdeckung zu: dicke Platte auf dem Rand, Falzlinie, Griffe, Gurte an den Seiten
  const coverT = Math.min(0.1, h * 0.12);
  const cover = new THREE.Group();
  cover.name = "tub:cover";
  box(cover, M.cover, w + 0.02, coverT, d + 0.02, 0, yRim, 0);
  box(cover, M.cover, w - 0.12, 0.02, d - 0.12, 0, yRim + coverT, 0);
  box(cover, P.black, 0.03, 0.012, d + 0.03, 0, yRim + coverT + 0.02, 0);
  for (const x of [-0.3, 0.3]) box(cover, P.black, 0.2, 0.03, 0.05, x * w, yRim + coverT + 0.02, d / 2 - 0.1);
  for (const [x, z] of [[-w / 2 - 0.012, -0.3], [-w / 2 - 0.012, 0.3], [w / 2 + 0.012, -0.3], [w / 2 + 0.012, 0.3]]) box(cover, P.black, 0.012, h * 0.3, 0.06, x, yRim - h * 0.3 + coverT, z * d);
  g.add(cover);
  // Abdeckung offen: in der Mitte gefaltet (zwei Platten übereinander), steht außen an der +x-Seite und lehnt an der Wand
  const open = new THREE.Group();
  open.name = "tub:cover_open";
  const leaf = w * 0.5;
  box(open, M.cover, 0.1, leaf, d, 0, 0, 0);
  box(open, M.cover, 0.1, leaf, d, 0.1, 0, 0);
  box(open, P.black, 0.012, 0.03, d * 0.9, -0.056, leaf * 0.55, 0);
  open.position.set(w / 2 + 0.12, 0, 0);
  open.rotation.z = 0.09;
  g.add(open);
  return { cover, coverOpen: open, water, bubbles, ...mats };
}

/** Baut den Whirlpool in die Gruppe g; false, wenn der Typ nicht dazugehört. */
export function buildTub(type, w, d, h, M, g, bulbs, item = {}) {
  if (type !== "hot_tub" && type !== "garden_hot_tub_acryl") return false;
  // Zustand aus dem Feld item.open, danach folgt die verknüpfte Entität (onState)
  wire(g, item, type === "hot_tub" ? inflatable(M, w, d, h, g, bulbs) : acrylic(M, w, d, h, g, bulbs));
  return true;
}
