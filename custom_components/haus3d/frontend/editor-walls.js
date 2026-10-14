// Räume im Editor (Mixin für FloorEditor): Schalter „Ecken koppeln“, Ecken und Wände eines Raums ziehen (immer
// ab dem Stand bei Zugbeginn), Andocken an Nachbarwände, Werkzeug „Wand“ rastet an Ecken, Wandenden und
// Raumkanten ein.

import { dragVertexStep, floorVertices, moveEdge, parallelEdgeOffsets, snapOnEdge, snapPoint, snapWallEnd, wallEdges } from "./edit-ops.js";

export const LINK_KEY = "haus3d.editorLink";
const r3 = (v) => Math.round(v * 1000) / 1000;
const de = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;

export const WallMethods = {
  /** Gespeicherte Einstellung „Ecken koppeln“ (Standard aus: nur der gewählte Raum ändert sich). */
  _initLink() {
    try {
      this.link = localStorage.getItem(LINK_KEY) === "1";
    } catch {
      this.link = false;
    }
  },

  /** Gehen angrenzende Räume mit? „Ecken koppeln“, umgekehrt mit Alt bzw. dem Schalter „Einzeln“/„Mitziehen“. */
  _linked(ev) {
    return !!this.link !== (!!ev?.altKey || !!this.mods?.solo);
  },

  _flipName() {
    return this.coarse ? `„${this.link ? "Einzeln" : "Mitziehen"}“` : "Alt";
  },

  _linkText(linked) {
    return `${linked ? "Nachbarräume gehen mit" : "nur dieser Raum"} (${this._flipName()} kehrt das um)`;
  },

  toggleLink() {
    this.link = !this.link;
    try {
      localStorage.setItem(LINK_KEY, this.link ? "1" : "0");
    } catch {
      /* egal */
    }
    this.renderBar?.();
    this._updateTouch?.();
    const cb = this.props?.querySelector?.("input[data-link]");
    if (cb) cb.checked = this.link;
    this._toast(`${this.link ? "Ecken koppeln an: angrenzende Räume gehen beim Ziehen mit" : "Ecken koppeln aus: nur der gewählte Raum ändert sich"} (${this._flipName()} kehrt das für einen Zug um).`);
  },

  _linkButton() {
    return `<button data-act="link" class="${this.link ? "sel" : ""}" title="Ecken koppeln: angrenzende Räume gehen beim Ziehen von Ecken und Wänden mit (Alt bzw. „Mitziehen“/„Einzeln“ kehrt es für einen Zug um)"><ha-icon icon="mdi:link-variant"></ha-icon><span>Ecken koppeln</span></button>`;
  },

  _linkField() {
    return `<label class="chk"><input type="checkbox" data-link${this.link ? " checked" : ""}> Ecken koppeln: angrenzende Räume gehen mit</label>`;
  },

  _bindLinkField(el) {
    const cb = el.querySelector("input[data-link]");
    cb?.addEventListener("change", () => {
      if (cb.checked !== !!this.link) this.toggleLink();
    });
  },

  /** Ecke drag.i des gewählten Raums ziehen; jeder Schritt rechnet vom Stand bei Zugbeginn (nichts klebt). */
  _dragRoomVertex(drag, ev, p) {
    drag.base ??= structuredClone(this.floor);
    const id = this.sel.id;
    const linked = this._linked(ev);
    const step = dragVertexStep(drag.base, id, drag.i, p, { linked, grid: this.b.settings?.grid ?? 0.05, tol: this._snapTol() });
    if (!step) return;
    const cur = this.floor.rooms.find((r) => r.id === id)?.points[drag.i];
    const unmoved = cur && Math.hypot(cur[0] - step.q[0], cur[1] - step.q[1]) < 1e-9;
    if (unmoved && (drag.linked === linked || drag.first !== false)) return; // Antippen: kein Rückgängig-Schritt
    drag.linked = linked;
    this._dragChange(drag, () => step.floor); // Rückgabe ersetzt die Etage (change()-Vertrag); base nie verändern
    this._lastVertex = drag.i;
    if (step.shared) this._toast(`Ecke verschoben – ${this._linkText(linked)}`);
  },

  /** Wand (Kante drag.i) senkrecht ziehen: aufs Raster oder an eine parallele Nachbarwand (Fangradius). */
  _dragRoomEdge(drag, ev, p) {
    drag.base ??= structuredClone(this.floor);
    drag.dock ??= parallelEdgeOffsets(drag.base, drag.id, drag.i);
    const grid = this.b.settings?.grid ?? 0.05;
    const tol = this._snapTol();
    const raw = (p[0] - drag.start[0]) * drag.n[0] + (p[1] - drag.start[1]) * drag.n[1];
    const dock = drag.dock.filter((o) => Math.abs(o - raw) <= tol).sort((x, y) => Math.abs(x - raw) - Math.abs(y - raw))[0];
    const d = dock ?? (r3(Math.round(raw / grid) * grid) || 0); // ohne −0
    const linked = this._linked(ev);
    if (Math.abs(d - drag.applied) < 1e-9 && (drag.linked === linked || !d)) return;
    drag.applied = d;
    drag.linked = linked;
    this._dragChange(drag, () => (d ? moveEdge(drag.base, drag.id, drag.i, d, { linked }) : structuredClone(drag.base)));
    this._toast(`Wand verschoben: ${d >= 0 ? "+" : ""}${de(d)} m${dock !== undefined ? " (an Nachbarwand)" : ""} – ${this._linkText(linked)}`);
  },

  /** Ecken der Räume und Enden freier Wände (ohne die Wand exceptWall) als Fangpunkte. */
  _wallVertices(exceptWall = null) {
    const f = this.floor;
    return [...floorVertices(f), ...(f.walls ?? []).filter((w) => w.id !== exceptWall).flatMap((w) => [w.a, w.b])];
  },

  /** Anfang einer neuen Wand: Ecke oder Wandende, sonst (ohne „Frei“) eine Raumkante bzw. Wand, sonst Raster. */
  _wallStart(p, free = false) {
    const grid = this.b.settings?.grid ?? 0.05;
    const tol = this._snapTol();
    const vertices = this._wallVertices();
    const q = snapPoint(p, { grid, vertices, tol });
    this._guides = null;
    if (free || vertices.some((v) => same(v, q))) return q;
    return snapOnEdge(p, wallEdges(this.floor), { tol, grid }) ?? q;
  },

  /** Ende einer Wand ab a: gerade (0/45/90°), an Ecken und Wandenden, sonst auf einer Kante in Wandrichtung, sonst Fluchtlinien. */
  _wallToolSnap(a, p, free = false, exceptWall = null) {
    const tol = this._snapTol();
    const vertices = this._wallVertices(exceptWall);
    const q = snapWallEnd(a, p, { grid: this.b.settings?.grid ?? 0.05, vertices, tol, free });
    if (vertices.some((v) => same(v, q))) {
      this._guides = null;
      return q;
    }
    if (free) {
      this._guides = null;
      return q;
    }
    const e = snapOnEdge(p, wallEdges(this.floor, exceptWall), { a, q, tol });
    if (e) {
      this._guides = null;
      return e;
    }
    return this._alignWall(a, q, vertices);
  },
};
