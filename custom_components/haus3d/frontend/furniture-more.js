// 3D-Modelle der weiteren Kataloge (catalog-more.js): je Katalog ein eigenes Modul.

import { buildGarden } from "./furniture-garden.js";
import { buildHome } from "./furniture-home.js";
import { buildTech } from "./furniture-tech.js";

/** Baut einen Typ der weiteren Kataloge; false, wenn der Typ nicht dazugehört. */
export function buildMore(type, w, d, h, M, g, bulbs, item = {}) {
  return buildHome(type, w, d, h, M, g, bulbs, item) || buildGarden(type, w, d, h, M, g, bulbs, item) || buildTech(type, w, d, h, M, g, bulbs, item);
}
