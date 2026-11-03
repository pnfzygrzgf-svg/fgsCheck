import { describe, expect, it } from 'vitest'
import { amtlicheKandidaten, amtlicherUebergangLesen } from './amtlicheUebergaenge'
import { regionalLesen, regionalUrl, type RegionalSnapshot } from './anbieter/gemeinsam/regional'
import { regionalDienst } from './anbieter/gemeinsam/regionalDienste'
import roh from './anbieter/gemeinsam/testdaten/regional/lu.fgs.json'
import { fallLesen, fallSchreiben, leererFall, fallVersion, eingabenZahl } from '../fall'
import { osmMitLuftbildUebergang, ohneLuftbildUebergang, istLuftbildUebergang } from './luftbildFgs'
import { osmParsen } from './osm'
import { wgs } from '../geo'
const d=regionalDienst('lu.fgs')!,objekte=regionalLesen(d,roh),mitte=objekte[0].punkte![0]
const s:RegionalSnapshot={version:1,mitte,radiusM:200,teile:[{id:d.id,roh,objekte,url:regionalUrl(d,mitte),abgerufen:'2026-11-02T00:00:00Z',datenstand:'unbekannt'}]}
describe('Amtliche Querungskandidaten',()=>{
 it('eigene Kandidaten mit stabiler Kennung; OSM-Gegenstück wird unterdrückt',()=>{
  const a=amtlicheKandidaten(s,[]);expect(a.length).toBeGreaterThan(0);expect(a[0].id).toBeLessThan(-7000000000000000);expect(amtlicheKandidaten(s,[])).toEqual(a)
  const [lat,lon]=wgs(...a[0].p);expect(amtlicheKandidaten(s,[{lat,lon}]).find(k=>k.id===a[0].id)).toBeUndefined()
  expect(amtlicherUebergangLesen({...a[0],id:-1})).toBeNull()
 })
 it('Speicherung mit amtlicher Herkunft und Stand; keine ETH-Sicherheit erfinden',()=>{
  const a=amtlicheKandidaten(s,[])[0],[lat,lon]=wgs(...a.p),f=leererFall(lat,lon,a.id);f.ort.amtlich=a;f.regional=s
  const [g,h]=fallLesen(fallSchreiben(f));expect(h).toEqual([]);expect(g.ort.amtlich).toEqual(a);expect(g.ort.herkunft).toBeUndefined();expect(fallVersion(f)).toBe(9);expect(eingabenZahl(f)).toBe(1)
 })
 it('nur nach Auswahl synthetisch einfügen; kein OSM- oder ETH-Beleg',()=>{
  const a=amtlicheKandidaten(s,[])[0],x=osmMitLuftbildUebergang({elements:[]},a.id,{p:a.p,richtung:null},{highway:'crossing','crossing:markings':'zebra',source:`amtlich:${a.quelleId}`})
  const o=osmParsen(x as Parameters<typeof osmParsen>[0]);expect(o.uebergaenge).toHaveLength(1);expect(istLuftbildUebergang(o.uebergaenge[0].tags)).toBe(false)
  expect(ohneLuftbildUebergang(o).uebergaenge).toHaveLength(0)
 })
})
