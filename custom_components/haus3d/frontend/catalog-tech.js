// Katalog „Steckdosen & Schalter, Heizungsraum, Server & NAS“ (ohne Three.js, mit node testbar): Typen mit Namen und Standardmaßen,
// Kategorien, Montagehöhen und frei stehende Typen. Die Modelle bauen furniture-tech.js und seine Teilmodule; der Einbau in
// Schränke (Höheneinheiten) steht in rack.js.

/** Eine Höheneinheit (HE) im 19-Zoll-Gestell in m. */
export const HE = 0.0445;
/** Breite eines 19-Zoll-Geräts (Frontplatte mit Ohren) in m. */
export const RACK_W = 0.482;

const r4 = (v) => Math.round(v * 10000) / 10000;

// ------------------------------------------------------------------ Steckdosen & Schalter (flache Wandtypen)

const WALL_ITEMS = {
  tech_socket: ["Steckdose", 0.08, 0.02, 0.08],
  tech_socket_double: ["Doppelsteckdose", 0.08, 0.02, 0.153],
  tech_socket_triple: ["Dreifachsteckdose (waagerecht)", 0.226, 0.02, 0.08],
  tech_socket_usb: ["Steckdose mit USB", 0.08, 0.02, 0.08],
  tech_socket_outdoor: ["Außensteckdose mit Klappe", 0.09, 0.055, 0.1],
  tech_stove_outlet: ["Herdanschlussdose", 0.1, 0.035, 0.1],
  tech_switch: ["Lichtschalter", 0.08, 0.02, 0.08],
  tech_switch_double: ["Serienschalter", 0.08, 0.02, 0.08],
  tech_dimmer: ["Dimmer (Drehknopf)", 0.08, 0.03, 0.08],
  tech_button: ["Taster", 0.08, 0.02, 0.08],
  tech_blind_switch: ["Jalousieschalter", 0.08, 0.02, 0.08],
  tech_network_outlet: ["Netzwerkdose (2× RJ45)", 0.08, 0.02, 0.08],
  tech_antenna_outlet: ["Antennen-/SAT-Dose", 0.08, 0.02, 0.08],
  tech_motion_sensor: ["Bewegungsmelder (Wand)", 0.09, 0.06, 0.11],
  tech_smart_switch: ["Smart-Wandtaster (4 Tasten)", 0.086, 0.015, 0.086],
  tech_thermostat: ["Wandthermostat", 0.08, 0.025, 0.08],
  tech_smoke_detector: ["Rauchmelder (Decke)", 0.1, 0.1, 0.04],
  tech_doorbell: ["Klingeltaster / Türsprechstelle (außen)", 0.1, 0.03, 0.16],
};

/** Standardhöhe der Unterkante über dem Boden (m); Rauchmelder unter der Decke. */
const WALL_MOUNT = {
  tech_socket: 0.3, tech_socket_double: 0.3, tech_socket_triple: 0.3, tech_socket_usb: 0.3, tech_socket_outdoor: 0.4, tech_stove_outlet: 0.6,
  tech_switch: 1.05, tech_switch_double: 1.05, tech_dimmer: 1.05, tech_button: 1.05, tech_blind_switch: 1.05,
  tech_network_outlet: 0.3, tech_antenna_outlet: 0.3, tech_motion_sensor: 2.0, tech_smart_switch: 1.05, tech_thermostat: 1.05,
  tech_smoke_detector: "ceiling", tech_doorbell: 1.2,
};

// ------------------------------------------------------------------ Heizungsraum

const HEAT_ITEMS = {
  tech_buffer: ["Pufferspeicher", 0.85, 0.85, 1.95],
  tech_gas_boiler: ["Gastherme (Wand)", 0.4, 0.3, 0.72],
  tech_condensing_boiler: ["Brennwertkessel (stehend)", 0.6, 0.75, 1.5],
  tech_pellet_boiler: ["Pelletkessel mit Vorratsbehälter", 1.1, 0.8, 1.5],
  tech_pellet_store: ["Pelletlager (Gewebetank)", 2.2, 2.2, 2.0],
  tech_oil_tank: ["Öltank (Kunststoff, 2er-Batterie)", 2.0, 0.8, 1.4],
  tech_expansion_vessel: ["Ausdehnungsgefäß (rot, Wand)", 0.3, 0.3, 0.42],
  tech_floor_manifold: ["Fußbodenheizungs-Verteiler (Wand)", 0.6, 0.12, 0.4],
  tech_circuit_manifold: ["Heizkreisverteiler mit Pumpengruppen", 0.9, 0.25, 0.95],
  tech_water_works: ["Hauswasserwerk", 0.5, 0.3, 0.55],
  tech_softener: ["Enthärtungsanlage", 0.35, 0.5, 0.85],
  tech_water_filter: ["Hauswasserfilter (Wand)", 0.25, 0.15, 0.4],
  tech_water_meter: ["Wasserzähler (Wand)", 0.2, 0.1, 0.1],
  tech_ventilation: ["Lüftungsgerät (KWL, Wand)", 0.6, 0.35, 0.75],
  tech_hydromodule: ["Wärmepumpe Inneneinheit / Hydromodul", 0.6, 0.65, 1.8],
  tech_solar_station: ["Solarstation", 0.3, 0.2, 0.5],
  tech_dehumidifier: ["Luftentfeuchter", 0.35, 0.25, 0.6],
  tech_circ_pump: ["Zirkulationspumpe", 0.2, 0.12, 0.15],
  tech_pipe_group: ["Heizungs-Rohrgruppe mit Dämmung", 0.8, 0.14, 0.4],
};

const HEAT_MOUNT = {
  tech_gas_boiler: 1.0, tech_expansion_vessel: 0.5, tech_floor_manifold: 0.8, tech_circuit_manifold: 0.6, tech_water_filter: 0.8,
  tech_water_meter: 0.8, tech_ventilation: 1.0, tech_solar_station: 1.0, tech_circ_pump: 0.9, tech_pipe_group: 1.0,
};

// ------------------------------------------------------------------ Server & NAS

/** 19-Zoll-Einbaugeräte: Typ → [Name, HE, Tiefe in m]; Breite 0,482 m, Höhe = HE × 0,0445 m. */
export const RACK_UNITS = {
  tech_srv_1u: ["Server 1 HE", 1, 0.5],
  tech_srv_2u: ["Server 2 HE", 2, 0.65],
  tech_srv_4u: ["Server 4 HE (Storage)", 4, 0.7],
  tech_nas_rack: ["Rack-NAS 2 HE (12 Einschübe)", 2, 0.5],
  tech_switch_24: ["Switch 1 HE (24 Ports)", 1, 0.28],
  tech_switch_poe: ["PoE-Switch 1 HE", 1, 0.35],
  tech_patch_panel: ["Patchfeld 1 HE", 1, 0.1],
  tech_firewall: ["Firewall / Router 1 HE", 1, 0.25],
  tech_ups_2u: ["USV 2 HE", 2, 0.45],
  tech_pdu: ["Steckdosenleiste 1 HE", 1, 0.05],
  tech_rack_shelf: ["Fachboden 1 HE", 1, 0.45],
  tech_blank_panel: ["Blindblende 1 HE", 1, 0.02],
  tech_cable_mgmt: ["Kabelführung 1 HE", 1, 0.06],
  tech_blank_panel_2u: ["Blindblende 2 HE", 2, 0.02],
  tech_brush_panel: ["Bürstenleiste 1 HE (Kabeldurchführung)", 1, 0.03],
  tech_kvm: ["KVM-Konsole 1 HE", 1, 0.45],
};

/** Höheneinheiten je 19-Zoll-Typ. */
export const RACK_HE = Object.fromEntries(Object.entries(RACK_UNITS).map(([k, [, he]]) => [k, he]));

/** Tischgeräte (Typ → [Name, w, d, h]); sie stehen im Schrank auf einem Fachboden. */
const DESK_ITEMS = {
  tech_nas_2bay: ["NAS 2-Bay", 0.11, 0.23, 0.165],
  tech_nas_5bay: ["NAS 5-Bay", 0.16, 0.24, 0.23],
  tech_nas_8bay: ["NAS 8-Bay", 0.29, 0.35, 0.22],
  tech_mini_pc: ["Mini-PC", 0.12, 0.12, 0.05],
  tech_sbc: ["Einplatinenrechner im Gehäuse", 0.09, 0.065, 0.03],
  tech_tower_server: ["Tower-Server", 0.22, 0.5, 0.43],
  tech_switch_8: ["Desktop-Switch 8 Port", 0.16, 0.1, 0.03],
  tech_wifi_router: ["WLAN-Router", 0.22, 0.15, 0.2],
  tech_ap_ceiling: ["Access Point (Decke)", 0.2, 0.2, 0.035],
  tech_modem: ["Kabelmodem / Glasfasermodem", 0.17, 0.12, 0.045],
  tech_ups_tower: ["USV (Tower)", 0.16, 0.35, 0.23],
};

/** Tischgeräte, die in einen Schrank passen (alle außer dem Access Point an der Decke) – dazu das vorhandene „nas“. */
export const RACK_DESK = Object.keys(DESK_ITEMS).filter((k) => k !== "tech_ap_ceiling").concat("nas");

/** Dicke des Fachbodens unter einem Tischgerät im Schrank (m). */
export const SHELF = 0.01;

const RACK_ITEMS = Object.fromEntries(Object.entries(RACK_UNITS).map(([k, [name, he, d]]) => [k, [name, RACK_W, d, r4(he * HE)]]));

export const TECH_PACK = {
  items: { ...WALL_ITEMS, ...HEAT_ITEMS, ...RACK_ITEMS, ...DESK_ITEMS },
  categories: [
    ["Steckdosen & Schalter", Object.keys(WALL_ITEMS)],
    ["Heizungsraum", Object.keys(HEAT_ITEMS)],
    ["Server & NAS", [...Object.keys(RACK_ITEMS), ...Object.keys(DESK_ITEMS)]],
  ],
  mount: { ...WALL_MOUNT, ...HEAT_MOUNT, tech_ap_ceiling: "ceiling" },
  // 19-Zoll-Geräte und Tischgeräte stehen frei (im Schrank, auf Tisch oder Boden), der Rauchmelder hängt an der Decke
  free: [...Object.keys(RACK_ITEMS), ...Object.keys(DESK_ITEMS), "tech_smoke_detector"],
  outdoor: [],
};
