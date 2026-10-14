// Eigene 3D-Modelle im Editor (Mixin für FloorEditor, eingehängt über editor-catalog.js): Bereich
// „Eigene 3D-Modelle“ im Katalog „Einrichten“ (Kacheln und Knopf „Modell hochladen …“), Dialog zum Hochladen
// (Name, Einheit mit Vorschlag, Oben-Achse) und die Maße, die ein neu gesetztes Modell mitbringt.
// Attribute im HTML tragen das Präfix data-model-….

import { MODEL_ACCEPT, UNITS, defaultUp, formatBytes, formatSize, longestEdge, nameFromFile, placementSize, sizeFromRaw, suggestUnit, thumbSrc } from "./model-fit.js";
import { hasModelHass, inspectFile, loadedSize, modelLimits, modelList, modelMeta, modelsLoaded, modelsUsedBytes, onModelsChange, refreshModels, setModelHass, uploadModel } from "./models.js";
import { modelFileThumb } from "./thumbs.js";

export const MODEL_GROUP = "Eigene 3D-Modelle";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const UP_CHOICES = [
  ["y", "Y-Achse (üblich bei OBJ und glTF)"],
  ["z", "Z-Achse (üblich bei STL aus CAD und 3D-Druck)"],
];

export const ModelCatalogMethods = {
  /** Verbindung zu hass für Abrufe sicherstellen und die Liste holen (das Panel setzt das echte hass schon selbst). */
  _modelsInit() {
    if (!hasModelHass()) setModelHass(this.hass);
    if (!modelsLoaded()) refreshModels().catch(() => {});
  },

  /** Katalog neu zeichnen, sobald sich die Liste ändert; endet mit der Auswahlliste (nicht mehr im Dokument). */
  _modelsWatch(box, draw) {
    this._offModelCat?.();
    const off = onModelsChange((kind) => {
      if (!box.isConnected) return off();
      if (kind === "list") draw();
    });
    this._offModelCat = off;
  },

  /** Gruppe „Eigene 3D-Modelle“ oben im Katalog (head = Kopfzeile wie bei Drinnen/Draußen). */
  _modelSection(open, head, style) {
    const list = modelList();
    return head("grp", MODEL_GROUP, MODEL_GROUP, list.length, open) + (open ? `<div class="grpbody">${this._modelBody(list, style)}</div>` : "");
  },

  _modelBody(list, style) {
    const upload = this.sim
      ? `<p class="muted">In der Simulation lassen sich keine Modelle hochladen.</p>`
      : `<div class="btns left mdl-up"><button class="primary" data-model-upload><ha-icon icon="mdi:upload"></ha-icon> Modell hochladen …</button></div>`;
    const tiles = list.length
      ? `<div class="tiles">${list.map((m) => this._modelTile(m, style)).join("")}</div>`
      : `<p class="muted">Noch keine Modelle. Erlaubt sind .glb und .gltf (mit Farben und Texturen), .obj und .stl (einfarbig, Farbe wählbar).</p>`;
    const lim = modelLimits();
    const usage = list.length && lim ? `<p class="muted">${list.length} von ${lim.count} Modellen, ${formatBytes(modelsUsedBytes())} von ${formatBytes(lim.total)}.</p>` : "";
    return `${upload}${tiles}${usage}<p class="muted">Die Dateien bleiben auf deinem Home Assistant (Konfigurationsordner, in Backups enthalten). Der JSON-Export enthält nur den Verweis auf ein Modell, nicht die Datei.</p>`;
  },

  _modelTile(m, style) {
    const img = thumbSrc(m); // vom Server, beim Hochladen im Browser gerendert; ältere Modelle zeigen das Symbol
    const sel = this.furnType === "custom_model" && this.furnModel === m.id;
    return `<button class="tile${sel ? " sel" : ""}${m.missing ? " gone" : ""}" data-model-tile="${esc(m.id)}" title="${esc(m.name)}${m.missing ? " (Datei fehlt)" : ""}">${img ? `<img alt="" src="${esc(img)}">` : `<span class="ph"><ha-icon icon="mdi:cube-outline"></ha-icon></span>`}<span>${esc(m.name)}</span></button>`;
  },

  /** Treffer der Suche unter den eigenen Modellen (nach Namen). */
  _modelFound(q, style) {
    const list = modelList().filter((m) => m.name.toLowerCase().includes(q) || MODEL_GROUP.toLowerCase().includes(q));
    return list.length ? `<div class="cat found">${MODEL_GROUP}</div><div class="tiles">${list.map((m) => this._modelTile(m, style)).join("")}</div>` : "";
  },

  /** Klick im Katalog: Modell wählen oder Hochladen; true = behandelt. */
  _modelClick(ev, box) {
    if (ev.target.closest("[data-model-upload]")) {
      this._modelPick();
      return true;
    }
    const t = ev.target.closest("[data-model-tile]");
    if (!t) return false;
    this.furnType = "custom_model";
    this.furnModel = t.dataset.modelTile;
    box.querySelectorAll(".tile").forEach((x) => x.classList.toggle("sel", x === t));
    return true;
  },

  /** Maße und Verweis für ein gerade gesetztes Möbel (editor.js): gewähltes Modell mit seiner natürlichen Größe. */
  _modelPlacement(m) {
    if (m.type !== "custom_model") return;
    const meta = this.furnModel ? modelMeta(this.furnModel) : null;
    if (!meta) return; // kein Modell gewählt: Platzhalter, Modell folgt in den Eigenschaften
    m.model = meta.id;
    m.name = meta.name;
    const size = placementSize(meta.size_m ?? loadedSize(meta.id));
    if (size) [m.w, m.d, m.h] = size;
  },

  // ------------------------------------------------------------------ Hochladen

  _modelPick() {
    if (this.sim) return this._toast("In der Simulation lassen sich keine Modelle hochladen.");
    this._modelInput?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MODEL_ACCEPT;
    input.hidden = true;
    input.dataset.modelFile = "";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (file) this._modelDialog(file);
    });
    this.root.appendChild(input);
    this._modelInput = input;
    input.click(); // noch im Klick: die Dateiauswahl darf aufgehen
  },

  _closeModelDialog() {
    this._modelDlg?.remove();
    this._modelDlg = null;
  },

  /** Dialog: Datei prüfen, Name/Einheit/Achse wählen, hochladen. */
  async _modelDialog(file) {
    this._closeModelDialog();
    const el = document.createElement("div");
    el.className = "ed-mdl";
    el.innerHTML = `<div class="ed-mdl-card" role="dialog" aria-modal="true" aria-labelledby="ed-mdl-ttl">
      <div class="mdl-head"><span id="ed-mdl-ttl">Modell hochladen</span><button class="icon" data-model-cancel title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="mdl-body"><p class="muted" data-model-state>Datei wird geprüft …</p></div></div>`;
    // Eingaben im Fenster gehen nicht an den Editor bzw. das Panel (Tastenkürzel, Zeichnen)
    el.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape" && !el.querySelector("[data-model-go][disabled]")) this._closeModelDialog();
    });
    for (const t of ["pointerdown", "wheel"]) el.addEventListener(t, (ev) => ev.stopPropagation());
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-model-cancel]") && !el.querySelector("[data-model-go][disabled]")) this._closeModelDialog();
    });
    this.root.appendChild(el);
    this._modelDlg = el;
    const body = el.querySelector(".mdl-body");
    const fail = (text) => {
      body.innerHTML = `<p class="mdl-err">${esc(text)}</p><div class="mdl-foot"><span class="grow"></span><button data-model-cancel>Schließen</button></div>`;
    };
    if (!hasModelHass()) setModelHass(this.hass);
    let info;
    try {
      info = await inspectFile(file);
    } catch (err) {
      if (this._modelDlg === el) fail(err?.message ?? String(err));
      return;
    }
    if (this._modelDlg !== el) return; // inzwischen geschlossen
    const state = {
      name: nameFromFile(file.name),
      unit: suggestUnit(longestEdge(info.raw), info.ext),
      up: defaultUp(info.ext),
    };
    const suggested = state.unit;
    const axis = info.ext === "obj" || info.ext === "stl";
    body.innerHTML = `<p class="muted"><b>${esc(file.name)}</b> · ${formatBytes(file.size)} · ${info.tris.toLocaleString("de-DE")} Dreiecke</p>
      <label>Name</label><input data-model-name maxlength="60" value="${esc(state.name)}">
      <label>Einheit der Datei</label><select data-model-unit>${UNITS.map(([k, n]) => `<option value="${k}"${k === state.unit ? " selected" : ""}>${n}${k === suggested ? " (Vorschlag)" : ""}</option>`).join("")}</select>
      ${axis ? `<label>Oben ist</label><select data-model-up>${UP_CHOICES.map(([k, n]) => `<option value="${k}"${k === state.up ? " selected" : ""}>${n}</option>`).join("")}</select>` : ""}
      <p class="mdl-size" data-model-size></p>
      <p class="muted">${info.ext === "stl" || info.ext === "obj" ? "Die Farbe lässt sich später am Möbel wählen. " : "Farben und Texturen kommen aus der Datei. "}Die Datei bleibt auf deinem Home Assistant (Konfigurationsordner, in Backups enthalten) und geht nirgends sonst hin. Der JSON-Export enthält nur den Verweis auf das Modell.</p>
      <p class="mdl-err" data-model-state hidden></p>
      <div class="mdl-foot"><span class="grow"></span><button data-model-cancel>Abbrechen</button><button class="primary" data-model-go>Hochladen</button></div>`;
    const q = (k) => body.querySelector(`[data-model-${k}]`);
    const size = () => sizeFromRaw(info.raw, state.unit, state.up);
    const showSize = () => {
      const s = size();
      const odd = longestEdge(s) > 15 || longestEdge(s) < 0.03;
      q("size").innerHTML = `Ergibt <b>${formatSize(s)}</b> (Breite × Tiefe × Höhe)${odd ? ` <span class="mdl-warn">– sieht ungewöhnlich aus, Einheit prüfen</span>` : ""}`;
    };
    showSize();
    q("name").addEventListener("input", () => (state.name = q("name").value));
    q("name").addEventListener("keydown", (ev) => ev.key === "Enter" && q("go").click());
    q("unit").addEventListener("change", () => {
      state.unit = q("unit").value;
      showSize();
    });
    q("up")?.addEventListener("change", () => {
      state.up = q("up").value;
      showSize();
    });
    q("go").addEventListener("click", async () => {
      const msg = q("state");
      msg.hidden = true;
      body.querySelectorAll("input, select, button").forEach((x) => (x.disabled = true));
      msg.className = "muted";
      msg.hidden = false;
      msg.innerHTML = `<progress></progress> Wird hochgeladen (${formatBytes(file.size)}) …`;
      try {
        const up = axis ? state.up : null;
        const thumb = await modelFileThumb(file, { unit: state.unit, up }); // Vorschaubild für den Katalog, einmal hier gerendert
        const meta = await uploadModel(file, { name: state.name, unit: state.unit, up, size: size(), thumb });
        if (this._modelDlg !== el) return;
        this._closeModelDialog();
        this.furnType = "custom_model";
        this.furnModel = meta.id;
        this.renderProps();
        this._toast(`„${meta.name}“ hochgeladen – jetzt in den Plan tippen.`);
      } catch (err) {
        if (this._modelDlg !== el) return;
        body.querySelectorAll("input, select, button").forEach((x) => (x.disabled = false));
        msg.className = "mdl-err";
        msg.textContent = err?.message ?? String(err);
      }
    });
    q("name").focus();
  },
};

export const MODEL_STYLE = `
.ed-props .btns.left { justify-content: flex-start; margin-top: 6px; }
.ed-props .btns button.primary { background: var(--primary-color, #03a9f4); border-color: transparent; color: #fff; }
.ed-props .btns button ha-icon { --mdc-icon-size: 18px; }
.ed-props .tile.gone { opacity: .55; }
.ed-props .tile .ph { display: flex; align-items: center; justify-content: center; }
.ed-props .tile .ph ha-icon { --mdc-icon-size: 28px; }
.ed-props .mdl-box { margin-top: 10px; padding-top: 4px; border-top: 1px solid var(--divider-color, rgba(127,127,127,.3)); }
.ed-props .mdl-box .colorrow input { flex: 1; width: auto; }
.ed-props .warn { color: #e65100; }
.ed-mdl { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
.ed-mdl-card { width: min(480px, calc(100% - 24px)); max-height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.35); overflow: hidden; }
.ed-mdl .mdl-head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 4px 16px; font-size: 18px; font-weight: 600; }
.ed-mdl .mdl-head span { flex: 1; }
.ed-mdl .mdl-head .icon { border: 0; background: none; color: inherit; cursor: pointer; min-width: 40px; min-height: 40px; }
.ed-mdl .mdl-body { flex: 1; overflow-y: auto; padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 4px; }
.ed-mdl .mdl-body label { font-size: 13px; color: var(--secondary-text-color); margin-top: 8px; }
.ed-mdl .mdl-body input, .ed-mdl .mdl-body select { min-height: 40px; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); padding: 0 10px; font: inherit; background: var(--card-background-color, #fff); color: inherit; }
.ed-mdl .muted { color: var(--secondary-text-color); font-size: 12px; margin: 4px 0; }
.ed-mdl .mdl-size { margin: 10px 0 2px; padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.1); font-size: 14px; }
.ed-mdl .mdl-warn { color: #e65100; font-size: 12px; }
.ed-mdl .mdl-err { color: var(--error-color, #db4437); font-size: 13px; margin: 6px 0; }
.ed-mdl progress { vertical-align: middle; width: 90px; }
.ed-mdl .mdl-foot { display: flex; align-items: center; gap: 8px; padding-top: 10px; }
.ed-mdl .mdl-foot .grow { flex: 1; }
.ed-mdl .mdl-foot button { min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; font: inherit; cursor: pointer; }
.ed-mdl .mdl-foot button.primary { background: var(--primary-color, #03a9f4); border-color: transparent; color: #fff; }
.ed-mdl button:disabled, .ed-mdl input:disabled, .ed-mdl select:disabled { opacity: .55; cursor: default; }
@media (max-width: 700px) {
  .ed-mdl { align-items: flex-end; }
  .ed-mdl-card { width: 100%; max-height: 92%; border-radius: 16px 16px 0 0; }
}
`;
