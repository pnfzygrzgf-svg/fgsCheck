import { holeBundJson as holeJson, holeBundText as holeText } from './bundesAbruf'
import { type Abruf } from '../../holen'
import type { P } from '../../../geo'
import { eigenschaften, geoAdminUrl, type GeoAdminRoh, type GeoAdminFeature } from './geoAdmin'
import { istObjekt } from './regionalGeometrie'
export function bundUrl(layer:string,p:P,r=200):string {
  const u=new URL(geoAdminUrl(layer,[p[0]-r,p[1]-r,p[0]+r,p[1]+r].map(v=>v.toFixed(2)).join(','),'esriGeometryEnvelope'))
  if(layer==='ch.astra.unfaelle-personenschaeden_alle')u.searchParams.set('layerDefs',JSON.stringify({[layer]:'accidentyear >= 2011'}))
  return u.toString()
}
export const bundLegendeUrl=(layer:string)=>`https://api3.geo.admin.ch/rest/services/api/MapServer/${layer}/legend?lang=de`
/** Die GeoAdmin-Grenzen gelten je zugrundeliegender Tabelle. Dichte Gebiete werden vor dem Filtern geteilt (z. B. Bahn vor Tram). */
export async function ladeBundGeoAdmin(layer:string,p:P,r=200,signal?:AbortSignal):Promise<Abruf<{roh:GeoAdminRoh;meta:{legende:string}}>> {
  const start=performance.now(), out=new Map<string,GeoAdminFeature>();let bytes=0,anfragen=0
  const legende=holeText(bundLegendeUrl(layer),{},12000,signal).then(([res,t])=>res.ok?t:'').catch(()=>'')
  const lesen=async(c:P,rad:number,tiefe:number):Promise<void>=>{
    if(++anfragen>85)throw new Error('Bundesquelle: zu viele Teilabfragen; kleinerer Ausschnitt nötig')
    const a=await holeJson<GeoAdminRoh>(bundUrl(layer,c,rad),{},25000,signal);bytes+=a.bytes
    if(a.daten.error||!Array.isArray(a.daten.results))throw new Error(a.daten.error?.message??'Bundesquelle: ungültige Antwort')
    if(a.daten.exceededTransferLimit||a.daten.results.length>=200){
      if(tiefe>=4)throw new Error('Bundesquelle: Ausschnitt trotz Teilabfragen unvollständig')
      for(const dx of [-1,1])for(const dy of [-1,1])await lesen([c[0]+dx*rad/2,c[1]+dy*rad/2],rad/2,tiefe+1)
      return
    }
    for(const f of a.daten.results){
      if(f.layerBodId!==layer||f.featureId===undefined&&f.id===undefined)throw new Error('Bundesquelle: Herkunft/Objektkennung fehlt')
      const id=String(f.featureId??f.id),alt=out.get(id)
      if(alt&&JSON.stringify(alt.geometry)!==JSON.stringify(f.geometry))throw new Error('Bundesquelle: widersprüchliche Teilantworten')
      out.set(id,f)
    }
  }
  await lesen(p,r,0)
  const html=await legende;if(signal?.aborted)throw new DOMException('abgebrochen','AbortError')
  // Die App braucht Gebäudeklassen und Adressen, keine Registerangaben auf Wohnungsebene.
  const results=[...out.values()].map(f=>layer==='ch.bfs.gebaeude_wohnungs_register'?{...f,properties:Object.fromEntries(Object.entries(eigenschaften(f)).filter(([k])=>['egid','gklas','gstat','gexpdat','gbez','strname_deinr','gkode','gkodn'].includes(k))),attributes:undefined}:f)
  return {daten:{roh:{results},meta:{legende:html}},ms:performance.now()-start,bytes:bytes+html.length,quelle:'api3.geo.admin.ch'}
}
export function bundFeatures(roh:unknown,layer:string):Record<string,unknown>[] {
  if(!istObjekt(roh)||!Array.isArray(roh.results)||roh.results.length>10000)throw new Error('Bundesquelle: Objektliste fehlt')
  return roh.results.map(f=>{if(!istObjekt(f)||f.layerBodId!==layer||!['string','number'].includes(typeof(f.featureId??f.id))||!String(f.featureId??f.id).trim()||(!istObjekt(f.properties)&&!istObjekt(f.attributes)))throw new Error('Bundesquelle: falsche Herkunft')
    return {id:String(f.featureId??f.id),properties:f.properties??f.attributes,geometry:f.geometry}
  })
}
export interface BundFach {typ:'tram'|'strasse'|'bauzone'|'bildung'|'gesundheit'|'gemeinschaft'|'schule'|'kindergarten'|'spital'|'unfall';code?:number;fuss?:boolean;velo?:boolean;jahr?:number}
export function bundFach(id:string,p:Record<string,unknown>):{bund?:BundFach;name:string;hinweis:string} {
  const str=(x:unknown)=>typeof x==='string'?x.trim():''
  if(id==='bund.tram')return { ...(p.verkehrsmittel===200&&p.ausser_betrieb===1?{bund:{typ:'tram' as const}}:{}),name:'Tramgleis',hinweis:`swissTLM3D Verkehrsmittel ${p.verkehrsmittel}; ${p.ausser_betrieb===1?'in Betrieb (ausser Betrieb: nein)':p.ausser_betrieb===2?'ausser Betrieb: ja':'Betriebszustand unbekannt'}; Höhenlage und Beziehung zur Querung prüfen, keine Haltekante` }
  if(id==='bund.strasse')return {bund:{typ:'strasse',code:typeof p.verkehrsbedeutung==='number'?p.verkehrsbedeutung:undefined},name:str(p.strassenname),hinweis:`Verkehrsbedeutung ${p.verkehrsbedeutung===200?'Durchgangsstrasse':p.verkehrsbedeutung===300?'Verbindungsstrasse':'unbekannt'}; Objektart/Breitenklasse ${p.objektart}; keine gemessene Fahrbahnbreite und keine direkte Normklassierung`}
  if(id==='bund.bauzone')return {bund:{typ:'bauzone',code:Number(p.ch_code_hn)},name:str(p.ch_bez_d),hinweis:'Harmonisierte Bauzone; Indiz für Nutzung/Bebauung, kein Nachweis von Ortstafeln oder Innerortslage'}
  if(id==='bund.gwr'){
    const typ=p.gklas===1263?'bildung':p.gklas===1264?'gesundheit':p.gklas===1130?'gemeinschaft':null
    return {...(typ&&p.gstat===1004?{bund:{typ,code:Number(p.gklas)} as BundFach}:{}),name:str(p.gbez)||str(p.strname_deinr),hinweis:`GWR Gebäudeklasse ${p.gklas}; ${typ==='bildung'?'auch Hochschule/Forschung möglich: Schulart bestätigen':typ==='gesundheit'?'Gesundheitsgebäude: Spital/Heim und Bedarf bestätigen':'Gemeinschaftswohnen: kein eindeutiger Heimnachweis'}; Gebäude ist keine vollständige Einrichtungserfassung`}
  }
  if(id==='bund.poi'){
    const c=str(p.class),typ=c==='school'?'schule':c==='kindergarten'?'kindergarten':c==='hospital'?'spital':null
    return {...(typ?{bund:{typ} as BundFach}:{}),name:str(p.name)||str(p['name:de']),hinweis:`Basiskarten-POI ${c}; genaue Schul-/Einrichtungsart, Eingang und Bezug zur Querung bestätigen; kein Vollständigkeitsnachweis`}
  }
  if(id==='bund.unfaelle')return {bund:{typ:'unfall',fuss:p.involving_pedestrian===true,velo:p.involving_bicycle===true,jahr:Number(p.accidentyear)},name:str(p.accidenttype_de),hinweis:`${p.accidentyear}; ${str(p.severitycategory_de)}; ${str(p.roadtype_de)}; Lage anonymisiert; nur Karteninformation`}
  return {name:'',hinweis:''}
}
