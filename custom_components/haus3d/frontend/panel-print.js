// Plan drucken oder als Bild speichern (Mixin für Haus3DPanel): Dialog mit Etagen, Inhalt, Papier, Maßstab und Vorschau.
// Der Seitenaufbau (SVG) steckt in plan-print.js und wird erst beim ersten Öffnen nachgeladen. Gedruckt wird aus einem
// unsichtbaren Rahmen (kein Popup, die Seitenleiste von Home Assistant druckt nicht mit), PDF über „Als PDF speichern“
// im Druckfenster, PNG über eine Zeichenfläche (200 dpi).

import { loadOnce } from "./lazy.js";
import { normalize } from "./model.js";
import { ensureStyle, esc } from "./panel-util.js";

/** Breite des 3D-Bilds höchstens (Bildpunkte): größere Fenster werden vor dem Einbetten verkleinert. */
const MAX_SHOT_PX = 3200;

const PRINT_STYLE = `
.printdlg { width: min(560px, 100%); }
.printdlg .pr-floors { display: flex; flex-wrap: wrap; gap: 2px 16px; }
.printdlg .pr-floors label, .printdlg .pr-opts label { display: flex; align-items: center; gap: 8px; min-height: 36px; cursor: pointer; font-size: 14px; }
.printdlg .pr-floors label.off { opacity: .5; cursor: default; }
.printdlg .pr-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.printdlg .pr-opts .wide { grid-column: 1 / -1; }
.printdlg input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--primary-color, #03a9f4); }
.printdlg .pr-row { display: flex; gap: 10px; }
.printdlg .pr-row > div { flex: 1; min-width: 0; }
.printdlg .pr-row > div:first-child { flex: 0 0 96px; }
.printdlg .pr-row label { display: block; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 4px; }
.printdlg select { width: 100%; min-height: 40px; padding: 0 8px; font: inherit; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: var(--primary-background-color, #fff); color: inherit; }
.printdlg .pr-preview { margin-top: 12px; padding: 8px; border-radius: 10px; background: #8d8d8d; }
.printdlg .pr-page { background: #fff; box-shadow: 0 1px 5px rgba(0,0,0,.5); line-height: 0; min-height: 40px; }
.printdlg .pr-page svg { display: block; width: 100%; height: auto; }
.printdlg .pr-nav { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 6px; font-size: 13px; color: #fff; }
.printdlg .pr-nav button { width: 36px; height: 32px; border: none; border-radius: 8px; background: rgba(255,255,255,.2); color: #fff; font-size: 20px; line-height: 1; cursor: pointer; }
.printdlg .pr-nav button[disabled] { opacity: .35; cursor: default; }
.printdlg .hint, .printdlg .muted { margin: 8px 0 0; font-size: 13px; color: var(--secondary-text-color); }
.printdlg .hint.warn { color: #e65100; }
.printdlg .btns { position: sticky; bottom: 0; margin: 12px -16px -16px; padding: 10px 16px 14px; background: var(--card-background-color, #fff); border-top: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
.printdlg .btns button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.printdlg .btns button[disabled] { opacity: .4; cursor: default; }
.printdlg select { text-overflow: ellipsis; }
`;

export const PrintMethods = {
  /** Dialog „Plan drucken“: aus dem Panel oder aus dem geöffneten Editor ({ editor }; dann gilt dessen Stand, auch ungespeichert). */
  async _openPrint({ editor } = {}) {
    if (this._printOpening || this._dialog?.querySelector?.(".printdlg")) return;
    const fromAdmin = !editor && !!this._adminOpen;
    let mod;
    this._printOpening = true; // beim ersten Mal lädt plan-print.js nach: kein zweiter Dialog durch Doppeltippen
    try {
      mod = await loadOnce("plan-print", () => import("./plan-print.js"));
    } catch (err) {
      this._toast(`Drucken fehlgeschlagen: ${err?.message ?? err}`);
      return;
    } finally {
      this._printOpening = false;
    }
    if (editor && this._editor !== editor) return; // währenddessen geschlossen
    this._closePopup?.();
    this._closeDialog();
    editor?.renderBar?.(); // Mehr-Menü des Editors schließen
    ensureStyle(this.shadowRoot, "print", PRINT_STYLE);

    const building = normalize(structuredClone(editor ? editor.b : this._building));
    const floors = [...building.floors].sort((a, b) => a.elevation - b.elevation);
    const filled = (f) => (f.rooms?.length ?? 0) + (f.outdoor?.length ?? 0) + (f.walls?.length ?? 0) > 0;
    let first = editor ? [editor.floorId] : this._filter && this._filter !== "all" ? [this._filter] : floors.filter(filled).map((f) => f.id);
    first = first.filter((id) => floors.some((f) => f.id === id && filled(f)));
    if (!first.length) first = floors.filter(filled).map((f) => f.id);

    // 3D-Bild der aktuellen Ansicht: einmal beim Öffnen aufnehmen (Editor-3D, wenn sie zu sehen ist, sonst die Ansicht des Panels)
    const scene = this._printScene(editor);
    let shot = null;
    try {
      const url = scene ? this._capture3d(scene) : null;
      shot = typeof url === "string" && url.startsWith("data:image/png") && url.length > 200 ? url : null;
    } catch {
      shot = null;
    }

    const st = { sel: new Set(first), dims: true, names: true, north: true, outdoor: true, bw: false, shot3d: !!shot, paper: "A4", scale: "auto", page: 0 };
    const el = document.createElement("div");
    el.className = "dialog-backdrop sheet-backdrop";
    el.innerHTML = `<div class="dialog sheet printdlg" role="dialog" aria-label="Plan drucken">
      <div class="dialog-head"><span class="ttl">Plan drucken</span><button class="icon close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="dialog-body">
        <h4>Etagen</h4>
        <div class="pr-floors">${floors.map((f) => `<label class="${filled(f) ? "" : "off"}"><input type="checkbox" data-f="${esc(f.id)}"${st.sel.has(f.id) ? " checked" : ""}${filled(f) ? "" : " disabled"}><span>${esc(f.name)}${filled(f) ? "" : " (leer)"}</span></label>`).join("")}</div>
        <p class="hint nofloor" hidden></p>
        <h4>Inhalt</h4>
        <div class="pr-opts">
          <label><input type="checkbox" data-o="dims" checked><span>Maße</span></label>
          <label><input type="checkbox" data-o="names" checked><span>Raumnamen und Flächen</span></label>
          <label><input type="checkbox" data-o="north" checked><span>Nordpfeil</span></label>
          <label><input type="checkbox" data-o="outdoor" checked><span>Garten und Außenflächen</span></label>
          <label><input type="checkbox" data-o="bw"><span>Schwarz-Weiß</span></label>
          <label class="wide"><input type="checkbox" data-o="shot3d"${shot ? " checked" : " disabled"}><span>3D-Bild der aktuellen Ansicht anhängen</span></label>
        </div>
        <p class="hint no3d" ${shot ? "hidden" : ""}>3D-Ansicht nicht verfügbar.${editor && !scene ? " Im Editor die 3D-Ansicht einschalten." : ""}</p>
        <div class="pr-row" style="margin-top:10px">
          <div><label for="pr-paper">Papier</label><select id="pr-paper" data-ppaper><option value="A4">A4</option><option value="A3">A3</option></select></div>
          <div><label for="pr-scale">Maßstab</label><select id="pr-scale" data-pscale></select></div>
        </div>
        <p class="hint warn toobig" hidden>Der Plan passt auch beim kleinsten Maßstab nicht auf das Blatt – größeres Papier oder weniger Etagen wählen.</p>
        <div class="pr-preview"><div class="pr-page" aria-label="Vorschau"></div>
          <div class="pr-nav"><button data-nav="-1" title="Vorherige Seite" aria-label="Vorherige Seite">‹</button><span class="pn"></span><button data-nav="1" title="Nächste Seite" aria-label="Nächste Seite">›</button></div></div>
        <p class="muted">Der Maßstab stimmt beim Drucken in Originalgröße (100 %). Als PDF: im Druckfenster „Als PDF speichern“ wählen.</p>
        <div class="btns"><button data-p="png"><ha-icon icon="mdi:file-image-outline"></ha-icon> PNG speichern</button><button class="primary" data-p="print"><ha-icon icon="mdi:printer-outline"></ha-icon> Drucken …</button></div>
      </div></div>`;
    const q = (s) => el.querySelector(s);
    const close = () => {
      if (this._dialog === el) this._closeDialog();
      else el.remove();
      if (fromAdmin) this._openAdmin("data"); // zurück zu Daten & Verlauf
    };
    let plan = null;
    const refresh = () => {
      const ids = floors.filter((f) => st.sel.has(f.id)).map((f) => f.id);
      const opts = { dims: st.dims, names: st.names, north: st.north, outdoor: st.outdoor, bw: st.bw, date: new Date() };
      const bounds = mod.unionBounds(ids.map((id) => mod.floorBounds(floors.find((f) => f.id === id), building.settings, opts)));
      const fitting = mod.fittingScales(bounds, st.paper);
      if (st.scale !== "auto" && !fitting.includes(Number(st.scale))) st.scale = "auto";
      plan = mod.planPages(building, { floors: ids, paper: st.paper, scale: st.scale === "auto" ? null : Number(st.scale), shot: st.shot3d && shot ? shot : null, ...opts });
      q("[data-pscale]").innerHTML = `<option value="auto">Automatisch (1:${mod.pickLayout(bounds, st.paper).scale})</option>${fitting.map((s) => `<option value="${s}">1:${s}</option>`).join("")}`;
      q("[data-pscale]").value = String(st.scale);
      q("[data-ppaper]").value = st.paper;
      const none = !ids.length;
      const nf = q(".nofloor");
      nf.hidden = !none;
      nf.textContent = floors.length ? "Mindestens eine Etage wählen." : "Noch keine Etage. Erst einen Grundriss anlegen (Zahnrad → „Bearbeiten“).";
      q(".toobig").hidden = none || plan.layout.fits;
      el.querySelectorAll("[data-p]").forEach((b) => (b.disabled = none));
      st.page = Math.max(0, Math.min(st.page, plan.pages.length - 1));
      q(".pr-page").innerHTML = plan.pages[st.page]?.svg ?? "";
      q(".pn").textContent = plan.pages.length ? `${plan.pages[st.page].name} · ${st.page + 1} / ${plan.pages.length}` : "";
      q('[data-nav="-1"]').disabled = st.page <= 0;
      q('[data-nav="1"]').disabled = st.page >= plan.pages.length - 1;
      q(".pr-nav").hidden = plan.pages.length < 2;
    };
    el.querySelectorAll("[data-f]").forEach((c) => c.addEventListener("change", () => {
      if (c.checked) st.sel.add(c.dataset.f);
      else st.sel.delete(c.dataset.f);
      refresh();
    }));
    el.querySelectorAll("[data-o]").forEach((c) => c.addEventListener("change", () => {
      st[c.dataset.o] = c.checked;
      refresh();
    }));
    q("[data-ppaper]").addEventListener("change", (ev) => {
      st.paper = ev.target.value;
      refresh();
    });
    q("[data-pscale]").addEventListener("change", (ev) => {
      st.scale = ev.target.value;
      refresh();
    });
    el.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => {
      st.page += Number(b.dataset.nav);
      refresh();
    }));
    q('[data-p="print"]').addEventListener("click", async () => {
      if (!plan?.pages.length) return;
      try {
        await this._printFrame(mod.printHtml(plan.pages.map((p) => p.svg), plan.layout, `${mod.houseName(building)} – Plan`));
      } catch (err) {
        this._toast(`Drucken fehlgeschlagen: ${err?.message ?? err}`);
      }
    });
    q('[data-p="png"]').addEventListener("click", async () => {
      if (!plan?.pages.length) return;
      const date = new Date();
      let n = 0;
      try {
        for (const p of plan.pages) {
          await this._savePng(p.svg, mod.planFileName(p.kind, p.id, date));
          n++;
          if (n < plan.pages.length) await new Promise((r) => setTimeout(r, 350)); // dem Browser Zeit für jeden Download lassen
        }
        this._toast(n === 1 ? "PNG gespeichert." : `${n} PNG gespeichert.`);
      } catch (err) {
        this._toast(`Speichern fehlgeschlagen: ${err?.message ?? err}`);
      }
    });
    q(".close").addEventListener("click", close);
    el.addEventListener("click", (ev) => ev.target === el && close());
    // Eingaben im Fenster gehen nicht an den Editor bzw. das Panel (Entf, Esc, Tastenkürzel)
    el.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") close();
    });
    refresh();
    this._els.stage.appendChild(el);
    this._dialog = el;
    q(".close").focus();
  },

  /** Welche 3D-Ansicht lässt sich aufnehmen? Editor-3D, wenn sie zu sehen ist; sonst die Ansicht des Panels (im Editor nur ohne ungespeicherte Änderungen). */
  _printScene(editor) {
    const ok = (sc) => {
      const c = sc?.renderer?.domElement;
      return !!c && c.isConnected && !sc.contextLost && c.clientWidth > 0 && c.clientHeight > 0;
    };
    if (editor) {
      if (editor.viewMode !== "2d" && ok(editor.scene3d)) return editor.scene3d;
      return editor.dirty ? null : ok(this._scene) ? this._scene : null;
    }
    return ok(this._scene) ? this._scene : null;
  },

  /** 3D-Ansicht der Szene als PNG-Daten-URL (sofort nach dem Zeichnen gelesen; kurz mit mindestens doppelter Auflösung). */
  _capture3d(scene) {
    const r = scene?.renderer;
    if (!r || scene.contextLost) return null;
    const prev = r.getPixelRatio();
    const boost = prev < 2;
    try {
      if (boost) r.setPixelRatio(2); // setzt die Größe der Zeichenfläche neu (und leert sie)
      r.render(scene.scene, scene.camera);
      const src = r.domElement;
      if (src.width <= MAX_SHOT_PX) return src.toDataURL("image/png");
      // sehr große Fenster: auf die Druckgröße verkleinern (A3 braucht bei 300 dpi rund 5 000 Punkte, A4 rund 3 500)
      const small = document.createElement("canvas");
      small.width = MAX_SHOT_PX;
      small.height = Math.max(1, Math.round((src.height * MAX_SHOT_PX) / src.width));
      small.getContext("2d").drawImage(src, 0, 0, small.width, small.height);
      return small.toDataURL("image/png");
    } catch {
      return null;
    } finally {
      if (boost) {
        r.setPixelRatio(prev);
        scene.invalidate?.(); // die Zeichenfläche ist wieder leer: beim nächsten Bild neu zeichnen
      }
    }
  },

  /** HTML in einem unsichtbaren Rahmen drucken (im Test ersetzbar). Fertig, wenn das Druckfenster zu ist (spätestens nach 60 s). */
  _printFrame(html) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
      let timer = null;
      let done = false;
      const end = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        frame.remove();
        if (err) reject(err);
        else resolve();
      };
      frame.addEventListener("load", () => {
        try {
          const win = frame.contentWindow;
          win.addEventListener("afterprint", () => end());
          win.focus();
          win.print();
        } catch (err) {
          end(err);
        }
      });
      timer = setTimeout(() => end(), 60000);
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
  },

  /** SVG als PNG speichern (Download, 200 dpi, weißer Grund). */
  async _savePng(svg, name) {
    const m = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg);
    const wmm = m ? Number(m[1]) : 277;
    const hmm = m ? Number(m[2]) : 189;
    const W = Math.round((wmm / 25.4) * 200);
    const H = Math.round((hmm / 25.4) * 200);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Bild konnte nicht erzeugt werden"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG konnte nicht erzeugt werden");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      this.shadowRoot.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
