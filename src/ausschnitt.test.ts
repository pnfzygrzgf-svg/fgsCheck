import { describe, expect, it } from 'vitest'
import { enthaelt, erweitern, imCache, aufnehmen, vereinigen, vereinigenNamen, flaecheKm2, abfrageBox, zuGross, ABFRAGE_ZIEL_KM2, type Box,
  type CacheEintrag } from './ausschnitt'

const box = (s: number, w: number, n: number, e: number): Box => ({ s, w, n, e })
const eintrag = (b: Box, ids: number[], tag = 'a'): CacheEintrag<{ id: number; tag: string }> => ({ box: b, daten: ids.map(id => ({ id, tag })) })

describe('Ausschnitt-Cache', () => {
  it('enthaelt: ganz innen, auch randgleich; teilweise bzw. daneben nicht', () => {
    const a = box(46.9, 7.4, 47.0, 7.5)
    expect(enthaelt(a, box(46.92, 7.42, 46.98, 7.48))).toBe(true)
    expect(enthaelt(a, a)).toBe(true)
    expect(enthaelt(a, box(46.95, 7.45, 47.01, 7.48))).toBe(false)
    expect(enthaelt(a, box(47.1, 7.4, 47.2, 7.5))).toBe(false)
  })
  it('erweitern: 20 % je Seite; kleines Verschieben bleibt im erweiterten Ausschnitt', () => {
    const a = box(46.9, 7.4, 47.0, 7.5), x = erweitern(a)
    expect(x.s).toBeCloseTo(46.88); expect(x.n).toBeCloseTo(47.02); expect(x.w).toBeCloseTo(7.38); expect(x.e).toBeCloseTo(7.52)
    expect(enthaelt(x, box(46.915, 7.415, 47.015, 7.515))).toBe(true)     // um 15 % verschoben
    expect(enthaelt(x, box(46.93, 7.43, 47.03, 7.53))).toBe(false)        // um 30 % verschoben
    expect(erweitern(box(89.9, 0, 90, 1)).n).toBe(90)
  })
  it('imCache: Treffer ans Ende, sonst null', () => {
    const c = [eintrag(box(0, 0, 1, 1), [1]), eintrag(box(5, 5, 6, 6), [2])]
    expect(imCache(c, box(0.2, 0.2, 0.8, 0.8))!.map(e => e.daten[0].id)).toEqual([2, 1])
    expect(imCache(c, box(5.2, 5.2, 5.8, 5.8))).toBe(c)
    expect(imCache(c, box(0.5, 0.5, 1.5, 1.5))).toBeNull()
    expect(imCache([], box(0, 0, 1, 1))).toBeNull()
  })
  it('aufnehmen: enthaltene alte fallen weg, höchstens max Einträge', () => {
    let c = [eintrag(box(0, 0, 1, 1), [1]), eintrag(box(5, 5, 6, 6), [2])]
    c = aufnehmen(c, eintrag(box(-1, -1, 2, 2), [1, 3]))
    expect(c.map(e => e.daten.map(d => d.id))).toEqual([[2], [1, 3]])
    for (let i = 0; i < 5; i++) c = aufnehmen(c, eintrag(box(10 + i, 10, 10.5 + i, 11), [100 + i]), 3)
    expect(c.map(e => e.daten[0].id)).toEqual([102, 103, 104])
  })
  it('vereinigen: nach id ohne Doppel, der neuere Eintrag gilt', () => {
    const v = vereinigen([eintrag(box(0, 0, 1, 1), [1, 2], 'alt'), eintrag(box(0.5, 0, 2, 1), [2, 3], 'neu')])
    expect(v.map(x => `${x.id}${x.tag}`).sort()).toEqual(['1alt', '2neu', '3neu'])
  })
  it('Strassennamen: mit den Ausschnitten aufgenommen und verdrängt, nach Weg-id ohne Doppel', () => {
    const e = (b: Box, ids: number[], namen: number[]): CacheEintrag<{ id: number }, { id: number; name: string }> =>
      ({ box: b, daten: ids.map(id => ({ id })), namen: namen.map(id => ({ id, name: `W${id}` })) })
    let c = [e(box(0, 0, 1, 1), [1], [100, 101]), e(box(5, 5, 6, 6), [2], [101, 102])]
    expect(vereinigenNamen(c).map(n => n.id).sort()).toEqual([100, 101, 102])
    c = aufnehmen(c, e(box(10, 10, 11, 11), [3], [103]), 2)              // ältester Ausschnitt fällt weg, seine Namen auch
    expect(vereinigenNamen(c).map(n => n.id).sort()).toEqual([101, 102, 103])
    const ohne: CacheEintrag<{ id: number }, { id: number }>[] = [{ box: box(0, 0, 1, 1), daten: [] }]
    expect(vereinigenNamen(ohne)).toEqual([])
  })
  it('flaecheKm2: 0,01° × 0,01° bei 47° N rund 0,85 km²', () => {
    expect(flaecheKm2(box(46.995, 7.4, 47.005, 7.41))).toBeCloseTo(1.1132 * 1.1132 * Math.cos(47 * Math.PI / 180), 3)
  })
  it('abfrageBox: voller Rand bei kleiner Sicht, gekürzt bis zur Zielfläche, ohne Rand bei grosser Sicht', () => {
    const klein = box(46.95, 7.43, 46.96, 7.445)                     // rund 1,3 km²
    expect(abfrageBox(klein)).toEqual(erweitern(klein))
    const mittel = box(46.94, 7.42, 46.955, 7.445)                   // rund 3,2 km²: Rand nur bis 4 km²
    const m = abfrageBox(mittel)
    expect(flaecheKm2(m)).toBeCloseTo(ABFRAGE_ZIEL_KM2, 5)
    expect(enthaelt(m, mittel)).toBe(true)
    const gross = box(46.93, 7.40, 46.95, 7.44)                      // rund 6,8 km²
    expect(abfrageBox(gross)).toEqual(gross)
    expect(zuGross(gross)).toBe(false)
    expect(zuGross(box(46.9, 7.4, 46.95, 7.45))).toBe(true)          // rund 21 km²
  })
})
