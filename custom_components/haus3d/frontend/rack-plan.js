// Schrank bestücken – reine Planung (ohne Three.js und DOM, mit node testbar): welche Teile an eine freie Höheneinheit (HE) passen,
// Umordnen (eine HE hoch/runter, Ziehen mit Tausch), Vorlagen, Lücken mit Blenden füllen, Ausbauen. Die Rechnung der Lage steht in
// rack.js, das Nachführen der Lage nach jeder Änderung in follow-rack.js: hier werden nur Wunsch-HE (rack_u) gesetzt.

import { RACK_DESK, RACK_HE } from "./catalog-tech.js";
import { cabinetInfo, cabinetLayout, deviceDims, fitsCabinet, heOf, markSlot, newOccupancy, rackPose, slotFree, unrackPose } from "./rack.js";

/** Teile ohne Funktion für die Technik: Blenden, Bürstenleiste, Kabelführung (im Editor eigene Gruppe, in der Leiste schraffiert). */
export const PASSIVE = ["tech_blank_panel", "tech_blank_panel_2u", "tech_cable_mgmt", "tech_brush_panel"];
const PASSIVE_SET = new Set(PASSIVE);

/** Ist das Teil eine Blende, Bürstenleiste oder Kabelführung? */
export const isPassive = (m) => !!m && PASSIVE_SET.has(m.type);

/** Blenden zum Füllen von Lücken (2 HE und 1 HE). */
const BLANK = { 2: "tech_blank_panel_2u", 1: "tech_blank_panel" };

/** Vorlagen: bottom = von unten nach oben ab HE 1, top = von oben nach unten ab der obersten HE des Schranks. */
export const RACK_TEMPLATES = {
  heimnetz: {
    name: "Heimnetz klein",
    bottom: ["tech_ups_2u", "tech_wifi_router"],
    top: ["tech_patch_panel", "tech_cable_mgmt", "tech_switch_24"],
  },
  homelab: {
    name: "Homelab",
    bottom: ["tech_ups_2u", "tech_nas_rack", "tech_srv_1u", "tech_srv_1u"],
    top: ["tech_switch_24", "tech_cable_mgmt"],
  },
};

/** Anzahl Teile und Höheneinheiten einer Vorlage: {count, he}. */
export function templateStats(key) {
  const t = RACK_TEMPLATES[key];
  const all = t ? [...t.bottom, ...t.top] : [];
  return { count: all.length, he: all.reduce((n, type) => n + heOf({ type }), 0) };
}

/**
 * Lage für ein Teil der Höhe he, das die HE u überdecken soll: zuerst Start s = u, dann abwärts bis s = u − he + 1 (erste freie
 * Lage). Null, wenn keine Lage frei ist.
 */
export function slotAt(occ, units, u, he) {
  for (let s = u; s > u - he; s--) if (slotFree(occ, units, s, he)) return s;
  return null;
}

/** Freie Lücke um die HE u: [unterste, oberste] freie HE, oder null, wenn u belegt ist (oder außerhalb liegt). */
export function gapAt(occ, units, u) {
  if (!slotFree(occ, units, u, 1)) return null;
  let a = u;
  let b = u;
  while (a > 1 && !occ[a - 1]) a--;
  while (b < units && !occ[b + 1]) b++;
  return [a, b];
}

/** Alle freien Lücken von unten nach oben: [[a, b], …]. */
export function gaps(occ, units) {
  const out = [];
  for (let u = 1; u <= units; u++) {
    if (occ[u]) continue;
    const g = gapAt(occ, units, u);
    out.push(g);
    u = g[1];
  }
  return out;
}

/**
 * Teile, die an die freie HE u passen. Gruppen: unit (19-Zoll-Geräte), passive (Blenden, Bürstenleiste, Kabelführung), desk
 * (Tischgeräte auf Fachboden), je [{type, he, at}] mit at = Start der Lage (deckt u ab); hidden = Zahl der Teile, die nicht passen
 * (zu breit, zu tief oder zu hoch für die Lücke); gap = [von, bis] der Lücke um u (null, wenn u belegt ist).
 */
export function rackCandidates(floor, cab, u) {
  const info = cabinetInfo(floor, cab);
  const out = { gap: gapAt(info.occ, info.units, u), unit: [], passive: [], desk: [], hidden: 0 };
  const groups = [
    ["unit", Object.keys(RACK_HE).filter((t) => !PASSIVE_SET.has(t))],
    ["passive", PASSIVE],
    ["desk", RACK_DESK],
  ];
  for (const [key, types] of groups) {
    for (const type of types) {
      const he = heOf({ type });
      const at = fitsCabinet(cab, { type }) === "" && out.gap ? slotAt(info.occ, info.units, u, he) : null;
      if (at === null) out.hidden++;
      else out[key].push({ type, he, at });
    }
  }
  return out;
}

/** Neues Möbelstück als eingebautes Gerät auf der HE u (Lage aus dem Schrank; followRack bestätigt sie). */
export function newRackItem(cab, type, u, id) {
  const dev = { type };
  const { w, d, h } = deviceDims(dev);
  return { id, type, w, d, h, variant: null, entity: null, in_rack: cab.id, rack_u: u, ...rackPose(cab, dev, u) };
}

/** Belegung des Schranks ohne das Gerät id (und ohne weitere ausgenommene IDs). */
function occWithout(info, units, ...skip) {
  const occ = newOccupancy(units);
  for (const d of info.devices) if (!skip.includes(d.id)) markSlot(occ, d.u, d.he, d.id);
  return occ;
}

/** Tausch zweier Geräte, die direkt aufeinander folgen: a und b tauschen die Reihenfolge innerhalb ihrer gemeinsamen Spanne. */
function swapAdjacent(a, b) {
  const lower = a.u < b.u ? a : b;
  const upper = lower === a ? b : a;
  const moves = new Map([[upper.id, lower.u], [lower.id, lower.u + upper.he]]);
  return [{ id: a.id, u: moves.get(a.id) }, { id: b.id, u: moves.get(b.id) }];
}

/**
 * Gerät id um eine HE nach oben (dir = +1) oder unten (dir = −1). Ist die Nachbar-HE frei, rückt es um 1; gehört sie zu einem
 * Gerät, tauschen beide die Reihenfolge. Null am Rand oder wenn nichts möglich ist. Ergebnis: [{id, u}, …].
 */
export function stepTarget(floor, cab, id, dir) {
  const info = cabinetInfo(floor, cab);
  const a = info.devices.find((d) => d.id === id);
  if (!a || (dir !== 1 && dir !== -1)) return null;
  const occ = occWithout(info, info.units, id);
  const next = dir > 0 ? a.u + a.he : a.u - 1;
  if (next < 1 || next > info.units) return null;
  const otherId = occ[next];
  if (!otherId) return [{ id, u: a.u + dir }];
  const b = info.devices.find((d) => d.id === otherId);
  return b ? swapAdjacent(a, b) : null;
}

/**
 * Gerät id auf die HE u ablegen (u = unterste HE der neuen Lage). Frei → verschieben; überdeckt die neue Lage genau ein anderes
 * Gerät → tauschen (bei direkt aufeinander folgenden Geräten die Reihenfolge, sonst die Unterkanten); sonst null. Die neuen Lagen
 * müssen frei und disjunkt sein. Ergebnis: [{id, u}, …] oder null (auch wenn nichts zu tun ist).
 */
export function dropTarget(floor, cab, id, u) {
  const info = cabinetInfo(floor, cab);
  const a = info.devices.find((d) => d.id === id);
  if (!a || !Number.isFinite(u) || u === a.u) return null;
  const free = occWithout(info, info.units, id);
  if (slotFree(free, info.units, u, a.he)) return [{ id, u }];
  if (u < 1 || u + a.he - 1 > info.units) return null;
  const covered = new Set();
  for (let k = u; k < u + a.he; k++) if (free[k]) covered.add(free[k]);
  if (covered.size !== 1) return null;
  const b = info.devices.find((d) => d.id === [...covered][0]);
  if (!b) return null;
  const adjacent = a.u + a.he === b.u || b.u + b.he === a.u;
  const moves = adjacent ? swapAdjacent(a, b) : [{ id: a.id, u: b.u }, { id: b.id, u: a.u }];
  // beide neuen Lagen müssen frei (ohne a und b) und disjunkt sein
  const rest = occWithout(info, info.units, a.id, b.id);
  const [ma, mb] = moves.map((mv) => ({ u: mv.u, he: mv.id === a.id ? a.he : b.he }));
  if (!slotFree(rest, info.units, ma.u, ma.he) || !slotFree(rest, info.units, mb.u, mb.he)) return null;
  if (ma.u < mb.u + mb.he && mb.u < ma.u + ma.he) return null;
  return moves;
}

/** Wunsch-HE (rack_u) der Geräte auf der Etage setzen; die Lage rechnet followRack nach. */
export function applyMoves(floor, moves) {
  for (const mv of moves ?? []) {
    const d = (floor?.furniture ?? []).find((m) => m.id === mv.id);
    if (d) d.rack_u = mv.u;
  }
  return floor;
}

/** Plan einer Vorlage für den Schrank: {items: [{type, u}, …]} (unten beginnend, dann von oben nach unten) oder {error}. */
export function templatePlan(cab, key) {
  const t = RACK_TEMPLATES[key];
  if (!t) return { error: "unbekannt" };
  const { units } = cabinetLayout(cab);
  const types = [...t.bottom, ...t.top];
  for (const type of types) {
    const why = fitsCabinet(cab, { type });
    if (why) return { error: why };
  }
  const total = types.reduce((n, type) => n + heOf({ type }), 0);
  if (total > units) return { error: "zu wenig HE" };
  const items = [];
  let u = 1;
  for (const type of t.bottom) {
    items.push({ type, u });
    u += heOf({ type });
  }
  let top = units;
  for (const type of t.top) {
    top -= heOf({ type });
    items.push({ type, u: top + 1 });
  }
  return { items };
}

/** Wie templatePlan, zusätzlich {error: "nicht leer"}, wenn schon Geräte im Schrank sitzen. */
export function templateCheck(floor, cab, key) {
  if ((floor?.furniture ?? []).some((d) => d.in_rack === cab.id)) return { error: "nicht leer" };
  return templatePlan(cab, key);
}

/** Lücken mit Blenden füllen: je Lücke von unten 2-HE-Blenden, ein Rest von 1 HE bekommt eine 1-HE-Blende. [{type, u}, …] */
export function gapFill(floor, cab) {
  if (fitsCabinet(cab, { type: BLANK[1] }) !== "") return [];
  const info = cabinetInfo(floor, cab);
  const items = [];
  for (const [a, b] of gaps(info.occ, info.units)) {
    let u = a;
    while (u <= b) {
      const he = b - u + 1 >= 2 ? 2 : 1;
      items.push({ type: BLANK[he], u });
      u += he;
    }
  }
  return items;
}

/** Gerät ausbauen: vor den Schrank stellen (gleiche Drehung), Einbau-Felder weg. Gibt das Gerät zurück. */
export function unrackItem(item, cab) {
  if (cab) Object.assign(item, unrackPose(cab, item));
  delete item.in_rack;
  delete item.rack_u;
  delete item.mount_y;
  return item;
}
