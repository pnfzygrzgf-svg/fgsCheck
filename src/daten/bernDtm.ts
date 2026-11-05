// ── Höhenprofile aus dem Geländemodell DTM 2023 der Stadt Bern (Geodaten Stadt Bern) ──
//
// ArcGIS ImageServer StadtBern_DTM_Hoehe_25cm_2023 auf gisapp.bern.ch: Befliegung 2. Juni 2023, Raster 25 cm, Höhengenauigkeit laut
// Produktbeschreibung ca. 10 cm, LN02; «Freie Nutzung, Quellenangabe Pflicht». GET …/getSamples mit der Linie als Polylinie in LV95
// (wkid 2056) und sampleDistance; Antwort {samples: [{location: {x, y}, value: "556.81"}, …]} in der Reihenfolge entlang der Linie,
// «NoData» ausserhalb des Rasters. CORS erlaubt (Allow-Origin gespiegelt, geprüft 05.11.2026). Hinaus geht nur die Linie.
// Der Dienst deckt nur das Rechteck BERN_DTM_RECHTECK; Linien ausserhalb werfen (Rückfall auf swissALTI3D, daten/hoehenDienst.ts).

import { dist, type P } from '../geo'
import { AbrufFehler, holeJson, type Abruf } from './holen'
import type { ProfilPunkt } from '../knotensicht/rechner/neigung'

export const BERN_DTM_URL = 'https://gisapp.bern.ch/server/rest/services/StadtBern_DTM_Hoehe_25cm_2023/ImageServer/getSamples'
export const BERN_DTM_KURZ = 'DTM 2023 Stadt Bern'
/** Gelände verdeckt erst, wenn es so weit über die Sichtlinie ragt [m] (Annahme): Höhengenauigkeit ca. 10 cm laut Produktbeschreibung,
 *  dazu Reserve für die Interpolation zwischen den 25-cm-Zellen */
export const BERN_DTM_TOL_M = 0.15
/** Ausdehnung des Dienstes in LV95 [w, s, e, n] */
export const BERN_DTM_RECHTECK = [2588000, 1196000, 2605000, 1205000] as const
export const BERN_DTM_MS = 15000
/** Linie höchstens mit so vielen Ecken in die Adresse (wie knotensicht/daten/hoehen.ts) */
const ECKEN_MAX = 8

const r2 = (x: number) => Math.round(x * 100) / 100
const imRechteck = (p: P) => p[0] >= BERN_DTM_RECHTECK[0] && p[0] <= BERN_DTM_RECHTECK[2] && p[1] >= BERN_DTM_RECHTECK[1] && p[1] <= BERN_DTM_RECHTECK[3]

/** Adresse des Profils entlang der Linie mit rund `punkte` Stützpunkten; wirft ausserhalb des Dienstgebiets */
export function bernDtmUrl(linie: P[], punkte: number): string {
  if (linie.length < 2) throw new Error('Linie zu kurz')
  if (!linie.every(imRechteck)) throw new AbrufFehler('ausserhalb des DTM der Stadt Bern')
  const schritt = Math.max(1, Math.ceil((linie.length - 1) / (ECKEN_MAX - 1)))
  const ecken = linie.filter((_, k) => k % schritt === 0 || k === linie.length - 1)
  let L = 0
  for (let i = 1; i < ecken.length; i++) L += dist(ecken[i - 1], ecken[i])
  const abstand = Math.max(0.25, r2(L / Math.max(1, punkte - 1)))
  const geom = JSON.stringify({ paths: [ecken.map(p => [r2(p[0]), r2(p[1])])], spatialReference: { wkid: 2056 } })
  const q = new URLSearchParams({ f: 'json', geometryType: 'esriGeometryPolyline', geometry: geom, sampleDistance: String(abstand),
    returnFirstValueOnly: 'true', interpolation: 'RSP_BilinearInterpolation' })
  return `${BERN_DTM_URL}?${q}`
}

interface ProbeRoh { location?: { x?: unknown; y?: unknown }; value?: unknown }

/** Antwort von getSamples -> Profilpunkte (dist kumuliert entlang der Proben; Proben ohne Höhe fallen weg) */
export function bernDtmLesen(roh: unknown): ProfilPunkt[] {
  const r = roh as { samples?: unknown; error?: { message?: unknown; code?: unknown } } | null
  if (r?.error) throw new AbrufFehler(`Fehler des Dienstes: ${String(r.error.message ?? r.error.code ?? 'unbekannt')}`)
  if (!Array.isArray(r?.samples)) throw new Error('Antwort ist keine Liste')
  const out: ProfilPunkt[] = []
  let d = 0, vorher: P | null = null
  for (const s of r.samples as ProbeRoh[]) {
    const x = s?.location?.x, y = s?.location?.y
    if (typeof x !== 'number' || typeof y !== 'number') continue
    const p: P = [x, y]
    if (vorher) d += dist(vorher, p)
    vorher = p
    const h = typeof s.value === 'number' ? s.value : typeof s.value === 'string' ? Number(s.value) : NaN
    if (Number.isFinite(h)) out.push({ dist: Math.round(d * 100) / 100, h })
  }
  if (out.length < 2) throw new AbrufFehler('keine Höhen im DTM der Stadt Bern')
  return out
}

/** Profil entlang der Linie holen (Zeit und Grösse gemessen); wirft bei Fehler bzw. Abbruch */
export async function ladeBernProfil(linie: P[], punkte: number, signal?: AbortSignal): Promise<Abruf<ProfilPunkt[]>> {
  const r = await holeJson<unknown>(bernDtmUrl(linie, punkte), {}, BERN_DTM_MS, signal)
  return { ...r, daten: bernDtmLesen(r.daten) }
}
