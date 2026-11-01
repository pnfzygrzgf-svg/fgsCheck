// ── Schulen, Kindergärten und Heime im Umkreis für die Vorbelegung (besonderer Grund; Automatik Paket C, 21.10.2026) ──
//
// Stadt Bern (Geoportal): Services «Volksschulen» und «Kindergaerten», je Layer 0 (Punkte; Punktname, Rubrik_Desc = «Volksschule»
// bzw. «Kindergarten»; geprüft 21.10.2026: 58 Volksschulen, 130 Kindergärten im ganzen Dienst). Kindertagesstätten bewusst nicht
// (Nutzerentscheid). Adressen, Telefon und E-Mail werden nicht abgefragt.
// Überall aus OSM (gleiche Overpass-Abfrage wie das Strassennetz, eigene Menge im Umkreis SCHULEN_OSM_RADIUS_M):
// amenity=school|kindergarten|social_facility|nursing_home und social_facility=nursing_home|group_home; Flächen (Wege,
// Relationen) mit ihrem Mittelpunkt. Ausserhalb Berns nur OSM. Nur Daten, keine Regeln.

import { type P, lv95 } from '../geo'
import { arcgisUrl, arcgisHolen, arcgisPaar, punktLage, textFeld, featureId, GEOPORTAL_BERN, type ArcgisGeoJson, type BernLaden } from './geoportal'
import type { Abruf } from './holen'
import type { Bereich } from './haltestellen'
import { SCHULEN_OSM_RADIUS_M } from './osm'

export type SchulArt = 'schule' | 'kindergarten' | 'heim' | 'sozial'
export const SCHUL_TEXT: Record<SchulArt, string> = { schule: 'Schule', kindergarten: 'Kindergarten', heim: 'Heim',
  sozial: 'soziale Einrichtung' }
export interface SchulOrt {
  id: string; art: SchulArt; name: string; p: P; quelle: 'geoportal' | 'osm'
  /** OSM: Tag, der die Art belegt (z. B. amenity=school) */
  tag?: string
  /** OSM-Fläche (Weg, Relation): Umriss als Rechteck ihrer Grenzen (out bb) bzw. ihre Geometrie; Abstand zum Rand statt zum Mittelpunkt */
  umriss?: P[]
  /** Umriss ist nur das Rechteck der Grenzen (out bb), nicht die Fläche selbst: Abstand zum Rand dieses Rechtecks (Runde 4) */
  grenzrechteck?: true
}
/** Volksschulen und Kindergärten der Stadt Bern; null: dieser Layer war nicht erreichbar */
export interface SchulenBernDaten { volksschulen: SchulOrt[] | null; kindergaerten: SchulOrt[] | null }
/** Schulen etc. für die Vorbelegung: Geoportal (nur Bern) und OSM, je mit abgedecktem Bereich; hinweis z. B. Ausfall des Geoportals */
export interface SchulenStand {
  bern: (SchulenBernDaten & { bereich: Bereich }) | null
  osm: { orte: SchulOrt[]; bereich: Bereich } | null
  hinweis?: string
}
export type SchulenErgebnis = SchulenStand | { fehler: string }

export const VS_DIENST = 'Volksschulen'
export const KG_DIENST = 'Kindergaerten'

/** Geoportal-Antwort (Punkte) -> Orte der Art art; Punkte ohne Lage entfallen */
export function schulenAusGeoportal(gj: ArcgisGeoJson, art: 'schule' | 'kindergarten'): SchulOrt[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const p = punktLage(f)
    return p ? [{ id: featureId(art === 'schule' ? 'bernvs' : 'bernkg', f, i), art, name: textFeld(f.properties?.Punktname) ?? 'ohne Namen',
      p, quelle: 'geoportal' as const }] : []
  })
}

export const volksschulenUrl = (lat: number, lon: number, radiusM: number) => arcgisUrl(VS_DIENST, lat, lon, radiusM, 'Objectid,Punktname,Rubrik_Desc')
export const kindergaertenUrl = (lat: number, lon: number, radiusM: number) => arcgisUrl(KG_DIENST, lat, lon, radiusM, 'Objectid,Punktname,Rubrik_Desc')

/** Volksschulen und Kindergärten im Rechteck ±radiusM um den Ort (zwei Abfragen) */
export async function ladeSchulenBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal):
  Promise<Abruf<SchulenBernDaten> & { hinweis: string | null }> {
  const r = await arcgisPaar(arcgisHolen(volksschulenUrl(lat, lon, radiusM), signal), arcgisHolen(kindergaertenUrl(lat, lon, radiusM), signal),
    ['Volksschulen', 'Kindergärten'])
  return { ...r, daten: { volksschulen: r.daten.a && schulenAusGeoportal(r.daten.a, 'schule'),
    kindergaerten: r.daten.b && schulenAusGeoportal(r.daten.b, 'kindergarten') }, hinweis: r.daten.hinweis }
}

/** Art eines OSM-Objekts nach seinen Tags mit dem belegenden Tag, null = keine Schule, kein Kindergarten, kein Heim */
export function osmSchulArt(t: Record<string, string>): { art: SchulArt; tag: string } | null {
  const sf = t.social_facility, am = t.amenity
  if (sf === 'nursing_home' || sf === 'group_home') return { art: 'heim', tag: `social_facility=${sf}` }
  if (am === 'nursing_home') return { art: 'heim', tag: 'amenity=nursing_home' }
  if (am === 'school') return { art: 'schule', tag: 'amenity=school' }
  if (am === 'kindergarten') return { art: 'kindergarten', tag: 'amenity=kindergarten' }
  if (am === 'social_facility') return { art: 'sozial', tag: sf ? `amenity=social_facility, social_facility=${sf}` : 'amenity=social_facility' }
  return null
}

interface RohElement { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number };
  bounds?: { minlat?: number; minlon?: number; maxlat?: number; maxlon?: number };
  geometry?: ({ lat?: number; lon?: number } | null)[]; tags?: Record<string, string> }
const ll = (x: { lat?: number; lon?: number } | null | undefined): [number, number] | null =>
  x && typeof x.lat === 'number' && typeof x.lon === 'number' && Number.isFinite(x.lat) && Number.isFinite(x.lon) ? [x.lat, x.lon] : null

/** OSM-Rohantwort -> Schulen, Kindergärten, Heime in LV95 (Knoten mit Lage, Wege und Relationen mit Umriss aus ihren Grenzen bzw.
 * ihrer Geometrie und Mittelpunkt), ohne Doppel; Elemente ohne Lage entfallen */
export function schulenAusOsm(roh: unknown): SchulOrt[] {
  const aus: SchulOrt[] = [], gesehen = new Set<string>()
  for (const e of (roh as { elements?: RohElement[] } | null)?.elements ?? []) {
    if (typeof e.id !== 'number' || !e.type || gesehen.has(e.type + e.id)) continue
    const a = osmSchulArt(e.tags ?? {})
    if (!a) continue
    let lage = e.type === 'node' ? ll(e) : ll(e.center)
    let umriss: P[] | undefined, grenzrechteck = false
    const b = e.bounds, lo = b && ll({ lat: b.minlat, lon: b.minlon }), hi = b && ll({ lat: b.maxlat, lon: b.maxlon })
    if (e.type !== 'node' && lo && hi) {
      umriss = [lv95(lo[0], lo[1]), lv95(lo[0], hi[1]), lv95(hi[0], hi[1]), lv95(hi[0], lo[1])]
      grenzrechteck = true
      lage ??= [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
    }
    if (e.geometry) {
      const g = e.geometry.map(ll).filter((x): x is [number, number] => !!x)
      if (g.length) {
        lage ??= [g.reduce((s, x) => s + x[0], 0) / g.length, g.reduce((s, x) => s + x[1], 0) / g.length]
        if (g.length >= 3) { umriss = g.map(x => lv95(x[0], x[1])); grenzrechteck = false }
      }
    }
    if (!lage) continue
    gesehen.add(e.type + e.id)
    aus.push({ id: `osm:${e.type}/${e.id}`, art: a.art, name: e.tags?.name?.trim() || 'ohne Namen', p: lv95(lage[0], lage[1]),
      quelle: 'osm', tag: a.tag, ...(umriss ? { umriss } : {}), ...(umriss && grenzrechteck ? { grenzrechteck: true as const } : {}) })
  }
  return aus
}

/**
 * Schulen etc. für die Vorbelegung: OSM (Kreis SCHULEN_OSM_RADIUS_M um den Ladeort) überall, dazu in Bern das Geoportal (Quadrat
 * ±bernRadiusM). null: noch nicht vollständig (Geoportal lädt bzw. OSM fehlt noch). Fällt das Geoportal aus, OSM mit Hinweis;
 * { fehler }: weder Geoportal noch OSM.
 */
export function schulenStand(bern: BernLaden<SchulenBernDaten> | null, osmRoh: unknown | null, ladeort: P, bernRadiusM: number,
  osmFehler = false): SchulenErgebnis | null {
  const osm = osmRoh ? { orte: schulenAusOsm(osmRoh), bereich: { mitte: ladeort, radiusM: SCHULEN_OSM_RADIUS_M, form: 'kreis' as const } } : null
  if (bern && 'laedt' in bern) return null
  if (bern && 'fehler' in bern) {
    const hinweis = `${GEOPORTAL_BERN} nicht erreichbar (${bern.fehler})`
    return osm ? { bern: null, osm, hinweis } : { fehler: hinweis }
  }
  if (!osm && !bern) return osmFehler ? { fehler: 'OpenStreetMap nicht geladen' } : null
  return { bern: bern ? { ...bern.daten, bereich: { mitte: ladeort, radiusM: bernRadiusM, form: 'quadrat' } } : null, osm,
    ...(bern?.hinweis ? { hinweis: bern.hinweis } : {}) }
}
