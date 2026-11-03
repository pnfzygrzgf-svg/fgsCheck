import { holeBundJson as holeJson } from './bundesAbruf'
import { AbrufFehler, type Abruf } from '../../holen'

export interface GeoAdminFeature {
  layerBodId?: string
  featureId?: number | string
  id?: number | string
  properties?: Record<string, unknown>
  attributes?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
}
export interface GeoAdminRoh { results?: GeoAdminFeature[]; error?: { message?: string }; exceededTransferLimit?: boolean }
export const GEOADMIN_API = 'https://api3.geo.admin.ch/rest/services/ech/MapServer/identify'
export const GEOADMIN_LIMIT = 200

export function geoAdminUrl(layer: string, geometry: string, art: 'esriGeometryPoint' | 'esriGeometryEnvelope',
  offset = 0, jahr?: number, geometrie = true): string {
  const q = new URLSearchParams({ geometry, geometryType: art, geometryFormat: 'geojson', layers: `all:${layer}`,
    tolerance: '0', sr: '2056', lang: 'de', returnGeometry: String(geometrie), limit: String(GEOADMIN_LIMIT), offset: String(offset) })
  if (jahr !== undefined) q.set('timeInstant', String(jahr))
  return `${GEOADMIN_API}?${q}`
}

/** Grenze gilt je zugrundeliegender Tabelle; darum nach Rohanzahl weiterblättern, bevor gefiltert oder dedupliziert wird. */
export async function ladeGeoAdmin(url: string, signal?: AbortSignal): Promise<Abruf<GeoAdminRoh>> {
  const results: GeoAdminFeature[] = []
  let bytes = 0, ms = 0, quelle = ''
  for (let seite = 0; seite < 5; seite++) {
    const u = new URL(url); u.searchParams.set('offset', String(seite * GEOADMIN_LIMIT))
    const r = await holeJson<GeoAdminRoh>(u.toString(), {}, 20000, signal)
    if (r.daten.error || !Array.isArray(r.daten.results))
      throw new AbrufFehler(r.daten.error?.message ?? 'GeoAdmin: ungültige Antwort')
    if (r.daten.exceededTransferLimit) throw new AbrufFehler('GeoAdmin: Antwort unvollständig (Übertragungsgrenze)')
    bytes += r.bytes; ms += r.ms; quelle = r.quelle
    results.push(...r.daten.results)
    if (r.daten.results.length < GEOADMIN_LIMIT) return { daten: { results }, bytes, ms, quelle }
  }
  throw new AbrufFehler('GeoAdmin: zu viele Objekte; Ausschnitt nicht vollständig geladen')
}

export const eigenschaften = (f: GeoAdminFeature) => f.properties ?? f.attributes ?? {}
export const istLv95 = (p: unknown): p is [number, number] => Array.isArray(p) && p.length >= 2 &&
  typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
  p[0] >= 2400000 && p[0] <= 2900000 && p[1] >= 1000000 && p[1] <= 1400000
