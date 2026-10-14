// Katalog „Wohnen, Küche, Kamin, Vorhänge“ (ohne Three.js, mit node testbar): Typen mit Namen und Standardmaßen, Kategorien,
// Montagehöhen und frei stehende Typen. Die Modelle baut furniture-home.js (mit furniture-home2/3/4.js).

const DESK = 0.75; // auf Sideboard, Kommode oder Fensterbank-Regal
const TABLE = 0.45; // auf dem Couchtisch bzw. der Sofalehne
const BOARD = 0.5; // auf dem TV-Board
const WORKTOP = 0.9; // auf der Arbeitsplatte
const SILL = 0.9; // Fensterbank

/** Typ → [Name, w, d, h] (m; Breite × Tiefe × Höhe, alle > 0) */
const ITEMS = {
  // Wohnen & Deko
  home_frame: ["Bilderrahmen (Wand)", 0.4, 0.03, 0.5],
  home_canvas: ["Leinwandbild (Wand, groß)", 1.2, 0.04, 0.8],
  home_gallery: ["Bildergruppe (3 Rahmen)", 1.2, 0.03, 0.6],
  home_mirror_round: ["Wandspiegel (rund)", 0.7, 0.04, 0.7],
  home_mirror_floor: ["Standspiegel", 0.5, 0.4, 1.7],
  home_books_row: ["Bücherreihe", 0.6, 0.2, 0.28],
  home_books_stack: ["Bücherstapel", 0.25, 0.2, 0.22],
  home_vase: ["Vase mit Blumen", 0.28, 0.28, 0.65],
  home_candles: ["Kerzen (Gruppe)", 0.3, 0.18, 0.3],
  home_clock: ["Wanduhr", 0.4, 0.05, 0.4],
  home_beanbag: ["Sitzsack", 0.9, 0.9, 0.65],
  home_pouf: ["Pouf", 0.5, 0.5, 0.4],
  home_side_table: ["Beistelltisch (rund)", 0.5, 0.5, 0.55],
  home_reading_chair: ["Leseecke-Sessel mit Decke", 0.85, 0.85, 0.95],
  home_rocking_chair: ["Schaukelstuhl", 0.6, 0.9, 1.0],
  home_piano: ["Klavier", 1.5, 0.65, 1.25],
  home_guitar: ["Gitarre am Ständer", 0.45, 0.4, 1.0],
  home_turntable: ["Plattenspieler mit Plattenregal", 0.8, 0.38, 0.3],
  home_magazines: ["Zeitschriftenkorb", 0.4, 0.3, 0.4],
  home_cushions: ["Kissen-Set (Sofa)", 0.8, 0.3, 0.45],
  home_blanket: ["Wolldecke", 0.5, 0.4, 0.12],
  home_screen: ["Raumteiler (Paravent)", 1.6, 0.3, 1.7],
  home_wall_shelf: ["Wandregal mit Deko", 0.9, 0.2, 0.4],
  home_globe: ["Globus", 0.35, 0.35, 0.45],
  home_fairy_lights: ["Lichterkette (Wand)", 2.0, 0.04, 0.35],
  home_rug_round: ["Teppich (rund)", 1.8, 1.8, 0.02],
  // Pflanzen
  home_monstera: ["Monstera", 0.8, 0.8, 1.2],
  home_ficus: ["Ficus", 0.7, 0.7, 1.6],
  home_kentia: ["Kentia-Palme", 0.9, 0.9, 1.8],
  home_cactus: ["Kaktus", 0.3, 0.3, 0.7],
  home_snake_plant: ["Bogenhanf", 0.35, 0.35, 0.8],
  home_orchid: ["Orchidee (Fensterbank)", 0.2, 0.2, 0.5],
  home_hanging: ["Hängepflanze (Decke)", 0.4, 0.4, 0.9],
  home_herbs: ["Kräutertöpfe (Fensterbank)", 0.5, 0.13, 0.25],
  home_olive: ["Olivenbaum im Topf", 0.8, 0.8, 1.6],
  home_plant_shelf: ["Pflanzenregal mit Töpfen", 0.8, 0.3, 1.5],
  home_plant_stand: ["Pflanzenständer", 0.4, 0.4, 0.8],
  // Küchengeräte
  home_coffee_auto: ["Kaffeevollautomat", 0.3, 0.45, 0.4],
  home_espresso: ["Siebträger-Maschine", 0.28, 0.4, 0.38],
  home_microwave: ["Mikrowelle", 0.5, 0.38, 0.3],
  home_kettle: ["Wasserkocher", 0.2, 0.25, 0.25],
  home_toaster: ["Toaster", 0.3, 0.18, 0.2],
  home_stand_mixer: ["Küchenmaschine", 0.25, 0.35, 0.35],
  home_hood_wall: ["Dunstabzugshaube (Wand)", 0.6, 0.5, 0.75],
  home_hood_island: ["Inselhaube (Decke)", 0.9, 0.5, 0.8],
  home_oven_tall: ["Hochschrank mit Backofen", 0.6, 0.6, 2.1],
  home_wine_fridge: ["Weinkühlschrank", 0.6, 0.6, 0.85],
  home_spice_rack: ["Gewürzregal (Wand)", 0.5, 0.1, 0.4],
  home_fruit_bowl: ["Obstschale", 0.3, 0.3, 0.15],
  home_bread_bin: ["Brotkasten", 0.4, 0.25, 0.2],
  home_knife_block: ["Messerblock mit Utensilien", 0.3, 0.15, 0.3],
  home_herb_pot: ["Kräutertopf", 0.15, 0.15, 0.3],
  home_kitchen_cart: ["Küchenwagen", 0.6, 0.4, 0.85],
  home_bar_cart: ["Barwagen", 0.7, 0.4, 0.85],
  home_hang_rail: ["Hängeregal mit Reling", 0.8, 0.12, 0.4],
  // Kamin & Ofen
  home_stove_wood: ["Kaminofen", 0.5, 0.45, 1.1],
  home_stove_flue: ["Kaminofen mit Rohr zur Decke", 0.5, 0.45, 2.4],
  home_fireplace_open: ["Offener Kamin (gemauert)", 1.6, 0.5, 1.3],
  home_fireplace_corner: ["Eckkamin", 1.0, 1.0, 1.2],
  home_fireplace_ethanol: ["Ethanol-Wandkamin", 1.2, 0.2, 0.45],
  home_stove_pellet: ["Pelletofen", 0.5, 0.5, 1.1],
  home_stove_tile: ["Kachelofen mit Bank", 1.6, 0.65, 1.9],
  home_log_rack: ["Kaminholzregal", 0.8, 0.3, 1.0],
  home_fire_tools: ["Kaminbesteck", 0.3, 0.25, 0.7],
  // Vorhänge
  home_curtain_pair: ["Vorhang (zweiteilig)", 2.4, 0.12, 2.4],
  home_curtain_single: ["Vorhang (einseitig)", 1.4, 0.12, 2.4],
  home_sheer: ["Gardine / Store", 1.4, 0.1, 2.4],
  home_roman_blind: ["Raffrollo", 1.2, 0.14, 1.4],
  home_pleated: ["Plissee", 1.0, 0.06, 1.4],
  home_blackout: ["Thermovorhang (Verdunkelung)", 2.4, 0.12, 2.4],
  home_curtain_loops: ["Vorhang mit Schlaufen", 2.4, 0.12, 2.4],
  // Haustiere
  home_cat_tree: ["Kratzbaum", 0.6, 0.5, 1.5],
  home_dog_bed: ["Hundekorb", 0.8, 0.6, 0.25],
  home_litter_box: ["Katzenklo", 0.5, 0.4, 0.45],
  home_pet_bowls: ["Futternapf-Station", 0.5, 0.3, 0.15],
  home_aquarium: ["Aquarium mit Unterschrank", 1.0, 0.4, 1.2],
  home_bird_cage: ["Vogelkäfig mit Ständer", 0.5, 0.4, 1.4],
  home_small_pet: ["Kleintiergehege", 1.0, 0.6, 0.5],
  home_terrarium: ["Terrarium", 0.8, 0.4, 0.55],
  // Kinderzimmer
  home_crib: ["Babybett", 0.7, 1.3, 0.95],
  home_kids_bed: ["Kinderbett mit Rausfallschutz", 0.9, 2.0, 0.6],
  home_changing: ["Wickelkommode", 0.9, 0.7, 1.0],
  home_toy_chest: ["Spielzeugkiste", 0.7, 0.4, 0.45],
  home_tipi: ["Spielzelt (Tipi)", 1.0, 1.0, 1.3],
  home_play_kitchen: ["Spielküche", 0.7, 0.35, 0.9],
  home_rocking_horse: ["Schaukelpferd", 0.35, 0.8, 0.75],
  home_kids_table: ["Kinder-Tisch mit Stühlen", 1.0, 0.6, 0.55],
  home_play_rug: ["Spielteppich (Straßen)", 1.5, 1.1, 0.02],
  home_loft_bed: ["Hochbett mit Rutsche", 1.5, 2.0, 1.6],
};

/** Typen je Kategorie (Reihenfolge wie im Katalog). */
const CATEGORY_TYPES = {
  "Wohnen & Deko": ["frame", "canvas", "gallery", "mirror_round", "mirror_floor", "wall_shelf", "clock", "fairy_lights", "books_row", "books_stack", "vase", "candles", "globe", "cushions", "blanket", "magazines", "pouf", "beanbag", "side_table", "reading_chair", "rocking_chair", "piano", "guitar", "turntable", "screen", "rug_round"],
  Pflanzen: ["monstera", "ficus", "kentia", "cactus", "snake_plant", "olive", "orchid", "herbs", "hanging", "plant_shelf", "plant_stand"],
  Küchengeräte: ["coffee_auto", "espresso", "microwave", "kettle", "toaster", "stand_mixer", "fruit_bowl", "bread_bin", "knife_block", "herb_pot", "hood_wall", "hood_island", "oven_tall", "wine_fridge", "spice_rack", "hang_rail", "kitchen_cart", "bar_cart"],
  "Kamin & Ofen": ["stove_wood", "stove_flue", "stove_pellet", "fireplace_open", "fireplace_corner", "fireplace_ethanol", "stove_tile", "log_rack", "fire_tools"],
  Vorhänge: ["curtain_pair", "curtain_single", "curtain_loops", "sheer", "blackout", "roman_blind", "pleated"],
  Haustiere: ["cat_tree", "dog_bed", "litter_box", "pet_bowls", "aquarium", "bird_cage", "small_pet", "terrarium"],
  Kinderzimmer: ["crib", "kids_bed", "changing", "toy_chest", "play_kitchen", "kids_table", "tipi", "rocking_horse", "play_rug", "loft_bed"],
};

/** Standardhöhe der Unterkante über dem Boden (m); "ceiling" = Oberkante unter der Decke; sonst steht das Möbel auf dem Boden. */
const MOUNT = {
  // Wand
  home_frame: 1.4, home_canvas: 1.2, home_gallery: 1.3, home_mirror_round: 1.1, home_clock: 1.9, home_wall_shelf: 1.4, home_fairy_lights: 1.9,
  home_hood_wall: 1.55, home_spice_rack: 1.1, home_hang_rail: 1.1, home_fireplace_ethanol: 1.0,
  // auf Möbeln
  home_books_row: DESK, home_vase: DESK, home_candles: DESK, home_globe: DESK, home_books_stack: TABLE, home_cushions: TABLE, home_blanket: TABLE, home_turntable: BOARD,
  home_orchid: SILL, home_herbs: SILL, home_terrarium: DESK,
  home_coffee_auto: WORKTOP, home_espresso: WORKTOP, home_microwave: WORKTOP, home_kettle: WORKTOP, home_toaster: WORKTOP, home_stand_mixer: WORKTOP,
  home_fruit_bowl: WORKTOP, home_bread_bin: WORKTOP, home_knife_block: WORKTOP, home_herb_pot: WORKTOP,
  // unter der Decke bzw. über dem Fenster
  home_hanging: "ceiling", home_hood_island: "ceiling",
  home_curtain_pair: "ceiling", home_curtain_single: "ceiling", home_curtain_loops: "ceiling", home_sheer: "ceiling", home_blackout: "ceiling",
  home_roman_blind: 0.8, home_pleated: 0.8,
};

/** Typen ohne Einrasten an der Wand (stehen frei im Raum, liegen auf Möbeln oder hängen an der Decke). */
const FREE = [
  "home_books_row", "home_books_stack", "home_vase", "home_candles", "home_globe", "home_cushions", "home_blanket", "home_turntable", "home_magazines",
  "home_pouf", "home_beanbag", "home_side_table", "home_rocking_chair", "home_guitar", "home_screen", "home_rug_round",
  "home_monstera", "home_ficus", "home_kentia", "home_cactus", "home_snake_plant", "home_olive", "home_orchid", "home_herbs", "home_hanging", "home_plant_stand",
  "home_coffee_auto", "home_espresso", "home_microwave", "home_kettle", "home_toaster", "home_stand_mixer", "home_fruit_bowl", "home_bread_bin", "home_knife_block", "home_herb_pot",
  "home_hood_island", "home_kitchen_cart", "home_bar_cart", "home_fire_tools",
  "home_cat_tree", "home_dog_bed", "home_litter_box", "home_pet_bowls", "home_bird_cage", "home_small_pet", "home_terrarium",
  "home_tipi", "home_rocking_horse", "home_kids_table", "home_play_rug",
];

/** Typen mit Feld „Feuer an“ (Kamin & Ofen) bzw. „Geöffnet (%)“ (Vorhänge). */
export const HOME_FIRE_TYPES = CATEGORY_TYPES["Kamin & Ofen"].filter((t) => t !== "log_rack" && t !== "fire_tools").map((t) => `home_${t}`);
export const HOME_OPEN_TYPES = CATEGORY_TYPES["Vorhänge"].map((t) => `home_${t}`);

/**
 * items: Typ → [Name, w, d, h] (m; Breite × Tiefe × Höhe, alle > 0)
 * categories: [Kategorie, [Typen]] – jeder Typ genau einmal
 * mount: Typ → "ceiling" (unter der Decke) oder Zahl (Standardhöhe der Unterkante über dem Boden, m)
 * free: Typen, die nicht an Wänden einrasten (stehen frei, liegen auf dem Tisch, hängen an der Decke)
 * outdoor: Kategorien, die im Katalog unter „Draußen“ stehen
 */
export const HOME_PACK = {
  items: ITEMS,
  categories: Object.entries(CATEGORY_TYPES).map(([cat, types]) => [cat, types.map((t) => `home_${t}`)]),
  mount: MOUNT,
  free: FREE,
  outdoor: [],
};
