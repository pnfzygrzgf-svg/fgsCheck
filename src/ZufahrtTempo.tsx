import { zufahrtSchluessel, type Fall } from './fall'
import type { ZufahrtErgebnis } from './rechner/typen'
import { tempoHerkunft } from './texte'

/** Dieselbe zufahrtsbezogene Korrektur in Sichttabelle und Detailansicht. */
export function ZufahrtTempo({ z, name, fall, aendern }: {
  z: ZufahrtErgebnis; name: string; fall: Fall; aendern: (f: (x: Fall) => Fall) => void
}) {
  const key = zufahrtSchluessel(z.fgsId, z.kennung)
  const hand = fall.zufahrten[key]?.tempo
  const ausFeld = typeof fall.bedarf?.felder.vSig?.wert === 'number'
  const werte = [...new Set([10, 20, 30, 40, 50, 60, 80, 100, 120, ...(hand == null ? [] : [hand])])].sort((a, b) => a - b)
  const herkunft = hand != null ? 'von Hand · diese Zufahrt'
    : `${tempoHerkunft(z.tempoQuelle)}${ausFeld ? ' · Signalisiertes Tempo' : ''}`
  return <div className="zufahrt-tempo" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <select aria-label={`Tempo für ${name}`} value={hand ?? ''}
      title="Tempo nur für diese Zufahrt ändern. Zurücksetzen entfernt diese Korrektur: dann gilt der eigene Eintrag unter «Signalisiertes Tempo», sofern vorhanden, sonst der Wert aus den Quelldaten dieser Zufahrt."
      onChange={e => {
        const v = e.target.value === '' ? undefined : Number(e.target.value)
        aendern(f => {
          const neu = { ...f.zufahrten[key] }
          if (v === undefined) delete neu.tempo; else neu.tempo = v
          if (Object.keys(neu).length) f.zufahrten[key] = neu; else delete f.zufahrten[key]
          return f
        })
      }}>
      <option value="">{hand == null ? `${z.tempo} km/h` : ausFeld ? 'Wie «Signalisiertes Tempo»' : 'Wieder aus Daten übernehmen'}</option>
      {werte.map(t => <option key={t} value={t}>{t} km/h</option>)}
    </select>
    <div className={z.tempoQuelle === 'Ersatz' ? 'klein warnung' : 'klein'}>({herkunft})</div>
  </div>
}
