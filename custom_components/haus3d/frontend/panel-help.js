// Hilfe, Einführung, Zurücksetzen und Drucken (ein Mixin für Haus3DPanel, damit das Panel nur eine Zeile einbindet).

import { HelpMethods } from "./help.js";
import { TourMethods } from "./tour.js";
import { ResetMethods } from "./reset.js";
import { PrintMethods } from "./panel-print.js";

export const HelpPanelMethods = { ...HelpMethods, ...TourMethods, ...ResetMethods, ...PrintMethods };
