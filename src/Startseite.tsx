// ── Startseite (Einstieg) wie bei VeloroutenCheck und KnotenCheck: Logo, Knopf zur Prüfung, kurze Beschreibung,
// Querverweise und Datenspeicherung. Die Prüfung (App) lädt erst nach «Zur Prüfung und Planung», damit die Startseite
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
      <p className="start-untertitel">Sichtprüfung an bestehenden und geplanten Fussgängerstreifen <span className="marke">Beta v{__APP_VERSION__}</span></p>
      <div className="start-knopf-zeile">
        <button className="start-knopf" onClick={onStart}>Zur Prüfung und Planung →</button>
      </div>

      <p>
        <b>Funktion:</b> fgsCheck prüft, ob an einem Fussgängerstreifen die Sicht auf die Wartebereiche frei ist. Ein Klick auf
        einen Übergang genügt: Die App bildet den Streifen und seine Zufahrten, rechnet die Sichtweiten und zeigt für jede
        Zufahrt, ob Parkfelder, Bäume, Gebäude oder andere Hindernisse im Sichtfeld liegen, auch für abbiegende Fahrzeuge.
        Hindernisse lassen sich von Hand ergänzen, Tempo und Fahrlinien korrigieren; das Ergebnis gibt es als PDF-Bericht.
      </p>
      <p>
        Neue Streifen lassen sich planen: an beliebiger Stelle zeichnen, die App lädt die Daten dort, rechnet die
        Sichtweiten und vermisst die Lage des Streifens mit Koordinaten, Randabständen und Massen ab einem Fixpunkt, etwa
        einer Gebäudeecke. So lässt sich ein Standort prüfen, bevor der Plan gezeichnet ist.
      </p>
      <p>
        Im Reiter «Bedarf und Querungstyp» prüft die App, ob ein Fussgängerstreifen zulässig ist und welche Querung passt.
        Eine Trottoirüberfahrt lässt sich direkt planen: Die App geht die Prüfliste durch und rechnet die Knotensicht der
        Ausfahrenden mit demselben Rechenkern wie der SichtweitenCheck. Fahrzeuge und Sichtfelder stehen auf der Karte, Masse
        lassen sich im Luftbild messen.
      </p>
      <p>
        Auf Wunsch zeigt eine 3D-Ansicht den Streifen auf den Flächen der Amtlichen Vermessung mit Gelände und Gebäuden von swisstopo, aus dem wartenden Auto
        heraus, um den Streifen drehbar oder frei über die Karte bewegbar. Sie ist nur Darstellung und ändert kein Ergebnis.
      </p>
      <p>
        <b>Daten:</b> Die App nutzt offene Daten von Bund, Kantonen und Städten sowie OpenStreetMap, zum Beispiel das Luftbild
        SWISSIMAGE, die Amtliche Vermessung und das Höhenmodell. Je nach Ort kommen weitere Quellen dazu, etwa amtliches Tempo,
        Parkfelder oder der Baumkataster. Welche Quellen genutzt werden, steht in der App unter «Datenquellen und Ladezustand».
      </p>
      <p>
        <b>Bewertungsgrundlage:</b> Die Sichtweiten rechnet die App nach VSS 40 241 «Querungen für den Fussgänger- und leichten
        Zweiradverkehr; Fussgängerstreifen». Bedarf und Querungstyp folgen zuerst den fünf Punkten der bfu, dann den Regeln der Normen.
        Die Trottoirüberfahrt folgt der Prüfliste der VSS 40 242 «Querungen für den Langsamverkehr; Trottoirüberfahrten».
      </p>
      <p><b>Die App ersetzt keine Beurteilung vor Ort.</b></p>

      <Querverweis href="https://veloroutencheck.ch/" bild="veloroutencheck.svg" titel="VeloroutenCheck"
        text="Qualität der Veloinfrastruktur bewerten." />
      <Querverweis href="https://sichtweitencheck.ch/" bild="sichtweitencheck.svg" titel="SichtweitenCheck"
        text="Sichtprüfung an Knoten und Grundstückzufahrten." />
      <Querverweis href="https://knotencheck.ch/" bild="knotencheck.png" titel="KnotenCheck"
        text="Werkzeug zur Leistungsbeurteilung von Knoten innerorts." />

      {/* Unterstützen (Ko-fi, 31.10.2026): wie im VeloroutenCheck als eigene Karte auf der Startseite */}
      <div className="start-spende">
        <div className="start-spende-text">
          <div className="start-spende-titel">fgsCheck unterstützen</div>
          <div className="start-spende-hinweis">
            Der Rechner ist frei nutzbar und quelloffen. Wer die Weiterentwicklung unterstützen möchte, kann über
            Ko-fi spenden.
          </div>
        </div>
        <a className="start-spende-knopf" href="https://ko-fi.com/pnfzygrzgfsvg" target="_blank" rel="noopener noreferrer">
          Über Ko-fi unterstützen ↗
        </a>
      </div>

      <div className="start-daten">
        <div className="start-daten-titel">Datenspeicherung</div>
        <div>Alle Berechnungen laufen im Browser. Für Karten und Höhenprofile werden die unten beschriebenen Koordinaten an die Datenanbieter übermittelt; Prüfergebnisse bleiben im Browser.</div>
        <ul>
          <li>Eingaben merkt sich der Browser je Übergang (lokaler Speicher), nur wenn etwas eingegeben wurde; «Eingaben
            verwerfen» löscht sie. Von geplanten Streifen ohne OSM-Übergang merkt er nur den zuletzt bearbeiteten Fall («Letzten
            geplanten Fall wiederherstellen»); sichere ihn mit «Fall speichern». Die Fall-Datei und der PDF-Bericht werden
            lokal gespeichert, ohne Upload. Auch die gewählte Breite des rechten Bereichs und die zuletzt gewählte Kamera der 3D-Ansicht merkt sich der Browser.</li>
          <li>Für Karte, Rechnung und Bericht fragt die App den Kartenausschnitt bei swisstopo, geodienste.ch, OpenStreetMap
            (Overpass), in Bern bei map.bern.ch und gisapp.bern.ch und in Zürich bei den Geodatendiensten der Stadt ab; gesendet
            werden nur Koordinaten. In der geöffneten 3D-Ansicht wird je Zufahrt ein Bodenprofil entlang der Fahrlinie abgefragt, in Bern beim DTM der Stadt, sonst und bei dessen Ausfall bei swisstopo. Ausserhalb Berns erhält swisstopo zusätzlich einen Profilpunkt und seine gelieferte Bodenhöhe für die Umrechnung des Höhenbezugs. Den Suchbegriff der Ortssuche erhält swisstopo; der eigene Standort bleibt im Browser. Die Dienste sehen technisch die IP-Adresse.
            Die Links «Street View ↗» öffnen Google Maps erst auf Klick; dabei gehen die Koordinaten an Google. Beim Wechsel zu einem anderen
            Rechner gehen nur Lage und OSM-Id mit. Die vollständige Liste der Dienste steht in der App unter «Datenschutz».</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt, ohne Cookies und ohne Speicherung der
            IP-Adresse. GitHub Pages protokolliert Zugriffe wie jeder Webserver.</li>
        </ul>
      </div>
      <p className="start-fuss">
        fgsCheck Beta v{__APP_VERSION__} · Code unter <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer">MIT</a>, eigene Inhalte unter{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
        {' '}(eingebundene Daten behalten ihre eigenen Lizenzen) · <a href="https://github.com/pnfzygrzgf-svg/fgsCheck" target="_blank" rel="noopener noreferrer">Quellcode auf GitHub</a>
        {' '}· <a href="https://ko-fi.com/pnfzygrzgfsvg" target="_blank" rel="noopener noreferrer">Unterstützen ↗</a>
      </p>
    </main>
  )
}
