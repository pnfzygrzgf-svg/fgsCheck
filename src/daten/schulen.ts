// ── Schulen, Kindergärten und Heime im Umkreis für die Vorbelegung (besonderer Grund, 21.10.2026) ──
//
// Stadt Bern (Geoportal): Services «Volksschulen» und «Kindergaerten», je Layer 0 (Punkte; Punktname, Rubrik_Desc = «Volksschule»
// bzw. «Kindergarten»; geprüft 21.10.2026: 58 Volksschulen, 130 Kindergärten im ganzen Dienst). Adressen, Telefon und E-Mail werden
// nicht abgefragt.
// Seit 01.11.2026 (vorher Kindertagesstätten bewusst nicht) dazu WEITERE_BERN: Kindertagesstätten (als
// Kindergarten), Kinderangebote (als Schule), Heime und Spitäler (als Heim; Dienst «stadtplan», Layer 620 bzw. 624, ganzer Kanton,
// darum nur im Rechteck). Berufs-, Mittel- und Hochschulen zählen nicht. Felder des Diensts ungeprüft: der Name kommt
// aus Punktname bzw. punktname (stadtplan klein geschrieben, geprüft 01.11.2026).
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
  /** Umriss ist nur das Rechteck der Grenzen (out bb), nicht die Fläche selbst: Abstand zum Rand dieses Rechtecks */
  grenzrechteck?: true
  /** Geoportal, WEITERE_BERN: Bezeichnung der Art im Text (z. B. «Kindertagesstätte», «Spital») */
  wort?: string
}
/** Volksschulen und Kindergärten der Stadt Bern; weitere: Kitas, Kinderangebote, Heime, Spitäler (seit 01.11.2026); null: Layer nicht erreichbar */
export interface SchulenBernDaten { volksschulen: SchulOrt[] | null; kindergaerten: SchulOrt[] | null; weitere?: SchulOrt[] | null }

/** Weitere Berner Dienste: Dienst (Ordner Geoportal bzw. stadtplan), Layer, Art und Bezeichnung */
export const WEITERE_BERN: readonly { dienst: string; ordner: 'Geoportal' | 'stadtplan'; layer: number; art: SchulArt; wort: string; kurz: string }[] = [
  { dienst: 'Kindertagesstaetten', ordner: 'Geoportal', layer: 0, art: 'kindergarten', wort: 'Kindertagesstätte', kurz: 'kita' },
  { dienst: 'Kinderangebote', ordner: 'Geoportal', layer: 0, art: 'schule', wort: 'Kinderangebot', kurz: 'kinder' },
  { dienst: 'stadtplan', ordner: 'stadtplan', layer: 620, art: 'heim', wort: 'Heim', kurz: 'heim' },
  { dienst: 'stadtplan', ordner: 'stadtplan', layer: 624, art: 'heim', wort: 'Spital', kurz: 'spital' },
]
export const weitereUrl = (w: typeof WEITERE_BERN[number], lat: number, lon: number, radiusM: number) => {
  const u = arcgisUrl(w.dienst, lat, lon, radiusM, '*', { layer: w.layer })
  return w.ordner === 'stadtplan' ? u.replace('/Geoportal/stadtplan/', '/stadtplan/') : u
}
/** Geoportal-Antwort eines weiteren Diensts -> Orte (Art und Bezeichnung nach WEITERE_BERN) */
export function weitereAusGeoportal(gj: ArcgisGeoJson, w: typeof WEITERE_BERN[number]): SchulOrt[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const p = punktLage(f), pr = f.properties ?? {}
    return p ? [{ id: featureId(`bern${w.kurz}`, f, i), art: w.art, wort: w.wort, p, quelle: 'geoportal' as const,
      name: textFeld(pr.Punktname) ?? textFeld(pr.punktname) ?? textFeld(pr.Name) ?? 'ohne Namen' }] : []
  })
}
/** Alle weiteren Dienste parallel; einzelne Ausfälle als Hinweis, alle ausgefallen: null */
async function ladeWeitere(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<{ orte: SchulOrt[] | null; hinweis: string | null }> {
  const r = await Promise.allSettled(WEITERE_BERN.map(w => arcgisHolen(weitereUrl(w, lat, lon, radiusM), signal).then(a => weitereAusGeoportal(a.daten, w))))
  for (const x of r) if (x.status === 'rejected' && (x.reason as Error)?.name === 'AbortError') throw x.reason
  const ok = r.flatMap(x => (x.status === 'fulfilled' ? [x.value] : []))
  const fehler = r.flatMap((x, k) => (x.status === 'rejected' ? [`${WEITERE_BERN[k].wort} nicht erreichbar`] : []))
  return { orte: ok.length ? ok.flat() : null, hinweis: fehler.length ? fehler.join('; ') : null }
}
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
  const [r, weitere] = await Promise.all([
    arcgisPaar(arcgisHolen(volksschulenUrl(lat, lon, radiusM), signal), arcgisHolen(kindergaertenUrl(lat, lon, radiusM), signal),
      ['Volksschulen', 'Kindergärten']),
    ladeWeitere(lat, lon, radiusM, signal)])
  const hinweis = [r.daten.hinweis, weitere.hinweis].filter(Boolean).join('; ') || null
  return { ...r, daten: { volksschulen: r.daten.a && schulenAusGeoportal(r.daten.a, 'schule'),
    kindergaerten: r.daten.b && schulenAusGeoportal(r.daten.b, 'kindergarten'), weitere: weitere.orte }, hinweis }
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
