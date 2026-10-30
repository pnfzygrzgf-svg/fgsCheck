// ── Einstiegshilfe, Datenschutz und Fusszeile (E4, Veröffentlichung) ──

import { datenschutzGruppen } from './daten/quellenregister'
import { NACHLADEN_M } from './abdeckung'
import { FANG_PX, FANG_MAX_M, VORSCHLAG_M } from './fixpunkt'
import { ECK_GROSS_M, RUNDEN_R_VORGABE, RUNDEN_R_BEREICH } from './rechner/planflaechen'
import { E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, TEIL_ABSTAND_M, INSEL_TIEFE_MIN_M } from './rechner/standardinsel'
import { AHS_40240 } from './bedarf/tabellen'
import { KATALOG } from './bedarf/katalog'
import { THEMEN } from './bedarf/themen'
import { Fragment } from 'react'
import { WerkLinks, VerweisText } from './Verweise'
export { WerkLinks }
/** Werkname im festen Text als Verweis (Quellen der Prüfungen bzw. fedlex), wie im Lesetext */
const V = (t: string) => <VerweisText text={t} />
import { WERKE } from './bedarf/katalog'
import { LESENAME, WERK_IDS, WERK_INFO, regelnJeWerk, werkAnker, werkText, werkVoll } from './bedarf/quellen'
import { SICHTWEITE, KURVE_SICHTWEITE } from './rechner/tempo'
import { regelWerkAnker, regelnWerkZeigen } from './bedarf/regeluebersicht'
import { begriffeAlphabetisch } from './bedarf/begriffe'
import { REICHWEITE_SICHT_M } from './rechner/ohneVortritt'

const F3 = KATALOG.F3.werte, F3B = KATALOG['F3-B'].werte
const B5 = KATALOG['B5-T'].werte, B5S = KATALOG['B5-1'].werte
import { f2, TUE_OPTION } from './texte'
import { feldName } from './bedarf/felder'

/** «So funktioniert's»: kurze Anleitung in Schritten (Nutzerwunsch 23.10.2026); die ausführliche Bedienung und die Grenzen der App
 * zugeklappt darunter. Quellen der Prüfungen und Begriffe stehen als eigene Abschnitte im Panel (App.tsx). */
export function Anleitung() {
  return (
    <details className="hilfe">
      <summary>So funktioniert's</summary>
      <ol>
        <li><b>Ort finden:</b> oben in der Karte Ort, Adresse oder Strasse suchen bzw. die Karte verschieben; näher herangezoomt
          erscheinen die Übergänge.</li>
        <li><b>Übergang wählen:</b> einen Punkt anklicken (gelb: Fussgängerstreifen, violett: Lichtsignal, grau: kein Streifen). Die App
          lädt Luftbild, Amtliche Vermessung und OpenStreetMap und rechnet im Browser.</li>
        <li><b>Sicht lesen:</b> im Reiter «Sichtprüfung» steht je Zufahrt, ob die Sicht frei oder verdeckt ist und wodurch; ein Klick
          auf die Zeile zeigt das Sichtfeld auf der Karte.</li>
        <li><b>Ergänzen:</b> unter «Eingaben von Hand» Parkfelder, Bäume, Hecken oder eine Insel zeichnen und Tempo oder Fahrlinie
          anpassen; die App rechnet sofort neu.</li>
        <li><b>Neu planen:</b> in der Gruppe «Planen» über den Reitern: «Streifen planen» und die beiden Wartebereiche anklicken;
          Trottoirnasen, Inseln und Eckradien mit «Fläche (Plan)», «Mittelinsel (Standard)», «Vorgezogener Seitenraum» und «Ecke
          runden».</li>
        <li><b>Bedarf klären:</b> im Reiter «Bedarf und Querungstyp» die Zusammenfassung lesen, die offenen Fragen beantworten und
          Vorschläge bestätigen.</li>
        <li><b>Bericht:</b> «Bericht drucken / als PDF» öffnet die Druckansicht mit Kartenbild, Ergebnissen und Quellen.</li>
        <li><b>Speichern:</b> «Fall speichern» sichert alle Eingaben als Datei, «Fall laden» stellt sie wieder her.</li>
      </ol>
      <p className="klein">Eingaben bleiben im Browser bzw. in der Fall-Datei (mehr unter «Datenschutz»). Werke und Fachbegriffe stehen
        unten in «Grundlagen und Quellen» und «Begriffe». Die App ersetzt keine Beurteilung vor Ort.</p>
      <details className="hilfe-teil">
        <summary>Mehr zur Bedienung</summary>
        <p className="klein">Sichtprüfung an bestehenden und geplanten Fussgängerstreifen nach {V('VSS 40 241')} und der {V('bfu-Fachdokumentation «Fussgängerstreifen»')},
          gerechnet im Browser.</p>
        <ul>
          <li><b>Ort finden:</b> oben in der Karte Ort, Adresse, Strasse oder PLZ eingeben und einen Vorschlag wählen, oder mit dem
            Standort-Knopf unter den Zoom-Knöpfen zum eigenen Standort springen. Die Übergänge im Ausschnitt erscheinen nach dem
            Verschieben bzw. Zoomen von selbst, mit den Strassennamen aus OSM (ab Massstab 1:10 000; weiter draussen: «Zum Suchen
            näher heranzoomen»). Oben
            rechts in der Ebenenwahl lässt sich der Hintergrund umschalten: Luftbild oder Landeskarte (mit Strassennamen). Der Trenner
            zwischen Karte und rechtem Bereich lässt sich ziehen (bzw. mit den Pfeiltasten verschieben); die Breite bleibt gespeichert.</li>
            <li><b>Übergang wählen:</b> einen Punkt anklicken. Gelb: Fussgängerstreifen in OSM, gelb gestrichelt: vermutlich, violett: Lichtsignal, grau: kein
            Fussgängerstreifen. Die App lädt Amtliche Vermessung, OSM und das Luftbild und rechnet im Browser. Den Streifen sucht sie im Luftbild, sonst bildet sie ihn aus OSM und AV. Um den Übergang
            stehen danach die genaueren Strassennamen aus diesem Abruf (Ebene «Strassennamen (OSM)»). Gelbe gestrichelte Quadrate (Bern,
            Zürich, Basel): Fussgängerstreifen, die ein Modell der ETH Zürich im Luftbild erkannt hat und die in OSM fehlen; ein Klick prüft
            sie wie einen OSM-Übergang. Oft sind es Fehlalarme: am Luftbild prüfen.</li>
            <li><b>Zwei Reiter:</b> sobald gerechnet ist, teilt sich der rechte Bereich in «Sichtprüfung» und «Bedarf und Querungstyp».
            Die Sichtprüfung prüft einen bestehenden bzw. gezeichneten Streifen (Zufahrten, Sichtweiten, Hindernisse, Eingaben von
            Hand); oben steht in einer Zeile, was der Bedarf ergibt, ein Klick darauf wechselt den Reiter. «Bedarf und Querungstyp»
            klärt, ob ein Fussgängerstreifen hier überhaupt zulässig ist und welche Querung passt; die Reiter-Schaltfläche nennt den
            Stand mit Symbol und Wort (✓ zulässig, ! mit Begründung, ✗ nicht zulässig, ✗ kein Streifen in Begegnungszone bzw. bei
            verteiltem Queren, ? offen, – nicht beurteilt ausserorts). An einem bestehenden Übergang mit
            Fussgängerstreifen öffnet die App die Sichtprüfung (auch mit übernommenen und angepassten Streifen), bei einem neu
            gezeichneten Streifen bzw. einer Querung ohne Streifen den Bedarf; die Wahl gilt für den Fall, bis ein anderer Fall geladen wird. Die Reiter lassen sich auch mit den Pfeiltasten
            wechseln; Fragen, die zu einem Feld springen, öffnen den richtigen Reiter. Werkzeuge auf der Karte wirken in beiden Reitern,
            ihre Hinweise stehen dann über den Reitern; ein Klick auf eine Zufahrt bzw. ein Hindernis wechselt zur Sichtprüfung. Der Bericht enthält beides.</li>
            <li><b>Ergebnis lesen:</b> je Streifen die Zufahrten mit Tempo, Sichtweite und Status (frei bzw. verdeckt und wodurch). Zeile
            anklicken: Sichtfeld, Sichtpunkte und Hindernisse auf der Karte. Hinweise in Braun sind Annahmen («aus OSM, prüfen»,
            «Annahme» beim Tempo). Gerade Zufahrten eines Fussgängerstreifens zeigen zudem, ab welcher Distanz die Markierung im
            eigenen Fahrstreifen frei sichtbar ist («Streifen erkennbar ab …»; geprüft bis 110 m; Gebäude, Hecken, Mauern, Bäume und
            Auto-Parkfelder verdecken; endet die Fahrlinie vorher, «erkennbar auf mindestens …»). Das ist eine Annahme ohne Gelände und nur
            für die Markierung, nicht für die blaue Tafel (Signal 4.11); im Bedarf belegt der kleinste Wert die Erkennungsdistanz vor. Zufahrten heissen nach der Strasse und der Herkunft der Fahrzeuge als Himmelsrichtung (z. B.
            «Glockenstrasse von Süden»), Abbieger nach der Strasse, aus der sie abbiegen; die
            Fahrtrichtung in Grad zeigt der Tooltip. Dazu tragen sie eine Nummer, auf der Karte als Schild hinter dem letzten
            Sichtpunkt, im Panel und im Bericht vor dem Namen: je Streifen im Uhrzeigersinn ab Norden nach der Herkunft, gerade und
            abbiegende gemeinsam. Von Hand gestrichene Zufahrten behalten ihre Nummer (unter «Hier nicht geprüfte Richtungen», ohne
            Schild), so bleiben die übrigen Nummern gleich; aus den Daten entfallene Richtungen haben keine Nummer. Klick aufs Schild
            wählt die Zufahrt, nochmals Klick hebt die Auswahl auf. Streifen von Hand heissen «Streifen 1», «Streifen 2» … oder wie in der Liste benannt.</li>
            <li><b>Eingaben korrigieren:</b> unter «Eingaben von Hand» Parkfelder, Bäume, Hecken, Mauern und übrige Hindernisse auf dem
            Luftbild zeichnen, ebenso eine Insel, die den Streifen teilt (ersetzt eine nach OSM und Luftbild angenommene Insel, grün gestrichelt); je
            Zufahrt Tempo, Fahrlinie oder «gibt es nicht»; je Streifen Lichtsignal, «kein FGS» (nicht prüfen) bzw. die Querung
            (Fussgängerstreifen, ohne Vortritt oder Trottoirüberfahrt). Vorschläge aus OSM (gestrichelt) zählen erst nach
            «bestätigen»; in Bern lädt die App die amtlichen Parkfelder der Stadt, sie zählen sofort. Die Rechnung läuft nach jeder
            Änderung neu.</li>
            <li><b>Gruppe «Planen»:</b> über den Reitern, in beiden sichtbar, sobald ein Ort geladen ist: «Streifen planen»,
            «Trottoirüberfahrt», «Mittelinsel (Standard)», «Vorgezogener Seitenraum», «Fläche (Plan)», «Ecke runden», «Fixpunkt» und «Messen»; darunter die Hilfe zum
            gewählten Werkzeug und aufklappbar «Geplante Elemente» (Streifen von Hand, Fixpunkte, Flächen (Plan)). Esc beendet ein
            Werkzeug. «Eingaben von Hand» im Reiter «Sichtprüfung» bleibt für den Bestand.</li>
            <li><b>Streifen planen:</b> «Streifen planen» (in der Gruppe «Planen», ohne geladenen Ort neben «Fall laden») wählen, die Breite (Balkenlänge) einstellen und auf der
            Karte die beiden Wartebereiche gegenüber anklicken – auch dort, wo OSM keinen Übergang kennt. Ohne geladenen Ort zeigt die App
            dabei ab Zoom 17 schon die Amtliche Vermessung um die Kartenmitte (nur Anzeige; die Enden fangen auf ihre Punkte). Die App prüft den Streifen
            als Fussgängerstreifen (Zufahrten, Tempo, Sichtweiten, Hindernisse). Zum laufenden Fall kommt er, wenn er ganz innert
            {' '}{NACHLADEN_M} m um den geladenen Ort liegt oder alle Streifen von Hand zusammen ganz innert {NACHLADEN_M} m um einen
            Ort liegen (die App lädt dann um ihre Mitte nach); sonst bzw. ohne geladenen Ort beginnt am Streifen ein neuer Fall, und
            die App lädt AV, OSM und Kataster um ihn. Unter «Streifen von Hand» Enden verschieben und Breite ändern; «Lage und Masse»
            nennt die LV95-Koordinaten von Achse und Ecken, Länge, Winkel zur Fahrbahn, Abstand der Enden zum Fahrbahnrand und zum
            nächsten Knoten («Koordinaten kopieren» für CAD bzw. Tabelle; im Bericht als Tabelle). Den Annäherungsbereich an jedem Ende
            (Wartefläche, auf die die Sicht geprüft wird) lässt sich unabhängig von der Streifenbreite anpassen: beim Bearbeiten des
            Streifens die Mitte entlang der Bordkante ziehen bzw. eine Seite breiter oder schmaler; «Lage und Masse» nennt Versatz und
            Breite je Ende, «zurücksetzen» stellt den gerechneten Bereich wieder her. An einer OSM-Querung ohne
            Fussgängerstreifen: «Querung als geplanten Streifen übernehmen und anpassen»; dort prüft die App jeden Streifen von Hand
            als Fussgängerstreifen, auch wenn er nur die Lage korrigiert («sinngemäss, ohne Normbezug» gilt nur für den Streifen aus
            OSM + AV). Einen Fall ohne OSM-Übergang merkt sich der Browser nur als letzten solchen Fall («Letzten geplanten Fall
            wiederherstellen»; ein anderer Fall ohne Übergang ersetzt ihn erst nach Rückfrage): mit «Fall speichern» sichern.</li>
            <li><b>Trottoirränder planen:</b> Werkzeug «Fläche (Plan)» mit der Art Trottoir, Fahrbahn bzw. Insel wählen und die
            geplante Fläche zeichnen (Trottoirnase, Fahrbahnverengung, verschobener Randstein, neue Insel): Ecken anklicken, die App
            fängt sie auf Stützpunkte der AV bzw. anderer Plan-Flächen; Doppelklick schliesst. In der Rechnung ersetzt die Fläche die
            AV-Bodenbedeckung darunter (Gebäude bleiben); Bordkanten, Wartebereiche, Inseln, Fahrlinie und Vermassung richten sich
            danach. Überlappen sich Plan-Flächen, gilt die zuletzt gezeichnete. Auf der Karte erscheinen sie schraffiert über der AV,
            unter «Flächen (Plan)» mit Art und Fläche (Art änderbar, Ecken verschieben, löschen), im Bericht im Kartenbild und unter
            «Eingaben von Hand». Das Werkzeug «Insel» bleibt für eine Insel, die in der AV fehlt (die AV-Fahrbahn bleibt darunter);
            liegt eine Insel von Hand in einer Plan-Fläche der Art Insel, zählt nur die Plan-Fläche. <b>Ecke runden:</b> unter
            «Flächen (Plan)» bei der Fläche «Ecke runden» wählen (bzw. «Ecke runden» in der Gruppe «Planen», Fläche in der Hilfe), den Radius eingeben (Vorgabe {RUNDEN_R_VORGABE} m,
            {' '}{RUNDEN_R_BEREICH[0]} bis {RUNDEN_R_BEREICH[1]} m) und auf der Karte eine Ecke der Fläche anklicken: die App ersetzt sie
            durch einen Kreisbogen mit diesem Radius, tangential an beide Kanten (konvexe Ecken abgeschnitten, einspringende ausgefüllt).
            Passt der Bogen nicht auf die Kanten, bleibt die Fläche unverändert: die Meldung steht beim Radiusfeld, mit dem grössten
            möglichen Radius, der begrenzenden Nachbarecke und dem Knopf «mit höchstens … m runden» (ebenso als Fenster an der Ecke auf
            der Karte). Als Ecken bietet die App nur echte Ecken an (ab 15° Knick); Punkte eines Bogens erscheinen als kleine Punkte.
            Auf der Karte zeigt der Tooltip jeder Ecke den grössten möglichen
            Radius; Ecken, an denen der eingestellte Radius nicht passt, sind grau gestrichelt. Radius ändern (Feld bzw. Schieber) passt
            die zuletzt gerundete Ecke an, solange die Fläche seither nicht anders geändert wurde.
            Zurück: «Rundung zurücknehmen» (die letzte Rundung) bzw. die Ecken mit «bearbeiten» verschieben. Von Hand gezeichnete Bögen
            mit wenigen Punkten liest die App nur ungenau; für einen geplanten Radius ist «Ecke runden» der vorgesehene Weg. Teilt eine
            Ecke ihre Lage mit einer Nachbarfläche (Plan), bleibt sie dort scharf, wo die später gezeichnete Fläche darüber liegt (die
            spätere gilt): dann die Ecke der späteren Fläche runden bzw. beide passend zeichnen. Gespeichert wird nur die
            Form; der Eckradius der Abbieger liest den Bogen aus der Fläche. Liest er an einer Ecke nach Plan-Fläche einen Bogen über
            {' '}{String(ECK_GROSS_M).replace('.', ',')} m (Ecke fast gerade bzw. als Abschrägung gezeichnet), gilt die Ecke als
            unplausibel: der Abbiegeradius wird geschätzt, für alle Zufahrten an dieser Ecke gleich, mit dem Hinweis, den geplanten
            Radius mit «Ecke runden» festzulegen. Ecken der AV über {String(ECK_GROSS_M).replace('.', ',')} m rechnet die App wie
            bisher mit dem Hinweis «AV-Ecke prüfen». <b>Mittelinsel (Standard):</b> Werkzeug «Mittelinsel (Standard)» fügt eine
            Schutzinsel mit Rollstuhlfurt nach {V('Masterplan Fussverkehr Stadt Bern')}, Standards, E1 ein: Inseltiefe quer zur Fahrbahn
            {' '}{f2(E1_TIEFE_M)} m (kleiner mit Hinweis, unter {f2(INSEL_TIEFE_MIN_M)} m keine Insel), Streifenbreite wie der gewählte Streifen bzw. {f2(E1_BREITE_M)} m, darin
            {' '}{f2(E1_FURT_M)} m Rollstuhlfurt auf Fahrbahnniveau und daneben die erhöhte Wartefläche, vor und nach dem Streifen je ein
            halbrunder Kopf (Kopflänge = halbe Tiefe, änderbar), auf der Seite der Furt mit Signalmast (Punkt, nur Hinweis). Streifen
            wählen bzw. auf einen Streifen klicken: die Mitte liegt auf der Streifenachse in der Fahrbahnmitte, ausgerichtet nach den
            Balken; ein weiterer Klick auf der Achse verschiebt die Insel, «Furt-Seite wechseln» spiegelt sie. Ohne Streifen setzt der
            Klick die Mitte (Ausrichtung nach dem nächsten OSM-Weg). Eingefügt werden zwei Flächen (Plan) der Art Insel (Kopf mit Mast;
            erhöhte Fläche mit Gegenkopf); die Furt bleibt Fahrbahn (liegt dort heute eine Insel, kommt sie als Fläche (Plan) Fahrbahn
            dazu). Liste, Karte und Bericht kennzeichnen die Teile mit den Massen. Die Rechnung teilt einen Streifen an der Insel, wo
            seine Achse die erhöhte Fläche quert; die Furt daneben gilt als Teil der Querung (keine Bordkante, kein eigener
            Wartebereich). Einen Streifen von Hand teilt die Rechnung nicht selbst: das Werkzeug teilt ihn auf Wunsch (Vorgabe) gleich
            in zwei Teilstreifen, Enden {f2(TEIL_ABSTAND_M)} m vor den Inselkanten; Eingaben je Zufahrt gehen an den Teil, an dem ihr
            erster Sichtpunkt liegt. «Teilung zurücknehmen» beim Streifen (bzw. «Mittelinsel löschen und Teilung zurücknehmen»)
            stellt den ungeteilten Streifen samt seinen Eingaben wieder her, solange die Teilstreifen seither nicht geändert wurden.
            {' '}<b>Mittelinsel ziehen:</b> eine eingefügte Mittelinsel in der Standardform hat in der Mitte einen Griff (Kreis mit
            Vierfachpfeil; ausserhalb der Werkzeuge, mit Maus bzw. Finger). Er erscheint, sobald die Maus über der Insel ist bzw. die Insel angetippt und damit gewählt ist. Ziehen verschiebt sie entlang der Streifenachse; frei (Ausrichtung
            bleibt) mit dem Schalter «frei verschieben» unter «Flächen (Plan)» bei der Mittelinsel (auch auf Touch) oder der Umschalttaste
            während des Ziehens (erst nach dem Anfassen drücken: mit gedrückter Taste beginnt kein Ziehen). Beim Ziehen zeigt eine
            Vorschau die neue Lage mit Lagehinweisen (ragt ins Trottoir, zu wenig Fahrbahn daneben, Achse quert die Furt, ein Streifen
            von Hand reicht in die Insel). Beim Loslassen bildet die App die Teile an der neuen Mitte neu und führt die
            an der Insel geteilten Teilstreifen nach ({f2(TEIL_ABSTAND_M)} m vor den Inselkanten, Eingaben bleiben); danach wird neu
            gerechnet. «Verschiebung zurücknehmen» unter «Flächen (Plan)» stellt die letzte Verschiebung zurück, solange seither nichts
            anderes geändert wurde. Eine von Hand veränderte Insel hat keinen Griff.</li>
            <li><b>Vorgezogener Seitenraum:</b> Werkzeug «Vorgezogener Seitenraum» und nahe einem Streifenende klicken: die App fügt dort
            eine Fläche (Plan) Trottoir von der Bordkante bis 0,20 m über die Parklinie ein ({V('VSS 40 240')} Z. 13.4: idealerweise
            mindestens; Tiefe aus der Längsparkierung, sonst 2,00 m angenommen; je Seite bis zum ersten Parkfeld, höchstens 5,00 m),
            Auto-Parkierung darunter entfällt in der Rechnung; Masse unter «Flächen (Plan)» änderbar, am Griff entlang der Bordkante ziehbar.</li>
            <li><b>Vermassung ab Fixpunkt:</b> Werkzeug «Fixpunkt» (in der Gruppe «Planen» bzw. «Fixpunkt setzen» in «Lage und
            Masse») und auf der Karte eine Gebäudeecke bzw. einen Punkt der AV anklicken: die App fängt den nächsten Stützpunkt der
            AV-Bodenbedeckung im Umkreis von {FANG_PX} Bildschirmpunkten (höchstens {FANG_MAX_M} m), sonst bleibt es ein freier Punkt.
            Vorgeschlagen wird je Strassenseite die nächste Gebäudeecke bis {VORSCHLAG_M} m vom Streifen (blasses Quadrat auf der Karte: Klick darauf bzw. «übernehmen» in «Lage und Masse»). Gemessen wird
            rechtwinklig: längs entlang der Balken (bei geraden Streifen der Fahrbahn) vom Fixpunkt bis zur näheren Streifenkante und bis
            zur Achse, zum näheren Achsenende längs und quer, dazu die Luftlinie zur nächsten Ecke; bei einem schiefen Streifen trifft
            das Längsmass die schiefe Kante auf der Höhe des Fixpunkts. Fixpunkte lassen sich benennen, verschieben (fangen wieder) und
            löschen, stehen in der Fall-Datei und im Bericht und ändern die Sichtprüfung nicht. Punkte der AV sind keine vermarkten
            Grenzpunkte: ihre Lage hat die Genauigkeit der AV-Bodenbedeckung.</li>
            <li><b>Messen:</b> zwei Punkte auf der Karte anklicken; jeder Klick fängt wie der Fixpunkt einen Vermessungspunkt der AV, sonst
            gilt der freie Punkt. Die Strecke steht mit zwei Nachkommastellen auf der Karte; «übernehmen» schreibt sie, auf 0,05 m gerundet,
            in das zuletzt angeklickte Zahlenfeld. Frei gemessen am Luftbild etwa 10 cm genau je Bildpunkt; nichts davon kommt in den Fall.</li>
            <li><b>Bedarf und Querungstyp:</b> der gleichnamige Reiter beurteilt, ob ein Fussgängerstreifen zulässig
            ist, welcher Querungstyp passt (Fussgängerstreifen, mit Schutzinsel, mit Lichtsignal, Querung ohne Vortritt, Trottoirüberfahrt)
            und welche Elemente und Masse nötig sind. Grundlage sind {V('VSS 40 241')}, {V('VSS 40 240')}, {V('VSS 40 242')}, {V('VSS 40 837')}, {V('SN 640 075')} und weitere (nur
            Ziffern und eigene Kurztexte). Die Eingaben stehen nach Blöcken (Rahmen, Nachfrage, Verkehr, Lage, Insel, Ausrüstung,
            LSA-Zeiten, Trottoirüberfahrt): vorbelegt ist, was die Rechnung schon kennt (Querungsart der Streifen, Lichtsignal, Tempo,
            innerorts als Annahme bis 50 km/h, Fahrbahnbreite und Querdistanzen nach den Bordkanten, Fahrstreifen nach OSM, Insel aus der
            Teilung bzw. der Mittelinsel (Standard), Radstreifen, Tram nach OSM), mit Quelle. Aus Geodaten kommen dazu die Bushaltestelle
            («keine», wenn im Umkreis von 50 m um den Streifen keine liegt; sonst ein Hinweis mit Name und Abstand), Strecke oder Zone
            (nur mit Zonenangabe in OSM), in der Stadt Bern der DTV aus den Verkehrsdaten des Geoportals (Strassen ohne Eintrag:
            500 als Annahme) und ein Hinweis zur Beleuchtung nach OSM (das Feld bleibt offen); jede Angabe nennt ihre Herkunft (Geoportal
            Stadt Bern bzw. OSM). In der Stadt Bern lädt die App dafür zusätzlich den Richtplan Fussverkehr, die Strassenhierarchie und
            Strassentypen, die signalisierte Höchstgeschwindigkeit, Volksschulen und Kindergärten, die taktil-visuellen Markierungen, den
            Nutzungszonenplan und die ÖV-Linien aus dem Geoportal, überall aus OSM Schulen, Heime und Vortrittszeichen in der Nähe. Daraus
            belegt sie Tempo, Strecke oder Zone (Tempo 30 ohne Zonenangabe nach der Strassenhierarchie, als Annahme), Strassentyp,
            besonderen Grund für Vortritt, Fusswegnetz, ertastbare Markierungen, Gewerbe und bebautes Gebiet, Linienbus, Tramhalt und an
            einer Kreuzung die Vortrittsrolle vor; was die Daten nicht klären, bleibt offen. Die Ebene «Richtplan Fussverkehr (Geoportal
            Bern)» (in der Stadt Bern, anfangs aus, ab Zoomstufe 15) zeigt das Basisnetz und die publikumsattraktiven Bereiche in Magenta;
            die Maus über einer Linie bzw. Fläche nennt, was es ist. Die Basisnetz-Linie, aus der die App das Fusswegnetz vorbelegt, ist
            dort kräftiger gezeichnet. Bleibt eine Regel dank einer solchen Angabe ohne Befund, nennt die Zeile im Thema den Grund (z. B. «Wenig
            Querende: ohne Befund – Querung im Fusswegnetz (Geoportal Stadt Bern)»). Ein Verbot (Tempo-30-Zone ohne besonderen
            Grund, Begegnungszone), das nur auf Annahmen beruht, bleibt offen, bis die Annahme mit «Vorschlag bestätigen» übernommen oder
            von Hand geändert ist. Ausnahme Tempo 20: ist genau 20 km/h signalisiert (Geoportal bzw. OSM) und widerspricht keine
            Zonenangabe, schlägt die App die Begegnungszone vor (Herkunft «Vorschlag»); der Vorschlag gilt für die Beurteilung wie eine
            Tatsache, weil Tempo 20 auf einer Strecke selten ist, und lässt sich unter «Strecke oder Zone» auf Strecke ändern. Nennt OSM
            eine Begegnungszone, das Geoportal aber Tempo 30 oder mehr, bleibt die Frage offen. Eine Eingabe von Hand überschreibt den Wert
            («zurück» stellt die Vorbelegung wieder her), wählbar als von Hand, Schätzung oder Annahme. Fussgänger lassen sich als
            Schätzklasse (unter 100, 100 bis 500, über 500 in den 5 Spitzenstunden) angeben; eine Zählung geht vor. Leere Felder sind
            «offen» und zählen nie als erfüllt. Die erweiterte Prüfung steht nach Thema: je Thema ein Aufklapper mit den Befunden, den offenen
            Angaben als Fragen mit Eingabe (je Angabe einmal, dahinter klein, wofür sie fehlt) und zugeklappt allen übrigen Angaben des
            Themas; Themen mit nicht erfülltem Muss bzw. Soll sind offen. Am Ende stehen die Masse Soll/Ist sowie Annahmen und Hinweise. Die Ebenen Bern
            (Masterplan, Handbuch LSA) und Kanton BE (Arbeitshilfe) lassen sich schalten; vorgegeben sind sie nach der Gemeinde bzw. dem
            Kanton der AV am Streifen. <b>Quellen und Begriffe:</b> die Abschnitte «Grundlagen und Quellen» und «Begriffe» unten im
            Panel nennen alle Werke, auf die sich die Prüfungen stützen (voller Titel, was sie sind, wie verbindlich, wie viele Prüfungen
            sie nennen, Link zum Herausgeber), und die Fachbegriffe in Alltagssprache; in den Details eines Eintrags führt der Name des
            Werks dorthin, Begriffe lassen sich mit «?» erklären. Im Bericht stehen nur die Werke und
            Begriffe des Falls. <b>Offene Felder:</b> klein darunter steht, wofür die Angabe fehlt («fehlt für 2 Muss-Prüfungen», «fehlt für
            1 Soll-Prüfung») bzw. «entscheidet über die Zulässigkeit». <b>Zusammenfassung:</b> zuoberst steht je Querung ein Absatz in drei Sätzen: ob ein
            Fussgängerstreifen zulässig ist und welche Querung empfohlen wird, das Wichtigste aus Grundprüfung und Befunden (Muss vor Soll,
            höchstens zwei genannt) und welche Angaben noch fehlen. Die Sätze folgen festen Vorlagen aus den Befunden, ohne eigene
            Wertung; die Fragen darin springen wie überall zum Feld. <b>Ablauf:</b> Vorbelegt ist, was die Rechnung kennt; alles Übrige von Hand
            eingeben. Offene Angaben erscheinen als Frage («Ist die Querung nachts beleuchtet?»); ein Klick auf die Frage springt zum
            Feld und öffnet dazu die Aufklapper. Findet die App einen Anhaltspunkt ohne Wert (z. B. eine Strassenlampe in OSM), steht er beim offenen Feld. Der Knopf «?» bei jedem Feld erklärt es (was gemeint ist, welche Prüfungen es braucht,
            was leer bedeutet). <b>Eine Zeile je Punkt bzw. Eintrag:</b> Symbol, Kurztitel, Verbindlichkeit und ein Satz mit Ist und
            Soll; Regelnummer, Fundstelle und Normhinweis stehen hinter «Details» (im Bericht klein darunter). <b>Themen:</b> jede Regel
            gehört zu genau einem Thema in Alltagssprache ({THEMEN.map(t => t.name).join(', ')}); die Punkte der Grundprüfung führen die
            Namen der bfu, ihr Thema steht klein daneben. Im Thema stehen zuerst die Muss-Regeln, dann was nur mit Bericht abweichen
            darf, die Soll-Regeln und die Hinweise, danach die offenen Angaben als Fragen. <b>Verbindlichkeit in Worten</b> nach dem Wortlaut der Quelle und
            der Ebene: «Muss (Norm)», «Muss (Norm), Abweichung nur mit verkehrstechnischem Bericht», «Soll (Norm), Abweichung
            begründen», «Hinweis (Richtlinie)»; Ebenen Recht, Norm, Standard Stadt Bern, Arbeitshilfe Kanton Bern, Richtlinie, bei
            Projektentscheiden «Projektentscheid fgsCheck». Ein Symbol (✗, !, i, ?) steht davor, die Farbe ist nur Zusatz. <b>Zählung:</b>
            im Kopf der erweiterten Prüfung «… Regeln · … Befunde · … Hinweise · … Angaben offen», je Regel einmal; im Kopf jedes Themas mit
            Symbol und Wort («1 Muss-Befund»). Die ohne Befund geprüften Regeln zählt das Thema, aufklappbar mit Verweis in die Regelübersicht;
            braucht eine Regel eine Angabe, die anderswo gefragt ist, steht im Thema «siehe …» mit der Regel. Geprüft heisst: die Regel greift im Fall; ohne Befund: geprüft und nicht verletzt (nicht bei der
            zweiten Stufe einer Regel, deren erste Stufe verletzt oder offen ist, z. B. Regelbreite nach Mindestbreite); Befunde: Muss
            bzw. Soll nicht erfüllt; offen: so viele Angaben fehlen. Nicht gezählt werden Verzweigungen des Ablaufs (z. B. «Querung ausserorts»).
            «Nicht geprüft» heisst, die Regel könnte gelten, aber eine Angabe fehlt oder der Ablauf endet vorher (z. B. «Ortslage
            fehlt», «Baum endet: Begegnungszone», «Querungstyp fehlt», Ebene ausgeschaltet); «nicht anwendbar», sie gilt im Fall nicht.
            Eine frei geprüfte Sicht zählt nur als ohne Befund, wenn das Soll nach dem richtigen Tempo gerechnet ist (bei Anzeichen für
            schnelleres Fahren nach der gemessenen V85). Fehlen alle Angaben zur Trottoirüberfahrt bzw. die LSA-Zeiten, steht das als Zeile im Thema; übrige nicht geprüfte Regeln und von Hand gestrichene Zufahrten stehen unter «Annahmen und
            Hinweise». Die Sicht übernimmt die erweiterte Prüfung aus dem Sichtrechner (frei bzw. verdeckt je Zufahrt), ausser eine vorhandene
            Sichtweite ist von Hand eingegeben. <b>Querung ohne Vortritt:</b> je Streifen unter «Querung» Furt (Insel ohne Balken) bzw.
            Nase, Einengung oder ohne bauliche Massnahme wählen: der Streifen erscheint ohne Balken (weiss gestrichelt), geprüft wird mit
            der Sichtweite nach {V('VSS 40 240')}, Ziffer 8.2, max(v · L / 1,2 m/s; Anhaltesichtweite {Object.entries(AHS_40240).map(([t, sw]) =>
            `${t} km/h ${sw} m`).join(', ')}) je Teilquerung, v = Tempo der Zufahrt, L = Querdistanz Bord bis Bord bzw. bis zur Insel; ist
            die Insel im Bedarf als «nur markiert» angegeben, gilt die ganze Fahrbahn. Sichtfeld und Hindernisse wie beim
            Fussgängerstreifen, ohne die Kurvenregeln; geprüft wird höchstens bis {REICHWEITE_SICHT_M} m ab dem Streifen (so weit reichen
            die geladenen Daten): ein höheres Soll erscheint mit «geprüft bis {REICHWEITE_SICHT_M} m, darüber nicht geprüft» und gilt in der
            erweiterten Prüfung als offen. Ist die Sicht verdeckt, entscheidet die freie Länge bis zum ersten Hindernis: unter
            der Anhaltesichtweite rot (Muss), darüber gelb (Soll) bzw. bei wenig Querenden und wenig Verkehr die Ausnahme nach {V('VSS 40 240')}, Ziffer 8.2.
            <b>Begegnungszone:</b> liegt eine unmarkierte OSM-Querung ohne Wahl unter «Querung» in einer Begegnungszone (gleich bestimmt wie
            «Strecke oder Zone» im Bedarf, dortige Wahl von Hand gilt auch hier), hat der Fussverkehr Vortritt: sie heisst «Querung in der
            Begegnungszone», die nötige Sicht je Zufahrt ist die Anhaltesichtweite nach dem Tempo, ohne Kurvenregeln; der Bedarf endet mit
            der Begegnungszone. An einem Streifen mit Lichtsignal
            gilt die Sichtweite nach {V('VSS 40 241')} nicht; die erweiterte Prüfung nennt den Sichtrechner dort nur als Hinweis. Ein Querungstyp
            von Hand, der der Querungsart der Streifen widerspricht, gilt nicht (Hinweis in der erweiterten Prüfung). «kein FGS» bleibt davon getrennt: der Streifen wird dann gar nicht geprüft.
            Ein Fall mit Eingaben zum Bedarf bzw. mit einer Querung ohne Vortritt hat die Version 3; ältere Fassungen der App lehnen ihn
            ab. Die Mittelinsel (Standard) prüft die Durchfahrt daneben nach den Bändern der {V('Arbeitshilfe Fussgängerstreifen Kanton Bern')} (unter {f2(F3.min)} m zu
            schmal, zwischen {f2(F3.schmalMax)} und {f2(F3.breitMin)} m Überholkonflikt Lastwagen–Velo, mit Radstreifen nach dem
            {V('Masterplan Veloinfrastruktur Stadt Bern')} {f2(F3B.min)} bis {f2(F3B.max)} m).</li>
            <li><b>Trottoirüberfahrt planen:</b>
              <ol>
                <li>Werkzeug «Trottoirüberfahrt» (Planen) und beide Enden über die einmündende Strasse anklicken – oder einen Streifen
                  zeichnen und unter «Querung» «{TUE_OPTION}» wählen: grau gestrichelt in Trottoirfarbe, ohne Sicht auf die
                  Wartefläche; im Bedarf ist der Querungstyp damit gesetzt.</li>
                <li>Im Reiter «Bedarf und Querungstyp» die Fragen im Thema Trottoirüberfahrt beantworten (Reihenfolge der Prüfliste der
                  Norm). «Alternative Fussgängerstreifen prüfen» zeigt zusätzlich die Fragen zu einem Fussgängerstreifen an dieser Stelle; ohne
                  den Knopf prüft die App ihn nur grob für die Empfehlung.</li>
                <li>Die Knotensicht der Einbiegenden rechnet die App selbst (Kern des SichtweitenCheck): je Richtung zwei Phasen
                  (vom hinteren Rand der Überfahrt aufs Trottoir, vom vorderen Rand zur Fahrbahn); sie beantwortet
                  «{feldName('q3.knotensichtOk')}», wenn beide Phasen ein klares Ergebnis haben. Auf der Karte stehen das wartende
                  Fahrzeug je Phase und die Fahrzeuge am Ende der nötigen Sichtweite; am Fussgängerstreifen je Zufahrt ein Fahrzeug am letzten
                  Sichtpunkt und eine wartende Person je Streifenende (nur Darstellung). Die beiden wartenden Fahrzeuge (grau: Sicht auf die
                  Fahrbahn, ocker: Sicht aufs Trottoir) lassen sich am Auge ziehen, etwa nach der Markierung in der Seitenstrasse; «Standort
                  zurücksetzen» im Block Knotensicht gilt wieder die Rechnung. Dort lässt sich auch das geplante Tempo der Hauptstrasse wählen.</li>
              </ol></li>
            <li><b>Grundprüfung (Big Five, bfu):</b> oben im Reiter «Bedarf und Querungstyp» prüft ein Kasten die fünf Punkte der
            {V('bfu-Fachdokumentation «Fussgängerstreifen»')} und das Tempo als Vorbedingung, mit eigenen Regeln nach den Werten der bfu: Tempo
            (signalisiert und V85 höchstens {B5.vMax} km/h; ohne V85 offen), ① Sicht nach V85 ({B5S.v30}/{B5S.v40}/{B5S.v50}/{B5S.v60} m bei
            30/40/50/60 km/h, im Knoten nach Kurvenradius bis 20 m {B5S.r5}/{B5S.r10}/{B5S.r15}/{B5S.r20} m) und Erkennungsdistanz, ② Schutzinsel
            (über 8,50 m Fahrbahn empfohlen, Tiefe mindestens 1,50 m, besser 2,00 m, Durchfahrt 3,50 m, gemessen 3,45 bis 3,75 m, oder ab 4,50 m), ③ höchstens ein
            Fahrstreifen je Richtung ohne Insel, ④ Beleuchtung, ⑤ mindestens 100 Querende in den 5 Spitzenstunden. Jeder Punkt ist
            in einer Zeile erfüllt (✓), nicht erfüllt (✗ Muss, ! Soll), offen (?) oder ein Hinweis (i), mit einem Satz bzw. der offenen Frage; die Muss-Regel des Punkts bestimmt den Zustand (ist sie erfüllt und eine Soll-Regel nicht, die
            Soll-Regel), in der Zeile steht der Satz dieser Teilregel, übrige offene Teilregeln, Annahmen und Hinweise nur gezählt in Klammern.
            Der Knopf ▸ am Zeilenende zeigt die Details dieses Punkts: Teilregeln mit Nummer, Ist und Soll, Fundstelle, Normhinweis, feste
            Hinweise und Annahmen; im Bericht stehen sie unter der Zeile. Die
            Grundprüfung gilt nur für Fussgängerstreifen ohne Lichtsignal und läuft unabhängig von den Ebenen; wo die Norm anders
            wertet, steht ein Normhinweis. Darunter ihre Eingaben; alle übrigen Prüfungen und Eingaben stehen
            aufklappbar unter «Erweiterte Prüfung». Im Bericht steht die Grundprüfung vor der erweiterten Prüfung. Unter den ergänzenden
            bfu-Aspekten (Zeile «Ergänzend (bfu)», nicht unter den fünf Punkten) prüft sie auch die Fahrbahnhaltestelle (Schutzinsel, Durchfahrt rund 3,50 m). Ist ein Soll unsicher (Stufe 60 km/h
            ohne Angabe innerorts, Kurvenradius von Hand ohne Zuordnung zur Zufahrt), gilt ein Bereich: verletzt nur darunter, erfüllt nur
            darüber, sonst offen.</li>
            <li><b>Feldhilfen:</b> der Knopf «?» bei jedem Eingabefeld klappt darunter eine Erklärung auf: was gemeint ist (in eigenen
            Worten, wo nötig mit Beispiel), wozu das Feld dient (die Prüfungen, die es im Fall braucht, mit Ergebnis und Quelle, direkt aus dem
            Regelkatalog; Grundprüfung zuerst, dann nach Stärke, höchstens fünf, der Rest unter «weitere anzeigen»; Felder wie der
            Querungstyp, die nur bestimmen, welche Prüfungen gelten, nennen das als Ablauf) und was ein leeres Feld bedeutet (keine Pflicht, die betroffenen Prüfungen bleiben offen; bei vorbelegten
            Feldern steht, woher der Vorschlag kommt). Felder, die im Fall nicht wirken können, sind ausgeblendet (z. B. Angaben zur
            Insel ohne Insel, LSA-Zeiten ohne Lichtsignal, Trottoirüberfahrt nur an einer Einmündung); ihre Werte bleiben im Fall,
            «trotzdem zeigen» unter der jeweiligen Eingabemaske blendet sie wieder ein. Beim Tempo-Regime gilt eine Hauptstrasse ausserhalb der Zone als Strecke, auch
            mit Tempo 30; ältere Fälle mit dem früheren Zusatzfeld dazu laden weiter. Im Bericht stehen keine Feldhilfen.</li>
            <li><b>Bericht und Fall-Datei:</b> «Bericht drucken / als PDF» öffnet eine Druckansicht (Kartenbild, Tabellen, Eingaben,
            Quellen). «Fall speichern» sichert alle Eingaben als JSON-Datei, «Fall laden» stellt sie wieder her.</li>
        </ul>
      </details>
      <details className="hilfe-teil">
        <summary>Quellen je Ort</summary>
        <p>Welche Daten es an einem Ort gibt, steht in einem Quellenregister: je Quelle Gebiet (ganze Schweiz, Kantone, Gemeinden oder
          Rechteck), Dienst, Anbieter, Stand und Lizenz. Daraus zeigt der Reiter «Bedarf und Querungstyp» die «Datenlage hier» und
          «Geladene Quellen» die Tabelle je Thema; was fehlt, geben Sie von Hand ein. Eine weitere Stadt kommt dazu mit ihren Einträgen
          im Register, der Zuordnung der Felder ihres Diensts und einer Probe an einem bekannten Ort. Im Browser gehen nur Dienste, die den
          Zugriff von anderen Seiten erlauben (CORS).</p>
      </details>
      <details className="hilfe-teil">
        <summary>Grenzen der App</summary>
        <ul>
          <li>Amtliche Vermessung frei über geodienste.ch: 19 Kantone ganz, Wallis teilweise (z. B. ohne Sitten und Brig) und
            Liechtenstein. LU, VD, NE, NW, OW und JU geben sie nur mit Freigabe ab: dort rechnet die App nicht.</li>
            <li>Streifen aus dem Luftbild (ETH-Modell): fester Stand je Stadt, nur Bern, Zürich und Basel, nur an Strassen für
            Fahrzeuge und nur von beiden Modellen der ETH bzw. in beiden Berner Flügen gefunden; Kandidaten mit einem OSM-Übergang in
            15 m blendet die App aus. Findet die eigene Erkennung dort keine Balken,
            steht «im Luftbild kein Streifen bestätigt».</li>
            <li>Streifen im Luftbild: nur gelbe Streifen, Balken bis rund 6 m; weisse Streifen erkennt die App nicht. Mehrere Streifen
            an einem Knoten und sehr breite Streifen bildet sie nicht immer richtig: dann mit «Streifen planen» von Hand zeichnen.</li>
            <li>Parkfelder amtlich nur in der Stadt Bern; sonst von Hand zeichnen bzw. Vorschläge aus OSM bestätigen. Private
            Parkplätze, Hecken und Mauern fehlen in den Daten; ob sie die Sicht verdecken (Höhe), vor Ort prüfen.</li>
            <li>Geplante Streifen: Randsteine, Trottoirs und Fahrbahn bleiben der Bestand der AV, ausser Flächen (Plan) ersetzen sie
            (vorgezogenes Trottoir, neue Insel); Fixpunkte fangen weiter nur auf den Bestand. Die Streifen-Suche im Luftbild läuft auf
            dem Bestand: mit Flächen (Plan) ist ein Streifen aus dem Luftbild nur Vorschlag (gestrichelt, «Luftbild-Streifen übernehmen
            und anpassen»), gerechnet wird mit OSM + AV nach Plan bzw. mit den Streifen von Hand. Einen Streifen von Hand über eine
            Plan-Insel als zwei Teilstreifen zeichnen. Eine Fall-Datei mit Flächen (Plan) hat die Version 2; ältere Fassungen der App
            lehnen sie ab, statt ohne die Plan-Flächen zu rechnen. Velos im Gegenverkehr einer
            Einbahn prüft die App nicht (die Einbahn nach OSM gilt für Motorfahrzeuge, die Gegenrichtung entfällt). Liegen Streifen von
            Hand so weit auseinander, dass sie nicht alle ganz innert {NACHLADEN_M} m um einen Ort liegen (mehr als rund
            {' '}{2 * NACHLADEN_M} m), rechnet die App um den zuletzt gezeichneten bzw. verschobenen Streifen und meldet die übrigen.</li>
            <li>Grundlage sind Daten mit eigenem Stand (Luftbild-Flugjahr, OSM, AV). Die App ersetzt keine Beurteilung vor Ort.</li>
        </ul>
      </details>
    </details>
  )
}

/** Grundlagen der Sichtrechnung (Panel «Grundlagen und Quellen»): Werke als Verweise wie im Lesetext, VRV mit Artikel-Link
 * (Nutzerbefund 23.10.2026) */
export function RechnungGrundlagen() {
  return <p className="klein">
    Sichtweiten: <VerweisText text={`${LESENAME['40241']}, Tabelle 1`} /> ({Object.entries(SICHTWEITE).map(([t, s]) => `${t} km/h: ${s} m`).join(', ')});
    im Knoten nach Kurvenradius (<VerweisText text={LESENAME.BFU} /><WerkLinks w="BFU" kurz /> bzw. <VerweisText text={`${LESENAME['40241']}, Tabelle 2`} />:
    {' '}{KURVE_SICHTWEITE.map(([r, s]) => `bis ${r} m: ${s} m`).join(', ')}). Sichtpunkte mindestens 1,5 m von Parkfeldern; Auto-Parkfeld
    näher als 5 m am Streifen: <VerweisText text={`${LESENAME.VRV}, Art. 18 Abs. 2 Bst. e`} />.
  </p>
}

/** Quellen der Prüfungen (Runde 4; seit 23.10.2026 im Panel-Abschnitt «Grundlagen und Quellen», nicht mehr in der Hilfe): je Werk
 * voller Titel, Link, Ausgabe, Ebene, Beschreibung und Zahl der Prüfungen, die es nennen; nur externe Werke mit mindestens einer Prüfung
 * (WERKE bleibt für den Katalog vollständig). Zeilen-Anker quelle-<Werk> für die Sprünge aus den Details. */
export function QuellenTabelle() {
  const n = regelnJeWerk()
  return (
    <div id="quellen-pruefungen">
      <p className="klein">Worauf sich die Prüfungen im Reiter «Bedarf und Querungstyp» stützen. Regeln: wie viele Regeln das Werk als
        Quelle nennen (ohne Verzweigungen des Ablaufs). Die Links ↗ führen zum Herausgeber (neues Fenster; «PDF» lädt das Dokument); Normen sind kostenpflichtig.</p>
      <div className="tabelle-rahmen"><table className="quellen-tabelle">
        <thead><tr><th>Werk</th><th>Ausgabe</th><th>Ebene</th><th>Beschreibung</th><th>Regeln</th></tr></thead>
        <tbody>{WERK_IDS.filter(w => w !== 'ENTSCHEID' && (n.get(w) ?? 0) > 0).map(w => <tr key={w} id={werkAnker(w)}>
          <td><b>{WERKE[w].name}</b><div>{werkVoll(w)}</div><div><WerkLinks w={w} /></div></td><td>{WERKE[w].ausgabe}</td><td>{WERK_INFO[w].ebene}</td>
          <td>{werkText(w)}</td><td className="zahl-zelle"><a href={`#${regelWerkAnker(w)}`} className="werk-link"
            title="diese Regeln in der Regelübersicht zeigen" onClick={e => { e.preventDefault(); regelnWerkZeigen(w) }}>{n.get(w) ?? 0}</a></td></tr>)}</tbody>
      </table></div>
    </div>
  )
}

/** Begriffe des Bedarfsmoduls (Runde 4; seit 23.10.2026 eigener Panel-Abschnitt «Begriffe»), alphabetisch, je eine eigene Erklärung */
export function BegriffeListe() {
  return <dl className="begriffe-liste">{begriffeAlphabetisch().map(b => <Fragment key={b.id}><dt id={`begriff-${b.id}`}>{b.name}</dt>
    <dd>{b.text}</dd></Fragment>)}</dl>
}

/** Aufklappbarer Datenschutz-Hinweis: was im Browser bleibt, welche Dienste was erhalten */
export function Datenschutz() {
  // je Dienst aus dem Quellenregister (daten/quellenregister.ts), damit die Liste den Quellen folgt
  const ds = datenschutzGruppen()
  return (
    <details className="hilfe">
      <summary>Datenschutz</summary>
      <ul>
        <li>Keine Anmeldung, kein eigener Server: gerechnet wird im Browser (Web Worker).</li>
        <li>Eingaben (Hindernisse, Tempo, Fahrlinien, Streifen, Bezeichnung) bleiben im Browser: je Übergang mit Eingaben ein Eintrag
          im lokalen Speicher (localStorage, Schlüssel «fgsCheck.fall.» und Nummer des Übergangs, mit den Koordinaten), sonst nur in
          der Fall-Datei, wenn Sie sie speichern. Übergänge ohne Eingaben werden nicht gespeichert. Fälle ohne Übergang (z. B. ein
          geplanter Streifen) teilen sich einen einzigen Eintrag «fgsCheck.fall.ort»; liegt dort ein anderer Fall, fragt die App, bevor
          sie ihn ersetzt, und «Letzten geplanten Fall wiederherstellen» holt ihn zurück. Gehört ein Fall nicht mehr zu seinem
          Übergang (Streifen von Hand verschoben bzw. in einer Fall-Datei weit vom Übergang), merkt die App ihn unter
          «fgsCheck.fall.ort» und entfernt danach den Eintrag des Übergangs. «Eingaben verwerfen» bzw. das Löschen aller Eingaben entfernt den Eintrag des
          Übergangs; alle Einträge löschen Sie über die Website-Daten dieser Seite in den Browser-Einstellungen. An keinen Dienst
          gehen Eingaben oder Ergebnisse. Die Breite des rechten Bereichs (Trenner) steht unter «fgsCheck.panelBreite», die zuletzt gesehene Kartenansicht (Mitte und Zoom) unter «fgsCheck.karteAnsicht».</li>
        <li>Der Browser holt die Daten direkt bei diesen Diensten; sie sehen dabei technisch die IP-Adresse und Browserangaben:
          <ul>
            {ds.gruppen.map(g => <li key={g.name}>{g.name}: {g.text}</li>)}
          </ul>
          {ds.eigen.map(t => <Fragment key={t}>{t}{' '}</Fragment>)}
          Der eigene Standort (Standort-Knopf) wird nur im Browser ermittelt und auf der Karte gezeigt, nicht gespeichert und
          nicht gesendet; die Dienste erhalten wie sonst nur den Kartenausschnitt.</li>
        <li>Street View: die Links «Street View ↗» öffnen Google Maps erst auf Klick in einem neuen Fenster; dabei gehen die
          Koordinaten des Standpunkts und die Blickrichtung an Google. Die App bettet nichts von Google ein.</li>
        <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt, ohne Cookies und ohne Speicherung der IP-Adresse. Erfasst
          werden Seitenpfad, Herkunftsseite (Referrer), Bildschirmbreite, Browser und Betriebssystem, Sprache sowie das Land (aus der
          IP-Adresse abgeleitet), nicht Ihre Eingaben oder Ergebnisse.
          GitHub Pages protokolliert zudem Zugriffe (IP-Adresse, Browser), wie jeder Webserver.</li>
      </ul>
    </details>
  )
}

/** Fusszeile: Lizenz und Quellcode */
export function Fusszeile() {
  return (
    <footer className="fuss klein">
      fgsCheck v{__APP_VERSION__} · Code &amp; eigene Inhalte unter{' '}
      <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a>{' '}
      (eingebundene Daten behalten ihre eigenen Lizenzen) ·{' '}
      <a href="https://github.com/pnfzygrzgf-svg/fgsCheck" target="_blank" rel="noopener noreferrer">Quellcode auf GitHub</a>
    </footer>
  )
}
