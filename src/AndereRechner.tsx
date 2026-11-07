// ── Kachel «In anderen Rechnern prüfen» (Verknüpfung): öffnet den Ort in einem anderen Rechner in einem neuen Tab ──
//
// Die Logos zeigen, dass es um ein anderes Thema in einem anderen Rechner geht. Ein geöffneter Rechner ist noch keine Prüfung: Es
// gehen nur Lage und öffentliche OSM-Id mit, nichts kommt zurück.

import type { ReactNode } from 'react'
import { RECHNER_NAME, zielAdresse, type Ort, type Rechner } from './verknuepfung'

const BILD: Record<Rechner, string> = { fgs: 'fgscheck.svg', swc: 'sichtweitencheck.svg', vrc: 'veloroutencheck.svg', knc: 'knotencheck.png' }
export const RechnerLogo = ({ r, px = 20 }: { r: Rechner; px?: number }) =>
  <img className="rechner-logo" src={import.meta.env.BASE_URL + BILD[r]} alt="" width={px} height={px} />

export interface Ziel { text: string; rechner: Rechner; ort?: Ort; uebergang?: number; knoten?: number; zusatz?: string }

export function AndereRechner({ von, logos, ziele, titelZusatz, children }: { von: Rechner; logos: Rechner[]; ziele: Ziel[]; titelZusatz?: string; children?: ReactNode }) {
  if (!ziele.length && !children) return null
  return (
    <details className="abschnitt">
      <summary><h2>In anderen Rechnern prüfen {logos.map(r => <RechnerLogo key={r} r={r} />)}{titelZusatz && <span className="klein"> · {titelZusatz}</span>}</h2></summary>
      {children}
      <ul className="ziele">{ziele.map(z => <li key={z.text}>
        <RechnerLogo r={z.rechner} px={28} />
        <span><a href={zielAdresse(z.rechner, von, z)} target="_blank" rel="noopener noreferrer"><b>{RECHNER_NAME[z.rechner]}</b>&nbsp;↗</a><br />
          {z.text}{z.zusatz && <span className="klein"> · {z.zusatz}</span>}</span>
      </li>)}</ul>
      <p className="klein">Öffnet den Ort im anderen Rechner. Das Ergebnis eines Rechners ersetzt das des anderen nicht.</p>
    </details>
  )
}
