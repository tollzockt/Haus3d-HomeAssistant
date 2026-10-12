// Grundeinstellungen im Editor (Mixin für FloorEditor): beim ersten Öffnen (bzw. bei leerem Haus) ein Fenster
// mit vier Schritten – Haus (Name, Norden), Etagen und Höhen, Wände und Dach, Bauplan als Vorlage. „Fertig“
// übernimmt alles in einem Schritt (ein Rückgängig); vorhandene Etagen werden nie gelöscht.

import { canAdmin } from "./access.js";
import { ROOF_TYPES } from "./exterior.js";
import { MAX_FULL, applySetup, needsSetup, setupPreview, setupState } from "./setup.js";

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const de = (v, d = 2) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v) => Number(String(v ?? "").replace(",", "."));
const STEPS = ["Haus", "Etagen", "Wände & Dach", "Bauplan"];
const NORTH = [[0, "oben im Plan"], [90, "rechts im Plan"], [180, "unten im Plan"], [270, "links im Plan"]];

export const SetupMethods = {
  /** Von selbst öffnen, wenn das Haus noch nicht eingerichtet ist (nach dem Entwurfs-Hinweis). */
  _maybeSetup() {
    if (this._setupEl || this._bannerEl?.isConnected || !needsSetup(this.b)) return;
    this.openSetup();
  },

  openSetup(step = 0) {
    this._closeSetup();
    const st = setupState(this.b);
    // automatisch angelegtes, noch leeres Erdgeschoss: gewählte Geschosshöhe gilt auch dafür
    if (this._autoFloor && needsSetup({ floors: this.b.floors, settings: {} })) st.restack = true;
    this._setup = { st, step, bgFloor: null };
    const el = document.createElement("div");
    el.className = "ed-setup";
    el.innerHTML = `<div class="ed-setup-card" role="dialog" aria-modal="true" aria-labelledby="ed-setup-ttl"></div>`;
    // Eingaben im Fenster gehen nicht an den Editor bzw. das Panel (Tastenkürzel, Esc, Zeichnen)
    el.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") this._closeSetup();
      else if (ev.key === "Enter" && ev.target.tagName === "INPUT" && ev.target.type !== "checkbox") {
        ev.preventDefault();
        this._setupNext();
      }
    });
    for (const t of ["pointerdown", "wheel"]) el.addEventListener(t, (ev) => ev.stopPropagation());
    this.root.appendChild(el);
    this._setupEl = el;
    this._renderSetup();
  },

  _closeSetup() {
    this._setupEl?.remove();
    this._setupEl = null;
  },

  _setupNext() {
    if (this._setup.step < STEPS.length - 1) {
      this._readSetup();
      this._setup.step++;
      this._renderSetup();
    } else this._setupFinish();
  },

  /** Formularwerte des aktuellen Schritts übernehmen. */
  _readSetup() {
    const el = this._setupEl;
    const st = this._setup.st;
    if (!el) return st;
    const v = (k) => el.querySelector(`[data-s="${k}"]`);
    if (v("title")) st.title = v("title").value;
    if (v("north")) st.north = num(v("north").value) || 0;
    if (v("cellar")) st.cellar = v("cellar").checked;
    if (v("full")) st.full = Math.max(1, Math.min(MAX_FULL, Math.round(num(v("full").value)) || 1));
    if (v("attic")) st.attic = v("attic").checked;
    if (v("knee") && Number.isFinite(num(v("knee").value))) st.knee = num(v("knee").value);
    if (v("storey") && num(v("storey").value) > 0) st.storey = num(v("storey").value);
    if (v("restack")) st.restack = v("restack").checked;
    if (v("wallExt") && num(v("wallExt").value) > 0) st.wallExt = num(v("wallExt").value);
    if (v("wallInt") && num(v("wallInt").value) > 0) st.wallInt = num(v("wallInt").value);
    if (v("roofType")) st.roofType = v("roofType").value;
    if (v("pitch") && num(v("pitch").value) > 0) st.pitch = num(v("pitch").value);
    if (v("bgFloor")) this._setup.bgFloor = v("bgFloor").value;
    return st;
  },

  _renderSetup() {
    const el = this._setupEl;
    if (!el) return;
    const { st, step } = this._setup;
    const card = el.querySelector(".ed-setup-card");
    const tabs = STEPS.map((n, i) => `<button class="${i === step ? "sel" : ""}" data-step="${i}" aria-current="${i === step}">${i + 1} ${n}</button>`).join("");
    let body = "";
    if (step === 0) {
      const quick = NORTH.some(([d]) => d === st.north) ? String(st.north) : "";
      body = `<label for="es-title">Name des Hauses</label><input id="es-title" data-s="title" maxlength="60" value="${esc(st.title)}" placeholder="Haus 3D">
        ${canAdmin() ? `` : `<p class="muted">Norden lässt sich nur mit der Admin-PIN einstellen (Admin-Einstellungen → Haus & Wetter).</p>`}<div class="es-northbox"${canAdmin() ? "" : " hidden"}>
        <label>Norden</label><select data-s="northq">${NORTH.map(([d, n]) => `<option value="${d}"${String(d) === quick ? " selected" : ""}>${n}</option>`).join("")}<option value=""${quick === "" ? " selected" : ""}>eigener Winkel</option></select>
        <div class="es-north"><button data-nstep="-5">−5°</button><input data-s="north" type="number" min="0" max="359" step="1" inputmode="numeric" value="${st.north}"><span>°</span><button data-nstep="5">+5°</button>
        <svg viewBox="-20 -20 40 40" class="es-compass" aria-hidden="true"><circle r="18" fill="none" stroke="currentColor" stroke-opacity=".3"/><g transform="rotate(${st.north})"><path d="M0,-15 L5,2 L0,-2 L-5,2 Z" fill="#e53935"/><text y="-16" text-anchor="middle" font-size="7" fill="currentColor">N</text></g></svg></div>
        <p class="muted">Wichtig für Sonnenstand, Schatten und PV: Wo liegt Norden, wenn man auf den Grundriss schaut?</p></div>`;
    } else if (step === 1) {
      const pv = setupPreview(this.b, st);
      body = `<label class="chk"><input type="checkbox" data-s="cellar"${st.cellar ? " checked" : ""}> Keller</label>
        <label for="es-full">Vollgeschosse (mit Erdgeschoss)</label><input id="es-full" data-s="full" type="number" min="1" max="${MAX_FULL}" step="1" inputmode="numeric" value="${st.full}">
        <label class="chk"><input type="checkbox" data-s="attic"${st.attic ? " checked" : ""}> Dachgeschoss (Räume unter den Dachschrägen)</label>
        ${st.attic ? `<label for="es-knee">Kniestock (m)</label><input id="es-knee" data-s="knee" type="number" min="0" max="3" step="0.05" inputmode="decimal" value="${st.knee}">` : ""}
        <label for="es-storey">Geschosshöhe (m, Boden bis Boden)</label><input id="es-storey" data-s="storey" type="number" min="2.2" max="6" step="0.05" inputmode="decimal" value="${st.storey}">
        <p class="muted">= ${de(st.storey - 0.25)} m Raumhöhe + 25 cm Decke.</p>
        <label class="chk"><input type="checkbox" data-s="restack"${st.restack ? " checked" : ""}> Höhe auch für vorhandene Etagen übernehmen</label>
        <div class="es-floors">${pv.rows.map((r) => `<div><span>${esc(r.name)}</span><small>${de(r.elevation)} m</small><b class="${r.isNew ? "new" : ""}">${r.isNew ? "neu" : "vorhanden"}</b></div>`).join("")}</div>
        ${pv.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join("")}`;
    } else if (step === 2) {
      const chips = (k, list) => `<div class="es-chips">${list.map((v) => `<button data-chip="${k}" data-v="${v}" class="${Math.abs(st[k] - v) < 1e-6 ? "sel" : ""}">${de(v, v * 100 % 1 ? 3 : 2)} m</button>`).join("")}</div>`;
      body = `<label for="es-ext">Außenwand (m)</label><input id="es-ext" data-s="wallExt" type="number" min="0.05" max="1" step="0.005" inputmode="decimal" value="${st.wallExt}">${chips("wallExt", [0.24, 0.3, 0.365])}
        <label for="es-int">Innenwand (m)</label><input id="es-int" data-s="wallInt" type="number" min="0.05" max="0.6" step="0.005" inputmode="decimal" value="${st.wallInt}">${chips("wallInt", [0.115, 0.175])}
        <label for="es-roof">Dach</label><select id="es-roof" data-s="roofType">${ROOF_TYPES.map(([k, n]) => `<option value="${k}"${k === st.roofType ? " selected" : ""}>${n}</option>`).join("")}</select>
        ${st.roofType !== "none" && st.roofType !== "flat" ? `<label for="es-pitch">Dachneigung (°)</label><input id="es-pitch" data-s="pitch" type="number" min="5" max="60" step="1" inputmode="numeric" value="${st.pitch}">` : ""}
        <p class="muted">Feinheiten (Überstand, First, PV, Kamin) später im Editor unter „Dach“.</p>`;
    } else {
      const pv = setupPreview(this.b, st).rows;
      const sel = this._setup.bgFloor ?? pv.find((r) => !r.attic && r.elevation === 0)?.id ?? pv[0]?.id;
      body = `<p class="muted">Ein Foto oder Scan vom Bauplan unter eine Etage legen und die Räume darauf nachzeichnen:</p>
        <ol class="es-steps"><li>Bild wählen</li><li>zwei Punkte mit bekanntem Abstand antippen (z. B. eine bemaßte Wand)</li><li>echte Länge eingeben – das Bild bekommt die richtigen Maße</li><li>bei Bedarf drehen oder „An Linie ausrichten“</li></ol>
        <label for="es-bgfloor">Etage</label><select id="es-bgfloor" data-s="bgFloor">${pv.map((r) => `<option value="${esc(r.id)}"${r.id === sel ? " selected" : ""}>${esc(r.name)}${r.isNew ? " (neu)" : ""}</option>`).join("")}</select>
        ${this.sim ? `<p class="muted">In der Simulation lassen sich keine Bauplan-Fotos hochladen.</p>` : `<div class="btns left"><button data-act="es-bg" class="primary">Bild wählen…</button></div>`}
        <p class="muted">Geht auch später: Werkzeug „Vorlage“ in der Leiste.</p>`;
    }
    card.innerHTML = `<div class="es-head"><span id="ed-setup-ttl">Grundeinstellungen</span><button class="icon" data-act="es-close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="es-tabs">${tabs}</div>
      <div class="es-body">${body}</div>
      <div class="es-foot"><button data-act="es-close">Abbrechen</button><span class="grow"></span>${step ? `<button data-act="es-back">Zurück</button>` : ""}${step < STEPS.length - 1 ? `<button data-act="es-next" class="primary">Weiter</button>` : ""}<button data-act="es-done" class="${step === STEPS.length - 1 ? "primary" : ""}">Fertig</button></div>`;
    this._bindSetup(card);
    card.querySelector("input, select")?.focus();
  },

  _bindSetup(card) {
    const st = this._setup.st;
    card.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
      this._readSetup();
      this._setup.step = Number(b.dataset.step);
      this._renderSetup();
    }));
    card.querySelectorAll("[data-act=es-close]").forEach((b) => b.addEventListener("click", () => this._closeSetup()));
    card.querySelector("[data-act=es-back]")?.addEventListener("click", () => {
      this._readSetup();
      this._setup.step--;
      this._renderSetup();
    });
    card.querySelector("[data-act=es-next]")?.addEventListener("click", () => this._setupNext());
    card.querySelector("[data-act=es-done]").addEventListener("click", () => this._setupFinish());
    card.querySelector("[data-act=es-bg]")?.addEventListener("click", () => this._setupFinish({ background: true }));
    // Norden: Schnellwahl, ±5° und Kompass halten sich aktuell
    const north = card.querySelector("[data-s=north]");
    const q = card.querySelector("[data-s=northq]");
    const syncNorth = (v) => {
      this._readSetup(); // übrige Eingaben (Name) nicht verlieren
      st.north = ((Math.round(num(v) || 0) % 360) + 360) % 360;
      this._renderSetup();
    };
    q?.addEventListener("change", () => q.value !== "" && syncNorth(q.value));
    north?.addEventListener("change", () => syncNorth(north.value));
    card.querySelectorAll("[data-nstep]").forEach((b) => b.addEventListener("click", () => syncNorth(st.north + Number(b.dataset.nstep))));
    card.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => {
      this._readSetup();
      st[b.dataset.chip] = Number(b.dataset.v);
      this._renderSetup();
    }));
    // Etagen-Vorschau, Kniestock und Dachneigung folgen den Haken bzw. der Dachform sofort
    card.querySelectorAll("[data-s=cellar], [data-s=full], [data-s=attic], [data-s=storey], [data-s=restack], [data-s=roofType]").forEach((i) => i.addEventListener("change", () => {
      this._readSetup();
      if (i.dataset.s === "attic" && st.attic && st.roofType === "none") st.roofType = "gable"; // Dachgeschoss braucht ein Dach
      this._renderSetup();
    }));
  },

  /** Alles übernehmen; mit background: danach gleich das Bauplan-Foto der gewählten Etage laden. */
  _setupFinish({ background = false } = {}) {
    const st = this._readSetup();
    const { building, added, notes } = applySetup(this.b, st);
    // Norden ist eine Admin-Einstellung (mit der Bearbeiten-PIN würde sie beim Speichern verworfen)
    if (!canAdmin()) building.settings.north = this.b.settings?.north ?? 0;
    const bgFloor = this._setup.bgFloor ?? null;
    this._closeSetup();
    // wie beim Etagenwechsel: Dach-Ebene, Entwurf, Auswahl und Werkzeug zurücksetzen
    Object.assign(this, { roofMode: false, tool: "select", sel: null, multi: [], draft: null });
    this.changeBuilding((b) => {
      b.floors = building.floors;
      b.settings = building.settings;
    }, { fit: true });
    const eg = [...this.b.floors].filter((f) => !f.attic && f.elevation >= 0).sort((a, b) => a.elevation - b.elevation)[0];
    this.floorId = (background && bgFloor && this.b.floors.some((f) => f.id === bgFloor) ? bgFloor : eg?.id) ?? this.b.floors[0]?.id;
    this.renderBar();
    this.fit();
    if (background) {
      this._setPlanTool("bgmove");
      this.props.querySelector("[data-bgfile]")?.click(); // noch im Klick: Dateiauswahl darf aufgehen
    } else {
      this.render();
      this.renderProps();
    }
    this._toast(`Grundeinstellungen übernommen${added.length ? ` – ${added.length} Etage${added.length > 1 ? "n" : ""} angelegt` : ""}.${notes.length ? ` ${notes[0]}` : ""} Speichern nicht vergessen.`);
  },
};

export const SETUP_STYLE = `
.ed-setup { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
.ed-setup-card { width: min(560px, calc(100% - 24px)); max-height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.35); overflow: hidden; }
.ed-setup .es-head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 4px 16px; font-size: 18px; font-weight: 600; }
.ed-setup .es-head span { flex: 1; }
.ed-setup .es-tabs { display: flex; gap: 4px; padding: 4px 12px 8px; overflow-x: auto; border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.3)); }
.ed-setup .es-tabs button { flex: none; border: 0; background: none; color: var(--secondary-text-color); font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.ed-setup .es-tabs button.sel { background: rgba(3,169,244,.14); color: var(--primary-text-color); font-weight: 600; }
.ed-setup .es-body { flex: 1; overflow-y: auto; padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 4px; }
.ed-setup .es-body label { font-size: 13px; color: var(--secondary-text-color); margin-top: 8px; }
.ed-setup .es-body label.chk { display: flex; align-items: center; gap: 8px; color: var(--primary-text-color); font-size: 14px; min-height: 36px; }
.ed-setup .es-body input:not([type=checkbox]), .ed-setup .es-body select { min-height: 40px; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); padding: 0 10px; font: inherit; background: var(--card-background-color, #fff); color: inherit; }
.ed-setup .es-north { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.ed-setup .es-north input { width: 80px; }
.ed-setup .es-compass { width: 44px; height: 44px; margin-left: auto; }
.ed-setup .es-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.ed-setup .es-chips button, .ed-setup .es-north button, .ed-setup .es-foot button, .ed-setup .btns button { min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; font: inherit; cursor: pointer; }
.ed-setup button.sel, .ed-setup button.primary { background: var(--primary-color, #03a9f4); border-color: transparent; color: #fff; }
.ed-setup .es-floors { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding: 8px; border-radius: 10px; background: rgba(127,127,127,.08); }
.ed-setup .es-floors div { display: flex; align-items: baseline; gap: 8px; }
.ed-setup .es-floors span { flex: 1; }
.ed-setup .es-floors small { color: var(--secondary-text-color); }
.ed-setup .es-floors b { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 6px; background: rgba(127,127,127,.18); }
.ed-setup .es-floors b.new { background: #2e7d32; color: #fff; }
.ed-setup .es-steps { margin: 4px 0 4px 18px; padding: 0; font-size: 14px; }
.ed-setup .es-foot { display: flex; align-items: center; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--divider-color, rgba(127,127,127,.3)); }
.ed-setup .es-foot .grow { flex: 1; }
.ed-setup .muted { color: var(--secondary-text-color); font-size: 12px; margin: 4px 0; }
@media (max-width: 700px), (pointer: coarse) and (max-width: 900px) {
  .ed-setup { align-items: flex-end; }
  .ed-setup-card { width: 100%; max-height: 92%; border-radius: 16px 16px 0 0; }
}
`;
