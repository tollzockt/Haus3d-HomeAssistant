// Leitungsenden, die an einem Möbelstück hängen, ziehen mit (ohne DOM, mit node testbar; eingebunden über follow.js).

import { endTarget, followPoint, targetMoved } from "./pipeends.js";
import { jointsOf } from "./pipenet.js";

const same = (p, q) => !!p && !!q && Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;

/**
 * Nach einer Änderung im Editor: before = Etage vorher, after = Etage nachher (wird hier angepasst).
 * Beide sind eigenständige Objekte; before bleibt unverändert.
 *
 * Bezug pipe.ends.a/b (pipeends.js): Ist das Gerät verschoben, gedreht oder in der Größe geändert, wandert das
 * Leitungsende mit und behält seine Lage zum Gerät. Lag das Stück davor achsparallel, geht der Nachbarpunkt in der
 * Querrichtung mit (rechtwinklige Führung bleibt), solange er kein Ende und kein Abzweig ist. Fehlt das Gerät
 * (gelöscht), bleibt die Leitung stehen und das Ende ist gelöst. Hat die Änderung das Leitungsende selbst bewegt
 * (Punkt gezogen), bleibt es, wo es ist.
 */
export function followPipes(before, after) {
  for (const p of after?.pipes ?? []) {
    if (!p || p.ends == null) continue;
    if (typeof p.ends !== "object") {
      delete p.ends;
      continue;
    }
    const old = (before?.pipes ?? []).find((x) => x?.id === p.id);
    const n = p.points?.length ?? 0;
    for (const k of ["a", "b"]) {
      if (p.ends[k] == null) continue;
      const now = endTarget(after, p.ends[k]);
      if (!now || n < 2) {
        delete p.ends[k];
        continue;
      }
      const was = endTarget(before, p.ends[k]);
      const on = (old?.points?.length ?? 0) >= 2;
      if (!was || !on || !targetMoved(was, now)) continue;
      const i = k === "a" ? 0 : n - 1;
      const oi = k === "a" ? 0 : old.points.length - 1;
      if (!same(p.points[i], old.points[oi])) continue;
      const q = followPoint(old.points[oi], was, now);
      // Nachbarpunkt: rechtwinklige Führung erhalten
      const j = k === "a" ? 1 : n - 2;
      const oj = k === "a" ? 1 : old.points.length - 2;
      if (j > 0 && j < n - 1 && !jointsOf(p).includes(j) && same(p.points[j], old.points[oj])) {
        const a = old.points[oi];
        const b = old.points[oj];
        const nb = [...p.points[j]];
        if (Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) >= 1e-3) nb[0] = q[0];
        else if (Math.abs(a[1] - b[1]) < 1e-3 && Math.abs(a[0] - b[0]) >= 1e-3) nb[1] = q[1];
        p.points[j] = nb;
      }
      p.points[i] = q;
    }
    if (!p.ends.a && !p.ends.b) delete p.ends;
  }
  return after;
}
