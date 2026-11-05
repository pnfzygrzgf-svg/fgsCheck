// Tests Höhenprofile aus dem DTM 2023 der Stadt Bern (daten/bernDtm.ts): Adresse, Lesen der Proben, Abruf (fetch-Stub)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BERN_DTM_RECHTECK, BERN_DTM_TOL_M, BERN_DTM_URL, bernDtmLesen, bernDtmUrl, ladeBernProfil } from './bernDtm'
import { AbrufFehler } from './holen'
import type { P } from '../geo'

afterEach(() => vi.unstubAllGlobals())

describe('bernDtmUrl', () => {
  it('Polylinie in LV95 (wkid 2056), Ecken auf 0,01 m, Abstand aus Länge und Stützpunkten, Bilinear, erster Wert', () => {
    const u = bernDtmUrl([[2601500.004, 1200900.006], [2601560.001, 1200900]], 7)
    expect(u.startsWith(`${BERN_DTM_URL}?`)).toBe(true)
    const q = new URL(u).searchParams
    expect(q.get('f')).toBe('json')
    expect(q.get('geometryType')).toBe('esriGeometryPolyline')
    expect(JSON.parse(q.get('geometry')!)).toEqual({ paths: [[[2601500, 1200900.01], [2601560, 1200900]]], spatialReference: { wkid: 2056 } })
    expect(q.get('sampleDistance')).toBe('10')
    expect(q.get('returnFirstValueOnly')).toBe('true')
    expect(q.get('interpolation')).toBe('RSP_BilinearInterpolation')
  })
  it('dünnt lange Linien auf acht Ecken aus (Anfang und Ende bleiben); Abstand nie unter 0,25 m', () => {
    const linie: P[] = Array.from({ length: 30 }, (_, i) => [2600000 + i * 2, 1200000] as P)
    const g = JSON.parse(new URL(bernDtmUrl(linie, 20)).searchParams.get('geometry')!) as { paths: number[][][] }
    expect(g.paths[0].length).toBeLessThanOrEqual(8)
    expect(g.paths[0][0]).toEqual([2600000, 1200000])
    expect(g.paths[0][g.paths[0].length - 1]).toEqual([2600058, 1200000])
    expect(new URL(bernDtmUrl([[2600000, 1200000], [2600001, 1200000]], 60)).searchParams.get('sampleDistance')).toBe('0.25')
  })
  it('wirft ausserhalb des Dienstgebiets (Rückfallgrund) und bei zu kurzer Linie', () => {
    expect(() => bernDtmUrl([[2600000, 1200000], [BERN_DTM_RECHTECK[2] + 1, 1200000]], 10)).toThrow(AbrufFehler)
    expect(() => bernDtmUrl([[2600000, 1200000], [2600000, BERN_DTM_RECHTECK[1] - 1]], 10)).toThrow(/ausserhalb/)
    expect(() => bernDtmUrl([[2600000, 1200000]], 10)).toThrow(/zu kurz/)
  })
  it('Toleranz 0,15 m als Annahme', () => { expect(BERN_DTM_TOL_M).toBe(0.15) })
})

describe('bernDtmLesen', () => {
  it('kumuliert dist entlang der Proben, liest Werte als Zahl, lässt NoData weg', () => {
    const p = bernDtmLesen({ samples: [
      { location: { x: 2600000, y: 1200000 }, value: '556.81' },
      { location: { x: 2600010, y: 1200000 }, value: 'NoData' },
      { location: { x: 2600020, y: 1200000 }, value: '556.67' },
      { location: { x: 2600020, y: 1200010 }, value: 557.2 },
    ] })
    expect(p).toEqual([{ dist: 0, h: 556.81 }, { dist: 20, h: 556.67 }, { dist: 30, h: 557.2 }])
  })
  it('wirft bei Fehlermeldung des Dienstes, ohne Liste und mit weniger als zwei Höhen', () => {
    expect(() => bernDtmLesen({ error: { code: 400, message: 'Invalid geometry' } })).toThrow(/Invalid geometry/)
    expect(() => bernDtmLesen({})).toThrow(/keine Liste/)
    expect(() => bernDtmLesen([])).toThrow(/keine Liste/)
    expect(() => bernDtmLesen({ samples: [{ location: { x: 1, y: 2 }, value: '500' }] })).toThrow(/keine Höhen/)
    expect(() => bernDtmLesen({ samples: [{ location: { x: 1, y: 2 }, value: 'NoData' }, { location: { x: 3, y: 2 }, value: 'NoData' }] })).toThrow(AbrufFehler)
  })
})

describe('ladeBernProfil', () => {
  it('holt die Proben beim Berner Dienst und misst den Abruf; kein Datenstand aus der Antwort', async () => {
    const holen = vi.fn(async (url: string) => {
      expect(new URL(url).host).toBe('gisapp.bern.ch')
      return new Response(JSON.stringify({ samples: [
        { location: { x: 2601500, y: 1200900 }, value: '556.81' }, { location: { x: 2601510, y: 1200900 }, value: '556.9' },
      ] }))
    })
    vi.stubGlobal('fetch', holen)
    const r = await ladeBernProfil([[2601500, 1200900], [2601510, 1200900]], 2)
    expect(r.daten).toEqual([{ dist: 0, h: 556.81 }, { dist: 10, h: 556.9 }])
    expect(r.quelle).toBe('gisapp.bern.ch')
    expect(r.bytes).toBeGreaterThan(0)
    expect(r.datenstand).toBeUndefined()
    expect(holen).toHaveBeenCalledTimes(1)
  })
  it('HTTP-Fehler werden zu AbrufFehler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    await expect(ladeBernProfil([[2601500, 1200900], [2601510, 1200900]], 2)).rejects.toThrow(/HTTP 503/)
  })
})
