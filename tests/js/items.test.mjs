// 0.23: Katalog „Einrichten“ (Drinnen/Draußen), einstellbare Raster (Würfelregal, Solar-Aufständerung)
import assert from "node:assert/strict";
import { test } from "node:test";

import { EXTRA, PV_GRID, cubeGrid, cubeSize, pvModules, pvSize } from "../../custom_components/haus3d/frontend/catalog-extra.js";
import { applyGrid, itemGrid } from "../../custom_components/haus3d/frontend/editor-items.js";
import { FURNITURE_CATEGORIES, FURNITURE_GROUPS, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";

test("Einrichten: jede Kategorie in genau einer Gruppe, Draußen = Garten, Solar, Wallbox", () => {
  const all = FURNITURE_GROUPS.flatMap(([, cs]) => cs);
  assert.deepEqual([...all].sort(), FURNITURE_CATEGORIES.map(([c]) => c).sort());
  assert.deepEqual(FURNITURE_GROUPS.map(([g]) => g), ["Drinnen", "Draußen"]);
  assert.deepEqual([...FURNITURE_GROUPS[1][1]].sort(), ["Garten", "Solar-Aufständerung", "Wallbox & E-Auto"]);
});

test("Würfelregal: Maße aus der Würfelzahl treffen die Katalogmaße, eigene Zahl gewinnt", () => {
  for (const [k, c, r] of [["ikea_kallax_1x4", 1, 4], ["ikea_kallax_2x2", 2, 2], ["ikea_kallax_2x4", 2, 4], ["ikea_kallax_4x4", 4, 4]]) {
    assert.equal(cubeSize(c), EXTRA[k][1], k);
    assert.equal(cubeSize(r), EXTRA[k][3], k);
    assert.deepEqual(cubeGrid({ type: k }), [c, r]);
  }
  const m = applyGrid({ id: "s", type: "ikea_kallax_2x2", x: 0, z: 0 }, 3, 5);
  assert.deepEqual([m.cols, m.rows, m.w, m.h], [3, 5, 1.12, 1.82]);
  assert.equal(itemGrid(m).cols, 3);
  // 3 Würfel breit = 4 senkrechte Wände im Modell (mehr als beim 2er)
  const M = furnitureMaterials("standard");
  const tall = (item) => buildFurniture(item, M, 0, 2.5).children.filter((c) => c.isMesh && c.geometry.parameters?.height > 1).length;
  assert.ok(tall(m) > tall({ id: "t", type: "ikea_kallax_2x2", x: 0, z: 0, w: 1.12, h: 1.82 }));
});

test("Solar-Aufständerung: Module breit × tief bestimmen Maße und Anordnung", () => {
  // ohne eigene Zahl wie bisher aus den Maßen
  assert.deepEqual(pvModules("pv_flat_south", 2.3, 1.7), { across: 2, rows: 1 });
  assert.deepEqual(pvModules("pv_flat_ew", 2.3, 3.4), { across: 2, rows: 4 });
  assert.deepEqual(pvModules("pv_balcony", 3.45, 0.08), { across: 2, rows: 1 });
  // eigene Zahl: 4 breit, 2 Reihen
  const m = applyGrid({ id: "p", type: "pv_flat_south", x: 0, z: 0 }, 4, 2);
  assert.deepEqual([m.cols, m.rows, m.w, m.d], [4, 2, 4.6, 3.4]);
  assert.deepEqual(pvModules(m.type, m.w, m.d, m), { across: 4, rows: 2 });
  // Ost-West: Paare tief; Fassade: Module hoch; Balkon nur breit
  const ew = applyGrid({ id: "e", type: "pv_flat_ew" }, 3, 2);
  assert.deepEqual(pvModules(ew.type, ew.w, ew.d, ew), { across: 3, rows: 4 });
  assert.equal(itemGrid(ew).rows, 2);
  assert.deepEqual(pvSize("pv_facade", 2, 3), { w: 2.26, h: 5.16 });
  assert.equal(itemGrid({ type: "pv_balcony" }).maxRows, 1);
  for (const k of Object.keys(PV_GRID)) assert.ok(EXTRA[k], k);
  // Modell baut mit mehreren Reihen
  const M = furnitureMaterials("standard");
  const panels = (item) => buildFurniture(item, M, 0, 2.5).children.filter((c) => c.isGroup).length;
  assert.equal(panels(m), 8);
});
