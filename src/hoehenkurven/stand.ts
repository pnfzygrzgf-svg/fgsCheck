import { useMemo, useSyncExternalStore } from 'react'
import { AUS, TITEL, standText, type Ergebnis, type Stand } from './modell'
let wert:Stand=AUS
const listener=new Set<()=>void>()
export const standLesen=()=>wert
export const standAbonnieren=(f:()=>void)=>{listener.add(f);return()=>{listener.delete(f)}}
export function standSetzen(s:Stand){wert=s;for(const f of listener)f()}
export const useHoehenkurvenStand=()=>useSyncExternalStore(standAbonnieren,standLesen,standLesen)
export function kurzStand(e:Ergebnis):string {
  return [...new Set(e.kacheln.map(k=>k.stand))].join(' · ')
}
interface QuellenInfo {name:string;server:string;datenstand:string;vollstaendigkeit:string;objekte?:string;zeit?:string;ms?:number;bytes?:number;fehler?:string}
export function useHoehenkurvenQuelle(){
  const s=useHoehenkurvenStand()
  return useMemo(():Record<string,QuellenInfo>=>{
    if(s.phase!=='bereit'&&s.phase!=='fehler')return {}
    return {hoehenkurven:{name:TITEL,server:'data.geo.admin.ch · Kartenkontext, keine Änderung der Sichtrechnung',
      datenstand:s.ergebnis?standText(s.ergebnis):'unbekannt',vollstaendigkeit:'unbekannt',
      objekte:s.ergebnis?`${s.ergebnis.kurven.length} Linienabschnitte; Höhenabstand 1 m, Raster 2 m`:undefined,
      zeit:s.ergebnis?.abgerufen,ms:s.ergebnis?.ms,bytes:s.ergebnis?.bytes,
      ...(s.phase==='fehler'?{fehler:s.text}:{})}}
  },[s])
}
