// Unit-Tests der portierten Rechnung an einem künstlichen Knoten (keine echten Daten):
// Hauptstrasse West–Ost (8 m, Weg 1), Übergang bei x = 0, Querstrasse nach Süden bei x = -40 (6 m, Weg 2).
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz, einbahnTag, zugangTag } from './netz'
import { rechneUebergang } from './index'
import { sichtweiteTab1, sichtweiteKurve, tempoStufe, radiusRunden, zonenTempo } from './tempo'
import { fahrstreifenTags, fahrstreifenLage, abzugSeite } from './fahrstreifen'
import { randLuecken, kreisAnpassen, glaetten } from './spur'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]

function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}

function daten(hauptTags: Record<string, string> = {}, verbote = false, xq = -40): OsmDaten {
  const haupt = { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50', ...hauptTags }
  return {
    wege: [
      weg(1, [[10, -200, 0], [11, xq, 0], [12, 0, 0], [13, 200, 0]], haupt),
      weg(2, [[11, xq, 0], [20, xq, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' }),
    ],
    tram: [], ampeln: [], querungen: [],
    uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' },
      lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
    relationen: verbote ? [{ id: 99, tags: { type: 'restriction', restriction: 'no_right_turn' },
      members: [{ type: 'way', ref: 2, role: 'from' }, { type: 'node', ref: 11, role: 'via' }, { type: 'way', ref: 1, role: 'to' }] }] : [],
  }
}

const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] =>
  [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const avBei = (xq: number): AvFlaeche[] => [
  { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-200, -4), lv(xq - 3, -4), lv(xq - 3, -200), lv(xq + 3, -200),
    lv(xq + 3, -4), lv(200, -4), lv(200, 4), lv(-200, 4), lv(-200, -4)]] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 4, 200, 7)] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(xq + 4, -7, 200, -4)] },
]
const AV = avBei(-40)

describe('Tags deuten (fgs_netz.py)', () => {
  it('Einbahn und Zugang', () => {
    expect(einbahnTag({ oneway: 'yes' })).toBe(1)
    expect(einbahnTag({ oneway: '-1' })).toBe(-1)
    expect(einbahnTag({ junction: 'roundabout' })).toBe(1)
    expect(einbahnTag({ oneway: 'yes', 'oneway:motor_vehicle': 'no' })).toBe(0)
    expect(zugangTag({ highway: 'pedestrian' })).toBe('nein')
    expect(zugangTag({ highway: 'residential', access: 'private' })).toBe('privat')
  })
  it('Fahrstreifen aus lanes', () => {
    expect(fahrstreifenTags({ lanes: '2' }, true)?.slice(0, 2)).toEqual([1, 2])
    expect(fahrstreifenTags({ lanes: '3', 'lanes:forward': '2' }, false)?.slice(0, 2)).toEqual([1, 3])
    expect(fahrstreifenTags({ lanes: '1', oneway: 'yes' }, false)).toBeNull()
  })
  it('Lage im OSM-Fahrstreifen und Widerspruch', () => {
    const fso = { n: 2, gesamt: 4, index: 0, wid: 1, regel: 'rechts', zweirichtig: true, bus: null }
    expect(fahrstreifenLage(fso, 12, 0, 6).vomRand).toBeCloseTo(1.5)
    expect(fahrstreifenLage(fso, 8, 0, 4).widerspruch).not.toBeNull()
  })
  it('Abzüge aus OSM-Tags (Annahmen)', () => {
    expect(abzugSeite({ 'parking:right': 'lane', 'parking:right:orientation': 'parallel' }, 'right').park).toBeCloseTo(1.9)
    expect(abzugSeite({ 'parking:both': 'lane', 'cycleway:right': 'lane' }, 'right')).toEqual({ park: 1.9, velo: 3.4 })
    expect(abzugSeite({ 'parking:left': 'lane' }, 'right').park).toBe(0)
  })
})

describe('Tempo und Sichtweite', () => {
  it('Tab. 1, Stufen und Kurvensichtweite', () => {
    expect([20, 30, 40, 50, 60].map(sichtweiteTab1)).toEqual([25, 25, 40, 55, 75])
    expect(tempoStufe(45)).toBe(50)
    expect(sichtweiteKurve(7.5)).toEqual([15, 'bfu'])
    expect(sichtweiteKurve(26)).toEqual([40, 'VSS Tab. 2'])
    expect(sichtweiteKurve(45)).toEqual([null, null])
    expect(radiusRunden(10.04)).toBe(10.1)
    expect(zonenTempo('CH:zone30')).toBe(30)
    expect(zonenTempo('CH:urban')).toBe(50)
    expect(zonenTempo('DE:urban')).toBeNull()
  })
})

describe('Spur-Helfer', () => {
  it('Kreisfit', () => {
    const pts: P[] = Array.from({ length: 10 }, (_, i) => [10 * Math.cos(i / 5), 10 * Math.sin(i / 5)])
    const k = kreisAnpassen(pts)!
    expect(k[1]).toBeCloseTo(10)
  })
  it('rand_luecken füllt Lücken linear und verwirft Einmündungen', () => {
    const [lat] = randLuecken([1, 1, 1, null, 1.5, 1.5, 1.5, 1.5], null, null, null)
    expect(lat[3]).toBeCloseTo(1.25)
    const [, nMuendung] = randLuecken([1, 1, 1, 1, 3, 1, 1, 1], null, null, null)
    expect(nMuendung).toBe(1)
  })
  it('glaetten hält den Anfang fest', () => {
    const g = glaetten([[0, 0], [50, 0], [50, 50]], 6)
    expect(g[0]).toEqual([0, 0])
  })
})

describe('Netz und Topologie (fgs_netz.OsmNetz)', () => {
  it('Zuordnung über den Übergangsknoten, Suche stromauf, Knotenbereich', () => {
    const netz = new OsmNetz(daten())
    const [gl, quelle] = netz.zuordnen(lv(0, -3.7), lv(0, 3.7), null, true, 4)
    expect(quelle).toBe('uebergang')
    expect(gl[0].wid).toBe(1)
    const su = netz.stromauf(gl[0], 1)                       // Fahrt nach Osten, Suche nach Westen
    expect(su.art).toBe('knoten')
    expect(su.dist).toBeCloseTo(40, 0)
    const kb = netz.knotenbereich(su, gl[0])
    expect(kb.forts?.wid).toBe(1)
    const arm = kb.arme.find(a => a.wid === 2)!
    expect(arm.rolle).toBe('abbiegend')
  })
  it('Abbiegeverbot (Relation) gibt Rolle «verbot»', () => {
    const netz = new OsmNetz(daten({}, true))
    const [gl] = netz.zuordnen(lv(0, -3.7), lv(0, 3.7), null, true, 4)
    const kb = netz.knotenbereich(netz.stromauf(gl[0], 1), gl[0])
    expect(kb.arme.find(a => a.wid === 2)!.rolle).toBe('verbot')
  })
})

describe('Rechnung am Übergang', () => {
  it('zwei gerade Zufahrten, Querstrasse 38 m vor dem Streifen durch die gerade Zufahrt gedeckt', () => {
    const r = rechneUebergang(daten(), AV, 12)
    expect(r.streifen).toHaveLength(1)
    const s = r.streifen[0]
    expect(s.randQuelle).toBe('AV')
    expect(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1])).toBeCloseTo(8 - 0.6, 1)
    const gerade = s.zufahrten.filter(z => z.art !== 'abbiegend').map(z => z.richtung).sort((a, b) => a - b)
    expect(gerade).toEqual([0, 180])
    for (const z of s.zufahrten.filter(z => z.art !== 'abbiegend')) {
      expect(z.tempo).toBe(50)
      expect(z.sichtweite).toBeGreaterThanOrEqual(55)
      expect(z.sichtpunktVomRandM).toBeCloseTo(2, 1)          // Mitte des rechten Fahrstreifens (8 m / 2 / 2)
      expect(z.status).toBe('frei')
    }
    const e = s.entfallen.find(x => x.kennung === 'k11:w2+')!
    expect(e.grund).toBe('gedeckt')
  })
  it('Querstrasse nah am Streifen: Abbiegezufahrt mit Radius und Kurvensichtweite', () => {
    const r = rechneUebergang(daten({}, false, -11), avBei(-11), 12)
    const ab = r.streifen[0].zufahrten.find(z => z.art === 'abbiegend')!
    expect(ab.kennung).toBe('k11:w2+')
    expect(ab.tempo).toBe(30)
    expect(ab.kurvenradiusM).toBeGreaterThanOrEqual(5)
    expect(ab.sichtweite).toBeLessThanOrEqual(25)
    expect(ab.sichtpunkte.length).toBeGreaterThan(2)
  })
  it('Einbahn: Gegenrichtung entfällt mit Grund', () => {
    const r = rechneUebergang(daten({ oneway: 'yes' }), AV, 12)
    const s = r.streifen[0]
    expect(s.zufahrten.filter(z => z.art !== 'abbiegend').map(z => z.art)).toEqual(['einbahn'])
    expect(s.entfallen.find(e => e.grund === 'einbahn_osm')?.richtung).toBe(180)
  })
  it('ohne maxspeed: Tempo 50 als Annahme sichtbar', () => {
    const r = rechneUebergang(daten({ maxspeed: '' }), AV, 12)
    const z = r.streifen[0].zufahrten.find(x => x.richtung === 180)!
    expect(z.tempoQuelle).toBe('Ersatz')
    expect(z.annahmen.join(' ')).toMatch(/angenommen/)
  })
  it('Gebäude im Sichtfeld', () => {
    const geb: AvFlaeche = { art: 'Gebaeude', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-8, 4.1, -3.2, 8)] }
    const r = rechneUebergang(daten(), [...AV, geb], 12)
    const z = r.streifen[0].zufahrten.find(x => x.richtung === 0)!   // Fahrt nach Osten, Gebäude links vor dem Streifen
    expect(z.status).toBe('verdeckt_gebaeude')
  })
})
