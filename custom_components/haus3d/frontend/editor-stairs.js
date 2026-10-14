// Treppen im Editor (Mixin für FloorEditor): Form, Geländer, Deckenöffnung (automatisch, eigene Maße, keine),
// Geländer an der Öffnung, Treppenloch, Plan-Symbole, Sprung von der Öffnung zur Treppe.

import {
  HOLE_MODES, HOLE_RAILINGS, RAILINGS_SPIRAL, RAILINGS_STAIR, STAIR_SHAPES, WELL_RAILINGS, defaultHole, isSpiral, runWidth,
  slabOpenings, stairCeil, stairLayout, stairOpeningLocal, stairTarget,
} from "./stairs.js";
import { labelPoint } from "./walls.js";

const r2 = (v) => Math.round(v * 100) / 100 || 0;
const r3 = (v) => Math.round(v * 1000) / 1000;
const de = (v, d = 2) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const opts = (list, v) => list.map(([k, n]) => `<option value="${k}"${k === v ? " selected" : ""}>${n}</option>`).join("");
const pts = (p) => p.map((q) => `${r3(q[0])},${r3(q[1])}`).join(" ");
const hasHole = (m) => Number(m.hole?.w) > 0 && Number(m.hole?.d) > 0;
/** Modus der Deckenöffnung: keine (cut: false), eigene Maße (hole) oder automatisch. */
const holeMode = (m) => (m.cut === false ? "none" : hasHole(m) ? "custom" : "auto");
const dim = (m, k) => Number(m[k]) || (k === "w" ? 1 : 3);

export const StairMethods = {
  /** Treppe bzw. Treppenloch: Form, Geländer, Deckenöffnung, „Bis zur nächsten Etage“, Stufen und Steigung. */
  _stairFields(m) {
    if (m.type === "stairwell") {
      return `<div class="row2"><div><label>Form</label><select data-holeround>${opts([["0", "eckig"], ["1", "rund"]], m.hole_round ? "1" : "0")}</select></div><div><label>Geländer</label><select data-stair="hole_railing">${opts(WELL_RAILINGS, m.hole_railing ?? "")}</select></div></div>
        <p class="muted">Echte Öffnung im Boden dieser Etage (Breite × Tiefe), nach unten zur Etage darunter. Mit Geländer bleibt die Vorderseite (dicke Linie) als Zugang offen – Drehen wählt die offene Seite.</p>`;
    }
    if (m.type !== "stairs") return "";
    const w = dim(m, "w");
    const d = dim(m, "d");
    const lay = stairLayout({ shape: m.stair_shape, w, d, h: Number(m.h) || 2.6, run: m.run_width });
    const spiral = isSpiral(m.stair_shape);
    const railed = !!m.railing && m.railing !== "none";
    const sel = (key, list, v) => `<select data-stair="${key}">${opts(list, v)}</select>`;
    const mode = holeMode(m);
    const ceil = this._stairCeilFor(m);
    const hv = mode === "custom" ? { ...defaultHole(m, ceil), ...m.hole } : {};
    // Breite/Tiefe mit Dezimal-Tastatur, Versatz ohne (sonst fehlt am Tablet das Minus)
    const hnum = (k, label, dec) => `<div><label>${label}</label><input type="number" step="0.05"${dec ? ' min="0.3" max="20" inputmode="decimal"' : ""} data-hole="${k}" value="${r2(Number(hv[k]) || 0)}"></div>`;
    const shapeHint = spiral
      ? `<p class="muted">Wendeltreppe: Breite = Tiefe = Durchmesser. „Links herum“: beim Hinaufgehen liegt die Mittelsäule links. Oben schließt ein Austrittspodest an.</p>
        ${Math.abs(w - d) >= 0.01 ? `<p class="muted">Die Grundfläche ist nicht quadratisch – genutzt wird ein Durchmesser von ${de(Math.min(w, d))} m.</p><div class="btns left"><button data-act="stairsquare">Quadratisch machen</button></div>` : ""}`
      : `<p class="muted">Breite und Tiefe oben sind die Grundfläche der ganzen Treppe; „Kehre links/rechts“ ist die Richtung, in die die Treppe nach oben abbiegt.</p>`;
    const modeHint = {
      auto: "Automatisch: überall, wo die Kopfhöhe unter 2 m läge, ringsum 8 cm Luft, an der Austrittsseite bündig; Wendeltreppe rund.",
      custom: "Versatz von der Treppenmitte: seitlich nach rechts (beim Hinaufschauen), nach vorn Richtung Antritt. Im Plan gestrichelt, solange die Treppe gewählt ist.",
      none: "Keine Öffnung in der Decke darüber.",
    }[mode];
    const hints = ceil === null
      ? ["Die Treppe endet nicht an einer Etage – keine Deckenöffnung. „Bis zur nächsten Etage“ passt die Höhe an."]
      : [modeHint, ...(mode !== "none" ? ["Geländer an der Öffnung „automatisch“: Stäbe, wenn die Treppe ein Geländer hat. Es steht in der Etage darüber rund um die Öffnung; Austritt und Seiten an Wänden bleiben frei."] : [])];
    return `<div class="row2"><div><label>Treppenform</label>${sel("stair_shape", STAIR_SHAPES, m.stair_shape ?? "straight")}</div><div><label>Geländer</label>${spiral ? sel("railing", RAILINGS_SPIRAL, railed ? "outer" : "none") : sel("railing", RAILINGS_STAIR, m.railing ?? "none")}</div></div>
      <p class="muted">${lay.count} Stufen · Steigung ${de(lay.rise * 100, 1)} cm</p>
      ${/^(l|lw|u)_/.test(m.stair_shape ?? "") ? `<label>Laufbreite (m)</label><input type="number" min="0.5" max="2" step="0.05" data-stairnum="run_width" value="${de(runWidth({ shape: m.stair_shape, w, d, run: m.run_width }), 2).replace(",", ".")}">` : ""}
      ${shapeHint}
      <div class="row2"><div><label>Deckenöffnung</label><select data-holemode>${opts(HOLE_MODES, mode)}</select></div><div>${mode === "none" ? "" : `<label>Geländer an der Öffnung</label>${sel("hole_railing", HOLE_RAILINGS, m.hole_railing ?? "")}`}</div></div>
      ${mode === "custom" ? `<div class="row2">${hnum("w", "Breite der Öffnung (m)", true)}${hnum("d", "Tiefe der Öffnung (m)", true)}</div>
        <div class="row2">${hnum("dx", "Versatz seitlich (m)")}${hnum("dz", "Versatz nach vorn (m)")}</div>
        <label>Form der Öffnung</label><select data-hole="round">${opts([["0", "eckig"], ["1", "rund"]], hv.round ? "1" : "0")}</select>` : ""}
      ${hints.map((t) => `<p class="muted">${t}</p>`).join("")}
      <div class="btns"><button data-act="stairnext">Bis zur nächsten Etage</button></div>`;
  },

  _bindStairFields(el, m) {
    if (m.type !== "stairs" && m.type !== "stairwell") return;
    // Blockrumpf: change() nähme einen Rückgabewert als neue Etage
    const upd = (fn) => {
      this.change((fl) => {
        fn(fl.furniture.find((y) => y.id === m.id));
      });
      this.renderProps();
    };
    const square = (s) => {
      if (s) this._toast(`Wendeltreppe: Grundfläche ${de(s)} × ${de(s)} m.`);
    };
    el.querySelectorAll("select[data-stair]").forEach((s) =>
      s.addEventListener("change", () => {
        const k = s.dataset.stair;
        const v = s.value;
        let sq = null;
        upd((x) => {
          if ((k === "hole_railing" && !v) || (k === "railing" && v === "none")) delete x[k];
          else x[k] = v;
          if (k === "stair_shape") sq = this._stairShapeFix(x);
        });
        square(sq);
      }),
    );
    el.querySelector("[data-holemode]")?.addEventListener("change", (ev) => {
      const v = ev.target.value;
      const ceil = this._stairCeilFor(m);
      upd((x) => {
        if (v === "none") x.cut = false; // eigene Maße bleiben erhalten
        else delete x.cut;
        if (v === "custom" && !hasHole(x)) x.hole = defaultHole(x, ceil);
        if (v === "auto") delete x.hole;
      });
    });
    el.querySelectorAll("[data-hole]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const k = inp.dataset.hole;
        let v = inp.value === "1";
        if (k !== "round") {
          const raw = String(inp.value ?? "").trim().replace(",", ".");
          v = raw ? Number(raw) : NaN;
          if (!Number.isFinite(v)) return;
          if ((k === "w" || k === "d") && v < 0.3) {
            this.renderProps();
            this._toast("Mindestens 0,30 m.");
            return;
          }
          if (k === "w" || k === "d") v = Math.min(20, v); // wie beim Speichern (Schema): höchstens 20 m
          if (k === "dx" || k === "dz") v = Math.max(-20, Math.min(20, v));
          v = r2(v);
        }
        const ceil = this._stairCeilFor(m);
        upd((x) => {
          x.hole = { ...defaultHole(x, ceil), ...(x.hole ?? {}), [k]: v };
        });
      }),
    );
    el.querySelector("[data-holeround]")?.addEventListener("change", (ev) => {
      upd((x) => {
        if (ev.target.value === "1") x.hole_round = true;
        else delete x.hole_round;
      });
    });
    el.querySelector("[data-act=stairsquare]")?.addEventListener("click", () => {
      let sq = null;
      upd((x) => {
        sq = this._stairShapeFix(x);
      });
      square(sq);
    });
    el.querySelector('[data-stairnum="run_width"]')?.addEventListener("change", (ev) => {
      const v = Number(ev.target.value);
      if (v > 0.3) {
        upd((x) => {
          x.run_width = v;
        });
      }
    });
    el.querySelector("[data-act=stairnext]")?.addEventListener("click", () => {
      const f = this.floor;
      const next = [...this.b.floors].filter((x) => (x.elevation ?? 0) > (f.elevation ?? 0)).sort((a, b) => a.elevation - b.elevation)[0];
      if (!next) return this._toast("Keine Etage darüber.");
      const h = Math.round(((next.elevation ?? 0) - (f.elevation ?? 0) - (Number(m.mount_y) || 0)) * 100) / 100;
      upd((x) => {
        x.h = h;
      });
      this._toast(`Höhe ${de(h)} m – reicht bis ${next.name}.`);
    });
  },

  /**
   * Nach einem Formwechsel: Wendeltreppe mit Geländer „außen“ und quadratischer Grundfläche (gibt die neue
   * Seitenlänge zurück, sonst null); bei anderen Formen wird aus „außen“ „beidseitig“.
   */
  _stairShapeFix(x) {
    if (!isSpiral(x.stair_shape)) {
      if (x.railing === "outer") x.railing = "both";
      return null;
    }
    if (x.railing && x.railing !== "none") x.railing = "outer";
    const w = dim(x, "w");
    const d = dim(x, "d");
    if (Math.abs(w - d) < 0.01) return null;
    const s = Math.min(w, d) >= 1.2 ? Math.min(w, d) : 1.6;
    x.w = x.d = s;
    return s;
  },

  /** Wendeltreppe: Breite und Tiefe sind derselbe Durchmesser. */
  _stairDims(x, k) {
    if (x.type === "stairs" && isSpiral(x.stair_shape) && (k === "w" || k === "d") && x[k] > 0) x.w = x.d = x[k];
  },

  /** Im Plan rund: rundes Treppenloch, quadratische Wendeltreppe. */
  _roundPlan(m) {
    if (m.type === "stairwell") return !!m.hole_round;
    return m.type === "stairs" && isSpiral(m.stair_shape) && Math.abs(dim(m, "w") - dim(m, "d")) < 0.01;
  },

  /** Decke über dem Fuß der Treppe (für die automatische Öffnung) oder null, wenn sie an keiner Etage endet. */
  _stairCeilFor(m) {
    const f = this.floor;
    const up = f ? stairTarget(this.b, f, m) : null;
    return up ? stairCeil(f, m, up.elevation ?? 0) : null;
  },

  /** Treppe im Plan (im Möbel-System, die Gruppe ist schon verschoben/gedreht): Stufen, Podest, Spindel, Lauflinie; gewählt die Öffnung darüber. */
  _stairPlan(m, fw, fd, px) {
    if (m.type !== "stairs") return "";
    const lay = stairLayout({ shape: m.stair_shape, w: fw, d: fd, h: Number(m.h) || 2.6, run: m.run_width });
    const corners = (t) => t.poly ?? [[t.x0, t.z0], [t.x1, t.z0], [t.x1, t.z1], [t.x0, t.z1]];
    const line = `stroke="#5d4037" stroke-opacity=".7" stroke-width="${px(0.8)}"`;
    const steps = lay.treads.map((t) => `<polygon points="${pts(corners(t))}" fill="${t.landing ? "rgba(255,255,255,.18)" : "none"}" ${line}/>`).join("");
    const platform = lay.platform ? `<polygon points="${pts(lay.platform.poly)}" fill="rgba(255,255,255,.18)" ${line}/>` : "";
    const spindle = lay.spindle ? `<circle r="${r3(lay.spindle)}" fill="#5d4037" fill-opacity=".6" ${line}/>` : "";
    let hole = "";
    if (this.sel?.kind === "furniture" && this.sel.id === m.id && m.cut !== false) {
      const ceil = this._stairCeilFor(m);
      if (ceil !== null) hole = `<polygon data-stairhole points="${pts(stairOpeningLocal(m, ceil).poly)}" fill="none" stroke="#e91e63" stroke-width="${px(1.5)}" stroke-dasharray="${px(6)} ${px(4)}"/>`;
    }
    const end = lay.path.at(-1);
    return `<g pointer-events="none">${steps}${platform}${spindle}<polyline points="${pts(lay.path)}" fill="none" stroke="#e91e63" stroke-width="${px(1.5)}"/><circle cx="${r3(lay.path[0][0])}" cy="${r3(lay.path[0][1])}" r="${px(3.5)}" fill="#e91e63"/><circle cx="${r3(end[0])}" cy="${r3(end[1])}" r="${px(5)}" fill="none" stroke="#e91e63" stroke-width="${px(1.5)}"/>${hole}</g>`;
  },

  /** Deckenöffnungen dieser Etage (einmal je Zeichnen; Tippfelder und Umrisse nutzen dieselbe Liste). */
  _slabOps() {
    return slabOpenings(this.b, this.floorId);
  },

  /** Mitte der Beschriftung einer Öffnung: etwas über dem Mittelpunkt (dort steht oft schon der Raumname). */
  _slabLabelAt(o, px) {
    const l = labelPoint(o.poly);
    return [l[0], l[1] - px(16)];
  },

  /**
   * Tippfelder „Treppe von …“ (Werkzeug Auswahl): liegen unter Möbeln und Griffen (vor ihnen gezeichnet), damit
   * Ecken, Wände und Möbel darüber gewinnen. Treppenlöcher liegen auf dieser Etage und werden direkt gewählt.
   */
  _stairTapParts(px, ops = this._slabOps()) {
    if (this.tool !== "select" || this.roofMode) return "";
    const bw = px(this.coarse ? 120 : 96);
    const bh = px(this.coarse ? 44 : 18);
    return ops.filter((o) => !o.well).map((o) => {
      const c = this._slabLabelAt(o, px);
      return `<rect data-kind="stairsrc" data-id="${esc(o.id)}" data-floor="${esc(o.fid)}" x="${r3(c[0] - bw / 2)}" y="${r3(c[1] - bh / 2)}" width="${r3(bw)}" height="${r3(bh)}" rx="${r3(px(4))}" pointer-events="all" fill="#e91e63" fill-opacity=".08" style="cursor:pointer"/>`;
    }).join("");
  },

  /** Deckenöffnungen dieser Etage gestrichelt, Geländerkanten und Beschriftung (über allem, nicht antippbar). */
  _openingParts(px, P, ops = this._slabOps()) {
    return ops.map((o) => {
      const c = this._slabLabelAt(o, px);
      const rails = (o.edges ?? []).map(([a, b]) => `<line data-slabrail x1="${r3(a[0])}" y1="${r3(a[1])}" x2="${r3(b[0])}" y2="${r3(b[1])}" stroke="#5d4037" stroke-width="${px(3)}" stroke-linecap="round"/>`).join("");
      const label = o.well ? "Treppenloch" : `Treppe von ${esc(o.from)}`;
      return `<g pointer-events="none" data-slabhole><polygon points="${o.poly.map(P).join(" ")}" fill="none" stroke="#e91e63" stroke-width="${px(1.5)}" stroke-dasharray="${px(5)} ${px(4)}"/>${rails}<text x="${r3(c[0])}" y="${r3(c[1] + px(4))}" text-anchor="middle" font-size="${px(11)}" fill="#e91e63">${label}</text></g>`;
    }).join("");
  },

  /** Tippfeld einer Deckenöffnung: zur Etage der Treppe wechseln und sie wählen. */
  _gotoStair(fid, id) {
    if (!this.b.floors.some((f) => f.id === fid)) return null;
    this.floorId = fid;
    this.sel = { kind: "furniture", id };
    this.multi = [];
    this.draft = null;
    this.render();
    this.renderBar();
    this.renderProps();
    this._sync3d(true);
    this._toast("Treppe gewählt – Deckenöffnung und Geländer stehen in den Eigenschaften.");
    return null;
  },
};
