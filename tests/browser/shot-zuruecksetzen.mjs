// „Alles zurücksetzen“ (Admin → Daten & Verlauf): zwei Schritte mit Eintippen, vorher Download der Sicherung, dann der
// Befehl ans Backend (mit Admin-Token und Revision), leeres Haus mit Grundeinstellungen im Editor; Abbrechen, Esc und Klick
// daneben tun nichts; gesperrt in Simulation, Demo-Haus und bei offenem Editor; Testhaus ohne Verlauf (nur Download).
import { readFileSync } from "node:fs";
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
/** Meldungen mitschreiben (eine Meldung steht nur 4 s; bei viel Last wäre sie beim Nachsehen schon weg): window.__toasts. */
const spy = (p) =>
  p.evaluate(() => {
    window.__toasts = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains("toast")) window.__toasts.push({ text: n.textContent, z: n.style.zIndex });
    }).observe(window.panel.shadowRoot, { childList: true, subtree: true });
  });
const pg = await t.page("zuruecksetzen", "");
await spy(pg);
const E = (fn, arg) => pg.evaluate(fn, arg);
const R = (sel) => E((s) => !!window.panel.shadowRoot.querySelector(s), sel);
const T = (sel) => E((s) => window.panel.shadowRoot.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, sel);
const Q = (sel) => pg.locator(`haus3d-panel ${sel}`);
const resets = () => E(() => window.resets ?? 0);
const resetCalls = () => E(() => window.calls.filter((c) => c.type === "haus3d/building/reset").map((c) => ({ revision: c.revision, token: !!c.token, scope: String(c.token).split("-")[1], house: c.house ?? null })));

const realFloors = await E(() => window.panel._building.floors.length);
t.check(realFloors >= 2, `Startstand hat Etagen: ${realFloors}`);
await E(() => localStorage.setItem("haus3d.editorDraft", '{"v":1}')); // alter Entwurf des echten Hauses

// --- Admin → Daten & Verlauf: Knopf abgesetzt unter den vier Knöpfen
await unlock(pg, "admin", { cat: "data" });
await pg.waitForSelector("haus3d-panel .danger-row [data-d=reset]");
const btn = await E(() => {
  const b = window.panel.shadowRoot.querySelector(".danger-row [data-d=reset]");
  const c = b.cloneNode(true);
  c.querySelector("ha-icon").remove(); // die Testseite zeigt als Symbol die ersten Buchstaben des Namens
  return { text: c.textContent.replace(/\s+/g, " ").trim(), disabled: b.disabled, cls: b.className, hint: b.closest(".catbox").querySelector("p.hint").textContent, icon: b.querySelector("ha-icon").getAttribute("icon") };
});
t.results.knopf = btn;
t.check(btn.text === "Alles zurücksetzen …" && !btn.disabled && /danger/.test(btn.cls) && btn.icon === "mdi:restore-alert", `Knopf: ${JSON.stringify(btn)}`);
t.check(btn.hint === "Löscht Grundriss und Haus-Einstellungen. Vorher wird gesichert.", `Hinweis unter dem Knopf: ${btn.hint}`);
await t.shot(pg, "zuruecksetzen-admin.png");

// --- Schritt 1: Text, Abbrechen / Esc / Klick daneben tun nichts
const open = async () => {
  await Q(".danger-row [data-d=reset]").click();
  await pg.waitForSelector("haus3d-panel .resetdlg");
};
await open();
const s1 = await E(() => {
  const d = window.panel.shadowRoot.querySelector(".resetdlg");
  return { role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), title: d.querySelector(".ct span").textContent.trim(), text: d.textContent.replace(/\s+/g, " "), buttons: [...d.querySelectorAll(".cb button")].map((b) => b.textContent.trim()), yesDanger: d.querySelector(".yes").classList.contains("danger"), input: !!d.querySelector("input") };
});
t.results.schritt1 = s1;
t.check(s1.role === "alertdialog" && s1.modal === "true" && s1.title === "Alles zurücksetzen?" && !s1.input, `Schritt 1: ${JSON.stringify(s1)}`);
t.check(s1.text.includes("Gelöscht werden alle Etagen mit Räumen, Wänden, Möbeln, Geräten, Leitungen, Dächern und Garten sowie Name, Norden, Energie, Karten, Hinweise, Kurzwahl, Funktionsrad, Abläufe und Alltag."), "Text „Gelöscht werden …“");
t.check(s1.text.includes("Bleibt erhalten: PINs, eigene 3D-Modelle, Bauplan-Fotos, Testhäuser und die Einstellungen dieses Geräts."), "Text „Bleibt erhalten …“");
t.check(s1.text.includes("Vorher wird gesichert: Download „haus3d-sicherung-…json“ und ein Eintrag „vor Zurücksetzen“ im Verlauf."), "Text „Vorher wird gesichert …“");
t.check(JSON.stringify(s1.buttons) === JSON.stringify(["Abbrechen", "Weiter"]) && s1.yesDanger, "Knöpfe Abbrechen/Weiter (danger)");
await t.shot(pg, "zuruecksetzen-schritt1.png");
await pg.keyboard.press("Escape");
t.check(!(await R(".resetdlg")), "Esc schließt den Dialog nicht");
await open();
await Q(".resetdlg .no").click();
t.check(!(await R(".resetdlg")), "Abbrechen schließt den Dialog nicht");
await open();
await pg.waitForTimeout(500);
await Q(".confirm-backdrop").click({ position: { x: 5, y: 5 } }); // daneben
t.check(!(await R(".resetdlg")), "Klick daneben schließt den Dialog nicht");
t.check((await resets()) === 0 && (await E(() => window.panel._building.floors.length)) === realFloors, "Abbrechen hat etwas zurückgesetzt");

// --- Schritt 2: Knopf gesperrt, bis das Wort stimmt
await open();
await Q(".resetdlg .yes").click();
await pg.waitForSelector("haus3d-panel .resetdlg input.word");
const s2 = await E(() => {
  const d = window.panel.shadowRoot.querySelector(".resetdlg");
  const i = d.querySelector("input.word");
  return { title: d.querySelector(".ct span").textContent.trim(), label: d.querySelector("label.word").textContent.trim(), ac: i.autocomplete, cap: i.getAttribute("autocapitalize"), spell: i.spellcheck, focus: window.panel.shadowRoot.activeElement === i, disabled: d.querySelector(".yes").disabled, yes: d.querySelector(".yes").textContent.trim(), buttons: [...d.querySelectorAll(".cb button")].map((b) => b.textContent.trim()) };
});
t.results.schritt2 = s2;
t.check(s2.title === "Wirklich alles zurücksetzen?" && s2.label === "Zum Bestätigen ZURÜCKSETZEN eintippen", `Schritt 2: ${JSON.stringify(s2)}`);
t.check(s2.ac === "off" && s2.cap === "characters" && s2.spell === false && s2.focus && s2.disabled && s2.yes === "Jetzt zurücksetzen", `Eingabefeld: ${JSON.stringify(s2)}`);
const yes = Q(".resetdlg .yes");
await Q(".resetdlg input.word").fill("ZURÜCK");
t.check(await yes.isDisabled(), "Knopf frei bei „ZURÜCK“");
await pg.keyboard.press("Enter");
t.check((await resets()) === 0, "Enter löste mit falschem Wort aus");
await Q(".resetdlg input.word").fill("");
t.check(await yes.isDisabled(), "Knopf frei bei leerem Feld");
await Q(".resetdlg input.word").fill(" zuruecksetzen ");
t.check(!(await yes.isDisabled()), "„zuruecksetzen“ (UE, klein, Rand) wird nicht angenommen");
await Q(".resetdlg input.word").fill("ZURÜCKSETZEN");
t.check(!(await yes.isDisabled()), "„ZURÜCKSETZEN“ wird nicht angenommen");
await t.shot(pg, "zuruecksetzen-schritt2.png");

// --- Ausführen: Download, Befehl (Admin-Token, Revision), leeres Haus, Grundeinstellungen
const download = pg.waitForEvent("download");
await yes.click();
const dl = await download;
const name = dl.suggestedFilename();
t.results.sicherung = name;
t.check(/^haus3d-sicherung-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(name), `Name der Sicherung: ${name}`);
const saved = JSON.parse(readFileSync(await dl.path(), "utf8"));
t.check(saved.format === "haus3d" && saved.building.floors.length === realFloors, `Sicherung enthält den alten Stand: ${saved.format}, ${saved.building?.floors?.length} Etagen`);
await pg.waitForFunction(() => window.panel._building.floors.length === 0 && window.panel._editor, null, { timeout: 40000 });
await pg.waitForSelector("haus3d-panel .ed-setup", { timeout: 30000 });
const after = await E(() => ({
  resets: window.resets,
  admin: window.panel._adminOpen,
  dialog: !!window.panel._dialog,
  resetEl: !!window.panel.shadowRoot.querySelector(".resetdlg"),
  floors: window.panel._building.floors.length,
  revision: window.panel._revision,
  draft: localStorage.getItem("haus3d.editorDraft"),
  toast: window.__toasts?.at(-1)?.text,
  toastZ: window.__toasts?.at(-1)?.z,
  setup: !!window.panel.shadowRoot.querySelector(".ed-setup"),
}));
t.results.danach = after;
t.check(after.resets === 1, `Befehl gesendet: ${after.resets}×`);
t.check(after.floors === 0 && after.revision === 2 && !after.admin && !after.dialog && !after.resetEl, `Zustand danach: ${JSON.stringify(after)}`);
t.check(after.draft === null, "Entwurf des Hauses nicht gelöscht");
t.check(after.setup, "Grundeinstellungen nicht offen");
t.check(after.toast === "Zurückgesetzt. Sicherung: Download und Verlauf („vor Zurücksetzen“).", `Meldung: ${after.toast}`);
t.check(after.toastZ === "20", `Meldung liegt nicht über dem Editor: z-index ${after.toastZ}`);
const calls = await resetCalls();
t.check(calls.length === 1 && calls[0].revision === 1 && calls[0].token && calls[0].scope === "admin" && calls[0].house === null, `Befehl: ${JSON.stringify(calls)}`);
await t.shot(pg, "zuruecksetzen-fertig.png");

// --- Simulation: gesperrt mit Grund
const sim = await t.page("zuruecksetzen-sim", "");
await spy(sim);
const SE = (fn, arg) => sim.evaluate(fn, arg);
await SE(() => (window.panel._adminMode = true, window.panel._setSim(true)));
await sim.waitForFunction(() => window.panel._sim, null, { timeout: 30000 });
await unlock(sim, "admin", { cat: "data" });
await sim.waitForSelector("haus3d-panel .danger-row [data-d=reset]");
const simBtn = await SE(() => ({ disabled: window.panel.shadowRoot.querySelector("[data-d=reset]").disabled, hint: window.panel.shadowRoot.querySelector(".catbox p.hint").textContent }));
t.results.simulation = simBtn;
t.check(simBtn.disabled && simBtn.hint === "In der Simulation nicht möglich.", `Simulation: ${JSON.stringify(simBtn)}`);
await sim.locator("haus3d-panel [data-d=reset]").click({ force: true, timeout: 2000 }).catch(() => {}); // gesperrt: nichts passiert
await SE(() => window.panel._resetDialog());
t.check(!(await SE(() => !!window.panel.shadowRoot.querySelector(".resetdlg"))) && (await SE(() => window.resets ?? 0)) === 0, "Simulation öffnete den Dialog oder setzte zurück");
t.check((await SE(() => window.__toasts?.at(-1)?.text)) === "In der Simulation nicht möglich.", "Simulation: Grund nicht gemeldet");
// Demo-Haus (Schnittstelle des Demo-Teils) und Hauswechsel
await SE(() => window.panel._setSim(false));
await sim.waitForFunction(() => !window.panel._sim, null, { timeout: 30000 });
await SE(() => {
  window.panel._isDemo = () => true;
});
await SE(() => window.panel._resetDialog());
t.check(!(await SE(() => !!window.panel.shadowRoot.querySelector(".resetdlg"))) && (await SE(() => window.__toasts?.at(-1)?.text)) === "Im Demo-Haus nicht möglich – das Demo-Haus in der Hausauswahl löschen.", "Demo-Haus: Grund nicht gemeldet");
await SE(() => {
  delete window.panel._isDemo;
  window.panel._switching = true;
});
await SE(() => window.panel._resetDialog());
t.check(!(await SE(() => !!window.panel.shadowRoot.querySelector(".resetdlg"))), "Hauswechsel: Dialog offen");
await SE(() => {
  window.panel._switching = false;
});

// --- offener Editor: gesperrt („Erst den Editor schließen.“)
await unlock(sim, "edit");
await sim.locator("haus3d-panel .edit").click();
await sim.waitForFunction(() => window.panel._editor, null, { timeout: 40000 });
await SE(() => window.panel._resetDialog());
t.check(!(await SE(() => !!window.panel.shadowRoot.querySelector(".resetdlg"))) && (await SE(() => window.__toasts?.at(-1)?.text)) === "Erst den Editor schließen.", "Editor offen: Grund nicht gemeldet");

// --- Testhaus: anderer Text, kein Verlauf, der Rest bleibt
const th = await t.page("zuruecksetzen-testhaus", "");
await spy(th);
const TE = (fn, arg) => th.evaluate(fn, arg);
await unlock(th, "admin", { cat: "houses" });
await th.waitForSelector("haus3d-panel .houses .thnew");
await th.locator("haus3d-panel .houses .thname").fill("Spielwiese");
await th.locator("haus3d-panel .houses .thsrc").selectOption("example");
await th.locator("haus3d-panel .houses .thdemonew").uncheck();
await th.locator('haus3d-panel .houses [data-th="new"]').click();
await th.waitForFunction(() => window.panel._house?.name === "Spielwiese" && !window.panel._switching && window.panel._buildingHouse === window.panel._house.id, null, { timeout: 20000 });
await th.waitForTimeout(500);
const houseId = await TE(() => window.panel._house.id);
const realBefore = await TE(() => ({ saves: window.realSaves ?? 0, floors: window.panel._building.floors.length }));
t.check(realBefore.floors >= 2, `Testhaus hat Etagen: ${realBefore.floors}`);
await TE((id) => localStorage.setItem(`haus3d.editorDraft.${id}`, '{"v":1}'), houseId);
await TE(() => window.panel._openAdmin("data"));
await th.waitForSelector("haus3d-panel .danger-row [data-d=reset]");
t.check(!(await th.locator("haus3d-panel [data-d=reset]").isDisabled()), "Testhaus: Knopf gesperrt");
await th.locator("haus3d-panel [data-d=reset]").click();
await th.waitForSelector("haus3d-panel .resetdlg");
const thText = await TE(() => window.panel.shadowRoot.querySelector(".resetdlg").textContent.replace(/\s+/g, " "));
t.check(thText.includes("Testhaus: kein Verlauf – gesichert wird nur per Download.") && !thText.includes("Eintrag „vor Zurücksetzen“"), `Testhaus-Text: ${thText}`);
await th.locator("haus3d-panel .resetdlg .yes").click();
await th.locator("haus3d-panel .resetdlg input.word").fill("zurücksetzen");
const thDownload = th.waitForEvent("download");
await th.keyboard.press("Enter"); // Enter löst aus
t.check(/^haus3d-sicherung-/.test((await thDownload).suggestedFilename()), "Testhaus: keine Sicherung als Download");
await th.waitForFunction(() => window.panel._building.floors.length === 0 && window.panel._editor, null, { timeout: 40000 });
await th.waitForSelector("haus3d-panel .ed-setup", { timeout: 30000 });
const thAfter = await TE((id) => ({
  resets: window.resets,
  call: window.calls.find((c) => c.type === "haus3d/building/reset"),
  sandbox: window.sandbox[id].building.floors.length,
  saves: window.realSaves ?? 0,
  draft: localStorage.getItem(`haus3d.editorDraft.${id}`),
  toast: window.__toasts?.at(-1)?.text,
  house: window.panel._house?.id,
}), houseId);
t.results.testhaus = thAfter;
t.check(thAfter.resets === 1 && thAfter.call.house === houseId && thAfter.sandbox === 0 && thAfter.saves === realBefore.saves && thAfter.draft === null && thAfter.house === houseId, `Testhaus danach: ${JSON.stringify(thAfter)}`);
t.check(thAfter.toast === "Zurückgesetzt. Sicherung als Download.", `Testhaus-Meldung: ${thAfter.toast}`);

// --- Fehler: Konflikt und Sicherung (kein Haus verändert)
const err = await t.page("zuruecksetzen-fehler", "");
await spy(err);
const EE = (fn, arg) => err.evaluate(fn, arg);
await EE(() => {
  const orig = window.hass.callWS;
  window.hass.callWS = async (msg) => {
    if (msg.type === "haus3d/building/reset") throw { code: "conflict", message: "Der Stand wurde inzwischen geändert" };
    return orig(msg);
  };
});
await unlock(err, "admin", { cat: "data" });
await err.waitForSelector("haus3d-panel .danger-row [data-d=reset]");
await err.locator("haus3d-panel [data-d=reset]").click();
await err.locator("haus3d-panel .resetdlg .yes").click();
await err.locator("haus3d-panel .resetdlg input.word").fill("ZURÜCKSETZEN");
const errDownload = err.waitForEvent("download");
await err.locator("haus3d-panel .resetdlg .yes").click();
await errDownload;
await err.waitForFunction(() => !window.panel.shadowRoot.querySelector(".resetdlg"), null, { timeout: 20000 });
const errAfter = await EE(() => ({ toast: window.__toasts?.at(-1)?.text, floors: window.panel._building.floors.length, editor: !!window.panel._editor }));
t.results.konflikt = errAfter;
t.check(errAfter.toast === "Inzwischen woanders geändert – nichts zurückgesetzt. Seite neu laden." && errAfter.floors === realFloors && !errAfter.editor, `Konflikt: ${JSON.stringify(errAfter)}`);

await t.done();
