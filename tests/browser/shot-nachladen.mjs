// Nachladen bei Bedarf: Der Start lädt weder Editor noch Modell-Loader (das Panel steht und zeichnet, ohne dass der
// Editor da ist); der Editor wird nur dort im Leerlauf vorgeladen, wo bearbeitet wird (mit Freigabe, nicht am Wandtablet),
// sonst beim Tippen auf „Bearbeiten“ (während der PIN-Eingabe) bzw. beim ersten Öffnen geholt (mit Hinweis, wenn es dauert),
// seine Styles kommen erst dann dazu; doppeltes Öffnen und ein Fehlschlag beim Laden bleiben folgenlos, die Fehlermeldung
// steht nach einem gelungenen zweiten Versuch nicht mehr über dem Editor.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EDITOR_RE = /\/(editor[\w-]*|props-ui|edit-ops)\.js/;
const LOADER_RE = /\/(GLTFLoader|OBJLoader|STLLoader)\.js/;

/** Eigene Seite mit optional verzögertem bzw. fehlschlagendem editor.js; Fehlermeldungen wie in lib.mjs. */
async function open(name, { delay = 0, fail = false, expectErrors = false, query = "" } = {}) {
  const ctx = await t.browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => t.errors.push(`${name}: ${e.message}`));
  pg.on("console", (m) => {
    if (/GL Driver Message \([^)]*Performance/.test(m.text())) return;
    if (expectErrors && /ERR_|Failed to load|Editor laden|Failed to fetch dynamically/.test(m.text())) return;
    if (m.type() === "error" || m.type() === "warning") t.errors.push(`${name} [${m.type()}]: ${m.text()}`);
  });
  const state = { fail, delay };
  await ctx.route(/\/frontend\/editor\.js(\?.*)?$/, async (route) => {
    if (state.delay) await sleep(state.delay);
    if (state.fail) return route.abort("failed");
    return route.continue();
  });
  await pg.goto(`http://localhost:${t.port}/tests/browser/harness.html?quality=schoen&schatten=aus${query}`);
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.stats.renders > 0, null, { timeout: 60000 });
  return { pg, ctx, state, E: (fn, arg) => pg.evaluate(fn, arg) };
}

const loaded = (E) => E(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /\.js(\?|$)/.test(n)));

// --- 1. Start ohne Editor (Laden von editor.js dauert 2 s): Panel steht, zeichnet, nichts vom Editor geladen
const a = await open("nachladen", { delay: 2000 });
const start1 = await loaded(a.E);
t.results.start = { module: start1.length, editor: start1.filter((n) => EDITOR_RE.test(n) && !/edit-ops/.test(n)).length, loader: start1.filter((n) => LOADER_RE.test(n)).length };
t.check(start1.length > 60 && start1.length < 130, `nachladen: ${start1.length} Module beim Start (erwartet 60 bis 130)`);
t.check(!start1.some((n) => EDITOR_RE.test(n) && !/edit-ops/.test(n)), `nachladen: Editor-Module beim Start geladen: ${start1.filter((n) => EDITOR_RE.test(n)).slice(0, 3).join(", ")}`);
t.check(!start1.some((n) => LOADER_RE.test(n)), "nachladen: Modell-Loader beim Start geladen");
const s1 = await a.E(() => ({
  editor: !!window.panel._editor,
  styles: window.panel.shadowRoot.querySelectorAll("style").length,
  edStyle: /\.ed-bar/.test(window.panel.shadowRoot.querySelector("style").textContent),
  edit: window.panel.shadowRoot.querySelectorAll(".ed").length,
}));
t.check(!s1.editor && s1.styles === 1 && !s1.edStyle && s1.edit === 0, `nachladen: Zustand beim Start unerwartet ${JSON.stringify(s1)}`);

// --- 2. Öffnen: Hinweis „wird geladen“, doppelter Aufruf gleichzeitig, danach Editor und Styles da
const o1 = await a.E(() => {
  const p = window.panel;
  window.__a = p._openEditor();
  window.__b = p._openEditor(); // gleichzeitig: wird verworfen
  return { sofort: !!p._editor, promise: window.__a instanceof Promise };
});
t.check(!o1.sofort && o1.promise, `nachladen: _openEditor sollte asynchron sein ${JSON.stringify(o1)}`);
await a.pg.waitForFunction(() => window.panel.shadowRoot.querySelector(".toast")?.textContent.includes("Editor wird geladen"), null, { timeout: 3000 }).catch(() => t.errors.push("nachladen: kein Hinweis „Editor wird geladen“"));
await a.E(() => Promise.all([window.__a, window.__b]));
const o2 = await a.E(() => ({
  editor: !!window.panel._editor,
  shells: window.panel.shadowRoot.querySelectorAll(".ed").length,
  styles: window.panel.shadowRoot.querySelectorAll("style").length,
  second: window.panel.shadowRoot.querySelectorAll("style")[1]?.textContent.includes(".ed-bar") && window.panel.shadowRoot.querySelector("style").nextElementSibling === window.panel.shadowRoot.querySelectorAll("style")[1],
  toast: !!window.panel.shadowRoot.querySelector(".toast"),
  planning: window.panel.shadowRoot.querySelector(".stage").classList.contains("planning"),
  running: window.panel._scene._running,
  barBg: getComputedStyle(window.panel.shadowRoot.querySelector(".ed-bar")).display,
}));
t.results.geoeffnet = o2;
t.check(o2.editor && o2.shells === 1, `nachladen: Editor nicht (genau einmal) offen ${JSON.stringify(o2)}`);
t.check(o2.styles === 2 && o2.second, `nachladen: Editor-Styles nicht als zweites Style-Element direkt hinter dem ersten ${JSON.stringify(o2)}`);
t.check(!o2.toast && o2.planning && !o2.running, `nachladen: Zustand nach dem Öffnen unerwartet ${JSON.stringify(o2)}`);
t.check(o2.barBg === "flex", `nachladen: Editor-Leiste ohne Styles (display ${o2.barBg})`);
// schließen und wieder öffnen: Styles nicht doppelt
await a.E(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]").click());
await a.pg.waitForFunction(() => !window.panel._editor, null, { timeout: 5000 });
await a.E(() => window.panel._openEditor());
const o3 = await a.E(() => ({ editor: !!window.panel._editor, styles: window.panel.shadowRoot.querySelectorAll("style").length }));
t.check(o3.editor && o3.styles === 2, `nachladen: zweites Öffnen ${JSON.stringify(o3)}`);
const late = await loaded(a.E);
t.check(late.some((n) => /\/editor\.js/.test(n)) && late.length > start1.length + 25, `nachladen: nach dem Öffnen nur ${late.length - start1.length} weitere Module`);
await a.ctx.close();

// --- 3. Vorladen im Leerlauf nur, wo bearbeitet wird: nicht ohne Freigabe, nicht am Wandtablet; mit Freigabe kurz nach dem ersten Bild
const ACCESS = "/custom_components/haus3d/frontend/access.js";
const editorGeholt = (E) => E(() => performance.getEntriesByType("resource").some((r) => /\/frontend\/editor\.js/.test(r.name)));
const b = await open("vorladen");
await b.pg.waitForTimeout(6500); // länger als der Leerlauf-Aufruf höchstens wartet (4 s)
t.check(!(await editorGeholt(b.E)), "vorladen: Editor ohne Freigabe vorgeladen (Geräte ohne Bearbeiten laden die 460 KB nie)");
// Tippen auf „Bearbeiten“: der Editor wird schon während der PIN-Eingabe geholt
await b.E(() => {
  window.__edit = window.panel._startEdit();
});
await b.pg.waitForFunction(() => performance.getEntriesByType("resource").some((r) => /\/frontend\/editor\.js/.test(r.name)), null, { timeout: 5000 }).catch(() => t.errors.push("vorladen: Editor wird während der PIN-Eingabe nicht geholt"));
t.check(await b.E(() => !!window.panel.shadowRoot.querySelector(".pinpad")), "vorladen: PIN-Feld nicht offen");
await b.E(() => window.panel._pinEl._finish(false));
await b.E(() => window.__edit);
await b.ctx.close();

// Mit Freigabe (Bearbeiten-/Admin-Modus): Vorladen im Leerlauf, Öffnen danach ohne Hinweis
const b2 = await open("vorladen-frei");
await b2.E(async (u) => {
  (await import(u)).setAccess("test-token", "edit");
  window.panel._setBuilding(window.panel._building, window.panel._revision, { keepCamera: true });
}, ACCESS);
await b2.pg.waitForFunction(() => performance.getEntriesByType("resource").some((r) => /\/frontend\/editor\.js/.test(r.name)), null, { timeout: 20000 }).catch(() => t.errors.push("vorladen: Editor wurde mit Freigabe im Leerlauf nicht vorgeladen"));
const pre = await b2.E(() => ({ editor: !!window.panel._editor, styles: window.panel.shadowRoot.querySelectorAll("style").length }));
t.check(!pre.editor && pre.styles === 1, `vorladen: Vorladen darf nichts öffnen oder einhängen ${JSON.stringify(pre)}`);
const tOpen = await b2.E(async () => {
  const t0 = performance.now();
  await window.panel._openEditor();
  return { ms: performance.now() - t0, editor: !!window.panel._editor, hinweis: !!window.panel.shadowRoot.querySelector(".toast")?.textContent.includes("geladen") };
});
t.results.vorgeladen = tOpen;
t.check(tOpen.editor && !tOpen.hinweis, `vorladen: Öffnen nach dem Vorladen ${JSON.stringify(tOpen)}`);
await b2.ctx.close();

// Wandtablet: auch mit Freigabe kein Vorladen
const k = await open("vorladen-kiosk", { query: "&kiosk" });
await k.E(async (u) => {
  (await import(u)).setAccess("test-token", "edit");
  window.panel._setBuilding(window.panel._building, window.panel._revision, { keepCamera: true });
}, ACCESS);
await k.pg.waitForTimeout(6500);
t.check(await k.E(() => window.panel.hasAttribute("kiosk")), "vorladen: Wandtablet-Modus nicht aktiv");
t.check(!(await editorGeholt(k.E)), "vorladen: Editor am Wandtablet vorgeladen");
await k.ctx.close();

// --- 4. Fehlschlag beim Laden: Hinweis, kein Editor, nichts hängt; Haus gewechselt während des Ladens: nicht öffnen
const c = await open("fehlschlag", { fail: true, expectErrors: true });
await c.pg.waitForTimeout(500);
await c.E(() => window.panel._openEditor());
const f1 = await c.E(() => ({ editor: !!window.panel._editor, toast: window.panel.shadowRoot.querySelector(".toast")?.textContent ?? "", opening: window.panel._editorOpening, styles: window.panel.shadowRoot.querySelectorAll("style").length }));
t.results.fehlschlag = f1;
t.check(!f1.editor && /nicht laden/.test(f1.toast) && !f1.opening && f1.styles === 1, `fehlschlag: ${JSON.stringify(f1)}`);
// zweiter Versuch gelingt: die Fehlermeldung des ersten steht nicht mehr über dem offenen Editor
c.state.fail = false;
await c.E(() => window.panel._openEditor());
const f2 = await c.E(() => ({ editor: !!window.panel._editor, toast: window.panel.shadowRoot.querySelector(".toast")?.textContent ?? "", styles: window.panel.shadowRoot.querySelectorAll("style").length }));
t.results.zweiterVersuch = f2;
t.check(f2.editor && f2.toast === "" && f2.styles === 2, `fehlschlag: zweiter Versuch ${JSON.stringify(f2)}`);
await c.ctx.close();

const d = await open("wechsel", { delay: 1000 });
const w = await d.E(async () => {
  const p = window.panel;
  const pr = p._openEditor();
  p._switching = true; // wie mitten in einem Hauswechsel
  await pr;
  p._switching = false;
  return { editor: !!p._editor, shells: p.shadowRoot.querySelectorAll(".ed").length };
});
t.check(!w.editor && w.shells === 0, `wechsel: Editor trotz Hauswechsel geöffnet ${JSON.stringify(w)}`);
await d.ctx.close();
await t.done();
