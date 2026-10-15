"""Validierung des Gebäudeformats.

Die Felder, die Haus 3D selbst benutzt, werden geprüft; alle anderen Felder bleiben
erhalten (extra=ALLOW_EXTRA), damit Zusatzfelder ohne Verlust durchgereicht werden.
"""

from __future__ import annotations

import copy
import math
from typing import Any

import voluptuous as vol

from .const import DEFAULT_ENERGY

MAX_FLOORS = 20
MAX_ROOMS = 200
MAX_POINTS = 200
MAX_ITEMS = 1000

_ID = vol.All(str, vol.Length(min=1, max=64))
_NAME = vol.All(str, vol.Length(max=100))
_COORD = vol.All(vol.Coerce(float), vol.Range(min=-1000, max=1000))
_LENGTH = vol.All(vol.Coerce(float), vol.Range(min=0, max=100))
_POINT = vol.All([_COORD], vol.Length(min=2, max=2))
_ENTITY = vol.Any(None, vol.All(str, vol.Length(max=255)))


def _soft(validator: Any, default: Any) -> Any:
    """Weiche Prüfung: ungültige Werte werden durch den Standard ersetzt statt abgelehnt.

    Ein abgelehnter Wert würde den ganzen gespeicherten Stand ungültig machen, deshalb gilt das
    für alle neueren, optionalen Einstellungen.
    """

    def check(value: Any) -> Any:
        try:
            return validator(value)
        except (vol.Invalid, ValueError, TypeError):
            return default() if callable(default) else default

    return check


def _north(value: Any) -> float:
    return round(float(value) % 360, 3)


def _open_flag(value: Any) -> Any:
    """Offen: Wahrheitswert (Whirlpool) oder Zahl (Vorhang, Stellung in %). Zahlen und Zahlen als Text („50“) werden
    als Zahl übernommen, Ja/Nein-Wörter als Wahrheitswert, alles andere ist ungültig."""
    if isinstance(value, bool) or (isinstance(value, (int, float)) and math.isfinite(value)):
        return value
    if isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            number = math.nan
        if math.isfinite(number):
            return int(number) if number.is_integer() else number
    return vol.Boolean()(value)


OPENING_TYPES = ["window", "door", "garage"]
OPENING_STYLES = [
    "interior",
    "front",
    "front_glass",
    "sidelight",
    "sidelights",
    "glass",
    "sliding",
    "passage",
    "standard",
    "bars",
]
OUTDOOR_TYPES = ["lawn", "terrace", "path", "driveway", "pool", "bed", "hedge", "fence", "balcony", "gravel", "paving", "rockery", "kerb"]
# Randstein/Kante rund um eine Gartenfläche (area.edge) bzw. Art der Randstein-Linie (type "kerb")
KERB_EDGES = ["none", "concrete", "granite", "metal", "palisade", "paver"]
ROOF_TYPES = ["none", "flat", "gable", "hip", "shed"]
# 0.23b2: Formen für eigene Dächer und Dachteile (wie roofshapes.js; geprüft von test_roof_types_match_frontend)
ROOF_PART_TYPES = ["flat", "shed", "gable", "hip", "pyramid", "mansard", "halfhip", "cone", "terrace"]
ROOM_ROOF_TYPES = ["none", *ROOF_PART_TYPES]
_HEX = vol.Match(r"^#[0-9a-fA-F]{6}$")


def _clamp(lo: float, hi: float, default: Any, *, zero_default: bool = False) -> Any:
    """Zahl weich prüfen: außerhalb des Bereichs auf den Rand setzen (so zeichnet das Frontend). Keine
    endliche Zahl – mit zero_default auch 0, wie „Number(x) || Standard“ im Frontend – → Standard."""

    def check(value: Any) -> float:
        if isinstance(value, bool):
            raise vol.Invalid("Wahrheitswert statt Zahl")
        v = float(value)
        if not math.isfinite(v) or (zero_default and v == 0):
            raise vol.Invalid("Standard")
        return min(float(hi), max(float(lo), v))

    return _soft(check, default)


def _angle(*, half: bool) -> Any:
    """Winkel in Grad weich prüfen: modulo 360 (half: −180 … 180 wie Neigen/Kippen, sonst 0 … 360 wie die
    Drehung einer Textur), auf 0,001° gerundet. Keine endliche Zahl → None (das Frontend nimmt 0)."""

    def check(value: Any) -> float:
        if isinstance(value, bool):
            raise vol.Invalid("Wahrheitswert statt Zahl")
        v = float(value)
        if not math.isfinite(v):
            raise vol.Invalid("keine endliche Zahl")
        a = round(round(v, 3) % 360, 3) % 360
        if half and a > 180:
            a -= 360
        return round(a, 3) + 0.0

    return _soft(check, None)


def _soft_list(max_len: int) -> Any:
    """Liste ohne Prüfung der Einträge (Dinge auf dem Dach, Kanten-Anpassungen); keine Liste → leere Liste."""
    return _soft(vol.All(list, vol.Length(max=max_len)), list)


def _soft_items(schema: Any, max_len: int = MAX_ITEMS) -> Any:
    """Liste weich prüfen: ungültige Einträge fallen einzeln weg, statt den Stand abzulehnen."""

    def check(value: Any) -> list:
        if not isinstance(value, list):
            return []
        out = []
        for item in value[:max_len]:
            try:
                out.append(schema(item))
            except (vol.Invalid, ValueError, TypeError):
                continue
        return out

    return check


ROOF_SCHEMA = vol.Schema(
    {
        vol.Optional("type", default="none"): _soft(vol.In(ROOF_TYPES), "none"),
        vol.Optional("pitch", default=35): _clamp(5, 60, 35, zero_default=True),
        vol.Optional("overhang", default=0.4): _clamp(0, 1.5, 0.4),
        vol.Optional("direction", default="auto"): _soft(vol.In(["auto", "x", "z"]), "auto"),
        # 0.23b2: „Hausdach sitzt auf“ und „Räume unter dem Hausdach“ (Dach-Ebene)
        vol.Optional("floor"): _soft(vol.Any(None, _ID), None),
        vol.Optional("rooms"): _soft(vol.Any(None, vol.All([_ID], vol.Length(max=MAX_ROOMS))), None),
    },
    extra=vol.ALLOW_EXTRA,
)

# 0.23b2: gemeinsame Felder eigener Dächer und Dachteile – alle weich und ohne Standardwert (alte Stände bleiben gleich).
# Neigung ungültig oder 0 → None: das Frontend nimmt den Standard der Dachform (35 bzw. PART_PITCH).
_ROOF_SHAPE_FIELDS = {
    vol.Optional("pitch"): _clamp(5, 80, None, zero_default=True),
    vol.Optional("overhang"): _clamp(0, 1.5, 0.4),
    vol.Optional("direction"): _soft(vol.In(["auto", "cross", "x", "z"]), "auto"),
    vol.Optional("flip"): _soft(vol.Boolean(), False),
    vol.Optional("wing_end"): _soft(vol.In(["gable", "hip"]), "gable"),
    vol.Optional("pitch_low"): _clamp(20, 85, 70),
    vol.Optional("break"): _clamp(0.1, 0.9, 0.35),
    vol.Optional("ends"): _soft(vol.In(["gable", "hip"]), "gable"),
    vol.Optional("hip_ratio"): _clamp(0.1, 0.9, 0.35),
    vol.Optional("railing"): _soft(vol.In(["glass", "bars", "wood", "none"]), "glass"),
    vol.Optional("railing_height"): _clamp(0.3, 2.5, 1.0),
    vol.Optional("color"): _soft(vol.Any(None, _HEX), None),
    vol.Optional("gable_color"): _soft(vol.Any(None, _HEX), None),
    vol.Optional("items"): _soft_list(MAX_ITEMS),
    vol.Optional("adjust"): _soft_list(20),
    # Drehung des Belags der Dachterrasse (Grad)
    vol.Optional("texture_rotation"): _angle(half=False),
}

# 0.23b2: eigenes Dach eines Raums (room.roof); ohne „base“ – Raumwände haben keine eigene Höhe
ROOM_ROOF_SCHEMA = vol.Schema(
    {
        vol.Optional("type"): _soft(vol.In(ROOM_ROOF_TYPES), "none"),
        vol.Optional("separate"): _soft(vol.Boolean(), False),
        **_ROOF_SHAPE_FIELDS,
    },
    extra=vol.ALLOW_EXTRA,
)

# 0.23b2: freie Dachteile je Etage (floor.roofs)
ROOF_PART_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("type"): _soft(vol.In(ROOF_PART_TYPES), "gable"),
        vol.Required("points"): vol.All([_POINT], vol.Length(min=3, max=MAX_POINTS)),
        vol.Optional("name"): _soft(vol.Any(None, vol.All(str, vol.Length(max=60))), None),
        vol.Optional("base"): _clamp(-5, 20, 0),
        **_ROOF_SHAPE_FIELDS,
    },
    extra=vol.ALLOW_EXTRA,
)

ROOM_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("name"): _NAME,
        vol.Optional("area_id", default=None): _ENTITY,
        vol.Required("points"): vol.All([_POINT], vol.Length(min=3, max=MAX_POINTS)),
        vol.Optional("floor_material", default="wood"): vol.All(str, vol.Length(max=32)),
        # 0.23b2: eigenes Dach (weich; ungültig → kein Dach statt abgelehnter Stand)
        vol.Optional("roof"): _soft(vol.Any(None, ROOM_ROOF_SCHEMA), None),
        # Drehung der Bodentextur (Grad)
        vol.Optional("floor_texture_rotation"): _angle(half=False),
    },
    extra=vol.ALLOW_EXTRA,
)

WELL_SCHEMA = vol.Schema(
    {
        vol.Optional("depth", default=0.4): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=2)),
        vol.Optional("width", default=None): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(min=0.2, max=6))),
    },
    extra=vol.ALLOW_EXTRA,
)

OPENING_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("room_id"): _ID,
        vol.Required("edge"): vol.All(int, vol.Range(min=0, max=MAX_POINTS)),
        # Abstand der Mitte der Öffnung vom Punkt points[edge]
        vol.Required("offset"): _LENGTH,
        vol.Required("width"): _LENGTH,
        vol.Required("type"): vol.In(OPENING_TYPES),
        vol.Optional("sill", default=0.0): _LENGTH,
        vol.Required("height"): _LENGTH,
        vol.Optional("hinge", default="left"): vol.In(["left", "right"]),
        vol.Optional("swing", default="in"): vol.In(["in", "out"]),
        vol.Optional("style", default=None): vol.Any(None, vol.In(OPENING_STYLES)),
        vol.Optional("cover", default=None): _ENTITY,
        vol.Optional("contact", default=None): _ENTITY,
        vol.Optional("tilt", default=None): _soft(_ENTITY, None),
        # 0.20: eigene Rahmenfarbe (#rrggbb)
        vol.Optional("frame_color"): _soft(vol.Any(None, vol.Match(r"^#[0-9a-fA-F]{6}$")), None),
        # 0.23: Lichtschacht außen (Kellerfenster)
        vol.Optional("well"): _soft(vol.Any(None, WELL_SCHEMA), None),
    },
    extra=vol.ALLOW_EXTRA,
)

# 0.23: eigene Deckenöffnung einer Treppe (Maße im Treppen-System, Versatz von der Treppenmitte)
def _hole_len(lo: float | None, hi: float) -> Any:
    """Maß der Deckenöffnung: zu groß → auf den Rand (sonst ginge die ganze Öffnung verloren); keine endliche
    Zahl bzw. unter lo → ungültig."""

    def check(value: Any) -> float:
        v = float(value)
        if math.isnan(v) or (lo is not None and v < lo):
            raise vol.Invalid("Maß der Öffnung ungültig")
        return min(hi, max(-hi, v))

    return vol.All(vol.Coerce(float), check)


STAIR_HOLE_SCHEMA = vol.Schema(
    {
        vol.Required("w"): _hole_len(0.2, 20.0),
        vol.Required("d"): _hole_len(0.2, 20.0),
        vol.Optional("dx", default=0.0): _hole_len(None, 20.0),
        vol.Optional("dz", default=0.0): _hole_len(None, 20.0),
        vol.Optional("round", default=False): vol.Boolean(),
    },
    extra=vol.ALLOW_EXTRA,
)

# 0.23: Möbel und Geräte – Info-Hologramm (Werte über dem Gegenstand) und Raster (Würfel, Module)
FURNITURE_SCHEMA = vol.Schema(
    {
        vol.Optional("info"): _soft(
            vol.Any(None, vol.All([vol.Schema({vol.Required("entity"): vol.All(str, vol.Length(min=3, max=255)), vol.Optional("name", default=None): vol.Any(None, vol.All(str, vol.Length(max=40)))}, extra=vol.ALLOW_EXTRA)], vol.Length(max=6))),
            None,
        ),
        vol.Optional("cols"): _soft(vol.Any(None, vol.All(vol.Coerce(int), vol.Range(min=1, max=20))), None),
        vol.Optional("rows"): _soft(vol.Any(None, vol.All(vol.Coerce(int), vol.Range(min=1, max=20))), None),
        # 0.23: Treppe – eigene Deckenöffnung, Geländer an der Öffnung (fehlt = automatisch); Treppenloch rund
        vol.Optional("hole"): _soft(vol.Any(None, STAIR_HOLE_SCHEMA), None),
        vol.Optional("hole_railing"): _soft(vol.Any(None, vol.In(["none", "bars", "glass", "wood"])), None),
        vol.Optional("hole_round"): _soft(vol.Boolean(), False),
        # 0.23b2: Modullage der Solarzäune (fehlt = quer)
        vol.Optional("orient"): _soft(vol.Any(None, vol.In(["portrait", "landscape"])), None),
        # eigenes 3D-Modell (Kennung der hochgeladenen Datei) und Einpassen (fehlt = Seitenverhältnis behalten)
        vol.Optional("model"): _soft(vol.Any(None, vol.All(str, vol.Match(r"^[0-9a-f]{16}\Z"))), None),
        vol.Optional("fit"): _soft(vol.Any(None, vol.In(["keep", "stretch"])), None),
        # Neigen (Oberseite nach hinten) und Kippen (nach rechts) in Grad, −180 … 180; fehlt = 0
        vol.Optional("tilt"): _angle(half=True),
        vol.Optional("roll"): _angle(half=True),
        # Whirlpool – Abdeckung offen (fehlt/false = abgedeckt)
        vol.Optional("open"): _soft(_open_flag, False),
    },
    extra=vol.ALLOW_EXTRA,
)

PLACEMENT_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): vol.All(str, vol.Length(max=255)),
        vol.Required("x"): _COORD,
        vol.Required("z"): _COORD,
        vol.Optional("y", default=None): vol.Any(None, _LENGTH),
    },
    extra=vol.ALLOW_EXTRA,
)

OUTDOOR_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("type"): vol.In(OUTDOOR_TYPES),
        vol.Required("points"): vol.All([_POINT], vol.Length(min=3, max=MAX_POINTS)),
        # Drehung der Textur (Grad)
        vol.Optional("texture_rotation"): _angle(half=False),
        # Randstein/Kante (weich: ungültige Art → keine) und Höhe über der Fläche in m (fehlt oder 0 = Standard der Art)
        vol.Optional("edge"): _soft(vol.In(KERB_EDGES), "none"),
        vol.Optional("edge_h"): _clamp(0.005, 0.6, None, zero_default=True),
    },
    extra=vol.ALLOW_EXTRA,
)


def _pipe_end(value: Any) -> dict[str, Any]:
    """Bezug eines Leitungsendes: genau eins von furniture (ID eines Möbelstücks) oder entity (platziertes Gerät)."""
    if not isinstance(value, dict):
        raise vol.Invalid("Bezug ist kein Objekt")
    furniture, entity = value.get("furniture"), value.get("entity")
    if (furniture is None) == (entity is None):
        raise vol.Invalid("genau ein Bezug")
    if furniture is not None:
        _ID(furniture)
    elif not (isinstance(entity, str) and 3 <= len(entity) <= 255 and "." in entity):
        raise vol.Invalid("Entität ungültig")
    return value


# Leitungsenden an Geräten (a = erster, b = letzter Punkt); ungültige Bezüge fallen einzeln weg
_PIPE_ENDS = vol.Schema(
    {
        vol.Optional("a"): _soft(vol.Any(None, _pipe_end), None),
        vol.Optional("b"): _soft(vol.Any(None, _pipe_end), None),
    },
    extra=vol.ALLOW_EXTRA,
)

PIPE_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("type"): vol.In(["strom", "wasser_kalt", "wasser_warm", "netzwerk"]),
        vol.Required("points"): vol.All([_POINT], vol.Length(min=2, max=MAX_POINTS)),
        vol.Optional("heights", default=None): vol.Any(None, vol.All([vol.Coerce(float)], vol.Length(max=MAX_POINTS))),
        vol.Optional("entity", default=None): vol.Any(None, vol.All(str, vol.Length(max=255))),
        vol.Optional("room", default=None): vol.Any(None, _ID),
        vol.Optional("device", default=None): vol.Any(None, vol.All(str, vol.Length(max=255))),
        # 0.23: Zwischenpunkte, die als Abzweig auf einer anderen Leitung liegen
        vol.Optional("joints"): _soft(vol.Any(None, vol.All([vol.All(vol.Coerce(int), vol.Range(min=0, max=MAX_POINTS))], vol.Length(max=MAX_POINTS))), None),
        # Anfang/Ende an einem Gerät (weich; ungültig → kein Bezug, der Stand bleibt gültig)
        vol.Optional("ends"): _soft(vol.Any(None, _PIPE_ENDS), None),
    },
    extra=vol.ALLOW_EXTRA,
)

# Verteiler im Leitungsnetz (Hauptverteilung, Unterverteilung, Router, Hausanschluss, Durchführung …)
NODE_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("kind"): vol.In(["hv", "uv", "einspeisung", "router", "switch", "wasser_in", "warm_in", "durch", "abzweig"]),
        vol.Required("x"): _COORD,
        vol.Required("z"): _COORD,
        vol.Optional("y", default=None): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(min=0, max=20))),
        vol.Optional("name", default=None): vol.Any(None, vol.All(str, vol.Length(max=80))),
        vol.Optional("entity", default=None): vol.Any(None, vol.All(str, vol.Length(max=255))),
        vol.Optional("link", default=None): vol.Any(None, _ID),
        # 0.23: false = nur Verbindungspunkt ohne Gegenstand
        vol.Optional("model"): _soft(vol.Boolean(), True),
        # 0.23: Drehung in Grad (Vorderseite des Gehäuses); fehlt = zur nächsten Wand (ältere Stände)
        vol.Optional("rotation"): _soft(_north, 0),
    },
    extra=vol.ALLOW_EXTRA,
)

FLOOR_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("name"): _NAME,
        vol.Required("elevation"): vol.All(vol.Coerce(float), vol.Range(min=-100, max=500)),
        vol.Required("height"): vol.All(vol.Coerce(float), vol.Range(min=1, max=20)),
        vol.Optional("cut_height", default=1.15): vol.All(vol.Coerce(float), vol.Range(min=0.2, max=20)),
        vol.Required("rooms"): vol.All([ROOM_SCHEMA], vol.Length(max=MAX_ROOMS)),
        vol.Optional("openings", default=list): vol.All([OPENING_SCHEMA], vol.Length(max=MAX_ITEMS)),
        vol.Optional("furniture", default=list): vol.All([FURNITURE_SCHEMA], vol.Length(max=MAX_ITEMS)),
        vol.Optional("placements", default=list): vol.All([PLACEMENT_SCHEMA], vol.Length(max=MAX_ITEMS)),
        vol.Optional("background", default=None): vol.Any(None, dict),
        # weich: eine Art, die diese Version nicht kennt (neuere Version), kostet nur diese Fläche, nicht den ganzen Stand
        vol.Optional("outdoor", default=list): _soft_items(OUTDOOR_SCHEMA),
        vol.Optional("pipes", default=list): vol.All([PIPE_SCHEMA], vol.Length(max=MAX_ITEMS)),
        vol.Optional("nodes", default=list): vol.All([NODE_SCHEMA], vol.Length(max=MAX_ITEMS)),
        # 0.20: Dachgeschoss (Räume unter den Dachschrägen) mit Kniestock in m
        vol.Optional("attic"): _soft(vol.Boolean(), False),
        vol.Optional("knee"): _soft(vol.All(vol.Coerce(float), vol.Range(min=0, max=3)), 1.0),
        # 0.23b2: freie Dachteile der Etage (ungültige Einträge fallen einzeln weg; zu kleine Flächen zeigt der Editor rot)
        vol.Optional("roofs"): _soft_items(ROOF_PART_SCHEMA, 200),
    },
    extra=vol.ALLOW_EXTRA,
)

_SURPLUS = vol.Schema(
    {
        vol.Optional("hoch"): _soft(vol.All(vol.Coerce(float), vol.Range(min=0, max=100000)), 600),
        vol.Optional("mittel"): _soft(vol.All(vol.Coerce(float), vol.Range(min=0, max=100000)), 150),
    },
    extra=vol.ALLOW_EXTRA,
)

ENERGY_SCHEMA = vol.Schema(
    {
        **{vol.Optional(key, default=value): _soft(_ENTITY, None) for key, value in DEFAULT_ENERGY.items()},
        # Energie-Karte 2.0: ohne Standardwert, damit der Startstand nur leere IDs enthält
        vol.Optional("netz_invert"): _soft(vol.Boolean(), False),
        vol.Optional("akku_invert"): _soft(vol.Boolean(), False),
        vol.Optional("akku_kapazitaet"): _soft(vol.Any(None, vol.All(vol.Coerce(float), vol.Range(min=0, max=1000))), None),
        vol.Optional("akku_reserve"): _soft(vol.All(vol.Coerce(float), vol.Range(min=0, max=100)), 10),
        vol.Optional("kurz"): _soft(vol.In(["", "akku", "solar", "netz", "verbrauch", "ueberschuss"]), ""),
        vol.Optional("ueberschuss"): _soft(_SURPLUS, dict),
        vol.Optional("pv_zaehler"): _soft(_ENTITY, None),
        vol.Optional("bezug_zaehler"): _soft(_ENTITY, None),
        vol.Optional("einspeise_zaehler"): _soft(_ENTITY, None),
        # 0.17: Basis (Haus, Netz getrennt) und Quellen (PV, Balkonkraftwerk, AC-Speicher)
        vol.Optional("haus"): _soft(_ENTITY, None),
        vol.Optional("netz_bezug"): _soft(_ENTITY, None),
        vol.Optional("netz_einspeisung"): _soft(_ENTITY, None),
        vol.Optional("sources"): _soft(vol.All([dict], vol.Length(max=20)), list),
    },
    extra=vol.ALLOW_EXTRA,
)

DEMO_PV_MAX_ENTRIES = 200
DEMO_PV_MAX_WATT = 100000.0
DEMO_DAY_MINUTES = 1440


def _demo_watt(value: Any) -> float:
    """Leistung in W: Zahl (auch als Text), außerhalb auf 0 … 100 000 begrenzt; sonst ungültig."""
    if isinstance(value, bool):
        raise vol.Invalid("Wahrheitswert statt Zahl")
    if isinstance(value, str):
        value = value.strip()
    number = float(value)
    if not math.isfinite(number):
        raise vol.Invalid("keine endliche Zahl")
    return round(min(DEMO_PV_MAX_WATT, max(0.0, number)), 3) + 0.0


def _demo_minute(value: Any) -> int | None:
    """Minute seit Mitternacht (0 … 1439) oder None = Sonnenauf-/-untergang; alles andere → None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value.strip() if isinstance(value, str) else value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or not 0 <= number <= DEMO_DAY_MINUTES - 1:
        return None
    return round(number)


def _demo_pv(value: Any) -> dict[str, Any]:
    """Demo-PV-Einstellungen {Schlüssel: {min, max, from, to}} weich prüfen (wie normalizeDemoSettings im Frontend).

    Unbrauchbare Einträge fallen einzeln weg; Leistung wird auf 0 … 100 000 W begrenzt und „bis“ auf mindestens
    „von“ gesetzt. Ein Zeitfenster, das vor seinem Anfang endet, fällt auf Sonnenauf-/-untergang zurück.
    """
    if not isinstance(value, dict):
        return {}
    out: dict[str, Any] = {}
    for key, entry in value.items():
        if len(out) >= DEMO_PV_MAX_ENTRIES:
            break
        if not isinstance(key, str) or not 1 <= len(key) <= 80 or not isinstance(entry, dict):
            continue
        try:
            low = _demo_watt(entry.get("min"))
            high = _demo_watt(entry.get("max"))
        except (vol.Invalid, TypeError, ValueError):
            continue
        start, end = _demo_minute(entry.get("from")), _demo_minute(entry.get("to"))
        if start is not None and end is not None and end <= start:
            start = end = None
        out[key] = {"min": low, "max": max(low, high), "from": start, "to": end}
    return out


DEMO_SCHEMA = vol.Schema({vol.Optional("pv", default=dict): _demo_pv}, extra=vol.ALLOW_EXTRA)

SETTINGS_SCHEMA = vol.Schema(
    {
        vol.Optional("wall_exterior", default=0.24): vol.All(vol.Coerce(float), vol.Range(min=0.02, max=1)),
        vol.Optional("wall_interior", default=0.12): vol.All(vol.Coerce(float), vol.Range(min=0.02, max=1)),
        vol.Optional("grid", default=0.05): vol.All(vol.Coerce(float), vol.Range(min=0.01, max=1)),
        vol.Optional("energy", default=lambda: dict(DEFAULT_ENERGY)): ENERGY_SCHEMA,
        vol.Optional("roof"): ROOF_SCHEMA,
        vol.Optional("weather"): vol.Any(None, str),
        vol.Optional("north"): _soft(_north, 0),
        # Name oben links (leer = „Haus 3D“)
        vol.Optional("title"): _soft(vol.Any(None, vol.All(str, vol.Length(max=60))), None),
        # 0.23: Grundeinstellungen im Editor erledigt
        vol.Optional("setup_done"): _soft(vol.Boolean(), False),
        # Demo-Modus (Vorführhaus): PV-Erzeugung je Quelle; wird nur in einem Demo-Haus gelesen
        vol.Optional("demo"): _soft(DEMO_SCHEMA, None),
    },
    extra=vol.ALLOW_EXTRA,
)


def _unique_ids(building: dict[str, Any]) -> dict[str, Any]:
    """Prüft Querbezüge: eindeutige Etagen-IDs, Öffnungen an existierenden Räumen und Kanten."""
    floor_ids = [f["id"] for f in building["floors"]]
    if len(floor_ids) != len(set(floor_ids)):
        raise vol.Invalid("Etagen-IDs sind nicht eindeutig")
    for floor in building["floors"]:
        rooms = {r["id"]: r for r in floor["rooms"]}
        if len(rooms) != len(floor["rooms"]):
            raise vol.Invalid(f"Raum-IDs auf Etage {floor['id']} sind nicht eindeutig")
        wall_ids = {w.get("id") for w in floor.get("walls") or [] if isinstance(w, dict)}
        for opening in floor["openings"]:
            if opening.get("wall"):
                # Öffnung in einer freistehenden Wand: room_id kann dann die Wand-ID sein oder nach
                # dem Löschen des Raums stehen bleiben – maßgeblich ist nur die Wand
                if opening["wall"] not in wall_ids:
                    raise vol.Invalid(f"Öffnung {opening['id']}: Wand {opening['wall']} fehlt")
                continue
            room = rooms.get(opening["room_id"])
            if room is None:
                raise vol.Invalid(f"Öffnung {opening['id']}: Raum {opening['room_id']} fehlt")
            if opening["edge"] >= len(room["points"]):
                raise vol.Invalid(f"Öffnung {opening['id']}: Kante {opening['edge']} gibt es nicht")
    return building


BUILDING_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Required("version"): 1,
            vol.Required("floors"): vol.All([FLOOR_SCHEMA], vol.Length(max=MAX_FLOORS)),
            vol.Optional("settings", default=dict): SETTINGS_SCHEMA,
        },
        extra=vol.ALLOW_EXTRA,
    ),
    _unique_ids,
)


def unwrap_export(data: Any) -> Any:
    """Gibt das Gebäude aus einer Exportdatei ({format, building}) zurück, sonst die Daten unverändert."""
    if isinstance(data, dict) and "floors" not in data and isinstance(data.get("building"), dict):
        return data["building"]
    return data


def validate_building(data: Any) -> dict[str, Any]:
    """Validiert ein Gebäude (oder eine Exportdatei) und liefert eine bereinigte Kopie."""
    return BUILDING_SCHEMA(copy.deepcopy(unwrap_export(data)))


def empty_building() -> dict[str, Any]:
    """Ein Gebäude ohne Etagen."""
    return validate_building({"version": 1, "floors": [], "settings": {}})
