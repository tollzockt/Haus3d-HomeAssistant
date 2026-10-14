// Weitere Kataloge (ohne Three.js, mit node testbar): Wohnen/Küche/Kamin/Vorhänge, Garten/Garage/Hydroponik
// und Technik (Steckdosen, Heizungsraum, Server) – zusammengeführt für furniture.js und edit-ops.js.

import { GARDEN_PACK } from "./catalog-garden.js";
import { HOME_PACK } from "./catalog-home.js";
import { TECH_PACK } from "./catalog-tech.js";

const PACKS = [HOME_PACK, GARDEN_PACK, TECH_PACK];

/** Typ → [Name, w, d, h] */
export const MORE = Object.assign({}, ...PACKS.map((p) => p.items));
/** [Kategorie, [Typen]] */
export const MORE_CATEGORIES = PACKS.flatMap((p) => p.categories);
/** Typ → "ceiling" oder Standardhöhe über dem Boden (m) */
export const MORE_MOUNT = Object.assign({}, ...PACKS.map((p) => p.mount));
/** Typen, die nicht an Wänden einrasten */
export const MORE_FREE = PACKS.flatMap((p) => p.free);
/** Kategorien unter „Draußen“ */
export const MORE_OUTDOOR = PACKS.flatMap((p) => p.outdoor);
