// ── Einstiegshilfe, Datenschutz und Fusszeile (E4, Veröffentlichung) ──

import { OVERPASS_ENDPOINTS } from './daten/osm'

const host = (u: string) => new URL(u).host

/** Aufklappbare Einstiegshilfe «So funktioniert's» mit den Grenzen der App */
export function Anleitung() {
  return (
    <details className="hilfe">
      <summary>So funktioniert's</summary>
      <ol>
        <li><b>Ort finden:</b> oben in der Karte Ort, Adresse, Strasse oder PLZ eingeben und einen Vorschlag wählen, oder mit dem
          Standort-Knopf unter den Zoom-Knöpfen zum eigenen Standort springen. Die Übergänge im Ausschnitt erscheinen nach dem
          Verschieben bzw. Zoomen von selbst, mit den Strassennamen aus OSM (ab Massstab 1:10 000; weiter draussen: «Zum Suchen
          näher heranzoomen»). Oben
          rechts in der Ebenenwahl lässt sich der Hintergrund umschalten: Luftbild oder Landeskarte (mit Strassennamen).</li>
        <li><b>Übergang wählen:</b> einen Punkt anklicken. Gelb: Fussgängerstreifen in OSM, gelb gestrichelt: vermutlich, violett: Lichtsignal, grau: kein
          Fussgängerstreifen. Die App lädt Amtliche Vermessung, OSM und das Luftbild und rechnet im Browser. Um den Übergang
          stehen danach die genaueren Strassennamen aus diesem Abruf (Ebene «Strassennamen (OSM)»).</li>
        <li><b>Ergebnis lesen:</b> je Streifen die Zufahrten mit Tempo, Sichtweite und Status (frei bzw. verdeckt und wodurch). Zeile
          anklicken: Sichtfeld, Sichtpunkte und Hindernisse auf der Karte. Hinweise in Braun sind Annahmen («aus OSM, prüfen»,
          «Annahme» beim Tempo).</li>
        <li><b>Eingaben korrigieren:</b> unter «Eingaben von Hand» Parkfelder, Bäume, Hecken, Mauern und übrige Hindernisse auf dem
          Luftbild zeichnen, ebenso eine Insel, die den Streifen teilt (ersetzt eine nach OSM und Luftbild angenommene Insel, grün gestrichelt); je
          Zufahrt Tempo, Fahrlinie oder «gibt es nicht»; je Streifen Lichtsignal bzw. «kein FGS». Die Rechnung läuft nach jeder
          Änderung neu.</li>
        <li><b>Bericht und Fall-Datei:</b> «Bericht drucken / als PDF» öffnet eine Druckansicht (Kartenbild, Tabellen, Eingaben,
          Quellen). «Fall speichern» sichert alle Eingaben als JSON-Datei, «Fall laden» stellt sie wieder her.</li>
      </ol>
      <p><b>Grenzen</b></p>
      <ul>
        <li>Amtliche Vermessung frei über geodienste.ch: 19 Kantone ganz, Wallis teilweise (z. B. ohne Sitten und Brig) und
          Liechtenstein. LU, VD, NE, NW, OW und JU geben sie nur mit Freigabe ab: dort rechnet die App nicht.</li>
        <li>Streifen im Luftbild: nur gelbe Streifen, Balken bis rund 6 m; weisse Streifen erkennt die App nicht. Mehrere Streifen
          an einem Knoten und sehr breite Streifen bildet sie nicht immer richtig: dann «Streifen von Hand».</li>
        <li>Parkfelder amtlich nur in der Stadt Bern; sonst von Hand zeichnen bzw. Vorschläge aus OSM bestätigen. Private
          Parkplätze, Hecken und Mauern fehlen in den Daten; ob sie die Sicht verdecken (Höhe), vor Ort prüfen.</li>
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
          der Fall-Datei, wenn Sie sie speichern. Übergänge ohne Eingaben werden nicht gespeichert. «Eingaben verwerfen» bzw. das
          Löschen aller Eingaben entfernt den Eintrag des Übergangs; alle Einträge löschen Sie über die Website-Daten dieser Seite in
          den Browser-Einstellungen. An keinen Dienst gehen Eingaben oder Ergebnisse.</li>
        <li>Der Browser holt die Daten direkt bei diesen Diensten; sie sehen dabei technisch die IP-Adresse und Browserangaben:
          <ul>
            <li>swisstopo (geo.admin.ch): Kartenkacheln (Luftbild bzw. Landeskarte) des sichtbaren Ausschnitts (wmts.geo.admin.ch),
              Luftbild-Ausschnitt ±30 m um den gewählten Übergang und das Kartenbild des Berichts (wms.geo.admin.ch), Flugjahr der
              1-km-Kachel (api3.geo.admin.ch);
              bei der Ortssuche der eingegebene Suchbegriff (api3.geo.admin.ch).</li>
            <li>geodienste.ch (Amtliche Vermessung): Rechteck ±150 m um den Übergang.</li>
            <li>Overpass (OpenStreetMap): Kartenausschnitt (Übergänge und Strassennamen) mit etwas Rand bei der Suche (automatisch beim Start und nach dem Verschieben bzw. Zoomen) bzw. Umkreis 300 m um den
              Übergang; Server {erster}
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
