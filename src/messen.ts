// ── Werkzeug «Messen» (27.10.2026): Strecke zwischen zwei Klicks, gefangen auf AV-Stützpunkte wie der Fixpunkt ──
//
// Jeder Klick fängt den nächsten Stützpunkt der AV-Bodenbedeckung im Umkreis von FANG_PX Bildschirmpunkten (fixpunkt.fangen), sonst
// gilt der Klick als freier Punkt. Die Strecke steht mit zwei Nachkommastellen auf der Karte und in der Werkzeughilfe; «übernehmen»
// schreibt sie, auf 0,05 m gerundet, in das zuletzt angeklickte Zahlenfeld des Panels. Nichts davon kommt in den Fall.
// Genauigkeit: am Luftbild rund 10 cm je Bildpunkt; mit Fang so genau wie die Vermessungspunkte der AV.

import { dist, type P } from './geo'
import { fangen } from './fixpunkt'
import type { AvFlaeche } from './daten/av'
import type { FixpunktArt } from './fall'

export interface MessPunkt { p: P; art: FixpunktArt }
export interface Messung { a: MessPunkt; b: MessPunkt | null }

/** Klick fangen (AV-Stützpunkt im Radius, sonst frei) */
export const messPunkt = (p: P, av: AvFlaeche[], radiusM: number): MessPunkt => { const g = fangen(p, av, radiusM); return { p: g.p, art: g.art } }

/** nächster Stand nach einem Klick: erster Punkt einer neuen Messung bzw. zweiter Punkt der laufenden */
export const messKlick = (m: Messung | null, q: MessPunkt): Messung => (!m || m.b ? { a: q, b: null } : { a: m.a, b: q })

/** Länge einer fertigen Messung in Metern (null: erst ein Punkt) */
export const messLaenge = (m: Messung | null): number | null => (m?.b ? dist(m.a.p, m.b.p) : null)

/** Text auf der Karte und in der Hilfe: zwei Nachkommastellen, «m» */
export const messText = (x: number): string => `${x.toFixed(2).replace('.', ',')} m`

/** Wert für ein Zahlenfeld: auf 0,05 m gerundet, mit Dezimalkomma */
export const messWert = (x: number): string => (Math.round(x / 0.05) * 0.05).toFixed(2).replace('.', ',')

/** Zahlenfeld des Panels, in das «übernehmen» schreibt (Textfeld mit Dezimaltastatur bzw. Zahlfeld) */
export const istZahlenfeld = (el: Element | null): el is HTMLInputElement =>
  !!el && el.tagName === 'INPUT' && ((el as HTMLInputElement).inputMode === 'decimal' || (el as HTMLInputElement).type === 'number')

/** Wert in ein Zahlenfeld schreiben wie eine Eingabe (React sieht die Änderung) und danach mit Enter übernehmen (erst nach dem Neuzeichnen,
 * damit das Feld den neuen Text kennt); fertig: nach dem Übernehmen */
export function inFeldSchreiben(el: HTMLInputElement, wert: string, fertig?: () => void): void {
  const text = el.type === 'number' ? wert.replace(',', '.') : wert
  // Wert über den Setter des Prototyps (sonst übersieht React die Änderung)
  const setter = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set : undefined
  if (setter) setter.call(el, text); else el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  setTimeout(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fertig?.() }, 0)
}
