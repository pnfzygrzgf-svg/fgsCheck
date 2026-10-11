// Tests amtliche Parkfelder: Klassen (park_klasse), Einlesen GeoJSON -> Felder, Fall-Datei (abschalten, verwerfen), Rechnung
// (zählen sofort, verwerfen, Reichweite) und Unterdrückung von OSM-Vorschlägen. Künstliche Daten wie rechner/eingaben.test.ts.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from './osm'
import type { AvFlaeche } from './av'
import { parkKlasse, felderAusGeoJson, parkQuelleFuer, istParkId, bernParkUrl, istLv95, PARKKATASTER, type KatasterFeld } from './parkkataster'
import { ringFlaeche } from '../rechner/poly'
import { rechneFall } from '../rechner'
import { osmUeberdeckt, parkKatasterFelder, baumVorschlaege, doppeltAmtlich, KATASTER_PARK_M } from '../rechner/vorschlaege'
import type { Hindernis } from '../rechner/hindernisse'
import { leererFall, fallLesen, fallSchreiben, eingabenZahl, type Fall } from '../fall'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lonlat = (x: number, y: number) => { const [la, lo] = ll(x, y); return [lo, la] }
const xy = (x: number, y: number) => [O[0] + x, O[1] + y]                     // Antwort in LV95 (SRSNAME EPSG:2056)
const ring = (x0: number, y0: number, x1: number, y1: number, k = xy) => [k(x0, y0), k(x1, y0), k(x1, y1), k(x0, y1), k(x0, y0)]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]

describe('Klassen wie park_klasse (fgs_sicht_pruefen.py)', () => {
  it('ordnet die Typen zu', () => {
    for (const t of ['Parkfeld_Gebuehrenpflichtig', 'Parkfeld_blau_APK', 'Parkfeld_weiss_APK', 'Parkfeld_weiss_Kurzzeit', 'Spezialfeld',
      'Andere_Unbekannt']) expect(parkKlasse(t)).toBe('auto')
    expect(parkKlasse('Parkplatz_Velo_Mofa')).toBe('velo')
    expect(parkKlasse('Parkplatz_Motorrad')).toBe('motorrad')
    expect(parkKlasse('Motorradparkplatz')).toBe('motorrad')
    for (const t of ['Parkverbot', 'Veloabstellplatz', 'Velostation', 'Taxistandplatz', 'Behindertenparkplatz', 'Carsharing_Parkplatz'])
      expect(parkKlasse(t)).toBeNull()
  })
  it('Quelle nur in Bern (BFS 351); Ids nach Quelle', () => {
    expect(parkQuelleFuer([351])?.id).toBe('bernpark')
    expect(parkQuelleFuer([261, null])).toBeNull()
    expect(istParkId('bernpark:Spezialfeld:1:0', PARKKATASTER[0])).toBe(true)
    expect(istParkId('bern:123', PARKKATASTER[0])).toBe(false)
    expect(bernParkUrl('Parkfeld_blau_APK', 46.95, 7.44, 150)).toContain('TYPENAMES=Geoportal_Parkplaetze_oeffentlich_2:Parkfeld_blau_APK')
  })
})

describe('GeoJSON -> Felder', () => {
  const gj = { features: [
    { geometry: { type: 'MultiPolygon', coordinates: [[ring(0, 0, 5, 2)], [ring(10, 0, 15, 2), ring(11, 0.5, 12, 1.5)]] },
      properties: { OBJECTID: 7, PARKPLATZ_NUMMER: 1234 } },
    { geometry: { type: 'Polygon', coordinates: [ring(20, 0, 20.6, 0.6)] }, properties: { OBJECTID: 8 } },          // 0,36 m²
    { geometry: { type: 'Polygon', coordinates: [ring(30, 0, 31, 1)] }, properties: { OBJECTID: 9, PARKPLATZ_NUMMER: null } },
    { geometry: { type: 'Point', coordinates: xy(40, 0) }, properties: { OBJECTID: 10 } },
    { geometry: null, properties: { OBJECTID: 11 } },
  ] }
  const ff = felderAusGeoJson(gj, 'Parkfeld_blau_APK', 'bernpark', 'Parkfeld blau (APK)', 'Parkplätze öffentlich Stadt Bern')
  it('MultiPolygon: je Teil ein Feld, Löcher entfallen, Lage in LV95', () => {
    expect(ff.map(f => f.id)).toEqual(['bernpark:Parkfeld_blau_APK:7:0', 'bernpark:Parkfeld_blau_APK:7:1', 'bernpark:Parkfeld_blau_APK:9:0'])
    expect(ff.every(f => f.klasse === 'auto')).toBe(true)
    expect(Math.abs(ringFlaeche(ff[0].ring))).toBeCloseTo(10, 2)
    expect(Math.abs(ringFlaeche(ff[1].ring))).toBeCloseTo(10, 2)           // Aussenring, Loch nicht abgezogen
    expect(Math.min(...ff[1].ring.map(p => p[0]))).toBeCloseTo(O[0] + 10, 2)
    expect(ff[0].name).toBe('Parkfeld blau (APK), Nr. 1234 (Parkplätze öffentlich Stadt Bern)')
    expect(ff[2].name).toBe('Parkfeld blau (APK) (Parkplätze öffentlich Stadt Bern)')
  })
  it('Flächen unter 0,5 m² und Punkte entfallen; Typ ohne Klasse liefert nichts', () => {
    expect(ff.some(f => f.id.includes(':8:'))).toBe(false)
    expect(felderAusGeoJson(gj, 'Parkverbot', 'bernpark', 'Parkverbot', 'x')).toEqual([])
    expect(felderAusGeoJson(gj, 'Parkplatz_Velo_Mofa', 'bernpark', 'Velo', 'x')[0].klasse).toBe('velo')
  })
  it('WGS84 [lon, lat] wird streng nach LV95 umgerechnet; Antwort ohne EPSG:2056 erkannt', () => {
    const w = felderAusGeoJson({ features: [{ geometry: { type: 'Polygon', coordinates: [ring(0, 0, 5, 2, lonlat)] }, properties: { OBJECTID: 1 } }] },
      'Spezialfeld', 'bernpark', 'Spezialfeld', 'x', 'wgs84')
    const ecken = rechteck(0, 0, 5, 2)
    expect(w[0].ring.length).toBe(4)
    expect(w[0].ring.every(p => ecken.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01))).toBe(true)
    expect(istLv95({ crs: { properties: { name: 'EPSG:2056' } } })).toBe(true)
    expect(istLv95({ crs: { properties: { name: 'urn:ogc:def:crs:EPSG::2056' } } })).toBe(true)
    expect(istLv95({ crs: { properties: { name: 'EPSG:4326' } } })).toBe(false)
    expect(istLv95({})).toBe(false)
    expect(bernParkUrl('Spezialfeld', ...ll(0, 0), 150)).toContain(`SRSNAME=urn:ogc:def:crs:EPSG::2056&BBOX=${O[0] - 150},${O[1] - 150},${O[0] + 150},${O[1] + 150},urn:ogc:def:crs:EPSG::2056`)
  })
  it('ungültiger (verdrehter) Ring wird bereinigt', () => {
    const acht = [xy(0, 0), xy(4, 2), xy(4, 0), xy(0, 2), xy(0, 0)]   // Schleife: zwei Dreiecke je 2 m²
    const r = felderAusGeoJson({ features: [{ geometry: { type: 'Polygon', coordinates: [acht] }, properties: { OBJECTID: 1 } }] },
      'Spezialfeld', 'bernpark', 'Spezialfeld', 'x')
    expect(r.length).toBe(2)
    for (const f of r) expect(Math.abs(ringFlaeche(f.ring))).toBeCloseTo(2, 2)
  })
})

// Hauptstrasse West–Ost (8 m), Übergang bei x = 0, Querstrasse nach Süden bei x = -40 (wie eingaben.test.ts)
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
function daten(hauptTags: Record<string, string> = {}): OsmDaten {
  return {
    wege: [
      weg(1, [[10, -200, 0], [11, -40, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50', ...hauptTags }),
      weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' }),
    ],
    tram: [], ampeln: [], querungen: [], relationen: [],
    uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
  }
}
const AV: AvFlaeche[] = [
  { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[lv(-200, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200),
    lv(-37, -4), lv(200, -4), lv(200, 4), lv(-200, 4), lv(-200, -4)]] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...rechteck(-200, 4, 200, 7), lv(-200, 4)]] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...rechteck(-36, -7, 200, -4), lv(-36, -4)]] },
]
const fallMit = (f: (x: Fall) => void): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const feld = (id: string, r: P[], klasse: KatasterFeld['klasse'] = 'auto'): KatasterFeld => ({ id, klasse, ring: r, name: `Feld ${id}` })
const park = (felder: KatasterFeld[]) => ({ felder, quellenangabe: 'Geodaten Stadt Bern, Parkplätze öffentlich' })
const ost = (r: ReturnType<typeof rechneFall>) => r.streifen[0].zufahrten.find(z => z.richtung === 0)!

describe('Rechnung mit amtlichen Parkfeldern', () => {
  const vor = feld('bernpark:Parkfeld_blau_APK:1:0', rechteck(-12, 2, -7, 4))      // vor dem Streifen am rechten Rand (Fahrt nach Osten)
  it('zählt sofort wie ein Parkfeld von Hand', () => {
    expect(ost(rechneFall(daten(), AV, [], 12, fallMit(() => {}), null)).status).toBe('frei')
    const r = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null, null, park([vor]))
    const z = ost(r)
    expect(z.status).toBe('verdeckt')
    expect(z.minAbstandAutoM).toBeCloseTo(5, 0)
    const hand = ost(rechneFall(daten(), AV, [], 12, fallMit(x => x.hindernisse.push({ id: 'h', art: 'parkfeld', klasse: 'auto',
      ring: vor.ring, quelle: 'hand' })), null))
    expect(z.status).toBe(hand.status)
    expect(z.sichtpunkte).toEqual(hand.sichtpunkte)                                 // gleiche Lage (Parkabzug, Nase, 1,5 m)
    expect(r.vorschlaege.find(v => v.id === vor.id)?.hindernis.quelle).toBe('kataster')
  })
  it('verworfen bzw. Quelle abgeschaltet: zählt nicht', () => {
    expect(ost(rechneFall(daten(), AV, [], 12, fallMit(x => { x.vorschlaege[vor.id] = 'verworfen' }), null, null, park([vor]))).status).toBe('frei')
    const aus = rechneFall(daten(), AV, [], 12, fallMit(x => { x.parkkataster = false }), null, null, park([vor]))
    expect(ost(aus).status).toBe('frei')
    expect(aus.vorschlaege.length).toBe(0)
  })
  it('Velo-Feld: Zweirad-Status', () => {
    const v = feld('bernpark:Parkplatz_Velo_Mofa:2:0', rechteck(-12, 2, -7, 4), 'velo')
    expect(ost(rechneFall(daten(), AV, [], 12, fallMit(() => {}), null, null, park([v]))).status).toBe('verdeckt_zweirad')
  })
  it('nur Felder in Reichweite der Rechnung (120 m, Abstand der Feldfläche zum Umriss)', () => {
    expect(KATASTER_PARK_M).toBe(120)
    const u = [rechteck(-2, -4, 2, 4)]
    const nah = feld('a', rechteck(KATASTER_PARK_M - 5, 2, KATASTER_PARK_M + 3, 4))
    const weit = feld('b', rechteck(KATASTER_PARK_M + 10, 2, KATASTER_PARK_M + 15, 4))
    expect(parkKatasterFelder([nah, weit], u, lv(0, 0), 'q').map(v => v.id)).toEqual(['a'])
    // langes Feld quer vor dem Streifen: alle Ecken weiter als 120 m, die Kante bei y = 118 nur 114 m -> zählt
    const quer = feld('c', rechteck(-100, 118, 100, 125))
    expect(quer.ring.every(p => Math.hypot(p[0] - O[0], p[1] - O[1]) > KATASTER_PARK_M + 20)).toBe(true)
    expect(parkKatasterFelder([quer], u, lv(0, 0), 'q').map(v => v.id)).toEqual(['c'])
    expect(parkKatasterFelder([feld('d', rechteck(-100, 125, 100, 130))], u, lv(0, 0), 'q')).toEqual([])
    // ohne Streifen: Abstand zur Mitte (Fläche)
    expect(parkKatasterFelder([quer], [], lv(0, 0), 'q').map(v => v.id)).toEqual(['c'])
  })
  it('Bäume: gleiche Reichweite um den Umriss (vorher 100 m um die Mitte)', () => {
    const lang = [rechteck(-2, -40, 2, 40)]                                         // langer Streifen
    const b = (id: string, x: number, y: number) => ({ id, p: lv(x, y), name: id })
    const r = baumVorschlaege([b('nah', 0, 155), b('weit', 0, 165), b('seitlich', 123, 0)], lang, lv(0, 0), 'q')
    expect(r.map(v => v.id)).toEqual(['nah'])                                      // 115 m vom Umriss, 155 m von der Mitte
    expect(baumVorschlaege([b('m', 0, 119)], [], lv(0, 0), 'q').map(v => v.id)).toEqual(['m'])
  })
  it('verworfene Felder kommen getrennt zurück (Karte: gedimmt, wieder zählen)', () => {
    const r = rechneFall(daten(), AV, [], 12, fallMit(x => { x.vorschlaege[vor.id] = 'verworfen' }), null, null, park([vor]))
    expect(r.parkVerworfen.map(v => v.id)).toEqual([vor.id])
    expect(r.vorschlaege.some(v => v.id === vor.id)).toBe(false)
  })
})

describe('OSM-Parkierungsvorschläge neben amtlichen Feldern', () => {
  const d = daten({ 'parking:left': 'lane' })                                       // Nordrand, y 2…4
  it('überdeckte OSM-Vorschläge entfallen, übrige bleiben', () => {
    const osm = rechneFall(d, AV, [], 12, fallMit(() => {}), null).vorschlaege.filter(v => v.hindernis.quelle === 'osm')
    expect(osm.length).toBeGreaterThan(0)
    // Felder 5 m lang mit 1 m Lücke über den ganzen Nordrand: decken rund 80 %
    const felder: KatasterFeld[] = []
    for (let x = -60; x < 60; x += 6) felder.push(feld(`bernpark:Parkfeld_weiss_APK:${x}:0`, rechteck(x, 2, x + 5, 4)))
    const mit = rechneFall(d, AV, [], 12, fallMit(() => {}), null, null, park(felder))
    expect(mit.vorschlaege.filter(v => v.hindernis.quelle === 'osm').length).toBe(0)
    // auch verworfene amtliche Felder unterdrücken (der Datensatz beschreibt die Parkierung)
    const verworfen = rechneFall(d, AV, [], 12, fallMit(x => { for (const f of felder) x.vorschlaege[f.id] = 'verworfen' }), null, null, park(felder))
    expect(verworfen.vorschlaege.filter(v => v.hindernis.quelle === 'osm').length).toBe(0)
    // Felder auf der anderen Seite (Süd): OSM-Vorschläge bleiben
    const sued = [feld('bernpark:x:1:0', rechteck(-30, -4, 30, -2))]
    expect(rechneFall(d, AV, [], 12, fallMit(() => {}), null, null, park(sued)).vorschlaege.filter(v => v.hindernis.quelle === 'osm').length)
      .toBe(osm.length)
    // abgeschaltet: keine Unterdrückung
    expect(rechneFall(d, AV, [], 12, fallMit(x => { x.parkkataster = false }), null, null, park(felder)).vorschlaege
      .filter(v => v.hindernis.quelle === 'osm').length).toBe(osm.length)
  })
  it('Regel 30 % der Vorschlagsfläche', () => {
    const v = { id: 'o', grund: '', hindernis: { id: 'o', art: 'parkfeld' as const, klasse: 'auto' as const, ring: rechteck(0, 0, 10, 2), quelle: 'osm' as const } }
    expect(osmUeberdeckt([v], [rechteck(0, 0, 2.9, 2)]).size).toBe(0)
    expect(osmUeberdeckt([v], [rechteck(0, 0, 3.1, 2)]).size).toBe(1)
    expect(osmUeberdeckt([v], []).size).toBe(0)
  })
})

describe('Doppelzählung: Parkierung im Fall deckt sich mit amtlichen Feldern', () => {
  const amtlich = [rechteck(0, 0, 10, 2)]
  const pf = (id: string, r: P[], quelle: 'hand' | 'osm' | 'kataster' = 'hand'): Hindernis => ({ id, art: 'parkfeld', klasse: 'auto', ring: r, quelle })
  it('Regel 30 % der eigenen Fläche, auch Längsparkierung und bestätigte OSM-Parkierung', () => {
    const hh: Hindernis[] = [
      pf('ganz', rechteck(1, 0, 6, 2)),                                           // 100 %
      pf('wenig', rechteck(8, 0, 18, 2)),                                          // 20 %
      pf('knapp', rechteck(7, 0, 17, 2), 'osm'),                                    // 30 %
      pf('weg', rechteck(0, 10, 5, 12)),                                           // 0 %
      pf('kat', rechteck(1, 0, 6, 2), 'kataster'),                                  // amtlich selbst: nie doppelt
      { id: 'laengs', art: 'laengsparkierung', linie: [lv(0, 1), lv(10, 1)], breite: 2, quelle: 'hand' },
      { id: 'baum', art: 'baum', p: lv(2, 1), stamm: 0.5, quelle: 'hand' },
    ]
    expect(doppeltAmtlich(hh, amtlich)).toEqual(['ganz', 'knapp', 'laengs'])
    expect(doppeltAmtlich(hh, [])).toEqual([])
  })
  it('Rechnung: gemeldet, zählt aber weiter; auch gegen verworfene Felder; abgeschaltet nicht', () => {
    const vor = feld('bernpark:Parkfeld_blau_APK:1:0', rechteck(-12, 2, -7, 4))
    const hand = pf('h', rechteck(-12, 2, -7, 4))
    const r = rechneFall(daten(), AV, [], 12, fallMit(x => { x.hindernisse.push(hand); x.vorschlaege[vor.id] = 'verworfen' }), null, null, park([vor]))
    expect(r.doppelt).toEqual(['h'])
    expect(ost(r).status).toBe('verdeckt')                                        // das Feld von Hand zählt weiter
    expect(rechneFall(daten(), AV, [], 12, fallMit(x => { x.hindernisse.push(hand); x.parkkataster = false }), null, null, park([vor])).doppelt)
      .toEqual([])
    expect(rechneFall(daten(), AV, [], 12, fallMit(x => { x.hindernisse.push(hand) }), null).doppelt).toEqual([])
  })
})

describe('Fall-Datei: amtliche Parkfelder', () => {
  it('Vorgabe an (Feld fehlt), abgeschaltet und verworfen bleiben erhalten', () => {
    const an = fallMit(() => {})
    expect(an.parkkataster).toBeUndefined()
    expect(fallLesen(fallSchreiben(an))[0].parkkataster).toBeUndefined()
    const f = fallMit(x => { x.parkkataster = false; x.vorschlaege['bernpark:Spezialfeld:3:0'] = 'verworfen'
      x.quellen = { osm: 'o', parkkataster: 'Geodaten Stadt Bern, Parkplätze öffentlich' } })
    const [g, h] = fallLesen(fallSchreiben(f))
    expect(h).toEqual([])
    expect(g).toEqual(f)
    expect(eingabenZahl(g)).toBe(2)
    expect(eingabenZahl(an)).toBe(0)
  })
  it('ältere Fälle (ohne Feld) laden; nur false schaltet ab', () => {
    const roh = JSON.parse(fallSchreiben(fallMit(() => {})))
    delete roh.parkkataster
    expect(fallLesen(JSON.stringify(roh))[0].parkkataster).toBeUndefined()
    expect(fallLesen(JSON.stringify({ ...roh, parkkataster: 'nein' }))[0].parkkataster).toBeUndefined()
    expect(fallLesen(JSON.stringify({ ...roh, parkkataster: false }))[0].parkkataster).toBe(false)
  })
})
