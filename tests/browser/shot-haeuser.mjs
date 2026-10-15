// Häuser und Demo-Kästchen (Admin → Häuser, ohne Entwickler-Instanz): Demo-Haus anlegen, Kästchen umschalten
// (auch bei offenem Haus mit ungespeichertem Editor), umbenennen, löschen, Grenze 5, Rechte (Admin-PIN),
// Chip „Demo: …“ mit „Mein Haus“, Zahnrad ohne Simulation, Entwickler-Fenster („echt schalten“ nie im Demo-Haus),
// Anknüpfung an den Demo-Teil (_demoReset, _houseSetDemo) und Tür-Riegel.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("haeuser", "");
const E = (fn, arg) => pg.evaluate(fn, arg);
const R = (sel) => E((s) => !!window.panel.shadowRoot.querySelector(s), sel);
const Q = (sel) => pg.locator(`haus3d-panel ${sel}`);
const T = (sel) => E((s) => window.panel.shadowRoot.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, sel);
const houseWait = (name) => pg.waitForFunction((n) => window.panel._house?.name === n && !window.panel._switching && window.panel._buildingHouse === window.panel._house.id, name, { timeout: 8000 });
const openHouses = async () => {
  await unlock(pg, "admin", { cat: "houses" });
  await pg.waitForSelector("haus3d-panel .houses .threw");
};

// Anknüpfung des Demo-Teils: wird beim Hauswechsel aufgerufen
await E(() => {
  window.demoResets = 0;
  window.panel._demoReset = () => {
    window.demoResets++;
  };
});

// --- Demo-Haus anlegen (Beispielhaus, Kästchen an)
await openHouses();
await Q(".houses .thname").fill("Vorführung");
await Q(".houses .thsrc").selectOption("example");
t.check(await R(".houses .thdemonew:checked"), "Demo-Kästchen beim Anlegen nicht vorbelegt");
await Q('.houses [data-th="new"]').click();
await houseWait("Vorführung");
await pg.waitForTimeout(500);
const demo = await E(() => ({ house: window.panel._house, stored: JSON.parse(localStorage.getItem("haus3d.house")), backend: Object.values(window.sandbox).map((h) => [h.name, h.demo]), resets: window.demoResets, create: window.calls.filter((c) => c.type === "haus3d/sandbox/create").map((c) => ({ demo: c.demo, source: c.source, token: !!c.token })) }));
const id = demo.house.id;
t.results.demoAnlegen = demo;
t.check(demo.house.demo === true && demo.house.live === false && demo.stored.demo === true && demo.stored.id === id, `Demo-Haus offen/gemerkt: ${JSON.stringify(demo)}`);
t.check(JSON.stringify(demo.backend) === '[["Vorführung",true]]' && demo.create.length === 1 && demo.create[0].demo === true && demo.create[0].token, `Backend/Anlegen: ${JSON.stringify(demo)}`);
t.check(demo.resets === 1, `_demoReset beim Wechsel: ${demo.resets}`);
const chip = await E(() => ({ demo: window.panel.shadowRoot.querySelector(".modes .mode.m-demo .mt")?.textContent, test: !!window.panel.shadowRoot.querySelector(".modes .mode.m-test"), icon: window.panel.shadowRoot.querySelector(".modes .mode.m-demo ha-icon")?.getAttribute("icon"), end: window.panel.shadowRoot.querySelector('.modes .mode.m-demo [data-end="test"]')?.textContent, bg: getComputedStyle(window.panel.shadowRoot.querySelector(".modes .mode.m-demo")).backgroundColor }));
t.results.chip = chip;
t.check(chip.demo === "Demo: Vorführung" && chip.end === "Mein Haus" && !chip.test && chip.icon === "mdi:presentation-play" && chip.bg === "rgb(0, 137, 123)", `Demo-Chip: ${JSON.stringify(chip)}`);
t.check(/Demo-Haus „Vorführung“/.test(await T(".toast")), `Meldung beim Öffnen: ${await T(".toast")}`);
await t.shot(pg, "haeuser-demo-chip.png");

// Zahnrad: im Demo-Haus keine Kachel „Simulation“, im echten Haus (Admin-Modus) schon
await E(() => window.panel._openSettings());
await pg.waitForTimeout(200);
t.check(!(await R('.basics [data-act="sim"]')), "Kachel „Simulation“ im Demo-Haus");
await E(() => window.panel._closeDialog());

// Tür-Riegel: im Demo-Haus sofort stiller Abbruch, kein PIN-Feld, nichts an Home Assistant
const door = await E(async () => {
  const before = window.calls.length;
  let res = "durch";
  try {
    await window.panel._doorUnlock("unlock", { entity_id: "lock.haustuer" });
  } catch (e) {
    res = { quiet: e.quiet === true };
  }
  return { res, pin: !!window.panel.shadowRoot.querySelector(".pinpad"), calls: window.calls.length - before };
});
t.check(door.res.quiet === true && !door.pin && door.calls === 0, `Tür im Demo-Haus: ${JSON.stringify(door)}`);

// --- Admin → Häuser im Demo-Haus: Zeile markiert, Kästchen an, kein „Öffnen“
await openHouses();
const row = await E((i) => {
  const r = window.panel.shadowRoot.querySelector(`.houses .threw[data-id="${i}"]`);
  return { cls: r?.className, checked: r?.querySelector('[data-th="demo"]')?.checked, open: !!r?.querySelector('[data-th="open"]'), icon: r?.querySelector("ha-icon")?.getAttribute("icon"), small: r?.querySelector("small")?.textContent, real: !!window.panel.shadowRoot.querySelector('.houses [data-th="real"]'), realSel: window.panel.shadowRoot.querySelector(".houses .threw")?.classList.contains("sel") };
}, id);
t.results.zeile = row;
t.check(/demo/.test(row.cls) && /sel/.test(row.cls) && row.checked && !row.open && row.icon === "mdi:presentation-play" && /gerade geöffnet/.test(row.small) && row.real && !row.realSel, `Zeile des Demo-Hauses: ${JSON.stringify(row)}`);
t.check(/\d+ Etagen · \d+ Räume/.test(row.small), `Etagen/Räume: ${row.small}`);

// Rechte: ohne Token bzw. mit Bearbeiten-Token lässt das Backend nichts ändern (Kästchen gilt für alle Browser)
const rights = await E(async (i) => {
  window.tokens["tok-edit-test"] = "edit";
  const out = [];
  for (const m of [{ type: "haus3d/sandbox/update", house: i, demo: false }, { type: "haus3d/sandbox/update", house: i, demo: false, token: "tok-edit-test" }, { type: "haus3d/sandbox/create", name: "x", source: "empty" }, { type: "haus3d/sandbox/delete", house: i, token: "tok-edit-test" }]) {
    try {
      await window.panel._hass.callWS(m);
      out.push("durch");
    } catch (e) {
      out.push(e.code);
    }
  }
  return { out, demo: window.sandbox[i]?.demo, n: Object.keys(window.sandbox).length, updates: window.houseUpdates ?? 0 };
}, id);
t.check(rights.out.join() === "locked,locked,locked,locked" && rights.demo === true && rights.n === 1 && rights.updates === 0, `Rechte: ${JSON.stringify(rights)}`);

// --- Kästchen aus bei offenem Haus: Backend, Neuladen als Testhaus, _demoReset
await Q(`.houses .threw[data-id="${id}"] [data-th="demo"]`).click();
await pg.waitForFunction(() => window.panel._house?.demo === false && !window.panel._switching && window.panel._buildingHouse === window.panel._house.id, null, { timeout: 8000 });
await pg.waitForTimeout(300);
const off = await E((i) => ({ backend: window.sandbox[i].demo, updates: window.houseUpdates, resets: window.demoResets, chip: window.panel.shadowRoot.querySelector(".modes .mode.m-test .mt")?.textContent, demoChip: !!window.panel.shadowRoot.querySelector(".modes .mode.m-demo"), stored: JSON.parse(localStorage.getItem("haus3d.house")).demo, live: window.panel._house.live, dialog: !!window.panel._dialog, update: window.calls.filter((c) => c.type === "haus3d/sandbox/update" && window.tokens[c.token] === "admin").map((c) => [c.house === i, c.demo, !!c.token]) }), id);
t.results.kaestchenAus = off;
t.check(off.backend === false && off.updates === 1 && off.resets === 2 && /^Testhaus: Vorführung/.test(off.chip) && !off.demoChip && off.stored === false && off.live === false && JSON.stringify(off.update) === "[[true,false,true]]", `Kästchen aus: ${JSON.stringify(off)}`);

// --- und wieder an; ungespeicherter Editor: erst nachfragen (Nein = nichts geändert, Ja = verwerfen und neu laden)
await openHouses();
await E(() => {
  window.cleared = 0;
  window.panel._editor = { dirty: true, clearDraft: () => window.cleared++, onClose: () => {} };
});
await Q(`.houses .threw[data-id="${id}"] [data-th="demo"]`).click();
await pg.waitForSelector("haus3d-panel .confirm");
await pg.waitForTimeout(500);
t.check(/Ungespeicherte Änderungen/.test(await T(".confirm .ct")), "keine Nachfrage bei ungespeichertem Editor");
await Q(".confirm .no").click();
await pg.waitForTimeout(300);
const declined = await E((i) => ({ backend: window.sandbox[i].demo, updates: window.houseUpdates, demo: window.panel._house.demo, cleared: window.cleared, checked: window.panel.shadowRoot.querySelector(`.houses .threw[data-id="${i}"] [data-th="demo"]`)?.checked, resets: window.demoResets }), id);
t.check(declined.backend === false && declined.updates === 1 && declined.demo === false && declined.cleared === 0 && declined.checked === false && declined.resets === 2, `Nachfrage verneint: ${JSON.stringify(declined)}`);
await Q(`.houses .threw[data-id="${id}"] [data-th="demo"]`).click();
await pg.waitForSelector("haus3d-panel .confirm");
await pg.waitForTimeout(500);
await Q(".confirm .yes").click();
await pg.waitForFunction(() => window.panel._house?.demo === true && !window.panel._switching && window.panel._buildingHouse === window.panel._house.id, null, { timeout: 8000 });
await pg.waitForTimeout(300);
const on = await E((i) => ({ backend: window.sandbox[i].demo, updates: window.houseUpdates, cleared: window.cleared, resets: window.demoResets, demoChip: !!window.panel.shadowRoot.querySelector(".modes .mode.m-demo"), stored: JSON.parse(localStorage.getItem("haus3d.house")).demo }), id);
t.results.kaestchenAn = on;
t.check(on.backend === true && on.updates === 2 && on.cleared === 1 && on.resets === 3 && on.demoChip && on.stored === true, `Kästchen an: ${JSON.stringify(on)}`);
await E(() => (window.panel._editor = null));

// --- Umbenennen (Esc bricht ab, Enter speichert, offenes Haus: Chip folgt)
await openHouses();
await Q(`.houses .threw[data-id="${id}"] [data-th="rename"]`).click();
await Q(".houses .threname").fill("Verworfen");
await Q(".houses .threname").press("Escape");
await pg.waitForSelector("haus3d-panel .houses .threw b");
t.check((await E((i) => window.sandbox[i].name, id)) === "Vorführung", "Esc hat umbenannt");
await Q(`.houses .threw[data-id="${id}"] [data-th="rename"]`).click();
await Q(".houses .threname").fill("Showroom");
await Q(".houses .threname").press("Enter");
await pg.waitForFunction((i) => window.sandbox[i].name === "Showroom", id, { timeout: 4000 });
await pg.waitForTimeout(300);
const ren = await E((i) => ({ house: window.panel._house.name, stored: JSON.parse(localStorage.getItem("haus3d.house")).name, chip: window.panel.shadowRoot.querySelector(".modes .mode.m-demo .mt")?.textContent, demo: window.sandbox[i].demo, shown: [...window.panel.shadowRoot.querySelectorAll(".houses .threw b")].map((b) => b.textContent) }), id);
t.results.umbenannt = ren;
t.check(ren.house === "Showroom" && ren.stored === "Showroom" && ren.chip === "Demo: Showroom" && ren.demo === true && ren.shown.includes("Showroom"), `Umbenennen: ${JSON.stringify(ren)}`);

// --- Kästchen eines nicht geöffneten Hauses: nur das Backend, kein Neuladen
await E(() => window.panel._switchHouse(null));
await pg.waitForTimeout(300);
const resets0 = await E(() => window.demoResets);
await openHouses();
t.check(await R('.houses .threw.sel [data-th="demo"]') === false && (await R('.houses .threw[data-id] [data-th="open"]')), "Mein Haus markiert, Öffnen am Haus");
await Q(`.houses .threw[data-id="${id}"] [data-th="demo"]`).click();
await pg.waitForFunction((i) => window.sandbox[i].demo === false, id, { timeout: 4000 });
await pg.waitForTimeout(400);
const closed = await E((i) => ({ house: window.panel._house, resets: window.demoResets, checked: window.panel.shadowRoot.querySelector(`.houses .threw[data-id="${i}"] [data-th="demo"]`)?.checked, cls: window.panel.shadowRoot.querySelector(`.houses .threw[data-id="${i}"]`)?.className, icon: window.panel.shadowRoot.querySelector(`.houses .threw[data-id="${i}"] ha-icon`)?.getAttribute("icon"), stored: localStorage.getItem("haus3d.house") }), id);
t.check(closed.house === null && closed.resets === resets0 && closed.checked === false && !/demo/.test(closed.cls) && closed.icon === "mdi:flask-outline" && !closed.stored, `Kästchen bei geschlossenem Haus: ${JSON.stringify(closed)}`);
await Q(`.houses .threw[data-id="${id}"] [data-th="demo"]`).click();
await pg.waitForFunction((i) => window.sandbox[i].demo === true, id, { timeout: 4000 });
await pg.waitForTimeout(300);

// --- Öffnen aus der Liste: Demo-Haus öffnet als Demo (Kästchen kommt aus der Liste, Backend bestätigt es)
await openHouses();
await Q(`.houses .threw[data-id="${id}"] [data-th="open"]`).click();
await houseWait("Showroom");
t.check(await E(() => window.panel._house.demo === true && !!window.panel.shadowRoot.querySelector(".modes .mode.m-demo")), "Öffnen: Demo-Haus nicht als Demo geöffnet");

// --- Grenze: höchstens 5 weitere Häuser
await E(() => {
  const b = window.panel._building;
  for (let k = 0; window.sandbox && Object.keys(window.sandbox).length < 5; k++) window.sandbox[`test9${k}`] = { name: `Zusatz ${k}`, revision: 1, demo: k % 2 === 0, building: structuredClone(b) };
});
await openHouses();
const full = await E(() => ({ rows: window.panel.shadowRoot.querySelectorAll(".houses .threw[data-id]").length, form: !!window.panel.shadowRoot.querySelector(".houses .thnew"), text: window.panel.shadowRoot.querySelector(".houses .muted")?.textContent, icons: [...window.panel.shadowRoot.querySelectorAll(".houses .threw[data-id]")].map((r) => r.querySelector("ha-icon").getAttribute("icon")) }));
t.results.voll = full;
t.check(full.rows === 5 && !full.form && full.text === "Höchstens 5 weitere Häuser – erst eins löschen." && full.icons.includes("mdi:presentation-play") && full.icons.includes("mdi:flask-outline"), `Grenze: ${JSON.stringify(full)}`);
const limit = await E(async () => {
  try {
    await window.panel._callLocked({ type: "haus3d/sandbox/create", name: "sechstes", source: "empty", demo: true }, "admin");
    return "durch";
  } catch (e) {
    return e.code;
  }
});
t.check(limit === "limit", `Backend-Grenze: ${limit}`);
await t.shot(pg, "haeuser-liste.png");

// --- Löschen des offenen Demo-Hauses: erst zurück in Mein Haus, dann weg (Text nennt „Demo-Haus“)
await Q(`.houses .threw[data-id="${id}"] [data-th="del"]`).click();
await pg.waitForSelector("haus3d-panel .confirm");
t.check(/^Demo-Haus „Showroom“ löschen\?/.test(await T(".confirm .ct")), `Löschen-Frage: ${await T(".confirm .ct")}`);
await pg.waitForTimeout(500);
await Q(".confirm .yes").click();
await pg.waitForFunction((i) => !window.sandbox[i], id, { timeout: 8000 });
await pg.waitForTimeout(600);
const del = await E((i) => ({ house: window.panel._house, stored: localStorage.getItem("haus3d.house"), left: Object.keys(window.sandbox).length, chip: !!window.panel.shadowRoot.querySelector(".modes .mode.m-demo, .modes .mode.m-test"), real: window.realSaves ?? 0 }), id);
t.check(del.house === null && !del.stored && del.left === 4 && !del.chip && del.real === 0, `Löschen: ${JSON.stringify(del)}`);

// --- Anknüpfung: das Backend ist maßgeblich für das Kästchen (_houseSetDemo)
const adopt = await E(async () => {
  const p = window.panel;
  const out = { real: p._houseSetDemo(true), houseReal: p._house };
  const [tid, h] = Object.entries(window.sandbox).find(([, x]) => !x.demo);
  await p._switchHouse({ id: tid, name: h.name, live: true, demo: false });
  out.live = p._house.live;
  out.first = p._houseSetDemo(true);
  out.afterFirst = { ...p._house };
  out.stored = JSON.parse(localStorage.getItem("haus3d.house"));
  out.guard = p._hass.haus3dHouse === tid;
  out.chip = p.shadowRoot.querySelector(".modes .mode.m-demo .mt")?.textContent;
  out.again = p._houseSetDemo(true);
  out.back = p._houseSetDemo(false);
  out.afterBack = { ...p._house };
  out.testChip = !!p.shadowRoot.querySelector(".modes .mode.m-test");
  await p._switchHouse(null);
  return out;
});
t.results.berichtigen = adopt;
t.check(adopt.real === false && adopt.houseReal === null, `Mein Haus wird nie Demo: ${JSON.stringify(adopt)}`);
t.check(adopt.live === true && adopt.first === true && adopt.afterFirst.demo === true && adopt.afterFirst.live === false && adopt.stored.demo === true && adopt.stored.live === false && adopt.guard && /^Demo: /.test(adopt.chip), `_houseSetDemo(true): ${JSON.stringify(adopt)}`);
t.check(adopt.again === false && adopt.back === true && adopt.afterBack.demo === false && adopt.testChip, `_houseSetDemo(false): ${JSON.stringify(adopt)}`);

// --- Entwickler-Fenster: nur „echt schalten“ und der Verweis; nie im Demo-Haus
await E(async () => {
  window.devInstance = true;
  window.panel._devLoaded = false;
  window.panel._dev = undefined;
  await window.panel._loadDev();
});
const dev = async (setup) => {
  await E(setup);
  await pg.waitForTimeout(500);
  await E(() => window.panel._closeDialog());
  await unlock(pg, "admin", { cat: "dev" });
  await pg.waitForSelector("haus3d-panel .devinfo");
  return E(() => {
    const s = window.panel.shadowRoot;
    const live = s.querySelector('[data-th="live"]');
    return { live: !!live, disabled: live?.disabled, checked: live?.checked, sim: !!s.querySelector('[data-dev="sim"]'), houses: !!s.querySelector('[data-dev="houses"]'), list: !!s.querySelector(".houses"), hint: s.querySelector(".catbox .hint")?.textContent };
  });
};
const dReal = await dev(() => window.panel._switchHouse(null));
t.check(dReal.live && dReal.disabled && dReal.sim && dReal.houses && !dReal.list, `Entwickler (Mein Haus): ${JSON.stringify(dReal)}`);
const dTest = await dev(async () => {
  const [tid, h] = Object.entries(window.sandbox).find(([, x]) => !x.demo);
  await window.panel._switchHouse({ id: tid, name: h.name, live: false, demo: false });
});
t.check(dTest.live && !dTest.disabled && !dTest.checked && dTest.sim, `Entwickler (Testhaus): ${JSON.stringify(dTest)}`);
await Q('.catbox [data-th="live"]').check();
await pg.waitForTimeout(200);
const liveOn = await E(() => ({ live: window.panel._house.live, chip: window.panel.shadowRoot.querySelector(".modes .mode.m-test .mt")?.textContent, stored: JSON.parse(localStorage.getItem("haus3d.house")).live }));
t.check(liveOn.live === true && /· live$/.test(liveOn.chip) && liveOn.stored === true, `echt schalten: ${JSON.stringify(liveOn)}`);
const dDemo = await dev(async () => {
  const [tid, h] = Object.entries(window.sandbox).find(([, x]) => x.demo);
  await window.panel._switchHouse({ id: tid, name: h.name, live: true, demo: true });
});
t.check(dDemo.live && dDemo.disabled && !dDemo.checked && !dDemo.sim && /Im Demo-Haus gilt das nie/.test(dDemo.hint) && (await E(() => window.panel._house.live === false)), `Entwickler (Demo-Haus): ${JSON.stringify(dDemo)}`);
// Verweis → Admin → Häuser
await Q('.catbox [data-dev="houses"]').click();
await pg.waitForSelector("haus3d-panel .houses .threw");
t.check((await T(".admin .ttl")) === "Häuser", `Verweis führt nicht zu Häuser: ${await T(".admin .ttl")}`);
// Reihenfolge der Kategorien: Häuser zwischen „Daten & Verlauf“ und „PIN & Zugang“
await Q(".admin .back").click();
const order = await E(() => [...window.panel.shadowRoot.querySelectorAll(".admin .cat")].map((c) => c.dataset.cat));
t.check(order.indexOf("houses") === order.indexOf("data") + 1 && order.indexOf("pin") === order.indexOf("houses") + 1 && order.at(-1) === "dev", `Kategorien: ${order}`);
await E(() => window.panel._closeDialog());

// --- Wandtablet: Demo-Chip sichtbar
const kiosk = await E(() => {
  const p = window.panel;
  p.toggleAttribute("kiosk", true);
  p._renderModes();
  const r = p.shadowRoot.querySelector(".mode.m-demo")?.getBoundingClientRect();
  p.toggleAttribute("kiosk", false);
  p._renderModes();
  return r ? [Math.round(r.width), Math.round(r.height)] : null;
});
t.check(kiosk && kiosk[0] > 40 && kiosk[1] > 20, `Demo-Chip im Wandtablet unsichtbar: ${kiosk}`);
// „Mein Haus“ im Chip (ohne PIN) → echtes Haus
await pg.locator('haus3d-panel .modes .mode.m-demo [data-end="test"]').click();
await pg.waitForFunction(() => !window.panel._house && !window.panel._switching, null, { timeout: 8000 });
t.check(!(await E(() => window.panel.shadowRoot.querySelector(".modes .mode.m-demo, .modes .mode.m-test"))) && (await E(() => window.realSaves ?? 0)) === 0, "„Mein Haus“ im Demo-Chip");
t.check((await E(() => window.calls.filter((c) => c.service).length)) === 0, "Dienstaufruf im ganzen Lauf");
await t.done();
