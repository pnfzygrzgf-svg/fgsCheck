// Tests Planung (16.10.2026): Vermassung eines Streifens von Hand (Lage LV95, Länge, Winkel, Abstand zum Fahrbahnrand).
// Fahrbahn: einfaches Rechteck (AV Strasse_Weg) 100 × 8 m in West–Ost-Richtung; Bordkanten wie in der Rechnung (raender).
import { describe, expect, it } from 'vitest'
import { type P } from '../geo'
import type { AvFlaeche } from '../daten/av'
import { Fahrbahn } from './flaechen'
import { neuerStreifen, zufahrtenStreifen, raender, umrissRing, sehneStreifen } from './streifen'
import { handUmriss } from './index'
import { vermassung, himmelsrichtung, achsWinkel, koordText, vorzeichenText, vermassungTabelle, type VermassungEingabe } from './vermassung'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const AV: AvFlaeche[] = [{ art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null,
  ringe: [[lv(-50, -4), lv(50, -4), lv(50, 4), lv(-50, 4), lv(-50, -4)]] }]
const OST: P = [1, 0]                                  // Fahrbahnachse West–Ost

/** Streifen von Hand wie in rechneFall: Umriss (handUmriss mit der Fahrbahnrichtung), Bordkanten (raender) */
function eingabe(p0: P, p1: P, breite = 4): VermassungEingabe {
  const fb = new Fahrbahn(AV)
  const s = neuerStreifen('hand-1', 'hand', p0, p1, breite, 'hand', handUmriss(p0, p1, breite, OST))
  zufahrtenStreifen([s])
  const [r0, r1, q] = raender(s, fb)
  const sh = q === 'AV' ? null : sehneStreifen(s, fb, s.m, s.n)
  return { p0, p1, breite, umriss: umrissRing(s), rand: [r0, r1], randQuelle: q, fahrbahn: { r: OST, quelle: 'Test' },
    sehne: sh ? [[s.m[0] - s.n[0] * sh[1], s.m[1] - s.n[1] * sh[1]], [s.m[0] + s.n[0] * sh[0], s.m[1] + s.n[1] * sh[0]]] : null }
}

describe('Vermassung (Streifen von Hand)', () => {
  it('senkrechter Streifen: Punkte, Länge, Winkel 90°, Enden 0,30/0,40 m vor dem Rand', () => {
    const v = vermassung(eingabe(lv(0, -3.7), lv(0, 3.6)))
    expect(v.punkte.map(q => q.name)).toEqual(['Ende A', 'Ende B', 'Ecke A1', 'Ecke B1', 'Ecke B2', 'Ecke A2'])
    const xy = v.punkte.map(q => [Math.round((q.p[0] - O[0]) * 100) / 100, Math.round((q.p[1] - O[1]) * 100) / 100])
    expect(xy).toEqual([[0, -3.7], [0, 3.6], [-2, -3.7], [-2, 3.6], [2, 3.6], [2, -3.7]])
    expect(v.laengeM).toBeCloseTo(7.3)
    expect(v.breiteM).toBe(4)
    expect(v.winkelGrad).toBeCloseTo(90)
    expect(v.seiteA).toBe('Süd')
    expect(v.randAbstandM![0]).toBeCloseTo(0.3)
    expect(v.randAbstandM![1]).toBeCloseTo(0.4)
    expect(v.fahrbahnM).toBeCloseTo(8)
    expect(v.randQuelle).toMatch(/^AV-Bordkanten wie in der Rechnung/)
  })
  it('schiefer Streifen: Winkel zur Fahrbahnachse, Abstand entlang der Achse, Ecken parallel zur Fahrbahn', () => {
    const p0 = lv(-2, -3.7), p1 = lv(2, 3.7)
    const v = vermassung(eingabe(p0, p1))
    const l = Math.hypot(4, 7.4)
    expect(v.winkelGrad).toBeCloseTo(Math.acos(4 / l) * 180 / Math.PI, 6)       // 61,6°
    expect(v.winkelGrad!).toBeGreaterThan(61.5)
    expect(v.winkelGrad!).toBeLessThan(61.7)
    // bis zur Bordkante (y = ±4) fehlen quer 0,3 m, entlang der schiefen Achse 0,3 · l / 7,4
    expect(v.randAbstandM![0]).toBeCloseTo(0.3 * l / 7.4)
    expect(v.randAbstandM![1]).toBeCloseTo(0.3 * l / 7.4)
    expect(v.fahrbahnM).toBeCloseTo(8 * l / 7.4)
    // Ecken: Enden parallel zur Fahrbahn (Parallelogramm), je 2 m neben den Achsenenden
    const ecken = v.punkte.slice(2).map(q => q.p)
    for (const e of ecken) expect(Math.min(Math.abs(e[1] - p0[1]), Math.abs(e[1] - p1[1]))).toBeLessThan(1e-9)
    expect(v.seiteA).toBe('Südwest')
  })
  it('Enden über den Rand hinaus: negativer Abstand', () => {
    const v = vermassung(eingabe(lv(0, -4.5), lv(0, 4.2)))
    expect(v.randAbstandM![0]).toBeCloseTo(-0.5)
    expect(v.randAbstandM![1]).toBeCloseTo(-0.2)
    expect(vorzeichenText(v.randAbstandM![0])).toBe('−0,50 m')
  })
  it('Rand angenommen (AV-Sehne weicht ab): Masse aus der Sehne mit Hinweis; ohne Sehne keine', () => {
    const x = eingabe(lv(0, -0.5), lv(0, 0.5))
    expect(x.randQuelle).toBe('Annahme')
    const v = vermassung(x)
    expect(v.randAbstandM![0]).toBeCloseTo(3.5)
    expect(v.fahrbahnM).toBeCloseTo(8)
    expect(v.randQuelle).toMatch(/die Rechnung nimmt den Rand 0,3 m vor den Enden an/)
    const ohne = vermassung({ ...x, sehne: null, fahrbahn: null })
    expect([ohne.randAbstandM, ohne.fahrbahnM, ohne.winkelGrad]).toEqual([null, null, null])
  })
  it('Knoten aus den geraden Zufahrten der Rechnung', () => {
    const v = vermassung({ ...eingabe(lv(0, -3.7), lv(0, 3.6)), zufahrten: [
      { zufahrt: '0', art: 'beide', strasse: 'Hauptstrasse', ersterKnotenM: 38, osmKnoten: '11' },
      { zufahrt: '180', art: 'beide', strasse: 'Hauptstrasse', ersterKnotenM: null, osmKnoten: null },
      { zufahrt: 'a90', art: 'abbiegend', strasse: 'Querweg', ersterKnotenM: 12, osmKnoten: '11' }] })
    expect(v.knoten).toEqual([{ zufahrt: '0', strasse: 'Hauptstrasse', abstandM: 38, knoten: '11' }])
  })
  it('Ecken nach ihrer Stelle im Umriss benannt, nicht nach dem nächsten Achsenende (kurz, breit, schief)', () => {
    // Prüfung 16.10.2026: 2 m lang, 6 m breit, Balken 55° gegen die Achse geneigt: Ecke A1 liegt näher bei B als bei A
    const p0 = lv(0, -1), p1 = lv(0, 1), g = 55 * Math.PI / 180
    const r: P = [-Math.cos(g), Math.sin(g)]                         // 55° gegen die Querrichtung u = (-1, 0)
    const umriss = handUmriss(p0, p1, 6, r)
    const v = vermassung({ p0, p1, breite: 6, umriss, rand: [p0, p1], randQuelle: 'Annahme' })
    expect(v.punkte.map(q => q.name)).toEqual(['Ende A', 'Ende B', 'Ecke A1', 'Ecke B1', 'Ecke B2', 'Ecke A2'])
    const e = Object.fromEntries(v.punkte.map(q => [q.name, q.p]))
    expect(e['Ecke A1'][0]).toBeCloseTo(p0[0] + r[0] * 3); expect(e['Ecke A1'][1]).toBeCloseTo(p0[1] + r[1] * 3)
    expect(e['Ecke B2'][0]).toBeCloseTo(p1[0] - r[0] * 3); expect(e['Ecke B2'][1]).toBeCloseTo(p1[1] - r[1] * 3)
    // nach dem nächsten Achsenende hiessen sie «B1, B2, A1, A2»
    expect(Math.hypot(e['Ecke A1'][0] - p1[0], e['Ecke A1'][1] - p1[1])).toBeLessThan(Math.hypot(e['Ecke A1'][0] - p0[0], e['Ecke A1'][1] - p0[1]))
  })
  it('Hilfsfunktionen und Zwischenablage', () => {
    expect([himmelsrichtung([0, 1]), himmelsrichtung([1, 1]), himmelsrichtung([1, 0]), himmelsrichtung([-1, -1])])
      .toEqual(['Nord', 'Nordost', 'Ost', 'Südwest'])
    expect(achsWinkel([0, 1], [-1, 0])).toBeCloseTo(90)
    expect(achsWinkel([1, 1], [1, 0])).toBeCloseTo(45)
    expect(koordText(2596442.3)).toBe('2’596’442,30')
    expect(vorzeichenText(0.3)).toBe('+0,30 m')
    const v = vermassung(eingabe(lv(0, -3.7), lv(0, 3.6)))
    const t = vermassungTabelle('hand-1', v).split('\n')
    expect(t.length).toBe(7)
    expect(t[0]).toBe('Punkt\tE\tN')
    expect(t[1]).toBe('hand-1 Ende A\t2600000.00\t1199996.30')
    expect(t[3]).toBe('hand-1 Ecke A1\t2599998.00\t1199996.30')
  })
})
