// ── Fahrstreifenlage: AV-Sehnen, Abzüge, OSM-Fahrstreifen (fgs_sicht_pruefen.py) ──
//
// fahrstreifenmitte: Fahrbahn aus den AV-Sehnen (Median), Abzug rechts/links für Längsparkierung bzw. Velostreifen, Rest
// auf die Fahrtrichtungen; ab 5,50 m je Richtung mehrere Fahrstreifen (rechter mit 3,50 m). Anders als in Bern kommen die
// Abzüge nicht aus Parkfeld- und Velostreifen-Daten, sondern aus OSM-Tags des Wegs unter dem Messpunkt (parking:*,
// cycleway:*), mit angenommenen Breiten (ABZUG_*), und sind als Annahme gekennzeichnet.
// fahrstreifen_tags, busstreifen_rechts, bus_ueberspringen, fahrstreifen_osm, fahrstreifen_arm, fahrstreifen_lage,
// fahrstreifen_uebernehmen, fs_hinweis, osm_breite, lage_osm, fahrbahn_osm, wege_abschnitte, weg_bei, hoch_bei,
// querschnitt_am_knoten wie in Python.
// Lage je Querschnitt (Entscheid 31.10.2026, nicht in Python): randProfil, fahrstreifenLagen, profilBei.

import { type P, add, dist, dot, einheit, neg, sub, median, drehung } from '../geo'
import { type OsmNetz, type Gequert, type Suche, type Knotenbereich, type ArmInfo, einbahnTag, RASTER, FAST_GERADE_GRAD } from './netz'
import type { Fahrbahn } from './flaechen'
import type { ParkRaster } from './hindernisse'
import { SEHNE_HALB } from './flaechen'
import { punkteAufSpur, abstandSpur, SEHNE_MIN_PUNKTE, FAHRSTREIFEN_MAX } from './spur'

export const PARKSTREIFEN = 1.90
export const PARK_MIN_TREFFER = 2
export const PARK_SONDE_M = 0.95
export const MEHRSTREIFIG_AB = 5.50
export const MEHRSTREIFIG_EINBAHN = 7.00
export const FS_OSM_MIN_M = 2.50
export const FS_OSM_EINZEL_MAX_M = 7.00
export const EINSPURIG_MAX_M = 5.50
export const FS_OSM_TOL_M = 1.0
export const FS_OSM_GEAENDERT_M = 0.05
export const FS_OSM_BREITE_M = 3.0
export const INSEL_UNGETEILT = 1.6
export const BREITE_ERSATZ = 8.0
export const LAGE_ERSATZ = 1.75
const FAHRSTREIFEN_OSM = true
const FS_OSM_BREITE_GRENZE = true
const FS_OSM_SPUR_BREITE = true
const KNOTEN_QUER_TOL_M = 1.0
const KNOTEN_QUER_ACHSE_M = 1.0

// Annahmen für Abzüge aus OSM-Tags (E1; im Berner Projekt aus Parkfeldern und Velostreifen-Daten)
export const ABZUG_PARK_LAENGS = PARKSTREIFEN   // parking:<seite>=lane, orientation parallel bzw. ohne Angabe
export const ABZUG_PARK_SCHRAEG = 4.50          // … diagonal
export const ABZUG_PARK_QUER = 5.00             // … perpendicular
export const ABZUG_VELO = 1.50                  // cycleway:<seite>=lane (Linie so weit vom Rand bzw. von der Parkierung)

type Tags = Record<string, string>
type RefPunkt = [P, P]

// ---------------------------------------------------------------- OSM-Tags: Fahrstreifen und Busstreifen
const TURN_LINKS = new Set(['left', 'slight_left', 'sharp_left'])
const TURN_RECHTS = new Set(['right', 'slight_right', 'sharp_right'])
const TURN_OHNE = new Set(['', 'none', 'merge_to_left', 'merge_to_right'])

function osmZahl(v: string | undefined): number | null {
  if (v === undefined) return null
  const s = String(v).trim()
  if (!/^-?\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return n >= 1 ? n : null
}

/** fahrstreifen_tags -> [je Richtung, gesamt, turn] oder null */
export function fahrstreifenTags(t: Tags, vorwaerts: boolean): [number, number, Set<string>[] | null] | null {
  const ow = einbahnTag(t)
  const lanes = osmZahl(t.lanes)
  let n: number, gesamt: number, turnRoh: string | undefined
  if (ow) {
    if ((ow > 0) !== vorwaerts) return null
    if (lanes === null) return null
    n = gesamt = lanes
    turnRoh = t['turn:lanes'] || t[ow > 0 ? 'turn:lanes:forward' : 'turn:lanes:backward']
  } else {
    let fw = osmZahl(t['lanes:forward']), bw = osmZahl(t['lanes:backward'])
    const beid = osmZahl(t['lanes:both_ways']) ?? 0
    if (lanes !== null && (fw === null) !== (bw === null)) {
      const rest = lanes - (fw ?? bw!) - beid
      if (fw !== null) bw = rest >= 1 ? rest : null
      else fw = rest >= 1 ? rest : null
    }
    if (fw !== null && bw !== null) { n = vorwaerts ? fw : bw; gesamt = lanes || fw + bw + beid }
    else if (lanes === 1) { n = gesamt = 1 }
    else if (lanes && lanes % 2 === 0) { n = lanes / 2; gesamt = lanes }
    else return null
    if (n > gesamt) return null
    turnRoh = t[vorwaerts ? 'turn:lanes:forward' : 'turn:lanes:backward']
  }
  let turn: Set<string>[] | null = null
  if (turnRoh) {
    const teile = turnRoh.split('|')
    if (teile.length === n) turn = teile.map(x => new Set(x.split(';').map(y => y.trim())))
  }
  return [n, gesamt, turn]
}

const durch = (w: Set<string>) => w.has('through') || [...w].every(x => TURN_OHNE.has(x))
const schneidet = (w: Set<string>, s: Set<string>) => [...w].some(x => s.has(x))

/** busstreifen_rechts -> [Anzahl, Tag, gezaehlt] */
export function busstreifenRechts(t: Tags, vorwaerts: boolean, n: number, gesamt: number): [number, string | null, boolean] {
  const ow = einbahnTag(t)
  const sfxe = ow > 0 ? ['', ':forward'] : ow < 0 ? [''] : [vorwaerts ? ':forward' : ':backward']
  for (const k of ['bus:lanes', 'psv:lanes']) {
    let kk: string | null = sfxe.map(x => k + x).find(x => t[x]) ?? null
    let teile: string[] | null = kk ? t[kk].split('|') : null
    if (teile === null && !ow && t[k]) {
      const alle = t[k].split('|')
      if (alle.length === gesamt) { kk = k; teile = vorwaerts ? alle.slice(-n) : alle.slice(0, n).reverse() }
    }
    if (teile === null || teile.length !== n) continue
    if (ow < 0) teile = [...teile].reverse()
    let nb = 0
    for (const x of [...teile].reverse()) { if (x.trim() !== 'designated') break; nb++ }
    if (nb > 0 && nb < n) return [nb, kk, true]
  }
  for (const k of ['lanes:bus', 'lanes:psv']) {
    const kk = sfxe.map(x => k + x).find(x => osmZahl(t[x]))
    if (kk) { const nb = osmZahl(t[kk])!; return [nb, kk, nb < n] }
  }
  if (ow >= 0) {
    for (const k of ['busway', ow || vorwaerts ? 'busway:right' : 'busway:left', 'busway:both'])
      if (t[k] === 'lane') return [1, `${k}=lane`, 1 < n]
  }
  return [0, null, true]
}

export interface Fso { n: number; gesamt: number; index: number; wid: number; regel: string; zweirichtig: boolean
  bus: { n: number; tag: string | null; gezaehlt: boolean } | null }

/** bus_ueberspringen */
function busUeberspringen(t: Tags, vorwaerts: boolean, n: number, gesamt: number, index: number, regel: string):
  [number, number, number, string, Fso['bus']] {
  const [nb, tag, gezaehlt] = busstreifenRechts(t, vorwaerts, n, gesamt)
  if (!nb) return [n, gesamt, index, regel, null]
  if (!gezaehlt) { n += nb; gesamt += nb; index += nb; regel += '_bus_dazu' }
  else if (index < nb) { index = nb; regel += '_bus' }
  return [n, gesamt, index, regel, { n: nb, tag, gezaehlt }]
}

/** weg_segment: OSM-Wegsegment (befahrbar oder Bus) unter p bis tol -> [wid, k, vorwärts] oder null */
export function wegSegment(netz: OsmNetz, p: P, fahrt: P, tol = FS_OSM_TOL_M): [number, number, boolean] | null {
  const cx = Math.floor(p[0] / RASTER), cy = Math.floor(p[1] / RASTER)
  const kand = new Map<string, [number, number]>()
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
    for (const wk of netz.raster.get(`${gx},${gy}`) ?? []) kand.set(`${wk[0]},${wk[1]}`, wk)
  let best: [[number, number], number, number, boolean] | null = null
  for (const [wid, k] of [...kand.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    const nds = netz.w(wid).nds
    const a = netz.p(nds[k]), b = netz.p(nds[k + 1])
    const ab = abstandSpur(p, [a, b])
    if (ab > tol || (a[0] === b[0] && a[1] === b[1])) continue
    const c = dot(einheit(sub(b, a)), fahrt)
    const schl: [number, number] = [Math.round(ab * 100) / 100, -Math.abs(c)]
    if (best === null || schl[0] < best[0][0] || (schl[0] === best[0][0] && schl[1] < best[0][1])) best = [schl, wid, k, c > 0]
  }
  return best ? [best[1], best[2], best[3]] : null
}

/** fahrstreifen_osm: OSM-Fahrstreifen einer geraden Zufahrt -> Fso oder null */
export function fahrstreifenOsm(netz: OsmNetz, g: Gequert | null, sd: number, su: Suche | null, kbe: Knotenbereich | null,
  wegRoh: P[], abstM: number[], art: string): Fso | null {
  if (g === null) return null
  const stimmen = new Map<string, number>(), erst = new Map<string, number>()
  punkteAufSpur(wegRoh, abstM).forEach(([p, t], i) => {
    const ws = wegSegment(netz, p, [-t[0], -t[1]])
    if (ws === null) return
    const [wid, , vorw] = ws
    const ow = netz.w(wid).ow
    if ((art === 'einbahn' && !ow) || (art === 'beide' && ow)) return
    const key = `${wid},${vorw ? 1 : 0}`
    stimmen.set(key, (stimmen.get(key) ?? 0) + 1)
    if (!erst.has(key)) erst.set(key, abstM[i])
  })
  let wid: number, vorw: boolean
  if (stimmen.size) {
    let bestK = '', bestV = -1, bestE = Infinity
    for (const [k, v] of stimmen) {
      const e = erst.get(k)!
      if (v > bestV || (v === bestV && e < bestE)) { bestK = k; bestV = v; bestE = e }
    }
    const [w, f] = bestK.split(',')
    wid = Number(w); vorw = f === '1'
  } else {
    wid = g.wid; vorw = sd > 0
    const ow = netz.w(wid).ow
    if ((art === 'einbahn' && !ow) || (art === 'beide' && ow)) return null
  }
  const ft = fahrstreifenTags(netz.w(wid).t, vorw)
  if (ft === null) return null
  let [n, gesamt] = ft
  const turn = ft[2]
  let index = 0, regel = 'rechts'
  if (turn) {
    const nds = netz.w(wid).nds
    const ende = netz.p(nds[vorw ? nds.length - 1 : 0])
    const k_ = turn.map((w, k) => (durch(w) ? k : -1)).filter(k => k >= 0)
    if (wid !== g.wid && abstandSpur(ende, wegRoh) <= FS_OSM_TOL_M) {
      if (k_.length) { index = n - 1 - k_[k_.length - 1]; regel = 'turn_geradeaus' }
    } else if (k_.length && k_[k_.length - 1] !== n - 1) regel = 'rechts_turn_nach_streifen'
  }
  const forts = kbe !== null ? kbe.forts : null
  if (n > 1 && wid !== g.wid && forts !== null && forts.wid === wid && !forts.ring && su !== null) {
    const X = forts.knoten
    const m = kbe!.mitglieder.find(x => x.nid === X)
    const unser = m ? m.ankunft : null, rein = forts.arm
    const andere = unser ? netz.strassenarme(X, su.extra, su.eigSvc).filter(a =>
      !(a[0] === rein[0] && a[1] === rein[1] && a[2] === rein[2]) && !(a[0] === unser[0] && a[1] === unser[1] && a[2] === unser[2]) &&
      [0, a[2]].includes(netz.w(a[0]).ow)) : []
    if (andere.length && unser) {
      const hIn = neg(netz.armRichtung(rein))
      const dU = drehung(hIn, netz.armRichtung(unser))
      const dA = andere.map(a => drehung(hIn, netz.armRichtung(a)))
      const seite = dU > Math.max(...dA) ? 'links' : dU < Math.min(...dA) ? 'rechts' : 'mitte'
      const nds = netz.w(wid).nds
      index = 0; regel = `gabel_${seite}`
      let k_: number[] = []
      if (turn && X === (vorw ? nds[nds.length - 1] : nds[0])) {
        if (dU >= FAST_GERADE_GRAD) k_ = turn.map((w, k) => (schneidet(w, TURN_LINKS) ? k : -1)).filter(k => k >= 0)
        else if (dU <= -FAST_GERADE_GRAD) k_ = turn.map((w, k) => (schneidet(w, TURN_RECHTS) ? k : -1)).filter(k => k >= 0)
        else {
          const leicht = new Set(seite === 'links' ? ['slight_left'] : seite === 'rechts' ? ['slight_right'] : [])
          k_ = turn.map((w, k) => (durch(w) || schneidet(w, leicht) ? k : -1)).filter(k => k >= 0)
        }
      }
      if (k_.length) { index = n - 1 - k_[k_.length - 1]; regel = `gabel_${seite}_turn` }
      else if (seite === 'links') {
        const ftB = fahrstreifenTags(netz.w(unser[0]).t, unser[2] > 0)
        if (ftB) index = Math.max(0, n - ftB[0])
        else regel = 'gabel_links_ast_ohne_angabe'
      }
    }
  }
  let bus: Fso['bus']
  ;[n, gesamt, index, regel, bus] = busUeberspringen(netz.w(wid).t, vorw, n, gesamt, index, regel)
  return { n, gesamt, index, wid, regel, zweirichtig: !netz.w(wid).ow, bus }
}

/** fahrstreifen_arm: OSM-Fahrstreifen des Arms zum Knoten hin (Abbiegestreifen nach turn:lanes) */
export function fahrstreifenArm(netz: OsmNetz, a: ArmInfo, links: boolean): Fso | null {
  const [wid, i, sd] = a.arm
  const ft = fahrstreifenTags(netz.w(wid).t, sd < 0)
  if (ft === null) return null
  let [n, gesamt] = ft
  const turn = ft[2]
  const nds = netz.w(wid).nds
  let index = 0, regel = 'rechts'
  if (turn && ((sd > 0 && i === 0) || (sd < 0 && i === nds.length - 1))) {
    const k_ = turn.map((w, k) => (schneidet(w, links ? TURN_LINKS : TURN_RECHTS) ? k : -1)).filter(k => k >= 0)
    if (k_.length) { index = n - 1 - (links ? k_[0] : k_[k_.length - 1]); regel = links ? 'turn_links' : 'turn_rechts' }
  }
  let bus: Fso['bus']
  ;[n, gesamt, index, regel, bus] = busUeberspringen(netz.w(wid).t, sd < 0, n, gesamt, index, regel)
  return { n, gesamt, index, wid, regel, zweirichtig: !netz.w(wid).ow, bus }
}

export interface FsoLage { lage: number; vomRand: number; je: number; ms: number; breiteFs: number; widerspruch: string | null
  breit: string | null; gilt: boolean }

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')

/** fahrstreifen_lage */
export function fahrstreifenLage(fso: Fso, netto: number, abR: number, randR: number, teiler: number | null = null,
  nettoSpur: number | null = null): FsoLage {
  const breiteFs = netto / (teiler || fso.gesamt)
  let breiteL = breiteFs
  if (FS_OSM_SPUR_BREITE && nettoSpur !== null && nettoSpur < netto) breiteL = nettoSpur / (teiler || fso.gesamt)
  const breiteLage = FS_OSM_BREITE_GRENZE && fso.n > 1 ? Math.min(breiteL, FAHRSTREIFEN_MAX) : breiteL
  const vomRand = abR + breiteLage * (fso.index + 0.5)
  let w: string | null = null, breit: string | null = null
  if (fso.zweirichtig && fso.gesamt === 1 && netto > EINSPURIG_MAX_M) {
    breit = `OSM Weg ${fso.wid}: einspurig (lanes=1, zweirichtig), AV netto ${f1(netto)} m, über ${f2(EINSPURIG_MAX_M)} m: ` +
      'Lage wie ohne OSM-Angabe (Schätzung aus der AV-Breite)'
  } else if ((fso.n > 1 && breiteFs < FS_OSM_MIN_M) || (fso.n === 1 && breiteFs > FS_OSM_EINZEL_MAX_M)) {
    const art = fso.zweirichtig && fso.gesamt === 1 ? 'einspurig (lanes=1, zweirichtig)' :
      `${fso.n} Fahrstreifen je Richtung` + (fso.gesamt !== fso.n && teiler === null ? ` (${fso.gesamt} gesamt)` : '')
    w = `OSM Weg ${fso.wid}: ${art}, AV netto ${f1(netto)} m -> ${f2(breiteFs)} m je Streifen ` +
      `(Grenzen ${f2(FS_OSM_MIN_M)}/${f2(FS_OSM_EINZEL_MAX_M)} m)`
  }
  return { lage: randR - vomRand, vomRand, je: breiteLage * fso.n, ms: fso.n > 1 ? 1 : 0, breiteFs, widerspruch: w, breit,
    gilt: !(w || breit) }
}

export interface Fs {
  lage: number; breite: number; rechts: number; links: number; lagePlausi: number
  parkR: boolean; parkL: boolean; abzugParkR: number; abzugParkL: number; veloR: number; veloL: number
  jeRichtung: number; vomRand: number; nSehnen: number; mehrstreifig: number; zweiRichtungen: number
  abzugQuelle: string | null; osm?: FsoLage; quelle?: string; osmQuelle?: string
  /** freier Abzug rechts bzw. links (max. Parkierung, Velostreifen) [m], für die Lage je Stelle (fahrstreifenLagen) */
  randRFrei?: number; randLFrei?: number
}

/** fahrstreifen_uebernehmen -> Verschiebung (m) oder null */
export function fahrstreifenUebernehmen(fs: Fs | null): number | null {
  if (!(FAHRSTREIFEN_OSM && fs && fs.osm) || !fs.osm.gilt) return null
  const o = fs.osm, dv = o.vomRand - fs.vomRand
  fs.lage = o.lage; fs.vomRand = o.vomRand; fs.jeRichtung = o.je; fs.mehrstreifig = o.ms
  return dv
}

/** fs_hinweis */
export function fsHinweis(fso: Fso | null, dv: number | null): string | null {
  if (fso === null || dv === null || Math.abs(dv) <= FS_OSM_GEAENDERT_M) return null
  return 'fahrstreifen_osm:' + (fso.gesamt === 1 && fso.zweirichtig ? 'einspurig' : `${fso.n}/${fso.index + 1}`) +
    (fso.regel.includes('_bus') ? ';busstreifen' : '')
}

// ---------------------------------------------------------------- Abzüge aus OSM-Tags (App, statt Parkfelder/Velostreifen)
export interface Abzug { park: number; velo: number }      // m ab der Bordkante (velo: Linie inkl. Parkierung)

/** Abzug einer Seite (right/left zur Digitalisierung) eines OSM-Wegs aus parking:* und cycleway:* */
export function abzugSeite(t: Tags, seite: 'right' | 'left'): Abzug {
  const breite = (o: string | undefined) =>
    o === 'diagonal' ? ABZUG_PARK_SCHRAEG : o === 'perpendicular' ? ABZUG_PARK_QUER : ABZUG_PARK_LAENGS
  let park = 0
  const p = t[`parking:${seite}`] ?? t['parking:both']                       // Schema seit 2022
  const orient = t[`parking:${seite}:orientation`] ?? t['parking:both:orientation']
  const alt = t[`parking:lane:${seite}`] ?? t['parking:lane:both']             // älteres Schema
  if (p === 'lane') park = breite(orient)
  else if (p === 'half_on_kerb') park = ABZUG_PARK_LAENGS / 2
  else if (!p && ['parallel', 'diagonal', 'perpendicular', 'marked'].includes(alt ?? '')) park = breite(alt)
  let velo = 0
  const c = t[`cycleway:${seite}`] ?? t['cycleway:both'] ?? t.cycleway
  if (c === 'lane') velo = ABZUG_VELO + park                                  // Velostreifen zwischen Parkierung und Fahrstreifen
  return { park, velo }
}

/** Abzug rechts/links zur Fahrt aus dem OSM-Weg unter p (weg_segment, 5 m) */
export type AbzugQuelle = (k: number) => { r: Abzug; l: Abzug } | null

export function abzugAusOsm(netz: OsmNetz, punkte: [P, P][]): AbzugQuelle {
  return (k: number) => {
    if (k >= punkte.length) return null
    const [p, tRueck] = punkte[k]
    const ws = wegSegment(netz, p, [-tRueck[0], -tRueck[1]], 5.0)
    if (ws === null) return null
    const t = netz.w(ws[0]).t, vorw = ws[2]
    // Parkierung zählt erst als bestätigtes Parkfeld (E2, Vorschläge aus OSM); hier nur der Velostreifen (Linie so weit vom
    // Rand bzw. von der Parkierung, fahrstreifenmitte rechnet die Parkfelder dazu)
    const r = abzugSeite(t, vorw ? 'right' : 'left'), l = abzugSeite(t, vorw ? 'left' : 'right')
    return { r: { park: 0, velo: r.velo ? ABZUG_VELO : 0 }, l: { park: 0, velo: l.velo ? ABZUG_VELO : 0 } }
  }
}

/**
 * fahrstreifenmitte: seitliche Lage der Fahrstreifenmitte relativ zur Referenzspur (rechts positiv).
 * Abzüge (Parkierung/Velostreifen) aus OSM-Tags (abzug(k), Anteil wie PARK_MIN_TREFFER), sonst wie Python.
 */
export function fahrstreifenmitte(ref: RefPunkt[], art: string, fahrbahn: Fahrbahn, abzug: AbzugQuelle | null, teilbreite: number,
  fso: Fso | null = null, idx: number[] | null = null, abzugVonHand = false, park: ParkRaster | null = null): Fs | null {
  const er: number[] = [], el: number[] = []
  const parkR: number[] = [], parkL: number[] = [], veloR: number[] = [], veloL: number[] = []
  let trefferR = 0, trefferL = 0
  ref.forEach(([q, r], i) => {
    const sh = fahrbahn.sehne(q, r)
    // Sehnen an der Suchgrenze (kein Rand innert SEHNE_HALB: Platz, Kreuzungsfläche) zählen nicht, wie in querschnitt und randProfil
    // (Befund 31.10.2026, Hubelmattstrasse/Loryplatz: Median 22 m = Suchgrenze als Fahrbahnrand, D 21 m neben der Zufahrt)
    if (sh === null || Math.max(sh[0], sh[1]) >= SEHNE_HALB - 0.5) return
    er.push(sh[0]); el.push(sh[1])
    // Parkstreifen: Auto-Parkfeld am Prüfpunkt PARK_SONDE_M innerhalb der Bordkante (fahrstreifenmitte, park.trifft)
    if (park && !park.leer) {
      if (park.trifft(add(q, r, sh[0] - PARK_SONDE_M))) trefferR++
      if ((art === 'beide' || art === 'einbahn') && park.trifft(add(q, r, -(sh[1] - PARK_SONDE_M)))) trefferL++
    }
    const a = abzug ? abzug(idx ? idx[i] : i) : null
    if (a) {
      if (a.r.park > 0) parkR.push(a.r.park)
      if (a.l.park > 0) parkL.push(a.l.park)
      if (a.r.velo > 0) veloR.push(a.r.velo)
      if (a.l.velo > 0) veloL.push(a.l.velo)
    }
  })
  if (er.length < SEHNE_MIN_PUNKTE) return null
  const rechtsM = median(er), linksM = median(el), breite = rechtsM + linksM
  const zweiRichtungen = art === 'beide' || art === 'einbahn' || breite > INSEL_UNGETEILT * teilbreite
  const parkFeldR = trefferR >= PARK_MIN_TREFFER, parkFeldL = zweiRichtungen && trefferL >= PARK_MIN_TREFFER
  const pr = parkFeldR ? PARKSTREIFEN : parkR.length >= PARK_MIN_TREFFER ? median(parkR) : 0
  const pl = parkFeldL ? PARKSTREIFEN : zweiRichtungen && parkL.length >= PARK_MIN_TREFFER ? median(parkL) : 0
  let vr = veloR.length >= PARK_MIN_TREFFER ? median(veloR) : 0
  let vl = zweiRichtungen && veloL.length >= PARK_MIN_TREFFER ? median(veloL) : 0
  // Velostreifen aus OSM (Breite ab Rand bzw. Parkierung): die Linie liegt hinter der Parkierung
  if (!abzugVonHand) { if (vr) vr += pr; if (vl) vl += pl }
  const randRFrei = Math.max(pr, vr), randLFrei = Math.max(pl, vl)
  const netto = Math.max(breite - randRFrei - randLFrei, 2.0)
  const je = zweiRichtungen && art !== 'einbahn' ? netto / 2 : netto
  const vomRand = randRFrei + (je > MEHRSTREIFIG_AB ? FAHRSTREIFEN_MAX : je) / 2
  const quellen = [parkFeldR || parkFeldL ? 'Parkfelder' : pr || pl ? 'Parkierung von Hand' : '',
    vr || vl ? (abzugVonHand ? 'Velostreifen von Hand' : 'Velostreifen aus OSM (cycleway:*)') : '']
    .filter(x => x)
  const out: Fs = { lage: rechtsM - vomRand, breite, rechts: rechtsM, links: linksM, lagePlausi: rechtsM - vomRand,
    parkR: pr > 0, parkL: pl > 0, abzugParkR: pr, abzugParkL: pl, veloR: Math.round(vr * 100) / 100,
    veloL: Math.round(vl * 100) / 100, jeRichtung: je, vomRand, nSehnen: er.length, mehrstreifig: je > MEHRSTREIFIG_AB ? 1 : 0,
    zweiRichtungen: zweiRichtungen ? 1 : 0, abzugQuelle: quellen.length ? quellen.join(', ') : null, randRFrei, randLFrei }
  if (fso) out.osm = fahrstreifenLage(fso, netto, randRFrei, rechtsM)
  return out
}

// ---------------------------------------------------------------- Lage je Querschnitt (Entscheid 31.10.2026)
// Statt einer festen seitlichen Verschiebung der OSM-Linie (Median der Sehnen) folgt die Achse der AV-Fahrbahn: je Querschnittstelle
// die Ränder, Ausreisser (Breite stark abweichend: Einmündungstrichter, Parkbucht, Kreuzungsfläche, Lücke im Polygon) verworfen, die
// Ränder über benachbarte Stellen geglättet; zwischen den Stellen linear, vor der ersten und nach der letzten Stelle konstant.

/** Annahme: eine Sehne gilt als Ausreisser, wenn ihre Breite um mehr als diesen Anteil der Bezugsbreite (Median) abweicht … */
export const PROFIL_AUSREISSER_ANTEIL = 0.25
/** … bzw. um mehr als so viele Meter (es gilt die kleinere Grenze; Annahme) */
export const PROFIL_AUSREISSER_M = 1.5
/** Annahme: gleitender Median der Ränder über so viele gültige Stellen (an den Enden symmetrisch verkürzt) */
export const PROFIL_GLAETTUNG = 5

/** Ränder je Stelle: s = Bogenlänge auf der Referenzlinie (nur gültige Stellen, aufsteigend), rechts/links = geglättete Abstände
 *  in Richtung r der Sehne bzw. dagegen (wie Fahrbahn.sehne); n gültige, verworfen = Ausreisser, breite = Bezugsbreite (Median) */
export interface RandProfil { s: number[]; rechts: number[]; links: number[]; n: number; verworfen: number; breite: number
  /** Stellen, an denen ein Rand (Eckausrundung, Mündung, Bucht) aus dem anderen und der Breite der Nachbarstellen ersetzt ist */
  ersetzt?: number
  /** erste Stelle mit beiden Rändern stetig (Beginn der Strecke; davor Mündung bzw. Eckausrundung) */
  sStrecke?: number }

/** Wert eines Profils bei x: zwischen den Stellen linear, davor und danach konstant */
export function profilBei(s: number[], werte: number[], x: number): number {
  if (!s.length) return 0
  if (x <= s[0]) return werte[0]
  const n = s.length - 1
  if (x >= s[n]) return werte[n]
  let k = 0
  while (k < n - 1 && s[k + 1] < x) k++
  const d = s[k + 1] - s[k]
  return d > 0 ? werte[k] + (werte[k + 1] - werte[k]) * (x - s[k]) / d : werte[k]
}

/** gleitender Median über PROFIL_GLAETTUNG Werte, an den Enden symmetrisch verkürzt (ein linearer Verlauf bleibt erhalten) */
export function gleitenderMedian(xs: number[], fenster = PROFIL_GLAETTUNG): number[] {
  const h0 = Math.floor(fenster / 2)
  return xs.map((_, i) => {
    const h = Math.min(h0, i, xs.length - 1 - i)
    return median(xs.slice(i - h, i + h + 1))
  })
}

/**
 * Randprofil aus Sehnen je Stelle (s aufsteigend; sehne = [rechts, links] wie Fahrbahn.sehne oder null). Sehnen an der Suchgrenze
 * (SEHNE_HALB − 0,5 m) zählen nicht. bezug: Bezugsbreite für die Ausreisser (Vorgabe: Median der Breiten dieser Stellen).
 * Weniger als SEHNE_MIN_PUNKTE gültige Stellen: null (feste Lage wie bisher).
 */
export function randProfil(s: number[], sehnen: ([number, number] | null)[], bezug: number | null = null): RandProfil | null {
  const roh = s.map((x, i) => ({ s: x, sh: sehnen[i] })).filter((x): x is { s: number; sh: [number, number] } =>
    x.sh !== null && x.sh !== undefined && Math.max(x.sh[0], x.sh[1]) < SEHNE_HALB - 0.5)
  if (roh.length < SEHNE_MIN_PUNKTE) return null
  const breite = bezug ?? bezugsBreite(roh.map(x => x.sh[0] + x.sh[1]))
  const tol = ausreisserTol(breite)
  // je Rand: Stellen auf einem stetigen Zug (stetig); Eckausrundung am Knoten, Mündungen und Buchten springen heraus (Befund 31.10.2026,
  // Buchserstrasse/Sonnenhofweg, Jolimontstrasse). Beide Ränder stetig und Breite in der Grenze: Stelle gilt wie bisher
  const xs = roh.map(x => x.s)
  const stetigR = stetig(xs, roh.map(x => x.sh[0])), stetigL = stetig(xs, roh.map(x => x.sh[1]))
  const beide = roh.filter((x, i) => stetigR[i] && stetigL[i] && Math.abs(x.sh[0] + x.sh[1] - breite) <= tol + 1e-9)
  if (beide.length < SEHNE_MIN_PUNKTE) return null
  // ein Rand stetig, der andere nicht: der andere aus der Breite der benachbarten Stellen mit beiden Rändern (Fahrbahn ohne die Aufweitung)
  const bS = beide.map(x => x.s), bB = beide.map(x => x.sh[0] + x.sh[1])
  const ok: { s: number; sh: [number, number] }[] = []
  let ersetzt = 0
  roh.forEach((x, i) => {
    const b = profilBei(bS, bB, x.s)
    if (stetigR[i] && stetigL[i]) { if (Math.abs(x.sh[0] + x.sh[1] - breite) <= tol + 1e-9) ok.push(x) }
    else if (stetigR[i] && Math.abs(x.sh[0] - (b - profilBei(bS, beide.map(y => y.sh[1]), x.s))) <= tol) { ok.push({ s: x.s, sh: [x.sh[0], b - x.sh[0]] }); ersetzt++ }
    else if (stetigL[i] && Math.abs(x.sh[1] - (b - profilBei(bS, beide.map(y => y.sh[0]), x.s))) <= tol) { ok.push({ s: x.s, sh: [b - x.sh[1], x.sh[1]] }); ersetzt++ }
  })
  return { s: ok.map(x => x.s), rechts: gleitenderMedian(ok.map(x => x.sh[0])), links: gleitenderMedian(ok.map(x => x.sh[1])),
    n: ok.length, verworfen: roh.length - ok.length, ersetzt: ersetzt, sStrecke: bS[0], breite }
}

/** Annahme: ein Rand ändert sich entlang der Strecke höchstens so stark je Meter (schräge OSM-Linie, Kurve); grössere Sprünge sind
 *  Eckausrundung, Mündung, Bucht */
export const PROFIL_SPRUNG_M_PRO_M = 0.15
/** ein Zug überbrückt höchstens so lange Lücken (eine ausgelassene Stelle bei 2 m Abstand: einzelne Bucht, fehlende Sehne) */
export const PROFIL_LUECKE_M = 4
/** je Stelle: gehört ihr Rand zu einem stetigen Zug von mindestens SEHNE_MIN_PUNKTE Stellen? Jede Stelle schliesst an den Zug an,
 *  dessen letzter Wert ihr am nächsten liegt (innerhalb der Grenze), sonst beginnt sie einen neuen; ein einzelner Sprung (Bucht)
 *  unterbricht den Zug darum nicht */
export function stetig(s: number[], w: number[]): boolean[] {
  const zug: number[] = [], letzte: number[] = []     // Zug je Stelle; letzte Stelle je Zug
  for (let i = 0; i < s.length; i++) {
    let best = -1, bestD = Infinity
    letzte.forEach((k, z) => {
      const d = Math.abs(w[i] - w[k])
      if (s[i] - s[k] <= PROFIL_LUECKE_M + 1e-9 && d <= PROFIL_SPRUNG_M_PRO_M * (s[i] - s[k]) + 1e-9 && d < bestD) { best = z; bestD = d }
    })
    if (best < 0) { best = letzte.length; letzte.push(i) } else letzte[best] = i
    zug.push(best)
  }
  const n = new Map<number, number>()
  for (const z of zug) n.set(z, (n.get(z) ?? 0) + 1)
  return zug.map(z => n.get(z)! >= SEHNE_MIN_PUNKTE)
}

const ausreisserTol = (b: number) => Math.min(PROFIL_AUSREISSER_ANTEIL * b, PROFIL_AUSREISSER_M)

/** Bezugsbreite: die Breite, in deren Toleranz die meisten Stellen liegen (bei Gleichstand die schmalere), dort der Median; robust
 *  auch, wenn mehr als die Hälfte der Stellen in einer Aufweitung (Platz, Einmündung, Bucht) liegt, anders als der Median aller */
export function bezugsBreite(breiten: number[]): number {
  let best: number[] = []
  for (const b of [...breiten].sort((x, y) => x - y)) {
    const hier = breiten.filter(x => Math.abs(x - b) <= ausreisserTol(b) + 1e-9)
    if (hier.length > best.length) best = hier
  }
  return median(best)
}

/** Randprofil entlang einer Referenzlinie: Sehnen an den Stellen ab (Bogenlänge), Richtung r der Sehne links der Laufrichtung (wie
 *  querschnitt und die Zufahrt in rechnen.ts): rechts = Abstand zum Rand links der Laufrichtung, links = zum Rand rechts davon */
export function randProfilEntlang(fahrbahn: Fahrbahn, linie: P[], ab: number[], bezug: number | null = null): RandProfil | null {
  const pk = punkteAufSpur(linie, ab)
  return randProfil(ab.slice(0, pk.length), pk.map(([q, t]) => fahrbahn.sehne(q, [-t[1], t[0]])), bezug)
}

/**
 * Lage der Fahrstreifenmitte je Stelle (wie fahrstreifenmitte, aber mit den Rändern je Stelle statt dem Median): Abzüge
 * (Parkierung, Velostreifen), Zweirichtungs- und Mehrstreifen-Entscheid bleiben die von fs; je Stelle lage = rechter Rand − Abstand
 * vom Rand. art wie fahrstreifenmitte.
 */
export function fahrstreifenLagen(rp: RandProfil, fs: Fs, art: string): number[] {
  const rR = fs.randRFrei ?? fs.abzugParkR, rL = fs.randLFrei ?? fs.abzugParkL
  return rp.s.map((_, i) => {
    const netto = Math.max(rp.rechts[i] + rp.links[i] - rR - rL, 2.0)
    const je = fs.zweiRichtungen && art !== 'einbahn' ? netto / 2 : netto
    return rp.rechts[i] - (rR + (fs.mehrstreifig ? FAHRSTREIFEN_MAX : je) / 2)
  })
}

/** Annahme: in der Mündung ändert sich die Lage der Zufahrtsachse höchstens so stark je Meter (wie PROFIL_SPRUNG_M_PRO_M) */
export const MUENDUNG_LAGE_M_PRO_M = PROFIL_SPRUNG_M_PRO_M

/**
 * Lage der Zufahrtsachse in der Mündung (Auftrag 31.10.2026): zwischen dem Knoten und der ersten stetigen Stelle sStrecke folgt die
 * Achse dem rechten AV-Rand mit dem Abstand, den sie an sStrecke zu ihm hat (statt einer festen Lage zur OSM-Linie); je Meter ab sStrecke
 * zum Knoten hin, Stellen ohne rechten Rand (rechtsBei null) linear überbrückt, Änderung höchstens MUENDUNG_LAGE_M_PRO_M je Meter
 * (die Eckausrundung zieht die Achse sonst in den Arm daneben). prof.s wie rp.s; ab sStrecke bleibt prof.
 */
export function lageMuendung(prof: { s: number[]; lage: number[] }, rp: RandProfil, rechtsBei: (s: number) => number | null):
  { s: number[]; lage: number[] } {
  const s1 = rp.sStrecke
  const k1 = s1 === undefined ? -1 : prof.s.findIndex(x => x >= s1 - 1e-9)
  if (k1 < 0) return prof
  const d1 = rp.rechts[k1] - prof.lage[k1]
  const s: number[] = [], l: number[] = []
  let vor = prof.lage[k1], sv = prof.s[k1]
  for (let x = Math.ceil(sv) - 1; x >= 0; x--) {
    const re = rechtsBei(x)
    if (re === null) continue
    const g = MUENDUNG_LAGE_M_PRO_M * (sv - x)
    vor = Math.min(vor + g, Math.max(vor - g, re - d1)); sv = x
    s.unshift(x); l.unshift(vor)
  }
  return { s: [...s, ...prof.s.slice(k1)], lage: [...l, ...prof.lage.slice(k1)] }
}

/** querschnitt_am_knoten */
export function querschnittAmKnoten(fahrbahn: Fahrbahn, ref: RefPunkt[]): RefPunkt[] {
  const qs = ref.map(([q, r]) => {
    const sh = fahrbahn.sehne(q, r)
    const ok = sh !== null && Math.min(...sh) >= KNOTEN_QUER_ACHSE_M && Math.max(...sh) < SEHNE_HALB - 0.5
    return ok ? [sh![0] + sh![1], [q, r]] as [number, RefPunkt] : null
  })
  for (let i = 0; i < qs.length; i++) {
    const lauf: [number, RefPunkt][] = []
    for (const x of qs.slice(i)) {
      if (x === null || (lauf.length && Math.abs(x[0] - lauf[0][0]) > KNOTEN_QUER_TOL_M)) break
      lauf.push(x)
    }
    if (lauf.length >= SEHNE_MIN_PUNKTE) return lauf.map(x => x[1])
  }
  return []
}

// ---------------------------------------------------------------- Abschnitte ohne AV-Messung (Brücke)
/** osm_breite -> [breite | null, lanes | null, quelle | null] */
export function osmBreite(t: Tags): [number | null, number | null, string | null] {
  const lanes = osmZahl(t.lanes)
  let b: number | null = null
  if (t.width) { const x = parseFloat(String(t.width).replace(',', '.').replace(/ ?m$/, '')); b = Number.isFinite(x) ? x : null }
  if (b !== null && b >= 2.0) return [b, lanes, `width ${b} m`]
  if (lanes) return [lanes * FS_OSM_BREITE_M, lanes, `lanes ${lanes} × ${String(FS_OSM_BREITE_M).replace('.', ',')} m`]
  return [null, lanes, null]
}

/** lage_osm -> [lage, breite, quelle] */
export function lageOsm(netz: OsmNetz, wid: number, ersatz: number | null = null): [number | null, number | null, string] {
  const w = netz.w(wid)
  const [b, n0, q] = osmBreite(w.t)
  if (w.ow) return [0, b, 'Einbahn, Mitte']
  if (b === null) return [ersatz, null, 'Annahme']
  const n = n0 || 2
  return [n === 1 ? 0 : b / 2 - b / n / 2, b, q!]
}

/** fahrbahn_osm: Querschnitt eines Wegs aus OSM (Brücke) */
export function fahrbahnOsm(netz: OsmNetz, wid: number): Fs {
  const [lage0, b0, q] = lageOsm(netz, wid, LAGE_ERSATZ)
  const b = b0 || BREITE_ERSATZ, lage = lage0 ?? LAGE_ERSATZ
  const ow = netz.w(wid).ow
  const je = ow ? b : b / 2
  return { lage, breite: b, rechts: b / 2, links: b / 2, lagePlausi: lage, parkR: false, parkL: false, abzugParkR: 0, abzugParkL: 0,
    veloR: 0, veloL: 0, jeRichtung: je, vomRand: b / 2 - lage, nSehnen: 0, mehrstreifig: je > MEHRSTREIFIG_AB ? 1 : 0,
    zweiRichtungen: ow ? 0 : 1, abzugQuelle: null, quelle: 'OSM', osmQuelle: `OSM Weg ${wid}: ${q || 'ohne Breite, Annahme'}` }
}

/** wege_abschnitte -> [s0, s1, wid | null] */
export function wegeAbschnitte(netz: OsmNetz, linie: P[]): [number, number, number | null][] {
  const out: [number, number, number | null][] = []
  let acc = 0
  for (let k = 0; k < linie.length - 1; k++) {
    const a = linie[k], b = linie[k + 1], l = dist(a, b)
    if (l <= 0.01) continue
    const ws = wegSegment(netz, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], einheit(sub(a, b)), 0.3)
    const wid = ws ? ws[0] : null
    if (out.length && out[out.length - 1][2] === wid) out[out.length - 1] = [out[out.length - 1][0], acc + l, wid]
    else out.push([acc, acc + l, wid])
    acc += l
  }
  return out
}

/** weg_bei */
export function wegBei(ab: [number, number, number | null][], s: number): number | null {
  const x = ab.find(([s0, s1]) => s0 - 1e-6 <= s && s <= s1 + 1e-6)
  return x ? x[2] : null
}

/** hoch_bei: Spur bei s auf einem Weg über dem Boden -> wid oder null */
export function hochBei(netz: OsmNetz, ab: [number, number, number | null][], s: number): number | null {
  const wid = wegBei(ab, s)
  return wid !== null && netz.w(wid).hoch ? wid : null
}
