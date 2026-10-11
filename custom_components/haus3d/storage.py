"""Speicherung des Gebäudes mit Revisionszähler und Verlauf."""

from __future__ import annotations

import asyncio
import copy
import json
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    HISTORY_LIMIT,
    SEED_FILE,
    STORAGE_KEY_BACKGROUNDS,
    STORAGE_KEY_BUILDING,
    STORAGE_KEY_HISTORY,
    STORAGE_KEY_INVALID,
    STORAGE_KEY_SANDBOX,
    STORAGE_VERSION,
    SANDBOX_LIMIT,
)
from .schema import empty_building, validate_building

_LOGGER = logging.getLogger(__name__)


class RevisionConflict(Exception):
    """Der Stand wurde inzwischen von jemand anderem gespeichert."""


class SandboxError(Exception):
    """Testhaus fehlt bzw. es gibt schon zu viele."""


class Haus3DData:
    """Hält Gebäude, Revision und Verlauf und schreibt sie in .storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY_BUILDING)
        self._history_store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY_HISTORY)
        self.building: dict[str, Any] = empty_building()
        self.revision = 0
        self.history: list[dict[str, Any]] = []
        self._next_history_id = 1
        # Änderungen nacheinander: Revisionsprüfung und Schreiben dürfen sich nicht überholen
        self._lock = asyncio.Lock()
        self._bg_store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY_BACKGROUNDS)
        self._backgrounds: dict[str, str] | None = None
        self._sandbox_bg: dict[str, dict[str, str]] = {}  # Testhaus -> {Etage: Bild}
        self._bg_lock = asyncio.Lock()  # Bilder nur einmal laden (gleichzeitige Zugriffe beim Start)
        # Testhäuser: {id: {name, created, revision, building}} – nie Teil des echten Hauses
        self._sandbox_store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY_SANDBOX)
        self.sandbox: dict[str, dict[str, Any]] = {}
        self.access: Any = None  # access.Access, gesetzt in __init__.py
        self.daily: Any = None  # daily.Daily, gesetzt in __init__.py

    async def async_load(self) -> None:
        """Lädt den gespeicherten Stand; beim ersten Start den mitgelieferten Startstand."""
        stored = await self._store.async_load()
        if stored and isinstance(stored.get("building"), dict):
            try:
                self.building = validate_building(stored["building"])
            except vol.Invalid as err:
                # nicht verwerfen: den Rohstand gesondert sichern, bevor das nächste Speichern ihn überschreibt
                await Store(self.hass, STORAGE_VERSION, STORAGE_KEY_INVALID).async_save(stored)
                _LOGGER.error(
                    "Gespeicherter Stand ist ungültig und wurde nach .storage/%s gesichert; starte leer: %s",
                    STORAGE_KEY_INVALID,
                    err,
                )
                self.building = empty_building()
            self.revision = int(stored.get("revision", 0))
        else:
            self.building = await self.hass.async_add_executor_job(_load_seed)
            self.revision = 1
            await self._async_save_building()

        sandbox = await self._sandbox_store.async_load()
        for sid, house in ((sandbox or {}).get("houses") or {}).items():
            try:
                self.sandbox[sid] = {**house, "building": validate_building(house["building"])}
            except (KeyError, TypeError, vol.Invalid) as err:
                _LOGGER.warning("Testhaus %s ist ungültig und wird übersprungen: %s", sid, err)

        history = await self._history_store.async_load()
        if history:
            self.history = list(history.get("items", []))[-HISTORY_LIMIT:]
            self._next_history_id = int(history.get("next_id", len(self.history) + 1))

    async def _async_save_building(self) -> None:
        await self._store.async_save({"revision": self.revision, "building": self.building})

    async def _async_save_history(self) -> None:
        await self._history_store.async_save({"next_id": self._next_history_id, "items": self.history})

    async def async_snapshot(self, reason: str) -> dict[str, Any]:
        """Hebt den aktuellen Stand im Verlauf auf (maximal HISTORY_LIMIT Einträge)."""
        async with self._lock:
            return await self._async_snapshot(reason)

    async def _async_snapshot(self, reason: str) -> dict[str, Any]:
        item = {
            "id": self._next_history_id,
            "created": dt_util.utcnow().isoformat(),
            "reason": reason,
            "revision": self.revision,
            "building": copy.deepcopy(self.building),
        }
        self._next_history_id += 1
        self.history.append(item)
        del self.history[:-HISTORY_LIMIT]
        await self._async_save_history()
        return item

    async def async_save(self, building: dict[str, Any], expected_revision: int | None) -> int:
        """Speichert ein (bereits validiertes) Gebäude; der alte Stand wandert in den Verlauf."""
        async with self._lock:
            if expected_revision is not None and expected_revision != self.revision:
                raise RevisionConflict
            await self._async_snapshot("save")
            self.building = building
            self.revision += 1
            await self._async_save_building()
            return self.revision

    async def async_restore(self, history_id: int) -> int:
        """Stellt einen Stand aus dem Verlauf wieder her (der aktuelle Stand wird vorher gesichert)."""
        async with self._lock:
            item = next((h for h in self.history if h["id"] == history_id), None)
            if item is None:
                raise KeyError(history_id)
            building = validate_building(item["building"])
            await self._async_snapshot("restore")
            self.building = building
            self.revision += 1
            await self._async_save_building()
            return self.revision

    async def _async_backgrounds(self, house: str | None = None) -> dict[str, str]:
        """Bilder des echten Hauses bzw. eines Testhauses (eigener Bereich, nie gemischt)."""
        if self._backgrounds is None:
            async with self._bg_lock:
                if self._backgrounds is None:
                    stored = await self._bg_store.async_load()
                    self._sandbox_bg = {h: dict(v) for h, v in ((stored or {}).get("sandbox") or {}).items() if isinstance(v, dict)}
                    self._backgrounds = dict((stored or {}).get("images", {}))
        if house is None:
            return self._backgrounds
        return self._sandbox_bg.setdefault(house, {})

    async def _async_save_backgrounds(self) -> None:
        await self._bg_store.async_save({"images": self._backgrounds or {}, "sandbox": {h: v for h, v in self._sandbox_bg.items() if v}})

    async def async_get_background(self, floor_id: str, house: str | None = None) -> str | None:
        """Bild (Daten-URL) einer Etage oder None."""
        return (await self._async_backgrounds(house)).get(floor_id)

    async def async_set_background(self, floor_id: str, image: str | None, house: str | None = None) -> None:
        """Bild einer Etage setzen (None entfernt es)."""
        images = await self._async_backgrounds(house)
        if image:
            images[floor_id] = image
        else:
            images.pop(floor_id, None)
        await self._async_save_backgrounds()

    # ------------------------------------------------------------------ Testhäuser

    async def _async_save_sandbox(self) -> None:
        await self._sandbox_store.async_save({"houses": self.sandbox})

    def sandbox_summary(self) -> list[dict[str, Any]]:
        """Testhäuser ohne Grundriss, älteste zuerst."""
        return [
            {
                "id": sid,
                "name": h.get("name", sid),
                "created": h.get("created"),
                "floors": len(h["building"].get("floors", [])),
                "rooms": sum(len(f.get("rooms", [])) for f in h["building"].get("floors", [])),
            }
            for sid, h in sorted(self.sandbox.items(), key=lambda kv: kv[1].get("created") or "")
        ]

    def sandbox_house(self, house: str) -> dict[str, Any]:
        if house not in self.sandbox:
            raise SandboxError("not_found")
        return self.sandbox[house]

    async def async_sandbox_create(self, name: str, source: str) -> str:
        """Testhaus anlegen: Beispielhaus, Kopie des echten Hauses (mit Bauplan-Fotos) oder leer."""
        images = await self._async_backgrounds()  # vor dem Lock laden (danach ohne await kopieren)
        async with self._lock:
            if len(self.sandbox) >= SANDBOX_LIMIT:
                raise SandboxError("limit")
            if source == "current":
                building = copy.deepcopy(self.building)
            elif source == "example":
                building = await self.hass.async_add_executor_job(_load_seed)
            else:
                building = empty_building()
            sid = f"test{dt_util.utcnow().strftime('%Y%m%d%H%M%S%f')}"
            self.sandbox[sid] = {"name": name, "created": dt_util.utcnow().isoformat(), "revision": 1, "building": building}
            if source == "current" and images:
                self._sandbox_bg[sid] = dict(images)  # gleicher Stand wie der kopierte Grundriss
            await self._async_save_sandbox()
            if source == "current" and images:
                await self._async_save_backgrounds()
        return sid

    async def async_sandbox_delete(self, house: str) -> None:
        async with self._lock:
            self.sandbox_house(house)
            del self.sandbox[house]
            await self._async_save_sandbox()
        await self._async_backgrounds()
        if self._sandbox_bg.pop(house, None):
            await self._async_save_backgrounds()

    async def async_sandbox_save(self, house: str, building: dict[str, Any], expected_revision: int | None) -> int:
        """Grundriss eines Testhauses speichern (ohne Verlauf)."""
        async with self._lock:
            h = self.sandbox_house(house)
            if expected_revision is not None and expected_revision != h["revision"]:
                raise RevisionConflict
            h["building"] = building
            h["revision"] = int(h["revision"]) + 1
            await self._async_save_sandbox()
            return h["revision"]

    def history_summary(self) -> list[dict[str, Any]]:
        """Verlauf ohne die Gebäudedaten, neueste zuerst."""
        return [
            {k: h[k] for k in ("id", "created", "reason", "revision")} | {"floors": len(h["building"].get("floors", []))}
            for h in reversed(self.history)
        ]


def _load_seed() -> dict[str, Any]:
    """Liest haus-daten.json aus dem Paket (im Executor, weil Dateizugriff)."""
    path = Path(__file__).parent / SEED_FILE
    try:
        return validate_building(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError, vol.Invalid) as err:
        _LOGGER.warning("Startstand %s nicht nutzbar, starte leer: %s", path, err)
        return empty_building()
