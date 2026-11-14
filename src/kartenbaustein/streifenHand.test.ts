// Streifen von Hand (gemeinsamer Baustein seit 14.11.2026, Plan AV-Geometrie A5): Prüfung, Teilen und Verbinden, Fangen am Bord,
// Anwenden auf die gerechnete Streifengeometrie. Koordinaten in LV95 relativ zu E 2 600 000 / N 1 200 000.
import { describe, expect, it } from 'vitest'
import { LAGE_VON_HAND, STREIFEN_BREITE_STANDARD_M, bordFangLinien, breiteVon, endeAmBordFangen, streifenFangLinien, streifenHandKernGueltig,
  streifenMitHand, streifenVonHandFehler, teilTeilen, teileVerbinden, teileVon, type P } from './streifenHand'
import { RAND_ZUSCHLAG, streifenEnden } from './streifenGeometrie'
import { type AvFlaecheLv, bordBereich, bordStuecke, bordmodell } from './bordmodell'

const E0 = 2600000, N0 = 1200000
const pt = (e: number, n: number): P => [E0 + e, N0 + n]
const rel = (p: P) => [Math.round((p[0] - E0) * 100) / 100, Math.round((p[1] - N0) * 100) / 100]
const rechteck = (e0: number, e1: number, n0: number, n1: number): P[] => [pt(e0, n0), pt(e1, n0), pt(e1, n1), pt(e0, n1)]
const fl = (art: string, ...ringe: P[][]): AvFlaecheLv => ({ art, ringe })
const laenge = (a: P, b: P) => Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100) / 100

describe('Prüfung (fgsCheck fallLesen, VeloroutenCheck fallDatei)', () => {
  it('Kern: zwei Punkte und Breite 0,5 bis 15 m', () => {
    expect(streifenHandKernGueltig({ p0: pt(0, 0), p1: pt(0, 8), breite: 4 })).toBe(true)
    expect(streifenHandKernGueltig({ p0: pt(0, 0), p1: pt(0, 8), breite: 0.4 })).toBe(false)
    expect(streifenHandKernGueltig({ p0: pt(0, 0), p1: pt(0, 8), breite: 15.1 })).toBe(false)
    expect(streifenHandKernGueltig({ p0: [1, Number.NaN], p1: pt(0, 8), breite: 4 })).toBe(false)
  })
  it('Streifen von Hand: bekannte Felder, 1 bis 4 Teile mit gültigen Enden, Breite optional', () => {
    const gut = { id: '275422258', teile: [{ p0: pt(0, -5), p1: pt(0, -1.3) }, { p0: pt(0, 1.3), p1: pt(0, 5) }] }
    expect(streifenVonHandFehler(gut)).toBeNull()
    expect(streifenVonHandFehler({ ...gut, breite: 3 })).toBeNull()
    expect(streifenVonHandFehler({ ...gut, breite: 30 })).toMatch(/Breite/)
    expect(streifenVonHandFehler({ ...gut, farbe: 'rot' })).toMatch(/Feldern/)
    expect(streifenVonHandFehler({ ...gut, id: '' })).toMatch(/Kennung/)
    expect(streifenVonHandFehler({ ...gut, teile: [] })).toMatch(/Teilstreifen/)
    expect(streifenVonHandFehler({ ...gut, teile: [{ p0: pt(0, 0), p1: pt(0, 0.1) }] })).toMatch(/kürzer/)
    expect(streifenVonHandFehler({ ...gut, teile: [{ p0: pt(0, 0) }] })).toMatch(/Enden/)
    expect(breiteVon(gut)).toBe(STREIFEN_BREITE_STANDARD_M)
    expect(breiteVon({ ...gut, breite: 3 })).toBe(3)
  })
})

describe('Teilen und Verbinden', () => {
  it('10 m mit Lücke 2 m → 4 + 4 m; zu kurz → null; Verbinden vom ersten Anfang zum letzten Ende', () => {
    const t = teilTeilen({ p0: pt(0, -5), p1: pt(0, 5) })!
    expect(t.map(x => [rel(x.p0), rel(x.p1)])).toEqual([[[0, -5], [0, -1]], [[0, 1], [0, 5]]])
    expect(teilTeilen({ p0: pt(0, 0), p1: pt(0, 5) })).toBeNull()
    expect(rel(teileVerbinden(t)!.p1)).toEqual([0, 5])
    expect(teileVerbinden([])).toBeNull()
  })
})

describe('Fangen am Bord', () => {
  // Fahrbahn N −4…4 mit Trottoirs, dazu eine zweite Strassenfläche E 20…40 (Stossstelle bei E 20: kein Bord)
  const flaechen = [fl('Strasse_Weg', rechteck(-20, 20, -4, 4)), fl('Strasse_Weg', rechteck(20, 40, -4, 4)),
    fl('Trottoir', rechteck(-20, 40, 4, 7)), fl('Trottoir', rechteck(-20, 40, -7, -4))]
  const linien = bordFangLinien(bordStuecke(flaechen, bordBereich([pt(-20, 0), pt(40, 0)])))
  it('nur Bordstücke mit Bord dahinter (die Stossstelle der beiden Strassenflächen fängt nicht)', () => {
    expect(linien.length).toBeGreaterThan(0)
    expect(linien.every(l => l.every(p => Math.abs(Math.abs(p[1] - N0) - 4) < 1e-9 || Math.abs(p[0] - E0 - 40) < 1e-9 || Math.abs(p[0] - E0 + 20) < 1e-9))).toBe(true)
    expect(linien.some(l => l.every(p => Math.abs(p[0] - E0 - 20) < 1e-9))).toBe(false)
  })
  it('senkrecht gezogen: Ende 0,30 m vor dem Bord N 4', () => {
    const r = endeAmBordFangen(pt(0, 4.6), pt(0, -3.7), linien, 1.5)
    expect(rel(r.bord!)).toEqual([0, 4])
    expect(rel(r.p)).toEqual([0, 4 - RAND_ZUSCHLAG])
  })
  it('schräg gezogen (20°): die Richtung bleibt, der Bordpunkt liegt auf der Geraden', () => {
    const w = 20 * Math.PI / 180, gegen = pt(-3.7 * Math.tan(w), -3.7), p = pt(4.5 * Math.tan(w), 4.5)
    const r = endeAmBordFangen(p, gegen, linien, 1.5)
    expect(rel(r.bord!)).toEqual(rel(pt(4 * Math.tan(w), 4)))
    const a = Math.atan2(r.p[0] - gegen[0], r.p[1] - gegen[1]) * 180 / Math.PI
    expect(a).toBeCloseTo(20, 6)
    expect(Math.hypot(r.bord![0] - r.p[0], r.bord![1] - r.p[1])).toBeCloseTo(RAND_ZUSCHLAG, 9)
  })
  it('ohne Schnitt im Radius der nächste Bordpunkt; ohne Bord im Radius bleibt der Punkt', () => {
    // parallel zum Bord gezogen: kein Schnitt, nächster Punkt
    const r = endeAmBordFangen(pt(5, 3.5), pt(0, 3.5), linien, 1)
    expect(rel(r.bord!)).toEqual([5, 4])
    const frei = endeAmBordFangen(pt(0, 0), pt(0, -3.7), linien, 1.5)
    expect(frei.bord).toBeNull()
    expect(rel(frei.p)).toEqual([0, 0])
  })
})

describe('Fanglinien aus dem Bordmodell (streifenFangLinien)', () => {
  it('Öffnung eines Fusswegs in der Fläche Strasse_Weg: über die Öffnung gerade (N 4), das gezogene Ende fängt dort statt an der Flanke', () => {
    const flaechen = [
      fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(51.5, 4), pt(51.5, 12), pt(48.5, 12), pt(48.5, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, 48.5, 4, 7)), fl('Gartenanlage', rechteck(-50, 48.5, 7, 20)),
      fl('Trottoir', rechteck(51.5, 150, 4, 7)), fl('Gartenanlage', rechteck(51.5, 150, 7, 20)), fl('Trottoir', rechteck(-50, 150, -7, -4)),
    ]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)] })
    // in den Fussweg gezogen, nahe der Flanke E 51,5
    const p = pt(51, 4.4)
    expect(rel(endeAmBordFangen(p, pt(50.5, -3.7), bordFangLinien(m.stuecke), 1.5).bord!)).toEqual([51.5, 4.4])
    const r = endeAmBordFangen(p, pt(50.5, -3.7), streifenFangLinien(m), 1.5)
    expect(rel(r.bord!)[1]).toBe(4)
  })
})

describe('Anwenden auf die gerechnete Streifengeometrie', () => {
  // Laubeggstrasse-ähnlich: Fahrbahn N −5,3…5,3 mit Fusswegen in der Fläche, Insel N −1…1; gerechnet ohne Bord 5,3 + 7,8 m
  const insel = rechteck(47, 53, -1, 1)
  const strasse = [[[pt(-50, -5.3), pt(48.5, -5.3), pt(48.5, -6.9), pt(51.5, -6.9), pt(51.5, -5.3), pt(150, -5.3), pt(150, 5.3), pt(51.5, 5.3),
    pt(51.5, 9.4), pt(48.5, 9.4), pt(48.5, 5.3), pt(-50, 5.3)], insel.slice().reverse()]]
  const k = pt(50, 0)
  const e = streifenEnden(k, [1, 0], strasse, [[insel]], null)!
  it('von Hand: die Teile ersetzen die gerechneten, Achse aus dem Teil am Knoten, Text «Lage von Hand angepasst»', () => {
    expect(e.teile.map(([a, b]) => laenge(a, b))).toEqual([5.3, 7.8])
    const hand = { id: '275422258', teile: [{ p0: pt(50, -5), p1: pt(50, -1.3) }, { p0: pt(50, 1.3), p1: pt(50, 5) }] }
    const r = streifenMitHand(e, k, hand)!
    expect(r.vonHand).toBe(true)
    expect(r.teile.map(([a, b]) => laenge(a, b))).toEqual([3.7, 3.7])
    expect(r.achse.map(x => Math.round(x * 1e9) / 1e9)).toEqual([0, 1])
    expect(r.meldungen).toEqual([LAGE_VON_HAND])
    expect([r.geklemmt, r.geschaetzt]).toEqual([false, false])
    // Lage auf der Achse wie die gerechneten Abschnitte (a, b an der Bordkante bzw. Insel)
    expect(r.abschnitte.map(x => [Math.round(x.a * 100) / 100, Math.round(x.b * 100) / 100])).toEqual([[-5.3, -1], [1, 5.3]])
  })
  it('ohne Hand unverändert; Hand ohne Rechnung genügt; Übernahme der gerechneten Teile', () => {
    expect(streifenMitHand(e, k, undefined)).toEqual({ ...e, vonHand: false })
    expect(streifenMitHand(null, k, null)).toBeNull()
    const nur = streifenMitHand(null, k, { id: 'w1', teile: [{ p0: pt(50, -3), p1: pt(50, 3) }] })!
    expect([nur.vonHand, laenge(nur.p0, nur.p1)]).toEqual([true, 6])
    expect(teileVon(e).map(t => laenge(t.p0, t.p1))).toEqual([5.3, 7.8])
  })
})
