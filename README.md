# Haus 3D

Haus 3D zeigt deinen Grundriss als interaktives 3D-Modell in einem eigenen Panel der Seitenleiste von Home
Assistant (HA). Licht, Fenster, Türen, Rollläden, Raumklima, Anwesenheit und Energiefluss siehst du live
am Modell und schaltest Geräte direkt dort. Den Grundriss zeichnest du im eingebauten Editor oder liest ihn
ein.

Unabhängiges, inoffizielles Projekt – komplett kostenlos, ohne Bezahl-Funktionen (siehe
[Marken & Hinweise](#marken--hinweise)).

Was sich je Version geändert hat, steht im [CHANGELOG.md](CHANGELOG.md).

**Inhalt:** [Überblick](#überblick) · [Installation](#installation) · [Erste Schritte](#erste-schritte) ·
[Bedienung](#bedienung) · [Bearbeiten, Admin und PIN](#bearbeiten-admin-und-pin) · [Editor](#editor) ·
[Energie](#energie) · [Alltag](#alltag) · [Wandtablet und Dienste](#wandtablet-und-dienste) ·
[Simulation und Testhaus](#ausprobieren-simulation-und-testhaus) · [Daten](#daten-import-export-und-verlauf) ·
[Update](#update) · [Entwicklung](#entwicklung-und-tests) · [Unterstützen](#unterstützen) ·
[Marken & Hinweise](#marken--hinweise) · [Lizenz](#lizenz)

## Überblick

- **3D-Modell deines Hauses**: Etagen, Räume, Fenster, Türen, Möbel, Garten und Dach – ohne Decken, damit du
  von oben hineinsiehst.
- **Live-Status**: Räume in Lampenfarbe, offene Fenster rot, gekippte orange, fahrende Rollläden und Tore.
- **Geräte automatisch im Raum** über die HA-Bereiche – Antippen schaltet, Gedrückthalten zeigt Details.
- **Raumfenster** mit allen Geräten eines Raums, Raumklima, Medien, Kamera-Vorschau, Szenen und Lüften-Timer.
- **Statusleiste, Hinweise und Gute-Nacht-Check** für offene Fenster, Lichter, Schlösser, Melder und Regen.
- **Energie**: Karte mit Tagesverlauf und Speicher-Restzeit, Fluss in Leitungen, PV-Leistung je Dachfeld.
- **Alltag**: Waschmaschine fertig, Müllabfuhr, Strompreis, Lüften, Schimmelgefahr, Heizungspause, Urlaub.
- **Zeitstrahl, Bodenfarbe, Begehen**: Tag zurückspulen, Böden nach Messwerten färben, durchs Haus gehen.
- **Grundriss-Editor** in 2D und 3D mit Grundeinstellungen-Assistent, Katalog „Einrichten“ (205 Typen),
  Treppen, Dach, Leitungen und Bauplan als Vorlage.
- **Info-Hologramme**: Antippen eines Raums zeigt über PC, Server, Heizung, 3D-Drucker & Co. die Werte, die
  du dort hinterlegt hast.
- **Wandtablet** mit Kiosk-Adresse, Ruhemodus, Dimmen, Klingel-Kamera und Diensten für Automationen.
- **Geschützt und lokal**: Ansehen ohne PIN; Bearbeiten, Admin und Türen mit je eigener PIN; läuft offline.

## Installation

**Voraussetzung:** Home Assistant **2024.7** oder neuer. Es wird kein CDN geladen, Three.js r170 liegt
im Paket.

1. In **HACS** oben rechts ⋮ → **Benutzerdefinierte Repositories** →
   `https://github.com/tollzockt/Haus3d-HomeAssistant` mit Kategorie **Integration** hinzufügen.
2. In HACS **Haus 3D** suchen, **Herunterladen** und Home Assistant **neu starten**.
3. **Einstellungen → Geräte & Dienste → Integration hinzufügen → Haus 3D** (ohne Eingaben, nur einmal
   möglich). Danach erscheint **Haus 3D** in der Seitenleiste – für alle HA-Benutzer, anfangs mit einem
   Beispielhaus.

**Manuell:** `custom_components/haus3d` nach `<config>/custom_components/haus3d` kopieren, neu starten und die
Integration wie in Schritt 3 hinzufügen.

## Erste Schritte

1. **PINs ändern**: Zahnrad (oben rechts) → **Admin-Einstellungen** → Admin-PIN eingeben (ab Werk `0000`)
   → **PIN & Zugang** → neue PINs für Bearbeiten, Admin und Türen festlegen (je 4–8 Ziffern).
2. **Grundriss zeichnen oder importieren**: Zahnrad → **Bearbeiten** (PIN) → **Grundriss** in der grünen
   Leiste – beim ersten Mal fragen die **Grundeinstellungen** Name, Norden, Etagen, Wände, Dach und Bauplan ab
   (siehe [Editor](#editor)) – oder Admin-Einstellungen → Daten & Verlauf → **Importieren (JSON) …**.
3. **Räume den HA-Bereichen zuordnen**: im Editor einen Raum wählen → „Bereich in Home Assistant“ →
   **Speichern**. Die Geräte des Bereichs erscheinen dann von selbst im Raum.
4. **Energie einrichten**: Admin-Einstellungen → **Energie** → **Aus HA-Energie übernehmen** → **Speichern**.
5. **Wandtablet (optional)**: auf dem Tablet `/haus3d?kiosk` öffnen und es unter Admin-Einstellungen →
   **Wandtablet** benennen (siehe [Wandtablet und Dienste](#wandtablet-und-dienste)).

## Bedienung

Ansehen und Schalten gehen ohne PIN; Knöpfe zum Bearbeiten (Stifte, „+“) gibt es nur im Bearbeiten-Modus.

### Ansicht

- **Kamera**: Ziehen mit der linken Maustaste dreht, das Mausrad zoomt, Ziehen mit der rechten verschiebt;
  ein Finger dreht, zwei Finger zoomen und verschieben. Jede Etage merkt sich ihre letzte Ansicht.
- **Etagen-Leiste** rechts: ▲, „Alle“, Etagen, ▼; ein Doppeltipp auf die gewählte Etage passt die Ansicht ein.
  Das Hausdach siehst du nur in „Alle“, sonst schaust du in die Etage hinein.
- **Zahnrad**: Stil (Auto nach `sun.sun`, Tag, Nacht, Cyber), Qualität (Automatisch, Akku, Ausgewogen, Schön),
  Geräte als Symbole oder 3D sowie Kacheln für Raster, Raumnamen, Dach, Schatten, Wetter, Geräte, Möbel,
  Anwesenheit, Leitungen, Kamera-Sicht und Vollbild. Weitere Ebenen stehen unter Admin-Einstellungen →
  Anzeige.
- **Qualität**: „Akku“ zeichnet ohne Schatten und Lichtschein; echte Sonnenschatten gibt es mit der Kachel
  „Schatten“ ab „Ausgewogen“.
- **Meine Ansicht**: Stil, Qualität und Ebenen gelten für deinen HA-Benutzer auf allen Geräten – außer im
  Kiosk (`?kiosk`) und mit „Eigene Ansicht“ (siehe [Wandtablet](#wandtablet-und-dienste)).
- **Wetter, Sonne, Jahreszeit**: Regen, Schnee und Hagel fallen draußen passend zur Wetter-Entität (bei Schnee
  wird es draußen weiß, bei Gewitter blitzt es), das Licht kommt aus Richtung der echten Sonne, der Garten
  folgt der Jahreszeit (Admin-Einstellungen → Haus & Wetter).

### Geräte und Räume

- **Automatisch im Raum**: Für Räume und Gartenflächen mit HA-Bereich erscheinen Licht, Schalter, Lüfter,
  Rollläden, Tore, Klima, Schlösser, Kameras, Saugroboter, Netzwerkgeräte sowie Fenster- und Türkontakte;
  versteckte, Diagnose- und Konfigurations-Entitäten bleiben weg.
- **Antippen** schaltet Licht, Schalter und Lüfter, fährt Rollläden, startet Skripte, Szenen und Taster und
  wechselt bei Medien zwischen Wiedergabe und Pause. Garagentor und Sirene fragen nach (abschaltbar unter
  Admin-Einstellungen → Haus & Wetter → „Nachfragen“); Schlösser schließen sofort ab und öffnen nur mit
  Tür-PIN. Thermostat, Kamera und Netzwerkgerät öffnen ein eigenes Fenster, alles andere „Weitere Infos“.
  **Gedrückthalten** öffnet bei jedem Gerät „Weitere Infos“.
- **Raum antippen** fährt die Kamera hin, **Gedrückthalten** öffnet das **Raumfenster** (bis zu 3 zugleich):
  Temperatur, Feuchte, Bewegung, Lüften-Rat, Licht, Rollläden, Solltemperatur, Szenen, „Lüften“, Medien,
  Saugroboter, Kamera-Vorschau und alle Geräte des Bereichs. Über Gegenständen mit hinterlegten Werten
  schweben dabei **Info-Hologramme** mit Live-Werten (Wert antippen = „Weitere Infos“; Tipp ins Leere blendet
  sie aus). Im Bearbeiten-Modus blendet **Geräte anpassen**
  (Regler-Symbol) Geräte aus oder holt andere dazu; **+ Szene** speichert eine HA-Szene (braucht ein
  HA-Administratorkonto).
- **Thermostat**: Solltemperatur mit − und +, dazu die Betriebsarten.
- **Kamera**: Standbild alle 2 s und „Live“. Im Bearbeiten-Modus mit Admin-PIN machen „Als Klingel-Kamera“
  und „Klingel-Auslöser“ (`event.…` oder Binärsensor) sie zur Klingel-Kamera: Klingelt es, wacht das Tablet
  auf und zeigt die Kamera 60 s lang.
- **Netzwerkgeräte** (Geräte-Tracker einer Router- oder Controller-Integration) zeigen IP, WLAN, Signal,
  Clients und „Neu starten“ (falls angeboten).
- **Anwesenheit**: Personen stehen oben als Bild (zu Hause farbig, unterwegs grau mit Ort), Bewegungsmelder
  zeigen „Bewegung“ am Raumnamen.

### Kurzwahl, Funktionsrad, Karten und Favoriten

- **Kurzwahl** (unten links): Automationen, Skripte, Szenen, Taster, Schalter, Lichter, Rollläden, Schlösser
  und Lüfter, optional mit Nachfrage. Gedrückthalten einer Automation oder eines Skripts zeigt Status und
  „zuletzt“ (im Bearbeiten-Modus auch „Ablauf ansehen“).
- **Funktionsrad** (unten rechts): Energiefluss, Bodenfarbe, Zeitstrahl, Sicherheit, Netzwerk, Gute Nacht,
  Blickwinkel, Begehen und Ansicht einpassen.
- Beide Räder drehst du mit dem Finger oder dem Mausrad. Einträge änderst du über das „+“ (Bearbeiten-Modus)
  oder unter Admin-Einstellungen → Kurzwahl & Funktionsrad.
- **Blickwinkel**: Iso, Oben, Süd, Nord, Ost, West und bis zu 6 eigene („+ Merken“). **Sicherheit** färbt
  Fenster und Türen: zu grün, gekippt orange, offen rot.
- **Karten** oben rechts: Energie-Karte und bis zu 5 eigene mit je bis zu 12 Werten (Admin-Einstellungen →
  Karten oder Stift an der Karte im Bearbeiten-Modus).
- **Favoriten** unten: die bis zu 6 meistgenutzten Geräte dieses Browsers.

### Statusleiste, Hinweise und Gute Nacht

- **Statusleiste** oben: Chips wie „Licht an“, „offen · gekippt“, Schlösser, Alarm, „Alles zu“ und
  „Überschuss“, jeweils mit Liste nach Etagen; die Glocke zählt die Hinweise.
- **Hinweise** erscheinen als Banner mit „Zeigen“ und „Ausblenden“, der Raum färbt sich rot oder orange. Regeln
  unter Admin-Einstellungen → Hinweise: Regen bei offenem Fenster, Rauch-, Wasser- und Gasmelder, Heizung bei
  offenem Fenster, hohe Feuchte, Haustür (10 min) oder Garage (15 min) offen, Akku unter 15 %.
- **Gute Nacht / Haus verlassen** (Funktionsrad oder Chip „Alles zu“) listet offene Fenster und Türen (nur als
  Liste, Tipp zeigt den Raum), dazu Tore, Schlösser, Lichter und (nur bei Gute Nacht) Rollläden mit je einem
  Knopf. „Fertig – …“ erledigt alles Angehakte und startet das unter Admin-Einstellungen → Abläufe &
  Sicherheit gewählte Skript.

### Zeitstrahl, Bodenfarbe, Schatten und Begehen

- **Zeitstrahl**: von Mitternacht bis 24 h voraus – die Vergangenheit aus dem HA-Verlauf, die Vorschau aus
  Wettervorhersage, Sonnenstand und erwarteter PV-Leistung (kWp unter Admin-Einstellungen → Alltag).
  Geschaltet wird dabei nichts.
- **Bodenfarbe** schaltet der Reihe nach durch: Temperatur (18 °C blau bis 26 °C rot), Feuchte, CO₂,
  Leistung, Energie heute, aus.
- **Schatten**: PV-Feld auf dem Dach antippen → „Verschattung prüfen“ (Verlust je Feld, braucht den
  HA-Standort), dort auch „Schatten-Zeitraffer“.
- **Begehen**: durchs Haus gehen aus Augenhöhe – linker Joystick zum Gehen, rechter zum Umsehen, am PC WASD;
  durch Türen gehst du hindurch, Esc beendet.

## Bearbeiten, Admin und PIN

| Stufe | PIN | Erlaubt |
| --- | --- | --- |
| Ansehen | keine | Haus ansehen und Geräte schalten |
| Bearbeiten | Bearbeiten-PIN | Editor, Name oben links, Karten, „+“ an den Rädern, Geräte anpassen, Raum-Szenen |
| Admin | Admin-PIN | zusätzlich die Admin-Einstellungen mit PINs, Import, Verlauf und Simulation |
| Tür | Tür-PIN | Schlösser aus Haus 3D heraus entriegeln oder öffnen |

- Zahnrad → **Bearbeiten** 🔒 bzw. **Admin-Einstellungen** 🔒 startet den Modus. Oben steht dann eine grüne
  Leiste „Bearbeiten“ (mit „Grundriss“) bzw. eine orange „Admin“, jeweils mit „Beenden“; Admin schließt
  Bearbeiten ein. Freigaben enden mit „Beenden“, beim Schließen der Seite oder nach 10 min ohne Bedienung.
- Wer eine PIN kennt, darf die jeweilige Stufe nutzen, auch ohne Admin-Konto in Home Assistant; ohne PIN
  speichert niemand etwas. Haus-Einstellungen wie Energie, Hinweise, Wetter, Norden und Alltag lassen sich nur
  mit der Admin-PIN ändern.
- Das PIN-Feld prüft ab 4 Ziffern von selbst; eine falsche PIN löst nichts aus, nach 10 Fehlversuchen gibt es
  30 s Pause. PINs ändern: Admin-Einstellungen → **PIN & Zugang** (gespeichert wird nur ein Hash).
- **Tür-PIN**: Aufschließen über Symbol, Raumfenster, 3D-Gerät, Favorit, Kurzwahl oder Funktionsrad fragt die
  Tür-PIN ab, Home Assistant prüft sie; Abschließen geht ohne. Die Tür-PIN schützt nur die Bedienung in
  Haus 3D, nicht „Weitere Infos“, Automationen oder die übrige HA-Oberfläche.
- **Name oben links**: im Bearbeiten-Modus antippen und ändern (leer = „Haus 3D“).
- **Admin-Einstellungen** gliedern sich in Haus & Wetter, Energie, Karten, Hinweise, Alltag, Abläufe &
  Sicherheit, Kurzwahl & Funktionsrad, Anzeige, Wandtablet, Daten & Verlauf sowie PIN & Zugang. Unten links
  steht die installierte Version (bei Vorabversionen mit „Vorabversion“).

## Editor

Zahnrad → **Bearbeiten** (PIN) → **Grundriss** in der grünen Leiste öffnet den Editor – alternativ der
Lineal-Stift in der Kopfzeile. Er startet mit der gewählten Etage, in der Ansicht „Alle“ mit der untersten.

**Grundeinstellungen**: Beim ersten Öffnen (und immer bei einem leeren Haus) führt ein Fenster durch vier
Schritte – **Haus** (Name, Norden), **Etagen** (Keller, Vollgeschosse, Dachgeschoss mit Kniestock,
Geschosshöhe), **Wände & Dach** (Wandstärken, Dachform, Neigung) und **Bauplan** (Foto als Vorlage).
„Fertig“ legt fehlende Etagen an – vorhandene bleiben immer erhalten – und lässt sich mit einem Schritt
rückgängig machen. Später wieder über „Grundeinstellungen“ in der Editor-Leiste (am Tablet unter „⋯“) oder
im Etagen-Feld. Norden lässt sich nur mit der Admin-PIN ändern.

### Ansichten und Werkzeuge

- **Ansicht**: **2D**, **2D + 3D** oder **3D**.
- **Werkzeuge**: Auswählen, Raum (Rechteck), Raum (frei), Wand, Fenster, Tür, Garagentor, Einrichten, Gerät,
  Garten, Linie, Leitung, Verteiler, Messen, Vorlage. Am Tablet stehen sie im Werkzeug-Menü (Knopf mit dem aktuellen
  Werkzeug und ▾), weitere Funktionen unter „⋯“.
- Ist nichts gewählt, zeigt das Eigenschaftenfeld die Etage: Name, Höhen, „Etage in Home Assistant“,
  Wanddicken, Flächen, „+ Etage“ und „Etage löschen“.

### Räume, Wände, Fenster und Türen

- **Räume** als Rechteck ziehen oder Punkt für Punkt zeichnen und einem HA-Bereich zuordnen; dazu Bodenbelag,
  Wandfarben, Texturen (Bilder ohne Relief), eigenes Dach (Schuppen, Carport) und „Energie: Balkonkraftwerk“.
- **Wände** eines gewählten Raums ziehen (Nachbarräume ziehen mit) oder antippen, um nur diese Wand zu
  gestalten; das Werkzeug „Wand“ zeichnet freie Wände.
- **Fenster, Türen, Garagentore**: auf eine Wand tippen und zum Verschieben daran entlangziehen. Einstellbar
  sind Maße, Anschlag, Flügel, Türart (z. B. Haustür, Glastür, Schiebetür), Rahmenfarbe, Kontakt, Kippsensor
  und Rollladen. Kellerfenster bekommen auf Wunsch einen **Lichtschacht** außen (Betonschacht mit Gitterrost
  auf Geländehöhe; Tiefe und Breite einstellbar).

### Einrichten und Geräte

- **Einrichten** (Katalog) mit Suche und 3D-Vorschau: 205 Typen, oben gegliedert in **Drinnen** und
  **Draußen**, darunter aufklappbare Kategorien – Wohnen, Essen, Küche, Schlafen, Bad & Wäsche, Büro, Technik,
  Licht, Bau, Möbelserien, LED, Gaming, Wechselrichter & Speicher und Eigene Körper bzw. Garten,
  Wallbox & E-Auto und Solar-Aufständerung. Welche Bereiche offen sind, merkt sich der Browser. Möbelserien gibt es in den Maßen bekannter
  Serien, Wallboxen, Speicher und Konsolen in den Maßen gängiger Modelle – alles eigene, vereinfachte Formen.
- Möbel haben Maße, Drehung, Höhe über Boden, Farbe und eine verknüpfte Entität; Lampen und LEDs leuchten in
  der Farbe ihres Lichts. Der **Magnet** stellt Möbel beim Ziehen bündig an die nächste Wand.
- **Raster**: Würfelregale mit „Würfel breit/hoch“, Solar-Aufständerungen mit „Module breit/tief“ (Ost-West:
  Modulpaare, Fassade: Module hoch) – die Maße folgen der Anzahl.
- **Info-Hologramm**: bis zu 6 Werte (Entität und Name) je Gegenstand, z. B. CPU-Temperatur am PC, Fortschritt
  am 3D-Drucker oder Vorlauf am Heizkessel. Neu im Katalog unter Technik: 3D-Drucker und NAS / Heimserver.
- Werkzeug **Gerät**: setzt Entitäten der Bereiche dieser Etage an ihre echte Stelle; Kameras bekommen
  Blickrichtung, Sichtfeld, Neigung und Reichweite.

### Garten

- **Gartenflächen**: Rasen, Terrasse, Weg, Einfahrt, Pool, Beet, Hecke, Zaun, Balkon, Kies, Pflaster oder
  Steingarten – mit HA-Bereich für Gartenlicht und Sensoren und mit Geländer oder Zaun am Rand.
- **Linie** zeichnet Wege, Hecken, Zäune und Mauern; **Höhen automatisch** verbindet Gartenflächen
  verschiedener Etagen zu einem Hang. Bäume, Büsche, Grill und mehr stehen im Katalog unter „Garten“.

### Dach und Dachgeschoss

- **Hausdach** unter Admin-Einstellungen → Haus & Wetter: Flach-, Sattel-, Walm- oder Pultdach mit Neigung,
  Überstand, First, Flügel-Ende und Dachfarbe; L-, T- und U-Häuser bekommen automatisch ein zusammengesetztes
  Dach. Dort auch PV-Module je Himmelsrichtung oder als PV-Felder (Spalten × Reihen); genauer und
  verschiebbar geht es auf der Dach-Ebene.
- **Dach-Ebene** (Etagen-Auswahl → „Dach“): Kamin, Dachfenster, PV-Feld und Gaube setzen, Dachdeckung und
  Norden einstellen (Norden nur im Admin-Modus), Dachflächen auf die Hauswände ziehen; PV-Module, die nicht
  passen, werden rot.
- **Dachgeschoss**: „+ Dachgeschoss“ in der Etagen-Auswahl; das Hausdach setzt dann auf dem Kniestock an.

### Treppen

Einrichten → Drinnen → **Bau** → **Treppe**: gerade, L oder U mit Podest, L gewendelt oder Wendeltreppe, mit Geländer und
„Bis zur nächsten Etage“; die Deckenöffnung darüber entsteht automatisch. Dazu gibt es Treppenloch, Säule,
Stütze, Unterzug und Stellplatz.

### Leitungen und Verteiler

- **Leitung**: Strom, Wasser kalt, Wasser warm oder Netzwerk, am Boden oder an der Wand (Höhe je Punkt).
  Punkte rasten an Wänden ein, an Verteilern und gleichartigen Leitungen als „Abzweig“ – auch Zwischenpunkte
  werden dort verbunden, am Finger mit größerem Fangkreis. Vom Anfang
  (Zählerschrank, Hauswasser) zum Verbraucher zeichnen; am Ende hängt ein Raum, ein Gerät oder ein Sensor.
  Gewählte Leitung bearbeiten: Punkte ziehen, Strecke erneut antippen fügt einen Punkt ein, Punkt antippen
  ändert seine Höhe oder löscht ihn; „Alle Punkte auf Höhe“ setzt alle auf einmal.
- **Verteiler**: Haupt- und Unterverteilung (optional mit eigenem Zähler – zeigt dann, was „nicht zugeordnet“
  ist), Einspeisung, **Abzweigdose** (verbindet alle Stromleitungen, die dort beginnen, enden oder
  durchlaufen – z. B. Zuleitung eines Raums mit Steckdosen und Licht), Router, Switch, Wasser-Hausanschluss,
  Warmwasser und Durchführung zwischen Etagen (das Gegenstück entsteht automatisch). Verteiler rasten beim
  Setzen an Leitungen ihres Mediums ein; „als Gegenstand zeigen“ aus macht daraus einen reinen
  Verbindungspunkt ohne 3D-Modell.

### Hilfen

- Werkzeug **Vorlage**: Bauplan-Foto unter den Grundriss legen, zwei Punkte mit bekanntem Abstand antippen
  und die echte Länge eingeben – so bekommt das Bild die richtigen Maße; drehen (±90° oder gradgenau) oder
  „An Linie ausrichten“, damit eine Wand im Bild genau waagrecht liegt. **Maße** und **Messen** zeigen Längen,
  Winkel und Flächen; beim Zeichnen lassen sich Länge und Winkel eintippen.
- **Fang-Hilfen**: Raster und Fluchtlinien; unten links die Schalter „Frei“ (ohne Einrasten), „Einzeln“ (nur
  dieses Teil) und „Mehrfach“ (mehrere Teile wählen). Mehrere Teile lassen sich kopieren oder als eigener
  Baustein speichern. **Aufräumen** und **Lücken schließen** (Spalt bis 45 cm) gleichen kleine Versätze aus.
  **Außenwände bündig** (Etage gewählt, nichts markiert) setzt Außenwände, die bis 15 cm neben denen der Etage
  darunter liegen, genau darüber.
- **Tastatur**: Esc, Entf, Strg+Z/Y, Pfeiltasten, R dreht 90°, Strg+C/V/D. Am Tablet öffnet Gedrückthalten
  ein Kurzmenü.

### Speichern, Entwurf und Verlauf

**Speichern** speichert und schließt, **Zwischenspeichern** (Diskette) lässt den Editor offen, **Abbrechen**
fragt bei Änderungen nach. Ein Entwurf wird laufend im Browser gesichert; beim nächsten Öffnen des Editors
wählst du „Fortsetzen“ oder „Verwerfen“. Beim Speichern landet der alte Stand im Verlauf. Hat inzwischen ein
anderes Gerät gespeichert, meldet Haus 3D das.

## Energie

Einrichtung unter Admin-Einstellungen → **Energie**:

- **Aus HA-Energie übernehmen** schlägt Netz-, Solar- und Speicher-Entitäten aus dem Energie-Dashboard vor –
  Vorschläge prüfen und **Speichern**. Den Hausverbrauch trägst du selbst ein oder lässt ihn berechnen.
- **Netz**: ein Sensor mit Vorzeichen (+ Bezug, − Einspeisung) oder Bezug und Einspeisung getrennt. Zeigt ein
  Wert das falsche Vorzeichen (Netz oder Speicher), „Vorzeichen umkehren“ anhaken.
- **Erweiterungen**: beliebig viele PV-Anlagen, Balkonkraftwerke und AC-Speicher, auch PV mit eigenem Speicher
  (Hybrid-Anlage, Balkonspeicher); alles wird zusammengerechnet, kW und Wh werden umgerechnet.
- **Gerätevorlagen** (Auswahl „Gerät“) gibt es für über 20 gängige Wechselrichter-, Speicher- und
  Balkonkraftwerk-Integrationen, z. B. für Anlagen von Fronius, SMA oder Huawei. Haus 3D schlägt passende
  Sensoren vor und setzt beim Speicher Vorzeichen und Kapazität – bitte prüfen.

Die **Energie-Karte** oben rechts zeigt Verbrauch, Netz, Erzeugung, Speicher mit Restzeit („reicht bis ca. …“)
und Ertrag heute; „Tagesverlauf“ zeigt heute und gestern. Ihre Zeilen stellst du unter Admin-Einstellungen →
Karten → Tab „Energie“ ein.

Der **Energiefluss** läuft als Punkte durch die gezeichneten Leitungen; die Menge kommt vom Leitungsende
(Sensor, Gerät oder Raum). Eine Leitung oder ein Verteiler zeigt beim Antippen Wert, Richtung und
„Daran hängt“. **PV-Felder** auf dem Dach zeigen ihre Leistung, ohne eigenen Sensor anteilig geschätzt („ca.“).

## Alltag

Admin-Einstellungen → **Alltag**:

- **Waschmaschine, Trockner, Spülmaschine**: am Leistungssensor erkannt – Chip „läuft 42 min“ (ab 1 h z. B.
  „1:05 h“, mit Restzeit-Sensor „noch …“), dann „fertig“.
- **Termine & Müllabfuhr**: Kalender und Abfall-Sensoren; Chip mit dem nächsten Termin, Erinnerung am Vorabend.
- **Strompreis** fest oder dynamisch: „Kosten jetzt“ und „Günstig“ in der Energie-Karte, Kosten je Raum.
- **Lüften & Heizen**: Lüften-Timer (Standard 10 min), Schimmelgefahr an der kalten Wand und automatische
  Heizungspause bei offenem Fenster (nach 3 min; zurück, sobald alle Fenster zu sind).
- **Urlaub**: Funktionsrad → „Gute Nacht“ → „Haus verlassen“ → „Urlaub: Anwesenheit simulieren …“. Die
  Anwesenheitssimulation schaltet dann nach Sonnenuntergang bis 23:30 Uhr alle 10 min höchstens 2 Lichter
  zufällig.

Heizungspause und Urlaub laufen in Home Assistant, auch ohne offenes Tablet; die übrigen Hinweise prüft der
Browser, solange Haus 3D irgendwo offen ist.

## Wandtablet und Dienste

- **Kiosk-Adresse**: `/haus3d?kiosk` öffnet ohne Kopfzeile (das Zahnrad sitzt dann oben links).
  `&etage=<Etagen-ID>` (z. B. `eg` oder `all`) wählt die Etage, `&quality=akku` die Qualität.
- **Einstellungen für dieses Gerät** unter Admin-Einstellungen → **Wandtablet**: „Name dieses Geräts“ (Ziel
  der Dienste), „Eigene Ansicht“, „Kopfzeile ausblenden“, „Bildschirm anlassen“ (nur über https; sonst die
  Einstellung der HA-App bzw. des Kiosk-Browsers nutzen), „Startetage“, „Ruhe nach (min)“ (im Kiosk
  Standard 5) und „Dimmen“ von–bis.
- **Aufwecken**: Warnungen, die Klingel und Dienst-Befehle wecken das Tablet.

Die **Dienste** wirken auf alle offenen Haus-3D-Seiten; mit `target` nur auf das Gerät, dessen „Name dieses
Geräts“ damit übereinstimmt.

```yaml
# Flur-Tablet: EG von oben zeigen und einen Hinweis einblenden
- action: haus3d.show
  data: { floor: eg, view: oben, target: flur-tablet }
- action: haus3d.notify
  data: { message: "Paket an der Haustür", level: info, room: flur, target: flur-tablet }
# Raum 15 s blinken lassen
- action: haus3d.highlight
  data: { room: kueche, seconds: 15 }
# Urlaub: Anwesenheit simulieren
- action: haus3d.away
  data: { on: true }
```

| Dienst | Felder |
| --- | --- |
| `haus3d.show` | `floor` (Etagen-ID oder `all`), `view` (`iso`, `oben`, `sued`, `nord`, `ost`, `west` oder gemerkte Ansicht), `room` (Raum-ID, Raumname oder Bereichs-ID; öffnet das Raumfenster), `target` |
| `haus3d.notify` | `message` (Pflicht), `level` (`info`/`warn` schließen nach 2 min, `critical` bleibt; Standard `warn`), `room`, `icon`, `target` |
| `haus3d.highlight` | `room` (Pflicht), `seconds` (1–600, Standard 10), `target` |
| `haus3d.reload` | `target` – lädt den Grundriss neu |
| `haus3d.away` | `on` (Pflicht, `true`/`false`) – Anwesenheitssimulation, läuft in Home Assistant |

## Ausprobieren: Simulation und Testhaus

- **Simulation** (im Admin-Modus Zahnrad → Kachel „Simulation“): Nichts wird wirklich geschaltet oder
  gespeichert. Die orange Leiste unten stellt Wetter, Uhrzeit und Solarleistung ein, „Beispielgeräte“ füllt
  Räume ohne Geräte. Gedrückthalten auf einem Gerät öffnet einen Simulationsdialog (an/aus, offen/zu,
  Rollladen-Position, Soll, Messwert). Die Simulation gilt nur in diesem Browser und endet mit dem
  Admin-Modus; danach lädt der echte Stand neu.
- **Testhaus**: Entwickler-Funktion (nur in einer bestätigten Entwickler-Instanz) mit bis zu 5 getrennten
  Häusern zum Ausprobieren (Admin-Einstellungen → Entwickler; Beispielhaus, Kopie oder leer). Das echte Haus
  bleibt unberührt, Geräte schalten nur mit „Geräte echt schalten“, „Mein Haus“ wechselt zurück. Normale
  Nutzer sehen sie nicht; sie schaltet nichts frei.

## Daten: Import, Export und Verlauf

Admin-Einstellungen → **Daten & Verlauf**:

- **Exportieren (JSON)** lädt `haus3d-JJJJ-MM-TT.json` herunter (ohne Bauplan-Fotos).
- **Importieren (JSON) …** liest rohe Grundrisse (`version: 1`, `floors`) und Exporte
  (`{format: "haus3d", building}`), bietet Lücken bis 45 cm zum Schließen an und ersetzt Grundriss und
  Einstellungen.
- **Verlauf …** stellt einen der letzten 20 Stände wieder her. Gesichert wird vor jedem Speichern, vor jedem
  Wiederherstellen und mit „Stand sichern“.

Alle Daten liegen in `<config>/.storage/haus3d.*`.

<details><summary>Datenformat</summary>

Gebäude-JSON mit `version: 1`; Pflichtfelder sind mit `*` markiert, Längen in Metern, Punkte als `[x, z]`.
Unbekannte Felder bleiben erhalten; ungültige Werte in neueren, optionalen Einstellungen ersetzt Haus 3D durch
den Standard, statt den Stand abzulehnen.

```text
floors[] ≤ 20    id*, name*, elevation*, height*, cut_height, ha_floor, attic, knee, background
  rooms[] ≤ 200  id*, name*, points* (3–200), area_id, floor_material (wood), floor_color, wall_color,
                 exterior_color, floor_texture, wall_texture, exterior_texture, edge_styles, roof,
                 solar_panels, energy_role, hidden_entities, panel, scenes
  openings[]     id*, room_id*, edge*, offset*, width*, height*, type* (window|door|garage), sill, hinge,
                 swing, leaves, style, contact, contact2, tilt, cover, frame_color, wall,
                 well {depth (0.4), width}
  outdoor[]      id*, type* (lawn|terrace|path|driveway|pool|bed|hedge|fence|balcony|gravel|paving|rockery),
                 points*, name, area_id, railing, railing_height, texture, heights, line, fence_style
  placements[]   entity_id*, x*, z*, y
  walls[]        id, a, b, thickness, height, color, texture
  furniture[]    id, type, x, z, rotation, w, d, h, mount_y, entity, color, name, variant,
                 info [{entity, name}] (≤ 6), cols, rows
                 (Treppe: stair_shape, railing, run_width, cut)
  pipes[]        id*, type* (strom|wasser_kalt|wasser_warm|netzwerk), points*, heights, entity, room, device,
                 joints
  nodes[]        id*, kind* (hv|uv|einspeisung|abzweig|router|switch|wasser_in|warm_in|durch), x*, z*, y,
                 name, entity, link, model
settings         wall_exterior (0.24), wall_interior (0.12), grid (0.05), wall_colors, wall_textures, title,
                 setup_done,
                 north, weather, season, house_flow, templates, energy_card, cards (≤ 5), quick, functions,
                 alerts, routines, security, safety, climate, presence, doorbell
  roof           type (none|flat|gable|hip|shed), pitch (35), overhang (0.4), direction (auto|x|z), wing_end,
                 color, texture, items [{type (chimney|skylight|pv|dormer), …}], adjust
  energy         haus, netz, netz_invert, netz_bezug, netz_einspeisung, sources [{type (pv|bkw|speicher),
                 power, energy, soc, capacity, reserve, …}], extra, kurz, ueberschuss
  daily          appliances, calendars, price, price_entity, kwp, vent_min, mold, waste_hour, window_heat
```

</details>

## Update

Neue Versionen bietet HACS als Update an: **HACS → Haus 3D → Aktualisieren** (fehlt das Update noch:
⋮ → „Informationen aktualisieren“; eine bestimmte Version über ⋮ → „Erneut herunterladen“), danach Home
Assistant neu starten und die Seite bzw. App einmal neu laden. Deine Daten bleiben erhalten, denn sie liegen
in `.storage` – auch wenn du die Integration entfernst und später wieder hinzufügst.

Vorabversionen (z. B. `0.23.0b1`) zeigt HACS nur, wenn bei Haus 3D unter ⋮ → **Erneut herunterladen** die
Option „Betaversionen anzeigen“ an ist.

## Entwicklung und Tests

```bash
node --test tests/js/*.test.mjs                          # Wände, Geräte, Import, Marken-Regeln (Node 20+)
pip install -r requirements_test.txt && python -m pytest -q tests/python   # Backend (HA 2024.7, Python 3.12)
NODE_PATH="$(npm root -g)" node tests/browser/run.mjs <ausgabeordner> [filter]   # Oberfläche (Playwright)
```

Regeln für Beiträge (kostenlos, eigenständig, Marken, Datenschutz) stehen in [CONTRIBUTING.md](CONTRIBUTING.md).

**Neue Version veröffentlichen** (Maintainer):

1. Version in `custom_components/haus3d/const.py` und `manifest.json` erhöhen, Eintrag in `CHANGELOG.md`
   ergänzen.
2. Alle Tests grün, dann den Stand auf `main` von `tollzockt/Haus3d-HomeAssistant` bringen.
3. Auf GitHub **Releases → Draft a new release**: Tag `v<version>` wie in `manifest.json`, Ziel `main`.
   Stabile Versionen als normales Release veröffentlichen (erst dann bietet HACS das Update an),
   Vorabversionen (`x.y.zbN`) als **Pre-release** markieren.

## Unterstützen

Haus 3D ist kostenlos und bleibt es – mit allen Funktionen und auch allen künftigen Erweiterungen und
Zusatzpaketen. Wenn es dir gefällt, freue ich mich über eine Spende – über den **„Sponsor“-Knopf** oben im Repo
oder im Panel unter **Zahnrad → ♥ Haus 3D unterstützen**. Spenden sind freiwillig und schalten nichts frei. Das
Panel zeigt 14 Tage nach dem ersten Öffnen einmalig einen dezenten Hinweis, nie auf dem Wandtablet.

## Marken & Hinweise

Haus 3D ist ein unabhängiges, inoffizielles Projekt und **komplett kostenlos** – mit allen Funktionen und
allen künftigen Erweiterungen. Spenden sind freiwillig und schalten nichts frei.

Genannte Firmen- und Produktnamen (z. B. IKEA, PlayStation, Xbox, Nintendo Switch, Tesla, Fronius, SMA) sind
Marken ihrer jeweiligen Inhaber. Haus 3D steht in keiner Verbindung zu diesen Unternehmen oder zu Home
Assistant, Nabu Casa bzw. der Open Home Foundation und wird von ihnen weder unterstützt noch geprüft. Die Namen
bezeichnen nur Maße („Maße wie …“) bzw. das Gerät und die passende Home-Assistant-Integration. Die 3D-Modelle
sind eigene, stark vereinfachte Darstellungen ohne Logos, Produktfotos oder Markenfarben; die Maße stammen aus
öffentlich zugänglichen Herstellerangaben, ohne Gewähr.

Rechteinhaber mit Einwänden erreichen mich über die
[GitHub-Issues](https://github.com/tollzockt/Haus3d-HomeAssistant/issues) – die betroffene Stelle wird
umgehend geändert.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Enthält [Three.js](https://threejs.org) r170 (MIT, siehe
[LICENSE-three.js.txt](LICENSE-three.js.txt) bzw. `custom_components/haus3d/frontend/vendor/LICENSE-three.txt`).
