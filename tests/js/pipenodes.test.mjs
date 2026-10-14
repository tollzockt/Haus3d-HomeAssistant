import { test } from "node:test";
import assert from "node:assert/strict";
import {
  END_TOL, NODE_BODY, WALL_GAP, nodeBaseY, nodeMaxY, nodePose, nodeRotation, nodeSpan, normDeg, pipeEndDrops, pipeHeightAt, pipeHeightNear, turnable, wallSpot,
} from "../../custom_components/haus3d/frontend/pipenodes.js";

// Innenflächen eines Raums 4 × 3 m (wie edit-ops.wallFaces: n zeigt in den Raum)
const FACES = [
  { p: [0, 0], u: [1, 0], n: [0, 1], t0: 0, t1: 4 },
  { p: [4, 0], u: [0, 1], n: [-1, 0], t0: 0, t1: 3 },
  { p: [4, 3], u: [-1, 0], n: [0, -1], t0: 0, t1: 4 },
  { p: [0, 3], u: [0, -1], n: [1, 0], t0: 0, t1: 3 },
];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("normDeg: 0…360, gerundet, nicht endlich → 0", () => {
  assert.equal(normDeg(450), 90);
  assert.equal(normDeg(-90), 270);
  assert.equal(normDeg(360), 0);
  assert.equal(normDeg(-0), 0);
  assert.equal(normDeg(12.34567), 12.346);
  assert.equal(normDeg(359.9999), 0);
  assert.equal(normDeg(NaN), 0);
  assert.equal(normDeg("quer"), 0);
  assert.equal(normDeg(undefined), 0);
});

test("turnable: nur eckige Gehäuse mit Modell", () => {
  for (const k of ["hv", "uv", "einspeisung", "router", "switch"]) assert.equal(turnable({ kind: k }), true, k);
  for (const k of ["abzweig", "durch", "wasser_in", "warm_in", "kraftwerk"]) assert.equal(turnable({ kind: k }), false, k);
  assert.equal(turnable({ kind: "hv", model: false }), false);
  assert.equal(turnable(null), false);
});

test("wallSpot: vier Seiten, Abstand WALL_GAP, Vorderseite zum Raum", () => {
  const cases = [
    [[2, 0.1], [2, WALL_GAP], 0],
    [[3.9, 1.5], [4 - WALL_GAP, 1.5], 90],
    [[2, 2.8], [2, 3 - WALL_GAP], 180],
    [[0.2, 1.5], [WALL_GAP, 1.5], 270],
  ];
  for (const [p, xz, rot] of cases) {
    const s = wallSpot(FACES, p);
    assert.ok(s, JSON.stringify(p));
    assert.ok(near(s.x, xz[0]) && near(s.z, xz[1]), `${JSON.stringify(p)} → ${s.x}, ${s.z}`);
    assert.equal(s.rotation, rot);
  }
  // Ecke: mit halber Gehäusebreite (HV 0,6 m) bleibt der Verteiler aus der Querwand heraus
  const c = wallSpot(FACES, [0.1, 0.1], { half: NODE_BODY.hv.w / 2 });
  assert.deepEqual([c.x, c.z], [0.36, 0.06]);
  assert.equal(c.rotation, 0);
  // ohne half bleibt die Lage entlang der Wand
  assert.deepEqual([wallSpot(FACES, [0.1, 0.1]).x, wallSpot(FACES, [0.1, 0.1]).z], [0.1, 0.06]);
  // Fläche zu kurz für das Gehäuse: Mitte
  const short = [{ p: [0, 0], u: [1, 0], n: [0, 1], t0: 0, t1: 0.5 }];
  assert.equal(wallSpot(short, [0.1, 0.1], { half: 0.3 }).x, 0.25);
  // Fangweite
  assert.equal(wallSpot(FACES, [2, 1.4]), null);
  assert.equal(wallSpot(FACES, [2, 0.4]), null);
  assert.ok(wallSpot(FACES, [2, 0.4], { tol: 0.5 }));
  // hinter der Wand (mehr als 5 cm) bzw. neben der Fläche: nichts
  assert.equal(wallSpot([FACES[0]], [2, -0.1]), null);
  assert.equal(wallSpot([FACES[0]], [4.2, 0.1]), null);
  assert.equal(wallSpot([], [0, 0]), null);
  assert.equal(wallSpot(undefined, [0, 0]), null);
});

test("nodePose: gespeicherte Drehung, Wand, runde Körper, Versatz an der Wand", () => {
  const back = (k) => Math.round((NODE_BODY[k].d / 2 - WALL_GAP) * 1000) / 1000;
  // ältere Stände ohne Drehung: zur Wand
  assert.deepEqual(nodePose({ kind: "hv", x: 2, z: 0.06 }, FACES), { rot: 0, back: back("hv") });
  assert.deepEqual(nodePose({ kind: "uv", x: 3.94, z: 1.5 }, FACES), { rot: 90, back: back("uv") });
  // eckig: gespeicherte Drehung gewinnt; Versatz nur, wenn sie zur Wand passt (< 10°)
  assert.deepEqual(nodePose({ kind: "hv", x: 2, z: 0.06, rotation: 180 }, FACES), { rot: 180, back: 0 });
  assert.deepEqual(nodePose({ kind: "hv", x: 2, z: 0.06, rotation: 365 }, FACES), { rot: 5, back: back("hv") });
  assert.deepEqual(nodePose({ kind: "router", x: 2, z: 1.5, rotation: 30 }, FACES), { rot: 30, back: 0 });
  assert.deepEqual(nodePose({ kind: "hv", x: 2, z: 1.5 }, FACES), { rot: 0, back: 0 });
  // rund: folgt immer der Wand
  assert.deepEqual(nodePose({ kind: "wasser_in", x: 3.94, z: 1.5, rotation: 45 }, FACES), { rot: 90, back: back("wasser_in") });
  assert.deepEqual(nodePose({ kind: "warm_in", x: 2, z: 2.94 }, FACES), { rot: 180, back: back("warm_in") });
  assert.deepEqual(nodePose({ kind: "warm_in", x: 2, z: 1.5, rotation: 30 }, FACES), { rot: 30, back: 0 });
  // Abzweigdose, Durchführung, unbekannte Art: nur gespeicherte Drehung
  assert.deepEqual(nodePose({ kind: "abzweig", x: 2, z: 0.06, rotation: 450 }, FACES), { rot: 90, back: 0 });
  assert.deepEqual(nodePose({ kind: "durch", x: 2, z: 0.06 }, FACES), { rot: 0, back: 0 });
  assert.deepEqual(nodePose({ kind: "kraftwerk", x: 2, z: 0.06, rotation: 10 }, FACES), { rot: 10, back: 0 });
  // ohne Wände, Text statt Zahl
  assert.deepEqual(nodePose({ kind: "hv", x: 2, z: 0.06 }), { rot: 0, back: 0 });
  assert.deepEqual(nodePose({ kind: "hv", x: 2, z: 0.06, rotation: "90" }, []), { rot: 0, back: 0 });
  assert.equal(nodeRotation({ kind: "uv", x: 3.94, z: 1.5 }, FACES), 90);
});

test("pipeHeightAt: Stufe wie gezeichnet (0,3 statt 1,375), Enden", () => {
  const pipe = { points: [[0, 0], [2, 0]], heights: [2.45, 0.3] };
  const mid = pipeHeightAt(pipe, [1, 0.1]);
  assert.ok(near(mid.d, 0.1));
  assert.equal(mid.h, 0.3);
  assert.equal(mid.atEnd, false);
  assert.deepEqual(pipeHeightAt(pipe, [0, 0]), { d: 0, h: 2.45, atEnd: true });
  assert.deepEqual(pipeHeightAt(pipe, [2, 0]), { d: 0, h: 0.3, atEnd: true });
  assert.deepEqual(pipeHeightAt(pipe, [-0.5, 0]), { d: 0.5, h: 2.45, atEnd: true });
  // Zwischenpunkt: Höhe dort angekommen, kein Ende
  const three = { points: [[0, 0], [1, 0], [1, 1]], heights: [0.03, 0.3, 1.1] };
  assert.deepEqual(pipeHeightAt(three, [1, 0]), { d: 0, h: 0.3, atEnd: false });
  assert.equal(pipeHeightAt(three, [1, 0.5]).h, 1.1);
  // ohne heights: feste Höhe bzw. 0,03
  assert.equal(pipeHeightAt({ points: [[0, 0], [1, 0]], height: 0.15 }, [0.5, 0]).h, 0.15);
  assert.equal(pipeHeightAt({ points: [[0, 0], [1, 0]] }, [0.5, 0]).h, 0.03);
  assert.equal(pipeHeightAt({ points: [] }, [0, 0]), null);
  assert.deepEqual(pipeHeightAt({ points: [[1, 0]], heights: [0.5] }, [0, 0]), { d: 1, h: 0.5, atEnd: true });
});

test("pipeHeightNear: nächste Stromleitung bis 0,3 m, sonst 0,3", () => {
  const floor = { pipes: [
    { id: "w", type: "wasser_kalt", points: [[0, 0], [4, 0]], heights: [0.03, 0.03] },
    { id: "s", type: "strom", points: [[0, 1], [4, 1]], heights: [2.45, 2.45] },
    { id: "s2", type: "strom", points: [[0, 1.4], [4, 1.4]], heights: [1.1, 1.1] },
  ] };
  assert.equal(pipeHeightNear(floor, 2, 1.1), 2.45);
  assert.equal(pipeHeightNear(floor, 2, 1.3), 1.1);
  assert.equal(pipeHeightNear(floor, 2, 0.05), 0.3); // nur Wasser in der Nähe
  assert.equal(pipeHeightNear(floor, 2, 3), 0.3);
  assert.equal(pipeHeightNear({}, 0, 0), 0.3);
  assert.equal(pipeHeightNear(undefined, 0, 0), 0.3);
});

test("nodeBaseY: Standard je Art, eigene Höhe gewinnt, Abzweigdose folgt der Leitung", () => {
  const floor = { height: 2.5, pipes: [] };
  for (const [k, B] of Object.entries(NODE_BODY)) {
    if (k === "abzweig") continue;
    assert.equal(nodeBaseY({ kind: k, x: 0, z: 0 }, floor), k === "durch" ? 0 : B.y, k);
  }
  assert.equal(nodeBaseY({ kind: "hv", x: 0, z: 0, y: 1.5 }, floor), 1.5);
  assert.equal(nodeBaseY({ kind: "hv", x: 0, z: 0, y: "1.5" }, floor), 0.9);
  assert.equal(nodeBaseY({ kind: "hv", x: 0, z: 0, y: null }, floor), 0.9);
  assert.equal(nodeBaseY({ kind: "durch", x: 0, z: 0, y: 1.5 }, floor), 0);
  assert.equal(nodeBaseY({ kind: "kraftwerk", x: 0, z: 0 }, floor), 0);
  // Abzweigdose: 3 cm unter der Leitung, ohne Leitung auf 0,27
  assert.ok(near(nodeBaseY({ kind: "abzweig", x: 0, z: 0 }, floor), 0.27));
  const wired = { pipes: [{ type: "strom", points: [[-1, 0], [1, 0]], heights: [2.45, 2.45] }] };
  assert.ok(near(nodeBaseY({ kind: "abzweig", x: 0, z: 0 }, wired), 2.42));
  assert.equal(nodeBaseY({ kind: "abzweig", x: 0, z: 0, y: 0.5 }, wired), 0.5);
  assert.equal(nodeBaseY({ kind: "abzweig", x: 0, z: 0 }, { pipes: [{ type: "strom", points: [[-1, 0], [1, 0]], heights: [0.01, 0.01] }] }), 0);
});

test("nodeSpan: Gehäuse von unten bis oben, Durchführung über die Etage", () => {
  const floor = { height: 2.6, pipes: [{ type: "strom", points: [[-1, 0], [1, 0]], heights: [2.45, 2.45] }] };
  assert.deepEqual(nodeSpan({ kind: "hv", x: 5, z: 5 }, floor), [0.9, 1.8]);
  assert.deepEqual(nodeSpan({ kind: "router", x: 5, z: 5, y: 2 }, floor), [2, 2.05]);
  assert.deepEqual(nodeSpan({ kind: "abzweig", x: 0, z: 0 }, floor), [2.42, 2.48]);
  assert.deepEqual(nodeSpan({ kind: "durch", x: 0, z: 0 }, floor), [0, 2.6]);
  assert.deepEqual(nodeSpan({ kind: "durch", x: 0, z: 0 }, {}), [0, 2.5]);
  assert.equal(nodeSpan({ kind: "hv", x: 0, z: 0, model: false }, floor), null);
  assert.equal(nodeSpan({ kind: "kraftwerk", x: 0, z: 0 }, floor), null);
});

test("nodeMaxY: Raumhöhe minus Gehäuse – das Gehäuse sitzt nie über der Decke", () => {
  const floor = { height: 2.6 };
  assert.equal(nodeMaxY({ kind: "hv" }, floor), 1.7);
  assert.equal(nodeMaxY({ kind: "router" }, floor), 2.55);
  assert.equal(nodeMaxY({ kind: "warm_in" }, floor), 1.1);
  assert.equal(nodeMaxY({ kind: "durch" }, floor), 2.6);
  assert.equal(nodeMaxY({ kind: "kraftwerk" }, floor), 2.4); // unbekannt: 0,2 m wie im Anker
  assert.equal(nodeMaxY({ kind: "hv" }, {}), 1.6);
  assert.equal(nodeMaxY({ kind: "hv" }, { height: 0.5 }), 0);
  assert.equal(nodeMaxY({ kind: "hv" }, { height: 40 }), 19.1);
  for (const k of Object.keys(NODE_BODY)) {
    if (k === "durch") continue;
    const y = nodeMaxY({ kind: k }, floor);
    assert.ok(near(nodeSpan({ kind: k, x: 0, z: 0, y }, floor)[1], 2.6, 1e-9), k);
  }
});

test("pipeEndDrops: Enden an Verteilern gleichen Mediums", () => {
  const strom = { id: "s", type: "strom", points: [[1, 0], [1, 3]], heights: [2.45, 2.45] };
  const floor = { height: 2.6, nodes: [{ id: "hv", kind: "hv", x: 1, z: 0 }], pipes: [strom] };
  assert.deepEqual(pipeEndDrops(strom, floor), { head: 1.8, tail: null });
  // umgedreht: das Ende hängt am Verteiler
  const rev = { ...strom, points: [[1, 3], [1, END_TOL]] };
  assert.deepEqual(pipeEndDrops(rev, { ...floor, pipes: [rev] }), { head: null, tail: 1.8 });
  // knapp außerhalb der Fangweite: kein Anschluss
  const off = { ...strom, points: [[1, 0.06], [1, 3]] };
  assert.deepEqual(pipeEndDrops(off, { ...floor, pipes: [off] }), { head: null, tail: null });
  // innerhalb der Spanne: nichts zu tun
  const inside = { ...strom, heights: [1.2, 1.2] };
  assert.deepEqual(pipeEndDrops(inside, { ...floor, pipes: [inside] }), { head: null, tail: null });
  // unter dem Gehäuse: hoch zur Unterkante
  const low = { ...strom, heights: [0.3, 0.3] };
  assert.deepEqual(pipeEndDrops(low, { ...floor, pipes: [low] }), { head: 0.9, tail: null });
  // anderes Medium, Verteiler ohne Modell, Durchführung
  const water = { ...strom, type: "wasser_kalt" };
  assert.deepEqual(pipeEndDrops(water, { ...floor, pipes: [water] }), { head: null, tail: null });
  const noModel = { ...floor, nodes: [{ id: "hv", kind: "hv", x: 1, z: 0, model: false }] };
  assert.deepEqual(pipeEndDrops(strom, noModel), { head: null, tail: null });
  const durch = { ...floor, nodes: [{ id: "d", kind: "durch", x: 1, z: 0 }] };
  assert.deepEqual(pipeEndDrops(strom, durch), { head: null, tail: null });
  assert.deepEqual(pipeEndDrops(water, { ...durch, pipes: [water] }), { head: null, tail: null });
  // Netzwerk am Router (eigene Höhe)
  const lan = { id: "l", type: "netzwerk", points: [[5, 0], [5, 2]], heights: [2.45, 2.45] };
  assert.deepEqual(pipeEndDrops(lan, { nodes: [{ id: "r", kind: "router", x: 5, z: 0, y: 1 }], pipes: [lan] }), { head: 1.05, tail: null });
  // kurze bzw. leere Leitung
  assert.deepEqual(pipeEndDrops({ type: "strom", points: [[1, 0]] }, floor), { head: null, tail: null });
  assert.deepEqual(pipeEndDrops({ type: "strom" }, floor), { head: null, tail: null });
});

test("pipeEndDrops: Abzweig mitten auf einer Leitung in beiden Reihenfolgen, Ende an Ende nur die spätere", () => {
  const main = { id: "a", type: "strom", points: [[0, 1], [4, 1]], heights: [2.45, 2.45] };
  const tee = { id: "b", type: "strom", points: [[2, 1], [2, 3]], heights: [0.3, 0.3] };
  for (const pipes of [[main, tee], [tee, main]]) {
    const floor = { pipes };
    assert.deepEqual(pipeEndDrops(tee, floor), { head: 2.45, tail: null });
    assert.deepEqual(pipeEndDrops(main, floor), { head: null, tail: null });
  }
  // anderes Medium: kein Anschluss
  const lan = { ...tee, id: "c", type: "netzwerk" };
  assert.deepEqual(pipeEndDrops(lan, { pipes: [main, lan] }), { head: null, tail: null });
  // unter 1 cm Unterschied: kein Anschlussstück
  const flat = { ...tee, heights: [2.445, 2.445] };
  assert.deepEqual(pipeEndDrops(flat, { pipes: [main, flat] }), { head: null, tail: null });
  // Ende an Ende: nur die spätere Leitung schließt an die frühere an
  const a = { id: "a", type: "strom", points: [[0, 0], [2, 0]], heights: [2.45, 2.45] };
  const b = { id: "b", type: "strom", points: [[2, 0], [2, 2]], heights: [0.3, 0.3] };
  assert.deepEqual(pipeEndDrops(b, { pipes: [a, b] }), { head: 2.45, tail: null });
  assert.deepEqual(pipeEndDrops(a, { pipes: [a, b] }), { head: null, tail: null });
  assert.deepEqual(pipeEndDrops(a, { pipes: [b, a] }), { head: null, tail: 0.3 });
  assert.deepEqual(pipeEndDrops(b, { pipes: [b, a] }), { head: null, tail: null });
  // Kopie mit gleicher id (Editor-Entwurf) gilt als dieselbe Leitung
  assert.deepEqual(pipeEndDrops({ ...b }, { pipes: [a, b] }), { head: 2.45, tail: null });
  // Verteiler hat Vorrang vor der Leitung
  const withNode = { pipes: [a, b], nodes: [{ id: "u", kind: "uv", x: 2, z: 0 }] };
  assert.deepEqual(pipeEndDrops(b, withNode), { head: 0.9, tail: null });
});

test("nodeMaxY mit Gebäude: Decke wie bei den Leitungen (Dachschräge, Platte der Etage darüber)", async () => {
  const { ceilingAlong, clearHeight } = await import("../../custom_components/haus3d/frontend/pipelevels.js");
  const { applyAxis, arrowAnchor } = await import("../../custom_components/haus3d/frontend/arrows3d.js");
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const eg = { id: "eg", name: "EG", elevation: 0, height: 2.5, rooms: [{ id: "w", name: "W", points: rect(0, 0, 10, 8) }] };
  const dg = { id: "dg", name: "DG", elevation: 2.8, height: 2.4, attic: true, knee: 1, rooms: [{ id: "a", name: "A", points: rect(0, 0, 10, 8) }], nodes: [{ id: "n1", kind: "hv", x: 5, z: 0.1, rotation: 0 }] };
  const b = { floors: [eg, dg], settings: { roof: { type: "gable", pitch: 40, overhang: 0.4 } } };
  const n = dg.nodes[0];
  // Dachgeschoss an der Traufwand: Oberkante bleibt unter der Schräge
  const ceil = ceilingAlong(b, dg, [5, 0.1]);
  assert.ok(ceil < 1.5);
  assert.equal(nodeMaxY(n, dg), 1.5); // ohne Gebäude wie bisher: Raumhöhe
  const max = nodeMaxY(n, dg, b);
  assert.ok(Math.abs(max - Math.max(0, ceil - NODE_BODY.hv.h)) < 1e-3, `${max}`);
  assert.equal(arrowAnchor(dg, { kind: "pnode", id: "n1" }, b).max, max);
  applyAxis(dg, { kind: "pnode", id: "n1" }, "y", 5, b);
  assert.ok(n.y + NODE_BODY.hv.h <= ceil + 1e-3);
  // Keller, dessen Höhe bis an die Etage darüber reicht: Gehäuse unter deren Platte
  const kg = { id: "kg", elevation: -2.6, height: 2.6, nodes: [{ id: "k", kind: "hv", x: 1, z: 0.1 }] };
  const b2 = { floors: [kg, { id: "eg", elevation: 0, height: 2.5 }] };
  assert.equal(nodeMaxY(kg.nodes[0], kg, b2), Math.round((clearHeight(b2, kg) - NODE_BODY.hv.h) * 1000) / 1000);
  // Durchführung: Raumhöhe; ohne Lage: Raumhöhe minus Gehäuse
  assert.equal(nodeMaxY({ kind: "durch", x: 1, z: 1 }, kg, b2), 2.6);
  assert.equal(nodeMaxY({ kind: "hv" }, kg, b2), 1.7);
});
