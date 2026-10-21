// ── OpenStreetMap über Overpass: Strassennetz, Übergänge, Lichtsignale, Abbiegeverbote, Tramgleise im Umkreis ──
//
// Ausweichserver und Wiederholung nach dem Muster von VeloroutenCheck (src/osm.ts): Zeitgrenze je
// Versuch, bei 429/5xx kurz warten und den nächsten Server nehmen, abgebrochene Ergebnisse
// (`remark` mit Zeitüberschreitung/Speichergrenze) wie einen Serverfehler behandeln.
//
// Inhalt wie netz_osm.json des Berner Projekts (fgs_netz.aufbereiten): Wege der Klassen HW_ALLE mit Knoten-IDs,
// Abbiegeverbote (type=restriction, Rollen from/via/to), Übergangsknoten (fgs_netz.ist_uebergang), Tramgleise; dazu
// Ampeln (highway=traffic_signals) für die LSA-Einordnung (fgs_sicht_pruefen.Lichtsignale).
// Für die Vorbelegung des Bedarfsmoduls zusätzlich (eigene Mengen, ohne Fusswege nach sich zu ziehen; die Rechnung übergeht sie):
// Haltestellen und Strassenlampen, seit Automatik Paket C (21.10.2026) Schulen, Kindergärten und Heime (Umkreis
// SCHULEN_OSM_RADIUS_M, Flächen nur mit Mittelpunkt) sowie Vortrittszeichen (highway=give_way|stop) und Verkehrsschilder
// (traffic_sign) im ganzen Umkreis. Gemessen 21.10.2026 an der Mühlemattstrasse (300 m): 271 kB ohne, 277 kB mit beidem.

import { holeText, istAbbruch, AbrufFehler, type Abruf } from './holen'
import { lv95, dist, type P } from '../geo'

export interface OsmWeg { id: number; tags: Record<string, string>; knoten: number[]; geom: [number, number][] }
export interface OsmKnoten { id: number; tags: Record<string, string>; lat: number; lon: number }
export interface OsmRelation { id: number; tags: Record<string, string>; members: { type: string; ref: number; role: string }[] }
export interface OsmDaten {
  wege: OsmWeg[]               // Strassen (HW_ALLE), nach id aufsteigend
  tram: OsmWeg[]               // railway=tram
  uebergaenge: OsmKnoten[]     // Übergangsknoten (ist_uebergang)
  ampeln: OsmKnoten[]          // highway=traffic_signals
  relationen: OsmRelation[]    // type=restriction
  querungen: OsmWeg[]          // Fusswege über die Fahrbahn (footway=crossing bzw. Fussweg durch einen Übergangsknoten)
}

/** fgs_netz.HW_ALLE */
export const HW_ALLE = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street',
  'service', 'road', 'pedestrian', 'busway']

export const OVERPASS_ENDPOINTS = [
  'https://overpass.osm.ch/api/interpreter',       // Schweizer Mirror (SOSM)
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const REQUEST_TIMEOUT_MS = 25000
const MAX_BACKOFF_MS = 10000
/** warten; bricht mit AbortError ab, wenn signal abbricht (z. B. beim Verlassen der Prüfung) */
function warte(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    const abbruch = () => { clearTimeout(t); rej(new DOMException('abgebrochen', 'AbortError')) }
    if (signal?.aborted) { abbruch(); return }
    const t = setTimeout(() => { signal?.removeEventListener('abort', abbruch); res() }, ms)
    signal?.addEventListener('abort', abbruch, { once: true })
  })
}

// ── Sperre nach 429 bzw. Retry-After: «nicht vor t» für alle folgenden Overpass-Abfragen (Fair Use) ──
// Gilt für den Beginn jeder neuen Abfrage (automatische Suche und Laden eines Übergangs); innerhalb einer laufenden Abfrage
// bleiben die Ausweichserver (ein 429 gilt für den Server, der ihn sendet). Ohne Retry-After SPERRE_STANDARD_MS, höchstens
// SPERRE_MAX_MS (Schutz vor unsinnig langen Angaben). Retry-After liest der Browser nur, wenn der Server den Kopf über
// Access-Control-Expose-Headers freigibt; sonst gilt die Standardsperre. Ein 429 ohne CORS-Kopf erscheint nur als
// Netzwerkfehler und setzt keine Sperre (nicht unterscheidbar).
export const SPERRE_STANDARD_MS = 30000
export const SPERRE_MAX_MS = 120000
let sperreBis = 0                                    // Date.now()-Zeit, vor der keine neue Abfrage beginnt

/** Retry-After (Sekunden bzw. HTTP-Datum) -> Millisekunden ab jetzt, null ohne bzw. bei ungültiger Angabe */
export function retryAfterMs(wert: string | null, jetzt = Date.now()): number | null {
  const w = (wert ?? '').trim()
  if (!w) return null
  if (/^\d+$/.test(w)) return Number(w) * 1000
  const t = Date.parse(w)
  return Number.isFinite(t) ? Math.max(0, t - jetzt) : null
}
/** Sperre nach einer Antwort setzen bzw. verlängern (nie verkürzen): bei 429 bzw. wenn ein Retry-After mitkommt */
export function sperreNachAntwort(status: number, retryAfter: string | null, jetzt = Date.now()): void {
  const ra = retryAfterMs(retryAfter, jetzt)
  if (status !== 429 && ra === null) return
  sperreBis = Math.max(sperreBis, jetzt + Math.min(SPERRE_MAX_MS, ra ?? SPERRE_STANDARD_MS))
}
/** verbleibende Sperre in ms (0: frei) */
export const overpassSperre = (jetzt = Date.now()) => Math.max(0, sperreBis - jetzt)
/** nur für Tests */
export const sperreZuruecksetzen = () => { sperreBis = 0 }

export function overpassAbgebrochen(data: { remark?: unknown }): boolean {
  return typeof data.remark === 'string' && /runtime error|timed out|out of memory/i.test(data.remark)
}

/** Haltestellen (Bus, Tram) in der Abfrage: Umkreis um den Ladeort (Vorbelegung Bedarfsmodul: Haltestelle bis 50 m um Streifen, die
 * höchstens rund 30 m vom Ladeort liegen, abdeckung.NACHLADEN_M) */
export const HALT_OSM_RADIUS_M = 150
/** Strassenlampen (highway=street_lamp) in der Abfrage: Umkreis um den Ladeort (Hinweis zur Beleuchtung bis 25 m um den Streifen) */
export const LAMPEN_RADIUS_M = 100
/** Schulen, Kindergärten und Heime (amenity bzw. social_facility) in der Abfrage: Umkreis um den Ladeort (besonderer Grund bis 150 m
 * um den Streifen; 50 m Rand für den Abstand Streifen–Ladeort, sonst wäre der Umkreis nie ganz geladen und «keines» nie möglich) */
export const SCHULEN_OSM_RADIUS_M = 200

export function overpassAbfrage(lat: number, lon: number, radius: number): string {
  const ort = `${lat.toFixed(7)},${lon.toFixed(7)}`
  const um = `around:${radius},${ort}`
  const uh = `around:${Math.min(radius, HALT_OSM_RADIUS_M)},${ort}`, ul = `around:${Math.min(radius, LAMPEN_RADIUS_M)},${ort}`
  const us = `around:${Math.min(radius, SCHULEN_OSM_RADIUS_M)},${ort}`
  return `[out:json][timeout:25];(` +
    `way(${um})["highway"~"^(${HW_ALLE.join('|')})$"];` +
    `way(${um})["railway"="tram"];` +
    `)->.w;(` +
    `node(${um})["highway"="crossing"];` +
    `node(${um})["crossing"];` +
    `node(${um})["crossing_ref"];` +
    `node(${um})["crossing:markings"];` +
    `node(${um})["highway"="traffic_signals"];` +
    `)->.n;` +
    `rel(bw.w)["type"="restriction"]->.r;` +
    `(way(bn.n)["highway"~"^(footway|path|cycleway|steps|bridleway)$"];way(${um})["footway"="crossing"];)->.f;` +
    // Haltestellen und Strassenlampen (Vorbelegung bzw. Hinweise des Bedarfsmoduls): eigene Menge, damit sie keine Fusswege nach
    // sich ziehen (.f folgt nur den Übergangsknoten .n); die Rechnung übergeht sie (osmParsen)
    `(node(${uh})["highway"="bus_stop"];node(${uh})["railway"="tram_stop"];` +
    `node(${uh})["public_transport"~"^(platform|stop_position)$"][~"^(bus|trolleybus|tram)$"~"^yes$"];` +
    `node(${ul})["highway"="street_lamp"];)->.h;` +
    // Schulen, Kindergärten, Heime (Knoten, Wege, Relationen) und Vortrittszeichen bzw. Schilder: eigene Mengen .s und .v, nach
    // den Wegen ausgegeben (ein Weg, der zugleich Strasse ist, kommt so zuerst mit Geometrie); Flächen mit ihren Grenzen (bb: Abstand
    // zum Rand statt zum Mittelpunkt, Korrektur S9; wenige Zahlen je Fläche statt der ganzen Geometrie)
    `(nwr(${us})["amenity"~"^(school|kindergarten|social_facility|nursing_home)$"];` +
    `nwr(${us})["social_facility"~"^(nursing_home|group_home)$"];)->.s;` +
    `(node(${um})["highway"~"^(give_way|stop)$"];node(${um})["traffic_sign"];)->.v;` +
    `.w out body geom;.n out body;.r out body;.f out body geom;.h out body;.v out body;node.s;out body;(way.s;rel.s;);out tags bb;`
}

interface RohElement {
  type: string; id: number; tags?: Record<string, string>
  nodes?: number[]; geometry?: ({ lat: number; lon: number } | null)[]; lat?: number; lon?: number
  members?: { type: string; ref: number; role: string }[]
}

/** fgs_netz.ist_uebergang: highway=crossing, crossing=* (ausser no), crossing_ref oder crossing:markings */
export function istUebergang(t: Record<string, string>): boolean {
  if (t.crossing === 'no') return false
  return t.highway === 'crossing' || !!(t.crossing || t.crossing_ref || t['crossing:markings'])
}

export function osmParsen(data: { elements?: RohElement[] }): OsmDaten {
  const aus: OsmDaten = { wege: [], tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [] }
  const gesehen = new Set<string>()
  for (const e of data.elements ?? []) {
    const k = e.type + e.id
    if (gesehen.has(k)) continue
    gesehen.add(k)
    const tags = e.tags ?? {}
    if (e.type === 'way' && e.nodes && e.geometry && e.geometry.length === e.nodes.length) {
      const nds: number[] = [], geom: [number, number][] = []
      e.geometry.forEach((g, i) => { if (g) { nds.push(e.nodes![i]); geom.push([g.lat, g.lon]) } })
      if (nds.length < 2) continue
      if (HW_ALLE.includes(tags.highway ?? '')) aus.wege.push({ id: e.id, tags, knoten: nds, geom })
      if (tags.railway === 'tram') aus.tram.push({ id: e.id, tags, knoten: nds, geom })
      if (['footway', 'path', 'cycleway', 'steps', 'bridleway'].includes(tags.highway ?? ''))
        aus.querungen.push({ id: e.id, tags, knoten: nds, geom })
    } else if (e.type === 'node' && e.lat != null && e.lon != null) {
      const kn = { id: e.id, tags, lat: e.lat, lon: e.lon }
      if (istUebergang(tags)) aus.uebergaenge.push(kn)
      if (tags.highway === 'traffic_signals') aus.ampeln.push(kn)
    } else if (e.type === 'relation' && tags.type === 'restriction') {
      aus.relationen.push({ id: e.id, tags, members: e.members ?? [] })
    }
  }
  aus.wege.sort((a, b) => a.id - b.id)
  return aus
}

// ── Strassennamen für die Karte (14.10.2026): aus der Übergangssuche (Wegmitten im Ausschnitt, schon vor dem Klick) und aus
// der Rohantwort des Umkreis-Abrufs (Wegmitten aus der Geometrie, genauer), kein eigener Abruf ──
export interface Strassenname { name: string; lat: number; lon: number }
/** Mittelpunkt eines benannten befahrbaren Wegs aus der Übergangssuche (Overpass «out tags center»: Mitte der Wegbox) */
export interface StrassenMitte { id: number; name: string; lat: number; lon: number }
/** je Name höchstens eine Beschriftung in diesem Abstand (m); längere Wege in Abschnitte dieser Länge geteilt */
export const NAMEN_ABSTAND_M = 120

/** je Name höchstens eine Beschriftung pro abstand: in der Reihenfolge der Kandidaten (die ersten haben Vorrang) */
function ausduennen(kand: { name: string; p: P; ll: [number, number] }[], abstand: number): Strassenname[] {
  const gesetzt = new Map<string, P[]>()
  const aus: Strassenname[] = []
  for (const k of kand) {
    const da = gesetzt.get(k.name) ?? []
    if (da.some(q => dist(q, k.p) < abstand)) continue
    gesetzt.set(k.name, [...da, k.p])
    aus.push({ name: k.name, lat: k.ll[0], lon: k.ll[1] })
  }
  return aus
}

/**
 * Beschriftungen der Strassennamen aus der Overpass-Rohantwort (ladeOsmRoh): je benannter Strasse (highway aus HW_ALLE mit
 * name) ein Punkt in der Mitte des Wegs, längere Wege in gleiche Abschnitte bis NAMEN_ABSTAND_M geteilt (je Abschnitt die
 * Mitte; ein Weg reicht oft weit über den Umkreis hinaus). Nur Punkte im Umkreis radius um mitte (LV95). Je Name höchstens
 * eine Beschriftung pro NAMEN_ABSTAND_M: längere Abschnitte zuerst (Mitte eines Strassenzugs statt eines kurzen Stücks am
 * Knoten), bei gleicher Länge der nähere.
 */
export function strassennamen(roh: unknown, mitte: P, radius: number, abstand = NAMEN_ABSTAND_M): Strassenname[] {
  const kand: { name: string; ll: [number, number]; p: P; laenge: number; d: number }[] = []
  const gesehen = new Set<number>()
  for (const e of (roh as { elements?: RohElement[] } | null)?.elements ?? []) {
    const name = e.tags?.name?.trim()
    if (e.type !== 'way' || !name || !HW_ALLE.includes(e.tags!.highway ?? '') || !e.geometry || gesehen.has(e.id)) continue
    gesehen.add(e.id)
    const ll = e.geometry.filter((g): g is { lat: number; lon: number } => !!g).map(g => [g.lat, g.lon] as [number, number])
    if (ll.length < 2) continue
    const pts = ll.map(([la, lo]) => lv95(la, lo))
    const kum = [0]
    for (let i = 1; i < pts.length; i++) kum.push(kum[i - 1] + dist(pts[i - 1], pts[i]))
    const L = kum[kum.length - 1]
    if (!(L > 0)) continue
    const n = Math.ceil(L / abstand)
    for (let j = 0; j < n; j++) {
      const s = (j + 0.5) * L / n
      let i = 1
      while (i < pts.length - 1 && kum[i] < s) i++
      const t = kum[i] > kum[i - 1] ? (s - kum[i - 1]) / (kum[i] - kum[i - 1]) : 0
      const p: P = [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])]
      const d = dist(p, mitte)
      if (d > radius) continue
      kand.push({ name, p, laenge: L / n, d,
        ll: [ll[i - 1][0] + t * (ll[i][0] - ll[i - 1][0]), ll[i - 1][1] + t * (ll[i][1] - ll[i - 1][1])] })
    }
  }
  kand.sort((a, b) => b.laenge - a.laenge || a.d - b.d)
  return ausduennen(kand, abstand)
}

/** Wegmitten (Overpass «out tags center») aus der Rohantwort der Übergangssuche: benannte Wege der Klassen HW_ALLE */
export function strassenMitten(roh: unknown): StrassenMitte[] {
  const aus: StrassenMitte[] = []
  const gesehen = new Set<number>()
  for (const e of (roh as { elements?: (RohElement & { center?: { lat: number; lon: number } })[] } | null)?.elements ?? []) {
    const name = e.tags?.name?.trim()
    if (e.type !== 'way' || !name || !HW_ALLE.includes(e.tags!.highway ?? '') || !e.center || gesehen.has(e.id)) continue
    if (!Number.isFinite(e.center.lat) || !Number.isFinite(e.center.lon)) continue
    gesehen.add(e.id)
    aus.push({ id: e.id, name, lat: e.center.lat, lon: e.center.lon })
  }
  return aus
}

/**
 * Beschriftungen für die Karte: Wegmitten der Übergangssuche (mitten, alle abgesuchten Ausschnitte) und nach dem Klick die
 * genaueren Namen aus dem Umkreis-Abruf (genau, strassennamen). Im Umkreis radius um ort gelten nur die genauen; ausserhalb
 * die Wegmitten, je Name höchstens eine pro abstand, auch gegen die genauen (die Vorrang haben). Ohne Wegelänge: je Name
 * zuerst die Mitte, die dem Schwerpunkt aller Mitten dieses Namens am nächsten liegt (Mitte eines Strassenzugs).
 */
export function namenKarte(mitten: StrassenMitte[], genau: Strassenname[] = [], ort: P | null = null, radius = 0,
  abstand = NAMEN_ABSTAND_M): Strassenname[] {
  const mit = (s: { name: string; lat: number; lon: number }) => ({ name: s.name, p: lv95(s.lat, s.lon), ll: [s.lat, s.lon] as [number, number] })
  const aussen = mitten.map(mit).filter(k => ort === null || dist(k.p, ort) > radius)
  const schwer = new Map<string, [number, number, number]>()
  for (const k of aussen) { const x = schwer.get(k.name) ?? [0, 0, 0]; schwer.set(k.name, [x[0] + k.p[0], x[1] + k.p[1], x[2] + 1]) }
  const d = (k: { name: string; p: P }) => { const [e, n, z] = schwer.get(k.name)!; return dist(k.p, [e / z, n / z]) }
  aussen.sort((a, b) => d(a) - d(b) || a.name.localeCompare(b.name))
  return ausduennen([...genau.map(mit), ...aussen], abstand)
}

const GESAMT_MS = 60000                              // alle Versuche zusammen höchstens so lange

async function overpassFetch(query: string, signal?: AbortSignal): Promise<Abruf<unknown>> {
  const init: RequestInit = { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query) }
  // Sperre nach 429: kurz warten; bei langer Sperre gleich melden statt das Zeitbudget zu verbrauchen
  const gesperrt = overpassSperre()
  if (gesperrt > GESAMT_MS / 2)
    throw new AbrufFehler(`Overpass ausgelastet (HTTP 429): nächste Abfrage in rund ${Math.ceil(gesperrt / 1000)} s möglich`, 429)
  if (gesperrt > 0) await warte(gesperrt, signal)
  const start = performance.now()
  let letzter = ''
  for (let runde = 0; runde < 2; runde++) {
    for (const url of OVERPASS_ENDPOINTS) {
      const rest = GESAMT_MS - (performance.now() - start)
      if (rest <= 1000) throw new AbrufFehler(`Overpass: keine Antwort innert ${GESAMT_MS / 1000} s (${letzter || 'Zeitüberschreitung'})`)
      const t0 = performance.now()
      let res: Response, text: string
      try { [res, text] = await holeText(url, init, Math.min(REQUEST_TIMEOUT_MS, rest), signal) }
      catch (e) {
        if (istAbbruch(e)) throw e
        letzter = new URL(url).host + ': ' + (e as Error).message; continue
      }
      if (res.ok) {
        let data: { remark?: unknown }
        try { data = JSON.parse(text) } catch { letzter = new URL(url).host + ': kein JSON'; continue }
        if (overpassAbgebrochen(data)) { letzter = new URL(url).host + ': abgebrochen'; continue }
        return { daten: data, ms: performance.now() - t0, bytes: text.length, quelle: new URL(url).host }
      }
      letzter = `${new URL(url).host}: HTTP ${res.status}`
      if (res.status === 429 || res.status >= 500) {
        const raKopf = res.headers.get('Retry-After'), ra = retryAfterMs(raKopf)
        sperreNachAntwort(res.status, raKopf)
        await warte(Math.min(MAX_BACKOFF_MS, ra ?? 1000 * 2 ** runde), signal)
        continue
      }
      // andere Fehler (z. B. 400, 406): nächster Server, nicht abbrechen
    }
  }
  throw new AbrufFehler('Overpass nicht erreichbar (' + (letzter || 'Netzwerkfehler') + ')')
}

/** Tags der Strassen (HW_ALLE) aus der Rohantwort nach Weg-Id (Vorbelegung Bedarfsmodul: Zone, Beleuchtung der Zufahrten) */
export function wegTags(roh: unknown): Map<number, Record<string, string>> {
  const m = new Map<number, Record<string, string>>()
  for (const e of (roh as { elements?: RohElement[] } | null)?.elements ?? [])
    if (e.type === 'way' && e.tags && HW_ALLE.includes(e.tags.highway ?? '') && !m.has(e.id)) m.set(e.id, e.tags)
  return m
}

/** Strassenlampen (highway=street_lamp) aus der Rohantwort in LV95, ohne Doppel */
export function strassenlampen(roh: unknown): P[] {
  const aus: P[] = [], gesehen = new Set<number>()
  for (const e of (roh as { elements?: RohElement[] } | null)?.elements ?? []) {
    if (e.type !== 'node' || e.tags?.highway !== 'street_lamp' || e.lat == null || e.lon == null || gesehen.has(e.id)) continue
    gesehen.add(e.id)
    aus.push(lv95(e.lat, e.lon))
  }
  return aus
}

/** Vortrittszeichen bzw. Verkehrsschild nach OSM: give_way (Kein Vortritt), stop, sonst nur traffic_sign (schild) */
export interface VortrittZeichen {
  id: number; art: 'give_way' | 'stop' | 'schild'; p: P
  /** direction bzw. traffic_sign:direction (forward, backward, Grad …), null ohne Angabe */
  richtung: string | null
  /** traffic_sign (z. B. CH:3.02), null ohne */
  zeichen: string | null
}
/** Vortrittszeichen und Verkehrsschilder (Knoten) aus der Rohantwort in LV95, ohne Doppel */
export function vortrittsZeichen(roh: unknown): VortrittZeichen[] {
  const aus: VortrittZeichen[] = [], gesehen = new Set<number>()
  for (const e of (roh as { elements?: RohElement[] } | null)?.elements ?? []) {
    if (e.type !== 'node' || e.lat == null || e.lon == null || gesehen.has(e.id)) continue
    const t = e.tags ?? {}
    const art = t.highway === 'give_way' ? 'give_way' : t.highway === 'stop' ? 'stop' : t.traffic_sign ? 'schild' : null
    if (!art) continue
    gesehen.add(e.id)
    aus.push({ id: e.id, art, p: lv95(e.lat, e.lon), richtung: t.direction ?? t['traffic_sign:direction'] ?? null, zeichen: t.traffic_sign ?? null })
  }
  return aus
}

/** Rohantwort (für Cache und Worker) */
export async function ladeOsmRoh(lat: number, lon: number, radius = 300, signal?: AbortSignal): Promise<Abruf<unknown>> {
  return overpassFetch(overpassAbfrage(lat, lon, radius), signal)
}

/** Zebra-Markierung (fgs_sicht_pruefen.zebra_tag, UEBERGANG_MARKED_ZEBRA): Tag, der sie belegt, sonst "". */
export function zebraTag(t: Record<string, string>): string {
  const mk = t['crossing:markings'] ?? '', cr = t.crossing ?? ''
  if (mk.startsWith('zebra')) return `crossing:markings=${mk}`
  if (mk && mk !== 'yes') return ''
  if (cr === 'zebra') return 'crossing=zebra'
  if (t.crossing_ref === 'zebra') return 'crossing_ref=zebra'
  if (cr === 'marked' || mk === 'yes') return cr === 'marked' ? 'crossing=marked' : 'crossing:markings=yes'
  return ''
}

/**
 * Einordnung eines OSM-Übergangs für Anzeige und Ergebnis (Nutzerentscheid 10.10.2026, Variante B: alle Übergänge bleiben
 * wählbar; crossing=no wird schon in istUebergang ausgeschlossen und nicht angeboten):
 *   lsa        – gesignalisierte Querung (crossing=traffic_signals bzw. crossing:signals=yes); wie bisher mit LSA-Hinweis
 *   markiert   – Zebra-Merkmal nach zebraTag (crossing:markings=zebra*, crossing=zebra, crossing_ref=zebra, crossing=marked,
 *                crossing:markings=yes): als Fussgängerstreifen geprüft
 *   vermutlich – crossing=uncontrolled ohne crossing:markings: in der Schweiz meist ein Fussgängerstreifen (ungeregelte
 *                Querung mit Vortritt); als FGS geprüft, mit Hinweis «bitte prüfen»
 *   unmarkiert – ausdrücklich ohne Markierung (crossing=unmarked, crossing:markings=no) oder andere Markierung als Zebra
 *                (z. B. crossing:markings=dots, surface)
 *   unbelegt   – keine Angabe zur Art (z. B. nur highway=crossing, crossing=yes/informal)
 * unmarkiert und unbelegt gelten als «kein Fussgängerstreifen»: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug.
 */
export type Markierung = 'lsa' | 'markiert' | 'vermutlich' | 'unmarkiert' | 'unbelegt'
export const MARKIERUNGEN: Markierung[] = ['lsa', 'markiert', 'vermutlich', 'unmarkiert', 'unbelegt']
export function markierung(t: Record<string, string>): Markierung {
  if (istLsaUebergang(t)) return 'lsa'
  if (zebraTag(t)) return 'markiert'
  const mk = t['crossing:markings'] ?? ''
  if (t.crossing === 'unmarked' || mk) return 'unmarkiert'
  if (t.crossing === 'uncontrolled') return 'vermutlich'
  return 'unbelegt'
}
/** gilt als Fussgängerstreifen (bzw. LSA-Querung) und wird mit Normbezug geprüft */
export const istFgs = (m: Markierung) => m === 'lsa' || m === 'markiert' || m === 'vermutlich'
export const KEIN_FGS_TEXT = 'Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug'
export const VERMUTLICH_TEXT = 'In OSM ohne Angabe zur Markierung erfasst – vermutlich Fussgängerstreifen, bitte prüfen'
/** Hinweis zur Einordnung (leer bei markierten bzw. gesignalisierten Übergängen) */
export function markierungHinweis(m: Markierung, t: Record<string, string>): string {
  if (m === 'vermutlich') return `${VERMUTLICH_TEXT} (OSM: crossing=uncontrolled).`
  if (m === 'unmarkiert') return `${KEIN_FGS_TEXT} (OSM: ${t.crossing === 'unmarked' ? 'crossing=unmarked' :
    `crossing:markings=${t['crossing:markings']}`}).`
  if (m === 'unbelegt') return `${KEIN_FGS_TEXT} (OSM ohne Angabe zur Art der Querung; falls vor Ort markiert, OSM-Tag nachführen).`
  return ''
}
/**
 * Hinweis bei Streifen von Hand an einem OSM-Übergang ohne Fussgängerstreifen (unmarkiert bzw. unbelegt; Planung eines neuen
 * Streifens, 16.10.2026): heute kein FGS, der Streifen von Hand wird aber als Fussgängerstreifen geprüft (statt KEIN_FGS_TEXT,
 * der für den Streifen aus OSM + AV bleibt). Leer bei Fussgängerstreifen bzw. LSA (istFgs).
 */
export function planungHinweis(m: Markierung, t: Record<string, string>): string {
  if (istFgs(m)) return ''
  const osm = m === 'unmarkiert' ? (t.crossing === 'unmarked' ? 'crossing=unmarked' : `crossing:markings=${t['crossing:markings']}`) :
    'ohne Angabe zur Art der Querung'
  return `Heute kein Fussgängerstreifen (OSM: ${osm}); der Streifen von Hand wird als Fussgängerstreifen geprüft.`
}
/** Knoten (Lage WGS84 und Tags) aus der Overpass-Rohantwort, null wenn nicht enthalten: die Lage des gewählten Übergangs,
 * wenn der Ladeort nicht sein Knoten ist (Planung) bzw. der Übergang aus einer Fall-Datei stammt */
export function knotenLage(roh: unknown, id: number): OsmKnoten | null {
  const el = (roh as { elements?: { type?: string; id?: number; lat?: number; lon?: number; tags?: unknown }[] } | null)?.elements ?? []
  const k = el.find(e => e.type === 'node' && e.id === id && typeof e.lat === 'number' && typeof e.lon === 'number')
  if (!k) return null
  const tags: Record<string, string> = {}
  if (k.tags && typeof k.tags === 'object') for (const [a, b] of Object.entries(k.tags)) if (typeof b === 'string') tags[a] = b
  return { id, lat: k.lat!, lon: k.lon!, tags }
}

/** Signalisierte Querung (fgs_sicht_pruefen.osm_uebergaenge, Spalte lsa) */
export function istLsaUebergang(t: Record<string, string>): boolean {
  return t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes'
}

/**
 * Übergangsknoten im Kartenausschnitt (leichte Abfrage für die Auswahl); dazu die benannten befahrbaren Wege nur als
 * Mittelpunkt mit Tags (Strassennamen vor dem Klick, «out tags center»: keine Geometrie, keine Knotenliste)
 */
export function uebergaengeAbfrage(s: number, w: number, n: number, e: number): string {
  const b = [s, w, n, e].map(v => v.toFixed(6)).join(',')
  return `[out:json][timeout:20];(node(${b})["highway"="crossing"];node(${b})["crossing"];` +
    `node(${b})["crossing:markings"];node(${b})["crossing_ref"];);out body;` +
    `way(${b})["highway"~"^(${HW_ALLE.join('|')})$"]["name"];out tags center;`
}

/** Übergangssuche: Übergänge (daten) und Wegmitten der benannten Strassen (namen) im Ausschnitt, eine Abfrage */
export async function ladeUebergaenge(s: number, w: number, n: number, e: number, signal?: AbortSignal):
  Promise<Abruf<OsmKnoten[]> & { namen: StrassenMitte[] }> {
  const r = await overpassFetch(uebergaengeAbfrage(s, w, n, e), signal)
  return { ...r, daten: osmParsen(r.daten as { elements?: RohElement[] }).uebergaenge, namen: strassenMitten(r.daten) }
}
