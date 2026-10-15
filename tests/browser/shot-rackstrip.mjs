// Schrank bestücken im Editor: HE-Leiste (22 bzw. 42 Zeilen), freie HE antippen → Liste → Einbau genau dort, Gerät antippen, ▲/▼ (auch Tausch,
// schnelle Folge = ein Schritt, Pfeiltasten), Ziehen mit der Maus (frei, Tausch, ungültig, Esc), Vorlagen, Lücken schließen, Tür offen im
// 3D, Tablet (Zeilenhöhe, Wischen scrollt ohne Änderung, Tippen wählt).
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const ed = await t.page("rackstrip", "?power", { width: 1280, height: 1100 });
const E = (fn, arg) => ed.evaluate(fn, arg);
await E(() => window.panel._openEditor());
await ed.waitForTimeout(500);
await ed.locator("haus3d-panel .floorsel").selectOption("eg");
await ed.waitForTimeout(300);
const toScreen = (x, z) => E(([x, z]) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  return [r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale];
}, [x, z]);
const click = async (x, z) => {
  const [sx, sy] = await toScreen(x, z);
  await ed.mouse.click(sx, sy);
  await ed.waitForTimeout(120);
};
const zoomTo = async (x0, z0, x1, z1) => {
  await E((v) => {
    const e = window.panel._editor;
    e.view = v;
    e._fitPending = true;
    e.render();
  }, { x0, z0, x1, z1 });
  await ed.waitForTimeout(50);
};
const tool = (k) => ed.locator(`haus3d-panel .ed-bar button[data-tool=${k}]`).click();
const item = (id) => E((id) => structuredClone(window.panel._editor.floor.furniture.find((m) => m.id === id) ?? null), id);
const last = () => E(() => structuredClone(window.panel._editor.floor.furniture.at(-1)));
const place = async (type, x, z) => {
  await tool("furniture");
  await E((type) => (window.panel._editor.furnType = type), type);
  await click(x, z);
  return last();
};
const select = (id) => E((id) => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id };
  e.render();
  e.renderProps();
}, id);
const props = () => E(() => window.panel._editor.props.innerText);
const undoLen = () => E(() => window.panel._editor.undoStack.length);
const hint = () => E(() => window.panel._editor.hint.textContent);
const q = (sel) => ed.locator(`haus3d-panel .ed-props ${sel}`);
/** In der Leiste: [Typ, rack_u] der Geräte des Schranks, nach HE sortiert. */
const rack = (cabId) => E((id) => window.panel._editor.floor.furniture.filter((m) => m.in_rack === id).map((m) => [m.type.replace("tech_", ""), m.rack_u]).sort((a, b) => a[1] - b[1]), cabId);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rack1 = (cabId, type) => E(([id, type]) => window.panel._editor.floor.furniture.find((m) => m.in_rack === id && m.type === type), [cabId, type]);
const reveal = () => E(() => window.panel._editor.props.querySelector("[data-rack-strip]")?.scrollIntoView({ block: "start" }));
const rect = (sel) => E((sel) => {
  const r = window.panel._editor.props.querySelector(sel)?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
}, sel);
/** Mitte der Zeile u (über die Nummer links). */
const rowY = async (u) => {
  const r = await E((u) => {
    const n = [...window.panel._editor.props.querySelectorAll(".rackstrip text.num")].find((x) => x.textContent === String(u));
    const b = n?.getBoundingClientRect();
    return b ? b.y + b.height / 2 : null;
  }, u);
  return r;
};
const devSel = (label) => `.dev[aria-label^="${label}"]`;
/** Eine freie HE antippen und das Teil in der Liste wählen. */
const addAt = async (u, type) => {
  await reveal();
  await q(`[data-rack-free="${u}"]`).click();
  await ed.waitForTimeout(100);
  await q(`[data-rack-add="${type}"]`).click();
  await ed.waitForTimeout(150);
};
/** Gerät mit der Maus ziehen: von seiner Mitte so, dass die Mitte der Lage u … u+he−1 unter dem Zeiger liegt. */
async function drag(fromSel, u, he, { release = true, label } = {}) {
  await reveal();
  const r = await rect(fromSel);
  const x = r.x + r.w / 2;
  const y0 = r.y + r.h / 2;
  const y1 = ((await rowY(u)) + (await rowY(u + he - 1))) / 2;
  await ed.mouse.move(x, y0);
  await ed.mouse.down();
  await ed.mouse.move(x, y0 + Math.sign(y1 - y0) * 8, { steps: 2 });
  for (let i = 1; i <= 10; i++) {
    await ed.mouse.move(x, y0 + ((y1 - y0) * i) / 10);
    await ed.waitForTimeout(15);
  }
  const ghost = await E(() => {
    const g = window.panel._editor.props.querySelector(".rackstrip .ghost");
    return g ? { cls: g.getAttribute("class"), text: g.querySelector("text").textContent } : null;
  });
  if (release) {
    await ed.mouse.up();
    await ed.waitForTimeout(200);
  }
  return { ghost, label };
}

// ---------------------------------------------------------------- A Netzwerkschrank: 22 freie Zeilen
await zoomTo(6.5, 3.8, 11.5, 7.2);
const cab = await place("network_cabinet", 8, 5.5);
t.check(cab.type === "network_cabinet", `Schrank gesetzt: ${JSON.stringify(cab)}`);
const p0 = await props();
t.check(/Bestückung/.test(p0) && /Belegt: 0 von 22 HE · 0 Geräte/.test(p0), `Kopf: ${p0.slice(-600)}`);
t.check((await q("[data-rack-free]").count()) === 22 && (await q(".dev").count()) === 0, `22 freie Zeilen: ${await q("[data-rack-free]").count()}`);
t.check((await q('[data-rack-free="9"]').getAttribute("aria-label")) === "HE 9 frei – Gerät einbauen", "aria-label der freien HE 9");
const css = await E(() => {
  const s = getComputedStyle(window.panel._editor.props.querySelector(".rackstrip"));
  return { maxH: s.maxHeight, oy: s.overflowY, ob: s.overscrollBehaviorY, ta: s.touchAction };
});
t.check(css.oy === "auto" && css.ob === "contain" && css.ta === "pan-y" && /px$/.test(css.maxH) && parseFloat(css.maxH) <= 720, `Leiste scrollt: ${JSON.stringify(css)}`);
const nums = await E(() => [...window.panel._editor.props.querySelectorAll(".rackstrip text.num")].map((n) => n.textContent));
t.check(nums.length === 22 && nums[0] === "22" && nums.at(-1) === "1", `Nummern 1 unten: ${nums.join(",")}`);
const strip0 = await rect(".rackstrip svg");
t.check(near(strip0.h, 22 * 24 + 8, 1) && near(strip0.w, 260, 1), `Größe der Zeichnung: ${JSON.stringify(strip0)}`);
t.check(/Freie HE antippen: Gerät einbauen\. Gerät antippen: wählen\./.test(p0), "Hinweis unter der Leiste");
await t.shot(ed, "rackstrip-leer.png");

// ---------------------------------------------------------------- B HE 9 antippen → Liste → Switch auf HE 9
let u = await undoLen();
await reveal();
await q('[data-rack-free="9"]').click();
await ed.waitForTimeout(150);
t.check((await q('[data-rack-list="9"]').count()) === 1, "Liste für HE 9 offen");
const listText = await q("[data-rack-list]").innerText();
t.results.liste = listText.slice(0, 700);
t.check(/Einbauen ab HE 9/.test(listText) && /Lücke HE 1–22 \(22 HE frei\)/.test(listText), `Kopf der Liste: ${listText.slice(0, 120)}`);
t.check(/19-Zoll-Geräte/.test(listText) && /Blenden und Kabelführung/.test(listText) && /Tischgeräte auf Fachboden/.test(listText), "drei Gruppen");
t.check(!/Server 2 HE|Server 4 HE/.test(listText) && /Switch 1 HE \(24 Ports\)/.test(listText) && /Blindblende 2 HE/.test(listText) && /Bürstenleiste 1 HE \(Kabeldurchführung\)/.test(listText), "zu tiefe Geräte fehlen, neue Blenden da");
t.check(/weitere passen hier nicht \(zu tief oder zu hoch für diese Lücke\)\./.test(listText), `Hinweis auf nicht passende: ${listText.slice(-160)}`);
await t.shot(ed, "rackstrip-liste.png");
await q('[data-rack-add="tech_switch_24"]').click();
await ed.waitForTimeout(200);
const sw = await rack1(cab.id, "tech_switch_24");
t.check(sw?.rack_u === 9 && (await undoLen()) - u === 1, `Switch auf HE 9, ein Schritt: ${JSON.stringify(sw)} ${(await undoLen()) - u}`);
t.check(/Switch 1 HE \(24 Ports\) auf HE 9 eingebaut\./.test(await hint()), `Toast: ${await hint()}`);
t.check((await q("[data-rack-list]").count()) === 0 && (await q(devSel("HE 9 · Switch 1 HE (24 Ports)")).count()) === 1, "Liste zu, Gerät in der Leiste");
t.check((await q(".dev.new").count()) === 1, "gerade eingebaut: Aufleuchten");
t.check((await E(() => window.panel._editor.sel?.id)) === cab.id, "Auswahl bleibt beim Schrank");
t.check(/Belegt: 1 von 22 HE · 1 Gerät/.test(await props()), `Kopf nach dem Einbau: ${(await props()).match(/Belegt[^\n]*/)}`);

// ---------------------------------------------------------------- C 2-HE-Gerät unter belegter HE rückt in der Lücke nach unten
await reveal();
await q('[data-rack-free="8"]').click();
await ed.waitForTimeout(100);
const upsBtn = await q('[data-rack-add="tech_ups_2u"]').innerText();
t.check(/2 HE · HE 7–8/.test(upsBtn) && (await q('[data-rack-add="tech_ups_2u"]').getAttribute("data-rack-at")) === "7", `USV beginnt bei 7: ${upsBtn}`);
await q('[data-rack-add="tech_ups_2u"]').click();
await ed.waitForTimeout(150);
t.check((await rack1(cab.id, "tech_ups_2u"))?.rack_u === 7, `USV auf HE 7–8: ${JSON.stringify(await rack(cab.id))}`);
await addAt(11, "tech_srv_1u");
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["switch_24", 9], ["srv_1u", 11]]), `Stand: ${JSON.stringify(await rack(cab.id))}`);
// nicht mehr frei: HE 9 antippen ist nicht möglich, die Zeile ist ein Gerät; eine veraltete Liste meldet es
await reveal();
await q('[data-rack-free="10"]').click();
await ed.waitForTimeout(100);
await E(() => window.panel._editor.change((fl) => {
  fl.furniture.find((m) => m.type === "tech_switch_24").rack_u = 10; // jemand anders belegt die HE (z. B. Rückgängig/Feld)
}));
const uStale = await undoLen();
await q('[data-rack-add="tech_srv_1u"]').click();
await ed.waitForTimeout(150);
t.check(/HE 10 ist nicht mehr frei\./.test(await hint()) && (await undoLen()) === uStale, `veraltete Liste: ${await hint()} Schritte ${(await undoLen()) - uStale}`);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["switch_24", 10], ["srv_1u", 11]]), "nichts eingebaut");
await E(() => window.panel._editor.undo());
await ed.waitForTimeout(150);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["switch_24", 9], ["srv_1u", 11]]), "zurück");
await select(cab.id); // Rückgängig hebt die Auswahl auf

// ---------------------------------------------------------------- D Gerät antippen → Eigenschaften, ▲ frei, ▲ Tausch, schnell = ein Schritt
await reveal();
await q(devSel("HE 9 · Switch")).click();
await ed.waitForTimeout(150);
const swNow = await rack1(cab.id, "tech_switch_24");
const selD = await E(() => window.panel._editor.sel);
t.check(selD?.id === swNow.id, `Gerät gewählt: ${JSON.stringify(selD)}`);
const pD = await props();
t.check(/Im Schrank: Netzwerkschrank · HE 9/.test(pD) && /Höheneinheit \(unten\)/.test(pD) && /▲ hoch/.test(pD) && /▼ runter/.test(pD) && /Ausbauen/.test(pD) && /Zum Schrank/.test(pD), `Eigenschaften des Geräts: ${pD.slice(0, 200)}`);
t.check((await q(".dev.sel").getAttribute("aria-label")) === "HE 9 · Switch 1 HE (24 Ports)", "gewähltes Gerät in der Leiste markiert");
await t.shot(ed, "rackstrip-gerat.png");
u = await undoLen();
await q("[data-rack-up]").click();
await ed.waitForTimeout(150);
t.check((await item(swNow.id)).rack_u === 10 && (await undoLen()) - u === 1, `▲ (frei): HE ${(await item(swNow.id)).rack_u}`);
await ed.waitForTimeout(800);
u = await undoLen();
await q("[data-rack-up]").click(); // HE 11 gehört dem Server: Tausch
await ed.waitForTimeout(150);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["srv_1u", 10], ["switch_24", 11]]) && (await undoLen()) - u === 1, `▲ (Tausch): ${JSON.stringify(await rack(cab.id))}`);
t.check(near((await item(swNow.id)).mount_y, 0.12 + 10 * 0.0445), "Lage folgt (mount_y)");
await ed.waitForTimeout(800);
// dreimal schnell ▼: ein Schritt
u = await undoLen();
await E(() => {
  const e = window.panel._editor;
  for (let i = 0; i < 3; i++) e.props.querySelector("[data-rack-down]").click();
});
await ed.waitForTimeout(150);
t.check(sameJson(await rack(cab.id), [["switch_24", 7], ["ups_2u", 8], ["srv_1u", 11]]) && (await undoLen()) - u === 1, `3 × ▼ schnell: ${JSON.stringify(await rack(cab.id))} Schritte ${(await undoLen()) - u}`);
await ed.keyboard.press("Control+z");
await ed.waitForTimeout(150);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["srv_1u", 10], ["switch_24", 11]]), `Strg+Z macht alle drei zurück: ${JSON.stringify(await rack(cab.id))}`);
// am oberen Rand gesperrt: Gerät auf 22
await E((id) => window.panel._editor.change((fl) => { fl.furniture.find((m) => m.id === id).rack_u = 22; }), swNow.id);
await select(swNow.id);
t.check((await q("[data-rack-up]").isDisabled()) && !(await q("[data-rack-down]").isDisabled()), "▲ am oberen Rand gesperrt");
await E(() => window.panel._editor.undo());
await select(swNow.id);
// Pfeiltaste in der Leiste: Server (HE 10) ▲ tauscht mit dem Switch (HE 11), der Schrank bleibt stehen
const cabPos = await item(cab.id);
u = await undoLen();
await ed.evaluate(() => window.panel._editor.props.querySelector('.dev[aria-label^="HE 10 ·"]').focus());
await ed.keyboard.press("ArrowUp");
await ed.waitForTimeout(150);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["switch_24", 10], ["srv_1u", 11]]) && (await undoLen()) - u === 1, `↑ auf dem Gerät: ${JSON.stringify(await rack(cab.id))}`);
const cabPos2 = await item(cab.id);
t.check(cabPos2.x === cabPos.x && cabPos2.z === cabPos.z && !/sitzt im Schrank/.test(await hint()), "Pfeiltaste schiebt den Schrank nicht");
t.check(await E(() => window.panel.shadowRoot.activeElement?.dataset?.techPick === window.panel._editor.floor.furniture.find((m) => m.type === "tech_srv_1u").id), "Fokus bleibt auf dem verschobenen Gerät");

// ---------------------------------------------------------------- E Ziehen mit der Maus
await select(cab.id);
// Stand: ups 7–8, switch 10, srv 11. Zug auf freie HE 15
await select(cab.id);
u = await undoLen();
const d1 = await drag(devSel("HE 10 ·"), 15, 1);
t.check(d1.ghost?.cls.includes("ok") && d1.ghost.text === "→ HE 15", `Geisterrechteck grün: ${JSON.stringify(d1.ghost)}`);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["srv_1u", 11], ["switch_24", 15]]) && (await undoLen()) - u === 1, `Zug auf freie HE: ${JSON.stringify(await rack(cab.id))}`);
t.check((await E(() => window.panel._editor.sel?.id)) === cab.id, "der Klick nach dem Zug wählt nichts");
t.check((await q(".rackstrip.drag").count()) === 0 && (await q(".rackstrip .ghost").count()) === 0, "Geisterrechteck weg");
// Zug auf ein gleich großes Gerät: Tausch (Server 11 ↔ Switch 15)
u = await undoLen();
const d2 = await drag(devSel("HE 11 ·"), 15, 1);
t.check(d2.ghost?.cls.includes("ok"), `Tausch grün: ${JSON.stringify(d2.ghost)}`);
t.check(sameJson(await rack(cab.id), [["ups_2u", 7], ["switch_24", 11], ["srv_1u", 15]]) && (await undoLen()) - u === 1, `Tausch: ${JSON.stringify(await rack(cab.id))}`);
t.check(near((await rack1(cab.id, "tech_srv_1u")).mount_y, 0.12 + 14 * 0.0445), "Lage folgt dem Tausch");
await t.shot(ed, "rackstrip-zug.png");
// zwei Patchfelder nebeneinander (HE 12 und 13); die USV (2 HE) auf HE 12–13: überdeckt zwei Geräte → ungültig, nichts ändert sich
await addAt(12, "tech_patch_panel");
await addAt(13, "tech_patch_panel");
const before = await rack(cab.id);
u = await undoLen();
const d3 = await drag(devSel("HE 7–8 ·"), 12, 2);
t.check(d3.ghost?.cls.includes("bad") && d3.ghost.text === "→ HE 12–13", `ungültig: rot ${JSON.stringify(d3.ghost)}`);
t.check(sameJson(await rack(cab.id), before) && (await undoLen()) === u, `ungültiger Zug ändert nichts, kein Schritt: ${JSON.stringify(await rack(cab.id))}`);
// Esc bricht ab
u = await undoLen();
const d4 = await drag(devSel("HE 15 ·"), 20, 1, { release: false });
t.check(d4.ghost?.cls.includes("ok"), `Zug nach HE 20 läuft: ${JSON.stringify(d4.ghost)}`);
await ed.keyboard.press("Escape");
await ed.waitForTimeout(100);
await ed.mouse.up();
await ed.waitForTimeout(200);
t.check(sameJson(await rack(cab.id), before) && (await undoLen()) === u && (await q(".rackstrip .ghost").count()) === 0, `Esc bricht den Zug ab: ${JSON.stringify(await rack(cab.id))}`);
t.check((await E(() => window.panel._editor.sel?.id)) === cab.id, "Esc im Zug lässt die Auswahl stehen");
// einfacher Klick (ohne Zug) wählt das Gerät
await reveal();
await ed.waitForTimeout(400);
await q(devSel("HE 15 ·")).click();
await ed.waitForTimeout(150);
t.check((await E(() => window.panel._editor.sel?.id)) !== cab.id, "Klick ohne Zug wählt das Gerät");

// ---------------------------------------------------------------- F Leistung und Status-Punkt (Entitäten des Test-Harness)
await E(() => window.panel._editor.change((fl) => {
  const s = fl.furniture.find((m) => m.type === "tech_switch_24");
  s.entity = "switch.kaffeemaschine";
  fl.furniture.find((m) => m.type === "tech_srv_1u").info = [{ entity: "sensor.kueche_steckdose_leistung", name: null }];
}));
await select(cab.id);
const pF = await props();
t.check(/Belegt: 6 von 22 HE · 5 Geräte · Leistung jetzt 320 W/.test(pF), `Kopf mit Leistung: ${pF.match(/Belegt[^\n]*/)}`);
t.check((await q(".dev .led.green").count()) === 1 && (await q(".dev .led").count()) === 1, "Status-Punkt grün (Entität an), sonst keiner");

// ---------------------------------------------------------------- G Vorlage „Heimnetz klein“ in einen leeren Schrank, Strg+Z/Strg+Y
t.check((await q("[data-rack-tpl]").isDisabled()) && (await q("[data-rack-tpl-go]").isDisabled()) && /Vorlagen gehen nur in einen leeren Schrank – erst alle Geräte ausbauen\./.test(pF), "nicht leerer Schrank: Vorlage gesperrt");
const cab2 = await place("network_cabinet", 7, 5.5);
t.check(cab2.id !== cab.id, "zweiter Schrank");
const nFurn = await E(() => window.panel._editor.floor.furniture.length);
t.check(!(await q("[data-rack-tpl]").isDisabled()) && /Heimnetz klein \(5 Teile, 10 HE\)/.test(await q("[data-rack-tpl]").innerText()) && /Homelab \(6 Teile, 8 HE\)/.test(await q("[data-rack-tpl]").innerText()), "Vorlagen wählbar");
u = await undoLen();
await q("[data-rack-tpl]").selectOption("heimnetz");
await q("[data-rack-tpl-go]").click();
await ed.waitForTimeout(250);
const tpl = await rack(cab2.id);
t.results.heimnetz = tpl;
t.check(sameJson(tpl, [["ups_2u", 1], ["wifi_router", 3], ["switch_24", 20], ["cable_mgmt", 21], ["patch_panel", 22]]), `Heimnetz klein an den HE aus 1.8: ${JSON.stringify(tpl)}`);
t.check((await undoLen()) - u === 1 && (await E(() => window.panel._editor.floor.furniture.length)) === nFurn + 5, `ein Schritt, 5 Geräte: ${(await undoLen()) - u}`);
t.check(/Vorlage „Heimnetz klein“: 5 Geräte eingebaut\./.test(await hint()), `Toast: ${await hint()}`);
t.check((await item(cab2.id)).rack_used === 10, "rack_used 10");
t.check((await q("[data-rack-tpl]").isDisabled()) && /Vorlagen gehen nur in einen leeren Schrank/.test(await props()), "danach ist die Vorlage gesperrt");
await t.shot(ed, "rackstrip-vorlage.png");
await ed.keyboard.press("Control+z");
await ed.waitForTimeout(200);
t.check((await rack(cab2.id)).length === 0 && (await E(() => window.panel._editor.floor.furniture.length)) === nFurn, "Strg+Z entfernt alle fünf");
await ed.keyboard.press("Control+y");
await ed.waitForTimeout(200);
t.check(sameJson(await rack(cab2.id), tpl), "Strg+Y bringt alle zurück");
await select(cab2.id);

// ---------------------------------------------------------------- H Lücken schließen
u = await undoLen();
t.check(!(await q("[data-rack-fill]").isDisabled()), "Lücken schließen aktiv");
await q("[data-rack-fill]").click();
await ed.waitForTimeout(250);
const filled = await rack(cab2.id);
const blanks = filled.filter(([ty]) => ty === "blank_panel_2u").map(([, v]) => v);
t.check(sameJson(blanks, [8, 10, 12, 14, 16, 18]) && filled.length === 11 && (await undoLen()) - u === 1, `6 Blenden à 2 HE in der Lücke 8–19, ein Schritt: ${JSON.stringify(filled)}`);
t.check(/6 Blindblenden eingesetzt\./.test(await hint()), `Toast: ${await hint()}`);
t.check((await q("[data-rack-free]").count()) === 0 && (await q("[data-rack-fill]").isDisabled()) && /Belegt: 22 von 22 HE · 11 Geräte/.test(await props()), "alles belegt, Knopf gesperrt");
t.check((await q(".dev.passive").count()) === 7, `Blenden und Kabelführung schraffiert: ${await q(".dev.passive").count()}`);
await t.shot(ed, "rackstrip-voll.png");

// ---------------------------------------------------------------- I Tür offen (Feld, 3D, Strg+Z)
await ed.locator('haus3d-panel .ed-bar [data-view="split"]').click();
await ed.waitForTimeout(400);
await ed.waitForFunction(() => !!window.panel._editor.scene3d, null, { timeout: 30000 });
await ed.waitForTimeout(1200);
const doorRot = (id) => E((id) => {
  let top = null;
  window.panel._editor.scene3d.root.traverse((o) => {
    if (!top && o.userData.furniture === id && o.parent?.userData.furniture !== id) top = o;
  });
  const d = top?.getObjectByName("door");
  return d ? d.rotation.y : null;
}, id);
await select(cab2.id);
t.check(near(await doorRot(cab2.id), 0, 1e-6) && (await q("[data-tech-door]").isChecked()) === false, "Tür zu");
u = await undoLen();
await q("[data-tech-door]").check();
await ed.waitForTimeout(500);
t.check((await item(cab2.id)).open === true && (await undoLen()) - u === 1, `Tür offen im Gebäude: ${JSON.stringify((await item(cab2.id)).open)}`);
t.check(near(await doorRot(cab2.id), -(100 * Math.PI) / 180, 1e-6), `3D-Tür gedreht: ${await doorRot(cab2.id)}`);
await E(([x, z]) => {
  const e = window.panel._editor;
  e.sel = null;
  e.render();
  e.renderProps();
  e._sync3d(true);
  const sc = e.scene3d;
  sc.controls.target.set(x, 0.6, z + 0.2);
  sc.camera.position.set(x + 0.9, 1.5, z + 1.7);
  sc.controls.update();
  sc.invalidate?.();
}, [cab2.x, cab2.z]);
await ed.waitForTimeout(1200);
await t.shot(ed, "rackstrip-tuer-offen.png");
await select(cab2.id);
await ed.keyboard.press("Control+z");
await ed.waitForTimeout(500);
t.check((await item(cab2.id)).open === undefined && near(await doorRot(cab2.id), 0, 1e-6), `Strg+Z schließt die Tür: ${JSON.stringify((await item(cab2.id)).open)} ${await doorRot(cab2.id)}`);
await select(cab2.id); // Rückgängig hebt die Auswahl auf
t.check((await q("[data-tech-door]").isChecked()) === false, "Haken wieder aus");
await ed.keyboard.press("Control+y");
await ed.waitForTimeout(400);
t.check((await item(cab2.id)).open === true, "Strg+Y öffnet sie wieder");
// Typwechsel entfernt „offen“
await select(cab2.id);
await ed.locator("haus3d-panel .ed-props [data-m=type]").selectOption("server_rack");
await ed.waitForTimeout(300);
const asRack = await item(cab2.id);
t.check(asRack.type === "server_rack" && asRack.open === undefined, `Typwechsel: ${JSON.stringify(asRack.open)}`);
await ed.locator('haus3d-panel .ed-bar [data-view="2d"]').click();
await ed.waitForTimeout(200);

// ---------------------------------------------------------------- J Serverschrank: 42 HE, Vorlage Homelab von oben ab HE 42
await zoomTo(6.5, 3.8, 11.5, 7.2);
const srv = await place("server_rack", 10, 5.5);
t.check(srv.type === "server_rack" && (await q("[data-rack-free]").count()) === 42 && /Belegt: 0 von 42 HE/.test(await props()), `Serverschrank mit 42 Zeilen: ${await q("[data-rack-free]").count()}`);
t.check(near((await rect(".rackstrip svg")).h, 42 * 24 + 8, 1), "Zeichnung 42 × 24 + 8 px");
const maxH = await E(() => window.panel._editor.props.querySelector(".rackstrip").clientHeight);
t.check(maxH <= 720 && maxH < 1016, `Leiste ist höchstens 720 px hoch und scrollt: ${maxH}`);
await q("[data-rack-tpl]").selectOption("homelab");
await q("[data-rack-tpl-go]").click();
await ed.waitForTimeout(250);
t.check(sameJson(await rack(srv.id), [["ups_2u", 1], ["nas_rack", 3], ["srv_1u", 5], ["srv_1u", 6], ["cable_mgmt", 41], ["switch_24", 42]]), `Homelab im Serverschrank: ${JSON.stringify(await rack(srv.id))}`);
// Scrollstand bleibt nach einer Änderung
await E(() => (window.panel._editor.props.querySelector(".rackstrip").scrollTop = 300));
await ed.waitForTimeout(100);
await q(devSel("HE 3–4 ·")).click({ force: true });
await ed.waitForTimeout(200);
const scrolled = await E(() => window.panel._editor.props.querySelector(".rackstrip").scrollTop);
t.check(scrolled > 150, `Scrollstand bleibt (oder gewähltes Gerät eingescrollt): ${scrolled}`);

// ---------------------------------------------------------------- K Tablet: Zeilenhöhe, Wischen scrollt, Tippen wählt
const tab = await t.page("rackstrip-tablet", "?power", { width: 820, height: 1180, touch: true });
const T = (fn, arg) => tab.evaluate(fn, arg);
await T(() => window.panel._openEditor());
await tab.waitForTimeout(600);
await tab.locator("haus3d-panel .floorsel").selectOption("eg");
await tab.waitForTimeout(300);
t.check(await T(() => window.panel._editor.coarse), "Editor erkennt das Tablet (coarse)");
const tcab = await T(async () => {
  const e = window.panel._editor;
  e.change((fl) => {
    fl.furniture.push({ id: "tab_rack", type: "server_rack", x: 8, z: 5.5, rotation: 0, w: 0.6, d: 1.0, h: 2.0, variant: null, entity: null });
  });
  e.sel = { kind: "furniture", id: "tab_rack" };
  e.render();
  e.renderProps();
  return structuredClone(e.floor.furniture.find((m) => m.id === "tab_rack"));
});
const tq = (sel) => tab.locator(`haus3d-panel .ed-props ${sel}`);
const rows = await T(() => [...window.panel._editor.props.querySelectorAll("[data-rack-free]")].map((r) => r.getBoundingClientRect().height));
t.check(rows.length === 42 && rows.every((h) => h >= 32 - 0.01), `Zeilenhöhe ≥ 32 px: ${Math.min(...rows)} (${rows.length} Zeilen)`);
const tsvg = await T(() => window.panel._editor.props.querySelector(".rackstrip svg").getBoundingClientRect().height);
t.check(near(tsvg, 42 * 32 + 8, 1), `Zeichnung 42 × 32 + 8: ${tsvg}`);
// Tippen auf eine freie HE → Liste → Gerät antippen
await tq('[data-rack-free="3"]').tap();
await tab.waitForTimeout(200);
t.check((await tq('[data-rack-list="3"]').count()) === 1, "Tippen auf freie HE öffnet die Liste");
await tq('[data-rack-add="tech_srv_2u"]').tap();
await tab.waitForTimeout(250);
const tdev = await T(() => structuredClone(window.panel._editor.floor.furniture.find((m) => m.in_rack === "tab_rack")));
t.check(tdev?.type === "tech_srv_2u" && tdev.rack_u === 3, `Einbau per Tippen: ${JSON.stringify([tdev?.type, tdev?.rack_u])}`);
await T(() => (window.panel._editor.props.querySelector(".rackstrip").scrollTop = 0));
const snapshot = await T(() => JSON.stringify(window.panel._editor.floor.furniture));
const undoT = await T(() => window.panel._editor.undoStack.length);
// Wischen (echte Touch-Geste): die Leiste scrollt, nichts wird verschoben
await T(() => window.panel._editor.props.querySelector(".rackstrip").scrollIntoView({ block: "start" }));
await tab.waitForTimeout(100);
const stripBox = await T(() => {
  const r = window.panel._editor.props.querySelector(".rackstrip").getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const cdp = await tab.context().newCDPSession(tab);
/** Wisch mit einem Finger (echte Touch-Ereignisse über das DevTools-Protokoll). */
const swipe = async (x0, y0, y1, steps = 12) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0, y: y0 + ((y1 - y0) * i) / steps }] });
    await tab.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const x = stripBox.x + stripBox.w / 2;
const y = stripBox.y + Math.min(stripBox.h, 600) - 40;
const stripTop = () => T(() => window.panel._editor.props.querySelector(".rackstrip").scrollTop);
t.results.streifen = stripBox;
const s0 = await stripTop();
// Wisch von unten nach oben über die Zeile mit dem Gerät (HE 3–4 liegt unten in der Leiste) und über freie Zeilen
await swipe(x, y, y - 260);
await tab.waitForTimeout(500);
const s1 = await stripTop();
t.check(s1 > s0, `Wischen scrollt die Leiste: ${s0} → ${s1}`);
t.check((await T(() => JSON.stringify(window.panel._editor.floor.furniture))) === snapshot && (await T(() => window.panel._editor.undoStack.length)) === undoT, "Wischen ändert kein rack_u und legt keinen Schritt an");
// über dem Gerät selbst wischen (Zeile des USV-Servers): ebenso
await T(() => (window.panel._editor.props.querySelector(".rackstrip").scrollTop = 99999));
await tab.waitForTimeout(100);
const dBox = await T(() => {
  const r = window.panel._editor.props.querySelector(".dev").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const s2 = await stripTop();
const y2 = Math.min(dBox.y, stripBox.y + stripBox.h - 20);
await swipe(dBox.x, y2, y2 + 200);
await tab.waitForTimeout(500);
const s3 = await stripTop();
t.check(s3 < s2, `Wischen über dem Gerät scrollt ebenfalls: ${s2} → ${s3}`);
t.check((await T(() => JSON.stringify(window.panel._editor.floor.furniture))) === snapshot, "kein rack_u geändert");
// Tippen auf das Gerät wählt es
await tab.waitForTimeout(1500); // ein Tipp während des Nachlaufens eines Wischens stoppt nur den Nachlauf
await T(() => (window.panel._editor.props.querySelector(".rackstrip").scrollTop = 99999));
await tab.waitForTimeout(100);
// (die erste Berührung nach dem Wischen und dem Scrollen per Programm geht in Chromium verloren – kein Klick: erst auf freie Fläche tippen)
await tq("p.muted").first().tap();
await tab.waitForTimeout(400);
await tq(".dev").first().tap();
await tab.waitForTimeout(300);
t.check((await T(() => window.panel._editor.sel?.id)) === tdev.id, "Tippen auf das Gerät wählt es");
t.check((await tq(".dev.sel").count()) === 1 && /▲ hoch/.test(await T(() => window.panel._editor.props.innerText)), "Eigenschaften des Geräts mit ▲/▼");
await t.shot(tab, "rackstrip-tablet.png");

await t.done();
