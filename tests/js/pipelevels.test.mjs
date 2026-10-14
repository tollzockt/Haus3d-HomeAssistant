import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CEILING_GAP, PIPE_LEVELS, ROOF_GAP, SLAB, ceilingAlong, clearHeight, defaultLevel, floorRoofModels, levelHeight, levelName, levelOf,
} from "../../custom_components/haus3d/frontend/pipelevels.js";
import { roofModel, roofSurfaceAt } from "../../custom_components/haus3d/frontend/exterior.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Haus mit Dachgeschoss: EG 10 × 8 m, DG darüber (Höhe 2,4, Kniestock 1), Satteldach 40°
const house = (roof = { type: "gable", pitch: 40, overhang: 0.4 }) => {
  const eg = { id: "eg", name: "EG", elevation: 0, height: 2.5, rooms: [{ id: "w", name: "W", points: rect(0, 0, 10, 8) }] };
  const dg = { id: "dg", name: "DG", elevation: 2.8, height: 2.4, attic: true, knee: 1, rooms: [{ id: "a", name: "A", points: rect(0, 0, 10, 8) }] };
  return { b: { floors: [eg, dg], settings: { roof } }, eg, dg };
};

test("Stufen: Standard je Medium, Namen, Höhen", () => {
  assert.deepEqual(PIPE_LEVELS.map((l) => l[0]), ["boden", "sockel", "steckdose", "schalter", "decke"]);
  assert.equal(defaultLevel("strom"), "decke");
  assert.equal(defaultLevel("netzwerk"), "decke");
  assert.equal(defaultLevel("wasser_kalt"), "boden");
  assert.equal(defaultLevel("wasser_warm"), "boden");
  assert.equal(defaultLevel(undefined), "boden");
  assert.equal(levelName("decke"), "Decke");
  assert.equal(levelName("steckdose"), "Steckdose");
  assert.equal(levelName("x"), "eigene Höhe");
  assert.equal(levelName(null), "eigene Höhe");
  assert.equal(SLAB, 0.15);
  assert.equal(CEILING_GAP, 0.15);
  assert.equal(ROOF_GAP, 0.03);
});

test("levelHeight / levelOf", () => {
  assert.equal(levelHeight("boden"), 0.03);
  assert.equal(levelHeight("sockel"), 0.15);
  assert.equal(levelHeight("steckdose", 2.6), 0.3);
  assert.equal(levelHeight("schalter"), 1.1);
  assert.equal(levelHeight("decke", 2.6), 2.45);
  assert.equal(levelHeight("decke", 2.4), 2.25);
  assert.equal(levelHeight("decke"), 2.35);
  assert.equal(levelHeight("decke", 0.1), 0.05);
  assert.equal(levelOf(2.45, 2.6), "decke");
  assert.equal(levelOf(2.44, 2.6), "decke");
  assert.equal(levelOf(0.3, 2.6), "steckdose");
  assert.equal(levelOf(0.03, 2.6), "boden");
  assert.equal(levelOf(0.6, 2.6), null);
  assert.equal(levelOf(2.3, 2.6), null);
  assert.equal(levelOf(2.3, 2.6, 0.2), "decke");
  assert.equal(levelOf(NaN, 2.6), null);
});

test("clearHeight: bis unter die Decke der Etage darüber", () => {
  const kg = { id: "kg", elevation: -2.6, height: 2.4 };
  const eg = { id: "eg", elevation: 0, height: 2.6 };
  const og = { id: "og", elevation: 2.9, height: 2.5 };
  assert.equal(clearHeight({ floors: [kg, eg, og] }, kg), 2.4);
  assert.equal(clearHeight({ floors: [kg, eg, og] }, eg), 2.6);
  // Etage darüber zu tief: lichte Höhe darunter
  const og2 = { id: "og", elevation: 2.5, height: 2.5 };
  assert.equal(clearHeight({ floors: [eg, og2] }, eg), 2.35);
  assert.equal(clearHeight({ floors: [eg, og2] }, og2), 2.5);
  // Etagen weniger als 0,5 m darüber zählen nicht (Halbgeschoss, gleiche Ebene); mindestens 0,5
  assert.equal(clearHeight({ floors: [eg, { id: "x", elevation: 0.4 }] }, eg), 2.6);
  assert.equal(clearHeight({ floors: [eg, { id: "x", elevation: 0.6 }] }, eg), 0.5);
  assert.equal(clearHeight({ floors: [] }, {}), 2.5);
});

test("Dachgeschoss: floorRoofModels und Decke unter der Dachschräge", () => {
  const { b, eg, dg } = house();
  const models = floorRoofModels(b, dg);
  assert.equal(models.length, 1);
  assert.equal(models[0].floor.id, "dg");
  assert.equal(floorRoofModels(b, eg), null);
  assert.equal(floorRoofModels(b, null), null);
  // Mitte unter dem First: Raumhöhe
  assert.equal(ceilingAlong(b, dg, [5, 4]), 2.4);
  // nah an der Traufe: unter der Schräge (Dachfläche − Etage − ROOF_GAP)
  const y = roofSurfaceAt(roofModel(b), [5, 0.5]).y;
  const c = ceilingAlong(b, dg, [5, 0.5]);
  assert.ok(near(c, y - 2.8 - ROOF_GAP), `${c}`);
  assert.ok(c > 1.5 && c < 1.7, `${c}`);
  // entlang einer Strecke gilt das Minimum (hier am Anfang)
  const along = ceilingAlong(b, dg, [5, 0.3], [5, 4]);
  assert.ok(near(along, ceilingAlong(b, dg, [5, 0.3])) && along < c, `${along}`);
  assert.ok(near(ceilingAlong(b, dg, [5, 4], [5, 0.3]), along));
  // Modelle von außen (z. B. aus dem Editor) bzw. keine
  assert.ok(near(ceilingAlong(b, dg, [5, 0.5], [5, 0.5], models), c));
  assert.equal(ceilingAlong(b, dg, [5, 0.5], [5, 0.5], null), 2.4);
  // außerhalb des Dachs: Raumhöhe; nie unter 0,2
  assert.equal(ceilingAlong(b, dg, [30, 30]), 2.4);
  const steep = house({ type: "shed", pitch: 5, overhang: 0 });
  assert.ok(ceilingAlong(steep.b, steep.dg, [0, 0.1]) >= 0.2);
  // EG unter dem Dachgeschoss: bis unter die Decke
  assert.equal(ceilingAlong(b, eg, [5, 4]), 2.5);
  // ohne Hausdach: lichte Höhe
  const none = house({ type: "none" });
  assert.equal(floorRoofModels(none.b, none.dg), null);
  assert.equal(ceilingAlong(none.b, none.dg, [5, 0.5]), 2.4);
  // Dach auf einer anderen Etage: das Dachgeschoss hat kein eigenes Modell
  const other = house({ type: "gable", pitch: 40, overhang: 0.4, floor: "eg" });
  assert.equal(floorRoofModels(other.b, other.dg), null);
});

test("R2: Leitung in einem Hausraum 0,3 m neben einer Flach-Einheit folgt der Hausdach-Schräge", () => {
  const { b, dg } = house();
  dg.rooms = [{ id: "haus", name: "Haus", points: rect(0, 0, 10, 8) }, { id: "anbau", name: "Anbau", points: rect(10.3, 0, 14, 4), roof: { type: "flat" } }];
  const models = floorRoofModels(b, dg);
  assert.deepEqual(models.map((m) => m.kind), ["house", "room"]);
  // die Platte des Anbaus reicht über die Ostwand des Hauses und liegt dort höher als die Schräge …
  const p = [9.9, 0.5];
  const flat = roofSurfaceAt(models[1], p)?.y;
  const slope = roofSurfaceAt(models[0], p).y;
  assert.ok(Number.isFinite(flat) && flat > slope, `${flat} / ${slope}`);
  // … die Leitung im Hausraum richtet sich trotzdem nach dem Hausdach
  assert.ok(near(ceilingAlong(b, dg, p), slope - 2.8 - ROOF_GAP), `${ceilingAlong(b, dg, p)}`);
  // im Anbau selbst gilt das Flachdach (bis zur Raumhöhe)
  assert.equal(ceilingAlong(b, dg, [12, 2]), 2.4);
});
