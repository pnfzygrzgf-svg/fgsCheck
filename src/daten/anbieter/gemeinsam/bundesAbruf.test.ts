import { expect, it, vi } from 'vitest'
vi.mock('../../holen',()=>({holeText:vi.fn(async()=>[new Response(''), '']),holeJson:vi.fn(async()=>({daten:{results:[]},ms:1,bytes:2,quelle:'api3.geo.admin.ch'}))}))
import { holeJson, holeText } from '../../holen'
import { beginneBundesAbrufe } from './bundesBudget'
import { ladeBundGeoAdmin } from './bundGeoAdmin'
it('mehrere echte Bundeslader teilen ein Budget inklusive Legenden und Teilabfragen',async()=>{
 const c=new AbortController();beginneBundesAbrufe(c.signal,{anfragen:3,parallel:2,ms:1000})
 const antworten=await Promise.allSettled([ladeBundGeoAdmin('ch.a',[2600000,1200000],200,c.signal),ladeBundGeoAdmin('ch.b',[2600000,1200000],200,c.signal)])
 expect(antworten.some(a=>a.status==='rejected'&&/Gesamtbudget/.test(String(a.reason)))).toBe(true)
 expect(vi.mocked(holeJson).mock.calls.length+vi.mocked(holeText).mock.calls.length).toBeLessThanOrEqual(3)
})
