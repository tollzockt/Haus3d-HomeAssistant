// Editor-3D: Strg bzw. „Nur Ansicht“ = nur Kamera, Achsen-Pfeile (rot X, grün Höhe, blau Z) in gleichbleibender
// Größe, Pfeil-Züge im Raster mit Live-Vorschau ohne Neuaufbau und einem Rückgängig-Schritt, Umschalt = frei,
// Esc bricht ab, Kürzel während des Zugs gesperrt; Verteiler: Klick-Reihenfolge, Höhe, Pfeiltasten, Ziehen über
// den Boden an die Wand, Verdeckung, Durchführung ohne Höhe, gedrehter Verteiler behält beim Zug die Drehung;
// Mehrfachauswahl und Dach-Ebene ohne Pfeile; „An die Wand stellen“ behält die Etage; am Tablet Knopf „Nur Ansicht“.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const onGrid = (v, g) => Number.isFinite(v) && Math.abs(v / g - Math.round(v / g)) < 1e-6;

/** Seite mit Editor in der 3D-Ansicht (EG), Zähler für Neuaufbauten der Szene. */
async function open3d(name, opts) {
  const pg = await t.page(name, "?power", opts);
  const E = (fn, arg) => pg.evaluate(fn, arg);
  await E(() => window.panel._openEditor());
  await pg.waitForTimeout(500);
  await pg.locator("haus3d-panel .floorsel").selectOption("eg");
  await pg.waitForTimeout(200);
  await pg.locator('haus3d-panel .ed-bar [data-view="3d"]').click();
  await pg.waitForFunction(() => !!window.panel._editor.scene3d && window.panel._editor._3dShown, null, { timeout: 30000 });
  await pg.waitForTimeout(1500);
  await E(() => {
    const e = window.panel._editor;
    e.__builds = 0;
    const sb = e.scene3d.setBuilding.bind(e.scene3d);
    e.scene3d.setBuilding = (...a) => {
      e.__builds++;
      return sb(...a);
    };
  });
  return { pg, E };
}

// ---------------------------------------------------------------- Desktop
const { pg, E } = await open3d("pfeile3d", { width: 1280, height: 800 });
// Verteiler an der Ostwand der Küche (zum Raum gedreht), Durchführung, Stromleitung
await E(() => {
  const e = window.panel._editor;
  e.change((fl) => {
    fl.nodes = [
      { id: "vt_hv", kind: "hv", x: 10.94, z: 2, y: null, name: null, entity: null, link: null, rotation: 90 },
      { id: "vt_durch", kind: "durch", x: 9.6, z: 3.6, y: null, name: null, entity: null, link: null },
    ];
    fl.pipes = [{ id: "leitung_test", type: "strom", points: [[7.5, 1.2], [7.5, 3.2]], heights: [2.45, 2.45], height: 2.45, entity: null, room: null }];
  });
  e.sel = null;
  e.renderProps();
  e._sync3d(true);
  e.__builds = 0;
});
await pg.waitForTimeout(800);

/** Weltpunkt → Bildschirm (client). */
const proj = (p) => E((p) => {
  const sc = window.panel._editor.scene3d;
  const v = new sc.camera.position.constructor(...p).project(sc.camera);
  const r = sc.renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
}, p);
/** Mitte (Anker der Pfeile) einer Auswahl in Weltkoordinaten. */
const anchorOf = (sel) => E(async (sel) => {
  const { arrowAnchor } = await import("/custom_components/haus3d/frontend/arrows3d.js");
  const e = window.panel._editor;
  const a = arrowAnchor(e.floor, sel);
  return a && [a.x, (e.floor.elevation ?? 0) + a.y, a.z];
}, sel);
const state = (id = "m_sofa") => E((id) => {
  const e = window.panel._editor;
  const m = e.floor.furniture.find((x) => x.id === id) ?? e.floor.nodes?.find((x) => x.id === id);
  return { m: m ? structuredClone(m) : null, sel: e.sel, undo: e.undoStack.length, redo: e.redoStack.length, builds: e.__builds, live: !!e._live3d, drag: !!e._axisDrag, toast: e.hint.textContent };
}, id);
const arrows = () => E(() => {
  const a = window.panel._editor._arrows;
  return a ? { vis: a.group.visible, axes: a.axes, x: a.screenPoint("x", 0.6), y: a.screenPoint("y", 0.6), z: a.screenPoint("z", 0.6), x0: a.screenPoint("x", 0), x1: a.screenPoint("x", 1), y0: a.screenPoint("y", 0), y1: a.screenPoint("y", 1), z0: a.screenPoint("z", 0), z1: a.screenPoint("z", 1), lenPx: a.lenPx, dim: a._dim } : null;
});
const camera = () => E(() => {
  const sc = window.panel._editor.scene3d;
  return { p: sc.camera.position.toArray(), t: sc.controls.target.toArray() };
});
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Pfeil anfassen und entlang seiner Bildschirmrichtung (sign = ±1) in Schritten ziehen; ohne Loslassen. */
async function pull(axis, sign = 1, steps = 8, px = 9, { during = null } = {}) {
  const a = await arrows();
  const p = a[axis];
  const p0 = a[`${axis}0`];
  const p1 = a[`${axis}1`];
  const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  const dir = [((p1[0] - p0[0]) / l) * sign, ((p1[1] - p0[1]) / l) * sign];
  await pg.mouse.move(p[0], p[1]);
  await pg.waitForTimeout(60);
  await pg.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await pg.mouse.move(p[0] + dir[0] * px * i, p[1] + dir[1] * px * i);
    await pg.waitForTimeout(40);
    if (during) await during(i);
  }
}
const release = async () => {
  await pg.mouse.up();
  await pg.waitForTimeout(700);
};

// ---- A Strg = nur Ansicht: nichts wählen, links dreht, Strg+rechts schiebt, Strg+Rad ohne Faktor 10
const sofaC = await anchorOf({ kind: "furniture", id: "m_sofa" });
const sofaS = await proj(sofaC);
const pickSofa = await E(([x, y]) => window.panel._editor._pick3d(x, y), sofaS);
t.check(pickSofa?.furniture === "m_sofa", `Sofa unter dem Zeiger: ${JSON.stringify(pickSofa)}`);
await pg.mouse.move(sofaS[0], sofaS[1]);
await pg.keyboard.down("Control");
await pg.waitForTimeout(80);
const view = await E(() => {
  const e = window.panel._editor;
  return { cls: e.box3d.classList.contains("view"), hint: e.root.querySelector(".ed-3d-hint")?.textContent };
});
t.check(view.cls && view.hint === "Nur Ansicht: Ziehen dreht · rechte Maustaste schiebt · Rad zoomt", `Strg: Ansicht und Hinweis: ${JSON.stringify(view)}`);
await pg.mouse.click(sofaS[0], sofaS[1]);
await pg.waitForTimeout(150);
const c0 = await camera();
// Strg + links ziehen: dreht (Ziel bleibt), nichts wird verschoben
await pg.mouse.move(sofaS[0], sofaS[1]);
await pg.mouse.down();
for (let i = 1; i <= 6; i++) {
  await pg.mouse.move(sofaS[0] + i * 15, sofaS[1]);
  await pg.waitForTimeout(40);
}
await pg.mouse.up();
await pg.waitForTimeout(600);
const c1 = await camera();
// Strg + rechts ziehen: schiebt (Ziel wandert)
await pg.mouse.down({ button: "right" });
for (let i = 1; i <= 6; i++) {
  await pg.mouse.move(sofaS[0] + 90 - i * 15, sofaS[1] + i * 6);
  await pg.waitForTimeout(40);
}
await pg.mouse.up({ button: "right" });
await pg.waitForTimeout(600);
const c2 = await camera();
const sA = await state();
t.results.nurAnsicht = { sel: sA.sel, rotate: [dist3(c0.p, c1.p), dist3(c0.t, c1.t)], pan: dist3(c1.t, c2.t), undo: sA.undo };
t.check(!sA.sel && sA.undo === 1 && sA.m.x === 3.5 && sA.m.z === 4.3, `Strg: nichts gewählt oder verschoben: ${JSON.stringify(sA)}`);
t.check(dist3(c0.p, c1.p) > 0.3 && dist3(c0.t, c1.t) < 0.05, `Strg + links dreht: ${JSON.stringify({ c0, c1 })}`);
t.check(dist3(c1.t, c2.t) > 0.2, `Strg + rechts schiebt: ${JSON.stringify({ c1, c2 })}`);
// Rad: mit Strg gleich stark wie ohne (kein Faktor 10 wie bei einer Zwei-Finger-Geste)
const span = (c) => dist3(c.p, c.t);
await pg.keyboard.up("Control");
const w0 = span(await camera());
await pg.mouse.wheel(0, 100);
await pg.waitForTimeout(700);
const w1 = span(await camera());
await pg.keyboard.down("Control");
await pg.mouse.wheel(0, 100);
await pg.waitForTimeout(700);
await pg.keyboard.up("Control");
const w2 = span(await camera());
const k1 = Math.log(w1 / w0);
const k2 = Math.log(w2 / w1);
t.results.rad = { w0, w1, w2, k1, k2 };
t.check(k1 > 0.005 && k2 > 0.005 && k2 < k1 * 3, `Strg+Rad: ${JSON.stringify(t.results.rad)}`);
const viewOff = await E(() => window.panel._editor.box3d.classList.contains("view"));
t.check(!viewOff, "Strg losgelassen: Ansicht bleibt an");
// Kamera schräg von oben ins Wohnzimmer (von der Fernsehseite auf das Sofa)
await E(() => {
  const sc = window.panel._editor.scene3d;
  sc.controls.target.set(3.5, 0.3, 3.9);
  sc.camera.position.set(6.6, 4.6, 0.6);
  sc.controls.update();
  sc.invalidate?.();
});
await pg.waitForTimeout(500);

// ---- B Pfeile am Sofa: sichtbar, gleichbleibende Größe beim Zoomen
const sofaS2 = await proj(sofaC);
await pg.mouse.click(sofaS2[0], sofaS2[1]);
await pg.waitForTimeout(400);
const sB = await state();
const aB = await arrows();
t.results.pfeile = { sel: sB.sel, arrows: aB };
t.check(sB.sel?.kind === "furniture" && sB.sel.id === "m_sofa" && aB?.vis && aB.axes === "xyz" && aB.x && aB.y && aB.z && aB.lenPx === 80, `Pfeile am Sofa: ${JSON.stringify(t.results.pfeile)}`);
await t.shot(pg, "o3d-pfeile.png");
const lenY = (a) => Math.hypot(a.y1[0] - a.y0[0], a.y1[1] - a.y0[1]);
const L1 = lenY(aB);
await E(() => {
  const sc = window.panel._editor.scene3d;
  sc.camera.position.lerp(sc.controls.target, 0.4);
  sc.controls.update();
  sc.invalidate?.();
});
await pg.waitForTimeout(500);
const L2 = lenY(await arrows());
t.results.groesse = { L1, L2 };
t.check(L1 > 30 && Math.abs(L2 / L1 - 1) <= 0.12, `Pfeile gleich groß: ${JSON.stringify(t.results.groesse)}`);

// ---- C X-Zug: Live-Vorschau ohne Neuaufbau, danach genau einer; Raster, kein mount_y, ein Rückgängig-Schritt
await E(() => (window.panel._editor.__builds = 0));
const sC0 = await state();
let mid = null;
await pull("x", 1, 8, 9, {
  during: async (i) => {
    if (i === 8) {
      mid = await E(() => {
        const e = window.panel._editor;
        const m = e.floor.furniture.find((x) => x.id === "m_sofa");
        const L = e._live3d;
        return { x: m.x, builds: e.__builds, live: !!L, dx: L?.obj ? L.obj.position.x - L.p0.x : null, undo: e.undoStack.length, toast: e.hint.textContent };
      });
    }
  },
});
await release();
const sC1 = await state();
t.results.xZug = { mid, after: sC1 };
t.check(mid && mid.live && mid.builds === 0 && mid.x > sC0.m.x && near(mid.dx, mid.x - sC0.m.x, 0.002) && /^X: \d+,\d\d m$/.test(mid.toast), `X-Zug während: ${JSON.stringify(mid)}`);
t.check(sC1.builds === 1 && !sC1.live && onGrid(sC1.m.x, 0.05) && sC1.m.mount_y === undefined && sC1.undo === sC0.undo + 1 && sC1.m.z === sC0.m.z, `X-Zug danach: ${JSON.stringify({ before: sC0, after: sC1 })}`);

// ---- D Höhen-Zug: mount_y im 5-cm-Raster, ein Schritt
const sD0 = sC1;
await pull("y", 1, 6, 9);
await release();
const sD1 = await state();
t.results.yZug = sD1.m;
t.check(sD1.m.mount_y > 0 && onGrid(sD1.m.mount_y, 0.05) && sD1.m.x === sD0.m.x && sD1.undo === sD0.undo + 1, `Höhen-Zug: ${JSON.stringify({ before: sD0.m, after: sD1.m })}`);

// ---- E Umschalt = frei: Z in 1-cm-Schritten (nicht im Raster)
const sE0 = sD1;
const zs = [];
await pg.keyboard.down("Shift");
await pull("z", 1, 10, 3, {
  during: async () => {
    zs.push((await state()).m.z);
  },
});
await release();
await pg.keyboard.up("Shift");
const sE1 = await state();
const dzs = zs.map((z) => Math.round((z - sE0.m.z) * 1000) / 1000);
t.results.frei = dzs;
t.check(dzs.some((d) => d !== 0 && !onGrid(d, 0.05)) && dzs.every((d) => onGrid(d, 0.01)) && sE1.undo === sE0.undo + 1, `Umschalt frei: ${JSON.stringify(dzs)}`);

// ---- F Esc bricht ab: Höhe wie vorher, kein Wiederholen-Schritt, Auswahl bleibt
const sF0 = await state();
let fMid = null;
await pull("y", 1, 6, 9, {
  during: async (i) => {
    if (i === 6) fMid = await state();
  },
});
await pg.keyboard.press("Escape");
await pg.waitForTimeout(150);
const sF1 = await state();
await release();
const sF2 = await state();
t.results.esc = { fMid: fMid?.m.mount_y, after: sF2.m.mount_y };
t.check(fMid && fMid.m.mount_y !== sF0.m.mount_y && !sF1.drag, `Esc: Zug lief: ${JSON.stringify({ fMid, sF1 })}`);
t.check(sF2.m.mount_y === sF0.m.mount_y && sF2.undo === sF0.undo && sF2.redo === sF0.redo && sF2.sel?.id === "m_sofa", `Esc: zurück ohne Wiederholen: ${JSON.stringify({ before: sF0, after: sF2 })}`);

// ---- K Strg+Z und Entf während des Zugs: geschluckt
const sK0 = await state();
await pull("x", -1, 6, 9);
const kMid = await state();
await pg.keyboard.press("Delete");
await pg.keyboard.press("Control+z");
await pg.waitForTimeout(150);
const kKeys = await state();
await release();
const sK1 = await state();
t.results.kuerzel = { mid: kMid.m.x, keys: kKeys.m?.x, after: sK1.m?.x };
t.check(kMid.m.x < sK0.m.x && kKeys.m?.x === kMid.m.x && kKeys.sel?.id === "m_sofa" && sK1.m?.x === kMid.m.x && sK1.undo === sK0.undo + 1, `Kürzel während des Zugs: ${JSON.stringify({ sK0, kMid, kKeys, sK1 })}`);

// ---- G Verteiler: Klick-Reihenfolge, gedreht ziehen (K12), Höhe, Pfeiltasten, Bodenzug, Verdeckung, Durchführung
await E(() => {
  const sc = window.panel._editor.scene3d;
  sc.controls.target.set(9.6, 0.8, 2.2);
  sc.camera.position.set(7.2, 5.4, 7.4);
  sc.controls.update();
  sc.invalidate?.();
});
await pg.waitForTimeout(500);
const hvC = await anchorOf({ kind: "pnode", id: "vt_hv" });
const hvS = await proj(hvC);
await pg.mouse.click(hvS[0], hvS[1]);
await pg.waitForTimeout(300);
const g1 = await state("vt_hv");
const g1a = await arrows();
const tableS = await proj(await anchorOf({ kind: "furniture", id: "m_table" }));
await pg.mouse.click(tableS[0], tableS[1]);
await pg.waitForTimeout(300);
const g2 = await state("vt_hv");
const floorS = await proj([8.2, 0, 3.2]);
await pg.mouse.click(floorS[0], floorS[1]);
await pg.waitForTimeout(300);
const g3 = await state("vt_hv");
t.results.klick = { hv: g1.sel, table: g2.sel, floor: g3.sel };
t.check(g1.sel?.kind === "pnode" && g1.sel.id === "vt_hv" && g1a?.vis && g1a.axes === "xyz", `Klick auf den Verteiler: ${JSON.stringify({ sel: g1.sel, a: g1a })}`);
t.check(g2.sel?.kind === "furniture" && g2.sel.id === "m_table", `Klick auf den Tisch: ${JSON.stringify(g2.sel)}`);
t.check(g3.sel?.kind === "room" && g3.sel.id === "kueche", `Klick auf den Boden: ${JSON.stringify(g3.sel)}`);
await pg.mouse.click(hvS[0], hvS[1]);
await pg.waitForTimeout(300);
// K12: gedrehter Verteiler an der Wand, X-Zug → das Live-Objekt behält die Drehung (−90°)
await E(() => (window.panel._editor.__builds = 0));
const gx0 = await state("vt_hv");
let k12 = null;
await pull("x", -1, 6, 9, {
  during: async (i) => {
    if (i === 6) k12 = await E(() => {
      const e = window.panel._editor;
      const L = e._live3d;
      return { ry: L?.obj?.rotation.y, dx: L?.obj ? L.obj.position.x - L.p0.x : null, x: e.floor.nodes.find((n) => n.id === "vt_hv").x, builds: e.__builds };
    });
  },
});
await release();
const gx1 = await state("vt_hv");
t.results.k12 = { k12, after: gx1.m };
t.check(k12 && near(k12.ry, -Math.PI / 2) && k12.x < gx0.m.x && near(k12.dx, k12.x - gx0.m.x, 0.002) && k12.builds === 0, `K12 Drehung beim Zug: ${JSON.stringify(k12)}`);
t.check(gx1.m.rotation === 90 && gx1.m.x < gx0.m.x && gx1.undo === gx0.undo + 1 && gx1.builds === 1, `K12 danach: ${JSON.stringify({ before: gx0, after: gx1 })}`);
// Höhe: node.y im 5-cm-Raster, höchstens Raumhöhe 2,6 minus Gehäuse 0,9 (unter der Decke)
await pull("y", 1, 5, 9);
await release();
const gy = await state("vt_hv");
t.results.hoehe = gy.m.y;
t.check(gy.m.y > 0.9 && gy.m.y <= 1.7 && onGrid(gy.m.y, 0.05) && gy.undo === gx1.undo + 1, `Verteiler-Höhe: ${JSON.stringify(gy.m)}`);
// Pfeiltaste schiebt den Verteiler
await pg.keyboard.press("ArrowLeft");
await pg.waitForTimeout(150);
const gk = await state("vt_hv");
t.check(near(gk.m.x, gy.m.x - 0.05) && gk.undo === gy.undo + 1, `Pfeiltaste am Verteiler: ${JSON.stringify({ before: gy.m, after: gk.m })}`);
await pg.waitForTimeout(800);
// über den Boden an die Nordwand ziehen: rastet ein und dreht sich zum Raum (Vorschau dreht mit)
// erst den Hinweis der Höhe ablaufen lassen (bleibt 4 s stehen): danach wechselt die Hinweiszeile zurück, die
// 3D-Fläche ändert ihre Höhe, und vorab berechnete Bildpunkte stimmen sonst mitten im Zug nicht mehr
await pg.waitForFunction(() => !(Date.now() < window.panel._editor._toastUntil), null, { timeout: 6000 });
await pg.waitForTimeout(400);
await E(() => (window.panel._editor.__builds = 0));
// Griffpunkt auf dem Gehäuse neben den Pfeilen (die Pfeile liegen über der Mitte und gehen vor)
const grab = await E(() => {
  const e = window.panel._editor;
  const sc = e.scene3d;
  const obj = sc._pipeNodes.get("vt_hv").obj;
  const box = obj.children[0];
  const V = sc.camera.position.constructor;
  const r = sc.renderer.domElement.getBoundingClientRect();
  for (const [fx, fy] of [[0.3, -0.3], [-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0, -0.4], [0.4, 0]]) {
    const p = box.localToWorld(new V(fx * box.geometry.parameters.width, fy * box.geometry.parameters.height, box.geometry.parameters.depth / 2)).project(sc.camera);
    const x = r.left + (p.x * 0.5 + 0.5) * r.width;
    const y = r.top + (-p.y * 0.5 + 0.5) * r.height;
    if (!e._arrows.hit(x, y) && e._pick3d(x, y)?.pnode === "vt_hv") return [x, y];
  }
  return null;
});
t.check(!!grab, "Kein Griffpunkt am Verteiler neben den Pfeilen");
const off = await E(([x, y, base]) => {
  const e = window.panel._editor;
  const n = e.floor.nodes.find((q) => q.id === "vt_hv");
  const p = e.scene3d.planPoint(x, y, (e.floor.elevation ?? 0) + base);
  return p ? [p[0] - n.x, p[1] - n.z, base] : null;
}, [grab[0], grab[1], gk.m.y]);
const dest = await proj([9.4 + off[0], off[2], 0.25 + off[1]]);
await pg.mouse.move(grab[0], grab[1]);
await pg.mouse.down();
for (let i = 1; i <= 12; i++) {
  await pg.mouse.move(grab[0] + ((dest[0] - grab[0]) * i) / 12, grab[1] + ((dest[1] - grab[1]) * i) / 12);
  await pg.waitForTimeout(40);
}
const gFloor = await E(() => {
  const e = window.panel._editor;
  const L = e._live3d;
  return { ry: L?.obj?.rotation.y, builds: e.__builds, live: !!L };
});
await release();
const gf = await state("vt_hv");
t.results.bodenzug = { during: gFloor, after: gf.m };
t.check(near(gf.m.x, 9.4, 0.06) && gf.m.z === 0.06 && gf.m.rotation === 0 && gf.undo === gk.undo + 1, `Bodenzug an die Wand: ${JSON.stringify(gf.m)}`);
t.check(gFloor.live && gFloor.builds === 0 && near(gFloor.ry, 0) && gf.builds === 1, `Bodenzug: Vorschau ohne Neuaufbau: ${JSON.stringify(t.results.bodenzug)}`);
await t.shot(pg, "o3d-verteiler.png");
// Verdeckung: ein Schrank zwischen Kamera und Verteiler gewinnt
const hide = await E(() => {
  const e = window.panel._editor;
  const n = e.floor.nodes.find((q) => q.id === "vt_hv");
  const c = e.scene3d.camera.position;
  const dx = c.x - n.x;
  const dz = c.z - n.z;
  const l = Math.hypot(dx, dz);
  const m = { id: "m_verdeckt", type: "wardrobe", x: Math.round((n.x + (dx / l) * 1.2) * 100) / 100, z: Math.round((n.z + (dz / l) * 1.2) * 100) / 100, rotation: 0, h: 2.4 };
  e.change((fl) => {
    fl.furniture = [...fl.furniture, m];
  });
  e._sync3d(true);
  return m;
});
await pg.waitForTimeout(600);
const hvS3 = await proj(await anchorOf({ kind: "pnode", id: "vt_hv" }));
const covered = await E(([x, y]) => window.panel._editor._pick3d(x, y), hvS3);
t.results.verdeckt = { hide, covered };
t.check(covered?.furniture === "m_verdeckt", `Verdeckter Verteiler: ${JSON.stringify(t.results.verdeckt)}`);
await E(() => {
  const e = window.panel._editor;
  e.undo();
  e.sel = { kind: "pnode", id: "vt_durch" };
  e.renderProps();
});
await pg.waitForTimeout(600);
// Durchführung: nur X und Z; knapp neben der dünnen Hülse (Raum dahinter) zählt trotzdem die Durchführung
const gd = await arrows();
t.check(gd?.vis && gd.axes === "xz" && !gd.y && gd.x && gd.z, `Durchführung ohne Höhen-Pfeil: ${JSON.stringify(gd)}`);
const durchS = await proj(await anchorOf({ kind: "pnode", id: "vt_durch" }));
const beside = await E(([x, y]) => window.panel._editor._pick3d(x + 9, y), durchS);
t.results.daneben = beside;
t.check(beside?.pnode === "vt_durch", `Knapp neben der Durchführung: ${JSON.stringify(beside)}`);
// Leitung gewählt: keine Pfeile, Pfeiltaste ohne leeren Rückgängig-Schritt
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "pipe", id: "leitung_test" };
  e.render();
  e.renderProps();
});
const gp0 = await state();
await pg.mouse.move(5, 400);
await pg.keyboard.press("ArrowLeft");
await pg.waitForTimeout(150);
const gp1 = await state();
const gpa = await arrows();
const pipePts = await E(() => window.panel._editor.floor.pipes.find((p) => p.id === "leitung_test").points);
t.check(gp1.undo === gp0.undo && !gpa?.vis && JSON.stringify(pipePts) === "[[7.5,1.2],[7.5,3.2]]", `Leitung + Pfeiltaste: ${JSON.stringify({ gp0: gp0.undo, gp1: gp1.undo, gpa, pipePts })}`);

// ---- H Mehrfachauswahl und Dach-Ebene: keine Pfeile
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_sofa" };
  e.renderProps();
});
const h0 = (await arrows())?.vis;
await E(() => {
  const e = window.panel._editor;
  e.multi = [{ kind: "furniture", id: "m_sofa" }, { kind: "furniture", id: "m_ct" }];
  e.render();
  e.renderProps();
});
const h1 = (await arrows())?.vis;
await E(() => {
  const e = window.panel._editor;
  e.multi = [];
  e.changeBuilding((b) => {
    b.settings.roof = { type: "gable", pitch: 30, overhang: 0.4 };
  });
  e.renderBar();
});
await pg.locator("haus3d-panel .floorsel").selectOption("__roof");
await pg.waitForTimeout(800);
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_sofa" };
  e._mark3d();
});
const h2 = await E(() => {
  const e = window.panel._editor;
  return { roof: e.roofMode, vis: !!e._arrows?.group.visible, hint: e.root.querySelector(".ed-3d-hint")?.textContent };
});
t.results.ausblenden = { h0, h1, h2 };
t.check(h0 && !h1 && h2.roof && !h2.vis && h2.hint === "3D: Ziehen dreht · rechte Maustaste schiebt · Rad zoomt", `Mehrfachauswahl und Dach: ${JSON.stringify(t.results.ausblenden)}`);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await E(() => {
  const e = window.panel._editor;
  e.undo();
  e.renderBar();
});
await pg.waitForTimeout(800);

// ---- J „An die Wand stellen“ ersetzt die Etage nicht mehr
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_tv" };
  e.render();
  e.renderProps();
});
const j0 = await E(() => ({ n: window.panel._editor.floor.furniture.length, rooms: window.panel._editor.floor.rooms.length }));
await pg.locator("haus3d-panel .ed-props .pad [data-act=wall]").click();
await pg.waitForTimeout(300);
const j1 = await E(() => {
  const e = window.panel._editor;
  const m = e.floor?.furniture?.find((x) => x.id === "m_tv");
  return { floor: e.floor?.id, n: e.floor?.furniture?.length, rooms: e.floor?.rooms?.length, m: m && [m.x, m.z, m.rotation], arrows: !!e._arrows?.group.visible };
});
t.results.wand = { j0, j1 };
t.check(j1.floor === "eg" && j1.n === j0.n && j1.rooms === j0.rooms && j1.m?.[0] === 3.5 && j1.arrows, `An die Wand stellen: ${JSON.stringify(t.results.wand)}`);

// ---------------------------------------------------------------- I Tablet: Knopf „Nur Ansicht“
const tab = await open3d("pfeile3d-tablet", { width: 1024, height: 768, touch: true });
const TE = tab.E;
const tp = tab.pg;
const btn = await TE(() => {
  const b = window.panel._editor.root.querySelector(".ed-3d-view");
  return { h: b?.getBoundingClientRect().height, hint: window.panel._editor.root.querySelector(".ed-3d-hint")?.textContent };
});
t.check(btn.h >= 44 && btn.hint === "3D: Antippen wählt · Teil oder Pfeil ziehen verschiebt · leere Fläche dreht · „Nur Ansicht“: nur drehen und zoomen", `Tablet: Knopf und Hinweis: ${JSON.stringify(btn)}`);
// Antippen wählt ein Möbelstück
const tTable = await TE(async () => {
  const { arrowAnchor } = await import("/custom_components/haus3d/frontend/arrows3d.js");
  const e = window.panel._editor;
  const a = arrowAnchor(e.floor, { kind: "furniture", id: "m_table" });
  const sc = e.scene3d;
  const v = new sc.camera.position.constructor(a.x, a.y, a.z).project(sc.camera);
  const r = sc.renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
});
await tp.touchscreen.tap(tTable[0], tTable[1]);
await tp.waitForTimeout(400);
const tSel = await TE(() => ({ sel: window.panel._editor.sel, lenPx: window.panel._editor._arrows?.lenPx, vis: !!window.panel._editor._arrows?.group.visible }));
t.check(tSel.sel?.kind === "furniture" && tSel.sel.id === "m_table" && tSel.lenPx === 110 && tSel.vis, `Tablet: Antippen wählt, Pfeile 110 px: ${JSON.stringify(tSel)}`);
await tp.locator("haus3d-panel .ed-3d-view").tap();
await tp.waitForTimeout(200);
const tOn = await TE(() => {
  const e = window.panel._editor;
  const b = e.root.querySelector(".ed-3d-view");
  return { view: e.mods.view, pressed: b.getAttribute("aria-pressed"), sel: b.classList.contains("sel"), cls: e.box3d.classList.contains("view"), dim: e._arrows?._dim, toast: e.hint.textContent, hint: e.root.querySelector(".ed-3d-hint")?.textContent };
});
t.check(tOn.view && tOn.pressed === "true" && tOn.sel && tOn.cls && tOn.dim && tOn.toast === "Nur Ansicht an: Ziehen dreht die Kamera, nichts wird ausgewählt." && tOn.hint === "Nur Ansicht: ein Finger dreht · zwei Finger schieben und zoomen", `Tablet: Nur Ansicht an: ${JSON.stringify(tOn)}`);
// in der Ansicht wählt Antippen nichts ab und nichts aus
const tSofa = await TE(async () => {
  const { arrowAnchor } = await import("/custom_components/haus3d/frontend/arrows3d.js");
  const e = window.panel._editor;
  const a = arrowAnchor(e.floor, { kind: "furniture", id: "m_sofa" });
  const sc = e.scene3d;
  const v = new sc.camera.position.constructor(a.x, a.y, a.z).project(sc.camera);
  const r = sc.renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
});
await tp.touchscreen.tap(tSofa[0], tSofa[1]);
await tp.waitForTimeout(300);
const tSel2 = await TE(() => window.panel._editor.sel);
t.check(tSel2?.id === "m_table", `Tablet: Nur Ansicht wählt nichts: ${JSON.stringify(tSel2)}`);
await t.shot(tp, "o3d-nur-ansicht.png");
await tp.locator("haus3d-panel .ed-3d-view").tap();
await tp.waitForTimeout(200);
const tOff = await TE(() => ({ view: window.panel._editor.mods.view, toast: window.panel._editor.hint.textContent }));
t.check(!tOff.view && tOff.toast === "Nur Ansicht aus.", `Tablet: Nur Ansicht aus: ${JSON.stringify(tOff)}`);
await t.done();
