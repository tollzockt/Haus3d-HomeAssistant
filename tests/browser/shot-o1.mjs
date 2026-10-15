// O1: Version unten links in den Admin-Einstellungen; leeres Testhaus → Editor öffnet mit Erdgeschoss und
// Grundeinstellungen (Etagen, Wände, Dach), Speichern ins Testhaus; Werkzeug „Vorlage“ (Bild, Maßstab, drehen,
// an Linie ausrichten); Assistent am Tablet und mit Esc.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("o1", "");
const E = (fn, arg) => pg.evaluate(fn, arg);
const manifest = await E(async () => (await fetch("../../custom_components/haus3d/manifest.json")).json());

// --- Version unten links
await unlock(pg, "admin");
await pg.waitForTimeout(300);
const ver = await E(() => window.panel.shadowRoot.querySelector(".admin .admin-foot .ver")?.textContent ?? "");
t.check(ver === `Haus 3D · Version ${manifest.version}${/\d(a|b|rc)\d+$/.test(manifest.version) ? " · Vorabversion" : ""}`, `Version: ${ver}`);
await t.shot(pg, "o1-admin-version.png");

// --- leeres Testhaus (Admin → Häuser, Demo-Kästchen aus)
await E(() => window.panel._closeDialog());
await unlock(pg, "admin", { cat: "houses" });
await pg.waitForSelector("haus3d-panel .houses .thnew");
await pg.locator("haus3d-panel .houses .thname").fill("Leer");
await pg.locator("haus3d-panel .houses .thsrc").selectOption("empty");
await pg.locator("haus3d-panel .houses .thdemonew").uncheck();
await pg.locator('haus3d-panel .houses [data-th="new"]').click();
await pg.waitForFunction(() => window.panel._house?.name === "Leer", null, { timeout: 5000 });
await pg.waitForTimeout(600);
const msg = await E(() => window.panel.shadowRoot.querySelector(".msg")?.textContent ?? "");
t.check(/^Noch kein Grundriss./.test(msg) && /Grundriss anlegen/.test(msg) && /Importieren/.test(msg), `Hinweis bei leerem Haus: ${msg}`);
t.check(await E(() => window.panel.shadowRoot.querySelector(".msg button")?.textContent === "Grundriss anlegen"), "Knopf Grundriss anlegen im leeren Haus");
await t.shot(pg, "o1-leeres-haus.png");
// der Knopf im leeren Haus öffnet den Editor (Admin-Freigabe gilt als Bearbeiten-Freigabe: keine PIN-Abfrage) mit den Grundeinstellungen
const opened = await E(async () => {
  window.panel.shadowRoot.querySelector(".msg button").click();
  for (let i = 0; i < 100 && !(window.panel._editor && window.panel.shadowRoot.querySelector(".ed-setup")); i++) await new Promise((r) => setTimeout(r, 50));
  const e = window.panel._editor;
  return { ok: !!e, shells: window.panel.shadowRoot.querySelectorAll(".ed").length, floors: e?.b.floors.map((f) => f.id), dirty: e?.dirty, setup: !!window.panel.shadowRoot.querySelector(".ed-setup") };
});
t.results.leer = opened;
t.check(opened.ok && opened.shells === 1 && opened.floors?.join() === "eg" && opened.dirty === false && opened.setup, `Editor im leeren Haus: ${JSON.stringify(opened)}`);
await t.shot(pg, "o1-grundeinstellungen.png");
// Schritt 1: Name; Schritt 2: Keller, 2 Geschosse, Dachgeschoss; Schritt 3: Außenwand 0,30
const S = (sel) => pg.locator(`haus3d-panel .ed-setup ${sel}`);
await S("[data-s=title]").fill("Leerhaus");
await S("[data-act=es-next]").click();
await S("[data-s=cellar]").check();
await S("[data-s=full]").fill("2");
await S("[data-s=full]").press("Tab");
await S("[data-s=attic]").check();
const preview = await E(() => [...window.panel.shadowRoot.querySelectorAll(".ed-setup .es-floors div")].map((d) => d.textContent));
t.check(preview.length === 4 && preview.filter((x) => x.includes("neu")).length === 3, `Vorschau: ${JSON.stringify(preview)}`);
await S("[data-act=es-next]").click();
await S('[data-chip=wallExt][data-v="0.3"]').click();
const roof = await E(() => window.panel.shadowRoot.querySelector(".ed-setup [data-s=roofType]")?.value);
t.check(roof === "gable", `Dachgeschoss schlägt Satteldach vor: ${roof}`);
await S("[data-act=es-done]").click();
const after = await E(() => {
  const e = window.panel._editor;
  return { floors: [...e.b.floors].sort((a, b) => a.elevation - b.elevation).map((f) => `${f.id}:${f.elevation}`), title: e.b.settings.title, wall: e.b.settings.wall_exterior, roof: e.b.settings.roof?.type, done: e.b.settings.setup_done, undo: e.undoStack.length, setup: !!window.panel.shadowRoot.querySelector(".ed-setup"), floorId: e.floorId };
});
t.results.grundeinstellungen = after;
t.check(after.floors.join() === "kg:-2.75,eg:0,og1:2.75,dg:5.5" && after.title === "Leerhaus" && after.wall === 0.3 && after.roof === "gable" && after.done && after.undo === 1 && !after.setup && after.floorId === "eg", `Grundeinstellungen: ${JSON.stringify(after)}`);
await pg.locator("haus3d-panel .ed-bar button[data-act=save]").click();
await pg.waitForTimeout(800);
const saved = await E(() => ({ sandbox: window.sandbox[window.panel._house.id]?.building?.floors?.length, real: window.realSaves ?? 0, msg: !window.panel.shadowRoot.querySelector(".msg") || window.panel.shadowRoot.querySelector(".msg").hidden }));
t.check(saved.sandbox === 4 && saved.real === 0 && saved.msg, `Gespeichert im Testhaus: ${JSON.stringify(saved)}`);

// --- Werkzeug „Vorlage“: Bild laden, Maßstab, drehen, an Linie ausrichten
await E(() => window.panel._openEditor());
await pg.waitForTimeout(300);
t.check(!(await E(() => !!window.panel.shadowRoot.querySelector(".ed-setup"))), "Assistent kommt nach dem Einrichten nicht wieder");
await pg.locator("haus3d-panel .ed-bar button[data-tool=bgmove]").click();
const tool = await E(() => window.panel._editor.props.querySelector("h3")?.textContent);
t.check(tool === "Vorlage (Bauplan)", `Vorlage-Werkzeug: ${tool}`);
const bg = await E(async () => {
  const e = window.panel._editor;
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 800;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 1600, 800);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  await e._loadBackground(new File([blob], "plan.png", { type: "image/png" }));
  await new Promise((r) => setTimeout(r, 100));
  return { bg: e.floor.background, tool: e.tool };
});
t.check(bg.bg && bg.tool === "bgscale", `Nach dem Laden gleich Maßstab: ${JSON.stringify(bg)}`);
const toScreen = (x, z) => E(([x, z]) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  return [r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale];
}, [x, z]);
for (const [x, z] of [[bg.bg.x + 1, bg.bg.z + 1], [bg.bg.x + 4, bg.bg.z + 1.2]]) {
  const [sx, sy] = await toScreen(x, z);
  await pg.mouse.click(sx, sy);
  await pg.waitForTimeout(60);
}
await pg.locator('haus3d-panel .ed-props [data-bg="align"]').click();
const aligned = await E(() => ({ rot: window.panel._editor.floor.background.rotation, pts: window.panel._editor._bgPts }));
t.check(aligned.rot !== 0 && Math.abs(aligned.pts[1][1] - aligned.pts[0][1]) < 0.02, `An Linie ausrichten: ${JSON.stringify(aligned)}`);
await pg.locator('haus3d-panel .ed-props [data-bg="rotp"]').click();
const rot = await E(() => window.panel._editor.floor.background.rotation);
t.check(Math.abs(rot - (aligned.rot + 90)) < 0.01, `+90°: ${rot}`);
await t.shot(pg, "o1-vorlage.png");

// --- Assistent wieder öffnen, Esc schließt ihn (Editor bleibt)
await pg.locator("haus3d-panel .ed-props [data-act=bgdone]").click();
await E(() => window.panel._editor.openSetup());
await pg.keyboard.press("Escape");
const esc = await E(() => ({ setup: !!window.panel.shadowRoot.querySelector(".ed-setup"), editor: !!window.panel._editor }));
t.check(!esc.setup && esc.editor, `Esc: ${JSON.stringify(esc)}`);

// --- Tablet: Assistent als Blatt von unten
const tab = await t.page("o1-tablet", "", { width: 800, height: 1280, touch: true });
await tab.evaluate(async () => {
  await window.panel._openEditor();
  window.panel._editor.openSetup(1);
});
await tab.waitForTimeout(300);
const sheet = await tab.evaluate(() => {
  const card = window.panel.shadowRoot.querySelector(".ed-setup-card").getBoundingClientRect();
  return { bottom: Math.round(card.bottom), width: Math.round(card.width), vh: innerHeight, vw: innerWidth };
});
t.check(sheet.bottom === sheet.vh && sheet.width === sheet.vw, `Tablet-Blatt: ${JSON.stringify(sheet)}`);
await t.shot(tab, "o1-grundeinstellungen-tablet.png");
await t.done();
