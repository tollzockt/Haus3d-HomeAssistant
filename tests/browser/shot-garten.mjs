// Garten: Randsteine (Beton, Granit, Metall, Palisaden, Läufer) an Gartenflächen und als Linie, am Hang und an der Hauswand,
// Whirlpools offen/abgedeckt (auch mit verknüpfter Abdeckung), Eigenschaften im Editor (Randstein / Kante, Abdeckung).
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);

/** Gartenflächen mit Rand, Randstein-Linie, Hang und Whirlpools rechts und unterhalb des Hauses in die EG-Daten legen. */
const addGarden = (pg) =>
  pg.evaluate(() => {
    const p = window.panel;
    const b = structuredClone(p._building);
    const eg = b.floors.find((f) => f.id === "eg");
    const set = (id, patch) => Object.assign(eg.outdoor.find((o) => o.id === id), patch);
    set("terrasse", { edge: "granite" }); // vor dem Haus: nichts an der Hauswand
    set("beet", { edge: "palisade" });
    set("weg", { edge: "paver" });
    set("einfahrt", { edge: "concrete" });
    eg.outdoor.push(
      { id: "k_linie", type: "kerb", points: [[3, 10], [9, 10], [9, 12.5]], line: { points: [[3, 10], [9, 10], [9, 12.5]], width: 0.08 }, edge: "concrete", edge_h: 0.1 },
      { id: "k_hang", type: "lawn", points: [[14, -3.8], [19, -3.8], [19, 0], [14, 0]], heights: [0, 0, 0.4, 0.4], edge: "granite", edge_h: 0.1 },
      { id: "k_platz", type: "lawn", points: [[19.5, -6], [31, -6], [31, 6], [19.5, 6]] },
      { id: "k_beet", type: "bed", points: [[1, 9], [4, 9], [4, 11], [1, 11]], edge: "metal" },
    );
    eg.furniture = [
      ...(eg.furniture ?? []),
      { id: "m_p1", type: "hot_tub", x: 22, z: -3, rotation: 0 },
      { id: "m_p2", type: "hot_tub", x: 25.6, z: -3, rotation: 0, open: true },
      { id: "m_p3", type: "garden_hot_tub_acryl", x: 29, z: -3, rotation: 0 },
      { id: "m_p4", type: "garden_hot_tub_acryl", x: 22.6, z: 2.6, rotation: 0, entity: "cover.pool_abdeckung" },
      { id: "m_p5", type: "garden_hot_tub_acryl", x: 27.5, z: 2.6, rotation: 0, open: true, entity: "switch.pool_pumpe" },
    ];
    // Beschriftungen, Geräte und Energiekarte aus: freie Sicht auf die Randsteine
    Object.assign(p._settings.layers, { labels: false, devices: false, energy: false });
    p._applyOverlayLayers();
    p._setBuilding(b, p._revision, { keepCamera: true });
  });

/** Kamera auf einen Punkt richten (Blick von Süd-Ost). */
const look = (pg, [x, y, z], dist, [dx, dy, dz] = [0.6, 0.55, 0.9]) =>
  pg.evaluate(
    ([c, r, d]) => {
      const sc = window.panel._scene;
      const n = Math.hypot(...d);
      sc.controls.target.set(...c);
      sc.camera.position.set(c[0] + (d[0] / n) * r, c[1] + (d[1] / n) * r, c[2] + (d[2] / n) * r);
      sc.controls.update();
      sc._dirty = true;
      sc._kick?.();
    },
    [[x, y, z], dist, [dx, dy, dz]],
  );

/** Randsteine der Szene: Art, Stücke, Steine, Oberkante. */
const kerbs = (pg) =>
  pg.evaluate(() => {
    const out = [];
    window.panel._scene.scene.traverse((o) => {
      if (o.name === "kerb") out.push({ ...o.userData.kerb });
    });
    return out;
  });

// --- Standard-Stil
const pg = await t.page("garten", "?garden");
await addGarden(pg);
await pg.waitForTimeout(900);
const list = await kerbs(pg);
t.results.randsteine = list;
t.check(list.length === 7, `Randsteine in der Szene: ${list.length}`);
const byKind = (k) => list.filter((x) => x.kind === k);
t.check(byKind("granite").length === 2 && byKind("granite").some((x) => x.segments === 3), `Terrasse vor dem Haus: drei Kanten (${JSON.stringify(byKind("granite"))})`);
t.check(byKind("concrete").length === 2 && byKind("palisade").length === 1 && byKind("paver").length === 1 && byKind("metal").length === 1, `Arten: ${list.map((x) => x.kind)}`);
t.check(list.every((x) => x.blocks >= x.segments), "Steine je Kante");

await look(pg, [9, 0, 4], 34, [0.2, 1, 0.55]);
await pg.waitForTimeout(700);
await t.shot(pg, "garten-uebersicht.png");
await look(pg, [4, 0, -2], 7, [0.3, 0.7, -1]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-terrasse.png"); // Granit-Randstein an der Terrasse, an der Hauswand fehlt er
await look(pg, [-1.5, 0.1, 3], 7.5, [-0.5, 1, 0.3]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-palisaden.png");
await look(pg, [13.2, 0.1, 5.5], 6, [0, 1, 0.6]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-laeufer.png"); // Pflaster-Läufer am Weg, Beton an der Einfahrt
await look(pg, [5.5, 0.1, 10.3], 9, [0.3, 1, 0.7]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-linie.png"); // Randstein-Linie mit Gehrung und Beet mit Beton
await look(pg, [16.5, 0.2, -1.9], 7, [1, 0.35, 0.3]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-hang.png"); // Hang mit Rasenkante aus Metall

// --- Whirlpools
const tubs = await pg.evaluate(() => {
  const sc = window.panel._scene;
  const out = {};
  sc.scene.traverse((o) => {
    const id = o.userData.furniture;
    if (id?.startsWith?.("m_p") && o.parent?.userData.furniture !== id && o.userData.tub) {
      const shown = (n) => {
        for (let q = o.getObjectByName(n); q; q = q.parent) if (!q.visible) return false;
        return true;
      };
      out[id] = { cover: shown("tub:cover"), open: shown("tub:cover_open"), water: shown("tub:water"), bubbles: shown("tub:bubbles") };
    }
  });
  return out;
});
t.results.whirlpools = tubs;
t.check(tubs.m_p1?.cover && !tubs.m_p1.open && !tubs.m_p1.water, `abgedeckt: ${JSON.stringify(tubs.m_p1)}`);
t.check(!tubs.m_p2?.cover && tubs.m_p2.open && tubs.m_p2.water, `offen: ${JSON.stringify(tubs.m_p2)}`);
t.check(tubs.m_p3?.cover && !tubs.m_p3.water && !tubs.m_p5?.cover && tubs.m_p5.water, `eckig: ${JSON.stringify([tubs.m_p3, tubs.m_p5])}`);
await look(pg, [26, 0.4, 0], 15, [0.1, 0.9, 1]);
await pg.waitForTimeout(600);
await t.shot(pg, "garten-whirlpools.png");

// verknüpfte Entität: Abdeckung (cover) öffnet und schließt, Schalter an = in Betrieb (Blasen); ohne Entität gilt das Feld
const probe = () =>
  pg.evaluate(() => {
    const out = {};
    window.panel._scene.scene.traverse((o) => {
      const id = o.userData.furniture;
      if ((id === "m_p4" || id === "m_p5") && o.userData.tub && o.parent?.userData.furniture !== id) {
        const shown = (n) => {
          for (let q = o.getObjectByName(n); q; q = q.parent) if (!q.visible) return false;
          return true;
        };
        out[id] = { cover: shown("tub:cover"), open: shown("tub:cover_open"), water: shown("tub:water"), bubbles: shown("tub:bubbles") };
      }
    });
    return out;
  });
const setStates = (cover, pump) =>
  pg.evaluate(
    ([cover, pump]) => {
      const p = window.panel;
      const h = window.hass;
      const mk = (id, state, attributes = {}) => ({ entity_id: id, state, attributes, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() });
      p.hass = { ...h, states: { ...h.states, "cover.pool_abdeckung": mk("cover.pool_abdeckung", cover ? "open" : "closed", { current_position: cover ? 100 : 0 }), "switch.pool_pumpe": mk("switch.pool_pumpe", pump ? "on" : "off") } };
    },
    [cover, pump],
  );
const none = await probe(); // Entitäten gibt es (noch) nicht: Feld
t.check(none.m_p4.cover && !none.m_p4.water && none.m_p5.open && none.m_p5.water && !none.m_p5.bubbles, `ohne Entität gilt das Feld: ${JSON.stringify(none)}`);
await setStates(true, true);
await pg.waitForTimeout(500);
const live = await probe();
t.results.live = live;
t.check(live.m_p4.open && live.m_p4.water && !live.m_p4.cover && live.m_p5.bubbles && live.m_p5.water, `Abdeckung offen, Pumpe an: ${JSON.stringify(live)}`);
await look(pg, [25, 0.4, 2.6], 7, [0.3, 0.8, 1]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-whirlpool-betrieb.png");
await setStates(false, false);
await pg.waitForTimeout(500);
const zu = await probe();
t.check(zu.m_p4.cover && !zu.m_p4.water && !zu.m_p5.bubbles && zu.m_p5.water, `Abdeckung zu, Pumpe aus: ${JSON.stringify(zu)}`);

// --- Cyberpunk-Stil
await pg.evaluate(() => window.panel._scene.setStyle("cyber"));
await pg.waitForTimeout(900);
await look(pg, [9, 0, 4], 34, [0.2, 1, 0.55]);
await pg.waitForTimeout(700);
await t.shot(pg, "garten-cyber.png");
await look(pg, [4, 0, -2], 7, [0.3, 0.7, -1]);
await pg.waitForTimeout(500);
await t.shot(pg, "garten-cyber-terrasse.png");
t.check((await kerbs(pg)).length === 7, "Randsteine auch im Cyberpunk-Stil");

// --- Editor: Randstein / Kante, Linie, Abdeckung
const ed = await t.page("garten-editor", "?garden");
await addGarden(ed);
await unlock(ed, "edit");
await ed.evaluate(() => window.panel._openEditor());
await ed.waitForTimeout(400);
await ed.locator("haus3d-panel .floorsel").selectOption("eg");
const select = (kind, id) =>
  ed.evaluate(
    ([kind, id]) => {
      const e = window.panel._editor;
      e.sel = { kind, id };
      e.render();
      e.renderProps();
    },
    [kind, id],
  );
const area = (id) => ed.evaluate((id) => window.panel._editor.floor.outdoor.find((o) => o.id === id), id);
await select("outdoor", "rasen");
const fields = await ed.evaluate(() => {
  const el = window.panel._editor.props;
  return { sel: el.querySelector("[data-kerb=edge]")?.value, opts: [...(el.querySelector("[data-kerb=edge]")?.options ?? [])].map((o) => o.textContent), h: el.querySelector("[data-kerb=edge_h]")?.disabled };
});
t.results.felder = fields;
t.check(fields.sel === "none" && fields.opts.length === 6 && fields.opts[0] === "keine" && fields.h === true, `Randstein-Feld am Rasen: ${JSON.stringify(fields)}`);
t.check(await ed.evaluate(() => !!window.panel._editor.props.querySelector("[data-act=autoh]")), "Hang-Felder fehlen an der Gartenfläche");
await ed.locator("haus3d-panel .ed-props [data-kerb=edge]").selectOption("granite");
let r = await area("rasen");
t.check(r.edge === "granite" && r.edge_h === undefined, `Granit gewählt: ${JSON.stringify([r.edge, r.edge_h])}`);
await ed.locator("haus3d-panel .ed-props [data-kerb=edge_h]").fill("8");
await ed.locator("haus3d-panel .ed-props [data-kerb=edge_h]").press("Tab");
r = await area("rasen");
t.check(r.edge_h === 0.08, `Höhe 8 cm: ${r.edge_h}`);
await ed.locator("haus3d-panel .ed-props [data-kerb=edge]").selectOption("none");
r = await area("rasen");
t.check(r.edge === undefined && r.edge_h === undefined, `keine: ${JSON.stringify([r.edge, r.edge_h])}`);
// Hecke und Zaun haben das Feld nicht
await select("outdoor", "hecke");
t.check((await ed.evaluate(() => window.panel._editor.props.querySelector("[data-kerb]"))) === null, "Hecke ohne Randstein-Feld");
// Randstein-Linie: Eigenschaften mit Art, Breite, Höhe
await select("outdoor", "k_linie");
const line = await ed.evaluate(() => {
  const el = window.panel._editor.props;
  return { edge: el.querySelector("[data-la=edge]")?.value, w: el.querySelector("[data-la=width]")?.value, h: el.querySelector("[data-la=edge_h]")?.value, kerbField: !!el.querySelector("[data-kerb]"), hang: !!el.querySelector("[data-act=autoh], [data-h]") || /Hang:/.test(el.textContent) };
});
t.results.linie = line;
t.check(line.edge === "concrete" && line.w === "0.08" && line.h === "0.1" && !line.kerbField, `Randstein-Linie: ${JSON.stringify(line)}`);
t.check(!line.hang, "Randstein-Linie bietet Hang-Felder an (der Randstein liegt immer auf der Etage)");
// Randstein-Linie mit den Pfeiltasten verschieben: Mittellinie, Fläche und der 3D-Randstein wandern zusammen
const kerbX = () =>
  ed.evaluate(async () => {
    const THREE = await import("../../custom_components/haus3d/frontend/vendor/three.module.min.js");
    let best = null;
    window.panel._editor.scene3d.root.traverse((o) => {
      if (o.name !== "kerb") return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.getSize(new THREE.Vector3()).x > 5 && b.min.z > 9.8 && b.max.z < 12.7) best = [b.min.x, b.max.x];
    });
    return best;
  });
await ed.waitForTimeout(400);
const k0 = await kerbX();
const a0 = await area("k_linie");
await ed.evaluate(() => window.panel._editor.nudge(0.5, 0));
await ed.waitForTimeout(500);
const a1 = await area("k_linie");
const k1 = await kerbX();
t.results.kerbVerschoben = { k0, k1, line: a1.line.points[0], pts: a1.points[0] };
t.check(Math.abs(a1.line.points[0][0] - a0.line.points[0][0] - 0.5) < 1e-6 && Math.abs(a1.points[0][0] - a0.points[0][0] - 0.5) < 1e-6, `Linie verschoben: ${JSON.stringify([a0.line.points[0], a1.line.points[0], a1.points[0]])}`);
t.check(k0 && k1 && Math.abs(k1[0] - k0[0] - 0.5) < 0.01 && Math.abs(k1[1] - k0[1] - 0.5) < 0.01, `3D-Randstein verschoben: ${JSON.stringify([k0, k1])}`);
await ed.evaluate(() => window.panel._editor.nudge(-0.5, 0));
await ed.locator("haus3d-panel .ed-props [data-la=edge]").selectOption("palisade");
r = await area("k_linie");
t.check(r.edge === "palisade" && r.type === "kerb" && r.line.points.length === 3, `Art der Linie: ${JSON.stringify([r.edge, r.type])}`);
// Linien-Werkzeug: Randstein neben den anderen Arten, Art wählbar
await ed.locator("haus3d-panel .ed-bar button[data-tool=line]").click();
const tool = await ed.evaluate(() => {
  const el = window.panel._editor.props;
  return { kinds: [...el.querySelectorAll("[data-linekind] button")].map((b) => b.textContent) };
});
t.results.werkzeug = tool;
t.check(tool.kinds.join() === "Weg,Hecke,Zaun,Mauer,Randstein", `Linienarten: ${tool.kinds}`);
await ed.locator("haus3d-panel .ed-props [data-linekind] [data-k=kerb]").click();
const kerbTool = await ed.evaluate(() => {
  const el = window.panel._editor.props;
  return { edge: el.querySelector("[data-lo=edge]")?.value, w: el.querySelector("[data-lo=width]")?.value, h: el.querySelector("[data-lo=height]")?.value };
});
t.check(kerbTool.edge === "concrete" && kerbTool.w === "0.08" && kerbTool.h === "0.1", `Werkzeug Randstein: ${JSON.stringify(kerbTool)}`);
await t.shot(ed, "garten-editor-linie.png");
// Whirlpool: Feld Abdeckung
await ed.locator("haus3d-panel .ed-bar button[data-tool=select]").click();
await select("furniture", "m_p3");
const cover = await ed.evaluate(() => {
  const el = window.panel._editor.props;
  return { val: el.querySelector("[data-garden-open]")?.value, opts: [...(el.querySelector("[data-garden-open]")?.options ?? [])].map((o) => o.textContent) };
});
t.results.abdeckung = cover;
t.check(cover.val === "0" && cover.opts.join() === "abgedeckt,offen", `Abdeckung-Feld: ${JSON.stringify(cover)}`);
await ed.locator("haus3d-panel .ed-props [data-garden-open]").selectOption("1");
const m3 = await ed.evaluate(() => window.panel._editor.floor.furniture.find((m) => m.id === "m_p3"));
t.check(m3.open === true, `offen gespeichert: ${m3.open}`);
await select("furniture", "m_p1");
t.check((await ed.evaluate(() => window.panel._editor.props.querySelector("[data-garden-open]")?.value)) === "0", "auch am aufblasbaren Whirlpool");
await select("furniture", "m_p2");
t.check((await ed.evaluate(() => window.panel._editor.props.querySelector("[data-garden-open]")?.value)) === "1", "offen angezeigt");
await t.shot(ed, "garten-editor-abdeckung.png");
await t.done();
