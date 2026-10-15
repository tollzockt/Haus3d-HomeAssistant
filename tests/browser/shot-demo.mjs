// Demo-Haus (Paket 1c-C): Vorführhaus aus dem Beispielhaus anlegen (Admin → Häuser, ohne Entwickler-Instanz), Chip und
// Demo-Leiste; Lampe, Fenster im 3D, Vorhang, Kamin, Whirlpool schalten; PV-Dialog (0–3000 W, 08:00–18:00, speichern mit
// Bearbeiten-PIN), Uhrzeit 13:00/20:00; Gedrückthalten ohne HA-Dialog; keine echten Werte, Personen, Kamerabilder;
// Editor speichern ohne Demo-Kennungen; Kästchen aus → Testhaus; „Mein Haus“; Wandtablet.
// Über den ganzen Lauf: kein Dienstaufruf und kein callApi an das echte hass, im Demo-Haus nur WS-Befehle der Erlaubnisliste.
import { start, unlock } from "./lib.mjs";
import { DEMO_WS_PASS } from "../../custom_components/haus3d/frontend/demo.js";

const t = await start(process.argv[2]);
const pg = await t.page("demo", "?person&media");
const E = (fn, arg) => pg.evaluate(fn, arg);
const Q = (sel) => pg.locator(`haus3d-panel ${sel}`);
const T = (sel) => E((s) => window.panel.shadowRoot.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, sel);
const ready = () => pg.waitForFunction(() => !window.panel._switching && window.panel._buildingHouse === (window.panel._house?.id ?? null) && !window.panel._loading, null, { timeout: 15000 });
// Leistung im Demo-Haus: Hausverbrauch aus der Bilanz des Demo-Wrappers
const load = () => E(() => window.panel._demo?._bal?.haus ?? null);
const state = (id) => E((i) => window.panel._hass.states[i]?.state ?? null, id);

// --- Vorab in Mein Haus: echter Urlaubsstatus („Haus verlassen“) und eine Meldung einer echten Automation (Dienst notify)
await pg.waitForFunction(() => window.panel?._building && window.sendCommand, null, { timeout: 30000 });
const mein = await E(async () => {
  const p = window.panel;
  window.away = true;
  p._checkSheet("leave");
  await new Promise((d) => setTimeout(d, 400));
  const checked = p.shadowRoot.querySelector("[data-away]")?.checked ?? null;
  p._closeDialog();
  window.sendCommand({ service: "notify", message: "Echte Meldung", level: "warn" });
  await new Promise((d) => setTimeout(d, 200));
  return { away: p._away, checked, notice: p.shadowRoot.querySelector(".notice span")?.textContent ?? null };
});
t.check(mein.away === true && mein.checked === true && mein.notice === "Echte Meldung", `Mein Haus vorab: ${JSON.stringify(mein)}`);

// --- Vorführhaus anlegen: Admin-PIN → Häuser → „Vorführhaus“ aus dem Beispielhaus mit Demo-Modus
await unlock(pg, "admin", { cat: "houses" });
await pg.waitForSelector("haus3d-panel .houses .thnew");
const c0 = await E(() => window.calls.length);
await Q(".houses .thname").fill("Vorführhaus");
await Q(".houses .thsrc").selectOption("example");
t.check(await E(() => !!window.panel.shadowRoot.querySelector(".houses .thdemonew:checked")), "Demo-Kästchen beim Anlegen nicht vorbelegt");
await Q('.houses [data-th="new"]').click();
await pg.waitForFunction(() => window.panel._house?.name === "Vorführhaus" && window.panel._demo && window.panel._buildingHouse === window.panel._house.id, null, { timeout: 20000 });
await ready();
await pg.waitForTimeout(600);
const id = await E(() => window.panel._house.id);
const energy0 = await E((i) => JSON.stringify(window.sandbox[i].building.settings.energy), id);
const opened = await E(() => {
  const p = window.panel;
  const bar = p.shadowRoot.querySelector(".simbar.demobar");
  return { demo: p._isDemo(), chip: p.shadowRoot.querySelector(".modes .mode.m-demo .mt")?.textContent, bar: bar?.textContent.replace(/\s+/g, " ").trim(), tap: p._scene.tapOpenings, devices: p._demo.model?.devices.size ?? 0, persons: p.shadowRoot.querySelectorAll(".people .avatar").length, personStates: Object.keys(p._hass.states).filter((x) => x.startsWith("person.")).length };
});
t.results.geoeffnet = opened;
t.check(opened.demo === true && opened.chip === "Demo: Vorführhaus" && opened.tap === true && opened.devices > 5, `Demo-Haus offen: ${JSON.stringify(opened)}`);
t.check(/^DEMO/.test(opened.bar ?? "") && /keine echten Werte/i.test(opened.bar) && /nichts geht an Home Assistant/.test(opened.bar) && /Uhrzeit/.test(opened.bar) && /Zurücksetzen/.test(opened.bar), `Demo-Leiste: ${opened.bar}`);
t.check(opened.persons === 0 && opened.personStates === 0, `Personen im Demo-Haus: ${JSON.stringify(opened)}`);
// nichts Echtes aus Mein Haus: die Meldung ist weg, neue Meldungen echter Automationen erscheinen nicht, der Urlaubsstatus gilt nicht
const echt = await E(async () => {
  const p = window.panel;
  const gone = !p.shadowRoot.querySelector(".notice");
  const n = window.calls.length;
  window.sendCommand({ service: "notify", message: "Echte Meldung 2", level: "critical" });
  p._checkSheet("leave");
  await new Promise((d) => setTimeout(d, 400));
  const out = { gone, notice: !!p.shadowRoot.querySelector(".notice"), away: p._away, checked: p.shadowRoot.querySelector("[data-away]")?.checked ?? null, status: window.calls.slice(n).some((c) => c.type === "haus3d/away/status") };
  p._closeDialog();
  return out;
});
t.results.echteInhalte = echt;
t.check(echt.gone && !echt.notice && echt.away === false && echt.checked === false && !echt.status, `Meldung und Urlaub aus Mein Haus im Demo-Haus: ${JSON.stringify(echt)}`);

// Ausstattung zum Vorführen (wie im Editor gesetzt): Satteldach, Vorhang, Kamin, Lampe ohne Gerät, Whirlpool im Garten
await E(async (i) => {
  const b = window.sandbox[i].building;
  b.settings.roof = { type: "gable", pitch: 30, overhang: 0.4 };
  const eg = b.floors.find((f) => f.id === "eg");
  eg.furniture.push(
    { id: "demo_vorhang", type: "home_curtain_pair", x: 3.5, z: 0.2, rotation: 0 },
    { id: "demo_kamin", type: "home_fireplace_open", x: 6.4, z: 2.5, rotation: 270 },
    { id: "demo_lampe", type: "lamp_table", x: 4, z: 7.6, rotation: 0 },
    { id: "demo_whirlpool", type: "hot_tub", x: 14.5, z: 3.5, rotation: 0 },
    // Schalter ohne Verknüpfung (zeigen im Demo auf das echte Licht bzw. den echten Rollladen des Raums), eine Lampe mit
    // Verknüpfung auf eine Entität, die es nicht gibt, und eine Gartenlampe in der namenlosen Fläche „rasen“
    { id: "demo_schalter", type: "tech_switch", x: 0.15, z: 2.5, rotation: 90 },
    { id: "demo_jalousie", type: "tech_blind_switch", x: 0.15, z: 3.5, rotation: 90 },
    { id: "demo_leselampe", type: "lamp_table", x: 5, z: 1, rotation: 0, entity: "light.gibt_es_nicht" },
    { id: "demo_gartenlampe", type: "lamp_garden", x: 12, z: 11.5, rotation: 0 },
  );
  await window.panel._load();
}, id);
await ready();
await pg.waitForTimeout(500);
// PV-Feld auf die erste Dachfläche (wie im Editor auf der Dach-Ebene gesetzt)
await E(async (i) => {
  const m = window.panel._scene.roofModel;
  const fr = m.parts[0];
  window.sandbox[i].building.settings.roof.items = [{ id: "pv_sued", type: "pv", x: fr.center[0] + fr.v[0] * fr.width * 0.25, z: fr.center[1] + fr.v[1] * fr.width * 0.25, cols: 4, rows: 2 }];
  await window.panel._load();
}, id);
await ready();
await pg.waitForTimeout(800);
const ents = await E(() => {
  const p = window.panel;
  const eg = p._building.floors.find((f) => f.id === "eg");
  const e = (fid) => eg.furniture.find((m) => m.id === fid)?.entity ?? null;
  return { vorhang: e("demo_vorhang"), kamin: e("demo_kamin"), lampe: e("demo_lampe"), whirlpool: e("demo_whirlpool"), schalter: e("demo_schalter"), jalousie: e("demo_jalousie"), lese: e("demo_leselampe"), garten: e("demo_gartenlampe"), pv: p._demo.model.sources.map((s) => [s.key, s.entity, s.kwp]) };
});
t.results.geraete = ents;
t.check(/^cover\.h3demo_/.test(ents.vorhang ?? "") && /^switch\.h3demo_/.test(ents.kamin ?? "") && /^light\.h3demo_/.test(ents.lampe ?? "") && /^cover\.h3demo_/.test(ents.whirlpool ?? "") && ents.pv.some(([k]) => k === "roof:pv_sued"), `Demo-Geräte: ${JSON.stringify(ents)}`);
t.check(!JSON.stringify(await E((i) => window.sandbox[i].building, id)).includes("h3demo"), "Demo-Kennung im gespeicherten Testhaus (nach dem Laden)");
// Fall 1: Schalter zeigen auf das echte Licht bzw. den echten Rollladen des Raums (nur in der Ansicht); Fall 3: Verknüpfung auf eine
// Entität, die es nicht gibt, wird ein Demo-Licht; Fall 4: Gartenlampe → Bereich „Garten“ nur für diese Fläche, nie eine interne Kennung
t.check(ents.schalter === "light.wohnzimmer_decke" && ents.jalousie === "cover.wohnzimmer_rollladen", `Schalter im Demo-Haus: ${JSON.stringify([ents.schalter, ents.jalousie])}`);
t.check(/^light\.h3demo_/.test(ents.lese ?? "") && /^light\.h3demo_/.test(ents.garten ?? ""), `Lampen: ${JSON.stringify([ents.lese, ents.garten])}`);
const garten = await E(() => {
  const p = window.panel;
  const names = [...p.shadowRoot.querySelectorAll(".room b")].map((b) => b.textContent);
  const eg = p._building.floors.find((f) => f.id === "eg");
  return { names, rasen: eg.outdoor.find((o) => o.id === "rasen")?.area_id, terrasse: eg.outdoor.find((o) => o.id === "terrasse")?.area_id ?? null, label: p._overlays.get("room:eg:rasen")?.el.querySelector("b")?.textContent ?? null, terrasseLabel: !!p._overlays.get("room:eg:terrasse"), lampArea: p._hass.entities[p._demo.model.building.floors.find((f) => f.id === "eg").furniture.find((m) => m.id === "demo_gartenlampe").entity]?.area_id };
});
t.results.garten = garten;
t.check(garten.label === "Garten" && garten.rasen === garten.lampArea && /^h3demo_/.test(garten.rasen ?? "") && !garten.terrasse && !garten.terrasseLabel && !garten.names.some((n) => /h3demo/i.test(n)), `Gartenflächen im Demo-Haus: ${JSON.stringify(garten)}`);
// die schaltbare Leselampe (Fall 3) leuchtet
await E((e) => window.panel._activate(e), ents.lese);
await pg.waitForTimeout(300);
t.check((await state(ents.lese)) === "on", `Leselampe mit fehlender Entität schaltet nicht: ${await state(ents.lese)}`);
await E((e) => window.panel._activate(e), ents.lese);

// --- Lampe tippen: leuchtet, Hausverbrauch steigt (Licht 40 W)
const w0 = await load();
await E(() => window.panel._activate("light.wohnzimmer_stehlampe"));
await pg.waitForTimeout(400);
const lamp = await E(() => {
  const p = window.panel;
  const bulbs = p._scene.lampBulbs.get("light.wohnzimmer_stehlampe") ?? [];
  return { state: p._hass.states["light.wohnzimmer_stehlampe"]?.state, lit: bulbs.length > 0 && bulbs.every((b) => b.material !== p._scene.furnMats.bulb), chip: p.shadowRoot.querySelector('.chips .chip[data-key="lights"] span')?.textContent };
});
const w1 = await load();
t.results.lampe = { ...lamp, w0, w1 };
t.check(lamp.state === "on" && lamp.lit && /Licht an/.test(lamp.chip ?? ""), `Lampe: ${JSON.stringify(lamp)}`);
t.check(Number.isFinite(w0) && w1 - w0 === 40, `Hausverbrauch +40 W: ${w0} → ${w1}`);
// Lampe ohne eigenes Gerät (Demo-Lampe) leuchtet ebenso
await E((e) => window.panel._activate(e), ents.lampe);
await pg.waitForTimeout(300);
t.check((await state(ents.lampe)) === "on" && (await load()) - w1 === 40, `Demo-Lampe: ${await state(ents.lampe)}, ${await load()}`);

// --- Fenster im 3D antippen (Etage EG): „1 offen“, Fenster geht auf
await E(() => window.panel._setFilter("eg"));
await pg.waitForTimeout(1200);
const target = await E(() => {
  const p = window.panel;
  const sc = p._scene;
  const rect = sc.renderer.domElement.getBoundingClientRect();
  const size = sc.viewSize();
  for (const [oid, item] of sc.floors.get("eg").openings) {
    if (item.kind !== "window" || !item.group.visible) continue;
    const o = item.opening;
    const v = new item.group.position.constructor(0, Math.min(o.height, 1.2) / 2, 0);
    item.group.localToWorld(v);
    const s = sc.project(v, size);
    if (!s || s.x < 40 || s.y < 80 || s.x > size.w - 40 || s.y > size.h - 80) continue;
    const x = rect.left + s.x;
    const y = rect.top + s.y;
    const hit = sc.pick(x, y);
    if (hit?.opening?.id === oid) return { id: oid, x, y, before: p.shadowRoot.querySelector('.chips .chip[data-key="ok"], .chips .chip[data-key="open"]')?.textContent.trim() };
  }
  return null;
});
t.results.fenster = target;
t.check(!!target, "kein Fenster im 3D antippbar");
if (target) {
  await pg.mouse.click(target.x, target.y);
  await pg.waitForTimeout(800);
  const win = await E((oid) => {
    const p = window.panel;
    const l = p._links.get("eg").get(oid);
    return { contact: l?.contact, state: p._hass.states[l?.contact]?.state, chip: p.shadowRoot.querySelector('.chips .chip[data-key="open"] span')?.textContent, open: p._status.open.map((o) => o.kind), toast: p.shadowRoot.querySelector(".toast")?.textContent };
  }, target.id);
  t.results.fensterAuf = win;
  t.check(win.state === "on" && win.chip === "1 offen" && win.open.length === 1 && /^Demo: /.test(win.toast ?? ""), `Fenster im 3D: ${JSON.stringify(win)}`);
  await t.shot(pg, "demo-fenster-offen.png");
  // außerhalb des Demo-Hauses sind Öffnungen nicht antippbar (gleiche Stelle: kein Öffnungs-Treffer)
  const plain = await E(([x, y]) => {
    const sc = window.panel._scene;
    sc.tapOpenings = false;
    const hit = sc.pick(x, y);
    sc.tapOpenings = true;
    return hit;
  }, [target.x, target.y]);
  t.check(!plain?.opening, `Öffnung ohne Demo antippbar: ${JSON.stringify(plain)}`);
}
await E(() => window.panel._setFilter("all"));
await pg.waitForTimeout(800);

// --- Vorhang, Kamin, Whirlpool folgen (Whirlpool offen = in Betrieb, 1500 W)
const w2 = await load();
for (const e of [ents.vorhang, ents.kamin, ents.whirlpool]) await E((x) => window.panel._activate(x), e);
await pg.waitForTimeout(500);
const furn = { vorhang: await state(ents.vorhang), kamin: await state(ents.kamin), whirlpool: await state(ents.whirlpool), w2, w3: await load() };
t.results.moebel = furn;
t.check(furn.vorhang === "closed" && furn.kamin === "on" && furn.whirlpool === "open" && furn.w3 - furn.w2 === 1500, `Vorhang/Kamin/Whirlpool: ${JSON.stringify(furn)}`);

// --- Gedrückthalten: Demo-Dialog statt HA-Dialog (auch für ein Symbol im Haus)
const press = await E(async () => {
  const p = window.panel;
  const icon = p._iconEls.find((x) => x.icon.entity_id === "light.kueche") ?? p._iconEls[0];
  const r = icon.el.getBoundingClientRect();
  const opt = { bubbles: true, composed: true, pointerType: "mouse", button: 0, clientX: r.left + 5, clientY: r.top + 5 };
  icon.el.dispatchEvent(new PointerEvent("pointerdown", opt));
  await new Promise((d) => setTimeout(d, 750));
  icon.el.dispatchEvent(new PointerEvent("pointerup", opt));
  await new Promise((d) => setTimeout(d, 100));
  return { id: icon.icon.entity_id, dialog: p.shadowRoot.querySelector(".dialog.simdlg .hint")?.textContent, events: window.events.length };
});
t.results.gedrueckt = press;
t.check(/^Demo – wird nur simuliert/.test(press.dialog ?? "") && press.events === 0, `Gedrückthalten: ${JSON.stringify(press)}`);
await t.shot(pg, "demo-dialog.png");
await E(() => window.panel._closeDialog());
// auch direkt: _moreInfo und die Energie-Karte zeigen nie den HA-Dialog; Kamera ohne Bild und ohne „Live“
const cam = await E(() => {
  const p = window.panel;
  p._moreInfo("sensor.wohnzimmer_temperatur");
  const sensor = !!p.shadowRoot.querySelector(".dialog.simdlg");
  p._runAction("camera.haustuer");
  const img = p.shadowRoot.querySelector(".camdlg img");
  const out = { sensor, events: window.events.length, off: p.shadowRoot.querySelector(".camdlg .camoff")?.textContent, offShown: !p.shadowRoot.querySelector(".camdlg .camoff")?.hidden, src: img?.getAttribute("src") ?? null, live: !!p.shadowRoot.querySelector('.camdlg [data-act="live"]') };
  p._closeDialog();
  return out;
});
t.results.kamera = cam;
t.check(cam.sensor && cam.events === 0 && cam.off === "Demo – kein Kamerabild" && cam.offShown && !cam.src && !cam.live, `Kamera/Dialog im Demo-Haus: ${JSON.stringify(cam)}`);

// --- keine echten Werte: Merkwerte im echten hass erscheinen nie (weder in Zuständen noch in der Anzeige)
const leak = await E(async () => {
  const p = window.panel;
  const real = window.hass;
  const states = { ...real.states };
  for (const [k, s] of Object.entries(states)) if (/^(sensor|light|switch|cover|binary_sensor|climate|media_player)\./.test(k)) states[k] = { ...s, state: k.startsWith("sensor.") ? "echt-123" : s.state, attributes: { ...s.attributes, entity_picture: "/echt.jpg", media_title: "echt-123" } };
  p.hass = { ...real, states };
  await new Promise((d) => setTimeout(d, 400));
  const shown = Object.values(p._hass.states).filter((s) => s.state === "echt-123" || s.attributes?.entity_picture || s.attributes?.media_title === "echt-123").map((s) => s.entity_id);
  const html = p.shadowRoot.innerHTML.includes("echt-123") || p.shadowRoot.innerHTML.includes("/echt.jpg");
  p.hass = real;
  await new Promise((d) => setTimeout(d, 200));
  return { shown, html, pv: p._hass.states["sensor.pv_leistung"]?.state, media: p._hass.states["media_player.wohnzimmer"]?.state };
});
t.results.echteWerte = leak;
t.check(!leak.shown.length && !leak.html && leak.pv !== "412" && leak.media === "off", `echte Werte im Demo-Haus: ${JSON.stringify(leak)}`);

// --- PV-Feld antippen → PV-Dialog; 0–3000 W, 08:00–18:00; Speichern mit Bearbeiten-PIN
await E(() => window.panel._endAdmin()); // Freigabe zurückgeben: Speichern fragt die Bearbeiten-PIN ab
await pg.waitForTimeout(200);
await E(() => window.panel._overlays.get("pv:pv_sued")?.el.click());
await pg.waitForSelector("haus3d-panel .dialog.pvdemo", { timeout: 5000 });
const dlg0 = await E(() => {
  const s = window.panel.shadowRoot;
  const d = s.querySelector(".dialog.pvdemo");
  return { head: d.querySelector(".dialog-head span")?.textContent, name: d.querySelector(".pvd-name")?.textContent, now: d.querySelector(".pvd-now")?.textContent, sun: d.querySelector(".chkrow")?.textContent.trim(), sunOn: d.querySelector('[data-k="sun"]').checked, fromOff: d.querySelector('[data-k="from"]').disabled, min: d.querySelector('[data-k="min"]').value, max: d.querySelector('[data-k="max"]').value, path: !!d.querySelector("svg path.line"), win: !!d.querySelector("svg rect.win") };
});
t.results.pvDialog = dlg0;
t.check(dlg0.head === "PV-Erzeugung (Demo)" && /\d+ Module/.test(dlg0.name) && /kWp/.test(dlg0.name) && /^Jetzt: .* · Heute: .* kWh$/.test(dlg0.now ?? "") && /^Sonnenauf- bis -untergang \(\d\d:\d\d–\d\d:\d\d\)$/.test(dlg0.sun) && dlg0.sunOn && dlg0.fromOff && dlg0.min === "0" && Number(dlg0.max) > 0 && dlg0.path && dlg0.win, `PV-Dialog: ${JSON.stringify(dlg0)}`);
// Prüfung: „bis“ kleiner als „von“
await Q('.pvdemo [data-k="min"]').fill("500");
await Q('.pvdemo [data-k="max"]').fill("100");
t.check(/mindestens so groß/.test((await T(".pvdemo .pvd-err")) ?? ""), `Prüfung von/bis: ${await T(".pvdemo .pvd-err")}`);
await Q('.pvdemo [data-k="min"]').fill("0");
await Q('.pvdemo [data-k="max"]').fill("3000");
await Q('.pvdemo [data-k="sun"]').uncheck();
await Q('.pvdemo [data-k="from"]').fill("18:00");
await Q('.pvdemo [data-k="to"]').fill("08:00");
t.check(/endet vor seinem Anfang/.test((await T(".pvdemo .pvd-err")) ?? ""), `Prüfung Zeitfenster: ${await T(".pvdemo .pvd-err")}`);
await Q('.pvdemo [data-k="from"]').fill("08:00");
await Q('.pvdemo [data-k="to"]').fill("18:00");
await pg.waitForTimeout(300);
const preview = await E(() => ({ err: window.panel.shadowRoot.querySelector(".pvdemo .pvd-err").hidden, preview: window.panel._demo.previews.get("roof:pv_sued") }));
t.check(preview.err && JSON.stringify(preview.preview) === JSON.stringify({ min: 0, max: 3000, from: 480, to: 1080 }), `Vorschau: ${JSON.stringify(preview)}`);
await t.shot(pg, "demo-pv-dialog.png");
await Q('.pvdemo [data-a="save"]').click();
await pg.waitForSelector("haus3d-panel .pinpad", { timeout: 5000 });
await pg.keyboard.type("0000", { delay: 60 });
await pg.waitForFunction(() => !window.panel.shadowRoot.querySelector(".dialog.pvdemo"), null, { timeout: 8000 });
await pg.waitForTimeout(400);
const saved = await E((i) => ({ pv: window.sandbox[i].building.settings?.demo?.pv ?? null, h3: JSON.stringify(window.sandbox[i].building).includes("h3demo"), preview: window.panel._demo.previews.size, cfg: window.panel._demo.pvConfig("roof:pv_sued"), toast: window.panel.shadowRoot.querySelector(".toast")?.textContent, real: window.realSaves ?? 0 }), id);
t.results.pvGespeichert = saved;
t.check(JSON.stringify(saved.pv) === JSON.stringify({ "roof:pv_sued": { min: 0, max: 3000, from: 480, to: 1080 } }) && !saved.h3 && saved.preview === 0 && saved.cfg.max === 3000 && saved.real === 0, `PV gespeichert: ${JSON.stringify(saved)}`);
// Fall 1/3/4 nach dem Speichern: keine echte Kennung an den Schaltern, die Verknüpfung auf die fehlende Entität ist wieder da,
// die Gartenfläche hat weder Bereich noch Namen bekommen
const orig = await E((i) => {
  const b = window.sandbox[i].building;
  const eg = b.floors.find((f) => f.id === "eg");
  const m = (x) => eg.furniture.find((y) => y.id === x);
  const rasen = eg.outdoor.find((o) => o.id === "rasen");
  return { schalter: m("demo_schalter").entity ?? null, jalousie: m("demo_jalousie").entity ?? null, lese: m("demo_leselampe").entity, garten: m("demo_gartenlampe").entity ?? null, rasen: Object.keys(rasen).filter((k) => ["area_id", "name"].includes(k)), fremd: /light\.wohnzimmer_decke|cover\.wohnzimmer_rollladen|h3demo/.test(JSON.stringify(b)) };
}, id);
t.results.original = orig;
t.check(orig.schalter === null && orig.jalousie === null && orig.lese === "light.gibt_es_nicht" && orig.garten === null && !orig.rasen.length && !orig.fremd, `Gespeichertes Testhaus nach dem Speichern: ${JSON.stringify(orig)}`);

// --- Uhrzeit 13:00: PV ≈ 2550–3000 W (Wolken höchstens 15 %), 20:00: 0
const setTime = (m) => E((v) => {
  const r = window.panel.shadowRoot.querySelector('.demobar [data-d="time"]');
  r.value = String(v);
  r.dispatchEvent(new Event("input", { bubbles: true }));
}, m);
await setTime(780);
await pg.waitForTimeout(600);
const noon = await E(() => {
  const p = window.panel;
  return { w: Number(p._hass.states["sensor.h3demo_pv_pv_sued"]?.state), tv: p.shadowRoot.querySelector(".demobar .tv")?.textContent, sun: p._hass.states["sun.sun"]?.state, badge: p._overlays.get("pv:pv_sued")?.el.textContent };
});
t.results.mittag = noon;
t.check(noon.w >= 2550 && noon.w <= 3000 && noon.tv === "13:00" && noon.sun === "above_horizon" && /kW/.test(noon.badge ?? ""), `13:00: ${JSON.stringify(noon)}`);
await t.shot(pg, "demo-1300.png");
await setTime(1200);
await pg.waitForTimeout(500);
const evening = await E(() => ({ w: Number(window.panel._hass.states["sensor.h3demo_pv_pv_sued"]?.state), tv: window.panel.shadowRoot.querySelector(".demobar .tv")?.textContent }));
t.check(evening.w === 0 && evening.tv === "20:00", `20:00: ${JSON.stringify(evening)}`);

// --- Editor speichern: keine Demo-Kennung im Testhaus, nichts ins echte Haus, Sitzung bleibt
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => !!window.panel._editor, null, { timeout: 20000 });
await pg.waitForTimeout(500);
const edToast = await T(".toast");
t.check(/Demo-Haus: automatische Demo-Geräte \(h3demo\) werden nicht gespeichert/.test(edToast ?? ""), `Hinweis beim Öffnen des Editors: ${edToast}`);
// Fall 5A: der Entwurf eines Demo-Hauses trägt die Demo-Geräte und hat deshalb einen eigenen Schlüssel (nie der des Testhauses)
const draft = await E((i) => {
  const ed = window.panel._editor;
  ed.b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === "kueche").name = "Küche Demo";
  ed.dirty = true;
  ed._writeDraft();
  const out = { key: ed.draftKey, demo: ed.demo, keys: Object.keys(localStorage).filter((k) => k.startsWith("haus3d.editorDraft")), h3: !!localStorage.getItem(`haus3d.editorDraft.${i}.demo`)?.includes("h3demo"), plain: localStorage.getItem(`haus3d.editorDraft.${i}`) };
  ed.dirty = false;
  ed.onClose(); // wie ein Neuladen der Seite: der Entwurf bleibt liegen
  return out;
}, id);
t.results.entwurf = draft;
t.check(draft.key === `haus3d.editorDraft.${id}.demo` && draft.demo === true && draft.keys.includes(draft.key) && !draft.keys.includes(`haus3d.editorDraft.${id}`) && draft.h3 && draft.plain === null, `Entwurf im Demo-Haus: ${JSON.stringify(draft)}`);
// Fall 6: Modell-Hochladen im Demo-Haus: kein Knopf, uploadModel erreicht den Server nicht (nur GET-Abrufe gehen durch)
await E(() => {
  window.fetchCalls = [];
  window.hass.fetchWithAuth = async (path, init = {}) => {
    window.fetchCalls.push({ path, method: init.method ?? "GET" });
    return new Response(JSON.stringify({ model: { id: "x", name: "X" } }), { status: 201 });
  };
  window.panel.hass = window.hass; // neue Hülle mit fetchWithAuth
});
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => !!window.panel._editor, null, { timeout: 20000 });
await pg.waitForTimeout(500);
const banner = await E(() => !!window.panel.shadowRoot.querySelector(".ed-banner [data-b=go]"));
t.check(banner, "Entwurf des Demo-Hauses wird nicht zum Fortsetzen angeboten");
await Q(".ed-banner [data-b=go]").click();
const up = await E(async () => {
  const ed = window.panel._editor;
  const { uploadModel } = await import("/custom_components/haus3d/frontend/models.js");
  window.fetchCalls.length = 0;
  let err = null;
  try {
    await uploadModel(new File([new Uint8Array(84)], "x.stl"), { name: "X" });
  } catch (e) {
    err = e.message;
  }
  const body = ed._modelBody([], "standard");
  return { err, posts: window.fetchCalls.filter((c) => c.method !== "GET").length, button: body.includes("data-model-upload"), note: /Demo: eigene 3D-Modelle werden hier nicht geändert/.test(body), demo: ed.demo };
});
t.results.upload = up;
t.check(/Demo: eigene 3D-Modelle werden hier nicht geändert/.test(up.err ?? "") && up.posts === 0 && !up.button && up.note && up.demo, `Modell-Hochladen im Demo-Haus: ${JSON.stringify(up)}`);
await E(() => {
  const ed = window.panel._editor;
  ed.b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === "kueche").name = "Küche Demo";
  ed.dirty = true;
});
await Q(".ed-bar [data-act=save]").click();
await pg.waitForFunction(() => !window.panel._editor, null, { timeout: 10000 });
await pg.waitForTimeout(600);
const edSaved = await E((i) => {
  const b = window.sandbox[i].building;
  return { h3: JSON.stringify(b).includes("h3demo"), name: b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === "kueche").name, energy: b.settings.energy, real: window.realSaves ?? 0, lamp: window.panel._hass.states["light.wohnzimmer_stehlampe"]?.state, devices: window.panel._demo?.model?.devices.size ?? 0 };
}, id);
t.results.editor = edSaved;
t.check(!edSaved.h3 && edSaved.name === "Küche Demo" && edSaved.real === 0 && edSaved.lamp === "on" && edSaved.devices > 5, `Editor im Demo-Haus: ${JSON.stringify(edSaved)}`);
// Energie-Einstellung wie vorher (der Editor ergänzt nur leere Felder), keine eingesetzte Demo-Einstellung
const set = (e) => JSON.stringify(Object.fromEntries(Object.entries(e ?? {}).filter(([, v]) => v !== null)));
t.check(set(edSaved.energy) === set(JSON.parse(energy0)), `Energie-Einstellung nach dem Speichern: ${JSON.stringify(edSaved.energy)} statt ${energy0}`);
t.check((await E((i) => localStorage.getItem(`haus3d.editorDraft.${i}.demo`), id)) === null, "Entwurf des Demo-Hauses nach dem Speichern nicht gelöscht");
await E(() => window.panel._endEdit());

// --- Fall 2: Admin → Energie → Speichern im Demo-Haus: es wird keine Demo-Kennung gespeichert, die Demo-Energie bleibt
const energyState = (i) => {
  const p = window.panel;
  const b = window.sandbox[i].building;
  return { energy: b.settings.energy, h3: JSON.stringify(b).includes("h3demo"), demoOn: p._demo?.model?.building?.settings?.energy?.demo === true, haus: p._hass.states["sensor.h3demo_e_haus"]?.state ?? null, card: !!p._energyEl && !p._energyEl.hidden && p._energyEl.textContent.trim().length > 0, sources: p._demo?.model?.building?.settings?.energy?.sources?.length ?? 0, real: window.realSaves ?? 0 };
};
// ein Haus ohne Energie-Einstellung (wie die Beispieldatei: leeres Gerüst): das Demo setzt eine ein
await E(async (i) => {
  window.sandbox[i].building.settings.energy = { solar: null, einspeisung: null, akku_ladestand: null, akku_leistung: null, ertrag_heute: null };
  await window.panel._load();
}, id);
await ready();
await pg.waitForTimeout(600);
await unlock(pg, "admin", { cat: "energy" });
await pg.waitForSelector("haus3d-panel .catbox .en-save");
const enHint = await T(".catbox .demohint");
t.check(enHint === "Demo-Haus: Energie wird simuliert – Änderungen hier gelten für das Haus ohne Demo.", `Hinweis in Admin → Energie: ${enHint}`);
const en0 = await E(energyState, id);
await Q(".catbox .en-save").click(); // unverändert speichern
await pg.waitForTimeout(900);
const en1 = await E(energyState, id);
t.results.energie = { vorher: en0, ungeaendert: en1 };
t.check(en0.demoOn && en0.card && !en1.h3 && en1.demoOn && en1.card && en1.sources === en0.sources && Number(en1.haus) > 0 && en1.real === 0, `Energie unverändert gespeichert: ${JSON.stringify(en1)}`);
// eine eigene Einstellung (Kurzanzeige) bleibt, die Demo-Teile nicht
await unlock(pg, "admin", { cat: "energy" });
await pg.waitForSelector("haus3d-panel .catbox .en-save");
const kurz = await E(() => {
  const s = window.panel.shadowRoot.querySelector(".catbox [data-kurz]");
  const v = [...s.options].map((o) => o.value).at(-1);
  s.value = v;
  s.dispatchEvent(new Event("change", { bubbles: true }));
  return v;
});
await Q(".catbox .en-save").click();
await pg.waitForTimeout(900);
const en2 = await E(energyState, id);
t.results.energie2 = en2;
t.check(!en2.h3 && en2.energy.kurz === kurz && en2.demoOn && en2.card && Number(en2.haus) > 0 && en2.real === 0, `Energie mit eigener Einstellung gespeichert: ${JSON.stringify(en2)}`);
await E(() => {
  window.panel._closeDialog();
  window.panel._endAdmin();
});

// --- Zurücksetzen: Schaltzustände und Uhrzeit zurück
await Q('.demobar [data-d="reset"]').click();
await pg.waitForTimeout(400);
const reset = { lamp: await state("light.wohnzimmer_stehlampe"), tv: await T(".demobar .tv"), time: await E(() => window.panel._demo.time) };
t.check(reset.lamp === "off" && reset.tv === "jetzt" && reset.time === null, `Zurücksetzen: ${JSON.stringify(reset)}`);

// --- Wandtablet: Chip und Demo-Leiste sichtbar
const kiosk = await E(() => {
  const p = window.panel;
  p.toggleAttribute("kiosk", true);
  p._renderModes();
  const box = (s) => {
    const r = p.shadowRoot.querySelector(s)?.getBoundingClientRect();
    return r ? [Math.round(r.width), Math.round(r.height)] : null;
  };
  const out = { chip: box(".mode.m-demo"), bar: box(".simbar.demobar") };
  p.toggleAttribute("kiosk", false);
  p._renderModes();
  return out;
});
t.check(kiosk.chip && kiosk.chip[0] > 40 && kiosk.bar && kiosk.bar[0] > 100, `Wandtablet: ${JSON.stringify(kiosk)}`);

const cDemoEnd = await E(() => window.calls.length); // bis hierher lief alles im Demo-Haus (Erlaubnisliste); danach kurz als Testhaus
// --- Fall 5B: das Backend kippt den Modus (Demo → Testhaus), während der Editor offen ist (haus3d.reload): der Editor geht zu,
// bei ungespeicherten Änderungen erst nach Nachfrage; die Demo-Geräte im Editor-Gebäude landen nie im Testhaus
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => !!window.panel._editor, null, { timeout: 20000 });
await pg.waitForTimeout(400);
await E((i) => {
  window.panel._editor.dirty = true;
  window.sandbox[i].demo = false;
  window.sendCommand({ service: "reload" });
}, id);
await pg.waitForSelector("haus3d-panel .confirm", { timeout: 8000 });
t.check(/Ungespeicherte Änderungen/.test((await T(".confirm .ct")) ?? ""), `Nachfrage beim Kippen des Modus: ${await T(".confirm .ct")}`);
await pg.waitForTimeout(500);
await Q(".confirm .no").click();
await pg.waitForTimeout(700);
const stay = await E(() => ({ editor: !!window.panel._editor, demo: window.panel._isDemo(), bar: !!window.panel.shadowRoot.querySelector(".simbar.demobar") }));
t.check(stay.editor && stay.demo && stay.bar, `Abgelehnt: Editor und Demo-Modus bleiben: ${JSON.stringify(stay)}`);
await E(() => {
  window.sendCommand({ service: "reload" }); // Block: der Rückgabewert (Laden läuft bis zur Antwort der Nachfrage) darf nicht abgewartet werden
});
await pg.waitForSelector("haus3d-panel .confirm", { timeout: 8000 });
await pg.waitForTimeout(500);
await Q(".confirm .yes").click();
await pg.waitForFunction(() => !window.panel._editor && window.panel._house?.demo === false && !window.panel._demo && !window.panel._loading, null, { timeout: 15000 });
await pg.waitForTimeout(500);
const flipped = await E((i) => ({ editor: !!window.panel._editor, demo: window.panel._isDemo(), chip: window.panel.shadowRoot.querySelector(".modes .mode.m-test .mt")?.textContent, h3: JSON.stringify(window.sandbox[i].building).includes("h3demo"), states: Object.keys(window.panel._hass.states).some((x) => x.includes("h3demo")), drafts: Object.keys(localStorage).filter((k) => k.startsWith(`haus3d.editorDraft.${i}`)) }), id);
t.results.gekippt = flipped;
t.check(!flipped.editor && !flipped.demo && /^Testhaus: /.test(flipped.chip ?? "") && !flipped.h3 && !flipped.states && !flipped.drafts.length, `Modus gekippt, Editor zu: ${JSON.stringify(flipped)}`);
// Testhaus: Modelle hochladen geht (Gegenprobe zu Fall 6)
const upTest = await E(async () => {
  const { uploadModel } = await import("/custom_components/haus3d/frontend/models.js");
  window.fetchCalls.length = 0;
  await uploadModel(new File([new Uint8Array(84)], "x.stl"), { name: "X" }).catch(() => {});
  return window.fetchCalls.filter((c) => c.method === "POST").length;
});
t.check(upTest === 1, `Modell-Hochladen im Testhaus: ${upTest} POST`);
// und ein Entwurf des Demo-Hauses wird im Testhaus nicht zum Fortsetzen angeboten (eigener Schlüssel)
await E((i) => localStorage.setItem(`haus3d.editorDraft.${i}.demo`, JSON.stringify({ v: 1, base_revision: window.panel._revision, floorId: "eg", saved_at: Date.now(), building: { version: 1, floors: [{ id: "x", entity: "light.h3demo_x" }] } })), id);
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => !!window.panel._editor, null, { timeout: 20000 });
await pg.waitForTimeout(500);
const tdraft = await E((i) => ({ key: window.panel._editor.draftKey, banner: !!window.panel.shadowRoot.querySelector(".ed-banner [data-b=go]"), demoDraft: !!localStorage.getItem(`haus3d.editorDraft.${i}.demo`) }), id);
t.check(tdraft.key === `haus3d.editorDraft.${id}` && !tdraft.banner && tdraft.demoDraft, `Entwurf des Demo-Hauses im Testhaus: ${JSON.stringify(tdraft)}`);
// ein älterer Entwurf eines Demo-Hauses unter dem Schlüssel des Testhauses (wie vor dieser Trennung): beim Speichern bleibt
// trotzdem keine Demo-Kennung im Testhaus
await E((i) => {
  window.panel._editor.onClose();
  localStorage.removeItem(`haus3d.editorDraft.${i}.demo`);
  const b = structuredClone(window.sandbox[i].building);
  b.floors.find((f) => f.id === "eg").furniture[0].entity = "light.h3demo_alt";
  localStorage.setItem(`haus3d.editorDraft.${i}`, JSON.stringify({ v: 1, base_revision: window.panel._revision, floorId: "eg", saved_at: Date.now(), building: b }));
}, id);
await E(() => window.panel._openEditor());
await pg.waitForFunction(() => !!window.panel._editor, null, { timeout: 20000 });
await pg.waitForTimeout(500);
await Q(".ed-banner [data-b=go]").click();
await Q(".ed-bar [data-act=save]").click();
await pg.waitForFunction(() => !window.panel._editor, null, { timeout: 10000 });
await pg.waitForTimeout(500);
const alt = await E((i) => ({ h3: JSON.stringify(window.sandbox[i].building).includes("h3demo"), entity: window.sandbox[i].building.floors.find((f) => f.id === "eg").furniture[0].entity ?? null, draft: localStorage.getItem(`haus3d.editorDraft.${i}`) }), id);
t.check(!alt.h3 && alt.entity === null && alt.draft === null, `Alter Entwurf eines Demo-Hauses im Testhaus fortgesetzt und gespeichert: ${JSON.stringify(alt)}`);
await E(() => window.panel._endEdit());
// zurück in den Demo-Modus (das Backend meldet es wieder), damit der Rest wie geplant läuft
await E((i) => {
  window.sandbox[i].demo = true;
  window.sendCommand({ service: "reload" });
}, id);
await pg.waitForFunction(() => window.panel._house?.demo === true && window.panel._demo?.model && !window.panel._loading && !window.panel._switching, null, { timeout: 15000 });
await pg.waitForTimeout(500);

// --- WebSocket im Demo-Haus: nur die Erlaubnisliste (die Modell-Bibliothek liest models.js über das echte hass)
const ws = await E(([a, b]) => window.calls.slice(a, b).filter((c) => c.type).map((c) => c.type), [c0, cDemoEnd]);
const unknown = [...new Set(ws)].filter((x) => !DEMO_WS_PASS.includes(x) && x !== "haus3d/models/list");
t.results.ws = [...new Set(ws)];
t.check(!unknown.length, `WS-Befehle außerhalb der Erlaubnisliste: ${unknown}`);

// --- Kästchen aus → Testhaus-Chip, Tippen gesperrt (nichts an Home Assistant)
await unlock(pg, "admin", { cat: "houses" });
await pg.waitForSelector("haus3d-panel .houses .threw");
await Q(`.houses .threw[data-id="${id}"] [data-th="demo"]`).click();
await pg.waitForFunction(() => window.panel._house?.demo === false && !window.panel._switching && window.panel._buildingHouse === window.panel._house.id, null, { timeout: 10000 });
await pg.waitForTimeout(400);
await E(() => window.panel._closeDialog());
const svc0 = await E(() => window.calls.filter((c) => c.service).length);
await E(() => window.panel._activate("light.kueche"));
await pg.waitForTimeout(300);
const test = await E(() => {
  const p = window.panel;
  return { chip: p.shadowRoot.querySelector(".modes .mode.m-test .mt")?.textContent, demoChip: !!p.shadowRoot.querySelector(".modes .mode.m-demo"), bar: !!p.shadowRoot.querySelector(".simbar.demobar"), demo: !!p._demo, tap: p._scene.tapOpenings, toast: p.shadowRoot.querySelector(".toast")?.textContent, h3: Object.keys(p._hass.states).some((x) => x.includes("h3demo")) };
});
t.results.testhaus = test;
t.check(/^Testhaus: Vorführhaus/.test(test.chip ?? "") && !test.demoChip && !test.bar && !test.demo && !test.tap && !test.h3 && test.toast === "Im Testhaus wird nichts geschaltet.", `Kästchen aus: ${JSON.stringify(test)}`);
t.check((await E(() => window.calls.filter((c) => c.service).length)) === svc0, "Testhaus hat geschaltet");

// --- „Mein Haus“: echte Zustände
await E(() => window.panel._closeDialog());
await Q('.modes .mode.m-test [data-end="test"]').click();
await pg.waitForFunction(() => !window.panel._house && !window.panel._switching, null, { timeout: 10000 });
await pg.waitForTimeout(500);
const real = await E(() => ({ pv: window.panel._hass.states["sensor.pv_leistung"]?.state, media: window.panel._hass.states["media_player.wohnzimmer"]?.state, persons: window.panel.shadowRoot.querySelectorAll(".people .avatar").length, demo: window.panel._isDemo() }));
t.check(real.pv === "412" && real.media === "playing" && real.persons === 2 && real.demo === false, `Mein Haus: ${JSON.stringify(real)}`);
// in Mein Haus kommen Meldungen echter Automationen wieder an
const wieder = await E(async () => {
  window.sendCommand({ service: "notify", message: "Wieder echt", level: "info" });
  await new Promise((d) => setTimeout(d, 200));
  return window.panel.shadowRoot.querySelector(".notice span")?.textContent ?? null;
});
t.check(wieder === "Wieder echt", `Meldung in Mein Haus: ${wieder}`);

// --- über den ganzen Lauf: kein Dienstaufruf, kein callApi, kein HA-Dialog, nichts ins echte Haus gespeichert
const total = await E(() => ({ services: window.calls.filter((c) => c.service).length, api: (window.apiCalls ?? []).length, events: window.events.length, real: window.realSaves ?? 0 }));
t.results.gesamt = total;
t.check(total.services === 0 && total.api === 0 && total.events === 0 && total.real === 0, `Aufrufe an Home Assistant: ${JSON.stringify(total)}`);

// --- Start im Demo-Haus (Handy): der Browser merkt sich ein Testhaus, das Backend meldet Demo → berichtigt, Demo-Teil
// wird erst jetzt nachgeladen (Hülle ohne Zustände bis dahin), nichts Echtes zu sehen
const ph = await t.page("demo-start", "?person", { width: 390, height: 800, touch: true });
const start2 = await ph.evaluate(async () => {
  window.panel.remove();
  const data = await (await fetch("../../custom_components/haus3d/haus-daten.json")).json();
  window.sandbox = { test77: { name: "Showroom", revision: 1, demo: true, building: data } };
  localStorage.setItem("haus3d.house", JSON.stringify({ id: "test77", name: "Showroom", live: false, demo: false }));
  const n = window.calls.length;
  const p = document.createElement("haus3d-panel");
  p.hass = window.hass;
  const before = { demo: p._isDemo(), loaded: typeof p._demoWrap === "function" };
  document.querySelector(".resolver").appendChild(p);
  window.panel = p;
  window.n0 = n;
  return before;
});
await ph.waitForFunction(() => window.panel._demo && window.panel._buildingHouse === "test77" && !window.panel._loading, null, { timeout: 30000 });
await ph.waitForTimeout(1200);
const startRes = await ph.evaluate(() => {
  const p = window.panel;
  return {
    house: p._house,
    stored: JSON.parse(localStorage.getItem("haus3d.house")),
    bar: !!p.shadowRoot.querySelector(".simbar.demobar"),
    short: getComputedStyle(p.shadowRoot.querySelector(".demobar .ds")).display,
    long: getComputedStyle(p.shadowRoot.querySelector(".demobar .dh")).display,
    chip: p.shadowRoot.querySelector(".modes .mode.m-demo .mt")?.textContent,
    persons: p.shadowRoot.querySelectorAll(".people .avatar").length,
    real: p._hass.states["sensor.pv_leistung"]?.state,
    ws: [...new Set(window.calls.slice(window.n0).filter((c) => c.type).map((c) => c.type))],
    services: window.calls.filter((c) => c.service).length,
    events: window.events.length,
  };
});
t.results.startImDemo = { ...start2, ...startRes };
t.check(!start2.loaded && startRes.house.demo === true && startRes.stored.demo === true && startRes.bar && startRes.chip === "Demo: Showroom" && startRes.persons === 0 && startRes.real !== "412", `Start im Demo-Haus: ${JSON.stringify(startRes)}`);
t.check(startRes.short !== "none" && startRes.long === "none", `Demo-Leiste schmal: ${startRes.short}/${startRes.long}`);
// haus3d/subscribe: Abo der Panel-Befehle (show/notify) über die echte Verbindung – so gewollt, schaltet nichts
t.check(startRes.ws.every((x) => DEMO_WS_PASS.includes(x) || x === "haus3d/models/list" || x === "haus3d/subscribe") && !startRes.services && !startRes.events, `Start im Demo-Haus, Aufrufe: ${JSON.stringify(startRes)}`);
await t.shot(ph, "demo-handy.png");
await t.done();
