// Einbau in Schränke: Höheneinheiten, Lage, Mitziehen nach jeder Änderung (followRack über followMoves)
import assert from "node:assert/strict";
import { test } from "node:test";

import { HE, RACK_HE, TECH_PACK } from "../../custom_components/haus3d/frontend/catalog-tech.js";
import { followMoves } from "../../custom_components/haus3d/frontend/follow.js";
import { followRack } from "../../custom_components/haus3d/frontend/follow-rack.js";
import { cabinetInfo, cabinetLayout, findSlot, fitsCabinet, heOf, inFootprint, isCabinet, isRackable, newOccupancy, rackPose, unrackPose } from "../../custom_components/haus3d/frontend/rack.js";

let seq = 0;
const dims = (type) => {
  const [, w, d, h] = TECH_PACK.items[type] ?? ["", 0.22, 0.25, 0.25];
  return { w, d, h };
};
const cab = (o = {}) => ({ id: `c${++seq}`, type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2, ...o });
const dev = (type, o = {}) => ({ id: `d${++seq}`, type, x: 5, z: 5, rotation: 0, ...dims(type), ...o });
const floorOf = (...furniture) => ({ id: "eg", furniture });
const get = (floor, id) => floor.furniture.find((m) => m.id === id);
/** Änderung wie im Editor: Etage klonen, ändern, followMoves. */
const edit = (floor, fn) => {
  const after = structuredClone(floor);
  fn(after);
  return followMoves(floor, after);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const free = (d) => d.in_rack === undefined && d.rack_u === undefined && d.mount_y === undefined;

test("Schrank: nutzbare Höheneinheiten aus der Höhe (Netzwerkschrank 1,2 m = 22 HE, Serverschrank 2,0 m = 42 HE)", () => {
  assert.equal(cabinetLayout({ type: "network_cabinet", h: 1.2 }).units, 22);
  assert.equal(cabinetLayout({ type: "network_cabinet" }).units, 22);
  assert.equal(cabinetLayout({ type: "server_rack", h: 2.0 }).units, 42);
  assert.equal(cabinetLayout({ type: "server_rack" }).units, 42);
  assert.equal(cabinetLayout({ type: "server_rack", h: 0.1 }).units, 0);
  // höherer Schrank hat mehr HE
  assert.ok(cabinetLayout({ type: "server_rack", h: 2.2 }).units > 42);
  assert.ok(isCabinet({ type: "server_rack" }) && isCabinet({ type: "network_cabinet" }) && !isCabinet({ type: "sofa" }) && !isCabinet({ type: "toString" }));
});

test("Einbaubar sind 19-Zoll-Geräte, Tischgeräte aus „Server & NAS“ und das vorhandene NAS – sonst nichts", () => {
  for (const t of Object.keys(RACK_HE)) assert.ok(isRackable({ type: t }), t);
  for (const t of ["tech_nas_2bay", "tech_nas_5bay", "tech_nas_8bay", "tech_mini_pc", "tech_sbc", "tech_tower_server", "tech_switch_8", "tech_wifi_router", "tech_modem", "tech_ups_tower", "nas"]) assert.ok(isRackable({ type: t }), t);
  for (const t of ["gaming_pc", "printer_3d", "sofa", "tech_socket", "tech_buffer", "tech_ap_ceiling", "network_cabinet"]) assert.ok(!isRackable({ type: t }), t);
});

test("Höheneinheiten: 19-Zoll-Geräte nach Katalog, Tischgeräte aufgerundet mit Fachboden", () => {
  for (const [t, he] of Object.entries(RACK_HE)) assert.equal(heOf({ type: t }), he, t);
  assert.equal(heOf({ type: "tech_srv_4u" }), 4);
  assert.equal(heOf({ type: "tech_nas_2bay" }), 4); // 0,165 m + Fachboden
  assert.equal(heOf({ type: "tech_mini_pc" }), 2);
  assert.equal(heOf({ type: "nas" }), 6);
  // eigene Höhe zählt
  assert.equal(heOf({ type: "tech_srv_1u", h: 3 * HE }), 3);
});

test("Lücken: unterste freie, sonst die dem Wunsch nächste", () => {
  const occ = newOccupancy(10);
  occ[1] = occ[2] = occ[5] = "x";
  assert.equal(findSlot(occ, 10, 1), 3);
  assert.equal(findSlot(occ, 10, 2), 3);
  assert.equal(findSlot(occ, 10, 3), 6);
  assert.equal(findSlot(occ, 10, 1, 5), 4); // 4 und 6 sind gleich weit weg: die untere
  assert.equal(findSlot(occ, 10, 2, 5), 6);
  assert.equal(findSlot(occ, 10, 1, 99), 10);
  assert.equal(findSlot(occ, 10, 1, 0), 3);
  assert.equal(findSlot(occ, 10, 11), null);
});

test("Neu gesetzt in der Schrankfläche: eingebaut in die unterste freie Lücke, Lage aus dem Schrank", () => {
  const c = cab();
  const s1 = dev("tech_srv_1u");
  let f = edit(floorOf(c), (a) => a.furniture.push(s1));
  const d1 = get(f, s1.id);
  assert.equal(d1.in_rack, c.id);
  assert.equal(d1.rack_u, 1);
  // Mitte des Schranks, Front kurz hinter der Tür (Tiefe 0,5 m → Mitte 0,3 − 0,04 − 0,25 = 0,01 m vor der Mitte)
  assert.ok(near(d1.x, 5) && near(d1.z, 5.01) && d1.rotation === 0, JSON.stringify(d1));
  // mount_y = Sockel (0,12 m) + (rack_u − 1) × 0,0445
  assert.ok(near(d1.mount_y, 0.12), `${d1.mount_y}`);
  assert.equal(get(f, c.id).rack_used, 1);

  const s2 = dev("tech_ups_2u");
  const s3 = dev("tech_switch_24", { x: 5.2, z: 4.9 });
  f = edit(f, (a) => a.furniture.push(s2));
  f = edit(f, (a) => a.furniture.push(s3));
  assert.equal(get(f, s2.id).rack_u, 2);
  assert.ok(near(get(f, s2.id).mount_y, 0.12 + HE));
  assert.equal(get(f, s3.id).rack_u, 4);
  assert.ok(near(get(f, s3.id).mount_y, 0.12 + 3 * HE));
  assert.equal(get(f, c.id).rack_used, 4);
  const info = cabinetInfo(f, get(f, c.id));
  assert.deepEqual(info.devices.map((d) => [d.u, d.he]), [[4, 1], [2, 2], [1, 1]], "von oben nach unten");
  assert.equal(info.used, 4);
  assert.equal(info.free, 18);
});

test("Voller Schrank, zu tiefes oder zu breites Gerät: nicht eingebaut, bleibt frei stehen", () => {
  // 4 HE: 1,2 m ist hier 0,4 m hoch
  const c = cab({ h: 0.4 });
  assert.equal(cabinetLayout(c).units, 4);
  const a = dev("tech_ups_2u");
  const b = dev("tech_ups_2u");
  const x = dev("tech_switch_24", { x: 5.1 });
  let f = edit(floorOf(c), (fl) => fl.furniture.push(a));
  f = edit(f, (fl) => fl.furniture.push(b));
  f = edit(f, (fl) => fl.furniture.push(x));
  assert.deepEqual([get(f, a.id).rack_u, get(f, b.id).rack_u], [1, 3]);
  assert.ok(free(get(f, x.id)) && get(f, x.id).x === 5.1, "kein Platz: unverändert");
  assert.equal(get(f, c.id).rack_used, 4);

  // 2 HE tief 0,65 m: im Netzwerkschrank (0,6 m) zu tief, im Serverschrank (1,0 m) passt es
  const srv = dev("tech_srv_2u");
  assert.equal(fitsCabinet(cab(), srv), "zu tief");
  assert.equal(fitsCabinet(cab({ type: "server_rack", d: 1.0, h: 2.0 }), srv), "");
  assert.equal(fitsCabinet(cab({ w: 0.5 }), dev("tech_switch_24")), "zu breit");
  const f2 = edit(floorOf(cab()), (fl) => fl.furniture.push(srv));
  assert.ok(free(get(f2, srv.id)));
  const rack = cab({ type: "server_rack", w: 0.6, d: 1.0, h: 2.0 });
  const f3 = edit(floorOf(rack), (fl) => fl.furniture.push(srv));
  assert.equal(get(f3, srv.id).in_rack, rack.id);
  // Front kurz hinter der Tür: Mitte = 0,5 − 0,04 − 0,325 = 0,135 m vor der Mitte
  assert.ok(near(get(f3, srv.id).z, 5.135));
  assert.equal(get(f3, rack.id).rack_used, 2);
});

test("Nicht einbaubare Möbel in der Schrankfläche bleiben unberührt", () => {
  const f = edit(floorOf(cab()), (a) => a.furniture.push({ id: "m1", type: "sofa", x: 5, z: 5, rotation: 0, w: 1, d: 1, h: 1 }));
  assert.deepEqual(get(f, "m1"), { id: "m1", type: "sofa", x: 5, z: 5, rotation: 0, w: 1, d: 1, h: 1 });
  assert.equal(get(f, f.furniture[0].id).rack_used, undefined);
});

test("Schrank verschieben, drehen, höher setzen: eingebaute Geräte folgen (Lage, Drehung, mount_y)", () => {
  const c = cab();
  const a = dev("tech_srv_1u");
  const b = dev("tech_ups_2u");
  let f = edit(floorOf(c), (fl) => fl.furniture.push(a, b));
  assert.equal(get(f, b.id).rack_u, 2);

  f = edit(f, (fl) => {
    get(fl, c.id).x = 8;
    get(fl, c.id).z = 3;
  });
  assert.ok(near(get(f, a.id).x, 8) && near(get(f, a.id).z, 3.01), JSON.stringify(get(f, a.id)));
  assert.ok(near(get(f, b.id).x, 8) && near(get(f, b.id).z, 3.0 + (0.3 - 0.04 - 0.225)));
  assert.deepEqual([get(f, a.id).rack_u, get(f, b.id).rack_u], [1, 2]);

  // drehen: Front zeigt bei 90° nach −x (lokales +z bei Drehung r nach (−sin r, cos r))
  f = edit(f, (fl) => {
    get(fl, c.id).rotation = 90;
  });
  assert.ok(near(get(f, a.id).x, 8 - 0.01) && near(get(f, a.id).z, 3), JSON.stringify(get(f, a.id)));
  assert.equal(get(f, a.id).rotation, 90);
  assert.equal(get(f, b.id).rotation, 90);

  // höher setzen
  f = edit(f, (fl) => {
    get(fl, c.id).mount_y = 0.1;
  });
  assert.ok(near(get(f, a.id).mount_y, 0.22) && near(get(f, b.id).mount_y, 0.22 + HE));

  // Schrank höher machen: mehr HE, Geräte bleiben auf ihrer HE
  f = edit(f, (fl) => {
    get(fl, c.id).h = 1.6;
  });
  assert.equal(get(f, c.id).rack_used, 3);
  assert.deepEqual([get(f, a.id).rack_u, get(f, b.id).rack_u], [1, 2]);
});

test("Gerät aus der Schrankfläche ziehen: ausgebaut (mount_y zurück), in der Fläche: springt zurück", () => {
  const c = cab();
  const a = dev("tech_srv_1u");
  const b = dev("tech_ups_2u");
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a, b));

  // innerhalb der Fläche verschoben (Pfeiltaste, Ziehen): zurück an den Platz
  const inside = edit(f0, (fl) => {
    get(fl, a.id).x = 5.2;
    get(fl, a.id).z = 4.8;
    get(fl, a.id).rotation = 45;
  });
  assert.equal(get(inside, a.id).in_rack, c.id);
  assert.ok(near(get(inside, a.id).x, 5) && near(get(inside, a.id).z, 5.01) && get(inside, a.id).rotation === 0);

  // aus der Fläche gezogen: ausgebaut, bleibt am neuen Ort
  const out = edit(f0, (fl) => {
    get(fl, a.id).x = 9;
    get(fl, a.id).z = 9;
  });
  const d = get(out, a.id);
  assert.ok(free(d), JSON.stringify(d));
  assert.deepEqual([d.x, d.z], [9, 9]);
  assert.equal(get(out, c.id).rack_used, 2, "nur noch das 2-HE-Gerät");
  assert.equal(get(out, b.id).rack_u, 2, "andere Geräte behalten ihre HE");
  // vor dem Ziehen bleibt die Ausgangsetage unverändert
  assert.equal(get(f0, a.id).in_rack, c.id);

  // wieder hineinziehen: eingebaut, in die unterste freie Lücke (HE 1 ist jetzt frei)
  const back = edit(out, (fl) => {
    get(fl, a.id).x = 5.1;
    get(fl, a.id).z = 5.1;
  });
  assert.equal(get(back, a.id).in_rack, c.id);
  assert.equal(get(back, a.id).rack_u, 1);
  assert.equal(get(back, c.id).rack_used, 3);
});

test("Gerät von einem Schrank in einen anderen ziehen", () => {
  const a = cab({ x: 2, z: 2 });
  const b = cab({ x: 6, z: 2 });
  const d = dev("tech_switch_24", { x: 2, z: 2 });
  let f = edit(floorOf(a, b), (fl) => fl.furniture.push(d));
  assert.equal(get(f, d.id).in_rack, a.id);
  f = edit(f, (fl) => {
    get(fl, d.id).x = 6.1;
    get(fl, d.id).z = 2.1;
  });
  assert.equal(get(f, d.id).in_rack, b.id);
  assert.equal(get(f, a.id).rack_used, undefined);
  assert.equal(get(f, b.id).rack_used, 1);
});

test("Gedrehter Schrank: die Grundfläche ist ein gedrehtes Rechteck", () => {
  const rack = cab({ type: "server_rack", d: 1.0, h: 2.0, rotation: 90 }); // Fläche reicht in x ±0,5 und in z ±0,3
  assert.ok(inFootprint(rack, 5.4, 5.0));
  assert.ok(!inFootprint(rack, 5.0, 5.4));
  assert.ok(inFootprint({ ...rack, rotation: 0 }, 5.0, 5.4));
  const near1 = dev("tech_switch_24", { x: 5.4, z: 5.0 });
  const far1 = dev("tech_switch_24", { x: 5.0, z: 5.4 });
  const f = edit(floorOf(rack), (fl) => fl.furniture.push(near1, far1));
  assert.equal(get(f, near1.id).in_rack, rack.id);
  assert.ok(free(get(f, far1.id)));
  // Lage im gedrehten Schrank: Front zeigt nach −x, Gerät (0,28 m tief) sitzt 0,5 − 0,04 − 0,14 = 0,32 m davor
  assert.ok(near(get(f, near1.id).x, 5 - 0.32) && near(get(f, near1.id).z, 5), JSON.stringify(get(f, near1.id)));
});

test("Schrank gelöscht: Geräte ausgebaut und bleiben stehen", () => {
  const c = cab();
  const a = dev("tech_srv_1u");
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a));
  const f = edit(f0, (fl) => {
    fl.furniture = fl.furniture.filter((m) => m.id !== c.id);
  });
  const d = get(f, a.id);
  assert.ok(free(d));
  assert.deepEqual([d.x, d.z], [get(f0, a.id).x, get(f0, a.id).z]);
  // Typ des Schranks geändert: kein Schrank mehr
  const g = edit(f0, (fl) => {
    get(fl, c.id).type = "sofa";
  });
  assert.ok(free(get(g, a.id)));
  assert.equal(get(g, c.id).rack_used, undefined);
});

test("rack_u ändern: freie HE wird übernommen, belegte rückt in die nächste freie Lücke", () => {
  const c = cab();
  const [a, b, d] = [dev("tech_switch_24"), dev("tech_switch_24"), dev("tech_switch_24")];
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a, b, d));
  assert.deepEqual([a, b, d].map((m) => get(f0, m.id).rack_u), [1, 2, 3]);

  const f1 = edit(f0, (fl) => (get(fl, a.id).rack_u = 10));
  assert.deepEqual([a, b, d].map((m) => get(f1, m.id).rack_u), [10, 2, 3]);
  assert.ok(near(get(f1, a.id).mount_y, 0.12 + 9 * HE));

  // auf die belegte HE 2 gesetzt: die nächste freie ist 1 (näher als 4)
  const f2 = edit(f1, (fl) => (get(fl, a.id).rack_u = 2));
  assert.deepEqual([a, b, d].map((m) => get(f2, m.id).rack_u), [1, 2, 3]);
  // zu hoch: an die oberste HE geklemmt
  const f3 = edit(f0, (fl) => (get(fl, b.id).rack_u = 99));
  assert.equal(get(f3, b.id).rack_u, 22);
  // zu niedrig / Unsinn
  const f4 = edit(f0, (fl) => (get(fl, d.id).rack_u = 0));
  assert.equal(get(f4, d.id).rack_u, 3, "HE 1 und 2 sind belegt, die nächste freie ist 3");
  const f5 = edit(f0, (fl) => (get(fl, d.id).rack_u = "7"));
  assert.equal(get(f5, d.id).rack_u, 7);
  // überlappt ein 2-HE-Gerät: weicht aus
  const wide = dev("tech_ups_2u");
  const f6 = edit(f0, (fl) => fl.furniture.push(wide));
  assert.equal(get(f6, wide.id).rack_u, 4);
  const f7 = edit(f6, (fl) => (get(fl, wide.id).rack_u = 2));
  assert.equal(get(f7, wide.id).rack_u, 4, "HE 2–3 sind belegt, die nächste Lücke für 2 HE beginnt bei 4");
});

test("Per Feld einbauen und ausbauen (in_rack setzen bzw. löschen)", () => {
  const c = cab();
  const a = dev("tech_srv_1u", { x: 9, z: 9 });
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a));
  assert.ok(free(get(f0, a.id)));
  const f1 = edit(f0, (fl) => {
    get(fl, a.id).in_rack = c.id;
  });
  assert.equal(get(f1, a.id).rack_u, 1);
  assert.ok(near(get(f1, a.id).x, 5) && near(get(f1, a.id).z, 5.01) && near(get(f1, a.id).mount_y, 0.12));
  // ausbauen wie der Knopf: Verweis löschen, vor den Schrank stellen – bleibt frei, auch wenn es sonst in der Fläche läge
  const pose = unrackPose(c, get(f1, a.id));
  assert.ok(near(pose.z, 5 + 0.3 + 0.25 + 0.1));
  const f2 = edit(f1, (fl) => {
    const d = get(fl, a.id);
    d.x = 5.05; // noch in der Fläche: darf nicht gleich wieder einziehen
    delete d.in_rack;
    delete d.rack_u;
    delete d.mount_y;
  });
  assert.ok(free(get(f2, a.id)));
  assert.equal(get(f2, c.id).rack_used, undefined);
  // einbauen in einen vollen Schrank wird zurückgenommen
  const full = cab({ h: 0.3, x: 12 });
  assert.equal(cabinetLayout(full).units, 1);
  const sw = dev("tech_switch_24", { x: 12, z: 5 });
  let f3 = edit(floorOf(full), (fl) => fl.furniture.push(sw, a));
  assert.equal(get(f3, sw.id).in_rack, full.id);
  f3 = edit(f3, (fl) => {
    get(fl, a.id).in_rack = full.id;
  });
  assert.ok(free(get(f3, a.id)), JSON.stringify(get(f3, a.id)));
  assert.deepEqual([get(f3, a.id).x, get(f3, a.id).z], [9, 9]);
  // Tiefe passt nicht: zurückgenommen
  const big = dev("tech_srv_4u", { x: 20, z: 20 });
  const f4 = edit(floorOf(c, big), (fl) => {
    get(fl, big.id).in_rack = c.id;
  });
  assert.ok(free(get(f4, big.id)));
});

test("Kopieren und Einfügen: alte Verweise gelten nicht, die Lage entscheidet (HE bleibt Wunsch)", () => {
  const c = cab();
  const a = dev("tech_srv_1u");
  const b = dev("tech_ups_2u");
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a, b));
  // Kopie des Schranks samt Geräten, 3 m daneben: die Kopien ziehen in den neuen Schrank, auf dieselben HE
  const c2 = { ...structuredClone(get(f0, c.id)), id: "c_copy", x: 8 };
  const a2 = { ...structuredClone(get(f0, a.id)), id: "a_copy", x: get(f0, a.id).x + 3 };
  const b2 = { ...structuredClone(get(f0, b.id)), id: "b_copy", x: get(f0, b.id).x + 3 };
  const f1 = edit(f0, (fl) => fl.furniture.push(c2, b2, a2));
  assert.equal(get(f1, "a_copy").in_rack, "c_copy");
  assert.equal(get(f1, "a_copy").rack_u, 1);
  assert.equal(get(f1, "b_copy").in_rack, "c_copy");
  assert.equal(get(f1, "b_copy").rack_u, 2);
  assert.equal(get(f1, "c_copy").rack_used, 3);
  assert.equal(get(f1, c.id).rack_used, 3);
  // einzeln dupliziert (+0,3 m): außerhalb der Fläche → frei, ohne Einbau-Felder
  const dup = { ...structuredClone(get(f0, a.id)), id: "a_dup", x: get(f0, a.id).x + 0.9, z: get(f0, a.id).z + 0.9 };
  const f2 = edit(f0, (fl) => fl.furniture.push(dup));
  assert.ok(free(get(f2, "a_dup")), JSON.stringify(get(f2, "a_dup")));
  // Kopie des Schranks allein: rack_used der Kopie verschwindet
  const f3 = edit(f0, (fl) => fl.furniture.push({ ...structuredClone(get(f0, c.id)), id: "c_only", x: 12 }));
  assert.equal(get(f3, "c_only").rack_used, undefined);
});

test("Schrank wird kleiner: Geräte rücken nach unten, bei zu wenig Platz ausgebaut", () => {
  const c = cab();
  const a = dev("tech_switch_24");
  const b = dev("tech_ups_2u");
  let f = edit(floorOf(c), (fl) => fl.furniture.push(a, b));
  f = edit(f, (fl) => {
    get(fl, b.id).rack_u = 21;
  });
  assert.equal(get(f, b.id).rack_u, 21);
  // 22 → 4 HE: das 2-HE-Gerät auf 21–22 passt nicht mehr, rückt auf die nächste freie Lücke (HE 3–4)
  f = edit(f, (fl) => {
    get(fl, c.id).h = 0.4;
  });
  assert.equal(get(f, b.id).rack_u, 3);
  assert.equal(get(f, c.id).rack_used, 3);
  // nur noch 2 HE: für das zweite Gerät ist kein Platz mehr
  f = edit(f, (fl) => {
    get(fl, c.id).h = 0.3;
  });
  assert.equal(cabinetLayout(get(f, c.id)).units, 1);
  assert.equal(get(f, a.id).in_rack, c.id);
  assert.ok(free(get(f, b.id)));
  assert.equal(get(f, c.id).rack_used, 1);
});

test("Gerätetyp ändern: nicht mehr einbaubar → ausgebaut; größere HE rückt weiter", () => {
  const c = cab();
  const a = dev("tech_srv_1u");
  const b = dev("tech_switch_24");
  let f = edit(floorOf(c), (fl) => fl.furniture.push(a, b));
  const f1 = edit(f, (fl) => {
    Object.assign(get(fl, a.id), { type: "sofa", w: 2, d: 1, h: 1 });
  });
  assert.ok(free(get(f1, a.id)));
  assert.equal(get(f1, c.id).rack_used, 1);
  // 1 HE → 2 HE (andere Höhe): das Gerät bleibt eingebaut, das zweite Gerät behält seine HE
  f = edit(f, (fl) => {
    Object.assign(get(fl, a.id), { type: "tech_ups_2u", ...dims("tech_ups_2u") });
  });
  assert.equal(get(f, a.id).in_rack, c.id);
  assert.equal(get(f, b.id).rack_u, 2);
  assert.equal(get(f, a.id).rack_u, 3, "HE 1 ist zu klein für 2 HE, die nächste freie Lücke beginnt bei 3");
  assert.equal(get(f, c.id).rack_used, 3);
});

test("Tischgeräte stehen auf einem Fachboden (HE aus Höhe + Boden, mount_y mit Boden)", () => {
  const c = cab();
  const n = dev("tech_nas_2bay"); // 0,165 m → 4 HE
  const old = dev("nas"); // vorhandenes NAS 0,25 m → 6 HE
  assert.deepEqual(dims("nas"), { w: 0.22, d: 0.25, h: 0.25 });
  const f = edit(floorOf(c), (fl) => fl.furniture.push(n, old));
  assert.equal(get(f, n.id).rack_u, 1);
  assert.ok(near(get(f, n.id).mount_y, 0.12 + 0.01));
  assert.equal(get(f, old.id).rack_u, 5);
  assert.ok(near(get(f, old.id).mount_y, 0.12 + 4 * HE + 0.01));
  assert.equal(get(f, c.id).rack_used, 10);
  // Pose: rackPose rechnet dasselbe
  assert.ok(near(rackPose(get(f, c.id), n, 1).mount_y, 0.13));
});

test("Ohne Schrank und ohne Einbau-Felder bleibt die Etage unverändert (alte Häuser)", () => {
  const before = floorOf(dev("tech_srv_1u"), dev("nas"), { id: "s", type: "sofa", x: 1, z: 1 });
  const after = structuredClone(before);
  after.furniture[0].x = 7;
  const snapshot = structuredClone(after);
  followRack(before, after);
  assert.deepEqual(after, snapshot);
  followRack(before, null);
  followRack(null, after);
  followRack({}, {});
  assert.deepEqual(after, snapshot);
  // before bleibt auch mit Schrank unverändert
  const c = cab();
  const b2 = floorOf(c);
  const a2 = structuredClone(b2);
  a2.furniture.push(dev("tech_srv_1u"));
  const frozen = JSON.stringify(b2);
  followMoves(b2, a2);
  assert.equal(JSON.stringify(b2), frozen);
});

test("Mehrfachauswahl: Schrank und Gerät gemeinsam verschoben – das Gerät bleibt eingebaut", () => {
  const c = cab();
  const a = dev("tech_srv_1u");
  const f0 = edit(floorOf(c), (fl) => fl.furniture.push(a));
  const f = edit(f0, (fl) => {
    for (const m of fl.furniture) {
      m.x += 4;
      m.z -= 1;
    }
  });
  assert.equal(get(f, a.id).in_rack, c.id);
  assert.ok(near(get(f, a.id).x, 9) && near(get(f, a.id).z, 4.01));
});

test("Mehrere Schränke: das Gerät zieht in den Schrank unter seiner Mitte, bei vollem Schrank in keinen", () => {
  const a = cab({ x: 2, z: 2, h: 0.3 }); // 1 HE
  const b = cab({ x: 6, z: 2 });
  const d1 = dev("tech_switch_24", { x: 2, z: 2 });
  const d2 = dev("tech_switch_24", { x: 2.1, z: 2.1 });
  const d3 = dev("tech_switch_24", { x: 6, z: 2 });
  const f = edit(floorOf(a, b), (fl) => fl.furniture.push(d1, d2, d3));
  assert.equal(get(f, d1.id).in_rack, a.id);
  assert.ok(free(get(f, d2.id)), "Schrank a ist voll");
  assert.equal(get(f, d3.id).in_rack, b.id);
  assert.equal(cabinetInfo(f, get(f, a.id)).free, 0);
});

test("Einbau: eingebaute Geräte und Schränke mit Geräten stehen gerade (Neigen/Kippen fällt weg, kommt beim Ausbauen nicht zurück)", () => {
  const c = cab({ tilt: 20, roll: 5 });
  const a = dev("tech_switch_24", { tilt: 30, roll: 10 });
  let f = edit(floorOf(c), (fl) => fl.furniture.push(a));
  assert.equal(get(f, a.id).in_rack, c.id);
  for (const id of [c.id, a.id]) assert.ok(get(f, id).tilt === undefined && get(f, id).roll === undefined, id);
  // ausgebaut: gerade, wie sie standen
  f = edit(f, (fl) => {
    for (const k of ["in_rack", "rack_u", "mount_y"]) delete get(fl, a.id)[k]; // wie der Knopf „Ausbauen“ (fields-tech.js)
  });
  assert.ok(free(get(f, a.id)) && get(f, a.id).tilt === undefined);
  // leerer Schrank darf geneigt bleiben
  const lone = cab({ tilt: 20 });
  assert.equal(get(edit(floorOf(lone), (fl) => (get(fl, lone.id).x = 6)), lone.id).tilt, 20);
});

test("Schrank schmaler/flacher gemacht oder Gerät vergrößert: nicht mehr passende Geräte werden ausgebaut", () => {
  const c = cab();
  const a = dev("tech_switch_24"); // 19 Zoll: 0,482 m breit
  const b = dev("tech_ups_2u");
  const f = edit(floorOf(c), (fl) => fl.furniture.push(a, b));
  assert.equal(get(f, a.id).in_rack, c.id);
  assert.equal(get(f, b.id).in_rack, c.id);
  assert.equal(fitsCabinet(get(f, c.id), get(f, a.id)), "");
  // Schrank auf 0,5 m verschmälert: 0,482 > 0,5 − 2·0,035 → ausgebaut
  const narrow = edit(f, (fl) => {
    get(fl, c.id).w = 0.5;
  });
  assert.equal(fitsCabinet(get(narrow, c.id), get(narrow, a.id)), "zu breit");
  assert.ok(free(get(narrow, a.id)), JSON.stringify(get(narrow, a.id)));
  assert.equal(get(narrow, c.id).rack_used, undefined);
  // flacher gemacht: zu tief
  const shallow = edit(f, (fl) => {
    get(fl, c.id).d = 0.3;
  });
  assert.ok(free(get(shallow, a.id)) && free(get(shallow, b.id)));
  // ein Gerät wird zu breit: nur dieses wird ausgebaut, das andere bleibt eingebaut
  const grown = edit(f, (fl) => {
    get(fl, a.id).w = 0.7;
  });
  assert.ok(free(get(grown, a.id)));
  assert.equal(get(grown, b.id).in_rack, c.id);
  assert.equal(get(grown, c.id).rack_used, heOf(get(grown, b.id)));
  // schmaler, aber es passt noch: alles bleibt, wo es war
  const ok = edit(f, (fl) => {
    get(fl, c.id).w = 0.56;
  });
  assert.equal(get(ok, a.id).in_rack, c.id);
  assert.equal(get(ok, a.id).rack_u, get(f, a.id).rack_u);
});

test("Überlappende Schränke: ein neues Gerät mit Verweis (in_rack, rack_u) kommt in diesen Schrank genau auf die Wunsch-HE, ohne Verweis in den obersten", () => {
  const a = cab({ x: 5, z: 5 });
  const b = cab({ x: 5.2, z: 5.1 }); // steht später in der Liste und überlappt a
  const f0 = floorOf(a, b);
  const mk = (id, extra = {}) => ({ id, type: "tech_switch_24", x: 5.1, z: 5.05, rotation: 0, ...dims("tech_switch_24"), ...extra });
  // Verweis auf a, Wunsch-HE 7: a, HE 7
  const fa = edit(f0, (fl) => fl.furniture.push(mk("n1", { in_rack: a.id, rack_u: 7 })));
  assert.equal(get(fa, "n1").in_rack, a.id);
  assert.equal(get(fa, "n1").rack_u, 7);
  assert.equal(get(fa, b.id).rack_used, undefined);
  // Verweis auf b: b
  const fb = edit(f0, (fl) => fl.furniture.push(mk("n2", { in_rack: b.id, rack_u: 3 })));
  assert.equal(get(fb, "n2").in_rack, b.id);
  assert.equal(get(fb, "n2").rack_u, 3);
  // ohne Verweis: der oberste (b)
  const fc = edit(f0, (fl) => fl.furniture.push(mk("n3")));
  assert.equal(get(fc, "n3").in_rack, b.id);
  // Verweis auf einen Schrank, der die Gerätemitte nicht enthält: die Lage entscheidet
  const far = cab({ x: 15, z: 5 });
  const fd = edit(floorOf(a, far), (fl) => fl.furniture.push(mk("n4", { in_rack: far.id, rack_u: 2 })));
  assert.equal(get(fd, "n4").in_rack, a.id);
  // Verweis auf einen Schrank, den es nicht gibt: ebenso
  const fe = edit(f0, (fl) => fl.furniture.push(mk("n5", { in_rack: "weg", rack_u: 2 })));
  assert.equal(get(fe, "n5").in_rack, b.id);
});
