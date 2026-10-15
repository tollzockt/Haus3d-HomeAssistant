// Dach-Ebene: Nordpfeil und Beschriftungen überdecken sich nicht – der Hinweis „x von y Modulen passen“ eines
// gewählten PV-Felds weicht dem Nordpfeil aus (darunter, seitlich), der Pfeil in eine freie Ecke, wenn dort etwas liegt;
// beide bleiben im sichtbaren Plan. Gemessen am fertigen Plan (Bildschirmrechtecke der SVG-Teile) für acht
// Himmelsrichtungen und fünf Feldlagen.
import { start, unlock } from "./lib.mjs";

const t = await start(process.argv[2]);
const R = t.results;

const pg = await t.page("dachnord", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);

// Obergeschoss mit Hausdach (Satteldach 35°, First entlang der langen Seite)
await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  const og = { id: "og", name: "Obergeschoss", elevation: 2.85, height: 2.5, rooms: eg.rooms.filter((r) => r.id !== "gartenhaus").map((r) => ({ id: `og_${r.id}`, name: `${r.name} OG`, area_id: null, floor_material: "wood", points: structuredClone(r.points) })) };
  b.floors = [...b.floors.filter((f) => f.id !== "og"), og];
  b.settings.roof = { type: "gable", pitch: 35, overhang: 0.4 };
  p._setBuilding(b, p._revision, { keepCamera: true });
});
await unlock(pg, "edit");
await E(() => window.panel._openEditor());
await pg.waitForTimeout(700);
await pg.locator("haus3d-panel .floorsel").selectOption("__roof");
await pg.locator("haus3d-panel .ed-bar button[data-view='2d']").click();
await pg.waitForTimeout(500);

/** Norden und ein PV-Feld (cols × rows bei x/z) samt weiteren Dingen setzen, Feld wählen; liefert Bildschirmrechtecke und Pfeilfuß. */
const messen = (arg) =>
  E(({ north, x, z, cols, rows, extra }) => {
    const e = window.panel._editor;
    e.b.settings.north = north;
    e.b.settings.roof.items = [{ id: "pv_t1", type: "pv", x, z, cols, rows, orient: "portrait" }, ...(extra ?? [])];
    e.sel = { kind: "roofitem", unit: "house", id: "pv_t1" };
    e.tool = "select";
    e.render();
    const rect = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
    };
    const svg = e.svg;
    const fuss = svg.querySelector("[data-north] line");
    return {
      view: rect(svg),
      compass: rect(svg.querySelector("[data-north]")),
      fuss: fuss ? [Number(fuss.getAttribute("x1")), Number(fuss.getAttribute("y1"))] : null,
      hint: rect(svg.querySelector("[data-pvhint]")),
      hintText: svg.querySelector("[data-pvhint]")?.textContent ?? null,
      items: [...svg.querySelectorAll("[data-kind=roofitem]")].map((g) => ({ id: g.dataset.id, r: rect(g) })),
    };
  }, arg);

const schnitt = (a, b) => (a && b ? Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) : 0);
const drin = (r, v) => r[0] >= v[0] - 1 && r[1] >= v[1] - 1 && r[2] <= v[2] + 1 && r[3] <= v[3] + 1;
// Fehler einer Messung: Überdeckungen und Teile außerhalb des Plans
const probleme = (m, name) => {
  const f = [];
  if (!m.compass) return [`${name}: kein Nordpfeil`];
  if (m.hint && schnitt(m.compass, m.hint) > 0) f.push(`${name}: Nordpfeil überdeckt den Hinweis`);
  for (const i of m.items) {
    if (schnitt(m.compass, i.r) > 0) f.push(`${name}: Nordpfeil auf ${i.id}`);
    if (m.hint && schnitt(m.hint, i.r) > 0) f.push(`${name}: Hinweis auf ${i.id}`);
  }
  if (!drin(m.compass, m.view) || (m.hint && !drin(m.hint, m.view))) f.push(`${name}: Nordpfeil oder Hinweis außerhalb des Plans`);
  return f;
};

// 1. Feldlagen × Himmelsrichtungen
const lagen = { "oben links": [0.7, 1.6], "oben links 2": [2.2, 1.3], "oben rechts": [9.6, 1.6], "unten links": [0.7, 7.0], "unten rechts": [9.6, 7.0], mitte: [5.5, 2.0] };
const fehler = [];
let gemessen = 0;
let darunter = 0;
for (const [name, [x, z]] of Object.entries(lagen)) {
  for (const north of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const m = await messen({ north, x, z, cols: 2, rows: 1 });
    gemessen++;
    const feld = m.items.find((i) => i.id === "pv_t1")?.r;
    if (!m.hint || !feld) {
      fehler.push(`${name} ${north}°: Hinweis oder Feld fehlt`);
      continue;
    }
    fehler.push(...probleme(m, `${name} ${north}°`));
    if (!/^\d+ von \d+ Modulen passen$/.test(m.hintText ?? "")) fehler.push(`${name} ${north}°: Hinweistext ${m.hintText}`);
    if (m.hint[1] > feld[3]) darunter++; // Hinweis steht unter dem Feld
  }
}
R.lagen = { gemessen, darunter, fehler: fehler.length };
t.check(fehler.length === 0, `Überdeckungen im Plan: ${JSON.stringify(fehler.slice(0, 8))}`);
t.check(darunter > 0, `Hinweis ist nie unter das Feld gewichen (${darunter}) – Prüfung zu lasch?`);

// 2. Ausgangslage der Meldung: Pfeil nach rechts unten (Norden bei 135°), schmales Feld, dessen Hinweis darüber unter den Pfeil reichte
//    → Hinweis unter dem Feld, Pfeil bleibt oben links
const a = await messen({ north: 135, x: 1.6, z: 1.4, cols: 1, rows: 1 });
R.ausgangslage = { hint: a.hint, feld: a.items[0].r, fuss: a.fuss };
t.check(a.hint[1] > a.items[0].r[3], `Hinweis unter dem Feld: ${JSON.stringify(R.ausgangslage)}`);
t.check(a.fuss[0] < 0 && a.fuss[1] < 0 && probleme(a, "180°").length === 0, `Nordpfeil bleibt oben links: ${JSON.stringify(R.ausgangslage)}`);
await t.shot(pg, "dachnord-1-unter.png");

// 3. Kamin liegt unter dem Pfeil in der oberen linken Ecke: der Pfeil geht in eine freie Ecke (oben rechts), nichts überdeckt sich
const b = await messen({ north: 180, x: 5.5, z: 2.0, cols: 2, rows: 1, extra: [{ id: "k1", type: "chimney", x: -0.1, z: 0.5, w: 1.0, d: 1.0, h: 1, rotation: 0 }] });
R.belegt = { fuss: b.fuss, items: b.items.map((i) => i.id) };
t.check(b.items.length === 2 && b.fuss[0] > 5 && b.fuss[1] < 1, `Nordpfeil in freier Ecke statt unter dem Kamin: ${JSON.stringify(R.belegt)}`);
t.check(probleme(b, "Kamin").length === 0, `keine Überdeckung bei belegter Ecke: ${JSON.stringify(probleme(b, "Kamin"))}`);
await t.shot(pg, "dachnord-2-ecke.png");

// 4. Norden oben (Ausgangslage der meisten Häuser): der Pfeil mit „N“ hängt nicht über den Rand, Hinweis mittig über dem Feld
const c = await messen({ north: 0, x: 5.5, z: 2.0, cols: 2, rows: 1 });
const feld = c.items[0].r;
t.check(probleme(c, "Norden oben").length === 0 && drin(c.compass, c.view), `Nordpfeil sichtbar: ${JSON.stringify([c.compass, c.view])}`);
t.check(c.hint[3] <= feld[1] + 2 && Math.abs((c.hint[0] + c.hint[2]) / 2 - (feld[0] + feld[2]) / 2) < 3, `Hinweis mittig über dem Feld: ${JSON.stringify([c.hint, feld])}`);
await t.shot(pg, "dachnord-3-frei.png");

// 5. Ohne gewähltes Feld kein Hinweis, der Pfeil steht trotzdem (und nichts bricht)
const d = await E(() => {
  const e = window.panel._editor;
  e.sel = null;
  e.render();
  return { pfeil: !!e.svg.querySelector("[data-north]"), hinweis: !!e.svg.querySelector("[data-pvhint]") };
});
t.check(d.pfeil && !d.hinweis, `ohne Auswahl: ${JSON.stringify(d)}`);

await t.done();
