// Zusatzfelder in den Möbel-Eigenschaften für den Katalog „Steckdosen & Schalter, Heizungsraum, Server & NAS“ (eingebunden über
// editor-more.js): Schrank bestücken (Schrank: Kopf mit Belegung und Leistung, HE-Leiste, Liste der passenden Teile, Lücken schließen,
// Vorlagen, Tür offen; Gerät: Im Schrank, Höheneinheit, HE-Leiste, ▲/▼, Ausbauen bzw. In Schrank einbauen) und Erweiterungsakkus unter
// dem Balkonspeicher. Attribute im HTML mit eigenem Präfix data-tech-… bzw. data-rack-…, damit sie sich nicht mit anderen Feldern
// überschneiden. Die Rechnung steht in rack.js und rack-plan.js, die Leiste in rack-strip.js, das Nachführen in follow-rack.js.

import { PACK_STACK, packCount, packHeight } from "./catalog-extra.js";
import { fmtPower } from "./panel-util.js";
import { cabinetInfo, findSlot, fitsCabinet, heOf, isCabinet, isRackable } from "./rack.js";
import { rackPower } from "./rack-live.js";
import { RACK_TEMPLATES, gapFill, stepTarget, templateCheck, templateStats, unrackItem } from "./rack-plan.js";
import { RACK_HINT, bindRackStrip, buildRackItems, freshCabinet, nameOf, rackListHtml, rackStripHtml, span } from "./rack-strip.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Schränke der Etage mit Anzeigenamen (gleiche Namen werden nummeriert). */
function cabinetsOf(floor) {
  const list = (floor?.furniture ?? []).filter(isCabinet);
  const total = new Map();
  for (const c of list) total.set(nameOf(c), (total.get(nameOf(c)) ?? 0) + 1);
  const seen = new Map();
  return list.map((cab) => {
    const base = nameOf(cab);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { cab, name: total.get(base) > 1 ? `${base} ${n}` : base };
  });
}

const count = (n) => (n === 1 ? "1 Gerät" : `${n} Geräte`);

/** Auswahl der Vorlagen: nicht passende sind gesperrt, mit Grund. */
function templatesHtml(m, ed) {
  const floor = ed.floor;
  if ((floor?.furniture ?? []).some((d) => d.in_rack === m.id)) {
    return `<label>Vorlage</label><select data-rack-tpl disabled><option>–</option></select><div class="btns left"><button data-rack-tpl-go disabled>Bestücken</button></div>
      <p class="muted">Vorlagen gehen nur in einen leeren Schrank – erst alle Geräte ausbauen.</p>`;
  }
  const rows = Object.keys(RACK_TEMPLATES).map((key) => {
    const { count: n, he } = templateStats(key);
    const why = templateCheck(floor, m, key).error;
    return { key, why, text: `${RACK_TEMPLATES[key].name} (${n} Teile, ${he} HE)${why ? ` (${why})` : ""}` };
  });
  const pick = rows.find((r) => r.key === ed._rackTpl && !r.why) ?? rows.find((r) => !r.why);
  return `<label>Vorlage</label><select data-rack-tpl>${rows.map((r) => `<option value="${r.key}"${r.why ? " disabled" : r === pick ? " selected" : ""}>${esc(r.text)}</option>`).join("")}</select>
    <div class="btns left"><button data-rack-tpl-go${pick ? "" : " disabled"}>Bestücken</button></div>
    <p class="muted">Nur für einen leeren Schrank. Strg+Z macht das Bestücken in einem Schritt rückgängig.</p>`;
}

function cabinetHtml(m, ed) {
  const floor = ed.floor;
  const info = cabinetInfo(floor, m);
  const power = rackPower(floor, m, ed.hass).w;
  const head = `<label>Bestückung</label><p class="muted" data-tech-used>Belegt: ${info.used} von ${info.units} HE · ${count(info.devices.length)}${power !== null ? ` · Leistung jetzt ${fmtPower(power)}` : ""}</p>`;
  const empty = info.devices.length ? "" : `<p class="muted">Leer – freie HE antippen oder ein Gerät aus „Server &amp; NAS“ hineinziehen: es zieht in die unterste freie Lücke ein.</p>`;
  const fill = gapFill(floor, m).length > 0;
  return `${head}${empty}${rackStripHtml(ed, m)}${rackListHtml(ed, m)}${RACK_HINT}
    <div class="btns left"><button data-rack-fill title="Freie HE mit Blindblenden füllen (2 HE, Rest 1 HE)"${fill ? "" : " disabled"}>Lücken schließen</button></div>
    ${templatesHtml(m, ed)}
    <label class="chk"><input type="checkbox" data-tech-door${m.open === true ? " checked" : ""}> Tür offen</label>
    <p class="muted">Offen ist die Front direkt sichtbar – im Editor-3D und im Panel.</p>`;
}

function deviceHtml(m, ed) {
  const floor = ed.floor;
  const cab = m.in_rack ? (floor?.furniture ?? []).find((c) => c.id === m.in_rack && isCabinet(c)) : null;
  if (cab) {
    const info = cabinetInfo(floor, cab);
    const he = heOf(m);
    const u = Math.max(1, Math.round(Number(m.rack_u)) || 1);
    const name = cabinetsOf(floor).find((x) => x.cab.id === cab.id)?.name ?? nameOf(cab);
    const can = (dir) => stepTarget(floor, cab, m.id, dir) !== null; // am Rand oder ohne Bewegung gesperrt
    return `<label>Im Schrank</label><p class="muted" data-tech-where>Im Schrank: ${esc(name)} · ${span(u, he)}</p>
      <div class="row2"><div><label>Höheneinheit (unten)</label><input type="number" min="1" max="${Math.max(1, info.units - he + 1)}" step="1" inputmode="numeric" data-tech-u value="${u}"></div><div></div></div>
      ${rackStripHtml(ed, cab, { focusId: m.id })}${RACK_HINT}
      <div class="btns"><button data-rack-up${can(1) ? "" : " disabled"}>▲ hoch</button><button data-rack-down${can(-1) ? "" : " disabled"}>▼ runter</button></div>
      <div class="btns"><button data-tech-out>Ausbauen</button><button data-rack-cab>Zum Schrank</button></div>`;
  }
  const cabs = cabinetsOf(floor);
  if (!cabs.length) return `<label>In Schrank einbauen</label><p class="muted">Auf dieser Etage steht kein Netzwerk- oder Serverschrank.</p>`;
  const he = heOf(m);
  const options = cabs.map(({ cab: c, name }) => {
    const info = cabinetInfo(floor, c);
    const why = fitsCabinet(c, m) || (findSlot(info.occ, info.units, he) === null ? "voll" : "");
    return `<option value="${esc(c.id)}"${why ? " disabled" : ""}>${esc(name)} · ${info.free} von ${info.units} HE frei${why ? ` (${why})` : ""}</option>`;
  });
  return `<label>In Schrank einbauen</label><select data-tech-in><option value="">frei stehend</option>${options.join("")}</select>
    <p class="muted">Belegt ${he} HE. Ein Gerät, das in einen Schrank gezogen wird, zieht von selbst ein.</p>`;
}

function packsHtml(m) {
  return `<label>Erweiterungsakkus darunter</label><input type="number" min="0" max="${PACK_STACK.max}" step="1" inputmode="numeric" data-tech-packs value="${packCount(m)}">
    <p class="muted">Gestapelt unter dem Speicher, die Höhe folgt der Anzahl. Die Kapazität in den Energie-Einstellungen (Speicher) entsprechend erhöhen: ein Erweiterungsakku bringt 1,6 bzw. 2,7 kWh mit.</p>`;
}

export const TECH_FIELDS = {
  /** HTML für das gewählte Möbelstück m ("" = nichts Eigenes); ed ist der Editor (hass, floor …). */
  html(m, ed) {
    if (isCabinet(m)) return cabinetHtml(m, ed);
    if (isRackable(m)) return deviceHtml(m, ed);
    if (m.type === PACK_STACK.type) return packsHtml(m);
    return "";
  },
  /** Ereignisse binden; edit(fn) ändert das Möbelstück der Etage (fn bekommt es als Argument). */
  bind(el, m, ed, edit) {
    const again = () => ed.renderProps();
    // Schrank oder eingebautes Gerät: HE-Leiste, Liste, ▲/▼, Zum Schrank (rack-strip.js)
    const cabId = isCabinet(m) ? m.id : m.in_rack;
    const cab = cabId ? freshCabinet(ed, cabId) : null;
    if (cab) bindRackStrip(el, ed, cab, { focusId: isCabinet(m) ? null : m.id });
    // Gerät: Höheneinheit ändern (Konflikte löst follow-rack.js), ausbauen, einbauen
    el.querySelector("[data-tech-u]")?.addEventListener("change", (ev) => {
      const v = Number(ev.target.value);
      if (Number.isFinite(v)) edit((x) => (x.rack_u = Math.round(v)));
      again();
    });
    el.querySelector("[data-tech-out]")?.addEventListener("click", () => {
      const c = freshCabinet(ed, m.in_rack);
      edit((x) => {
        unrackItem(x, c);
      });
      again();
    });
    el.querySelector("[data-tech-in]")?.addEventListener("change", (ev) => {
      const id = ev.target.value;
      if (id) {
        edit((x) => {
          x.in_rack = id;
          delete x.rack_u;
        });
      }
      again();
    });
    // Schrank: Lücken mit Blenden schließen, Vorlage einbauen, Tür
    el.querySelector("[data-rack-fill]")?.addEventListener("click", () => {
      const c = freshCabinet(ed, m.id);
      const plan = c ? gapFill(ed.floor, c) : [];
      if (!plan.length) return again();
      buildRackItems(ed, c, plan);
      ed._toast?.(plan.length === 1 ? "1 Blindblende eingesetzt." : `${plan.length} Blindblenden eingesetzt.`);
      again();
    });
    el.querySelector("[data-rack-tpl]")?.addEventListener("change", (ev) => {
      ed._rackTpl = ev.target.value;
    });
    el.querySelector("[data-rack-tpl-go]")?.addEventListener("click", () => {
      const key = el.querySelector("[data-rack-tpl]")?.value;
      const c = freshCabinet(ed, m.id);
      const plan = c && RACK_TEMPLATES[key] ? templateCheck(ed.floor, c, key) : { error: "unbekannt" };
      if (!plan.items) {
        ed._toast?.(plan.error === "nicht leer" ? "Vorlagen gehen nur in einen leeren Schrank – erst alle Geräte ausbauen." : `Die Vorlage passt nicht in diesen Schrank (${plan.error}).`);
        return again();
      }
      buildRackItems(ed, c, plan.items);
      ed._toast?.(`Vorlage „${RACK_TEMPLATES[key].name}“: ${count(plan.items.length)} eingebaut.`);
      again();
    });
    el.querySelector("[data-tech-door]")?.addEventListener("change", (ev) => {
      edit((x) => {
        if (ev.target.checked) x.open = true;
        else delete x.open;
      });
      again();
    });
    // Balkonspeicher: Erweiterungsakkus darunter, die Höhe folgt der Anzahl
    el.querySelector("[data-tech-packs]")?.addEventListener("change", (ev) => {
      const n = Math.min(PACK_STACK.max, Math.max(0, Math.round(Number(ev.target.value)) || 0));
      edit((x) => {
        if (n) x.packs = n;
        else delete x.packs;
        x.h = packHeight(n);
      });
      again();
    });
  },
};
