// Tests für das Dachgeschoss (gable.js): Giebelflächen, Löcher für Fenster und Türen, Höhen unter der Dachschräge
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { atticGables, atticOpeningLimit, atticOpenings, atticTop, exteriorTopAt, gableCut, gableFaces, gableTriangles, matchGable } from "../../custom_components/haus3d/frontend/gable.js";
import { roofModel, roofSurfaceAt } from "../../custom_components/haus3d/frontend/exterior.js";
import { atticModels } from "../../custom_components/haus3d/frontend/roofunits.js";
import { computeWalls } from "../../custom_components/haus3d/frontend/walls.js";

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const tri2d = (o, hs) => THREE.ShapeUtils.triangulateShape(o.map(([a, y]) => new THREE.Vector2(a, y)), hs.map((h) => h.map(([a, y]) => new THREE.Vector2(a, y))));
const tan40 = Math.tan((40 * Math.PI) / 180);

// Satteldach 40° auf dem Dachgeschoss (Raumhöhe 2,4, Kniestock 1): Giebel im Westen (x = −0,24) und Osten
const fixture = (roof = {}) => ({
  settings: { wall_exterior: 0.24, wall_interior: 0.12, roof: { type: "gable", pitch: 40, overhang: 0.4, ...roof } },
  floors: [
    { id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 10, 6) }] },
    {
      id: "dg",
      elevation: 2.75,
      height: 2.4,
      attic: true,
      knee: 1,
      rooms: [
        { id: "w", points: rect(0, 0, 6, 6) },
        { id: "s", points: rect(6, 0, 10, 6) },
      ],
      openings: [
        { id: "gf", type: "window", room_id: "w", edge: 3, offset: 3, width: 1, height: 1.4, sill: 0.9 }, // Giebel West
        { id: "gt", type: "door", room_id: "s", edge: 1, offset: 3, width: 1, height: 2.1, sill: 0 }, // Giebel Ost
        { id: "tf", type: "window", room_id: "w", edge: 0, offset: 3, width: 1, height: 1.2, sill: 0.5 }, // Traufe
        { id: "hi", type: "window", room_id: "w", edge: 0, offset: 1.5, width: 0.8, height: 0.5, sill: 1.6 }, // über dem Kniestock
        { id: "it", type: "door", room_id: "w", edge: 1, offset: 0.8, width: 1, height: 2.1, sill: 0 }, // Innenwand unter der Schräge
      ],
    },
  ],
});

// Öffnungen des Dachgeschosses wie in der Szene: Modelle der Etage, Giebel des Hausdachs
function attic(b) {
  const floor = b.floors.find((f) => f.id === "dg");
  const house = roofModel(b);
  const models = atticModels(b).get("dg");
  const faces = gableFaces(house);
  const { segments, openings } = computeWalls(floor, b.settings);
  const lim = atticOpenings(models, faces, segments, openings, { elev: 2.75, height: 2.4, knee: 1 });
  const byId = (id) => openings.find((p) => p.opening.id === id);
  return { floor, house, models, faces, segments, openings, lim, byId };
}

const noNegZero = (v) => v.every((x) => !Object.is(x, -0));

test("Giebelflächen: Satteldach zwei Giebel, Walmdach keine, Pultdach mit hoher Wand, Flügel ohne Giebel am offenen Ende", () => {
  const b = fixture();
  const m = roofModel(b);
  const faces = gableFaces(m);
  assert.deepEqual(faces.map((f) => f.key), ["0:lo", "0:hi"]);
  const [lo, hi] = faces;
  assert.deepEqual(lo.normal, [-1, 0]);
  assert.deepEqual(hi.normal, [1, 0]);
  near(lo.origin[0], -0.24);
  near(hi.origin[0], 10.24);
  for (const f of faces) {
    assert.ok(noNegZero(f.normal) && noNegZero(f.axis) && noNegZero(f.origin), `${f.key}: −0`);
    near(f.poly[0][1], m.top); // Unterkante am Kniestock (Dachansatz)
    near(f.poly[2][1], m.eave + 3.64 * tan40); // First
    assert.deepEqual(f.holes, []);
  }
  assert.deepEqual(gableFaces(roofModel(fixture({ type: "hip" }))), []);
  assert.deepEqual(gableFaces(roofModel(fixture({ type: "flat" }))), []);
  assert.deepEqual(gableFaces(null ?? {}), []);
  // Pultdach: Giebel an beiden Enden und die hohe Wand (Viereck, Normale +v)
  const s = roofModel(fixture({ type: "shed", pitch: 20 }));
  const sf = gableFaces(s);
  assert.deepEqual(sf.map((f) => f.key), ["0:lo", "0:hi", "0:high"]);
  const high = sf[2];
  assert.equal(high.poly.length, 4);
  assert.deepEqual(high.normal, s.parts[0].v.map((x) => x + 0));
  near(high.poly[2][1], s.eave + (s.parts[0].width / 2 - 0.4 + s.parts[0].width / 2) * s.tan);
  // L-Haus: der Flügel steckt mit einem Ende im Hauptdach (dort kein Giebel), mit Walm am Flügel gar keiner
  const l = { settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 35 } }, floors: [{ id: "eg", rooms: [{ id: "a", points: rect(0, 0, 10, 4) }, { id: "b", points: rect(0, 4, 4, 9) }] }] };
  assert.deepEqual(gableFaces(roofModel(l)).map((f) => f.key), ["0:lo", "0:hi", "1:hi"]);
  assert.deepEqual(gableFaces(roofModel({ ...l, settings: { ...l.settings, roof: { type: "gable", pitch: 35, wing_end: "hip" } } })).map((f) => f.key), ["0:lo", "0:hi"]);
});

test("Giebel zuordnen: Außenseite der Wand, in der Wand, weit davor, falsche Richtung, außerhalb", () => {
  const faces = gableFaces(roofModel(fixture()));
  const at = (x) => [[x, 2.5], [x, 3.5]];
  const hit = matchGable(faces, ...at(-0.24), [-1, 0]);
  assert.equal(hit.face.key, "0:lo");
  near(hit.depth, 0);
  near(hit.a0, -0.5);
  near(hit.a1, 0.5);
  assert.equal(hit.far, false);
  // Giebel 10 cm hinter der Außenseite (in der Wand): nur mit größerer Toleranz
  assert.equal(matchGable(faces, ...at(-0.34), [-1, 0]), null);
  near(matchGable(faces, ...at(-0.34), [-1, 0], { tolIn: 0.22 }).depth, -0.1);
  near(matchGable(faces, ...at(-0.14), [-1, 0]).depth, 0.1); // 10 cm davor
  // Giebel 1,5 m vor der Wand: Treffer, aber weit davor
  const far = matchGable(faces, ...at(1.26), [-1, 0]);
  near(far.depth, 1.5);
  assert.equal(far.far, true);
  assert.equal(matchGable(faces, ...at(-0.24), [0, 1]), null); // andere Richtung
  assert.equal(matchGable(faces, ...at(-0.24), [1, 0]).far, true); // Osten: Giebel 10,48 m davor
  assert.equal(matchGable(faces, [-0.24, 10], [-0.24, 11], [-1, 0]), null); // neben der Fläche
  assert.equal(matchGable(faces, [-0.24, 2.5], [-0.5, 3.5], [-1, 0]), null); // schräg zur Fläche
  assert.equal(matchGable([], ...at(-0.24), [-1, 0]), null);
});

test("Öffnungen im Dachgeschoss: Giebel bis Raumhöhe mit Loch, Traufe bis Kniestock, zu hoch ausgeblendet", () => {
  const { faces, lim, byId } = attic(fixture());
  // Höhen 2,4 (Giebel) / 1 / 1 (Traufe, Kniestock)
  near(lim.tops.get(byId("gf")), 2.4);
  near(lim.tops.get(byId("gt")), 2.4);
  near(lim.tops.get(byId("tf")), 1);
  near(lim.tops.get(byId("hi")), 1);
  assert.ok(lim.gable.has(byId("gf")) && lim.gable.has(byId("gt")));
  assert.ok(!lim.gable.has(byId("tf")) && !lim.gable.has(byId("it")));
  assert.ok(lim.hidden.has(byId("hi")) && !lim.hidden.has(byId("tf")));
  // Liste für wallPieces: ungekürzt dasselbe Objekt, gekürzt eine Kopie, ausgeblendet Höhe 0
  assert.ok(lim.openings.includes(byId("gf")) && lim.openings.includes(byId("gt")));
  const tf = lim.openings.find((p) => p.opening.id === "tf");
  assert.notEqual(tf, byId("tf"));
  near(tf.opening.height, 0.5);
  assert.equal(byId("tf").opening.height, 1.2); // Daten bleiben unverändert
  assert.equal(lim.openings.find((p) => p.opening.id === "hi").opening.height, 0);
  // Löcher: Kniestock bis Oberkante der Öffnung, Tiefe = Wandstärke
  const [lo, hi] = faces;
  assert.equal(lo.holes.length, 1);
  assert.equal(hi.holes.length, 1);
  assert.equal(lo.holes[0].id, "gf");
  near(lo.holes[0].a0, -0.5);
  near(lo.holes[0].a1, 0.5);
  near(lo.holes[0].y0, 3.75);
  near(lo.holes[0].y1, 2.75 + 0.9 + 1.4);
  near(lo.holes[0].depth, 0.24);
  near(hi.holes[0].y1, 2.75 + 2.1);
  // Fenster ganz unter dem Kniestock im Giebel: kein Loch
  const b = fixture();
  b.floors[1].openings = [{ id: "low", type: "window", room_id: "w", edge: 3, offset: 3, width: 1, height: 0.6, sill: 0.3 }];
  const low = attic(b);
  assert.equal(low.faces[0].holes.length, 0);
  assert.ok(low.lim.gable.has(low.byId("low")));
});

test("Rollladen an der Traufe: Oberkante 1 cm unter der Dachfläche vor der Wand (tiefer als der Kniestock), im Giebel ohne Grenze", () => {
  const { house, lim, byId } = attic(fixture());
  // Außenseite des Behangs 4,25 cm vor der Außenfläche (z = −0,24): dort ist die Traufe schon ~3,6 cm tiefer
  const roof = roofSurfaceAt(house, [3, -0.24 - 0.0425]).y - 2.75;
  near(lim.blinds.get(byId("tf")), roof - 0.01);
  assert.ok(lim.blinds.get(byId("tf")) < 1 - 0.04 && lim.blinds.get(byId("tf")) > 0.9, `${lim.blinds.get(byId("tf"))}`);
  assert.ok(!lim.blinds.has(byId("gf")) && !lim.blinds.has(byId("gt")) && !lim.blinds.has(byId("it")));
  // ohne Überstand ist vor der Wand kein Dach: keine Grenze
  const bare = attic(fixture({ overhang: 0 }));
  assert.ok(!bare.lim.blinds.has(bare.byId("tf")));
});

test("Innenwand unter der Schräge ≈ 1,381, sonst Raumhöhe; freie Wand unter dem höchsten Dach", () => {
  const b = fixture();
  b.floors[1].walls = [{ id: "fw", a: [3, 0.3], b: [3, 1.3] }];
  b.floors[1].openings.push({ id: "fd", type: "door", wall: "fw", offset: 0.5, width: 0.8, height: 2.1, sill: 0 });
  const { lim, byId, models, segments } = attic(b);
  near(lim.tops.get(byId("it")), 2.75 + 1 - 0.4 * tan40 + (3.64 - 2.75) * tan40 - 2.75 - 0.03); // Stufe bei 0,25 m vor der Traufwand
  near(lim.tops.get(byId("it")), 1.381, 1e-3);
  const inner = segments.find((s) => s.kind === "interior");
  const steps = atticTop(models, inner, 2.75, 2.4, 1);
  near(steps.at(0)[0], 0);
  near(steps.at(-1)[1], inner.length);
  assert.ok(steps.every(([, , t]) => t >= 1 && t <= 2.4));
  near(Math.max(...steps.map((x) => x[2])), 2.4); // in der Mitte volle Raumhöhe
  // freie Wand: gleiche Schräge (höchstes Dach über der Stelle)
  near(lim.tops.get(byId("fd")), 2.75 + 1 - 0.4 * tan40 + (3.64 - 2.7) * tan40 - 2.75 - 0.03);
  // Wand mit eigener Höhe: unverändert
  b.floors[1].walls[0].height = 2;
  assert.equal(attic(b).lim.tops.has(attic(b).byId("fd")), false);
});

test("NaN-sicher: unvollständige Öffnungen bleiben, wie sie sind; leere Modelle und kaputte Löcher", () => {
  const b = fixture();
  b.floors[1].openings = [
    { id: "x1", type: "window", room_id: "w", edge: 3, offset: 3, width: 1, height: Number.NaN, sill: 0.9 },
    { id: "x2", type: "window", room_id: "w", edge: 3, offset: 1, width: 0.8, height: 1, sill: "kaputt" },
  ];
  const { lim, byId, faces } = attic(b);
  assert.ok(lim.openings.includes(byId("x1")) && !lim.tops.has(byId("x1")));
  assert.ok(Number.isFinite(lim.tops.get(byId("x2"))));
  for (const f of faces) for (const h of f.holes) assert.ok([h.a0, h.a1, h.y0, h.y1, h.depth].every(Number.isFinite));
  const floor = b.floors[1];
  const { segments } = computeWalls(floor, b.settings);
  for (const seg of segments) for (const step of atticTop([], seg, 2.75, 2.4, 1)) assert.ok(step.every(Number.isFinite));
  assert.deepEqual(atticOpenings([], [], [], [{ opening: { id: "z" }, segment: "nix" }], {}).openings.length, 1);
  const face = gableFaces(roofModel(fixture()))[0];
  assert.equal(gableCut(face, [{ a0: Number.NaN, a1: 1, y0: 4, y1: 5, depth: 0.2 }]).outer, face.poly);
});

test("Pultdach: Loch in der hohen Wand, Fenster dort unter dem Dach, an der Traufe bis Kniestock", () => {
  const b = fixture({ type: "shed", pitch: 20 });
  const s = roofModel(b);
  const highSide = s.parts[0].v[1] > 0 ? 6 : 0; // hohe Seite (+v)
  b.floors[1].openings = [
    { id: "h", type: "window", room_id: "w", edge: highSide === 6 ? 2 : 0, offset: 3, width: 1, height: 1.8, sill: 0.5 },
    { id: "l", type: "window", room_id: "w", edge: highSide === 6 ? 0 : 2, offset: 3, width: 1, height: 1.2, sill: 0.5 },
  ];
  const { lim, byId, faces } = attic(b);
  const high = faces.find((f) => f.key === "0:high");
  near(lim.tops.get(byId("h")), 2.4);
  assert.ok(lim.gable.has(byId("h")));
  assert.equal(high.holes.length, 1);
  near(high.holes[0].y0, 3.75);
  near(high.holes[0].y1, 2.75 + 2.3);
  near(lim.tops.get(byId("l")), 1);
  assert.ok(!lim.gable.has(byId("l")));
});

test("Giebel weit vor der Wand oder im Raum: kein Loch, Öffnung endet am Kniestock; knapp davor mit tieferer Laibung", () => {
  const run = (adjust) => attic(fixture({ adjust: [adjust] }));
  const plus = run({ lo: 0.3 });
  near(plus.faces[0].holes[0].depth, 0.54);
  near(plus.lim.tops.get(plus.byId("gf")), 2.4);
  for (const adj of [{ lo: 1.5 }, { lo: -0.6 }]) {
    const r = run(adj);
    assert.equal(r.faces[0].holes.length, 0, JSON.stringify(adj));
    near(r.lim.tops.get(r.byId("gf")), 1);
    assert.ok(!r.lim.gable.has(r.byId("gf")));
    assert.equal(r.faces[1].holes.length, 1); // Osten unverändert
  }
});

test("atticTop: Hausdach → Außenwand Kniestock wie bisher; ohne Dach und unter Flach-Einheit Raumhöhe; Stufen zusammengefasst", () => {
  const b = fixture();
  const house = roofModel(b);
  const { segments } = computeWalls(b.floors[1], b.settings);
  for (const seg of segments.filter((s) => s.kind === "exterior")) {
    assert.deepEqual(atticTop([house], seg, 2.75, 2.4, 1), [[0, seg.length, 1]]);
    assert.deepEqual(atticTop([], seg, 2.75, 2.4, 1), [[0, seg.length, 2.4]]); // ohne Dach: eine Stufe in Raumhöhe
  }
  // Anbau mit Flachdach auf dem Dachgeschoss: dessen Außenwände bis zur Raumhöhe
  const f = structuredClone(b);
  f.floors[1].rooms.push({ id: "anbau", points: rect(10, 0, 13, 4), roof: { type: "flat" } });
  const models = atticModels(f).get("dg");
  const walls = computeWalls(f.floors[1], f.settings).segments.filter((s) => s.kind === "exterior" && (s.roomLeft ?? s.roomRight) === "anbau");
  assert.ok(walls.length >= 3);
  for (const seg of walls) assert.deepEqual(atticTop(models, seg, 2.75, 2.4, 1), [[0, seg.length, 2.4]]);
  // Raum ohne eigenes Dach neben dem Haus: unter dem Überstand des Hausdachs Kniestock, dahinter Raumhöhe
  const x = structuredClone(b);
  x.settings.roof.rooms = ["w", "s"];
  x.floors[1].rooms.push({ id: "x", points: rect(10, 0, 12, 3) });
  const xm = atticModels(x).get("dg");
  const south = computeWalls(x.floors[1], x.settings).segments.find((s) => s.kind === "exterior" && (s.roomLeft ?? s.roomRight) === "x" && Math.abs(s.a[1]) < 1e-9 && Math.abs(s.b[1]) < 1e-9);
  const steps = atticTop(xm, south, 2.75, 2.4, 1);
  assert.equal(steps.length, 2);
  assert.deepEqual(steps.map((t) => t[2]).sort(), [1, 2.4]);
  near(Math.min(...steps.filter((t) => t[2] === 1).map((t) => t[1] - t[0])), 0.75);
});

test("eigener Raum zuerst (R2): Erker außerhalb der Dachrahmen, Hausraum neben einer Flach-Einheit, Wand des Flach-Raums", () => {
  const b = {
    settings: { wall_exterior: 0.24, roof: { type: "gable", pitch: 40 } },
    floors: [
      { id: "eg", elevation: 0, height: 2.5, rooms: [{ id: "a", points: rect(0, 0, 10, 8) }] },
      {
        id: "dg",
        elevation: 2.75,
        height: 2.4,
        attic: true,
        knee: 1,
        rooms: [
          { id: "haus", points: rect(0, 0, 10, 8) },
          { id: "erker", points: rect(4, 8, 6, 9.5) },
          { id: "anbau", points: rect(10.3, 0, 14, 4), roof: { type: "flat" } },
        ],
      },
    ],
  };
  const house = roofModel(b);
  assert.equal(house.parts.length, 1);
  assert.ok(house.rooms.some((r) => r.id === "erker"));
  const models = atticModels(b).get("dg");
  const segs = computeWalls(b.floors[1], b.settings).segments.filter((s) => s.kind === "exterior");
  const of = (id) => segs.filter((s) => (s.roomLeft ?? s.roomRight) === id);
  for (const seg of of("erker")) assert.deepEqual(atticTop(models, seg, 2.75, 2.4, 1), [[0, seg.length, 1]]);
  // Ostwand des Hauses liegt unter der Platte des Anbaus (0,3 m daneben): bleibt Kniestock
  const east = of("haus").find((s) => Math.abs(s.a[0] - 10) < 1e-9 && Math.abs(s.b[0] - 10) < 1e-9);
  assert.ok(east);
  assert.deepEqual(atticTop(models, east, 2.75, 2.4, 1), [[0, east.length, 1]]);
  for (const seg of of("anbau")) assert.deepEqual(atticTop(models, seg, 2.75, 2.4, 1), [[0, seg.length, 2.4]]);
  near(exteriorTopAt(models, [5, 9], 2.75, 2.4, ["erker"]), 1);
  near(exteriorTopAt(models, [10, 1], 2.75, 2.4, ["anbau"]), 2.4);
});

test("zwei Dachgeschosse: Fenster im unteren erzeugen keine Löcher in den Giebeln des oberen", () => {
  const b = fixture();
  // unteres Dachgeschoss mit eigenem Satteldach am Raum, Hausdach auf dem oberen
  b.floors[0] = { ...b.floors[0], attic: true, knee: 1, rooms: [{ id: "a", points: rect(0, 0, 10, 6), roof: { type: "gable", pitch: 40, overhang: 0.4 } }], openings: [{ id: "u", type: "window", room_id: "a", edge: 3, offset: 3, width: 1, height: 1.6, sill: 0.4 }] };
  const house = roofModel(b);
  assert.equal(house.floor.id, "dg");
  const map = atticModels(b);
  assert.deepEqual([...map.keys()].sort(), ["dg", "eg"]);
  assert.ok(!map.get("eg").some((m) => m.key === "house"));
  const faces = gableFaces(house);
  const { segments, openings } = computeWalls(b.floors[0], b.settings);
  // die Szene gibt Giebel nur auf der Etage des Hausdachs mit (atticGables wie in scene.js)
  assert.deepEqual(atticGables(house, faces, "eg"), []);
  assert.equal(atticGables(house, faces, "dg"), faces);
  assert.deepEqual(atticGables(null, faces, "dg"), []);
  const lim = atticOpenings(map.get("eg"), atticGables(house, faces, "eg"), segments, openings, { elev: 0, height: 2.5, knee: 1 });
  assert.ok(faces.every((f) => f.holes.length === 0));
  assert.ok(Number.isFinite(lim.tops.get(openings[0])));
  // Gegenprobe: ohne die Etagenprüfung bekäme ein Giebel des oberen Geschosses ein Loch (die Prüfung oben kann scheitern)
  const leak = gableFaces(house);
  atticOpenings(map.get("eg"), leak, segments, openings, { elev: 0, height: 2.5, knee: 1 });
  assert.ok(leak.some((f) => f.holes.length > 0));
});

test("gableCut: Kerbe am Kniestock, Loch in der Fläche, oben zugeschnitten, gestapelt zusammengefasst", () => {
  const face = { key: "0:lo", origin: [0, 0], axis: [0, 1], normal: [-1, 0], poly: [[-3, 1], [3, 1], [0, 4]], holes: [] };
  const topAt = (a) => 4 - Math.abs(a);
  assert.equal(gableCut(face, []).outer, face.poly);
  // Kerbe: Unterkante bleibt offen (keine Laibung unten)
  const notch = gableCut(face, [{ a0: -0.5, a1: 0.5, y0: 1, y1: 2, depth: 0.24 }]);
  assert.deepEqual(notch.outer, [[-3, 1], [-0.5, 1], [-0.5, 2], [0.5, 2], [0.5, 1], [3, 1], [0, 4]]);
  assert.deepEqual(notch.holes, []);
  assert.equal(notch.reveals.length, 3);
  assert.ok(notch.reveals.every((r) => r.depth === 0.24 && !(r.y0 === 1 && r.y1 === 1)));
  // Loch in der Fläche: Laibungen ringsum
  const hole = gableCut(face, [{ a0: -0.5, a1: 0.5, y0: 2, y1: 2.5, depth: 0.3 }]);
  assert.notEqual(hole.outer, face.poly);
  assert.deepEqual(hole.outer, face.poly);
  assert.equal(hole.holes.length, 1);
  assert.equal(hole.reveals.length, 4);
  // oben zugeschnitten: 2 cm unter der Dachkante
  const cut = gableCut(face, [{ a0: -0.5, a1: 0.5, y0: 1, y1: 3.9, depth: 0.2 }]);
  const pts = cut.outer.slice(1, -2);
  assert.ok(pts.every(([a, y]) => y <= topAt(a) - 0.02 + 1e-9), JSON.stringify(pts));
  near(Math.max(...pts.map((p) => p[1])), 3.9);
  // gestapelt (Fenster über Tür, 1 cm Abstand): eine Kerbe
  const st = gableCut(face, [{ a0: -0.5, a1: 0.5, y0: 1, y1: 2, depth: 0.24 }, { a0: -0.4, a1: 0.4, y0: 2.01, y1: 2.6, depth: 0.3 }]);
  assert.equal(st.outer.length, 7);
  near(Math.max(...st.outer.slice(1, 5).map((p) => p[1])), 2.6);
  assert.ok(st.reveals.every((r) => r.depth === 0.3));
  // zwei Kerben nebeneinander in Reihenfolge, zu kleine fallen weg
  const two = gableCut(face, [{ a0: 1, a1: 2, y0: 1, y1: 1.5, depth: 0.2 }, { a0: -2, a1: -1.5, y0: 1, y1: 1.5, depth: 0.2 }, { a0: 0, a1: 0.03, y0: 2, y1: 3, depth: 0.2 }]);
  assert.equal(two.outer.length, 11);
  const xs = two.outer.slice(1, 9).map((p) => p[0]);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.equal(gableCut(face, [{ a0: 0, a1: 0.03, y0: 2, y1: 3, depth: 0.2 }]).outer, face.poly);
  // ganz über der Fläche: weg
  assert.equal(gableCut(face, [{ a0: 2.5, a1: 2.9, y0: 3, y1: 3.5, depth: 0.2 }]).outer, face.poly);
});

test("gableTriangles: ohne Löcher wie bisher, mit Triangulierer Löcher und Laibungen, unvollständig ohne Löcher", () => {
  const face = { key: "0:hi", origin: [10, 3], axis: [0, 1], normal: [1, 0], poly: [[-3, 1], [3, 1], [0, 4]], holes: [] };
  const plain = [];
  gableTriangles(plain, face, gableCut(face, []), tri2d);
  assert.deepEqual(plain, [10, 1, 0, 10, 1, 6, 10, 4, 3]);
  const holes = [{ a0: -0.5, a1: 0.5, y0: 1, y1: 2, depth: 0.24 }, { a0: -0.5, a1: 0.5, y0: 2.5, y1: 3, depth: 0.24 }];
  const cut = gableCut(face, holes);
  const list = [];
  gableTriangles(list, face, cut, tri2d);
  assert.ok(list.every(Number.isFinite));
  const tris = [];
  for (let i = 0; i < list.length; i += 9) tris.push([0, 3, 6].map((k) => list.slice(i + k, i + k + 3)));
  // Giebel in der Ebene x = 10 (Fläche = Dreieck − Kerbe − Loch), Laibungen bis x = 10 − 0,24
  const flat = tris.filter((t) => t.every((p) => Math.abs(p[0] - 10) < 1e-9));
  const area = flat.reduce((s, [p, q, r]) => s + Math.abs((q[2] - p[2]) * (r[1] - p[1]) - (r[2] - p[2]) * (q[1] - p[1])) / 2, 0);
  near(area, 9 - 1 - 0.5);
  assert.equal(tris.length - flat.length, 2 * (3 + 4));
  assert.ok(tris.some((t) => t.some((p) => Math.abs(p[0] - 9.76) < 1e-9)));
  // gleiche Drehrichtung wie der Giebel ohne Löcher
  const nx = (t) => (t[1][1] - t[0][1]) * (t[2][2] - t[0][2]) - (t[1][2] - t[0][2]) * (t[2][1] - t[0][1]);
  const want = Math.sign(nx([plain.slice(0, 3), plain.slice(3, 6), plain.slice(6, 9)]));
  assert.ok(flat.every((t) => Math.sign(nx(t)) === want));
  // unvollständige Zerlegung: Giebel ohne Löcher (nie ganz weg)
  for (const stub of [() => [], () => null, () => [[0, 1, 2]]]) {
    const l = [];
    gableTriangles(l, face, cut, stub);
    assert.deepEqual(l, plain);
  }
});

test("atticOpeningLimit: Giebel, Traufe, ausgeblendet, Innenwand; außerhalb des Dachgeschosses null", () => {
  const b = fixture();
  const dg = b.floors[1];
  assert.deepEqual(atticOpeningLimit(b, dg, "gf"), { top: 2.4, knee: 1, height: 2.4, gable: true, hidden: false, exterior: true });
  const tf = atticOpeningLimit(b, dg, "tf");
  near(tf.top, 1);
  assert.equal(tf.gable, false);
  assert.equal(tf.exterior, true);
  assert.equal(atticOpeningLimit(b, dg, "hi").hidden, true);
  const it = atticOpeningLimit(b, dg, "it");
  assert.equal(it.exterior, false);
  near(it.top, 1.381, 1e-3);
  assert.equal(atticOpeningLimit(b, dg, "nix"), null);
  assert.equal(atticOpeningLimit(b, b.floors[0], "gf"), null);
  assert.equal(atticOpeningLimit({ ...b, settings: { ...b.settings, roof: { type: "none" } } }, dg, "gf"), null); // ohne Dach
  // eigenes Flachdach am Raum: Außenwand bis Raumhöhe, kein Giebel
  const f = structuredClone(b);
  f.settings.roof = { type: "none" };
  for (const r of f.floors[1].rooms) r.roof = { type: "flat" };
  const flat = atticOpeningLimit(f, f.floors[1], "tf");
  near(flat.top, 2.4);
  assert.equal(flat.gable, false);
  // Daten bleiben unverändert
  assert.deepEqual(b, fixture());
});

test("gable.js kommt ohne Three.js aus", () => {
  const src = readFileSync(new URL("../../custom_components/haus3d/frontend/gable.js", import.meta.url), "utf8");
  assert.ok(!/three|vendor/i.test(src.split("\n").filter((l) => l.startsWith("import")).join("\n")));
});

test("Editor-Hinweis an Fenstern und Türen im Dachgeschoss (Außenwand, ausgeblendet, Innenwand, Raumhöhe)", async () => {
  const { AtticMethods } = await import("../../custom_components/haus3d/frontend/editor-attic.js");
  const b = fixture();
  const hint = (bb, id) => {
    const floor = bb.floors.find((f) => f.id === "dg");
    return AtticMethods._atticOpeningHint.call({ b: bb, floor }, floor.openings.find((o) => o.id === id));
  };
  assert.equal(hint(b, "gf"), ""); // passt unter den Giebel
  assert.equal(hint(b, "gt"), "");
  assert.match(hint(b, "tf"), /Außenwand unter der Dachschräge: Sie endet am Kniestock, in 3D nur bis 1,00 m hoch\. Höhere Fenster und Türen passen nur in eine Giebelwand des Hausdachs\./);
  assert.match(hint(b, "hi"), /Liegt über der Dachschräge \(Kniestock 1,00 m\) und wird in 3D nicht gezeigt/);
  assert.match(hint(b, "it"), /Unter der Dachschräge: in 3D nur bis 1,38 m hoch\./);
  // eigenes Flachdach: Außenwand bis zur Raumhöhe, höhere Öffnungen nur bis dorthin
  const f = structuredClone(b);
  f.settings.roof = { type: "none" };
  for (const r of f.floors[1].rooms) r.roof = { type: "flat" };
  f.floors[1].openings.find((o) => o.id === "tf").height = 2;
  assert.match(hint(f, "tf"), /^<p class="muted">In 3D nur bis zur Raumhöhe \(2,40 m\)\.<\/p>$/);
  // ohne Dachgeschoss bzw. ohne Dach kein Hinweis
  assert.equal(AtticMethods._atticOpeningHint.call({ b, floor: b.floors[0] }, { id: "gf", sill: 2, height: 2 }), "");
});

test("atticTop: Innenwand-Enden im Anschluss an die Außenwand bleiben unter der Dachfläche", async () => {
  const { roofSurfaceAt } = await import("../../custom_components/haus3d/frontend/exterior.js");
  const b = fixture();
  const { house, models, segments } = attic(b);
  const inner = segments.find((s) => s.kind === "interior");
  assert.ok(inner.extendA > 0 && inner.extendB > 0); // reicht in die Außenwände hinein
  const steps = atticTop(models, inner, 2.75, 2.4, 1);
  const at = (s) => [inner.a[0] + inner.u[0] * s, inner.a[1] + inner.u[1] * s];
  // Wandende in der Außenwand (Traufe): Oberkante unter der Dachfläche dort
  for (const [s, top] of [[-inner.extendA, steps[0][2]], [inner.length + inner.extendB, steps.at(-1)[2]]]) {
    assert.ok(2.75 + top <= roofSurfaceAt(house, at(s)).y - 0.03 + 1e-9, `Ende bei ${s}: ${top}`);
  }
});
