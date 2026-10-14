// Geometrie-Helfer der Szene: Grundriss-Polygon als Shape, flache oder extrudierte Fläche und
// PanelBatch (PV-Module als ein InstancedMesh). Werden von scene.js und scene-roof.js genutzt.

import * as THREE from "./vendor/three.module.min.js";

/**
 * Sammelt PV-Module (je eine Matrix) und macht daraus ein InstancedMesh: 2 statt etwa 6
 * Zeichenaufrufe je Modul. Einheitsmodul 1 × 0,04 × 1 m, die Matrix skaliert auf Breite/Länge.
 */
export class PanelBatch {
  constructor(mats, data = {}) {
    this.mats = mats;
    this.data = data;
    this.list = [];
  }

  push(matrix) {
    this.list.push(matrix.clone());
  }

  mesh() {
    if (!this.list.length) return null;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 1), this.mats, this.list.length);
    this.list.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
    Object.assign(inst.userData, this.data);
    return inst;
  }
}

/** Plan [x, z] -> Shape in der XY-Ebene, die nach rotateX(-PI/2) wieder bei (x, 0, z) liegt. */
export function shapeOf(points, holes = []) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

export function flatOrExtruded(points, height, holes = []) {
  const shape = shapeOf(points, holes);
  const geo = height > 0 ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }) : new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}
