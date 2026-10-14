// Dachgeschoss im Editor (Mixin für FloorEditor): Das Dachgeschoss ist eine normale Etage mit Räumen;
// ist in den Einstellungen ein Hausdach an, sitzt es auf dem Kniestock darüber und die Etagen-Auswahl bietet
// zusätzlich „Hausdach“ (Kamin, Dachfenster, PV). Ohne Hausdach legt „Dachgeschoss“ die Etage an. Die
// Dach-Ebene je Etage öffnet der Knopf „Dach“; Fenster und Türen unter der Schräge bekommen einen Hinweis.

import { allIds, newId } from "./edit-ops.js";
import { DEFAULT_KNEE, atticKnee, roofSettings } from "./exterior.js";
import { atticOpeningLimit } from "./gable.js";
import { atticModels } from "./roofunits.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Ist in den Einstellungen ein Hausdach an? */
export const roofOn = (building) => roofSettings(building?.settings).type !== "none";

/** Neue Dachgeschoss-Etage über der obersten. */
export function newAttic(building) {
  const top = [...(building.floors ?? [])].sort((a, b) => b.elevation - a.elevation)[0];
  return {
    id: newId("dg", allIds(building)),
    name: "Dachgeschoss",
    elevation: top ? r3(top.elevation + top.height + 0.25) : 0,
    height: 2.4,
    cut_height: 1.15,
    attic: true,
    knee: DEFAULT_KNEE,
    rooms: [],
    openings: [],
    furniture: [],
    placements: [],
    background: null,
    outdoor: [],
    walls: [],
    pipes: [],
    nodes: [],
    ha_floor: null,
  };
}

export const AtticMethods = {
  /**
   * Zusatz-Einträge der Etagen-Auswahl: in der Dach-Ebene der Platzhalter „Dach · Etage“ (gewählt), „Hausdach“
   * (nur mit Hausdach) bzw. „+ Dachgeschoss“ (wenn keins da ist).
   */
  _atticOptions() {
    const hasAttic = (this.b.floors ?? []).some((f) => f.attic);
    const here = this.roofMode ? `<option value="" selected disabled>Dach · ${esc(this.floor?.name ?? "")}</option>` : "";
    return `${here}${roofOn(this.b) ? `<option value="__roof">Hausdach</option>` : ""}${hasAttic ? "" : `<option value="__attic">+ Dachgeschoss</option>`}`;
  },

  /** Dachgeschoss anlegen und dorthin wechseln. */
  _addAttic() {
    const floor = newAttic(this.b);
    this.changeBuilding((b) => {
      b.floors.push(floor);
      this.floorId = floor.id;
    }, { fit: true });
    this._toast(roofOn(this.b) ? "Dachgeschoss angelegt: Räume zeichnen – das Dach sitzt darauf (Kniestock in den Etagen-Eigenschaften)." : "Dachgeschoss angelegt: Räume wie auf jeder Etage zeichnen. Mit Dach in den Einstellungen sitzt es darauf.");
  },

  /** Felder in den Etagen-Eigenschaften (Dach dieser Etage, Dachgeschoss, Kniestock). */
  _atticFields(f) {
    const roofed = f.attic && atticModels(this.b, { floorId: f.id }).has(f.id);
    return `${this._floorRoofRow?.(f) ?? ""}<label class="chk"><input type="checkbox" data-attic${f.attic ? " checked" : ""}> Dachgeschoss (Räume unter den Dachschrägen)</label>
      ${f.attic ? `<div class="row2"><div><label>Kniestock (m)</label><input type="number" step="0.05" min="0" max="${esc(f.height ?? 2.5)}" data-knee value="${atticKnee(f)}"></div><div></div></div>
      <p class="muted">${roofed ? "Das Dach setzt auf dem Kniestock an; Innenwände enden unter der Schräge." : "Noch kein Dach über dieser Etage – über „Dach“ eines setzen (Hausdach oder eigenes Dach eines Raums)."}</p>` : ""}`;
  },

  /** Hinweis an einem Fenster bzw. einer Tür im Dachgeschoss, das bzw. die in 3D gekürzt oder ausgeblendet wird. */
  _atticOpeningHint(o) {
    const lim = atticOpeningLimit(this.b, this.floor, o?.id);
    if (!lim || (Number(o.sill) || 0) + (Number(o.height) || 0) <= lim.top + 0.005) return "";
    const m = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
    const full = lim.top >= lim.height - 0.005; // reicht bis zur Raumhöhe (keine Schräge davor)
    let t;
    if (lim.hidden) t = lim.gable || full ? `Liegt über der Raumhöhe (${m(lim.height)} m) und wird in 3D nicht gezeigt.` : `Liegt über der Dachschräge (Kniestock ${m(lim.knee)} m) und wird in 3D nicht gezeigt – für Licht von oben auf der Dach-Ebene ein Dachfenster oder eine Gaube setzen.`;
    else if (lim.gable) t = `Giebelwand: in 3D bis ${m(lim.top)} m hoch (Raumhöhe bzw. Dachschräge).`;
    else if (full) t = `In 3D nur bis zur Raumhöhe (${m(lim.top)} m).`;
    else if (lim.exterior) t = `Außenwand unter der Dachschräge: Sie endet am Kniestock, in 3D nur bis ${m(lim.top)} m hoch. Höhere Fenster und Türen passen nur in eine Giebelwand des Hausdachs.`;
    else t = `Unter der Dachschräge: in 3D nur bis ${m(lim.top)} m hoch.`;
    return `<p class="muted">${t}</p>`;
  },

  _bindAtticFields(el) {
    el.querySelector("[data-act=roofhere]")?.addEventListener("click", () => this._toggleRoofMode?.(true));
    el.querySelector("[data-attic]")?.addEventListener("change", (ev) => {
      this.change((fl) => {
        fl.attic = ev.target.checked;
        if (fl.attic && fl.knee == null) fl.knee = DEFAULT_KNEE;
      });
      this.renderProps();
    });
    el.querySelector("[data-knee]")?.addEventListener("change", (ev) => {
      const v = Number(ev.target.value);
      if (!Number.isFinite(v)) return;
      this.change((fl) => {
        fl.knee = r3(Math.max(0, Math.min(fl.height ?? 2.5, v)));
      });
      this.renderProps();
    });
  },
};
