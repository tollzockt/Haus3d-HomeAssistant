// Technik im Editor: Schrank mit eingebauten Geräten (Setzen, Plan bleibt anwählbar, Felder, Ausbauen, Mitziehen, Herausziehen,
// Löschen), Steckdose an der Wand, Erweiterungsakkus am Balkonspeicher, Ansichten in 3D.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const ed = await t.page("rack", "?power", { width: 1280, height: 800 });
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
const dragPlan = async ([x0, z0], [x1, z1], steps = 10) => {
  const [a, b] = await toScreen(x0, z0);
  const [c, d] = await toScreen(x1, z1);
  const len = Math.hypot(c - a, d - b) || 1;
  await ed.mouse.move(a, b);
  await ed.mouse.down();
  await ed.mouse.move(a + ((c - a) * 10) / len, b + ((d - b) * 10) / len);
  for (let i = 1; i <= steps; i++) {
    await ed.mouse.move(a + ((c - a) * i) / steps, b + ((d - b) * i) / steps);
    await ed.waitForTimeout(30);
  }
  await ed.mouse.up();
  await ed.waitForTimeout(150);
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
const props = () => E(() => window.panel._editor.props.innerText);
const undoLen = () => E(() => window.panel._editor.undoStack.length);
const planIds = () => E(() => [...window.panel._editor.svg.querySelectorAll('g[data-kind="furniture"]')].map((g) => g.dataset.id));
const topAt = (x, z) => E(([x, z]) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  const el = e.svg.getRootNode().elementFromPoint(r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale);
  return el?.closest?.("[data-kind]")?.dataset.id ?? null;
}, [x, z]);

// ---------------------------------------------------------------- A Schrank und Geräte setzen
await zoomTo(6.5, 3.8, 11.5, 7.2);
const cab = await place("network_cabinet", 8, 5.5);
t.results.schrank = cab;
t.check(cab.type === "network_cabinet" && cab.rack_used === undefined, `Schrank gesetzt: ${JSON.stringify(cab)}`);

const srv = await place("tech_srv_1u", 8, 5.5);
const sw = await place("tech_switch_24", 8.1, 5.4);
const ups = await place("tech_ups_2u", 7.95, 5.6);
const fl = await E(() => structuredClone(window.panel._editor.floor.furniture.filter((m) => m.in_rack)));
t.results.eingebaut = fl.map((m) => [m.type, m.rack_u, m.x, m.z, m.mount_y]);
t.check(srv.in_rack === cab.id && srv.rack_u === 1 && sw.in_rack === cab.id && sw.rack_u === 2 && ups.in_rack === cab.id && ups.rack_u === 3, `Einbau in die unterste Lücke: ${JSON.stringify(t.results.eingebaut)}`);
t.check(near(srv.mount_y, 0.12) && near(sw.mount_y, 0.12 + 0.0445) && near(ups.mount_y, 0.12 + 2 * 0.0445) && near(ups.x, 8) && near(ups.z, 5.5 + 0.3 - 0.04 - 0.225), `Lage der Geräte: ${JSON.stringify([srv, sw, ups].map((m) => [m.x, m.z, m.mount_y]))}`);
const cab1 = await item(cab.id);
t.check(cab1.rack_used === 4, `rack_used: ${cab1.rack_used}`);

// Plan: eingebaute Geräte sind nicht gezeichnet, der Schrank bleibt anwählbar
await tool("select");
await E(() => { window.panel._editor.sel = null; window.panel._editor.render(); window.panel._editor.renderProps(); });
const ids = await planIds();
t.check(ids.includes(cab.id) && !ids.includes(srv.id) && !ids.includes(sw.id) && !ids.includes(ups.id), `Plan ohne eingebaute Geräte: ${JSON.stringify(ids)}`);
t.check((await topAt(8, 5.5)) === cab.id, `Schrank liegt oben im Plan: ${await topAt(8, 5.5)}`);
await click(8, 5.5);
const sel1 = await E(() => window.panel._editor.sel);
t.check(sel1?.id === cab.id, `Schrank anwählbar: ${JSON.stringify(sel1)}`);

// ---------------------------------------------------------------- B Felder am Schrank und am Gerät
const p1 = await props();
t.results.felderSchrank = p1.slice(0, 600);
t.check(/Belegt: 4 von 22 HE/.test(p1) && /HE 3–4 · USV 2 HE/.test(p1) && /HE 1 · Server 1 HE/.test(p1), `Felder am Schrank: ${p1.slice(0, 400)}`);
await t.shot(ed, "rack-plan.png");
await ed.locator("haus3d-panel .ed-props [data-tech-pick]").nth(1).click(); // zweiter Eintrag von oben: der Switch
const sel2 = await E(() => window.panel._editor.sel);
const p2 = await props();
t.check(sel2?.id === sw.id && /Im Schrank: Netzwerkschrank · HE 2/.test(p2) && /Höheneinheit \(unten\)/.test(p2) && /Ausbauen/.test(p2), `Gerät aus der Liste gewählt: ${JSON.stringify(sel2)} ${p2.slice(0, 300)}`);
t.check((await planIds()).includes(sw.id), "gewähltes eingebautes Gerät erscheint im Plan");

// Höheneinheit ändern: 10
const u0 = await undoLen();
const uin = ed.locator("haus3d-panel .ed-props [data-tech-u]");
await uin.fill("10");
await uin.dispatchEvent("change");
await ed.waitForTimeout(150);
const sw2 = await item(sw.id);
const u0n = (await undoLen()) - u0;
// (u0n kann 2 sein: der künstlich ausgelöste „change“ und der echte beim Entfernen des fokussierten Felds)
t.check(sw2.rack_u === 10 && near(sw2.mount_y, 0.12 + 9 * 0.0445) && u0n >= 1, `Höheneinheit 10: ${JSON.stringify(sw2)} Schritte ${u0n}`);
// belegte HE (3 = USV): rückt in die nächste freie Lücke
await uin.fill("3");
await uin.dispatchEvent("change");
await ed.waitForTimeout(150);
const sw3 = await item(sw.id);
t.check(sw3.rack_u === 2, `belegte HE rückt weiter: ${sw3.rack_u}`);

// Ausbauen: frei vor dem Schrank, im Plan gezeichnet, der Schrank zählt neu
await ed.locator("haus3d-panel .ed-props [data-tech-out]").click();
await ed.waitForTimeout(150);
const out = await item(sw.id);
t.results.ausgebaut = out;
t.check(out.in_rack === undefined && out.rack_u === undefined && out.mount_y === undefined && near(out.z, 5.5 + 0.3 + 0.14 + 0.1), `Ausbauen: ${JSON.stringify(out)}`);
t.check((await item(cab.id)).rack_used === 3, "Schrank: rack_used nach dem Ausbauen");
const p3 = await props();
t.check(/In Schrank einbauen/.test(p3) && /Netzwerkschrank · 19 von 22 HE frei/.test(p3), `Auswahl In Schrank einbauen: ${p3.slice(0, 300)}`);
// wieder einbauen über die Auswahl
await ed.locator("haus3d-panel .ed-props [data-tech-in]").selectOption(cab.id);
await ed.waitForTimeout(150);
const back = await item(sw.id);
t.check(back.in_rack === cab.id && back.rack_u === 2, `Einbauen über die Auswahl: ${JSON.stringify(back)}`);
// eingebaute Geräte stehen gerade: keine Felder Neigung/Kippen
t.check(await E(() => !window.panel._editor.props.querySelector("[data-num=tilt]") && !window.panel._editor.props.querySelector("[data-num=roll]")), "Eingebautes Gerät bietet Neigung/Kippen an");

// ---------------------------------------------------------------- C Schrank bewegen und drehen: Geräte folgen
await click(8.25, 5.25); // Schrank wählen (Mitte liegt unter den ausgeblendeten Geräten)
await E((id) => { const e = window.panel._editor; e.sel = { kind: "furniture", id }; e.render(); e.renderProps(); }, cab.id);
t.check(await E(() => !window.panel._editor.props.querySelector("[data-num=tilt]") && !!window.panel._editor.props.querySelector("[data-num=rotation]")), "Schrank mit Geräten bietet Neigung/Kippen an");
await dragPlan([8, 5.5], [9.2, 5.2], 12);
const cab2 = await item(cab.id);
const devs = async () => E((id) => structuredClone(window.panel._editor.floor.furniture.filter((m) => m.in_rack === id)), cab.id);
const d2 = await devs();
t.results.mitgezogen = { cab: [cab2.x, cab2.z], devs: d2.map((m) => [m.rack_u, m.x, m.z]) };
t.check(cab2.x > 8.5 && d2.length === 3 && d2.every((m) => near(m.x, cab2.x, 0.002)), `Geräte folgen dem Schrank: ${JSON.stringify(t.results.mitgezogen)}`);
await ed.keyboard.press("r");
await ed.waitForTimeout(100);
const cab3 = await item(cab.id);
const d3 = await devs();
t.check(cab3.rotation === 90 && d3.every((m) => m.rotation === 90 && near(m.z, cab3.z, 0.002) && m.x < cab3.x), `Drehen: ${JSON.stringify(d3.map((m) => [m.x, m.z, m.rotation]))}`);
await ed.keyboard.press("Shift+R");
await ed.keyboard.press("Shift+R");
await ed.keyboard.press("Shift+R");
await ed.keyboard.press("Shift+R");
await ed.keyboard.press("Shift+R");
await ed.keyboard.press("Shift+R");
await ed.waitForTimeout(100);
t.check((await item(cab.id)).rotation === 0, "zurück auf 0°");

// ---------------------------------------------------------------- D Gerät aus dem Schrank ziehen
await zoomTo(7, 3.8, 11, 7.2);
const target = await item(cab.id);
const dev = (await devs()).find((m) => m.rack_u === 1);
await E((id) => { const e = window.panel._editor; e.sel = { kind: "furniture", id }; e.render(); e.renderProps(); }, dev.id);
const u1 = await undoLen();
await dragPlan([dev.x, dev.z], [target.x + 1.3, target.z - 0.3], 14);
const dragged = await item(dev.id);
t.results.herausgezogen = dragged;
t.check(dragged.in_rack === undefined && dragged.rack_u === undefined && dragged.mount_y === undefined && dragged.x > target.x + 0.5, `Herausziehen: ${JSON.stringify(dragged)}`);
t.check((await item(cab.id)).rack_used === 3, "Schrank: rack_used nach dem Herausziehen");
t.check((await undoLen()) - u1 === 1, `ein Rückgängig-Schritt: ${(await undoLen()) - u1}`);
// zurück in den Schrank ziehen
await dragPlan([dragged.x, dragged.z], [target.x + 0.05, target.z + 0.05], 14);
const again = await item(dev.id);
t.check(again.in_rack === cab.id && again.rack_u === 1, `Hineinziehen: ${JSON.stringify(again)}`);

// ---------------------------------------------------------------- E 3D: Schrank mit Glastür und Geräten
await ed.locator('haus3d-panel .ed-bar [data-view="split"]').click();
await ed.waitForTimeout(400);
await E(() => window.panel._editor.scene3d?._ready);
await ed.waitForFunction(() => !!window.panel._editor.scene3d, null, { timeout: 30000 });
await ed.waitForTimeout(1500);
await E(([x, z]) => {
  const e = window.panel._editor;
  e.sel = null;
  e.render();
  e.renderProps();
  e._sync3d(true);
  const sc = e.scene3d;
  sc.controls.target.set(x, 0.62, z);
  sc.camera.position.set(x + 0.6, 0.95, z + 1.9);
  sc.controls.update();
  sc.invalidate?.();
}, [target.x, target.z]);
await ed.waitForTimeout(1500);
await t.shot(ed, "rack-3d.png");

// ---------------------------------------------------------------- F Schrank löschen: Geräte bleiben stehen
await tool("select");
await E((id) => { const e = window.panel._editor; e.sel = { kind: "furniture", id }; e.render(); e.renderProps(); }, cab.id);
const posBefore = await devs();
await E(() => window.panel._editor.deleteSelection());
await ed.waitForTimeout(150);
const left = await E((ids) => structuredClone(window.panel._editor.floor.furniture.filter((m) => ids.includes(m.id))), posBefore.map((m) => m.id));
t.check(left.length === 3 && left.every((m) => m.in_rack === undefined && m.rack_u === undefined && m.mount_y === undefined) && left.every((m, i) => m.x === posBefore[i].x && m.z === posBefore[i].z), `Schrank gelöscht: ${JSON.stringify(left.map((m) => [m.in_rack, m.mount_y, m.x]))}`);
await E(() => window.panel._editor.undo());
await ed.waitForTimeout(100);
t.check((await E((id) => window.panel._editor.floor.furniture.find((m) => m.id === id)?.rack_used, cab.id)) === 4, "Rückgängig stellt den Schrank samt Einbau wieder her");

// ---------------------------------------------------------------- G Steckdose an der Wand, Verknüpfung
await ed.locator('haus3d-panel .ed-bar [data-view="2d"]').click();
await ed.waitForTimeout(200);
await zoomTo(0, 0, 7, 5);
const sock = await place("tech_socket", 2.0, 0.3);
await ed.locator("haus3d-panel .ed-props .pad [data-act=wall]").click();
await ed.waitForTimeout(100);
const s2 = await item(sock.id);
t.results.steckdose = s2;
t.check(s2.type === "tech_socket" && s2.rotation === 0 && near(s2.z, 0.06 + 0.01, 0.06) && s2.mount_y === undefined, `Steckdose an der Wand: ${JSON.stringify(s2)}`);
const gp = await props();
t.check(/Verknüpfte Entität/.test(gp), "Steckdose: Feld Verknüpfte Entität");

// ---------------------------------------------------------------- H Erweiterungsakkus am Balkonspeicher
await zoomTo(0, 0, 7, 5);
const bat = await place("bat_anker_solarbank", 5.5, 2.5);
const bp = await props();
t.check(/Erweiterungsakkus darunter/.test(bp), `Feld Erweiterungsakkus: ${bp.slice(0, 400)}`);
const pk = ed.locator("haus3d-panel .ed-props [data-tech-packs]");
await pk.fill("3");
await pk.dispatchEvent("change");
await ed.waitForTimeout(150);
const bat2 = await item(bat.id);
t.check(bat2.packs === 3 && near(bat2.h, 0.254 + 3 * 0.2175, 1e-9), `Akku-Stapel: ${JSON.stringify(bat2)}`);
await pk.fill("0");
await pk.dispatchEvent("change");
const bat3 = await item(bat.id);
t.check(bat3.packs === undefined && near(bat3.h, 0.254, 1e-9), `ohne Akkus: ${JSON.stringify(bat3)}`);
await pk.fill("2");
await pk.dispatchEvent("change");

// 3D-Ansicht der Wandtypen, des Heizungsraums und des Speichers
await ed.locator('haus3d-panel .ed-bar [data-view="split"]').click();
await ed.waitForTimeout(1200);
await E(() => {
  const e = window.panel._editor;
  e.sel = null;
  e.render();
  e.renderProps();
  e._sync3d(true);
  const sc = e.scene3d;
  sc.controls.target.set(5.2, 0.5, 2.5);
  sc.camera.position.set(6.4, 1.3, 4.6);
  sc.controls.update();
  sc.invalidate?.();
}, null);
await ed.waitForTimeout(1500);
await t.shot(ed, "rack-akku-3d.png");
await t.done();
