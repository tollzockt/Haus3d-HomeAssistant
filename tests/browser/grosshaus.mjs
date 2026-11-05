// Großes Testhaus für Leistungsmessungen (perf-laden.mjs, bench.mjs, bildvergleich.mjs): 3 Etagen, 40 Räume, 310 Möbel,
// 50 Leitungen – erzeugt aus festem Startwert, nur erfundene Daten (keine echten Entitäten).
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FRONT = join(root, "custom_components/haus3d/frontend");

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ großes Testhaus

/** 3 Etagen, 40 Räume, 300 Möbel (gemischte Kategorien, häufige Typen wiederholen sich), 50 Leitungen – nur erfundene Daten. */
export async function bigHouse() {
  const { FURNITURE, FURNITURE_CATEGORIES, FURNITURE_GROUPS } = await import(pathToFileURL(join(FRONT, "furniture.js")).href);
  const base = JSON.parse(await readFile(join(root, "custom_components/haus3d/haus-daten.json"), "utf8"));
  const rnd = rng(20260415);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const skip = new Set(["Bau", "Eigene Körper", "Solar-Aufständerung"]);
  const cats = new Map(FURNITURE_CATEGORIES);
  const groupTypes = (group) => FURNITURE_GROUPS.find(([g]) => g === group)[1].filter((c) => !skip.has(c)).map((c) => ({ c, types: cats.get(c).filter((t) => FURNITURE[t]) }));
  const indoor = groupTypes("Drinnen");
  const outdoor = groupTypes("Draußen");
  // Pool häufiger Typen: je Kategorie zwei, gewichtet nach Rang (Stühle, Lampen … kommen oft vor)
  const poolIn = indoor.flatMap(({ types }) => [pick(types), pick(types)]).sort(() => rnd() - 0.5);
  const poolOut = outdoor.flatMap(({ types }) => [pick(types)]);
  const weighted = (pool) => {
    let r = rnd() * pool.reduce((s, _, i) => s + 1 / (i + 1) ** 0.8, 0);
    for (let i = 0; i < pool.length; i++) if ((r -= 1 / (i + 1) ** 0.8) <= 0) return pool[i];
    return pool[0];
  };
  const typeIn = () => (rnd() < 0.2 ? pick(pick(indoor).types) : weighted(poolIn)); // 20 % Streuung über den ganzen Katalog
  const typeOut = () => (rnd() < 0.3 ? pick(pick(outdoor).types) : weighted(poolOut));
  const names = ["Wohnzimmer", "Küche", "Bad", "Schlafzimmer", "Flur", "Büro", "Kinderzimmer", "Gästezimmer", "Keller", "Technik"];
  const mats = ["oak", "tiles", "concrete", "oak", "tiles"];
  const W = 4.5;
  const D = 4;
  const floors = [];
  let furnId = 0;
  let pipeId = 0;
  const layout = [["eg", "EG", 0, 15], ["og", "OG", 2.8, 15], ["dg", "DG", 5.6, 10]];
  for (const [id, name, elevation, count] of layout) {
    const rooms = [];
    const openings = [];
    for (let k = 0; k < count; k++) {
      const i = k % 5;
      const j = Math.floor(k / 5);
      const x0 = i * W;
      const z0 = j * D;
      const rid = `${id}_r${k}`;
      rooms.push({ id: rid, name: `${names[k % names.length]} ${id.toUpperCase()}${k + 1}`, area_id: null, points: [[x0, z0], [x0 + W, z0], [x0 + W, z0 + D], [x0, z0 + D]], floor_material: mats[k % mats.length] });
      const outer = j === 0 ? 0 : j === 2 || (id === "dg" && j === 1) ? 2 : i === 0 ? 3 : i === 4 ? 1 : null;
      if (outer !== null) openings.push({ id: `${rid}_f`, room_id: rid, edge: outer, offset: 1.2, width: 1.4, type: "window", sill: 0.9, height: 1.3, hinge: "left", leaves: 1, swing: "in" });
      openings.push({ id: `${rid}_t`, room_id: rid, edge: i < 4 ? 1 : 3, offset: 1.5, width: 0.9, type: "door", sill: 0, height: 2.05, hinge: "left", leaves: 1, swing: "in" });
    }
    const furniture = [];
    const perFloor = id === "dg" ? 80 : 110;
    for (let n = 0; n < perFloor; n++) {
      const room = rooms[Math.floor(rnd() * rooms.length)];
      const [x0, z0] = room.points[0];
      const type = typeIn();
      const [, w, d, h] = FURNITURE[type];
      furniture.push({ id: `m${++furnId}`, type, x: +(x0 + 0.7 + rnd() * (W - 1.4)).toFixed(2), z: +(z0 + 0.7 + rnd() * (D - 1.4)).toFixed(2), rotation: pick([0, 90, 180, 270]), w, d, h, variant: null, entity: null });
    }
    if (id === "eg") {
      for (let n = 0; n < 10; n++) {
        const type = typeOut();
        const [, w, d, h] = FURNITURE[type];
        furniture.push({ id: `m${++furnId}`, type, x: +(-2.5 + rnd() * 25).toFixed(2), z: +(-3.5 + rnd() * 1.5).toFixed(2), rotation: pick([0, 90, 180, 270]), w, d, h, variant: null, entity: null });
      }
    }
    const types = ["strom", "wasser_kalt", "wasser_warm", "netzwerk"];
    const pipes = [];
    for (let n = 0; n < (id === "dg" ? 12 : 19); n++) {
      const pts = [];
      let x = rnd() * W * 5;
      let z = rnd() * D * 3;
      for (let q = 0; q < 3 + Math.floor(rnd() * 3); q++) {
        pts.push([+x.toFixed(2), +z.toFixed(2)]);
        if (q % 2) z = Math.min(D * 3, Math.max(0, z + (rnd() - 0.5) * 6));
        else x = Math.min(W * 5, Math.max(0, x + (rnd() - 0.5) * 8));
      }
      const hgt = pick([0.3, 1.1, 2.45]);
      pipes.push({ id: `p${++pipeId}`, type: types[n % 4], points: pts, heights: pts.map(() => hgt) });
    }
    const placements = id === "eg" ? ["light.wohnzimmer_decke", "light.kueche", "switch.kaffeemaschine", "sensor.wohnzimmer_temperatur", "cover.wohnzimmer_rollladen", "binary_sensor.haustuer"].map((e, n) => ({ entity_id: e, x: 2 + n * 3, z: 2, y: 1.2, rotation: 0 })) : [];
    floors.push({ id, name, elevation, height: 2.6, cut_height: 1.15, rooms, openings, furniture, placements, background: null, outdoor: id === "eg" ? [{ id: "rasen", type: "lawn", points: [[-4, -4], [26, -4], [26, 16], [-4, 16]] }] : [], walls: [], pipes, ha_floor: null });
  }
  return { version: base.version, floors, settings: base.settings, energy: base.energy, presence: [] };
}

export function houseStats(b) {
  const f = b.floors;
  const types = new Set(f.flatMap((x) => x.furniture.map((m) => m.type)));
  return { etagen: f.length, raeume: f.reduce((n, x) => n + x.rooms.length, 0), moebel: f.reduce((n, x) => n + x.furniture.length, 0), typen: types.size, leitungen: f.reduce((n, x) => n + (x.pipes?.length ?? 0), 0) };
}
