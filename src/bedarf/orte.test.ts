import {expect,it} from 'vitest'
import {ortsBedarfVorbelegen} from './orte'
import {eingabenBilden,quellenWahlSetzen,type Vorbelegung} from './fallBedarf'
import {leererFall,fallLesen,fallSchreiben,rechnungsSchluessel} from '../fall'
import type {RegionalSnapshot,RegionalObjekt} from '../daten/anbieter/gemeinsam/regional'
import type {StreifenErgebnis} from '../rechner/typen'
import type {P} from '../geo'
const p:P=[2600000,1200000],st=[{p0:[2599996,1200000],p1:[2600004,1200000],m:p}]as StreifenErgebnis[]
const ort=(id:string,art:'schule'|'kindergarten'|'heim'|null,dx=0,bestaetigen=false):RegionalObjekt=>({id:`${id}:1:abc`,punkte:[[p[0]+dx,p[1]]],name:'Testort',bedarf:{art,wort:'Einrichtung',typ:'Inventartyp'},tempo:null,zone:null,stand:null,hinweis:'',bestaetigen})
const snapshot=(id='bedarf.zh.volksschule',objekte=[ort(id,'schule')]):RegionalSnapshot=>({version:1,mitte:p,radiusM:200,teile:[{id,url:'',roh:{},abgerufen:'2026-11-02T00:00:00Z',datenstand:'01.11.2026 (Katalogaktualisierung)',objekte}]})
it('eindeutiger örtlicher Schulstandort gilt bis 150 m; eigene Eingaben und andere Gründe bleiben erhalten',()=>{
 const w:Vorbelegung={beduerfnis:{wert:['haltestelle'],quelle:'bestaetigt',text:'Haltestellenbezug bestätigt'}}
 ortsBedarfVorbelegen(st,snapshot(),w)
 expect(eingabenBilden(w,undefined).eingaben.beduerfnis.wert).toEqual(['haltestelle','schule'])
 expect(eingabenBilden(w,{felder:{beduerfnis:{wert:[],quelle:'hand'}}}).eingaben.beduerfnis.wert).toEqual([])
 expect(w.beduerfnis.text).toContain('Stadt Zürich');expect(w.beduerfnis.datenstand).toContain('01.11.2026')
 const q=w.beduerfnis.quellenOptionen![0],b=quellenWahlSetzen(undefined,'beduerfnis',q)!,f=leererFall(46.95,7.44,1);f.bedarf=b
 const [g,h]=fallLesen(fallSchreiben(f));expect(h).toEqual([]);expect(g.bedarf).toEqual(b);expect(JSON.parse(fallSchreiben(f)).version).toBe(11)
})
it('unbekannte Einrichtung zählt nicht vor Bestätigung; kein Negativschluss aus leerem/zu fernem Inventar',()=>{
 const w:Vorbelegung={};ortsBedarfVorbelegen(st,snapshot('bedarf.ge.special',[ort('bedarf.ge.special',null)]),w)
 expect(eingabenBilden(w,undefined).eingaben.beduerfnis.wert).toBeNull()
 const q=w.beduerfnis.quellenOptionen!.find(q=>(q.wert as string[]).includes('kindergarten'))!
 expect(eingabenBilden(w,quellenWahlSetzen(undefined,'beduerfnis',q)).eingaben.beduerfnis.wert).toEqual(['kindergarten'])
 for(const s of [snapshot('bedarf.zh.volksschule',[]),snapshot('bedarf.zh.volksschule',[ort('bedarf.zh.volksschule','schule',160)])]){const x:Vorbelegung={};ortsBedarfVorbelegen(st,s,x);expect(x.beduerfnis).toBeUndefined()}
})
it('unbestätigter Haltestellenvorschlag wird durch Schulnachweis nicht mitbestätigt; Reihenfolge unabhängiger Quellen ist egal',()=>{
 const s=snapshot();s.teile.push(...snapshot('bedarf.be.schule').teile)
 const a:Vorbelegung={beduerfnis:{wert:['haltestelle'],quelle:'vorschlag',text:'BAV-Punkt, Bezug offen',bestaetigungNoetig:true}},b:Vorbelegung=structuredClone(a)
 ortsBedarfVorbelegen(st,s,a);ortsBedarfVorbelegen(st,{...s,teile:[...s.teile].reverse()},b)
 expect(a).toEqual(b);expect(eingabenBilden(a,undefined).eingaben.beduerfnis.wert).toEqual(['schule'])
 const f=leererFall(46.95,7.44,1),k=rechnungsSchluessel(f);f.regional=s;expect(rechnungsSchluessel(f)).toBe(k)
})
