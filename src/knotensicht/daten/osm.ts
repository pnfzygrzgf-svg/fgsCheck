// ── OpenStreetMap über Overpass: Strassennetz, Übergänge, Lichtsignale, Vortrittssignale, Abbiegeverbote, Tramgleise im Umkreis ──
//
// Ausweichserver und Wiederholung nach dem Muster von VeloroutenCheck (src/osm.ts): Zeitgrenze je
// Versuch, bei 429/5xx kurz warten und den nächsten Server nehmen, abgebrochene Ergebnisse
// (`remark` mit Zeitüberschreitung/Speichergrenze) wie einen Serverfehler behandeln.
//
// Inhalt wie netz_osm.json des Berner Projekts (fgs_netz.aufbereiten): Wege der Klassen HW_ALLE mit Knoten-IDs,
// Abbiegeverbote (type=restriction, Rollen from/via/to), Übergangsknoten (fgs_netz.ist_uebergang), Tramgleise; dazu
// Ampeln (highway=traffic_signals) für die LSA-Einordnung (fgs_sicht_pruefen.Lichtsignale).
// SichtweitenCheck (E0): dazu Vortrittssignale (highway=stop/give_way, nur als Hinweis) und die Knotensuche im Ausschnitt
// (knotenAbfrage: Knoten mit drei und mehr Strassenarmen, serverseitig über way_link gezählt). E3b: dazu alle Radwege im Umkreis
// (highway=cycleway bzw. Fuss- oder Radweg mit bicycle=designated) für die Veloachse; sie landen mit den Fusswegen in querungen.

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
  querungen: OsmWeg[]          // Fusswege über die Fahrbahn (footway=crossing bzw. Fussweg durch einen Übergangsknoten) und Radwege
                               // im Umkreis (E3b, velo.ts radwegLinien)
  vortritt: OsmKnoten[]        // highway=stop bzw. highway=give_way (SichtweitenCheck, nur Hinweis)
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
  return umkreisAbfrage(`around:${radius},${lat.toFixed(7)},${lon.toFixed(7)}`)
}

/**
 * Umkreis um einen OSM-Knoten in einer Abfrage (Direkteinstieg ?knoten=…, 15.10.2026): Lage des Knotens (node(id:…), am
 * Anfang der Antwort) und dieselben Daten wie overpassAbfrage um seine Lage (around.k), statt erst die Lage und dann den
 * Umkreis abzufragen.
 */
export function overpassAbfrageKnoten(id: number, radius: number): string {
  return umkreisAbfrage(`around.k:${radius}`, `node(id:${Math.trunc(id)})->.k;`, '.k out;')
}

function umkreisAbfrage(um: string, vor = '', aus = ''): string {
  return `[out:json][timeout:25];${vor}(` +
    `way(${um})["highway"~"^(${HW_ALLE.join('|')})$"];` +
    `way(${um})["railway"="tram"];` +
    `)->.w;(` +
    `node(${um})["highway"="crossing"];` +
    `node(${um})["crossing"];` +
    `node(${um})["crossing_ref"];` +
    `node(${um})["crossing:markings"];` +
    `node(${um})["highway"="traffic_signals"];` +
    `node(${um})["highway"~"^(stop|give_way)$"];` +
    `)->.n;` +
    `rel(bw.w)["type"="restriction"]->.r;` +
    `(way(bn.n)["highway"~"^(footway|path|cycleway|steps|bridleway)$"];way(${um})["footway"="crossing"];` +
    `way(${um})["highway"="cycleway"];way(${um})["highway"~"^(path|footway)$"]["bicycle"="designated"];)->.f;` +
    `${aus}.w out body geom;.n out body;.r out body;.f out body geom;`
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
  const aus: OsmDaten = { wege: [], tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [] }
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
      if (tags.highway === 'stop' || tags.highway === 'give_way') aus.vortritt.push(kn)
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
// Overpass lehnt eine Abfrage ab, solange dieselbe Abfrage derselben Adresse noch läuft (Fehlerseite mit HTTP 200,
// «Dispatcher_Client::request_read_and_idx::duplicate_query», z. B. nach dem Neuladen der Seite): so lange warten, dann
// denselben Server ein zweites Mal fragen
export const DOPPELT_MS = 2000
const DOPPELT_TEXT = 'gleiche Abfrage läuft noch (duplicate_query)'

/** Fehlertext einer Overpass-Fehlerseite (HTML «Error: …», auch mit HTTP 200), sonst null */
export function overpassFehlerText(text: string): string | null {
  const m = /<strong[^>]*>\s*Error\s*<\/strong>\s*:?\s*([^<]+)/i.exec(text)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}
const kurz = (t: string, n = 120) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

/** ein Versuch: Server und Ergebnis (Status bzw. Fehlertext) */
export interface Versuch { host: string; fehler: string }
/** Verlauf aller Versuche für die Meldung: «Server: Fehler», gleiche Einträge zusammengefasst («2×»), Reihenfolge wie versucht */
export function verlaufText(versuche: Versuch[]): string {
  const n = new Map<string, number>()
  for (const v of versuche) { const k = `${v.host}: ${v.fehler}`; n.set(k, (n.get(k) ?? 0) + 1) }
  return [...n].map(([k, z]) => (z > 1 ? `${k} (${z}×)` : k)).join('; ')
}

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
  // alle Versuche festhalten (15.10.2026): die Meldung nennt jeden Server mit Status bzw. Fehler, nicht nur den letzten
  const versuche: Versuch[] = []
  const verlauf = () => (versuche.length ? ` Versuche: ${verlaufText(versuche)}.` : '')
  for (let runde = 0; runde < 2; runde++) {
    for (const url of OVERPASS_ENDPOINTS) {
      const host = new URL(url).host
      for (let wdh = 0; ; wdh++) {
        const rest = GESAMT_MS - (performance.now() - start)
        if (rest <= 1000) throw new AbrufFehler(`Overpass: keine Antwort innert ${GESAMT_MS / 1000} s.${verlauf()}`)
        const t0 = performance.now()
        let res: Response, text: string
        try { [res, text] = await holeText(url, init, Math.min(REQUEST_TIMEOUT_MS, rest), signal) }
        catch (e) {
          if (istAbbruch(e)) throw e
          versuche.push({ host, fehler: (e as Error).message }); break
        }
        const seite = overpassFehlerText(text)
        if (res.ok) {
          let data: { remark?: unknown }
          try { data = JSON.parse(text) }
          catch {
            const doppelt = !!seite && /duplicate_query/.test(seite)
            versuche.push({ host, fehler: doppelt ? DOPPELT_TEXT : seite ? `Fehlerseite: ${kurz(seite)}` : 'kein JSON' })
            if (doppelt && wdh === 0) { await warte(DOPPELT_MS, signal); continue }
            break
          }
          if (overpassAbgebrochen(data)) { versuche.push({ host, fehler: `abgebrochen (${kurz(String(data.remark))})` }); break }
          return { daten: data, ms: performance.now() - t0, bytes: text.length, quelle: host }
        }
        versuche.push({ host, fehler: `HTTP ${res.status}${seite ? ` (${kurz(seite)})` : ''}` })
        if (res.status === 429 || res.status >= 500) {
          const raKopf = res.headers.get('Retry-After'), ra = retryAfterMs(raKopf)
          sperreNachAntwort(res.status, raKopf)
          await warte(Math.min(MAX_BACKOFF_MS, ra ?? 1000 * 2 ** runde), signal)
        }
        // andere Fehler (z. B. 400, 406): nächster Server, nicht abbrechen
        break
      }
    }
  }
  throw new AbrufFehler(`Overpass nicht erreichbar.${verlauf()}`)
}

/** Rohantwort (für Cache und Worker) */
export async function ladeOsmRoh(lat: number, lon: number, radius = 300, signal?: AbortSignal): Promise<Abruf<unknown>> {
  return overpassFetch(overpassAbfrage(lat, lon, radius), signal)
}

/** Rohantwort um einen OSM-Knoten (overpassAbfrageKnoten) und seine Lage (null: Knoten nicht gefunden) */
export async function ladeOsmUmKnoten(id: number, radius = 300, signal?: AbortSignal):
  Promise<Abruf<unknown> & { knoten: OsmKnoten | null }> {
  const r = await overpassFetch(overpassAbfrageKnoten(id, radius), signal)
  const x = ((r.daten as { elements?: RohElement[] }).elements ?? []).find(e => e.type === 'node' && e.id === id)
  return { ...r, knoten: x && x.lat != null && x.lon != null ? { id: x.id, tags: x.tags ?? {}, lat: x.lat, lon: x.lon } : null }
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

/** Strassenklassen der Knotensuche (MFZ_HW in rechner/netz.ts ohne service, VSS-Knoten in E0) */
export const HW_KNOTEN = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'road']

/**
 * Knoten im Kartenausschnitt (leichte Abfrage für die Auswahl): OSM-Knoten mit mindestens drei Wegstücken (way_link) der
 * Strassenklassen HW_KNOTEN ohne Fahrverbot (access bzw. motor_vehicle no/private), nur Koordinaten; dazu die benannten
 * befahrbaren Wege nur als Mittelpunkt mit Tags (Strassennamen vor dem Klick, «out tags center»). Die Arme rechnet die App
 * nach dem Klick aus den vollständigen OSM-Daten neu (rechner/knoten.ts).
 */
export function knotenAbfrage(s: number, w: number, n: number, e: number): string {
  const b = [s, w, n, e].map(v => v.toFixed(6)).join(',')
  return `[out:json][timeout:20];way(${b})["highway"~"^(${HW_KNOTEN.join('|')})$"]["access"!~"^(no|private)$"]` +
    `["motor_vehicle"!~"^(no|private)$"]->.w;node(way_link.w:3-)(${b});out skel qt;` +
    `way(${b})["highway"~"^(${HW_ALLE.join('|')})$"]["name"];out tags center;`
}

/** Knotensuche: Knoten (nur id und Lage) und Wegmitten der benannten Strassen (namen) im Ausschnitt, eine Abfrage */
export async function ladeKnoten(s: number, w: number, n: number, e: number, signal?: AbortSignal):
  Promise<Abruf<OsmKnoten[]> & { namen: StrassenMitte[] }> {
  const r = await overpassFetch(knotenAbfrage(s, w, n, e), signal)
  const knoten: OsmKnoten[] = []
  for (const x of (r.daten as { elements?: RohElement[] }).elements ?? [])
    if (x.type === 'node' && x.lat != null && x.lon != null) knoten.push({ id: x.id, tags: x.tags ?? {}, lat: x.lat, lon: x.lon })
  return { ...r, daten: knoten, namen: strassenMitten(r.daten) }
}
