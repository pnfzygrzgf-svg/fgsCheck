// ── Fusswegnetz: die für die Prüfung genutzte Basisnetz-Linie (30.10.2026; nur Darstellung, ohne Wirkung auf die Rechnung) ──
//
// Aus den schon für die Vorbelegung geladenen Daten (daten/richtplanFussverkehr.ts, keine eigene Abfrage) die Basisnetz-Linie, die die
// Vorbelegung nutzt (quert die Fahrbahn bis AUTO_C.netzM vom Streifen, die nächste je Querung wie automatikC.netzVorbelegen). Die Ebene
// «Richtplan Fussverkehr (Geoportal Bern)» (daten/richtplanKarte.ts) zeichnet sie kräftiger und nennt den Abstand im Tooltip.

import type { P } from './geo'
import type { StreifenErgebnis } from './rechner/typen'
import type { RichtplanDaten } from './daten/richtplanFussverkehr'
import { imBereich, type Bereich } from './daten/haltestellen'
import { AUTO_C, querAbstand, querungsAchse } from './bedarf/automatikC'

export const BASISNETZ_TEXT = 'Basisnetz Fussverkehr (Richtplan Stadt Bern)'

/** von der Vorbelegung genutzte Basisnetz-Linie (quert die Fahrbahn bis AUTO_C.netzM vom Streifen, nächste Linie der Querung) */
export interface FwnLinie { id: string; teile: P[][]
  /** Abstand der Querung der Fahrbahn vom Streifen [m] */
  abstandM: number
  /** Tooltip (Klartext) */
  text: string }
export interface FusswegnetzKarte { linien: FwnLinie[] }

const wo = (d: number) => (Math.round(d) === 0 ? 'beim Streifen' : `${Math.round(d)} m vom Streifen`)

/**
 * Ebene «Fusswegnetz: für die Prüfung genutzte Linie» aus den geladenen Richtplan-Daten; null: nicht geladen, ausserhalb Berns bzw.
 * keine Linie genutzt. querungen: Streifen je Querung (vorbelegung.querungen); bereich: geladener Ausschnitt (ohne Deckung bis
 * AUTO_C.wunschM keine Linie, wie die Vorbelegung).
 */
export function fusswegnetzKarte(rp: RichtplanDaten | null | undefined, querungen: readonly StreifenErgebnis[][], bereich?: Bereich):
  FusswegnetzKarte | null {
  const linien = rp?.basisnetz ?? []
  if (!linien.length) return null
  const genutzt = new Map<string, number>()
  for (const st of querungen) {
    if (!st.length) continue
    const a = querungsAchse(st)
    if (bereich && ![a.A, a.B].every(p => imBereich(p, AUTO_C.wunschM, bereich))) continue
    const d = linien.map(l => querAbstand(l.teile, a, AUTO_C.wunschM))
    const min = Math.min(...d.map(x => x ?? Infinity))
    if (!(min <= AUTO_C.netzM + 1e-9)) continue
    // gleich nahe Linien (z. B. an der Querung geteilte Abschnitte) alle
    d.forEach((x, i) => { if (x !== null && x <= min + 1e-6) genutzt.set(linien[i].id, Math.min(x, genutzt.get(linien[i].id) ?? Infinity)) })
  }
  const aus = linien.filter(l => genutzt.has(l.id)).map(l => ({ id: l.id, teile: l.teile, abstandM: genutzt.get(l.id)!,
    text: `${BASISNETZ_TEXT}: für die Vorbelegung genutzt, quert die Fahrbahn ${wo(genutzt.get(l.id)!)}` }))
  return aus.length ? { linien: aus } : null
}
