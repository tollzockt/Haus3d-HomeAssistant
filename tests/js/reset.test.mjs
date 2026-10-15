// „Alles zurücksetzen“: Bestätigungswort, Dateiname der Sicherung, Sperrgründe und Entwurfsschlüssel (rein, ohne Browser)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { RESET_WORD, backupFileName, draftKeyOf, resetBlocked, resetConfirmOk } from "../../custom_components/haus3d/frontend/reset.js";
import { DRAFT_KEY } from "../../custom_components/haus3d/frontend/editor-touch.js";

const FRONT = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
const src = (f) => readFileSync(new URL(f, FRONT), "utf8");

test("resetConfirmOk: Rand, Groß-/Kleinschreibung und UE für Ü sind egal", () => {
  assert.equal(RESET_WORD, "ZURÜCKSETZEN");
  for (const ok of [" zurücksetzen ", "ZURÜCKSETZEN", "ZURUECKSETZEN", "Zuruecksetzen", "zurücksetzen\n", "ZURÜCKSETZEN"]) assert.equal(resetConfirmOk(ok), true, JSON.stringify(ok));
  for (const no of ["ZURÜCK", "", "  ", "ZURÜCKSETZEN!", "ZURÜCKSETZENN", "ZURUCKSETZEN", "Zurück setzen", null, undefined, 42]) assert.equal(resetConfirmOk(no), false, JSON.stringify(no));
});

test("backupFileName: haus3d-sicherung-JJJJ-MM-TT-HHMM.json in Ortszeit", () => {
  assert.equal(backupFileName(new Date(2026, 9, 15, 8, 30)), "haus3d-sicherung-2026-10-15-0830.json");
  assert.equal(backupFileName(new Date(2026, 0, 5, 0, 7)), "haus3d-sicherung-2026-01-05-0007.json");
  assert.match(backupFileName(), /^haus3d-sicherung-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
});

test("resetBlocked: alle Gründe, die Simulation geht vor, dann Demo, Editor, Hauswechsel", () => {
  assert.equal(resetBlocked(), null);
  assert.equal(resetBlocked({}), null);
  assert.equal(resetBlocked({ sim: true }), "In der Simulation nicht möglich.");
  assert.equal(resetBlocked({ demo: true }), "Im Demo-Haus nicht möglich – das Demo-Haus in der Hausauswahl löschen.");
  assert.equal(resetBlocked({ editor: true }), "Erst den Editor schließen.");
  assert.equal(resetBlocked({ switching: true }), ""); // gesperrt, ohne Text
  // Reihenfolge
  assert.equal(resetBlocked({ sim: true, demo: true, editor: true, switching: true }), "In der Simulation nicht möglich.");
  assert.match(resetBlocked({ demo: true, editor: true, switching: true }), /Demo-Haus/);
  assert.equal(resetBlocked({ editor: true, switching: true }), "Erst den Editor schließen.");
  // „gesperrt“ unterscheidet sich von „möglich“ auch beim leeren Text
  assert.notEqual(resetBlocked({ switching: true }), null);
});

test("draftKeyOf: wie der Editor – eigener Entwurf je weiterem Haus", () => {
  assert.equal(draftKeyOf(null), DRAFT_KEY);
  assert.equal(draftKeyOf(undefined), DRAFT_KEY);
  assert.equal(draftKeyOf("test20261015"), `${DRAFT_KEY}.test20261015`);
  // ein Demo-Haus hat einen eigenen Entwurf (er trägt die eingesetzten Demo-Geräte, nie im Testhaus fortsetzen)
  assert.equal(draftKeyOf("test20261015", true), `${DRAFT_KEY}.test20261015.demo`);
  assert.equal(draftKeyOf(null, true), DRAFT_KEY, "Mein Haus ist nie Demo");
  // das Panel gibt dem Editor denselben Schlüssel
  assert.match(src("haus3d-panel.js"), /`haus3d\.editorDraft\.\$\{this\._house\.id\}\$\{demoAtOpen \? "\.demo" : ""\}`/);
});

test("Verdrahtung: Verlauf nennt „vor Zurücksetzen“, _export nimmt einen Dateinamen, Admin ruft den Dialog", () => {
  const dialogs = src("panel-dialogs.js");
  assert.match(dialogs, /reset: "vor Zurücksetzen"/);
  assert.match(dialogs, /_export\(name = null\)/);
  assert.match(dialogs, /a\.download = name \?\?/);
  const admin = src("panel-admin.js");
  assert.match(admin, /reset: \(\) => this\._resetDialog\(\)/);
  assert.match(admin, /print: \(\) => this\._openPrint\(\)/);
  // der Dialog sichert zuerst (Download), dann der Befehl an das Backend, dann der Entwurf des Hauses und der Editor
  const reset = src("reset.js");
  assert.match(reset, /this\._export\(backupFileName\([^)]*\)\)[\s\S]*haus3d\/building\/reset[\s\S]*draftKeyOf[\s\S]*_setBuilding[\s\S]*_openEditor\(\)/);
  assert.match(reset, /"admin"\)/);
});

test("reset.js hängt am Startbaum, aber ohne Editor-Module", () => {
  for (const f of ["reset.js", "panel-print.js"]) {
    assert.doesNotMatch(src(f), /from\s+"\.\/editor[^"]*"/, f);
    assert.doesNotMatch(src(f), /from\s+"\.\/plan-print\.js"/, `${f}: plan-print.js nur per import()`);
  }
});
