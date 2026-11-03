import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BerichtQuellenTabelle } from './Datenlage'
import { datenschutzGruppen } from './daten/quellenregister'
import { E6_DIENSTE } from './daten/anbieter/gemeinsam/e6'
import { quellenThema } from './daten/anbieter/gemeinsam/sortierung'
import { bundFach } from './daten/anbieter/gemeinsam/bundGeoAdmin'

it('grenzt jede Kontextquelle in der Berichttabelle von rechenwirksamen Quellen ab',()=>{
 for(const d of E6_DIENSTE){
  const html=renderToStaticMarkup(<BerichtQuellenTabelle ids={['regional.'+d.id]} />)
  expect(html).toContain('nur Kartenkontext')
 }
 expect(renderToStaticMarkup(<BerichtQuellenTabelle ids={['bern.vsig']} />)).not.toContain('nur Kartenkontext')
})
it('nennt die Zürcher Metadatenadresse auch bei den regionalen Empfängern',()=>{
 const gruppe=datenschutzGruppen().gruppen.find(g=>g.name.startsWith('Regionale Geoportale'))!
 expect(gruppe.text).toContain('data.stadt-zuerich.ch')
})
it('unterscheidet Berner taktile Markierungen von den VBZ-Rillen im Ladezustand',()=>{
 const bern=quellenThema('taktil','Bern'),vbz=quellenThema('regional.e6.zh.taktil','VBZ')
 expect(bern).toContain('Bern');expect(vbz).toContain('VBZ');expect(bern).not.toBe(vbz)
})
it('übersetzt den Tram-Betriebszustand verständlich, ohne die fachliche Auswahl zu ändern',()=>{
 expect(bundFach('bund.tram',{verkehrsmittel:200,ausser_betrieb:1}).hinweis).toContain('in Betrieb')
 expect(bundFach('bund.tram',{verkehrsmittel:200,ausser_betrieb:2}).hinweis).toContain('ausser Betrieb: ja')
 expect(bundFach('bund.tram',{verkehrsmittel:200}).hinweis).toContain('Betriebszustand unbekannt')
 expect(bundFach('bund.tram',{verkehrsmittel:200,ausser_betrieb:1}).bund?.typ).toBe('tram')
 expect(bundFach('bund.tram',{verkehrsmittel:200,ausser_betrieb:0}).bund).toBeUndefined()
})

import { regionaleQuellenAngabe, regionaleQuelleMitStand } from './regionaleQuellenTexte'
it('kennzeichnet Kontext auch in Quellenfusszeile und Berichtszusatz, mit Name und Quellenstand',()=>{
 for(const d of E6_DIENSTE){
  expect(regionaleQuellenAngabe(d.id)).toContain('nur Kartenkontext')
  expect(regionaleQuellenAngabe(d.id)).toContain(d.name)
  const text=regionaleQuelleMitStand({id:d.id,datenstand:'Stand A',abgerufen:'2026-11-03T12:00:00Z'})
  expect(text).toContain('Stand A');expect(text).toContain('2026-11-03T12:00:00Z');expect(text).toContain('nur Kartenkontext')
 }
 expect(regionaleQuellenAngabe('ktzh.tempo')).not.toContain('nur Kartenkontext')
})

import { e6Lesen } from './daten/anbieter/gemeinsam/e6'
it('erklärt auch einen fehlerhaften Kontextabruf ohne internes Paketkürzel',()=>{
 expect(()=>e6Lesen(E6_DIENSTE[0],null)).toThrow(/^Kartenkontext:/)
})
