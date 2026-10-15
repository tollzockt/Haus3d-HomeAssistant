// Hilfe „?“ (Mixin für Haus3DPanel): durchsuchbare Hilfe mit Gesten, Tastenkürzeln, Werkzeugen und Farben. Der Inhalt
// (help-data.js) wird erst beim ersten Öffnen geladen; die Hilfe lädt nichts aus dem Netz, nur die Links mit „↗“
// („Ausführliche Anleitung“, „Mehr“) öffnen die README. Im Editor zeigt sie zuerst das gerade aktive Werkzeug.

import { ensureStyle, esc, touchScroll } from "./panel-util.js";
import { loadOnce } from "./lazy.js";

const loadData = () => loadOnce("help-data", () => import("./help-data.js"));
const coarse = () => !!window.matchMedia?.("(pointer: coarse)").matches;

export const HELP_STYLE = `
.dialog.sheet.helpdlg { width: min(640px, 100%); height: min(760px, calc(100% - 16px)); display: flex; flex-direction: column; overflow: hidden; }
.helpdlg .hhead { flex: none; padding: 10px 16px 4px; }
.helpdlg .hsearch { width: 100%; box-sizing: border-box; min-height: 44px; font: inherit; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: var(--primary-background-color, #fff); color: var(--primary-text-color); }
.helpdlg .hchips { display: flex; gap: 6px; overflow-x: auto; padding: 8px 0 4px; }
.helpdlg .hchips button { flex: none; min-height: 36px; padding: 0 12px; font: inherit; font-size: 13px; border-radius: 18px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; cursor: pointer; }
.helpdlg .hdemo { margin: 6px 0 0; padding: 6px 10px; border-radius: 8px; font-size: 13px; background: rgba(0,137,123,.15); }
.helpdlg .hbody { flex: 1; min-height: 0; overflow-y: auto; padding-top: 4px; }
.helpdlg .hctx { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 8px 12px; border-radius: 10px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent); --mdc-icon-size: 20px; }
.helpdlg .hctx ha-icon { color: var(--primary-color, #03a9f4); flex: none; }
.helpdlg details.hsec { border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.2)); }
.helpdlg details.hsec > summary { display: flex; align-items: center; gap: 10px; min-height: 48px; cursor: pointer; font-weight: 500; list-style: none; --mdc-icon-size: 22px; }
.helpdlg details.hsec > summary::-webkit-details-marker { display: none; }
.helpdlg details.hsec > summary ha-icon { color: var(--primary-color, #03a9f4); flex: none; }
.helpdlg details.hsec > summary .hn { margin-left: auto; font-weight: 400; font-size: 12px; color: var(--secondary-text-color); }
.helpdlg details.hsec > summary::after { content: "▾"; color: var(--secondary-text-color); transition: transform .15s; }
.helpdlg details.hsec[open] > summary::after { transform: rotate(180deg); }
.helpdlg .hitem { display: flex; gap: 10px; padding: 8px 6px; border-radius: 10px; --mdc-icon-size: 20px; }
.helpdlg .hitem > ha-icon { flex: none; margin-top: 2px; color: var(--secondary-text-color); }
.helpdlg .hitem.hl { background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent); outline: 2px solid var(--primary-color, #03a9f4); }
.helpdlg .hmain { flex: 1; min-width: 0; font-size: 14px; line-height: 1.4; }
.helpdlg .hmain b { font-weight: 600; }
.helpdlg .hmain p { margin: 2px 0 0; overflow-wrap: anywhere; }
.helpdlg .hmain .hin, .helpdlg .hsecname, .helpdlg .hmain .hk { font-size: 13px; color: var(--secondary-text-color); }
.helpdlg .hsecname { margin-left: 6px; font-weight: 400; }
.helpdlg .hkeys { display: grid; gap: 4px; margin-top: 6px; }
.helpdlg .hk { display: flex; align-items: baseline; gap: 8px; }
.helpdlg kbd { flex: none; font: 12px/1.2 ui-monospace, monospace; padding: 2px 6px; border-radius: 5px; border: 1px solid var(--divider-color, rgba(127,127,127,.5)); background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color); }
.helpdlg .hsw { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 13px; }
.helpdlg .hsw span { display: inline-flex; align-items: center; gap: 5px; }
.helpdlg .hsw i { width: 14px; height: 14px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.4); }
.helpdlg a { color: var(--primary-color, #03a9f4); }
.helpdlg .hmore { font-size: 13px; white-space: nowrap; }
.helpdlg .hsecmore { display: block; padding: 4px 6px 12px; }
.helpdlg mark { background: #ffe082; color: #212121; border-radius: 3px; padding: 0 1px; }
.helpdlg .hnone { padding: 18px 6px; color: var(--secondary-text-color); }
.helpdlg table.htab { width: 100%; border-collapse: collapse; font-size: 13px; }
.helpdlg .htab th { text-align: left; font-weight: 500; color: var(--secondary-text-color); padding: 4px 6px; }
.helpdlg .htab td { padding: 6px; vertical-align: top; border-top: 1px solid var(--divider-color, rgba(127,127,127,.15)); }
.helpdlg .htab td small { display: block; color: var(--secondary-text-color); font-size: 12px; margin-top: 1px; }
.helpdlg .htab tr.grp td { padding-top: 12px; border-top: none; font-weight: 600; color: var(--secondary-text-color); text-transform: uppercase; font-size: 12px; letter-spacing: .04em; }
.helpdlg .htab.touch td.fin { font-weight: 600; }
.helpdlg .hfoot { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 16px calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--divider-color, rgba(127,127,127,.2)); }
.helpdlg .hfoot button { min-height: 40px; padding: 0 14px; font: inherit; border-radius: 8px; border: 1px solid var(--divider-color, rgba(127,127,127,.4)); background: none; color: inherit; cursor: pointer; }
.helpdlg .hfoot a { font-size: 14px; }
`;

const FALLBACK_ICON = "mdi:information-outline";

/** Tastenzeilen eines Eintrags. */
const keysHtml = (keys, hi) => (keys?.length ? `<div class="hkeys">${keys.map(([k, what]) => `<div class="hk"><kbd>${hi(k)}</kbd><span>${hi(what)}</span></div>`).join("")}</div>` : "");

/** Farbfelder eines Eintrags. */
const swatchHtml = (sw) => (sw?.length ? `<div class="hsw">${sw.map(([c, n]) => `<span><i style="background:${esc(c)}"></i>${esc(n)}</span>`).join("")}</div>` : "");

export const HelpMethods = {
  /** Hilfe öffnen: im Panel (ohne Angabe) oder passend zum geöffneten Editor ({ editor }). */
  async _openHelp({ editor } = {}) {
    if (this._helpOpening) return;
    this._helpOpening = true;
    let data;
    try {
      data = await loadData();
    } catch (err) {
      this._toast?.(`Hilfe laden fehlgeschlagen: ${err?.message ?? err}`);
      return;
    } finally {
      this._helpOpening = false;
    }
    if (!this.isConnected) return;
    const ed = editor && editor === this._editor ? editor : null; // der Editor kann inzwischen zu sein
    const demo = !!(this._isDemo?.() ?? this._house?.demo);
    const touch = coarse();
    const opener = this.shadowRoot.activeElement;
    this._closePopup?.();
    this._closeDialog();
    ensureStyle(this.shadowRoot, "help", HELP_STYLE);

    const sections = data.helpSections({ coarse: touch, demo });
    const ctxKey = data.helpContext({ editor: !!ed, tool: ed?.tool, roofMode: ed?.roofMode });
    let ctxSection = null;
    let ctxItem = null;
    for (const s of sections) {
      const it = s.items.find((x) => x.id === ctxKey);
      if (it) [ctxSection, ctxItem] = [s, it];
    }
    const open = new Set([ctxSection?.id ?? (ed ? "werkzeuge" : "gesten")]);
    const footLink = ctxItem?.link ?? ctxSection?.link ?? (ed ? data.EDITOR_ANCHOR : data.DEFAULT_ANCHOR);

    const el = document.createElement("div");
    el.className = "dialog-backdrop sheet-backdrop";
    el.innerHTML = `<div class="dialog sheet helpdlg" role="dialog" aria-modal="true" aria-label="Hilfe">
      <div class="dialog-head"><span>Hilfe</span><button class="icon close" title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="hhead">
        ${ctxItem ? `<div class="hctx"><ha-icon icon="${esc(ctxItem.icon ?? FALLBACK_ICON)}"></ha-icon><span>Aktives Werkzeug: <b>${esc(ctxItem.title)}</b></span></div>` : ""}
        <input class="hsearch" type="search" placeholder="Suchen, z. B. Wand, Etage, Strg+Z" aria-label="Hilfe durchsuchen" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
        <div class="hchips">${sections.map((s) => `<button data-chip="${esc(s.id)}">${esc(s.title)}</button>`).join("")}</div>
        ${demo ? `<p class="hdemo">Demo-Haus: Werte sind simuliert, nichts wird geschaltet.</p>` : ""}
      </div>
      <div class="dialog-body hbody"></div>
      <div class="hfoot"><button data-act="tour">Einführung starten</button><a class="hbook" href="${esc(data.readmeHref(footLink))}" target="_blank" rel="noopener noreferrer">Ausführliche Anleitung ↗</a></div>
    </div>`;
    const body = el.querySelector(".hbody");
    const search = el.querySelector(".hsearch");
    touchScroll(body);

    const more = (link, cls = "hmore") => (link ? `<a class="${cls}" href="${esc(data.readmeHref(link))}" target="_blank" rel="noopener noreferrer">Mehr ↗</a>` : "");
    const itemHtml = (it, sec, words) => {
      const hi = (t) => (words ? data.markHtml(t, words) : esc(t));
      const gestures = it.mouse || it.touch ? `<p class="hin">Maus: ${hi(it.mouse ?? "–")} · Finger: ${hi(it.touch ?? "–")}</p>` : "";
      // „Mehr ↗“ steht hinter dem Text; in der Liste nur, wenn der Eintrag anderswo hinführt als sein Abschnitt
      const link = more(words ? (it.link ?? sec.link) : it.link !== sec.link ? it.link : null);
      return `<div class="hitem${it.id === ctxKey && !words ? " hl" : ""}" data-id="${esc(it.id)}"><ha-icon icon="${esc(it.icon ?? sec.icon ?? FALLBACK_ICON)}"></ha-icon><div class="hmain">
        <b>${hi(it.title)}</b>${words ? `<span class="hsecname">${esc(sec.title)}</span>` : ""}
        <p>${hi(it.text)}${link ? ` ${link}` : ""}</p>${gestures}${keysHtml(it.keys, hi)}${swatchHtml(it.swatches)}
      </div></div>`;
    };
    const tableHtml = (sec) => {
      let group = null;
      const rows = sec.items.map((it) => {
        const head = it.group && it.group !== group ? `<tr class="grp"><td colspan="3">${esc(it.group)}</td></tr>` : "";
        group = it.group ?? group;
        return `${head}<tr data-id="${esc(it.id)}"><td><b>${esc(it.title)}</b><small>${esc(it.text)}</small></td><td>${esc(it.mouse ?? "–")}</td><td class="fin">${esc(it.touch ?? "–")}</td></tr>`;
      });
      return `<table class="htab${touch ? " touch" : ""}"><thead><tr><th>Aktion</th><th>Maus</th><th>Finger</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    };
    const sectionHtml = (sec) => `<details class="hsec" data-sec="${esc(sec.id)}"${open.has(sec.id) ? " open" : ""}>
      <summary><ha-icon icon="${esc(sec.icon)}"></ha-icon><span>${esc(sec.title)}</span><span class="hn">${sec.items.length}</span></summary>
      ${sec.table ? tableHtml(sec) : sec.items.map((it) => itemHtml(it, sec, null)).join("")}
      ${more(sec.link, "hmore hsecmore")}
    </details>`;

    const renderAll = () => {
      body.innerHTML = sections.map(sectionHtml).join("");
    };
    const renderFound = (q) => {
      const words = data.searchWords(q);
      const hits = data.searchHelp(q, sections);
      body.innerHTML = hits.length ? hits.map((h) => itemHtml(h.item, h.section, words)).join("") : `<p class="hnone">Nichts gefunden. Andere Wörter versuchen, z. B. „Wand“, „Etage“ oder „Strg“.</p>`;
    };
    const update = () => {
      if (search.value.trim()) renderFound(search.value);
      else renderAll();
    };
    const reveal = () => {
      const hl = body.querySelector(".hl");
      if (hl) hl.scrollIntoView?.({ block: "center" });
    };

    const close = () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      el.remove();
      if (this._dialog === el) this._dialog = null;
      if (opener?.isConnected && !coarse()) opener.focus?.();
    };
    const focusables = () => [...el.querySelectorAll("input, button, a[href], summary")].filter((n) => n.getClientRects().length);
    // Tasten gehören der Hilfe: nichts davon erreicht den Editor dahinter (Entf löscht dort sonst die Auswahl)
    const onKey = (ev) => {
      if (!el.isConnected || !this.isConnected) {
        window.removeEventListener("keydown", onKey, true);
        return;
      }
      ev.stopPropagation();
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (search.value) {
          search.value = "";
          update();
        } else close();
      } else if (ev.key === "F1" || (ev.key === "?" && ev.composedPath?.()[0] !== search)) {
        ev.preventDefault();
        close();
      } else if (ev.key === "Tab") {
        const list = focusables();
        const at = list.indexOf(this.shadowRoot.activeElement);
        if (list.length && (ev.shiftKey ? at <= 0 : at === list.length - 1)) {
          ev.preventDefault();
          list[ev.shiftKey ? list.length - 1 : 0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);

    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });
    el.querySelector(".close").addEventListener("click", close);
    el.addEventListener("click", (ev) => {
      if (ev.target === el) close();
    });
    body.addEventListener("toggle", (ev) => {
      const id = ev.target?.dataset?.sec;
      if (!id) return;
      if (ev.target.open) open.add(id);
      else open.delete(id);
    }, true);
    el.querySelector(".hchips").addEventListener("click", (ev) => {
      const id = ev.target.closest("[data-chip]")?.dataset.chip;
      if (!id) return;
      clearTimeout(timer);
      search.value = "";
      open.add(id);
      renderAll();
      body.querySelector(`[data-sec="${id}"]`)?.scrollIntoView?.({ block: "start" });
    });
    el.querySelector('[data-act="tour"]').addEventListener("click", () => {
      close();
      this._tourStart(ed ? "editor" : demo ? "demo" : "panel", ed ?? undefined);
    });

    renderAll();
    this._els.stage.appendChild(el);
    this._dialog = el;
    reveal();
    if (!touch) search.focus();
  },

  /** Tasten ? und F1 vorbereiten (einmal je Panel). */
  _helpInit() {
    if (this._helpKeys) return;
    this._helpKeys = (ev) => {
      if (!this.isConnected || (ev.key !== "?" && ev.key !== "F1") || ev.ctrlKey || ev.altKey || ev.metaKey) return;
      const t = ev.composedPath?.()[0] ?? ev.target;
      if (t?.closest?.("input, select, textarea") || t?.isContentEditable) return;
      if (this._tourRun || this._confirmEl || this._dialog || this._helpOpening || this.shadowRoot.querySelector(".pinpad")) return;
      ev.preventDefault();
      this._openHelp({ editor: this._editor ?? undefined });
    };
    window.addEventListener("keydown", this._helpKeys);
  },
};
