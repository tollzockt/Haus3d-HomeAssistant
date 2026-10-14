// Zusatzfelder in den Möbel-Eigenschaften für den Katalog „Garten, Garage, Hydroponik“ (eingebunden über editor-more.js).
// Attribute im HTML mit eigenem Präfix data-garden-…, damit sie sich nicht mit anderen Feldern überschneiden.

/** Whirlpools mit Abdeckung: der aufblasbare und der eckige aus Acryl. */
export const TUB_TYPES = ["hot_tub", "garden_hot_tub_acryl"];

export const GARDEN_FIELDS = {
  /** HTML für das gewählte Möbelstück m ("" = nichts Eigenes); ed ist der Editor (hass, floor …). */
  html(m, ed) {
    if (!TUB_TYPES.includes(m.type)) return "";
    return `<label>Abdeckung</label><select data-garden-open>
        <option value="0"${m.open ? "" : " selected"}>abgedeckt</option>
        <option value="1"${m.open ? " selected" : ""}>offen</option></select>
      <p class="muted">Mit verknüpfter Entität (unten): Eine Abdeckung (cover) öffnet und schließt die Darstellung; Schalter, Heizung oder Klima „an“ lässt das Wasser sprudeln. Ohne Entität gilt die Auswahl.</p>`;
  },
  /** Ereignisse binden; edit(fn) ändert das Möbelstück der Etage (fn bekommt es als Argument). */
  bind(el, m, ed, edit) {
    el.querySelector("[data-garden-open]")?.addEventListener("change", (ev) =>
      edit((x) => {
        if (ev.target.value === "1") x.open = true;
        else delete x.open;
      }),
    );
  },
};
