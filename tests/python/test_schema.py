"""Schema: weiche Prüfung neuer Felder, keine privaten IDs im Paket, Version."""

from __future__ import annotations

import json
import re
from pathlib import Path

from custom_components.haus3d.const import VERSION
from custom_components.haus3d.schema import validate_building

ROOT = Path(__file__).parents[2]
PKG = ROOT / "custom_components/haus3d"
SEED = json.loads((PKG / "haus-daten.json").read_text(encoding="utf-8"))
# Sensor-Namen aus dem Haus des Nutzers dürfen nie im öffentlichen Paket stehen
PRIVATE = re.compile(r"anker_|solix|shelly|aktuell_pv", re.I)


def _building(**settings):
    return {"version": 1, "floors": [], "settings": settings}


# Produktlisten (Katalog, Gerätevorlagen) dürfen Hersteller und Integrationen nennen – aber nie
# Entitäts-IDs mit diesen Namen und nie die übrigen privaten Kennungen
VENDOR_LISTS = {"catalog-extra.js", "energytemplates.js"}
PRIVATE_IDS = re.compile(r"\b(sensor|switch|number|select|binary_sensor|button)\.\w*(anker|solix|shelly)|shelly|aktuell_pv", re.I)


def test_no_private_ids_in_package() -> None:
    files = [PKG / "const.py", PKG / "haus-daten.json", *sorted((PKG / "frontend").glob("*.js")), ROOT / "tests/browser/harness.html"]
    hits = [str(f.relative_to(ROOT)) for f in files if (PRIVATE_IDS if f.name in VENDOR_LISTS else PRIVATE).search(f.read_text(encoding="utf-8"))]
    assert hits == []


# Marken (CONTRIBUTING.md): Hersteller- und Produktnamen nur in den Produktlisten, keine Marken-Symbole,
# keine Logos/Fotos im Paket; Haus 3D bleibt komplett kostenlos
BRAND_WORDS = re.compile(
    r"\b(ikea|playstation|xbox|nintendo|steam deck|solarbank|powerwall|unifi|ubiquiti|tibber|nordpool|awattar|epex|"
    r"fronius|senec|huawei|victron|growatt|sungrow|goodwe|deye|byd|zendure|ecoflow|marstek|hoymiles|opendtu|apsystems|"
    r"kostal|solaredge|pylontech|easee|keba|zaptec|tesla)\b",
    re.I,
)
SERIES_WORDS = re.compile(r"\b(KALLAX|BILLY|IVAR|PAX|BRIMNES|MALM|HEMNES|EKTORP|KIVIK|SÖDERHAMN|FRIHETEN|POÄNG|STRANDMON|LACK|BESTÅ|MICKE|ALEX|BEKANT|LINNMON|ADILS|MARKUS|NORDVIKEN|EKEDALEN)\b")
BRAND_ICONS = re.compile(r"mdi:(github|patreon|paypal|ko-?fi|sony|microsoft|nintendo|tesla|ikea|apple|google|amazon|steam|home-assistant)\b")


def test_brand_rules_in_package() -> None:
    files = [*sorted(PKG.glob("*.py")), *sorted((PKG / "frontend").glob("*.js"))]
    words = [f.name for f in files if f.name not in VENDOR_LISTS and (BRAND_WORDS.search(t := f.read_text(encoding="utf-8")) or SERIES_WORDS.search(t))]
    assert words == []
    icons = [f.name for f in files if BRAND_ICONS.search(f.read_text(encoding="utf-8"))]
    assert icons == []
    images = [str(f.relative_to(PKG)) for f in PKG.rglob("*") if f.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"} and f.parent.name != "brand"]
    assert images == []


def test_free_and_independent_notice() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "komplett kostenlos" in readme and "## Marken & Hinweise" in readme and "keiner Verbindung" in readme
    support = (PKG / "frontend/panel-support.js").read_text(encoding="utf-8")
    assert "schalten nichts frei" in support and "Zusatzpaket" not in support

def test_energy_defaults_empty_and_saved_ids_kept() -> None:
    b = validate_building(_building())
    assert b["settings"]["energy"]["einspeisung"] is None
    b = validate_building(_building(energy={"einspeisung": "sensor.pv_einspeisung", "extra": [{"entity": "sensor.x"}]}))
    assert b["settings"]["energy"]["einspeisung"] == "sensor.pv_einspeisung"
    assert b["settings"]["energy"]["extra"] == [{"entity": "sensor.x"}]
    # ungültiger Wert wird zu None statt den Stand abzulehnen
    assert validate_building(_building(energy={"solar": 42}))["settings"]["energy"]["solar"] is None


def test_north_normalized_softly() -> None:
    assert validate_building(_building(north=450))["settings"]["north"] == 90
    assert validate_building(_building(north="-90"))["settings"]["north"] == 270
    assert validate_building(_building(north="abc"))["settings"]["north"] == 0


def test_unknown_new_keys_never_reject() -> None:
    b = validate_building(_building(alerts={"humidity_max": "x"}, functions_seen=["flow"], kiosk={"a": 1}))
    assert b["settings"]["functions_seen"] == ["flow"]


def test_seed_is_neutral_and_valid() -> None:
    b = validate_building(SEED)
    rooms = {r["id"]: r for f in b["floors"] for r in f["rooms"]}
    assert rooms["gartenhaus"]["energy_role"] == "balkonkraftwerk"
    assert all(v is None for v in b["settings"]["energy"].values() if not isinstance(v, list))


def test_manifest_version_matches() -> None:
    manifest = json.loads((PKG / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["version"] == VERSION


def test_frontend_files_stay_small() -> None:
    # über 128 KiB hängt die Auslieferung im Test-Webserver; große Teile in eigene Module auslagern
    big = {f.name: f.stat().st_size for f in (PKG / "frontend").glob("*.js") if f.stat().st_size > 125_000}
    assert big == {}


def test_energy_card_keys_kept_and_coerced() -> None:
    energy = {
        "netz": "sensor.netz_leistung",
        "netz_invert": "true",
        "akku_invert": True,
        "akku_kapazitaet": "1.6",
        "akku_reserve": 250,
        "kurz": "akku",
        "ueberschuss": {"hoch": "800", "mittel": "abc"},
        "pv_zaehler": 5,
    }
    e = validate_building(_building(energy=energy))["settings"]["energy"]
    assert e["netz"] == "sensor.netz_leistung"
    assert e["netz_invert"] is True and e["akku_invert"] is True
    assert e["akku_kapazitaet"] == 1.6
    assert e["akku_reserve"] == 10  # außerhalb 0..100 → Standard
    assert e["kurz"] == "akku"
    assert e["ueberschuss"] == {"hoch": 800.0, "mittel": 150}
    assert e["pv_zaehler"] is None
    assert validate_building(_building(energy={"kurz": "quatsch", "ueberschuss": 3}))["settings"]["energy"]["kurz"] == ""


def test_pipes_validated() -> None:
    raw = _building()
    raw["floors"] = [{"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": []}]
    raw["floors"][0]["pipes"] = [{"id": "leitung", "type": "strom", "points": [[0, 0], [1, 0]], "heights": [0.03, 0.3], "room": "r1"}]
    pipe = validate_building(raw)["floors"][0]["pipes"][0]
    assert pipe["entity"] is None and pipe["heights"] == [0.03, 0.3]
    raw["floors"][0]["pipes"] = [{"id": "x", "type": "gas", "points": [[0, 0], [1, 0]]}]
    try:
        validate_building(raw)
    except Exception:  # noqa: BLE001
        return
    raise AssertionError("unbekannter Leitungstyp angenommen")


def test_pipe_nodes_validated() -> None:
    raw = _building()
    raw["floors"] = [{"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [],
                      "pipes": [{"id": "lan", "type": "netzwerk", "points": [[0, 0], [1, 0]], "device": "device_tracker.tv"}],
                      "nodes": [{"id": "hv", "kind": "hv", "x": 0, "z": 0}, {"id": "d", "kind": "durch", "x": 1, "z": 1, "link": "d2"}]}]
    floor = validate_building(raw)["floors"][0]
    assert floor["pipes"][0]["device"] == "device_tracker.tv"
    assert floor["nodes"][1]["link"] == "d2" and floor["nodes"][0]["entity"] is None
    raw["floors"][0]["nodes"] = [{"id": "x", "kind": "kraftwerk", "x": 0, "z": 0}]
    try:
        validate_building(raw)
    except Exception:  # noqa: BLE001
        return
    raise AssertionError("unbekannte Verteiler-Art angenommen")


def test_title_attic_and_frame_color_soft() -> None:
    raw = _building(title="Villa am See")
    raw["floors"] = [{"id": "dg", "name": "DG", "elevation": 2.75, "height": 2.4, "attic": True, "knee": 1.2,
                      "rooms": [{"id": "r", "name": "Zimmer", "points": [[0, 0], [4, 0], [4, 3], [0, 3]]}],
                      "openings": [{"id": "o", "room_id": "r", "edge": 0, "offset": 2, "width": 1, "height": 1.2, "type": "window", "frame_color": "#3a3a3a"}]}]
    out = validate_building(raw)
    floor = out["floors"][0]
    assert out["settings"]["title"] == "Villa am See"
    assert floor["attic"] is True and floor["knee"] == 1.2
    assert floor["openings"][0]["frame_color"] == "#3a3a3a"
    # ungültige Werte machen den Stand nicht kaputt, sie fallen auf den Standard zurück
    raw["settings"]["title"] = "x" * 200
    raw["floors"][0]["knee"] = 99
    raw["floors"][0]["openings"][0]["frame_color"] = "rot"
    out = validate_building(raw)
    assert out["settings"]["title"] is None
    assert out["floors"][0]["knee"] == 1.0
    assert out["floors"][0]["openings"][0]["frame_color"] is None


def test_new_soft_fields_023() -> None:
    """0.23: Grundeinstellungen, Lichtschacht, Info-Hologramm, Raster, Abzweigdose, Verbindungspunkte."""
    room = {"id": "r", "name": "R", "points": [[0, 0], [4, 0], [4, 3], [0, 3]]}
    win = {"id": "o", "room_id": "r", "edge": 0, "offset": 1, "width": 1, "type": "window", "height": 1}
    floor = {
        "id": "kg", "name": "KG", "elevation": -2.5, "height": 2.3, "rooms": [room],
        "openings": [{**win, "well": {"depth": 0.5}}, {**win, "id": "o2", "well": {"depth": 9}}],
        "furniture": [
            {"id": "m", "type": "printer_3d", "x": 1, "z": 1, "info": [{"entity": "sensor.druck"}], "cols": "3", "rows": 99},
            {"id": "m2", "type": "nas", "x": 2, "z": 1, "info": [{"entity": "sensor.x"}] * 7},
            {"id": "m3", "type": "nas", "x": 2, "z": 2, "info": [{"entity": "sensor.x"}] * 6},
        ],
        "pipes": [{"id": "p", "type": "strom", "points": [[0, 0], [1, 0], [2, 0]], "joints": [1]}, {"id": "p2", "type": "strom", "points": [[0, 0], [1, 1]], "joints": "kaputt"}],
        "nodes": [{"id": "n", "kind": "abzweig", "x": 1, "z": 0, "model": False}, {"id": "n2", "kind": "hv", "x": 0, "z": 0, "model": "vielleicht"}],
    }
    b = validate_building({"version": 1, "floors": [floor], "settings": {"setup_done": True}})
    f = b["floors"][0]
    assert b["settings"]["setup_done"] is True
    assert f["openings"][0]["well"] == {"depth": 0.5, "width": None}
    assert f["openings"][1]["well"] is None  # ungültig → weich ersetzt, Stand bleibt gültig
    assert f["furniture"][0]["info"] == [{"entity": "sensor.druck", "name": None}] and f["furniture"][0]["cols"] == 3 and f["furniture"][0]["rows"] is None
    assert f["furniture"][1]["info"] is None  # mehr als 6 Werte
    assert len(f["furniture"][2]["info"]) == 6
    assert f["pipes"][0]["joints"] == [1] and f["pipes"][1]["joints"] is None
    assert f["nodes"][0]["kind"] == "abzweig" and f["nodes"][0]["model"] is False and f["nodes"][1]["model"] is True
    assert validate_building({"version": 1, "floors": [], "settings": {"setup_done": "ja"}})["settings"]["setup_done"] is False


def test_stair_hole_fields_023() -> None:
    """0.23: eigene Deckenöffnung einer Treppe, Geländer an der Öffnung, rundes Treppenloch – weich geprüft."""
    stairs = {"id": "t", "type": "stairs", "x": 1, "z": 1, "stair_shape": "spiral_right", "railing": "outer"}
    floor = {
        "id": "kg", "name": "KG", "elevation": -2.6, "height": 2.4, "rooms": [],
        "furniture": [
            {**stairs, "hole": {"w": "1.2", "d": 2, "dx": 0.1}, "hole_railing": "glass"},
            {**stairs, "id": "t2", "hole": {"w": -1}, "hole_railing": "gold"},
            {**stairs, "id": "t3", "hole_railing": "none"},
            {"id": "l", "type": "stairwell", "x": 3, "z": 3, "hole_round": "vielleicht"},
            {"id": "l2", "type": "stairwell", "x": 4, "z": 3, "hole_round": True},
            {**stairs, "id": "alt", "stair_shape": "straight", "railing": "left"},
            {**stairs, "id": "gross", "hole": {"w": 25, "d": "1e9", "dx": -30, "dz": 0.5, "round": True}},
            {**stairs, "id": "nan", "hole": {"w": "nan", "d": 2}},
        ],
    }
    f = validate_building({"version": 1, "floors": [floor]})["floors"][0]
    t, t2, t3, well, well2, old, big, nan = f["furniture"]
    # zu große Öffnung: Maße auf den Rand, die übrigen Angaben bleiben (statt still „automatisch“)
    assert big["hole"] == {"w": 20.0, "d": 20.0, "dx": -20.0, "dz": 0.5, "round": True}
    assert nan["hole"] is None
    assert t["hole"] == {"w": 1.2, "d": 2.0, "dx": 0.1, "dz": 0.0, "round": False}
    assert t["hole_railing"] == "glass"
    assert t["stair_shape"] == "spiral_right" and t["railing"] == "outer"
    assert t2["hole"] is None and t2["hole_railing"] is None
    assert t3["hole_railing"] == "none"
    assert well["hole_round"] is False and well2["hole_round"] is True
    # alte Treppe ohne die neuen Schlüssel bleibt ohne sie
    assert not {"hole", "hole_railing", "hole_round"} & set(old)


def test_furniture_orient_soft() -> None:
    """0.23b2: Modullage der Solarzäune – weich geprüft, fehlt = quer (ohne Schlüssel)."""
    floor = {
        "id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [],
        "furniture": [
            {"id": "z", "type": "pv_fence_vertical", "x": 1, "z": 1, "orient": "portrait", "cols": 4, "rows": 2},
            {"id": "z2", "type": "pv_fence_mesh", "x": 2, "z": 1, "orient": "kaputt"},
            {"id": "z3", "type": "pv_fence_privacy", "x": 3, "z": 1},
        ],
    }
    f = validate_building({"version": 1, "floors": [floor], "settings": {}})["floors"][0]
    z, z2, z3 = f["furniture"]
    assert z["orient"] == "portrait" and z["cols"] == 4 and z["rows"] == 2
    assert z2["orient"] is None  # ungültig → weich ersetzt, Stand bleibt gültig
    assert "orient" not in z3 and "cols" not in z3


def test_node_rotation_soft() -> None:
    """0.23: Drehung eines Verteilers weich geprüft; fehlt sie, bleibt sie weg (ältere Stände unverändert)."""
    nodes = [
        {"id": "a", "kind": "hv", "x": 0, "z": 0, "rotation": 450},
        {"id": "b", "kind": "uv", "x": 1, "z": 0, "rotation": "quer"},
        {"id": "c", "kind": "router", "x": 2, "z": 0},
        {"id": "d", "kind": "switch", "x": 3, "z": 0, "rotation": None},
    ]
    floor = {"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [], "nodes": nodes}
    out = validate_building({"version": 1, "floors": [floor], "settings": {}})["floors"][0]["nodes"]
    assert out[0]["rotation"] == 90.0
    assert out[1]["rotation"] == 0
    assert "rotation" not in out[2]
    assert out[3]["rotation"] == 0


def test_arrow_values_saved() -> None:
    """0.23b2: Werte der 3D-Pfeile bleiben beim Speichern erhalten (Höhe als mount_y, Verteiler-Höhe, Rand der Koordinaten)."""
    floor = {
        "id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [],
        "furniture": [{"id": "m", "type": "lamp_wall", "x": 999.5, "z": -999.5, "rotation": 0, "mount_y": 0.45}],
        "nodes": [
            {"id": "a", "kind": "hv", "x": 999.5, "z": 0, "y": 1.25},
            {"id": "b", "kind": "abzweig", "x": 1, "z": -999.5, "y": 2.5},
        ],
    }
    out = validate_building({"version": 1, "floors": [floor], "settings": {}})["floors"][0]
    m = out["furniture"][0]
    assert m["mount_y"] == 0.45 and m["x"] == 999.5 and m["z"] == -999.5
    assert out["nodes"][0]["y"] == 1.25 and out["nodes"][0]["x"] == 999.5
    assert out["nodes"][1]["y"] == 2.5 and out["nodes"][1]["z"] == -999.5


def test_roof_soft_clamped_and_room_roof() -> None:
    """0.23b2: Hausdach weich (begrenzt statt abgelehnt), eigenes Dach eines Raums weich und ohne Standardwerte."""

    def house(**roof):
        return validate_building(_building(roof=roof))["settings"]["roof"]

    assert house(type="gable", pitch=80)["pitch"] == 60.0
    assert house(pitch="steil")["pitch"] == 35.0
    assert house(pitch=0)["pitch"] == 35.0
    assert house(pitch=True)["pitch"] == 35.0
    assert house(overhang=5)["overhang"] == 1.5
    assert house(overhang=0)["overhang"] == 0.0
    assert house(type="quatsch")["type"] == "none"
    assert house(direction="y")["direction"] == "auto"
    assert house(direction="cross")["direction"] == "auto"
    assert house(floor=5)["floor"] is None
    assert house(floor="og")["floor"] == "og"
    assert house(rooms="x")["rooms"] is None
    assert house(rooms=["a", "b"])["rooms"] == ["a", "b"]
    assert house() == {"type": "none", "pitch": 35.0, "overhang": 0.4, "direction": "auto"}

    def own(roof):
        room = {"id": "r", "name": "R", "points": [[0, 0], [4, 0], [4, 3], [0, 3]], "roof": roof}
        floor = {"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [room]}
        return validate_building({"version": 1, "floors": [floor], "settings": {}})["floors"][0]["rooms"][0]["roof"]

    pv = {"id": "pv_1", "type": "pv", "x": 1, "z": 1}
    r = own({"type": "gable", "pitch": "steil", "overhang": 9, "separate": "ja", "items": [pv], "adjust": [None, {"a": -0.5}]})
    assert r["pitch"] is None and r["overhang"] == 1.5 and r["separate"] is False
    assert r["items"] == [pv] and r["adjust"] == [None, {"a": -0.5}]
    assert own({"type": "gable", "pitch": 0})["pitch"] is None
    assert own({"type": "gable", "pitch": 3})["pitch"] == 5.0
    assert own("kaputt") is None
    assert own({"type": "quatsch"})["type"] == "none"
    assert own({"type": "cone", "pitch": 70})["pitch"] == 70.0
    t = own({"type": "terrace", "railing": "gold", "railing_height": 9, "direction": "cross"})
    assert (t["railing"], t["railing_height"], t["direction"]) == ("glass", 2.5, "cross")
    assert own({"type": "shed", "pitch": 10}) == {"type": "shed", "pitch": 10.0}
    assert "base" not in own({"type": "gable"})
    assert own({"type": "gable", "base": 2})["base"] == 2  # alte Felder bleiben (ALLOW_EXTRA), das Frontend beachtet sie nicht


def test_roof_parts_soft() -> None:
    """0.23b2: freie Dachteile je Etage – ungültige Teile fallen einzeln weg, Felder ohne Standardwerte."""
    pts = [[0, 0], [4, 0], [4, 3]]
    parts = [
        {"id": "t", "type": "quatsch", "points": pts, "pitch": "steil", "railing": "gold", "color": "rot", "items": "x"},
        {"id": "k", "type": "cone", "points": pts, "pitch": 95, "base": -9, "items": [{"id": "pv_2", "type": "pv"}]},
        {"type": "gable", "points": pts},
        {"id": "e", "type": "gable", "points": [[0, 0]]},
    ]
    room = {"id": "r", "name": "R", "points": [[0, 0], [4, 0], [4, 3], [0, 3]]}
    floors = [
        {"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [room], "roofs": parts},
        {"id": "og", "name": "OG", "elevation": 2.75, "height": 2.5, "rooms": []},
        {"id": "dg", "name": "DG", "elevation": 5.5, "height": 2.4, "rooms": [], "roofs": "kaputt"},
    ]
    out = validate_building({"version": 1, "floors": floors, "settings": {}})["floors"]
    roofs = out[0]["roofs"]
    assert [p["id"] for p in roofs] == ["t", "k"]
    t, k = roofs
    assert (t["type"], t["pitch"], t["railing"], t["color"], t["items"]) == ("gable", None, "glass", None, [])
    assert (k["pitch"], k["base"], k["items"][0]["id"]) == (80.0, -5.0, "pv_2")
    assert all("room" not in p and "overhang" not in p for p in roofs)
    assert "roofs" not in out[1]
    assert out[2]["roofs"] == []


def test_roof_types_match_frontend() -> None:
    from custom_components.haus3d import schema

    lists: dict[str, list[str]] = {}
    for f in sorted((PKG / "frontend").glob("*.js")):
        for name, body in re.findall(r"export const (\w*ROOF\w*TYPES) = \[(.*?)\];", f.read_text(encoding="utf-8"), re.S):
            lists[name] = re.findall(r'\[\s*"(\w+)"', body) + [k for ref in re.findall(r"\.\.\.(\w+)", body) for k in lists.get(ref, [])]
    assert "gable" in lists.get("ROOF_TYPES", []) and lists.get("ROOF_PART_TYPES") and lists.get("ROOM_ROOF_TYPES")
    assert set(lists["ROOF_TYPES"]) <= set(schema.ROOF_TYPES)
    assert set(lists["ROOF_PART_TYPES"]) <= set(schema.ROOF_PART_TYPES)
    assert set(lists["ROOM_ROOF_TYPES"]) <= set(schema.ROOM_ROOF_TYPES) and "none" in lists["ROOM_ROOF_TYPES"]
