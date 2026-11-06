// Knoten nahe einer Querung: Ziel des Links in den SichtweitenCheck
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import { knotenAmStreifen, netzAusRoh } from './knotenAmStreifen'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number) => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const weg = (id: number, pts: [number, number, number][], tags: Record<string, string>) =>
  ({ type: 'way', id, tags, nodes: pts.map(p => p[0]), geometry: pts.map(p => { const [lat, lon] = ll(p[1], p[2]); return { lat, lon } }) })
const ROH = { elements: [
  weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse' }),
  weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg' }),
  weg(3, [[12, 0, 0], [21, 0, -200]], { highway: 'residential', name: 'Seitenweg' })] }

describe('knotenAmStreifen', () => {
  const netz = netzAusRoh(ROH)!
  it('findet den Knoten nahe der Achse', () => {
    expect(knotenAmStreifen(netz, [{ p0: lv(-44, -8), p1: lv(-36, -8) }])).toMatchObject([{ id: 11 }])
  })
  it('zwei Knoten bleiben eine Auswahl, der nächste zuerst', () => {
    expect(knotenAmStreifen(netz, [{ p0: lv(-14, -4), p1: lv(-24, 4) }]).map(k => k.id)).toEqual([12, 11])
  })
  it('weit weg: kein Knoten', () => {
    expect(knotenAmStreifen(netz, [{ p0: lv(150, -4), p1: lv(150, 4) }])).toEqual([])
  })
  it('unbrauchbare Daten: kein Netz', () => {
    expect(netzAusRoh(null)).toBeNull()
  })
})
