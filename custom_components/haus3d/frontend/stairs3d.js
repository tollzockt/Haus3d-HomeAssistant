// Treppe und Treppenloch in 3D (im Einheitsrahmen von furniture.js): Stufen, Austrittspodest und Spindel
// der Wendeltreppe, durchgehender Handlauf als Röhre, Pfosten und Stäbe in einem Mesh; Treppenloch als
// flache Kantenleiste mit offener Mitte.

import * as THREE from "./vendor/three.module.min.js";
import { stairLayout } from "./stairs.js";
import { ellipsePoly, rectPoly } from "./stairgeom.js";
import { RAIL_H, stairRails } from "./stairrail.js";

function block(g, mat, w, h, d, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005)), mat);
  mesh.position.set(x, y + h / 2, z);
  g.add(mesh);
  return mesh;
}

function cyl(g, mat, r, h, x = 0, y = 0, z = 0, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(h, 0.005), seg), mat);
  mesh.position.set(x, y + h / 2, z);
  g.add(mesh);
  return mesh;
}

/** Vieleck im Plan [x, z] als Platte der Stärke thick mit Oberkante top. */
function plate(g, mat, poly, top, thick) {
  const shp = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shp, { depth: thick, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = top - thick;
  g.add(mesh);
  return mesh;
}

/** Handlauf als Röhre durch die Punkte [x, y, z]; doppelte Punkte fallen weg, unter 2 Punkten entsteht nichts. */
function tube(g, pts, mat) {
  const list = [];
  for (const p of pts) {
    if (!p.every(Number.isFinite)) continue;
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    if (list.length && list.at(-1).distanceTo(v) < 1e-4) continue;
    list.push(v);
  }
  if (list.length < 2) return null;
  const path = new THREE.CurvePath();
  let len = 0;
  for (let i = 0; i < list.length - 1; i++) {
    path.add(new THREE.LineCurve3(list[i], list[i + 1]));
    len += list[i].distanceTo(list[i + 1]);
  }
  const geo = new THREE.TubeGeometry(path, Math.min(400, Math.ceil(len / 0.04) + 2 * list.length), 0.022, 8, false);
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  return mesh;
}

/** Pfosten und Stäbe [x, z, y0, y1, Stärke] als ein Mesh (Kopien eines Einheitswürfels). */
function mergeBars(g, list, mat) {
  const ok = list.filter((b) => b.every(Number.isFinite) && b[3] - b[2] >= 0.01 && b[4] > 0);
  if (!ok.length) return null;
  const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const P = cube.attributes.position.array;
  const N = cube.attributes.normal.array;
  const pos = new Float32Array(P.length * ok.length);
  const nor = new Float32Array(N.length * ok.length);
  ok.forEach(([x, z, y0, y1, t], k) => {
    const o = k * P.length;
    for (let i = 0; i < P.length; i += 3) {
      pos[o + i] = x + P[i] * t;
      pos[o + i + 1] = (y0 + y1) / 2 + P[i + 1] * (y1 - y0);
      pos[o + i + 2] = z + P[i + 2] * t;
    }
    nor.set(N, o);
  });
  cube.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  return mesh;
}

/** Treppe: Stufen als Blöcke bis zum Boden (Wendeltreppe: nur Trittplatten), Podest, Spindel, Geländer. */
export function buildStairs(g, item, w, d, h, M) {
  const lay = stairLayout({ shape: item.stair_shape, w, d, h, run: item.run_width });
  for (const t of lay.treads) {
    if (!t.poly) {
      block(g, M.wood, t.x1 - t.x0, t.top, t.z1 - t.z0, (t.x0 + t.x1) / 2, 0, (t.z0 + t.z1) / 2);
      continue;
    }
    // Wendel-/Fächerstufe: Vieleck hochgezogen (Wendeltreppe: nur die Trittplatte)
    plate(g, M.wood, t.poly, t.top, t.spiral ? 0.05 : t.top);
  }
  if (lay.platform) plate(g, M.wood, lay.platform.poly, lay.platform.top, 0.05);
  if (lay.spindle) cyl(g, M.dark, lay.spindle, h + RAIL_H, 0, 0, 0);
  const { rails, bars } = stairRails(lay, item.railing);
  for (const r of rails) tube(g, r, M.dark);
  mergeBars(g, bars, M.dark);
}

/** Treppenloch: 3 cm breite, flache Kantenleiste rund um die Öffnung (eckig oder rund), die Mitte bleibt offen. */
export function buildStairwell(g, item, w, d, M) {
  const round = !!item.hole_round;
  const outline = (rx, rz) => (round ? ellipsePoly(0, 0, rx, rz, 32) : rectPoly(-rx, -rz, rx, rz));
  const shp = new THREE.Shape(outline(w / 2, d / 2).map(([x, z]) => new THREE.Vector2(x, -z)));
  if (w > 0.08 && d > 0.08) shp.holes.push(new THREE.Path(outline(w / 2 - 0.03, d / 2 - 0.03).map(([x, z]) => new THREE.Vector2(x, -z))));
  const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.012, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, M.dark);
  g.add(mesh);
  return mesh;
}
