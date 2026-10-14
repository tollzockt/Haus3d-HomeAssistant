// Technik: Steckdosen & Schalter, Heizungsraum, Server & NAS, Schrank-Optik, Erweiterungsakkus am Balkonspeicher
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { EXTRA, EXTRA_CATEGORIES, PACK_STACK, packCount, packHeight } from "../../custom_components/haus3d/frontend/catalog-extra.js";
import { HE, RACK_HE, RACK_UNITS, RACK_W, TECH_PACK } from "../../custom_components/haus3d/frontend/catalog-tech.js";
import { snapToWall } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { TECH_FIELDS } from "../../custom_components/haus3d/frontend/fields-tech.js";
import { FURNITURE, FURNITURE_CATEGORIES, FURNITURE_GROUPS, buildFurniture, furnitureBaseY, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { followMoves } from "../../custom_components/haus3d/frontend/follow.js";
import { ledKind, ledMats } from "../../custom_components/haus3d/frontend/tech-parts.js";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";

const cats = new Map(FURNITURE_CATEGORIES);
const WALL = cats.get("Steckdosen & Schalter");
const HEAT = cats.get("Heizungsraum");
const SERVER = cats.get("Server & NAS");
const build = (item, style = "standard") => buildFurniture({ x: 0, z: 0, ...item }, furnitureMaterials(style), 0, 2.5);
const box3 = (o) => new THREE.Box3().setFromObject(o);
const meshes = (o) => {
  const out = [];
  o.traverse((c) => c.isMesh && out.push(c));
  return out;
};

test("Katalog: drei Kategorien unter „Drinnen“, Typen mit Präfix tech_, Maße und Namen gültig", () => {
  assert.equal(WALL.length, 18);
  assert.equal(HEAT.length, 19);
  assert.equal(SERVER.length, 25);
  const drinnen = FURNITURE_GROUPS.find(([g]) => g === "Drinnen")[1];
  for (const c of ["Steckdosen & Schalter", "Heizungsraum", "Server & NAS"]) assert.ok(drinnen.includes(c), c);
  for (const t of [...WALL, ...HEAT, ...SERVER]) {
    assert.match(t, /^tech_/);
    const [name, w, d, h] = FURNITURE[t];
    assert.ok(name && w > 0 && d > 0 && h > 0, t);
  }
  // Pflichtangaben aus dem Auftrag
  const names = [...WALL, ...HEAT, ...SERVER].map((t) => FURNITURE[t][0]);
  for (const n of ["Steckdose", "Doppelsteckdose", "Dreifachsteckdose (waagerecht)", "Außensteckdose mit Klappe", "Herdanschlussdose", "Serienschalter", "Jalousieschalter", "Rauchmelder (Decke)", "Pufferspeicher", "Pelletlager (Gewebetank)", "Öltank (Kunststoff, 2er-Batterie)", "Rack-NAS 2 HE (12 Einschübe)", "Switch 1 HE (24 Ports)", "KVM-Konsole 1 HE", "USV (Tower)", "Access Point (Decke)"]) assert.ok(names.includes(n), n);
});

test("19-Zoll-Geräte: Breite 0,482 m, Höhe = HE × 0,0445 m, HE wie im Auftrag", () => {
  const he = { tech_srv_1u: 1, tech_srv_2u: 2, tech_srv_4u: 4, tech_nas_rack: 2, tech_switch_24: 1, tech_switch_poe: 1, tech_patch_panel: 1, tech_firewall: 1, tech_ups_2u: 2, tech_pdu: 1, tech_rack_shelf: 1, tech_blank_panel: 1, tech_cable_mgmt: 1, tech_kvm: 1 };
  assert.deepEqual(Object.keys(RACK_UNITS).sort(), Object.keys(he).sort());
  assert.equal(RACK_W, 0.482);
  assert.equal(HE, 0.0445);
  for (const [t, n] of Object.entries(he)) {
    const [, w, d, h] = FURNITURE[t];
    assert.equal(RACK_HE[t], n, t);
    assert.equal(w, 0.482, t);
    assert.ok(Math.abs(h - n * 0.0445) < 1e-9, `${t}: ${h}`);
    assert.ok(d > 0 && d <= 0.7, t);
  }
});

test("Montagehöhen: Steckdosen 0,3 m, Schalter 1,05 m, Herdanschluss 0,6 m, Außensteckdose 0,4 m, Rauchmelder unter der Decke", () => {
  const y = (type) => furnitureBaseY({ type }, 2.5);
  for (const t of ["tech_socket", "tech_socket_double", "tech_socket_triple", "tech_socket_usb"]) assert.equal(y(t), 0.3, t);
  for (const t of ["tech_switch", "tech_switch_double", "tech_dimmer", "tech_button", "tech_blind_switch", "tech_thermostat", "tech_smart_switch"]) assert.equal(y(t), 1.05, t);
  assert.equal(y("tech_stove_outlet"), 0.6);
  assert.equal(y("tech_socket_outdoor"), 0.4);
  assert.ok(Math.abs(y("tech_smoke_detector") - (2.5 - 0.04 - 0.01)) < 1e-9);
  assert.ok(Math.abs(y("tech_ap_ceiling") - (2.5 - 0.035 - 0.01)) < 1e-9);
  assert.equal(y("tech_srv_1u"), 0);
  // eigene Höhe gewinnt
  assert.equal(furnitureBaseY({ type: "tech_socket", mount_y: 1.1 }, 2.5), 1.1);
  // flache Wandtypen: Tiefe 1–5 cm, bis auf Außenstellen und Melder
  for (const t of WALL.filter((k) => !["tech_socket_outdoor", "tech_motion_sensor", "tech_smoke_detector"].includes(k))) {
    const d = FURNITURE[t][2];
    assert.ok(d >= 0.01 && d <= 0.05, `${t}: ${d}`);
  }
});

test("Wandtypen rasten an Wänden ein (Rückseite an der Wand), Server-Geräte und Rauchmelder nicht", () => {
  const faces = [{ p: [0, 0], u: [1, 0], n: [0, 1], t0: 0, t1: 5 }]; // Wand bei z = 0, Raum bei +z
  const sock = snapToWall({ type: "tech_socket", x: 2, z: 0.07, w: 0.08, d: 0.02, rotation: 90 }, faces);
  assert.deepEqual(sock, { x: 2, z: 0.01, rotation: 0 });
  const sw = snapToWall({ type: "tech_switch", x: 1, z: 0.1, w: 0.08, d: 0.02, rotation: 0 }, faces);
  assert.equal(sw.z, 0.01);
  const boiler = snapToWall({ type: "tech_condensing_boiler", x: 2, z: 0.4, w: 0.6, d: 0.75, rotation: 0 }, faces);
  assert.equal(boiler.z, 0.375);
  for (const t of ["tech_srv_1u", "tech_nas_2bay", "tech_ap_ceiling", "tech_smoke_detector"]) assert.equal(snapToWall({ type: t, x: 2, z: 0.2, w: 0.3, d: 0.3 }, faces), null, t);
});

test("Alle Modelle bauen in beiden Stilen, bleiben in Höhe und Fläche etwa im Maß", () => {
  for (const style of ["standard", "cyber"]) {
    for (const t of [...WALL, ...HEAT, ...SERVER]) {
      const [, w, d, h] = FURNITURE[t];
      const g = build({ id: t, type: t, w, d, h, rotation: 0 }, style);
      assert.ok(meshes(g).length >= 3, t);
      if (style !== "standard") continue;
      const b = box3(g);
      const base = furnitureBaseY({ type: t }, 2.5);
      assert.ok(b.max.y - base <= h + 0.02 && b.max.y - base >= h * 0.6, `${t}: Höhe ${b.max.y - base} statt ${h}`);
      assert.ok(b.max.x - b.min.x <= w + 0.14 && b.max.z - b.min.z <= d + 0.2, `${t}: Fläche`);
      // Wandtypen sitzen mit der Rückseite an der Wand (z = −d/2)
      if (WALL.includes(t) && t !== "tech_smoke_detector") assert.ok(b.min.z >= -d / 2 - 0.005, `${t}: ragt hinter die Wand`);
    }
  }
});

test("Kontroll-LED: Zustand der verknüpften Entität (grün, gelb, rot, aus)", () => {
  assert.equal(ledKind(null), "off");
  assert.equal(ledKind({ entity_id: "switch.x", state: "on" }), "green");
  assert.equal(ledKind({ entity_id: "switch.x", state: "off" }), "off");
  assert.equal(ledKind({ entity_id: "light.x", state: "on" }), "amber");
  assert.equal(ledKind({ entity_id: "binary_sensor.x", state: "on" }), "red");
  assert.equal(ledKind({ entity_id: "binary_sensor.x", state: "unavailable" }), "off");
  assert.equal(ledKind({ entity_id: "climate.x", state: "heat", attributes: { hvac_action: "heating" } }), "amber");
  assert.equal(ledKind({ entity_id: "climate.x", state: "heat", attributes: { hvac_action: "idle" } }), "green");
  assert.equal(ledKind({ entity_id: "climate.x", state: "off" }), "off");
});

test("Steckdosen und Schalter: onState färbt den Leuchtring bzw. die LED", () => {
  const M = furnitureMaterials("standard");
  const mats = ledMats(M);
  for (const t of WALL) {
    const g = buildFurniture({ id: t, type: t, x: 0, z: 0, entity: "switch.test" }, M, 0, 2.5);
    assert.equal(typeof g.userData.onState, "function", t);
    const used = () => new Set(meshes(g).map((m) => m.material).filter((m) => Object.values(mats).includes(m)));
    // ohne Zustand: aus; an: grün (Licht: gelb); wieder aus
    assert.deepEqual([...used()], [mats.off], `${t}: Anfangszustand`);
    g.userData.onState({ entity_id: "switch.test", state: "on" });
    assert.deepEqual([...used()], [mats.green], `${t}: an`);
    g.userData.onState({ entity_id: "light.test", state: "on" });
    assert.deepEqual([...used()], [mats.amber], `${t}: Licht an`);
    g.userData.onState({ entity_id: "switch.test", state: "off" });
    assert.deepEqual([...used()], [mats.off], `${t}: aus`);
    g.userData.onState(null);
    assert.deepEqual([...used()], [mats.off], `${t}: unbekannt`);
  }
  assert.equal(mats.green.emissive.getHex(), 0x00e676);
  assert.equal(mats.amber.emissive.getHex(), 0xffb300);
  assert.equal(mats.off.emissive.getHex(), 0);
  // Schuko-Steckdose: zwei dunkle Punkte (Löcher), die Gruppen haben mehrere Löcherpaare
  const count = (t) => meshes(build({ id: t, type: t })).filter((m) => m.geometry.type === "CylinderGeometry" && m.geometry.parameters.radiusTop < 0.0045).length;
  assert.equal(count("tech_socket"), 2);
  assert.equal(count("tech_socket_double"), 4);
  assert.equal(count("tech_socket_triple"), 6);
});

test("Server-Geräte: LEDs in bulbs (Switch mit 24 Port-LEDs), Tischgeräte mit Statusleuchte", () => {
  const bulbs = (t) => build({ id: t, type: t }).userData.bulbs.length;
  assert.ok(bulbs("tech_switch_24") >= 24 && bulbs("tech_switch_poe") >= 24);
  assert.ok(bulbs("tech_nas_rack") >= 12);
  assert.ok(bulbs("tech_srv_1u") >= 4);
  for (const t of ["tech_nas_2bay", "tech_nas_5bay", "tech_nas_8bay", "tech_mini_pc", "tech_sbc", "tech_tower_server", "tech_switch_8", "tech_wifi_router", "tech_ap_ceiling", "tech_modem", "tech_ups_tower", "tech_ups_2u", "tech_firewall", "tech_pdu", "tech_kvm"]) assert.ok(bulbs(t) >= 1, t);
  // Blindblende und Patchfeld leuchten nicht
  assert.equal(bulbs("tech_blank_panel"), 0);
  assert.equal(bulbs("tech_patch_panel"), 0);
});

test("Tischgerät im Schrank bekommt einen Fachboden, 19-Zoll-Geräte nicht", () => {
  const n = (item) => meshes(build({ x: 0, z: 0, ...item })).length;
  assert.equal(n({ id: "a", type: "tech_nas_5bay", in_rack: "c1" }), n({ id: "a", type: "tech_nas_5bay" }) + 2);
  assert.equal(n({ id: "a", type: "tech_srv_1u", in_rack: "c1" }), n({ id: "a", type: "tech_srv_1u" }));
});

test("Schrank: Platzhalter-Einschübe mit LEDs nur ohne eingebaute Geräte, Glastür getönt, Schienen vorn", () => {
  for (const style of ["standard", "cyber"]) {
    const M = furnitureMaterials(style);
    for (const type of ["network_cabinet", "server_rack"]) {
      const [, w, d, h] = FURNITURE[type];
      const item = { id: "c", type, x: 0, z: 0, w, d, h };
      const leds = (it) => meshes(buildFurniture(it, M, 0, 2.5)).filter((m) => m.material === M.led).length;
      const n = Math.max(2, Math.floor((h - 0.2) / 0.18));
      assert.equal(leds(item), n * 4, `${type}: leer wie bisher`);
      assert.equal(leds({ ...item, rack_used: 3 }), 0, `${type}: belegt`);
      assert.equal(leds({ ...item, rack_used: 0 }), n * 4, `${type}: rack_used 0 = leer`);
      const g = buildFurniture({ ...item, rack_used: 3 }, M, 0, 2.5);
      const glass = meshes(g).filter((m) => m.material.transparent && m.material.opacity < 0.4);
      assert.equal(glass.length, 1, `${type}: eine getönte Glastür`);
      const b = box3(glass[0]);
      assert.ok(Math.abs(b.max.z - d / 2) < 0.01 && b.max.y - b.min.y > h * 0.7, `${type}: Tür vorn`);
      assert.ok(Math.abs(box3(g).max.y - h) < 0.01 && Math.abs(box3(g).max.x - w / 2) < 0.01, `${type}: Maße`);
      // die Tür deckt nicht alles zu: innen ist genug Platz für ein Gerät (offener Rahmen, keine Vollkörper-Box)
      const solid = meshes(g).filter((m) => m.material !== glass[0].material && box3(m).getSize(new THREE.Vector3()).x > w * 0.9 && box3(m).getSize(new THREE.Vector3()).y > h * 0.5 && box3(m).getSize(new THREE.Vector3()).z > d * 0.9);
      assert.equal(solid.length, 0, `${type}: kein Vollkörper`);
    }
  }
});

test("Eingebautes Gerät liegt im Schrank (Lage aus dem Schrank, innerhalb der Schrankhöhe)", () => {
  const c = { id: "c1", type: "server_rack", x: 3, z: 3, rotation: 0, w: 0.6, d: 1.0, h: 2.0 };
  const dvs = ["tech_srv_4u", "tech_switch_24", "tech_nas_2bay"].map((t, i) => ({ id: `d${i}`, type: t, x: 3, z: 3, rotation: 0, w: FURNITURE[t][1], d: FURNITURE[t][2], h: FURNITURE[t][3] }));
  const before = { id: "eg", furniture: [c] };
  const after = structuredClone(before);
  after.furniture.push(...dvs);
  followMoves(before, after);
  const cb = box3(build(after.furniture[0]));
  for (const d of after.furniture.slice(1)) {
    assert.equal(d.in_rack, "c1");
    const db = box3(buildFurniture(d, furnitureMaterials("standard"), 0, 2.5));
    assert.ok(db.min.x >= cb.min.x + 0.01 && db.max.x <= cb.max.x - 0.01, `${d.type}: x`);
    assert.ok(db.min.z >= cb.min.z + 0.01 && db.max.z <= cb.max.z - 0.01, `${d.type}: z`);
    assert.ok(db.min.y >= 0.08 - 1e-6 && db.max.y <= 2.0 - 0.05 + 1e-6, `${d.type}: y ${db.min.y}…${db.max.y}`);
  }
  // die Geräte liegen übereinander, ohne sich zu durchdringen
  const ys = after.furniture.slice(1).map((d) => [d.mount_y, d.mount_y + d.h]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i][0] >= ys[i - 1][1] - 1e-6, JSON.stringify(ys));
});

test("Felder: Schrank zeigt Belegung und Geräteliste, Gerät Einbau, Höheneinheit und Ausbauen", () => {
  const c = { id: "c1", type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2 };
  const free = { id: "d9", type: "tech_switch_24", x: 9, z: 9, w: 0.482, d: 0.28, h: 0.0445 };
  const before = { id: "eg", furniture: [c] };
  const floor = structuredClone(before);
  floor.furniture.push({ id: "d1", type: "tech_srv_1u", x: 5, z: 5, rotation: 0, w: 0.482, d: 0.5, h: 0.0445 }, { id: "d2", type: "tech_ups_2u", name: "Rack-USV", x: 5, z: 5, rotation: 0, w: 0.482, d: 0.45, h: 0.089 });
  followMoves(before, floor);
  floor.furniture.push(free);
  const ed = { floor };
  const html = (m) => TECH_FIELDS.html(m, ed);
  const cab = html(floor.furniture[0]);
  assert.match(cab, /Belegt: 3 von 22 HE/);
  assert.ok(cab.indexOf("Rack-USV") < cab.indexOf("Server 1 HE"), "von oben nach unten");
  assert.match(cab, /HE 2–3 · Rack-USV/);
  assert.match(cab, /HE 1 · Server 1 HE/);
  const inRack = html(floor.furniture[2]);
  assert.match(inRack, /Im Schrank: Netzwerkschrank · HE 2–3/);
  assert.match(inRack, /Höheneinheit \(unten\)/);
  assert.match(inRack, /Ausbauen/);
  const loose = html(free);
  assert.match(loose, /In Schrank einbauen/);
  assert.match(loose, /Netzwerkschrank · 19 von 22 HE frei/);
  assert.doesNotMatch(loose, /disabled/);
  // zu tiefes Gerät: Schrank nicht wählbar
  assert.match(html({ ...free, type: "tech_srv_4u", d: 0.7, h: 0.178 }), /disabled>Netzwerkschrank · 19 von 22 HE frei \(zu tief\)/);
  // kein Schrank
  assert.match(TECH_FIELDS.html(free, { floor: { furniture: [free] } }), /kein Netzwerk- oder Serverschrank/);
  // andere Möbel: nichts
  assert.equal(TECH_FIELDS.html({ id: "s", type: "sofa" }, ed), "");
  assert.equal(TECH_FIELDS.html({ id: "s", type: "tech_socket" }, ed), "");
});

test("Anker-Erweiterungsakkus: zwei Typen, Maße nach Herstellerangaben, Kategorie „Wechselrichter & Speicher“", () => {
  for (const [k, kwh] of [["bat_anker_bp1600", "1,6"], ["bat_anker_bp2700", "2,7"]]) {
    const [name, w, d, h] = EXTRA[k];
    assert.match(name, new RegExp(`^Erweiterungsakku ${kwh} kWh \\(Maße wie Anker SOLIX BP${kwh === "1,6" ? "1600" : "2700"}\\)$`));
    assert.deepEqual([w, d, h], [0.46, 0.233, 0.2175]);
    assert.ok(new Map(EXTRA_CATEGORIES).get("Wechselrichter & Speicher").includes(k));
    assert.deepEqual(FURNITURE[k], EXTRA[k]);
    // gleicher Farbsatz wie die übrigen Speicher
    const colors = (t) => new Set(meshes(build({ id: t, type: t })).map((m) => m.material.color.getHex()));
    assert.deepEqual([...colors(k)].sort(), [...colors("bat_anker_solarbank")].sort());
  }
});

test("Anker-Stapel: Erweiterungsakkus unter dem Speicher, Höhe folgt der Anzahl", () => {
  const M = furnitureMaterials("standard");
  const whites = (item) => meshes(buildFurniture(item, M, 0, 2.5)).filter((m) => m.material === M.white);
  assert.deepEqual([PACK_STACK.base, PACK_STACK.pack, PACK_STACK.max], [0.254, 0.2175, 5]);
  for (let n = 0; n <= 5; n++) {
    const h = packHeight(n);
    assert.ok(Math.abs(h - (0.254 + n * 0.2175)) < 1e-9);
    const item = { id: "b", type: "bat_anker_solarbank", x: 0, z: 0, w: 0.46, d: 0.249, h, ...(n ? { packs: n } : {}) };
    const g = buildFurniture(item, M, 0, 2.5);
    assert.equal(whites(item).length, n + 1, `${n} Akkus`);
    const b = box3(g);
    assert.ok(Math.abs(b.max.y - h) < 0.01 && Math.abs(b.min.y) < 1e-6, `${n}: Höhe ${b.max.y} statt ${h}`);
    assert.ok(Math.abs(b.max.x - 0.23) < 1e-6);
    // das Hauptgerät sitzt oben, die Akkus liegen darunter (flacher, an der Rückseite bündig)
    const tops = whites(item).map((m) => box3(m).max.y).sort((x, y) => x - y);
    assert.ok(Math.abs(tops.at(-1) - h) < 0.006);
    assert.equal(g.userData.bulbs.length, 4);
  }
  assert.equal(packCount({ type: "bat_anker_solarbank", packs: 9 }), 5);
  assert.equal(packCount({ type: "bat_anker_solarbank", packs: -2 }), 0);
  assert.equal(packCount({ type: "bat_anker_solarbank" }), 0);
  assert.equal(packCount({ type: "bat_tesla_pw3", packs: 3 }), 0);
  // die Höhe eines anderen Möbels ändert nichts am Modell
  assert.equal(whites({ id: "t", type: "bat_tesla_pw3", x: 0, z: 0, packs: 3 }).length, whites({ id: "t", type: "bat_tesla_pw3", x: 0, z: 0 }).length);
  // Feld „Erweiterungsakkus darunter“
  const html = TECH_FIELDS.html({ id: "b", type: "bat_anker_solarbank", packs: 2 }, { floor: { furniture: [] } });
  assert.match(html, /Erweiterungsakkus darunter/);
  assert.match(html, /data-tech-packs[^>]*value="2"/);
  assert.match(html, /max="5"/);
});

test("Marken: Technik-Dateien nennen keine Hersteller (nur catalog-extra.js und energytemplates.js dürfen)", () => {
  const BRAND = /\b(ikea|playstation|xbox|nintendo|steam deck|solarbank|powerwall|unifi|ubiquiti|tibber|nordpool|awattar|epex|fronius|senec|huawei|victron|growatt|sungrow|goodwe|deye|byd|zendure|ecoflow|marstek|hoymiles|opendtu|apsystems|kostal|solaredge|pylontech|easee|keba|zaptec|tesla|anker|solix)\b/i;
  const dir = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
  for (const f of ["catalog-tech.js", "furniture-tech.js", "furniture-tech-wall.js", "furniture-tech-heat.js", "furniture-tech-rack.js", "tech-parts.js", "cabinet-model.js", "rack.js", "follow-rack.js", "fields-tech.js"]) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), "utf8"), BRAND, f);
  }
  // Kategorie- und Typnamen ohne Marken
  for (const [cat, types] of [["Steckdosen & Schalter", WALL], ["Heizungsraum", HEAT], ["Server & NAS", SERVER]]) {
    assert.doesNotMatch(cat, BRAND);
    for (const t of types) assert.doesNotMatch(FURNITURE[t][0], /ikea|apple|google|amazon|samsung|philips|sony|valve|steam|hue\b/i, t);
  }
  assert.equal(TECH_PACK.outdoor.length, 0);
});
