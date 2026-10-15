// Info-Hologramme (Mixin für das Panel): Ist ein Raum angetippt, schweben über seinen Möbeln und Geräten mit
// hinterlegten Werten (Editor → Gegenstand → „Info-Hologramm“) leuchtende Tafeln mit Live-Werten. Sie
// verschwinden beim Tipp ins Leere, beim Etagenwechsel, wenn die Kamera weiterzieht, beim Begehen und im
// Editor bzw. Ruhemodus (dort werden die Raumfenster ohnehin geschlossen).

import * as THREE from "./vendor/three.module.min.js";
import { furnitureTopY } from "./furniture.js";
import { holoItems, holoRows, holoTitle } from "./holo.js";
import { placesOf } from "./devices.js";
import { esc, setText } from "./panel-util.js";

const HOLD_MS = 1500; // nach dem Anfliegen erst später auf Wegdrehen prüfen

export const HoloMethods = {
  /** Tafeln für einen Raum zeigen (ersetzt vorherige). */
  _holoShow(floorId, roomId) {
    this._holoClear({ rewatch: false });
    if (!this._building || !this._scene || this._scene.isWalking?.()) return this._rewatch?.();
    const floor = this._building.floors.find((f) => f.id === floorId);
    const items = holoItems(floor, roomId);
    if (!items.length) return this._rewatch?.();
    const place = placesOf(floor).find((r) => r.id === roomId);
    const xs = place.points.map((p) => p[0]);
    const zs = place.points.map((p) => p[1]);
    const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    const radius = Math.max(3, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)));
    this._holo = { floorId, roomId, ids: items.map((m) => m.id), center, radius, at: Date.now() };
    this._holoBuild();
    this._rewatch?.(); // Werte der Tafeln mit beobachten
  },

  /** Tafeln (neu) aufbauen – auch nach dem Neuaufbau aller Beschriftungen. */
  _holoBuild() {
    const h = this._holo;
    if (!h || !this._scene) return;
    const floor = this._building?.floors.find((f) => f.id === h.floorId);
    if (!floor) return this._holoClear();
    for (const m of (floor.furniture ?? []).filter((x) => h.ids.includes(x.id))) {
      const key = `holo:${floor.id}:${m.id}`;
      const old = this._overlays.get(key);
      if (old?.el.isConnected) continue; // steht schon (sonst begänne das Einblenden von vorn)
      old?.el.remove();
      const fh = floor.height ?? 2.5;
      const top = floor.elevation + furnitureTopY(m, fh); // Oberkante des Modells (geneigt: höchste Ecke)
      const el = document.createElement("div");
      el.className = "holo";
      // Schrank: die Geräte darin stehen mit in der Tafel, je Gerät eine Zwischenzeile
      let group = null;
      const lines = holoRows(m, this._hass, floor)
        .map((r) => {
          const sub = r.group && r.group !== group ? `<div class="holosub">${esc(r.group)}</div>` : "";
          group = r.group ?? null;
          return `${sub}<button class="hololine" data-entity="${esc(r.entity)}"><span>${esc(r.name)}</span><b>${esc(r.value)}</b></button>`;
        })
        .join("");
      el.innerHTML = `<div class="holocard" role="group" aria-label="${esc(holoTitle(m))}"><div class="holohead">${esc(holoTitle(m))}</div>${lines}</div>`;
      el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-entity]");
        if (b) this._moreInfo(b.dataset.entity);
      });
      this._els.overlay.appendChild(el);
      this._overlays.set(key, { el, floorId: floor.id, position: new THREE.Vector3(m.x, top + 0.3, m.z), holo: m.id });
    }
    this._positionOverlays();
  },

  /** Werte aktualisieren (bei jedem Zustandswechsel). */
  _holoUpdate() {
    const h = this._holo;
    if (!h) return;
    const floor = this._building?.floors.find((f) => f.id === h.floorId);
    for (const m of (floor?.furniture ?? []).filter((x) => h.ids.includes(x.id))) {
      const ov = this._overlays.get(`holo:${floor.id}:${m.id}`);
      if (!ov) continue;
      const lines = ov.el.querySelectorAll(".hololine b");
      holoRows(m, this._hass, floor).forEach((r, i) => lines[i] && setText(lines[i], r.value));
    }
  },

  _holoClear({ rewatch = true } = {}) {
    if (!this._holo) return;
    for (const [key, ov] of [...this._overlays]) {
      if (!key.startsWith("holo:")) continue;
      ov.el.remove();
      this._overlays.delete(key);
    }
    this._holo = null;
    if (rewatch) this._rewatch?.();
  },

  /** Beobachtete Entitäten der gezeigten Tafeln. */
  _holoIds() {
    const h = this._holo;
    if (!h) return [];
    const floor = this._building?.floors.find((f) => f.id === h.floorId);
    return (floor?.furniture ?? []).filter((m) => h.ids.includes(m.id)).flatMap((m) => holoRows(m, null, floor).map((r) => r.entity));
  },

  /** Kamera weitergezogen oder Begehen? Dann ausblenden. */
  _holoCheck() {
    const h = this._holo;
    if (!h || !this._scene) return;
    if (this._scene.isWalking?.()) return this._holoClear();
    if (Date.now() - h.at < HOLD_MS) return;
    const t = this._scene.getView?.().target;
    if (t && Math.hypot(t[0] - h.center[0], t[2] - h.center[1]) > h.radius * 1.5) this._holoClear();
  },
};

export const HOLO_STYLE = `
.holo { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 3; }
.holocard { position: absolute; left: 0; bottom: 18px; transform: translateX(-50%); min-width: 150px; max-width: 240px; padding: 8px 10px 6px; border-radius: 10px; pointer-events: auto;
  color: #dffbff; background: linear-gradient(180deg, rgba(10, 40, 60, .78), rgba(4, 22, 36, .72)), repeating-linear-gradient(0deg, rgba(120, 230, 255, .07) 0 1px, transparent 1px 3px);
  border: 1px solid rgba(110, 230, 255, .7); box-shadow: 0 0 14px rgba(70, 210, 255, .45), inset 0 0 18px rgba(70, 210, 255, .18); backdrop-filter: blur(3px);
  text-shadow: 0 0 6px rgba(120, 230, 255, .6); font-size: 12px; animation: holo-in .35s ease-out; transform-origin: 50% 100%; }
.holo::after { content: ""; position: absolute; left: -1px; bottom: 0; width: 2px; height: 18px; background: linear-gradient(0deg, rgba(110, 230, 255, 0), rgba(110, 230, 255, .9)); box-shadow: 0 0 6px rgba(110, 230, 255, .8); }
.holohead { font-weight: 700; letter-spacing: .04em; text-transform: uppercase; font-size: 11px; color: #9ff1ff; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.holosub { margin-top: 5px; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #9ff1ff; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hololine { display: flex; gap: 10px; justify-content: space-between; align-items: baseline; width: 100%; padding: 2px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; min-height: 22px; }
.hololine span { opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hololine b { font-variant-numeric: tabular-nums; white-space: nowrap; color: #fff; }
.hololine:hover b { text-decoration: underline; }
:host([cyber]) .holocard { border-color: rgba(255, 64, 200, .75); box-shadow: 0 0 16px rgba(255, 64, 200, .45), inset 0 0 18px rgba(0, 240, 255, .2); }
:host([cyber]) .holohead { color: #ff8be0; }
.holo.hidden-behind { opacity: .35 !important; }
@keyframes holo-in { from { opacity: 0; transform: translateX(-50%) scale(.85) translateY(6px); } to { opacity: 1; transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .holocard { animation: none; } }
`;
