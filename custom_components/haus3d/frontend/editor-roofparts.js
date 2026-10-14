// Freie Dachteile im Editor (Mixin für FloorEditor): Werkzeug „Dach setzen“ mit neun Dachformen und Zeichenarten
// (Rechteck, Punkte, Kreis, auf einen Raum tippen), Ecken, „+“, Radius und Fläche eines Teils ziehen, Duplizieren,
// Umwandeln eines eigenen Dachs in Dachteile, Turm unter einem freien Kegeldach.

import { allIds, newId, validPolygon } from "./edit-ops.js";
import { mainDirection, roofModel, roofSurfaceAt } from "./exterior.js";
import { ROOF_PART_TYPES, circleOf, circlePoints, newRoofPart, rectInFrame } from "./roofshapes.js";
import { adoptHouseItems, deletePart, findUnit, houseRoomIds, moveItemToUnit, parseUnitKey, roofUnits, roomRoofToParts, shiftPart, towerRoof, unitAt, unitKey, unitSpec } from "./roofunits.js";
import { adoptedText, roofItemName, unitIn } from "./editor-roofunits.js";

const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const de = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
const NAMES = Object.fromEntries(ROOF_PART_TYPES);
const polyOk = (pts) => Array.isArray(pts) && pts.length >= 3 && pts.every((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
const missing = (from, list) => from.split(",").filter((id) => id && !list.split(",").includes(id));

export const ROOF_STYLE = `
.ed-bar.compact .floorsel { max-width: 34vw; text-overflow: ellipsis; }
.ed-props .rpgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
.ed-props .rpgrid button, .ed-props .rpmodes button, .ed-props [data-rflip] { border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; font: inherit; font-size: 11px; padding: 6px 4px; border-radius: 8px; cursor: pointer; }
.ed-props .rpgrid button { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ed-props .rpgrid svg { width: 40px; height: 28px; }
.ed-props .rpmodes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.ed-props .rpmodes button { flex: 1; font-size: 12px; padding: 7px 6px; }
.ed-props [data-rflip] { width: 100%; font-size: 13px; padding: 7px 8px; }
.ed-props .rpgrid button.sel, .ed-props .rpmodes button.sel { background: var(--primary-color, #03a9f4); color: #fff; border-color: transparent; }
.ed-props details { margin-top: 10px; border-top: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding-top: 4px; }
.ed-props summary { cursor: pointer; font-size: 13px; padding: 6px 0; list-style: none; }
.ed-props summary::-webkit-details-marker { display: none; }
.ed-props summary::before { content: "▸"; margin-right: 6px; }
.ed-props details[open] > summary::before { content: "▾"; }
@media (pointer: coarse) {
  .ed-props summary { min-height: 44px; display: flex; align-items: center; }
  .ed-props [data-rpt], .ed-props [data-rpm], .ed-props [data-ract], .ed-props [data-rov], .ed-props [data-rfl] { min-height: 44px; }
}
`;

// Umriss jeder Dachform von der Seite (40 × 28) für das Werkzeug „Dach setzen“
const ICONS = {
  flat: "M4 16h32v6H4z",
  shed: "M4 22V14L36 6v16z",
  gable: "M4 22V14L20 4l16 10v8z",
  hip: "M2 22l9-13h18l9 13z",
  pyramid: "M4 22L20 4l16 18z",
  mansard: "M4 22l4-11 6-5h12l6 5 4 11z",
  halfhip: "M4 22V14l11-8h10l11 8v8z",
  cone: "M9 22L20 2l11 20z",
  terrace: "M4 18h32v4H4zM6 18V9M14 18V9M22 18V9M30 18V9M5 9h30",
};
const iconSvg = (t) => `<svg viewBox="0 0 40 28"><path d="${ICONS[t]}" fill="currentColor" fill-opacity="${t === "terrace" ? 0.25 : 0.45}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const MODES = { rect: "Rechteck ziehen", poly: "Punkte setzen", circle: "Kreis ziehen", room: "Auf Raum tippen" };
const MODE_HINTS = {
  rect: "Von Ecke zu Ecke ziehen – das Rechteck folgt der Ausrichtung des Hauses.",
  poly: "Ecken antippen, ersten Punkt erneut antippen oder „Fertig“ zum Abschließen.",
  circle: "Von der Mitte nach außen ziehen.",
  room: "Einen Raum dieser Etage antippen – das Dach gehört dann zum Raum und wandert mit ihm. Berührende Räume mit gleicher Dachform (Flach-, Sattel-, Walm-, Pultdach) bekommen ein gemeinsames Dach.",
};
const modesFor = (type) => (type === "cone" ? ["circle", "room"] : ["rect", "poly", "room"]);

/** Griffe des gewählten Dachteils (Ecken, „+“, Radius) und der Entwurf beim Zeichnen. → {handles, draft} */
export function roofPartSvg(ed, px, units) {
  const P = ([x, z]) => `${r3(x)},${r3(z)}`;
  let handles = "";
  const s = ed.sel;
  const u = s?.kind === "roofpart" && ed.tool === "select" ? unitIn(units, s.unit ?? "house") : null;
  const pts = u?.kind === "part" ? u.spec?.points : null;
  if (polyOk(pts)) {
    const key = esc(u.key);
    const rr = px(ed.coarse ? 13 : 9);
    handles += `<polygon points="${pts.map(P).join(" ")}" fill="none" stroke="#03a9f4" stroke-width="${px(3)}" pointer-events="none"/>`;
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    if ((u.model?.roof?.type ?? u.spec.type) === "cone") {
      const { center, r } = circleOf(pts);
      handles += `<circle data-kind="rpradius" data-unit="${key}" cx="${r3(center[0] + r)}" cy="${r3(center[1])}" r="${rr}" fill="#ff9800" stroke="#fff" stroke-width="${px(2)}" style="cursor:ew-resize"/>`;
      handles += `<text x="${r3(center[0])}" y="${r3(center[1] + px(4))}" text-anchor="middle" font-size="${px(12)}" font-weight="600" fill="#fff">⌀ ${de(2 * r)} m</text>`;
    } else {
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        handles += `<g data-kind="rpinsert" data-unit="${key}" data-i="${i}" style="cursor:copy"><circle cx="${r3(mid[0])}" cy="${r3(mid[1])}" r="${px(ed.coarse ? 11 : 6)}" fill="#fff" stroke="#03a9f4" stroke-width="${px(1.5)}"/><text x="${r3(mid[0])}" y="${r3(mid[1] + px(3.5))}" text-anchor="middle" font-size="${px(10)}" fill="#03a9f4">+</text></g>`;
      });
      pts.forEach((p, i) => {
        handles += `<circle data-kind="rpvertex" data-unit="${key}" data-i="${i}" cx="${r3(p[0])}" cy="${r3(p[1])}" r="${rr}" fill="${s.vertex === i ? "#ff9800" : "#03a9f4"}" stroke="#fff" stroke-width="${px(2)}" style="cursor:grab"/>`;
      });
      handles += `<text x="${r3(c[0])}" y="${r3(c[1] + px(4))}" text-anchor="middle" font-size="${px(12)}" font-weight="600" fill="#fff">${de(Math.max(...xs) - Math.min(...xs))} × ${de(Math.max(...zs) - Math.min(...zs))} m</text>`;
    }
  }
  let draft = "";
  const d = ed.draft;
  const style = `fill="#9a4a36" fill-opacity=".3" stroke="#03a9f4" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}" pointer-events="none"`;
  if (d?.rpRect) {
    const xs = d.rpRect.map((p) => p[0]);
    const zs = d.rpRect.map((p) => p[1]);
    const len = (i) => Math.hypot(d.rpRect[i + 1][0] - d.rpRect[i][0], d.rpRect[i + 1][1] - d.rpRect[i][1]);
    draft = `<polygon points="${d.rpRect.map(P).join(" ")}" ${style}/><text x="${r3((Math.min(...xs) + Math.max(...xs)) / 2)}" y="${r3((Math.min(...zs) + Math.max(...zs)) / 2)}" text-anchor="middle" font-size="${px(12)}" fill="#03a9f4">${de(len(0))} × ${de(len(1))} m</text>`;
  } else if (d?.rpCircle) {
    const { c, r } = d.rpCircle;
    draft = `<circle cx="${r3(c[0])}" cy="${r3(c[1])}" r="${r3(Math.max(r, 0.01))}" ${style}/><text x="${r3(c[0])}" y="${r3(c[1] - r - px(6))}" text-anchor="middle" font-size="${px(12)}" fill="#03a9f4">⌀ ${de(2 * r)} m</text>`;
  } else if (d?.kind === "roof" && d.points?.length) {
    const line = [...d.points, ...(d.hover ? [d.hover] : [])];
    draft = `<polyline points="${line.map(P).join(" ")}" fill="none" stroke="#03a9f4" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}" pointer-events="none"/>${d.points.map((p, i) => `<circle cx="${r3(p[0])}" cy="${r3(p[1])}" r="${px(i ? 4 : 7)}" fill="#03a9f4" pointer-events="none"/>`).join("")}`;
  }
  return { handles, draft };
}

/**
 * Zeiger gedrückt in der Dach-Ebene, Teil der Dachteile: Werkzeug „Dach setzen“, Ecke, „+“, Radius und Fläche
 * eines freien Teils. → Ziehvorgang, null (erledigt) oder undefined (nicht zuständig).
 */
export function roofPartStart(ed, ev, p) {
  const grid = ed.b.settings?.grid ?? 0.05;
  const snap = (q) => [r3(Math.round(q[0] / grid) * grid), r3(Math.round(q[1] / grid) * grid)];
  if (ed.tool === "roofadd") {
    const { mode } = ed._roofAdd;
    if (mode === "room") {
      void ed._roofRoomTap(p);
      return null;
    }
    if (mode === "circle") return { mode: "roofcircle", c: snap(p) };
    if (mode === "rect") return { mode: "roofrect", a: ed._snap(p), ang: mainDirection((ed.floor?.rooms ?? []).filter((r) => polyOk(r.points))) };
    const q = ed._snap(p);
    if (ed.draft?.kind !== "roof" || !ed.draft.points?.length) ed.draft = { points: [q], kind: "roof" };
    else {
      const first = ed.draft.points[0];
      if (ed.draft.points.length >= 3 && Math.hypot(q[0] - first[0], q[1] - first[1]) < 12 / ed.scale) {
        ed._finishPolygon();
        return null;
      }
      ed.draft.points.push(q);
    }
    ed.render();
    return null;
  }
  if (ed.tool !== "select") return undefined;
  const t = ev.target.closest("[data-kind]");
  const kind = t?.dataset.kind;
  const key = t?.dataset.unit;
  if (!key || parseUnitKey(key).kind !== "part") return undefined;
  const spec = unitSpec(ed.b, key);
  if (!spec) return undefined;
  const pick = (sel) => {
    ed.sel = sel;
    ed._roofUnit = key;
    ed.render();
    ed.renderProps();
  };
  if (kind === "rpvertex") {
    const i = Number(t.dataset.i);
    pick({ kind: "roofpart", unit: key, id: 0, vertex: i });
    return { mode: "roofvertex", unit: key, i, first: true };
  }
  if (kind === "rpinsert" && polyOk(spec.points)) {
    const i = Number(t.dataset.i);
    const a = spec.points[i];
    const b = spec.points[(i + 1) % spec.points.length];
    ed.sel = { kind: "roofpart", unit: key, id: 0, vertex: i + 1 };
    ed.changeUnit(key, (part) => {
      part.points.splice(i + 1, 0, [r3((a[0] + b[0]) / 2), r3((a[1] + b[1]) / 2)]);
    });
    ed.renderProps();
    return { mode: "roofvertex", unit: key, i: i + 1, first: false };
  }
  if (kind === "rpradius" && polyOk(spec.points)) return { mode: "roofradius", unit: key, c: circleOf(spec.points).center, r: null, first: true };
  if (kind === "roofpart") {
    pick({ kind: "roofpart", unit: key, id: Number(t.dataset.part) || 0 });
    return { mode: "roofmove", unit: key, start: p, d: [0, 0], first: true };
  }
  return undefined;
}

/** Ziehen der Dachteile (Entwürfe, Fläche, Ecke, Radius). → true, wenn erledigt. */
export function roofPartMove(ed, drag, p) {
  const grid = ed.b.settings?.grid ?? 0.05;
  const snap = (v) => r3(Math.round(v / grid) * grid);
  const step = (fn) => {
    ed.changeUnit(drag.unit, fn, { merge: !drag.first });
    drag.first = false;
  };
  switch (drag.mode) {
    case "roofrect":
      ed.draft = { rpRect: rectInFrame(drag.a, ed._snap(p), drag.ang) };
      ed.render();
      return true;
    case "roofcircle":
      ed.draft = { rpCircle: { c: drag.c, r: snap(Math.hypot(p[0] - drag.c[0], p[1] - drag.c[1])) } };
      ed.render();
      return true;
    case "roofmove": {
      const d = [snap(p[0] - drag.start[0]), snap(p[1] - drag.start[1])];
      const dx = r3(d[0] - drag.d[0]);
      const dz = r3(d[1] - drag.d[1]);
      if (!dx && !dz) return true;
      drag.d = d;
      step((part) => {
        shiftPart(part, dx, dz);
      });
      return true;
    }
    case "roofvertex": {
      const spec = unitSpec(ed.b, drag.unit);
      if (!Array.isArray(spec?.points) || !spec.points[drag.i]) return true;
      const q = ed._snap(p);
      const cur = spec.points[drag.i];
      if (cur[0] === q[0] && cur[1] === q[1]) return true;
      const next = spec.points.map((v, i) => (i === drag.i ? q : v));
      if (!validPolygon(next)) return true; // zu klein oder verdreht: letzter gültiger Stand bleibt
      step((part) => {
        part.points = next;
      });
      return true;
    }
    case "roofradius": {
      const r = Math.max(0.4, snap(Math.hypot(p[0] - drag.c[0], p[1] - drag.c[1])));
      if (r === drag.r) return true;
      drag.r = r;
      step((part) => {
        part.points = circlePoints(drag.c, r);
      });
      ed._toast(`Durchmesser ${de(2 * r)} m`);
      return true;
    }
  }
  return false;
}

export const RoofPartMethods = {
  /** Werkzeug-Panel „Dach setzen“: Dachform und Zeichenart. */
  _roofAddPanel(el) {
    const st = this._roofAdd;
    if (!modesFor(st.type).includes(st.mode)) st.mode = modesFor(st.type)[0];
    el.innerHTML = `<h3>Dach setzen</h3>
      <label>Dachform</label><div class="rpgrid">${ROOF_PART_TYPES.map(([k, n]) => `<button data-rpt="${k}" class="${k === st.type ? "sel" : ""}" title="${n}">${iconSvg(k)}<span>${n}</span></button>`).join("")}</div>
      <label>Zeichnen</label><div class="rpmodes">${modesFor(st.type).map((k) => `<button data-rpm="${k}" class="${k === st.mode ? "sel" : ""}">${MODES[k]}</button>`).join("")}</div>
      <p class="muted">${MODE_HINTS[st.mode]}</p>
      <p class="muted">Das Dach sitzt auf der Oberkante dieser Etage, im Dachgeschoss auf dem Kniestock (Flachdach und Dachterrasse auf Raumhöhe).</p>`;
    const again = () => {
      this.draft = null;
      this.render();
      this.renderProps();
    };
    el.querySelectorAll("[data-rpt]").forEach((b) =>
      b.addEventListener("click", () => {
        st.type = b.dataset.rpt;
        again();
      }),
    );
    el.querySelectorAll("[data-rpm]").forEach((b) =>
      b.addEventListener("click", () => {
        st.mode = b.dataset.rpm;
        again();
      }),
    );
  },

  /** Ende eines Ziehvorgangs der Dachteile (synchron). → true, wenn erledigt. */
  _roofPartEnd(drag) {
    if (drag.mode === "roofrect") {
      const pts = this.draft?.rpRect;
      this.draft = null;
      const side = (i) => (pts ? Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) : 0);
      if (side(0) < 0.5 || side(1) < 0.5) {
        this._toast("Zu klein – mindestens 0,5 × 0,5 m.");
        this.render();
        return true;
      }
      void this._addRoofPart(this._roofAdd.type, pts);
      return true;
    }
    if (drag.mode === "roofcircle") {
      const c = this.draft?.rpCircle;
      this.draft = null;
      if (!c || c.r < 0.4) {
        this._toast("Zu klein – mindestens 0,4 m Radius.");
        this.render();
        return true;
      }
      void this._addRoofPart("cone", circlePoints(c.c, c.r));
      return true;
    }
    if (drag.mode === "roofitem" && !drag.first && drag.unit) {
      // auf ein anderes Dach dieser Etage gezogen: dorthin umziehen
      const units = roofUnits(this.b, this.floorId);
      const own = unitIn(units, drag.unit);
      const it = own?.items.find((x) => x.id === drag.id);
      if (it && own.model && Number.isFinite(it.x) && !roofSurfaceAt(own.model, [it.x, it.z])) {
        const at = unitAt(units.filter((x) => x.key !== own.key), [it.x, it.z]);
        if (at) {
          this.sel = { kind: "roofitem", unit: at.unit.key, id: it.id };
          this._roofUnit = at.unit.key;
          this.changeBuilding((b) => {
            moveItemToUnit(b, own.key, at.unit.key, it.id);
          }, { merge: true });
          this._toast(`${roofItemName(it)} liegt jetzt auf „${at.unit.label}“.`);
        }
      }
    }
    return false;
  },

  /** Punkte-Entwurf fertig: Dachteil anlegen (mindestens 0,1 m²). */
  _finishRoofPoly(points) {
    if (!validPolygon(points)) {
      this._toast("Zu klein – mindestens 0,1 m².");
      this.render();
      return;
    }
    void this._addRoofPart(this._roofAdd.type, points);
  },

  /** Neues Dachteil der Form type auf dieser Etage. */
  async _addRoofPart(type, points) {
    const part = newRoofPart(type, points, { id: newId("dach", allIds(this.b)), roof: this.b.settings?.roof });
    return this._insertPart(this.floorId, part, `„${NAMES[part.type]}“ gesetzt – rechts Neigung und First einstellen.`);
  },

  /** Dachteil einfügen (Rückfrage, wenn das Hausdach Räume abgibt und Anpassungen hat), wählen, Hinweis. */
  async _insertPart(fid, part, msg) {
    const mutate = (b) => {
      const fl = b.floors.find((x) => x.id === fid);
      fl.roofs = [...(fl.roofs ?? []), structuredClone(part)];
    };
    const g = await this._houseConfirm(mutate, (c) => `Das Dachteil liegt über „${this._roomNames(missing(c.before, c.after))}“ unter dem Hausdach. Das Hausdach spart sie dann aus; seine Kanten-Anpassungen werden zurückgesetzt.`, "Dachteil setzen");
    if (!g.go) {
      this.draft = null;
      this.render();
      return false;
    }
    const key = unitKey("part", fid, part.id);
    Object.assign(this, { sel: { kind: "roofpart", unit: key, id: 0 }, _roofUnit: key, tool: "select", draft: null });
    let adopted = 0;
    this.changeBuilding((b) => {
      const house = roofModel(b);
      mutate(b);
      if (g.reset) delete b.settings.roof.adjust;
      adopted = adoptHouseItems(b, house); // Dinge des Hausdachs über dem Teil liegen jetzt auf ihm
    });
    const text = g.reset ? `Das Hausdach spart „${this._roomNames(missing(g.c.before, g.c.after))}“ jetzt aus – seine Kanten-Anpassungen sind zurückgesetzt.` : msg;
    this._toast(adopted ? `${text} ${adoptedText(adopted)}` : text);
    return true;
  },

  /** Dachteil duplizieren (+0,5 m, neue IDs auch für die Dinge, ohne verknüpfte Entitäten). */
  async _partDup(key) {
    const src = unitSpec(this.b, key);
    if (!src || parseUnitKey(key).kind !== "part") return;
    const ids = allIds(this.b);
    const fresh = (prefix) => {
      const id = newId(prefix, ids);
      ids.add(id);
      return id;
    };
    const copy = shiftPart(structuredClone(src), 0.5, 0.5);
    copy.id = fresh("dach");
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((it) => {
        const c = { ...it, id: fresh(it?.type === "pv" ? "pv" : it?.type || "dach") };
        delete c.entity;
        delete c.energy_entity;
        return c;
      });
    }
    await this._insertPart(parseUnitKey(key).floorId, copy, "Dachteil dupliziert (um 0,5 m versetzt).");
  },

  /** Eigenes Dach (Raum-Gruppe) in freie Dachteile umwandeln: je Raum ein Teil, Dinge nach Lage. */
  _unitToParts(key) {
    const u = findUnit(this.b, key);
    const res = u?.kind === "room" ? roomRoofToParts(this.b, u.key) : null;
    if (!res?.parts.length) return;
    const ids = allIds(this.b);
    const parts = res.parts.map((p) => {
      const id = newId("dach", ids);
      ids.add(id);
      return { id, ...p };
    });
    for (const [i, it] of res.items) (parts[i].items ??= []).push(it);
    const fid = u.floorId;
    const h0 = houseRoomIds(this.b);
    const unit = unitKey("part", fid, parts[0].id);
    Object.assign(this, { sel: { kind: "roofpart", unit, id: 0 }, _roofUnit: unit });
    this.changeBuilding((b) => {
      const fl = b.floors.find((x) => x.id === fid);
      for (const r of fl.rooms ?? []) if (u.rooms.some((x) => x.id === r.id)) delete r.roof;
      fl.roofs = [...(fl.roofs ?? []), ...parts];
    });
    const msg = parts.length === 1 ? "In ein Dachteil umgewandelt – die Ecken lassen sich jetzt frei ziehen." : `In ${parts.length} Dachteile umgewandelt – die Ecken lassen sich jetzt frei ziehen.`;
    if (!this._houseGuard(h0, msg)) this._toast(msg);
  },

  /** Freies Kegeldach → runder Raum darunter; das Dach zieht als eigenes Dach an den Raum (ohne Höhenversatz). */
  _partTower(key) {
    const part = unitSpec(this.b, key);
    const fid = parseUnitKey(key).floorId;
    if (!polyOk(part?.points)) return;
    const { center, r } = circleOf(part.points);
    const room = { id: newId("room", allIds(this.b)), name: part.name || "Turm", area_id: null, floor_material: "wood", points: circlePoints(center, r), roof: { ...towerRoof(part), type: "cone" } };
    const h0 = houseRoomIds(this.b);
    const unit = unitKey("room", fid, room.id);
    Object.assign(this, { sel: { kind: "roofpart", unit, id: 0 }, _roofUnit: unit });
    this.changeBuilding((b) => {
      b.floors.find((x) => x.id === fid).rooms.push(room);
      deletePart(b, key);
    });
    const msg = Number(part.base) ? "„Höhe versetzt“ gilt nur für Dachteile – das Kegeldach sitzt jetzt auf der Etage." : "Runder Raum angelegt – das Kegeldach gehört jetzt zu ihm.";
    if (!this._houseGuard(h0, msg)) this._toast(msg);
  },
};
