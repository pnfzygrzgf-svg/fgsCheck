import type { P } from './geo'

/** Prüfsumme benannter Linien (Lage auf 0,1 m) und weiterer Teile, z. B. der Höhendienste (SW-05, Prüfung 10.11.2026): ein geladenes
 *  Höhenprofil gilt nur für die Linien, entlang der es geholt wurde. Wie die Prüfsummen der Geländeprüfungen (sichtGelaende.ts) */
export function linienPruefsumme(linien: readonly (readonly [string, readonly P[]])[], ...zusatz: string[]): string {
  const r = (p: P) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`
  const text = `${zusatz.join('|')}|${linien.map(([k, l]) => `${k}:${l.map(r).join(';')}`).join('|')}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16)
}

/** Kennung der Höhendienste in der Reihenfolge des Rückfalls */
export const diensteKennung = (dienste: readonly { id: string }[]): string => dienste.map(d => d.id).join('>')
