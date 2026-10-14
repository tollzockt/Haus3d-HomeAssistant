// Zusatzfelder der weiteren Kataloge und eigener 3D-Modelle in den Möbel-Eigenschaften (Mixin für FloorEditor).

import { GARDEN_FIELDS } from "./fields-garden.js";
import { HOME_FIELDS } from "./fields-home.js";
import { MODEL_FIELDS } from "./fields-model.js";
import { TECH_FIELDS } from "./fields-tech.js";

const PROVIDERS = [HOME_FIELDS, GARDEN_FIELDS, TECH_FIELDS, MODEL_FIELDS];

export const MoreFieldMethods = {
  /** HTML aller Zusatzfelder für das Möbelstück m. */
  _moreFields(m) {
    return PROVIDERS.map((p) => p.html(m, this) || "").join("");
  },

  _bindMoreFields(el, m) {
    // nichts zurückgeben: change() nähme einen Rückgabewert als neue Etage
    const edit = (fn) =>
      this.change((fl) => {
        fn(fl.furniture.find((y) => y.id === m.id));
      });
    for (const p of PROVIDERS) p.bind(el, m, this, edit);
  },
};
