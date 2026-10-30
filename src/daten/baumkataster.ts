// ── Baumkataster als optionale Quelle (E2) ──
//
// Je Stadt ein Eintrag: wo er gilt (BFS-Nummer der AV-Gemeinde), wie geladen wird, Quellenangabe. Bern: öffentlicher WFS des
// Geoportals (wie fgs_baeume.py des Berner Projekts), GeoJSON mit LV95-Koordinaten in HKOORD/VKOORD; die Abfrage-BBOX in LV95.
// Weitere Städte (Zürich, Basel) docken mit einem Eintrag in BAUMKATASTER an.

import { type P, bboxLv95 } from '../geo'
import { holeJson, type Abruf } from './holen'

export interface KatasterBaum { id: string; p: P; name: string }
export interface BaumQuelle {
  id: string
  /** Kennung im Quellenregister (daten/quellenregister.ts) */
  quelleId: string
  name: string
  quellenangabe: string
  gemeinden: number[]                 // BFS-Nummern
  laden: (lat: number, lon: number, radiusM: number, signal?: AbortSignal) => Promise<Abruf<KatasterBaum[]>>
}

const BERN_WFS = 'https://map.bern.ch/arcgis/services/Geoportal/Baumkataster/MapServer/WFSServer'

async function bernLaden(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<KatasterBaum[]>> {
  // BBOX in LV95: eine WGS84-BBOX rechnet der Dienst ohne Datumsübergang um und trifft rund 150 m daneben (geprüft 11.10.2026)
  const url = `${BERN_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=Geoportal_Baumkataster:Baumkataster` +
    `&OUTPUTFORMAT=GEOJSON&SRSNAME=urn:ogc:def:crs:EPSG::2056&BBOX=${bboxLv95(lat, lon, radiusM)}`
  const r = await holeJson<{ features?: { properties?: Record<string, unknown> }[] }>(url, {}, 30000, signal)
  const baeume: KatasterBaum[] = []
  for (const f of r.daten.features ?? []) {
    const pr = f.properties ?? {}
    const e = Number(pr.HKOORD), n = Number(pr.VKOORD)
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue
    const art = pr.ART_BESCHRIEB || pr.GATTUNG_BESCHRIEB || 'Baum'
    baeume.push({ id: `bern:${pr.NUMMER ?? pr.OBJECTID}`, p: [e, n], name: `${art} Nr. ${pr.NUMMER ?? '?'} (Baumkataster)` })
  }
  return { ...r, daten: baeume }
}

export const BAUMKATASTER: BaumQuelle[] = [
  { id: 'bern', quelleId: 'bern.baum', name: 'Baumkataster Stadt Bern', quellenangabe: 'Geodaten Stadt Bern, Baumkataster', gemeinden: [351], laden: bernLaden },
]

/** Quelle für die Gemeinden im AV-Ausschnitt (erste passende) */
export function baumQuelleFuer(bfs: (number | null)[]): BaumQuelle | null {
  return BAUMKATASTER.find(q => bfs.some(b => b !== null && q.gemeinden.includes(b))) ?? null
}
