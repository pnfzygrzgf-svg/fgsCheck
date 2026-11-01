// ── Sichtbarkeit entlang der Fahrstreifenachse und Sichtdreieck (VSS 40 273, Ziffern 4, 6, 7, 11) ──
//
// Von D aus wird jeder Zielpunkt FA(s) auf der Achse des vortrittsberechtigten Fahrstreifens geprüft (s ab dem Kreuzungspunkt
// K, entlang der Achse gemessen, alle SCHRITT_M): Sichtlinie D–FA(s) gegen die verdeckenden Flächen (Gebäude der AV und
// Hindernisse, linieTrifft aus fgsCheck). Vorhandene Sichtweite = grösstes s, bis zu dem alle Punkte ab K sichtbar sind;
// zwischen dem letzten sichtbaren und dem ersten verdeckten Punkt wird die Grenze durch Halbieren auf GENAU_M bestimmt
// (sicher: der letzte sichtbare Wert).
// Wirkung der Flächen (E2a, Entscheide vom 16.10.2026):
// - voll (Gebäude, Parkfeld Auto, Längsparkierung, Hecke/Mauer/übriges «sichtbehindernd», Zaun dicht): verdeckt wie oben.
// - Palisade (Bäume, Ziffer 11 und Abb. 3): die Zielpunkte werden fein (FEIN_M) geprüft; die vorhandene Sichtweite endet erst
//   vor einer zusammenhängend verdeckten Strecke, die innerhalb von A mindestens PALISADE_MIN_M misst (eine Fahrzeuglänge,
//   Entscheid 2; Strecken jenseits von A und der Teil einer Strecke jenseits von A zählen nicht), sonst nur Hinweis mit dem
//   verdeckten Anteil bis A und der längsten verdeckten Strecke bis A. Länge einer Strecke: Anzahl verdeckter Zielpunkte ×
//   FEIN_M (±FEIN_M); Lücken unter FEIN_M zwischen zwei Schatten werden nicht gesehen (Strecke eher zu lang).
// Abtastung: Status und vorhandene Sichtweite der vollen Verdecker je SCHRITT_M (wie E0), die Liste je FEIN_M; eine sehr
// schmale Fläche (Schatten unter 1 m auf der Achse) kann darum in der Liste stehen, ohne die Sichtweite zu kürzen.
// - Hinweis (Zweirad-Parkfelder, Entscheid 1; Zaun sichtdurchlässig): keine Wirkung, nur in der Liste.
// Je Richtung die Liste aller Flächen, die eine Sichtlinie bis A schneiden (erster verdeckter Meter, verdeckte Strecke; fein).
// Sichtdreieck für die Anzeige: Polygon aus D und den Achsenpunkten von K bis A.

import type { P } from '../geo'
import type { Poly } from './poly'
import { linieTrifft } from './hindernisse'
import { abschneiden, streckeLaenge } from './netz'
import { punkteAufSpur } from './spur'

export const SCHRITT_M = 1.0
export const GENAU_M = 0.001
/** feine Abtastung für Palisade und Liste der Verdecker */
export const FEIN_M = 0.1
/** Palisade: zusammenhängend verdeckte Strecke, ab der Bäume als Verdeckung zählen (eine Fahrzeuglänge, Entscheid 2) */
export const PALISADE_MIN_M = 5.0

export type Wirkung = 'voll' | 'palisade' | 'hinweis'
/** verdeckende Fläche; art, quelle für Liste und Karte; wirkung fehlt = voll (Gebäude) */
export interface Verdeckend { poly: Poly; id: string; name: string; art?: string; quelle?: string; wirkung?: Wirkung }

/** Fläche, die mindestens eine Sichtlinie bis A schneidet: erster verdeckter Zielpunkt und verdeckte Strecke entlang der Achse */
export interface VerdeckerTreffer { v: Verdeckend; sErst: number; strecke: number }

export interface Palisade {
  anteil: number              // verdeckter Anteil der Strecke K bis A (0…1), nur Bäume
  laengste: number            // längste zusammenhängend verdeckte Strecke innerhalb von A [m]
  strecken: [number, number][] // verdeckte Strecken [von, bis] (s der Zielpunkte, ganze Achse bis sMax)
  zaehlt: boolean             // eine Strecke misst innerhalb von A ≥ PALISADE_MIN_M und beginnt vor der ersten vollen Verdeckung
  hinterVoll: boolean         // eine solche Strecke liegt erst hinter der ersten vollen Verdeckung (ohne Wirkung)
  beiA: boolean | null        // Zielpunkt bei A durch einen Baum verdeckt (null: A ausserhalb der Achse)
}

export interface SichtErgebnis {
  punkte: P[]                 // Zielpunkte FA(s), s = 0, SCHRITT_M, … bis sMax (Punkt 0 = K)
  abstaende: number[]         // s je Zielpunkt
  sichtbar: boolean[]         // ohne volle Verdeckung
  vorhanden: number           // durchgehend sichtbar ab K bis hierhin [m] (mit Palisadenregel)
  bisEnde: boolean            // alle Zielpunkte bis sMax sichtbar
  verdecker: Verdeckend | null // Fläche, die den ersten verdeckten Zielpunkt verdeckt
  sVerdeckt: number | null    // s des ersten verdeckten Zielpunkts
  liste: VerdeckerTreffer[]   // alle Flächen mit Treffer bis A, nach sErst
  palisade: Palisade | null   // nur, wenn ein Baum eine Sichtlinie schneidet
}

/** Punkt auf der Achse bei Bogenlänge s (Achse ab K); über das Ende hinaus das Ende */
export function achsPunkt(achse: P[], s: number): P {
  const r = punkteAufSpur(achse, [s])
  return r.length ? r[0][0] : achse[achse.length - 1]
}

type Box = [number, number, number, number]
interface Fl { v: Verdeckend; box: Box }

/** verdeckende Fläche der Sichtlinie D–Z oder null (Vorauswahl über die Box der Strecke) */
export function verdeckt(D: P, Z: P, flaechen: Fl[]): Verdeckend | null {
  const x0 = Math.min(D[0], Z[0]), x1 = Math.max(D[0], Z[0]), y0 = Math.min(D[1], Z[1]), y1 = Math.max(D[1], Z[1])
  for (const f of flaechen) {
    if (f.box[2] < x0 || f.box[0] > x1 || f.box[3] < y0 || f.box[1] > y1) continue
    if (linieTrifft([D, Z], [f.v.poly])) return f.v
  }
  return null
}

const boxVon = (poly: Poly): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of poly) for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  return [x0, y0, x1, y1]
}
const boxPunkte = (pts: P[]): Box => boxVon([pts])
const boxSchnitt = (a: Box, b: Box) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])

/**
 * Sicht von D auf die Achse (Polylinie ab K, entlang der Fahrstreifenachse vom Knoten weg) bis sMax.
 * flaechen: verdeckende Flächen mit Wirkung (Gebäude, Hindernisse). A: massgebende Sichtweite für die Liste der Verdecker und
 * den Anteil der Palisade (Vorgabe sMax). Ist die Achse kürzer als sMax, endet die Prüfung am Achsenende.
 */
export function sichtEntlang(D: P, achse: P[], sMax: number, flaechen: Verdeckend[], A = sMax, schritt = SCHRITT_M): SichtErgebnis {
  const alle = flaechen.map(v => ({ v, box: boxVon(v.poly) }))
  const voll = alle.filter(f => (f.v.wirkung ?? 'voll') === 'voll')
  const pal = alle.filter(f => f.v.wirkung === 'palisade')
  const ende = Math.min(sMax, streckeLaenge(achse))
  const abstaende: number[] = []
  for (let s = 0; s <= ende + 1e-9; s += schritt) abstaende.push(Math.round(s * 1e6) / 1e6)
  if (abstaende[abstaende.length - 1] < ende - 1e-6) abstaende.push(ende)
  const punkte = punkteAufSpur(achse, abstaende).map(x => x[0])
  const sichtbar: boolean[] = []
  let erster = -1, verdecker: Verdeckend | null = null
  punkte.forEach((Z, i) => {
    const v = verdeckt(D, Z, voll)
    sichtbar.push(v === null)
    if (v && erster < 0) { erster = i; verdecker = v }
  })
  // volle Verdeckung: Grenze zwischen dem letzten sichtbaren und dem ersten verdeckten Zielpunkt halbieren
  let sVoll = ende, sVerdeckt: number | null = null
  if (erster === 0) { sVoll = 0; sVerdeckt = 0 }
  else if (erster > 0) {
    let lo = abstaende[erster - 1], hi = abstaende[erster]
    while (hi - lo > GENAU_M) {
      const m = (lo + hi) / 2
      const v = verdeckt(D, achsPunkt(achse, m), voll)
      if (v) { hi = m; verdecker = v } else lo = m
    }
    sVoll = lo; sVerdeckt = abstaende[erster]
  }

  // fein: Liste der Verdecker bis A (alle Wirkungen) und Palisade (Bäume) bis zum Ende
  const bisA = Math.min(A, ende)
  const fein: number[] = []
  for (let k = 0; k * FEIN_M <= ende + 1e-9; k++) fein.push(Math.round(k * FEIN_M * 1e6) / 1e6)
  if (fein[fein.length - 1] < ende - 1e-6) fein.push(ende)
  const feinP = punkteAufSpur(achse, fein).map(x => x[0])
  const kBisA = fein.filter(s => s <= bisA + 1e-9).length
  const kandidaten = kBisA ? alle.filter(f => boxSchnitt(f.box, boxPunkte([D, ...feinP.slice(0, kBisA)]))) : []
  const treffer = new Map<Verdeckend, { erst: number; n: number }>()
  const palVerdeckt: Verdeckend[] = []        // je feinem Zielpunkt der verdeckende Baum (bzw. undefined)
  feinP.forEach((Z, k) => {
    const segBox: Box = [Math.min(D[0], Z[0]), Math.min(D[1], Z[1]), Math.max(D[0], Z[0]), Math.max(D[1], Z[1])]
    if (k < kBisA) for (const f of kandidaten) {
      if (!boxSchnitt(f.box, segBox) || !linieTrifft([D, Z], [f.v.poly])) continue
      const t = treffer.get(f.v)
      if (t) t.n++; else treffer.set(f.v, { erst: fein[k], n: 1 })
      if (f.v.wirkung === 'palisade' && !palVerdeckt[k]) palVerdeckt[k] = f.v
    }
    else if (pal.length) { const v = verdeckt(D, Z, pal); if (v) palVerdeckt[k] = v }
  })
  const liste = [...treffer.entries()].map(([v, t]) => ({ v, sErst: t.erst, strecke: t.n * FEIN_M })).sort((a, b) => a.sErst - b.sErst)

  let vorhanden = sVoll, bisEnde = erster < 0, palisade: Palisade | null = null
  if (palVerdeckt.some(x => x)) {
    const strecken: [number, number][] = [], laeufe: [number, number][] = []
    for (let k = 0; k < fein.length; k++) {
      if (!palVerdeckt[k]) continue
      let j = k
      while (j + 1 < fein.length && palVerdeckt[j + 1]) j++
      laeufe.push([k, j]); strecken.push([fein[k], fein[j]])
      k = j
    }
    // Länge innerhalb von A (feine Punkte mit s ≤ A)
    const laengeA = ([k, j]: [number, number]) => Math.max(0, Math.min(j, kBisA - 1) - k + 1) * FEIN_M
    const lang = laeufe.find(l => laengeA(l) >= PALISADE_MIN_M - 1e-9)
    // Schnitt: letzter sichtbarer feiner Zielpunkt vor der langen Strecke (sicher)
    const sPal = lang ? (lang[0] === 0 ? 0 : fein[lang[0] - 1]) : Infinity
    const zaehlt = !!lang && sPal < sVoll
    if (zaehlt) { vorhanden = sPal; bisEnde = false; verdecker = palVerdeckt[lang![0]]; sVerdeckt = fein[lang![0]] }
    const nA = palVerdeckt.slice(0, kBisA).filter(x => x).length
    const kA = A <= ende + 1e-9 ? Math.min(fein.length - 1, Math.round(A / FEIN_M)) : -1
    palisade = { anteil: kBisA ? nA / kBisA : 0, laengste: Math.max(...laeufe.map(laengeA)), strecken, zaehlt, hinterVoll: !!lang && !zaehlt,
      beiA: kA < 0 ? null : !!palVerdeckt[kA] }
  }
  return { punkte, abstaende, sichtbar, vorhanden, bisEnde, verdecker, sVerdeckt, liste, palisade }
}

/** Sichtdreieck: Polygon aus D und den Achsenpunkten von s0 bis s1 (Achse ab K; bei gekrümmter Achse der Kurve folgend) */
export function sichtdreieck(D: P, achse: P[], s0: number, s1: number, schritt = SCHRITT_M): P[] {
  if (s1 <= s0) return []
  const ab: number[] = []
  for (let s = s0; s < s1 - 1e-9; s += schritt) ab.push(s)
  ab.push(s1)
  const pts = punkteAufSpur(achse, ab).map(x => x[0])
  return pts.length ? [D, ...pts] : []
}

/** Achse von K bis zur Länge s (für die Anzeige) */
export const achseBis = (achse: P[], s: number): P[] => abschneiden(achse, s)
