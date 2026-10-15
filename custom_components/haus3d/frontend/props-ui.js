// Gemeinsame Eingabefelder der Eigenschaften-Leiste (aus FloorEditor.renderProps ausgelagert): Bereichs- und
// Entitätenlisten, Zahl-, Farb- und Textur-Felder samt Bindung, Steuerkreuz, Löschen. `ed` ist der FloorEditor,
// `el` das Eigenschaften-Element; die Zweige für Raum, Öffnung, Möbel und Gartenfläche nutzen sie über `ui`.

import { COLOR_SWATCHES } from "./model.js";
import { bindTexRot } from "./editor-roof.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function propsUi(ed, el) {
  const hass = ed.hass;
  const areas = Object.values(hass.areas ?? {}).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const areaOptions = (current) =>
    `<option value="">– kein Bereich –</option>` + areas.map((a) => `<option value="${esc(a.area_id)}"${a.area_id === current ? " selected" : ""}>${esc(a.name)}</option>`).join("");
  const entityList = (id, domains, filter = () => true) =>
    `<datalist id="${id}">${Object.keys(hass.states)
      .filter((e) => domains.includes(e.split(".")[0]) && filter(hass.states[e]))
      .sort()
      .map((e) => `<option value="${esc(e)}">${esc(hass.states[e].attributes.friendly_name ?? "")}</option>`)
      .join("")}</datalist>`;
  const num = (key, label, value, step = 0.05) => `<div><label>${label}</label><input type="number" step="${step}" data-num="${key}" value="${value ?? ""}"></div>`;
  // Farbfeld: Vorschläge, eigene Farbe, zurück auf Standard
  const colorField = (key, label, value) => {
    const v = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value.toLowerCase() : "";
    return `<label>${label}</label><div class="colorrow"><input type="color" data-color="${key}" value="${v || "#cccccc"}"><button data-color-reset="${key}">Standard</button><span class="muted">${v ? esc(v) : "Standard"}</span></div>
        <div class="swatches">${COLOR_SWATCHES.map((c) => `<button data-swatch="${key}" data-c="${c}" style="background:${c}" class="${c === v ? "sel" : ""}" title="${c}"></button>`).join("")}</div>`;
  };
  const bindColors = (apply) => {
    const set = (key, v) => {
      ed.change((fl) => apply(fl, key, v));
      ed.renderProps();
    };
    el.querySelectorAll("[data-color]").forEach((inp) => inp.addEventListener("change", () => set(inp.dataset.color, inp.value)));
    el.querySelectorAll("[data-color-reset]").forEach((b) => b.addEventListener("click", () => set(b.dataset.colorReset, null)));
    el.querySelectorAll("[data-swatch]").forEach((b) => b.addEventListener("click", () => set(b.dataset.swatch, b.dataset.c)));
  };
  // Steuerkreuz (Tablet): schieben, Schrittweite, drehen
  const pad = (rotate = false) => `<div class="pad">
        <span></span><button data-nudge="0,-1" title="hoch">▲</button><span></span>
        <select data-step title="Schrittweite">${[[0.01, "1 cm"], [0.05, "5 cm"], [0.1, "10 cm"], [0.5, "50 cm"]].map(([v, n]) => `<option value="${v}"${v === ed.nudgeStep ? " selected" : ""}>${n}</option>`).join("")}</select>
        <button data-nudge="-1,0" title="links">◀</button><button data-nudge="0,1" title="runter">▼</button><button data-nudge="1,0" title="rechts">▶</button>
        ${rotate ? `<span class="rot"><button data-rot="-15" title="15° zurück">⟲</button><button data-rot="90" title="90° drehen">⟳</button><button data-act="wall" title="An die nächste Wand stellen"><ha-icon icon="mdi:wall"></ha-icon></button></span>` : ""}
      </div>`;
  const bindPad = () => {
    el.querySelectorAll("[data-nudge]").forEach((b) =>
      b.addEventListener("click", () => {
        const [x, z] = b.dataset.nudge.split(",").map(Number);
        ed.nudge(x * ed.nudgeStep, z * ed.nudgeStep);
      }),
    );
    el.querySelector("[data-step]")?.addEventListener("change", (ev) => (ed.nudgeStep = Number(ev.target.value)));
    el.querySelectorAll("[data-rot]").forEach((b) => b.addEventListener("click", () => ed.rotateSel(Number(b.dataset.rot))));
    el.querySelector("[data-act=wall]")?.addEventListener("click", () => ed.snapSelToWall());
  };
  // Textur-Auswahl neben den Farben (Wert "" = Standard, "none" = glatt); „Textur drehen“ mit 0 = Feld weg
  const bindTextures = (apply) => {
    el.querySelectorAll("[data-tex]").forEach((inp) =>
      inp.addEventListener("change", () => {
        ed.change((fl) => apply(fl, inp.dataset.tex, inp.value || null));
        ed.renderProps();
      }),
    );
    bindTexRot(el, (key, v) => {
      ed.change((fl) => apply(fl, key, v || null));
      ed.renderProps();
    });
  };
  const bindNums = (apply) =>
    el.querySelectorAll("[data-num]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const v = inp.value === "" ? null : Number(inp.value);
        if (v !== null && !Number.isFinite(v)) return;
        ed.change((fl) => apply(fl, inp.dataset.num, v));
        ed.renderProps();
      }),
    );
  const bindDelete = () => el.querySelector("[data-act=del]")?.addEventListener("click", () => ed.deleteSelection());
  return { areaOptions, entityList, num, colorField, bindColors, pad, bindPad, bindTextures, bindNums, bindDelete };
}
