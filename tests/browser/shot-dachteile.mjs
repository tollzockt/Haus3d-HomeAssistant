// Dachteile und eigene Dächer: Dach-Ebene ohne Hausdach, Werkzeug „Dach setzen“ (Rechteck, Punkte, Kreis, auf
// einen Raum tippen), Ecken ziehen, kaputtes Teil, Kegel- und Mansarddach, Dachterrasse mit PV-Feld und Geländer,
// Szene, Umwandeln (Terrasse und Hausdach), Turm unter einem Kegel, Dinge auf ein anderes Dach ziehen, Raum unter
// einem Dachteil und Tablet
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const R = t.results;
const SRC = "/custom_components/haus3d/frontend";

/** Helfer für eine Seite mit offenem Editor. */
function helfer(pg) {
  const E = (fn, arg) => pg.evaluate(fn, arg);
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
      return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2];
    }, sel);
  const feld = (sel, v) =>
    E(([sel, v]) => {
      const i = window.panel._editor.props.querySelector(sel);
      i.value = String(v);
      i.dispatchEvent(new Event("change"));
    }, [sel, v]);
  const ziehen = async (a, b, steps = 6) => {
    await pg.mouse.move(a[0], a[1]);
    await pg.mouse.down();
    await pg.mouse.move(b[0], b[1], { steps });
    await pg.mouse.up();
    await pg.waitForTimeout(300);
  };
  const raum = (id) => ed((e, id) => e.b.floors.find((f) => f.id === "eg").rooms.find((r) => r.id === id), id);
  const dachSetzen = async (type, mode) => {
    await ed((e) => {
      e.tool = "roofadd";
      e.sel = null;
      e.renderBar();
      e.render();
      e.renderProps();
    });
    await pg.locator(`haus3d-panel .ed-props [data-rpt=${type}]`).click();
    await pg.locator(`haus3d-panel .ed-props [data-rpm=${mode}]`).click();
  };
  return { E, ed, plan, mitteVon, feld, ziehen, raum, dachSetzen };
}

async function editor(pg, floor = "eg") {
  await unlock(pg, "edit");
  await pg.evaluate(() => window.panel._openEditor());
  await pg.waitForTimeout(700);
  await pg.locator("haus3d-panel .floorsel").selectOption(floor);
  await pg.waitForTimeout(200);
}

// --- a) bis k): Testhaus ohne Hausdach ------------------------------------------------------------------
{
  const pg = await t.page("dachteile", "", { width: 1280, height: 800 });
  const { E, ed, plan, mitteVon, feld, ziehen, raum, dachSetzen } = helfer(pg);
  await editor(pg);
  // a) „Dach“ ohne Hausdach: Dach-Ebene der Etage, kein „Hausdach“ in der Auswahl
  await pg.locator("haus3d-panel .ed-bar [data-act=roofmode]").click();
  await pg.waitForTimeout(300);
  R.a = await ed((e) => ({ roofMode: e.roofMode, floor: e.floorId, opts: [...e.root.querySelectorAll(".floorsel option")].map((o) => o.value) }));
  t.check(R.a.roofMode && R.a.floor === "eg" && !R.a.opts.includes("__roof"), `a) Dach-Ebene ohne Hausdach: ${JSON.stringify(R.a)}`);

  // b) Werkzeug „Dach setzen“: 9 Dachformen; Rechteck (0,0)→(7,5) als Satteldach
  await pg.locator("haus3d-panel .ed-bar [data-tool=roofadd]").click();
  await pg.waitForTimeout(200);
  R.b = { formen: await ed((e) => e.props.querySelectorAll("[data-rpt]").length) };
  await ziehen(await plan(0, 0), await plan(7, 5));
  Object.assign(R.b, await ed((e) => ({ roofs: (e.floor.roofs ?? []).map((p) => ({ id: p.id, type: p.type, points: p.points })), sel: e.sel, tool: e.tool })));
  t.check(R.b.formen === 9 && R.b.roofs.length === 1 && R.b.roofs[0].type === "gable" && /^part:eg:/.test(R.b.sel?.unit ?? ""), `b) Rechteck: ${JSON.stringify(R.b)}`);
  const teil = R.b.sel?.unit;

  // c) Ecke ziehen (ein Rückgängig-Schritt); Ecke auf die gegenüberliegende Kante: Umriss bleibt gültig
  const u0 = await ed((e) => e.undoStack.length);
  const v2 = await mitteVon("[data-kind=rpvertex][data-i='2']");
  await ziehen(v2, [v2[0] + 40, v2[1] + 30]);
  R.c = await ed((e, u0) => ({ points: e.floor.roofs[0].points, schritte: e.undoStack.length - u0 }), u0);
  t.check(JSON.stringify(R.c.points) !== JSON.stringify(R.b.roofs[0]?.points) && R.c.schritte === 1, `c) Ecke ziehen: ${JSON.stringify(R.c)}`);
  const v0 = await mitteVon("[data-kind=rpvertex][data-i='0']");
  const v1 = await mitteVon("[data-kind=rpvertex][data-i='1']");
  const v3 = await mitteVon("[data-kind=rpvertex][data-i='3']");
  await ziehen(v0, [(v2[0] + 40 + v3[0]) / 2, (v2[1] + 30 + v3[1]) / 2], 10);
  await ziehen(await mitteVon("[data-kind=rpvertex][data-i='0']"), [v1[0], v1[1] + 2], 10);
  R.c.gueltig = await E(async ([src]) => {
    const { validPolygon } = await import(`${src}/edit-ops.js`);
    const pts = window.panel._editor.floor.roofs[0].points;
    return { pts, ok: validPolygon(pts) };
  }, [SRC]);
  t.check(R.c.gueltig.ok, `c) Umriss nach dem Ziehen ungültig: ${JSON.stringify(R.c.gueltig)}`);
  // für die folgenden Schritte wieder das Rechteck
  await ed((e) => {
    e.changeUnit(e.sel?.unit ?? `part:eg:${e.floor.roofs[0].id}`, (p) => {
      p.points = [[0, 0], [7, 0], [7, 5], [0, 5]];
    });
  });

  // d) Kegeldach, „Auf Raum tippen“ aufs Bad
  await dachSetzen("cone", "room");
  await pg.mouse.click(...(await plan(1.5, 6.5)));
  await pg.waitForTimeout(400);
  R.d = { roof: (await raum("bad")).roof, sel: await ed((e) => e.sel) };
  t.check(R.d.roof?.type === "cone" && R.d.sel?.unit === "room:eg:bad", `d) Kegel aufs Bad: ${JSON.stringify(R.d)}`);

  // e) Dachteil als Mansarddach, Neigung oben 70 → Neigung unten angehoben, Hinweis
  await ed((e, k) => {
    e.sel = { kind: "roofpart", unit: k, id: 0 };
    e.render();
    e.renderProps();
  }, teil);
  await feld("[data-rr=type]", "mansard");
  await feld("[data-rn=pitch]", 70);
  R.e = await ed((e) => ({ part: e.floor.roofs[0], hint: e.hint.textContent }));
  t.check(R.e.part.type === "mansard" && R.e.part.pitch === 70 && R.e.part.pitch_low >= 75 && /Neigung unten wurde angehoben/.test(R.e.hint), `e) Mansarddach: ${JSON.stringify(R.e)}`);
  await feld("[data-rn=pitch]", 30);

  // f) Küche → Dachterrasse („Auf Raum tippen“): eigenes Dach des Raums, kein neues Dachteil
  await dachSetzen("terrace", "room");
  await pg.mouse.click(...(await plan(9, 2)));
  await pg.waitForTimeout(400);
  R.f = { roof: (await raum("kueche")).roof, roofs: await ed((e) => e.floor.roofs.length), sel: await ed((e) => e.sel) };
  t.check(R.f.roof?.type === "terrace" && R.f.roofs === 1 && R.f.sel?.unit === "room:eg:kueche", `f) Dachterrasse: ${JSON.stringify(R.f)}`);

  // g) PV-Feld auf der Terrasse: Ding am Raum
  await pg.locator("haus3d-panel .ed-bar [data-tool=pv]").click();
  await pg.mouse.click(...(await plan(9, 2)));
  await pg.waitForTimeout(300);
  R.g = (await raum("kueche")).roof?.items ?? [];
  t.check(R.g.length === 1 && R.g[0].type === "pv", `g) PV auf der Terrasse: ${JSON.stringify(R.g)}`);
  const pvId = R.g[0]?.id;

  // f) Raum verschieben: Terrasse und PV-Feld folgen (danach zurück)
  const bbox = () =>
    E(async ([src]) => {
      const { findUnit } = await import(`${src}/roofunits.js`);
      const u = findUnit(window.panel._editor.b, "room:eg:kueche");
      return { bbox: u?.model?.shape?.bbox ?? null, pv: u?.items[0]?.x ?? null };
    }, [SRC]);
  const vorher = await bbox();
  await ed((e) => {
    e._toggleRoofMode(false);
    e.sel = { kind: "room", id: "kueche" };
    e.nudge(0, 1);
  });
  const nachher = await bbox();
  R.f.verschoben = { vorher, nachher };
  t.check(vorher.bbox && nachher.bbox && Math.abs(nachher.bbox[1] - vorher.bbox[1] - 1) < 1e-6 && Math.abs(nachher.bbox[0] - vorher.bbox[0]) < 1e-6 && nachher.pv === vorher.pv, `f) Terrasse folgt dem Raum: ${JSON.stringify(R.f.verschoben)}`);
  await ed((e) => {
    e.undo();
    e._toggleRoofMode(true);
  });

  // h) Szene nach dem Speichern: Hüllen der Einheiten, Kegel, Geländer, kein Hausdach, PV-Feld
  await pg.locator("haus3d-panel .ed-bar [data-act=save]").click();
  await pg.waitForTimeout(2500);
  R.h = await E((pvId) => {
    const s = window.panel._scene;
    const ent = s.floors.get("eg");
    const cone = (() => {
      let n = 0;
      s.roofUnitGroups.get("room:eg:bad")?.traverse((o) => o.geometry?.type === "ConeGeometry" && n++);
      return n;
    })();
    let rail = 0;
    s.roofUnitGroups.get("room:eg:kueche")?.traverse((o) => o.userData.layer === "walls" && o.children.length && rail++);
    let nan = 0;
    s.root.traverse((o) => {
      const a = o.geometry?.attributes?.position;
      if (a && Array.from(a.array).some((v) => !Number.isFinite(v))) nan++;
    });
    return { editor: !!window.panel._editor, wrappers: ent.roofWrappers.length, keys: [...s.roofUnitGroups.keys()], cone, rail, roofMeshes: s.roofMeshes.length, unitMeshes: s.roofUnitMeshes.length, pv: s.pvFields.has(pvId), pvKey: s.pvFields.get(pvId)?.roofKey, nan };
  }, pvId);
  t.check(!R.h.editor && R.h.wrappers >= 3 && R.h.cone > 0 && R.h.rail > 0 && R.h.roofMeshes === 0 && R.h.unitMeshes > 0 && R.h.pv && R.h.pvKey === "room:eg:kueche" && R.h.nan === 0, `h) Szene: ${JSON.stringify(R.h)}`);
  const bild = async (pos, target, file) => {
    await E(([p, q]) => {
      window.panel._els.overlay.style.visibility = "hidden";
      const s = window.panel._scene;
      s.camera.position.set(...p);
      s.controls.target.set(...q);
      s.controls.update();
      s.invalidate();
    }, [pos, target]);
    await pg.waitForTimeout(1500);
    await t.shot(pg, file);
    await E(() => {
      window.panel._els.overlay.style.visibility = "";
    });
  };
  await bild([-6, 12, 18], [5, 2, 4], "dachteile-3d.png");
  await bild([15, 6.5, -4], [9, 2.6, 2], "dachterrasse.png");

  // i) Etage EG gewählt: Hüllen der Einheiten ausgeblendet (man schaut hinein)
  R.i = await E(() => {
    const p = window.panel;
    p._setFilter("eg");
    const ent = p._scene.floors.get("eg");
    const out = { hidden: ent.roofWrappers.every((w) => !w.visible), shown: p._scene.roofKeyShown("room:eg:kueche") };
    p._setFilter("all");
    out.after = p._scene.roofKeyShown("room:eg:kueche");
    return out;
  });
  t.check(R.i.hidden && !R.i.shown && R.i.after, `i) Etagenwahl: ${JSON.stringify(R.i)}`);

  // j) Terrasse in ein Dachteil umwandeln: Dinge ziehen mit
  await E(() => window.panel._openEditor());
  await pg.waitForTimeout(700);
  await pg.locator("haus3d-panel .floorsel").selectOption("eg");
  await ed((e) => e._toggleRoofMode(true, { sel: { kind: "roofpart", unit: "room:eg:kueche", id: 0 } }));
  await pg.waitForTimeout(200);
  const n0 = await ed((e) => e.floor.roofs.length);
  await pg.locator("haus3d-panel .ed-props [data-ract=toparts]").click();
  await pg.waitForTimeout(300);
  R.j = await ed((e, n0) => {
    const neu = e.floor.roofs.at(-1);
    return { plus: e.floor.roofs.length - n0, type: neu?.type, items: (neu?.items ?? []).map((x) => x.id), kueche: e.floor.rooms.find((r) => r.id === "kueche").roof ?? null, sel: e.sel };
  }, n0);
  t.check(R.j.plus === 1 && R.j.type === "terrace" && R.j.items.includes(pvId) && R.j.kueche === null && /^part:eg:/.test(R.j.sel?.unit ?? ""), `j) Terrasse umwandeln: ${JSON.stringify(R.j)}`);

  // k) freier Kegel (Kreis ziehen) → „Runden Raum darunter anlegen“
  await dachSetzen("cone", "circle");
  await ziehen(await plan(14.5, 3), await plan(15.7, 3));
  R.k = { sel: await ed((e) => e.sel), btn: await ed((e) => !!e.props.querySelector("[data-ract=tower]")) };
  await pg.locator("haus3d-panel .ed-props [data-ract=tower]").click();
  await pg.waitForTimeout(300);
  Object.assign(R.k, await ed((e) => {
    const r = e.floor.rooms.at(-1);
    return { raum: r.name, punkte: r.points.length, roof: r.roof?.type, parts: e.floor.roofs.filter((p) => p.type === "cone").length, sel: e.sel };
  }));
  t.check(R.k.btn && R.k.raum === "Turm" && R.k.punkte >= 12 && R.k.roof === "cone" && R.k.parts === 0 && R.k.sel?.unit?.startsWith("room:eg:"), `k) Turm: ${JSON.stringify(R.k)}`);
  await t.shot(pg, "dachteile-editor.png");
}

// --- c2) kaputtes Dachteil (drei Punkte auf einer Linie) ------------------------------------------------
{
  const pg = await t.page("dachteile-kaputt", "", { width: 1280, height: 800 });
  const { E, ed, mitteVon } = helfer(pg);
  const n0 = t.errors.length;
  R.c2 = await E(() => {
    const p = window.panel;
    const b = structuredClone(p._building);
    b.floors.find((f) => f.id === "eg").roofs = [{ id: "dach_kaputt", type: "gable", points: [[14, 3], [15, 3], [16, 3]] }];
    p._setBuilding(b, p._revision, { keepCamera: true });
    return { units: [...p._scene.roofUnitGroups.keys()] };
  });
  await editor(pg);
  await ed((e) => e._toggleRoofMode(true));
  await pg.waitForTimeout(300);
  Object.assign(R.c2, await ed((e) => {
    const el = e.svg.querySelector('[data-kind=roofpart][data-unit="part:eg:dach_kaputt"]');
    return { da: !!el, stroke: el?.getAttribute("stroke"), dash: !!el?.getAttribute("stroke-dasharray") };
  }));
  const k = await mitteVon('[data-kind=roofpart][data-unit="part:eg:dach_kaputt"]');
  if (k) await pg.mouse.click(k[0], k[1]);
  await pg.waitForTimeout(300);
  R.c2.text = await ed((e) => e.props.textContent);
  await pg.locator("haus3d-panel .ed-props [data-ract=del]").click();
  await pg.waitForTimeout(300);
  R.c2.danach = await ed((e) => (e.floor.roofs ?? []).length);
  t.check(t.errors.length === n0 && R.c2.units.length === 0 && R.c2.da && R.c2.stroke === "#e53935" && R.c2.dash && /zu klein oder verdreht/.test(R.c2.text) && R.c2.danach === 0, `c2) kaputtes Teil: ${JSON.stringify(R.c2)}`);
}

// --- m), n), l): L-Haus mit Satteldach -------------------------------------------------------------------
{
  const pg = await t.page("dachteile-lhaus", "?roof=gable&lhaus", { width: 1280, height: 800 });
  const { E, ed, plan, mitteVon, ziehen, dachSetzen } = helfer(pg);
  const PUNKTE = [[2, 2], [5, 1], [9, 2], [9, 6], [2, 7], [9, 10]];
  const vorher = await E(async ([src, pts]) => {
    const { roofModel, roofSurfaceAt } = await import(`${src}/exterior.js`);
    const p = window.panel;
    const s = p._scene;
    const m = roofModel(p._building);
    const a = s.anchors.find((x) => x.key === "room:eg:wohnzimmer");
    return { h: pts.map((q) => roofSurfaceAt(m, q)?.y ?? null), occ: s.occluded(a.position, "eg"), parts: m.parts.length };
  }, [SRC, PUNKTE]);
  R.l = { vorher };
  await editor(pg);
  await ed((e) => e._toggleRoofMode(true));
  await pg.waitForTimeout(300);

  // m) Kamin aufs Hausdach, freies Flachdach über dem Gartenhaus, Kamin hinüberziehen → wechselt die Einheit
  await pg.locator("haus3d-panel .ed-bar [data-tool=chimney]").click();
  await pg.mouse.click(...(await plan(3, 2)));
  await pg.waitForTimeout(300);
  const kamin = await ed((e) => e.sel?.id);
  await ed(async (e) => {
    await e._addRoofPart("flat", [[14, 9], [17, 9], [17, 11], [14, 11]]);
  });
  await pg.waitForTimeout(200);
  const flach = await ed((e) => e.sel?.unit);
  await ed((e, id) => {
    e.sel = { kind: "roofitem", unit: "house", id };
    e.tool = "select";
    e.renderBar();
    e.render();
    e.renderProps();
  }, kamin);
  const km = await mitteVon(`[data-kind=roofitem][data-id="${kamin}"]`);
  await ziehen([km[0], km[1]], await plan(15.5, 10), 12);
  R.m = await ed((e, [id, flach]) => {
    const part = e.floor.roofs.find((p) => `part:eg:${p.id}` === flach);
    return { sel: e.sel, teil: (part?.items ?? []).map((x) => x.id).includes(id), haus: (e.b.settings.roof.items ?? []).some((x) => x.id === id), hint: e.hint.textContent };
  }, [kamin, flach]);
  t.check(R.m.sel?.unit === flach && R.m.teil && !R.m.haus, `m) Kamin auf ein anderes Dach gezogen: ${JSON.stringify(R.m)}`);

  // n) Raum unter einem Dachteil: „Auf Raum tippen“ wählt das Teil; in den Raum-Eigenschaften gesperrt
  await dachSetzen("gable", "room");
  await pg.mouse.click(...(await plan(15.5, 10)));
  await pg.waitForTimeout(300);
  R.n = await ed((e) => ({ sel: e.sel, hint: e.hint.textContent, roof: e.floor.rooms.find((r) => r.id === "gartenhaus").roof ?? null }));
  await ed((e) => {
    e._toggleRoofMode(false);
    e.sel = { kind: "room", id: "gartenhaus" };
    e.render();
    e.renderProps();
  });
  R.n.gesperrt = await ed((e) => !!e.props.querySelector("[data-rrt]")?.disabled);
  t.check(R.n.sel?.unit === flach && /liegt unter dem Dachteil/.test(R.n.hint) && !R.n.roof && R.n.gesperrt, `n) Raum unter einem Dachteil: ${JSON.stringify(R.n)}`);

  // l) Hausdach in Dachteile umwandeln: Höhen gleich, ein Rückgängig stellt her
  await ed((e) => {
    e._toggleRoofMode(true);
    e.sel = null;
    e.render();
    e.renderProps();
  });
  const n0 = await ed((e) => e.floor.roofs.length);
  const u0 = await ed((e) => e.undoStack.length);
  await pg.locator("haus3d-panel .ed-props [data-ract=convert]").click();
  await pg.waitForTimeout(300);
  R.l.nach = await E(async ([src, pts, n0, u0]) => {
    const { roofUnits, surfaceAt } = await import(`${src}/roofunits.js`);
    const e = window.panel._editor;
    const models = roofUnits(e.b, "eg").filter((u) => u.model).map((u) => u.model);
    return { type: e.b.settings.roof.type, teile: e.floor.roofs.length - n0, schritte: e.undoStack.length - u0, h: pts.map((q) => surfaceAt(models, q)?.y ?? null) };
  }, [SRC, PUNKTE, n0, u0]);
  const gleich = R.l.vorher.h.every((y, i) => y != null && R.l.nach.h[i] != null && Math.abs(y - R.l.nach.h[i]) < 1e-3);
  t.check(R.l.nach.type === "none" && R.l.nach.teile === R.l.vorher.parts && R.l.nach.schritte === 1 && gleich, `l) Umwandeln: ${JSON.stringify(R.l)}`);
  await ed((e) => e.undo());
  R.l.rueck = await ed((e, n0) => ({ type: e.b.settings.roof.type, teile: e.floor.roofs.length - n0 }), n0);
  t.check(R.l.rueck.type === "gable" && R.l.rueck.teile === 0, `l) Rückgängig: ${JSON.stringify(R.l.rueck)}`);
  await ed((e) => e.redo());
  await pg.locator("haus3d-panel .ed-bar [data-act=save]").click();
  await pg.waitForTimeout(2500);
  R.l.szene = await E(() => {
    const s = window.panel._scene;
    s.setFilter("all");
    const a = s.anchors.find((x) => x.key === "room:eg:wohnzimmer");
    return { roofMeshes: s.roofMeshes.length, units: s.roofUnitMeshes.length, occ: s.occluded(a.position, "eg") };
  });
  t.check(R.l.szene.roofMeshes === 0 && R.l.szene.units > 0 && R.l.szene.occ === R.l.vorher.occ && R.l.vorher.occ, `l) Verdeckung nach dem Umwandeln: ${JSON.stringify(R.l.szene)} vorher ${R.l.vorher.occ}`);
  // Tippen aufs umgewandelte Dach schaltet keine Lampe darunter (Dachteile halten Antippen auf wie das Hausdach)
  R.l.tipp = await E(async (src) => {
    const THREE = await import(`${src}/vendor/three.module.min.js`);
    const s = window.panel._scene;
    s.camera.position.set(6, 30, 6.01);
    s.controls.target.set(6, 0, 6);
    s.controls.update();
    s.camera.updateMatrixWorld();
    let lamp = null;
    for (const entry of s.floors.values()) {
      entry.group.traverse((o) => {
        if (!lamp && o.isMesh && o.userData.entity === "light.wohnzimmer_stehlampe") lamp = o;
      });
    }
    if (!lamp) return { lamp: false };
    const q = new THREE.Box3().setFromObject(lamp).getCenter(new THREE.Vector3()).project(s.camera);
    const rect = s.renderer.domElement.getBoundingClientRect();
    return { lamp: true, pick: s.pick(rect.left + ((q.x + 1) / 2) * rect.width, rect.top + ((1 - q.y) / 2) * rect.height) };
  }, SRC);
  t.check(R.l.tipp.lamp && R.l.tipp.pick === null, `l) Tippen aufs umgewandelte Dach: ${JSON.stringify(R.l.tipp)}`);
  await E(() => {
    window.panel._els.overlay.style.visibility = "hidden";
    const s = window.panel._scene;
    s.camera.position.set(-7, 13, 20);
    s.controls.target.set(6, 2, 6);
    s.controls.update();
    s.invalidate();
  });
  await pg.waitForTimeout(1500);
  await t.shot(pg, "dachteile-umgewandelt.png");
}

// --- o) Tablet: Punkte setzen, auf einen Raum tippen, große Griffe -----------------------------------------
{
  const pg = await t.page("dachteile-tablet", "", { width: 1024, height: 768, touch: true });
  const { ed, plan, mitteVon } = helfer(pg);
  await editor(pg);
  await pg.locator("haus3d-panel .ed-bar [data-act=roofmode]").tap();
  await pg.waitForTimeout(300);
  const werkzeug = async (tool) => {
    await pg.locator("haus3d-panel .ed-bar [data-menu=tools]").tap();
    await pg.waitForTimeout(150);
    await pg.locator(`haus3d-panel .ed-menu [data-tool=${tool}]`).tap();
    await pg.waitForTimeout(200);
  };
  await werkzeug("roofadd");
  await pg.locator("haus3d-panel .ed-props [data-rpt=flat]").tap();
  await pg.locator("haus3d-panel .ed-props [data-rpm=poly]").tap();
  const n0 = await ed((e) => (e.floor.roofs ?? []).length);
  for (const [x, z] of [[1, 1], [5, 1], [5, 4], [1, 4]]) {
    const q = await plan(x, z);
    await pg.touchscreen.tap(q[0], q[1]);
    await pg.waitForTimeout(150);
  }
  await pg.locator("haus3d-panel .ed-draftbar [data-d=done]").tap();
  await pg.waitForTimeout(300);
  R.o = await ed((e, n0) => ({ plus: (e.floor.roofs ?? []).length - n0, sel: e.sel, coarse: e.coarse }), n0);
  R.o.ecke = (await mitteVon("[data-kind=rpvertex]"))?.[2] ?? 0;
  await werkzeug("roofadd");
  await pg.locator("haus3d-panel .ed-props [data-rpt=gable]").tap();
  await pg.locator("haus3d-panel .ed-props [data-rpm=room]").tap();
  const bad = await plan(1.5, 6.5);
  await pg.touchscreen.tap(bad[0], bad[1]);
  await pg.waitForTimeout(400);
  R.o.bad = await ed((e) => ({ roof: e.floor.rooms.find((r) => r.id === "bad").roof?.type ?? null, sel: e.sel }));
  R.o.griff = (await mitteVon("[data-kind=roofhandle]"))?.[2] ?? 0;
  t.check(R.o.plus === 1 && /^part:eg:/.test(R.o.sel?.unit ?? "") && R.o.bad.roof === "gable" && R.o.bad.sel?.unit === "room:eg:bad", `o) Tablet: ${JSON.stringify(R.o)}`);
  t.check(R.o.ecke >= 12.9 && R.o.griff >= 12.9, `o) Griffe am Tablet zu klein: Ecke ${R.o.ecke}, Kante ${R.o.griff}`);
  await t.shot(pg, "dachteile-tablet.png");
}

// p) keine Fehler oder Warnungen (auch keine NaN-Geometrie): t.errors bleibt leer
await t.done();
