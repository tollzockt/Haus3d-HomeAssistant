// Tests der Beschriftungs-Platzierung in der Dach-Ebene (editor-roofmarks.js): Nordpfeil und Hinweis überdecken sich nicht
import assert from "node:assert/strict";
import { test } from "node:test";

import { around, boxOf, compassAt, hintSpots, keepIn, overlapArea, placeMarks, textRect } from "../../custom_components/haus3d/frontend/editor-roofmarks.js";

const px = (v) => v / 36; // 36 Pixel je Meter
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const rad = (deg) => (deg * Math.PI) / 180;
const BOUNDS = [-0.64, -0.64, 11.64, 8.64]; // Dachflächen des Beispielhauses
const TEXT = "12 von 12 Modulen passen";

test("Rechtecke: Überdeckung, umschließendes Rechteck, Rechteck um einen Punkt", () => {
  near(overlapArea([0, 0, 2, 2], [1, 1, 3, 3]), 1);
  assert.equal(overlapArea([0, 0, 1, 1], [1, 0, 2, 1]), 0); // nur berührt
  assert.equal(overlapArea([0, 0, 1, 1], [5, 5, 6, 6]), 0);
  assert.deepEqual(boxOf([[1, 4], [3, 2], [2, 6]]), [1, 2, 3, 6]);
  assert.deepEqual(around([1, 1], 0.5), [0.5, 0.5, 1.5, 1.5]);
});

test("Text: Rechteck je nach Anker, fette Schrift ist breiter", () => {
  const m = textRect(5, 3, "abcd", 1, "middle");
  const s = textRect(5, 3, "abcd", 1, "start");
  const e = textRect(5, 3, "abcd", 1, "end");
  near(m[2] - m[0], 4 * 0.54);
  near((m[0] + m[2]) / 2, 5);
  near(s[0], 5);
  near(e[2], 5);
  assert.ok(m[1] < 3 && m[3] > 3, "Grundlinie liegt im Rechteck");
  assert.ok(textRect(0, 0, "abcd", 1, "middle", true)[2] > m[2] - 5);
});

test("Nordpfeil: Spitze in Nordrichtung, Beschriftung mit Gradzahl, Rahmen umschließt alles", () => {
  const c0 = compassAt([0, 0], 0, px);
  near(c0.tip[0], 0);
  near(c0.tip[1], -0.9);
  assert.equal(c0.text, "N");
  const c = compassAt([2, 3], rad(90), px);
  near(c.tip[0], 2.9);
  near(c.tip[1], 3);
  assert.equal(c.text, "N 90°");
  for (const k of [c0, c, compassAt([0, 0], rad(215), px)]) {
    assert.ok(k.box[0] <= Math.min(k.nc[0], k.tip[0]) && k.box[2] >= Math.max(k.nc[0], k.tip[0]));
    assert.ok(k.box[1] <= Math.min(k.nc[1], k.tip[1]) && k.box[3] >= Math.max(k.nc[1], k.tip[1]));
    assert.ok(overlapArea(k.box, textRect(k.label[0], k.label[1], k.text, px(13), "middle", true)) > 0);
  }
});

test("Hinweisplätze: darüber, darunter, dann bündig links/rechts; mittig bleibt die erste Wahl", () => {
  const field = [2, 4, 4, 5];
  const spots = hintSpots(field, TEXT, px(12), px);
  assert.deepEqual(spots.map((s) => s.anchor), ["middle", "middle", "start", "start", "end", "end"]);
  assert.ok(spots[0].z < field[1] && spots[1].z > field[3]);
  near(spots[0].x, 3);
  near(spots[2].x, 2);
  near(spots[4].x, 4);
  for (const s of spots) assert.equal(overlapArea(s.box, field), 0, "Text liegt nie auf dem Feld");
});

test("ohne Hindernisse: Nordpfeil oben links (0,3 m eingerückt), Hinweis mittig über dem Feld", () => {
  const field = [4, 3, 6, 4];
  const m = placeMarks({ bounds: BOUNDS, north: 0, px, hints: [{ id: "a", field, text: TEXT, size: px(12) }] });
  near(m.compass.nc[0], BOUNDS[0] + 0.3);
  near(m.compass.nc[1], BOUNDS[1] + 0.3);
  const h = m.hints.get("a");
  assert.equal(h.anchor, "middle");
  near(h.x, 5);
  assert.ok(h.z < field[1]);
});

test("Hinweis gerät unter den Nordpfeil: er weicht unter das Feld aus, der Pfeil bleibt oben links", () => {
  // Norden unten: der Pfeil hängt vom linken oberen Eck ins Dach – genau dort liegt das Feld mit seinem Hinweis
  const field = [-0.4, 1.4, 1.6, 2.4];
  const north = rad(180);
  const alt = compassAt([BOUNDS[0] + 0.3, BOUNDS[1] + 0.3], north, px);
  const first = hintSpots(field, TEXT, px(12), px)[0];
  assert.ok(overlapArea(alt.box, first.box) > 0, "Ausgangslage: der Hinweis läge unter dem Nordpfeil");
  const m = placeMarks({ bounds: BOUNDS, north, px, blocked: [field], hints: [{ id: "a", field, text: TEXT, size: px(12) }] });
  const h = m.hints.get("a");
  near(m.compass.nc[0], BOUNDS[0] + 0.3);
  near(m.compass.nc[1], BOUNDS[1] + 0.3);
  assert.equal(overlapArea(m.compass.box, h.box), 0);
  assert.equal(overlapArea(h.box, field), 0);
  assert.ok(h.z > field[3], "Hinweis steht unter dem Feld");
});

test("Feld samt Hinweisplätzen sperrt die Ecke: der Nordpfeil wandert in eine freie Ecke", () => {
  const field = [-0.5, -0.5, 4, 2.5]; // deckt die linke obere Ecke ab
  const m = placeMarks({ bounds: BOUNDS, north: 0, px, blocked: [field], hints: [{ id: "a", field, text: TEXT, size: px(12) }] });
  assert.equal(overlapArea(m.compass.box, field), 0);
  assert.equal(overlapArea(m.compass.box, m.hints.get("a").box), 0);
  assert.ok(m.compass.nc[0] > 5 || m.compass.nc[1] > 4, "nicht mehr oben links");
  // zuerst oben rechts (gleiche Reihenfolge wie die Ecken)
  near(m.compass.nc[0], BOUNDS[2] - 0.3);
  near(m.compass.nc[1], BOUNDS[1] + 0.3);
});

test("Dinge und Griffe in der Ecke: der Nordpfeil weicht aus, auch ohne Hinweis", () => {
  const griff = around([BOUNDS[0] + 0.3, BOUNDS[1] + 0.3], 0.3);
  const m = placeMarks({ bounds: BOUNDS, north: rad(135), px, blocked: [griff] });
  assert.equal(overlapArea(m.compass.box, griff), 0);
  assert.equal(m.hints.size, 0);
});

test("überall belegt: die Lage mit der kleinsten Überdeckung gewinnt, nichts bricht", () => {
  const voll = [[-1, -1, 12, 9]]; // ganzes Dach
  const m = placeMarks({ bounds: BOUNDS, north: 0, px, blocked: voll, hints: [{ id: "a", field: [4, 3, 6, 4], text: TEXT, size: px(12) }] });
  assert.ok(m.compass && m.hints.get("a"));
  // Pfeil oben links ragt aus dem Dach heraus (Norden oben): dort ist weniger belegt als in den anderen Ecken
  near(m.compass.nc[0], BOUNDS[0] + 0.3);
  near(m.compass.nc[1], BOUNDS[1] + 0.3);
});

test("sichtbarer Ausschnitt: keepIn schiebt hinein (links/oben zuerst), der Nordpfeil hängt nicht über den Rand", () => {
  assert.deepEqual(keepIn([0, 0, 2, 2], [1, 1, 10, 10], 0.5), [1.5, 1.5]);
  assert.deepEqual(keepIn([9, 9, 11, 11], [1, 1, 10, 10], 0.5), [-1.5, -1.5]);
  assert.deepEqual(keepIn([2, 2, 3, 3], [1, 1, 10, 10], 0.5), [0, 0]);
  assert.deepEqual(keepIn([0, 0, 20, 20], [1, 1, 10, 10]), [1, 1]); // passt nicht: links/oben bündig
  // Norden oben: der Pfeil mit „N“ ragte über den oberen Rand (Plan reicht nur 1 m über die Räume hinaus)
  const view = [-1, -1, 13, 10];
  const m = placeMarks({ bounds: BOUNDS, north: 0, px, view });
  assert.ok(m.compass.box[1] >= view[1] + px(6) - 1e-9 && m.compass.box[0] >= view[0], `Pfeil im Bild: ${m.compass.box}`);
  near(m.compass.nc[0], BOUNDS[0] + 0.3); // weiter oben links, nur nach unten gerutscht
  assert.ok(m.compass.nc[1] > BOUNDS[1] + 0.3);
  // ohne Ausschnitt unverändert
  near(placeMarks({ bounds: BOUNDS, north: 0, px }).compass.nc[1], BOUNDS[1] + 0.3);
  // Hinweis am oberen Rand: der Platz darüber läge außerhalb, also darunter
  const feld = [4, -0.8, 6, 0.2];
  const h = placeMarks({ bounds: BOUNDS, north: 0, px, view, blocked: [feld], hints: [{ id: "a", field: feld, text: TEXT, size: px(12) }] }).hints.get("a");
  assert.ok(h.z > feld[3]);
});

test("mehrere Hinweise überdecken sich nicht gegenseitig", () => {
  const a = [2, 3, 4, 4];
  const b = [2.5, 4.3, 4.5, 5.3]; // knapp unter a
  const m = placeMarks({ bounds: BOUNDS, north: 0, px, blocked: [a, b], hints: [{ id: "a", field: a, text: TEXT, size: px(12) }, { id: "b", field: b, text: TEXT, size: px(12) }] });
  assert.equal(overlapArea(m.hints.get("a").box, m.hints.get("b").box), 0);
  assert.equal(overlapArea(m.hints.get("a").box, b), 0);
  assert.equal(overlapArea(m.hints.get("b").box, a), 0);
});
