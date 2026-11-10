// Tests VSS 40 090b Abb. 2 (Oberkante der Linie, aufgerundet, ±1 m): Tabelle, keine Verschiebung auf Tab. 1 (SW-01), Interpolation, Stufen,
// Randverhalten, Monotonie
import { describe, expect, it } from 'vitest'
import { ANHALTESICHT, ANHALTESICHT_I, ANHALTESICHT_STUFEN, ANHALTESICHT_DURCHGEZOGEN, ANHALTESICHT_ABLESUNG, anhaltesichtweite } from './anhaltesicht'

describe('VSS 40 090b Abb. 2: Anhaltesichtweite übrige Strassen', () => {
  it('Tabelle vollständig: VP 30 … 80 km/h, i −12 … +12 % in Schritten von 2 %', () => {
    expect(ANHALTESICHT_STUFEN).toEqual([30, 40, 50, 60, 70, 80])
    expect(ANHALTESICHT_I).toEqual([-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12])
    for (const v of ANHALTESICHT_STUFEN) expect(ANHALTESICHT[v].length).toBe(13)
    // Ablesung vom 10.11.2026: Oberkante der Linie, aufgerundet
    expect(ANHALTESICHT[30]).toEqual([28, 27, 27, 26, 26, 26, 25, 24, 24, 23, 23, 23, 23])
    expect(ANHALTESICHT[50]).toEqual([58, 56, 55, 54, 53, 52, 51, 50, 49, 47, 47, 46, 46])
    expect(ANHALTESICHT[80]).toEqual([142, 136, 129, 124, 119, 115, 111, 108, 104, 101, 98, 96, 93])
    expect(ANHALTESICHT_ABLESUNG).toContain('Oberkante')
  })
  it('SW-01: keine Verschiebung auf Tab. 1; die Diagrammwerte gelten unverändert, auch wo sie bei i = 0 von Tab. 1 abweichen', () => {
    const bei0 = (v: number) => ANHALTESICHT[v][ANHALTESICHT_I.indexOf(0)]
    expect(ANHALTESICHT_STUFEN.map(v => bei0(v))).toEqual([25, 37, 51, 68, 89, 111])
    expect(anhaltesichtweite(30, 0)).toMatchObject({ unsicher: false, roh: 25, meter: 25, hinweise: [] })
    // Fall des Prüfberichts: 30 km/h, −6 %: 26 m (Oberkante; Linienmitte rund 24,8 m), nicht 21 m
    expect(anhaltesichtweite(30, -6)).toMatchObject({ roh: 26, meter: 26 })
    expect(anhaltesichtweite(60, -12)).toMatchObject({ roh: 81, meter: 81 })
    expect(anhaltesichtweite(70, 12)).toMatchObject({ roh: 78, meter: 78 })
    expect(Object.keys(anhaltesichtweite(30, -6))).not.toContain('abweichung')
  })
  it('Unabhängige Nachmessung (Linienmitte): Ablesung vom 10.11.2026 (Oberkante) höchstens 2 m darüber, nie darunter', () => {
    // [VP, i, gemessen in m] aus einer unabhängigen Nachmessung
    const mess: [number, number, number][] = [[30, 10, 21.7], [60, -6, 72.1], [80, 6, 99.7], [70, 0, 87.6], [50, 12, 44.6],
      [40, -10, 38.5], [30, 0, 23.9], [80, -10, 135.4], [70, -6, 94.9], [60, 12, 58.3]]
    for (const [v, i, m] of mess) {
      const d = ANHALTESICHT[v][ANHALTESICHT_I.indexOf(i)] - m
      expect(d, `${v} km/h bei ${i} %`).toBeGreaterThanOrEqual(0)
      expect(d, `${v} km/h bei ${i} %`).toBeLessThanOrEqual(2)
    }
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
  it('Interpolation linear in i: 50 km/h bei −3 % = 52,5 m, 60 km/h bei −5 % = 72,5 m, 70 km/h bei +1 % = 87,5 m', () => {
    expect(anhaltesichtweite(50, -3)).toMatchObject({ stufe: 50, roh: 52.5, meter: 53 })
    expect(anhaltesichtweite(60, -5).roh).toBeCloseTo(72.5, 9)
    expect(anhaltesichtweite(70, 1).roh).toBeCloseTo(87.5, 9)
    expect(anhaltesichtweite(80, -6)).toMatchObject({ roh: 124, meter: 124 })
    expect(anhaltesichtweite(40, 12)).toMatchObject({ roh: 34, meter: 34 })
  })
  it('VP auf die nächste Stufe aufgerundet; unter 30 und über 80 km/h am Rand mit Hinweis', () => {
    expect(anhaltesichtweite(45, 0).stufe).toBe(50)
    expect(anhaltesichtweite(51, 0).stufe).toBe(60)
    const a = anhaltesichtweite(25, 0)
    expect(a.stufe).toBe(30)
    expect(a.hinweise.join(' ')).toContain('unter der Abb. 2')
    const b = anhaltesichtweite(100, 0)
    expect(b).toMatchObject({ stufe: 80, meter: 111 })
    expect(b.hinweise.join(' ')).toContain('über der Abb. 2')
  })
  it('Rand: ausserhalb ±12 % am Rand festgehalten mit Hinweis; Kurve 80 km/h ausserhalb ±10 % verlängert', () => {
    const a = anhaltesichtweite(50, -15)
    expect(a).toMatchObject({ meter: 58, i: -15 })
    expect(a.hinweise.join(' ')).toContain('festgehalten')
    expect(anhaltesichtweite(50, 20).meter).toBe(46)
    expect(anhaltesichtweite(80, -11)).toMatchObject({ roh: 139, meter: 139, unsicher: true })   // (142 + 136) / 2
    expect(anhaltesichtweite(80, -11).hinweise.join(' ')).toContain('verlängert')
    expect(anhaltesichtweite(80, -8)).toMatchObject({ unsicher: false, hinweise: [] })
    expect(anhaltesichtweite(50, Number.NaN).i).toBe(0)
  })
  it('gestrichelte Kurvenenden gelten als nicht gezeichnet: Wert bleibt, aber unsicher mit Hinweis', () => {
    expect(ANHALTESICHT_DURCHGEZOGEN).toEqual({ 30: [-12, 12], 40: [-12, 12], 50: [-11, 10], 60: [-10, 10], 70: [-9, 9], 80: [-8, 8] })
    // 80 km/h: −8 % durchgezogen, −9 % gestrichelt (Wert aus der Tabelle: (136 + 129) / 2 = 132,5), −11 % verlängert
    const a = anhaltesichtweite(80, -9)
    expect(a).toMatchObject({ roh: 132.5, unsicher: true, verlaengert: false })
    expect(a.hinweise).toContain('Kurve 80 km/h in Abb. 2 nur von −8 bis +8 % durchgezogen: Wert aus dem gestrichelten Stück, unsicher.')
    expect(anhaltesichtweite(80, 8)).toMatchObject({ unsicher: false, verlaengert: false })
    expect(anhaltesichtweite(80, -11)).toMatchObject({ unsicher: true, verlaengert: true })
    expect(anhaltesichtweite(80, -11).hinweise).toContain('Kurve 80 km/h in Abb. 2 nur von −8 bis +8 % durchgezogen: Wert verlängert ' +
      '(gezeichnet nur von −10 bis +10 %), unsicher.')
    // 50 km/h: +10 % durchgezogen, +10,5 % gestrichelt; −11 % durchgezogen, −11,5 % gestrichelt
    expect([10, 10.5, -11, -11.5].map(i => anhaltesichtweite(50, i).unsicher)).toEqual([false, true, false, true])
    expect(anhaltesichtweite(50, 10.5).hinweise.join(' ')).toContain('nur von −11 bis +10 % durchgezogen')
    // 60 und 70 km/h an den neuen Grenzen; 30 und 40 km/h bis ±12 % durchgezogen
    expect([-10, -10.5, 10, 10.5].map(i => anhaltesichtweite(60, i).unsicher)).toEqual([false, true, false, true])
    expect([-9, -9.5, 9, 9.5].map(i => anhaltesichtweite(70, i).unsicher)).toEqual([false, true, false, true])
    expect([-12, 12].flatMap(i => [30, 40].map(v => anhaltesichtweite(v, i).unsicher))).toEqual([false, false, false, false])
    // Werte der Abb. 2 unverändert (Ablesung 10.11.2026)
    expect(anhaltesichtweite(70, -10).roh).toBe(105)
  })
})
