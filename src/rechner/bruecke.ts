// ── Umriss der Brücken (AV-Einzelobjekte Bruecke_Passerelle) ──
//
// Für die Rechnung (Kontext.brueckenumriss: Fahrbahn, Brückenkopf, Erkennungsdistanz) und die Geländeprüfung der App (das Höhenmodell
// kennt keine Brücken: Sichtlinien mit Augpunkt bzw. Ziel auf einer Brücke sind dort nicht prüfbar).

import type { P } from '../geo'
import type { AvFlaeche } from '../daten/av'
import { abstandPunkt } from './poly'

/** Punkt bis so weit neben dem Umriss gilt als auf der Brücke [m] */
export const BRUECKE_UMRISS_M = 0.5

/** Umriss der Brücken aus den AV-Einzelobjekten; null ohne Brücke */
export function brueckenumriss(sosf: readonly AvFlaeche[]): { enthaelt(p: P): boolean } | null {
  const bruecken = sosf.filter(f => f.art === 'Bruecke_Passerelle').map(f => f.ringe)
  return bruecken.length ? { enthaelt: (p: P) => bruecken.some(r => abstandPunkt([r], p) <= BRUECKE_UMRISS_M) } : null
}
