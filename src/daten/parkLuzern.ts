// ── Amtliche Parkfelder der Stadt Luzern (seit 07.11.2026) ──
// Flächen je Parkgruppe aus dem offenen Dienst der Stadt. Sie zählen wie die Berner Felder sofort als Hindernis. Eigene Datei, damit der
// Rechenkern (daten/parkkataster.ts) unverändert bleibt.

import { lv95 } from '../geo'
import { arcgisFlaechen, LUZERN_BFS } from './ersatzLuzern'
import { felderAusGeoJson, parkQuelleFuer, type KatasterFeld, type ParkQuelle } from './parkkataster'
import type { GeoJson } from './av'
import type { Abruf } from './holen'

const URL_PARK = 'https://map.stadtluzern.ch/server/rest/services/OGD/oeffentlicher_parkplatz/MapServer/13/query'
const ZUSATZ = 'Öffentliche Parkplätze Stadt Luzern'

/** Art im Sinn des Kerns (parkKlasse); null = nicht verwenden */
export function luzernParkTyp(subtyp: unknown, zweirad: unknown): 'Parkfeld' | 'Parkplatz_Velo' | 'Parkplatz_Motorrad' | null {
  const s = String(subtyp ?? '')
  if (!s || /blaulicht/i.test(s)) return null
  if (/zweirad/i.test(s)) return /moto/i.test(String(zweirad ?? '')) ? 'Parkplatz_Motorrad' : 'Parkplatz_Velo'
  return 'Parkfeld'
}

export function luzernFelder(gj: GeoJson): KatasterFeld[] {
  const typen = ['Parkfeld', 'Parkplatz_Velo', 'Parkplatz_Motorrad'] as const
  const name = { Parkfeld: 'Parkfeld', Parkplatz_Velo: 'Veloparkplatz', Parkplatz_Motorrad: 'Motorradparkplatz' }
  return typen.flatMap(t => felderAusGeoJson({ features: (gj.features ?? []).filter(f => luzernParkTyp(f.properties?.SUBTYPE_TEXT, f.properties?.ZWEIRAD_SIGNAL_TEXT) === t) } as Parameters<typeof felderAusGeoJson>[0],
    t, 'luzernpark', name[t], ZUSATZ))
}

async function laden(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<KatasterFeld[]>> {
  const [e, n] = lv95(lat, lon)
  const r = await arcgisFlaechen(URL_PARK, [e - radiusM, n - radiusM, e + radiusM, n + radiusM], 'OBJECTID,SUBTYPE_TEXT,ZWEIRAD_SIGNAL_TEXT', signal)
  return { ...r, daten: luzernFelder(r.daten) }
}

const quelle = { id: 'luzernpark', quelleId: 'lu.park', name: 'Parkfelder Stadt Luzern (amtlich)', quellenangabe: 'Stadt Luzern, öffentliche Parkplätze', gemeinden: [LUZERN_BFS], laden }
export const LUZERN_PARK: ParkQuelle = quelle
export const parkQuelleAmOrt = (bfs: (number | null)[]): ParkQuelle | null => parkQuelleFuer(bfs) ?? (bfs.includes(LUZERN_BFS) ? LUZERN_PARK : null)
