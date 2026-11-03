import { describe, it, expect } from 'vitest'
import { regionalVorbelegen } from './regional'
import { quellenWahlSetzen, eingabenBilden, type Vorbelegung } from './fallBedarf'
import type { RegionalSnapshot } from '../daten/anbieter/gemeinsam/regional'
import type { StreifenErgebnis } from '../rechner/typen'
import type { P } from '../geo'
const mitte: P = [2600000,1200000], achse: P[] = [[2599950,1200000],[2600050,1200000]]
const st = [{p0:[2600000,1199997],p1:[2600000,1200003],m:mitte}] as StreifenErgebnis[]
const strassen = [{name:'Teststrasse',tags:{highway:'residential'},teile:[achse]}]
const snapshot = (name: string): RegionalSnapshot => ({version:1,mitte,radiusM:200,teile:[{id:'ktzh.tempo',url:'',roh:{},abgerufen:'2026-11-02T00:00:00Z',datenstand:'14.08.2025',objekte:[{id:'test',name,tempo:30,zone:null,bestaetigen:false,stand:null,hinweis:'',teile:[achse]}]}]})
describe('Regionale Tempoquellen am Feld',()=>{
 it('bietet namenlose amtliche Achse neben OSM an; zählt erst nach Wahl; Hand bleibt bestehen',()=>{
   const w:Vorbelegung={vSig:{wert:50,quelle:'osm',text:'OSM',quellenOptionen:[{id:'osm.tempo',wert:50,quelle:'osm',text:'OSM'}]}}
   regionalVorbelegen(st,snapshot(''),strassen,w)
   expect(w.vSig?.wert).toBe(50);expect(w.vSig?.quellenOptionen?.map(o=>o.id)).toEqual(['regional.ktzh.tempo','osm.tempo'])
   const b=quellenWahlSetzen({felder:{}},'vSig',w.vSig!.quellenOptionen![0]);expect(b?.felder.vSig.datenquelle?.id).toBe('regional.ktzh.tempo')
   expect(eingabenBilden(w,b).eingaben.vSig.wert).toBe(30)
   expect(eingabenBilden(w,{felder:{vSig:{wert:40,quelle:'hand'}}}).eingaben.vSig.wert).toBe(40)
 })
 it('eine Tempozahl ergibt keine Zone und keinen Innerortsbeleg',()=>{
   const w:Vorbelegung={};regionalVorbelegen(st,snapshot('Teststrasse'),strassen,w)
   expect(w.vSig?.wert).toBe(30);expect(w.tempoRegime).toBeUndefined();expect(w.innerorts).toBeUndefined()
 })
})
