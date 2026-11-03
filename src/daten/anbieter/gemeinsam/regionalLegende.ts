import type { RegionalDienst } from './regionalDienste'
import { e6Legende } from './e6'
export type QuellenLegende=[string,string,string,string?][]
export function regionalLegende(art:RegionalDienst['art']):QuellenLegende {
  if (art === 'beleuchtung' || art === 'taktil' || art === 'netz') return e6Legende(art)
  if(art==='tempo')return [['t20','#16a34a','20 km/h und weniger'],['t30','#65a30d','30 km/h'],['t40','#ca8a04','40 km/h'],['t50','#ea580c','50 km/h'],['t60','#dc2626','60 km/h und mehr'],['offen','#64748b','Tempo ungeklärt']]
  if(art==='zone')return [['t30','#65a30d','Tempo-30-Zone'],['t20','#16a34a','Begegnungszone'],['offen','#7c3aed','Fussgängerzone / ungeklärt']]
  if(art==='lsa')return [['lsa','#9333ea','Lichtsignalanlage','L']]
  if(art==='signal')return [['stop','#dc2626','Stop','S'],['give_way','#eab308','Kein Vortritt','V'],['hauptstrasse','#ca8a04','Hauptstrasse','H'],['fgs_signal','#0891b2','Streifensignal, keine Querungsachse','S']]
  if(art==='fgs'||art==='markierung')return [['fgs','#2563eb',art==='fgs'?'Streifenpunkt, Geometrie prüfen':'Einzelne Fussgängermarkierung','F']]
  if(art==='tram')return [['tram','#dc2626','Tramgleis; Haltestellenbezug offen']]
  if(art==='strasse')return [['strasse200','#dc2626','Durchgangsstrasse (TLM)'],['strasse300','#eab308','Verbindungsstrasse (TLM)'],['strasse','#64748b','Verkehrsbedeutung unbekannt']]
  if(art==='bauzone')return [['bauzone','#a855f7','Bauzone; Nutzung/Innerortslage bestätigen']]
  if(art==='unfall')return [['unfall','#b91c1c','Unfall mit Personenschaden','U']]
  return [['heim','#86198f','Heim / Spital','H'],['einrichtung','#64748b','Einrichtungstyp ungeklärt','?'],['bildung','#1d4ed8','Bildung/Forschung, Typ prüfen','?'],['gesundheit','#7c3aed','Gesundheitsgebäude, Typ prüfen','?'],['gemeinschaft','#be185d','Gemeinschaftswohnen, Typ prüfen','?'],['schule','#1d4ed8','Schul-POI, Schulart prüfen','S?'],['kindergarten','#0891b2','Kindergarten-POI, prüfen','K?'],['spital','#7c3aed','Spital-POI, prüfen','H?']]
}
export const REGIONAL_THEMA:Record<RegionalDienst['art'],string>={tempo:'Tempo',zone:'Verkehrszonen',fgs:'Fussgängerstreifen',signal:'Signale',lsa:'Lichtsignalanlagen',markierung:'Fussgängerstreifen',tram:'Tramgleise',strasse:'Strassentyp',bauzone:'Bauzonen',bedarf:'Schulen, Kindergärten und Einrichtungen',unfall:'Unfälle',beleuchtung:'Beleuchtung',taktil:'Taktile Markierungen',netz:'Fuss- und Velowegnetz'}
