import { contours } from 'd3-contour'
import { RASTER, ringSchneiden, type Box, type Kurve, type Punkt, type Raster } from './modell'

/** Keine Weichzeichnung und kein Umrechnen; d3 smooth heisst Interpolation zwischen den Originalpixeln. */
export function ableiten(r:Raster,box:Box):Kurve[] {
  let min=Infinity,max=-Infinity
  for(const h of r.werte){if(!Number.isFinite(h))throw Error('Höhenraster deckt den Ausschnitt nicht vollständig ab.');min=Math.min(min,h);max=Math.max(max,h)}
  if(max-min>160)throw Error('Sehr grosser Höhenbereich. Bitte näher heranzoomen.')
  const levels:number[]=[];for(let h=Math.ceil(min);h<=Math.floor(max);h++)levels.push(h)
  const geo=contours().size([r.breite,r.hoehe]).thresholds(levels)(Array.from(r.werte))
  const aus:Kurve[]=[]
  for(const g of geo)for(const poly of g.coordinates)for(const ring of poly){
    const ps=ring.map(([x,y]):Punkt=>[r.links+x*RASTER,r.oben-y*RASTER])
    for(const punkte of ringSchneiden(ps,box))aus.push({h:g.value,punkte})
  }
  if(aus.reduce((s,k)=>s+k.punkte.length,0)>250000)throw Error('Sehr viele Geländedetails. Bitte einen kleineren Ausschnitt wählen.')
  return aus
}
