// Solarzaun: drei Varianten im Garten (senkrecht, Zaunmatte, Sichtschutz), einer schräg mit gedrehtem
// Kontaktschatten; Katalog-Suche, Raster „Module breit/hoch“, Modullage quer/hochkant, Hinweis mit kWp,
// Typwechsel zeigt sofort die neuen Felder; am Tablet trifft ein Tipp neben dem dünnen Zaun.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);

/** Vier Zäune rechts neben dem Haus in die EG-Daten des Panels legen. */
const addFences = (pg) =>
  pg.evaluate(() => {
    const p = window.panel;
    const b = structuredClone(p._building);
    const eg = b.floors.find((f) => f.id === "eg");
    const x = Math.max(...eg.rooms.flatMap((r) => r.points.map((q) => q[0]))) + 2;
    eg.furniture.push(
      { id: "m_sz1", type: "pv_fence_vertical", x, z: 1.5, rotation: 90 },
      { id: "m_sz2", type: "pv_fence_mesh", x, z: 5.5, rotation: 90 },
      { id: "m_sz3", type: "pv_fence_privacy", x, z: 9.5, rotation: 90 },
      { id: "m_sz4", type: "pv_fence_vertical", x: x + 4, z: 5.5, rotation: 45, cols: 4, w: 7.04 },
    );
    p._setBuilding(b, p._revision, { keepCamera: true });
    return x;
  });

// --- 3D: Module als Gruppen, gedrehter, schmaler Kontaktschatten am schrägen Zaun
const pg = await t.page("solarzaun", "?garden");
const E = (fn, arg) => pg.evaluate(fn, arg);
const fx = await addFences(pg);
await pg.waitForTimeout(800);
const model = await E(async () => {
  const sc = window.panel._scene;
  const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
  const roots = {};
  const blobs = {};
  sc.scene.traverse((o) => {
    const id = o.userData.furniture;
    if (id?.startsWith?.("m_sz") && o.parent?.userData.furniture !== id && !o.userData.blob) roots[id] = o;
    if (o.userData.blob && String(o.userData.blobOf ?? "").startsWith("m_sz")) blobs[o.userData.blobOf] = o;
  });
  const out = {};
  for (const [id, o] of Object.entries(roots)) {
    const b = blobs[id];
    out[id] = { modules: o.children.filter((c) => c.isGroup).length, blob: b ? { ry: b.rotation.y, sx: b.scale.x, sz: b.scale.z } : null };
  }
  // Kamera auf die Zäune
  const box = new THREE.Box3();
  for (const o of Object.values(roots)) box.expandByObject(o);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length();
  sc.controls.target.copy(c);
  sc.camera.position.set(c.x - r * 0.65, c.y + r * 0.5, c.z + r);
  sc.controls.update();
  sc._dirty = true;
  sc._kick?.();
  return out;
});
t.results.modell = model;
for (const id of ["m_sz1", "m_sz2", "m_sz3"]) t.check(model[id]?.modules === 2, `${id}: Module ${JSON.stringify(model[id])}`);
t.check(model.m_sz4?.modules === 4, `m_sz4: Module ${JSON.stringify(model.m_sz4)}`);
const blob = model.m_sz4?.blob;
t.check(
  blob && Math.abs(blob.ry + Math.PI / 4) < 1e-3 && Math.abs(blob.sx - (7.04 * 1.25 + 0.15)) < 0.1 && blob.sz < 0.6,
  `Kontaktschatten am schrägen Zaun: ${JSON.stringify(blob)}`,
);
await pg.waitForTimeout(1200);
await t.shot(pg, "solarzaun.png");

// --- Editor: Suche, Raster, Modullage, Hinweis, Typwechsel
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(400);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.locator("haus3d-panel .ed-bar button[data-tool=furniture]").click();
await pg.locator("haus3d-panel .ed-props .search").fill("Solarzaun");
const tiles = await E(() => [...window.panel._editor.props.querySelectorAll(".tile")].map((x) => x.dataset.furn));
t.results.suche = tiles;
t.check(tiles.length === 3 && tiles.every((k) => k.startsWith("pv_fence_")), `Suche „Solarzaun“: ${tiles}`);
await pg.locator("haus3d-panel .ed-bar button[data-tool=select]").click();
const select = (id) =>
  E((id) => {
    const e = window.panel._editor;
    e.sel = { kind: "furniture", id };
    e.render();
    e.renderProps();
  }, id);
const item = (id) => E((id) => window.panel._editor.floor.furniture.find((m) => m.id === id), id);
const props = () =>
  E(() => {
    const el = window.panel._editor.props;
    return {
      type: el.querySelector("[data-m=type]")?.value,
      rowsMax: el.querySelector("[data-grid=rows]")?.getAttribute("max"),
      orient: el.querySelector("[data-grid-orient]")?.value ?? null,
      note: el.querySelector(".gridnote")?.textContent ?? "",
    };
  });
await select("m_sz1");
const p1 = await props();
t.results.felder = p1;
t.check(p1.rowsMax === "3" && p1.orient === "landscape" && p1.note.includes("kWp") && p1.note.includes("Breite und Höhe"), `Felder am Solarzaun: ${JSON.stringify(p1)}`);
await pg.locator("haus3d-panel .ed-props [data-grid=rows]").fill("2");
await pg.locator("haus3d-panel .ed-props [data-grid=rows]").press("Tab");
await pg.locator("haus3d-panel .ed-props [data-grid=cols]").fill("4");
await pg.locator("haus3d-panel .ed-props [data-grid=cols]").press("Tab");
const z1 = await item("m_sz1");
t.check([z1.cols, z1.rows, z1.w, z1.h].join() === "4,2,7.04,2.5", `Raster 4 × 2: ${JSON.stringify(z1)}`);
const note2 = await E(() => window.panel._editor.props.querySelector(".gridnote")?.textContent ?? "");
t.check(note2.includes("8 Module × 400 Wp = 3,20 kWp"), `Hinweis 4 × 2: ${note2}`);
await pg.locator("haus3d-panel .ed-props [data-grid-orient]").selectOption("portrait");
const z2 = await item("m_sz1");
const p2 = await props();
t.results.hochkant = { w: z2.w, h: z2.h, orient: z2.orient, select: p2.orient };
t.check(z2.w === 4.68 && z2.h === 3.68 && z2.orient === "portrait" && z2.cols === 4 && z2.rows === 2 && p2.orient === "portrait", `Hochkant: ${JSON.stringify(t.results.hochkant)}`);
t.check(p2.note.startsWith("Modul hochkant"), `Hinweis hochkant: ${p2.note}`);
// Typwechsel: Eigenschaften zeigen sofort den neuen Typ (ohne Lage-Auswahl beim Sichtschutz)
await pg.locator("haus3d-panel .ed-props [data-m=type]").selectOption("pv_fence_privacy");
const z3 = await item("m_sz1");
const p3 = await props();
t.results.typwechsel = { type: p3.type, orient: p3.orient, item: [z3.type, z3.orient, z3.cols, z3.rows, z3.w, z3.h] };
t.check(
  p3.type === "pv_fence_privacy" && p3.orient === null && z3.type === "pv_fence_privacy" && z3.orient === undefined && z3.cols === undefined && z3.rows === undefined && z3.w === 2.34 && z3.h === 1.99,
  `Typwechsel: ${JSON.stringify(t.results.typwechsel)}`,
);
await select("m_sz3");
const p4 = await props();
t.check(p4.orient === null && p4.note.includes("hochkant"), `Sichtschutz ohne Lage-Auswahl: ${JSON.stringify(p4)}`);
// Zaun-Werkzeug weist auf die Solarzäune hin
await E(() => {
  const e = window.panel._editor;
  e._lineOpts().kind = "fence";
});
const lineHint = await E(() => {
  const e = window.panel._editor;
  const el = document.createElement("div");
  e._lineToolProps(el);
  return el.textContent;
});
t.check(lineHint.includes("„Solarzaun“ suchen"), `Hinweis am Zaun-Werkzeug: ${lineHint}`);
await select("m_sz2");
await t.shot(pg, "solarzaun-editor.png");

// --- Tablet: ein Tipp 8 px neben der Mittellinie des dünnen Zauns wählt ihn
const tab = await t.page("solarzaun-tablet", "?garden", { width: 1024, height: 768, touch: true });
await addFences(tab);
await tab.waitForTimeout(500);
await tab.evaluate(() => window.panel._openEditor());
await tab.waitForTimeout(500);
await tab.locator("haus3d-panel .floorsel").selectOption("eg");
await tab.waitForTimeout(300);
const tap = await tab.evaluate((x) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  e.sel = null;
  e.render();
  return { coarse: e.coarse, scale: e.scale, sx: r.left + e.tx + x * e.scale, sy: r.top + e.tz + 1.5 * e.scale };
}, fx);
t.results.tablet = tap;
if (tap.coarse) {
  // Zaun 0,12 m tief: auf dem Bildschirm nur wenige Pixel; Drehung 90° → quer zur Linie heißt in x
  t.check(0.12 * tap.scale < 20, `Zaun breiter als gedacht: ${0.12 * tap.scale} px`);
  await tab.touchscreen.tap(tap.sx + 8, tap.sy);
  await tab.waitForTimeout(250);
  const sel = await tab.evaluate(() => window.panel._editor.sel);
  t.results.tablet.sel = sel;
  t.check(sel?.kind === "furniture" && sel.id === "m_sz1", `Tipp neben den Zaun: ${JSON.stringify(sel)}`);
} else t.check(false, "Tablet: grober Zeiger nicht erkannt");
await t.done();
