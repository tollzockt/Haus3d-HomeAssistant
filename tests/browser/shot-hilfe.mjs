// Hilfe „?“ und Einführung (Tour): Panel-Tour durchklicken und „gesehen“ merken (auch nach dem Neuladen), Tasten gehören der
// Tour, Hilfe mit Suche, Links und Netzzugriff, Hilfe im Editor mit aktivem Werkzeug (Entf löscht nichts), Editor-Tour,
// Wandtablet ohne Auto-Tour, Demo-Zweig (mit Stub), Tablet (768×1024, Finger) und Screenshots.
import { start } from "./lib.mjs";

const README_URL = "https://github.com/tollzockt/Haus3d-HomeAssistant";
const t = await start(process.argv[2]);

// ---------------------------------------------------------------- Panel-Tour
const pg = await t.page("hilfe", "?tour", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);
const Q = (sel) => pg.locator(`haus3d-panel ${sel}`);
const R = (sel) => E((s) => !!window.panel.shadowRoot.querySelector(s), sel);
const T = (sel) => E((s) => window.panel.shadowRoot.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, sel);
const stored = () => E(() => JSON.parse(localStorage.getItem("haus3d.tour") ?? "null"));
const outside = [];
pg.on("request", (r) => {
  if (!r.url().startsWith(`http://localhost:${t.port}/`) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url());
});

/** Zustand des aktuellen Tour-Schritts: Titel, Zähler, Knöpfe, Karte und Ausschnitt (Rechtecke im Fenster). */
const step = () =>
  E(() => {
    const root = window.panel.shadowRoot;
    const box = root.querySelector(".tour");
    if (!box) return null;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      title: box.querySelector(".tt").textContent,
      text: box.querySelector(".tx").textContent,
      n: box.querySelector(".tn").textContent,
      next: box.querySelector(".next").textContent,
      backHidden: box.querySelector(".back").hidden,
      card: rect(box.querySelector(".tour-card")),
      hole: rect(box.querySelector(".tour-hole")),
      bare: box.classList.contains("bare"),
      view: { w: innerWidth, h: innerHeight },
      kind: window.panel._tourRun?.kind,
    };
  });
const cardInside = (s) => s.card.l >= 0 && s.card.t >= 0 && s.card.l + s.card.w <= s.view.w && s.card.t + s.card.h <= s.view.h;

await pg.waitForFunction(() => window.panel.shadowRoot.querySelector(".tour"), null, { timeout: 10000 });
const seq = [];
for (let n = 0; n < 8; n++) {
  const s = await step();
  seq.push(s);
  t.check(cardInside(s), `tour: Karte ragt aus dem Fenster (${s.title}): ${JSON.stringify(s.card)}`);
  if (n === 0 || n === 2) await t.shot(pg, `hilfe-tour-panel-${n + 1}.png`);
  if (s.next === "Fertig") break;
  await Q(".tour .next").click();
  await pg.waitForTimeout(350);
}
t.results.panelTour = seq.map((s) => `${s.n} ${s.title}`);
t.check(JSON.stringify(seq.map((s) => s.title)) === JSON.stringify(["Räume", "Etagen", "Funktionsrad", "Bearbeiten", "Hilfe"]), `tour: Schritte ${seq.map((s) => s.title)}`);
t.check(seq[0].n === "1 von 5" && seq.at(-1).n === "5 von 5" && seq.at(-1).next === "Fertig", `tour: Zähler ${seq[0].n} … ${seq.at(-1).n}/${seq.at(-1).next}`);
t.check(seq[0].backHidden && !seq[1].backHidden, "tour: „Zurück“ erst ab Schritt 2");
t.check(seq[0].kind === "panel", `tour: Art ${seq[0].kind}`);
// der Ausschnitt liegt um das Ziel (6 px Rand): Etagenleiste = Schritt 2
const bar = await E(() => {
  const r = window.panel.shadowRoot.querySelector(".floorbar").getBoundingClientRect();
  return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
});
const h2 = seq[1].hole;
t.check(Math.abs(h2.l - (bar.l - 6)) <= 2 && Math.abs(h2.t - (bar.t - 6)) <= 2 && Math.abs(h2.w - (bar.w + 12)) <= 2 && Math.abs(h2.h - (bar.h + 12)) <= 2, `tour: Ausschnitt ${JSON.stringify(h2)} passt nicht zur Etagenleiste ${JSON.stringify(bar)}`);
await Q(".tour .next").click(); // „Fertig“
await pg.waitForTimeout(300);
t.check(!(await R(".tour")), "tour: nach „Fertig“ noch sichtbar");
t.check((await stored())?.panel === 1, `tour: „gesehen“ nicht gemerkt: ${JSON.stringify(await stored())}`);

// Neuladen im selben Kontext: keine Tour mehr
await pg.reload();
await pg.waitForFunction(() => window.panel?._building, null, { timeout: 30000 });
await pg.waitForTimeout(3200);
t.check(!(await R(".tour")), "tour: startete nach dem Neuladen erneut");

// Über die Hilfe jederzeit wieder; Tasten gehören der Tour (? öffnet keine Hilfe, Pfeile blättern, Esc überspringt)
await E(() => window.panel._tourStart("panel"));
await pg.waitForTimeout(300);
await pg.keyboard.press("?");
await pg.waitForTimeout(300);
t.check(!(await R(".helpdlg")), "tour: „?“ öffnete mitten in der Tour die Hilfe");
await pg.keyboard.press("ArrowRight");
await pg.waitForTimeout(250);
t.check((await step()).n === "2 von 5", `tour: Pfeil rechts: ${(await step()).n}`);
await pg.keyboard.press("ArrowLeft");
await pg.waitForTimeout(250);
t.check((await step()).n === "1 von 5", `tour: Pfeil links: ${(await step()).n}`);
await pg.keyboard.press("Enter");
await pg.waitForTimeout(250);
t.check((await step()).n === "2 von 5", `tour: Enter: ${(await step()).n}`);
await pg.keyboard.press("Escape");
await pg.waitForTimeout(250);
t.check(!(await R(".tour")), "tour: Esc beendete die Tour nicht");

// ---------------------------------------------------------------- Hilfe im Panel
await pg.keyboard.press("?");
await pg.waitForSelector("haus3d-panel .helpdlg", { timeout: 20000 });
const open = await E(() => {
  const root = window.panel.shadowRoot;
  return { gesten: root.querySelector('details[data-sec="gesten"]').open, others: [...root.querySelectorAll("details[data-sec]")].filter((d) => d.open).length, focus: root.activeElement?.className, dialog: window.panel._dialog === root.querySelector(".dialog-backdrop"), chips: root.querySelectorAll(".hchips button").length, rows: root.querySelectorAll(".htab tbody tr:not(.grp)").length, demoLine: !!root.querySelector(".hdemo") };
});
t.results.hilfeOffen = open;
t.check(open.gesten && open.others === 1, `hilfe: im Panel nur „Gesten“ offen: ${JSON.stringify(open)}`);
t.check(open.focus === "hsearch" && open.dialog && open.chips === 7 && open.rows === 14 && !open.demoLine, `hilfe: Aufbau ${JSON.stringify(open)}`);
await t.shot(pg, "hilfe-panel-gesten.png");
await pg.keyboard.type("wand");
await pg.waitForTimeout(400);
const found = await E(() => {
  const root = window.panel.shadowRoot;
  const first = root.querySelector(".hitem");
  return { title: first?.querySelector("b")?.textContent, sec: first?.querySelector(".hsecname")?.textContent, marks: root.querySelectorAll(".hitem mark").length, count: root.querySelectorAll(".hitem").length, links: [...root.querySelectorAll(".helpdlg a")].map((a) => ({ href: a.href, target: a.target, rel: a.rel })) };
});
t.results.suche = found;
t.check(found.title === "Wand" && found.sec === "Editor-Werkzeuge" && found.marks > 0, `hilfe: Suche „wand“: ${JSON.stringify(found).slice(0, 300)}`);
t.check(found.links.length >= 2 && found.links.every((l) => l.href.startsWith(README_URL) && l.target === "_blank" && /noopener/.test(l.rel)), `hilfe: Links ${JSON.stringify(found.links)}`);
await t.shot(pg, "hilfe-panel-suche-wand.png");
// Esc leert erst die Suche, dann schließt es
await pg.keyboard.press("Escape");
await pg.waitForTimeout(250);
t.check((await E(() => window.panel.shadowRoot.querySelector(".hsearch").value)) === "" && (await R(".helpdlg")), "hilfe: Esc leert nicht erst die Suche");
await pg.keyboard.press("Escape");
await pg.waitForTimeout(250);
t.check(!(await R(".helpdlg")) && (await E(() => window.panel._dialog === null)), "hilfe: Esc schloss nicht");
// Kopfknopf, Suche nach Tasten und Zurücksetzen (ohne Umlaut), Unsinn
await Q("header .help").click();
await pg.waitForSelector("haus3d-panel .helpdlg");
const top = async (q) => {
  await Q(".hsearch").fill(q);
  await pg.waitForTimeout(350);
  return E(() => ({ title: window.panel.shadowRoot.querySelector(".hitem b")?.textContent ?? null, none: window.panel.shadowRoot.querySelector(".hnone")?.textContent ?? null, kbd: [...window.panel.shadowRoot.querySelectorAll(".hitem kbd")].map((k) => k.textContent).slice(0, 4) }));
};
const z = await top("zurucksetzen");
t.check(z.title === "Alles zurücksetzen", `hilfe: „zurucksetzen“ → ${z.title}`);
const k = await top("Strg+Z");
t.check(k.title === "Editor" && k.kbd.includes("Strg+Z"), `hilfe: „Strg+Z“ → ${JSON.stringify(k)}`);
const nix = await top("xyzqwv");
t.check(nix.title === null && /^Nichts gefunden\./.test(nix.none ?? ""), `hilfe: Unsinn → ${JSON.stringify(nix)}`);
await Q(".hsearch").fill("");
await pg.waitForTimeout(300);
t.check((await E(() => window.panel.shadowRoot.querySelectorAll("details[data-sec]").length)) === 7, "hilfe: leere Suche zeigt nicht alle Abschnitte");
// Chip springt zum Abschnitt und klappt ihn auf
await Q('.hchips [data-chip="farben"]').click();
await pg.waitForTimeout(300);
const colors = await E(() => ({ open: window.panel.shadowRoot.querySelector('details[data-sec="farben"]').open, sw: window.panel.shadowRoot.querySelectorAll('details[data-sec="farben"] .hsw i').length }));
t.check(colors.open && colors.sw > 20, `hilfe: Chip „Farben“ ${JSON.stringify(colors)}`);
await t.shot(pg, "hilfe-panel-farben.png");
// Einführung starten schließt die Hilfe und startet die Tour
await Q('[data-act="tour"]').click();
await pg.waitForTimeout(400);
t.check(!(await R(".helpdlg")) && (await step())?.n === "1 von 5", "hilfe: „Einführung starten“");
await pg.keyboard.press("Escape");
await pg.waitForTimeout(200);
// Zeile im Zahnrad
await E(() => window.panel._openSettings());
await pg.waitForTimeout(250);
await Q(".helprow").click();
await pg.waitForSelector("haus3d-panel .helpdlg");
t.check(!(await R(".dialog.basics")), "hilfe: Zahnrad-Dialog blieb offen");
await pg.keyboard.press("Escape");
await pg.waitForTimeout(200);

// ---------------------------------------------------------------- Editor: Tour, Hilfe, Entf
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => window.panel._editor, null, { timeout: 20000 });
await pg.waitForFunction(() => window.panel._tourRun?.kind === "editor", null, { timeout: 8000 });
const e1 = await step();
t.check(e1.n === "1 von 6" && e1.title === "Werkzeuge" && cardInside(e1), `editor-tour: Start ${JSON.stringify(e1)}`);
await t.shot(pg, "hilfe-tour-editor-1.png");
// Entf während der Tour löscht nichts
const victim = await E(() => window.panel._editor.floor.furniture[0].id); // ein Möbelstück der geöffneten Etage
const sofa = () => E((id) => window.panel._editor.floor.furniture.some((f) => f.id === id), victim);
const ctx = () => E(() => window.panel.shadowRoot.querySelector(".hctx span")?.textContent.replace(/\s+/g, " ").trim() ?? null);
await E((id) => {
  const ed = window.panel._editor;
  ed.sel = { kind: "furniture", id };
  ed.render();
  ed.renderProps();
});
await pg.keyboard.press("Delete");
await pg.waitForTimeout(200);
t.check(await sofa(), "editor-tour: Entf löschte hinter der Tour");
const seqE = [e1.title];
for (let n = 0; n < 7; n++) {
  const s = await step();
  if (s.next === "Fertig") break;
  await Q(".tour .next").click();
  await pg.waitForTimeout(350);
  const s2 = await step();
  seqE.push(s2.title);
  t.check(cardInside(s2), `editor-tour: Karte ragt heraus (${s2.title}) ${JSON.stringify(s2.card)}`);
  if (s2.title === "3D-Ansicht") await t.shot(pg, "hilfe-tour-editor-4.png");
}
t.check(JSON.stringify(seqE) === JSON.stringify(["Werkzeuge", "Etagen", "Dach", "3D-Ansicht", "Speichern", "Hilfe"]), `editor-tour: Schritte ${seqE}`);
await pg.keyboard.press("Escape"); // Überspringen
await pg.waitForTimeout(250);
t.check(!(await R(".tour")) && (await stored())?.editor === 1, `editor-tour: Esc/gesehen ${JSON.stringify(await stored())}`);

// Hilfe im Editor: aktives Werkzeug „Wand“
await E(() => {
  const ed = window.panel._editor;
  ed.tool = "wall";
  ed.renderBar();
});
await Q('.ed-bar [data-act="help"]').click();
await pg.waitForSelector("haus3d-panel .helpdlg");
const wall = await E(() => {
  const root = window.panel.shadowRoot;
  return { ctx: root.querySelector(".hctx span")?.textContent.replace(/\s+/g, " ").trim(), hl: root.querySelector(".hitem.hl")?.dataset.id, open: [...root.querySelectorAll("details[data-sec]")].filter((d) => d.open).map((d) => d.dataset.sec), book: root.querySelector(".hbook")?.href, over: root.querySelector(".helpdlg").getBoundingClientRect().height > 0 && getComputedStyle(root.querySelector(".dialog-backdrop")).zIndex };
});
t.results.hilfeEditor = wall;
t.check(wall.ctx === "Aktives Werkzeug: Wand" && wall.hl === "tool:wall" && wall.open.join() === "werkzeuge", `hilfe-editor: ${JSON.stringify(wall)}`);
t.check(wall.book?.startsWith(`${README_URL}#r%C3%A4ume-w%C3%A4nde-fenster-und-t%C3%BCren`), `hilfe-editor: Link ${wall.book}`);
const inView = await E(() => {
  const hl = window.panel.shadowRoot.querySelector(".hitem.hl").getBoundingClientRect();
  const body = window.panel.shadowRoot.querySelector(".hbody").getBoundingClientRect();
  return hl.top >= body.top - 1 && hl.bottom <= body.bottom + 1;
});
t.check(inView, "hilfe-editor: das aktive Werkzeug ist nicht eingescrollt");
await t.shot(pg, "hilfe-editor-wand.png");
await pg.keyboard.press("Escape");
await pg.waitForTimeout(250);

// Auswahl + „?“ + Entf: nichts wird gelöscht; nach dem Schließen wirkt Entf wieder
await E((id) => {
  const ed = window.panel._editor;
  ed.tool = "select";
  ed.sel = { kind: "furniture", id };
  ed.renderBar();
  ed.render();
  ed.renderProps();
}, victim);
await pg.keyboard.press("?");
await pg.waitForSelector("haus3d-panel .helpdlg");
t.check((await ctx()) === "Aktives Werkzeug: Auswählen", `hilfe-editor: Auswählen: ${await ctx()}`);
await pg.keyboard.press("Delete");
await pg.keyboard.press("Backspace");
await pg.waitForTimeout(250);
t.check((await sofa()) && (await E((id) => window.panel._editor.sel?.id === id, victim)), "hilfe-editor: Entf löschte hinter der Hilfe");
await pg.keyboard.press("Escape");
await pg.waitForTimeout(250);
t.check(!(await R(".helpdlg")) && (await sofa()), "hilfe-editor: Esc schloss nicht oder löschte");
// Dach-Ebene: Kamin
await E(() => {
  const ed = window.panel._editor;
  ed._toggleRoofMode(true);
  ed.tool = "chimney";
  ed.renderBar();
});
await pg.keyboard.press("F1");
await pg.waitForSelector("haus3d-panel .helpdlg");
t.check((await ctx()) === "Aktives Werkzeug: Kamin" && (await E(() => window.panel.shadowRoot.querySelector(".hitem.hl")?.dataset.id)) === "roof:chimney", `hilfe-editor: Dach: ${await ctx()}`);
await pg.keyboard.press("F1"); // F1 schaltet zurück
await pg.waitForTimeout(250);
t.check(!(await R(".helpdlg")), "hilfe-editor: F1 schloss die Hilfe nicht");
// Eingabefelder: „?“ im Suchfeld wird getippt, öffnet nichts doppelt
await Q('.ed-bar [data-act="help"]').click();
await pg.waitForSelector("haus3d-panel .helpdlg");
await pg.keyboard.type("?");
t.check((await E(() => window.panel.shadowRoot.querySelector(".hsearch").value)) === "?" && (await R(".helpdlg")), "hilfe: „?“ im Suchfeld");
await pg.keyboard.press("Escape");
await pg.keyboard.press("Escape");
await pg.waitForTimeout(250);
await Q('.ed-bar [data-act="cancel"]').click();
await pg.waitForTimeout(500);
t.check(!(await R(".helpdlg")), "hilfe: blieb nach dem Schließen des Editors offen");

// Netzzugriff: nur die Seite selbst
const res = await E(() => performance.getEntriesByType("resource").map((r) => r.name));
t.results.anfragen = { insgesamt: res.length, fremd: outside };
const origin = `http://localhost:${t.port}/`;
t.check(outside.length === 0 && res.every((u) => u.startsWith(origin) || u.startsWith("data:")), `hilfe: Anfragen nach außen ${JSON.stringify(outside)} ${res.filter((u) => !u.startsWith(origin))}`);

// ---------------------------------------------------------------- Wandtablet: keine Auto-Tour, Hilfe über das Zahnrad
const kiosk = await t.page("hilfe-kiosk", "?kiosk&tour", { width: 1280, height: 800 });
await kiosk.waitForTimeout(2500);
const E2 = (fn, arg) => kiosk.evaluate(fn, arg);
t.check(!(await E2(() => !!window.panel.shadowRoot.querySelector(".tour"))), "kiosk: Auto-Tour am Wandtablet");
await kiosk.locator("haus3d-panel .kgear").click();
await kiosk.waitForTimeout(250);
await kiosk.locator("haus3d-panel .helprow").click();
await kiosk.waitForSelector("haus3d-panel .helpdlg");
await kiosk.locator('haus3d-panel [data-act="tour"]').click();
await kiosk.waitForTimeout(300);
const kt = [];
for (let n = 0; n < 8; n++) {
  const s = await E2(() => {
    const box = window.panel.shadowRoot.querySelector(".tour");
    return box ? { title: box.querySelector(".tt").textContent, text: box.querySelector(".tx").textContent, n: box.querySelector(".tn").textContent, next: box.querySelector(".next").textContent } : null;
  });
  if (!s) break;
  kt.push(s);
  if (s.next === "Fertig") break;
  await kiosk.locator("haus3d-panel .tour .next").click();
  await kiosk.waitForTimeout(300);
}
t.results.kioskTour = kt.map((s) => `${s.n} ${s.title}`);
t.check(kt.length === 5 && /Zahnrad unter „Hilfe & Einführung“/.test(kt.at(-1)?.text ?? ""), `kiosk: Tour ${JSON.stringify(kt)}`);
await t.shot(kiosk, "hilfe-tour-kiosk.png");
await kiosk.locator("haus3d-panel .tour .next").click();

// ---------------------------------------------------------------- Demo-Zweig (Stub von panel._isDemo und .m-demo)
const demo = await t.page("hilfe-demo", "", { width: 1280, height: 800 });
const E3 = (fn, arg) => demo.evaluate(fn, arg);
await E3(() => {
  localStorage.setItem("haus3d.tour", "{}");
  const p = window.panel;
  p._isDemo = () => true;
  const modes = p.shadowRoot.querySelector(".modes");
  modes.hidden = false;
  modes.innerHTML = `<span class="mode m-demo"><span class="mt">Demo: Vorführung</span></span>`;
  p._tourAuto("panel");
});
await demo.waitForFunction(() => window.panel._tourRun, null, { timeout: 6000 });
const d1 = await E3(() => ({ kind: window.panel._tourRun.kind, title: window.panel.shadowRoot.querySelector(".tt").textContent, n: window.panel.shadowRoot.querySelector(".tn").textContent }));
t.check(d1.kind === "demo" && d1.title === "Demo-Haus" && d1.n === "1 von 6", `demo: ${JSON.stringify(d1)}`);
await t.shot(demo, "hilfe-tour-demo.png");
await demo.keyboard.press("Escape");
await demo.waitForTimeout(200);
t.check((await E3(() => JSON.parse(localStorage.getItem("haus3d.tour")).demo)) === 1, "demo: „gesehen“ unter demo gemerkt");
await demo.keyboard.press("?");
await demo.waitForSelector("haus3d-panel .helpdlg");
t.check((await E3(() => window.panel.shadowRoot.querySelector(".hdemo")?.textContent)) === "Demo-Haus: Werte sind simuliert, nichts wird geschaltet.", "demo: Zeile in der Hilfe fehlt");
t.check((await E3(() => !!window.panel.shadowRoot.querySelector('[data-id="start:demo"]'))), "demo: Eintrag „Demo-Haus“ fehlt");
await demo.keyboard.press("Escape");

// ---------------------------------------------------------------- Tablet 768×1024 (Finger)
const tab = await t.page("hilfe-tablet", "?tour", { width: 768, height: 1024, touch: true });
const E4 = (fn, arg) => tab.evaluate(fn, arg);
await tab.waitForFunction(() => window.panel.shadowRoot.querySelector(".tour"), null, { timeout: 10000 });
const tabSteps = [];
for (let n = 0; n < 8; n++) {
  const s = await E4(() => {
    const box = window.panel.shadowRoot.querySelector(".tour");
    const c = box.querySelector(".tour-card").getBoundingClientRect();
    return { title: box.querySelector(".tt").textContent, next: box.querySelector(".next").textContent, in: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, h: Math.round(box.querySelector(".next").getBoundingClientRect().height) };
  });
  tabSteps.push(s);
  if (n === 0 || n === 3) await t.shot(tab, `hilfe-tour-tablet-${n + 1}.png`);
  if (s.next === "Fertig") break;
  await tab.locator("haus3d-panel .tour .next").tap();
  await tab.waitForTimeout(350);
}
t.results.tabletTour = tabSteps.map((s) => s.title);
t.check(tabSteps.length === 5 && tabSteps.every((s) => s.in), `tablet: Tour ${JSON.stringify(tabSteps)}`);
t.check(tabSteps.every((s) => s.h >= 40), `tablet: Knöpfe zu klein ${tabSteps.map((s) => s.h)}`);
await tab.locator("haus3d-panel .tour .next").tap();
await tab.waitForTimeout(300);
await tab.locator("haus3d-panel header .help").tap();
await tab.waitForSelector("haus3d-panel .helpdlg");
const tb = await E4(() => {
  const root = window.panel.shadowRoot;
  const d = root.querySelector(".helpdlg");
  const r = d.getBoundingClientRect();
  return { in: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1 && r.top >= 0, noScrollX: d.scrollWidth <= d.clientWidth + 1 && root.querySelector(".hbody").scrollWidth <= root.querySelector(".hbody").clientWidth + 1, focus: root.activeElement?.className ?? null, bold: getComputedStyle(root.querySelector(".htab td.fin")).fontWeight, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
});
t.results.tabletHilfe = tb;
t.check(tb.in && tb.noScrollX && tb.focus !== "hsearch" && Number(tb.bold) >= 600, `tablet: Hilfe ${JSON.stringify(tb)}`);
await t.shot(tab, "hilfe-tablet.png");
await tab.locator("haus3d-panel .helpdlg .close").tap();
// Editor am Tablet: kompakte Leiste, Tour findet das Werkzeug-Menü
await E4(() => {
  localStorage.setItem("haus3d.tour", '{"panel":1}');
  return window.panel._openEditor();
});
await tab.waitForFunction(() => window.panel._tourRun?.kind === "editor", null, { timeout: 10000 });
const te = await E4(() => {
  const box = window.panel.shadowRoot.querySelector(".tour");
  const hole = box.querySelector(".tour-hole").getBoundingClientRect();
  const menu = window.panel._editor.root.querySelector('.ed-bar [data-menu="tools"]').getBoundingClientRect();
  return { n: box.querySelector(".tn").textContent, hole: [Math.round(hole.left), Math.round(hole.top), Math.round(hole.width)], menu: [Math.round(menu.left), Math.round(menu.top), Math.round(menu.width)] };
});
t.check(te.n === "1 von 6" && Math.abs(te.hole[0] - (te.menu[0] - 6)) <= 2 && Math.abs(te.hole[2] - (te.menu[2] + 12)) <= 2, `tablet: Editor-Tour zeigt auf das Werkzeug-Menü ${JSON.stringify(te)}`);
for (let n = 0; n < 3; n++) await tab.locator("haus3d-panel .tour .next").tap();
await tab.waitForTimeout(300);
const touchText = await E4(() => window.panel.shadowRoot.querySelector(".tx").textContent);
t.check(/Schalter „Nur Ansicht“/.test(touchText), `tablet: Finger-Text der 3D-Ansicht: ${touchText}`);
await t.shot(tab, "hilfe-tour-tablet-editor.png");
await tab.keyboard.press("Escape");
await tab.waitForTimeout(250);
await tab.locator('haus3d-panel .ed-bar [data-act="help"]').tap();
await tab.waitForSelector("haus3d-panel .helpdlg");
await tab.waitForTimeout(300);
await t.shot(tab, "hilfe-tablet-editor.png");
t.check((await E4(() => window.panel.shadowRoot.querySelector(".hctx span")?.textContent.replace(/\s+/g, " ").trim())) === "Aktives Werkzeug: Auswählen", "tablet: Hilfe im Editor ohne aktives Werkzeug");

await t.done();
