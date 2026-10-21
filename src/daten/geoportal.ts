// ── Geoportal der Stadt Bern über ArcGIS REST (Haltestellen, Verkehrsdaten): Abfrage, Prüfung der Antwort, Zwischenspeicher ──
//
// Gleicher Dienst wie VeloroutenCheck (src/bern.ts): https://map.bern.ch/arcgis/rest/services/Geoportal/<Service>/MapServer/0/query
// mit f=geojson. Abfrage und Antwort in LV95 (inSR/outSR 2056), wie beim WFS des Baum- und Parkkatasters (dort trifft eine
// WGS84-BBOX rund 150 m daneben); Antworten ohne EPSG:2056 werden abgelehnt. Der Dienst erlaubt den Zugriff aus dem Browser
// (CORS: Access-Control-Allow-Origin spiegelt den Origin, geprüft 20.10.2026). Lizenz: freie Nutzung, Quellenangabe Pflicht
// («Geodaten Stadt Bern»); in Texten der Vorbelegung als «Geoportal Stadt Bern».
// Zuständigkeit wie beim Parkkataster: AV-Gemeinde Stadt Bern (BFS 351). Zwischenspeicher: erfolgreiche Antworten je Abfrage
// (gleicher Ort, gleicher Ausschnitt) bis GEO_CACHE_MAX Einträge; Fehler und Abbrüche werden nicht gespeichert.

import { lv95, imPolygon, type P } from '../geo'
import type { AvFlaeche } from './av'
import { holeJson, AbrufFehler, type Abruf } from './holen'

export const BERN_GEOPORTAL = 'https://map.bern.ch/arcgis/rest/services/Geoportal'
/** BFS-Nummer der Stadt Bern (Zuständigkeit der Geoportal-Dienste) */
export const BERN_GEMEINDEN = [351]
/** Herkunft in den Texten der Vorbelegung */
export const GEOPORTAL_BERN = 'Geoportal Stadt Bern'
/** Quellenangabe (Pflicht nach den Nutzungsbedingungen) */
export const GEODATEN_BERN = 'Geodaten Stadt Bern'

export const istBern = (bfs: readonly (number | null)[]) => bfs.some(b => b !== null && BERN_GEMEINDEN.includes(b))

/** Gemeinde (BFS) der AV-Fläche an einem Punkt: zuerst Strasse bzw. Weg, sonst jede Fläche; null ohne Treffer */
export function bfsAmPunkt(p: P, av: readonly AvFlaeche[]): number | null {
  const f = av.find(x => x.art === 'Strasse_Weg' && imPolygon(p, x.ringe)) ?? av.find(x => imPolygon(p, x.ringe))
  return f ? f.bfs : null
}
/**
 * Zuständigkeit der Berner Dienste (Korrektur M4): nur nach der Gemeinde der AV-Fläche unter dem Punkt (Streifen bzw. Ladeort), wie
 * die Ebenen-Vorgabe; nicht nach allen Gemeinden im geladenen Ausschnitt (Köniz/Wabern an der Grenze bekommt keine Berner Daten
 * und keine Annahme DTV 500).
 */
export const bernZustaendig = (p: P | null | undefined, av: readonly AvFlaeche[]): boolean => {
  if (!p) return false
  const b = bfsAmPunkt(p, av)
  return b !== null && istBern([b])
}

export interface ArcgisGeoJson {
  crs?: { properties?: { name?: string } }
  features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[]
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
  error?: { code?: number; message?: string }
}

/** Abfrage-URL: Rechteck ±radiusM um den Ort in LV95, Felder outFields, Antwort GeoJSON in LV95 */
export function arcgisUrl(service: string, lat: number, lon: number, radiusM: number, outFields: string): string {
  const [e, n] = lv95(lat, lon)
  const q = new URLSearchParams({
    geometry: [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(v => v.toFixed(0)).join(','),
    geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects',
    outFields, outSR: '2056', f: 'geojson',
  })
  return `${BERN_GEOPORTAL}/${service}/MapServer/0/query?${q}`
}

/** Antwort prüfen: ArcGIS-Fehler (HTTP 200 mit error), gekappte Antwort (Übertragungsgrenze), nicht LV95 -> AbrufFehler */
export function arcgisPruefen(gj: ArcgisGeoJson): void {
  if (gj.error) throw new AbrufFehler(`ArcGIS ${gj.error.code ?? ''} ${gj.error.message ?? ''}`.trim())
  if (gj.exceededTransferLimit === true || gj.properties?.exceededTransferLimit === true)
    throw new AbrufFehler('Antwort unvollständig (Übertragungsgrenze des Dienstes)')
  if (!/(^|[^0-9])2056$/.test(gj.crs?.properties?.name ?? '')) throw new AbrufFehler('Antwort nicht in LV95 (EPSG:2056)')
}

export const GEO_CACHE_MAX = 20
const cache = new Map<string, Abruf<ArcgisGeoJson>>()
/** nur für Tests */
export const geoCacheLeeren = () => cache.clear()

/** Abfrage holen und prüfen; erfolgreiche Antworten aus dem Zwischenspeicher (ms 0) */
export async function arcgisHolen(url: string, signal?: AbortSignal): Promise<Abruf<ArcgisGeoJson>> {
  const da = cache.get(url)
  if (da) return { ...da, ms: 0 }
  const r = await holeJson<ArcgisGeoJson>(url, {}, 30000, signal)
  arcgisPruefen(r.daten)
  cache.set(url, r)
  while (cache.size > GEO_CACHE_MAX) cache.delete(cache.keys().next().value!)
  return r
}
