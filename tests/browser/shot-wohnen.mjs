// Wohnen, Küche, Kamin, Vorhänge: Modelle im 3D-Garten neben dem Haus (Deko, Pflanzen, Tiere, Kinderzimmer, Kamine, Vorhänge),
// Feuer und Vorhang folgen verknüpften Entitäten (ohne Neuaufbau), Zusatzfelder „Feuer an“ und „Geöffnet (%)“ im Editor, Katalogsuche.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("wohnen", "");
const E = (fn, arg) => pg.evaluate(fn, arg);

// Zwei Reihen Dekor/Tiere/Kinder (A) und eine Reihe Kamine plus Vorhänge (B), östlich vom Haus
const A = ["home_piano", "home_reading_chair", "home_rocking_chair", "home_monstera", "home_ficus", "home_kentia", "home_olive", "home_aquarium", "home_cat_tree", "home_dog_bed", "home_crib", "home_tipi", "home_kids_table", "home_rocking_horse"];
const B = [
  { id: "w_ofen_an", type: "home_stove_wood", entity: "climate.bad" }, // Zustand heat: Feuer an
  { id: "w_ofen_aus", type: "home_stove_wood", entity: "light.kueche" }, // Zustand off: Feuer aus
  { id: "w_ofen_feld", type: "home_stove_pellet", fire: true },
  { id: "w_kamin", type: "home_fireplace_open", entity: "switch.kaffeemaschine" }, // on
  { id: "w_eck", type: "home_fireplace_corner", fire: true },
  { id: "w_kachel", type: "home_stove_tile", fire: true },
  { id: "w_vh_cover", type: "home_curtain_pair", entity: "cover.wohnzimmer_rollladen" }, // Position 40
  { id: "w_vh_zu", type: "home_curtain_pair", open: 0 },
  { id: "w_vh_auf", type: "home_curtain_loops" },
  { id: "w_store", type: "home_sheer", open: 30 },
  { id: "w_raff", type: "home_roman_blind", open: 0, mount_y: 0.8 },
];
const place = (pg) =>
  pg.evaluate(([A, B]) => {
    const p = window.panel;
    const b = structuredClone(p._building);
    const eg = b.floors.find((f) => f.id === "eg");
    const x0 = Math.max(...eg.rooms.flatMap((r) => r.points.map((q) => q[0]))) + 3;
    A.forEach((type, i) => eg.furniture.push({ id: `w_a${i}`, type, x: x0 + (i % 7) * 1.6, z: 0 + Math.floor(i / 7) * 2.2, rotation: 0, mount_y: 0 }));
    B.forEach((it, i) => eg.furniture.push({ x: x0 + (i % 6) * 2.2, z: 6 + Math.floor(i / 6) * 3.4, rotation: 0, mount_y: 0, ...it }));
    p._setBuilding(b, p._revision, { keepCamera: true });
    return x0;
  }, [A, B]);

const x0 = await place(pg);
await pg.waitForTimeout(900);

// --- Wurzeln der Modelle in der Szene finden; Kamera auf eine Gruppe richten
const roots = () =>
  E(async () => {
    const sc = window.panel._scene;
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const out = {};
    sc.scene.traverse((o) => {
      const id = o.userData.furniture;
      if (id?.startsWith?.("w_") && o.parent?.userData.furniture !== id && !o.userData.blob && (o.userData.onState || o.userData.bulbs)) {
        const w = (c) => {
          if (!c) return null;
          const box = new THREE.Box3().setFromObject(c, true);
          return box.max.x - box.min.x;
        };
        out[id] = { uuid: o.uuid, flames: o.userData.flames ? o.userData.flames.visible : null, width: w(o.userData.curtain?.parts?.[0]), height: o.userData.curtain ? (() => { const b2 = new THREE.Box3().setFromObject(o.userData.curtain.parts[0], true); return b2.max.y - b2.min.y; })() : null };
      }
    });
    return out;
  });
const look = (ids, dir = [0.9, 0.55, 1.4], dist = 1.0) =>
  E(
    async ([ids, dir, dist]) => {
      const sc = window.panel._scene;
      const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
      const box = new THREE.Box3();
      sc.scene.traverse((o) => ids.includes(o.userData.furniture) && o.isMesh && box.expandByObject(o));
      const c = box.getCenter(new THREE.Vector3());
      const r = box.getSize(new THREE.Vector3()).length() * dist;
      sc.controls.target.copy(c);
      sc.camera.position.set(c.x + dir[0] * r, c.y + dir[1] * r, c.z + dir[2] * r);
      sc.controls.update();
      sc._dirty = true;
      sc._kick?.();
    },
    [ids, dir, dist],
  );

let r = await roots();
t.results.vorher = r;
t.check(r.w_ofen_an?.flames === true, `Ofen an der Heizung (heat): ${JSON.stringify(r.w_ofen_an)}`);
t.check(r.w_ofen_aus?.flames === false, `Ofen am ausgeschalteten Licht: ${JSON.stringify(r.w_ofen_aus)}`);
t.check(r.w_ofen_feld?.flames === true && r.w_eck?.flames === true && r.w_kachel?.flames === true, "Feld „Feuer an“ ohne Entität");
t.check(r.w_kamin?.flames === true, `Kamin am Schalter (on): ${JSON.stringify(r.w_kamin)}`);
// Vorhang an der Rollladen-Position 40 liegt zwischen „ganz zu“ und „offen“
t.check(r.w_vh_zu.width > 1.0 && r.w_vh_auf.width < 0.5, `Breite zu ${r.w_vh_zu.width} / offen ${r.w_vh_auf.width}`);
t.check(r.w_vh_cover.width < r.w_vh_zu.width - 0.1 && r.w_vh_cover.width > r.w_vh_auf.width + 0.05, `Breite bei Position 40: ${r.w_vh_cover.width}`);
t.check(r.w_raff.height > 1.1, `Raffrollo zu (0 %): Höhe ${r.w_raff.height}`);

await look(A.slice(0, 7).map((_, i) => `w_a${i}`), [0.55, 0.6, 1.3], 0.9);
await pg.waitForTimeout(2800);
await t.shot(pg, "wohnen-deko.png");
await look(A.slice(7).map((_, i) => `w_a${i + 7}`), [0.55, 0.6, 1.3], 0.9);
await pg.waitForTimeout(2800);
await t.shot(pg, "wohnen-tiere-kinder.png");
await look(B.slice(0, 6).map((b) => b.id), [0.3, 0.45, 1.4], 0.9);
await pg.waitForTimeout(2800);
await t.shot(pg, "wohnen-kamine.png");
await look(B.slice(6).map((b) => b.id), [0.3, 0.3, 1.5], 0.9);
await pg.waitForTimeout(2800);
await t.shot(pg, "wohnen-vorhaenge.png");

// --- Zustände ändern: Heizung aus, Schalter aus, Rollladen ganz offen – dieselben Objekte, Flammen aus, Vorhang offen
await E(() => {
  const p = window.panel;
  const h = p.hass;
  const s = h.states;
  p.hass = {
    ...h,
    states: {
      ...s,
      "climate.bad": { ...s["climate.bad"], state: "off", attributes: { ...s["climate.bad"].attributes, hvac_action: "off" } },
      "switch.kaffeemaschine": { ...s["switch.kaffeemaschine"], state: "off" },
      "light.kueche": { ...s["light.kueche"], state: "on" },
      "cover.wohnzimmer_rollladen": { ...s["cover.wohnzimmer_rollladen"], state: "open", attributes: { ...s["cover.wohnzimmer_rollladen"].attributes, current_position: 100 } },
    },
  };
});
await pg.waitForTimeout(700);
const r2 = await roots();
t.results.nachher = r2;
t.check(r2.w_ofen_an.flames === false, `Heizung aus: Feuer aus ${JSON.stringify(r2.w_ofen_an)}`);
t.check(r2.w_ofen_aus.flames === true, `Licht an: Feuer an ${JSON.stringify(r2.w_ofen_aus)}`);
t.check(r2.w_kamin.flames === false, "Schalter aus: Kamin ohne Feuer");
t.check(r2.w_ofen_feld.flames === true, "Ofen ohne Entität bleibt bei seinem Feld");
t.check(Math.abs(r2.w_vh_cover.width - r.w_vh_auf.width) < 0.05, `Rollladen 100: Vorhang offen ${r2.w_vh_cover.width}`);
t.check(Object.keys(r).every((id) => r[id].uuid === r2[id]?.uuid), "Modelle wurden bei der Zustandsänderung neu gebaut");

// --- Editor: Zusatzfelder und Katalogsuche
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(400);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.locator("haus3d-panel .ed-bar button[data-tool=furniture]").click();
await pg.locator("haus3d-panel .ed-props .search").fill("Vorhang");
const tiles = await E(() => [...window.panel._editor.props.querySelectorAll(".tile")].map((x) => x.dataset.furn));
t.results.suche = tiles;
t.check(tiles.length >= 3 && tiles.every((k) => k.startsWith("home_")), `Suche „Vorhang“: ${tiles}`);
await pg.locator("haus3d-panel .ed-props .search").fill("Kaminofen");
const tiles2 = await E(() => [...window.panel._editor.props.querySelectorAll(".tile")].map((x) => x.dataset.furn));
t.check(tiles2.includes("home_stove_wood") && tiles2.includes("home_stove_flue"), `Suche „Kaminofen“: ${tiles2}`);
await pg.locator("haus3d-panel .ed-bar button[data-tool=select]").click();
const select = (id) =>
  E((id) => {
    const e = window.panel._editor;
    e.sel = { kind: "furniture", id };
    e.render();
    e.renderProps();
  }, id);
const item = (id) => E((id) => window.panel._editor.floor.furniture.find((m) => m.id === id), id);
const field = (sel) => E((sel) => !!window.panel._editor.props.querySelector(sel), sel);

await select("w_ofen_aus");
t.check(await field("[data-home-fire]"), "Feld „Feuer an“ am Ofen fehlt");
t.check(!(await field("[data-home-open]")), "Feld „Geöffnet“ am Ofen sollte fehlen");
const txt = await E(() => window.panel._editor.props.textContent);
t.check(txt.includes("Feuer an") && txt.includes("Vorrang"), "Beschriftung und Hinweis zu „Feuer an“");
await pg.locator("haus3d-panel .ed-props [data-home-fire]").check();
t.check((await item("w_ofen_aus")).fire === true, "Häkchen setzt fire");
await select("w_vh_zu");
t.check((await field("[data-home-open]")) && !(await field("[data-home-fire]")), "Feld „Geöffnet (%)“ am Vorhang");
const vtxt = await E(() => window.panel._editor.props.textContent);
t.check(vtxt.includes("Geöffnet (%)") && vtxt.includes("cover"), "Hinweis zu „Geöffnet (%)“");
await pg.locator("haus3d-panel .ed-props [data-home-open]").fill("60");
await pg.locator("haus3d-panel .ed-props [data-home-open]").press("Tab");
t.check((await item("w_vh_zu")).open === 60, `Prozent gesetzt: ${JSON.stringify((await item("w_vh_zu")).open)}`);
await pg.locator("haus3d-panel .ed-props [data-home-open]").fill("999");
await pg.locator("haus3d-panel .ed-props [data-home-open]").press("Tab");
t.check((await item("w_vh_zu")).open === 100, "Prozent auf 100 begrenzt");
await select("w_a3");
t.check(!(await field("[data-home-fire]")) && !(await field("[data-home-open]")), "Pflanze ohne Zusatzfelder");
await select("w_vh_zu");
await t.shot(pg, "wohnen-editor.png");

// Typwechsel Ofen → Vorhang zeigt sofort das passende Feld
await select("w_ofen_feld");
await pg.locator("haus3d-panel .ed-props [data-m=type]").selectOption("home_sheer");
t.check(await field("[data-home-open]"), "Typwechsel zeigt „Geöffnet (%)“");
await t.done();
