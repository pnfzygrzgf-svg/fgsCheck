import { afterEach, expect, it, vi } from 'vitest'
import { leererFall, fallMerken, fallErinnern, fallSchreiben, fallLesen, type Fall } from './fall'
import { regionalLesen, regionalUrl } from './daten/anbieter/gemeinsam/regional'
import { regionalDienst } from './daten/anbieter/gemeinsam/regionalDienste'
import fixture from './daten/anbieter/gemeinsam/testdaten/e6/zh.netz.json'
const d=regionalDienst('e6.zh.netz')!,mitte:[number,number]=[2683000,1252000]
const source=()=>({version:1 as const,mitte,radiusM:200,teile:[{id:d.id,url:regionalUrl(d,mitte,200),abgerufen:'2026-11-03T12:00:00Z',datenstand:'2026',roh:fixture.roh,meta:{objekte:'Originalattribut darf bleiben'},objekte:regionalLesen(d,fixture.roh)}]})
const key='fgsCheck.fall.42'
function fall():Fall {
 const f=leererFall(47.39,8.53,42)
 f.ort.bezeichnung='Eigene Bezeichnung';f.regional=source();f.amtlicheQuellen={};f.quellen={osm:'Alter Ausschnitt',regional:'Geladene Regionaldaten'}
 f.hindernisse=[{id:'bestätigter-baum',art:'baum',p:mitte,stamm:0.5,quelle:'kataster'}]
 f.signalEntscheide=[{objektId:'ge.signal:1',quelleId:'ge.signal',art:'stop',name:'Signal gewählt',knoten:42,zufahrt:'7:0:1',p:mitte,datenstand:'2026',abgerufen:'2026-11-03T12:00:00Z'}]
 f.vorschlaege={'osm:1':'verworfen'}
 f.bedarf={felder:{dtv:{wert:1234,quelle:'bestaetigt',datenquelle:{id:'are.npvm',text:'Explizit gewählte Quelle',datenstand:'2026'}}}};f.zufahrten={'1|west':{tempo:30}}
 return f
}
function speicher(){const m=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}});return m}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
it('Browser speichert Eingaben, Entscheide und Quellenwahl; keine geladenen Ausschnitte oder Quellenliste',()=>{
 const m=speicher(),f=fall();fallMerken(f)
 const text=m.get(key)!,roh=JSON.parse(text)
 expect(roh.regional).toBeUndefined();expect(roh.zuerich).toBeUndefined();expect(roh.amtlicheQuellen).toBeUndefined();expect(roh.npvm).toBeUndefined();expect(roh.ergebnis).toBeUndefined();expect(roh.quellen).toEqual({})
 expect(text.length).toBeLessThan(5000)
 const g=fallErinnern(42)!
 expect(g.ort.bezeichnung).toBe(f.ort.bezeichnung);expect(g.signalEntscheide).toEqual(f.signalEntscheide);expect(g.vorschlaege).toEqual(f.vorschlaege);expect(g.hindernisse[0].id).toBe('bestätigter-baum')
 expect(g.bedarf).toEqual(f.bedarf);expect(g.zufahrten).toEqual(f.zufahrten)
 expect(f.regional!.teile[0].objekte).toHaveLength(333)
})
it('auch ältere volle Browser-Erinnerungen werden ohne Rohdaten und alte Quellen gelesen',()=>{
 const m=speicher(),f=fall();m.set(key,fallSchreiben(f))
 const g=fallErinnern(42)!
 expect(g.regional).toBeUndefined();expect(g.amtlicheQuellen).toBeUndefined();expect(g.quellen).toEqual({});expect(g.ort.bezeichnung).toBe(f.ort.bezeichnung)
})
it('Falldatei erhält rohe Regionaldaten und Metadaten einmal; Objekte werden beim Lesen vollständig rekonstruiert',()=>{
 const f=fall(),vorher=JSON.stringify(f),text=fallSchreiben(f),roh=JSON.parse(text)
 expect(roh.regional.teile[0].objekte).toBeUndefined()
 expect(roh.regional.teile[0].roh).toEqual(f.regional!.teile[0].roh)
 expect(roh.regional.teile[0].meta).toEqual({objekte:'Originalattribut darf bleiben'})
 const[g,hinweise]=fallLesen(text)
 expect(hinweise).toEqual([]);expect(g.regional!.teile[0].objekte).toEqual(f.regional!.teile[0].objekte);expect(g.quellen).toEqual(f.quellen)
 expect(JSON.stringify(f)).toBe(vorher)
})
it('alte Falldatei mit redundanten Objekten bleibt lesbar; abgeleitete Inhalte werden nicht vertraut',()=>{
 const f=fall(),roh=JSON.parse(fallSchreiben(f));roh.regional.teile[0].objekte=[{id:'gefälscht'}]
 const[g,h]=fallLesen(JSON.stringify(roh));expect(h).toEqual([]);expect(g.regional!.teile[0].objekte).toHaveLength(333);expect(g.regional!.teile[0].objekte.some(o=>o.id==='gefälscht')).toBe(false)
})
it('Quota-Fehler wird zurückgemeldet und lässt die bisherige Erinnerung unangetastet',()=>{
 const m=new Map([[key,'bestehender Fall']]);vi.stubGlobal('localStorage',{getItem:(k:string)=>m.get(k)??null,setItem:()=>{throw new DOMException('Quota','QuotaExceededError')}})
 expect(fallMerken(fall())).toMatch(/voll/);expect(m.get(key)).toBe('bestehender Fall')
})
it('gesperrter Browserspeicher meldet eine verständliche Wiederherstellungsmöglichkeit',()=>{
 vi.stubGlobal('localStorage',{setItem:()=>{throw new DOMException('Gesperrt','SecurityError')}})
 expect(fallMerken(fall())).toMatch(/Fall speichern/)
})
it('erfolgreicher nächster Versuch liefert keinen Fehler mehr',()=>{
 vi.stubGlobal('localStorage',{setItem:()=>{throw new DOMException('Quota','QuotaExceededError')}})
 expect(fallMerken(fall())).toBeTypeOf('string')
 const m=speicher();expect(fallMerken(fall())).toBeNull();expect(m.has(key)).toBe(true)
})
it('auch ein fehlgeschlagenes Löschen einer Erinnerung wird gemeldet',()=>{
 vi.stubGlobal('localStorage',{removeItem:()=>{throw new DOMException('Gesperrt','SecurityError')}})
 expect(fallMerken(leererFall(47.39,8.53,42))).toBeTypeOf('string')
})
