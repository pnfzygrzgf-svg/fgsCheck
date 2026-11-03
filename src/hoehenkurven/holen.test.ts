import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeArrayBuffer } from 'geotiff'
import { HoehenLader } from './holen'
import { STAC, type Box } from './modell'
const box:Box=[2602200,1199400,2602240,1199440]
const fixture=(e:number)=>{
 const v=Float32Array.from({length:250000},(_,i)=>500+(e+2*(i%500)+1-2602000)/100)
 return writeArrayBuffer(v,{width:500,height:500,BitsPerSample:[32],SampleFormat:[3],ModelPixelScale:[2,2,0],ModelTiepoint:[0,0,0,e,1200000,0],ProjectedCSTypeGeoKey:2056,GTModelTypeGeoKey:1,GTRasterTypeGeoKey:1})
}
const tiles=new Map([[2602000,fixture(2602000)],[2603000,fixture(2603000)]])
function catalogue(version='v1'){
 return [2602,2603].map(e=>{const id=`swissalti3d_2025_${e}-1199`,name=`${id}_2_2056_5728.tif`;return{id,properties:{datetime:'2025-01-01T00:00:00Z'},assets:{[name]:{href:`https://data.geo.admin.ch/ch.swisstopo.swissalti3d/${id}/${name}`,gsd:2,'proj:epsg':2056,'file:checksum':version}}}})
}
function server(options:{voll?:boolean;luecke?:boolean;version?:string;folge?:boolean}={}){
 return vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input)
  if(init?.signal?.aborted)throw new DOMException('abgebrochen','AbortError')
  if(url.startsWith(STAC)){
   const fs=options.luecke?[]:catalogue(options.version)
   return Response.json(options.folge&&!url.includes('page=2')?{features:fs.slice(0,1),links:[{rel:'next',href:STAC+'?page=2'}]}:{features:options.folge?fs.slice(1):fs,links:[]})
  }
  const e=Number(url.match(/_2025_(\d{4})-/)?.[1])*1000,b=tiles.get(e)!
  if(options.voll)return new Response(b,{status:200})
  const range=new Headers(init?.headers).get('Range');expect(range).toMatch(/^bytes=\d+-\d+$/)
  const [a,z]=range!.slice(6).split('-').map(Number),end=Math.min(z,b.byteLength-1)
  return new Response(b.slice(a,end+1),{status:206,headers:{'Content-Range':`bytes ${a}-${end}/${b.byteLength}`}})
 })
}
afterEach(()=>vi.unstubAllGlobals())
describe('Höhenkurven: echter TIFF-Decoder mit begrenzten Abrufen',()=>{
 it('liest nur Teilantworten; gleicher Ausschnitt kommt aus dem Cache, Aktualisieren fragt den Katalog erneut ab',async()=>{
  const fetcher=server();vi.stubGlobal('fetch',fetcher);const l=new HoehenLader(),s=new AbortController().signal
  const a=await l.laden(box,s);expect(a.kurven.length).toBeGreaterThan(0);expect(a.bytes).toBeGreaterThan(0)
  const calls=fetcher.mock.calls.length;expect(await l.laden(box,s)).toBe(a);expect(fetcher).toHaveBeenCalledTimes(calls)
  l.aktualisieren();await l.laden(box,s);expect(fetcher.mock.calls.filter(([u])=>String(u).startsWith(STAC))).toHaveLength(2)
 })
 it('mosaikiert eine Kachelgrenze mit konsistenten Kurven und verarbeitet Folgeseiten',async()=>{
  vi.stubGlobal('fetch',server({folge:true}));const r=await new HoehenLader().laden([2602980,1199400,2603020,1199440],new AbortController().signal)
  expect(r.kacheln).toHaveLength(2);expect(r.kurven.some(k=>k.h===510)).toBe(true)
  for(const k of r.kurven)for(const [x]of k.punkte)expect(x).toBeCloseTo(2602000+(k.h-500)*100,1)
 })
 it('holt nach einer neuen Katalogversion neue Raster und gibt keine alte Quelle aus',async()=>{
  const o={version:'v1'},fetcher=server(o);vi.stubGlobal('fetch',fetcher);const l=new HoehenLader(),s=new AbortController().signal
  await l.laden(box,s);const before=fetcher.mock.calls.length;o.version='v2';l.aktualisieren()
  const r=await l.laden(box,s);expect(r.kacheln[0].version).toBe('v2');expect(fetcher.mock.calls.length).toBeGreaterThan(before+1)
 })
 it('meldet fehlende Kacheln und verhindert vollständige Rasterdownloads',async()=>{
  vi.stubGlobal('fetch',server({luecke:true}));await expect(new HoehenLader().laden(box,new AbortController().signal)).rejects.toThrow('kein passendes')
  vi.stubGlobal('fetch',server({voll:true}));await expect(new HoehenLader().laden(box,new AbortController().signal)).rejects.toThrow('Teilantwort')
 })
 it('verhindert Netzabrufe nach Abbruch und verwirft abgebrochene Ergebnisse',async()=>{
  const f=server();vi.stubGlobal('fetch',f);const c=new AbortController();c.abort()
  await expect(new HoehenLader().laden(box,c.signal)).rejects.toMatchObject({name:'AbortError'});expect(f).not.toHaveBeenCalled()
 })
 it('kann nach einem Abbruch während eines Rasterabrufs wieder laden',async()=>{
  const f=server(),l=new HoehenLader();vi.stubGlobal('fetch',f)
  await l.laden(box,new AbortController().signal)
  const c=new AbortController(),andererAusschnitt:Box=[2603200,1199400,2603240,1199440]
  let abgebrochen=false
  vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(!String(input).startsWith(STAC)&&!abgebrochen){abgebrochen=true;c.abort();throw new DOMException('abgebrochen','AbortError')}
   return f(input,init)
  })
  await expect(l.laden(andererAusschnitt,c.signal)).rejects.toMatchObject({name:'AbortError'})
  vi.stubGlobal('fetch',f)
  const r=await l.laden(andererAusschnitt,new AbortController().signal)
  expect(r.box).toEqual(andererAusschnitt);expect(r.kurven.length).toBeGreaterThan(0)
 })
 it('folgt keinem fremden Kataloglink',async()=>{
  const f=vi.fn(async()=>Response.json({features:catalogue(),links:[{rel:'next',href:'https://example.org/next'}]}));vi.stubGlobal('fetch',f)
  await expect(new HoehenLader().laden(box,new AbortController().signal)).rejects.toThrow('Unerwartete Katalog')
  expect(f).toHaveBeenCalledOnce()
 })
})
