// ── Messen ins Formular (27.10.2026; seit 17.11.2026 über das Messwerkzeug der Karte, kartenbaustein/messwerkzeug.ts) ──
//
// Gemessen wird mit dem Messwerkzeug der Karte (Zwei Punkte, Ab AV-Kante, Ganze Fläche, Linienzug, Flächeninhalt; Rechnung in
// kartenbaustein/messAv.ts). Hier stehen nur die Teile des fgsCheck: welches Zahlenfeld Ziel von «übernehmen» sein darf, wie der Wert
// hineinkommt (auf 0,05 m gerundet) und das Startsignal der Knöpfe «messen» neben den Meterfeldern der Bedarfsmaske.
// Das frühere eigene Werkzeug «Messen» mit Kasten über der Karte ist darin aufgegangen.

import { FELD_DEFS } from './bedarf/felder'
import { frageVon } from './bedarf/feldhilfen'

/** Messart, mit der ein Knopf «messen» das Werkzeug startet (Namen wie im Messwerkzeug der Karte) */
export type MessArt = 'kante' | 'flaeche' | 'hand'

export const messWert = (x: number): string => (Math.round(x / 0.05) * 0.05).toFixed(2).replace('.', ',')

/** Startsignal für das Werkzeug «Messen» aus einem Meterfeld der Bedarfsmaske (06.11.2026): das Feld bekommt zuerst den Fokus (die App
 *  merkt sich das zuletzt angeklickte Zahlenfeld), dann startet die Karte ihr Messwerkzeug; «übernehmen» schreibt in dieses Feld */
export const MESSEN_START_EVENT = 'fgs.messen.start'
export function messenStarten(feld: HTMLInputElement | null, art: MessArt = 'hand'): void {
  feld?.focus()
  window.dispatchEvent(new CustomEvent<MessArt>(MESSEN_START_EVENT, { detail: art }))
}
/** Messart, mit der das Werkzeug aus einem Feld der Bedarfsmaske startet: Fahrbahnbreiten Bordstein bis Bordstein als «Ganze Fläche»,
 *  sonst «Zwei Punkte» */
export const messArtFuerFeld = (pfad: string): MessArt => (pfad === 'fahrbahnB' || pfad === 'restbreiteM' ? 'flaeche' : 'hand')

/** Zahlenfeld des Panels, in das «übernehmen» schreibt (Textfeld mit Dezimaltastatur bzw. Zahlfeld) */
export const istZahlenfeld = (el: Element | null): el is HTMLInputElement =>
  !!el && el.tagName === 'INPUT' && ((el as HTMLInputElement).inputMode === 'decimal' || (el as HTMLInputElement).type === 'number')

/** Feld der Maske, in das «übernehmen» schreiben darf: Bedarf nur Zahlenfelder in Metern (nicht °, %, km/h, Rampe, mehrere Werte);
 * die übrigen Zahlenfelder des Panels (Streifenbreite, Flächen (Plan), Insel, Radius, Breite der Überfahrt) sind alle in Metern */
export function inMetern(el: Element): boolean {
  if (!el.classList.contains('bedarf-zahl')) return true
  const zeile = el.closest('[id^="feld-"]')?.id ?? null
  const label = el.getAttribute('aria-label') ?? ''
  const d = FELD_DEFS.find(x => (zeile !== null && `feld-${x.pfad.replace(/\./g, '-')}` === zeile) || x.name === label || frageVon(x.pfad) === label)
  return !!d && d.art.art === 'zahl' && d.art.einheit === 'm'
}

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
