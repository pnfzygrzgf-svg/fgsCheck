// ── Texte der Knotensicht an einer Trottoirüberfahrt (K4): Panel, Bericht, Bedarf. Nur Typen aus dem Kern (kein Rechencode im Hauptteil) ──

import type { Knotensicht, KnotensichtAntwort, KsTeil } from './knotensicht'
import type { RichtungStatus, TueBreiteQuelle } from '../knotensicht/rechner/typen'
import type { Fall } from '../fall'

/** Status eines Teils bzw. einer Phase, kurz */
export const KS_STATUS: Record<RichtungStatus, string> = { erfuellt: 'genügt', massgebend: 'genügt knapp',
  nicht_erfuellt: 'zu wenig Sicht', keine_zufahrt: 'nicht geprüft' }
/** Herkunft der Breite in Worten */
export const KS_BREITE: Record<TueBreiteQuelle, string> = { eingabe: 'von Hand', av_quer: 'Trottoir quer über die Einmündung nach AV',
  av_neben: 'angrenzendes Trottoir nach AV', annahme: 'angenommen' }
export const KS_LAGE: Record<string, string> = { links: 'von links', rechts: 'von rechts', gegenueber: 'von gegenüber' }
/** Kurzer Hinweis, wenn der Streifen keine Einmündung quert (wie die Auswahl am Streifen) */
export const KS_TITEL = 'Knotensicht der Einbiegenden'

const ganz = (x: number) => String(Math.round(x))
/** «23 m frei, nötig 15 m»; frei bis ans Ende der geprüften Strecke: «mindestens 23 m frei» */
export const teilText = (t: KsTeil): string => `${t.bisEnde ? 'mindestens ' : ''}${t.ist >= 100 ? ganz(t.ist) :
  t.ist.toFixed(1).replace('.', ',').replace(/,0$/, '')} m frei, nötig ${ganz(t.soll)} m`
export const istOk = (s: RichtungStatus): boolean | null => (s === 'erfuellt' || s === 'massgebend' ? true : s === 'nicht_erfuellt' ? false : null)

/** Satz zum Ergebnis beider Phasen (Bedarf, Bericht) */
export function phasenSatz(k: Knotensicht): string {
  return `aufs Trottoir ${KS_STATUS[k.phaseTrottoir.status]}, auf die Fahrbahn ${KS_STATUS[k.phaseFahrbahn.status]}`
}

/** Vorbelegung der Frage «Sicht beim Ausfahren genügt» aus den Knotensichten einer Querung: ja nur, wenn jede beide Phasen erfüllt;
 * nein, wenn eine eindeutig nicht genügt; sonst offen. Quelle «Rechnung», mit wesentlichen Annahmen «Annahme» */
export function knotensichtVorbelegung(alle: KnotensichtAntwort[]): { wert: boolean; quelle: 'rechnung' | 'annahme'; text: string } |
  { hinweis: string } | null {
  if (!alle.length) return null
  alle = [...new Set(alle)]   // Teilstreifen einer Querung tragen dasselbe Ergebnis
  const ks = alle.filter((k): k is Knotensicht => !('fehler' in k))
  if (ks.length < alle.length) {
    const f = alle.find((k): k is { fehler: string } => 'fehler' in k)!
    return { hinweis: `nicht gerechnet (${f.fehler}): von Hand beurteilen` }
  }
  const unsicher = ks.find(k => k.unklar.length)
  if (unsicher) return { hinweis: `Knotensicht unsicher: ${unsicher.unklar.join(' ')} Von Hand beurteilen.` }
  if (ks.some(k => k.ok === null)) return { hinweis: 'Knotensicht ohne eindeutiges Ergebnis (eine Phase nicht geprüft): von Hand beurteilen' }
  const nein = ks.find(k => k.ok === false)
  const k = nein ?? ks[0]
  const annahme = [...new Set(ks.flatMap(x => x.annahmeGrund))]
  return { wert: !nein, quelle: annahme.length ? 'annahme' : 'rechnung',
    text: `Knotensicht gerechnet: ${phasenSatz(k)}${annahme.length ? ` (${annahme.join(', ')})` : ''}` }
}

/** Breite der Trottoirüberfahrt von Hand: Eingabe im Bedarf «Breite der Trottoirüberfahrt» (jede Handeingabe mit Zahl), sonst null */
export function tueBreiteHand(fall: Pick<Fall, 'bedarf'>): number | null {
  const w = fall.bedarf?.felder['q3.breiteM']?.wert
  return typeof w === 'number' && Number.isFinite(w) ? w : null
}

/** Tempo der Hauptstrasse von Hand: Eingabe im Bedarf «Tempo der Hauptstrasse» (jede Handeingabe mit Zahl), sonst null */
export function tempoHauptHand(fall: Pick<Fall, 'bedarf'>): number | null {
  const w = fall.bedarf?.felder['q3.vSigHaupt']?.wert
  return typeof w === 'number' && Number.isFinite(w) ? w : null
}
