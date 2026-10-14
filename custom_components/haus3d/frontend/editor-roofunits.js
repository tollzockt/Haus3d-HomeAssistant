// Dach-Einheiten im Editor (Mixin für FloorEditor): Knopf „Dach“ und Dach-Ebene je Etage, Übersicht der Dächer,
// ein Formular für eigene Dächer von Räumen und freie Dachteile, eigenes Dach in den Raum-Eigenschaften und der
// Schutz der Kanten-Anpassungen des Hausdachs. Dazu Formular-Bausteine, die auch das Hausdach nutzt.

import { canAdmin } from "./access.js";
import { roomAt, validPolygon } from "./edit-ops.js";
import { ROOF_ITEMS, isPvShed, roofFloor, roofItemFootprint, roofModel, roofSettings, roomRoofType } from "./exterior.js";
import { COLOR_SWATCHES, textureOptions, textureRotation } from "./model.js";
import { BAND_TYPES, GROUP_TYPES, PART_PITCH, ROOF_PART_TYPES, ROOM_ROOF_TYPES, SINGLE_TYPES, circleOf, circlePoints } from "./roofshapes.js";
import {
  addRoomRoof,
  clampRoof,
  coveredBy,
  deletePart,
  editUnit,
  findUnit,
  houseRoomIds,
  houseRoomsChange,
  parseUnitKey,
  partOver,
  removeRoomRoof,
  roofSummary,
  roofUnits,
  setAdjust,
  setSeparate,
  trimToHouse,
  unitFaces,
  unitForRoom,
  unitKey,
} from "./roofunits.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v ?? "");
const de = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
const NAMES = Object.fromEntries(ROOM_ROOF_TYPES);
const RAILINGS = [["glass", "Glas"], ["bars", "Stäbe"], ["wood", "Holzzaun"], ["none", "kein Geländer"]];
// IDs, die in einer Liste (Text „a,b“) fehlen
const missing = (from, list) => from.split(",").filter((id) => id && !list.split(",").includes(id));

/** Einheit zu einem Schlüssel aus einer Liste; Räume über die Mitgliedschaft (auch nach Trennen/Verbinden). */
export function unitIn(units, key) {
  const k = parseUnitKey(key);
  if (k.kind === "room") return units.find((u) => u.kind === "room" && u.floorId === k.floorId && u.rooms.some((r) => r.id === k.id)) ?? null;
  return units.find((u) => u.key === (k.kind === "house" ? "house" : key)) ?? null;
}

/** Farbfeld der Dach-Formulare (data-rcolor, data-rcolor-reset, data-rswatch). */
export function roofColorField(key, label, value) {
  const v = isHex(value) ? value.toLowerCase() : "";
  return `<label>${label}</label><div class="colorrow"><input type="color" data-rcolor="${key}" value="${v || "#cccccc"}"><button data-rcolor-reset="${key}">Standard</button><span class="muted">${v ? esc(v) : "Standard"}</span></div>
    <div class="swatches">${COLOR_SWATCHES.map((c) => `<button data-rswatch="${key}" data-c="${c}" style="background:${c}" class="${c === v ? "sel" : ""}" title="${c}"></button>`).join("")}</div>`;
}

/** Textur-Auswahl der Dach-Formulare (data-rtex); kind r (Dach), w (Wand), g (Belag). */
export function roofTexField(key, label, value, kind) {
  return `<label>${label}</label><select data-rtex="${key}">${textureOptions(kind).map(([k, n]) => `<option value="${k}"${k === (value ?? "") ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
}

const numField = (key, label, value, step, extra = "") => `<div><label>${label}</label><input type="number" step="${step}" data-rn="${key}" value="${value ?? ""}"${extra}></div>`;
const selField = (key, label, value, opts) => `<div><label>${label}</label><select data-rr="${key}">${opts.map(([k, n]) => `<option value="${k}"${k === value ? " selected" : ""}>${n}</option>`).join("")}</select></div>`;

/**
 * Felder einer Dachform: Neigung, Überstand, First, hohe Seite, Flügel-Ende, Mansard- und Krüppelwalmdach,
 * Kegel-Durchmesser, Höhenversatz, Dachterrasse. spec mit Standardwerten; kind house | room | part.
 */
export function roofFieldsHtml(spec, { kind = "room", type = spec?.type, frames = [], diameter = null } = {}) {
  const s = spec ?? {};
  const out = [];
  const flat = type === "flat" || type === "terrace";
  if (type === "mansard") {
    out.push(`<div class="row2">${numField("pitch", "Neigung oben (°)", s.pitch, 1, ' min="5" max="80"')}${numField("pitch_low", "Neigung unten (°)", s.pitch_low, 1, ' min="20" max="85"')}</div>`);
    out.push(`<div class="row2">${numField("break", "Knick (Anteil 0,1–0,9)", s.break, 0.05, ' min="0.1" max="0.9"')}${selField("ends", "Enden", s.ends, [["gable", "Giebel"], ["hip", "Walm"]])}</div>`);
  }
  const pitch = flat || type === "mansard" ? "" : numField("pitch", "Neigung (°)", s.pitch, 1, ` min="5" max="${kind === "house" || GROUP_TYPES.includes(type) ? 60 : 80}"`);
  const ov = type === "terrace" ? "" : numField("overhang", "Überstand (m)", s.overhang, 0.05, ' min="0" max="1.5"');
  if (pitch || ov) out.push(`<div class="row2">${pitch}${ov}</div>`);
  if (type === "halfhip") out.push(numField("hip_ratio", "Walm-Anteil oben (0,1–0,9)", s.hip_ratio, 0.05, ' min="0.1" max="0.9"'));
  const row = [];
  if (BAND_TYPES.includes(type)) {
    const dirs = [["auto", "lange Seite"], ...(kind === "house" ? [] : [["cross", "kurze Seite"]]), ["x", "links–rechts im Plan"], ["z", "oben–unten im Plan"]];
    row.push(selField("direction", type === "shed" ? "Neigung quer zu" : "First entlang", s.direction === "cross" && kind === "house" ? "auto" : s.direction, dirs));
  }
  if (type === "shed") row.push(`<div><label>Hohe Seite</label><button data-rflip title="Pultdach andersherum">⇄ tauschen</button></div>`);
  if ((type === "gable" || type === "hip") && (kind === "house" || frames.length > 1)) row.push(selField("wing_end", "Flügel-Ende", s.wing_end === "hip" ? "hip" : "gable", [["gable", "Giebel"], ["hip", "Walm"]]));
  if (row.length) out.push(`<div class="row2">${row.join("")}</div>`);
  const part = [];
  if (diameter != null) part.push(numField("diameter", "Durchmesser (m)", r3(diameter), 0.1, ' min="0.8" max="30"'));
  if (kind === "part" && type !== "terrace") part.push(numField("base", "Höhe versetzt (m, + höher)", s.base ?? 0, 0.1, ' min="-5" max="20"'));
  if (part.length) out.push(`<div class="row2">${part.join("")}</div>`);
  if (type === "terrace") {
    out.push(`<div class="row2">${selField("railing", "Geländer", s.railing ?? "glass", RAILINGS)}${numField("railing_height", "Geländerhöhe (m)", s.railing_height ?? 1, 0.05, ' min="0.3" max="2.5"')}</div>`);
    out.push(roofTexField("texture", "Belag (Textur)", s.texture, "g"));
    if (s.texture !== "none") out.push(numField("texture_rotation", "Textur drehen (°)", textureRotation(s.texture_rotation), 15));
    out.push(roofColorField("color", "Belagfarbe", s.color));
  }
  return out.join("");
}

/** Felder von roofFieldsHtml und die Farb-/Texturfelder binden: apply(key, wert); null = Standard, flip = umschalten. */
export function bindRoofFields(el, apply) {
  el.querySelectorAll("[data-rr]").forEach((inp) => inp.addEventListener("change", () => apply(inp.dataset.rr, inp.value)));
  el.querySelectorAll("[data-rn]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (inp.value !== "" && Number.isFinite(v)) apply(inp.dataset.rn, v);
    }),
  );
  el.querySelectorAll("[data-rtex]").forEach((inp) => inp.addEventListener("change", () => apply(inp.dataset.rtex, inp.value || null)));
  el.querySelectorAll("[data-rcolor]").forEach((inp) => inp.addEventListener("change", () => apply(inp.dataset.rcolor, inp.value)));
  el.querySelectorAll("[data-rcolor-reset]").forEach((b) => b.addEventListener("click", () => apply(b.dataset.rcolorReset, null)));
  el.querySelectorAll("[data-rswatch]").forEach((b) => b.addEventListener("click", () => apply(b.dataset.rswatch, b.dataset.c)));
  el.querySelector("[data-rflip]")?.addEventListener("click", () => apply("flip", "toggle"));
}

/** Wert eines Dach-Formularfelds schreiben: Zahlen begrenzt (clampRoof), leere Werte gelöscht, flip umgeschaltet. */
export function applyRoofKey(r, key, v, type = r.type) {
  if (key === "flip") {
    if (r.flip) delete r.flip;
    else r.flip = true;
  } else if (v === null || v === "" || v === undefined) delete r[key];
  else r[key] = typeof v === "number" ? r3(clampRoof(key, v, type)) : v;
}

/** Vier Kanten einer Dachfläche (data-radj = lo, hi, a, b). */
export function adjustFieldsHtml(adj) {
  const f = (k, label) => `<div><label>${label}</label><input type="number" step="0.05" data-radj="${k}" value="${Number(adj?.[k]) || 0}"></div>`;
  return `<div class="row2">${f("lo", "Anfang (m, + länger)")}${f("hi", "Ende (m, + länger)")}</div><div class="row2">${f("a", "Traufe 1 (m, + breiter)")}${f("b", "Traufe 2 (m, + breiter)")}</div>`;
}

/** Kanten-Felder binden: apply(seite, wert). */
export function bindAdjustFields(el, apply) {
  el.querySelectorAll("[data-radj]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (inp.value !== "" && Number.isFinite(v)) apply(inp.dataset.radj, v);
    }),
  );
}

/** Kante „side“ der Fläche k auf v setzen (übrige Kanten bleiben). */
export function setEdge(r, k, side, v) {
  const cur = (r.adjust ?? [])[k] ?? {};
  setAdjust(r, k, { lo: Number(cur.lo) || 0, hi: Number(cur.hi) || 0, a: Number(cur.a) || 0, b: Number(cur.b) || 0, [side]: v });
}

export const RoofUnitMethods = {
  /**
   * Änderung an einer Dach-Einheit mit Rückgängig-Schritt (fn bekommt die gespeicherten Daten, Rückgabe egal);
   * note (Text oder Funktion, nach fn ausgewertet) kommt in denselben Hinweis wie zurückgesetzte Kanten.
   */
  changeUnit(key, fn, { merge = false, note = "" } = {}) {
    if (key !== "house" && !findUnit(this.b, key)) return null;
    this._pushUndo(merge);
    const report = {};
    const k = editUnit(this.b, key, fn, report);
    this._pfCache = null; // Änderung an Ort und Stelle: Wandflächen neu
    if (this.sel?.unit === key) {
      if (k == null) this.sel = null; // Einheit weg → Auswahl weg
      else this.sel.unit = k;
    }
    this._roofUnit = k ?? null;
    this.dirty = true;
    this.render();
    this.renderBar();
    this._sync3d();
    this._queueDraft();
    const msg = [typeof note === "function" ? note() : note, report.droppedAdjust ? "Kanten-Anpassungen zurückgesetzt (die Dachform hat sich geändert)." : ""].filter(Boolean).join(" ");
    if (msg) this._toast(msg);
    return k;
  },

  /**
   * Rückfrage, wenn eine Aktion die Räume unter dem Hausdach ändert und es Kanten-Anpassungen hat (text, auch
   * als Funktion der Änderung); lead wird immer gefragt (z. B. Dinge auf einem Dach). → {go, reset, c}
   */
  async _houseConfirm(mutate, text, ok = "Weiter", lead = "") {
    const c = houseRoomsChange(this.b, mutate);
    const reset = c.changed && !!this.b.settings?.roof?.adjust;
    if (!reset && !lead) return { go: true, reset: false, c };
    const msg = [lead, reset ? (typeof text === "function" ? text(c) : text) : ""].filter(Boolean).join(" ");
    const yes = await this.confirm(msg, ok, lead ? { danger: true } : undefined);
    return { go: yes, reset: yes && reset, c };
  },

  /**
   * Nach Ziehen, Pfeiltasten oder Raum löschen: deckt das Hausdach andere Räume, fallen seine Anpassungen weg.
   * lead steht dann vor dem Hinweis (eigener Hinweis der Aktion). → true, wenn zurückgesetzt
   */
  _houseGuard(h0, lead = "") {
    if (h0 == null || !this.b.settings?.roof?.adjust || houseRoomIds(this.b) === h0) return false;
    this.changeBuilding((b) => {
      delete b.settings.roof.adjust;
    }, { merge: true });
    this._toast([lead, "Das Hausdach deckt jetzt andere Räume – seine Kanten-Anpassungen sind zurückgesetzt."].filter(Boolean).join(" "));
    return true;
  },

  /** Stand für _houseGuard vor einer Änderung (null ohne Kanten-Anpassungen am Hausdach). */
  _house0() {
    return this.b.settings?.roof?.adjust ? houseRoomIds(this.b) : null;
  },

  /** Namen von Räumen (IDs) für Rückfragen und Hinweise. */
  _roomNames(ids) {
    const all = this.b.floors.flatMap((f) => f.rooms ?? []);
    return ids.map((id) => all.find((r) => r.id === id)?.name || id).join(", ");
  },

  /** Knopf „Dach“ neben der Etagen-Auswahl. */
  _roofButton() {
    const wide = (this.root.clientWidth || 1200) >= 820;
    return `<button data-act="roofmode" class="roofbtn${this.roofMode ? " sel" : ""}" title="Dächer dieser Etage bearbeiten: Hausdach, eigene Dächer, Dachteile, PV, Kamin, Dachfenster, Gaube"><ha-icon icon="mdi:home-roof"></ha-icon><span class="${wide ? "always" : ""}">Dach</span></button>`;
  },

  /** Dach-Ebene einer Etage an/aus (optional mit Auswahl). */
  _toggleRoofMode(on = !this.roofMode, { floorId = this.floorId, sel = null } = {}) {
    const moved = floorId !== this.floorId;
    Object.assign(this, { roofMode: on, floorId, tool: "select", sel, multi: [], draft: null, _roofUnit: sel?.unit ?? null });
    if (moved) this.fit();
    this.render();
    this.renderBar();
    this.renderProps();
    this._sync3d(true);
  },

  /** Zeile „Dach dieser Etage“ in den Etagen-Eigenschaften. */
  _floorRoofRow(f) {
    const names = roofUnits(this.b, f.id).map((u) => u.label).join(" · ");
    return `<p class="muted">Dach dieser Etage: ${names ? esc(names) : "keins"}</p><div class="btns"><button data-act="roofhere">Dach bearbeiten</button></div>`;
  },

  /** Umriss der Auswahl in der Dach-Ebene [[x0, z0], [x1, z1]] (Fläche, Dachteil, Ding) oder null. */
  _roofSelBounds() {
    const s = this.sel;
    const u = s ? findUnit(this.b, s.unit ?? "house") : null;
    if (!u) return null;
    let pts = [];
    if (s.kind === "roofitem") {
      const it = u.items.find((x) => x.id === s.id);
      if (it && Number.isFinite(it.x) && Number.isFinite(it.z)) pts = (u.model && roofItemFootprint(u.model, it)) || [[it.x - 1, it.z - 1], [it.x + 1, it.z + 1]];
    } else if (u.kind === "part") pts = u.spec?.points ?? [];
    else pts = unitFaces(u).faces.filter((f) => f.k === s.id).flatMap((f) => f.poly);
    pts = pts.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return [[Math.min(...xs), Math.min(...zs)], [Math.max(...xs), Math.max(...zs)]];
  },

  /** Übersicht der Dach-Ebene (nichts gewählt): Dächer der Etage, Hausdach, andere Etagen, Norden. */
  _roofOverview() {
    const f = this.floor;
    const house = roofModel(this.b);
    const units = roofUnits(this.b, f?.id, { houseModel: house });
    const hf = house?.floor ?? roofFloor(this.b, roofSettings(this.b.settings));
    let html = `<h3>Dächer auf „${esc(f?.name ?? "")}“</h3>`;
    if (units.length) html += `<div class="list">${units.map((u) => `<button data-rov="${esc(u.key)}">${esc(u.label)} · ${u.model ? esc(roofSummary(u.model.roof)) : "(zu klein)"}</button>`).join("")}</div>`;
    if (!units.some((u) => u.kind !== "house")) html += `<p class="muted">Noch kein eigenes Dach. Oben „Dach setzen“ wählen – z. B. Garage, Anbau, Erker oder Turm.</p>`;
    if (house && hf.id !== f?.id) html += `<p class="muted">Hausdach: ${esc(roofSummary(house.roof))} auf „${esc(hf.name)}“.</p><div class="btns"><button data-rfl="${esc(hf.id)}">Zum Hausdach</button></div>`;
    else if (!house && hf && hf.id !== f?.id) html += `<p class="muted">Kein Hausdach – die Dachform wählt man auf „${esc(hf.name)}“.</p><div class="btns"><button data-rfl="${esc(hf.id)}">Dorthin</button></div>`;
    const others = [...this.b.floors].filter((x) => x.id !== f?.id).sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
    if (others.length) {
      const btn = (x) => {
        const n = roofUnits(this.b, x.id, { house: false, houseModel: house }).length;
        return `<button data-rfl="${esc(x.id)}">${esc(x.name)}${house?.floor?.id === x.id ? " · Hausdach" : ""}${n ? ` (${n})` : ""}</button>`;
      };
      html += `<label>Andere Etagen:</label><div class="btns">${others.map(btn).join("")}</div>`;
    }
    html += canAdmin()
      ? `<label>Norden im Plan (° im Uhrzeigersinn ab oben)</label><div class="row3"><button data-nstep="-5">−5°</button><input data-north type="number" min="0" max="359" step="1" value="${Number(this.b.settings?.north) || 0}"><button data-nstep="5">+5°</button></div>`
      : `<p class="muted">Norden lässt sich nur mit der Admin-PIN einstellen (Admin-Einstellungen → Haus & Wetter).</p>`;
    return html;
  },

  _bindRoofOverview(el) {
    el.querySelectorAll("[data-rov]").forEach((b) =>
      b.addEventListener("click", () => {
        this.sel = { kind: "roofpart", unit: b.dataset.rov, id: 0 };
        this._roofUnit = b.dataset.rov;
        this.render();
        this.renderProps();
      }),
    );
    el.querySelectorAll("[data-rfl]").forEach((b) => b.addEventListener("click", () => this._toggleRoofMode(true, { floorId: b.dataset.rfl })));
    const setNorth = (v) => {
      this.changeBuilding((b) => {
        b.settings ??= {};
        b.settings.north = ((Math.round(Number(v) || 0) % 360) + 360) % 360;
      });
    };
    el.querySelector("[data-north]")?.addEventListener("change", (ev) => setNorth(ev.target.value));
    el.querySelectorAll("[data-nstep]").forEach((b) => b.addEventListener("click", () => setNorth((Number(this.b.settings?.north) || 0) + Number(b.dataset.nstep))));
  },

  /** Formular eines eigenen Dachs (Raum-Gruppe) oder eines freien Dachteils; k = gewählte Fläche. */
  _roofUnitProps(el, u, k, pad, bindPad) {
    const isPart = u.kind === "part";
    const raw = u.spec ?? {};
    const key = u.key;
    const fid = u.floorId;
    const act = (name, fn) => el.querySelector(`[data-ract="${name}"]`)?.addEventListener("click", fn);
    if (!u.model) {
      el.innerHTML = `<h3>${isPart ? `Dachteil: ${esc(NAMES[raw.type] ?? NAMES.gable)}` : `Dach: ${esc(u.label)}`}</h3><p class="muted">Dachteil ist zu klein oder verdreht – Ecken ziehen oder löschen.</p>${isPart ? pad() : ""}
        <div class="btns"><button data-ract="del" class="danger">${isPart ? "Löschen" : "Dach entfernen"}</button></div>`;
      act("del", () => void this._removeUnit(u));
      return bindPad();
    }
    const m = u.model;
    const s = m.roof;
    const type = s.type;
    const frames = m.parts ?? [];
    const fr = frames[k] ?? null;
    const floor = this.b.floors.find((x) => x.id === fid);
    const bb = m.shape?.bbox;
    const [L, B] = fr ? [fr.length, fr.width] : bb ? [bb[2] - bb[0], bb[3] - bb[1]] : [0, 0];
    const info = isPart
      ? `Auf ${esc(floor?.name ?? "")} · ${de(L)} × ${de(B)} m · höchster Punkt ${de(m.ridgeY)} m`
      : `Eigenes Dach auf „${esc(floor?.name ?? "")}“${frames.length ? ` · Fläche ${k + 1} von ${frames.length}` : ""} · ${de(L)} × ${de(B)} m`;
    const count = (t) => u.items.filter((x) => x?.type === t).length;
    const notes = [];
    if (type === "terrace") notes.push("Begehbarer Belag auf der Decke, Geländer an den freien Kanten. Möbel für die Terrasse auf der Etage darüber außerhalb der Räume stellen.");
    if (type === "cone" && !isPart && (u.rooms[0]?.points?.length ?? 0) < 12) notes.push("Kegeldach über eckigem Raum: Der Kreis umschließt den Raum. Für eckige Türme „Zeltdach“ wählen.");
    const colors = type === "terrace" ? "" : `<details><summary>Farben und Texturen</summary>${roofColorField("color", "Dachfarbe", raw.color)}${roofTexField("texture", "Dachdeckung (Textur)", raw.texture, "r")}
      ${roofColorField("gable_color", isPart ? "Giebel: Farbe (Standard = Außenwand)" : "Giebel: Farbe (Standard = Außenwand des Raums)", raw.gable_color)}${roofTexField("gable_texture", "Giebel: Textur", raw.gable_texture, "w")}</details>`;
    const adj = (Array.isArray(raw.adjust) ? raw.adjust : [])[k] ?? {};
    const edges = fr
      ? `<details open><summary>Kanten (Fläche ${k + 1})</summary>${adjustFieldsHtml(adj)}<div class="btns"><button data-ract="partreset">Diese Fläche zurücksetzen</button>${raw.adjust?.length ? `<button data-ract="allreset">Alle Flächen zurücksetzen</button>` : ""}<button data-ract="trim">An der Hauswand kürzen</button></div></details>`
      : "";
    let group = "";
    if (!isPart && GROUP_TYPES.includes(type)) {
      if (u.rooms.length > 1) group = `<p class="muted">Gemeinsames Dach von: ${esc(u.rooms.map((r) => r.name || r.id).join(", "))} – Einstellungen gelten für alle.</p><div class="btns">${u.rooms.map((r) => `<button data-ract="sep:${esc(r.id)}">„${esc(r.name || r.id)}“ abtrennen</button>`).join("")}</div>`;
      else if (raw.separate && this._joinable(u)) group = `<div class="btns"><button data-ract="join">Mit Nachbardach verbinden</button></div>`;
    }
    const cov = coveredBy(this.b, u);
    const overlap = !isPart && (roofModel(this.b)?.rooms ?? []).some((r) => u.rooms.some((x) => x.id === r.id));
    const warn = `${cov.length ? `<p class="muted">Achtung: liegt unter „${esc(cov.map((x) => x.name).join(", "))}“ – von außen nicht zu sehen.</p>` : ""}${overlap ? `<p class="muted">Liegt auch unter dem Hausdach.</p><div class="btns"><button data-ract="housereset">Kanten des Hausdachs zurücksetzen</button></div>` : ""}`;
    const btns = isPart
      ? `<div class="btns">${this.sel?.vertex != null && (raw.points?.length ?? 0) > 3 && type !== "cone" ? `<button data-ract="delvertex">Gewählte Ecke löschen</button>` : ""}<button data-ract="dup">Duplizieren</button>${type === "cone" && !u.rooms.length ? `<button data-ract="tower">Runden Raum darunter anlegen</button>` : ""}<button data-ract="del" class="danger">Löschen</button></div>`
      : `<p class="muted">„In Dachteil umwandeln“: Die Ecken lassen sich danach frei ziehen; das Dach folgt dem Raum dann nicht mehr.</p><div class="btns"><button data-ract="toparts">In Dachteil umwandeln</button><button data-ract="del" class="danger">Dach entfernen</button></div>`;
    const hint = isPart
      ? type === "cone"
        ? "Orangen Punkt ziehen oder Durchmesser eingeben ändert die Größe, Fläche ziehen oder Pfeiltasten verschieben, Entf löscht."
        : "Ecken ziehen, „+“ fügt eine Ecke ein, Fläche ziehen oder Pfeiltasten verschieben, Entf löscht."
      : fr ? "Orange Punkte ziehen verschiebt eine Kante, Fläche ziehen oder Pfeiltasten verschieben die Fläche, Entf setzt sie zurück." : "";
    el.innerHTML = `<h3>${isPart ? `Dachteil: ${esc(NAMES[type])}` : `Dach: ${esc(u.label)}`}</h3>
      <p class="muted">${esc(roofSummary(s))}<br>${info}</p>
      <label>Dachform</label><select data-rr="type">${ROOF_PART_TYPES.map(([t, n]) => `<option value="${t}"${t === type ? " selected" : ""}>${n}</option>`).join("")}</select>
      ${isPart ? `<label>Name</label><input data-rname maxlength="60" value="${esc(raw.name ?? "")}" placeholder="z. B. Garage">` : ""}
      ${roofFieldsHtml(s, { kind: u.kind, type, frames, diameter: isPart && type === "cone" ? 2 * circleOf(raw.points).r : null })}
      ${notes.map((t) => `<p class="muted">${t}</p>`).join("")}${colors}${edges}
      <p class="muted">Auf diesem Dach: ${count("pv")} PV-Felder · ${count("chimney")} Kamine · ${count("skylight")} Dachfenster · ${count("dormer")} Gauben. Werkzeug oben wählen und aufs Dach tippen.</p>
      ${group}${warn}${isPart || fr ? pad() : ""}${btns}${hint ? `<p class="muted">${hint}</p>` : ""}`;
    const set = (fn, opts) => {
      this.changeUnit(key, fn, opts);
      this.renderProps();
    };
    bindRoofFields(el, (name, v) => {
      if (name === "diameter") {
        const h0 = houseRoomIds(this.b);
        const c = circleOf(raw.points).center;
        set((p) => {
          p.points = circlePoints(c, clampRoof("diameter", v) / 2);
        });
        return this._houseGuard(h0);
      }
      let bumped = false;
      set((r) => {
        applyRoofKey(r, name, v, name === "type" ? v : type);
        // Mansarddach: unten mindestens 5° steiler als oben
        if ((r.type ?? type) === "mansard" && ["pitch", "pitch_low", "type"].includes(name)) {
          const p = Number(r.pitch) || PART_PITCH.mansard;
          if ((Number(r.pitch_low) || 70) < p + 5) {
            r.pitch_low = Math.min(85, p + 5);
            bumped = true;
          }
        }
      }, { note: () => (bumped ? "Unten muss das Dach steiler sein als oben – Neigung unten wurde angehoben." : "") });
    });
    el.querySelector("[data-rname]")?.addEventListener("change", (ev) =>
      set((p) => {
        const v = ev.target.value.trim().slice(0, 60);
        if (v) p.name = v;
        else delete p.name;
      }),
    );
    bindAdjustFields(el, (side, v) =>
      set((r) => {
        setEdge(r, k, side, v);
      }),
    );
    act("partreset", () =>
      set((r) => {
        setAdjust(r, k, {});
      }),
    );
    act("allreset", () =>
      set((r) => {
        delete r.adjust;
      }),
    );
    act("trim", () => {
      const res = trimToHouse(this.b, u);
      if (!res) return this._toast("Keine Kante liegt an einer Hauswand.");
      set((r) => {
        r.adjust = res.adjust;
      });
      this._toast(`Überstand an der Hauswand entfernt (${res.count} Kanten).`);
    });
    el.querySelectorAll("[data-ract^='sep:']").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.ract.slice(4);
        const rest = u.rooms.find((r) => r.id !== id);
        const report = {};
        this.changeBuilding((bb) => {
          setSeparate(bb, fid, id, true, report);
          const left = rest ? findUnit(bb, unitKey("room", fid, rest.id))?.key : null;
          this.sel = left ? { kind: "roofpart", unit: left, id: 0 } : null;
          this._roofUnit = left ?? null;
        });
        this._toast(`„${this._roomNames([id])}“ hat jetzt ein eigenes Dach.${report.droppedAdjust ? " Kanten-Anpassungen zurückgesetzt (die Dachform hat sich geändert)." : ""}`);
      }),
    );
    act("join", () => {
      const report = {};
      this.changeBuilding((bb) => {
        const k2 = setSeparate(bb, fid, u.rooms[0].id, false, report);
        if (k2) editUnit(bb, k2, () => {}, report);
        this.sel = k2 ? { kind: "roofpart", unit: k2, id: 0 } : null;
        this._roofUnit = k2 ?? null;
      });
      const g = this.sel ? findUnit(this.b, this.sel.unit) : null;
      this._toast(`Verbunden – es gelten die Einstellungen von „${g?.rooms[0]?.name ?? ""}“.`);
    });
    act("housereset", () => {
      this.changeUnit("house", (r) => {
        delete r.adjust;
      });
      this.renderProps();
    });
    act("toparts", () => this._unitToParts(key));
    act("del", () => void this._removeUnit(u));
    act("dup", () => void this._partDup(key));
    act("tower", () => this._partTower(key));
    act("delvertex", () => {
      const i = this.sel?.vertex;
      const pts = (raw.points ?? []).filter((_, j) => j !== i);
      if (!validPolygon(pts)) return this._toast("Zu klein – mindestens 0,1 m².");
      const h0 = houseRoomIds(this.b);
      this.sel = { kind: "roofpart", unit: key, id: 0 };
      set((p) => {
        p.points = pts;
      });
      this._houseGuard(h0);
    });
    bindPad();
  },

  /** Ließe sich ein abgetrenntes Raumdach wieder mit einem Nachbardach verbinden? */
  _joinable(u) {
    const copy = structuredClone(this.b);
    const k = setSeparate(copy, u.floorId, u.rooms[0].id, false);
    return (findUnit(copy, k)?.rooms.length ?? 0) > 1;
  },

  /** „Dach entfernen“ (Raum-Gruppe) bzw. „Löschen“ (Dachteil): eine Rückfrage, ein Rückgängig-Schritt. */
  async _removeUnit(u) {
    const mutate = (b) => {
      if (u.kind === "part") deletePart(b, u.key);
      else for (const r of u.rooms) removeRoomRoof(b, u.floorId, r.id);
    };
    const n = u.items.length;
    const g = await this._houseConfirm(mutate, (c) => `Das Hausdach deckt dann „${this._roomNames(missing(c.after, c.before))}“ mit – seine Kanten-Anpassungen werden zurückgesetzt.`, n ? "Entfernen" : "Weiter", n ? `Dach von „${u.label}“ entfernen? ${n} Dinge darauf (PV, Kamin …) werden mitgelöscht.` : "");
    if (!g.go) return this.renderProps();
    this.sel = null;
    this._roofUnit = null;
    this.changeBuilding((b) => {
      mutate(b);
      if (g.reset) delete b.settings.roof.adjust;
    });
    const msg = [u.kind === "part" ? "Dachteil gelöscht (Rückgängig möglich)." : "", g.reset ? `Das Hausdach deckt jetzt „${this._roomNames(missing(g.c.after, g.c.before))}“ mit – seine Kanten-Anpassungen sind zurückgesetzt.` : ""].filter(Boolean).join(" ");
    if (msg) this._toast(msg);
  },

  /**
   * Eigenes Dach für einen Raum anlegen (Rückfrage, wenn das Hausdach dadurch Kanten-Anpassungen verliert).
   * after(res) läuft vor dem Hinweis (z. B. Auswahl setzen). → {key, joined} | null (abgebrochen)
   */
  async _addRoomRoofAt(fid, room, type, after = null) {
    const name = room.name || room.id;
    const g = await this._houseConfirm((c) => {
      addRoomRoof(c, fid, room.id, type);
    }, `„${name}“ liegt unter dem Hausdach. Eigenes Dach geben? Das Hausdach spart den Raum dann aus; seine Kanten-Anpassungen werden zurückgesetzt.`, "Eigenes Dach");
    if (!g.go) return null;
    let res = null;
    const report = {};
    this.changeBuilding((b) => {
      res = addRoomRoof(b, fid, room.id, type, report);
      if (g.reset) delete b.settings.roof.adjust;
    });
    after?.(res);
    const joined = res?.joined ? findUnit(this.b, res.key) : null;
    // ohne after bleibt die Auswahl beim Raum: Neigung und „abtrennen“ stehen dann unter „Im Dach bearbeiten“
    const there = after ? "rechts" : "unter „Im Dach bearbeiten“";
    let msg = joined
      ? `Dach mit „${joined.rooms.filter((r) => r.id !== room.id).map((r) => r.name || r.id).join(" + ")}“ verbunden – ${there} „abtrennen“ für ein eigenes Dach.`
      : `Dach für „${name}“ angelegt – ${after ? "Form und Neigung rechts einstellen" : "Neigung und Kanten unter „Im Dach bearbeiten“"}.`;
    if (g.reset) msg = `Das Hausdach spart „${this._roomNames(missing(g.c.before, g.c.after))}“ jetzt aus – seine Kanten-Anpassungen sind zurückgesetzt.`;
    if (report.droppedAdjust) msg += " Kanten-Anpassungen zurückgesetzt (die Dachform hat sich geändert).";
    if (report.adopted) msg += ` ${adoptedText(report.adopted)}`;
    const cov = res?.key ? coveredBy(this.b, findUnit(this.b, res.key)) : [];
    if (cov.length) msg += ` Achtung: liegt unter „${cov.map((x) => x.name).join(", ")}“ – von außen nicht zu sehen.`;
    this._toast(msg);
    return res;
  },

  /** „Dach setzen“ im Modus „Auf Raum tippen“: eigenes Dach für den Raum unter p. */
  async _roofRoomTap(p) {
    const f = this.floor;
    const r = f ? roomAt(f, p) : null;
    if (!r) return this._toast("Dort ist kein Raum – auf einen Raum dieser Etage tippen.");
    const name = r.name || r.id;
    const pick = (unit) => {
      Object.assign(this, { sel: { kind: "roofpart", unit, id: 0 }, _roofUnit: unit, tool: "select", draft: null });
      this.renderBar();
      this.render();
      this.renderProps();
    };
    const have = unitForRoom(this.b, f.id, r.id);
    if (have) {
      pick(have.key);
      return this._toast(`„${name}“ hat schon ein Dach – rechts die Dachform ändern.`);
    }
    const part = partOver(this.b, f.id, r);
    if (part) {
      pick(unitKey("part", f.id, part.id));
      return this._toast(`„${name}“ liegt unter dem Dachteil „${part.name || NAMES[part.type] || ""}“ – dort die Dachform ändern oder das Teil löschen.`);
    }
    await this._addRoomRoofAt(f.id, r, this._roofAdd?.type ?? "gable", (res) => {
      if (res?.key) pick(res.key);
    });
  },

  /** Raum-Eigenschaften: eigenes Dach (Form), Kurzzeile und „Im Dach bearbeiten“. */
  _roomRoofField(f, r) {
    const u = unitForRoom(this.b, f.id, r.id);
    const part = u ? null : partOver(this.b, f.id, r);
    const cur = u ? roomRoofType(r) : "none";
    const opt = (k) => `<option value="${k}"${k === cur ? " selected" : ""}>${NAMES[k]}</option>`;
    let html = `<label>Eigenes Dach (Garage, Anbau, Erker, Turm, Dachterrasse)</label><select data-rrt${part ? " disabled" : ""}>${["none", ...GROUP_TYPES].map(opt).join("")}<optgroup label="Weitere Formen (je Raum ein Dach)">${SINGLE_TYPES.map(opt).join("")}</optgroup></select>`;
    if (part) html += `<p class="muted">Über diesem Raum liegt ein Dachteil (Dach-Ebene) – kein automatisches Dach. Form und Neigung am Dachteil ändern.</p>`;
    else if (u) {
      const others = u.rooms.filter((x) => x.id !== r.id).map((x) => x.name || x.id);
      html += `<p class="muted">${esc(roofSummary(u.model?.roof ?? u.spec))}${others.length ? ` · gemeinsam mit „${esc(others.join(", "))}“` : ""}. Neigung, Kanten, PV und Kamin: „Im Dach bearbeiten“.</p>`;
      if (cur === "terrace") html += `<p class="muted">Begehbarer Belag auf der Decke, Geländer an den freien Kanten. Möbel für die Terrasse auf der Etage darüber außerhalb der Räume stellen.</p>`;
      if (isPvShed(r) && u.items.some((x) => x?.type === "pv")) html += `<p class="muted">Die Anzahl gilt nur ohne PV-Felder auf dem Dach.</p>`;
    }
    return `${html}${u || part ? `<div class="btns"><button data-rract="edit">Im Dach bearbeiten</button></div>` : ""}`;
  },

  _bindRoomRoofField(el, r) {
    const fid = this.floorId;
    el.querySelector("[data-rrt]")?.addEventListener("change", async (ev) => {
      const type = ev.target.value;
      const u = unitForRoom(this.b, fid, r.id);
      if (type === "none") {
        if (!u) return this.renderProps();
        const lost = u.rooms.length > 1 ? 0 : u.items.length;
        const mutate = (c) => {
          removeRoomRoof(c, fid, r.id);
        };
        const g = await this._houseConfirm(mutate, (c) => `Das Hausdach deckt dann „${this._roomNames(missing(c.after, c.before))}“ mit – seine Kanten-Anpassungen werden zurückgesetzt.`, lost ? "Entfernen" : "Weiter", lost ? `Dach von „${u.label}“ entfernen? ${lost} Dinge darauf (PV, Kamin …) werden mitgelöscht.` : "");
        if (!g.go) return this.renderProps(); // Auswahl springt zurück
        this.changeBuilding((b) => {
          mutate(b);
          if (g.reset) delete b.settings.roof.adjust;
        });
        if (g.reset) this._toast(`Das Hausdach deckt jetzt „${this._roomNames(missing(g.c.after, g.c.before))}“ mit – seine Kanten-Anpassungen sind zurückgesetzt.`);
        return;
      }
      if (!u) await this._addRoomRoofAt(fid, r, type);
      else
        this.changeUnit(u.key, (x) => {
          x.type = type;
        });
      this.renderProps();
    });
    el.querySelector("[data-rract=edit]")?.addEventListener("click", () => {
      const u = unitForRoom(this.b, fid, r.id);
      const part = u ? null : partOver(this.b, fid, r);
      const key = u?.key ?? (part ? unitKey("part", fid, part.id) : null);
      if (key) this._toggleRoofMode(true, { sel: { kind: "roofpart", unit: key, id: 0 } });
    });
  },
};

/** Name eines Dings auf dem Dach (für Hinweise). */
export const roofItemName = (it) => it?.name || ROOF_ITEMS[it?.type]?.name || "Ding";

/** Hinweis: n Dinge des Hausdachs liegen jetzt auf dem neuen Dach. */
export const adoptedText = (n) => (n === 1 ? "1 Ding vom Hausdach (PV, Kamin …) liegt jetzt auf diesem Dach." : `${n} Dinge vom Hausdach (PV, Kamin …) liegen jetzt auf diesem Dach.`);
