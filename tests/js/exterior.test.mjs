// Tests für Dach, Balkon, Wetter und Streupunkte
import assert from "node:assert/strict";
import { test } from "node:test";

import { freeEdges, mainDirection, roofFloor, roofRooms, roofFrame, roofSettings, scatter, weatherEntity, weatherKind } from "../../custom_components/haus3d/frontend/exterior.js";
import { pointInPolygon } from "../../custom_components/haus3d/frontend/walls.js";

const rect = (x0, z0, x1, z1) => ({ points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });

test("Dachrahmen: First entlang der langen Seite, um Wand und Überstand vergrößert", () => {
  const f = roofFrame([rect(0, 0, 10, 6)], { wall: 0.24, overhang: 0.4 });
  assert.deepEqual(f.center, [5, 3]);
  assert.equal(f.length, 11.28);
  assert.equal(f.width, 7.28);
  assert.ok(Math.abs(Math.abs(f.u[0]) - 1) < 1e-9); // First entlang x
  const g = roofFrame([rect(0, 0, 6, 10)], { wall: 0, overhang: 0 });
  assert.ok(Math.abs(Math.abs(g.u[1]) - 1) < 1e-9); // First entlang z
  const h = roofFrame([rect(0, 0, 10, 6)], { wall: 0, overhang: 0, direction: "z" });
  assert.equal(h.length, 6);
});

test("Hauptrichtung eines gedrehten Hauses", () => {
  const a = Math.PI / 6;
  const rot = ([x, z]) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
  const room = { points: rect(0, 0, 8, 5).points.map(rot) };
  assert.ok(Math.abs(mainDirection([room]) - a) < 1e-6);
  const f = roofFrame([room], { wall: 0, overhang: 0 });
  assert.ok(Math.abs(f.length - 8) < 1e-3 && Math.abs(f.width - 5) < 1e-3);
});

test("Dach-Einstellungen werden begrenzt, oberste Etage gewählt", () => {
  const r = roofSettings({ roof: { type: "quatsch", pitch: 90, overhang: -1 } });
  assert.deepEqual([r.type, r.pitch, r.overhang], ["none", 60, 0]);
  const b = { floors: [{ id: "kg", elevation: -2.6, height: 2.4, rooms: [rect(0, 0, 1, 1)] }, { id: "eg", elevation: 0, height: 2.6, rooms: [rect(0, 0, 1, 1)] }, { id: "garten", elevation: 3, height: 0.5, rooms: [] }] };
  assert.equal(roofFloor(b, r).id, "eg");
  assert.equal(roofFloor(b, { floor: "kg" }).id, "kg");
});

test("Balkon: Geländer nur an den Kanten, die nicht am Haus liegen", () => {
  const house = rect(0, 0, 8, 6);
  const balcony = [[2, 6], [5, 6], [5, 7.5], [2, 7.5]];
  const free = freeEdges(balcony, [house]);
  assert.equal(free.length, 3);
  assert.ok(!free.some(([a, b]) => a[1] === 6 && b[1] === 6));
  // freistehende Fläche: alle Kanten
  assert.equal(freeEdges([[20, 20], [22, 20], [22, 22]], [house]).length, 3);
});

test("Wetter aus dem Zustand", () => {
  assert.equal(weatherKind({ state: "pouring" }).kind, "rain");
  assert.equal(weatherKind({ state: "snowy" }).kind, "snow");
  assert.equal(weatherKind({ state: "sunny" }).kind, null);
  assert.equal(weatherKind(undefined).kind, null);
  const hass = { states: { "weather.zuhause": { state: "rainy" }, "weather.alt": { state: "sunny" } } };
  assert.equal(weatherEntity(hass, {}), "weather.alt");
  assert.equal(weatherEntity(hass, { weather: "weather.zuhause" }), "weather.zuhause");
  assert.equal(weatherEntity(hass, { weather: "none" }), null);
});

test("Streupunkte liegen im Polygon und sind reproduzierbar", () => {
  const bed = [[0, 0], [4, 0], [4, 1], [0, 1]];
  const a = scatter(bed, { seed: "beet", perM2: 5 });
  assert.equal(a.length, 20);
  assert.ok(a.every((p) => pointInPolygon(p, bed)));
  assert.deepEqual(scatter(bed, { seed: "beet", perM2: 5 }), a);
});

test("Dach nur über dem Haus: abseits stehender Schuppen bleibt außen vor", () => {
  const floor = { rooms: [{ id: "a", ...rect(0, 0, 5, 6) }, { id: "b", ...rect(5, 0, 9, 6) }, { id: "schuppen", ...rect(20, 0, 23, 3) }] };
  assert.deepEqual(roofRooms(floor, {}).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(roofRooms(floor, { rooms: ["schuppen"] }).map((r) => r.id), ["schuppen"]);
});

test("L-Haus: Hauptdach plus Flügel bis zum First", async () => {
  const { roofParts } = await import("../../custom_components/haus3d/frontend/exterior.js");
  // Hauptteil 14 × 8 (z 5..13), Flügel 6 × 5 davor (z 0..5)
  const rooms = [
    { points: [[0, 5], [14, 5], [14, 13], [0, 13]] },
    { points: [[0, 0], [6, 0], [6, 5], [0, 5]] },
    // kleiner Schacht ohne Raum mitten im Hauptteil wird gefüllt
    { points: [[8, 5], [14, 5], [14, 8], [8, 8]] },
  ];
  const parts = roofParts([rooms[1], { points: [[0, 5], [8, 5], [8, 8], [8.4, 8], [8.4, 8.6], [8, 8.6], [8, 13], [0, 13]] }, rooms[2], { points: [[8.4, 8], [14, 8], [14, 13], [8.4, 13], [8.4, 8.6], [8.4, 8]] }], { wall: 0, overhang: 0 });
  assert.equal(parts.length, 2);
  const [main, wing] = parts;
  assert.deepEqual([main.length, main.width], [14, 8]);
  // Flügel: von z = 0 bis zum First des Hauptdachs bei z = 9
  assert.deepEqual([wing.length, wing.width], [9, 6]);
  assert.ok(Math.abs(Math.abs(wing.u[1]) - 1) < 1e-9);
  assert.equal(wing.open.filter(Boolean).length, 1);
  // Rechteck: nur ein Teil
  assert.equal(roofParts([rooms[0]]).length, 1);
});

test("Hang automatisch: Ecken an der oberen Gartenebene bekommen deren Höhe", async () => {
  const { autoHeights, roomRoofGroups } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const b = {
    floors: [
      { id: "kg", elevation: -2.6, rooms: [], outdoor: [
        { id: "unten", type: "lawn", points: [[0, 0], [10, 0], [10, 5], [0, 5]] },
        { id: "hang", type: "lawn", points: [[0, 5], [10, 5], [10, 9], [5, 9.5], [0, 9]] },
      ] },
      { id: "eg", elevation: 0, rooms: [], outdoor: [{ id: "oben", type: "lawn", points: [[0, 9], [10, 9], [10, 15], [0, 15]] }] },
    ],
  };
  // (5, 9.5) liegt in der oberen Fläche; (0,5)/(10,5) an der unteren
  assert.deepEqual(autoHeights(b, "kg", "hang"), [0, 0, 2.6, 2.6, 2.6]);
  assert.equal(autoHeights(b, "kg", "unten"), null);
  const floor = { rooms: [{ id: "s", points: rect(0, 0, 3, 2).points, roof: { type: "gable", pitch: 20 } }, { id: "u", points: rect(3, 0, 5, 2).points, roof: { type: "gable" } }, { id: "x", points: rect(9, 9, 10, 10).points }] };
  const groups = roomRoofGroups(floor);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rooms.map((r) => r.id), ["s", "u"]);
  assert.equal(groups[0].roof.pitch, 20);
  assert.equal(groups[0].leader.id, "s");
  // abgetrennt, andere Dachform, unbekannte Form
  floor.rooms[1].roof.separate = true;
  assert.equal(roomRoofGroups(floor).length, 2);
  delete floor.rooms[1].roof.separate;
  floor.rooms[1].roof.type = "shed";
  assert.deepEqual(roomRoofGroups(floor).map((g) => g.roof.type), ["gable", "shed"]);
  floor.rooms[1].roof.type = "quatsch";
  assert.deepEqual(roomRoofGroups(floor).map((g) => g.leader.id), ["s"]);
  // Einzelformen nie zusammen, Neigung 0 → Standard der Form
  floor.rooms[0].roof = { type: "cone", pitch: 0 };
  floor.rooms[1].roof = { type: "cone" };
  assert.deepEqual(roomRoofGroups(floor).map((g) => [g.leader.id, g.roof.pitch]), [["s", 55], ["u", 55]]);
});

test("PV: Himmelsrichtung der Dachfläche und Modulplätze", async () => {
  const { compassOf, panelSlots } = await import("../../custom_components/haus3d/frontend/exterior.js");
  // Norden oben im Plan (-z)
  assert.equal(compassOf([0, -1]), "N");
  assert.equal(compassOf([0, 1]), "S");
  assert.equal(compassOf([1, 0]), "E");
  assert.equal(compassOf([-1, 0]), "W");
  // Norden 90° gedreht (rechts im Plan): +x ist Norden, +z Osten
  assert.equal(compassOf([1, 0], 90), "N");
  assert.equal(compassOf([0, 1], 90), "E");
  // Dachfläche 10 m lang, 4,5 m bis zum First, 35°: zwei Reihen, mittig
  const slots = panelSlots({ length: 10, width: 9 }, { tan: Math.tan((35 * Math.PI) / 180), count: 10 });
  assert.equal(slots.length, 10);
  const rows = [...new Set(slots.map((p) => p.x))];
  assert.equal(rows.length, 2);
  // 9 passen in eine Reihe (9,4 m nutzbar), Rest in Reihe 2
  assert.equal(slots.filter((p) => p.x === rows[0]).length, 9);
  assert.ok(Math.abs(slots.filter((p) => p.x === rows[0]).reduce((a, p) => a + p.s, 0)) < 1e-6);
  // Walm: obere Reihe schmaler
  const hip = panelSlots({ length: 10, width: 9 }, { tan: 0.7, count: 30, type: "hip", hipEnds: [true, true] });
  const r = [...new Set(hip.map((p) => p.x))];
  assert.ok(hip.filter((p) => p.x === r[1]).length < hip.filter((p) => p.x === r[0]).length);
});

test("PV: belegte Bereiche (Flügel) werden ausgespart", async () => {
  const { panelSlots } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const slots = panelSlots({ length: 10, width: 9 }, { tan: 0.7, count: 50, blocked: [[-5, 0]] });
  assert.ok(slots.length > 0 && slots.every((p) => p.s - 0.5 >= 0 - 1e-9));
});

test("PV-Felder: Spalten × Reihen, quer, von links, Kehle", async () => {
  const { panelArraySlots, blockedAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const part = { length: 15, width: 9 };
  const tan = Math.tan((35 * Math.PI) / 180);
  // 3 × 4 quer, ganz links: 12 Module, linke Kante bei s = -7.5 + 0.3 (Rand) ... hier left = 0.3
  const a = panelArraySlots(part, { tan, cols: 3, rows: 4, orient: "landscape", left: 0.3 });
  assert.equal(a.length, 12);
  assert.ok(Math.abs(Math.min(...a.map((p) => p.s - p.w / 2)) - -7.2) < 1e-6);
  // gespiegelt (flip -1): gleiches Feld am anderen Ende
  const b = panelArraySlots(part, { tan, cols: 3, rows: 4, orient: "landscape", left: 0.3, flip: -1 });
  assert.ok(Math.abs(Math.max(...b.map((p) => p.s + p.w / 2)) - 7.2) < 1e-6);
  // Kehle: unten breit gesperrt, weiter oben frei
  assert.deepEqual(blockedAt([{ c: 0, hw: 3 }], 1), [[-2, 2]]);
  assert.deepEqual(blockedAt([{ c: 0, hw: 3 }], 3.5), []);
  const v = panelArraySlots(part, { tan, cols: 1, rows: 4, orient: "landscape", left: 8.5, blocked: [{ c: 0, hw: 3.75 }] });
  assert.ok(v.length > 0 && v.length < 4); // unten gesperrt, oben frei
});

test("Dach-Ebene: Höhe und Richtung der Dachfläche an einem Punkt", async () => {
  const { roofModel, roofSurfaceAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const b = { settings: { wall_exterior: 0, roof: { type: "gable", pitch: 45, overhang: 0 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [rect(0, 0, 10, 6)] }] };
  const m = roofModel(b);
  assert.equal(m.parts.length, 1);
  // First entlang x bei z = 3; an der Traufe Höhe 2,5, am First 2,5 + 3
  const eave = roofSurfaceAt(m, [5, 0]);
  assert.ok(Math.abs(eave.y - 2.5) < 1e-9);
  assert.deepEqual(eave.out.map((v) => Math.round(v) + 0), [0, -1]);
  const ridge = roofSurfaceAt(m, [5, 3]);
  assert.ok(Math.abs(ridge.y - 5.5) < 1e-9);
  assert.deepEqual(roofSurfaceAt(m, [5, 5]).out.map((v) => Math.round(v) + 0), [0, 1]);
  assert.equal(roofSurfaceAt(m, [20, 3]), null);
  // Walm: an der Stirnseite zeigt die Fläche nach außen
  const hip = roofModel({ ...b, settings: { ...b.settings, roof: { type: "hip", pitch: 45, overhang: 0 } } });
  assert.deepEqual(roofSurfaceAt(hip, [0.5, 3]).out.map((v) => Math.round(v) + 0), [-1, 0]);
  assert.equal(roofModel({ settings: {}, floors: [] }), null);
});

test("Dach-Ebene: PV-Feld richtet sich nach der Fläche, Reihe 1 an der Traufe", async () => {
  const { roofModel, pvLayout, legacyPvItems } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const b = { settings: { wall_exterior: 0, roof: { type: "gable", pitch: 30, overhang: 0 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [rect(0, 0, 10, 6)] }] };
  const m = roofModel(b);
  // Südseite (z > 3): Reihen laufen in z, Spalten in x
  const lay = pvLayout(m, { x: 5, z: 4.5, cols: 3, rows: 2, orient: "portrait" });
  assert.equal(lay.panels.length, 6);
  const xs = [...new Set(lay.panels.map((p) => p[0].toFixed(3)))];
  const zs = [...new Set(lay.panels.map((p) => p[1].toFixed(3)))];
  assert.equal(xs.length, 3);
  assert.equal(zs.length, 2);
  // erste Reihe (Index 0) liegt weiter unten (größeres z = näher an der Südtraufe)
  assert.ok(lay.panels[0][1] > lay.panels[3][1]);
  // Abstand der Reihen im Grundriss: (1,7 + Fuge) · cos 30°
  assert.ok(Math.abs(lay.panels[0][1] - lay.panels[3][1] - 1.73 * Math.cos(Math.PI / 6)) < 1e-6);
  assert.equal(lay.count, 6);
  // Feld über dem First: obere Reihe liegt auf der Nordseite und fällt weg
  const over = pvLayout(m, { x: 5, z: 3.9, cols: 2, rows: 2 });
  assert.equal(over.count, 2);
  assert.deepEqual(over.fits, [true, true, false, false]);
  // bisherige Angabe „8 nach Süden“ wird zu verschiebbaren Feldern
  b.settings.roof.solar = { S: 8 };
  const items = legacyPvItems(roofModel(b), 0);
  assert.ok(items.length >= 1);
  assert.equal(items.reduce((a, it) => a + it.cols * it.rows, 0), 8);
  assert.ok(items.every((it) => it.z > 3));
});

test("Texturen: Standard je Fläche, eigene Wahl, glatt", async () => {
  const { textureFor, textureOptions } = await import("../../custom_components/haus3d/frontend/model.js");
  assert.equal(textureFor("wall"), "plaster");
  assert.equal(textureFor("wall", "brick"), "brick");
  assert.equal(textureFor("wall", "none"), null);
  assert.equal(textureFor("wall", "quatsch"), "plaster");
  assert.equal(textureFor("floor", "", "tiles_dark"), "tiles");
  assert.equal(textureFor("roof", null, "flat"), "gravel");
  assert.equal(textureFor("ground", undefined, "lawn"), "grass");
  assert.ok(textureOptions("r").some(([k]) => k === "roof_tiles"));
  assert.ok(!textureOptions("r").some(([k]) => k === "parquet"));
});

test("Dachteile von Hand anpassen: verlängern, verbreitern, verschieben", async () => {
  const { adjustRoofParts, roofModel } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const fr = { center: [5, 3], u: [1, 0], v: [0, 1], length: 10, width: 6 };
  const [a] = adjustRoofParts([fr], [{ hi: 1, b: 0.5 }]);
  assert.equal(a.length, 11);
  assert.equal(a.width, 6.5);
  assert.deepEqual(a.center, [5.5, 3.25]);
  // verschieben: lo −1, hi +1 → gleiche Länge, Mitte +1 entlang u
  const [m] = adjustRoofParts([fr], [{ lo: -1, hi: 1 }]);
  assert.deepEqual([m.length, m.center[0]], [10, 6]);
  assert.equal(adjustRoofParts([fr], [null])[0], fr);
  const b = { settings: { wall_exterior: 0, roof: { type: "gable", pitch: 30, overhang: 0, adjust: [{ a: 1 }] } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [rect(0, 0, 10, 6)] }] };
  assert.equal(roofModel(b).parts[0].width, 7);
});

test("Pultdach andersherum: hohe Seite getauscht", async () => {
  const { adjustRoofParts, roofModel, roofSurfaceAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const fr = { center: [0, 0], u: [1, 0], v: [0, 1], length: 4, width: 2 };
  assert.deepEqual(adjustRoofParts([fr], null, true)[0].v.map((x) => x + 0), [0, -1]);
  const b = (flip) => ({ settings: { wall_exterior: 0, roof: { type: "shed", pitch: 20, overhang: 0, flip } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [rect(0, 0, 4, 2)] }] });
  const hi = (m) => (roofSurfaceAt(m, [2, 0.1]).y > roofSurfaceAt(m, [2, 1.9]).y ? "oben" : "unten");
  assert.notEqual(hi(roofModel(b(false))), hi(roofModel(b(true))));
});

test("Balkonkraftwerk-Raum: energy_role vor alter Erkennung", async () => {
  const { isPvShed, findPvShed } = await import("../../custom_components/haus3d/frontend/exterior.js");
  assert.ok(isPvShed({ energy_role: "balkonkraftwerk", name: "Hütte" }));
  assert.ok(isPvShed({ area_id: "balkonkraftwerk", name: "X" }));
  assert.ok(isPvShed({ name: "Schuppen" }));
  assert.ok(!isPvShed({ name: "Schuppen", energy_role: "none" }));
  const b = { floors: [{ id: "eg", rooms: [{ id: "s", name: "Schuppen" }, { id: "g", name: "Gartenhaus 2", energy_role: "balkonkraftwerk" }] }] };
  assert.equal(findPvShed(b).room.id, "g");
});

test("Dachgeschoss: Dach setzt auf dem Kniestock an, Flächen über den Räumen des Dachgeschosses", async () => {
  const { atticFloor, roofBase, roofModel, roofSurfaceAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const eg = { id: "eg", elevation: 0, height: 2.5, rooms: [rect(0, 0, 10, 6)] };
  const dg = { id: "dg", elevation: 2.75, height: 2.4, attic: true, knee: 1, rooms: [rect(0, 0, 10, 6)] };
  const b = { settings: { wall_exterior: 0, roof: { type: "gable", pitch: 45, overhang: 0 } }, floors: [eg, dg] };
  assert.equal(atticFloor(b).id, "dg");
  assert.equal(roofBase(dg), 3.75);
  assert.equal(roofBase(eg), 2.5);
  const m = roofModel(b);
  assert.equal(m.floor.id, "dg");
  assert.ok(Math.abs(roofSurfaceAt(m, [5, 0]).y - 3.75) < 1e-9); // Traufe auf dem Kniestock
  assert.ok(Math.abs(roofSurfaceAt(m, [5, 3]).y - 6.75) < 1e-9); // First 3 m darüber (45°)
  // Kniestock nie höher als die Raumhöhe; ohne Dachgeschoss wie bisher die oberste Etage
  assert.equal(roofBase({ elevation: 0, height: 2, attic: true, knee: 5 }), 2);
  assert.equal(roofModel({ ...b, floors: [eg, { ...dg, attic: false }] }).top, 2.75 + 2.4);
  // Dachgeschoss ohne Räume trägt das Dach nicht
  assert.equal(roofModel({ ...b, floors: [eg, { ...dg, rooms: [] }] }).floor.id, "eg");
});

test("Editor: Dachgeschoss anlegen, Dach-Eintrag nur mit Dach", async () => {
  const { newAttic, roofOn } = await import("../../custom_components/haus3d/frontend/editor-attic.js");
  const b = { settings: {}, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [] }] };
  const a = newAttic(b);
  assert.equal(a.attic, true);
  assert.equal(a.elevation, 2.75);
  assert.equal(a.name, "Dachgeschoss");
  assert.equal(roofOn(b), false);
  assert.equal(roofOn({ settings: { roof: { type: "gable" } } }), true);
});

test("Hausdach spart Räume mit eigenem Dach aus, die Lücke bleibt offen", async () => {
  const { coveredRoomIds, roofModel, roofRooms, roofSurfaceAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const rooms = [rect(0, 0, 10, 3), rect(0, 5, 10, 8), rect(0, 3, 3, 5), rect(7, 3, 10, 5), rect(3, 3, 7, 5)].map((r, i) => ({ id: "abcde"[i], ...r }));
  const b = { settings: { wall_exterior: 0, roof: { type: "gable", pitch: 30, overhang: 0 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms }] };
  assert.ok(roofSurfaceAt(roofModel(b), [5, 4])); // Lücke gefüllt
  rooms[4].roof = { type: "flat" };
  assert.deepEqual([...coveredRoomIds(b.floors[0])], ["e"]);
  const m = roofModel(b);
  assert.deepEqual(m.rooms.map((r) => r.id), ["a", "b", "c", "d"]);
  assert.equal(roofSurfaceAt(m, [5, 4]), null);
  // ausdrückliche Liste: ohne abgedeckte Räume, bleibt nichts übrig, gilt „automatisch“
  const floor = { rooms: [{ id: "a", ...rect(0, 0, 4, 4) }, { id: "b", ...rect(4, 0, 8, 4) }] };
  assert.deepEqual(roofRooms(floor, {}, new Set(["b"])).map((r) => r.id), ["a"]);
  assert.deepEqual(roofRooms(floor, { rooms: ["b"] }, new Set(["b"])).map((r) => r.id), ["a"]);
  assert.deepEqual(roofRooms(floor, { rooms: ["a", "b"] }, new Set(["b"])).map((r) => r.id), ["a"]);
  // unter einem freien Dachteil (labelPoint im Umriss)
  floor.roofs = [{ id: "p", type: "flat", points: rect(3.5, -1, 9, 5).points }];
  assert.deepEqual([...coveredRoomIds(floor)], ["b"]);
  assert.deepEqual(roofRooms(floor, {}).map((r) => r.id), ["a"]);
});

test("Hausdach-Modell: Art, geneigt, höchster Punkt; Weiche über model.at, Neigung je Treffer", async () => {
  const { roofModel, roofSurfaceAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const b = (type) => ({ settings: { wall_exterior: 0, roof: { type, pitch: 45, overhang: 0 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [rect(0, 0, 10, 6)] }] });
  const m = roofModel(b("gable"));
  assert.deepEqual([m.key, m.kind, m.pitched], ["house", "house", true]);
  assert.ok(Math.abs(m.ridgeY - (m.eave + 3 * m.tan)) < 1e-9);
  assert.ok(Math.abs(roofSurfaceAt(m, [5, 1]).tan - 1) < 1e-9);
  const f = roofModel(b("flat"));
  assert.deepEqual([f.pitched, f.ridgeY, roofSurfaceAt(f, [5, 1]).tan], [false, 2.75, 0]);
  assert.ok(Math.abs(roofModel(b("shed")).ridgeY - (2.5 + 6)) < 1e-9);
  assert.deepEqual(roofSurfaceAt({ at: (x, z) => ({ y: x + z, out: null, tan: 0 }) }, [1, 2]), { y: 3, out: null, tan: 0 });
});

test("PV-Feld: nur Module auf derselben Ebene, überdeckte Module fallen weg, Neigung je Fläche", async () => {
  const { fieldInfo, pvLayout, roofModel } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const { partShape } = await import("../../custom_components/haus3d/frontend/roofshapes.js");
  // Anbau mit eigenem, niedrigerem First neben dem Haupthaus: Südflächen parallel, aber nicht eine Ebene
  const b = { settings: { wall_exterior: 0, roof: { type: "gable", pitch: 35, overhang: 0.4 } }, floors: [{ id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", ...rect(0, 0, 10, 6) }, { id: "b", ...rect(10, 1, 14, 5) }] }] };
  const m = roofModel(b);
  assert.equal(m.parts.length, 2);
  const lay = pvLayout(m, { x: 9, z: 5, cols: 3, rows: 1 });
  assert.equal(lay.fits[0], true);
  assert.equal(lay.fits[2], false); // drittes Modul läge auf der Fläche des Anbaus
  assert.ok(Math.abs(lay.tan - Math.tan((35 * Math.PI) / 180)) < 1e-9);
  const free = pvLayout(m, { x: 5, z: 5, cols: 3, rows: 1 });
  assert.equal(free.count, 3);
  const high = { at: () => ({ y: 99, out: null, tan: 0 }) };
  const low = { at: () => ({ y: 0, out: null, tan: 0 }) };
  assert.equal(pvLayout(m, { x: 5, z: 5, cols: 3, rows: 1 }, { others: [high] }).count, 0);
  assert.equal(pvLayout(m, { x: 5, z: 5, cols: 3, rows: 1 }, { others: [low] }).count, 3);
  assert.equal(fieldInfo(m, { x: 5, z: 5, cols: 3, rows: 1 }, 0, [], [high]).count, 0);
  // Mansarddach: unten 70°, oben 30°
  const sh = partShape({ type: "mansard", points: rect(0, 0, 8, 6).points, pitch: 30, pitch_low: 70 }, { wall: 0, top: 3 });
  assert.equal(Math.round(fieldInfo(sh, { x: 4, z: 0.2, cols: 1, rows: 1, orient: "landscape" }).tilt), 70);
  assert.equal(Math.round(fieldInfo(sh, { x: 4, z: 2.4, cols: 1, rows: 1 }).tilt), 30);
});

test("Flächen eines Dachteils für den Plan", async () => {
  const { roofFacePolys, partHipEnds } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const fr = { center: [5, 3], u: [1, 0], v: [0, 1], length: 10, width: 6, open: [false, false] };
  const g = roofFacePolys({ type: "gable" }, fr);
  assert.equal(g.faces.length, 2);
  assert.deepEqual(g.ridge, [[0, 3], [10, 3]]);
  const h = roofFacePolys({ type: "hip" }, { ...fr, hipEnds: partHipEnds(fr, { type: "hip" }) });
  assert.equal(h.faces.length, 4);
  assert.deepEqual(h.ridge, [[3, 3], [7, 3]]);
  const s = roofFacePolys({ type: "shed" }, fr);
  assert.equal(s.faces.length, 1);
  assert.equal(s.ridge, null);
});

test("Editor: Etagen-Auswahl mit „Hausdach“ und in der Dach-Ebene mit dem Platzhalter „Dach · Etage“", async () => {
  const { AtticMethods } = await import("../../custom_components/haus3d/frontend/editor-attic.js");
  const eg = { id: "eg", name: "EG", elevation: 0, height: 2.5, rooms: [] };
  const b = { settings: { roof: { type: "gable" } }, floors: [eg, { id: "dg", name: "DG", elevation: 2.75, height: 2.4, attic: true, rooms: [] }] };
  const opts = (ctx) => AtticMethods._atticOptions.call({ b, floor: eg, roofMode: false, ...ctx });
  const roof = opts({ roofMode: true });
  assert.match(roof, /<option value="" selected disabled>Dach · EG<\/option>/);
  assert.match(roof, /<option value="__roof">Hausdach<\/option>/);
  assert.equal(roof.split(" selected").length - 1, 1);
  const plain = opts();
  assert.ok(!plain.includes("Dach · ") && !plain.includes(" selected"));
  assert.match(plain, /Hausdach/);
  assert.ok(!plain.includes("__attic")); // Dachgeschoss gibt es schon
  // ohne Hausdach kein „Hausdach“; ohne Etage kein Fehler
  assert.ok(!AtticMethods._atticOptions.call({ b: { settings: {}, floors: [eg] }, floor: eg, roofMode: true }).includes("__roof"));
  assert.match(AtticMethods._atticOptions.call({ b, floor: undefined, roofMode: true }), /Dach · <\/option>/);
});
