// PV-Felder (Mixin für Haus3DPanel): Kenndaten je Feld, Leistung für Schilder und Glanz, Infokarte.

import { compass16, fieldInfo } from "./exterior.js";
import { roofItemsAll } from "./roofunits.js";
import { fieldPower, formatPower } from "./energy.js";
import { sunFromHass } from "./sun.js";
import { fmt, setText } from "./panel-util.js";

export const PvMethods = {
  /** PV-Felder auf allen Dächern (Hausdach, eigene Dächer, Dachteile) mit Kenndaten: Name, kWp, Ausrichtung, Neigung, Entitäten. */
  _pvFieldInfo() {
    const out = new Map();
    const north = Number(this._building?.settings?.north) || 0;
    roofItemsAll(this._building ?? {}).filter(({ item }) => item?.type === "pv" && item.id).forEach(({ item: it, unit, others }, i) => {
      const model = this._scene?.roofUnitModels?.get(unit.key) ?? unit.model;
      const f = fieldInfo(model, it, north, unit.items, others);
      const dir = f.azimuth === null ? "flach" : compass16(f.azimuth);
      out.set(it.id, { ...f, id: it.id, name: it.name || `PV ${dir}${unit.kind === "house" ? "" : ` · ${unit.label}`}`, short: it.name || dir, dir, entity: it.entity || null, energy: it.energy_entity || null, index: i, roofKey: unit.key });
    });
    return out;
  },

  /** Leistung je PV-Feld: Schilder und Glanz der Module. */
  _updatePv(energy, hass) {
    if (!this._pvInfo?.size) return;
    const lang = hass.locale?.language;
    const fields = [...this._pvInfo.values()].map((f) => {
      const st = f.entity ? hass.states[f.entity] : null;
      const w = st ? Number(st.state) * (st.attributes?.unit_of_measurement === "kW" ? 1000 : 1) : NaN;
      return { id: f.id, kwp: f.kwp, azimuth: f.azimuth, tilt: f.tilt, w: Number.isFinite(w) ? w : null };
    });
    const power = fieldPower(fields, energy.haus_pv, sunFromHass(hass));
    this._pvPower = power;
    const ratios = new Map();
    for (const [id, p] of power) {
      const f = this._pvInfo.get(id);
      if (Number.isFinite(p.w) && f.kwp > 0) ratios.set(id, p.w / (f.kwp * 1000));
      const ov = this._overlays.get(`pv:${id}`);
      if (ov) setText(ov.el.querySelector("b"), Number.isFinite(p.w) ? `${p.estimated ? "ca. " : ""}${formatPower(p.w, lang)}` : `${fmt(f.kwp, 2)} kWp`);
    }
    this._scene?.setPvPower(ratios);
  },

  /** Infokarte eines PV-Felds: Module/kWp, Ausrichtung/Neigung, Leistung jetzt, W je kWp, Ertrag heute. */
  _pvCard(id) {
    // Demo-Haus: PV-Feld (Schild, Tipp im 3D) öffnet den PV-Dialog (Leistung und Zeitfenster der Demo-Erzeugung)
    if (this._isDemo?.()) return this._demoPvDialog?.(`roof:${id}`);
    const f = this._pvInfo?.get(id);
    if (!f) return;
    this._closePopup();
    const hass = this._hass;
    const lang = hass.locale?.language;
    const p = this._pvPower?.get(id);
    const est = p?.estimated ? "ca. " : "";
    const yieldSt = f.energy ? hass.states[f.energy] : null;
    const rows = [
      ["Module", `${f.count} × ${f.wp} Wp = ${fmt(f.kwp, 2)} kWp`],
      ["Ausrichtung", f.azimuth === null ? "flach" : `${Math.round(f.azimuth)}° (${f.dir}) · Neigung ${Math.round(f.tilt)}°`],
      ["Leistung jetzt", Number.isFinite(p?.w) ? `${est}${formatPower(p.w, lang)}` : "–"],
      ["je kWp", Number.isFinite(p?.w) && f.kwp > 0 ? `${est}${fmt(p.w / f.kwp, 0)} W` : "–"],
      ["Ertrag heute", yieldSt ? (hass.formatEntityState ? hass.formatEntityState(yieldSt) : `${yieldSt.state} ${yieldSt.attributes?.unit_of_measurement ?? ""}`) : "–"],
    ];
    const el = document.createElement("div");
    el.className = "popup pvpop";
    el.innerHTML = `<div class="head"></div><div class="scroll">${rows.map(() => `<div class="item"><span></span><b></b></div>`).join("")}${p?.estimated ? `<p class="hint">Geschätzt aus der Gesamtleistung (PV Dach) nach Größe und Sonnenstand.</p>` : ""}</div><div class="foot"><button class="shade"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><span>Verschattung prüfen</span></button>${f.entity ? `<button class="more"><ha-icon icon="mdi:information-outline"></ha-icon><span>Weitere Infos</span></button>` : ""}</div>`;
    el.querySelector(".head").textContent = `PV-Feld ${f.name}`;
    el.querySelectorAll(".item").forEach((row, i) => {
      row.querySelector("span").textContent = rows[i][0];
      row.querySelector("b").textContent = rows[i][1];
    });
    el.querySelector(".more")?.addEventListener("click", () => {
      this._closePopup();
      this._moreInfo(f.entity);
    });
    el.querySelector(".shade").addEventListener("click", () => this._pvShadingDialog());
    el.addEventListener("click", (ev) => ev.stopPropagation());
    this._els.stage.appendChild(el);
    this._popup = el;
  },
};
