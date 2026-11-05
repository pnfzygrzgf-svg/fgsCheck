// Tests Höhendienste (daten/hoehenDienst.ts): Wahl je Ort, Modellname in der Messung, Rückfall
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BERN_DTM, HOEHEN_DIENSTE, SWISSALTI, hoehenDienst, hoehenDienstFuer, ladeNeigungMit, mitRueckfall, neigungMit, rueckfallText } from './hoehenDienst'
import { ausHoehenmodell, modellName } from '../hoehenModell'
import { HOEHEN_QUELLE } from '../knotensicht/rechner/neigung'
import { AbrufFehler } from './holen'
import { ladeSichtProfil, sichtProfilUrl } from './sichtProfil'

afterEach(() => vi.unstubAllGlobals())

describe('Wahl des Dienstes', () => {
  it('in der Stadt Bern zuerst das DTM der Stadt, dann swissALTI3D; sonst nur swissALTI3D', () => {
    expect(hoehenDienstFuer(true)).toEqual([BERN_DTM, SWISSALTI])
    expect(hoehenDienstFuer(false)).toEqual([SWISSALTI])
  })
  it('Kennungen, Schlüssel und Toleranzen; Dienst zum Modellnamen', () => {
    expect(HOEHEN_DIENSTE.map(d => d.id)).toEqual(['swissalti', 'bern.dtm'])
    expect(SWISSALTI).toMatchObject({ kurz: 'swissALTI3D', tolM: 0.3, host: 'api3.geo.admin.ch', schluessel: { neigung: 'hoehen', sicht: 'hoehenSicht' } })
    expect(BERN_DTM).toMatchObject({ kurz: 'DTM 2023 Stadt Bern', tolM: 0.15, host: 'gisapp.bern.ch', schluessel: { neigung: 'hoehenBern', sicht: 'hoehenSichtBern' } })
    expect(hoehenDienst('DTM 2023 Stadt Bern')).toBe(BERN_DTM)
    expect(hoehenDienst('swissalti')).toBe(SWISSALTI)
    expect(hoehenDienst(undefined)).toBeUndefined()
  })
  it('Sichtprofil-Adresse je Dienst (gleiche Endpunkte, Cache getrennt)', () => {
    const a = sichtProfilUrl([2600000, 1200000], [2600050, 1200000])
    const b = sichtProfilUrl([2600000, 1200000], [2600050, 1200000], BERN_DTM)
    expect(new URL(a).host).toBe('api3.geo.admin.ch')
    expect(new URL(b).host).toBe('gisapp.bern.ch')
    expect(new URL(b).searchParams.get('sampleDistance')).toBe('2')   // 26 Stützpunkte auf 50 m
  })
  it('ladeSichtProfil liest die Berner Antwort mit dem Leser des Dienstes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ samples: [
      { location: { x: 2600900, y: 1200900 }, value: '500' }, { location: { x: 2600910, y: 1200900 }, value: '500.5' }] }))))
    const r = await ladeSichtProfil([2600900, 1200900], [2600910, 1200900], undefined, BERN_DTM)
    expect(r.daten).toEqual([{ dist: 0, h: 500 }, { dist: 10, h: 500.5 }])
  })
})

describe('Modellname', () => {
  it('neigungMit: swissALTI3D wie der Kern, Bern mit dem Namen des DTM; Werte unverändert', () => {
    const profil = Array.from({ length: 21 }, (_, i) => ({ dist: i * 2.5, h: 500 + i * 0.05 }))
    const s = neigungMit(SWISSALTI, profil), b = neigungMit(BERN_DTM, profil)
    expect(s.quelle.startsWith(HOEHEN_QUELLE)).toBe(true)
    expect(b.quelle.startsWith('DTM 2023 Stadt Bern (Geodaten Stadt Bern), Profil')).toBe(true)
    expect(b.i).toBe(s.i)
    expect(b.laenge).toBe(s.laenge)
    expect(b.punkte).toBe(s.punkte)
    const f = neigungMit(BERN_DTM, new Error('HTTP 503'))
    expect(f.i).toBeNull()
    expect(f.quelle).toBe('DTM 2023 Stadt Bern (Geodaten Stadt Bern) nicht verfügbar')
  })
  it('modellName und ausHoehenmodell aus der Quelle der Messung', () => {
    expect(modellName('swissALTI3D (swisstopo), Profil 50 m, 20 Punkte')).toBe('swissALTI3D')
    expect(modellName('DTM 2023 Stadt Bern (Geodaten Stadt Bern), Profil 50 m, 20 Punkte')).toBe('DTM 2023 Stadt Bern')
    expect(modellName('von Hand')).toBe('Höhenmodell')
    expect(modellName(undefined)).toBe('Höhenmodell')
    expect(ausHoehenmodell('swissALTI3D (swisstopo) nicht verfügbar')).toBe(true)
    expect(ausHoehenmodell('von Hand')).toBe(false)
  })
  it('ladeNeigungMit: Fehler des Dienstes ergibt i = null mit Fehlertext, Abbruch wird weitergereicht', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
      return new Response('x', { status: 500 })
    }))
    const [m, a] = await ladeNeigungMit(BERN_DTM, [[2600000, 1200000], [2600050, 1200000]])
    expect(m.i).toBeNull()
    expect(a).toBe('HTTP 500')
    const ctrl = new AbortController(); ctrl.abort()
    await expect(ladeNeigungMit(BERN_DTM, [[2600000, 1200000], [2600050, 1200000]], ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('mitRueckfall', () => {
  it('erster Dienst wirft: Meldung einmal, zweiter liefert mit seinem Dienst', async () => {
    const meldungen: string[] = []
    const r = await mitRueckfall([BERN_DTM, SWISSALTI], async d => { if (d === BERN_DTM) throw new AbrufFehler('HTTP 503'); return 'ok' },
      (d, f, n) => meldungen.push(`${d.id}: ${rueckfallText(f, n)}`))
    expect(r).toEqual({ dienst: SWISSALTI, wert: 'ok' })
    expect(meldungen).toEqual(['bern.dtm: HTTP 503 (Rückfall auf swissALTI3D)'])
  })
  it('erster liefert: kein Rückfall', async () => {
    const melden = vi.fn()
    expect(await mitRueckfall([BERN_DTM, SWISSALTI], async d => d.id, melden)).toEqual({ dienst: BERN_DTM, wert: 'bern.dtm' })
    expect(melden).not.toHaveBeenCalled()
  })
  it('beide werfen: Fehler des letzten; Abbruch sofort weitergereicht, ohne Meldung', async () => {
    const melden = vi.fn()
    await expect(mitRueckfall([BERN_DTM, SWISSALTI], async d => { throw new Error(`${d.id} kaputt`) }, melden)).rejects.toThrow('swissalti kaputt')
    expect(melden).toHaveBeenCalledTimes(1)
    const abbruch = vi.fn()
    await expect(mitRueckfall([BERN_DTM, SWISSALTI], async () => { throw new DOMException('abgebrochen', 'AbortError') }, abbruch)).rejects.toMatchObject({ name: 'AbortError' })
    expect(abbruch).not.toHaveBeenCalled()
    await expect(mitRueckfall([], async () => 1)).rejects.toThrow(/kein Höhendienst/)
  })
})
