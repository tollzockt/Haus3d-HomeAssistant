// Alles zurücksetzen (Mixin für Haus3DPanel): Admin → Daten & Verlauf. Zweistufige Nachfrage mit Eintippen, vorher Sicherung
// (Download plus Eintrag „vor Zurücksetzen“ im Verlauf), danach öffnet das leere Haus die Grundeinstellungen im Editor.
// Der reine Teil (Wort, Dateiname, Sperrgründe, Entwurfsschlüssel) lässt sich ohne Browser prüfen.

import { ensureStyle, esc } from "./panel-util.js";

/** Wort, das zum Bestätigen eingetippt wird. */
export const RESET_WORD = "ZURÜCKSETZEN";

/**
 * Stimmt die Eingabe? Leerzeichen am Rand, Groß-/Kleinschreibung und die Schreibung „UE“ für „Ü“ sind egal.
 * @param {unknown} text
 */
export function resetConfirmOk(text) {
  const t = String(text ?? "").normalize("NFC").trim().toUpperCase().replace(/UE/g, "Ü");
  return t === RESET_WORD;
}

/** Dateiname der Sicherung vor dem Zurücksetzen: haus3d-sicherung-2026-10-15-0830.json (Ortszeit). */
export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `haus3d-sicherung-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

/**
 * Schlüssel des ungespeicherten Editor-Entwurfs: eigener je weiterem Haus, sonst der des echten Hauses (wie im Editor).
 * Ein Demo-Haus hat einen eigenen Entwurf (Suffix .demo): er trägt die eingesetzten Demo-Geräte und gehört nie zum Testhaus.
 */
export function draftKeyOf(houseId, demo = false) {
  return houseId ? `haus3d.editorDraft.${houseId}${demo ? ".demo" : ""}` : "haus3d.editorDraft";
}

/**
 * Warum Zurücksetzen gerade gesperrt ist: Text (als Hinweis unter dem Knopf), "" (gesperrt ohne Text, z. B. während
 * eines Hauswechsels) oder null (möglich). Die Simulation geht vor.
 * @param {{ sim?: boolean, demo?: boolean, editor?: boolean, switching?: boolean }} state
 * @returns {string | null}
 */
export function resetBlocked({ sim = false, demo = false, editor = false, switching = false } = {}) {
  if (sim) return "In der Simulation nicht möglich.";
  if (demo) return "Im Demo-Haus nicht möglich – das Demo-Haus in der Hausauswahl löschen.";
  if (editor) return "Erst den Editor schließen.";
  if (switching) return "";
  return null;
}

const RESET_STYLE = `
.resetdlg { width: min(420px, 100%); max-height: 100%; overflow: auto; }
.resetdlg .ct { display: flex; align-items: center; gap: 8px; }
.resetdlg .ct ha-icon { color: #d32f2f; flex: none; }
.resetdlg .cs { margin-top: 10px; font-size: 14px; line-height: 1.4; color: var(--primary-text-color); }
.resetdlg .cs b { font-weight: 600; }
.resetdlg .cs.dim { color: var(--secondary-text-color); font-size: 13px; }
.resetdlg label.word { display: block; margin-top: 14px; font-size: 14px; }
.resetdlg label.word code { font: inherit; font-weight: 700; letter-spacing: .04em; }
.resetdlg input.word { width: 100%; box-sizing: border-box; margin-top: 8px; min-height: 48px; padding: 0 12px; font: inherit; font-size: 17px; letter-spacing: .06em; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127,127,127,.5)); background: var(--primary-background-color, #fff); color: inherit; }
.resetdlg input.word:focus { outline: 2px solid #d32f2f; outline-offset: 1px; }
.resetdlg .cb .yes[disabled] { opacity: .4; cursor: not-allowed; }
.resetdlg .busy { margin-top: 12px; font-size: 14px; color: var(--secondary-text-color); }
`;

export const ResetMethods = {
  /** Zweistufige Nachfrage, Sicherung, Zurücksetzen (aus Admin → Daten & Verlauf). */
  async _resetDialog() {
    const why = resetBlocked({ sim: !!this._sim, demo: !!(this._isDemo?.() ?? this._house?.demo), editor: !!this._editor, switching: !!this._switching });
    if (why !== null) {
      if (why) this._toast(why);
      return;
    }
    this._resetEl?._finish?.();
    ensureStyle(this.shadowRoot, "reset", RESET_STYLE);
    const testhaus = !!this._house; // weiteres Haus: kein Verlauf, gesichert wird nur per Download
    const epoch = this._houseEpoch ?? 0;
    const el = document.createElement("div");
    el.className = "confirm-backdrop";
    let step = 1;
    let busy = false;
    const input = () => el.querySelector("input.word");
    const finish = () => {
      document.removeEventListener("keydown", onKey, true);
      el.remove();
      if (this._resetEl === el) this._resetEl = null;
    };
    el._finish = finish;
    const render = () => {
      if (step === 1) {
        el.innerHTML = `<div class="confirm resetdlg" role="alertdialog" aria-modal="true" aria-label="Alles zurücksetzen?">
          <div class="ct"><ha-icon icon="mdi:restore-alert"></ha-icon><span>Alles zurücksetzen?</span></div>
          <div class="cs">Gelöscht werden alle Etagen mit Räumen, Wänden, Möbeln, Geräten, Leitungen, Dächern und Garten sowie Name, Norden, Energie, Karten, Hinweise, Kurzwahl, Funktionsrad, Abläufe und Alltag.</div>
          <div class="cs"><b>Bleibt erhalten:</b> PINs, eigene 3D-Modelle, Bauplan-Fotos, Testhäuser und die Einstellungen dieses Geräts.</div>
          <div class="cs dim">${testhaus ? "Testhaus: kein Verlauf – gesichert wird nur per Download." : `<b>Vorher wird gesichert:</b> Download „haus3d-sicherung-…json“ und ein Eintrag „vor Zurücksetzen“ im Verlauf.`}</div>
          <div class="cb"><button class="no">Abbrechen</button><button class="yes danger">Weiter</button></div></div>`;
        el.querySelector(".no").addEventListener("click", finish);
        el.querySelector(".yes").addEventListener("click", () => {
          step = 2;
          render();
        });
        el.querySelector(".no").focus();
      } else {
        el.innerHTML = `<div class="confirm resetdlg" role="alertdialog" aria-modal="true" aria-label="Wirklich alles zurücksetzen?">
          <div class="ct"><ha-icon icon="mdi:restore-alert"></ha-icon><span>Wirklich alles zurücksetzen?</span></div>
          <label class="word" for="reset-word">Zum Bestätigen <code>${esc(RESET_WORD)}</code> eintippen</label>
          <input class="word" id="reset-word" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done">
          <div class="busy" hidden></div>
          <div class="cb"><button class="no">Abbrechen</button><button class="yes danger" disabled>Jetzt zurücksetzen</button></div></div>`;
        const yes = el.querySelector(".yes");
        input().addEventListener("input", () => {
          yes.disabled = busy || !resetConfirmOk(input().value);
        });
        input().addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" && !yes.disabled) {
            ev.preventDefault();
            go();
          }
        });
        el.querySelector(".no").addEventListener("click", () => !busy && finish());
        yes.addEventListener("click", () => !yes.disabled && go());
        input().focus();
      }
    };
    const say = (text) => {
      const b = el.querySelector(".busy");
      if (b) {
        b.hidden = false;
        b.textContent = text;
      }
    };
    const go = async () => {
      if (busy || !resetConfirmOk(input()?.value)) return;
      busy = true;
      el.querySelector(".yes").disabled = true;
      input().disabled = true;
      el.querySelector(".no").disabled = true;
      say("Wird gesichert …");
      try {
        this._export(backupFileName(new Date())); // Download des Gebäudes, bevor etwas gelöscht wird
        await new Promise((r) => setTimeout(r, 250)); // dem Browser Zeit lassen, den Download zu beginnen
      } catch {
        finish();
        this._toast("Sicherung fehlgeschlagen – nichts zurückgesetzt.");
        return;
      }
      say("Wird zurückgesetzt …");
      let res;
      try {
        res = await this._callLocked({ type: "haus3d/building/reset", revision: this._revision }, "admin");
      } catch (err) {
        finish();
        this._toast(err?.code === "conflict" ? "Inzwischen woanders geändert – nichts zurückgesetzt. Seite neu laden." : `Zurücksetzen fehlgeschlagen: ${err?.message ?? err?.code ?? err}`);
        return;
      }
      if ((this._houseEpoch ?? 0) !== epoch) {
        finish();
        return;
      }
      try {
        localStorage.removeItem(draftKeyOf(this._house?.id ?? null)); // ein alter Entwurf gehört zum Haus von vorher
      } catch {
        /* ohne Speicher */
      }
      finish();
      this._adminOpen = false;
      this._adminShow = null;
      this._closeDialog();
      this._selectRoom(null);
      this._setBuilding(res.building, res.revision);
      await this._openEditor(); // das leere Haus öffnet die Grundeinstellungen von selbst
      this._toast(testhaus ? "Zurückgesetzt. Sicherung als Download." : "Zurückgesetzt. Sicherung: Download und Verlauf („vor Zurücksetzen“).");
      if (this._toastEl) this._toastEl.style.zIndex = "20"; // über dem Editor (z-index 8), der gerade aufging
    };
    // Esc, Abbrechen und Klick daneben: nichts passiert (nicht während des Zurücksetzens)
    const onKey = (ev) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      if (!busy) finish();
    };
    document.addEventListener("keydown", onKey, true);
    // wie bei _confirm: der Klick, der zum Antippen gehört, kommt erst nach pointerup an – kurz nichts annehmen
    const born = performance.now();
    el.addEventListener("click", (ev) => {
      if (ev.target === el && !busy && performance.now() - born > 400) finish();
    });
    render();
    (this._els?.stage ?? this.shadowRoot).appendChild(el);
    this._resetEl = el;
    el.querySelector(step === 1 ? ".no" : "input")?.focus();
  },
};
