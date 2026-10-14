// Garten, Garage, Hydroponik: Katalog (Kategorien Draußen/Drinnen), Modelle im Einheitsrahmen, Whirlpool offen/abgedeckt,
// Randsteine (Geometrie, Linienart) und weiche Schema-Felder.
import assert from "node:assert/strict";
import { test } from "node:test";

import { GARDEN_PACK } from "../../custom_components/haus3d/frontend/catalog-garden.js";
import { FURNITURE, FURNITURE_CATEGORIES, FURNITURE_GROUPS, buildFurniture, furnitureBaseY, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { buildGarden } from "../../custom_components/haus3d/frontend/furniture-garden.js";
import { HouseScene } from "../../custom_components/haus3d/frontend/scene.js";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";

const TYPES = Object.keys(GARDEN_PACK.items);
const OUTDOOR = ["Gartenmöbel", "Beet & Gewächshaus", "Spiel & Freizeit", "Hof & Einfahrt"];
const INDOOR = ["Garage & Werkstatt", "Hydroponik & Anzucht"];

test("Katalog: Typen mit Präfix garden_, 70 bis 90 Stück, Maße gültig, jeder Typ genau einmal", () => {
  assert.ok(TYPES.length >= 70 && TYPES.length <= 90, `${TYPES.length} Typen`);
  for (const [k, [name, w, d, h]] of Object.entries(GARDEN_PACK.items)) {
    assert.match(k, /^garden_/);
    assert.ok(name && w > 0 && d > 0 && h > 0, k);
    assert.deepEqual(FURNITURE[k], GARDEN_PACK.items[k], k);
  }
  const listed = GARDEN_PACK.categories.flatMap(([, ts]) => ts);
  assert.deepEqual([...listed].sort(), [...TYPES].sort());
  for (const k of [...Object.keys(GARDEN_PACK.mount), ...GARDEN_PACK.free]) assert.ok(GARDEN_PACK.items[k], k);
});

test("Kategorien: Draußen = Garten, Solar, Wallbox und die vier neuen, Garage und Hydroponik drinnen", () => {
  const groups = Object.fromEntries(FURNITURE_GROUPS);
  assert.deepEqual([...GARDEN_PACK.outdoor], OUTDOOR);
  for (const c of OUTDOOR) assert.ok(groups["Draußen"].includes(c), c);
  for (const c of INDOOR) assert.ok(groups["Drinnen"].includes(c), c);
  assert.deepEqual([...groups["Draußen"]].sort(), ["Garten", "Solar-Aufständerung", "Wallbox & E-Auto", ...OUTDOOR].sort());
  // jede der sechs Kategorien enthält nur garden_-Typen und hat Einträge
  for (const c of [...OUTDOOR, ...INDOOR]) {
    const types = FURNITURE_CATEGORIES.find(([n]) => n === c)?.[1] ?? [];
    assert.ok(types.length >= 5 && types.every((t) => t.startsWith("garden_")), c);
  }
});

test("Montagehöhen: Wandtypen hängen, Draußen steht frei", () => {
  const { mount, free } = GARDEN_PACK;
  assert.deepEqual(Object.keys(mount).sort(), ["garden_bike_hook", "garden_house_number", "garden_pegboard", "garden_tap"]);
  for (const k of Object.keys(mount)) assert.ok(!free.includes(k), `${k} rastet an Wänden ein`);
  for (const [cat, types] of GARDEN_PACK.categories) if (OUTDOOR.includes(cat)) for (const t of types) assert.ok(free.includes(t) || t in mount, t);
  assert.ok(Math.abs(furnitureBaseY({ type: "garden_pegboard" }, 2.5) - 1.0) < 1e-9);
});

const STYLES = ["standard", "cyber"];
// Modelle, die einem Licht folgen sollen (LED-Leisten, Zuchtlicht)
const LIT = ["garden_growbox", "garden_seed_rack", "garden_microgreens"];

/** Ist das Objekt samt aller Elternobjekte sichtbar? */
const shown = (o) => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return !!o;
};

/** Umgebungsquader nur der sichtbaren Teile (ausgeblendete Abdeckungen zählen nicht). */
function visibleBox(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.geometry || !shown(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

test("Modelle: jeder Typ wird gebaut (nicht der graue Platzhalter), liegt im Einheitsrahmen und bleibt leicht", () => {
  const bad = [];
  for (const style of STYLES) {
    const M = furnitureMaterials(style);
    // GARDEN_ONLY=garden_chair,garden_bench prüft nur diese Typen (beim Arbeiten an einem Modul)
    for (const type of TYPES.filter((t) => !process.env.GARDEN_ONLY || process.env.GARDEN_ONLY.split(",").includes(t))) {
      const [, w, d, h] = FURNITURE[type];
      const probe = new THREE.Group();
      if (!buildGarden(type, w, d, h, M, probe, [], { id: type, type })) {
        bad.push(`${type}: kein eigenes Modell`);
        continue;
      }
      const g = buildFurniture({ id: type, type, x: 0, z: 0, rotation: 0, w, d, h }, M, 0, 2.5);
      const box = visibleBox(g);
      const s = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      const base = g.position.y;
      const tag = `${style} ${type}`;
      if ([s.x, s.y, s.z, c.x].some((v) => !Number.isFinite(v))) bad.push(`${tag}: ungültige Maße`);
      // Maße: nicht kleiner als die Hälfte, nicht größer als das Sollmaß plus 15 % und 6 cm
      for (const [axis, got, want] of [["Breite", s.x, w], ["Tiefe", s.z, d], ["Höhe", s.y, h]]) {
        if (got > want * 1.15 + 0.06 || got < want * 0.45) bad.push(`${tag}: ${axis} ${got.toFixed(2)} statt ${want}`);
      }
      if (Math.abs(c.x) > w * 0.25 + 0.05 || Math.abs(c.z) > d * 0.25 + 0.05) bad.push(`${tag}: Mitte verschoben (${c.x.toFixed(2)} / ${c.z.toFixed(2)})`);
      if (box.min.y - base < -0.05 || box.min.y - base > 0.12) bad.push(`${tag}: Unterkante ${(box.min.y - base).toFixed(2)} m`);
      let meshes = 0;
      let tris = 0;
      g.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        if (o.isInstancedMesh) bad.push(`${tag}: InstancedMesh im Modell`);
      });
      if (meshes > 160 || tris > 12000) bad.push(`${tag}: zu schwer (${meshes} Meshes, ${tris} Dreiecke)`);
      if (LIT.includes(type) && !g.userData.bulbs.length) bad.push(`${tag}: kein Licht (bulbs)`);
    }
  }
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- Whirlpool: Abdeckung offen/zu, folgt einer Entität

const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
const glow = (m) => (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity;

/** Whirlpool bauen und seinen Anblick abfragen (Abdeckung, zusammengeklappte Abdeckung, Wasser, Blasen). */
function tub(type, style = "standard", extra = {}) {
  const g = buildFurniture({ id: "t", type, x: 0, z: 0, ...extra }, furnitureMaterials(style), 0, 2.5);
  const by = (n) => g.getObjectByName(n);
  return {
    g,
    state: (s) => g.userData.onState(s),
    covered: () => shown(by("tub:cover")) && !shown(by("tub:cover_open")),
    opened: () => !shown(by("tub:cover")) && shown(by("tub:cover_open")),
    water: () => shown(by("tub:water")),
    bubbles: () => shown(by("tub:bubbles")),
    waterMat: () => by("tub:water").material,
  };
}

test("Whirlpool: Standard abgedeckt (kein Wasser zu sehen), Feld open = offen mit Wasser; beide Typen, beide Stile", () => {
  for (const style of STYLES) {
    for (const type of ["hot_tub", "garden_hot_tub_acryl"]) {
      const tag = `${style} ${type}`;
      const zu = tub(type, style);
      assert.ok(zu.covered() && !zu.water() && !zu.bubbles(), `${tag}: abgedeckt`);
      const auf = tub(type, style, { open: true });
      assert.ok(auf.opened() && auf.water() && !auf.bubbles(), `${tag}: offen`);
      // explizit false = abgedeckt
      assert.ok(tub(type, style, { open: false }).covered(), `${tag}: open false`);
      // Zustandsfunktion vorhanden, Statusleuchte folgt dem Licht
      assert.equal(typeof zu.g.userData.onState, "function", tag);
      assert.ok(zu.g.userData.bulbs.length >= 1, `${tag}: Statusleuchte`);
    }
  }
});

test("Whirlpool: eine Abdeckung (cover) bestimmt offen/zu, ohne Neuaufbau; current_position > 0 = offen", () => {
  for (const type of ["hot_tub", "garden_hot_tub_acryl"]) {
    const t = tub(type); // Feld: abgedeckt
    t.state(st("cover.pool_abdeckung", "open", { current_position: 100 }));
    assert.ok(t.opened() && t.water(), `${type}: cover offen`);
    t.state(st("cover.pool_abdeckung", "closed", { current_position: 0 }));
    assert.ok(t.covered() && !t.water(), `${type}: cover zu`);
    t.state(st("cover.pool_abdeckung", "open", { current_position: 30 }));
    assert.ok(t.opened(), `${type}: Position 30 = offen`);
    t.state(st("cover.pool_abdeckung", "closing", { current_position: 0 }));
    assert.ok(t.covered(), `${type}: Position 0 = zu`);
    // ohne Position zählt der Zustand
    t.state(st("cover.pool_abdeckung", "open"));
    assert.ok(t.opened(), `${type}: Zustand open`);
    t.state(st("cover.pool_abdeckung", "closed"));
    assert.ok(t.covered(), `${type}: Zustand closed`);
    // Entität weg oder nicht erreichbar: zurück auf das Feld
    t.state(st("cover.pool_abdeckung", "open", { current_position: 100 }));
    t.state(null);
    assert.ok(t.covered(), `${type}: ohne Entität gilt das Feld`);
    t.state(st("cover.pool_abdeckung", "unavailable"));
    assert.ok(t.covered(), `${type}: nicht erreichbar gilt das Feld`);
    // ein offen eingestelltes Feld bleibt, wenn die Entität fehlt
    const o = tub(type, "standard", { open: true });
    o.state(null);
    assert.ok(o.opened(), `${type}: Feld offen ohne Entität`);
  }
});

test("Whirlpool: Schalter, Heizung oder Klima an = in Betrieb (Wasser heller, Blasen) – die Abdeckung bleibt laut Feld", () => {
  for (const type of ["hot_tub", "garden_hot_tub_acryl"]) {
    const t = tub(type, "standard", { open: true });
    const ruhig = t.waterMat();
    t.state(st("switch.pool_pumpe", "on"));
    assert.ok(t.opened() && t.water() && t.bubbles(), `${type}: Betrieb offen`);
    const hell = t.waterMat();
    assert.notEqual(hell, ruhig, `${type}: Wasser anders`);
    assert.ok(glow(hell) > glow(ruhig), `${type}: Wasser leuchtet stärker`);
    t.state(st("switch.pool_pumpe", "off"));
    assert.ok(!t.bubbles() && t.waterMat() === ruhig, `${type}: aus`);
    for (const [id, s] of [["input_boolean.pool", "on"], ["climate.pool", "heat"], ["climate.pool", "on"]]) {
      t.state(st(id, s));
      assert.ok(t.bubbles(), `${id} ${s}`);
    }
    t.state(st("climate.pool", "off"));
    assert.ok(!t.bubbles(), "climate aus");
    // abgedeckt: in Betrieb ändert die Abdeckung nicht, Blasen bleiben unter ihr verborgen
    const zu = tub(type);
    zu.state(st("switch.pool_pumpe", "on"));
    assert.ok(zu.covered() && !zu.bubbles() && !zu.water(), `${type}: Betrieb abgedeckt`);
  }
});

test("Whirlpool: tubView – Feld, cover und Betrieb", async () => {
  const { tubView } = await import("../../custom_components/haus3d/frontend/furniture-tub.js");
  assert.deepEqual(tubView({}, null), { open: false, running: false });
  assert.deepEqual(tubView({ open: true }, null), { open: true, running: false });
  assert.deepEqual(tubView({ open: true }, st("cover.x", "closed", { current_position: 0 })), { open: false, running: false });
  assert.deepEqual(tubView({}, st("switch.x", "on")), { open: false, running: true });
  assert.deepEqual(tubView({ open: true }, st("climate.x", "heat_cool")), { open: true, running: true });
  assert.deepEqual(tubView({}, st("climate.x", "off", { hvac_action: "heating" })), { open: false, running: true });
});

test("Whirlpool: ausgeblendete Teile werden nicht angeklickt", () => {
  const t = tub("garden_hot_tub_acryl");
  const ray = new THREE.Raycaster(new THREE.Vector3(3, 0.3, 0), new THREE.Vector3(-1, 0, 0)); // von rechts durch die (ausgeblendete) offene Abdeckung
  t.g.updateMatrixWorld(true);
  assert.equal(ray.intersectObjects([t.g.getObjectByName("tub:cover_open")], true).length, 0);
  const o = tub("garden_hot_tub_acryl", "standard", { open: true });
  o.g.updateMatrixWorld(true);
  assert.ok(ray.intersectObjects([o.g.getObjectByName("tub:cover_open")], true).length > 0);
});

// ---------------------------------------------------------------- Randsteine

const ROOM = { id: "r", points: [[0, 0], [7, 0], [7, 5], [0, 5]] };
const TERRACE = [[1, -3.2], [7, -3.2], [7, -0.24], [1, -0.24]]; // Südkante liegt vor der Hauswand (Wanddicke 24 cm)
const SQUARE = [[0, 0], [4, 0], [4, 4], [0, 4]];
const FAR = SQUARE.map(([x, z]) => [x + 10, z]); // abseits des Hauses
const near = (a, b, e = 1e-9) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;

test("Randstein-Arten: fünf Arten mit den vorgegebenen Breiten und Höhen, Auswahl mit „keine“", async () => {
  const { KERB_CHOICES, KERB_KINDS, kerbSpec, kerbDefaultHeight } = await import("../../custom_components/haus3d/frontend/kerb.js");
  assert.deepEqual(KERB_CHOICES.map(([k]) => k), ["none", "concrete", "granite", "metal", "palisade", "paver"]);
  assert.deepEqual(KERB_CHOICES.map(([, n]) => n), ["keine", "Randstein Beton", "Granit-Randstein", "Rasenkante Metall", "Palisaden Holz", "Pflaster-Läufer"]);
  const w = (k) => KERB_KINDS[k].w;
  assert.deepEqual([w("concrete"), w("granite"), w("metal"), w("palisade"), w("paver")], [0.08, 0.1, 0.005, 0.1, 0.1]);
  assert.deepEqual([kerbDefaultHeight("concrete"), kerbDefaultHeight("metal"), kerbDefaultHeight("palisade")], [0.05, 0.02, 0.15]);
  assert.equal(KERB_KINDS.palisade.round, true);
  assert.equal(kerbSpec("none"), null);
  assert.equal(kerbSpec(undefined), null);
  assert.equal(kerbSpec("kaputt"), null);
  assert.equal(kerbSpec("concrete").h, 0.05);
  assert.equal(kerbSpec("concrete", { height: 0.12 }).h, 0.12);
  assert.equal(kerbSpec("concrete", { line: true }).h, 0.1); // Linie: 10 cm
  assert.equal(kerbSpec("concrete", { height: "x" }).h, 0.05);
  assert.equal(kerbSpec("metal", { width: 9 }).w, 0.5); // Breite begrenzt
});

test("Randstein-Kanten: Anzahl Stücke = freie Kanten, nichts an der Hauswand, Teilstrecken", async () => {
  const { kerbSegments, uncovered } = await import("../../custom_components/haus3d/frontend/kerb.js");
  // Viereck ohne Haus: vier Kanten
  const free = kerbSegments(SQUARE, []);
  assert.equal(free.length, 4);
  assert.ok(free.every((s) => Math.abs(s.len - 4) < 1e-9 && s.prev && s.next));
  // Terrasse vor dem Haus: die Kante an der Hauswand (Index 2) fällt weg, drei bleiben
  const t = kerbSegments(TERRACE, [ROOM]);
  assert.deepEqual(t.map((s) => s.i), [0, 1, 3]);
  assert.ok(!t.some((s) => s.i === 2));
  // die Enden an der Hauswand sind stumpf (keine Gehrung zur fehlenden Nachbarkante)
  assert.equal(t.find((s) => s.i === 1).next, null);
  assert.equal(t.find((s) => s.i === 3).prev, null);
  assert.ok(t.find((s) => s.i === 0).next && t.find((s) => s.i === 1).prev);
  // enge Toleranz (Wand 24 cm entfernt, Toleranz 15 cm): die Kante gilt als frei
  assert.equal(kerbSegments(TERRACE, [ROOM], { tol: 0.15 }).length, 4);
  // Fläche liegt bündig am Haus: auch dann keine Kante an der Wand
  assert.equal(kerbSegments([[1, -3], [7, -3], [7, 0], [1, 0]], [ROOM]).length, 3);
  // nur ein Teil einer Kante liegt am Haus: der Rest bleibt
  const part = kerbSegments([[0, -0.2], [10, -0.2], [10, -3], [0, -3]], [ROOM]);
  const rest = part.find((s) => s.i === 0);
  assert.ok(rest && Math.abs(rest.len - 2.96) < 0.1 && rest.a[0] > 6.9 && near(rest.b, [10, -0.2], 1e-6), JSON.stringify(rest));
  assert.deepEqual(uncovered([0, -0.2], [10, -0.2], [ROOM], 0.3).length, 1);
  // offene Linie: n − 1 Stücke, ohne Anschluss an den Enden
  const open = kerbSegments([[0, 0], [3, 0], [3, 2]], [], { closed: false });
  assert.equal(open.length, 2);
  assert.ok(open[0].prev === null && open[0].next && open[1].prev && open[1].next === null);
  // doppelte Punkte und der Schlusspunkt werden ignoriert
  assert.equal(kerbSegments([...SQUARE, SQUARE[0]], []).length, 4);
  assert.deepEqual(kerbSegments([[0, 0]], []), []);
});

test("Randstein-Kanten: Höhen je Eckpunkt werden entlang der Kante interpoliert", async () => {
  const { kerbSegments } = await import("../../custom_components/haus3d/frontend/kerb.js");
  const segs = kerbSegments(SQUARE, [], { heights: [0, 0.2, 0.4, 0.2] });
  assert.deepEqual(segs.map((s) => [s.ha, s.hb].map((v) => +v.toFixed(3))), [[0, 0.2], [0.2, 0.4], [0.4, 0.2], [0.2, 0]]);
  // Teilstrecke an der Hauswand: Höhe am neuen Ende liegt anteilig dazwischen
  const part = kerbSegments([[0, -0.2], [10, -0.2], [10, -3], [0, -3]], [ROOM], { heights: [0, 1, 1, 0] }).find((s) => s.i === 0);
  assert.ok(Math.abs(part.ha - 0.7) < 0.03 && Math.abs(part.hb - 1) < 1e-9, `${part.ha} ${part.hb}`);
  // Höhen in falscher Länge werden ignoriert
  assert.ok(kerbSegments(SQUARE, [], { heights: [1, 2] }).every((s) => s.ha === 0 && s.hb === 0));
});

test("Randstein-Ecken: Gehrung ohne Lücke, Breite bleibt, spitze Winkel werden stumpf", async () => {
  const { kerbCorners, kerbSegments } = await import("../../custom_components/haus3d/frontend/kerb.js");
  const segs = kerbSegments(SQUARE, []);
  const w = 0.1;
  segs.forEach((s, k) => {
    const c = kerbCorners(s, w);
    const n = kerbCorners(segs[(k + 1) % 4], w);
    assert.ok(near(c.L1, n.L0, 1e-9) && near(c.R1, n.R0, 1e-9), `Ecke ${k} schließt`);
    // Breite am Ende = w · √2 über die Ecke (Gehrung im rechten Winkel)
    assert.ok(Math.abs(Math.hypot(c.L1[0] - c.R1[0], c.L1[1] - c.R1[1]) - w * Math.SQRT2) < 1e-9);
  });
  // gerade Linie: keine Gehrung, Breite w
  const line = kerbSegments([[0, 0], [2, 0], [4, 0]], [], { closed: false });
  const c = kerbCorners(line[0], w);
  assert.ok(Math.abs(Math.hypot(c.L1[0] - c.R1[0], c.L1[1] - c.R1[1]) - w) < 1e-9);
  // Kehrtwende: stumpf statt riesiger Spitze
  const back = kerbSegments([[0, 0], [2, 0], [0, 0.01]], [], { closed: false });
  const b = kerbCorners(back[0], w);
  assert.ok(Math.hypot(b.L1[0] - b.R1[0], b.L1[1] - b.R1[1]) <= w + 1e-9);
});

/** Szene mit dem Nötigsten, um _buildOutdoor ohne Browser aufzurufen. */
function fakeScene(style = "standard") {
  const sc = Object.create(HouseScene.prototype);
  const mat = new THREE.MeshStandardMaterial();
  sc.outdoorMats = { lawn: mat, terrace: mat, path: mat, bed: mat, pool: mat };
  sc.mats = { gardenLine: null, railing: mat, railWood: mat, railGlass: mat, water: mat, flowers: [mat] };
  sc.furnMats = furnitureMaterials(style);
  sc.style = style;
  sc.building = { settings: {} };
  sc._texMat = (m) => m;
  return sc;
}
const floorOf = (outdoor) => ({ id: "eg", elevation: 0, height: 2.5, rooms: [ROOM], outdoor });
const kerbOf = (group) => group.children.find((c) => c.name === "kerb");
const boxOf = (o) => new THREE.Box3().setFromObject(o);

test("Randstein an der Gartenfläche: Segmente = freie Kanten, auf der Fläche, nicht an der Hauswand, beide Stile", () => {
  for (const style of STYLES) {
    const sc = fakeScene(style);
    const area = { id: "t", type: "terrace", points: TERRACE, edge: "concrete" };
    const g = HouseScene.prototype._buildOutdoor.call(sc, area, 0, floorOf([area]));
    const k = kerbOf(g);
    assert.ok(k, `${style}: Randstein da`);
    assert.equal(k.userData.kerb.segments, 3, `${style}: drei freie Kanten`);
    const b = boxOf(k);
    // Lage: innerhalb der Fläche samt halber Breite, an der Hauswand-Seite endet er an der Kante der Terrasse (z = −0,24)
    assert.ok(b.min.x >= 1 - 0.04 - 1e-6 && b.max.x <= 7 + 0.04 + 1e-6 && b.min.z >= -3.2 - 0.04 - 1e-6, `${style}: ${b.min.toArray()} … ${b.max.toArray()}`);
    assert.ok(b.max.z <= -0.24 + 1e-6, `${style}: nichts vor der Hauswand (${b.max.z})`);
    // Höhe: Terrasse liegt auf −0,035 + 0,1; Randstein Beton 5 cm darüber, im Boden verankert
    assert.ok(Math.abs(b.max.y - (-0.035 + 0.1 + 0.05)) < 1e-6, `${style}: Oberkante ${b.max.y}`);
    assert.ok(b.min.y < 0.1 - 0.035 - 0.05, `${style}: Fuß im Boden`);
    // Cyberpunk: Neonkanten dazu
    const lines = k.children.filter((c) => c.isLineSegments).length;
    assert.equal(lines > 0, style === "cyber", `${style}: Kanten`);
  }
});

test("Randstein an der Gartenfläche: ohne edge oder bei „none“ nichts, Hecke/Zaun/Balkon nie; Höhe edge_h überschreibt", () => {
  const sc = fakeScene();
  const build = (extra, type = "lawn") => {
    const area = { id: "x", type, points: FAR, ...extra };
    return HouseScene.prototype._buildOutdoor.call(sc, area, 0, floorOf([area]));
  };
  assert.equal(kerbOf(build({})), undefined);
  assert.equal(kerbOf(build({ edge: "none" })), undefined);
  assert.equal(kerbOf(build({ edge: "kaputt" })), undefined);
  for (const type of ["hedge", "fence"]) assert.equal(kerbOf(build({ edge: "concrete" }, type)), undefined, type);
  assert.equal(kerbOf(build({ edge: "concrete" })).userData.kerb.segments, 4);
  // Rasen liegt auf −0,035: Beton 5 cm → 0,015; eigene Höhe 12 cm → 0,085
  assert.ok(Math.abs(boxOf(kerbOf(build({ edge: "concrete" }))).max.y - 0.015) < 1e-6);
  assert.ok(Math.abs(boxOf(kerbOf(build({ edge: "concrete", edge_h: 0.12 }))).max.y - 0.085) < 1e-6);
  // Blockzahl: 4 Kanten × 4 m = 16 Steine à 1 m (Fuge alle 1 m); Läufer 0,15 m → 27 je Kante
  assert.equal(kerbOf(build({ edge: "concrete" })).userData.kerb.blocks, 16);
  assert.equal(kerbOf(build({ edge: "paver" })).userData.kerb.blocks, 4 * Math.round(4 / 0.15));
  // Rasenkante Metall: durchgehend, ein Stück je Kante
  assert.equal(kerbOf(build({ edge: "metal" })).userData.kerb.blocks, 4);
});

test("Randstein an der Gartenfläche: alle fünf Arten bauen in beiden Stilen, Breiten stimmen", () => {
  for (const style of STYLES) {
    const sc = fakeScene(style);
    for (const [kind, w] of [["concrete", 0.08], ["granite", 0.1], ["metal", 0.005], ["palisade", 0.1], ["paver", 0.1]]) {
      const area = { id: "x", type: "path", points: [[10, 0], [16, 0], [16, 3], [10, 3]], edge: kind };
      const k = kerbOf(HouseScene.prototype._buildOutdoor.call(sc, area, 0, floorOf([area])));
      assert.ok(k && k.children.some((c) => c.isMesh), `${style} ${kind}`);
      const b = boxOf(k);
      // Gesamtbreite über die Fläche: 6 m plus je eine halbe Kantenbreite (Palisaden: Pfahlrand) – nie mehr als eine Breite
      assert.ok(b.max.x - b.min.x >= 6 && b.max.x - b.min.x <= 6 + w + 0.02, `${style} ${kind}: ${b.max.x - b.min.x}`);
      for (const c of k.children) if (c.isMesh) for (const v of c.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
    }
  }
});

test("Randstein am Hang: Kante folgt den Eckhöhen (Rasen mit heights), flache Fläche mit Höhen liegt auf der Mitte", () => {
  const sc = fakeScene();
  const lawn = { id: "h", type: "lawn", points: FAR, edge: "concrete", heights: [0, 0, 0.3, 0.3] };
  const k = kerbOf(HouseScene.prototype._buildOutdoor.call(sc, lawn, 0, floorOf([lawn])));
  assert.equal(k.userData.kerb.segments, 4);
  const b = boxOf(k);
  // höchste Stelle: Eckhöhe 0,3 − 0,035 + 5 cm; tiefste Oberkante an den Ecken ohne Höhe (−0,035 + 5 cm)
  assert.ok(Math.abs(b.max.y - (0.3 - 0.035 + 0.05)) < 1e-6, `${b.max.y}`);
  // die Oberkante steigt entlang der Kante von (4,0) nach (4,4): in der Mitte etwa halb so hoch
  const mid = [];
  const pos = k.children.find((c) => c.isMesh).geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - 14.04) < 1e-6 && Math.abs(pos.getZ(i) - 2) < 0.6 && pos.getY(i) > -0.01) mid.push(pos.getY(i));
  assert.ok(mid.length && Math.max(...mid) > 0.05 && Math.max(...mid) < 0.3, `${mid}`);
  // Terrasse mit Höhen (eigene Plattenhöhe): flach auf dem Mittelwert
  const t = { id: "t", type: "terrace", points: FAR, edge: "granite", heights: [0.1, 0.1, 0.3, 0.3] };
  const kt = kerbOf(HouseScene.prototype._buildOutdoor.call(sc, t, 0, floorOf([t])));
  assert.ok(Math.abs(boxOf(kt).max.y - (-0.035 + 0.1 + 0.2 + 0.06)) < 1e-6, `${boxOf(kt).max.y}`);
});

test("Randstein-Linie: Gartenfläche vom Typ kerb entlang der Mittellinie, Breite aus der Linie, Standardhöhe 10 cm", () => {
  const sc = fakeScene();
  const area = { id: "r", type: "kerb", points: [[0, 0], [3, 0], [3, 0.08], [0, 0.08]], line: { points: [[0, 0], [3, 0], [3, 2]], width: 0.08 }, edge: "concrete" };
  const g = HouseScene.prototype._buildOutdoor.call(sc, area, 0, floorOf([area]));
  const k = kerbOf(g);
  assert.equal(k.userData.kerb.segments, 2);
  assert.equal(k.userData.kerb.blocks, 3 + 2); // 3 m + 2 m, Steine à 1 m
  const b = boxOf(k);
  assert.ok(Math.abs(b.max.y - (-0.035 + 0.1)) < 1e-6, `${b.max.y}`);
  assert.ok(Math.abs(b.max.x - 3.04) < 1e-6 && Math.abs(b.min.z + 0) < 0.05 + 1e-6, `${b.min.toArray()} … ${b.max.toArray()}`);
  // Gehrung: die Ecke bei (3, 0) ist sauber gefüllt (Außenecke bei 3,04 / −0,04)
  const pos = k.children.find((c) => c.isMesh).geometry.attributes.position;
  let corner = false;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - 3.04) < 1e-6 && Math.abs(pos.getZ(i) + 0.04) < 1e-6) corner = true;
  assert.ok(corner, "Außenecke der Gehrung");
  // ohne Linie (Ecken gezogen): Kante rund um das Polygon
  const poly = { id: "p", type: "kerb", points: FAR, edge: "granite" };
  assert.equal(kerbOf(HouseScene.prototype._buildOutdoor.call(sc, poly, 0, floorOf([poly]))).userData.kerb.segments, 4);
  // Art fehlt: Beton
  const plain = { id: "q", type: "kerb", points: SQUARE, line: { points: [[0, 0], [2, 0]], width: 0.1 } };
  assert.equal(kerbOf(HouseScene.prototype._buildOutdoor.call(sc, plain, 0, floorOf([plain]))).userData.kerb.kind, "concrete");
});

test("Linie: Randstein steht neben Weg, Hecke, Zaun, Mauer; Zeichnen legt eine Randstein-Linie an", async () => {
  const { LINE_KINDS, LineMethods } = await import("../../custom_components/haus3d/frontend/editor-lines.js");
  assert.deepEqual(LINE_KINDS.map(([k]) => k), ["path", "hedge", "fence", "wall", "kerb"]);
  assert.deepEqual(LINE_KINDS.find(([k]) => k === "kerb"), ["kerb", "Randstein", 0.08, 0.1]);
  const ed = {
    ...LineMethods,
    draft: { line: [[0, 0], [3, 0], [3, 2]] },
    b: { floors: [] },
    fl: { outdoor: [], walls: [] },
    change(fn) {
      fn(this.fl);
    },
    _toast(t) {
      this.toast = t;
    },
    renderBar() {},
    render() {},
    renderProps() {},
  };
  Object.assign(ed._lineOpts(), { kind: "kerb", width: 0.08, height: 0.1, edge: "concrete" });
  ed._finishLine();
  const a = ed.fl.outdoor[0];
  assert.equal(ed.fl.outdoor.length, 1);
  assert.equal(a.type, "kerb");
  assert.deepEqual([a.edge, a.edge_h, a.line.width, a.line.points.length], ["concrete", 0.1, 0.08, 3]);
  assert.ok(a.points.length >= 4 && a.id.startsWith("randstein_"));
  assert.ok(!("height" in a) && !("fence_style" in a));
  assert.equal(ed.fl.walls.length, 0);
  assert.match(ed.toast, /^Randstein: 5,00 m$/);
  assert.deepEqual([ed.sel.kind, ed.sel.id, ed.tool], ["outdoor", a.id, "select"]);
  // Art Granit ohne eigene Höhe: Standardhöhe der Art als Linie
  ed.draft = { line: [[0, 0], [2, 0]] };
  Object.assign(ed.lineOpts, { edge: "granite", width: 0.1, height: 0 });
  ed._finishLine();
  assert.equal(ed.fl.outdoor[1].edge_h, 0.12);
  // Eigenschaften der Linie: Art, Breite, Höhe; das Werkzeug zeigt die Art nur bei Randstein
  assert.match(ed._lineAreaFields(a), /Randstein-Art[\s\S]*data-la="edge_h"/);
  const el = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  ed._lineToolProps(el);
  assert.match(el.innerHTML, /data-lo="edge"[\s\S]*Granit-Randstein/);
  ed.lineOpts.kind = "fence";
  ed._lineToolProps(el);
  assert.doesNotMatch(el.innerHTML, /data-lo="edge"/);
});

test("Gartenfläche: Feld „Randstein / Kante“ mit Höhe in cm, nicht bei Hecke, Zaun, Balkon", async () => {
  const { LineMethods } = await import("../../custom_components/haus3d/frontend/editor-lines.js");
  const ed = { ...LineMethods };
  const html = ed._kerbFields({ id: "x", type: "lawn" });
  assert.match(html, /Randstein \/ Kante/);
  assert.match(html, /Höhe über Fläche \(cm\)/);
  for (const n of ["keine", "Randstein Beton", "Granit-Randstein", "Rasenkante Metall", "Palisaden Holz", "Pflaster-Läufer"]) assert.ok(html.includes(n), n);
  assert.match(html, /data-kerb="edge_h"[^>]*disabled/); // ohne Art keine Höhe
  const beton = ed._kerbFields({ id: "x", type: "terrace", edge: "palisade", edge_h: 0.2 });
  assert.match(beton, /<option value="palisade" selected>/);
  assert.match(beton, /value="20"/);
  assert.match(beton, /placeholder="15"/);
  assert.ok(!/disabled/.test(beton));
  for (const type of ["hedge", "fence", "balcony"]) assert.equal(ed._kerbFields({ id: "x", type }), "", type);
  assert.equal(ed._kerbFields({ id: "x", type: "kerb", line: { points: [], width: 0.1 } }), "");
  // Binden: Art wählen setzt edge und entfernt die alte Höhe, „keine“ entfernt beides, Höhe in cm → m
  const area = { id: "x", type: "lawn", edge: "concrete", edge_h: 0.2 };
  const handlers = [];
  const inputs = [{ dataset: { kerb: "edge" }, value: "granite" }, { dataset: { kerb: "edge_h" }, value: "7.5" }];
  inputs.forEach((i) => (i.addEventListener = (_, fn) => handlers.push([i, fn])));
  Object.assign(ed, { change: (fn) => fn({ outdoor: [area] }), renderProps() {} });
  ed._bindKerbFields({ querySelectorAll: () => inputs }, area);
  handlers[0][1]();
  assert.deepEqual([area.edge, "edge_h" in area], ["granite", false]);
  handlers[1][1]();
  assert.equal(area.edge_h, 0.075);
  inputs[0].value = "none";
  handlers[0][1]();
  assert.deepEqual([area.edge, area.edge_h], [undefined, undefined]);
});

// ---------------------------------------------------------------- Zusatzfeld Abdeckung

test("Feld „Abdeckung“: nur an Whirlpools, wählt abgedeckt/offen", async () => {
  const { GARDEN_FIELDS } = await import("../../custom_components/haus3d/frontend/fields-garden.js");
  assert.equal(GARDEN_FIELDS.html({ type: "sofa" }, {}), "");
  assert.equal(GARDEN_FIELDS.html({ type: "garden_chair" }, {}), "");
  for (const type of ["hot_tub", "garden_hot_tub_acryl"]) {
    const zu = GARDEN_FIELDS.html({ type, open: false }, {});
    assert.match(zu, /Abdeckung/);
    assert.match(zu, /<option value="0" selected>abgedeckt/);
    assert.match(zu, /<option value="1">offen/);
    assert.match(zu, /Entität/);
    assert.match(GARDEN_FIELDS.html({ type, open: true }, {}), /<option value="1" selected>offen/);
  }
  const handlers = [];
  const sel = { addEventListener: (_, fn) => handlers.push(fn) };
  const m = { id: "w", type: "hot_tub" };
  GARDEN_FIELDS.bind({ querySelector: (q) => (q === "[data-garden-open]" ? sel : null) }, m, {}, (fn) => fn(m));
  handlers[0]({ target: { value: "1" } });
  assert.equal(m.open, true);
  handlers[0]({ target: { value: "0" } });
  assert.ok(!("open" in m));
  // Elemente ohne das Feld: Binden ist harmlos
  GARDEN_FIELDS.bind({ querySelector: () => null }, m, {}, () => assert.fail("kein Feld"));
});
