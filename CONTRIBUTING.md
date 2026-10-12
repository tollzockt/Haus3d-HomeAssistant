# Mitmachen

Danke fürs Mitmachen! Ein paar feste Regeln, damit Haus 3D frei, eigenständig und rechtlich sauber bleibt.

## Kostenlos

Haus 3D ist komplett kostenlos – alle Funktionen und alle künftigen Erweiterungen und Zusatzpakete. Es gibt
keine Bezahl-Funktionen, keine Werbung und keine Affiliate-Links. Spenden sind freiwillig und schalten nichts
frei.

## Eigenständig

Haus 3D ist ein eigenes Projekt mit eigenem Datenformat (Exportkennung `haus3d`). Bitte keine Verweise auf
andere Grundriss- oder 3D-Apps (Namen, Formatkennungen, „wie in …“) in Code, Kommentaren, Doku, Tests oder
Commit-Texten.

## Marken und fremde Inhalte

- **Namen nur als Bezug:** Hersteller- und Produktnamen dürfen nur stehen, um Maße („Maße wie KALLAX“) oder ein
  Gerät und seine Home-Assistant-Integration zu bezeichnen. Bei Maß-Bezügen steht die Gattung vorne
  („Würfelregal 2×4 (Maße wie …)“, „Spielkonsole (Maße wie …)“); Geräte mit eigener Integration (Wallbox,
  Wechselrichter, Speicher, Mikrowechselrichter) dürfen unter ihrem Gerätenamen stehen.
- **Nie als Kategorie, Paket- oder Funktionsname**, nie in Werbung, Spendenaufrufen oder Sponsor-Stufen.
- **Nur in den Produktlisten:** Herstellernamen gehören in `frontend/catalog-extra.js` bzw.
  `frontend/energytemplates.js`; Hinweistexte, Platzhalter und Kommentare in anderen Dateien bleiben allgemein
  („Netzwerk-Integration“, „dynamischer Tarif“).
- **Keine Logos, Produktfotos, Texturen, CAD-/3D-Dateien oder Markenfarben** von Herstellern; keine Marken-Symbole
  (z. B. `mdi:github`, `mdi:sony-…`, `mdi:microsoft-…`). Das eigene Symbol liegt in
  `custom_components/haus3d/brand/`.
- **Eigene, vereinfachte Modelle:** Grundformen ohne die typischen Gestaltungsmerkmale der Originale (keine
  Markenfarben-Akzente, keine Designdetails nachbauen); Geräte einer Gruppe (Wallboxen, Wechselrichter,
  Speicher) sehen gleich aus, nur die Maße unterscheiden sich. Leuchtende Teile folgen nur einem verknüpften
  Licht.
- **Keine Anspielungen** auf fremde Modellnamen bei Gattungs-Möbeln (z. B. kein „…-Stil“ nach einem Produkt) und
  keine Produktnamen als Gattungswort (z. B. „Balkonspeicher“ statt eines Markennamens).
- **Daten:** Maße von Hand aus öffentlichen Angaben, gerundet; keine Preise, Artikelnummern, Produkttexte oder
  automatisch ausgelesenen Daten.
- **Keine Aussagen** wie „offiziell“, „zertifiziert“, „empfohlen von“ oder Ähnliches, das eine Verbindung zu
  Herstellern oder zu Home Assistant / Nabu Casa / Open Home Foundation nahelegt. Kein Home-Assistant-Logo.
- Neue Marken im README nur im Fließtext, nie als Überschrift; der Abschnitt „Marken & Hinweise“ bleibt erhalten.

Meldet sich ein Rechteinhaber, wird die betroffene Stelle umgehend geändert.

## Datenschutz

- Keine echten Entitäts-IDs, Namen oder Hausdaten von Nutzern im Repo; Testdaten verwenden neutrale IDs.
- Persönliche Stände gehören in den ignorierten Ordner `.local/`.

## Tests

```bash
node --test tests/js/*.test.mjs
python -m pytest -q tests/python
NODE_PATH="$(npm root -g)" node tests/browser/run.mjs <ausgabeordner> [filter]
```

`tests/js/brands.test.mjs` und `tests/python/test_schema.py` prüfen die Marken- und Datenschutzregeln mit.
