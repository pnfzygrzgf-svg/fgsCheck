// Tests der weiteren Berner Dienste (Automatik Paket C): Abfrage, Einlesen, Zwischenspeicher, Teil-Ausfall und Zuständigkeit.
// Künstliche Antworten im Aufbau der Probeabfragen vom 21.10.2026 (GeoJSON in LV95, Linien mit z, Feldnamen des Diensts), mit
// erfundenen Namen. Keine Netzaufrufe (fetch ersetzt).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wgs, type P } from '../geo'
import { arcgisUrl, arcgisPaar, arcgisHolen, geoCacheLeeren, bernErgebnis, linienTeile, flaechenRinge, punktLage, GEODATEN_BERN,
  GEOPORTAL_BERN, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'
import { basisnetzAusGeoportal, publikumAusGeoportal, basisnetzUrl, publikumUrl, ladeRichtplanBern } from './richtplanFussverkehr'
import { hierarchieAusGeoportal, strassentypenAusGeoportal, hierarchieUrl, strassentypenUrl, strassenKlasse } from './strassenhierarchie'
import { vsigAusGeoportal, vsigUrl, ladeVsigBern } from './vsig'
import { schulenAusGeoportal, schulenAusOsm, osmSchulArt, schulenStand, volksschulenUrl, kindergaertenUrl, ladeSchulenBern } from './schulen'
import { tvmFelderAusGeoportal, tvmLinienAusGeoportal, tvmFelderUrl, tvmLinienUrl } from './taktil'
import { nutzungszonenAusGeoportal, nutzungszonenUrl } from './nutzungszonen'
import { oevLinienAusGeoportal, oevLinienUrl, oevTyp, strassenOev, ladeOevLinienBern } from './oevLinien'
import { BERN_C_KEYS, BERN_DIENSTE_C, bernDienstBericht, bernDienstName } from './bernDienste'
import { SCHULEN_OSM_RADIUS_M } from './osm'
import { fallLesen, fallSchreiben, leererFall } from '../fall'

const O: P = [2600000, 1200000]
const [LAT, LON] = wgs(O[0], O[1])
const LV95 = { type: 'name', properties: { name: 'EPSG:2056' } }
const xy = (x: number, y: number, z = false) => (z ? [O[0] + x, O[1] + y, 0] : [O[0] + x, O[1] + y])
const linie = (pr: Record<string, unknown>, ...pkt: [number, number][]) =>
  ({ type: 'Feature', geometry: { type: 'LineString', coordinates: pkt.map(([x, y]) => xy(x, y, true)) }, properties: pr })
const punkt = (pr: Record<string, unknown>, x: number, y: number) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: xy(x, y) }, properties: pr })
const ring = (x0: number, y0: number, s: number) => [xy(x0, y0), xy(x0 + s, y0), xy(x0 + s, y0 + s), xy(x0, y0 + s), xy(x0, y0)]
const flaeche = (pr: Record<string, unknown>, ...ringe: number[][][]) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: ringe }, properties: pr })
const gj = (...features: unknown[]): ArcgisGeoJson => ({ crs: LV95, features: features as ArcgisGeoJson['features'] })
const rel = (q: P) => [q[0] - O[0], q[1] - O[1]]

describe('Abfragen: Layer, Felder, Rundung und Vereinfachung', () => {
  const u = (s: string) => new URL(s)
  it('Layer-Nummer im Pfad, Vorgabe 0; Rechteck und LV95 wie die übrigen Dienste', () => {
    expect(u(arcgisUrl('X', LAT, LON, 150, 'A')).pathname).toBe('/arcgis/rest/services/Geoportal/X/MapServer/0/query')
    expect(u(basisnetzUrl(LAT, LON, 150)).pathname).toBe('/arcgis/rest/services/Geoportal/Richtplan_Fussverkehr/MapServer/4/query')
    expect(u(publikumUrl(LAT, LON, 150)).pathname).toContain('/Richtplan_Fussverkehr/MapServer/7/query')
    expect(u(tvmFelderUrl(LAT, LON, 150)).pathname).toContain('/Taktil_visuelle_Markierungen/MapServer/1/query')
    expect(u(tvmLinienUrl(LAT, LON, 150)).pathname).toContain('/Taktil_visuelle_Markierungen/MapServer/2/query')
    expect(u(nutzungszonenUrl(LAT, LON, 150)).pathname).toContain('/Nutzungszonenplan/MapServer/91/query')
    for (const s of [hierarchieUrl, strassentypenUrl, vsigUrl, volksschulenUrl, kindergaertenUrl, oevLinienUrl].map(f => f(LAT, LON, 150))) {
      expect(u(s).pathname).toMatch(/\/MapServer\/0\/query$/)
      expect(u(s).searchParams.get('geometry')).toBe('2599850,1199850,2600150,1200150')
      expect([u(s).searchParams.get('inSR'), u(s).searchParams.get('outSR'), u(s).searchParams.get('f')]).toEqual(['2056', '2056', 'geojson'])
    }
  })
  it('Felder: nur Sachfelder, bei Schulen ohne Adresse, Telefon, E-Mail', () => {
    expect(u(hierarchieUrl(LAT, LON, 150)).searchParams.get('outFields')).toBe('Objectid,Typ_id,Strassenhierarchie,Strassenname')
    expect(u(strassentypenUrl(LAT, LON, 150)).searchParams.get('outFields')).toBe('Objectid,Strgatt_id,Strassentyp,Strassenname')
    expect(u(vsigUrl(LAT, LON, 150)).searchParams.get('outFields')).toBe('Objectid,V_sig,Strassenname')
    expect(u(oevLinienUrl(LAT, LON, 150)).searchParams.get('outFields')).toBe('Objectid,Verkehrsmittel_typ,Nummer_linie')
    for (const s of [volksschulenUrl, kindergaertenUrl].map(f => u(f(LAT, LON, 150)).searchParams.get('outFields')!))
      expect(s).not.toMatch(/Email|Telefon|Strasse|Hausnummer|URL/)
  })
  it('grosse Antworten gerundet und vereinfacht (ÖV-Linien, Nutzungszonen); übrige ohne Vereinfachung', () => {
    expect([u(oevLinienUrl(LAT, LON, 150)).searchParams.get('geometryPrecision'), u(oevLinienUrl(LAT, LON, 150)).searchParams.get('maxAllowableOffset')])
      .toEqual(['1', '1'])
    expect(u(nutzungszonenUrl(LAT, LON, 150)).searchParams.get('maxAllowableOffset')).toBe('0.5')
    expect(u(vsigUrl(LAT, LON, 150)).searchParams.get('maxAllowableOffset')).toBeNull()
    expect(u(arcgisUrl('X', LAT, LON, 150, 'A')).searchParams.get('geometryPrecision')).toBeNull()
  })
})

describe('Geometrie einlesen (gemeinsame Hilfen)', () => {
  it('Linie mit z, MultiLineString, ungültige Punkte; Flächen flach mit Loch; Punkt', () => {
    expect(linienTeile(linie({}, [0, 0], [10, 0])).map(t => t.map(rel))).toEqual([[[0, 0], [10, 0]]])
    expect(linienTeile({ geometry: { type: 'MultiLineString', coordinates: [[xy(0, 0), ['x', 1], xy(5, 5)], [xy(1, 1)]] } }).length).toBe(1)
    expect(linienTeile({ geometry: null })).toEqual([])
    expect(linienTeile(punkt({}, 1, 1))).toEqual([])
    expect(flaechenRinge({ geometry: { type: 'MultiPolygon', coordinates: [[ring(0, 0, 10), ring(2, 2, 2)], [ring(50, 0, 5)]] } }).length).toBe(3)
    expect(flaechenRinge({ geometry: { type: 'Polygon', coordinates: [[xy(0, 0), xy(1, 1)]] } })).toEqual([])
    expect(rel(punktLage(punkt({}, 3, 4))!)).toEqual([3, 4])
    expect(punktLage({ geometry: { type: 'Point', coordinates: [Number.NaN, 1] } })).toBeNull()
  })
})

describe('Richtplan Fussverkehr', () => {
  it('Basisnetz-Linien mit Layer; publikumsattraktive Bereiche als Flächen, andere Hinweise und leere Geometrie entfallen', () => {
    const l = basisnetzAusGeoportal(gj(linie({ Objectid: 1, Layer: 'RP-Inhalt-Basisnetz Fussweg_bestehend' }, [0, 0], [0, 50]),
      linie({ Objectid: 2 }, [5, 0], [5, 10]), { geometry: null, properties: { Objectid: 3 } }))
    expect(l.map(x => [x.id, x.layer, x.teile[0].length])).toEqual([['bernrp:1', 'RP-Inhalt-Basisnetz Fussweg_bestehend', 2], ['bernrp:2', '', 2]])
    const f = publikumAusGeoportal(gj(flaeche({ Objectid: 9, Layer: 'RP-Hinweis-publikumsattraktive Bereiche', Refname: null }, ring(0, 0, 40)),
      flaeche({ Objectid: 10, Layer: 'RP-Hinweis-Wanderwege' }, ring(0, 0, 40)), flaeche({ Objectid: 11 }, ring(0, 0, 4))))
    expect(f.map(x => [x.id, x.name])).toEqual([['bernrph:9', null], ['bernrph:11', null]])
  })
  it('zwei Abfragen: fällt eine aus, fehlt nur ihr Teil (Hinweis); fallen beide aus, Fehler', async () => {
    geoCacheLeeren()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/MapServer/7/')
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify(gj(linie({ Objectid: 1, Layer: 'B' }, [0, 0], [0, 9]))), { status: 200 }))))
    const r = await ladeRichtplanBern(LAT, LON, 150)
    expect(r.daten.basisnetz?.length).toBe(1)
    expect(r.daten.publikum).toBeNull()
    expect(r.hinweis).toBe('publikumsattraktive Bereiche nicht erreichbar (HTTP 503)')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    await expect(ladeRichtplanBern(LAT, LON, 140)).rejects.toThrow('HTTP 500')
    vi.unstubAllGlobals(); geoCacheLeeren()
  })
})

describe('Strassenhierarchie und Strassentypen', () => {
  it('Typ_id 1000–1005 als Typ, unbekannte Id ohne Typ (Text bleibt), MultiLineString', () => {
    const h = hierarchieAusGeoportal(gj(
      linie({ Objectid: 1, Typ_id: 1000, Strassenhierarchie: 'Quartierstrasse', Strassenname: 'Beispielweg' }, [0, 0], [10, 0]),
      linie({ Objectid: 2, Typ_id: 1002, Strassenname: 'Hauptgasse' }, [0, 5], [10, 5]),
      linie({ Objectid: 3, Typ_id: 1001 }, [0, 9], [10, 9]),
      linie({ Objectid: 4, Typ_id: 1099, Strassenhierarchie: 'Neu' }, [0, 1], [1, 1]),
      { geometry: { type: 'MultiLineString', coordinates: [[xy(0, 0), xy(1, 0)], [xy(2, 0), xy(3, 0)]] }, properties: { Objectid: 5, Typ_id: 1005 } },
    ))
    expect(h.map(x => [x.id, x.typ, x.text, x.strasse])).toEqual([['bernsh:1', 'quartier', 'Quartierstrasse', 'Beispielweg'],
      ['bernsh:2', 'basisnetz', 'Basisnetz', 'Hauptgasse'], ['bernsh:3', 'quartierverbindung', 'Quartierverbindungsstrasse', ''],
      ['bernsh:4', null, 'Neu', ''], ['bernsh:5', 'quartier_ergaenzend', 'Quartierstrasse ergänzend', '']])
    expect(h[4].teile.length).toBe(2)
  })
  it('Strgatt_id 1, 2, 3, 5, 6 als Code und Klasse; ohne Id aus dem Text; sonst ohne Typ', () => {
    const t = strassentypenAusGeoportal(gj(
      linie({ Objectid: 1, Strgatt_id: 1, Strassentyp: 'SS_30' }, [0, 0], [1, 0]),
      linie({ Objectid: 2, Strgatt_id: 5 }, [0, 0], [1, 0]),
      linie({ Objectid: 3, Strassentyp: 'VS_50_60' }, [0, 0], [1, 0]),
      linie({ Objectid: 4, Strgatt_id: 4, Strassentyp: 'X' }, [0, 0], [1, 0]),
    ))
    expect(t.map(x => [x.typ, x.klasse, x.text])).toEqual([['SS_30', 'sammel', 'SS_30'], ['HVS_50_60', 'haupt', 'HVS_50_60'],
      ['VS_50_60', 'verbindung', 'VS_50_60'], [null, null, 'X']])
    expect(strassenKlasse('HVS_80')).toBe('haupt')
  })
})

describe('Signalisierte Höchstgeschwindigkeit', () => {
  afterEach(() => { vi.unstubAllGlobals(); geoCacheLeeren() })
  it('V_sig in km/h; leer bzw. ausserhalb 5–130 ohne Angabe', () => {
    const v = vsigAusGeoportal(gj(linie({ Objectid: 1, V_sig: 30, Strassenname: 'Beispielweg' }, [0, 0], [9, 0]),
      linie({ Objectid: 2, V_sig: null }, [0, 0], [9, 0]), linie({ Objectid: 3, V_sig: 999 }, [0, 0], [9, 0]), linie({ Objectid: 4, V_sig: '50' }, [0, 0], [9, 0])))
    expect(v.map(x => [x.id, x.vSig, x.strasse])).toEqual([['bernvsig:1', 30, 'Beispielweg'], ['bernvsig:2', null, ''], ['bernvsig:3', null, ''],
      ['bernvsig:4', null, '']])
  })
  it('einmal geholt, danach aus dem Zwischenspeicher; Antwort ohne LV95 abgelehnt', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(gj(linie({ Objectid: 1, V_sig: 50 }, [0, 0], [9, 0]))), { status: 200 }))
    vi.stubGlobal('fetch', f)
    expect((await ladeVsigBern(LAT, LON, 150)).daten.linien[0].vSig).toBe(50)
    expect((await ladeVsigBern(LAT, LON, 150)).ms).toBe(0)
    expect(f).toHaveBeenCalledTimes(1)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })))
    await expect(ladeVsigBern(LAT, LON, 100)).rejects.toThrow('LV95')
  })
})

describe('Schulen, Kindergärten, Heime', () => {
  afterEach(() => { vi.unstubAllGlobals(); geoCacheLeeren() })
  it('Geoportal: Punkte mit Namen; ohne Lage entfallen', () => {
    const s = schulenAusGeoportal(gj(punkt({ Objectid: 1, Punktname: 'Schulhaus Beispiel', Rubrik_Desc: 'Volksschule' }, 30, 0),
      { geometry: null, properties: { Objectid: 2 } }), 'schule')
    expect(s).toEqual([{ id: 'bernvs:1', art: 'schule', name: 'Schulhaus Beispiel', p: [O[0] + 30, O[1]], quelle: 'geoportal' }])
    expect(schulenAusGeoportal(gj(punkt({ Objectid: 7 }, 0, 0)), 'kindergarten')[0]).toMatchObject({ id: 'bernkg:7', name: 'ohne Namen' })
  })
  it('OSM: Art nach Tags (Heim vor Schule), Knoten, Fläche mit Mittelpunkt bzw. Geometrie; ohne Lage und Doppel entfallen', () => {
    expect(osmSchulArt({ amenity: 'school' })).toEqual({ art: 'schule', tag: 'amenity=school' })
    expect(osmSchulArt({ amenity: 'kindergarten' })?.art).toBe('kindergarten')
    expect(osmSchulArt({ amenity: 'nursing_home' })?.art).toBe('heim')
    expect(osmSchulArt({ amenity: 'social_facility', social_facility: 'group_home' })).toEqual({ art: 'heim', tag: 'social_facility=group_home' })
    expect(osmSchulArt({ amenity: 'social_facility', social_facility: 'assisted_living' })?.art).toBe('sozial')
    expect(osmSchulArt({ building: 'school' })).toBeNull()
    const [la, lo] = wgs(O[0] + 20, O[1] + 10)
    const roh = { elements: [
      { type: 'node', id: 1, lat: la, lon: lo, tags: { amenity: 'school', name: 'Beispielschule' } },
      { type: 'node', id: 1, lat: la, lon: lo, tags: { amenity: 'school', name: 'Beispielschule' } },
      { type: 'way', id: 2, center: { lat: la, lon: lo }, tags: { amenity: 'kindergarten' } },
      { type: 'way', id: 3, geometry: [{ lat: la, lon: lo }, null, { lat: la, lon: lo }], tags: { amenity: 'nursing_home' } },
      { type: 'relation', id: 4, tags: { amenity: 'school' } },
      { type: 'node', id: 5, lat: la, lon: lo, tags: { highway: 'crossing' } },
    ] }
    const s = schulenAusOsm(roh)
    expect(s.map(x => [x.id, x.art, x.name])).toEqual([['osm:node/1', 'schule', 'Beispielschule'], ['osm:way/2', 'kindergarten', 'ohne Namen'],
      ['osm:way/3', 'heim', 'ohne Namen']])
    expect(rel(s[1].p).map(Math.round)).toEqual([20, 10])
    expect(schulenAusOsm(null)).toEqual([])
    // Korrektur S9: Fläche mit Grenzen (out bb) → Umriss als Rechteck, Mittelpunkt daraus
    const [la0, lo0] = wgs(O[0], O[1]), [la1, lo1] = wgs(O[0] + 40, O[1] + 20)
    const f = schulenAusOsm({ elements: [{ type: 'way', id: 7, bounds: { minlat: la0, minlon: lo0, maxlat: la1, maxlon: lo1 }, tags: { amenity: 'school' } }] })[0]
    expect(f.umriss!.length).toBe(4)
    expect(rel(f.p).map(Math.round)).toEqual([20, 10])
    expect(Math.max(...f.umriss!.map(p => rel(p)[0]))).toBeCloseTo(40, 0)
    // Runde 4: Umriss aus den Grenzen ist als Grenzrechteck gekennzeichnet, eine Geometrie nicht
    expect(f.grenzrechteck).toBe(true)
    expect(s[0].grenzrechteck).toBeUndefined()
    const geo = schulenAusOsm({ elements: [{ type: 'way', id: 8, bounds: { minlat: la0, minlon: lo0, maxlat: la1, maxlon: lo1 },
      geometry: [{ lat: la0, lon: lo0 }, { lat: la1, lon: lo0 }, { lat: la1, lon: lo1 }], tags: { amenity: 'school' } }] })[0]
    expect(geo.umriss!.length).toBe(3)
    expect(geo.grenzrechteck).toBeUndefined()
  })
  it('Stand: ausserhalb Berns nur OSM; in Bern Geoportal + OSM, solange es lädt noch nichts; Ausfall: OSM mit Hinweis', () => {
    const roh = { elements: [] }
    expect(schulenStand(null, roh, O, 150)).toEqual({ bern: null, osm: { orte: [], bereich: { mitte: O, radiusM: SCHULEN_OSM_RADIUS_M, form: 'kreis' } } })
    expect(schulenStand(null, null, O, 150)).toBeNull()
    expect(schulenStand(null, null, O, 150, true)).toEqual({ fehler: 'OpenStreetMap nicht geladen' })
    expect(schulenStand({ laedt: true }, roh, O, 150)).toBeNull()
    const d = { daten: { volksschulen: [], kindergaerten: null }, hinweis: 'Kindergärten nicht erreichbar (HTTP 503)' }
    expect(schulenStand(d, roh, O, 150)).toMatchObject({ bern: { volksschulen: [], kindergaerten: null, bereich: { radiusM: 150, form: 'quadrat' } },
      osm: { orte: [] }, hinweis: 'Kindergärten nicht erreichbar (HTTP 503)' })
    expect(schulenStand({ fehler: 'HTTP 503' }, roh, O, 150)).toMatchObject({ bern: null, hinweis: `${GEOPORTAL_BERN} nicht erreichbar (HTTP 503)` })
    expect(schulenStand({ fehler: 'HTTP 503' }, null, O, 150)).toEqual({ fehler: `${GEOPORTAL_BERN} nicht erreichbar (HTTP 503)` })
  })
  it('Laden: Volksschulen und Kindergärten getrennt abgefragt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/Volksschulen/')
      ? gj(punkt({ Objectid: 1, Punktname: 'A' }, 0, 0)) : gj(punkt({ Objectid: 2, Punktname: 'B' }, 1, 0), punkt({ Objectid: 3, Punktname: 'C' }, 2, 0))))))
    const r = await ladeSchulenBern(LAT, LON, 150)
    expect([r.daten.volksschulen?.length, r.daten.kindergaerten?.length, r.hinweis]).toEqual([1, 2, null])
  })
})

describe('Taktil-visuelle Markierungen', () => {
  it('Felder als Punkte, Linien mit Leitlinie auf dem Streifen (Art 1003); eigene Texte, unbekannte Art mit Text des Diensts', () => {
    const f = tvmFelderAusGeoportal(gj(punkt({ Objectid: 1, Art: 1001, Art_beschrieb: 'Aufmerksamkeitsfeld', Baujahr: null }, 0, 0),
      punkt({ Objectid: 2, Art: 1777, Art_beschrieb: 'Sonderfeld', Baujahr: 2024 }, 1, 0)))
    expect(f.map(x => [x.id, x.art, x.text, x.baujahr])).toEqual([['berntvmf:1', 1001, 'Aufmerksamkeitsfeld', null], ['berntvmf:2', 1777, 'Sonderfeld', 2024]])
    const l = tvmLinienAusGeoportal(gj(linie({ Objectid: 5, Art: 1003, Art_beschrieb: 'Leitlinie auf FG', Baujahr: 2025 }, [0, 0], [0, 4]),
      linie({ Objectid: 6, Art: 1001 }, [0, 0], [3, 0]), linie({ Objectid: 7 }, [0, 0], [3, 0])))
    expect(l.map(x => [x.id, x.text, x.aufStreifen])).toEqual([['berntvml:5', 'Leitlinie auf dem Fussgängerstreifen', true],
      ['berntvml:6', 'Leitlinie', false], ['berntvml:7', '', false]])
  })
})

describe('Nutzungszonen', () => {
  it('Grundzone mit Text, Gewerbe = 1004; Fläche mit Loch flach', () => {
    const z = nutzungszonenAusGeoportal(gj(flaeche({ Objectid: 1, U_nutzungszone: 1004, U_nutzungszone_beschrieb: 'IG - Industrie- und Gewerbezone',
      U_bauklasse: 3 }, ring(0, 0, 100), ring(10, 10, 10)), flaeche({ Objectid: 2, U_nutzungszone: 1000 }, ring(200, 0, 10)), { geometry: null }))
    expect(z.map(x => [x.id, x.zone, x.gewerbe, x.bauklasse, x.ringe.length])).toEqual([['bernnz:1', 1004, true, 3, 2], ['bernnz:2', 1000, false, null, 1]])
  })
})

describe('ÖV-Linien', () => {
  afterEach(() => { vi.unstubAllGlobals(); geoCacheLeeren() })
  it('Typ aus Verkehrsmittel_typ; Bus, Trolleybus und Tram fahren auf der Strasse', () => {
    expect(['Bus', 'tram', ' Trolleybus ', 'Zug', 'Drahtseilbahn', 'Schiff', null].map(oevTyp)).toEqual(['bus', 'tram', 'trolleybus', 'zug',
      'drahtseilbahn', null, null])
    expect(strassenOev('tram')).toBe(true)
    expect(strassenOev('zug')).toBe(false)
  })
  it('ganze Linien auf den Ausschnitt zugeschnitten; Linien ganz ausserhalb entfallen', () => {
    const l = oevLinienAusGeoportal(gj(
      { geometry: { type: 'MultiLineString', coordinates: [[xy(-3000, 0, true), xy(-1000, 0, true), xy(-100, 0, true), xy(100, 0, true), xy(3000, 0, true)]] },
        properties: { Objectid: 1, Verkehrsmittel_typ: 'Bus', Nummer_linie: '99' } },
      linie({ Objectid: 2, Verkehrsmittel_typ: 'Tram', Nummer_linie: '98' }, [5000, 0], [6000, 0])), { mitte: O, halbM: 200 })
    expect(l.map(x => [x.id, x.typ, x.nummer, x.teile.map(t => t.map(q => rel(q)[0]))])).toEqual([['bernoev:1', 'bus', '99', [[-1000, -100, 100, 3000]]]])
  })
  it('Laden schneidet auf das Rechteck mit Rand zu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(gj(linie({ Objectid: 1, Verkehrsmittel_typ: 'Tram' },
      [-5000, 0], [-4000, 0], [-10, 0], [10, 0]))))))
    const r = await ladeOevLinienBern(LAT, LON, 150)
    expect(r.daten.linien[0].teile[0].length).toBe(3)
  })
})

describe('Zwei Abfragen gemeinsam und Ergebnis für die Vorbelegung', () => {
  const ok = <T,>(daten: T, ms = 5, bytes = 10): Promise<Abruf<T>> => Promise.resolve({ daten, ms, bytes, quelle: 'map.bern.ch' })
  it('beide da: Ladezeit die längere, Grösse die Summe; Abbruch bricht ab', async () => {
    const r = await arcgisPaar(ok(1, 5, 10), ok(2, 9, 20), ['A', 'B'])
    expect(r).toMatchObject({ daten: { a: 1, b: 2, hinweis: null }, ms: 9, bytes: 30 })
    await expect(arcgisPaar(ok(1), Promise.reject(new DOMException('abgebrochen', 'AbortError')), ['A', 'B'])).rejects.toThrow('abgebrochen')
    const halb = await arcgisPaar(Promise.reject(new Error('HTTP 503')), ok(2), ['A', 'B'])
    expect(halb.daten).toEqual({ a: null, b: 2, hinweis: 'A nicht erreichbar (HTTP 503)' })
  })
  it('Stand -> Ergebnis: lädt null, Fehler, Daten mit Bereich und Hinweis', () => {
    const b = { mitte: O, radiusM: 150, form: 'quadrat' as const }
    expect(bernErgebnis({ laedt: true }, b)).toBeNull()
    expect(bernErgebnis(undefined, b)).toBeNull()
    expect(bernErgebnis({ fehler: 'HTTP 503' }, b)).toEqual({ fehler: 'HTTP 503' })
    expect(bernErgebnis({ daten: { linien: [] } }, b)).toEqual({ linien: [], bereich: b })
    expect(bernErgebnis({ daten: { felder: null, linien: [] }, hinweis: 'X' }, b)).toEqual({ felder: null, linien: [], bereich: b, hinweis: 'X' })
  })
  it('Fehler werden nicht gespeichert (gleiche Abfrage danach erneut geholt)', async () => {
    geoCacheLeeren()
    const g = vi.fn(async () => new Response('{}', { status: 502 }))
    vi.stubGlobal('fetch', g)
    const url = vsigUrl(LAT, LON, 120)
    await expect(arcgisHolen(url)).rejects.toThrow('HTTP 502')
    await expect(arcgisHolen(url)).rejects.toThrow('HTTP 502')
    expect(g).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals(); geoCacheLeeren()
  })
})

describe('Dienstliste und Quellenangabe', () => {
  it('je Dienst Quellenangabe «Geodaten Stadt Bern», Name und Bericht mit «Geoportal Stadt Bern»', () => {
    expect(BERN_C_KEYS).toEqual(Object.keys(BERN_DIENSTE_C))
    for (const k of BERN_C_KEYS) {
      expect(BERN_DIENSTE_C[k].quelle.startsWith(`${GEODATEN_BERN}, `)).toBe(true)
      expect(bernDienstName(k, 150)).toContain(`(${GEOPORTAL_BERN}, ±150 m)`)
      expect(bernDienstBericht(k)).toContain(GEOPORTAL_BERN)
      expect(BERN_DIENSTE_C[k].bericht).not.toMatch(/zebra/i)
    }
  })
  it('Fall-Datei: Quellen der neuen Dienste werden geschrieben und gelesen; alte Fälle laden ohne sie', () => {
    const f = leererFall(46.95, 7.44, null)
    for (const k of BERN_C_KEYS) f.quellen[k] = BERN_DIENSTE_C[k].quelle
    const [g, h] = fallLesen(fallSchreiben(f))
    expect(h).toEqual([])
    for (const k of BERN_C_KEYS) expect(g.quellen[k]).toBe(BERN_DIENSTE_C[k].quelle)
    const alt = JSON.parse(fallSchreiben(leererFall(46.95, 7.44, null)))
    alt.quellen = { osm: 'overpass.osm.ch', haltestellen: `${GEODATEN_BERN}, Haltestellen` }
    const [a, ha] = fallLesen(JSON.stringify(alt))
    expect(ha).toEqual([])
    expect(a.quellen.richtplan).toBeUndefined()
    const falsch = JSON.parse(fallSchreiben(f)); falsch.quellen.oevLinien = 3
    expect(fallLesen(JSON.stringify(falsch))[1]).toContain('Quelle «oevLinien» ungültig, übergangen')
  })
})
