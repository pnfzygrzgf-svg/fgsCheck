import { REGIONAL_DIENSTE } from './daten/anbieter/gemeinsam/regionalDienste'
import { alphabetisch } from './daten/anbieter/gemeinsam/sortierung'
// ── «Datenlage hier» und Quellen-Tabellen aus dem Quellenregister (30.10.2026) ──
//
// Satz zur Datenlage am Ort mit aufklappbarer Tabelle je Thema (Reiter «Bedarf und Querungstyp», «Geladene Quellen»), Tabelle der
// genutzten Quellen im Bericht und Zuordnung der Fall-Quellen bzw. der Ladezustände zu den Einträgen des Registers.

import { BERN_C_KEYS, BERN_DIENSTE_C } from './daten/bernDienste'
import { HALT_QUELLE_ID } from './daten/haltestellen'
import { VD_QUELLE_ID } from './daten/verkehrsdaten'
import { PARKKATASTER } from './daten/parkkataster'
import { BAUMKATASTER } from './daten/baumkataster'
import { ABRUF_BEIM_LADEN, datenlageSatz, datenlageZeilen, quelle, quellenFuer, THEMA_NAME, THEMEN, type Datenlage, type Quelle } from './daten/quellenregister'
import { wgs } from './geo'
import { quellenQualitaetText, type QuellenQualitaet } from './daten/anbieter/gemeinsam/qualitaet'
import { LUZERN_NAME } from './daten/ersatzLuzern'
import { ZH_PARK_SCHLUESSEL } from './daten/anbieter/gemeinsam/parkZuerich'

/** Schlüssel in Fall.quellen bzw. in «Geladene Quellen» -> Kennung im Register */
export const QUELLE_JE_SCHLUESSEL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(REGIONAL_DIENSTE.map(d => [`regional.${d.id}`, `regional.${d.id}`])),
  hoehenkurven: 'hoehenkurven', av: 'av', sosf: 'av', osm: 'osm', suche: 'osm', luftbild: 'swissimage', hoehen: 'swissalti', hoehenSicht: 'swissalti',
  hoehenBern: 'bern.dtm', hoehenSichtBern: 'bern.dtm',
  kataster: BAUMKATASTER[0].quelleId, baumkataster: BAUMKATASTER[0].quelleId, parkkataster: PARKKATASTER[0].quelleId,
  haltestellen: HALT_QUELLE_ID, verkehrsdaten: VD_QUELLE_ID,
  zhTempo: 'zh.tempo', zhZonen: 'zh.zone', [ZH_PARK_SCHLUESSEL]: 'zh.park', 'zh.dtv': 'zh.dtv', 'lu.dtv': 'lu.dtv', 'bs.dtv': 'bs.dtv', npvm: 'are.npvm', bav: 'bav.halt', gebiet: 'swisstopo.gebiet',
  ...Object.fromEntries(BERN_C_KEYS.map(k => [k, BERN_DIENSTE_C[k].quelleId])),
}

/** Kennung im Register; in der Stadt Luzern stehen unter denselben Schlüsseln die Ersatzquellen */
const kennung = (k: string, wert: unknown): string | undefined => {
  const t = typeof wert === 'string' ? wert : String((wert as { name?: unknown } | null)?.name ?? '')
  return k === 'av' && t.startsWith(LUZERN_NAME) ? 'lu.boden' : k === 'parkkataster' && t.includes('Luzern') ? 'lu.park' : QUELLE_JE_SCHLUESSEL[k]
}

/** Kennungen der genutzten Quellen eines Falls (Fall.quellen, Übergang aus dem Luftbild, Höhendienste der Profile), ohne Doppel */
export function genutzteQuellen(quellen: Readonly<Record<string, unknown>>, zusatz: { herkunftP?: [number, number] | null; hoehen?: readonly string[] } = {}): string[] {
  const ids = Object.entries(quellen).map(([k, v]) => kennung(k, v)).filter((x): x is string => !!x)
  if (ids.includes('lu.boden')) ids.push('lu.gebaeude')
  if (zusatz.herkunftP) {
    // Snapshot der Stadt, deren Rechteck die Lage des Übergangs enthält
    const [lat, lon] = wgs(zusatz.herkunftP[0], zusatz.herkunftP[1])
    const q = quellenFuer({ lat, lon }).find(x => x.themen.includes('fgsLuftbild'))
    if (q) ids.push(q.id)
  }
  if (zusatz.hoehen) ids.push(...zusatz.hoehen)
  return [...new Set(ids)]
}

export type QuellZustand = 'geladen' | 'Fehler' | 'lädt'
/** Ladezustand je Kennung aus den Zeilen von «Geladene Quellen» (Fehler vor lädt vor geladen) */
export function zustandJeQuelle(stand: Readonly<Record<string, { objekte?: string; ms?: number; fehler?: string }>>): Record<string, QuellZustand> {
  const aus: Record<string, QuellZustand> = {}
  const rang: Record<QuellZustand, number> = { Fehler: 0, 'lädt': 1, geladen: 2 }
  for (const [k, q] of Object.entries(stand)) {
    const id = kennung(k, q)
    if (!id) continue
    const z: QuellZustand = q.fehler ? 'Fehler' : q.objekte !== undefined || q.ms !== undefined ? 'geladen' : 'lädt'
    if (!aus[id] || rang[z] < rang[aus[id]]) aus[id] = z
  }
  return aus
}

/** Qualität je Registerquelle; ein Umkreisabruf geht der vorgelagerten Ausschnittsuche vor. */
export function qualitaetJeQuelle(stand: Readonly<Record<string, QuellenQualitaet>>): Record<string, QuellenQualitaet> {
  const aus: Record<string, QuellenQualitaet> = {}
  for (const [k, q] of Object.entries(stand)) {
    const id = kennung(k, q) ?? (k.startsWith('eth.fgs.') ? k : undefined)
    if (id && (q.datenstand || q.vollstaendigkeit) && (k !== 'suche' || !aus[id])) aus[id] = q
  }
  return aus
}

/** Kurzzeile Anbieter · Lizenz · Stand eines Eintrags */
export const quelleInfo = (q: Quelle): string => [q.anbieter, q.lizenz, q.stand].filter(Boolean).join(' · ')

/** Tabelle je Thema: Quelle, Anbieter, Stand, Lizenz (mit Ladezustand, wenn gegeben) */
export function DatenlageTabelle({ lage, zustand, qualitaet = {} }: { lage: Datenlage; zustand?: Readonly<Record<string, QuellZustand>>; qualitaet?: Readonly<Record<string, QuellenQualitaet>> }) {
  return (
    <div className="tabelle-rahmen"><table className="quellen-tabelle datenlage-tabelle">
      <thead><tr><th>Thema</th><th>Quelle</th><th>Anbieter</th><th>Stand</th><th>Lizenz</th>{zustand && <th>Zustand</th>}</tr></thead>
      <tbody>{datenlageZeilen(lage).sort((a, b) => alphabetisch(THEMA_NAME[a.thema], THEMA_NAME[b.thema])).map(({ thema, quelle: q }) => <tr key={thema}>
        <td>{THEMA_NAME[thema]}</td>
        {q ? <><td>{q.name}{q.hinweis && <div className="klein">{q.hinweis}</div>}</td><td>{q.anbieter}</td><td>{q.stand ?? '–'}<div className="klein">{quellenQualitaetText(qualitaet[q.id])}</div></td><td>{q.lizenz}</td></>
          : <td colSpan={4}>keine Quelle: Angabe von Hand</td>}
        {zustand && <td className={q && zustand[q.id] === 'Fehler' ? 'fehler' : undefined}>{q ? zustand[q.id] ?? '–' : '–'}</td>}
      </tr>)}</tbody>
    </table></div>
  )
}

/** «Datenlage hier: …» mit aufklappbaren Details (Tabelle je Thema) */
export function DatenlageZeile({ lage, zustand, qualitaet = {} }: { lage: Datenlage; zustand?: Readonly<Record<string, QuellZustand>>; qualitaet?: Readonly<Record<string, QuellenQualitaet>> }) {
  return (
    <div className="datenlage klein">
      <p className="datenlage-satz">{datenlageSatz(lage)}</p>
      <details className="datenlage-details">
        <summary>Details</summary>
        <DatenlageTabelle lage={lage} zustand={zustand} qualitaet={qualitaet} />
      </details>
    </div>
  )
}

/** Produktnamen des Geoportals schreiben Umlaute aus; im Bericht stehen sie richtig */
const produktNamen = (t: string): string => t.replace('Kindergaerten', 'Kindergärten').replace('Kindertagesstaetten', 'Kindertagesstätten').replace('Spitaeler', 'Spitäler')

/** Adresse einer Quelle für den Link im Bericht (Firefox übernimmt ihn ins PDF) */
const quelleUrl = (q: Quelle): string | undefined => ({ 'zh.park': 'https://data.stadt-zuerich.ch/dataset/geo_oeffentlich_zugaengliche_parkplaetze_dav', 'zh.dtv': 'https://maps.zh.ch/',
  'lu.dtv': 'https://map.stadtluzern.ch/', 'bs.dtv': 'https://data.bs.ch/', 'lu.boden': 'https://map.stadtluzern.ch/', 'lu.park': 'https://map.stadtluzern.ch/', 'lu.gebaeude': 'https://public.geo.lu.ch/ogd/rest/services/managed/GEBHOHEN_DS_V5_MP/MapServer', av: 'https://www.geodienste.ch/', osm: 'https://www.openstreetmap.org/',
  swissimage: 'https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm', swissalti: 'https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d' } as Record<string, string>)[q.id] ??
  (q.anbieter.includes('Stadt Bern') ? 'https://map.bern.ch/' : undefined)

/** Bericht (Quellen): nur die genutzten Quellen, je Quelle Themen, Anbieter, Stand, Lizenz */
export function BerichtQuellenTabelle({ ids, lage, qualitaet = {}, gruende }: { ids: readonly string[]; qualitaet?: Readonly<Record<string, QuellenQualitaet>>
  /** Quellen ohne verwendbaren Treffer: je Kennung der Grund (Spalte «Grund» statt «Für») */
  gruende?: Readonly<Record<string, string>>
  /** Datenlage am Ort: «Für» nennt nur die Themen, für die die Quelle dort massgebend ist */
  lage?: Datenlage | null }) {
  const fuer = (q: Quelle) => THEMEN.filter(t => q.themen.includes(t) && (!lage || lage[t]?.id === q.id)).map(t => THEMA_NAME[t]).join(', ') ||
    (q.id.startsWith('regional.e6.') || q.id === 'hoehenkurven' ? 'nur Kartenkontext' : '–')
  const qs = ids.map(quelle).filter((q): q is Quelle => !!q).sort((a, b) => alphabetisch(fuer(a), fuer(b)))
  if (!qs.length) return null
  /** Stand der Quelle; «Abruf beim Laden» mit der Abrufzeit, wenn sie bekannt ist */
  const stand = (q: Quelle) => { const z = (qualitaet[q.id] as { zeit?: string } | undefined)?.zeit
    return z && q.stand === ABRUF_BEIM_LADEN ? `Abruf ${new Date(z).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : q.stand ?? '–' }
  return (
    <table className="quellen-tabelle bericht-quellen">
      <thead><tr><th>Quelle</th><th>{gruende ? 'Grund' : 'Für'}</th><th>Anbieter</th><th>Stand</th><th>Lizenz</th></tr></thead>
      <tbody>{qs.map(q => <tr key={q.id}><td>{quelleUrl(q) ? <a href={quelleUrl(q)}>{q.name}</a> : q.name}</td>
        <td>{gruende ? gruende[q.id] : fuer(q)}</td>
        <td>{q.anbieter}</td><td>{stand(q)}<div className="klein">{produktNamen(quellenQualitaetText(qualitaet[q.id]))}</div></td><td>{q.lizenz}</td></tr>)}</tbody>
    </table>
  )
}
