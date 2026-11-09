import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz } from './netz'
import { HindernisDaten, linieTrifft, type Hindernis } from './hindernisse'
import { parkMasse, parkPruefflaechen, parkRegel, parkDarstellung, parkMitAnordnung, parkAnordnungLesen } from './parkgeometrie'

const o: P = [2600000, 1200000]
const p = (x: number, y: number): P => [o[0] + x, o[1] + y]
const ring = (y: number, b: number): P[] => [p(0, y), p(12, y), p(12, y + b), p(0, y + b)]
const av = (kanton = 'BE'): AvFlaeche[] => [{ art: 'Strasse_Weg', kanton, bfs: kanton === 'BE' ? 351 : 261,
  qualitaet: 'AV93', ringe: [[p(-50, -20), p(50, -20), p(50, 20), p(-50, 20)]] }]
function netzAus(a: P, b: P) {
  const daten = { wege: [{ id: 1, knoten: [1, 2], geom: [wgs(...a), wgs(...b)], tags: { highway: 'residential' } }],
    tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [] }
  return new OsmNetz(daten)
}
const netz = netzAus(p(-40, 0), p(40, 0))
const feld = (r = ring(3, 1.6)): Extract<Hindernis, { art: 'parkfeld' }> => ({ id: 'kat:1', art: 'parkfeld', klasse: 'auto', quelle: 'kataster', ring: r })
const breite = (h: Hindernis) => parkMasse((h as Extract<Hindernis, { art: 'parkfeld' }>).ring)!.breite

describe('gemeinsame Parkplatz-Prüfflächen', () => {
  it.each(['BE', 'ZH', 'LU'])('%s: ergänzt nur zur Fahrbahn hin; Quelle, Länge und äusserer Rand bleiben erhalten', kanton => {
    const h = feld(), original = structuredClone(h), soll = kanton === 'ZH' ? 2 : 1.9
    const [neu] = parkPruefflaechen([h], av(kanton), netz)
    expect(h).toEqual(original)
    expect(breite(neu)).toBeCloseTo(soll, 7)
    if (neu.art !== 'parkfeld') throw Error('Typ')
    expect(Math.max(...neu.ring.map(q => q[1]))).toBeCloseTo(o[1] + 4.6, 7)
    expect(Math.min(...neu.ring.map(q => q[1]))).toBeCloseTo(o[1] + 4.6 - soll, 7)
    expect(parkMasse(neu.ring)!.laenge).toBeCloseTo(12, 7)
    expect(neu.parkPruefung?.original).toEqual(original.art === 'parkfeld' ? original.ring : [])
    expect(neu.parkPruefung?.status).toBe('ergaenzt')
    expect(parkPruefflaechen([neu], av(kanton), netz)).toEqual([neu])
  })
  it('gleiche Wirkung ausserhalb des Katasterumrisses: Hindernisabstand, Schnitt und Darstellungsgeometrie', () => {
    const h = feld(), [neu] = parkPruefflaechen([h], av(), netz), punkt = p(6, 2.85), linie = [p(1, 2.85), p(11, 2.85)]
    expect(new HindernisDaten([h]).park.trifft(punkt, 0)).toBe(false)
    const d = new HindernisDaten([neu])
    expect(d.park.trifft(punkt, 0)).toBe(true)
    expect(linieTrifft(linie, [d.park.felder[0].poly])).toBe(true)
    expect(parkDarstellung([h], [neu])).toEqual([neu])
    expect(parkDarstellung([h], [])).toEqual([]) // vollständig durch Plan-Seitenraum ersetzt
  })
  it('funktioniert auf beiden Strassenseiten und bei umgekehrtem Ringsinn', () => {
    const [neu] = parkPruefflaechen([feld([...ring(-4.6, 1.6)].reverse())], av(), netz)
    expect(breite(neu)).toBeCloseTo(1.9, 7)
    if (neu.art === 'parkfeld') {
      expect(Math.min(...neu.ring.map(q => q[1]))).toBeCloseTo(o[1] - 4.6, 7)
      expect(Math.max(...neu.ring.map(q => q[1]))).toBeCloseTo(o[1] - 2.7, 7)
    }
  })
  it('breitere Felder, Handgeometrie und Zweiradflächen bleiben unverändert', () => {
    const breit = feld(ring(3, 2.3)), hand = { ...feld(), quelle: 'hand' as const }, velo = { ...feld(), klasse: 'velo' as const }
    const neu = parkPruefflaechen([breit, hand, velo] as Hindernis[], av(), netz)
    expect(breite(neu[0])).toBeCloseTo(2.3, 7)
    expect(neu[1]).toBe(hand); expect(neu[2]).toBe(velo)
  })
  it('Parkverbotsfeld: gleiche Mindestbreite und Wirkung wie Auto-Parkierung, Original und Bezeichnung bleiben erhalten', () => {
    const h = { ...feld(), id: 'bernpark:Parkverbot:1:0', name: 'Parkverbotsfeld, Nr. 1' } as Hindernis
    const [neu] = parkPruefflaechen([h], av(), netz)
    expect(breite(neu)).toBeCloseTo(1.9, 7)
    expect(neu.art === 'parkfeld' && neu.parkPruefung?.original).toEqual(h.art === 'parkfeld' && h.ring)
    expect(neu.art === 'parkfeld' && neu.parkPruefung?.status).toBe('ergaenzt')
    const d = new HindernisDaten([neu])
    expect(d.park.trifft(p(6, 3.5), 0)).toBe(true)
    expect(d.park.trifft(p(6, 2.85), 0)).toBe(true)
    expect(neu.name).toContain('Parkverbotsfeld')
  })
  it('ohne Strassenbezug, bei Querparkierung und bei Strassenachse innerhalb des Felds: keine geratene Ergänzung', () => {
    const quer = feld([p(3, 0), p(4.6, 0), p(4.6, 12), p(3, 12)])
    for (const [h, n] of [[feld(), null], [quer, netz], [feld(ring(-0.8, 1.6)), netz]] as const) {
      const [neu] = parkPruefflaechen([h], av(), n)
      expect(neu.art === 'parkfeld' && neu.ring).toEqual(h.art === 'parkfeld' && h.ring)
      expect(neu.art === 'parkfeld' && neu.parkPruefung?.status).toBe('unklar')
    }
  })
  it('echtes Katasterpolygon 1950: auch die schmalere Stirnseite erreicht 1,90 m, statt nur die Rahmenbreite', () => {
    const r: P[] = [[2599443.5912,1199037.2787],[2599445.0639,1199036.6636],[2599451.1389,1199051.5526],[2599449.6977,1199052.1426]]
    const m = parkMasse(r)!
    expect(m.breite).toBeGreaterThan(1.55); expect(m.breite).toBeLessThan(1.6)
    // Strassenachse parallel zum Feld, 4 m auf der Fahrbahnseite; keine Netz-/Höhenabfragen im Test.
    const a: P = [r[1][0] + 4 * m.achse[1], r[1][1] - 4 * m.achse[0]], b: P = [a[0] + 30 * m.achse[0], a[1] + 30 * m.achse[1]]
    const n = netzAus(a, b)
    const [neu] = parkPruefflaechen([feld(r)], av(), n)
    expect(breite(neu)).toBeGreaterThanOrEqual(1.9 - 1e-6)
  })
  it('Gebietsvorgabe: Bern und ohne örtliche Regel 1,90 m; Zürich 2,00 m', () => {
    expect(parkRegel(av('BE')).breite).toBe(1.9)
    expect(parkRegel(av('ZH')).breite).toBe(2)
    expect(parkRegel(av('LU')).breite).toBe(1.9)
    expect(parkRegel([]).breite).toBe(1.9)
  })
  it('Velo/Mofa: auch eine kurze Gruppe erhält 1,90 m Tiefe quer zur Strasse, nicht 1,90 m Breite je Velo', () => {
    const h: Hindernis = { id: 'bernpark:Parkplatz_Velo_Mofa:1:0', art: 'parkfeld', klasse: 'velo', quelle: 'kataster',
      katasterTyp: 'Parkplatz_Velo_Mofa', ring: [p(0, 3), p(1, 3), p(1, 4.6), p(0, 4.6)] }
    const [neu] = parkPruefflaechen([h], av(), netz)
    if (neu.art !== 'parkfeld') throw Error('Typ')
    const m = parkMasse(neu.ring, [1, 0])!
    expect(m.breite).toBeCloseTo(1.9, 7); expect(m.laenge).toBeCloseTo(1, 7)
    expect(neu.parkPruefung?.regel.grundlage).toContain('2.10.23')
    expect(new HindernisDaten([neu]).park.leer).toBe(true)
    expect(new HindernisDaten([neu]).parkAlle.leer).toBe(false)
  })
  it.each([['laengs', 1.2], ['senkrecht', 2.3], ['schraeg45', 1.9]] as const)('Motorrad %s: passende Tiefe, Originalumriss erhalten', (parkAnordnung, tiefe) => {
    const h: Hindernis = { ...feld(ring(3, 1)), id: 'bernpark:Parkplatz_Motorrad:1:0', art: 'parkfeld', klasse: 'motorrad', parkAnordnung }
    const [neu] = parkPruefflaechen([h], av(), netz)
    if (neu.art !== 'parkfeld') throw Error('Typ')
    expect(parkMasse(neu.ring, [1, 0])!.breite).toBeCloseTo(tiefe, 7)
    expect(neu.parkPruefung?.original).toEqual(h.art === 'parkfeld' && h.ring)
    expect(neu.parkPruefung?.regel.grundlage).toContain('Anordnung von Hand')
    expect(new HindernisDaten([neu]).park.leer).toBe(true)
  })
  it('Motorrad ohne Anordnung bleibt unklar; neue Wahl verwendet immer das Original statt einer früheren Verbreiterung', () => {
    const h: Hindernis = { ...feld(ring(3, 1)), id: 'bernpark:Parkplatz_Motorrad:1:0', art: 'parkfeld', klasse: 'motorrad' }
    const [offen] = parkPruefflaechen([h], av(), netz)
    expect(offen.art === 'parkfeld' && offen.parkPruefung?.status).toBe('unklar')
    expect(offen.art === 'parkfeld' && offen.parkPruefung?.regel.breite).toBeNull()
    const [senkrecht] = parkPruefflaechen([parkMitAnordnung(offen, 'senkrecht')], av(), netz)
    const laengs = parkMitAnordnung(senkrecht, 'laengs')
    expect(laengs.art === 'parkfeld' && laengs.ring).toEqual(h.art === 'parkfeld' && h.ring)
    const [neu] = parkPruefflaechen([laengs], av(), netz)
    expect(breite(neu)).toBeCloseTo(1.2, 7)
    expect(parkAnordnungLesen('beliebig')).toBeUndefined()
    expect(parkAnordnungLesen('__proto__')).toBeUndefined()
  })
})
