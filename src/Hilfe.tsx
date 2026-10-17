// ── Einstiegshilfe, Datenschutz und Fusszeile (E4, Veröffentlichung) ──

import { OVERPASS_ENDPOINTS } from './daten/osm'
import { NACHLADEN_M } from './abdeckung'
import { FANG_PX, FANG_MAX_M, VORSCHLAG_M } from './fixpunkt'

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
          rechts in der Ebenenwahl lässt sich der Hintergrund umschalten: Luftbild oder Landeskarte (mit Strassennamen).</li>
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
          Zufahrt Tempo, Fahrlinie oder «gibt es nicht»; je Streifen Lichtsignal bzw. «kein FGS». Vorschläge aus OSM (gestrichelt) zählen erst nach
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
          liegt eine Insel von Hand in einer Plan-Fläche der Art Insel, zählt nur die Plan-Fläche.</li>
        <li><b>Vermassung ab Fixpunkt:</b> Werkzeug «Fixpunkt» (unter «Eingaben von Hand» bzw. «Fixpunkt setzen» in «Lage und
          Masse») und auf der Karte eine Gebäudeecke bzw. einen Punkt der AV anklicken: die App fängt den nächsten Stützpunkt der
          AV-Bodenbedeckung im Umkreis von {FANG_PX} Bildschirmpunkten (höchstens {FANG_MAX_M} m), sonst bleibt es ein freier Punkt.
          Vorgeschlagen wird je Strassenseite die nächste Gebäudeecke bis {VORSCHLAG_M} m vom Streifen (blasses Quadrat auf der Karte: Klick darauf bzw. «übernehmen» in «Lage und Masse»). Gemessen wird
          rechtwinklig: längs entlang der Balken (bei geraden Streifen der Fahrbahn) vom Fixpunkt bis zur näheren Streifenkante und bis
          zur Achse, zum näheren Achsenende längs und quer, dazu die Luftlinie zur nächsten Ecke; bei einem schiefen Streifen trifft
          das Längsmass die schiefe Kante auf der Höhe des Fixpunkts. Fixpunkte lassen sich benennen, verschieben (fangen wieder) und
          löschen, stehen in der Fall-Datei und im Bericht und ändern die Sichtprüfung nicht. Punkte der AV sind keine vermarkten
          Grenzpunkte: ihre Lage hat die Genauigkeit der AV-Bodenbedeckung.</li>
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
          gehen Eingaben oder Ergebnisse.</li>
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
              Baumkataster.</li>
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
