import {describe,it,expect} from 'vitest'
import {tempoQuelleArt,tempoQuellenName} from './tempoQuelle'
describe('Tempoherkunft ohne falschen Anbieter',()=>{
 it('OSM bleibt OSM, auch mit Attribut-/Mehrheitstext',()=>{
  expect(tempoQuelleArt(['OSM maxspeed','OSM'])).toBe('osm');expect(tempoQuellenName(['OSM maxspeed'])).toBe('OSM')
 })
 it('Zürich und andere Anbieter werden nie zu Bern oder OSM umbenannt',()=>{
  expect(tempoQuelleArt(['Stadt Zürich'])).toBe('amtlich');expect(tempoQuelleArt(['Geodaten Basel-Stadt; Datenstand 09.06.2026'])).toBe('amtlich')
  expect(tempoQuellenName(['Stadt Zürich'])).toBe('Stadt Zürich');expect(tempoQuellenName(['Geoportal'])).toBe('Geoportal Stadt Bern')
 })
})
