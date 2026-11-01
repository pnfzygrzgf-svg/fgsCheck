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
  if (unsicher) return { hinweis: `Knotensicht ohne eindeutiges Ergebnis: ${unsicher.unklar.join(' ')} Von Hand beurteilen.` }
  if (ks.some(k => k.ok === null)) return { hinweis: 'Knotensicht ohne eindeutiges Ergebnis (eine Phase nicht geprüft): von Hand beurteilen' }
  const nein = ks.find(k => k.ok === false)
  const k = nein ?? ks[0]
  const annahme = [...new Set(ks.flatMap(x => x.annahmeGrund))]
  return { wert: !nein, quelle: annahme.length ? 'annahme' : 'rechnung',
    text: `Knotensicht gerechnet: ${phasenSatz(k)}${annahme.length ? ` (${annahme.join(', ')})` : ''}` }
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')
/** gültige Knotensicht einer Querung (gerechnet, nicht auf der durchgehenden Strasse); Teilstreifen tragen dasselbe Ergebnis */
export const knotensichtGueltig = (alle: readonly KnotensichtAntwort[]): Knotensicht | null =>
  alle.find((k): k is Knotensicht => !('fehler' in k) && !k.durchgehend) ?? null

/** Winkel der Einmündung aus der Knotensicht (27.10.2026): Quelle «Rechnung» */
export const winkelVorbelegung = (k: Knotensicht): { wert: number; text: string } => {
  const w = Math.round(k.einbiegewinkel)
  return { wert: w, text: `Winkel der Seitenstrasse zur Hauptstrasse aus dem OSM-Netz an der Einmündung, ${w}°` }
}

/** Breite der Trottoirüberfahrt aus der Knotensicht (27.10.2026): Breite des Bands; null bei einer Eingabe von Hand (die geht vor) */
export function breiteVorbelegung(k: Knotensicht): { wert: number; quelle: 'rechnung' | 'annahme'; text: string } | null {
  const b = Math.round(k.breite * 100) / 100
  switch (k.breiteQuelle) {
    case 'eingabe': return null
    case 'annahme': return { wert: b, quelle: 'annahme', text: `Annahme ${f2(b)} m (die AV zeigt an der Einmündung kein Trottoir)` }
    case 'av_quer': return { wert: b, quelle: 'rechnung', text: `AV-Fläche Trottoir quer über die Einmündung, ${f2(b)} m` }
    case 'av_neben': {
      // AV-Breiten der angrenzenden Trottoirs aus dem Satz des Kerns («(AV links 2,40 m, rechts 3,10 m; …»)
      const av = /\(AV ([^;)]*)/.exec(k.breiteText ?? '')?.[1] ?? ''
      const ws = [...av.matchAll(/(\d+,\d+) m/g)].map(m => Number(m[1].replace(',', '.')))
      const roh = ws.length ? Math.min(...ws) : null
      return { wert: b, quelle: 'rechnung', text: `${ws.length > 1 ? 'schmaleres ' : ''}angrenzendes Trottoir${roh !== null ? ` ${f2(roh)} m` : ''}, ` +
        'nach VSS 40 242 Z. 16 auf 2,00–3,50 m begrenzt' }
    }
  }
}

/** Länge des überfahrbaren Rands als Vorschlag (27.10.2026): Fahrbahnöffnung an der Bordkante der Hauptstrasse (AV mit Flächen (Plan),
 * vorbelegung.fahrbahnOeffnung) */
export const ueberfahrbarVorbelegung = (laengeM: number): { wert: number; text: string } => {
  const l = Math.round(laengeM * 10) / 10
  return { wert: l, text: `Fahrbahnöffnung an der Bordkante der Hauptstrasse: ${l.toFixed(1).replace('.', ',')} m (AV mit Flächen (Plan))` }
}
/** keine Fahrbahn an der Bordkante: Länge offen */
export const UEBERFAHRBAR_OHNE = 'an der Bordkante der Hauptstrasse keine Fahrbahn gefunden (AV mit Flächen (Plan)): Länge von Hand angeben'

/** Zeitlückenmodell für die Wartezeit beim Ausfahren (27.10.2026): Spitzenstunde 10 % des DTV (beide Richtungen), Grenzzeitlücke tc,
 * Folgezeitlücke tf */
export const WARTE_SPITZE = 0.1, WARTE_TC_S = 6, WARTE_TF_S = 3
/** mittlere Wartezeit beim Ausfahren aus dem DTV der Hauptstrasse [s]: Kapazität C = q·e^(−q·tc) / (1 − e^(−q·tf)) (q in Fz/s),
 * Wartezeit rund 1/C; ohne Verkehr die Folgezeitlücke */
export function wartezeitSchaetzen(dtv: number): number {
  const q = (WARTE_SPITZE * dtv) / 3600
  if (!(q > 0)) return WARTE_TF_S
  const c = (q * Math.exp(-q * WARTE_TC_S)) / (1 - Math.exp(-q * WARTE_TF_S))
  return 1 / c
}

/** Breite der Trottoirüberfahrt von Hand: Eingabe im Bedarf «Breite der Trottoirüberfahrt» (jede Handeingabe mit Zahl), sonst null */
export function tueBreiteHand(fall: Pick<Fall, 'bedarf'>): number | null {
  return tueBreiteHandWert(fall)?.wert ?? null
}

/** Handeingabe im Bedarf als Eingabe der Knotensicht: Wert und ob sie nur angenommen bzw. geschätzt ist (Quelle «Annahme», «Schätzung»;
 * dann zählt sie als Annahme, kein harter Befund ohne Bestätigung). Nur Zahlen; null ohne Eingabe */
export interface HandWert { wert: number; annahme: boolean }
const handWert = (fall: Pick<Fall, 'bedarf'>, pfad: string): HandWert | null => {
  const h = fall.bedarf?.felder[pfad]
  // Quelle «Rechnung» (27.10.2026): Wert aus der Knotensicht selbst, keine Eingabe für sie (sonst rechnete sie im Kreis)
  return h && h.quelle !== 'rechnung' && typeof h.wert === 'number' && Number.isFinite(h.wert) ? { wert: h.wert, annahme: h.quelle === 'annahme' || h.quelle === 'schaetzung' } : null
}
/** Tempo der Hauptstrasse von Hand: Bedarf «Tempo auf der Hauptstrasse» (signalisiert); Quelle von Hand bzw. bestätigt = Tatsache,
 * Annahme bzw. Schätzung = Annahme */
export const tempoHauptHand = (fall: Pick<Fall, 'bedarf'>): HandWert | null => handWert(fall, 'q3.vSigHaupt')
/** Breite der Trottoirüberfahrt von Hand mit Quelle (wie tempoHauptHand) */
export const tueBreiteHandWert = (fall: Pick<Fall, 'bedarf'>): HandWert | null => handWert(fall, 'q3.breiteM')
