// Eigenschaften-Leiste für Gartenflächen (Mixin für FloorEditor; ausgelagert aus renderProps).
// `ui` kommt von propsUi() in props-ui.js.

import { autoHeights } from "./exterior.js";
import { textureField } from "./editor-roof.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const OUTDOOR_TYPES = [
  ["lawn", "Rasen", "#6aa84f"],
  ["terrace", "Terrasse", "#c2b39b"],
  ["path", "Weg", "#bcb4a6"],
  ["driveway", "Einfahrt", "#8c8c8c"],
  ["pool", "Pool", "#2f9fe0"],
  ["bed", "Beet", "#6b4a2f"],
  ["hedge", "Hecke", "#2f6b2a"],
  ["fence", "Zaun", "#8a6f52"],
  ["balcony", "Balkon", "#b5ada3"],
  ["gravel", "Kies", "#c4beb2"],
  ["paving", "Pflaster", "#a39a8e"],
  ["rockery", "Steingarten", "#8a8378"],
  ["kerb", "Randstein", "#b9b9b4"],
];
const RAILINGS = [
  ["", "Standard (Balkon: Glas, sonst keins)"],
  ["none", "kein Geländer"],
  ["glass", "Glas"],
  ["bars", "Stäbe"],
  ["wood", "Holzzaun"],
];

export const OutdoorPropsMethods = {
  _outdoorProps(el, sel, ui) {
    const f = this.floor;
    const { areaOptions, pad, bindPad, bindTextures, bindDelete } = ui;
    const o = (f.outdoor ?? []).find((x) => x.id === sel.id);
    if (!o) return this._clearSel();
    const kerb = o.type === "kerb"; // Randstein baut nur Steine: Textur, Geländer und Hang gelten nicht
    el.innerHTML = `<h3>Gartenfläche</h3>
        <label>Name</label><input data-g="name" value="${esc(o.name ?? "")}">
        <label>Art</label><select data-g="type">${OUTDOOR_TYPES.map(([k, n]) => `<option value="${k}"${k === o.type ? " selected" : ""}>${n}</option>`).join("")}</select>
        ${this._lineAreaFields(o)}
        ${kerb ? "" : textureField("texture", "Textur", o.texture, "g", ["texture_rotation", o.texture_rotation])}
        <label>Bereich (für Gartenlicht, Sensoren)</label><select data-g="area_id">${areaOptions(o.area_id)}</select>
        ${kerb ? "" : `<label>Geländer / Zaun am Rand (nicht an Hauswänden)</label><select data-g="railing">${RAILINGS.map(([k, n]) => `<option value="${k}"${k === (o.railing ?? "") ? " selected" : ""}>${n}</option>`).join("")}</select>
        <label>Geländerhöhe (m)</label><input data-g="railing_height" type="number" step="0.05" min="0.3" max="2.5" value="${o.railing_height ?? ""}" placeholder="1,0">`}
        ${this._kerbFields(o)}
        ${kerb ? "" : `<label>Hang: Höhe je Ecke (m über der Etage ${esc(f.name)})</label>
        ${Array.isArray(o.heights) ? `<div class="row3">${o.points.map((_, i) => `<div><label>Ecke ${i + 1}</label><input type="number" step="0.05" data-h="${i}" value="${Number(o.heights[i]) || 0}"></div>`).join("")}</div>` : `<p class="muted">Eben. „Höhen automatisch“ verbindet die Fläche mit den Gartenflächen anderer Etagen (z. B. Böschung von unten nach oben).</p>`}
        <div class="btns"><button data-act="autoh">Höhen automatisch</button>${Array.isArray(o.heights) ? `<button data-act="flat">Eben machen</button>` : `<button data-act="hmanual">Höhen von Hand</button>`}</div>`}
        ${pad()}
        <div class="btns"><button data-act="del" class="danger">Löschen</button></div>`;
    bindPad();
    this._bindLineArea(el, o);
    this._bindKerbFields(el, o);
    bindTextures((fl, key, v) => {
      const x = fl.outdoor.find((y) => y.id === o.id);
      if (v) x[key] = v;
      else delete x[key];
    });
    el.querySelectorAll("[data-h]").forEach((inp) =>
      inp.addEventListener("change", () => {
        this.change((fl) => {
          const x = fl.outdoor.find((y) => y.id === o.id);
          const hs = [...(x.heights ?? x.points.map(() => 0))];
          hs[Number(inp.dataset.h)] = r3(Number(inp.value) || 0);
          x.heights = hs;
        });
      }),
    );
    el.querySelector("[data-act=autoh]")?.addEventListener("click", () => {
      const hs = autoHeights(this.b, this.floorId, o.id);
      if (!hs) return this._toast("Keine Gartenfläche einer anderen Etage in der Nähe (bis 50 cm). Ecken an die obere Fläche ziehen oder Höhen von Hand eintragen.");
      this.change((fl) => {
        fl.outdoor.find((y) => y.id === o.id).heights = hs;
      });
      this._toast(`Hang gesetzt: ${hs.map((h) => h.toFixed(2)).join(" / ")} m`);
      this.renderProps();
    });
    el.querySelector("[data-act=flat]")?.addEventListener("click", () => {
      this.change((fl) => {
        delete fl.outdoor.find((y) => y.id === o.id).heights;
      });
      this.renderProps();
    });
    el.querySelector("[data-act=hmanual]")?.addEventListener("click", () => {
      this.change((fl) => {
        const x = fl.outdoor.find((y) => y.id === o.id);
        x.heights = x.points.map(() => 0);
      });
      this.renderProps();
    });
    el.querySelectorAll("[data-g]").forEach((inp) =>
      inp.addEventListener("change", () => this.change((fl) => {
        const x = fl.outdoor.find((y) => y.id === o.id);
        let v = inp.value || null;
        if (v !== null && inp.type === "number") v = Number(v);
        if (v === null || Number.isNaN(v)) delete x[inp.dataset.g];
        else x[inp.dataset.g] = v;
      })),
    );
    bindDelete();
  },
};
