import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { regionalDienst } from './regionalDienste'
import { regionalLesen, type RegionalSnapshot } from './regional'
import { signalEntscheideLesen, signalVorschlaege } from './regionalSignale'
const ids=['ge.signal','ge.lsa','ge.markierung','lu.fgs','ktzh.fgs','ktzh.lsa','sz.signal','sz.fgs_signal','bs.lsa','lu.lsa','stadtzh.lsa','sg.fgs','zg.fgs']
const roh=(id:string)=>{const t=readFileSync(new URL(`./testdaten/regional/${id}.${id.startsWith('sz.')?'xml':'json'}`,import.meta.url),'utf8');return id.startsWith('sz.')?t:JSON.parse(t)}
describe('E3 amtliche Streifen und Signale',()=>{
 it.each(ids)('prüft echte Antwort %s mit Punkt-/Liniengeometrie',id=>{
  const xs=regionalLesen(regionalDienst(id)!,roh(id));expect(xs.length).toBeGreaterThan(0);expect(xs.every(o=>o.punkte?.length||o.teile?.length)).toBe(true)
 })
 it('unterscheidet Markierungslinie, Streifenpunkt, Streifensignal und LSA',()=>{
  expect(regionalLesen(regionalDienst('ge.markierung')!,roh('ge.markierung'))[0]).toMatchObject({verkehr:'fgs',bestaetigen:true})
  const lu=regionalLesen(regionalDienst('lu.fgs')!,roh('lu.fgs'))[0];expect(lu.verkehr).toBe('fgs');expect(lu.hinweis).toContain('keine Aussage zur normativen Verkehrssicherheit')
  expect(regionalLesen(regionalDienst('ktzh.lsa')!,roh('ktzh.lsa')).every(o=>o.verkehr===undefined)).toBe(true)
  const sz=roh('sz.signal') as string;expect(regionalLesen(regionalDienst('sz.signal')!,sz.replace(/3\.02/g,'4.11'))[0].verkehr).toBe('fgs_signal')
 })
 it('erkennt aktive Zürcher LSA, nicht andere BSA-Anlagen',()=>{
  const r=JSON.parse(readFileSync(new URL('./testdaten/regional/ktzh-lsa-aktiv.json',import.meta.url),'utf8'))
  expect(regionalLesen(regionalDienst('ktzh.lsa')!,r).every(o=>o.verkehr==='lsa')).toBe(true)
 })
 it('inaktive Signale und Streifen werden nicht als Bestand angeboten',()=>{
  const ge=roh('ge.signal');ge.features[0].properties.ETAT='Supprimé';expect(regionalLesen(regionalDienst('ge.signal')!,ge)[0].verkehr).toBeUndefined()
  const zh=roh('ktzh.fgs');zh.features[0].properties.status_txt='geplant';expect(regionalLesen(regionalDienst('ktzh.fgs')!,zh)[0].verkehr).toBeUndefined()
 })
 it('Signalpunkte sind vor Zuordnung nur Vorschläge; kein leeres Inventar ergibt eine negative Aussage',()=>{
  const d=regionalDienst('ge.signal')!,objekte=regionalLesen(d,roh(d.id)),p=objekte[0].punkte![0]
  const s:RegionalSnapshot={version:1,mitte:p,radiusM:200,teile:[{id:d.id,url:'',roh:{},abgerufen:'2026-11-02T00:00:00Z',datenstand:'unbekannt',objekte}]}
  const xs=signalVorschlaege(s,{knoten:12,zufahrt:'123:0:1',p,name:'Testzufahrt'})
  expect(xs[0]).toMatchObject({art:'give_way',knoten:12,zufahrt:'123:0:1'});expect(signalEntscheideLesen(xs)).toEqual(xs)
  expect(signalVorschlaege(null,{knoten:12,zufahrt:'x',p,name:''})).toEqual([])
  expect(signalEntscheideLesen([{...xs[0],quelleId:'fremd'}])).toEqual([])
 })
})
