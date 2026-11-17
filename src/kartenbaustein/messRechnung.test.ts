import { describe, expect, it } from 'vitest'
import { flaechenInhalt, flaechenText, meterText, streckenLaenge } from './messRechnung'
import type { P } from './geometrie'

describe('Messwerkzeug: Rechnung in LV95', () => {
  const quadrat: P[] = [[2600000, 1200000], [2600010, 1200000], [2600010, 1200010], [2600000, 1200010]]
  it('Länge einer Polylinie und Umfang eines geschlossenen Zugs', () => {
    expect(streckenLaenge([[0, 0], [3, 4], [3, 10]])).toBeCloseTo(11, 9)
    expect(streckenLaenge(quadrat)).toBeCloseTo(30, 9)
    expect(streckenLaenge(quadrat, true)).toBeCloseTo(40, 9)
    expect(streckenLaenge([[0, 0]])).toBe(0)
  })
  it('Fläche unabhängig vom Umlaufsinn, unter drei Punkten null', () => {
    expect(flaechenInhalt(quadrat)).toBeCloseTo(100, 6)
    expect(flaechenInhalt([...quadrat].reverse())).toBeCloseTo(100, 6)
    expect(flaechenInhalt([[0, 0], [4, 0], [0, 3]])).toBeCloseTo(6, 9)
    expect(flaechenInhalt([[0, 0], [1, 1]])).toBe(0)
  })
  it('Schreibweise mit Komma und Hochkomma', () => {
    expect(meterText(3.456)).toBe('3,46 m')
    expect(meterText(123.44)).toBe('123,4 m')
    expect(meterText(1234.6)).toBe('1,235 km')
    expect(flaechenText(45.67)).toBe('45,7 m²')
    expect(flaechenText(1234.4)).toBe('1’234 m²')
    expect(flaechenText(25000)).toBe('25’000 m² (2,50 ha)')
  })
})
