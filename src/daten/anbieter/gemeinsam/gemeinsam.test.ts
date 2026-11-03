import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wgs } from '../../../geo'
import { BAV_LAYER, bavCacheLeeren, bavUmwandeln, bavDatenstand, ladeBav } from './bav'
import { GEBIET_LAYER, gebietCacheLeeren, gebietUrls, gemeindenUmwandeln } from './gebiet'
import { ladeGeoAdmin } from './geoAdmin'
import { ladeOrtQuellen } from './ortQuellen'
import { amtlicheQuellenLesen, bavLesen, gebietLesen } from './speicher'
import type { BavSnapshot } from './typen'
import bavRoh from './testdaten/bav-zuerich.json'
import gebietRoh from './testdaten/gebiet-zuerich.json'

const [LAT, LON] = wgs(2683105, 1247126)
const legende = readFileSync(join(__dirname, 'testdaten/bav-legende.html'), 'utf8')
const istLegende = (url: unknown) => String(url).includes('/legend?')
const antwort = (x: unknown) => new Response(JSON.stringify(x), { status: 200 })
afterEach(() => { vi.unstubAllGlobals(); bavCacheLeeren(); gebietCacheLeeren() })

async function snapshot(): Promise<BavSnapshot> {
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => istLegende(url) ? new Response(legende) : antwort(bavRoh)))
  return (await ladeBav(LAT, LON)).daten
}

describe('BAV: echte Antwort und geeignete Objekte', () => {
  it('liest den Datenstand aus der offiziellen Legende; ungültige Tage und ein blosses Abrufdatum gelten nicht als Datenstand', () => {
    expect(bavDatenstand(legende)).toBe('2026-11-01')
    expect(bavDatenstand('<td>Datenstand</td><td>31.02.2026</td>')).toBeNull()
    expect(bavDatenstand('Last-Modified: 01.11.2026')).toBeNull()
  })
  it('Metadaten-Ausfall erhält die Haltestellen; Datum bleibt ehrlich unbekannt und der Hinweis wird gespeichert', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => istLegende(url) ? new Response('', { status: 503 }) : antwort(bavRoh)))
    const r = await ladeBav(LAT, LON)
    expect(r.daten.halte).toHaveLength(1)
    expect(r.daten.datenstand).toBeNull()
    expect(r.daten.datenstandHinweis).toContain('503')
    expect(bavLesen(r.daten)).toEqual(r.daten)
  })
  it('ein Neuabruf übernimmt einen neuen Datenstand und neue Objekte gemeinsam; gespeicherter alter Ausschnitt bleibt unverändert', async () => {
    const alt = await snapshot()
    const neuRoh = structuredClone(bavRoh)
    for (const f of neuRoh.results) if (f.properties.name === 'Zürich, Paradeplatz') f.properties.name = 'Zürich, Paradeplatz neu'
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => istLegende(url)
      ? new Response(legende.replace('01.11.2026', '08.11.2026')) : antwort(neuRoh)))
    const neu = (await ladeBav(LAT, LON, 200, undefined, true)).daten
    expect(neu.datenstand).toBe('2026-11-08')
    expect(neu.halte[0].name).toBe('Zürich, Paradeplatz neu')
    expect(bavLesen(neu)).toEqual(neu)
    expect(alt.datenstand).toBe('2026-11-01')
    expect(alt.halte[0].name).toBe('Zürich, Paradeplatz')
  })
  it('dedupliziert Haltestellen; Haltekanten ohne Modus und Abzweigungen werden nicht als aktive Haltestellen gezählt', () => {
    const d = bavUmwandeln(bavRoh)
    expect(d.halte).toHaveLength(3)
    expect(d.halte.find(h => h.nummer === '8591299')).toMatchObject({ name: 'Zürich, Paradeplatz', art: 'bus_tram', p: [2683105, 1247126] })
    expect(d.halte.find(h => h.nummer === '8591316')?.art).toBe('tram')
    expect(d.halte.every(h => h.id.startsWith('bav:') && !h.id.includes('sloid'))).toBe(true)
  })
  it('ausser Betrieb, Zug und unbekannter Modus ergeben keine Bus-/Tramhaltestellen', () => {
    const f = bavRoh.results.find(f => f.properties.name === 'Zürich, Paradeplatz')!
    for (const properties of [ { ...f.properties, betriebspunkttyp_de: 'Haltestelle ausser Betrieb' },
      { ...f.properties, verkehrsmittel_de: 'Zug' }, { ...f.properties, verkehrsmittel_de: '' } ])
      expect(bavUmwandeln({ results: [{ ...f, properties }] }).halte).toEqual([])
  })
  it('falsche Quelle, falsche Koordinaten und widersprüchliche Kennungen werden als Fehler sichtbar', () => {
    const f = bavRoh.results.find(f => f.properties.name === 'Zürich, Paradeplatz')!
    expect(() => bavUmwandeln({ results: [{ ...f, layerBodId: 'falsch' }] })).toThrow('Datenquelle')
    expect(() => bavUmwandeln({ results: [{ ...f, geometry: { type: 'Point', coordinates: [8.54, 47.37] } }] })).toThrow('LV95')
    expect(() => bavUmwandeln({ results: [f, { ...f, properties: { ...f.properties, name: 'Anderer Name' } }] })).toThrow('widersprüchlich')
  })
  it('schneidet auf den abgefragten Ausschnitt zu; Cache erhält den ursprünglichen Abrufzeitpunkt', async () => {
    const d = await snapshot(), holen = vi.mocked(fetch)
    expect(d.halte.map(h => h.name)).toEqual(['Zürich, Paradeplatz'])
    expect(d.datenstand).toBe('2026-11-01')
    expect(d.vollstaendigkeit).toBe('unbekannt')
    const r = await ladeBav(LAT, LON)
    expect(r.daten).toEqual(d); expect(r.ms).toBe(0); expect(holen).toHaveBeenCalledTimes(2)
    await ladeBav(LAT, LON, 200, undefined, true)
    expect(holen).toHaveBeenCalledTimes(4)
    const url = new URL(String(holen.mock.calls[0][0]))
    expect(url.searchParams.get('layers')).toBe(`all:${BAV_LAYER}`)
    expect(url.searchParams.get('sr')).toBe('2056')
    expect(url.searchParams.get('tolerance')).toBe('0')
  })
})

describe('GeoAdmin: Antwortgrenzen und Fehler', () => {
  it('blättert nach Rohanzahl weiter, auch wenn die erste Seite nur doppelte oder später verworfene Punkte enthält', async () => {
    const f = bavRoh.results[0]
    let seite = 0
    const holen = vi.fn(async (url: unknown) => istLegende(url) ? new Response(legende) : seite++ === 0
      ? antwort({ results: Array.from({ length: 200 }, () => f) })
      : antwort({ results: [bavRoh.results.find(f => f.properties.name === 'Zürich, Paradeplatz')] }))
    vi.stubGlobal('fetch', holen)
    const r = await ladeBav(LAT, LON)
    expect(r.daten.halte.map(h => h.name)).toEqual(['Zürich, Paradeplatz'])
    expect(new URL(String(holen.mock.calls.filter(c => !istLegende(c[0]))[1][0])).searchParams.get('offset')).toBe('200')
  })
  it('Übertragungsgrenze, ungültige Antwort und HTTP-Fehler sind keine leere erfolgreiche Antwort', async () => {
    const url = 'https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?layers=x'
    for (const body of [{ results: [], exceededTransferLimit: true }, {}, { error: { message: 'nicht verfügbar' } }]) {
      vi.stubGlobal('fetch', vi.fn(async () => antwort(body)))
      await expect(ladeGeoAdmin(url)).rejects.toThrow()
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(ladeBav(LAT, LON)).rejects.toThrow('HTTP 503')
    vi.stubGlobal('fetch', vi.fn(async () => antwort(bavRoh)))
    expect((await ladeBav(LAT, LON)).daten.halte).toHaveLength(1)
  })
  it('beendet einen dauerhaft gesättigten Dienst mit einem Fehler statt einer scheinbar vollständigen Teilmenge', async () => {
    const holen = vi.fn(async () => antwort({ results: Array.from({ length: 200 }, () => bavRoh.results[0]) }))
    vi.stubGlobal('fetch', holen)
    await expect(ladeBav(LAT, LON)).rejects.toThrow('nicht vollständig')
    expect(holen).toHaveBeenCalledTimes(6)
  })
})

describe('Gebietsbestimmung ohne AV', () => {
  it('aktueller Jahresstand ist ausdrücklich gesetzt; Punkt und Ausschnitt bleiben getrennt', () => {
    const urls = gebietUrls(LAT, LON, 200, 2026).map(u => new URL(u))
    expect(urls.map(u => u.searchParams.get('geometryType'))).toEqual(['esriGeometryPoint', 'esriGeometryEnvelope'])
    expect(urls.every(u => u.searchParams.get('timeInstant') === '2026' && u.searchParams.get('returnGeometry') === 'false')).toBe(true)
    expect(gemeindenUmwandeln(gebietRoh, 2026)).toEqual([{ bfs: 261, kanton: 'ZH', name: 'Zürich' }])
  })
  it('keine historischen Gemeinden übernehmen und Grenztreffer nicht willkürlich auf die erste Gemeinde reduzieren', () => {
    const f = gebietRoh.results[0]
    expect(gemeindenUmwandeln({ results: [{ ...f, attributes: { ...f.attributes, is_current_jahr: false } }] }, 2026)).toEqual([])
    const zwei = gemeindenUmwandeln({ results: [f, { ...f, attributes: { ...f.attributes, gde_nr: 355, kanton: 'BE', gemname: 'Köniz' } }] }, 2026)
    expect(zwei.map(g => g.bfs)).toEqual([261, 355])
  })
})

describe('Ortquellen: Speichern, Wiederöffnen und unabhängige Fehler', () => {
  it('Snapshot wird geprüft und erhält Werte, Herkunft, Geometrie und Abrufzeit; ungültige Snapshots fallen nicht still auf neue Abrufe zurück', async () => {
    const b = await snapshot(), hinweise: string[] = []
    expect(amtlicheQuellenLesen(JSON.parse(JSON.stringify({ bav: b })), hinweise)).toEqual({ bav: b })
    expect(hinweise).toEqual([])
    expect(bavLesen({ ...b, url: 'https://fremd.example/identify' })).toBeNull()
    expect(bavLesen({ ...b, halte: [{ ...b.halte[0], p: [8.5, 47.3] }] })).toBeNull()
    expect(amtlicheQuellenLesen(undefined, [])).toBeUndefined()
    expect(gebietLesen({})).toBeNull()
  })
  it('Wiederöffnen lädt beide Quellen erneut und übernimmt einen neuen Quellenstand trotz Cache', async () => {
    const bav = vi.fn(), gebiet = vi.fn()
    let stand = '01.11.2026'
    const holen = vi.fn(async (url: unknown) => istLegende(url) ? new Response(legende.replace('01.11.2026', stand)) :
      new URL(String(url)).searchParams.get('layers') === `all:${GEBIET_LAYER}` ? antwort(gebietRoh) : antwort(bavRoh))
    vi.stubGlobal('fetch', holen)
    await ladeOrtQuellen(LAT, LON, new AbortController().signal, { bav, gebiet })
    expect(bav.mock.calls.at(-1)![0].daten.datenstand).toBe('2026-11-01')
    stand = '08.11.2026'
    await ladeOrtQuellen(LAT, LON, new AbortController().signal, { bav, gebiet })
    expect(bav.mock.calls.at(-1)![0].daten.datenstand).toBe('2026-11-08')
    expect(gebiet.mock.calls.at(-1)![0].daten.amOrt[0].bfs).toBe(261)
    expect(holen).toHaveBeenCalledTimes(8)
  })
  it('BAV-Ausfall lässt Gebietsbestimmung zu; dafür sind weder AV noch OSM nötig', async () => {
    const bav = vi.fn(), gebiet = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new URL(url).searchParams.get('layers') === `all:${GEBIET_LAYER}`
      ? antwort(gebietRoh) : new Response('{}', { status: 503 })))
    await ladeOrtQuellen(LAT, LON, new AbortController().signal, { bav, gebiet })
    expect(bav).toHaveBeenLastCalledWith({ fehler: 'HTTP 503' })
    expect(gebiet.mock.calls.at(-1)![0].daten.amOrt).toEqual([{ bfs: 261, kanton: 'ZH', name: 'Zürich' }])
  })
  it('abgebrochene Orte liefern keine verspäteten Ergebnisse und keine gespeicherten Cache-Daten', async () => {
    const ctrl = new AbortController(), bav = vi.fn(), gebiet = vi.fn()
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('abgebrochen', 'AbortError')), { once: true })
    })))
    const p = ladeOrtQuellen(LAT, LON, ctrl.signal, { bav, gebiet }); ctrl.abort(); await p
    expect(bav.mock.calls).toEqual([[{ laedt: true }]])
    expect(gebiet.mock.calls).toEqual([[{ laedt: true }]])
    vi.stubGlobal('fetch', vi.fn(async () => antwort(bavRoh)))
    expect((await ladeBav(LAT, LON)).daten.halte).toHaveLength(1)
  })
})
