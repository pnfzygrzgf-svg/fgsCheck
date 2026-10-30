// ── Geoportal der Stadt Bern über ArcGIS REST (Haltestellen, Verkehrsdaten): Abfrage, Prüfung der Antwort, Zwischenspeicher ──
//
// Gleicher Dienst wie VeloroutenCheck (src/bern.ts): https://map.bern.ch/arcgis/rest/services/Geoportal/<Service>/MapServer/0/query
// mit f=geojson. Abfrage und Antwort in LV95 (inSR/outSR 2056), wie beim WFS des Baum- und Parkkatasters (dort trifft eine
// WGS84-BBOX rund 150 m daneben); Antworten ohne EPSG:2056 werden abgelehnt. Der Dienst erlaubt den Zugriff aus dem Browser
// (CORS: Access-Control-Allow-Origin spiegelt den Origin, geprüft 20.10.2026). Lizenz: freie Nutzung, Quellenangabe Pflicht
// («Geodaten Stadt Bern»); in Texten der Vorbelegung als «Geoportal Stadt Bern».
// Zuständigkeit wie beim Parkkataster: AV-Gemeinde Stadt Bern (BFS 351). Zwischenspeicher: erfolgreiche Antworten je Abfrage
// (gleicher Ort, gleicher Ausschnitt) bis GEO_CACHE_MAX Einträge; Fehler und Abbrüche werden nicht gespeichert.
// Seit Automatik Paket C (21.10.2026) weitere Dienste (Richtplan Fussverkehr, Strassenhierarchie und Strassentypen, signalisierte
// Höchstgeschwindigkeit, Volksschulen und Kindergärten, taktil-visuelle Markierungen, Nutzungszonen, ÖV-Linien; je ein Modul in
// src/daten/): je Layer eine Abfrage im gleichen Rechteck, wahlweise mit Layer-Nummer, Koordinaten-Rundung (geometryPrecision)
// und Vereinfachung (maxAllowableOffset) für grosse Linien bzw. Flächen. Gemeinsame Hilfen zum Einlesen der Geometrie unten.

import { lv95, imPolygon, type P } from '../geo'
import type { AvFlaeche } from './av'
import type { Bereich } from './haltestellen'
import { holeJson, AbrufFehler, istAbbruch, type Abruf } from './holen'
import { gemeindeAmOrt } from './quellenregister'

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
  // Gemeinde der AV-Fläche am Punkt (Quellenregister, gleiche Wahl wie bfsAmPunkt)
  const b = gemeindeAmOrt(p, av)?.bfs ?? null
  return b !== null && istBern([b])
}

export interface ArcgisGeoJson {
  crs?: { properties?: { name?: string } }
  features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[]
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
  error?: { code?: number; message?: string }
}

/** Zusätze einer Abfrage: Layer (Vorgabe 0), Nachkommastellen der Koordinaten, Vereinfachung in Metern (Douglas-Peucker des Diensts) */
export interface ArcgisOptionen { layer?: number; nachkomma?: number; vereinfachungM?: number }

/** Abfrage-URL: Rechteck ±radiusM um den Ort in LV95, Felder outFields, Antwort GeoJSON in LV95 */
export function arcgisUrl(service: string, lat: number, lon: number, radiusM: number, outFields: string, opt: ArcgisOptionen = {}): string {
  const [e, n] = lv95(lat, lon)
  const q = new URLSearchParams({
    geometry: [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(v => v.toFixed(0)).join(','),
    geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects',
    outFields, outSR: '2056', f: 'geojson',
  })
  if (opt.nachkomma !== undefined) q.set('geometryPrecision', String(opt.nachkomma))
  if (opt.vereinfachungM !== undefined) q.set('maxAllowableOffset', String(opt.vereinfachungM))
  return `${BERN_GEOPORTAL}/${service}/MapServer/${opt.layer ?? 0}/query?${q}`
}

/** Antwort prüfen: ArcGIS-Fehler (HTTP 200 mit error), gekappte Antwort (Übertragungsgrenze), nicht LV95 -> AbrufFehler */
export function arcgisPruefen(gj: ArcgisGeoJson): void {
  if (gj.error) throw new AbrufFehler(`ArcGIS ${gj.error.code ?? ''} ${gj.error.message ?? ''}`.trim())
  if (gj.exceededTransferLimit === true || gj.properties?.exceededTransferLimit === true)
    throw new AbrufFehler('Antwort unvollständig (Übertragungsgrenze des Dienstes)')
  if (!/(^|[^0-9])2056$/.test(gj.crs?.properties?.name ?? '')) throw new AbrufFehler('Antwort nicht in LV95 (EPSG:2056)')
}

/** Einträge im Zwischenspeicher: rund vier Orte mit allen Berner Abfragen (seit Paket C 13 je Ort) */
export const GEO_CACHE_MAX = 60
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

// ── Ergebnis eines Berner Diensts für die Vorbelegung und Einlesen der Geometrie (LV95, Koordinaten mit z erlaubt) ──

/** Ergebnis eines Berner Diensts: Daten mit abgedecktem Bereich (Quadrat ±radiusM um den Ladeort) und Hinweis (z. B. ein Layer
 * nicht erreichbar), sonst Fehler; null in GeoVorbelegung heisst ausserhalb Berns bzw. noch nicht geladen */
export type BernErgebnis<T> = (T & { bereich: Bereich; hinweis?: string }) | { fehler: string }
/** Stand eines Berner Diensts in der App: lädt, geladen, Fehler */
export type BernLaden<T> = { laedt: true } | { daten: T; hinweis?: string } | { fehler: string }
/** Stand -> Ergebnis für die Vorbelegung (null, solange er lädt) */
export function bernErgebnis<T extends object>(s: BernLaden<T> | null | undefined, bereich: Bereich): BernErgebnis<T> | null {
  if (!s || 'laedt' in s) return null
  if ('fehler' in s) return { fehler: s.fehler }
  return { ...s.daten, bereich, ...(s.hinweis ? { hinweis: s.hinweis } : {}) }
}

type Feature = NonNullable<ArcgisGeoJson['features']>[number]
const istZahlPaar = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number' && Number.isFinite(x[0]) && Number.isFinite(x[1])
/** Koordinatenliste -> P[] (z entfällt, ungültige Punkte entfallen) */
const punkte = (roh: unknown): P[] => (Array.isArray(roh) ? roh.filter(istZahlPaar).map(c => [c[0], c[1]] as P) : [])

/** Linienzüge eines Features (LineString bzw. MultiLineString); Teile unter zwei Punkten entfallen */
export function linienTeile(f: Feature): P[][] {
  const g = f.geometry
  if (!g || !Array.isArray(g.coordinates)) return []
  const roh = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  return (roh as unknown[]).map(punkte).filter(z => z.length >= 2)
}
/** Ringe eines Features (Polygon bzw. MultiPolygon, alle Ringe flach: Gerade-Ungerade-Regel wie AV-Flächen); Ringe unter drei Punkten entfallen */
export function flaechenRinge(f: Feature): P[][] {
  const g = f.geometry
  if (!g || !Array.isArray(g.coordinates)) return []
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  return (polys as unknown[]).flatMap(pl => (Array.isArray(pl) ? pl : [])).map(punkte).filter(r => r.length >= 3)
}
/** Lage eines Punkt-Features, null ohne gültige Lage */
export function punktLage(f: Feature): P | null {
  const g = f.geometry
  return g?.type === 'Point' && istZahlPaar(g.coordinates) ? [g.coordinates[0], g.coordinates[1]] : null
}
/** Text-Feld (getrimmt), null ohne Text */
export const textFeld = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
/** Zahl-Feld, null ohne gültige Zahl */
export const zahlFeld = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
/** Kennung eines Features: Präfix und Objectid (sonst laufende Nummer) */
export const featureId = (praefix: string, f: Feature, i: number) => `${praefix}:${String(f.properties?.Objectid ?? i)}`

/**
 * Zwei Abfragen eines Diensts gemeinsam (z. B. Linien und Flächen): schlägt eine fehl, fehlt nur ihr Teil (null) und hinweis nennt
 * sie; schlagen beide fehl, der erste Fehler. Abbruch bricht beides ab. Ladezeit = die längere, Grösse = Summe.
 */
export async function arcgisPaar<A, B>(a: Promise<Abruf<A>>, b: Promise<Abruf<B>>, namen: [string, string]):
  Promise<Abruf<{ a: A | null; b: B | null; hinweis: string | null }>> {
  const [ra, rb] = await Promise.allSettled([a, b])
  for (const r of [ra, rb]) if (r.status === 'rejected' && istAbbruch(r.reason)) throw r.reason
  if (ra.status === 'rejected' && rb.status === 'rejected') throw ra.reason
  const ok: Abruf<unknown>[] = []
  if (ra.status === 'fulfilled') ok.push(ra.value)
  if (rb.status === 'fulfilled') ok.push(rb.value)
  const fehler = ([[ra, namen[0]], [rb, namen[1]]] as const).filter(([r]) => r.status === 'rejected')
    .map(([r, n]) => `${n} nicht erreichbar (${((r as PromiseRejectedResult).reason as Error)?.message ?? 'Fehler'})`)
  return {
    daten: { a: ra.status === 'fulfilled' ? ra.value.daten : null, b: rb.status === 'fulfilled' ? rb.value.daten : null,
      hinweis: fehler.length ? fehler.join('; ') : null },
    ms: Math.max(...ok.map(r => r.ms)), bytes: ok.reduce((s, r) => s + r.bytes, 0), quelle: ok[0].quelle,
  }
}
