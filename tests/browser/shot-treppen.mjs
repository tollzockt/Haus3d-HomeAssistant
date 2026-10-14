// Treppen: Wendeltreppe mit rundem Deckenloch und Geländer, Geländer an der Öffnung, durchgehende Handläufe,
// eigene Maße bzw. keine Öffnung, rundes Treppenloch, Editor (Felder, Plan, Sprung zur Treppe) und Tablet
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("treppen", "?stairs", { width: 1280, height: 800 });

/** Treppe im KG (und Treppenlöcher im EG) setzen, Szene neu bauen und messen. */
const build = (patch) => pg.evaluate(async (patch) => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const kg = b.floors.find((f) => f.id === "kg");
  const eg = b.floors.find((f) => f.id === "eg");
  // Werkbank und Hocker stehen sonst im Treppenbereich
  kg.furniture = kg.furniture.filter((x) => !["m_werkbank", "m_bs1", "m_bs2"].includes(x.id));
  const st = kg.furniture.find((x) => x.id === "treppe_kg");
  for (const k of ["stair_shape", "railing", "hole", "hole_railing", "cut", "run_width"]) delete st[k];
  Object.assign(st, { w: 1.0, d: 2.6 }, patch.stair ?? {});
  // Garderobe steht sonst über der Öffnung
  eg.furniture = eg.furniture.filter((x) => x.type !== "stairwell" && x.id !== "m_coat").concat(patch.wells ?? []);
  p._setBuilding(b, p._revision, { keepCamera: true });
  await new Promise((r) => setTimeout(r, 250));
  const { slabOpenings } = await import("/custom_components/haus3d/frontend/stairs.js");
  const sc = p._scene;
  const holes = {};
  for (const [fid, e] of sc.floors) e.group.traverse((o) => { if (o.userData?.holes) holes[fid] = (holes[fid] ?? 0) + o.userData.holes; });
  let obj = null;
  sc.scene.traverse((o) => { if (!obj && o.userData.furniture === "treppe_kg" && o.parent?.userData.furniture !== "treppe_kg") obj = o; });
  let tubes = 0;
  obj?.traverse((o) => { if (o.isMesh && o.geometry?.type === "TubeGeometry") tubes++; });
  let egMeshes = 0;
  sc.floors.get("eg").group.traverse((o) => { if (o.isMesh) egMeshes++; });
  const ops = slabOpenings(b, "eg").map((o) => ({ n: o.poly.length, well: !!o.well, edges: o.edges?.length ?? 0, railing: o.railing ?? null, r: o.poly.map((q) => Math.hypot(q[0] - st.x, q[1] - st.z)) }));
  return { holes, tubes, egMeshes, ops };
}, patch);

/** Etage zeigen und die Kamera auf einen Punkt richten (Blick von schräg oben). */
const look = async (floor, target, offset) => {
  await pg.locator(`haus3d-panel .floorbar button[data-floor='${floor}']`).click().catch(() => {});
  await pg.waitForTimeout(500);
  await pg.evaluate(([c, o]) => {
    const sc = window.panel._scene;
    sc.controls.target.set(c[0], c[1], c[2]);
    sc.camera.position.set(c[0] + o[0], c[1] + o[1], c[2] + o[2]);
    sc.controls.update();
    sc._dirty = true;
    sc._kick?.();
  }, [target, offset]);
  await pg.waitForTimeout(1200);
};

// 1. Wendeltreppe 1,6 m mit Geländer außen: rundes Loch (32 Ecken, am Podest bündig, sonst 8 cm Luft), 2 Handläufe
const spiral = await build({ stair: { stair_shape: "spiral", w: 1.6, d: 1.6, railing: "outer" } });
const sr = spiral.ops[0]?.r ?? [];
t.results.wendel = { holes: spiral.holes, tubes: spiral.tubes, n: spiral.ops[0]?.n, edges: spiral.ops[0]?.edges, minR: Math.min(...sr), maxR: Math.max(...sr) };
t.check(spiral.holes.eg === 1 && !spiral.holes.kg && spiral.ops[0]?.n === 32 && Math.min(...sr) >= 0.8 - 1e-6 && Math.max(...sr) >= 0.88 - 1e-6 && spiral.tubes === 2, `Wendeltreppe: ${JSON.stringify(t.results.wendel)}`);
t.check(spiral.ops[0]?.railing === "bars" && spiral.ops[0].edges >= 1 && spiral.ops[0].edges <= 12, `Wendeltreppe, Geländer an der Öffnung: ${JSON.stringify(spiral.ops[0] && { ...spiral.ops[0], r: undefined })}`);
await look("eg", [9.5, 0, 5.5], [-0.9, 3.4, 1.1]);
await t.shot(pg, "treppe-wendel-oben.png");
await look("kg", [9.5, -2.8 + 1.2, 5.5], [-1.7, 2.4, 1.1]);
await t.shot(pg, "treppe-wendel-gelaender.png");

// 2. Geländer an der Öffnung: keins gegen Stäbe
const none = await build({ stair: { stair_shape: "spiral", w: 1.6, d: 1.6, railing: "outer", hole_railing: "none" } });
const bars = await build({ stair: { stair_shape: "spiral", w: 1.6, d: 1.6, railing: "outer", hole_railing: "bars" } });
t.results.oeffnungsgelaender = { none: none.egMeshes, bars: bars.egMeshes, edges: bars.ops[0]?.edges, noneEdges: none.ops[0]?.edges };
t.check(bars.egMeshes - none.egMeshes >= 8 && bars.ops[0]?.edges >= 1 && bars.ops[0].edges <= 12 && !none.ops[0]?.edges, `Öffnungsgeländer: ${JSON.stringify(t.results.oeffnungsgelaender)}`);

// 3. Gerade und U-Treppe mit beidseitigem Geländer: je zwei durchgehende Handläufe
const straight = await build({ stair: { stair_shape: "straight", railing: "both" } });
const u = await build({ stair: { stair_shape: "u_left", w: 2.2, d: 3, railing: "both" } });
t.results.handlaeufe = { gerade: straight.tubes, u: u.tubes, uHoles: u.holes };
t.check(straight.tubes === 2 && u.tubes === 2 && u.holes.eg >= 1, `Handläufe: ${JSON.stringify(t.results.handlaeufe)}`);
await look("kg", [9.5, -2.8 + 1.0, 5.5], [-2.3, 4.0, 0.9]);
await t.shot(pg, "treppe-u-gelaender.png");

// 4. Eigene Maße (eckig) und keine Öffnung
const own = await build({ stair: { stair_shape: "straight", hole: { w: 1.4, d: 1.4, dx: 0, dz: -0.5, round: false } } });
const cut = await build({ stair: { stair_shape: "straight", cut: false } });
t.results.eigene = { own: own.ops.map((o) => o.n), ownHoles: own.holes, cutHoles: cut.holes, cutOps: cut.ops.length };
t.check(own.ops[0]?.n === 4 && own.holes.eg === 1 && !cut.holes.eg && cut.ops.length === 0, `Eigene Maße / keine: ${JSON.stringify(t.results.eigene)}`);

// 5. Rundes Treppenloch mit Glasgeländer: zweites Loch, flache Kantenleiste, Mitte offen
const well = { id: "loch_rund", type: "stairwell", x: 1.3, z: 2.2, rotation: 0, w: 1.2, d: 1.6, h: 0.02, hole_round: true, hole_railing: "glass" };
const w5 = await build({ stair: { stair_shape: "straight" }, wells: [well] });
const probe = await pg.evaluate(async () => {
  const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
  const sc = window.panel._scene;
  let obj = null;
  sc.scene.traverse((o) => { if (!obj && o.userData.furniture === "loch_rund" && o.parent?.userData.furniture !== "loch_rund") obj = o; });
  if (!obj) return null;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const ray = new THREE.Raycaster(new THREE.Vector3(1.3, 1, 2.2), new THREE.Vector3(0, -1, 0), 0, 1.2);
  const hits = ray.intersectObject(sc.floors.get("eg").group, true).filter((h) => h.object.isMesh);
  return { height: box.max.y - box.min.y, hits: hits.map((h) => `${h.object.userData.furniture ?? h.object.userData.room ?? h.object.type}@${h.distance.toFixed(3)}`) };
});
t.results.treppenloch = { holes: w5.holes, ops: w5.ops.map((o) => ({ n: o.n, well: o.well, edges: o.edges, railing: o.railing })), probe };
t.check(w5.holes.eg === 2 && probe && probe.height < 0.02 && probe.hits.length === 0, `Treppenloch rund: ${JSON.stringify(t.results.treppenloch)}`);
t.check(w5.ops.some((o) => o.well && o.n === 32 && o.railing === "glass" && o.edges >= 1), `Treppenloch-Geländer: ${JSON.stringify(t.results.treppenloch.ops)}`);
await look("eg", [1.3, 0, 2.2], [1.6, 2.6, 1.9]);
await t.shot(pg, "treppenloch-rund.png");

// 6. Editor: Wendeltreppe wählen, Öffnung einstellen, Öffnung im EG, Sprung zur Treppe
const ed = await t.page("treppen-editor", "?stairs", { width: 1280, height: 800 });
await ed.evaluate(() => window.panel._openEditor());
await ed.waitForTimeout(500);
await ed.locator("haus3d-panel .floorsel").selectOption("kg");
await ed.waitForTimeout(300);
await ed.evaluate(() => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: "treppe_kg" };
  e.render();
  e.renderProps();
});
const props = "haus3d-panel .ed-props";
/** Plan auf einen Ausschnitt zoomen (für die Bilder). */
const zoom = (pg2, v) => pg2.evaluate((v) => {
  const e = window.panel._editor;
  e.view = v;
  e._fitPending = true;
  e.render();
}, v);
const stair = () => ed.evaluate(() => window.panel._editor.floor.furniture.find((x) => x.id === "treppe_kg"));
await ed.locator(`${props} select[data-stair="stair_shape"]`).selectOption("spiral");
await ed.waitForTimeout(200);
const sp = await ed.evaluate(() => {
  const e = window.panel._editor;
  return {
    m: e.floor.furniture.find((x) => x.id === "treppe_kg"),
    hint: e.hint.textContent,
    ellipse: !!e.svg.querySelector('[data-kind=furniture][data-id="treppe_kg"] > ellipse'),
    hole: e.svg.querySelectorAll("[data-stairhole]").length,
    railing: [...e.props.querySelectorAll('select[data-stair="railing"] option')].map((o) => o.value),
    info: [...e.props.querySelectorAll(".muted")].map((p) => p.textContent).find((x) => /Stufen/.test(x)),
  };
});
t.results.editorWendel = sp;
t.check(sp.m.w === 1.6 && sp.m.d === 1.6 && sp.m.railing === "outer" && /Grundfläche 1,60 × 1,60 m/.test(sp.hint) && sp.ellipse && sp.hole === 1 && sp.railing.join() === "none,outer" && /^\d+ Stufen · Steigung/.test(sp.info ?? ""), `Editor Wendeltreppe: ${JSON.stringify(sp)}`);
await ed.locator(`${props} [data-holemode]`).selectOption("custom");
await ed.waitForTimeout(200);
const wIn = ed.locator(`${props} [data-hole="w"]`);
await wIn.fill("1.9");
await wIn.dispatchEvent("change");
await ed.waitForTimeout(200);
await ed.locator(`${props} select[data-stair="hole_railing"]`).selectOption("glass");
await ed.waitForTimeout(200);
const custom = await stair();
t.results.editorEigene = custom;
t.check(custom.hole?.w === 1.9 && custom.hole.round === true && custom.hole_railing === "glass" && custom.cut === undefined, `Editor eigene Maße: ${JSON.stringify(custom)}`);
await zoom(ed, { x0: 7.2, z0: 3.6, x1: 11.8, z1: 7.4 });
await ed.waitForTimeout(200);
await t.shot(ed, "treppe-editor.png");
await ed.locator(`${props} [data-holemode]`).selectOption("none");
await ed.waitForTimeout(200);
const noHole = await stair();
const noRail = await ed.locator(`${props} select[data-stair="hole_railing"]`).count();
await ed.locator(`${props} [data-holemode]`).selectOption("auto");
await ed.waitForTimeout(200);
const auto = await stair();
t.results.editorModus = { none: { cut: noHole.cut, hole: noHole.hole, railSelect: noRail }, auto: { cut: auto.cut, hole: auto.hole } };
t.check(noHole.cut === false && noHole.hole?.w === 1.9 && noRail === 0 && auto.cut === undefined && auto.hole === undefined && auto.hole_railing === "glass", `Editor keine/automatisch: ${JSON.stringify(t.results.editorModus)}`);
// EG: Öffnung gestrichelt mit Geländerkanten; Tippfeld führt zur Treppe im KG
await ed.locator("haus3d-panel .floorsel").selectOption("eg");
await ed.waitForTimeout(300);
const eg = await ed.evaluate(() => {
  const s = window.panel._editor.svg;
  return { holes: s.querySelectorAll("[data-slabhole]").length, rails: s.querySelectorAll("[data-slabrail]").length, text: s.querySelector("[data-slabhole] text")?.textContent, src: s.querySelectorAll("[data-kind=stairsrc]").length };
});
t.results.editorEG = eg;
t.check(eg.holes === 1 && eg.rails >= 1 && eg.text === "Treppe von KG" && eg.src === 1, `Editor EG: ${JSON.stringify(eg)}`);
await zoom(ed, { x0: 6.6, z0: 3.4, x1: 12.4, z1: 7.6 });
await ed.waitForTimeout(200);
await t.shot(ed, "treppe-editor-eg.png");
await ed.locator("haus3d-panel [data-kind=stairsrc]").click();
await ed.waitForTimeout(300);
const jump = await ed.evaluate(() => {
  const e = window.panel._editor;
  return { floor: e.floorId, sel: e.sel, bar: e.root.querySelector(".floorsel")?.value, props: !!e.props.querySelector("[data-holemode]"), hint: e.hint.textContent };
});
t.results.editorSprung = jump;
t.check(jump.floor === "kg" && jump.sel?.id === "treppe_kg" && jump.bar === "kg" && jump.props && /Treppe gewählt/.test(jump.hint), `Sprung zur Treppe: ${JSON.stringify(jump)}`);

// 7. Tablet: Tippfeld antippen, Felder für eigene Maße mit passender Tastatur
const tab = await t.page("treppen-tablet", "?stairs", { width: 1024, height: 768, touch: true });
await tab.evaluate(() => window.panel._openEditor());
await tab.waitForTimeout(500);
await tab.locator("haus3d-panel .floorsel").selectOption("eg");
await tab.waitForTimeout(300);
// Tippfeld liegt unter Griffen und Möbeln: wo Ecke, Wand, „+“ oder ein Möbel darüber liegt, gewinnen diese
const unter = await tab.evaluate(() => {
  const e = window.panel._editor;
  const rn = e.svg.getRootNode();
  const out = { tested: 0, hits: [] };
  for (const r of e.floor.rooms) {
    e.sel = { kind: "room", id: r.id };
    e.render();
    const rect = e.svg.querySelector("[data-kind=stairsrc]");
    const rb = rect?.getBoundingClientRect();
    if (!rb) continue;
    for (const el of e.svg.querySelectorAll("[data-kind=vertex],[data-kind=edge],[data-kind=insert],[data-kind=furniture]")) {
      const b = el.getBoundingClientRect();
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 2; j++) {
          const x = b.left + (b.width * i) / 8;
          const y = b.top + (b.height * j) / 2;
          if (x < rb.left || x > rb.right || y < rb.top || y > rb.bottom) continue;
          rect.style.display = "none";
          const own = rn.elementFromPoint(x, y)?.closest?.("[data-kind]") === el;
          rect.style.display = "";
          if (!own) continue;
          out.tested++;
          if (rn.elementFromPoint(x, y)?.closest?.("[data-kind]")?.dataset.kind === "stairsrc") out.hits.push(`${r.id}:${el.dataset.kind}${el.dataset.i ?? el.dataset.id ?? ""}`);
        }
      }
    }
  }
  e.sel = null;
  e.render();
  e.renderProps();
  return { tested: out.tested, hits: [...new Set(out.hits)] };
});
t.results.tippfeldUnten = unter;
t.check(unter.tested > 0 && unter.hits.length === 0, `Tippfeld unter Griffen und Möbeln: ${JSON.stringify(unter)}`);
await tab.locator("haus3d-panel [data-kind=stairsrc]").tap();
await tab.waitForTimeout(300);
await tab.locator(`${props} [data-holemode]`).selectOption("custom");
await tab.waitForTimeout(200);
const touch = await tab.evaluate(() => {
  const e = window.panel._editor;
  const q = (k) => e.props.querySelector(`[data-hole="${k}"]`);
  return { floor: e.floorId, sel: e.sel?.id, dx: q("dx")?.getAttribute("inputmode") ?? null, dz: q("dz")?.getAttribute("inputmode") ?? null, w: q("w")?.getAttribute("inputmode") ?? null, hole: e.floor.furniture.find((x) => x.id === "treppe_kg")?.hole };
});
t.results.tablet = touch;
t.check(touch.floor === "kg" && touch.sel === "treppe_kg" && touch.dx === null && touch.dz === null && touch.w === "decimal" && touch.hole?.w > 0, `Tablet: ${JSON.stringify(touch)}`);
await t.shot(tab, "treppe-tablet.png");
await t.done();
