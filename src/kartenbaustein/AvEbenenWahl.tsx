// Amtliche Vermessung in der Ebenenliste: Hauptschalter und darunter die einzelnen Arten. Die Auswahl ist nur eine Kartenansicht.

import type { ReactNode } from 'react'
import type { LegendenEintrag } from './modell'

export function AvEbenenWahl({ quelle, link, objekte, an, setzen, arten, artSetzen, legende, zahl }: { quelle: string; link?: ReactNode; objekte: readonly { klasse: string }[]
  an: boolean; setzen: (an: boolean) => void; arten: ReadonlySet<string>; artSetzen: (art: string, an: boolean) => void; legende: readonly LegendenEintrag[]; zahl?: string }) {
  return <div className="q-av" role="group" aria-label="Amtliche Vermessung">
    <label className="q-ebene"><input type="checkbox" checked={an} onChange={e => setzen(e.target.checked)} />
      <span><b>Amtliche Vermessung</b> <small className="zahl">{zahl ?? `${objekte.length} im Ausschnitt`}</small><small>{quelle}</small>{link}</span></label>
    {an && <div className="q-av-arten">{legende.map(([art, farbe, text]) => {
      const n = objekte.filter(o => o.klasse === art).length
      return <label key={art}><input type="checkbox" checked={arten.has(art)} disabled={!n} onChange={e => artSetzen(art, e.target.checked)} />
        <i style={{ background: farbe }} /><span>{text} <small>({n})</small></span></label>
    })}</div>}
  </div>
}
