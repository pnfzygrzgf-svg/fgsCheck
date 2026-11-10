import { afterEach, describe, expect, it, vi } from 'vitest'
import { bodenAntwort, profilAnfrage, profilZuordnen, ladeBodenProfil } from './bodenprofil'
import type { P } from '../geo'
const ps: P[] = [[2601540, 1199810], [2601541, 1199810], [2601542, 1199810]]
const antwort = (h: unknown[]) => ({ samples: ps.map((p, i) => ({ location: { x: p[0], y: p[1] }, value: h[i] })) })
const res = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
afterEach(() => vi.unstubAllGlobals())
describe('Bodenprofile der 3D-Ansicht', () => {
  it('NoData und ungültige Werte behalten ihren Platz; keine Interpolation über eine Lücke', () => {
    const m = bodenAntwort(antwort(['504.10', 'NoData', '504.16']), 'bern.dtm')
    expect(m.map(p => p.h)).toEqual([504.1, null, 504.16])
    expect(profilZuordnen(ps, m)).toEqual([504.1, null, 504.16])
    expect(profilZuordnen([[2601540.5, 1199810], [2601541.5, 1199810]], m)).toEqual([null, null])
  })
  it('fehlende Koordinate bleibt ebenfalls als Lücke erhalten', () => {
    const m = bodenAntwort({ samples: [antwort([500]).samples[0], { value: 500 }, antwort([0, 0, 500]).samples[2]] }, 'bern.dtm')
    expect(m).toHaveLength(3); expect(m[1].p).toBeNull()
    expect(profilZuordnen(ps, m)).toEqual([500, null, 500])
  })
  it('ein Profil pro Weg enthält alle Ecken; Bern und swissALTI verwenden denselben vollständigen Weg', () => {
    const weg: P[] = Array.from({ length: 30 }, (_, i) => [2601540 + i, 1199810 + Math.sin(i)])
    for (const id of ['bern.dtm', 'swissalti'] as const) {
      const a = profilAnfrage(weg, id), q = new URLSearchParams(String(a.init.body))
      expect(a.init.method).toBe('POST')
      const geom = JSON.parse(q.get(id === 'bern.dtm' ? 'geometry' : 'geom')!)
      expect((geom.paths?.[0] ?? geom.coordinates)).toHaveLength(30)
    }
  })
  it('LN02-Messwerte und normalisierte Szenenhöhen getrennt halten', async () => {
    const f = vi.fn(async () => res(antwort([504.1, null, 504.16])))
    vi.stubGlobal('fetch', f)
    const r = await ladeBodenProfil(ps)
    expect(r.bezug).toBe('LN02'); expect(r.versatzM).toBe(-0.04)
    expect(r.messwerte).toEqual([504.1, null, 504.16])
    expect(r.szeneHoehen[0]).toBeCloseTo(504.06, 8); expect(r.szeneHoehen[1]).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('Berner Dienstfehler: vollständiges Profil von swissALTI; keine punktweise Mischung', async () => {
    const f = vi.fn().mockResolvedValueOnce(res({ error: { message: 'offline' } }))
      .mockResolvedValueOnce(res(ps.map((p, i) => ({ easting: p[0], northing: p[1], alts: { COMB: i === 1 ? null : 500 } }))))
    vi.stubGlobal('fetch', f)
    const r = await ladeBodenProfil(ps)
    expect(r.dienst).toBe('swissalti'); expect(r.rueckfall).toContain('offline')
    expect(r.messwerte).toEqual([500, null, 500]); expect(f).toHaveBeenCalledTimes(2)
  })
  it('ausserhalb Berns: LN02 erst nach erfolgreichem REFRAME-Versatz in die Szene übernehmen', async () => {
    const punkte: P[] = [[2680000, 1250000], [2680001, 1250000]]
    const f = vi.fn().mockResolvedValueOnce(res(punkte.map(p => ({ easting: p[0], northing: p[1], alts: { COMB: 500 } }))))
      .mockResolvedValueOnce(res({ altitude: '500.12' }))
    vi.stubGlobal('fetch', f)
    const r = await ladeBodenProfil(punkte)
    expect(r.versatzM).toBeCloseTo(0.12, 8); expect(r.szeneHoehen[0]).toBeCloseTo(500.12, 8)
    expect(String(f.mock.calls[1][0])).toContain('geodesy.geo.admin.ch/reframe/ln02tolhn95')
  })
  it('Abbruch startet keinen Rückfall', async () => {
    const ctrl = new AbortController()
    const f = vi.fn(async () => { ctrl.abort(); throw new DOMException('abgebrochen', 'AbortError') })
    vi.stubGlobal('fetch', f)
    await expect(ladeBodenProfil(ps, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
