import { describe, expect, it } from 'vitest'
import { autoUmriss, autoScheibe, fbLage, faLage, PW_LAENGE_M, PW_BREITE_M, LENKER_VOR_FRONT_M } from './fahrzeug'
import type { P } from '../geo'

const xs = (r: P[]) => r.map(p => p[0]), ys = (r: P[]) => r.map(p => p[1])

describe('Fahrzeug-Umriss', () => {
  it('Auto nach Osten: Länge in x, Breite in y, 8 Punkte', () => {
    const r = autoUmriss([2600000, 1200000], [1, 0])
    expect(r).toHaveLength(8)
    expect(Math.max(...xs(r)) - Math.min(...xs(r))).toBeCloseTo(PW_LAENGE_M, 6)
    expect(Math.max(...ys(r)) - Math.min(...ys(r))).toBeCloseTo(PW_BREITE_M, 6)
    expect(Math.max(...xs(r))).toBeCloseTo(2600000 + PW_LAENGE_M / 2, 6)
  })
  it('Auto nach Norden: Länge in y', () => {
    const r = autoUmriss([0, 0], [0, 5])              // Richtung wird normiert
    expect(Math.max(...ys(r)) - Math.min(...ys(r))).toBeCloseTo(PW_LAENGE_M, 6)
    expect(Math.max(...xs(r)) - Math.min(...xs(r))).toBeCloseTo(PW_BREITE_M, 6)
  })
  it('Scheibe liegt im vorderen Drittel', () => {
    const s = autoScheibe([0, 0], [1, 0])
    expect(Math.min(...xs(s))).toBeGreaterThan(0)
    expect(Math.max(...xs(s))).toBeLessThan(PW_LAENGE_M / 2)
  })
})

describe('Lage der Fahrzeuge', () => {
  it('FB: Front 2,0 m vor Dachse, also B − 2,0 m hinter der Kante; fährt auf die Kante zu', () => {
    const Dachse: P = [0, -3], rand: P = [0, 0]      // B = 3 m nach Norden
    const [m, u] = fbLage(Dachse, rand)
    expect(u[0]).toBeCloseTo(0, 9); expect(u[1]).toBeCloseTo(1, 9)
    const front = m[1] + PW_LAENGE_M / 2
    expect(front).toBeCloseTo(-3 + LENKER_VOR_FRONT_M, 9)   // -1,0 m: 1 m hinter der Kante
  })
  it('FA: Front bei A, fährt auf K zu', () => {
    const pts: P[] = Array.from({ length: 30 }, (_, i) => [i, 1.5])   // Achse nach Osten ab K = [0, 1.5]
    const l = faLage(pts, 20)
    expect(l).not.toBeNull()
    const [m, u] = l!
    expect(u[0]).toBeCloseTo(-1, 9)                     // Richtung West, auf K zu
    expect(m[0] + u[0] * PW_LAENGE_M / 2).toBeCloseTo(20, 9)   // Front (in Fahrtrichtung) bei x = 20
    expect(faLage(pts, 0)).toBeNull()
    expect(faLage(pts, 30)).toBeNull()
  })
})
