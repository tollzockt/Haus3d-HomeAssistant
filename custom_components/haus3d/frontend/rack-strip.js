// HE-Leiste im Eigenschaftenfeld eines Schranks (Netzwerk- und Serverschrank) und seiner eingebauten Geräte: jede Höheneinheit (HE) eine
// Zeile, 1 unten. Freie HE antippen → Liste der passenden Teile → Einbau genau dort; Gerät antippen → Eigenschaften; ▲/▼ und Ziehen mit der
// Maus ordnen um. Die Planung (was passt, Tausch) steht in rack-plan.js, die Lage rechnet follow-rack.js nach. Zustand am Editor:
// ed._rackPick = {cab, u} (offene Liste), ed._rackScroll (Map cabId → scrollTop), ed._rackFlash (gerade eingebaut), ed._rackStep
// (letzter ▲/▼-Schritt, für den gemeinsamen Rückgängig-Schritt).

import { allIds, newId } from "./edit-ops.js";
import { FURNITURE } from "./furniture.js";
import { cabinetInfo, heOf, isCabinet, rackKind, slotFree } from "./rack.js";
import { rackLedKind } from "./rack-live.js";
import { applyMoves, dropTarget, gaps, isPassive, newRackItem, rackCandidates, stepTarget } from "./rack-plan.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const W = 260; // Breite der Zeichnung
const FX = 36; // Fläche der Geräte: x 36 … 244
const FW = 208;

/** Zeilenhöhe: groß am Tablet (Finger), sonst klein. */
export const rowH = (ed) => (ed?.coarse ? 32 : 24);
/** Bereich "HE 3" bzw. "HE 3–4". */
export const span = (u, he) => (he > 1 ? `HE ${u}–${u + he - 1}` : `HE ${u}`);
/** Anzeigename eines Möbelstücks: eigener Name, sonst Katalogname. */
export const nameOf = (m) => m.name || FURNITURE[m.type]?.[0] || m.type;
/** Name in der Leiste: Tischgeräte stehen auf einem Fachboden. */
const labelOf = (m) => nameOf(m) + (rackKind(m.type) === "desk" ? " (Fachboden)" : "");
const shorten = (s, n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);
const hasEntity = (m) => typeof m?.entity === "string" && m.entity.includes(".") && m.entity !== "none";

/** Der Schrank mit der ID, frisch aus der Etage des Editors (oder null). */
export const freshCabinet = (ed, id) => (ed.floor?.furniture ?? []).find((c) => c.id === id && isCabinet(c)) ?? null;

// ------------------------------------------------------------------ Zeichnung

/** HTML der Leiste für den Schrank cab; focusId = das gewählte eingebaute Gerät (hervorgehoben, wird eingescrollt). */
export function rackStripHtml(ed, cab, { focusId = null } = {}) {
  const info = cabinetInfo(ed.floor, cab);
  const units = info.units;
  if (!units) return `<p class="muted">Dieser Schrank hat keine nutzbare Höheneinheit – erst höher machen.</p>`;
  const H = rowH(ed);
  const states = ed.hass?.states ?? {};
  const top = (u) => 4 + (units - u) * H;
  const mid = (u) => top(u) + H / 2;
  const byTop = new Map(info.devices.map((d) => [d.u + d.he - 1, d]));
  const out = [];
  out.push(`<defs><pattern id="rackhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(127,127,127,.5)" stroke-width="2"/></pattern></defs>`);
  for (const x of [28, 246]) out.push(`<rect class="rail" x="${x}" y="4" width="6" height="${units * H}"/>`);
  for (let u = units; u >= 1; u--) out.push(`<text class="num" x="22" y="${mid(u)}" dy=".35em" text-anchor="end">${u}</text>`);
  // Zeilen von oben nach unten (Tab-Reihenfolge wie das Auge): freie HE und Geräte
  for (let u = units; u >= 1; u--) {
    if (!info.occ[u]) {
      const label = `HE ${u} frei – Gerät einbauen`;
      out.push(`<rect class="free" data-rack-free="${u}" role="button" tabindex="0" aria-label="${label}" x="${FX}" y="${top(u)}" width="${FW}" height="${H}"><title>${label}</title></rect><text class="plus" x="232" y="${mid(u)}" dy=".35em" text-anchor="middle">+</text>`);
      continue;
    }
    const d = byTop.get(u);
    if (!d) continue;
    const y = top(u);
    const h = d.he * H;
    const label = `${span(d.u, d.he)} · ${labelOf(d.item)}`;
    const dot = hasEntity(d.item) ? `<circle class="led ${rackLedKind(states[d.item.entity])}" cx="48" cy="${y + h / 2}" r="4"/>` : "";
    const hu = span(d.u, d.he);
    const tx = dot ? 58 : 44;
    const chars = Math.max(6, Math.floor((238 - tx - hu.length * 6 - 10) / (ed.coarse ? 7.2 : 6.4)));
    const cls = ["dev", isPassive(d.item) && "passive", d.id === focusId && "sel", ed._rackFlash === d.id && "new"].filter(Boolean).join(" ");
    out.push(
      `<g class="${cls}" data-tech-pick="${esc(d.id)}" data-u="${d.u}" data-he="${d.he}" role="button" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title>` +
        `<rect class="hit" x="${FX}" y="${y}" width="${FW}" height="${h}" fill="transparent"/>` +
        `<rect class="body" x="${FX}" y="${y + 1}" width="${FW}" height="${h - 2}" rx="3"/>` +
        (isPassive(d.item) ? `<rect class="hatch" x="${FX}" y="${y + 1}" width="${FW}" height="${h - 2}" rx="3" fill="url(#rackhatch)"/>` : "") +
        `${dot}<text class="nm" x="${tx}" y="${y + h / 2}" dy=".35em">${esc(shorten(labelOf(d.item), chars))}</text>` +
        `<text class="hu" x="238" y="${y + h / 2}" dy=".35em" text-anchor="end">${hu}</text></g>`,
    );
  }
  for (const [a, b] of gaps(info.occ, units)) {
    const n = b - a + 1;
    out.push(`<text class="gap" x="140" y="${(top(b) + top(a) + H) / 2}" dy=".35em" text-anchor="middle">${n >= 2 ? `frei · ${n} HE` : "frei"}</text>`);
  }
  const height = units * H + 8;
  return `<div class="rackstrip" data-rack-strip="${esc(cab.id)}" data-h="${H}" data-units="${units}"><svg width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="group" aria-label="Höheneinheiten, 1 unten">${out.join("")}</svg></div>`;
}

/** Hinweis unter der Leiste. */
export const RACK_HINT = `<p class="muted">Freie HE antippen: Gerät einbauen. Gerät antippen: wählen. Mit der Maus ziehen ordnet um, am Tablet ▲/▼.</p>`;

/** Liste der Teile, die an die angetippte freie HE passen (leer, wenn keine HE angetippt ist oder sie nicht mehr frei ist). */
export function rackListHtml(ed, cab) {
  const pick = ed._rackPick;
  if (!pick || pick.cab !== cab.id) return "";
  const c = rackCandidates(ed.floor, cab, pick.u);
  if (!c.gap) {
    ed._rackPick = null; // nicht mehr frei (z. B. nach Rückgängig)
    return "";
  }
  const btn = (x) => `<button data-rack-add="${esc(x.type)}" data-rack-at="${x.at}">${esc(FURNITURE[x.type]?.[0] ?? x.type)} <span class="muted">${x.he} HE · ${span(x.at, x.he)}</span></button>`;
  const group = (title, list) => (list.length ? `<p class="rl-group">${title}</p>${list.map(btn).join("")}` : "");
  const [a, b] = c.gap;
  const none = !c.unit.length && !c.passive.length && !c.desk.length;
  return `<div class="racklist" data-rack-list="${pick.u}">
    <p class="rl-head"><b>Einbauen ab HE ${pick.u}</b> · Lücke ${a === b ? `HE ${a}` : `HE ${a}–${b}`} (${b - a + 1} HE frei)</p>
    ${group("19-Zoll-Geräte", c.unit)}${group("Blenden und Kabelführung", c.passive)}${group("Tischgeräte auf Fachboden", c.desk)}
    ${none ? `<p class="muted">Hier passt kein Teil hinein.</p>` : ""}
    ${c.hidden ? `<p class="muted">${c.hidden} weitere ${c.hidden === 1 ? "passt" : "passen"} hier nicht (zu tief oder zu hoch für diese Lücke).</p>` : ""}
    <div class="btns"><button data-rack-cancel>Abbrechen</button></div>
  </div>`;
}

// ------------------------------------------------------------------ Aktionen

/** Eingebaute Geräte neu anlegen (Einbau, Vorlage, Lücken füllen): neue IDs, ein Rückgängig-Schritt. Gibt die neuen Möbelstücke zurück. */
export function buildRackItems(ed, cab, plan) {
  const taken = allIds(ed.b);
  const items = plan.map((p) => {
    const id = newId("m", taken);
    taken.add(id);
    return newRackItem(cab, p.type, p.u, id);
  });
  ed.change((fl) => {
    fl.furniture = fl.furniture ?? [];
    fl.furniture.push(...items);
  });
  return items;
}

/** Gerät id um eine HE hoch (dir 1) bzw. runter (−1); schnelle Folgen (< 700 ms, gleiches Gerät) sind ein Rückgängig-Schritt. */
export function stepDevice(ed, cabId, id, dir) {
  const cab = freshCabinet(ed, cabId);
  const moves = cab ? stepTarget(ed.floor, cab, id, dir) : null;
  if (!moves) return false;
  const now = performance.now();
  const s = ed._rackStep;
  const merge = !!s && s.id === id && now - s.t < 700 && s.len === (ed.undoStack?.length ?? 0);
  ed.change((fl) => {
    applyMoves(fl, moves);
  }, { merge });
  ed._rackStep = { id, t: now, len: ed.undoStack?.length ?? 0 };
  return true;
}

const selectItem = (ed, id) => {
  ed._rackPick = null;
  ed.sel = { kind: "furniture", id };
  ed.render();
  ed.renderProps();
};

const focusAgain = (ed, test) => {
  const t = [...(ed.props?.querySelectorAll?.("button, [role=button]") ?? [])].find(test);
  t?.focus?.();
};

// ------------------------------------------------------------------ Ziehen mit der Maus

function bindDrag(strip, ed, cabId) {
  const H = Number(strip.dataset.h);
  const units = Number(strip.dataset.units);
  const svg = strip.querySelector("svg");
  let d = null;
  const rect = () => svg.getBoundingClientRect();
  const scale = () => rect().width / W || 1;
  const topOf = (u, he) => 4 + (units - (u + he - 1)) * H;

  const show = () => {
    const he = d.he;
    const y = (d.cy - rect().top) / scale() - d.grab;
    const u = Math.max(1, Math.min(units - he + 1, units - Math.round((y - 4) / H) - he + 1));
    const cab = freshCabinet(ed, cabId);
    d.u = u;
    d.moves = cab ? dropTarget(ed.floor, cab, d.id, u) : null;
    const g = d.ghost;
    g.setAttribute("class", `ghost ${d.moves ? "ok" : "bad"}`);
    const r = g.querySelector("rect");
    r.setAttribute("y", topOf(u, he) + 1);
    r.setAttribute("height", he * H - 2);
    const t = g.querySelector("text");
    t.setAttribute("y", topOf(u, he) + (he * H) / 2);
    t.textContent = `→ ${span(u, he)}`;
  };
  const stop = () => {
    if (!d) return;
    clearInterval(d.timer);
    window.removeEventListener("keydown", d.onKey, true);
    d.ghost?.remove();
    strip.classList.remove("drag");
    d = null;
  };
  const finish = (apply) => {
    if (!d) return;
    const { active, moves } = d;
    stop();
    if (!active) return;
    ed._rackDragEnd = Date.now(); // der Klick nach dem Zug wählt nichts
    if (apply && moves) {
      ed.change((fl) => {
        applyMoves(fl, moves);
      });
      ed._rackStep = null;
      ed.renderProps();
    }
  };

  strip.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || (ev.pointerType !== "mouse" && ev.pointerType !== "pen")) return;
    const dev = ev.target.closest?.(".dev");
    if (!dev) return;
    stop();
    const u = Number(dev.dataset.u);
    const he = Number(dev.dataset.he);
    d = { id: dev.dataset.techPick, el: dev, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, cy: ev.clientY, he, u, active: false, moves: null, grab: (ev.clientY - rect().top) / scale() - topOf(u, he) };
  });
  strip.addEventListener("pointermove", (ev) => {
    if (!d || ev.pointerId !== d.pid) return;
    d.cy = ev.clientY;
    if (!d.active) {
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return;
      d.active = true;
      try {
        d.el.setPointerCapture(ev.pointerId);
      } catch {
        /* egal */
      }
      strip.classList.add("drag");
      svg.insertAdjacentHTML("beforeend", `<g class="ghost bad"><rect x="${FX}" y="0" width="${FW}" height="${H}" rx="3"/><text x="${FX + 8}" y="0" dy=".35em"></text></g>`);
      d.ghost = svg.lastElementChild;
      d.onKey = (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        ed._rackDragEnd = Date.now();
        stop();
      };
      window.addEventListener("keydown", d.onKey, true);
      // am Rand der Leiste mitscrollen
      d.timer = setInterval(() => {
        const r = strip.getBoundingClientRect();
        const dir = d.cy < r.top + 24 ? -1 : d.cy > r.bottom - 24 ? 1 : 0;
        if (!dir) return;
        strip.scrollTop += dir * 12;
        show();
      }, 30);
    }
    show();
  });
  strip.addEventListener("pointerup", (ev) => {
    if (d && ev.pointerId === d.pid) finish(true);
  });
  strip.addEventListener("pointercancel", (ev) => {
    if (d && ev.pointerId === d.pid) finish(false);
  });
  strip.addEventListener("lostpointercapture", (ev) => {
    if (d && ev.pointerId === d.pid) finish(false);
  });
}

// ------------------------------------------------------------------ Ereignisse

/** Leiste, Liste und die Knöpfe ▲/▼/Zum Schrank binden (el: Eigenschaftenfeld, cab: der Schrank, focusId: gewähltes Gerät). */
export function bindRackStrip(el, ed, cab, { focusId = null } = {}) {
  const strip = el.querySelector("[data-rack-strip]");
  if (!strip) return;
  const cabId = cab.id;
  ed._rackScroll ??= new Map();
  ed._rackFlash = null; // das Aufleuchten läuft nur einmal

  // Scrollstand merken und zurücksetzen; ein gewähltes Gerät außerhalb des Sichtbereichs mittig einscrollen
  const saved = ed._rackScroll.get(cabId);
  if (saved) strip.scrollTop = saved;
  strip.addEventListener("scroll", () => ed._rackScroll.set(cabId, strip.scrollTop), { passive: true });
  const devs = [...strip.querySelectorAll(".dev")];
  const mine = focusId ? devs.find((e) => e.dataset.techPick === focusId) : null;
  if (mine) {
    const a = mine.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    if (a.height && (a.top < b.top || a.bottom > b.bottom)) strip.scrollTop += (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2;
  }

  const openList = (u) => {
    ed._rackPick = { cab: cabId, u };
    ed.renderProps();
    const list = ed.props?.querySelector?.("[data-rack-list]");
    list?.scrollIntoView?.({ block: "nearest" });
    list?.querySelector("button")?.focus?.({ preventScroll: true });
  };
  const activate = (t) => {
    if (t.matches("[data-rack-free]")) return openList(Number(t.dataset.rackFree));
    selectItem(ed, t.dataset.techPick);
  };
  strip.addEventListener("click", (ev) => {
    const t = ev.target.closest?.("[data-rack-free], .dev");
    if (!t || (t.matches(".dev") && Date.now() - (ed._rackDragEnd ?? 0) < 250)) return;
    activate(t);
  });
  strip.addEventListener("keydown", (ev) => {
    const t = ev.target.closest?.("[data-rack-free], .dev");
    if (!t) return;
    const k = ev.key;
    const swallow = () => {
      ev.preventDefault();
      ev.stopPropagation(); // der Editor schöbe sonst den Schrank bzw. löschte die Auswahl
    };
    if (k === "Enter" || k === " ") {
      swallow();
      activate(t);
    } else if (k.startsWith("Arrow")) {
      swallow();
      const dir = k === "ArrowUp" ? 1 : k === "ArrowDown" ? -1 : 0;
      if (t.matches(".dev") && dir) {
        const id = t.dataset.techPick;
        if (stepDevice(ed, cabId, id, dir)) {
          ed.renderProps();
          focusAgain(ed, (e) => e.dataset?.techPick === id);
        }
      } else if (dir) {
        // freie Zeile: Fokus zur Nachbarzeile (oben = nächste im DOM davor)
        const rows = [...strip.querySelectorAll("[data-rack-free], .dev")];
        rows[rows.indexOf(t) - dir]?.focus?.();
      }
    } else if ((k === "Delete" || k === "Backspace") && t.dataset.techPick !== focusId) {
      swallow();
    }
  });
  bindDrag(strip, ed, cabId);

  // Liste unter der Leiste
  el.querySelectorAll("[data-rack-add]").forEach((b) =>
    b.addEventListener("click", () => {
      const pick = ed._rackPick;
      const c = freshCabinet(ed, cabId);
      const type = b.dataset.rackAdd;
      const at = Number(b.dataset.rackAt);
      const info = c ? cabinetInfo(ed.floor, c) : null;
      if (!info || !pick || !slotFree(info.occ, info.units, at, heOf({ type }))) {
        ed._toast?.(`HE ${pick?.u ?? at} ist nicht mehr frei.`);
        ed.renderProps();
        return;
      }
      const [item] = buildRackItems(ed, c, [{ type, u: at }]);
      ed._rackPick = null;
      ed._rackFlash = item.id;
      ed._toast?.(`${FURNITURE[type]?.[0] ?? type} auf ${span(at, heOf(item))} eingebaut.`);
      ed.renderProps();
    }),
  );
  el.querySelector("[data-rack-cancel]")?.addEventListener("click", () => {
    ed._rackPick = null;
    ed.renderProps();
  });

  // gewähltes Gerät: eine HE hoch/runter, zum Schrank
  const stepBtn = (sel, dir) =>
    el.querySelector(sel)?.addEventListener("click", () => {
      if (!focusId || !stepDevice(ed, cabId, focusId, dir)) return;
      ed.renderProps();
      focusAgain(ed, (e) => e.matches?.(sel) && !e.disabled);
    });
  stepBtn("[data-rack-up]", 1);
  stepBtn("[data-rack-down]", -1);
  el.querySelector("[data-rack-cab]")?.addEventListener("click", () => selectItem(ed, cabId));
}

// ------------------------------------------------------------------ Aussehen

export const RACK_STYLE = `
.ed-props .rackstrip { max-height: min(60vh, 720px); overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; margin: 6px 0 4px; border: 1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius: 8px; background: var(--primary-background-color, #fafafa); }
.ed-props .rackstrip svg { display: block; user-select: none; -webkit-user-select: none; }
.rackstrip svg, .rackstrip .dev, .rackstrip .free { touch-action: pan-y; }
.rackstrip.drag, .rackstrip.drag .dev { cursor: grabbing; }
.rackstrip .rail { fill: rgba(127,127,127,.45); }
.rackstrip .num { font-size: 10px; fill: var(--secondary-text-color, #727272); }
.rackstrip .free { fill: transparent; stroke: rgba(127,127,127,.5); stroke-dasharray: 3 3; cursor: pointer; outline: none; }
.rackstrip .free:hover, .rackstrip .free:focus-visible { fill: rgba(3,169,244,.16); stroke: var(--primary-color, #03a9f4); stroke-dasharray: none; }
.rackstrip .plus { font-size: 16px; fill: var(--primary-color, #03a9f4); opacity: 0; }
.rackstrip .free:hover + .plus, .rackstrip .free:focus-visible + .plus { opacity: 1; }
.rackstrip .gap { font-size: 11px; fill: var(--secondary-text-color, #727272); paint-order: stroke; stroke: var(--primary-background-color, #fafafa); stroke-width: 5px; stroke-linejoin: round; }
.rackstrip .dev { cursor: pointer; outline: none; }
.rackstrip .dev .body { fill: rgba(127,127,127,.22); stroke: rgba(127,127,127,.6); }
.rackstrip .dev:hover .body { fill: rgba(127,127,127,.34); }
.rackstrip .dev.passive .body { fill: rgba(127,127,127,.1); stroke: rgba(127,127,127,.4); }
.rackstrip .dev .hatch { pointer-events: none; }
.rackstrip .dev.sel .body, .rackstrip .dev:focus-visible .body { stroke: var(--primary-color, #03a9f4); stroke-width: 2; }
.rackstrip .dev.new .body { animation: rackflash 1.2s ease-out; }
@keyframes rackflash { 0% { fill: rgba(3,169,244,.75); } 100% { fill: rgba(127,127,127,.22); } }
.rackstrip .nm { font-size: 12px; fill: var(--primary-text-color, #212121); }
.rackstrip .hu { font-size: 11px; fill: var(--secondary-text-color, #727272); }
.rackstrip .led.green { fill: #00c853; }
.rackstrip .led.off { fill: #6b6f73; }
.rackstrip .led.red { fill: #e53935; }
.rackstrip .ghost { pointer-events: none; }
.rackstrip .ghost rect { fill: rgba(0,200,83,.25); stroke: #00c853; stroke-width: 2; }
.rackstrip .ghost.bad rect { fill: rgba(229,57,53,.22); stroke: #e53935; }
.rackstrip .ghost text { font-size: 12px; font-weight: 600; fill: var(--primary-text-color, #212121); }
@media (pointer: coarse) {
  .rackstrip .num { font-size: 11px; }
  .rackstrip .nm { font-size: 13px; }
  .rackstrip .plus { opacity: .55; }
}
.ed-props .racklist { margin: 8px 0; padding: 8px 10px; border: 1px solid var(--primary-color, #03a9f4); border-radius: 10px; }
.ed-props .racklist p { margin: 4px 0; }
.ed-props .racklist .rl-group { margin: 8px 0 2px; font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #727272); }
.ed-props .racklist > button { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; width: 100%; text-align: left; border: none; background: none; color: inherit; font: inherit; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
.ed-props .racklist > button .muted { white-space: nowrap; flex: none; }
.ed-props .racklist > button:hover, .ed-props .racklist > button:focus-visible { background: rgba(127,127,127,.14); outline: none; }
@media (pointer: coarse) { .ed-props .racklist > button { padding: 11px 8px; } }
`;
