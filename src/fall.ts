// ── Fall-Datei: alle Eingaben eines Übergangs (E2) ──
//
// JSON mit Version, Ort und Quellenstand; Koordinaten in LV95 (m). Wird als Datei gespeichert/geladen und zusätzlich im
// localStorage gehalten (Zugriffe mit try/catch, die App läuft auch ohne). Kein Server.

import { type P, imPolygon } from './geo'
import { MARKIERUNGEN, type Markierung } from './daten/osm'
import type { Hindernis } from './rechner/hindernisse'
import type { SpurHand } from './rechner/spurhand'
import type { VonHand } from './rechner/pruefen'

export const FALL_VERSION = 1

export interface StreifenHand { id: string; p0: P; p1: P; breite: number; richtung?: P   // richtung: Balken (Luftbild), sonst OSM-Weg
  herkunft?: StreifenHerkunft      // woher der Streifen stammt (fehlt in Fällen vor dem 11.10.2026: unbekannt)
  angepasst?: boolean              // Enden nach dem Übernehmen bzw. Zeichnen verschoben
}
export type StreifenHerkunft = 'gezeichnet' | 'osm' | 'luftbild' | 'luftbild_vorschlag'
const HERKUNFTE: StreifenHerkunft[] = ['gezeichnet', 'osm', 'luftbild', 'luftbild_vorschlag']
export interface ZufahrtHand { tempo?: number; streichen?: boolean; spur?: SpurHand }
export interface StreifenEingabe { lsa?: 'ja' | 'nein'; keinFgs?: boolean }

export interface Fall {
  app: 'fgsCheck'
  version: number
  ort: { lat: number; lon: number; uebergang: number | null; bezeichnung?: string; markierung?: Markierung }
  quellen: { osm?: string; av?: string; baumkataster?: string; parkkataster?: string; luftbild?: string; geladen?: string }
  streifenHand: StreifenHand[]
  hindernisse: Hindernis[]
  zufahrten: Record<string, ZufahrtHand>          // Schlüssel «Streifen|Kennung»
  streifen: Record<string, StreifenEingabe>        // Schlüssel Streifen-Nr.
  vorschlaege: Record<string, 'verworfen'>        // verworfene Vorschläge (aus OSM, Baumkataster) und amtliche Parkfelder
  baumkataster: boolean
  parkkataster?: boolean                          // amtliche Parkfelder laden (Vorgabe: ja; false = abgeschaltet)
  luftbild?: boolean                              // Streifen im Luftbild suchen (Vorgabe: ja)
  gespeichert?: string
  ergebnis?: FallErgebnis                         // nur beim Speichern geschrieben (Auszug), beim Laden neu gerechnet
}

export interface FallErgebnis {
  hinweis: string                                // z. B. «Kein Fussgängerstreifen: …»
  luftbild?: string                              // Befund der Luftbild-Erkennung (erkannt / unsicher / nicht_gefunden)
  streifenQuelle?: string                        // osm / luftbild / hand
  streifen: { fgsId: string; status: string; zufahrten: { zufahrt: string; status: string; tempo: number; sichtweite: number
    gedeckt?: true }[] }[]                       // gedeckt: Abbiegezufahrt, gedeckt durch die gerade Zufahrt (nur mit GEDECKT_RECHNEN)
}

export function leererFall(lat: number, lon: number, uebergang: number | null): Fall {
  return { app: 'fgsCheck', version: FALL_VERSION, ort: { lat, lon, uebergang }, quellen: {}, streifenHand: [], hindernisse: [],
    zufahrten: {}, streifen: {}, vorschlaege: {}, baumkataster: false }
}

export const zufahrtSchluessel = (fgsId: string, kennung: string) => `${fgsId}|${kennung}`

const zahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
/** echtes Objekt (kein Array, nicht null) */
const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const istP = (x: unknown): x is P => Array.isArray(x) && x.length === 2 && x.every(zahl)
const istPs = (x: unknown, min: number): x is P[] => Array.isArray(x) && x.length >= min && x.every(istP)

function hindernisPruefen(h: unknown): Hindernis | null {
  if (!istObjekt(h)) return null
  const o = h
  if (typeof o.id !== 'string' || typeof o.art !== 'string') return null
  const quelle = (['hand', 'osm', 'kataster'].includes(o.quelle as string) ? o.quelle : 'hand') as Hindernis['quelle']
  const name = typeof o.name === 'string' ? o.name : undefined
  switch (o.art) {
    case 'parkfeld':
      return istPs(o.ring, 3) ? { id: o.id, art: 'parkfeld', klasse: (['auto', 'velo', 'motorrad'].includes(o.klasse as string) ? o.klasse : 'auto') as 'auto',
        ring: o.ring, quelle, name } : null
    case 'laengsparkierung':
      return istPs(o.linie, 2) ? { id: o.id, art: 'laengsparkierung', linie: o.linie,
        breite: zahl(o.breite) && o.breite > 0.5 && o.breite < 8 ? o.breite : 2.0, quelle, name } : null
    case 'baum':
      return istP(o.p) ? { id: o.id, art: 'baum', p: o.p, stamm: zahl(o.stamm) && o.stamm > 0 && o.stamm < 5 ? o.stamm : 0.5,
        quelle, name } : null
    case 'hecke': case 'mauer': case 'uebrige': {
      const linie = istPs(o.linie, 2) ? o.linie : undefined, ring = istPs(o.ring, 3) ? o.ring : undefined
      return linie || ring ? { id: o.id, art: o.art, linie, ring, sichtbehindernd: o.sichtbehindernd !== false, quelle, name } : null
    }
    case 'insel':                                  // Verkehrsinsel von Hand (seit 14.10.2026)
      return istPs(o.ring, 3) ? { id: o.id, art: 'insel', ring: o.ring, quelle, name } : null
  }
  return null
}

function spurPruefen(x: unknown): SpurHand | undefined {
  if (!istObjekt(x)) return undefined
  const o = x
  if (o.art === 'A' && zahl(o.a) && zahl(o.b) && Math.abs(o.a) < 20 && Math.abs(o.b) < 20)
    return { art: 'A', a: o.a, b: o.b }
  if (o.art === 'B' && istPs(o.linie, 2))
    return { art: 'B', linie: o.linie, radius: zahl(o.radius) && o.radius >= 3 && o.radius <= 60 ? o.radius : null }
  return undefined
}

/**
 * Gebiet der App für den Ort einer Fall-Datei (WGS84, Grad): Schweiz und Liechtenstein mit etwa 10 km Rand. Die Schweiz
 * reicht von 45,82° (Chiasso) bis 47,81° N (Bargen SH) und von 5,96° (Chancy GE) bis 10,49° O (Müstair), Liechtenstein
 * liegt darin. Ausserhalb gibt es weder AV über geodienste.ch noch SWISSIMAGE, und die LV95-Umrechnung (geo.ts) ist nur
 * für dieses Gebiet gedacht; der Rand lässt Übergänge an der Grenze zu.
 */
export const GEBIET = { latMin: 45.7, latMax: 47.9, lonMin: 5.8, lonMax: 10.6 }
export const imGebiet = (lat: number, lon: number): boolean =>
  lat >= GEBIET.latMin && lat <= GEBIET.latMax && lon >= GEBIET.lonMin && lon <= GEBIET.lonMax

const QUELLEN_SCHLUESSEL = ['osm', 'av', 'baumkataster', 'parkkataster', 'luftbild', 'geladen'] as const

/** Fall aus JSON lesen und prüfen -> [Fall, Hinweise]. Ausnahme nur bei fremder Datei, Version oder ungültigem Ort; ungültige
 * Listen bzw. Objekte und einzelne ungültige Einträge werden übergangen und gemeldet. Auch für den Browser-Speicher (fallErinnern). */
export function fallLesen(text: string): [Fall, string[]] {
  const roh: unknown = JSON.parse(text)
  if (!istObjekt(roh) || roh.app !== 'fgsCheck') throw new Error('keine fgsCheck-Fall-Datei')
  if (!zahl(roh.version) || roh.version > FALL_VERSION) throw new Error(`Fall-Datei Version ${String(roh.version)} wird nicht unterstützt`)
  const ort = roh.ort
  if (!istObjekt(ort) || !zahl(ort.lat) || !zahl(ort.lon)) throw new Error('Ort fehlt in der Fall-Datei')
  if (Math.abs(ort.lat) > 90 || Math.abs(ort.lon) > 180) throw new Error(`Ort ungültig (lat ${ort.lat}, lon ${ort.lon}: keine WGS84-Koordinaten)`)
  if (!imGebiet(ort.lat, ort.lon))
    throw new Error(`Ort ausserhalb der Schweiz bzw. Liechtensteins (lat ${ort.lat}, lon ${ort.lon}); fgsCheck rechnet nur dort`)
  const hinweise: string[] = []
  const fall = leererFall(ort.lat, ort.lon, zahl(ort.uebergang) ? ort.uebergang : null)
  if (typeof ort.bezeichnung === 'string') fall.ort.bezeichnung = ort.bezeichnung
  if (MARKIERUNGEN.includes(ort.markierung as Markierung)) fall.ort.markierung = ort.markierung as Markierung
  /** Liste bzw. Objekt nur, wenn vorhanden und vom richtigen Typ; sonst Hinweis */
  const liste = (k: string, name: string): unknown[] => {
    const x = roh[k]
    if (x === undefined) return []
    if (Array.isArray(x)) return x
    hinweise.push(`${name} ungültig (keine Liste), übergangen`); return []
  }
  const objekt = (k: string, name: string): [string, unknown][] => {
    const x = roh[k]
    if (x === undefined) return []
    // «__proto__» u. ä. nie als Schlüssel übernehmen (würde den Prototyp des Ziel-Objekts ersetzen)
    if (istObjekt(x)) return Object.entries(x).filter(([s]) => !['__proto__', 'constructor', 'prototype'].includes(s))
    hinweise.push(`${name} ungültig (kein Objekt), übergangen`); return []
  }
  for (const [k, v] of objekt('quellen', 'Quellen')) {
    if ((QUELLEN_SCHLUESSEL as readonly string[]).includes(k) && typeof v === 'string') fall.quellen[k as typeof QUELLEN_SCHLUESSEL[number]] = v
    else if ((QUELLEN_SCHLUESSEL as readonly string[]).includes(k)) hinweise.push(`Quelle «${k}» ungültig, übergangen`)
  }
  for (const s of liste('streifenHand', 'Streifen von Hand')) {
    const o = istObjekt(s) ? s : null
    if (o && typeof o.id === 'string' && istP(o.p0) && istP(o.p1) && zahl(o.breite) && o.breite >= 0.5 && o.breite <= 15) {
      // doppelte Nummern (ältere Fassung) eindeutig machen
      const doppelt = fall.streifenHand.some(x => x.id === o.id)
      if (doppelt) hinweise.push(`Streifen von Hand ${o.id} doppelt, neu nummeriert`)
      const sh: StreifenHand = { id: doppelt ? naechsteHandId(fall) : o.id, p0: o.p0, p1: o.p1, breite: o.breite }
      if (istP(o.richtung) && Math.abs(Math.hypot(o.richtung[0], o.richtung[1]) - 1) < 0.01) sh.richtung = o.richtung
      if (HERKUNFTE.includes(o.herkunft as StreifenHerkunft)) sh.herkunft = o.herkunft as StreifenHerkunft
      if (o.angepasst === true) sh.angepasst = true
      fall.streifenHand.push(sh)
    } else hinweise.push('Streifen von Hand ungültig, übergangen')
  }
  for (const h of liste('hindernisse', 'Hindernisse')) {
    const x = hindernisPruefen(h)
    if (x) fall.hindernisse.push(x); else hinweise.push('Hindernis ungültig, übergangen')
  }
  for (const [k, v] of objekt('zufahrten', 'Zufahrten')) {
    if (!istObjekt(v)) { hinweise.push(`Zufahrt ${k} ungültig, übergangen`); continue }
    const z: ZufahrtHand = {}
    if (zahl(v.tempo) && v.tempo >= 10 && v.tempo <= 120) z.tempo = v.tempo
    if (v.streichen === true) z.streichen = true
    const sp = spurPruefen(v.spur)
    if (sp) z.spur = sp
    if (Object.keys(z).length) fall.zufahrten[k] = z
    else if (Object.keys(v).length) hinweise.push(`Zufahrt ${k} ungültig, übergangen`)
  }
  for (const [k, v] of objekt('streifen', 'Streifen-Eingaben')) {
    if (!istObjekt(v)) { hinweise.push(`Streifen-Eingabe ${k} ungültig, übergangen`); continue }
    const e: StreifenEingabe = {}
    if (v.lsa === 'ja' || v.lsa === 'nein') e.lsa = v.lsa
    if (v.keinFgs === true) e.keinFgs = true
    if (Object.keys(e).length) fall.streifen[k] = e
    else if (Object.keys(v).length) hinweise.push(`Streifen-Eingabe ${k} ungültig, übergangen`)
  }
  for (const [k, v] of objekt('vorschlaege', 'Vorschläge')) {
    if (v === 'verworfen') fall.vorschlaege[k] = 'verworfen'
    else hinweise.push(`Vorschlag ${k} ungültig, übergangen`)
  }
  fall.baumkataster = roh.baumkataster === true
  if (roh.parkkataster === false) fall.parkkataster = false
  if (roh.luftbild === false) fall.luftbild = false
  if (typeof roh.gespeichert === 'string') fall.gespeichert = roh.gespeichert   // Stand im Hinweis «aus dem Browser übernommen»
  return [fall, hinweise]
}

export function fallSchreiben(fall: Fall, ergebnis: FallErgebnis | null = null): string {
  const { ergebnis: _alt, ...rest } = fall
  void _alt
  return JSON.stringify({ ...rest, gespeichert: new Date().toISOString(), ...(ergebnis ? { ergebnis } : {}) }, null, 1)
}

/** Eingaben des Falls als VonHand für die Rechnung */
export function vonHandAusFall(fall: Fall): VonHand {
  const z = (fid: string, kennung: string) => fall.zufahrten[zufahrtSchluessel(fid, kennung)]
  return {
    spur: (fid, kennung) => z(fid, kennung)?.spur ?? null,
    streichen: (fid, kennung) => !!z(fid, kennung)?.streichen,
    lsa: fid => fall.streifen[fid]?.lsa ?? null,
    keinFgs: fid => !!fall.streifen[fid]?.keinFgs,
    tempoKennung: (fid, kennung) => z(fid, kennung)?.tempo ?? null,
  }
}

// ---------------------------------------------------------------- localStorage (nur Bequemlichkeit, darf fehlen)
const SPEICHER = 'fgsCheck.fall.'
/** Fall im Browser merken (Schlüssel «fgsCheck.fall.<Übergang>»); ein Fall ohne Eingaben wird nicht gespeichert, ein
 * vorhandener Eintrag dann entfernt (z. B. nach «Eingaben verwerfen» oder wenn alle Eingaben gelöscht sind) */
export function fallMerken(fall: Fall): void {
  const key = SPEICHER + (fall.ort.uebergang ?? 'ort')
  try {
    if (hatEingaben(fall)) localStorage.setItem(key, fallSchreiben(fall))
    else localStorage.removeItem(key)
  } catch { /* ohne Speicher */ }
}
export function fallErinnern(uebergang: number): Fall | null {
  try {
    const t = localStorage.getItem(SPEICHER + uebergang)
    return t ? fallLesen(t)[0] : null
  } catch { return null }
}

// ---------------------------------------------------------------- Hilfen für die Oberfläche (E2-Korrektur)
/** Anzahl Eingaben eines Falls (Streifen von Hand, Hindernisse, Zufahrten, Streifen-Eingaben, verworfene Vorschläge bzw.
 * Parkfelder, Baumkataster zugeschaltet, amtliche Parkfelder abgeschaltet) */
export function eingabenZahl(f: Fall): number {
  return f.streifenHand.length + f.hindernisse.length + Object.keys(f.zufahrten).length + Object.keys(f.streifen).length +
    Object.keys(f.vorschlaege).length + (f.baumkataster ? 1 : 0) + (f.parkkataster === false ? 1 : 0)
}

/** Hat der Fall etwas zu merken? Eingaben (eingabenZahl), Luftbild-Suche abgeschaltet oder eine Bezeichnung */
export function hatEingaben(f: Fall): boolean {
  return eingabenZahl(f) > 0 || f.luftbild === false || !!f.ort.bezeichnung?.trim()
}

/** Nächste freie Nummer für einen Streifen von Hand (höchste vorhandene + 1, eindeutig auch nach Löschen) */
export function naechsteHandId(f: Fall): string {
  const n = Math.max(0, ...f.streifenHand.map(s => Number(/^hand-(\d+)$/.exec(s.id)?.[1] ?? 0)))
  return `hand-${n + 1}`
}

/**
 * Streifen (aus OSM + AV bzw. aus dem Luftbild) als Streifen von Hand übernehmen. Luftbild-Teile bringen die Enden auf der
 * geschrägten Achse (q0/q1) und die Balkenrichtung mit, damit der Umriss das Parallelogramm nachbildet. Eingaben der bisher
 * gerechneten Streifen (alte: Tempo, Spur, Streichen je Zufahrt; LSA, kein FGS je Streifen) gehen an den neuen Streifen mit der
 * nächsten Mitte (höchstens ZUORDNUNG_M entfernt), nicht über gleiche Nummern; die Rückfall-Kennung «s<Nr>:<Grad>» wird mit
 * umbenannt. Nicht zuordenbare Eingaben bleiben stehen (die App meldet sie als ohne Zufahrt). Angenommene Inseln (nach OSM und
 * Luftbild, inseln: die der Rechnung bzw. der Luftbild-Teile) gehen als Insel von Hand (Hindernis «insel», Name
 * INSEL_UEBERNOMMEN) in den Fall, damit die Streifen von Hand an der Insel geteilt bleiben (Zufahrten Inselteil, Einspur);
 * nicht, wenn schon eine Insel von Hand dieselbe Fläche deckt (inselnUebernehmen). Rückgabe: übertragene Eingaben.
 */
const ZUORDNUNG_M = 3.0
export function streifenUebernehmen(f: Fall, neue: { p0: P; p1: P; bw: number; q0?: P; q1?: P; richtung?: P }[],
  alte: { fgsId: string; p0: P; p1: P }[], herkunft?: StreifenHerkunft, inseln: { ring: P[] }[] = []): number {
  const mitte = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  f.streifenHand = []
  const neuM: [string, P][] = []
  for (const s of neue) {
    const id = naechsteHandId(f)
    const sh: StreifenHand = { id, p0: s.q0 ?? s.p0, p1: s.q1 ?? s.p1, breite: s.bw }
    if (s.richtung) sh.richtung = s.richtung
    if (herkunft) sh.herkunft = herkunft
    f.streifenHand.push(sh)
    neuM.push([id, mitte(s.p0, s.p1)])
  }
  const neu = new Map<string, string>()
  for (const a of alte) {
    const m = mitte(a.p0, a.p1)
    let best: [string, number] | null = null
    for (const [id, q] of neuM) { const d = Math.hypot(q[0] - m[0], q[1] - m[1]); if (d <= ZUORDNUNG_M && (!best || d < best[1])) best = [id, d] }
    if (best) neu.set(a.fgsId, best[0])
  }
  let n = 0
  const zuf: Record<string, ZufahrtHand> = {}
  for (const [k, v] of Object.entries(f.zufahrten)) {
    const i = k.indexOf('|'), alt = k.slice(0, i), kennung = k.slice(i + 1)
    const id = neu.get(alt)
    if (id) { zuf[zufahrtSchluessel(id, kennung.replace(`s${alt}:`, `s${id}:`))] = v; n++ } else zuf[k] = v
  }
  f.zufahrten = zuf
  const str: Record<string, StreifenEingabe> = {}
  for (const [k, v] of Object.entries(f.streifen)) {
    const id = neu.get(k)
    if (id) { str[id] = v; n++ } else str[k] = v
  }
  f.streifen = str
  inselnUebernehmen(f, inseln)
  return n
}

/** Name einer beim Übernehmen geschriebenen Insel (angenommen nach OSM und Luftbild, danach Insel von Hand) */
export const INSEL_UEBERNOMMEN = 'Insel (aus Luftbild übernommen)'

/**
 * Angenommene Inseln als Inseln von Hand in den Fall schreiben (streifenUebernehmen). Doppel vermeiden: deckt schon eine Insel
 * von Hand die Mitte der Fläche, wird sie nicht nochmals geschrieben. Rückgabe: geschriebene Inseln.
 */
export function inselnUebernehmen(f: Fall, inseln: { ring: P[] }[]): number {
  const mitte = (r: P[]): P => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]
  let n = 0
  for (const z of inseln) {
    if (z.ring.length < 3 || f.hindernisse.some(h => h.art === 'insel' && imPolygon(mitte(z.ring), [h.ring]))) continue
    let k = 1
    while (f.hindernisse.some(h => h.id === `insel-lb-${k}`)) k++
    f.hindernisse.push({ id: `insel-lb-${k}`, art: 'insel', ring: z.ring.map(p => [p[0], p[1]] as P), quelle: 'hand', name: INSEL_UEBERNOMMEN })
    n++
  }
  return n
}

/** Eingaben (Schlüssel), zu denen die Rechnung keine Zufahrt bzw. keinen Streifen mehr kennt */
export function eingabenVerwaist(f: Fall, streifen: { fgsId: string; zufahrten: { kennung: string }[];
  entfallen: { kennung: string }[] }[]): string[] {
  const zk = new Set(streifen.flatMap(s => [...s.zufahrten, ...s.entfallen].map(z => zufahrtSchluessel(s.fgsId, z.kennung))))
  const sk = new Set(streifen.map(s => s.fgsId))
  return [...Object.keys(f.zufahrten).filter(k => !zk.has(k)), ...Object.keys(f.streifen).filter(k => !sk.has(k))]
}

/** Herkunft eines Streifens von Hand als Text (Panel, Bericht) */
export function streifenHerkunftText(s: StreifenHand): string {
  const t = s.herkunft === 'gezeichnet' ? 'von Hand gezeichnet' : s.herkunft === 'osm' ? 'aus OSM und AV übernommen' :
    s.herkunft === 'luftbild' ? 'aus dem Luftbild übernommen' : s.herkunft === 'luftbild_vorschlag' ? 'aus dem Luftbild-Vorschlag (unsicher) übernommen' :
    'von Hand (Herkunft nicht gespeichert)'
  if (!s.angepasst || !s.herkunft) return t
  return s.herkunft === 'gezeichnet' ? `${t}, Enden verschoben` : `${t}, Enden von Hand angepasst`
}
