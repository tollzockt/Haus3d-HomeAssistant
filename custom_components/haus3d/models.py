"""Eigene 3D-Modelle: Ablage, Hochladen und Abrufen per HTTP, Verwaltung per WebSocket.

Die Dateien liegen im Konfigurationsordner (`<config>/haus3d/models/<id>.<ext>`, also in den HA-Backups),
die Angaben dazu im Store `haus3d.models`. Hochladen braucht die Bearbeiten-Freigabe (PIN-Token) wie das
Speichern des Grundrisses, Abrufen jedes angemeldete Konto. Der Inhalt wird vor dem Speichern grob geprüft
(Kennung der Datei, Aufbau, keine externen Verweise); das eigentliche Lesen übernimmt der Browser.

Dateinamen auf der Platte entstehen nur aus einer zufälligen Kennung (16 Hex-Zeichen) und einer der vier
erlaubten Endungen – nie aus Eingaben des Nutzers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets
import struct
from pathlib import Path
from typing import Any

import aiohttp
import voluptuous as vol
from aiohttp import web

from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    MODEL_EXTENSIONS,
    MODEL_MAX_BYTES,
    MODEL_NAME_MAX,
    MODEL_UNITS,
    MODELS_DIR,
    MODELS_MAX_COUNT,
    MODELS_MAX_TOTAL,
    MODELS_URL,
    STORAGE_KEY_MODELS,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

MODEL_ID_RE = re.compile(r"[0-9a-f]{16}")
# Spielraum für die Formularfelder neben der Datei (Content-Length-Vorprüfung)
FORM_OVERHEAD = 64 * 1024
CHUNK = 256 * 1024
MAX_PARTS = 12
FIELD_MAX = 2048

CONTENT_TYPES = {
    "glb": "model/gltf-binary",
    "gltf": "model/gltf+json",
    "obj": "text/plain; charset=utf-8",
    "stl": "model/stl",
}
# Erweiterungen, die der Browser ohne zusätzliche Decoder nicht lesen kann
_UNSUPPORTED_GLTF = {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"}


class ModelError(Exception):
    """Fehler mit Code und deutscher Meldung (HTTP-Status für den Upload)."""

    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------------------- Prüfung


def clean_name(value: Any, fallback: str = "Modell") -> str:
    """Anzeigename: Steuerzeichen weg, Leerraum zusammengefasst, höchstens MODEL_NAME_MAX Zeichen."""
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", value if isinstance(value, str) else "")
    text = " ".join(text.split())[:MODEL_NAME_MAX].strip()
    return text or fallback


def model_ext(filename: Any) -> str | None:
    """Endung (klein, ohne Punkt), wenn sie eine der erlaubten ist."""
    ext = os.path.splitext(filename if isinstance(filename, str) else "")[1].lower().lstrip(".")
    return ext if ext in MODEL_EXTENSIONS else None


def _bad(message: str, code: str = "invalid_format") -> ModelError:
    return ModelError(code, message)


def _check_gltf_doc(doc: Any, ext: str) -> None:
    if not isinstance(doc, dict) or not isinstance(doc.get("asset"), dict):
        raise _bad("Das ist keine gültige glTF-Datei (Angabe „asset“ fehlt).")
    if not str(doc["asset"].get("version", "")).startswith("2"):
        raise _bad("Nur glTF 2.0 wird unterstützt.")
    for key in ("buffers", "images"):
        items = doc.get(key)
        for item in items if isinstance(items, list) else []:
            uri = item.get("uri") if isinstance(item, dict) else None
            if isinstance(uri, str) and not uri.lower().startswith("data:"):
                if ext == "gltf":
                    raise _bad("Die .gltf-Datei verweist auf weitere Dateien (Daten oder Texturen). Bitte als .glb exportieren.", "external_refs")
                raise _bad("Die .glb-Datei verweist auf externe Dateien. Bitte alles einbetten und neu als .glb exportieren.", "external_refs")
    required = doc.get("extensionsRequired")
    if isinstance(required, list) and any(x in _UNSUPPORTED_GLTF for x in required):
        raise _bad("Komprimierte Modelle (Draco, Meshopt, KTX2) werden nicht unterstützt. Bitte unkomprimiert exportieren.", "unsupported")


def _check_glb(data: bytes) -> None:
    if len(data) < 20 or data[:4] != b"glTF":
        raise _bad("Das ist keine gültige .glb-Datei.")
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise _bad("Nur glTF 2.0 wird unterstützt.")
    if length > len(data):
        raise _bad("Die .glb-Datei ist unvollständig.")
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A or 20 + chunk_len > len(data):  # „JSON“
        raise _bad("Das ist keine gültige .glb-Datei.")
    try:
        doc = json.loads(data[20 : 20 + chunk_len].decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError) as err:
        raise _bad("Das ist keine gültige .glb-Datei.") from err
    _check_gltf_doc(doc, "glb")


def _check_gltf(data: bytes) -> None:
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError, RecursionError) as err:
        raise _bad("Das ist keine gültige .gltf-Datei.") from err
    _check_gltf_doc(doc, "gltf")


def _check_stl(data: bytes) -> None:
    # binär: 80 Byte Kopf, Anzahl der Dreiecke, je 50 Byte
    if len(data) >= 84:
        (count,) = struct.unpack_from("<I", data, 80)
        if count > 0 and 84 + 50 * count == len(data):
            return
    if data[:512].lstrip().lower().startswith(b"solid") and b"facet" in data and b"vertex" in data:
        return
    raise _bad("Das ist keine gültige .stl-Datei.")


def _check_obj(data: bytes) -> None:
    if b"\x00" in data[:4096] or not re.search(rb"^[ \t]*v[ \t]+[-+.0-9]", data, re.MULTILINE):
        raise _bad("Das ist keine gültige .obj-Datei (keine Eckpunkte gefunden).")


def validate_model(ext: str, data: bytes) -> None:
    """Prüft Aufbau und Verweise einer Modelldatei (blockierend, im Executor aufrufen)."""
    if not data:
        raise _bad("Die Datei ist leer.")
    {"glb": _check_glb, "gltf": _check_gltf, "stl": _check_stl, "obj": _check_obj}[ext](data)


def parse_size(value: Any) -> list[float] | None:
    """Größe „b,t,h“ in m (vom Browser gemessen); alles Unbrauchbare wird ignoriert."""
    try:
        parts = [round(float(p), 4) for p in str(value).split(",")]
    except ValueError:
        return None
    if len(parts) != 3 or any(not (0 <= p <= 1000) for p in parts) or not any(parts):
        return None
    return parts


# ---------------------------------------------------------------------------------------- Ablage


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _remove(path: Path) -> None:
    path.unlink(missing_ok=True)


def _existing(directory: Path, items: dict[str, dict[str, Any]]) -> set[str]:
    return {i for i, m in items.items() if (directory / f"{i}.{m['ext']}").is_file()}


def _sane(model_id: Any, meta: Any) -> bool:
    return (
        isinstance(model_id, str)
        and MODEL_ID_RE.fullmatch(model_id) is not None
        and isinstance(meta, dict)
        and meta.get("ext") in MODEL_EXTENSIONS
        and isinstance(meta.get("name"), str)
        and isinstance(meta.get("size"), int)
        and meta.get("unit") in MODEL_UNITS
    )


class Models:
    """Verwaltet die hochgeladenen Modelle (Angaben im Store, Dateien im Konfigurationsordner)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY_MODELS)
        self._items: dict[str, dict[str, Any]] = {}
        self._missing: set[str] = set()
        self._lock = asyncio.Lock()
        self.directory = Path(hass.config.path(*MODELS_DIR))

    async def async_load(self) -> None:
        stored = await self._store.async_load() or {}
        self._items = {i: dict(m) for i, m in (stored.get("models") or {}).items() if _sane(i, m)}
        present = await self.hass.async_add_executor_job(_existing, self.directory, self._items)
        self._missing = set(self._items) - present
        if self._missing:
            _LOGGER.warning("Für %d eigene 3D-Modelle fehlt die Datei in %s", len(self._missing), self.directory)

    async def _async_save(self) -> None:
        await self._store.async_save({"models": self._items})

    @property
    def used_bytes(self) -> int:
        return sum(m["size"] for m in self._items.values())

    def public(self, model_id: str) -> dict[str, Any]:
        """Angaben für den Browser (ohne Pfade)."""
        meta = self._items[model_id]
        out = {k: meta[k] for k in ("name", "ext", "size", "created", "unit") if k in meta}
        out["id"] = model_id
        out["up"] = meta.get("up") or ("z" if meta["ext"] == "stl" else "y")
        if meta.get("size_m"):
            out["size_m"] = meta["size_m"]
        if model_id in self._missing:
            out["missing"] = True
        return out

    def listing(self) -> list[dict[str, Any]]:
        return [self.public(i) for i in sorted(self._items, key=lambda i: (self._items[i].get("created") or "", i))]

    def file_path(self, model_id: Any) -> Path | None:
        """Pfad der Datei zu einer Kennung, nur wenn es sie gibt (strenge Prüfung, kein Pfad aus Eingaben)."""
        if not isinstance(model_id, str) or MODEL_ID_RE.fullmatch(model_id) is None or model_id not in self._items:
            return None
        return self.directory / f"{model_id}.{self._items[model_id]['ext']}"

    def _new_id(self) -> str:
        while True:
            model_id = secrets.token_hex(8)
            if model_id not in self._items:
                return model_id

    async def async_add(self, *, name: str, ext: str, unit: str, up: str | None, size_m: list[float] | None, data: bytes) -> dict[str, Any]:
        """Speichert ein geprüftes Modell und gibt seine Angaben zurück."""
        async with self._lock:
            if len(self._items) >= MODELS_MAX_COUNT:
                raise ModelError("limit", f"Höchstens {MODELS_MAX_COUNT} Modelle – erst eins löschen.", 409)
            if self.used_bytes + len(data) > MODELS_MAX_TOTAL:
                raise ModelError("limit", f"Der Speicher für Modelle ist voll (höchstens {MODELS_MAX_TOTAL // (1024 * 1024)} MB) – erst eins löschen.", 409)
            model_id = self._new_id()
            path = self.directory / f"{model_id}.{ext}"
            await self.hass.async_add_executor_job(_write, path, data)
            meta: dict[str, Any] = {"name": name, "ext": ext, "size": len(data), "created": dt_util.utcnow().isoformat(), "unit": unit}
            if up in ("y", "z"):
                meta["up"] = up
            if size_m:
                meta["size_m"] = size_m
            self._items[model_id] = meta
            try:
                await self._async_save()
            except Exception:
                del self._items[model_id]
                await self.hass.async_add_executor_job(_remove, path)
                raise
            return self.public(model_id)

    async def async_rename(self, model_id: str, name: str) -> None:
        async with self._lock:
            if model_id not in self._items:
                raise KeyError(model_id)
            self._items[model_id]["name"] = name
            await self._async_save()

    async def async_delete(self, model_id: str) -> None:
        async with self._lock:
            path = self.file_path(model_id)
            if path is None:
                raise KeyError(model_id)
            await self.hass.async_add_executor_job(_remove, path)
            del self._items[model_id]
            self._missing.discard(model_id)
            await self._async_save()


def _models(hass: HomeAssistant) -> Models | None:
    return getattr(hass.data.get(DOMAIN), "models", None)


def _uses(hass: HomeAssistant) -> dict[str, int]:
    """Wie oft jedes Modell in gespeicherten Grundrissen (echtes Haus und Testhäuser) benutzt wird."""
    data = hass.data.get(DOMAIN)
    counts: dict[str, int] = {}
    if data is None:
        return counts
    buildings = [data.building, *(h.get("building") or {} for h in data.sandbox.values())]
    for building in buildings:
        for floor in building.get("floors") or []:
            for item in floor.get("furniture") or []:
                model_id = item.get("model") if isinstance(item, dict) and item.get("type") == "custom_model" else None
                if isinstance(model_id, str):
                    counts[model_id] = counts.get(model_id, 0) + 1
    return counts


def _result(hass: HomeAssistant, models: Models) -> dict[str, Any]:
    uses = _uses(hass)
    return {
        "models": [{**m, "uses": uses.get(m["id"], 0)} for m in models.listing()],
        "used": models.used_bytes,
        "limits": {"file": MODEL_MAX_BYTES, "total": MODELS_MAX_TOTAL, "count": MODELS_MAX_COUNT},
    }


# ---------------------------------------------------------------------------------------- HTTP


def _error(view: HomeAssistantView, err: ModelError) -> web.Response:
    return view.json({"code": err.code, "message": err.message}, status_code=err.status)


async def _read_limited(part: aiohttp.BodyPartReader, limit: int, error: ModelError | None = None) -> bytes:
    """Teil eines Formulars lesen und abbrechen, sobald es größer als limit wird (kein Einlesen auf Vorrat)."""
    buf = bytearray()
    while chunk := await part.read_chunk(CHUNK):
        buf.extend(chunk)
        if len(buf) > limit:
            raise error or ModelError("invalid_format", "Ein Feld des Formulars ist zu lang.")
    return bytes(buf)


class ModelUploadView(HomeAssistantView):
    """POST /api/haus3d/models: multipart mit token, name, unit[, up, size_m, house] und zuletzt file."""

    url = MODELS_URL
    name = "api:haus3d:models"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        try:
            return self.json(await self._upload(request), status_code=201)
        except ModelError as err:
            return _error(self, err)
        except OSError as err:
            _LOGGER.error("Modell ließ sich nicht speichern: %s", err)
            return _error(self, ModelError("failed", "Die Datei ließ sich nicht speichern (Speicherplatz oder Rechte im Konfigurationsordner?).", 500))

    async def _upload(self, request: web.Request) -> dict[str, Any]:
        data = self.hass.data.get(DOMAIN)
        models = _models(self.hass)
        if data is None or models is None:
            raise ModelError("not_loaded", "Haus 3D ist nicht geladen", 503)
        if not request.content_type.startswith("multipart/"):
            raise ModelError("invalid_format", "Erwartet wird ein Formular mit Datei (multipart).")
        if request.content_length is not None and request.content_length > MODEL_MAX_BYTES + FORM_OVERHEAD:
            raise ModelError("too_large", f"Die Datei ist zu groß (höchstens {MODEL_MAX_BYTES // (1024 * 1024)} MB).", 413)

        fields: dict[str, str] = {}
        content: bytes | None = None
        filename = ""
        allowed = False
        try:
            reader = await request.multipart()
            for _ in range(MAX_PARTS + 1):
                part = await reader.next()
                if part is None:
                    break
                if not isinstance(part, aiohttp.BodyPartReader) or not part.name:
                    raise ModelError("invalid_format", "Das Formular ist ungültig.")
                if part.name != "file":
                    fields[part.name] = (await _read_limited(part, FIELD_MAX)).decode("utf-8", errors="ignore")
                    if part.name == "token":
                        allowed = data.access.allows(fields["token"], "edit")
                    continue
                # Datei: erst nach gültiger Freigabe lesen (Feld „token“ steht davor)
                if not allowed:
                    raise ModelError("locked", "Gesperrt – erst mit der PIN freischalten", 403)
                if content is not None:
                    raise ModelError("invalid_format", "Es darf nur eine Datei im Formular stehen.")
                filename = part.filename or ""
                if model_ext(filename) is None:
                    raise ModelError("invalid_format", "Diese Dateiart geht nicht – erlaubt sind .glb, .gltf, .obj und .stl.")
                content = await _read_limited(part, MODEL_MAX_BYTES, ModelError("too_large", f"Die Datei ist zu groß (höchstens {MODEL_MAX_BYTES // (1024 * 1024)} MB).", 413))
            else:
                raise ModelError("invalid_format", "Das Formular enthält zu viele Teile.")
        except (ValueError, AssertionError, KeyError, aiohttp.ClientError) as err:
            raise ModelError("invalid_format", "Das Formular ließ sich nicht lesen.") from err

        if not allowed:
            raise ModelError("locked", "Gesperrt – erst mit der PIN freischalten", 403)
        if content is None:
            raise ModelError("invalid_format", "Keine Datei im Formular.")
        ext = model_ext(filename)
        unit = (fields.get("unit") or "m").strip()
        if ext is None or unit not in MODEL_UNITS:
            raise ModelError("invalid_format", "Dateiart oder Einheit ist ungültig.")
        await self.hass.async_add_executor_job(validate_model, ext, content)
        up = (fields.get("up") or "").strip()
        return {
            "model": await models.async_add(
                name=clean_name(fields.get("name"), clean_name(os.path.splitext(re.split(r"[\\/]", filename)[-1])[0])),
                ext=ext,
                unit=unit,
                up=up if up in ("y", "z") else None,
                size_m=parse_size(fields.get("size_m")),
                data=content,
            )
        }


class ModelFileView(HomeAssistantView):
    """GET /api/haus3d/models/{model_id}: die gespeicherte Datei (die Kennung ändert sich nie → lange im Cache)."""

    url = MODELS_URL + "/{model_id}"
    name = "api:haus3d:model"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, model_id: str) -> web.StreamResponse:
        models = _models(self.hass)
        path = models.file_path(model_id) if models is not None else None
        if path is None or not await self.hass.async_add_executor_job(path.is_file):
            return self.json({"code": "not_found", "message": "Dieses Modell gibt es nicht (mehr)"}, status_code=404)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": CONTENT_TYPES[path.suffix.lstrip(".")],
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
                "Content-Disposition": f'attachment; filename="{path.name}"',
            },
        )


# ---------------------------------------------------------------------------------------- WebSocket


def _allowed(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> Models | None:
    """Modelle, wenn Haus 3D geladen und die Freigabe „Bearbeiten“ (oder Admin) gültig ist."""
    data = hass.data.get(DOMAIN)
    models = _models(hass)
    if data is None or models is None:
        connection.send_error(msg["id"], "not_loaded", "Haus 3D ist nicht geladen")
        return None
    if not data.access.allows(msg.get("token"), "edit"):
        connection.send_error(msg["id"], "locked", "Gesperrt – erst mit der PIN freischalten")
        return None
    return models


_MODEL_ID = vol.All(str, vol.Match(MODEL_ID_RE.pattern + r"\Z"))


@websocket_api.websocket_command({vol.Required("type"): "haus3d/models/list"})
@callback
def ws_models_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Alle Modelle mit Größe, Einheit und Verwendung; dazu die Grenzen."""
    if (models := _models(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Haus 3D ist nicht geladen")
        return
    connection.send_result(msg["id"], _result(hass, models))


@websocket_api.websocket_command({vol.Required("type"): "haus3d/models/delete", vol.Required("model_id"): _MODEL_ID, vol.Optional("token"): str})
@websocket_api.async_response
async def ws_models_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Modell samt Datei löschen (Bearbeiten); Möbel mit diesem Modell zeigen danach einen Platzhalter."""
    if (models := _allowed(hass, connection, msg)) is None:
        return
    try:
        await models.async_delete(msg["model_id"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Dieses Modell gibt es nicht (mehr)")
        return
    except OSError as err:
        connection.send_error(msg["id"], "failed", f"Die Datei ließ sich nicht löschen: {err}")
        return
    connection.send_result(msg["id"], _result(hass, models))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "haus3d/models/rename",
        vol.Required("model_id"): _MODEL_ID,
        vol.Required("name"): vol.All(str, vol.Strip, vol.Length(min=1, max=MODEL_NAME_MAX)),
        vol.Optional("token"): str,
    }
)
@websocket_api.async_response
async def ws_models_rename(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Modell umbenennen (Bearbeiten)."""
    if (models := _allowed(hass, connection, msg)) is None:
        return
    try:
        await models.async_rename(msg["model_id"], clean_name(msg["name"]))
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Dieses Modell gibt es nicht (mehr)")
        return
    connection.send_result(msg["id"], _result(hass, models))


@callback
def async_register(hass: HomeAssistant) -> None:
    """Registriert HTTP-Zugänge und WebSocket-Befehle (nur einmal pro HA-Lauf, siehe __init__.py)."""
    for command in (ws_models_list, ws_models_delete, ws_models_rename):
        websocket_api.async_register_command(hass, command)
    hass.http.register_view(ModelUploadView(hass))
    hass.http.register_view(ModelFileView(hass))
