import { describe, expect, it } from 'vitest'
import { lv95, wgs, bboxLv95, geradeSchnitte, imPolygon, dreieckTrifftPolygon, winkelGrad, type P } from './geo'

describe('LV95 ↔ WGS84', () => {
  it('bboxLv95: ±radiusM um den Ort in LV95, auf den Meter, mit KBS (WFS-Abfrage)', () => {
    const [la, lo] = wgs(2600000.4, 1200000.4)
    expect(bboxLv95(la, lo, 150)).toBe('2599850,1199850,2600150,1200150,urn:ogc:def:crs:EPSG::2056')
    const [la2, lo2] = wgs(2601234, 1201000)
    expect(bboxLv95(la2, lo2, 10)).toBe('2601224,1200990,2601244,1201010,urn:ogc:def:crs:EPSG::2056')
  })
  it('trifft das Rechenbeispiel von swisstopo (46°2\'38.87", 8°43\'49.79") auf rund 1 m', () => {
    const [e, n] = lv95(46 + 2 / 60 + 38.87 / 3600, 8 + 43 / 60 + 49.79 / 3600)
    expect(Math.abs(e - 2700000)).toBeLessThan(1)
    expect(Math.abs(n - 1100000)).toBeLessThan(1)
  })
  it('Nullpunkt Bern (alte Sternwarte) liegt bei 2 600 000 / 1 200 000', () => {
    const [e, n] = lv95(46.9510811, 7.4386372)
    expect(Math.abs(e - 2600000)).toBeLessThan(2)
    expect(Math.abs(n - 1200000)).toBeLessThan(2)
  })
  it('wgs() ist die Umkehrung von lv95() auf wenige Millimeter (Höhe 0 je Richtung, wie PROJ in 2D)', () => {
    for (const [e, n] of [[2599515, 1198997], [2683000, 1248000], [2500000, 1118000]] as P[]) {
      const [la, lo] = wgs(e, n)
      const [e2, n2] = lv95(la, lo)
      expect(Math.abs(e2 - e)).toBeLessThan(0.005)
      expect(Math.abs(n2 - n)).toBeLessThan(0.005)
    }
  })
  it('streng wie GDAL/PROJ (EPSG:4326 -> 2056): öffentlicher OSM-Knoten auf 1 cm', () => {
    // OSM-Knoten 3920933 (WGS84 auf 7 Stellen); Vergleichswert mit GDAL 3 gerechnet (2 Stellen)
    const [e, n] = lv95(46.9477498, 7.4400073)
    expect(Math.abs(e - 2600104.67)).toBeLessThan(0.01)
    expect(Math.abs(n - 1199629.47)).toBeLessThan(0.01)
  })
})

describe('ebene Geometrie', () => {
  const quadrat: P[] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
  it('Punkt im Polygon mit Loch', () => {
    const loch: P[] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
    expect(imPolygon([2, 2], [quadrat, loch])).toBe(true)
    expect(imPolygon([5, 5], [quadrat, loch])).toBe(false)
    expect(imPolygon([11, 5], [quadrat])).toBe(false)
  })
  it('Schnitte einer Geraden mit dem Rand', () => {
    expect(geradeSchnitte([5, 5], [0, 1], [quadrat])).toEqual([-5, 5])
  })
  it('Dreieck trifft Polygon', () => {
    expect(dreieckTrifftPolygon([[-5, 5], [-1, 4], [-1, 6]], [quadrat])).toBe(false)
    expect(dreieckTrifftPolygon([[-5, 5], [1, 4], [1, 6]], [quadrat])).toBe(true)
    expect(dreieckTrifftPolygon([[-5, 5], [15, 4], [15, 6]], [quadrat])).toBe(true)   // quer durch, keine Ecke innen
  })
  it('Winkel: Ost 0°, Nord 90°, West 180°', () => {
    expect(winkelGrad([1, 0])).toBe(0)
    expect(winkelGrad([0, 1])).toBe(90)
    expect(winkelGrad([-1, 0])).toBe(180)
  })
})
