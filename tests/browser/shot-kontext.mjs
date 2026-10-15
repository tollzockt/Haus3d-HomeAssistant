// WebGL-Kontexte: Der Editor gibt seine 3D-Ansicht beim Schließen wirklich frei (forceContextLoss), sodass die
// Hauptansicht auch nach vielen Zyklen ihren Kontext behält; geht der Kontext der Hauptansicht trotzdem verloren,
// wird sie nach der Wiederherstellung wieder gezeichnet (gleiches Bild wie vorher).
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("kontext", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);
await pg.waitForFunction(() => window.panel?._building && window.panel._scene, null, { timeout: 30000 });

// --- 1. Editor 20× öffnen (mit 3D-Ansicht) und schließen
const CYCLES = 20;
let lostMain = 0;
let leftOpen = 0;
for (let n = 1; n <= CYCLES; n++) {
  await E(() => window.panel._openEditor());
  await pg.waitForFunction(() => window.panel._editor?.scene3d, null, { timeout: 20000 });
  if (n === 1) {
    // die Zeichenfläche des Editors merken: nach dem Schließen muss ihr Kontext verloren (= freigegeben) sein
    await E(() => {
      window.__edGl = window.panel._editor.scene3d.renderer.getContext();
    });
  }
  await E(() => window.panel.shadowRoot.querySelector(".ed-bar button[data-act=cancel]").click());
  await pg.waitForFunction(() => !window.panel._editor, null, { timeout: 10000 });
  if (await E(() => window.panel._scene.renderer.getContext().isContextLost())) lostMain++;
  if (n === 1) t.check(await E(() => window.__edGl.isContextLost()), "kontext: Kontext der Editor-3D-Ansicht nach dem Schließen nicht freigegeben");
}
leftOpen = await E(() => window.panel.shadowRoot.querySelectorAll(".ed canvas").length);
t.check(lostMain === 0, `kontext: Hauptansicht verlor in ${lostMain} von ${CYCLES} Zyklen ihren Kontext`);
t.check(leftOpen === 0, `kontext: nach dem Schließen blieben ${leftOpen} Zeichenflächen im Editor-Baum`);
t.results.zyklen = { CYCLES, lostMain };
if (t.errors.length) {
  await t.done(); // ohne Kontext der Hauptansicht ist der zweite Teil sinnlos
  process.exit();
}

// --- 2. Kontextverlust der Hauptansicht: Handler fängt ihn ab, nach der Wiederherstellung dasselbe Bild
await E(() => {
  const sc = window.panel._scene;
  sc.stop();
  sc.renderer.render(sc.scene, sc.camera);
  window.__before = sc.renderer.domElement.toDataURL();
  sc.start();
});
const ext = await E(() => {
  const gl = window.panel._scene.renderer.getContext();
  const e = gl.getExtension("WEBGL_lose_context");
  window.__lose = e;
  e.loseContext();
  return !!e;
});
t.check(ext, "kontext: WEBGL_lose_context nicht verfügbar");
await pg.waitForFunction(() => window.panel._scene.contextLost === true, null, { timeout: 5000 }).catch(() => {});
t.check(await E(() => window.panel._scene.contextLost), "kontext: Verlust des Kontexts wurde nicht erkannt");
t.check(await E(() => !!window.panel.shadowRoot.querySelector(".toast")), "kontext: kein Hinweis beim Kontextverlust");
// während des Verlusts darf nichts abstürzen: Kamera bewegen, Größe ändern
await E(() => {
  const sc = window.panel._scene;
  sc.invalidate();
  sc.resize();
});
await pg.waitForTimeout(300);
await E(() => window.__lose.restoreContext());
await pg.waitForFunction(() => window.panel._scene.contextLost === false, null, { timeout: 5000 }).catch(() => {});
t.check(!(await E(() => window.panel._scene.contextLost)), "kontext: Wiederherstellung wurde nicht erkannt");
await pg.waitForTimeout(500);
// Bilder vergleichen (nicht bitgleich: Hintergrund-Animationen bewegen immer ein paar Pixel)
const same = await E(async () => {
  const sc = window.panel._scene;
  sc.stop();
  sc.renderer.render(sc.scene, sc.camera);
  const after = sc.renderer.domElement.toDataURL();
  sc.start();
  const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
  const pix = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const k = c.getContext("2d"); k.drawImage(im, 0, 0); return k.getImageData(0, 0, c.width, c.height).data; };
  const [da, db] = (await Promise.all([load(window.__before), load(after)])).map(pix);
  let sum = 0;
  let big = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    sum += d / 3;
    if (d > 90) big++;
  }
  const n = da.length / 4;
  return { mittel: sum / n, grosseAbweichung: big / n, laenge: after.length };
});
t.check(same.laenge > 50000, `kontext: nach der Wiederherstellung wird nichts gezeichnet (${same.laenge} Zeichen)`);
t.check(same.mittel < 1.5 && same.grosseAbweichung < 0.01, `kontext: Bild nach der Wiederherstellung weicht vom Bild davor ab (${JSON.stringify(same)})`);
t.results.wiederherstellung = same;
await t.shot(pg, "kontext-nach-wiederherstellung.png");
await t.done();
