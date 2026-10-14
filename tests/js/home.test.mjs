// Katalog „Wohnen, Küche, Kamin, Vorhänge“: Kategorien, Montagehöhen, Modelle im Rahmen, Vorhang und Kamin folgen ihrer Entität
import assert from "node:assert/strict";
import { test } from "node:test";

import { HOME_FIRE_TYPES, HOME_OPEN_TYPES, HOME_PACK } from "../../custom_components/haus3d/frontend/catalog-home.js";
import { MORE_FREE, MORE_MOUNT } from "../../custom_components/haus3d/frontend/catalog-more.js";
import { snapToWall } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { HOME_FIELDS, openPercent } from "../../custom_components/haus3d/frontend/fields-home.js";
import { FURNITURE, FURNITURE_CATEGORIES, FURNITURE_GROUPS, buildFurniture, furnitureBaseY, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { fireFromState, openFromItem, openFromState } from "../../custom_components/haus3d/frontend/home-parts.js";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";

const CATEGORIES = ["Wohnen & Deko", "Pflanzen", "Küchengeräte", "Kamin & Ofen", "Vorhänge", "Haustiere", "Kinderzimmer"];
const TYPES = Object.keys(HOME_PACK.items);
const STD = furnitureMaterials("standard");
// mount_y 0: Modell steht im Ursprung, damit die Bounding-Box dem Rahmen entspricht
const build = (type, item = {}, M = STD) => buildFurniture({ id: `t_${type}`, type, x: 0, z: 0, rotation: 0, mount_y: 0, ...item }, M, 0, 2.5);
const atDefault = (type) => buildFurniture({ id: `d_${type}`, type, x: 0, z: 0 }, STD, 0, 2.5);
const box = (obj) => new THREE.Box3().setFromObject(obj, true);

test("Katalog: sieben Kategorien unter „Drinnen“, 70–90 Typen mit Präfix home_, eindeutig", () => {
  const cats = new Map(FURNITURE_CATEGORIES);
  const indoor = FURNITURE_GROUPS.find(([g]) => g === "Drinnen")[1];
  for (const c of CATEGORIES) {
    assert.ok(cats.has(c), c);
    assert.ok(indoor.includes(c), `${c} unter Drinnen`);
    assert.ok(cats.get(c).length >= 7, c);
  }
  assert.deepEqual(HOME_PACK.categories.map(([c]) => c), CATEGORIES);
  const listed = HOME_PACK.categories.flatMap(([, ts]) => ts);
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual([...listed].sort(), [...TYPES].sort());
  assert.ok(TYPES.length >= 70 && TYPES.length <= 90, `${TYPES.length} Typen`);
  for (const k of TYPES) {
    assert.match(k, /^home_[a-z0-9_]+$/, k);
    assert.doesNotMatch(k, /^(lamp_|led_|ikea_|inv_|bat_|micro_|pv_|wallbox|console_)/, k);
    const [name, w, d, h] = HOME_PACK.items[k];
    assert.ok(name && w > 0 && d > 0 && h > 0, k);
    assert.deepEqual(FURNITURE[k], HOME_PACK.items[k], k);
  }
  const names = TYPES.map((k) => HOME_PACK.items[k][0]);
  assert.equal(new Set(names).size, names.length, "Namen doppelt");
  assert.deepEqual(HOME_PACK.outdoor, []);
});

test("Montagehöhen und freie Typen: Wand, Arbeitsplatte, Möbel, Decke", () => {
  const free = new Set(HOME_PACK.free);
  for (const k of [...Object.keys(HOME_PACK.mount), ...HOME_PACK.free]) assert.ok(HOME_PACK.items[k], k);
  for (const [k, v] of Object.entries(HOME_PACK.mount)) assert.ok(v === "ceiling" || (typeof v === "number" && v >= 0 && v <= 2.2), k);
  for (const k of Object.keys(HOME_PACK.mount)) assert.equal(MORE_MOUNT[k], HOME_PACK.mount[k], k);
  for (const k of HOME_PACK.free) assert.ok(MORE_FREE.includes(k), k);
  // Wandtypen rasten ein (nicht frei) und hängen in ihrer Höhe
  const wall = { home_frame: 1.4, home_canvas: 1.2, home_gallery: 1.3, home_mirror_round: 1.1, home_clock: 1.9, home_wall_shelf: 1.4, home_hood_wall: 1.55, home_fireplace_ethanol: 1.0, home_spice_rack: 1.1 };
  for (const [k, y] of Object.entries(wall)) {
    assert.equal(HOME_PACK.mount[k], y, k);
    assert.ok(!free.has(k), `${k} rastet an der Wand ein`);
  }
  // Arbeitsplatte 0,9 m, frei stehend
  for (const k of ["home_coffee_auto", "home_espresso", "home_microwave", "home_kettle", "home_toaster", "home_stand_mixer", "home_fruit_bowl", "home_bread_bin", "home_knife_block", "home_herb_pot"]) {
    assert.equal(HOME_PACK.mount[k], 0.9, k);
    assert.ok(free.has(k), k);
  }
  // auf Möbeln 0,5–0,75 m
  for (const k of ["home_books_row", "home_vase", "home_candles", "home_turntable", "home_globe", "home_books_stack", "home_cushions"]) {
    assert.ok(HOME_PACK.mount[k] >= 0.45 && HOME_PACK.mount[k] <= 0.75, k);
    assert.ok(free.has(k), k);
  }
  assert.equal(HOME_PACK.mount.home_orchid, 0.9);
  assert.equal(HOME_PACK.mount.home_herbs, 0.9);
  // Decke: Vorhänge (Oberkante unter der Decke), Hängepflanze, Inselhaube; Raffrollo und Plissee über dem Fenster
  for (const k of [...HOME_OPEN_TYPES.filter((t) => !/roman|pleated/.test(t)), "home_hanging", "home_hood_island"]) assert.equal(HOME_PACK.mount[k], "ceiling", k);
  for (const k of ["home_roman_blind", "home_pleated"]) {
    assert.equal(typeof HOME_PACK.mount[k], "number", k);
    assert.ok(!free.has(k), k);
  }
  for (const k of HOME_OPEN_TYPES.filter((t) => !/roman|pleated/.test(t))) assert.ok(!free.has(k), `${k} rastet an der Wand ein`);
  // Höhe im Modell
  const [, , , h] = HOME_PACK.items.home_curtain_pair;
  assert.ok(Math.abs(furnitureBaseY({ type: "home_curtain_pair" }, 2.5) - (2.5 - h - 0.01)) < 1e-9);
  assert.ok(Math.abs(furnitureBaseY({ type: "home_hood_island" }, 2.5) - (2.5 - 0.8 - 0.01)) < 1e-9);
  assert.equal(furnitureBaseY({ type: "home_curtain_pair", mount_y: 0.3 }, 2.5), 0.3);
  assert.equal(atDefault("home_hood_wall").position.y, 1.55);
  assert.equal(atDefault("home_coffee_auto").position.y, 0.9);
  assert.equal(atDefault("home_unbekannt").children.length, 1); // unbekannter Typ fällt auf einen Quader zurück
  // Einrasten: Wandtypen ja, Möbel-Dekor nein
  const face = { p: [0, 0], u: [1, 0], n: [0, 1], t0: 0, t1: 6 };
  const snapped = snapToWall({ type: "home_curtain_pair", x: 3, z: 0.1, w: 2.4, d: 0.12 }, [face]);
  assert.ok(snapped && Math.abs(snapped.z - 0.06) < 1e-6 && snapped.rotation === 0, JSON.stringify(snapped));
  assert.equal(snapToWall({ type: "home_books_row", x: 3, z: 0.1, w: 0.6, d: 0.2 }, [face]), null);
});

test("Alle Modelle bleiben in beiden Stilen im Rahmen (Breite × Tiefe × Höhe) und füllen ihn", () => {
  const tol = 0.03;
  const open = new Set(["home_roman_blind", "home_pleated"]); // standardmäßig hochgezogen: nur ein Stapel oben
  for (const style of ["standard", "cyber"]) {
    const M = style === "cyber" ? furnitureMaterials("cyber") : STD;
    for (const [type, [, w, d, h]] of Object.entries(HOME_PACK.items)) {
      const g = build(type, { w, d, h }, M);
      let meshes = 0;
      g.traverse((o) => o.isMesh && meshes++);
      assert.ok(meshes >= 3, type);
      const b = box(g);
      const where = `${style} ${type}: ${b.min.toArray().map((v) => v.toFixed(3))} | ${b.max.toArray().map((v) => v.toFixed(3))}`;
      assert.ok(b.min.x >= -w / 2 - tol && b.max.x <= w / 2 + tol, `x ${where}`);
      assert.ok(b.min.z >= -d / 2 - tol && b.max.z <= d / 2 + tol, `z ${where}`);
      assert.ok(b.min.y >= -tol && b.max.y <= h + tol, `y ${where}`);
      const s = b.getSize(new THREE.Vector3());
      assert.ok(s.x >= w * 0.6, `Breite ${where}`);
      assert.ok(s.z >= d * 0.4, `Tiefe ${where}`);
      if (!open.has(type)) assert.ok(s.y >= h * 0.6 || h < 0.05, `Höhe ${where}`);
    }
  }
});

test("Modelle sind liebevoll gestaltet: Buchrücken, Bildmotive und Blumen in mehreren Farben", () => {
  const colors = (type) => {
    const set = new Set();
    build(type).traverse((o) => o.isMesh && set.add(o.material.color?.getHex()));
    return set.size;
  };
  assert.ok(colors("home_books_row") >= 6);
  assert.ok(colors("home_frame") >= 5);
  assert.ok(colors("home_gallery") >= 8);
  assert.ok(colors("home_vase") >= 6);
  assert.ok(colors("home_play_rug") >= 6);
  // mehrere Rahmen mit unterschiedlichen Kennungen zeigen nicht alle dasselbe Motiv
  const looks = new Set();
  for (const id of ["a", "b", "c", "d", "e"]) {
    const g = buildFurniture({ id, type: "home_frame", x: 0, z: 0 }, STD, 0, 2.5);
    const c = [];
    g.traverse((o) => o.isMesh && c.push(o.material.color.getHex()));
    looks.add(c.join());
  }
  assert.ok(looks.size >= 3, `${looks.size} Motive`);
  // eigene Farbe färbt Stoff und Holz (Kissen, Sessel), ohne das Modell zu zerstören
  const g = build("home_reading_chair", { color: "#00aa44" });
  assert.ok(g.children.length > 10);
});

test("Leuchtende Teile: Lichterkette, Aquarium, Terrarium, Hauben folgen einem Licht; Flammen nie", () => {
  for (const k of ["home_fairy_lights", "home_aquarium", "home_terrarium", "home_hood_wall", "home_hood_island"]) assert.ok(build(k).userData.bulbs.length > 0, k);
  assert.ok(build("home_fairy_lights").userData.bulbs.length >= 8);
  for (const k of HOME_FIRE_TYPES) {
    const g = build(k, { fire: true });
    assert.equal(g.userData.bulbs.length, 0, k);
    const fl = g.userData.flames;
    assert.ok(fl && fl.children.length >= 6, k);
    const inFlames = [];
    fl.traverse((o) => o.isMesh && inFlames.push(o));
    for (const m of inFlames) assert.ok(!g.userData.bulbs.includes(m));
  }
});

/** Breite (x) bzw. Höhe (y) der Teile eines Vorhangs. */
const span = (g, axis = "x") => g.userData.curtain.parts.map((p) => {
  const s = box(p).getSize(new THREE.Vector3());
  return s[axis];
});

test("Vorhang zweiteilig: Feld „Geöffnet (%)“ wirkt ohne Entität, 100 = Schals zur Seite gerafft", () => {
  const w = 2.4;
  const widths = (open) => span(build("home_curtain_pair", open === undefined ? {} : { open }));
  const [l100, r100] = widths(undefined);
  const [l0, r0] = widths(0);
  const [l50] = widths(50);
  // zu: jeder Schal deckt seine Fensterhälfte, offen: schmale Bündel an den Seiten
  assert.ok(l0 > w * 0.4 && r0 > w * 0.4, `zu ${l0} ${r0}`);
  assert.ok(l100 < 0.4 && r100 < 0.4, `offen ${l100} ${r100}`);
  assert.ok(l50 < l0 - 0.2 && l50 > l100 + 0.1, `halb ${l50}`);
  // fehlendes oder ungültiges Feld: ganz offen
  assert.ok(widths("abc")[0] < 0.4);
  assert.ok(widths("")[0] < 0.4);
  assert.equal(openFromItem({}), 1);
  assert.equal(openFromItem({ open: 0 }), 0);
  assert.equal(openFromItem({ open: 250 }), 1);
  assert.equal(openFromItem({ open: -4 }), 0);
  assert.equal(openFromItem({ open: "40" }), 0.4);
  // Schals bleiben an ihrer Seite: links offen = am linken Rand, rechts am rechten
  const g = build("home_curtain_pair");
  const [bl, br] = g.userData.curtain.parts.map((p) => box(p));
  assert.ok(bl.max.x < -w / 2 + 0.5 && br.min.x > w / 2 - 0.5);
});

test("Vorhang: onState einer verknüpften Rollladen-/cover-Entität bewegt die Teile ohne Neuaufbau", () => {
  const g = build("home_curtain_pair", { open: 50 });
  const parts = [...g.userData.curtain.parts];
  const count = g.children.length;
  const width = () => span(g)[0];
  const at = (pos) => {
    g.userData.onState({ entity_id: "cover.test", state: pos > 0 ? "open" : "closed", attributes: { current_position: pos } });
    return width();
  };
  const w0 = at(0);
  const w100 = at(100);
  const w40 = at(40);
  assert.ok(w0 > 1.0 && w100 < 0.4, `${w0} ${w100}`);
  assert.ok(w40 < w0 && w40 > w100);
  // ohne Position gelten die Zustandswörter
  const st = (state, attributes = {}) => {
    g.userData.onState({ entity_id: "cover.test", state, attributes });
    return width();
  };
  assert.ok(Math.abs(st("closed") - w0) < 1e-6);
  assert.ok(Math.abs(st("open") - w100) < 1e-6);
  assert.ok(Math.abs(st("closing") - w0) < 1e-6);
  assert.ok(Math.abs(st("opening") - w100) < 1e-6);
  // Schalter und Hilfsschalter: an = zu
  g.userData.onState({ entity_id: "switch.test", state: "on", attributes: {} });
  assert.ok(Math.abs(width() - w0) < 1e-6);
  g.userData.onState({ entity_id: "input_boolean.test", state: "off", attributes: {} });
  assert.ok(Math.abs(width() - w100) < 1e-6);
  // unklarer Zustand oder keine Entität: das Feld (50 %) gilt wieder
  const w50 = (() => width())();
  g.userData.onState({ state: "unavailable", attributes: {} });
  const unclear = width();
  g.userData.onState(null);
  assert.ok(Math.abs(width() - unclear) < 1e-6);
  assert.ok(unclear < w0 && unclear > w100, `${unclear} (zuletzt ${w50})`);
  // Teile blieben dieselben Objekte
  assert.equal(g.children.length, count);
  assert.deepEqual(g.userData.curtain.parts, parts);
  // Zustandsregeln einzeln
  assert.equal(openFromState({ state: "open", attributes: { current_position: "30" } }), 0.3);
  assert.equal(openFromState({ state: "closed", attributes: { current_position: 100 } }), 1); // Position vor Zustandswort
  assert.equal(openFromState({ state: "idle", attributes: {} }), null);
  assert.equal(openFromState(null), null);
});

test("Raffrollo und Plissee: hochgezogen bei 100, ganz herunten bei 0, folgen der cover-Position", () => {
  for (const [type, h] of [["home_roman_blind", 1.4], ["home_pleated", 1.4]]) {
    const down = build(type, { open: 0 });
    const up = build(type, { open: 100 });
    const [hd] = span(down, "y");
    const [hu] = span(up, "y");
    assert.ok(hd > h * 0.85, `${type} unten ${hd}`);
    assert.ok(hu < h * 0.3, `${type} oben ${hu}`);
    const g = build(type);
    g.userData.onState({ entity_id: "cover.test", state: "open", attributes: { current_position: 0 } });
    assert.ok(Math.abs(span(g, "y")[0] - hd) < 1e-6, type);
    g.userData.onState({ entity_id: "cover.test", state: "open", attributes: { current_position: 100 } });
    assert.ok(Math.abs(span(g, "y")[0] - hu) < 1e-6, type);
  }
  // die Unterschiene sitzt am unteren Rand des Stoffs
  const g = build("home_roman_blind", { open: 0 });
  assert.ok(box(g).min.y <= 0.001);
});

test("Alle Vorhangtypen: Teile bewegen sich, Stoff bleibt hängend, Sheer ist halbtransparent", () => {
  for (const k of HOME_OPEN_TYPES) {
    const g = build(k);
    assert.equal(typeof g.userData.onState, "function", k);
    assert.ok(g.userData.curtain.parts.length >= 1, k);
    const a = JSON.stringify(g.userData.curtain.parts.map((p) => box(p).max.toArray()));
    g.userData.onState({ state: "open", attributes: { current_position: 0 } });
    const b = JSON.stringify(g.userData.curtain.parts.map((p) => box(p).max.toArray()));
    assert.notEqual(a, b, `${k} bewegt sich nicht`);
  }
  const sheer = build("home_sheer");
  const mats = new Set();
  sheer.userData.curtain.parts.forEach((p) => p.traverse((o) => o.isMesh && mats.add(o.material)));
  assert.ok([...mats].every((m) => m.transparent && m.opacity < 0.7));
  const thermal = build("home_blackout");
  let dark = true;
  thermal.userData.curtain.parts.forEach((p) => p.traverse((o) => o.isMesh && (dark &&= new THREE.Color(o.material.color).getHSL({}).l < 0.3)));
  assert.ok(dark, "Verdunkelung ist dunkel");
});

test("Kamin: Feld „Feuer an“ und onState blenden die Flammen ein/aus (ohne Neuaufbau)", () => {
  for (const k of HOME_FIRE_TYPES) {
    const off = build(k);
    const on = build(k, { fire: true });
    assert.equal(off.userData.flames.visible, false, `${k} Standard aus`);
    assert.equal(on.userData.flames.visible, true, `${k} Feuer an`);
    assert.equal(build(k, { fire: false }).userData.flames.visible, false);
  }
  const g = build("home_stove_wood");
  const fl = g.userData.flames;
  const kids = fl.children.length;
  const count = g.children.length;
  const set = (state, attributes = {}, id = "climate.test") => {
    g.userData.onState({ entity_id: id, state, attributes });
    return fl.visible;
  };
  assert.equal(set("on", {}, "switch.test"), true);
  assert.equal(set("off", {}, "switch.test"), false);
  assert.equal(set("heat"), true);
  assert.equal(set("off"), false);
  assert.equal(set("heating"), true);
  assert.equal(set("off", { hvac_action: "off" }), false);
  assert.equal(set("auto", { hvac_action: "heating" }), true);
  assert.equal(set("heat_cool", { hvac_action: "idle" }), false);
  // unklar oder keine Entität: das Feld gilt
  g.userData.onState({ state: "unavailable", attributes: {} });
  assert.equal(fl.visible, false);
  const lit = build("home_fireplace_open", { fire: true });
  lit.userData.onState({ state: "unknown", attributes: {} });
  assert.equal(lit.userData.flames.visible, true);
  lit.userData.onState({ state: "off", attributes: {} });
  assert.equal(lit.userData.flames.visible, false);
  lit.userData.onState(null);
  assert.equal(lit.userData.flames.visible, true);
  // dieselben Objekte, nichts neu gebaut
  assert.equal(g.userData.flames, fl);
  assert.equal(fl.children.length, kids);
  assert.equal(g.children.length, count);
  assert.equal(fireFromState({ state: "heat", attributes: {} }), true);
  assert.equal(fireFromState({ state: "idle", attributes: { hvac_action: "idle" } }), false);
  assert.equal(fireFromState(null), null);
});

test("Zusatzfelder: „Feuer an“ bei Kamin und Ofen, „Geöffnet (%)“ bei Vorhängen, sonst nichts", () => {
  for (const k of TYPES) {
    const html = HOME_FIELDS.html({ id: "m", type: k }, {});
    if (HOME_FIRE_TYPES.includes(k)) {
      assert.match(html, /Feuer an/, k);
      assert.match(html, /data-home-fire/);
      assert.match(html, /Vorrang/);
      assert.doesNotMatch(html, /checked/);
    } else if (HOME_OPEN_TYPES.includes(k)) {
      assert.match(html, /Geöffnet \(%\)/, k);
      assert.match(html, /data-home-open[^>]*value="100"/);
      assert.match(html, /Rollladen-\/cover-Entität/);
    } else assert.equal(html, "", k);
  }
  assert.match(HOME_FIELDS.html({ type: "home_stove_wood", fire: true }, {}), /data-home-fire checked/);
  assert.match(HOME_FIELDS.html({ type: "home_pleated", open: 35 }, {}), /value="35"/);
  assert.equal(HOME_FIELDS.html({ type: "sofa" }, {}), "");
  assert.equal(openPercent({ open: 400 }), 100);
  assert.equal(openPercent({ open: "x" }), 100);
  assert.equal(openPercent({ open: 0 }), 0);
});

test("Zusatzfelder binden: Häkchen setzt/löscht fire, Prozent wird auf 0–100 begrenzt", () => {
  const handlers = {};
  const input = (key) => ({ value: "", checked: false, addEventListener: (ev, fn) => (handlers[key] = fn) });
  const fields = { "[data-home-fire]": input("fire"), "[data-home-open]": input("open") };
  const el = { querySelector: (s) => fields[s] ?? null };
  const item = {};
  let rendered = 0;
  const ed = { renderProps: () => rendered++ };
  HOME_FIELDS.bind(el, item, ed, (fn) => fn(item));
  handlers.fire({ target: { checked: true } });
  assert.equal(item.fire, true);
  handlers.fire({ target: { checked: false } });
  assert.ok(!("fire" in item));
  handlers.open({ target: { value: "250" } });
  assert.equal(item.open, 100);
  handlers.open({ target: { value: "35" } });
  assert.equal(item.open, 35);
  handlers.open({ target: { value: "" } });
  assert.ok(!("open" in item));
  assert.equal(rendered, 3);
  // fremde Typen: kein Fehler ohne die Felder
  HOME_FIELDS.bind({ querySelector: () => null }, {}, ed, () => {});
});

test("Frontend-Modul-Größe und Namen: keine Markenwörter in den neuen Dateien", async () => {
  const { readFileSync, statSync } = await import("node:fs");
  const dir = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
  for (const f of ["catalog-home.js", "furniture-home.js", "furniture-home2.js", "furniture-home3.js", "furniture-home4.js", "home-parts.js", "fields-home.js"]) {
    assert.ok(statSync(new URL(f, dir)).size < 125000, f);
    assert.doesNotMatch(readFileSync(new URL(f, dir), "utf8"), /\b(ikea|playstation|xbox|nintendo|tesla|apple|google|amazon|samsung|philips|sony|microsoft)\b/i, f);
  }
});
