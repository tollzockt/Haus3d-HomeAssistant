// Einführung (Tour): Schritte und ihre Ziele im Quelltext, „gesehen“ im Browser-Speicher, Weiterschalten über unsichtbare
// Schritte, Zielsuche und Kartenposition (alles ohne DOM; das Zusammenspiel prüft tests/browser/shot-hilfe.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { EDITOR_TOUR, PANEL_TOUR, TOUR_KEY, TOUR_VERSION, cardPosition, findTarget, markTourSeen, nextStep, tourSeen, tourSteps } from "../../custom_components/haus3d/frontend/tour.js";

const FRONT = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
const SOURCE = readdirSync(FRONT).filter((f) => /^(haus3d-panel|panel-.*|editor.*)\.js$/.test(f)).map((f) => readFileSync(new URL(f, FRONT), "utf8")).join("\n");
const BRANDS = /ikea|playstation|xbox|nintendo|sony|microsoft|valve|steam|tesla|apple|google|amazon|samsung|philips|hue\b|unifi|ubiquiti|tibber|victron/i;

/** Fake-Speicher wie localStorage. */
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const throwing = () => ({
  getItem() {
    throw new Error("gesperrt");
  },
  setItem() {
    throw new Error("gesperrt");
  },
});

test("Schrittzahl: Panel 5, Demo 6, Editor 6 (jeweils 4 bis 6)", () => {
  assert.equal(tourSteps("panel").length, 5);
  assert.equal(tourSteps("demo").length, 6);
  assert.equal(tourSteps("editor").length, 6);
  for (const k of ["panel", "demo", "editor"]) assert.ok(tourSteps(k).length >= 4 && tourSteps(k).length <= 6, k);
  assert.equal(tourSteps("demo")[0].id, "demo");
  assert.ok(!tourSteps("panel").some((s) => s.demo));
  assert.equal(PANEL_TOUR.length, 6);
  assert.equal(EDITOR_TOUR.length, 6);
});

test("Texte: Titel kurz, Text ≤ 140 Zeichen (auch Finger-Fassung und Zahnrad-Fassung), keine Marken", () => {
  const ids = new Set();
  for (const s of [...PANEL_TOUR, ...EDITOR_TOUR]) {
    assert.ok(s.title && s.title.length <= 20, s.id);
    for (const t of [s.text, s.touch, ...Object.values(s.alt ?? {})].filter(Boolean)) {
      assert.ok(t.length <= 140, `${s.id}: ${t.length} Zeichen`);
      assert.doesNotMatch(t, BRANDS);
      assert.doesNotMatch(t, /!/, "kein Ausrufezeichen");
    }
    assert.ok(Array.isArray(s.sel) && s.sel.length, s.id);
  }
  for (const list of [PANEL_TOUR, EDITOR_TOUR]) {
    const own = list.map((s) => s.id);
    assert.equal(new Set(own).size, own.length);
    for (const id of own) ids.add(id);
  }
});

test("Jeder Selektor der Tour steht im Quelltext des Panels bzw. Editors", () => {
  const sels = [];
  for (const s of [...PANEL_TOUR, ...EDITOR_TOUR]) for (const e of s.sel) sels.push(typeof e === "string" ? e : e.q);
  assert.ok(sels.length >= 14);
  for (const sel of sels) {
    for (const tok of sel.split(/[\s>]+/).filter(Boolean)) {
      // „.wheel.right“ → Klassen wheel, right; „[data-act=save]“ → data-act="save"; „header“ → Element
      for (const cls of tok.match(/\.[\w-]+/g) ?? []) assert.match(SOURCE, new RegExp(`(class="|className = ")[^"]*\\b${cls.slice(1)}\\b`), `${sel}: Klasse ${cls}`);
      const attr = tok.match(/\[([\w-]+)(?:=([\w-]+))?\]/);
      if (attr) assert.ok(SOURCE.includes(attr[2] ? `${attr[1]}="${attr[2]}"` : attr[1]), `${sel}: Attribut ${attr[0]}`);
      const el = tok.match(/^[a-z]+/)?.[0];
      if (el) assert.ok(SOURCE.includes(`<${el}`), `${sel}: Element ${el}`);
    }
  }
  // die in der Spezifikation genannten Anker
  for (const s of ['class="icon help"', 'data-act="help"', "floorsel", "roofbtn", 'data-act="save"', "m-demo", 'class="floorbar"', "kgear"]) assert.ok(SOURCE.includes(s), s);
});

test("tourSeen / markTourSeen: leer, gemerkt, andere Art, höhere Version", () => {
  const st = fakeStorage();
  assert.equal(tourSeen(st, "panel"), false);
  assert.equal(markTourSeen(st, "panel"), true);
  assert.equal(tourSeen(st, "panel"), true);
  assert.equal(tourSeen(st, "editor"), false, "andere Art bleibt ungesehen");
  assert.equal(tourSeen(st, "demo"), false);
  markTourSeen(st, "editor");
  assert.deepEqual(JSON.parse(st.getItem(TOUR_KEY)), { panel: TOUR_VERSION, editor: TOUR_VERSION });
  // eine überarbeitete Tour (höhere Version) gilt als ungesehen, ein 9er-Eintrag (Tests) als gesehen und bleibt beim Merken
  const old = fakeStorage({ [TOUR_KEY]: JSON.stringify({ panel: TOUR_VERSION - 1 }) });
  assert.equal(tourSeen(old, "panel"), false);
  const high = fakeStorage({ [TOUR_KEY]: JSON.stringify({ panel: 9, editor: 9 }) });
  assert.equal(tourSeen(high, "panel"), true);
  markTourSeen(high, "panel");
  assert.equal(JSON.parse(high.getItem(TOUR_KEY)).panel, 9);
});

test("tourSeen / markTourSeen: kaputter oder nicht nutzbarer Speicher", () => {
  assert.equal(tourSeen(throwing(), "panel"), true, "werfender Speicher gilt als gesehen");
  assert.equal(tourSeen(null, "panel"), true);
  assert.equal(tourSeen(undefined, "panel"), true);
  assert.equal(markTourSeen(throwing(), "panel"), false);
  assert.equal(markTourSeen(null, "panel"), false);
  // kaputter Eintrag: nichts gesehen, und das Merken überschreibt ihn
  const broken = fakeStorage({ [TOUR_KEY]: "{kaputt" });
  assert.equal(tourSeen(broken, "panel"), false);
  assert.equal(markTourSeen(broken, "panel"), true);
  assert.equal(tourSeen(broken, "panel"), true);
  const arr = fakeStorage({ [TOUR_KEY]: "[1,2]" });
  assert.equal(tourSeen(arr, "panel"), false);
  assert.equal(markTourSeen(arr, "panel"), true);
  assert.equal(tourSeen(arr, "panel"), true);
});

test("nextStep überspringt Unsichtbares in beide Richtungen", () => {
  const steps = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const only = (...ok) => (s) => ok.includes(s.id);
  assert.equal(nextStep(steps, -1, 1, only("a", "b", "c", "d")), 0);
  assert.equal(nextStep(steps, -1, 1, only("c")), 2);
  assert.equal(nextStep(steps, 0, 1, only("a", "d")), 3);
  assert.equal(nextStep(steps, 3, 1, only("a", "b", "c", "d")), -1, "nach dem letzten Schritt: Ende");
  assert.equal(nextStep(steps, 3, -1, only("a", "c", "d")), 2);
  assert.equal(nextStep(steps, 2, -1, only("c", "d")), -1, "vor dem ersten sichtbaren: bleibt");
  assert.equal(nextStep(steps, -1, 1, only()), -1, "nichts sichtbar");
  assert.equal(nextStep([], -1, 1, () => true), -1);
});

// Fake-Wurzel mit querySelectorAll: Elemente mit Rechtecken (leere Liste = unsichtbar)
const el = (left, top, width, height, visible = true, behind = false) => ({ getClientRects: () => (visible ? [{}] : []), closest: (s) => (behind && s === ".hidden-behind" ? {} : null), getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }) });
const fakeRoot = (map) => ({ querySelectorAll: (q) => map[q] ?? [] });
const stage = { left: 0, top: 0, right: 1000, bottom: 600, x: 500, y: 300 };

test("findTarget: erster sichtbarer Selektor, unsichtbare und breitenlose Treffer zählen nicht", () => {
  const step = { sel: ["header .gear", ".kgear"], text: "T", alt: { ".kgear": "T-kgear" } };
  assert.equal(findTarget(step, fakeRoot({}), {}), null);
  assert.equal(findTarget(step, fakeRoot({ "header .gear": [el(10, 10, 40, 40, false)] }), {}), null, "verborgen");
  assert.equal(findTarget(step, fakeRoot({ "header .gear": [el(10, 10, 0, 40)] }), {}), null, "Breite 0");
  const a = findTarget(step, fakeRoot({ "header .gear": [el(900, 5, 40, 40)], ".kgear": [el(8, 8, 44, 44)] }), {});
  assert.equal(a.rect.left, 900);
  assert.equal(a.text, "T");
  const b = findTarget(step, fakeRoot({ "header .gear": [el(900, 5, 40, 40, false)], ".kgear": [el(8, 8, 44, 44)] }), {});
  assert.equal(b.rect.left, 8);
  assert.equal(b.text, "T-kgear", "anderer Text am Wandtablet");
});

test("findTarget: Finger-Text, nächster Treffer zur Mitte, Vereinigung, Zielfläche ohne Ausschnitt", () => {
  const step = { sel: [{ q: ".label", nearest: true }, { q: ".canvas", bare: true }], text: "T", touch: "T-finger" };
  const labels = [el(20, 20, 80, 30), el(480, 280, 80, 30), el(900, 500, 80, 30), el(2000, 100, 80, 30)];
  const hit = findTarget(step, fakeRoot({ ".label": labels, ".canvas": [el(0, 0, 1000, 600)] }), { center: stage });
  assert.equal(hit.rect.left, 480, "das mittigste Etikett");
  assert.equal(hit.bare, false);
  assert.equal(hit.text, "T");
  assert.equal(findTarget(step, fakeRoot({ ".label": labels }), { center: stage, touch: true }).text, "T-finger");
  // ein verdecktes (fast durchsichtiges) Etikett mitten im Bild wird übergangen
  const behind = [el(480, 280, 80, 30, true, true), el(600, 330, 80, 30)];
  assert.equal(findTarget(step, fakeRoot({ ".label": behind }), { center: stage }).rect.left, 600);
  // alle Etiketten außerhalb des Bildes: Zielfläche ohne Ausschnitt
  const out = findTarget(step, fakeRoot({ ".label": [el(2000, 100, 80, 30)], ".canvas": [el(0, 0, 1000, 600)] }), { center: stage });
  assert.equal(out.bare, true);
  assert.equal(out.rect.width, 1000);
  // Vereinigung aller Werkzeug-Knöpfe
  const tools = { sel: [{ q: ".ed-bar > [data-tool]", union: true }, ".ed-bar [data-menu=tools]"], text: "T" };
  const u = findTarget(tools, fakeRoot({ ".ed-bar > [data-tool]": [el(100, 10, 40, 36), el(140, 10, 40, 36), el(180, 10, 40, 36)] }), {});
  assert.deepEqual([u.rect.left, u.rect.right, u.rect.width, u.rect.top, u.rect.bottom], [100, 220, 120, 10, 46]);
  // kompakt: die Werkzeug-Knöpfe stecken im verborgenen Menü, der Menüknopf zählt
  const c = findTarget(tools, fakeRoot({ ".ed-bar > [data-tool]": [], ".ed-bar [data-menu=tools]": [el(60, 10, 120, 36)] }), {});
  assert.equal(c.rect.left, 60);
});

test("cardPosition: unter, über, seitlich, ohne Platz mittig oben; immer im Bild", () => {
  const view = { width: 1000, height: 600 };
  const card = { width: 320, height: 160 };
  const r = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const inside = (p) => p.left >= 8 && p.top >= 8 && p.left + card.width <= view.width - 8 && p.top + card.height <= view.height - 8;
  const below = cardPosition(r(400, 20, 100, 40), card, view);
  assert.equal(below.top, 72, "unter dem Ziel");
  const above = cardPosition(r(400, 500, 100, 40), card, view);
  assert.equal(above.top, 500 - 12 - 160, "über dem Ziel");
  const tall = cardPosition(r(940, 150, 50, 300), card, view);
  assert.equal(tall.left, 940 - 12 - 320, "hohes, schmales Ziel am rechten Rand: links daneben");
  const edge = cardPosition(r(960, 10, 40, 40), card, view);
  assert.ok(inside(edge) && edge.left + card.width <= 992, "am Rand eingeklemmt");
  const none = cardPosition(r(0, 0, 1000, 600), card, view);
  assert.ok(inside(none), "ohne Platz");
  assert.equal(cardPosition(null, card, view).left, 340, "ohne Ziel: mittig");
  for (const p of [below, above, tall, edge, none]) assert.ok(inside(p), JSON.stringify(p));
  // schmaler Bildschirm: Karte passt sich nicht über den Rand
  const narrow = cardPosition(r(10, 100, 40, 40), { width: 296, height: 200 }, { width: 320, height: 640 });
  assert.ok(narrow.left >= 8 && narrow.left + 296 <= 312);
});

test("tour.js: kein Editor-Import, kein Netz", () => {
  const code = readFileSync(new URL("tour.js", FRONT), "utf8");
  assert.doesNotMatch(code, /from\s+"\.\/editor[^"]*"/);
  assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(code, /localStorage/);
});
