// ── Einstiegshilfe, Datenschutz und Fusszeile (E4, Veröffentlichung) ──

import { OVERPASS_ENDPOINTS } from './daten/osm'
import { NACHLADEN_M } from './abdeckung'
import { FANG_PX, FANG_MAX_M, VORSCHLAG_M } from './fixpunkt'
import { ECK_GROSS_M, RUNDEN_R_VORGABE, RUNDEN_R_BEREICH } from './rechner/planflaechen'
import { E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, TEIL_ABSTAND_M, INSEL_TIEFE_MIN_M } from './rechner/standardinsel'
import { AHS_40240 } from './bedarf/tabellen'
import { KATALOG } from './bedarf/katalog'
import { THEMEN } from './bedarf/themen'
import { REICHWEITE_SICHT_M } from './rechner/ohneVortritt'

const F3 = KATALOG.F3.werte, F3B = KATALOG['F3-B'].werte
const B5 = KATALOG['B5-T'].werte, B5S = KATALOG['B5-1'].werte
import { f2 } from './texte'

const host = (u: string) => new URL(u).host

/** Aufklappbare Einstiegshilfe «So funktioniert's» mit den Grenzen der App */
export function Anleitung() {
  return (
    <details className="hilfe">
      <summary>So funktioniert's</summary>
      <p className="klein">Sichtprüfung an bestehenden und geplanten Fussgängerstreifen nach VSS 40 241 und bfu 2.457.01,
        gerechnet im Browser: Ort suchen bzw. Karte verschieben, dann einen Übergang anklicken oder mit «Streifen planen» einen
        neuen Streifen zeichnen.</p>
      <ol>
        <li><b>Ort finden:</b> oben in der Karte Ort, Adresse, Strasse oder PLZ eingeben und einen Vorschlag wählen, oder mit dem
          Standort-Knopf unter den Zoom-Knöpfen zum eigenen Standort springen. Die Übergänge im Ausschnitt erscheinen nach dem
          Verschieben bzw. Zoomen von selbst, mit den Strassennamen aus OSM (ab Massstab 1:10 000; weiter draussen: «Zum Suchen
          näher heranzoomen»). Oben
          rechts in der Ebenenwahl lässt sich der Hintergrund umschalten: Luftbild oder Landeskarte (mit Strassennamen). Der Trenner
          zwischen Karte und rechtem Bereich lässt sich ziehen (bzw. mit den Pfeiltasten verschieben); die Breite bleibt gespeichert.</li>
        <li><b>Übergang wählen:</b> einen Punkt anklicken. Gelb: Fussgängerstreifen in OSM, gelb gestrichelt: vermutlich, violett: Lichtsignal, grau: kein
          Fussgängerstreifen. Die App lädt Amtliche Vermessung, OSM und das Luftbild und rechnet im Browser. Den Streifen sucht sie im Luftbild, sonst bildet sie ihn aus OSM und AV. Um den Übergang
          stehen danach die genaueren Strassennamen aus diesem Abruf (Ebene «Strassennamen (OSM)»).</li>
        <li><b>Ergebnis lesen:</b> je Streifen die Zufahrten mit Tempo, Sichtweite und Status (frei bzw. verdeckt und wodurch). Zeile
          anklicken: Sichtfeld, Sichtpunkte und Hindernisse auf der Karte. Hinweise in Braun sind Annahmen («aus OSM, prüfen»,
          «Annahme» beim Tempo). Zufahrten heissen nach der Strasse und der Herkunft der Fahrzeuge als Himmelsrichtung (z. B.
          «Glockenstrasse von Süden»), Abbieger nach der Strasse, aus der sie abbiegen; die
          Fahrtrichtung in Grad zeigt der Tooltip. Dazu tragen sie eine Nummer, auf der Karte als Schild hinter dem letzten
          Sichtpunkt, im Panel und im Bericht vor dem Namen: je Streifen im Uhrzeigersinn ab Norden nach der Herkunft, gerade und
          abbiegende gemeinsam. Von Hand gestrichene Zufahrten behalten ihre Nummer (unter «Nicht geprüfte Richtungen», ohne
          Schild), so bleiben die übrigen Nummern gleich; aus den Daten entfallene Richtungen haben keine Nummer. Klick aufs Schild
          wählt die Zufahrt, nochmals Klick hebt die Auswahl auf. Streifen von Hand heissen «Streifen 1», «Streifen 2» … oder wie in der Liste benannt.</li>
        <li><b>Eingaben korrigieren:</b> unter «Eingaben von Hand» Parkfelder, Bäume, Hecken, Mauern und übrige Hindernisse auf dem
          Luftbild zeichnen, ebenso eine Insel, die den Streifen teilt (ersetzt eine nach OSM und Luftbild angenommene Insel, grün gestrichelt); je
          Zufahrt Tempo, Fahrlinie oder «gibt es nicht»; je Streifen Lichtsignal, «kein FGS» (nicht prüfen) bzw. die Querung
          (Fussgängerstreifen oder ohne Vortritt). Vorschläge aus OSM (gestrichelt) zählen erst nach
          «bestätigen»; in Bern lädt die App die amtlichen Parkfelder der Stadt, sie zählen sofort. Die Rechnung läuft nach jeder
          Änderung neu.</li>
        <li><b>Streifen planen:</b> «Streifen planen» (neben «Fall laden») wählen, die Breite (Balkenlänge) einstellen und auf der
          Karte die beiden Wartebereiche gegenüber anklicken – auch dort, wo OSM keinen Übergang kennt. Die App prüft den Streifen
          als Fussgängerstreifen (Zufahrten, Tempo, Sichtweiten, Hindernisse). Zum laufenden Fall kommt er, wenn er ganz innert
          {' '}{NACHLADEN_M} m um den geladenen Ort liegt oder alle Streifen von Hand zusammen ganz innert {NACHLADEN_M} m um einen
          Ort liegen (die App lädt dann um ihre Mitte nach); sonst bzw. ohne geladenen Ort beginnt am Streifen ein neuer Fall, und
          die App lädt AV, OSM und Kataster um ihn. Unter «Streifen von Hand» Enden verschieben und Breite ändern; «Lage und Masse»
          nennt die LV95-Koordinaten von Achse und Ecken, Länge, Winkel zur Fahrbahn, Abstand der Enden zum Fahrbahnrand und zum
          nächsten Knoten («Koordinaten kopieren» für CAD bzw. Tabelle; im Bericht als Tabelle). An einer OSM-Querung ohne
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
          «Flächen (Plan)» bei der Fläche «Ecke runden» wählen, den Radius eingeben (Vorgabe {RUNDEN_R_VORGABE} m,
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
          Schutzinsel mit Rollstuhlfurt nach Masterplan Fussverkehr Stadt Bern, Standards, E1 ein: Inseltiefe quer zur Fahrbahn
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
        <li><b>Vermassung ab Fixpunkt:</b> Werkzeug «Fixpunkt» (unter «Eingaben von Hand» bzw. «Fixpunkt setzen» in «Lage und
          Masse») und auf der Karte eine Gebäudeecke bzw. einen Punkt der AV anklicken: die App fängt den nächsten Stützpunkt der
          AV-Bodenbedeckung im Umkreis von {FANG_PX} Bildschirmpunkten (höchstens {FANG_MAX_M} m), sonst bleibt es ein freier Punkt.
          Vorgeschlagen wird je Strassenseite die nächste Gebäudeecke bis {VORSCHLAG_M} m vom Streifen (blasses Quadrat auf der Karte: Klick darauf bzw. «übernehmen» in «Lage und Masse»). Gemessen wird
          rechtwinklig: längs entlang der Balken (bei geraden Streifen der Fahrbahn) vom Fixpunkt bis zur näheren Streifenkante und bis
          zur Achse, zum näheren Achsenende längs und quer, dazu die Luftlinie zur nächsten Ecke; bei einem schiefen Streifen trifft
          das Längsmass die schiefe Kante auf der Höhe des Fixpunkts. Fixpunkte lassen sich benennen, verschieben (fangen wieder) und
          löschen, stehen in der Fall-Datei und im Bericht und ändern die Sichtprüfung nicht. Punkte der AV sind keine vermarkten
          Grenzpunkte: ihre Lage hat die Genauigkeit der AV-Bodenbedeckung.</li>
        <li><b>Bedarf und Querungstyp:</b> der aufklappbare Abschnitt über den Streifen beurteilt, ob ein Fussgängerstreifen zulässig
          ist, welcher Querungstyp passt (Fussgängerstreifen, mit Schutzinsel, mit Lichtsignal, Querung ohne Vortritt, Trottoirüberfahrt)
          und welche Elemente und Masse nötig sind. Grundlage sind VSS 40 241, 40 240, 40 242, 40 837, SN 640 075 und weitere (nur
          Ziffern und eigene Kurztexte). Die Eingaben stehen nach Blöcken (Rahmen, Nachfrage, Verkehr, Lage, Insel, Ausrüstung,
          LSA-Zeiten, Trottoirüberfahrt): vorbelegt ist, was die Rechnung schon kennt (Querungsart der Streifen, Lichtsignal, Tempo,
          innerorts als Annahme bis 50 km/h, Fahrbahnbreite und Querdistanzen nach den Bordkanten, Fahrstreifen nach OSM, Insel aus der
          Teilung bzw. der Mittelinsel (Standard), Radstreifen, Tram nach OSM), mit Quelle. Aus Geodaten kommen dazu die Bushaltestelle
          («keine», wenn im Umkreis von 50 m um den Streifen keine liegt; sonst ein Hinweis mit Name und Abstand), Strecke oder Zone
          (nur mit Zonenangabe in OSM), in der Stadt Bern der DTV aus den Verkehrsdaten des Geoportals (Strassen ohne Eintrag:
          500 als Annahme) und ein Hinweis zur Beleuchtung nach OSM (das Feld bleibt offen); jede Angabe nennt ihre Herkunft (Geoportal
          Stadt Bern bzw. OSM). Eine Eingabe von Hand überschreibt den Wert
          («zurück» stellt die Vorbelegung wieder her), wählbar als von Hand, Schätzung oder Annahme. Fussgänger lassen sich als
          Schätzklasse (unter 100, 100 bis 500, über 500 in den 5 Spitzenstunden) angeben; eine Zählung geht vor. Leere Felder sind
          «offen» und zählen nie als erfüllt. Das Befundblatt nennt den empfohlenen Querungstyp mit kurzer Begründung und Ziffern, die
          Einträge nach Thema, offene Angaben nach Block der Maske, nicht geprüfte Blöcke und die Masse Soll/Ist. Die Ebenen Bern
          (Masterplan, Handbuch LSA) und Kanton BE (Arbeitshilfe) lassen sich schalten; vorgegeben sind sie nach der Gemeinde bzw. dem
          Kanton der AV am Streifen. <b>Zusammenfassung:</b> zuoberst steht je Querung ein Absatz in drei Sätzen: ob ein
          Fussgängerstreifen zulässig ist und welche Querung empfohlen wird, das Wichtigste aus Grundprüfung und Befunden (Muss vor Soll,
          höchstens zwei genannt) und welche Angaben noch fehlen. Die Sätze folgen festen Vorlagen aus den Befunden, ohne eigene
          Wertung; die Fragen darin springen wie überall zum Feld. <b>Ablauf:</b> Vorbelegt ist, was die Rechnung kennt; alles Übrige von Hand
          eingeben. Offene Angaben erscheinen als Frage («Ist die Querung nachts beleuchtet?»); ein Klick auf die Frage springt zum
          Feld und öffnet dazu die Aufklapper. Findet die App einen Anhaltspunkt ohne Wert (z. B. eine Strassenlampe in OSM), steht er beim offenen Feld. Der Knopf «?» bei jedem Feld erklärt es (was gemeint ist, welche Prüfungen es braucht,
          was leer bedeutet). <b>Eine Zeile je Punkt bzw. Eintrag:</b> Symbol, Kurztitel, Verbindlichkeit und ein Satz mit Ist und
          Soll; Regelnummer, Fundstelle und Normhinweis stehen hinter «Details» (im Bericht klein darunter). <b>Themen:</b> jede Regel
          gehört zu genau einem Thema in Alltagssprache ({THEMEN.map(t => t.name).join(', ')}); die Punkte der Grundprüfung führen die
          Namen der bfu, ihr Thema steht klein daneben. Im Thema stehen zuerst die Muss-Regeln, dann was nur mit Bericht abweichen
          darf, die Soll-Regeln, die Hinweise und zuletzt das Offene. <b>Verbindlichkeit in Worten</b> nach dem Wortlaut der Quelle und
          der Ebene: «Muss (Norm)», «Muss (Norm), Abweichung nur mit verkehrstechnischem Bericht», «Soll (Norm), Abweichung
          begründen», «Hinweis (Richtlinie)»; Ebenen Recht, Norm, Standard Stadt Bern, Arbeitshilfe Kanton Bern, Richtlinie, bei
          Projektentscheiden «Projektentscheid fgsCheck». Norm, Standard und Arbeitshilfe sind keine Gesetze; verbindlich im
          Rechtssinn ist nur die Ebene Recht. Ein Symbol (✗, !, i, ?) steht davor, die Farbe ist nur Zusatz. <b>Prüfübersicht:</b>
          «Geprüft: … Regeln · ohne Befund … · offen … · Befunde … · Hinweise …», aufklappbar je Thema mit den Regeln, die geprüft
          und ohne Befund sind. Geprüft heisst: die Regel greift im Fall; ohne Befund: geprüft und nicht verletzt (nicht bei der
          zweiten Stufe einer Regel, deren erste Stufe verletzt oder offen ist, z. B. Regelbreite nach Mindestbreite); Befunde: Muss
          bzw. Soll nicht erfüllt; offen: Angabe fehlt. Nicht gezählt werden Verzweigungen des Ablaufs (z. B. «Querung ausserorts»).
          «Nicht geprüft» heisst, die Regel könnte gelten, aber eine Angabe fehlt oder der Ablauf endet vorher (z. B. «Ortslage
          fehlt», «Baum endet: Begegnungszone», «Querungstyp fehlt», Ebene ausgeschaltet); «nicht anwendbar», sie gilt im Fall nicht.
          Eine frei geprüfte Sicht zählt nur als ohne Befund, wenn das Soll nach dem richtigen Tempo gerechnet ist (bei Anzeichen für
          schnelleres Fahren nach der gemessenen V85). Von Hand gestrichene Zufahrten nennt die Übersicht. Im Bericht steht die
          Übersicht mit den Themenzeilen, ohne die Liste. Die Sicht übernimmt das Befundblatt aus dem Sichtrechner (frei bzw. verdeckt je Zufahrt), ausser eine vorhandene
          Sichtweite ist von Hand eingegeben. <b>Querung ohne Vortritt:</b> je Streifen unter «Querung» Furt (Insel ohne Balken) bzw.
          Nase, Einengung oder ohne bauliche Massnahme wählen: der Streifen erscheint ohne Balken (weiss gestrichelt), geprüft wird mit
          der Sichtweite nach VSS 40 240 Z. 8.2, max(v · L / 1,2 m/s; Anhaltesichtweite {Object.entries(AHS_40240).map(([t, sw]) =>
          `${t} km/h ${sw} m`).join(', ')}) je Teilquerung, v = Tempo der Zufahrt, L = Querdistanz Bord bis Bord bzw. bis zur Insel; ist
          die Insel im Bedarf als «nur markiert» angegeben, gilt die ganze Fahrbahn. Sichtfeld und Hindernisse wie beim
          Fussgängerstreifen, ohne die Kurvenregeln; geprüft wird höchstens bis {REICHWEITE_SICHT_M} m ab dem Streifen (so weit reichen
          die geladenen Daten): ein höheres Soll erscheint mit «geprüft bis {REICHWEITE_SICHT_M} m, darüber nicht geprüft» und gilt im
          Befundblatt als offen. Ist die Sicht verdeckt, wo das Soll über der Anhaltesichtweite liegt, meldet das Befundblatt das
          vorerst gelb (ob die Anhaltesichtweite frei bleibt, prüft die App noch nicht getrennt). An einem Streifen mit Lichtsignal
          gilt die Sichtweite nach VSS 40 241 nicht; das Befundblatt nennt den Sichtrechner dort nur als Hinweis. Ein Querungstyp
          von Hand, der der Querungsart der Streifen widerspricht, gilt nicht (Hinweis im Befundblatt). «kein FGS» bleibt davon getrennt: der Streifen wird dann gar nicht geprüft.
          Ein Fall mit Eingaben zum Bedarf bzw. mit einer Querung ohne Vortritt hat die Version 3; ältere Fassungen der App lehnen ihn
          ab. Die Mittelinsel (Standard) prüft die Durchfahrt daneben nach den Bändern der Arbeitshilfe Kanton BE (unter {f2(F3.min)} m zu
          schmal, zwischen {f2(F3.schmalMax)} und {f2(F3.breitMin)} m Überholkonflikt Lastwagen–Velo, mit Radstreifen nach den Berner
          Standards {f2(F3B.min)} bis {f2(F3B.max)} m).</li>
        <li><b>Grundprüfung (Big Five, bfu):</b> oben im Abschnitt «Bedarf und Querungstyp» prüft ein Kasten die fünf Punkte der
          bfu-Fachdokumentation MS.013-2025 und das Tempo als Vorbedingung, mit eigenen Regeln nach den Werten der bfu: Tempo
          (signalisiert und V85 höchstens {B5.vMax} km/h; ohne V85 offen), ① Sicht nach V85 ({B5S.v30}/{B5S.v40}/{B5S.v50}/{B5S.v60} m bei
          30/40/50/60 km/h, im Knoten nach Kurvenradius bis 20 m {B5S.r5}/{B5S.r10}/{B5S.r15}/{B5S.r20} m) und Erkennungsdistanz, ② Schutzinsel
          (über 8,50 m Fahrbahn empfohlen, Tiefe mindestens 1,50 m, besser 2,00 m, Durchfahrt 3,50 m oder ab 4,50 m), ③ höchstens ein
          Fahrstreifen je Richtung ohne Insel, ④ Beleuchtung, ⑤ mindestens 100 Querende in den 5 Spitzenstunden. Jeder Punkt ist
          in einer Zeile erfüllt (✓), nicht erfüllt (✗ Muss, ! Soll), offen (?) oder ein Hinweis (i), mit einem Satz bzw. der offenen Frage; die Muss-Regel des Punkts bestimmt den Zustand, eine offene oder nicht erfüllte Soll-Regel steht in Klammern. Nummern, Fundstellen, Normhinweise und feste Hinweise stehen unter «Details». Die
          Grundprüfung gilt nur für Fussgängerstreifen ohne Lichtsignal und läuft unabhängig von den Ebenen; wo die Norm anders
          wertet, steht ein Normhinweis. Darunter ihre Eingaben; das vollständige Befundblatt und die übrigen Eingaben stehen
          aufklappbar unter «Erweiterte Prüfung». Im Bericht steht die Grundprüfung vor dem Befundblatt. Unter den weiteren
          bfu-Punkten prüft sie auch die Fahrbahnhaltestelle (Schutzinsel, Durchfahrt rund 3,50 m). Ist ein Soll unsicher (Stufe 60 km/h
          ohne Angabe innerorts, Kurvenradius von Hand ohne Zuordnung zur Zufahrt), gilt ein Bereich: verletzt nur darunter, erfüllt nur
          darüber, sonst offen.</li>
        <li><b>Feldhilfen:</b> der Knopf «?» bei jedem Eingabefeld klappt darunter eine Erklärung auf: was gemeint ist (in eigenen
          Worten, wo nötig mit Beispiel), wozu das Feld dient (die Prüfungen, die es im Fall braucht, mit Ergebnis und Quelle, direkt aus dem
          Regelkatalog; Grundprüfung zuerst, dann nach Stärke, höchstens fünf, der Rest unter «weitere anzeigen»; Felder wie der
          Querungstyp, die nur bestimmen, welche Prüfungen gelten, nennen das als Ablauf) und was ein leeres Feld bedeutet (keine Pflicht, die betroffenen Prüfungen bleiben offen; bei vorbelegten
          Feldern steht, woher der Vorschlag kommt). Felder, die im Fall nicht wirken können, sind ausgeblendet (z. B. Angaben zur
          Insel ohne Insel, LSA-Zeiten ohne Lichtsignal, Trottoirüberfahrt nur an einer Einmündung); ihre Werte bleiben im Fall,
          «alle Felder zeigen» blendet sie wieder ein. Beim Tempo-Regime gilt eine Hauptstrasse ausserhalb der Zone als Strecke, auch
          mit Tempo 30; ältere Fälle mit dem früheren Zusatzfeld dazu laden weiter. Im Bericht stehen keine Feldhilfen.</li>
        <li><b>Bericht und Fall-Datei:</b> «Bericht drucken / als PDF» öffnet eine Druckansicht (Kartenbild, Tabellen, Eingaben,
          Quellen). «Fall speichern» sichert alle Eingaben als JSON-Datei, «Fall laden» stellt sie wieder her.</li>
      </ol>
      <p><b>Grenzen</b></p>
      <ul>
        <li>Amtliche Vermessung frei über geodienste.ch: 19 Kantone ganz, Wallis teilweise (z. B. ohne Sitten und Brig) und
          Liechtenstein. LU, VD, NE, NW, OW und JU geben sie nur mit Freigabe ab: dort rechnet die App nicht.</li>
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
  )
}

/** Aufklappbarer Datenschutz-Hinweis: was im Browser bleibt, welche Dienste was erhalten */
export function Datenschutz() {
  const [erster, ...weitere] = OVERPASS_ENDPOINTS.map(host)
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
          gehen Eingaben oder Ergebnisse. Die Breite des rechten Bereichs (Trenner) steht unter «fgsCheck.panelBreite».</li>
        <li>Der Browser holt die Daten direkt bei diesen Diensten; sie sehen dabei technisch die IP-Adresse und Browserangaben:
          <ul>
            <li>swisstopo (geo.admin.ch): Kartenkacheln (Luftbild bzw. Landeskarte) des sichtbaren Ausschnitts (wmts.geo.admin.ch),
              Luftbild-Ausschnitt ±30 m um den gewählten Übergang und das Kartenbild des Berichts (wms.geo.admin.ch), Flugjahr der
              1-km-Kachel (api3.geo.admin.ch);
              bei der Ortssuche der eingegebene Suchbegriff (api3.geo.admin.ch).</li>
            <li>geodienste.ch (Amtliche Vermessung): Rechteck ±150 m um den Übergang bzw. die geplanten Streifen.</li>
            <li>Overpass (OpenStreetMap): Kartenausschnitt (Übergänge und Strassennamen) mit etwas Rand bei der Suche (automatisch beim Start und nach dem Verschieben bzw. Zoomen) bzw. Umkreis 300 m um den
              Übergang bzw. die geplanten Streifen; Server {erster}
              (Swiss OpenStreetMap Association), bei Störung ersatzweise {weitere.join(', ')}.</li>
            <li>map.bern.ch (Geodaten Stadt Bern), nur in der Stadt Bern: Rechteck ±150 m für amtliche Parkfelder bzw. den
              Baumkataster, Haltestellen und Verkehrsdaten.</li>
          </ul>
          Der eigene Standort (Standort-Knopf) wird nur im Browser ermittelt und auf der Karte gezeigt, nicht gespeichert und
          nicht gesendet; die Dienste erhalten wie sonst nur den Kartenausschnitt.</li>
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
