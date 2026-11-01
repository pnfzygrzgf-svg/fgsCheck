// Tests Geoportal Stadt Bern (Haltestellen, Verkehrsdaten) und OSM-Haltestellen: Abfrage, Prüfung und Einlesen der Antworten,
// Zwischenspeicher, Zuständigkeit Bern/OSM und Fehlerfall. Künstliche Antworten im Aufbau der Probeabfrage vom 20.10.2026.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wgs, type P } from '../geo'
import type { AvFlaeche } from './av'
import { arcgisUrl, arcgisPruefen, arcgisHolen, geoCacheLeeren, istBern, bfsAmPunkt, bernZustaendig } from './geoportal'
import { haltestellenAusGeoportal, haltestellenAusOsm, haltestellenStand, haltestellenUrl, imBereich, osmHaltArt,
  ladeHaltestellenBern } from './haltestellen'
import { dtvAusNtNn, verkehrsdatenAusGeoportal, verkehrsdatenUrl, standText } from './verkehrsdaten'
import { HALT_OSM_RADIUS_M } from './osm'

const O: P = [2600000, 1200000]
const LV95 = { type: 'name', properties: { name: 'EPSG:2056' } }
const punkt = (x: number, y: number, pr: Record<string, unknown>) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [O[0] + x, O[1] + y] }, properties: pr })

describe('Geoportal: Abfrage und Prüfung', () => {
  it('Rechteck in LV95 um den Ort, Antwort GeoJSON in LV95', () => {
    const [lat, lon] = wgs(O[0], O[1])
    const u = new URL(arcgisUrl('Haltestellen', lat, lon, 150, 'Punktname'))
    expect(u.host).toBe('map.bern.ch')
    expect(u.pathname).toBe('/arcgis/rest/services/Geoportal/Haltestellen/MapServer/0/query')
    expect(u.searchParams.get('geometry')).toBe('2599850,1199850,2600150,1200150')
    expect([u.searchParams.get('inSR'), u.searchParams.get('outSR'), u.searchParams.get('f')]).toEqual(['2056', '2056', 'geojson'])
    expect(haltestellenUrl(lat, lon, 150)).toContain('outFields=Objectid%2CPunktname%2CRubrik%2CKante')
    expect(verkehrsdatenUrl(lat, lon, 150)).toContain('/Flaechendeckende_Verkehrsdaten/MapServer/0/query')
  })
  it('ArcGIS-Fehler, gekappte Antwort und Antwort ohne LV95 werden abgelehnt', () => {
    expect(() => arcgisPruefen({ crs: LV95, features: [] })).not.toThrow()
    expect(() => arcgisPruefen({ error: { code: 400, message: 'Invalid' } })).toThrow('ArcGIS 400 Invalid')
    expect(() => arcgisPruefen({ crs: LV95, features: [], exceededTransferLimit: true })).toThrow('unvollständig')
    expect(() => arcgisPruefen({ crs: LV95, features: [], properties: { exceededTransferLimit: true } })).toThrow('unvollständig')
    expect(() => arcgisPruefen({ features: [] })).toThrow('LV95')
    expect(() => arcgisPruefen({ crs: { properties: { name: 'EPSG:4326' } }, features: [] })).toThrow('LV95')
  })
  it('Zuständigkeit: Stadt Bern (BFS 351)', () => {
    expect(istBern([351])).toBe(true)
    expect(istBern([355, null])).toBe(false)
  })
})

describe('Geoportal: Zwischenspeicher und Fehlerfall', () => {
  afterEach(() => { vi.unstubAllGlobals(); geoCacheLeeren() })
  const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  it('erfolgreiche Antwort einmal geholt, danach aus dem Speicher; Fehler wird nicht gespeichert', async () => {
    const f = vi.fn(async () => antwort({ crs: LV95, features: [punkt(10, 0, { Objectid: 1, Punktname: 'Beispielplatz', Kante: 'A', Rubrik: 'Haltestelle' })] }))
    vi.stubGlobal('fetch', f)
    const [lat, lon] = wgs(O[0], O[1])
    const a = await ladeHaltestellenBern(lat, lon, 150)
    const b = await ladeHaltestellenBern(lat, lon, 150)
    expect(f).toHaveBeenCalledTimes(1)
    expect(a.daten.map(h => h.name)).toEqual(['Beispielplatz, Kante A'])
    expect(b.ms).toBe(0)
    const g = vi.fn(async () => antwort({}, 503))
    vi.stubGlobal('fetch', g)
    const url = arcgisUrl('Haltestellen', lat, lon, 100, 'Punktname')
    await expect(arcgisHolen(url)).rejects.toThrow('HTTP 503')
    await expect(arcgisHolen(url)).rejects.toThrow('HTTP 503')
    expect(g).toHaveBeenCalledTimes(2)
  })
})

describe('Haltestellen: Einlesen', () => {
  it('Geoportal: je Kante ein Punkt in LV95; Drahtseilbahn und Punkte ohne Lage entfallen', () => {
    const h = haltestellenAusGeoportal({ crs: LV95, features: [
      punkt(10, 0, { Objectid: 1, Punktname: 'Beispielplatz', Rubrik: 'Haltestelle', Kante: 'B' }),
      punkt(20, 0, { Objectid: 2, Punktname: 'Beispielplatz', Rubrik: 'Haltestelle', Kante: null }),
      punkt(30, 0, { Objectid: 3, Punktname: 'Bergstation', Rubrik: 'Station Drahtseilbahn' }),
      { geometry: { type: 'Point', coordinates: ['x', 1] }, properties: { Objectid: 4 } },
      { geometry: null, properties: { Objectid: 5 } },
    ] })
    expect(h.map(x => [x.id, x.name, x.art])).toEqual([['bernhst:1', 'Beispielplatz, Kante B', 'oev'], ['bernhst:2', 'Beispielplatz', 'oev']])
    expect(h[0].p).toEqual([O[0] + 10, O[1]])
  })
  it('OSM: Bus, Tram, beides; übrige Knoten (Übergänge, Lampen, Bahnsteige) entfallen', () => {
    expect(osmHaltArt({ highway: 'bus_stop' })).toBe('bus')
    expect(osmHaltArt({ public_transport: 'stop_position', trolleybus: 'yes' })).toBe('bus')
    expect(osmHaltArt({ railway: 'tram_stop' })).toBe('tram')
    expect(osmHaltArt({ public_transport: 'platform', tram: 'yes', bus: 'yes' })).toBe('bus_tram')
    expect(osmHaltArt({ public_transport: 'platform', train: 'yes' })).toBeNull()
    expect(osmHaltArt({ highway: 'street_lamp' })).toBeNull()
    const [la, lo] = wgs(O[0] + 5, O[1])
    const roh = { elements: [
      { type: 'node', id: 1, lat: la, lon: lo, tags: { highway: 'bus_stop', name: 'Beispielplatz' } },
      { type: 'node', id: 1, lat: la, lon: lo, tags: { highway: 'bus_stop', name: 'Beispielplatz' } },
      { type: 'node', id: 2, lat: la, lon: lo, tags: { railway: 'tram_stop' } },
      { type: 'node', id: 3, lat: la, lon: lo, tags: { highway: 'crossing' } },
      { type: 'way', id: 4, tags: { highway: 'bus_stop' } },
    ] }
    const h = haltestellenAusOsm(roh)
    expect(h.map(x => [x.id, x.name, x.art])).toEqual([['osm:1', 'Beispielplatz', 'bus'], ['osm:2', 'ohne Namen', 'tram']])
    expect(h[0].p[0]).toBeCloseTo(O[0] + 5, 1)
    expect(haltestellenAusOsm(null)).toEqual([])
  })
})

describe('Haltestellen: Zuständigkeit Bern/OSM und Fehlerfall', () => {
  const roh = { elements: [] }
  const halte = [{ id: 'bernhst:1', name: 'X', p: O, art: 'oev' as const }]
  it('ausserhalb Berns: OSM (Kreis HALT_OSM_RADIUS_M); ohne OSM-Antwort noch nichts', () => {
    expect(haltestellenStand(null, roh, O, 150)).toMatchObject({ quelle: 'osm', herkunft: 'OSM',
      bereich: { mitte: O, radiusM: HALT_OSM_RADIUS_M, form: 'kreis' } })
    expect(haltestellenStand(null, null, O, 150)).toBeNull()
    expect(haltestellenStand(null, null, O, 150, true)).toMatchObject({ fehler: 'OpenStreetMap nicht geladen' })
  })
  it('in Bern: Geoportal (Quadrat ±150 m), solange es lädt noch nichts, bei Ausfall OSM mit Hinweis', () => {
    expect(haltestellenStand({ halte }, roh, O, 150)).toMatchObject({ quelle: 'geoportal', herkunft: 'Geoportal Stadt Bern', halte,
      bereich: { radiusM: 150, form: 'quadrat' } })
    expect(haltestellenStand({ laedt: true }, roh, O, 150)).toBeNull()
    const s = haltestellenStand({ fehler: 'HTTP 503' }, roh, O, 150)
    expect(s).toMatchObject({ quelle: 'osm', zusatz: 'Geoportal Stadt Bern nicht erreichbar (HTTP 503)' })
    expect(haltestellenStand({ fehler: 'HTTP 503' }, null, O, 150)).toMatchObject({ fehler: 'Geoportal Stadt Bern nicht erreichbar (HTTP 503)' })
  })
  it('Bereich: Kreis bzw. Quadrat abzüglich Rand', () => {
    expect(imBereich([O[0] + 100, O[1]], 50, { mitte: O, radiusM: 150, form: 'kreis' })).toBe(true)
    expect(imBereich([O[0] + 70, O[1] + 70], 50, { mitte: O, radiusM: 150, form: 'kreis' })).toBe(true)
    expect(imBereich([O[0] + 72, O[1] + 72], 50, { mitte: O, radiusM: 150, form: 'kreis' })).toBe(false)
    expect(imBereich([O[0] + 100, O[1] + 100], 50, { mitte: O, radiusM: 150, form: 'quadrat' })).toBe(true)
    expect(imBereich([O[0] + 101, O[1]], 50, { mitte: O, radiusM: 150, form: 'quadrat' })).toBe(false)
  })
})

describe('Verkehrsdaten: Einlesen', () => {
  it('DTV = round(16·Nt + 8·Nn)', () => {
    expect(dtvAusNtNn(81.8, 19)).toBe(1461)
    expect(dtvAusNtNn(0, 0)).toBe(0)
    expect(dtvAusNtNn(473.3, 73.4)).toBe(8160)
  })
  it('LineString und MultiLineString mit z in LV95; ohne Nt/Nn dtv null; Stand aus Erstellt_am', () => {
    const l = verkehrsdatenAusGeoportal({ crs: LV95, features: [
      { geometry: { type: 'LineString', coordinates: [[O[0], O[1], 0], [O[0] + 10, O[1], 0]] },
        properties: { Objectid: 7, Strassenname: 'Beispielstrasse', Nt: 81.8, Nn: 19, Erstellt_am: 1763723580000 } },
      { geometry: { type: 'MultiLineString', coordinates: [[[O[0], O[1] + 5], [O[0] + 10, O[1] + 5]], [[O[0], O[1]]]] },
        properties: { Objectid: 8, Strassenname: 'Nebenstrasse', Nt: null, Nn: 3 } },
      { geometry: { type: 'Point', coordinates: [O[0], O[1]] }, properties: { Objectid: 9, Nt: 1, Nn: 1 } },
    ] })
    expect(l.map(x => [x.id, x.strasse, x.dtv, x.teile.length, x.stand])).toEqual([
      ['bernvd:7', 'Beispielstrasse', 1461, 1, '21.11.2025'], ['bernvd:8', 'Nebenstrasse', null, 1, null]])
    expect(l[0].teile[0]).toEqual([[O[0], O[1]], [O[0] + 10, O[1]]])
    expect(standText(undefined)).toBeNull()
  })
})

describe('Zuständigkeit der Berner Dienste (Korrektur M4)', () => {
  const ring = (x0: number, x1: number): [number, number][][] =>
    [[[2600000 + x0, 1200000 - 10], [2600000 + x1, 1200000 - 10], [2600000 + x1, 1200000 + 10], [2600000 + x0, 1200000 + 10], [2600000 + x0, 1200000 - 10]]]
  const AV: AvFlaeche[] = [
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: ring(-200, 0) },   // Stadt Bern
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 355, ringe: ring(0, 200) },    // Köniz (Wabern)
  ]
  it('nur die Gemeinde der AV-Fläche unter dem Streifen zählt, nicht alle Gemeinden im Ausschnitt', () => {
    expect(bfsAmPunkt([2600000 + 50, 1200000], AV)).toBe(355)
    expect(bernZustaendig([2600000 + 50, 1200000], AV)).toBe(false)
    expect(bernZustaendig([2600000 - 50, 1200000], AV)).toBe(true)
    expect(bernZustaendig([2600000, 1200000 + 500], AV)).toBe(false)
    expect(bernZustaendig(null, AV)).toBe(false)
    expect(istBern(AV.map(f => f.bfs))).toBe(true)
  })
})
