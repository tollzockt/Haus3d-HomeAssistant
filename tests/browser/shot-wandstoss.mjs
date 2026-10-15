// Wandstöße und Wand-Oberkanten unter dem Dach ohne Haarlinien: verdeckte Stirn-, Seiten- und Deckflächen fallen weg
// (T-Stoß, gerade weiterlaufende Wand, Stufen unter der Dachschräge), Stoßfugen ohne Lichtpunkte (T-Stellen),
// keine Deckfläche in der Bodenfläche unter der Türschwelle, keine Fuge zwischen den Etagen (Deckel nur bei
// ausgeblendeter Etage darüber), keine Wandkante, die durchs Dach blitzt (Satteldach, Walmdach, Pultdach).
// Glatte Wände und Böden ohne Textur, ohne Möbel, feste Sonne.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const R = t.results;
const pg = await t.page("wandstoss", "?sun=180,45", { width: 1000, height: 750 });
const E = (fn, arg) => pg.evaluate(fn, arg);

await E(() => {
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const plain = (b) => {
    b.settings = { ...b.settings, wall_textures: { exterior: "none", interior: "none" } };
    for (const f of b.floors) for (const r of f.rooms ?? []) Object.assign(r, { floor_texture: "none", floor_material: "tile" });
    for (const f of b.floors) f.furniture = []; // freie Sicht auf Wände und Böden
    return b;
  };
  const base = structuredClone(window.panel._building);
  // EG und KG des Beispielhauses ohne Dach
  window.wsEg = () => plain({ ...structuredClone(base), settings: { ...base.settings, roof: { type: "none" } } });
  // dazu ein Dachgeschoss (Kniestock 1 m) mit Innenwänden und einer freien Wand
  window.wsDg = (roof = {}) => {
    const b = plain(structuredClone(base));
    b.settings.roof = { type: "gable", pitch: 40, overhang: 0.4, texture: "none", ...roof };
    b.floors.push({
      id: "dg", name: "Dachgeschoss", elevation: 2.85, height: 2.4, attic: true, knee: 1,
      rooms: [
        { id: "dg_west", name: "Studio", area_id: null, points: rect(0, 0, 6, 8), floor_texture: "none" },
        { id: "dg_ost", name: "Gäste", area_id: null, points: rect(6, 0, 11, 4), floor_texture: "none" },
        { id: "dg_bad", name: "Bad", area_id: null, points: rect(6, 4, 11, 8), floor_texture: "none" },
      ],
      openings: [
        { id: "dg_innen_tuer", type: "door", room_id: "dg_west", edge: 1, offset: 1.2, width: 0.9, height: 2.1, sill: 0 },
        { id: "dg_giebel_fenster", type: "window", room_id: "dg_west", edge: 3, offset: 4, width: 1, height: 1.4, sill: 0.9 },
      ],
      walls: [{ id: "fw1", a: [3, 0], b: [3, 3] }],
    });
    return b;
  };
  window.wsSet = (b) => {
    window.wsHaus = null; // welches Haus steht (lines baut nur bei Wechsel neu)
    window.panel._setBuilding(b, window.panel._revision, { keepCamera: true });
  };
  let W = 1000; // Bildgröße (wsLines: je Aufruf wählbar)
  let H = 750;
  const view = (pos, target, fov, filter) => {
    const s = window.panel._scene;
    window.panel._els.overlay.style.visibility = "hidden";
    s.setFilter(filter);
    s.renderer.setPixelRatio(1);
    s.renderer.setSize(W, H, false);
    s.camera.aspect = W / H;
    s.camera.fov = fov;
    s.camera.position.set(...pos);
    s.controls.target.set(...target);
    s.controls.update();
    s.camera.updateProjectionMatrix();
    s.camera.updateMatrixWorld(true);
    return s;
  };
  const read = (s) => {
    s.renderer.render(s.scene, s.camera);
    const gl = s.renderer.getContext();
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  // Haarlinien in einer glatten Fläche (Weltviereck quad, [x, y, z] je Ecke): Bildpunkte im Viereck, die um mehr als
  // tol vom Median ihrer 5×5-Umgebung abweichen
  window.wsLines = async (pos, target, fov, filter, quad, tol = 4, size = [1000, 750]) => {
    [W, H] = size ?? [window.panel._scene.renderer.domElement.width, window.panel._scene.renderer.domElement.height]; // null: Bildgröße des Panels
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const s = view(pos, target, fov, filter);
    const px = read(s);
    s.resize();
    const lum = (x, y) => {
      const k = ((H - 1 - y) * W + x) * 4;
      return 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];
    };
    const P = quad.map((p) => {
      const q = new THREE.Vector3(...p).project(s.camera);
      return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H];
    });
    const inside = (x, y) => {
      let sgn = 0;
      for (let i = 0; i < P.length; i++) {
        const [a, b] = [P[i], P[(i + 1) % P.length]];
        const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        if (Math.abs(c) < 1e-9) continue;
        if (sgn && Math.sign(c) !== sgn) return false;
        sgn = Math.sign(c);
      }
      return true;
    };
    const xs = P.map((p) => p[0]);
    const ys = P.map((p) => p[1]);
    let n = 0;
    let bad = 0;
    let worst = 0;
    let sum = 0;
    for (let y = Math.max(3, Math.ceil(Math.min(...ys))); y <= Math.min(H - 4, Math.floor(Math.max(...ys))); y++) {
      for (let x = Math.max(3, Math.ceil(Math.min(...xs))); x <= Math.min(W - 4, Math.floor(Math.max(...xs))); x++) {
        if (!inside(x, y)) continue;
        const v = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) v.push(lum(x + dx, y + dy));
        v.sort((p, q) => p - q);
        const d = Math.abs(lum(x, y) - v[12]);
        n++;
        worst = Math.max(worst, d);
        sum += lum(x, y);
        if (d > tol) bad++;
      }
    }
    return { n, bad, worst: Math.round(worst * 10) / 10, mean: n ? Math.round((sum / n) * 10) / 10 : null };
  };
  // Wände, die durchs Dach blitzen: Bildpunkte, an denen ohne Wände das Dach vorn liegt, mit Wänden aber anders aussehen
  window.wsBleed = (pos, target, fov) => {
    [W, H] = [1000, 750];
    const s = view(pos, target, fov, "all");
    const walls = [];
    s.root.traverse((o) => o.userData.layer === "walls" && o.visible && walls.push(o));
    const N = read(s);
    for (const o of walls) o.visible = false;
    const Wo = read(s);
    const hidden = [];
    for (const c of s.root.children) if (c !== s.roofHolder && c.visible) (c.visible = false), hidden.push(c);
    const bg = s.scene.background;
    s.scene.background = null;
    const M = read(s); // nur das Dach
    s.scene.background = bg;
    for (const c of hidden) c.visible = true;
    for (const o of walls) o.visible = true;
    s.resize();
    let roof = 0;
    let bad = 0;
    const d3 = (A, B, k) => Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]);
    const sky = (k) => Math.abs(M[k] - M[0]) + Math.abs(M[k + 1] - M[1]) + Math.abs(M[k + 2] - M[2]) <= 6; // Ecke oben links: kein Dach
    for (let k = 0; k < W * H * 4; k += 4) {
      if (sky(k) || d3(M, Wo, k) >= 6) continue; // kein Dach bzw. Dach nicht vorn
      roof++;
      if (d3(N, Wo, k) > 24) bad++;
    }
    return { roof, bad };
  };
});

// --- 1. Wände blitzen nicht durchs Dach (Traufe, Giebel, Innenwände knapp unter der Schräge) -----------------
const views = { sw: [[-20, 12, -20], [5.5, 4, 4], 14], oben: [[5.5, 30, -12], [5.5, 4, 4], 20], sued: [[5, 8, -30], [5, 3.85, 0], 6], west: [[-30, 7, 4], [0, 4.5, 4], 8] };
R.dach = {};
for (const type of ["gable", "hip", "shed"]) {
  await E((type) => window.wsSet(window.wsDg({ type })), type);
  for (const [name, [pos, target, fov]] of Object.entries(views)) {
    const r = await E(([p, q, f]) => window.wsBleed(p, q, f), [pos, target, fov]);
    R.dach[`${type}:${name}`] = r;
    t.check(r.roof > 100000 && r.bad === 0, `Wandkanten durchs Dach (${type}, ${name}): ${JSON.stringify(r)}`);
  }
}

// --- 2. Haarlinien in glatten Flächen --------------------------------------------------------------------------
const lines = (house, pos, target, fov, filter, quad, tol = 4, size = [1000, 750]) => E(([h, p, q, f, fl, qd, tl, sz]) => {
  if (window.wsHaus !== h) window.wsSet(h === "eg" ? window.wsEg() : window.wsDg());
  window.wsHaus = h;
  return window.wsLines(p, q, f, fl, qd, tl, sz);
}, [house, pos, target, fov, filter, quad, tol, size]);
const schwelle = [[9.0, 1.4, 3.3], [7, 0, 2], 30, "eg"]; // schräg aus der Küche (dort flimmerte es)
R.linien = {
  // T-Stoß Küche|Flur an die Außenwand x = 11: Deckfläche der Außenwand (geteilt bei z = 4, Innenwand bis zur Mitte)
  tStoss: await lines("eg", [12.2, 4.2, 5.2], [11, 2.6, 4], 30, "eg", [[11.02, 2.6, 3.5], [11.22, 2.6, 3.5], [11.22, 2.6, 4.5], [11.02, 2.6, 4.5]]),
  // Kreuzung der Innenwände bei (7, 4): Deckflächen
  kreuz: await lines("eg", [8.0, 4.4, 5.6], [7, 2.6, 4.5], 30, "eg", [[6.95, 2.6, 4.5], [7.05, 2.6, 4.5], [7.05, 2.6, 6.5], [6.95, 2.6, 6.5]]),
  // Durchgang Wohnzimmer|Küche (x = 7, z 1,4 … 2,6): auf der Küchenhälfte der Schwelle der Küchenboden statt einer
  // flimmernden Deckfläche des Wandfußes (die Wohnzimmerhälfte liegt im Lichtschein der eingeschalteten Lampe)
  schwelle: await lines("eg", ...schwelle, [[7.01, 0, 1.75], [7.055, 0, 1.75], [7.055, 0, 2.25], [7.01, 0, 2.25]]),
  kueche: await lines("eg", ...schwelle, [[7.2, 0, 1.75], [7.5, 0, 1.75], [7.5, 0, 2.25], [7.2, 0, 2.25]]),
  // Dachgeschoss: Innenwand x = 6 in Stufen unter der Schräge, Seite zum Gästezimmer (x = 6,06)
  stufen: await lines("dg", [9.5, 5.2, 4.0], [6, 4.4, 4], 45, "dg", [[6.06, 3.05, 1.9], [6.06, 3.05, 3.8], [6.06, 3.8, 3.8], [6.06, 3.8, 1.9]]),
  // freie Wand x = 3 in Stufen (Seite x = 3,06): Stoßfugen der Stufen ohne Lichtpunkte (T-Stellen geschlossen)
  freieStufen: await (async () => {
    // Lichtpunkte hängen am Bildraster: mehrere Bildgrößen und leicht verschobene Blicke
    const sum = { n: 0, bad: 0, worst: 0 };
    for (const size of [null, [1000, 750], [987, 702]]) {
      for (const [dx, dz] of [[0, 0], [0.013, 0.007], [-0.017, -0.023]]) {
        const r = await lines("dg", [5.2 + dx, 4.9, 3.6 + dz], [3.06, 4.3, 1.2], 50, "dg", [[3.06, 3.0, 0.3], [3.06, 3.0, 2.6], [3.06, 5.2, 2.6], [3.06, 4.01, 0.3]], 4, size);
        Object.assign(sum, { n: sum.n + r.n, bad: sum.bad + r.bad, worst: Math.max(sum.worst, r.worst) });
      }
    }
    return sum;
  })(),
  // Fassade an der Etagenfuge EG/DG (Süd, z = −0,24, Höhe 2,6)
  fuge: await lines("dg", [5, 2.8, -12], [3.5, 2.7, -0.24], 12, "all", [[0.5, 2.45, -0.24], [2.3, 2.45, -0.24], [2.3, 2.75, -0.24], [0.5, 2.75, -0.24]], 2),
};
for (const [k, r] of Object.entries(R.linien)) t.check(r.n > 300 && r.bad === 0, `Haarlinien (${k}): ${JSON.stringify(r)}`);
t.check(Math.abs(R.linien.schwelle.mean - R.linien.kueche.mean) < 3, `Schwelle nicht wie der Boden: ${R.linien.schwelle.mean} ≠ ${R.linien.kueche.mean}`);

// --- 3. Deckel: Deckflächen unter dem Wandfuß der Etage darüber nur bei ausgeblendeter Etage darüber -------------
R.deckel = await E(async () => {
  const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
  window.wsSet(window.wsDg());
  const s = window.panel._scene;
  const eg = s.floors.get("eg");
  const hit = () => {
    s.root.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(new THREE.Vector3(11.12, 2.75, 2), new THREE.Vector3(0, -1, 0));
    const shown = (o) => {
      for (let q = o; q; q = q.parent) if (!q.visible) return false;
      return true;
    };
    const h = rc.intersectObject(eg.group, true).find((x) => shown(x.object) && x.object.userData.layer === "walls");
    return h ? +h.point.y.toFixed(3) : null;
  };
  s.setFilter("all");
  const alle = { lid: eg.lid?.wrap.visible ?? null, y: hit() };
  s.setFilter("eg");
  const nurEg = { lid: eg.lid?.wrap.visible ?? null, y: hit() };
  s.setFilter("all");
  return { alle, nurEg, above: eg.lid?.above ?? null };
});
t.check(R.deckel.above === "dg" && R.deckel.alle.lid === false && R.deckel.nurEg.lid === true && R.deckel.nurEg.y === 2.6, `Deckel der Etagenfuge: ${JSON.stringify(R.deckel)}`);

// Bilder zum Ansehen
await E(() => {
  window.wsSet(window.wsDg());
  const s = window.panel._scene;
  s.setFilter("dg");
  s.camera.fov = 45;
  s.camera.updateProjectionMatrix();
  s.camera.position.set(10, 7, 9);
  s.controls.target.set(6, 4, 4);
  s.controls.update();
  s.invalidate();
});
await pg.waitForTimeout(1200);
await t.shot(pg, "wandstoss-dg.png");
await t.done();
