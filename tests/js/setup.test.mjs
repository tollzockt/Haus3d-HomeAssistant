// 0.23: Grundeinstellungen (Etagen anlegen ohne zu löschen, Höhen, Dachgeschoss, Einstellungen) und Vorlage drehen
import assert from "node:assert/strict";
import { test } from "node:test";

import { applySetup, needsSetup, newFloor, setupPreview, setupState } from "../../custom_components/haus3d/frontend/setup.js";
import { alignBackground, rotateBackground } from "../../custom_components/haus3d/frontend/plan-tools.js";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../../custom_components/haus3d/haus-daten.json", import.meta.url)));

test("Grundeinstellungen: leeres Haus und unberührtes Erdgeschoss ja, gezeichnetes Haus nein", () => {
  assert.equal(needsSetup({ floors: [], settings: {} }), true);
  assert.equal(needsSetup({ floors: [newFloor("eg", "Erdgeschoss")], settings: {} }), true);
  assert.equal(needsSetup({ floors: [newFloor("eg", "Erdgeschoss")], settings: { setup_done: true } }), false);
  assert.equal(needsSetup(seed), false);
});

test("Grundeinstellungen: Keller, 2 Vollgeschosse und Dachgeschoss im leeren Haus", () => {
  const st = { ...setupState({ floors: [], settings: {} }), cellar: true, full: 2, attic: true, knee: 1.2, storey: 2.75, title: " Villa ", north: -90, roofType: "none", wallExt: 0.365 };
  const { building: b, added, notes } = applySetup({ floors: [], settings: {} }, st);
  const by = Object.fromEntries(b.floors.map((f) => [f.id, f]));
  assert.deepEqual(added.sort(), ["dg", "eg", "kg", "og1"]);
  assert.equal(by.kg.elevation, -2.75);
  assert.equal(by.eg.elevation, 0);
  assert.equal(by.og1.elevation, 2.75);
  assert.equal(by.eg.height, 2.5);
  assert.equal(by.dg.elevation, 5.5);
  assert.equal(by.dg.attic, true);
  assert.equal(by.dg.knee, 1.2);
  assert.deepEqual(by.eg.pipes, []);
  assert.equal(b.settings.title, "Villa");
  assert.equal(b.settings.north, 270);
  assert.equal(b.settings.wall_exterior, 0.365);
  assert.equal(b.settings.setup_done, true);
  assert.deepEqual(notes, []);
});

test("Grundeinstellungen: vorhandene Etagen bleiben, nur Fehlendes kommt dazu", () => {
  const start = { floors: [{ ...newFloor("eg", "EG", 0, 2.6), rooms: [{ id: "r" }] }, { ...newFloor("dg", "DG", 2.85, 2.4), attic: true }], settings: { roof: { type: "gable", overhang: 0.6 } } };
  const st = { ...setupState(start), full: 2 };
  assert.equal(st.attic, true);
  assert.equal(st.roofType, "gable");
  const { building: b, added } = applySetup(start, st);
  assert.deepEqual(added, ["og1"]);
  assert.equal(b.floors.length, 3);
  assert.equal(b.floors.find((f) => f.id === "og1").elevation, 2.85);
  assert.ok(b.floors.find((f) => f.id === "dg").elevation >= 2.85 + 2.5); // Dachgeschoss rückt nach oben
  assert.equal(b.settings.roof.overhang, 0.6); // übrige Dacheinstellungen bleiben
  // weniger gewünscht: nichts gelöscht, Hinweis
  const less = applySetup(start, { ...setupState(start), full: 1, attic: false });
  assert.equal(less.building.floors.length, 2);
  assert.ok(less.notes.some((n) => n.includes("Dachgeschoss")));
  // Vorschau oben → unten mit „neu“
  const pv = setupPreview(start, st).rows;
  assert.deepEqual(pv.map((r) => [r.id, r.isNew]), [["dg", false], ["og1", true], ["eg", false]]);
});

test("Vorlage: drehen und an einer Linie ausrichten (Punkt a bleibt)", () => {
  assert.equal(rotateBackground({ rotation: 170 }, 90).rotation, -100);
  const bg = { x: 0, z: 0, width: 10, aspect: 0.5, rotation: 0 };
  const a = [2, 2];
  const b = [7, 2 + 5 * Math.tan((3 * Math.PI) / 180)]; // um 3° schief
  const { bg: out, b2, delta } = alignBackground(bg, a, b);
  assert.ok(Math.abs(delta + 3) < 0.01);
  assert.ok(Math.abs(out.rotation + 3) < 0.01);
  assert.ok(Math.abs(b2[1] - 2) < 0.01); // jetzt waagrecht
  // a liegt im gedrehten Bild an derselben Stelle: Bildpunkt unter a neu berechnen
  const c0 = [5, 2.5];
  const c1 = [out.x + 5, out.z + 2.5];
  const t = (-3 * Math.PI) / 180;
  const u = [a[0] - c0[0], a[1] - c0[1]]; // vor dem Drehen (rotation 0)
  const p = [c1[0] + u[0] * Math.cos(t) - u[1] * Math.sin(t), c1[1] + u[0] * Math.sin(t) + u[1] * Math.cos(t)];
  assert.ok(Math.hypot(p[0] - a[0], p[1] - a[1]) < 0.01);
});
