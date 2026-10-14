# Änderungen

## 0.23.0b3 (Vorabversion)

- **Mehr Wohnlichkeit drinnen**: „Wohnen & Deko“ (Bilderrahmen, Leinwandbild,
  Bildergruppe, Spiegel, Wanduhr, Bücherreihe, Vase mit Blumen, Kerzen, Kissen, Wolldecke, Sitzsack, Pouf,
  Schaukelstuhl, Klavier, Gitarre, Plattenspieler, Lichterkette, runder Teppich …), „Pflanzen“ (Monstera, Ficus,
  Palme, Kaktus, Olivenbaum, Orchidee, Hängepflanze, Kräuter …), „Küchengeräte“ (Kaffeevollautomat,
  Siebträger, Mikrowelle, Wasserkocher, Toaster, Dunstabzug, Inselhaube, Backofen im Hochschrank,
  Weinkühlschrank, Küchen- und Barwagen …), „Haustiere“ (Kratzbaum, Hundekorb, Aquarium mit Licht,
  Vogelkäfig, Terrarium …) und „Kinderzimmer“ (Babybett, Wickelkommode, Tipi, Spielküche, Schaukelpferd,
  Hochbett mit Rutsche …).
- **Kamin & Ofen**: Kaminofen (Rohr nach hinten oder zur Decke), Pelletofen, offener Kamin, Eckkamin,
  Ethanol-Wandkamin, Kachelofen mit Bank, Kaminholzregal und Kaminbesteck. Feld „Feuer an“ zeigt leuchtende
  Flammen hinter Glas; eine verknüpfte Entität hat Vorrang (an, heizt).
- **Vorhänge**: zweiteilig, einseitig, mit Schlaufen, Gardine (durchscheinend), Thermovorhang, Raffrollo und
  Plissee, mit Faltenwurf. „Geöffnet (%)“ rafft die Schals bzw. zieht Raffrollo und Plissee hoch; mit einem
  verknüpften Rollladen bzw. einer Abdeckung (cover) oder einem Schalter folgt der Vorhang deren Zustand.
- **Eigene 3D-Modelle**: Im Katalog „Einrichten“ steht oben „Eigene 3D-Modelle“ mit „Modell hochladen …“ –
  .glb und .gltf (mit Farben und Texturen) sowie .obj und .stl (einfarbig, Farbe wählbar), bis 25 MB je Datei.
  Der Dialog misst die Datei, schlägt die Einheit vor (m, cm, mm), fragt bei OBJ und STL, welche Achse oben ist,
  und zeigt die entstehende Größe. Kachel wählen und in den Plan tippen setzt das Modell in Originalgröße; in den
  Eigenschaften „Einpassen“ (Seitenverhältnis behalten oder auf Maße strecken), „Originalgröße“, Modellwechsel,
  „Umbenennen“ und „Modell löschen …“ (mit Nachfrage, wie viele Möbel es nutzen). Die Dateien bleiben auf dem
  eigenen Home Assistant (Konfigurationsordner, in HA-Backups enthalten); der JSON-Export enthält nur den Verweis.
- **Neigen und Kippen**: Gegenstände haben neben „Drehung (°)“ auch „Neigung (°)“ und „Kippen (°)“ (nicht
  Treppe, Treppenloch und Stellplatz). Die tiefste Ecke bleibt auf „Höhe über Boden“, die Mitte der Grundfläche
  bleibt stehen – ein umgekipptes Regal liegt auf dem Boden, ein leicht geneigtes lehnt an der Wand. Plan,
  Antippen, Magnet und 3D-Pfeile nutzen die Grundfläche des geneigten Gegenstands.
- **Bodentexturen drehen**: „Textur drehen (°)“ mit Knopf „+90°“ unter der Bodentextur eines Raums, unter der
  Textur einer Gartenfläche und unter dem Belag der Dachterrasse – für Parkett, Fliesen, Dielen und alle anderen
  Muster; angrenzende Räume mit gleicher Drehung laufen durch.
- **Neue Betontexturen und Beläge**: Beton geschliffen, Sichtbeton (Schalung, auch für Wände), Estrich, Epoxid
  mit Chips (Garagenboden) und Betonplatten groß (60 × 60 cm); das bisherige „Beton“ bleibt unverändert.
- **Steckdosen & Schalter**: neue Kategorie mit Steckdosen (einfach bis dreifach, mit USB, außen mit Klappe),
  Herdanschlussdose, Licht-, Serien- und Jalousieschalter, Dimmer, Taster, Netzwerk- und Antennendose,
  Bewegungsmelder, Smart-Wandtaster, Wandthermostat, Rauchmelder und Klingel. Sie rasten an Wänden ein und hängen
  in der üblichen Höhe (Steckdose 30 cm, Schalter 1,05 m); mit verknüpfter Entität zeigt eine Kontroll-LED den
  Zustand, Tippen schaltet.
- **Heizungsraum**: Pufferspeicher, Gastherme, Brennwert- und Pelletkessel, Pelletlager, Öltank,
  Ausdehnungsgefäß, Fußbodenheizungs- und Heizkreisverteiler, Hauswasserwerk, Enthärtung, Hauswasserfilter,
  Wasserzähler, Lüftungsgerät, Inneneinheit der Wärmepumpe, Solarstation, Luftentfeuchter und mehr.
- **Server & NAS mit Einbau in Schränke**: 19-Zoll-Geräte (Server 1/2/4 HE, Rack-NAS, Switch, PoE-Switch,
  Patchfeld, Firewall, USV, Fachboden …) und Tischgeräte (NAS 2/5/8-Bay, Mini-PC, Tower-Server, Router,
  Access Point, Modem, USV). Ein Gerät, das man in einen Netzwerk- oder Serverschrank setzt oder hineinzieht,
  zieht in die unterste freie Höheneinheit ein (Netzwerkschrank 22 HE, Serverschrank 42 HE); verschiebt oder
  dreht man den Schrank, gehen die Geräte mit, herausziehen oder „Ausbauen“ baut aus. Am Gerät „Höheneinheit
  (unten)“ und „In Schrank einbauen“, am Schrank „Belegt: x von y HE“ mit der Liste der Geräte. Der Schrank hat
  eine getönte Glastür; leer zeigt er wie bisher Platzhalter-Einschübe.
- **Erweiterungsakkus für den Balkonspeicher**: zwei neue Akkus (1,6 und 2,7 kWh) unter „Wechselrichter &
  Speicher“; am Balkonspeicher stapelt „Erweiterungsakkus darunter“ (0–5) die Akkus unter dem Gerät, die Höhe
  folgt. Die Kapazität für die Energie stellt man weiter in den Energie-Einstellungen ein.
- **Leitungen an Geräten**: Anfang und Ende jeder Leitung (Strom, Wasser, Netzwerk) rasten auch an Geräten ein –
  an allen Möbeln und Katalog-Gegenständen und an platzierten Geräten; Verteiler und Leitungen gehen vor, wenn sie
  näher sind. Wird das Gerät verschoben oder gedreht, zieht das Leitungsende mit (rechtwinklige Führung bleibt);
  wird es gelöscht, bleibt die Leitung mit gelöstem Ende stehen. Die Leitung zeigt „Endet an“ mit „lösen“, der
  Plan ein Stecker-Symbol, 3D ein senkrechtes Endstück bis zur Anschlusshöhe. Hat die Leitung kein eigenes Gerät,
  liefert die Entität des angeschlossenen Geräts Leistung bzw. Datenrate.
- **Garten**: neue Kategorien „Gartenmöbel“ (Stühle, Bänke, Lounge, Liegestuhl, Hängematte, Hollywoodschaukel,
  Strandkorb, Pavillon, Feuerschale, Außenküche …), „Beet & Gewächshaus“ (Hochbeete, Gewächshaus,
  Tomatenhaus, Frühbeet, Kräuterspirale, Regentonne, Gartenhaus, Insektenhotel …), „Spiel & Freizeit“ (Schaukel,
  Spielturm mit Rutsche, Trampolin, Sandkasten, Aufstellpool, Teich, eckiger Whirlpool …) und „Hof & Einfahrt“
  (Mülltonnen, Fahrradständer, Briefkasten, Paketbox …).
- **Garage & Werkstatt** und **Hydroponik & Anzucht**: Werkbank, Werkzeugwand, Schwerlastregal, Reifen,
  Fahrräder, Motorrad, Rasenmäher, Mähroboter, Gefriertruhe und mehr; Hydroponik-Turm, Rinnenanlage, Growbox,
  Anzuchtregal mit LED (folgt einem verknüpften Licht), Nährstofftank und Aquaponik.
- **Whirlpool abgedeckt oder offen**: Feld „Abdeckung“ am aufblasbaren und am neuen eckigen Whirlpool – offen
  steht die Abdeckung an der Seite und das Wasser ist zu sehen. Mit verknüpfter Entität folgt die Darstellung:
  eine Abdeckung (cover) öffnet und schließt, Pumpe oder Heizung „an“ lässt das Wasser sprudeln.
- **Randsteine**: Gartenflächen haben „Randstein / Kante“ – Randstein Beton, Granit-Randstein, Rasenkante
  Metall, Palisaden Holz oder Pflaster-Läufer, dazu „Höhe über Fläche (cm)“; der Rand läuft an allen freien
  Kanten (nicht an Hauswänden), mit Gehrung und Fugen, am Hang entlang der Eckhöhen. Neue Linienart „Randstein“
  neben Weg, Hecke, Zaun und Mauer.
- **Modelle folgen ihrer Entität**: Verknüpfte Entitäten aller Möbel werden beobachtet, nicht nur die von
  Lampen – Grundlage für Kontroll-LEDs, Whirlpool, Kamin und Vorhänge. Die Entitäts-Vorschläge an Möbeln
  enthalten jetzt auch Rollläden/Abdeckungen (cover), Schalter-Helfer und Melder.
- **Browser-Tests** warten auf das Panel statt eine feste Zeit (stabil mit vielen Jobs gleichzeitig); Einrichtung
  auf dem eigenen Rechner auch unter Windows ohne WSL beschrieben (Python-Tests dort in WSL).

## 0.23.0b2 (Vorabversion)

- **Räume einzeln anpassen**: Ecken und Wände eines Raums ziehen ändert jetzt nur diesen Raum – angrenzende
  Räume bleiben stehen. Wer sie mitnehmen will, schaltet **Ecken koppeln** ein (Editor-Leiste, am Tablet unter
  „⋯“, oder im Eigenschaftenfeld des Raums; der Browser merkt es sich) oder hält beim Ziehen Alt gedrückt (am
  Tablet: Schalter „Mitziehen“ bzw. „Einzeln“ für einen Zug). Länge, Breite und Tiefe folgen derselben
  Einstellung. Gerechnet wird immer vom Stand zu Beginn des Zugs – Ecken und Wände, über die man unterwegs
  zieht, kleben nicht mehr fest; eine gezogene Wand dockt an parallele Nachbarwände an.
- **Saubere Wandanschlüsse**: Wo eine Innenwand gerade in eine Außenwand übergeht, liegt die Raumseite bündig
  (kein 6-cm-Versatz, auch in Tür- und Fensterlaibungen) und der flimmernde dunkle Streifen ist weg. Innenwände
  enden am T-Stoß in der Mitte der durchgehenden Wand, Ecken aus zwei Innen- oder freien Wänden bekommen eine
  Gehrung. Das Werkzeug „Wand“ rastet auch an Raumkanten ein; eine freie Wand, die auf einer Wand oder bis 10 cm
  davor endet, reicht bis in deren Mitte – auch von außen.
- **Treppen – Deckenöffnung passt und ist einstellbar**: „automatisch“ liegt sie über dem Teil der Treppe mit
  weniger als 2 m Kopfhöhe, ringsum 8 cm Luft und am Austritt bündig (Wendeltreppe: Kreis um alle Stufen, L- und
  U-Treppen: passender Winkel); dazu „eigene Maße“ (Breite, Tiefe, Versatz, eckig oder rund) und „keine“.
- **Treppen – Geländer vollständig**: durchgehender Handlauf über alle Läufe, Podeste und Wendelstufen bis oben,
  mit Stäben und Pfosten; die Wendeltreppe hat den Handlauf außen und ein Geländer am Austrittspodest.
  **Geländer an der Öffnung** in der Etage darüber: automatisch Stäbe, wenn die Treppe ein Geländer hat, sonst
  wählbar Stäbe, Glas, Holz oder keins; Austritt und Seiten an Wänden bleiben frei.
- **Wendeltreppe** links oder rechts herum, mit Austrittspodest; beim Wählen wird die Grundfläche quadratisch
  („Quadratisch machen“ für ältere Treppen), im Plan erscheint sie als Kreis. **Treppenloch**: echte Öffnung im
  Boden seiner Etage statt dunkler Platte, eckig oder rund, wahlweise mit Geländer. In der Etage darüber führt
  ein Tipp auf „Treppe von …“ zur Treppe.
- **Dach-Ebene für jede Etage**: Knopf **„Dach“** neben der Etagen-Auswahl (auch ohne Hausdach) bzw. „Dach
  bearbeiten“ in den Etagen-Eigenschaften. Sie zeigt die Dächer dieser Etage – Hausdach, eigene Dächer von
  Räumen und Dachteile –, die Etage darunter blass zum Ausrichten. „Hausdach“ in der Etagen-Auswahl öffnet die
  Dach-Ebene der Etage, auf der das Hausdach sitzt.
- **Dach setzen**: Flach-, Pult-, Sattel-, Walm-, Zelt-, Mansard- (auch mit Walm) und Krüppelwalmdach, Kegeldach
  für Türme und Dachterrasse. „Auf Raum tippen“ gibt dem Raum ein eigenes Dach, das mit ihm wandert; „Rechteck
  ziehen“, „Punkte setzen“ oder beim Kegeldach „Kreis ziehen“ ergibt ein freies Dachteil mit ziehbaren Ecken.
  Wo Dächer ineinanderlaufen, entstehen Kehlen von selbst; unter Dachteilen fällt kein Regen oder Schnee.
- **Eigene Dächer bearbeiten**: Dachfläche antippen (oder am Raum „Im Dach bearbeiten“) – Dachform, Neigung,
  Überstand, First, hohe Seite, Flügel-Ende, Farben, Texturen und Kanten wie beim Hausdach. Berührende Räume mit
  gleicher Dachform haben ein gemeinsames Dach, das als Ganzes bearbeitet wird; „abtrennen“ gibt einem Raum ein
  eigenes, „Mit Nachbardach verbinden“ legt es wieder zusammen. „An der Hauswand kürzen“ nimmt den Überstand zur
  Hauswand weg, „In Dachteil umwandeln“ macht die Ecken frei ziehbar.
- **Kamin, Dachfenster, PV-Feld und Gaube auf jedem Dach**. PV-Felder auf eigenen Dächern und Dachteilen
  bekommen Schild, Infokarte und Verschattungsprüfung; ohne eigenen Sensor teilen sie sich die Leistung
  „PV Dach“ (eigener Wechselrichter oder Balkonkraftwerk: Leistungs-Entität am Feld eintragen). Module, die ein
  anderes Dach überdeckt, zählen nicht mit. Auf ein anderes Dach gezogen, wechseln die Dinge dorthin; auf einem
  Raumdach wandern sie mit dem Raum. Antippen eines Dachs in 3D schaltet keine Geräte darunter.
- **Dachterrasse** am Raum („Eigenes Dach“ → Dachterrasse) oder als Dachteil: begehbarer Belag auf Fußbodenhöhe
  der Etage darüber, Geländer (Glas, Stäbe, Holz) an den freien Kanten; PV-Felder passen darauf.
- **Hausdach**: „Hausdach sitzt auf“ (Etage) und „Räume unter dem Hausdach“ sind wählbar. Räume mit eigenem Dach
  oder unter einem Dachteil bekommen kein Hausdach mehr darüber (vorher doppelt); Dinge des Hausdachs über
  einem solchen Raum ziehen auf dessen Dach um („Auf die Dächer darunter legen“ für ältere Stände). Ändert sich,
  worauf das Hausdach sitzt oder welche Räume es deckt, werden seine Kanten-Anpassungen zurückgesetzt (mit
  Nachfrage bzw. Hinweis).
  „Automatisches Dach in Dachteile umwandeln“ macht aus dem Hausdach frei bearbeitbare Dachteile; alle Dinge
  darauf ziehen mit.
- **Dachgeschoss: Türen und Fenster im Giebel** werden richtig gezeigt: Die Giebelwand des Hausdachs bekommt
  passende Öffnungen mit Laibung, Tür und Fenster sind von außen in voller Höhe zu sehen (auch in der hohen
  Wand eines Pultdachs). An Traufwänden, Walmenden und Innenwänden unter der Schräge enden Öffnungen und
  Rollläden unter der Dachfläche statt durchs Dach zu ragen; liegt eine ganz darüber, wird sie in 3D
  ausgeblendet. Der Editor zeigt bei solchen Öffnungen einen Hinweis. Eigene Dächer setzen ebenfalls auf dem
  Kniestock an; Außenwände ohne Dach darüber oder unter einem Flachdach bzw. einer Dachterrasse reichen bis zur
  Raumhöhe.
- **Verteiler drehbar** (Haupt- und Unterverteilung, Einspeisung, Router, Switch): Drehung (°) in den
  Eigenschaften, oranger Drehgriff im Plan (15°-Schritte, Umschalt bzw. „Frei“ = stufenlos), Taste R
  (Umschalt+R: 15° zurück), ⟳/⟲ und Wand-Knopf am Steuerkreuz sowie „Drehen 90°“ und „An die Wand stellen“ im
  Kurzmenü. An einer Wand drehen sich Verteiler beim Setzen und Ziehen von selbst zum Raum und stehen mit der
  Rückseite an der Wand (nicht mehr in der Ecke); bereits gesetzte, die an einer Wand stehen, zeigen von selbst
  zum Raum. Die Höhe über dem Boden reicht höchstens so weit, dass das Gehäuse unter Decke bzw. Dachschräge
  bleibt.
- **Leitungen an der Decke**: Strom und Netzwerk liegen standardmäßig an der Decke (15 cm darunter, im
  Dachgeschoss unter der Schräge), Wasser weiter am Boden; die Deckenhöhe richtet sich nach der Etage. Dazu eine
  eigene Höhe als Zahl für die nächsten Punkte und für alle Punkte einer Leitung; „Standard“ setzt zurück, jede
  neue Leitung beginnt wieder auf der Standardhöhe. Endet eine Leitung an einem Verteiler oder an einer
  gleichartigen Leitung auf anderer Höhe, führt die 3D-Ansicht sie senkrecht hin, der Fluss läuft mit.
  Abzweigdosen sitzen auch nach einem Höhenwechsel auf der Leitung.
- **3D-Ansicht im Editor – Pfeile zum Verschieben**: Am gewählten Möbelstück, Gegenstand oder Verteiler
  erscheinen Pfeile X (rot), Höhe (grün; nicht bei Treppe, Treppenloch, Stellplatz, Säule, Stütze und
  Durchführung) und Z (blau). Ziehen rastet im Raster ein (Umschalt bzw. „Frei“ =
  zentimetergenau), ein Zug ist ein Rückgängig-Schritt, Esc bricht ab; die neue Lage ist sofort zu sehen, auch
  beim Ziehen über den Boden. Verteiler lassen sich in 3D anklicken und ziehen; Pfeiltasten und Steuerkreuz
  schieben auch Verteiler. Dächer unterer Etagen bleiben sichtbar, wenn man eine Etage darüber bearbeitet.
- **Strg = nur Ansicht**: Mit gedrückter Strg-Taste (Mac: ⌘) bewegt Ziehen in der 3D-Ansicht nur die Kamera
  (links drehen, rechts schieben, Rad zoomen) und wählt nichts aus; am Tablet Schalter „Nur Ansicht“.
- **Solarzäune** in drei Varianten unter Draußen → Solar-Aufständerung: senkrecht mit beidseitig aktiven
  Modulen, an einer Doppelstab-Zaunmatte (Module bis 15° geneigt) und als blickdichter, rahmenloser Sichtschutz
  auf Sockel. Raster „Module breit/hoch“ (bis 3 übereinander), Modullage quer oder hochkant (Sichtschutz immer
  hochkant). Der Raster-Hinweis aller Solar-Aufständerungen nennt Modulzahl und kWp (400 Wp je Modul).
- Behoben: „An die Wand stellen“ ersetzte im Editor die ganze Etage durch das Möbelstück; Verteiler auf Etagen
  ohne Leitungen ließen sich in der Hauptansicht nicht antippen; eine Neigung über 60° im Dach-Feld ließ das
  Speichern scheitern (jetzt begrenzt; ungültige Dachwerte werden ersetzt statt den Stand abzulehnen); bei
  berührenden Räumen mit eigenem Dach wirkten Änderungen am zweiten Raum nicht; Norden auf der Dach-Ebene
  erscheint nur noch mit Admin-PIN; nach dem Wechsel über die Etagen-Auswahl zeigte die Leiste noch die Werkzeuge
  der vorigen Ebene; ein Typwechsel zeigte noch die Felder des alten Typs; Hinweise aus der Editor-Leiste (z. B.
  Magnet an/aus, Bauplan-Foto geladen) verschwanden sofort; überlappende Wandstücke wurden im Plan dunkler
  gezeichnet; Gedrückthalten mit der Maus öffnete mitten im Zug das Kurzmenü (jetzt nur mit Finger oder Stift);
  durch Deckenöffnungen sah man den Rasen unter dem Haus; Rasen mit Textur folgte der Jahreszeit nicht, und
  Flächen mit Textur wurden bei Schnee schwarz; der Raster-Hinweis der Fassade nannte „Breite und Tiefe“.
  Kontaktschatten folgen der Drehung (kein großer Fleck unter schräg gestellten langen Teilen); dünne Teile
  lassen sich am Tablet leichter antippen.
- Hinweis zur Vorabversion: Ältere Stände bleiben gültig; Wandanschlüsse, Deckenöffnungen und Giebel werden
  beim Anzeigen neu berechnet. Das Hausdach spart Räume mit eigenem Dach oder unter einem Dachteil jetzt aus –
  angepasste Dachflächen ggf. mit „Alle Flächen zurücksetzen“ neu ausrichten. Geneigte eigene Dächer auf
  Dachgeschossen setzen am Kniestock an, berührende Räume mit verschiedener Dachform bekommen getrennte Dächer.
  Möbel, die bündig an einer Außenwand in Verlängerung einer Innenwand standen, ragen 6 cm hinein – „An die Wand
  stellen“ rückt sie davor. Der Haken „Deckenöffnung in der Etage darüber“ ist jetzt die Auswahl
  „Deckenöffnung“ (ohne Haken = „keine“). 0.23.0b1 behält alle neuen Felder, zeichnet aber Dachteile,
  Dachterrassen, eigene Dächer in den neuen Formen, Dinge auf eigenen Dächern, eigene Deckenöffnungen und die
  Verteiler-Drehung nicht; eine Wendeltreppe „rechts herum“ erscheint dort als gerade Treppe, ein Solarzaun als
  einfacher Ständer.
- Intern: Dach-Code der 3D-Szene, 3D-Teil des Editors sowie Treppen-, Wand- und Dach-Editor (eigene Dächer,
  Dachteile) in eigene Module; Dachformen, Dach-Einheiten (Hausdach, eigene Dächer, Dachteile), Giebel,
  Treppenöffnungen, Geländer, Leitungshöhen und Verteiler-Geometrie rein und mit node getestet; neue
  Browser-Tests für Treppen, Ecken, Dächer, Giebel, Verteiler, Achsen-Pfeile und Solarzäune.

## 0.23.0b1 (Vorabversion)

- **Grundeinstellungen**: Beim ersten Öffnen des Editors (und bei leerem Haus) fragt ein Fenster in vier
  Schritten Name und Norden, Etagen und Höhen (Keller, Vollgeschosse, Dachgeschoss mit Kniestock), Wände und
  Dach sowie den Bauplan ab. Vorhandene Etagen bleiben immer erhalten; „Fertig“ ist ein Rückgängig-Schritt.
  Später über „Grundeinstellungen“ in der Editor-Leiste (am Tablet unter „⋯“) bzw. im Etagen-Feld; Norden nur
  mit der Admin-PIN.
- **Leeres Testhaus**: Der Editor stürzte bei einem Haus ohne Etagen ab, „+ Etage“ war nicht erreichbar. Jetzt
  startet er mit einem Erdgeschoss und den Grundeinstellungen; ein Fehler beim Öffnen hinterlässt keine Reste.
- **Werkzeug „Vorlage“**: Bauplan-Foto laden, zwei Punkte mit bekanntem Abstand markieren (richtige Maße),
  drehen (±90°) oder „An Linie ausrichten“. Der Abschnitt zum Kopieren heißt jetzt „Eigene Bausteine“.
- **„Einrichten“** statt „Möbel“: Katalog mit den Gruppen Drinnen und Draußen und aufklappbaren Kategorien
  (Zustand je Browser gemerkt); neu unter Technik: 3D-Drucker und NAS / Heimserver.
- **Raster einstellbar**: Würfelregal „Würfel breit/hoch“, Solar-Aufständerungen „Module breit/tief“
  (mehrreihig).
- **Info-Hologramme**: Gegenstände bekommen im Editor bis zu 6 Werte; ist ihr Raum angetippt, schweben die
  Werte live als Tafel darüber.
- **Lichtschacht** für Kellerfenster (Tiefe, Breite) mit Gitterrost auf Geländehöhe.
- **Leitungen**: neue Verteiler-Art „Abzweigdose“, Schalter „als Gegenstand zeigen“ (aus = nur
  Verbindungspunkt), Zwischenpunkte auf einer anderen Leitung werden jetzt wirklich verbunden, größerer
  Fangkreis am Finger, Verteiler rasten nur an Leitungen ihres Mediums ein.
- **Version** unten links in den Admin-Einstellungen.
- **README** neu aufgebaut (nach Themen statt nach Versionen).
- Hinweis zur Vorabversion: Stände mit Abzweigdose lassen sich in 0.22.x nicht mehr laden – vor einem
  Zurückwechseln Abzweigdosen löschen.

## 0.22.2

- **Komplett kostenlos** – auch alle künftigen Erweiterungen und Zusatzpakete; Spenden schalten nichts frei.
- **Marken-Hinweise**: neuer README-Abschnitt „Marken & Hinweise“ (unabhängiges, inoffizielles Projekt, Namen
  nur als Bezug, Kontakt für Rechteinhaber) und kurze Hinweise im Möbelkatalog und bei den Gerätevorlagen.
- **Möbelkatalog neutral**: Kategorie „Möbelserien“; Möbel und Konsolen heißen jetzt nach ihrer Gattung mit dem
  Produkt nur als Maßangabe, z. B. „Würfelregal 2×4 (Maße wie KALLAX)“ oder „Spielkonsole (Maße wie
  PlayStation 5 Slim)“. Gespeicherte Häuser bleiben unverändert (gleiche Typ-Schlüssel).
- **Modelle schlichter**: Wallboxen, Wechselrichter, Speicher und Mikrowechselrichter sehen je Gruppe gleich aus
  (neutrale Farben, nur die Maße unterscheiden sich); Konsolen als schlichte Grundformen ohne Markenfarben
  (Leuchtflächen folgen nur einem verknüpften Licht); Sessel ohne nachgebautes Gestell; Sofas und Sessel der
  Möbelserien mit Polster in der gewählten Farbe. „Glasgehäuse“ und „Lichtleiste (stehend)“ statt
  Anspielungen, „Balkonspeicher“ als Oberbegriff.
- Hinweise für Netzwerkgeräte und dynamische Strompreise ohne Herstellernamen; der Hinweis bei leerem Grundriss
  zeigt den richtigen Weg zum Import; ein altes Import-Hilfsskript entfernt; CI prüft wieder alle Python-Dateien
  und Tests.
- **Eigenes Symbol** für die Integration (`brand/icon.png`, ab Home Assistant 2026.3 sichtbar); Spenden-Links mit
  neutralen Symbolen.
- Regeln für Beiträge in `CONTRIBUTING.md`; Tests wachen über Marken- (Namen, Symbole, Farben) und
  Datenschutzregeln.

## 0.22.1

- Export-Dateien tragen die eigene Kennung `haus3d`. Beim Import werden rohe Grundrisse und Exportdateien
  der Form `{format, building}` gelesen, ältere Exporte also weiterhin.
- Aufgeräumt: Kommentare, Tests und Hilfsskripte vereinfacht.

## 0.22.0

- **Testhaus** (Admin → Entwickler): eigene Häuser zum Ausprobieren – Beispielhaus, Kopie des eigenen Hauses
  oder leer (bis zu 5). Grundriss, Einstellungen und Bauplan-Fotos liegen getrennt; am echten Haus ändert
  sich nichts (kein Speichern, kein Verlauf). Gilt nur im eigenen Browser, oben steht lila „Testhaus: …“
  mit „Mein Haus“ zum Zurückwechseln. Geräte werden im Testhaus nicht geschaltet, außer „Geräte echt
  schalten“ ist an; „Weitere Infos“ zeigt dann nur Werte. Editor-Entwurf, gemerkte Ansichten, Favoriten und
  Lüften-Timer sind je Haus getrennt, nichts geht in die HA-Benutzerdaten. PINs, Entwickler-Instanz, Urlaub,
  Heizungsautomatik und HA-Szenen gehören zum echten Haus und lassen sich im Testhaus nicht ändern. Beim
  Wechsel werden offene Nachfragen, PIN-Feld, Fenster und Thermostat-Timer abgebrochen; Speichern, das im
  alten Haus begann, wird verworfen.
- Behoben: „Alltag“ (Heizungsautomatik, Urlaubs-Lichter) ließ sich mit der Bearbeiten-PIN ändern; jetzt nur
  mit der Admin-PIN wie im Panel angezeigt.
- Doku: Import/Verlauf stehen unter Admin-Einstellungen → „Daten & Verlauf“ (nicht mehr „⋮“).

## 0.21.0

### Alltag (Admin → Alltag)
- **Waschmaschine, Trockner, Spülmaschine**: erkannt am Leistungssensor (Vorschläge nach Namen). Chip „läuft
  0:42 h“ bzw. Restzeit, Meldung „fertig“ mit Knopf „Erledigt“.
- **Termine & Müllabfuhr**: Kalender und Abfall-Sensoren (z. B. Waste Collection Schedule) – Chip mit dem
  nächsten Termin, Liste der nächsten 7 Tage, abends „Morgen: Gelbe Tonne rausstellen“.
- **Strompreis**: fest (ct/kWh) oder dynamisch (Tibber, Nordpool, EPEX …) – „Kosten jetzt“ und „Günstig ab
  …“ in der Energie-Karte, Kosten je Raum im Raumfenster.
- **Lüften**: Knopf im Raumfenster startet einen Timer, danach „genug gelüftet – Fenster schließen“.
  **Schimmelgefahr** je Raum (Feuchte an der kalten Wand, mit Außentemperatur).
- **Heizung pausieren** bei offenem Fenster: Knopf am Hinweis oder automatisch nach n Minuten; läuft im
  Hintergrund (auch ohne Tablet) und stellt die Heizung wieder her, sobald das Fenster zu ist.
- **Urlaub**: „Haus verlassen“ → Anwesenheit simulieren – abends gehen einzelne Lichter an und aus (im
  Hintergrund, auch Dienst `haus3d.away`).

### Ansicht
- **Zeitstrahl** (Funktionsrad): den heutigen Tag zurückspulen (Licht, Fenster, Türen, Personen aus dem
  Verlauf) und in die nächsten 24 h schauen (Wetter, Sonne, erwartete PV-Leistung mit kWp aus „Alltag“).
  Abspielen, „Jetzt“; im Zeitstrahl wird nichts geschaltet.
- **Bodenfarbe CO₂** und **Energie heute** (kWh je Raum aus der HA-Statistik).

### Bedienung
- **Begehen** mit zwei Joysticks: links gehen (vor, zurück, seitlich), rechts umsehen – gleichzeitig mit zwei
  Fingern. Behoben: In beleuchteten Räumen und an Türblättern blieb man hängen (nur noch Wände halten auf,
  man gleitet an ihnen entlang).
- **Raum-Szenen**: im Bearbeiten-Modus „+ Szene“ im Raumfenster speichert den jetzigen Zustand als echte
  HA-Szene (Kino, Lesen, Putzen …), danach ein Knopf im Raumfenster.
- **Favoriten-Leiste** unten: die meistgenutzten Geräte dieses Tablets (lernt mit; im Bearbeiten-Modus
  ausblendbar, Ebene „Favoriten-Leiste“).

## 0.20.1

- **Kamera-Sichtbereich ausblendbar**: eigener Schalter „Kamera-Sicht“ im Zahnrad (Kachel), in den Ebenen
  und als Funktion fürs Rad. Die Kamera-Symbole bleiben, nur die blauen Sichtkegel verschwinden.

## 0.20.0

### Neu
- **Dachgeschoss als Etage**: In der Etagen-Auswahl des Editors legt „+ Dachgeschoss“ eine Etage für Räume
  unter dem Dach an (oder Haken „Dachgeschoss“ in den Etagen-Eigenschaften). Ist in den Einstellungen ein
  Dach an, sitzt es auf dem Kniestock des Dachgeschosses, die Dachflächen ergeben sich aus dessen Räumen und
  Innenwände enden unter der Schräge. Der Eintrag „Dach“ (Kamin, Dachfenster, PV) erscheint nur noch, wenn
  ein Dach an ist.
- **Name oben links** im Bearbeiten-Modus antippen und ändern (leer = „Haus 3D“).
- **Rahmenfarbe** für Fenster und Türen im Editor (Farbfeld wie bei Möbeln), auch in 3D.

### Geändert
- **Simulation nur im Admin-Modus**: Kachel im Zahnrad nur mit aktivem Admin, endet mit dem Admin-Modus und
  startet beim Laden nie von selbst. Auf den aktuellen Stand gebracht: Beispielräume haben eine Leistung
  (folgt dem Licht – Leitungen und Verteiler zeigen Fluss), Solar-Regler rechnet Hausverbrauch, Netzbezug/
  Einspeisung und Speicher (auch eingebaute von PV/Balkonkraftwerk) passend zueinander, Einspeise-Verteiler
  mit Zähler, Schloss ohne PIN, Ventile und Heizungsmodus.
- **Energiefluss aus** (Rad) blendet die Leitungen im Haus ganz aus, nicht nur die Punkte.

### Behoben
- Tablet: Die Liste in „Geräte anpassen“ scrollt mit dem Finger (eigener Scrollbereich, Kopf und Knöpfe
  bleiben stehen; Wischen schaltet keinen Haken um).

## 0.19.0

### Neu
- **Leitungsnetz**: Verteiler (Haupt-/Unterverteilung mit Zähler, Einspeisung, Router, Switch,
  Wasseranschluss, Warmwasser, Durchführung über Etagen), Abzweige an bestehenden Leitungen, Fluss je
  Leitungsstück von der Wurzel bis zu den Verbrauchern – Menge als Dichte und Tempo der Punkte, Richtung
  nach Flussrichtung. Antippen zeigt Wert und angeschlossene Verbraucher.
- **Leitungen bearbeiten**: Punkte ziehen, einfügen, löschen; Höhe je Punkt oder für alle.
- Leitungstyp **Netzwerk**; Leitungsende an einem **Gerät** (Alternative zu Raum/Sensor).

### Behoben
- Strom auf Zubringern ohne eigenes Ziel (z. B. Hauptverteilung → Garage → Büro) fließt jetzt auf dem
  ganzen Weg.

## 0.18.3

- **Eigener Speicher bei PV-Anlage und Balkonkraftwerk**: Haken „mit eigenem Speicher“ (z. B. Hybrid-Anlage,
  Balkonspeicher) mit Ladestand, Speicherleistung, Kapazität und Reserve. Wird beim Speicher mitgezählt und beim
  berechneten Hausverbrauch berücksichtigt; kein zusätzlicher AC-Speicher nötig.
- Gerätevorlagen (SENEC, Anker, Fronius, Huawei …) füllen bei PV/Balkonkraftwerk den eingebauten Speicher
  gleich mit. SENEC findet jetzt auch die Namen der lokalen API (…powergenerated_now) und der WebAPI.

## 0.18.2

- Spenden jetzt auch per PayPal (Zahnrad → ♥ Haus 3D unterstützen, Sponsor-Knopf im Repo).

## 0.18.1

### Neu
- **Unterstützen**: Zeile „♥ Haus 3D unterstützen“ im Zahnrad mit Spendenlinks (GitHub Sponsors; weitere
  folgen), einmaliger dezenter Hinweis nach 14 Tagen (nie im Wandtablet-Modus), Sponsor-Knopf im Repo.
  Haus 3D bleibt kostenlos.
- **Entwickler-Instanz**: kleines Haus-Symbol unten rechts in den Admin-Einstellungen; nach Bestätigung
  entfällt das Spendenfeld und es gibt die Kategorie „Entwickler“ (Infos, Leistungsanzeige, Simulation).
  Der Code wird im Backend nur als Hash geprüft und schaltet nichts Kostenpflichtiges frei.

## 0.18.0

### Wichtig beim Update
- Schlösser lassen sich in Haus 3D nur noch mit der **Tür-PIN** entriegeln/öffnen (Standard **0000**,
  bitte unter Admin → PIN & Zugang ändern). Abschließen bleibt ohne PIN.

### Neu
- **Tür-PIN**: eigener Befehl `haus3d/lock/unlock` prüft die PIN im Backend (still, gedrosselt, kein
  Token) und schließt erst dann auf; das PIN-Feld zeigt, welche Tür entriegelt wird.
- **Möbelkatalog**: Möbel in den Maßen bekannter Serien, weitere Lampen, LED, Gaming, Wallbox & E-Auto,
  Wechselrichter & Speicher, Solar-Aufständerungen (rund 140 Teile mit Maßen nach Herstellerangaben, eigene 3D-Modelle).
- **Gerätevorlagen** für PV, Balkonkraftwerk und Speicher in der Energie-Einrichtung mit
  Entitätsvorschlägen aus der passenden Integration. Dabei u. a. SENEC.Home und Anker SOLIX Solarbank.

## 0.17.0

### Neu
- **Leitungen** im Editor (Strom, Wasser kalt/warm) entlang Boden und Wand, mit Höhe je Punkt; in 3D als
  Rohr mit laufenden Punkten, solange Strom bzw. Wasser fließt (eigener Sensor oder Zielraum). Ersetzt die
  Luftlinien vom Hausanschluss zu den Räumen.
- **Netzwerkgeräte** (UniFi Network): Symbole/3D-Geräte, Fenster mit IP, WLAN, Signal, Access Point,
  Laufzeit, Clients, Neustart; Liste „Netzwerk“ im Funktionsrad.
- **Energie neu**: Haus, Netzbezug, Einspeisung als Grundlage; PV, Balkonkraftwerk und AC-Speicher als
  Erweiterungen mit eigenen Entitäten, alle Werte summiert. Bestehende Einstellungen werden übernommen.
- **Heizkörper antippen** öffnet ein Thermostat-Fenster.
- **Kameras**: Dreh-Griff im Editor, Öffnungswinkel, Neigung, Reichweite.

### Geändert
- Raum antippen fährt die Kamera hin; Raumfenster per Gedrückthalten.
- Größere Trefferflächen für Geräte in 3D.
- Bearbeiten- und Admin-Modus stehen oben mit „Beenden“; Admin endet auch im Zahnrad über „Beenden“.
- Anwesenheit: Text nicht mehr verdeckt.
- Popups: Name in der Kopfzeile wird nicht mehr vom Schließen-Knopf verdrängt.

## 0.16.0

### Wichtig beim Update
- **Speichern braucht jetzt eine PIN** (Standard **0000** für Bearbeiten und Admin). Bitte direkt unter
  Zahnrad → Admin-Einstellungen → PIN & Zugang eigene PINs setzen.
- Stifte, „+“ und Editor erscheinen erst nach **Bearbeiten** (PIN), auch für HA-Admins.
- Das ⋮-Menü (Export, Import, Verlauf) ist jetzt unter Admin-Einstellungen → Daten & Verlauf.

### Neu
- **Schlichtes Zahnrad** mit Stil, Qualität, Geräte-Darstellung, Anzeige-Kacheln, Simulation und den
  Feldern **Bearbeiten** (wird zu **Beenden**) und **Admin-Einstellungen**.
- **Admin-Fenster mit Kategorien**; antippen zeigt die Einstellungen dieses Bereichs, „‹“ zurück.
- **PIN-Feld** mit großen Tasten (Tablet), Tastatur geht auch. Falsche PIN: nichts passiert. Eigene PIN je
  Bereich (4–8 Ziffern), nur als Hash gespeichert; Durchprobieren wird still gebremst.
- **Karten als Tabs** inkl. **Energie-Karte**: Titel, Symbol, Zeilen anzeigen/ausblenden, eigene Namen,
  Reihenfolge (▲▼), Überschuss-Ampel und Verlauf-Knopf schaltbar; Tab „+“ = neue Karte, unten
  „Entfernen“. Der Stift an einer Karte öffnet direkt ihren Tab.
- Grünes Band „Bearbeiten aktiv“ mit „Grundriss“ und „Beenden“.
- Funktionsrad: Stil, Dach, Raster, Wetter, Raumnamen, Geräte, Möbel, Anwesenheit, Schatten und Vollbild
  sind ins Zahnrad gewandert.

## 0.15.0

### Kameras, Medien, Kurzwahl
- **Kameras** als Symbol im Raum; Tipp öffnet das Kamerafenster (Standbild alle 2 s, „Live“ über HA).
  Fest platzierte Kameras bekommen im Editor eine **Blickrichtung**; der **Sichtkegel** erscheint in 2D
  und 3D.
- **Klingel**: Kamera als „Klingel-Kamera“ markieren und einen Auslöser wählen (event.… mit
  device_class doorbell oder ein Binärsensor). Klingeln weckt das Tablet und öffnet die Kamera.
- **Raumfenster**: Medienplayer (Titel, Zurück/Wiedergabe/Weiter, stumm, Lautstärke, an/aus),
  **Saugroboter** (Saugen, Pause, Zur Station, Suchen, Akku), Kamera-Vorschau.
- **Kurzwahl 2.0**: laufende Automationen/Skripte drehen einen Ring, darunter „vor 10 min“ bzw.
  „aus“. Langes Drücken: Auslösen, Stoppen, Ein/Aus, **Ablauf ansehen** (Trace), Bearbeiten.

### Licht, Schatten, Energie
- **Echte Schatten** der Sonne (Qualität „Ausgewogen“ und „Schön“, Ebene „Schatten“ im Funktionsrad).
- **PV-Verschattung prüfen** (PV-Feld antippen): Verlust je Feld über einen Tag, stärkste Uhrzeit,
  beliebiger Tag; **Schatten-Zeitraffer** lässt die Sonne über den Tag laufen.
- **Kontaktschatten** unter Möbeln und Bäumen.
- **Jahreszeiten im Garten**: Rasen und Laub nach Datum (oder fest: Zahnrad → Haus & Wetter).
- **Energiefluss im ganzen Haus**: Linien vom Hausanschluss zu Räumen mit Verbrauch und zum Netz
  (rot Bezug, grün Einspeisung); abschaltbar unter Haus & Wetter.

### Benutzer, Dienste, Begehen
- **Meine Ansicht**: Stil, Ebenen, Qualität und gemerkte Blickwinkel gelten für den HA-Benutzer auf
  allen Geräten. Am Wandtablet abschaltbar („Eigene Ansicht“).
- **Dienste** `haus3d.show`, `haus3d.notify`, `haus3d.highlight`, `haus3d.reload` steuern offene
  Haus-3D-Seiten aus Automationen, mit `target` nur ein bestimmtes Tablet.
- **Begehen** (Funktionsrad): Blick aus Augenhöhe, Ziehen schaut sich um, Tippen auf den Boden geht hin,
  Joystick/WASD/Pfeiltasten; Wände halten auf, Türen lassen durch.

### Editor
- **Bauplan-Foto** je Etage unterlegen (verkleinert, getrennt vom Grundriss gespeichert), verschieben,
  drehen, Deckkraft, **Maßstab aus zwei Punkten**.
- **Fang-Hilfen**: Fluchtlinien zu vorhandenen Ecken; **Länge und Winkel eintippen** (Ziffern tippen
  springt ins Feld).
- **Mehrfachauswahl** (Schalter „Mehrfach“, Umschalt-Klick oder Rahmen aufziehen): verschieben,
  Pfeiltasten, kopieren/einfügen (Strg+C/V), duplizieren (Strg+D), löschen; **Vorlagen** für alle Etagen.
- **Treppen**: L-Treppe **mit Podest** oder **gewendelt**, U-Treppe, Wendeltreppe; Deckenloch passend
  zur Form. **Gauben** (Schlepp-, Sattel-, Flachdach) im Dach-Editor, verdecken PV-Module.
- Behoben: Kontrollkästchen im Editor waren verschoben; Keller allein gewählt lag unter dem Rasen.

## 0.14.2

Tablet-Bedienung:
- **Funktionsrad per Finger drehen**: Rad unten rechts (und links) mit dem Finger im Bogen wischen, es
  läuft mit Schwung nach und rastet ein. Die Pfeiltasten am Rad sind weg; Mausrad geht weiter.
- **Nichts überlappt mehr**: Liegen die Karten (Energie, Kurzwahl) über der Etagenleiste, rutscht die
  Leiste darunter bzw. nach links oben, auch auf dem Handy und im Hochformat.
- **Editor am Tablet**: eine Zeile mit „Werkzeug ▾“ und „⋯“ statt langer Knopfleiste, Eigenschaften
  ein-/ausblendbar (mehr Platz zum Zeichnen), Dialoge als Blatt von unten mit großen Tasten.

## 0.14.1

- Behoben: „Unable to load custom panel“ nach dem Update auf 0.14.0, solange die App bzw. Seite
  noch die alte Version geladen hatte (das Panel-Element wurde ein zweites Mal registriert).

## 0.14.0

Großes Update: Alltag, Energie, Optik, Wandtablet und Editor. Gespeicherte Grundrisse bleiben erhalten.

### Wichtig beim Update
- **Tipp auf eine Automation** (im Raumfenster oder auf einem Symbol) öffnet jetzt die Details. Ausgelöst
  wird sie nur noch über Kurzwahl und Funktionsrad (vorher schaltete ein Tipp sie versehentlich ab).
- **Nachfrage** vor heiklen Aktionen: Haustür aufschließen, Garagentor öffnen/schließen, Sirene an
  (abschaltbar unter Zahnrad → Haus & Wetter). Je Kurzwahl-Eintrag lässt sich „Nachfragen“ anhaken.
- **Energie-Anzeige ohne Voreinstellung**: Neue Installationen zeigen „Energie einrichten“. Bestehende
  Installationen behalten ihre Entitäten. „Aus HA-Energie übernehmen“ füllt die Felder.
- **Hinweise** (Regen bei offenem Fenster usw.) laufen im Browser, also nur, solange ein Gerät Haus 3D
  geöffnet hat.

### Alltag
- **Statusleiste** im Kopf: Licht an, offen/gekippt, Garage, Schlösser, Alarm; Etagen-Abzeichen.
- **Anwesenheit**: Personen mit Bild, „Bewegung vor n min“ am Raumnamen.
- **Hinweise am Modell**: Regen bei offenem Fenster, Wasser-/Rauchmelder, Tür/Garage zu lange offen,
  Heizen bei offenem Fenster, Feuchte, Akku; Banner mit „Zeigen“/„Ausblenden“, Raum wird eingefärbt.
- **Gute-Nacht-Check / Haus verlassen**: Liste mit Sammel-Aktionen (Tore, Schlösser, Lichter, Rollläden)
  und eigenem Skript; Ansicht „Sicherheit“ (zu = grün, gekippt = orange, offen = rot); Kippsensor je
  Fenster.
- **Raumfenster 2.0**: Aktionsleiste (Licht aus, Rollladen auf/stopp/zu, Szenen), Heizung mit Stepper,
  Klima-Block mit Taupunkt und Lüftungsampel.

### Energie
- **Energie-Karte 2.0**: Netz-Zeile (Bezug/Einspeisung), Akku-Balken mit „lädt … · voll ca. 13:40“,
  Überschuss-Ampel (und Status-Chip), wählbare Kurzanzeige, Vorzeichen-Umkehr mit Live-Vorschau.
- **Tagesverlauf**: Mini-Kurven je Zeile, Dialog mit Wischen, Gestern/Heute und kWh-Summen.
- **PV je Dachfeld**: Name, Leistungs-/Ertrags-Entität und Wp je Feld; Schild „Süd 3,2 kW“ (geschätzt
  mit „ca.“), Infokarte. Module jetzt instanziert (deutlich weniger Rechenlast).
- **Bodenfarbe**: Temperatur, Feuchte oder Leistung je Raum mit Legende; Heizkörper glühen beim Heizen.

### Optik und Wandtablet
- **Echter Sonnenstand**: Licht kommt aus der Richtung der Sonne, Norden als genauer Winkel.
- **Echtes Licht**: Lampenfarbe und Helligkeit, nachts leuchtende Fenster.
- **Blickwinkel**: Iso, Oben, Süd/Nord/Ost/West, bis zu 6 gemerkte Ansichten; Ansicht je Etage gemerkt.
- **Wandtablet**: `/haus3d?kiosk&etage=eg`, Kopfzeile aus, Bildschirm anlassen (nur über https),
  Vollbild, Startetage; **Ruhemodus** und **Dimmen** nach Uhrzeit, Hinweise wecken.
- **Qualitätsstufen** Akku/Ausgewogen/Schön (automatisch am Tablet), Leistungsanzeige, gedrosselte
  Hintergrund-Animationen.

### Editor
- **Tablet**: Schalter „Frei“/„Einzeln“, Leiste beim Zeichnen, Langdruck-Menü, größere Griffe.
- **Entwurf sichern** (automatisch) mit Fortsetzen/Verwerfen, **Zwischenspeichern**.
- **Maße**: Kantenlängen, Länge/Breite/Tiefe eintippen, Messen, Flächenliste.
- **PV-Hindernisse**: Kamin und Dachfenster verdecken Module.
- **Treppe** gerade oder viertelgewendelt mit Geländer und **Deckenloch** in der Etage darüber,
  „Bis zur nächsten Etage“.
- **Garten-Linien**: Weg, Hecke, Zaun (Holz, Doppelstabmatte, Lamellen) und Mauer als Linie zeichnen.

### Sonstiges
- Startstand ist ein neutrales Beispielhaus; im Paket stehen keine echten Sensornamen mehr.
- Neue Einstellungen werden weich geprüft: ein ungültiger Wert wird ersetzt statt den Stand abzulehnen.
