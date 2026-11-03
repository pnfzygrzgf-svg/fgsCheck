export type Punkt = [number, number]
export type Box = [number, number, number, number]
export const TITEL = 'Höhenkurven (swissALTI3D)'
export const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items'
export const ZOOM = 18
export const RASTER = 2
export const ABSTAND = 1
export interface Kachel { id:string; jahr:string; e:number; n:number; url:string; stand:string; version:string }
export interface Raster { links:number; oben:number; breite:number; hoehe:number; werte:Float32Array }
export interface Kurve { h:number; punkte:Punkt[] }
export interface Ergebnis { kurven:Kurve[]; kacheln:Kachel[]; box:Box; abgerufen:string; ms:number; bytes:number }
export interface Stand { phase:'aus'|'zoom'|'laedt'|'bereit'|'fehler'; text:string; ergebnis?:Ergebnis }
export const AUS:Stand = {phase:'aus',text:'Ausgeschaltet; lädt ab Zoom 18.'}

export function rasterBox(box:Box):Box {
  if (!box.every(Number.isFinite) || box[2]<=box[0] || box[3]<=box[1]) throw Error('Ungültiger Kartenausschnitt.')
  return [Math.floor(box[0]/RASTER)*RASTER-RASTER,Math.floor(box[1]/RASTER)*RASTER-RASTER,
    Math.ceil(box[2]/RASTER)*RASTER+RASTER,Math.ceil(box[3]/RASTER)*RASTER+RASTER]
}
export function kachelSchluessel(box:Box):string[] {
  const b=rasterBox(box), aus:string[]=[]
  const e0=Math.floor(b[0]/1000),e1=Math.ceil(b[2]/1000)-1,n0=Math.floor(b[1]/1000),n1=Math.ceil(b[3]/1000)-1
  if((e1-e0+1)*(n1-n0+1)>4)throw Error('Dieser Ausschnitt benötigt mehr als vier Höhenkacheln. Bitte näher heranzoomen.')
  if((b[2]-b[0])*(b[3]-b[1])/4>600000)throw Error('Der Ausschnitt ist zu gross. Bitte näher heranzoomen.')
  for(let e=e0;e<=e1;e++)for(let n=n0;n<=n1;n++)aus.push(`${e}-${n}`)
  return aus
}
const objekt=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const datum=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x))?x:undefined
export function kachelnWaehlen(features:unknown[], keys:string[]):Kachel[] {
  return keys.map(key=>{
    const treffer:Kachel[]=[]
    for(const f of features){
      if(!objekt(f)||typeof f.id!=='string')continue
      const m=f.id.match(/^swissalti3d_(\d{4})_(\d{4})-(\d{4})$/)
      if(!m||`${m[2]}-${m[3]}`!==key)continue
      if(!objekt(f.properties)||!datum(f.properties.datetime)||!objekt(f.assets))throw Error('Unvollständige Höhenkachel-Metadaten.')
      const name=`${f.id}_2_2056_5728.tif`,a=f.assets[name]
      if(!objekt(a)||a.gsd!==2||a['proj:epsg']!==2056||typeof a.href!=='string')throw Error('Passendes 2-m-Höhenraster fehlt.')
      const u=new URL(a.href)
      if(u.protocol!=='https:'||u.host!=='data.geo.admin.ch'||u.pathname!==`/ch.swisstopo.swissalti3d/${f.id}/${name}`||u.search)throw Error('Unerwartetes Höhenraster-Ziel.')
      const publ=datum(a.updated)??datum(a.created)
      treffer.push({id:f.id,jahr:m[1],e:Number(m[2])*1000,n:Number(m[3])*1000,url:u.href,
        stand:`Ausgabe ${m[1]}${publ?`; Bereitstellung ${publ.slice(0,10).split('-').reverse().join('.')}`:''}; Aufnahmejahr nicht ausgewiesen`,
        version:String(a['file:checksum']??publ??f.properties.datetime)})
    }
    if(!treffer.length)throw Error(`Für Kachel ${key} ist kein passendes Höhenraster verfügbar.`)
    treffer.sort((a,b)=>b.jahr.localeCompare(a.jahr))
    if(treffer.length>1&&treffer[0].jahr===treffer[1].jahr&&treffer[0].version!==treffer[1].version)throw Error('Mehrdeutige aktuelle Höhenkachel.')
    return treffer[0]
  })
}
/** Liang–Barsky: schneidet Höhenkurven ausserhalb des sichtbaren Ausschnitts ab. */
export function schneiden(a:Punkt,b:Punkt,box:Box):[Punkt,Punkt]|null {
  const dx=b[0]-a[0],dy=b[1]-a[1];let u=0,v=1
  const ps=[-dx,dx,-dy,dy],qs=[a[0]-box[0],box[2]-a[0],a[1]-box[1],box[3]-a[1]]
  for(let i=0;i<4;i++){
    if(ps[i]===0){if(qs[i]<0)return null;continue}
    const t=qs[i]/ps[i]
    if(ps[i]<0)u=Math.max(u,t);else v=Math.min(v,t)
    if(u>v)return null
  }
  return [[a[0]+u*dx,a[1]+u*dy],[a[0]+v*dx,a[1]+v*dy]]
}
export function ringSchneiden(ring:Punkt[],box:Box):Punkt[][] {
  const teile:Punkt[][]=[];let teil:Punkt[]=[]
  for(let i=1;i<ring.length;i++){
    const s=schneiden(ring[i-1],ring[i],box)
    if(!s){if(teil.length>1)teile.push(teil);teil=[];continue}
    const last=teil[teil.length-1]
    if(last&&Math.hypot(last[0]-s[0][0],last[1]-s[0][1])<1e-5)teil.push(s[1])
    else{if(teil.length>1)teile.push(teil);teil=[...s]}
  }
  if(teil.length>1)teile.push(teil)
  return teile
}
export function laenge(ps:Punkt[]):number {let s=0;for(let i=1;i<ps.length;i++)s+=Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1]);return s}
export function standText(e:Ergebnis):string {
  return e.kacheln.map(k=>`${k.id}: ${k.stand}`).join(' · ')
}
