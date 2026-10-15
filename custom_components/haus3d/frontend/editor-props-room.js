// Eigenschaften-Leiste für Räume (samt gewählter Wand) und Fenster/Türen/Garagentore (Mixin für FloorEditor;
// ausgelagert aus renderProps). `ui` kommt von propsUi() in props-ui.js.

import { clampOffset, newOpening, openingGeometry, removeVertex } from "./edit-ops.js";
import { isPvShed } from "./exterior.js";
import { FLOOR_MATERIALS } from "./model.js";
import { textureField } from "./editor-roof.js";
import { computeWalls, signedArea } from "./walls.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STYLES = [
  ["", "automatisch"],
  ["interior", "Zimmertür"],
  ["front", "Haustür"],
  ["front_glass", "Haustür mit Glas"],
  ["glass", "Glastür"],
  ["sliding", "Schiebetür"],
  ["passage", "Durchgang (offen)"],
  ["standard", "Fenster normal"],
];

export const RoomPropsMethods = {
  _roomProps(el, sel, ui) {
    const f = this.floor;
    const hass = this.hass;
    const { areaOptions, colorField, pad, bindPad, bindColors, bindTextures, bindDelete } = ui;
    const r = f.rooms.find((x) => x.id === sel.id);
    if (!r) return this._clearSel();
    const ei = Number.isInteger(sel.edge) && sel.edge < r.points.length ? sel.edge : null;
    const est = ei !== null ? r.edge_styles?.[ei] ?? {} : null;
    const isExt = ei !== null && computeWalls(f, this.b.settings ?? {}).segments.some((sg) => sg.kind === "exterior" && sg.sources?.some((x) => x.room_id === r.id && x.edge === ei));
    const edgeBox = ei === null
      ? `<p class="muted">Tipp: eine blaue Wand antippen (nicht ziehen), um nur diese Wand anders zu gestalten, z. B. Fachwerk.</p>`
      : `<div class="edgebox"><h3>Wand ${ei + 1} von ${r.points.length}</h3>
          ${this._edgeLengthField(r, ei)}
          ${colorField("edge_color", "Farbe innen (nur diese Wand)", est.color)}
          ${textureField("edge_texture", "Textur innen (nur diese Wand)", est.texture, "w")}
          ${isExt ? colorField("edge_exterior_color", "Farbe außen (nur diese Wand)", est.exterior_color) + textureField("edge_exterior_texture", "Textur außen (nur diese Wand)", est.exterior_texture, "w") : ""}
          <div class="btns"><button data-act="edgereset">Wie der Raum</button><button data-act="edgeclose">Fertig</button></div></div>`;
    el.innerHTML = `${edgeBox}<h3>Raum</h3>
        <label>Name</label><input data-room="name" value="${esc(r.name)}">
        ${this._rectFields(r)}
        ${this._linkField()}
        <label>Bereich in Home Assistant</label><select data-room="area_id">${areaOptions(r.area_id)}</select>
        <label>Bodenbelag</label><select data-room="floor_material">${FLOOR_MATERIALS.map(([k, n]) => `<option value="${k}"${k === r.floor_material ? " selected" : ""}>${n}</option>`).join("")}</select>
        ${textureField("floor_texture", "Boden: Textur (Standard nach Belag)", r.floor_texture, "f", ["floor_texture_rotation", r.floor_texture_rotation])}
        ${colorField("floor_color", "Bodenfarbe (statt Belag)", r.floor_color)}
        ${colorField("wall_color", "Wandfarbe innen", r.wall_color)}
        ${textureField("wall_texture", "Wand innen: Textur", r.wall_texture, "w")}
        ${colorField("exterior_color", "Wandfarbe außen (z. B. Holzschuppen)", r.exterior_color)}
        ${textureField("exterior_texture", "Wand außen: Textur", r.exterior_texture, "w")}
        ${this._roomRoofField(f, r)}
        <label>Energie</label><select data-room="energy_role"><option value="none"${isPvShed(r) ? "" : " selected"}>–</option><option value="balkonkraftwerk"${isPvShed(r) ? " selected" : ""}>Balkonkraftwerk (Module, Energiefluss)</option></select>
        ${isPvShed(r) ? `<label>Solarmodule auf dem Dach (Anzahl)</label><input type="number" min="0" max="12" step="1" data-solar value="${r.solar_panels ?? 4}">` : ""}
        <p class="muted">${Math.abs(signedArea(r.points)).toFixed(2)} m² · ${r.points.length} Ecken. Ecken ziehen, „+“ fügt eine Ecke ein, Entf löscht den Raum.</p>
        ${pad()}
        <div class="btns"><button data-act="delvertex">Letzte gewählte Ecke löschen</button><button data-act="del" class="danger">Raum löschen</button></div>`;
    this._bindMeasureFields(el, r, ei);
    this._bindLinkField(el);
    // Schlüssel edge_*: Aussehen der gewählten Wand (room.edge_styles[Kante])
    const setEdge = (room, key, v) => {
      const k = key.slice(5);
      const styles = { ...(room.edge_styles ?? {}) };
      const st = { ...(styles[ei] ?? {}) };
      if (v) st[k] = v;
      else delete st[k];
      if (Object.keys(st).length) styles[ei] = st;
      else delete styles[ei];
      if (Object.keys(styles).length) room.edge_styles = styles;
      else delete room.edge_styles;
    };
    el.querySelector("[data-act=edgereset]")?.addEventListener("click", () => {
      this.change((fl) => {
        const room = fl.rooms.find((x) => x.id === r.id);
        for (const k of ["edge_color", "edge_texture", "edge_exterior_color", "edge_exterior_texture"]) setEdge(room, k, null);
      });
      this.renderProps();
    });
    el.querySelector("[data-act=edgeclose]")?.addEventListener("click", () => {
      this.sel = { kind: "room", id: r.id };
      this.render();
      this.renderProps();
    });
    bindColors((fl, key, v) => {
      const room = fl.rooms.find((x) => x.id === r.id);
      if (key.startsWith("edge_")) return setEdge(room, key, v);
      if (v) room[key] = v;
      else delete room[key];
    });
    bindTextures((fl, key, v) => {
      const room = fl.rooms.find((x) => x.id === r.id);
      if (key.startsWith("edge_")) return setEdge(room, key, v);
      if (v) room[key] = v;
      else delete room[key];
    });
    this._bindRoomRoofField(el, r);
    el.querySelector("[data-solar]")?.addEventListener("change", (ev) =>
      this.change((fl) => {
        fl.rooms.find((x) => x.id === r.id).solar_panels = Math.max(0, Math.round(Number(ev.target.value) || 0));
      }),
    );
    bindPad();
    el.querySelectorAll("[data-room]").forEach((inp) =>
      inp.addEventListener("change", () => {
        // Name bzw. Energie (Gartenhaus, Balkonkraftwerk) entscheiden mit, welche Räume das Hausdach deckt
        const h0 = this._house0();
        this.change((fl) => {
          const room = fl.rooms.find((x) => x.id === r.id);
          room[inp.dataset.room] = inp.value || (inp.dataset.room === "area_id" ? null : room[inp.dataset.room]);
          if (inp.dataset.room === "area_id" && inp.value && /^Raum \d+$/.test(room.name)) room.name = hass.areas?.[inp.value]?.name ?? room.name;
          this.renderProps();
        });
        this._houseGuard(h0);
      }),
    );
    el.querySelector("[data-act=delvertex]").addEventListener("click", () => {
      const i = this._lastVertex ?? r.points.length - 1;
      const h0 = this._house0();
      this.change((fl) => {
        return removeVertex(fl, r.id, Math.min(i, r.points.length - 1));
      });
      this._houseGuard(h0);
      this.renderProps();
    });
    bindDelete();
    return;
  },

  _openingProps(el, sel, ui) {
    const f = this.floor;
    const { entityList, num, colorField, pad, bindPad, bindColors, bindNums, bindDelete } = ui;
    const o = f.openings.find((x) => x.id === sel.id);
    if (!o) return this._clearSel();
    const typeName = { window: "Fenster", door: "Tür", garage: "Garagentor" }[o.type];
    const linkField = (key, label, domains, filter, auto = true) => {
      const v = o[key];
      const mode = v === "none" ? "none" : typeof v === "string" ? "fix" : auto ? "auto" : "none";
      return `<label>${label}</label><select data-linkmode="${key}">${auto ? `<option value="auto"${mode === "auto" ? " selected" : ""}>automatisch (Bereich)</option>` : ""}<option value="none"${mode === "none" ? " selected" : ""}>keiner</option><option value="fix"${mode === "fix" ? " selected" : ""}>bestimmter …</option></select>
          ${mode === "fix" ? `<input data-link="${key}" list="dl_${key}" value="${esc(v)}" placeholder="Entität">${entityList(`dl_${key}`, domains, filter)}` : ""}`;
    };
    el.innerHTML = `<h3>${typeName}</h3>
        <label>Art</label><select data-o="type">${[["window", "Fenster"], ["door", "Tür"], ["garage", "Garagentor"]].map(([k, n]) => `<option value="${k}"${k === o.type ? " selected" : ""}>${n}</option>`).join("")}</select>
        ${o.type === "door" ? `<label>Aussehen</label><select data-o="style">${STYLES.map(([k, n]) => `<option value="${k}"${(o.style ?? "") === k ? " selected" : ""}>${n}</option>`).join("")}</select>` : ""}
        <div class="row3">${num("width", "Breite", o.width)}${num("height", "Höhe", o.height)}${num("sill", "Brüstung", o.sill)}</div>
        ${num("offset", "Mitte ab Kantenanfang (m)", o.offset)}
        ${o.type !== "garage" ? `<div class="row3">
          <div><label>Anschlag</label><select data-o="hinge"><option value="left"${o.hinge !== "right" ? " selected" : ""}>links</option><option value="right"${o.hinge === "right" ? " selected" : ""}>rechts</option></select></div>
          <div><label>Öffnet</label><select data-o="swing"><option value="in"${o.swing !== "out" ? " selected" : ""}>nach innen</option><option value="out"${o.swing === "out" ? " selected" : ""}>nach außen</option></select></div>
          <div><label>Flügel</label><select data-o="leaves"><option value="1"${o.leaves !== 2 ? " selected" : ""}>1</option><option value="2"${o.leaves === 2 ? " selected" : ""}>2</option></select></div></div>` : ""}
        ${linkField("contact", "Kontakt (offen/zu)", ["binary_sensor", "sensor"], (s) => ["window", "door", "opening", "garage_door", undefined].includes(s.attributes.device_class))}
        ${linkField("cover", o.type === "garage" ? "Tor-Antrieb" : "Rollladen", ["cover"])}
        ${o.type === "window" ? linkField("tilt", "Kippsensor (optional)", ["binary_sensor", "sensor"], undefined, false) : ""}
        ${o.type !== "garage" && o.style !== "passage" ? colorField("frame_color", "Rahmenfarbe", o.frame_color) : ""}
        ${this._wellFields(o)}${this._atticOpeningHint(o)}
        <p class="muted">Im Plan entlang der Wand ziehen oder mit den Pfeilen schieben.</p>
        ${pad()}
        <div class="btns"><button data-act="del" class="danger">Löschen</button></div>`;
    bindPad();
    el.querySelectorAll("[data-o]").forEach((inp) =>
      inp.addEventListener("change", () => {
        this.change((fl) => {
          const x = fl.openings.find((y) => y.id === o.id);
          const k = inp.dataset.o;
          x[k] = k === "leaves" ? Number(inp.value) : k === "style" ? inp.value || null : inp.value;
          if (k === "type") {
            const wall = x.wall;
            Object.assign(x, newOpening(inp.value, { room: fl.rooms.find((r) => r.id === x.room_id) ?? { id: x.room_id }, edge: x.edge, offset: x.offset, len: openingGeometry(fl, x)?.len ?? 2 }, x.id), { contact: x.contact, cover: x.cover, frame_color: x.frame_color ?? null });
            if (wall) x.wall = wall;
          }
        });
        this.renderProps();
      }),
    );
    el.querySelectorAll("[data-linkmode]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const k = inp.dataset.linkmode;
        this.change((fl) => {
          fl.openings.find((y) => y.id === o.id)[k] = inp.value === "auto" ? null : inp.value === "none" ? "none" : o[k] && o[k] !== "none" ? o[k] : "";
        });
        this.renderProps();
      }),
    );
    el.querySelectorAll("[data-link]").forEach((inp) =>
      inp.addEventListener("change", () => this.change((fl) => {
        fl.openings.find((y) => y.id === o.id)[inp.dataset.link] = inp.value.trim() || null;
      })),
    );
    bindColors((fl, key, v) => {
      fl.openings.find((y) => y.id === o.id)[key] = v || null;
    });
    this._bindWellFields(el, o);
    bindNums((fl, k, v) => {
      const x = fl.openings.find((y) => y.id === o.id);
      if (v === null) return;
      x[k] = k === "offset" ? clampOffset(v, x.width, openingGeometry(fl, x)?.len ?? v * 2) : v;
    });
    bindDelete();
    return;
  },
};
