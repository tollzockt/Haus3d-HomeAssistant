// Hinweise (Mixin für Haus3DPanel): auswerten (alerts.js), Banner, Glocke und Zeile am Raumnamen, Ausblenden.

import { evaluateAlerts, visibleAlerts } from "./alerts.js";
import { weatherKind } from "./exterior.js";
import { esc, setText } from "./panel-util.js";

export const AlertMethods = {
  /** Ausgeblendete Hinweise (dieses Gerät): {key: Zeitpunkt}. */
  _alertAck(next) {
    try {
      if (next) localStorage.setItem(this._hk("haus3d.alerts.ack"), JSON.stringify(next));
      return next ?? JSON.parse(localStorage.getItem(this._hk("haus3d.alerts.ack")) || "{}") ?? {};
    } catch {
      return next ?? this._ackMem ?? {};
    }
  },

  /**
   * Hinweise auswerten (alerts.js) und anzeigen: Banner, Glocke, Zeile am Raumnamen, Bodenfarbe.
   * Neu gezeichnet wird nur, wenn sich die Hinweise ändern.
   * @returns {Map<string, string>} Raum → Stufe (für die Bodenfarbe)
   */
  _evalAlerts(energy) {
    const hass = this._hass;
    const weather = weatherKind(this._weatherRef ?? null).kind;
    this._smartStep();
    const res = evaluateAlerts({
      building: this._building, hass, byArea: this._byArea, links: this._links, places: this._places ?? new Map(), exterior: this._exterior ?? new Set(),
      weather, energy, now: Date.now(), cfg: this._building.settings?.alerts, humidityMax: Number(this._building.settings?.climate?.humidity_max) || 65,
    });
    this._needTick("alerts", res.pending);
    // Alltag: Gerät fertig, Müll, Lüften, Schimmel; Aktionen (Heizung pausieren …)
    res.alerts.push(...this._smartAlerts(res.alerts));
    const order = { critical: 0, warn: 1, info: 2 };
    res.alerts.sort((a, b) => order[a.level] - order[b.level]);
    // Ausblenden gilt, bis der Hinweis verschwindet (dann darf er wiederkommen)
    let ack = this._alertAck();
    const keys = new Set(res.alerts.map((a) => a.key));
    const pruned = Object.fromEntries(Object.entries(ack).filter(([k]) => keys.has(k)));
    if (Object.keys(pruned).length !== Object.keys(ack).length) ack = this._alertAck(pruned);
    const visible = visibleAlerts(res.alerts, ack);
    this._alerts = res.alerts;
    this._visibleAlerts = visible;
    const rooms = new Map();
    for (const a of visible) {
      if (!a.roomId) continue;
      const k = `${a.floorId}:${a.roomId}`;
      if (!rooms.has(k) || a.level === "critical") rooms.set(k, a.level);
    }
    const sig = visible.map((a) => a.key).join("|");
    if (sig !== this._alertSig) {
      this._alertSig = sig;
      this._renderAlerts();
    }
    return rooms;
  },

  /** Banner oben, Glocke in der Statusleiste, Zeile am Raumnamen. */
  _renderAlerts() {
    const list = this._visibleAlerts ?? [];
    // Raumnamen
    for (const ov of this._overlays.values()) {
      if (!ov.parts) continue;
      const mine = list.filter((x) => ov.room && x.roomId === ov.room.id && ov.floorId === x.floorId);
      const a = mine[0];
      setText(ov.parts.alarm, a ? `${a.text}${mine.length > 1 ? ` (+${mine.length - 1})` : ""}` : "");
      ov.label.classList.toggle("alarm", !!a);
      ov.label.classList.toggle("crit", a?.level === "critical");
    }
    // Hinweis (Warnung/kritisch) weckt das ruhende oder gedimmte Tablet und zeigt den Raum
    const top = list[0];
    if (top && top.level !== "info" && (this._idle || this._dimmer)) {
      this._wake();
      if (top.roomId) setTimeout(() => this._showAlert(top), 0);
    }
    // Banner (Karten rücken auf schmalen Bildschirmen darunter)
    this._alertBar?.remove();
    this._alertBar = null;
    this._els.stage.classList.toggle("alerting", list.length > 0);
    if (list.length) {
      const a = list[0];
      const el = document.createElement("div");
      el.className = `alertbar ${a.level}`;
      el.setAttribute("role", "alert");
      el.innerHTML = `<ha-icon icon="${esc(a.icon)}"></ha-icon><span class="at"></span>${list.length > 1 ? `<button class="more" title="Alle Hinweise">+${list.length - 1}</button>` : ""}${a.action ? `<button class="act">${esc(a.action.label)}</button>` : ""}${a.roomId ? `<button class="show">Zeigen</button>` : ""}<button class="ack" title="Ausblenden, bis sich etwas ändert">Ausblenden</button>`;
      el.querySelector(".at").textContent = a.text;
      el.querySelector(".show")?.addEventListener("click", () => this._showAlert(a));
      el.querySelector(".act")?.addEventListener("click", () => this._alertAction(a));
      el.querySelector(".ack").addEventListener("click", () => this._ackAlert(a));
      el.querySelector(".more")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._alertsPopup();
      });
      this._els.stage.appendChild(el);
      this._alertBar = el;
    }
    // Glocke
    const box = this._els?.chips;
    let bell = this._els?.status?.querySelector(".bell");
    if (!list.length) bell?.remove();
    else {
      if (!bell) {
        bell = document.createElement("button");
        bell.className = "chip bell";
        bell.innerHTML = `<ha-icon icon="mdi:bell-ring-outline"></ha-icon><span></span>`;
        bell.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._alertsPopup();
        });
        box?.parentElement.insertBefore(bell, box);
      }
      bell.classList.toggle("crit", list.some((x) => x.level === "critical"));
      bell.querySelector("span").textContent = String(list.length);
      bell.title = `${list.length} Hinweis${list.length > 1 ? "e" : ""}`;
    }
  },

  _showAlert(a) {
    this._closePopup();
    if (!a.roomId) return;
    this._setFilter(a.floorId);
    this._selectRoom({ floorId: a.floorId, roomId: a.roomId });
  },

  _ackAlert(a) {
    const ack = this._alertAck();
    ack[a.key] = Date.now();
    this._alertAck(ack);
    this._alertSig = null;
    this._closePopup();
    this._updateStates();
  },
};
