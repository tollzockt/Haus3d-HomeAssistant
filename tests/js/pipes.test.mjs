import { test } from "node:test";
import assert from "node:assert/strict";
import { pathLength, pipeColor, pipeFlow, pipePath, pipeRoute } from "../../custom_components/haus3d/frontend/pipes.js";

test("pipePath: Höhenwechsel geht senkrecht am Punkt hoch", () => {
  const path = pipePath({ points: [[0, 0], [2, 0], [2, 3]], heights: [0.03, 0.03, 1.1] });
  assert.deepEqual(path, [[0, 0.03, 0], [2, 0.03, 0], [2, 1.1, 0], [2, 1.1, 3]]);
  assert.ok(Math.abs(pathLength(path) - (2 + 1.07 + 3)) < 1e-9);
  // ohne heights: feste Höhe
  assert.deepEqual(pipePath({ points: [[0, 0], [1, 0]], height: 0.3 }), [[0, 0.3, 0], [1, 0.3, 0]]);
});

test("pipeFlow: Strom nach Sensor oder Raumleistung, Wasser nach Durchfluss/Ventil", () => {
  const hass = { states: {
    "sensor.leitung_w": { state: "-800", attributes: { unit_of_measurement: "W" } },
    "sensor.leitung_kw": { state: "1.5", attributes: { unit_of_measurement: "kW" } },
    "sensor.durchfluss": { state: "6", attributes: {} },
    "valve.garten": { state: "closed", attributes: {} },
    "switch.pumpe": { state: "on", attributes: {} },
  } };
  const s = pipeFlow({ type: "strom", entity: "sensor.leitung_w" }, hass);
  assert.equal(s.active, true);
  assert.equal(s.reverse, true);
  assert.ok(pipeFlow({ type: "strom", entity: "sensor.leitung_kw" }, hass).speed > s.speed);
  assert.equal(pipeFlow({ type: "strom", room: "kueche" }, hass, 120).active, true);
  assert.equal(pipeFlow({ type: "strom", room: "kueche" }, hass, 1).active, false);
  assert.equal(pipeFlow({ type: "strom" }, hass).active, false);
  assert.equal(pipeFlow({ type: "wasser_kalt", entity: "sensor.durchfluss" }, hass).active, true);
  assert.equal(pipeFlow({ type: "wasser_warm", entity: "valve.garten" }, hass).active, false);
  assert.equal(pipeFlow({ type: "wasser_warm", entity: "switch.pumpe" }, hass).active, true);
  assert.equal(pipeFlow({ type: "wasser_kalt" }, hass).active, false);
  assert.equal(pipeColor("wasser_kalt"), "#1e88e5");
  assert.equal(pipeColor("unbekannt"), "#fbc02d");
});

test("pipeRoute: Steigleitung, Länge und Stelle entlang des Wegs", () => {
  const r = pipeRoute({ points: [[0, 0], [1, 0], [1, 1]], heights: [0.3, 0.3, 0.85] });
  assert.deepEqual(r.path, [[0, 0.3, 0], [1, 0.3, 0], [1, 0.85, 0], [1, 0.85, 1]]);
  assert.ok(Math.abs(r.len - 2.55) < 1e-9);
  assert.ok(Math.abs(pathLength(r.path) - r.len) < 1e-9);
  assert.equal(r.segs.length, 2);
  assert.equal(r.segs[0].vert, 0);
  assert.ok(Math.abs(r.segs[1].vert - 0.55) < 1e-9 && Math.abs(r.segs[1].hor - 1) < 1e-9 && r.segs[1].start === 1);
  const at = (s) => Math.round(r.lenAt(s) * 1000) / 1000;
  assert.deepEqual([at(-1), at(0), at(0.5), at(1), at(1.5), at(2), at(9)], [0, 0, 0.5, 1, 2.05, 2.55, 2.55]);
  // Grundhöhe der Etage
  assert.deepEqual(pipeRoute({ points: [[0, 0], [1, 0]], height: 0.3 }, { base: 3 }).path, [[0, 3.3, 0], [1, 3.3, 0]]);
  // leer
  const e = pipeRoute({ points: [] });
  assert.deepEqual([e.path, e.len, e.lenAt(1)], [[], 0, 0]);
  assert.deepEqual(pipeRoute({}).path, []);
});

test("pipeRoute: senkrechte Anschlussstücke an den Enden (ab 1 cm), Mindesthöhe", () => {
  const pipe = { points: [[0, 0], [2, 0]], heights: [2.45, 2.45] };
  const r = pipeRoute(pipe, { head: 1.8, tail: 0.3 });
  assert.deepEqual(r.path, [[0, 1.8, 0], [0, 2.45, 0], [2, 2.45, 0], [2, 0.3, 0]]);
  assert.ok(Math.abs(r.len - (0.65 + 2 + 2.15)) < 1e-9);
  assert.ok(Math.abs(r.segs[0].start - 0.65) < 1e-9 && Math.abs(r.segs[0].hor - 2) < 1e-9);
  assert.equal(r.lenAt(0), 0);
  assert.ok(Math.abs(r.lenAt(0.5) - 1.65) < 1e-9);
  assert.ok(Math.abs(r.lenAt(1) - r.len) < 1e-9); // Ende samt Anschlussstück
  // 1-cm-Schwelle: kleiner Unterschied ohne Stück, null/NaN ohne Stück
  assert.equal(pipeRoute(pipe, { head: 2.455, tail: 2.445 }).path.length, 2);
  assert.equal(pipeRoute(pipe, { head: 2.47 }).path.length, 3);
  assert.equal(pipeRoute(pipe, { head: null, tail: NaN }).path.length, 2);
  // Mindesthöhe (Rohr liegt nicht im Boden), auch für Anschlussstücke
  const low = pipeRoute({ points: [[0, 0], [1, 0]], heights: [0.01, 0.01] }, { base: 3, min: 0.055, head: 0 });
  assert.deepEqual(low.path, [[0, 3.055, 0], [1, 3.055, 0]]);
  // pipePath bleibt ohne Anschlussstücke
  assert.deepEqual(pipePath(pipe), [[0, 2.45, 0], [2, 2.45, 0]]);
});
