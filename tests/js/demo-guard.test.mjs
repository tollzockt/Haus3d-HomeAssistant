// Demo-Wächter: im Demo-Haus darf nichts an Home Assistant gehen. Alle Stellen im Frontend, die echte Dienste,
// callApi, "call_service" oder den HA-Dialog (hass-more-info) benutzen, sind hier gezählt und geprüft; jede neue
// Stelle (auch in künftigen Funktionen: Automationen, Abläufe …) schlägt fehl, bis sie geprüft und eingetragen ist.
// Dienste im Panel gehen künftig nur über this._hass.callService (Demo-Wrapper simuliert sie); neue WS-Befehle
// werden bewusst in DEMO_WS_PASS (lesend, ohne Wirkung auf Echtes) oder in die Sperrliste unten aufgenommen.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { test } from "node:test";

import { DEMO_WS_PASS } from "../../custom_components/haus3d/frontend/demo.js";

const dir = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));
const count = (text, re) => (text.match(re) ?? []).length;

// Muster → {Datei: höchstens so viele Stellen} mit Begründung. Stellen sind geprüft: im Demo-Haus erreicht keine
// davon Home Assistant (Wrapper-Kette real → DemoHouse.wrap → houseGuard; Panel-Zweige hinter this._demo).
const REVIEWED = [
  {
    name: "_realHass.call… (echtes hass am Wrapper vorbei)",
    re: /_realHass\.call/g,
    allowed: { "panel-access.js": 2 }, // _doorUnlock (nur über doorGuard erreichbar, im Demo-Haus stiller Abbruch)
  },
  {
    name: "callApi( (Konfiguration in Home Assistant)",
    re: /callApi\(/g,
    // access.js: houseGuard/Testhaus; panel-scenes.js: Szenen speichern/löschen (im Demo-Haus vorher abgefangen, sonst vom Wrapper abgelehnt);
    // sim.js: Simulation reicht nur GET durch
    allowed: { "access.js": 1, "panel-scenes.js": 2, "sim.js": 1 },
  },
  {
    name: '"call_service" (Dienst über WebSocket)',
    re: /"call_service"/g,
    allowed: { "panel-timeline.js": 1 }, // Wettervorhersage im Zeitstrahl (im Demo-Haus gibt es keinen Zeitstrahl; der Wrapper lehnt den Befehl ab)
  },
  {
    name: "hass-more-info (HA-Dialog mit echtem hass)",
    re: /hass-more-info/g,
    allowed: { "haus3d-panel.js": 1 }, // _moreInfo: im Demo-Haus immer der Demo-Dialog
  },
  {
    name: "real.callService (Tür-Schutz)",
    re: /\breal\.callService/g,
    allowed: { "access.js": 1 }, // doorGuard
  },
  {
    name: "_realHass ?? this._hass (echtes hass statt der Kette)",
    re: /_realHass \?\? this\._hass/g,
    // haus3d-panel.js: Getter `hass` für Home Assistant; panel-smart.js: _loadRoomEnergy (im Demo-Haus this._hass);
    // panel-timeline.js: _timelineOpen (im Demo-Haus vorher abgebrochen)
    allowed: { "haus3d-panel.js": 1, "panel-smart.js": 1, "panel-timeline.js": 1 },
  },
  {
    name: "Navigation in Home Assistant (history.pushState)",
    re: /history\.pushState/g,
    allowed: { "panel-media.js": 1 }, // Ablauf ansehen/Bearbeiten: im Demo-Haus ausgeblendet und abgefangen
  },
];

for (const { name, re, allowed } of REVIEWED) {
  test(`Zählliste: ${name}`, () => {
    for (const [f, text] of Object.entries(src)) {
      const n = count(text, re);
      assert.ok(n <= (allowed[f] ?? 0), `${f}: ${n} Stelle(n) für ${name}, geprüft sind ${allowed[f] ?? 0} – neue Stelle erst auf Demo-Haus-Tauglichkeit prüfen und hier eintragen`);
    }
  });
}

// alle WebSocket-Befehle, die das Frontend mit festem Namen sendet
const WS_TYPE = /type: "((?:haus3d|recorder|history|energy|frontend|config|auth|system_log|lovelace|search|call_service)[a-z_/0-9]*)"/g;
const USED = new Set(Object.values(src).flatMap((t) => [...t.matchAll(WS_TYPE)].map((m) => m[1])));
// vom Wrapper selbst beantwortet
const ANSWERED = ["recorder/statistics_during_period", "history/history_during_period"];
// im Demo-Haus gesperrt (Wirkung aufs Echte, Nutzerdaten, Entwickler- und Sicherheitsfunktionen)
const BLOCKED = [
  "call_service",
  "energy/get_prefs",
  "frontend/get_user_data",
  "frontend/set_user_data",
  "haus3d/away/set",
  "haus3d/away/status",
  "haus3d/building/reset", // „Alles zurücksetzen“: im Demo-Haus gesperrt (Oberfläche und Erlaubnisliste)
  "haus3d/climate/pause",
  "haus3d/dev/clear",
  "haus3d/dev/set",
  "haus3d/lock/unlock",
  "haus3d/models/delete",
  "haus3d/models/list",
  "haus3d/models/rename",
  "haus3d/pin/set",
  "haus3d/subscribe", // läuft über die echte Verbindung (nur Panel-Befehle wie show/notify)
];

test("Jeder WebSocket-Befehl des Frontends ist eingeordnet: durchgelassen, selbst beantwortet oder gesperrt", () => {
  assert.ok(USED.size > 20, `${USED.size} Befehle gefunden`);
  const known = new Set([...DEMO_WS_PASS, ...ANSWERED, ...BLOCKED]);
  const unknown = [...USED].filter((t) => !known.has(t));
  assert.deepEqual(unknown, [], "neuer WebSocket-Befehl: bewusst in DEMO_WS_PASS aufnehmen (nur wenn er nichts Echtes ändert) oder als gesperrt eintragen");
  // keine Überschneidung zwischen durchgelassen und gesperrt
  assert.deepEqual(DEMO_WS_PASS.filter((t) => BLOCKED.includes(t) || ANSWERED.includes(t)), []);
});

test("Erlaubnisliste: nur Grundriss, Hintergrund, Verlauf des Hauses, PIN-Prüfung und Häuser", () => {
  for (const t of DEMO_WS_PASS) assert.match(t, /^haus3d\/(building\/(get|save)|background\/(get|set)|history\/(list|snapshot|restore)|pin\/(status|verify|lock)|sandbox\/(list|create|delete|update))$/, t);
  for (const t of ["haus3d/pin/set", "haus3d/lock/unlock", "haus3d/climate/pause", "haus3d/dev/set", "haus3d/dev/clear", "haus3d/away/set", "call_service", "energy/get_prefs", "frontend/set_user_data"]) assert.ok(!DEMO_WS_PASS.includes(t), t);
});

test("Demo-Module rufen nie echte Dienste oder die HA-Konfiguration auf", () => {
  for (const f of ["demo.js", "demo-build.js", "demo-energy.js"]) {
    const text = src[f].replace(/\/\/.*$/gm, ""); // Kommentare zählen nicht
    for (const re of [/\.callService\(/, /\.callApi\(/, /hass-more-info/, /"call_service"/, /fetchWithAuth/, /\.connection\b/, /localStorage/]) {
      assert.doesNotMatch(text, re, `${f}: ${re}`);
    }
    // real wird nur für callWS (Erlaubnisliste) gelesen
    for (const m of text.matchAll(/\breal\??\.call\w*/g)) assert.equal(m[0], "real.callWS", `${f}: ${m[0]}`);
  }
});

// Panel-Anbindung (Paket 1c-C): die Stellen, die an der Simulation vorbei gingen, haben ihren Demo-Zweig vor dem echten Weg
const body = (file, head) => {
  const text = src[file];
  const at = text.indexOf(head);
  assert.ok(at >= 0, `${file}: ${head} fehlt`);
  return text.slice(at, at + 3000);
};

test("Panel: hass-Kette im Demo-Haus ist echt → Demo-Wrapper → houseGuard (demo), ohne Tür-Schutz, Zeitstrahl oder Simulation", () => {
  const wrap = body("haus3d-panel.js", "_wrapHass(real) {");
  assert.match(wrap, /let hass = demo \? this\._demoHass\(real\) :/);
  assert.match(wrap, /houseGuard\(hass, this\._house\.id, \{[^}]*\bdemo\b/);
  assert.match(src["haus3d-panel.js"], /set hass\(real\) \{[\s\S]{0,600}?this\._wrapHass\(real\)/);
  // Hülle, solange der Demo-Teil lädt: keine Zustände, Befehle gehen erst durch den Demo-Wrapper
  const shell = body("haus3d-panel.js", "_demoHass(real) {");
  assert.match(shell, /states: \{\}, entities: \{\}/);
  assert.doesNotMatch(shell.slice(0, shell.indexOf("_demoLoad() {")), /real\.call|_realHass\.call/);
  // Demo-Teil nur per import() (nicht am Startbaum)
  assert.match(src["haus3d-panel.js"], /loadOnce\("demo", \(\) => import\("\.\/panel-demo\.js"\)\)/);
  for (const f of files.filter((x) => x !== "panel-demo.js" && !x.startsWith("demo"))) assert.doesNotMatch(src[f], /from\s+"\.\/(panel-demo|demo|demo-build|demo-energy)\.js"/, `${f} importiert den Demo-Teil statisch`);
});

test("Panel: HA-Dialog, Zeitstrahl, Raum-Energie, Navigation, Szenen und Kamerabild sind im Demo-Haus abgefangen", () => {
  const more = body("haus3d-panel.js", "_moreInfo(entityId) {");
  assert.ok(more.indexOf("this._isDemo()") >= 0 && more.indexOf("this._isDemo()") < more.indexOf("hass-more-info"), "_moreInfo: Demo-Zweig vor dem HA-Dialog");
  const run = body("haus3d-panel.js", "async _runAction(");
  assert.ok(run.indexOf("this._demoAction(") >= 0 && run.indexOf("this._demoAction(") < run.indexOf("callService("), "_runAction: demoAction vor dem Dienst");
  const tl = body("panel-timeline.js", "async _timelineOpen() {");
  assert.ok(tl.indexOf("_isDemo") >= 0 && tl.indexOf("_isDemo") < tl.indexOf("callWS"), "_timelineOpen: Demo-Zweig vor Verlauf und Vorhersage");
  assert.match(body("panel-smart.js", "async _loadRoomEnergy() {"), /this\._isDemo\?\.\(\) \? this\._hass :/);
  const media = body("panel-media.js", "_routineSheet(entityId) {");
  assert.match(media, /const admin = this\._editing\(\) && !this\._isDemo\?\.\(\)/);
  assert.ok(media.indexOf("if (this._isDemo?.()) return;") < media.indexOf("history.pushState"), "Navigation in HA im Demo-Haus");
  assert.match(body("panel-media.js", "_cameraDialog(entityId"), /const src = demo \? null : cameraSrc/);
  for (const head of ["_sceneDialog(floor, room) {", "async _deleteRoomScene(floor, room, sc) {"]) {
    const s = body("panel-scenes.js", head);
    assert.ok(s.indexOf("_isDemo") >= 0 && s.indexOf("_isDemo") < s.indexOf("callApi"), `${head}: Demo-Zweig vor callApi`);
  }
  assert.match(body("panel-dialogs.js", "_export(name = null) {"), /this\._isDemo\?\.\(\) \? this\._demoStrip\(this\._building\)/);
});

test("Panel-Demo-Teil: Dienste nur über das Demo-hass, nie über das echte", () => {
  const text = src["panel-demo.js"].replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(text, /_realHass\.call|\breal\.call|hass-more-info|"call_service"|\.callApi\(|history\.pushState/);
  assert.match(text, /const d = this\._demo;\s*return d\.wrap\(real,/);
});

test("Demo-Module nennen keine Marken-Typen des Katalogs (nur Präfixe und Listen), Dateigrenze", async () => {
  const { FURNITURE } = await import("../../custom_components/haus3d/frontend/furniture.js");
  // Typen mit Herstellernamen im Schlüssel: Möbelserien, Konsolen, Wallboxen, Wechselrichter, Speicher, Mikro-Wechselrichter
  const branded = Object.keys(FURNITURE).filter((k) => /^(ikea_|console_.|wallbox_|inv_|bat_|micro_)/.test(k) || k === "steam_deck");
  assert.ok(branded.length > 50);
  for (const f of ["demo.js", "demo-build.js", "demo-energy.js"]) {
    for (const key of branded) assert.ok(!src[f].includes(key), `${f} nennt den Typ ${key}`);
  }
  for (const f of files) assert.ok(statSync(new URL(f, dir)).size < 125000, `${f} über 125 000 Byte`);
});
