import { holeJson, holeText, AbrufFehler } from '../../holen'
import type { QuellenQualitaet } from './qualitaet'

export const BERN_PRODUKT_URL = 'https://map.bern.ch/geoportal/rest/api/GeoDataSet/read_produkt.php'
export const AV_STAENDE_URL = 'https://www.geodienste.ch/info/services.csv?base_topics=av&language=de'
const BERN_PRODUKTE: Record<string, string[]> = {
  haltestellen: ['Haltestellen'], verkehrsdaten: ['Flaechendeckende_Verkehrsdaten'], richtplan: ['Richtplan_Fussverkehr'],
  strassenhierarchie: ['Strassentypen'], vsig: ['Signalisierte_Hoechstgeschwindigkeit'],
  schulen: ['Volksschulen', 'Kindergaerten', 'Kindertagesstaetten', 'Kinderangebote', 'Heime', 'Spitaeler'],
  taktil: ['Taktil_visuelle_Markierungen'], nutzungszonen: ['Nutzungszonenplan'], oevLinien: ['OeV_Linien'],
  parkkataster: ['Parkplaetze_oeffentlich'], kataster: ['Baumkataster'], baumkataster: ['Baumkataster'],
  hoehenBern: ['DTM_2023'], hoehenSichtBern: ['DTM_2023'],
}
export const bernProduktUrl = (name: string) => `${BERN_PRODUKT_URL}?name=${encodeURIComponent(name)}`

export function bernProduktStand(roh: unknown, name: string): string | undefined {
  const r = roh as { produktname?: unknown; letzte_aktualisierung?: unknown } | null
  const d = r?.letzte_aktualisierung
  if (r?.produktname !== name || typeof d !== 'string' || !/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return undefined
  const iso = d.split('.').reverse().join('-'), date = new Date(iso)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? `${d} (Produktaktualisierung)` : undefined
}

/** CSV mit Anführungszeichen, Zeilenumbrüchen in Feldern und doppelten Anführungszeichen (öffentlicher Geodienste-Export). */
function csvZeilen(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { if (quote && text[i + 1] === '"') { field += '"'; i++ } else quote = !quote }
    else if (!quote && (c === ';' || c === '\n')) {
      row.push(field.replace(/\r$/, '')); field = ''
      if (c === '\n') { rows.push(row); row = [] }
    } else field += c
  }
  if (quote) throw new AbrufFehler('AV-Metadaten: ungültiges CSV')
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  return rows
}
export function avPublikationsstaende(text: string, kantone: readonly string[]): QuellenQualitaet {
  const [kopf, ...zeilen] = csvZeilen(text), ids = ['base_topic', 'topic', 'canton', 'updated_at', 'cantonal_coverage'].map(k => kopf?.indexOf(k) ?? -1)
  if (ids.some(i => i < 0)) throw new AbrufFehler('AV-Metadaten: benötigte Spalten fehlen')
  const teile = [...new Set(kantone)].sort().map(k => {
    const rs = zeilen.filter(z => z[ids[0]] === 'av' && z[ids[1]] === 'av' && z[ids[2]] === k)
    const r = rs.length === 1 ? rs[0] : undefined, d = r?.[ids[3]]
    const date = d && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(d) ? new Date(`${d}Z`) : null
    const stand = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === d
      ? `${d!.slice(0, 10).split('-').reverse().join('.')} ${d!.slice(11)} (letzte kantonale Publikation)` : 'unbekannt'
    return { k, stand, komplett: r?.[ids[4]] === 'true' ? 'ja (kantonsweit gemäss Anbieter)' :
      r?.[ids[4]] === 'false' ? 'nein (Kanton nur teilweise publiziert)' : 'unbekannt' }
  })
  return { datenstand: teile.map(x => `${x.k}: ${x.stand}`).join('; ') || undefined,
    vollstaendigkeit: teile.map(x => `${x.k}: ${x.komplett}`).join('; ') || undefined }
}

/** Ein Metadatenabruf je Produkt und Ladeauftrag; neue Fälle leeren den Cache. Kein Einfluss auf die Rechnung. */
export class QuellenMetadaten {
  private cache = new Map<string, Promise<unknown>>()
  neu() { this.cache.clear() }
  private einmal<T>(url: string, laden: () => Promise<T>): Promise<T> {
    if (!this.cache.has(url)) this.cache.set(url, laden())
    return this.cache.get(url)! as Promise<T>
  }
  async laden(key: string, kantone: readonly string[] = []): Promise<QuellenQualitaet | null> {
    if ((key === 'av' || key === 'sosf') && kantone.length) {
      try {
        const text = await this.einmal(AV_STAENDE_URL, async () => {
          const [r, t] = await holeText(AV_STAENDE_URL, {}, 10000)
          if (!r.ok) throw new AbrufFehler(`AV-Metadaten HTTP ${r.status}`)
          return t
        })
        return avPublikationsstaende(text, kantone)
      } catch { return { datenstand: 'unbekannt (Publikationsmetadaten nicht verfügbar)' } }
    }
    const produkte = BERN_PRODUKTE[key]
    if (!produkte) return null
    const resultate = await Promise.all(produkte.map(async name => {
      try {
        const url = bernProduktUrl(name), r = await this.einmal(url, () => holeJson<unknown>(url, {}, 10000))
        return [name, bernProduktStand(r.daten, name) ?? 'unbekannt (kein Standdatum veröffentlicht)'] as const
      } catch { return [name, 'unbekannt (Produktmetadaten nicht verfügbar)'] as const }
    }))
    const datenstaende = Object.fromEntries(resultate)
    return { datenstand: key === 'strassenhierarchie' ? `Strassentypen: ${datenstaende.Strassentypen}; Strassenhierarchie: unbekannt` :
      produkte.length === 1 ? resultate[0][1] : resultate.map(([n, d]) => `${n}: ${d}`).join('; '), datenstaende }
  }
}
