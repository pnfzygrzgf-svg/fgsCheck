import { describe, expect, it } from 'vitest'
import { ausschnittKreis, BAUZONEN, npvmWerteText, dtvStufe, DTV_STUFEN, HALTESTELLEN_BAV, HALTESTELLEN_BERN, haltestellenBernLesen, haltestellenBernUrl, STRASSENKLASSEN_TLM, TRAMGLEISE_TLM, VERKEHRSMODELL_NPVM } from './ebenenAusschnitt'

const halt = (verkehr: string, typ = 'Haltestelle') => ({ featureId: 8507000, geometry: { type: 'Point', coordinates: [2600000, 1200000] }, properties: { name: 'Bern, Bahnhof', verkehrsmittel_de: verkehr, betriebspunkttyp_de: typ } })

describe('Haltestellen BAV', () => {
  it('liest Verkehrsmittel und Lage', () => {
    expect(HALTESTELLEN_BAV.lesen(halt('Tram, Bus'))).toEqual([{ id: 'bav:8507000', punkt: [2600000, 1200000], klasse: 'bus_tram', text: 'Bern, Bahnhof: BAV 8507000; Haltestellenpunkt' }])
    expect(HALTESTELLEN_BAV.lesen(halt('Trolleybus'))[0].klasse).toBe('bus')
    expect(HALTESTELLEN_BAV.lesen(halt('Tram'))[0].klasse).toBe('tram')
  })
  it('liest auch MultiPoint, wie ihn der Dienst liefert', () => {
    const f = { ...halt('Bus / Tram'), geometry: { type: 'MultiPoint', coordinates: [[2600000, 1200000]] } }
    expect(HALTESTELLEN_BAV.lesen(f).map(o => [o.id, o.klasse, o.punkt])).toEqual([['bav:8507000', 'bus_tram', [2600000, 1200000]]])
    const zwei = { ...halt('Bus'), geometry: { type: 'MultiPoint', coordinates: [[2600000, 1200000], [2600010, 1200000]] } }
    expect(HALTESTELLEN_BAV.lesen(zwei).map(o => o.id)).toEqual(['bav:8507000:0', 'bav:8507000:1'])
  })
  it('lässt anderes weg', () => {
    expect(HALTESTELLEN_BAV.lesen(halt('Zug'))).toEqual([])
    expect(HALTESTELLEN_BAV.lesen(halt('Bus', 'Betriebspunkt'))).toEqual([])
    expect(HALTESTELLEN_BAV.lesen({ featureId: 1, properties: { betriebspunkttyp_de: 'Haltestelle', verkehrsmittel_de: 'Bus' } })).toEqual([])
  })
})

const linie = { type: 'MultiLineString', coordinates: [[[2600000, 1200000], [2600010, 1200000]]] }

describe('Haltekanten BAV', () => {
  it('liest Kanten getrennt von den Haltestellen', () => {
    const [k] = HALTESTELLEN_BAV.lesen({ featureId: 7, geometry: { type: 'MultiPoint', coordinates: [[2600000, 1200000]] }, properties: { haltestelle: 'Bern, Hirschengraben', nummer_text: 'ch:1:sloid:79896:0:4', bezeichnung_de: 'C' } })
    expect(k).toMatchObject({ id: 'bav:k:7', klasse: 'kante', punkt: [2600000, 1200000], text: 'Bern, Hirschengraben, Kante C: BAV ch:1:sloid:79896:0:4' })
    expect(HALTESTELLEN_BAV.legende.map(l => l[0])).toContain('kante')
  })
})

describe('Haltestellen Stadt Bern', () => {
  const lv = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2056' } }
  const punkt = (properties: Record<string, unknown>) => ({ geometry: { type: 'Point', coordinates: [2600000, 1200000] }, properties })
  it('liest je Haltekante einen Punkt und lässt Drahtseilbahnen weg', () => {
    const o = haltestellenBernLesen({ crs: lv, features: [punkt({ Objectid: 1, Punktname: 'Bahnhof', Kante: 'C', Rubrik: 'Haltestelle' }), punkt({ Objectid: 2, Rubrik: 'Station Drahtseilbahn' }),
      punkt({ Objectid: 3 }), { geometry: null, properties: {} }] })
    expect(o.map(x => x.id)).toEqual(['bernhst:1', 'bernhst:3'])
    expect(o[0]).toMatchObject({ punkt: [2600000, 1200000], klasse: 'oev', text: 'Bahnhof, Kante C (Geoportal Stadt Bern)' })
    expect(o[1].text).toBe('ohne Namen (Geoportal Stadt Bern)')
  })
  it('nimmt eine fehlerhafte Antwort nicht als leer', () => {
    expect(() => haltestellenBernLesen({ crs: lv, error: { code: 500, message: 'kaputt' } })).toThrow(/ArcGIS 500/)
    expect(() => haltestellenBernLesen({ crs: lv, exceededTransferLimit: true })).toThrow(/unvollständig/)
    expect(() => haltestellenBernLesen({ features: [] })).toThrow(/LV95/)
  })
  it('fragt die Stadt ausserhalb von Bern gar nicht', async () => {
    const roh = globalThis.fetch
    let gefragt = 0
    globalThis.fetch = (async () => { gefragt++; return new Response('{}') }) as typeof fetch
    try { expect(await HALTESTELLEN_BERN.laden('2683000,1247000,2683500,1247500', new AbortController().signal)).toEqual([]); expect(gefragt).toBe(0) }
    finally { globalThis.fetch = roh }
    expect(new URL(haltestellenBernUrl('1,2,3,4')).searchParams.get('geometry')).toBe('1,2,3,4')
  })
})

describe('Angaben des Verkehrsmodells', () => {
  it('nennt DWV, Spitzen und Schwerverkehr, wo sie vorliegen', () => {
    expect(npvmWerteText({ dtv: 4933, dwv: 5534, msp: 429, asp: 472, lw: 113, lz: 56 })).toBe('DTV 4 933, DWV 5 534 Fahrzeuge je Tag; Morgenspitze 429, Abendspitze 472 Fahrzeuge je Stunde; Schwerverkehr 169 Fahrzeuge je Tag (Lastwagen 113, Lastzüge 56); beide Richtungen, bei getrennten Fahrbahnen je Fahrbahn; modelliert (NPVM)')
    expect(npvmWerteText({ dtv: 4933 })).toBe('DTV 4 933 Fahrzeuge je Tag; beide Richtungen, bei getrennten Fahrbahnen je Fahrbahn; modelliert (NPVM)')
  })
})

describe('Ebenen des Bundes', () => {
  it('Tramgleise: nur Tram in Betrieb', () => {
    const f = (verkehrsmittel: number, ausser_betrieb: number) => ({ featureId: 7, geometry: linie, properties: { verkehrsmittel, ausser_betrieb } })
    expect(TRAMGLEISE_TLM.lesen(f(200, 1)).map(o => [o.id, o.klasse])).toEqual([['tlm.tram:7', 'tram']])
    expect(TRAMGLEISE_TLM.lesen(f(100, 1))).toEqual([])
    expect(TRAMGLEISE_TLM.lesen(f(200, 2))).toEqual([])
  })
  it('Strassenklassen: Verkehrsbedeutung bestimmt die Klasse', () => {
    const f = (verkehrsbedeutung: number, strassenname = '') => ({ featureId: 8, geometry: linie, properties: { verkehrsbedeutung, strassenname } })
    expect(STRASSENKLASSEN_TLM.lesen(f(200, 'Bollwerk'))[0]).toMatchObject({ klasse: 'strasse200', text: 'Bollwerk: Durchgangsstrasse (swissTLM3D)' })
    expect(STRASSENKLASSEN_TLM.lesen(f(300))[0].klasse).toBe('strasse300')
    expect(STRASSENKLASSEN_TLM.lesen(f(999998))[0]).toMatchObject({ klasse: 'strasse', text: 'Verkehrsbedeutung unbekannt (swissTLM3D)' })
  })
  it('Bauzonen: jede Teilfläche ein Objekt', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]]
    const l = BAUZONEN.lesen({ featureId: 9, geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] }, properties: { ch_bez_d: 'Wohnzonen' } })
    expect(l.map(o => o.id)).toEqual(['bauzonen:9:0', 'bauzonen:9:1'])
    expect(l[0]).toMatchObject({ klasse: 'bauzone', ringe: [ring], text: 'Wohnzonen; kein Nachweis der Innerortslage' })
  })
  it('NPVM: DTV als Wert, Spitzen im Text, Strecken ohne DTV fallen weg', () => {
    const [o] = VERKEHRSMODELL_NPVM.lesen({ featureId: 2659357, geometry: { type: 'LineString', coordinates: linie.coordinates[0] }, properties: { dtv_fzg: 4933, msp_fzg: 429, asp_fzg: 472 } })
    expect(o).toMatchObject({ id: 'npvm:2659357', klasse: 'd5', wert: '4 933', text: 'DTV 4 933 Fahrzeuge je Tag; Morgenspitze 429, Abendspitze 472 Fahrzeuge je Stunde; beide Richtungen, bei getrennten Fahrbahnen je Fahrbahn; modelliert (NPVM)' })
    expect(VERKEHRSMODELL_NPVM.lesen({ featureId: 1, geometry: linie, properties: {} })).toEqual([])
  })
  it('kennt für jede Stufe des DTV einen Eintrag der Legende', () => {
    for (const v of [100, 3000, 8000, 15000, 30000]) expect(DTV_STUFEN.map(l => l[0])).toContain(dtvStufe(v))
  })
  it('rechnet das Rechteck in Mitte und halbe Kante um', () => {
    expect(ausschnittKreis('2600000.0,1200000.0,2600600.0,1200200.0')).toEqual({ mitte: [2600300, 1200100], r: 300 })
  })
})
