// Unterstützen und Entwickler-Instanz (Mixin für Haus3DPanel). Haus 3D bleibt kostenlos: Spenden sind
// freiwillig (Zeile im Zahnrad, ein einziger dezenter Hinweis nach 14 Tagen). Die Entwickler-Instanz
// (Haus-Symbol unten rechts in den Admin-Einstellungen, Code wird im Backend als Hash geprüft) blendet
// das Spendenfeld aus und zeigt Entwickler-Infos – sie schaltet keine bezahlten Funktionen frei.

import { HOUSE_KEY, withToken } from "./access.js";
import { SUPPORT_LINKS, esc, loadSettings } from "./panel-util.js";

const HINT_AFTER_MS = 14 * 86400000;
const LS_FIRST = "haus3d.firstSeen";
const LS_HINTED = "haus3d.supportHinted";
// Version und Frontend-Stand aus der eigenen Adresse (…/haus3d_static/<version>/…)
const BUILD = (() => {
  try {
    return new URL(import.meta.url).pathname.split("/").at(-2) ?? "";
  } catch {
    return "";
  }
})();

/** Links mit URL (leere werden nicht gezeigt). */
export const supportLinks = (links = SUPPORT_LINKS) => links.filter((l) => typeof l[2] === "string" && /^https:\/\//.test(l[2]));

/** Soll der einmalige Hinweis jetzt kommen? */
export function supportHintDue({ firstSeen, hinted, now = Date.now(), kiosk = false, dev = false, links = supportLinks() }) {
  if (kiosk || dev || hinted || !links.length) return false;
  return Number.isFinite(firstSeen) && now - firstSeen >= HINT_AFTER_MS;
}

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

export const SupportMethods = {
  /** Entwickler-Status vom Backend (einmal, dann gemerkt). */
  async _loadDev() {
    if (this._devLoaded) return this._dev;
    try {
      const st = await this._hass.callWS({ type: "haus3d/pin/status" });
      this._dev = st?.dev === true;
    } catch {
      this._dev = false;
    }
    this._devLoaded = true;
    return this._dev;
  },

  /** Nach dem Laden: ersten Besuch merken, nach 14 Tagen einmal dezent hinweisen. */
  async _supportHintCheck() {
    const now = Date.now();
    let first = Number(ls.get(LS_FIRST));
    if (!first) {
      ls.set(LS_FIRST, String(now));
      first = now;
    }
    const kiosk = this.hasAttribute("kiosk") || !!this._kioskUrl;
    if (!supportHintDue({ firstSeen: first, hinted: ls.get(LS_HINTED) === "1", now, kiosk, dev: false })) return;
    if (await this._loadDev()) return;
    ls.set(LS_HINTED, "1");
    this._toastAction?.("Gefällt dir Haus 3D? Es bleibt kostenlos – über eine Spende freue ich mich.", "Unterstützen", () => this._supportDialog());
  },

  /** Zeile im Zahnrad (leer in der Entwickler-Instanz oder ohne Links). */
  _supportRow() {
    if (this._dev || !supportLinks().length) return "";
    return `<button class="supportrow"><ha-icon icon="mdi:heart"></ha-icon><span>Haus 3D unterstützen</span><ha-icon class="go" icon="mdi:chevron-right"></ha-icon></button>`;
  },

  _supportDialog() {
    this._closePopup?.();
    this._closeDialog();
    const el = document.createElement("div");
    el.className = "dialog-backdrop sheet-backdrop";
    el.innerHTML = `<div class="dialog sheet supportdlg" role="dialog" aria-label="Unterstützen"><div class="dialog-head"><span>Haus 3D unterstützen</span><button class="icon close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="dialog-body">
        <p>Haus 3D ist kostenlos und bleibt es. Entwickelt in der Freizeit – wenn es dir gefällt, hilft eine kleine Spende, dass es weitergeht.</p>
        <div class="slinks">${supportLinks().map(([k, name, url, icon]) => `<a class="slink" data-k="${k}" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><ha-icon icon="${icon}"></ha-icon><span>${esc(name)}</span></a>`).join("")}</div>
        <p class="hint">Später gibt es optionale Zusatzpakete; alles, was es heute gibt, bleibt frei.</p>
      </div></div>`;
    el.querySelector(".close").addEventListener("click", () => this._closeDialog());
    el.addEventListener("click", (ev) => ev.target === el && this._closeDialog());
    this._els.stage.appendChild(el);
    this._dialog = el;
  },

  /** Haus-Symbol in den Admin-Einstellungen: Code eingeben, Instanz als Entwickler bestätigen. */
  async _devConfirm(onDone) {
    const ok = await this._pinPad("dev", {
      title: "Entwickler-Instanz",
      sub: "Code eingeben",
      icon: "mdi:home-heart",
      verify: async (code) => (await this._hass.callWS(withToken({ type: "haus3d/dev/set", code }))).ok === true,
    });
    if (!ok) return;
    this._dev = true;
    this._devLoaded = true;
    this._toast("Entwickler-Instanz bestätigt – kein Spendenfeld mehr.");
    onDone?.();
  },

  /** Admin → Entwickler. */
  _renderDevConfig(box, onClear) {
    const st = this._settings;
    const q = this._scene?.quality;
    box.innerHTML = `<div class="devinfo">
        <div><span>Frontend-Stand</span><b>${esc(BUILD || "–")}</b></div>
        <div><span>Qualität</span><b>${esc(st.quality)}${q ? ` · Auflösung ${Math.round((q.pixelRatio ?? 1) * 100) / 100}` : ""}</b></div>
        <div><span>Etagen / Räume</span><b>${this._building?.floors.length ?? 0} / ${this._building?.floors.reduce((n, f) => n + (f.rooms?.length ?? 0), 0) ?? 0}</b></div>
        <div><span>Beobachtete Entitäten</span><b>${this._watched?.size ?? this._watched?.length ?? "–"}</b></div>
      </div>
      <label class="chkrow"><input type="checkbox" data-perfhud${st.perfHud ? " checked" : ""}> Leistungsanzeige (Bilder/s)</label>
      <div class="btns left"><button data-dev="sim"><ha-icon icon="mdi:test-tube"></ha-icon> Simulation ${this._sim ? "beenden" : "starten"}</button><button data-dev="hint"><ha-icon icon="mdi:heart-outline"></ha-icon> Spenden-Hinweis zurücksetzen</button></div>
      <h4><ha-icon icon="mdi:flask-outline"></ha-icon> Testhaus</h4>
      <div class="testhaus"><p class="muted">lädt …</p></div>
      <div class="btns"><button data-dev="clear" class="danger">Entwickler-Instanz aufheben</button></div>`;
    this._renderTestHouses(box.querySelector(".testhaus"));
    box.querySelector("[data-perfhud]").addEventListener("change", (ev) => {
      st.perfHud = ev.target.checked;
      this._saveSettings();
      this._applyQuality?.();
    });
    box.querySelector('[data-dev="sim"]').addEventListener("click", () => {
      this._closeDialog();
      this._setSim(!this._sim);
    });
    box.querySelector('[data-dev="hint"]').addEventListener("click", () => {
      ls.set(LS_HINTED, "");
      this._toast("Hinweis zurückgesetzt (erscheint nicht in der Entwickler-Instanz).");
    });
    box.querySelector('[data-dev="clear"]').addEventListener("click", async () => {
      try {
        await this._callLocked({ type: "haus3d/dev/clear" }, "admin");
        this._dev = false;
        this._toast("Entwickler-Instanz aufgehoben.");
        onClear?.();
      } catch (e) {
        this._toast(`Fehlgeschlagen: ${e.message ?? e.code ?? e}`);
      }
    });
  },
};

// ------------------------------------------------------------------ Testhaus (Entwickler)

/** Schlüssel im Browser-Speicher je Haus (Ansichten, Favoriten, Lüften): im Testhaus mit Kennung. */
SupportMethods._hk = function (key) {
  return this._house ? `${key}.${this._house.id}` : key;
};

/**
 * Testhaus wechseln (null = mein Haus): nur dieser Browser, das echte Haus bleibt unverändert.
 * Vorher wird alles abgebrochen, was noch zum alten Haus gehört (offene Nachfragen, PIN-Feld, Fenster,
 * Thermostat-Timer, Editor); bis der neue Grundriss geladen ist, wird nichts gespeichert.
 */
SupportMethods._switchHouse = async function (house) {
  if (this._switching) return false;
  if (this._editor?.dirty) {
    if (!(await this._confirm("Ungespeicherte Änderungen im Editor verwerfen?", "Verwerfen", { danger: true }))) return false;
    this._editor?.clearDraft?.(); // verworfen heißt verworfen – kein Entwurf zum „Fortsetzen“
  }
  this._switching = true;
  try {
    this._houseCleanup();
    if (this._sim) await this._setSim(false);
    this._house = house ? { id: house.id, name: house.name, live: !!house.live } : null;
    ls.set(HOUSE_KEY, this._house ? JSON.stringify(this._house) : "");
    this._houseEpoch = (this._houseEpoch ?? 0) + 1;
    this._filter = ls.get(this._hk("haus3d.filter")) || "all"; // Etage je Haus
    // Anzeige-Einstellungen je Haus (Testhaus beginnt mit einer Kopie der echten)
    this._settingsKey = this._hk("haus3d.settings");
    this._settings = loadSettings(ls.get(this._settingsKey) ?? ls.get("haus3d.settings"), ls.get("haus3d.style"));
    this._applyStyle?.();
    this._applyQuality?.();
    this._applyKiosk?.();
    this._scene?.setLayers(this._settings.layers);
    this._applyOverlayLayers?.();
    this._favSig = null; // Favoriten des anderen Hauses
    this._alertSig = null;
    if (this._realHass) this.hass = this._realHass; // neue Hülle (Testhaus bzw. echt)
    await this._load();
  } finally {
    this._switching = false;
    this._renderModes?.();
  }
  this._renderFavs?.();
  if (this._buildingHouse !== (this._house?.id ?? null)) return true; // Laden fehlgeschlagen: Meldung kommt von _load, Speichern bleibt gesperrt
  this._toast(this._house ? `Testhaus „${this._house.name}“ – dein Haus bleibt unverändert.` : "Zurück in deinem Haus.");
  return true;
};

/**
 * Alles abbrechen, was noch zum bisherigen Haus gehört: Nachfrage, PIN-Feld, Fenster, Raumfenster,
 * Thermostat-Timer, Zeitstrahl, Editor, ausstehender Benutzerdaten-Abgleich. Danach wird nichts davon
 * mehr ausgeführt (gemeinsam für den Wechsel und den Rücksprung, wenn ein Testhaus gelöscht wurde).
 */
SupportMethods._houseCleanup = function () {
  this._stopWalk?.(); // zuerst, solange noch das alte Haus gilt (Etage wird zurückgestellt)
  this._houseEpoch = (this._houseEpoch ?? 0) + 1;
  this._titleCancel?.();
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
};

/** Testhaus ohne „echt schalten“: Gerät nur ansehen (statt des HA-Dialogs, der schalten könnte). */
SupportMethods._infoDialog = function (entityId) {
  const st = this._hass?.states?.[entityId];
  this._closeDialog?.();
  const el = document.createElement("div");
  el.className = "dialog-backdrop";
  const attrs = Object.entries(st?.attributes ?? {}).filter(([k, v]) => k !== "friendly_name" && v !== null && typeof v !== "object").slice(0, 16);
  el.innerHTML = `<div class="dialog infodlg" role="dialog" aria-label="Gerät">
    <div class="dialog-head"><span>${esc(st?.attributes?.friendly_name ?? entityId)}</span><button class="icon close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <div class="dialog-body"><p class="hint">Testhaus: nur ansehen – geschaltet wird hier nichts („Geräte echt schalten“ im Entwickler-Fenster).</p>
      <div class="devinfo"><div><span>Entität</span><b>${esc(entityId)}</b></div><div><span>Zustand</span><b>${esc(st ? (this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state) : "–")}</b></div>
      ${attrs.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("")}</div></div></div>`;
  el.querySelector(".close").addEventListener("click", () => this._closeDialog());
  el.addEventListener("click", (ev) => ev.target === el && this._closeDialog());
  this._els.stage.appendChild(el);
  this._dialog = el;
};

/** Im Testhaus ohne „Geräte echt schalten“: kurz melden statt schalten (höchstens alle 4 s). */
SupportMethods._houseBlocked = function (what) {
  const now = Date.now();
  if (now - (this._houseBlockedAt ?? 0) < 4000) return;
  this._houseBlockedAt = now;
  if (["haus3d/pin/set", "haus3d/dev/clear", "haus3d/dev/set", "haus3d/away/set"].includes(what)) return this._toast("PINs, Entwickler-Instanz und Urlaub gelten für dein echtes Haus – dafür erst „Mein Haus“ öffnen.");
  if (/^config\//.test(what)) return this._toast("Im Testhaus wird nichts in Home Assistant angelegt oder gelöscht (Szenen …).");
  this._toast(`Testhaus: ${what} nicht geschaltet – „Geräte echt schalten“ im Entwickler-Fenster.`);
};

/** Abschnitt „Testhaus“ im Entwickler-Fenster: Liste, Öffnen, Löschen, Anlegen, Geräte echt schalten. */
SupportMethods._renderTestHouses = async function (box) {
  let houses = [];
  try {
    ({ houses } = await this._hass.callWS({ type: "haus3d/sandbox/list" }));
  } catch (e) {
    box.innerHTML = `<p class="muted">Testhäuser nicht verfügbar: ${esc(e.message ?? e.code ?? e)}</p>`;
    return;
  }
  const cur = this._house;
  box.innerHTML = `<p class="hint">Ein eigenes Haus nur zum Ausprobieren: Grundriss, Einstellungen, Bauplan-Fotos, Ansichten und Favoriten liegen getrennt – an deinem Haus ändert sich nichts. Gilt nur in diesem Browser, andere Tablets zeigen weiter dein Haus. PINs, Entwickler-Instanz und Urlaub gehören zum echten Haus und lassen sich im Testhaus nicht ändern.</p>
    <div class="threw ${cur ? "" : "sel"}"><ha-icon icon="mdi:home"></ha-icon><span><b>Mein Haus</b><small>${cur ? "" : "gerade geöffnet"}</small></span>${cur ? `<button data-th="real" class="primary">Öffnen</button>` : ""}</div>
    ${houses.map((h) => `<div class="threw ${cur?.id === h.id ? "sel" : ""}" data-id="${esc(h.id)}"><ha-icon icon="mdi:flask-outline"></ha-icon><span><b>${esc(h.name)}</b><small>${h.floors} Etagen · ${h.rooms} Räume${cur?.id === h.id ? " · gerade geöffnet" : ""}</small></span>${cur?.id === h.id ? "" : `<button data-th="open">Öffnen</button>`}<button class="icon" data-th="del" title="Löschen"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>`).join("")}
    ${houses.length < 5 ? `<div class="thnew"><input class="thname" maxlength="40" placeholder="Name, z. B. Spielwiese" value="Testhaus ${houses.length + 1}"><select class="thsrc"><option value="example">Beispielhaus</option><option value="current">Kopie meines Hauses</option><option value="empty">leer</option></select><button data-th="new" class="primary">Anlegen</button></div>` : `<p class="muted">Höchstens 5 Testhäuser – erst eins löschen.</p>`}
    <label class="chkrow"><input type="checkbox" data-th="live"${cur?.live ? " checked" : ""}${cur ? "" : " disabled"}> Im Testhaus Geräte echt schalten (Lichter, Rollläden, Türen, Heizung pausieren – sonst geht nichts an Home Assistant; Szenen, PINs und Urlaub nie)</label>`;
  const busy = (on) => box.querySelectorAll("button, select, input").forEach((b) => (b.disabled = on)); // kein Doppelklick
  // kam der Wechsel nicht zustande (abgebrochen, Wechsel läuft schon): Fenster wieder bedienbar machen
  const go = async (target) => {
    busy(true);
    if (!(await this._switchHouse(target)) && box.isConnected) this._renderTestHouses(box);
  };
  box.querySelector('[data-th="real"]')?.addEventListener("click", () => go(null));
  box.querySelectorAll(".threw[data-id]").forEach((row) => {
    const h = houses.find((x) => x.id === row.dataset.id);
    row.querySelector('[data-th="open"]')?.addEventListener("click", () => go({ id: h.id, name: h.name, live: false }));
    row.querySelector('[data-th="del"]').addEventListener("click", async () => {
      if (!(await this._confirm(`Testhaus „${h.name}“ löschen? Dein Haus bleibt unverändert.`, "Löschen", { danger: true }))) return;
      busy(true);
      // gerade geöffnet: erst zurück in mein Haus – klappt das nicht (Editor-Änderungen behalten), nicht löschen
      if (this._house?.id === h.id && !(await this._switchHouse(null))) {
        if (box.isConnected) this._renderTestHouses(box);
        return;
      }
      try {
        await this._callLocked({ type: "haus3d/sandbox/delete", house: h.id }, "admin");
        this._toast(`Testhaus „${h.name}“ gelöscht.`);
      } catch (e) {
        this._toast(`Fehlgeschlagen: ${e.message ?? e.code ?? e}`);
      }
      this._renderTestHouses(box);
    });
  });
  box.querySelector('[data-th="new"]')?.addEventListener("click", async () => {
    const name = box.querySelector(".thname").value.trim() || "Testhaus";
    const source = box.querySelector(".thsrc").value;
    busy(true);
    try {
      const res = await this._callLocked({ type: "haus3d/sandbox/create", name, source }, "admin");
      if (!(await this._switchHouse({ id: res.house, name, live: false }))) {
        this._toast(`Testhaus „${name}“ angelegt, aber nicht geöffnet.`);
        if (box.isConnected) this._renderTestHouses(box);
      }
    } catch (e) {
      this._toast(`Fehlgeschlagen: ${e.message ?? e.code ?? e}`);
      this._renderTestHouses(box);
    }
  });
  box.querySelector('[data-th="live"]').addEventListener("change", (ev) => {
    if (!this._house) return;
    this._house = { ...this._house, live: ev.target.checked };
    ls.set(HOUSE_KEY, JSON.stringify(this._house));
    if (this._realHass) this.hass = this._realHass;
    this._renderModes?.();
    this._toast(ev.target.checked ? "Testhaus: Geräte werden echt geschaltet." : "Testhaus: nichts geht an Home Assistant.");
  });
};

export const SUPPORT_STYLE = `
.supportrow { display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 12px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--divider-color, rgba(127,127,127,.3)); background: transparent; color: var(--primary-text-color); font: inherit; cursor: pointer; text-align: left; }
.supportrow > ha-icon:first-child { color: #e91e63; }
.supportrow span { flex: 1; }
.supportrow .go { color: var(--secondary-text-color); }
.supportdlg .slinks { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 12px 0; }
.supportdlg .slink { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: 14px; border: 1px solid var(--divider-color, rgba(127,127,127,.35)); color: var(--primary-text-color); text-decoration: none; font-weight: 600; }
.supportdlg .slink:hover { background: rgba(127,127,127,.1); }
.admin .devbtn { position: absolute; right: 14px; bottom: 12px; width: 34px; height: 34px; border-radius: 50%; border: 0; background: transparent; color: var(--secondary-text-color); opacity: .45; cursor: pointer; --mdc-icon-size: 20px; }
.admin .devbtn:hover { opacity: .9; }
.admin .devbtn.on { color: #43a047; opacity: .9; }
.admin .dialog-body { position: relative; padding-bottom: 52px; }
.devinfo { display: grid; gap: 4px; margin-bottom: 10px; }
.devinfo div { display: flex; justify-content: space-between; gap: 12px; }
.devinfo span { color: var(--secondary-text-color); }
.catbox h4 { display: flex; align-items: center; gap: 6px; margin: 16px 0 6px; }
.testhaus .threw { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--divider-color, rgba(127,127,127,.3)); margin-bottom: 6px; }
.testhaus .threw.sel { border-color: #7e57c2; background: rgba(126,87,194,.1); }
.testhaus .threw > span { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.testhaus .threw small { color: var(--secondary-text-color); }
.testhaus .threw button { font: inherit; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; padding: 6px 12px; cursor: pointer; }
.testhaus .threw button.primary { background: var(--primary-color, #03a9f4); color: #fff; border-color: transparent; }
.testhaus .threw button.icon { border: 0; padding: 6px; }
.testhaus .thnew { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.testhaus .thnew input { flex: 1; min-width: 140px; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: var(--primary-background-color, #fff); color: inherit; }
.testhaus .thnew select { font: inherit; padding: 8px; border-radius: 8px; }
.testhaus .thnew button { font: inherit; border: 0; border-radius: 10px; padding: 8px 14px; background: var(--primary-color, #03a9f4); color: #fff; cursor: pointer; }
`;
