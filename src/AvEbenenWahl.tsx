import { AV_LEGENDE } from './daten/anbieter/gemeinsam/avKarte'
export function AvEbenenWahl({ quelle, objekte, an, setzen, arten, artSetzen }: { quelle: string; objekte: readonly { klasse: string }[]
  an: boolean; setzen: (an: boolean) => void; arten: ReadonlySet<string>; artSetzen: (art: string, an: boolean) => void }) {
  return <div className="q-av" role="group" aria-label="Amtliche Vermessung">
    <label className="q-ebene"><input type="checkbox" checked={an} onChange={e => setzen(e.target.checked)} />
      <span><b>Amtliche Vermessung</b> <small className="zahl">{objekte.length} im Ausschnitt</small><small>{quelle}</small></span></label>
    {an && <div className="q-av-arten">{AV_LEGENDE.map(([art, farbe, text]) => {
      const n=objekte.filter(o=>o.klasse===art).length
      return <label key={art}><input type="checkbox" checked={arten.has(art)} disabled={!n} onChange={e => artSetzen(art,e.target.checked)} />
        <i style={{background:farbe}} /><span>{text} <small>({n})</small></span></label>
    })}</div>}
  </div>
}
