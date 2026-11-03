import { zhStrassen } from '../daten/anbieter/gemeinsam/zuerichZuordnung'
import type { RegionalSnapshot } from '../daten/anbieter/gemeinsam/regional'
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { SignalEntscheid } from '../daten/anbieter/gemeinsam/regionalSignale'
import { rechneKnoten } from './rechnen'
import { KEINE_ALLE_EINGABEN, type KnotenFall } from './typen'
const p:P=[2600000,1200000]
const ll=(x:number,y:number)=>wgs(p[0]+x,p[1]+y)
const weg=(id:number,ns:[number,number,number][],tags:Record<string,string>):OsmWeg=>({id,knoten:ns.map(n=>n[0]),geom:ns.map(n=>ll(n[1],n[2])),tags})
const osm:OsmDaten={wege:[weg(1,[[10,-200,0],[12,0,0],[13,200,0]],{highway:'residential',name:'Hauptstrasse',maxspeed:'50'}),weg(2,[[12,0,0],[20,0,-200]],{highway:'residential',name:'Nebenstrasse',maxspeed:'30'})],tram:[],uebergaenge:[],ampeln:[],relationen:[],querungen:[],vortritt:[]}
const av:AvFlaeche={art:'Strasse_Weg',kanton:'BE',bfs:351,qualitaet:'AV93',ringe:[[[-200,-3],[-2.5,-3],[-2.5,-200],[2.5,-200],[2.5,-3],[200,-3],[200,3],[-200,3],[-200,-3]].map(([x,y])=>[p[0]+x,p[1]+y])]}
const entscheid=(art:SignalEntscheid['art'],extra:Partial<SignalEntscheid>={}):SignalEntscheid=>({objektId:'ge.signal:test',quelleId:'ge.signal',name:'Données SITG',art,knoten:12,zufahrt:'2:0:1',p:[p[0]+3,p[1]-10],datenstand:'01.11.2026',abgerufen:'2026-11-02T00:00:00Z',...extra})
const rechnen=(xs:SignalEntscheid[],extra:Partial<KnotenFall>={})=>rechneKnoten(osm,[av],{knoten:12,zufahrt:'2:0:1',tempoAmtlich:{linien:[],bereich:null,quelle:'amtliche Quelle',signalEntscheide:xs},...extra})
describe('Bestätigte amtliche Signalzuordnungen im Knotenrechner',()=>{
 it('Stop gilt nur an der bestätigten Zufahrt, mit amtlicher Herkunft',()=>{
  const r=rechnen([entscheid('stop')]);expect(r.ergebnis?.regelung).toBe('stop');expect(r.ergebnis?.regelungQuelle).toContain('Données SITG');expect(r.knoten?.vortrittSicher).toContain('Zuordnung bestätigt')
  expect(rechnen([entscheid('stop',{zufahrt:'fremd'})]).ergebnis?.regelungQuelle).not.toContain('Données SITG')
  expect(rechnen([entscheid('stop',{knoten:999})]).ergebnis?.regelung).not.toBe('stop')
 })
 it('eigene Regelung hat Vorrang vor amtlichem Vorschlag und gespeicherter Bestätigung',()=>{
  const r=rechnen([entscheid('stop')],{eingaben:{...KEINE_ALLE_EINGABEN,regelung:'vortritt'}})
  expect(r.ergebnis?.regelung).toBe('vortritt');expect(r.ergebnis?.hinweise.join(' ')).toContain('Données SITG')
 })
 it('LSA erst nach Knotenbestätigung; ohne Bestätigung keine Negativaussage',()=>{
  expect(rechnen([]).knoten?.lsa).toBeUndefined()
  const r=rechnen([entscheid('lsa',{quelleId:'ge.lsa'})]);expect(r.knoten?.lsa).toBe(true);expect(r.ergebnis?.lsa).toBe(true);expect(r.ergebnis?.hinweise.join(' ')).toContain('Lichtsignalanlage')
 })
})

it('amtliches Tempo wirkt auch in der Vortrittsvorgabe; keine Ortstafel daraus ableiten',()=>{
 const r:RegionalSnapshot={version:1,mitte:p,radiusM:300,teile:[{id:'bs.tempo',url:'',roh:{},abgerufen:'2026-11-02T00:00:00Z',datenstand:'unbekannt',objekte:[{id:'bs.tempo:a',name:'Hauptstrasse',teile:[[[p[0]-250,p[1]],[p[0]+250,p[1]]]],tempo:30,zone:null,bestaetigen:false,stand:null,hinweis:''}]}]}
 const vorher=rechnen([]).ergebnis!
 const nachher=rechneKnoten(osm,[av],{knoten:12,zufahrt:'2:0:1',tempoAmtlich:{linien:[],bereich:{mitte:p,radiusM:300},quelle:'amtliche regionale Quelle',regional:r,zhStrassen:zhStrassen(osm.wege)}}).ergebnis!
 expect(vorher.regelungVorgabe).toBe('vortritt');expect(nachher.regelungVorgabe).toBe('rechtsvortritt');expect(nachher.regelungQuelle).toContain('Basel-Stadt')
 expect(nachher.ausserorts).toBe(vorher.ausserorts)
})
