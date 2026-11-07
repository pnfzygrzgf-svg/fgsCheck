// ── Stadt Luzern: Ersatz der amtlichen Vermessung (seit 07.11.2026) ──
//
// Der Kanton Luzern gibt die AV über geodienste.ch nur mit Freigabe ab. In der Stadt Luzern treten zwei offene Dienste an ihre Stelle:
// die Strassenflächen der Stadt (Fahrbahn, Trottoir, Inseln nach AV-Systematik) und die Blockmodelle des Kantons (Gebäudegrundrisse
// der AV). Beide kommen hier in die Form der AV-Antwort, damit Rechnung und Karte unverändert bleiben. Es fehlen die Einzelobjekte der
// AV, und die Strassenflächen enden an der Stadtgrenze. Ausserhalb der Stadt bleibt es bei «keine AV», weil dort die Fahrbahn fehlt.

import { wgs } from '../geo'
import { ladeGebiet } from './anbieter/gemeinsam/gebiet'
import { ladeAvRoh, type GeoJson } from './av'
import { holeJson, type Abruf } from './holen'

export const LUZERN_BFS = 1061
/** Kennzeichnet die Flächen im Feld Qualitaet der AV-Form */
export const LUZERN_QUALITAET = 'Ersatz der AV'
export const LUZERN_NAME = 'Ersatz der AV: Strassenflächen Stadt Luzern und Blockmodelle Gebäude Kanton Luzern'
export const LUZERN_SERVER = 'map.stadtluzern.ch, public.geo.lu.ch'
export const LUZERN_HINWEIS = 'Stadt Luzern: Statt der amtlichen Vermessung rechnet die App mit den Strassenflächen der Stadt und den Gebäudegrundrissen des Kantons. ' +
  'Einzelobjekte wie Mauern fehlen, die Strassenflächen enden an der Stadtgrenze. Hindernisse vor Ort prüfen.'
const STRASSEN_URL = 'https://map.stadtluzern.ch/server/rest/services/OGD/strassenflaeche/MapServer/3/query'
const GEBAEUDE_URL = 'https://public.geo.lu.ch/ogd/rest/services/managed/GEBHOHEN_DS_V5_MP/MapServer/0/query'
/** Grobes Rechteck um die Stadt: ausserhalb kein Abruf der Gemeinde. Ob der Ort in der Stadt liegt, entscheiden die Gemeindegrenzen */
const RECHTECK = [2656000, 1204000, 2673000, 1220000] as const
const SEITE = 2000
const SEITEN_MAX = 10
// Gebäude (0) nicht aus den Strassenflächen: Dort sind es nur wenige, die Grundrisse kommen aus den Blockmodellen
const LU_ART: Record<number, string> = { 5000: 'Strasse_Weg', 5001: 'Strasse_Weg', 2: 'Trottoir', 3: 'Verkehrsinsel', 7: 'uebrige_befestigte' }

export const avErsatz = (av: readonly { qualitaet: string }[] | null | undefined): boolean => !!av?.some(f => f.qualitaet === LUZERN_QUALITAET)
export const imLuzernRechteck = (e: number, n: number): boolean => e >= RECHTECK[0] && n >= RECHTECK[1] && e <= RECHTECK[2] && n <= RECHTECK[3]

/** Rechteck aus einem ArcGIS-Dienst in LV95: alle Seiten oder ein Fehler, nie eine gekürzte Liste */
export async function arcgisFlaechen(url: string, [a, b, c, d]: readonly [number, number, number, number], felder: string, signal?: AbortSignal): Promise<Abruf<GeoJson>> {
  const features: NonNullable<GeoJson['features']> = []
  let bytes = 0, ms = 0, quelle = ''
  for (let s = 0; s < SEITEN_MAX; s++) {
    const q = new URLSearchParams({ geometry: [a, b, c, d].map(v => v.toFixed(1)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '2056', outSR: '2056',
      spatialRel: 'esriSpatialRelIntersects', outFields: felder, returnGeometry: 'true', f: 'geojson', where: '1=1',
      resultOffset: String(s * SEITE), resultRecordCount: String(SEITE), orderByFields: 'OBJECTID' })
    const r = await holeJson<GeoJson & { error?: unknown }>(`${url}?${q}`, {}, 30000, signal)
    if (!Array.isArray(r.daten.features) || r.daten.error) throw new Error(`${new URL(url).host}: ungültige Antwort`)
    features.push(...r.daten.features); bytes += r.bytes; ms += r.ms; quelle = r.quelle
    if (r.daten.features.length < SEITE) return { daten: { features }, bytes, ms, quelle }
  }
  throw new Error(`${new URL(url).host}: zu viele Flächen im Ausschnitt`)
}

const eigenschaften = (art: string, bfs: number, gemeinde: string) => ({ Art: art, Kanton: 'LU', BFSNr: bfs, Gemeinde: gemeinde, Qualitaet: LUZERN_QUALITAET })
/** Strassenflächen und Blockmodelle in der Form der AV-Antwort; Flächen ausserhalb der Systematik fallen weg */
export function luzernAlsAv(strassen: GeoJson, gebaeude: GeoJson): GeoJson {
  return { features: [
    ...(strassen.features ?? []).flatMap(f => {
      const art = LU_ART[Number(f.properties?.ART_BB)]
      return art ? [{ geometry: f.geometry, properties: eigenschaften(art, LUZERN_BFS, 'Luzern') }] : []
    }),
    ...(gebaeude.features ?? []).map(f => ({ geometry: f.geometry,
      properties: eigenschaften('Gebaeude', Number(f.properties?.BFS_NR) || LUZERN_BFS, String(f.properties?.GEMEINDE ?? 'Luzern')) })),
  ] }
}

export async function ladeLuzernRoh(e: number, n: number, radius: number, signal?: AbortSignal): Promise<Abruf<GeoJson>> {
  const box = [e - radius, n - radius, e + radius, n + radius] as const
  const [s, g] = await Promise.all([arcgisFlaechen(STRASSEN_URL, box, 'OBJECTID,ART_BB', signal), arcgisFlaechen(GEBAEUDE_URL, box, 'OBJECTID,BFS_NR,GEMEINDE', signal)])
  return { daten: luzernAlsAv(s.daten, g.daten), bytes: s.bytes + g.bytes, ms: Math.max(s.ms, g.ms), quelle: LUZERN_SERVER }
}

/** Bodenbedeckung am Ort: in der Stadt Luzern der Ersatz, sonst die amtliche Vermessung */
export async function ladeBodenbedeckungRoh(e: number, n: number, radius = 150, signal?: AbortSignal): Promise<Abruf<GeoJson>> {
  if (!imLuzernRechteck(e, n)) return ladeAvRoh(e, n, radius, signal)
  const [lat, lon] = wgs(e, n)
  const gebiet = await ladeGebiet(lat, lon, 200, signal)
  return gebiet.daten.amOrt.some(g => g.bfs === LUZERN_BFS) ? ladeLuzernRoh(e, n, radius, signal) : ladeAvRoh(e, n, radius, signal)
}
