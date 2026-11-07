import { describe, expect, it } from 'vitest'
import { ableiten } from './ableiten'
import { kachelSchluessel, kachelnWaehlen, kurveBei, schneiden, type Raster } from './modell'
import { lv95, wgs } from './projektion'
export function feature(jahr=2025,e=2602,n=1199,version='v1'){
 const id=`swissalti3d_${jahr}_${e}-${n}`,name=`${id}_2_2056_5728.tif`
 return {id,properties:{datetime:`${jahr}-01-01T00:00:00Z`},assets:{[name]:{href:`https://data.geo.admin.ch/ch.swisstopo.swissalti3d/${id}/${name}`,gsd:2,'proj:epsg':2056,updated:'2026-11-02T00:00:00Z','file:checksum':version}}}
}
describe('Höhenkurven: fachliche Geometrie und Quellenwahl',()=>{
 it('wählt die neueste Ausgabe; Bereitstellung ist kein Aufnahmejahr',()=>{
  const [k]=kachelnWaehlen([feature(2023),feature(2025)],['2602-1199'])
  expect(k.jahr).toBe('2025');expect(k.stand).toContain('Bereitstellung 02.11.2026');expect(k.stand).toContain('Aufnahmejahr nicht ausgewiesen')
 })
 it('weist fehlende, widersprüchliche und fremde Raster zurück',()=>{
  expect(()=>kachelnWaehlen([],['2602-1199'])).toThrow('kein passendes')
  expect(()=>kachelnWaehlen([feature(),feature(2025,2602,1199,'anders')],['2602-1199'])).toThrow('Mehrdeutige')
  const f=feature();Object.values(f.assets)[0].href='https://example.org/raster.tif'
  expect(()=>kachelnWaehlen([f],['2602-1199'])).toThrow('Unerwartetes')
 })
 it('berücksichtigt Nachbarzellen an Kachelgrenzen und begrenzt den Ausschnitt',()=>{
  expect(kachelSchluessel([2602980,1199380,2603020,1199420])).toEqual(['2602-1199','2603-1199'])
  expect(kachelSchluessel([2602998,1199998,2603002,1200002])).toHaveLength(4)
  expect(()=>kachelSchluessel([2600000,1190000,2604000,1194000])).toThrow('vier')
  expect(()=>kachelSchluessel([NaN,0,1,1])).toThrow('Ungültiger')
 })
 it('leitet 1-m-Linien auf einer bekannten Ebene ab und schneidet künstliche Rasterrahmen weg',()=>{
  // Zellmitten: x=1,3,...,11; h=500+x/2. Kurven bei x=2,4,6,8,10.
  const r:Raster={links:0,oben:12,breite:6,hoehe:6,werte:Float32Array.from({length:36},(_,i)=>500+(i%6+.5))}
  const ks=ableiten(r,[2,2,10,10]);expect(ks.length).toBeGreaterThan(0)
  for(const k of ks)for(const [x,y] of k.punkte){expect(x).toBeCloseTo((k.h-500)*2,5);expect(y).toBeGreaterThanOrEqual(2);expect(y).toBeLessThanOrEqual(10)}
  expect(new Set(ks.map(k=>k.h))).toEqual(new Set([501,502,503,504,505]))
  expect(schneiden([-1,5],[11,5],[0,0,10,10])).toEqual([[0,5],[10,5]])
 })
 it('meldet Datenlücken und zu grosse Höhenbereiche ausdrücklich',()=>{
  const r:Raster={links:0,oben:4,breite:2,hoehe:2,werte:new Float32Array([500,501,502,NaN])}
  expect(()=>ableiten(r,[0,0,4,4])).toThrow('nicht vollständig')
  r.werte[3]=700;expect(()=>ableiten(r,[0,0,4,4])).toThrow('Höhenbereich')
 })
 it('projiziert die Linien ohne die frühere metergrosse Näherungsverschiebung',()=>{
  for(const p of [[2602379.1139,1199440.7495],[2626141.0762,1198843.0283]]){
   const ll=wgs(p[0],p[1]),q=lv95(ll[0],ll[1]);expect(Math.hypot(q[0]-p[0],q[1]-p[1])).toBeLessThan(.002)
  }
 })
})

describe('kurveBei', () => {
  const e = { kurven: [{ h: 555, punkte: [[0, 0], [100, 0]] as [number, number][] }, { h: 556, punkte: [[0, 5], [100, 5]] as [number, number][] }], kacheln: [], box: [0, 0, 1, 1] as [number, number, number, number], abgerufen: '', ms: 0, bytes: 0 }
  it('nennt die nächste Kurve im Umkreis', () => {
    expect(kurveBei(e, [50, 1], 3)).toBe(555)
    expect(kurveBei(e, [50, 4], 3)).toBe(556)
    expect(kurveBei(e, [50, 50], 3)).toBeNull()
  })
})
