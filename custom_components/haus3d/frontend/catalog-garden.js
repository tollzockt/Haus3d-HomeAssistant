// Katalog „Garten, Garage, Hydroponik“ (ohne Three.js, mit node testbar): Typen mit Namen und Standardmaßen, Kategorien,
// Montagehöhen und frei stehende Typen. Die Modelle bauen furniture-garden.js und seine Module.

/**
 * items: Typ → [Name, w, d, h] (m; Breite × Tiefe × Höhe, alle > 0)
 * categories: [Kategorie, [Typen]] – jeder Typ genau einmal
 * mount: Typ → "ceiling" (unter der Decke) oder Zahl (Standardhöhe der Unterkante über dem Boden, m)
 * free: Typen, die nicht an Wänden einrasten (stehen frei, liegen auf dem Tisch, hängen an der Decke)
 * outdoor: Kategorien, die im Katalog unter „Draußen“ stehen
 */

// Draußen: Gartenmöbel
const SEATING = {
  garden_chair: ["Gartenstuhl", 0.55, 0.6, 0.85],
  garden_chair_stack: ["Stapelstuhl", 0.5, 0.55, 0.82],
  garden_chair_high: ["Hochlehner mit Auflage", 0.62, 0.72, 1.12],
  garden_bench: ["Gartenbank", 1.5, 0.6, 0.85],
  garden_lounge_sofa: ["Lounge-Sofa", 2.0, 0.9, 0.75],
  garden_lounge_chair: ["Lounge-Sessel", 0.85, 0.85, 0.75],
  garden_deckchair: ["Liegestuhl", 0.6, 1.05, 0.9],
  garden_hammock: ["Hängematte mit Gestell", 1.0, 3.6, 1.3],
  garden_swing_seat: ["Hollywoodschaukel", 2.0, 1.3, 1.8],
  garden_beach_chair: ["Strandkorb", 1.2, 1.0, 1.65],
  garden_table_round: ["Runder Gartentisch", 1.1, 1.1, 0.74],
  garden_bistro: ["Bistro-Set", 1.4, 0.55, 0.9],
  garden_pavilion: ["Pavillon", 3.0, 3.0, 2.7],
  garden_sunsail: ["Sonnensegel", 4.0, 4.0, 3.2],
  garden_firebowl: ["Feuerschale", 0.7, 0.7, 0.45],
  garden_outdoor_kitchen: ["Außenküche / Grillstation", 2.4, 0.7, 1.1],
  garden_bar: ["Gartenbar", 1.8, 0.6, 1.15],
};

// Draußen: Beet & Gewächshaus
const BEDS = {
  garden_raised_bed: ["Hochbeet", 1.2, 0.8, 0.8],
  garden_raised_bed_l: ["Hochbeet L-Form", 1.6, 1.6, 0.8],
  garden_raised_bed_metal: ["Hochbeet (Metall)", 1.2, 0.8, 0.8],
  garden_greenhouse: ["Gewächshaus (Glas)", 3.0, 2.4, 2.3],
  garden_foil_house: ["Folien-Gewächshaus / Tomatenhaus", 2.0, 1.2, 1.9],
  garden_cold_frame: ["Frühbeet", 1.2, 0.9, 0.45],
  garden_herb_spiral: ["Kräuterspirale", 1.6, 1.6, 0.8],
  garden_potting_table: ["Pflanztisch", 1.2, 0.6, 0.95],
  garden_trellis: ["Rankgitter", 1.2, 0.1, 2.0],
  garden_rose_arch: ["Rosenbogen", 1.4, 0.6, 2.4],
  garden_rain_barrel: ["Regentonne", 0.6, 0.6, 0.95],
  garden_shed_house: ["Gartenhaus", 3.0, 2.4, 2.4],
  garden_tool_shed: ["Geräteschuppen", 1.5, 0.8, 1.9],
  garden_worm_box: ["Wurmkiste", 0.6, 0.4, 0.5],
  garden_insect_hotel: ["Insektenhotel", 0.5, 0.25, 1.0],
  garden_bird_house: ["Vogelhaus", 0.4, 0.4, 1.6],
  garden_bird_bath: ["Vogeltränke", 0.45, 0.45, 0.8],
};

// Draußen: Spiel & Freizeit
const PLAY = {
  garden_swing: ["Schaukel", 2.4, 1.6, 2.1],
  garden_play_tower: ["Spielturm mit Rutsche", 3.2, 1.4, 2.6],
  garden_trampoline: ["Trampolin mit Netz", 3.0, 3.0, 2.4],
  garden_sandbox: ["Sandkasten", 1.2, 1.2, 0.3],
  garden_goal: ["Fußballtor", 3.0, 1.2, 1.5],
  garden_pingpong: ["Tischtennisplatte", 2.74, 1.525, 0.76],
  garden_pool_above: ["Aufstellpool", 3.6, 3.6, 1.2],
  garden_pond: ["Gartenteich mit Steinrand", 2.6, 1.9, 0.2],
  garden_jetty: ["Badeteich-Steg", 1.2, 3.0, 0.55],
  garden_hot_tub_acryl: ["Whirlpool eckig (Acryl)", 2.0, 2.0, 0.9],
  garden_kids_house: ["Kinderhaus", 1.6, 1.4, 1.8],
};

// Draußen: Hof & Einfahrt
const YARD = {
  garden_bins: ["Mülltonnen (3er)", 1.9, 0.75, 1.08],
  garden_bin_box: ["Mülltonnenbox", 2.1, 0.85, 1.3],
  garden_bike_stand: ["Fahrradständer", 1.8, 0.5, 0.45],
  garden_mailbox: ["Briefkasten auf Pfosten", 0.4, 0.3, 1.5],
  garden_parcel_box: ["Paketbox", 0.6, 0.55, 1.0],
  garden_hose_cart: ["Schlauchwagen", 0.5, 0.45, 0.95],
  garden_tap: ["Gartenwasserhahn (Wand)", 0.15, 0.2, 0.25],
  garden_house_number: ["Hausnummer", 0.2, 0.03, 0.2],
  garden_firewood: ["Brennholzlager", 1.8, 0.6, 1.3],
};

// Drinnen: Garage & Werkstatt (Länge der Fahrzeuge entlang z, Vorderseite +z)
const GARAGE = {
  garden_workbench: ["Werkbank", 1.8, 0.65, 0.9],
  garden_pegboard: ["Werkzeugwand (Lochwand)", 1.2, 0.04, 1.0],
  garden_tool_cart: ["Werkzeugwagen", 0.7, 0.45, 0.9],
  garden_rack_heavy: ["Schwerlastregal", 1.8, 0.5, 1.9],
  garden_tire_stack: ["Reifenstapel", 0.65, 0.65, 0.8],
  garden_tire_rack: ["Reifenregal", 1.2, 0.45, 1.0],
  garden_bike: ["Fahrrad", 0.55, 1.75, 1.05],
  garden_ebike: ["E-Bike", 0.6, 1.8, 1.1],
  garden_cargo_bike: ["Lastenrad", 0.85, 2.5, 1.05],
  garden_motorbike: ["Motorrad", 0.8, 2.1, 1.2],
  garden_scooter: ["Roller", 0.7, 1.8, 1.15],
  garden_mower: ["Rasenmäher", 0.55, 1.3, 1.0],
  garden_robot_mower: ["Mähroboter mit Ladestation", 1.2, 0.5, 0.3],
  garden_ride_mower: ["Aufsitzmäher", 1.0, 1.8, 1.1],
  garden_wheelbarrow: ["Schubkarre", 0.65, 1.55, 0.65],
  garden_ladder: ["Anlegeleiter", 0.5, 0.6, 2.0],
  garden_freezer: ["Gefriertruhe", 1.0, 0.65, 0.85],
  garden_crates: ["Getränkekisten", 0.8, 0.6, 0.9],
  garden_jerrycan: ["Kanister", 0.7, 0.3, 0.5],
  garden_bike_hook: ["Fahrradhalter (Wand)", 0.12, 0.5, 0.35],
  garden_garage_shelf: ["Garagenregal mit Kisten", 1.2, 0.45, 1.8],
  garden_compressor: ["Kompressor", 0.65, 0.3, 0.65],
};

// Drinnen: Hydroponik & Anzucht
const HYDRO = {
  garden_hydro_tower: ["Hydroponik-Turm", 0.5, 0.5, 1.6],
  garden_hydro_nft: ["Hydroponik-Rinnenanlage (NFT)", 1.8, 0.7, 1.1],
  garden_growbox: ["Growbox / Anzuchtzelt", 1.2, 1.2, 2.0],
  garden_seed_rack: ["Anzuchtregal mit LED-Leisten", 1.2, 0.5, 1.7],
  garden_microgreens: ["Mikrogrün-Regal", 0.9, 0.35, 1.2],
  garden_nutrient_tank: ["Nährstofftank mit Pumpe", 0.55, 0.45, 0.7],
  garden_aquaponics: ["Aquaponik-Becken", 1.4, 0.6, 1.2],
};

/** Wandtypen: Standardhöhe der Unterkante über dem Boden (m). */
const WALL_MOUNT = { garden_pegboard: 1.0, garden_tap: 0.55, garden_house_number: 1.5, garden_bike_hook: 1.6 };

/** Typen, die an Wänden einrasten sollen: Wandmontage plus Werkstattmöbel, die an der Wand stehen. */
const AGAINST_WALL = ["garden_workbench", "garden_rack_heavy", "garden_tire_rack", "garden_freezer", "garden_garage_shelf", "garden_ladder", "garden_microgreens", "garden_seed_rack"];

const OUTDOOR = ["Gartenmöbel", "Beet & Gewächshaus", "Spiel & Freizeit", "Hof & Einfahrt"];

export const GARDEN_PACK = {
  items: { ...SEATING, ...BEDS, ...PLAY, ...YARD, ...GARAGE, ...HYDRO },
  categories: [
    ["Gartenmöbel", Object.keys(SEATING)],
    ["Beet & Gewächshaus", Object.keys(BEDS)],
    ["Spiel & Freizeit", Object.keys(PLAY)],
    ["Hof & Einfahrt", Object.keys(YARD)],
    ["Garage & Werkstatt", Object.keys(GARAGE)],
    ["Hydroponik & Anzucht", Object.keys(HYDRO)],
  ],
  mount: WALL_MOUNT,
  // draußen steht alles frei; in Garage und Hydroponik nur, was nicht an der Wand steht
  free: Object.keys({ ...SEATING, ...BEDS, ...PLAY, ...YARD, ...GARAGE, ...HYDRO }).filter((k) => !(k in WALL_MOUNT) && !AGAINST_WALL.includes(k)),
  outdoor: OUTDOOR,
};
