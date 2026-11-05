// Kontaktschatten instanziert (scene-fx.js, nur Hauptansicht): dieselbe Szene einmal mit einem InstancedMesh je
// Möbelgruppe und einmal mit ?instanzen=aus (ein Mesh je Möbelstück). Gleich sein müssen die Schatten je Möbelstück
// (Lage, Drehung, Größe, Ebene), der Schattenbereich der Sonne, die Zeichenaufrufe ohne Möbel-Ebene und das Bild
// (Toleranz B: ≤ 0,1 % der Pixel über 16/255, keine Fläche > 25 px). Instanziert sind es weniger Zeichenaufrufe; der
// Editor bleibt einzeln (userData.blobOf für die Live-Vorschau).
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);

// Garten (östlich vom Haus) und gedrehte Stücke innen
const EXTRA = [
  { id: "k_baum", type: "tree", x: 21, z: 2, rotation: 25 },
  { id: "k_tisch", type: "garden_table", x: 23, z: 6, rotation: 15 },
  { id: "k_bank", type: "garden_bench", x: 20, z: 9, rotation: -70 },
  { id: "k_regal", type: "shelf", x: 3, z: 3, rotation: 45 },
];

/** Szene messen: Schatten je Möbelstück, Objekte, Sonne, Zeichenaufrufe, Bild der Zeichenfläche. */
const collect = (pg) =>
  pg.evaluate(() => {
    const sc = window.panel._scene;
    const blobs = [];
    const objs = [];
    const parents = new Set();
    sc.root.updateMatrixWorld(true);
    sc.root.traverse((o) => {
      if (!o.userData.blob) return;
      parents.add(o.parent);
      objs.push({
        inst: !!o.isInstancedMesh,
        count: o.isInstancedMesh ? o.count : 1,
        renderOrder: o.renderOrder,
        layer: o.userData.layer,
        parent: o.parent?.userData.layer ?? null,
        noShadow: o.userData.noShadow === true,
        cast: o.castShadow,
        receive: o.receiveShadow,
        sphere: o.isInstancedMesh ? !!o.boundingSphere : null,
        blobOf: o.userData.blobOf ?? null,
      });
      const m = o.matrix.clone();
      const ids = o.isInstancedMesh ? o.userData.blobIds : [o.userData.blobOf];
      ids.forEach((id, i) => {
        if (o.isInstancedMesh) o.getMatrixAt(i, m);
        else m.compose(o.position, o.quaternion, o.scale);
        const e = m.elements;
        blobs.push([id, o.userData.layer, o.parent?.userData.layer ?? null, e[12], e[13], e[14], Math.atan2(-e[2], e[0]), Math.hypot(e[0], e[2]), Math.hypot(e[8], e[10])]);
      });
    });
    blobs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[3] - b[3]));
    const cam = sc.sun.shadow.camera;
    const calls = () => {
      const info = sc.renderer.info;
      info.autoReset = false;
      info.reset();
      sc.renderer.render(sc.scene, sc.camera);
      const n = info.render.calls;
      info.autoReset = true;
      return n;
    };
    const withShadow = calls();
    // dasselbe Bild noch einmal, damit die Zeichenfläche lesbar ist
    sc.renderer.render(sc.scene, sc.camera);
    const url = sc.renderer.domElement.toDataURL("image/png");
    // Möbel-Ebene aus: keine Schatten mehr, auch die Instanzen nicht
    const p = window.panel;
    const layers = { ...p._settings.layers };
    sc.setLayers({ ...layers, furniture: false });
    let shown = 0;
    sc.root.traverse((o) => {
      if (!o.userData.blob) return;
      let vis = true;
      for (let q = o; q; q = q.parent) vis &&= q.visible;
      if (vis) shown++;
    });
    const noFurniture = calls();
    sc.setLayers(layers);
    return { blobs, objs, parents: parents.size, shadowCam: [cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far], withShadow, noFurniture, shown, url, flags: sc.flags.instances, live: sc.live };
  });

/** Kamera fest (Voreinstellung iso) und warten, bis sie 1 s stillsteht. */
async function placeCamera(pg) {
  let last = "";
  let since = Date.now();
  const t0 = Date.now();
  await pg.evaluate(() => window.panel._scene.viewPreset("iso", 0, { duration: 0 }));
  while (Date.now() - t0 < 30000) {
    const sig = await pg.evaluate(() => {
      const sc = window.panel._scene;
      sc.camera.updateMatrixWorld();
      return [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(6)).join(",");
    });
    if (sig !== last) {
      last = sig;
      since = Date.now();
    } else if (Date.now() - since > 1000) break;
    await pg.waitForTimeout(200);
  }
  await pg.evaluate(() => window.panel._scene.viewPreset("iso", 0, { duration: 0 }));
  await pg.waitForTimeout(400);
  return pg.evaluate(() => {
    const sc = window.panel._scene;
    sc.camera.updateMatrixWorld();
    return [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(5)).join(",");
  });
}

async function probe(name, query) {
  const pg = await t.page(name, `?quality=ausgewogen&schatten=an&sun=180,45${query}`, { width: 1280, height: 800 });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0, null, { timeout: 60000 });
  await pg.evaluate((extra) => {
    const p = window.panel;
    p._settings.layers.flow = false;
    p._settings.layers.weather = false;
    p._scene.setLayers(p._settings.layers);
    const b = structuredClone(p._building);
    b.floors.find((f) => f.id === "eg").furniture.push(...extra);
    p._setBuilding(b, p._revision, { keepCamera: true });
    p._scene.setPerf({ frozen: true });
    // ein zweiter Aufbau: die Instanzen des ersten werden freigegeben (scene.js:_dispose)
    p._scene.setBuilding(p._scene.building, { keepCamera: true });
  }, EXTRA);
  await pg.waitForTimeout(900);
  const kamera = await placeCamera(pg);
  const data = { kamera, ...(await collect(pg)) };
  // Editor: bleibt live und einzeln
  await unlock(pg, "edit");
  await pg.evaluate(() => window.panel._openEditor());
  await pg.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0, null, { timeout: 90000 });
  await pg.waitForTimeout(600);
  data.editor = await pg.evaluate(() => {
    const sc = window.panel._editor.scene3d;
    let inst = 0;
    let single = 0;
    sc.root.traverse((o) => {
      if (!o.userData.blob) return;
      if (o.isInstancedMesh) inst++;
      else if (o.userData.blobOf) single++;
    });
    return { live: sc.live, inst, single };
  });
  return { pg, data };
}

/** Läuft in der Seite: zwei PNGs vergleichen (Pixel über der Schwelle, größte zusammenhängende Fläche, 8er-Nachbarn). */
async function compareInPage([ua, ub, thr]) {
  const decode = async (u) => {
    const bmp = await createImageBitmap(await (await fetch(u)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const g = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height);
  };
  const a = await decode(ua);
  const b = await decode(ub);
  if (a.width !== b.width || a.height !== b.height) return { fehler: `${a.width}×${a.height} / ${b.width}×${b.height}` };
  const w = a.width;
  const n = w * a.height;
  const mask = new Uint8Array(n);
  let over = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a.data[i * 4 + k] - b.data[i * 4 + k]));
    max = Math.max(max, d);
    if (d > thr) {
      mask[i] = 1;
      over++;
    }
  }
  let largest = 0;
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (mask[i] !== 1) continue;
    mask[i] = 2;
    stack.push(i);
    let size = 0;
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % w;
      const y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= a.height) continue;
          const k = yy * w + xx;
          if (mask[k] === 1) {
            mask[k] = 2;
            stack.push(k);
          }
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return { pixel: n, ueber: over, anteil: over / n, groessteFlaeche: largest, max };
}

const an = (await probe("kontakt-an", "")).data;
const { pg, data: aus } = await probe("kontakt-aus", "&instanzen=aus");
const bild = await pg.evaluate(compareInPage, [an.url, aus.url, 16]);
await pg.close();

const sum = (objs) => objs.reduce((s, o) => s + o.count, 0);
t.results.an = { objekte: an.objs.length, schatten: an.blobs.length, aufrufe: an.withShadow, ohneMoebel: an.noFurniture, editor: an.editor };
t.results.aus = { objekte: aus.objs.length, schatten: aus.blobs.length, aufrufe: aus.withShadow, ohneMoebel: aus.noFurniture, editor: aus.editor };
t.results.bild = bild;

t.check(an.flags === true && aus.flags === false && an.live === false && aus.live === false, `Schalter: ${JSON.stringify([an.flags, aus.flags, an.live])}`);
t.check(an.kamera === aus.kamera, "Kamera nicht gleich");
// instanziert: ein InstancedMesh je Möbelgruppe (innen und Garten), Eigenschaften wie die einzelnen Schatten
t.check(an.objs.length >= 2 && an.objs.every((o) => o.inst && o.sphere && o.count > 0), `Instanzen: ${JSON.stringify(an.objs)}`);
t.check(an.parents === an.objs.length && an.parents === aus.parents && an.objs.every((o) => o.parent === "furniture") && an.objs.some((o) => o.count >= 4), `Gruppen: ${an.parents}/${aus.parents} ${JSON.stringify(an.objs)}`);
t.check(aus.objs.length === aus.blobs.length && aus.objs.every((o) => !o.inst && o.blobOf), `einzeln: ${aus.objs.length} / ${aus.blobs.length}`);
const props = (o) => [o.renderOrder, o.layer, o.noShadow, o.cast, o.receive].join();
t.check(an.objs.concat(aus.objs).every((o) => props(o) === "1,furniture,true,false,false"), `renderOrder/Ebene/Schatten: ${[...new Set(an.objs.concat(aus.objs).map(props))]}`);
// je Möbelstück gleich (Float32 der Instanz-Matrizen)
const sameBlob = (x, y) => x.slice(0, 3).join() === y.slice(0, 3).join() && x.slice(3).every((v, i) => Math.abs(v - y[3 + i]) < 1e-5 * Math.max(1, Math.abs(v)));
const bad = an.blobs.filter((b, i) => !aus.blobs[i] || !sameBlob(b, aus.blobs[i]));
t.check(an.blobs.length > 20 && an.blobs.length === aus.blobs.length && sum(an.objs) === an.blobs.length && !bad.length, `Schatten weichen ab (${an.blobs.length} / ${aus.blobs.length}): ${JSON.stringify(bad.slice(0, 3))}`);
for (const id of EXTRA.map((x) => x.id)) t.check(an.blobs.some((b) => b[0] === id), `kein Schatten für ${id}`);
t.check(an.shadowCam.every((v, i) => Math.abs(v - aus.shadowCam[i]) < 1e-4), `Schattenbereich der Sonne: ${an.shadowCam} / ${aus.shadowCam}`);
// Zeichenaufrufe: weniger; ohne Möbel-Ebene gleich und kein Schatten sichtbar
t.check(an.withShadow < aus.withShadow - 10, `Zeichenaufrufe: ${an.withShadow} statt ${aus.withShadow}`);
t.check(an.noFurniture === aus.noFurniture && an.shown === 0 && aus.shown === 0, `ohne Möbel-Ebene: ${an.noFurniture}/${aus.noFurniture}, sichtbar ${an.shown}/${aus.shown}`);
// Bild: Toleranz B
t.check(!bild.fehler && bild.anteil <= 0.001 && bild.groessteFlaeche <= 25, `Bild weicht ab: ${JSON.stringify(bild)}`);
// Editor unverändert einzeln
t.check(an.editor.live === true && an.editor.inst === 0 && an.editor.single > 0 && an.editor.single === aus.editor.single, `Editor: ${JSON.stringify([an.editor, aus.editor])}`);
await t.done();
