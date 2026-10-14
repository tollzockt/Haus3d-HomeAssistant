// Mitziehen nach jeder Änderung im Editor (ohne DOM, mit node testbar): Was an einem Möbelstück hängt –
// eingebaute Geräte im Server- oder Netzwerkschrank, Leitungsenden an Geräten –, folgt ihm beim Verschieben
// und Drehen. Eine Stelle für alle Wege (Ziehen, Pfeiltasten, Steuerkreuz, Felder, 3D-Pfeile).

import { followPipes } from "./follow-pipes.js";
import { followRack } from "./follow-rack.js";

/** before = Etage vor der Änderung (unverändert), after = Etage danach (wird angepasst und zurückgegeben). */
export function followMoves(before, after) {
  if (!before || !after) return after;
  followRack(before, after);
  followPipes(before, after);
  return after;
}
