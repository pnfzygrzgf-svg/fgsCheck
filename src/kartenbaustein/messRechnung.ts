// ── Rechnung des Messwerkzeugs (messwerkzeug.ts): Länge, Fläche und Schreibweise, eben in LV95 ──

import { dist, type P } from './geometrie'

/** Länge der Linie durch die Punkte (geschlossen: mit dem Abschnitt zurück zum ersten Punkt), in Metern */
export function streckenLaenge(ps: readonly P[], geschlossen = false): number {
  let s = 0
  for (let i = 1; i < ps.length; i++) s += dist(ps[i - 1], ps[i])
  return geschlossen && ps.length > 2 ? s + dist(ps[ps.length - 1], ps[0]) : s
}

/** Inhalt des Polygons (Gausssche Trapezformel), in Quadratmetern */
export function flaechenInhalt(ps: readonly P[]): number {
  if (ps.length < 3) return 0
  let s = 0
  for (let i = 0; i < ps.length; i++) { const a = ps[i], b = ps[(i + 1) % ps.length]; s += a[0] * b[1] - b[0] * a[1] }
  return Math.abs(s) / 2
}

const zahl = (x: number, stellen: number): string => {
  const [ganz, rest] = x.toFixed(stellen).split('.')
  return ganz.replace(/\B(?=(\d{3})+(?!\d))/g, '’') + (rest ? `,${rest}` : '')
}
/** Länge: unter 100 m auf den Zentimeter, darüber auf den Dezimeter, ab 1 km in Kilometern */
export const meterText = (m: number): string => (m < 100 ? `${zahl(m, 2)} m` : m < 1000 ? `${zahl(m, 1)} m` : `${zahl(m / 1000, 3)} km`)
/** Fläche: unter 100 m² mit einer Nachkommastelle, ab 1 ha zusätzlich in Hektaren */
export const flaechenText = (a: number): string =>
  (a < 100 ? `${zahl(a, 1)} m²` : `${zahl(a, 0)} m²`) + (a >= 10000 ? ` (${zahl(a / 10000, 2)} ha)` : '')
