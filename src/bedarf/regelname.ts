// ── Bedarfsmodul: Regeln in der Oberfläche mit Kurztitel statt Nummer (Nutzerentscheid 20.10.2026) ──
//
// Grundsatz: In Panel, Feldhilfen, Befundblatt, Empfehlung, offenen Gruppen, Masse, Grundprüfung und Bericht steht nie eine
// Regelnummer allein, sondern der Kurztitel aus dem Katalog (KATALOG[id].titel) mit der Nummer als Verweis dahinter:
// «Insel bei breiter Fahrbahn (D2)». Die Befunde selbst (Texte, Details, Normhinweise) bleiben unverändert; mitTiteln ergänzt
// Nummern in solchen Texten erst bei der Anzeige. Ausnahme: «Standard E1» bzw. «Etappe E1» ist keine Regel.

import { KATALOG, REGEL_IDS } from './katalog'
import type { RegelDef } from './typen'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

/** Kurztitel einer Regel (unbekannte Nummer: unverändert) */
export const regelTitel = (id: string): string => DEF[id]?.titel ?? id
/** Titel mit Nummer als Verweis, z. B. «Insel bei breiter Fahrbahn (D2)» */
export const regelName = (id: string): string => (DEF[id] ? `${DEF[id].titel} (${id})` : id)

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
/** Regelnummern als ganze Wörter (längste zuerst, damit F2-K nicht als F2 gilt) */
export const REGEL_ID_RE = new RegExp(`(?<![\\w.-])(${[...REGEL_IDS].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\\w-])`, 'g')
/** Wörter vor einer Nummer, die keine Regel meint (Mittelinsel Standard E1, Etappen) */
const KEINE_REGEL = /(Standard|Etappe)\s$/

/** Nummer an Stelle i steht schon als «Titel (Nummer» bzw. meint keine Regel */
export function idBenannt(text: string, i: number, id: string): boolean {
  const vor = text.slice(0, i)
  return vor.endsWith(`${regelTitel(id)} (`) || KEINE_REGEL.test(vor)
}

/** Text für die Anzeige: jede allein stehende Regelnummer wird «Titel (Nummer)» */
export function mitTiteln(text: string): string
export function mitTiteln(text: string | undefined): string | undefined
export function mitTiteln(text: string | undefined): string | undefined {
  if (!text) return text
  return text.replace(REGEL_ID_RE, (id: string, _g: string, i: number) => (idBenannt(text, i, id) ? id : regelName(id)))
}

/** Allein stehende Regelnummern in einem angezeigten Text (Wächter) */
export function nummernOhneTitel(text: string): string[] {
  const aus: string[] = []
  for (const m of text.matchAll(REGEL_ID_RE)) if (!idBenannt(text, m.index!, m[1])) aus.push(`${m[1]} in «${text.slice(Math.max(0, m.index! - 50), m.index! + 10)}»`)
  return aus
}
