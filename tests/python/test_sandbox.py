"""Testhäuser (Entwickler): eigene Grundrisse, das echte Haus bleibt unberührt."""

from __future__ import annotations

import copy

from homeassistant.core import HomeAssistant

from custom_components.haus3d.const import DOMAIN

IMG = "data:image/jpeg;base64,/9j/AAAA"


async def _ws(hass, hass_ws_client):
    ws = await hass_ws_client(hass)
    n = 0

    async def call(**msg):
        nonlocal n
        n += 1
        await ws.send_json({"id": n, **msg})
        return await ws.receive_json()

    return call


async def test_sandbox_keeps_real_house(hass: HomeAssistant, setup_integration, hass_ws_client, admin_token) -> None:
    call = await _ws(hass, hass_ws_client)
    data = hass.data[DOMAIN]
    real = copy.deepcopy(data.building)
    real_rev = data.revision
    history = len(data.history)

    # anlegen braucht Admin; Bearbeiten reicht nicht
    edit_token = await data.access.async_verify("edit", "0000", "test")
    res = await call(type="haus3d/sandbox/create", name="Spielwiese", token=edit_token)
    assert res["error"]["code"] == "locked"
    res = await call(type="haus3d/sandbox/create", name="Spielwiese", source="empty", token=admin_token)
    house = res["result"]["house"]
    assert [h["name"] for h in res["result"]["houses"]] == ["Spielwiese"]

    got = (await call(type="haus3d/building/get", house=house))["result"]
    assert got["revision"] == 1 and got["building"]["floors"] == [] and got["house"] == house

    # im Testhaus speichern: echtes Haus, Revision und Verlauf bleiben
    plan = {"version": 1, "floors": [{"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [{"id": "r", "name": "Test", "points": [[0, 0], [3, 0], [3, 3], [0, 3]]}]}], "settings": {"title": "Testhaus"}}
    res = await call(type="haus3d/building/save", house=house, building=plan, revision=1, token=edit_token)
    assert res["result"]["revision"] == 2
    assert res["result"]["building"]["floors"][0]["rooms"][0]["name"] == "Test"
    assert data.building == real and data.revision == real_rev and len(data.history) == history
    # Stand-Konflikt auch im Testhaus
    res = await call(type="haus3d/building/save", house=house, building=plan, revision=1, token=edit_token)
    assert res["error"]["code"] == "conflict"
    # ohne house weiter das echte Haus
    assert (await call(type="haus3d/building/get"))["result"]["revision"] == real_rev

    # Bilder: gleiche Etagen-ID, getrennte Ablage
    assert (await call(type="haus3d/background/set", house=house, floor_id="eg", image=IMG, token=edit_token))["success"]
    assert (await call(type="haus3d/background/get", floor_id="eg"))["result"] == {"image": None}
    assert (await call(type="haus3d/background/get", house=house, floor_id="eg"))["result"] == {"image": IMG}

    # Verlauf gibt es im Testhaus nicht
    assert (await call(type="haus3d/history/list", house=house))["result"] == {"items": []}
    res = await call(type="haus3d/history/snapshot", house=house, token=admin_token)
    assert res["error"]["code"] == "sandbox"
    assert len(data.history) == history

    # löschen: weg samt Bildern, Zugriff danach „not_found“
    res = await call(type="haus3d/sandbox/delete", house=house, token=admin_token)
    assert res["result"]["houses"] == []
    assert (await call(type="haus3d/building/get", house=house))["error"]["code"] == "not_found"
    assert (await call(type="haus3d/background/get", house=house, floor_id="eg"))["error"]["code"] == "not_found"
    assert data.building == real


async def test_sandbox_sources_limit_and_persistence(hass: HomeAssistant, setup_integration, hass_ws_client, admin_token, hass_storage) -> None:
    call = await _ws(hass, hass_ws_client)
    data = hass.data[DOMAIN]
    await call(type="haus3d/background/set", floor_id="eg", image=IMG, token=admin_token)
    # Kopie meines Hauses: gleicher Grundriss, Bilder mitkopiert, danach unabhängig
    copy_id = (await call(type="haus3d/sandbox/create", name="Kopie", source="current", token=admin_token))["result"]["house"]
    got = (await call(type="haus3d/building/get", house=copy_id))["result"]
    assert got["building"] == data.building
    assert (await call(type="haus3d/background/get", house=copy_id, floor_id="eg"))["result"] == {"image": IMG}
    await call(type="haus3d/background/set", house=copy_id, floor_id="eg", image=None, token=admin_token)
    assert (await call(type="haus3d/background/get", floor_id="eg"))["result"] == {"image": IMG}
    # Beispielhaus aus dem Paket
    ex = (await call(type="haus3d/sandbox/create", name="Beispiel", source="example", token=admin_token))["result"]["house"]
    assert (await call(type="haus3d/building/get", house=ex))["result"]["building"]["floors"]
    # höchstens 5
    for i in range(3):
        assert (await call(type="haus3d/sandbox/create", name=f"T{i}", token=admin_token))["success"]
    res = await call(type="haus3d/sandbox/create", name="zu viel", token=admin_token)
    assert res["error"]["code"] == "limit"
    assert len((await call(type="haus3d/sandbox/list"))["result"]["houses"]) == 5
    # gespeichert (überlebt einen Neustart)
    await hass.async_block_till_done()
    assert set(hass_storage["haus3d.sandbox"]["data"]["houses"]) == {h["id"] for h in data.sandbox_summary()}
    # ungültige Kennung wird abgelehnt
    res = await call(type="haus3d/building/get", house="../building")
    assert not res["success"]


async def test_edit_token_keeps_daily_settings(hass: HomeAssistant, setup_integration, hass_ws_client, admin_token) -> None:
    """Alltag (Heizungsautomatik, Urlaubs-Lichter) ist eine Admin-Einstellung wie im Frontend."""
    call = await _ws(hass, hass_ws_client)
    data = hass.data[DOMAIN]
    plan = copy.deepcopy(data.building)
    plan.setdefault("settings", {})["daily"] = {"window_heat": {"auto": False, "minutes": 5}}
    res = await call(type="haus3d/building/save", building=plan, revision=data.revision, token=admin_token)
    assert res["success"]
    edit_token = await data.access.async_verify("edit", "0000", "test")
    plan["settings"]["daily"] = {"window_heat": {"auto": True, "minutes": 1}, "away_lights": ["light.fremd"]}
    res = await call(type="haus3d/building/save", building=plan, revision=data.revision, token=edit_token)
    assert res["success"]
    assert data.building["settings"]["daily"] == {"window_heat": {"auto": False, "minutes": 5}}


async def test_backgrounds_load_once_under_concurrency(hass: HomeAssistant, setup_integration) -> None:
    """Gleichzeitig Foto hochladen und Kopie anlegen, bevor die Fotos geladen sind: nichts geht verloren."""
    import asyncio

    data = hass.data[DOMAIN]
    data._backgrounds = None  # wie direkt nach dem Start
    await asyncio.gather(data.async_set_background("eg", IMG), data.async_sandbox_create("Kopie", "current"))
    assert await data.async_get_background("eg") == IMG
    data._backgrounds = None  # neu von der Platte
    assert await data.async_get_background("eg") == IMG
