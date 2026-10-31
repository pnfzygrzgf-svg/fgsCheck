// ── «Datenlage hier» und Quellen-Tabellen aus dem Quellenregister (30.10.2026) ──
//
// Satz zur Datenlage am Ort mit aufklappbarer Tabelle je Thema (Reiter «Bedarf und Querungstyp», «Geladene Quellen»), Tabelle der
// genutzten Quellen im Bericht und Zuordnung der Fall-Quellen bzw. der Ladezustände zu den Einträgen des Registers.

import { BERN_C_KEYS, BERN_DIENSTE_C } from './daten/bernDienste'
import { HALT_QUELLE_ID } from './daten/haltestellen'
import { VD_QUELLE_ID } from './daten/verkehrsdaten'
import { PARKKATASTER } from './daten/parkkataster'
import { BAUMKATASTER } from './daten/baumkataster'
import { datenlageSatz, datenlageZeilen, quelle, quellenFuer, THEMA_NAME, THEMEN, type Datenlage, type Quelle } from './daten/quellenregister'
import { wgs } from './geo'

/** Schlüssel in Fall.quellen bzw. in «Geladene Quellen» -> Kennung im Register */
export const QUELLE_JE_SCHLUESSEL: Readonly<Record<string, string>> = {
  av: 'av', sosf: 'av', osm: 'osm', suche: 'osm', luftbild: 'swissimage', hoehen: 'swissalti', hoehenSicht: 'swissalti',
  kataster: BAUMKATASTER[0].quelleId, baumkataster: BAUMKATASTER[0].quelleId, parkkataster: PARKKATASTER[0].quelleId,
  haltestellen: HALT_QUELLE_ID, verkehrsdaten: VD_QUELLE_ID,
  ...Object.fromEntries(BERN_C_KEYS.map(k => [k, BERN_DIENSTE_C[k].quelleId])),
}

/** Kennungen der genutzten Quellen eines Falls (Fall.quellen, Übergang aus dem Luftbild, Höhenprofile), ohne Doppel */
export function genutzteQuellen(quellen: Readonly<Record<string, unknown>>, zusatz: { herkunftP?: [number, number] | null; hoehen?: boolean } = {}): string[] {
  const ids = Object.keys(quellen).map(k => QUELLE_JE_SCHLUESSEL[k]).filter((x): x is string => !!x)
  if (zusatz.herkunftP) {
    // Snapshot der Stadt, deren Rechteck die Lage des Übergangs enthält
    const [lat, lon] = wgs(zusatz.herkunftP[0], zusatz.herkunftP[1])
    const q = quellenFuer({ lat, lon }).find(x => x.themen.includes('fgsLuftbild'))
    if (q) ids.push(q.id)
  }
  if (zusatz.hoehen) ids.push('swissalti')
  return [...new Set(ids)]
}

export type QuellZustand = 'geladen' | 'Fehler' | 'lädt'
/** Ladezustand je Kennung aus den Zeilen von «Geladene Quellen» (Fehler vor lädt vor geladen) */
export function zustandJeQuelle(stand: Readonly<Record<string, { objekte?: string; ms?: number; fehler?: string }>>): Record<string, QuellZustand> {
  const aus: Record<string, QuellZustand> = {}
  const rang: Record<QuellZustand, number> = { Fehler: 0, 'lädt': 1, geladen: 2 }
  for (const [k, q] of Object.entries(stand)) {
    const id = QUELLE_JE_SCHLUESSEL[k]
    if (!id) continue
    const z: QuellZustand = q.fehler ? 'Fehler' : q.objekte !== undefined || q.ms !== undefined ? 'geladen' : 'lädt'
    if (!aus[id] || rang[z] < rang[aus[id]]) aus[id] = z
  }
  return aus
}

/** Kurzzeile Anbieter · Lizenz · Stand eines Eintrags */
export const quelleInfo = (q: Quelle): string => [q.anbieter, q.lizenz, q.stand].filter(Boolean).join(' · ')

/** Tabelle je Thema: Quelle, Anbieter, Stand, Lizenz (mit Ladezustand, wenn gegeben) */
export function DatenlageTabelle({ lage, zustand }: { lage: Datenlage; zustand?: Readonly<Record<string, QuellZustand>> }) {
  return (
    <div className="tabelle-rahmen"><table className="quellen-tabelle datenlage-tabelle">
      <thead><tr><th>Thema</th><th>Quelle</th><th>Anbieter</th><th>Stand</th><th>Lizenz</th>{zustand && <th>Zustand</th>}</tr></thead>
      <tbody>{datenlageZeilen(lage).map(({ thema, quelle: q }) => <tr key={thema}>
        <td>{THEMA_NAME[thema]}</td>
        {q ? <><td>{q.name}{q.hinweis && <div className="klein">{q.hinweis}</div>}</td><td>{q.anbieter}</td><td>{q.stand ?? '–'}</td><td>{q.lizenz}</td></>
          : <td colSpan={4}>keine Quelle: Angabe von Hand</td>}
        {zustand && <td className={q && zustand[q.id] === 'Fehler' ? 'fehler' : undefined}>{q ? zustand[q.id] ?? '–' : '–'}</td>}
      </tr>)}</tbody>
    </table></div>
  )
}

/** «Datenlage hier: …» mit aufklappbaren Details (Tabelle je Thema) */
export function DatenlageZeile({ lage, zustand }: { lage: Datenlage; zustand?: Readonly<Record<string, QuellZustand>> }) {
  return (
    <div className="datenlage klein">
      <p className="datenlage-satz">{datenlageSatz(lage)}</p>
      <details className="datenlage-details">
        <summary>Details</summary>
        <DatenlageTabelle lage={lage} zustand={zustand} />
      </details>
    </div>
  )
}

/** Bericht (Quellen): nur die genutzten Quellen, je Quelle Themen, Anbieter, Stand, Lizenz */
export function BerichtQuellenTabelle({ ids, lage }: { ids: readonly string[]
  /** Datenlage am Ort: «Für» nennt nur die Themen, für die die Quelle dort massgebend ist */
  lage?: Datenlage | null }) {
  const qs = ids.map(quelle).filter((q): q is Quelle => !!q)
  if (!qs.length) return null
  return (
    <table className="quellen-tabelle bericht-quellen">
      <thead><tr><th>Quelle</th><th>Für</th><th>Anbieter</th><th>Stand</th><th>Lizenz</th></tr></thead>
      <tbody>{qs.map(q => <tr key={q.id}><td>{q.name}</td>
        <td>{THEMEN.filter(t => q.themen.includes(t) && (!lage || lage[t]?.id === q.id)).map(t => THEMA_NAME[t]).join(', ') || '–'}</td>
        <td>{q.anbieter}</td><td>{q.stand ?? '–'}</td><td>{q.lizenz}</td></tr>)}</tbody>
    </table>
  )
}
