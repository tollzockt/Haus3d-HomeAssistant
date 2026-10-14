// Texturen: neue Betontexturen erzeugbar und in den Listen, alte Betontextur unverändert, Drehung von Boden-
// texturen (eigene Kopie je Drehung, geteilt, Richtung wie die Möbel-Drehung), Materialien je Drehung.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { FLOOR_MATERIALS, TEXTURES, textureFor, textureOptions, textureRotation } from "../../custom_components/haus3d/frontend/model.js";
import { TEXTURE_KEYS, getTexture } from "../../custom_components/haus3d/frontend/textures.js";
import { HouseScene } from "../../custom_components/haus3d/frontend/scene.js";

const NEW = ["concrete_polished", "concrete_formwork", "screed", "epoxy_chips", "concrete_slabs"];

/** Canvas-Ersatz für node: jede Zeichen-Methode wird mitgeschrieben (Name und Zahlen, gerundet). */
function fakeDocument(log) {
  const grad = { addColorStop: (...a) => log.push(["stop", ...a]) };
  const ctx = new Proxy(
    {},
    {
      get(t, k) {
        if (k in t) return t[k];
        if (k === "createLinearGradient" || k === "createRadialGradient") return (...a) => (log.push([k, ...a.map((v) => Math.round(v * 100))]), grad);
        return (...a) => log.push([k, ...a.map((v) => (typeof v === "number" ? Math.round(v * 100) : v))]);
      },
      set(t, k, v) {
        t[k] = v;
        if (k === "fillStyle" || k === "strokeStyle") log.push([k, typeof v === "string" ? v : "grad"]);
        return true;
      },
    },
  );
  return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

function withDocument(log, fn) {
  const had = "document" in globalThis;
  const old = globalThis.document;
  globalThis.document = fakeDocument(log);
  try {
    return fn();
  } finally {
    if (had) globalThis.document = old;
    else delete globalThis.document;
  }
}

/** Kurzer Fingerabdruck (FNV-1a) einer Zeichenfolge. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

// als erster Test: danach liegt "concrete" im Zwischenspeicher und wird nicht mehr gezeichnet
test("Die bisherige Betontextur zeichnet unverändert (alte Häuser)", () => {
  const log = [];
  withDocument(log, () => getTexture("concrete"));
  assert.ok(log.length > 1000);
  assert.equal(fnv(JSON.stringify(log)), CONCRETE_PRINT);
});
const CONCRETE_PRINT = "825ada35"; // Zeichenschritte von DRAW.concrete (Stand vor den neuen Betontexturen)

test("Jede Textur der Listen lässt sich zeichnen, neue Betontexturen eingeschlossen", () => {
  const keys = TEXTURES.map(([k]) => k);
  for (const k of keys) assert.ok(TEXTURE_KEYS.includes(k), k);
  for (const k of NEW) assert.ok(keys.includes(k), k);
  for (const k of keys) {
    const log = [];
    const t = withDocument(log, () => getTexture(k));
    assert.ok(t?.isTexture, k);
    // schon im Zwischenspeicher: nicht neu gezeichnet
    if (NEW.includes(k)) assert.ok(log.length > 200, `${k}: ${log.length} Zeichenschritte`);
    assert.equal(withDocument([], () => getTexture(k)), t);
  }
  assert.equal(getTexture("quatsch"), null);
  assert.equal(getTexture(null), null);
});

test("Neue Betontexturen: Flächenarten, Kachelgrößen und Bodenbeläge mit Standardtextur", () => {
  const opts = (kind) => textureOptions(kind).map(([k]) => k);
  for (const k of NEW) assert.ok(opts("f").includes(k), `Boden: ${k}`);
  for (const k of ["concrete_polished", "concrete_formwork"]) assert.ok(opts("w").includes(k), `Wand: ${k}`);
  for (const k of ["screed", "concrete_slabs"]) assert.ok(opts("g").includes(k), `Gelände: ${k}`);
  assert.ok(!opts("r").some((k) => NEW.includes(k)));
  const tiles = Object.fromEntries(NEW.map((k) => [k, withDocument([], () => getTexture(k)).repeat.toArray().map((v) => Math.round(1000 / v) / 1000)]));
  assert.deepEqual(tiles.concrete_slabs, [1.2, 1.2]); // 2 × 2 Platten zu 60 cm
  assert.deepEqual(tiles.concrete_formwork, [2.4, 1.2]); // eine Schaltafel
  for (const [k, [w, h]] of Object.entries(tiles)) assert.ok(w >= 0.5 && w <= 3 && h >= 0.5 && h <= 3, k);
  // Beläge: Schlüssel eindeutig, jeder neue mit eigener Standardtextur
  assert.equal(new Set(FLOOR_MATERIALS.map(([k]) => k)).size, FLOOR_MATERIALS.length);
  const std = { concrete_polished: "concrete_polished", exposed_concrete: "concrete_formwork", screed: "screed", epoxy_chips: "epoxy_chips", concrete_slabs: "concrete_slabs" };
  for (const [mat, tex] of Object.entries(std)) {
    assert.ok(FLOOR_MATERIALS.some(([k, , c]) => k === mat && /^#[0-9a-f]{6}$/.test(c)), mat);
    assert.equal(textureFor("floor", "", mat), tex);
  }
  // alte Häuser: Beton und Epoxid bleiben bei der bisherigen Textur
  assert.equal(textureFor("floor", "", "concrete"), "concrete");
  assert.equal(textureFor("floor", "", "epoxy"), "concrete");
});

test("textureRotation: 0 … 360, ungültig 0", () => {
  assert.equal(textureRotation(-90), 270);
  assert.equal(textureRotation(450), 90);
  assert.equal(textureRotation("45"), 45);
  assert.equal(textureRotation(359.9999), 0);
  for (const v of [null, undefined, "", "abc", true, NaN, Infinity, 0, 360, -720]) assert.equal(textureRotation(v), 0, String(v));
});

test("Gedrehte Textur: eigene Kopie je Drehung, Bild geteilt, Grundtextur unverändert, Richtung im Uhrzeigersinn", () => {
  const base = withDocument([], () => getTexture("parquet"));
  assert.equal(getTexture("parquet", null, 0), base);
  assert.equal(getTexture("parquet", null, 360), base);
  const r90 = getTexture("parquet", null, 90);
  assert.notEqual(r90, base);
  assert.equal(r90.source, base.source); // dasselbe Bild (eine GPU-Textur)
  assert.equal(getTexture("parquet", null, 450), r90);
  assert.equal(getTexture("parquet", null, -270), r90);
  assert.ok(r90.repeat.equals(base.repeat) && r90.wrapS === THREE.RepeatWrapping && r90.colorSpace === base.colorSpace);
  assert.equal(base.rotation, 0);
  // Dielen laufen im Bild entlang u: nach 45° im Plan (x rechts, z unten) entlang (1, 1)/√2, also nach rechts unten
  const r45 = getTexture("parquet", null, 45);
  r45.updateMatrix();
  const uvOf = ([x, z]) => new THREE.Vector2(x, -z).applyMatrix3(r45.matrix);
  const a = uvOf([0, 0]);
  const along = uvOf([1, 1]).sub(a);
  const across = uvOf([1, -1]).sub(a);
  assert.ok(Math.abs(along.y) < 1e-9 && Math.abs(along.x) > 0.5, `entlang ${along.toArray()}`);
  assert.ok(Math.abs(across.x) < 1e-9 && Math.abs(across.y) > 0.5, `quer ${across.toArray()}`);
});

test("Felder „Textur drehen (°)“: unter der Textur von Raum, Gartenfläche und Dachterrasse, nicht bei „glatt“", async () => {
  const { textureField, texRotField } = await import("../../custom_components/haus3d/frontend/editor-roof.js");
  const { roofFieldsHtml } = await import("../../custom_components/haus3d/frontend/editor-roofunits.js");
  const f = textureField("floor_texture", "Boden: Textur", "parquet", "f", ["floor_texture_rotation", 450]);
  assert.match(f, /<select data-tex="floor_texture">[\s\S]*<\/select><label>Textur drehen \(°\)<\/label>/);
  assert.match(f, /data-texrot="floor_texture_rotation" value="90"/);
  assert.match(f, /data-texrot90="floor_texture_rotation"/);
  assert.doesNotMatch(textureField("floor_texture", "Boden", "none", "f", ["floor_texture_rotation", 90]), /data-texrot/);
  assert.doesNotMatch(textureField("texture", "Textur", "", "g"), /data-texrot/); // ohne Drehung wie bisher
  assert.match(texRotField("texture_rotation", undefined), /value="0"/);
  assert.match(roofFieldsHtml({ type: "terrace", texture: "slabs", texture_rotation: 30 }, { type: "terrace" }), /data-rn="texture_rotation" value="30"/);
  assert.doesNotMatch(roofFieldsHtml({ type: "terrace", texture: "none" }, { type: "terrace" }), /texture_rotation/);
  assert.doesNotMatch(roofFieldsHtml({ type: "flat" }, { type: "flat" }), /texture_rotation/);
});

test("Materialien mit Textur: Drehung im Schlüssel, gleiche Drehung geteilt, Jahreszeit-Schlüssel bleibt", () => {
  const sc = { style: "standard", texMats: new Map(), renderer: null };
  const base = new THREE.MeshStandardMaterial({ color: 0x55aa33 });
  const tm = (key, rot) => withDocument([], () => HouseScene.prototype._texMat.call(sc, base, key, "ground:lawn", false, rot));
  const m0 = tm("grass", 0);
  const m90 = tm("grass", 90);
  assert.notEqual(m0, m90);
  assert.equal(tm("grass", 450), m90);
  assert.equal(tm("grass", undefined), m0);
  assert.equal(m0.map, getTexture("grass"));
  assert.equal(m90.map, getTexture("grass", null, 90));
  assert.ok([...sc.texMats.keys()].every((k) => k.startsWith("ground:lawn:grass:")));
  assert.deepEqual([...sc.texMats.keys()], ["ground:lawn:grass:55aa33", "ground:lawn:grass:55aa33:90"]);
  // ohne Textur: Drehung egal, Grundmaterial selbst
  assert.equal(tm(null, 90), base);
});
