// Tests Befund 31.10.2026 (Knoten 132629283, synthetisch nachgebaut): Arm der Vortrittsstrasse endet kurz nach dem Knoten an einer
// Querstrasse (Abzweige rund 90°), die App verlängert seine Mittellinie gerade. Reicht A darüber hinaus: Hinweis, Status unverändert.
// T-Knoten 12: Hauptstrasse West–Ost, Arm Ost (Nr. 1) endet nach 30 m am Punkt 13; Nebenstrasse (Zufahrt) nach Süden.

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz } from './netz'
import { OsmAchsen } from './achsen'
import { armMittellinieMitEnde } from './hauptachsen'
import { rechneKnoten, armEndeText } from './rechnen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const HAUPT = { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '50' }
/** quer: Wege am Ende des Arms Ost (Punkt 13); ohne: Arm Ost läuft 200 m gerade weiter */
const osm = (quer: OsmWeg[] | null): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], quer ? [13, 30, 0] : [13, 200, 0]], HAUPT),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
    ...(quer ?? []),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const querstrasse = (name: string, id = 3, y0 = -100, y1 = 100) =>
  weg(id, [[30 + id, 30, y0], [13, 30, 0], [40 + id, 30, y1]], { highway: 'residential', name, maxspeed: '50' })
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const fahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const NEBEN = '2:0:1'
const rechts = (o: OsmDaten) => rechneKnoten(o, [fahrbahn], { knoten: 12, zufahrt: NEBEN }).ergebnis!.richtungen.find(r => r.richtung === 'rechts')!
const TEXT = 'Weiter weg nimmt die App die Fahrlinie gerade an; Sicht und Lage von F_A dort vor Ort prüfen.'

describe('Arm endet kurz nach dem Knoten (Mittellinie gerade verlängert)', () => {
  it('spurMitEnde: Länge bis zum Ende der OSM-Linie, Endknoten, befolgte Wege', () => {
    const netz = new OsmNetz(osm([querstrasse('Querstrasse')]))
    const m = armMittellinieMitEnde(netz, new OsmAchsen(netz), { wid: 1, i: 1, sd: 1, richtung: [1, 0] }, 100)
    expect(m.ende).toEqual({ geradeAb: expect.closeTo(30, 1), knoten: 13, wege: [1] })
    const lang = new OsmNetz(osm(null))
    expect(armMittellinieMitEnde(lang, new OsmAchsen(lang), { wid: 1, i: 1, sd: 1, richtung: [1, 0] }, 100).ende).toBeNull()
  })
  it('A reicht über das Ende hinaus: Hinweis mit Name der Querstrasse; Status wie bei durchgehender Strasse', () => {
    const r = rechts(osm([querstrasse('Querstrasse')]))
    expect(r.massgebend).toBeGreaterThan(30)
    expect(r.hinweise).toContain(`Arm 1 Hauptstrasse (Ost) endet nach 30 m an der Kreuzung mit der Querstrasse. ${TEXT}`)
    const ohne = rechts(osm(null))
    expect(ohne.hinweise.some(h => h.includes('endet nach'))).toBe(false)
    expect([r.status, r.gesamt, r.vorhanden]).toEqual([ohne.status, ohne.gesamt, ohne.vorhanden])
  })
  it('Querstrasse ohne eindeutigen Namen bzw. Ende ohne weiteren Weg', () => {
    const zwei = [weg(3, [[33, 30, -100], [13, 30, 0]], { highway: 'residential', name: 'Südweg' }),
      weg(4, [[13, 30, 0], [44, 30, 100]], { highway: 'residential', name: 'Nordweg' })]
    expect(rechts(osm(zwei)).hinweise).toContain(`Arm 1 Hauptstrasse (Ost) endet nach 30 m an einer Kreuzung. ${TEXT}`)
    expect(rechts(osm([])).hinweise).toContain(`Arm 1 Hauptstrasse (Ost) endet nach 30 m (Ende der OSM-Linie). ${TEXT}`)
  })
  it('Artikel nach der Endung des Namens', () => {
    const a = { nr: '2', name: 'Hubelmattstrasse', hw: 'residential', himmel: 'Südost' }
    expect(armEndeText(a, { geradeAb: 28.4, quer: 'Weissensteinstrasse', kreuzung: true }))
      .toBe(`Arm 2 Hubelmattstrasse (Südost) endet nach 28 m an der Kreuzung mit der Weissensteinstrasse. ${TEXT}`)
    expect(armEndeText(a, { geradeAb: 12, quer: 'Bubenbergplatz', kreuzung: true })).toContain('mit dem Bubenbergplatz.')
    expect(armEndeText(a, { geradeAb: 12, quer: 'Ländte', kreuzung: true })).toContain('mit Ländte.')
  })
})
