// Parkfelder der Stadt Zürich: Die Rechnung kennt sie nur als bestätigte Hindernisse. Künstlicher Übergang wie rechner/eingaben.test.ts:
// Hauptstrasse West–Ost (8 m), Übergang bei x = 0. Felder längs am Südrand östlich des Streifens, also in der Sicht der Zufahrt von Osten.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import { leererFall, type Fall } from './fall'
import { parkQuelleAmOrt } from './daten/parkLuzern'
import { zhParkFelder, zhParkVorschlaege } from './daten/anbieter/gemeinsam/parkZuerich'
import { rechneFall } from './rechner/index'
import { parkKatasterFelder } from './rechner/vorschlaege'
import { herangezogeneQuellen } from './quellenHerangezogen'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg => ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })], tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }] }
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'ZH', qualitaet: 'AV93', bfs: 261, ringe: [ring] })
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const CRS = { properties: { name: 'urn:ogc:def:crs:EPSG::2056' } }
const felder = zhParkFelder({ crs: CRS, features: [-24, -18, -12, 12, 18, 24].map((x, i) => ({ geometry: { type: 'MultiPoint', coordinates: [lv(x, x < 0 ? -3 : 3)] },
  properties: { objectid: i + 1, davnr: x < 0 ? '1' : '2', orientierung: 'LPU', art: 'Standard', bezeichnung: 'Hauptstrasse', parkfeldnummer: i + 1 } })) }, { crs: CRS, features: [] })
const fall = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const rechne = (f: Fall) => rechneFall(OSM, AV, [], 12, f, null)
const ohne = rechne(fall())
const vorschlaege = zhParkVorschlaege(parkKatasterFelder(felder, ohne.streifen.map(s => s.umriss), ohne.streifen[0].m, 'Stadt Zürich'), [], {})

describe('Parkfelder Stadt Zürich in der Rechnung', () => {
  it.each(['velo', 'motorrad'] as const)('%s: Parkstreifenerkennung wie im SichtweitenCheck, weiterhin keine Auto-Sichtverdeckung', klasse => {
    const f = fall(x => { x.hindernisse = [12, 18, 24].map((x, i) => ({ id: `kat:${klasse}:${i}`, art: 'parkfeld', klasse,
      quelle: 'kataster', ring: rechteck(x, 2, x + 5, 4), name: `Zweiradfeld ${i}` })) })
    const r = rechne(f), mitPark = r.streifen.flatMap(s => s.zufahrten).filter(z => z.parkRechts || z.parkLinks)
    expect(mitPark.length).toBeGreaterThan(0)
    for (const z of mitPark) {
      expect(z.parkstreifenBreiteM).toBe(2)
      expect(z.konflikte.some(k => k.klasse === 'auto')).toBe(false)
    }
  })
  it('gemeinsame Prüffläche: schmales Katasterfeld wird zur Fahrbahn auf 2,00 m ergänzt und der Parkstreifenabzug folgt mit', () => {
    const f = fall(x => { x.hindernisse = [12, 18, 24].map((x, i) => ({ id: `zhpark:schmal:${i}`, art: 'parkfeld', klasse: 'auto',
      quelle: 'kataster', ring: rechteck(x, 2.4, x + 5, 4), name: `Parkfeld ${i}` })) })
    const original = structuredClone(f.hindernisse), r = rechne(f)
    expect(f.hindernisse).toEqual(original)
    expect(r.parkAnnahmen).toHaveLength(3)
    for (const h of r.parkAnnahmen!) {
      expect(h.art === 'parkfeld' && h.parkPruefung?.pruefBreite).toBe(2)
      expect(h.art === 'parkfeld' && h.parkPruefung?.ergaenzung).toBeCloseTo(0.4, 6)
      expect(h.art === 'parkfeld' && Math.max(...h.ring.map(p => p[1]))).toBeCloseTo(O[1] + 4, 6)
      expect(r.parkPruefflaechen!.find(p => p.id === h.id)).toEqual(h)
    }
    const z = r.streifen.flatMap(s => s.zufahrten).find(z => z.abzugQuelle?.includes('Parkfelder'))!
    expect(z.parkstreifenBreiteM).toBe(2)
    expect(z.annahmen.join(' ')).toContain('2,00 m')
    expect(herangezogeneQuellen(f, r, [], []).ids).toContain('norm.park.zh')
  })
  it('wirken nicht, solange sie Vorschlag oder verworfen sind', () => {
    expect(parkQuelleAmOrt([261])).toBeNull()
    expect(vorschlaege).toHaveLength(6)
    const verworfen = rechne(fall(x => { for (const v of vorschlaege) x.vorschlaege[v.id] = 'verworfen' }))
    expect(JSON.stringify(verworfen.streifen)).toBe(JSON.stringify(ohne.streifen))
    expect(ohne.vorschlaege.filter(v => v.hindernis.quelle === 'kataster')).toEqual([])
  })
  it('wirken wie ein Parkfeld, sobald sie bestätigt sind', () => {
    const bestaetigt = rechne(fall(x => { x.hindernisse.push(...vorschlaege.map(v => v.hindernis)) }))
    expect(JSON.stringify(bestaetigt.streifen)).not.toBe(JSON.stringify(ohne.streifen))
  })
  it('im Bericht steht die Quelle erst mit einem bestätigten Feld, und zwar Zürich, nicht Bern', () => {
    expect(herangezogeneQuellen(fall(), ohne, [], []).ids).not.toContain('zh.park')
    const { ids } = herangezogeneQuellen(fall(x => { x.hindernisse.push(vorschlaege[0].hindernis) }), ohne, [], [])
    expect(ids).toContain('zh.park')
    expect(ids).not.toContain('bern.park')
  })
})
