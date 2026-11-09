import type { Hindernis } from './rechner/hindernisse'
import { PARK_GRUNDLAGE, PARK_SN, PARK_ZH, PARK_BE_AUTO, PARK_BE_VELO, PARK_ANORDNUNG_TEXT, parkAnordnungLesen, parkMitAnordnung } from './rechner/parkgeometrie'

export function ParkGrundlagen() {
  return <div className="klein"><p><b>Parkplatzgeometrie und Parkstreifenabzug:</b> {PARK_GRUNDLAGE}</p>
    <p>Schmalere Katasterflächen werden bei eindeutig zugeordneter Längsparkierung bzw. bekannter Zweirad-Anordnung nur zur Fahrbahn hin ergänzt. Die gegenüberliegende
      Begrenzung bleibt erhalten. Bei unklarer Geometrie oder Fahrbahnseite bleibt der Originalumriss mit Hinweis bestehen.
      Parkverbotsfelder werden wie belegte Auto-Parkfelder für Sichtverdeckung und Parkstreifenerkennung berücksichtigt und nach derselben Mindestbreitenregel ergänzt. Die Bezeichnung bleibt erhalten. Die Prüffläche gilt für Rechnung und Darstellung. Grau gestrichelt: ursprünglicher Katasterumriss einer ergänzten Fläche.</p></div>
}

/** Dieselbe Tabelle im Panel und Bericht. Nur in der Rechnung verwendete Objekte, Originalgeometrien bleiben im Fall. */
export function ParkAnnahmen({ felder = [], bericht = false, anordnungSetzen }: { felder?: readonly Hindernis[]; bericht?: boolean; anordnungSetzen?: (h: Hindernis) => void }) {
  const gesehen = new Set<string>()
  const pp = felder.flatMap(h => {
    if (h.art !== 'parkfeld' || !h.parkPruefung || gesehen.has(h.id)) return []
    gesehen.add(h.id); return [{ h, p: h.parkPruefung }]
  })
  if (!pp.length) return null
  const f = (n: number | null) => n === null ? 'unbekannt' : `${n.toFixed(2).replace('.', ',')} m`
  const inhalt = <><p className="klein">Breiten sind aus den Katasterpolygonen abgeleitet (Autos: quer zur Längsrichtung; Zweiradflächen: Tiefe quer zur Strasse), keine
    Messung vor Ort. Auto- und Parkverbotsfelder gelten als belegt; Velo-/Mofa- und Motorradflächen bleiben nur Hinweis für die Sichtprüfung. Erkannte Parkstreifen können die Fahrlinie
    verschieben; der angewendete Abzug steht bei der jeweiligen Zufahrt. Grau gestrichelt: ursprünglicher Katasterumriss einer ergänzten Fläche. Überdeckungen durch Plan-Seitenräume werden danach abgezogen.</p>
    <div className="tabelle-rahmen"><table className="quellen-tabelle bericht-tabelle"><thead><tr><th>Parkplatz</th><th>Katasterbreite</th>
      <th>Prüfbreite</th><th>Anpassung / Hinweis</th><th>Grundlage</th></tr></thead><tbody>{pp.map(({ h, p }) => <tr key={h.id}>
        <td>{h.name ?? h.id}{h.klasse !== 'auto' && <div className="klein">{h.klasse === 'velo' ? 'Velo/Mofa' : 'Motorrad'} – nur Hinweis</div>}</td><td>{f(p.katasterBreite)}</td><td>{f(p.pruefBreite)}</td>
        <td>{p.status === 'ergaenzt' ? `Um ${f(p.ergaenzung)} zur Fahrbahn hin ergänzt` : p.status === 'unklar' ? p.hinweis : 'Originalumriss unverändert'}
          {h.klasse === 'motorrad' && !bericht && anordnungSetzen && <label className="klein" style={{ display: 'block', marginTop: 6 }}>Motorrad-Anordnung
            <select aria-label={`Motorrad-Anordnung ${h.name ?? h.id}`} value={h.parkAnordnung ?? ''}
              onChange={e => anordnungSetzen(parkMitAnordnung(h, parkAnordnungLesen(e.target.value)))}>
              <option value="">Unklar – Originalumriss</option>{Object.entries(PARK_ANORDNUNG_TEXT).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            </select></label>}</td>
        <td>{p.regel.grundlage}<div className="klein">Vorgabe {f(p.regel.breite)}, {p.regel.gebiet}</div></td></tr>)}</tbody></table></div></>
  return bericht ? <div className="druck-block"><h3>Parkflächen: Annahmen und Katasterumrisse</h3>{inhalt}</div>
    : <details className="hilfe"><summary>Parkflächen: Annahmen und Katasterumrisse ({pp.length})</summary>{inhalt}</details>
}

export function ParkQuellen() {
  return <ul className="klein"><li>{PARK_SN}, Tabelle 2, gültig ab 1. Februar 2006 (Längsparkfelder A/B: 1,90 m; C: 2,00 m). Herausgeber: VSS.
    Verwendung als dokumentierte Modellgrundlage, keine Prüfung der heutigen Normkonformität.</li>
    <li>{PARK_ZH}, Kapitel 4.1 (2,00 m; Geltungsbereich Staatsstrassen). Anwendung im ganzen Kanton als Modellannahme.</li>
    <li>{PARK_BE_AUTO}: Auto-Längsparkfelder und Parkverbotsfelder 1,90 m.</li>
    <li>{PARK_BE_VELO}: Velo/Mofa 1,90 m; Motorräder längs 1,20 m, senkrecht 2,30 m, schräg 45° 1,90 m. Ausserhalb Berns als Modellannahme.</li></ul>
}
