// ── Taktil-visuelle Markierungen: die für die Prüfung genutzten Objekte (30.10.2026; nur Darstellung, ohne Wirkung auf die Rechnung) ──
//
// Aus den schon für die Vorbelegung geladenen Daten (daten/taktil.ts, keine eigene Abfrage) je Querung das Feld, das «taktil = ja»
// setzt, und die Leitlinie, die «leitlinie = ja» setzt – mit derselben Wahl wie die Vorbelegung (automatikC.taktilTreffer). Die Ebene
// «Taktile Markierungen (Stadt Bern)» (daten/taktilKarte.ts) zeichnet sie kräftiger und vermerkt sie im Tooltip.

import type { StreifenErgebnis } from './rechner/typen'
import type { BernErgebnis } from './daten/geoportal'
import type { TaktilDaten, TvmFeld, TvmLinie } from './daten/taktil'
import { taktilTreffer } from './bedarf/automatikC'

/** von der Vorbelegung genutzte Felder und Leitlinien (je Kennung einmal, in der Reihenfolge der Querungen) */
export interface TaktilGenutzt { felder: TvmFeld[]; linien: TvmLinie[] }

/**
 * Genutzte Markierungen aller Querungen; null: nicht geladen, Fehler, ausserhalb Berns bzw. nichts genutzt. querungen: Streifen je
 * Querung (vorbelegung.querungen); ohne Deckung des geladenen Ausschnitts nichts (wie die Vorbelegung).
 */
export function taktilGenutzt(t: BernErgebnis<TaktilDaten> | null | undefined, querungen: readonly StreifenErgebnis[][]): TaktilGenutzt | null {
  if (!t || 'fehler' in t) return null
  const felder = new Map<string, TvmFeld>(), linien = new Map<string, TvmLinie>()
  for (const st of querungen) {
    if (!st.length) continue
    const r = taktilTreffer(st, t)
    if (r.feld) felder.set(r.feld.z.id, r.feld.z)
    if (r.linie) linien.set(r.linie.id, r.linie)
  }
  return felder.size || linien.size ? { felder: [...felder.values()], linien: [...linien.values()] } : null
}
