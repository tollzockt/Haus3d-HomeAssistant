// Eigene 3D-Modelle: Dateiarten, Einheiten, Einpassen (model-fit.js); Laden, Cache, Normieren, Platzhalter und
// Hochladen mit nachgebautem hass (models.js); Möbeltyp custom_model
import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { ModelCatalogMethods, MODEL_GROUP } from "../../custom_components/haus3d/frontend/editor-models.js";
import { MODEL_FIELDS } from "../../custom_components/haus3d/frontend/fields-model.js";
import { clearAccess, setAccess } from "../../custom_components/haus3d/frontend/access.js";
import { FURNITURE, FURNITURE_CATEGORIES, buildFurniture, furnitureMaterials } from "../../custom_components/haus3d/frontend/furniture.js";
import { MODEL_FORMATS, cleanName, fitScale, fittedSize, formatBytes, formatSize, glbJson, gltfProblem, longestEdge, modelExt, nameFromFile, placementSize, sizeFromRaw, suggestUnit, unitFactor, uploadMessage, usageText } from "../../custom_components/haus3d/frontend/model-fit.js";
import {
  EDGE_TRIANGLES,
  deleteModel,
  inspectFile,
  instantiate,
  loadModel,
  modelList,
  modelMeta,
  modelState,
  onModelsChange,
  peekModel,
  refreshModels,
  renameModel,
  resetModels,
  setModelHass,
  uploadModel,
} from "../../custom_components/haus3d/frontend/models.js";

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const nearAll = (a, b, eps = 1e-3) => a.forEach((v, i) => near(v, b[i], eps));
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------ Testdateien

/** Quader aus 12 Dreiecken als binäre STL; Ausdehnung (sx, sy, sz), Ecke bei (ox, oy, oz). */
function boxStl(sx, sy, sz, [ox, oy, oz] = [0, 0, 0]) {
  const v = (x, y, z) => [ox + x * sx, oy + y * sy, oz + z * sz];
  const quads = [
    [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)],
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => {
    const at = 84 + i * 50;
    t.forEach((p, j) => p.forEach((c, k) => dv.setFloat32(at + 12 + j * 12 + k * 4, c, true)));
  });
  return new Uint8Array(buf);
}

const objBox = (sx, sy, sz, [ox, oy, oz] = [0, 0, 0]) =>
  new TextEncoder().encode(
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([x, y, z]) => `v ${ox + x * sx} ${oy + y * sy} ${oz + z * sz}`).join("\n") +
      "\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 3 4 8 7\nf 1 4 8 5\nf 2 3 7 6\n",
  );

/** GLB mit zwei Dreiecken: Ausdehnung x 2, y 1, z 3 (Y oben). */
function glbSample() {
  const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3]);
  const doc = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: pos.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 6, type: "VEC3", min: [0, 0, 0], max: [2, 1, 3] }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
  jsonPad.set(json);
  const bin = new Uint8Array(pos.buffer);
  const total = 12 + 8 + jsonPad.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPad.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonPad, 20);
  dv.setUint32(20 + jsonPad.length, bin.length, true);
  dv.setUint32(24 + jsonPad.length, 0x004e4942, true);
  out.set(bin, 28 + jsonPad.length);
  return out;
}

/** hass-Nachbau: Liste, Löschen, Umbenennen, Abruf mit fetchWithAuth und Upload. */
function mockHass() {
  const store = new Map();
  let n = 0;
  const forms = [];
  const calls = [];
  const listing = () => ({ models: [...store.values()].map((e) => e.meta), used: [...store.values()].reduce((s, e) => s + e.bytes.length, 0), limits: { file: 25 * 1024 * 1024, total: 300 * 1024 * 1024, count: 200 } });
  const put = (ext, bytes, meta = {}) => {
    const id = (++n).toString(16).padStart(16, "0");
    store.set(id, { bytes, meta: { id, name: `Modell ${n}`, ext, size: bytes.length, created: "2026-01-01T00:00:00+00:00", unit: "m", up: ext === "stl" ? "z" : "y", ...meta } });
    return id;
  };
  const hass = {
    calls,
    forms,
    store,
    put,
    callWS: async (msg) => {
      calls.push(msg);
      if (msg.type === "haus3d/models/list") return listing();
      if (msg.type === "haus3d/models/delete") {
        store.delete(msg.model_id);
        return listing();
      }
      if (msg.type === "haus3d/models/rename") {
        store.get(msg.model_id).meta.name = msg.name;
        return listing();
      }
      throw new Error(msg.type);
    },
    fetchWithAuth: async (path, init = {}) => {
      if (init.method === "POST") {
        const body = init.body;
        forms.push([...body.keys()]);
        const file = body.get("file");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const id = put(file.name.split(".").pop(), bytes, { name: body.get("name"), unit: body.get("unit"), ...(body.get("up") ? { up: body.get("up") } : {}), ...(body.get("size_m") ? { size_m: body.get("size_m").split(",").map(Number) } : {}) });
        return new Response(JSON.stringify({ model: store.get(id).meta }), { status: 201 });
      }
      const e = store.get(path.split("/").pop());
      return e ? new Response(e.bytes) : new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
    },
  };
  return hass;
}

function fresh() {
  resetModels();
  clearAccess();
  const hass = mockHass();
  setModelHass(hass);
  return hass;
}

const worldBox = (obj) => {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
};

// ------------------------------------------------------------------------------------ reine Rechnungen

test("Dateiarten: Endung erkannt, nur glb/gltf/obj/stl", () => {
  assert.deepEqual(MODEL_FORMATS, ["glb", "gltf", "obj", "stl"]);
  assert.equal(modelExt("Sofa.GLB"), "glb");
  assert.equal(modelExt("a.b.stl"), "stl");
  assert.equal(modelExt("a.exe"), null);
  assert.equal(modelExt("stl"), null);
  assert.equal(modelExt(null), null);
});

test("Einheitsvorschlag aus der längsten Kante je Dateiart", () => {
  assert.equal(suggestUnit(1.8, "glb"), "m");
  assert.equal(suggestUnit(60, "glb"), "m"); // glTF ist in Metern festgelegt
  assert.equal(suggestUnit(180, "glb"), "cm");
  assert.equal(suggestUnit(2500, "glb"), "cm");
  assert.equal(suggestUnit(4500, "glb"), "mm");
  assert.equal(suggestUnit(2, "obj"), "m");
  assert.equal(suggestUnit(180, "obj"), "cm"); // Möbel in cm: nicht fälschlich mm
  assert.equal(suggestUnit(1800, "obj"), "mm");
  assert.equal(suggestUnit(0.9, "stl"), "m");
  assert.equal(suggestUnit(200, "stl"), "mm"); // 3D-Druck
  assert.equal(suggestUnit(0, "stl"), "m");
  assert.equal(suggestUnit(NaN), "m");
  assert.equal(unitFactor("mm"), 0.001);
  assert.equal(unitFactor("cm"), 0.01);
  assert.equal(unitFactor("m"), 1);
  assert.equal(unitFactor("km"), 1);
  assert.equal(longestEdge([1, 5, 3]), 5);
});

test("Maße aus den Dateiachsen: Y oben bzw. Z oben, mit Einheit", () => {
  // Datei: x 200, y 100, z 50
  assert.deepEqual(sizeFromRaw([200, 100, 50], "mm", "z"), [0.2, 0.1, 0.05]); // Z oben: Höhe 50 mm
  assert.deepEqual(sizeFromRaw([200, 100, 50], "mm", "y"), [0.2, 0.05, 0.1]); // Y oben: Höhe 100 mm, Tiefe 50 mm
  assert.deepEqual(sizeFromRaw([2, 1, 3], "m", "y"), [2, 3, 1]);
});

test("Einpassen: Seitenverhältnis behalten bzw. strecken", () => {
  // Modell 2 × 1 (Tiefe) × 0,5 hoch in den Rahmen 1 × 1 × 1
  nearAll(fitScale([2, 1, 0.5], [1, 1, 1], "keep"), [0.5, 0.5, 0.5]);
  nearAll(fitScale([2, 1, 0.5], [1, 1, 1], "stretch"), [0.5, 2, 1]); // x, y (Höhe), z (Tiefe)
  nearAll(fitScale([2, 1, 0.5], [4, 4, 4], "keep"), [2, 2, 2]); // wächst bis zur engsten Achse
  nearAll(fittedSize([2, 1, 0.5], [1, 1, 1], "keep"), [1, 0.5, 0.25]);
  nearAll(fittedSize([2, 1, 0.5], [1, 1, 1], "stretch"), [1, 1, 1]);
  // Originalgröße: Maßstab 1
  nearAll(fitScale([2, 1, 0.5], [2, 1, 0.5], "keep"), [1, 1, 1]);
  // flaches Modell (Höhe 0) und fehlende Zielmaße: kein Teilen durch 0
  nearAll(fitScale([2, 1, 0], [1, 1, 1], "keep"), [0.5, 0.5, 0.5]);
  nearAll(fitScale([2, 1, 0], [1, 1, 1], "stretch"), [0.5, 1, 1]);
  nearAll(fitScale([0, 0, 0], [1, 1, 1], "keep"), [1, 1, 1]);
  nearAll(fitScale([2, 1, 1], [0, 0, 0], "keep"), [1, 1, 1]);
});

test("Maße für ein neues Möbel aus size_m", () => {
  assert.deepEqual(placementSize([1.2, 0.6, 0.8]), [1.2, 0.6, 0.8]);
  assert.deepEqual(placementSize([0, 0.6, 0.8]), [0.01, 0.6, 0.8]);
  assert.deepEqual(placementSize([5000, 1, 1]), [200, 1, 1]);
  assert.equal(placementSize(null), null);
  assert.equal(placementSize([1, 2]), null);
  assert.equal(placementSize([0, 0, 0]), null);
});

test("Namen und Meldungen", () => {
  assert.equal(cleanName("  Sofa \n  Retro\u0007 "), "Sofa Retro");
  assert.equal(cleanName("x".repeat(100)).length, 60);
  assert.equal(cleanName("", "Modell"), "Modell");
  assert.equal(nameFromFile("C:\\Daten\\Stehlampe_gross.OBJ"), "Stehlampe gross");
  assert.equal(nameFromFile("a/b/Regal.glb"), "Regal");
  assert.equal(usageText(1), "1 Möbel");
  assert.equal(usageText(3), "3 Möbeln");
  assert.match(uploadMessage(403, null), /PIN/);
  assert.match(uploadMessage(413, null), /zu groß/);
  assert.equal(uploadMessage(400, { message: "Eigene Meldung" }), "Eigene Meldung");
  assert.match(uploadMessage(500, {}), /Status 500/);
  assert.equal(formatSize([1.25, 0.6, 0.05]), "1,25 × 0,60 × 0,05 m");
  assert.equal(formatBytes(2 * 1048576), "2 MB");
  assert.equal(formatBytes(2048), "2 kB");
});

test("glTF: Verweise auf andere Dateien und Komprimierung werden erkannt", () => {
  const ok = { asset: { version: "2.0" }, buffers: [{ uri: "data:application/octet-stream;base64,AAAA" }], images: [{ uri: "data:image/png;base64,AAAA" }] };
  assert.equal(gltfProblem(ok, "gltf"), null);
  const ext = gltfProblem({ asset: {}, buffers: [{ uri: "scene.bin" }] }, "gltf");
  assert.equal(ext.code, "external_refs");
  assert.match(ext.message, /\.glb exportieren/);
  assert.equal(gltfProblem({ asset: {}, images: [{ uri: "https://example.invalid/t.png" }] }, "glb").code, "external_refs");
  assert.equal(gltfProblem({ asset: {}, extensionsRequired: ["KHR_draco_mesh_compression"] }, "glb").code, "unsupported");
  assert.equal(gltfProblem({ asset: {}, extensionsRequired: ["KHR_materials_unlit"] }, "glb"), null);
  assert.equal(gltfProblem({ buffers: [] }, "gltf").code, "invalid_format");
  assert.equal(gltfProblem(null, "glb").code, "invalid_format");
  const glb = glbSample();
  assert.equal(glbJson(glb.buffer).asset.version, "2.0");
  assert.equal(glbJson(new Uint8Array(40).buffer), null);
});

// ------------------------------------------------------------------------------------ Laden und Normieren

test("STL (Z oben, mm): Größe, Grundfläche mittig, Unterkante auf 0", async () => {
  const hass = fresh();
  const id = hass.put("stl", boxStl(200, 100, 50, [1000, -300, 20]), { unit: "mm" });
  const tpl = await loadModel(id);
  nearAll(tpl.size, [0.2, 0.1, 0.05]); // b (x), t (y des Plans = Dateiachse y), h (Dateiachse z)
  const box = worldBox(tpl.object);
  nearAll([box.min.x, box.max.x, box.min.z, box.max.z], [-0.1, 0.1, -0.05, 0.05]);
  near(box.min.y, 0);
  near(box.max.y, 0.05);
  assert.equal(tpl.plain, true);
  assert.equal(tpl.tris, 12);
  assert.equal(modelState(id), "ready");
  assert.equal(peekModel(id), tpl);
});

test("OBJ (Y oben, cm) und GLB (Y oben): Maße und Normierung", async () => {
  const hass = fresh();
  const o = hass.put("obj", objBox(100, 60, 40, [5, 5, 5]), { unit: "cm" });
  const g = hass.put("glb", glbSample(), { unit: "m" });
  const to = await loadModel(o);
  nearAll(to.size, [1, 0.4, 0.6]); // x 1 m, z (Tiefe) 0,4 m, y (Höhe) 0,6 m
  const bo = worldBox(to.object);
  nearAll([bo.min.x, bo.max.x, bo.min.y, bo.max.z], [-0.5, 0.5, 0, 0.2]);
  const tg = await loadModel(g);
  nearAll(tg.size, [2, 3, 1]);
  const bg = worldBox(tg.object);
  near((bg.min.x + bg.max.x) / 2, 0);
  near((bg.min.z + bg.max.z) / 2, 0);
  near(bg.min.y, 0);
  assert.equal(tg.plain, false);
  assert.equal(tg.tris, 2);
});

test("Gleiche Größe, egal ob Einheit oder Achse in der Datei steckt: sizeFromRaw stimmt mit dem Laden überein", async () => {
  const hass = fresh();
  for (const [ext, bytes, unit, up] of [["stl", boxStl(300, 200, 100), "mm", "z"], ["stl", boxStl(300, 200, 100), "mm", "y"], ["obj", objBox(3, 2, 1), "m", "z"]]) {
    resetModels();
    const h2 = mockHass();
    setModelHass(h2);
    const id = h2.put(ext, bytes, { unit, up });
    const file = new File([bytes], `x.${ext}`);
    const info = await inspectFile(file);
    const tpl = await loadModel(id);
    nearAll(tpl.size, sizeFromRaw(info.raw, unit, up), 1e-3);
  }
  void hass;
});

test("Cache: ein Laden je Modell, Klone teilen Geometrie, gelöschte Modelle fehlen", async () => {
  const hass = fresh();
  const id = hass.put("stl", boxStl(1, 1, 1));
  const a = loadModel(id);
  const b = loadModel(id);
  assert.equal(a, b);
  const tpl = await a;
  assert.equal(hass.calls.filter((c) => c.type === "haus3d/models/list").length, 1);
  const M = furnitureMaterials("standard");
  const i1 = instantiate(tpl, 1, 1, 1, "keep", M);
  const i2 = instantiate(tpl, 1, 1, 1, "keep", M);
  const mesh = (o) => {
    let m;
    o.traverse((x) => x.isMesh && (m = x));
    return m;
  };
  assert.equal(mesh(i1).geometry, mesh(i2).geometry);
  assert.notEqual(i1, i2);
  // Unbekannte Kennung: "missing", ohne Abruf der Datei
  await assert.rejects(loadModel("ffffffffffffffff"), (e) => e.code === "missing");
  assert.equal(modelState("ffffffffffffffff"), "missing");
});

test("Kaputte Dateien: Fehler mit Meldung, später erneut versuchen", async () => {
  const hass = fresh();
  const id = hass.put("glb", new Uint8Array(64).fill(7));
  await assert.rejects(loadModel(id), (e) => e.code === "parse" && /nicht lesen/.test(e.message));
  assert.equal(modelState(id), "error");
  // innerhalb der Wartezeit dieselbe Ablehnung, ohne neuen Abruf
  const again = loadModel(id);
  assert.equal(again, loadModel(id));
  again.catch(() => {});
});

test("Prüfen vor dem Hochladen: Größe, Verweise, Lesbarkeit", async () => {
  fresh();
  const info = await inspectFile(new File([boxStl(200, 100, 50)], "regal.stl"));
  assert.equal(info.ext, "stl");
  nearAll(info.raw, [200, 100, 50]);
  assert.equal(info.tris, 12);
  await assert.rejects(inspectFile(new File([new Uint8Array(10)], "a.exe")), /Dateiart/);
  await assert.rejects(inspectFile(new File([], "a.stl")), /leer/);
  await assert.rejects(inspectFile({ name: "a.glb", size: 26 * 1024 * 1024 }), /zu groß/);
  const ext = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "scene.bin", byteLength: 3 }] }));
  await assert.rejects(inspectFile(new File([ext], "a.gltf")), /Bitte als \.glb exportieren/);
  await assert.rejects(inspectFile(new File([new Uint8Array(64)], "a.glb")), /gültige glTF/);
  await assert.rejects(inspectFile(new File([new TextEncoder().encode("hallo")], "a.obj")), /nichts Sichtbares|nicht lesen/);
  const glb = await inspectFile(new File([glbSample()], "a.glb"));
  nearAll(glb.raw, [2, 1, 3]);
});

// ------------------------------------------------------------------------------------ Hochladen und Verwalten

test("Upload: Token zuerst, Datei zuletzt; danach steht das Modell in der Liste", async () => {
  const hass = fresh();
  setAccess("tok-test", "edit");
  const file = new File([boxStl(200, 100, 50)], "Regal.stl");
  const meta = await uploadModel(file, { name: "Regal", unit: "mm", up: "z", size: [0.2, 0.1, 0.05] });
  assert.deepEqual(hass.forms[0], ["token", "name", "unit", "up", "size_m", "file"]);
  assert.equal(meta.name, "Regal");
  assert.equal(modelList().length, 1);
  assert.deepEqual(modelMeta(meta.id).size_m, [0.2, 0.1, 0.05]);
  clearAccess();
});

test("Upload: Fehlermeldungen des Servers kommen auf Deutsch an", async () => {
  const hass = fresh();
  hass.fetchWithAuth = async () => new Response(JSON.stringify({ code: "locked", message: "Gesperrt – erst mit der PIN freischalten" }), { status: 403 });
  await assert.rejects(uploadModel(new File([boxStl(1, 1, 1)], "a.stl"), { name: "A" }), (e) => e.code === "locked" && e.status === 403 && /PIN/.test(e.message));
  hass.fetchWithAuth = async () => new Response("<html>Request Entity Too Large</html>", { status: 413 });
  await assert.rejects(uploadModel(new File([boxStl(1, 1, 1)], "a.stl"), { name: "A" }), /zu groß/);
  hass.fetchWithAuth = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(uploadModel(new File([boxStl(1, 1, 1)], "a.stl"), { name: "A" }), /Keine Verbindung/);
});

test("Umbenennen und Löschen: Befehle mit model_id und Token, Cache wird geleert", async () => {
  const hass = fresh();
  setAccess("tok-test", "edit");
  const id = hass.put("stl", boxStl(1, 1, 1), { name: "Alt" });
  await refreshModels();
  await loadModel(id);
  await renameModel(id, "Neu");
  assert.deepEqual(hass.calls.at(-1), { type: "haus3d/models/rename", model_id: id, name: "Neu", token: "tok-test" });
  assert.equal(modelMeta(id).name, "Neu");
  const changes = [];
  const off = onModelsChange((k) => changes.push(k));
  await deleteModel(id);
  assert.equal(hass.calls.at(-1).type, "haus3d/models/delete");
  assert.equal(hass.calls.at(-1).model_id, id);
  assert.equal(modelMeta(id), null);
  assert.equal(peekModel(id), null);
  await tick();
  off();
  assert.ok(changes.includes("list"));
  clearAccess();
});

// ------------------------------------------------------------------------------------ Möbeltyp custom_model

test("custom_model steht in Eigene Körper und baut ohne Modell einen Platzhalter", () => {
  assert.equal(FURNITURE.custom_model[0], "Eigenes 3D-Modell");
  assert.ok(FURNITURE_CATEGORIES.find(([c]) => c === "Eigene Körper")[1].includes("custom_model"));
  for (const style of ["standard", "cyber"]) {
    const M = furnitureMaterials(style);
    const g = buildFurniture({ id: "m1", type: "custom_model", x: 1, z: 2, rotation: 0, w: 1.2, d: 0.6, h: 0.8 }, M, 0, 2.5);
    const ph = g.children.find((c) => c.userData.placeholder);
    assert.ok(ph, style);
    assert.equal(ph.userData.placeholder, "none");
    const box = worldBox(g);
    nearAll([box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z], [1.2, 0.8, 0.6]);
    assert.equal(g.userData.furniture ?? "m1", "m1");
  }
});

test("Platzhalter wird nach dem Laden durch das Modell ersetzt; Szene bekommt die Meldung", async () => {
  const hass = fresh();
  const id = hass.put("stl", boxStl(2, 1, 0.5), { unit: "m", up: "y" }); // Y oben: Höhe 1, Tiefe 0,5
  const events = [];
  const off = onModelsChange((k) => events.push(k));
  const M = furnitureMaterials("standard");
  const g = buildFurniture({ id: "m1", type: "custom_model", model: id, x: 0, z: 0, rotation: 0, w: 2, d: 0.5, h: 1 }, M, 0, 2.5);
  assert.ok(g.children[0].userData.placeholder === "loading", "zuerst der Platzhalter");
  await loadModel(id);
  await tick();
  assert.equal(g.children.some((c) => c.userData.placeholder), false);
  const inst = g.children.find((c) => c.userData.customModel);
  assert.ok(inst);
  // Teile kennen ihr Möbel (Anklicken im 3D-Editor)
  let meshes = 0;
  inst.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      assert.equal(o.userData.furniture, "m1");
    }
  });
  assert.ok(meshes > 0);
  assert.ok(events.includes("loaded"));
  off();
  // Neuaufbau: das Modell steht sofort da (kein Platzhalter-Flackern)
  const again = buildFurniture({ id: "m1", type: "custom_model", model: id, x: 0, z: 0, rotation: 0, w: 2, d: 0.5, h: 1 }, M, 0, 2.5);
  assert.equal(again.children.some((c) => c.userData.placeholder), false);
  assert.ok(again.children.some((c) => c.userData.customModel));
});

test("Einpassen im Möbel: Seitenverhältnis behalten bzw. auf Maße strecken, mittig auf dem Boden", async () => {
  const hass = fresh();
  const id = hass.put("stl", boxStl(2, 1, 0.5), { unit: "m", up: "y" }); // b 2, t 0,5, h 1
  await loadModel(id);
  const M = furnitureMaterials("standard");
  const build = (extra) => worldBox(buildFurniture({ id: "m1", type: "custom_model", model: id, x: 5, z: 7, rotation: 0, ...extra }, M, 1, 2.5));
  const size = (b) => [b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y];
  // Originalgröße
  let b = build({ w: 2, d: 0.5, h: 1 });
  nearAll(size(b), [2, 0.5, 1]);
  near(b.min.y, 1); // Etagenhöhe 1
  // in 1 × 1 × 1: gleichmäßig auf 0,5 – Breite 1, Tiefe 0,25, Höhe 0,5
  b = build({ w: 1, d: 1, h: 1 });
  nearAll(size(b), [1, 0.25, 0.5]);
  near((b.min.x + b.max.x) / 2, 5);
  near((b.min.z + b.max.z) / 2, 7);
  // strecken: füllt den Rahmen
  b = build({ w: 1, d: 1, h: 1, fit: "stretch" });
  nearAll(size(b), [1, 1, 1]);
  // unbekannter Wert für fit: wie keep
  b = build({ w: 1, d: 1, h: 1, fit: "zoom" });
  nearAll(size(b), [1, 0.25, 0.5]);
});

test("STL/OBJ nehmen die Farbe des Möbels; GLB behält seine; Cyberpunk: Kanten nur bei kleinen Modellen", async () => {
  const hass = fresh();
  const stl = hass.put("stl", boxStl(1, 1, 1), { up: "y" });
  const glb = hass.put("glb", glbSample());
  await Promise.all([loadModel(stl), loadModel(glb)]);
  const mats = (g) => {
    const out = new Set();
    g.traverse((o) => o.isMesh && !o.userData.placeholder && out.add(o.material));
    return out;
  };
  const M = furnitureMaterials("standard");
  const red = buildFurniture({ id: "a", type: "custom_model", model: stl, x: 0, z: 0, w: 1, d: 1, h: 1, color: "#ff0000" }, M, 0, 2.5);
  const [m] = [...mats(red)];
  assert.equal(m.color.getHex(), 0xff0000);
  const plain = buildFurniture({ id: "b", type: "custom_model", model: stl, x: 0, z: 0, w: 1, d: 1, h: 1 }, M, 0, 2.5);
  assert.equal([...mats(plain)][0], M.light);
  const own = buildFurniture({ id: "c", type: "custom_model", model: glb, x: 0, z: 0, w: 2, d: 3, h: 1, color: "#ff0000" }, M, 0, 2.5);
  assert.notEqual([...mats(own)][0].color.getHex(), 0xff0000, "GLB behält seine Stoffe");
  // Cyberpunk
  const C = furnitureMaterials("cyber");
  const lines = (g) => {
    let n = 0;
    g.traverse((o) => o.isLineSegments && o.material === C.edge && n++);
    return n;
  };
  const cyber = buildFurniture({ id: "d", type: "custom_model", model: stl, x: 0, z: 0, w: 1, d: 1, h: 1 }, C, 0, 2.5);
  assert.equal(lines(cyber), 1, "genau eine Kantenlinie je Netz (nicht doppelt von furniture.js)");
  const tpl = peekModel(stl);
  const big = instantiate({ ...tpl, tris: EDGE_TRIANGLES + 1 }, 1, 1, 1, "keep", C);
  assert.equal(lines(big), 0, "sehr große Modelle ohne Kantenlinien");
});

test("Fehlendes Modell bleibt als Platzhalter (orange) stehen", async () => {
  const hass = fresh();
  const gone = hass.put("stl", boxStl(1, 1, 1));
  hass.store.delete(gone);
  const M = furnitureMaterials("standard");
  const g = buildFurniture({ id: "x", type: "custom_model", model: gone, x: 0, z: 0, w: 1, d: 1, h: 1 }, M, 0, 2.5);
  await assert.rejects(loadModel(gone));
  await tick();
  assert.equal(g.children[0].userData.placeholder, "missing");
  assert.equal(modelState(gone), "missing");
  // ungültige Kennung: gar nicht erst angefragt
  const bad = buildFurniture({ id: "y", type: "custom_model", model: "../../x", x: 0, z: 0, w: 1, d: 1, h: 1 }, M, 0, 2.5);
  assert.equal(bad.children[0].userData.placeholder, "none");
  assert.equal(hass.calls.filter((c) => c.type === "haus3d/models/list").length, 1);
});

test("Verknüpfte Entität und Schatten-Merker bleiben beim Platzhalter wie bei jedem Möbel", () => {
  fresh();
  const M = furnitureMaterials("standard");
  const g = buildFurniture({ id: "m9", type: "custom_model", x: 0, z: 0, rotation: 90, w: 1, d: 1, h: 1, entity: "light.test" }, M, 0, 2.5);
  assert.ok(Array.isArray(g.userData.bulbs));
  assert.equal(g.userData.furniture, "m9");
  let n = 0;
  g.traverse((o) => o.isMesh && o.userData.noShadow && n++);
  assert.ok(n > 0, "durchsichtiger Platzhalter wirft keinen Schatten");
});

// ------------------------------------------------------------------------------------ Editor (ohne DOM)

test("Editor: ein gesetztes Modell bringt Verweis, Name und natürliche Größe mit", async () => {
  const hass = fresh();
  const id = hass.put("stl", boxStl(300, 200, 100), { name: "Schale", unit: "mm", up: "z", size_m: [0.3, 0.2, 0.1] });
  await refreshModels();
  const ed = Object.create(ModelCatalogMethods);
  Object.assign(ed, { furnType: "custom_model", furnModel: id });
  const m = { id: "m1", type: "custom_model", w: 1, d: 1, h: 1 };
  ed._modelPlacement(m);
  assert.deepEqual({ model: m.model, name: m.name, w: m.w, d: m.d, h: m.h }, { model: id, name: "Schale", w: 0.3, d: 0.2, h: 0.1 });
  // ohne gewähltes Modell bzw. für andere Typen bleibt alles, wie es ist
  const none = { type: "custom_model", w: 1, d: 1, h: 1 };
  Object.assign(ed, { furnModel: null });
  ed._modelPlacement(none);
  assert.deepEqual(none, { type: "custom_model", w: 1, d: 1, h: 1 });
  const sofa = { type: "sofa", w: 2, d: 1, h: 1 };
  Object.assign(ed, { furnModel: id });
  ed._modelPlacement(sofa);
  assert.deepEqual(sofa, { type: "sofa", w: 2, d: 1, h: 1 });
  // Größe fehlt in den Angaben: nach dem Laden die gemessene
  const id2 = hass.put("stl", boxStl(500, 400, 300), { unit: "mm", up: "z" });
  await refreshModels();
  await loadModel(id2);
  Object.assign(ed, { furnModel: id2 });
  const m2 = { type: "custom_model", w: 1, d: 1, h: 1 };
  ed._modelPlacement(m2);
  assert.deepEqual([m2.w, m2.d, m2.h], [0.5, 0.4, 0.3]);
  assert.equal(MODEL_GROUP, "Eigene 3D-Modelle");
});

test("Eigenschaften: Felder nur für custom_model, mit Auswahl, Einpassen, Umbenennen und Löschen", async () => {
  const hass = fresh();
  const id = hass.put("glb", glbSample(), { name: "Regal <b>" });
  await refreshModels();
  await loadModel(id);
  const ed = { sim: false, b: { floors: [{ furniture: [{ type: "custom_model", model: id }, { type: "custom_model", model: id }, { type: "sofa" }] }] } };
  assert.equal(MODEL_FIELDS.html({ type: "sofa" }, ed), "");
  const html = MODEL_FIELDS.html({ id: "m1", type: "custom_model", model: id }, ed);
  for (const key of ["data-model-select", "data-model-fit", "data-model-orig", "data-model-name", "data-model-rename", "data-model-delete"]) assert.match(html, new RegExp(key), key);
  assert.match(html, /Seitenverhältnis behalten/);
  assert.match(html, /Auf Maße strecken/);
  assert.match(html, /2 Möbeln/);
  assert.match(html, /Originalgröße: 2,00 × 3,00 × 1,00 m/);
  assert.ok(!html.includes("Regal <b>"), "Namen werden maskiert");
  assert.match(html, /Regal &lt;b&gt;/);
  assert.match(html, /Farben und Texturen kommen aus dem Modell/);
  // gestreckt gewählt
  assert.match(MODEL_FIELDS.html({ type: "custom_model", model: id, fit: "stretch" }, ed), /<option value="stretch" selected>/);
  // Simulation: nichts ändern oder löschen
  const sim = MODEL_FIELDS.html({ type: "custom_model", model: id }, { ...ed, sim: true });
  assert.ok(!sim.includes("data-model-delete") && !sim.includes("data-model-rename"));
  // STL: Farbe wählbar
  const stl = hass.put("stl", boxStl(1, 1, 1));
  await refreshModels();
  assert.match(MODEL_FIELDS.html({ type: "custom_model", model: stl }, ed), /färbt das Modell ein/);
  // Modell gelöscht: Hinweis, Platzhalter bleibt, Auswahl zeigt „nicht mehr vorhanden“
  hass.store.delete(id);
  await refreshModels();
  const gone = MODEL_FIELDS.html({ type: "custom_model", model: id }, ed);
  assert.match(gone, /gibt es nicht mehr/);
  assert.match(gone, /\(nicht mehr vorhanden\)/);
  // noch kein Modell gewählt
  assert.match(MODEL_FIELDS.html({ type: "custom_model" }, ed), /Platzhalter im Plan/);
});
