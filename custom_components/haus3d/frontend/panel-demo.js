// Demo-Haus (Mixin für Haus3DPanel, nachgeladen): Vorführmodell ohne echte Werte.
//
// Das Panel lädt dieses Modul erst, wenn ein Demo-Haus offen ist (_demoLoad, Startbaum klein halten), und hängt den
// Demo-Wrapper in die hass-Kette: echt → DemoHouse.wrap (demo.js) → houseGuard(…, {demo: true}). Damit gehen Dienste
// nie an Home Assistant, callApi wird abgelehnt und WebSocket-Befehle laufen nur über die Erlaubnisliste.
// Hier: Takt (30 s), Demo-Leiste (Uhrzeit, Zurücksetzen), Tippen (demoAction, Türen/Fenster im 3D), Demo-Dialog statt
// des HA-Dialogs und der PV-Dialog „PV-Erzeugung (Demo)“.
//
// Sitzung: Schaltzustände, Uhrzeit und PV-Vorschau gelten nur in diesem Browser bis zum Hauswechsel (je Haus eine
// DemoHouse). Gespeichert wird nur die PV-Einstellung (settings.demo.pv, Bearbeiten-PIN) – das Demo-Kästchen selbst
// liegt im Backend (Admin → Häuser).

import { DemoHouse, demoAction } from "./demo.js";
import { demoStrip } from "./demo-build.js";
import { dayStart, minutesText, normalizeDemoSettings, validateDemoPv } from "./demo-energy.js";
import { normalizeEnergy } from "./energymodel.js";
import { formatPower } from "./energy.js";
import { ensureStyle, esc, fmt } from "./panel-util.js";

const TICK_MS = 30000;
const DIRS = { N: "Nord", NO: "Nordost", O: "Ost", SO: "Südost", S: "Süd", SW: "Südwest", W: "West", NW: "Nordwest" };
const OPEN_NAMES = { door: "Tür", garage: "Garagentor", window: "Fenster" };
// Vorschau-Kurve (SVG): Breite, Höhe, Rand oben und unten (Beschriftung)
const W = 300;
const H = 110;
const TOP = 8;
const BOTTOM = 14;

/** „HH:MM“ → Minuten (NaN, wenn ungültig). */
const minutesOf = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "").trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
/** Zahl aus einem Eingabefeld (leer = NaN). */
const numberOf = (v) => (String(v ?? "").trim() === "" ? NaN : Number(v));

export const DemoMethods = {
  /** Demo-hass des offenen Demo-Hauses (je Haus eine DemoHouse: ein anderes Haus fängt neu an). */
  _demoWrap(real) {
    const id = this._house?.id ?? "";
    if (!this._demo || this._demo.houseId !== id) {
      this._demoStop();
      this._demo = new DemoHouse({ houseId: id });
      this._demoTimer = setInterval(() => this._demoTick(), TICK_MS);
    }
    // Meldungen einer beendeten Sitzung (Takt, Antwort unterwegs) verfallen
    const d = this._demo;
    return d.wrap(real, { onChange: () => this._demo === d && this._demoChanged(), onToast: (t) => this._demo === d && this._toast(t) });
  },

  /** Takt: PV, Sonne und Wetter folgen der Zeit (nur sichtbare Seite). */
  _demoTick() {
    if (!this._demo || !this.isConnected || document.hidden) return;
    this._demo.tick();
  },

  /** Sitzung des Demo-Hauses beenden (Hauswechsel, Kästchen aus): Takt, Leiste und PV-Dialog weg. */
  _demoStop() {
    const had = !!this._demo;
    this._demo = null; // zuerst: nichts mehr an die alte Sitzung melden
    clearInterval(this._demoTimer);
    this._demoTimer = null;
    this._demoPvView = null;
    if (this._dialog?.querySelector(".pvdemo")) this._closeDialog();
    if (had) this._renderDemoBar();
  },

  /** Beim Hauswechsel (_switchHouse): Schaltzustände, Uhrzeit und Vorschau gehören zum alten Haus. */
  _demoReset() {
    this._demoStop();
  },

  /** Der Demo-Wrapper meldet eine Änderung (Schalten, Takt, Uhrzeit, Vorschau, neue Gebäude-Antwort). */
  _demoChanged() {
    if (this._realHass) this.hass = this._realHass;
    this._demoPvView?.refresh();
  },

  /** Gebäude ohne die automatischen Demo-Geräte (Export). */
  _demoStrip(building) {
    return demoStrip(building);
  },

  /** Was ein Tipp im Demo-Haus auslöst (wie entityAction; Kontakte schalten um, PV öffnet den PV-Dialog). */
  _demoAction(entityId, st, opts = {}) {
    return demoAction(entityId, st, { ...opts, pvKey: this._demoPvKey(entityId) });
  },

  /** PV-Schlüssel zu einer Entität: Sensor der Quelle, ihr Ertrag oder ein Erzeuger der Energie-Karte (erste Quelle dieser Art). */
  _demoPvKey(entityId) {
    const d = this._demo;
    if (!d || typeof entityId !== "string") return null;
    const sources = d.model?.sources ?? [];
    const own = d.pvKeyFor(entityId) ?? sources.find((s) => s.energyEntity === entityId)?.key;
    if (own) return own;
    const g = normalizeEnergy(this._building?.settings?.energy).sources.find((s) => s.type !== "speicher" && (s.power === entityId || s.energy === entityId));
    if (!g) return null;
    return (sources.find((s) => s.kind === "cfg" && s.cfgId === g.id) ?? sources.find((s) => s.kind !== "cfg" && s.group === g.type))?.key ?? null;
  },

  /** Demo-Dialog statt „Weitere Infos“ von Home Assistant: PV → PV-Dialog, Kamera → ohne Bild, sonst Zustand setzen. */
  _demoDialog(entityId) {
    if (!this._demo) return;
    const key = this._demoPvKey(entityId);
    if (key) return this._demoPvDialog(key);
    if (String(entityId).startsWith("camera.")) return this._cameraDialog(entityId);
    return this._simDialog(entityId);
  },

  /**
   * Tür, Fenster oder Tor im 3D angetippt: Kontakt umschalten (offen/zu), Garagentor über seinen Antrieb (mit Nachfrage);
   * gedrückt halten öffnet den Demo-Dialog (Rollladen: Position, sonst offen/zu).
   */
  _demoOpening(hit, { long = false } = {}) {
    if (!this._demo || !hit) return;
    const floor = this._building?.floors.find((f) => f.id === hit.floorId);
    const o = floor?.openings?.find((x) => x.id === hit.id);
    if (!o) return;
    const l = this._links?.get(hit.floorId)?.get(hit.id) ?? {};
    const room = (floor.rooms ?? []).find((r) => r.id === o.room_id);
    const label = `${o.name || OPEN_NAMES[o.type] || "Öffnung"}${room?.name && !o.name ? ` ${room.name}` : ""}`;
    const contact = o.type === "garage" ? null : l.contact ?? null;
    const cover = l.cover ?? null;
    if (long) {
      const id = cover ?? contact;
      return id ? this._moreInfo(id) : null;
    }
    const id = contact ?? cover;
    if (!id) return this._toast(`Demo: ${label} lässt sich nicht öffnen.`);
    return this._runAction(id, { source: "tap", name: label, quiet: false });
  },

  /** Demo-Leiste unten (statt der Simulationsleiste): Hinweis, Uhrzeit-Regler, „Zurücksetzen“. Ohne Demo-Haus: weg. */
  _renderDemoBar() {
    const d = this._isDemo?.() ? this._demo : null;
    if (this._scene) this._scene.tapOpenings = !!d; // Türen und Fenster nur im Demo-Haus antippbar
    if (this._simBar?.classList.contains("demobar")) {
      this._simBar.remove();
      this._simBar = null;
    }
    this._els?.stage.classList.toggle("has-simbar", !!d || !!this._simBar);
    if (!d || !this._els) return;
    ensureStyle(this.shadowRoot, "demo", DEMO_STYLE); // auch nach einem Neuaufbau des Panels
    const el = document.createElement("div");
    el.className = "simbar demobar";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Demo");
    el.innerHTML = `<button class="dtag" title="Was geht im Demo-Haus?">DEMO</button><span class="dh">Keine echten Werte – alles simuliert, nichts geht an Home Assistant</span><span class="ds">keine echten Werte</span>
      <label>Uhrzeit <input type="range" min="-15" max="1440" step="15" data-d="time" value="${d.time ?? -15}"><span class="tv">${d.time === null ? "jetzt" : minutesText(d.time)}</span></label>
      <button data-d="reset" title="Alle Schaltzustände, die Uhrzeit und die PV-Vorschau zurücksetzen">Zurücksetzen</button>`;
    el.querySelector("[data-d=time]").addEventListener("input", (ev) => {
      const v = Number(ev.target.value);
      d.time = v < 0 ? null : Math.min(1439, v);
      el.querySelector(".tv").textContent = d.time === null ? "jetzt" : minutesText(d.time);
      d.tick();
    });
    el.querySelector("[data-d=reset]").addEventListener("click", () => {
      d.reset();
      this._renderDemoBar();
      this._toast("Demo: alles zurückgesetzt (Schaltzustände, Uhrzeit, PV-Vorschau).");
    });
    el.querySelector(".dtag").addEventListener("click", () => {
      const pv = d.model?.sources?.length ? "PV-Feld oder Aufständerung antippen stellt die Erzeugung ein." : "PV-Erzeugung: im Editor ein PV-Feld oder eine Aufständerung setzen.";
      this._toast(`Demo: Tippen schaltet, gedrückt halten zeigt Details. ${pv}`);
    });
    this._els.stage.appendChild(el);
    this._simBar = el; // Meldungen liegen darüber (_toast)
  },

  /**
   * PV-Dialog „PV-Erzeugung (Demo)“ einer Quelle (roof:<Feld>, item:<Etage>:<Möbel>, cfg:<Erzeuger>): Leistung von–bis,
   * Zeitfenster (Sonnenauf- bis -untergang oder fest), Vorschau-Kurve; die Vorschau wirkt sofort (nur dieser Browser),
   * „Speichern“ legt sie mit der Bearbeiten-PIN in settings.demo.pv ab (für alle Browser).
   */
  _demoPvDialog(key) {
    const d = this._demo;
    const src = key && d ? d.source(key) : null;
    if (!src) return this._toast("Demo: Hier gibt es keine PV-Erzeugung – PV-Feld (Dach-Ebene) oder Aufständerung im Editor setzen.");
    this._closePopup?.();
    this._closeDialog();
    const lang = this._hass?.locale?.language;
    const sun = d.sunTimes();
    const facts = [src.modules ? `${src.modules} Module` : "", src.kwp ? `${fmt(src.kwp, 2)} kWp` : "", src.dir ? `${DIRS[src.dir] ?? src.dir}${src.tilt !== null && src.tilt !== undefined ? `, ${src.tilt}°` : ""}` : ""].filter(Boolean).join(" · ") || (src.kind === "cfg" ? "Erzeuger aus der Energie-Einstellung" : src.group === "bkw" ? "Balkonkraftwerk" : "");
    const el = document.createElement("div");
    el.className = "dialog-backdrop";
    el.innerHTML = `<div class="dialog pvdemo" role="dialog" aria-label="PV-Erzeugung (Demo)">
      <div class="dialog-head"><span>PV-Erzeugung (Demo)</span><button class="icon close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="dialog-body">
        <div class="pvd-name"><b>${esc(src.name)}</b>${facts ? `<small>${esc(facts)}</small>` : ""}</div>
        <div class="pvd-now"></div>
        <div class="pvd-row"><label>Leistung von<span><input type="number" data-k="min" min="0" max="100000" step="10" inputmode="numeric"> W</span></label><label>bis<span><input type="number" data-k="max" min="0" max="100000" step="10" inputmode="numeric"> W</span></label></div>
        <p class="hint pvd-help">von = am Anfang und Ende des Zeitfensters, bis = Spitze zur Mitte</p>
        <label class="chkrow"><input type="checkbox" data-k="sun"> Sonnenauf- bis -untergang (${minutesText(sun.rise)}–${minutesText(sun.set)})</label>
        <div class="pvd-row"><label>Zeitfenster von<span><input type="time" data-k="from" step="300"></span></label><label>bis<span><input type="time" data-k="to" step="300"></span></label></div>
        <svg class="pvd-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vorschau der Tageskurve"></svg>
        <p class="pvd-err" role="alert" hidden></p>
        <p class="hint">Die Vorschau wirkt sofort im Haus (nur in diesem Browser). „Speichern“ gilt für alle Browser und braucht die Bearbeiten-PIN.</p>
        <div class="btns"><button data-a="std">Standard</button><button data-a="cancel">Abbrechen</button><button data-a="save" class="primary">Speichern</button></div>
      </div></div>`;
    const q = (k) => el.querySelector(`[data-k="${k}"]`);
    const errEl = el.querySelector(".pvd-err");
    const svg = el.querySelector("svg");
    let cur = d.pvConfig(key); // gezeigte Einstellung (Vorschau vor gespeichert vor Vorgabe)
    let saved = false;
    const fill = (c) => {
      const sunOn = c.from === null || c.to === null;
      q("min").value = String(c.min);
      q("max").value = String(c.max);
      q("sun").checked = sunOn;
      q("from").value = minutesText(c.from ?? sun.rise);
      q("to").value = minutesText(c.to ?? sun.set);
      q("from").disabled = q("to").disabled = sunOn;
    };
    const read = () => {
      const sunOn = q("sun").checked;
      return { min: numberOf(q("min").value), max: numberOf(q("max").value), from: sunOn ? null : minutesOf(q("from").value), to: sunOn ? null : minutesOf(q("to").value) };
    };
    // Tageskurve 0–24 Uhr (ohne Wolken), Zeitfenster hinterlegt, Strich „jetzt“ (Demo-Uhrzeit)
    const draw = () => {
      const c = cur;
      const from = c.from ?? sun.rise;
      const to = c.to ?? sun.set;
      const pts = d.curve(key, c, { clouds: false, step: 10 });
      const peak = Math.max(10, c.max, ...pts.map((p) => p[1]));
      const X = (m) => ((m / 1440) * W).toFixed(1);
      const Y = (w) => (TOP + (H - BOTTOM - TOP) * (1 - w / peak)).toFixed(1);
      const line = pts.map(([m, w], i) => `${i ? "L" : "M"}${X(m)} ${Y(w)}`).join(" ");
      const t = d.now();
      const nowM = (t - dayStart(t)) / 60000;
      const ticks = [0, 6, 12, 18, 24].map((h) => `<line class="tk" x1="${X(h * 60)}" x2="${X(h * 60)}" y1="${TOP}" y2="${H - BOTTOM}"/><text x="${X(h * 60)}" y="${H - 3}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${h}</text>`).join("");
      svg.innerHTML = `<rect class="win" x="${X(from)}" y="${TOP}" width="${Math.max(0, X(to) - X(from)).toFixed(1)}" height="${H - BOTTOM - TOP}"/>${ticks}<line class="base" x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/><path class="area" d="${line} L${W} ${Y(0)} L0 ${Y(0)} Z"/><path class="line" d="${line}"/><line class="now" x1="${X(nowM)}" x2="${X(nowM)}" y1="${TOP}" y2="${H - BOTTOM}"/><text x="3" y="${TOP + 8}">${esc(formatPower(peak, lang))}</text>`;
    };
    const showNow = () => {
      const s = d.pvStats(key);
      el.querySelector(".pvd-now").textContent = `Jetzt: ${formatPower(s.w, lang)} · Heute: ${fmt(s.kwh, 1)} kWh`;
    };
    // Eingabe: prüfen, Vorschau sofort ins Haus (nur dieser Browser)
    const update = () => {
      const c = read();
      q("from").disabled = q("to").disabled = q("sun").checked;
      const err = validateDemoPv(c);
      errEl.textContent = err ?? "";
      errEl.hidden = !err;
      if (err) return null;
      cur = c;
      d.setPreview(key, c); // → Takt → refresh (Kurve, Werte)
      return c;
    };
    this._demoPvView = {
      el,
      refresh: () => {
        if (!el.isConnected || this._demo !== d) return;
        draw();
        showNow();
      },
    };
    // Schließen ohne Speichern: Vorschau zurück (auch bei Esc und Tipp daneben)
    el._onClose = () => {
      if (this._demoPvView?.el === el) this._demoPvView = null;
      if (!saved && this._demo === d && !this._switching) d.setPreview(key, null);
    };
    el.querySelectorAll("input").forEach((i) => i.addEventListener(i.type === "checkbox" ? "change" : "input", update));
    el.querySelector('[data-a="std"]').addEventListener("click", () => {
      fill({ min: src.defaults?.min ?? 0, max: src.defaults?.max ?? 0, from: src.defaults?.from ?? null, to: src.defaults?.to ?? null });
      update();
    });
    el.querySelector('[data-a="cancel"]').addEventListener("click", () => this._closeDialog());
    el.querySelector(".close").addEventListener("click", () => this._closeDialog());
    el.addEventListener("click", (ev) => ev.target === el && this._closeDialog());
    el.querySelector('[data-a="save"]').addEventListener("click", async () => {
      const c = update();
      if (!c) return;
      if (!(await this._pinPad("edit", { title: "PV-Einstellung speichern", sub: src.name }))) return;
      if (this._demo !== d || !el.isConnected) return; // inzwischen Haus gewechselt oder geschlossen
      const demo = normalizeDemoSettings(this._building?.settings?.demo);
      demo.pv[key] = { min: c.min, max: c.max, from: c.from, to: c.to };
      const rev = this._revision;
      await this._saveBuildingSettings({ demo }, "Demo: PV-Einstellung gespeichert – gilt für alle Browser.");
      if (this._revision === rev || this._demo !== d) return; // nicht gespeichert (die Meldung kam schon)
      saved = true;
      d.setPreview(key, null); // gespeichert gilt jetzt, die Vorschau ist überflüssig
      if (this._dialog === el) this._closeDialog();
    });
    fill(cur);
    draw();
    showNow();
    this._els.stage.appendChild(el);
    this._dialog = el;
  },
};

export const DEMO_STYLE = `
.simbar.demobar { background: repeating-linear-gradient(135deg, #00897b 0 12px, #00796b 12px 24px); color: #fff; }
.demobar .dtag { background: none; padding: 0 2px; color: inherit; font-weight: 700; font-size: 13px; letter-spacing: .08em; }
.demobar .ds { display: none; }
.demobar input[type=range] { accent-color: #fff; }
.demobar .tv { min-width: 38px; font-variant-numeric: tabular-nums; }
@media (max-width: 600px) { .demobar .dh { display: none; } .demobar .ds { display: inline; } }
:host([narrow]) .demobar .dh { display: none; }
:host([narrow]) .demobar .ds { display: inline; }
.pvdemo .pvd-name { display: flex; flex-direction: column; margin: 10px 0 2px; }
.pvdemo .pvd-name small { color: var(--secondary-text-color); }
.pvdemo .pvd-now { font-weight: 500; margin: 4px 0 6px; }
.pvdemo .pvd-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 0; }
.pvdemo .pvd-row label { flex: 1; min-width: 130px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--secondary-text-color); }
.pvdemo .pvd-row label span { display: flex; align-items: center; gap: 6px; color: var(--primary-text-color); }
.pvdemo input[type=number], .pvdemo input[type=time] { flex: 1; min-width: 0; font: inherit; padding: 7px; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: var(--primary-background-color, #fff); color: var(--primary-text-color); }
.pvdemo input:disabled { opacity: .55; }
.pvdemo .pvd-help { margin-top: 4px; }
.pvdemo svg { display: block; width: 100%; height: auto; margin: 10px 0 0; color: var(--secondary-text-color); }
.pvdemo svg .win { fill: rgba(0,137,123,.15); }
.pvdemo svg .tk { stroke: currentColor; stroke-opacity: .25; stroke-width: .6; }
.pvdemo svg .base { stroke: currentColor; stroke-opacity: .5; stroke-width: .8; }
.pvdemo svg .area { fill: rgba(249,168,37,.28); }
.pvdemo svg .line { fill: none; stroke: #f9a825; stroke-width: 1.8; stroke-linejoin: round; }
.pvdemo svg .now { stroke: #e53935; stroke-width: 1.2; }
.pvdemo svg text { fill: currentColor; font-size: 9px; }
.pvdemo .pvd-err { color: var(--error-color, #db4437); font-size: 13px; margin: 8px 0 0; }
`;
