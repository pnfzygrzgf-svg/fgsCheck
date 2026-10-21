// ── Haltestellen (Bus, Tram) für die Vorbelegung des Bedarfsmoduls ──
//
// In der Stadt Bern aus dem Geoportal (Layer «Haltestellen», wie VeloroutenCheck src/bern.ts): je Haltekante ein Punkt mit
// Punktname, Kante und Rubrik (Haltestelle bzw. Station Drahtseilbahn; geprüft 20.10.2026). Ein Feld für Bus oder Tram hat der
// Layer nicht (Nummer_nach nennt nur Linien und Ziele): die Art bleibt «ÖV». Stationen der Drahtseilbahn zählen nicht.
// Ausserhalb Berns und wenn das Geoportal ausfällt aus OSM: highway=bus_stop, railway=tram_stop, public_transport=platform bzw.
// stop_position mit bus/trolleybus/tram=yes, aus derselben Overpass-Abfrage wie das Strassennetz (osm.overpassAbfrage, Umkreis
// HALT_OSM_RADIUS_M). Die Vorbelegung (bedarf/vorbelegung.ts) misst den Abstand zum Streifen und braucht den abgedeckten Bereich:
// «keine Haltestelle» gilt nur, wo die geladenen Daten den Umkreis um den Streifen ganz enthalten.

import { type P, lv95, dist } from '../geo'
import { HALT_OSM_RADIUS_M } from './osm'
import { arcgisUrl, arcgisHolen, GEOPORTAL_BERN, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

/** Bereich, den geladene Daten ganz abdecken: Kreis (Overpass around) bzw. Quadrat ±radiusM (Geoportal) um die Mitte (LV95) */
export interface Bereich { mitte: P; radiusM: number; form: 'kreis' | 'quadrat' }
/** Liegt der Kreis mit Radius rand um p ganz im Bereich? */
export function imBereich(p: P, rand: number, b: Bereich): boolean {
  const r = b.radiusM - rand + 1e-9
  return b.form === 'kreis' ? dist(p, b.mitte) <= r : Math.max(Math.abs(p[0] - b.mitte[0]), Math.abs(p[1] - b.mitte[1])) <= r
}

export type HaltArt = 'bus' | 'tram' | 'bus_tram' | 'oev'
export interface OevHalt { id: string; name: string; p: P; art: HaltArt
  /** nur OSM (Automatik Paket B): Tags und Knoten-Id (bus_bay, stop_position auf der Fahrbahn) */
  tags?: Record<string, string>; osmId?: number }
/** Haltestellen für die Vorbelegung: Punkte, Herkunft (Text), Quelle und abgedeckter Bereich; zusatz: z. B. Ausfall des Geoportals */
export interface HaltestellenStand { quelle: 'geoportal' | 'osm'; herkunft: string; halte: OevHalt[]; bereich: Bereich; zusatz?: string }
export type HaltestellenErgebnis = HaltestellenStand | { fehler: string }

export const HALT_TEXT: Record<HaltArt, string> = { bus: 'Bushaltestelle', tram: 'Tramhaltestelle', bus_tram: 'Bus- und Tramhaltestelle',
  oev: 'Haltestelle' }

/** Geoportal-Antwort (GeoJSON in LV95) -> Haltestellen; Stationen der Drahtseilbahn und Punkte ohne Lage entfallen */
export function haltestellenAusGeoportal(gj: ArcgisGeoJson): OevHalt[] {
  const aus: OevHalt[] = []
  for (const f of gj.features ?? []) {
    const g = f.geometry, pr = f.properties ?? {}
    if (g?.type !== 'Point' || !Array.isArray(g.coordinates)) continue
    const [e, n] = g.coordinates as unknown[]
    if (typeof e !== 'number' || typeof n !== 'number' || !Number.isFinite(e) || !Number.isFinite(n)) continue
    if (typeof pr.Rubrik === 'string' && /drahtseil/i.test(pr.Rubrik)) continue
    const name = typeof pr.Punktname === 'string' && pr.Punktname.trim() ? pr.Punktname.trim() : 'ohne Namen'
    const kante = typeof pr.Kante === 'string' && pr.Kante.trim() ? `, Kante ${pr.Kante.trim()}` : ''
    aus.push({ id: `bernhst:${String(pr.Objectid ?? aus.length)}`, name: name + kante, p: [e, n], art: 'oev' })
  }
  return aus
}

export const HALT_DIENST = 'Haltestellen'
export const haltestellenUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(HALT_DIENST, lat, lon, radiusM, 'Objectid,Punktname,Rubrik,Kante')

/** Haltestellen der Stadt Bern im Rechteck ±radiusM um den Ort (Geoportal) */
export async function ladeHaltestellenBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<OevHalt[]>> {
  const r = await arcgisHolen(haltestellenUrl(lat, lon, radiusM), signal)
  return { ...r, daten: haltestellenAusGeoportal(r.daten) }
}

interface RohKnoten { type?: string; id?: number; lat?: number; lon?: number; tags?: Record<string, string> }
/** Art einer OSM-Haltestelle nach ihren Tags, null = keine Bus- bzw. Tramhaltestelle */
export function osmHaltArt(t: Record<string, string>): HaltArt | null {
  const pt = t.public_transport === 'platform' || t.public_transport === 'stop_position'
  const bus = t.highway === 'bus_stop' || (pt && (t.bus === 'yes' || t.trolleybus === 'yes'))
  const tram = t.railway === 'tram_stop' || (pt && t.tram === 'yes')
  return bus && tram ? 'bus_tram' : bus ? 'bus' : tram ? 'tram' : null
}
/** OSM-Rohantwort (Overpass) -> Haltestellen in LV95, ohne Doppel */
export function haltestellenAusOsm(roh: unknown): OevHalt[] {
  const aus: OevHalt[] = [], gesehen = new Set<number>()
  for (const e of (roh as { elements?: RohKnoten[] } | null)?.elements ?? []) {
    if (e.type !== 'node' || typeof e.id !== 'number' || typeof e.lat !== 'number' || typeof e.lon !== 'number' || gesehen.has(e.id)) continue
    const art = osmHaltArt(e.tags ?? {})
    if (!art) continue
    gesehen.add(e.id)
    aus.push({ id: `osm:${e.id}`, name: e.tags?.name?.trim() || 'ohne Namen', p: lv95(e.lat, e.lon), art, tags: { ...(e.tags ?? {}) }, osmId: e.id })
  }
  return aus
}

/** Stand des Geoportals in Bern: wird geladen, geladen, Fehler */
export type BernHalte = { laedt: true } | { halte: OevHalt[] } | { fehler: string }

/**
 * Haltestellen für die Vorbelegung: in Bern aus dem Geoportal (Rechteck ±bernRadiusM um den Ladeort), ausserhalb aus OSM
 * (Umkreis HALT_OSM_RADIUS_M); fällt das Geoportal aus, aus OSM mit Hinweis. null: noch nicht vollständig (OSM bzw. Geoportal
 * lädt). { fehler }: weder Geoportal noch OSM vorhanden.
 */
export function haltestellenStand(bern: BernHalte | null, osmRoh: unknown | null, ladeort: P, bernRadiusM: number,
  osmFehler = false): HaltestellenErgebnis | null {
  const osm = (zusatz?: string): HaltestellenErgebnis | null => {
    if (osmRoh) return { quelle: 'osm', herkunft: 'OSM', halte: haltestellenAusOsm(osmRoh),
      bereich: { mitte: ladeort, radiusM: HALT_OSM_RADIUS_M, form: 'kreis' }, ...(zusatz ? { zusatz } : {}) }
    return osmFehler || zusatz ? { fehler: zusatz ?? 'OpenStreetMap nicht geladen' } : null
  }
  if (!bern) return osm()
  if ('laedt' in bern) return null
  if ('fehler' in bern) return osm(`${GEOPORTAL_BERN} nicht erreichbar (${bern.fehler})`)
  return { quelle: 'geoportal', herkunft: GEOPORTAL_BERN, halte: bern.halte, bereich: { mitte: ladeort, radiusM: bernRadiusM, form: 'quadrat' } }
}
