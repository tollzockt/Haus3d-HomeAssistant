"""Eigene 3D-Modelle: Hochladen, Abrufen, Liste, Umbenennen, Löschen, Grenzen und Rechte."""

from __future__ import annotations

import base64
import copy
import json
import re
import struct
from pathlib import Path

import aiohttp
import pytest

from homeassistant.core import HomeAssistant

from custom_components.haus3d import models as models_mod
from custom_components.haus3d.const import DOMAIN, MODEL_EXTENSIONS
from custom_components.haus3d.models import ModelError, clean_name, model_ext, parse_size, parse_thumb, validate_model
from custom_components.haus3d.schema import validate_building

URL = "/api/haus3d/models"
ID_RE = re.compile(r"^[0-9a-f]{16}$")


# ------------------------------------------------------------------------------------ Testdateien


def make_glb(doc: dict | None = None) -> bytes:
    doc = {"asset": {"version": "2.0"}} if doc is None else doc
    js = json.dumps(doc).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


def make_gltf(doc: dict | None = None) -> bytes:
    return json.dumps({"asset": {"version": "2.0"}} if doc is None else doc).encode()


def make_stl(n: int = 2) -> bytes:
    return b"\0" * 80 + struct.pack("<I", n) + b"\0" * (50 * n)


STL_ASCII = b"solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n"
OBJ = b"# Dreieck\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
SAMPLES = {"glb": make_glb(), "gltf": make_gltf(), "stl": make_stl(), "obj": OBJ}


def form(file: tuple[str, bytes] | None = ("a.stl", make_stl()), **fields: str) -> aiohttp.FormData:
    """Formular in der Reihenfolge der Felder; die Datei steht zuletzt (der Server liest sie erst nach dem Token)."""
    f = aiohttp.FormData()
    for k, v in fields.items():
        f.add_field(k, v)
    if file is not None:
        f.add_field("file", file[1], filename=file[0], content_type="application/octet-stream")
    return f


@pytest.fixture
def cfg_dir(hass: HomeAssistant, tmp_path: Path) -> Path:
    """Konfigurationsordner im Temp-Verzeichnis (nicht im Paket), vor dem Einrichten setzen."""
    hass.config.config_dir = str(tmp_path)
    return tmp_path


@pytest.fixture
async def edit_token(hass: HomeAssistant, cfg_dir, setup_integration) -> str:
    token = await hass.data[DOMAIN].access.async_verify("edit", "0000", "edit-fixture")
    assert token
    return token


def files(cfg_dir: Path) -> list[str]:
    d = cfg_dir / "haus3d" / "models"
    return sorted(p.name for p in d.iterdir()) if d.exists() else []


async def upload(client, token: str | None, file=("a.stl", make_stl()), **fields):
    if token is not None:
        fields = {"token": token, **fields}
    resp = await client.post(URL, data=form(file, **fields))
    return resp, await resp.json()


async def ws_call(hass, hass_ws_client):
    ws = await hass_ws_client(hass)
    n = 0

    async def call(**msg):
        nonlocal n
        n += 1
        await ws.send_json({"id": n, **msg})
        return await ws.receive_json()

    return call


# ------------------------------------------------------------------------------------ Hochladen und Abrufen


async def test_upload_and_fetch_all_formats(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_storage) -> None:
    client = await hass_client()
    types = {"glb": "model/gltf-binary", "gltf": "model/gltf+json", "stl": "model/stl", "obj": "text/plain"}
    for ext, content in SAMPLES.items():
        resp, body = await upload(client, edit_token, (f"Mein Sofa.{ext.upper()}", content), name="  Sofa  alt ", unit="cm", size_m="1.234567,0.5,0.8")
        assert resp.status == 201, body
        meta = body["model"]
        assert ID_RE.match(meta["id"]) and meta["ext"] == ext and meta["name"] == "Sofa alt" and meta["unit"] == "cm"
        assert meta["size"] == len(content) and meta["size_m"] == [1.2346, 0.5, 0.8]
        assert meta["up"] == ("z" if ext == "stl" else "y")
        assert (cfg_dir / "haus3d" / "models" / f"{meta['id']}.{ext}").read_bytes() == content

        got = await client.get(f"{URL}/{meta['id']}")
        assert got.status == 200 and await got.read() == content
        assert got.headers["Content-Type"].startswith(types[ext])
        assert "max-age=31536000" in got.headers["Cache-Control"] and "immutable" in got.headers["Cache-Control"]
        assert got.headers["X-Content-Type-Options"] == "nosniff"
    assert len(files(cfg_dir)) == 4 and not [f for f in files(cfg_dir) if f.endswith(".part")]
    stored = hass_storage["haus3d.models"]["data"]["models"]
    assert len(stored) == 4 and all(set(m) >= {"name", "ext", "size", "created", "unit"} for m in stored.values())


async def test_upload_defaults_and_name_from_file(hass: HomeAssistant, cfg_dir, edit_token, hass_client) -> None:
    client = await hass_client()
    resp, body = await upload(client, edit_token, ("Stehlampe.obj", OBJ))
    meta = body["model"]
    assert resp.status == 201 and meta["name"] == "Stehlampe" and meta["unit"] == "m" and meta["up"] == "y" and "size_m" not in meta
    # Achse und Einheit gewählt, unbrauchbare Größe ignoriert
    resp, body = await upload(client, edit_token, ("x.obj", OBJ), name="Z oben", unit="mm", up="z", size_m="a,b")
    assert body["model"]["up"] == "z" and body["model"]["unit"] == "mm" and "size_m" not in body["model"]
    # Name mit Steuerzeichen und überlang
    resp, body = await upload(client, edit_token, ("x.obj", OBJ), name="A\x00\x07B" + "x" * 200)
    assert len(body["model"]["name"]) <= 60 and "\x00" not in body["model"]["name"]
    # Einheit unbekannt → abgelehnt, nichts gespeichert
    before = len(files(cfg_dir))
    resp, body = await upload(client, edit_token, ("x.obj", OBJ), unit="km")
    assert resp.status == 400 and len(files(cfg_dir)) == before


async def test_upload_needs_edit_permission(hass: HomeAssistant, cfg_dir, setup_integration, hass_client, hass_client_no_auth) -> None:
    access = hass.data[DOMAIN].access
    client = await hass_client()
    # kein Token, falsches Token
    for token in (None, "falsch", ""):
        resp, body = await upload(client, token)
        assert resp.status == 403 and body["code"] == "locked", token
    # Token nach der Datei zählt nicht (die Datei wird erst nach gültiger Freigabe gelesen)
    edit = await access.async_verify("edit", "0000", "perm1")
    resp = await client.post(URL, data=_late_token(edit))
    assert resp.status == 403
    assert files(cfg_dir) == []
    # Bearbeiten und Admin dürfen
    assert (await upload(client, edit))[0].status == 201
    admin = await access.async_verify("admin", "0000", "perm2")
    assert (await upload(client, admin))[0].status == 201
    # Freigabe beendet → wieder gesperrt
    access.revoke(edit)
    assert (await upload(client, edit))[0].status == 403
    # ohne Anmeldung an Home Assistant gar nicht
    anon = await hass_client_no_auth()
    resp = await anon.post(URL, data=form(token=admin))
    assert resp.status == 401
    assert len(files(cfg_dir)) == 2


def _late_token(token: str) -> aiohttp.FormData:
    f = aiohttp.FormData()
    f.add_field("file", make_stl(), filename="a.stl", content_type="application/octet-stream")
    f.add_field("token", token)
    return f


async def test_upload_rejects_wrong_files(hass: HomeAssistant, cfg_dir, edit_token, hass_client) -> None:
    client = await hass_client()
    bad = [
        ("sofa.exe", make_stl()),  # falsche Endung
        ("sofa", make_stl()),  # ohne Endung
        ("sofa.png", b"\x89PNG"),
        ("a.glb", b"nicht glTF" + b"\0" * 40),  # Kennung fehlt
        ("a.glb", make_glb()[:30]),  # abgeschnitten
        ("a.glb", b"glTF" + struct.pack("<II", 1, 40) + b"\0" * 40),  # Version 1
        ("a.glb", make_glb({"scene": 0})),  # „asset“ fehlt
        ("a.gltf", b"{ kaputt"),
        ("a.gltf", make_gltf({"asset": {"version": "1.0"}})),
        ("a.gltf", make_gltf([1, 2])),
        ("a.stl", b"das ist kein STL" * 10),
        ("a.stl", make_stl(3)[:-10]),  # Länge passt nicht zur Dreieckszahl
        ("a.stl", struct.pack("<I", 0).rjust(84, b"\0")),  # null Dreiecke
        ("a.obj", b"f 1 2 3\n"),  # keine Eckpunkte
        ("a.obj", b"v 1 2 3\n\0\0\0"[:6] + b"\0" * 10),
        ("a.obj", b""),  # leer
    ]
    for name, content in bad:
        resp, body = await upload(client, edit_token, (name, content))
        assert resp.status == 400 and body["code"] == "invalid_format", (name, body)
    assert files(cfg_dir) == []
    # kein Dateiteil
    resp, body = await upload(client, edit_token, None)
    assert resp.status == 400
    # kein Formular
    resp = await client.post(URL, data=b"abc", headers={"Content-Type": "application/octet-stream"})
    assert resp.status == 400
    resp = await client.post(URL, data=b"abc", headers={"Content-Type": "multipart/form-data"})
    assert resp.status == 400


async def test_gltf_external_references_rejected(hass: HomeAssistant, cfg_dir, edit_token, hass_client) -> None:
    client = await hass_client()
    external = make_gltf({"asset": {"version": "2.0"}, "buffers": [{"uri": "scene.bin", "byteLength": 3}]})
    resp, body = await upload(client, edit_token, ("a.gltf", external))
    assert resp.status == 400 and body["code"] == "external_refs" and ".glb" in body["message"]
    texture = make_gltf({"asset": {"version": "2.0"}, "images": [{"uri": "https://example.invalid/t.png"}]})
    assert (await upload(client, edit_token, ("a.gltf", texture)))[1]["code"] == "external_refs"
    # in einer .glb ebenfalls (Textur nebenan)
    glb = make_glb({"asset": {"version": "2.0"}, "images": [{"uri": "tex.png"}]})
    assert (await upload(client, edit_token, ("a.glb", glb)))[1]["code"] == "external_refs"
    # eingebettete Daten (data:-URI) sind in Ordnung
    ok = make_gltf({"asset": {"version": "2.0"}, "buffers": [{"uri": "data:application/octet-stream;base64,AAAA", "byteLength": 3}], "images": [{"uri": "data:image/png;base64,iVBORw0KGgo="}]})
    assert (await upload(client, edit_token, ("a.gltf", ok)))[0].status == 201
    # Komprimierung, die der Browser ohne Zusatz nicht lesen kann
    draco = make_glb({"asset": {"version": "2.0"}, "extensionsRequired": ["KHR_draco_mesh_compression"]})
    resp, body = await upload(client, edit_token, ("d.glb", draco))
    assert resp.status == 400 and body["code"] == "unsupported"
    assert len(files(cfg_dir)) == 1


async def test_upload_too_large_is_cut_off(hass: HomeAssistant, cfg_dir, edit_token, hass_client, monkeypatch) -> None:
    monkeypatch.setattr(models_mod, "MODEL_MAX_BYTES", 4000)
    client = await hass_client()
    ok = b"v 1 2 3\n" * 100  # 800 Byte
    assert (await upload(client, edit_token, ("ok.obj", ok)))[0].status == 201
    big = b"v 1 2 3\n" * 1000  # 8000 Byte
    resp, body = await upload(client, edit_token, ("big.obj", big))
    assert resp.status == 413 and body["code"] == "too_large" and "MB" in body["message"]
    # weit über der Grenze: schon an der angekündigten Länge abgewiesen, ohne zu lesen
    resp, body = await upload(client, edit_token, ("huge.obj", b"v 1 2 3\n" * 40000))
    assert resp.status == 413 and body["code"] == "too_large"
    # auch wenn der Absender die Größe nicht vorab nennt (Stückelung): beim Einlesen abgebrochen
    async def chunks():
        yield b'--B\r\nContent-Disposition: form-data; name="token"\r\n\r\n' + edit_token.encode() + b'\r\n'
        yield b'--B\r\nContent-Disposition: form-data; name="file"; filename="x.obj"\r\nContent-Type: text/plain\r\n\r\n'
        for _ in range(40):
            yield b"v 1 2 3\n" * 100
        yield b"\r\n--B--\r\n"

    resp = await client.post(URL, data=chunks(), headers={"Content-Type": "multipart/form-data; boundary=B"})
    assert resp.status == 413
    assert len(files(cfg_dir)) == 1


async def test_total_and_count_limits(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_ws_client, monkeypatch) -> None:
    client = await hass_client()
    monkeypatch.setattr(models_mod, "MODELS_MAX_TOTAL", len(OBJ) * 2 + 5)
    assert (await upload(client, edit_token, ("1.obj", OBJ)))[0].status == 201
    assert (await upload(client, edit_token, ("2.obj", OBJ)))[0].status == 201
    resp, body = await upload(client, edit_token, ("3.obj", OBJ))
    assert resp.status == 409 and body["code"] == "limit" and "voll" in body["message"]
    assert len(files(cfg_dir)) == 2
    monkeypatch.setattr(models_mod, "MODELS_MAX_TOTAL", 10**9)
    monkeypatch.setattr(models_mod, "MODELS_MAX_COUNT", 2)
    resp, body = await upload(client, edit_token, ("3.obj", OBJ))
    assert resp.status == 409 and "Höchstens 2" in body["message"]
    # nach dem Löschen geht wieder eins
    call = await ws_call(hass, hass_ws_client)
    first = hass.data[DOMAIN].models.listing()[0]["id"]
    assert (await call(type="haus3d/models/delete", model_id=first, token=edit_token))["success"]
    assert (await upload(client, edit_token, ("3.obj", OBJ)))[0].status == 201


async def test_fetch_id_tricks_and_unknown(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_client_no_auth) -> None:
    client = await hass_client()
    (cfg_dir / "geheim.txt").write_text("nicht ausliefern")
    (cfg_dir / "haus3d" / "models").mkdir(parents=True, exist_ok=True)
    (cfg_dir / "haus3d" / "models" / "0123456789abcdef.stl").write_bytes(make_stl())  # Datei ohne Eintrag
    resp, body = await upload(client, edit_token)
    model_id = body["model"]["id"]
    assert (await client.get(f"{URL}/{model_id}")).status == 200
    tricks = [
        "..%2F..%2Fgeheim.txt",
        "..%2f..%2fgeheim.txt",
        "%2e%2e%2fgeheim.txt",
        "../geheim.txt",
        "..\\geheim.txt",
        f"{model_id}.stl",  # mit Endung
        f"{model_id}%00.stl",
        f"{model_id[:-1]}",  # zu kurz
        f"{model_id}0",  # zu lang
        model_id.upper(),
        "0123456789abcdef",  # Datei da, aber nie hochgeladen (kein Eintrag)
        "ffffffffffffffff",  # gut geformt, unbekannt
        "%20" + model_id[1:],
        f"{model_id}%0A",
    ]
    for t in tricks:
        resp = await client.get(f"{URL}/{t}")
        assert resp.status in (400, 404), (t, resp.status)
        assert "nicht ausliefern" not in await resp.text()
    anon = await hass_client_no_auth()
    assert (await anon.get(f"{URL}/{model_id}")).status == 401


async def test_models_survive_reload_and_flag_missing_files(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_ws_client, setup_integration) -> None:
    client = await hass_client()
    keep = (await upload(client, edit_token, ("a.stl", make_stl()), name="Bleibt"))[1]["model"]
    lost = (await upload(client, edit_token, ("b.stl", make_stl()), name="Verloren"))[1]["model"]
    (cfg_dir / "haus3d" / "models" / f"{lost['id']}.stl").unlink()  # z. B. unvollständig zurückgespielt
    assert await hass.config_entries.async_reload(setup_integration.entry_id)
    await hass.async_block_till_done()
    call = await ws_call(hass, hass_ws_client)
    res = (await call(type="haus3d/models/list"))["result"]
    by_id = {m["id"]: m for m in res["models"]}
    assert by_id[keep["id"]]["name"] == "Bleibt" and "missing" not in by_id[keep["id"]]
    assert by_id[lost["id"]]["missing"] is True
    assert (await client.get(f"{URL}/{keep['id']}")).status == 200
    assert (await client.get(f"{URL}/{lost['id']}")).status == 404
    assert res["limits"]["file"] == 25 * 1024 * 1024 and res["limits"]["count"] == 200 and res["limits"]["total"] == 300 * 1024 * 1024
    assert res["used"] == keep["size"] + lost["size"]


# ------------------------------------------------------------------------------------ Liste, Umbenennen, Löschen


async def test_ws_list_rename_delete(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_ws_client) -> None:
    client = await hass_client()
    call = await ws_call(hass, hass_ws_client)
    assert (await call(type="haus3d/models/list"))["result"]["models"] == []
    one = (await upload(client, edit_token, ("a.glb", make_glb()), name="Eins"))[1]["model"]
    two = (await upload(client, edit_token, ("b.obj", OBJ), name="Zwei"))[1]["model"]
    listed = (await call(type="haus3d/models/list"))["result"]["models"]
    assert [m["id"] for m in listed] == [one["id"], two["id"]] and all(m["uses"] == 0 for m in listed)

    # Umbenennen: ohne Freigabe gesperrt, mit Freigabe geändert, leere und lange Namen abgelehnt
    res = await call(type="haus3d/models/rename", model_id=one["id"], name="Neu")
    assert res["error"]["code"] == "locked"
    res = await call(type="haus3d/models/rename", model_id=one["id"], name="  Neuer   Name ", token=edit_token)
    assert [m["name"] for m in res["result"]["models"]] == ["Neuer Name", "Zwei"]
    assert hass.data[DOMAIN].models.public(one["id"])["name"] == "Neuer Name"
    for name in ("", "   ", "x" * 61):
        assert (await call(type="haus3d/models/rename", model_id=one["id"], name=name, token=edit_token))["error"]["code"] == "invalid_format"
    assert (await call(type="haus3d/models/rename", model_id="ffffffffffffffff", name="X", token=edit_token))["error"]["code"] == "not_found"
    for bad in ("../x", one["id"] + "\n", one["id"][:-1], 5):
        assert (await call(type="haus3d/models/rename", model_id=bad, name="X", token=edit_token))["error"]["code"] == "invalid_format", bad

    # Verwendung: gespeicherte Möbel (echtes Haus und Testhaus) zählen
    data = hass.data[DOMAIN]
    building = copy.deepcopy(data.building)
    building["floors"][0]["furniture"] += [
        {"id": "m_a", "type": "custom_model", "x": 1, "z": 1, "rotation": 0, "model": one["id"]},
        {"id": "m_b", "type": "custom_model", "x": 2, "z": 1, "rotation": 0, "model": one["id"], "fit": "stretch"},
    ]
    assert (await call(type="haus3d/building/save", building=building, token=edit_token))["success"]
    house = (await call(type="haus3d/sandbox/create", name="Spielwiese", source="current", token=await data.access.async_verify("admin", "0000", "adm")))["result"]["house"]
    assert house
    uses = {m["id"]: m["uses"] for m in (await call(type="haus3d/models/list"))["result"]["models"]}
    assert uses == {one["id"]: 4, two["id"]: 0}  # 2 im echten Haus + 2 in der Kopie

    # Löschen: ohne Freigabe gesperrt; danach weg samt Datei, Abruf 404
    assert (await call(type="haus3d/models/delete", model_id=one["id"]))["error"]["code"] == "locked"
    assert (cfg_dir / "haus3d" / "models" / f"{one['id']}.glb").exists()
    res = await call(type="haus3d/models/delete", model_id=one["id"], token=edit_token)
    assert [m["id"] for m in res["result"]["models"]] == [two["id"]]
    assert files(cfg_dir) == [f"{two['id']}.obj"]
    assert (await client.get(f"{URL}/{one['id']}")).status == 404
    assert (await call(type="haus3d/models/delete", model_id=one["id"], token=edit_token))["error"]["code"] == "not_found"
    # Möbel mit gelöschtem Modell bleiben im Grundriss (Platzhalter im Browser)
    assert any(m.get("model") == one["id"] for m in data.building["floors"][0]["furniture"])


async def test_store_content_is_clean(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_storage) -> None:
    """Im Store stehen nur Angaben zum Modell, keine Pfade und kein Token."""
    client = await hass_client()
    meta = (await upload(client, edit_token, ("a.stl", make_stl()), name="X", house="test1"))[1]["model"]
    text = json.dumps(hass_storage["haus3d.models"])
    assert str(cfg_dir) not in text and edit_token not in text and meta["id"] in text


# ------------------------------------------------------------------------------------ reine Funktionen und Schema


def test_validate_model_and_helpers() -> None:
    for ext, content in SAMPLES.items():
        validate_model(ext, content)
    validate_model("stl", STL_ASCII)
    validate_model("stl", make_stl(3) + b"\0" * 7)  # binär mit Füllbytes am Ende (manche Exporte hängen welche an)
    validate_model("stl", make_stl(3) + b"\n")
    validate_model("gltf", b"\xef\xbb\xbf" + make_gltf())  # Byte-Order-Mark
    validate_model("obj", b"  v -1.5 2 3\n")
    for ext in MODEL_EXTENSIONS:
        with pytest.raises(ModelError):
            validate_model(ext, b"")
        with pytest.raises(ModelError):
            validate_model(ext, bytes(range(256)) * 4)
    assert model_ext("A.GLB") == "glb" and model_ext("x.tar.gz") is None and model_ext(None) is None and model_ext(".stl") is None
    assert clean_name("  a \n b  ") == "a b" and clean_name("", "Modell") == "Modell" and clean_name(5) == "Modell"
    assert parse_size("1,2,3") == [1.0, 2.0, 3.0] and parse_size("1,2") is None and parse_size("0,0,0") is None and parse_size("1,2,5000") is None and parse_size("1,-2,3") is None


def _data_url(kind: str, raw: bytes) -> str:
    return f"data:image/{kind};base64," + base64.b64encode(raw).decode()


PNG = _data_url("png", b"\x89PNG\r\n\x1a\n" + b"\0" * 40)
JPEG = _data_url("jpeg", b"\xff\xd8\xff\xe0" + b"\0" * 40)
WEBP = _data_url("webp", b"RIFF\0\0\0\0WEBPVP8 " + b"\0" * 20)


def test_parse_thumb_accepts_only_small_real_images() -> None:
    for url in (PNG, JPEG, WEBP):
        assert parse_thumb(url) == url
    bad = [
        None,
        5,
        "",
        "data:image/gif;base64,R0lGODlhAQABAAAAACw=",  # andere Bildart
        "data:image/svg+xml;base64," + base64.b64encode(b"<svg onload=alert(1)>").decode(),
        "data:text/html;base64," + base64.b64encode(b"<b>x</b>").decode(),
        "https://example.invalid/a.png",
        'data:image/png;base64,iVBORw0KGgo="onerror="x',  # Anführungszeichen im Wert
        PNG + "\n",
        PNG + "!!",
        "data:image/png;base64,",  # leer
        "data:image/png;base64,%%%%",
        _data_url("png", b"kein Bild, nur Text"),  # Kennung passt nicht zur Art
        _data_url("jpeg", b"\x89PNG\r\n\x1a\n" + b"\0" * 8),
        _data_url("webp", b"RIFF\0\0\0\0WAVEfmt "),
        _data_url("png", b"\x89PNG\r\n\x1a\n" + b"\0" * 120_000),  # größer als 150 KB als Text
    ]
    for value in bad:
        assert parse_thumb(value) is None, value if not isinstance(value, str) else value[:60]


async def test_upload_thumb_is_stored_listed_and_survives_reload(hass: HomeAssistant, cfg_dir, edit_token, hass_client, hass_ws_client, hass_storage, setup_integration) -> None:
    client = await hass_client()
    meta = (await upload(client, edit_token, ("a.stl", make_stl()), name="Mit Bild", thumb=PNG))[1]["model"]
    plain = (await upload(client, edit_token, ("b.stl", make_stl()), name="Ohne Bild"))[1]["model"]
    assert meta["thumb"] == PNG and "thumb" not in plain
    assert hass_storage["haus3d.models"]["data"]["models"][meta["id"]]["thumb"] == PNG
    call = await ws_call(hass, hass_ws_client)
    by_id = {m["id"]: m for m in (await call(type="haus3d/models/list"))["result"]["models"]}
    assert by_id[meta["id"]]["thumb"] == PNG and "thumb" not in by_id[plain["id"]]
    assert (await client.get(f"{URL}/{meta['id']}")).status == 200  # das Bild ersetzt nicht die Datei
    # nach dem Neuladen noch da; ein von Hand verdorbenes Vorschaubild fällt weg (Kachel zeigt das Symbol)
    hass_storage["haus3d.models"]["data"]["models"][meta["id"]]["thumb"] = 'data:image/png;base64,AAAA"><script>'
    hass_storage["haus3d.models"]["data"]["models"][plain["id"]]["thumb"] = JPEG
    assert await hass.config_entries.async_reload(setup_integration.entry_id)
    await hass.async_block_till_done()
    call = await ws_call(hass, hass_ws_client)
    by_id = {m["id"]: m for m in (await call(type="haus3d/models/list"))["result"]["models"]}
    assert "thumb" not in by_id[meta["id"]] and by_id[plain["id"]]["thumb"] == JPEG


async def test_upload_ignores_unusable_thumb_but_keeps_the_model(hass: HomeAssistant, cfg_dir, edit_token, hass_client) -> None:
    client = await hass_client()
    too_big = "data:image/png;base64," + "A" * (models_mod.MODEL_THUMB_MAX + 10)
    for bad in ("data:image/gif;base64,R0lGODlhAQABAAAAACw=", "irgendein Text", _data_url("png", b"nicht png"), too_big, ""):
        resp, body = await upload(client, edit_token, ("a.stl", make_stl()), name="X", thumb=bad)
        assert resp.status == 201 and "thumb" not in body["model"], bad[:40]
    assert len(files(cfg_dir)) == 5
    # ein Vorschaubild darf die Obergrenze für die Datei nicht verringern: Formularfelder zählen nicht zur Datei
    resp, body = await upload(client, edit_token, ("b.stl", make_stl()), name="Y", thumb=PNG, unit="cm", up="z")
    assert resp.status == 201 and body["model"]["thumb"] == PNG and body["model"]["unit"] == "cm"


def test_furniture_model_fields_are_soft() -> None:
    base = {"version": 1, "floors": [{"id": "eg", "name": "EG", "elevation": 0, "height": 2.5, "rooms": [{"id": "r", "name": "R", "points": [[0, 0], [3, 0], [3, 3], [0, 3]]}]}]}
    good = "0123456789abcdef"
    items = [
        {"id": "a", "type": "custom_model", "x": 1, "z": 1, "model": good, "fit": "stretch"},
        {"id": "b", "type": "custom_model", "x": 1, "z": 1, "model": "../etc/passwd", "fit": "zoom"},
        {"id": "c", "type": "custom_model", "x": 1, "z": 1, "model": 5},
        {"id": "d", "type": "custom_model", "x": 1, "z": 1, "model": good + "\n"},
        {"id": "e", "type": "sofa", "x": 1, "z": 1},
    ]
    base["floors"][0]["furniture"] = items
    a, b, c, d, e = validate_building(base)["floors"][0]["furniture"]
    assert a["model"] == good and a["fit"] == "stretch"
    assert b["model"] is None and b["fit"] is None  # ungültig → weich ersetzt, der Stand bleibt gültig
    assert c["model"] is None and d["model"] is None
    assert "model" not in e and "fit" not in e
