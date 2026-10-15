// Module erst bei Bedarf laden (dynamischer import), jedes höchstens einmal.
//
// Wer einen Teil des Codes selten braucht (Editor, Loader für eigene 3D-Modelle), holt ihn über loadOnce() statt per
// import-Zeile am Dateikopf: Der Start lädt und wertet dann weniger Module aus. Der import() steht dort, wo der relative
// Pfad stimmt (die Loader in models.js, der Editor hier); der Rest dieser Datei ist Merken und Warten auf Leerlauf.

const loading = new Map();

/**
 * load() höchstens einmal ausführen und das Ergebnis (meist ein Modul) für alle weiteren Aufrufe merken. Gleichzeitige
 * Aufrufe teilen sich ein Laden. Ein Fehlschlag (z. B. kurzer Netzausfall) wird nicht gemerkt: der nächste Aufruf versucht es
 * neu (Chromium holt das Modul dann wirklich neu; andere Browser merken sich fehlgeschlagene Modulabrufe teils bis zum Neuladen).
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
export function loadOnce(key, load) {
  let p = loading.get(key);
  if (!p) {
    p = Promise.resolve()
      .then(load)
      .catch((err) => {
        loading.delete(key);
        throw err;
      });
    loading.set(key, p);
  }
  return p;
}

/** Der Editor (editor.js samt allem, was nur er braucht, rund 460 KB): erst beim ersten Öffnen bzw. beim Tippen auf „Bearbeiten“, mit Freigabe auch vorgeladen im Leerlauf. */
export const loadEditor = () => loadOnce("editor", () => import("./editor.js"));

/** Schon (fertig oder gerade) geladen bzw. angefordert? */
export const isRequested = (key) => loading.has(key);

/**
 * fn im Leerlauf des Browsers ausführen (requestIdleCallback), sonst nach einer kurzen Pause (setTimeout). Gedacht für
 * Vorladen nach dem ersten Bild: die Bedienung der Seite hat Vorrang. Gibt eine Funktion zum Abbrechen zurück.
 * @param {() => void} fn
 * @param {{timeout?: number}} [o] timeout: spätestens nach so vielen ms (ms)
 */
export function whenIdle(fn, { timeout = 4000 } = {}) {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}
