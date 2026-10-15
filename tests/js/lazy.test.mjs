// Nachladen bei Bedarf: loadOnce() lädt höchstens einmal und merkt Fehlschläge nicht; die Loader für eigene
// 3D-Modelle hängen nicht am Startbaum, lesen aber bei Bedarf weiterhin GLB/glTF, OBJ und STL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadOnce, isRequested, whenIdle } from "../../custom_components/haus3d/frontend/lazy.js";
import { parseModel } from "../../custom_components/haus3d/frontend/models.js";

const FRONT = new URL("../../custom_components/haus3d/frontend/", import.meta.url);

/** Alle Module, die ab einem Einstieg statisch (import/export … from) erreichbar sind. */
function staticTree(entry) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = readFileSync(new URL(f, FRONT), "utf8");
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"|(?:^|\n)\s*import\s+"(\.[^"]+)"/g)) walk((m[1] ?? m[2]).replace(/^\.\//, ""));
  };
  walk(entry);
  return seen;
}

test("loadOnce: gleichzeitige Aufrufe teilen ein Laden, später kommt das Gemerkte", async () => {
  let n = 0;
  const load = async () => (n++, { ok: true });
  const [a, b] = await Promise.all([loadOnce("t-eins", load), loadOnce("t-eins", load)]);
  assert.equal(a, b);
  assert.equal(await loadOnce("t-eins", load), a);
  assert.equal(n, 1);
  assert.ok(isRequested("t-eins"));
  assert.ok(!isRequested("t-nie"));
});

test("loadOnce: ein Fehlschlag wird nicht gemerkt, der nächste Aufruf lädt neu", async () => {
  let n = 0;
  const load = async () => {
    if (++n === 1) throw new Error("kurz weg");
    return "da";
  };
  await assert.rejects(() => loadOnce("t-fehler", load), /kurz weg/);
  assert.equal(await loadOnce("t-fehler", load), "da");
  assert.equal(n, 2);
  // auch ein sofort werfendes load() wird zum abgelehnten Versprechen
  await assert.rejects(() => loadOnce("t-wirft", () => { throw new Error("sofort"); }), /sofort/);
  assert.ok(!isRequested("t-wirft"));
});

test("whenIdle: ruft fn auf (Ersatz ohne requestIdleCallback) und lässt sich abbrechen", async () => {
  assert.equal(typeof requestIdleCallback, "undefined"); // node: Zeitgeber-Ersatz
  await new Promise((done) => whenIdle(done));
  let called = false;
  const cancel = whenIdle(() => (called = true));
  cancel();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(called, false);
});

test("Die Loader für eigene Modelle werden nur per import() geladen, nicht statisch", () => {
  const loaders = ["GLTFLoader.js", "OBJLoader.js", "STLLoader.js"];
  for (const f of readdirSync(FRONT).filter((x) => x.endsWith(".js"))) {
    const src = readFileSync(new URL(f, FRONT), "utf8");
    for (const l of loaders) assert.ok(!new RegExp(`from\\s+"[^"]*${l}"`).test(src), `${f} importiert ${l} statisch`);
  }
  const tree = staticTree("haus3d-panel.js");
  for (const l of loaders) assert.ok(!tree.has(`vendor/${l}`), `${l} hängt am Startbaum des Panels`);
});

test("Der Editor hängt nicht am Startbaum des Panels, sondern wird über loadEditor() nachgeladen", () => {
  const tree = staticTree("haus3d-panel.js");
  // alles, was nur der Editor braucht (edit-ops.js ist reine Planlogik und gehört auch zur Szene)
  const own = [...staticTree("editor.js")].filter((f) => !tree.has(f) || f === "editor.js");
  assert.ok(own.length > 25, `nur ${own.length} Module hängen allein am Editor`);
  for (const f of own) assert.ok(!tree.has(f), `${f} hängt am Startbaum des Panels`);
  for (const f of readdirSync(FRONT).filter((x) => /^editor.*\.js$/.test(x))) assert.ok(!tree.has(f), `${f} hängt am Startbaum des Panels`);
  assert.ok(tree.has("lazy.js"));
  const panel = readFileSync(new URL("haus3d-panel.js", FRONT), "utf8");
  assert.doesNotMatch(panel, /from\s+"\.\/editor\.js"/);
  assert.doesNotMatch(panel, /\$\{EDITOR_STYLE\}/);
  assert.match(readFileSync(new URL("lazy.js", FRONT), "utf8"), /loadOnce\("editor", \(\) => import\("\.\/editor\.js"\)\)/);
  // _openEditor ist asynchron und lädt, bevor er baut
  assert.match(panel, /async _openEditor\(\)[\s\S]*?await loadEditor\(\)[\s\S]*?this\._buildEditor\(mod\.FloorEditor\)/);
});

test("Der Start lädt nur einen kleinen Teil der Module (Obergrenze gegen schleichendes Anwachsen)", () => {
  const tree = staticTree("haus3d-panel.js");
  let kb = 0;
  for (const f of tree) kb += readFileSync(new URL(f, FRONT)).length / 1024;
  assert.ok(tree.size <= 125, `${tree.size} Module am Startbaum`);
  assert.ok(kb <= 2500, `${Math.round(kb)} KB am Startbaum`);
});

test("parseModel liest STL, OBJ und glTF über die nachgeladenen Loader", async () => {
  const enc = (s) => new TextEncoder().encode(s).buffer;
  const stl = await parseModel(enc("solid t\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\nendsolid t\n"), "stl");
  assert.equal(stl.plain, true);
  let meshes = 0;
  stl.object.traverse((o) => o.isMesh && meshes++);
  assert.equal(meshes, 1);
  const obj = await parseModel(enc("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"), "obj");
  assert.equal(obj.plain, true);
  meshes = 0;
  obj.object.traverse((o) => o.isMesh && meshes++);
  assert.equal(meshes, 1);
  const gltf = await parseModel(enc(JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0 })), "gltf");
  assert.equal(gltf.plain, false);
  await assert.rejects(() => parseModel(enc(""), "xyz"), /nicht unterstützt/);
});
