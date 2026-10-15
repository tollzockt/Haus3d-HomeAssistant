// Eigenschaften-Leiste für Möbel und eingerichtete Teile (Mixin für FloorEditor; ausgelagert aus renderProps).
// `ui` kommt von propsUi() in props-ui.js.

import { allIds, newId, retypeFurniture } from "./edit-ops.js";
import { FURNITURE, FURNITURE_CATEGORIES } from "./furniture.js";
import { noPose, setPoseKey } from "./pose.js";
import { isCubeShelf } from "./catalog-extra.js";
import { arrowAnchor } from "./arrows3d.js";
import { isCabinet } from "./rack.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const ItemPropsMethods = {
  _furnitureProps(el, sel, ui) {
    const f = this.floor;
    const { entityList, num, colorField, pad, bindPad, bindColors, bindNums, bindDelete } = ui;
    const m = (f.furniture ?? []).find((x) => x.id === sel.id);
    if (!m) return this._clearSel();
    const lamp = m.type.startsWith("lamp_") || m.type.startsWith("led_");
    const custom = m.type.startsWith("custom_");
    // eingebautes Gerät (in_rack): Lage, Drehung und Höhe kommen vom Schrank (follow-rack.js) – keine Felder, kein Steuerkreuz
    const racked = m.in_rack != null;
    el.innerHTML = `<h3>${esc(m.name || (FURNITURE[m.type]?.[0] ?? m.type))}</h3>
        <label>Typ</label><select data-m="type">${FURNITURE_CATEGORIES.map(([cat, types]) => `<optgroup label="${esc(cat)}">${types.map((k) => `<option value="${k}"${k === m.type ? " selected" : ""}>${esc(FURNITURE[k][0])}</option>`).join("")}</optgroup>`).join("")}</select>
        <label>Name ${custom ? "" : "(optional)"}</label><input data-m="name" value="${esc(m.name ?? "")}" placeholder="${esc(FURNITURE[m.type]?.[0] ?? "")}">
        <div class="row3">${num("w", custom && m.type === "custom_cylinder" ? "Ø Breite" : "Breite", m.w)}${num("d", custom && m.type === "custom_cylinder" ? "Ø Tiefe" : "Tiefe", m.d)}${num("h", ["column", "pillar"].includes(m.type) ? "Höhe (0 = Decke)" : "Höhe", m.h)}</div>
        ${racked ? "" : `<div class="row2">${num("rotation", "Drehung (°)", m.rotation, 15)}${num("mount_y", "Höhe über Boden", m.mount_y ?? "", 0.05)}</div>`}
        ${noPose(m) ? "" : `<div class="row2" title="Neigung + = Oberseite nach hinten, Kippen + = nach rechts (von vorn gesehen); die tiefste Ecke bleibt auf der Höhe über Boden">${num("tilt", "Neigung (°)", m.tilt ?? 0, 15)}${num("roll", "Kippen (°)", m.roll ?? 0, 15)}</div>`}
        ${this._stairFields(m)}
        ${this._itemFields(m)}
        ${this._moreFields(m)}
        ${colorField("color", custom ? "Farbe" : "Farbe (statt Standard)", m.color)}
        ${racked ? "" : pad(true)}
        <label>${lamp ? "Licht (Entität)" : "Verknüpfte Entität (optional)"}</label><input data-m="entity" list="dl_furn" value="${esc(m.entity && m.entity !== "none" ? m.entity : "")}" placeholder="${lamp ? "light.…" : "z. B. media_player.…"}">${entityList("dl_furn", lamp ? ["light", "switch"] : ["light", "switch", "cover", "input_boolean", "binary_sensor", "media_player", "fan", "climate", "vacuum", "sensor"])}
        <p class="muted">${racked ? "Das Gerät sitzt im Schrank und folgt ihm: Lage, Drehung und Höhe kommen vom Schrank. Zum freien Stellen „Ausbauen“ oder aus dem Schrank ziehen." : `Ziehen verschiebt (Magnet: rastet an Wänden ein), der orange Punkt dreht (Umschalt = frei). Pfeiltasten schieben, R dreht. ${arrowAnchor(f, sel)?.axes.includes("y") ? "In 3D: Pfeile ziehen, grün = Höhe." : "In 3D: rote und blaue Pfeile verschieben."}`}</p>
        <div class="btns"><button data-act="dup">Duplizieren</button><button data-act="del" class="danger">Löschen</button></div>`;
    el.querySelector("[data-m=type]").addEventListener("change", (ev) => {
      this.change((fl) => {
        const x = fl.furniture.find((y) => y.id === m.id);
        retypeFurniture(x, ev.target.value, FURNITURE[ev.target.value]); // edit-ops.js: typfremde Felder fallen weg
      });
      this.renderProps(); // erst nach change(): vorher zeigt this.floor noch den alten Typ
    });
    el.querySelector("[data-m=entity]").addEventListener("change", (ev) =>
      this.change((fl) => {
        fl.furniture.find((y) => y.id === m.id).entity = ev.target.value.trim() || null;
      }),
    );
    el.querySelector("[data-m=name]").addEventListener("change", (ev) => {
      this.change((fl) => {
        const x = fl.furniture.find((y) => y.id === m.id);
        if (ev.target.value.trim()) x.name = ev.target.value.trim();
        else delete x.name;
      });
      this.renderProps();
    });
    bindColors((fl, key, v) => {
      const x = fl.furniture.find((y) => y.id === m.id);
      if (v) x.color = v;
      else delete x.color;
    });
    bindPad();
    this._bindStairFields(el, m);
    this._bindItemFields(el, m);
    this._bindMoreFields(el, m);
    bindNums((fl, k, v) => {
      const x = fl.furniture.find((y) => y.id === m.id);
      if (k === "tilt" || k === "roll") return setPoseKey(x, k, v);
      x[k] = k === "mount_y" ? v : v ?? 0;
      this._stairDims(x, k);
      if (["w", "d", "h"].includes(k)) {
        if (isCubeShelf(x.type)) {
          // Würfelregal: Breite/Höhe ergeben die Würfelzahl (0,35 m je Fach plus Rahmen), Tiefe ändert nichts
          const n = Math.max(1, Math.min(8, Math.round(((v ?? 0) - 0.07) / 0.35)));
          if (k === "w") x.cols = n;
          else if (k === "h") x.rows = n;
        } else {
          delete x.cols; // eigene Maße: Raster folgt wieder den Maßen
          delete x.rows;
        }
      }
    });
    el.querySelector("[data-act=dup]").addEventListener("click", () => {
      if (isCabinet(m)) {
        // Schrank samt Geräten daneben, ohne verknüpfte Entitäten – wie Strg+D (editor-plan.js); die Kopie bleibt gewählt
        const cab = this._duplicate()?.find((a) => a.kind === "furniture" && isCabinet(this.floor.furniture.find((x) => x.id === a.id)));
        if (cab) {
          this.multi = [];
          this.sel = { kind: "furniture", id: cab.id };
          this.render();
          this.renderProps();
        }
        return;
      }
      const copy = { ...structuredClone(m), id: newId("m", allIds(this.b)), x: r3(m.x + 0.3), z: r3(m.z + 0.3) };
      this.change((fl) => {
        fl.furniture.push(copy);
      });
      this.sel = { kind: "furniture", id: copy.id };
      this.renderProps();
    });
    bindDelete();
    return;
  },
};
