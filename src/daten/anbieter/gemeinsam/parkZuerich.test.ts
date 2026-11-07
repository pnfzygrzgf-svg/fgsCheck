import { describe, expect, it } from 'vitest'
import type { P } from '../../../geo'
import { ringFlaeche } from '../../../rechner/poly'
import type { Vorschlag } from '../../../rechner/vorschlaege'
import { parkQuelleAmOrt } from '../../parkLuzern'
import { istZhParkId, zhParkFelder, zhParkUrl, zhParkVorschlaege } from './parkZuerich'

const CRS = { properties: { name: 'urn:ogc:def:crs:EPSG::2056' } }
const punkt = (objectid: number, p: P, davnr: string, orientierung = 'LPU', art = 'Standard') => ({ geometry: { type: 'MultiPoint', coordinates: [p] },
  properties: { objectid, davnr, orientierung, art, bezeichnung: 'Beatengasse', parkfeldnummer: objectid } })
const linie = (objectid: number, l: P[], typ = 'Blaue Zone') => ({ geometry: { type: 'MultiLineString', coordinates: [l] }, properties: { objectid, typ, laenge: 22.7 } })
const O: P = [2683000, 1248000]
const bei = (x: number, y: number): P => [O[0] + x, O[1] + y]
const mass = (ring: P[]) => [Math.hypot(ring[0][0] - ring[1][0], ring[0][1] - ring[1][1]), Math.hypot(ring[1][0] - ring[2][0], ring[1][1] - ring[2][1])]

describe('Parkfelder Stadt Zürich', () => {
  it('fragt den WFS in LV95 ab', () => {
    const u = zhParkUrl('oeff_strassenparkierung_dav_p', O, 150)
    expect(u).toContain('www.ogd.stadt-zuerich.ch/wfs/geoportal/oeffentlich_zugaengliche_Parkplaetze_DAV')
    expect(u).toContain('SRSNAME=EPSG:2056')
    expect(u).toContain('BBOX=2682850,1247850,2683150,1248150,EPSG:2056')
  })
  it('richtet ein Feld am Nachbarn derselben Reihe aus; die Anordnung gibt die Masse', () => {
    const f = zhParkFelder({ crs: CRS, features: [punkt(1, bei(0, 0), '1.5'), punkt(2, bei(5.8, 0), '1.5')] }, { crs: CRS, features: [] })
    expect(f.map(x => x.id)).toEqual(['zhpark:p:1:0', 'zhpark:p:2:0'])
    expect(mass(f[0].ring)).toEqual([5, 2])
    expect(Math.min(...f[0].ring.map(p => p[0]))).toBeCloseTo(O[0] - 2.5)
    expect(f[0].name).toBe('Parkfeld Standard, Beatengasse, Feld 1')
    const quer = zhParkFelder({ crs: CRS, features: [punkt(3, bei(0, 0), '2', 'QPU'), punkt(4, bei(2.4, 0), '2', 'QPU')] }, { crs: CRS, features: [] })
    expect(mass(quer[0].ring)).toEqual([2.5, 5])
    expect(Math.max(...quer[0].ring.map(p => p[1]))).toBeCloseTo(O[1] + 2.5)
  })
  it('ohne Nachbar ist die Richtung unbekannt: Quadrat von 2 × 2 m; fremde Reihe und grosser Abstand zählen nicht', () => {
    const f = zhParkFelder({ crs: CRS, features: [punkt(1, bei(0, 0), '1'), punkt(2, bei(5, 0), '2'), punkt(3, bei(40, 0), '1')] }, { crs: CRS, features: [] })
    for (const x of f) expect(Math.abs(ringFlaeche(x.ring))).toBeCloseTo(4)
  })
  it('Linien werden Streifen von 2 m', () => {
    const [f] = zhParkFelder({ crs: CRS, features: [] }, { crs: CRS, features: [linie(5, [bei(0, 0), bei(20, 0)])] })
    expect(f.id).toBe('zhpark:l:5:0')
    expect(f.klasse).toBe('auto')
    expect(Math.abs(ringFlaeche(f.ring))).toBeCloseTo(40)
    expect(f.name).toBe('Parkierung Blaue Zone, 22,7 m')
  })
  it('lehnt Antworten ausserhalb von LV95 ab', () => {
    expect(() => zhParkFelder({ crs: { properties: { name: 'EPSG:4326' } }, features: [] }, { features: [] })).toThrow('LV95')
  })
  it('ist keine Parkquelle der Rechnung: In Zürich bleibt der Eingang «park» leer', () => {
    expect(parkQuelleAmOrt([261])).toBeNull()
    expect(parkQuelleAmOrt([1061])).not.toBeNull()
  })
  it('zeigt nur offene Vorschläge und sagt, dass sie erst bestätigt zählen', () => {
    const h = (id: string): Vorschlag => ({ id, grund: 'x', hindernis: { id, art: 'parkfeld', klasse: 'auto', ring: [bei(0, 0), bei(1, 0), bei(1, 1)], quelle: 'kataster' } })
    const offen = zhParkVorschlaege([h('zhpark:p:1:0'), h('zhpark:p:2:0'), h('zhpark:p:3:0')], [{ id: 'zhpark:p:1:0' }], { 'zhpark:p:2:0': 'verworfen' })
    expect(offen.map(v => v.id)).toEqual(['zhpark:p:3:0'])
    expect(offen[0].grund).toContain('zählt erst nach Bestätigung')
    expect(istZhParkId('zhpark:p:3:0')).toBe(true)
    expect(istZhParkId('bernpark:Parkfeld:1:0')).toBe(false)
  })
})
