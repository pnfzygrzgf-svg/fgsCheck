// ── Fussgängerstreifen aus dem Luftbild (ETH-Modell), die in OSM fehlen ──
//
// Gebündelte Snapshots public/luftbild_fgs_<stadt>.json (tools/luftbild_fgs.py): Funde der Klasse «crosswalk» des Modells
// «remote_velo» (ETH Zürich, Papini/Zani/Adey 2026, MIT-Lizenz) auf SWISSIMAGE bzw. dem Orthofoto der Stadt Bern 2026, beide
// Modelle zusammengefasst, nur an Strassen für Fahrzeuge, Sicherheit ab 0,5, ohne OSM-Übergang in 15 m (Stand der Erzeugung).
// Statische Dateien der eigenen Seite: kein Abruf bei Dritten. Wie VeloroutenCheck (src/luftbild.ts): Datei je Stadt, gewählt
// über das Rechteck der Stadt, einmal geladen.
//
// Zur Laufzeit blendet die App jeden Kandidaten aus, der in der geladenen Übergangssuche einen OSM-Übergang in OSM_NAH_M hat
// (OSM inzwischen nachgeführt), und zeigt nur Kandidaten in schon abgesuchten Ausschnitten (sonst wäre der Abgleich nicht möglich).
//
// Klick: synthetischer Übergang (negative Kennung, Tags KANDIDAT_TAGS) am Kandidaten, in die Overpass-Rohantwort des Ladeorts
// eingefügt (osmMitLuftbildUebergang). So bildet die Rechnung den Streifen wie an einem OSM-Übergang aus OSM + AV, und die
// eigene Luftbild-Erkennung (rechner/luftbild.ts) prüft und verfeinert ihn. Die Herkunft steht im Fall (Fall.ort.herkunft), damit
// eine Fall-Datei bzw. der Browser-Speicher den Übergang wieder einfügen kann.

import { type P, wgs, lv95, dist, sub, dot, add } from '../geo'
import type { OsmKnoten, OsmDaten } from './osm'
import { holeText, AbrufFehler } from './holen'
import type { Box } from '../ausschnitt'

/** Wert von source am synthetischen Übergang (und am Fussweg für die Richtung) */
export const LUFTBILD_FGS_QUELLE = 'luftbild_eth'
/** Tags des synthetischen Übergangs: Fussgängerstreifen (markierung() → markiert) mit Herkunft */
export const KANDIDAT_TAGS: Readonly<Record<string, string>> = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra',
  source: LUFTBILD_FGS_QUELLE }
/** OSM-Übergang höchstens so weit (m): Kandidat ausgeblendet */
export const OSM_NAH_M = 15
/** Synthetischer Übergang höchstens so weit (m) vom nächsten Weg für Fahrzeuge (die Rechnung sucht den gequerten Weg bis 5 m) */
export const WEG_MAX_M = 4.5
/** Halbe Länge (m) des synthetischen Fusswegs, der die Richtung trägt (die Rechnung liest die Gehrichtung über ±6 m) */
const FUSSWEG_HALB_M = 8

export const LUFTBILD_FGS_NAME = 'Streifen aus dem Luftbild (ETH-Modell)'
export const LUFTBILD_UEBERGANG_TEXT = 'Übergang aus dem Luftbild (ETH-Modell), nicht in OSM'
export const KEIN_STREIFEN_TEXT = 'im Luftbild kein Streifen bestätigt'
export const NICHT_GEPRUEFT_TEXT = 'im Luftbild noch nicht geprüft'
/** Quellenangabe (Grundlagen und Quellen, Bericht) */
export const ETH_MODELL_QUELLE = 'Modell remote_velo der ETH Zürich (Papini, Zani, Adey 2026, Transportation, ' +
  'doi:10.1007/s11116-026-10728-8; MIT-Lizenz), eigener Lauf auf SWISSIMAGE © swisstopo bzw. Orthofoto Stadt Bern 2026 © Geodaten Stadt Bern'
export const ETH_MODELL_URL = 'https://doi.org/10.1007/s11116-026-10728-8'
export const ETH_MODELL_CODE = 'https://gitlab.ethz.ch/spapini/remote_velo_public'

/** Städte mit Snapshot: Rechteck [West, Süd, Ost, Nord] (WGS84, grosszügig um das Gemeindegebiet) */
export const LUFTBILD_FGS_STAEDTE: readonly { stadt: string; datei: string; bbox: [number, number, number, number] }[] = [
  { stadt: 'Bern', datei: 'luftbild_fgs_bern.json', bbox: [7.28, 46.90, 7.51, 46.995] },
  { stadt: 'Zürich', datei: 'luftbild_fgs_zurich.json', bbox: [8.44, 47.31, 8.63, 47.44] },
  { stadt: 'Basel', datei: 'luftbild_fgs_basel.json', bbox: [7.55, 47.51, 7.70, 47.60] },
]

export interface LuftbildKandidat {
  id: number                 // negativ, aus der Lage (tools/luftbild_fgs.py)
  p: P                       // Mitte, LV95
  conf: number               // grösste Sicherheit des ETH-Modells (0…1)
  jahre: number[]            // Flugjahre mit Fund
  richtung: number | null    // Azimut der Streifenachse (Grad ab Nord, 0–179), null wenn unklar
}
export interface LuftbildFgsSnapshot { datei: string; quelle: string; flug: string; flugjahre: number[]; erzeugt: string
  bildJeJahr: Record<string, string>     // Kurzname des Luftbilds je Flugjahr (z. B. 2026: Orthofoto Stadt Bern)
  kandidaten: LuftbildKandidat[] }
/** Kandidat für die Karte: Lage in WGS84 und Luftbild(er) als Text */
export type KandidatAnzeige = LuftbildKandidat & { lat: number; lon: number; flug: string }

/** Herkunft eines Übergangs aus dem Luftbild im Fall (Fall.ort.herkunft); fehlt bei OSM-Übergängen */
export interface LuftbildHerkunft {
  art: 'luftbild_eth'
  p: P; conf: number; jahre: number[]; richtung: number | null
}

const zahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const jahrOk = (x: unknown): x is number => zahl(x) && Number.isInteger(x) && x >= 1990 && x <= 2100
const imLv95 = (p: P) => p[0] >= 2475000 && p[0] <= 2845000 && p[1] >= 1065000 && p[1] <= 1305000

/** Kandidat aus der Datei prüfen (null, wenn ungültig) */
function kandidatLesen(x: unknown): LuftbildKandidat | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (!zahl(o.id) || !Number.isInteger(o.id) || o.id >= 0) return null
  if (!Array.isArray(o.p) || o.p.length !== 2 || !o.p.every(zahl) || !imLv95(o.p as P)) return null
  if (!zahl(o.conf) || o.conf < 0 || o.conf > 1) return null
  const r = o.richtung === null || o.richtung === undefined ? null : zahl(o.richtung) && o.richtung >= 0 && o.richtung <= 180 ? o.richtung : null
  const jahre = Array.isArray(o.jahre) ? o.jahre.filter(jahrOk) : []
  return { id: o.id, p: [o.p[0] as number, o.p[1] as number], conf: o.conf, jahre, richtung: r }
}

/** Snapshot aus der Rohdatei; ungültige Kandidaten fallen weg */
export function snapshotLesen(datei: string, roh: unknown): LuftbildFgsSnapshot {
  const o = (typeof roh === 'object' && roh !== null ? roh : {}) as Record<string, unknown>
  const kand = Array.isArray(o.kandidaten) ? o.kandidaten.map(kandidatLesen).filter((k): k is LuftbildKandidat => !!k) : []
  const bj: Record<string, string> = {}
  if (typeof o.bild_je_jahr === 'object' && o.bild_je_jahr !== null)
    for (const [j, b] of Object.entries(o.bild_je_jahr)) if (/^\d{4}$/.test(j) && typeof b === 'string' && b.length <= 60) bj[j] = b
  return { datei, quelle: typeof o.quelle === 'string' ? o.quelle : '', flug: typeof o.flug === 'string' ? o.flug : '', bildJeJahr: bj,
    flugjahre: Array.isArray(o.flugjahre) ? o.flugjahre.filter(jahrOk) : [], erzeugt: typeof o.erzeugt === 'string' ? o.erzeugt : '',
    kandidaten: kand }
}

/** Dateien der Städte, deren Rechteck den Ausschnitt schneidet */
export function dateienImAusschnitt(b: Box): string[] {
  return LUFTBILD_FGS_STAEDTE.filter(s => s.bbox[0] <= b.e && s.bbox[2] >= b.w && s.bbox[1] <= b.n && s.bbox[3] >= b.s).map(s => s.datei)
}

// Einmal laden je Datei. Fehlt sie (404) → leer und gemerkt; andere Fehler werden beim nächsten Ausschnitt neu versucht.
const caches = new Map<string, Promise<LuftbildFgsSnapshot>>()
export function ladeLuftbildFgs(datei: string, basis = import.meta.env.BASE_URL): Promise<LuftbildFgsSnapshot> {
  let c = caches.get(datei)
  if (!c) {
    // relativer Pfad der eigenen Seite (holeJson braucht eine volle Adresse für die Quellenangabe)
    c = holeText(basis + datei, {}, 20000).then(([res, text]) => {
      if (!res.ok) throw new AbrufFehler(`HTTP ${res.status}`, res.status)
      let roh: unknown
      try { roh = JSON.parse(text) } catch { throw new AbrufFehler('Antwort ist kein JSON') }
      return snapshotLesen(datei, roh)
    }).catch((e: unknown) => {
      if (!(e instanceof AbrufFehler && e.status === 404)) caches.delete(datei)
      throw e
    })
    caches.set(datei, c)
  }
  return c
}
/** nur für Tests */
export const luftbildFgsCacheLeeren = () => caches.clear()

const inBox = (b: Box, lat: number, lon: number) => lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e

/**
 * Kandidaten für die Karte: in einem schon abgesuchten Ausschnitt (boxen) und ohne OSM-Übergang der Übergangssuche in OSM_NAH_M.
 * Mit Lage in WGS84 (lat, lon) für die Karte.
 */
export function kandidatenAnzeigen(snaps: LuftbildFgsSnapshot[], boxen: Box[], uebergaenge: OsmKnoten[], nahM = OSM_NAH_M): KandidatAnzeige[] {
  const osm = uebergaenge.filter(u => u.id > 0).map(u => lv95(u.lat, u.lon))
  const aus: KandidatAnzeige[] = []
  const gesehen = new Set<number>()
  for (const s of snaps) for (const k of s.kandidaten) {
    if (gesehen.has(k.id)) continue
    const [lat, lon] = wgs(k.p[0], k.p[1])
    if (!boxen.some(b => inBox(b, lat, lon))) continue
    if (osm.some(q => Math.abs(q[0] - k.p[0]) <= nahM && Math.abs(q[1] - k.p[1]) <= nahM && dist(q, k.p) <= nahM)) continue
    gesehen.add(k.id)
    aus.push({ ...k, lat, lon, flug: flugText(k.jahre, s.bildJeJahr) })
  }
  return aus
}

/** Luftbild(er) eines Kandidaten als Text, z. B. «SWISSIMAGE 2024 und Orthofoto Stadt Bern 2026» (ohne Angabe: «Luftbild 2024») */
export function flugText(jahre: number[], bildJeJahr: Record<string, string> = {}): string {
  return jahre.length ? jahre.map(j => `${bildJeJahr[String(j)] ?? 'Luftbild'} ${j}`).join(' und ') : 'Luftbild'
}
/** Tooltip auf der Karte */
export function kandidatTooltip(k: { conf: number; flug: string }): string {
  return `Fussgängerstreifen im Luftbild erkannt (ETH-Modell, ${k.flug}), nicht in OSM – bitte prüfen. Sicherheit des Modells ` +
    `${k.conf.toFixed(2).replace('.', ',')}`
}

/** Herkunft für den Fall aus einem Kandidaten */
export const herkunftAus = (k: LuftbildKandidat): LuftbildHerkunft =>
  ({ art: 'luftbild_eth', p: [k.p[0], k.p[1]], conf: k.conf, jahre: [...k.jahre], richtung: k.richtung })

/** Synthetischer Übergang (für die Auswahl, vor dem Laden) */
export function kandidatKnoten(id: number, h: LuftbildHerkunft): OsmKnoten {
  const [lat, lon] = wgs(h.p[0], h.p[1])
  return { id, lat, lon, tags: { ...KANDIDAT_TAGS } }
}

/** Übergang aus dem Luftbild (synthetisch, Tag source) */
export const istLuftbildUebergang = (t: Record<string, string> | undefined): boolean => t?.source === LUFTBILD_FGS_QUELLE &&
  t.highway === 'crossing'

/**
 * OSM-Daten ohne den synthetischen Übergang und seinen Fussweg (für alles, was OSM als Beleg liest: Abstände zu anderen Übergängen,
 * Tags des eigenen Übergangs, Arme mit Querung im Bedarfsmodul). Ohne solche Elemente dasselbe Objekt.
 */
export function ohneLuftbildUebergang(osm: OsmDaten): OsmDaten {
  const u = osm.uebergaenge.filter(x => !istLuftbildUebergang(x.tags)), q = osm.querungen.filter(w => w.tags.source !== LUFTBILD_FGS_QUELLE)
  return u.length === osm.uebergaenge.length && q.length === osm.querungen.length ? osm : { ...osm, uebergaenge: u, querungen: q }
}

/** Herkunft aus der Fall-Datei prüfen (null, wenn ungültig) */
export function herkunftLesen(x: unknown): LuftbildHerkunft | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (o.art !== 'luftbild_eth') return null
  const k = kandidatLesen({ id: -1, p: o.p, conf: o.conf, jahre: o.jahre, richtung: o.richtung })
  return k ? { art: 'luftbild_eth', p: k.p, conf: k.conf, jahre: k.jahre, richtung: k.richtung } : null
}

/** Kurztext zur Herkunft: Sicherheit und Flugjahre */
export function herkunftText(h: LuftbildHerkunft): string {
  return `Sicherheit des Modells ${h.conf.toFixed(2).replace('.', ',')}` + (h.jahre.length ? `, Flug ${h.jahre.join(' und ')}` : '')
}

/** Hinweis zum Fall bzw. Streifen: Herkunft und Befund der eigenen Luftbild-Erkennung (null: nicht gelaufen) */
export function luftbildUebergangHinweis(befund: 'erkannt' | 'unsicher' | 'nicht_gefunden' | null, hand = false): string {
  const b = hand ? 'Streifen von Hand.' : befund === 'erkannt' ? 'Im Luftbild Streifen erkannt.' : befund === null
    ? `${NICHT_GEPRUEFT_TEXT[0].toUpperCase()}${NICHT_GEPRUEFT_TEXT.slice(1)} (nicht geladen bzw. Suche abgeschaltet).` : `${KEIN_STREIFEN_TEXT[0].toUpperCase()}${KEIN_STREIFEN_TEXT.slice(1)}: Streifen aus OSM + AV angenommen.`
  return `${LUFTBILD_UEBERGANG_TEXT} – bitte prüfen. ${b}`
}

interface RohElement { type: string; id: number; tags?: Record<string, string>; lat?: number; lon?: number; nodes?: number[]
  geometry?: ({ lat: number; lon: number } | null)[] }
/** Strassen für Fahrzeuge wie im Snapshot-Werkzeug (tools/luftbild_fgs.py STRASSEN; ohne service) */
const STRASSEN = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street'])

/**
 * Overpass-Rohantwort mit dem synthetischen Übergang id (Herkunft h): Knoten mit KANDIDAT_TAGS; liegt die nächste Strasse für
 * Fahrzeuge (STRASSEN) weiter als WEG_MAX_M, rückt der Knoten senkrecht darauf zu bis WEG_MAX_M (die Streifenachse liegt quer zum Weg und
 * bleibt so dieselbe). Mit Richtung zusätzlich ein kurzer Fussweg (highway=footway, source) durch den Knoten entlang der
 * Streifenachse: die Rechnung nimmt die Gehrichtung als Achse, wenn sie höchstens 45° von der Senkrechten zum Weg abweicht
 * (rechner/streifen.streifenAusUebergang), sonst senkrecht zum Weg. Ist der Knoten schon da, bleibt die Antwort unverändert.
 */
export function osmMitLuftbildUebergang(roh: unknown, id: number, h: LuftbildHerkunft): unknown {
  const r = (roh ?? {}) as { elements?: RohElement[] }
  const el = r.elements ?? []
  if (el.some(e => e.type === 'node' && e.id === id)) return roh
  let c: P = [h.p[0], h.p[1]]
  // nächste Strasse für Fahrzeuge
  let best: { d: number; q: P } | null = null
  for (const e of el) {
    if (e.type !== 'way' || !STRASSEN.has(e.tags?.highway ?? '') || !e.geometry) continue
    const pts = e.geometry.filter((g): g is { lat: number; lon: number } => !!g).map(g => lv95(g.lat, g.lon))
    for (let i = 0; i + 1 < pts.length; i++) {
      const v = sub(pts[i + 1], pts[i]), l2 = dot(v, v)
      if (!(l2 > 0)) continue
      const t = Math.max(0, Math.min(1, dot(sub(c, pts[i]), v) / l2))
      const q = add(pts[i], v, t), d = dist(q, c)
      if (!best || d < best.d) best = { d, q }
    }
  }
  if (best && best.d > WEG_MAX_M && best.d < 3 * WEG_MAX_M) {
    const f = (best.d - WEG_MAX_M) / best.d
    c = [c[0] + (best.q[0] - c[0]) * f, c[1] + (best.q[1] - c[1]) * f]
  }
  const [lat, lon] = wgs(c[0], c[1])
  const neu: RohElement[] = [{ type: 'node', id, lat, lon, tags: { ...KANDIDAT_TAGS } }]
  if (h.richtung !== null) {
    const a = h.richtung * Math.PI / 180, d: P = [Math.sin(a), Math.cos(a)]
    const ende = (s: number) => { const [la, lo] = wgs(c[0] + d[0] * s, c[1] + d[1] * s); return { lat: la, lon: lo } }
    const g = [ende(-FUSSWEG_HALB_M), { lat, lon }, ende(FUSSWEG_HALB_M)]
    // Knoten des Fusswegs: eigene negative Kennungen neben dem Übergang (kommen nur im Weg vor)
    neu.push({ type: 'way', id, nodes: [id * 10 - 1, id, id * 10 - 2], geometry: g, tags: { highway: 'footway', source: LUFTBILD_FGS_QUELLE } })
  }
  return { ...r, elements: [...el, ...neu] }
}
