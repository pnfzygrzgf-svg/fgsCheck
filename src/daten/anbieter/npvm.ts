import { holeBundText as holeText } from './gemeinsam/bundesAbruf'
import { lv95, type P } from '../../geo'
import { AbrufFehler, type Abruf } from '../holen'
import { eigenschaften, geoAdminUrl, istLv95, ladeGeoAdmin, type GeoAdminRoh } from './gemeinsam/geoAdmin'

export const NPVM_LAYER = 'ch.are.belastung-personenverkehr-strasse'
export const NPVM_METADATEN_URL = `https://api3.geo.admin.ch/rest/services/api/MapServer/${NPVM_LAYER}/legend?lang=de`
export const NPVM_QUELLENANGABE = '© ARE, Nationales Personenverkehrsmodell (NPVM) und Aggregierte Methode Güterverkehr (AMG)'
export const NPVM_RADIUS_M = 200
export const NPVM_QUELLE = {
  id: 'are.npvm', themen: ['dtv'] as ['dtv'], name: 'Verkehrsmenge (NPVM, modelliert)', anbieter: 'Bundesamt für Raumentwicklung (ARE)',
  gebiet: { art: 'schweiz' as const }, dienst: 'api' as const, lizenz: 'freie Nutzung mit Quellenangabe © ARE',
  stand: 'Bezugsjahr und Datenstand der Ebene aus offiziellen Metadaten; Abrufzeit je Fall', cors: true as const,
  empfaenger: 'swisstopo' as const, datenschutz: 'Rechteck ±200 m um den geladenen Ort für modellierte Verkehrsmengen sowie öffentliche Layer-Metadaten (api3.geo.admin.ch)',
  module: ['daten/anbieter/npvm.ts'], hinweis: 'Modellwerte, keine Zählung; kleine Strassen teilweise nicht im Netz. Zuordnung und Übernahme bestätigen.',
}
export interface NpvmLinie { id: string; nr: number; dtv: number | null; teile: P[][] }
export interface NpvmSnapshot {
  version: 1; quelleId: 'are.npvm'; abgerufen: string; datenstand: string | null; bezugsjahr: number | null
  datenstandQuelle: string; mitte: P; radiusM: number; url: string; vollstaendigkeit: 'unbekannt'; linien: NpvmLinie[]
}
export interface NpvmBeleg {
  version: 1; quelleId: 'are.npvm'; wert: number; linie: string; nr: number; bezugsjahr: number
  datenstand: string | null; abgerufen: string; url: string; achse: [P, P]
  bezug: 'summe_richtungen_je_modellstrecke'; zuordnung: 'achsenschnitt_und_osm_nähe'
}
export const npvmStandText = (s: Pick<NpvmSnapshot, 'datenstand'>) => s.datenstand?.split('-').reverse().join('.') ?? 'unbekannt'
export function npvmMetadaten(html: string): { datenstand: string | null; bezugsjahr: number | null } {
  const d = html.match(/<td[^>]*>\s*Datenstand\s*<\/td>\s*<td[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/td>/i)
  const iso = d ? `${d[3]}-${d[2]}-${d[1]}` : '', date = new Date(iso)
  const jahr = html.replace(/<[^>]*>/g, ' ').match(/NPVM\)?\s*(20\d{2})/)
  return { datenstand: iso && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null,
    bezugsjahr: jahr ? Number(jahr[1]) : null }
}
export function npvmUmwandeln(roh: GeoAdminRoh): NpvmLinie[] {
  if (!Array.isArray(roh.results)) throw new AbrufFehler('NPVM: ungültige Antwort')
  const aus = new Map<string, NpvmLinie>()
  for (const f of roh.results) {
    if (f.layerBodId !== NPVM_LAYER) throw new AbrufFehler('NPVM: unerwartete Datenquelle')
    const p = eigenschaften(f), id = String(f.featureId ?? f.id ?? ''), g = f.geometry
    if (!/^\d{1,15}$/.test(id) || !Number.isSafeInteger(p.nr) || (p.nr as number) <= 0) throw new AbrufFehler('NPVM: Streckenkennung fehlt')
    const teile = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' && Array.isArray(g.coordinates) ? g.coordinates : []
    if (!teile.length || !teile.every(z => Array.isArray(z) && z.length >= 2 && z.length <= 10000 && z.every(istLv95)))
      throw new AbrufFehler('NPVM: Liniengeometrie fehlt oder ist nicht in LV95')
    const dtv = typeof p.dtv_fzg === 'number' && Number.isFinite(p.dtv_fzg) && p.dtv_fzg >= 0 && p.dtv_fzg <= 500000 ? p.dtv_fzg : null
    const l: NpvmLinie = { id: `npvm:${id}`, nr: p.nr as number, dtv,
      teile: (teile as number[][][]).map(z => z.map(c => [c[0], c[1]] as P)) }
    const alt = aus.get(l.id)
    if (alt && JSON.stringify(alt) !== JSON.stringify(l)) throw new AbrufFehler('NPVM: widersprüchliche Strecken mit gleicher Kennung')
    aus.set(l.id, l)
  }
  return [...aus.values()].sort((a, b) => a.id.localeCompare(b.id))
}
export function npvmUrl(lat: number, lon: number, radiusM = NPVM_RADIUS_M): string {
  const [e, n] = lv95(lat, lon)
  return geoAdminUrl(NPVM_LAYER, [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(x => x.toFixed(2)).join(','), 'esriGeometryEnvelope')
}
export async function ladeNpvm(lat: number, lon: number, radiusM = NPVM_RADIUS_M, signal?: AbortSignal): Promise<Abruf<NpvmSnapshot>> {
  const url = npvmUrl(lat, lon, radiusM), start = performance.now()
  const [daten, meta] = await Promise.allSettled([ladeGeoAdmin(url, signal), holeText(NPVM_METADATEN_URL, {}, 10000, signal)])
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  if (daten.status === 'rejected') throw daten.reason
  const stand = meta.status === 'fulfilled' && meta.value[0].ok ? npvmMetadaten(meta.value[1]) : { datenstand: null, bezugsjahr: null }
  return { ...daten.value, ms: performance.now() - start, bytes: daten.value.bytes + (meta.status === 'fulfilled' ? meta.value[1].length : 0),
    daten: { version: 1, quelleId: 'are.npvm', abgerufen: new Date().toISOString(), ...stand,
      datenstandQuelle: NPVM_METADATEN_URL, mitte: lv95(lat, lon), radiusM, url, vollstaendigkeit: 'unbekannt', linien: npvmUmwandeln(daten.value.daten) } }
}
export const NPVM_ANBIETER = { quelle: NPVM_QUELLE, thema: 'dtv' as const, datenart: 'modelliert' as const,
  format: 'geojson' as const, datenstand: null, url: npvmUrl, umwandeln: npvmUmwandeln, laden: ladeNpvm,
  abdeckung: { vollstaendigkeit: 'unbekannt' as const, inhalt: 'DTV je NPVM-Modellstrecke',
    einschraenkungen: ['Modelliert, keine Zählung', 'Nur eindeutig passende Strecken', 'Bestätigung erforderlich'] } }
