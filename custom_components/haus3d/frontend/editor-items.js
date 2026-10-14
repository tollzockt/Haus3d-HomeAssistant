// Zusatzfelder im Editor (Mixin für FloorEditor): Raster einstellbarer Möbel (Würfelregal, Solar-Aufständerung),
// Info-Hologramm an Möbeln und Geräten, Lichtschacht an Kellerfenstern.

import { cubeGrid, cubeSize, isCubeShelf, pvGrid, pvModules, pvSize } from "./catalog-extra.js";
import { DEFAULT_WP } from "./exterior.js";
import { FURNITURE } from "./furniture.js";

export const MAX_INFO = 6;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const intIn = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));
const field = (key, label, value, max) => `<div><label>${label}</label><input type="number" min="1" max="${max}" step="1" inputmode="numeric" data-grid="${key}" value="${value}"></div>`;

/** Raster eines Möbelstücks: {kind, cols, rows, maxCols, maxRows, rowLabel, …} oder null (PV: auch Lage, Modulzahl, Tipp). */
export function itemGrid(m) {
  if (isCubeShelf(m.type)) {
    const [cols, rows] = cubeGrid(m);
    return { kind: "cube", cols, rows, maxCols: 8, maxRows: 8, colLabel: "Würfel breit", rowLabel: "Würfel hoch" };
  }
  const g = pvGrid(m.type, m);
  if (!g) return null;
  const def = FURNITURE[m.type] ?? [];
  const { across, rows } = pvModules(m.type, m.w || def[1], m.d || def[2], m, m.h || def[3]);
  return { kind: "pv", cols: across, rows: g.pairs ? rows / 2 : rows, maxCols: 20, maxRows: g.pd ? g.maxRows ?? 20 : 1, colLabel: "Module breit", rowLabel: g.rowLabel ?? null, axis: g.axis ?? "d", upright: g.axis === "h" && g.pw < g.pd, orientable: !!g.portrait, portrait: !!g.portrait && m.orient === "portrait", count: across * rows, tip: g.tip ?? null };
}

/** Neue Maße für ein Raster (setzt cols/rows und Breite/Tiefe/Höhe). */
export function applyGrid(m, cols, rows) {
  const g = itemGrid(m);
  if (!g) return m;
  const c = intIn(cols, 1, g.maxCols);
  const r = intIn(rows, 1, g.maxRows);
  if (g.kind === "cube") return Object.assign(m, { cols: c, rows: r, w: cubeSize(c), h: cubeSize(r) });
  return Object.assign(m, { cols: c, rows: r }, pvSize(m.type, c, r, m));
}

/** Modullage quer/hochkant (Solarzaun): Anzahl bleibt, Maße drehen mit. */
export function orientGrid(m, orient) {
  const g = itemGrid(m);
  if (g?.kind !== "pv" || !g.orientable) return m;
  if (orient === "portrait") m.orient = "portrait";
  else delete m.orient;
  return applyGrid(m, g.cols, g.rows);
}

const de2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Hinweis unter dem Raster: Modulmaß, was der Anzahl folgt, Modulzahl und kWp, Tipp des Typs. */
export function pvNote(g) {
  const follow = !g.rowLabel ? "die Breite folgt" : g.axis === "h" ? "Breite und Höhe folgen" : "Breite und Tiefe folgen";
  return `${g.upright ? "Modul hochkant ca. 1,13 × 1,72 m" : "Modul ca. 1,72 × 1,13 m"} – ${follow} der Anzahl. ${g.count} Module × ${DEFAULT_WP} Wp = ${de2((g.count * DEFAULT_WP) / 1000)} kWp.${g.tip ? ` ${g.tip}` : ""}`;
}

export const ItemMethods = {
  /** Felder für Raster und Info-Hologramm in den Möbel-Eigenschaften. */
  _itemFields(m) {
    const g = itemGrid(m);
    const grid = g
      ? `<div class="row2">${field("cols", g.colLabel, g.cols, g.maxCols)}${g.rowLabel ? field("rows", g.rowLabel, g.rows, g.maxRows) : "<div></div>"}</div>
        ${g.orientable ? `<label>Module</label><select data-grid-orient><option value="landscape"${g.portrait ? "" : " selected"}>quer (1,72 × 1,13 m)</option><option value="portrait"${g.portrait ? " selected" : ""}>hochkant (1,13 × 1,72 m)</option></select>` : ""}<p class="muted gridnote">${g.kind === "pv" ? pvNote(g) : "Ein Fach ca. 33 × 33 cm – Breite und Höhe folgen der Anzahl."}</p>`
      : "";
    const rows = Array.isArray(m.info) ? m.info : [];
    const blank = this._infoBlank === m.id && rows.length < MAX_INFO;
    const ids = Object.keys(this.hass?.states ?? {}).sort();
    return `${grid}
      <label>Info-Hologramm</label>
      <p class="muted">Bis zu ${MAX_INFO} Werte schweben über dem Gegenstand, wenn sein Raum angetippt ist – z. B. PC, Server, Heizung, Energie, 3D-Drucker.</p>
      <div class="holorows">${[...rows, ...(blank ? [{ entity: "", name: null }] : [])].map((r, i) => `<div class="holorow"><input data-info-e="${i}" list="dl_info" value="${esc(r.entity)}" placeholder="Entität (sensor.…)"><input data-info-n="${i}" value="${esc(r.name ?? "")}" placeholder="Name (optional)" maxlength="40"><button class="icon" data-info-x="${i}" title="Wert entfernen"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("")}</div>
      <div class="btns left"><button data-info-add${rows.length >= MAX_INFO || blank ? " disabled" : ""}>+ Wert</button></div>
      <datalist id="dl_info">${ids.map((id) => `<option value="${esc(id)}">${esc(this.hass.states[id]?.attributes?.friendly_name ?? "")}</option>`).join("")}</datalist>`;
  },

  _bindItemFields(el, m) {
    // nichts zurückgeben: change() nähme einen Rückgabewert als neue Etage
    const edit = (fn) => this.change((fl) => {
      fn(fl.furniture.find((y) => y.id === m.id));
    });
    el.querySelectorAll("[data-grid]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const g = itemGrid(m);
        edit((x) => applyGrid(x, inp.dataset.grid === "cols" ? inp.value : g.cols, inp.dataset.grid === "rows" ? inp.value : g.rows));
        this.renderProps();
      }),
    );
    el.querySelector("[data-grid-orient]")?.addEventListener("change", (ev) => {
      edit((x) => {
        orientGrid(x, ev.target.value);
      });
      this.renderProps();
    });
    const setInfo = (fn) => {
      edit((x) => {
        const list = (Array.isArray(x.info) ? x.info : []).map((r) => ({ ...r }));
        fn(list);
        const clean = list.filter((r) => typeof r.entity === "string" && r.entity.includes(".")).slice(0, MAX_INFO);
        if (clean.length) x.info = clean;
        else delete x.info;
      });
      this.renderProps();
    };
    el.querySelectorAll("[data-info-e]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const i = Number(inp.dataset.infoE);
        const v = inp.value.trim();
        if (i >= (m.info?.length ?? 0)) this._infoBlank = null; // neue Zeile übernommen
        setInfo((list) => {
          if (!v) list.splice(i, 1);
          else if (list[i]) list[i].entity = v;
          else list.push({ entity: v, name: null });
        });
      }),
    );
    el.querySelectorAll("[data-info-n]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const i = Number(inp.dataset.infoN);
        if (i >= (m.info?.length ?? 0)) return; // erst die Entität
        setInfo((list) => (list[i].name = inp.value.trim().slice(0, 40) || null));
      }),
    );
    el.querySelectorAll("[data-info-x]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.infoX);
        if (i >= (m.info?.length ?? 0)) {
          this._infoBlank = null;
          return this.renderProps();
        }
        setInfo((list) => list.splice(i, 1));
      }),
    );
    el.querySelector("[data-info-add]")?.addEventListener("click", () => {
      this._infoBlank = m.id;
      this.renderProps();
      this.props.querySelector(`[data-info-e="${m.info?.length ?? 0}"]`)?.focus();
    });
  },

  /** Lichtschacht-Felder bei Fenstern. */
  _wellFields(o) {
    if (o.type !== "window") return "";
    const w = o.well;
    return `<label class="chk"><input type="checkbox" data-well${w ? " checked" : ""}> Lichtschacht außen (Kellerfenster)</label>
      ${w ? `<div class="row2"><div><label>Tiefe (m)</label><input type="number" step="0.05" min="0.1" max="2" inputmode="decimal" data-wellk="depth" value="${w.depth ?? 0.4}"></div><div><label>Breite (m)</label><input type="number" step="0.05" min="0.2" max="6" inputmode="decimal" data-wellk="width" value="${w.width ?? ""}" placeholder="Fenster + 20 cm"></div></div>
      <p class="muted">Betonschacht mit Gitterrost auf Geländehöhe – sichtbar an Außenwänden, wenn das Fenster unter dem Gelände liegt.</p>` : ""}`;
  },

  _bindWellFields(el, o) {
    const edit = (fn) => {
      this.change((fl) => {
        fn(fl.openings.find((y) => y.id === o.id));
      });
      this.renderProps();
    };
    el.querySelector("[data-well]")?.addEventListener("change", (ev) =>
      edit((x) => {
        if (ev.target.checked) x.well = { depth: 0.4, width: null };
        else delete x.well;
      }),
    );
    el.querySelectorAll("[data-wellk]").forEach((inp) =>
      inp.addEventListener("change", () =>
        edit((x) => {
          const v = inp.value === "" ? null : Number(String(inp.value).replace(",", "."));
          const k = inp.dataset.wellk;
          const ok = v === null ? k === "width" : Number.isFinite(v) && (k === "depth" ? v >= 0.1 && v <= 2 : v >= 0.2 && v <= 6);
          if (ok) x.well = { ...(x.well ?? { depth: 0.4, width: null }), [k]: v === null ? null : Math.round(v * 100) / 100 };
        }),
      ),
    );
  },
};

export const ITEMS_STYLE = `
.ed-props .holorows { display: flex; flex-direction: column; gap: 6px; margin: 4px 0; }
.ed-props .holorow { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 6px; align-items: center; }
.ed-props .holorow input { min-width: 0; }
.ed-props .btns.left { justify-content: flex-start; }
`;
