// ── Einstiegshilfe, Datenschutz und Fusszeile (E4, Veröffentlichung) ──

import { datenschutzGruppen } from './daten/quellenregister'
import { Fragment } from 'react'
import { WerkLinks, VerweisText } from './Verweise'
export { WerkLinks }
import { WERKE } from './bedarf/katalog'
import { LESENAME, WERK_IDS, WERK_INFO, regelnJeWerk, werkAnker, werkText, werkVoll } from './bedarf/quellen'
import { TAB1_TEXT, KURVE_SICHTWEITE } from './rechner/tempo'
import { regelWerkAnker, regelnWerkZeigen } from './bedarf/regeluebersicht'
import { begriffeAlphabetisch } from './bedarf/begriffe'


/** Grundanleitung: nur die ersten Bedienschritte; Details stehen bei den Feldern und Werkzeugen. */
export function Anleitung() {
  return (
    <details className="hilfe">
      <summary>So funktioniert's</summary>
      <p><b>Ort suchen:</b> Oben in der Karte Ort, Adresse oder Strasse eingeben und heranzoomen, bis die Übergänge erscheinen.</p>
      <ol>
        <li><b>Übergang wählen:</b> Einen Punkt auf der Karte anklicken. Die App lädt die Daten und startet die Prüfung.</li>
        <li><b>Sichtprüfung:</b> Je Zufahrt steht, ob die Sicht frei oder verdeckt ist. Eine Zeile anklicken, um das Sichtfeld auf der Karte zu sehen.</li>
        <li><b>Bedarf und Querungstyp:</b> Die Zusammenfassung lesen, offene Fragen beantworten und Vorschläge prüfen.</li>
        <li><b>Angaben ergänzen:</b> Unter «Eingaben von Hand» zum Beispiel Tempo anpassen oder Hindernisse einzeichnen. Die App rechnet neu.</li>
        <li><b>Neu planen:</b> In der Gruppe «Planen» das passende Werkzeug wählen. Für einen neuen Streifen «Streifen planen» wählen und die beiden Wartebereiche anklicken.</li>
        <li><b>Bericht und Fall:</b> «Bericht / PDF» öffnet die Druckansicht. «Fall speichern» sichert die Eingaben; «Fall laden» öffnet sie wieder.</li>
      </ol>
      <p className="klein">Weitere Erklärungen stehen bei den Fragezeichen sowie unter «Grundlagen und Quellen» und «Begriffe».</p>
    </details>
  )
}

/** Grundlagen der Sichtrechnung (Panel «Grundlagen und Quellen»): Werke als Verweise wie im Lesetext, VRV mit Artikel-Link */
export function RechnungGrundlagen() {
  return <p className="klein">
    Sichtweiten: <VerweisText text={`${LESENAME['40241']}, Tabelle 1`} /> ({TAB1_TEXT});
    im Knoten nach Kurvenradius (<VerweisText text={LESENAME.BFU} /><WerkLinks w="BFU" kurz /> bzw. <VerweisText text={`${LESENAME['40241']}, Tabelle 2`} />:
    {' '}{KURVE_SICHTWEITE.map(([r, s]) => `bis ${r} m: ${s} m`).join(', ')}). Sichtpunkte mindestens 1,5 m von Parkfeldern; Auto-Parkfeld
    näher als 5 m am Streifen: <VerweisText text={`${LESENAME.VRV}, Art. 18 Abs. 2 Bst. e`} />.
  </p>
}

/** Quellen der Prüfungen (seit 23.10.2026 im Panel-Abschnitt «Grundlagen und Quellen», nicht mehr in der Hilfe): je Werk
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

/** Begriffe des Bedarfsmoduls (seit 23.10.2026 eigener Panel-Abschnitt «Begriffe»), alphabetisch, je eine eigene Erklärung */
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
      <p className="klein">Für die Anzeige des Datenstands werden zusätzlich öffentliche Produktmetadaten von map.bern.ch und
        die kantonalen AV-Publikationsstände von www.geodienste.ch abgefragt. Diese Metadatenabrufe enthalten nur Produktnamen,
        keine Eingaben oder Ergebnisse. Die Anbieter sehen dabei wie bei den Datenabrufen die IP-Adresse und Browserangaben.</p>
      <ul>
        <li>Keine Anmeldung, kein eigener Server: gerechnet wird im Browser (Web Worker).</li>
        <li>Die Links unter «In anderen Rechnern prüfen» öffnen einen anderen Rechner; dabei gehen nur Lage und OSM-Id mit, keine Eingaben. Die
          Angaben stehen hinter dem # der Adresse und gehen nicht an den Webserver.</li>
        <li>Eingaben (Hindernisse, Tempo, Fahrlinien, Streifen, Bezeichnung) bleiben im Browser: je Übergang mit Eingaben ein Eintrag
          im lokalen Speicher (localStorage, Schlüssel «fgsCheck.fall.» und Nummer des Übergangs, mit den Koordinaten), sonst nur in
          der Fall-Datei, wenn du sie speicherst. Übergänge ohne Eingaben werden nicht gespeichert. Fälle ohne Übergang (z. B. ein
          geplanter Streifen) teilen sich einen einzigen Eintrag «fgsCheck.fall.ort»; liegt dort ein anderer Fall, fragt die App, bevor
          sie ihn ersetzt, und «Letzten geplanten Fall wiederherstellen» holt ihn zurück. Gehört ein Fall nicht mehr zu seinem
          Übergang (Streifen von Hand verschoben bzw. in einer Fall-Datei weit vom Übergang), merkt die App ihn unter
          «fgsCheck.fall.ort» und entfernt danach den Eintrag des Übergangs. «Eingaben verwerfen» bzw. das Löschen aller Eingaben entfernt den Eintrag des
          Übergangs; alle Einträge löschst du über die Website-Daten dieser Seite in den Browser-Einstellungen. An keinen Dienst
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
          IP-Adresse abgeleitet), nicht deine Eingaben oder Ergebnisse.
          GitHub Pages protokolliert zudem Zugriffe (IP-Adresse, Browser), wie jeder Webserver.</li>
      </ul>
    </details>
  )
}

/** Fusszeile: Lizenz und Quellcode */
export function Fusszeile() {
  return (
    <footer className="fuss klein">
      fgsCheck Beta v{__APP_VERSION__} · Code unter <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer">MIT</a>, eigene Inhalte unter{' '}
      <a href="https://creativecommons.org/licenses/by/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>{' '}
      (eingebundene Daten behalten ihre eigenen Lizenzen) ·{' '}
      <a href="https://github.com/pnfzygrzgf-svg/fgsCheck" target="_blank" rel="noopener noreferrer">Quellcode auf GitHub</a> · Vibecoding. Don't trust, verify!
      {' '}· <a href="https://ko-fi.com/pnfzygrzgfsvg" target="_blank" rel="noopener noreferrer">Unterstützen ↗</a>
    </footer>
  )
}
