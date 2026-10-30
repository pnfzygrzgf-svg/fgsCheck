// ── Verkehrsdaten der Stadt Bern (DTV) für die Vorbelegung des Bedarfsmoduls (Nutzerentscheid 20.10.2026) ──
//
// Geoportal, Service «Flaechendeckende_Verkehrsdaten», Layer 0 «Verkehr_Strasse» (wie VeloroutenCheck src/bern.ts): je
// Strassenabschnitt eine Linie auf der Strassenachse mit Strassenname, Nt (Motorfahrzeuge pro Stunde am Tag, 06–22 Uhr) und Nn
// (pro Stunde in der Nacht, 22–06 Uhr) für beide Richtungen zusammen, Erstellt_am (Stand). DTV = round(16·Nt + 8·Nn); die Formel
// hat VeloroutenCheck gegen den Datei-Export (Feld Dtv) und eine Messstelle bestätigt. Laut Metadaten DTV des Vorjahres, geführt
// für Strassen über 2000 Motorfahrzeuge pro Tag und im Stadtteil 1 Altstadt; nur eine Grössenordnung, keine Zählresultate.
// Felder Nt2/Nn2 bleiben ungenutzt (Bedeutung im Dienst nicht beschrieben). Geprüft 20.10.2026 an der Mühlemattstrasse.

import type { P } from '../geo'
import { arcgisUrl, arcgisHolen, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'
import type { Bereich } from './haltestellen'

export interface VdLinie {
  id: string
  strasse: string
  /** DTV (Motorfahrzeuge pro Tag), null ohne Nt/Nn */
  dtv: number | null
  /** Linienzüge in LV95 */
  teile: P[][]
  /** Stand (Erstellt_am) als TT.MM.JJJJ, null ohne Angabe */
  stand: string | null
}
export interface VerkehrsdatenStand { linien: VdLinie[]; bereich: Bereich }
export type VerkehrsdatenErgebnis = VerkehrsdatenStand | { fehler: string }

/** DTV aus Nt (Tag, 16 h) und Nn (Nacht, 8 h) */
export const dtvAusNtNn = (nt: number, nn: number): number => Math.round(16 * nt + 8 * nn)

const zahl = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const zweiZahlen = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number' && Number.isFinite(x[0]) && Number.isFinite(x[1])

/** Linienzug (Koordinaten mit z) -> P[], ungültige Punkte entfallen; unter zwei Punkten null */
function zug(roh: unknown): P[] | null {
  if (!Array.isArray(roh)) return null
  const z = roh.filter(zweiZahlen).map(c => [c[0], c[1]] as P)
  return z.length >= 2 ? z : null
}

/** Datum (ms seit 1970) als TT.MM.JJJJ (UTC) */
export function standText(ms: unknown): string | null {
  const t = zahl(ms)
  if (t === null) return null
  const d = new Date(t)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
}

/** Geoportal-Antwort (GeoJSON in LV95) -> Linien; Linien ohne Geometrie entfallen, ohne Nt/Nn mit dtv null */
export function verkehrsdatenAusGeoportal(gj: ArcgisGeoJson): VdLinie[] {
  const aus: VdLinie[] = []
  for (const f of gj.features ?? []) {
    const g = f.geometry, pr = f.properties ?? {}
    if (!g || !Array.isArray(g.coordinates)) continue
    const roh = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    const teile = (roh as unknown[]).map(zug).filter((z): z is P[] => !!z)
    if (!teile.length) continue
    const nt = zahl(pr.Nt), nn = zahl(pr.Nn)
    aus.push({ id: `bernvd:${String(pr.Objectid ?? aus.length)}`, strasse: typeof pr.Strassenname === 'string' ? pr.Strassenname.trim() : '',
      dtv: nt !== null && nn !== null && nt >= 0 && nn >= 0 ? dtvAusNtNn(nt, nn) : null, teile, stand: standText(pr.Erstellt_am) })
  }
  return aus
}

export const VD_DIENST = 'Flaechendeckende_Verkehrsdaten'
/** Kennung im Quellenregister (daten/quellenregister.ts) */
export const VD_QUELLE_ID = 'bern.dtv'
export const verkehrsdatenUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(VD_DIENST, lat, lon, radiusM, 'Objectid,Strassenname,Nt,Nn,Erstellt_am')

/** Verkehrsdaten der Stadt Bern im Rechteck ±radiusM um den Ort (Geoportal) */
export async function ladeVerkehrsdatenBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<VdLinie[]>> {
  const r = await arcgisHolen(verkehrsdatenUrl(lat, lon, radiusM), signal)
  return { ...r, daten: verkehrsdatenAusGeoportal(r.daten) }
}
