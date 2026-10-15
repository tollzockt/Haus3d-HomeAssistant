// Wächter „Hinweise“: Stilregel für Hinweiszeilen, Toasts, Erklärtexte und leere Zustände (Kurzfassung der Regel:
// Handlung zuerst, Hinweiszeile ≤ 140, Toast ≤ 120, Erklärtext ≤ 200, kein „!“, leere Zustände mit nächstem Schritt).
// Die Prüfung liest den Quelltext (Toast-Aufrufe und Hinweis-Absätze) und die Hinweis-Listen der Editor-Module.
// Ausnahmen stehen unten mit Begründung – neue Ausnahmen nur, wenn ein Kürzen den Inhalt zerstören würde.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { HINTS } from "../../custom_components/haus3d/frontend/editor-tools.js";
import { ROOF_HINTS } from "../../custom_components/haus3d/frontend/editor-roof.js";
import { PLAN_HINTS } from "../../custom_components/haus3d/frontend/editor-plan.js";
import { PIPE_HINT } from "../../custom_components/haus3d/frontend/editor-pipes.js";
import { NODE_HINT } from "../../custom_components/haus3d/frontend/editor-nodes.js";

const FRONT = new URL("../../custom_components/haus3d/frontend/", import.meta.url);
const FILES = readdirSync(FRONT).filter((f) => f.endsWith(".js"));
const src = (f) => readFileSync(new URL(f, FRONT), "utf8");

const HINT_MAX = 140;
const TOAST_MAX = 120;
const NOTE_MAX = 200;

// Ausnahmen – nur mit Begründung:
// Absätze mit der Klasse „brandnote“ sind von der Längengrenze ausgenommen: Sie tragen den Pflichttext der Markenregel
// (CLAUDE.md, „Marken“: Herstellernamen nur als Bezug, keine Verbindung) und dürfen nicht gekürzt werden, um zu passen.
// (Aktuell sind beide Texte ohnehin unter 200 Zeichen; die Ausnahme sichert künftige Ergänzungen.)
const EXEMPT_CLASS = /brandnote/;

// ------------------------------------------------------------------ Quelltext lesen

/** Liest ab `from` (hinter einer öffnenden Klammer oder einem „=“) alle Zeichenketten-Literale bis zum Ende des
 * Ausdrucks (Klammer zu bzw. Semikolon auf Tiefe 0). Liefert die festen Teile: Schablonen ohne ${…}. */
function literalsFrom(code, from, closer) {
  const out = [];
  let depth = 0;
  let i = from;
  const readLiteral = () => {
    // i steht auf dem Anführungszeichen; liefert den festen Teil, springt hinter das schließende Zeichen.
    // Literale innerhalb von ${…} landen einzeln in `out`.
    const q = code[i++];
    let fixed = "";
    while (i < code.length && code[i] !== q) {
      if (code[i] === "\\") {
        fixed += code[i + 1] ?? "";
        i += 2;
      } else if (q === "`" && code[i] === "$" && code[i + 1] === "{") {
        i += 2;
        let d = 1;
        while (i < code.length && d) {
          const c = code[i];
          if (c === '"' || c === "'" || c === "`") {
            out.push(readLiteral());
            continue;
          }
          if (c === "{") d++;
          else if (c === "}") d--;
          i++;
        }
      } else fixed += code[i++];
    }
    i++;
    return fixed;
  };
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") out.push(readLiteral());
    else {
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break; // Ausdruck zu Ende (schließende Klammer des Aufrufs bzw. der Umgebung)
        depth--;
      } else if (c === ";" && depth === 0 && closer === ";") break;
      i++;
    }
  }
  return out;
}

/** Feste Texte aller Toasts einer Datei: `_toast(…)`, `_editorToast(…)`, lokales `toast(…)` und Meldungsvariablen `msg`. */
function toastTexts(file, code = src(file)) {
  const found = [];
  const call = /(?:\b_toast|\b_editorToast|(?<![\w.])toast)\??\.?\(/g;
  for (let m; (m = call.exec(code)); ) {
    if (/^\s*(?:_toast|_editorToast|toast)\s*\(\s*(?:text|msg)\s*\)\s*\{/.test(code.slice(m.index, m.index + 60))) continue; // Definition
    const line = code.slice(0, m.index).split("\n").length;
    for (const t of literalsFrom(code, m.index + m[0].length, ")")) found.push({ line, t });
  }
  const msgVar = /\b(?:const|let)\s+msg\s*=(?!=)|\bmsg\s*\+?=(?!=)\s*/g;
  for (let m; (m = msgVar.exec(code)); ) {
    const line = code.slice(0, m.index).split("\n").length;
    for (const t of literalsFrom(code, m.index + m[0].length, ";")) found.push({ line, t });
  }
  return found;
}

/** Erklärabsätze `<p class="muted …">…</p>` und `class="hint …"`: fester Text ohne Tags und ${…}. */
function noteTexts(file, code = src(file)) {
  const found = [];
  const re = /class="(?:muted|hint)[^"]*"[^>]*>/g;
  for (let m; (m = re.exec(code)); ) {
    const start = m.index + m[0].length;
    const tag = code.slice(0, m.index).match(/<(\w+)[^<]*$/)?.[1] ?? "p";
    const end = code.indexOf(`</${tag}>`, start);
    if (end < 0) continue;
    const raw = code.slice(start, end);
    if (/^\s*<(?!(?:b|i|code|em|strong|a)\b)/.test(raw)) continue; // verschachtelte Elemente: eigener Treffer
    let text = raw;
    for (let k = 0; k < 4; k++) text = text.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
    text = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text.length > 3) found.push({ line: code.slice(0, m.index).split("\n").length, t: text, exempt: EXEMPT_CLASS.test(m[0]) });
  }
  return found;
}

// ------------------------------------------------------------------ Prüfungen

test("Wächter erkennt Verstöße (Leser an erfundenem Quelltext geprüft)", () => {
  const long = "x".repeat(130);
  const code = [
    'this._toast("Gespeichert!");',
    "this._toast(`Zu lang ${n}: " + long + "`);",
    'this._toast(n ? "Eins." : `Zwei ${a + `"` + b}.`);',
    'const msg = "Nachricht" + (a ? " mehr!" : "");',
    '<p class="muted">Fest ${der.Rest ? "wird ignoriert" : ""} <b>und</b> mehr.</p>',
    '<p class="muted brandnote">Marke</p>',
    "<span>Noch keine Dinge.</span> und <p>Noch kein Ding.</p><button>Neu</button>",
  ].join("\n");
  const toasts = toastTexts("x.js", code).map((r) => r.t);
  assert.ok(toasts.includes("Gespeichert!") && toasts.some((t) => t.length > TOAST_MAX), JSON.stringify(toasts));
  assert.ok(toasts.includes("Eins.") && toasts.includes("Nachricht") && toasts.includes(" mehr!"), JSON.stringify(toasts));
  const notes = noteTexts("x.js", code);
  assert.equal(notes[0].t, "Fest und mehr.");
  assert.equal(notes[1].exempt, true);
});


test("Hinweiszeilen des Editors: höchstens 140 Zeichen, enden mit „.“ oder „)“", () => {
  const all = [
    ...Object.entries(HINTS).map(([k, t]) => [`HINTS.${k}`, t]),
    ...Object.entries(ROOF_HINTS).map(([k, t]) => [`ROOF_HINTS.${k}`, t]),
    ...Object.entries(PLAN_HINTS).map(([k, t]) => [`PLAN_HINTS.${k}`, t]),
    ["PIPE_HINT", PIPE_HINT],
    ["NODE_HINT", NODE_HINT],
  ];
  assert.ok(all.length >= 24);
  const bad = [];
  for (const [name, t] of all) {
    if (typeof t !== "string") bad.push(`${name}: kein Text`);
    else {
      if (t.length > HINT_MAX) bad.push(`${name}: ${t.length} Zeichen`);
      if (!/[.)]$/.test(t)) bad.push(`${name}: endet nicht mit „.“ oder „)“`);
      if (/!/.test(t)) bad.push(`${name}: enthält „!“`);
    }
  }
  assert.deepEqual(bad, []);
});

test("Toasts: feste Teile höchstens 120 Zeichen, ohne „!“", () => {
  const bad = [];
  let n = 0;
  for (const f of FILES) {
    for (const { line, t } of toastTexts(f)) {
      if (!/[A-Za-zÄÖÜäöü]{3}/.test(t)) continue;
      n++;
      if (t.length > TOAST_MAX) bad.push(`${f}:${line}: ${t.length} Zeichen: ${t}`);
      if (/!/.test(t)) bad.push(`${f}:${line}: „!“: ${t}`);
    }
  }
  assert.ok(n > 150, `nur ${n} Toast-Texte gefunden – Leser kaputt?`);
  assert.deepEqual(bad, []);
});

test("Erklärtexte (class muted/hint): höchstens 200 Zeichen", () => {
  const bad = [];
  let n = 0;
  for (const f of FILES) {
    for (const { line, t, exempt } of noteTexts(f)) {
      n++;
      if (!exempt && t.length > NOTE_MAX) bad.push(`${f}:${line}: ${t.length} Zeichen: ${t}`);
      if (/!/.test(t)) bad.push(`${f}:${line}: „!“: ${t}`);
    }
  }
  assert.ok(n > 100, `nur ${n} Erklärtexte gefunden – Leser kaputt?`);
  assert.deepEqual(bad, []);
});

test("Leere Zustände: „Noch kein …“ nennt den nächsten Schritt (zweiter Satz, „ – “ oder ein Knopf dahinter)", () => {
  const bad = [];
  let n = 0;
  for (const f of FILES) {
    const code = src(f);
    for (let m, re = /Noch kein/g; (m = re.exec(code)); ) {
      const tail = code.slice(m.index, m.index + 500);
      // der Satz endet am Anführungszeichen des Literals, am Zeilenende oder am schließenden Absatz-Tag
      const cut = tail.search(/["'`\n]|<\/(?:p|span|div|li)>/);
      const rest = cut < 0 ? "" : tail.slice(cut);
      const text = (cut < 0 ? tail : tail.slice(0, cut)).replace(/\$\{[^}]*\}/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!/^Noch kein/.test(text)) continue; // Kommentare u. Ä. mit anderem Zusammenhang
      if (/^\s*(?:\/\/|\*)/.test(code.slice(code.lastIndexOf("\n", m.index) + 1, m.index))) continue; // Kommentarzeile
      n++;
      const second = /^[^.]*\.\s+\S/.test(text) || / – /.test(text) || /^<\/(?:p|span|div)><button/.test(rest);
      if (!second) bad.push(`${f}:${code.slice(0, m.index).split("\n").length}: ${text}`);
    }
  }
  assert.ok(n >= 8, `nur ${n} leere Zustände gefunden`);
  assert.deepEqual(bad, []);
});

test("Benannte Hinweis-Konstanten (…HINT…) im Quelltext: höchstens 200 Zeichen", () => {
  const bad = [];
  let n = 0;
  for (const f of FILES) {
    const code = src(f);
    for (let m, re = /\b(?:const|let)\s+([A-Z_]*HINT[A-Z_]*)\s*=\s*([{"'`])/g; (m = re.exec(code)); ) {
      const from = m.index + m[0].length - (m[2] === "{" ? 0 : 1);
      const lits = m[2] === "{" ? literalsFrom(code, from + 1, "}") : literalsFrom(code, from, ";").slice(0, 1);
      for (const t of lits) {
        if (!/[A-Za-zÄÖÜäöü]{3}/.test(t)) continue;
        n++;
        const plain = t.replace(/<[^>]+>/g, "").trim();
        if (plain.length > NOTE_MAX) bad.push(`${f}: ${m[1]}: ${plain.length} Zeichen: ${plain}`);
        if (/!/.test(plain)) bad.push(`${f}: ${m[1]}: „!“: ${plain}`);
      }
    }
  }
  assert.ok(n >= 10, `nur ${n} Hinweis-Konstanten gefunden`);
  assert.deepEqual(bad, []);
});
