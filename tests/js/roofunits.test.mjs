// Tests der Dach-Einheiten: Hausdach, eigene Dächer von Räumen und freie Dachteile je Etage (roofunits.js)
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addRoomRoof,
  adoptHouseItems,
  atticModels,
  clampRoof,
  coveredBy,
  deletePart,
  editUnit,
  findUnit,
  floorModels,
  houseRoomsChange,
  houseToParts,
  moveItemToUnit,
  ownModels,
  ownerRoom,
  parseUnitKey,
  partOver,
  removeRoomRoof,
  roofItemsAll,
  roofSummary,
  roofUnits,
  roomRoofToParts,
  setAdjust,
  setSeparate,
  shiftPart,
  strayHouseItems,
  surfaceAt,
  surfaceFor,
  towerRoof,
  trimToHouse,
  unitAt,
  unitFaces,
  unitForRoom,
  unitKey,
  unitSpec,
} from "../../custom_components/haus3d/frontend/roofunits.js";
import { pvLayout, roofModel, roofObstacles, roofSurfaceAt, roomRoofGroups } from "../../custom_components/haus3d/frontend/exterior.js";
import { exteriorTopAt } from "../../custom_components/haus3d/frontend/gable.js";
import { allIds, moveRoom } from "../../custom_components/haus3d/frontend/edit-ops.js";
import { copyRefs, moveRefs, pasteClip } from "../../custom_components/haus3d/frontend/plan-tools.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

// Haus auf EG und OG (Hausdach auf dem OG), Garage mit eigenem Pultdach und PV auf dem EG
const fixture = () => ({
  settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35 } },
  floors: [
    {
      id: "eg",
      name: "EG",
      elevation: 0,
      height: 2.5,
      rooms: [
        { id: "haus", name: "Haus", points: rect(0, 0, 10, 8) },
        { id: "garage", name: "Garage", points: rect(10, 0, 14, 5), roof: { type: "shed", pitch: 10, overhang: 0.3, items: [{ id: "pv_1", type: "pv", x: 12, z: 2.5, cols: 2, rows: 1 }] } },
      ],
    },
    { id: "og", name: "OG", elevation: 2.75, height: 2.5, rooms: [{ id: "og1", name: "Zimmer", points: rect(0, 0, 10, 8) }] },
  ],
});
// zwei berührende Räume mit Satteldach (gemeinsames Dach)
const pair = () => ({
  settings: { wall_exterior: 0.24 },
  floors: [
    {
      id: "eg",
      elevation: 0,
      height: 2.5,
      rooms: [
        { id: "s", name: "Schuppen", points: rect(0, 0, 3, 2), roof: { type: "gable", pitch: 20 } },
        { id: "u", name: "Unterstand", points: rect(3, 0, 5, 2), roof: { type: "gable" } },
      ],
    },
  ],
});
const room = (b, id) => b.floors.flatMap((f) => f.rooms).find((r) => r.id === id);

test("Dächer je Etage: Raumdach auf dem EG, Hausdach auf dem OG", () => {
  const b = fixture();
  assert.deepEqual(roofUnits(b, "eg").map((u) => u.key), ["room:eg:garage"]);
  assert.deepEqual(roofUnits(b, "og").map((u) => u.key), ["house"]);
  assert.equal(roofUnits(b).length, 2);
  b.settings.roof.type = "none";
  assert.deepEqual(roofUnits(b, "og"), []);
  assert.equal(roofUnits(b, "eg").length, 1);
});

test("Raumdach: Modell und Fläche, Einheit unter einem Punkt", () => {
  const b = fixture();
  const u = findUnit(b, "room:eg:garage");
  assert.equal(u.model.top, 2.5);
  assert.equal(u.label, "Garage");
  const h = roofSurfaceAt(u.model, [12, 2.5]);
  near(h.y, 2.895, 0.01);
  assert.deepEqual(h.out, [1, 0]);
  near(h.tan, Math.tan((10 * Math.PI) / 180));
  assert.equal(unitAt(roofUnits(b, "eg"), [12, 2.5]).unit.key, "room:eg:garage");
  assert.equal(unitAt(roofUnits(b, "eg"), [5, 4]), null);
});

test("Dachgeschoss: geneigtes Raumdach auf dem Kniestock, flaches auf Raumhöhe", () => {
  const dg = (type) => ({ settings: { wall_exterior: 0.24 }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 8, 8) }] }, { id: "dg", elevation: 2.75, height: 2.4, attic: true, knee: 1, rooms: [{ id: "erker", name: "Erker", points: rect(0, 0, 4, 3), roof: { type, base: 2 } }] }] });
  assert.equal(findUnit(dg("gable"), "room:dg:erker").model.top, 3.75);
  near(findUnit(dg("flat"), "room:dg:erker").model.top, 5.15);
  near(findUnit(dg("pyramid"), "room:dg:erker").model.top, 3.75); // ohne base am Raumdach
});

test("PV auf dem Raumdach: Module passen, Dinge aller Dächer", () => {
  const b = fixture();
  const u = findUnit(b, "room:eg:garage");
  assert.equal(pvLayout(u.model, u.items[0], { obstacles: roofObstacles(u.model, u.items) }).count, 2);
  assert.deepEqual(roofItemsAll(b).map((x) => [x.item.id, x.unit.key]), [["pv_1", "room:eg:garage"]]);
});

test("gemeinsames Dach gemeinsam bearbeiten, Rückgabewert von fn ohne Wirkung", () => {
  const b = pair();
  editUnit(b, "room:eg:s", (r) => {
    r.pitch = 40;
    r.items = [{ id: "k1", type: "chimney", x: 1, z: 1 }];
  });
  assert.equal(room(b, "s").roof.pitch, 40);
  assert.equal(room(b, "u").roof.pitch, 40);
  assert.equal(room(b, "u").roof.items, undefined);
  assert.equal(room(b, "s").roof.items.length, 1);
  assert.equal(editUnit(b, "room:eg:u", (r) => (r.pitch = 30)), "room:eg:s");
  assert.equal(b.floors[0].rooms.length, 2);
  assert.equal(room(b, "u").roof.pitch, 30);
});

test("Dinge auf dem Nachbarraum bleiben dort (Lage-Regel) und sichtbar", () => {
  const b = pair();
  room(b, "u").roof.items = [{ id: "pv_u", type: "pv", x: 4, z: 1 }];
  assert.ok(roofUnits(b, "eg")[0].items.some((i) => i.id === "pv_u"));
  assert.ok(roofItemsAll(b).some((x) => x.item.id === "pv_u"));
  editUnit(b, "room:eg:s", () => {});
  assert.deepEqual(room(b, "u").roof.items.map((i) => i.id), ["pv_u"]);
  assert.equal(room(b, "s").roof.items, undefined);
  assert.ok(roofUnits(b, "eg")[0].items.some((i) => i.id === "pv_u"));
});

test("abtrennen und wieder verbinden mit kanonischen Schlüsseln", () => {
  const b = pair();
  assert.equal(setSeparate(b, "eg", "u", true), "room:eg:u");
  assert.equal(roomRoofGroups(b.floors[0]).length, 2);
  editUnit(b, "room:eg:s", (r) => {
    r.pitch = 30;
  });
  assert.equal(room(b, "u").roof.pitch, undefined);
  assert.equal(findUnit(b, "room:eg:u").model.roof.pitch, 35);
  assert.equal(setSeparate(b, "eg", "u", false), "room:eg:s");
  assert.equal(room(b, "u").roof.pitch, 30); // es gelten die Werte des Leiters
});

test("Kein Dach entfernt das ganze Raumdach", () => {
  const b = pair();
  assert.equal(
    editUnit(b, "room:eg:s", (r) => {
      r.type = "none";
    }),
    null,
  );
  assert.equal(room(b, "s").roof, undefined);
  assert.equal(room(b, "u").roof, undefined);
});

test("removeRoomRoof übergibt die Dinge an den nächsten Gruppenraum", () => {
  const b = pair();
  Object.assign(room(b, "s").roof, { items: [{ id: "k1", type: "chimney", x: 1, z: 1 }], adjust: [{ a: -0.2 }] });
  assert.ok(removeRoomRoof(b, "eg", "s"));
  assert.equal(room(b, "s").roof, undefined);
  assert.equal(room(b, "u").roof.items[0].id, "k1");
  assert.equal(room(b, "u").roof.adjust, undefined);
});

test("addRoomRoof: an berührendes Dach gleicher Form anschließen, Kanten-Anpassungen zurücksetzen", () => {
  const b = pair();
  Object.assign(room(b, "s").roof, { adjust: [{ a: -0.2 }], items: [{ id: "k1", type: "chimney", x: 1, z: 1 }] });
  b.floors[0].rooms.unshift({ id: "w", name: "Werkstatt", points: rect(-2, 0, 0, 2) });
  const report = {};
  const res = addRoomRoof(b, "eg", "w", "gable", report);
  assert.deepEqual(res, { key: "room:eg:w", joined: true });
  assert.equal(report.droppedAdjust, true);
  assert.equal(room(b, "w").roof.type, "gable");
  assert.equal(room(b, "w").roof.pitch, 20);
  assert.ok(b.floors[0].rooms.every((r) => !r.roof?.adjust));
  assert.equal(roofUnits(b, "eg")[0].items.length, 1);
  // andere Form: eigenes Dach mit Startwerten
  const c = pair();
  c.floors[0].rooms.push({ id: "t", name: "Turm", points: rect(5, 0, 7, 2) });
  assert.deepEqual(addRoomRoof(c, "eg", "t", "shed"), { key: "room:eg:t", joined: false });
  assert.deepEqual(room(c, "t").roof, { type: "shed", pitch: 25, overhang: 0.3 });
  addRoomRoof(c, "eg", "t", "cone");
  assert.deepEqual(room(c, "t").roof, { type: "cone", pitch: 55, overhang: 0.3 });
  addRoomRoof(c, "eg", "t", "terrace");
  assert.deepEqual(room(c, "t").roof, { type: "terrace", overhang: 0 });
});

test("Schlüssel: zerlegen, über Mitgliedschaft finden, gespeicherte Daten", () => {
  const b = fixture();
  const p = pair();
  assert.deepEqual(parseUnitKey("room:eg:garage"), { kind: "room", floorId: "eg", id: "garage" });
  assert.deepEqual(parseUnitKey("part:eg:a:b"), { kind: "part", floorId: "eg", id: "a:b" });
  assert.deepEqual(parseUnitKey(null), { kind: "house" });
  assert.equal(unitKey("house", "eg", "x"), "house");
  assert.equal(findUnit(p, "room:eg:u").key, "room:eg:s");
  assert.equal(unitForRoom(p, "eg", "u").key, "room:eg:s");
  assert.equal(findUnit(b, "room:eg:nix"), null);
  assert.equal(findUnit(b, "part:xx:1"), null);
  assert.equal(unitSpec(b, "room:eg:garage"), b.floors[0].rooms[1].roof);
  assert.equal(unitSpec(b, "house"), b.settings.roof);
  assert.equal(findUnit(b, "house").floorId, "og");
});

test("An der Hauswand kürzen", () => {
  const b = fixture();
  const res = trimToHouse(b, findUnit(b, "room:eg:garage"));
  assert.deepEqual(res, { adjust: [{ b: -0.54 }], count: 1 });
  b.floors[0].rooms[1].roof.adjust = res.adjust;
  assert.equal(trimToHouse(b, findUnit(b, "room:eg:garage")), null);
  b.floors[0].rooms[1].points = rect(20, 20, 23, 22);
  assert.equal(trimToHouse(b, findUnit(b, "room:eg:garage")), null);
  assert.equal(trimToHouse(b, findUnit(b, "house")), null);
});

test("Etage darüber verdeckt ein Raumdach", () => {
  const b = fixture();
  assert.deepEqual(coveredBy(b, findUnit(b, "room:eg:garage")), []);
  b.floors[1].rooms.push({ id: "og2", name: "Über der Garage", points: rect(10, 0, 14, 5) });
  assert.deepEqual(coveredBy(b, findUnit(b, "room:eg:garage")).map((f) => f.id), ["og"]);
});

test("mehrere Dachgeschosse: Modelle je Dachgeschoss", () => {
  const b3 = {
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35 } },
    floors: [
      { id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 10, 8) }] },
      { id: "dg", elevation: 2.75, height: 2.4, attic: true, knee: 1, rooms: [{ id: "haus", points: rect(0, 0, 10, 8) }, { id: "erker", name: "Erker", points: rect(4, 8, 6, 9.5), roof: { type: "gable" } }] },
    ],
  };
  const m = atticModels(b3);
  assert.equal(m.get("dg").length, 2);
  assert.ok(!m.has("eg"));
  assert.equal(m.get("dg")[0].kind, "house");
  assert.ok(!roofModel(b3).rooms.some((r) => r.id === "erker")); // eigenes Dach: nicht unter dem Hausdach
  assert.deepEqual([...atticModels(b3, { floorId: "dg" }).keys()], ["dg"]);
  b3.settings.roof.type = "none";
  delete b3.floors[1].rooms[1].roof;
  assert.equal(atticModels(b3).size, 0);
});

test("Eingaben begrenzen", () => {
  assert.equal(clampRoof("pitch", 80), 60);
  assert.equal(clampRoof("pitch", 80, "cone"), 80);
  assert.equal(clampRoof("pitch", 2, "flat"), 5);
  assert.equal(clampRoof("overhang", -1), 0);
  assert.equal(clampRoof("pitch_low", 99, "mansard"), 85);
  assert.equal(clampRoof("base", -9), -5);
  assert.equal(clampRoof("diameter", 50), 30);
  assert.equal(clampRoof("x", 7), 7);
  assert.equal(clampRoof("pitch", "steil"), 5);
});

test("unbekannte Dachform am Raum wird übergangen", () => {
  const b = pair();
  room(b, "s").roof = { type: "quatsch" };
  room(b, "u").roof = { type: "quatsch" };
  assert.equal(roomRoofGroups(b.floors[0]).length, 0);
  assert.equal(roofUnits(b, "eg").length, 0);
});

test("IDs, Verschieben, Kopieren und Einfügen nehmen die Dinge auf dem Raumdach mit", () => {
  const b = fixture();
  const garage = b.floors[0].rooms[1];
  assert.ok(allIds(b).has("pv_1"));
  assert.equal(moveRoom(garage, 1, 0).roof.items[0].x, 13);
  const moved = moveRefs(b.floors[0], [{ kind: "room", id: "garage" }], 0, 2);
  assert.equal(moved.rooms[1].roof.items[0].z, 4.5);
  assert.equal(garage.roof.items[0].z, 2.5); // Original unverändert
  garage.roof.items[0].entity = "sensor.pv_leistung";
  garage.roof.items[0].energy_entity = "sensor.pv_energie";
  const clip = copyRefs(b.floors[0], [{ kind: "room", id: "garage" }]);
  const { floor, added } = pasteClip(b.floors[0], clip, [30, 30], allIds(b));
  const copy = floor.rooms.find((r) => r.id === added[0].id);
  const it = copy.roof.items[0];
  assert.deepEqual([it.x - copy.points[0][0], it.z - copy.points[0][1]], [2, 2.5]);
  assert.notEqual(it.id, "pv_1");
  assert.ok(it.id.startsWith("pv_"));
  assert.equal(it.entity, undefined);
  assert.equal(it.energy_entity, undefined);
  assert.equal(garage.roof.items[0].id, "pv_1");
});

test("berührende Räume verschiedener Form: zwei Dächer", () => {
  const b = pair();
  room(b, "u").roof.type = "shed";
  assert.deepEqual(roofUnits(b, "eg").map((u) => u.key), ["room:eg:s", "room:eg:u"]);
});

test("Zeltdach am Raum: Form aus roofshapes, Spitze über dem Schwerpunkt, nie zusammengelegt", () => {
  const b = pair();
  room(b, "s").roof = { type: "pyramid" };
  room(b, "u").roof = { type: "pyramid" };
  const units = roofUnits(b, "eg");
  assert.equal(units.length, 2);
  const m = units[0].model;
  assert.equal(typeof m.at, "function");
  near(roofSurfaceAt(m, [1.5, 1]).y, m.ridgeY, 1e-6);
  assert.ok(m.shape && m.pitched);
  assert.equal(m.roof.pitch, 35);
});

test("Formwechsel einer Gruppe auf eine Einzelform: jeder Raum bekommt die Form, Dinge bleiben am Raum", () => {
  const b = pair();
  room(b, "s").roof.items = [{ id: "k1", type: "chimney", x: 1, z: 1 }];
  room(b, "u").roof.items = [{ id: "pv_u", type: "pv", x: 4, z: 1 }];
  room(b, "s").roof.adjust = [{ lo: 1 }];
  const report = {};
  editUnit(
    b,
    "room:eg:u",
    (r) => {
      r.type = "pyramid";
    },
    report,
  );
  assert.equal(room(b, "s").roof.type, "pyramid");
  assert.equal(room(b, "u").roof.type, "pyramid");
  assert.equal(roofUnits(b, "eg").length, 2);
  assert.deepEqual(room(b, "s").roof.items.map((i) => i.id), ["k1"]);
  assert.deepEqual(room(b, "u").roof.items.map((i) => i.id), ["pv_u"]);
  assert.equal(report.droppedAdjust, true);
});

test("freies Dachteil als Einheit, Dinge darauf, gewählte Einheit bevorzugt", () => {
  const b = fixture();
  b.floors[0].roofs = [
    { id: "dach_1", type: "flat", points: rect(20, 0, 26, 4), items: [{ id: "pv_9", type: "pv", x: 23, z: 2 }] },
    { id: "dach_2", type: "flat", points: rect(24, 0, 30, 4) },
  ];
  const units = roofUnits(b, "eg");
  assert.deepEqual(units.map((u) => u.key), ["room:eg:garage", "part:eg:dach_1", "part:eg:dach_2"]);
  assert.deepEqual(units[1].items.map((i) => i.id), ["pv_9"]);
  assert.equal(units[1].label, "Flachdach");
  assert.equal(unitAt(units, [25, 2]).unit.key, "part:eg:dach_1");
  assert.equal(unitAt(units, [25, 2], "part:eg:dach_2").unit.key, "part:eg:dach_2");
  assert.ok(roofItemsAll(b).some((x) => x.item.id === "pv_9" && x.unit.key === "part:eg:dach_1"));
  assert.equal(unitSpec(b, "part:eg:dach_2"), b.floors[0].roofs[1]);
});

test("Hausdach spart Räume mit eigenem Dach und unter Dachteilen aus; Änderungen erkennbar", () => {
  const b = {
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35 } },
    floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 6, 6) }, { id: "b", points: rect(6, 0, 10, 6) }, { id: "c", points: rect(10, 0, 12, 6) }] }],
  };
  const ids = (x) => roofModel(x).rooms.map((r) => r.id);
  assert.deepEqual(ids(b), ["a", "b", "c"]);
  assert.equal(houseRoomsChange(b, (c) => addRoomRoof(c, "eg", "c", "shed")).changed, true);
  addRoomRoof(b, "eg", "c", "shed");
  assert.deepEqual(ids(b), ["a", "b"]);
  assert.equal(houseRoomsChange(b, (c) => removeRoomRoof(c, "eg", "c")).changed, true);
  b.floors[0].roofs = [{ id: "p1", type: "flat", points: rect(6, 0, 10, 6) }];
  assert.deepEqual(ids(b), ["a"]);
  assert.equal(partOver(b, "eg", b.floors[0].rooms[1]).id, "p1");
  assert.equal(partOver(b, "eg", b.floors[0].rooms[0]), null);
  const ch = houseRoomsChange(b, (c) => deletePart(c, "part:eg:p1"));
  assert.deepEqual([ch.before, ch.after, ch.changed], ["a", "a,b", true]);
  assert.equal(houseRoomsChange(b, (c) => shiftPart(c.floors[0].roofs[0], 20, 0)).changed, true);
  assert.equal(houseRoomsChange(b, (c) => shiftPart(c.floors[0].roofs[0], 0.1, 0)).changed, false);
  assert.equal(b.floors[0].roofs[0].points[0][0], 6); // nur an der Kopie
});

test("automatisch offenes Ende an einem höheren Hausdach", () => {
  const b = { settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "haus", points: rect(0, 0, 10, 8) }], roofs: [{ id: "dach_1", type: "gable", points: rect(7, 2, 16, 6), pitch: 35 }] }] };
  const sh = findUnit(b, "part:eg:dach_1").model.shape;
  assert.deepEqual(sh.frames[0].open, [true, false]);
  assert.equal(sh.gableTris.length, 1); // nur am freien Ende ein Giebel
  // ohne Hausdach bleibt das Ende geschlossen
  b.settings.roof.type = "none";
  assert.deepEqual(findUnit(b, "part:eg:dach_1").model.shape.frames[0].open, [false, false]);
});

test("Dachterrasse am Raum: Belag unter der Etage darüber, Innenwand halb, kein Geländer an der Wand darüber", () => {
  const b = {
    settings: { wall_exterior: 0.24, wall_interior: 0.12 },
    floors: [
      { id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "kueche", name: "Küche", points: rect(0, 0, 4, 3), roof: { type: "terrace", railing: "bars" } }, { id: "wohnen", name: "Wohnen", points: rect(4, 0, 10, 6) }] },
      { id: "og", elevation: 2.75, height: 2.5, rooms: [{ id: "og1", points: rect(0, 3, 10, 6) }] },
    ],
  };
  const sh = findUnit(b, "room:eg:kueche").model.shape;
  near(sh.deck, 2.74);
  assert.deepEqual(sh.edgeOffsets, [0.24, 0.06, 0.24, 0.24]); // Kante 1 (x = 4) an der Nachbarwand
  assert.deepEqual(sh.railFree, [true, true, false, true]); // Kante 2 (z = 3) an der Wand des OG
  assert.equal(sh.rail.edges.length, 3);
  assert.equal(sh.rail.style, "bars");
  assert.equal(roofSummary(findUnit(b, "room:eg:kueche").model.roof), "Dachterrasse · Geländer Stäbe");
  assert.ok(!roofModel({ ...b, settings: { ...b.settings, roof: { type: "flat" } } }).rooms.some((r) => r.id === "kueche"));
});

test("Hausdach in Dachteile umwandeln: gleiche Höhen, Walm am Flügel", () => {
  const b = {
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35, wing_end: "hip", color: "#123456" } },
    floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 10, 4) }, { id: "b", points: rect(0, 4, 4, 9) }] }],
  };
  const house = roofModel(b);
  const res = houseToParts(b);
  assert.equal(res.floorId, "eg");
  assert.equal(res.parts.length, house.parts.length);
  assert.deepEqual(res.parts.map((p) => p.type).sort(), ["gable", "hip"]);
  assert.ok(res.parts.every((p) => p.color === "#123456" && !("id" in p)));
  const c = structuredClone(b);
  c.settings.roof.type = "none";
  c.floors[0].roofs = res.parts.map((p, i) => ({ ...p, id: `dach_${i}` }));
  const units = roofUnits(c, "eg");
  assert.ok(units.every((u) => u.model));
  for (let x = 0.2; x <= 9.8; x += 0.53) {
    for (let z = 0.2; z <= 8.8; z += 0.47) {
      const a = roofSurfaceAt(house, [x, z]);
      if (!a) continue;
      near(surfaceAt(floorModels(units, "eg"), [x, z]).y, a.y, 1e-3);
    }
  }
});

test("Raumdach in Dachteile umwandeln; Turm aus freiem Kegeldach", () => {
  const b = pair();
  room(b, "s").roof.items = [{ id: "k1", type: "chimney", x: 1, z: 1 }];
  room(b, "u").roof.items = [{ id: "pv_u", type: "pv", x: 4, z: 1 }];
  room(b, "s").roof.adjust = [{ a: 1 }];
  room(b, "s").roof.separate = false;
  const res = roomRoofToParts(b, "room:eg:u");
  assert.equal(res.parts.length, 2);
  assert.deepEqual(res.items.map(([i, it]) => [i, it.id]), [[0, "k1"], [1, "pv_u"]]);
  for (const p of res.parts) {
    assert.ok(!("adjust" in p) && !("separate" in p) && !("id" in p));
    assert.equal(p.type, "gable");
  }
  assert.equal(res.parts[0].pitch, 20);
  assert.equal(res.parts[1].pitch, 20);
  assert.deepEqual(res.parts[1].points, rect(3, 0, 5, 2));
  assert.equal(roomRoofToParts(b, "part:eg:x"), null);
  const t = towerRoof({ id: "dach_1", name: "Turm", type: "cone", pitch: 60, base: 2, points: rect(0, 0, 1, 1), adjust: [{ a: 1 }], color: "#aa0000", items: [{ id: "k2", type: "chimney", x: 0, z: 0 }] });
  for (const k of ["base", "points", "name", "id", "adjust"]) assert.ok(!(k in t), k);
  assert.deepEqual(t, { type: "cone", pitch: 60, color: "#aa0000", items: [{ id: "k2", type: "chimney", x: 0, z: 0 }] });
});

test("Fläche über mehreren Dächern: höchstes Modell, eigene Räume zuerst", () => {
  const low = { rooms: [{ id: "a" }], at: (x) => (x < 5 ? { y: 3, out: null, tan: 0 } : null) };
  const high = { rooms: [{ id: "b" }], at: () => ({ y: 4, out: [1, 0], tan: 0.5 }) };
  const s = surfaceAt([low, high], [1, 0]);
  assert.equal(s.y, 4);
  assert.equal(s.model, high);
  assert.equal(surfaceAt([low], [9, 0]), null);
  assert.deepEqual(ownModels([low, high], ["a", null]), [low]);
  assert.equal(surfaceFor([low, high], [1, 0], ["a"]).y, 3);
  assert.equal(surfaceFor([low, high], [1, 0], ["x"]).y, 4);
  assert.equal(surfaceFor([low, high], [1, 0]).y, 4);
});

test("Ding auf ein anderes Dach legen", () => {
  const b = fixture();
  b.floors[0].roofs = [{ id: "dach_1", type: "flat", points: rect(20, 0, 26, 4) }];
  b.floors[0].rooms.push({ id: "carport", name: "Carport", points: rect(14, 0, 16, 5), roof: { type: "shed" } });
  assert.equal(roofUnits(b, "eg")[0].rooms.length, 2); // gemeinsames Pultdach
  assert.ok(moveItemToUnit(b, "room:eg:garage", "part:eg:dach_1", "pv_1"));
  assert.equal(b.floors[0].rooms[1].roof.items, undefined);
  assert.deepEqual(b.floors[0].roofs[0].items.map((i) => i.id), ["pv_1"]);
  const it = b.floors[0].roofs[0].items[0];
  it.x = 15;
  assert.ok(moveItemToUnit(b, "part:eg:dach_1", "room:eg:carport", "pv_1"));
  assert.equal(b.floors[0].roofs[0].items, undefined);
  assert.deepEqual(room(b, "carport").roof.items.map((i) => i.id), ["pv_1"]); // am Raum darunter
  assert.ok(!moveItemToUnit(b, "room:eg:garage", "house", "nix"));
  assert.ok(moveItemToUnit(b, "room:eg:garage", "house", "pv_1"));
  assert.deepEqual(b.settings.roof.items.map((i) => i.id), ["pv_1"]);
});

test("editUnit ignoriert Rückgabewerte, auch bei Dachteilen; Hausdach und Kanten", () => {
  const b = fixture();
  b.floors[0].roofs = [{ id: "dach_1", type: "gable", points: rect(20, 0, 26, 4), items: [] }];
  assert.equal(editUnit(b, "part:eg:dach_1", (p) => (p.pitch = 40)), "part:eg:dach_1");
  assert.equal(b.floors[0].roofs[0].pitch, 40);
  assert.equal(b.floors[0].roofs[0].items, undefined); // leere Liste gelöscht
  assert.equal(b.floors[0].roofs[0].id, "dach_1");
  assert.equal(
    editUnit(b, "part:eg:dach_1", (p) => {
      setAdjust(p, 0, { lo: 1 });
    }),
    "part:eg:dach_1",
  );
  assert.deepEqual(b.floors[0].roofs[0].adjust, [{ lo: 1 }]);
  editUnit(b, "part:eg:dach_1", (p) => {
    setAdjust(p, 0, {});
  });
  assert.equal(b.floors[0].roofs[0].adjust, undefined);
  assert.equal(editUnit(b, "house", (r) => (r.pitch = 45)), "house");
  assert.equal(b.settings.roof.pitch, 45);
  assert.equal(editUnit(b, "part:eg:nix", () => {}), null);
  assert.equal(editUnit(b, "room:xx:nix", () => {}), null);
});

test("Dachgeschoss mit Flachdach-Einheit: Modelle der Etage, eigene Räume zuerst", () => {
  const b = {
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35 } },
    floors: [
      { id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 10, 8) }] },
      { id: "dg", elevation: 2.75, height: 2.4, attic: true, knee: 1, rooms: [{ id: "haus", points: rect(0, 0, 10, 8) }, { id: "erker", points: rect(4, 8, 6, 9.5) }, { id: "anbau", points: rect(10, 0, 14, 4), roof: { type: "flat" } }] },
    ],
  };
  const models = atticModels(b).get("dg");
  assert.deepEqual(models.map((m) => m.kind), ["house", "room"]);
  near(models[1].top, 5.15);
  assert.equal(ownModels(models, ["anbau"])[0], models[1]);
  // Hausraum neben der Flach-Einheit: zuerst das Hausdach
  assert.equal(surfaceFor(models, [9.95, 2], ["haus"]).model.kind, "house");
  // Oberkante der Außenwände (gable.js): Haus → Kniestock, flach → Raumhöhe, ohne Dach → Raumhöhe, Erker des Hauses → Kniestock
  near(exteriorTopAt(models, null, 2.75, 2.4, ["haus"]), 1);
  near(exteriorTopAt(models, [12, 2], 2.75, 2.4, ["anbau"]), 2.4);
  near(exteriorTopAt(models, [30, 30], 2.75, 2.4, ["frei"]), 2.4);
  near(exteriorTopAt([], null, 2.75, 2.4), 2.4);
  assert.equal(roofSurfaceAt(models[0], [5, 9.5]), null); // Erker liegt außerhalb der Dachrahmen …
  near(exteriorTopAt(models, [5, 9.5], 2.75, 2.4, ["erker"]), 1); // … gehört aber zum Hausdach
});

test("Hausdach plus freies Dachteil mit offenem Ende: verdeckte PV-Module zählen nicht", () => {
  const b = {
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35, items: [{ id: "pv_h", type: "pv", x: 5, z: 6.5, cols: 3, rows: 1 }] } },
    floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "haus", points: rect(0, 0, 10, 8) }], roofs: [{ id: "dach_1", type: "gable", points: rect(3, 5, 7, 14), items: [{ id: "pv_p", type: "pv", x: 6.2, z: 7.5, cols: 4, rows: 1 }] }] }],
  };
  const units = roofUnits(b);
  const part = units.find((u) => u.kind === "part");
  const house = units.find((u) => u.kind === "house");
  assert.deepEqual(part.model.shape.frames[0].open, [true, false]);
  const lp = pvLayout(part.model, part.items[0], { others: floorModels(units, "eg", part.key) });
  assert.ok(lp.count < lp.panels.length && lp.count > 0);
  assert.equal(pvLayout(part.model, part.items[0]).count, lp.panels.length);
  const lh = pvLayout(house.model, house.items[0], { others: floorModels(units, "eg", "house") });
  assert.ok(lh.count < pvLayout(house.model, house.items[0]).count);
  assert.equal(unitAt(units, [5, 6.5], "house").unit.key, part.key);
  const all = roofItemsAll(b);
  assert.deepEqual(all.map((x) => [x.item.id, x.others.length]), [["pv_h", 1], ["pv_p", 1]]);
});

test("kaputtes Dachteil (Punkte auf einer Linie): wählbar und löschbar, sonst übersprungen", () => {
  const b = fixture();
  b.floors[1].attic = true;
  b.floors[1].roofs = [{ id: "dach_x", type: "gable", points: [[0, 0], [1, 0], [2, 0]], items: [{ id: "pv_x", type: "pv", x: 1, z: 0 }] }];
  const units = roofUnits(b);
  const u = units.find((x) => x.key === "part:og:dach_x");
  assert.equal(u.broken, true);
  assert.equal(u.model, null);
  assert.deepEqual(u.rooms, []);
  assert.deepEqual(atticModels(b).get("og").map((m) => m.kind), ["house"]);
  assert.ok(!roofItemsAll(b).some((x) => x.item.id === "pv_x"));
  assert.deepEqual(unitFaces(u), { faces: [], ridges: [] });
  assert.equal(unitAt([u], [1, 0]), null);
  assert.deepEqual(floorModels(units, "og").map((m) => m.kind), ["house"]);
  assert.equal(findUnit(b, "part:og:dach_x").broken, true);
  assert.ok(deletePart(b, "part:og:dach_x"));
  assert.equal(b.floors[1].roofs, undefined);
  assert.ok(!deletePart(b, "part:og:dach_x"));
});

test("Gruppe mit je einem Ding: Lage-Regel beim Bearbeiten, Verschieben und Kopieren", () => {
  const b = pair();
  room(b, "s").roof.items = [{ id: "k_a", type: "chimney", x: 1, z: 1 }, { id: "k_b", type: "chimney", x: 4.5, z: 1, entity: "sensor.kamin" }];
  editUnit(b, "room:eg:s", () => {});
  assert.deepEqual(room(b, "s").roof.items.map((i) => i.id), ["k_a"]);
  assert.deepEqual(room(b, "u").roof.items.map((i) => i.id), ["k_b"]);
  const moved = moveRoom(room(b, "u"), 1, 0);
  assert.equal(moved.roof.items[0].x, 5.5);
  assert.equal(room(b, "s").roof.items[0].x, 1);
  const clip = copyRefs(b.floors[0], [{ kind: "room", id: "s" }]);
  const { floor, added } = pasteClip(b.floors[0], clip, [10, 10], allIds(b));
  const copy = floor.rooms.find((r) => r.id === added[0].id);
  assert.equal(copy.roof.items.length, 1);
  assert.notEqual(copy.roof.items[0].id, "k_a");
  // Dinge auf dem Überstand gehören zum nächsten Raum
  assert.equal(ownerRoom(b.floors[0].rooms, [5.3, 1]).id, "u");
  assert.equal(ownerRoom([], [0, 0]), null);
});

test("Flächen für den Plan und Kurzbeschreibung", () => {
  const b = fixture();
  const g = unitFaces(findUnit(b, "room:eg:garage"));
  assert.equal(g.faces.length, 1);
  assert.equal(g.ridges.length, 0);
  const h = unitFaces(findUnit(b, "house"));
  assert.equal(h.faces.length, 2);
  assert.equal(h.ridges.length, 1);
  b.floors[0].roofs = [{ id: "dach_1", type: "hip", points: rect(20, 0, 26, 4) }];
  const p = unitFaces(findUnit(b, "part:eg:dach_1"));
  assert.equal(p.faces.length, 4);
  assert.ok(p.faces.every((f) => f.k === 0 && f.op > 0.4 && f.op < 0.9));
  assert.equal(roofSummary({ type: "gable", pitch: 25, overhang: 0.3 }), "Satteldach 25° · Überstand 0,30 m");
  assert.equal(roofSummary({ type: "flat", overhang: 0.4 }), "Flachdach · Überstand 0,40 m");
  assert.equal(roofSummary({ type: "mansard", pitch: 30, pitch_low: 70, overhang: 0.4 }), "Mansarddach 30°/70° · Überstand 0,40 m");
  assert.equal(roofSummary({ type: "terrace", railing: "none" }), "Dachterrasse · ohne Geländer");
  assert.equal(roofSummary(null), "Kein Dach");
});

test("Editor: eigener Hinweis und Kanten-Hinweis stehen zusammen statt sich zu überschreiben", async () => {
  const { RoofUnitMethods } = await import("../../custom_components/haus3d/frontend/editor-roofunits.js");
  const toasts = [];
  const ed = Object.assign(Object.create(RoofUnitMethods), {
    b: pair(),
    sel: null,
    _pushUndo() {},
    render() {},
    renderBar() {},
    renderProps() {},
    _sync3d() {},
    _queueDraft() {},
    _toast: (t) => toasts.push(t),
    changeBuilding(fn) {
      fn(this.b);
    },
  });
  // changeUnit: Gruppe zerfällt (Zeltdach je Raum) → Kanten weg; die Notiz wird nach fn ausgewertet
  Object.assign(room(ed.b, "s").roof, { adjust: [{ a: -0.2 }] });
  let seen = false;
  ed.changeUnit("room:eg:u", (r) => {
    r.type = "pyramid";
    seen = true;
  }, { note: () => (seen ? "Notiz." : "") });
  assert.deepEqual(toasts, ["Notiz. Kanten-Anpassungen zurückgesetzt (die Dachform hat sich geändert)."]);
  ed.changeUnit("room:eg:u", (r) => {
    r.pitch = 30;
  });
  assert.equal(toasts.length, 1, "ohne Notiz und ohne zurückgesetzte Kanten kein Hinweis");
  // Hausdach-Wächter: eigener Hinweis der Aktion vorneweg, Rückgabe sagt, ob zurückgesetzt wurde
  ed.b.settings.roof = { type: "gable", adjust: [{ lo: 0.3 }] };
  assert.equal(ed._houseGuard(null, "Umgewandelt."), false);
  assert.equal(ed._houseGuard("andere", "Umgewandelt."), true);
  assert.equal(ed.b.settings.roof.adjust, undefined);
  assert.equal(toasts.at(-1), "Umgewandelt. Das Hausdach deckt jetzt andere Räume – seine Kanten-Anpassungen sind zurückgesetzt.");
  assert.equal(ed._houseGuard("andere", "Umgewandelt."), false, "ohne Anpassungen nichts zu tun");
});

test("schmaler Raum (< 0,4 m) mit Flach-, Sattel-, Walm- oder Pultdach: Einheit ohne Modell, als kaputt markiert", () => {
  for (const type of ["flat", "gable", "hip", "shed", "mansard"]) {
    const b = { settings: {}, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [
      { id: "a", name: "A", points: [[0, 0], [6, 0], [6, 5], [0, 5]] },
      { id: "s", name: "S", points: [[7, 0], [10, 0], [10, 0.38], [7, 0.38]], roof: { type, pitch: 30, overhang: 0 } },
    ] }] };
    const u = roofUnits(b, "eg", { house: false }).find((x) => x.key === "room:eg:s");
    assert.equal(u.model, null, type);
    assert.equal(u.broken, true, type);
  }
  // Zeltdach und Dachterrasse haben ihre Gestalt ohne Rahmen: bleiben gültig
  for (const type of ["pyramid", "terrace"]) {
    const b = { settings: {}, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "s", name: "S", points: [[7, 0], [10, 0], [10, 0.38], [7, 0.38]], roof: { type, pitch: 30, overhang: 0 } }] }] };
    assert.ok(roofUnits(b, "eg", { house: false })[0].model, type);
  }
});

test("Schlüssel mit „:“ in der Etagen-ID: finden, bearbeiten, zerlegen", () => {
  const mk = (fid) => ({ settings: {}, floors: [{ id: fid, name: "EG", elevation: 0, height: 2.5, rooms: [{ id: "g", name: "Garage", points: [[0, 0], [4, 0], [4, 4], [0, 4]], roof: { type: "flat" } }],
    roofs: [{ id: "roof_1", type: "gable", points: [[10, 0], [14, 0], [14, 4], [10, 4]] }] }] });
  for (const fid of ["eg", "haus:eg", "a%b"]) {
    const b = mk(fid);
    const units = roofUnits(b, null, { house: false });
    assert.equal(units.length, 2, fid);
    for (const u of units) {
      assert.equal(parseUnitKey(u.key).floorId, fid);
      assert.equal(findUnit(b, u.key)?.key, u.key, `${fid}: ${u.key}`);
      assert.equal(editUnit(structuredClone(b), u.key, (r) => {
        r.color = "#ff0000";
      }), u.key);
    }
  }
  assert.equal(unitKey("room", "eg", "a:b"), "room:eg:a:b");
  assert.deepEqual(parseUnitKey("part:%E0%A4%A:x"), { kind: "part", floorId: "%E0%A4%A", id: "x" }); // ungültig kodiert: roh
});

test("Dinge des Hausdachs über einem Raum, der ein eigenes Dach bekommt bzw. unter ein Dachteil fällt, ziehen mit", () => {
  const mk = () => ({
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 30, overhang: 0.3, items: [
      { id: "pv_g", type: "pv", x: 12.6, z: 1.5, cols: 1, rows: 1 },
      { id: "ch_g", type: "chimney", x: 12, z: 2.5 },
      { id: "ch_a", type: "chimney", x: 3, z: 3 },
      { id: "ohne", type: "chimney" },
    ] } },
    floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [
      { id: "a", points: [[0, 0], [10, 0], [10, 8], [0, 8]] },
      { id: "g", points: [[10, 0], [15, 0], [15, 5], [10, 5]] },
    ] }],
  });
  // eigenes Dach für die Garage
  const b = mk();
  const report = {};
  const res = addRoomRoof(b, "eg", "g", "gable", report);
  assert.equal(report.adopted, 2);
  assert.deepEqual(b.settings.roof.items.map((x) => x.id), ["ch_a", "ohne"]);
  assert.deepEqual(findUnit(b, res.key).items.map((x) => x.id).sort(), ["ch_g", "pv_g"]);
  assert.equal(pvLayout(findUnit(b, res.key).model, findUnit(b, res.key).items.find((x) => x.id === "pv_g")).count, 1);
  // Dachteil über der Garage (wie _insertPart): vorher das Modell merken
  const c = mk();
  const before = roofModel(c);
  c.floors[0].roofs = [{ id: "dach_1", type: "flat", points: [[10, 0], [15, 0], [15, 5], [10, 5]] }];
  assert.equal(adoptHouseItems(c, before), 2);
  assert.deepEqual(c.floors[0].roofs[0].items.map((x) => x.id).sort(), ["ch_g", "pv_g"]);
  // nichts geändert: nichts umgehängt; ohne before nichts (außer all)
  assert.equal(adoptHouseItems(c, roofModel(c)), 0);
  assert.equal(adoptHouseItems(mk(), null), 0);
  // ältere Stände: Hausdach-Dinge über einem Raum mit eigenem Dach → Hinweis und Umhängen mit all
  const old = mk();
  old.floors[0].rooms[1].roof = { type: "gable", pitch: 25, overhang: 0.3 };
  assert.deepEqual(strayHouseItems(old).map((x) => x.id).sort(), ["ch_g", "pv_g"]);
  assert.equal(adoptHouseItems(old, null, { all: true }), 2);
  assert.deepEqual(strayHouseItems(old), []);
  assert.deepEqual(old.floors[0].rooms[1].roof.items.map((x) => x.id).sort(), ["ch_g", "pv_g"]);
});
