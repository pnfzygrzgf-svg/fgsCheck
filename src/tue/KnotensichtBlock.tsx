// ── Block «Knotensicht» an einer Trottoirüberfahrt (K4): Reiter Sichtprüfung und Bericht ──
//
// Ersetzt den bisherigen Verweis auf den SichtweitenCheck: je Richtung die beiden Phasen (Trottoir ab dem hinteren Rand, Fahrbahn ab dem
// vorderen Rand) mit nötiger und freier Sicht, die Breite der Überfahrt mit Herkunft. Hinweise nur, wenn sie zutreffen.

import type { ReactNode } from 'react'
import type { KnotensichtAntwort, KsTeil, Knotensicht } from './knotensicht'
import { KS_BREITE, KS_LAGE, KS_STATUS, KS_TITEL, istOk, phasenSatz, teilText } from './texte'
import { TUE_NUR_EINMUENDUNG } from '../texte'
import { FELD_DEF, wertText } from '../bedarf/felder'

const FARBE = (ok: boolean | null) => (ok === true ? '#10b981' : ok === false ? '#dc2626' : '#64748b')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')

function Teil({ name, t }: { name?: string; t: KsTeil }) {
  const ok = istOk(t.status)
  return <div title={`${KS_STATUS[t.status]}${t.verdecker ? `; verdeckt durch ${t.verdecker}` : ''}`}>
    <span className="farbe" style={{ background: FARBE(ok) }} />{name ? `${name}: ` : ''}{teilText(t)}</div>
}

/** Tabelle je Richtung (Panel und Bericht) */
export function KnotensichtTabelle({ k, klasse }: { k: Knotensicht; klasse: string }) {
  return <table className={klasse}>
    <thead><tr><th /><th title="ab dem hinteren Rand der Überfahrt">aufs Trottoir</th><th title="ab dem vorderen Rand der Überfahrt">auf die Fahrbahn</th></tr></thead>
    <tbody>{k.richtungen.map(r => <tr key={r.richtung}>
      <td title={r.tempoQuelle}>{KS_LAGE[r.lage] ?? r.lage}<div className="klein">{r.strasse}{r.auto || r.velo ? `, ${r.tempo} km/h` : ''}</div></td>
      <td>{r.trottoir ? <Teil t={r.trottoir} /> : '–'}</td>
      <td>{r.auto && <Teil name="Auto" t={r.auto} />}{r.velo && <Teil name="Velo" t={r.velo} />}
        {!r.auto && !r.velo && (r.keinGrund ?? 'kein Verkehr von dieser Seite')}</td>
    </tr>)}</tbody>
  </table>
}

/** Breite der Überfahrt mit Herkunft in Worten */
export const breiteSatz = (k: Knotensicht): string => `Breite ${f2(k.breite)} m (${KS_BREITE[k.breiteQuelle]})`

/** Block im Reiter Sichtprüfung. ks: Ergebnis (fehlt: Rechnung läuft); lage: Lage laut Bedarf, wenn keine Einmündung; breite: Eingabe
 * von Hand (Bedarf) mit Setzer (null = wieder automatisch) */
export function KnotensichtBlock({ ks, lage, breiteHand, setzeBreite }: { ks: KnotensichtAntwort | undefined; lage: string | null
  breiteHand: number | null; setzeBreite: (m: number | null) => void }) {
  const d = FELD_DEF.get('lage')
  const lageHinweis = lage && <p className="warnung">Lage laut Bedarf: {d ? wertText(d, lage) : lage} – Trottoirüberfahrten gibt es {TUE_NUR_EINMUENDUNG}.</p>
  let inhalt: ReactNode
  if (!ks) inhalt = <p>wird gerechnet …</p>
  else if ('fehler' in ks) inhalt = ks.ohneZufahrt
    ? <p className="warnung">Der Streifen quert keine Einmündung: Trottoirüberfahrten gibt es {TUE_NUR_EINMUENDUNG}.</p>
    : <p className="warnung">Nicht gerechnet: {ks.fehler}</p>
  else inhalt = <>
    <p>Ausfahrt aus {ks.zufahrtName}</p>
    <KnotensichtTabelle k={ks} klasse="zufahrten" />
    <p>{breiteSatz(ks)} ·{' '}
      <label>Wie breit ist die Überfahrt? <input type="number" step="0.1" min="1" max="8" style={{ width: '4.5em' }}
        value={breiteHand ?? ''} placeholder={f2(ks.breite)} aria-label="Breite der Überfahrt von Hand in Metern"
        onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); setzeBreite(v !== null && Number.isFinite(v) && v > 0 ? v : null) }} /> m</label></p>
    {!ks.neigungGemessen && <p className="pruefen">Längsneigung 0 % angenommen (Höhenmodell noch nicht geladen bzw. nicht verfügbar).</p>}
    {ks.hinweise.length > 0 && <ul className="annahmen">{ks.hinweise.map(h => <li key={h}>{h}</li>)}</ul>}
    <details><summary>Annahmen ({ks.annahmen.length})</summary><ul className="annahmen">{ks.annahmen.map(a => <li key={a}>{a}</li>)}</ul>
      <p>Rechnung nach {ks.quelle}.</p></details>
  </>
  return <div className="tue klein"><b>{KS_TITEL}</b>{lageHinweis}{inhalt}</div>
}

/** Abschnitt im Bericht (am Streifen mit Trottoirüberfahrt) */
export function KnotensichtBericht({ ks }: { ks: KnotensichtAntwort | undefined }) {
  if (!ks || 'fehler' in ks) return <p className="klein"><b>{KS_TITEL}:</b> nicht gerechnet{ks ? ` – ${'ohneZufahrt' in ks && ks.ohneZufahrt
    ? `der Streifen quert keine Einmündung (Trottoirüberfahrten gibt es ${TUE_NUR_EINMUENDUNG})` : ks.fehler}` : ''}. Die Sicht auf die
    Wartefläche gilt hier nicht.</p>
  return <>
    <p className="klein"><b>{KS_TITEL}</b> (Ausfahrt aus {ks.zufahrtName}): {phasenSatz(ks)}. {breiteSatz(ks)}, Längsneigung{' '}
      {ks.neigungGemessen ? 'aus dem Höhenmodell' : '0 % angenommen'}. Die Sicht auf die Wartefläche gilt hier nicht.</p>
    <KnotensichtTabelle k={ks} klasse="bericht-tabelle" />
    {ks.hinweise.length > 0 && <ul className="klein">{ks.hinweise.map(h => <li key={h}>{h}</li>)}</ul>}
    <p className="klein">Rechnung nach {ks.quelle}: VSS 40 273 Tab. 1 bis 3, Phasen nach VSS 40 242 Ziffer 14.4.</p>
  </>
}
