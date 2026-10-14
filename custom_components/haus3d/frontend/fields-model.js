// Zusatzfelder in den Möbel-Eigenschaften für eigene 3D-Modelle (eingebunden über editor-more.js).
// Attribute im HTML mit eigenem Präfix data-model-…, damit sie sich nicht mit anderen Feldern überschneiden.

import { FIT_CHOICES, formatSize, placementSize, usageText } from "./model-fit.js";
import { deleteModel, loadModel, loadedSize, modelError, modelList, modelMeta, modelState, modelsLoaded, refreshModels, renameModel } from "./models.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Wie viele Möbel (in diesem Haus, auch ungespeicherte) das Modell benutzen. */
const usedBy = (ed, id) => (ed.b?.floors ?? []).reduce((n, f) => n + (f.furniture ?? []).filter((x) => x.type === "custom_model" && x.model === id).length, 0);

/** Eigenschaften neu zeichnen, wenn dieses Möbel noch gewählt ist. */
const refresh = (ed, m) => {
  if (ed.root?.isConnected && ed.sel?.kind === "furniture" && ed.sel.id === m.id) ed.renderProps();
};

const HINTS = {
  none: "Modell wählen – bis dahin steht ein Platzhalter im Plan.",
  idle: "Modell wird geladen …",
  loading: "Modell wird geladen …",
  missing: "Dieses Modell gibt es nicht mehr (gelöscht?) oder die Datei fehlt auf diesem Home Assistant. Es bleibt ein Platzhalter – ein anderes Modell wählen oder neu hochladen.",
};

export const MODEL_FIELDS = {
  /** HTML für das gewählte Möbelstück m ("" = nichts Eigenes); ed ist der Editor (hass, floor …). */
  html(m, ed) {
    if (m.type !== "custom_model") return "";
    if (!modelsLoaded()) refreshModels().then(() => refresh(ed, m), () => {});
    const meta = m.model ? modelMeta(m.model) : null;
    const state = m.model ? modelState(m.model) : "none";
    if (m.model && !["ready", "missing", "error"].includes(state)) loadModel(m.model).then(() => refresh(ed, m), () => refresh(ed, m));
    const list = modelList();
    const natural = m.model ? (loadedSize(m.model) ?? placementSize(meta?.size_m)) : null;
    const hint = state === "error" ? `Das Modell ließ sich nicht lesen: ${modelError(m.model) ?? "unbekannter Fehler"}` : (HINTS[state] ?? "");
    const colored = meta && ["stl", "obj"].includes(meta.ext);
    const manage =
      meta && !ed.sim
        ? `<div class="mdl-box"><label>Name des Modells</label>
          <div class="colorrow"><input data-model-name value="${esc(meta.name)}" maxlength="60"><button data-model-rename>Umbenennen</button></div>
          <p class="muted">Gilt für alle Möbel mit diesem Modell. Wird von ${usedBy(ed, meta.id) ? usageText(usedBy(ed, meta.id)) : "keinem Möbel"} in diesem Haus benutzt.</p>
          <div class="btns"><button class="danger" data-model-delete>Modell löschen …</button></div></div>`
        : "";
    return `<div class="mdl-fields"><label>3D-Modell</label>
      <select data-model-select><option value="">– kein Modell –</option>${list.map((x) => `<option value="${esc(x.id)}"${x.id === m.model ? " selected" : ""}>${esc(x.name)}${x.missing ? " (Datei fehlt)" : ""}</option>`).join("")}${m.model && !meta && modelsLoaded() ? `<option value="${esc(m.model)}" selected>(nicht mehr vorhanden)</option>` : ""}</select>
      ${hint ? `<p class="muted${state === "missing" || state === "error" ? " warn" : ""}">${esc(hint)}</p>` : ""}
      <label>Einpassen</label>
      <select data-model-fit>${FIT_CHOICES.map(([k, n]) => `<option value="${k}"${k === (m.fit === "stretch" ? "stretch" : "keep") ? " selected" : ""}>${n}</option>`).join("")}</select>
      ${natural ? `<p class="muted">Originalgröße: ${formatSize(natural)}</p><div class="btns left"><button data-model-orig>Originalgröße</button></div>` : ""}
      ${meta ? `<p class="muted">${colored ? "Die Farbe unten färbt das Modell ein." : "Farben und Texturen kommen aus dem Modell; die Farbe unten gilt hier nicht."}</p>` : ""}
      ${manage}</div>`;
  },

  /** Ereignisse binden; edit(fn) ändert das Möbelstück der Etage (fn bekommt es als Argument). */
  bind(el, m, ed, edit) {
    const q = (k) => el.querySelector(`[data-model-${k}]`);
    if (!q("select")) return;
    const toast = (text) => ed._toast?.(text);
    q("select").addEventListener("change", () => {
      const id = q("select").value;
      const next = id ? modelMeta(id) : null;
      const old = m.model ? modelMeta(m.model) : null;
      edit((x) => {
        if (id) x.model = id;
        else delete x.model;
        // Größe und Name des neuen Modells übernehmen (Name nur, wenn er noch der des alten war)
        const size = placementSize(next?.size_m);
        if (size) [x.w, x.d, x.h] = size;
        if (next && (!x.name || x.name === old?.name)) x.name = next.name;
      });
      ed.renderProps();
    });
    q("fit").addEventListener("change", () => {
      edit((x) => {
        if (q("fit").value === "stretch") x.fit = "stretch";
        else delete x.fit;
      });
    });
    q("orig")?.addEventListener("click", () => {
      const size = loadedSize(m.model) ?? placementSize(modelMeta(m.model)?.size_m);
      if (!size) return;
      const r3 = (v) => Math.round(v * 1000) / 1000;
      edit((x) => {
        [x.w, x.d, x.h] = size.map(r3);
        delete x.cols;
        delete x.rows;
      });
      ed.renderProps();
    });
    q("rename")?.addEventListener("click", async () => {
      const name = q("name").value.trim();
      if (!name) return toast("Der Name darf nicht leer sein.");
      try {
        await renameModel(m.model, name);
        toast("Modell umbenannt.");
        refresh(ed, m);
      } catch (err) {
        toast(`Umbenennen fehlgeschlagen: ${err?.message ?? err?.code ?? err}`);
      }
    });
    q("name")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") q("rename").click();
      ev.stopPropagation(); // Pfeile, R, Entf gehören dem Eingabefeld
    });
    q("delete")?.addEventListener("click", async () => {
      const meta = modelMeta(m.model);
      if (!meta) return;
      const n = Math.max(usedBy(ed, meta.id), meta.uses ?? 0); // dieses Haus (auch ungespeichert) bzw. alle gespeicherten Häuser
      const text = `Modell „${meta.name}“ löschen? Die Datei wird von Home Assistant entfernt (nicht rückgängig zu machen).${n ? ` ${n === 1 ? "1 Möbel benutzt" : `${n} Möbel benutzen`} es – dort bleibt ein Platzhalter.` : ""}`;
      if (!(await ed._ask(text))) return;
      try {
        await deleteModel(meta.id);
      } catch (err) {
        return toast(`Löschen fehlgeschlagen: ${err?.message ?? err?.code ?? err}`);
      }
      toast("Modell gelöscht.");
      ed._sync3d?.(true);
      refresh(ed, m);
    });
  },
};
