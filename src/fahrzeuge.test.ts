// Fahrzeuge und wartende Personen auf der Karte (27.10.2026, fahrzeuge.ts): Trottoirüberfahrt mit den Fahrzeugen der Knotensicht,
// Fussgängerstreifen mit einem Fahrzeug je gerade Zufahrt und einer Person je Streifenende. Künstliche Strassen wie tue/knotensicht.test.tsx.
import { describe, expect, it } from 'vitest'
import { wgs, dist, type P } from './geo'
import { osmParsen } from './daten/osm'
import { avParsen, type GeoJson } from './daten/av'
import { rechneFall } from './rechner'
import { leererFall, type Fall } from './fall'
import { knotensichtAnfuegen } from './tue/knotensicht'
import { fgsFahrzeuge, geradeZufahrt, tueFahrzeuge, WARTE_HINTER_RAND_M } from './fahrzeuge'
import { LENKER_VOR_FRONT_M, PW_LAENGE_M } from './knotensicht/rechner/fahrzeug'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number) => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const weg = (id: number, pts: [number, number, number][], tags: Record<string, string>) =>
  ({ type: 'way', id, tags, nodes: pts.map(p => p[0]), geometry: pts.map(p => { const [lat, lon] = ll(p[1], p[2]); return { lat, lon } }) })
const OSM_ROH = { elements: [
  weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
  weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
const flaeche = (art: string, ring: P[]) => ({ properties: { Art: art, Kanton: 'BE', Qualitaet: 'AV93', BFSNr: null },
  geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const AV: GeoJson = { features: [
  flaeche('Strasse_Weg', [lv(-300, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), lv(-37, -4), lv(300, -4), lv(300, 4), lv(-300, 4)]),
  flaeche('Trottoir', rechteck(-300, 4, 300, 7)), flaeche('Trottoir', rechteck(-300, -7, -43, -4)), flaeche('Trottoir', rechteck(-37, -7, 300, -4))] }
const REST = { park: null, vsig: null, avZentrum: lv(-40, -4), avRadius: 150, hoehen: null }
function rechnen(fall: Fall) {
  const r = rechneFall(osmParsen(OSM_ROH), avParsen(AV), [], null, fall, null, null, null, null)
  knotensichtAnfuegen(r, { osm: OSM_ROH, av: AV }, fall, REST)
  return r
}
const fall = (tue: boolean, p0: P, p1: P): Fall => {
  const [lat, lon] = ll(-40, -4), x = leererFall(lat, lon, null)
  x.streifenHand.push({ id: 'hand-1', p0, p1, breite: 4, herkunft: 'gezeichnet' })
  if (tue) x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' }
  return x
}

describe('Trottoirüberfahrt: Fahrzeuge der Knotensicht', () => {
  const s = rechnen(fall(true, lv(-44, -8), lv(-36, -8))).streifen[0]
  const f = tueFahrzeuge(s)
  it('F_B je Phase (Auge bei D\' und D), F_A je Richtung am Ende von A, Velo auf dem Radstreifen; Autos mit Umriss und Scheibe', () => {
    expect(f.filter(x => x.rolle === 'fb').map(x => x.text)).toEqual(['wartendes Fahrzeug, Auge der Ausfahrenden hinter dem hinteren Rand',
      'wartendes Fahrzeug, Auge der Ausfahrenden hinter dem vorderen Rand'])
    expect(f.filter(x => x.rolle === 'fa' && x.art === 'auto').map(x => x.text)).toEqual(['Fahrzeug am Ende der nötigen Sichtweite, links',
      'Fahrzeug am Ende der nötigen Sichtweite, rechts'])
    expect(f.filter(x => x.rolle === 'fa' && x.art === 'velo').length).toBe(2)
    for (const x of f.filter(y => y.art === 'auto')) { expect(x.umriss).toHaveLength(8); expect(x.scheibe).toHaveLength(4) }
  })
  it('Lenker beim Beobachtungspunkt: F_B der Phase Fahrbahn mit dem Auge bei D (Fahrersitz, rund 0,5 m neben der Achse)', () => {
    const ks = s.knotensicht
    if (!ks || 'fehler' in ks) throw new Error('keine Knotensicht')
    const fbD = f.find(x => x.text === 'wartendes Fahrzeug, Auge der Ausfahrenden hinter dem vorderen Rand')!
    expect(dist(fbD.mitte, ks.karte.D)).toBeLessThan(Math.abs(LENKER_VOR_FRONT_M - PW_LAENGE_M / 2) + 0.6)
  })
  it('über die durchgehende Strasse bzw. ohne Einmündung: keine Fahrzeuge (27.10.2026)', () => {
    const ks0 = s.knotensicht
    if (!ks0 || 'fehler' in ks0) throw new Error('keine Knotensicht')
    expect(tueFahrzeuge({ ...s, knotensicht: { ...ks0, durchgehend: true } })).toEqual([])
    expect(tueFahrzeuge({ ...s, knotensicht: { fehler: 'kein Knoten', ohneZufahrt: true } })).toEqual([])
  })
  it('kein Fahrzeug der Knotensicht ohne Trottoirüberfahrt; keine Personen und Fahrzeuge des Fussgängerstreifens an der Überfahrt', () => {
    expect(fgsFahrzeuge(s)).toEqual([])
    const fgs = rechnen(fall(false, lv(-44, -8), lv(-36, -8))).streifen[0]
    expect(tueFahrzeuge(fgs)).toEqual([])
  })
})

describe('Fussgängerstreifen: Fahrzeug je gerade Zufahrt, Person je Streifenende', () => {
  // Streifen über die Hauptstrasse (Gegenverkehr): zwei gerade Zufahrten
  const s = rechnen(fall(false, lv(100, -6), lv(100, 6))).streifen[0]
  const f = fgsFahrzeuge(s)
  it('ein Auto je gerade Zufahrt mit dem Auge auf dem letzten Sichtpunkt, Richtung zum Streifen; Tooltip mit der Sichtweite', () => {
    const gerade = s.zufahrten.filter(geradeZufahrt)
    expect(gerade.length).toBe(2)
    const autos = f.filter(x => x.rolle === 'zufahrt')
    expect(autos.map(x => x.zufahrt).sort()).toEqual(gerade.map(z => `${z.fgsId}|${z.zufahrt}`).sort())
    for (const z of gerade) {
      const a = autos.find(x => x.zufahrt === `${z.fgsId}|${z.zufahrt}`)!
      expect(a.auge).toEqual(z.sichtpunkte[z.sichtpunkte.length - 1])
      // fährt auf den Streifen zu: die Front liegt näher am Streifen als das Auge
      const front: P = [a.mitte[0] + a.richtung[0] * PW_LAENGE_M / 2, a.mitte[1] + a.richtung[1] * PW_LAENGE_M / 2]
      expect(dist(front, s.m)).toBeLessThan(dist(a.auge!, s.m))
      expect(a.text).toBe(`Fahrzeug am Sichtpunkt, ${z.sichtweite.toFixed(1).replace('.', ',')} m vor dem Streifen`)
    }
  })
  it('eine wartende Person je Streifenende, 0,6 m hinter der Bordkante', () => {
    const p = f.filter(x => x.art === 'person')
    expect(p.length).toBe(2)
    expect(p.every(x => x.text === 'Wartende Person')).toBe(true)
    for (const x of p) expect(Math.min(...s.rand.map(r => dist(r, x.mitte)))).toBeCloseTo(WARTE_HINTER_RAND_M, 1)
  })
})
