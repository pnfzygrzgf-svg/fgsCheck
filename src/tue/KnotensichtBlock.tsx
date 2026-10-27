// ── Block «Knotensicht» an einer Trottoirüberfahrt (K4): Reiter Sichtprüfung und Bericht ──
//
// Ersetzt den bisherigen Verweis auf den SichtweitenCheck: je Richtung die beiden Phasen (vom hinteren Rand aufs Trottoir, vom vorderen
// Rand zur Fahrbahn) mit nötiger und freier Sicht, die Breite der Überfahrt mit Herkunft. Hinweise nur, wenn sie zutreffen (kurze Texte,
// kurztexte.ts); Annahmen eingeklappt.

import type { ReactNode } from 'react'
import type { KnotensichtAntwort, KsTeil, Knotensicht } from './knotensicht'
import { KS_BREITE, KS_LAGE, KS_STATUS, KS_TITEL, istOk, phasenSatz, teilText } from './texte'
import { TUE_NUR_EINMUENDUNG } from '../texte'
import { FELD_DEF, wertText } from '../bedarf/felder'
import { TUE_BREITE_MAX, TUE_BREITE_MIN } from '../knotensicht/rechner/typen'
import type { KsPhase } from './karte'

const FARBE = (ok: boolean | null) => (ok === true ? '#10b981' : ok === false ? '#dc2626' : '#64748b')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')

function Teil({ name, t }: { name?: string; t: KsTeil }) {
  const ok = istOk(t.status)
  return <div title={`${KS_STATUS[t.status]}${t.verdecker ? `; verdeckt durch ${t.verdecker}` : ''}`}>
    <span className="farbe" style={{ background: FARBE(ok) }} />{name ? `${name}: ` : ''}{teilText(t)}</div>
}

const HERKUNFT: Record<string, string> = { hand: 'von Hand', geoportal: 'Geoportal', osm: 'OSM', annahme: 'angenommen' }

/** Tabelle je Richtung (Panel und Bericht) */
export function KnotensichtTabelle({ k, klasse }: { k: Knotensicht; klasse: string }) {
  return <table className={klasse}>
    <thead><tr><th /><th title="vom hinteren Rand der Überfahrt aus">aufs Trottoir</th><th title="vom vorderen Rand der Überfahrt aus">auf die Fahrbahn</th></tr></thead>
    <tbody>{k.richtungen.map(r => <tr key={r.richtung}>
      <td title={r.tempoQuelle}>{KS_LAGE[r.lage] ?? r.lage}<div className="klein">{r.strasse}{r.auto || r.velo ? `, ${r.tempo} km/h ${HERKUNFT[r.tempoHerkunft]}` : ''}</div></td>
      <td>{r.trottoir ? <Teil t={r.trottoir} /> : '–'}</td>
      <td>{r.auto && <Teil name="Auto" t={r.auto} />}{r.velo && <Teil name="Velo" t={r.velo} />}
        {!r.auto && !r.velo && 'kein Verkehr von dieser Seite'}</td>
    </tr>)}</tbody>
  </table>
}

/** Breite der Überfahrt mit Herkunft in Worten */
export const breiteSatz = (k: Knotensicht): string => `Breite ${f2(k.breite)} m, ${KS_BREITE[k.breiteQuelle]}`

/** alle kurzen Hinweise: zur ganzen Knotensicht, dann je Richtung und Phase */
export const alleHinweise = (k: Knotensicht): string[] => [...k.hinweise, ...k.richtungen.flatMap(r => [
  ...r.hinweise.trottoir.map(h => `${KS_LAGE[r.lage] ?? r.lage}, Trottoir: ${h}`),
  ...r.hinweise.fahrbahn.map(h => `${KS_LAGE[r.lage] ?? r.lage}, Fahrbahn: ${h}`)])]

/** Breite von Hand ausserhalb des Bereichs, den die Rechnung nimmt */
export const breiteUngueltig = (b: number | null): boolean => b !== null && (b < TUE_BREITE_MIN || b > TUE_BREITE_MAX)

/** Block im Reiter Sichtprüfung. ks: Ergebnis (fehlt: Rechnung läuft); fgsId: dieser Streifen, titel: Name eines Streifens (Querung mit
 * Teilstreifen: gerechnet einmal, an einem Teil); lage: Lage laut Bedarf, wenn keine Einmündung; breite: Eingabe von Hand (Bedarf) mit
 * Setzer (null = wieder automatisch) */
export function KnotensichtBlock({ ks, fgsId, titel, lage, breiteHand, setzeBreite, augeVonHand = null, augeZuruecksetzen, tempoHand = null,
  setzeTempo, phase = 'beide', setzePhase }: { ks: KnotensichtAntwort | undefined; fgsId: string
  titel: (id: string) => string; lage: string | null; breiteHand: number | null; setzeBreite: (m: number | null) => void
  /** Auge von Hand (27.10.2026): welche Phasen, Zurücksetzen */
  augeVonHand?: ('fahrbahn' | 'trottoir')[] | null; augeZuruecksetzen?: () => void
  /** Planung: Tempo der Hauptstrasse von Hand (Bedarf «Tempo auf der Hauptstrasse»), null = aus den Daten */
  tempoHand?: number | null; setzeTempo?: (v: number | null) => void
  /** gezeigte Phase auf der Karte (Sitzung; wie ein Klick auf ein wartendes Fahrzeug) */
  phase?: KsPhase; setzePhase?: (p: KsPhase) => void }) {
  const d = FELD_DEF.get('lage')
  let inhalt: ReactNode
  const ohneZufahrt = !!ks && 'fehler' in ks && !!ks.ohneZufahrt
  if (!ks) inhalt = <p>wird gerechnet …</p>
  else if ('fehler' in ks && ks.ueberHauptstrasse) inhalt = <p className="warnung">{ks.fehler}</p>
  else if ('fehler' in ks) inhalt = ks.ohneZufahrt
    ? <p className="warnung">Der Streifen quert keine Einmündung: Trottoirüberfahrten gibt es {TUE_NUR_EINMUENDUNG}.</p>
    : <p className="warnung">Nicht gerechnet: {ks.fehler}</p>
  else if (ks.streifenId && ks.streifenId !== fgsId) inhalt = <p>Gerechnet für die ganze Querung, siehe {titel(ks.streifenId)}.</p>
  else {
    const hw = alleHinweise(ks)
    inhalt = <>
      <p>Ausfahrt aus {ks.zufahrtName}</p>
      <KnotensichtTabelle k={ks} klasse="zufahrten" />
      <p>{breiteSatz(ks)} ·{' '}
        <label>Wie breit ist die Überfahrt? <input type="number" step="0.1" min={TUE_BREITE_MIN} max={TUE_BREITE_MAX} style={{ width: '4.5em' }}
          value={breiteHand ?? ''} placeholder={f2(ks.breite)} aria-label="Breite der Überfahrt von Hand in Metern"
          onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); setzeBreite(v !== null && Number.isFinite(v) && v > 0 ? v : null) }} /> m</label></p>
      {setzePhase && <p role="group" aria-label="Sicht zeigen">Sicht zeigen:{' '}
        {(['beide', 'fahrbahn', 'trottoir'] as const).map(p => <button key={p} type="button" aria-pressed={phase === p}
          className={phase === p ? 'aktiv klein' : 'zweit klein'} onClick={() => setzePhase(p)}>{PHASE_WORT[p]}</button>)}</p>}
      {setzeTempo && <TempoWahl ks={ks} tempoHand={tempoHand} setzeTempo={setzeTempo} />}
      {augeVonHand && augeVonHand.length > 0 && <p><span className="quelle-chip hand">Auge von Hand</span>{' '}
        {augeVonHand.map(p => (p === 'fahrbahn' ? 'Sicht auf die Fahrbahn' : 'Sicht aufs Trottoir')).join(', ')}{' '}
        {augeZuruecksetzen && <button type="button" className="zweit klein" onClick={augeZuruecksetzen}
          title="Auge der Ausfahrenden wieder wie gerechnet">Standort zurücksetzen</button>}</p>}
      {breiteUngueltig(breiteHand) && <p className="warnung">Breite von Hand {f2(breiteHand!)} m nicht verwendet: zulässig sind {f2(TUE_BREITE_MIN)} bis {f2(TUE_BREITE_MAX)} m.</p>}
      {!ks.neigungGemessen && <p className="pruefen">Längsneigung 0 % angenommen: Höhenmodell noch nicht geladen bzw. nicht verfügbar.</p>}
      {hw.length > 0 && <ul className="annahmen">{hw.map(h => <li key={h}>{h}</li>)}</ul>}
      <details><summary>Annahmen ({ks.annahmen.length})</summary><ul className="annahmen">{ks.annahmen.map(a => <li key={a}>{a}</li>)}</ul>
        <p>Rechnung nach {ks.quelle}.</p></details>
    </>
  }
  // Lage laut Bedarf keine Einmündung: nur, wenn nicht schon «quert keine Einmündung» dasteht
  const lageHinweis = lage && !ohneZufahrt && <p className="warnung">Lage laut Bedarf: {d ? wertText(d, lage) : lage} – Trottoirüberfahrten gibt es {TUE_NUR_EINMUENDUNG}.</p>
  return <div className="tue klein"><b>{KS_TITEL}</b>{lageHinweis}{inhalt}</div>
}

const PHASE_WORT: Record<KsPhase, string> = { beide: 'beide', fahrbahn: 'Fahrbahn', trottoir: 'Trottoir' }
/** Tempi zur Wahl für die Planung (km/h) */
export const TEMPI_PLANUNG = [20, 30, 40, 50, 60, 80]
/** Planung: Tempo der Hauptstrasse (27.10.2026): aktueller Wert mit Herkunft und Auswahl; schreibt «Tempo auf der Hauptstrasse» im Bedarf */
function TempoWahl({ ks, tempoHand, setzeTempo }: { ks: Knotensicht; tempoHand: number | null; setzeTempo: (v: number | null) => void }) {
  const r = ks.richtungen.find(x => x.auto || x.velo)
  const jetzt = r ? `${r.tempo} km/h (${HERKUNFT[r.tempoHerkunft]})` : 'ohne Verkehr'
  return <p><label>Planung: Tempo der Hauptstrasse{' '}
    <select value={tempoHand ?? ''} aria-label="Planung: Tempo der Hauptstrasse"
      onChange={e => setzeTempo(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">aus den Daten</option>
      {[...new Set([...TEMPI_PLANUNG, ...(tempoHand !== null ? [tempoHand] : [])])].sort((a, b) => a - b)
        .map(v => <option key={v} value={v}>{v} km/h</option>)}
    </select></label> · jetzt {jetzt}</p>
}

/** Abschnitt im Bericht (am Streifen mit Trottoirüberfahrt) */
export function KnotensichtBericht({ ks, fgsId, titel }: { ks: KnotensichtAntwort | undefined; fgsId: string; titel: (id: string) => string }) {
  if (!ks || 'fehler' in ks) return <p className="klein"><b>{KS_TITEL}:</b> nicht gerechnet{ks ? ` – ${'ohneZufahrt' in ks && ks.ohneZufahrt
    ? `der Streifen quert keine Einmündung; Trottoirüberfahrten gibt es ${TUE_NUR_EINMUENDUNG}` : ks.fehler}` : ''}. Die Sicht auf die
    Wartefläche gilt hier nicht.</p>
  if (ks.streifenId && ks.streifenId !== fgsId) return <p className="klein"><b>{KS_TITEL}:</b> gerechnet für die ganze Querung, siehe
    {' '}{titel(ks.streifenId)}.</p>
  const hw = alleHinweise(ks)
  return <>
    <p className="klein"><b>{KS_TITEL}</b>, Ausfahrt aus {ks.zufahrtName}: {phasenSatz(ks)}. {breiteSatz(ks)}; Längsneigung{' '}
      {ks.neigungGemessen ? 'aus dem Höhenmodell' : '0 % angenommen'}. Die Sicht auf die Wartefläche gilt hier nicht.</p>
    <KnotensichtTabelle k={ks} klasse="bericht-tabelle" />
    {hw.length > 0 && <ul className="klein">{hw.map(h => <li key={h}>{h}</li>)}</ul>}
    <p className="klein">Rechnung nach {ks.quelle}: Werte nach VSS 40 273 Tab. 1, Tab. 2 und Tab. 3, Phasen nach VSS 40 242 Ziffer 14.4.</p>
  </>
}
