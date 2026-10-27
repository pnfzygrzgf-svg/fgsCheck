// ── Zeile des Streifens an einer Trottoirüberfahrt: Lichtsignal an der Einmündung (27.10.2026) ──
import type { Fall } from '../fall'
import type { BefundBlatt } from '../bedarf/befundblatt'
import { handSetzen } from '../bedarf/fallBedarf'

/**
 * Trottoirüberfahrt (27.10.2026): «Lichtsignal an der Einmündung» in der Zeile des Streifens = Bedarf «Einmündung mit Lichtsignal»
 * (q3.lsaKnoten, dieselbe Angabe wie die Frage im Thema); das Lichtsignal der Querung selbst gibt es an einer Überfahrt nicht
 */
export function LsaEinmuendung({ fall, blatt, aendern }: { fall: Fall; blatt: BefundBlatt | null; aendern: (f: (x: Fall) => Fall) => void }) {
  const hand = fall.bedarf?.felder['q3.lsaKnoten']
  const wert = hand && typeof hand.wert === 'boolean' ? (hand.wert ? 'ja' : 'nein') : ''
  const vor = blatt?.gebildet.herkunft.get('q3.lsaKnoten')?.vorbelegt ?? null
  const auto = vor ? `${vor.wert === true ? 'ja' : 'nein'}, ${vor.quelle === 'vorschlag' || vor.quelle === 'osm' ? 'aus OSM' : 'angenommen'}` : 'offen'
  return <>Lichtsignal an der Einmündung: <select value={wert} aria-label="Lichtsignal an der Einmündung"
    title="dieselbe Angabe wie «Hat die Einmündung mit der Überfahrt noch ein Lichtsignal?» im Bedarf" onChange={e => aendern(f => {
      const v = e.target.value
      const b = handSetzen(f.bedarf, 'q3.lsaKnoten', v === '' ? null : v === 'ja', 'hand')
      if (b) f.bedarf = b; else delete f.bedarf
      return f
    })}>
    <option value="">automatisch ({auto})</option><option value="ja">ja</option><option value="nein">nein</option>
  </select></>
}

