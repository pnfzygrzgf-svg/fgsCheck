import { regionalDienst } from './daten/anbieter/gemeinsam/regionalDienste'
export function regionaleQuellenAngabe(id:string):string {
 const d=regionalDienst(id)
 if(!d)return 'Regionale Quelle'
 return `${d.name}; ${d.lizenz}${id.startsWith('e6.')?' (nur Kartenkontext)':''}`
}
export function regionaleQuelleMitStand(t:{id:string;datenstand:string;abgerufen:string}):string {
 return `${regionaleQuellenAngabe(t.id)}; Datenstand ${t.datenstand}, abgerufen ${t.abgerufen}; Vollständigkeit unbekannt`
}
