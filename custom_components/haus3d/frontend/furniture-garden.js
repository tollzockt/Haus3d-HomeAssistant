// 3D-Modelle des Katalogs „Garten, Garage, Hydroponik“ (catalog-garden.js): Einheitsrahmen wie in furniture.js – Breite w entlang x,
// Tiefe d entlang z, Höhe h nach oben, Vorderseite nach +z. Leuchtende Teile kommen in bulbs. Je Kategorie ein eigenes Modul;
// der Whirlpool (hot_tub und garden_hot_tub_acryl) steht in furniture-tub.js.

import { buildBeds } from "./furniture-beds.js";
import { buildGarage } from "./furniture-garage.js";
import { buildHydro } from "./furniture-hydro.js";
import { buildPlay } from "./furniture-play.js";
import { buildSeating } from "./furniture-seating.js";
import { buildTub } from "./furniture-tub.js";
import { buildYard } from "./furniture-yard.js";

const BUILDERS = [buildSeating, buildBeds, buildPlay, buildYard, buildGarage, buildHydro];

/**
 * Baut einen Typ dieses Katalogs in die Gruppe g; false, wenn der Typ nicht dazugehört.
 * M: Materialien des Stils (furnitureMaterials), item: das Möbelstück (eigene Felder wie open).
 */
export function buildGarden(type, w, d, h, M, g, bulbs, item = {}) {
  if (type === "hot_tub" || type === "garden_hot_tub_acryl") return buildTub(type, w, d, h, M, g, bulbs, item);
  if (!type.startsWith("garden_")) return false;
  return BUILDERS.some((build) => build(type, w, d, h, M, g, bulbs, item));
}
