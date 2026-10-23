// ── Startseite (Einstieg) wie bei VeloroutenCheck und KnotenCheck: Logo, Knopf zur Prüfung, kurze Beschreibung,
// Grenzen, Querverweise und Datenspeicherung. Die Prüfung (App) lädt erst nach «Zur Prüfung und Planung», damit die Startseite
// keine Abfragen an Overpass, geodienste.ch oder swisstopo auslöst. Direkter Einstieg über #pruefen.

const BASIS = import.meta.env.BASE_URL

function Querverweis({ href, bild, titel, text }: { href: string; bild: string; titel: string; text: string }) {
  return (
    <a className="start-kachel" href={href} target="_blank" rel="noopener noreferrer">
      <img src={BASIS + bild} alt="" width={56} height={56} />
      <span>
        <span className="start-kachel-titel">{titel}&nbsp;↗</span><br />
        <span className="start-kachel-text">{text}</span>
      </span>
    </a>
  )
}

export default function Startseite({ onStart }: { onStart: () => void }) {
  return (
    <main className="start">
      {/* Logo dekorativ (alt="", aria-hidden, nicht fokussierbar): der Klick führt mit der Maus weiter zur Prüfung, die zugängliche
          Bedienung ist der Knopf «Zur Prüfung und Planung» direkt darunter; so meldet der Screenreader nicht zwei Bedienungen für dasselbe
          und die Überschrift nennt den Namen ohnehin */}
      <img className="start-logo" src={BASIS + 'logo.svg'} alt="" aria-hidden="true" title="Zur Prüfung und Planung" onClick={onStart} />
      <h1 className="start-titel">fgsCheck</h1>
      <p className="start-untertitel">Sichtprüfung an bestehenden und geplanten Fussgängerstreifen</p>
      <div className="start-knopf-zeile">
        <button className="start-knopf" onClick={onStart}>Zur Prüfung und Planung →</button>
      </div>

      <p>
        fgsCheck prüft, ob an einem Fussgängerstreifen die Sicht auf die Wartebereiche frei ist. Ein Klick auf einen
        Übergang genügt: Die App bildet den Streifen und seine Zufahrten, rechnet die Sichtweiten nach VSS 40 241 und
        zeigt für jede Zufahrt, ob Parkfelder, Bäume, Gebäude oder andere Hindernisse im Sichtfeld liegen, auch für
        abbiegende Fahrzeuge.
      </p>
      <p>
        Neue Streifen lassen sich planen: an beliebiger Stelle zeichnen, die App lädt die Daten dort, rechnet die
        Sichtweiten und vermisst die Lage des Streifens mit Koordinaten, Randabständen und Massen ab einem Fixpunkt, etwa
        einer Gebäudeecke. So lässt sich ein Standort prüfen, bevor der Plan gezeichnet ist.
      </p>
      <p>
        Grundlage sind offene Daten: das Luftbild SWISSIMAGE von swisstopo, die Amtliche Vermessung über geodienste.ch
        und OpenStreetMap, aus dem auch Tempo und Lichtsignale stammen. In der Stadt Bern fliessen die öffentlichen
        Parkfelder automatisch ein, der Baumkataster auf Wunsch. Hindernisse lassen sich von Hand ergänzen, Tempo und
        Fahrlinien korrigieren; das Ergebnis gibt es als PDF-Bericht.
      </p>
      <p className="start-grenzen">
        fgsCheck richtet sich an Fachleute und ersetzt keine Beurteilung vor Ort. Gerechnet werden kann in den Kantonen
        AG, AI, AR, BE, BL, BS, FR, GE, GL, GR, SG, SH, SO, SZ, TG, TI, UR, ZG und ZH, im Wallis in einem Teil der
        Gemeinden sowie im Fürstentum Liechtenstein, also überall dort, wo die Amtliche Vermessung frei verfügbar ist.
      </p>

      <Querverweis href="https://knotencheck.ch/" bild="knotencheck.png" titel="KnotenCheck"
        text="Werkzeug zur Leistungsbeurteilung von Knoten innerorts." />
      <Querverweis href="https://veloroutencheck.ch/" bild="veloroutencheck.svg" titel="VeloroutenCheck"
        text="Qualität der Veloinfrastruktur bewerten." />
      <Querverweis href="https://sichtweitencheck.ch/" bild="sichtweitencheck.svg" titel="SichtweitenCheck"
        text="Sichtprüfung an Knoten und Grundstückzufahrten." />

      <div className="start-daten">
        <div className="start-daten-titel">Datenspeicherung</div>
        <div>Alle Berechnungen laufen im Browser. Eingaben und Ergebnisse werden an keinen Server übermittelt.</div>
        <ul>
          <li>Eingaben merkt sich der Browser je Übergang (lokaler Speicher), nur wenn etwas eingegeben wurde; «Eingaben
            verwerfen» löscht sie. Von geplanten Streifen ohne OSM-Übergang merkt er nur den zuletzt bearbeiteten Fall («Letzten
            geplanten Fall wiederherstellen»); sichern Sie ihn mit «Fall speichern». Die Fall-Datei und der PDF-Bericht werden
            lokal gespeichert, ohne Upload. Auch die gewählte Breite des rechten Bereichs merkt sich der Browser.</li>
          <li>Für Karte und Rechnung fragt die App den Kartenausschnitt bei swisstopo, geodienste.ch, OpenStreetMap
            (Overpass) und in Bern bei map.bern.ch ab; gesendet werden nur Koordinaten des Ausschnitts. Den Suchbegriff der
            Ortssuche erhält swisstopo; der eigene Standort bleibt im Browser. Die Links «Street View ↗» öffnen Google Maps erst
            auf Klick; dabei gehen die Koordinaten an Google.</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt, ohne Cookies und ohne Speicherung der
            IP-Adresse. GitHub Pages protokolliert Zugriffe wie jeder Webserver.</li>
        </ul>
      </div>
      <p className="start-fuss">
        fgsCheck v{__APP_VERSION__} · Code &amp; eigene Inhalte unter{' '}
        <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a>
        {' '}· <a href="https://github.com/pnfzygrzgf-svg/fgsCheck" target="_blank" rel="noopener noreferrer">Quellcode auf GitHub</a>
      </p>
    </main>
  )
}
