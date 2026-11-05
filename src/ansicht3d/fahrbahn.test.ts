import { describe, expect, it } from 'vitest'
import { kandidaten, fahrbahnVerfolgen, gueltigeHoehe, hoeheWaehlen, wegBezug } from './fahrbahn'

const weg = (hs: unknown[][], schritt = 1) => hs.map((kandidaten, i) => ({ p: [i * schritt, 0] as [number, number], kandidaten }))
describe('Fahrbahnzuordnung', () => {
  it('erkennt undefined, null, NaN und Infinity; echte Höhe 0 bleibt gültig', () => {
    for (const h of [undefined, null, NaN, Infinity, '500']) expect(gueltigeHoehe(h)).toBe(false)
    expect(gueltigeHoehe(0)).toBe(true)
    expect(hoeheWaehlen([undefined], 500, 1)).toEqual({ h: null, grund: 'fehlt' })
  })
  it('Unterführung bleibt unten, auch wenn das Deck darüber liegt', () => {
    expect(fahrbahnVerfolgen(weg([[500], [500, 505], [500.1, 505], [500.2]]), 500).map(p => p.hoehe.h))
      .toEqual([500, 500, 500.1, 500.2])
  })
  it('DTM am Brückenkopf startet auf dem Deck über dem zu tiefen Gelände und folgt dem Gefälle', () => {
    expect(fahrbahnVerfolgen(weg([[500, 503], [499, 503.1], [498, 503.2], [497, 503.3]]), 503).map(p => p.hoehe.h))
      .toEqual([503, 503.1, 503.2, 503.3])
  })
  it('zwei gleich plausible Decks bleiben unklar; kein Neustart nach einer Datenlücke', () => {
    expect(hoeheWaehlen([500, 502], 501, 5)).toEqual({ h: null, grund: 'unklar' })
    expect(fahrbahnVerfolgen(weg([[500], [undefined], [500]]), 500).map(p => p.hoehe.h)).toEqual([500, null, null])
  })
  it('unzulässigen Sprung sperren; gleiche Höhenänderung auf langem Weg zulassen', () => {
    expect(fahrbahnVerfolgen(weg([[500], [504]]), 500)[1].hoehe.h).toBeNull()
    expect(fahrbahnVerfolgen(weg([[500], [504]], 20), 500)[1].hoehe.h).toBe(504)
  })
  it('Person und Fahrzeug nutzen den interpolierten Verlauf statt eine konstante Streifenhöhe', () => {
    const proben = fahrbahnVerfolgen(weg([[500], [502]], 10), 500)
    expect(wegBezug([5, 2], proben)).toEqual({ abstand: 2, hoehe: { h: 501 } })
  })
})

describe('Begrenzte Wiederaufnahme', () => {
  it('kurze Lücke: erst zwei passende Folgeproben bestätigen den neuen Abschnitt', () => {
    const proben = weg([[500], [500.1], [], [500.3], [500.4], [500.5]])
    proben.forEach((p, i) => Object.assign(p, { boden: i === 2 ? null : 500 + 0.1 * i }))
    const r = fahrbahnVerfolgen(proben, 500)
    expect(r.map(p => p.hoehe.h)).toEqual([500, 500.1, null, 500.3, 500.4, 500.5])
    expect(r[2].boden).toBeNull()
    expect(fahrbahnVerfolgen(weg([[500], [500.1], [], [500.3]]), 500)[3].hoehe.h).toBeNull()
  })
  it('Längengrenze in Metern, auch bei nur wenigen Proben', () => {
    const ps = [0, 1, 2, 7, 8].map((x, i) => ({ p: [x, 0] as [number, number], kandidaten: i === 2 ? [] : [500] }))
    expect(fahrbahnVerfolgen(ps, 500).slice(2).every(p => p.hoehe.h === null)).toBe(true)
  })
  it('lange Lücke bleibt unklar, obwohl danach genau ein oberes Deck übrig ist', () => {
    const ps = Array.from({ length: 23 }, (_, i) => ({ p: [i, 0] as [number, number], kandidaten: i < 2 ? [500] : i < 20 ? [] : [505] }))
    expect(fahrbahnVerfolgen(ps, 500).slice(2).every(p => p.hoehe.h === null)).toBe(true)
  })
  it('Unterführung mit fehlender Bodenprobe wird nicht auf das vorhandene Deck versetzt', () => {
    const r = fahrbahnVerfolgen(weg([[500, 505], [500, 505], [505], [505], [500, 505], [500, 505]]), 500)
    expect(r.map(p => p.hoehe.h)).toEqual([500, 500, null, null, 500, 500])
  })
  it('zwei zur Prognose passende Ebenen erlauben keine Wiederaufnahme', () => {
    const r = fahrbahnVerfolgen(weg([[500], [500], [], [499.6, 500.4], [499.6, 500.4]]), 500)
    expect(r.slice(2).every(p => p.hoehe.h === null)).toBe(true)
  })
  it('echte Klösterlistutz-Werte: DTM schliesst den Weg zum Deck, Talboden wird nicht verfolgt', () => {
    const werte = [
      [11.93, 503.979, 504.08, null], [12.92, 503.345, 504.06, null], [13.90, 502.185, 504.06, null],
      [14.88, 497.238, 504.02, null], [15.85, 496.430, 504.04, null], [16.83, 496.456, 504.01, 504.16],
      [17.81, 496.472, 504.02, 504.16], [18.79, 496.460, 503.49, 504.16], [19.78, 496.492, 501.84, 504.16],
    ]
    const ps = werte.map(([x, _terrain, dtm, deck]) => ({ p: [x!, 0] as [number, number], boden: dtm,
      kandidaten: kandidaten([dtm, deck]) }))
    const r = fahrbahnVerfolgen(ps, 504.08)
    expect(r.every(p => p.hoehe.h !== null && p.hoehe.h > 504)).toBe(true)
    expect(r.at(-1)?.hoehe.h).toBe(504.16)
    expect(r.at(-1)?.boden).toBe(501.84)
  })
})
