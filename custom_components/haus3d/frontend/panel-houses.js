// Häuser (Mixin für Haus3DPanel): „Mein Haus“ ist immer echt; daneben gibt es bis zu 5 weitere Häuser, die
// getrennt davon liegen (Grundriss, Bauplan-Fotos, Anzeige-Einstellungen, Ansichten, Favoriten). Ein weiteres
// Haus ist ein Testhaus – oder, mit dem Kästchen „Demo-Modus“, ein Vorführmodell, in dem alles simuliert wird.
// Hier: Admin → Häuser, Wechsel zwischen den Häusern und die Schlüssel je Haus im Browser-Speicher.
//
// Schnittstelle zum Demo-Teil: this._house = {id, name, live, demo} (null = Mein Haus), `_switchHouse` ruft
// nach `_houseCleanup` this._demoReset?.(); `_houseSetDemo(flag)` berichtigt das Kästchen im Browser, wenn das
// Backend etwas anderes meldet (von `_load`).

import { HOUSE_KEY } from "./access.js";
import { esc, loadSettings, plural } from "./panel-util.js";

/** Höchstens so viele weitere Häuser (wie SANDBOX_LIMIT im Backend). */
export const MAX_HOUSES = 5;

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* privates Fenster */
    }
  },
};

/** Vorgabe für den Namen eines neuen Hauses: „Vorführhaus n“, nicht doppelt vergeben. */
export function newHouseName(houses) {
  const used = new Set(houses.map((h) => h.name));
  let n = houses.length + 1;
  while (used.has(`Vorführhaus ${n}`)) n++;
  return `Vorführhaus ${n}`;
}

/** Das Haus so, wie der Browser es merkt (live gilt nie für Demo). */
const remember = (house) => ({ id: house.id, name: house.name, live: house.live === true && house.demo !== true, demo: house.demo === true });

export const HouseMethods = {
  /** Schlüssel im Browser-Speicher je Haus (Ansichten, Favoriten, Lüften): in weiteren Häusern mit Kennung. */
  _hk(key) {
    return this._house ? `${key}.${this._house.id}` : key;
  },

  /**
   * Darf der Editor weg? Bei ungespeicherten Änderungen nachfragen; verworfen heißt verworfen (kein Entwurf zum
   * „Fortsetzen“). true = weiter.
   */
  async _houseDiscardEditor() {
    if (!this._editor?.dirty) return true;
    if (!(await this._confirm("Ungespeicherte Änderungen im Editor verwerfen?", "Verwerfen", { danger: true }))) return false;
    this._editor?.clearDraft?.();
    return true;
  },

  /**
   * Haus wechseln (null = Mein Haus; auch das gleiche Haus noch einmal, um es neu zu laden): nur dieser
   * Browser, das echte Haus bleibt unverändert. Vorher wird alles abgebrochen, was noch zum alten Haus gehört
   * (offene Nachfragen, PIN-Feld, Fenster, Thermostat-Timer, Editor); bis der neue Grundriss geladen ist,
   * wird nichts gespeichert. confirmed: die Nachfrage wegen des Editors ist schon gestellt.
   */
  async _switchHouse(house, { confirmed = false } = {}) {
    if (this._switching) return false;
    if (!confirmed && !(await this._houseDiscardEditor())) return false;
    this._switching = true;
    try {
      this._houseCleanup();
      this._demoReset?.(); // Schaltzustände, Uhrzeit und Vorschau des Demo-Hauses gehören zum alten Haus
      if (this._sim) await this._setSim(false);
      this._house = house ? remember(house) : null;
      ls.set(HOUSE_KEY, this._house ? JSON.stringify(this._house) : "");
      this._houseEpoch = (this._houseEpoch ?? 0) + 1;
      this._filter = ls.get(this._hk("haus3d.filter")) || "all"; // Etage je Haus
      // Anzeige-Einstellungen je Haus (ein weiteres Haus beginnt mit einer Kopie der echten)
      this._settingsKey = this._hk("haus3d.settings");
      this._settings = loadSettings(ls.get(this._settingsKey) ?? ls.get("haus3d.settings"), ls.get("haus3d.style"));
      this._applyStyle?.();
      this._applyQuality?.();
      this._applyKiosk?.();
      this._scene?.setLayers(this._settings.layers);
      this._applyOverlayLayers?.();
      this._favSig = null; // Favoriten des anderen Hauses
      this._alertSig = null;
      if (this._realHass) this.hass = this._realHass; // neue Hülle (Test, Demo bzw. echt)
      await this._load();
    } finally {
      this._switching = false;
      this._renderModes?.();
    }
    this._renderFavs?.();
    if (this._buildingHouse !== (this._house?.id ?? null)) return true; // Laden fehlgeschlagen: Meldung kommt von _load, Speichern bleibt gesperrt
    // Das Backend hat beim Laden das Kästchen berichtigt haben können: gelesen wird erst jetzt
    this._toast(!this._house ? "Zurück in deinem Haus." : this._house.demo ? `Demo-Haus „${this._house.name}“ – alles wird simuliert, dein Haus bleibt unverändert.` : `Testhaus „${this._house.name}“ – dein Haus bleibt unverändert.`);
    return true;
  },

  /**
   * Alles abbrechen, was noch zum bisherigen Haus gehört: Nachfrage, PIN-Feld, Fenster, Raumfenster,
   * Thermostat-Timer, Zeitstrahl, Editor, ausstehender Benutzerdaten-Abgleich. Danach wird nichts davon
   * mehr ausgeführt (gemeinsam für den Wechsel und den Rücksprung, wenn ein Haus gelöscht wurde).
   */
  _houseCleanup() {
    this._stopWalk?.(); // zuerst, solange noch das alte Haus gilt (Etage wird zurückgestellt)
    this._houseEpoch = (this._houseEpoch ?? 0) + 1;
    this._titleCancel?.();
    this._noticeEl?.remove(); // Meldung einer echten Automation (Dienst notify) gehört zum Haus von vorher
    this._noticeEl = null;
    this._away = false; // Urlaubsstatus des echten Hauses (Haus verlassen) gilt nicht in einem anderen Haus
    this._confirmEl?._finish?.(false);
    this._pinEl?._finish?.(false);
    for (const p of this._panels ?? []) clearTimeout(p.climateTimer);
    clearTimeout(this._userTimer);
    this._userTimer = null;
    this._closePopup?.();
    if (this._tl) this._timelineClose?.();
    if (this._editor) this._editor.onClose?.();
    this._selectRoom?.(null);
    this._closeDialog?.();
  },

  /**
   * Das Backend ist maßgeblich für den Demo-Modus: Meldet building/get etwas anderes als der Zwischenspeicher
   * des Browsers, hier berichtigen (Haus, Browser-Speicher, Hülle um hass, Modus-Leiste). true = geändert
   * (dann einmal neu laden). Mein Haus ist nie Demo.
   */
  _houseSetDemo(flag) {
    if (!this._house) return false;
    const demo = flag === true;
    if (this._house.demo === demo) return false;
    if (this._editor) return false; // ein offener Editor gehört zum alten Modus: erst _houseEditorFor
    this._house = remember({ ...this._house, demo });
    ls.set(HOUSE_KEY, JSON.stringify(this._house));
    if (this._realHass) this.hass = this._realHass; // Hülle neu: Demo ↔ Testhaus
    this._renderModes?.();
    return true;
  },

  /**
   * Das Backend meldet für das offene Haus einen anderen Modus (Demo ↔ Testhaus), z. B. nach `haus3d.reload`: ein offener
   * Editor gehört zum alten Modus (mit bzw. ohne eingesetzte Demo-Geräte) und wird geschlossen – bei ungespeicherten
   * Änderungen nach Nachfrage. false = der Editor bleibt (verwerfen abgelehnt), `_houseSetDemo` lässt den Modus dann wie er ist.
   */
  async _houseEditorFor(flag) {
    if (!this._editor || !this._house || this._house.demo === (flag === true)) return true;
    if (!(await this._houseDiscardEditor())) return false;
    this._editor?.onClose?.();
    return true;
  },

  /** In einem Testhaus ohne „echt schalten“ bzw. im Demo-Haus: kurz melden statt schalten (höchstens alle 4 s). */
  _houseBlocked(what) {
    const now = Date.now();
    if (now - (this._houseBlockedAt ?? 0) < 4000) return;
    this._houseBlockedAt = now;
    const demo = this._house?.demo === true;
    if (["haus3d/pin/set", "haus3d/dev/clear", "haus3d/dev/set", "haus3d/away/set"].includes(what)) return this._toast(`${demo ? "Demo: " : ""}PINs, Entwickler-Instanz und Urlaub gelten für dein echtes Haus – dafür erst „Mein Haus“ öffnen.`);
    if (/^config\//.test(what)) return this._toast(demo ? "Im Demo-Haus wird nichts in Home Assistant angelegt oder gelöscht (Szenen …)." : "Im Testhaus wird nichts in Home Assistant angelegt oder gelöscht (Szenen …).");
    this._toast(demo ? "Demo: wird nur simuliert – nichts geht an Home Assistant." : "Im Testhaus wird nichts geschaltet.");
  },

  /** Testhaus ohne „echt schalten“: Gerät nur ansehen (statt des HA-Dialogs, der schalten könnte). */
  _infoDialog(entityId) {
    const st = this._hass?.states?.[entityId];
    this._closeDialog?.();
    const el = document.createElement("div");
    el.className = "dialog-backdrop";
    const attrs = Object.entries(st?.attributes ?? {}).filter(([k, v]) => k !== "friendly_name" && v !== null && typeof v !== "object").slice(0, 16);
    el.innerHTML = `<div class="dialog infodlg" role="dialog" aria-label="Gerät">
    <div class="dialog-head"><span>${esc(st?.attributes?.friendly_name ?? entityId)}</span><button class="icon close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <div class="dialog-body"><p class="hint">Im Testhaus wird nichts geschaltet – hier nur ansehen.</p>
      <div class="devinfo"><div><span>Entität</span><b>${esc(entityId)}</b></div><div><span>Zustand</span><b>${esc(st ? (this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state) : "–")}</b></div>
      ${attrs.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("")}</div></div></div>`;
    el.querySelector(".close").addEventListener("click", () => this._closeDialog());
    el.addEventListener("click", (ev) => ev.target === el && this._closeDialog());
    this._els.stage.appendChild(el);
    this._dialog = el;
  },

  /** Admin → Häuser: Mein Haus, weitere Häuser (Öffnen, Demo-Modus, Umbenennen, Löschen) und neues Haus anlegen. */
  async _renderHouses(box) {
    let houses = [];
    try {
      ({ houses } = await this._hass.callWS({ type: "haus3d/sandbox/list" }));
    } catch (e) {
      box.innerHTML = `<p class="muted">Häuser nicht verfügbar: ${esc(e.message ?? e.code ?? e)}</p>`;
      return;
    }
    const cur = this._house;
    const open = (h) => cur?.id === h.id;
    box.innerHTML = `<div class="houses">
      <p class="hint">Mein Haus ist echt, weitere Häuser liegen getrennt davon. Mit „Demo-Modus“ wird alles simuliert, nichts geht an Home Assistant. Das offene Haus gilt nur in diesem Browser.</p>
      <div class="threw ${cur ? "" : "sel"}"><ha-icon icon="mdi:home"></ha-icon><span><b>Mein Haus</b><small>echt${cur ? "" : " · gerade geöffnet"}</small></span>${cur ? `<button data-th="real" class="primary">Öffnen</button>` : ""}</div>
      ${houses.map((h) => `<div class="threw ${h.demo ? "demo" : ""} ${open(h) ? "sel" : ""}" data-id="${esc(h.id)}"><ha-icon icon="${h.demo ? "mdi:presentation-play" : "mdi:flask-outline"}"></ha-icon><span><b>${esc(h.name)}</b><small>${plural(h.floors, "Etage", "Etagen")} · ${plural(h.rooms, "Raum", "Räume")}${open(h) ? " · gerade geöffnet" : ""}</small></span><label class="thdemo" title="Vorführmodell: alles wird simuliert, nichts geht an Home Assistant"><input type="checkbox" data-th="demo"${h.demo ? " checked" : ""}> Demo-Modus</label>${open(h) ? "" : `<button data-th="open">Öffnen</button>`}<button class="icon" data-th="rename" title="Umbenennen"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button class="icon" data-th="del" title="Löschen"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>`).join("")}
      ${houses.length < MAX_HOUSES ? `<div class="thnew"><input class="thname" maxlength="40" placeholder="Name, z. B. Vorführhaus" value="${esc(newHouseName(houses))}"><select class="thsrc"><option value="example">Beispielhaus</option><option value="current">Kopie meines Hauses</option><option value="empty">leer</option></select><label class="thdemo"><input type="checkbox" class="thdemonew" checked> Demo-Modus</label><button data-th="new" class="primary">Anlegen</button></div>` : `<p class="muted">Höchstens ${MAX_HOUSES} weitere Häuser – erst eins löschen.</p>`}
    </div>`;
    const busy = (on) => box.querySelectorAll("button, select, input").forEach((b) => (b.disabled = on)); // kein Doppelklick
    const redraw = () => box.isConnected && this._renderHouses(box);
    // kam der Wechsel nicht zustande (abgebrochen, Wechsel läuft schon): Fenster wieder bedienbar machen
    const go = async (target) => {
      busy(true);
      if (!(await this._switchHouse(target)) && box.isConnected) redraw();
    };
    const fail = (e) => this._toast(`Ausführen fehlgeschlagen: ${e.message ?? e.code ?? e}`);
    box.querySelector('[data-th="real"]')?.addEventListener("click", () => go(null));
    box.querySelectorAll(".threw[data-id]").forEach((row) => {
      const h = houses.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-th="open"]')?.addEventListener("click", () => go({ id: h.id, name: h.name, live: false, demo: h.demo }));
      // Demo-Modus umschalten: gilt für alle Browser; ist das Haus gerade offen, wird es neu geladen
      row.querySelector('[data-th="demo"]').addEventListener("change", async (ev) => {
        const demo = ev.target.checked;
        busy(true);
        if (open(h) && !(await this._houseDiscardEditor())) return redraw();
        try {
          await this._callLocked({ type: "haus3d/sandbox/update", house: h.id, demo }, "admin");
        } catch (e) {
          fail(e);
          return redraw();
        }
        this._toast(demo ? `„${h.name}“ ist jetzt ein Demo-Haus – alles wird simuliert.` : `„${h.name}“ ist wieder ein Testhaus.`);
        if (open(h)) await this._switchHouse({ id: h.id, name: h.name, live: false, demo }, { confirmed: true });
        redraw();
      });
      row.querySelector('[data-th="rename"]').addEventListener("click", () => {
        const label = row.querySelector("b");
        const input = document.createElement("input");
        input.className = "threname";
        input.maxLength = 40;
        input.value = h.name;
        label.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        const finish = async (save) => {
          if (done) return;
          done = true;
          const name = input.value.trim().slice(0, 40);
          if (save && name && name !== h.name) {
            try {
              await this._callLocked({ type: "haus3d/sandbox/update", house: h.id, name }, "admin");
              if (open(h)) {
                this._house = { ...this._house, name };
                ls.set(HOUSE_KEY, JSON.stringify(this._house));
                this._renderModes?.();
              }
              this._toast(`Haus in „${name}“ umbenannt.`);
            } catch (e) {
              fail(e);
            }
          }
          redraw();
        };
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") finish(true);
          if (ev.key === "Escape") {
            ev.stopPropagation(); // bricht nur das Umbenennen ab, schließt nicht das Fenster
            finish(false);
          }
        });
        input.addEventListener("blur", () => finish(true));
      });
      row.querySelector('[data-th="del"]').addEventListener("click", async () => {
        if (!(await this._confirm(`${h.demo ? "Demo-Haus" : "Testhaus"} „${h.name}“ löschen? Dein Haus bleibt unverändert.`, "Löschen", { danger: true }))) return;
        busy(true);
        // gerade geöffnet: erst zurück in mein Haus – klappt das nicht (Editor-Änderungen behalten), nicht löschen
        if (open(h) && !(await this._switchHouse(null))) return redraw();
        try {
          await this._callLocked({ type: "haus3d/sandbox/delete", house: h.id }, "admin");
          this._toast(`${h.demo ? "Demo-Haus" : "Testhaus"} „${h.name}“ gelöscht.`);
        } catch (e) {
          fail(e);
        }
        redraw();
      });
    });
    box.querySelector('[data-th="new"]')?.addEventListener("click", async () => {
      const demo = box.querySelector(".thdemonew").checked;
      const name = box.querySelector(".thname").value.trim() || newHouseName(houses);
      const source = box.querySelector(".thsrc").value;
      busy(true);
      try {
        const res = await this._callLocked({ type: "haus3d/sandbox/create", name, source, demo }, "admin");
        if (!(await this._switchHouse({ id: res.house, name, live: false, demo }))) {
          this._toast(`Haus „${name}“ angelegt, aber nicht geöffnet.`);
          redraw();
        }
      } catch (e) {
        fail(e);
        redraw();
      }
    });
  },
};

export const HOUSE_STYLE = `
.houses .threw { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--divider-color, rgba(127,127,127,.3)); margin-bottom: 6px; }
.houses .threw.sel { border-color: #7e57c2; background: rgba(126,87,194,.1); }
.houses .threw.demo > ha-icon:first-child { color: #00897b; }
.houses .threw.demo.sel { border-color: #00897b; background: rgba(0,137,123,.1); }
.houses .threw > span { flex: 1; display: flex; flex-direction: column; min-width: 120px; }
.houses .threw small { color: var(--secondary-text-color); }
.houses .threw button { font: inherit; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; padding: 6px 12px; cursor: pointer; }
.houses .threw button.primary { background: var(--primary-color, #03a9f4); color: #fff; border-color: transparent; }
.houses .threw button.icon { border: 0; padding: 6px; }
.houses .thdemo { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
.houses .threname { font: inherit; width: 100%; box-sizing: border-box; padding: 4px 6px; border-radius: 8px; border: 1px solid var(--primary-color, #03a9f4); background: var(--primary-background-color, #fff); color: inherit; }
.houses .thnew { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0; }
.houses .thnew input.thname { flex: 1; min-width: 140px; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: var(--primary-background-color, #fff); color: inherit; }
.houses .thnew select { font: inherit; padding: 8px; border-radius: 8px; }
.houses .thnew button { font: inherit; border: 0; border-radius: 10px; padding: 8px 14px; background: var(--primary-color, #03a9f4); color: #fff; cursor: pointer; }
`;
