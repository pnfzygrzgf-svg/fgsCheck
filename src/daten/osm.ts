// ── OpenStreetMap über Overpass: Strassennetz, Übergänge, Lichtsignale, Abbiegeverbote, Tramgleise im Umkreis ──
//
// Ausweichserver und Wiederholung nach dem Muster von VeloroutenCheck (src/osm.ts): Zeitgrenze je
// Versuch, bei 429/5xx kurz warten und den nächsten Server nehmen, abgebrochene Ergebnisse
// (`remark` mit Zeitüberschreitung/Speichergrenze) wie einen Serverfehler behandeln.
//
// Inhalt wie netz_osm.json des Berner Projekts (fgs_netz.aufbereiten): Wege der Klassen HW_ALLE mit Knoten-IDs,
// Abbiegeverbote (type=restriction, Rollen from/via/to), Übergangsknoten (fgs_netz.ist_uebergang), Tramgleise; dazu
// Ampeln (highway=traffic_signals) für die LSA-Einordnung (fgs_sicht_pruefen.Lichtsignale).

import { holeText, istAbbruch, AbrufFehler, type Abruf } from './holen'

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

export function overpassAbfrage(lat: number, lon: number, radius: number): string {
  const um = `around:${radius},${lat.toFixed(7)},${lon.toFixed(7)}`
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
    `.w out body geom;.n out body;.r out body;.f out body geom;`
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

/** Signalisierte Querung (fgs_sicht_pruefen.osm_uebergaenge, Spalte lsa) */
export function istLsaUebergang(t: Record<string, string>): boolean {
  return t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes'
}

/** Übergangsknoten im Kartenausschnitt (leichte Abfrage für die Auswahl) */
export function uebergaengeAbfrage(s: number, w: number, n: number, e: number): string {
  const b = [s, w, n, e].map(v => v.toFixed(6)).join(',')
  return `[out:json][timeout:20];(node(${b})["highway"="crossing"];node(${b})["crossing"];` +
    `node(${b})["crossing:markings"];node(${b})["crossing_ref"];);out body;`
}

export async function ladeUebergaenge(s: number, w: number, n: number, e: number, signal?: AbortSignal): Promise<Abruf<OsmKnoten[]>> {
  const r = await overpassFetch(uebergaengeAbfrage(s, w, n, e), signal)
  return { ...r, daten: osmParsen(r.daten as { elements?: RohElement[] }).uebergaenge }
}
