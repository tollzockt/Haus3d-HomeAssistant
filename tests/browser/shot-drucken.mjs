// „Plan drucken / exportieren“: Dialog aus Admin → Daten & Verlauf und aus dem Editor (Stand im Editor, auch ungespeichert),
// Etagen, Inhalt, Papier, Maßstab, Vorschau, Druck-HTML (je Etage eine Seite, optional 3D-Seite; als PDF ohne leere Folgeseite),
// PNG-Download, Druck aus dem unsichtbaren Rahmen, nichts geht ins Netz.
import { readFileSync } from "node:fs";
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("drucken", "");
const E = (fn, arg) => pg.evaluate(fn, arg);
const R = (sel) => E((s) => !!window.panel.shadowRoot.querySelector(s), sel);
const T = (sel) => E((s) => window.panel.shadowRoot.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, sel);
const Q = (sel) => pg.locator(`haus3d-panel ${sel}`);
const foreign = [];
pg.on("request", (r) => {
  if (!/^(http:\/\/localhost|data:|blob:|about:)/.test(r.url())) foreign.push(r.url());
});
const today = await E(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});

// Druck abfangen: das HTML landet in window.printed
await E(() => {
  window.printed = [];
  window.panel._printFrame = async (html) => {
    window.printed.push(html);
  };
});

// --- aus Admin → Daten & Verlauf
await unlock(pg, "admin", { cat: "data" });
await pg.waitForSelector("haus3d-panel [data-d=print]");
t.check((await T("[data-d=print]")).endsWith("Plan drucken / exportieren …"), `Knopf: ${await T("[data-d=print]")}`);
await Q("[data-d=print]").click();
await pg.waitForSelector("haus3d-panel .printdlg .pr-page svg");
const d0 = await E(() => {
  const s = window.panel.shadowRoot;
  const dlg = s.querySelector(".printdlg");
  return {
    title: dlg.querySelector(".ttl").textContent,
    floors: [...dlg.querySelectorAll("[data-f]")].map((c) => [c.dataset.f, c.checked, c.disabled, c.closest("label").textContent.trim()]),
    opts: Object.fromEntries([...dlg.querySelectorAll("[data-o]")].map((c) => [c.dataset.o, [c.checked, c.disabled]])),
    labels: [...dlg.querySelectorAll(".pr-opts label")].map((l) => l.textContent.trim()),
    paper: dlg.querySelector("[data-ppaper]").value,
    scaleOptions: [...dlg.querySelectorAll("[data-pscale] option")].map((o) => o.textContent),
    scale: dlg.querySelector("[data-pscale]").value,
    nav: dlg.querySelector(".pn").textContent,
    hint: dlg.querySelector(".muted").textContent,
    buttons: [...dlg.querySelectorAll(".btns button")].map((b) => [b.textContent.replace(/\s+/g, " ").trim().replace(/^\S{2} /, ""), b.disabled]),
    svg: dlg.querySelector(".pr-page svg").getAttribute("viewBox"),
    no3d: dlg.querySelector(".no3d").hidden,
    nofloor: dlg.querySelector(".nofloor").hidden,
    ids: [...dlg.querySelectorAll("[data-f]")].map((c) => c.dataset.f),
    admin: window.panel._adminOpen,
  };
});
t.results.dialogAdmin = d0;
t.check(d0.title === "Plan drucken", `Titel: ${d0.title}`);
t.check(JSON.stringify(d0.floors.map((f) => f[0])) === '["kg","eg"]' && d0.floors.every((f) => f[1] && !f[2]), `Etagen (nach Höhe, bei „Alle“ alle mit Inhalt vorgewählt): ${JSON.stringify(d0.floors)}`);
t.check(d0.floors[0][3] === "KG" && d0.floors[1][3] === "EG", "Etagennamen");
t.check(JSON.stringify(d0.labels) === JSON.stringify(["Maße", "Raumnamen und Flächen", "Nordpfeil", "Garten und Außenflächen", "Schwarz-Weiß", "3D-Bild der aktuellen Ansicht anhängen"]), `Inhalt: ${JSON.stringify(d0.labels)}`);
t.check(d0.opts.dims[0] && d0.opts.names[0] && d0.opts.north[0] && d0.opts.outdoor[0] && !d0.opts.bw[0] && d0.opts.shot3d[0] && !d0.opts.shot3d[1], `Vorgaben: ${JSON.stringify(d0.opts)}`);
t.check(d0.no3d, "3D-Ansicht als nicht verfügbar gemeldet, obwohl die Szene da ist");
t.check(d0.paper === "A4" && d0.scale === "auto" && /^Automatisch \(1:\d+\)$/.test(d0.scaleOptions[0]) && d0.scaleOptions.length > 2, `Papier/Maßstab: ${JSON.stringify([d0.paper, d0.scale, d0.scaleOptions])}`);
t.check(/ · 1 \/ 3$/.test(d0.nav) && d0.nav.startsWith("KG"), `Seitenzähler: ${d0.nav}`);
t.check(d0.hint === "Der Maßstab stimmt beim Drucken in Originalgröße (100 %). Als PDF: im Druckfenster „Als PDF speichern“ wählen.", `Hinweis: ${d0.hint}`);
t.check(JSON.stringify(d0.buttons) === '[["PNG speichern",false],["Drucken …",false]]', `Knöpfe: ${JSON.stringify(d0.buttons)}`);
t.check(d0.nofloor && d0.svg === "0 0 277 189", `Vorschau: ${d0.svg}`);
await t.shot(pg, "drucken-dialog-admin.png");

// Blättern, Papier, Maßstab, Inhalt
await Q('.printdlg [data-nav="1"]').click();
t.check((await T(".printdlg .pn")).startsWith("EG") && (await R('.printdlg .pr-page svg[data-floor="eg"]')), `Blättern: ${await T(".printdlg .pn")}`);
await Q(".printdlg [data-ppaper]").selectOption("A3");
const sc1 = await E(() => ({ first: window.panel.shadowRoot.querySelector("[data-pscale] option").textContent, vb: window.panel.shadowRoot.querySelector(".pr-page svg").getAttribute("viewBox") }));
t.check(/^0 0 (400 276|276 400)$/.test(sc1.vb), `A3-Vorschau: ${sc1.vb}`);
await Q(".printdlg [data-ppaper]").selectOption("A4");
await Q(".printdlg [data-pscale]").selectOption("500");
t.check((await E(() => window.panel.shadowRoot.querySelector(".pr-page svg").textContent)).includes("Maßstab 1:500"), "Maßstab 1:500 nicht in der Vorschau");
await Q(".printdlg [data-pscale]").selectOption("auto");
await Q('.printdlg [data-o="dims"]').uncheck();
t.check(!(await E(() => /\d,\d\d m</.test(window.panel.shadowRoot.querySelector(".pr-page svg").innerHTML))), "Maße trotz ausgeschaltetem Kästchen");
await Q('.printdlg [data-o="dims"]').check();
await Q('.printdlg [data-o="bw"]').check();
t.check(!(await E(() => /#29b6f6|#e53935/.test(window.panel.shadowRoot.querySelector(".pr-page svg").innerHTML))), "Schwarz-Weiß hat noch Farben");
await Q('.printdlg [data-o="bw"]').uncheck();
// keine Etage: Knöpfe aus
await Q('.printdlg [data-f="kg"]').uncheck();
await Q('.printdlg [data-f="eg"]').uncheck();
const none = await E(() => ({ hint: window.panel.shadowRoot.querySelector(".nofloor").textContent, hidden: window.panel.shadowRoot.querySelector(".nofloor").hidden, buttons: [...window.panel.shadowRoot.querySelectorAll(".printdlg [data-p]")].map((b) => b.disabled) }));
t.check(!none.hidden && none.hint === "Mindestens eine Etage wählen." && none.buttons.every(Boolean), `Keine Etage: ${JSON.stringify(none)}`);
await Q('.printdlg [data-f="kg"]').check();
await Q('.printdlg [data-f="eg"]').check();

// --- Drucken: je Etage eine Seite + 3D-Seite, gleicher Maßstab
await Q('.printdlg [data-p="print"]').click();
await pg.waitForFunction(() => window.printed.length === 1, null, { timeout: 30000 });
const html = await E(() => window.printed[0]);
const pagesN = (html.match(/<div class="page">/g) ?? []).length;
t.results.druck = { bytes: html.length, seiten: pagesN };
t.check(pagesN === 3, `Seiten: ${pagesN} (KG, EG, 3D)`);
t.check(html.includes("@page { size: A4 landscape; margin: 10mm }") && html.includes("print-color-adjust: exact"), "@page / Farben exakt");
const scales = [...html.matchAll(/data-scale="(\d+)"/g)].map((m) => m[1]);
t.check(scales.length === 2 && scales[0] === scales[1], `Maßstab je Etage: ${scales}`);
const img = html.match(/href="(data:image\/png;base64,[^"]+)"/)?.[1] ?? "";
t.results.bild3d = img.length;
t.check(img.length > 10000, `3D-Bild zu klein (${img.length} Zeichen)`);
t.check(html.includes("Haus 3D – 3D-Ansicht"), "Kopf der 3D-Seite");

// gedruckte Seiten ansehen: Druckdarstellung, Screenshot und PDF (Seitenzahl, Papiergröße, keine leere Folgeseite)
const pp = await pg.context().newPage();
await pp.setViewportSize({ width: 1180, height: 900 });
await pp.setContent(html);
await pp.emulateMedia({ media: "print" });
t.check((await pp.locator(".page").count()) === 3, "Seiten in der Druckdarstellung");
await pp.screenshot({ path: `${t.out}/drucken-seiten.png`, fullPage: true });
const pdf = await pp.pdf({ preferCSSPageSize: true, printBackground: true });
const pdfText = pdf.toString("latin1");
const pdfPages = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const media = pdfText.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
t.results.pdf = { seiten: pdfPages, media: media?.slice(1) };
t.check(pdfPages === 3, `PDF-Seiten: ${pdfPages}`);
t.check(media && Math.abs(Number(media[1]) - 841.9) < 1 && Math.abs(Number(media[2]) - 595.3) < 1, `PDF-Papier A4 quer: ${media?.slice(1)}`);
await pp.close();

// --- PNG: eine Etage, ohne 3D → haus3d-plan-eg-<Datum>.png (200 dpi)
await Q('.printdlg [data-f="kg"]').uncheck();
await Q('.printdlg [data-o="shot3d"]').uncheck();
const dl1 = pg.waitForEvent("download");
const toast1 = pg.waitForFunction(() => /PNG gespeichert\./.test(window.panel.shadowRoot.querySelector(".toast")?.textContent ?? ""), null, { timeout: 20000, polling: 50 }); // die Meldung steht nur 4 s
await Q('.printdlg [data-p="png"]').click();
const png = await dl1;
t.check(png.suggestedFilename() === `haus3d-plan-eg-${today}.png`, `PNG-Name: ${png.suggestedFilename()}`);
const bytes = readFileSync(await png.path());
const [pw, ph] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
t.results.png = { name: png.suggestedFilename(), bytes: bytes.length, pw, ph };
t.check(bytes.subarray(1, 4).toString() === "PNG" && pw === 2181 && ph === 1488 && bytes.length > 20000, `PNG: ${pw}×${ph}, ${bytes.length} Byte`);
await toast1;
await t.shot(pg, "drucken-png.png");
// zwei Etagen + 3D: drei Dateien
await Q('.printdlg [data-f="kg"]').check();
await Q('.printdlg [data-o="shot3d"]').check();
const names = [];
pg.on("download", (d) => names.push(d.suggestedFilename()));
await Q('.printdlg [data-p="png"]').click();
await pg.waitForFunction(() => /3 PNG gespeichert\./.test(window.panel.shadowRoot.querySelector(".toast")?.textContent ?? ""), null, { timeout: 20000, polling: 50 });
for (let i = 0; i < 50 && names.length < 3; i++) await pg.waitForTimeout(100); // das letzte Download-Ereignis kommt nach der Meldung
t.results.pngs = names;
t.check(JSON.stringify(names) === JSON.stringify([`haus3d-plan-kg-${today}.png`, `haus3d-plan-eg-${today}.png`, `haus3d-3d-${today}.png`]), `PNG-Namen: ${names}`);

// --- Schließen: zurück zu Daten & Verlauf
await Q(".printdlg .close").click();
await pg.waitForSelector("haus3d-panel .dialog.admin");
t.check(!(await R(".printdlg")) && (await E(() => window.panel._dialog?.dataset.cat)) === "data" && (await E(() => window.panel._adminOpen)), "Nach dem Schließen nicht zurück in Daten & Verlauf");
await Q("[data-d=print]").click();
await pg.waitForSelector("haus3d-panel .printdlg");
await pg.keyboard.press("Escape");
t.check(!(await R(".printdlg")) && (await R(".dialog.admin")), "Esc schließt den Druckdialog nicht (oder nicht zurück zu Daten & Verlauf)");
await E(() => window.panel._closeDialog());

// --- Druck aus dem unsichtbaren Rahmen (die echte Methode; print() wird im Rahmen ersetzt)
const frame = await pg.evaluate(async () => {
  const proto = Object.getPrototypeOf(window.panel);
  const real = proto._printFrame;
  window.printCalls = 0;
  const hook = (e) => {
    if (e.target.tagName !== "IFRAME") return;
    const w = e.target.contentWindow;
    w.print = () => {
      window.printCalls++;
      window.frameInfo = { hidden: getComputedStyle(e.target).opacity, w: e.target.offsetWidth, text: w.document.body.textContent, srcdoc: !!e.target.srcdoc, parent: e.target.parentElement === document.body };
      setTimeout(() => w.dispatchEvent(new Event("afterprint")), 30);
    };
  };
  document.addEventListener("load", hook, true); // „load“ geht nicht bis zum Fenster, nur bis zum Dokument
  await real.call(window.panel, "<!doctype html><title>x</title><p>Probe</p>");
  document.removeEventListener("load", hook, true);
  return { calls: window.printCalls, info: window.frameInfo, left: document.querySelectorAll("iframe").length };
});
t.results.rahmen = frame;
t.check(frame.calls === 1 && frame.info.text.includes("Probe") && frame.info.srcdoc && frame.info.parent && frame.left === 0, `Druckrahmen: ${JSON.stringify(frame)}`);

// --- Editor: Stand im Editor (auch ungespeichert), Eingaben im Dialog gehen nicht an den Editor
await unlock(pg, "edit");
await Q(".edit").click();
await pg.waitForFunction(() => window.panel._editor, null, { timeout: 40000 });
await pg.waitForTimeout(800);
const edInfo = await E(() => {
  const ed = window.panel._editor;
  return { floor: ed.floorId, view: ed.viewMode, scene3d: !!ed.scene3d };
});
t.results.editor = edInfo;
await E(() => {
  const ed = window.panel._editor;
  const room = ed.floor.rooms[0];
  room.name = "Geänderter Raum";
  ed.dirty = true;
  ed.sel = { kind: "room", id: room.id };
  window.__roomId = room.id;
  window.__roomsBefore = ed.floor.rooms.length;
});
await pg.locator("haus3d-panel .ed-bar [data-act=print]").click();
await pg.waitForSelector("haus3d-panel .printdlg .pr-page svg");
const d1 = await E(() => {
  const dlg = window.panel.shadowRoot.querySelector(".printdlg");
  const ed = window.panel._editor;
  return {
    checked: [...dlg.querySelectorAll("[data-f]")].filter((c) => c.checked).map((c) => c.dataset.f),
    svg: dlg.querySelector(".pr-page svg").textContent,
    no3d: dlg.querySelector(".no3d").hidden,
    shot: [dlg.querySelector("[data-o=shot3d]").checked, dlg.querySelector("[data-o=shot3d]").disabled],
    z: [getComputedStyle(dlg.parentElement).zIndex, getComputedStyle(ed.root).zIndex],
    menus: [...window.panel.shadowRoot.querySelectorAll(".ed-menu")].filter((m) => !m.hidden).length,
    admin: window.panel._adminOpen,
  };
});
t.results.dialogEditor = d1;
t.check(JSON.stringify(d1.checked) === JSON.stringify([edInfo.floor]), `Editor: nur die Etage des Editors vorgewählt: ${JSON.stringify(d1.checked)}`);
t.check(d1.svg.includes("Geänderter Raum"), "Der ungespeicherte Stand des Editors fehlt in der Vorschau");
t.check(Number(d1.z[0]) > Number(d1.z[1]) && d1.menus === 0, `Dialog über dem Editor / Menüs zu: ${JSON.stringify([d1.z, d1.menus])}`);
if (edInfo.view !== "2d") t.check(d1.no3d && d1.shot[0] && !d1.shot[1], `Editor-3D als Quelle: ${JSON.stringify(d1)}`);
await t.shot(pg, "drucken-dialog-editor.png");
// Entf/Rücktaste/Esc im Dialog lassen die Auswahl im Editor in Ruhe
await pg.keyboard.press("Delete");
await pg.keyboard.press("Backspace");
t.check((await E(() => window.panel._editor.floor.rooms.length === window.__roomsBefore && window.panel._editor.sel?.id === window.__roomId)), "Entf im Dialog hat im Editor etwas gelöscht");
// Drucken aus dem Editor: das HTML enthält den geänderten Raum
await Q('.printdlg [data-p="print"]').click();
await pg.waitForFunction(() => window.printed.length === 2, null, { timeout: 30000 });
t.check((await E(() => window.printed[1])).includes("Geänderter Raum"), "Druck aus dem Editor ohne den ungespeicherten Stand");
await pg.keyboard.press("Escape");
t.check(!(await R(".printdlg")) && (await E(() => !!window.panel._editor && window.panel._editor.sel?.id === window.__roomId)), "Esc im Dialog: Dialog zu, Editor und Auswahl unverändert");
// nur 2D und ungespeichert: keine 3D-Aufnahme möglich (die Ansicht des Panels zeigt den alten Stand)
await pg.locator('haus3d-panel .ed-bar [data-view="2d"]').click();
await pg.locator("haus3d-panel .ed-bar [data-act=print]").click();
await pg.waitForSelector("haus3d-panel .printdlg");
const d2 = await E(() => {
  const dlg = window.panel.shadowRoot.querySelector(".printdlg");
  return { hint: dlg.querySelector(".no3d").textContent, hidden: dlg.querySelector(".no3d").hidden, shot: [dlg.querySelector("[data-o=shot3d]").checked, dlg.querySelector("[data-o=shot3d]").disabled] };
});
t.check(!d2.hidden && d2.hint.startsWith("3D-Ansicht nicht verfügbar.") && !d2.shot[0] && d2.shot[1], `2D + ungespeichert: ${JSON.stringify(d2)}`);
await pg.keyboard.press("Escape");
// gespeichert (nicht geändert) und 2D: die Ansicht des Panels kann aufgenommen werden
await E(() => (window.panel._editor.dirty = false));
await pg.locator("haus3d-panel .ed-bar [data-act=print]").click();
await pg.waitForSelector("haus3d-panel .printdlg");
const d3 = await E(() => {
  const dlg = window.panel.shadowRoot.querySelector(".printdlg");
  return { hidden: dlg.querySelector(".no3d").hidden, shot: [dlg.querySelector("[data-o=shot3d]").checked, dlg.querySelector("[data-o=shot3d]").disabled] };
});
t.check(d3.hidden && d3.shot[0] && !d3.shot[1], `2D, nicht geändert: ${JSON.stringify(d3)}`);
await pg.keyboard.press("Escape");

// --- nichts ging ins Netz
t.results.fremdeAnfragen = foreign;
t.check(foreign.length === 0, `Anfragen nach außen: ${foreign.join(", ")}`);

// --- Haus ohne Etage und Smartphone-Breite
const small = await t.page("drucken-klein", "", { width: 390, height: 844, touch: true });
const SE = (fn, arg) => small.evaluate(fn, arg);
await SE(() => {
  window.panel._setBuilding({ version: 1, floors: [], settings: {} }, 5);
});
await SE(() => window.panel._openPrint());
await small.waitForSelector("haus3d-panel .printdlg");
const empty = await SE(() => {
  const dlg = window.panel.shadowRoot.querySelector(".printdlg");
  return { hint: dlg.querySelector(".nofloor").textContent, hidden: dlg.querySelector(".nofloor").hidden, buttons: [...dlg.querySelectorAll("[data-p]")].map((b) => b.disabled), floors: dlg.querySelectorAll("[data-f]").length };
});
t.check(!empty.hidden && empty.hint === "Noch keine Etage. Erst einen Grundriss anlegen (Zahnrad → „Bearbeiten“)." && empty.buttons.every(Boolean) && empty.floors === 0, `Leeres Haus: ${JSON.stringify(empty)}`);
await SE(() => window.panel._closeDialog());
const small2 = await t.page("drucken-handy", "", { width: 390, height: 844, touch: true });
await small2.evaluate(() => window.panel._openPrint());
await small2.waitForSelector("haus3d-panel .printdlg .pr-page svg");
const fits = await small2.evaluate(() => {
  const dlg = window.panel.shadowRoot.querySelector(".printdlg");
  const r = dlg.getBoundingClientRect();
  return { w: Math.round(r.width), vw: innerWidth, scrollW: dlg.scrollWidth, clientW: dlg.clientWidth };
});
t.check(fits.w <= fits.vw && fits.scrollW <= fits.clientW + 1, `Dialog auf dem Handy: ${JSON.stringify(fits)}`);
await t.shot(small2, "drucken-handy.png");

await t.done();
