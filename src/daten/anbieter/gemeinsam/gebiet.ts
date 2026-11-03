import { lv95, dist, imPolygon, type P } from '../../../geo'
import { AbrufFehler, type Abruf } from '../../holen'
import { eigenschaften, geoAdminUrl, ladeGeoAdmin, type GeoAdminRoh } from './geoAdmin'
import type { Gemeinde, GebietSnapshot } from './typen'

export const GEBIET_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill'
export const GEBIET_QUELLENANGABE = 'Gemeindegrenzen swissBOUNDARIES3D © swisstopo'
/** Neueste publizierte Fassung der aktuell gültigen Gemeinden; keine Bindung ans Kalenderjahr. */
export function gebietJahr(roh: GeoAdminRoh): number {
  const jahre = (roh.results ?? []).flatMap(f => {
    if (f.layerBodId !== GEBIET_LAYER) throw new AbrufFehler('Gebiet: unerwartete Datenquelle')
    const p = eigenschaften(f)
    return p.is_current_jahr === true && typeof p.jahr === 'number' && Number.isInteger(p.jahr) && p.jahr >= 1900 ? [p.jahr] : []
  })
  if (!jahre.length) throw new AbrufFehler('Kein verlässlicher Gemeindegrenzen-Stand verfügbar; örtliche Quellen eingeschränkt')
  return Math.max(...jahre)
}
export function gemeindenUmwandeln(roh: GeoAdminRoh, jahr: number): Gemeinde[] {
  const gemeinden = new Map<number, Gemeinde>()
  for (const f of roh.results ?? []) {
    if (f.layerBodId !== GEBIET_LAYER) throw new AbrufFehler('Gebiet: unerwartete Datenquelle')
    const p = eigenschaften(f)
    if (p.is_current_jahr !== true || p.jahr !== jahr) continue
    if (typeof p.gde_nr !== 'number' || !Number.isInteger(p.gde_nr) || p.gde_nr <= 0 || typeof p.kanton !== 'string' ||
      !/^[A-Z]{2}$/.test(p.kanton) || typeof p.gemname !== 'string') throw new AbrufFehler('Gebiet: ungültige Gemeindeangabe')
    gemeinden.set(p.gde_nr, { bfs: p.gde_nr, kanton: p.kanton, name: p.gemname })
  }
  return [...gemeinden.values()].sort((a, b) => a.bfs - b.bfs)
}
export function gebietUrls(lat: number, lon: number, radiusM: number, jahr = new Date().getUTCFullYear()): [string, string] {
  const [e, n] = lv95(lat, lon)
  return [geoAdminUrl(GEBIET_LAYER, `${e.toFixed(2)},${n.toFixed(2)}`, 'esriGeometryPoint', 0, jahr, false),
    geoAdminUrl(GEBIET_LAYER, [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(x => x.toFixed(2)).join(','),
      'esriGeometryEnvelope', 0, jahr, false)]
}
/** Zeitfilter ist zwingend: ohne ihn liefert der Dienst historische Jahrgänge seit 1850.
 * Nur fehlende aktuelle Gemeindetreffer erlauben einen zweiten Versuch mit dem Vorjahr. */
export async function ladeGebietStand(urls: (jahr: number) => string[], signal?: AbortSignal) {
  const kalenderjahr = new Date().getUTCFullYear()
  let bytes = 0, ms = 0
  for (const jahr of [kalenderjahr, kalenderjahr - 1]) {
    const abrufe = await Promise.all(urls(jahr).map(url => ladeGeoAdmin(url, signal)))
    bytes += abrufe.reduce((summe, r) => summe + r.bytes, 0)
    ms += Math.max(...abrufe.map(r => r.ms))
    for (const r of abrufe) if (r.daten.results?.some(f => f.layerBodId !== GEBIET_LAYER))
      throw new AbrufFehler('Gebiet: unerwartete Datenquelle')
    const aktuell = abrufe.every(r => r.daten.results?.some(f => {
      const p = eigenschaften(f)
      return p.is_current_jahr === true && p.jahr === jahr
    }))
    if (aktuell) {
      if (abrufe.some(r => gebietJahr(r.daten) !== jahr)) throw new AbrufFehler('Gebiet: unerwarteter Jahresstand')
      return { jahr, abrufe, bytes, ms }
    }
  }
  throw new AbrufFehler('Kein verlässliches Gebiet im laufenden Jahr oder Vorjahr; örtliche Quellen eingeschränkt')
}
const cache = new Map<string, Abruf<GebietSnapshot>>()
export const gebietCacheLeeren = () => cache.clear()
export async function ladeGebiet(lat: number, lon: number, radiusM = 200, signal?: AbortSignal, frisch = false): Promise<Abruf<GebietSnapshot>> {
  const urls = gebietUrls(lat, lon, radiusM), key = urls.join('|')
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  const da = cache.get(key); if (da && !frisch) return { ...da, ms: 0 }
  const { jahr, abrufe: [p, a], bytes, ms } = await ladeGebietStand(j => gebietUrls(lat, lon, radiusM, j), signal)
  const daten: GebietSnapshot = { version: 1, quelleId: 'swisstopo.gebiet', jahr, abgerufen: new Date().toISOString(),
    mitte: lv95(lat, lon), radiusM, amOrt: gemeindenUmwandeln(p.daten, jahr), imAusschnitt: gemeindenUmwandeln(a.daten, jahr) }
  if (!daten.amOrt.length) throw new AbrufFehler('Gebiet am Ort nicht bestimmbar; örtliche Quellen eingeschränkt')
  const aus = { daten, ms, bytes, quelle: p.quelle }
  cache.set(key, aus); while (cache.size > 40) cache.delete(cache.keys().next().value!)
  return aus
}

interface AvGebietsFlaeche { art: string; bfs: number | null; kanton: string; gemeinde?: string; ringe: P[][] }
/** Die Gemeinde am Prüfpunkt ist unabhängig von Nachbargemeinden im Kartenfenster. */
export function zustaendigkeitAmOrt(p: P, gebiet: GebietSnapshot | null, av: readonly AvGebietsFlaeche[]) {
  const eindeutig = (fs: readonly AvGebietsFlaeche[]) => [...new Map(fs.flatMap(f =>
    f.bfs !== null && Number.isInteger(f.bfs) && f.bfs > 0 && /^[A-Z]{2}$/.test(f.kanton)
      ? [[f.bfs, { bfs: f.bfs, kanton: f.kanton, name: f.gemeinde?.trim() || `BFS ${f.bfs}` }] as const] : [])).values()]
  const unterPunkt = av.filter(f => imPolygon(p, f.ringe))
  const strasse = unterPunkt.filter(f => f.art === 'Strasse_Weg')
  const ausAv = eindeutig(strasse.length ? strasse : unterPunkt)
  const amOrt = ausAv.length ? ausAv : gebiet && dist(p, gebiet.mitte) < 1 ? gebiet.amOrt : []
  const imAusschnitt = gebiet?.imAusschnitt ?? eindeutig(av)
  const hinweis = !amOrt.length ? 'Gebiet am Prüfpunkt nicht verlässlich bestimmt; örtliche Tempo-, Zonen- und Signalquellen eingeschränkt.'
    : !gebiet ? 'Gemeinde und Kanton aus Amtlicher Vermessung; Gebietskontext auf die geladenen AV-Flächen begrenzt.' : null
  return { amOrt, imAusschnitt, hinweis }
}
export const istZuerichAmOrt = (gemeinden: readonly Gemeinde[]) => gemeinden.length === 1 && gemeinden[0].bfs === 261 && gemeinden[0].kanton === 'ZH'

/** AV ohne Gemeindenamen: BFS nicht doppelt in der Beschriftung ausgeben. */
export function gemeindeText(g: Gemeinde): string {
  return g.name === `BFS ${g.bfs}` ? `${g.name} (${g.kanton})` : `${g.name} (${g.kanton}, BFS ${g.bfs})`
}
