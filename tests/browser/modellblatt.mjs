// Modellblatt (Entwicklerwerkzeug, kein Test): rendert Möbeltypen als Raster-Bild (mit gestricheltem Sollmaß-Kasten) und meldet gemessene Maße.
// NODE_PATH="$(npm root -g)" node tests/browser/modellblatt.mjs <out.png> [--types a,b,c | --cat "Kategorie" | --prefix garden_] [--style cyber]
//   [--item '{"open":true}'] [--cols 4] [--cell 320] [--view front|back|top|side]
import { writeFileSync } from "node:fs";
import { start } from "./lib.mjs";

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d = null) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const t = await start(".");
const pg = await t.page("sheet", "?x", { wait: 1500 });
const res = await pg.evaluate(
  async ({ types, cat, prefix, style, extra, cols, cell, view }) => {
    const base = "/custom_components/haus3d/frontend/";
    const THREE = await import(base + "vendor/three.module.min.js");
    const F = await import(base + "furniture.js");
    let list = types ? types.split(",") : [];
    if (cat) list = F.FURNITURE_CATEGORIES.find(([c]) => c === cat)?.[1] ?? [];
    if (prefix) list = Object.keys(F.FURNITURE).filter((k) => k.startsWith(prefix));
    const M = F.furnitureMaterials(style);
    const rows = Math.ceil(list.length / cols);
    const sheet = document.createElement("canvas");
    sheet.width = cols * cell;
    sheet.height = rows * cell;
    const c2 = sheet.getContext("2d");
    c2.fillStyle = style === "cyber" ? "#07030f" : "#e9eef2";
    c2.fillRect(0, 0, sheet.width, sheet.height);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(cell, cell);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const report = {};
    for (let i = 0; i < list.length; i++) {
      const type = list[i];
      const def = F.FURNITURE[type];
      if (!def) {
        report[type] = "unbekannt";
        continue;
      }
      const [, w, d, h] = def;
      const item = { id: type, type, x: 0, z: 0, rotation: 0, w, d, h, ...extra };
      const obj = F.buildFurniture(item, M, 0, 2.5);
      scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      let meshes = 0;
      let tris = 0;
      obj.traverse((o) => {
        if (o.isMesh) {
          meshes++;
          tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        }
      });
      const y0 = obj.position.y;
      const decl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: 0xe53935, transparent: true, opacity: 0.55 }));
      decl.position.y = y0 + h / 2;
      scene.add(decl);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d) * 1.6, Math.max(w, d) * 1.6), new THREE.MeshStandardMaterial({ color: style === "cyber" ? 0x120a24 : 0xcfd6c8, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = y0 - 0.002;
      scene.add(floor);
      const center = new THREE.Vector3(0, y0 + h / 2, 0);
      const radius = Math.max(0.2, Math.hypot(w, h, d) / 2);
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.0;
      const dir = { front: [0.55, 0.6, 0.85], back: [-0.55, 0.6, -0.85], top: [0.01, 1, 0.12], side: [1, 0.25, 0.12] }[view] ?? [0.55, 0.6, 0.85];
      camera.position.copy(center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist));
      camera.lookAt(center);
      renderer.render(scene, camera);
      const x0 = (i % cols) * cell;
      const y1 = Math.floor(i / cols) * cell;
      c2.drawImage(renderer.domElement, x0, y1);
      c2.fillStyle = style === "cyber" ? "#fff" : "#222";
      c2.font = "11px sans-serif";
      c2.fillText(`${type}  ${def[0]}`, x0 + 6, y1 + 16);
      c2.fillText(`Soll ${w}×${d}×${h}  Ist ${size.x.toFixed(2)}×${size.z.toFixed(2)}×${size.y.toFixed(2)}  ${meshes} M ${Math.round(tris)} Dr.`, x0 + 6, y1 + cell - 8);
      report[type] = { soll: [w, d, h], ist: [+size.x.toFixed(3), +size.z.toFixed(3), +size.y.toFixed(3)], min: [+(box.min.x).toFixed(3), +(box.min.z).toFixed(3), +(box.min.y - y0).toFixed(3)], meshes, tris: Math.round(tris) };
      scene.remove(obj, decl, floor);
    }
    return { png: sheet.toDataURL("image/png"), report };
  },
  { types: opt("types"), cat: opt("cat"), prefix: opt("prefix"), style: opt("style", "standard"), extra: JSON.parse(opt("item", "{}")), cols: Number(opt("cols", 4)), cell: Number(opt("cell", 320)), view: opt("view", "front") },
);
writeFileSync(out, Buffer.from(res.png.split(",")[1], "base64"));
console.log(JSON.stringify(res.report, null, 0));
t.errors.length && console.log("FEHLER:", t.errors);
await t.browser.close();
process.exit(0);
