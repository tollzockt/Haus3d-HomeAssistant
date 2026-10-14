// Neigen und Kippen von Möbeln und Gegenständen (ohne Three.js, mit node testbar): Winkel aus den Feldern
// tilt/roll, Lage des gedrehten Rahmens (Grundfläche, Höhe, tiefste Ecke) und der Versatz des Modells, damit
// die tiefste Ecke auf der Montagehöhe und die Mitte der Grundfläche bei x/z bleibt.
//
// Rahmen eines Gegenstands (wie in furniture.js): Breite w entlang x, Höhe h nach oben (Unterkante y = 0),
// Tiefe d entlang z, Vorderseite +z, Mitte der Grundfläche im Ursprung.
// Reihenfolge im eigenen Rahmen: erst Kippen um die Tiefenachse (roll, positiv = Oberseite nach rechts, +x,
// von vorn gesehen), dann Neigen um die Breitenachse (tilt, positiv = Oberseite nach hinten, −z), zuletzt
// die Drehung um die Hochachse (rotation, in Weltkoordinaten). In Three.js: rotation.set(−tilt, −rotation,
// −roll, "YXZ") in Bogenmaß auf der äußeren Gruppe.

const DEG = Math.PI / 180;

/** Arten ohne Neigen/Kippen (liegen flach im Boden bzw. schneiden die Decke aus). */
export const NO_POSE = new Set(["stairs", "stairwell", "parking"]);

const clean = (v) => Math.round(v * 1e9) / 1e9 + 0; // Rundungsrauschen (cos 90° …) und −0 weg

/** Winkel in Grad auf −180 … 180 (−180 wird 180), auf 0,001° gerundet; keine endliche Zahl → 0. */
export function normAngle(v) {
  if (v === null || v === "" || typeof v === "boolean") return 0;
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  let a = (((Math.round(x * 1000) / 1000) % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 1000) / 1000 + 0;
}

/** Neigung und Kippen eines Gegenstands in Grad (0 bei Treppe, Treppenloch, Stellplatz und ohne Angabe). */
export function poseAngles(item) {
  if (!item || NO_POSE.has(item.type)) return { tilt: 0, roll: 0 };
  return { tilt: normAngle(item.tilt), roll: normAngle(item.roll) };
}

/** Ist der Gegenstand geneigt oder gekippt? */
export function hasPose(item) {
  const p = poseAngles(item);
  return p.tilt !== 0 || p.roll !== 0;
}

/** Punkt [x, y, z] des Rahmens nach Kippen und Neigen (ohne die Drehung um die Hochachse). */
export function poseRotate([x, y, z], tilt = 0, roll = 0) {
  const a = -tilt * DEG;
  const b = -roll * DEG;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const x1 = x * cb - y * sb;
  const y1 = x * sb + y * cb;
  return [x1, y1 * ca - z * sa, y1 * sa + z * ca];
}

/**
 * Hülle des Rahmens w × h × d nach Neigen/Kippen, achsparallel im eigenen Rahmen: w, d = Grundfläche, h = Höhe,
 * off = Versatz [x, y, z] des Modell-Ursprungs (vor der Drehung um die Hochachse), damit die tiefste Ecke auf
 * y = 0 und die Mitte der Grundfläche bei 0/0 liegt. Ohne Neigen/Kippen genau w, d, h und [0, 0, 0].
 */
export function poseBox(w, d, h, tilt = 0, roll = 0) {
  if (!tilt && !roll) return { w, d, h, off: [0, 0, 0] };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const x of [-w / 2, w / 2]) {
    for (const y of [0, h]) {
      for (const z of [-d / 2, d / 2]) {
        const p = poseRotate([x, y, z], tilt, roll);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], p[k]);
          hi[k] = Math.max(hi[k], p[k]);
        }
      }
    }
  }
  return {
    w: clean(hi[0] - lo[0]),
    d: clean(hi[2] - lo[2]),
    h: clean(hi[1] - lo[1]),
    off: [clean(-(lo[0] + hi[0]) / 2), clean(-lo[1]), clean(-(lo[2] + hi[2]) / 2)],
  };
}

/**
 * Höhe eines bis zur Decke reichenden Rahmens (Säule, Stütze mit Höhe 0), damit er geneigt genau unter die
 * Decke passt (ceil = Raumhöhe); mindestens 5 cm. Liegt er flach (90°), bleibt die volle Raumhöhe als Länge.
 */
export function fitHeight(w, d, ceil, tilt = 0, roll = 0) {
  const a = -tilt * DEG;
  const b = -roll * DEG;
  const k = Math.abs(Math.cos(b) * Math.cos(a));
  if (k < 1e-6) return ceil;
  const rest = w * Math.abs(Math.sin(b) * Math.cos(a)) + d * Math.abs(Math.sin(a));
  return clean(Math.max(0.05, (ceil - rest) / k));
}

/**
 * Pose eines Gegenstands mit Rahmen w × h × d: Winkel, Höhe des Modells h0 (bis zur Decke reichende Teile – ceil
 * = Raumhöhe – passend gekürzt) und die Hülle samt Versatz (poseBox).
 * @returns {{tilt: number, roll: number, h0: number, w: number, d: number, h: number, off: number[]}}
 */
export function furniturePose(item, w, d, h, ceil = null) {
  const { tilt, roll } = poseAngles(item);
  const h0 = (tilt || roll) && Number(ceil) > 0 ? fitHeight(w, d, Number(ceil), tilt, roll) : h;
  return { tilt, roll, h0, ...poseBox(w, d, h0, tilt, roll) };
}

/** Grundfläche [Breite, Tiefe] im eigenen Rahmen (vor der Drehung um die Hochachse); Maße wie furniturePose. */
export function planSize(item, w, d, h, ceil = null) {
  const p = furniturePose(item, w, d, h, ceil);
  return [p.w, p.d];
}

/** Neigung bzw. Kippen (k = "tilt" | "roll") schreiben: auf −180 … 180, 0 oder leer = Feld weg. */
export function setPoseKey(item, k, v) {
  const a = normAngle(v);
  if (a) item[k] = a;
  else delete item[k];
}
