// Tests VSS 40 090b Abb. 2 (abgelesen, ±2 m): Tabelle, Kontrolle bei i = 0 gegen VSS 40 273 Tab. 1, Interpolation, Stufen,
// Randverhalten, Monotonie
import { describe, expect, it } from 'vitest'
import { ANHALTESICHT, ANHALTESICHT_I, ANHALTESICHT_STUFEN, ANHALTESICHT_DURCHGEZOGEN, anhaltesichtweite, anhalteAbweichung } from './anhaltesicht'
import { TAB1 } from './sichtweite'

describe('VSS 40 090b Abb. 2: Anhaltesichtweite übrige Strassen', () => {
  it('Tabelle vollständig: VP 30 … 80 km/h, i −12 … +12 % in Schritten von 2 %', () => {
    expect(ANHALTESICHT_STUFEN).toEqual([30, 40, 50, 60, 70, 80])
    expect(ANHALTESICHT_I).toEqual([-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12])
    for (const v of ANHALTESICHT_STUFEN) expect(ANHALTESICHT[v].length).toBe(13)
    // Stand der Ablesung vom 30./31.10.2026 (Neigungstabelle.csv; Lücken aus der Digitalisierung vom 15.10.2026)
    expect(ANHALTESICHT[30]).toEqual([26, 26, 26, 25, 25, 25, 24, 24, 24, 23, 23, 22, 22])
    expect(ANHALTESICHT[50]).toEqual([58, 56, 54, 53, 52, 51, 51, 50, 49, 47, 46, 45, 45])
    expect(ANHALTESICHT[80]).toEqual([143, 135, 130, 123, 118, 114, 111, 106, 103, 100, 97, 94, 92])
    // ohne Ablesung: 70 km/h bei ±12 %, 80 km/h bei −12, −10 und +12 % (Werte vom 15.10.2026)
    expect([ANHALTESICHT[70][0], ANHALTESICHT[70][12], ANHALTESICHT[80][0], ANHALTESICHT[80][1], ANHALTESICHT[80][12]])
      .toEqual([109, 76, 143, 135, 92])
  })
  it('Kontrolle bei i = 0 gegen den unteren Wert der Tab. 1: 40, 50, 60, 80 km/h ±2 m; 30 und 70 km/h Abweichung im Diagramm', () => {
    const bei0 = (v: number) => ANHALTESICHT[v][ANHALTESICHT_I.indexOf(0)]
    for (const v of [40, 50, 60, 80]) expect(Math.abs(bei0(v) - TAB1[v][0])).toBeLessThanOrEqual(2)
    // Ablesung bei 0 %: 30 → 24, 40 → 37, 50 → 51, 60 → 68, 70 → 87, 80 → 111 m; siehe Kopf von anhaltesicht.ts
    expect(ANHALTESICHT_STUFEN.map(v => bei0(v))).toEqual([24, 37, 51, 68, 87, 111])
    expect(ANHALTESICHT_STUFEN.map(anhalteAbweichung)).toEqual([4, 2, 1, -2, -3, 1])
    // die Abweichung steht im Diagramm (nachgemessen): Hinweis, aber nicht «unsicher»; die Kurve ist auf Tab. 1 verschoben
    expect(anhaltesichtweite(30, 0)).toMatchObject({ unsicher: false, abweichung: 4, roh: 24, wert: 20, meter: 20 })
    expect(anhaltesichtweite(30, 0).hinweise.join(' ')).toContain('auf Tab. 1 verschoben')
    expect(anhaltesichtweite(50, 0)).toMatchObject({ unsicher: false, abweichung: 1, roh: 51, wert: 50, hinweise: [] })
    expect(anhaltesichtweite(40, 0).hinweise.join(' ')).toContain('2 m über dem unteren Wert')
    // bei i = 0 trifft jede Kurve den unteren Wert der Tab. 1; bei Neigung zählt nur die Differenz zum Diagrammwert bei 0 %
    for (const v of ANHALTESICHT_STUFEN) expect(anhaltesichtweite(v, 0).meter).toBe(TAB1[v][0])
    expect(anhaltesichtweite(30, -6)).toMatchObject({ roh: 25, wert: 21, meter: 21 })     // 20 + (25 − 24)
    expect(anhaltesichtweite(60, -12)).toMatchObject({ roh: 81, wert: 83, meter: 83 })   // 70 + (81 − 68)
    expect(anhaltesichtweite(70, 12)).toMatchObject({ roh: 76, wert: 79, meter: 79 })    // 90 + (76 − 87)
  })
  it('Nachmessung der Prüfrunde (eigene Eichung am PNG): Ablesung vom 30./31.10.2026 innert der Ablesegenauigkeit ±2 m', () => {
    // [VP, i, gemessen in m] aus der unabhängigen Prüfrunde vom 15.10.2026
    const mess: [number, number, number][] = [[30, 10, 21.7], [60, -6, 72.1], [80, 6, 99.7], [70, 0, 87.6], [50, 12, 44.6],
      [40, -10, 38.5], [30, 0, 23.9], [80, -10, 135.4], [70, -6, 94.9], [60, 12, 58.3]]
    for (const [v, i, m] of mess) expect(Math.abs(ANHALTESICHT[v][ANHALTESICHT_I.indexOf(i)] - m), `${v} km/h bei ${i} %`).toBeLessThanOrEqual(2)
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
  it('Interpolation linear in i: 50 km/h bei −3 % = 51,5 m roh, 60 km/h bei −5 % = 73 m roh, 70 km/h bei +1 % = 86 m roh', () => {
    expect(anhaltesichtweite(50, -3)).toMatchObject({ stufe: 50, roh: 51.5, wert: 50.5, meter: 51 })   // verschoben um −1
    expect(anhaltesichtweite(60, -5).roh).toBeCloseTo(73, 9)
    expect(anhaltesichtweite(60, -5).wert).toBeCloseTo(75, 9)       // verschoben um +2
    expect(anhaltesichtweite(70, 1).roh).toBeCloseTo(86, 9)
    expect(anhaltesichtweite(70, 1).wert).toBeCloseTo(89, 9)        // verschoben um +3
    expect(anhaltesichtweite(80, -6)).toMatchObject({ roh: 123, wert: 122, meter: 122 })   // Stützstelle, verschoben um −1
    expect(anhaltesichtweite(40, 12)).toMatchObject({ roh: 33, wert: 31 })         // letzte Stützstelle, verschoben um −2
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
    expect(anhaltesichtweite(80, -11)).toMatchObject({ roh: 139, wert: 138, unsicher: true })   // (143 + 135) / 2, verschoben um −1
    expect(anhaltesichtweite(80, -11).hinweise.join(' ')).toContain('verlängert')
    expect(anhaltesichtweite(80, -8)).toMatchObject({ unsicher: false, hinweise: [] })
    expect(anhaltesichtweite(50, Number.NaN).i).toBe(0)
  })
  it('gestrichelte Kurvenenden gelten als nicht gezeichnet (Entscheid 31.10.2026): Wert bleibt, aber unsicher mit Hinweis', () => {
    expect(ANHALTESICHT_DURCHGEZOGEN).toEqual({ 30: [-12, 12], 40: [-12, 12], 50: [-11, 10], 60: [-10, 10], 70: [-9, 9], 80: [-8, 8] })
    // 80 km/h: −8 % durchgezogen, −9 % gestrichelt (Wert aus der Tabelle unverändert: (135 + 130) / 2 = 132,5), −11 % verlängert
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
    // Werte der Abb. 2 unverändert (Ablesung 30./31.10.2026)
    expect(anhaltesichtweite(70, -10).roh).toBe(101)
  })
})
