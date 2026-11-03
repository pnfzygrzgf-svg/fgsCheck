import { BaseClient, BaseResponse, fromCustomClient, type GeoTIFF, type GeoTIFFImage, type TypedArrayWithDimensions } from 'geotiff'
import { ableiten } from './ableiten'
import { STAC, RASTER, rasterBox, kachelSchluessel, kachelnWaehlen, type Box, type Ergebnis, type Kachel, type Raster } from './modell'
import { wgs } from './projektion'

interface Budget {bytes:number}
class Antwort extends BaseResponse {
  constructor(private r:Response,private budget:Budget){super()}
  get status(){return this.r.status}
  getHeader(name:string){return this.r.headers.get(name)??undefined}
  async getData(){const a=await this.r.arrayBuffer();this.budget.bytes+=a.byteLength;if(this.budget.bytes>16000000)throw Error('Datenlimit des Höhenausschnitts erreicht. Bitte näher heranzoomen.');return a}
}
class RasterClient extends BaseClient {
  budget:Budget={bytes:0}
  fehler:Error|null=null
  async request({headers,signal}:RequestInit={}){
    try{
    if(!new Headers(headers).get('Range'))throw Error('Unbegrenzter Höhenraster-Abruf verhindert.')
    const r=await fetch(this.url,{headers,signal,cache:'no-store'})
    if(r.status!==206){void r.body?.cancel();throw Error(`Höhenraster liefert keine Teilantwort (HTTP ${r.status}).`)}
    return new Antwort(r,this.budget)
    }catch(e){this.fehler=e as Error;throw e}
  }
}
interface Bild {tiff:GeoTIFF;bild:GeoTIFFImage;client:RasterClient}
/** Ein Steuerobjekt je Karte und Sitzung. Zwischengespeicherte Blöcke überdauern keinen neuen Ladevorgang der Quellen. */
export class HoehenLader {
  private katalog=new Map<string,Kachel>()
  private bilder=new Map<string,Bild>()
  private letztes:{key:string;wert:Ergebnis}|null=null
  leeren(){this.katalog.clear();this.bilder.clear();this.letztes=null}
  aktualisieren(){this.katalog.clear();this.letztes=null}
  private async katalogLaden(box:Box,keys:string[],signal:AbortSignal):Promise<Kachel[]> {
    if(keys.every(k=>this.katalog.has(k)))return keys.map(k=>this.katalog.get(k)!)
    const b=rasterBox(box),ps=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(([e,n])=>wgs(e,n))
    const q=new URLSearchParams({bbox:[Math.min(...ps.map(p=>p[1])),Math.min(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0]))].join(','),limit:'100'})
    let url:string|null=STAC+'?'+q;const features:unknown[]=[],gesehen=new Set<string>()
    while(url){
      if(gesehen.has(url)||gesehen.size>=8)throw Error('Unvollständiger Höhenkatalog (zu viele Ergebnisseiten).')
      const u=new URL(url);if(u.origin!=='https://data.geo.admin.ch'||u.pathname!==new URL(STAC).pathname)throw Error('Unerwartete Katalog-Folgeseite.')
      gesehen.add(url)
      const r=await fetch(url,{signal,cache:'no-store'});if(!r.ok)throw Error(`Höhenkatalog HTTP ${r.status}`)
      const d=await r.json() as {features?:unknown[];links?:{rel:string;href:string}[]}
      if(!Array.isArray(d.features)||!Array.isArray(d.links))throw Error('Ungültiger Höhenkatalog.')
      features.push(...d.features)
      const next=d.links.filter(l=>l.rel==='next');if(next.length>1)throw Error('Mehrdeutige Katalog-Folgeseite.')
      url=next[0]?new URL(next[0].href,url).href:null
    }
    const ks=kachelnWaehlen(features,keys)
    if(signal.aborted)throw new DOMException('Abgebrochen','AbortError')
    for(let i=0;i<keys.length;i++)this.katalog.set(keys[i],ks[i])
    while(this.katalog.size>24)this.katalog.delete(this.katalog.keys().next().value!)
    return ks
  }
  private async bild(k:Kachel,budget:Budget,signal:AbortSignal):Promise<Bild>{
    const key=k.url+'|'+k.version,alt=this.bilder.get(key)
    if(alt){alt.client.budget=budget;alt.client.fehler=null;return alt}
    const client=new RasterClient(k.url);client.budget=budget
    const options={blockSize:65536,cacheSize:64,allowFullFile:false,maxRanges:1}
    let tiff:GeoTIFF, bild:GeoTIFFImage
    try{tiff=await fromCustomClient(client,options,signal);bild=await tiff.getImage()}
    catch(e){throw client.fehler??e}
    const [e,n]=bild.getOrigin(),[rx,ry]=bild.getResolution(),g=bild.getGeoKeys()
    if(g?.ProjectedCSTypeGeoKey!==2056||rx!==RASTER||ry!==-RASTER||e!==k.e||n!==k.n+1000||bild.getWidth()!==500||bild.getHeight()!==500||bild.getSamplesPerPixel()!==1)throw Error('Höhenraster hat eine unerwartete Lage, Auflösung oder Projektion.')
    if(signal.aborted)throw new DOMException('Abgebrochen','AbortError')
    const v={tiff,bild,client};this.bilder.set(key,v)
    while(this.bilder.size>8)this.bilder.delete(this.bilder.keys().next().value!)
    return v
  }
  async laden(box:Box,signal:AbortSignal):Promise<Ergebnis>{
    if(signal.aborted)throw new DOMException('Abgebrochen','AbortError')
    const keys=kachelSchluessel(box),key=box.join(','),t=performance.now(),budget={bytes:0}
    if(this.letztes?.key===key)return this.letztes.wert
    const ks=await this.katalogLaden(box,keys,signal),b=rasterBox(box)
    const r:Raster={links:b[0],oben:b[3],breite:(b[2]-b[0])/RASTER,hoehe:(b[3]-b[1])/RASTER,werte:new Float32Array((b[2]-b[0])*(b[3]-b[1])/4)}
    r.werte.fill(NaN)
    // Höchstens zwei Netz- bzw. Dekodieraufträge gleichzeitig.
    for(let i=0;i<ks.length;i+=2)await Promise.all(ks.slice(i,i+2).map(async k=>{
      const {bild,client}=await this.bild(k,budget,signal),x0=Math.max(0,(b[0]-k.e)/2),y0=Math.max(0,(k.n+1000-b[3])/2),x1=Math.min(500,(b[2]-k.e)/2),y1=Math.min(500,(k.n+1000-b[1])/2)
      let a:TypedArrayWithDimensions
      try{a=await bild.readRasters({window:[x0,y0,x1,y1],interleave:true,signal})}
      catch(e){this.bilder.delete(k.url+'|'+k.version);throw client.fehler??e}
      const dx=(k.e+x0*2-b[0])/2,dy=(b[3]-(k.n+1000-y0*2))/2,nd=bild.getGDALNoData()
      for(let y=0;y<y1-y0;y++)for(let x=0;x<x1-x0;x++){const h=Number(a[y*(x1-x0)+x]);r.werte[(dy+y)*r.breite+dx+x]=h===nd||h<0||h>5000?NaN:h}
    }))
    if(signal.aborted)throw new DOMException('Abgebrochen','AbortError')
    const ergebnis={kurven:ableiten(r,box),kacheln:ks,box,abgerufen:new Date().toISOString(),ms:performance.now()-t,bytes:budget.bytes}
    if(signal.aborted)throw new DOMException('Abgebrochen','AbortError')
    this.letztes={key,wert:ergebnis};return ergebnis
  }
}
