// ── Quelle einer Kartenebene aufrufen (06.11.2026): Link je Ebene und je Unfall ──
//
// Gleiche Datei in fgsCheck, SichtweitenCheck und VeloroutenCheck. Die Adresse kommt aus der Kennung der Ebene, sonst aus dem Quellentext,
// sonst aus der Adresse des Dienstes. Links auf map.geo.admin.ch öffnen beim Klick an der Stelle, die die Karte gerade zeigt.

const GEO = 'https://map.geo.admin.ch/#/map?lang=de'
const geoLayer = (layer: string) => `${GEO}&layers=${layer}`
const unfaelle = (art: string) => geoLayer(`ch.astra.unfaelle-personenschaeden_${art}@year=all`)
const bern = (produkt: string) => `https://map.bern.ch/geoportal/#/produkt/${produkt}`

const NACH_ID: Record<string, string> = {
  unfaelleFuss: unfaelle('fussgaenger'), unfaelleVelo: unfaelle('fahrraeder'), 'regional.bund.unfaelle': unfaelle('alle'),
  'astra.alle': unfaelle('alle'), 'astra.fussgaenger': unfaelle('fussgaenger'), 'astra.fahrraeder': unfaelle('fahrraeder'),
  bav: geoLayer('ch.bav.haltestellen-oev'), npvm: geoLayer('ch.are.belastung-personenverkehr-strasse'),
  tramTlm: geoLayer('ch.swisstopo.swisstlm3d-eisenbahnnetz'), strasseTlm: geoLayer('ch.swisstopo.swisstlm3d-strassen'), bauzonen: geoLayer('ch.are.bauzonen'), av: 'https://www.geodienste.ch/services/av',
  blockmodelle: 'https://public.geo.lu.ch/ogd/rest/services/managed/GEBHOHEN_DS_V5_MP/MapServer',
}
const NACH_TEXT: [RegExp, string][] = [
  [/(Stadt Bern).*(Signalisierte|Tempo)/, bern('Signalisierte_Hoechstgeschwindigkeit')],
  [/(Stadt Bern).*Verkehrsdaten/, bern('Flaechendeckende_Verkehrsdaten')],
  [/(Stadt Bern).*(Strassenhierarchie|Strassentyp)/, bern('Strassentypen')],
  [/(Stadt Bern).*Nutzungszonen/, bern('Nutzungszonenplan')],
  [/(Stadt Bern).*ÖV-Linien/, bern('OeV_Linien')],
  [/(Stadt Bern).*Haltestellen/, bern('Haltestellen')],
  [/(Stadt Bern).*Baumkataster/, bern('Baumkataster')],
  [/(Stadt Bern).*(Parkpl|Parkfeld)/, bern('Parkplaetze_oeffentlich')],
  [/(Stadt Bern).*Richtplan/, bern('Richtplan_Fussverkehr')],
  [/(Stadt Bern).*Taktil/, bern('Taktil_visuelle_Markierungen')],
  [/Stadt Bern/, 'https://map.bern.ch/geoportal/'],
  [/Amtliche Vermessung|geodienste/i, NACH_ID.av],
  [/Stadt Zürich/, 'https://data.stadt-zuerich.ch/'],
  [/Kanton Zürich/, 'https://maps.zh.ch/'],
  [/Basel-Stadt|data\.bs\.ch/, 'https://data.bs.ch/'],
  [/Stadt Luzern/, 'https://map.stadtluzern.ch/'],
  [/SITG/, 'https://sitg.ge.ch/'],
  [/swisstopo|swissALTI3D|swissTLM3D/, 'https://www.swisstopo.admin.ch/'],
  [/OpenStreetMap/, 'https://www.openstreetmap.org/'],
]

/** Seite eines Dienstes: bei Opendatasoft der Datensatz, sonst die Adresse des Anbieters */
function dienstSeite(url: string): string | null {
  try {
    const u = new URL(url), ds = u.pathname.match(/\/catalog\/datasets\/([^/]+)/)?.[1]
    return ds ? `${u.origin}/explore/dataset/${ds}/` : u.origin + '/'
  } catch { return null }
}

/** Adresse der Quelle; null, wenn keine bekannt ist (kein Link statt eines falschen) */
export function ebenenQuelleUrl(id: string, text: string, dienstUrl?: string): string | null {
  if (id === 'av' && text.includes('Stadt Luzern')) return 'https://map.stadtluzern.ch/'
  if (NACH_ID[id]) return NACH_ID[id]
  const d = /data\.bs\.ch (\d{6})/.exec(text)
  if (d) return `https://data.bs.ch/explore/dataset/${d[1]}/`
  return NACH_TEXT.find(([re]) => re.test(text))?.[1] ?? (dienstUrl ? dienstSeite(dienstUrl) : null)
}

export interface Stelle { lat: number; lon: number; e: number; n: number }
const OSM = 'https://www.openstreetmap.org/'
/** an der Stelle öffnen, wo die Quelle das erlaubt; andere Adressen bleiben */
export function anDerStelle(url: string, m: Stelle | null): string {
  if (!m) return url
  if (url.startsWith(GEO)) return url.replace(GEO, `${GEO}&center=${Math.round(m.e)},${Math.round(m.n)}&z=10`)
  return url === OSM ? `${OSM}#map=18/${m.lat.toFixed(5)}/${m.lon.toFixed(5)}` : url
}

/** Link am Eintrag im Fenster «Kartenebenen»; mitte: Kartenmitte zum Zeitpunkt des Klicks */
export function QuelleLink({ url, mitte }: { url: string | null; mitte: () => Stelle | null }) {
  if (!url) return null
  return <a className="quelle-link" href={url} target="_blank" rel="noopener noreferrer"
    onClick={e => { e.currentTarget.href = anDerStelle(url, mitte()) }}>Quelle&nbsp;↗</a>
}

const OSM_KNOTEN = /^(?:vt|lsa|ue|lampe|h:osm):(\d+)$/, OSM_WEG = /^(?:hw|osm|vf|tr|lit|pr):(\d+)$/, OSM_MIT_TYP = /:(node|way|relation)\/(\d+)$/
const BUND_OBJEKT: Record<string, string> = { bav: 'ch.bav.haltestellen-oev', npvm: 'ch.are.belastung-personenverkehr-strasse' }
/** Quelle eines einzelnen Objekts: das Objekt selbst, wo die Quelle das erlaubt (OpenStreetMap, Karte des Bundes), sonst die Ebene an der Stelle */
export function objektQuelleUrl(o: { id: string; text: string; quelle?: string; profil?: true }, ebene: string, ebeneUrl: string | null, m: Stelle): string | null {
  if (`${o.quelle ?? ''} ${o.text}`.includes('OpenStreetMap') && !o.profil) {
    const k = OSM_KNOTEN.exec(o.id), w = OSM_WEG.exec(o.id), t = OSM_MIT_TYP.exec(o.id)
    if (k) return `${OSM}node/${k[1]}`
    if (w) return `${OSM}way/${w[1]}`
    if (t) return `${OSM}${t[1]}/${t[2]}`
  }
  if (BUND_OBJEKT[ebene]) return `${GEO}&center=${Math.round(m.e)},${Math.round(m.n)}&z=8&layers=${BUND_OBJEKT[ebene]}@features=${encodeURIComponent(o.id.startsWith('bav:k:') ? o.id.slice(6) : o.id.split(':').pop()!)}`
  return ebeneUrl ? anDerStelle(ebeneUrl, m) : null
}

/** ein Unfall auf der Seite der Quelle, markiert */
export const unfallUrl = (id: string, p: readonly [number, number], art: 'alle' | 'fussgaenger' | 'fahrraeder'): string =>
  `${GEO}&center=${Math.round(p[0])},${Math.round(p[1])}&z=8&topic=ech&layers=ch.astra.unfaelle-personenschaeden_${art}@year=all@features=${encodeURIComponent(id)}` +
  '&bgLayer=ch.swisstopo.pixelkarte-farbe'

export const maskiert = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
/** Teile eines Objekttexts: getrennt durch «;» oder « · », nicht innerhalb von Klammern */
function textTeile(text: string): string[] {
  const teile: string[] = []
  let tiefe = 0, aktuell = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i], punkt = text.startsWith(' · ', i)
    if (c === '(') tiefe++
    else if (c === ')') tiefe = Math.max(0, tiefe - 1)
    if (!tiefe && (c === ';' || punkt)) { teile.push(aktuell); aktuell = ''; if (punkt) i += 2 } else aktuell += c
  }
  return [...teile, aktuell].map(s => s.trim()).filter(s => s)
}
const TITEL_MAX = 45

/** Tooltip und Fenster aller Ebenen: Titel fett, Angaben je Zeile darunter, wie bei den Unfällen. Ein kurzer Titel vor dem ersten Doppelpunkt steht für sich */
export function objektHtml(text: string): string {
  const [erster = '', ...rest] = textTeile(text), d = erster.indexOf(': ')
  const [titel, ...angaben] = d > 0 && d <= TITEL_MAX ? [erster.slice(0, d), erster.slice(d + 2), ...rest] : [erster, ...rest]
  return [`<b>${maskiert(titel)}</b>`, ...angaben.map(maskiert)].join('<br>')
}

/** Inhalt des Fensters beim Klick auf ein Objekt */
export const objektFenster = (text: string, url: string): string =>
  `${objektHtml(text)}<br><a href="${maskiert(url)}" target="_blank" rel="noopener noreferrer">Quelle ↗</a>`

/** Unfälle zeigen die Rechner mit dem Kartenbild der Quelle, also mit deren Formen und Farben; die Punkte dienen nur Tooltip und Klick */
export const UNFALL_EBENE: Record<string, string> = { unfaelleFuss: 'ch.astra.unfaelle-personenschaeden_fussgaenger', unfaelleVelo: 'ch.astra.unfaelle-personenschaeden_fahrraeder',
  'regional.bund.unfaelle': 'ch.astra.unfaelle-personenschaeden_alle' }
export const unfallKacheln = (layer: string) => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/99990101/3857/{z}/{x}/{y}.png`
/** Farben wie im Kartenbild der Quelle. Deren eigene Legende ist ein Bild in vier Sprachen und im Panel nicht lesbar */
const UNFALL_TYPEN: readonly (readonly [string, string])[] = [['#ff75ff', 'Schleuder- oder Selbstunfall'], ['#4747ff', 'Überholunfall oder Fahrstreifenwechsel'], ['#339900', 'Auffahrunfall'],
  ['#99ffff', 'Abbiegeunfall'], ['#00bac8', 'Einbiegeunfall'], ['#cc6600', 'Überqueren der Fahrbahn'], ['#a7ffa7', 'Frontalkollision'], ['#d1d1d1', 'Parkierunfall'],
  ['#ffff00', 'Fussgängerunfall'], ['#cc9900', 'Tierunfall'], ['#808080', 'Andere']]
const strich = { stroke: '#111827', strokeWidth: 1.5 }
const Quadrat = ({ farbe, kreuz }: { farbe?: string; kreuz?: boolean }) => <svg viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" fill={farbe ?? 'none'} {...strich} />{kreuz && <path d="M7 1.5v11M1.5 7h11" fill="none" {...strich} />}</svg>
export function UnfallLegende() {
  return <span className="unfall-legende">
    <b>Form: Schwere</b>
    <span className="unfall-formen"><span><Quadrat kreuz />Getötete</span><span><Quadrat />Schwerverletzte</span>
      <span><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5 12.8 12.5H1.2Z" fill="none" {...strich} /></svg>Leichtverletzte</span></span>
    <b>Farbe: Unfalltyp, unabhängig von der Ebene</b>
    <span>{UNFALL_TYPEN.map(([farbe, text]) => <span key={text}><Quadrat farbe={farbe} />{text}</span>)}</span>
  </span>
}
