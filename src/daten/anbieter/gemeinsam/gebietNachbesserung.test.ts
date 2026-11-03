import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { gebietCacheLeeren, ladeGebiet, GEBIET_LAYER, zustaendigkeitAmOrt } from './gebiet'
import * as gebiet from './gebiet'
const feature=(jahr:number,aktuell=true)=>({layerBodId:GEBIET_LAYER,attributes:{jahr,is_current_jahr:aktuell,gde_nr:351,kanton:'BE',gemname:'Bern'}})
beforeEach(()=>{gebietCacheLeeren();vi.spyOn(Date.prototype,'getUTCFullYear').mockReturnValue(2026)})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
function antwort(f:(u:URL)=>unknown[]){const fetch=vi.fn(async(url:string)=>new Response(JSON.stringify({results:f(new URL(url))})));vi.stubGlobal('fetch',fetch);return fetch}
it('eingebauter Lader setzt timeInstant in Punkt- und Ausschnittsabfrage',async()=>{
 const fetch=antwort(()=>[feature(2026)])
 expect((await ladeGebiet(46.9467,7.4442)).daten.jahr).toBe(2026)
 expect(fetch.mock.calls.map(([u])=>new URL(u).searchParams.get('timeInstant'))).toEqual(['2026','2026'])
})
it('fehlender aktueller Treffer führt genau einmal zum Vorjahr; Snapshot und Kosten umfassen beide Versuche',async()=>{
 const fetch=antwort(u=>u.searchParams.get('timeInstant')==='2026'?[feature(2026,false)]:[feature(2025)])
 const r=await ladeGebiet(46.9467,7.4442)
 expect(r.daten.jahr).toBe(2025);expect(r.daten.amOrt[0].name).toBe('Bern')
 expect(fetch.mock.calls.map(([u])=>new URL(u).searchParams.get('timeInstant'))).toEqual(['2026','2026','2025','2025'])
 expect(r.bytes).toBeGreaterThan(JSON.stringify({results:[feature(2025)]}).length*2)
})
it('leer auch im Vorjahr: ausdrücklicher Ausfall, kein weiterer Jahresabruf',async()=>{
 const fetch=antwort(()=>[])
 await expect(ladeGebiet(46.9467,7.4442)).rejects.toThrow(/Vorjahr/)
 expect(fetch.mock.calls).toHaveLength(4)
})
it('viele historische Jahrgänge würden fünf Seiten auslösen; Jahresfilter begrenzt beide Abfragen auf je eine Seite',async()=>{
 const fetch=antwort(u=>u.searchParams.has('timeInstant')?[feature(2026)]:Array.from({length:200},(_,i)=>feature(1850+i,false)))
 await expect(ladeGebiet(46.9467,7.4442)).resolves.toMatchObject({daten:{jahr:2026}})
 expect(fetch.mock.calls).toHaveLength(2)
 expect(fetch.mock.calls.every(([u])=>new URL(u).searchParams.get('offset')==='0')).toBe(true)
})
it('Gemeindename aus AV und kompakte Beschriftung ohne doppelte BFS-Nummer',()=>{
 const av=[{art:'Strasse_Weg',bfs:261,kanton:'ZH',gemeinde:'Zürich',ringe:[[[0,0],[10,0],[10,10],[0,10],[0,0]] as [number,number][]]}]
 const g=zustaendigkeitAmOrt([5,5],null,av).amOrt[0]
 expect(g.name).toBe('Zürich')
 expect(gebiet.gemeindeText(g)).toBe('Zürich (ZH, BFS 261)')
 expect(gebiet.gemeindeText({...g,name:'BFS 261'})).toBe('BFS 261 (ZH)')
})
