# fgsCheck (Prototyp v0.6)

Sichtprüfung an bestehenden und geplanten Fussgängerstreifen im Browser; dazu Bedarf und Querungstyp nach bfu, VSS 40 240,
40 241 und 40 242, Stadt und Kanton Bern, und die Trottoirüberfahrt mit Knotensicht.

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
   Planung neuer Streifen: «Streifen planen» (Gruppe «Planen»; ohne geladenen Ort oben im Panel) zeichnet einen Streifen an
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
   «Ecke runden» (je Fläche unter «Flächen (Plan)» bzw. in der Gruppe «Planen») ersetzt eine angeklickte Ecke durch einen Kreisbogen mit dem eingegebenen
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
   Das Werkzeug «Vorgezogener Seitenraum» fügt an einem Streifenende eine Fläche (Plan) Trottoir von der Bordkante bis 0,20 m über
   die Parklinie ein (VSS 40 240 Z. 13.4: idealerweise mindestens; Tiefe aus der Längsparkierung, sonst 2,00 m; je Seite bis zum
   ersten Parkfeld, höchstens 5,00 m); überdeckte Auto-Parkierung entfällt in der Rechnung, Masse änderbar, Griff zum Ziehen entlang
   der Bordkante (`src/rechner/seitenraum.ts`, Feld `standard` mit `typ: 'seitenraum'`; Fall-Datei Version 4).
   Die Planungswerkzeuge (Streifen planen, Mittelinsel (Standard), Vorgezogener Seitenraum, Fläche (Plan), Ecke runden,
   Fixpunkt) stehen in der Gruppe «Planen» über den Reitern, in beiden sichtbar, mit der aufklappbaren Liste «Geplante
   Elemente» (`src/Planen.tsx`); «Eingaben von Hand» behält die Werkzeuge für den Bestand. Esc beendet ein Werkzeug.
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
11. Reiter «Bedarf und Querungstyp»: Darf hier ein Fussgängerstreifen hin, und welche Querung passt? Zuerst die Grundprüfung
    nach bfu (Tempo, Sichtverhältnisse, Schutzinsel, Zweistreifigkeit, Beleuchtung, Fussgängerfrequenz), dann die erweiterte
    Prüfung nach Themen in der Gliederung der Normen (Anordnungsvoraussetzungen, Positionierung, Ausrüstung, Lichtsignal,
    Trottoirüberfahrt, Querungstyp), je Regel mit Fundstelle (Norm, Ziffer, Seite). Fragen statt Feldnamen; die App belegt vor,
    was sie aus Rechnung, OSM, Vermessung und Geoportal Bern kennt, und nennt die Herkunft. Annahmen und Vorschläge sind
    gekennzeichnet; ein hartes «nicht zulässig» entsteht nur aus Tatsachen oder nach «Vorschlag bestätigen». «Wert ändern» in
    einer Befundzeile springt zur Eingabe. Die Zusammenfassung sagt das Ergebnis in wenigen Sätzen und nennt die noch fehlenden
    Angaben.
12. «Trottoirüberfahrt planen» (Knopfzeile ohne Ort bzw. Gruppe «Planen»): beide Enden auf dem Trottoir der Hauptstrasse, links
    und rechts der Seitenstrasse anklicken; die Vermessung erscheint schon beim Planen. Die App zeichnet die gerechnete Überfahrt
    (Bordkante bis hinterer Rand), prüft die Prüfliste der VSS 40 242 (Tab. 1 bis 3, in der Reihenfolge der Norm; Ausführung
    getrennt von der Machbarkeit) und rechnet die Knotensicht der Ausfahrenden in zwei Phasen; wartende Fahrzeuge (grau: Sicht
    auf die Fahrbahn, ocker: Sicht aufs Trottoir) lassen sich am Auge ziehen, ein Klick zeigt nur ihre Phase, das Planungstempo
    steht im Block «Knotensicht». Winkel, Breite, Länge des überfahrbaren Rands und Wartezeit schlägt die App vor; ein bestehendes
    Lichtsignal am Knoten ist nur ein Vorschlag («Lichtsignal an der Einmündung» beim Streifen). Quert der Streifen die
    Hauptstrasse, sagt die App das und rechnet nicht.
13. «Messen» (Gruppe «Planen»): zwei Punkte anklicken, Fang auf Vermessungspunkte, Mass auf der Karte; «übernehmen» schreibt
    den Wert ins zuletzt angeklickte Zahlenfeld in Metern.

## Grenzen

- Amtliche Vermessung frei über geodienste.ch: 19 Kantone ganz, Wallis teilweise (ohne einzelne Gemeinden, z. B. Sitten,
  Brig), Liechtenstein. LU, VD, NE, NW, OW und JU geben die AV nur mit Freigabe ab; dort rechnet die App nicht.
- Luftbild-Erkennung: nur gelbe Streifen mit Balken bis rund 6 m; weisse Streifen erkennt die App nicht.
- Mehrere Streifen an einem Knoten und sehr breite Streifen bildet die App nicht immer richtig (offen); dann
  «Streifen von Hand».
- Amtliche Parkfelder nur in der Stadt Bern; sonst von Hand bzw. aus OSM-Vorschlägen (bestätigen). Private Parkplätze,
  Hecken und Mauern (Höhe) fehlen in den Daten.
- Knotensicht der Trottoirüberfahrt nur an Einmündungen und an Kreuzungen über die Zufahrt ohne Vortritt; an
  Grundstückzufahrten nur ein Hinweis. Bäume aus dem Baumkataster zählen (anders als im SichtweitenCheck).
- Wartezeit beim Ausfahren nur als Schätzung aus dem DTV der Hauptstrasse (Bern); ohne Verkehrszahlen offen.
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
  In der Stadt Bern gilt die signalisierte Höchstgeschwindigkeit des Geoportals (V_sig) als Tempo der Zufahrt (Quelle
  «Geoportal»; OSM nur Rückfall, Tempo von Hand geht vor): die Rechnung bekommt sie als Eingabe (`TempoAmtlich` in
  `rechner/tempo.ts`), die Zuordnung der Linien zur Spur steht in `daten/vsig.ts` (`vsigTempo`).
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
  abgesuchte Ausschnitte der Übergangssuche, `src/Ortssuche.tsx` – Ortssuche über der Karte; `src/Trenner.tsx` und
  `src/panelbreite.ts` – ziehbarer Trenner zwischen Karte und Panel (360 px bis 70 % der Fensterbreite, in localStorage gespeichert)
- Smartphone (seit 28.10.2026, wie VeloroutenCheck): unter 700 px Karte oben, Panel darunter mit eigenem Scrollen; der Knopf ▾/▴ unter der Ebenenwahl schaltet die Kartenhöhe zwischen 30, 45 (Standard, vorher fest 60 %) und 70 % der Fensterhöhe (`Karte.tsx`, in localStorage gespeichert). Auf Touch-Geräten sind Knöpfe und Felder mindestens 44 px hoch (ausser den Knöpfen im Text), Eingaben 16 px, damit iOS beim Antippen nicht hineinzoomt (`index.css`); Auswahlfelder sind nie breiter als ihr Platz. Die Zufahrten-Tabelle passt bei 375 px in das Panel (vorher 382 px, das Panel scrollte seitlich); kleine Schriften (Regelnummern, Herkunfts-Chips, Begriffe, Quellentabelle) mindestens 12 px. Panel und Kartensteuerung halten den sicheren Bereich des iPhones ein (`viewport-fit=cover`). «Zum Home-Bildschirm»: `public/manifest.webmanifest`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (aus `logo.svg`), `theme-color` in `index.html`.
- `src/Einstieg.tsx` – Startseite oder Prüfung je nach Anker `#pruefen` (Zurück-Taste des Browsers geht; die Prüfung lädt
  erst beim Wechsel), `src/Startseite.tsx` – Startseite mit Beschreibung, Querverweisen und Datenspeicherung
- `src/Bericht.tsx` – Bericht (Druckansicht, Kartenbild aus WMS + SVG), `src/Hilfe.tsx` – «So funktioniert's» (kurze Anleitung in
  Schritten, ausführliche Bedienung und Grenzen zugeklappt), Quellen der Prüfungen und Begriffe für die Panel-Abschnitte
  «Grundlagen und Quellen» bzw. «Begriffe», Datenschutz, Fusszeile, `src/streetview.ts` – Link «Street View ↗» auf Google Maps
  je Zufahrt (vom Sichtpunkt in Soll-Distanz mit Blick auf die Streifenmitte) und an der Streifenmitte, nur als Link (keine
  Einbettung, kein API-Schlüssel; die Koordinaten gehen erst beim Klick an Google), `src/texte.ts` – Texte für Panel und Bericht
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
  Ein Streifen lässt sich als Trottoirüberfahrt wählen (`StreifenEingabe.typ = 'trottoirueberfahrt'`): ohne Sicht auf die Wartefläche
  (Zufahrten nur für die Vorbelegung des Bedarfs), setzt im Bedarf den Querungstyp und rechnet die Knotensicht der Einbiegenden (`src/tue/`, Werkzeug «Trottoirüberfahrt»
  unter Planen bzw. Auswahl «Querung» am Streifen): zwei Phasen je Richtung, vom hinteren Rand der Überfahrt aufs Trottoir und von
  der Bordkante zur Fahrbahn (VSS 40 242 Ziffer 14.4, Werte nach VSS 40 273 Tab. 1, Tab. 2 und Tab. 3). Zufahrt ist der Arm des
  Knotens (bis 20 m), den die Querung quert, bei geteilten Streifen gemeinsam. Breite: von Hand (Bedarf), sonst AV (Trottoir quer
  bzw. schmaleres angrenzendes Trottoir, begrenzt auf 2,00 bis 3,50 m nach VSS 40 242 Ziffer 16), sonst 2,00 m als Annahme; die
  Gehlinie liegt 0,50 m vor dem hinteren Rand der Überfahrt. Tempo: von Hand («Tempo auf der Hauptstrasse»), sonst in der Stadt
  Bern das signalisierte Tempo des Geoportals, sonst OSM. Längsneigung aus Höhenprofilen (swissALTI3D), ohne Profil 0 %.
  Hindernisse wie in der Sichtprüfung: von Hand gezeichnete, Bäume aus dem Baumkataster und amtliche Parkfelder; Parkierung unter
  einem vorgezogenen Seitenraum entfällt, Flächen (Plan) ersetzen die AV darunter. Weil Bäume aus dem Baumkataster zählen, kann
  das Ergebnis vom SichtweitenCheck abweichen. Das Ergebnis belegt die Frage zur Sicht beim Ausfahren nur vor, wenn beide Phasen
  ein klares Ergebnis haben; ein «nein» aus einer Annahme bleibt ein Vorschlag zum Bestätigen.
  Der Rechenkern in `src/knotensicht/` ist eine wortgleiche Kopie aus dem SichtweitenCheck (Version, Commit und Prüfsummen in
  `src/knotensicht/herkunft.json`, geprüft von `src/tue/herkunft.test.ts`). Nicht von Hand ändern: Änderungen gehören in den
  SichtweitenCheck, danach `node scripts/knotensicht_holen.mjs <Pfad zu SichtweitenCheckWeb>`.
  Geprüft wird die Trottoirüberfahrt nach der Prüfliste der VSS 40 242 (Kapitel E) in deren Reihenfolge, mit Zwischentiteln und
  Seitenangaben (`ABSCHNITTE` in `src/bedarf/themen.ts`): zwingende Voraussetzungen (Tab. 1, S. 28; Regeln Q3-1 bis Q3-12),
  Merkmale zur Anordnung (Tab. 2, S. 30; Q3-M1 bis Q3-M10) und Ausstattung (Tab. 3, S. 32 und 34; F5a bis F5n, 11 Felder von
  Hand: Trottoirrand, überfahrbarer Rand, Begrenzung, Erkennbarkeit, Belag und Absatz, Quergefälle, Randabschluss, Randsteine,
  Signalisation, Markierung, Aufmerksamkeitsfelder), zuletzt die Berner Tabelle. Zulässig ist sie an einer Einmündung und an
  einer Kreuzung über die Zufahrt ohne Vortritt (Lage «knoten_belastet»; dann «gegenüberliegende Einmündung» aus OSM vorbelegt).
  Bei einer Trottoirüberfahrt erscheinen nur ihre Fragen (`SICHTBAR`, `nurFgsBeiTue`); ein Fussgängerstreifen als Alternative läuft
  still mit, seine Fragen erst nach «Alternative Fussgängerstreifen prüfen» (Sitzungszustand). Die Regeln F2–F4, F7 und E2b/E2c
  laufen bei einer Trottoirüberfahrt nicht. Werkzeug «Trottoirüberfahrt planen» auch ohne geladenen Ort (`src/Planen.tsx`).
  Karte: gerechnete Überfahrt zwischen Bordkante und hinterem Rand (`src/tue/karte.ts`), ohne Einmündung nur die Achse;
  Fahrzeuge der Knotensicht und am Fussgängerstreifen je gerade Zufahrt ein Fahrzeug am letzten Sichtpunkt sowie wartende
  Personen 0,6 m hinter der Bordkante (`src/fahrzeuge.ts`, Umrisse aus `src/knotensicht/rechner/fahrzeug.ts`; nur Anzeige,
  die Rechnung gibt dafür `warte` je Streifen aus). Werkzeug «Messen» (`src/messen.ts`): zwei Punkte mit Fang auf AV-Stützpunkte,
  Mass auf der Karte, «übernehmen» ins zuletzt angeklickte Zahlenfeld in Metern (auf 0,05 m gerundet, nicht im Fall gespeichert).
  AV-Vorschau beim Planen ohne geladenen Ort (`src/avVorschau.ts`): «Streifen planen» bzw. «Trottoirüberfahrt planen» lädt ab Zoom 17
  nur die AV-Bodenbedeckung ±150 m um die Kartenmitte (geodienste.ch, Anzeige und Fang der Enden), lädt nach dem Verschieben um mehr
  als 100 m nach und übergibt den Ausschnitt dem neuen Fall, wenn beide Enden innert 30 m um die Vorschaumitte liegen; Esc, ein
  anderes Werkzeug oder ein geladener Fall entfernt sie. Die Enden der geplanten Streifen fangen immer auf AV-Punkte (`FANG_PX`).
  Fahrzeugfarben nach Rolle und Phase (`fahrzeugFarbe`): wartend, Sicht auf die Fahrbahn grau; wartend, Sicht aufs Trottoir ocker; am
  Ende der Sichtweite bzw. am letzten Sichtpunkt blau. Die beiden wartenden Fahrzeuge lassen sich am Auge ziehen: der Punkt steht je
  Streifen als `tueD` (Phase Fahrbahn) bzw. `tueDtrottoir` (Phase Trottoir, LV95) in der Fall-Datei (optional, keine neue Version)
  und geht als `D` bzw. `Dtrottoir` an den Kern (SichtweitenCheck f2cba82); «Standort zurücksetzen» im Block Knotensicht. Dort steht
  auch «Planung: Tempo der Hauptstrasse» (schreibt «Tempo auf der Hauptstrasse» von Hand in den Bedarf).
  Ein Klick auf ein wartendes Fahrzeug zeigt nur die Sicht seiner Phase (Schalter «Sicht zeigen: beide | Fahrbahn | Trottoir» im
  Block, Sitzungszustand; das andere Fahrzeug bleibt durchscheinend anklickbar, der Bericht zeigt beide Phasen).
  Heutiger Zustand bei einer geplanten Trottoirüberfahrt: Lichtsignal am Knoten, Fahrstreifen über 1 je Richtung und Zone aus
  OSM kommen nur als «Vorschlag» (Q3-M7, Q3-7, Q3-8, Q3-M2 mit Bestätigungspflicht; hart erst von Hand bzw. bestätigt). In der Zeile
  des Streifens heisst die Auswahl dann «Lichtsignal an der Einmündung» und schreibt q3.lsaKnoten (`src/tue/LsaEinmuendung.tsx`).
  Vorschläge aus der Rechnung für die Trottoirüberfahrt (Quelle «Rechnung», Hand geht vor): Winkel der Einmündung (Knotensicht,
  OSM-Netz), Breite (AV-Trottoir, auf 2,00–3,50 m begrenzt; als Eingabe der Knotensicht zählt nur eine Breite von Hand, Quelle
  «Rechnung» wird übergangen), Länge des überfahrbaren Rands (Fahrbahnöffnung, siehe unten). Wartezeit beim Ausfahren als
  Annahme aus dem DTV der Hauptstrasse (Bern; `wartezeitSchaetzen`: Spitzenstunde 10 %, Zeitlückenmodell tc 6 s, tf 3 s, mittlere
  Wartezeit 3600/C), ohne Verkehrszahlen offen. Die Prüfliste trennt Machbarkeit (Tab. 1, Tab. 2, Breite, Trottoirrand, Länge)
  von der Ausführung (übrige Tab.-3-Punkte, Abschnitt «Ausführung (erst bei der Umsetzung)», eingeklappt, `ausfuehrungOffen` in
  der Prüfübersicht): offene Ausführungspunkte zählen nicht als fehlende Angaben und machen nichts vorläufig.
  Erkennungsdistanz auf der Karte (`src/erkennungKarte.ts`): je gerade Zufahrt ein Band entlang der Fahrlinie, grün bis zur
  Erkennungsdistanz, rot bis zum Soll (doppelte Sichtweite, höchstens 110 m), grau gestrichelt wo nicht geprüft; das verdeckende
  Hindernis rot wie ein Konflikt. Fahrzeuge am letzten Sichtpunkt auch für abbiegende Zufahrten. Befundzeilen im Panel haben einen
  Knopf «Wert ändern» zum geprüften Feld; bei der Trottoirüberfahrt stehen die vorbelegten Angaben offen im Thema («Von der App vorbelegt»).
  Die Länge des überfahrbaren Rands ist die Fahrbahnöffnung an der Bordkante der Hauptstrasse (Vorderkante der Knotensicht, AV mit
  Flächen (Plan): eine geplante Trottoirfläche verkürzt sie). Trottoirüberfahrten heissen in Liste, Karte und Bericht «Trottoirüberfahrt 1»
  (`streifenTitel`), lassen sich an den Enden verschieben (Griffe in der obersten Ebene, Fang auf die AV); ein Auge von Hand bleibt nur,
  wenn es noch zur verschobenen Überfahrt passt (`augePlausibel`).
  Quert der gezeichnete Streifen die Fahrbahn der Hauptstrasse, rechnet die App keine Knotensicht (Hinweis, «quert die Hauptstrasse»
  aus OSM vorbelegt, Q3-5); Fahrstreifen der Seiten- und Hauptstrasse aus den OSM-Tags der Wege am Knoten (`fahrstreifenTags`).
  Die erweiterte Prüfung ist nach den Normen gegliedert (`THEMEN_GRUPPEN` in `themen.ts`): Anordnungsvoraussetzungen (VSS 40 241 Kap. C,
  S. 6–10: Zulässigkeit, Nachfrage, Sicht, Fahrstreifen und Verkehr), Positionierung (Kap. D, Z. 18–20, S. 10–11: Lage und
  Abstände), Ausrüstung (Kap. D, Z. 21–29, S. 11–14: Insel, Masse und Ausrüstung, Beleuchtung), Lichtsignalanlage (VSS 40 837),
  Trottoirüberfahrt (VSS 40 242), Querungstyp nach VSS 40 240; innerhalb eines Themas nach der Ziffer der ersten Quelle. Die
  Grundprüfung (bfu) bleibt davor.
  Im Panel stehen Sichtprüfung und Bedarf in zwei Reitern (`src/ReiterLeiste.tsx`, Logik in `src/reiter.ts`: Vorgabe nach dem
  Fall, Pfeiltasten, Zustand der Zulässigkeit in Wort und Symbol, Teaserzeile im Reiter Sichtprüfung).
  Vorbelegung aus Geodaten (`vorbelegung.ts`, `src/daten/haltestellen.ts`, `verkehrsdaten.ts`, `geoportal.ts`): Bushaltestelle
  (Geoportal Stadt Bern bzw. OSM, «keine» ohne Haltestelle im Umkreis von 50 m, sonst Hinweis), Strecke oder Zone (OSM-Tags der
  Zufahrten), DTV (Bern: Geoportal, 16·Nt + 8·Nn; ohne Eintrag Annahme 500) und ein Hinweis zur Beleuchtung (OSM, ohne Wert); jede
  Angabe nennt ihre Herkunft, eine Handeingabe überschreibt sie.
  Automatik Paket A + B (`automatik.ts`, Schwellen in `AUTO`): weitere Felder aus den schon geladenen Daten – Lage (Kreisel,
  Einmündung, Strecke; an einer Kreuzung Hinweis), Verzweigung, Abstände zum nächsten markierten Übergang bzw. Lichtsignal entlang
  der Strasse, Knoten mit Lichtsignal und Arme ohne Querung (OSM-Netz), Rückversatz, Länge der Einengung, Trottoir vor der
  Parkreihe und Kopfüberstand der Insel (AV), Haltestelle angrenzend, Art, Lage und Verdeckung, Tramhaltestelle, Busstreifen,
  Tram (AV bzw. OSM), Strassentyp (OSM), Ein-/Ausfahrt, innerorts und Strecke aus OSM-Tags bzw. Tempo, Kurvenradius und
  Halteverbotslinie aus dem Sichtrechner, Annahmen mit Schwellen (stark befahren, Autoverkehr, lange Querung, Einengung) und
  Übernahmen in LSA-Zeiten und Trottoirüberfahrt. Der vorbelegte Wert steht im Feld mit Quellen-Chip; eine abweichende Eingabe
  wird Handeingabe, eine Handangabe «offen» verwirft die Vorbelegung (`{ wert: null, quelle: 'hand' }` im Block `bedarf`, ältere
  Versionen übergehen sie). «Sichtweite je Zufahrt» zeigt ohne Handeingabe das Ergebnis des Sichtrechners (Zustand «rechner»,
  zählt nicht als offen); der Sichtrechner liefert dazu je gerade Zufahrt `freiBisM` (zusätzliches Ausgabefeld, Status und Soll
  unverändert), das die Grundprüfung bei verdeckter Sicht nutzt.
  Erkennungsdistanz aus dem Sichtrechner (`src/rechner/erkennung.ts`): je gerade Zufahrt eines Fussgängerstreifens `erkennungM`
  (`{ wert, bis: 'frei' | 'fahrlinie_endet' | 'verdeckt', hindernis?, ende? }`, zusätzliches Ausgabefeld, übrige Ergebnisse
  unverändert): freie Sicht von den Sichtpunkten bzw. einer nur dafür verlängerten Fahrlinie auf die Markierung im eigenen
  Fahrstreifen, Abstand entlang der Fahrlinie, bis 110 m (`REICHWEITE_SICHT_M`) bzw. bis zum Ende der Fahrlinie; Gebäude, Hecken,
  Mauern, Bäume und Auto-Parkfelder verdecken; Abbieger und Querungen ohne Vortritt ohne Wert. 2D ohne Gelände, nur die Markierung
  (nicht die blaue Tafel, Signal 4.11): die Vorbelegung setzt den kleinsten Wert der geraden Zufahrten als Annahme ins Feld «Ab welcher Distanz ist der Streifen erkennbar» (eine Untergrenze nur, wenn sie das Doppelte der
  Sichtweite erreicht; Handeingabe geht vor).
  Datenschicht «Automatik Paket C» (nur Daten, in `GeoVorbelegung` durchgereicht; in Bern geladen, wenn die AV-Fläche am Ladeort
  in der Stadt Bern liegt, je Dienst eine Abfrage pro Layer im Rechteck ±150 m, Fehler je Dienst getrennt, Liste in
  `src/daten/bernDienste.ts`, Quellenangabe «Geodaten Stadt Bern» in Fusszeile, Fall-Datei und Bericht):
  `richtplanFussverkehr.ts` liest aus dem Richtplan Fussverkehr das Basisnetz (Linien) und die publikumsattraktiven Bereiche (Flächen);
  `strassenhierarchie.ts` liest die Strassenhierarchie (Typ_id: Quartier-, Quartierverbindungsstrasse, Basisnetz …) und die
  Strassentypen (Strgatt_id: SS_30, SS_50, VS_50_60, HVS_50_60, HVS_80) als Linien;
  `vsig.ts` liest die signalisierte Höchstgeschwindigkeit (V_sig) je Strassenabschnitt;
  `schulen.ts` liest Volksschulen und Kindergärten (Geoportal, ohne Kindertagesstätten) und überall aus OSM Schulen, Kindergärten
  und Heime (amenity bzw. social_facility, Umkreis 200 m, eigene Menge der Overpass-Abfrage; Geoportal ebenfalls ±200 m, damit der
  Umkreis von 150 m um den Streifen ganz geladen ist);
  `taktil.ts` liest die taktil-visuellen Markierungen (Felder als Punkte, Linien inkl. Leitlinie auf dem Streifen);
  `nutzungszonen.ts` liest die Grundzonen des Nutzungszonenplans (Flächen, Gewerbe = 1004 Industrie und Gewerbe sowie 1018
  Gewerbegebiet Matte, Bauzone ohne Schutzzonen, Landwirtschaft, Wald und Gewässer, vereinfacht abgefragt);
  `oevLinien.ts` liest die ÖV-Linien mit Verkehrsmittel (Bus, Trolleybus, Tram …), auf den Ausschnitt zugeschnitten;
  `osm.ts` lädt zusätzlich Vortrittszeichen (give_way, stop) und Verkehrsschilder (traffic_sign) im Umkreis, die die Rechnung
  übergeht; `geoHilfen.ts` enthält die Geometrie-Hilfen dazu (Punkt in Fläche, Abstand zu Linie bzw. Fläche, Schnitt mit einer
  Achse, nächste Linie, Zuschneiden).
  Regeln «Automatik Paket C» (`automatikC.ts`, Schwellen in `AUTO_C`; Vortrittsrolle in `automatik.ts`): signalisiertes Tempo aus
  V_sig (Vorrang vor OSM), Strecke oder Zone bei Tempo 30 ohne Zonenangabe aus der Strassenhierarchie (Annahme), Strassentyp aus
  Strassenhierarchie und Strassentypen (Vorrang vor der OSM-Annahme, Widerspruch offen), besonderer Grund (Volksschule bzw.
  Kindergarten, Heim nach OSM, Haltestelle; nichts im ganz geladenen Umkreis von 150 m «keines» als Annahme), Fusswegnetz,
  Netzplanung, Nachfrage und Gehlinie aus dem Richtplan Fussverkehr, ertastbare Markierung und Leitlinie aus den taktil-visuellen
  Markierungen, Gewerbe und bebautes Gebiet aus dem Nutzungszonenplan, Linienbus und Tramhalt aus den ÖV-Linien, Vortrittsrolle an
  der Kreuzung aus Vortrittszeichen nach OSM. Fehlen Daten bzw. fällt ein Dienst aus, bleibt das Feld offen (mit Hinweis).
  Harte Verbote des Rechts (A2 Begegnungszone, C2 Tempo-30-Zone ohne besonderen Grund; Kennzeichen `nurMitBestaetigung` im Katalog)
  gelten nur mit Tatsachen bzw. bestätigten Werten: beruhen sie auf einer Annahme, bleiben sie offen («Annahme bestätigen»); der Knopf
  «Vorschlag bestätigen» am Feld übernimmt die Annahme als Handeingabe mit der Quelle «bestätigt» (`bestaetigt`).
  Grundprüfung nach bfu MS.013-2025 (Big Five) in `grundpruefung.ts`: eigene Regeln der Gruppe B5 im Katalog (Tempo als
  Vorbedingung, Sicht und Erkennungsdistanz, Schutzinsel, Zweistreifigkeit, Beleuchtung, Fussgängerfrequenz, dazu DTV und
  Annäherungsbereich), Stärke nach dem Wortlaut der bfu, Normhinweis, wo die Norm anders wertet; je Punkt erfüllt, verletzt,
  offen oder Hinweis, nur für Fussgängerstreifen ohne Lichtsignal und unabhängig von den Ebenen. Im Panel oben mit ihren
  Eingaben (`GRUND_FELDER` in `felder.ts`), übrige Prüfungen und Eingaben aufklappbar als «Erweiterte Prüfung»; im Bericht
  vor dem Befundblatt. Die Regeln B5 erscheinen nicht im Befundblatt; das Fallformat bleibt unverändert.
  Seit der Korrekturrunde zusätzlich die Fahrbahnhaltestelle (bfu Ziff. 2.3) und unsichere Soll-Werte als Bereich (Stufe 60 km/h
  ohne Angabe innerorts, Kurvenradius von Hand): verletzt nur sicher darunter, erfüllt nur sicher darüber, sonst offen.
  Feldhilfen in `feldhilfen.ts` (Knopf «?» je Feld im Panel): eigene Erklärung, Prüfungen mit Quelle automatisch aus dem Katalog,
  Bedeutung eines leeren Felds und Sichtbarkeitsbedingungen als Daten (`SICHTBAR`), geprüft vom Wächter `feldhilfen.test.ts`.
  Themen und Verbindlichkeit in `themen.ts`: jede Regel hat genau ein Thema (`thema` im Katalog, Liste `THEMEN`; die Punkte der
  Grundprüfung führen die bfu-Namen, ihr Thema steht daneben); das Befundblatt ordnet die Einträge nach Thema und Stärke, nennt je Eintrag die
  Verbindlichkeit in Worten aus Ebene und Stärke (`verbindlichkeit`, z. B. «Pflicht (Norm)») und zählt (`pruefUebersicht`)
  die geprüften Regeln (in Ordnung = `Befund.erfuellt`, offen, Befunde, Hinweise; nicht anwendbare zählen nicht).
  Seit der Korrekturrunde heisst «in Ordnung» «ohne Befund» und gilt nicht für die zweite Stufe eines Regelpaars, deren erste
  verletzt oder offen ist (`PAARE`); Weichen zählen nicht, «nicht geprüft» nennt den Grund. Verbindlichkeit als «Muss», «Soll» bzw.
  «Hinweis» mit Ebene. Grundprüfung und Befundblatt zeigen eine Zeile je Punkt bzw. Eintrag (`kompakt.ts`), offene Angaben als
  Frage je Feld (`FRAGEN` in `feldhilfen.ts`), Klick springt zum Feld. In der Grundprüfung nennt die Zeile nur den Satz der
  Teilregel, die den Zustand bestimmt (übrige offene Teilregeln, Annahmen und Hinweise gezählt); die Details je Punkt öffnet ▸ am
  Zeilenende, im Bericht stehen sie unter der Zeile. Das Werkverzeichnis (`WERKE` in `katalog.ts`) führt je Werk den vollen Titel
  und die offiziellen Adressen beim Herausgeber (Seite bzw. PDF mit Grösse; Normen ohne Link, kostenpflichtig): Links ↗ in den
  Quellen der Prüfungen, im Bericht die Adresse als Text. Im Lesetext stehen Werke mit verständlichem Namen und ausgeschriebener
  Fundstelle (`LESENAME`, `fundstelleText`, `verweisTeile` in `quellen.ts`), verlinkt auf ihre Zeile in «Grundlagen und Quellen»;
  Artikel des Bundesrechts direkt in fedlex, Seiten der Berner Masterpläne im PDF. Der Panel-Abschnitt «Regeln» (`RegelUebersicht.tsx`,
  Daten aus `bedarf/regeluebersicht.ts`) listet alle Regeln des Katalogs nach Thema oder nach Quelle, mit Filter und Suche: Fundstelle,
  wo und wann die Regel wirkt, nötige Angaben (Sprung zum Feld) und Ergebnis; die Zahl «Regeln» der Quellentabelle und die
  Regelnummern in den Details verweisen dorthin. Unter der Zusammenfassung stehen im Panel die offenen Fragen der Grundprüfung
  (`offeneFragen` in `zusammenfassung.ts`: feste Reihenfolge nach Punkt, mit dessen Zeichen, ohne Nummern), mit der Eingabe
  direkt dort (dieselbe Felddefinition und Übernahme wie die Maske); Satz 3 zählt sie nur, im Bericht bleiben sie ausgeschrieben.
  Die erweiterte Prüfung steht je Thema (`themenansicht.ts`): Befunde, offene Angaben als Fragen mit Eingabe (dieselbe Liste wie
  der Block, je Feld einmal, im Thema des Felds bzw. seiner Regeln) und zugeklappt die übrigen Felder des Themas; brauchen Regeln
  eines anderen Themas bzw. der Grundprüfung die Angabe, dort ein Verweis «siehe …» mit der Regel; ohne Angaben nicht geprüfte
  Blöcke (Trottoirüberfahrt, LSA-Zeiten) als Zeile mit Sprung; Masse sowie Annahmen und Hinweise am Ende. Der Bericht gliedert
  gleich, ohne Eingaben.
  Zuoberst im Abschnitt und im Bericht steht je Querung eine Zusammenfassung in drei Sätzen nach festen Vorlagen (`zusammenfassung.ts`:
  Zulässigkeit und Empfehlung, Grundprüfung und wichtigste Befunde mit den Kurzformen `kurzsatz` des Katalogs, fehlende Angaben als Fragen).
  Runde 4: Quellenverzeichnis in `quellen.ts` (je Werk des Werkverzeichnisses zwei eigene Sätze: was es ist und wie verbindlich nach
  der Ebene; Tabelle mit Zahl der Prüfungen je Werk im Panel-Abschnitt «Grundlagen und Quellen», Bericht nur mit den Werken des
  Falls, in den Details der Werkname als Verweis), Begriffsliste in `begriffe.ts` (eigene Erklärungen; Panel-Abschnitt «Begriffe» alphabetisch, Bericht nur die Begriffe des Falls, dezente
  Verweise in Feldhilfen und Details) und an offenen Feldern der Zusatz, wofür die Angabe fehlt («fehlt für 2 Muss-Prüfungen»,
  «entscheidet über die Zulässigkeit»; `feldbedarf.ts`). «Vorschlag bestätigen» steht nur an Feldern, deren Annahme im Fall ein
  Verbot offen hält. Abstände entlang der Strasse: endet die Strasse ohne Fortsetzung (Querstrasse, Sackgasse), gilt diese Richtung
  als ganz durchsucht, nur ein Namenswechsel begrenzt die Suche (`FORTSETZUNG_GRAD` in `automatik.ts`); enden beide Richtungen, gilt
  die Länge der ganzen Strasse mit dem Kennzeichen `ganzeStrasse` (G1/G2 dann als Hinweis, nicht anwendbar). Ist offen, ob die Querung in einer Begegnungszone liegt (bei unbekanntem
  Tempo ohne Zonenangabe, bei widersprüchlichen Angaben zu Tempo 20 sowie bei einer Begegnungszone aus OSM gegen amtliches Tempo ab
  30 km/h, Kennzeichen `strittig`; sonst ist die Regel ab Tempo 30 nicht anwendbar), folgt die Empfehlung eines Typs erst nach der
  Klärung. Bei genau Tempo 20 (Geoportal bzw. OSM maxspeed) ohne widersprechende Zonenangabe schlägt die Vorbelegung die
  Begegnungszone vor (Quelle `vorschlag`, keine Annahme: gilt für die Beurteilung, von Hand auf Strecke änderbar).
  Satz 1 der Zusammenfassung nennt bei offener Zulässigkeit den möglichen Typ («falls ja, passt …») und die
  entscheidende Frage; Satz 3 trennt entscheidende von vervollständigenden Angaben; Satz 4 nennt Annahmen und gefundene Gründe für
  Vortritt. Belege aus Datenbanken (OSM-Tags, Knotennummern) stehen in Herkunftstexten zwischen ⟦…⟧ und erscheinen nur im Tooltip
  (`lesetext.ts`). Neue Regel E1c (Furt ohne Insel). Besonderer Grund «Fusswegnetz (Bern)», zählt nur mit der Ebene Bern. Teilstreifen
  an einer Insel über 12 m (`TEIL_MAX_M`) belegen keine Masse vor. Der Bericht zeigt den Bedarfsteil, sobald eine Beurteilung vorliegt.

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
| api3.geo.admin.ch (swisstopo, Höhenprofil) | nur an einer Trottoirüberfahrt: bis vier Linien der Knotensicht (Koordinaten) |
| geodienste.ch (AV-WFS) | Rechteck ±150 m um den Übergang (BBOX) |
| Overpass: overpass.osm.ch, ersatzweise overpass-api.de, overpass.kumi.systems, overpass.private.coffee | Kartenausschnitt (Übergänge und Strassennamen) mit Rand (Suche, automatisch beim Start und nach dem Verschieben bzw. Zoomen) bzw. Umkreis 300 m |
| map.bern.ch (nur Stadt Bern) | Rechteck ±150 m (amtliche Parkfelder, Baumkataster, Haltestellen, Verkehrsdaten) |
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
| map.bern.ch | Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht | nur in Bern, 8 Abfragen (je Flächen-Typ) je Ort, Baumkataster auf Wunsch, dazu je 1 Abfrage Haltestellen und Verkehrsdaten (ArcGIS REST, zwischengespeichert); «Geodaten Stadt Bern, …» |

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
- Haltestellen und Verkehrsdaten (Bern, Vorbelegung Bedarf): Geodaten Stadt Bern, Haltestellen bzw. Flächendeckende Verkehrsdaten
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
- v0.6: Bedarfsmodul «Bedarf und Querungstyp»: Grundprüfung nach bfu (Big Five) und erweiterte Prüfung nach Normen,
  Stadt Bern und Kanton Bern; Zusammenfassung in wenigen Sätzen, Fragen statt Feldnamen, Erklärung und Herkunft je Feld,
  Quellen der Prüfungen mit Links, Begriffe und Regelübersicht als eigene Abschnitte. Vorbelegung aus Sichtrechner, OpenStreetMap, Amtlicher
  Vermessung und Geoportal der Stadt Bern; Annahmen sind gekennzeichnet, harte Verbote nur aus Tatsachen oder nach
  Bestätigung. In Bern rechnet die Sichtprüfung mit dem signalisierten Tempo des Geoportals. Fall-Dateien mit
  Bedarfsangaben haben die Version 3. Breite des Bereichs neben der Karte ziehbar. Zwei Reiter «Sichtprüfung» und
  «Bedarf und Querungstyp»; Trottoirüberfahrt als Werkzeug bzw. am Streifen wählbar, mit Knotensicht der Einbiegenden
  (Rechenkern aus dem SichtweitenCheck), geprüft nach der Prüfliste VSS 40 242 (Tab. 1 bis 3, Ausstattung neu), auch an
  Kreuzungen über die Zufahrt ohne Vortritt; erweiterte Prüfung nach der Gliederung der Normen mit Seitenangaben; Werkzeug
  «Messen»; Fahrzeuge und wartende Personen auf der Karte; Vermessung schon beim Planen ohne Ort; wartende Fahrzeuge der Knotensicht ziehbar, Planungstempo im Block; Tempo 20 als
  Begegnungszone vorgeschlagen; Erkennungsdistanz des Streifens aus dem Sichtrechner; Street View je Zufahrt.

## Lizenz

Code und eigene Inhalte dieses Projekts: **[CC BY-NC 4.0](LICENSE)** (Namensnennung, nicht-kommerziell). Die eingebundenen
**Dritt-Daten** behalten ihre eigenen Lizenzen und Quellenangaben, siehe [Quellen und Lizenzen](#quellen-und-lizenzen)
(swisstopo, Amtliche Vermessung, OpenStreetMap/ODbL, Geodaten Stadt Bern). polygon-clipping steht unter MIT.
