// Katalog „Einrichten“: Vorschaubilder entstehen nur für sichtbare Kacheln (aufgeklappte Kategorien, Suchtreffer),
// weitere beim Aufklappen; nach dem Durchgang ist der WebGL-Kontext der Vorschau wieder frei, auch wenn nichts mehr zu
// sehen ist (Kategorie sofort wieder zu, Suche ohne Treffer, Editor geschlossen).
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("katalog", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);
await pg.waitForFunction(() => window.panel?._building, null, { timeout: 30000 });
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => window.panel._editor, null, { timeout: 20000 });
await pg.locator("haus3d-panel .ed-bar button[data-tool=furniture]").click();
await pg.waitForSelector("haus3d-panel .catalog .tile", { timeout: 10000 });

// Zähler: wie viele Typen haben schon ein Vorschaubild, wie viele Kacheln sind sichtbar
const zaehlen = () => E(async () => {
  const th = await import("/custom_components/haus3d/frontend/thumbs.js");
  const fu = await import("/custom_components/haus3d/frontend/furniture.js");
  const all = Object.keys(fu.FURNITURE);
  const root = window.panel._editor.props;
  return {
    typen: all.length,
    gerendert: all.filter((k) => th.furnitureThumb(k, "standard")).length,
    kacheln: root.querySelectorAll(".catalog .tile[data-furn]").length,
    mitBild: root.querySelectorAll(".catalog .tile[data-furn] img").length,
    platzhalter: root.querySelectorAll(".catalog .tile[data-furn] .ph").length,
  };
});
const warten = (bedingung, arg, ms = 30000) => pg.waitForFunction(bedingung, arg, { timeout: ms }).catch(() => {});

// --- 1. Start: nur die offene Kategorie
await warten(() => window.panel._editor.props.querySelectorAll(".catalog .tile[data-furn] .ph").length === 0);
const start1 = await zaehlen();
t.results.start = start1;
t.check(start1.kacheln > 0 && start1.kacheln < 80, `katalog: beim Öffnen sichtbare Kacheln unerwartet (${start1.kacheln})`);
t.check(start1.platzhalter === 0 && start1.mitBild === start1.kacheln, `katalog: nicht alle sichtbaren Kacheln haben ein Bild (${start1.mitBild} von ${start1.kacheln})`);
t.check(start1.gerendert === start1.kacheln, `katalog: ${start1.gerendert} Vorschaubilder gerendert, sichtbar sind ${start1.kacheln} (von ${start1.typen} Typen)`);

// --- 2. Kategorie aufklappen: ihre Kacheln bekommen Bilder, nichts anderes wird zusätzlich gerendert
const cat = await E(() => {
  const root = window.panel._editor.props;
  const closed = [...root.querySelectorAll(".catalog [data-cat][aria-expanded=false]")].find((b) => Number(b.querySelector("small")?.textContent) > 3);
  closed?.click();
  return closed?.dataset.cat ?? null;
});
t.check(!!cat, "katalog: keine zugeklappte Kategorie gefunden");
await warten(() => window.panel._editor.props.querySelectorAll(".catalog .tile[data-furn] .ph").length === 0);
const nach2 = await zaehlen();
t.results.aufgeklappt = { kategorie: cat, ...nach2 };
t.check(nach2.kacheln > start1.kacheln && nach2.platzhalter === 0, `katalog: aufgeklappte Kategorie ohne Bilder (${nach2.mitBild}/${nach2.kacheln}, ${nach2.platzhalter} Platzhalter)`);
t.check(nach2.gerendert === nach2.kacheln, `katalog: ${nach2.gerendert} Vorschaubilder statt der ${nach2.kacheln} sichtbaren`);

// --- 3. Suche: alle Treffer mit Bild, Rest unberührt
await pg.locator("haus3d-panel .catalog").locator("xpath=preceding-sibling::input[@type='search']").fill("tisch");
await warten(() => window.panel._editor.props.querySelectorAll(".catalog .tile[data-furn]").length > 0 && window.panel._editor.props.querySelectorAll(".catalog .tile[data-furn] .ph").length === 0);
const nach3 = await zaehlen();
t.results.suche = nach3;
t.check(nach3.kacheln > 2 && nach3.platzhalter === 0, `katalog: Suchtreffer ohne Bilder (${nach3.mitBild}/${nach3.kacheln})`);
t.check(nach3.gerendert < nach3.typen / 2, `katalog: nach Öffnen, Aufklappen und Suche schon ${nach3.gerendert} von ${nach3.typen} Typen gerendert`);

// --- 4. Suche wechseln, während noch gerendert wird: das Neue wird fertig (die alte Liste entfällt), Kontext danach frei
await pg.locator("haus3d-panel .catalog").locator("xpath=preceding-sibling::input[@type='search']").fill("e");
await pg.locator("haus3d-panel .catalog").locator("xpath=preceding-sibling::input[@type='search']").fill("regal");
await warten(() => window.panel._editor.props.querySelectorAll(".catalog .tile[data-furn]").length > 0 && window.panel._editor.props.querySelectorAll(".catalog .tile[data-furn] .ph").length === 0);
const nach4 = await zaehlen();
t.results.sucheWechsel = nach4;
t.check(nach4.kacheln > 0 && nach4.platzhalter === 0, `katalog: nach dem Wechsel der Suche fehlen Bilder (${nach4.mitBild}/${nach4.kacheln})`);
t.check(nach4.gerendert < nach4.typen, `katalog: nach dem Suchwechsel alle ${nach4.typen} Typen gerendert`);
await t.shot(pg, "katalog-suche.png");

// --- 5. Nichts mehr zu sehen: der Durchgang endet und gibt den WebGL-Kontext frei (nicht erst nach allen Typen)
const THUMBS = "/custom_components/haus3d/frontend/thumbs.js";
const busy = () => E(async (u) => (await import(u)).thumbsBusy(), THUMBS);
const ruht = (ms = 5000) => pg.waitForFunction(async (u) => !(await import(u)).thumbsBusy(), THUMBS, { timeout: ms }).catch(() => {});
/** Suchfeld nacheinander (im selben Augenblick, ohne Pause dazwischen) mit den Werten füllen. */
const tippen = (...werte) =>
  E((ws) => {
    const i = window.panel._editor.props.querySelector(".search");
    for (const w of ws) {
      i.value = w;
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, werte);
await ruht();
await tippen(""); // Suche leer: wieder die Gruppen und Kategorien
await ruht();
// a) zugeklappte Kategorie mit den meisten fehlenden Bildern aufklappen und im selben Augenblick wieder zuklappen
const grosse = await E(async (u) => {
  const th = await import(u);
  const fu = await import("/custom_components/haus3d/frontend/furniture.js");
  const zu = [...window.panel._editor.props.querySelectorAll(".catalog [data-cat][aria-expanded=false]")].map((b) => b.dataset.cat);
  const fehlt = (c) => (fu.FURNITURE_CATEGORIES.find(([name]) => name === c)?.[1] ?? []).filter((x) => !th.furnitureThumb(x, "standard")).length;
  return zu.map((c) => ({ cat: c, n: fehlt(c) })).sort((p, q) => q.n - p.n)[0];
}, THUMBS);
t.check(grosse?.n > 14, `katalog: keine zugeklappte Kategorie mit vielen fehlenden Bildern (${JSON.stringify(grosse)})`);
const vorA = (await zaehlen()).gerendert;
await E((c) => {
  const btn = () => window.panel._editor.props.querySelector(`.catalog [data-cat="${CSS.escape(c)}"]`);
  btn().click(); // auf: bis zu sechs Bilder sofort, der Rest wartet
  btn().click(); // zu: nichts mehr sichtbar, was noch fehlt
}, grosse.cat);
await ruht();
const nachA = await zaehlen();
t.results.zugeklappt = { ...grosse, vorher: vorA, nachher: nachA.gerendert, busy: await busy() };
t.check(!(await busy()), "katalog: der Durchgang läuft nach dem Zuklappen weiter");
t.check(nachA.gerendert - vorA <= 6 && grosse.n - (nachA.gerendert - vorA) > 8, `katalog: nach dem Zuklappen weitere Bilder gerendert (${nachA.gerendert - vorA} von ${grosse.n})`);
// b) breite Suche, im selben Augenblick eine ohne Treffer
await tippen("e", "zzzqqq");
await ruht();
const nachB = await zaehlen();
const sucheText = await E(() => window.panel._editor.props.querySelector(".catalog").textContent.trim());
t.results.sucheOhneTreffer = { vorher: nachA.gerendert, nachher: nachB.gerendert, busy: await busy(), text: sucheText };
t.check(!(await busy()) && /Nichts gefunden/.test(sucheText), `katalog: Suche ohne Treffer ${JSON.stringify(t.results.sucheOhneTreffer)}`);
t.check(nachB.gerendert - nachA.gerendert <= 6, `katalog: nach der Suche ohne Treffer weitere Bilder gerendert (${nachB.gerendert - nachA.gerendert})`);
// c) breite Suche, im selben Augenblick den Editor schließen
await E(() => {
  const i = window.panel._editor.props.querySelector(".search");
  i.value = "e";
  i.dispatchEvent(new Event("input", { bubbles: true }));
  window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]").click(); // gleich im selben Augenblick
});
await pg.waitForFunction(() => !window.panel._editor, null, { timeout: 5000 });
await ruht();
const nachC = await E(async (u) => {
  const th = await import(u);
  const fu = await import("/custom_components/haus3d/frontend/furniture.js");
  return { gerendert: Object.keys(fu.FURNITURE).filter((k) => th.furnitureThumb(k, "standard")).length, busy: th.thumbsBusy() };
}, THUMBS);
t.results.editorZu = { vorher: nachB.gerendert, ...nachC };
t.check(!nachC.busy && nachC.gerendert - nachB.gerendert <= 6, `katalog: nach dem Schließen des Editors ${JSON.stringify(t.results.editorZu)}`);
await t.done();
