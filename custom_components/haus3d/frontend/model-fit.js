// Reine Rechnungen für eigene 3D-Modelle (ohne Three.js und DOM, mit node testbar): Dateiarten, Einheiten
// und Achsen, Einpassen in Breite × Tiefe × Höhe, Namen und Fehlermeldungen. Maße stehen immer als
// [Breite (x), Tiefe (z), Höhe (y)] in Metern, wie w, d, h der Möbel.

export const MODEL_FORMATS = ["glb", "gltf", "obj", "stl"];
export const MODEL_ACCEPT = ".glb,.gltf,.obj,.stl";
/** Grenzen wie im Backend (const.py). */
export const MODEL_MAX_BYTES = 25 * 1024 * 1024;
export const MODEL_NAME_MAX = 60;
export const MODEL_ID = /^[0-9a-f]{16}$/;
export const MODEL_URL = "/api/haus3d/models";

export const UNITS = [
  ["m", "Meter"],
  ["cm", "Zentimeter"],
  ["mm", "Millimeter"],
];
const FACTOR = { m: 1, cm: 0.01, mm: 0.001 };
export const FIT_CHOICES = [
  ["keep", "Seitenverhältnis behalten"],
  ["stretch", "Auf Maße strecken"],
];

export const isModelId = (v) => typeof v === "string" && MODEL_ID.test(v);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Endung einer Datei (klein), wenn sie zu den Formaten gehört, sonst null. */
export function modelExt(filename) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(filename ?? ""));
  const ext = m?.[1].toLowerCase();
  return MODEL_FORMATS.includes(ext) ? ext : null;
}

/** Welche Achse zeigt nach oben? glTF und OBJ meist Y, STL (CAD, 3D-Druck) meist Z. */
export const defaultUp = (ext) => (ext === "stl" ? "z" : "y");

export const unitFactor = (unit) => FACTOR[unit] ?? 1;

/**
 * Einheit aus der längsten Kante der Datei (Zahl ohne Einheit) vorschlagen. glTF ist laut Format in Metern;
 * OBJ ist einheitenlos (Möbel meist in cm); STL kommt meist aus CAD oder 3D-Druck in Millimetern.
 * Der Vorschlag ist nur eine Hilfe: der Dialog zeigt die entstehende Größe, die Einheit lässt sich ändern.
 */
export function suggestUnit(edge, ext = "") {
  const e = Number(edge);
  if (!(e > 0)) return "m";
  const [metres, centimetres] = { glb: [100, 3000], gltf: [100, 3000], obj: [20, 600], stl: [5, 5] }[ext] ?? [20, 600];
  return e <= metres ? "m" : e <= centimetres ? "cm" : "mm";
}

/** Maße [Breite, Tiefe, Höhe] in m aus den Kanten der Datei [x, y, z] (Dateiachsen), Einheit und Oben-Achse. */
export function sizeFromRaw(raw, unit = "m", up = "y") {
  const f = unitFactor(unit);
  const [x, y, z] = raw.map(Number);
  const s = up === "z" ? [x, y, z] : [x, z, y];
  return s.map((v) => r3(v * f));
}

/** Längste Kante. */
export const longestEdge = (size) => Math.max(0, ...size.map((v) => Number(v) || 0));

/**
 * Maßstab je Achse (x, y, z) für ein Modell der natürlichen Größe natural in einem Rahmen target
 * (beide [Breite, Tiefe, Höhe]). "keep": gleichmäßig, so dass es hineinpasst; "stretch": jede Achse auf ihr Maß.
 * Achsen ohne Ausdehnung (flaches Modell) oder ohne Zielmaß zählen nicht.
 */
export function fitScale(natural, target, fit = "keep") {
  const ratio = (t, n) => (n > 1e-9 && t > 0 ? t / n : null);
  const rx = ratio(target[0], natural[0]);
  const rz = ratio(target[1], natural[1]);
  const ry = ratio(target[2], natural[2]);
  if (fit === "stretch") return [rx ?? 1, ry ?? 1, rz ?? 1];
  const all = [rx, ry, rz].filter((r) => r !== null);
  const s = all.length ? Math.min(...all) : 1;
  return [s, s, s];
}

/** Größe [Breite, Tiefe, Höhe], die das eingepasste Modell einnimmt. */
export function fittedSize(natural, target, fit = "keep") {
  const [sx, sy, sz] = fitScale(natural, target, fit);
  return [r3(natural[0] * sx), r3(natural[1] * sz), r3(natural[2] * sy)];
}

/** Maße für ein neu gesetztes Möbel aus size_m der Angaben ([w, d, h] oder null, wenn unbrauchbar). */
export function placementSize(sizeM) {
  if (!Array.isArray(sizeM) || sizeM.length !== 3) return null;
  const v = sizeM.map((x) => Math.min(200, Math.max(0.01, Number(x) || 0)));
  return v.some((x) => !Number.isFinite(x)) || sizeM.every((x) => !(Number(x) > 0)) ? null : v.map(r3);
}

/** Anzeigename: Steuerzeichen weg, Leerraum zusammengefasst, höchstens 60 Zeichen. */
export function cleanName(text, fallback = "Modell") {
  const t = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MODEL_NAME_MAX)
    .trim();
  return t || fallback;
}

/** Name aus dem Dateinamen (ohne Ordner und Endung). */
export const nameFromFile = (filename) => cleanName(String(filename ?? "").split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]+$/, "").replace(/[_]+/g, " "));

const BLOCKED_GLTF = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"];

/**
 * Probleme einer glTF-Beschreibung (JSON): Verweise auf andere Dateien oder Komprimierung, die der Browser ohne
 * Zusatz nicht liest. Gibt {code, message} oder null zurück (gleiche Meldungen wie das Backend).
 */
export function gltfProblem(doc, ext = "gltf") {
  if (!doc || typeof doc !== "object" || typeof doc.asset !== "object") return { code: "invalid_format", message: "Das ist keine gültige glTF-Datei." };
  for (const key of ["buffers", "images"]) {
    for (const item of Array.isArray(doc[key]) ? doc[key] : []) {
      const uri = item && typeof item === "object" ? item.uri : null;
      if (typeof uri === "string" && !/^data:/i.test(uri)) {
        return {
          code: "external_refs",
          message: ext === "gltf" ? "Die .gltf-Datei verweist auf weitere Dateien (Daten oder Texturen). Bitte als .glb exportieren." : "Die .glb-Datei verweist auf externe Dateien. Bitte alles einbetten und neu als .glb exportieren.",
        };
      }
    }
  }
  if ((Array.isArray(doc.extensionsRequired) ? doc.extensionsRequired : []).some((x) => BLOCKED_GLTF.includes(x))) {
    return { code: "unsupported", message: "Komprimierte Modelle (Draco, Meshopt, KTX2) werden nicht unterstützt. Bitte unkomprimiert exportieren." };
  }
  return null;
}

/** JSON-Teil einer .glb (oder null). */
export function glbJson(buffer) {
  try {
    const dv = new DataView(buffer);
    if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) return null; // „glTF“
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > dv.byteLength) return null;
    return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, len)));
  } catch {
    return null;
  }
}

/** Meldung zu einer Antwort des Servers auf den Upload. */
export function uploadMessage(status, body) {
  if (body && typeof body.message === "string" && body.message) return body.message;
  if (status === 401 || status === 403) return "Keine Berechtigung – bitte mit der PIN freischalten.";
  if (status === 413) return "Die Datei ist zu groß (höchstens 25 MB, oder der Server bzw. ein Proxy erlaubt weniger).";
  if (status === 404) return "Das Hochladen ist auf diesem Server nicht eingerichtet (Haus 3D aktualisieren und Home Assistant neu starten).";
  return `Der Server hat die Datei nicht angenommen (Status ${status}).`;
}

/** „3 Möbeln“ / „1 Möbel“ für Hinweise. */
export const usageText = (n) => (n === 1 ? "1 Möbel" : `${n} Möbeln`);

/** Größe lesbar: „1,25 × 0,60 × 0,80 m“. */
export function formatSize(size) {
  const f = (v) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: v < 0.1 ? 3 : 2 });
  return `${size.map(f).join(" × ")} m`;
}

/** Dateigröße lesbar. */
export function formatBytes(n) {
  const v = Number(n) || 0;
  return v >= 1048576 ? `${(v / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(v / 1024)).toLocaleString("de-DE")} kB`;
}
