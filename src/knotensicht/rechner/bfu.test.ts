// Tests Block 5: Vergleichswerte der bfu BM.021 (2022) Tab. 2 und Tab. 3 (nur Bericht, ohne Wirkung): Spalten, Zwischenwerte zur
// strengeren Klasse, unbekannte Neigung
import { describe, expect, it } from 'vitest'
import { bfuSpalte, bfuVelo, bfuTrottoir, BFU_TAB2_VELO, BFU_TAB3 } from './bfu'

describe('bfu BM.021 Tab. 2 und 3', () => {
  it('Spalten ≥ −8, −6, −4, −2, > 0; Zwischenwerte zur strengeren Klasse', () => {
    expect([-12, -8, -7, -6, -5, -4, -3, -2, -1, 0, 0.5, 6].map(i => bfuSpalte(i))).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4])
    expect(bfuSpalte(3, true)).toBe(0)
  })
  it('Werte: Velo 60/55/45/40/40; Trottoir Fussgänger 30/25/20/20/15, zugelassene Velos 35/30/30/25/20', () => {
    expect(BFU_TAB2_VELO).toEqual([60, 55, 45, 40, 40])
    expect(BFU_TAB3).toEqual({ fuss: [30, 25, 20, 20, 15], velo: [35, 30, 30, 25, 20] })
    expect(bfuVelo(-5)).toEqual({ A: 55, text: 'bfu BM.021 (2022) Tab. 2, Spalte −6 %' })
    expect(bfuTrottoir(2)).toMatchObject({ fuss: 15, velo: 20 })
    expect(bfuTrottoir(0, true)).toMatchObject({ fuss: 30, velo: 35, text: 'bfu BM.021 (2022) Tab. 3, Spalte ≥ −8 % (Neigung unbekannt: strengste Spalte)' })
  })
})
