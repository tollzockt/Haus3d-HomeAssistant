"""Weitere Häuser (Testhäuser und Demo-Häuser): eigene Grundrisse, das echte Haus bleibt unberührt."""

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


async def test_demo_flag_create_update_list(hass: HomeAssistant, setup_integration, hass_ws_client, admin_token, hass_storage) -> None:
    """Demo-Modus je weiterem Haus: anlegen, umschalten (Admin), umbenennen, gilt für alle Browser; echtes Haus nie Demo."""
    call = await _ws(hass, hass_ws_client)
    data = hass.data[DOMAIN]
    real = copy.deepcopy(data.building)
    real_rev = data.revision
    history = len(data.history)
    edit_token = await data.access.async_verify("edit", "0000", "test")

    # anlegen: ohne Angabe Testhaus, mit demo ein Demo-Haus; Bearbeiten-PIN reicht nicht
    res = await call(type="haus3d/sandbox/create", name="Vorführhaus 1", source="empty", demo=True, token=edit_token)
    assert res["error"]["code"] == "locked"
    res = await call(type="haus3d/sandbox/create", name="Vorführhaus 1", source="example", demo=True, token=admin_token)
    demo_house = res["result"]["house"]
    res = await call(type="haus3d/sandbox/create", name="Testhaus 2", source="empty", token=admin_token)
    test_house = res["result"]["house"]
    assert {h["id"]: h["demo"] for h in res["result"]["houses"]} == {demo_house: True, test_house: False}
    assert not (await call(type="haus3d/sandbox/create", name="x", demo="ja", token=admin_token))["success"]  # nur Wahrheitswerte
    # offen lesbar: list zeigt demo, building/get mit house liefert demo (das echte Haus hat kein demo)
    assert {h["id"]: h["demo"] for h in (await call(type="haus3d/sandbox/list"))["result"]["houses"]} == {demo_house: True, test_house: False}
    assert (await call(type="haus3d/building/get", house=demo_house))["result"]["demo"] is True
    assert (await call(type="haus3d/building/get", house=test_house))["result"]["demo"] is False
    assert "demo" not in (await call(type="haus3d/building/get"))["result"]

    # umschalten: nur mit Admin-PIN (kein Token, Bearbeiten → locked), Grundriss und Revision bleiben
    before = copy.deepcopy(data.sandbox[test_house]["building"])
    for token in (None, edit_token):
        msg = {"type": "haus3d/sandbox/update", "house": test_house, "demo": True}
        res = await call(**msg, **({"token": token} if token else {}))
        assert res["error"]["code"] == "locked"
    assert data.sandbox[test_house]["demo"] is False
    res = await call(type="haus3d/sandbox/update", house=test_house, demo=True, token=admin_token)
    assert {h["id"]: h["demo"] for h in res["result"]["houses"]} == {demo_house: True, test_house: True}
    got = (await call(type="haus3d/building/get", house=test_house))["result"]
    assert got["demo"] is True and got["building"] == before and got["revision"] == 1
    res = await call(type="haus3d/sandbox/update", house=test_house, demo=False, token=admin_token)
    assert {h["id"]: h["demo"] for h in res["result"]["houses"]}[test_house] is False

    # umbenennen (ohne demo anzufassen), Name wird geprüft
    res = await call(type="haus3d/sandbox/update", house=demo_house, name="  Showroom  ", token=admin_token)
    assert {h["id"]: (h["name"], h["demo"]) for h in res["result"]["houses"]}[demo_house] == ("Showroom", True)
    assert not (await call(type="haus3d/sandbox/update", house=demo_house, name="", token=admin_token))["success"]
    assert not (await call(type="haus3d/sandbox/update", house=demo_house, name="x" * 41, token=admin_token))["success"]
    assert data.sandbox[demo_house]["name"] == "Showroom"

    # unbekannte und ungültige Kennungen: das echte Haus lässt sich nicht zum Demo-Haus machen
    assert (await call(type="haus3d/sandbox/update", house="test99", demo=True, token=admin_token))["error"]["code"] == "not_found"
    for bad in ("real", "../building", "", "test"):
        assert not (await call(type="haus3d/sandbox/update", house=bad, demo=True, token=admin_token))["success"]
    assert not (await call(type="haus3d/sandbox/update", demo=True, token=admin_token))["success"]  # house fehlt
    assert not (await call(type="haus3d/sandbox/update", house=demo_house, demo="ja", token=admin_token))["success"]

    # Speichern im Demo-Haus ändert das Flag nicht; settings.demo wird mitgespeichert (weich geprüft)
    plan = copy.deepcopy(data.sandbox[demo_house]["building"])
    plan.setdefault("settings", {})["demo"] = {"pv": {"roof:d1": {"min": 0, "max": 3000, "from": 480, "to": 1080}, "kaputt": 5}}
    res = await call(type="haus3d/building/save", house=demo_house, building=plan, revision=1, token=edit_token)
    assert res["result"]["building"]["settings"]["demo"] == {"pv": {"roof:d1": {"min": 0, "max": 3000, "from": 480, "to": 1080}}}
    assert (await call(type="haus3d/building/get", house=demo_house))["result"]["demo"] is True
    assert data.sandbox[demo_house]["demo"] is True

    # gespeichert (für alle Browser und nach einem Neustart) – im Haus, nicht im Grundriss
    await hass.async_block_till_done()
    stored = hass_storage["haus3d.sandbox"]["data"]["houses"]
    assert stored[demo_house]["demo"] is True and stored[test_house]["demo"] is False
    assert "demo" not in stored[demo_house]["building"]  # das Kästchen gehört zum Haus, nicht zum Grundriss
    assert stored[demo_house]["building"]["settings"]["demo"]["pv"]["roof:d1"]["max"] == 3000

    # löschen entfernt Flag und Haus; das echte Haus blieb die ganze Zeit unberührt
    res = await call(type="haus3d/sandbox/delete", house=demo_house, token=admin_token)
    assert [h["id"] for h in res["result"]["houses"]] == [test_house]
    assert data.building == real and data.revision == real_rev and len(data.history) == history

    # Grenze: höchstens 5 weitere Häuser, Fehlertext nennt „weitere Häuser“
    for i in range(4):
        assert (await call(type="haus3d/sandbox/create", name=f"V{i}", demo=bool(i % 2), token=admin_token))["success"]
    res = await call(type="haus3d/sandbox/create", name="zu viel", demo=True, token=admin_token)
    assert res["error"]["code"] == "limit" and "5 weitere Häuser" in res["error"]["message"]
    assert len((await call(type="haus3d/sandbox/list"))["result"]["houses"]) == 5


async def test_legacy_houses_without_demo_flag(hass: HomeAssistant, hass_storage, hass_ws_client) -> None:
    """Altbestand: Testhäuser ohne Angabe bleiben Testhaus; nur ein echtes „true“ macht ein Haus zum Demo-Haus."""
    from homeassistant.setup import async_setup_component
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    plan = {"version": 1, "floors": [], "settings": {}}
    hass_storage["haus3d.sandbox"] = {
        "version": 1,
        "minor_version": 1,
        "key": "haus3d.sandbox",
        "data": {
            "houses": {
                "test100": {"name": "Alt", "created": "2026-01-01T00:00:00+00:00", "revision": 3, "building": plan},
                "test101": {"name": "Demo", "created": "2026-01-02T00:00:00+00:00", "revision": 1, "building": plan, "demo": True},
                "test102": {"name": "Seltsam", "created": "2026-01-03T00:00:00+00:00", "revision": 1, "building": plan, "demo": "ja"},
            }
        },
    }
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="Haus 3D", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    call = await _ws(hass, hass_ws_client)
    houses = (await call(type="haus3d/sandbox/list"))["result"]["houses"]
    assert [(h["id"], h["demo"]) for h in houses] == [("test100", False), ("test101", True), ("test102", False)]
    assert (await call(type="haus3d/building/get", house="test100"))["result"]["demo"] is False
    assert (await call(type="haus3d/building/get", house="test101"))["result"]["demo"] is True
    assert (await call(type="haus3d/building/get", house="test102"))["result"]["demo"] is False
    # Speichern eines Altbestand-Hauses verändert das Flag nicht (kein Flag bleibt „Testhaus“)
    data = hass.data[DOMAIN]
    token = await data.access.async_verify("edit", "0000", "test")
    res = await call(type="haus3d/building/save", house="test100", building=plan, revision=3, token=token)
    assert res["result"]["revision"] == 4
    assert "demo" not in data.sandbox["test100"] and (await call(type="haus3d/building/get", house="test100"))["result"]["demo"] is False


async def test_reset_sandbox_house_keeps_real_house(hass: HomeAssistant, setup_integration, hass_ws_client, admin_token) -> None:
    """Zurücksetzen im Testhaus leert nur dieses Haus (ohne Verlauf); echtes Haus, Verlauf und Bauplan-Fotos bleiben."""
    call = await _ws(hass, hass_ws_client)
    data = hass.data[DOMAIN]
    real = copy.deepcopy(data.building)
    real_rev = data.revision
    history = copy.deepcopy(data.history)
    house = (await call(type="haus3d/sandbox/create", name="Kopie", source="example", token=admin_token))["result"]["house"]
    assert (await call(type="haus3d/background/set", house=house, floor_id="eg", image=IMG, token=admin_token))["success"]
    before = (await call(type="haus3d/building/get", house=house))["result"]
    assert before["building"]["floors"]

    # nur Admin
    edit_token = await data.access.async_verify("edit", "0000", "test")
    assert (await call(type="haus3d/building/reset", house=house, revision=before["revision"], token=edit_token))["error"]["code"] == "locked"
    assert (await call(type="haus3d/building/reset", house=house, revision=before["revision"]))["error"]["code"] == "locked"
    # Konflikt und unbekanntes Haus
    assert (await call(type="haus3d/building/reset", house=house, revision=before["revision"] + 5, token=admin_token))["error"]["code"] == "conflict"
    assert (await call(type="haus3d/building/reset", house="test99", token=admin_token))["error"]["code"] == "not_found"
    assert (await call(type="haus3d/building/get", house=house))["result"]["building"] == before["building"]

    res = await call(type="haus3d/building/reset", house=house, revision=before["revision"], token=admin_token)
    assert res["success"], res
    assert res["result"]["house"] == house and res["result"]["building"]["floors"] == []
    assert res["result"]["revision"] == before["revision"] + 1 and "history_id" not in res["result"]
    got = (await call(type="haus3d/building/get", house=house))["result"]
    assert got["building"]["floors"] == [] and got["revision"] == before["revision"] + 1
    # das echte Haus, sein Verlauf und die Fotos sind unberührt
    assert data.building == real and data.revision == real_rev and data.history == history
    assert (await call(type="haus3d/background/get", house=house, floor_id="eg"))["result"] == {"image": IMG}
    assert (await call(type="haus3d/history/list", house=house))["result"] == {"items": []}
    assert [h["id"] for h in (await call(type="haus3d/sandbox/list"))["result"]["houses"]] == [house]
