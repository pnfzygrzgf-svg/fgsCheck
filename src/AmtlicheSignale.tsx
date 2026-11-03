import type { RegionalSnapshot } from './daten/anbieter/gemeinsam/regional'
import { signalVorschlaege, signalText, type SignalZiel, type SignalEntscheid } from './daten/anbieter/gemeinsam/regionalSignale'
export function AmtlicheSignale({ daten, ziele, wahl = [], setzen }: { daten: RegionalSnapshot | null; ziele: SignalZiel[]; wahl?: SignalEntscheid[]; setzen: (x: SignalEntscheid[]) => void }) {
  const gruppen = ziele.map(z => ({ z, xs: signalVorschlaege(daten, z), alt: wahl.filter(w => w.knoten === z.knoten && (w.art === 'lsa' || w.zufahrt === z.zufahrt)) })).filter(g => g.xs.length || g.alt.length)
  if (!gruppen.length) return null
  return <details className="abschnitt amtliche-signale"><summary>Amtliche Signale zuordnen</summary>
    <p className="klein">Treffer bis 40 m sind Vorschläge. Prüfe Knoten, Zufahrt, Fahrtrichtung und Betriebszustand vor der Übernahme. Signalstandorte allein belegen diese Zuordnung nicht. Eigene Angaben zur Regelung haben Vorrang.</p>
    {gruppen.map(({ z, xs, alt }) => <div key={`${z.knoten}:${z.zufahrt}`}><p><b>{z.name}</b></p>
      {xs.map(x => { const aktiv = alt.some(a => a.objektId === x.objektId && a.art === x.art)
        return <p className="klein" key={x.objektId}><button type="button" className="zweit quelle-chip" aria-pressed={aktiv} title={signalText(x)} onClick={() => setzen([...wahl.filter(a => !(a.knoten === z.knoten && (x.art === 'lsa' ? a.art === 'lsa' : a.zufahrt === z.zufahrt && a.art !== 'lsa'))), x])}>
          {aktiv ? '✓ ' : ''}{x.art === 'stop' ? 'Stop' : x.art === 'give_way' ? 'Kein Vortritt' : 'LSA'} · {x.name.length > 90 ? `${x.name.slice(0,87)}…` : x.name}</button><span> Datenstand {x.datenstand}</span></p>
      })}
      {alt.map(x => <p className="klein" key={x.objektId}>{signalText(x)} <button type="button" className="zweit quelle-chip" onClick={() => setzen(wahl.filter(a => a !== x))}>Zuordnung entfernen</button></p>)}
    </div>)}
  </details>
}
