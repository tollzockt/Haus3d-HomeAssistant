// Beschriftungen der Dach-Ebene: Nordpfeil und Hinweistexte (z. B. „x von y Modulen passen“) so legen, dass sie
// sich nicht überdecken – und nichts, was im Plan angefasst wird (Dinge, Griffe, Maße). Reine Rechnung mit
// Rechtecken [x0, z0, x1, z1] in Metern; editor-roof.js und editor-roofparts.js liefern die Rechtecke und zeichnen.

/** Fläche der Schnittmenge zweier Rechtecke (0 = frei). */
export function overlapArea(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Umschließendes Rechteck mehrerer Punkte [x, z]. */
export function boxOf(points) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

/** Rechteck um einen Punkt (Griff, Kreis) mit Halbmesser r. */
export const around = ([x, z], r) => [x - r, z - r, x + r, z + r];

const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const grow = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];

/**
 * Rechteck eines SVG-Texts: x/z = Ankerpunkt auf der Grundlinie, size = Schrifthöhe (in Metern, also px(…)),
 * anchor "start" | "middle" | "end". Die Breite ist geschätzt (großzügig, fette Schrift etwas breiter).
 */
export function textRect(x, z, text, size, anchor = "middle", bold = false) {
  const w = [...String(text)].length * size * (bold ? 0.6 : 0.54);
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return [x0, z - size * 0.9, x0 + w, z + size * 0.3];
}

/** Nordpfeil mit Fußpunkt nc: Spitze, Beschriftung („N“ bzw. „N 40°“) und umschließendes Rechteck. north in Bogenmaß. */
export function compassAt(nc, north, px) {
  const nd = [Math.sin(north), -Math.cos(north)];
  const tip = [nc[0] + nd[0] * 0.9, nc[1] + nd[1] * 0.9];
  const label = [tip[0] + nd[0] * 0.4, tip[1] + nd[1] * 0.4 + px(4)];
  const deg = Math.round((north * 180) / Math.PI);
  const text = `N${deg ? ` ${deg}°` : ""}`;
  const arrow = grow(boxOf([nc, tip]), px(5));
  return { nc, tip, label, text, box: union(arrow, textRect(label[0], label[1], text, px(13), "middle", true)) };
}

/** Plätze für einen Hinweistext zu einem Feld (Rechteck): erst mittig darüber, dann darunter, dann bündig links/rechts. */
export function hintSpots(field, text, size, px) {
  const gap = px(6);
  const mid = (field[0] + field[2]) / 2;
  const rows = [field[1] - gap, field[3] + gap + size * 0.9]; // Grundlinie darüber / darunter
  const cols = [[mid, "middle"], [field[0], "start"], [field[2], "end"]];
  const out = [];
  for (const [x, anchor] of cols) for (const z of rows) out.push({ x, z, anchor, box: textRect(x, z, text, size, anchor) });
  return out;
}

/** Verschiebung, die ein Rechteck in den sichtbaren Ausschnitt view holt (links/oben haben Vorrang, wenn es nicht passt). */
export function keepIn(box, view, margin = 0) {
  const fit = (lo, hi, vlo, vhi) => (lo < vlo + margin ? vlo + margin - lo : hi > vhi - margin ? vhi - margin - hi : 0);
  return [fit(box[0], box[2], view[0], view[2]), fit(box[1], box[3], view[1], view[3])];
}

const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
// Überdeckung mit belegten Rechtecken plus der Teil außerhalb des sichtbaren Ausschnitts
const cost = (box, rects, view = null) => rects.reduce((s, r) => s + overlapArea(box, r), 0) + (view ? area(box) - overlapArea(box, view) : 0);

/**
 * Nordpfeil und Hinweise platzieren.
 *   bounds   Rechteck um alle Dachflächen (der Pfeil steht in einer Ecke, 0,3 m eingerückt; oben links bevorzugt)
 *   north    Norden im Plan (Bogenmaß)
 *   px       Bildschirmpixel → Meter
 *   blocked  Rechtecke, die frei bleiben sollen (Dinge, Griffe, Maße)
 *   view     sichtbarer Ausschnitt des Plans: der Nordpfeil rutscht hinein, Hinweise suchen sich Plätze darin
 *   hints    [{ id, field, text, size }] – Texte neben einem Feld
 * → { compass, hints: Map(id → {x, z, anchor, box}) }; ohne freien Platz gewinnt die Lage mit der kleinsten Überdeckung.
 */
export function placeMarks({ bounds, north, px, blocked = [], hints = [], view = null }) {
  const [x0, z0, x1, z1] = bounds;
  const inset = 0.3;
  const corners = [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset]];
  let best = null;
  for (const nc of corners) {
    let compass = compassAt(nc, north, px);
    if (view) {
      const [dx, dz] = keepIn(compass.box, view, px(6));
      if (dx || dz) compass = compassAt([nc[0] + dx, nc[1] + dz], north, px);
    }
    const taken = [compass.box];
    const placed = new Map();
    let total = cost(compass.box, blocked);
    for (const h of hints) {
      let pick = null;
      for (const s of hintSpots(h.field, h.text, h.size, px)) {
        const c = cost(s.box, [...blocked, ...taken], view);
        if (!pick || c < pick.c) pick = { ...s, c };
        if (!c) break;
      }
      placed.set(h.id, pick);
      taken.push(pick.box);
      total += pick.c;
    }
    if (!best || total < best.total) best = { total, compass, hints: placed };
    if (!total) break;
  }
  return { compass: best.compass, hints: best.hints };
}
