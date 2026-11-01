// ── Signalisierte Höchstgeschwindigkeit der Stadt Bern (Geoportal) als amtliches Tempo (K0, Nutzerentscheid 23.10.2026) ──
//
// Wie fgsCheck (src/daten/vsig.ts, Automatik Paket C vom 21.10.2026): ArcGIS REST des Geoportals, Service
// «Signalisierte_Hoechstgeschwindigkeit», Layer 0 (Linien auf der Strassenachse), Felder V_sig (km/h; im Dienst 20, 30, 40, 50, 60,
// 80 und leer) und Strassenname. Abfrage und Antwort in LV95 (inSR/outSR 2056); Antworten ohne EPSG:2056, mit ArcGIS-Fehler oder
// gekappt (Übertragungsgrenze) werden abgelehnt. Der Dienst erlaubt den Zugriff aus dem Browser (CORS, geprüft in fgsCheck
// 20.10.2026). Quellenangabe «Geodaten Stadt Bern», in den Texten «Geoportal Stadt Bern».
// Zuständigkeit wie fgsCheck: nur, wenn die AV-Fläche unter dem Knoten bzw. Zufahrtspunkt zur Stadt Bern gehört (BFS 351; nicht nach
// allen Gemeinden im Ausschnitt, damit Köniz an der Grenze kein Berner Tempo bekommt). Die Zuordnung zur Fahrlinie rechnet der Kern
// (rechner/tempo.amtlichBei: nächste Linie bis 8 m, längs, leere Linie -> OSM). Nur Daten, keine Regeln.

import { type P, lv95, imPolygon } from '../geo'
import type { AvFlaeche } from './av'
import type { TempoAmtlichDaten, TempoAmtlichLinie } from '../rechner/typen'
import { holeJson, AbrufFehler, type Abruf } from './holen'

export const BERN_GEOPORTAL = 'https://map.bern.ch/arcgis/rest/services/Geoportal'
export const VSIG_DIENST = 'Signalisierte_Hoechstgeschwindigkeit'
/** BFS-Nummer der Stadt Bern */
export const BERN_BFS = 351
/** Herkunft in den Texten der Rechnung */
export const GEOPORTAL_BERN = 'Geoportal Stadt Bern'
/** Quellenangabe (Pflicht nach den Nutzungsbedingungen) */
export const VSIG_QUELLENANGABE = 'Geodaten Stadt Bern, Signalisierte Höchstgeschwindigkeit'

export interface ArcgisGeoJson {
  crs?: { properties?: { name?: string } }
  features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[]
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
  error?: { code?: number; message?: string }
}

/** Abfrage-URL: Rechteck ±radiusM um den Ort in LV95, Antwort GeoJSON in LV95, Koordinaten auf cm */
export function vsigUrl(lat: number, lon: number, radiusM: number): string {
  const [e, n] = lv95(lat, lon)
  const q = new URLSearchParams({
    geometry: [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(v => v.toFixed(0)).join(','),
    geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Objectid,V_sig,Strassenname', outSR: '2056', f: 'geojson', geometryPrecision: '2',
  })
  return `${BERN_GEOPORTAL}/${VSIG_DIENST}/MapServer/0/query?${q}`
}

/** Antwort prüfen: ArcGIS-Fehler (HTTP 200 mit error), gekappte Antwort, nicht LV95 -> AbrufFehler */
export function vsigPruefen(gj: ArcgisGeoJson): void {
  if (gj.error) throw new AbrufFehler(`ArcGIS ${gj.error.code ?? ''} ${gj.error.message ?? ''}`.trim())
  if (gj.exceededTransferLimit === true || gj.properties?.exceededTransferLimit === true)
    throw new AbrufFehler('Antwort unvollständig (Übertragungsgrenze des Dienstes)')
  if (!/(^|[^0-9])2056$/.test(gj.crs?.properties?.name ?? '')) throw new AbrufFehler('Antwort nicht in LV95 (EPSG:2056)')
}

const istZahlPaar = (x: unknown): x is number[] =>
  Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number' && Number.isFinite(x[0]) && Number.isFinite(x[1])

/** Geoportal-Antwort -> Linien (LineString bzw. MultiLineString, z entfällt); V_sig ausserhalb 5–130 km/h gilt als ohne Angabe */
export function vsigAusGeoportal(gj: ArcgisGeoJson): TempoAmtlichLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const g = f.geometry, pr = f.properties ?? {}
    if (!g || !Array.isArray(g.coordinates)) return []
    const roh = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    const teile = (roh as unknown[]).map(z => (Array.isArray(z) ? z.filter(istZahlPaar).map(c => [c[0], c[1]] as P) : []))
      .filter(z => z.length >= 2)
    if (!teile.length) return []
    const v = typeof pr.V_sig === 'number' && Number.isFinite(pr.V_sig) && pr.V_sig >= 5 && pr.V_sig <= 130 ? pr.V_sig : null
    const strasse = typeof pr.Strassenname === 'string' ? pr.Strassenname.trim() : ''
    return [{ id: `bernvsig:${String(pr.Objectid ?? i)}`, strasse, vSig: v, teile }]
  })
}

/** Signalisierte Höchstgeschwindigkeit im Rechteck ±radiusM um den Ort */
export async function ladeVsigBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<TempoAmtlichLinie[]>> {
  const r = await holeJson<ArcgisGeoJson>(vsigUrl(lat, lon, radiusM), {}, 30000, signal)
  vsigPruefen(r.daten)
  return { ...r, daten: vsigAusGeoportal(r.daten) }
}

/** Eingabe der Rechnung aus den Linien: Bereich = Quadrat ±radiusM um den Ladeort (LV95) */
export const vsigRechnung = (linien: TempoAmtlichLinie[], mitte: P, radiusM: number): TempoAmtlichDaten =>
  ({ linien, bereich: { mitte, radiusM }, quelle: GEOPORTAL_BERN })

/** Gemeinde (BFS) der AV-Fläche an einem Punkt: zuerst Strasse bzw. Weg, sonst jede Fläche; null ohne Treffer (wie fgsCheck) */
export function bfsAmPunkt(p: P, av: readonly AvFlaeche[]): number | null {
  const f = av.find(x => x.art === 'Strasse_Weg' && imPolygon(p, x.ringe)) ?? av.find(x => imPolygon(p, x.ringe))
  return f ? f.bfs : null
}
/** Zuständigkeit der Berner Dienste: nur nach der Gemeinde der AV-Fläche unter dem Punkt (Knoten bzw. Zufahrtspunkt) */
export const bernZustaendig = (p: P | null | undefined, av: readonly AvFlaeche[]): boolean => !!p && bfsAmPunkt(p, av) === BERN_BFS
