// Tests VSS 40 090b Abb. 2 (abgelesen, ±2 m): Tabelle, Kontrolle bei i = 0 gegen VSS 40 273 Tab. 1, Interpolation, Stufen,
// Randverhalten, Monotonie
import { describe, expect, it } from 'vitest'
import { ANHALTESICHT, ANHALTESICHT_I, ANHALTESICHT_STUFEN, anhaltesichtweite, anhalteAbweichung } from './anhaltesicht'
import { TAB1 } from './sichtweite'

describe('VSS 40 090b Abb. 2: Anhaltesichtweite übrige Strassen', () => {
  it('Tabelle vollständig: VP 30 … 80 km/h, i −12 … +12 % in Schritten von 2 %', () => {
    expect(ANHALTESICHT_STUFEN).toEqual([30, 40, 50, 60, 70, 80])
    expect(ANHALTESICHT_I).toEqual([-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12])
    for (const v of ANHALTESICHT_STUFEN) expect(ANHALTESICHT[v].length).toBe(13)
    // Stand der Ablesung vom 15.10.2026 (Änderungen nur nach neuer Ablesung)
    expect(ANHALTESICHT[50]).toEqual([57, 55, 54, 53, 52, 51, 50, 49, 48, 46, 46, 45, 44])
    expect(ANHALTESICHT[80]).toEqual([143, 135, 128, 123, 119, 114, 110, 106, 103, 100, 97, 95, 92])
  })
  it('Kontrolle bei i = 0 gegen den unteren Wert der Tab. 1: 40, 50, 80 km/h ±2 m; 30, 60, 70 km/h Abweichung im Diagramm', () => {
    const bei0 = (v: number) => ANHALTESICHT[v][ANHALTESICHT_I.indexOf(0)]
    for (const v of [40, 50, 80]) expect(Math.abs(bei0(v) - TAB1[v][0])).toBeLessThanOrEqual(2)
    // Diagramm: 30 km/h 24 m (Tab. 1: 20), 60 km/h 67 m (70), 70 km/h 88 m (90); siehe Kopf von anhaltesicht.ts
    expect(ANHALTESICHT_STUFEN.map(anhalteAbweichung)).toEqual([4, 1, 0, -3, -2, 0])
    // die Abweichung steht im Diagramm (nachgemessen): Hinweis, aber nicht «unsicher»; die Kurve ist auf Tab. 1 verschoben
    expect(anhaltesichtweite(30, 0)).toMatchObject({ unsicher: false, abweichung: 4, roh: 24, wert: 20, meter: 20 })
    expect(anhaltesichtweite(30, 0).hinweise.join(' ')).toContain('auf Tab. 1 verschoben')
    expect(anhaltesichtweite(50, 0)).toMatchObject({ unsicher: false, abweichung: 0, roh: 50, wert: 50, hinweise: [] })
    // bei i = 0 trifft jede Kurve den unteren Wert der Tab. 1; bei Neigung zählt nur die Differenz zum Diagrammwert bei 0 %
    for (const v of ANHALTESICHT_STUFEN) expect(anhaltesichtweite(v, 0).meter).toBe(TAB1[v][0])
    expect(anhaltesichtweite(30, -6)).toMatchObject({ roh: 25, wert: 21, meter: 21 })     // 20 + (25 − 24)
    expect(anhaltesichtweite(60, -12)).toMatchObject({ roh: 80, wert: 83, meter: 83 })   // 70 + (80 − 67)
    expect(anhaltesichtweite(70, 12)).toMatchObject({ roh: 76, wert: 78, meter: 78 })    // 90 + (76 − 88)
  })
  it('Nachmessung der Prüfrunde (eigene Eichung am PNG): Tabelle innert ±1 m', () => {
    // [VP, i, gemessen in m] aus der unabhängigen Prüfrunde vom 15.10.2026
    const mess: [number, number, number][] = [[30, 10, 21.7], [60, -6, 72.1], [80, 6, 99.7], [70, 0, 87.6], [50, 12, 44.6],
      [40, -10, 38.5], [30, 0, 23.9], [80, -10, 135.4], [70, -6, 94.9], [60, 12, 58.3]]
    for (const [v, i, m] of mess) expect(Math.abs(ANHALTESICHT[v][ANHALTESICHT_I.indexOf(i)] - m), `${v} km/h bei ${i} %`).toBeLessThanOrEqual(1)
  })
  it('Monotonie: mit zunehmendem Gefälle (kleinerem i) nie kleiner; talwärts nie kleiner als eben', () => {
    for (const v of ANHALTESICHT_STUFEN) {
      const w = ANHALTESICHT[v]
      for (let k = 1; k < w.length; k++) expect(w[k - 1], `${v} km/h bei ${ANHALTESICHT_I[k - 1]} %`).toBeGreaterThanOrEqual(w[k])
      for (let k = 0; k < 6; k++) expect(w[k]).toBeGreaterThanOrEqual(w[6])
    }
    // höheres Tempo nie kürzer
    for (let k = 0; k < 13; k++) for (let j = 1; j < 6; j++)
      expect(ANHALTESICHT[ANHALTESICHT_STUFEN[j]][k]).toBeGreaterThan(ANHALTESICHT[ANHALTESICHT_STUFEN[j - 1]][k])
  })
  it('Interpolation linear in i: 50 km/h bei −3 % = 51,5 m (52 m), 60 km/h bei −5 % = 71 m roh, 70 km/h bei +1 % = 86,5 m roh', () => {
    expect(anhaltesichtweite(50, -3)).toMatchObject({ stufe: 50, wert: 51.5, meter: 52 })
    expect(anhaltesichtweite(60, -5).roh).toBeCloseTo(71, 9)
    expect(anhaltesichtweite(60, -5).wert).toBeCloseTo(74, 9)       // verschoben um +3
    expect(anhaltesichtweite(70, 1).roh).toBeCloseTo(86.5, 9)
    expect(anhaltesichtweite(70, 1).wert).toBeCloseTo(88.5, 9)      // verschoben um +2
    expect(anhaltesichtweite(80, -6)).toMatchObject({ wert: 123, meter: 123 })   // Stützstelle
    expect(anhaltesichtweite(40, 12)).toMatchObject({ roh: 33, wert: 32 })         // letzte Stützstelle, verschoben um −1
  })
  it('VP auf die nächste Stufe aufgerundet; unter 30 und über 80 km/h am Rand mit Hinweis', () => {
    expect(anhaltesichtweite(45, 0).stufe).toBe(50)
    expect(anhaltesichtweite(51, 0).stufe).toBe(60)
    const a = anhaltesichtweite(25, 0)
    expect(a.stufe).toBe(30)
    expect(a.hinweise.join(' ')).toContain('unter der Abb. 2')
    const b = anhaltesichtweite(100, 0)
    expect(b).toMatchObject({ stufe: 80, wert: 110 })
    expect(b.hinweise.join(' ')).toContain('über der Abb. 2')
  })
  it('Rand: ausserhalb ±12 % am Rand festgehalten mit Hinweis; Kurve 80 km/h ausserhalb ±10 % verlängert', () => {
    const a = anhaltesichtweite(50, -15)
    expect(a).toMatchObject({ wert: 57, i: -15 })
    expect(a.hinweise.join(' ')).toContain('festgehalten')
    expect(anhaltesichtweite(50, 20).wert).toBe(44)
    expect(anhaltesichtweite(80, -11)).toMatchObject({ wert: 139, unsicher: true })   // (143 + 135) / 2
    expect(anhaltesichtweite(80, -11).hinweise.join(' ')).toContain('verlängert')
    expect(anhaltesichtweite(80, -8)).toMatchObject({ unsicher: false, hinweise: [] })
    expect(anhaltesichtweite(50, Number.NaN).i).toBe(0)
  })
})
