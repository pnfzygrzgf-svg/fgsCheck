// ── Reiter im Panel: «Sichtprüfung» und «Bedarf und Querungstyp» (Nutzerentscheid 22.10.2026) ──
//
// Reine Logik ohne React: Vorgabe-Reiter nach dem Fall (die Wahl gilt nur in der Sitzung, im State; ein neuer Fall beginnt mit der
// Vorgabe), Pfeiltasten der Reiterleiste, Zustand für die Reiter-Schaltfläche und die Teaserzeile im Reiter Sichtprüfung.
// Die Befunde selbst bleiben unverändert (bedarf/*): hier wird nur zusammengefasst, was das Befundblatt schon sagt.

import { istFgs, type Markierung } from './daten/osm'
import type { StreifenHerkunft } from './fall'
import type { Befund, Zulaessigkeit } from './bedarf/typen'

export type Reiter = 'sicht' | 'bedarf'
export const REITER: readonly Reiter[] = ['sicht', 'bedarf']
export const REITER_NAME: Record<Reiter, string> = { sicht: 'Sichtprüfung', bedarf: 'Bedarf und Querungstyp' }
/** Kennungen für aria-controls bzw. aria-labelledby */
export const reiterKnopfId = (r: Reiter): string => `reiter-${r}`
export const reiterFeldId = (r: Reiter): string => `reiterfeld-${r}`

/**
 * Vorgabe-Reiter: ein bestehender Übergang aus OSM mit Fussgängerstreifen (markiert, vermutlich, Lichtsignal) öffnet die
 * Sichtprüfung, auch mit Streifen von Hand, die aus OSM bzw. dem Luftbild übernommen und angepasst sind; ein Fall ohne
 * OSM-Übergang, mit nur gezeichneten Streifen von Hand (Planung) oder an einer Querung ohne Streifen (unmarkiert, ohne Angabe)
 * öffnet «Bedarf und Querungstyp»
 */
export function reiterVorgabe(x: { uebergang: number | null; streifenQuelle: 'osm' | 'hand' | 'luftbild' | null
  markierung?: Markierung | null
  /** Herkunft der Streifen von Hand (fehlt in alten Fällen) */
  herkunft?: readonly (StreifenHerkunft | undefined)[] }): Reiter {
  if (x.uebergang === null) return 'bedarf'
  if (x.streifenQuelle === 'hand' && (x.herkunft ?? []).length > 0 && x.herkunft!.every(h => h === 'gezeichnet')) return 'bedarf'
  if (x.markierung && !istFgs(x.markierung)) return 'bedarf'
  return 'sicht'
}

/** aktiver Reiter: die Wahl im Fall, sonst die Vorgabe */
export const reiterAktiv = (wahl: Reiter | null, vorgabe: Reiter): Reiter => wahl ?? vorgabe

/** Sprung zu einem Ziel (Feld der Maske, Anker): Reiter, der danach aktiv ist (der des Ziels; ohne Reiter bleibt der aktive) */
export const reiterNachSprung = (aktiv: Reiter, ziel: Reiter | null): Reiter => ziel ?? aktiv

/** Pfeiltasten in der Reiterleiste (links/rechts im Kreis, Pos1/Ende); null: keine Reitertaste */
export function reiterTaste(aktiv: Reiter, taste: string): Reiter | null {
  const i = REITER.indexOf(aktiv), n = REITER.length
  if (taste === 'ArrowRight') return REITER[(i + 1) % n]
  if (taste === 'ArrowLeft') return REITER[(i - 1 + n) % n]
  if (taste === 'Home') return REITER[0]
  if (taste === 'End') return REITER[n - 1]
  return null
}

/** Stand einer Querung für Reiter und Teaser: Zulässigkeit eines Fussgängerstreifens bzw. das Ende des Ablaufs davor */
export type ReiterStand = Zulaessigkeit | 'kein_streifen' | 'nicht_beurteilt'
/** Zustand in Wort und Symbol (die Farbe ist nur Zusatz); satz: Teaser */
export interface ReiterZustand { z: ReiterStand; wort: string; symbol: string; klasse: string; satz: string }
const ZUSTAND: Record<ReiterStand, Omit<ReiterZustand, 'z'>> = {
  zulaessig: { wort: 'zulässig', symbol: '✓', klasse: 'gruen', satz: 'Fussgängerstreifen zulässig' },
  mit_begruendung: { wort: 'mit Begründung', symbol: '!', klasse: 'gelb', satz: 'Fussgängerstreifen nur mit Begründung zulässig' },
  // Wort wie im Panel («ein Fussgängerstreifen wäre nicht zulässig»), nicht der Normbegriff «nicht angezeigt»
  nicht_angezeigt: { wort: 'nicht zulässig', symbol: '✗', klasse: 'rot', satz: 'Fussgängerstreifen nicht zulässig' },
  kein_streifen: { wort: 'kein Streifen', symbol: '✗', klasse: 'rot', satz: 'kein Fussgängerstreifen' },
  offen: { wort: 'offen', symbol: '?', klasse: 'grau', satz: 'Zulässigkeit noch offen' },
  nicht_beurteilt: { wort: 'nicht beurteilt', symbol: '–', klasse: 'grau', satz: 'nicht beurteilt (ausserorts)' },
}
/** Rangfolge bei mehreren Querungen: die strengste Aussage gilt */
const RANG: readonly ReiterStand[] = ['kein_streifen', 'nicht_angezeigt', 'mit_begruendung', 'offen', 'nicht_beurteilt', 'zulaessig']

/** Stand einer Querung aus dem Befund: Begegnungszone bzw. verteiltes Queren → kein Streifen (wie die Zusammenfassung),
 * ausserorts → nicht beurteilt, sonst die Zulässigkeit (ohne Angabe: offen) */
export function reiterStand(b: Pick<Befund, 'ende' | 'zulaessigkeit'>): ReiterStand {
  if (b.ende === 'begegnungszone' || b.ende === 'flaechig') return 'kein_streifen'
  if (b.ende === 'ausserorts') return 'nicht_beurteilt'
  return b.zulaessigkeit ?? 'offen'
}

/** Zustand für die Reiter-Schaltfläche aus den Ständen der Querungen (ohne Querung: offen) */
export function reiterZustand(st: readonly ReiterStand[]): ReiterZustand {
  const z = RANG.find(r => st.includes(r)) ?? 'offen'
  return { z, ...ZUSTAND[z] }
}

/**
 * Teaserzeile im Reiter Sichtprüfung: Stand als Satz; bei einer Querung dazu der Querungstyp aus dem Kopf des Abschnitts
 * («empfohlen: …», bei offener Zulässigkeit «falls zulässig: …», eine gewählte Anlage wie im Kopf); bei mehreren Querungen, bei
 * wie vielen der Stand gilt
 */
export function teaserText(st: readonly ReiterStand[], kopf: readonly string[]): string {
  const { z, satz } = reiterZustand(st)
  if (st.length > 1) {
    const n = st.filter(x => x === z).length
    return `${REITER_NAME.bedarf}: ${n === st.length ? (n === 2 ? 'bei beiden Querungen' : `bei allen ${n} Querungen`) : `bei ${n} von ${st.length} Querungen`}: ${satz}`
  }
  const k = kopf[0] ?? ''
  const ohneTyp = !k || z === 'kein_streifen' && !k.startsWith('Flächige') || z === 'nicht_beurteilt' || /noch offen|nicht beurteilt|\?/.test(k)
  // kein Streifen (Begegnungszone, flächig): nur die Art des Querens, ohne «empfohlen» und ohne Vorsatz «Flächige Querung:»
  const typ = ohneTyp ? '' : z === 'kein_streifen' ? k.replace(/^Flächige Querung:\s*/, '')
    : / beurteilt$/.test(k) ? k : `${z === 'offen' ? 'falls zulässig' : 'empfohlen'}: ${k}`
  return `${REITER_NAME.bedarf}: ${satz.charAt(0).toUpperCase()}${satz.slice(1)}${typ ? `; ${typ}` : ''}`
}

/**
 * Reiter des Elements: Wert von data-reiter am nächsten Reiterfeld (ohne Reiterfeld null). Für Sprünge zu Feldern und Ankern,
 * die in einem verborgenen Reiter liegen
 */
export function reiterVon(el: Element | null): Reiter | null {
  const r = el?.closest('[data-reiter]')?.getAttribute('data-reiter')
  return r === 'sicht' || r === 'bedarf' ? r : null
}
/** Ereignis an das Panel: Reiter zeigen (App hört darauf) */
export const REITER_EREIGNIS = 'fgscheck-reiter'
/** Reiter des Elements aktivieren, falls er verborgen ist; true, wenn gewechselt wird (dann erst nach dem Neuzeichnen scrollen) */
export function reiterZeigen(el: Element | null): boolean {
  const r = reiterVon(el)
  if (!r || typeof window === 'undefined' || !el?.closest('[hidden]')) return false
  window.dispatchEvent(new CustomEvent<Reiter>(REITER_EREIGNIS, { detail: r }))
  return true
}
