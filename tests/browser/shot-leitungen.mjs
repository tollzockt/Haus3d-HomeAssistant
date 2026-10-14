// Leitungen an Geräten: Ende rastet an einem Möbelstück ein (Ring mit Name beim Zeigen), Stecker im Plan,
// „Ende: …“ mit „lösen“, Gerät aus der verknüpften Entität, Mitziehen beim Verschieben (Pfeiltaste und Ziehen im
// Plan) und beim Ziehen eines platzierten Geräts, senkrechtes Endstück und Stecker in 3D, Fluss bis ins Gerät,
// Ende an ein Gerät ziehen, Gerät löschen = Ende gelöst.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const ed = await t.page("leitungen", "?power", { width: 1280, height: 800 });
const E = (fn, arg) => ed.evaluate(fn, arg);
const near = (a, b, tol = 2e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;
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
const pipeOf = (id) => E((id) => structuredClone(window.panel._editor.floor.pipes.find((p) => p.id === id) ?? null), id);
const lamp = () => E(() => structuredClone(window.panel._editor.floor.furniture.find((m) => m.id === "m_lamp")));

// ---------------------------------------------------------------- Zeichnen bis zur Stehlampe (Wohnzimmer, 1 | 4,4)
await zoomTo(-1, -1, 8, 6);
await tool("pipe");
await click(0.25, 1.5);
await click(0.25, 4.4);
const [hx, hy] = await toScreen(1.03, 4.43);
await ed.mouse.move(hx, hy);
await ed.waitForTimeout(150);
const hover = await E(() => {
  const e = window.panel._editor;
  return { dev: e._snapDevice?.ref ?? null, hover: e.draft?.hover, label: [...e.svg.querySelectorAll("text")].map((x) => x.textContent).includes("Stehlampe") };
});
t.results.zeigen = hover;
t.check(hover.dev?.furniture === "m_lamp" && JSON.stringify(hover.hover) === "[1,4.4]" && hover.label, `Ring am Gerät: ${JSON.stringify(hover)}`);
await t.shot(ed, "leitungen-zeigen.png");
await click(1.03, 4.43);
await E(() => window.panel._editor._draftAction("done"));
await ed.waitForTimeout(150);
const made = await E(() => {
  const e = window.panel._editor;
  const p = structuredClone(e.floor.pipes.at(-1));
  const P = e.props;
  return {
    p,
    toast: e.hint.textContent,
    plug: !!e.svg.querySelector(`rect[data-plug="b"][data-id="${p.id}"]`),
    row: P.querySelector('[data-pend="b"] span')?.textContent,
    unplug: !!P.querySelector('[data-unplug="b"]'),
    dev: P.querySelector("input[data-pf=device]")?.placeholder,
  };
});
const id = made.p.id;
t.results.gezeichnet = made;
t.check(JSON.stringify(made.p.ends) === '{"b":{"furniture":"m_lamp"}}' && JSON.stringify(made.p.points.at(-1)) === "[1,4.4]", `Bezug gespeichert: ${JSON.stringify(made.p)}`);
t.check(/Ende an Stehlampe – rechts Sensor oder Zielraum wählen\.$/.test(made.toast ?? ""), `Hinweis: ${made.toast}`);
t.check(made.plug && made.row === "Ende: Stehlampe" && made.unplug, `Plan und Eigenschaften: ${JSON.stringify(made)}`);
t.check(made.dev === "vom angeschlossenen Gerät: light.wohnzimmer_stehlampe", `Gerät aus der Entität: ${made.dev}`);
await t.shot(ed, "leitungen-plan.png");

// ---------------------------------------------------------------- Mitziehen: Pfeiltaste, Ziehen im Plan
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_lamp" };
  e.render();
  e.renderProps();
  e.nudge(0.5, 0);
});
const p1 = await pipeOf(id);
t.check(JSON.stringify(p1.points.at(-1)) === "[1.5,4.4]", `Pfeiltaste: ${JSON.stringify(p1.points)}`);
await zoomTo(0, 3, 3.5, 5.5); // nah heran: das Gerätesymbol der Lampe deckt sonst die ganze Lampe
const l0 = await lamp();
// am Rand greifen: in der Mitte liegen das Gerätesymbol und das Leitungsende
const [ax, ay] = await toScreen(l0.x + 0.06, l0.z + 0.15);
const [bx, by] = await toScreen(l0.x + 0.66, l0.z - 0.65);
const grip = await E(([x, y]) => window.panel._editor.svg.getRootNode().elementFromPoint(x, y)?.closest("[data-kind]")?.dataset.kind, [ax, ay]);
t.check(grip === "furniture", `Griff an der Lampe: ${grip}`);
await ed.mouse.move(ax, ay);
await ed.mouse.down();
for (let i = 1; i <= 10; i++) {
  await ed.mouse.move(ax + ((bx - ax) * i) / 10, ay + ((by - ay) * i) / 10);
  await ed.waitForTimeout(30);
}
await ed.mouse.up();
await ed.waitForTimeout(150);
const l1 = await lamp();
const p2 = await pipeOf(id);
t.results.ziehen = { lampe: [l1.x, l1.z], ende: p2.points.at(-1), vorher: p2.points.at(-2) };
t.check(l1.x !== l0.x && near(p2.points.at(-1)[0], l1.x) && near(p2.points.at(-1)[1], l1.z) && near(p2.points.at(-2)[1], l1.z), `Ziehen im Plan: ${JSON.stringify(t.results.ziehen)}`);

// ---------------------------------------------------------------- 3D: senkrechtes Endstück auf 0,3 m und Stecker
await ed.locator('haus3d-panel .ed-bar [data-view="split"]').click();
await ed.waitForTimeout(300);
await E(() => window.panel._editor._sync3d(true));
await ed.waitForFunction((id) => !!window.panel._editor.scene3d?._pipes?.get(id), id, { timeout: 30000 });
const d3 = await E((id) => {
  const s = window.panel._editor.scene3d;
  const p = s._pipes.get(id);
  let plugs = 0;
  p.group.traverse((o) => o.userData.pipePlug && o.userData.pipe === id && plugs++);
  const end = p.path.at(-1);
  return { y: Math.round(end.y * 1000) / 1000, x: end.x, z: end.z, before: Math.round(p.path.at(-2).y * 1000) / 1000, plugs };
}, id);
t.results.dreiD = d3;
t.check(near(d3.y, 0.3) && d3.before === 2.45 && d3.plugs === 1 && near(d3.x, l1.x) && near(d3.z, l1.z), `3D-Endstück: ${JSON.stringify(d3)}`);
await E(() => {
  const sc = window.panel._editor.scene3d;
  sc.controls.target.set(1.5, 1.2, 3.6);
  sc.camera.position.set(4.5, 3.2, 1.0);
  sc.controls.update();
  sc.invalidate?.();
});
await ed.waitForTimeout(800);
await t.shot(ed, "leitungen-3d.png");

// ---------------------------------------------------------------- Platziertes Gerät: Ende zieht mit
await E(() => {
  const e = window.panel._editor;
  e._placeDevice("switch.kaffeemaschine", [9.5, 2.5]);
  e.change((fl) => {
    fl.pipes.push({ id: "kaffee", type: "wasser_kalt", points: [[7.06, 2.5], [9.5, 2.5]], heights: [0.03, 0.03], height: 0.03, entity: null, room: null, ends: { b: { entity: "switch.kaffeemaschine" } } });
  });
  e._placeDevice("switch.kaffeemaschine", [9.5, 3.0]);
});
const k = await pipeOf("kaffee");
t.check(JSON.stringify(k.points) === "[[7.06,2.5],[9.5,3]]" && k.ends?.b?.entity === "switch.kaffeemaschine", `Platzierung zieht mit: ${JSON.stringify(k)}`);

// ---------------------------------------------------------------- Speichern: Fluss bis ins Gerät (Licht an)
await E(() => {
  const h = window.panel.hass;
  window.panel.hass = { ...h, states: { ...h.states, "light.wohnzimmer_stehlampe": { ...h.states["light.wohnzimmer_stehlampe"], state: "on" } } };
});
await ed.locator('haus3d-panel .ed [data-act="save"]').click();
await ed.waitForTimeout(1500);
const flow = await E((id) => {
  const s = window.panel._scene;
  const p = s._pipes.get(id);
  const edges = (window.panel._net?.edges ?? []).filter((e) => e.pipeId === id);
  return { active: p?.active, value: edges.map((e) => e.value), reverse: edges.map((e) => e.reverse), editor: !!window.panel._editor };
}, id);
t.results.fluss = flow;
t.check(!flow.editor && flow.active === true && flow.value[0] === 30 && flow.reverse[0] === false, `Fluss bis zur Lampe: ${JSON.stringify(flow)}`);
await ed.waitForTimeout(500);
await t.shot(ed, "leitungen-fluss.png");

// ---------------------------------------------------------------- Editor: lösen, an ein Gerät ziehen, Gerät löschen
await E(() => window.panel._openEditor());
await ed.waitForTimeout(500);
await ed.locator("haus3d-panel .floorsel").selectOption("eg");
await ed.waitForTimeout(300);
await zoomTo(-1, -1, 8, 6);
await E((id) => {
  const e = window.panel._editor;
  e.sel = { kind: "pipe", id };
  e.render();
  e.renderProps();
}, id);
await ed.locator('haus3d-panel .ed-props [data-unplug="b"]').click();
await ed.waitForTimeout(100);
const loose = await E((id) => ({ ends: window.panel._editor.floor.pipes.find((p) => p.id === id).ends ?? null, plug: !!window.panel._editor.svg.querySelector(`rect[data-plug][data-id="${id}"]`), row: !!window.panel._editor.props.querySelector("[data-pend]") }), id);
t.check(loose.ends === null && !loose.plug && !loose.row, `lösen: ${JSON.stringify(loose)}`);
// Endpunkt aufs Gerät ziehen
const p3 = await pipeOf(id);
const l2 = await lamp();
const end = p3.points.at(-1);
const [ex, ey] = await toScreen(end[0], end[1]);
await ed.mouse.click(ex, ey); // Punkt wählen
await ed.waitForTimeout(100);
await E((id) => {
  const e = window.panel._editor;
  e.sel = { kind: "pipe", id };
  e.render();
}, id);
const [ox, oy] = await toScreen(end[0] + 0.6, end[1]);
const [tx, ty] = await toScreen(l2.x + 0.02, l2.z + 0.03);
await ed.mouse.move(ex, ey);
await ed.mouse.down();
for (const [x, y] of [[ex + 12, ey], [ox, oy], [tx, ty]]) {
  await ed.mouse.move(x, y, { steps: 4 });
  await ed.waitForTimeout(40);
}
await ed.mouse.up();
await ed.waitForTimeout(150);
const again = await pipeOf(id);
t.check(again.ends?.b?.furniture === "m_lamp" && near(again.points.at(-1)[0], l2.x) && near(again.points.at(-1)[1], l2.z), `Ende aufs Gerät gezogen: ${JSON.stringify(again)}`);
// Gerät löschen: Leitung bleibt, Ende gelöst
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "m_lamp" };
  e.deleteSelection();
});
const gone = await pipeOf(id);
t.check(gone && !gone.ends && JSON.stringify(gone.points) === JSON.stringify(again.points), `Gerät gelöscht: ${JSON.stringify(gone)}`);
await t.done();
