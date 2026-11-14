// Parkregel (gemeinsamer Baustein seit 14.11.2026): Fälle aus dem fgsCheck (rechner/parkgeometrie.test.ts), dazu der Bezug über einen
// Bordpunkt. Koordinaten relativ zu E 2 600 000 / N 1 200 000; Strassenachse N 0 nach Osten.
import { describe, expect, it } from 'vitest'
import type { P } from './geometrie'
import { type ParkBezug, PARK_HINWEIS, parkFeldPruefen, parkMasse, parkRegel } from './parkregel'

const o: P = [2600000, 1200000]
const p = (x: number, y: number): P => [o[0] + x, o[1] + y]
const ring = (y: number, b: number): P[] => [p(0, y), p(12, y), p(12, y + b), p(0, y + b)]
const achse: ParkBezug = { p: p(6, 0), t: [1, 0] }
const breite = (r: P[]) => parkMasse(r)!.breite
const nMin = (r: P[]) => Math.min(...r.map(q => q[1])) - o[1], nMax = (r: P[]) => Math.max(...r.map(q => q[1])) - o[1]
const bern = parkRegel({ bern: true })

describe('Parkregel: zur Fahrbahn hin ergänzt, der gegenüberliegende Rand bleibt', () => {
  it.each([['Bern', { bern: true }, 1.9], ['Zürich', { kanton: 'ZH' }, 2], ['Luzern', { kanton: 'LU' }, 1.9]] as const)(
    '%s: Feld 1,60 m auf die Regelbreite ergänzt, äussere Kante und Länge bleiben', (_n, gebiet, soll) => {
      const r = ring(3, 1.6), vorher = structuredClone(r)
      const x = parkFeldPruefen(r, parkRegel(gebiet), achse)
      expect(r).toEqual(vorher)
      expect(x.pruefung.status).toBe('ergaenzt')
      expect(x.pruefung.hinweis).toBe(PARK_HINWEIS.ergaenzt)
      expect([x.pruefung.katasterBreite, x.pruefung.pruefBreite]).toEqual([expect.closeTo(1.6, 9), soll])
      expect(x.pruefung.ergaenzung).toBeCloseTo(soll - 1.6, 9)
      expect(x.pruefung.original).toEqual(vorher)
      expect(breite(x.ring)).toBeCloseTo(soll, 7)
      expect(nMax(x.ring)).toBeCloseTo(4.6, 7)
      expect(nMin(x.ring)).toBeCloseTo(4.6 - soll, 7)
      expect(parkMasse(x.ring)!.laenge).toBeCloseTo(12, 7)
      // ein zweites Mal: unverändert
      expect(parkFeldPruefen(x.ring, parkRegel(gebiet), achse).pruefung.status).toBe('unveraendert')
    })
  it('andere Strassenseite und umgekehrter Ringsinn', () => {
    const x = parkFeldPruefen([...ring(-4.6, 1.6)].reverse(), bern, achse)
    expect(breite(x.ring)).toBeCloseTo(1.9, 7)
    expect(nMin(x.ring)).toBeCloseTo(-4.6, 7)
    expect(nMax(x.ring)).toBeCloseTo(-2.7, 7)
  })
  it('breitere Felder bleiben unverändert (Kopie des Umrisses)', () => {
    const r = ring(3, 2.3), x = parkFeldPruefen(r, bern, achse)
    expect([x.pruefung.status, x.pruefung.pruefBreite]).toEqual(['unveraendert', expect.closeTo(2.3, 9)])
    expect(x.ring).toEqual(r)
    expect(x.ring).not.toBe(r)
  })
  it('ohne Fahrbahnbezug, bei Querparkierung und bei Strassenachse im Feld: keine geratene Ergänzung', () => {
    const quer = [p(3, 0), p(4.6, 0), p(4.6, 12), p(3, 12)]
    for (const [r, bezug, hinweis] of [[ring(3, 1.6), null, PARK_HINWEIS.seite], [quer, achse, PARK_HINWEIS.seite],
      [ring(-0.8, 1.6), achse, PARK_HINWEIS.nahe], [[p(0, 3), p(2, 3), p(2, 4.6), p(0, 4.6)], achse, PARK_HINWEIS.laenglich]] as const) {
      const x = parkFeldPruefen(r, bern, bezug)
      expect([x.pruefung.status, x.pruefung.hinweis]).toEqual(['unklar', hinweis])
      expect(x.ring).toEqual(r)
    }
    expect(parkFeldPruefen([p(0, 0), p(1, 0)], bern, achse).pruefung.hinweis).toBe(PARK_HINWEIS.geometrie)
  })
  it('echtes Katasterpolygon 1950: auch die schmalere Stirnseite erreicht 1,90 m, statt nur die Rahmenbreite', () => {
    const r: P[] = [[2599443.5912, 1199037.2787], [2599445.0639, 1199036.6636], [2599451.1389, 1199051.5526], [2599449.6977, 1199052.1426]]
    const m = parkMasse(r)!
    expect(m.breite).toBeGreaterThan(1.55); expect(m.breite).toBeLessThan(1.6)
    const a: P = [r[1][0] + 4 * m.achse[1], r[1][1] - 4 * m.achse[0]]
    expect(breite(parkFeldPruefen(r, bern, { p: a, t: m.achse }).ring)).toBeGreaterThanOrEqual(1.9 - 1e-6)
  })
})

describe('Parkregel: Bezug über einen Bordpunkt', () => {
  it('Bordpunkt mit Normale zur Fahrbahn: dasselbe Ergebnis wie mit der Strassenachse, auch für ein Feld auf Trottoirniveau', () => {
    const mitAchse = parkFeldPruefen(ring(3, 1.6), bern, achse)
    for (const bord of [p(6, 4.6), p(6, 2.5)]) expect(parkFeldPruefen(ring(3, 1.6), bern, { bord, innen: [0, -1] })).toEqual(mitAchse)
    const unten = parkFeldPruefen(ring(-4.6, 1.6), bern, { bord: p(6, -4.6), innen: [0, 1] })
    expect([nMin(unten.ring), nMax(unten.ring)]).toEqual([expect.closeTo(-4.6, 7), expect.closeTo(-2.7, 7)])
  })
  it('Bord quer zum Feld oder ohne Normale: keine Ergänzung', () => {
    for (const innen of [[1, 0], [0, 0]] as P[])
      expect(parkFeldPruefen(ring(3, 1.6), bern, { bord: p(6, 4.6), innen }).pruefung.hinweis).toBe(PARK_HINWEIS.seite)
  })
  it('Bezug als Funktion: nur aufgerufen, wenn das Feld ergänzt werden müsste', () => {
    let n = 0
    const bezug = () => { n++; return achse }
    parkFeldPruefen(ring(3, 2.3), bern, bezug)
    expect(n).toBe(0)
    expect(parkFeldPruefen(ring(3, 1.6), bern, bezug).pruefung.status).toBe('ergaenzt')
    expect(n).toBe(1)
  })
})

describe('Parkregel: Zweiradfläche und Regelbreite', () => {
  it('Zweiradfläche mit vorgegebener Längsrichtung: Tiefe quer zur Strasse ergänzt; ohne Längsrichtung nicht auswertbar', () => {
    const r = [p(0, 3), p(1, 3), p(1, 4.6), p(0, 4.6)], velo = { ...bern, breite: 1.9 }
    const x = parkFeldPruefen(r, velo, achse, { richtung: [1, 0], zweirad: true })
    expect(x.pruefung.status).toBe('ergaenzt')
    const m = parkMasse(x.ring, [1, 0])!
    expect(m.breite).toBeCloseTo(1.9, 7); expect(m.laenge).toBeCloseTo(1, 7)
    expect(parkFeldPruefen(r, velo, achse, { zweirad: true }).pruefung.hinweis).toBe(PARK_HINWEIS.geometrie)
  })
  it('Gebietsvorgabe: Bern und ohne örtliche Regel 1,90 m; Zürich 2,00 m', () => {
    expect([bern.breite, bern.gebiet]).toEqual([1.9, 'Stadt Bern'])
    expect(parkRegel({ kanton: 'ZH' }).breite).toBe(2)
    expect([parkRegel({ kanton: 'LU' }).breite, parkRegel({ kanton: 'LU' }).gebiet]).toEqual([1.9, 'Kanton LU'])
    expect(parkRegel({}).gebiet).toBe('Gebiet nicht bestimmt')
  })
})
