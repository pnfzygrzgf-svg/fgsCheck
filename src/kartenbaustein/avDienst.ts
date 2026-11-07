// ── Bodenbedeckung abrufen: amtliche Vermessung über den WFS von geodienste.ch, in der Stadt Luzern die Strassenflächen der Stadt ──
// Der Kanton Luzern gibt die AV über geodienste.ch nur mit Freigabe ab. Die Stadt Luzern veröffentlicht ihre Strassenflächen offen (ArcGIS REST,
// EPSG:2056, «© Geoinformationszentrum Stadt Luzern»), Flächen nach AV-Systematik (ART_BB), keine vollständige Bodenbedeckung, höchstens 2 000 je Abfrage.
// holen kommt vom Rechner, damit er Abruf und Stand selbst melden kann.

import type { P } from './modell'

export interface AvFlaeche {
  art: string        // Strasse_Weg, Trottoir, Verkehrsinsel, uebrige_befestigte, Gebaeude, …
  ringe: P[][]       // äusserer Ring + Löcher; bei MultiPolygon je Teil eine eigene Fläche
}
interface GeoJson { features?: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null }[] }
export type AvHolen = (url: string) => Promise<unknown>

const WFS = 'https://geodienste.ch/db/av_0/deu'
const LU_DIENST = 'https://map.stadtluzern.ch/server/rest/services/OGD/strassenflaeche/MapServer/3/query'
const LU_ART: Record<number, string> = { 5000: 'Strasse_Weg', 5001: 'Strasse_Weg', 2: 'Trottoir', 3: 'Verkehrsinsel', 7: 'uebrige_befestigte', 0: 'Gebaeude' }
const rechteck = (e: number, n: number, r: number) => [e - r, n - r, e + r, n + r].map(v => v.toFixed(1)).join(',')

export const luArt = (code: unknown): string | null => (typeof code === 'number' && code in LU_ART ? LU_ART[code] : null)

export const avUrl = (e: number, n: number, radiusM: number): string => `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:LCSF` +
  `&SRSNAME=EPSG:2056&BBOX=${rechteck(e, n, radiusM)},EPSG:2056&OUTPUTFORMAT=geojson`

/** GeoJSON (LCSF) → Flächen. Unbekannte Geometrietypen werden übergangen. */
export function avParsen(gj: GeoJson): AvFlaeche[] {
  const aus: AvFlaeche[] = []
  const zweiD = (r: number[][]) => r.map(p => [p[0], p[1]] as P)
  for (const f of gj.features ?? []) {
    const g = f.geometry
    if (!g) continue
    const art = String(f.properties?.Art ?? '')
    if (g.type === 'Polygon') aus.push({ art, ringe: (g.coordinates as number[][][]).map(zweiD) })
    else if (g.type === 'MultiPolygon')
      for (const teil of g.coordinates as number[][][][]) aus.push({ art, ringe: teil.map(zweiD) })
  }
  return aus
}

export const ladeAv = async (e: number, n: number, radiusM: number, holen: AvHolen): Promise<AvFlaeche[]> => avParsen(await holen(avUrl(e, n, radiusM)) as GeoJson)

export async function ladeAvLuzern(e: number, n: number, radiusM: number, holen: AvHolen): Promise<AvFlaeche[]> {
  const aus: AvFlaeche[] = []
  for (let offset = 0; offset < 20000; offset += 2000) {
    const q = new URLSearchParams({ geometry: rechteck(e, n, radiusM), geometryType: 'esriGeometryEnvelope', inSR: '2056', outSR: '2056',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'ART_BB', returnGeometry: 'true', f: 'geojson',
      resultOffset: String(offset), resultRecordCount: '2000', orderByFields: 'OBJECTID' })   // ohne Sortierung schlägt das Blättern fehl
    const feats = (await holen(`${LU_DIENST}?${q}`) as GeoJson).features ?? []
    for (const f of avParsen({ features: feats.map(x => ({ ...x, properties: { Art: luArt(x.properties?.ART_BB) ?? '' } })) }))
      if (f.art) aus.push(f)
    if (feats.length < 2000) break
  }
  return aus
}
