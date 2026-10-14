// Ecken koppeln: Standard entkoppelt, Alt bzw. Schalter kehrt es um, Knopf und Feld mit Speicher, Ecken und Wände
// kleben nicht, Werkzeug „Wand“ rastet an Raumkanten, saubere Wandanschlüsse in 2D und 3D (bündiger Streifen)
import { start } from "./lib.mjs";

const edTool = async (pg, tool) => {
  if (await pg.locator("haus3d-panel .ed-bar.compact").count()) await pg.locator('haus3d-panel .ed-bar [data-menu="tools"]').click();
  await pg.locator(`haus3d-panel .ed-bar button[data-tool=${tool}]`).click();
};
const toScreen = (pg, x, z) => pg.evaluate(([x, z]) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  return [r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale];
}, [x, z]);
/** Maus über Zwischenpunkte ziehen (Plan-Koordinaten), je Zwischenpunkt in zwei Schritten. */
const drag = async (pg, path) => {
  const [sx, sy] = await toScreen(pg, ...path[0]);
  await pg.mouse.move(sx, sy);
  await pg.mouse.down();
  for (const p of path.slice(1)) {
    const [x, y] = await toScreen(pg, ...p);
    await pg.mouse.move(x, y, { steps: 2 });
  }
  await pg.mouse.up();
  await pg.waitForTimeout(150);
};
const xs = (pg, id) => pg.evaluate((id) => window.panel._editor.floor.rooms.find((r) => r.id === id).points.map((p) => p[0]), id);
const state = (pg) => pg.evaluate(() => {
  const e = window.panel._editor;
  const pts = (id) => e.floor.rooms.find((r) => r.id === id).points;
  return { link: e.link, undo: e.undoStack.length, hint: e.hint.textContent, wz: pts("wohnzimmer"), kueche: pts("kueche"), flur: pts("flur"), sz: pts("schlafzimmer"), stored: localStorage.getItem("haus3d.editorLink") };
});
const undoTo = async (pg, n) => {
  await pg.evaluate((n) => {
    const e = window.panel._editor;
    while (e.undoStack.length > n) e.undo();
  }, n);
};
const selectRoom = async (pg, x, z) => {
  await edTool(pg, "select");
  const [sx, sy] = await toScreen(pg, x, z);
  await pg.mouse.click(sx, sy);
  await pg.waitForTimeout(150);
};

const t = await start(process.argv[2]);

// ------------------------------------------------------------------ Desktop
const pg = await t.page("ecken", "", { width: 1280, height: 800 });
await pg.evaluate(() => window.panel._openEditor());
await pg.waitForTimeout(500);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.locator("haus3d-panel .ed-bar button[data-view='2d']").click(); // nur 2D: größerer Maßstab, Züge ohne 3D-Aufbau
await pg.waitForTimeout(300);
// 1. Standard entkoppelt
const s1 = await pg.evaluate(() => ({ link: window.panel._editor.link, btn: window.panel.shadowRoot.querySelector(".ed-bar button[data-act=link]")?.className ?? null, stored: localStorage.getItem("haus3d.editorLink") }));
t.results.standard = s1;
t.check(s1.link === false && s1.btn === "" && s1.stored === null, `Standard entkoppelt: ${JSON.stringify(s1)}`);
// 2. Wand x = 7 des Wohnzimmers ziehen: nur das Wohnzimmer
await selectRoom(pg, 2, 2);
const u0 = (await state(pg)).undo;
await drag(pg, [[7, 1.2], [7.3, 1.2], [7.5, 1.2]]);
const s2 = await state(pg);
t.results.wandEinzeln = { wz: s2.wz.map((p) => p[0]), kueche: s2.kueche.map((p) => p[0]), hint: s2.hint, undo: s2.undo - u0 };
t.check(s2.wz[1][0] === 7.5 && s2.kueche[0][0] === 7 && s2.undo === u0 + 1 && /nur dieser Raum/.test(s2.hint), `Wand ziehen entkoppelt: ${JSON.stringify(t.results.wandEinzeln)}`);
await undoTo(pg, u0);
// 3. mit Alt gehen die Nachbarn mit
await selectRoom(pg, 2, 2);
await pg.keyboard.down("Alt");
await drag(pg, [[7, 1.2], [7.3, 1.2], [7.5, 1.2]]);
await pg.keyboard.up("Alt");
const s3 = await state(pg);
t.results.wandAlt = { kueche: s3.kueche.map((p) => p[0]), hint: s3.hint };
t.check(s3.wz[1][0] === 7.5 && s3.kueche[0][0] === 7.5 && s3.kueche[3][0] === 7.5 && /Nachbarräume gehen mit/.test(s3.hint), `Wand ziehen mit Alt: ${JSON.stringify(t.results.wandAlt)}`);
await undoTo(pg, u0);
// Hinweis bleibt nach dem Neuzeichnen der Leiste stehen (Magnet: _onBar zeichnet danach die Leiste)
await pg.locator("haus3d-panel .ed-bar button[data-act=magnet]").click();
const magnetHint = await pg.evaluate(() => window.panel._editor.hint.textContent);
await pg.locator("haus3d-panel .ed-bar button[data-act=magnet]").click();
t.results.magnetHinweis = magnetHint;
t.check(/^Magnet aus/.test(magnetHint), `Hinweis nach Magnet: ${magnetHint}`);
// 4. Knopf „Ecken koppeln“: Speicher "1", Hinweis
await pg.locator("haus3d-panel .ed-bar button[data-act=link]").click();
await pg.waitForTimeout(100);
const s4 = await state(pg);
const btn4 = await pg.evaluate(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=link]").className);
t.results.knopf = { link: s4.link, stored: s4.stored, hint: s4.hint, btn: btn4 };
t.check(s4.link && s4.stored === "1" && /^Ecken koppeln an/.test(s4.hint) && btn4 === "sel", `Knopf Ecken koppeln: ${JSON.stringify(t.results.knopf)}`);
// Werkzeug wechseln: Hinweis des Werkzeugs statt des Toasts
await edTool(pg, "wall");
const toolHint = await pg.evaluate(() => window.panel._editor.hint.textContent);
t.check(/an Raumkanten ein/.test(toolHint), `Hinweis Werkzeug Wand: ${toolHint}`);
// 5. Ecke klebt nicht (gekoppelt): über die Ecke (7,4) von Küche und Flur hinweg
await selectRoom(pg, 2, 2);
const u5 = (await state(pg)).undo;
await drag(pg, [[7, 5], [7.03, 4.6], [7.03, 4.02], [7.3, 3.5], [7.5, 3]]);
const s5 = await state(pg);
t.results.eckeKlebtNicht = { wz: s5.wz[2], kueche: s5.kueche[3], flur: s5.flur[0], sz: s5.sz[1], undo: s5.undo - u5 };
t.check(JSON.stringify(s5.wz[2]) === "[7.5,3]" && JSON.stringify(s5.kueche[3]) === "[7,4]" && JSON.stringify(s5.flur[0]) === "[7,4]" && JSON.stringify(s5.sz[1]) === "[7.5,3]" && s5.undo === u5 + 1, `Ecke klebt: ${JSON.stringify(t.results.eckeKlebtNicht)}`);
await undoTo(pg, u5);
// 6. gekoppelt: Wand zieht die Küche mit, mit Alt nur das Wohnzimmer
await selectRoom(pg, 2, 2);
await drag(pg, [[7, 1.2], [7.3, 1.2], [7.5, 1.2]]);
const s6 = await state(pg);
await undoTo(pg, u5);
await selectRoom(pg, 2, 2);
await pg.keyboard.down("Alt");
await drag(pg, [[7, 1.2], [7.3, 1.2], [7.5, 1.2]]);
await pg.keyboard.up("Alt");
const s6b = await state(pg);
await undoTo(pg, u5);
t.results.gekoppelt = { kueche: s6.kueche.map((p) => p[0]), hint: s6.hint, alt: s6b.kueche.map((p) => p[0]), altHint: s6b.hint };
t.check(s6.kueche[0][0] === 7.5 && /Nachbarräume gehen mit/.test(s6.hint) && s6b.kueche[0][0] === 7 && /nur dieser Raum/.test(s6b.hint), `Gekoppelt: ${JSON.stringify(t.results.gekoppelt)}`);
// 7. Raumfeld: Häkchen und Maßfeld lesen den aktuellen Stand (nicht den beim Zeichnen des Felds)
await selectRoom(pg, 2, 2);
const cb0 = await pg.evaluate(() => window.panel._editor.props.querySelector("input[data-link]")?.checked ?? null);
await pg.locator("haus3d-panel .ed-props input[data-link]").click(); // aus
const off = await pg.evaluate(() => ({ link: window.panel._editor.link, btn: window.panel.shadowRoot.querySelector(".ed-bar button[data-act=link]").className }));
const u7 = (await state(pg)).undo;
await pg.locator("haus3d-panel .ed-props input[data-rectsize=w]").fill("7.5");
await pg.locator("haus3d-panel .ed-props input[data-rectsize=w]").press("Tab");
await pg.waitForTimeout(150);
const k7a = await xs(pg, "kueche");
const w7a = await xs(pg, "wohnzimmer");
await undoTo(pg, u7);
await selectRoom(pg, 2, 2);
await pg.locator("haus3d-panel .ed-props input[data-link]").click(); // wieder an, Feld bleibt dasselbe
await pg.locator("haus3d-panel .ed-props input[data-rectsize=w]").fill("7.5");
await pg.locator("haus3d-panel .ed-props input[data-rectsize=w]").press("Tab");
await pg.waitForTimeout(150);
const k7b = await xs(pg, "kueche");
const hint7 = await pg.evaluate(() => window.panel._editor.hint.textContent);
await undoTo(pg, u7);
t.results.feld = { cb0, off, k7a, w7a, k7b, hint7 };
t.check(cb0 === true && off.link === false && off.btn === "" && w7a[1] === 7.5 && k7a[0] === 7 && k7b[0] === 7.5 && /Mitgezogen/.test(hint7), `Feld Ecken koppeln / Maße: ${JSON.stringify(t.results.feld)}`);
// 8. neu laden: Einstellung bleibt
await pg.reload();
await pg.waitForTimeout(2500);
await pg.evaluate(() => window.panel._openEditor());
await pg.waitForTimeout(400);
const banner = await pg.locator("haus3d-panel .ed-banner [data-b=drop]").count();
if (banner) await pg.locator("haus3d-panel .ed-banner [data-b=drop]").click();
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.waitForTimeout(300);
const s8 = await pg.evaluate(() => ({ link: window.panel._editor.link, btn: window.panel.shadowRoot.querySelector(".ed-bar button[data-act=link]").className }));
t.results.neuLaden = s8;
t.check(s8.link === true && s8.btn === "sel", `Neu laden: ${JSON.stringify(s8)}`);
// 9. Werkzeug „Wand“: rastet an Raumkanten ein (auch von außen); Anschluss bis zur Wandmitte
await edTool(pg, "wall");
const walls = [];
for (const [a, b, name] of [[[3, 2], [6.97, 2.03], "innen auf Innenwand"], [[2, 3], [2.02, 0.04], "innen auf Außenwand"], [[5, -2], [5.02, -0.06], "außen auf Außenwand"]]) {
  for (const p of [a, b]) {
    const [x, y] = await toScreen(pg, ...p);
    await pg.mouse.click(x, y);
    await pg.waitForTimeout(100);
  }
  await pg.keyboard.press("Escape");
  const w = await pg.evaluate(() => window.panel._editor.floor.walls?.at(-1) ?? null);
  walls.push({ name, a: w?.a, b: w?.b, id: w?.id });
}
const ext = await pg.evaluate(async (ids) => {
  const { computeWalls } = await import("/custom_components/haus3d/frontend/walls.js");
  const e = window.panel._editor;
  const { segments } = computeWalls(e.floor, e.b.settings ?? {});
  return ids.map((id) => segments.find((s) => s.freeId === id)?.extendB ?? null);
}, walls.map((w) => w.id));
t.results.wandWerkzeug = walls.map((w, i) => ({ ...w, extendB: ext[i] }));
const want = [[[7, 2], 0], [[2, 0], 0.12], [[5, 0], -0.12]];
t.check(want.every(([b, e], i) => JSON.stringify(walls[i].b) === JSON.stringify(b) && Math.abs((ext[i] ?? 9) - e) < 1e-6), `Werkzeug Wand: ${JSON.stringify(t.results.wandWerkzeug)}`);
// 10. 2D: Wände und bündige Streifen in einer Gruppe mit gemeinsamer Deckkraft (keine dunkleren Überlappungen)
await edTool(pg, "select");
const plan2d = await pg.evaluate(async () => {
  const { computeWalls, planFootprints } = await import("/custom_components/haus3d/frontend/walls.js");
  const e = window.panel._editor;
  const { segments } = computeWalls(e.floor, e.b.settings ?? {});
  const g = e.svg.querySelector('g[opacity=".55"]');
  return { polys: g?.querySelectorAll("polygon").length ?? 0, want: planFootprints(segments).length, segs: segments.length, fillOpacity: g?.getAttribute("fill-opacity") ?? null };
});
t.results.plan2d = plan2d;
t.check(plan2d.polys === plan2d.want && plan2d.want > plan2d.segs && plan2d.fillOpacity === null, `2D-Wände: ${JSON.stringify(plan2d)}`);
await t.shot(pg, "p-ecken-editor.png");

// 11. 3D: Außentür im bündigen Streifen (Hobbyraum, x = 6, z 5…7): Rahmen über die volle Tiefe
const v = await t.page("ecken-3d", "", { width: 1280, height: 800 });
const door = await v.evaluate(async () => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const kg = b.floors.find((f) => f.id === "kg");
  kg.openings.push({ id: "hobby_aussentuer", room_id: "hobbyraum", edge: 3, offset: 1.0, width: 0.9, type: "door", sill: 0, height: 2.0, hinge: "left", leaves: 1, swing: "in", style: null });
  p._setBuilding(b, p._revision, { keepCamera: true });
  await new Promise((res) => setTimeout(res, 200));
  const { computeWalls } = await import("/custom_components/haus3d/frontend/walls.js");
  const seg = computeWalls(kg, b.settings).segments.find((s) => s.kind === "exterior" && Math.abs(s.a[0] - 6) < 1e-6 && Math.abs(s.b[0] - 6) < 1e-6);
  const item = p._scene.floors.get("kg").openings.get("hobby_aussentuer");
  const depths = (item?.frames ?? []).map((m) => m.geometry?.parameters?.depth).filter((d) => d > 0.1);
  return { flush: seg?.flush ?? null, depths };
});
t.results.tuerImStreifen = door;
t.check(door.flush === 0.06 && door.depths.length > 0 && door.depths.every((d) => Math.abs(d - 0.32) < 0.005), `Tür im Streifen: ${JSON.stringify(door)}`);
await v.locator("haus3d-panel .floorbar button[data-floor='kg']").click();
await v.waitForTimeout(500);
// Blick an der Wand entlang auf den Anschluss Innenwand (z 3…5) / Außenwand mit Streifen (z 5…7): ohne den Streifen
// stünde die Innenwand 6 cm vor und ihr Ende zeichnete einen dunklen Streifen
await v.evaluate(() => {
  const sc = window.panel._scene;
  const y = -2.8;
  sc.controls.target.set(6.0, y + 1.1, 4.4);
  sc.camera.position.set(8.6, y + 1.8, 6.9);
  sc.controls.update();
  sc._dirty = true;
  sc._kick?.();
});
await v.waitForTimeout(1500);
const band = await v.evaluate(() => {
  const sc = window.panel._scene;
  sc.renderer.render(sc.scene, sc.camera); // gleich danach auslesen (ohne preserveDrawingBuffer)
  const gl = sc.renderer.getContext();
  const cv = sc.renderer.domElement;
  const px = new Uint8Array(4);
  const lum = (x, y) => {
    gl.readPixels(x, cv.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
  };
  // je Höhe eine Zeile Helligkeiten quer über die Anschlussfuge; Einbruch = Median − dunkelstes Mittel aus 4 Punkten
  return [-2.0, -1.4].map((wy) => {
    const q = sc.camera.position.clone().set(6.06, wy, 5).project(sc.camera);
    const sx = Math.round(((q.x + 1) / 2) * cv.width);
    const sy = Math.round(((1 - q.y) / 2) * cv.height);
    const row = [];
    for (let dx = -14; dx <= 14; dx += 2) row.push(lum(sx + dx, sy));
    const med = [...row].sort((a, b) => a - b)[row.length >> 1];
    let low = Infinity;
    for (let i = 0; i + 4 <= row.length; i++) low = Math.min(low, (row[i] + row[i + 1] + row[i + 2] + row[i + 3]) / 4);
    return Math.round((med - low) * 10) / 10;
  });
});
t.results.anschlussFuge = band;
t.check(band.every((d) => d < 5), `Dunkler Streifen am Wandanschluss (Helligkeitseinbruch): ${JSON.stringify(band)}`);
await t.shot(v, "p-ecken-wandanschluss.png");

// ------------------------------------------------------------------ Tablet
const tab = await t.page("ecken-tablet", "", { width: 1024, height: 768, touch: true });
await tab.evaluate(() => window.panel._openEditor());
await tab.waitForTimeout(500);
await tab.locator("haus3d-panel .floorsel").selectOption("eg");
await tab.waitForTimeout(300);
// 12. Beschriftung des Alt-Schalters: Mitziehen (Raum, entkoppelt) bzw. Ohne Magnet (Möbel)
const solo = () => tab.evaluate(() => {
  const b = window.panel._editor._touchEl.querySelector("[data-mod=solo]");
  return { text: b.textContent, title: b.title };
});
const l0 = await solo();
await tab.evaluate(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: e.floor.furniture[0].id };
  e.render();
  e.renderProps();
});
const l1 = await solo();
await tab.evaluate(() => {
  const e = window.panel._editor;
  e.sel = { kind: "room", id: "wohnzimmer" };
  e.render();
  e.renderProps();
});
await tab.locator("haus3d-panel .ed-mods [data-mod=solo]").tap();
const soloToast = await tab.evaluate(() => window.panel._editor.hint.textContent);
await tab.locator("haus3d-panel .ed-mods [data-mod=solo]").tap();
t.results.tabletSchalter = { l0, l1, soloToast };
t.check(l0.text === "Mitziehen" && /angrenzende Räume gehen mit/.test(l0.title) && l1.text === "Ohne Magnet" && /ohne Magnet/.test(l1.title) && soloToast === "Mitziehen an: beim nächsten Zug gehen angrenzende Räume mit.", `Tablet-Schalter: ${JSON.stringify(t.results.tabletSchalter)}`);
// 13. Menü ⋯ → Ecken koppeln: Schalter heißt „Einzeln“, Häkchen im Raumfeld
await tab.locator('haus3d-panel .ed-bar [data-menu="more"]').tap();
await tab.locator("haus3d-panel .ed-bar .ed-menu button[data-act=link]").tap();
await tab.waitForTimeout(150);
const l2 = await solo();
const tabState = await tab.evaluate(() => ({ link: window.panel._editor.link, cb: window.panel._editor.props.querySelector("input[data-link]")?.checked ?? null, hint: window.panel._editor.hint.textContent }));
t.results.tabletKoppeln = { l2, ...tabState };
t.check(tabState.link && tabState.cb === true && l2.text === "Einzeln" && /„Einzeln“ kehrt das für einen Zug um/.test(tabState.hint), `Tablet Ecken koppeln: ${JSON.stringify(t.results.tabletKoppeln)}`);
await t.shot(tab, "p-ecken-tablet.png");
await t.done();
