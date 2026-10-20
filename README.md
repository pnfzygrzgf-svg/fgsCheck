# fgsCheck (Prototyp v0.5)

Sichtprüfung an bestehenden und geplanten Fussgängerstreifen im Browser.

Vibecoding. Don't trust, verify!

## Online

https://fgscheck.ch/ (GitHub Pages; Build und Veröffentlichung bei jedem Push auf `main`, siehe
[Veröffentlichung](#veröffentlichung)).

## Start

```bash
npm install
npm run dev      # Entwicklungsserver, Adresse steht in der Ausgabe
npm test         # Tests (vitest)
npm run build    # Typprüfung und Build nach dist/ (Basis / für die eigene Domain)
```

## Bedienung

1. Ort finden: oben in der Karte Ort, Adresse, Strasse oder PLZ eingeben und einen Vorschlag wählen (Pfeiltasten, Enter,
   Escape), oder mit dem Knopf «Zum eigenen Standort» (unter den Zoom-Knöpfen) zum eigenen Standort springen (Zoom 18, Punkt
   mit Genauigkeitskreis). Die Übergänge im Ausschnitt sucht die App automatisch, sobald die Karte steht (ab Zoom 16, rund
   1:10 000; weiter draussen steht «Zum Suchen näher heranzoomen» auf der Karte). Nach einem Fehler erscheint «erneut suchen».
   Hintergrund in der Ebenenwahl (oben rechts): Luftbild (SWISSIMAGE, Vorgabe) oder Landeskarte (swisstopo); die
   Strassennamen darüber kommen aus OSM und stehen schon vor dem ersten Klick (siehe 2.).
2. Einen OSM-Übergang anklicken. Die App lädt AV (±150 m) und OSM (300 m) um den Knoten und rechnet. Aus diesen OSM-Daten
   beschriftet sie die Strassen (Ebene «Strassennamen (OSM)», je Name höchstens eine Beschriftung pro rund 120 m).
   Schon vor dem Klick stehen Strassennamen auf der Karte: die Übergangssuche holt in derselben Abfrage die benannten
   befahrbaren Wege des Ausschnitts als Mittelpunkte (ab Zoom 16 gezeichnet); im Umkreis von 300 m um den gewählten Übergang
   gelten danach die genaueren Namen aus dem Umkreis-Abruf.
   Farben: gelb fgs-Markierung, gelb gestrichelt vermutlich markiert (`crossing=uncontrolled` ohne Markierungs-Tag;
   gerechnet als FGS, Hinweis «bitte prüfen»), violett Lichtsignal, grau unmarkiert bzw. ohne Angabe; das Häkchen «nur
   markierte Übergänge zeigen» blendet die grauen aus. Graue Übergänge werden ebenfalls gerechnet; Panel, Streifen und Fall-Datei
   weisen sie aus als «Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug».
   Mit Streifen von Hand an einem grauen Übergang steht stattdessen «Heute kein Fussgängerstreifen …; der Streifen von Hand
   wird als Fussgängerstreifen geprüft» (Planung, siehe 6.).
3. Panel: je Streifen (bzw. Teilstreifen über einer Insel) die Zufahrten mit Tempo, Sichtweite, Lage des Sichtpunkts und
   Status, die nicht geprüften Richtungen mit Grund, die verwendeten Annahmen. Zeile anklicken: Sichtfeld, Sichtpunkte,
   Spur und Hindernisse im Sichtfeld auf der Karte.
4. «Eingaben von Hand»: Werkzeug wählen und auf dem Luftbild zeichnen – Parkfeld (Ecken anklicken, Doppelklick schliesst;
   Klasse Auto bzw. Velo/Motorrad), Längsparkierung (Mittellinie, Breite), Baum (Stamm anklicken), Hecke und Mauer (Linie),
   übriges Hindernis (Fläche), je mit Schalter «sichtbehindernd». In der Liste bearbeiten (Ecken auf der Karte ziehen) oder
   löschen. Die Rechnung läuft nach jeder Änderung neu.
   Werkzeug «Insel» (Fläche wie ein Parkfeld): Verkehrsinsel, die die AV nicht kennt. Sie ist kein Sichthindernis, sondern
   teilt den Streifen wie eine AV-Verkehrsinsel in Teilstreifen und ersetzt die Insel nach OSM und Luftbild (siehe «Was
   gerechnet wird»); in der Fall-Datei als Hindernis mit `art: "insel"` (ältere Fall-Dateien lesen sich unverändert).
5. Vorschläge «aus OSM, prüfen» (Parkierung aus `parking:*`-Tags, gestrichelt) zählen erst nach «bestätigen». In Bern lässt
   sich der Baumkataster der Stadt zuschalten; einzelne Bäume daraus können verworfen werden.
   Amtliche Parkfelder (Bern: Geoportal «Parkplätze öffentlich»): lädt die App automatisch, sobald der Ort in einer Gemeinde
   mit Quelle liegt; sie zählen sofort als Hindernis (durchgezogen, Farbe nach Klasse Auto/Velo/Motorrad), einzelne lassen
   sich auf der Karte wählen und verwerfen («verworfene wieder einblenden» holt sie zurück), das Häkchen schaltet die
   Quelle ab (in der Fall-Datei `parkkataster: false`). OSM-Parkierungsvorschläge, die zu mindestens 30 % ihrer Fläche
   von amtlichen Feldern bedeckt sind, entfallen dann. Private Parkplätze enthält der Datensatz nicht (von Hand ergänzen).
6. Streifen von Hand: beide Wartebereiche anklicken (Breite vorher setzen); ersetzt die Streifen aus OSM. «Streifen aus OSM
   übernehmen und anpassen» macht die gebildeten Streifen verschiebbar; eine angenommene Insel (nach OSM und Luftbild)
   kommt dabei als Insel von Hand («Insel (aus Luftbild übernommen)») mit, damit die Teilung bleibt (ebenso bei
   «Luftbild-Streifen übernehmen und anpassen»; nicht doppelt, wenn schon eine Insel von Hand dort liegt).
   Planung neuer Streifen: «Streifen planen» (oben im Panel, auch ohne gewählten Übergang) zeichnet einen Streifen an
   beliebiger Stelle; liegt er ausserhalb der geladenen Daten, lädt die App AV, OSM und Kataster um die Streifen neu
   (`src/abdeckung.ts`, abgedeckt ist ein Streifen ganz innert 30 m vom Ladeort; mehrere Streifen bis rund 60 m
   Spannweite in einem Fall). An einem Übergang ohne Fussgängerstreifen heisst der Knopf «Querung als geplanten Streifen
   übernehmen und anpassen». Die Breite eines Streifens von Hand lässt sich in der Liste ändern. «Lage und Masse» zeigt je
   Streifen von Hand die LV95-Koordinaten der Achsenenden und Ecken, Länge, Breite, Winkel zur Fahrbahn, Abstand der Enden
   zum Fahrbahnrand und je gerade geprüfte Zufahrt zum nächsten Knoten stromauf; «Koordinaten kopieren» legt sie tabulatorgetrennt in die Zwischenablage.
   Jeder Streifen von Hand wird für sich gerechnet; als Teile eines Übergangs gelten nur Teilstreifen auf einer Achse
   mit einer Lücke dazwischen (z. B. an einer Insel).
   Fixpunkte (Werkzeug «Fixpunkt», fängt Gebäudeecken und Stützpunkte der AV, `src/fixpunkt.ts`) vermassen die Streifen von
   Hand in «Lage und Masse» und im Bericht (längs entlang der Balken bis zur Kante bzw. Achse, zum näheren Ende längs und quer,
   Luftlinie zur nächsten Ecke); sie stehen in der Fall-Datei und ändern die Rechnung nicht.
   Geplante Trottoirränder: Werkzeug «Fläche (Plan)» mit der Art Trottoir, Fahrbahn bzw. Insel (Ecken fangen auf
   Stützpunkte der AV bzw. anderer Plan-Flächen, Doppelklick schliesst); die Fläche ersetzt in der Rechnung die
   AV-Bodenbedeckung darunter (Gebäude bleiben, die zuletzt gezeichnete Plan-Fläche gilt), Bordkanten, Wartebereiche,
   Inseln, Fahrlinien und Vermassung richten sich danach (`src/rechner/planflaechen.ts`). In der Fall-Datei steht sie
   im Feld `flaechenPlan`; die Karte zeigt sie schraffiert über der AV, der Bericht im Kartenbild und unter «Eingaben von Hand».
   «Ecke runden» (je Fläche unter «Flächen (Plan)») ersetzt eine angeklickte Ecke durch einen Kreisbogen mit dem eingegebenen
   Radius (Vorgabe 6 m, 1 bis 30 m), tangential an beide Kanten; passt der Bogen nicht, bleibt die Fläche unverändert
   (`eckeRunden` in `src/rechner/planflaechen.ts`). Liest der Eckradius an einer Ecke nach Plan-Fläche einen Bogen über 23,5 m,
   gilt sie als unplausibel und der Abbiegeradius wird geschätzt; AV-Ecken über 23,5 m bleiben mit «AV-Ecke prüfen».
   Das Werkzeug «Mittelinsel (Standard)» fügt eine Schutzinsel mit Rollstuhlfurt nach Masterplan Fussverkehr Stadt Bern,
   Standards, E1 als Flächen (Plan) der Art Insel ein (Vorgaben Tiefe 2,00 m, Streifenbreite 4,00 m, Furt 1,20 m, Köpfe
   halbrund; Mitte auf der Streifenachse in der Fahrbahnmitte, die Furt bleibt Fahrbahn) und teilt einen Streifen von Hand auf
   Wunsch in zwei Teilstreifen (`src/rechner/standardinsel.ts`; Kennzeichnung im optionalen Feld `standard` der Fläche).
   Eine Mittelinsel in der Standardform lässt sich am Griff in der Inselmitte ziehen (entlang der Streifenachse; frei mit dem
   Schalter «frei verschieben» oder der Umschalttaste während des Ziehens); die Teile werden an der neuen Mitte neu gebildet, an ihr geteilte Teilstreifen nachgeführt
   (`inselVerschieben` in `src/rechner/standardinsel.ts`), «Verschiebung zurücknehmen» stellt die letzte Verschiebung zurück.
7. Je Streifen Lichtsignal und «kein FGS», je Zufahrt (Zeile anklicken) Tempo, «Fahrlinie korrigieren» (A: Linie seitlich
   verschieben, am Streifen und am Ende, + links, − rechts; B: Fahrlinie selbst zeichnen, bei Abbiegenden mit Kreisvorschlag
   und «Radius übernehmen») und «Diese Zufahrt gibt es nicht (streichen)». Abbiegezufahrten, die bisher wegen der geraden
   Zufahrt entfielen («durch die gerade Zufahrt mitgeprüft»), werden nach dem Streichen der geraden Zufahrt selbst geprüft,
   bis zum Knoten mit Tab. 1 der eigenen Strasse. Eingaben, zu denen die Rechnung keine Zufahrt mehr findet, meldet das Panel.
8. «Fall speichern» schreibt alle Eingaben als JSON-Datei (Version, Ort, Quellenstand); «Fall laden» stellt sie wieder her.
   Zusätzlich merkt sich der Browser die Eingaben je Übergang (localStorage, falls verfügbar).
   Ein geplanter Fall ohne Übergang liegt im Browser nur als letzter geplanter Fall («Letzten geplanten Fall
   wiederherstellen»); bevor ein ungesicherter geplanter Fall ersetzt oder die Seite verlassen wird und bevor ein anderer
   geplanter Fall im Browser-Eintrag ersetzt würde, fragt die App nach.

9. Luftbild: Am gewählten Übergang lädt die App einen Ausschnitt SWISSIMAGE 10 cm (± 30 m, © swisstopo) und sucht
   dort die gelben Balken. «Erkannt» ersetzt den Streifen aus OSM + AV (Hinweis «aus Luftbild, prüfen», Balken orange auf
   der Karte); «unsicher» erscheint gestrichelt als Vorschlag, die Rechnung nimmt dann OSM + AV. Das Luftbild lädt im
   Hintergrund: zuerst rechnet die App mit OSM + AV, sobald das Bild da ist, neu. «Luftbild-Streifen
   übernehmen und anpassen» macht ihn zum Streifen von Hand. Der Schalter «Streifen im Luftbild suchen» schaltet ab;
   dann lädt die App weder Bild noch Flugjahr, wieder eingeschaltet holt sie das Laden nach.

10. Bericht: «Bericht drucken / als PDF» öffnet eine Druckansicht (A4 hoch): Ort (Bezeichnung frei eingebbar, LV95,
   WGS84, OSM-Übergang), Kartenbild mit Streifen, Sichtfeldern, Sichtpunkten und Hindernissen, Status je Streifen, Tabelle je
   Zufahrt (Art, Tempo und Quelle, Sichtweite, Status, Hindernisse), Eingaben von Hand, Annahmen und Hinweise, Quellen,
   Normbezüge, App-Version. Als PDF speichern über den Druckdialog des Browsers. Status steht zusätzlich als Text (schwarz-weiss
   lesbar). Das Kartenbild ist ein einzelnes Luftbild per WMS (EPSG:2056) mit einer SVG-Zeichnung darüber, kein
   Leaflet-Ausschnitt: Bild und Rechnung sind beide in LV95, gedruckt wird erst, wenn das Bild geladen ist.
   Streifen von Hand stehen zusätzlich in der Tabelle «Lage des Streifens (LV95)» mit den Massen aus «Lage und Masse».
   Der Bericht druckt ohne Seitenrand (`@page { margin: 0 }`); den Rand bildet ein Rahmen, dessen Kopf und Fuss sich auf jeder
   Seite wiederholen (`.bericht-rahmen`). So setzt der Browser keine eigene Kopf- und Fusszeile mit Titel, Adresse, Seitenzahl und
   Datum dazu. Seite 1 zeigt Ort und Kartenbild, das Ergebnis beginnt auf Seite 2.

## Grenzen

- Amtliche Vermessung frei über geodienste.ch: 19 Kantone ganz, Wallis teilweise (ohne einzelne Gemeinden, z. B. Sitten,
  Brig), Liechtenstein. LU, VD, NE, NW, OW und JU geben die AV nur mit Freigabe ab; dort rechnet die App nicht.
- Luftbild-Erkennung: nur gelbe Streifen mit Balken bis rund 6 m; weisse Streifen erkennt die App nicht.
- Mehrere Streifen an einem Knoten und sehr breite Streifen bildet die App nicht immer richtig (offen); dann
  «Streifen von Hand».
- Amtliche Parkfelder nur in der Stadt Bern; sonst von Hand bzw. aus OSM-Vorschlägen (bestätigen). Private Parkplätze,
  Hecken und Mauern (Höhe) fehlen in den Daten.
- Die App ersetzt keine Beurteilung vor Ort.

## Was gerechnet wird

- **Streifen** (`rechner/streifen.ts`): Achse durch den Übergangsknoten, entlang des OSM-Fusswegs über die Fahrbahn
  (`footway=crossing`) bzw. senkrecht zum gequerten Weg; Enden 0,3 m vor der AV-Bordkante, bei sehr breiter Fahrbahn aus
  dem Fussweg bzw. der Breite des OSM-Wegs; Breite 4 m angenommen; Teilstreifen über AV-Verkehrsinseln.
- **Insel nach OSM** (`rechner/streifen.ts`, Schalter `INSEL_AUS_OSM`, `false` = wie bisher): Trägt der Übergangsknoten
  `crossing:island=yes` und liegt auf der Achse keine AV-Verkehrsinsel (die Insel ist in der AV Teil der Fahrbahn bzw. fehlt),
  teilt die App den Streifen nur mit Beleg im Luftbild («erkannt» bzw. «unsicher» mit Balken): zwei Balkengruppen mit einer
  Lücke von 1,0 bis 4,0 m (breiter: eher Fahrzeug oder Schatten) höchstens 3 m vom Knoten und beide Teile ab 2,0 m (wie die
  Teile über OSM + AV) – die Lücke ist die Insel, zwei Teilstreifen; bei «unsicher» teilt sie den Streifen aus OSM + AV
  (Panel und Bericht: «Streifen aus OSM + AV, an der Insel aus dem Luftbild geteilt»). Ohne diesen Beleg (kein Luftbild,
  nur eine Balkengruppe, Lücke zu breit, ein Teil unter 2,0 m) bleibt der Streifen durchgehend, mit dem Hinweis «OSM meldet
  eine Mittelinsel (crossing:island=yes), die Amtliche Vermessung keine – prüfen» bzw. «… – im Luftbild laufen die Balken
  durch», «… – im Luftbild Lücke zwischen den Balken x m zu breit – prüfen», «… – im Luftbild Lücke zwischen den Balken,
  Teil x m zu kurz – prüfen»; OSM allein ist kein Beleg, die AV behält das letzte Wort. Ob die Insel markiert oder gebaut
  ist, lässt die App offen (auch gebaute Inseln fehlen zuweilen in der AV). Sie geht als Fläche (Breite der Lücke × 6 m
  längs, Art Verkehrsinsel) in die Zufahrten (Inselteil, einspurig neben Insel, Gegenstück) und den Annäherungsbereich ein,
  die Bordkanten der Teilstreifen enden an ihr; Fahrbahn, Sichtpunkte, Abbiegende und Parkfelder bleiben bei der AV. Karte
  und Bericht zeigen sie grün gestrichelt («Insel angenommen (OSM/Luftbild), in der AV nicht erfasst – prüfen»), das Panel
  die Annahme. Eine Insel von Hand (Werkzeug «Insel») ersetzt die Annahme; auch neben ihr entstehen nur Teile ab 2,0 m.
- **Streifen im Luftbild** (`rechner/luftbild.ts`, `daten/luftbild.ts`; Kern nach fgs_luftbild.py):
  Gelb-Merkmal b* (CIE-Lab, Grün gedämpft); Abtasten entlang des gequerten OSM-Wegs auf der AV-Fahrbahn (dazu Brücken und
  übrige befestigte Flächen), ±26 m entlang, ±18 m quer, Drehungen ±24° und schräge Achsen ±30°; Balkentakt 0,92–1,12 m
  über die Korrelation des Querprofils mit einer Schwingung; zuerst ±8 m um den Knoten, weiter weg nur als Vorschlag.
  Drehung und Schräge danach aus den Balken selbst (Neigung, Lage der Balkenmitten). Balken: Kontrast gegen die Lücken
  (≥ 3 b*); Gruppen mit Lücken ohne Fahrbahn (Insel) ergeben Teilstreifen. Balkenlänge über den Kontrast entlang der
  Balken. Sicherheitsmass: NCC der Balken-Vorlage über ihrem Träger und Gelb-Kontrast: «erkannt» ab NCC 0,45, Kontrast 4,5
  und 4 Balken; «unsicher» ab NCC 0,30 bzw. bei Schatten; sonst «nicht gefunden». Vor «erkannt» Plausibilität (sonst
  «unsicher»): OSM-Knoten im Streifen (höchstens 1 m daneben oder auf der Insel zwischen Teilen), Mitte höchstens 4 m und
  entlang der Fahrbahn höchstens 2 m neben dem Knoten, Enden höchstens 1 m vor der Bordkante (bis 3 m verlängert, wenn
  dazwischen Grün oder Schatten liegt), Teilstreifen nur über einer AV-Insel oder mit der OSM-Querung, kein Teil auf einem
  anderen OSM-Übergang, Balkenende frei. Weiter als 8 m vom Knoten sucht die App nur, wenn nahe nichts Sicheres liegt.
  Weisse Streifen erkennt die App nicht. Achse wie im Kataster:
  senkrecht zu den Balken durch die Mitte der Balken-Hülle. Luftbild per WMS (wms.geo.admin.ch, EPSG:2056, 600 × 600 px
  JPEG, ~110 kB), Flugjahr aus den swisstopo-Metadaten; dekodiert und gerechnet im Web Worker (OffscreenCanvas).
- **Netz** (`rechner/netz.ts`): gequerter Weg, Fahrtrichtungen, Suche stromauf bis zum ersten Strassenknoten
  (Nebenarme, Gabeln), Knotenbereich (Durchblick, Kreisel-Ausfahrt), Fortsetzung, Rollen der Arme, Abbiegeverbote,
  Spuren entlang des Netzes.
- **Zufahrten** (`rechner/zufahrten.ts`): Einbahn, Richtungsfahrbahn, Inselteil, einspurig neben Insel, Teilstreifen mit
  Gegenstück; ohne gequerten OSM-Weg Spur entlang der nächsten passenden OSM-Achse (`rechner/achsen.ts`).
- **Tempo und Sichtweite** (`rechner/tempo.ts`): OSM-maxspeed entlang der Spur (Mehrheit innerhalb der Sichtweite),
  ohne Angabe 50 km/h (als Annahme ausgewiesen); VSS 40 241 Tab. 1; im Knoten nach Kurvenradius (bfu 2.457.01 bzw.
  VSS Tab. 2); «bis Knoten», Spurende, Kreisel nach Ringradius.
- **Fahrstreifenlage** (`rechner/fahrstreifen.ts`, `rechner/spur.ts`): AV-Querschnitte (Median), Bordkanten am Streifen,
  OSM-Fahrstreifen (`lanes`, `turn:lanes`, Busstreifen), mehrere Fahrstreifen ab 5,50 m je Richtung; Abzug Parkstreifen
  1,90 m, wo eingegebene Auto-Parkfelder am Rand liegen, Abzug Velostreifen aus `cycleway:*=lane` (1,50 m, angenommen);
  Sichtpunkte am rechten Rand gehalten (Trottoirnase vor Parkfeldern), mindestens 1,5 m von Parkfeldern, Beginn am Umriss
  des Streifens; Brückenköpfe (AV-Einzelobjekte) und übrige befestigte Flächen unter einem OSM-Weg wie in Bern.
- **Abbiegende** (`rechner/abbiegen.ts`): Radius der inneren AV-Bordkante (Kreisfit) + Abstand der Fahrlinie, Prüfung
  der Ecke (Bogen führt in den Arm, Fahrseite, Bordkante höchstens 6 m hinter dem Rand der Strasse, keine Parkfelder im
  Bogen), sonst Schätzung aus den Fahrbahnbreiten; Fahrlinie konzentrisch bzw. tangential.
- **Abbiegezufahrten und Mitprüfung durch die gerade Zufahrt**: Ein Arm ab 10° Drehung ist eine Abbiegezufahrt
  (`NEBENAST_GRAD` in `rechner/netz.ts`), darunter ein Nebenast (nur Hinweis). Liegt der Knoten weiter vom Streifen weg als
  die Kurvensichtweite des Abbiegers und reicht die Sichtweite der geraden Zufahrt bis zum Knoten (bzw. über Tab. 1 der
  eigenen Strasse), prüft die gerade Zufahrt die Strecke ab dem Knoten mit: die Abbiegezufahrt entfällt mit dem Grund
  «durch die gerade Zufahrt mitgeprüft» (Schlüssel `gedeckt`; dazu Knoten, Kurvensichtweite und Sichtweite der geraden
  Zufahrt). Schalter `GEDECKT_RECHNEN` in `rechner/abbiegen.ts`, standardmässig aus (`true`: sie wird mit ihrer
  Kurvensichtweite gerechnet, zählt für den Status des Streifens und trägt den Vermerk «(mitgeprüft)»).
- **Sichtfeld** (`rechner/pruefen.ts`): Vereinigung der Sichtkeile zum Streifen und zu den Annäherungsbereichen
  (an der AV-Bordkante); Konflikte (`rechner/pruefen.ts`, `rechner/hindernisse.ts`): Parkfelder ab 0,25 m² im Sichtfeld,
  Bäume (Stamm 0,5 m), AV-Gebäude und sichtbehindernde Hecken/Mauern/übrige ab 1 m² bzw. 0,5 m Linie. Status nach
  Rangfolge: Auto-Parkfeld, Gebäude, Hecke/Mauer, Baum, Zweirad-Feld; Auto-Parkfeld näher als 5 m am Streifen wird
  ausgewiesen (VRV Art. 18 Abs. 2e).

Einordnung der Übergänge (`daten/osm.ts`, `markierung`): *Lichtsignal* bei `crossing=traffic_signals` oder
`crossing:signals=yes`; *markiert* bei `crossing:markings=zebra*`, `crossing=zebra`, `crossing_ref=zebra`, `crossing=marked`
oder `crossing:markings=yes`; *vermutlich markiert* bei `crossing=uncontrolled` ohne `crossing:markings` (in der Schweiz
meist ein Fussgängerstreifen; als FGS geprüft, mit Hinweis «bitte prüfen»); *unmarkiert* bei `crossing=unmarked`,
`crossing:markings=no` oder einer anderen Markierung als fgs; *ohne Angabe* sonst (z. B. nur `highway=crossing`).
Unmarkiert und ohne Angabe gelten als kein Fussgängerstreifen. `crossing=no` wird nicht angeboten.

Ohne eingegebene Hindernisse (und ausserhalb von Gemeinden mit amtlichen Parkfeldern) prüft die App nur Gebäude. Hinweise auf Fahrzeuge oder Grün im Sichtfeld aus dem Luftbild gibt es (noch) nicht.
Baumkataster: derzeit Stadt Bern (WFS map.bern.ch, Ausschnitt ±100 m, «Geodaten Stadt Bern, Baumkataster»); der Dienst erlaubt Abrufe aus dem
Browser (CORS). Weitere Städte kommen mit einem Eintrag in `src/daten/baumkataster.ts` dazu.
Amtliche Parkfelder: derzeit Stadt Bern (WFS map.bern.ch, Produkt «Parkplätze öffentlich», Ausschnitt ±150 m, je
Flächen-Typ eine Abfrage, «Geodaten Stadt Bern, Parkplätze öffentlich»). Klassen wie in der Berner Prüfung: Parkfelder,
Spezialfelder und übrige = Auto, Parkplatz Velo/Mofa = Velo, Parkplatz Motorrad = Motorrad; Parkverbote, Veloabstell- und
übrige Punkt-Symbole zählen nicht; Flächen unter 0,5 m² entfallen. Die Rechnung nimmt Felder bis 110 m um den Streifen
(grösste Sichtweite 75 m bzw. Abbiegende: Knoten innerhalb der Sichtweite + 30 m Messung am Arm). Weitere Städte kommen mit
einem Eintrag in `src/daten/parkkataster.ts` dazu. An map.bern.ch geht nur der Kartenausschnitt (BBOX), keine Eingaben.
Beide Berner Dienste werden in LV95 abgefragt (BBOX und Ausgabe EPSG:2056): nach WGS84 rechnet der Dienst ohne
Datumsübergang um (Lage rund 150 m daneben).

Abrufe: Zeitgrenze bis zur vollständigen Antwort, Overpass mit Ausweichservern (höchstens 60 s gesamt), ein neuer Klick
bricht laufende Abrufe ab; Fehler stehen je Quelle unter «Geladene Quellen». Die Rechnung im Worker hat eine Zeitgrenze
von 30 s. Tempo: `maxspeed`, sonst `zone:maxspeed` bzw. `maxspeed:type` (z. B. `CH:zone30`), sonst 50 km/h (Annahme).

Automatische Übergangssuche (`src/App.tsx`, `src/ausschnitt.ts`): 800 ms nach dem letzten Verschieben bzw. Zoomen, ab Zoom 16;
abgefragt wird der Ausschnitt mit einem Rand von höchstens 20 % je Seite, so dass die Abfrage höchstens 4 km² umfasst; ist
schon die Sicht grösser als 10 km², erscheint «Zum Suchen näher heranzoomen». Liegt der neue Ausschnitt ganz in einem der
letzten 8 abgesuchten, fragt die App nicht neu; angezeigt werden die Übergänge dieser Ausschnitte (nach OSM-Id ohne Doppel),
der gewählte Übergang immer. Höchstens eine Suche läuft, zwischen zwei Abfragen liegen mindestens 2 s; eine laufende Suche
wird nicht abgebrochen, danach fragt die App den dann gezeigten Ausschnitt ab, wenn er noch nicht abgedeckt ist. Nach einer
Antwort 429 bzw. mit Retry-After gilt für alle Overpass-Abfragen eine Sperre (Retry-After, sonst 30 s, höchstens 120 s).
Das Laden eines Übergangs hat einen eigenen Abbruch. Gewählter Übergang, Eingaben und Rechnung bleiben beim Verschieben
unverändert.
Dieselbe Abfrage holt die benannten befahrbaren Wege (`highway` wie im Netz, mit `name`) nur als Mittelpunkt mit Tags
(`out tags center`, keine Geometrie): 4 km² Berner Innenstadt (14.10.2026) rund 480 kB statt 141 kB (582 Übergänge,
934 Wegstücke, 265 Namen); die Namen der Ausschnitte im Cache werden zusammengeführt (nach Weg-Id ohne Doppel, je Name eine
Beschriftung pro rund 120 m, zuerst die Mitte nahe dem Schwerpunkt aller Stücke dieses Namens).

Ortssuche (`src/Ortssuche.tsx`, `src/daten/ortssuche.ts`): SearchServer von swisstopo (`type=locations`, Herkünfte
`address,gazetteer,gg25,zipcode`, höchstens 8 Treffer, keine Parzellen), deckt die Schweiz und Liechtenstein ab. Abfrage ab
3 Zeichen (Enter ab 2) nach 300 ms Tipp-Pause, eine neue Eingabe bricht die alte Anfrage ab; die HTML-Auszeichnung der
Treffer wird entfernt und nur als Text angezeigt. Zoom nach Art: Adresse 19, Strasse 18, Ortsname 17, Gemeinde und PLZ 16
(Grenze der Übergangssuche: die Suche läuft sofort, und vom Zentrum ist möglichst viel zu sehen).

## Aufbau

- `src/geo.ts` – LV95 ↔ WGS84 (strenge Umrechnung wie PROJ), ebene Geometrie
- `src/daten/` – Abrufe: AV-WFS (Bodenbedeckung, Einzelobjekte), Overpass (mit Ausweichservern), Baumkataster, amtliche Parkfelder
- `src/fall.ts` – Fall-Datei (JSON) lesen, prüfen, schreiben; Eingaben für die Rechnung
- `src/rechner/` – Rechnung (siehe oben), `worker.ts` (Web Worker), `index.ts` (Einstieg)
- `src/App.tsx`, `src/Karte.tsx` – Panel und Leaflet-Karte (mit Knopf «Zum eigenen Standort»), `src/ausschnitt.ts` –
  abgesuchte Ausschnitte der Übergangssuche, `src/Ortssuche.tsx` – Ortssuche über der Karte
- `src/Einstieg.tsx` – Startseite oder Prüfung je nach Anker `#pruefen` (Zurück-Taste des Browsers geht; die Prüfung lädt
  erst beim Wechsel), `src/Startseite.tsx` – Startseite mit Beschreibung, Querverweisen und Datenspeicherung
- `src/Bericht.tsx` – Bericht (Druckansicht, Kartenbild aus WMS + SVG), `src/Hilfe.tsx` – «So funktioniert's», Datenschutz,
  Fusszeile, `src/texte.ts` – Texte für Panel und Bericht
- `src/abdeckung.ts` – Abdeckung der geladenen Daten: wann die App um Streifen von Hand neu lädt (Herleitung der 30 m im
  Kopf der Datei), `src/rechner/vermassung.ts` – Lage und Masse eines Streifens von Hand
- `src/rechner/planflaechen.ts` – Flächen (Plan) von Hand mit der AV-Bodenbedeckung verschneiden (Regeln im Kopf der Datei),
  `src/fixpunkt.ts` – Fangen auf AV-Stützpunkte, `src/benennung.ts` – Namen der Streifen von Hand und Zufahrten
- `src/referenz.test.ts` – Vergleich mit einer Referenz-Datei ausserhalb des Repos (nur lokal; ohne Datei übersprungen;
  Ergebnisdatei nur mit `FGS_REFERENZ_SCHREIBEN=1`)
- `src/bedarf/` – Bedarfsmodul, Etappe E0 (noch ohne Oberfläche): Regelkatalog mit Ziffer, Ausgabe, Stärke und Ebene je Regel
  (`katalog.ts`, nur eigene Kurztexte), Eingaben mit Quelle je Feld (`eingaben.ts`) und Entscheidbaum als reine Funktion
  `beurteile(eingaben, optionen)` → Befund (`entscheid.ts`; Ebenen Bern, Kanton BE und Richtlinie schaltbar). Seit Etappe E1
  mit Oberfläche: Abschnitt «Bedarf und Querungstyp» im Panel (`src/BedarfPanel.tsx`; Eingaben nach Blöcken mit Quelle,
  vorbelegt aus der Rechnung in `vorbelegung.ts`, Befundblatt aus `befundblatt.ts` auch im Bericht), Querung ohne Vortritt je
  Streifen mit der Sichtweite nach VSS 40 240 Z. 8.2 im Sichtrechner (`src/rechner/ohneVortritt.ts`); Fall-Dateien mit
  Bedarf-Eingaben (Block `bedarf`, je Unterfeld geprüft in `fallBedarf.ts`) bzw. mit einer Querung ohne Vortritt haben die Version 3.
  Grundprüfung nach bfu MS.013-2025 (Big Five) in `grundpruefung.ts`: eigene Regeln der Gruppe B5 im Katalog (Tempo als
  Vorbedingung, Sicht und Erkennungsdistanz, Schutzinsel, Zweistreifigkeit, Beleuchtung, Fussgängerfrequenz, dazu DTV und
  Annäherungsbereich), Stärke nach dem Wortlaut der bfu, Normhinweis, wo die Norm anders wertet; je Punkt erfüllt, verletzt,
  offen oder Hinweis, nur für Fussgängerstreifen ohne Lichtsignal und unabhängig von den Ebenen. Im Panel oben mit ihren
  Eingaben (`GRUND_FELDER` in `felder.ts`), Befundblatt und übrige Eingaben aufklappbar als «Erweiterte Prüfung»; im Bericht
  vor dem Befundblatt. Die Regeln B5 erscheinen nicht im Befundblatt; das Fallformat bleibt unverändert.
  Seit der Korrekturrunde zusätzlich die Fahrbahnhaltestelle (bfu Ziff. 2.3) und unsichere Soll-Werte als Bereich (Stufe 60 km/h
  ohne Angabe innerorts, Kurvenradius von Hand): verletzt nur sicher darunter, erfüllt nur sicher darüber, sonst offen.
  Feldhilfen in `feldhilfen.ts` (Knopf «?» je Feld im Panel): eigene Erklärung, Prüfungen mit Quelle automatisch aus dem Katalog,
  Bedeutung eines leeren Felds und Sichtbarkeitsbedingungen als Daten (`SICHTBAR`), geprüft vom Wächter `feldhilfen.test.ts`.

## Datenschutz

Keine Anmeldung, kein eigener Server; gerechnet wird im Browser. Eingaben bleiben im Browser bzw. in der Fall-Datei, die man
selbst speichert; an keinen Dienst gehen Eingaben oder Ergebnisse. Im Browser (localStorage) liegt je Übergang mit Eingaben ein
Eintrag `fgsCheck.fall.<Übergang>` (Eingaben, Bezeichnung, Koordinaten); Übergänge ohne Eingaben werden nicht gespeichert
(`fallMerken` in `src/fall.ts`), «Eingaben verwerfen» bzw. das Löschen aller Eingaben entfernt den Eintrag. Alle Einträge
löscht man über die Website-Daten der Seite im Browser. Der Browser fragt direkt an (die Dienste sehen technisch die
IP-Adresse):

| Dienst | Inhalt der Anfrage |
|---|---|
| wmts.geo.admin.ch (swisstopo) | Kartenkacheln (Luftbild bzw. Landeskarte) des sichtbaren Ausschnitts |
| api3.geo.admin.ch (swisstopo, SearchServer) | Ortssuche: der eingegebene Suchbegriff (Ort, Adresse, Strasse, PLZ) |
| wms.geo.admin.ch, api3.geo.admin.ch | Luftbild ±30 m um den Übergang, Kartenbild des Berichts; Flugjahr der 1-km-Kachel |
| geodienste.ch (AV-WFS) | Rechteck ±150 m um den Übergang (BBOX) |
| Overpass: overpass.osm.ch, ersatzweise overpass-api.de, overpass.kumi.systems, overpass.private.coffee | Kartenausschnitt (Übergänge und Strassennamen) mit Rand (Suche, automatisch beim Start und nach dem Verschieben bzw. Zoomen) bzw. Umkreis 300 m |
| map.bern.ch (nur Stadt Bern) | Rechteck ±150 m (amtliche Parkfelder, Baumkataster) |
| GoatCounter | Seitenaufruf ohne Cookies: Seitenpfad, Referrer, Bildschirmbreite, Browser und Betriebssystem, Sprache, Land (aus der IP-Adresse, die nicht gespeichert wird); zählt nicht auf localhost |

Beim Planen ohne OSM-Übergang gelten die Ausschnitte um den Ladeort an den gezeichneten Streifen statt um den Übergang.
Den letzten geplanten Fall ohne Übergang hält der Browser im Eintrag `fgsCheck.fall.ort`.

Der eigene Standort («Zum eigenen Standort») wird nur im Browser ermittelt und angezeigt, nicht gespeichert und nicht
gesendet; die Dienste erhalten wie sonst nur den Kartenausschnitt dort. GitHub Pages protokolliert Zugriffe wie jeder Webserver.

## Dienste und Betriebsbestimmungen

| Dienst | Bestimmung (Stand 11.10.2026) | App |
|---|---|---|
| geodienste.ch, AV-WFS | Betriebsbestimmungen KGK: Fair Use WFS 10 Abfragen/min bei 1 MB; Web-Apps bis 10 000 Nutzende/Tag gelten als Fair Use; Quellenangabe nach den Bedingungen des Kantons | 2 Abfragen je Klick (Bodenbedeckung, Einzelobjekte), Antwort rund 0,5 MB (bis 0,7 MB); Abbruch beim nächsten Klick; Quellenangabe «Amtliche Vermessung, Kanton …, geodienste.ch» |
| geo.admin.ch (WMTS, WMS, API) | Nutzung kostenlos ohne Registrierung, Fair Use (Web-Apps bis 20 000 Nutzende/Tag), keine Bots mit hoher Abfragedichte; Quellenangabe nach Datensatz | Kacheln nach Kartenansicht; je Klick 1 WMS-Bild (600 × 600 px) und 1 API-Abfrage; Bericht 1 WMS-Bild; Ortssuche 1 Abfrage nach 300 ms Tipp-Pause (ab 3 Zeichen, alte abgebrochen); «© swisstopo» |
| Overpass | öffentliche Instanzen: unter rund 10 000 Abfragen und 1 GB pro Tag, bei 429 warten | 1 Abfrage je Suche bzw. Klick; automatische Suche erst 800 ms nach dem Verschieben, höchstens eine laufend, mindestens 2 s Abstand, schon abgesuchte Ausschnitte ohne neue Abfrage, Abfrage höchstens 4 km²; Ausweichserver nur bei Fehler, Wartezeit nach 429/5xx (Retry-After), danach Sperre für alle Abfragen (höchstens 120 s), höchstens 60 s gesamt |
| map.bern.ch | Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht | nur in Bern, 8 Abfragen (je Flächen-Typ) je Ort, Baumkataster auf Wunsch; «Geodaten Stadt Bern, …» |

Quellen der Bestimmungen: [geodienste.ch, Nutzungsbedingungen](https://www.geodienste.ch/terms-of-use);
[BGDI/geo.admin.ch, Allgemeine Nutzungsbedingungen](https://www.geo.admin.ch/de/allgemeine-nutzungsbedingungen-bgdi);
[Overpass API, Nutzung der öffentlichen Instanzen](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html);
[Stadt Bern auf opendata.swiss](https://opendata.swiss/de/organization/stadt-bern).

## Quellen und Lizenzen

- Luftbild SWISSIMAGE: © swisstopo (WMTS geo.admin.ch für die Karte, WMS wms.geo.admin.ch für die Erkennung)
- Landeskarte (umschaltbarer Hintergrund): © swisstopo (WMTS geo.admin.ch)
- Bodenbedeckung: Amtliche Vermessung, Kanton (je nach Ort), über geodienste.ch; freie Nutzung mit Quellenangabe
  (App, Fall-Datei und Bericht nennen den Kanton; die Bedingungen je Kanton stehen auf geodienste.ch/services/av)
- Strassennetz und Übergänge: © OpenStreetMap-Mitwirkende, ODbL (Overpass API)
- Baumkataster (optional, Bern): Geodaten Stadt Bern, Baumkataster
- Amtliche Parkfelder (Bern, abschaltbar): Geodaten Stadt Bern, Parkplätze öffentlich
- Polygon-Operationen: polygon-clipping (MIT)
- Kartenbild im Bericht: SWISSIMAGE © swisstopo (WMS, mit Flugjahr)
- Sichtweiten: VSS 40 241, Tab. 1 und Tab. 2; bfu 2.457.01 (nur die Zahlenwerte)

Die App ersetzt keine Beurteilung vor Ort.

## Veröffentlichung

`.github/workflows/deploy.yml`: bei jedem Push auf `main` (bzw. von Hand über «Run workflow») `npm ci`, Tests, `npm run build`
(Basis `/`), Veröffentlichung auf GitHub Pages unter der eigenen Domain fgscheck.ch. Einmalig im Repo unter Settings → Pages als Quelle «GitHub Actions»
wählen und als Custom domain `fgscheck.ch` eintragen. Der Referenzvergleich (`src/referenz.test.ts`) läuft in CI nicht (keine Referenz-Datei); den Pfad setzt man lokal mit
`FGS_REFERENZ`. Nutzungsstatistik: GoatCounter in `index.html` (versionierte `count.v4.js` mit Integritäts-Hash).

## Versionen

- v0.4: Luftbild-Erkennung gelber Streifen, Bericht (Druckansicht bzw. PDF), amtliche Parkfelder der Stadt Bern,
  Startseite und Ortssuche.
- v0.5: Planung neuer Streifen («Streifen planen», Daten um die gezeichneten Streifen), Lage und Masse mit Fixpunkten,
  Namen für Streifen von Hand, Zufahrten nach Strasse und Herkunft benannt, verständlichere Annahmen im Bericht.
  Flächen (Plan) von Hand: geplante Trottoirränder, Fahrbahn und Inseln ersetzen in der Rechnung die AV-Bodenbedeckung.
  Fall-Dateien mit Flächen (Plan) haben die Version 2 (ältere Fassungen lehnen sie ab), alle übrigen bleiben Version 1.
  Zufahrten tragen Nummern (je Streifen im Uhrzeigersinn ab Norden nach der Herkunft) als Schild auf der Karte und im
  Kartenbild des Berichts sowie vor dem Namen in Panel und Bericht; von Hand gestrichene Zufahrten behalten ihre Nummer;
  nur Anzeige, nicht in der Fall-Datei.

## Lizenz

Code und eigene Inhalte dieses Projekts: **[CC BY-NC 4.0](LICENSE)** (Namensnennung, nicht-kommerziell). Die eingebundenen
**Dritt-Daten** behalten ihre eigenen Lizenzen und Quellenangaben, siehe [Quellen und Lizenzen](#quellen-und-lizenzen)
(swisstopo, Amtliche Vermessung, OpenStreetMap/ODbL, Geodaten Stadt Bern). polygon-clipping steht unter MIT.
