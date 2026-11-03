import { expect, it } from 'vitest'
import * as gebiet from './gebiet'
import type { GebietSnapshot } from './typen'
const p:[number,number]=[2600000,1200000]
const av=[{art:'Strasse_Weg',bfs:355,kanton:'BE',ringe:[[[2599990,1199990],[2600010,1199990],[2600010,1200010],[2599990,1200010],[2599990,1199990]] as [number,number][]]}]
const snapshot:GebietSnapshot={version:1,quelleId:'swisstopo.gebiet',mitte:p,radiusM:200,jahr:2025,abgerufen:'2026-11-03T12:00:00Z',amOrt:[{bfs:355,kanton:'BE',name:'Köniz'}],imAusschnitt:[{bfs:355,kanton:'BE',name:'Köniz'},{bfs:261,kanton:'ZH',name:'Zürich'}]}
it('Gebietsausfall: jede verlässliche AV-Gemeinde und Kanton nutzbar, nicht nur Zürich',()=>{
 expect(gebiet.zustaendigkeitAmOrt(p,null,av).amOrt).toEqual([{bfs:355,kanton:'BE',name:'BFS 355'}])
 expect(gebiet.zustaendigkeitAmOrt(p,null,av).hinweis).toContain('Vermessung')
})
it('Ausschnitt und Prüfpunkt getrennt; ohne verlässlichen Prüfpunkt Einschränkung sichtbar',()=>{
 const z=gebiet.zustaendigkeitAmOrt(p,snapshot,[])
 expect(z.amOrt.map(g=>g.bfs)).toEqual([355]);expect(z.imAusschnitt.map(g=>g.bfs)).toEqual([355,261])
 expect(gebiet.zustaendigkeitAmOrt([2601000,1200000],snapshot,[])).toMatchObject({amOrt:[],hinweis:expect.stringContaining('eingeschränkt')})
})

it('Zürich-Vorrang nur am örtlichen Prüfpunkt, nicht wegen Zürcher Nachbargemeinde oder geladenem Ausschnitt',()=>{
 const z=gebiet.zustaendigkeitAmOrt(p,snapshot,[])
 expect(gebiet.istZuerichAmOrt(z.amOrt)).toBe(false)
 expect(gebiet.istZuerichAmOrt([{bfs:261,kanton:'ZH',name:'Zürich'}])).toBe(true)
 expect(gebiet.istZuerichAmOrt([])).toBe(false)
 expect(gebiet.istZuerichAmOrt(snapshot.imAusschnitt)).toBe(false)
})
