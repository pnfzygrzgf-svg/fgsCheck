import {describe,it,expect} from 'vitest'
import {ebenenQuellenText,objektQuellenText} from './ebenenQualitaet'
describe('Tatsächliche Quelle und ihr jeweiliger Stand',()=>{
 it('OSM-Ersatz nennt weder Bern noch dessen Datum',()=>{
  const text=ebenenQuellenText([{text:'Tempo30',quelle:'OpenStreetMap',quellenSchluessel:'osm'}],'Geoportal Stadt Bern',{datenstand:'01.11.2026'},{osm:{datenstand:'31.10.2026 (OSM-Datenbank)'},vsig:{datenstand:'01.11.2026'}})
  expect(text).toContain('OpenStreetMap; Datenstand 31.10.2026');expect(text).not.toContain('Stadt Bern');expect(text).not.toContain('01.11.2026')
 })
 it('gemischte Ebene weist jeden Anbieter mit seinem Stand aus',()=>{
  const text=ebenenQuellenText([{text:'Schule',quelle:'Stadt Bern',quellenSchluessel:'schulen'},{text:'Heim',quelle:'OpenStreetMap',quellenSchluessel:'osm'}],'',{},{schulen:{datenstand:'01.10.2026'},osm:{datenstand:'31.10.2026'}})
  expect(text).toContain('Stadt Bern; Datenstand 01.10.2026');expect(text).toContain('OpenStreetMap; Datenstand 31.10.2026')
 })
 it('fehlende Metadaten übernehmen kein fremdes Datum; gespeicherter Objektstand bleibt erhalten',()=>{
  expect(ebenenQuellenText([{text:'a',quelle:'OSM',quellenSchluessel:'osm'}],'Bern',{datenstand:'01.11.2026'})).toContain('OSM; Datenstand unbekannt')
  expect(objektQuellenText({text:'Halt',quelle:'BAV',datenstand:'02.11.2026 (Ebene)'},'')).toContain('Quelle: BAV; Datenstand 02.11.2026 (Ebene)')
 })
})
