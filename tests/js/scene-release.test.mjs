// Szene abgeben (scene-release.js): Die dispose-Listener des abgegebenen Renderers verschwinden auch von geteilten
// Objekten (Textur-Cache, Kontaktschatten, Modell-Vorlagen), die eines anderen Renderers bleiben. Der Renderer ist hier
// nachgebaut wie in three.js: je Renderer eine Funktion je Art, die sich beim dispose() des Objekts selbst abnimmt.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../custom_components/haus3d/frontend/vendor/three.module.min.js";
import { disposeReleasing, threeResources } from "../../custom_components/haus3d/frontend/scene-release.js";
import { sharedModelParts, placeholder } from "../../custom_components/haus3d/frontend/models.js";

function fakeRenderer({ lost = false } = {}) {
  const own = (name) => {
    const f = (ev) => ev.target.removeEventListener("dispose", f);
    Object.defineProperty(f, "name", { value: name });
    return f;
  };
  const fns = { tex: own("onTextureDispose"), geo: own("onGeometryDispose"), mat: own("onMaterialDispose") };
  const reg = (o, f) => {
    if (!o.hasEventListener("dispose", f)) o.addEventListener("dispose", f);
  };
  return {
    fns,
    initTexture: (t) => reg(t, fns.tex),
    /** Bild einer Szene (Kontext verloren: zeichnet nichts, wie WebGLRenderer.render) */
    render(scene) {
      if (!lost) this.draw(scene);
    },
    /** wie ein Bild: alles Sichtbare bekommt die Listener dieses Renderers */
    draw(root) {
      root.traverse((o) => {
        if (o.geometry) reg(o.geometry, fns.geo);
        for (const m of [].concat(o.material ?? [])) {
          reg(m, fns.mat);
          for (const v of Object.values(m)) if (v?.isTexture) reg(v, fns.tex);
        }
      });
    },
  };
}

const listeners = (o) => [...(o._listeners?.dispose ?? [])];

function sharedSet() {
  const tex = new THREE.Texture();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.userData.keep = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  mat.userData.keep = true;
  return { tex, geo, mat };
}

test("Listener des abgegebenen Renderers verschwinden von geteilten Objekten, die des anderen bleiben", () => {
  const shared = sharedSet();
  const live = fakeRenderer();
  const dead = fakeRenderer();
  const sceneLive = new THREE.Scene();
  sceneLive.add(new THREE.Mesh(shared.geo, shared.mat));
  live.draw(sceneLive);
  const sceneDead = new THREE.Scene();
  const ownTex = new THREE.Texture();
  const own = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ownTex }));
  sceneDead.add(own, new THREE.Mesh(shared.geo, shared.mat));
  dead.draw(sceneDead);
  assert.equal(listeners(shared.geo).length, 2);
  assert.equal(listeners(shared.tex).length, 2);

  const n = disposeReleasing(dead, [sceneDead], () => {
    // aufräumen wie HouseScene._dispose: eigene Objekte ja, geteilte (keep) nicht
    sceneDead.traverse((o) => {
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      for (const m of [].concat(o.material ?? [])) {
        if (m.userData.keep) continue;
        m.map?.dispose();
        m.dispose();
      }
    });
  });
  assert.equal(n, 3, "je ein Listener an geteilter Textur, Geometrie und Stoff");
  for (const k of ["tex", "geo", "mat"]) {
    assert.deepEqual(listeners(shared[k]), [live.fns[k]], `${k}: nur noch der lebende Renderer`);
  }
  assert.deepEqual(listeners(own.geometry), []);
  assert.deepEqual(listeners(ownTex), []);
  // der lebende Renderer räumt seine Objekte weiter selbst auf
  shared.tex.dispose();
  assert.deepEqual(listeners(shared.tex), []);
});

test("ohne eigene Textur: die Probetextur zeigt den Textur-Listener", () => {
  const shared = sharedSet();
  const live = fakeRenderer();
  const dead = fakeRenderer();
  const a = new THREE.Scene();
  a.add(new THREE.Mesh(shared.geo, shared.mat));
  live.draw(a);
  const b = new THREE.Scene();
  b.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()), new THREE.Mesh(shared.geo, shared.mat));
  dead.draw(b);
  disposeReleasing(dead, [b], () => {
    b.children[0].geometry.dispose();
    b.children[0].material.dispose();
  });
  assert.deepEqual(listeners(shared.tex), [live.fns.tex]);
  assert.deepEqual(listeners(shared.geo), [live.fns.geo]);
  assert.deepEqual(listeners(shared.mat), [live.fns.mat]);
});

test("Szene entsorgt geteilte Blatt-Geometrie und Flammen-Stoff (ohne keep), die auch der andere Renderer zeichnet: dessen Listener bleiben an den Vorlagen", () => {
  const shared = sharedSet(); // Vorlage eines eigenen Modells (keep)
  const leaf = new THREE.SphereGeometry(1, 8, 6); // modulweit geteilt ohne keep (home-parts.js:leafGeo)
  const flame = new THREE.MeshBasicMaterial(); // modulweit geteilt ohne keep (Flammen)
  const live = fakeRenderer();
  const dead = fakeRenderer();
  const a = new THREE.Scene();
  a.add(new THREE.Mesh(shared.geo, shared.mat), new THREE.Mesh(leaf, flame));
  live.draw(a);
  const b = new THREE.Scene();
  b.add(new THREE.Mesh(shared.geo, shared.mat), new THREE.Mesh(leaf, flame));
  dead.draw(b);
  const n = disposeReleasing(dead, [b], () => {
    // wie HouseScene._dispose: Geometrien und Stoffe ohne keep
    leaf.dispose();
    flame.dispose();
  });
  for (const k of ["tex", "geo", "mat"]) assert.deepEqual(listeners(shared[k]), [live.fns[k]], `${k}: Listener des lebenden Renderers fehlt`);
  assert.equal(n, 3);
  // der lebende Renderer zeichnet Blatt und Flamme beim nächsten Bild neu und gibt die Vorlage später selbst frei
  shared.geo.dispose();
  assert.deepEqual(listeners(shared.geo), []);
});

test("Kontext verloren (Probe zeichnet nicht): Listener wie bisher aus dem Aufräumen", () => {
  const shared = sharedSet();
  const live = fakeRenderer();
  const dead = fakeRenderer({ lost: true });
  const a = new THREE.Scene();
  a.add(new THREE.Mesh(shared.geo, shared.mat));
  live.draw(a);
  const b = new THREE.Scene();
  const own = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  b.add(own, new THREE.Mesh(shared.geo, shared.mat));
  dead.draw(b);
  disposeReleasing(dead, [b], () => {
    own.geometry.dispose();
    own.material.dispose();
  });
  for (const k of ["tex", "geo", "mat"]) assert.deepEqual(listeners(shared[k]), [live.fns[k]], k);
});

test("ein Renderer ohne Bild: nichts abzunehmen, dispose läuft trotzdem", () => {
  const shared = sharedSet();
  const live = fakeRenderer();
  const a = new THREE.Scene();
  a.add(new THREE.Mesh(shared.geo, shared.mat));
  live.draw(a);
  let ran = false;
  const n = disposeReleasing(fakeRenderer(), [a], () => {
    ran = true;
  });
  assert.ok(ran);
  assert.equal(n, 0);
  assert.deepEqual(listeners(shared.geo), [live.fns.geo]);
});

test("Renderer ohne initTexture (Kontext fehlt): kein Fehler", () => {
  let ran = false;
  assert.equal(
    disposeReleasing({}, [], () => {
      ran = true;
    }),
    0,
  );
  assert.ok(ran);
});

test("threeResources: Szenengraph, Stoff-Sammlungen (Objekte, Listen, Maps) und Texturen in Stoffen und uniforms", () => {
  const t1 = new THREE.Texture();
  const t2 = new THREE.Texture();
  const t3 = new THREE.Texture();
  const m1 = new THREE.MeshStandardMaterial({ map: t1, normalMap: t2 });
  const m2 = new THREE.ShaderMaterial({ uniforms: { tex: { value: t3 } } });
  const m3 = new THREE.MeshBasicMaterial();
  const g = new THREE.BoxGeometry();
  const scene = new THREE.Scene();
  scene.background = new THREE.Texture();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, [m1, m2]));
  scene.add(group);
  const pools = { mats: { wall: m3, list: [m1] }, texMats: new Map([["a", m3]]) };
  const dom = new (class Element {})(); // keine einfachen Objekte: werden nicht durchsucht
  dom.material = new THREE.MeshBasicMaterial();
  const r = threeResources([scene, pools, dom, null, 3, "x"]);
  for (const x of [t1, t2, t3, m1, m2, m3, g, scene.background]) assert.ok(r.has(x));
  assert.ok(!r.has(dom.material));
  assert.equal(r.size, 8);
});

test("sharedModelParts: Ersatzstoff und Platzhalter-Stoffe der Modelle gehören dazu", () => {
  placeholder(1, 1, 1, "loading");
  const parts = threeResources(sharedModelParts());
  const ph = placeholder(1, 1, 1, "loading");
  const mats = [];
  ph.traverse((o) => o.material && mats.push(o.material));
  assert.equal(mats.length, 2);
  for (const m of mats) assert.ok(parts.has(m), "Platzhalter-Stoff");
  assert.ok([...parts].some((m) => m.isMeshStandardMaterial && m.userData.keep), "Ersatzstoff");
});
