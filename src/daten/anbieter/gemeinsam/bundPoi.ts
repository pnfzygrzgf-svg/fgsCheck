import { mitBundesBudget } from './bundesBudget'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { wgs,lv95,type P } from '../../../geo'
import type { Abruf } from '../../holen'
import { Z, BASE, kachel } from './bundPoiUrl'
export { poiUrl } from './bundPoiUrl'
export function poiLesen(bytes:Uint8Array,x:number,y:number,p:P,r:number):Record<string,unknown>[] {
  if(bytes.length>10000000)throw new Error('POI-Kachel zu gross')
  const l=new VectorTile(new PbfReader(bytes)).layers.poi,aus:Record<string,unknown>[]=[]
  if(!l)return aus
  if(l.length>50000)throw new Error('POI-Kachel zu viele Objekte')
  for(let i=0;i<l.length;i++){
    const f=l.feature(i),c=f.properties.class
    if(!['school','kindergarten','hospital'].includes(String(c))||f.type!==1)continue
    const g=f.toGeoJSON(x,y,Z),coords=g.geometry.type==='Point'?[g.geometry.coordinates]:g.geometry.type==='MultiPoint'?g.geometry.coordinates:[]
    if(!coords.some(q=>{const a=lv95(q[1],q[0]);return Math.max(Math.abs(a[0]-p[0]),Math.abs(a[1]-p[1]))<=r}))continue
    aus.push({...g,id:`${Z}/${x}/${y}:${f.id??i}`,properties:{...f.properties,sourceTile:`${BASE}/${Z}/${x}/${y}.pbf`}})
  }
  return aus
}
export async function ladeBundPoi(p:P,r=200,signal?:AbortSignal):Promise<Abruf<{roh:unknown;meta:{datenstand:string}}>>{
  const start=performance.now(),corners=[[-r,-r],[-r,r],[r,-r],[r,r]].map(([x,y])=>kachel(...wgs(p[0]+x,p[1]+y)))
  const xs=corners.map(c=>c[0]),ys=corners.map(c=>c[1]),features:Record<string,unknown>[]=[],staende=new Set<string>();let bytes=0
  if((Math.max(...xs)-Math.min(...xs)+1)*(Math.max(...ys)-Math.min(...ys)+1)>9)throw new Error('POI-Ausschnitt zu gross')
  for(let x=Math.min(...xs);x<=Math.max(...xs);x++)for(let y=Math.min(...ys);y<=Math.max(...ys);y++){
    await mitBundesBudget(signal,async budgetSignal=>{
    const ctrl=new AbortController(),forward=()=>ctrl.abort(budgetSignal?.reason),timer=setTimeout(()=>ctrl.abort(),20000)
    if(budgetSignal?.aborted)ctrl.abort();else budgetSignal?.addEventListener('abort',forward,{once:true})
    try{
      const res=await fetch(`${BASE}/${Z}/${x}/${y}.pbf`,{signal:ctrl.signal});if(!res.ok)throw new Error(`POI HTTP ${res.status}`)
      const b=new Uint8Array(await res.arrayBuffer());bytes+=b.length;features.push(...poiLesen(b,x,y,p,r))
      const t=res.headers.get('last-modified'),d=t?new Date(t):null
      if(d&&Number.isFinite(d.getTime()))staende.add(`${d.toISOString().slice(0,10).split('-').reverse().join('.')} (Kachelveröffentlichung, Last-Modified)`)
    }finally{clearTimeout(timer);budgetSignal?.removeEventListener('abort',forward)}
    })
  }
  return {daten:{roh:{type:'FeatureCollection',features},meta:{datenstand:[...staende].sort().join('; ')||'unbekannt (kein Kachelstand geliefert)'}},bytes,ms:performance.now()-start,quelle:'vectortiles.geo.admin.ch'}
}
