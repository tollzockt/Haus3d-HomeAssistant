// Antippen in der Hauptansicht: Was verdeckt eine Wand? (Hilfen für HouseScene.pick/nearestEntity.)
//
// Wände halten das Antippen auf wie die Dächer: Ein Gerät hinter dem Haus (Whirlpool im Garten) lässt sich nicht durch
// die Fassade schalten. Der Cyberpunk-Stil hat durchsichtige Wände – dort sieht man dahinter, also zählt auch das Antippen.

import * as THREE from "./vendor/three.module.min.js";

const ray = new THREE.Raycaster();
const dir = new THREE.Vector3();

/** Wand-Meshes aller Etagen (Sichtbarkeit prüft der Aufrufer); leer, wenn man durch die Wände sieht. */
export function wallBlockers(scene) {
  const walls = [];
  if (scene.style === "cyber") return walls;
  for (const entry of scene.floors.values()) entry.group.traverse((o) => o.isMesh && o.userData.layer === "walls" && walls.push(o));
  return walls;
}

/**
 * Liegt zwischen der Kamera und dem Weltpunkt eine der Wände? Treffer in den letzten gap Metern vor dem Punkt zählen nicht
 * (Gerät, das direkt an der Fassade sitzt, liegt vor der Wand und nicht dahinter).
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} point
 * @param {THREE.Object3D[]} walls
 * @param {number} [gap]
 */
export function hiddenBehind(camera, point, walls, gap = 0.05) {
  if (!walls.length) return false;
  dir.copy(point).sub(camera.position);
  const dist = dir.length();
  if (dist <= gap) return false;
  ray.set(camera.position, dir.divideScalar(dist));
  ray.far = dist - gap;
  return ray.intersectObjects(walls, false).length > 0;
}

/** Gehört das Mesh zum Garten (Gartengruppe einer Etage: Gelände, Möbel und Geräte außerhalb der Räume)? */
export function inGarden(obj) {
  for (let p = obj.parent; p; p = p.parent) if (p.userData.layer === "garden") return true;
  return false;
}
