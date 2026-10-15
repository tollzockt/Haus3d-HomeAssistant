"""Konstanten für Haus 3D."""

from __future__ import annotations

DOMAIN = "haus3d"
VERSION = "0.23.0"

STORAGE_VERSION = 1
STORAGE_KEY_BUILDING = f"{DOMAIN}.building"
STORAGE_KEY_HISTORY = f"{DOMAIN}.history"
# ungültiger gespeicherter Stand wird hierhin gesichert, statt verloren zu gehen
STORAGE_KEY_INVALID = f"{DOMAIN}.building_invalid"
# Bauplan-Fotos/Luftbilder je Etage (getrennt vom Grundriss, damit der klein bleibt)
STORAGE_KEY_BACKGROUNDS = f"{DOMAIN}.backgrounds"
BACKGROUND_MAX_CHARS = 3_000_000
# Testhäuser (Entwickler): eigene Grundrisse zum Ausprobieren, getrennt vom echten Haus
STORAGE_KEY_SANDBOX = f"{DOMAIN}.sandbox"
SANDBOX_LIMIT = 5  # Daten-URL (JPEG, im Browser auf höchstens 1600 px verkleinert)

# Eigene 3D-Modelle: Dateien liegen unter <config>/haus3d/models/<id>.<ext>, Angaben dazu im Store
STORAGE_KEY_MODELS = f"{DOMAIN}.models"
MODELS_DIR = ("haus3d", "models")
MODEL_EXTENSIONS = ("glb", "gltf", "obj", "stl")
MODEL_UNITS = ("m", "cm", "mm")
MODEL_MAX_BYTES = 25 * 1024 * 1024  # je Datei
MODELS_MAX_TOTAL = 300 * 1024 * 1024  # alle Modelle zusammen
MODELS_MAX_COUNT = 200
MODEL_NAME_MAX = 60
MODEL_THUMB_MAX = 150 * 1024  # Vorschaubild (Daten-URL, im Browser erzeugt), Zeichen
MODELS_URL = "/api/haus3d/models"

# Signal an offene Panels (Dienste haus3d.show/notify/highlight/reload)
SIGNAL_COMMAND = f"{DOMAIN}_command"

# Anzahl der aufgehobenen Stände
HISTORY_LIMIT = 20

# Startstand beim ersten Laden (liegt im Paket)
SEED_FILE = "haus-daten.json"

PANEL_URL_PATH = "haus3d"
PANEL_TITLE = "Haus 3D"
PANEL_ICON = "mdi:home-floor-3"
PANEL_COMPONENT = "haus3d-panel"

STATIC_URL = "/haus3d_static"

# Energie-Anzeige: Entitäten werden in den Einstellungen gewählt (bewusst keine Standard-IDs)
DEFAULT_ENERGY = {
    "solar": None,
    "einspeisung": None,
    "akku_ladestand": None,
    "akku_leistung": None,
    "ertrag_heute": None,
    "haus_pv": None,
    "netz": None,
    "verbrauch": None,
}
