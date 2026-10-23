// ── Trottoirüberfahrt über die Einmündung der Zufahrt (K0; VSS 40 242 Ziffern 12.3, 14.4 und 16, Werte nach VSS 40 273) ──
//
// Band der Überfahrt auf der Zufahrtsachse: vorderer Rand = Bordkante (Fahrbahnrand der Vortrittsstrasse), hinterer Rand beidseits
// gleich weit hinter dem Fahrbahnrand (Breite), auf der Zufahrtsachse also Länge = Breite / sin α (α Einbiegewinkel). Breite
// (Korrektur nach Review 23.10.2026, Ziffer 16):
//   1. Breite von Hand (geht der AV vor);
//   2. AV-Fläche Trottoir quer über die Zufahrt (bestehende Überfahrt; gemessene Länge, Breite = Länge · sin α);
//   3. das schmalere angrenzende AV-Trottoir links bzw. rechts der Zufahrt (velo.trottoirNeben), begrenzt auf 2,00 bis 3,50 m –
//      der häufige Planungsfall: die Einmündung ist in der AV durchgehend Strasse;
//   4. Annahme TUE_BREITE_ANNAHME_M (2,00 m).
// Gehlinie für die Sicht auf das Trottoir je Seite TUE_GEHLINIE_M (0,50 m) vor dem eigenen hinteren Trottoirrand der Seite (AV-Trottoir
// der Seite, sonst Fahrbahnrand plus Breite; VSS 40 242 Ziffer 14.4). Nur Geometrie, keine Regeln der Sicht (rechnen.ts).

import type { P } from '../geo'

/** VSS 40 242 Ziffer 14.4: massgebende Geh- bzw. Fahrlinie so weit vor dem hinteren Rand des Trottoirs [m] */
export const TUE_GEHLINIE_M = 0.5
/** Breite der Überfahrt ohne AV und ohne Eingabe (Annahme; kleinste Breite nach VSS 40 242 Ziffer 16) [m] */
export const TUE_BREITE_ANNAHME_M = 2.0
/** VSS 40 242 Ziffer 16: Breite der Überfahrt aus dem angrenzenden Trottoir, begrenzt auf diesen Bereich [m] */
export const TUE_BREITE_Z16: [number, number] = [2.0, 3.5]
/** Länge auf der Zufahrtsachse: sin α höchstens bis zu diesem Winkel verkleinert (sehr schiefe Einmündung) [°] */
const MIN_WINKEL_GRAD = 20

/** eine Seite der Zufahrt: Mittellinie des Arms (vom Knoten weg), Seite der Zufahrt (+1 links von u, −1 rechts), Abstand des
 *  Fahrbahnrands von der Mittellinie, AV-Trottoir neben dem Arm (velo.trottoirNeben) */
export interface TueSeite { ml: P[]; seite: 1 | -1; rand: number; t: { abstand: number; breite: number; n: number } | null }

export interface TueBand {
  breite: number
  quelle: 'av_quer' | 'av_neben' | 'eingabe' | 'annahme'
  sHinter: number             // hinterer Rand auf der Zufahrtsachse (Bogenlänge)
  laenge: number              // sHinter − sRand
  hinten: [number, number]    // hinterer Trottoirrand je Seite: Abstand von der Mittellinie [m]
  gehlinie: [number, number]  // Gehlinie je Seite: Abstand von der Mittellinie [m]
  herkunft: [string, string]  // Herkunft des hinteren Rands je Seite (Text)
  hinweise: string[]
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')

/**
 * Band der Trottoirüberfahrt. sRand: Bordkante auf der Zufahrtsachse, seiten: links und rechts der Zufahrt (Reihenfolge wie die
 * Richtungen), quer: AV-Trottoir quer über die Zufahrt (oder null), eingabe: Breite von Hand (oder null), winkel: Einbiegewinkel α [°].
 */
export function tueBand(sRand: number, seiten: [TueSeite, TueSeite], quer: { sHinter: number; breite: number } | null,
  eingabe: number | null, winkel: number): TueBand {
  const hinweise: string[] = []
  const sinA = Math.max(Math.sin(MIN_WINKEL_GRAD * Math.PI / 180), Math.abs(Math.sin(winkel * Math.PI / 180)))
  const neben = seiten.filter(s => s.t).map(s => s.t!.breite)
  const schmal = neben.length ? Math.min(...neben) : null
  const avBreite = quer ? quer.breite * sinA : schmal
  let breite: number, quelle: TueBand['quelle']
  if (eingabe !== null) {
    breite = eingabe; quelle = 'eingabe'
    if (avBreite !== null) hinweise.push(`Breite der Trottoirüberfahrt von Hand ${f2(eingabe)} m (AV: ${f2(avBreite)} m).`)
  } else if (quer) { breite = avBreite!; quelle = 'av_quer' }
  else if (schmal !== null) {
    breite = Math.min(TUE_BREITE_Z16[1], Math.max(TUE_BREITE_Z16[0], schmal)); quelle = 'av_neben'
    if (Math.abs(breite - schmal) > 0.005) hinweise.push(`Breite der Trottoirüberfahrt ${f2(breite)} m: angrenzendes Trottoir nach AV ` +
      `${f2(schmal)} m, nach VSS 40 242 Ziffer 16 begrenzt auf ${f2(TUE_BREITE_Z16[0])} bis ${f2(TUE_BREITE_Z16[1])} m.`)
  } else { breite = TUE_BREITE_ANNAHME_M; quelle = 'annahme' }
  const laenge = quelle === 'av_quer' ? quer!.sHinter - sRand : breite / sinA
  // eigener hinterer Trottoirrand je Seite (für die Gehlinie): AV-Trottoir der Seite, sonst Fahrbahnrand plus Breite
  const hinten = seiten.map((s): [number, string] => s.t ? [s.t.abstand + s.t.breite / 2,
    `hinterer Rand der AV-Fläche Trottoir, ${s.t.n} Querschnitte, Trottoir ${f2(s.t.breite)} m`] :
    [s.rand + breite, `Fahrbahnrand plus Breite der Überfahrt ${f2(breite)} m`])
  // Gehlinie TUE_GEHLINIE_M vor dem hinteren Rand, höchstens in der Mitte des Trottoirs
  const geh = seiten.map((s, j) => hinten[j][0] - Math.min(TUE_GEHLINIE_M, Math.max(0, hinten[j][0] - s.rand) / 2))
  return { breite, quelle, sHinter: sRand + laenge, laenge, hinten: [hinten[0][0], hinten[1][0]], gehlinie: [geh[0], geh[1]],
    herkunft: [hinten[0][1], hinten[1][1]], hinweise }
}
