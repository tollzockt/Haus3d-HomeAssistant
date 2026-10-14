// 3D-Modelle des Katalogs „Steckdosen & Schalter, Heizungsraum, Server & NAS“ (catalog-tech.js): Einheitsrahmen wie in furniture.js –
// Breite w entlang x, Tiefe d entlang z, Höhe h nach oben, Vorderseite nach +z. Leuchtende Teile kommen in bulbs. Die Modelle stehen
// in Teilmodulen: furniture-tech-wall.js (Steckdosen, Schalter), -heat.js (Heizungsraum), -rack.js (Server, NAS, 19-Zoll-Geräte);
// die Schränke selbst zeichnet cabinet-model.js.

import { buildHeat } from "./furniture-tech-heat.js";
import { buildRackGear } from "./furniture-tech-rack.js";
import { buildWall } from "./furniture-tech-wall.js";

/**
 * Baut einen Typ dieses Katalogs in die Gruppe g; false, wenn der Typ nicht dazugehört.
 * M: Materialien des Stils (furnitureMaterials), item: das Möbelstück (eigene Felder wie in_rack).
 */
export function buildTech(type, w, d, h, M, g, bulbs, item = {}) {
  if (!type.startsWith("tech_")) return false;
  return buildWall(type, w, d, h, M, g, bulbs, item) || buildHeat(type, w, d, h, M, g, bulbs, item) || buildRackGear(type, w, d, h, M, g, bulbs, item);
}
