// Eigene 3D-Modelle: STL hochladen (Dialog mit Einheitsvorschlag), Kachel im Katalog, Modell in den Plan setzen,
// in 3D zeigen (Platzhalter → Modell), Einpassen und Originalgröße, Umbenennen, Löschen (Platzhalter bleibt),
// Fehlermeldungen (falsche Datei, externe Verweise, zu groß, ohne Freigabe), Hauptansicht mit dem Modell.
// Der Server wird im Test nachgebaut (fetchWithAuth und die Befehle haus3d/models/…).
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("modelle", "");
const E = (fn, arg) => pg.evaluate(fn, arg);

/** Binäre STL: Quader mit den Kanten sx, sy, sz (Z oben). */
function boxStl(sx, sy, sz) {
  const v = (x, y, z) => [x * sx, y * sy, z * sz];
  const quads = [
    [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)],
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((tri, i) => tri.forEach((p, j) => p.forEach((c, k) => buf.writeFloatLE(c, 84 + i * 50 + 12 + j * 12 + k * 4))));
  return buf;
}

// --- Server nachbauen: Liste, Umbenennen, Löschen, Hochladen, Abrufen (mit Prüfung der PIN-Freigabe)
await E(() => {
  const h = window.hass;
  const store = (window.__models = new Map());
  let n = 0;
  const listing = () => ({ models: [...store.values()].map((e) => e.meta), used: [...store.values()].reduce((s, e) => s + e.bytes.byteLength, 0), limits: { file: 25 * 1024 * 1024, total: 300 * 1024 * 1024, count: 200 } });
  const edit = (token) => {
    const scope = (window.tokens ?? {})[token];
    if (scope !== "edit" && scope !== "admin") throw { code: "locked", message: "Gesperrt – erst mit der PIN freischalten" };
  };
  const orig = h.callWS;
  h.callWS = async (msg) => {
    if (!msg.type?.startsWith("haus3d/models/")) return orig(msg);
    window.calls.push(msg);
    if (msg.type === "haus3d/models/list") return listing();
    edit(msg.token);
    if (msg.type === "haus3d/models/delete") store.delete(msg.model_id);
    if (msg.type === "haus3d/models/rename") store.get(msg.model_id).meta.name = msg.name;
    return listing();
  };
  h.fetchWithAuth = async (path, init = {}) => {
    window.fetches = [...(window.fetches ?? []), `${init.method ?? "GET"} ${path}`];
    if (init.method === "POST") {
      const f = init.body;
      try {
        edit(f.get("token"));
      } catch (e) {
        return new Response(JSON.stringify(e), { status: 403 });
      }
      const file = f.get("file");
      const id = (++n).toString(16).padStart(16, "0");
      const bytes = await file.arrayBuffer();
      const meta = { id, name: f.get("name"), ext: file.name.split(".").pop().toLowerCase(), size: bytes.byteLength, created: "2026-01-01T00:00:00+00:00", unit: f.get("unit"), up: f.get("up") || "y", size_m: f.get("size_m")?.split(",").map(Number), thumb: f.get("thumb") || undefined };
      store.set(id, { meta, bytes });
      return new Response(JSON.stringify({ model: meta }), { status: 201 });
    }
    const e = store.get(path.split("/").pop());
    return e ? new Response(e.bytes) : new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
  };
});

await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(500);
await pg.locator("haus3d-panel .floorsel").selectOption("eg");
await pg.locator("haus3d-panel .ed-bar button[data-tool=furniture]").click();
await pg.waitForTimeout(300);

// --- Bereich „Eigene 3D-Modelle“ im Katalog: leer, mit Knopf
let sect = await E(() => ({ head: !!window.panel._editor.props.querySelector('.grp[data-grp="Eigene 3D-Modelle"]'), upload: !!window.panel._editor.props.querySelector("[data-model-upload]"), tiles: window.panel._editor.props.querySelectorAll("[data-model-tile]").length, generic: !!window.panel._editor.props.querySelector("input.search") }));
t.results.catalogEmpty = sect;
t.check(sect.head && sect.upload && sect.tiles === 0, `Bereich leer: ${JSON.stringify(sect)}`);

// --- Fehlerfälle im Dialog
const openDialog = async (file) => {
  await pg.locator("haus3d-panel [data-model-upload]").click();
  await pg.setInputFiles("haus3d-panel [data-model-file]", file);
  await pg.waitForFunction(() => window.panel._editor._modelDlg && !window.panel._editor._modelDlg.textContent.includes("wird geprüft"), null, { timeout: 8000 });
};
const dialogText = () => E(() => window.panel._editor._modelDlg?.textContent ?? "");
const closeDialog = async () => {
  await pg.locator("haus3d-panel .ed-mdl [data-model-cancel]").last().click();
  await pg.waitForFunction(() => !window.panel._editor._modelDlg);
};
await openDialog({ name: "kaputt.glb", mimeType: "model/gltf-binary", buffer: Buffer.from("das ist keine glb-datei, nur Text".repeat(3)) });
let txt = await dialogText();
t.check(/gültige glTF/.test(txt), `Fehler kaputte GLB: ${txt}`);
await closeDialog();
const external = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "scene.bin", byteLength: 4 }] }));
await openDialog({ name: "extern.gltf", mimeType: "model/gltf+json", buffer: external });
txt = await dialogText();
t.check(/Bitte als \.glb exportieren/.test(txt), `Fehler externe Verweise: ${txt}`);
await closeDialog();
await openDialog({ name: "gross.stl", mimeType: "model/stl", buffer: Buffer.alloc(26 * 1024 * 1024) });
txt = await dialogText();
t.check(/zu groß/.test(txt), `Fehler zu groß: ${txt}`);
await closeDialog();
await openDialog({ name: "bild.png", mimeType: "image/png", buffer: Buffer.from("x") });
txt = await dialogText();
t.check(/Dateiart/.test(txt), `Fehler falsche Endung: ${txt}`);
await closeDialog();
t.check((await E(() => window.__models.size)) === 0, "Fehlerfälle haben etwas hochgeladen");

// --- Hocker.stl (400 × 400 × 450 mm, Z oben): Einheitsvorschlag mm, Größe 0,40 × 0,40 × 0,45 m
await openDialog({ name: "Hocker_rund.stl", mimeType: "model/stl", buffer: boxStl(400, 400, 450) });
const dlg = await E(() => {
  const d = window.panel._editor._modelDlg;
  return { name: d.querySelector("[data-model-name]").value, unit: d.querySelector("[data-model-unit]").value, up: d.querySelector("[data-model-up]")?.value, size: d.querySelector("[data-model-size]").textContent, hint: d.textContent.includes("Vorschlag") };
});
t.results.dialog = dlg;
t.check(dlg.name === "Hocker rund" && dlg.unit === "mm" && dlg.up === "z" && /0,40 × 0,40 × 0,45 m/.test(dlg.size) && dlg.hint, `Dialog: ${JSON.stringify(dlg)}`);
// Einheit ändern → Größe rechnet neu (Zentimeter: 4 × 4 × 4,5 m; Meter: 400 m, das sieht ungewöhnlich aus)
await pg.locator("haus3d-panel .ed-mdl [data-model-unit]").selectOption("cm");
const cm = await E(() => window.panel._editor._modelDlg.querySelector("[data-model-size]").textContent);
t.check(/4,00 × 4,00 × 4,50 m/.test(cm) && !/ungewöhnlich/.test(cm), `Größe in Zentimetern: ${cm}`);
await pg.locator("haus3d-panel .ed-mdl [data-model-unit]").selectOption("m");
const odd = await E(() => window.panel._editor._modelDlg.querySelector("[data-model-size]").textContent);
t.check(/ungewöhnlich/.test(odd), `Warnung bei 400 m: ${odd}`);
await pg.locator("haus3d-panel .ed-mdl [data-model-unit]").selectOption("mm");
await t.shot(pg, "modelle-dialog.png");

// ohne Freigabe: Fehlermeldung im Dialog, nichts hochgeladen
await E(() => {
  window.__tokens = window.tokens;
  window.tokens = {};
});
await pg.locator("haus3d-panel .ed-mdl [data-model-go]").click();
await pg.waitForFunction(() => /Gesperrt/.test(window.panel._editor._modelDlg?.textContent ?? ""), null, { timeout: 5000 });
t.check((await E(() => window.__models.size)) === 0, "ohne Freigabe hochgeladen");
await E(() => (window.tokens = window.__tokens));
// ein älteres Modell ohne Vorschaubild liegt schon auf dem Server (kommt mit der Liste nach dem Hochladen)
await E(() => window.__models.set("00000000000000ff", { meta: { id: "00000000000000ff", name: "Altes Modell", ext: "stl", size: 3, created: "2025-01-01T00:00:00+00:00", unit: "m", up: "z" }, bytes: new Uint8Array(3) }));
await pg.locator("haus3d-panel .ed-mdl [data-model-go]").click();
await pg.waitForFunction(() => !window.panel._editor._modelDlg, null, { timeout: 8000 });
const up = await E(() => ({ forms: window.fetches.filter((f) => f.startsWith("POST")).length, models: [...window.__models.values()].map((e) => e.meta).filter((m) => m.id !== "00000000000000ff") }));
t.results.upload = up;
t.check(up.models.length === 1 && up.models[0].unit === "mm" && up.models[0].up === "z" && up.models[0].name === "Hocker rund" && up.models[0].size_m.join() === "0.4,0.4,0.45", `Upload: ${JSON.stringify(up)}`);
const id = up.models[0].id;

// --- Kachel im Katalog, gewählt
await pg.waitForSelector(`haus3d-panel [data-model-tile="${id}"]`);
t.check(await E((i) => window.panel._editor.furnType === "custom_model" && window.panel._editor.furnModel === i && window.panel._editor.props.querySelector(`[data-model-tile="${i}"]`).classList.contains("sel"), id), "Kachel nicht gewählt");
// Vorschaubild kommt vom Server (beim Hochladen im Browser gerendert), die Modelldatei wird dafür nicht geladen
const thumb = await E((i) => !!window.panel._editor.props.querySelector(`[data-model-tile="${i}"] img`), id);
t.check(thumb, "kein Vorschaubild der Kachel");
const shown = await E((i) => ({ src: window.__models.get(i).meta.thumb ?? "", old: !!window.panel._editor.props.querySelector(`[data-model-tile="00000000000000ff"] img`), oldIcon: !!window.panel._editor.props.querySelector(`[data-model-tile="00000000000000ff"] .ph ha-icon`), gets: (window.fetches ?? []).filter((f) => f.startsWith("GET")).length }), id);
t.results.thumb = { length: shown.src.length, old: shown.old, oldIcon: shown.oldIcon, gets: shown.gets };
t.check(/^data:image\/png;base64,/.test(shown.src) && shown.src.length > 200 && shown.src.length < 150 * 1024, `Vorschaubild im Upload: ${shown.src.slice(0, 40)}… (${shown.src.length})`);
t.check(!shown.old && shown.oldIcon, "Altes Modell ohne Bild zeigt nicht das Symbol");
t.check(shown.gets === 0, `Katalog hat ${shown.gets} Modelldatei(en) geladen`);
await t.shot(pg, "modelle-katalog.png");

// --- Suche findet das Modell
await pg.locator("haus3d-panel .ed-props .search").fill("hocker");
t.check((await pg.locator("haus3d-panel .ed-props [data-model-tile]").count()) === 1, "Suche findet das Modell nicht");
await pg.locator("haus3d-panel .ed-props .search").fill("");

// --- in den Plan setzen (Wohnzimmer)
const spot = await E(() => {
  const e = window.panel._editor;
  const room = e.floor.rooms.find((r) => r.id === "wohnzimmer") ?? e.floor.rooms[0];
  const xs = room.points.map((p) => p[0]);
  const zs = room.points.map((p) => p[1]);
  const [px, pz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const r = e.svg.getBoundingClientRect();
  return [r.left + e.tx + px * e.scale, r.top + e.tz + pz * e.scale];
});
await pg.mouse.click(spot[0], spot[1]);
await pg.waitForTimeout(400);
const placed = await E(() => window.panel._editor.floor.furniture.at(-1));
t.results.placed = placed;
t.check(placed.type === "custom_model" && placed.model === id && placed.name === "Hocker rund" && placed.w === 0.4 && placed.d === 0.4 && placed.h === 0.45, `Gesetztes Möbel: ${JSON.stringify(placed)}`);

// --- 3D: Modell erscheint (Platzhalter weg), Maße stimmen
const dims = (fid) =>
  E(async (f) => {
    const THREE = await import("../../custom_components/haus3d/frontend/vendor/three.module.min.js");
    let top = null;
    window.panel._editor.scene3d.root.traverse((o) => {
      if (!top && o.userData.furniture === f && o.parent?.userData.furniture !== f) top = o;
    });
    if (!top) return null;
    top.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(top, true);
    const s = b.getSize(new THREE.Vector3());
    let model = 0;
    let ph = 0;
    top.traverse((o) => {
      if (o.userData.customModel) model++;
      if (o.userData.placeholder) ph++;
    });
    return { size: [s.x, s.z, s.y].map((v) => Math.round(v * 1000) / 1000), model, ph };
  }, fid);
await pg.waitForFunction(async () => {
  const e = window.panel._editor;
  let n = 0;
  e.scene3d?.root.traverse((o) => o.userData.customModel && n++);
  return n >= 1;
}, null, { timeout: 15000 });
let d3 = await dims(placed.id);
t.results.dims3d = d3;
t.check(d3.model === 1 && d3.ph === 0 && d3.size[0] === 0.4 && d3.size[1] === 0.4 && d3.size[2] === 0.45, `3D-Maße: ${JSON.stringify(d3)}`);
await pg.waitForTimeout(400);
await t.shot(pg, "modelle-editor.png");

// --- Eigenschaften: Modell-Auswahl, Einpassen, Originalgröße
const props = await E(() => {
  const p = window.panel._editor.props;
  return { select: p.querySelector("[data-model-select]")?.value, fit: p.querySelector("[data-model-fit]")?.value, orig: !!p.querySelector("[data-model-orig]"), name: p.querySelector("[data-model-name]")?.value, uses: /von 1 Möbel /.test(p.textContent) };
});
t.results.props = props;
t.check(props.select === id && props.fit === "keep" && props.orig && props.name === "Hocker rund" && props.uses, `Eigenschaften: ${JSON.stringify(props)}`);
// Rahmen ändern: 1 × 0,5 × 0,45
await E(() => {
  const e = window.panel._editor;
  e.change((fl) => {
    Object.assign(fl.furniture.find((m) => m.id === e.sel.id), { w: 1, d: 0.5, h: 0.45 });
  });
  e.renderProps();
});
await pg.waitForTimeout(500);
d3 = await dims(placed.id);
// Seitenverhältnis behalten: die Höhe (0,45) begrenzt, das Modell bleibt in Originalgröße und mittig im größeren Rahmen
t.check(d3.size.every((v, i) => Math.abs(v - [0.4, 0.4, 0.45][i]) < 0.002), `behalten: ${JSON.stringify(d3)}`);
await pg.locator("haus3d-panel .ed-props [data-model-fit]").selectOption("stretch");
await pg.waitForTimeout(500);
d3 = await dims(placed.id);
t.check(Math.abs(d3.size[0] - 1) < 0.002 && Math.abs(d3.size[1] - 0.5) < 0.002 && Math.abs(d3.size[2] - 0.45) < 0.002, `strecken: ${JSON.stringify(d3)}`);
t.check((await E(() => window.panel._editor.floor.furniture.at(-1).fit)) === "stretch", "fit nicht gespeichert");
await t.shot(pg, "modelle-strecken.png");
await pg.locator("haus3d-panel .ed-props [data-model-orig]").click();
await pg.waitForTimeout(500);
const orig = await E(() => {
  const m = window.panel._editor.floor.furniture.at(-1);
  return [m.w, m.d, m.h];
});
t.check(orig.join() === "0.4,0.4,0.45", `Originalgröße: ${orig}`);
await pg.locator("haus3d-panel .ed-props [data-model-fit]").selectOption("keep");
t.check((await E(() => "fit" in window.panel._editor.floor.furniture.at(-1))) === false, "fit keep sollte nicht gespeichert werden");

// --- zweites Modell wählen: Größe und Name wechseln
await pg.locator("haus3d-panel .ed-bar button[data-tool=furniture]").click();
await openDialog({ name: "Tisch.stl", mimeType: "model/stl", buffer: boxStl(1200, 800, 750) });
await pg.locator("haus3d-panel .ed-mdl [data-model-go]").click();
await pg.waitForFunction(() => !window.panel._editor._modelDlg, null, { timeout: 8000 });
const id2 = await E(() => [...window.__models.keys()].at(-1));
await E((fid) => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: fid };
  e.tool = "select";
  e.renderBar();
  e.renderProps();
}, placed.id);
await pg.locator("haus3d-panel .ed-props [data-model-select]").selectOption(id2);
await pg.waitForTimeout(600);
const swapped = await E(() => window.panel._editor.floor.furniture.at(-1));
t.check(swapped.model === id2 && swapped.w === 1.2 && swapped.d === 0.8 && swapped.h === 0.75 && swapped.name === "Tisch", `Modellwechsel: ${JSON.stringify(swapped)}`);
await pg.locator("haus3d-panel .ed-props [data-model-select]").selectOption(id);

// --- Umbenennen
await pg.locator("haus3d-panel .ed-props [data-model-name]").fill("Kleiner Hocker");
await pg.locator("haus3d-panel .ed-props [data-model-rename]").click();
await pg.waitForFunction((i) => window.__models.get(i).meta.name === "Kleiner Hocker", id, { timeout: 5000 });
t.check((await E(() => window.panel._editor.props.querySelector("[data-model-select] option[selected]")?.textContent)) === "Kleiner Hocker", "Auswahl zeigt den neuen Namen nicht");

// --- Löschen: Rückfrage, Datei weg, Möbel bleibt als Platzhalter
await E((fid) => {
  const e = window.panel._editor;
  e.sel = { kind: "furniture", id: fid };
  e.renderProps();
}, placed.id);
await pg.locator("haus3d-panel .ed-props [data-model-delete]").click();
await pg.waitForSelector("haus3d-panel .confirm .yes");
const ask = await E(() => window.panel.shadowRoot.querySelector(".confirm .ct")?.textContent);
t.check(/Kleiner Hocker/.test(ask) && /1 Möbel/.test(ask) && /nicht rückgängig/.test(ask), `Rückfrage: ${ask}`);
await pg.waitForTimeout(500);
await pg.locator("haus3d-panel .confirm .yes").click();
await pg.waitForFunction((i) => !window.__models.has(i), id, { timeout: 5000 });
await pg.waitForTimeout(900);
d3 = await dims(placed.id);
const hint = await E(() => window.panel._editor.props.querySelector(".mdl-fields .warn")?.textContent ?? "");
t.results.afterDelete = { d3, hint };
t.check(d3 && d3.model === 0 && d3.ph === 1 && /gibt es nicht mehr/.test(hint), `Nach dem Löschen: ${JSON.stringify({ d3, hint })}`);
t.check((await E(() => window.panel._editor.floor.furniture.at(-1).model)) === id, "Möbel verliert den Verweis");
await t.shot(pg, "modelle-geloescht.png");

// --- Cyberpunk-Stil: Modell mit Kante (zweites Modell setzen und neu laden)
await pg.locator("haus3d-panel .ed-props [data-model-select]").selectOption(id2);
await pg.waitForTimeout(600);
await E(() => window.panel._editor.scene3d.setStyle("cyber"));
await pg.waitForTimeout(1200);
const edges = await E(() => {
  let lines = 0;
  let meshes = 0;
  window.panel._editor.scene3d.root.traverse((o) => {
    if (!o.userData.customModel) return;
    o.traverse((x) => {
      if (x.isMesh) meshes++;
      if (x.isLineSegments) lines++;
    });
  });
  return { lines, meshes };
});
t.results.cyber = edges;
t.check(edges.meshes >= 1 && edges.lines === edges.meshes, `Kanten im Cyberpunk-Stil: ${JSON.stringify(edges)}`);
await t.shot(pg, "modelle-cyber.png");
await E(() => window.panel._editor.scene3d.setStyle("standard"));

// --- Haupt-Szene: Modell in der normalen Ansicht (Editor zu, Grundriss mit Möbel gesetzt)
await E(() => window.panel._editor.onClose?.());
await pg.waitForTimeout(400);
await E((i) => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  const room = eg.rooms.find((r) => r.id === "wohnzimmer") ?? eg.rooms[0];
  const xs = room.points.map((q) => q[0]);
  const zs = room.points.map((q) => q[1]);
  eg.furniture.push({ id: "m_modell", type: "custom_model", model: i, x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, rotation: 30, w: 1.2, d: 0.8, h: 0.75, color: "#c0392b" });
  p._setBuilding(b, p._revision, { keepCamera: true });
  p._setFilter("eg");
}, id2);
await pg.waitForFunction(() => {
  let n = 0;
  window.panel._scene.root.traverse((o) => o.userData.customModel && n++);
  return n >= 1;
}, null, { timeout: 15000 });
await pg.waitForTimeout(800);
const main = await E(() => {
  let model = 0;
  let ph = 0;
  window.panel._scene.root.traverse((o) => {
    if (o.userData.customModel) model++;
    if (o.userData.placeholder) ph++;
  });
  return { model, ph };
});
t.results.main = main;
t.check(main.model === 1 && main.ph === 0, `Hauptansicht: ${JSON.stringify(main)}`);
await t.shot(pg, "modelle-haus.png");

await t.done();
