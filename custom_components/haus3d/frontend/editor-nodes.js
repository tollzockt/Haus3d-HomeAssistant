// Verteiler im Editor (Mixin für FloorEditor): Werkzeug „Verteiler“ – Hauptverteilung, Unterverteilungen,
// Einspeisung, Router/Switch, Wasser-Hausanschluss, Warmwasser und Durchführungen (Etage) setzen. Leitungen
// rasten an Verteilern ein; eine Durchführung bekommt auf der Zieletage ein Gegenstück an gleicher Stelle.
// Verteiler rasten an Wänden ein und drehen sich mit der Vorderseite zum Raum (Drehgriff, R, Steuerkreuz).

import { allIds, newId } from "./edit-ops.js";
import { NODE_KINDS, nodeMedium } from "./pipenet.js";
import { pipeColor } from "./pipes.js";
import { NODE_BODY, nodeMaxY, nodePose, normDeg, turnable, wallSpot } from "./pipenodes.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LETTER = { hv: "H", uv: "U", einspeisung: "E", abzweig: "A", router: "R", switch: "S", wasser_in: "W", warm_in: "B", durch: "D" };

export const NODE_HINT = "Art rechts wählen, dann an die Stelle tippen: rastet an Wänden ein und dreht sich zum Raum.";
const NODE_TURN_HINT = "Das Dreieck zeigt die Vorderseite. Drehen: oranger Punkt (15°-Schritte, Umschalt bzw. „Frei“ = stufenlos), ⟳/⟲ am Steuerkreuz oder Taste R. An Wänden dreht er sich selbst zum Raum.";

const color = (kind) => {
  const medium = NODE_KINDS.find((k) => k[0] === kind)?.[3];
  return medium ? pipeColor(medium) : "#757575";
};

export const NodeMethods = {
  _nodeOpts() {
    this.nodeOpts ??= { kind: "hv" };
    return this.nodeOpts;
  },

  _allNodeIds() {
    return new Set([...allIds(this.b), ...this.b.floors.flatMap((f) => [...(f.nodes ?? []), ...(f.pipes ?? [])].map((x) => x.id))]);
  },

  /**
   * Lage eines Verteilers beim Setzen und Ziehen (direkt nach _pipeSnap, liest _snapJunction): an einer Wand
   * mit der Rückseite davor und zum Raum gedreht; an einer Leitung bzw. einem Verteiler eingerastet nur gedreht.
   * Abzweigdose, Durchführung und „Frei“ bleiben, wo sie sind. Die Wand muss bis 0,3 m am Zeiger p liegen
   * (_pipeSnap rastet bei kleinem Maßstab schon von weiter weg an Wänden und Ecken ein).
   * @returns {{x: number, z: number, rotation: number, wall: boolean}}
   */
  _nodeWallPlace(kind, q, ev, rotation = 0, p = q) {
    const B = NODE_BODY[kind];
    const at = { x: r3(q[0]), z: r3(q[1]), rotation, wall: false };
    if (!B || kind === "durch" || kind === "abzweig" || this._free(ev)) return at;
    const faces = this._pipeFaces();
    if (p !== q && !wallSpot(faces, p, { tol: 0.3 })) return at;
    const s = wallSpot(faces, q, { tol: 0.3, half: this._snapJunction ? 0 : B.w / 2 });
    if (!s) return at;
    return this._snapJunction ? { ...at, rotation: s.rotation, wall: true } : { x: s.x, z: s.z, rotation: s.rotation, wall: true };
  },

  _nodeTap(ev, p) {
    const kind = this._nodeOpts().kind;
    // rastet an Leitungen seines Mediums ein (Abzweigdose mitten auf der Zuleitung), sonst an der Wand
    const q = this._pipeSnap(ev, p, null, { type: nodeMedium(kind) });
    const at = this._nodeWallPlace(kind, q, ev, 0, p);
    const node = { id: newId(`vt_${kind}`, this._allNodeIds()), kind, x: at.x, z: at.z, y: null, name: null, entity: null, link: null, rotation: at.rotation };
    this.change((fl) => {
      fl.nodes = [...(fl.nodes ?? []), node];
    });
    this.sel = { kind: "pnode", id: node.id };
    this.tool = "select";
    this.renderBar();
    this.render();
    this.renderProps();
    this._toast(`${NODE_KINDS.find((k) => k[0] === kind)[1]} gesetzt${at.wall && turnable(node) ? " und zur Wand gedreht" : ""} – rechts Name und Zähler wählen.`);
  },

  /** Verteiler im Plan: Gehäuse (gedreht, Spitze = Vorderseite) unter dem Kreis mit Buchstabe; gewählt mit Drehgriff. */
  _nodeParts(px) {
    const nodes = this.floor.nodes ?? [];
    const faces = nodes.length ? this._pipeFaces() : [];
    return nodes
      .map((n) => {
        const sel = this.sel?.kind === "pnode" && this.sel.id === n.id;
        const c = color(n.kind);
        const r = px(this.coarse ? 13 : 10);
        const B = NODE_BODY[n.kind];
        const body = B && n.model !== false && n.kind !== "abzweig" && n.kind !== "durch";
        const { rot, back } = body ? nodePose(n, faces) : { rot: 0, back: 0 };
        const turn = body && turnable(n);
        let shape = "";
        if (body) {
          const op = sel ? 0.35 : 0.18;
          const box = B.round
            ? `<circle cx="0" cy="${back}" r="${B.w / 2}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${px(1.5)}"/>`
            : `<rect x="${-B.w / 2}" y="${r3(back - B.d / 2)}" width="${B.w}" height="${B.d}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${px(1.5)}"/>`;
          const tip = turn ? `<path d="M${r3(-px(5))} ${r3(r)} L0 ${r3(r + px(7))} L${r3(px(5))} ${r3(r)} Z" fill="${c}"/>` : "";
          shape = `<g transform="translate(${r3(n.x)} ${r3(n.z)}) rotate(${rot})" pointer-events="none">${box}${tip}</g>`;
        }
        let grip = "";
        if (sel && turn) {
          // Drehgriff vor der Vorderseite: lokales +z zeigt bei Drehung rot nach (-sin, cos)
          const a = (rot * Math.PI) / 180;
          const off = Math.max(r + px(8), back + B.d / 2) + px(18);
          grip = `<circle data-kind="nrotate" data-id="${esc(n.id)}" cx="${r3(n.x - Math.sin(a) * off)}" cy="${r3(n.z + Math.cos(a) * off)}" r="${px(this.coarse ? 14 : 8)}" fill="#ff9800" stroke="#fff" stroke-width="${px(2)}" style="cursor:grab"/>`;
        }
        return `<g data-kind="pnode" data-id="${esc(n.id)}" style="cursor:move">${shape}<circle cx="${r3(n.x)}" cy="${r3(n.z)}" r="${r}" fill="${sel ? c : "#fff"}" stroke="${c}" stroke-width="${px(sel ? 3.5 : 2.5)}"${n.model === false ? ` stroke-dasharray="${px(4)} ${px(3)}"` : ""}/><text x="${r3(n.x)}" y="${r3(n.z + px(4))}" text-anchor="middle" font-size="${px(11)}" font-weight="700" fill="${sel ? "#fff" : c}" pointer-events="none">${LETTER[n.kind] ?? "?"}</text></g>${grip}`;
      })
      .join("");
  },

  _nodeToolProps(el) {
    const o = this._nodeOpts();
    el.innerHTML = `<h3>Verteiler setzen</h3>
      <div class="kinds">${NODE_KINDS.map(([k, n, icon]) => `<button data-nk="${k}" class="${o.kind === k ? "sel" : ""}"><ha-icon icon="${icon}"></ha-icon><span>${n}</span></button>`).join("")}</div>
      <p class="muted">${NODE_HINT}</p>
      <p class="muted">Hauptverteilung, Router und Hausanschluss sind der Anfang ihres Netzes: von dort fließt es zu den Verbrauchern. Unterverteilungen mit eigenem Zähler zeigen, was unterwegs nicht zugeordnet ist.</p>`;
    el.querySelectorAll("[data-nk]").forEach((b) => b.addEventListener("click", () => {
      o.kind = b.dataset.nk;
      this.renderProps();
    }));
  },

  _nodeProps(el, n, pad = () => "", bindPad = () => {}) {
    const hass = this.hass;
    const kind = NODE_KINDS.find((k) => k[0] === n.kind);
    const ents = Object.keys(hass.states).filter((e) => e.startsWith("sensor.")).sort();
    const others = this.b.floors.filter((f) => f.id !== this.floorId);
    const linked = n.link ? this.b.floors.find((f) => (f.nodes ?? []).some((x) => x.id === n.link)) : null;
    const meterLabel = n.kind === "einspeisung" ? "Erzeugung (W) – fließt von hier ins Haus" : kind[3] === "netzwerk" ? "Datenrate (Mbit/s, optional)" : kind[3] === "strom" ? "Zähler: Leistung (W, optional)" : "Durchfluss (l/min, optional)";
    el.innerHTML = `<h3><ha-icon icon="${kind[2]}"></ha-icon> ${esc(kind[1])}</h3>
      <label>Art</label><select data-nf="kind">${NODE_KINDS.map(([k, name]) => `<option value="${k}"${k === n.kind ? " selected" : ""}>${name}</option>`).join("")}</select>
      <label>Name</label><input data-nf="name" value="${esc(n.name ?? "")}" placeholder="z. B. UV Obergeschoss">
      ${n.kind === "abzweig" ? `<p class="muted">Verbindet alle Stromleitungen, die hier beginnen, enden oder durchlaufen – z. B. die Zuleitung in einen Raum mit den Leitungen zu Steckdosen und Licht.</p>` : ""}
      ${n.kind === "abzweig" ? "" : n.kind !== "durch" ? `<label>${meterLabel}</label><input data-nf="entity" list="dl_node" value="${esc(n.entity ?? "")}" placeholder="– keiner –"><datalist id="dl_node">${ents.map((e) => `<option value="${esc(e)}">${esc(hass.states[e].attributes.friendly_name ?? "")}</option>`).join("")}</datalist>` : `<label>Verbunden mit Etage</label><select data-link><option value="">– keine –</option>${others.map((f) => `<option value="${esc(f.id)}"${linked?.id === f.id ? " selected" : ""}>${esc(f.name)}</option>`).join("")}</select><p class="muted">Auf der gewählten Etage entsteht an gleicher Stelle das Gegenstück; Leitungen dort und hier sind verbunden.</p>`}
      <label class="chk"><input type="checkbox" data-nmodel${n.model === false ? "" : " checked"}> als Gegenstand zeigen</label>
      <p class="muted">Aus = nur ein Verbindungspunkt im Netz, ohne 3D-Modell (im Plan gestrichelt).</p>
      <label>Höhe über Boden (m, leer = Standard)</label><input type="number" step="0.05" min="0" max="${nodeMaxY(n, this.floor, this.b)}" data-ny value="${n.y ?? ""}">
      <p class="muted">${n.kind === "durch" ? "In 3D: rote und blaue Pfeile verschieben." : "In 3D: Pfeile ziehen verschiebt, grün = Höhe."}</p>
      ${turnable(n) ? `<label>Drehung (°)</label><input type="number" step="15" data-nrot value="${nodePose(n, this._pipeFaces()).rot}">${pad(true)}<p class="muted">${NODE_TURN_HINT}</p>` : pad(false)}
      <div class="btns"><button data-act="nodedel" class="danger">Löschen</button></div>`;
    const upd = (fn) => {
      this.change((fl) => {
        fn(fl.nodes.find((x) => x.id === n.id));
      });
      this.renderProps();
      this.render();
    };
    el.querySelectorAll("[data-nf]").forEach((i) => i.addEventListener("change", () => upd((x) => {
      x[i.dataset.nf] = i.value.trim() || null;
    })));
    el.querySelector("[data-nmodel]").addEventListener("change", (ev) => upd((x) => {
      if (ev.target.checked) delete x.model;
      else x.model = false;
    }));
    el.querySelector("[data-ny]").addEventListener("change", (ev) => upd((x) => {
      const v = ev.target.value === "" ? null : Number(ev.target.value);
      x.y = Number.isFinite(v) ? r3(Math.min(nodeMaxY(x, this.floor, this.b), Math.max(0, v))) : null; // Gehäuse unter der Decke
    }));
    el.querySelector("[data-nrot]")?.addEventListener("change", (ev) => {
      const raw = String(ev.target.value).trim().replace(",", ".");
      const v = raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(v)) return this.renderProps();
      upd((x) => {
        x.rotation = normDeg(v);
      });
    });
    bindPad();
    el.querySelector("[data-link]")?.addEventListener("change", (ev) => this._linkThrough(n, ev.target.value || null));
    el.querySelector("[data-act=nodedel]").addEventListener("click", () => {
      this._linkThrough(n, null);
      this.change((fl) => {
        fl.nodes = fl.nodes.filter((x) => x.id !== n.id);
      });
      this.sel = null;
      this.renderProps();
      this.render();
    });
  },

  /** Gewählter Verteiler der Etage (oder null). */
  _nodeSel() {
    return this.sel?.kind === "pnode" ? (this.floor?.nodes ?? []).find((x) => x.id === this.sel.id) ?? null : null;
  },

  /** Lässt sich der gewählte Verteiler drehen? */
  _nodeTurnable() {
    return turnable(this._nodeSel());
  },

  /** Gewählten Verteiler um deg Grad drehen (im Uhrzeigersinn, wie Möbel). */
  _rotateNode(deg) {
    const n = this._nodeSel();
    if (!turnable(n)) return;
    const rot = normDeg(nodePose(n, this._pipeFaces()).rot + deg);
    this.change((fl) => {
      fl.nodes.find((x) => x.id === n.id).rotation = rot;
    });
    this.renderProps();
  },

  /** Gewählten Verteiler an die nächste Wand stellen und zum Raum drehen (bis 1,2 m). */
  _nodeToWall() {
    const n = this._nodeSel();
    const B = NODE_BODY[n?.kind];
    if (!B || n.kind === "abzweig" || n.kind === "durch") return;
    const s = wallSpot(this._pipeFaces(), [n.x, n.z], { tol: 1.2, half: B.w / 2 });
    if (!s) return this._toast("Keine Wand in der Nähe (bis 1,2 m).");
    this.change((fl) => {
      Object.assign(fl.nodes.find((x) => x.id === n.id), { x: s.x, z: s.z, rotation: s.rotation });
    });
    this.renderProps();
  },

  /** Drehgriff ziehen: Vorderseite zeigt zum Zeiger (p = [x, z]); 15°-Schritte, „Frei“/Umschalt stufenlos. */
  _nodeRotateDrag(drag, ev, p) {
    const n = (this.floor.nodes ?? []).find((x) => x.id === drag.id);
    if (!n) return;
    let deg = (Math.atan2(-(p[0] - n.x), p[1] - n.z) * 180) / Math.PI;
    if (!this._free(ev)) deg = Math.round(deg / 15) * 15;
    deg = normDeg(deg);
    if (n.rotation === deg) return;
    this._dragChange(drag, (fl) => {
      fl.nodes.find((x) => x.id === drag.id).rotation = deg;
    });
    this._nodeRotField(deg);
  },

  /** Drehungsfeld an Ort und Stelle nachführen (ohne die Eigenschaften neu zu zeichnen). */
  _nodeRotField(deg) {
    const inp = this.props?.querySelector?.("[data-nrot]");
    if (inp) inp.value = String(deg);
  },

  /** Durchführung mit einer anderen Etage verbinden (Gegenstück anlegen/entfernen). */
  _linkThrough(n, floorId) {
    this._pushUndo();
    for (const f of this.b.floors) if (f.id !== this.floorId) f.nodes = (f.nodes ?? []).filter((x) => x.id !== n.link);
    let link = null;
    if (floorId) {
      const target = this.b.floors.find((f) => f.id === floorId);
      link = newId("vt_durch", this._allNodeIds());
      target.nodes = [...(target.nodes ?? []), { id: link, kind: "durch", x: n.x, z: n.z, y: null, name: n.name, entity: null, link: n.id }];
    }
    this.change((fl) => {
      fl.nodes.find((x) => x.id === n.id).link = link;
    }, { merge: true });
    this.renderProps();
    this.render();
  },
};

export const NODE_STYLE = `
.ed-props .kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
.ed-props .kinds button { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 4px 8px; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.35)); background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.ed-props .kinds button.sel { background: var(--primary-color, #03a9f4); color: #fff; border-color: transparent; }
.ed-props .ptbox { padding: 8px; border-radius: 10px; background: rgba(127,127,127,.08); margin-bottom: 8px; }
.ed-props [data-pheight], .ed-props [data-pth], .ed-props [data-allh] { flex-wrap: wrap; }
`;
