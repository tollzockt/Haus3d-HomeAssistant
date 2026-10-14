// Leitungen im Editor (Mixin für FloorEditor): Werkzeug „Leitung“ – Strom, Netzwerk und Wasser kalt/warm an
// Decke, Wand oder Boden verlegen. Punkte rasten an Raumkanten (Wand) und Ecken ein; die Höhe gilt je Punkt
// (Stufen bis zur Decke, Standard je Medium), ein Höhenwechsel wird an der Wand senkrecht geführt. Anfang und
// Ende rasten auch an Geräten ein (Möbel, platzierte Geräte; pipe.ends, pipeends.js) und ziehen mit (follow-pipes.js).

import { allIds, newId } from "./edit-ops.js";
import { FURNITURE } from "./furniture.js";
import { PIPE_TYPES, pipeColor } from "./pipes.js";
import { PIPE_LEVELS, ceilingAlong, clearHeight, defaultLevel, floorRoofModels, levelHeight, levelName, levelOf } from "./pipelevels.js";
import { nodeMedium, remapJoints } from "./pipenet.js";
import { deviceSnap, endDevice, endTarget, pipeEnds, unplugEnd } from "./pipeends.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const de = (v, d = 2) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const WALL_GAP = 0.06; // Abstand Rohrmitte zur Wandoberfläche

export const PIPE_HINT = "Leitung: Punkte antippen – rastet an Wänden und Ecken ein, außerdem an Verteilern, Leitungen und Geräten (Ring; an Leitungen als Abzweig, auch mit Zwischenpunkten; an Möbeln und platzierten Geräten als Anschluss, der beim Verschieben mitgeht; am Finger mit größerem Fangkreis). Höhe rechts wählen – Strom und Netzwerk liegen standardmäßig an der Decke, Wasser am Boden; ein Wechsel geht an der Wand senkrecht. „Fertig“ beendet. Gewählte Leitung: Punkte ziehen, Strecke antippen fügt einen Punkt ein.";
const JUNCTION_PX = 14; // Fangradius für Abzweige (Bildschirm; am Finger größer)

export const PipeMethods = {
  /** Werkzeug-Einstellungen: Medium und gewählte Höhe (pick: null = Standard des Mediums, Stufen-Schlüssel oder Zahl in m). */
  _pipeOpts() {
    this.pipeOpts ??= { type: "strom", pick: null };
    return this.pipeOpts;
  },

  /** Höhe (m über dem Boden) eines neuen Punkts q nach last für die Wahl pick; Decke = unter Decke bzw. Dachschräge entlang last → q. */
  _pipeHeight(q, last = null, pick = this._pipeOpts().pick) {
    const clear = clearHeight(this.b, this.floor);
    if (typeof pick === "number") return r3(Math.max(0, Math.min(pick, clear)));
    const lv = pick ?? defaultLevel(this._pipeOpts().type);
    if (lv === "decke") return levelHeight("decke", ceilingAlong(this.b, this.floor, last ?? q, q));
    return levelHeight(lv, clear);
  },

  /**
   * Punkt an den Entwurf anhängen (Höhe nach der aktuellen Wahl); junction = auf einer Leitung bzw. an einem
   * Verteiler; dev = Gerät an diesem Punkt (pipeends.deviceSnap; zählt am Anfang und am Ende der Leitung).
   */
  _pipeAddPoint(q, junction = false, dev = null) {
    const d = this.draft;
    const pick = this._pipeOpts().pick;
    d.heights ??= [];
    d.picks ??= [];
    d.heights.push(this._pipeHeight(q, d.line.at(-1) ?? null, pick));
    d.picks.push(pick);
    d.line.push(q);
    if (junction) (d.joints ??= []).push(d.line.length - 1);
    // je Stelle überschrieben – nach „Punkt zurück“ gilt so der Bezug des neuen Punkts
    (d.devs ??= [])[d.line.length - 1] = dev?.ref ? { ...dev.ref } : null;
  },

  /** Gleiche Wahl wie beim letzten Punkt (gleiche Stufe, null = Standard des Mediums, oder gleiche Höhe)? */
  _samePick(d, h) {
    const o = this._pipeOpts();
    const std = defaultLevel(o.type);
    const key = (k) => (typeof k === "number" ? null : k ?? std);
    const prev = d.picks?.length === d.line.length ? d.picks.at(-1) : null;
    if (key(prev) && key(prev) === key(o.pick)) return true;
    return Math.abs((d.heights?.at(-1) ?? NaN) - h) < 1e-6;
  },

  /** Medium gewechselt: Entwurfspunkte mit Standard-Höhe für das neue Medium neu berechnen. */
  _pipeRetype() {
    const d = this.draft;
    if (!d?.pipe) return;
    d.line.forEach((q, i) => {
      if ((d.picks?.[i] ?? null) === null) d.heights[i] = this._pipeHeight(q, i ? d.line[i - 1] : null, null);
    });
  },

  /** Wandoberflächen der Etage (zwischengespeichert, solange sich die Etage nicht ändert). */
  _pipeFaces() {
    const f = this.floor;
    if (this._pfCache?.floor !== f) this._pfCache = { floor: f, faces: this._faces() };
    return this._pfCache.faces;
  },

  /**
   * Punkt an der nächsten Wandoberfläche (knapp davor, im Raum), in Ecken an beiden Wänden;
   * sonst 0/45/90° zum letzten Punkt bzw. Raster.
   */
  _pipeSnap(ev, p, last, { exclude = null, type = this._pipeOpts().type, skipNode = null, devices = this.tool === "pipe" } = {}) {
    // Abzweig: an Verteiler oder bestehender Leitung desselben Mediums einrasten, Anschluss an einem Gerät
    // (devices: beim Zeichnen und beim Ziehen eines Leitungsendes) – Vorrang vor der Wand
    const j = this._pipeJunction(p, { exclude, type, skipNode, devices });
    this._snapJunction = !!j && !j.dev;
    this._snapDevice = j?.dev ?? null;
    if (j) return j.q;
    const tol = Math.max(0.25, this._snapTol() * 1.5);
    const hits = [];
    for (const f of this._pipeFaces()) {
      const rel = [p[0] - f.p[0], p[1] - f.p[1]];
      const along = rel[0] * f.u[0] + rel[1] * f.u[1];
      const dist = rel[0] * f.n[0] + rel[1] * f.n[1];
      if (along < f.t0 - tol || along > f.t1 + tol || dist < -0.05 || dist > tol) continue;
      hits.push({ f, along: Math.min(f.t1, Math.max(f.t0, along)), dist });
    }
    hits.sort((a, b) => a.dist - b.dist);
    const best = hits[0];
    if (best) {
      const { f } = best;
      // Linie der Leitung vor dieser Wand: o + u·t
      const o = [f.p[0] + f.n[0] * WALL_GAP, f.p[1] + f.n[1] * WALL_GAP];
      // Ecke: zweite, nicht parallele Wand ebenfalls nah → Schnittpunkt beider Linien
      const other = hits.find((h) => h !== best && Math.abs(h.f.u[0] * f.u[1] - h.f.u[1] * f.u[0]) > 0.3);
      if (other) {
        const g = other.f;
        const o2 = [g.p[0] + g.n[0] * WALL_GAP, g.p[1] + g.n[1] * WALL_GAP];
        const den = f.u[0] * g.u[1] - f.u[1] * g.u[0];
        const t = ((o2[0] - o[0]) * g.u[1] - (o2[1] - o[1]) * g.u[0]) / den;
        const q = [o[0] + f.u[0] * t, o[1] + f.u[1] * t];
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tol * 1.5) return [r3(q[0]), r3(q[1])];
      }
      const along = (p[0] - o[0]) * f.u[0] + (p[1] - o[1]) * f.u[1];
      return [r3(o[0] + f.u[0] * along), r3(o[1] + f.u[1] * along)];
    }
    return last ? this._wallSnap(last, p, this._free(ev)) : this._snap(p);
  },

  /**
   * Punkt auf einer Leitung bzw. an einem Verteiler in Fangweite, mit devices auch an einem Gerät:
   * {q, dev} (dev = Gerät aus pipeends.deviceSnap, sonst null) oder null.
   */
  _pipeJunction(p, { exclude = null, type = null, skipNode = null, devices = false } = {}) {
    if (this._free?.()) return null;
    const tol = Math.max(0.12, (this.coarse ? 24 : JUNCTION_PX) / (this.scale || 40));
    // Verteiler und Leitungen behalten Vorrang, wenn sie näher liegen (5 mm Spielraum: ein Leitungsende, das
    // schon am Anschluss liegt, zählt als dasselbe Gerät)
    const choose = (best) => {
      const dev = devices ? deviceSnap(this.floor, p, tol) : null;
      if (dev && (!best || best.d >= dev.d - 0.005)) return { q: dev.q, dev };
      return best ? { q: best.q, dev: null } : null;
    };
    let best = null;
    for (const n of this.floor.nodes ?? []) {
      if (n.id === skipNode) continue;
      // Verteiler nur für ihr Medium (Durchführung für alle)
      const m = nodeMedium(n.kind);
      if (type && m && type !== m) continue;
      const d = Math.hypot(p[0] - n.x, p[1] - n.z);
      if (d < tol && (!best || d < best.d)) best = { d, q: [n.x, n.z] };
    }
    if (best) return choose(best);
    for (const l of this.floor.pipes ?? []) {
      if (l.id === exclude || (type && l.type !== type)) continue;
      for (let i = 0; i < l.points.length - 1; i++) {
        const a = l.points[i];
        const b = l.points[i + 1];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const l2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
        const q = [a[0] + dx * t, a[1] + dz * t];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < tol && (!best || d < best.d)) best = { d, q: [r3(q[0]), r3(q[1])] };
      }
    }
    return choose(best);
  },

  /** Name eines Geräts am Leitungsende (Möbel: Name bzw. Art; platziertes Gerät: Anzeigename); fehlt es: null. */
  _endName(ref, floor = this.floor) {
    const t = endTarget(floor, ref);
    if (!t) return null;
    if (t.kind === "placement") return this.hass?.states?.[t.item.entity_id]?.attributes?.friendly_name ?? t.item.entity_id;
    return t.item.name || FURNITURE[t.item.type]?.[0] || t.item.type || "Gerät";
  },

  _pipeTap(ev, p) {
    const d = this.draft;
    if (!d?.pipe) {
      this.draft = { pipe: true, line: [], heights: [], picks: [] };
      const q = this._pipeSnap(ev, p, null);
      this._pipeAddPoint(q, false, this._snapDevice);
    } else {
      const last = d.line.at(-1);
      const q = this._pipeSnap(ev, p, last);
      // Punkt auf einer anderen Leitung bzw. an einem Verteiler: wird verbunden (auch mitten in der Leitung)
      const junction = this._snapJunction;
      const dev = this._snapDevice;
      // zweites Antippen an derselben Stelle mit gleicher Höhenwahl beendet; mit anderer Wahl = senkrechter Wechsel
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.05 && this._samePick(d, this._pipeHeight(q, last))) return this._finishPipe();
      this._pipeAddPoint(q, junction, dev);
    }
    this.render();
  },

  /** Vorhandene Leitungen und der Entwurf im Plan. */
  _pipeParts(px, P) {
    const parts = [];
    for (const l of this.floor.pipes ?? []) {
      const sel = this.sel?.kind === "pipe" && this.sel.id === l.id;
      const c = pipeColor(l.type);
      parts.push(`<polyline data-kind="pipe" data-id="${esc(l.id)}" points="${l.points.map(P).join(" ")}" fill="none" stroke="${c}" stroke-width="${px(sel ? 6 : 4)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${sel ? 1 : 0.85}" style="cursor:pointer"/>`);
      // Höhenwechsel: kleiner Kreis
      l.points.forEach((q, i) => {
        if (i && Math.abs((l.heights?.[i] ?? l.height) - (l.heights?.[i - 1] ?? l.height)) > 1e-6) parts.push(`<circle cx="${r3(l.points[i - 1][0])}" cy="${r3(l.points[i - 1][1])}" r="${px(5)}" fill="#fff" stroke="${c}" stroke-width="${px(2)}" pointer-events="none"/>`);
      });
      if (sel) {
        const s = l.points[0];
        parts.push(`<text x="${r3(s[0])}" y="${r3(s[1] - px(12))}" text-anchor="middle" font-size="${px(11)}" fill="${c}" font-weight="600" pointer-events="none">Anfang</text>`);
        // Punkte als Griffe (ziehen = verschieben, antippen = Höhe dieses Punkts)
        l.points.forEach((q, i) => {
          const on = this.pipePt?.id === l.id && this.pipePt.i === i;
          parts.push(`<circle data-kind="pipept" data-id="${esc(l.id)}" data-i="${i}" cx="${r3(q[0])}" cy="${r3(q[1])}" r="${px(this.coarse ? 11 : 7)}" fill="${on ? c : "#fff"}" stroke="${c}" stroke-width="${px(2.5)}" style="cursor:move"/>`);
        });
      }
      // Enden an Geräten: kleiner Stecker
      const devs = pipeEnds(l, this.floor);
      if (devs.a) parts.push(this._plugMark(px, l.points[0], c, `data-plug="a" data-id="${esc(l.id)}"`));
      if (devs.b) parts.push(this._plugMark(px, l.points.at(-1), c, `data-plug="b" data-id="${esc(l.id)}"`));
    }
    const d = this.draft;
    if (d?.pipe) {
      const pts = [...d.line, ...(d.hover ? [d.hover] : [])];
      const c = pipeColor(this._pipeOpts().type);
      parts.push(`<polyline points="${pts.map(P).join(" ")}" fill="none" stroke="${c}" stroke-width="${px(4)}" stroke-dasharray="${px(8)} ${px(4)}" stroke-linecap="round"/>`);
      d.line.forEach((q, i) => parts.push(d.devs?.[i] && (i === 0 || i === d.line.length - 1) ? this._plugMark(px, q, c) : `<circle cx="${r3(q[0])}" cy="${r3(q[1])}" r="${px(4)}" fill="${c}"/>`));
      const e = d.line.at(-1);
      const h = d.heights?.at(-1);
      if (e && Number.isFinite(h)) parts.push(`<text x="${r3(e[0] + px(8))}" y="${r3(e[1] + px(16))}" font-size="${px(11)}" fill="${c}" font-weight="600" stroke="#fff" stroke-width="${px(3)}" paint-order="stroke" pointer-events="none">${de(h)} m</text>`);
      if (d.hover && this._snapJunction) parts.push(`<circle cx="${r3(d.hover[0])}" cy="${r3(d.hover[1])}" r="${px(9)}" fill="none" stroke="${c}" stroke-width="${px(2.5)}" pointer-events="none"/><text x="${r3(d.hover[0])}" y="${r3(d.hover[1] - px(13))}" text-anchor="middle" font-size="${px(11)}" fill="${c}" font-weight="600" pointer-events="none">Abzweig</text>`);
      // Gerät am Zeiger: eckiger Ring und Name
      const dev = d.hover && this._snapDevice ? this._endName(this._snapDevice.ref) : null;
      if (dev) parts.push(`<rect x="${r3(d.hover[0] - px(9))}" y="${r3(d.hover[1] - px(9))}" width="${px(18)}" height="${px(18)}" rx="${px(4)}" fill="none" stroke="${c}" stroke-width="${px(2.5)}" pointer-events="none"/><text x="${r3(d.hover[0])}" y="${r3(d.hover[1] - px(14))}" text-anchor="middle" font-size="${px(11)}" fill="${c}" font-weight="600" stroke="#fff" stroke-width="${px(3)}" paint-order="stroke" pointer-events="none">${esc(dev)}</text>`);
    }
    return parts.join("");
  },

  /** Stecker-Symbol an einem Leitungsende (Plan): kleines Quadrat in der Farbe der Leitung mit weißem Rand. */
  _plugMark(px, q, c, attrs = "") {
    const s = px(11);
    return `<rect ${attrs} x="${r3(q[0] - s / 2)}" y="${r3(q[1] - s / 2)}" width="${s}" height="${s}" rx="${px(2.5)}" fill="${c}" stroke="#fff" stroke-width="${px(2)}" pointer-events="none"/><line x1="${r3(q[0] - s / 5)}" y1="${r3(q[1])}" x2="${r3(q[0] + s / 5)}" y2="${r3(q[1])}" stroke="#fff" stroke-width="${px(1.5)}" pointer-events="none"/>`;
  },

  _finishPipe() {
    const d = this.draft;
    this.draft = null;
    if (!d?.pipe || d.line.length < 2) return this.render();
    const o = this._pipeOpts();
    const heights = d.line.map((_, i) => r3(Number.isFinite(d.heights?.[i]) ? d.heights[i] : this._pipeHeight(d.line[i], d.line[i - 1] ?? null, null)));
    const pipe = { id: newId("leitung", new Set([...allIds(this.b), ...this.b.floors.flatMap((f) => (f.pipes ?? []).map((x) => x.id))])), type: o.type, points: d.line.map((q) => [r3(q[0]), r3(q[1])]), heights, height: heights.at(-1), entity: null, room: null };
    o.pick = null;
    const joints = remapJoints(d.joints, { n: pipe.points.length });
    if (joints.length) pipe.joints = joints;
    // Anfang/Ende an einem Gerät
    const ra = d.devs?.[0];
    const rb = d.devs?.[d.line.length - 1];
    if (ra || rb) pipe.ends = { ...(ra ? { a: { ...ra } } : {}), ...(rb ? { b: { ...rb } } : {}) };
    const at = [ra && `Anfang an ${this._endName(ra)}`, rb && `Ende an ${this._endName(rb)}`].filter(Boolean);
    this.change((fl) => {
      fl.pipes = [...(fl.pipes ?? []), pipe];
    });
    this.sel = { kind: "pipe", id: pipe.id };
    this.tool = "select";
    this.renderBar();
    this.render();
    this.renderProps();
    this._toast(`${PIPE_TYPES.find((t) => t[0] === pipe.type)[1]}: ${pipe.points.length} Punkte${joints.length ? `, ${joints.length} Abzweig${joints.length > 1 ? "e" : ""} unterwegs` : ""}${at.length ? `, ${at.join(", ")}` : ""} – rechts Sensor oder Zielraum wählen.`);
  },

  /** Stufenknöpfe (data-lv, data-h = Höhe bei dieser Decke); cur = gewählte Stufe. */
  _pipeLevels(attr, ceil, cur, attic = false) {
    return `<div class="seg wide" ${attr}>${PIPE_LEVELS.map(([k, n]) => {
      const h = levelHeight(k, ceil);
      const title = k === "decke" ? (attic ? "15 cm unter Decke bzw. Dachschräge" : `15 cm unter der Decke (${de(h)} m)`) : `${de(h)} m über dem Boden`;
      return `<button data-lv="${k}" data-h="${h}" class="${cur === k ? "sel" : ""}" title="${title}">${n}</button>`;
    }).join("")}</div>`;
  },

  /** Eingabe einer eigenen Höhe (m): endlich, 0 … max; sonst null. */
  _pipeNum(v, max) {
    const raw = String(v ?? "").trim().replace(",", ".");
    const n = raw === "" ? NaN : Number(raw);
    return Number.isFinite(n) ? r3(Math.max(0, Math.min(max, n))) : null;
  },

  /** Eigenschaften, solange das Werkzeug „Leitung“ aktiv ist. */
  _pipeToolProps(el) {
    const o = this._pipeOpts();
    const clear = clearHeight(this.b, this.floor);
    const attic = !!floorRoofModels(this.b, this.floor);
    const std = defaultLevel(o.type);
    const cur = typeof o.pick === "number" ? null : o.pick ?? std;
    const medium = PIPE_TYPES.find((t) => t[0] === o.type)?.[1] ?? o.type;
    const stdH = std === "decke" ? (attic ? "15 cm unter Decke bzw. Dachschräge" : `${de(levelHeight(std, clear))} m, 15 cm unter der Decke`) : `${de(levelHeight(std, clear))} m`;
    el.innerHTML = `<h3>Leitung legen</h3>
      <div class="seg wide" data-ptype>${PIPE_TYPES.map(([k, n]) => `<button data-k="${k}" class="${o.type === k ? "sel" : ""}">${n}</button>`).join("")}</div>
      <label>Höhe der nächsten Punkte</label>
      ${this._pipeLevels("data-pheight", clear, cur, attic)}
      <div class="row2"><div><label>eigene Höhe (m)</label><input type="number" step="0.05" min="0" max="${clear}" data-phn value="${typeof o.pick === "number" ? o.pick : ""}"></div><div><label>&nbsp;</label><button data-act="plvstd"${o.pick == null ? " disabled" : ""}>Standard</button></div></div>
      <p class="muted">Standard für ${esc(medium)}: ${levelName(std)} (${stdH}). Jede neue Leitung beginnt auf dieser Höhe.</p>
      <p class="muted">${PIPE_HINT}</p>
      <p class="muted">Vom Anfang (z. B. Zählerschrank, Hauswasser) zum Verbraucher zeichnen – so fließt es in die richtige Richtung.</p>`;
    el.querySelectorAll("[data-ptype] [data-k]").forEach((b) => b.addEventListener("click", () => {
      o.type = b.dataset.k;
      this._pipeRetype();
      this.renderProps();
      this.render();
    }));
    el.querySelectorAll("[data-pheight] [data-lv]").forEach((b) => b.addEventListener("click", () => {
      o.pick = b.dataset.lv;
      this.renderProps();
    }));
    el.querySelector("[data-phn]").addEventListener("change", (ev) => {
      const v = this._pipeNum(ev.target.value, clear);
      if (v != null) o.pick = v;
      this.renderProps();
    });
    el.querySelector("[data-act=plvstd]").addEventListener("click", () => {
      o.pick = null;
      this.renderProps();
    });
  },

  /** Eigenschaften einer gewählten Leitung: Art, Name, Ende (Raum/Gerät/Sensor), Punkte und Höhen. */
  _pipeProps(el, l) {
    const hass = this.hass;
    const rooms = this.b.floors.flatMap((f) => f.rooms.map((r) => [r.id, `${r.name} (${f.name})`]));
    const list = (re) => Object.keys(hass.states).filter((e) => re.test(e)).sort();
    const sensorRe = l.type === "strom" ? /^sensor\./ : l.type === "netzwerk" ? /^sensor\./ : /^(sensor|binary_sensor|switch|valve|input_boolean)\./;
    const devRe = l.type === "netzwerk" ? /^device_tracker\./ : l.type === "strom" ? /^(switch|light|fan|climate|media_player|vacuum|water_heater|sensor)\./ : /^(valve|switch)\./;
    const dl = (id, ids) => `<datalist id="${id}">${ids.map((e) => `<option value="${esc(e)}">${esc(hass.states[e].attributes.friendly_name ?? "")}</option>`).join("")}</datalist>`;
    const len = l.points.reduce((s2, q, i) => (i ? s2 + Math.hypot(q[0] - l.points[i - 1][0], q[1] - l.points[i - 1][1]) : 0), 0);
    const hs = l.points.map((_, i) => Number(l.heights?.[i] ?? l.height ?? 0.03));
    const pt = this.pipePt?.id === l.id && this.pipePt.i < l.points.length ? this.pipePt.i : null;
    // Decke je Punkt: unter Decke bzw. Dachschräge entlang des Stücks davor (dort liegt die Leitung auf der Höhe des Punkts)
    const clear = clearHeight(this.b, this.floor);
    const models = floorRoofModels(this.b, this.floor);
    const ceil = (x, i) => ceilingAlong(this.b, this.floor, x.points[i - 1] ?? x.points[i], x.points[i], models);
    const ceils = l.points.map((_, i) => ceil(l, i));
    const lvs = hs.map((h, i) => levelOf(h, ceils[i]));
    const allLv = lvs.every((v) => v && v === lvs[0]) ? lvs[0] : null;
    const sensorLabel = l.type === "strom" ? "Leistungs-Sensor (W) dieser Leitung" : l.type === "netzwerk" ? "Datenrate-Sensor (z. B. rx/tx des Routers)" : "Durchfluss-Sensor oder Ventil";
    // angeschlossene Geräte (Anfang/Ende) mit „lösen“; deren Entität gilt als Gerät am Ende, wenn keins gewählt ist
    const devs = pipeEnds(l, this.floor);
    const plugs = ["a", "b"].filter((k) => devs[k]).map((k) => `<div class="colorrow" data-pend="${k}" style="margin-top:6px"><span style="flex:1">${k === "a" ? "Anfang" : "Ende"}: <b>${esc(this._endName(l.ends[k]))}</b></span><button data-unplug="${k}">lösen</button></div>`).join("");
    const derived = endDevice(devs);
    el.innerHTML = `<h3>Leitung</h3>
      <div class="seg wide" data-ptype>${PIPE_TYPES.map(([k, n]) => `<button data-k="${k}" class="${l.type === k ? "sel" : ""}">${n}</button>`).join("")}</div>
      <label>Name</label><input data-pf="name" value="${esc(l.name ?? "")}" placeholder="z. B. Büro Steckdosen">
      <h4>Endet an</h4>
      ${plugs}
      ${l.type === "strom" ? `<label>Raum (Verbrauch des Raums)</label><select data-pf="room"><option value="">– keiner –</option>${rooms.map(([id, n]) => `<option value="${esc(id)}"${l.room === id ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>` : ""}
      <label>${l.type === "netzwerk" ? "Netzwerkgerät" : "Gerät"}</label><input data-pf="device" list="dl_pdev" value="${esc(l.device ?? "")}" placeholder="${derived ? `vom angeschlossenen Gerät: ${esc(derived)}` : "– keins –"}">${dl("dl_pdev", list(devRe))}
      <label>${sensorLabel}</label><input data-pf="entity" list="dl_pipe" value="${esc(l.entity ?? "")}" placeholder="– keiner –">${dl("dl_pipe", list(sensorRe))}
      <p class="muted">Ohne Ende fließt durch diese Leitung, was an ihr hängt (Abzweige, weitere Leitungen).</p>
      <h4>Punkte</h4>
      ${pt != null ? `<div class="ptbox"><b>Punkt ${pt + 1} von ${l.points.length}</b> · Höhe ${de(hs[pt])} m${lvs[pt] ? ` (${levelName(lvs[pt])})` : ""}
        ${this._pipeLevels("data-pth", ceils[pt], lvs[pt], !!models)}
        <div class="row2"><div><label>eigene Höhe (m)</label><input type="number" step="0.05" min="0" max="${clear}" data-pthn value="${hs[pt]}"></div><div><label>&nbsp;</label><button data-act="ptdel" class="danger"${l.points.length <= 2 ? " disabled" : ""}>Punkt löschen</button></div></div></div>` : `<p class="muted">Punkt antippen, um seine Höhe zu ändern; ziehen verschiebt ihn. Strecke antippen fügt einen Punkt ein.</p>`}
      <label>Alle Punkte auf Höhe</label>${this._pipeLevels("data-allh", clear, allLv, !!models)}
      <label>eigene Höhe für alle Punkte (m)</label><input type="number" step="0.05" min="0" max="${clear}" data-allhn value="${hs.every((h) => Math.abs(h - hs[0]) < 1e-6) ? hs[0] : ""}">
      <p class="muted">${l.points.length} Punkte · ${de(len)} m. Gezeichnet vom Anfang zum Ende.</p>
      <div class="btns"><button data-act="pipeflip">Richtung umdrehen</button><button data-act="pipedel" class="danger">Löschen</button></div>`;
    const upd = (fn) => {
      this.change((fl) => {
        const x = fl.pipes.find((y) => y.id === l.id);
        x.heights = x.points.map((_, i) => Number(x.heights?.[i] ?? x.height ?? 0.03));
        fn(x);
      });
      this.renderProps();
      this.render();
    };
    el.querySelectorAll("[data-ptype] [data-k]").forEach((b) => b.addEventListener("click", () => upd((x) => {
      x.type = b.dataset.k;
    })));
    el.querySelectorAll("[data-pf]").forEach((i) => i.addEventListener("change", () => upd((x) => {
      x[i.dataset.pf] = i.value.trim() || null;
    })));
    el.querySelectorAll("[data-unplug]").forEach((b) => b.addEventListener("click", () => upd((x) => {
      unplugEnd(x, b.dataset.unplug);
    })));
    el.querySelectorAll("[data-pth] [data-lv]").forEach((b) => b.addEventListener("click", () => upd((x) => {
      x.heights[pt] = levelHeight(b.dataset.lv, b.dataset.lv === "decke" ? ceil(x, pt) : clear);
    })));
    el.querySelector("[data-pthn]")?.addEventListener("change", (ev) => {
      const v = this._pipeNum(ev.target.value, clear);
      if (v == null) return this.renderProps();
      upd((x) => {
        x.heights[pt] = v;
      });
    });
    el.querySelector("[data-act=ptdel]")?.addEventListener("click", () => {
      this.pipePt = null;
      upd((x) => {
        // Anfang bzw. Ende gelöscht: der neue Endpunkt hängt an keinem Gerät
        if (pt === 0) unplugEnd(x, "a");
        if (pt === x.points.length - 1) unplugEnd(x, "b");
        x.points.splice(pt, 1);
        x.heights.splice(pt, 1);
        x.joints = remapJoints(x.joints, { remove: pt, n: x.points.length });
        if (!x.joints.length) delete x.joints;
      });
    });
    el.querySelectorAll("[data-allh] [data-lv]").forEach((b) => b.addEventListener("click", () => upd((x) => {
      const lv = b.dataset.lv;
      x.heights = x.points.map((_, i) => levelHeight(lv, lv === "decke" ? ceil(x, i) : clear));
      x.height = x.heights[0];
    })));
    el.querySelector("[data-allhn]")?.addEventListener("change", (ev) => {
      const v = this._pipeNum(ev.target.value, clear);
      if (v == null) return this.renderProps();
      upd((x) => {
        x.heights = x.points.map(() => v);
        x.height = v;
      });
    });
    el.querySelector("[data-act=pipeflip]").addEventListener("click", () => upd((x) => {
      x.points.reverse();
      x.heights.reverse();
      if (x.joints) x.joints = remapJoints(x.joints, { flip: true, n: x.points.length });
      if (x.ends) x.ends = { ...(x.ends.b ? { a: x.ends.b } : {}), ...(x.ends.a ? { b: x.ends.a } : {}) };
      this.pipePt = null;
    }));
    el.querySelector("[data-act=pipedel]").addEventListener("click", () => {
      this.change((fl) => {
        fl.pipes = fl.pipes.filter((x) => x.id !== l.id);
      });
      this.sel = null;
      this.pipePt = null;
      this.renderProps();
      this.render();
    });
  },

  /** Ziehen/Antippen von Leitungen, Punkten und Verteilern; undefined = nicht zuständig. */
  _pipeStartDrag(ev, p, kind, t) {
    const id = t?.dataset.id;
    if (kind === "nrotate") return { mode: "nrotate", id, first: true };
    if (kind === "pipept") {
      this.sel = { kind: "pipe", id };
      this.pipePt = { id, i: Number(t.dataset.i) };
      this.renderProps();
      this.render();
      return { mode: "pipept", id, i: Number(t.dataset.i), first: true };
    }
    if (kind === "pipe") {
      const l = (this.floor.pipes ?? []).find((x) => x.id === id);
      if (l && this.sel?.kind === "pipe" && this.sel.id === id) {
        // gewählte Leitung erneut angetippt: Punkt auf der nächsten Strecke einfügen
        let best = null;
        for (let i = 0; i < l.points.length - 1; i++) {
          const a = l.points[i];
          const b = l.points[i + 1];
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1e-9)));
          const q = [a[0] + dx * tt, a[1] + dz * tt];
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (tt > 0.02 && tt < 0.98 && (!best || d < best.d)) best = { d, i, q };
        }
        if (best) {
          this.change((fl) => {
            const x = fl.pipes.find((y) => y.id === id);
            x.heights = x.points.map((_, k) => Number(x.heights?.[k] ?? x.height ?? 0.03));
            x.points.splice(best.i + 1, 0, [r3(best.q[0]), r3(best.q[1])]);
            x.heights.splice(best.i + 1, 0, x.heights[best.i + 1]);
            if (x.joints) x.joints = remapJoints(x.joints, { insert: best.i + 1, n: x.points.length });
          });
          this.pipePt = { id, i: best.i + 1 };
          this.renderProps();
          this.render();
          return { mode: "pipept", id, i: best.i + 1, first: false };
        }
      }
      this.sel = { kind: "pipe", id };
      this.pipePt = null;
      this.renderProps();
      this.render();
      return null;
    }
    if (kind === "pnode") {
      this.sel = { kind: "pnode", id };
      this.renderProps();
      this.render();
      return { mode: "pnode", id, first: true };
    }
    return undefined;
  },

  /** Ziehen eines Leitungspunkts bzw. Verteilers; true = erledigt. */
  _pipeMoveDrag(drag, ev, p) {
    if (drag.mode === "pipept") {
      const l = (this.floor.pipes ?? []).find((x) => x.id === drag.id);
      if (!l) return true;
      // Anfang bzw. Ende rastet auch an Geräten ein
      const end = drag.i === 0 ? "a" : drag.i === l.points.length - 1 ? "b" : null;
      const q = this._pipeSnap(ev, p, null, { exclude: drag.id, type: l.type, devices: !!end });
      const junction = this._snapJunction;
      const dev = end ? this._snapDevice : null;
      this._dragChange(drag, (fl) => {
        const x = fl.pipes.find((y) => y.id === drag.id);
        x.points[drag.i] = [r3(q[0]), r3(q[1])];
        // Zwischenpunkt auf eine andere Leitung gezogen = Abzweig (weggezogen = keiner mehr)
        const js = new Set(x.joints ?? []);
        if (junction) js.add(drag.i);
        else js.delete(drag.i);
        x.joints = remapJoints([...js], { n: x.points.length });
        if (!x.joints.length) delete x.joints;
        // Ende an ein Gerät gezogen = angeschlossen, weggezogen = gelöst
        if (end && dev) x.ends = { ...(x.ends ?? {}), [end]: { ...dev.ref } };
        else if (end) unplugEnd(x, end);
      });
      this.render();
      return true;
    }
    if (drag.mode === "nrotate") {
      this._nodeRotateDrag(drag, ev, p);
      return true;
    }
    if (drag.mode === "pnode") {
      const cur = (this.floor.nodes ?? []).find((x) => x.id === drag.id);
      if (!cur) return true;
      const q = this._pipeSnap(ev, p, null, { type: nodeMedium(cur.kind), skipNode: drag.id });
      // an einer Wand: Rückseite davor, zum Raum gedreht
      const at = this._nodeWallPlace(cur.kind, q, ev, cur.rotation, p);
      this._dragChange(drag, (fl) => {
        const n = fl.nodes.find((x) => x.id === drag.id);
        n.x = at.x;
        n.z = at.z;
        if (at.wall) n.rotation = at.rotation;
      });
      if (at.wall) this._nodeRotField(at.rotation);
      this.render();
      return true;
    }
    return false;
  },
};
