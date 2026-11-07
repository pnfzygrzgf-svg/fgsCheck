import { afterEach, describe, expect, it, vi } from 'vitest'
import { avParsen } from './av'
import { arcgisFlaechen, avErsatz, imLuzernRechteck, LUZERN_QUALITAET, luzernAlsAv } from './ersatzLuzern'
import { luzernFelder, luzernParkTyp, parkQuelleAmOrt } from './parkLuzern'

const flaeche = { type: 'Polygon', coordinates: [[[2665000, 1211000], [2665010, 1211000], [2665010, 1211010], [2665000, 1211010], [2665000, 1211000]]] }
const antwort = (features: unknown) => new Response(JSON.stringify({ features }), { status: 200 })
afterEach(() => { vi.unstubAllGlobals() })

describe('luzernAlsAv', () => {
  const roh = luzernAlsAv({ features: [{ properties: { ART_BB: 5000 }, geometry: flaeche }, { properties: { ART_BB: 2 }, geometry: flaeche }, { properties: { ART_BB: 0 }, geometry: flaeche }, { properties: { ART_BB: 13 }, geometry: flaeche }, { properties: {}, geometry: flaeche }] },
    { features: [{ properties: { BFS_NR: 1059, GEMEINDE: 'Kriens' }, geometry: flaeche }] })
  const av = avParsen(roh)
  it('übersetzt in die Arten der AV und nimmt Gebäude nur aus den Blockmodellen', () => {
    expect(av.map(f => f.art)).toEqual(['Strasse_Weg', 'Trottoir', 'Gebaeude'])
  })
  it('behält Gemeinde und Kanton, damit die Zuständigkeit stimmt', () => {
    expect(av.map(f => f.bfs)).toEqual([1061, 1061, 1059])
    expect(av.every(f => f.kanton === 'LU')).toBe(true)
  })
  it('ist als Ersatz erkennbar', () => {
    expect(av[0].qualitaet).toBe(LUZERN_QUALITAET)
    expect(avErsatz(av)).toBe(true)
    expect(avErsatz([{ qualitaet: 'AV93' }])).toBe(false)
    expect(avErsatz(null)).toBe(false)
  })
})

describe('imLuzernRechteck', () => {
  it('fragt nur um Luzern nach der Gemeinde', () => {
    expect(imLuzernRechteck(2665900, 1211000)).toBe(true)
    expect(imLuzernRechteck(2600000, 1200000)).toBe(false)
  })
})

describe('arcgisFlaechen', () => {
  it('blättert bis zur kurzen Seite', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => antwort(new URL(url).searchParams.get('resultOffset') === '0' ? Array.from({ length: 2000 }, () => ({})) : [{}])))
    expect((await arcgisFlaechen('https://x.ch/q', [1, 2, 3, 4], 'A')).daten.features).toHaveLength(2001)
  })
  it('wirft bei einer Fehlerantwort, statt leer zu melden', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 400 } }), { status: 200 })))
    await expect(arcgisFlaechen('https://x.ch/q', [1, 2, 3, 4], 'A')).rejects.toThrow('ungültige Antwort')
  })
})

describe('Parkfelder Luzern', () => {
  it('ordnet die Arten des Dienstes zu', () => {
    expect(luzernParkTyp('Auto-Parkplatz', null)).toBe('Parkfeld')
    expect(luzernParkTyp('Güterumschlagplatz', null)).toBe('Parkfeld')
    expect(luzernParkTyp('Zweiradabstellplatz', 'nur Velos')).toBe('Parkplatz_Velo')
    expect(luzernParkTyp('Zweiradabstellplatz', 'nur Motos')).toBe('Parkplatz_Motorrad')
    expect(luzernParkTyp('Blaulicht', null)).toBeNull()
    expect(luzernParkTyp(null, null)).toBeNull()
  })
  it('liefert Felder mit Klasse des Kerns', () => {
    const f = luzernFelder({ features: [{ properties: { OBJECTID: 1, SUBTYPE_TEXT: 'Auto-Parkplatz' }, geometry: flaeche }, { properties: { OBJECTID: 2, SUBTYPE_TEXT: 'Zweiradabstellplatz', ZWEIRAD_SIGNAL_TEXT: 'nur Motos' }, geometry: flaeche }] })
    expect(f.map(x => x.klasse)).toEqual(['auto', 'motorrad'])
    expect(f[0].id.startsWith('luzernpark:')).toBe(true)
  })
  it('gilt nur für die Stadt Luzern, Bern bleibt Bern', () => {
    expect(parkQuelleAmOrt([1061])?.id).toBe('luzernpark')
    expect(parkQuelleAmOrt([351])?.id).toBe('bernpark')
    expect(parkQuelleAmOrt([1059])).toBeNull()
  })
})
