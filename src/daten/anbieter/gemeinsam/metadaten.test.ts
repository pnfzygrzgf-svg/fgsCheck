import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avPublikationsstaende, bernProduktStand, QuellenMetadaten } from './metadaten'
import produkte from './testdaten/bern-produktstaende.json'

const csv = readFileSync(join(__dirname, 'testdaten/av-publikationsstaende.csv'), 'utf8')
afterEach(() => vi.unstubAllGlobals())
describe('veröffentlichte Quellenstände', () => {
  it('liest reale Berner Produktaktualisierung, lehnt andere Produkte und ungültige Datumswerte ab', () => {
    const r = produkte.find(p => p.produktname === 'Strassentypen')!
    expect(bernProduktStand(r, 'Strassentypen')).toBe('02.06.2026 (Produktaktualisierung)')
    expect(bernProduktStand(r, 'Haltestellen')).toBeUndefined()
    expect(bernProduktStand({ ...r, letzte_aktualisierung: '31.02.2026' }, 'Strassentypen')).toBeUndefined()
    expect(bernProduktStand({ ...r, letzte_aktualisierung: undefined, metadata_modified: '2026-11-01' }, 'Strassentypen')).toBeUndefined()
  })
  it('AV-Publikationsstand und Vollständigkeit gehören zu den tatsächlich geladenen Kantonen', () => {
    expect(avPublikationsstaende(csv, ['BE', 'VS', 'BE'])).toEqual({
      datenstand: 'BE: 29.10.2026 05:07:45 (letzte kantonale Publikation); VS: 27.10.2026 17:56:02 (letzte kantonale Publikation)',
      vollstaendigkeit: 'BE: ja (kantonsweit gemäss Anbieter); VS: nein (Kanton nur teilweise publiziert)',
    })
    expect(avPublikationsstaende(csv, ['XX']).datenstand).toBe('XX: unbekannt')
    expect(() => avPublikationsstaende('datum;kanton\n2026;BE', ['BE'])).toThrow('Spalten')
    const mitKommentar = csv.replace('cantonal_coverage\n', 'cantonal_coverage;kommentar\n').replace('2026-10-29T05:07:45;true', '2026-10-29T05:07:45;true;"Zeile 1\nZeile 2; mit ""Zitat"""')
    expect(avPublikationsstaende(mitKommentar, ['BE']).datenstand).toContain('29.10.2026')
  })
  it('neuer Fall lädt Metadaten neu; innerhalb eines Auftrags genügt ein Abruf je Produkt', async () => {
    let datum = '02.06.2026'
    const holen = vi.fn(async () => new Response(JSON.stringify({ produktname: 'Strassentypen', letzte_aktualisierung: datum })))
    vi.stubGlobal('fetch', holen)
    const m = new QuellenMetadaten()
    expect((await m.laden('strassenhierarchie'))?.datenstaende?.Strassentypen).toContain('02.06.2026')
    await m.laden('strassenhierarchie'); expect(holen).toHaveBeenCalledTimes(1)
    datum = '08.11.2026'; m.neu()
    expect((await m.laden('strassenhierarchie'))?.datenstaende?.Strassentypen).toContain('08.11.2026')
    expect(holen).toHaveBeenCalledTimes(2)
  })
  it('Teilquellen behalten ihre eigenen Datenstände; Metadaten-Ausfall erfindet kein Datum', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const name = new URL(url).searchParams.get('name'), produkt = produkte.find(p => p.produktname === name)
      return name === 'Heime' ? new Response('', { status: 503 }) : new Response(JSON.stringify(produkt))
    }))
    const m = new QuellenMetadaten(), r = await m.laden('schulen')
    expect(r?.datenstaende?.Volksschulen).toContain('09.01.2024')
    expect(r?.datenstaende?.Kindergaerten).toContain('22.08.2022')
    expect(r?.datenstaende?.Heime).toContain('unbekannt')
    expect(await m.laden('hoehen')).toBeNull()
    expect(await m.laden('bav')).toBeNull()
  })
})
