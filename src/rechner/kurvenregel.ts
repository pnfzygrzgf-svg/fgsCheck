// ── Rechenweg der geraden Zufahrt: Kurvenregel und V85 je Zufahrt (10.11.2026, Prüfung FGS-01) ──
//
// VSS 40 241:2019 Ziffer 14, S. 6–7. Grundregel Tab. 1 nach dem signalisierten Tempo. Kurvenregel: Für einen Fussgängerstreifen im
// Anschluss an eine Kurve der Strasse kann die Sichtweite nach dem Kurvenradius bestimmt werden (Tab. 2), wenn alle fünf Voraussetzungen
// erfüllt sind (b1 vortrittsberechtigt innerorts 50 km/h, b2 höchstens ein Fahrstreifen je Richtung, b3 unmittelbar nach dem
// Kurvenende, b4 Richtungsänderung mindestens 60°, b5 Längsgefälle höchstens 5 %). V85: mit Anzeichen bzw. Messung über dem
// signalisierten Tempo gilt V85 (Pflicht); ein tieferer V85 darf nur mit Nachweis (Messung) gelten.
// Je Zufahrt: Eingaben von Hand (fall.zufahrten) gehen vor; sonst Werte aus der Rechnung, bzw. Annahmen. Mit einer Annahme bleibt die
// Kurvenregel ein Vorschlag (Soll nach Tab. 1), bis die Voraussetzung von Hand bestätigt ist.

import type { KurveBedingung, KurveHand, V85Hand } from '../fall'
import type { Kurvenbogen } from './kurvenbogen'
import { sichtweiteTab2, TAB2_KURVE } from './tempo'

/** Kurvenende bis so weit vor dem Streifen: «unmittelbar nach dem Kurvenende»; über KURVE_WEIT_M: nein; dazwischen offen */
export const KURVE_NAH_M = 10, KURVE_WEIT_M = 30
export const KURVE_WINKEL_MIN = 60
export const KURVE_GEFAELLE_MAX = 5
/** Strecke ab dem Streifen, in der die Fahrlinie nach einer Kurve abgesucht wird [m] */
export const KURVE_SUCH_M = 60

export const KURVE_BEDINGUNG_TEXT: Record<KurveBedingung, string> = {
  b1: 'Kurve innerorts, 50 km/h, vortrittsberechtigte Strasse', b2: 'Kurve mit einem Fahrstreifen je Richtung',
  b3: 'Streifen gleich nach dem Kurvenende', b4: 'Richtungsänderung der Kurve mindestens 60°', b5: 'Längsgefälle höchstens 5 %',
}

export type KurveHerkunft = 'hand' | 'rechnung' | 'annahme'
export interface KurveWert { wert: boolean | null; herkunft: KurveHerkunft | null; text: string }
export interface KurveStrasse {
  /** Radius in Fahrstreifenmitte [m], ungerundet; null: keine (bzw. keine belastbare) Strassenkurve */
  radius: number | null
  radiusHerkunft: 'hand' | 'rechnung' | null
  /** Herkunft in Worten, z. B. «aus modellierter Fahrlinie» */
  radiusText: string
  winkel: number | null
  endeM: number | null
  b: Record<KurveBedingung, KurveWert>
  /** Kurvenregel angewendet: Soll nach Tab. 2 */
  gilt: boolean
  /** alle fünf ja, aber mindestens eine nur angenommen: Vorschlag, Soll nach Tab. 1 bis zur Bestätigung */
  vorschlag: boolean
  soll: number | null
  /** Satz zum Stand (warum nicht angewendet, bzw. was zu bestätigen ist) */
  hinweis: string
}

export interface KurveKontext {
  ausserorts: boolean
  tempo: number
  /** OSM: höchstens ein Fahrstreifen je Richtung (null: keine Angabe) und die Angabe in Worten */
  einFahrstreifen: { wert: boolean | null; text: string }
  /** Längsneigung der Fahrlinie vor dem Streifen [%] (Höhenmodell); null: noch nicht geladen bzw. nicht verfügbar */
  neigung: number | null
  /** Fahrlinie von Hand gezeichnet */
  linieVonHand: boolean
}

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',')

/** Strassenkurve einer geraden Zufahrt; null: keine Kurve (weder aus der Fahrlinie noch von Hand) */
export function kurveStrasse(bogen: Kurvenbogen | null, hand: KurveHand | null, k: KurveKontext): KurveStrasse | null {
  const handR = hand?.radius
  if (handR === undefined && (!bogen || bogen.endeM === null || (bogen.radius === null && bogen.grund === 'keine Kurve'))) return null
  const radius = handR !== undefined ? handR : bogen?.radius ?? null
  const radiusHerkunft = handR !== undefined ? (handR === null ? null : 'hand') : radius === null ? null : 'rechnung'
  const radiusText = handR !== undefined ? (handR === null ? 'von Hand: keine Strassenkurve' : 'von Hand')
    : radius !== null ? `aus ${k.linieVonHand ? 'der Fahrlinie von Hand' : 'modellierter Fahrlinie'}` : `nicht bestimmbar (${bogen?.grund ?? 'keine Fahrlinie'})`
  const w = (b: KurveBedingung, auto: KurveWert): KurveWert =>
    hand?.[b] !== undefined ? { wert: hand[b]!, herkunft: 'hand', text: 'von Hand' } : auto
  const offen: KurveWert = { wert: null, herkunft: null, text: 'offen' }
  const b: Record<KurveBedingung, KurveWert> = {
    b1: w('b1', k.ausserorts ? { wert: false, herkunft: 'rechnung', text: 'ausserorts' }
      : k.tempo !== 50 ? { wert: false, herkunft: 'rechnung', text: `Tempo ${k.tempo} km/h, nicht 50 km/h` }
      : { wert: true, herkunft: 'annahme', text: 'innerorts, 50 km/h; vortrittsberechtigt angenommen' }),
    b2: w('b2', k.einFahrstreifen.wert === null ? { wert: true, herkunft: 'annahme', text: k.einFahrstreifen.text }
      : { wert: k.einFahrstreifen.wert, herkunft: 'rechnung', text: k.einFahrstreifen.text }),
    b3: w('b3', bogen?.endeM == null ? offen : bogen.endeM <= KURVE_NAH_M
      ? { wert: true, herkunft: 'rechnung', text: `Kurvenende ${f1(bogen.endeM)} m vor dem Streifen` }
      : bogen.endeM > KURVE_WEIT_M ? { wert: false, herkunft: 'rechnung', text: `Kurvenende ${f1(bogen.endeM)} m vor dem Streifen` }
      : { wert: null, herkunft: null, text: `Kurvenende ${f1(bogen.endeM)} m vor dem Streifen: vor Ort beurteilen` }),
    b4: w('b4', !bogen || bogen.endeM === null ? offen
      : { wert: bogen.winkel >= KURVE_WINKEL_MIN, herkunft: 'rechnung', text: `Richtungsänderung rund ${Math.round(bogen.winkel)}°` }),
    b5: w('b5', k.neigung === null ? { wert: null, herkunft: null, text: 'Längsgefälle noch nicht bekannt (Höhenmodell)' }
      : { wert: Math.abs(k.neigung) <= KURVE_GEFAELLE_MAX, herkunft: 'rechnung', text: `Längsgefälle ${f1(Math.abs(k.neigung))} % (Höhenmodell)` }),
  }
  const werte = Object.values(b)
  const imBereich = radius !== null && sichtweiteTab2(radius) !== null
  const alleJa = werte.every(x => x.wert === true)
  const annahme = werte.some(x => x.herkunft === 'annahme')
  const gilt = imBereich && alleJa && !annahme, vorschlag = imBereich && alleJa && annahme
  const [rMin, rMax] = [TAB2_KURVE[0][0], TAB2_KURVE[TAB2_KURVE.length - 1][0]]
  const hinweis = radius === null ? `kein Radius: ${radiusText}; Sichtweite nach dem Tempo`
    : !imBereich ? `Radius ${f1(radius)} m ausserhalb ${rMin} bis ${rMax} m: kein Wert nach Tab. 2, Sichtweite nach dem Tempo`
    : gilt ? `Kurvenregel angewendet: Tab. 2, Radius ${f1(radius)} m`
    : vorschlag ? `Kurvenregel möglich, aber ${werte.filter(x => x.herkunft === 'annahme').length === 1 ? 'eine Voraussetzung ist' : 'Voraussetzungen sind'} nur angenommen: ` +
      'bis zur Bestätigung Sichtweite nach dem Tempo'
    : werte.some(x => x.wert === false) ? 'Kurvenregel nicht anwendbar (Voraussetzung nicht erfüllt): Sichtweite nach dem Tempo'
    : 'Kurvenregel offen (Voraussetzung noch nicht beurteilt): Sichtweite nach dem Tempo'
  return { radius, radiusHerkunft, radiusText, winkel: bogen?.endeM != null ? bogen.winkel : null, endeM: bogen?.endeM ?? null, b, gilt, vorschlag,
    soll: gilt ? sichtweiteTab2(radius!) : null, hinweis }
}

/** Quelle des Solls nach der Kurvenregel (sichtweiteQuelle) */
export const kurveQuelle = (k: KurveStrasse): string => `VSS 40 241 Tab. 2 (Kurvenregel): Radius ${f1(k.radius!)} m ${k.radiusText}`

/** Soll nach V85 einer Zufahrt; null: V85 ändert nichts. sollTab: Tab. 1 für ein Tempo */
export function v85Soll(v: V85Hand | null | undefined, tempo: number, sollTab: (t: number) => number):
  { sw: number; quelle: string } | { hinweis: string } | null {
  if (!v || v.wert === tempo) return null
  if (v.wert > tempo) return { sw: sollTab(v.wert), quelle: `Tab. 1 nach V85 ${v.wert} km/h (${v.gemessen ? 'gemessen' : 'Anzeichen'}; über dem signalisierten Tempo)` }
  if (v.gemessen) return { sw: sollTab(v.wert), quelle: `Tab. 1 nach V85 ${v.wert} km/h (gemessen, unter dem signalisierten Tempo)` }
  return { hinweis: `V85 ${v.wert} km/h ohne Messung: ein tieferer V85 senkt die Sichtweite nur mit Nachweis; Sichtweite nach dem signalisierten Tempo` }
}
