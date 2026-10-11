"""WebSocket-Befehle von Haus 3D."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.exceptions import HomeAssistantError

from .access import LOGIN_SCOPES, SCOPES, keep_admin_settings, valid_pin
from .const import BACKGROUND_MAX_CHARS, DOMAIN, SIGNAL_COMMAND
from .schema import validate_building
from .storage import Haus3DData, RevisionConflict, SandboxError

# Testhaus (Entwickler): optionaler Parameter an Grundriss-, Verlaufs- und Bild-Befehlen
_HOUSE = vol.All(str, vol.Match(r"^test[0-9]{1,30}$"))


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Registriert die Befehle (nur einmal pro HA-Lauf, siehe __init__.py)."""
    for command in (ws_get, ws_save, ws_history_list, ws_history_snapshot, ws_history_restore, ws_background_get, ws_background_set, ws_subscribe, ws_pin_status, ws_pin_verify, ws_pin_set, ws_pin_lock, ws_lock_unlock, ws_dev_set, ws_dev_clear, ws_climate_pause, ws_away_status, ws_away_set, ws_sandbox_list, ws_sandbox_create, ws_sandbox_delete):
        websocket_api.async_register_command(hass, command)


def _data(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> Haus3DData | None:
    data: Haus3DData | None = hass.data.get(DOMAIN)
    if data is None:
        connection.send_error(msg["id"], "not_loaded", "Haus 3D ist nicht geladen")
    return data


def _allowed(data: Haus3DData, connection: websocket_api.ActiveConnection, msg: dict[str, Any], need: str) -> bool:
    """Freigabe per PIN-Token (Bearbeiten bzw. Admin); sonst Fehler „locked“."""
    if data.access.allows(msg.get("token"), need):
        return True
    connection.send_error(msg["id"], "locked", "Gesperrt – erst mit der PIN freischalten")
    return False


def _house(data: Haus3DData, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> dict[str, Any] | None | bool:
    """Testhaus aus msg["house"]: dict, None (echtes Haus) oder False (fehlt → Fehler gesendet)."""
    house = msg.get("house")
    if not house:
        return None
    try:
        return data.sandbox_house(house)
    except SandboxError:
        connection.send_error(msg["id"], "not_found", "Dieses Testhaus gibt es nicht (mehr)")
        return False


@websocket_api.websocket_command({vol.Required("type"): "haus3d/building/get", vol.Optional("house"): _HOUSE})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Liefert Gebäude und Revision (mit `house` das Testhaus)."""
    if (data := _data(hass, connection, msg)) is None or (house := _house(data, connection, msg)) is False:
        return
    if house is not None:
        connection.send_result(msg["id"], {"building": house["building"], "revision": house["revision"], "house": msg["house"]})
        return
    connection.send_result(msg["id"], {"building": data.building, "revision": data.revision})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "haus3d/building/save",
        vol.Required("building"): dict,
        vol.Optional("revision"): vol.Any(None, int),
        vol.Optional("token"): str,
        vol.Optional("house"): _HOUSE,
    }
)
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Prüft und speichert ein Gebäude. Mit `revision` wird ein zwischenzeitlicher Stand erkannt.

    Braucht ein Token (Bearbeiten oder Admin). Mit Bearbeiten bleiben die Admin-Einstellungen
    (Energie, Hinweise, Abläufe …) wie gespeichert.
    """
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "edit"):
        return
    if (house := _house(data, connection, msg)) is False:
        return
    try:
        building = validate_building(msg["building"])
        if data.access.scope_of(msg.get("token")) != "admin":
            building = keep_admin_settings(building, house["building"] if house is not None else data.building)
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    try:
        if house is not None:
            # Testhaus: eigener Speicher, kein Verlauf – das echte Haus bleibt unberührt
            revision = await data.async_sandbox_save(msg["house"], building, msg.get("revision"))
            connection.send_result(msg["id"], {"revision": revision, "building": data.sandbox_house(msg["house"])["building"], "house": msg["house"]})
            return
        revision = await data.async_save(building, msg.get("revision"))
    except SandboxError:
        connection.send_error(msg["id"], "not_found", "Dieses Testhaus gibt es nicht (mehr)")
        return
    except RevisionConflict:
        connection.send_error(msg["id"], "conflict", "Der Stand wurde inzwischen geändert")
        return
    connection.send_result(msg["id"], {"revision": revision, "building": data.building})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/history/list", vol.Optional("house"): _HOUSE})
@callback
def ws_history_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Listet die aufgehobenen Stände (Testhäuser haben keinen Verlauf)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"items": [] if msg.get("house") else data.history_summary()})


def _no_sandbox(connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> bool:
    """Verlauf sichern/wiederherstellen gilt nur fürs echte Haus."""
    if msg.get("house"):
        connection.send_error(msg["id"], "sandbox", "Im Testhaus gibt es keinen Verlauf")
        return False
    return True


@websocket_api.websocket_command({vol.Required("type"): "haus3d/history/snapshot", vol.Optional("token"): str, vol.Optional("house"): _HOUSE})
@websocket_api.async_response
async def ws_history_snapshot(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Hebt den aktuellen Stand im Verlauf auf."""
    if (data := _data(hass, connection, msg)) is None or not _no_sandbox(connection, msg) or not _allowed(data, connection, msg, "admin"):
        return
    item = await data.async_snapshot("manual")
    connection.send_result(msg["id"], {"id": item["id"], "items": data.history_summary()})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/history/restore", vol.Required("history_id"): int, vol.Optional("token"): str, vol.Optional("house"): _HOUSE})
@websocket_api.async_response
async def ws_history_restore(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Stellt einen aufgehobenen Stand wieder her."""
    if (data := _data(hass, connection, msg)) is None or not _no_sandbox(connection, msg) or not _allowed(data, connection, msg, "admin"):
        return
    try:
        revision = await data.async_restore(msg["history_id"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Diesen Stand gibt es nicht")
        return
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"revision": revision, "building": data.building})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/background/get", vol.Required("floor_id"): str, vol.Optional("house"): _HOUSE})
@websocket_api.async_response
async def ws_background_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Liefert das Bauplan-Foto bzw. Luftbild einer Etage (Daten-URL) oder None."""
    if (data := _data(hass, connection, msg)) is None or _house(data, connection, msg) is False:
        return
    connection.send_result(msg["id"], {"image": await data.async_get_background(msg["floor_id"], msg.get("house"))})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "haus3d/background/set",
        vol.Required("floor_id"): str,
        vol.Optional("house"): _HOUSE,
        vol.Required("image"): vol.Any(None, vol.All(str, vol.Match(r"^data:image/(jpeg|png|webp);base64,"))),
        vol.Optional("token"): str,
    }
)
@websocket_api.async_response
async def ws_background_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Speichert (oder entfernt) das Bild einer Etage."""
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "edit") or _house(data, connection, msg) is False:
        return
    image = msg["image"]
    if image and len(image) > BACKGROUND_MAX_CHARS:
        connection.send_error(msg["id"], "too_large", "Bild ist zu groß (höchstens etwa 2 MB)")
        return
    await data.async_set_background(msg["floor_id"], image, msg.get("house"))
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Offene Panels hören auf Befehle der Dienste (Etage zeigen, Hinweis, Raum hervorheben …)."""

    @callback
    def forward(command: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], command))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_COMMAND, forward)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "haus3d/pin/status"})
@callback
def ws_pin_status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Gilt noch die Standard-PIN 0000?"""
    if (data := _data(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {**{f"{s}_default": data.access.is_default(s) for s in SCOPES}, "dev": data.access.dev})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/pin/verify", vol.Required("scope"): vol.In(LOGIN_SCOPES), vol.Required("pin"): str})
@websocket_api.async_response
async def ws_pin_verify(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """PIN prüfen: richtig → Token, falsch → ok: false (ohne Hinweis, gedrosselt)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    who = connection.user.id if connection.user else "?"
    token = await data.access.async_verify(msg["scope"], msg["pin"], who)
    connection.send_result(msg["id"], {"ok": True, "token": token, "scope": msg["scope"]} if token else {"ok": False})


@websocket_api.websocket_command(
    {vol.Required("type"): "haus3d/pin/set", vol.Required("scope"): vol.In(SCOPES), vol.Required("pin"): str, vol.Optional("token"): str}
)
@websocket_api.async_response
async def ws_pin_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Neue PIN (4–8 Ziffern) setzen; braucht die Admin-Freigabe."""
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "admin"):
        return
    if not valid_pin(msg["pin"]):
        connection.send_error(msg["id"], "invalid_pin", "PIN: 4 bis 8 Ziffern")
        return
    await data.access.async_set_pin(msg["scope"], msg["pin"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/pin/lock", vol.Optional("token"): str})
@callback
def ws_pin_lock(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Freigabe beenden („Beenden“ bzw. Fenster zu)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    data.access.revoke(msg.get("token"))
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "haus3d/lock/unlock",
        vol.Required("entity_id"): vol.All(vol.Any(str, [str]), vol.Coerce(lambda v: [v] if isinstance(v, str) else v)),
        vol.Required("pin"): str,
        vol.Optional("service", default="unlock"): vol.In(("unlock", "open")),
    }
)
@websocket_api.async_response
async def ws_lock_unlock(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Tür entriegeln bzw. öffnen nur mit der Tür-PIN: falsche PIN → ok: false (still, gedrosselt)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    ids = msg["entity_id"]
    if not ids or any(not isinstance(e, str) or not e.startswith("lock.") for e in ids):
        connection.send_error(msg["id"], "invalid_entity", "Nur Schlösser (lock.…)")
        return
    user = connection.user
    if user is not None and not user.is_admin and not all(user.permissions.check_entity(e, POLICY_CONTROL) for e in ids):
        connection.send_error(msg["id"], "unauthorized", "Keine Berechtigung für dieses Schloss")
        return
    who = user.id if user else "?"
    if not await data.access.async_check("door", msg["pin"], who):
        connection.send_result(msg["id"], {"ok": False})
        return
    try:
        await hass.services.async_call("lock", msg["service"], {"entity_id": ids}, blocking=True, context=connection.context(msg))
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/dev/set", vol.Required("code"): str, vol.Optional("token"): str})
@websocket_api.async_response
async def ws_dev_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Entwickler-Instanz bestätigen (braucht die Admin-Freigabe; falscher Code → ok: false, still)."""
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "admin"):
        return
    who = connection.user.id if connection.user else "?"
    connection.send_result(msg["id"], {"ok": await data.access.async_set_dev(msg["code"], who)})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/dev/clear", vol.Optional("token"): str})
@websocket_api.async_response
async def ws_dev_clear(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Entwickler-Instanz aufheben."""
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "admin"):
        return
    await data.access.async_clear_dev()
    connection.send_result(msg["id"], {"ok": True})


def _may_control(connection: websocket_api.ActiveConnection, ids: list[str]) -> bool:
    user = connection.user
    return user is None or user.is_admin or all(user.permissions.check_entity(e, POLICY_CONTROL) for e in ids)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "haus3d/climate/pause",
        vol.Required("entity_id"): vol.All(str, vol.Match(r"^climate\.[\w-]+$")),
        vol.Optional("contacts", default=list): [vol.All(str, vol.Match(r"^binary_sensor\.[\w-]+$"))],
    }
)
@websocket_api.async_response
async def ws_climate_pause(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Heizung pausieren, bis die Fenster zu sind (ok: false, wenn keins offen ist)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    if not _may_control(connection, [msg["entity_id"]]):
        connection.send_error(msg["id"], "unauthorized", "Keine Berechtigung für diese Heizung")
        return
    try:
        ok = await data.daily.async_pause(msg["entity_id"], msg["contacts"], context=connection.context(msg))
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": ok})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/away/status"})
@callback
def ws_away_status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Anwesenheitssimulation und pausierte Heizungen."""
    if (data := _data(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"on": bool(data.daily.away.get("on")), "lights": len(data.daily.away_lights()), "paused": sorted(data.daily.paused)})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/away/set", vol.Required("on"): bool})
@websocket_api.async_response
async def ws_away_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Anwesenheitssimulation an/aus (wer die Lichter schalten darf)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    if not _may_control(connection, data.daily.away_lights()):
        connection.send_error(msg["id"], "unauthorized", "Keine Berechtigung für die Lichter")
        return
    await data.daily.async_set_away(msg["on"])
    connection.send_result(msg["id"], {"on": msg["on"]})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/sandbox/list"})
@callback
def ws_sandbox_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Testhäuser (ohne Grundriss)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"houses": data.sandbox_summary()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "haus3d/sandbox/create",
        vol.Required("name"): vol.All(str, vol.Strip, vol.Length(min=1, max=40)),
        vol.Optional("source", default="example"): vol.In(("example", "current", "empty")),
        vol.Optional("token"): str,
    }
)
@websocket_api.async_response
async def ws_sandbox_create(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Testhaus anlegen (Admin): Beispielhaus, Kopie des echten Hauses oder leer."""
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "admin"):
        return
    try:
        house = await data.async_sandbox_create(msg["name"], msg["source"])
    except SandboxError:
        connection.send_error(msg["id"], "limit", "Höchstens 5 Testhäuser – erst eins löschen")
        return
    connection.send_result(msg["id"], {"house": house, "houses": data.sandbox_summary()})


@websocket_api.websocket_command({vol.Required("type"): "haus3d/sandbox/delete", vol.Required("house"): _HOUSE, vol.Optional("token"): str})
@websocket_api.async_response
async def ws_sandbox_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Testhaus löschen (Admin); das echte Haus ist davon nie betroffen."""
    if (data := _data(hass, connection, msg)) is None or not _allowed(data, connection, msg, "admin"):
        return
    try:
        await data.async_sandbox_delete(msg["house"])
    except SandboxError:
        connection.send_error(msg["id"], "not_found", "Dieses Testhaus gibt es nicht (mehr)")
        return
    connection.send_result(msg["id"], {"houses": data.sandbox_summary()})
