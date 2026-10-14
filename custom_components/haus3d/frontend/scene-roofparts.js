// Dachformen aus roofshapes.js in 3D (Mixin für HouseScene): freie Dachteile und eigene Dächer der neuen Formen –
// Platte (Flachdach, Dachterrasse mit Belag und Geländer), Kegel, Dachflächen und Giebel aus Dreiecken.
// Materialien laufen über _texMat, damit Schnee und Jahreszeiten sie erreichen.

import * as THREE from "./vendor/three.module.min.js";
import { flatOrExtruded } from "./scene-geo.js";
import { planarUVs } from "./textures.js";
import { textureFor } from "./model.js";

const hex = (v) => /^#[0-9a-f]{6}$/i.test(v ?? "");

/**
 * Texturkoordinaten eines Kegelmantels (ConeGeometry, Winkel aus deren uv.x): abgerollt um die Spitze,
 * s = Abstand zur Spitze, φ = θ·R/√(R² + h²), uv = (s·sin φ, s·cos φ) in Metern.
 */
export function coneUVs(geo, c, apex, R, h) {
  const pos = geo.attributes.position;
  const old = geo.attributes.uv;
  const k = R / Math.max(1e-9, Math.hypot(R, h));
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const s = Math.hypot(pos.getX(i) - c[0], pos.getY(i) - apex, pos.getZ(i) - c[1]);
    const phi = (old ? old.getX(i) : 0) * 2 * Math.PI * k;
    uv[2 * i] = s * Math.sin(phi);
    uv[2 * i + 1] = s * Math.cos(phi);
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Dreiecke [[x, y, z] × 3] als Fläche mit Normalen und Texturkoordinaten
function triGeometry(tris) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3));
  geo.computeVertexNormals();
  return planarUVs(geo);
}

export const SceneRoofParts = {
  /**
   * Meshes einer Form aus roofshapes.partShape in parent hängen (unit: Dach-Einheit für Farben).
   * @returns {{meshes: THREE.Mesh[], type: string}}
   */
  _buildRoofShape(sh, parent, unit, settings = {}) {
    const spec = sh.part ?? {};
    const meshes = [];
    const add = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      parent.add(m);
      meshes.push(m);
      return m;
    };
    if (sh.slab) {
      // Platte: Oberseite Dachbelag bzw. Terrassenbelag, Seiten wie die Giebel (Außenwand)
      const { poly, y0, y1 } = sh.slab;
      const geo = flatOrExtruded(poly, Math.max(0.01, y1 - y0));
      geo.translate(0, y0, 0);
      const top = sh.type === "terrace" ? this._terraceMat(spec) : this._partRoofMat(spec, sh.type);
      add(geo, [top, this._partGableMat(spec, unit, settings)]);
      // Geländer an den freien Kanten (K8: Kanten kommen mit)
      if (sh.rail?.edges?.length) this._buildRailing(parent, { railing: sh.rail.style, railing_height: sh.rail.height, edges: sh.rail.edges }, sh.rail.y, null);
    } else if (sh.cone) {
      const { center: c, r, eave, apex } = sh.cone;
      const h = Math.max(0.01, apex - eave);
      const geo = new THREE.ConeGeometry(r, h, 48, 1, true); // Naht doppelt (48 + 1 Spalten): Texturkoordinaten ohne Sprung
      geo.translate(c[0], eave + h / 2, c[1]);
      add(coneUVs(geo, c, eave + h, r, h), this._partRoofMat(spec, sh.type));
    } else {
      if (sh.roofTris?.length) add(triGeometry(sh.roofTris), this._partRoofMat(spec, sh.type));
      if (sh.gableTris?.length) add(triGeometry(sh.gableTris), this._partGableMat(spec, unit, settings));
    }
    // Cyberpunk: Neonkanten (als Kind der Fläche)
    if (this.mats.roofEdge) for (const m of meshes) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), this.mats.roofEdge));
    return { meshes, type: sh.type };
  },

  /** Dachbelag einer Form: eigene Farbe (spec.color) bzw. Deckung (spec.texture), sonst Standard des Stils. */
  _partRoofMat(spec, type) {
    const custom = hex(spec.color) && this.style !== "cyber";
    let m = custom ? this.mats.roof.clone() : this.mats.roof;
    if (custom) this._ownColor(m, spec.color);
    return this._texMat(m, textureFor("roof", spec.texture, type), "roof", custom); // Schnee/Jahreszeit über _groundRoofMats
  },

  /** Belag der Dachterrasse wie die Gartenfläche „Terrasse“ (auch gedreht), eigene Farbe als Kopie. */
  _terraceMat(spec) {
    const custom = hex(spec.color) && this.style !== "cyber";
    let m = custom ? this.outdoorMats.terrace.clone() : this.outdoorMats.terrace;
    if (custom) this._ownColor(m, spec.color);
    return this._texMat(m, textureFor("ground", spec.texture, "terrace"), "ground:terrace", custom, spec.texture_rotation);
  },

  /** Giebel und Plattenkanten: gable_color, bei Raumdächern die Außenwand des Raums, sonst die Außenwände des Hauses. */
  _partGableMat(spec, unit, settings = {}) {
    const ok = (v) => hex(v) && this.style !== "cyber";
    const room = unit?.kind === "room" ? unit.rooms?.[0] ?? null : null;
    const gCol = ok(spec.gable_color) ? spec.gable_color : ok(room?.exterior_color) ? room.exterior_color : ok(settings.wall_colors?.exterior) ? settings.wall_colors.exterior : null;
    let m = gCol ? this.mats.gable.clone() : this.mats.gable;
    if (gCol) this._ownColor(m, gCol);
    const tex = textureFor("wall", spec.gable_texture || room?.exterior_texture || settings.wall_textures?.exterior || "");
    return this._texMat(m, tex, "gable", !!gCol);
  },

  // Kopie mit eigener Farbe: getönte Grundfarbe (Schnee, Jahreszeit) der Vorlage nicht übernehmen
  _ownColor(m, color) {
    m.color.set(color);
    delete m.userData.base;
    delete m.userData.orig;
  },
};
