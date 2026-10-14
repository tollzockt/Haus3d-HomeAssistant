// Katalog „Einrichten“ im Editor (Mixin für FloorEditor): Gruppen Drinnen/Draußen mit aufklappbaren
// Kategorien, Suche über alles, Vorschaubilder. Welche Gruppen und Kategorien offen sind, merkt sich
// jeder Browser für sich.

import { FURNITURE, FURNITURE_CATEGORIES, FURNITURE_GROUPS } from "./furniture.js";
import { furnitureThumb, renderThumbs } from "./thumbs.js";
import { MODEL_GROUP, MODEL_STYLE, ModelCatalogMethods } from "./editor-models.js";

const KEY = "haus3d.catalogOpen";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TYPES = new Map(FURNITURE_CATEGORIES);

function loadOpen() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (o && typeof o === "object") return { g: { ...(o.g ?? {}) }, c: { ...(o.c ?? {}) } };
  } catch {
    /* ohne Speicher: Standard */
  }
  return { g: {}, c: {} };
}

function saveOpen(o) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* ohne Speicher: nur für diese Sitzung */
  }
}

/** Kategorie eines Typs. */
export const catalogCategory = (type) => FURNITURE_CATEGORIES.find(([, ts]) => ts.includes(type))?.[0] ?? null;

export const CatalogMethods = {
  /** Eigenschaften-Feld beim Werkzeug „Einrichten“. */
  _furnToolProps(el) {
    el.innerHTML = `<h3>Einrichten</h3><p class="muted">Etwas wählen, dann in den Plan tippen.</p><p class="muted brandnote">Produkt- und Herstellernamen nur zur Angabe der Maße bzw. zur Bezeichnung des Geräts – keine Verbindung zu den Herstellern; eigene, vereinfachte Modelle.</p>
      <input class="search" type="search" placeholder="Suchen …" value="${esc(this.furnSearch)}"><div class="catalog"></div>`;
    const cats = el.querySelector(".catalog");
    const style = this.sceneStyle === "cyber" ? "cyber" : "standard";
    this._modelsInit(); // eigene 3D-Modelle: Liste holen
    const open = loadOpen();
    const cur = catalogCategory(this.furnType);
    const isOpenG = (g) => open.g[g] ?? (g === "Drinnen" || g === MODEL_GROUP || FURNITURE_GROUPS.find(([x]) => x === g)?.[1].includes(cur));
    const isOpenC = (c) => open.c[c] ?? c === cur;
    const tile = (t) => {
      const img = furnitureThumb(t, style);
      return `<button class="tile${t === this.furnType ? " sel" : ""}" data-furn="${t}" title="${esc(FURNITURE[t][0])}">${img ? `<img alt="" src="${img}">` : `<span class="ph" data-thumb="${t}"></span>`}<span>${esc(FURNITURE[t][0])}</span></button>`;
    };
    const head = (cls, key, name, n, isOpen) => `<button class="${cls}" data-${cls}="${esc(key)}" aria-expanded="${isOpen}"><ha-icon icon="${isOpen ? "mdi:chevron-down" : "mdi:chevron-right"}"></ha-icon><span>${esc(name)}</span><small>${n}</small></button>`;
    const draw = () => {
      const q = this.furnSearch.trim().toLowerCase();
      if (q) {
        // Suche: alle Treffer aufgeklappt, Gruppen und Merkzustand bleiben unberührt
        cats.innerHTML = this._modelFound(q, style) + FURNITURE_CATEGORIES.map(([cat, types]) => {
          const list = types.filter((t) => FURNITURE[t][0].toLowerCase().includes(q) || cat.toLowerCase().includes(q));
          return list.length ? `<div class="cat found">${esc(cat)}</div><div class="tiles">${list.map(tile).join("")}</div>` : "";
        }).join("") || `<p class="muted">Nichts gefunden.</p>`;
        this._modelThumbs(cats, style);
        return;
      }
      cats.innerHTML = this._modelSection(isOpenG(MODEL_GROUP), head, style) + FURNITURE_GROUPS.map(([g, cs]) => {
        const go = isOpenG(g);
        const count = cs.reduce((n, c) => n + (TYPES.get(c)?.length ?? 0), 0);
        return `${head("grp", g, g, count, go)}${go ? `<div class="grpbody">${cs.map((c) => {
          const types = TYPES.get(c) ?? [];
          const co = isOpenC(c);
          return `${head("cat", c, c, types.length, co)}${co ? `<div class="tiles">${types.map(tile).join("")}</div>` : ""}`;
        }).join("")}</div>` : ""}`;
      }).join("");
      this._modelThumbs(cats, style);
    };
    draw();
    this._modelsWatch(cats, draw);
    el.querySelector(".search").addEventListener("input", (ev) => {
      this.furnSearch = ev.target.value;
      draw();
    });
    cats.addEventListener("click", (ev) => {
      if (this._modelClick(ev, cats)) return;
      const g = ev.target.closest("[data-grp]");
      const c = ev.target.closest("[data-cat]");
      if (g || c) {
        if (g) open.g[g.dataset.grp] = !isOpenG(g.dataset.grp);
        else open.c[c.dataset.cat] = !isOpenC(c.dataset.cat);
        saveOpen(open);
        draw();
        return;
      }
      const b = ev.target.closest("[data-furn]");
      if (!b) return;
      this.furnType = b.dataset.furn;
      this.furnModel = null;
      cats.querySelectorAll(".tile").forEach((t) => t.classList.toggle("sel", t === b));
    });
    // Vorschaubilder nach und nach einsetzen (auch in später aufgeklappten Kategorien)
    renderThumbs((type, url) => {
      const ph = cats.querySelector(`[data-thumb="${type}"]`);
      if (ph) ph.outerHTML = `<img alt="" src="${url}">`;
    }, style);
  },
  ...ModelCatalogMethods,
};

export const CATALOG_STYLE = `
.ed-props .catalog .grp, .ed-props .catalog .cat { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left; border-radius: 8px; }
.ed-props .catalog .grp { margin: 10px 0 2px; padding: 8px 6px; min-height: 40px; font-size: 15px; font-weight: 600; background: rgba(127,127,127,.08); }
.ed-props .catalog .grp small, .ed-props .catalog .cat small { margin-left: auto; color: var(--secondary-text-color); font-weight: 400; font-size: 12px; }
.ed-props .catalog .grpbody { padding-left: 6px; }
.ed-props .catalog .cat { margin: 2px 0; padding: 6px; min-height: 36px; }
.ed-props .catalog .grp:hover, .ed-props .catalog .cat:hover { background: rgba(127,127,127,.14); }
.ed-props .catalog ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
.ed-props .cat { font-size: 12px; font-weight: 600; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .04em; }
.ed-props .cat.found { display: block; border: 0; padding: 0; min-height: 0; margin: 12px 0 4px; }
.ed-props .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; margin: 4px 0 8px; }
.ed-props .tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 2px 6px; border: 1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius: 10px; background: none; color: inherit; font: inherit; font-size: 11px; line-height: 1.15; cursor: pointer; text-align: center; min-height: 92px; }
.ed-props .tile img, .ed-props .tile .ph { width: 64px; height: 64px; object-fit: contain; }
.ed-props .tile .ph { border-radius: 8px; background: rgba(127,127,127,.12); }
.ed-props .tile.sel { border-color: var(--primary-color, #03a9f4); background: rgba(3,169,244,.12); }
${MODEL_STYLE}`;
