// Zusatzfelder in den Möbel-Eigenschaften für den Katalog „Steckdosen & Schalter, Heizungsraum, Server & NAS“ (eingebunden über
// editor-more.js): Einbau in Schränke (Gerät: Im Schrank, Höheneinheit, Ausbauen bzw. In Schrank einbauen; Schrank: Belegung und
// Liste der Geräte) und Erweiterungsakkus unter dem Balkonspeicher. Attribute im HTML mit eigenem Präfix data-tech-…, damit sie sich
// nicht mit anderen Feldern überschneiden. Die Rechnung steht in rack.js, das Nachführen in follow-rack.js.

import { PACK_STACK, packCount, packHeight } from "./catalog-extra.js";
import { FURNITURE } from "./furniture.js";
import { cabinetInfo, findSlot, fitsCabinet, heOf, isCabinet, isRackable, unrackPose } from "./rack.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nameOf = (m) => m.name || FURNITURE[m.type]?.[0] || m.type;

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

/** Bereich "HE 3" bzw. "HE 3–4". */
const span = (u, he) => (he > 1 ? `HE ${u}–${u + he - 1}` : `HE ${u}`);

function cabinetHtml(m, floor) {
  const info = cabinetInfo(floor, m);
  const rows = info.devices.length
    ? `<div class="list">${info.devices.map((d) => `<button data-tech-pick="${esc(d.id)}">${span(d.u, d.he)} · ${esc(nameOf(d.item))}</button>`).join("")}</div>`
    : `<p class="muted">Leer – ein Gerät aus „Server &amp; NAS“ hineinsetzen oder hineinziehen, es zieht in die unterste freie Lücke ein.</p>`;
  return `<label>Einbau</label><p class="muted" data-tech-used>Belegt: ${info.used} von ${info.units} HE</p>${rows}`;
}

function deviceHtml(m, floor) {
  const cab = m.in_rack ? (floor?.furniture ?? []).find((c) => c.id === m.in_rack && isCabinet(c)) : null;
  if (cab) {
    const info = cabinetInfo(floor, cab);
    const he = heOf(m);
    const u = Math.max(1, Math.round(Number(m.rack_u)) || 1);
    const name = cabinetsOf(floor).find((x) => x.cab.id === cab.id)?.name ?? nameOf(cab);
    return `<label>Im Schrank</label><p class="muted" data-tech-where>Im Schrank: ${esc(name)} · ${span(u, he)}</p>
      <div class="row2"><div><label>Höheneinheit (unten)</label><input type="number" min="1" max="${Math.max(1, info.units - he + 1)}" step="1" inputmode="numeric" data-tech-u value="${u}"></div><div></div></div>
      <div class="btns"><button data-tech-out>Ausbauen</button></div>`;
  }
  const cabs = cabinetsOf(floor);
  if (!cabs.length) return `<label>In Schrank einbauen</label><p class="muted">Auf dieser Etage steht kein Netzwerk- oder Serverschrank.</p>`;
  const he = heOf(m);
  const options = cabs.map(({ cab, name }) => {
    const info = cabinetInfo(floor, cab);
    const why = fitsCabinet(cab, m) || (findSlot(info.occ, info.units, he) === null ? "voll" : "");
    return `<option value="${esc(cab.id)}"${why ? " disabled" : ""}>${esc(name)} · ${info.free} von ${info.units} HE frei${why ? ` (${why})` : ""}</option>`;
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
    if (isCabinet(m)) return cabinetHtml(m, ed.floor);
    if (isRackable(m)) return deviceHtml(m, ed.floor);
    if (m.type === PACK_STACK.type) return packsHtml(m);
    return "";
  },
  /** Ereignisse binden; edit(fn) ändert das Möbelstück der Etage (fn bekommt es als Argument). */
  bind(el, m, ed, edit) {
    const again = () => ed.renderProps();
    // Schrank: eingebautes Gerät aus der Liste wählen
    el.querySelectorAll("[data-tech-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        ed.sel = { kind: "furniture", id: b.dataset.techPick };
        ed.render();
        ed.renderProps();
      }),
    );
    // Gerät: Höheneinheit ändern (Konflikte löst follow-rack.js), ausbauen, einbauen
    el.querySelector("[data-tech-u]")?.addEventListener("change", (ev) => {
      const v = Number(ev.target.value);
      if (Number.isFinite(v)) edit((x) => (x.rack_u = Math.round(v)));
      again();
    });
    el.querySelector("[data-tech-out]")?.addEventListener("click", () => {
      const cab = (ed.floor?.furniture ?? []).find((c) => c.id === m.in_rack && isCabinet(c));
      edit((x) => {
        if (cab) Object.assign(x, unrackPose(cab, x));
        delete x.in_rack;
        delete x.rack_u;
        delete x.mount_y;
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
