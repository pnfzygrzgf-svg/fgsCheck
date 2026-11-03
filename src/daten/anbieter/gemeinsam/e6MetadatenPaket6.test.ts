import { afterEach, expect, it, vi } from 'vitest'
import { e6Dienst, ladeE6 } from './e6'
afterEach(() => vi.unstubAllGlobals())
it('echter E6-Lader holt Metadaten nur einmal je Dienst und übergebenem Ladevorgang', async () => {
 const d = e6Dienst('e6.sg.licht')!
 const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/records?') ? { total_count: 0, results: [] } : { metas: { default: { modified: '2026-11-01' } } })))
 vi.stubGlobal('fetch', fetch)
 const lauf = { metadaten: new Map() }
 await Promise.all([ladeE6(d, [2744850, 1254150], 200, undefined, lauf), ladeE6(d, [2745150, 1254150], 200, undefined, lauf)])
 expect(fetch.mock.calls.filter(([url]) => !url.includes('/records?'))).toHaveLength(1)
 expect(fetch.mock.calls.filter(([url]) => url.includes('/records?'))).toHaveLength(2)
 await ladeE6(d, [2744850, 1254150], 200, undefined, { metadaten: new Map() })
 expect(fetch.mock.calls.filter(([url]) => !url.includes('/records?'))).toHaveLength(2)
})
