// Dach-Ebene je Etage: Knopf „Dach“ (auch ohne Hausdach), eigenes Dach des Gartenhauses bearbeiten (Neigung,
// Kante, PV-Feld), gemeinsames Dach berührender Räume (abtrennen, verbinden), Norden nur mit Admin-PIN,
// „Hausdach“ in der Etagen-Auswahl, Wechsel der Etage, Editor-3D, Szene nach dem Speichern, Dachgeschoss mit
// eigenem Dach (Erker) und die Rückfrage beim Entfernen eines Dachs unter dem Hausdach
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const R = t.results;
const OUT = "/custom_components/haus3d/frontend";

// Obergeschoss (EG-Räume ohne Gartenhaus), Gartenhaus mit Pultdach, Hausdach (Satteldach 35°) auf dem OG
const aufbau = () => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  const og = {
    id: "og",
    name: "Obergeschoss",
    elevation: 2.85,
    height: 2.5,
    rooms: eg.rooms.filter((r) => r.id !== "gartenhaus").map((r) => ({ id: `og_${r.id}`, name: `${r.name} OG`, area_id: null, floor_material: "wood", points: structuredClone(r.points) })),
  };
  b.floors = [...b.floors.filter((f) => f.id !== "og"), og];
  eg.rooms.find((r) => r.id === "gartenhaus").roof = { type: "shed", pitch: 15, overhang: 0.3 };
  b.settings.roof = { type: "gable", pitch: 35, overhang: 0.4 };
  p._setBuilding(b, p._revision, { keepCamera: true });
};

async function seite(name, opts) {
  const pg = await t.page(name, "", opts);
  const E = (fn, arg) => pg.evaluate(fn, arg);
  await E(aufbau);
  await unlock(pg, "edit");
  await E(() => window.panel._openEditor());
  await pg.waitForTimeout(700);
  return { pg, E };
}

// --- Tablet: Leiste im Dach-Modus auf dem „Obergeschoss“ --------------------------------------------------
{
  const { pg, E } = await seite("dachebene-tablet", { width: 1024, height: 768, touch: true });
  await pg.locator("haus3d-panel .floorsel").selectOption("og");
  await pg.waitForTimeout(200);
  await pg.locator("haus3d-panel .ed-bar [data-act=roofmode]").tap();
  await pg.waitForTimeout(500);
  R.tablet = await E(() => {
    const e = window.panel._editor;
    const bar = e.root.querySelector(".ed-bar").getBoundingClientRect();
    const save = e.root.querySelector(".ed-bar [data-act=save]").getBoundingClientRect();
    return { roofMode: e.roofMode, floor: e.floorId, h: bar.height, right: save.right };
  });
  t.check(R.tablet.roofMode && R.tablet.floor === "og" && R.tablet.h < 64 && R.tablet.right <= 1024, `Tablet-Leiste: ${JSON.stringify(R.tablet)}`);
  await t.shot(pg, "dachebene-tablet.png");
}

// --- Desktop ------------------------------------------------------------------------------------------
const { pg, E } = await seite("dachebene", { width: 1280, height: 800 });
const ed = (fn, arg) => E(([src, a]) => new Function("e", "a", `return (${src})(e, a);`)(window.panel._editor, a), [fn.toString(), arg]);
const plan = (x, z) =>
  E(([x, z]) => {
    const e = window.panel._editor;
    const r = e.svg.getBoundingClientRect();
    return [r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale];
  }, [x, z]);
const mitteVon = (sel) =>
  E((sel) => {
    const el = window.panel._editor.svg.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, sel);
const feld = (sel, v) =>
  E(([sel, v]) => {
    const i = window.panel._editor.props.querySelector(sel);
    i.value = String(v);
    i.dispatchEvent(new Event("change"));
  }, [sel, v]);
const einheiten = () =>
  E(async (src) => {
    const { roofUnits } = await import(`${src}/roofunits.js`);
    return roofUnits(window.panel._editor.b, "eg", { house: false }).map((u) => u.key);
  }, OUT);
const gartenhaus = () => ed((e) => e.b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === "gartenhaus").roof);

// 1. Knopf „Dach“ ist da (das Hausdach steht auf dem OG); 3. auf dem EG: Dach-Modus mit Platzhalter „Dach · EG“
R.knopf = await ed((e) => !!e.root.querySelector(".ed-bar [data-act=roofmode]"));
t.check(R.knopf, "Knopf „Dach“ fehlt");
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.waitForTimeout(200);
await pg.locator("haus3d-panel .ed-bar [data-act=roofmode]").click();
await pg.waitForTimeout(400);
R.modus = await ed((e) => ({ roofMode: e.roofMode, floor: e.floorId, opts: [...e.root.querySelectorAll(".floorsel option")].filter((o) => o.selected).map((o) => o.textContent) }));
t.check(R.modus.roofMode && R.modus.floor === "eg" && R.modus.opts.length === 1 && R.modus.opts[0].startsWith("Dach · "), `Dach-Modus auf dem EG: ${JSON.stringify(R.modus)}`);

// 4. Dach des Gartenhauses antippen → Formular „Dach: Gartenhaus“
const gh = await mitteVon('[data-kind=roofpart][data-unit="room:eg:gartenhaus"]');
t.check(!!gh, "Dachfläche des Gartenhauses fehlt im Plan");
if (gh) await pg.mouse.click(...gh);
await pg.waitForTimeout(300);
R.formular = await ed((e) => ({ h3: e.props.querySelector("h3")?.textContent, sel: e.sel }));
t.check(R.formular.h3 === "Dach: Gartenhaus" && R.formular.sel?.unit === "room:eg:gartenhaus", `Formular: ${JSON.stringify(R.formular)}`);

// 5. Neigung 30 → 30, 80 → 60 (alte Dachformen höchstens 60°)
await feld("[data-rn=pitch]", 30);
R.neigung30 = (await gartenhaus()).pitch;
await feld("[data-rn=pitch]", 80);
R.neigung80 = (await gartenhaus()).pitch;
t.check(R.neigung30 === 30 && R.neigung80 === 60, `Neigung: ${R.neigung30} / ${R.neigung80}`);
await feld("[data-rn=pitch]", 20);

// 6. Griff „Ende“ ziehen → adjust[0].hi
const hi = await mitteVon("[data-kind=roofhandle][data-side=hi]");
const lo = await mitteVon("[data-kind=roofhandle][data-side=lo]");
if (hi && lo) {
  const len = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) || 1;
  const d = [((hi[0] - lo[0]) / len) * 15, ((hi[1] - lo[1]) / len) * 15];
  await pg.mouse.move(...hi);
  await pg.mouse.down();
  await pg.mouse.move(hi[0] + d[0], hi[1] + d[1], { steps: 6 });
  await pg.mouse.up();
  await pg.waitForTimeout(300);
}
R.kante = (await gartenhaus()).adjust ?? null;
t.check(!!hi && !!R.kante?.[0]?.hi, `Kante ziehen: ${JSON.stringify(R.kante)}`);

// 7. PV-Feld aufs Gartenhaus-Dach: Ding am Raum, Hausdach unverändert
const hausVorher = await ed((e) => JSON.stringify(e.b.settings.roof.items ?? null));
await pg.locator("haus3d-panel .ed-bar [data-tool=pv]").click();
await pg.mouse.click(...(await plan(15.5, 10)));
await pg.waitForTimeout(300);
R.pv = await ed((e, h) => {
  const g = e.b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === "gartenhaus").roof;
  return { items: (g.items ?? []).map((x) => x.id), haus: JSON.stringify(e.b.settings.roof.items ?? null) === h, sel: e.sel };
}, hausVorher);
t.check(R.pv.items.length === 1 && R.pv.haus && R.pv.sel?.unit === "room:eg:gartenhaus", `PV aufs Gartenhaus: ${JSON.stringify(R.pv)}`);
const pvId = R.pv.items[0];
await feld("[data-rn=rows]", 1); // eine Reihe passt auf das flache Pultdach
R.pvModule = await ed((e) => e.svg.querySelectorAll("[data-kind=roofitem] polygon:not([data-blocked])").length);
await t.shot(pg, "dachebene-eg.png");

// 8. Schuppen daneben (Pultdach) → ein gemeinsames Dach; Satteldach → zwei; zurück → eins; abtrennen/verbinden
await ed((e) => {
  e.changeBuilding((b) => {
    const eg = b.floors.find((f) => f.id === "eg");
    eg.rooms.push({ id: "schuppen", name: "Schuppen", area_id: null, floor_material: "wood", points: [[17, 9], [19, 9], [19, 11], [17, 11]], roof: { type: "shed" } });
  });
});
R.gruppe1 = await einheiten();
const schuppenArt = (type) =>
  ed((e, type) => {
    e.changeBuilding((b) => {
      b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === "schuppen").roof.type = type;
    });
  }, type);
await schuppenArt("gable");
R.gruppe2 = await einheiten();
await schuppenArt("shed");
R.gruppe3 = await einheiten();
t.check(R.gruppe1.length === 1 && R.gruppe2.length === 2 && R.gruppe3.length === 1, `Gruppen: ${JSON.stringify([R.gruppe1, R.gruppe2, R.gruppe3])}`);
await ed((e) => {
  e.sel = { kind: "roofpart", unit: "room:eg:gartenhaus", id: 0 };
  e.tool = "select";
  e.renderBar();
  e.render();
  e.renderProps();
});
R.trennenKnopf = await ed((e) => [...e.props.querySelectorAll("[data-ract^='sep:']")].map((b) => b.dataset.ract));
await pg.locator("haus3d-panel .ed-props [data-ract='sep:schuppen']").click();
await pg.waitForTimeout(200);
R.getrennt = await einheiten();
await ed((e) => {
  e.sel = { kind: "roofpart", unit: "room:eg:schuppen", id: 0 };
  e.render();
  e.renderProps();
});
await pg.locator("haus3d-panel .ed-props [data-ract=join]").click();
await pg.waitForTimeout(200);
R.verbunden = await einheiten();
t.check(R.getrennt.length === 2 && R.verbunden.length === 1, `abtrennen/verbinden: ${JSON.stringify([R.trennenKnopf, R.getrennt, R.verbunden])}`);
// Schuppen wieder weg (das PV-Feld bleibt am Gartenhaus)
await ed((e) => {
  e.changeBuilding((b) => {
    const eg = b.floors.find((f) => f.id === "eg");
    eg.rooms = eg.rooms.filter((r) => r.id !== "schuppen");
  });
  e.sel = null;
  e.render();
  e.renderProps();
});
R.nachSchuppen = { units: await einheiten(), pv: ((await gartenhaus()).items ?? []).map((x) => x.id) };
t.check(R.nachSchuppen.pv.includes(pvId), `PV-Feld nach dem Schuppen: ${JSON.stringify(R.nachSchuppen)}`);

// 9. Bearbeiten-PIN: Norden nicht einstellbar, Hinweis auf die Admin-PIN
R.norden = await ed((e) => ({ feld: !!e.props.querySelector("[data-north]"), hinweis: [...e.props.querySelectorAll(".muted")].some((x) => x.textContent.includes("nur mit der Admin-PIN")) }));
t.check(!R.norden.feld && R.norden.hinweis, `Norden mit Bearbeiten-PIN: ${JSON.stringify(R.norden)}`);

// 10. „Hausdach“ in der Etagen-Auswahl ohne weiteren Klick: Werkzeuge der Dach-Ebene, OG, Hausdach-Formular
await pg.locator("haus3d-panel .floorsel").selectOption("__roof");
await pg.waitForTimeout(400);
R.hausdach = await ed((e) => ({
  roofadd: !!e.root.querySelector(".ed-bar [data-tool=roofadd]"),
  floor: e.floorId,
  roofMode: e.roofMode,
  haus: !!e.svg.querySelector("[data-unit=house]"),
  cross: !!e.props.querySelector("[data-rr=direction] option[value=cross]"),
  first: !!e.props.querySelector("[data-rr=direction]"),
}));
await feld("[data-rn=pitch]", 80);
R.hausdach.pitch = await ed((e) => e.b.settings.roof.pitch);
t.check(R.hausdach.roofadd && R.hausdach.roofMode && R.hausdach.floor === "og" && R.hausdach.haus && R.hausdach.first && !R.hausdach.cross && R.hausdach.pitch === 60, `Hausdach: ${JSON.stringify(R.hausdach)}`);

// 11. Etage „EG“ wählen: Plan-Werkzeuge, Knopf nicht gewählt; Raum-Eigenschaften „Im Dach bearbeiten“
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.waitForTimeout(300);
R.zurueck = await ed((e) => ({ roofMode: e.roofMode, knopf: e.root.querySelector(".ed-bar [data-act=roofmode]").classList.contains("sel"), rect: !!e.root.querySelector(".ed-bar [data-tool=rect]") }));
t.check(!R.zurueck.roofMode && !R.zurueck.knopf && R.zurueck.rect, `Etage EG: ${JSON.stringify(R.zurueck)}`);
await ed((e) => {
  e.sel = { kind: "room", id: "gartenhaus" };
  e.render();
  e.renderProps();
});
await pg.locator("haus3d-panel .ed-props [data-rract=edit]").click();
await pg.waitForTimeout(300);
R.imDach = await ed((e) => ({ roofMode: e.roofMode, sel: e.sel }));
t.check(R.imDach.roofMode && R.imDach.sel?.unit === "room:eg:gartenhaus", `Im Dach bearbeiten: ${JSON.stringify(R.imDach)}`);

// 12. Editor-3D auf dem OG: das Dach des Gartenhauses (EG) bleibt sichtbar
await pg.locator("haus3d-panel .floorsel").selectOption("og");
await pg.waitForTimeout(200);
await pg.locator("haus3d-panel .ed-bar button[data-view='split']").click();
await pg.waitForTimeout(1500);
R.editor3d = await ed((e) => {
  const s = e.scene3d;
  return { filter: s?.filter, has: !!s?.roofUnitGroups?.has("room:eg:gartenhaus"), shown: !!s?.roofKeyShown("room:eg:gartenhaus") };
});
t.check(R.editor3d.filter === "og" && R.editor3d.has && R.editor3d.shown, `Editor-3D: ${JSON.stringify(R.editor3d)}`);

// 13. Speichern: PV-Feld auf dem Gartenhaus mit Kenndaten, keine alten Module
await pg.locator("haus3d-panel .ed-bar [data-act=save]").click();
await pg.waitForTimeout(2500);
R.szene = await E((id) => {
  const p = window.panel;
  const s = p._scene;
  // alte Module (Balkonkraftwerk ohne PV-Feld): Gruppen der Ebene „solar“ ohne eines der PV-Felder
  const felder = new Set([...s.pvFields.values()].map((f) => f.mesh));
  let alt = 0;
  s.root.traverse((o) => {
    if (o.userData.layer !== "solar") return;
    let feld = false;
    o.traverse((q) => (feld ||= felder.has(q)));
    if (!feld && o.children.length) alt++;
  });
  return { editor: !!p._editor, pv: s.pvFields.has(id), key: s.pvFields.get(id)?.roofKey, group: s.roofUnitGroups.has("room:eg:gartenhaus"), name: p._pvInfo?.get(id)?.name ?? null, alt };
}, pvId);
t.check(!R.szene.editor && R.szene.pv && R.szene.key === "room:eg:gartenhaus" && R.szene.group && /· Gartenhaus$/.test(R.szene.name ?? "") && R.szene.alt === 0, `Szene: ${JSON.stringify(R.szene)}`);

// 14. Etage OG: Dach des Gartenhauses sichtbar; Etage EG: ausgeblendet (man schaut hinein)
R.filter = await E(() => {
  const p = window.panel;
  p._setFilter("og");
  const og = p._scene.roofKeyShown("room:eg:gartenhaus");
  p._setFilter("eg");
  const eg = p._scene.roofKeyShown("room:eg:gartenhaus");
  p._setFilter("all");
  return { og, eg };
});
t.check(R.filter.og && !R.filter.eg, `Etagenwahl: ${JSON.stringify(R.filter)}`);
await E(() => {
  const s = window.panel._scene;
  window.panel._els.overlay.style.visibility = "hidden";
  s.camera.position.set(25, 11, 21);
  s.controls.target.set(11, 2, 7);
  s.controls.update();
  s.invalidate();
});
await pg.waitForTimeout(1500);
await t.shot(pg, "dachebene-3d.png");

// --- 15. Dachgeschoss mit Erker (eigenes Satteldach) und einem Raum ohne Dach ---------------------------
{
  const pg2 = await t.page("dachebene-dg", "", { width: 1280, height: 800 });
  const E2 = (fn, arg) => pg2.evaluate(fn, arg);
  R.dg = await E2(async (src) => {
    const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const p = window.panel;
    const b = structuredClone(p._building);
    b.settings.roof = { type: "gable", pitch: 40, overhang: 0.4 };
    const dg = {
      id: "dg",
      name: "Dachgeschoss",
      elevation: 2.85,
      height: 2.4,
      attic: true,
      knee: 1,
      rooms: [
        { id: "dg_west", name: "Studio", area_id: null, points: rect(0, 0, 6, 8) },
        { id: "dg_ost", name: "Gäste", area_id: null, points: rect(6, 0, 11, 8) },
        { id: "erker", name: "Erker", area_id: null, points: rect(11, 3, 13, 5), roof: { type: "gable", pitch: 35, overhang: 0.3 } },
        { id: "dg_abstell", name: "Abstellraum", area_id: null, points: rect(14, 9, 17, 11) },
      ],
    };
    b.floors.push(dg);
    p._setBuilding(b, p._revision, { keepCamera: true });
    const s = p._scene;
    const { atticTop } = await import(`${src}/gable.js`);
    const { computeWalls } = await import(`${src}/walls.js`);
    const models = s._attics.get("dg");
    const { segments } = computeWalls(dg, b.settings);
    const ext = (id) => segments.filter((g) => g.kind === "exterior" && (g.roomLeft === id || g.roomRight === id));
    const tops = (id) => ext(id).flatMap((g) => atticTop(models, g, 2.85, 2.4, 1).map((x) => +x[2].toFixed(3)));
    return {
      models: models?.length ?? 0,
      keys: models?.map((m) => m.key) ?? [],
      erkerTop: s.roofUnitModels.get("room:dg:erker")?.top ?? null,
      frei: [...new Set(tops("dg_abstell"))],
      haus: [...new Set(tops("dg_west"))],
      erker: [...new Set(tops("erker"))],
    };
  }, OUT);
  t.check(R.dg.models === 2 && Math.abs(R.dg.erkerTop - 3.85) < 1e-9, `Dachgeschoss-Modelle: ${JSON.stringify(R.dg)}`);
  t.check(R.dg.frei.length === 1 && R.dg.frei[0] === 2.4 && R.dg.haus.length === 1 && R.dg.haus[0] === 1 && R.dg.erker.join() === "1", `Außenwände im Dachgeschoss: ${JSON.stringify(R.dg)}`);
  await E2(() => {
    const s = window.panel._scene;
    window.panel._els.overlay.style.visibility = "hidden";
    s.camera.position.set(24, 12, 16);
    s.controls.target.set(9, 3, 5);
    s.controls.update();
    s.invalidate();
  });
  await pg2.waitForTimeout(1500);
  await t.shot(pg2, "dachebene-erker.png");
}

// --- 16. „Kein Dach“ am Gartenhaus unter dem Hausdach mit Kanten-Anpassungen: Rückfrage --------------
{
  const pg3 = await t.page("dachebene-rueckfrage", "", { width: 1280, height: 800 });
  const E3 = (fn, arg) => pg3.evaluate(fn, arg);
  await unlock(pg3, "edit");
  await E3(() => window.panel._openEditor());
  await pg3.waitForTimeout(600);
  // 1. ohne Hausdach ist der Knopf „Dach“ trotzdem da
  R.ohneHausdach = await E3(() => ({ type: window.panel._editor.b.settings.roof.type, knopf: !!window.panel._editor.root.querySelector(".ed-bar [data-act=roofmode]") }));
  t.check(R.ohneHausdach.type === "none" && R.ohneHausdach.knopf, `Knopf ohne Hausdach: ${JSON.stringify(R.ohneHausdach)}`);
  await pg3.locator("haus3d-panel .floorsel").selectOption("eg");
  await E3(() => {
    const e = window.panel._editor;
    e.changeBuilding((b) => {
      const eg = b.floors.find((f) => f.id === "eg");
      eg.rooms.find((r) => r.id === "gartenhaus").roof = { type: "shed", pitch: 15, overhang: 0.3 };
      b.settings.roof = { type: "gable", pitch: 35, overhang: 0.4, floor: "eg", rooms: [...eg.rooms.map((r) => r.id)], adjust: [{ hi: 0.5 }] };
    });
    e.sel = { kind: "room", id: "gartenhaus" };
    e.render();
    e.renderProps();
  });
  const u0 = await E3(() => window.panel._editor.undoStack.length);
  const kein = async () => {
    await pg3.locator("haus3d-panel .ed-props [data-rrt]").selectOption("none");
    await pg3.waitForSelector("haus3d-panel .confirm-backdrop", { timeout: 3000 });
    await pg3.waitForTimeout(500);
    return E3(() => window.panel.shadowRoot.querySelector(".confirm-backdrop .ct")?.textContent ?? null);
  };
  R.frage = await kein();
  await pg3.locator("haus3d-panel .confirm-backdrop .no").click();
  await pg3.waitForTimeout(300);
  R.abbrechen = await E3(() => {
    const e = window.panel._editor;
    return { roof: e.floor.rooms.find((r) => r.id === "gartenhaus").roof?.type ?? null, auswahl: e.props.querySelector("[data-rrt]")?.value, adjust: !!e.b.settings.roof.adjust };
  });
  t.check(/deckt dann „Gartenhaus“ mit/.test(R.frage ?? "") && R.abbrechen.roof === "shed" && R.abbrechen.auswahl === "shed" && R.abbrechen.adjust, `Abbrechen: ${JSON.stringify([R.frage, R.abbrechen])}`);
  await kein();
  await pg3.locator("haus3d-panel .confirm-backdrop .yes").click();
  await pg3.waitForTimeout(300);
  R.ok = await E3((u0) => {
    const e = window.panel._editor;
    return { roof: e.floor.rooms.find((r) => r.id === "gartenhaus").roof ?? null, adjust: e.b.settings.roof.adjust ?? null, schritte: e.undoStack.length - u0 };
  }, u0);
  t.check(!R.ok.roof && !R.ok.adjust && R.ok.schritte === 1, `OK: ${JSON.stringify(R.ok)}`);
}
await t.done();
