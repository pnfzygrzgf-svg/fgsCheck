// Messen an der AV (messAv.ts): Bordkanten, Ab Kante, Ganze Fläche, Einrasten; dieselben Fälle wie im fgsCheck (bordkanten.test.ts)
import { describe, expect, it } from 'vitest'
import { FANG_M, bordkanten, fangeAnKante, fangen, messeAbKante, messeFlaeche, messPunktFangen, type MessAvFlaeche } from './messAv'

const av = (art: string, ring: [number, number][]): MessAvFlaeche => ({ art, ringe: [ring] })
// Strasse 0…40 (E) × 0…7 (N), in der AV in zwei Flächen geteilt (gemeinsame Kante bei E = 20); Trottoir nördlich, Gebäude dahinter
const AV: MessAvFlaeche[] = [
  av('Strasse_Weg', [[0, 0], [20, 0], [20, 7], [0, 7], [0, 0]]),
  av('Strasse_Weg', [[20, 0], [40, 0], [40, 7], [20, 7], [20, 0]]),
  av('Trottoir', [[0, 7], [40, 7], [40, 9], [0, 9], [0, 7]]),
  av('Gebaeude', [[10, 12], [20, 12], [20, 20], [10, 20], [10, 12]]),
]
const kanten = bordkanten(AV)

describe('Messen an der AV', () => {
  it('gemeinsame Kanten zweier Strassenflächen sind keine Bordkanten', () => {
    expect(kanten.filter(k => Math.abs(k.a[0] - 20) < 1e-6 && Math.abs(k.b[0] - 20) < 1e-6)).toHaveLength(0)
    expect(kanten.filter(k => Math.abs(k.a[1] - 7) < 1e-6 && Math.abs(k.b[1] - 7) < 1e-6).length).toBeGreaterThanOrEqual(2)
  })
  it('Ab Kante: rechtwinklig zur nächsten Kante, höchstens FANG_M', () => {
    expect(messeAbKante([10, 5.5], kanten)!.breite).toBeCloseTo(1.5, 6)
    expect(messeAbKante([10, 7 + FANG_M + 1], kanten)).toBeNull()
  })
  it('Ganze Fläche: Bord bis Bord, rechtwinklig durch den Klick', () => {
    const r = messeFlaeche([10, 2], kanten)!
    expect(r.breite).toBeCloseTo(7, 6)
    expect(messeFlaeche([10, 2], [])).toBeNull()
  })
  it('Einrasten: Gebäudeecke vor AV-Punkt, sonst Bordkante (rechtwinklig zum vorigen Punkt), sonst frei', () => {
    expect(fangen([10.5, 12.4], AV, 1)).toEqual({ p: [10, 12], art: 'gebaeudeecke' })
    expect(messPunktFangen([12, 6.6], AV, kanten, 1, [12.3, 0.5])).toEqual({ p: [12.3, 7], art: 'bordkante' })
    expect(fangeAnKante([12, 3.5], kanten, 1)).toBeNull()
    expect(messPunktFangen([12, 3.5], AV, kanten, 1).art).toBe('frei')
  })
})
