// Tests amtliche Parkfelder: Klassen (park_klasse), Einlesen GeoJSON -> Felder. Die Tests zur Rechnung mit Parkfeldern (fgsCheck)
// sind in E0 entfernt; die Parkfelder kommen erst mit den Hindernissen (E2) in die Rechnung.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import { parkKlasse, felderAusGeoJson, parkQuelleFuer, istParkId, bernParkUrl, istLv95, PARKKATASTER } from './parkkataster'
import { ringFlaeche } from '../rechner/poly'

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
