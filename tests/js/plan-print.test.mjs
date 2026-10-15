// Plan drucken: Papier und Maßstab, Seitenaufbau (SVG), Druck-HTML, Dateinamen (rein, ohne Browser)
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  OUTDOOR_COLORS, PAPERS, SCALES, dateText, fittingScales, floorBounds, houseName, pageSvg, pickLayout, planFileName, planPages, printHtml, shotPage, unionBounds,
} from "../../custom_components/haus3d/frontend/plan-print.js";
import { OUTDOOR_TYPES } from "../../custom_components/haus3d/frontend/editor-props-outdoor.js";

const FRONT = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
const box = (w, h) => ({ x0: 0, z0: 0, x1: w, z1: h });
const DATE = new Date(2026, 9, 15, 8, 30);

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const floor = (id, name, elevation) => ({
  id, name, elevation, height: 2.5,
  rooms: [
    { id: "k", name: "Küche & Bad <b>", points: rect(0, 0, 6, 9), floor_color: "#ff0000" },
    { id: "w", name: "Wohnen", points: rect(6, 0, 12, 9) },
  ],
  openings: [
    { id: "o1", room_id: "k", edge: 0, offset: 3, width: 1.2, type: "window", sill: 0.9, height: 1.2 },
    { id: "o2", room_id: "k", edge: 1, offset: 2, width: 0.9, type: "door", sill: 0, height: 2.1, hinge: "left", swing: "in" },
    { id: "o3", room_id: "w", edge: 2, offset: 3, width: 2.4, type: "garage", sill: 0, height: 2.2 },
  ],
  outdoor: [{ id: "g", type: "lawn", points: rect(-2, -2, 14, -1) }],
  furniture: [],
  walls: [],
});
const house = () => ({ version: 1, settings: { title: "Mein Haus", north: 40, wall_exterior: 0.24, wall_interior: 0.12 }, floors: [floor("eg", "EG", 0), floor("og", "OG", 2.6)] });
const opts = { date: DATE };

/** Der Text muss als eigenständige SVG-Datei (XML) lesbar sein, nicht nur als HTML: Attribute mit Wert, Tags geschlossen, Zeichen maskiert. */
function assertXml(svg, what) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(svg))) {
    const [, close, name, attrs, self] = m;
    const text = svg.slice(last, m.index);
    last = re.lastIndex;
    assert.ok(!/<|&(?!(amp|lt|gt|quot|#39);)/.test(text), `${what}: unmaskierter Text „${text.slice(0, 40)}“`);
    if (close) {
      assert.equal(stack.pop(), name, `${what}: </${name}> ohne passendes Öffnen`);
      continue;
    }
    assert.match(attrs.replace(/\s+[\w:-]+="[^"<]*"/g, ""), /^\s*$/, `${what}: Attribut ohne Wert oder ohne Anführungszeichen in <${name}${attrs.slice(0, 80)}>`);
    if (!self) stack.push(name);
  }
  assert.deepEqual(stack, [], `${what}: nicht geschlossen`);
  assert.equal(svg.slice(last).trim(), "", `${what}: Rest nach dem letzten Tag`);
}

test("Alle Seiten sind wohlgeformtes XML (sonst scheitert „PNG speichern“ beim Laden des Bildes)", () => {
  const b = house();
  const shot = "data:image/png;base64,iVBORw0KGgo=";
  for (const extra of [{}, { bw: true }, { dims: false, names: false, north: false, outdoor: false }]) {
    const { pages } = planPages(b, { floors: ["eg", "og"], shot, ...opts, ...extra });
    assert.equal(pages.length, 3);
    for (const p of pages) assertXml(p.svg, `${p.kind} ${JSON.stringify(extra)}`);
  }
  const seed = JSON.parse(readFileSync(new URL("../../custom_components/haus3d/haus-daten.json", import.meta.url), "utf8"));
  for (const p of planPages(seed, { floors: seed.floors.map((f) => f.id), shot, ...opts }).pages) assertXml(p.svg, `Beispielhaus ${p.id}`);
  assert.throws(() => assertXml('<svg><g data-plan data-x="1"></g></svg>', "Probe"), /ohne Wert/); // der Prüfer erkennt den Fehler
});

test("pickLayout: größter passender Maßstab, quer vor hochkant", () => {
  const a = pickLayout(box(12, 9), "A4");
  assert.deepEqual([a.orientation, a.scale, a.fits, a.paper], ["landscape", 100, true, "A4"]);
  const b = pickLayout(box(30, 20), "A4");
  assert.deepEqual([b.orientation, b.scale, b.fits], ["landscape", 200, true]);
  const c = pickLayout(box(3, 3), "A4");
  assert.deepEqual([c.orientation, c.scale, c.fits], ["landscape", 50, true]);
  // hochkant, wenn dort ein größerer Maßstab passt (10 × 20 m: quer erst 1:200)
  const d = pickLayout(box(10, 20), "A4");
  assert.deepEqual([d.orientation, d.scale, d.fits], ["portrait", 100, true]);
  // A3 hat mehr Platz
  const e = pickLayout(box(12, 9), "A3");
  assert.deepEqual([e.orientation, e.scale], ["landscape", 50]);
  // zu groß für jedes Maß: kleinster Maßstab, fits false
  const f = pickLayout(box(500, 400), "A4");
  assert.deepEqual([f.scale, f.fits], [1000, false]);
  // ohne Umfang (nichts zu zeichnen): Standard
  assert.equal(pickLayout(null, "A4").scale, 50);
  assert.equal(pickLayout(box(12, 9), "A5").paper, "A4"); // unbekanntes Papier = A4
});

test("pickLayout: vorgegebener Maßstab, Seitenlage und Maße des bedruckbaren Felds", () => {
  const a = pickLayout(box(12, 9), "A4", 200);
  assert.deepEqual([a.orientation, a.scale, a.fits], ["landscape", 200, true]);
  // 10 × 20 m bei 1:100: nur hochkant
  assert.equal(pickLayout(box(10, 20), "A4", 100).orientation, "portrait");
  // passt bei dem Maßstab nirgends: fits false, quer
  const b = pickLayout(box(30, 20), "A4", 100);
  assert.deepEqual([b.orientation, b.fits], ["landscape", false]);
  // Feld = Papier − 2 × 10 mm Rand (Höhe 1 mm kürzer, damit nie eine leere Folgeseite entsteht)
  assert.deepEqual([a.w, a.h], [277, 189]);
  const p = pickLayout(box(10, 20), "A3", 100);
  assert.deepEqual([p.orientation, p.w, p.h], ["landscape", 400, 276]);
  assert.deepEqual(PAPERS.A4, { w: 210, h: 297 });
});

test("fittingScales: nur die Maßstäbe, bei denen der Plan aufs Papier passt", () => {
  assert.deepEqual(fittingScales(box(12, 9), "A4"), [100, 200, 250, 500, 1000]);
  assert.deepEqual(fittingScales(box(30, 20), "A4"), [200, 250, 500, 1000]);
  assert.deepEqual(fittingScales(box(12, 9), "A3"), SCALES);
  assert.deepEqual(fittingScales(box(500, 400), "A4"), []);
  assert.deepEqual(fittingScales(box(10, 20), "A4"), [100, 200, 250, 500, 1000]); // hochkant zählt mit
});

test("floorBounds: Räume, Wandflächen mit Dicke, Garten nach Wunsch; leer = null", () => {
  const f = house().floors[0];
  const withGarden = floorBounds(f, house().settings);
  // Außenwände (0,24 m) wachsen nach außen: die Räume liegen auf den Innenkanten
  assert.deepEqual([withGarden.x0, withGarden.x1, withGarden.z0, withGarden.z1].map((v) => Math.round(v * 1000) / 1000), [-2, 14, -2, 9.24]);
  const noGarden = floorBounds(f, house().settings, { outdoor: false });
  assert.deepEqual([noGarden.x0, noGarden.x1, noGarden.z0, noGarden.z1].map((v) => Math.round(v * 1000) / 1000), [-0.24, 12.24, -0.24, 9.24]);
  assert.equal(floorBounds({ id: "x", rooms: [], outdoor: [], walls: [] }, {}), null);
  assert.equal(floorBounds(null, {}), null);
  assert.deepEqual(unionBounds([null, box(2, 3), { x0: -1, z0: 1, x1: 1, z1: 5 }]), { x0: -1, z0: 0, x1: 2, z1: 5 });
  assert.equal(unionBounds([null]), null);
});

test("pageSvg: Maßstab, Name mit Maskierung, Fläche, Nordpfeil, Fuß", () => {
  const b = house();
  const layout = pickLayout(floorBounds(b.floors[0], b.settings, { outdoor: false }), "A4");
  assert.equal(layout.scale, 100);
  const svg = pageSvg(b, "eg", layout, opts);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="277mm" height="189mm" viewBox="0 0 277 189"/);
  assert.ok(svg.includes("Küche &amp; Bad &lt;b&gt;"), "Raumname maskiert");
  assert.ok(!svg.includes("<b>"));
  assert.ok(svg.includes("54,00 m²") && svg.includes("Wohnen") && svg.includes("54,00 m²"));
  assert.ok(svg.includes("Mein Haus – EG"));
  assert.ok(svg.includes("Maßstab 1:100") && svg.includes("Maße in m") && svg.includes("15.10.2026"));
  assert.match(svg, /data-north="40"[^>]*>.*rotate\(40\)/);
  assert.ok(svg.includes("Maßstab gilt bei Druck in Originalgröße (100 %)"));
  assert.match(svg, /data-scale="100" data-floor="eg"/);
  // Norden 0 und 350 sind gültige Drehungen, ohne Nordpfeil fehlt das Zeichen ganz
  const n0 = { ...b, settings: { ...b.settings, north: 0 } };
  assert.match(pageSvg(n0, "eg", layout, opts), /data-north="0"/);
  assert.match(pageSvg({ ...b, settings: { ...b.settings, north: -10 } }, "eg", layout, opts), /data-north="350"/);
  assert.ok(!pageSvg(b, "eg", layout, { ...opts, north: false }).includes("data-north"));
});

test("pageSvg: Maße nur mit dims, Namen nur mit names, SW ohne Bodenfarbe, Garten nur mit outdoor", () => {
  const b = house();
  const layout = pickLayout(floorBounds(b.floors[0], b.settings), "A4");
  const full = pageSvg(b, "eg", layout, opts);
  // Raumkanten (6,00 und 9,00) und Maßketten außen: Wandaußenkante zu Wandaußenkante („12,48 m“, „9,48 m“)
  assert.ok(full.includes(">9,00<") && full.includes(">6,00<") && full.includes("12,48 m") && full.includes("9,48 m"), "Maße fehlen");
  const noDims = pageSvg(b, "eg", layout, { ...opts, dims: false });
  assert.ok(!noDims.includes(">9,00<") && !noDims.includes("12,48 m") && !noDims.includes("9,48 m"));
  // Raumkanten sind schräg gesetzte Texte (rotate mit Mittelpunkt): Küche 4 + Wohnen 4, die geteilte Wand nur einmal = 7
  assert.equal((full.match(/ transform="rotate\(-?[\d.]+ [\d.]+ [\d.]+\)">\d+,\d\d</g) ?? []).length, 7);
  const noNames = pageSvg(b, "eg", layout, { ...opts, names: false });
  assert.ok(!noNames.includes("Wohnen") && !noNames.includes("m²"));
  assert.ok(full.includes("#ff0000") && full.includes("#6aa84f"), "Farbe: Boden und Rasen");
  const bw = pageSvg(b, "eg", layout, { ...opts, bw: true });
  assert.ok(!bw.includes("#ff0000") && !bw.includes("#6aa84f") && !bw.includes("#29b6f6") && !bw.includes("#e53935"), "SW ohne Farben");
  assert.ok(!pageSvg(b, "eg", layout, { ...opts, outdoor: false }).includes("#6aa84f"));
});

test("pageSvg: Fenster blau, Tür mit Aufschlagbogen, Tor gestrichelt, Lücken weiß", () => {
  const b = house();
  const layout = pickLayout(floorBounds(b.floors[0], b.settings), "A4");
  const svg = pageSvg(b, "eg", layout, opts);
  assert.ok(svg.includes('stroke="#29b6f6" stroke-width="0.35"'), "Fenster");
  assert.match(svg, /<path d="M[\d.,-]+A[\d.]+ [\d.]+ 0 0 [01] [\d.,-]+M[\d.,-]+L[\d.,-]+" fill="none" stroke="#222"/, "Türbogen");
  assert.match(svg, /stroke-dasharray="1\.6 1\.2"/, "Tor gestrichelt");
  assert.ok(/<polygon points="[^"]+" fill="#fff"\/>/.test(svg), "weiße Lücke");
  // Durchgang ohne Bogen, Schiebetür ohne Bogen
  const pass = house();
  pass.floors[0].openings = [{ id: "d", room_id: "k", edge: 1, offset: 2, width: 0.9, type: "door", sill: 0, height: 2.1, style: "passage" }];
  assert.ok(!/A[\d.]+ [\d.]+ 0 0 [01]/.test(pageSvg(pass, "eg", layout, opts)));
  pass.floors[0].openings[0].style = "sliding";
  assert.ok(!/A[\d.]+ [\d.]+ 0 0 [01]/.test(pageSvg(pass, "eg", layout, opts)));
  // zweiflügelig: zwei Bögen
  pass.floors[0].openings[0] = { id: "d", room_id: "k", edge: 1, offset: 2, width: 1.6, type: "door", sill: 0, height: 2.1, leaves: 2 };
  assert.equal((pageSvg(pass, "eg", layout, opts).match(/ 0 0 [01] /g) ?? []).length, 2);
});

test("Maßstab ist exakt: 10 m sind 100 mm bei 1:100, alle Seiten deckungsgleich", () => {
  const b = house();
  const plan = planPages(b, { floors: ["eg", "og"], paper: "A4", ...opts });
  assert.equal(plan.layout.scale, 100); // mit Garten 16 × 11 m: 160 × 113 mm passen auf A4 quer
  const pts = (svg, color) => {
    const m = svg.match(new RegExp(`<polygon points="([^"]+)" fill="${color}" fill-opacity="0.3"`));
    return m[1].split(" ").map((p) => p.split(",").map(Number));
  };
  const [a, c] = plan.pages.map((p) => pts(p.svg, "#ff0000"));
  assert.deepEqual(a, c, "gleiche Räume liegen auf allen Seiten an derselben Stelle");
  const k = 1000 / plan.layout.scale;
  assert.ok(Math.abs(a[1][0] - a[0][0] - 6 * k) < 0.01, `6 m = ${6 * k} mm, ist ${a[1][0] - a[0][0]}`);
  assert.ok(Math.abs(a[2][1] - a[1][1] - 9 * k) < 0.01);
  // bei 1:100: 6 m = 60 mm; bei 1:200 (vorgegeben) = 30 mm
  const q = pts(plan.pages[0].svg, "#ff0000");
  assert.ok(Math.abs(q[1][0] - q[0][0] - 60) < 0.01);
  const p200 = planPages(b, { floors: ["eg"], scale: 200, ...opts });
  const r = pts(p200.pages[0].svg, "#ff0000");
  assert.ok(Math.abs(r[1][0] - r[0][0] - 30) < 0.01 && Math.abs(r[2][1] - r[1][1] - 45) < 0.01);
  // der Plan liegt im Feld (zwischen Kopf und Fuß, innerhalb der Breite)
  for (const [x, z] of [...q, ...r]) assert.ok(x > 0 && x < 277 && z > 14 && z < 189 - 6);
  // Maßstabsleiste: bei 1:100 fünf Meter = 50 mm
  assert.match(plan.pages[0].svg, /<rect x="0" y="[\d.]+" width="12\.5" height="1\.5" fill="#000"/);
});

test("planPages: eine Seite je Etage, 3D-Seite zuletzt, alle gleich groß", () => {
  const b = house();
  const shot = "data:image/png;base64,iVBORw0KGgo=";
  const plan = planPages(b, { floors: ["og", "eg"], shot, ...opts });
  assert.deepEqual(plan.pages.map((p) => [p.kind, p.id]), [["plan", "og"], ["plan", "eg"], ["3d", null]]);
  assert.deepEqual(plan.pages.map((p) => p.name), ["OG", "EG", "3D-Ansicht"]);
  for (const p of plan.pages) assert.ok(p.svg.includes(`width="${plan.layout.w}mm" height="${plan.layout.h}mm"`));
  const last = plan.pages[2].svg;
  assert.ok(last.includes("Mein Haus – 3D-Ansicht") && last.includes(`href="${shot}"`) && last.includes('preserveAspectRatio="xMidYMid meet"'));
  // ohne Auswahl keine Seiten (außer dem 3D-Bild), unbekannte Etage zählt nicht
  assert.equal(planPages(b, { floors: [], ...opts }).pages.length, 0);
  assert.equal(planPages(b, { floors: ["gibt-es-nicht"], ...opts }).pages.length, 0);
  assert.equal(planPages(b, { floors: [], shot, ...opts }).pages.length, 1);
  // A3 / vorgegebener Maßstab
  const a3 = planPages(b, { floors: ["eg"], paper: "A3", scale: 100, ...opts });
  assert.deepEqual([a3.layout.paper, a3.layout.scale, a3.layout.fits], ["A3", 100, true]);
});

test("pageSvg und shotPage überstehen leere und fehlende Etagen", () => {
  const b = { version: 1, settings: {}, floors: [{ id: "x", name: "Leer", elevation: 0, height: 2.5, rooms: [], openings: [], outdoor: [], walls: [] }] };
  const layout = pickLayout(null, "A4");
  for (const id of ["x", "fehlt"]) {
    const svg = pageSvg(b, id, layout, opts);
    assert.ok(svg.startsWith("<svg") && svg.includes("Haus 3D"), id);
  }
  assert.ok(shotPage("Haus 3D", "data:image/png;base64,AA==", layout, opts).includes("Haus 3D – 3D-Ansicht"));
  assert.equal(houseName({ settings: { title: "  " } }), "Haus 3D");
  assert.equal(houseName(null), "Haus 3D");
});

test("printHtml: @page mit Papier und Seitenlage, je Seite ein .page, letzte ohne Umbruch", () => {
  const layout = pickLayout(box(12, 9), "A4");
  const html = printHtml(["<svg id=a></svg>", "<svg id=b></svg>", "<svg id=c></svg>"], layout, "Mein <Haus>");
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes("@page { size: A4 landscape; margin: 10mm }"));
  assert.equal(html.split('<div class="page">').length - 1, 3);
  assert.ok(html.includes(".page { box-sizing: content-box; width: 277mm; height: 189mm; overflow: hidden; break-after: page"));
  assert.ok(html.includes(".page:last-child { break-after: auto"));
  assert.ok(html.includes("print-color-adjust: exact") && html.includes("-webkit-print-color-adjust: exact"));
  assert.ok(html.includes("@media screen") && html.includes("box-shadow"));
  assert.ok(html.includes("<title>Mein &lt;Haus&gt;</title>") && html.includes('<meta charset="utf-8">'));
  const portrait = printHtml(["<svg></svg>"], pickLayout(box(10, 20), "A3"), "x");
  assert.ok(portrait.includes("@page { size: A3 landscape") || portrait.includes("@page { size: A3 portrait"));
  // alles inline: nichts von außen
  assert.ok(!/(src|href)="https?:/.test(html));
});

test("planFileName und dateText", () => {
  assert.equal(planFileName("plan", "eg", DATE), "haus3d-plan-eg-2026-10-15.png");
  assert.equal(planFileName("3d", null, DATE), "haus3d-3d-2026-10-15.png");
  assert.equal(planFileName("plan", "Obergeschoß Süd/1", DATE), "haus3d-plan-obergeschoss-sued-1-2026-10-15.png");
  assert.match(planFileName("plan", "eg"), /^haus3d-plan-eg-\d{4}-\d{2}-\d{2}\.png$/);
  assert.equal(dateText(DATE), "15.10.2026");
  assert.equal(dateText(new Date(2026, 0, 5)), "05.01.2026");
});

test("Farben der Gartenflächen stimmen mit der Auswahl im Editor überein", () => {
  assert.deepEqual(Object.fromEntries(OUTDOOR_TYPES.map(([k, , c]) => [k, c])), OUTDOOR_COLORS);
});

test("plan-print.js wird nur per import() geladen und hat keine Marken", () => {
  for (const f of readdirSync(FRONT).filter((x) => x.endsWith(".js"))) {
    assert.doesNotMatch(readFileSync(new URL(f, FRONT), "utf8"), /from\s+"\.\/plan-print\.js"/, `${f} importiert plan-print.js statisch`);
  }
  assert.match(readFileSync(new URL("panel-print.js", FRONT), "utf8"), /import\("\.\/plan-print\.js"\)/);
  assert.doesNotMatch(readFileSync(new URL("plan-print.js", FRONT), "utf8"), /ikea|playstation|xbox|nintendo|tesla|samsung|philips|\bhue\b/i);
});
