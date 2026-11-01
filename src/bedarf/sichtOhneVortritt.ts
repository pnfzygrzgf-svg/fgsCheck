// ── Bedarfsmodul: Sichtweite für Querungen ohne Vortritt (E3/E3a, VSS 40 240:2025-07 Z. 8.1, 8.2, Abb. 1) ──
//
// Soll = max(v [m/s] · L / Gehgeschwindigkeit; Anhaltesichtweite(v)) je Teilquerung (Korrektur K5, Entscheid 6). Ausnahme bei
// wenig Querenden und wenig Verkehr: nur die Anhaltesichtweite. Später nutzt der Sichtrechner (E1) dieselbe Funktion.

import { ahs } from './tabellen'

/** Rechentoleranz für Vergleiche mit gerechneten Werten (z. B. 12 / 1,2) */
export const EPS = 1e-9

/** Soll-Sichtweite [m] nach Formel und Anhaltesichtweite; v in km/h, L in m, gehV in m/s */
export function sollSichtOhneVortritt(v: number, L: number, gehV: number): number {
  return Math.max(formelSicht(v, L, gehV), ahs(v))
}

/** Formelteil: v [m/s] · L / Gehgeschwindigkeit */
export const formelSicht = (v: number, L: number, gehV: number): number => (v / 3.6) * L / gehV

export interface TeilSicht { L: number; sicht: number; soll: number; sollAhs: number }
export interface SichtOhneVortritt {
  teile: TeilSicht[]
  /** mindestens eine Teilquerung unter der Anhaltesichtweite (verletzt, auch mit Ausnahme) */
  unterAhs: boolean
  /** mindestens eine Teilquerung unter dem Soll nach Formel, aber über der Anhaltesichtweite */
  imSpielraum: boolean
}

/**
 * Vergleich je Teilquerung. Paarung: gleich viele Sichtweiten wie Teilquerungen → paarweise; sonst jede Sichtweite gegen die
 * längste Teilquerung (z. B. ohne Insel eine Querdistanz und zwei Zufahrten).
 */
export function pruefeSichtOhneVortritt(v: number, L: number[], sicht: number[], gehV: number): SichtOhneVortritt {
  const paar = L.length === sicht.length
  const Lmax = Math.max(...L)
  const teile = sicht.map((s, i) => {
    const l = paar ? L[i] : Lmax
    return { L: l, sicht: s, soll: sollSichtOhneVortritt(v, l, gehV), sollAhs: ahs(v) }
  })
  return {
    teile,
    unterAhs: teile.some(t => t.sicht < t.sollAhs - EPS),
    imSpielraum: teile.some(t => t.sicht >= t.sollAhs - EPS && t.sicht < t.soll - EPS),
  }
}
