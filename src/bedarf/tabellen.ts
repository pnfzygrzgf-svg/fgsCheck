// ── Bedarfsmodul: Zahlentabellen (E0) ──
//
// Nur Zahlenwerte und Klassen, kein Normtext. Tab. 1 von VSS 40 241 (Sichtweite FGS nach Tempo) und die Stufen kommen aus
// rechner/tempo.ts und werden nicht kopiert. Neu hier: Anhaltesichtweiten nach VSS 40 240 Z. 8.2 (für Querungen ohne Vortritt,
// getrennt von Tab. 1, Befund P18), Tab. 2 von VSS 40 241 vollständig (tempo.ts führt bis 20 m die bfu-Werte für Knoten) und die
// Berner Tabellen Tempo × DTV nach Masterplan Fussverkehr (Skizze Abschnitt 3a). Bei Kurvenradius 20 m gilt wie in der
// Sichtprüfung der bfu-Wert 24 m statt 30 m nach Tab. 2 (Nutzerentscheid 20.10.2026); der Befund nennt den Normwert.

import { SICHTWEITE, sichtweiteKurve, sichtweiteTab1, tempoStufe } from '../rechner/tempo'

/** Anhaltesichtweite [m] nach Tempo [km/h] (VSS 40 240:2025-07 Z. 8.2) */
export const AHS_40240: Readonly<Record<number, number>> = { 20: 15, 30: 25, 40: 40, 50: 55, 60: 75 }

/** Anhaltesichtweite: Zwischenwerte auf die nächsthöhere Stufe; über 60 km/h ist keine Stufe tabelliert, es gilt der Wert für 60 */
export function ahs(v: number): number {
  const stufen = Object.keys(AHS_40240).map(Number).sort((a, b) => a - b)
  const s = stufen.find(t => t >= v - 1e-9) ?? stufen[stufen.length - 1]
  return AHS_40240[s]
}

/** Notwendige Sichtweite [m] nach Kurvenradius in Fahrstreifenmitte [m] (VSS 40 241:2019-03 Tab. 2) */
export const TAB2_40241: Readonly<Record<number, number>> = { 20: 30, 25: 35, 30: 40, 35: 45, 40: 50 }

/**
 * Sichtweite nach Kurve wie die Sichtprüfung (tempo.sichtweiteKurve): Radius bis 20 m bfu-Wert 24 m, 25 bis 40 m Tab. 2
 * (Nutzerentscheid 20.10.2026); Radius zwischen den Stufen auf die nächsthöhere Stufe. norm: Wert nach Tab. 2 für den Hinweis.
 * Ausserhalb 20 bis 40 m null.
 */
export function sichtKurveTab2(radius: number): { sicht: number; norm: number } | null {
  const stufen = Object.keys(TAB2_40241).map(Number).sort((a, b) => a - b)
  if (radius < stufen[0] - 1e-9 || radius > stufen[stufen.length - 1] + 1e-9) return null
  const norm = TAB2_40241[stufen.find(r => r >= radius - 1e-9)!]
  return { sicht: sichtweiteKurve(radius)[0] ?? norm, norm }
}

/** Tab. 1 von VSS 40 241 (Sichtweite FGS) für ein Tempo: Stufe nach tempo.ts */
export const sichtFgs = (v: number): number => sichtweiteTab1(tempoStufe(v))
export { SICHTWEITE as TAB1_40241 }

// ── Berner Tabellen (Masterplan Fussverkehr Stadt Bern, Standards, Oktober 2025: Q1 S. 58, Q2 S. 60, Q3 S. 62, E1 S. 64) ──

export type Bern3a = 'ja' | 'nein' | 'ja_nein'
export type TempoKlasse = 'k20' | 'k30' | 'k50'
/** Tempoklassen: bis 20 → k20, 21 bis 30 → k30, über 30 → k50 */
export const TEMPO_GRENZEN = { k20: 20, k30: 30 } as const
/** DTV-Klassen: bis 5 000, 5 001 bis 10 000, 10 001 bis 15 000, über 15 000 (Spalten 0 bis 3) */
export const DTV_GRENZEN: readonly number[] = [5000, 10000, 15000]
/** Trottoirüberfahrt: Grenze DTV der einmündenden Strasse (unter / ab) */
export const Q3_DTV_GRENZE = 4800

export function kTempo(vSig: number): TempoKlasse {
  return vSig <= TEMPO_GRENZEN.k20 ? 'k20' : vSig <= TEMPO_GRENZEN.k30 ? 'k30' : 'k50'
}
/** DTV-Klasse als Spalte 0 bis 3 */
export function kDtv(dtv: number): number {
  const i = DTV_GRENZEN.findIndex(g => dtv <= g)
  return i < 0 ? DTV_GRENZEN.length : i
}

export const BERN_FGS: Readonly<Record<TempoKlasse, readonly Bern3a[]>> = {
  k50: ['ja', 'ja', 'ja', 'ja'], k30: ['ja', 'ja', 'ja', 'ja'], k20: ['nein', 'nein', 'nein', 'nein'],
}
export const BERN_INSEL: Readonly<Record<TempoKlasse, readonly Bern3a[]>> = {
  k50: ['ja_nein', 'ja', 'ja', 'ja'], k30: ['nein', 'ja_nein', 'ja_nein', 'ja_nein'], k20: ['nein', 'nein', 'nein', 'nein'],
}
export const BERN_LSA: Readonly<Record<TempoKlasse, readonly Bern3a[]>> = {
  k50: ['nein', 'ja_nein', 'ja_nein', 'ja'], k30: ['nein', 'nein', 'nein', 'nein'], k20: ['nein', 'nein', 'nein', 'nein'],
}
/** Spalten: DTV der einmündenden Strasse unter 4 800 / ab 4 800; Tempo der einmündenden Strasse */
export const BERN_Q3: Readonly<Record<TempoKlasse, readonly Bern3a[]>> = {
  k50: ['nein', 'nein'], k30: ['ja', 'nein'], k20: ['ja', 'nein'],
}

export const bernTabelle = (t: Readonly<Record<TempoKlasse, readonly Bern3a[]>>, vSig: number, dtv: number): Bern3a =>
  t[kTempo(vSig)][kDtv(dtv)]
