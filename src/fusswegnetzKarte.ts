// ── Fusswegnetz (Richtplan Fussverkehr Stadt Bern) auf der Karte (30.10.2026; nur Darstellung, ohne Wirkung auf die Rechnung) ──
//
// Zeigt die schon für die Vorbelegung geladenen Daten (daten/richtplanFussverkehr.ts, keine eigene Abfrage): Basisnetz-Linien und
// publikumsattraktive Bereiche. Die Basisnetz-Linie, die die Vorbelegung nutzt (quert die Fahrbahn bis AUTO_C.netzM vom Streifen, die
// nächste je Querung wie automatikC.netzVorbelegen), ist markiert, damit sichtbar ist, warum «Fusswegnetz» vorbelegt ist.

import type { P } from './geo'
import type { StreifenErgebnis } from './rechner/typen'
import type { RichtplanDaten } from './daten/richtplanFussverkehr'
import { imBereich, type Bereich } from './daten/haltestellen'
import { AUTO_C, querAbstand, querungsAchse } from './bedarf/automatikC'

export const FUSSWEGNETZ_NAME = 'Fusswegnetz (Richtplan Bern)'
export const FUSSWEGNETZ_FARBE = '#6b21a8'
export const STRICH_FUSSWEGNETZ = '6 4'
export const BASISNETZ_TEXT = 'Basisnetz Fussverkehr (Richtplan Stadt Bern)'

export interface FwnLinie { id: string; teile: P[][]
  /** von der Vorbelegung genutzt (quert die Fahrbahn bis AUTO_C.netzM vom Streifen, nächste Linie der Querung) */
  genutzt: boolean
  /** Tooltip (Klartext) */
  text: string }
export interface FwnFlaeche { id: string; ringe: P[][]; text: string }
export interface FusswegnetzKarte { linien: FwnLinie[]; flaechen: FwnFlaeche[] }

const wo = (d: number) => (Math.round(d) === 0 ? 'beim Streifen' : `${Math.round(d)} m vom Streifen`)

/**
 * Ebene «Fusswegnetz» aus den geladenen Richtplan-Daten (null: nicht geladen bzw. ausserhalb Berns). querungen: Streifen je Querung
 * (vorbelegung.querungen); bereich: geladener Ausschnitt (ohne Deckung bis AUTO_C.wunschM keine Markierung, wie die Vorbelegung).
 */
export function fusswegnetzKarte(rp: RichtplanDaten | null | undefined, querungen: readonly StreifenErgebnis[][], bereich?: Bereich):
  FusswegnetzKarte | null {
  if (!rp || (!rp.basisnetz?.length && !rp.publikum?.length)) return null
  const linien = rp.basisnetz ?? []
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
  return {
    linien: linien.map(l => {
      const g = genutzt.get(l.id)
      return { id: l.id, teile: l.teile, genutzt: g !== undefined,
        text: g !== undefined ? `${BASISNETZ_TEXT}: für die Vorbelegung genutzt, quert die Fahrbahn ${wo(g)}` : BASISNETZ_TEXT }
    }),
    flaechen: (rp.publikum ?? []).map(f => ({ id: f.id, ringe: f.ringe,
      text: f.name ? `Publikumsattraktiver Bereich: ${f.name}` : 'Publikumsattraktiver Bereich (Richtplan Stadt Bern)' })),
  }
}
