// N3: Testhaus (Entwickler): anlegen, wechseln, darin bearbeiten und speichern – das echte Haus bleibt
// unberührt; Geräte werden im Testhaus nur mit „echt schalten“ geschaltet; zurück zu „Mein Haus“.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("n3", "");
const E = (fn, arg) => pg.evaluate(fn, arg);
const R = (sel) => E((s) => !!window.panel.shadowRoot.querySelector(s), sel);
const services = () => E(() => window.calls.filter((c) => c.service).length);

const realTitle = await E(() => window.panel.shadowRoot.querySelector("header .title").textContent);
const realRooms = await E(() => window.panel._building.floors.reduce((n, f) => n + f.rooms.length, 0));

// Entwickler-Instanz und Admin → Entwickler → Testhaus
await E(async () => {
  window.devInstance = true;
  window.panel._devLoaded = false;
  window.panel._dev = undefined;
  await window.panel._loadDev();
});
await unlock(pg, "admin");
await pg.waitForTimeout(300);
await pg.locator('haus3d-panel .admin .cat[data-cat="dev"]').click();
await pg.waitForSelector("haus3d-panel .testhaus .thnew");
t.check(await R('.testhaus .threw.sel'), "„Mein Haus“ nicht als geöffnet markiert");
await t.shot(pg, "n3-entwickler-testhaus.png");
await pg.locator("haus3d-panel .testhaus .thname").fill("Spielwiese");
await pg.locator("haus3d-panel .testhaus .thsrc").selectOption("current");
await pg.locator('haus3d-panel .testhaus [data-th="new"]').click();
await pg.waitForFunction(() => window.panel._house?.name === "Spielwiese", null, { timeout: 5000 });
await pg.waitForTimeout(800);
const house = await E(() => window.panel._house);
const chip = await E(() => window.panel.shadowRoot.querySelector(".modes .mode.m-test")?.textContent ?? "");
t.results.testhaus = { house, chip };
t.check(/Testhaus: Spielwiese/.test(chip) && /^test/.test(house.id) && house.live === false, `Testhaus offen: ${JSON.stringify({ house, chip })}`);
t.check(await E(() => JSON.parse(localStorage.getItem("haus3d.house")).id === window.panel._house.id), "Testhaus nicht gemerkt");
t.check((await E(() => window.panel._building.floors.reduce((n, f) => n + f.rooms.length, 0))) === realRooms, "Kopie hat nicht dieselben Räume");

// Geräte: ohne „echt schalten“ geht nichts an Home Assistant
const s0 = await services();
await E(() => window.panel._activate("light.wohnzimmer_decke"));
await pg.waitForTimeout(200);
const toast = await E(() => [...window.panel.shadowRoot.querySelectorAll(".toast")].map((x) => x.textContent).join(" "));
t.check((await services()) === s0 && /Testhaus/.test(toast), `Testhaus hat geschaltet: ${toast}`);

// Langdruck/„Weitere Infos“: kein HA-Dialog (der könnte schalten), nur ansehen
const ev0 = await E(() => window.events.length);
await E(() => window.panel._moreInfo("light.wohnzimmer_decke"));
await pg.waitForTimeout(200);
t.check((await E(() => window.events.length)) === ev0 && (await R(".infodlg")), "Testhaus: „Weitere Infos“ öffnet den schaltenden HA-Dialog");
await E(() => window.panel._closeDialog());
// PINs gehören zum echten Haus: im Testhaus gesperrt
const pin = await E(async () => {
  try {
    await window.panel._callLocked({ type: "haus3d/pin/set", scope: "door", pin: "1234" }, "admin");
    return "durch";
  } catch (e) {
    return e.code;
  }
});
t.check(pin === "testhaus" && (await E(() => window.pins?.door ?? "0000")) === "0000", `PIN im Testhaus geändert: ${pin}`);
// Favoriten und Lüften je Haus
await E(() => {
  for (let i = 0; i < 3; i++) window.panel._favCount("light.wohnzimmer_stehlampe");
  window.panel._ventStart("eg", "wohnzimmer", 10);
});
const keys = await E((id) => ({ fav: !!localStorage.getItem(`haus3d.favs.${id}`), realFav: JSON.parse(localStorage.getItem("haus3d.favs") ?? "{}")["light.wohnzimmer_stehlampe"] ?? null, vent: !!localStorage.getItem(`haus3d.vent.${id}`), realVent: localStorage.getItem("haus3d.vent") }), house.id);
t.check(keys.fav && keys.vent && !keys.realFav && !keys.realVent, `Favoriten/Lüften nicht je Haus: ${JSON.stringify(keys)}`);
await E(() => window.panel._ventStart("eg", "wohnzimmer", null));
// offene Nachfrage beim Wechsel: wird abgebrochen (sonst würde ein späterer Klick ins echte Haus schreiben)
const race = await E(async () => {
  const p = window.panel;
  const asked = p._confirm("Grundriss importieren?", "Importieren");
  const h = p._house;
  const switching = p._switchHouse(null);
  const answer = await asked;
  await switching;
  // Speichern, das noch im Testhaus begann, landet nicht im echten Haus
  const before = window.realSaves ?? 0;
  await p._switchHouse(h);
  const epochSave = p._callLocked({ type: "haus3d/building/save", building: p._building, revision: p._revision }, "edit");
  p._houseEpoch += 1; // Wechsel während die Antwort unterwegs ist
  let code = null;
  try {
    await epochSave;
  } catch (e) {
    code = e.code;
  }
  return { answer, back: p._house?.id === h.id, realSaves: (window.realSaves ?? 0) - before, code };
});
t.results.wechsel = race;
t.check(race.answer === false && race.back && race.realSaves === 0 && race.code === "switched", `Wechsel: ${JSON.stringify(race)}`);

// zweite Runde: Urlaub und Entwickler-Instanz auch mit „echt schalten“ gesperrt
const always = await E(async () => {
  const p = window.panel;
  p._house = { ...p._house, live: true };
  p.hass = p._realHass;
  const out = [];
  for (const m of [{ type: "haus3d/away/set", on: true }, { type: "haus3d/dev/set", code: "0000" }]) {
    try {
      await p._hass.callWS(m);
      out.push("durch");
    } catch (e) {
      out.push(e.code);
    }
  }
  p._house = { ...p._house, live: false };
  p.hass = p._realHass;
  return out;
});
t.check(always.join() === "testhaus,testhaus" && !(await E(() => window.away)), `Urlaub/Entwickler im Testhaus: ${always}`);
// Wandtablet: Testhaus-Hinweis sichtbar (Kopfzeile ist dort ausgeblendet)
const kiosk = await E(() => {
  const p = window.panel;
  p.toggleAttribute("kiosk", true);
  p._renderModes();
  const r = p.shadowRoot.querySelector(".mode.m-test")?.getBoundingClientRect();
  p.toggleAttribute("kiosk", false);
  p._renderModes();
  return r ? [Math.round(r.width), Math.round(r.height)] : null;
});
t.check(kiosk && kiosk[0] > 40 && kiosk[1] > 20, `Testhaus-Hinweis im Wandtablet unsichtbar: ${kiosk}`);
// Laden scheitert beim Wechsel: Speichern und Editor bleiben gesperrt (Grundriss gehört zum Testhaus)
const failed = await E(async () => {
  const p = window.panel;
  const h = p._house;
  const before = window.realSaves ?? 0;
  window.failGet = true;
  await p._switchHouse(null);
  let code = null;
  try {
    await p._callLocked({ type: "haus3d/building/save", building: p._building, revision: p._revision }, "edit");
  } catch (e) {
    code = e.code;
  }
  await p._openEditor();
  const editor = !!p._editor;
  await p._switchHouse(h); // wieder ins Testhaus
  return { code, editor, realSaves: (window.realSaves ?? 0) - before, back: p._house?.id === h.id };
});
t.results.ladefehler = failed;
t.check(failed.code === "switched" && !failed.editor && failed.realSaves === 0 && failed.back, `Ladefehler beim Wechsel: ${JSON.stringify(failed)}`);
// Benutzerdaten: ein im echten Haus geplanter Abgleich schickt nach dem Wechsel nichts aus dem Testhaus
const sync = await E(async () => {
  const p = window.panel;
  const h = p._house;
  await p._switchHouse(null);
  const n0 = window.calls.filter((c) => c.type === "frontend/set_user_data").length;
  p._pushUserData();
  await p._switchHouse(h);
  await new Promise((r) => setTimeout(r, 1800));
  return window.calls.filter((c) => c.type === "frontend/set_user_data").length - n0;
});
t.check(sync === 0, `Benutzerdaten nach Wechsel geschrieben: ${sync}`);

// Runde 3: Abläufe aus dem Testhaus enden mit dem Wechsel (Import mit zwei Nachfragen, Titel, Begehen)
const r3 = await E(async () => {
  const p = window.panel;
  const h = p._house;
  const before = window.realSaves ?? 0;
  // zweite Nachfrage nach dem Wechsel öffnet sich nicht mehr
  const first = p._confirm("Lücken schließen?", "Schließen");
  const switching = p._switchHouse(null);
  const a1 = await first;
  const a2 = await p._confirm("Grundriss importieren?", "Importieren"); // während des Wechsels: sofort nein
  await switching;
  // Titel-Eingabe aus dem Testhaus wird verworfen
  await p._switchHouse(h);
  p._editMode = true;
  p._editTitle();
  p.shadowRoot.querySelector("header .titlein").value = "Aus dem Testhaus";
  await p._switchHouse(null);
  const titleInput = !!p.shadowRoot.querySelector("header .titlein");
  const realTitle = p.shadowRoot.querySelector("header .title").textContent;
  // Begehen endet beim Wechsel
  p._startWalk();
  const walking = p._scene.isWalking();
  await p._switchHouse(h);
  const after = { walking: p._scene.isWalking(), ui: !!p.shadowRoot.querySelector(".walkui"), cls: p._els.stage.classList.contains("walking") };
  p._editMode = false;
  return { a1, a2, saves: (window.realSaves ?? 0) - before, titleInput, realTitle, walking, after, back: p._house?.id === h.id };
});
t.results.runde3 = r3;
t.check(r3.a1 === false && r3.a2 === false && r3.saves === 0 && !r3.titleInput && r3.realTitle !== "Aus dem Testhaus" && r3.walking && !r3.after.walking && !r3.after.ui && !r3.after.cls && r3.back, `Runde 3: ${JSON.stringify(r3)}`);
// Wandtablet: Leiste oben links, nicht über Begehen/Editor
const kpos = await E(() => {
  const p = window.panel;
  p.toggleAttribute("kiosk", true);
  p._renderModes();
  const m = p.shadowRoot.querySelector(".stage > .modes")?.getBoundingClientRect();
  p.toggleAttribute("kiosk", false);
  p._renderModes();
  return m ? { left: Math.round(m.left), top: Math.round(m.top) } : null;
});
t.check(kpos && kpos.left < 120 && kpos.top < 120, `Wandtablet-Leiste: ${JSON.stringify(kpos)}`);

// Runde 4: Stil/Ebenen je Haus; Import an das Haus beim Antippen gebunden
const r4 = await E(async () => {
  const p = window.panel;
  const h = p._house;
  const realStyle = JSON.parse(localStorage.getItem("haus3d.settings") ?? "{}").style ?? "auto";
  p._settings.style = "cyber";
  p._saveSettings();
  await p._switchHouse(null);
  const back = { style: p._settings.style, stored: JSON.parse(localStorage.getItem("haus3d.settings") ?? "{}").style ?? "auto" };
  // Import angetippt im echten Haus, Datei erst nach einem Wechsel gewählt → nicht importieren
  p._importEpoch = p._houseEpoch;
  await p._switchHouse(h);
  const testStyle = p._settings.style;
  const before = window.realSaves ?? 0;
  const input = p._els.file;
  const dt = new DataTransfer();
  dt.items.add(new File([JSON.stringify({ version: 1, floors: [{ id: "eg", name: "EG", elevation: 0, height: 2.5, rooms: [] }] })], "x.json", { type: "application/json" }));
  input.files = dt.files;
  await p._importFile();
  const sbRooms = window.sandbox[h.id].building.floors.reduce((n, f) => n + f.rooms.length, 0);
  return { realStyle, back, testStyle, saves: (window.realSaves ?? 0) - before, sbRooms };
});
t.results.runde4 = r4;
t.check(r4.back.style === r4.realStyle && r4.back.stored === r4.realStyle && r4.testStyle === "cyber" && r4.saves === 0 && r4.sbRooms > 0, `Runde 4: ${JSON.stringify(r4)}`);
await E(() => {
  window.panel._settings.style = "auto";
  window.panel._saveSettings();
  window.panel._applyStyle();
});

// im Testhaus speichern (Einstellungen und Editor): nur das Testhaus ändert sich
const real0 = await E(() => window.realSaves ?? 0);
await E(() => window.panel._saveBuildingSettings({ title: "Spielwiese-Titel" }, "ok"));
await pg.waitForTimeout(400);
await E(() => window.panel._endAdmin());
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(1200);
t.check((await E(() => window.panel._editor.draftKey)) === `haus3d.editorDraft.${house.id}`, "Editor-Entwurf nicht je Haus getrennt");
await E(() => {
  const ed = window.panel._editor;
  ed.change((fl) => {
    fl.rooms[0].name = "Testraum";
  });
});
await pg.locator("haus3d-panel .ed-bar [data-act=save]").click();
await pg.waitForTimeout(1500);
const saved = await E((id) => ({ title: window.sandbox[id].building.settings.title, room: window.sandbox[id].building.floors.flatMap((f) => f.rooms).some((r) => r.name === "Testraum"), rev: window.sandbox[id].revision, realSaves: window.realSaves ?? 0, shown: window.panel.shadowRoot.querySelector("header .title").textContent }), house.id);
t.results.gespeichert = saved;
t.check(saved.title === "Spielwiese-Titel" && saved.room && saved.rev >= 3 && saved.realSaves === real0 && saved.shown === "Spielwiese-Titel", `Speichern im Testhaus: ${JSON.stringify(saved)}`);
await t.shot(pg, "n3-testhaus.png");
await E(() => window.panel._endEdit());

// „echt schalten“: dann gehen Tipps an Home Assistant
await E(() => {
  window.panel._house = { ...window.panel._house, live: true };
  window.panel.hass = window.panel._realHass;
});
const s1 = await services();
await E(() => window.panel._activate("light.wohnzimmer_decke"));
await pg.waitForTimeout(200);
t.check((await services()) === s1 + 1, "„echt schalten“ schaltet nicht");

// zurück: „Mein Haus“ oben → echtes Haus unverändert
await pg.locator('haus3d-panel .modes [data-end="test"]').click();
await pg.waitForFunction(() => !window.panel._house, null, { timeout: 5000 });
await pg.waitForTimeout(600);
const back = await E(() => ({ title: window.panel.shadowRoot.querySelector("header .title").textContent, rooms: window.panel._building.floors.flatMap((f) => f.rooms).some((r) => r.name === "Testraum"), chip: !!window.panel.shadowRoot.querySelector(".modes .mode.m-test"), stored: localStorage.getItem("haus3d.house") }));
t.results.zurueck = back;
t.check(back.title === realTitle && !back.rooms && !back.chip && !back.stored, `Mein Haus: ${JSON.stringify(back)}`);
// Geräte wieder echt (kein Testhaus mehr)
const s2 = await services();
await E(() => window.panel._activate("light.wohnzimmer_decke"));
await pg.waitForTimeout(200);
t.check((await services()) === s2 + 1, "im echten Haus wird nicht geschaltet");

// Testhaus woanders gelöscht: beim Laden zurück ins echte Haus
await E((id) => {
  localStorage.setItem("haus3d.house", JSON.stringify({ id, name: "Spielwiese" }));
  window.panel._house = { id, name: "Spielwiese", live: false };
  window.panel.hass = window.panel._realHass; // Hülle wie beim Seitenaufruf
  delete window.sandbox[id];
  return window.panel._load();
}, house.id);
await pg.waitForTimeout(800);
t.check(!(await E(() => window.panel._house)) && (await E(() => window.panel.shadowRoot.querySelector("header .title").textContent)) === realTitle, "gelöschtes Testhaus: nicht zurück ins echte Haus");
// … auch mit offener Nachfrage: die wird abgebrochen
const fb = await E(async (id) => {
  const p = window.panel;
  window.sandbox[id] = { name: "Spielwiese", revision: 1, building: structuredClone(p._building) };
  await p._switchHouse({ id, name: "Spielwiese" });
  const asked = p._confirm("Grundriss importieren?", "Importieren");
  delete window.sandbox[id];
  await p._load();
  return { answer: await asked, house: p._house, buildingHouse: p._buildingHouse };
}, house.id);
t.check(fb.answer === false && fb.house === null && fb.buildingHouse === null, `Rücksprung mit offener Nachfrage: ${JSON.stringify(fb)}`);
await t.done();
