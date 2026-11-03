import { afterEach, expect, it, vi } from 'vitest'
import { ladeGebiet, gebietCacheLeeren, GEBIET_LAYER } from './gebiet'
import { ladeGeoAdmin } from './geoAdmin'
vi.mock('./geoAdmin', async original => ({ ...await original<typeof import('./geoAdmin')>(), ladeGeoAdmin: vi.fn() }))
afterEach(() => { gebietCacheLeeren(); vi.restoreAllMocks() })
it('Vorjahresfassung bleibt möglich; historische Gemeinden bleiben ausgeschlossen', async () => {
  vi.spyOn(Date.prototype, 'getUTCFullYear').mockReturnValue(2026)
  vi.mocked(ladeGeoAdmin).mockImplementation(async url => ({daten:{results:new URL(url).searchParams.get('timeInstant')==='2026'?[]:[2024,2025].map(jahr=>({layerBodId:GEBIET_LAYER,attributes:{is_current_jahr:true,jahr,gde_nr:jahr===2025?351:355,kanton:'BE',gemname:jahr===2025?'Bern':'Köniz'}})).concat([{layerBodId:GEBIET_LAYER,attributes:{is_current_jahr:false,jahr:2026,gde_nr:999,kanton:'BE',gemname:'Historisch'}}])},ms:1,bytes:1,quelle:'api3.geo.admin.ch'}))
  const r=await ladeGebiet(46.95,7.44)
  expect(r.daten.jahr).toBe(2025)
  expect(r.daten.amOrt.map(g=>g.bfs)).toEqual([351])
  expect(vi.mocked(ladeGeoAdmin).mock.calls.every(([url])=>new URL(url).searchParams.has('timeInstant'))).toBe(true)
})
