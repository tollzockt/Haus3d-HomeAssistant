// Wand-Meshes der Szene: aus den Wandstücken je Etage (wallcull.js floorPrisms, gesammelt in _buildFloor) die
// sichtbaren Flächen (verdeckte fallen weg, auch zur Etage darüber und darunter) und je Textur ein BufferGeometry mit
// Farbe je Ecke (UVs in Metern). SceneWalls mischt _finishWalls in HouseScene.

import * as THREE from "./vendor/three.module.min.js";
import { planarUVs } from "./textures.js";
import { visibleFaces } from "./wallcull.js";

/** Flächen ({pts, out, color}, color.tex = Textur) → je Textur ein BufferGeometry: [{key, geo}]. */
export function wallGeometries(faces) {
  const buckets = new Map(); // Textur-Schlüssel ("" = glatt) -> {pos, nor, col}
  for (const { pts, out, color, center } of faces) {
    if (pts.length < 3) continue;
    // Fächer aus Dreiecken, gegen den Uhrzeigersinn von außen gesehen (Umlaufsinn nach Newell)
    const n = [0, 0, 0];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]);
      n[1] += (p[2] - q[2]) * (p[0] + q[0]);
      n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
    const key = color?.tex ?? "";
    if (!buckets.has(key)) buckets.set(key, { pos: [], nor: [], col: [] });
    const bk = buckets.get(key);
    const tri = (a, b, c) => {
      for (const v of flip ? [a, c, b] : [a, b, c]) {
        bk.pos.push(v[0], v[1], v[2]);
        bk.nor.push(out[0], out[1], out[2]);
        bk.col.push(color?.r ?? 1, color?.g ?? 1, color?.b ?? 1);
      }
    };
    if (center) {
      // Ecken auf den Kanten (wallcull.js conform): Fächer aus der Mitte, jede Teilkante ist eine Dreieckskante
      const m = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
      pts.forEach((p, i) => tri(m, p, pts[(i + 1) % pts.length]));
    } else for (let i = 1; i + 1 < pts.length; i++) tri(pts[0], pts[i], pts[i + 1]);
  }
  const list = [];
  for (const [key, bk] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bk.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(bk.nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(bk.col, 3));
    if (key) planarUVs(geo);
    geo.computeBoundingSphere();
    list.push({ key, geo });
  }
  return list;
}

export const SceneWalls = {
  /**
   * Wand-Meshes aller Etagen aus den gesammelten Stücken (entry.walls), Nachbaretagen nach Höhe: die Unterflächen
   * des Wandfußes auf den Wänden darunter fallen weg; Deckflächen unter dem Wandfuß der Etage darüber kommen in eine
   * eigene Hülle (entry.lid), die setFilter nur zeigt, wenn jene Etage ausgeblendet ist – sonst lägen sie in der
   * Fuge und blitzten an der Fassade durch.
   */
  _finishWalls() {
    const elev = (e) => e.floor.elevation ?? 0;
    const list = [...this.floors.values()].filter((e) => e.walls).sort((p, q) => elev(p) - elev(q));
    for (const e of list) {
      const below = list.filter((o) => elev(o) < elev(e)).at(-1);
      const above = list.find((o) => elev(o) > elev(e));
      const { faces, lids } = visibleFaces(e.walls, { above: above?.walls.filter((p) => p.base) ?? [], below: below?.walls ?? [] });
      const add = (parent) => ({ key, geo }) => {
        const m = new THREE.Mesh(geo, this._texMat(this.mats.wall, key, "wall"));
        m.userData.layer = "walls";
        parent.add(m);
        return m;
      };
      const meshes = wallGeometries(faces).map(add(e.group));
      e.occluders.push(...meshes);
      if (lids.length) {
        const wrap = new THREE.Group(); // ohne Ebene: applyLayers lässt die Hülle in Ruhe
        wallGeometries(lids).forEach(add(wrap));
        e.group.add(wrap);
        e.lid = { wrap, above: above.floor.id };
      }
      // Cyberpunk: Neonkanten an allen Wandkanten
      if (this.style === "cyber") {
        for (const m of meshes) {
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), this.mats.edge);
          edges.userData.layer = "walls";
          e.group.add(edges);
        }
      }
    }
    for (const e of list) delete e.walls;
  },
};
