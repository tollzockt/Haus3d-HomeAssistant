// Wandflächen einer Etage (aus walls.js:computeWalls) zum Einrasten von Möbeln und Verteilern. Eigenes kleines Modul:
// die Szene (scene-pipes.js) braucht nur das und lädt so die Editor-Logik (edit-ops.js) beim Start nicht mit.

/**
 * Wandflächen einer Etage zum Einrasten: je Wandsegment die Seiten, an denen ein Raum liegt.
 * @param {object[]} segments aus computeWalls
 * @returns {{p: number[], u: number[], n: number[], t0: number, t1: number}[]} n zeigt von der Wand weg in den Raum
 */
export function wallFaces(segments) {
  const faces = [];
  for (const s of segments) {
    for (const side of [1, -1]) {
      // nur Seiten zum Raum hin (bei Außenwänden die Innenseite), freie Wände beidseitig
      const roomSide = side > 0 ? s.roomLeft : s.roomRight;
      if (!roomSide && s.kind !== "free") continue;
      const extra = roomSide && s.flush > 0 ? s.flush : 0; // bündiger Streifen (walls.js)
      const off = side > 0 ? s.left + extra : -(s.right + extra);
      const n = [s.n[0] * side, s.n[1] * side];
      faces.push({ p: [s.a[0] + s.n[0] * off, s.a[1] + s.n[1] * off], u: s.u, n, t0: 0, t1: s.length });
    }
  }
  return faces;
}
