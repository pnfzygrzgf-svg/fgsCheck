// ── Fenster «Kartenebenen», gleich in allen Rechnern: verschiebbar, Lage gemerkt ──

import { useEffect, useRef, useState, type PointerEvent as ZeigerEreignis, type ReactNode } from 'react'
import type { LegendenEintrag } from './modell'
import './baustein.css'

type Lage = { x: number; y: number }
const gemerkt = (speicher: string): Lage | null => {
  try { const v = JSON.parse(localStorage.getItem(speicher) ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null }
}

/** Lage des Fensters; speicher: Schlüssel im Browser, je Rechner eigener */
export function useFensterLage(speicher: string, offen: boolean) {
  const [pos, setPos] = useState<Lage | null>(() => gemerkt(speicher))
  const ref = useRef<HTMLDivElement>(null)
  const ziehen = (e: ZeigerEreignis<HTMLDivElement>) => {
    const fenster = ref.current, rahmen = fenster?.parentElement
    if (!fenster || !rahmen || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const r = rahmen.getBoundingClientRect(), f = fenster.getBoundingClientRect(), dx = e.clientX - f.left, dy = e.clientY - f.top
    let zuletzt: Lage | null = null
    const bewegen = (ev: PointerEvent) => {
      zuletzt = { x: Math.round(Math.min(Math.max(0, ev.clientX - r.left - dx), Math.max(0, r.width - f.width))),
        y: Math.round(Math.min(Math.max(0, ev.clientY - r.top - dy), Math.max(0, r.height - 40))) }
      setPos(zuletzt)
    }
    const los = () => {
      window.removeEventListener('pointermove', bewegen); window.removeEventListener('pointerup', los); window.removeEventListener('pointercancel', los)
      if (zuletzt) try { localStorage.setItem(speicher, JSON.stringify(zuletzt)) } catch { /* nur für diese Sitzung */ }
    }
    window.addEventListener('pointermove', bewegen); window.addEventListener('pointerup', los); window.addEventListener('pointercancel', los)
  }
  const zurueck = () => { setPos(null); try { localStorage.removeItem(speicher) } catch { /* egal */ } }
  // Passt die gemerkte Lage nicht mehr in die Karte, zurück an den Ursprung
  useEffect(() => {
    const fenster = ref.current, rahmen = fenster?.parentElement
    if (offen && pos && fenster && rahmen && (pos.x + 60 > rahmen.clientWidth || pos.y + 60 > rahmen.clientHeight)) setPos(null)
  }, [offen])   // eslint-disable-line react-hooks/exhaustive-deps
  return { pos, ref, ziehen, zurueck }
}

export function EbenenFenster({ lage, schliessen, children }: { lage: ReturnType<typeof useFensterLage>; schliessen: () => void; children: ReactNode }) {
  return <div className="q-fenster" role="group" aria-label="Kartenebenen" ref={lage.ref}
    style={lage.pos ? { left: lage.pos.x, top: lage.pos.y, bottom: 'auto', maxHeight: `calc(100% - ${lage.pos.y + 10}px)` } : undefined}>
    <div className="q-kopf" onPointerDown={lage.ziehen} title="An dieser Zeile ziehen, um das Fenster zu verschieben (Doppelklick: zurück an den Ursprung)" onDoubleClick={lage.zurueck}>
      <span><span className="griff" aria-hidden="true">⠿</span> Kartenebenen</span>
      <button type="button" onClick={schliessen} aria-label="Schliessen">×</button>
    </div>
    {children}
  </div>
}

/** Zeile einer Ebene; children: Angaben unter dem Titel, Link und Legende */
export function EbenenZeile({ titel, zahl, hinweis, an, setzen, children }: { titel: string; zahl?: ReactNode; hinweis?: string; an: boolean; setzen: (an: boolean) => void; children: ReactNode }) {
  return <label className="q-ebene" title={hinweis}>
    <input type="checkbox" checked={an} onChange={e => setzen(e.target.checked)} />
    <span><b>{titel}</b>{zahl ? <> <small className="zahl">{zahl}</small></> : null}{children}</span>
  </label>
}

export function Legende({ eintraege }: { eintraege: readonly LegendenEintrag[] }) {
  return <span className="q-legende">{eintraege.map(([k, farbe, text, symbol]) => <span key={k}>
    {symbol ? <i className="sym" style={{ background: farbe }}>{symbol}</i> : <i style={{ background: farbe }} />}{text}</span>)}</span>
}
