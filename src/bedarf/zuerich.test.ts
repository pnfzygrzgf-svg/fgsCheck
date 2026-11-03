import {it,expect} from 'vitest'
import roentgen from '../daten/anbieter/gemeinsam/testdaten/zuerich/roentgen.json'
import type { ZuerichSnapshot } from '../daten/anbieter/gemeinsam/zuerich'
import type { StreifenErgebnis } from '../rechner/typen'
import { zuerichVorbelegen } from './zuerich'
import { eingabenBilden,quellenWahlSetzen,bedarfLesen,type Vorbelegung } from './fallBedarf'
const s=roentgen as ZuerichSnapshot
it('Tagesregel der Röntgenstrasse erscheint mit amtlichem Stand und wird erst durch Wahl bestätigt',()=>{
 const st=[{p0:[2682276.7370771933,1248548.680105273],p1:[2682272.7269241973,1248546.1804095309],m:[2682274.7320006955,1248547.430257402]}] as StreifenErgebnis[]
 const w:Vorbelegung={};zuerichVorbelegen(st,s,[{name:'Röntgenstrasse',tags:{highway:'residential'},teile:s.tempo!.objekte[0].teile}],w,{id:'osm.tempo',wert:30,quelle:'osm',text:'OSM maxspeed'},{wert:null,text:''},()=>{})
 expect(w.vSig).toMatchObject({wert:30,bestaetigungNoetig:true});expect(eingabenBilden(w,undefined).eingaben.vSig.wert).toBeNull()
 const q=w.vSig.quellenOptionen![0];expect(q).toMatchObject({id:'zh.tempo',wert:30,zusatz:'tagsüber; nachts Fahrverbot',datenstand:'02.11.2026 (Katalogaktualisierung)'})
 const b=quellenWahlSetzen(undefined,'vSig',q)!;expect(eingabenBilden(w,b).eingaben.vSig.wert).toBe(30);expect(b.felder.vSig.datenquelle?.text).toContain('Nachtfahrverbot')
 expect(bedarfLesen(JSON.parse(JSON.stringify(b)))[0]).toEqual(b)
})
