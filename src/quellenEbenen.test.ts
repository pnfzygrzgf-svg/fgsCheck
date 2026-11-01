import { describe, expect, it } from 'vitest'
import { ebenenAusGeo, ebenenSichtbar, tempoKlasse, dtvKlasse } from './quellenEbenen'
import type { OsmWeg } from './daten/osm'

const weg = (id: number, tags: Record<string, string>): OsmWeg => ({ id, tags, knoten: [1, 2], geom: [[46.95, 7.44], [46.95, 7.441]] })

describe('quellenEbenen', () => {
  it('gleiche Farbstufen wie VeloroutenCheck', () => {
    expect([20, 30, 50, 80].map(tempoKlasse)).toEqual(['t20', 't30', 't50', 't60'])
    expect([1500, 4000, 25000].map(dtvKlasse)).toEqual(['d2', 'd5', 'd99'])
  })
  it('Tempo: amtlich vor OSM; ohne amtliche Linien OSM maxspeed gestrichelt', () => {
    const osm = ebenenAusGeo({}, [weg(1, { highway: 'residential', maxspeed: '30' }), weg(2, { highway: 'service' })])
    expect(osm.tempo!.map(o => [o.klasse, o.gestrichelt])).toEqual([['t30', true]])
    const amtlich = ebenenAusGeo({ vsig: { linien: [{ id: 'a', strasse: 'X', vSig: 50, teile: [[[0, 0], [10, 0]]] }], bereich: { mitte: [0, 0], radiusM: 100, form: 'quadrat' } } },
      [weg(1, { maxspeed: '30' })])
    expect(amtlich.tempo!.map(o => o.klasse)).toEqual(['t50'])
  })
  it('Strassentyp nach OSM highway, Beleuchtung aus lit, Menü nur mit Daten', () => {
    const d = ebenenAusGeo({}, [weg(1, { highway: 'tertiary', lit: 'yes' })])
    expect(d.strassentyp!.map(o => o.klasse)).toEqual(['verbindung'])
    expect(d.beleuchtung!.map(o => o.klasse)).toEqual(['lit'])
    const { zeigen, ohne } = ebenenSichtbar(d)
    expect(zeigen.map(e => e.id)).toEqual(['strassentyp', 'beleuchtung'])
    expect(ohne.map(e => e.id)).toContain('dtv')
  })
  it('Profile der Längsneigung mit Wert, Brücken als Fläche', () => {
    const d = ebenenAusGeo({}, [], [{ key: 'k', linie: [[0, 0], [50, 0]], i: -3.4, laenge: 50, zufahrt: 'Fahrlinie' }], [[[0, 0], [5, 0], [5, 5]]])
    expect(d.steigung!.map(o => [o.klasse, o.wert])).toEqual([['n2', '-3,4 %']])
    expect(d.bruecken!.length).toBe(1)
  })
})
