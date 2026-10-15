// Nachfrage und Ortsangabe (Mixin für Haus3DPanel): eigene Nachfrage statt window.confirm, „EG · Flur“ zu einer Entität.

import { areaOf } from "./devices.js";
import { esc } from "./panel-util.js";

export const ConfirmMethods = {
  /** „EG · Flur“: wo eine Entität im Haus liegt (über ihren Bereich oder eine verknüpfte Öffnung). */
  _placeText(entityId) {
    const b = this._building;
    if (!b) return "";
    const area = this._hass ? areaOf(this._hass, entityId) : null; // eigener Bereich oder der des Geräts
    for (const f of b.floors ?? []) {
      for (const r of f.rooms ?? []) if (area && r.area_id === area) return `${f.name} · ${r.name}`;
      for (const o of f.openings ?? []) {
        if (o.contact !== entityId && o.cover !== entityId) continue;
        const r = (f.rooms ?? []).find((x) => x.id === o.room_id);
        return r ? `${f.name} · ${r.name}` : f.name;
      }
    }
    return "";
  },

  /**
   * Eigene Nachfrage (statt window.confirm): großer Abbrechen-Knopf hat den Fokus, Esc oder Tipp
   * daneben bricht ab, nach 15 s automatisch abgebrochen.
   * @returns {Promise<boolean>}
   */
  _confirm(text, okLabel = "OK", { danger = false, sub = "" } = {}) {
    this._confirmEl?._finish?.(false);
    if (this._switching) return Promise.resolve(false); // Haus wird gewechselt: Abläufe des alten Hauses enden hier
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "confirm-backdrop";
      el.innerHTML = `<div class="confirm" role="alertdialog" aria-modal="true" aria-label="${esc(text)}">
        <div class="ct">${esc(text).replace(/\n/g, "<br>")}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ""}
        <div class="cb"><button class="no">Abbrechen</button><button class="yes${danger ? " danger" : ""}">${esc(okLabel)}</button></div></div>`;
      let timer = null;
      const finish = (v) => {
        clearTimeout(timer);
        document.removeEventListener("keydown", onKey, true);
        el.remove();
        if (this._confirmEl === el) this._confirmEl = null;
        resolve(v);
      };
      const onKey = (ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          finish(false);
        }
      };
      el._finish = finish;
      // der Klick, der zum Tipp gehört, kommt erst nach pointerup an: kurz nichts annehmen
      const born = performance.now();
      const ready = () => performance.now() - born > 400;
      el.addEventListener("click", (ev) => {
        if (ev.target === el && ready()) finish(false);
      });
      el.querySelector(".no").addEventListener("click", () => ready() && finish(false));
      el.querySelector(".yes").addEventListener("click", () => ready() && finish(true));
      document.addEventListener("keydown", onKey, true);
      timer = setTimeout(() => finish(false), 15000);
      (this._els?.stage ?? this.shadowRoot).appendChild(el);
      this._confirmEl = el;
      el.querySelector(".no").focus();
    });
  },
};
