// PIN-Feld, Freigabe mit Ablauf, Token an Befehlen, Energie-Karte (Reihenfolge, Ausblenden, Namen)
import assert from "node:assert/strict";
import { test } from "node:test";

import { accessScope, canAdmin, canEdit, clearAccess, doorGuard, newPinError, pinKey, setAccess, withToken } from "../../custom_components/haus3d/frontend/access.js";
import { energyRowList, energyRows } from "../../custom_components/haus3d/frontend/panel-util.js";

test("PIN-Feld: ab 4 Ziffern prüfen, höchstens 8, löschen", () => {
  let p = "";
  for (const k of ["1", "2", "3"]) {
    const r = pinKey(p, k);
    p = r.pin;
    assert.equal(r.check, false);
  }
  assert.deepEqual(pinKey(p, "4"), { pin: "1234", check: true });
  assert.deepEqual(pinKey("12345678", "9"), { pin: "12345678", check: false });
  assert.deepEqual(pinKey("123", "back"), { pin: "12", check: false });
  assert.deepEqual(pinKey("123", "clear"), { pin: "", check: false });
  assert.deepEqual(pinKey("12", "x"), { pin: "12", check: false });
  assert.equal(newPinError("12", "12"), "4 bis 8 Ziffern");
  assert.equal(newPinError("1234", "1235"), "Die beiden Eingaben stimmen nicht überein");
  assert.equal(newPinError("4711", "4711"), null);
});

test("Freigabe: Bereiche, Ablauf nach 10 min, Token am Befehl", () => {
  clearAccess();
  assert.deepEqual(withToken({ type: "x" }), { type: "x" });
  setAccess("t1", "edit", 1000);
  assert.ok(canEdit(1000) && !canAdmin(1000));
  setAccess("t2", "admin", 1000);
  assert.ok(canEdit(2000) && canAdmin(2000));
  assert.equal(accessScope(1000 + 10 * 60000 + 1), null);
  setAccess("t3", "edit");
  assert.equal(withToken({ type: "x" }).token, "t3");
  clearAccess();
});

test("Energie-Karte: Reihenfolge, Ausblenden, eigene Namen, Zusatzwerte", () => {
  const hass = { states: { "sensor.pv": { attributes: {} }, "sensor.bkw": { attributes: {} }, "sensor.netz": { attributes: {} }, "sensor.akku": { attributes: {} }, "sensor.wp": { attributes: { friendly_name: "Wärmepumpe", device_class: "power" } } } };
  const energy = { netz: "sensor.netz", sources: [{ id: "pv_1", type: "pv", name: "Dach", power: "sensor.pv" }, { id: "bkw_1", type: "bkw", name: "Balkon", power: "sensor.bkw" }, { id: "s", type: "speicher", soc: "sensor.akku" }], extra: [{ entity: "sensor.wp" }] };
  assert.deepEqual(energyRows(energy, hass).map((r) => r.id), ["verbrauch", "bezug", "einspeisung", "erzeugung", "akku_ladestand", "src:pv_1", "src:bkw_1", "x:sensor.wp"]);
  const card = { rows: [{ key: "akku_ladestand", name: "Batterie" }, { key: "x:sensor.wp" }, { key: "bezug", hidden: true }] };
  const list = energyRowList(energy, hass, card);
  assert.deepEqual(list.slice(0, 3).map((r) => [r.id, r.hidden]), [["akku_ladestand", false], ["x:sensor.wp", false], ["bezug", true]]);
  const rows = energyRows(energy, hass, card);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.name), ["Batterie", "Wärmepumpe", "Hausverbrauch"]);
  assert.equal(rows[0].key, "akku_ladestand"); // Balken hängt am Schlüssel
  assert.equal(rows[1].key, null);
});

test("Tür-Schutz: nur lock.unlock/open gehen an die Tür-PIN, Zustände bleiben", async () => {
  const real = { states: { "lock.haustuer": { state: "locked" } }, calls: [], callService(d, s, data) { this.calls.push(`${d}.${s}`); return Promise.resolve(); } };
  const guarded = [];
  const h = doorGuard(real, (svc, data) => {
    guarded.push(`${svc}:${data.entity_id}`);
    return Promise.resolve();
  });
  assert.equal(h.states, real.states);
  await h.callService("lock", "unlock", { entity_id: "lock.haustuer" });
  await h.callService("lock", "open", { entity_id: "lock.haustuer" });
  await h.callService("lock", "lock", { entity_id: "lock.haustuer" });
  await h.callService("light", "toggle", { entity_id: "light.flur" });
  assert.deepEqual(guarded, ["unlock:lock.haustuer", "open:lock.haustuer"]);
  assert.deepEqual(real.calls, ["lock.lock", "light.toggle"]);
  assert.equal(doorGuard(null, () => {}), null);
});

test("Testhaus: Grundriss-Befehle gehen ans Testhaus, Geräte bleiben unberührt", async () => {
  const { houseGuard, loadHouse } = await import("../../custom_components/haus3d/frontend/access.js");
  const sent = [];
  const services = [];
  const api = [];
  const real = {
    states: { "light.a": { state: "on" } },
    callWS: async (m) => (sent.push(m), { ok: true }),
    callService: async (...a) => services.push(a),
    callApi: async (...a) => (api.push(a), {}),
  };
  const blocked = [];
  const h = houseGuard(real, "test123", { onBlocked: (w) => blocked.push(w) });
  assert.equal(h.states["light.a"].state, "on"); // Zustände wie echt
  await h.callWS({ type: "haus3d/building/save", building: {} });
  await h.callWS({ type: "haus3d/background/get", floor_id: "eg" });
  await h.callWS({ type: "haus3d/history/list" });
  await h.callWS({ type: "haus3d/pin/status" });
  assert.deepEqual(sent.map((m) => m.house), ["test123", "test123", "test123", undefined]);
  await assert.rejects(h.callService("light", "turn_off", { entity_id: "light.a" }), { code: "testhaus", quiet: true }); // kein Erfolg melden
  await assert.rejects(h.callWS({ type: "haus3d/lock/unlock", entity_id: "lock.tuer", pin: "1" }), { code: "testhaus" });
  await assert.rejects(h.callApi("POST", "config/scene/config/x", {}), { code: "testhaus" });
  await h.callApi("GET", "history/period");
  assert.equal(services.length, 0);
  assert.equal(api.length, 1);
  assert.deepEqual(blocked, ["light.turn_off", "haus3d/lock/unlock", "config/scene/config/x"]);
  // live: Geräte echt, Grundriss trotzdem im Testhaus
  const live = houseGuard(real, "test123", { live: true });
  await live.callService("light", "turn_on", { entity_id: "light.a" });
  await live.callWS({ type: "haus3d/building/get" });
  assert.equal(services.length, 1);
  assert.equal(sent.at(-1).house, "test123");
  // auch live und in der Simulation: HA-Konfiguration und PINs bleiben unberührt
  await assert.rejects(live.callApi("DELETE", "config/scene/config/x"), { code: "testhaus" });
  await assert.rejects(live.callWS({ type: "haus3d/pin/set", scope: "door", pin: "1234" }), { code: "testhaus" });
  const sim = houseGuard(real, "test123", { sim: true });
  await sim.callService("light", "toggle", { entity_id: "light.a" }); // die Simulation schaltet selbst
  assert.equal(services.length, 2);
  await assert.rejects(sim.callApi("POST", "config/scene/config/y", {}), { code: "testhaus" });
  await assert.rejects(sim.callWS({ type: "haus3d/away/set", on: true }), { code: "testhaus" });
  assert.equal(houseGuard(real, null), real);
  // gemerkte Auswahl: nur gültige Kennungen
  assert.deepEqual(loadHouse('{"id":"test42","name":"Spiel"}'), { id: "test42", name: "Spiel", live: false, demo: false });
  assert.equal(loadHouse('{"id":"../x"}'), null);
  assert.equal(loadHouse(""), null);
  assert.equal(loadHouse(null), null);
  assert.equal(loadHouse("kein json"), null);
  assert.equal(loadHouse('{"id":"real"}'), null); // Mein Haus hat keine Kennung und ist nie Demo
});

test("Haus dieses Browsers: Demo-Kästchen wird gemerkt, ein Demo-Haus ist nie live", async () => {
  const { loadHouse } = await import("../../custom_components/haus3d/frontend/access.js");
  assert.deepEqual(loadHouse('{"id":"test7","name":"Vorführhaus 1","live":false,"demo":true}'), { id: "test7", name: "Vorführhaus 1", live: false, demo: true });
  assert.deepEqual(loadHouse('{"id":"test7","name":"Testhaus","live":true,"demo":false}'), { id: "test7", name: "Testhaus", live: true, demo: false });
  // „live“ gilt nie für Demo; nur ein echtes true zählt (Zeichenketten und Zahlen nicht)
  assert.equal(loadHouse('{"id":"test7","name":"x","live":true,"demo":true}').live, false);
  assert.equal(loadHouse('{"id":"test7","name":"x","live":"true","demo":"true"}').demo, false);
  assert.equal(loadHouse('{"id":"test7","name":"x","live":1}').live, false);
  // ältere Einträge ohne demo: Testhaus (wird beim nächsten Laden vom Backend berichtigt)
  assert.equal(loadHouse('{"id":"test7","name":"alt"}').demo, false);
  assert.equal(loadHouse('{"id":"test7"}').name, "Testhaus");
  assert.equal(loadHouse('{"id":"test7","demo":true}').name, "Demo");
});

test("Demo-Haus: houseGuard gilt als Simulation und nie als live; Dienste gehen an den Demo-Wrapper", async () => {
  const { houseGuard } = await import("../../custom_components/haus3d/frontend/access.js");
  const sent = [];
  const services = [];
  const api = [];
  const wrapper = {
    states: { "light.demo": { state: "off" } },
    callWS: async (m) => (sent.push(m), { ok: true }),
    callService: async (...a) => services.push(a), // der Demo-Wrapper simuliert selbst
    callApi: async (...a) => (api.push(a), {}),
  };
  const blocked = [];
  // live wird im Demo-Haus ignoriert
  const h = houseGuard(wrapper, "test7", { live: true, demo: true, onBlocked: (w) => blocked.push(w) });
  assert.equal(h.haus3dHouse, "test7");
  assert.equal(h.states["light.demo"].state, "off");
  await h.callService("light", "turn_on", { entity_id: "light.demo" });
  assert.equal(services.length, 1); // an den Wrapper, nicht abgelehnt
  // Grundriss, Verlauf, Bauplan-Foto gehen ins Haus
  await h.callWS({ type: "haus3d/building/get" });
  await h.callWS({ type: "haus3d/background/get", floor_id: "eg" });
  await h.callWS({ type: "haus3d/history/list" });
  await h.callWS({ type: "haus3d/pin/status" });
  assert.deepEqual(sent.map((m) => m.house), ["test7", "test7", "test7", undefined]);
  // Tür-PIN, Heizung pausieren, Urlaub, PINs, Entwickler: auch mit live: true gesperrt – mit dem Fehlercode „demo“
  for (const type of ["haus3d/lock/unlock", "haus3d/climate/pause", "haus3d/away/set", "haus3d/pin/set", "haus3d/dev/set", "haus3d/dev/clear"]) {
    await assert.rejects(h.callWS({ type }), { code: "demo", quiet: true, message: /^Demo:/ });
  }
  await assert.rejects(h.callApi("POST", "config/scene/config/x", {}), { code: "demo", quiet: true });
  await h.callApi("GET", "history/period");
  assert.equal(api.length, 1);
  assert.equal(sent.length, 4); // gesperrte Befehle sind nie beim Wrapper angekommen
  assert.deepEqual(blocked.slice(0, 2), ["haus3d/lock/unlock", "haus3d/climate/pause"]);
  // Testhaus bleibt wie vorher: Fehlercode „testhaus“
  const plain = houseGuard(wrapper, "test7", { onBlocked: () => {} });
  await assert.rejects(plain.callService("light", "turn_on", {}), { code: "testhaus" });
  await assert.rejects(plain.callWS({ type: "haus3d/lock/unlock" }), { code: "testhaus", message: /^Testhaus:/ });
});

test("Häuser: Mixin im Panel, Schlüssel je Haus, Namensvorgabe, Demo-Kästchen berichtigen, Meldungen", async () => {
  const { HouseMethods, MAX_HOUSES, newHouseName } = await import("../../custom_components/haus3d/frontend/panel-houses.js");
  const { SupportMethods } = await import("../../custom_components/haus3d/frontend/panel-support.js");
  // das Panel mischt SupportMethods ein: die Haus-Methoden müssen dort ankommen
  for (const k of ["_hk", "_switchHouse", "_houseCleanup", "_houseBlocked", "_houseSetDemo", "_houseEditorFor", "_houseDiscardEditor", "_infoDialog", "_renderHouses"]) assert.equal(SupportMethods[k], HouseMethods[k], k);
  assert.equal(MAX_HOUSES, 5);
  // Schlüssel im Browser-Speicher je Haus
  assert.equal(HouseMethods._hk.call({ _house: null }, "haus3d.views"), "haus3d.views");
  assert.equal(HouseMethods._hk.call({ _house: { id: "test7" } }, "haus3d.views"), "haus3d.views.test7");
  // Namensvorgabe: „Vorführhaus n“, nie doppelt
  assert.equal(newHouseName([]), "Vorführhaus 1");
  assert.equal(newHouseName([{ name: "Spielwiese" }]), "Vorführhaus 2");
  assert.equal(newHouseName([{ name: "Vorführhaus 2" }, { name: "Spielwiese" }]), "Vorführhaus 3");
  // Demo-Kästchen berichtigen: Mein Haus nie, gleicher Wert nichts, live fällt weg
  const rehung = [];
  const mk = (house) => ({ _house: house, _realHass: { id: "hass" }, _renderModes: () => rehung.push("modes"), set hass(v) { rehung.push(v.id); } });
  const none = mk(null);
  assert.equal(HouseMethods._houseSetDemo.call(none, true), false);
  assert.equal(none._house, null);
  const test = mk({ id: "test3", name: "T", live: true, demo: false });
  assert.equal(HouseMethods._houseSetDemo.call(test, false), false);
  assert.deepEqual(rehung, []);
  assert.equal(HouseMethods._houseSetDemo.call(test, true), true);
  assert.deepEqual(test._house, { id: "test3", name: "T", live: false, demo: true });
  assert.deepEqual(rehung, ["hass", "modes"]); // neue Hülle um hass, Modus-Leiste
  assert.equal(HouseMethods._houseSetDemo.call(test, true), false);
  assert.equal(HouseMethods._houseSetDemo.call(test, undefined), true); // nur ein echtes true gilt
  assert.deepEqual(test._house, { id: "test3", name: "T", live: false, demo: false });
  // Meldungen: Demo und Testhaus getrennt formuliert
  const say = (house, what) => {
    const toasts = [];
    HouseMethods._houseBlocked.call({ _house: house, _toast: (m) => toasts.push(m) }, what);
    return toasts[0];
  };
  const d = { id: "test3", demo: true };
  const th = { id: "test3", demo: false };
  assert.match(say(d, "haus3d/lock/unlock"), /^Demo: wird nur simuliert/);
  assert.equal(say(th, "light.turn_on"), "Im Testhaus wird nichts geschaltet.");
  assert.doesNotMatch(say(th, "light.turn_on"), /Entwickler/);
  assert.match(say(d, "config/scene/config/x"), /^Im Demo-Haus wird nichts/);
  assert.match(say(th, "config/scene/config/x"), /^Im Testhaus wird nichts/);
  assert.match(say(d, "haus3d/pin/set"), /^Demo: PINs/);
  assert.match(say(th, "haus3d/pin/set"), /^PINs/);
  // nicht öfter als alle 4 s
  const quick = { _house: d, _toast: () => quick.n++, n: 0 };
  HouseMethods._houseBlocked.call(quick, "x");
  HouseMethods._houseBlocked.call(quick, "x");
  assert.equal(quick.n, 1);
});

test("Häuser: Wechsel ruft nach dem Aufräumen _demoReset, ein ungespeicherter Editor wird erst bestätigt", async () => {
  const { HouseMethods } = await import("../../custom_components/haus3d/frontend/panel-houses.js");
  const order = [];
  const base = () => ({
    _houseEpoch: 0,
    _settings: { layers: {} },
    _editor: null,
    _els: {},
    _houseCleanup: () => order.push("cleanup"),
    _demoReset: () => order.push("demoReset"),
    _setSim: async () => order.push("sim"),
    _applyStyle: () => order.push("style"),
    _scene: { setLayers: () => {} },
    _load: async function () {
      order.push(`load:${this._house?.id ?? "real"}:${this._house?.demo ? "demo" : "-"}`);
      this._buildingHouse = this._house?.id ?? null;
    },
    _renderModes: () => order.push("modes"),
    _toast: (m) => order.push(`toast:${m}`),
    _hk: HouseMethods._hk,
    _houseDiscardEditor: HouseMethods._houseDiscardEditor,
  });
  const p = base();
  assert.equal(await HouseMethods._switchHouse.call(p, { id: "test5", name: "Vorführung", live: true, demo: true }), true);
  assert.deepEqual(p._house, { id: "test5", name: "Vorführung", live: false, demo: true });
  assert.deepEqual(order.slice(0, 2), ["cleanup", "demoReset"]); // erst aufräumen, dann Demo-Zustand des alten Hauses verwerfen
  assert.ok(order.indexOf("demoReset") < order.indexOf("load:test5:demo"));
  assert.match(order.at(-1), /^toast:Demo-Haus „Vorführung“ – alles wird simuliert/);
  order.length = 0;
  assert.equal(await HouseMethods._switchHouse.call(p, null), true);
  assert.equal(p._house, null);
  assert.deepEqual(order.filter((x) => !x.startsWith("toast")).slice(0, 3), ["cleanup", "demoReset", "style"]);
  assert.equal(order.at(-1), "toast:Zurück in deinem Haus.");
  // ungespeicherter Editor: Nein → nichts passiert; Ja → Entwurf verworfen und gewechselt; confirmed überspringt die Frage
  order.length = 0;
  const asked = [];
  const q = { ...base(), _editor: { dirty: true, clearDraft: () => order.push("cleared") }, _confirm: async (text) => (asked.push(text), false) };
  q._houseDiscardEditor = HouseMethods._houseDiscardEditor;
  assert.equal(await HouseMethods._switchHouse.call(q, { id: "test5", name: "x", demo: false }), false);
  assert.deepEqual([order, q._house], [[], undefined]);
  assert.match(asked[0], /Ungespeicherte Änderungen/);
  q._confirm = async () => true;
  assert.equal(await HouseMethods._switchHouse.call(q, { id: "test5", name: "x", demo: false }), true);
  assert.ok(order.includes("cleared") && q._house.id === "test5");
  order.length = 0;
  q._confirm = async () => assert.fail("keine zweite Frage");
  assert.equal(await HouseMethods._switchHouse.call(q, { id: "test5", name: "x", demo: true }, { confirmed: true }), true);
  assert.equal(q._house.demo, true);
  // läuft schon ein Wechsel: abgelehnt
  q._switching = true;
  assert.equal(await HouseMethods._switchHouse.call(q, null), false);
});

test("Häuser: Kippt der Modus (Demo ↔ Testhaus) bei offenem Editor, geht er zu – mit Nachfrage bei ungespeicherten Änderungen", async () => {
  const { HouseMethods } = await import("../../custom_components/haus3d/frontend/panel-houses.js");
  const log = [];
  const mk = (dirty, answer, demo = false) => {
    const p = {
      _house: { id: "test3", name: "T", live: false, demo },
      _realHass: { id: "hass" },
      _renderModes: () => {},
      set hass(v) {},
      _confirm: async (text) => (log.push(`frage:${text}`), answer),
      _houseDiscardEditor: HouseMethods._houseDiscardEditor,
      _houseSetDemo: HouseMethods._houseSetDemo,
      _houseEditorFor: HouseMethods._houseEditorFor,
    };
    p._editor = { dirty, onClose: () => ((p._editor = null), log.push("zu")), clearDraft: () => log.push("entwurf weg") };
    return p;
  };
  // sauberer Editor: ohne Frage zu, danach kippt der Modus
  const a = mk(false, true);
  assert.equal(await a._houseEditorFor(true), true);
  assert.deepEqual(log, ["zu"]);
  assert.equal(a._houseSetDemo(true), true);
  assert.equal(a._house.demo, true);
  // gleicher Modus: der Editor bleibt
  log.length = 0;
  const same = mk(true, true, true);
  assert.equal(await same._houseEditorFor(true), true);
  assert.deepEqual(log, []);
  assert.ok(same._editor);
  // ungespeicherte Änderungen: Nachfrage; Nein → Editor und Modus bleiben, Ja → Entwurf weg, Editor zu, Modus kippt
  const no = mk(true, false);
  assert.equal(await no._houseEditorFor(true), false);
  assert.ok(no._editor);
  assert.equal(no._houseSetDemo(true), false, "mit offenem Editor kippt der Modus nicht");
  assert.equal(no._house.demo, false);
  assert.match(log[0], /^frage:Ungespeicherte Änderungen/);
  log.length = 0;
  const yes = mk(true, true, true);
  assert.equal(await yes._houseEditorFor(false), true);
  assert.deepEqual(log.filter((x) => !x.startsWith("frage")), ["entwurf weg", "zu"]);
  assert.equal(yes._houseSetDemo(false), true);
  assert.equal(yes._house.demo, false);
  // Mein Haus ist nie Demo: nichts zu tun
  assert.equal(await mk(true, false)._houseEditorFor.call({ ...mk(true, false), _house: null }, true), true);
});

test("Häuser: Aufräumen beim Wechsel entfernt Meldungen echter Automationen und den Urlaubsstatus", async () => {
  const { HouseMethods } = await import("../../custom_components/haus3d/frontend/panel-houses.js");
  let removed = 0;
  const p = { _noticeEl: { remove: () => removed++ }, _away: true, _houseEpoch: 0, _tl: null, _editor: null };
  HouseMethods._houseCleanup.call(p);
  assert.equal(removed, 1);
  assert.deepEqual([p._noticeEl, p._away], [null, false]);
  assert.equal(p._houseEpoch, 1);
});

test("Dienst notify: im Demo-Haus erscheint keine Meldung einer echten Automation, im echten Haus und im Testhaus schon", async () => {
  const { UserMethods } = await import("../../custom_components/haus3d/frontend/panel-user.js");
  const shown = [];
  const mk = (demo) => ({ _building: { floors: [] }, _settings: {}, _idle: false, _isDemo: () => demo, _notice: (c) => shown.push(c.message) });
  UserMethods._onCommand.call(mk(true), { service: "notify", message: "Fenster offen" });
  assert.deepEqual(shown, []);
  UserMethods._onCommand.call(mk(false), { service: "notify", message: "Fenster offen" });
  assert.deepEqual(shown, ["Fenster offen"]);
});
