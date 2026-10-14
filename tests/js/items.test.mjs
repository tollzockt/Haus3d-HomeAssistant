// 0.23: Katalog „Einrichten“ (Drinnen/Draußen), einstellbare Raster (Würfelregal, Solar-Aufständerung)
import assert from "node:assert/strict";
import { test } from "node:test";

import { EXTRA, EXTRA_FREE, PV_GRID, cubeGrid, cubeSize, pvGrid, pvModules, pvSize } from "../../custom_components/haus3d/frontend/catalog-extra.js";
import { applyGrid, itemGrid, orientGrid, pvNote } from "../../custom_components/haus3d/frontend/editor-items.js";
import { FURNITURE_CATEGORIES, FURNITURE_GROUPS, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";

test("Einrichten: jede Kategorie in genau einer Gruppe, Draußen = Garten, Solar, Wallbox und die Garten-Kategorien", () => {
  const all = FURNITURE_GROUPS.flatMap(([, cs]) => cs);
  assert.deepEqual([...all].sort(), FURNITURE_CATEGORIES.map(([c]) => c).sort());
  assert.deepEqual(FURNITURE_GROUPS.map(([g]) => g), ["Drinnen", "Draußen"]);
  assert.deepEqual([...FURNITURE_GROUPS[1][1]].sort(), ["Beet & Gewächshaus", "Garten", "Gartenmöbel", "Hof & Einfahrt", "Solar-Aufständerung", "Spiel & Freizeit", "Wallbox & E-Auto"]);
  // Garage und Hydroponik stehen drinnen
  for (const c of ["Garage & Werkstatt", "Hydroponik & Anzucht"]) assert.ok(FURNITURE_GROUPS[0][1].includes(c), c);
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

const FENCES = ["pv_fence_vertical", "pv_fence_mesh", "pv_fence_privacy"];

test("Solarzaun: Module breit × hoch mit Bodenabstand", () => {
  const v = applyGrid({ id: "z", type: "pv_fence_vertical" }, 4, 2);
  assert.deepEqual([v.cols, v.rows, v.w, v.h], [4, 2, 7.04, 2.5]);
  assert.deepEqual(pvModules(v.type, v.w, v.d, v, v.h), { across: 4, rows: 2 });
  // ohne eigene Zahl aus der Höhe über dem Bodenabstand, höchstens 3 übereinander
  assert.deepEqual(pvModules("pv_fence_vertical", 3.52, 0.12, null, 1.35), { across: 2, rows: 1 });
  assert.deepEqual(pvModules("pv_fence_vertical", 3.52, 0.12, null, 2.5), { across: 2, rows: 2 });
  assert.equal(pvModules("pv_fence_vertical", 3.52, 0.12, null, 6).rows, 3);
  const g = itemGrid({ type: "pv_fence_vertical" });
  assert.equal(g.maxRows, 3);
  assert.equal(g.rowLabel, "Module hoch");
  assert.equal(g.orientable, true);
  const q = applyGrid({ id: "q", type: "pv_fence_privacy" }, 2, 9);
  assert.equal(q.rows, 3);
  assert.equal(q.h, 5.47);
  const solar = new Map(FURNITURE_CATEGORIES).get("Solar-Aufständerung");
  for (const k of FENCES) {
    const gk = itemGrid({ type: k });
    assert.deepEqual(pvSize(k, gk.cols, gk.rows), { w: EXTRA[k][1], h: EXTRA[k][3] }, k);
    assert.ok(solar.includes(k), k);
    assert.ok(EXTRA_FREE.includes(k), k);
  }
});

test("Solarzaun: Modullage quer/hochkant", () => {
  const v = applyGrid({ id: "z", type: "pv_fence_vertical" }, 4, 2);
  const p = orientGrid(structuredClone(v), "portrait");
  assert.deepEqual([p.cols, p.rows, p.w, p.h, p.orient], [4, 2, 4.68, 3.68, "portrait"]);
  assert.equal(itemGrid(p).portrait, true);
  const l = orientGrid(p, "landscape");
  assert.equal(l.orient, undefined);
  assert.deepEqual([l.w, l.h], [7.04, 2.5]);
  assert.deepEqual(pvSize("pv_fence_mesh", 2, 1, { orient: "portrait" }), { w: 2.34, h: 1.78 });
  // Sichtschutz immer hochkant, ohne Auswahl
  assert.equal(itemGrid({ type: "pv_fence_privacy" }).orientable, false);
  assert.equal(orientGrid({ id: "s", type: "pv_fence_privacy" }, "portrait").orient, undefined);
  // andere Aufständerungen kennen keine Lage, ungültige Werte gelten als quer
  assert.deepEqual(pvSize("pv_flat_south", 2, 1, { orient: "portrait" }), pvSize("pv_flat_south", 2, 1));
  assert.equal(pvGrid("pv_fence_vertical", { orient: "kaputt" }).pw, 1.76);
});

test("Solarzaun-Modelle: Module, Pfosten, Sockel und Neigung", () => {
  const v = applyGrid({ id: "z", type: "pv_fence_vertical", x: 0, z: 0 }, 4, 2);
  const groups = (o) => o.children.filter((c) => c.isGroup);
  const alu = (o) => {
    let hit = false;
    o.traverse((c) => (hit ||= !!(c.isMesh && c.material.color?.getHex() === 0xc9ccd1)));
    return hit;
  };
  for (const style of ["standard", "cyber"]) {
    const M = furnitureMaterials(style);
    for (const k of FENCES) {
      for (const item of [{ id: "a", type: k, x: 0, z: 0 }, applyGrid({ id: "b", type: k, x: 0, z: 0 }, 4, 2)]) {
        const g = itemGrid(item);
        assert.equal(groups(buildFurniture(item, M, 0, 2.5)).length, g.cols * g.rows, `${style} ${k} ${g.cols}×${g.rows}`);
      }
    }
  }
  const M = furnitureMaterials("standard");
  const box = (o) => new THREE.Box3().setFromObject(o);
  const fv = buildFurniture(v, M, 0, 2.5);
  const bb = box(fv);
  assert.ok(Math.abs(bb.min.y) < 1e-6 && Math.abs(bb.max.y - 2.5) < 0.01, `${bb.min.y} … ${bb.max.y}`);
  assert.ok(bb.max.x - bb.min.x <= 7.04 + 0.01);
  // senkrecht: Bodenabstand, Zellen auf beiden Seiten (kein Rahmen im Modul) – anders als am Balkon
  const vm = groups(fv);
  assert.ok(Math.min(...vm.map((m) => box(m).min.y)) >= 0.19);
  assert.ok(vm.every((m) => !alu(m)));
  assert.ok(groups(buildFurniture({ id: "bk", type: "pv_balcony", x: 0, z: 0 }, M, 0, 2.5)).every(alu));
  // Sichtschutz: rahmenlos auf einem 0,25 m hohen Sockel
  const fp = buildFurniture({ id: "s", type: "pv_fence_privacy", x: 0, z: 0 }, M, 0, 2.5);
  const pm = groups(fp);
  assert.ok(pm.every((m) => !alu(m)));
  assert.ok(Math.min(...pm.map((m) => box(m).min.y)) >= 0.25);
  assert.ok(fp.children.some((c) => c.isMesh && Math.abs(box(c).min.y) < 1e-6 && Math.abs(box(c).max.y - 0.25) < 0.01 && box(c).max.x - box(c).min.x > 2));
  // Zaunmatte: Module vor der Matte, Zellen nach vorn (+z) und leicht nach oben, innerhalb der Tiefe
  const d = EXTRA.pv_fence_mesh[2];
  const fm = buildFurniture({ id: "m", type: "pv_fence_mesh", x: 0, z: 0 }, M, 0, 2.5);
  const bm = box(fm);
  assert.ok(bm.max.z - bm.min.z <= d + 0.05, `${bm.max.z - bm.min.z}`);
  for (const m of groups(fm)) {
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
    assert.ok(n.z > 0.9 && n.y > 0, `${n.y} ${n.z}`);
    assert.ok(box(m).max.z > 0);
  }
});

test("Hinweis: Modulzahl und kWp", () => {
  assert.match(pvNote(itemGrid({ type: "pv_fence_vertical" })), /Breite und Höhe folgen der Anzahl\. 2 Module × 400 Wp = 0,80 kWp\./);
  assert.match(pvNote(itemGrid({ type: "pv_fence_privacy" })), /hochkant.*2 Module × 400 Wp = 0,80 kWp/);
  const ew = pvNote(itemGrid(applyGrid({ type: "pv_flat_ew" }, 3, 2)));
  assert.ok(ew.includes("12 Module") && ew.includes("4,80 kWp"), ew);
  assert.ok(pvNote(itemGrid({ type: "pv_facade" })).includes("Breite und Höhe"));
  assert.ok(pvNote(itemGrid({ type: "pv_balcony" })).includes("die Breite folgt"));
  assert.ok(pvNote(itemGrid({ type: "pv_flat_south" })).includes("Breite und Tiefe"));
});
