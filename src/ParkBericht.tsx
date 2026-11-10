import { PARK_BERICHT_ANNAHME } from './rechner/parkgeometrie'
import type { Hindernis } from './rechner/hindernisse'
import { parkEinfluesse } from './rechner/parkEinfluss'

export function ParkBerichtAnnahme() {
  return <p className="klein"><b>Parkflächen:</b> {PARK_BERICHT_ANNAHME}</p>
}

/** Einzelheiten nur zu den Ergebnisbeiträgen dieser Zufahrt/Richtung. Keine Katasterinventarliste. */
export function ParkBerichtDetails({ felder = [], ergebnis, titel }: { felder?: readonly Hindernis[]; ergebnis: unknown; titel?: string }) {
  const gruende = new Map<string, Set<string>>()
  for (const { id, grund } of parkEinfluesse(ergebnis)) {
    if (!gruende.has(id)) gruende.set(id, new Set())
    gruende.get(id)!.add(grund)
  }
  const gesehen = new Set<string>()
  const pp = felder.filter(h => (h.art === 'parkfeld' || h.art === 'laengsparkierung') && gruende.has(h.id) &&
    !gesehen.has(h.id) && !!gesehen.add(h.id))
  if (!pp.length) return null
  const f = (n: number | null) => n === null ? 'unbekannt' : `${n.toFixed(2).replace('.', ',')} m`
  const quelle = (id: string) => ({ 'norm.park.sn': 'SN 640 291a, Tab. 2', 'norm.park.zh': 'ZH 601.14.01, Kap. 4.1',
    'norm.park.be.auto': 'Bern baut C 2.10.22', 'norm.park.be.zweirad': 'Bern baut C 2.10.23' }[id] ?? id)
  return <>{titel && <p className="klein"><b>{titel}</b></p>}<ul className="klein">{pp.map(h => <li key={h.id}><b>{h.name ?? h.id}:</b> {[...gruende.get(h.id)!].join('; ')}.
    {h.art === 'parkfeld' && h.parkPruefung && <> Katasterbreite {f(h.parkPruefung.katasterBreite)}, Prüffläche {f(h.parkPruefung.pruefBreite)};
      {' '}{h.parkPruefung.status === 'ergaenzt' ? `um ${f(h.parkPruefung.ergaenzung)} zur Fahrbahn ergänzt` :
        h.parkPruefung.status === 'unklar' ? h.parkPruefung.hinweis : 'Originalumriss unverändert'}.
      {' '}Mindestmass {f(h.parkPruefung.regel.breite)} ({quelle(h.parkPruefung.regel.quellenId)}).</>}
    {h.art === 'parkfeld' && h.klasse !== 'auto' && <> Sichtwirkung nur Hinweis.</>}
  </li>)}</ul></>
}
