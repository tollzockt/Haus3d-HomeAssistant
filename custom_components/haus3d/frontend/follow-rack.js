// Eingebaute Geräte (in_rack) ziehen mit ihrem Schrank mit (ohne DOM, mit node testbar; eingebunden über follow.js).
// Die Rechnung (Höheneinheiten, Lage) steht in rack.js; hier steht, was nach einer Änderung im Editor mit den Geräten
// geschieht:
//  - neues oder in einen Schrank gezogenes einbaubares Gerät → in die unterste freie Lücke (passt keine: bleibt frei); ein neues
//    Gerät mit Wunsch (in_rack, rack_u – HE-Leiste, Vorlage, Lücken füllen) kommt in diesen Schrank genau auf die Wunsch-HE, wenn frei;
//  - eingebautes Gerät aus der Schrankfläche gezogen → ausgebaut (landet es über einem anderen Schrank, zieht es dort ein);
//  - Schrank verschoben, gedreht, höher gesetzt → Geräte folgen (Lage, Drehung, mount_y);
//  - rack_u geändert → neue Lage; ist sie belegt, rückt das Gerät in die nächste freie Lücke;
//  - Schrank gelöscht oder kein Schrank mehr → ausgebaut, die Geräte bleiben stehen;
//  - eingebaute Geräte und Schränke mit Geräten stehen gerade: tilt/roll fallen weg.
// Der Schrank führt rack_used (belegte HE); es fehlt, wenn nichts eingebaut ist.

import { cabinetLayout, findSlot, fitsCabinet, heOf, inFootprint, isCabinet, isRackable, markSlot, newOccupancy, rackPose, slotFree } from "./rack.js";

const same = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= 0.0005;

/** Höheneinheit aus einem Feldwert (ganze Zahl) oder null. */
function toU(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Hat sich am Schrank etwas geändert, das die Lage der Geräte bestimmt? */
function cabinetChanged(p, c) {
  return !p || p.type !== c.type || ["x", "z", "rotation", "mount_y", "w", "d", "h"].some((k) => !same(p[k], c[k]));
}

/** Gerät ausbauen: Verweis weg, Höhe zurück auf den Standard; es bleibt, wo es ist. */
function release(d) {
  delete d.in_rack;
  delete d.rack_u;
  delete d.mount_y;
}

/**
 * Nach einer Änderung im Editor: before = Etage vorher, after = Etage nachher (wird hier angepasst).
 * Beide sind eigenständige Objekte; before bleibt unverändert.
 */
export function followRack(before, after) {
  const list = after?.furniture;
  if (!Array.isArray(list) || !list.length) return;
  const cabs = list.filter(isCabinet);
  if (!cabs.length && !list.some((m) => m.in_rack != null || m.rack_u != null || m.rack_used != null)) return;
  const prev = new Map((before?.furniture ?? []).map((m) => [m.id, m]));
  const byId = new Map(cabs.map((c) => [c.id, c]));
  const claimed = new Map(); // Schrank-ID → [{d, want, stable}] (in Listenreihenfolge)
  const seekers = []; // Geräte, die einen Schrank suchen: {d, want}

  const claim = (cabId, d, want, stable) => {
    if (!claimed.has(cabId)) claimed.set(cabId, []);
    claimed.get(cabId).push({ d, want, stable });
  };

  for (const d of list) {
    if (!isCabinet(d)) delete d.rack_used;
    if (!isRackable(d)) {
      // Typ geändert oder nie einbaubar: Reste der Einbau-Felder entfernen
      if (d.in_rack != null) delete d.mount_y;
      delete d.in_rack;
      delete d.rack_u;
      continue;
    }
    const p = prev.get(d.id);
    if (!p) {
      // neu gesetzt, kopiert oder eingefügt: ein alter Verweis gilt nicht, die Lage entscheidet (die HE bleibt Wunsch)
      const had = d.in_rack != null;
      const want = had ? toU(d.rack_u) : null;
      const prefer = had ? d.in_rack : null; // der gemeinte Schrank (HE-Leiste, Vorlage, Kopie) wird zuerst geprüft
      if (had) release(d);
      else delete d.rack_u;
      seekers.push({ d, want, prefer });
      continue;
    }
    const inId = d.in_rack ?? null;
    const wasId = p.in_rack ?? null;
    if (inId === null) {
      delete d.rack_u;
      // ausdrücklich ausgebaut (Knopf, Feld): bleibt frei; sonst zählt nur, wenn es bewegt wurde
      if (wasId === null && !(same(d.x, p.x) && same(d.z, p.z))) seekers.push({ d, want: null });
      continue;
    }
    const cab = byId.get(inId);
    if (!cab) {
      release(d); // Schrank gelöscht (oder kein Schrank mehr)
      continue;
    }
    if (wasId !== inId) {
      // neu über das Feld eingebaut (oder in einen anderen Schrank umgesetzt)
      if (fitsCabinet(cab, d) === "") claim(inId, d, toU(d.rack_u), false);
      else release(d);
      continue;
    }
    const moved = !(same(d.x, p.x) && same(d.z, p.z));
    if (moved && !cabinetChanged(prev.get(inId), cab) && !inFootprint(cab, d.x, d.z)) {
      release(d); // aus dem Schrank gezogen
      seekers.push({ d, want: null });
      continue;
    }
    if (fitsCabinet(cab, d) !== "") {
      release(d); // Schrank schmaler/flacher gemacht oder Gerät vergrößert: passt nicht mehr hinein
      continue;
    }
    const want = toU(d.rack_u);
    claim(inId, d, want, toU(p.rack_u) === want && heOf(p) === heOf(d));
  }

  // je Schrank: unveränderte Geräte behalten ihre HE, die übrigen rücken in die nächste freie Lücke
  const occByCab = new Map();
  for (const cab of cabs) {
    const L = cabinetLayout(cab);
    const occ = newOccupancy(L.units);
    const mine = claimed.get(cab.id) ?? [];
    const placed = new Set();
    for (const c of mine.filter((x) => x.stable && x.want !== null).sort((a, b) => a.want - b.want)) {
      const he = heOf(c.d);
      if (!slotFree(occ, L.units, c.want, he)) continue;
      markSlot(occ, c.want, he, c.d.id);
      c.d.rack_u = c.want;
      placed.add(c);
    }
    for (const c of mine) {
      if (placed.has(c)) continue;
      const u = findSlot(occ, L.units, heOf(c.d), c.want);
      if (u === null) {
        release(c.d); // keine Lücke mehr (Schrank verkleinert oder voll)
        continue;
      }
      markSlot(occ, u, heOf(c.d), c.d.id);
      c.d.rack_u = u;
    }
    occByCab.set(cab.id, occ);
  }

  // Geräte, die einen Schrank suchen: der Schrank unter der Gerätemitte (oberster zuerst), in dem eine Lücke passt; ein neues Gerät
  // mit Verweis (prefer) probiert zuerst diesen Schrank, sofern seine Grundfläche die Gerätemitte enthält – sonst bekäme bei
  // überlappenden Schränken immer der oberste das Gerät
  for (const { d, want, prefer } of seekers) {
    const order = [...cabs].reverse();
    const first = prefer != null ? byId.get(prefer) : null;
    if (first && inFootprint(first, d.x, d.z)) order.unshift(first);
    for (const cab of order) {
      if (!inFootprint(cab, d.x, d.z) || fitsCabinet(cab, d) !== "") continue;
      const L = cabinetLayout(cab);
      const occ = occByCab.get(cab.id);
      const he = heOf(d);
      const u = findSlot(occ, L.units, he, want);
      if (u === null) continue;
      markSlot(occ, u, he, d.id);
      d.in_rack = cab.id;
      d.rack_u = u;
      break;
    }
  }

  // Lage aller eingebauten Geräte aus dem Schrank ableiten, rack_used nachführen
  for (const cab of cabs) {
    let used = 0;
    for (const d of list) {
      if (d.in_rack !== cab.id || !isRackable(d)) continue;
      Object.assign(d, rackPose(cab, d, d.rack_u));
      delete d.tilt; // eingebaut steht das Gerät gerade im Schrank (pose.js: noPose) – ein alter Winkel käme beim Ausbauen sonst zurück
      delete d.roll;
      used += heOf(d);
    }
    if (used > 0) {
      cab.rack_used = used;
      delete cab.tilt; // Schrank mit Geräten bleibt aufrecht
      delete cab.roll;
    } else delete cab.rack_used;
  }
}
