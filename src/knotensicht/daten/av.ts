// ── Amtliche Vermessung: Bodenbedeckung (LCSF) über den WFS von geodienste.ch ──
//
// Antwort als GeoJSON in LV95 (E, N). Die Flächen werden nicht auf die BBOX zugeschnitten; eine
// Strassenfläche kann darum weit über den Abfrageraum hinausreichen (mehrere hundert Stützpunkte).

import type { P } from '../geo'
import { holeJson, AbrufFehler, type Abruf } from './holen'

export interface AvFlaeche {
  art: string            // Strasse_Weg, Trottoir, Verkehrsinsel, uebrige_befestigte, Gebaeude, …
  kanton: string
  qualitaet: string
  bfs: number | null     // BFS-Nummer der Gemeinde (BFSNr), für gemeindebezogene Quellen (Baumkataster)
  ringe: P[][]           // äusserer Ring + Löcher; bei MultiPolygon je Teil eine eigene Fläche
}

const WFS = 'https://geodienste.ch/db/av_0/deu'

export function avUrl(e: number, n: number, radius: number, ebene = 'LCSF'): string {
  const bbox = [e - radius, n - radius, e + radius, n + radius].map(v => v.toFixed(1)).join(',')
  return `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:${ebene}` +
    `&SRSNAME=EPSG:2056&BBOX=${bbox},EPSG:2056&OUTPUTFORMAT=geojson`
}

export interface GeoJson {
  features?: {
    properties?: Record<string, unknown>
    geometry?: { type: string; coordinates: unknown } | null
  }[]
}

/** GeoJSON (LCSF) → Flächen. Unbekannte Geometrietypen werden übergangen. */
export function avParsen(gj: GeoJson): AvFlaeche[] {
  const aus: AvFlaeche[] = []
  for (const f of gj.features ?? []) {
    const pr = f.properties ?? {}, g = f.geometry
    if (!g) continue
    const bfs = Number(pr.BFSNr)
    const basis = { art: String(pr.Art ?? ''), kanton: String(pr.Kanton ?? ''), qualitaet: String(pr.Qualitaet ?? ''),
      bfs: Number.isFinite(bfs) && bfs > 0 ? bfs : null }
    const zweiD = (r: number[][]) => r.map(p => [p[0], p[1]] as P)
    if (g.type === 'Polygon') aus.push({ ...basis, ringe: (g.coordinates as number[][][]).map(zweiD) })
    else if (g.type === 'MultiPolygon')
      for (const teil of g.coordinates as number[][][][]) aus.push({ ...basis, ringe: teil.map(zweiD) })
  }
  return aus
}

/** Rohantwort (GeoJSON) für den Worker */
export async function ladeAvRoh(e: number, n: number, radius = 150, signal?: AbortSignal): Promise<Abruf<GeoJson>> {
  try {
    return await holeJson<GeoJson>(avUrl(e, n, radius), {}, 30000, signal)
  } catch (err) {
    if (err instanceof AbrufFehler && err.status !== null && err.status < 500)
      throw new AbrufFehler(`${err.message}: keine AV-Daten freigegeben? (Die Kantone JU, LU, NE, NW, OW und VD geben die AV ` +
        'über geodienste.ch nur mit Freigabe ab; im Wallis fehlen einzelne Gemeinden.)', err.status)
    throw err
  }
}

/** AV-Einzelobjekte (SOSF: Brücken, Mauern …) als Rohantwort; Fehler sind nicht fatal (Brückenumriss fehlt dann) */
export async function ladeSosfRoh(e: number, n: number, radius = 150, signal?: AbortSignal): Promise<Abruf<GeoJson>> {
  return holeJson<GeoJson>(avUrl(e, n, radius, 'SOSF'), {}, 30000, signal)
}
