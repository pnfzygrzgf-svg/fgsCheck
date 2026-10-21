// Tests Geometrie-Hilfen für die Vorbelegung aus Geodaten (Automatik Paket C): Punkt in Fläche, Abstand Punkt–Linie, Schnitt mit
// einer Achse, nächste Linie, Zuschneiden. Künstliche Geometrie in LV95 um einen festen Ursprung.
import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import { inFlaeche, flaecheAmPunkt, naechsterPunkt, abstandLinie, abstandFlaeche, achsSchnitte, naechsteLinie, linienImUmkreis,
  zuschneiden } from './geoHilfen'

const O: P = [2600000, 1200000]
const p = (x: number, y: number): P => [O[0] + x, O[1] + y]
const quadrat = (x0: number, y0: number, s: number): P[] => [p(x0, y0), p(x0 + s, y0), p(x0 + s, y0 + s), p(x0, y0 + s), p(x0, y0)]

describe('Geometrie-Hilfen: Flächen', () => {
  const mitLoch = [quadrat(0, 0, 100), quadrat(40, 40, 20)]
  it('Punkt in Fläche mit Loch (Gerade-Ungerade-Regel); erste Fläche am Punkt', () => {
    expect(inFlaeche(p(10, 10), mitLoch)).toBe(true)
    expect(inFlaeche(p(50, 50), mitLoch)).toBe(false)
    expect(inFlaeche(p(150, 50), mitLoch)).toBe(false)
    const fl = [{ id: 'a', ringe: [quadrat(200, 0, 10)] }, { id: 'b', ringe: mitLoch }]
    expect(flaecheAmPunkt(p(5, 5), fl)?.id).toBe('b')
    expect(flaecheAmPunkt(p(50, 50), fl)).toBeNull()
  })
  it('Abstand zum Rand: 0 im Innern, sonst zur nächsten Kante (auch zum Loch hin)', () => {
    expect(abstandFlaeche(p(10, 10), mitLoch)).toBe(0)
    expect(abstandFlaeche(p(130, 50), mitLoch)).toBeCloseTo(30, 9)
    expect(abstandFlaeche(p(50, 50), mitLoch)).toBeCloseTo(10, 9)
    expect(abstandFlaeche(p(0, 0), [])).toBe(Infinity)
  })
})

describe('Geometrie-Hilfen: Linien', () => {
  const teile = [[p(0, 0), p(100, 0)], [p(0, 50), p(0, 80), p(30, 80)]]
  it('nächster Punkt und Abstand über alle Teile; ohne Segment Infinity bzw. null', () => {
    const n = naechsterPunkt(p(50, 10), teile)!
    expect(n.d).toBeCloseTo(10, 9)
    expect([n.q[0] - O[0], n.q[1] - O[1]]).toEqual([50, 0])
    expect([n.teil, n.seg]).toEqual([0, 0])
    expect(naechsterPunkt(p(20, 90), teile)).toMatchObject({ teil: 1, seg: 1 })
    expect(abstandLinie(p(-5, 60), teile)).toBeCloseTo(5, 9)
    expect(abstandLinie(p(0, 0), [])).toBe(Infinity)
    expect(abstandLinie(p(0, 0), [[p(1, 1)]])).toBe(Infinity)
    expect(naechsterPunkt(p(0, 0), [])).toBeNull()
  })
  it('nächste Linie mit Höchstabstand; Linien im Umkreis nach Abstand', () => {
    const linien = [{ id: 'fern', teile: [[p(0, 40), p(100, 40)]] }, { id: 'nah', teile: [[p(0, 5), p(100, 5)]] }]
    expect(naechsteLinie(p(50, 0), linien)).toMatchObject({ linie: { id: 'nah' }, d: 5 })
    expect(naechsteLinie(p(50, 0), linien, 4)).toBeNull()
    expect(linienImUmkreis(p(50, 0), linien, 50).map(x => [x.linie.id, x.d])).toEqual([['nah', 5], ['fern', 40]])
    expect(linienImUmkreis(p(50, 0), linien, 10).map(x => x.linie.id)).toEqual(['nah'])
  })
})

describe('Geometrie-Hilfen: Schnitt mit einer Achse', () => {
  const a = p(0, 0), b = p(0, 8)                       // Achse (z. B. Streifen) 8 m nach Norden
  it('senkrechte Linie bei t = 0,25 (90°), schräge bei 45°; nach t sortiert', () => {
    const s = achsSchnitte([[p(-10, -6), p(10, 14)], [p(-10, 2), p(10, 2)]], a, b)
    expect(s.map(x => Math.round(x.t * 1000) / 1000)).toEqual([0.25, 0.5])
    expect(s[0].winkel).toBeCloseTo(90, 9)
    expect(s[1].winkel).toBeCloseTo(45, 9)
    expect(s[0].p[1] - O[1]).toBeCloseTo(2, 9)
  })
  it('Verlängerung findet Linien vor bzw. hinter der Achse (t < 0 bzw. > 1); ohne Verlängerung nicht', () => {
    const l = [[p(-5, -3), p(5, -3)], [p(-5, 10), p(5, 10)]]
    expect(achsSchnitte(l, a, b)).toEqual([])
    expect(achsSchnitte(l, a, b, 5).map(x => Math.round(x.t * 1000) / 1000)).toEqual([-0.375, 1.25])
  })
  it('Stützpunkt genau auf der Achse zählt einmal; Achse ohne Länge: keine Schnitte', () => {
    expect(achsSchnitte([[p(-5, 4), p(0, 4), p(5, 4)]], a, b).length).toBe(1)
    expect(achsSchnitte([[p(-5, 4), p(5, 4)]], a, a)).toEqual([])
  })
})

describe('Geometrie-Hilfen: Zuschneiden', () => {
  it('Segmente, die das Quadrat berühren, bleiben; Lücken trennen die Teile; ganz ausserhalb entfällt', () => {
    const z = zuschneiden([[p(-500, 0), p(-300, 0), p(-100, 0), p(100, 0), p(300, 0), p(300, 500), p(0, 500), p(0, 100), p(0, 50)],
      [p(1000, 1000), p(1100, 1000)]], O, 150)
    expect(z.map(t => t.map(q => [q[0] - O[0], q[1] - O[1]]))).toEqual([
      [[-300, 0], [-100, 0], [100, 0], [300, 0]],
      [[0, 500], [0, 100], [0, 50]],
    ])
  })
})
