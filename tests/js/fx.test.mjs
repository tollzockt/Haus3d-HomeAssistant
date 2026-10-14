// Jahreszeit, Sonnenbahn, Verschattung, Energiefluss im Haus
import assert from "node:assert/strict";
import { test } from "node:test";

import { daySamples, houseFlowItems, resolveSeason, seasonOf, shadingSummary } from "../../custom_components/haus3d/frontend/fx.js";

test("Jahreszeit nach Datum und Halbkugel, Einstellung hat Vorrang", () => {
  assert.equal(seasonOf(new Date(2026, 3, 10), 51), "spring");
  assert.equal(seasonOf(new Date(2026, 6, 10), 51), "summer");
  assert.equal(seasonOf(new Date(2026, 9, 5), 51), "autumn");
  assert.equal(seasonOf(new Date(2026, 0, 5), 51), "winter");
  assert.equal(seasonOf(new Date(2026, 0, 5), -33), "summer");
  assert.equal(resolveSeason("winter", new Date(2026, 6, 1), 51), "winter");
  assert.equal(resolveSeason("auto", new Date(2026, 6, 1), 51), "summer");
});

test("Sonnenbahn: Sommer länger als Winter, nur über dem Horizont", () => {
  const summer = daySamples(new Date(2026, 5, 21, 12), 51, 10);
  const winter = daySamples(new Date(2026, 11, 21, 12), 51, 10);
  assert.ok(summer.length > winter.length * 1.6, `${summer.length} vs ${winter.length}`);
  assert.ok(summer.every((s) => s.elevation >= 3));
  assert.ok(Math.max(...summer.map((s) => s.elevation)) > 55);
});

test("Verschattung gewichtet nach Sonnenhöhe", () => {
  const s = shadingSummary([
    { t: 1, elevation: 10, shaded: 10, total: 10 },
    { t: 2, elevation: 60, shaded: 0, total: 10 },
    { t: 3, elevation: 30, shaded: 5, total: 10 },
  ]);
  const w = [10, 60, 30].map((e) => Math.sin((e * Math.PI) / 180));
  assert.ok(Math.abs(s.loss - (w[0] + w[2] * 0.5) / (w[0] + w[1] + w[2])) < 1e-9);
  assert.deepEqual(s.worst, { t: 1, frac: 1 });
  assert.equal(shadingSummary([{ t: 1, elevation: 30, shaded: 0, total: 4 }]).worst, null);
});

test("Energiefluss im Haus: Räume ab 5 W, Netz in beide Richtungen", () => {
  const items = houseFlowItems(new Map([["kueche", 1200], ["flur", 2], ["bad", 60]]), { dir: "export", w: 400 });
  assert.deepEqual(items.map((i) => i.key), ["kueche", "bad", "grid"]);
  assert.equal(items[2].reverse, true);
  assert.ok(items[0].speed > items[1].speed);
  assert.equal(houseFlowItems(new Map(), { dir: "idle", w: 2 }).length, 0);
});

test("Schnee und Jahreszeit an Texturmaterialien: keine NaN-Farbe, Rasen mit Textur folgt der Jahreszeit", async () => {
  const THREE = await import("../../custom_components/haus3d/frontend/vendor/three.module.min.js");
  const { HouseScene } = await import("../../custom_components/haus3d/frontend/scene.js");
  const P = HouseScene.prototype;
  const lawn = new THREE.MeshStandardMaterial({ color: 0x4f8a3a });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8a4f3a });
  const sc = { style: "classic", texMats: new Map(), renderer: null, outdoorMats: { lawn }, mats: { roof }, furnMats: {}, invalidate() {} };
  for (const f of ["_groundRoofMats", "_snowTint", "_texMat", "setSeason"]) sc[f] = P[f];
  sc._snowTint(0); // Wetter: Grundfarben gemerkt
  sc.setSeason("autumn");
  // Neuaufbau mit Textur (Schlüssel ohne Bild: Kopie ohne map) und mit eigener Farbe (Wegwerf-Kopie der Vorlage)
  const tLawn = sc._texMat(lawn, "test", "ground:lawn");
  const tRoof = sc._texMat(roof, "test", "roof");
  const own = roof.clone();
  own.color.set("#336699");
  const tOwn = sc._texMat(own, "test", "roof", true);
  assert.ok([...sc.texMats.keys()].some((k) => k.startsWith("ground:lawn:")));
  sc._snowTint(0.5);
  const finite = (m) => [m.color.r, m.color.g, m.color.b].every(Number.isFinite);
  assert.ok(finite(tLawn) && finite(tRoof) && finite(tOwn), [tLawn, tRoof, tOwn].map((m) => m.color.getHexString()).join());
  assert.equal(tLawn.color.getHex(), lawn.color.getHex(), "Rasen mit Textur wie ohne");
  assert.equal(tRoof.color.getHex(), roof.color.getHex());
  assert.equal(tOwn.color.getHex(), new THREE.Color("#336699").lerp(new THREE.Color(0xf4f7fb), 0.5).getHex(), "eigene Farbe getönt");
  // Jahreszeit erreicht den Rasen mit Textur, Schnee bleibt darüber; Sommer stellt die Grundfarbe wieder her
  sc.setSeason("winter");
  assert.equal(tLawn.color.getHex(), lawn.color.getHex());
  sc._snowTint(0);
  sc.setSeason("summer");
  assert.equal(lawn.color.getHex(), 0x4f8a3a);
  assert.equal(tLawn.color.getHex(), 0x4f8a3a);
  assert.equal(tRoof.color.getHex(), 0x8a4f3a);
});
