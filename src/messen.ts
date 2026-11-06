// ── Werkzeug «Messen» (27.10.2026; Kasten auf der Karte mit drei Messarten seit 06.11.2026, nach VeloroutenCheck) ──
//
// Drei Messarten (MessArt), alle in LV95 und keine davon im Fall:
// - «Ab Bordsteinkante»: ein Klick auf die Markierung; gemessen wird rechtwinklig bis zur nächsten Bordsteinkante der AV (bordkanten.ts).
// - «Ganze Fläche»: ein Klick in die Fahrbahn; gemessen wird rechtwinklig von der nächsten Kante durch den Klick bis zur gegenüberliegenden.
// - «Zwei Punkte»: zwei Klicks; jeder fängt den nächsten Stützpunkt der AV-Bodenbedeckung im Umkreis von FANG_PX Bildschirmpunkten
//   (fixpunkt.fangen), sonst die nächste Bordsteinkante im selben Radius (der zweite Punkt dann rechtwinklig zum ersten), sonst frei.
// Der Wert steht mit zwei Nachkommastellen auf der Karte und im Kasten; «übernehmen» schreibt ihn, auf 0,05 m gerundet, in das Zielfeld
// (das zuletzt angeklickte Zahlenfeld in Metern bzw. das Feld, dessen Knopf «messen» das Werkzeug gestartet hat).
// Genauigkeit: am Luftbild rund 10 cm je Bildpunkt; mit Fang so genau wie die Vermessungspunkte bzw. Kanten der AV.

import { dist, type P } from './geo'
import { fangen } from './fixpunkt'
import type { AvFlaeche } from './daten/av'
import type { FixpunktArt } from './fall'
import { FELD_DEFS } from './bedarf/felder'
import { frageVon } from './bedarf/feldhilfen'
import { FANG_M, fangeAnKante, messeAbKante, messeFlaeche, type Kante } from './bordkanten'

export type MessPunktArt = FixpunktArt | 'bordkante'
export interface MessPunkt { p: P; art: MessPunktArt }
export interface Messung { a: MessPunkt; b: MessPunkt | null }

/** Klick fangen (AV-Stützpunkt im Radius, sonst frei) */
export const messPunkt = (p: P, av: AvFlaeche[], radiusM: number): MessPunkt => { const g = fangen(p, av, radiusM); return { p: g.p, art: g.art } }

export type MessArt = 'kante' | 'flaeche' | 'hand'
export const MESSART_NAME: Record<MessArt, string> = { kante: 'Ab Bordsteinkante (AV)', flaeche: 'Ganze Fläche', hand: 'Zwei Punkte' }
export const MESSART_TEXT: Record<MessArt, string> = {
  kante: 'Weit hineinzoomen und auf die Markierung klicken, an der Stelle, bis zu der die Breite zählt. Gemessen wird rechtwinklig bis ' +
    'zur nächsten Bordsteinkante der amtlichen Vermessung (orange).',
  flaeche: 'In die Fahrbahn klicken: gemessen wird rechtwinklig von der nächsten Bordsteinkante (orange) durch den Klick bis zur ' +
    'gegenüberliegenden Kante, Bordstein bis Bordstein.',
  hand: 'Weit hineinzoomen und zwei Punkte anklicken. Nahe einem Vermessungspunkt oder einer orangen Kante rastet der Punkt dort ein, ' +
    'der zweite rechtwinklig zum ersten.',
}
/** Messergebnis: Wert und die Strecke auf der Karte */
export interface MessErgebnis { breite: number; von: P; bis: P }
/** Stand des Werkzeugs: Messart, laufende Zwei-Punkte-Messung, Ergebnis bzw. Meldung */
export interface MessStand { art: MessArt; hand: Messung | null; ergebnis: MessErgebnis | null; fehler: string | null }

/** leerer Stand (auch nach dem Wechsel der Messart: alles Gemessene fällt weg) */
export const messLeer = (art: MessArt): MessStand => ({ art, hand: null, ergebnis: null, fehler: null })

/** Klick auf der Karte je Messart: Ergebnis bzw. Meldung; «Zwei Punkte» sammelt erst den ersten Punkt (fangM: Fangradius in Metern) */
export function messStandKlick(m: MessStand, p: P, av: AvFlaeche[], kanten: Kante[], fangM: number): MessStand {
  if (m.art === 'flaeche') {
    const r = messeFlaeche(p, kanten)
    return { ...m, hand: null, ergebnis: r, fehler: r ? null : (kanten.length ? `Keine zwei Bordsteinkanten gefunden: in die Fahrbahn klicken, ` +
      `höchstens ${FANG_M} m von einer Kante, oder mit «Zwei Punkte» messen.` : 'Keine Bordsteinkanten der AV geladen: mit «Zwei Punkte» messen.') }
  }
  if (m.art === 'kante') {
    const r = messeAbKante(p, kanten)
    return { ...m, hand: null, ergebnis: r ? { breite: r.breite, von: r.fuss, bis: p } : null,
      fehler: r ? null : (kanten.length ? `Keine Bordsteinkante innert ${FANG_M} m: näher bei der Kante klicken oder mit «Zwei Punkte» messen.`
        : 'Keine Bordsteinkanten der AV geladen: mit «Zwei Punkte» messen.') }
  }
  let q = messPunkt(p, av, fangM)
  if (q.art === 'frei' && kanten.length) {
    const erster = m.hand && !m.hand.b ? m.hand.a.p : undefined
    const f = fangeAnKante(p, kanten, fangM, erster)
    if (f) q = { p: f, art: 'bordkante' }
  }
  const hand = messKlick(m.hand, q)
  return { ...m, hand, fehler: null, ergebnis: hand.b ? { breite: dist(hand.a.p, hand.b.p), von: hand.a.p, bis: hand.b.p } : null }
}

/** Statuszeile im Kasten */
export function messStandText(m: MessStand): string {
  if (m.fehler) return m.fehler
  if (m.ergebnis) return `${m.art === 'hand' ? 'Strecke' : 'Breite'}: ${messText(m.ergebnis.breite)}` +
    (m.art === 'hand' && m.hand?.b ? ` (${[m.hand.a, m.hand.b].map(q => MESSPUNKT_TEXT[q.art]).join(', ')})` : '')
  if (m.art === 'hand' && m.hand && !m.hand.b) return 'Jetzt den zweiten Punkt anklicken.'
  return 'Noch nicht gemessen.'
}
export const MESSPUNKT_TEXT: Record<MessPunktArt, string> = { gebaeudeecke: 'Gebäudeecke', av_punkt: 'AV-Punkt', bordkante: 'Bordkante', frei: 'frei' }

/** nächster Stand nach einem Klick: erster Punkt einer neuen Messung bzw. zweiter Punkt der laufenden */
export const messKlick = (m: Messung | null, q: MessPunkt): Messung => (!m || m.b ? { a: q, b: null } : { a: m.a, b: q })

/** Länge einer fertigen Messung in Metern (null: erst ein Punkt) */
export const messLaenge = (m: Messung | null): number | null => (m?.b ? dist(m.a.p, m.b.p) : null)

/** Text auf der Karte und in der Hilfe: zwei Nachkommastellen, «m» */
export const messText = (x: number): string => `${x.toFixed(2).replace('.', ',')} m`

/** Wert für ein Zahlenfeld: auf 0,05 m gerundet, mit Dezimalkomma */
export const messWert = (x: number): string => (Math.round(x / 0.05) * 0.05).toFixed(2).replace('.', ',')

/** Zahlenfeld des Panels, in das «übernehmen» schreibt (Textfeld mit Dezimaltastatur bzw. Zahlfeld) */
/** Startsignal für das Werkzeug «Messen» aus einem Meterfeld der Bedarfsmaske (06.11.2026): das Feld bekommt zuerst den Fokus (die App
 *  merkt sich das zuletzt angeklickte Zahlenfeld), dann startet die App das Werkzeug; «übernehmen» schreibt in dieses Feld */
export const MESSEN_START_EVENT = 'fgs.messen.start'
export function messenStarten(feld: HTMLInputElement | null, art: MessArt = 'hand'): void {
  feld?.focus()
  window.dispatchEvent(new CustomEvent<MessArt>(MESSEN_START_EVENT, { detail: art }))
}
/** Messart, mit der das Werkzeug aus einem Feld der Bedarfsmaske startet: Fahrbahnbreiten Bordstein bis Bordstein als «Ganze Fläche»,
 *  sonst «Zwei Punkte» */
export const messArtFuerFeld = (pfad: string): MessArt => (pfad === 'fahrbahnB' || pfad === 'restbreiteM' ? 'flaeche' : 'hand')

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
