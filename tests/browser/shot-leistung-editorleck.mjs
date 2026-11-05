// Leistung C5: Editor öffnen und schließen lässt nichts zurück. Früher hielt jede geteilte Textur (Textur-Cache,
// Kontaktschatten) über ihren dispose-Listener den alten Editor-Renderer samt Leinwand fest – je Öffnen einer
// (scene-release.js). Geprüft:
//   - geteilte Texturen, Geometrie und Stoff (wie eine Modell-Vorlage) tragen nach dem Schließen nur noch den Listener
//     der Hauptansicht, auch wenn die Editor-Szene beim Aufräumen ein Objekt entsorgt, das auch die Hauptansicht zeichnet
//     (modulweit geteilt ohne keep wie die Blatt-Geometrie und die Flammen-Stoffe); keine abgelöste three.js-Leinwand
//     bleibt;
//   - Schleife: nach mehreren Runden Öffnen/Schließen liegen DOM-Knoten und JS-Heap ohne Maschinencode bei ±5 % der
//     ersten Runde, die Zahl der Event-Listener ist gleich. Der Maschinencode wächst, solange V8 heiße Funktionen
//     nachübersetzt (keine Daten), darum steht der Heap gesamt nur im Ergebnis.
import { start, unlock } from "./lib.mjs";

const ROUNDS = 5;
const t = await start(process.argv[2]);
const pg = await t.page("leistung-editorleck", "?quality=ausgewogen&schatten=aus", { width: 1280, height: 800 });
const cdp = await pg.context().newCDPSession(pg);
await cdp.send("Performance.enable");
await cdp.send("DOM.enable");
await cdp.send("HeapProfiler.enable");

async function gc() {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
}

/** Heap-Snapshot: Summe der Objekte ohne Maschinen- und Bytecode (MB). */
async function heapWithoutCode() {
  await gc();
  const chunks = [];
  const add = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", add);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", add);
  const s = JSON.parse(chunks.join(""));
  const m = s.snapshot.meta;
  const NF = m.node_fields.length;
  const iT = m.node_fields.indexOf("type");
  const iS = m.node_fields.indexOf("self_size");
  const code = m.node_types[iT].indexOf("code");
  let sum = 0;
  let codeSum = 0;
  for (let i = 0; i < s.nodes.length; i += NF) {
    if (s.nodes[i + iT] === code) codeSum += s.nodes[i + iS];
    else sum += s.nodes[i + iS];
  }
  return { ohneCode: sum / 1048576, code: codeSum / 1048576 };
}

async function sample(tag) {
  await gc();
  const total = (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576; // vor dem Snapshot (der legt selbst an)
  const heap = await heapWithoutCode();
  const met = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const detached = (await cdp.send("DOM.getDetachedDomNodes")).detachedNodes.filter((d) => (d.treeNode.attributes ?? []).includes("data-engine")).length;
  return { tag, knoten: met.Nodes, listener: met.JSEventListeners, heapOhneCodeMB: +heap.ohneCode.toFixed(2), codeMB: +heap.code.toFixed(2), heapGesamtMB: +total.toFixed(2), leinwaendeAbgeloest: detached };
}

const open = async () => {
  await pg.evaluate(() => window.panel._openEditor());
  await pg.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0 && window.panel._editor.scene3d.stats.renders > 0, null, { timeout: 90000 });
  await pg.waitForTimeout(1500);
};
const close = async () => {
  await pg.evaluate(() => {
    const ed = window.panel._editor;
    ed.clearDraft?.();
    ed.onClose();
  });
  await pg.waitForFunction(() => !window.panel._editor && window.panel._scene._running, null, { timeout: 15000 });
  await pg.waitForTimeout(1200);
};

await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.stats?.renders > 0, null, { timeout: 60000 });
await unlock(pg, "edit");
const vorher = await sample("vor dem ersten Öffnen");

// Runde 1: Editor-Code laden, Zwischenspeicher füllen; danach ist der Bezug
await open();
await close();
const bezug = await sample("nach Runde 1 (Bezug)");

// Runde 2: geteilte Objekte wie eine Modell-Vorlage (keep) in beiden Szenen, dazu Textur-Cache und Kontaktschatten
const listenerCount = () =>
  pg.evaluate(async () => {
    const { sharedTextures } = await import("/custom_components/haus3d/frontend/textures.js");
    const n = (o) => o?._listeners?.dispose?.length ?? 0;
    const s = window.__leck;
    const tex = sharedTextures();
    return { geo: n(s.geo), mat: n(s.mat), tex: n(s.tex), cacheTexturen: tex.length, cacheMax: Math.max(0, ...tex.map(n)), blob: n(window.panel._scene._blobMat?.map) };
  });
await pg.evaluate(async () => {
  const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
  const tex = new THREE.DataTexture(new Uint8Array([200, 120, 40, 255]), 1, 1);
  tex.needsUpdate = true;
  const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  geo.userData.keep = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  mat.userData.keep = true;
  // modulweit geteilt ohne keep (wie home-parts.js:leafGeo bzw. die Flammen-Stoffe): die Editor-Szene entsorgt sie
  const leaf = new THREE.SphereGeometry(0.1, 8, 6);
  const flame = new THREE.MeshBasicMaterial({ color: 0xff8800 });
  window.__leck = { THREE, tex, geo, mat, leaf, flame };
  const sc = window.panel._scene;
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, 1, 0);
  const l = new THREE.Mesh(leaf, flame);
  l.position.set(0.4, 1, 0);
  sc.scene.add(m, l);
  window.__leck.main = [m, l];
  sc.invalidate();
});
await pg.waitForTimeout(800);
const nurHaupt = await listenerCount();
await open();
await pg.evaluate(() => {
  const s = window.__leck;
  const sc = window.panel._editor.scene3d;
  const m = new s.THREE.Mesh(s.geo, s.mat);
  m.position.set(0, 1, 0);
  sc.scene.add(m);
  const l = new s.THREE.Mesh(s.leaf, s.flame);
  l.position.set(0.4, 1, 0);
  sc.root.add(l); // unter root: HouseScene._dispose entsorgt Geometrie und Stoff
  sc.invalidate();
});
await pg.waitForTimeout(1200);
const beide = await listenerCount();
await close();
const danach = await listenerCount();
await pg.evaluate(() => {
  const s = window.__leck;
  for (const m of s.main) m.removeFromParent();
  window.__leck = null; // ab hier nichts mehr festhalten
  window.panel._scene.invalidate();
});
t.results.geteilt = { nurHaupt, beide, danach };
t.check(nurHaupt.geo === 1 && nurHaupt.mat === 1 && nurHaupt.tex === 1, `geteilte Objekte vor dem Öffnen: ${JSON.stringify(nurHaupt)}`);
t.check(beide.geo === 2 && beide.mat === 2 && beide.tex === 2, `mit offenem Editor zwei Renderer: ${JSON.stringify(beide)}`);
t.check(danach.geo === 1 && danach.mat === 1 && danach.tex === 1, `nach dem Schließen nur noch die Hauptansicht: ${JSON.stringify(danach)}`);
t.check(danach.cacheTexturen > 0 && danach.cacheMax <= 1 && danach.blob <= 1, `Textur-Cache und Kontaktschatten: ${JSON.stringify(danach)}`);

// Runden 3 …: Schleife
const runden = [];
for (let i = 0; i < ROUNDS; i++) {
  await open();
  await close();
  runden.push(await sample(`nach Runde ${i + 3}`));
}
const ende = runden.at(-1);
t.results.schleife = [vorher, bezug, ...runden];
const rel = (a, b) => Math.abs(a - b) / b;
t.check(ende.leinwaendeAbgeloest === 0, `abgelöste three.js-Leinwände: ${ende.leinwaendeAbgeloest}`);
t.check(rel(ende.knoten, bezug.knoten) <= 0.05, `DOM-Knoten ${bezug.knoten} → ${ende.knoten}`);
t.check(rel(ende.knoten, vorher.knoten) <= 0.05, `DOM-Knoten gegen vor dem ersten Öffnen: ${vorher.knoten} → ${ende.knoten}`);
t.check(ende.listener === bezug.listener, `Event-Listener ${bezug.listener} → ${ende.listener}`);
t.check(rel(ende.heapOhneCodeMB, bezug.heapOhneCodeMB) <= 0.05, `Heap ohne Code ${bezug.heapOhneCodeMB} → ${ende.heapOhneCodeMB} MB`);
// Ohne Zurückbleiben wächst nichts mehr je Runde: Steigung der letzten Runden klein (≤ 1 % je Runde)
const slope = (ende.heapOhneCodeMB - runden[0].heapOhneCodeMB) / Math.max(1, runden.length - 1);
t.results.steigungMBjeRunde = +slope.toFixed(3);
t.check(slope <= 0.01 * bezug.heapOhneCodeMB, `Heap ohne Code wächst je Runde um ${slope.toFixed(3)} MB`);
await t.done();
