// Dach-Ebene im Editor: die Dächer einer Etage von oben (Hausdach, eigene Dächer von Räumen, freie Dachteile;
// Flächen, First, Himmelsrichtung), Dinge darauf (Kamin, Dachfenster, PV-Felder, Gauben) setzen und verschieben,
// Formulare des Hausdachs und der Dinge. Wird von FloorEditor benutzt; Dachteile und eigene Dächer stehen in
// editor-roofparts.js bzw. editor-roofunits.js.

import { allIds, newId } from "./edit-ops.js";
import { DORMER_STYLES, ROOF_ITEMS, ROOF_TYPES, compass16, dormerShape, fieldInfo, legacyPvItems, pvLayout, roofFloor, roofModel, roofObstacles, roofSettings, roofSurfaceAt, roomRoofType } from "./exterior.js";
import { textureOptions } from "./model.js";
import { adoptHouseItems, coveredBy, findUnit, floorModels, houseRoomIds, houseToParts, partOver, roofUnits, setAdjust, shiftPart, strayHouseItems, unitAt, unitFaces, unitSpec } from "./roofunits.js";
import { adjustFieldsHtml, applyRoofKey, bindAdjustFields, bindRoofFields, roofColorField, roofFieldsHtml, roofTexField, setEdge, unitIn } from "./editor-roofunits.js";
import { roofPartMove, roofPartStart, roofPartSvg } from "./editor-roofparts.js";

export const ROOF_TOOLS = [
  ["select", "mdi:cursor-default-outline", "Auswählen"],
  ["roofadd", "mdi:home-plus-outline", "Dach setzen"],
  ["chimney", "mdi:home-roof", "Kamin"],
  ["skylight", "mdi:window-closed-variant", "Dachfenster"],
  ["pv", "mdi:solar-panel", "PV-Feld"],
  ["dormer", "mdi:home-roof", "Gaube"],
];

export const ROOF_HINTS = {
  select: "Dach-Ebene dieser Etage: Dachfläche antippen – rechts Form, Neigung und Kanten; orange Punkte ziehen verschiebt eine Kante. Dachteile: Ecken ziehen, „+“ fügt Ecken ein, Fläche ziehen verschiebt. Kamin, Dachfenster, PV-Felder und Gauben antippen und ziehen. Pfeiltasten schieben, Entf setzt zurück bzw. löscht.",
  roofadd: "Dach setzen: rechts Dachform und Zeichenart wählen – Rechteck ziehen, Punkte setzen, auf einen Raum tippen oder beim Kegeldach einen Kreis ziehen.",
  chimney: "Auf ein Dach dieser Etage tippen: Kamin setzen.",
  skylight: "Auf ein Dach dieser Etage tippen: Dachfenster setzen.",
  dormer: "Auf eine geneigte Dachfläche tippen: Gaube setzen (Front zur Traufe). Form, Breite, Höhe und Neigung rechts einstellen.",
  pv: "Auf ein Dach dieser Etage tippen: PV-Feld setzen (Spalten × Reihen rechts einstellen).",
};

const r3 = (v) => Math.round(v * 1000) / 1000;
const de = (v) => (Number(v) || 0).toFixed(2).replace(".", ","); // Maße mit Komma wie im Formular
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v ?? "");
const polyOk = (pts) => Array.isArray(pts) && pts.length >= 3 && pts.every((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
const hasPos = (it) => Number.isFinite(it?.x) && Number.isFinite(it?.z);
const setKey = (obj, k, v) => {
  if (v === null || v === "" || v === undefined) delete obj[k];
  else obj[k] = v;
};
// Farbe einer Einheit im Plan: eigene Farbe, sonst Ziegelrot (Dachterrasse: Belag)
const unitColor = (u) => {
  const c = u.spec?.color ?? u.model?.roof?.color;
  return isHex(c) ? c : (u.model?.roof?.type ?? u.spec?.type) === "terrace" ? "#c2b39b" : "#9a4a36";
};

/** „Ausrichtung 205° (SSW) · Neigung 35° · 12 Module = 4,80 kWp“ */
export function pvInfoLine(f) {
  const kwp = f.kwp.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dir = f.azimuth === null ? "flach" : `Ausrichtung ${Math.round(f.azimuth)}° (${compass16(f.azimuth)}) · Neigung ${Math.round(f.tilt)}°`;
  return `${dir} · ${f.count} Module = ${kwp} kWp`;
}

function pvDatalists(hass) {
  const ids = Object.keys(hass?.states ?? {}).filter((id) => id.startsWith("sensor.")).sort();
  const cls = (id) => hass.states[id]?.attributes?.device_class;
  const opt = (id) => `<option value="${esc(id)}">${esc(hass.states[id]?.attributes?.friendly_name ?? "")}</option>`;
  return `<datalist id="dl_pvw">${ids.filter((id) => cls(id) === "power").map(opt).join("")}</datalist><datalist id="dl_pve">${ids.filter((id) => cls(id) === "energy").map(opt).join("")}</datalist>`;
}

/** Auswahlfeld für eine Textur (data-tex=key). kind: w (Wand), f (Boden), r (Dach), g (Gelände). */
export function textureField(key, label, value, kind) {
  return `<label>${label}</label><select data-tex="${key}">${textureOptions(kind).map(([k, n]) => `<option value="${k}"${k === (value ?? "") ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
}

/** Grundriss-Ecken eines gedrehten Rechtecks (Mitte, Achse along, Breite w entlang, Tiefe d quer). */
function rectCorners([x, z], along, w, d) {
  const n = [-along[1], along[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [x + (along[0] * i * w) / 2 + (n[0] * k * d) / 2, z + (along[1] * i * w) / 2 + (n[1] * k * d) / 2]);
}

/** Richtung (Grundriss) eines Kamins/Dachfensters: Dachfenster folgen der Fläche, Kamine ihrer Drehung. */
function itemAxis(model, it) {
  if (it.type === "skylight") {
    const out = roofSurfaceAt(model, [it.x, it.z])?.out;
    if (out) return [out[1], -out[0]];
  }
  const a = ((it.rotation || 0) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

// Punkt in einem Rahmen (Dachfläche) aus Längs- und Querabstand zur Mitte
const frameQ = (fr) => (s, t) => [fr.center[0] + s * fr.u[0] + t * fr.v[0], fr.center[1] + s * fr.u[1] + t * fr.v[1]];

/** SVG-Teile der Dach-Ebene (Maßstab: Meter, px() = Bildschirmpixel). */
export function roofSvg(ed, px) {
  if (ed.sel?.unit && !findUnit(ed.b, ed.sel.unit)) ed.sel = null; // Einheit weg (z. B. nach Rückgängig)
  const P = ([x, z]) => `${r3(x)},${r3(z)}`;
  const poly = (pts, attrs = "") => `<polygon points="${pts.map(P).join(" ")}"${attrs}/>`;
  const line = (a, b, attrs) => `<line x1="${r3(a[0])}" y1="${r3(a[1])}" x2="${r3(b[0])}" y2="${r3(b[1])}" ${attrs}/>`;
  const parts = [];
  const floor = ed.floor;
  const units = roofUnits(ed.b, ed.floorId);
  // Etage darunter: Räume gestrichelt, ihre Dächer ganz blass (nur Orientierung)
  const below = [...ed.b.floors].filter((f) => (f.elevation ?? 0) < (floor?.elevation ?? 0)).sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0))[0];
  if (below) {
    const faces = roofUnits(ed.b, below.id).flatMap((u) => unitFaces(u).faces.map((f) => poly(f.poly, ` fill="${unitColor(u)}"`)));
    parts.push(`<g pointer-events="none"><g fill="none" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="${px(4)} ${px(4)}" stroke-width="${px(1)}">${(below.rooms ?? []).filter((r) => polyOk(r.points)).map((r) => poly(r.points)).join("")}</g><g fill-opacity=".08">${faces.join("")}</g></g>`);
  }
  // Räume dieser Etage blass; antippbar nur beim Werkzeug „Dach setzen“ im Modus „Auf Raum tippen“
  const tapRoom = ed.tool === "roofadd" && ed._roofAdd?.mode === "room";
  const rooms = (floor?.rooms ?? []).filter((r) => polyOk(r.points));
  parts.push(`<g fill="currentColor" fill-opacity=".06" stroke="currentColor" stroke-opacity=".35" stroke-width="${px(1)}"${tapRoom ? "" : ' pointer-events="none"'}>${rooms.map((r) => poly(r.points, ` data-kind="roofroom" data-id="${esc(r.id)}"`)).join("")}</g>`);
  if (!units.length) {
    const houseFloor = roofFloor(ed.b, roofSettings(ed.b.settings))?.id === ed.floorId;
    const text = houseFloor ? "Kein Dach – rechts eine Dachform fürs Hausdach wählen oder oben „Dach setzen“." : "Auf dieser Etage ist noch kein Dach – oben „Dach setzen“ wählen: Rechteck ziehen oder auf einen Raum tippen.";
    parts.push(`<text x="${r3((ed.view.x0 + ed.view.x1) / 2)}" y="${r3(ed.view.z0 + 1)}" text-anchor="middle" font-size="${px(14)}" fill="currentColor">${text}</text>`);
  }
  // Dächer: niedrige zuerst, das Hausdach bei gleicher Höhe unten; kaputte Dachteile zuletzt
  const drawn = units.filter((u) => u.model).sort((a, b) => a.model.ridgeY - b.model.ridgeY || (a.kind === "house" ? -1 : b.kind === "house" ? 1 : 0));
  const faceMap = new Map(drawn.map((u) => [u, unitFaces(u)]));
  for (const u of drawn) {
    const col = unitColor(u);
    const stroke = coveredBy(ed.b, u).length ? `stroke="#e53935" stroke-dasharray="${px(5)} ${px(3)}"` : `stroke="${col}"`;
    const { faces, ridges } = faceMap.get(u);
    for (const f of faces) parts.push(poly(f.poly, ` data-kind="roofpart" data-unit="${esc(u.key)}" data-part="${f.k ?? 0}" fill="${col}" fill-opacity="${r3(f.op)}" ${stroke} stroke-width="${px(1.5)}" style="cursor:pointer"`));
    for (const [a, b] of ridges) parts.push(line(a, b, `stroke="#fff" stroke-opacity=".95" stroke-width="${px(2.5)}" pointer-events="none"`));
  }
  for (const u of units.filter((x) => !x.model)) {
    const pts = u.kind === "part" ? u.spec?.points : u.rooms[0]?.points;
    if (polyOk(pts)) parts.push(poly(pts, ` data-kind="roofpart" data-unit="${esc(u.key)}" data-part="0" fill="none" stroke="#e53935" stroke-width="${px(2.5)}" stroke-dasharray="${px(4)} ${px(3)}" pointer-events="all" style="cursor:pointer"`));
  }
  // „Auf Raum tippen“: Raumumrisse orange über den Dächern
  if (tapRoom) parts.push(`<g pointer-events="none" fill="none" stroke="#ff9800" stroke-width="${px(2.5)}">${rooms.map((r) => poly(r.points)).join("")}</g>`);
  // gewählte Fläche (Hausdach, eigenes Dach): Umriss, Maße, Wände der Einheit und Griffe an den vier Kanten
  const su = ed.sel?.kind === "roofpart" ? unitIn(units, ed.sel.unit ?? "house") : null;
  if (su?.model && su.kind !== "part") {
    const fr = su.model.parts?.[ed.sel.id];
    if (fr) {
      const L = fr.length / 2;
      const W = fr.width / 2;
      const Q = frameQ(fr);
      parts.push(poly([Q(-L, -W), Q(L, -W), Q(L, W), Q(-L, W)], ` fill="none" stroke="#03a9f4" stroke-width="${px(3)}" pointer-events="none"`));
      parts.push(`<g fill="none" stroke="#ffeb3b" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}" pointer-events="none">${(su.rooms ?? []).filter((r) => polyOk(r.points)).map((r) => poly(r.points)).join("")}</g>`);
      for (const [side, q] of [["lo", Q(-L, 0)], ["hi", Q(L, 0)], ["a", Q(0, -W)], ["b", Q(0, W)]]) {
        parts.push(`<circle data-kind="roofhandle" data-unit="${esc(su.key)}" data-side="${side}" cx="${r3(q[0])}" cy="${r3(q[1])}" r="${px(ed.coarse ? 13 : 9)}" fill="#ff9800" stroke="#fff" stroke-width="${px(2)}" style="cursor:grab"/>`);
      }
      parts.push(`<text x="${r3(fr.center[0])}" y="${r3(fr.center[1] + px(4))}" text-anchor="middle" font-size="${px(12)}" font-weight="600" fill="#fff" pointer-events="none">${de(fr.length)} × ${de(fr.width)} m</text>`);
    } else for (const o of su.model.shape?.outline ?? []) if (polyOk(o)) parts.push(poly(o, ` fill="none" stroke="#03a9f4" stroke-width="${px(3)}" pointer-events="none"`));
  }
  const rp = roofPartSvg(ed, px, units);
  parts.push(rp.handles);
  // Himmelsrichtung (oben links an allen Dachflächen)
  const pts = drawn.flatMap((u) => faceMap.get(u).faces.flatMap((f) => f.poly));
  if (pts.length) {
    const north = ((Number(ed.b.settings?.north) || 0) * Math.PI) / 180;
    const nc = [Math.min(...pts.map((p) => p[0])) + 0.3, Math.min(...pts.map((p) => p[1])) + 0.3];
    const nd = [Math.sin(north), -Math.cos(north)];
    const tip = [nc[0] + nd[0] * 0.9, nc[1] + nd[1] * 0.9];
    parts.push(`<g pointer-events="none">${line(nc, tip, `stroke="#e53935" stroke-width="${px(3)}"`)}<circle cx="${r3(tip[0])}" cy="${r3(tip[1])}" r="${px(4)}" fill="#e53935"/><text x="${r3(tip[0] + nd[0] * 0.4)}" y="${r3(tip[1] + nd[1] * 0.4 + px(4))}" text-anchor="middle" font-size="${px(13)}" font-weight="700" fill="#e53935">N${north ? ` ${Math.round((north * 180) / Math.PI)}°` : ""}</text></g>`);
  }
  // Dinge auf den Dächern (je Einheit; Module unter einem anderen Dach derselben Etage fallen weg)
  for (const u of drawn) {
    const model = u.model;
    const others = floorModels(units, u.floorId, u.key);
    const obstacles = roofObstacles(model, u.items);
    const unit = `data-unit="${esc(u.key)}"`;
    for (const it of u.items) {
      if (!hasPos(it)) continue;
      const sel = ed.sel?.kind === "roofitem" && ed.sel.id === it.id;
      const stroke = sel ? "#03a9f4" : "#fff";
      if (it.type === "pv") {
        const lay = pvLayout(model, it, { obstacles, others });
        // rot: passt nicht auf die Fläche (First, Kehle, Rand, anderes Dach); rot schraffiert: von Kamin/Dachfenster verdeckt
        const cell = lay.panels.map((p, i) => `<polygon${lay.blocked[i] ? ' data-blocked="1"' : ""} points="${rectCorners(p, lay.along, lay.w, lay.l * lay.cos).map(P).join(" ")}" fill="${lay.fits[i] ? "#1c3a6b" : lay.blocked[i] ? "url(#pvblock)" : "#e53935"}" fill-opacity="${lay.fits[i] ? 1 : 0.6}" stroke="${lay.blocked[i] ? "#e53935" : "#8fb3e8"}" stroke-width="${px(0.8)}"/>`).join("");
        parts.push(`<g data-kind="roofitem" ${unit} data-id="${esc(it.id)}" style="cursor:move">${cell}<polygon points="${rectCorners(lay.center, lay.along, lay.size[0] + 0.1, lay.size[1] + 0.1).map(P).join(" ")}" fill="transparent" stroke="${stroke}" stroke-opacity="${sel ? 1 : 0.5}" stroke-width="${px(sel ? 3 : 1)}"/></g>`);
        if (sel) parts.push(`<text x="${r3(it.x)}" y="${r3(it.z - lay.size[1] / 2 - px(8))}" text-anchor="middle" font-size="${px(12)}" fill="#03a9f4">${lay.count} von ${lay.panels.length} Modulen passen</text>`);
      } else if (it.type === "dormer") {
        const g = dormerShape(model, it);
        const shape = g ? [g.f0, g.f1, g.b1, g.b0] : rectCorners([it.x, it.z], [1, 0], Number(it.w) || 2, 1);
        parts.push(poly(shape, ` data-kind="roofitem" ${unit} data-id="${esc(it.id)}" fill="${g ? "#d7ccc8" : "#e53935"}" fill-opacity="${g ? 0.9 : 0.5}" stroke="${stroke}" stroke-width="${px(sel ? 3 : 1.5)}" style="cursor:move"`));
        if (g) parts.push(line(g.f0, g.f1, `stroke="#5d4037" stroke-width="${px(3)}" pointer-events="none"`));
      } else {
        const def = ROOF_ITEMS[it.type] ?? ROOF_ITEMS.chimney;
        const w = Number(it.w) || def.w;
        const d = it.type === "skylight" ? (Number(it.l) || def.l) * Math.cos(Math.atan(roofSurfaceAt(model, [it.x, it.z])?.tan ?? model.tan)) : Number(it.d) || def.d;
        const fill = it.type === "chimney" ? (isHex(it.color) ? it.color : "#9c5a44") : "#9fd3f0";
        parts.push(poly(rectCorners([it.x, it.z], itemAxis(model, it), w, d), ` data-kind="roofitem" ${unit} data-id="${esc(it.id)}" fill="${fill}" stroke="${stroke}" stroke-width="${px(sel ? 3 : 1.5)}" style="cursor:move"`));
      }
    }
  }
  parts.push(rp.draft);
  return parts.join("");
}

/** Zeiger gedrückt in der Dach-Ebene. Gibt einen Ziehvorgang zurück (oder null). */
export function roofStartDrag(ed, ev, p) {
  const st = roofPartStart(ed, ev, p);
  if (st !== undefined) return st;
  const t = ev.target.closest("[data-kind]");
  const tool = ed.tool;
  // Werkzeug, das es in der Dach-Ebene nicht gibt (z. B. nach einem Wechsel der Etage): Auswählen
  if (tool !== "select" && !ROOF_ITEMS[tool]) {
    ed.tool = "select";
    ed.renderBar();
    return null;
  }
  const units = roofUnits(ed.b, ed.floorId);
  if (tool !== "select") {
    const at = unitAt(units, p, ed._roofUnit);
    if (!at) {
      ed._toast("Dort ist kein Dach dieser Etage – auf eine Dachfläche tippen.");
      return null;
    }
    const grid = ed.b.settings?.grid ?? 0.05;
    const q = [r3(Math.round(p[0] / grid) * grid), r3(Math.round(p[1] / grid) * grid)];
    const def = ROOF_ITEMS[tool];
    const it = { id: newId(tool === "pv" ? "pv" : tool, allIds(ed.b)), type: tool, x: q[0], z: q[1], ...(tool === "pv" ? { cols: def.cols, rows: def.rows, orient: def.orient } : tool === "chimney" ? { w: def.w, d: def.d, h: def.h, rotation: 0 } : tool === "dormer" ? { w: def.w, h: def.h, pitch: def.pitch, style: def.style, windows: def.windows } : { w: def.w, l: def.l }) };
    // neue Dinge auf das Dach unter dem Tipp; am Raumdach landen sie am Raum darunter
    const key = ed.changeUnit(at.unit.key, (r) => {
      r.items = [...(r.items ?? []), it];
    }) ?? at.unit.key;
    ed.sel = { kind: "roofitem", unit: key, id: it.id };
    ed._roofUnit = key;
    ed.tool = "select";
    ed.renderBar();
    ed.renderProps();
    ed.render();
    return { mode: "roofitem", unit: key, id: it.id, off: [0, 0], first: false };
  }
  const kind = t?.dataset.kind;
  if (kind === "roofhandle" && ed.sel?.kind === "roofpart") {
    const u = unitIn(units, t.dataset.unit ?? "house");
    const k = ed.sel.id;
    const fr = u?.model?.parts?.[k];
    if (!fr) return null;
    const adj = (unitSpec(ed.b, u.key)?.adjust ?? [])[k] ?? {};
    ed._roofUnit = u.key;
    return { mode: "roofhandle", unit: u.key, part: k, side: t.dataset.side, start: p, base: Number(adj[t.dataset.side]) || 0, first: true, fr: { u: fr.u, v: fr.v } };
  }
  if (kind === "roofpart") {
    const u = unitIn(units, t.dataset.unit ?? "house");
    const k = Number(t.dataset.part) || 0;
    ed.sel = { kind: "roofpart", unit: u?.key ?? t.dataset.unit ?? "house", id: k };
    ed._roofUnit = ed.sel.unit;
    ed.renderProps();
    ed.render();
    const fr = u?.model?.parts?.[k];
    if (!fr) return { mode: "pan", sx: ev.clientX, sz: ev.clientY, tx: ed.tx, tz: ed.tz };
    const adj = (unitSpec(ed.b, u.key)?.adjust ?? [])[k] ?? {};
    return { mode: "roofpart", unit: u.key, part: k, start: p, base: { lo: Number(adj.lo) || 0, hi: Number(adj.hi) || 0, a: Number(adj.a) || 0, b: Number(adj.b) || 0 }, first: true, fr: { u: fr.u, v: fr.v } };
  }
  if (kind === "roofitem") {
    const u = unitIn(units, t.dataset.unit ?? "house") ?? findUnit(ed.b, t.dataset.unit ?? "house");
    const it = u?.items.find((x) => x.id === t.dataset.id);
    if (!it) return null;
    ed.sel = { kind: "roofitem", unit: u.key, id: it.id };
    ed._roofUnit = u.key;
    ed.renderProps();
    ed.render();
    return { mode: "roofitem", unit: u.key, id: it.id, off: [p[0] - it.x, p[1] - it.z], first: true };
  }
  if (ed.sel) {
    ed.sel = null;
    ed.renderProps();
    ed.render();
  }
  return { mode: "pan", sx: ev.clientX, sz: ev.clientY, tx: ed.tx, tz: ed.tz };
}

/** Gewählte Fläche verschieben: Dachteil samt Dingen, sonst Anfang/Ende und Traufen gleichmäßig. */
export function roofNudgePart(ed, sel, dx, dz, merge) {
  const u = findUnit(ed.b, sel.unit ?? "house");
  if (!u) return;
  if (u.kind === "part") {
    const h0 = houseRoomIds(ed.b);
    ed.changeUnit(u.key, (p) => {
      shiftPart(p, dx, dz);
    }, { merge });
    ed._houseGuard(h0);
    return;
  }
  const fr = u.model?.parts?.[sel.id];
  // Zelt-, Kegeldach und Dachterrasse eines Raums haben keine Flächen zum Schieben
  if (!fr) return void (u.kind === "room" && ed._toast("Dieses Dach folgt dem Raum – Raum im Grundriss verschieben."));
  const ds = dx * fr.u[0] + dz * fr.u[1];
  const dt = dx * fr.v[0] + dz * fr.v[1];
  const a0 = (unitSpec(ed.b, u.key)?.adjust ?? [])[sel.id] ?? {};
  ed.changeUnit(u.key, (r) => {
    setAdjust(r, sel.id, { lo: (Number(a0.lo) || 0) - ds, hi: (Number(a0.hi) || 0) + ds, a: (Number(a0.a) || 0) - dt, b: (Number(a0.b) || 0) + dt });
  }, { merge });
}

/** Gewähltes Ding auf dem Dach verschieben. */
export function roofNudgeItem(ed, sel, dx, dz, merge) {
  ed.changeUnit(sel.unit ?? "house", (r) => {
    const it = (r.items ?? []).find((x) => x.id === sel.id);
    if (!it) return;
    it.x = r3(it.x + dx);
    it.z = r3(it.z + dz);
  }, { merge });
}

/** Entf in der Dach-Ebene: Ding löschen, Dachteil löschen (mit Rückfrage), Fläche zurücksetzen. */
export function roofDeleteSel(ed, sel) {
  const key = sel.unit ?? "house";
  if (sel.kind === "roofitem") {
    ed.changeUnit(key, (r) => {
      r.items = (r.items ?? []).filter((x) => x.id !== sel.id);
      if (key !== "house" && !r.items.length) delete r.items;
    });
    ed.sel = null;
    ed.renderProps();
    return;
  }
  const u = findUnit(ed.b, key);
  if (u?.kind === "part") return void ed._removeUnit(u);
  if (!u?.model?.parts?.[sel.id]) return; // keine Fläche zum Zurücksetzen: kein leerer Rückgängig-Schritt
  ed.changeUnit(key, (r) => {
    setAdjust(r, sel.id, {});
  });
  ed.renderProps();
}

/** Ziehen eines Dach-Elements (aufs Raster). */
export function roofMoveDrag(ed, drag, p) {
  if (roofPartMove(ed, drag, p)) return;
  const grid = ed.b.settings?.grid ?? 0.05;
  const key = drag.unit ?? "house";
  const step = (fn) => {
    drag.unit = ed.changeUnit(key, fn, { merge: !drag.first }) ?? drag.unit;
    drag.first = false;
  };
  if (drag.mode === "roofhandle" || drag.mode === "roofpart") {
    // Richtungen der Fläche ändern sich durch die Anpassung nicht (beim Start gemerkt)
    const fr = drag.fr;
    if (!fr) return;
    const dx = p[0] - drag.start[0];
    const dz = p[1] - drag.start[1];
    const snap = (v) => Math.round(v / grid) * grid;
    const cur = (unitSpec(ed.b, key)?.adjust ?? [])[drag.part] ?? {};
    if (drag.mode === "roofhandle") {
      const dir = { lo: [-fr.u[0], -fr.u[1]], hi: fr.u, a: [-fr.v[0], -fr.v[1]], b: fr.v }[drag.side];
      const v = r3(drag.base + snap(dx * dir[0] + dz * dir[1]));
      if (v === (Number(cur[drag.side]) || 0)) return;
      const next = { lo: Number(cur.lo) || 0, hi: Number(cur.hi) || 0, a: Number(cur.a) || 0, b: Number(cur.b) || 0, [drag.side]: v };
      step((r) => {
        setAdjust(r, drag.part, next);
      });
      ed._toast(`${{ lo: "Anfang", hi: "Ende", a: "Traufe 1", b: "Traufe 2" }[drag.side]}: ${v >= 0 ? "+" : ""}${de(v)} m`);
      return;
    }
    const ds = snap(dx * fr.u[0] + dz * fr.u[1]);
    const dt = snap(dx * fr.v[0] + dz * fr.v[1]);
    const b0 = drag.base;
    const next = { lo: b0.lo - ds, hi: b0.hi + ds, a: b0.a - dt, b: b0.b + dt };
    if (["lo", "hi", "a", "b"].every((k) => Math.abs(next[k] - (Number(cur[k]) || 0)) < 1e-9)) return;
    step((r) => {
      setAdjust(r, drag.part, next);
    });
    return;
  }
  if (drag.mode !== "roofitem") return;
  const x = r3(Math.round((p[0] - drag.off[0]) / grid) * grid);
  const z = r3(Math.round((p[1] - drag.off[1]) / grid) * grid);
  const it = findUnit(ed.b, key)?.items.find((y) => y.id === drag.id);
  if (!it || (it.x === x && it.z === z)) return;
  step((r) => {
    const y = (r.items ?? []).find((q) => q.id === drag.id);
    if (y) Object.assign(y, { x, z });
  });
}

/** Eigenschaften rechts: Werkzeug „Dach setzen“, gewählte Fläche bzw. Ding oder die Übersicht der Etage. */
export function roofProps(ed, el, pad, bindPad) {
  if (ed.sel?.unit && !findUnit(ed.b, ed.sel.unit)) ed.sel = null;
  if (ed.tool === "roofadd") return ed._roofAddPanel(el);
  const sel = ed.sel;
  if (sel?.kind === "roofpart") {
    const u = findUnit(ed.b, sel.unit ?? "house");
    if (u?.kind === "house" && u.model.parts[sel.id]) return houseFaceProps(ed, el, u, sel.id, pad, bindPad);
    if (u && u.kind !== "house") return ed._roofUnitProps(el, u, sel.id, pad, bindPad);
  }
  if (sel?.kind === "roofitem") {
    const u = findUnit(ed.b, sel.unit ?? "house");
    const it = u?.model ? u.items.find((x) => x.id === sel.id) : null;
    if (it) return itemProps(ed, el, u, it, pad, bindPad);
  }
  const onHouseFloor = roofFloor(ed.b, roofSettings(ed.b.settings))?.id === ed.floorId;
  el.innerHTML = `${ed._roofOverview()}${onHouseFloor ? houseFormHtml(ed) : ""}`;
  ed._bindRoofOverview(el);
  if (onHouseFloor) bindHouseForm(ed, el);
}

/** Kanten einer Fläche des Hausdachs. */
function houseFaceProps(ed, el, u, k, pad, bindPad) {
  const fr = u.model.parts[k];
  const raw = ed.b.settings?.roof ?? {};
  const adj = (raw.adjust ?? [])[k] ?? {};
  el.innerHTML = `<h3>Dachfläche ${k + 1} von ${u.model.parts.length}</h3>
    <p class="muted">${de(fr.length)} m lang (entlang First) × ${de(fr.width)} m breit, inkl. Überstand ${de(u.model.roof.overhang)} m. Gelb gestrichelt: die Hauswände darunter.</p>
    ${adjustFieldsHtml(adj)}
    <p class="muted">Orange Punkte ziehen verschiebt die Kante, Fläche ziehen oder Pfeiltasten verschieben die ganze Fläche. Der First bleibt mittig zwischen den Traufen.</p>
    ${pad()}
    <div class="btns"><button data-ract="partreset">Diese Fläche zurücksetzen</button>${raw.adjust?.length ? `<button data-ract="allreset">Alle Flächen zurücksetzen</button>` : ""}</div>`;
  const save = (fn) => {
    ed.changeUnit("house", fn);
    ed.renderProps();
  };
  bindAdjustFields(el, (side, v) =>
    save((r) => {
      setEdge(r, k, side, v);
    }),
  );
  el.querySelector("[data-ract=partreset]").addEventListener("click", () =>
    save((r) => {
      setAdjust(r, k, {});
    }),
  );
  el.querySelector("[data-ract=allreset]")?.addEventListener("click", () =>
    save((r) => {
      delete r.adjust;
    }),
  );
  bindPad();
}

/** Formular eines Dings (PV-Feld, Gaube, Kamin, Dachfenster) auf seiner Einheit. */
function itemProps(ed, el, u, sel, pad, bindPad) {
  const model = u.model;
  const key = u.key;
  const name = ROOF_ITEMS[sel.type]?.name ?? sel.type;
  const flat = !roofSurfaceAt(model, [sel.x, sel.z])?.out;
  const num = (k, label, value, step = 0.05, extra = "") => `<div><label>${label}</label><input type="number" step="${step}" data-rn="${k}" value="${value ?? ""}"${extra}></div>`;
  let body = "";
  if (sel.type === "pv") {
    const others = floorModels(roofUnits(ed.b, u.floorId), u.floorId, key);
    const lay = pvLayout(model, sel, { obstacles: roofObstacles(model, u.items), others });
    const n = lay.count < lay.panels.length ? `${lay.count} von ${lay.panels.length} Modulen passen${lay.blockedCount ? ` – ${lay.blockedCount} verdeckt durch Kamin/Dachfenster` : ""} (rot = über First, Kehle, Rand oder unter einem anderen Dach – Feld verschieben)` : `${lay.count} Module`;
    body = `<div class="row2">${num("cols", "Spalten (nebeneinander)", sel.cols ?? 1, 1, ' min="1" max="30"')}${num("rows", "Reihen (die Neigung hinauf)", sel.rows ?? 1, 1, ' min="1" max="15"')}</div>
      <label>Module</label><select data-rs="orient"><option value="portrait"${sel.orient !== "landscape" ? " selected" : ""}>hochkant (1,0 × 1,7 m)</option><option value="landscape"${sel.orient === "landscape" ? " selected" : ""}>quer (1,7 × 1,0 m)</option></select>
      ${flat ? num("rotation", "Drehung (°) auf dem Flachdach", sel.rotation ?? 0, 15) : ""}
      <p class="muted">${n} · richtet sich nach der Dachfläche unter der Mitte, Reihe 1 unten an der Traufe.</p>
      <label>Name</label><input data-rt="name" value="${esc(sel.name ?? "")}" placeholder="z. B. PV Süd">
      <label>Leistung (Entität)</label><input data-rt="entity" list="dl_pvw" value="${esc(sel.entity ?? "")}" placeholder="– geschätzt aus „PV Dach“ –">
      <label>Ertrag heute (Entität)</label><input data-rt="energy_entity" list="dl_pve" value="${esc(sel.energy_entity ?? "")}" placeholder="– keine –">
      ${num("wp", "Modulleistung (Wp)", sel.wp ?? "", 5, ' min="50" max="1000" placeholder="400"')}
      ${pvDatalists(ed.hass)}
      <p class="muted pvinfo">${pvInfoLine(fieldInfo(model, sel, Number(ed.b.settings?.north) || 0, u.items, others))}</p>`;
  } else if (sel.type === "dormer") {
    const g = dormerShape(model, sel);
    body = `<label>Form</label><select data-rs="style">${DORMER_STYLES.map(([k, n]) => `<option value="${k}"${(sel.style ?? "shed") === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <div class="row3">${num("w", "Breite (m)", sel.w ?? 2)}${num("h", "Höhe Front (m)", sel.h ?? 1.3)}${sel.style === "flat" ? "" : num("pitch", "Neigung (°)", sel.pitch ?? 15, 1)}</div>
      ${num("windows", "Fenster", sel.windows ?? 2, 1, ' min="0" max="3"')}
      ${roofColorField("color", "Wandfarbe", sel.color)}
      ${roofColorField("roof_color", "Dachfarbe", sel.roof_color)}
      <p class="muted">${g ? `Tiefe ${g.depth.toFixed(2).replace(".", ",")} m bis zum Hauptdach. Verdeckt PV-Module wie ein Kamin.` : "Passt so nicht: über First, Rand oder Kehle – oder das Gaubendach ist steiler als das Hauptdach. Verschieben, schmaler/niedriger machen oder Neigung verringern."}</p>`;
  } else if (sel.type === "chimney") {
    body = `<div class="row3">${num("w", "Breite", sel.w)}${num("d", "Tiefe", sel.d)}${num("h", "über Dach", sel.h ?? ROOF_ITEMS.chimney.h)}</div>
      ${num("rotation", "Drehung (°)", sel.rotation ?? 0, 15)}
      ${roofColorField("color", "Farbe", sel.color)}
      ${textureField("texture", "Textur", sel.texture, "w")}`;
  } else {
    body = `<div class="row2">${num("w", "Breite (m)", sel.w)}${num("l", "Länge die Neigung hinauf (m)", sel.l)}</div>`;
  }
  el.innerHTML = `<h3>${esc(name)}</h3>${u.kind === "house" ? "" : `<p class="muted">Auf „${esc(u.label)}“</p>`}${body}<p class="muted">Ziehen verschiebt, Pfeiltasten schieben (Umschalt = 1 cm).</p>${pad()}
    <div class="btns"><button data-ract="dup">Duplizieren</button><button data-ract="del" class="danger">Löschen</button></div>`;
  const upd = (fn) => {
    ed.changeUnit(key, (r) => {
      const it = (r.items ?? []).find((y) => y.id === sel.id);
      if (it) fn(it);
    });
    ed.renderProps();
  };
  el.querySelectorAll("[data-rn]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      const k = inp.dataset.rn;
      if (k === "wp" && (inp.value === "" || v <= 0)) {
        return upd((it) => {
          delete it.wp;
        });
      }
      upd((it) => {
        it[k] = k === "cols" || k === "rows" ? Math.max(1, Math.round(v)) : k === "windows" ? Math.max(0, Math.min(3, Math.round(v))) : k === "rotation" ? ((v % 360) + 360) % 360 : Math.max(0, v);
      });
    }),
  );
  el.querySelectorAll("[data-rs]").forEach((inp) =>
    inp.addEventListener("change", () =>
      upd((it) => {
        it[inp.dataset.rs] = inp.value;
      }),
    ),
  );
  el.querySelectorAll("[data-rt]").forEach((inp) =>
    inp.addEventListener("change", () =>
      upd((it) => {
        setKey(it, inp.dataset.rt, inp.value.trim() || null);
      }),
    ),
  );
  el.querySelectorAll("[data-tex]").forEach((inp) =>
    inp.addEventListener("change", () =>
      upd((it) => {
        setKey(it, "texture", inp.value);
      }),
    ),
  );
  const color = (k, v) =>
    upd((it) => {
      setKey(it, k, v);
    });
  el.querySelectorAll("[data-rcolor]").forEach((inp) => inp.addEventListener("change", () => color(inp.dataset.rcolor, inp.value)));
  el.querySelectorAll("[data-rcolor-reset]").forEach((b) => b.addEventListener("click", () => color(b.dataset.rcolorReset, null)));
  el.querySelectorAll("[data-rswatch]").forEach((b) => b.addEventListener("click", () => color(b.dataset.rswatch, b.dataset.c)));
  el.querySelector("[data-ract=del]").addEventListener("click", () => ed.deleteSelection());
  el.querySelector("[data-ract=dup]").addEventListener("click", () => {
    const copy = { ...structuredClone(sel), id: newId(sel.type, allIds(ed.b)), x: r3(sel.x + 0.5), z: r3(sel.z + 0.5) };
    delete copy.entity;
    delete copy.energy_entity;
    ed.sel = { kind: "roofitem", unit: key, id: copy.id };
    ed.changeUnit(key, (r) => {
      r.items = [...(r.items ?? []), copy];
    });
    ed.renderProps();
  });
  bindPad();
}

/** Formular des Hausdachs (auf der Etage, auf der es sitzt). */
function houseFormHtml(ed) {
  const roof = roofSettings(ed.b.settings);
  const raw = ed.b.settings?.roof ?? {};
  const model = roofModel(ed.b);
  const hf = roofFloor(ed.b, roof);
  const auto = roofFloor(ed.b, { ...roof, floor: null });
  const items = raw.items ?? [];
  const legacy = !items.some((x) => x.type === "pv") && (raw.solar_arrays?.length || Object.values(raw.solar ?? {}).some((v) => Number(v) > 0));
  const count = (type) => items.filter((x) => x.type === type).length;
  const floors = [...ed.b.floors].filter((f) => (f.rooms ?? []).length).sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
  const under = new Set((model?.rooms ?? []).map((r) => r.id));
  const cand = (hf?.rooms ?? []).filter((r) => polyOk(r.points));
  const roomRow = (r) => {
    const own = roomRoofType(r) !== "none";
    const part = !own && partOver(ed.b, hf.id, r);
    return `<label class="chk"><input type="checkbox" data-rroom="${esc(r.id)}"${under.has(r.id) ? " checked" : ""}${own || part ? " disabled" : ""}> ${esc(r.name || r.id)}${own ? " (eigenes Dach)" : part ? " (unter Dachteil)" : ""}</label>`;
  };
  const on = roof.type !== "none";
  const stray = on ? strayHouseItems(ed.b).length : 0;
  return `<h3>Hausdach</h3>
    <label>Dachform</label><select data-rr="type">${ROOF_TYPES.map(([k, n]) => `<option value="${k}"${k === roof.type ? " selected" : ""}>${n}</option>`).join("")}</select>
    ${on ? roofFieldsHtml(roof, { kind: "house", type: roof.type, frames: model?.parts ?? [] }) : ""}
    <label>Hausdach sitzt auf</label><select data-rfloor><option value=""${raw.floor ? "" : " selected"}>automatisch (${esc(auto?.name ?? "–")})</option>${floors.map((f) => `<option value="${esc(f.id)}"${f.id === raw.floor ? " selected" : ""}>${esc(f.name)}</option>`).join("")}</select>
    ${on && cand.length ? `<details><summary>Räume unter dem Hausdach (${under.size} von ${cand.length})</summary>
      <label class="chk"><input type="checkbox" data-rroom=""${raw.rooms?.length ? "" : " checked"}> Automatisch (größte Gruppe)</label>${cand.map(roomRow).join("")}
      <p class="muted">Ändern setzt die Kanten-Anpassungen des Hausdachs zurück.</p></details>` : ""}
    ${on ? `<details><summary>Farben und Texturen</summary>${roofColorField("color", "Dachfarbe", roof.color)}${roofTexField("texture", "Dachdeckung (Textur)", roof.texture, "r")}
      ${roofColorField("gable_color", "Giebel: Farbe (Standard = Außenwand)", roof.gable_color)}${roofTexField("gable_texture", "Giebel: Textur", roof.gable_texture, "w")}</details>` : ""}
    ${on ? `<p class="muted">Auf dem Dach: ${count("pv")} PV-Felder · ${count("chimney")} Kamine · ${count("skylight")} Dachfenster. Werkzeug oben wählen und aufs Dach tippen.</p>` : ""}
    ${on && legacy ? `<p class="muted">PV ist noch nach Himmelsrichtung eingetragen (Zahnrad → Haus &amp; Wetter).</p><div class="btns"><button data-ract="legacy">Bisherige PV hier verschiebbar machen</button></div>` : ""}
    ${stray ? `<p class="muted">${stray === 1 ? "1 Ding des Hausdachs liegt" : `${stray} Dinge des Hausdachs liegen`} auf keinem Dach (darunter ist jetzt ein eigenes Dach).</p><div class="btns"><button data-ract="adopt">Auf die Dächer darunter legen</button></div>` : ""}
    ${model?.parts.length ? `<div class="btns"><button data-ract="convert">Automatisches Dach in Dachteile umwandeln</button></div>` : ""}`;
}

function bindHouseForm(ed, el) {
  const save = (fn) => {
    ed.changeUnit("house", fn);
    ed.renderProps();
  };
  bindRoofFields(el, (key, v) =>
    save((r) => {
      applyRoofKey(r, key, key === "direction" && v === "cross" ? "auto" : v, "gable");
    }),
  );
  // Ort und Räume des Hausdachs: Kanten-Anpassungen passen danach nicht mehr
  const moved = (fn, toast) => {
    ed.changeUnit("house", (r) => {
      fn(r);
      delete r.adjust;
    });
    ed._toggleRoofMode(true, { floorId: roofFloor(ed.b, roofSettings(ed.b.settings))?.id ?? ed.floorId });
    ed._toast(toast());
  };
  el.querySelector("[data-rfloor]")?.addEventListener("change", (ev) =>
    moved((r) => {
      setKey(r, "floor", ev.target.value || null);
    }, () => `Hausdach sitzt jetzt auf „${roofFloor(ed.b, roofSettings(ed.b.settings))?.name ?? ""}“ – Kanten-Anpassungen zurückgesetzt.`),
  );
  el.querySelectorAll("[data-rroom]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const had = !!ed.b.settings?.roof?.adjust;
      const ids = new Set((roofModel(ed.b)?.rooms ?? []).map((r) => r.id));
      if (inp.dataset.rroom) {
        if (inp.checked) ids.add(inp.dataset.rroom);
        else ids.delete(inp.dataset.rroom);
      }
      // „Automatisch“ abwählen hält die jetzigen Räume als feste Liste fest
      const auto = inp.dataset.rroom ? !ids.size : inp.checked || !ids.size;
      moved((r) => {
        if (auto) delete r.rooms;
        else r.rooms = [...ids];
      }, () =>(had ? "Das Hausdach deckt jetzt andere Räume – seine Kanten-Anpassungen sind zurückgesetzt." : "Räume unter dem Hausdach geändert."));
    }),
  );
  el.querySelector("[data-ract=legacy]")?.addEventListener("click", () => {
    const list = legacyPvItems(roofModel(ed.b), Number(ed.b.settings?.north) || 0);
    if (!list.length) return ed._toast("Keine PV-Module gefunden, die aufs Dach passen.");
    const ids = allIds(ed.b);
    save((r) => {
      r.items = [...(r.items ?? []), ...list.map((it) => {
        const id = newId("pv", ids);
        ids.add(id);
        return { id, ...it };
      })];
      delete r.solar;
      delete r.solar_arrays;
    });
    ed._toast(`${list.length} PV-Felder übernommen – jetzt einzeln verschiebbar.`);
  });
  el.querySelector("[data-ract=adopt]")?.addEventListener("click", () => {
    let n = 0;
    ed.changeBuilding((b) => {
      n = adoptHouseItems(b, null, { all: true });
    });
    ed._toast(`${n === 1 ? "1 Ding liegt" : `${n} Dinge liegen`} jetzt auf dem Dach darunter.`);
  });
  el.querySelector("[data-ract=convert]")?.addEventListener("click", () => {
    const model = roofModel(ed.b);
    const res = houseToParts(ed.b);
    if (!model || !res?.parts.length) return;
    const ids = allIds(ed.b);
    const fresh = (prefix) => {
      const id = newId(prefix, ids);
      ids.add(id);
      return id;
    };
    const parts = res.parts.map((p) => ({ id: fresh("dach"), ...p }));
    const items = structuredClone(ed.b.settings.roof?.items ?? []);
    if (!items.some((x) => x?.type === "pv")) items.push(...legacyPvItems(model, Number(ed.b.settings?.north) || 0).map((it) => ({ id: fresh("pv"), ...it })));
    // Dinge nach Lage auf die Teile (Fläche darunter), sonst aufs erste Teil
    for (const it of items) {
      const fr = hasPos(it) ? roofSurfaceAt(model, [it.x, it.z])?.part : null;
      (parts[Math.max(0, model.parts.indexOf(fr))].items ??= []).push(it);
    }
    ed.sel = null;
    ed.changeBuilding((b) => {
      const fl = b.floors.find((f) => f.id === res.floorId);
      fl.roofs = [...(fl.roofs ?? []), ...parts];
      const r = b.settings.roof;
      r.type = "none";
      for (const k of ["adjust", "flip", "wing_end", "rooms", "solar", "solar_arrays", "items"]) delete r[k];
    });
    ed._toast(`Automatisches Dach in ${parts.length} Dachteile umgewandelt – es ist jetzt aus (Rückgängig möglich).`);
  });
}
