// Cyberpunk-Stil: die Neonkanten der Dächer bleiben sichtbar. Im Standardstil zieht sich das Dach per polygonOffset vor die
// Wandoberkanten (keine Haarlinien); auf die deckungsgleichen Kantenlinien (roofEdge) wirkt das nicht, sie verschwänden
// fast ganz hinter der Dachfläche. Gezählt werden magentafarbene Bildpunkte: wie dargestellt und ohne jeden Dach-Offset.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);

/** Magentafarbene Bildpunkte (Dachkanten, Raumumrisse) im gerenderten Bild der Hauptansicht. */
const magenta = (pg) =>
  pg.evaluate(async () => {
    const sc = window.panel._scene;
    sc.stop();
    sc.renderer.render(sc.scene, sc.camera);
    const url = sc.renderer.domElement.toDataURL();
    sc.start();
    const im = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const k = c.getContext("2d");
    k.drawImage(im, 0, 0);
    const d = k.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 120 && d[i + 2] > 150) n++;
    return n;
  });

// --- 1. Standardstil: Dach vor den Wänden (Offset an), Wände dahinter
{
  const pg = await t.page("standard", "?roof=gable", { width: 1000, height: 700 });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene, null, { timeout: 30000 });
  const m = await pg.evaluate(() => {
    const mats = window.panel._scene.mats;
    return { roof: [mats.roof.polygonOffset, mats.roof.polygonOffsetFactor], wall: [mats.wall.polygonOffset, mats.wall.polygonOffsetFactor], kante: !!mats.roofEdge };
  });
  t.results.standard = m;
  t.check(m.roof[0] === true && m.roof[1] < 0 && m.wall[0] === true && m.wall[1] > 0 && !m.kante, `cyberdach: Standardstil ohne Dach-/Wand-Offset ${JSON.stringify(m)}`);
}

// --- 2. Cyberpunk: kein Offset am Dach, die Neonkanten sind (fast) so zahlreich wie ohne jeden Offset
t.results.cyber = {};
for (const roof of ["gable", "hip", "shed"]) {
  const pg = await t.page(`cyber-${roof}`, `?roof=${roof}`, { width: 1000, height: 700 });
  await pg.waitForFunction(() => window.panel?._building && window.panel._scene, null, { timeout: 30000 });
  await pg.evaluate(async () => {
    window.panel._settings.style = "cyber";
    window.panel._applyStyle();
    await new Promise((r) => setTimeout(r, 1500));
  });
  const flags = await pg.evaluate(() => {
    const mats = window.panel._scene.mats;
    return { roof: mats.roof.polygonOffset, kante: !!mats.roofEdge };
  });
  const mit = await magenta(pg);
  await t.shot(pg, `cyberdach-${roof}.png`);
  // zur Gegenprobe jeden Offset am Dach (auch an Kopien mit Farbe oder Textur) ausschalten
  await pg.evaluate(() => {
    window.panel._scene.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) if (m?.polygonOffset && m.polygonOffsetFactor < 0) Object.assign(m, { polygonOffset: false, needsUpdate: true });
    });
  });
  const ohne = await magenta(pg);
  t.results.cyber[roof] = { ...flags, mit, ohne };
  t.check(flags.kante && flags.roof === false, `cyberdach (${roof}): Dach hat im Cyberpunk-Stil einen Offset ${JSON.stringify(flags)}`);
  t.check(ohne > 300 && mit >= ohne * 0.9, `cyberdach (${roof}): Neonkanten verschwinden hinter dem Dach (${mit} von ${ohne} Bildpunkten)`);
}
await t.done();
