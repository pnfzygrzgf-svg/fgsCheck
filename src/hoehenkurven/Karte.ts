import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { AUS, TITEL, ZOOM, kachelSchluessel, laenge, type Box, type Ergebnis, type Stand } from './modell'
import { lv95, wgs } from './projektion'
import { standSetzen } from './stand'
import type { HoehenLader } from './holen'

const PANE='swissalti-hoehenkurven'
function zeichnen(map:L.Map,e:Ergebnis):L.LayerGroup {
  if(!map.getPane(PANE)){const pane=map.createPane(PANE);pane.style.zIndex='399';pane.style.pointerEvents='none'}
  const gruppe=L.layerGroup(),renderer=L.canvas({pane:PANE,padding:.15})
  const kurven=e.kurven.map(k=>({...k,laenge:laenge(k.punkte)})).sort((a,b)=>(b.h%5===0?1:0)-(a.h%5===0?1:0)||b.laenge-a.laenge)
  const labels:{x:number;y:number;h:number}[]=[],size=map.getSize()
  for(const k of kurven){
    const ps=k.punkte.map(([e,n])=>wgs(e,n)),major=k.h%5===0
    if(k.laenge<.5)continue
    L.polyline(ps,{renderer,pane:PANE,color:'#fff7e8',weight:major?3.2:2.2,opacity:.8,interactive:false}).addTo(gruppe)
    L.polyline(ps,{renderer,pane:PANE,color:'#7c350e',weight:major?1.7:.9,opacity:.9,interactive:false}).addTo(gruppe)
    if(k.laenge<20||labels.length>=35)continue
    const indices=[Math.floor(ps.length/2),Math.floor(ps.length/3),Math.floor(ps.length*2/3)]
    for(const i of indices){
      const p=map.latLngToContainerPoint(ps[i])
      if(p.x<35||p.y<25||p.x>size.x-35||p.y>size.y-25||labels.some(q=>Math.abs(q.x-p.x)<95&&Math.abs(q.y-p.y)<42||q.h===k.h&&Math.hypot(q.x-p.x,q.y-p.y)<180))continue
      labels.push({x:p.x,y:p.y,h:k.h})
      L.marker(ps[i],{pane:PANE,interactive:false,keyboard:false,icon:L.divIcon({className:'hk-zahl',iconSize:[0,0],
        html:`<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(255,255,255,.94);border-radius:3px;padding:0 3px;color:#6b2d0b;font:600 11px/1.4 system-ui">${k.h} m</span>`})}).addTo(gruppe)
      break
    }
  }
  // Der Renderer wird zusammen mit dem ersetzten Ausschnitt entfernt.
  gruppe.on('remove',()=>renderer.remove())
  return gruppe.addTo(map)
}
export function useHoehenkurven(map:L.Map|null,kontext:unknown){
  const [an,setAn]=useState(false),[stand,setStand]=useState<Stand>(AUS)
  const lader=useRef<Promise<HoehenLader>|null>(null),alterKontext=useRef(kontext)
  useEffect(()=>{
    if(alterKontext.current!==kontext){lader.current=null;alterKontext.current=kontext}
    const melden=(s:Stand)=>{setStand(s);standSetzen(s)}
    if(!map||!an){melden(AUS);return}
    if(lader.current)lader.current=lader.current.then(l=>{l.aktualisieren();return l})
    let angezeigt:Ergebnis|null=null
    let aktiv=true,ctrl:AbortController|null=null,gruppe:L.LayerGroup|null=null,debounce:ReturnType<typeof setTimeout>|undefined,frist:ReturnType<typeof setTimeout>|undefined
    const entfernen=()=>{gruppe?.remove();gruppe=null}
    const stoppen=()=>{ctrl?.abort();ctrl=null;clearTimeout(frist);clearTimeout(debounce)}
    const laden=()=>{
      stoppen()
      if(map.getZoom()<ZOOM){entfernen();angezeigt=null;melden({phase:'zoom',text:`Zum Anzeigen auf Zoom ${ZOOM} heranzoomen.`});return}
      const b=map.getBounds(),ps=[lv95(b.getSouth(),b.getWest()),lv95(b.getNorth(),b.getWest()),lv95(b.getSouth(),b.getEast()),lv95(b.getNorth(),b.getEast())]
      const box:Box=[Math.floor(Math.min(...ps.map(p=>p[0]))),Math.floor(Math.min(...ps.map(p=>p[1]))),Math.ceil(Math.max(...ps.map(p=>p[0]))),Math.ceil(Math.max(...ps.map(p=>p[1])))]
      try{kachelSchluessel(box)}catch(e){melden({phase:'fehler',text:(e as Error).message,...(angezeigt?{ergebnis:angezeigt}:{})});return}
      const c=new AbortController();ctrl=c
      melden({phase:'laedt',text:'Höhenkurven werden für den Ausschnitt geladen …'+(angezeigt?' Bisheriger Ausschnitt bleibt sichtbar.':''),...(angezeigt?{ergebnis:angezeigt}:{})})
      frist=setTimeout(()=>{if(aktiv&&ctrl===c){c.abort();melden({phase:'fehler',text:'Höhenkurven nicht vollständig geladen (Zeitlimit). Ausschnitt bewegen oder Ebene erneut einschalten.'+(angezeigt?' Bisheriger Ausschnitt bleibt sichtbar.':''),...(angezeigt?{ergebnis:angezeigt}:{})})}},35000)
      lader.current??=import('./holen').then(m=>new m.HoehenLader())
      void lader.current.then(l=>{if(!aktiv||c.signal.aborted)throw new DOMException('Abgebrochen','AbortError');return l.laden(box,c.signal)}).then(e=>{
        if(!aktiv||ctrl!==c||c.signal.aborted)return
        clearTimeout(frist);const ersatz=zeichnen(map,e);entfernen();gruppe=ersatz;angezeigt=e
        melden({phase:'bereit',text:`${e.kurven.length} Linienabschnitte im Ausschnitt`,ergebnis:e})
      }).catch(err=>{if(aktiv&&ctrl===c&&!c.signal.aborted){clearTimeout(frist);melden({phase:'fehler',text:`Höhenkurven nicht verfügbar: ${(err as Error).message}`+(angezeigt?' Bisheriger Ausschnitt bleibt sichtbar.':''),...(angezeigt?{ergebnis:angezeigt}:{})})}})
    }
    const bewegen=()=>{stoppen();debounce=setTimeout(laden,350)}
    map.on('movestart',stoppen);map.on('moveend',bewegen);laden()
    map.attributionControl.addAttribution('© swisstopo (Höhenkurven aus swissALTI3D)')
    return()=>{aktiv=false;stoppen();entfernen();map.off('movestart',stoppen);map.off('moveend',bewegen);map.attributionControl.removeAttribution('© swisstopo (Höhenkurven aus swissALTI3D)')}
  },[map,an,kontext])
  return {an,setzen:setAn,stand,titel:TITEL}
}
