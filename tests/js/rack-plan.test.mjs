// Schrank bestücken: Kandidaten für eine freie HE, Einbau auf genau die gewählte HE, Umordnen, Vorlagen, Lücken füllen, Ausbauen
import assert from "node:assert/strict";
import { test } from "node:test";

import { HE, RACK_DESK, RACK_HE, TECH_PACK } from "../../custom_components/haus3d/frontend/catalog-tech.js";
import { followMoves } from "../../custom_components/haus3d/frontend/follow.js";
import {
  PASSIVE,
  RACK_TEMPLATES,
  applyMoves,
  dropTarget,
  gapAt,
  gapFill,
  gaps,
  newRackItem,
  rackCandidates,
  slotAt,
  stepTarget,
  templateCheck,
  templatePlan,
  templateStats,
  unrackItem,
} from "../../custom_components/haus3d/frontend/rack-plan.js";
import { cabinetInfo, cabinetLayout, heOf, markSlot, newOccupancy, rackPose } from "../../custom_components/haus3d/frontend/rack.js";

let seq = 0;
const cab = (o = {}) => ({ id: `c${++seq}`, type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2, ...o });
const srvCab = (o = {}) => cab({ type: "server_rack", d: 1.0, h: 2.0, ...o });
/** Netzwerkschrank mit genau n HE (Sockel 0,12 m + Deckel 0,10 m). */
const cabN = (n, o = {}) => cab({ h: 0.22 + n * HE + 0.001, ...o });
const floorOf = (...furniture) => ({ id: "eg", furniture });
const get = (floor, id) => floor.furniture.find((m) => m.id === id);
const edit = (floor, fn) => {
  const after = structuredClone(floor);
  fn(after);
  return followMoves(floor, after);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const names = (list) => list.map((c) => c.type);
/** Gerät einbauen wie die HE-Leiste: neues Möbelstück mit Wunsch-HE, followMoves trifft die HE. */
const build = (floor, c, type, u) => {
  const item = newRackItem(c, type, u, `n${++seq}`);
  return { floor: edit(floor, (fl) => fl.furniture.push(item)), item };
};
const stack = (c, ...types) => {
  let f = floorOf(c);
  const ids = [];
  let u = 1;
  for (const t of types) {
    const r = build(f, c, t, u);
    f = r.floor;
    ids.push(r.item.id);
    u += heOf({ type: t });
  }
  return { f, ids };
};
const us = (f, ids) => ids.map((id) => get(f, id).rack_u);

test("slotAt: Start bei u, sonst abwärts bis u − he + 1, sonst null", () => {
  const occ = newOccupancy(10);
  assert.equal(slotAt(occ, 10, 5, 1), 5);
  assert.equal(slotAt(occ, 10, 5, 3), 5, "zuerst der Start bei u");
  markSlot(occ, 6, 5, "x"); // 6–10 belegt
  assert.equal(slotAt(occ, 10, 5, 2), 4, "5–6 geht nicht, 4–5 ja");
  assert.equal(slotAt(occ, 10, 5, 3), 3);
  markSlot(occ, 1, 3, "y"); // 1–3 belegt, frei: 4–5
  assert.equal(slotAt(occ, 10, 5, 2), 4);
  assert.equal(slotAt(occ, 10, 5, 3), null, "Lücke zu klein");
  assert.equal(slotAt(occ, 10, 5, 1), 5);
  assert.equal(slotAt(occ, 10, 4, 1), 4);
  assert.equal(slotAt(occ, 10, 9, 1), null, "belegt");
  // oberster Rand: Start unterhalb, damit das Teil in den Schrank passt
  const empty = newOccupancy(10);
  assert.equal(slotAt(empty, 10, 10, 2), 9);
  assert.equal(slotAt(empty, 10, 1, 2), 1);
  assert.equal(slotAt(empty, 10, 11, 1), null, "außerhalb");
});

test("Lücken: gapAt und gaps", () => {
  const occ = newOccupancy(10);
  markSlot(occ, 3, 2, "a");
  markSlot(occ, 8, 1, "b");
  assert.deepEqual(gapAt(occ, 10, 1), [1, 2]);
  assert.deepEqual(gapAt(occ, 10, 2), [1, 2]);
  assert.deepEqual(gapAt(occ, 10, 6), [5, 7]);
  assert.deepEqual(gapAt(occ, 10, 10), [9, 10]);
  assert.equal(gapAt(occ, 10, 3), null);
  assert.deepEqual(gaps(occ, 10), [[1, 2], [5, 7], [9, 10]]);
  assert.deepEqual(gaps(newOccupancy(4), 4), [[1, 4]]);
});

test("Kandidaten im Netzwerkschrank: nur was in Breite, Tiefe und Lücke passt, in drei Gruppen", () => {
  const c = cab();
  const f = floorOf(c);
  const r = rackCandidates(f, c, 9);
  assert.deepEqual(r.gap, [1, 22]);
  const all = [...r.unit, ...r.passive, ...r.desk];
  // zu tief für den Netzwerkschrank (nutzbar 0,53 m): Server 2 HE (0,65 m) und Server 4 HE (0,7 m)
  assert.ok(!names(all).includes("tech_srv_2u") && !names(all).includes("tech_srv_4u"));
  assert.ok(names(r.unit).includes("tech_srv_1u") && names(r.unit).includes("tech_switch_24") && names(r.unit).includes("tech_ups_2u"));
  // Gruppen
  assert.deepEqual(names(r.passive), PASSIVE);
  assert.ok(names(r.desk).includes("tech_wifi_router") && names(r.desk).includes("nas"));
  assert.ok(!names(r.desk).includes("tech_ap_ceiling"));
  assert.ok(r.unit.every((c2) => !PASSIVE.includes(c2.type)));
  // 19-Zoll-Typen + Tischgeräte = alles, was es gibt; hidden zählt den Rest
  const total = Object.keys(RACK_HE).length + RACK_DESK.length;
  assert.equal(all.length + r.hidden, total);
  assert.ok(r.hidden >= 2);
  // alles beginnt bei u, wo es passt
  for (const x of all) assert.ok(x.at <= 9 && x.at + x.he - 1 >= 9 && x.he === heOf({ type: x.type }), JSON.stringify(x));
  assert.ok(r.unit.find((x) => x.type === "tech_ups_2u").at === 9);
  // im Serverschrank passen auch die tiefen Geräte
  const s = srvCab();
  const rs = rackCandidates(floorOf(s), s, 9);
  assert.ok(names(rs.unit).includes("tech_srv_2u") && names(rs.unit).includes("tech_srv_4u"));
  assert.equal(rs.hidden, 0);
});

test("Kandidaten: Lücke begrenzt Höhe und Start, belegte HE und zu schmaler Schrank", () => {
  const c = cab();
  const { f, ids } = stack(c, "tech_srv_1u", "tech_srv_1u", "tech_srv_1u"); // 1–3
  // HE 5 frei, aber 4 frei und 3 belegt: Lücke 4–22
  const r = rackCandidates(f, c, 4);
  assert.deepEqual(r.gap, [4, 22]);
  assert.ok(r.unit.find((x) => x.type === "tech_ups_2u").at === 4);
  // belegte HE: keine Lücke, nichts passt
  const busy = rackCandidates(f, c, 2);
  assert.equal(busy.gap, null);
  assert.deepEqual([busy.unit.length, busy.passive.length, busy.desk.length], [0, 0, 0]);
  // kleine Lücke: HE 4–5 frei, 6 belegt → 2-HE-Geräte beginnen bei 4 oder 5? Start s = u zuerst: bei u = 5 passt 5–6 nicht, also 4
  const g = cab({ x: 9 });
  let f2 = floorOf(g);
  f2 = build(f2, g, "tech_srv_1u", 1).floor;
  f2 = build(f2, g, "tech_srv_1u", 6).floor;
  const r2 = rackCandidates(f2, g, 5);
  assert.deepEqual(r2.gap, [2, 5]);
  assert.equal(r2.unit.find((x) => x.type === "tech_ups_2u").at, 4);
  assert.equal(r2.desk.find((x) => x.type === "tech_wifi_router"), undefined, "5 HE hoch: die Lücke 2–5 hat nur 4");
  void ids;
});

test("Kandidaten: Tischgerät, das nicht in die Lücke passt, fehlt und zählt zu hidden", () => {
  const g = cabN(7);
  assert.equal(cabinetLayout(g).units, 7);
  let f = floorOf(g);
  f = build(f, g, "tech_srv_1u", 1).floor;
  f = build(f, g, "tech_srv_1u", 5).floor; // frei 2–4 und 6–7
  const r = rackCandidates(f, g, 3);
  assert.deepEqual(r.gap, [2, 4]);
  assert.ok(!names(r.desk).includes("tech_wifi_router"), "5 HE passen nicht in 3 HE");
  assert.ok(names(r.desk).includes("tech_switch_8"));
  assert.ok(r.hidden > 0);
  assert.ok(!names(r.unit).includes("tech_srv_4u"));
});

test("Einbau über die HE-Leiste: genau die gewählte HE, Lage aus dem Schrank, rack_used", () => {
  const c = cab();
  let f = floorOf(c);
  const r = build(f, c, "tech_switch_24", 9);
  f = r.floor;
  const d = get(f, r.item.id);
  assert.equal(d.in_rack, c.id);
  assert.equal(d.rack_u, 9);
  assert.ok(near(d.mount_y, 0.12 + 8 * HE));
  assert.ok(near(d.x, 5) && near(d.z, 5 + 0.3 - 0.04 - 0.14) && d.rotation === 0);
  assert.equal(get(f, c.id).rack_used, 1);
  // 2-HE-Gerät auf 15: 15–16
  const u2 = build(f, c, "tech_ups_2u", 15);
  assert.equal(get(u2.floor, u2.item.id).rack_u, 15);
  // Tischgerät mit Fachboden: mount_y mit Boden
  const w = build(u2.floor, c, "tech_wifi_router", 3);
  assert.equal(get(w.floor, w.item.id).rack_u, 3);
  assert.ok(near(get(w.floor, w.item.id).mount_y, 0.12 + 2 * HE + 0.01));
  assert.equal(get(w.floor, c.id).rack_used, 1 + 2 + 5);
  // newRackItem: Felder und Maße des Katalogs
  const it = newRackItem(c, "tech_switch_24", 9, "x1");
  assert.deepEqual([it.id, it.type, it.variant, it.entity, it.in_rack, it.rack_u], ["x1", "tech_switch_24", null, null, c.id, 9]);
  assert.deepEqual([it.w, it.d, it.h], TECH_PACK.items.tech_switch_24.slice(1));
  assert.deepEqual({ x: it.x, z: it.z, rotation: it.rotation, mount_y: it.mount_y }, rackPose(c, { type: "tech_switch_24" }, 9));
  // das vorhandene NAS hat eigene Maße
  const nas = newRackItem(c, "nas", 1, "x2");
  assert.deepEqual([nas.w, nas.d, nas.h], [0.22, 0.25, 0.25]);
});

test("Einbau auf einer HE unter einer belegten HE: ein 2-HE-Gerät rückt in der Lücke nach unten", () => {
  const c = cab();
  let f = floorOf(c);
  f = build(f, c, "tech_srv_1u", 10).floor; // belegt 10
  // HE 9 angetippt, 2-HE-USV: Start 9 (9–10) geht nicht, also 8–9
  const cand = rackCandidates(f, c, 9);
  const ups = cand.unit.find((x) => x.type === "tech_ups_2u");
  assert.equal(ups.at, 8);
  const r = build(f, c, "tech_ups_2u", ups.at);
  assert.equal(get(r.floor, r.item.id).rack_u, 8);
  assert.equal(get(r.floor, c.id).rack_used, 3);
});

test("Einbau neben bestehenden Geräten ändert deren HE nicht; belegte Wunsch-HE: nächste freie Lücke", () => {
  const c = cab();
  const { f, ids } = stack(c, "tech_srv_1u", "tech_ups_2u", "tech_switch_24");
  assert.deepEqual(us(f, ids), [1, 2, 4]);
  const r = build(f, c, "tech_srv_1u", 12);
  assert.deepEqual(us(r.floor, ids), [1, 2, 4], "unverändert");
  assert.equal(get(r.floor, r.item.id).rack_u, 12);
  // wenn die Wunsch-HE doch belegt ist (z. B. Zeitversatz), gilt die nächste freie
  const late = build(f, c, "tech_srv_1u", 2);
  assert.equal(get(late.floor, late.item.id).rack_u, 5, "HE 2–3 belegt, 1 und 4 auch: die nächste freie");
});

test("Überlappende Schränke: ein Gerät mit Verweis kommt in den gemeinten Schrank (prefer), nicht in den obersten", () => {
  const a = cab({ x: 5, z: 5 });
  const b = cab({ x: 5.2, z: 5.1 }); // steht später in der Liste, überlappt a
  let f = floorOf(a, b);
  // Gerätemitte liegt in beiden Grundflächen; gemeint ist a
  const itemA = newRackItem(a, "tech_switch_24", 7, "da");
  const fa = edit(f, (fl) => fl.furniture.push(itemA));
  assert.equal(get(fa, "da").in_rack, a.id);
  assert.equal(get(fa, "da").rack_u, 7);
  assert.equal(get(fa, a.id).rack_used, 1);
  assert.equal(get(fa, b.id).rack_used, undefined);
  // gemeint ist b
  const itemB = newRackItem(b, "tech_switch_24", 7, "db");
  const fb = edit(f, (fl) => fl.furniture.push(itemB));
  assert.equal(get(fb, "db").in_rack, b.id);
  assert.equal(get(fb, b.id).rack_used, 1);
  // ohne Verweis (frei gesetzt) gilt weiter der oberste Schrank
  const free = { id: "dfree", type: "tech_switch_24", x: 5.1, z: 5.05, rotation: 0, w: 0.482, d: 0.28, h: HE };
  const ff = edit(f, (fl) => fl.furniture.push(free));
  assert.equal(get(ff, "dfree").in_rack, b.id);
  // Verweis auf einen Schrank, dessen Fläche die Gerätemitte nicht enthält: die Lage entscheidet
  const far = cab({ x: 12, z: 5 });
  const f3 = floorOf(a, far);
  const stray = { ...newRackItem(far, "tech_switch_24", 3, "ds"), x: 5, z: 5.05 };
  const f4 = edit(f3, (fl) => fl.furniture.push(stray));
  assert.equal(get(f4, "ds").in_rack, a.id);
});

test("stepTarget: freie Nachbar-HE → um 1, Gerät als Nachbar → Tausch, Rand und Fehler → null", () => {
  const c = cab();
  const { f, ids } = stack(c, "tech_srv_1u", "tech_ups_2u", "tech_switch_24"); // 1, 2–3, 4
  const [s1, u2, sw] = ids;
  // frei: Switch (HE 4) hoch/runter
  assert.deepEqual(stepTarget(f, c, sw, 1), [{ id: sw, u: 5 }]);
  // runter: Nachbar HE 3 gehört der USV → Tausch (USV 2 HE, Switch 1 HE): Switch auf 2, USV auf 3
  assert.deepEqual(stepTarget(f, c, sw, -1), [{ id: sw, u: 2 }, { id: u2, u: 3 }]);
  // USV runter: Server (1 HE) darunter → USV auf 1, Server auf 3
  assert.deepEqual(stepTarget(f, c, u2, -1), [{ id: u2, u: 1 }, { id: s1, u: 3 }]);
  // USV hoch: Switch (1 HE) darüber → Switch auf 2, USV auf 3
  assert.deepEqual(stepTarget(f, c, u2, 1), [{ id: u2, u: 3 }, { id: sw, u: 2 }]);
  // Rand unten
  assert.equal(stepTarget(f, c, s1, -1), null);
  // Rand oben
  const top = build(f, c, "tech_switch_24", 22);
  assert.equal(stepTarget(top.floor, c, top.item.id, 1), null);
  const topTwo = build(f, c, "tech_ups_2u", 21);
  assert.equal(stepTarget(topTwo.floor, c, topTwo.item.id, 1), null, "2 HE reichen bis 22");
  assert.deepEqual(stepTarget(topTwo.floor, c, topTwo.item.id, -1), [{ id: topTwo.item.id, u: 20 }]);
  // unbekanntes Gerät, falsche Richtung
  assert.equal(stepTarget(f, c, "gibtsnicht", 1), null);
  assert.equal(stepTarget(f, c, sw, 0), null);
  assert.equal(stepTarget(f, c, sw, 2), null);
});

test("stepTarget: Tausch gleich großer Geräte, Ergebnis bleibt nach followMoves genau", () => {
  const c = cab();
  const { f, ids } = stack(c, "tech_srv_1u", "tech_switch_24", "tech_patch_panel", "tech_ups_2u"); // 1, 2, 3, 4–5
  const [a, b, d, u] = ids;
  const moves = stepTarget(f, c, a, 1);
  assert.deepEqual(moves, [{ id: a, u: 2 }, { id: b, u: 1 }]);
  const g = edit(f, (fl) => applyMoves(fl, moves));
  assert.deepEqual(us(g, [a, b, d, u]), [2, 1, 3, 4], "genau die berechneten HE, USV unberührt");
  // ungleich groß: USV 4–5 runter tauscht mit dem Patchfeld (3): USV auf 3–4, Patchfeld auf 5
  const m2 = stepTarget(f, c, u, -1);
  assert.deepEqual(m2, [{ id: u, u: 3 }, { id: d, u: 5 }]);
  const h = edit(f, (fl) => applyMoves(fl, m2));
  assert.deepEqual(us(h, [a, b, d, u]), [1, 2, 5, 3]);
  assert.equal(get(h, c.id).rack_used, 5);
  // mount_y folgt
  assert.ok(near(get(h, u).mount_y, 0.12 + 2 * HE) && near(get(h, d).mount_y, 0.12 + 4 * HE));
});

test("dropTarget: frei → Verschieben, genau ein Gerät → Tausch, sonst null", () => {
  const c = cab();
  const { f, ids } = stack(c, "tech_srv_1u", "tech_ups_2u", "tech_switch_24", "tech_patch_panel"); // 1, 2–3, 4, 5
  const [s1, u2, sw, pp] = ids;
  // frei
  assert.deepEqual(dropTarget(f, c, sw, 15), [{ id: sw, u: 15 }]);
  assert.deepEqual(dropTarget(f, c, u2, 21), [{ id: u2, u: 21 }]);
  assert.deepEqual(dropTarget(f, c, sw, 6), [{ id: sw, u: 6 }]);
  // das eigene Feld mitbenutzt: USV um 1 hoch (3–4 würde den Switch überdecken → Tausch), Switch um 1 runter geht nicht (belegt)
  assert.equal(dropTarget(f, c, sw, 4), null, "gleiche Lage: nichts zu tun");
  // Tausch gleich groß, nicht angrenzend: Server (1) und Patchfeld (5)
  assert.deepEqual(dropTarget(f, c, s1, 5), [{ id: s1, u: 5 }, { id: pp, u: 1 }]);
  // Tausch angrenzend, ungleich groß: Switch (4) auf die USV (2–3): USV oben drauf zeigen → u = 2: überdeckt 2 und 3 → nur die USV
  const swap = dropTarget(f, c, sw, 3);
  assert.deepEqual(swap, [{ id: sw, u: 2 }, { id: u2, u: 3 }], "angrenzend: Reihenfolge tauschen");
  // USV auf den Switch (HE 4–5 überdeckt Switch und Patchfeld) → zwei Geräte → null
  assert.equal(dropTarget(f, c, u2, 4), null);
  // USV auf den Server (1–2 überdeckt Server und sich selbst: ohne A nur der Server) → angrenzend, Reihenfolge tauschen
  assert.deepEqual(dropTarget(f, c, u2, 1), [{ id: u2, u: 1 }, { id: s1, u: 3 }]);
  // nicht angrenzend, ungleich groß, Platz fehlt: Patchfeld (1 HE, HE 5) auf die USV (2–3)? Unterkanten tauschen → USV auf 5–6 (frei) → gültig
  assert.deepEqual(dropTarget(f, c, pp, 3), [{ id: pp, u: 2 }, { id: u2, u: 5 }]);
  // USV (2 HE) auf das Patchfeld (5) legen: u = 5 überdeckt 5–6 → nur das Patchfeld; nicht angrenzend (USV 2–3, Patchfeld 5) → Unterkanten tauschen:
  // Patchfeld auf 2, USV auf 5–6 (frei) → gültig
  assert.deepEqual(dropTarget(f, c, u2, 5), [{ id: u2, u: 5 }, { id: pp, u: 2 }]);
  // außerhalb
  assert.equal(dropTarget(f, c, sw, 0), null);
  assert.equal(dropTarget(f, c, sw, 23), null);
  assert.equal(dropTarget(f, c, u2, 22), null, "2 HE ragen über den Schrank");
  assert.equal(dropTarget(f, c, "gibtsnicht", 5), null);
  assert.equal(dropTarget(f, c, sw, NaN), null);
});

test("dropTarget: Tausch ungültig, wenn die neue Lage des größeren Geräts nicht frei ist", () => {
  const c = cabN(5);
  assert.equal(cabinetLayout(c).units, 5);
  // USV 1–2, Server 3, Server 4, Switch 5; dann USV auf Switch ablegen: USV auf 4–5 (5–6 ragt raus)
  const { f, ids } = stack(c, "tech_ups_2u", "tech_srv_1u", "tech_srv_1u", "tech_switch_24");
  const [u2, , , sw] = ids;
  assert.equal(dropTarget(f, c, u2, 5), null, "USV passt nicht ab HE 5");
  // USV auf 4 überdeckt Server (4) und Switch (5) → zwei Geräte
  assert.equal(dropTarget(f, c, u2, 4), null);
  // Switch auf die USV (HE 1): Unterkanten tauschen, Switch auf 1, USV auf 5 (5–6 raus) → ungültig
  assert.equal(dropTarget(f, c, sw, 1), null);
  assert.equal(dropTarget(f, c, sw, 2), null, "überdeckt die USV; angrenzend? USV 1–2, Switch 5: nein; neue Lage der USV 5–6 ungültig");
});

test("dropTarget: Ergebnis nach followMoves exakt", () => {
  const c = cab();
  const { f, ids } = stack(c, "tech_srv_1u", "tech_ups_2u", "tech_switch_24");
  const [s1, u2, sw] = ids;
  const m = dropTarget(f, c, sw, 12);
  const g = edit(f, (fl) => applyMoves(fl, m));
  assert.deepEqual(us(g, [s1, u2, sw]), [1, 2, 12]);
  const m2 = dropTarget(g, c, s1, 12);
  const h = edit(g, (fl) => applyMoves(fl, m2));
  assert.deepEqual(us(h, [s1, u2, sw]), [12, 2, 1]);
  // applyMoves ignoriert unbekannte IDs und null
  const copy = structuredClone(h);
  applyMoves(copy, [{ id: "nix", u: 3 }]);
  applyMoves(copy, null);
  assert.deepEqual(copy, h);
});

test("Vorlagen: Daten, Summen, genaue HE im Netzwerkschrank (22 HE) und im Serverschrank (42 HE)", () => {
  assert.deepEqual(Object.keys(RACK_TEMPLATES), ["heimnetz", "homelab"]);
  assert.equal(RACK_TEMPLATES.heimnetz.name, "Heimnetz klein");
  assert.equal(RACK_TEMPLATES.homelab.name, "Homelab");
  assert.deepEqual(templateStats("heimnetz"), { count: 5, he: 10 });
  assert.deepEqual(templateStats("homelab"), { count: 6, he: 8 });
  const at = (plan) => plan.items.map((i) => [i.type, i.u]);

  const nw = cab();
  assert.deepEqual(at(templatePlan(nw, "heimnetz")), [["tech_ups_2u", 1], ["tech_wifi_router", 3], ["tech_patch_panel", 22], ["tech_cable_mgmt", 21], ["tech_switch_24", 20]]);
  assert.deepEqual(at(templatePlan(nw, "homelab")), [["tech_ups_2u", 1], ["tech_nas_rack", 3], ["tech_srv_1u", 5], ["tech_srv_1u", 6], ["tech_switch_24", 22], ["tech_cable_mgmt", 21]]);
  const sv = srvCab();
  assert.deepEqual(at(templatePlan(sv, "heimnetz")), [["tech_ups_2u", 1], ["tech_wifi_router", 3], ["tech_patch_panel", 42], ["tech_cable_mgmt", 41], ["tech_switch_24", 40]]);
  assert.deepEqual(at(templatePlan(sv, "homelab")).slice(-2), [["tech_switch_24", 42], ["tech_cable_mgmt", 41]]);
});

test("Vorlagen: nach dem Einbau (followMoves) liegt jedes Gerät genau auf seiner HE, auch bei Wiederholung", () => {
  for (const [c, name] of [[cab(), "Netzwerkschrank"], [srvCab(), "Serverschrank"]]) {
    for (const key of Object.keys(RACK_TEMPLATES)) {
      const plan = templateCheck(floorOf(c), c, key);
      assert.ok(plan.items, `${name} ${key}: ${plan.error}`);
      const items = plan.items.map((p, i) => newRackItem(c, p.type, p.u, `t${seq}_${i}`));
      seq++;
      const f = edit(floorOf(c), (fl) => fl.furniture.push(...items));
      for (const [i, p] of plan.items.entries()) {
        const d = get(f, items[i].id);
        assert.equal(d.in_rack, c.id, `${name} ${key} ${p.type}`);
        assert.equal(d.rack_u, p.u, `${name} ${key} ${p.type}`);
      }
      const total = templateStats(key).he;
      assert.equal(get(f, c.id).rack_used, total);
      // eine weitere Änderung (Schrank verschieben) lässt alles an seiner HE
      const g = edit(f, (fl) => (get(fl, c.id).x = 8));
      for (const [i, p] of plan.items.entries()) assert.equal(get(g, items[i].id).rack_u, p.u);
      // nicht mehr leer
      assert.deepEqual(templateCheck(f, get(f, c.id), key), { error: "nicht leer" });
    }
  }
});

test("Vorlagen: zu tief, zu breit und zu wenig HE", () => {
  // zu wenig HE: Heimnetz braucht 10 HE
  const small = cabN(8);
  assert.equal(cabinetLayout(small).units, 8);
  assert.deepEqual(templatePlan(small, "heimnetz"), { error: "zu wenig HE" });
  assert.ok(templatePlan(small, "homelab").items, "Homelab braucht genau 8 HE");
  const tiny = cabN(7);
  assert.deepEqual(templatePlan(tiny, "homelab"), { error: "zu wenig HE" });
  // zu tief: Rack-NAS und 1-HE-Server 0,5 m, Schrank mit 0,5 m Tiefe: nutzbar 0,43 m
  const shallow = cab({ d: 0.5 });
  assert.deepEqual(templatePlan(shallow, "homelab"), { error: "zu tief" });
  assert.deepEqual(templatePlan(shallow, "heimnetz"), { error: "zu tief" }, "USV 0,45 m");
  const ok = cab({ d: 0.6 });
  assert.ok(templatePlan(ok, "homelab").items);
  // zu breit
  assert.deepEqual(templatePlan(cab({ w: 0.5 }), "homelab"), { error: "zu breit" });
  assert.deepEqual(templatePlan(ok, "gibtsnicht"), { error: "unbekannt" });
});

test("Vorlagen: nicht leerer Schrank, auch mit Gerät ohne gültige HE; Geräte anderer Schränke zählen nicht", () => {
  const c = cab();
  const other = cab({ x: 9 });
  const dev = newRackItem(other, "tech_switch_24", 1, "o1");
  const f = floorOf(c, other, dev);
  assert.ok(templateCheck(f, c, "heimnetz").items);
  const f2 = edit(floorOf(c), (fl) => fl.furniture.push(newRackItem(c, "tech_switch_24", 1, "d1")));
  assert.deepEqual(templateCheck(f2, c, "homelab"), { error: "nicht leer" });
  const broken = floorOf(c, { id: "b1", type: "tech_switch_24", in_rack: c.id, x: 5, z: 5 });
  assert.deepEqual(templateCheck(broken, c, "homelab"), { error: "nicht leer" });
});

test("Lücken schließen: je Lücke 2-HE-Blenden von unten, Rest 1 HE", () => {
  const c = cabN(10);
  assert.equal(cabinetLayout(c).units, 10);
  // leer: 5 × 2 HE
  assert.deepEqual(gapFill(floorOf(c), c), [1, 3, 5, 7, 9].map((u) => ({ type: "tech_blank_panel_2u", u })));
  // belegt 1 und 5–6: Lücken 2–4 (3 HE), 7–10 (4 HE)
  let f = floorOf(c);
  f = build(f, c, "tech_srv_1u", 1).floor;
  f = build(f, c, "tech_ups_2u", 5).floor;
  assert.deepEqual(gapFill(f, c), [
    { type: "tech_blank_panel_2u", u: 2 },
    { type: "tech_blank_panel", u: 4 },
    { type: "tech_blank_panel_2u", u: 7 },
    { type: "tech_blank_panel_2u", u: 9 },
  ]);
  // einbauen: nachher keine Lücke mehr, alles genau auf seiner HE
  const items = gapFill(f, c).map((p, i) => newRackItem(c, p.type, p.u, `g${seq}_${i}`));
  const g = edit(f, (fl) => fl.furniture.push(...items));
  for (const [i, p] of gapFill(f, c).entries()) assert.equal(get(g, items[i].id).rack_u, p.u);
  assert.equal(cabinetInfo(g, get(g, c.id)).free, 0);
  assert.deepEqual(gapFill(g, get(g, c.id)), []);
  assert.equal(get(g, c.id).rack_used, 10);
  // voller Schrank, zu schmaler Schrank
  assert.deepEqual(gapFill(g, get(g, c.id)), []);
  assert.deepEqual(gapFill(floorOf(cab({ w: 0.5 })), cab({ w: 0.5 })), []);
});

test("Blenden: Maße 482 × HE, Tiefe 2 cm; Bürstenleiste 1 HE; passen in beide Schränke", () => {
  assert.equal(RACK_HE.tech_blank_panel_2u, 2);
  assert.equal(RACK_HE.tech_brush_panel, 1);
  assert.equal(heOf({ type: "tech_blank_panel_2u" }), 2);
  assert.equal(heOf({ type: "tech_brush_panel" }), 1);
  assert.ok(near(TECH_PACK.items.tech_blank_panel_2u[3], 2 * HE) && TECH_PACK.items.tech_blank_panel_2u[2] === 0.02);
  assert.ok(near(TECH_PACK.items.tech_brush_panel[3], HE) && TECH_PACK.items.tech_brush_panel[2] === 0.03);
});

test("unrackItem: wie „Ausbauen“ – vor den Schrank stellen, Einbau-Felder weg; ohne Schrank nur die Felder", () => {
  const c = cab({ rotation: 90 });
  const r = build(floorOf(c), c, "tech_switch_24", 4);
  const d = structuredClone(get(r.floor, r.item.id));
  assert.equal(d.in_rack, c.id);
  const out = unrackItem(d, get(r.floor, c.id));
  assert.equal(out, d);
  assert.equal(d.in_rack, undefined);
  assert.equal(d.rack_u, undefined);
  assert.equal(d.mount_y, undefined);
  assert.equal(d.rotation, 90);
  // Front des Schranks (Drehung 90 → nach −x): Gerät 0,3 + 0,14 + 0,1 davor
  assert.ok(near(d.x, 5 - (0.3 + 0.14 + 0.1)) && near(d.z, 5), JSON.stringify(d));
  // bleibt nach followMoves frei, auch wenn es noch in der Fläche stünde
  const g = edit(r.floor, (fl) => unrackItem(get(fl, d.id), get(fl, c.id)));
  assert.equal(get(g, d.id).in_rack, undefined);
  assert.equal(get(g, c.id).rack_used, undefined);
  // ohne Schrank
  const lone = { id: "z", type: "tech_switch_24", in_rack: "weg", rack_u: 3, mount_y: 0.2, x: 1, z: 2, rotation: 15 };
  unrackItem(lone, null);
  assert.deepEqual(lone, { id: "z", type: "tech_switch_24", x: 1, z: 2, rotation: 15 });
});
