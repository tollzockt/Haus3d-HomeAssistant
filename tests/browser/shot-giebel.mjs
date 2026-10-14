// Giebel im Dachgeschoss: Fenster und Türen in der Giebelwand bekommen ein Loch mit Laibung im Giebel des
// Hausdachs, Öffnungen in Traufwänden enden am Kniestock, zu hohe werden ausgeblendet; nichts sticht durchs Dach
// (Satteldach, Pultdach, Walmdach, verschobene Giebel, geschlossene Rollläden an der Traufe, Giebelwand mit
// bündigem Streifen neben einem Anbau), Hinweise im Editor, Haus ohne Dachgeschoss wie bisher
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const R = t.results;
const pg = await t.page("giebel", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);

// Dachgeschoss über dem EG (11 × 8 m): Satteldach 40°, First entlang x, Giebel im Westen (x = 0) und Osten (x = 11)
await E(() => {
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  // anbau: Raum mit Flachdach vor dem Ostgiebel – die Giebelwand setzt dort eine Innenwand gerade fort (bündiger
  // Streifen in Raumfarbe), Giebelfenster und -tür daneben
  window.giebelHaus = (roof = {}, { openings = true, anbau = false } = {}) => {
    const b = structuredClone(window.panel._building);
    b.settings = { ...b.settings, roof: { type: "gable", pitch: 40, overhang: 0.4, ...roof } };
    b.floors = b.floors.filter((f) => f.id !== "dg");
    b.floors.push({
      id: "dg",
      name: "Dachgeschoss",
      elevation: 2.85,
      height: 2.4,
      attic: true,
      knee: 1,
      rooms: [
        { id: "dg_west", name: "Studio", area_id: null, points: rect(0, 0, 6, 8) },
        { id: "dg_ost", name: "Gäste", area_id: null, points: rect(6, 0, 11, 8) },
      ],
      openings: openings
        ? [
            { id: "dg_giebel_fenster", type: "window", room_id: "dg_west", edge: 3, offset: 4, width: 1, height: 1.4, sill: 0.9 },
            { id: "dg_giebel_tuer", type: "door", room_id: "dg_ost", edge: 1, offset: 4, width: 1, height: 2.1, sill: 0 },
            { id: "dg_traufe_fenster", type: "window", room_id: "dg_west", edge: 0, offset: 3, width: 1, height: 1.2, sill: 0.5 },
            { id: "dg_traufe_tuer", type: "door", room_id: "dg_ost", edge: 0, offset: 2.5, width: 0.9, height: 2.1, sill: 0 },
            { id: "dg_fenster_hoch", type: "window", room_id: "dg_west", edge: 2, offset: 3, width: 0.8, height: 0.5, sill: 1.6 },
            { id: "dg_innen_tuer", type: "door", room_id: "dg_west", edge: 1, offset: 1.2, width: 0.9, height: 2.1, sill: 0 },
          ]
        : [],
    });
    if (anbau) {
      const dg = b.floors.at(-1);
      dg.rooms.push({ id: "dg_anbau", name: "Anbau", area_id: null, points: rect(11, 3, 13, 5), roof: { type: "flat" } });
      dg.openings = dg.openings.filter((o) => o.id !== "dg_giebel_tuer");
      dg.openings.push(
        { id: "dg_giebel_fenster2", type: "window", room_id: "dg_ost", edge: 1, offset: 1.6, width: 1, height: 1.4, sill: 0.9 },
        { id: "dg_giebel_tuer2", type: "door", room_id: "dg_ost", edge: 1, offset: 6.4, width: 1, height: 2.1, sill: 0 },
      );
    }
    return b;
  };
  // Haus setzen und messen: Giebel mit Löchern, sichtbare Öffnungen, Dach-Meshes, NaN, Höhen unter dem Dach
  // zu: Rollläden ganz geschlossen und sichtbar mitmessen
  window.giebelMessen = async (b, { zu = false } = {}) => {
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const { roofSurfaceAt } = await import("/custom_components/haus3d/frontend/exterior.js");
    const { computeWalls, pointInPolygon } = await import("/custom_components/haus3d/frontend/walls.js");
    const p = window.panel;
    p._setBuilding(b, p._revision, { keepCamera: true });
    const s = p._scene;
    s.setFilter("all");
    s.root.updateMatrixWorld(true);
    const ent = s.floors.get("dg");
    if (zu) {
      for (const it of ent.openings.values()) {
        if (!it.blind) continue;
        it.blind.visible = true;
        it.blind.scale.y = 1;
      }
      s.root.updateMatrixWorld(true);
    }
    const rooms = b.floors.find((f) => f.id === "dg").rooms;
    const inRoom = (x, z) => rooms.some((r) => pointInPolygon([x, z], r.points));
    const model = s.roofModel;
    const v = new THREE.Vector3();
    const worst = { out: -Infinity, in: -Infinity };
    let nan = 0;
    // Höhe jedes Punkts gegen die Dachfläche darüber (außen 0,02, innen 0,04 Spielraum)
    const shown = (o) => {
      for (let q = o; q; q = q.parent) if (!q.visible) return false;
      return true;
    };
    const probe = (obj) => {
      obj.traverse((o) => {
        const pos = o.isMesh && shown(o) ? o.geometry?.attributes?.position : null;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (![v.x, v.y, v.z].every(Number.isFinite)) {
            nan++;
            continue;
          }
          const hit = model ? roofSurfaceAt(model, [v.x, v.z]) : null;
          if (!hit || !Number.isFinite(hit.y)) continue;
          const k = inRoom(v.x, v.z) ? "in" : "out";
          worst[k] = Math.max(worst[k], v.y - hit.y);
        }
      });
    };
    for (const o of ent.group.children) if (o.userData.layer === "walls" && o.isMesh) probe(o);
    const hidden = [];
    const tops = {};
    for (const [id, it] of ent.openings) {
      if (!it.group.visible) {
        hidden.push(id);
        continue;
      }
      probe(it.group);
      const box = new THREE.Box3().setFromObject(it.group);
      tops[id] = { y0: +(box.min.y - 2.85).toFixed(3), y1: +(box.max.y - 2.85).toFixed(3) };
    }
    s.root.traverse((o) => {
      const a = o.geometry?.attributes?.position;
      if (a && o !== s.root && Array.from(a.array).some((x) => !Number.isFinite(x))) nan++;
    });
    const segs = computeWalls(b.floors.find((f) => f.id === "dg"), b.settings).segments;
    return {
      flush: segs.filter((g) => g.flush > 0).length,
      gables: s._gables.map((g) => [g.key, g.holes.length]),
      hidden,
      tops,
      roof: s.roofMeshes.length,
      worst: { out: +worst.out.toFixed(4), in: +worst.in.toFixed(4) },
      nan,
      attic: s._attic?.floor?.id ?? null,
    };
  };
  // Strahl von außen waagerecht (Plan-Richtung dir) nur gegen Dach und Dachgeschoss: was trifft er zuerst?
  window.giebelStrahl = async (from, dir, y) => {
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const s = window.panel._scene;
    s.root.updateMatrixWorld(true);
    const ent = s.floors.get("dg");
    const rc = new THREE.Raycaster(new THREE.Vector3(from[0], y, from[1]), new THREE.Vector3(dir[0], 0, dir[1]).normalize());
    const hits = rc.intersectObjects([...s.roofMeshes, ent.group], true).filter((h) => h.object.visible);
    const first = hits[0];
    if (!first) return null;
    if (s.roofMeshes.includes(first.object)) return "dach";
    for (const [id, it] of ent.openings) {
      let found = false;
      it.group.traverse((o) => (found ||= o === first.object));
      if (found) return id;
    }
    return first.object.userData.layer ?? "anderes";
  };
});
const messen = (roof, opts, mopts) => E(([roof, opts, mopts]) => window.giebelMessen(window.giebelHaus(roof, opts), mopts), [roof, opts ?? {}, mopts ?? {}]);
const strahl = (from, dir, y) => E(([f, d, y]) => window.giebelStrahl(f, d, y), [from, dir, y]);
const mitte = (id) =>
  E(async (id) => {
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const it = window.panel._scene.floors.get("dg").openings.get(id);
    const c = new THREE.Box3().setFromObject(it.group).getCenter(new THREE.Vector3());
    return [c.x, c.y, c.z];
  }, id);
// Bild ohne Beschriftungen (die Schilder verdecken sonst die Giebel)
const kamera = async (pos, target, file) => {
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

// --- Satteldach 40° ---------------------------------------------------------------------------------
R.ohneOeffnungen = await messen({}, { openings: false });
R.sattel = await messen({});
const sat = R.sattel;
t.check(sat.attic === "dg", `Dachgeschoss nicht erkannt: ${sat.attic}`);
t.check(JSON.stringify(sat.gables) === JSON.stringify([["0:lo", 1], ["0:hi", 1]]), `Giebel-Löcher: ${JSON.stringify(sat.gables)}`);
t.check(sat.roof === R.ohneOeffnungen.roof && sat.roof > 0, `Zahl der Dach-Meshes: ${sat.roof} mit, ${R.ohneOeffnungen.roof} ohne Öffnungen`);
t.check(sat.hidden.length === 1 && sat.hidden[0] === "dg_fenster_hoch", `ausgeblendet: ${sat.hidden}`);
t.check(sat.tops.dg_traufe_tuer && sat.tops.dg_traufe_tuer.y1 <= 1.001, `Traufentür höher als der Kniestock: ${JSON.stringify(sat.tops.dg_traufe_tuer)}`);
t.check(sat.tops.dg_traufe_fenster && sat.tops.dg_traufe_fenster.y1 <= 1.001, `Traufenfenster höher als der Kniestock: ${JSON.stringify(sat.tops.dg_traufe_fenster)}`);
t.check(sat.tops.dg_giebel_fenster?.y1 > 2.2 && sat.tops.dg_giebel_tuer?.y1 > 2, `Giebelöffnungen gekürzt: ${JSON.stringify([sat.tops.dg_giebel_fenster, sat.tops.dg_giebel_tuer])}`);
t.check(sat.worst.out <= 0.02 && sat.worst.in <= 0.04, `Höhen über dem Dach (Satteldach): ${JSON.stringify(sat.worst)}`);
t.check(sat.nan === 0, `NaN in der Geometrie: ${sat.nan}`);
// Strahlen von außen: Giebelfenster (West) und Giebeltür (Ost) getroffen, daneben das Dach (Giebel)
const gf = await mitte("dg_giebel_fenster");
const gt = await mitte("dg_giebel_tuer");
const yt = 2.85 + 1.6; // Tür oberhalb des Kniestocks
R.strahl = {
  fenster: await strahl([-6, gf[2]], [1, 0], gf[1]),
  fensterDaneben: await strahl([-6, gf[2] + 1.6], [1, 0], gf[1]),
  tuer: await strahl([17, gt[2]], [-1, 0], yt),
  tuerDaneben: await strahl([17, gt[2] - 1.6], [-1, 0], yt),
};
t.check(R.strahl.fenster === "dg_giebel_fenster" && R.strahl.tuer === "dg_giebel_tuer", `Giebelöffnungen von außen nicht getroffen: ${JSON.stringify(R.strahl)}`);
t.check(R.strahl.fensterDaneben === "dach" && R.strahl.tuerDaneben === "dach", `neben den Öffnungen kein Giebel: ${JSON.stringify(R.strahl)}`);
await kamera([-12, 6, 4], [4, 3.8, 4], "giebel-west.png");
await kamera([23, 6, 4], [7, 3.8, 4], "giebel-ost.png");
// Rollläden geschlossen: der Behang vor dem Traufenfenster bleibt unter der Dachfläche davor
R.zu = await messen({}, {}, { zu: true });
t.check(R.zu.worst.out <= 0.02 && R.zu.worst.in <= 0.04 && R.zu.nan === 0, `Rollläden zu: ${JSON.stringify([R.zu.worst, R.zu.nan])}`);

// --- Giebelwand mit bündigem Streifen (Anbau mit Flachdach davor): Löcher, Höhen, keine NaN ----------------
R.anbau = await messen({}, { anbau: true });
const an = R.anbau;
t.check(an.flush >= 2, `bündige Streifen am Ostgiebel: ${an.flush}`);
t.check(JSON.stringify(an.gables) === JSON.stringify([["0:lo", 1], ["0:hi", 2]]), `Giebel-Löcher neben dem Streifen: ${JSON.stringify(an.gables)}`);
t.check(!an.hidden.includes("dg_giebel_fenster2") && !an.hidden.includes("dg_giebel_tuer2") && an.tops.dg_giebel_fenster2?.y1 > 1.5 && an.tops.dg_giebel_tuer2?.y1 > 1.5, `Giebelöffnungen neben dem Streifen: ${JSON.stringify([an.hidden, an.tops.dg_giebel_fenster2, an.tops.dg_giebel_tuer2])}`);
t.check(an.worst.out <= 0.02 && an.worst.in <= 0.04 && an.nan === 0, `Anbau: ${JSON.stringify([an.worst, an.nan])}`);
const an2 = await mitte("dg_giebel_fenster2");
R.strahlAnbau = await strahl([17, an2[2]], [-1, 0], an2[1]);
t.check(R.strahlAnbau === "dg_giebel_fenster2", `Giebelfenster neben dem Streifen von außen: ${R.strahlAnbau}`);
await kamera([20, 5, 0], [10, 3.8, 3], "giebel-anbau.png");

// --- Pultdach 20° (Giebel an beiden Enden und hohe Wand) und Walmdach 40° (keine Giebel) -------------
R.pult = await messen({ type: "shed", pitch: 20 });
t.check(R.pult.gables.map((g) => g[0]).join() === "0:lo,0:hi,0:high" && R.pult.gables[0][1] === 1 && R.pult.gables[1][1] === 1, `Pultdach-Giebel: ${JSON.stringify(R.pult.gables)}`);
t.check(R.pult.worst.out <= 0.02 && R.pult.worst.in <= 0.04 && R.pult.nan === 0, `Pultdach: ${JSON.stringify([R.pult.worst, R.pult.nan])}`);
await kamera([-8, 9, -9], [5.5, 3.5, 4], "giebel-pult.png");
R.walm = await messen({ type: "hip", pitch: 40 });
t.check(R.walm.gables.length === 0, `Walmdach mit Giebeln: ${JSON.stringify(R.walm.gables)}`);
t.check(R.walm.worst.out <= 0.02 && R.walm.worst.in <= 0.04 && R.walm.nan === 0, `Walmdach: ${JSON.stringify([R.walm.worst, R.walm.nan])}`);
t.check(R.walm.tops.dg_giebel_tuer?.y1 <= 1.001, `Walmdach: Tür an der Stirnseite über dem Kniestock: ${JSON.stringify(R.walm.tops.dg_giebel_tuer)}`);

// --- Giebel verschoben (Kanten-Anpassung am Westende) -------------------------------------------------
R.weiter = await messen({ adjust: [{ lo: 0.3 }] }); // 0,3 m vor der Wand: Loch mit tiefer Laibung
R.fern = await messen({ adjust: [{ lo: 1.5 }] }); // weit vor der Wand: kein Loch, Fenster unter dem Überstand
R.innen = await messen({ adjust: [{ lo: -0.6 }] }); // hinter der Wand: Außenwand bis zum Kniestock
t.check(R.weiter.gables[0]?.[1] === 1, `Giebel +0,3: ${JSON.stringify(R.weiter.gables)}`);
t.check(R.fern.gables[0]?.[1] === 0 && R.fern.gables[1]?.[1] === 1, `Giebel +1,5: ${JSON.stringify(R.fern.gables)}`);
t.check(R.innen.gables[0]?.[1] === 0 && (R.innen.tops.dg_giebel_fenster?.y1 ?? 0) <= 1.001, `Giebel −0,6: ${JSON.stringify([R.innen.gables, R.innen.tops.dg_giebel_fenster, R.innen.hidden])}`);
for (const k of ["weiter", "fern", "innen"]) t.check(R[k].worst.out <= 0.02 && R[k].worst.in <= 0.04 && R[k].nan === 0, `${k}: ${JSON.stringify([R[k].worst, R[k].nan])}`);

// --- Editor: Hinweise an Fenstern und Türen ------------------------------------------------------------
await messen({});
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(600);
await pg.locator("haus3d-panel .floorsel").selectOption("dg");
await pg.waitForTimeout(200);
const hinweis = (id) =>
  E((id) => {
    const e = window.panel._editor;
    e.sel = { kind: "opening", id };
    e.render();
    e.renderProps();
    return [...e.props.querySelectorAll(".muted")].map((x) => x.textContent).filter((x) => /3D/.test(x));
  }, id);
R.hinweise = { traufe: await hinweis("dg_traufe_fenster"), hoch: await hinweis("dg_fenster_hoch"), giebel: await hinweis("dg_giebel_fenster"), tuer: await hinweis("dg_giebel_tuer") };
const tr = R.hinweise.traufe.join(" ");
t.check(tr.includes("Außenwand unter der Dachschräge") && tr.includes("1,00 m") && !tr.includes("Gaube"), `Hinweis Traufe: ${tr}`);
t.check(R.hinweise.hoch.join(" ").includes("wird in 3D nicht gezeigt"), `Hinweis hohes Fenster: ${R.hinweise.hoch}`);
t.check(R.hinweise.giebel.length === 0 && R.hinweise.tuer.length === 0, `Giebel mit Hinweis: ${JSON.stringify([R.hinweise.giebel, R.hinweise.tuer])}`);
await E(() => {
  const e = window.panel._editor;
  e.sel = { kind: "opening", id: "dg_traufe_fenster" };
  e.render();
  e.renderProps();
});
await t.shot(pg, "giebel-editor.png");
await E(() => window.panel._editor.root.querySelector(".ed-bar [data-act=cancel]").click());
await pg.waitForTimeout(400);

// --- Haus ohne Dachgeschoss: keine Giebel-Löcher, Öffnungen in voller Höhe ------------------------------
R.ohneDg = await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.floors = b.floors.filter((f) => f.id !== "dg");
  b.settings.roof = { type: "gable", pitch: 40, overhang: 0.4 };
  p._setBuilding(b, p._revision, { keepCamera: true });
  const s = p._scene;
  const eg = b.floors.find((f) => f.id === "eg");
  const ent = s.floors.get("eg");
  const off = [];
  for (const o of eg.openings ?? []) {
    const it = ent.openings.get(o.id);
    if (!it?.group.visible) {
      off.push(o.id);
      continue;
    }
    const want = Math.min(o.height, (eg.height ?? 2.5) - Math.min(o.sill ?? 0, eg.height ?? 2.5));
    if (Math.abs(it.blindHeight - want) > 1e-6) off.push(`${o.id}:${it.blindHeight}≠${want}`);
  }
  return { gables: s._gables.length, attic: s._attic, attics: s._attics.size, off, roof: s.roofMeshes.length };
});
t.check(R.ohneDg.gables === 0 && R.ohneDg.attic === null && R.ohneDg.attics === 0 && R.ohneDg.off.length === 0 && R.ohneDg.roof > 0, `Haus ohne Dachgeschoss: ${JSON.stringify(R.ohneDg)}`);
await t.done();
