// Bildvergleich für die Arbeit an der Bildrate: feste Ansichten als PNG aufnehmen und zwei Aufnahmen Pixel für Pixel
// vergleichen. Kein "shot-"-Präfix: läuft nur von Hand.
//   NODE_PATH="$(npm root -g)" node tests/browser/bildvergleich.mjs aufnehmen <ordner> [--ansichten a,b] [--faktor 1,2] [--abfrage "&schattenkarte=immer"]
//   NODE_PATH="$(npm root -g)" node tests/browser/bildvergleich.mjs vergleichen <a> <b> [--ausgabe <ordner>] [--schwelle 16] [--toleranz b|gleich]
// Aufnehmen – feste Bedingungen: Stufe ?quality=ausgewogen&schatten=an, Sonne fest (?sun=180,45), feste Uhr
// (21.06.2026, 12:00 Uhr Berlin), Ebenen „Fluss“ und „Wetter“ aus, Hintergrund-Animationen eingefroren
// (setPerf({frozen:true})), Punkte von PV-Fluss, Hausfluss und Leitungen auf Phase 0 (sie zählen beim Schattenbereich mit),
// feste Kamera; gewartet wird, bis sich die Kamera nicht mehr bewegt und stats.renders stillsteht.
// Je Ansicht und Faktor (deviceScaleFactor 1 und 2) zwei Bilder: <ansicht>-flaeche.png (nur die Zeichenfläche, ein Bild
// der Szene wie zuletzt gezeichnet) und <ansicht>-seite.png (Bildschirmfoto mit Beschriftungen und Bedienelementen).
// Ansichten: alle-schraeg, erdgeschoss, dach-flach, dach-oben, nacht, cyberpunk, demo, raum-gewaehlt, tuer-offen,
// editor-auswahl, gross, kellerwechsel, etagenwechsel und zurueckgedreht. zurueckgedreht prüft die progressive Auflösung
// (Bewegungs-Auflösung 1 über haus3d.moveDpr, wirkt mit Faktor 2): mit der Maus wegdrehen, Auslauf abwarten, per
// Kamerafahrt zurück, dann dieselbe Pose wie alle-schraeg – muss pixelgleich mit ihr sein. kellerwechsel und
// etagenwechsel wechseln erst nach dem Festsetzen der Schattenkarte die
// Etage, damit sie nur der Etagenwechsel selbst erneuert (im Testhaus zeigt „EG“ alle Etagen, darum der Keller, der das EG
// samt Garten ausblendet): kellerwechsel „Alle“ → KG (fehlt die Schatten-Marke, bleiben die Schatten des EG liegen),
// etagenwechsel KG und zurück zu „Alle“ (muss wie alle-schraeg aussehen; fehlt die Marke auf dem Rückweg, bleiben die
// Schatten der Kelleransicht stehen).
// Vergleichen – PNGs werden im Browser mit createImageBitmap(…, {colorSpaceConversion: "none", premultiplyAlpha: "none"})
// entpackt. Kennzahlen je Bild: Anteil der Pixel, die in einem Kanal um mehr als --schwelle/255 abweichen, größte
// zusammenhängende Fläche solcher Pixel (8er-Nachbarschaft), größte Abweichung, Differenzbild (<name>-diff.png: rot über der
// Schwelle, gelb darunter). Urteil: „gleich“ = kein Pixel weicht ab; „b“ = höchstens 0,1 % über der Schwelle und keine
// Fläche größer als 25 px. --toleranz bestimmt den Rückgabewert. Zusätzlich innerhalb von <b>: etagenwechsel und
// zurueckgedreht je ↔ alle-schraeg.
// Zwei Aufnahmen desselben Stands sind bei den -flaeche-Bildern pixelgleich; die -seite-Bilder (Bildschirmfoto) können an
// weichgezeichneten Hintergründen (backdrop-filter, z. B. Etagenleiste) um bis zu 2/255 schwanken – „pixelgleich“ gilt
// darum für die -flaeche-Bilder, die -seite-Bilder werden mit der Schwelle bewertet.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fixedTimeInit, root, start } from "./lib.mjs";
import { bigHouse } from "./grosshaus.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const list = (v) => String(v).split(",").map((x) => x.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLOCK = Date.parse("2026-06-21T12:00:00+02:00");
const BASE = "?quality=ausgewogen&schatten=an&sun=180,45";

// ------------------------------------------------------------------ Ansichten

/**
 * Ansichten: query (zusätzlich zu BASE), haus (standard|demo|gross), vor(p) in der Seite (vor dem Einfrieren der Kamera),
 * nach: wie vor, aber nach normalize() (Schattenkarte schon festgesetzt), kamera: Voreinstellung (camera.js) oder
 * {az, polar, abstand} um die Mitte der sichtbaren Etagen bzw. eine Funktion, speicher: Einträge in localStorage.
 */
const VIEWS = {
  "alle-schraeg": { kamera: "iso" },
  erdgeschoss: { vor: "etage", kamera: "iso" },
  "dach-flach": { query: "&roof=gable", kamera: { az: -35, polar: 1.32, abstand: 1.15 } },
  "dach-oben": { query: "&roof=gable", kamera: "oben" },
  nacht: { vor: "nacht", kamera: "iso" },
  cyberpunk: { vor: "cyber", kamera: "iso" },
  demo: { haus: "demo", kamera: "iso" },
  "raum-gewaehlt": { vor: "raum", kamera: "iso" },
  "tuer-offen": { vor: "etage", kamera: "tuer" },
  "editor-auswahl": { vor: "editor", kamera: "iso" },
  gross: { haus: "gross", kamera: "iso" },
  kellerwechsel: { nach: "keller", kamera: "iso" },
  etagenwechsel: { nach: "wechsel", kamera: "iso" },
  zurueckgedreht: { nach: "drehen", kamera: "iso", speicher: { "haus3d.moveDpr": "1" } },
};

/** Ansichten, die innerhalb einer Aufnahme wie eine andere aussehen müssen. */
const SAME_AS = { etagenwechsel: "alle-schraeg", zurueckgedreht: "alle-schraeg" };

/** Vorbereitung in der Seite (Ansicht → Stil, Etage, Auswahl …). */
async function prepare(pg, what) {
  if (!what) return;
  if (what === "etage") {
    await pg.evaluate(() => window.panel._setFilter("eg"));
  } else if (what === "nacht" || what === "cyber") {
    await pg.evaluate((st) => {
      const p = window.panel;
      p._settings.style = st === "cyber" ? "cyber" : "night";
      p._applyStyle();
    }, what);
  } else if (what === "raum") {
    await pg.evaluate(() => window.panel._selectRoom({ floorId: "eg", roomId: "wohnzimmer" }));
  } else if (what === "keller") {
    await pg.evaluate(() => window.panel._setFilter("kg"));
  } else if (what === "wechsel") {
    await pg.evaluate(() => window.panel._setFilter("kg"));
    await waitStill(pg, "haupt", { min: 800 });
    await pg.evaluate(() => window.panel._setFilter("all"));
  } else if (what === "drehen") {
    // wegdrehen ab einer Stelle ohne Antippbares (waagerecht: der Blickwinkel von oben bleibt, damit auch die Möbel innen)
    const spot = await pg.evaluate(() => {
      const p = window.panel;
      const c = p._scene.renderer.domElement;
      const box = c.getBoundingClientRect();
      for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        for (const fx of [0.15, 0.1, 0.2, 0.05, 0.25]) {
          const x = box.left + box.width * fx;
          const y = box.top + box.height * fy;
          if (p.shadowRoot.elementFromPoint(x, y) === c && p._scene.pick(x, y) === null) return { x, y };
        }
      }
      return null;
    });
    if (!spot) throw new Error("drehen: keine freie Stelle auf der Zeichenfläche");
    await pg.evaluate(() => {
      const r = window.panel._scene.renderer;
      const set = r.setPixelRatio.bind(r);
      window.__dpr = [];
      r.setPixelRatio = (v) => {
        window.__dpr.push(v);
        return set(v);
      };
    });
    await pg.mouse.move(spot.x, spot.y);
    await pg.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await pg.mouse.move(spot.x + i * 20, spot.y);
      await sleep(50);
    }
    await pg.mouse.up();
    await waitStill(pg, "haupt");
    const weg = await pg.evaluate(() => window.panel._scene.getView());
    await pg.evaluate(() => window.panel._scene.viewPreset("iso", 0, { duration: 700 }));
    await waitStill(pg, "haupt");
    // Restschwung verwerfen: die Steuerung behält nach dem Auslauf einen winzigen Rest der Drehung, den jedes update()
    // weiter anwendet – die Pose läge sonst um Bruchteile eines Pixels neben der von alle-schraeg (Kanten weichen ab)
    await pg.evaluate(() => {
      const c = window.panel._scene.controls;
      c._sphericalDelta?.set(0, 0, 0);
      c._panOffset?.set(0, 0, 0);
    });
    return pg.evaluate((w) => {
      const sc = window.panel._scene;
      return { weg: w, raeume: window.panel._panels?.length ?? 0, filter: window.panel._filter, umschaltungen: [...window.__dpr], ruhend: sc._loop?.still ?? null, bewegt: sc._loop?.move ?? null };
    }, weg);
  } else if (what === "editor") {
    await pg.evaluate(() => window.panel._setFilter("eg"));
    await pg.evaluate(() => {
      window.__edUnlock = window.panel._startEdit();
    });
    await pg.waitForFunction(() => !!window.panel.shadowRoot.querySelector(".pinpad") || window.panel._editMode, null, { timeout: 30000 });
    if (await pg.evaluate(() => !!window.panel.shadowRoot.querySelector(".pinpad"))) await pg.keyboard.type("0000", { delay: 60 });
    await pg.waitForFunction(() => window.panel._editMode && !window.panel.shadowRoot.querySelector(".pinpad"), null, { timeout: 30000 });
    await pg.evaluate(() => {
      window.__edOpen = window.panel._openEditor();
    });
    await pg.waitForFunction(() => window.panel._editor?.scene3d?.floors?.size > 0 && window.panel._editor.scene3d.stats.renders > 0, null, { timeout: 90000 });
    const id = await pg.evaluate(() => {
      const e = window.panel._editor;
      const m = e.floor.furniture.find((f) => f.type === "sofa") ?? e.floor.furniture[0];
      e.sel = { kind: "furniture", id: m.id };
      e.render();
      e.renderProps();
      e.scene3d.setPerf({ frozen: true });
      return m.id;
    });
    return { auswahl: id };
  }
  return null;
}

/**
 * Bewegliche Punkte auf eine feste Stelle (Phase 0) und die Schattenkamera neu einrichten: _applyShadows() misst den
 * Schattenbereich über alle Teile der Etagen, auch über die (ausgeblendeten) Punkte von PV-Fluss, Hausfluss und
 * Leitungen. Je nachdem, wo sie beim Einfrieren gerade standen, lägen die Schattenkanten sonst um Bruchteile eines Pixels
 * anders. Auch die Ebenen „Fluss“ und „Wetter“ der jeweiligen Szene aus.
 */
async function normalize(pg, key) {
  await pg.evaluate((k) => {
    const p = window.panel;
    const sc = k === "editor" ? p._editor.scene3d : p._scene;
    if (k === "editor") sc.setLayers({ ...sc.layers, flow: false, weather: false });
    const place = (dots, curve, reverse = false) => {
      if (!curve?.getPointAt) return;
      if (dots?.isInstancedMesh) {
        // Punkte als ein InstancedMesh (scene-pipes.js:_setDots)
        const n = dots.count;
        sc._setDots(dots, Array.from({ length: n }, (_, i) => curve.getPointAt(reverse ? 1 - i / n : i / n)));
        return;
      }
      if (!Array.isArray(dots)) return;
      dots.forEach((d, i) => d.position?.copy?.(curve.getPointAt(reverse ? 1 - i / dots.length : i / dots.length)));
    };
    if (sc.flow) {
      sc.flow.phase = 0;
      place(sc.flow.dots, sc.flow.curve);
    }
    for (const f of sc._houseFlow?.list ?? []) {
      f.phase = 0;
      place(f.dots, f.curve, f.reverse);
    }
    for (const ed of sc._pipeEdges?.values() ?? []) ed.phase = 0;
    if (sc._pipeEdges?.size) sc._stepPipes?.(0);
    sc.setPerf({ frozen: true });
    sc._applyShadows?.();
    sc.invalidate();
  }, key);
}

/** Kamera fest setzen (ohne Fahrt). key: "haupt" oder "editor". */
async function placeCamera(pg, key, cam) {
  return pg.evaluate(([k, c]) => {
    const p = window.panel;
    const sc = k === "editor" ? p._editor.scene3d : p._scene;
    if (typeof c === "string" && c !== "tuer") {
      sc.viewPreset(c, 0, { duration: 0 });
      return sc.getView();
    }
    let target;
    let position;
    if (c === "tuer") {
      // offene Doppeltür (Testseite: wz_fenster_west als zweiflügelige Glastür, Kontakt offen), von außen schräg
      const item = sc.floors.get("eg").openings.get("wz_fenster_west");
      const v = sc.camera.position.clone();
      item.leaves[0].pivot.getWorldPosition(v);
      const w = sc.camera.position.clone();
      item.leaves[item.leaves.length - 1].pivot.getWorldPosition(w);
      target = v.clone().add(w).multiplyScalar(0.5);
      target.y = 1.1;
      position = target.clone().add(v.clone().set(-4.2, 2.4, 2.2));
    } else {
      const vb = sc.viewBox();
      const center = sc.camera.position.clone().set((vb.min[0] + vb.max[0]) / 2, (vb.min[1] + vb.max[1]) / 2, (vb.min[2] + vb.max[2]) / 2);
      const diag = Math.hypot(vb.max[0] - vb.min[0], vb.max[1] - vb.min[1], vb.max[2] - vb.min[2]);
      const az = (c.az * Math.PI) / 180;
      const r = diag * c.abstand;
      target = center;
      position = center.clone().add(center.clone().set(r * Math.sin(c.polar) * Math.sin(az), r * Math.cos(c.polar), r * Math.sin(c.polar) * Math.cos(az)));
    }
    sc.setView({ target: target.toArray(), position: position.toArray() }, { duration: 0 });
    return sc.getView();
  }, [key, cam]);
}

/** Warten, bis die Kamera stillsteht, nichts mehr animiert und stats.renders sich 1,5 s nicht ändert (höchstens 90 s). */
async function waitStill(pg, key, { min = 0 } = {}) {
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  for (;;) {
    const s = await pg.evaluate((k) => {
      const p = window.panel;
      const sc = k === "editor" ? p._editor?.scene3d : p._scene;
      return { r: sc.stats.renders, cam: [...sc.camera.matrixWorld.elements].map((x) => x.toFixed(6)).join(","), anim: !!sc._animating, dirty: !!sc._dirty };
    }, key);
    const sig = `${s.r}|${s.cam}|${s.anim}|${s.dirty}`;
    if (sig !== last) {
      last = sig;
      since = Date.now();
    }
    if (!s.anim && !s.dirty && Date.now() - since >= 1500 && Date.now() - t0 >= min) return true;
    if (Date.now() - t0 > 90000) return false;
    await sleep(250);
  }
}

// ------------------------------------------------------------------ aufnehmen

async function record(dir, { views, factors, extra }) {
  await mkdir(dir, { recursive: true });
  const files = {};
  if (views.includes("gross")) files["/bildvergleich-gross.json"] = JSON.stringify(await bigHouse());
  const seed = JSON.parse(await readFile(join(root, "custom_components/haus3d/haus-daten.json"), "utf8"));
  const t = await start(dir, { files });
  const meta = { datum: new Date().toISOString(), uhrInDerSeite: new Date(CLOCK).toISOString(), browser: t.browser.version(), basis: BASE, abfrage: extra, ansichten: {} };
  for (const f of factors) {
    const sub = join(dir, `f${f}`);
    await mkdir(sub, { recursive: true });
    for (const name of views) {
      const v = VIEWS[name];
      const house = v.haus ?? "standard";
      const query = `${BASE}${v.query ?? ""}${house === "gross" ? "&data=/bildvergleich-gross.json" : ""}${extra}`;
      const pg = await t.page(`${name}-f${f}`, query, {
        width: 1280,
        height: 800,
        scale: f,
        wait: 0,
        context: { timezoneId: "Europe/Berlin", locale: "de-DE" },
        setup: async (p) => {
          await p.addInitScript(fixedTimeInit, CLOCK);
          await p.addInitScript((st) => {
            try {
              localStorage.setItem("haus3d.editorView", "split");
              for (const [k, val] of Object.entries(st)) localStorage.setItem(k, val);
            } catch {
              /* ohne Speicher */
            }
          }, v.speicher ?? {});
          if (house === "demo") {
            await p.addInitScript(({ seed: s }) => {
              try {
                localStorage.setItem("haus3d.house", JSON.stringify({ id: "test1", name: "Vorführhaus", live: false, demo: true }));
              } catch {
                /* ohne Speicher */
              }
              window.sandbox = { test1: { name: "Vorführhaus", revision: 1, demo: true, building: s } };
            }, { seed });
          }
        },
      });
      await pg.waitForFunction(() => window.panel?._building && window.panel._scene?.floors?.size > 0 && window.panel._scene.stats.renders > 0 && !window.panel._loading, null, { timeout: 120000 });
      if (house === "demo") await pg.waitForFunction(() => window.panel._isDemo?.() && window.panel._demo && window.panel._buildingHouse === "test1", null, { timeout: 30000 });
      // feste Bedingungen: Ebenen „Fluss“ und „Wetter“ aus, Hintergrund eingefroren
      await pg.evaluate(() => {
        const p = window.panel;
        p._settings.layers.flow = false;
        p._settings.layers.weather = false;
        p._scene.setLayers(p._settings.layers);
        p._applyOverlayLayers?.();
        p._scene.setPerf({ frozen: true });
      });
      await waitStill(pg, "haupt");
      const info = (await prepare(pg, v.vor)) ?? {};
      const key = v.vor === "editor" ? "editor" : "haupt";
      if (key === "haupt") await waitStill(pg, "haupt");
      await normalize(pg, key);
      if (v.nach) {
        await waitStill(pg, key);
        Object.assign(info, (await prepare(pg, v.nach)) ?? {});
      }
      info.kamera = await placeCamera(pg, key, v.kamera);
      // Beschriftungen setzen sich nach der Kamera; Hinweise (Toasts) verschwinden nach 4 s
      const still = await waitStill(pg, key, { min: 4500 });
      await pg.evaluate(() => window.panel.shadowRoot.querySelectorAll(".toast").forEach((e) => e.remove()));
      await sleep(300);
      const canvas = await pg.evaluate((k) => {
        const p = window.panel;
        const sc = k === "editor" ? p._editor.scene3d : p._scene;
        sc.renderer.render(sc.scene, sc.camera); // dasselbe Bild noch einmal, damit die Zeichenfläche lesbar ist
        const c = sc.renderer.domElement;
        return { url: c.toDataURL("image/png"), w: c.width, h: c.height, dpr: sc.renderer.getPixelRatio(), renders: sc.stats.renders, matrix: [...sc.camera.matrixWorld.elements] };
      }, key);
      await writeFile(join(sub, `${name}-flaeche.png`), Buffer.from(canvas.url.split(",")[1], "base64"));
      await pg.screenshot({ path: join(sub, `${name}-seite.png`), animations: "disabled", caret: "hide" });
      // matrix: Kamera beim Aufnehmen, volle Genauigkeit (gleiche Pose ⇒ gleiche Zahlen)
      meta.ansichten[`f${f}/${name}`] = { query, ...info, ruhig: still, flaeche: `${canvas.w}×${canvas.h}`, dpr: canvas.dpr, bilder: canvas.renders, matrix: canvas.matrix };
      console.log(`aufgenommen: f${f}/${name} (${canvas.w}×${canvas.h}, Auflösung ${canvas.dpr}${still ? "" : ", NICHT ruhig"})`);
    }
  }
  meta.fehler = t.errors.filter((e) => !e.includes("404"));
  await writeFile(join(dir, "aufnahme.json"), JSON.stringify(meta, null, 1));
  await t.done();
}

// ------------------------------------------------------------------ vergleichen

/** Läuft in der Seite: zwei PNGs (URLs) entpacken und vergleichen; Differenzbild als data:-URL. */
async function compareInPage([ua, ub, thr]) {
  const decode = async (u) => {
    const blob = await (await fetch(u)).blob();
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height);
  };
  const a = await decode(ua);
  const b = await decode(ub);
  if (a.width !== b.width || a.height !== b.height) return { fehler: `Größe ${a.width}×${a.height} ≠ ${b.width}×${b.height}` };
  const w = a.width;
  const h = a.height;
  const n = w * h;
  const A = a.data;
  const B = b.data;
  const mask = new Uint8Array(n);
  const out = new ImageData(w, h);
  const O = out.data;
  let over = 0;
  let any = 0;
  let max = 0;
  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    const d = Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2]), Math.abs(A[k + 3] - B[k + 3]));
    const gray = Math.round((0.299 * A[k] + 0.587 * A[k + 1] + 0.114 * A[k + 2]) * 0.35 + 150);
    if (d > max) max = d;
    if (d > thr) {
      mask[i] = 1;
      over++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      O[k] = 230;
      O[k + 1] = 0;
      O[k + 2] = 0;
    } else if (d > 0) {
      any++;
      O[k] = 255;
      O[k + 1] = 190;
      O[k + 2] = 0;
    } else {
      O[k] = O[k + 1] = O[k + 2] = gray;
    }
    O[k + 3] = 255;
  }
  any += over;
  // größte zusammenhängende Fläche über der Schwelle (8er-Nachbarschaft)
  let largest = 0;
  let largestBox = null;
  let regions = 0;
  const stack = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (mask[i] !== 1) continue;
    regions++;
    let sp = 0;
    let size = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    stack[sp++] = i;
    mask[i] = 2;
    while (sp) {
      const j = stack[--sp];
      size++;
      const x = j % w;
      const y = (j / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if ((dx || dy) && xx >= 0 && xx < w) {
            const q = yy * w + xx;
            if (mask[q] === 1) {
              mask[q] = 2;
              stack[sp++] = q;
            }
          }
        }
      }
    }
    if (size > largest) {
      largest = size;
      largestBox = [x0, y0, x1, y1];
    }
  }
  let diff = null;
  if (any > 0) {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d").putImageData(out, 0, 0);
    const blob = await c.convertToBlob({ type: "image/png" });
    diff = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  }
  return { breite: w, hoehe: h, pixel: n, abweichend: any, ueberSchwelle: over, anteil: over / n, groessteFlaeche: largest, groessteFlaecheBox: largestBox, flaechen: regions, maxAbweichung: max, box: bx1 >= 0 ? [bx0, by0, bx1, by1] : null, diff };
}

async function pngs(dir) {
  const out = [];
  for (const e of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(".png") || e.name.endsWith("-diff.png")) continue;
    const rel = join(e.parentPath ?? e.path, e.name).slice(resolve(dir).length + 1).replace(/\\/g, "/");
    if (!rel.startsWith("vergleich")) out.push(rel);
  }
  return out.sort();
}

async function compare(a, b, { out, thr, tol }) {
  a = resolve(a);
  b = resolve(b);
  out = resolve(out ?? join(b, `vergleich-mit-${basename(a)}`));
  await mkdir(out, { recursive: true });
  const la = await pngs(a);
  const lb = new Set(await pngs(b));
  const pairs = la.filter((f) => lb.has(f)).map((f) => [f, join(a, f), join(b, f)]);
  const missing = [...la.filter((f) => !lb.has(f)).map((f) => `nur in a: ${f}`), ...[...lb].filter((f) => !la.includes(f)).map((f) => `nur in b: ${f}`)];
  // innerhalb von b: Etagenwechsel hin und zurück sowie weg- und zurückgedreht müssen wie „Alle“ aussehen
  for (const f of lb) {
    for (const [name, like] of Object.entries(SAME_AS)) {
      const g = f.replace(`${name}-`, `${like}-`);
      if (new RegExp(`(^|/)${name}-`).test(f) && lb.has(g)) pairs.push([`b: ${f} ↔ ${like}`, join(b, g), join(b, f)]);
    }
  }
  const t = await start(out);
  const pg = await t.browser.newPage();
  const served = new Map(pairs.flatMap(([, x, y]) => [x, y]).map((p, i) => [`/bild${i}.png`, p]));
  const byPath = new Map([...served].map(([u, p]) => [p, u]));
  await pg.route("http://bilder.test/**", async (route) => {
    const u = new URL(route.request().url()).pathname;
    if (u === "/") return route.fulfill({ body: "<!doctype html><title>Vergleich</title>", contentType: "text/html" });
    const p = served.get(u);
    return p ? route.fulfill({ body: await readFile(p), contentType: "image/png" }) : route.fulfill({ status: 404, body: "" });
  });
  await pg.goto("http://bilder.test/");
  const rows = [];
  let failed = 0;
  for (const [name, x, y] of pairs) {
    const r = await pg.evaluate(compareInPage, [`http://bilder.test${byPath.get(x)}`, `http://bilder.test${byPath.get(y)}`, thr]);
    const okGleich = !r.fehler && r.abweichend === 0;
    const okB = !r.fehler && r.anteil <= 0.001 && r.groessteFlaeche <= 25;
    const ok = tol === "gleich" ? okGleich : okB;
    if (!ok) failed++;
    let diffFile = null;
    if (r.diff) {
      diffFile = `${name.replace(/^b: /, "b-").replace(/[ ↔/]+/g, "_").replace(/\.png$/, "").replace(/_+/g, "_")}-diff.png`;
      await writeFile(join(out, diffFile), Buffer.from(r.diff.split(",")[1], "base64"));
    }
    delete r.diff;
    rows.push({ name, ...r, gleich: okGleich, toleranzB: okB, ok, diffFile });
    console.log(`${ok ? "OK  " : "ABW "} ${name}: ${r.fehler ?? `${r.abweichend} Pixel abweichend, ${r.ueberSchwelle} über ${thr} (${(r.anteil * 100).toFixed(3)} %), größte Fläche ${r.groessteFlaeche} px, max ${r.maxAbweichung}`}`);
  }
  await pg.close();
  const md = [
    `# Bildvergleich`,
    "",
    `- a: ${a}`,
    `- b: ${b}`,
    `- Schwelle ${thr}/255; Toleranz für das Ergebnis: ${tol === "gleich" ? "pixelgleich" : "B (≤ 0,1 % über der Schwelle, keine Fläche > 25 px)"}`,
    ...(missing.length ? ["", "Fehlende Bilder:", ...missing.map((m) => `- ${m}`)] : []),
    "",
    "| Bild | abweichende Pixel | über der Schwelle | Anteil | größte Fläche px (Box) | max | pixelgleich | Toleranz B | Differenzbild |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.fehler ?? r.abweichend} | ${r.ueberSchwelle ?? "–"} | ${r.anteil !== undefined ? `${(r.anteil * 100).toFixed(3)} %` : "–"} | ${r.groessteFlaeche ?? "–"}${r.groessteFlaecheBox ? ` (${r.groessteFlaecheBox.join(",")})` : ""} | ${r.maxAbweichung ?? "–"} | ${r.gleich ? "ja" : "nein"} | ${r.toleranzB ? "ja" : "nein"} | ${r.diffFile ?? "–"} |`),
    "",
  ].join("\n");
  await writeFile(join(out, "vergleich.md"), md);
  await writeFile(join(out, "vergleich.json"), JSON.stringify({ a, b, schwelle: thr, toleranz: tol, fehlend: missing, bilder: rows }, null, 1));
  console.log(`\n${pairs.length} Vergleiche, ${failed} außerhalb der Toleranz${missing.length ? `, ${missing.length} fehlende Bilder` : ""}. Bericht: ${join(out, "vergleich.md")}`);
  t.results.vergleiche = pairs.length;
  if (failed || missing.length) t.errors.push(`${failed} Bilder außerhalb der Toleranz, ${missing.length} fehlend`);
  await t.done();
}

// ------------------------------------------------------------------ Aufruf

const cmd = args.shift();
if (cmd === "aufnehmen") {
  const views = list(opt("ansichten", Object.keys(VIEWS).join(",")));
  for (const v of views) if (!VIEWS[v]) throw new Error(`Unbekannte Ansicht ${v} (${Object.keys(VIEWS).join(", ")})`);
  const factors = list(opt("faktor", "1,2")).map(Number);
  const extra = opt("abfrage", "");
  if (!args[0]) throw new Error("Ordner fehlt: aufnehmen <ordner>");
  await record(args[0], { views, factors, extra });
} else if (cmd === "vergleichen") {
  const out = opt("ausgabe", null);
  const thr = Number(opt("schwelle", 16));
  const tol = opt("toleranz", "b");
  if (!args[0] || !args[1] || !existsSync(args[0]) || !existsSync(args[1])) throw new Error("vergleichen <a> <b>: beide Ordner müssen existieren");
  await compare(args[0], args[1], { out, thr, tol });
} else {
  console.log("Aufruf: bildvergleich.mjs aufnehmen <ordner> [--ansichten …] [--faktor 1,2] [--abfrage …] | vergleichen <a> <b> [--ausgabe …] [--schwelle 16] [--toleranz b|gleich]");
  process.exitCode = 2;
}
