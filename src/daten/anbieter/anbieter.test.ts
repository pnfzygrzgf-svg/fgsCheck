// E0: Vertrag zwischen neuem Register und bestehenden Schnittstellen. Gespeicherte Antwort plus synthetische
// Grenz- und Fehlerfälle; kein Live-Abruf und keine Änderung bestehender Verhaltenstests.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wgs } from '../../geo'
import { arcgisPruefen, geoCacheLeeren, type ArcgisGeoJson } from '../geoportal'
import { quelle } from '../quellenregister'
import { BERN_DIENSTE_C, bernDienstBericht, bernDienstName } from '../bernDienste'
import { ladeVsigBern, vsigAusGeoportal, vsigTempo, vsigUrl, VSIG_DIENST } from '../vsig'
import { ANBIETER } from './index'
import probe from './testdaten/bernTempo.json'

const anbieter = ANBIETER['bern.vsig']
const [LAT, LON] = wgs(2600000, 1200000)
const LINIE = [[2600000, 1200000, 0], [2600010, 1200000, 0]]
const antwort = (properties: Record<string, unknown> = {}): ArcgisGeoJson => ({
  crs: { properties: { name: 'EPSG:2056' } },
  features: [{ geometry: { type: 'LineString', coordinates: LINIE }, properties: { Objectid: 7, V_sig: 30,
    V_afu: 50, V_afu_manuell: 40, Strassenname: ' Beispielweg ', ...properties } }],
})
const daten = { linien: [{ id: 'bernvsig:7', strasse: 'Beispielweg', vSig: 30, vAfu: 40,
  teile: [[[2600000, 1200000], [2600010, 1200000]]] }] }
const response = (roh: unknown) => new Response(JSON.stringify(roh), { status: 200 })

afterEach(() => { vi.unstubAllGlobals(); geoCacheLeeren() })

describe('E0 Anbieter-Register', () => {
  it('Berner Tempo und BAV registriert; bestehende Berner Quellenkennung, Gebiet, Lizenz und Datenschutz aus demselben Eintrag', () => {
    expect(Object.keys(ANBIETER)).toEqual(['bern.vsig', 'bav.halt', 'are.npvm', 'zh.tempo', 'zh.zone'])
    expect(anbieter.quelle).toBe(quelle('bern.vsig'))
    expect(anbieter.quelle.gebiet).toEqual({ art: 'gemeinden', bfs: [351], name: 'Stadt Bern' })
    expect(anbieter.quelle).toMatchObject({ dienst: 'arcgis', empfaenger: 'bern', cors: true,
      lizenz: 'Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht', datenschutz: 'signalisierte Höchstgeschwindigkeit' })
    expect(anbieter.quelle.module).toContain('daten/anbieter/bernTempo.ts')
    expect(anbieter).toMatchObject({ thema: 'tempo', format: 'geojson', datenart: 'signalisiert', datenstand: null,
      abdeckung: { vollstaendigkeit: 'unbekannt' } })
  })

  it('bestehende Lader verwenden den Registereintrag; Namen und Quellenangaben bleiben erhalten', () => {
    expect(ladeVsigBern).toBe(anbieter.laden)
    expect(vsigUrl).toBe(anbieter.url)
    expect(BERN_DIENSTE_C.vsig.laden).toBe(anbieter.laden)
    expect(BERN_DIENSTE_C.vsig.quelleId).toBe(anbieter.quelle.id)
    expect(BERN_DIENSTE_C.vsig.quelle).toBe('Geodaten Stadt Bern, Signalisierte Höchstgeschwindigkeit')
    expect(bernDienstName('vsig', 150)).toBe('Signalisierte Höchstgeschwindigkeit Stadt Bern (Geoportal Stadt Bern, ±150 m)')
    expect(bernDienstBericht('vsig')).toBe('Signalisierte Höchstgeschwindigkeit (Vorbelegung Bedarf): ' +
      'Geodaten Stadt Bern, Signalisierte Höchstgeschwindigkeit (Geoportal Stadt Bern, ArcGIS REST map.bern.ch)')
  })

  it('Abfrage bleibt derselbe Berner Dienst in LV95, mit denselben Feldern und derselben Genauigkeit', () => {
    const url = new URL(anbieter.url(LAT, LON, 150))
    expect(VSIG_DIENST).toBe('Signalisierte_Hoechstgeschwindigkeit')
    expect(url.origin + url.pathname).toBe('https://map.bern.ch/arcgis/rest/services/Geoportal/' +
      'Signalisierte_Hoechstgeschwindigkeit/MapServer/0/query')
    expect(Object.fromEntries(url.searchParams)).toEqual({ geometry: '2599850,1199850,2600150,1200150',
      geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'Objectid,V_sig,V_afu,V_afu_manuell,Strassenname', outSR: '2056', f: 'geojson', geometryPrecision: '2' })
  })

  it('bisherige Datenform einschliesslich AFU-Vorrang, Kennung und zweidimensionaler Geometrie', () => {
    expect(anbieter.umwandeln(antwort())).toEqual(daten)
    expect(vsigAusGeoportal(antwort())).toEqual(daten.linien)
    expect(anbieter.umwandeln(antwort({ V_afu_manuell: null })).linien[0].vAfu).toBe(50)
  })

  it('gespeicherte echte Antwort: mehrere Linienteile, Höhe entfällt, leerer Wert bleibt erhalten', () => {
    arcgisPruefen(probe)
    const { linien } = anbieter.umwandeln(probe)
    expect(linien.map(l => [l.id, l.strasse, l.vSig])).toEqual([
      ['bernvsig:81', 'Lentulusstrasse', 30], ['bernvsig:83', 'Lentulusrain', 20],
      ['bernvsig:2640', 'Schwarzenburgstrasse', null],
    ])
    expect(linien[0].teile).toEqual([
      [[2599171.8, 1198713.01], [2599174.47, 1198710.96], [2599210.26, 1198758.51]],
      [[2599174.47, 1198710.96], [2599174.5, 1198710.94]],
    ])
    expect(linien[1].teile).toEqual([[[2599107.92, 1198876.42], [2599114.71, 1198885.2]]])
    expect(linien.every(l => !('vAfu' in l))).toBe(true)
  })

  it('leerer nächster Wert bleibt ohne Tempo, statt eine weiter entfernte Linie zu übernehmen', () => {
    const roh = antwort({ V_sig: null, V_afu: null, V_afu_manuell: null })
    roh.features!.push({ geometry: { type: 'LineString', coordinates: [[2600000, 1200002], [2600010, 1200002]] },
      properties: { Objectid: 8, V_sig: 50 } })
    const d = anbieter.umwandeln(roh)
    expect(d.linien[0]).toEqual({ id: 'bernvsig:7', strasse: 'Beispielweg', vSig: null,
      teile: [[[2600000, 1200000], [2600010, 1200000]]] })
    expect(vsigTempo(d)([2600005, 1200000], [1, 0])).toBeNull()
  })

  it('Register und bisheriger Lader teilen dieselbe Abfrage und denselben Zwischenspeicher', async () => {
    const roh = antwort(), holen = vi.fn(async () => response(roh))
    vi.stubGlobal('fetch', holen)
    const r = await anbieter.laden(LAT, LON, 150)
    expect(r.daten).toEqual(daten)
    expect(r.quelle).toBe('map.bern.ch')
    expect(r.bytes).toBe(JSON.stringify(roh).length)
    expect(holen.mock.calls[0]).toEqual([anbieter.url(LAT, LON, 150), { signal: expect.any(AbortSignal) }])
    expect(await ladeVsigBern(LAT, LON, 150)).toEqual({ ...r, ms: 0 })
    expect(holen).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['HTTP-Fehler', () => new Response('{}', { status: 503 }), 'HTTP 503'],
    ['ArcGIS-Fehler bei HTTP 200', () => response({ error: { code: 400, message: 'Abfrage ungültig' } }), 'ArcGIS 400'],
    ['falsches Koordinatensystem', () => response({ ...antwort(), crs: { properties: { name: 'EPSG:4326' } } }), 'LV95'],
    ['Übertragungsgrenze', () => response({ ...antwort(), exceededTransferLimit: true }), 'Übertragungsgrenze'],
    ['Übertragungsgrenze in properties', () => response({ ...antwort(), properties: { exceededTransferLimit: true } }), 'Übertragungsgrenze'],
  ])('%s bleibt ein Fehler und wird nicht gespeichert', async (_name, fehlerAntwort, text) => {
    const holen = vi.fn().mockImplementationOnce(async () => fehlerAntwort()).mockImplementationOnce(async () => response(antwort()))
    vi.stubGlobal('fetch', holen)
    await expect(anbieter.laden(LAT, LON, 150)).rejects.toThrow(text)
    expect((await ladeVsigBern(LAT, LON, 150)).daten).toEqual(daten)
    expect(holen).toHaveBeenCalledTimes(2)
  })

  it('Abbruch erreicht den Abruf, bleibt AbortError und verhindert einen Eintrag im Zwischenspeicher', async () => {
    const ctrl = new AbortController()
    const holen = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const abbrechen = () => reject(new DOMException('abgebrochen', 'AbortError'))
      if (init?.signal?.aborted) abbrechen()
      else init?.signal?.addEventListener('abort', abbrechen, { once: true })
    }))
    vi.stubGlobal('fetch', holen)
    const abruf = anbieter.laden(LAT, LON, 150, ctrl.signal)
    ctrl.abort()
    await expect(abruf).rejects.toMatchObject({ name: 'AbortError' })
    const neu = vi.fn(async () => response(antwort()))
    vi.stubGlobal('fetch', neu)
    expect((await ladeVsigBern(LAT, LON, 150)).daten).toEqual(daten)
    expect(neu).toHaveBeenCalledTimes(1)
  })
})
