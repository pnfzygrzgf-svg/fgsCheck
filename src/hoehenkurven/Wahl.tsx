import type { ReactNode } from 'react'
import type { Stand } from './modell'
import { TITEL } from './modell'
import { kurzStand } from './stand'
export function HoehenkurvenWahl({an,setzen,stand,klasse,link}:{an:boolean;setzen:(an:boolean)=>void;stand:Stand;klasse:string;link?:ReactNode}){
  return <label className={klasse}>
    <input type="checkbox" checked={an} onChange={e=>setzen(e.target.checked)}/>
    <span><b>{TITEL}</b><small>{an?stand.text:'Ausgeschaltet; lädt ab Zoom 18.'}</small>
      <small title={stand.ergebnis?.kacheln.map(k=>`${k.id}: ${k.stand}`).join(' · ')}>© swisstopo; Höhenabstand 1 m, Raster 2 m; Datenstand {stand.ergebnis?kurzStand(stand.ergebnis):'unbekannt (noch nicht geladen)'}; Vollständigkeit unbekannt.</small>{link}
    </span>
  </label>
}
