// Module erst bei Bedarf laden (dynamischer import), jedes höchstens einmal.
//
// Wer einen Teil des Codes selten braucht (Editor, Loader für eigene 3D-Modelle), holt ihn über loadOnce() statt per
// import-Zeile am Dateikopf: Der Start lädt und wertet dann weniger Module aus. Der import() steht dort, wo der relative
// Pfad stimmt (die Loader in models.js, der Editor hier); der Rest dieser Datei ist Merken und Warten auf Leerlauf.

const loading = new Map();
const failures = new Map(); // Fehlschläge je Schlüssel (loadOnce)

/**
 * load() höchstens einmal ausführen und das Ergebnis (meist ein Modul) für alle weiteren Aufrufe merken. Gleichzeitige
 * Aufrufe teilen sich ein Laden. Ein Fehlschlag (z. B. kurzer Netzausfall) wird nicht gemerkt: der nächste Aufruf versucht es
 * neu. load(n) bekommt die Zahl der Fehlschläge davor: Browser (auch Chromium) merken sich einen fehlgeschlagenen
 * Modulabruf je Adresse bis zum Neuladen, ein neuer Versuch braucht darum eine neue Adresse (loadEditor).
 * @template T
 * @param {string} key
 * @param {(failures: number) => Promise<T>} load
 * @returns {Promise<T>}
 */
export function loadOnce(key, load) {
  let p = loading.get(key);
  if (!p) {
    const n = failures.get(key) ?? 0;
    p = Promise.resolve(n)
      .then(load)
      .catch((err) => {
        loading.delete(key);
        failures.set(key, n + 1);
        throw err;
      });
    loading.set(key, p);
  }
  return p;
}

/**
 * Der Editor (editor.js samt allem, was nur er braucht, rund 460 KB): erst beim ersten Öffnen bzw. beim Tippen auf
 * „Bearbeiten“, mit Freigabe auch vorgeladen im Leerlauf. Nach einem Fehlschlag unter neuer Adresse (?versuch=n), sonst
 * schlüge der nächste Versuch ohne neuen Abruf fehl; fehlte ein Teil-Modul, hilft nur „Seite neu laden“ (Hinweis im Panel).
 */
export const loadEditor = () => loadOnce("editor", (n) => import(n ? `./editor.js?versuch=${n}` : "./editor.js"));

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
