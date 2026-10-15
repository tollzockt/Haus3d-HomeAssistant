// Schrank bestücken: HTML der Eigenschaften (Kopf, HE-Leiste, Liste, Vorlagen, Tür, Knöpfe am Gerät) – ohne DOM, nur Text
import assert from "node:assert/strict";
import { test } from "node:test";

import { TECH_FIELDS } from "../../custom_components/haus3d/frontend/fields-tech.js";
import { followMoves } from "../../custom_components/haus3d/frontend/follow.js";
import { newRackItem } from "../../custom_components/haus3d/frontend/rack-plan.js";
import { RACK_STYLE, rackListHtml, rackStripHtml } from "../../custom_components/haus3d/frontend/rack-strip.js";

const cab = (o = {}) => ({ id: "c1", type: "network_cabinet", x: 5, z: 5, rotation: 0, w: 0.6, d: 0.6, h: 1.2, ...o });
const edit = (floor, fn) => {
  const after = structuredClone(floor);
  fn(after);
  return followMoves(floor, after);
};
const withDevices = (c, list) => {
  let f = { id: "eg", furniture: [c] };
  for (const [i, [type, u, extra]] of list.entries()) f = edit(f, (fl) => fl.furniture.push({ ...newRackItem(c, type, u, `d${i}`), ...extra }));
  return f;
};
const html = (m, ed) => TECH_FIELDS.html(m, ed);
const count = (s, re) => (s.match(re) ?? []).length;

test("Leere Leiste: 22 freie Zeilen, Nummern 1 unten, Lückenbeschriftung, Kopf, Tür, Vorlagen, Lücken schließen", () => {
  const c = cab();
  const floor = { id: "eg", furniture: [c] };
  const h = html(c, { floor });
  assert.match(h, /<label>Bestückung<\/label><p class="muted" data-tech-used>Belegt: 0 von 22 HE · 0 Geräte<\/p>/);
  assert.equal(count(h, /data-rack-free="/g), 22);
  assert.match(h, /data-rack-free="9" role="button" tabindex="0" aria-label="HE 9 frei – Gerät einbauen"/);
  assert.match(h, /<div class="rackstrip" data-rack-strip="c1"/);
  assert.match(h, /<svg width="260" height="536"/, "22 × 24 + 8");
  assert.match(h, />frei · 22 HE</);
  // Nummern: 1 unten – im DOM oben 22 zuerst
  const nums = [...h.matchAll(/class="num"[^>]*>(\d+)</g)].map((x) => Number(x[1]));
  assert.deepEqual(nums, Array.from({ length: 22 }, (_, i) => 22 - i));
  // freie Zeilen von oben nach unten
  const free = [...h.matchAll(/data-rack-free="(\d+)"/g)].map((x) => Number(x[1]));
  assert.deepEqual(free, nums);
  assert.match(h, /Freie HE antippen: Gerät einbauen\. Gerät antippen: wählen\. Mit der Maus ziehen ordnet um, am Tablet ▲\/▼\./);
  assert.match(h, /<button data-rack-fill title="Freie HE mit Blindblenden füllen \(2 HE, Rest 1 HE\)">Lücken schließen<\/button>/);
  assert.match(h, /<label>Vorlage<\/label><select data-rack-tpl>/);
  assert.match(h, /Heimnetz klein \(5 Teile, 10 HE\)/);
  assert.match(h, /Homelab \(6 Teile, 8 HE\)/);
  assert.match(h, /<button data-rack-tpl-go>Bestücken<\/button>/);
  assert.match(h, /Nur für einen leeren Schrank\. Strg\+Z macht das Bestücken in einem Schritt rückgängig\./);
  assert.match(h, /<label class="chk"><input type="checkbox" data-tech-door> Tür offen<\/label>/);
  assert.match(h, /Offen ist die Front direkt sichtbar – im Editor-3D und im Panel\./);
  assert.doesNotMatch(h, /disabled/);
  // Tür offen: Haken
  assert.match(html(cab({ open: true }), { floor }), /data-tech-door checked>/);
  assert.doesNotMatch(html(cab({ open: 1 }), { floor }), /data-tech-door checked>/);
});

test("Tablet: Zeilenhöhe 32 px; Serverschrank 42 HE", () => {
  const c = cab();
  const floor = { id: "eg", furniture: [c] };
  assert.match(html(c, { floor, coarse: true }), /<svg width="260" height="712"/, "22 × 32 + 8");
  const s = cab({ id: "s1", type: "server_rack", d: 1.0, h: 2.0 });
  const sf = { id: "eg", furniture: [s] };
  const h = html(s, { floor: sf });
  assert.equal(count(h, /data-rack-free="/g), 42);
  assert.match(h, /Belegt: 0 von 42 HE/);
  assert.match(h, /height="1016"/, "42 × 24 + 8");
});

test("Belegte Leiste: Geräte von oben nach unten, HE-Bereiche, Namen, Fachboden, Lücken", () => {
  const c = cab();
  const floor = withDevices(c, [
    ["tech_srv_1u", 1, {}],
    ["tech_ups_2u", 2, { name: "Rack-USV" }],
    ["tech_blank_panel", 4, {}],
    ["tech_wifi_router", 8, {}], // 8–12, Fachboden
  ]);
  const h = html(floor.furniture[0], { floor });
  assert.match(h, /Belegt: 9 von 22 HE · 4 Geräte/);
  const labels = [...h.matchAll(/class="dev[^"]*"[^>]*aria-label="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(labels, ["HE 8–12 · WLAN-Router (Fachboden)", "HE 4 · Blindblende 1 HE", "HE 2–3 · Rack-USV", "HE 1 · Server 1 HE"]);
  assert.match(h, /<title>HE 2–3 · Rack-USV<\/title>/);
  assert.match(h, /data-tech-pick="d1" data-u="2" data-he="2"/);
  assert.equal(count(h, /data-rack-free="/g), 22 - 9);
  // Blende ist passiv (schraffiert)
  assert.match(h, /class="dev passive" data-tech-pick="d2"/);
  assert.doesNotMatch(h, /class="dev passive" data-tech-pick="d1"/);
  assert.match(h, /fill="url\(#rackhatch\)"/);
  // Lücken: HE 5–7 (3), 13–22 (10)
  assert.match(h, />frei · 3 HE</);
  assert.match(h, />frei · 10 HE</);
  // Reihenfolge im DOM: oben zuerst, freie und belegte Zeilen gemischt von oben nach unten
  const seq = [...h.matchAll(/data-rack-free="(\d+)"|data-tech-pick="(\w+)"/g)].map((x) => x[1] ?? x[2]);
  assert.deepEqual(seq.slice(-6), ["7", "6", "5", "d2", "d1", "d0"]);
  assert.equal(seq[0], "22");
  // ohne Entität kein Status-Punkt, kurze Namen bleiben ganz
  assert.doesNotMatch(h, /class="led /);
});

test("Status-Punkt nach Zustand der verknüpften Entität; Kopf mit Leistung", () => {
  const c = cab();
  const floor = withDevices(c, [
    ["tech_srv_1u", 1, { entity: "switch.test_server" }],
    ["tech_nas_rack", 2, { entity: "sensor.test_nas", info: [{ entity: "sensor.test_nas_leistung" }] }],
    ["tech_switch_24", 5, { entity: "binary_sensor.test_switch" }],
    ["tech_patch_panel", 6, {}],
  ]);
  const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
  const hass = {
    states: {
      "switch.test_server": st("switch.test_server", "off"),
      "sensor.test_nas": st("sensor.test_nas", "unavailable"),
      "sensor.test_nas_leistung": st("sensor.test_nas_leistung", "1200", { unit_of_measurement: "W" }),
      "binary_sensor.test_switch": st("binary_sensor.test_switch", "on", { device_class: "connectivity" }),
    },
  };
  const h = html(floor.furniture[0], { floor, hass });
  assert.equal(count(h, /class="led /g), 3);
  assert.match(h, /data-tech-pick="d2"[^>]*>.*?<circle class="led green"/s);
  assert.match(h, /data-tech-pick="d1"[^>]*>.*?<circle class="led red"/s);
  assert.match(h, /data-tech-pick="d0"[^>]*>.*?<circle class="led off"/s);
  assert.match(h, /Belegt: 5 von 22 HE · 4 Geräte · Leistung jetzt 1,2 kW</);
  // ohne gültigen Leistungswert keine Angabe
  assert.doesNotMatch(html(floor.furniture[0], { floor, hass: { states: {} } }), /Leistung jetzt/);
  assert.doesNotMatch(html(floor.furniture[0], { floor }), /Leistung jetzt/);
  // unter 1000 W in W
  hass.states["sensor.test_nas_leistung"].state = "245";
  assert.match(html(floor.furniture[0], { floor, hass }), /· Leistung jetzt 245 W</);
});

test("Lange Namen werden gekürzt, der volle Name steht im Titel", () => {
  const c = cab();
  const floor = withDevices(c, [["tech_brush_panel", 3, { name: "Ein sehr langer eigener Name für die Bürstenleiste im Schrank" }]]);
  const h = html(floor.furniture[0], { floor });
  assert.match(h, /aria-label="HE 3 · Ein sehr langer eigener Name für die Bürstenleiste im Schrank"/);
  const shown = h.match(/class="nm"[^>]*>([^<]+)</)[1];
  assert.ok(shown.endsWith("…") && shown.length < 30, shown);
});

test("Liste unter der Leiste: Kopf, drei Gruppen, nur passende Teile, Hinweis auf nicht passende, Abbrechen", () => {
  const c = cab();
  const floor = withDevices(c, [["tech_srv_1u", 10, {}]]); // HE 10 belegt
  const ed = { floor, _rackPick: { cab: "c1", u: 9 } };
  const h = html(floor.furniture[0], ed);
  assert.match(h, /<div class="racklist" data-rack-list="9">/);
  assert.match(h, /<b>Einbauen ab HE 9<\/b> · Lücke HE 1–9 \(9 HE frei\)/);
  const groups = [...h.matchAll(/class="rl-group">([^<]+)</g)].map((x) => x[1]);
  assert.deepEqual(groups, ["19-Zoll-Geräte", "Blenden und Kabelführung", "Tischgeräte auf Fachboden"]);
  assert.match(h, /<button data-rack-add="tech_switch_24" data-rack-at="9">Switch 1 HE \(24 Ports\) <span class="muted">1 HE · HE 9<\/span><\/button>/);
  // 2 HE: kann bei 9 nicht beginnen (9–10 belegt) → Start 8
  assert.match(h, /data-rack-add="tech_ups_2u" data-rack-at="8">USV 2 HE <span class="muted">2 HE · HE 8–9<\/span>/);
  // zu tief für den Netzwerkschrank
  assert.doesNotMatch(h, /data-rack-add="tech_srv_2u"|data-rack-add="tech_srv_4u"/);
  assert.match(h, /\d+ weitere passen hier nicht \(zu tief oder zu hoch für diese Lücke\)\./);
  assert.match(h, /<button data-rack-cancel>Abbrechen<\/button>/);
  // andere Schrank-ID oder belegte HE: keine Liste
  assert.equal(rackListHtml({ floor, _rackPick: { cab: "andere", u: 9 } }, floor.furniture[0]), "");
  const busy = { floor, _rackPick: { cab: "c1", u: 10 } };
  assert.equal(rackListHtml(busy, floor.furniture[0]), "");
  assert.equal(busy._rackPick, null, "ungültige Wahl wird verworfen");
  // Serverschrank: auch die tiefen Geräte
  const s = cab({ id: "s1", type: "server_rack", d: 1.0, h: 2.0 });
  const sh = rackListHtml({ floor: { id: "eg", furniture: [s] }, _rackPick: { cab: "s1", u: 20 } }, s);
  assert.match(sh, /data-rack-add="tech_srv_4u" data-rack-at="20"/);
  assert.doesNotMatch(sh, /weitere/);
});

test("Vorlagen: gesperrt im nicht leeren Schrank, Optionen mit Grund (zu tief, zu wenig HE)", () => {
  const c = cab();
  const floor = withDevices(c, [["tech_srv_1u", 1, {}]]);
  const h = html(floor.furniture[0], { floor });
  assert.match(h, /<select data-rack-tpl disabled>/);
  assert.match(h, /<button data-rack-tpl-go disabled>Bestücken<\/button>/);
  assert.match(h, /Vorlagen gehen nur in einen leeren Schrank – erst alle Geräte ausbauen\./);
  assert.doesNotMatch(h, /Nur für einen leeren Schrank\./);
  // flacher Schrank (0,5 m): beide Vorlagen zu tief; kleiner Schrank (8 HE): nur Heimnetz zu wenig HE
  const shallow = cab({ d: 0.5 });
  const hs = html(shallow, { floor: { id: "eg", furniture: [shallow] } });
  assert.match(hs, /<option value="heimnetz" disabled>Heimnetz klein \(5 Teile, 10 HE\) \(zu tief\)<\/option>/);
  assert.match(hs, /<option value="homelab" disabled>Homelab \(6 Teile, 8 HE\) \(zu tief\)<\/option>/);
  assert.match(hs, /<button data-rack-tpl-go disabled>Bestücken<\/button>/);
  const small = cab({ h: 0.22 + 8 * 0.0445 + 0.001 });
  const hm = html(small, { floor: { id: "eg", furniture: [small] } });
  assert.match(hm, /<option value="heimnetz" disabled>Heimnetz klein \(5 Teile, 10 HE\) \(zu wenig HE\)<\/option>/);
  assert.match(hm, /<option value="homelab" selected>Homelab \(6 Teile, 8 HE\)<\/option>/);
  // gemerkte Wahl
  const f = { id: "eg", furniture: [cab()] };
  assert.match(html(f.furniture[0], { floor: f, _rackTpl: "homelab" }), /<option value="homelab" selected>/);
});

test("Lücken schließen ist gesperrt, wenn nichts frei ist", () => {
  const c = cab({ h: 0.22 + 2 * 0.0445 + 0.001 }); // 2 HE
  const floor = withDevices(c, [["tech_ups_2u", 1, {}]]);
  assert.match(html(floor.furniture[0], { floor }), /<button data-rack-fill title="[^"]+" disabled>/);
});

test("Gerät im Schrank: Im Schrank, Höheneinheit, Leiste mit gewähltem Gerät, ▲/▼ (am Rand gesperrt), Ausbauen, Zum Schrank", () => {
  const c = cab();
  const floor = withDevices(c, [
    ["tech_srv_1u", 1, {}],
    ["tech_switch_24", 2, {}],
    ["tech_patch_panel", 22, {}],
  ]);
  const [, bottom, middle, top] = floor.furniture;
  const hb = html(bottom, { floor });
  assert.match(hb, /Im Schrank: Netzwerkschrank · HE 1</);
  assert.match(hb, /Höheneinheit \(unten\)/);
  assert.match(hb, /class="dev sel" data-tech-pick="d0"/);
  assert.doesNotMatch(hb, /class="dev sel" data-tech-pick="d1"/);
  assert.match(hb, /<button data-rack-up>▲ hoch<\/button>/);
  assert.match(hb, /<button data-rack-down disabled>▼ runter<\/button>/, "unten am Rand");
  assert.match(hb, /<button data-tech-out>Ausbauen<\/button>/);
  assert.match(hb, /<button data-rack-cab>Zum Schrank<\/button>/);
  assert.match(hb, /Freie HE antippen/);
  assert.match(html(middle, { floor }), /<button data-rack-up>▲ hoch<\/button><button data-rack-down>▼ runter<\/button>/);
  const ht = html(top, { floor });
  assert.match(ht, /<button data-rack-up disabled>▲ hoch<\/button>/, "oben am Rand");
  assert.match(ht, /<button data-rack-down>▼ runter<\/button>/);
  // gerade eingebaut: Aufleuchten
  assert.match(html(c, { floor: { ...floor, furniture: floor.furniture }, _rackFlash: "d1" }), /class="dev new" data-tech-pick="d1"/);
  // gewähltes Gerät, das gleichzeitig neu ist
  assert.match(html(middle, { floor, _rackFlash: "d1" }), /class="dev sel new" data-tech-pick="d1"/);
});

test("Gerät ohne Schrank und Schrank ohne HE", () => {
  const free = { id: "x", type: "tech_switch_24", x: 9, z: 9, w: 0.482, d: 0.28, h: 0.0445 };
  const c = cab();
  const floor = { id: "eg", furniture: [c, free] };
  const h = html(free, { floor });
  assert.match(h, /In Schrank einbauen/);
  assert.doesNotMatch(h, /rackstrip/);
  const flat = cab({ h: 0.2 });
  assert.match(html(flat, { floor: { id: "eg", furniture: [flat] } }), /keine nutzbare Höheneinheit/);
});

test("RACK_STYLE: Leiste scrollt (max-height, overscroll, pan-y), Aufleuchten 1,2 s", () => {
  assert.match(RACK_STYLE, /\.rackstrip \{[^}]*max-height: min\(60vh, 720px\)[^}]*overflow-y: auto[^}]*overscroll-behavior: contain[^}]*touch-action: pan-y/);
  assert.match(RACK_STYLE, /animation: rackflash 1\.2s/);
});

test("Wiederherstellung: ein Rundlauf Rack → HTML ändert die Etage nicht", () => {
  const c = cab();
  const floor = withDevices(c, [["tech_srv_1u", 1, {}]]);
  const frozen = JSON.stringify(floor);
  html(floor.furniture[0], { floor });
  html(floor.furniture[1], { floor });
  rackStripHtml({ floor }, floor.furniture[0], { focusId: "d0" });
  assert.equal(JSON.stringify(floor), frozen);
});
