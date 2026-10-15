// Einführung (Mixin für Haus3DPanel): kurze Tour beim ersten Öffnen von Panel und Editor. Ein Ausschnitt hebt das Ziel
// hervor, eine Karte erklärt es. Die Tour löst nichts aus: sie schluckt Klicks und Tasten, bis sie endet. „Gesehen“ merkt
// sich dieser Browser in localStorage (haus3d.tour); über „?“ → „Einführung starten“ geht sie jederzeit wieder auf.

import { ensureStyle } from "./panel-util.js";

/** Version der Tour: Hochzählen zeigt eine überarbeitete Tour erneut. */
export const TOUR_VERSION = 1;
export const TOUR_KEY = "haus3d.tour";

// Ziele: Liste von Selektoren, der erste sichtbare Treffer zählt (ohne sichtbares Ziel fällt der Schritt aus).
// Eintrag als Objekt: nearest = der Treffer nächst der Mitte, union = alle Treffer zusammen, bare = ohne Ausschnitt.
// text/touch: Text für Finger-Geräte; alt: anderer Text, wenn ein bestimmter Selektor getroffen wurde.
export const PANEL_TOUR = [
  { id: "demo", demo: true, sel: [".modes .m-demo"], title: "Demo-Haus", text: "Ein Vorführhaus: Alle Werte sind simuliert, nichts wird wirklich geschaltet. Tippe ruhig überall drauf." },
  { id: "rooms", sel: [{ q: ".overlay .room .label", nearest: true }, { q: ".canvas", bare: true }], title: "Räume", text: "Raum antippen: Die Kamera fährt hin. Gedrückt halten öffnet das Raumfenster mit Licht, Klima und allen Geräten." },
  { id: "floors", sel: [".floorbar"], title: "Etagen", text: "Hier wechselst du die Etage. „Alle“ zeigt das ganze Haus mit Dach, Doppeltipp passt die Ansicht ein." },
  { id: "wheel", sel: [".wheel.right .fab"], title: "Funktionsrad", text: "Energiefluss, Bodenfarbe, Zeitstrahl, Sicherheit, Begehen und mehr. Antippen klappt es auf, drehen mit Finger oder Mausrad." },
  { id: "edit", sel: ["header .gear", ".kgear"], title: "Bearbeiten", text: "Im Zahnrad stellst du Stil und Ebenen ein. „Bearbeiten“ (PIN) öffnet den Grundriss-Editor." },
  { id: "help", sel: ["header .help", ".kgear"], title: "Hilfe", text: "Hier findest du jederzeit Gesten, Tastenkürzel und diese Einführung.", alt: { ".kgear": "Im Zahnrad unter „Hilfe & Einführung“ findest du Gesten, Tastenkürzel und diese Einführung." } },
];

export const EDITOR_TOUR = [
  { id: "tools", sel: [{ q: ".ed-bar > [data-tool]", union: true }, ".ed-bar [data-menu=tools]"], title: "Werkzeuge", text: "Werkzeug wählen, dann in den Plan tippen oder ziehen: Räume, Wände, Fenster, Möbel, Geräte, Garten und mehr." },
  { id: "floor", sel: [".ed-bar .floorsel"], title: "Etagen", text: "Etage wählen – hier gibt es auch „+ Dachgeschoss“. Weitere Etagen: „+ Etage“ in den Etagen-Eigenschaften." },
  { id: "roof", sel: [".ed-bar .roofbtn"], title: "Dach", text: "Dach-Ebene dieser Etage: Hausdach, eigene Dächer, PV-Felder, Kamin, Dachfenster und Gauben." },
  { id: "view", sel: [".ed-bar .seg"], title: "3D-Ansicht", text: "2D, 2D + 3D oder 3D. In 3D Teile anklicken und an den Pfeilen ziehen; Strg halten = nur Ansicht.", touch: "2D, 2D + 3D oder 3D. In 3D Teile antippen und an den Pfeilen ziehen; Schalter „Nur Ansicht“ = nur drehen." },
  { id: "save", sel: [".ed-bar [data-act=save]"], title: "Speichern", text: "„Speichern“ übernimmt alles. Bis dahin sichert der Browser einen Entwurf; Rückgängig mit Strg+Z.", touch: "„Speichern“ übernimmt alles. Bis dahin sichert der Browser einen Entwurf; Rückgängig mit dem Pfeil oben." },
  { id: "help", sel: [".ed-bar [data-act=help]"], title: "Hilfe", text: "„?“ erklärt das gewählte Werkzeug mit Gesten und Tastenkürzeln." },
];

/** Schritte einer Tour-Art: „panel“ ohne den Demo-Schritt, „demo“ mit ihm, „editor“. */
export const tourSteps = (kind) => (kind === "editor" ? EDITOR_TOUR : PANEL_TOUR.filter((s) => !s.demo || kind === "demo"));

// ------------------------------------------------------------------ rein (ohne DOM)

/** Hat dieser Browser die Tour schon gesehen? Nicht nutzbarer Speicher (fehlt, wirft) gilt als gesehen: lieber keine Tour als bei jedem Laden. */
export function tourSeen(storage, kind) {
  let raw;
  try {
    if (!storage) return true;
    raw = storage.getItem(TOUR_KEY);
  } catch {
    return true;
  }
  let seen = {};
  try {
    seen = JSON.parse(raw) ?? {};
  } catch {
    /* kaputter Eintrag: nichts gesehen */
  }
  return Number(seen?.[kind]) >= TOUR_VERSION;
}

/** „Gesehen“ merken (andere Arten und höhere Versionen bleiben). Gibt zurück, ob es gespeichert werden konnte. */
export function markTourSeen(storage, kind) {
  try {
    let seen = {};
    try {
      seen = JSON.parse(storage.getItem(TOUR_KEY)) ?? {};
    } catch {
      /* kaputter Eintrag: neu anfangen */
    }
    if (typeof seen !== "object" || Array.isArray(seen)) seen = {};
    seen[kind] = Math.max(Number(seen[kind]) || 0, TOUR_VERSION);
    storage.setItem(TOUR_KEY, JSON.stringify(seen));
    return true;
  } catch {
    return false;
  }
}

/** Index des nächsten sichtbaren Schritts ab i in Richtung dir (+1 weiter, -1 zurück); -1 wenn keiner mehr kommt. */
export function nextStep(steps, i, dir, visible) {
  for (let j = i + dir; j >= 0 && j < steps.length; j += dir) if (visible(steps[j], j)) return j;
  return -1;
}

// ------------------------------------------------------------------ Ziel finden und Karte setzen

const storageOf = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Sichtbar? (Rechtecke vorhanden und Breite > 0; verborgene Elemente haben keine.) */
function rectOf(el) {
  if (!el?.getClientRects?.().length) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

const union = (rects) => {
  const l = Math.min(...rects.map((r) => r.left));
  const t = Math.min(...rects.map((r) => r.top));
  const r = Math.max(...rects.map((x) => x.right));
  const b = Math.max(...rects.map((x) => x.bottom));
  return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
};

/**
 * Ziel eines Schritts: { rect, bare, text } oder null. root: wo gesucht wird (Panel-Schattenbaum bzw. Editor),
 * center: Mitte der Bühne (für „nearest“), touch: Finger-Gerät.
 */
export function findTarget(step, root, { center = null, touch = false } = {}) {
  for (const entry of step.sel) {
    const o = typeof entry === "string" ? { q: entry } : entry;
    let items = [...root.querySelectorAll(o.q)].map((el) => ({ el, rect: rectOf(el) })).filter((x) => x.rect);
    if (o.nearest && center) {
      // nur, was mit seiner Mitte im Bild liegt und nicht verdeckt ist (ausgeblendete Etiketten), davon das Mittigste
      const mid = (x) => [(x.rect.left + x.rect.right) / 2, (x.rect.top + x.rect.bottom) / 2];
      items = items.filter((x) => {
        const [mx, my] = mid(x);
        return mx >= center.left && mx <= center.right && my >= center.top && my <= center.bottom && !x.el.closest?.(".hidden-behind");
      });
      const dist = (x) => Math.hypot(mid(x)[0] - center.x, mid(x)[1] - center.y);
      items.sort((a, b) => dist(a) - dist(b));
    }
    if (!items.length) continue;
    const rect = o.union ? union(items.map((x) => x.rect)) : items[0].rect;
    const text = step.alt?.[o.q] ?? ((touch && step.touch) || step.text);
    return { rect, bare: !!o.bare, text };
  }
  return null;
}

const TOUR_STYLE = `
.tour { position: fixed; inset: 0; z-index: 11; touch-action: none; }
.tour.bare { background: rgba(0,0,0,.55); }
.tour .tour-hole { position: absolute; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0,0,0,.55); pointer-events: none; transition: left .25s, top .25s, width .25s, height .25s; }
.tour.bare .tour-hole { display: none; }
.tour .tour-card { position: absolute; box-sizing: border-box; width: min(320px, calc(100% - 24px)); padding: 14px 16px 12px; border-radius: 14px; background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 8px 28px rgba(0,0,0,.45); transition: left .25s, top .25s; }
.tour .tour-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.tour .tt { font-size: 16px; font-weight: 600; }
.tour .tn { flex: none; font-size: 12px; color: var(--secondary-text-color); }
.tour .tx { margin: 6px 0 12px; font-size: 14px; line-height: 1.45; }
.tour .tf { display: flex; align-items: center; gap: 8px; }
.tour .tf .sp { flex: 1; }
.tour .tf button { min-height: 40px; padding: 0 14px; font: inherit; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; cursor: pointer; }
.tour .tf .skip { padding: 0 6px; border-color: transparent; color: var(--secondary-text-color); }
.tour .tf .next { border-color: transparent; background: var(--primary-color, #03a9f4); color: #fff; }
@media (prefers-reduced-motion: reduce) { .tour .tour-hole, .tour .tour-card { transition: none; } }
`;

/** Karte neben das Ziel setzen: unter, über, links oder rechts davon (hohe, schmale Ziele zuerst seitlich); ohne Platz mittig oben. */
export function cardPosition(rect, card, view, gap = 12, margin = 8) {
  const clampX = (x) => Math.max(margin, Math.min(x, view.width - card.width - margin));
  const clampY = (y) => Math.max(margin, Math.min(y, view.height - card.height - margin));
  const top = { left: clampX((view.width - card.width) / 2), top: clampY(72) };
  if (!rect) return top;
  const side = {
    below: () => (rect.bottom + gap + card.height <= view.height - margin ? { left: clampX(rect.left + rect.width / 2 - card.width / 2), top: rect.bottom + gap } : null),
    above: () => (rect.top - gap - card.height >= margin ? { left: clampX(rect.left + rect.width / 2 - card.width / 2), top: rect.top - gap - card.height } : null),
    left: () => (rect.left - gap - card.width >= margin ? { left: rect.left - gap - card.width, top: clampY(rect.top + rect.height / 2 - card.height / 2) } : null),
    right: () => (rect.right + gap + card.width <= view.width - margin ? { left: rect.right + gap, top: clampY(rect.top + rect.height / 2 - card.height / 2) } : null),
  };
  const tall = rect.height > rect.width * 2;
  for (const k of tall ? ["left", "right", "below", "above"] : ["below", "above", "left", "right"]) {
    const p = side[k]();
    if (p) return p;
  }
  return top;
}

// ------------------------------------------------------------------ Mixin

const isDemo = (panel) => !!(panel._isDemo?.() ?? panel._house?.demo);

export const TourMethods = {
  /** Tour der Art „panel“, „editor“ (mit dem Editor ed) oder „demo“ einmal von selbst zeigen, falls noch nicht gesehen. */
  _tourAuto(kind, ed) {
    if (kind === "editor") return this._tourAutoEditor(ed);
    clearTimeout(this._tourTimer);
    // 1,5 s nach dem Laden (und nach jedem Hauswechsel), wenn nichts anderes offen ist
    this._tourTimer = setTimeout(() => {
      const k = isDemo(this) ? "demo" : "panel";
      if (!this.isConnected || tourSeen(storageOf(), k) || !this._tourPanelReady()) return;
      this._tourStart(k);
    }, 1500);
  },

  /** Darf die Panel-Tour jetzt von selbst starten? (nicht im Editor, in Dialogen, beim PIN-Feld, Begehen, am Wandtablet) */
  _tourPanelReady() {
    return (
      document.visibilityState === "visible" &&
      !!this._building?.floors?.length &&
      !this._tourRun &&
      !this._editor &&
      !this._editorOpening &&
      !this._dialog &&
      !this._popup &&
      !this._confirmEl &&
      !this._switching &&
      !this.hasAttribute("kiosk") &&
      !this._kioskUrl &&
      !this.shadowRoot.querySelector(".pinpad") &&
      !this._scene?.isWalking?.()
    );
  },

  /** Editor-Tour: wartet, bis Grundeinstellungen, Entwurfs-Hinweis und Dialoge weg sind, und startet 400 ms danach. */
  _tourAutoEditor(ed) {
    if (!ed || tourSeen(storageOf(), "editor")) return;
    let calm = false;
    const stop = () => {
      clearInterval(poll);
      obs.disconnect();
    };
    const check = () => {
      if (!this.isConnected || this._editor !== ed || !ed.root?.isConnected) return stop();
      const busy = !!ed._setupEl || !!ed._bannerEl?.isConnected || !!this._dialog || !!this._confirmEl || !!this._tourRun || document.visibilityState !== "visible";
      if (busy) {
        calm = false;
      } else if (!calm) {
        calm = true; // erst beim nächsten Takt: 400 ms Ruhe nach dem Schließen
      } else {
        stop();
        this._tourStart("editor", ed);
      }
    };
    const poll = setInterval(check, 400);
    const obs = new MutationObserver(() => {
      calm = false; // am Editor hat sich etwas getan (Fenster auf/zu): neu abwarten
    });
    obs.observe(ed.root, { childList: true });
  },

  /** Tour dieser Art jetzt starten (auch wenn schon gesehen). */
  _tourStart(kind, ed) {
    this._tourEnd();
    if (!this.isConnected || (kind === "editor" && !ed?.root?.isConnected)) return;
    const steps = tourSteps(kind);
    const root = kind === "editor" ? ed.root : this.shadowRoot;
    const touch = !!window.matchMedia?.("(pointer: coarse)").matches;
    ensureStyle(this.shadowRoot, "tour", TOUR_STYLE);

    const box = document.createElement("div");
    box.className = "tour";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Einführung");
    box.innerHTML = `<div class="tour-hole"></div><div class="tour-card"><div class="tour-top"><span class="tt"></span><span class="tn"></span></div><p class="tx"></p><div class="tf"><button class="skip">Überspringen</button><span class="sp"></span><button class="back">Zurück</button><button class="next">Weiter</button></div></div>`;
    const hole = box.querySelector(".tour-hole");
    const card = box.querySelector(".tour-card");
    const q = (s) => box.querySelector(s);
    const buttons = [q(".skip"), q(".back"), q(".next")];

    const view = () => {
      const stage = (this._els?.stage ?? this).getBoundingClientRect();
      return { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom, x: (stage.left + stage.right) / 2, y: (stage.top + stage.bottom) / 2 };
    };
    const find = (step) => findTarget(step, root, { center: view(), touch });
    const visible = (step) => !!find(step);
    let i = -1;
    let last = null; // zuletzt gesetztes Ziel (bei Größenänderung ohne Ziel bleibt die Karte stehen)

    const place = () => {
      const t = i >= 0 ? find(steps[i]) : null;
      const o = box.getBoundingClientRect(); // Ursprung des Rahmens (falls ein Vorfahre fixed verschiebt)
      const v = { width: o.width, height: o.height };
      const rect = t ? { left: t.rect.left - o.left, top: t.rect.top - o.top, width: t.rect.width, height: t.rect.height, right: t.rect.right - o.left, bottom: t.rect.bottom - o.top } : null;
      if (t) last = t;
      else if (!last) return;
      const use = t ?? last;
      box.classList.toggle("bare", use.bare);
      if (rect && !use.bare) {
        const pad = 6;
        Object.assign(hole.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + 2 * pad}px`, height: `${rect.height + 2 * pad}px` });
      }
      const pos = cardPosition(use.bare ? null : rect, { width: card.offsetWidth, height: card.offsetHeight }, v);
      Object.assign(card.style, { left: `${pos.left}px`, top: `${pos.top}px` });
    };
    const show = () => {
      const step = steps[i];
      const t = find(step);
      const pos = steps.slice(0, i + 1).filter(visible).length;
      const total = steps.filter(visible).length;
      q(".tt").textContent = step.title;
      q(".tx").textContent = t?.text ?? step.text;
      q(".tn").textContent = `${pos} von ${total}`;
      q(".back").hidden = pos <= 1;
      q(".next").textContent = nextStep(steps, i, 1, visible) < 0 ? "Fertig" : "Weiter";
      last = null;
      place();
      q(".next").focus({ preventScroll: true });
    };
    const finish = (seen) => this._tourEnd(seen);
    const go = (dir) => {
      const j = nextStep(steps, i, dir, visible);
      if (j >= 0) {
        i = j;
        show();
      } else if (dir > 0) finish(true);
    };

    // Tasten gehören der Tour: nichts davon erreicht den Editor oder das Panel dahinter
    const onKey = (ev) => {
      if (this._tourRun?.box !== box || !this.isConnected) return this._tourEnd();
      ev.stopPropagation();
      const onButton = ev.composedPath?.()[0]?.tagName === "BUTTON";
      if (ev.key === "Escape") {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === "ArrowRight" || (ev.key === "Enter" && !onButton)) {
        ev.preventDefault();
        go(1);
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        go(-1);
      } else if (ev.key === "Tab") {
        ev.preventDefault();
        const list = buttons.filter((b) => !b.hidden);
        const at = list.indexOf(this.shadowRoot.activeElement);
        list[(at + (ev.shiftKey ? -1 : 1) + list.length) % list.length].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    q(".skip").addEventListener("click", () => finish(true));
    q(".back").addEventListener("click", () => go(-1));
    q(".next").addEventListener("click", () => go(1));
    for (const t of ["click", "pointerdown", "wheel", "contextmenu"]) box.addEventListener(t, (ev) => ev.stopPropagation());
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    const obs = new ResizeObserver(onResize);
    obs.observe(box);
    // Editor zu oder Panel weg: Tour räumt sich selbst weg (nicht als gesehen)
    const watch = setInterval(() => {
      if (!this.isConnected || (kind === "editor" && !ed.root.isConnected)) this._tourEnd();
    }, 500);

    const opener = this.shadowRoot.activeElement;
    this.shadowRoot.appendChild(box);
    this._tourRun = {
      kind,
      box,
      stop: () => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onResize);
        obs.disconnect();
        clearInterval(watch);
        box.remove();
        if (opener?.isConnected) opener.focus?.({ preventScroll: true });
      },
    };
    i = nextStep(steps, -1, 1, visible);
    if (i < 0) return this._tourEnd(); // nichts zu zeigen (Ziele noch nicht da): nicht als gesehen merken
    show();
  },

  /** Laufende Tour beenden; seen = true merkt sie als gesehen (Überspringen, Fertig, Esc). */
  _tourEnd(seen = false) {
    const run = this._tourRun;
    if (!run) return;
    this._tourRun = null;
    run.stop();
    if (seen) markTourSeen(storageOf(), run.kind);
  },
};
