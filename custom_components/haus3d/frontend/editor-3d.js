// 3D-Ansicht im Editor (Mixin für FloorEditor): Szene anlegen und gebündelt nachziehen, Auswahl
// markieren; Klick wählt Raum, Möbel oder Verteiler, Ziehen auf einem Teil verschiebt es auf dem Boden.
// Achsen-Pfeile (rot X, grün Höhe, blau Z) am gewählten Teil mit Live-Vorschau; Strg bzw. „Nur Ansicht“
// = nur Kamera (drehen, schieben, zoomen), nichts wird ausgewählt oder verschoben.

import { HouseScene } from "./scene.js";
import { normalize } from "./model.js";
import { AxisArrows, targetObject, liveTarget, liveRestore, moveLive } from "./scene-arrows.js";
import { AXIS_DIR, AXIS_LABEL, applyAxis, arrowAnchor, axisParam, axisValue, hint3d, orbitButtons, viewOnly } from "./arrows3d.js";

/** Grenze für das Ziehen über den Boden (m), knapp innerhalb der Koordinaten-Grenze des Schemas. */
const PLAN_LIMIT = 990;
const clampPlan = (v) => Math.max(-PLAN_LIMIT, Math.min(PLAN_LIMIT, v));

export const Editor3dMethods = {
  /** 3D-Ansicht nachziehen (gebündelt, damit Ziehen flüssig bleibt; während der Live-Vorschau erst danach). */
  _sync3d(now = false) {
    if (this.viewMode === "2d") return;
    clearTimeout(this._3dTimer);
    this._3dPending = true;
    const run = () => {
      if (this._live3d || !this.root.isConnected || this.viewMode === "2d") return;
      this._3dPending = false;
      if (!this.scene3d) this._create3d();
      const first = !this._3dShown;
      // Dach-Ebene: ganzes Haus mit Dach
      const view = this.roofMode ? "all" : this.floorId;
      this.scene3d.setLayers({ ...(this.scene3d.layers ?? {}), roof: true, weather: false });
      this.scene3d.filter = view;
      this.scene3d.setBuilding(normalize(structuredClone(this.b)), { keepCamera: !first || this._3dFloor === view });
      if (first || this._3dFloor !== view) this.scene3d.setFilter(view, { fit: true });
      this._3dShown = true;
      this._3dFloor = view;
      this._mark3d();
    };
    if (this._live3d) return; // Live-Vorschau: Neuaufbau erst am Ende des Zugs (_liveEnd)
    if (now) run();
    else this._3dTimer = setTimeout(run, 120);
  },

  _mark3d() {
    if (!this.scene3d) return;
    this.scene3d.markFurniture(this.sel?.kind === "furniture" ? this.sel.id : null);
    this.scene3d.selectRooms(this.sel?.kind === "room" ? [{ floorId: this.floorId, roomId: this.sel.id }] : [], { focus: false });
    this._arrows3d();
  },

  /** Pfeile am gewählten Möbelstück bzw. Verteiler (nicht in der Dach-Ebene und bei Mehrfachauswahl). */
  _arrows3d() {
    const sc = this.scene3d;
    if (!sc) return;
    const floor = this.floor;
    const a = this.roofMode || this.multi?.length || !floor ? null : arrowAnchor(floor, this.sel, this.b);
    if (!a) {
      this._arrows?.detach();
      this._hover3d(null);
    } else {
      this._arrows ??= new AxisArrows(sc, { coarse: this.coarse });
      const elev = floor.elevation ?? 0;
      this._arrows.attach([a.x, elev + a.y, a.z], { axes: a.axes, outline: this.sel.kind === "pnode" ? targetObject(sc, this.sel) : null });
    }
    this._setView3d();
  },

  _create3d() {
    const sc = new HouseScene(this.box3d, { dark: this.dark });
    sc.setStyle(this.sceneStyle === "cyber" ? "cyber" : this.sceneStyle === "night" ? "night" : "standard");
    sc.setLayers({ roof: false, weather: false });
    sc.start();
    this.scene3d = sc;
    const box = this.box3d;
    const canvas = sc.renderer.domElement;
    try {
      this._mac = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || "");
    } catch {
      this._mac = false;
    }
    this._hintEl = box.querySelector(".ed-3d-hint");
    if (!this._viewBtn) {
      box.insertAdjacentHTML("beforeend", `<button type="button" class="ed-3d-view" aria-pressed="false" title="Nur Ansicht: drehen, schieben und zoomen, ohne etwas auszuwählen oder zu verschieben (wie Strg gedrückt halten)"><ha-icon icon="mdi:eye-outline"></ha-icon><span>Nur Ansicht</span></button>`);
      this._viewBtn = box.querySelector(".ed-3d-view");
      this._viewBtn.addEventListener("click", () => {
        this.mods.view = !this.mods.view;
        this._hover3d(null);
        this._setView3d();
        this._toast(this.mods.view ? "Nur Ansicht an: Ziehen dreht die Kamera, nichts wird ausgewählt." : "Nur Ansicht aus.");
      });
    }
    // im Capture-Modus vor der Kamera-Steuerung: Pfeile anfassen, Teile ziehen, Strg = nur Ansicht
    const on = (this._on3d = {
      down: (ev) => this._3dDown(ev),
      move: (ev) => this._3dMove(ev),
      up: (ev) => this._3dUp(ev),
      wheel: (ev) => this._3dWheel(ev),
      leave: () => this._hover3d(null),
      canvas,
    });
    box.addEventListener("pointerdown", on.down, true);
    box.addEventListener("pointermove", on.move, true);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) box.addEventListener(t, on.up, true);
    box.addEventListener("wheel", on.wheel, { capture: true, passive: false });
    canvas.addEventListener("pointerleave", on.leave);
    this._keys3d = (ev) => this._3dKeys(ev);
    window.addEventListener("keydown", this._keys3d, true);
    window.addEventListener("keyup", this._keys3d, true);
    window.addEventListener("blur", this._keys3d);
    this._setView3d(false);
  },

  /** Teil unter dem Zeiger: Verteiler (direkt getroffen) vor Möbeln, Verteiler knapp daneben vor dem Raum. */
  _pick3d(x, y) {
    const n = this.scene3d.pickNode(x, y, this.coarse ? 26 : 14);
    const ok = n && (this.floor?.nodes ?? []).some((q) => q.id === n.id);
    if (ok && n.direct) return { pnode: n.id };
    const hit = this.scene3d.pick(x, y, { furniture: true });
    if (hit?.furniture) return hit;
    return ok ? { pnode: n.id } : hit;
  },

  _3dDown(ev) {
    const sc = this.scene3d;
    if (!sc || ev.target !== sc.renderer.domElement) return;
    if (this._axisDrag) {
      // weiterer Finger bzw. Taste während eines Pfeil-Zugs: nicht an die Kamera weitergeben
      ev.stopPropagation();
      ev.preventDefault();
      return;
    }
    // neuer erster Zeiger: ein liegengebliebener Zug (Loslassen nicht angekommen) ist vorbei
    if (this._drag3d && ev.isPrimary) this._floorUp({ pointerId: this._drag3d.id, type: "pointercancel" });
    const view = viewOnly(ev, this.mods);
    sc.controls.mouseButtons = orbitButtons(view, ev);
    this._setView3d(ev.ctrlKey || ev.metaKey);
    if (view || this.roofMode || ev.button !== 0 || !ev.isPrimary || this._drag3d || !this.floor) return;
    const axis = this._arrows?.hit(ev.clientX, ev.clientY);
    if (axis && this._axisStart(ev, axis)) {
      ev.stopPropagation();
      ev.preventDefault();
      return;
    }
    this._floorDown(ev);
  },

  _3dMove(ev) {
    const d = this._axisDrag;
    if (d) {
      if (ev.pointerId === d.id) this._axisMove(ev);
      return;
    }
    if (this._drag3d) return this._floorMove(ev);
    if (ev.pointerType === "touch" || ev.buttons || ev.target !== this.scene3d?.renderer.domElement) return;
    this._setView3d(ev.ctrlKey || ev.metaKey);
    this._hover3d(this._view3d || this.roofMode ? null : (this._arrows?.hit(ev.clientX, ev.clientY) ?? null));
  },

  _3dUp(ev) {
    const d = this._axisDrag;
    if (d) {
      if (ev.pointerId === d.id) this._axisEnd();
      return;
    }
    this._floorUp(ev);
  },

  _3dWheel(ev) {
    // Strg wirklich gedrückt: normal zoomen (die Steuerung hielte es sonst für eine Zwei-Finger-Geste, ×10)
    const c = this.scene3d?.controls;
    if (c) c._controlActive = !!this._ctrlHeld;
    if (ev.ctrlKey || this._axisDrag) ev.preventDefault();
  },

  _3dKeys(ev) {
    if (ev.type === "blur") {
      this._ctrlHeld = false;
      if (this._axisDrag) this._axisEnd();
      return this._setView3d(false);
    }
    if (ev.key === "Control") this._ctrlHeld = ev.type === "keydown";
    this._setView3d(!!(ev.ctrlKey || ev.metaKey));
    if (ev.type !== "keydown" || !(this._axisDrag || this._drag3d?.furn) || ["Shift", "Control", "Meta", "Alt"].includes(ev.key)) return;
    ev.preventDefault();
    ev.stopPropagation(); // während eines Zugs (Pfeil oder über den Boden) keine Kürzel (Strg+Z, Entf, Pfeile …)
    if (ev.key === "Escape" && this._axisDrag) this._axisEnd({ cancel: true });
  },

  // ---------------------------------------------------------------- Ziehen über den Boden

  /** Zugdaten für ein Teil (Möbel oder Verteiler) unter dem Zeiger bei ev; null ohne Anker. */
  _grab3d(ev, sel) {
    const a = arrowAnchor(this.floor, sel, this.b);
    if (!a) return null;
    const y0 = (this.floor.elevation ?? 0) + a.base;
    const p = this.scene3d.planPoint(ev.clientX, ev.clientY, y0) ?? [a.x, a.z];
    return { mode: sel.kind === "pnode" ? "pnode" : "furniture", id: sel.id, sel, off: [p[0] - a.x, p[1] - a.z], y0, first: true, faces: this._faces() };
  },

  _floorDown(ev) {
    const sc = this.scene3d;
    const hit = this._pick3d(ev.clientX, ev.clientY);
    const drag = (this._drag3d = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, hit, moved: false });
    const sel = hit?.pnode ? { kind: "pnode", id: hit.pnode } : hit?.furniture ? { kind: "furniture", id: hit.furniture } : null;
    drag.furn = sel ? this._grab3d(ev, sel) : null;
    if (!drag.furn) return;
    // eingebautes Gerät hinter der Glastür: Antippen wählt das Gerät, Ziehen nimmt den Schrank mit (nicht das Gerät heraus)
    const cabId = sel.kind === "furniture" ? (this.floor.furniture ?? []).find((m) => m.id === sel.id)?.in_rack : null;
    if (cabId != null && (this.floor.furniture ?? []).some((m) => m.id === cabId)) drag.cab = this._grab3d(ev, { kind: "furniture", id: cabId });
    sc.controls.enabled = false;
    sc.renderer.domElement.setPointerCapture?.(ev.pointerId);
    this.sel = sel;
    this.renderProps();
    this.render();
  },

  _floorMove(ev) {
    const drag = this._drag3d;
    if (ev.pointerId !== drag.id) return;
    if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 4) drag.moved = true;
    if (drag.moved && drag.cab) {
      // der Zug beginnt: statt des Geräts den Schrank greifen (Auswahl wechselt mit)
      drag.furn = drag.cab;
      drag.cab = null;
      this.sel = drag.furn.sel;
      this.renderProps();
      this.render();
    }
    const f = drag.furn;
    if (!f || !drag.moved) return;
    const q = this.scene3d.planPoint(ev.clientX, ev.clientY, f.y0);
    if (!q || !q.every(Number.isFinite)) return;
    let p = q.map(clampPlan);
    // Möbel ziehen den Griffversatz selbst ab (_moveDrag), Verteiler nicht
    if (f.mode === "pnode") p = [p[0] - f.off[0], p[1] - f.off[1]];
    this._liveStart(f.sel);
    this._moveDrag(f, ev, p);
    this._preview3d();
  },

  _floorUp(ev) {
    const drag = this._drag3d;
    if (!drag || ev.pointerId !== drag.id) return;
    this._drag3d = null;
    const sc = this.scene3d;
    if (sc) {
      sc.controls.enabled = true;
      const c = sc.renderer.domElement;
      if (c.hasPointerCapture?.(ev.pointerId)) c.releasePointerCapture(ev.pointerId);
    }
    if (!drag.furn) {
      // Klick ohne Teil: Raum wählen (oder Auswahl aufheben); Drehen der Kamera wählt nichts
      if (drag.moved || ev.type !== "pointerup") return;
      const hit = drag.hit;
      this.sel = hit?.roomId && hit.floorId === this.floorId ? { kind: "room", id: hit.roomId } : null;
      this.render();
      this.renderProps();
      return;
    }
    this._resetMods(drag.furn);
    this._liveEnd();
    this.renderProps();
  },

  /** „Frei“/„Einzeln“ gelten für einen Zug: nach einer Änderung zurücksetzen. */
  _resetMods(d) {
    if (d.first !== false || !(this.mods.free || this.mods.solo)) return;
    this.mods.free = false;
    this.mods.solo = false;
    this._updateTouch?.();
  },

  // ---------------------------------------------------------------- Pfeile ziehen

  _axisStart(ev, axis) {
    const sc = this.scene3d;
    const fl = this.floor;
    const a = this.roofMode || this.multi?.length || !fl ? null : arrowAnchor(fl, this.sel, this.b);
    if (!a || !a.axes.includes(axis) || !this._arrows) return false;
    const origin = [a.x, (fl.elevation ?? 0) + a.y, a.z];
    const r = this._arrows.ray(ev.clientX, ev.clientY);
    const t0 = axisParam(origin, AXIS_DIR[axis], r.origin, r.direction);
    if (t0 == null) return false;
    const start = axis === "y" ? a.base : a[axis];
    this._axisDrag = { axis, id: ev.pointerId, origin, t0, start, cur: start, max: a.max, sel: { ...this.sel }, first: true, undoLen: -1, x: ev.clientX, y: ev.clientY, moved: false };
    this._liveStart(this.sel);
    sc.controls.enabled = false;
    sc.renderer.domElement.setPointerCapture?.(ev.pointerId);
    this._hover3d(axis);
    this.box3d?.classList.add("axis");
    return true;
  },

  _axisMove(ev) {
    const d = this._axisDrag;
    if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) <= 3) return;
    d.moved = true;
    // Auswahl gewechselt, eine andere Änderung dazwischen oder Teil weg: Zug beenden
    const same = this.sel?.kind === d.sel.kind && this.sel?.id === d.sel.id;
    if (!same || (!d.first && this.undoStack.length !== d.undoLen) || !arrowAnchor(this.floor, d.sel, this.b)) return this._axisEnd();
    const r = this._arrows.ray(ev.clientX, ev.clientY);
    const t = axisParam(d.origin, AXIS_DIR[d.axis], r.origin, r.direction);
    if (t == null) return;
    const v = axisValue(d.axis, d.start, t - d.t0, { grid: this.b.settings?.grid ?? 0.05, free: this._free(ev), max: d.max });
    if (v === d.cur) return;
    d.cur = v;
    if (d.first) {
      // Verlauf vor dem Zug (Esc stellt ihn wieder her; _pushUndo ersetzt redoStack, ändert es aber nicht)
      d.undo0 = [...this.undoStack];
      d.redo0 = this.redoStack;
    }
    this.change((fl) => {
      applyAxis(fl, d.sel, d.axis, v, this.b);
    }, { merge: !d.first });
    if (d.first) d.undoLen = this.undoStack.length;
    d.first = false;
    this._preview3d();
    this._toast(`${AXIS_LABEL[d.axis]}: ${v.toFixed(2).replace(".", ",")} m`);
  },

  /** Pfeil-Zug beenden; cancel (Esc) nimmt die Änderung dieses Zugs zurück, ohne Wiederholen-Schritt. */
  _axisEnd({ cancel = false } = {}) {
    const d = this._axisDrag;
    if (!d) return;
    this._axisDrag = null;
    const sc = this.scene3d;
    if (sc) {
      sc.controls.enabled = true;
      const c = sc.renderer.domElement;
      if (c.hasPointerCapture?.(d.id)) c.releasePointerCapture(d.id);
    }
    this._hover3d(null);
    if (cancel && !d.first && this.undoStack.length === d.undoLen) {
      this.undo();
      this.undoStack = d.undo0;
      this.redoStack = d.redo0;
      this.renderBar();
      this.sel = d.sel;
      this.render();
      this._preview3d();
    } else this._resetMods(d);
    this._liveEnd();
    if (!d.first) this.renderProps();
  },

  _hover3d(axis) {
    const k = axis ?? null;
    if (k !== this._hoverAxis) {
      this._hoverAxis = k;
      this._arrows?.hover(k);
    }
    this.box3d?.classList.toggle("axis", !!(k || this._axisDrag));
  },

  // ---------------------------------------------------------------- Live-Vorschau (ohne Neuaufbau)

  _liveStart(sel) {
    if (this._live3d || !this.scene3d || !sel) return;
    const a0 = arrowAnchor(this.floor, sel, this.b);
    if (!a0) return;
    clearTimeout(this._3dTimer);
    // mit der Etage: eingebaute Geräte ziehen mit, Rohre angeschlossener Leitungen sind während des Zugs ausgeblendet
    this._live3d = { sel: { ...sel }, a0, ...liveTarget(this.scene3d, sel, this.floor) };
  },

  _preview3d() {
    const L = this._live3d;
    const sc = this.scene3d;
    const fl = this.floor;
    if (!L || !sc || !fl) return;
    const a = arrowAnchor(fl, L.sel, this.b);
    if (!a) return;
    const item = L.sel.kind === "pnode" ? (fl.nodes ?? []).find((q) => q.id === L.sel.id) : (fl.furniture ?? []).find((q) => q.id === L.sel.id);
    // Drehung mitnehmen (Magnet an der Wand, Verteiler zur Wand, K12); ohne Angabe bleibt die des Modells
    const rot = Number.isFinite(Number(item?.rotation)) && item?.rotation != null ? Number(item.rotation) : null;
    moveLive(sc, L, [a.x - L.a0.x, a.y - L.a0.y, a.z - L.a0.z], rot);
    this._arrows?.setPosition([a.x, (fl.elevation ?? 0) + a.y, a.z]);
  },

  _liveEnd() {
    const L = this._live3d;
    if (!L) return;
    this._live3d = null;
    if (this._3dPending) this._sync3d();
    else liveRestore(L); // kein Neuaufbau: ausgeblendete Rohre wieder zeigen
  },

  // ---------------------------------------------------------------- Nur Ansicht, Hinweis, Aufräumen

  /** key = Strg/⌘ gedrückt (ohne Angabe: wie zuletzt); Ansicht, Pfeile, Knopf und Hinweis abgleichen. */
  _setView3d(key = this._ctrl3d) {
    this._ctrl3d = !!key;
    const view = this._ctrl3d || !!this.mods?.view;
    if (view !== this._view3d) {
      this._view3d = view;
      this.box3d?.classList.toggle("view", view);
      if (view) this._hover3d(null);
    }
    this._arrows?.dim(view);
    const btn = this._viewBtn;
    const on = !!this.mods?.view;
    if (btn && btn.getAttribute("aria-pressed") !== String(on)) {
      btn.classList.toggle("sel", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    const text = hint3d({ view, coarse: this.coarse, roof: this.roofMode, mac: this._mac });
    if (this._hintEl && this._hintEl.textContent !== text) this._hintEl.textContent = text;
  },

  _destroy3d() {
    clearTimeout(this._3dTimer);
    this._3dPending = false;
    this._live3d = null;
    this._drag3d = null;
    this._axisDrag = null;
    const on = this._on3d;
    if (on) {
      const box = this.box3d;
      box?.removeEventListener("pointerdown", on.down, true);
      box?.removeEventListener("pointermove", on.move, true);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) box?.removeEventListener(t, on.up, true);
      box?.removeEventListener("wheel", on.wheel, { capture: true });
      on.canvas?.removeEventListener("pointerleave", on.leave);
      this._on3d = null;
    }
    if (this._keys3d) {
      window.removeEventListener("keydown", this._keys3d, true);
      window.removeEventListener("keyup", this._keys3d, true);
      window.removeEventListener("blur", this._keys3d);
      this._keys3d = null;
    }
    this._arrows?.dispose();
    this._arrows = null;
    this.scene3d?.dispose();
    this.scene3d = null;
  },
};

export const EDITOR3D_STYLE = `
.ed-3d .ed-3d-hint { position: absolute; left: 8px; top: 8px; max-width: calc(100% - 150px); font-size: 11px; line-height: 1.35; padding: 3px 8px; border-radius: 10px; background: rgba(0,0,0,.45); color: #fff; pointer-events: none; }
.ed-3d .ed-3d-hint:empty { display: none; }
.ed-3d .ed-3d-view { position: absolute; right: 8px; top: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 10px; border-radius: 16px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size: 12px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.2); --mdc-icon-size: 18px; }
.ed-3d .ed-3d-view.sel { background: var(--primary-color, #03a9f4); color: #fff; border-color: transparent; }
.ed-3d.view canvas { cursor: grab; }
.ed-3d.view canvas:active { cursor: grabbing; }
.ed-3d.axis canvas { cursor: move; }
@media (pointer: coarse) {
  .ed-3d .ed-3d-view { min-height: 44px; padding: 0 14px; font-size: 13px; }
}
`;
