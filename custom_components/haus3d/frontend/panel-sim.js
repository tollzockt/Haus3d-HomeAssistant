// Simulation (Mixin für Haus3DPanel): Leiste mit Wetter, Uhrzeit, Solar und Beispielgeräten; beim Start wird der
// Grundriss kopiert, beim Beenden der echte neu geladen.

import { SIM_WEATHER, Simulator } from "./sim.js";

/** Uhrzeit der Simulation („echt“ oder HH:MM). */
const simTime = (min) => (min === null || min === undefined ? "echt" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

export const SimMethods = {
  /** Simulation an/aus. Beim Start wird der Grundriss kopiert; beim Beenden der echte neu geladen. */
  async _setSim(on) {
    // Demo-Haus: dort ist ohnehin alles simuliert (eigene Leiste mit Uhrzeit)
    if (on && this._isDemo?.()) {
      this._toast("Im Demo-Haus läuft die Simulation schon.");
      return;
    }
    // offener Editor gehört zum bisherigen Stand (echt bzw. Simulationskopie): sichern und schließen
    if (!!on !== !!this._sim && this._editor) {
      if (!this._sim) this._editor._writeDraft?.();
      this._editor.onClose?.();
    }
    if (!on && this._dialog?.querySelector(".simdlg")) this._closeDialog();
    // nur im Admin-Modus (Beispielgeräte, Wetter und Energie verändern die Ansicht für alle am Gerät)
    if (on && !this._sim && !this._adminMode) {
      this._toast("Simulation nur im Admin-Modus – erst Admin-Einstellungen mit PIN öffnen.");
      return;
    }
    this._settings.sim = !!on;
    this._saveSettings();
    if (on && !this._sim) {
      this._sim = new Simulator();
      if (this._building) {
        this._simBase = structuredClone(this._building); // echter Stand, für Beispielgeräte an/aus
        this._sim.building = structuredClone(this._building);
        this._sim.revision = this._revision ?? 0;
        if (this._settings.simDemo) this._sim.makeDemo(this._sim.building, this._realHass);
        this._setBuilding(this._sim.building, this._sim.revision, { keepCamera: true });
      }
      this._toast("Simulation an: nichts wird wirklich geschaltet oder gespeichert.");
    } else if (!on && this._sim) {
      this._sim = null;
      this.hass = this._realHass;
      this._toast("Simulation beendet, echte Zustände.");
      await this._load();
    }
    this._renderSimBar();
    this._simChanged();
  },

  _simChanged() {
    if (this._realHass) this.hass = this._realHass;
  },

  _renderSimBar() {
    if (this._demo) return this._renderDemoBar(); // Demo-Haus: Demo-Leiste statt Simulationsleiste
    this._simBar?.remove();
    this._simBar = null;
    this._els?.stage.classList.toggle("has-simbar", !!this._sim);
    if (!this._sim || !this._els) return;
    const sim = this._sim;
    const el = document.createElement("div");
    el.className = "simbar";
    el.innerHTML = `<b>SIMULATION</b>
      <label>Wetter <select data-sim="weather">${SIM_WEATHER.map(([k, n]) => `<option value="${k}"${k === sim.weather ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Uhrzeit <input type="range" min="-15" max="1440" step="15" data-sim="time" value="${sim.time ?? -15}"><span class="tv">${simTime(sim.time)}</span></label>
      <label>Solar <input type="range" min="0" max="1600" step="20" data-sim="solar" value="${sim.solar ?? 0}"><span class="sv">${sim.solar === null ? "echt" : `${sim.solar} W`}</span></label>
      <label><input type="checkbox" data-sim="demo"${this._settings.simDemo ? " checked" : ""}> Beispielgeräte</label>
      <button data-sim="reset">Zurücksetzen</button><button data-sim="stop">Beenden</button>`;
    el.querySelector("[data-sim=weather]").addEventListener("change", (ev) => {
      sim.weather = ev.target.value;
      sim._cache = null;
      this._simChanged();
    });
    el.querySelector("[data-sim=time]").addEventListener("input", (ev) => {
      const v = Number(ev.target.value);
      sim.time = v < 0 ? null : Math.min(1439, v);
      sim._cache = null;
      el.querySelector(".tv").textContent = simTime(sim.time);
      this._simChanged();
    });
    el.querySelector("[data-sim=solar]").addEventListener("input", (ev) => {
      sim.solar = Number(ev.target.value);
      sim._cache = null;
      el.querySelector(".sv").textContent = `${sim.solar} W`;
      this._simChanged();
    });
    el.querySelector("[data-sim=demo]").addEventListener("change", (ev) => {
      this._settings.simDemo = ev.target.checked;
      this._saveSettings();
      // frische Kopie des Grundrisses (Beispielgeräte vergeben Bereiche nur in der Kopie)
      sim.clearDemo();
      sim.building = structuredClone(this._simBase ?? this._building);
      const n = this._settings.simDemo ? sim.makeDemo(sim.building, this._realHass) : 0;
      this._setBuilding(sim.building, sim.revision, { keepCamera: true });
      this._simChanged();
      if (this._settings.simDemo) this._toast(n === 1 ? "1 Raum ohne Geräte hat Beispielgeräte bekommen." : n ? `${n} Räume ohne Geräte haben Beispielgeräte bekommen.` : "Alle Räume haben schon Geräte.");
    });
    el.querySelector("[data-sim=reset]").addEventListener("click", () => {
      sim.reset();
      this._renderSimBar();
      this._simChanged();
    });
    el.querySelector("[data-sim=stop]").addEventListener("click", () => this._setSim(false));
    this._els.stage.appendChild(el);
    this._simBar = el;
  },
};
