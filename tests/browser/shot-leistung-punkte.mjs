// Laufende Punkte instanziert (Leistung A6): PV-Fluss und Leitungen zeichnen ihre Punkte als ein InstancedMesh (ein
// Zeichenaufruf statt eines je Punkt), ohne Schatten und ohne Ausschneiden. Das Bild gleicht dem mit einem Mesh je Punkt
// an denselben Stellen (Toleranz von Paket B: höchstens 0,1 % der Pixel über 16/255, keine Fläche über 25 px); die
// Punkte laufen in der Hintergrund-Schleife weiter und stehen nach einem Neuaufbau gleich auf der Linie, auch wenn sie
// nicht im Bild ist oder die Animationen ruhen.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("punkte", "", { width: 1000, height: 700 });
const E = (fn, arg) => pg.evaluate(fn, arg);
await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0, null, { timeout: 60000 });

/**
 * Im Browser: Zeichenaufrufe und Bild mit dem InstancedMesh gegen ein Mesh je Punkt an denselben Stellen (Kamera von oben
 * auf die Punkte), dazu ein Bild ganz ohne Punkte (zeigt, dass die Punkte im Bild sind).
 */
const vergleich = (which) =>
  E(async (w) => {
    const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
    const sc = window.panel._scene;
    const r = sc.renderer;
    const inst = w === "pv" ? sc.flow.dots : sc._pipes.get("punkte_leitung").dots;
    const W = 640;
    const H = 420;
    const rt = new THREE.WebGLRenderTarget(W, H);
    const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
    // Kamera: schräg über die Mitte der Punkte
    const box = new THREE.Box3().expandByObject(inst);
    const c = box.getCenter(new THREE.Vector3());
    const R = Math.max(2, box.getSize(new THREE.Vector3()).length());
    cam.position.set(c.x + R * 0.3, c.y + R * 0.9, c.z + R * 0.6);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    const shot = () => {
      r.info.reset();
      r.setRenderTarget(rt);
      r.render(sc.scene, cam);
      r.setRenderTarget(null);
      const px = new Uint8Array(W * H * 4);
      r.readRenderTargetPixels(rt, 0, 0, W, H, px);
      return { px, calls: r.info.render.calls };
    };
    const a = shot();
    inst.visible = false;
    const leer = shot();
    // Bezug: ein Mesh je Punkt (wie vor A6)
    const singles = [];
    for (let i = 0; i < inst.count; i++) {
      const m4 = new THREE.Matrix4();
      inst.getMatrixAt(i, m4);
      const m = new THREE.Mesh(inst.geometry, inst.material);
      m.position.setFromMatrixPosition(m4);
      inst.parent.add(m);
      singles.push(m);
    }
    const b = shot();
    for (const m of singles) m.removeFromParent();
    inst.visible = true;
    rt.dispose();
    /** Pixel über der Schwelle (16/255 in einem Kanal), größte zusammenhängende Fläche (8er-Nachbarschaft), größte Abweichung. */
    const diff = (x, y) => {
      const over = new Uint8Array(W * H);
      let n = 0;
      let max = 0;
      for (let i = 0; i < W * H; i++) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(x[i * 4 + k] - y[i * 4 + k]));
        max = Math.max(max, d);
        if (d > 16) {
          over[i] = 1;
          n++;
        }
      }
      let area = 0;
      const stack = [];
      for (let i = 0; i < W * H; i++) {
        if (over[i] !== 1) continue;
        let size = 0;
        over[i] = 2;
        stack.push(i);
        while (stack.length) {
          const j = stack.pop();
          size++;
          const jx = j % W;
          const jy = (j - jx) / W;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = jx + dx;
              const ny = jy + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const q = ny * W + nx;
              if (over[q] === 1) {
                over[q] = 2;
                stack.push(q);
              }
            }
        }
        area = Math.max(area, size);
      }
      return { anteil: n / (W * H), pixel: n, flaeche: area, max };
    };
    return {
      punkte: inst.count,
      aufrufe: { instanziert: a.calls, einzeln: b.calls, ohne: leer.calls },
      gegenEinzeln: diff(a.px, b.px),
      gegenOhne: diff(a.px, leer.px),
    };
  }, which);
const toleranz = (d) => d.anteil <= 0.001 && d.flaeche <= 25;

// --- PV-Fluss (Testhaus mit Einspeisung)
await E(() => window.panel._scene.setPerf({ frozen: true }));
const pv = await E(() => {
  const sc = window.panel._scene;
  const d = sc.flow?.dots;
  return {
    flow: !!sc.flow,
    instanziert: !!d?.isInstancedMesh,
    anzahl: d?.count,
    platz: d?.instanceMatrix.count,
    sichtbar: !!d?.visible,
    ausschneiden: d?.frustumCulled,
    schatten: d?.castShadow,
    noShadow: d?.userData.noShadow,
    meshes: sc.flow?.line.parent.children.filter((o) => o.isMesh && o !== sc.flow.line).length,
  };
});
t.results.pv = pv;
t.check(pv.flow && pv.instanziert && pv.anzahl === 10 && pv.platz === 10 && pv.sichtbar && pv.ausschneiden === false && pv.schatten === false && pv.noShadow === true && pv.meshes === 1, `punkte: PV-Fluss ${JSON.stringify(pv)}`);
// läuft in der Hintergrund-Schleife weiter
const lage = () =>
  E(() => {
    const d = window.panel._scene.flow.dots;
    return Array.from(d.instanceMatrix.array.slice(12, 15));
  });
const l0 = await lage();
await E(() => window.panel._scene.setPerf({ frozen: false }));
await pg.waitForTimeout(1200);
const l1 = await lage();
await E(() => window.panel._scene.setPerf({ frozen: true }));
await pg.waitForTimeout(300);
t.results.pvLauf = { vorher: l0, nachher: l1 };
t.check(l0.some((v, i) => Math.abs(v - l1[i]) > 1e-4), `punkte: PV-Punkte laufen nicht ${JSON.stringify(t.results.pvLauf)}`);
// Lage auf der Kurve wie scene-loop.js (Phase + i/n)
const kurve = await E(() => {
  const f = window.panel._scene.flow;
  const a = f.dots.instanceMatrix.array;
  let max = 0;
  for (let i = 0; i < 10; i++) {
    const v = f.curve.getPointAt((f.phase + i / 10) % 1);
    max = Math.max(max, Math.hypot(a[i * 16 + 12] - v.x, a[i * 16 + 13] - v.y, a[i * 16 + 14] - v.z));
  }
  return max;
});
t.check(kurve < 1e-5, `punkte: PV-Punkte nicht auf der Kurve (Abweichung ${kurve})`);
const pvBild = await vergleich("pv");
t.results.pvBild = pvBild;
t.check(pvBild.aufrufe.instanziert === pvBild.aufrufe.ohne + 1 && pvBild.aufrufe.einzeln === pvBild.aufrufe.ohne + 10, `punkte: PV-Zeichenaufrufe ${JSON.stringify(pvBild.aufrufe)}`);
t.check(pvBild.gegenOhne.pixel > 100, `punkte: PV-Punkte nicht im Bild ${JSON.stringify(pvBild.gegenOhne)}`);
t.check(toleranz(pvBild.gegenEinzeln), `punkte: PV-Bild weicht von einzelnen Punkten ab ${JSON.stringify(pvBild.gegenEinzeln)}`);
// Einspeisung aus: Punkte unsichtbar, Platz bleibt
const pvAus = await E(() => {
  const sc = window.panel._scene;
  sc.applyStates({ ...sc._lastStates, feedIn: 0 });
  const d = sc.flow.dots;
  const out = { sichtbar: d.visible, anzahl: d.count };
  sc.applyStates({ ...sc._lastStates, feedIn: 800 });
  out.wieder = d.visible;
  return out;
});
t.results.pvAus = pvAus;
t.check(!pvAus.sichtbar && pvAus.anzahl === 10 && pvAus.wieder, `punkte: PV-Fluss aus/an ${JSON.stringify(pvAus)}`);

// Neuaufbau mit gehaltener Kamera, Flusslinie nicht im Bild (nahe Ansicht), laufend und in der Pause: die Punkte stehen
// gleich auf der Linie (die Bildschleife setzt sie nur, solange die Linie im Bild ist und nichts ruht), nicht als Kugel im
// Ursprung der Etage
const view0 = await E(() => window.panel._scene.getView());
for (const frozen of [false, true]) {
  const neu = await E(async (fr) => {
    const sc = window.panel._scene;
    sc.setPerf({ frozen: false });
    const box = sc.viewBox();
    const g = sc.flow.line.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const c = g.boundingSphere.center;
    // Ecke des Hauses, die am weitesten vom Fluss entfernt ist, von knapp darüber
    const corners = [[box.min[0], box.min[2]], [box.min[0], box.max[2]], [box.max[0], box.min[2]], [box.max[0], box.max[2]]];
    const [x, z] = corners.sort((a, b) => Math.hypot(b[0] - c.x, b[1] - c.z) - Math.hypot(a[0] - c.x, a[1] - c.z))[0];
    sc.setView({ target: [x, 0, z], position: [x + 0.3, 2.5, z + 0.3] }, { duration: 0 });
    await new Promise((r) => setTimeout(r, 600));
    if (fr) sc.setPerf({ frozen: true });
    sc.setBuilding(window.panel._building, { keepCamera: true });
    sc.applyStates({ ...sc._lastStates, feedIn: 800 });
    await new Promise((r) => setTimeout(r, 1500));
    sc._loop.frustum = null;
    const f = sc.flow;
    const a = f.dots.instanceMatrix.array;
    let max = 0;
    let origin = 0;
    for (let i = 0; i < f.dots.count; i++) {
      const v = f.curve.getPointAt((f.phase + i / f.dots.count) % 1);
      max = Math.max(max, Math.hypot(a[i * 16 + 12] - v.x, a[i * 16 + 13] - v.y, a[i * 16 + 14] - v.z));
      if (Math.hypot(a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]) < 1e-6) origin++;
    }
    return { frozen: sc._frozen, imBild: sc._inView(f.line), sichtbar: f.dots.visible, anzahl: f.dots.count, abstand: max, imUrsprung: origin };
  }, frozen);
  t.results[`neuaufbau${frozen ? "Pause" : ""}`] = neu;
  t.check(neu.frozen === frozen && !neu.imBild && neu.sichtbar && neu.anzahl === 10 && neu.abstand < 1e-5 && neu.imUrsprung === 0, `punkte: PV-Punkte nach dem Neuaufbau außerhalb des Bilds${frozen ? " in der Pause" : ""} nicht auf der Linie ${JSON.stringify(neu)}`);
}
await E((v) => {
  const sc = window.panel._scene;
  sc.setView(v, { duration: 0 });
  sc.setPerf({ frozen: true }); // wie vorher (eingefroren seit dem Lauf der PV-Punkte)
}, view0);
await pg.waitForTimeout(800);

// --- Leitung mit Fluss (Stromleitung: ersetzt die Luftlinie des PV-Flusses)
await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.floors.find((f) => f.id === "eg").pipes = [{ id: "punkte_leitung", type: "strom", points: [[1, 1], [6, 1], [6, 4]], heights: [0.3, 0.3, 0.3], entity: null, room: null }];
  p._setBuilding(b, p._revision, { keepCamera: true });
});
// _setBuilding stellt über _applyWeather eine Aktualisierung der Zustände an (_queueUpdate, nächstes Bild bzw. 200 ms): sie
// setzte sonst die echten Werte der Leitung (0 W) über die von Hand gesetzten
await pg.waitForFunction(() => window.panel._scene._pipes?.has("punkte_leitung") && window.panel._net?.edges?.some((e) => e.pipeId === "punkte_leitung") && !window.panel._updPending, null, { timeout: 15000 }).catch(() => {});
await E(() => window.panel._scene.setPerf({ frozen: true }));
const leitung = await E(() => {
  const p = window.panel;
  const sc = p._scene;
  const edges = (p._net?.edges ?? []).filter((e) => e.pipeId === "punkte_leitung").map((e) => ({ ...e, value: 2400, unit: "W" }));
  sc.setPipeFlow({ edges });
  const pipe = sc._pipes.get("punkte_leitung");
  const eds = [...sc._pipeEdges.values()].filter((e) => e.pipe === pipe);
  const d = pipe.dots;
  return {
    flow: !!sc.flow,
    kanten: eds.length,
    punkte: eds.reduce((n, e) => n + e.n, 0),
    instanziert: !!d?.isInstancedMesh,
    anzahl: d?.count,
    sichtbar: !!d?.visible,
    ausschneiden: d?.frustumCulled,
    schatten: d?.castShadow,
    noShadow: d?.userData.noShadow,
    meshes: pipe.group.children.filter((o) => o.isInstancedMesh).length,
  };
});
t.results.leitung = leitung;
t.check(!leitung.flow && leitung.kanten >= 1 && leitung.instanziert && leitung.anzahl === leitung.punkte && leitung.punkte > 5 && leitung.sichtbar && leitung.ausschneiden === false && leitung.schatten === false && leitung.noShadow === true && leitung.meshes === 1, `punkte: Leitung ${JSON.stringify(leitung)}`);
const lBild = await vergleich("leitung");
t.results.leitungBild = lBild;
t.check(lBild.aufrufe.instanziert === lBild.aufrufe.ohne + 1 && lBild.aufrufe.einzeln === lBild.aufrufe.ohne + lBild.punkte, `punkte: Leitung Zeichenaufrufe ${JSON.stringify(lBild.aufrufe)}`);
t.check(lBild.gegenOhne.pixel > 100, `punkte: Leitungspunkte nicht im Bild ${JSON.stringify(lBild.gegenOhne)}`);
t.check(toleranz(lBild.gegenEinzeln), `punkte: Leitungsbild weicht von einzelnen Punkten ab ${JSON.stringify(lBild.gegenEinzeln)}`);
// Ebene „Energiefluss“ aus: Punkte unsichtbar
const ebene = await E(() => {
  const sc = window.panel._scene;
  const d = sc._pipes.get("punkte_leitung").dots;
  sc.setLayers({ ...sc.layers, flow: false });
  const aus = d.visible;
  sc.setLayers({ ...sc.layers, flow: true });
  return { aus, an: d.visible };
});
t.check(ebene.aus === false && ebene.an === true, `punkte: Ebene Energiefluss ${JSON.stringify(ebene)}`);
await t.done();
