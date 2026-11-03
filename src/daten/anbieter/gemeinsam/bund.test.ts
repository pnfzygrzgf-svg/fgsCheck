import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { bundFach, bundUrl, ladeBundGeoAdmin } from './bundGeoAdmin'
import { poiLesen } from './bundPoi'
import { regionalLesen, regionalStand, regionalSnapshotLesen, regionalUrl } from './regional'
import { regionalDienst, regionalFuer } from './regionalDienste'
import { bundHinweise } from './bundHinweise'
import { bundBelegLesen } from './bundBelege'
import type { P } from '../../../geo'
const p:P=[2682274.51,1248547.29], datum='2026-11-02T00:00:00Z'
const fx=(id:string)=>JSON.parse(readFileSync(new URL(`./testdaten/bund/${id}.json`,import.meta.url),'utf8'))
afterEach(()=>vi.unstubAllGlobals())
it.each(['tram','strasse','bauzone','gwr','poi','unfaelle'])('liest und archiviert echte Bundesdaten %s; abgeleitete Dateiangaben werden neu gebildet',id=>{
 const d=regionalDienst(`bund.${id}`)!, f=fx(id), objekte=regionalLesen(d,f.roh), stand=regionalStand(d,objekte,f.meta)
 expect(objekte.some(o=>o.bund)).toBe(true);expect(stand).not.toContain('unbekannt')
 const s=regionalSnapshotLesen({version:1,mitte:p,radiusM:200,teile:[{id:d.id,url:regionalUrl(d,p),abgerufen:datum,roh:f.roh,meta:f.meta,objekte:[],datenstand:'erfunden'}]})!
 expect(s.teile[0].objekte).toEqual(objekte);expect(s.teile[0].datenstand).toBe(stand)
})
it('GWR-Codes sind unscharfe Hinweise, inaktive Gebäude und normale Bahn sind kein Treffer',()=>{
 expect(bundFach('bund.gwr',{gklas:1263,gstat:1004}).hinweis).toContain('Hochschule/Forschung')
 expect(bundFach('bund.gwr',{gklas:1130,gstat:1004}).hinweis).toContain('kein eindeutiger Heimnachweis')
 expect(bundFach('bund.gwr',{gklas:1263,gstat:1005}).bund).toBeUndefined()
 expect(bundFach('bund.tram',{verkehrsmittel:100,ausser_betrieb:1}).bund).toBeUndefined()
 expect(bundFach('bund.tram',{verkehrsmittel:200,ausser_betrieb:2}).bund).toBeUndefined()
 expect(bundFach('bund.tram',{verkehrsmittel:200,ausser_betrieb:1}).bund?.typ).toBe('tram')
 expect(bundFach('bund.poi',{class:'college'}).bund).toBeUndefined()
})
it('liest eine echte MVT-Kachel, beschränkt Ausschnitt und lässt Hochschul-POI aus',()=>{
 const b=readFileSync(new URL('./testdaten/bund/poi-8580-5737.pbf',import.meta.url))
 const xs=poiLesen(b,8580,5737,[2682729.64,1248622.30],200)
 expect(xs).toHaveLength(3);expect(xs.map(x=>(x.properties as {class:string}).class)).toEqual(['hospital','school','school'])
 expect(poiLesen(b,8580,5737,p,50)).toEqual([])
 expect(()=>poiLesen(new Uint8Array([0xff,0xff]),8580,5737,p,200)).toThrow()
})
it('fragt Unfälle über alle Jahre ab, statt den Dienststandard (letztes Jahr) zu verwenden',()=>{
 const u=new URL(bundUrl('ch.astra.unfaelle-personenschaeden_alle',p))
 expect(JSON.parse(u.searchParams.get('layerDefs')!)).toEqual({'ch.astra.unfaelle-personenschaeden_alle':'accidentyear >= 2011'})
 const xs=regionalLesen(regionalDienst('bund.unfaelle')!,fx('unfaelle').roh)
 expect(xs.some(o=>o.bund?.fuss)).toBe(true);expect(xs.some(o=>o.bund?.velo)).toBe(true)
})
it('zerlegt volle Antworten vor dem Filtern und entfernt mehrfach gelieferte Gleise',async()=>{
 const layer='ch.swisstopo.swisstlm3d-eisenbahnnetz', tram=fx('tram').roh.results[0], urls:string[]=[]
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{urls.push(input);if(input.includes('/legend?'))return new Response('<td>Datenstand</td><td>24.02.2026</td>')
  return new Response(JSON.stringify({results:urls.filter(u=>!u.includes('/legend?')).length===1?Array.from({length:200},(_,i)=>({...tram,featureId:String(i),properties:{verkehrsmittel:100}})):[tram]}))
 }))
 const a=await ladeBundGeoAdmin(layer,p);expect(a.daten.roh.results).toHaveLength(1);expect(urls.filter(u=>!u.includes('/legend?'))).toHaveLength(5)
 expect(regionalLesen(regionalDienst('bund.tram')!,a.daten.roh)[0].bund?.typ).toBe('tram')
})
it('bricht dauerhaft überfüllte oder fremde Quellen ab; archiviert keine Wohnungsattribute',async()=>{
 const f=fx('gwr').roh.results[0]
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('/legend?')?new Response(''):new Response(JSON.stringify({results:[{...f,properties:{...f.properties,wohnungen:['nicht benötigt']}}]}))))
 const a=await ladeBundGeoAdmin(f.layerBodId,p);expect(JSON.stringify(a.daten.roh)).not.toContain('wohnungen')
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('/legend?')?new Response(''):new Response(JSON.stringify({results:[f],exceededTransferLimit:true}))))
 await expect(ladeBundGeoAdmin(f.layerBodId,p)).rejects.toThrow('unvollständig')
})
it('Bundesquellen bleiben bei fehlender Gebietsbestimmung verfügbar; Bedarf nur im fgsCheck',()=>{
 const ds=regionalFuer([]);expect(ds).toHaveLength(6)
 expect(ds.filter(d=>!d.apps||d.apps.includes('swc')).map(d=>d.id)).toEqual(['bund.tram','bund.strasse','bund.bauzone','bund.unfaelle'])
})
it('verhindert Strassenzuordnung bei Höhenlage, Parallelstrassen und unbekannter Klasse; Abwesenheit ist kein Negativbeweis',()=>{
 const d=regionalDienst('bund.strasse')!, o={...regionalLesen(d,fx('strasse').roh)[0],name:'Test',teile:[[[p[0]-30,p[1]],[p[0]+30,p[1]]] as P[]],bund:{typ:'strasse' as const,code:200}}, s={version:1 as const,mitte:p,radiusM:200,teile:[{id:d.id,url:'',abgerufen:datum,datenstand:'24.02.2026',roh:{},objekte:[o]}]}, w={name:'Test',tags:{highway:'primary'},teile:o.teile}
 expect(bundHinweise(s,p,[1,0],[w])).toHaveLength(1)
 expect(bundHinweise(s,p,[1,0],[{...w,tags:{...w.tags,bridge:'yes'}}])).toEqual([])
 expect(bundHinweise(s,p,[1,0],[w,{...w,name:'Nebenstrasse'}])).toEqual([])
 o.bund.code=999998;expect(bundHinweise(s,p,[1,0],[w])).toEqual([])
 expect(bundHinweise(null,p)).toEqual([])
})
it('akzeptiert Belege nur für passendes Feld, Quelle und Wert',()=>{
 const b={feld:'innerorts',wert:true,quelleId:'bund.bauzone',objektIds:['bund.bauzone:1:a'],datenstand:'01.01.2022',abgerufen:datum,text:'Bauzone, tatsächliche Ortslage geprüft'}
 expect(bundBelegLesen(b,'innerorts',true)).toEqual(b)
 expect(bundBelegLesen(b,'innerorts',false)).toBeNull();expect(bundBelegLesen({...b,quelleId:'bund.gwr'},'innerorts',true)).toBeNull()
})
it('setzt die Strassenprobe nach Metern, auch bei einer Achse mit nur zwei weit entfernten Stützpunkten',async()=>{
 const {bundProbe}=await import('./bundHinweise')
 expect(bundProbe([[2600000,1200000],[2600200,1200000]])).toEqual({p:[2600012,1200000],richtung:[1,0]})
 expect(bundProbe([[2600000,1200000],[2600000,1200000],[2600000,1200005],[2600000,1200020]])).toEqual({p:[2600000,1200012],richtung:[0,1]})
})
