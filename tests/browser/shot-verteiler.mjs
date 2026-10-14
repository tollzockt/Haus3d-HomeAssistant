// Verteiler drehbar, Leitungen an der Decke: Setzen an der Wand (zum Raum gedreht), Gehäuse mit Vorderseite im
// Plan, Drehen per Taste, Feld, Drehgriff, Steuerkreuz, kein Langdruck-Menü mit der Maus, Ziehen an die Wand, Ecke, alter
// Knoten ohne Drehung; Leitungshöhen als Stufen (Strom an der Decke, Wasser am Boden), eigene Höhe, Abschluss,
// Alle-Punkte-Felder, Decke im KG, senkrechter Anschluss am Verteiler in 3D; am Tablet Setzen, Langdruck-Menü,
// Wandknopf und Möbel an die Wand (die Etage bleibt).
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- A Desktop: drehen
const ed = await t.page("verteiler", "?power", { width: 1280, height: 800 });
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
  await ed.waitForTimeout(100);
};
/**
 * Zeiger von (x0, z0) nach (x1, z1) im Plan ziehen (ohne Loslassen): der erste Schritt geht gleich 10 px weit,
 * danach in Schritten, damit jede Bewegung ankommt.
 */
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
};
/** Plan auf einen Ausschnitt (m) einpassen. */
const zoomTo = async (x0, z0, x1, z1) => {
  await E((v) => {
    const e = window.panel._editor;
    e.view = v;
    e._fitPending = true;
    e.render();
  }, { x0, z0, x1, z1 });
  await ed.waitForTimeout(50);
};
const view = async (mode) => {
  await ed.locator(`haus3d-panel .ed-bar [data-view="${mode}"]`).click();
  await ed.waitForTimeout(300);
};
const node = (id) => E((id) => structuredClone((window.panel._editor.floor.nodes ?? []).find((n) => n.id === id) ?? null), id);
const undoLen = () => E(() => window.panel._editor.undoStack.length);
const tool = (k) => ed.locator(`haus3d-panel .ed-bar button[data-tool=${k}]`).click();

// Setzen an der Ostwand der Küche (x 7…11, z 0…4): Rückseite an der Wand, zum Raum gedreht
await zoomTo(6, -1, 12, 5);
await tool("node");
await ed.locator('haus3d-panel .ed-props [data-nk="hv"]').click();
await click(10.9, 2.0);
const placed = await E(() => {
  const e = window.panel._editor;
  return { n: structuredClone(e.floor.nodes.at(-1)), toast: e.hint.textContent, sel: e.sel };
});
const hv = placed.n.id;
t.results.setzen = placed;
t.check(placed.n.kind === "hv" && placed.n.rotation === 90 && placed.n.x === 10.94 && placed.n.z === 2, `Setzen an der Wand: ${JSON.stringify(placed.n)}`);
t.check(placed.toast === "Hauptverteilung gesetzt und zur Wand gedreht – rechts Name und Zähler wählen.", `Toast beim Setzen: ${placed.toast}`);
t.check(placed.sel?.kind === "pnode" && placed.sel.id === hv, `Auswahl nach dem Setzen: ${JSON.stringify(placed.sel)}`);

// Plan: Gehäuse gedreht mit Spitze, Drehgriff; der Fußabdruck neben dem Kreis ist kein Ziel
const plan = await E((id) => {
  const e = window.panel._editor;
  const g = e.svg.querySelector(`g[data-kind="pnode"][data-id="${id}"]`);
  const body = g?.querySelector("g[transform]");
  const n = e.floor.nodes.find((x) => x.id === id);
  const off = 16 / e.scale; // knapp außerhalb des Kreises (10 px), noch im Gehäuse (0,6 m breit)
  const r = e.svg.getBoundingClientRect();
  const el = e.svg.getRootNode().elementFromPoint(r.left + e.tx + n.x * e.scale, r.top + e.tz + (n.z + off) * e.scale);
  return {
    transform: body?.getAttribute("transform"),
    pe: body?.getAttribute("pointer-events"),
    tip: !!body?.querySelector("path"),
    rect: !!body?.querySelector("rect"),
    grip: !!e.svg.querySelector(`[data-kind="nrotate"][data-id="${id}"]`),
    under: el?.closest?.("[data-kind]")?.dataset.kind ?? null,
    off,
  };
}, hv);
t.results.plan = plan;
t.check(/rotate\(90\)/.test(plan.transform ?? "") && plan.pe === "none" && plan.tip && plan.rect && plan.grip, `Plan: Gehäuse und Drehgriff: ${JSON.stringify(plan)}`);
t.check(plan.off < 0.28 && plan.under !== "pnode", `Fußabdruck anklickbar: ${JSON.stringify(plan)}`);
await t.shot(ed, "verteiler-plan.png");

// R dreht um 90°, Umschalt+R 15° zurück
await ed.mouse.move(5, 5);
await ed.keyboard.press("r");
const r1 = (await node(hv)).rotation;
await ed.keyboard.press("Shift+R");
const r2 = (await node(hv)).rotation;
t.results.taste = [r1, r2];
t.check(r1 === 180 && r2 === 165, `Taste R / Umschalt+R: ${r1}, ${r2}`);

// Drehfeld 270 → Plan und 3D (Split-Ansicht)
const rot = ed.locator("haus3d-panel .ed-props [data-nrot]");
await rot.fill("270");
await rot.dispatchEvent("change");
await ed.waitForTimeout(150);
await view("split");
await ed.waitForFunction(() => !!window.panel._editor.scene3d?._pipeNodes?.size, null, { timeout: 30000 });
await ed.waitForTimeout(1500);
const feld = await E((id) => {
  const e = window.panel._editor;
  return {
    rotation: e.floor.nodes.find((x) => x.id === id).rotation,
    ry: e.scene3d._pipeNodes.get(id)?.obj.rotation.y,
    transform: e.svg.querySelector(`g[data-kind="pnode"][data-id="${id}"] g[transform]`)?.getAttribute("transform"),
  };
}, hv);
t.results.feld = feld;
t.check(feld.rotation === 270 && near(feld.ry, -1.5 * Math.PI) && /rotate\(270\)/.test(feld.transform ?? ""), `Drehfeld 270: ${JSON.stringify(feld)}`);
await view("2d"); // Ziehen im Plan ohne laufende 3D-Ansicht (SwiftShader bremst die Zeiger-Ereignisse)

// Drehgriff ziehen: Vorderseite zum Zeiger (nach Süden = 0°), ohne die Eigenschaften neu zu zeichnen, ein Schritt
const grip = await E((id) => {
  const e = window.panel._editor;
  const c = e.svg.querySelector(`[data-kind="nrotate"][data-id="${id}"]`);
  e.props.querySelector("[data-nrot]").__alt = true;
  return [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))];
}, hv);
const u0 = await undoLen();
const n0 = await node(hv);
await dragPlan(grip, [n0.x, n0.z + 0.9], 12);
const gripMid = await E((id) => {
  const e = window.panel._editor;
  const f = e.props.querySelector("[data-nrot]");
  return { same: f?.__alt === true, value: f?.value, rotation: e.floor.nodes.find((x) => x.id === id).rotation };
}, hv);
await ed.mouse.up();
await ed.waitForTimeout(150);
const u1 = await undoLen();
t.results.griff = { ...gripMid, undo: u1 - u0 };
t.check(gripMid.same && gripMid.value === "0" && gripMid.rotation === 0 && u1 - u0 === 1, `Drehgriff: ${JSON.stringify(t.results.griff)}`);

// Steuerkreuz: ⟳ 90°, ⟲ 15° zurück, Wandknopf stellt an die Wand und dreht zum Raum
await ed.locator('haus3d-panel .ed-props .pad [data-rot="90"]').click();
const p1 = (await node(hv)).rotation;
await ed.locator('haus3d-panel .ed-props .pad [data-rot="-15"]').click();
const p2 = (await node(hv)).rotation;
await ed.locator("haus3d-panel .ed-props .pad [data-act=wall]").click();
const p3 = await node(hv);
t.results.steuerkreuz = [p1, p2, p3];
t.check(p1 === 90 && p2 === 75 && p3.rotation === 90 && p3.x === 10.94 && p3.z === 2, `Steuerkreuz: ${JSON.stringify(t.results.steuerkreuz)}`);

// Maus 750 ms gedrückt halten: kein Langdruck-Menü (das gibt es nur mit Finger oder Stift, siehe Tablet),
// die Auswahl bleibt; danach mit R um 90° weiter
const [hx, hy] = await toScreen(p3.x, p3.z);
await ed.mouse.move(hx, hy);
await ed.mouse.down();
await ed.waitForTimeout(750);
await ed.mouse.up();
await ed.waitForTimeout(150);
const ctx = await E(() => ({ menu: window.panel.shadowRoot.querySelectorAll(".ed-ctx").length, sel: window.panel._editor.sel }));
t.check(ctx.menu === 0 && ctx.sel?.id === hv, `Maus-Langdruck: ${JSON.stringify(ctx)}`);
await ed.mouse.move(5, 5);
await ed.keyboard.press("r");
const m1 = (await node(hv)).rotation;
t.check(m1 === 180, `R nach dem Halten: ${m1}`);

// Ziehen an die Nordwand: Rückseite davor, zum Raum gedreht, ein Schritt
const u2 = await undoLen();
await dragPlan([p3.x, p3.z], [9.0, 0.2], 14);
await ed.mouse.up();
await ed.waitForTimeout(150);
const pulled = await node(hv);
const u3 = await undoLen();
t.results.ziehen = { n: pulled, undo: u3 - u2 };
t.check(near(pulled.x, 9, 0.05) && pulled.z === 0.06 && pulled.rotation === 0 && u3 - u2 === 1, `Ziehen an die Wand: ${JSON.stringify(t.results.ziehen)}`);

// Ecke: bleibt mit halber Breite aus der Ecke heraus (Gehäuse ragt nicht in die Nachbarwand)
await tool("node");
await click(7.15, 0.15);
const corner = await E(() => structuredClone(window.panel._editor.floor.nodes.at(-1)));
t.results.ecke = corner;
t.check(corner.x >= 7.35 && corner.z === 0.06 && corner.rotation === 0, `Ecke: ${JSON.stringify(corner)}`);

// alter Knoten ohne gespeicherte Drehung an der Westwand: im Plan zur Wand gedreht, die Daten bleiben
await E(() => {
  const e = window.panel._editor;
  e.change((fl) => {
    fl.nodes = [...(fl.nodes ?? []), { id: "vt_alt", kind: "uv", x: 0.06, z: 2.5, y: null, name: null, entity: null, link: null }];
  });
});
await ed.waitForTimeout(100);
const alt = await E(() => {
  const e = window.panel._editor;
  return { rotation: e.floor.nodes.find((x) => x.id === "vt_alt").rotation, transform: e.svg.querySelector('g[data-kind="pnode"][data-id="vt_alt"] g[transform]')?.getAttribute("transform") };
});
t.results.alt = alt;
t.check(alt.rotation === undefined && /rotate\(270\)/.test(alt.transform ?? ""), `Alter Knoten: ${JSON.stringify(alt)}`);

// ---------------------------------------------------------------- B Leitungen an der Decke
await zoomTo(-1, -1, 12, 9);
await tool("pipe");
const level = () => E(() => {
  const e = window.panel._editor;
  const P = e.props;
  return {
    sel: P.querySelector("[data-pheight] .sel")?.dataset.lv ?? null,
    decke: P.querySelector('[data-pheight] [data-lv="decke"]')?.dataset.h,
    std: [...P.querySelectorAll("p.muted")].map((p) => p.textContent).find((x) => x.startsWith("Standard für")) ?? null,
    pick: e.pipeOpts?.pick ?? null,
    heights: e.draft?.heights ? [...e.draft.heights] : null,
  };
});
const l0 = await level();
t.results.standard = l0;
t.check(l0.sel === "decke" && l0.decke === "2.45" && l0.std === "Standard für Strom: Decke (2,45 m, 15 cm unter der Decke). Jede neue Leitung beginnt auf dieser Höhe.", `Standard Strom: ${JSON.stringify(l0)}`);
await ed.locator('haus3d-panel .ed-props [data-ptype] [data-k="wasser_kalt"]').click();
const lw = await level();
t.check(lw.sel === "boden" && /^Standard für Wasser kalt: Boden \(0,03 m\)/.test(lw.std ?? ""), `Standard Wasser: ${JSON.stringify(lw)}`);
await ed.locator('haus3d-panel .ed-props [data-ptype] [data-k="strom"]').click();

// Leitung im Wohnzimmer: zwei Punkte an der Decke, dann Steckdose an derselben Stelle = Steigleitung
await click(1.5, 2.5);
await click(4.5, 2.5);
const d1 = await level();
t.check(JSON.stringify(d1.heights) === "[2.45,2.45]", `Höhen an der Decke: ${JSON.stringify(d1.heights)}`);
await ed.locator('haus3d-panel .ed-props [data-pheight] [data-lv="steckdose"]').click();
await click(4.5, 2.5);
const d2 = await level();
t.check(JSON.stringify(d2.heights) === "[2.45,2.45,0.3]" && d2.sel === "steckdose", `Steckdose als Steigleitung: ${JSON.stringify(d2)}`);
// Mediumwechsel: Standard-Punkte folgen dem Medium, die Wahl bleibt
await ed.locator('haus3d-panel .ed-props [data-ptype] [data-k="wasser_kalt"]').click();
const d3 = await level();
await ed.locator('haus3d-panel .ed-props [data-ptype] [data-k="strom"]').click();
const d4 = await level();
t.results.mediumwechsel = { d3, d4 };
t.check(d3.pick === "steckdose" && d3.sel === "steckdose" && JSON.stringify(d3.heights) === "[0.03,0.03,0.3]" && JSON.stringify(d4.heights) === "[2.45,2.45,0.3]", `Mediumwechsel: ${JSON.stringify(t.results.mediumwechsel)}`);
// eigene Höhe 0,6 m; zweites Antippen mit gleicher Wahl beendet, danach gilt wieder der Standard
const phn = ed.locator("haus3d-panel .ed-props [data-phn]");
await phn.fill("0.6");
await phn.dispatchEvent("change");
const d5 = await level();
await click(4.5, 1.0);
await click(4.5, 1.0);
const fin = await E(() => {
  const e = window.panel._editor;
  return { draft: e.draft, pick: e.pipeOpts.pick, sel: e.sel, pipe: structuredClone(e.floor.pipes.at(-1)) };
});
t.results.abschluss = { d5, fin };
t.check(d5.pick === 0.6 && d5.sel === null, `Eigene Höhe: ${JSON.stringify(d5)}`);
t.check(!fin.draft && fin.pick === null && fin.sel?.kind === "pipe" && JSON.stringify(fin.pipe.heights) === "[2.45,2.45,0.3,0.6]" && fin.pipe.height === 0.6 && fin.pipe.points.length === 4, `Abschluss: ${JSON.stringify(fin)}`);
const pipe1 = fin.pipe.id;

// Alle-Punkte-Felder: Stufe, eigene Höhe (begrenzt auf die lichte Höhe), ungültige Eingabe ändert nichts
const heights = () => E((id) => window.panel._editor.floor.pipes.find((x) => x.id === id).heights, pipe1);
await ed.locator('haus3d-panel .ed-props [data-allh] [data-lv="boden"]').click();
const a1 = await heights();
const allhn = ed.locator("haus3d-panel .ed-props [data-allhn]");
await allhn.fill("1.2");
await allhn.dispatchEvent("change");
const a2 = await heights();
await allhn.fill("99");
await allhn.dispatchEvent("change");
const a3 = await heights();
const u4 = await undoLen();
await E(() => {
  const i = window.panel._editor.props.querySelector("[data-allhn]");
  i.value = "";
  i.dispatchEvent(new Event("change"));
});
const a4 = await heights();
const u5 = await undoLen();
t.results.allePunkte = { a1, a2, a3, a4, undo: u5 - u4 };
t.check(a1.every((h) => h === 0.03) && a2.every((h) => h === 1.2) && a3.every((h) => h === 2.6) && JSON.stringify(a4) === JSON.stringify(a3) && u5 === u4, `Alle Punkte: ${JSON.stringify(t.results.allePunkte)}`);
// Punkt antippen: Stufe dieses Punkts, ungültige eigene Höhe ändert nichts
const [qx, qz] = fin.pipe.points[0];
await click(qx, qz);
const ptbox = await E(() => window.panel._editor.props.querySelector(".ptbox b")?.textContent);
await ed.locator('haus3d-panel .ed-props [data-pth] [data-lv="decke"]').click();
const a5 = await heights();
const u6 = await undoLen();
await E(() => {
  const i = window.panel._editor.props.querySelector("[data-pthn]");
  i.value = "";
  i.dispatchEvent(new Event("change"));
});
const a6 = await heights();
t.results.punkt = { ptbox, a5, a6 };
t.check(ptbox === "Punkt 1 von 4" && a5[0] === 2.45 && a5[1] === 2.6 && JSON.stringify(a6) === JSON.stringify(a5) && (await undoLen()) === u6, `Punkt-Höhe: ${JSON.stringify(t.results.punkt)}`);

// Keller: Decke unter dem EG (lichte Höhe 2,4 m → 2,25 m)
await ed.locator("haus3d-panel .floorsel").selectOption("kg");
await ed.waitForTimeout(200);
await tool("pipe");
const kg = await level();
t.results.keller = kg;
t.check(kg.sel === "decke" && kg.decke === "2.25" && /\(2,25 m, 15 cm unter der Decke\)/.test(kg.std ?? ""), `Decke im KG: ${JSON.stringify(kg)}`);
await E(() => window.panel._editor._draftAction?.("done"));
await ed.locator("haus3d-panel .floorsel").selectOption("eg");
await ed.waitForTimeout(200);

// 3D: Leitung ab einem Verteiler an der Wand beginnt senkrecht an dessen Oberkante (1,8 m) und steigt zur Decke
await view("split");
await zoomTo(6, -1, 12, 5);
await tool("node");
await ed.locator('haus3d-panel .ed-props [data-nk="hv"]').click();
await click(10.9, 2.0);
const hv2 = await E(() => structuredClone(window.panel._editor.floor.nodes.at(-1)));
await tool("pipe");
await click(hv2.x + 0.02, hv2.z + 0.02);
await click(10.9, 3.44);
await E(() => window.panel._editor._draftAction("done"));
await ed.waitForTimeout(150);
const pipe2 = await E(() => structuredClone(window.panel._editor.floor.pipes.at(-1)));
t.check(pipe2.points[0][0] === hv2.x && pipe2.points[0][1] === hv2.z && JSON.stringify(pipe2.heights) === "[2.45,2.45]", `Leitung ab Verteiler: ${JSON.stringify({ hv2, pipe2 })}`);
await ed.waitForTimeout(1200);
const conn = await E((id) => {
  const p = window.panel._editor.scene3d._pipes.get(id);
  return p ? { y: p.path.slice(0, 3).map((v) => Math.round(v.y * 1000) / 1000), len: Math.round(p.len * 1000) / 1000, x0: p.path[0].x, z0: p.path[0].z } : null;
}, pipe2.id);
t.results.anschluss3d = conn;
t.check(conn && near(conn.y[0], 1.8) && near(conn.y[1], 2.45) && near(conn.len, 2.09, 0.02), `3D-Anschluss: ${JSON.stringify(conn)}`);
await E((id) => {
  const e = window.panel._editor;
  e.sel = { kind: "pnode", id };
  e.render();
  e.renderProps();
  e._sync3d(true);
  const sc = e.scene3d;
  sc.controls.target.set(10.7, 1.3, 2.6);
  sc.camera.position.set(7.6, 3.6, 1.0);
  sc.controls.update();
  sc.invalidate?.();
}, hv2.id);
await ed.waitForTimeout(1500);
await t.shot(ed, "verteiler-3d.png");

// ---------------------------------------------------------------- C Tablet
const tb = await t.page("verteiler-tablet", "?power", { width: 1024, height: 768, touch: true });
const T = (fn, arg) => tb.evaluate(fn, arg);
await T(() => window.panel._openEditor());
await tb.waitForTimeout(500);
await tb.locator("haus3d-panel .floorsel").selectOption("eg");
await tb.waitForTimeout(300);
const tScreen = (x, z) => T(([x, z]) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  return [r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale];
}, [x, z]);
const tTool = async (k) => {
  if (await tb.locator("haus3d-panel .ed-bar.compact").count()) await tb.locator('haus3d-panel .ed-bar [data-menu="tools"]').tap();
  await tb.locator(`haus3d-panel .ed-bar button[data-tool=${k}]`).tap();
};
await tTool("node");
await tb.locator('haus3d-panel .ed-props [data-nk="hv"]').tap();
const [wx, wy] = await tScreen(0.15, 2.5);
await tb.touchscreen.tap(wx, wy);
await tb.waitForTimeout(150);
const tn = await T(() => structuredClone(window.panel._editor.floor.nodes.at(-1)));
t.results.tabletSetzen = tn;
t.check(tn.kind === "hv" && tn.rotation === 270 && tn.x === 0.06 && tn.z === 2.5, `Tablet: Setzen an der Westwand: ${JSON.stringify(tn)}`);
// Langdruck auf den Verteiler: Menü mit Drehen und An die Wand
const [nx, ny] = await tScreen(tn.x, tn.z);
const cdp = await tb.context().newCDPSession(tb);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: nx, y: ny }] });
await tb.waitForTimeout(750);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await tb.waitForTimeout(200);
const tctx = await T(() => [...window.panel.shadowRoot.querySelectorAll(".ed-ctx button")].map((b) => b.textContent));
t.check(tctx.includes("Drehen 90°") && tctx.includes("An die Wand stellen"), `Tablet: Langdruck-Menü: ${JSON.stringify(tctx)}`);
if (tctx.includes("Drehen 90°")) await tb.locator("haus3d-panel .ed-ctx [data-c=rot]").tap();
const tr = (await T((id) => window.panel._editor.floor.nodes.find((x) => x.id === id).rotation, tn.id));
t.check(tr === 0, `Tablet: Drehen 90° im Menü: ${tr}`);
await t.shot(tb, "verteiler-tablet.png");
// Wandknopf am Steuerkreuz: zurück zur Wand gedreht
await tb.locator("haus3d-panel .ed-props .pad [data-act=wall]").tap();
const tw = await T((id) => structuredClone(window.panel._editor.floor.nodes.find((x) => x.id === id)), tn.id);
t.check(tw.rotation === 270 && tw.x === 0.06 && tw.z === 2.5, `Tablet: Wandknopf: ${JSON.stringify(tw)}`);
// Möbel an die Wand stellen: Fernsehboard bündig an der Nordwand, die Etage bleibt erhalten
const before = await T(() => ({ n: window.panel._editor.floor.furniture.length, rooms: window.panel._editor.floor.rooms.length }));
await T(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_tv" };
  e.render();
  e.renderProps();
});
await tb.locator("haus3d-panel .ed-props .pad [data-act=wall]").tap();
const tv = await T(() => {
  const e = window.panel._editor;
  const m = e.floor.furniture.find((x) => x.id === "m_tv");
  return { m: m && { x: m.x, z: m.z, rotation: m.rotation }, floor: e.floor?.id, n: e.floor.furniture.length, rooms: e.floor.rooms.length };
});
t.results.moebelWand = tv;
t.check(tv.floor === "eg" && tv.n === before.n && tv.rooms === before.rooms && tv.m?.x === 3.5 && near(tv.m?.z, 0.21, 0.011) && tv.m?.rotation === 0, `Möbel an die Wand: ${JSON.stringify(tv)}`);
await t.done();
