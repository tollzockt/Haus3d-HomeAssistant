// O2: Info-Hologramm über einem Gerät, wenn sein Raum angetippt ist (live, weg beim Tipp ins Leere bzw.
// Etagenwechsel); Lichtschacht vor einem Kellerfenster; Raster-Felder (Würfelregal, Solar); Abzweigdose ohne
// Gegenstand; Katalog „Einrichten“ mit 3D-Drucker.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("o2", "");
const E = (fn, arg) => pg.evaluate(fn, arg);

// Grundriss im Panel anpassen: Gerät mit Werten im Wohnzimmer, Lichtschacht am Kellerfenster
const sensor = await E(() => Object.keys(window.hass.states).find((id) => id.startsWith("sensor.") && window.hass.states[id].attributes?.unit_of_measurement === "°C"));
await E((sensor) => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  const room = eg.rooms.find((r) => r.id === "wohnzimmer") ?? eg.rooms[0];
  const xs = room.points.map((q) => q[0]);
  const zs = room.points.map((q) => q[1]);
  eg.furniture.push({ id: "m_drucker", type: "printer_3d", x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, rotation: 0, info: [{ entity: sensor, name: "Düse" }] });
  window.__room = room.id;
  const kg = b.floors.find((f) => f.id === "kg");
  kg.openings.find((o) => o.id === "hobby_fenster").well = { depth: 0.6, width: null };
  p._setBuilding(b, p._revision, { keepCamera: true });
}, sensor);
await pg.waitForTimeout(500);

// --- Hologramm: Raum antippen → Tafel mit Wert; Wert ändert sich live; Tipp ins Leere → weg
await E(() => {
  window.panel._setFilter("eg");
  window.panel._focusRoom({ floorId: "eg", roomId: window.__room });
});
await pg.waitForTimeout(1200);
const holo = await E(() => {
  const el = window.panel.shadowRoot.querySelector(".holo");
  return { el: !!el, head: el?.querySelector(".holohead")?.textContent, line: el?.querySelector(".hololine span")?.textContent, value: el?.querySelector(".hololine b")?.textContent, shown: el ? el.style.display !== "none" : false };
});
t.results.holo = holo;
t.check(holo.el && holo.shown && holo.head === "3D-Drucker" && holo.line === "Düse" && /°C$/.test(holo.value ?? ""), `Hologramm: ${JSON.stringify(holo)}`);
await t.shot(pg, "o2-hologramm.png");
await E((sensor) => {
  const h = window.hass;
  window.hass = { ...h, states: { ...h.states, [sensor]: { ...h.states[sensor], state: "215.5" } } };
  window.panel.hass = window.hass;
}, sensor);
await pg.waitForTimeout(300);
const live = await E(() => window.panel.shadowRoot.querySelector(".holo .hololine b")?.textContent);
t.check(live === "216 °C", `Hologramm live: ${live}`);
await E(() => window.panel._setFilter("kg"));
t.check(!(await E(() => !!window.panel.shadowRoot.querySelector(".holo"))), "Hologramm bleibt beim Etagenwechsel");
await E(() => window.panel._setFilter("eg"));
await E(() => window.panel._selectRoom({ floorId: "eg", roomId: window.__room }));
await pg.waitForTimeout(300);
t.check(await E(() => !!window.panel.shadowRoot.querySelector(".holo")), "Hologramm fehlt beim Raumfenster");
await E(() => window.panel._selectRoom(null));
t.check(!(await E(() => !!window.panel.shadowRoot.querySelector(".holo"))), "Hologramm bleibt nach dem Schließen");

// --- Lichtschacht im 3D-Modell
const well = await E(() => {
  let n = 0;
  window.panel._scene.scene.traverse((o) => o.userData?.lightWell && n++);
  return n;
});
t.check(well === 1, `Lichtschacht: ${well}`);
await E(() => window.panel._setFilter("kg"));
await pg.waitForTimeout(600);
await t.shot(pg, "o2-lichtschacht.png");

// --- Editor: Raster-Felder, Hologramm-Feld, Lichtschacht-Feld, Abzweigdose
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(400);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
const fields = await E(() => {
  const e = window.panel._editor;
  e.change((fl) => {
    fl.furniture.push({ id: "m_regal", type: "ikea_kallax_2x2", x: 1, z: 1, rotation: 0 }, { id: "m_pv", type: "pv_flat_south", x: 3, z: 1, rotation: 0 });
  });
  e.sel = { kind: "furniture", id: "m_regal" };
  e.renderProps();
  return { cols: !!e.props.querySelector("[data-grid=cols]"), info: !!e.props.querySelector("[data-info-add]") };
});
t.check(fields.cols && fields.info, `Felder am Regal: ${JSON.stringify(fields)}`);
await pg.locator("haus3d-panel .ed-props [data-grid=cols]").fill("3");
await pg.locator("haus3d-panel .ed-props [data-grid=cols]").press("Tab");
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_pv" };
  e.renderProps();
});
await pg.locator("haus3d-panel .ed-props [data-grid=rows]").fill("2");
await pg.locator("haus3d-panel .ed-props [data-grid=rows]").press("Tab");
const grid = await E(() => Object.fromEntries(window.panel._editor.floor.furniture.filter((m) => ["m_regal", "m_pv"].includes(m.id)).map((m) => [m.id, [m.cols, m.rows, m.w, m.h ?? null, m.d ?? null]])));
t.results.raster = grid;
t.check(grid.m_regal[0] === 3 && grid.m_regal[2] === 1.12 && grid.m_pv[1] === 2 && grid.m_pv[4] === 3.4, `Raster: ${JSON.stringify(grid)}`);
// Info-Wert hinzufügen
await pg.locator("haus3d-panel .ed-props [data-info-add]").click();
await pg.locator('haus3d-panel .ed-props [data-info-e="0"]').fill("sensor.pv_leistung");
await pg.locator('haus3d-panel .ed-props [data-info-e="0"]').press("Tab");
const info = await E(() => window.panel._editor.floor.furniture.find((m) => m.id === "m_pv").info);
t.check(info?.length === 1 && info[0].entity === "sensor.pv_leistung", `Info-Wert: ${JSON.stringify(info)}`);
// Abzweigdose ohne Gegenstand
await pg.locator("haus3d-panel .ed-bar button[data-tool=node]").click();
const kinds = await E(() => [...window.panel._editor.props.querySelectorAll("[data-nk]")].map((b) => b.dataset.nk));
t.check(kinds.includes("abzweig"), `Verteiler-Arten: ${kinds}`);
await pg.locator('haus3d-panel .ed-props [data-nk="abzweig"]').click();
const [sx, sy] = await E(() => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  return [r.left + e.tx + 2 * e.scale, r.top + e.tz + 2 * e.scale];
});
await pg.mouse.click(sx, sy);
await pg.waitForTimeout(150);
await pg.locator("haus3d-panel .ed-props [data-nmodel]").uncheck();
const node = await E(() => window.panel._editor.floor.nodes.at(-1));
t.check(node.kind === "abzweig" && node.model === false, `Abzweigdose: ${JSON.stringify(node)}`);
// Katalog: Technik mit 3D-Drucker (Suche)
await pg.locator("haus3d-panel .ed-bar button[data-tool=furniture]").click();
await pg.locator("haus3d-panel .ed-props .search").fill("3D-Drucker");
t.check((await pg.locator("haus3d-panel .ed-props .tile[data-furn=printer_3d]").count()) === 1, "3D-Drucker im Katalog");
await t.shot(pg, "o2-editor.png");
await t.done();
