// ── Reiter im Panel: Leiste «Sichtprüfung» / «Bedarf und Querungstyp», beide Reiterfelder und die Teaserzeile (22.10.2026) ──
//
// Barrierefrei nach dem Muster «Tabs» (role tablist/tab/tabpanel, aria-selected, aria-controls, Fokus nur auf dem aktiven Reiter,
// Pfeiltasten links/rechts, Pos1/Ende). Beide Reiterfelder bleiben gerendert (verborgen mit hidden): Eingaben, aufgeklappte
// Abschnitte und Feldhilfen behalten ihren Stand beim Wechsel, Sprünge finden ihr Ziel auch im verborgenen Reiter (reiter.ts).
// Ohne Bedarfsblätter (noch keine Rechnung) keine Leiste: dann steht nur der Inhalt der Sichtprüfung da, im selben Element
// (kein Neuaufbau, wenn die Rechnung eintrifft).

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { REITER, REITER_NAME, reiterFeldId, reiterKnopfId, reiterTaste, type Reiter, type ReiterZustand } from './reiter'

/** Zustand der Zulässigkeit als Symbol und Wort (Farbe nur zusätzlich) */
export function ZustandMarke({ z }: { z: ReiterZustand }) {
  return <span className={`reiter-zustand ${z.klasse}`}><span className="nur-vorlesen">, Fussgängerstreifen: </span>
    <span aria-hidden="true">{z.symbol}</span> {z.wort}</span>
}

/** Reiterleiste und beide Reiterfelder; mitReitern false: nur das Feld Sichtprüfung, ohne Leiste und ohne Rollen. kopf: über der
 * Leiste, in beiden Reitern sichtbar (Gruppe Planen, Planen.tsx) */
export function ReiterAnsicht({ mitReitern, aktiv, waehlen, zustand, sicht, bedarf, kopf }: { mitReitern: boolean; aktiv: Reiter
  waehlen: (r: Reiter) => void; zustand: ReiterZustand | null; sicht: ReactNode; bedarf: ReactNode; kopf?: ReactNode }) {
  const knoepfe = useRef<Partial<Record<Reiter, HTMLButtonElement | null>>>({})
  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    const r = reiterTaste(aktiv, e.key)
    if (!r) return
    e.preventDefault()
    waehlen(r)
    knoepfe.current[r]?.focus()
  }
  const zeige = (r: Reiter) => !mitReitern ? r === 'sicht' : aktiv === r
  const feld = (r: Reiter, inhalt: ReactNode) => <div key={r} className={`reiterfeld reiterfeld-${r}${mitReitern ? '' : ' ohne-reiter'}`}
    data-reiter={r} hidden={!zeige(r)} {...(mitReitern ? { role: 'tabpanel', id: reiterFeldId(r), 'aria-labelledby': reiterKnopfId(r) } : {})}
    {...(mitReitern && r === 'bedarf' ? { tabIndex: 0 } : {})}>
    {inhalt}</div>
  return <>
    {kopf}
    {mitReitern && <div className="reiterleiste" role="tablist" aria-label="Ansicht im Panel" onKeyDown={taste}>
      {REITER.map(r => <button key={r} type="button" role="tab" id={reiterKnopfId(r)} aria-selected={aktiv === r}
        aria-controls={reiterFeldId(r)} tabIndex={aktiv === r ? 0 : -1} className={`reiter reiter-${r}${aktiv === r ? ' gewaehlt' : ''}`}
        ref={el => { knoepfe.current[r] = el }} onClick={() => waehlen(r)}>
        <span className="reiter-name">{REITER_NAME[r]}</span>
        {r === 'bedarf' && zustand && <ZustandMarke z={zustand} />}
      </button>)}
    </div>}
    {feld('sicht', sicht)}
    {mitReitern ? feld('bedarf', bedarf) : null}
  </>
}

/** Teaserzeile oben im Reiter Sichtprüfung: Ergebnis des Bedarfs in einem Satz, Klick wechselt zum Reiter Bedarf */
export function BedarfTeaser({ text, zustand, oeffnen }: { text: string; zustand: ReiterZustand; oeffnen: () => void }) {
  return <button type="button" className={`bedarf-teaser ${zustand.klasse}`} aria-controls={reiterFeldId('bedarf')} onClick={oeffnen}
    title={`Zum Reiter «${REITER_NAME.bedarf}» wechseln`}>
    <span className="teaser-symbol" aria-hidden="true">{zustand.symbol}</span> <span>{text}</span> <span aria-hidden="true">→</span>
  </button>
}
