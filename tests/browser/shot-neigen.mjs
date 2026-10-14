// Neigen/Kippen und Bodentexturen: geneigte und gekippte Möbel liegen auf dem Boden (Mitte bleibt), Deckenleuchte
// und schräge Stütze unter der Decke; Felder „Neigung (°)“/„Kippen (°)“ (nicht bei Treppen), Grundfläche im Plan,
// Live-Vorschau behält die Neigung; „Textur drehen (°)“ an Raum und Gartenfläche, gedrehtes Parkett läuft über
// Räume durch; neue Betontexturen (geschliffen, Sichtbeton, Estrich, Epoxid mit Chips, Betonplatten).
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const near = (a, b, tol = 0.01) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const pg = await t.page("neigen", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);
await pg.waitForFunction(() => window.panel?._building && window.panel._scene, null, { timeout: 30000 });

const FURN = [
  { id: "n_lehnt", type: "shelf", x: 0.9, z: 0.6, rotation: 0, w: 0.9, d: 0.35, h: 1.9, tilt: 12 },
  { id: "n_liegt", type: "shelf", x: 2.2, z: 1.6, rotation: 20, w: 0.9, d: 0.35, h: 1.9, roll: 90 },
  { id: "n_stuhl", type: "chair", x: 5.6, z: 1.4, rotation: 0, w: 0.45, d: 0.5, h: 0.9, tilt: 90 },
  { id: "n_schraeg", type: "wardrobe", x: 5.8, z: 3.2, rotation: 270, w: 1.2, d: 0.6, h: 2.0, tilt: -8, roll: 6 },
  { id: "n_lampe", type: "lamp_ceiling", x: 9, z: 2.5, rotation: 0, w: 0.5, d: 0.5, h: 0.15, tilt: 30 },
  { id: "n_strebe", type: "pillar", x: 9, z: 5.5, rotation: 0, w: 0.16, d: 0.16, h: 0, roll: 25 },
  { id: "n_treppe", type: "stairs", x: 13, z: 3, rotation: 0, w: 1, d: 3, h: 2.6, tilt: 30 },
];

// Haus umbauen: Möbel geneigt/gekippt, Parkett in Wohn- und Schlafzimmer um 45° gedreht, neue Betontexturen
const R = await E(async (furn) => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  const room = (id) => eg.rooms.find((r) => r.id === id);
  Object.assign(room("wohnzimmer"), { floor_material: "oak", floor_texture_rotation: 45 });
  Object.assign(room("schlafzimmer"), { floor_material: "oak", floor_texture_rotation: 45 });
  Object.assign(room("kueche"), { floor_material: "concrete_polished", wall_texture: "concrete_formwork", wall_color: "#d8d6d0" });
  Object.assign(room("flur"), { floor_material: "epoxy_chips" });
  Object.assign(room("bad"), { floor_material: "concrete_slabs" });
  Object.assign(room("gartenhaus"), { floor_material: "screed" });
  Object.assign(eg.outdoor.find((o) => o.id === "terrasse"), { texture: "concrete_slabs", texture_rotation: 30 });
  eg.furniture = [...eg.furniture.filter((m) => !["m_sofa", "m_ct", "m_rug", "m_tv", "m_tvw"].includes(m.id)), ...furn];
  p._setBuilding(b, p._revision, { keepCamera: true });
  p._setFilter("eg");
  await new Promise((r) => setTimeout(r, 300));
  const s = p._scene;
  const THREE = s.camera.position.constructor;
  const boxOf = (id) => {
    let obj = null;
    s.root.traverse((o) => {
      if (!obj && o.userData.furniture === id && o.parent?.userData.furniture !== id) obj = o;
    });
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    const lo = new THREE(Infinity, Infinity, Infinity);
    const hi = new THREE(-Infinity, -Infinity, -Infinity);
    const v = new THREE();
    obj.traverse((o) => {
      const pos = o.isMesh && o.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        lo.min(v);
        hi.max(v);
      }
    });
    return { lo: lo.toArray(), hi: hi.toArray(), rx: obj.rotation.x, rz: obj.rotation.z };
  };
  const out = {};
  for (const m of furn) out[m.id] = boxOf(m.id);
  // Bodentexturen: gedrehte Kopie, gleiche Drehung geteilt
  const floorMap = (id) => p._scene.floors.get("eg").rooms.get(id).mesh.material.map;
  out.tex = {
    wz: floorMap("wohnzimmer")?.rotation,
    same: floorMap("wohnzimmer") === floorMap("schlafzimmer"),
    kueche: !!floorMap("kueche")?.image,
    base: floorMap("flur") !== floorMap("bad"),
  };
  return out;
}, FURN);
t.results.modelle = R;
const lieg = (id, x, z, y0 = 0) => {
  const b = R[id];
  return b && near((b.lo[0] + b.hi[0]) / 2, x, 0.03) && near((b.lo[2] + b.hi[2]) / 2, z, 0.03) && b.lo[1] > y0 - 0.01 && b.lo[1] < y0 + 0.03;
};
t.check(lieg("n_lehnt", 0.9, 0.6) && R.n_lehnt.rx < -0.1, `angelehntes Regal: ${JSON.stringify(R.n_lehnt)}`);
t.check(lieg("n_liegt", 2.2, 1.6) && R.n_liegt.hi[1] < 0.95 && Math.abs(R.n_liegt.rz) > 1.5, `liegendes Regal: ${JSON.stringify(R.n_liegt)}`);
t.check(lieg("n_stuhl", 5.6, 1.4), `umgekippter Stuhl: ${JSON.stringify(R.n_stuhl)}`);
t.check(lieg("n_schraeg", 5.8, 3.2), `schräger Schrank: ${JSON.stringify(R.n_schraeg)}`);
t.check(R.n_lampe && R.n_lampe.hi[1] <= 2.6 - 0.005 && R.n_lampe.hi[1] > 2.5 && R.n_lampe.rx < -0.5, `Deckenleuchte: ${JSON.stringify(R.n_lampe)}`);
t.check(R.n_strebe && R.n_strebe.lo[1] > -0.01 && near(R.n_strebe.hi[1], 2.6, 0.02), `Strebe: ${JSON.stringify(R.n_strebe)}`);
t.check(R.n_treppe && R.n_treppe.rx === 0 && R.n_treppe.rz === 0, `Treppe ohne Neigung: ${JSON.stringify(R.n_treppe)}`);
t.check(near(R.tex.wz, -Math.PI / 4, 1e-6) && R.tex.same && R.tex.kueche && R.tex.base, `Bodentexturen: ${JSON.stringify(R.tex)}`);

// Ansichten: Wohnzimmer mit gedrehtem Parkett und den Möbeln, Küche/Flur/Bad mit Beton
async function view(file, pos, target) {
  await E(([pos, target]) => {
    const p = window.panel;
    const s = p._scene;
    for (const el of [p._els.overlay, p._alertBar]) if (el) el.style.visibility = "hidden";
    s.camera.position.set(...pos);
    s.controls.target.set(...target);
    s.controls.update();
    s.invalidate();
  }, [pos, target]);
  await pg.waitForTimeout(1500);
  await t.shot(pg, file);
}
await view("neigen-moebel.png", [3.5, 8, 9.5], [3.3, 0.3, 2]);
await view("neigen-parkett.png", [4, 14, 5.3], [4, 0, 5]);
await view("neigen-beton.png", [8, 15, 13], [8, 0, 5]);
await view("neigen-sichtbeton.png", [7.6, 1.6, 2.2], [11, 1.2, 1.8]);
await view("neigen-garten.png", [4, 6, -7.5], [4, 0, -1.7]);

// ---------------------------------------------------------------- Editor
await E(() => {
  for (const el of [window.panel._els.overlay, window.panel._alertBar]) if (el) el.style.visibility = "";
});
await E(() => window.panel._openEditor());
await pg.waitForTimeout(500);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.waitForTimeout(200);
const sel = (kind, id) => E(([kind, id]) => {
  const e = window.panel._editor;
  e.sel = { kind, id };
  e.render();
  e.renderProps();
}, [kind, id]);
const fields = () => E(() => {
  const q = (s) => window.panel._editor.props.querySelector(s);
  return { tilt: q("[data-num=tilt]")?.value ?? null, roll: q("[data-num=roll]")?.value ?? null, rot: q("[data-texrot]")?.value ?? null };
});
const item = (id) => E((id) => structuredClone(window.panel._editor.floor.furniture.find((m) => m.id === id) ?? null), id);
const setNum = async (sel, v) => {
  await pg.locator(`haus3d-panel .ed-props ${sel}`).fill(String(v));
  await pg.locator(`haus3d-panel .ed-props ${sel}`).dispatchEvent("change");
  await pg.waitForTimeout(150);
};
await sel("furniture", "n_lehnt");
const f0 = await fields();
await sel("furniture", "n_treppe");
const fStairs = await fields();
t.check(f0.tilt === "12" && f0.roll === "0" && fStairs.tilt === null && fStairs.roll === null, `Felder: ${JSON.stringify({ f0, fStairs })}`);
// Felder setzen: 375 → 15, 0 löscht
await sel("furniture", "n_lehnt");
await setNum("[data-num=roll]", 375);
await setNum("[data-num=tilt]", 0);
const m1 = await item("n_lehnt");
t.check(m1.roll === 15 && !("tilt" in m1), `Felder setzen: ${JSON.stringify(m1)}`);
await setNum("[data-num=roll]", 0);
await setNum("[data-num=tilt]", 12);
// Grundfläche im Plan: liegendes Regal 1,9 × 0,35 m
const rectW = await E(() => {
  const g = window.panel._editor.svg.querySelector('[data-kind=furniture][data-id="n_liegt"] rect:not([fill=none])');
  return g ? [Number(g.getAttribute("width")), Number(g.getAttribute("height"))] : null;
});
t.check(rectW && near(rectW[0], 1.9, 1e-6) && near(rectW[1], 0.35, 1e-6), `Plan-Grundfläche: ${JSON.stringify(rectW)}`);
// Trefferprüfung: Punkt am Ende des liegenden Regals (0,85 m neben der Mitte, entlang der Drehung)
const hit = await E(async () => {
  const { furnitureAt } = await import("/custom_components/haus3d/frontend/edit-ops.js");
  const a = (20 * Math.PI) / 180;
  return furnitureAt(window.panel._editor.floor, [2.2 + Math.cos(a) * 0.85, 1.6 + Math.sin(a) * 0.85])?.id ?? null;
});
t.check(hit === "n_liegt", `Treffer am Ende: ${hit}`);
await sel("furniture", "n_liegt");
await pg.waitForTimeout(300);
await t.shot(pg, "neigen-plan.png");

// Textur drehen: Raum (Feld und +90°), Gartenfläche
await sel("room", "kueche");
await setNum("[data-texrot=floor_texture_rotation]", -30);
let k = await E(() => window.panel._editor.floor.rooms.find((r) => r.id === "kueche").floor_texture_rotation);
await pg.locator("haus3d-panel .ed-props [data-texrot90=floor_texture_rotation]").click();
await pg.waitForTimeout(150);
const k2 = await E(() => window.panel._editor.floor.rooms.find((r) => r.id === "kueche").floor_texture_rotation);
await setNum("[data-texrot=floor_texture_rotation]", 0);
const k3 = await E(() => "floor_texture_rotation" in window.panel._editor.floor.rooms.find((r) => r.id === "kueche"));
t.check(k === 330 && k2 === 60 && k3 === false, `Textur drehen am Raum: ${k} → ${k2} → ${k3}`);
await sel("outdoor", "terrasse");
const fo = await fields();
await setNum("[data-texrot=texture_rotation]", 90);
const o1 = await E(() => window.panel._editor.floor.outdoor.find((o) => o.id === "terrasse"));
t.check(fo.rot === "30" && o1.texture_rotation === 90 && o1.texture === "concrete_slabs", `Textur drehen am Garten: ${JSON.stringify({ fo, o1 })}`);
await sel("room", "wohnzimmer");
await pg.waitForTimeout(200);
await t.shot(pg, "neigen-felder.png");

// Editor-3D: Live-Vorschau beim Ziehen behält Neigen/Kippen, Drehung um die Mitte der Grundfläche
await pg.locator('haus3d-panel .ed-bar [data-view="3d"]').click();
await pg.waitForFunction(() => !!window.panel._editor.scene3d && window.panel._editor._3dShown, null, { timeout: 30000 });
await pg.waitForTimeout(1500);
const live = await E(async () => {
  const e = window.panel._editor;
  const { targetObject } = await import("/custom_components/haus3d/frontend/scene-arrows.js");
  const sel = { kind: "furniture", id: "n_schraeg" };
  e.sel = sel;
  e._mark3d();
  const obj0 = targetObject(e.scene3d, sel);
  const r0 = [obj0.rotation.x, obj0.rotation.z];
  e._liveStart(sel);
  e.change((fl) => {
    Object.assign(fl.furniture.find((m) => m.id === "n_schraeg"), { x: 4.8, z: 2.6, rotation: 180 });
  });
  e._preview3d();
  const obj = targetObject(e.scene3d, sel);
  obj.updateMatrixWorld(true);
  const THREE = obj.position.constructor;
  const lo = new THREE(Infinity, Infinity, Infinity);
  const hi = new THREE(-Infinity, -Infinity, -Infinity);
  const v = new THREE();
  obj.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      lo.min(v);
      hi.max(v);
    }
  });
  const res = { same: obj === obj0, r0, r1: [obj.rotation.x, obj.rotation.z], c: [(lo.x + hi.x) / 2, lo.y, (lo.z + hi.z) / 2] };
  e._liveEnd();
  return res;
});
t.check(live.same && live.r0[0] === live.r1[0] && live.r0[1] === live.r1[1] && near(live.c[0], 4.8, 0.03) && near(live.c[2], 2.6, 0.03) && near(live.c[1], 0, 0.02), `Live-Vorschau: ${JSON.stringify(live)}`);
await pg.waitForTimeout(1200);
await E(() => {
  const sc = window.panel._editor.scene3d;
  sc.camera.position.set(3.5, 6, 9.5);
  sc.controls.target.set(3.5, 0.4, 2.4);
  sc.controls.update();
  sc.invalidate();
});
await pg.waitForTimeout(1200);
await t.shot(pg, "neigen-editor-3d.png");
await t.done();
