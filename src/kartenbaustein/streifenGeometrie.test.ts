// Streifengeometrie (gemeinsamer Baustein seit 13.11.2026 abends): Enden des Fussgängerstreifens aus Knoten, Weg und AV-Fahrbahn
import { describe, expect, it } from 'vitest'
import { RAND_ZUSCHLAG, streifenEnden, type P } from './streifenGeometrie'
import { type AvFlaecheLv, bordmodell, schnittBord } from './bordmodell'

const E0 = 2600000, N0 = 1200000
const pt = (e: number, n: number): P => [E0 + e, N0 + n]
const rechteck = (e0: number, e1: number, n0: number, n1: number): P[] => [pt(e0, n0), pt(e1, n0), pt(e1, n1), pt(e0, n1)]
const c = pt(0, 0), ost: P = [1, 0]
// Ergebnis relativ zum Knoten, auf 1 cm gerundet
const rel = (p: P) => [Math.round((p[0] - E0) * 100) / 100, Math.round((p[1] - N0) * 100) / 100]
const laenge = (a: P, b: P) => Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100) / 100

describe('streifenEnden', () => {
  it('gerade Strasse N ±4: Achse senkrecht zum Weg, Enden ±3,7 (0,30 m vor der Bordkante)', () => {
    const r = streifenEnden(c, ost, [[rechteck(-50, 50, -4, 4)]], [], null)!
    expect(r.achseText).toBe('senkrecht')
    expect(rel(r.p0)).toEqual([0, -3.7])
    expect(rel(r.p1)).toEqual([0, 3.7])
    expect(laenge(r.p0, r.p1)).toBe(8 - 2 * RAND_ZUSCHLAG)
    expect(r.teile.length).toBe(1)
    expect(r.geklemmt || r.geschaetzt).toBe(false)
  })
  it('Trottoirnase als Loch (Ring 2, N 1…4) kürzt den Streifen auf −3,7 … 0,7', () => {
    const r = streifenEnden(c, ost, [[rechteck(-50, 50, -4, 4), rechteck(-2, 2, 1, 4)]], [], null)!
    expect(rel(r.p0)).toEqual([0, -3.7])
    expect(rel(r.p1)).toEqual([0, 0.7])
  })
  it('Fussweg bis 45° schräg ist die Achse, steiler bleibt die Senkrechte', () => {
    const fb = [[rechteck(-50, 50, -4, 4)]]
    const r = streifenEnden(c, ost, fb, [], [pt(-3, -6), pt(3, 6)])!   // 26,6° von der Senkrechten
    expect(r.achseText).toBe('fussweg')
    expect(laenge(r.p0, r.p1)).toBeCloseTo(8 / Math.cos(Math.atan(0.5)) - 0.6, 2)
    const s = streifenEnden(c, ost, fb, [], [pt(-6, -3), pt(6, 3)])!   // 63,4°
    expect(s.achseText).toBe('senkrecht')
    expect(laenge(s.p0, s.p1)).toBe(7.4)
  })
  it('breite Fahrbahn (N ±15) mit Fussweg N −3…3: Enden aus dem Fussweg ± 0,30 m (geklemmt)', () => {
    const r = streifenEnden(c, ost, [[rechteck(-50, 50, -15, 15)]], [], [pt(0, -3), pt(0, 3)])!
    expect(r.geklemmt).toBe(true)
    expect(rel(r.p0)).toEqual([0, -3])
    expect(rel(r.p1)).toEqual([0, 3])
  })
  it('sehr breite Fahrbahn ohne Fussweg: Länge aus der OSM-Breite (7 m ± 1 m) geschätzt', () => {
    const r = streifenEnden(c, ost, [[rechteck(-50, 50, -20, 20)]], [], null)!
    expect(r.geschaetzt).toBe(true)
    expect(rel(r.p0)).toEqual([0, -4.2])
    expect(rel(r.p1)).toEqual([0, 4.2])
    const e = streifenEnden(c, ost, [[rechteck(-50, 50, -20, 20)]], [], null, { einbahn: true })!
    expect(laenge(e.p0, e.p1)).toBe(5.5 - 0.6)
  })
  it('Verkehrsinsel N −1…1 teilt in zwei Teilstreifen; ohne Insel bleibt nur der Teil am Knoten', () => {
    const fb = [[rechteck(-50, 50, -8, -1)], [rechteck(-50, 50, 1, 8)]]
    const r = streifenEnden(c, ost, fb, [[rechteck(-3, 3, -1, 1)]], null)!
    expect(r.teile.map(([a, b]) => [rel(a), rel(b)])).toEqual([[[0, -7.7], [0, -1.3]], [[0, 1.3], [0, 7.7]]])
    expect(rel(r.p0)).toEqual([0, -7.7])
    const s = streifenEnden(c, ost, fb, [], null)!
    expect(s.teile.length).toBe(1)
    // Insel von Hand schneidet die Fahrbahn wie eine AV-Insel
    const h = streifenEnden(c, ost, [[rechteck(-50, 50, -8, 8)]], [], null, { inselnHand: [rechteck(-3, 3, -1, 1)] })!
    expect(h.teile.length).toBe(2)
    expect(h.abschnitte.map(x => [x.inselVor, x.inselNach])).toEqual([[null, 0], [0, null]])
  })
  it('keine Fahrbahn auf der Achse: null; Knoten neben der Fahrbahn: Meldung', () => {
    expect(streifenEnden(c, ost, [[rechteck(-50, 50, 40, 50)]], [], null)).toBeNull()
    const r = streifenEnden(c, ost, [[rechteck(-50, 50, 5, 12)]], [], null)!
    expect(r.meldungen).toEqual(['Übergangsknoten 5.0 m neben der AV-Fahrbahn'])
  })
})

// Bord aus dem Bordmodell (Plan AV-Geometrie A6, 13.11.2026 spät): Enden am Schnitt der Achse mit dem gemessenen Rand (kurze Lücken
// «Rand unbekannt» gerade überbrückt), Richtung wie ohne Bord
describe('streifenEnden mit Bord aus dem Bordmodell', () => {
  const fl = (art: string, ...ringe: P[][]): AvFlaecheLv => ({ art, ringe })
  /** Linien beider Seiten für Streifenenden (gemessener Rand, kurze Lücken überbrückt), Achse E −50…150 */
  const bordVon = (flaechen: AvFlaecheLv[]) => {
    const m = bordmodell({ flaechen, achse: [pt(-40, 0), pt(140, 0)] })
    return [...schnittBord(m, 'links', 'rand').teile, ...schnittBord(m, 'rechts', 'rand').teile]
  }
  const strassen = (fs: AvFlaecheLv[]) => fs.filter(f => f.art === 'Strasse_Weg').map(f => f.ringe)
  const inseln = (fs: AvFlaecheLv[]) => fs.filter(f => f.art === 'Verkehrsinsel').map(f => f.ringe)

  it('Laubeggstrasse-Fall: Fussweg in der Fläche Strasse_Weg an beiden Enden, Insel in der Mitte → zwei Teile 3,7 + 3,7 m statt 7,8 + 5,3 m', () => {
    // Fahrbahn N −5,3…5,3, Insel N −1…1 bei E 47…53 (Loch und Verkehrsinsel), Fusswege E 48,5…51,5 nach Norden bis N 9,4 und nach
    // Süden bis N −6,9 (Teil der Fläche Strasse_Weg), Trottoir und Garten daneben; Knoten auf der Insel
    const insel = rechteck(47, 53, -1, 1)
    const flaechen = [
      fl('Strasse_Weg', [pt(-50, -5.3), pt(48.5, -5.3), pt(48.5, -6.9), pt(51.5, -6.9), pt(51.5, -5.3), pt(150, -5.3), pt(150, 5.3), pt(51.5, 5.3),
        pt(51.5, 9.4), pt(48.5, 9.4), pt(48.5, 5.3), pt(-50, 5.3)], insel.slice().reverse()),
      fl('Verkehrsinsel', insel),
      fl('Trottoir', rechteck(-50, 48.5, 5.3, 8.3)), fl('Trottoir', rechteck(51.5, 150, 5.3, 8.3)), fl('Gartenanlage', rechteck(-50, 150, 9.4, 20)),
      fl('Gartenanlage', rechteck(-50, 48.5, 8.3, 9.4)), fl('Gartenanlage', rechteck(51.5, 150, 8.3, 9.4)),
      fl('Trottoir', rechteck(-50, 48.5, -8.3, -5.3)), fl('Trottoir', rechteck(51.5, 150, -8.3, -5.3)), fl('Trottoir', rechteck(48.5, 51.5, -8.3, -6.9)),
    ]
    const k = pt(50, 0)
    const ohne = streifenEnden(k, ost, strassen(flaechen), inseln(flaechen), null)!
    expect(ohne.teile.map(([a, b]) => laenge(a, b))).toEqual([5.3, 7.8])           // bis 13.11.2026: Fusswege verlängern beide Teile
    const r = streifenEnden(k, ost, strassen(flaechen), inseln(flaechen), null, { bord: bordVon(flaechen) })!
    expect(r.teile.map(([a, b]) => laenge(a, b))).toEqual([3.7, 3.7])
    expect(r.teile.map(([a, b]) => [rel(a), rel(b)])).toEqual([[[50, -5], [50, -1.3]], [[50, 1.3], [50, 5]]])
    expect([r.bordA, r.bordB, r.geklemmt, r.geschaetzt]).toEqual([true, true, false, false])
  })

  it('schräg erfasster Streifen (Querungsweg 20° von der Senkrechten) bleibt schräg, Enden 0,30 m vor dem Bord N ±4; der Fussweg in der Fläche Strasse_Weg verlängert ihn nicht', () => {
    // Fussweg (Fläche Strasse_Weg) nach Norden bei E −0,5…3,5 bis N 8: dort führt die schräge Achse hinein
    const flaechen = [
      fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(3.5, 4), pt(3.5, 8), pt(-0.5, 8), pt(-0.5, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, -0.5, 4, 7)), fl('Trottoir', rechteck(3.5, 150, 4, 7)), fl('Trottoir', rechteck(-50, 150, -7, -4)),
      fl('Gartenanlage', rechteck(-0.5, 3.5, 8, 12)), fl('Gartenanlage', rechteck(-50, -0.5, 7, 12)), fl('Gartenanlage', rechteck(3.5, 150, 7, 12)),
    ]
    const w = 20 * Math.PI / 180, weg = [pt(-10 * Math.sin(w), -10 * Math.cos(w)), pt(10 * Math.sin(w), 10 * Math.cos(w))]
    const ohne = streifenEnden(c, ost, strassen(flaechen), [], weg)!
    expect(rel(ohne.p1)[1]).toBeCloseTo(8 - RAND_ZUSCHLAG * Math.cos(w), 2)      // bis 13.11.2026: bis ans Ende des Fusswegs
    const r = streifenEnden(c, ost, strassen(flaechen), [], weg, { bord: bordVon(flaechen) })!
    expect(r.achseText).toBe('fussweg')
    expect(Math.atan2(r.achse[0], r.achse[1]) * 180 / Math.PI).toBeCloseTo(20, 6)
    expect(laenge(r.p0, r.p1)).toBeCloseTo(8 / Math.cos(w) - 2 * RAND_ZUSCHLAG, 2)
    // Bordpunkte (Enden um RAND_ZUSCHLAG entlang der Achse verlängert) genau auf N ±4
    expect(rel([r.p0[0] - r.achse[0] * RAND_ZUSCHLAG, r.p0[1] - r.achse[1] * RAND_ZUSCHLAG])[1]).toBeCloseTo(-4, 6)
    expect(rel([r.p1[0] + r.achse[0] * RAND_ZUSCHLAG, r.p1[1] + r.achse[1] * RAND_ZUSCHLAG])[1]).toBeCloseTo(4, 6)
    expect([r.bordA, r.bordB]).toEqual([true, true])
  })

  it('Rand unbekannt auf einer Seite (offene Kante): dort wie bisher, Seite mit Bord am Bord; ohne Bord in der AV wie bisher', () => {
    // breite Fläche N −4…20 (Platz, nach Norden offen), Bord nur im Süden: die Schätzung aus der OSM-Breite gilt nur im Norden
    const flaechen = [fl('Strasse_Weg', rechteck(-50, 150, -4, 20)), fl('Trottoir', rechteck(-50, 150, -7, -4))]
    const r = streifenEnden(c, ost, strassen(flaechen), [], null, { bord: bordVon(flaechen) })!
    expect([r.bordA, r.bordB, r.geschaetzt]).toEqual([true, false, true])
    expect(rel(r.p0)).toEqual([0, -3.7])
    expect(rel(r.p1)).toEqual([0, 3.5 + 1 - RAND_ZUSCHLAG])
    const o = streifenEnden(c, ost, [[rechteck(-50, 150, -4, 4)]], [], null, { bord: [] })!
    expect([o.bordA, o.bordB, laenge(o.p0, o.p1)]).toEqual([false, false, 7.4])
  })
})
