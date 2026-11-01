// ── Bedarfsmodul Runde 4: Muss-Hinweis an offenen Feldern der Maske, «Vorschlag bestätigen» nur, wo ein Verbot daran hängt ──
//
// Je offenes Feld ein kurzer Zusatz (nur Text, klein, grau, mit Symbol): «fehlt für 2 Muss-Prüfungen», «fehlt für 1 Muss- und
// 2 Soll-Prüfungen», «fehlt nur für 1 Hinweis»; Felder, an denen die Zulässigkeit hängt: «entscheidet über die Zulässigkeit».
// Grundlage sind die offenen Einträge des Befunds (befund.alle, wie Befundblatt und Prüfübersicht) und die offenen Teilregeln der
// Grundprüfung, je Regel mit ihrer Stärke; gezählt wird jede Regel einmal, über alle Querungen des Falls, und nur, wo sie nach der
// Geltung (feldhilfen.GELTUNG) greifen kann. Weichen des Ablaufs (A1, B3 …) zählen wie in der Prüfübersicht nicht als Prüfung.
// Zulässigkeit: Ortslage offen (Ende «offen») bzw. Zulässigkeit offen; dann die fehlenden bzw. zu bestätigenden Felder von A1, A2,
// C1 und C2 (entscheid.ts: zul offen genau bei offener A2, C1 oder C2).
// Keine Änderung an Befund oder Sortierung; die Maske zeigt nur den Text.

import { KATALOG, type RegelId } from './katalog'
import type { BefundBlatt } from './befundblatt'
import type { RegelDef, Staerke } from './typen'
import { feldZiel, gilt, type SichtKontext } from './feldhilfen'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

export interface FeldBedarf {
  /** Regeln mit Muss (hart, hart mit Bericht), Soll (weich) bzw. Hinweis, für die das Feld fehlt */
  muss: string[]
  soll: string[]
  hinweis: string[]
  /** an diesem Feld hängt die Zulässigkeit (bzw. die Ortslage) */
  zulaessigkeit: boolean
}

/** Regeln, deren offene Felder über die Zulässigkeit entscheiden (Ortslage A1, Begegnungszone A2, Tempo C1, Tempo-30-Zone C2) */
export const ZUL_REGELN: readonly string[] = ['A1', 'A2', 'C1', 'C2']

/** Felder, deren Annahme ein hartes Verbot tragen kann (Katalog: nurMitBestaetigung); «Vorschlag bestätigen» nur hier möglich */
export const BESTAETIGUNG_MOEGLICH: readonly string[] = [...new Set(Object.values(DEF).filter(d => d.nurMitBestaetigung)
  .flatMap(d => (d.nurMitBestaetigung === true ? d.eingaben : d.nurMitBestaetigung!)))]

/** Felder, deren vorgeschlagene Annahme im Fall ein Verbot offen hält (Einträge mit bestaetigen): dort steht «Vorschlag bestätigen» */
export function bestaetigungsFelder(blaetter: readonly BefundBlatt[]): Set<string> {
  return new Set(blaetter.flatMap(b => b.befund.alle.filter(x => x.bestaetigen).flatMap(x => x.fehlend ?? [])))
}

const wort = (s: Staerke): 'muss' | 'soll' | 'hinweis' => (s === 'hart' || s === 'hart_bericht' ? 'muss' : s === 'weich' ? 'soll' : 'hinweis')

/** Bedarf je Feld der Maske (Pfad) über alle Querungen */
export function feldBedarf(blaetter: readonly BefundBlatt[]): Map<string, FeldBedarf> {
  const m = new Map<string, { muss: Set<string>; soll: Set<string>; hinweis: Set<string>; zulaessigkeit: boolean }>()
  const eintrag = (feld: string) => {
    const ziel = feldZiel(feld)
    if (!ziel) return null
    if (!m.has(ziel)) m.set(ziel, { muss: new Set(), soll: new Set(), hinweis: new Set(), zulaessigkeit: false })
    return m.get(ziel)!
  }
  for (const b of blaetter) {
    const k: SichtKontext = { e: b.gebildet.eingaben, ebenen: b.ebenen, alternative: b.alternative }
    const offen: { id: string; staerke: Staerke; felder: readonly string[] }[] = []
    for (const x of b.befund.alle) if (x.zustand === 'offen' && x.fehlend?.length) offen.push({ id: x.id, staerke: x.staerke, felder: x.fehlend })
    if (b.grund.gilt) for (const t of [...b.grund.punkte.flatMap(p => p.teile), ...b.grund.weitere]) {
      const st = t.staerke ?? DEF[t.id]?.staerke
      if (t.zustand === 'offen' && t.fehlend?.length && st) offen.push({ id: t.id, staerke: st, felder: t.fehlend })
    }
    for (const o of offen) {
      const d = DEF[o.id]
      if (!d || d.art !== 'befund' || !gilt(o.id as RegelId, k)) continue
      for (const f of o.felder) eintrag(f)?.[wort(o.staerke)].add(o.id)
    }
    // Zulässigkeit: Ortslage offen bzw. Zulässigkeit offen
    if (b.befund.ende === 'offen' || b.befund.zulaessigkeit === 'offen') {
      for (const id of ZUL_REGELN) {
        const felder = [...b.befund.alle.filter(x => x.id === id && x.zustand === 'offen').flatMap(x => x.fehlend ?? []),
          ...(b.befund.offenFelder[id] ?? [])]
        for (const f of felder) { const e = eintrag(f); if (e) e.zulaessigkeit = true }
      }
    }
  }
  return new Map([...m].map(([p, x]) => [p, { muss: [...x.muss], soll: [...x.soll], hinweis: [...x.hinweis], zulaessigkeit: x.zulaessigkeit }]))
}

const n = (k: number, ein: string, mehr: string) => `${k} ${k === 1 ? ein : mehr}`

/** Zusatz am Feld: «entscheidet über die Zulässigkeit», «fehlt für 2 Muss-Prüfungen», «fehlt für 1 Muss- und 1 Soll-Prüfung»,
 * «fehlt nur für 1 Hinweis»; nichts, wenn das Feld für keine Prüfung fehlt */
export function feldBedarfText(x: FeldBedarf | undefined): string | null {
  if (!x) return null
  if (x.zulaessigkeit) return 'entscheidet über die Zulässigkeit'
  const mu = x.muss.length, so = x.soll.length, hi = x.hinweis.length
  if (mu && so) return `fehlt für ${mu} Muss- und ${n(so, 'Soll-Prüfung', 'Soll-Prüfungen')}`
  if (mu) return `fehlt für ${n(mu, 'Muss-Prüfung', 'Muss-Prüfungen')}`
  if (so) return `fehlt für ${n(so, 'Soll-Prüfung', 'Soll-Prüfungen')}`
  if (hi) return `fehlt nur für ${n(hi, 'Hinweis', 'Hinweise')}`
  return null
}
