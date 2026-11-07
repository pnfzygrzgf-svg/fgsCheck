import { holeBundText as holeText } from './bundesAbruf'
import { lv95 } from '../../../geo'
import { AbrufFehler, type Abruf } from '../../holen'
import { eigenschaften, geoAdminUrl, istLv95, ladeGeoAdmin, type GeoAdminRoh } from './geoAdmin'
import type { AmtlicheKante, AmtlicherHalt, BavSnapshot } from './typen'

export const BAV_LAYER = 'ch.bav.haltestellen-oev'
export const BAV_HERKUNFT = 'BAV, Haltestellen des öV'
export const BAV_QUELLENANGABE = '© BAV, Haltestellen des öffentlichen Verkehrs (geo.admin.ch)'
export const BAV_RADIUS_M = 200
export const BAV_METADATEN_URL = 'https://api3.geo.admin.ch/rest/services/api/MapServer/ch.bav.haltestellen-oev/legend?lang=de'
export const bavDatenstandText = (d: Pick<BavSnapshot, 'datenstand'>): string => d.datenstand
  ? d.datenstand.split('-').reverse().join('.') : 'unbekannt'
/** Offizielle HTML-Legende, kein HTTP-Datum und kein Veröffentlichungsdatum aus einer Suchmaschine. */
export function bavDatenstand(html: string): string | null {
  const m = html.match(/<td[^>]*>\s*Datenstand\s*<\/td>\s*<td[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/td>/i)
  if (!m) return null
  const datum = `${m[3]}-${m[2]}-${m[1]}`, zeit = Date.parse(`${datum}T00:00:00Z`)
  return Number.isFinite(zeit) && new Date(zeit).toISOString().slice(0, 10) === datum ? datum : null
}
async function ladeDatenstand(signal?: AbortSignal) {
  const start = performance.now(), [res, html] = await holeText(BAV_METADATEN_URL, {}, 10000, signal)
  if (!res.ok) throw new AbrufFehler(`Metadaten: HTTP ${res.status}`, res.status)
  const stand = bavDatenstand(html)
  if (!stand) throw new AbrufFehler('Datenstand in den BAV-Metadaten nicht lesbar')
  return { stand, ms: performance.now() - start, bytes: html.length }
}
export const BAV_QUELLE = {
  id: 'bav.halt', themen: ['haltestellen'] as ['haltestellen'], name: 'Haltestellen des öV (Bus/Tram)', anbieter: 'Bundesamt für Verkehr (BAV)',
  gebiet: { art: 'schweiz' as const }, dienst: 'api' as const, lizenz: 'freie Nutzung mit Quellenangabe © BAV',
  stand: 'Datenstand der Ebene aus offiziellen Metadaten; Abrufzeit je Fall', cors: true as const, empfaenger: 'swisstopo' as const,
  datenschutz: 'Rechteck ±200 m um den geladenen Ort für BAV-Haltestellen (api3.geo.admin.ch)',
  module: ['daten/anbieter/gemeinsam/bav.ts'],
  hinweis: 'Aktive Bus-/Tramhaltestellen als Punkte, Haltekanten nur auf der Karte. Zuordnung zur Querung bestätigen; Vollständigkeit unbekannt.',
}

/** Haltekanten ohne Verkehrsmittel, Betriebspunkte und stillgelegte Haltestellen werden nicht als aktive Bus-/Tramhalte übernommen. */
export function bavUmwandeln(roh: GeoAdminRoh): { halte: AmtlicherHalt[] } {
  const halte = new Map<string, AmtlicherHalt>()
  if (!Array.isArray(roh.results)) throw new AbrufFehler('BAV: ungültige Antwort')
  for (const f of roh.results) {
    if (f.layerBodId !== BAV_LAYER) throw new AbrufFehler('BAV: unerwartete Datenquelle')
    const pr = eigenschaften(f)
    if (pr.betriebspunkttyp_de !== 'Haltestelle') continue
    const verkehr = typeof pr.verkehrsmittel_de === 'string' ? pr.verkehrsmittel_de : ''
    const bus = /\b(bus|trolleybus)\b/i.test(verkehr), tram = /\btram\b/i.test(verkehr)
    if (!bus && !tram) continue
    const nummer = String(f.featureId ?? f.id ?? '')
    if (!nummer || typeof pr.name !== 'string' || !pr.name.trim()) throw new AbrufFehler('BAV: Haltestelle ohne Kennung oder Name')
    const g = f.geometry
    const punkte = g?.type === 'Point' ? [g.coordinates] : g?.type === 'MultiPoint' && Array.isArray(g.coordinates) ? g.coordinates : []
    if (!punkte.length || !punkte.every(istLv95)) throw new AbrufFehler('BAV: Haltestellenlage fehlt oder ist nicht in LV95')
    punkte.forEach((p, i) => {
      const id = `bav:${nummer}${punkte.length > 1 ? `:${i}` : ''}`
      const h: AmtlicherHalt = { id, nummer, name: pr.name as string, p: [p[0], p[1]], art: bus && tram ? 'bus_tram' : bus ? 'bus' : 'tram' }
      const alt = halte.get(id)
      if (alt && JSON.stringify(alt) !== JSON.stringify(h)) throw new AbrufFehler('BAV: widersprüchliche Haltestellen mit gleicher Kennung')
      halte.set(id, h)
    })
  }
  return { halte: [...halte.values()].sort((a, b) => a.id.localeCompare(b.id)) }
}

/** Haltekanten des Layers. Sie tragen keinen Betriebspunkttyp und kein Verkehrsmittel, darum stehen sie getrennt von den Haltestellen und nur auf der Karte */
export function bavKanten(roh: GeoAdminRoh): AmtlicheKante[] {
  const aus = new Map<string, AmtlicheKante>()
  for (const f of roh.results ?? []) {
    const pr = eigenschaften(f), g = f.geometry
    if (typeof pr.haltestelle !== 'string' || typeof pr.nummer_text !== 'string') continue
    const p = (g?.type === 'Point' ? [g.coordinates] : g?.type === 'MultiPoint' && Array.isArray(g.coordinates) ? g.coordinates : []).find(istLv95)
    if (!p) continue
    const id = `bav:k:${String(f.featureId ?? f.id ?? pr.nummer_text)}`
    aus.set(id, { id, sloid: pr.nummer_text, name: pr.haltestelle, bezeichnung: typeof pr.bezeichnung_de === 'string' ? pr.bezeichnung_de : '', p: [p[0], p[1]] })
  }
  return [...aus.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function bavUrl(lat: number, lon: number, radiusM: number): string {
  const [e, n] = lv95(lat, lon)
  return geoAdminUrl(BAV_LAYER, [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(x => x.toFixed(2)).join(','), 'esriGeometryEnvelope')
}
const cache = new Map<string, Abruf<BavSnapshot>>()
export const bavCacheLeeren = () => cache.clear()
export async function ladeBav(lat: number, lon: number, radiusM = BAV_RADIUS_M, signal?: AbortSignal, frisch = false): Promise<Abruf<BavSnapshot>> {
  const url = bavUrl(lat, lon, radiusM), mitte = lv95(lat, lon)
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  const da = cache.get(url); if (da && !frisch) return { ...da, ms: 0 }
  const [datenAbruf, metadaten] = await Promise.allSettled([ladeGeoAdmin(url, signal), ladeDatenstand(signal)])
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  if (datenAbruf.status === 'rejected') throw datenAbruf.reason
  const r = datenAbruf.value
  const imRechteck = (h: { p: readonly [number, number] }) => Math.abs(h.p[0] - mitte[0]) <= radiusM && Math.abs(h.p[1] - mitte[1]) <= radiusM
  const halte = bavUmwandeln(r.daten).halte.filter(imRechteck), kanten = bavKanten(r.daten).filter(imRechteck)
  const daten: BavSnapshot = { version: 1, quelleId: 'bav.halt', abgerufen: new Date().toISOString(),
    datenstand: metadaten.status === 'fulfilled' ? metadaten.value.stand : null,
    ...(metadaten.status === 'fulfilled' ? { datenstandQuelle: BAV_METADATEN_URL } : { datenstandHinweis: (metadaten.reason as Error).message }),
    mitte, radiusM, url, vollstaendigkeit: 'unbekannt', halte, kanten }
  const aus = { ...r, daten, ms: Math.max(r.ms, metadaten.status === 'fulfilled' ? metadaten.value.ms : 0),
    bytes: r.bytes + (metadaten.status === 'fulfilled' ? metadaten.value.bytes : 0) }
  cache.set(url, aus); while (cache.size > 40) cache.delete(cache.keys().next().value!)
  return aus
}
export const BAV_ANBIETER = {
  quelle: BAV_QUELLE, thema: 'haltestellen' as const, format: 'geojson' as const, datenart: 'erfasst' as const, datenstand: null,
  abdeckung: { inhalt: 'Aktive Bus-/Tramhaltestellen', einschraenkungen: ['Haltekanten ohne Verkehrsmittel und Fahrtrichtung', 'Zuordnung zur Querung bestätigen'],
    vollstaendigkeit: 'unbekannt' as const }, url: bavUrl, umwandeln: bavUmwandeln, laden: ladeBav,
}
