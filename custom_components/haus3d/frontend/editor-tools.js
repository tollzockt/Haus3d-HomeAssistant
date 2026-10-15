// Werkzeugleiste und Hinweiszeilen des 2D-Editors (Etagenplan). Dach, Leitungen und Verteiler liefern ihre
// Texte selbst (ROOF_TOOLS/ROOF_HINTS, PIPE_HINT, NODE_HINT); hier stehen die Werkzeuge des Hausplans.

import { PIPE_HINT } from "./editor-pipes.js";
import { NODE_HINT } from "./editor-nodes.js";

export const TOOLS = [
  ["select", "mdi:cursor-default-outline", "Auswählen"],
  ["rect", "mdi:vector-square", "Raum (Rechteck)"],
  ["poly", "mdi:vector-polygon", "Raum (frei)"],
  ["wall", "mdi:wall", "Wand"],
  ["window", "mdi:window-closed-variant", "Fenster"],
  ["door", "mdi:door", "Tür"],
  ["garage", "mdi:garage", "Garagentor"],
  ["furniture", "mdi:sofa-outline", "Einrichten"],
  ["device", "mdi:lightbulb-on-outline", "Gerät"],
  ["outdoor", "mdi:tree-outline", "Garten"],
  ["line", "mdi:vector-polyline", "Linie"],
  ["pipe", "mdi:pipe", "Leitung"],
  ["node", "mdi:fuse", "Verteiler"],
  ["measure", "mdi:tape-measure", "Messen"],
  ["bgmove", "mdi:image-outline", "Vorlage"],
];
export const HINTS = {
  select: "Antippen wählt aus, Ziehen verschiebt. Pfeiltasten schieben, R dreht; leere Fläche ziehen verschiebt die Ansicht. Mehr unter „?“.",
  rect: "Ziehen: Rechteck-Raum von Ecke zu Ecke.",
  poly: "Punkte antippen, zum Schließen den ersten Punkt erneut antippen (oder Doppelklick). Esc bricht ab.",
  wall: "Anfang und Ende antippen: Wand (rastet an Ecken und Raumkanten ein, Umschalt = frei). Weiter tippen setzt an, Esc beendet.",
  window: "Auf eine Wand tippen: Fenster einsetzen.",
  door: "Auf eine Wand tippen: Tür einsetzen.",
  garage: "Auf eine Wand tippen: Garagentor einsetzen.",
  furniture: "Rechts etwas wählen (Suche, Drinnen, Draußen), dann in den Plan tippen.",
  device: "Rechts ein Gerät wählen, dann an seine Stelle tippen.",
  outdoor: "Punkte der Gartenfläche antippen, zum Schließen den ersten Punkt erneut antippen.",
  line: "Punkte antippen: Weg, Hecke, Zaun, Mauer oder Randstein. „Fertig“ beendet („Frei“ = ohne Einrasten).",
  pipe: PIPE_HINT,
  node: NODE_HINT,
  measure: "Zwei Punkte antippen: rastet an Ecken und Wänden ein. Bis zu drei Messungen bleiben stehen (ungespeichert).",
};
