import { expect, it } from 'vitest'
import { bundVorbelegen } from './bund'
import { quellenWahlSetzen, eingabenBilden, bedarfLesen, type Vorbelegung } from './fallBedarf'
import type { StreifenErgebnis } from '../rechner/typen'
import type { RegionalSnapshot, RegionalObjekt } from '../daten/anbieter/gemeinsam/regional'
import { fallLesen, fallSchreiben, leererFall } from '../fall'
import type { P } from '../geo'
const p:P=[2600000,1200000], a:P[]=[[2599950,1200000],[2600050,1200000]]
const st=[{p0:[2600000,1199997],p1:[2600000,1200003],m:p}] as StreifenErgebnis[]
const obj=(id:string,bund:RegionalObjekt['bund'],g:Partial<RegionalObjekt>):RegionalObjekt=>({id:`${id}:1:a`,name:'Test',bund,tempo:null,zone:null,stand:null,bestaetigen:true,hinweis:'prüfen',...g})
const s:RegionalSnapshot={version:1,mitte:p,radiusM:200,teile:[
 ['bund.strasse',obj('bund.strasse',{typ:'strasse',code:200},{teile:[a]})],
 ['bund.tram',obj('bund.tram',{typ:'tram'},{teile:[a]})],
 ['bund.bauzone',obj('bund.bauzone',{typ:'bauzone',code:12},{name:'Arbeitszonen',polygone:[[[[2599980,1199980],[2600020,1199980],[2600020,1200020],[2599980,1200020],[2599980,1199980]]]]})],
 ['bund.gwr',obj('bund.gwr',{typ:'bildung',code:1263},{punkte:[p]})],
].map(([id,o])=>({id:id as string,objekte:[o as RegionalObjekt],roh:{},url:'',datenstand:'24.02.2026',abgerufen:'2026-11-02T00:00:00Z'}))}
const roads=[{name:'Test',tags:{highway:'primary'},teile:[a]}]
it('Bundesvorschläge zählen erst nach expliziter Wahl; behalten eigene Werte und andere Bedarfsgründe',()=>{
 const w:Vorbelegung={},hand={felder:{beduerfnis:{wert:['haltestelle'],quelle:'hand' as const}}}
 bundVorbelegen(st,s,roads,w,hand)
 const before=eingabenBilden(w,undefined).eingaben
 for(const k of ['innerorts','strassentyp','tram','beduerfnis'] as const)expect(before[k].wert).toBeNull()
 for(const k of ['innerorts','strassentyp','tram','q3.bebaut','q3.gewerbe','beduerfnis']){
  const q=w[k].quellenOptionen![0], b=quellenWahlSetzen(hand,k,q)!
  expect(b.felder[k].datenquelle?.datenstand).toBe('24.02.2026')
  expect(bedarfLesen(b)[1]).toEqual([])
  if(k==='beduerfnis')expect(b.felder[k].wert).toEqual(['haltestelle','schule'])
 }
 expect(eingabenBilden(w,{felder:{innerorts:{wert:false,quelle:'hand'}}}).eingaben.innerorts.wert).toBe(false)
 expect(w.tram.quellenOptionen!.map(q=>q.wert)).toEqual(['fahrbahn','eigentrassee'])
})
it('fremde Bundesquellen können keine Tempo-/Normfelder belegen und ausgewählte Belege überstehen Fall-Dateien',()=>{
 const w:Vorbelegung={};bundVorbelegen(st,s,roads,w)
 const q=w.innerorts.quellenOptionen![0]
 expect(quellenWahlSetzen(undefined,'vSig',{...q,wert:50})).toBeUndefined()
 const f=leererFall(46.95,7.44,1);f.bedarf=quellenWahlSetzen(undefined,'innerorts',q)
 const t=fallSchreiben(f);expect(JSON.parse(t).version).toBe(10)
 const [g,h]=fallLesen(t);expect(h).toEqual([]);expect(g.bedarf).toEqual(f.bedarf)
})
