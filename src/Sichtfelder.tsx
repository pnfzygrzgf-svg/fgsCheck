export { fgsSichtId, richtungSichtId, tueSichtId, kreiselSichtId } from './SichtKennung'
import type { SichtMass } from './sichtMasse'
import type { P } from './geo'
import { useEffect, useState, type ReactNode } from 'react'

export const SICHT_ARTEN = ['auto', 'velo', 'trottoir', 'ueberholen'] as const
export type SichtArt = typeof SICHT_ARTEN[number]
export type SichtWahl = Record<SichtArt | 'an' | 'masse', boolean> & { einzeln?: Record<string, boolean> }
export const SICHT_ALLE: SichtWahl = { an: true, masse: false, auto: true, velo: true, trottoir: true, ueberholen: true }
export const SICHT_TEXT: Record<SichtArt, string> = {
  auto: 'Auto / Motorfahrzeuge', velo: 'Velo', trottoir: 'Trottoir / Fussverkehr', ueberholen: 'Überholsicht',
}
const KEY = 'fgs.sichtfelder'
const EVENT = KEY + '.aenderung'
// Masse beginnen bei jedem Öffnen ausgeblendet; die laufende Sitzung teilt die Wahl mit dem Bericht.
let masseSitzung = false
export function sichtLesen(): SichtWahl {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const einzeln = v && typeof v === 'object' ? Object.fromEntries(Object.entries((v as SichtWahl).einzeln ?? {}).filter(([, b]) => typeof b === 'boolean')) : {}
    if (v && typeof v === 'object') return { ...(Object.keys(einzeln).length ? { einzeln } : {}),
      ...Object.fromEntries(Object.entries(SICHT_ALLE)
      .map(([k, d]) => [k, k === 'masse' ? masseSitzung : typeof (v as Record<string, unknown>)[k] === 'boolean' ? (v as Record<string, unknown>)[k] : d])) } as SichtWahl
  } catch { /* privater Browser oder kein Speicher */ }
  return { ...SICHT_ALLE, masse: masseSitzung }
}
export const sichtZeigen = (w: SichtWahl, art: SichtArt, id?: string): boolean => w.an && (id ? w.einzeln?.[`${art}:${id}`] ?? w[art] : w[art])
export function sichtAendern(w: SichtWahl, art: SichtArt | 'an' | 'masse', an: boolean, id?: string): SichtWahl {
  if (id && art !== 'an' && art !== 'masse') {
    const basis = !w.an && an ? { ...w, auto: false, velo: false, trottoir: false, ueberholen: false, einzeln: {} } : w
    return { ...basis, an: w.an || an, einzeln: { ...basis.einzeln, [`${art}:${id}`]: an } }
  }
  return { ...w, [art]: an, ...(art !== 'an' && art !== 'masse' ? { an: w.an || an,
    einzeln: Object.fromEntries(Object.entries(w.einzeln ?? {}).filter(([k]) => !k.startsWith(art + ':'))) } : {}) }
}
export function sichtMassZeigen(w: SichtWahl, m: SichtMass): boolean {
  return m.objekte?.length ? m.objekte.some(id => sichtZeigen(w, m.art, id)) : sichtZeigen(w, m.art, m.objekt)
}
export function sichtBildText(w: SichtWahl, arten: readonly SichtArt[]): string {
  const a = arten.filter(x => sichtZeigen(w, x)).map(x => SICHT_TEXT[x])
  return 'Dargestellte Sichtfelder: ' + (Object.keys(w.einzeln ?? {}).length ? (w.an ? 'individuelle Fahrzeugauswahl' : 'keine') : a.length ? a.join(', ') : 'keine') + (w.masse && a.length ? '; mit Vermassung' : '; ohne Vermassung') +
    (Object.keys(w.einzeln ?? {}).length ? '; einzelne Fahrzeuge separat geschaltet' : '') + '. Die Ergebnisse enthalten alle berechneten Sichtarten.'
}
/** Ansichtspräferenz, bewusst ausserhalb von Fall und Recheneingaben. Bericht und Karte folgen derselben Wahl. */
export function useSichtWahl(): [SichtWahl, (art: SichtArt | 'an' | 'masse', an: boolean, id?: string) => void] {
  const [wahl, setzen] = useState(sichtLesen)
  useEffect(() => {
    const aenderung = (ev: Event) => setzen((ev as CustomEvent<SichtWahl>).detail)
    const gespeichert = (ev: StorageEvent) => { if (ev.key === KEY || ev.key === null) setzen(sichtLesen()) }
    window.addEventListener(EVENT, aenderung); window.addEventListener('storage', gespeichert)
    return () => { window.removeEventListener(EVENT, aenderung); window.removeEventListener('storage', gespeichert) }
  }, [])
  return [wahl, (art, an, id) => {
    // Event hält auch ohne localStorage (z. B. privater Modus) die geöffneten Ansichten zusammen.
    const neu = sichtAendern(wahl, art, an, id)
    if (art === 'masse') masseSitzung = an
    try { localStorage.setItem(KEY, JSON.stringify({ ...neu, masse: false })) } catch { /* nur Sitzung */ }
    setzen(neu); window.dispatchEvent(new CustomEvent(EVENT, { detail: neu }))
  }]
}
export function SichtTaste({ art, id, children, className = '', style }: { art: SichtArt; id?: string; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  const [wahl, setzen] = useSichtWahl()
  const an = sichtZeigen(wahl, art, id)
  return <button type="button" className={'sicht-taste ' + className + (an ? '' : ' ausgeblendet')} style={style} aria-pressed={an}
    title={`${SICHT_TEXT[art]}: ${id ? 'dieses Sichtfeld' : 'Sichtfelder dieser Art'} auf der Karte ${an ? 'ausblenden' : 'einblenden'}`}
    onClick={e => { e.stopPropagation(); setzen(art, !an, id) }}>
    {children ?? SICHT_TEXT[art]}<span className="sicht-zeichen" aria-hidden="true"> {an ? '◉' : '○'}</span>
  </button>
}
export function MassWahl() {
  const [wahl, setzen] = useSichtWahl()
  return <button type="button" className="sicht-taste" aria-pressed={wahl.masse} title="Masslinien und Beschriftungen der sichtbaren Sichtfelder ein-/ausblenden"
    onClick={e => { e.stopPropagation(); setzen('masse', !wahl.masse) }}>Masse {wahl.masse ? 'ausblenden' : 'einblenden'}</button>
}
export function SichtGesamtTaste() {
  const [wahl, setzen] = useSichtWahl()
  return <button type="button" className="zweit klein" onClick={() => setzen('an', !wahl.an)}>{wahl.an ? 'Alle Sichtfelder ausblenden' : 'Auswahl einblenden'}</button>
}
export function SichtfelderWahl({ arten }: { arten: readonly SichtArt[] }) {
  if (!arten.length) return null
  return <div className="sicht-befund" role="group" aria-label="Sichtfelder auf der Karte">
    <span className="klein">Alle Sichtfelder einer Art: </span>{arten.map(a => <SichtTaste key={a} art={a} />)}<MassWahl />
    <SichtGesamtTaste />
  </div>
}

/** Die Bemassung teilt ihre Geometrie mit der interaktiven Karte und wird nie aus Bildschirmpixeln neu gerechnet. */
export function MassBild({ masse, wahl, xy, skala = 1 }: { masse: SichtMass[]; wahl: SichtWahl; xy: (p: P) => string; skala?: number }) {
  if (!wahl.masse) return null
  const da = new Set<string>()
  return <g data-sicht-vermassung="true">{masse.filter(m => {
    if (!sichtMassZeigen(wahl, m)) return false
    const key = JSON.stringify([m.text, m.p, m.linien]); if (da.has(key)) return false; da.add(key); return true
  }).map((m, i) => { const [x, y] = xy(m.p).split(',').map(Number)
    return <g key={i}>
      {m.linien.map((l, j) => <polyline key={j} points={l.map(xy).join(' ')} fill="none" stroke="#111827" strokeWidth={1.3 * skala} />)}
      <text x={x} y={y - 5 * skala} textAnchor="middle" fontSize={14 * skala} fontWeight={600} fill="#111827" stroke="white" strokeWidth={5 * skala} paintOrder="stroke">{m.text}</text>
    </g>
  })}</g>
}
