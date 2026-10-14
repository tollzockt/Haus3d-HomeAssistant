// Zusatzfelder in den Möbel-Eigenschaften für den Katalog „Wohnen, Küche, Kamin, Vorhänge“ (eingebunden über editor-more.js):
// „Feuer an“ bei Kamin und Ofen, „Geöffnet (%)“ bei Vorhängen, Raffrollo und Plissee.
// Attribute im HTML mit eigenem Präfix data-home-…, damit sie sich nicht mit anderen Feldern überschneiden.

import { HOME_FIRE_TYPES, HOME_OPEN_TYPES } from "./catalog-home.js";

const FIRE = new Set(HOME_FIRE_TYPES);
const OPEN = new Set(HOME_OPEN_TYPES);

/** Öffnung in Prozent aus dem Feld (fehlt oder ungültig: 100 = ganz offen). */
export function openPercent(m) {
  const n = m?.open === undefined || m?.open === null || m?.open === "" ? NaN : Number(m.open);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 100;
}

export const HOME_FIELDS = {
  /** HTML für das gewählte Möbelstück m ("" = nichts Eigenes); ed ist der Editor (hass, floor …). */
  html(m, ed) {
    if (FIRE.has(m.type)) {
      return `<label class="chk"><input type="checkbox" data-home-fire${m.fire ? " checked" : ""}> Feuer an</label>
        <p class="muted">Ist eine Entität verknüpft, hat deren Zustand Vorrang: Das Feuer brennt bei „on“, „heat“ oder „heating“ und geht bei „off“ aus.</p>`;
    }
    if (OPEN.has(m.type)) {
      return `<div><label>Geöffnet (%)</label><input type="number" min="0" max="100" step="5" inputmode="numeric" data-home-open value="${openPercent(m)}"></div>
        <p class="muted">0 = ganz zu, 100 = ganz offen (Raffrollo und Plissee hochgezogen). Folgt einer verknüpften Rollladen-/cover-Entität; bei einem Schalter bedeutet „an“ geschlossen.</p>`;
    }
    return "";
  },
  /** Ereignisse binden; edit(fn) ändert das Möbelstück der Etage (fn bekommt es als Argument). */
  bind(el, m, ed, edit) {
    el.querySelector("[data-home-fire]")?.addEventListener("change", (ev) => {
      const on = ev.target.checked;
      edit((x) => {
        if (on) x.fire = true;
        else delete x.fire;
      });
    });
    el.querySelector("[data-home-open]")?.addEventListener("change", (ev) => {
      const raw = ev.target.value.trim();
      edit((x) => {
        if (raw === "") delete x.open;
        else x.open = openPercent({ open: raw });
      });
      ed.renderProps(); // zeigt den auf 0–100 begrenzten Wert
    });
  },
};
