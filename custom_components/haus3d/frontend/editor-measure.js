// Maße im Editor (Mixin für FloorEditor): Kantenlängen am Plan, Schalter „Maße“ für alle Räume,
// Werkzeug „Messen“ (bis zu 3 Strecken, nicht gespeichert), Länge/Breite/Tiefe eintippen, Flächenliste.

import { edgeDimensions, floorVertices, isAxisRect, nearestEdge, projectOnSegment, setEdgeLength, setRectSize, snapPoint } from "./edit-ops.js";
import { signedArea } from "./walls.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const de = (v, d = 2) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

export const MeasureMethods = {
  /** Kantenlängen: gewählter Raum, mit „Maße“ alle Räume der Etage. Unter 40 px Kante kein Schild. */
  _dimParts(px) {
    const f = this.floor;
    const rooms = this.showDims ? f.rooms : f.rooms.filter((r) => this.sel?.kind === "room" && this.sel.id === r.id);
    const parts = [];
    for (const r of rooms) {
      for (const e of edgeDimensions(r.points)) {
        if (e.len * this.scale < 40) continue;
        const q = [e.mid[0] + e.nOut[0] * px(14), e.mid[1] + e.nOut[1] * px(14)];
        parts.push(`<text data-dim="${e.i}" x="${r3(q[0])}" y="${r3(q[1] + px(4))}" text-anchor="middle" font-size="${px(12)}" stroke-width="${px(3)}" class="ed-dim">${de(e.len)} m</text>`);
      }
    }
    // Messungen
    for (const m of this.measures ?? []) {
      const [a, b] = m;
      if (!b) {
        parts.push(`<circle cx="${r3(a[0])}" cy="${r3(a[1])}" r="${px(5)}" fill="#e91e63"/>`);
        continue;
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const deg = Math.round(((Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI + 360) % 180);
      parts.push(`<line x1="${r3(a[0])}" y1="${r3(a[1])}" x2="${r3(b[0])}" y2="${r3(b[1])}" stroke="#e91e63" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`);
      for (const q of m) parts.push(`<circle cx="${r3(q[0])}" cy="${r3(q[1])}" r="${px(4)}" fill="#e91e63"/>`);
      parts.push(`<text data-measure x="${r3((a[0] + b[0]) / 2)}" y="${r3((a[1] + b[1]) / 2 - px(8))}" text-anchor="middle" font-size="${px(13)}" stroke-width="${px(3)}" class="ed-dim measure">${de(len)} m · ${deg}°</text>`);
    }
    return parts.join("");
  },

  /** Messen: Punkt rastet an Ecken, dann an Kanten, sonst am Raster. */
  _measureTap(p) {
    const tol = this._snapTol();
    let q = snapPoint(p, { grid: 0, vertices: floorVertices(this.floor), tol });
    if (q[0] === p[0] && q[1] === p[1]) {
      const e = nearestEdge(this.floor, p, tol);
      if (e) {
        const pts = e.room.points;
        q = projectOnSegment(p, pts[e.edge], pts[(e.edge + 1) % pts.length]).point;
      } else q = snapPoint(p, { grid: this.b.settings?.grid ?? 0.05, vertices: [], tol: 0 });
    }
    this.measures = this.measures ?? [];
    const last = this.measures.at(-1);
    if (last && last.length === 1) last.push(q);
    else {
      this.measures.push([q]);
      while (this.measures.length > 3) this.measures.shift();
    }
    this.render();
  },

  /** Feld „Länge (m)“ der gewählten Kante. */
  _edgeLengthField(r, ei) {
    const e = edgeDimensions(r.points)[ei];
    return `<label>Länge (m)</label><input type="number" min="0.1" step="0.01" data-edgelen value="${r3(e.len)}">`;
  },

  /** Breite/Tiefe für achsparallele Rechtecke. */
  _rectFields(r) {
    if (!isAxisRect(r.points)) return "";
    const xs = r.points.map((p) => p[0]);
    const zs = r.points.map((p) => p[1]);
    return `<div class="row2"><div><label>Breite (m)</label><input type="number" min="0.1" step="0.01" data-rectsize="w" value="${r3(Math.max(...xs) - Math.min(...xs))}"></div><div><label>Tiefe (m)</label><input type="number" min="0.1" step="0.01" data-rectsize="d" value="${r3(Math.max(...zs) - Math.min(...zs))}"></div></div>`;
  },

  _bindMeasureFields(el, r, ei) {
    // erst beim Ändern lesen (Schalter können seit dem Zeichnen des Felds umgestellt sein); „Einzeln“/„Mitziehen“ gilt einmal
    const opts = () => {
      const o = { linked: this._linked() };
      if (this.mods?.solo) {
        this.mods.solo = false;
        this._updateTouch?.();
      }
      return o;
    };
    const moved = (before, after) => {
      const names = after.rooms.filter((x) => x.id !== r.id && JSON.stringify(x.points) !== JSON.stringify(before.rooms.find((y) => y.id === x.id)?.points)).map((x) => x.name);
      if (names.length) this._toast(`Mitgezogen: ${names.join(", ")}`);
    };
    el.querySelector("[data-edgelen]")?.addEventListener("change", (ev) => {
      const v = Number(ev.target.value);
      if (!(v > 0.05)) return;
      const before = this.floor;
      const o = opts();
      const h0 = this._house0();
      this.change((fl) => {
        return setEdgeLength(fl, r.id, ei, v, o);
      });
      moved(before, this.floor);
      this._houseGuard(h0);
      this.renderProps();
    });
    el.querySelectorAll("[data-rectsize]").forEach((inp) => inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (!(v > 0.05)) return;
      const before = this.floor;
      const o = opts();
      const h0 = this._house0();
      this.change((fl) => {
        return setRectSize(fl, r.id, { [inp.dataset.rectsize]: v }, o);
      });
      moved(before, this.floor);
      this._houseGuard(h0);
      this.renderProps();
    }));
  },

  /** Flächen der Etage mit Summe. */
  _areaList(f) {
    if (!f.rooms.length) return "";
    const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const rows = f.rooms.map((r) => [r.name || r.id, Math.abs(signedArea(r.points))]);
    const sum = rows.reduce((t, [, a]) => t + a, 0);
    return `<h3>Flächen</h3><div class="ed-areas">${rows.map(([n, a]) => `<div><span>${esc(n)}</span><b>${de(a, 1)} m²</b></div>`).join("")}<div class="sum"><span>Fläche gesamt</span><b>${de(sum, 1)} m²</b></div></div>`;
  },
};

export const MEASURE_STYLE = `
.ed-svg .ed-dim { fill: #03a9f4; paint-order: stroke; stroke: var(--card-background-color, #fff); stroke-linejoin: round; pointer-events: none; font-weight: 500; }
.ed-svg .ed-dim.measure { fill: #e91e63; }
.ed-areas { font-size: 13px; }
.ed-areas div { display: flex; justify-content: space-between; padding: 2px 0; }
.ed-areas span { color: var(--secondary-text-color); }
.ed-areas .sum { border-top: 1px solid var(--divider-color, rgba(127,127,127,.3)); margin-top: 4px; padding-top: 4px; font-weight: 600; }
`;
