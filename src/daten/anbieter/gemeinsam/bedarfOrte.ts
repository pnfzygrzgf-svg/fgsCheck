import type { RegionalDienst } from './regionalDienste'
export type BedarfsArt = 'schule' | 'kindergarten' | 'heim'
export interface BedarfsOrt { art: BedarfsArt | null; wort: string; typ: string; unsicher?: true }
const hinweis = 'Einrichtungsinventar mit begrenztem Inhalt; Vollständigkeit unbekannt. Keine Negativaussage aus fehlenden Treffern.'
const arc = (id:string,name:string,kanton:string,url:string,extra:Partial<RegionalDienst>={}):RegionalDienst => ({id:`bedarf.${id}`,name,kanton,url,art:'bedarf',format:'arcgis',meta:`${url}?f=json`,anbieter:`Kanton ${kanton}`,apps:['fgs'],lizenz:'Quellenangabe gemäss Geoportal',hinweis,...extra})
const zh = (id:string,name:string,dienst:string,typ:string):RegionalDienst => ({id:`bedarf.zh.${id}`,name:`${name} (Stadt Zürich)`,anbieter:'Stadt Zürich',kanton:'ZH',bfs:261,art:'bedarf',format:'wfs',url:`https://www.ogd.stadt-zuerich.ch/wfs/geoportal/${dienst}`,typ,version:'1.1.0',output:'GeoJSON',meta:`https://data.stadt-zuerich.ch/api/3/action/package_show?id=geo_${dienst.toLowerCase()}`,apps:['fgs'],lizenz:'CC0, Stadt Zürich',hinweis})
const be = (id:string,name:string,dienst:string,layer:number,felder:string):RegionalDienst => arc(`be.${id}`,`${name} (Kanton Bern)`,'BE',`https://www.geoservice.apps.be.ch/geoservice3/rest/services/a42geo/${dienst}/MapServer/${layer}`,{anbieter:'Geoportal Kanton Bern',felder,ausgenommen:[351],lizenz:'Kanton Bern; freie Nutzung mit gut sichtbarem Quellen-/Grundlagenvermerk'})
const ge = (id:string,name:string,layer:string,felder:string):RegionalDienst => arc(`ge.${id}`,`${name} (Genève)`,'GE',`https://vector.sitg.ge.ch/arcgis/rest/services/${layer}/FeatureServer/0`,{anbieter:'SITG, Canton de Genève',felder,lizenz:'Données SITG; Open Data, Quellenangabe und Datenstand'})
const fr = (id:string,name:string,layer:string,felder:string):RegionalDienst => arc(`fr.${id}`,`${name} (Fribourg)`,'FR',`https://maps.fr.ch/ags/rest/services/OpenData/${layer}/FeatureServer/0`,{anbieter:'Etat de Fribourg',felder,lizenz:'Open Government Data; Source: Etat de Fribourg'})
export const BEDARF_DIENSTE:readonly RegionalDienst[] = [
 be('schule','Öffentliche Volksschulstandorte','of_society01_de_ms_wfs',27240,'OBJECTID,STONAME,STOSTRHSNR,GEMNAME'),
 be('kita','Kitas im Betreuungsgutscheinsystem','of_society03_de_ms_wfs',24277,'OBJECTID,ART_CODE,BETRARTT_ART_DE,NAME,STRASSE,ORT'),
 be('spital','Spitäler und Kliniken','of_health01_de_ms_wfs',8200,'OBJECTID,BEZ_FIRMA,BEZ_STO,LOKALISAT,AKUT,PSYCHKLIN,REHAKLIN,GEBURT'),
 be('heim','Angebote für Menschen im Alter','of_health01_de_ms_wfs',7972,'OBJECTID,INAME,ADRESSE,ALTERSHEIM,TAGESTBETA,WOHNMITDL'),
 be('behinderung','Angebote für Menschen mit Behinderung','of_health01_de_ms_wfs',4685,'OBJECTID,INAME,ADRESSE,WHEIMEMB,TAGSTEMB,WERKSTEMB'),
 zh('volksschule','Volksschulen','Schulanlagen','poi_volksschule_view'),
 zh('kindergarten','Kindergärten','Schulanlagen','poi_kindergarten_view'),
 zh('hort','Kinderhorte','Schulanlagen','poi_kinderhort_view'),
 zh('sonderschule','Sonderschulen','Schulanlagen','poi_sonderschule_view'),
 zh('kita','Kindertagesstätten','Kindertagesstaette','poi_kindertagesstaette_view'),
 zh('spital','Spitalstandorte und Abteilungen','Spital','poi_spital_view'),
 zh('heim','Gesundheitszentren für das Alter','Gesundheitszentrum','poi_gesundheitszentrum_view'),
 {id:'bedarf.winterthur',name:'Schulen, Betreuung, Heime und Spitäler (Winterthur)',kanton:'ZH',bfs:230,anbieter:'Stadt Winterthur',art:'bedarf',format:'ogc',url:'https://stadtplan.winterthur.ch/ogc/features/collections/points_of_interest.points_of_interest/items',meta:'https://stadtplan.winterthur.ch/ogc/features/collections/points_of_interest.points_of_interest?f=json',apps:['fgs'],lizenz:'Stadt Winterthur, Open Data; Quellenangabe',hinweis},
 ge('primaire','Primarschulen','DIP_ECOLES_PRIMAIRE','OBJECTID,NOM_ETABLISSEMENT,TYPE_ETABLISSEMENT,FORMATION_NIVEAU,ADRESSE'),
 ge('secondaire','Sekundarstufe I','DIP_CYCLES_ORIENTATION','OBJECTID,NOM_ETABLISSEMENT,TYPE_ETABLISSEMENT,FORMATION_NIVEAU,ADRESSE'),
 ge('special','Sonderschulen','DIP_ENSEIGNEMENT_SPECIALISE','OBJECTID,NOM_ETABLISSEMENT,TYPE_ETABLISSEMENT,FORMATION_NIVEAU,ADRESSE'),
 ge('ems','Alters- und Pflegeheime','DAS_EMS','OBJECTID,NOM_EMS,NOM_COURT,ADRESSE'),
 ge('hopital','Spitäler und Kliniken','DAS_HOPITAUX_CLINIQUES','OBJECTID,NOM_ETABLISSEMENT,TYPE_ETABLISSEMENT,ADRESSE'),
 ge('handicap','Einrichtungen für Menschen mit Behinderung','DAS_ETAB_HANDICAPE','OBJECTID,NOM,ORGANISME,TYPE_ETABL,ADRESSE'),
 fr('primaire','Primarschulen','Ecoles_primaires__batiments_','OBJECTID,BATIMENT_NOM,ETABLISSEMENT_NOM,CYCLE,ADRESSE'),
 fr('secondaire','Sekundarstufe I','Ecoles_secondaires__batiments_','OBJECTID,BATIMENT_NOM,ETABLISSEMENT_NOM,CYCLE,ADRESSE'),
 fr('kita','Betreuungsstrukturen','Structures_d_accueil','OBJECTID,Type_structure,Nom_structure,Type_code,Adresse'),
 ...[['schule','Schulen','sen_17_04_installations_scolaires_interrogation'],['kita','Kinderbetreuung','Commune_POI_enfance_interrogation'],['gesundheit','Gesundheitseinrichtungen','Commune_POI_sante_interrogation']].map(([id,name,typ]):RegionalDienst=>({id:`bedarf.ju.${id}`,name:`${name} (Jura)`,kanton:'JU',anbieter:'République et Canton du Jura',art:'bedarf',format:'gml',url:'https://geo.jura.ch/mapserv_proxy?ogcserver=Main_PNG',typ,version:'1.1.0',apps:['fgs'],lizenz:'Opendata BY, République et Canton du Jura',hinweis:id==='schule'?hinweis:`Kommunale POI, kein vollständiges kantonales Einrichtungsinventar. ${hinweis}`})),
]
const text=(x:unknown)=>typeof x==='string'?x.trim().replace(/<[^>]*>/g,' ').slice(0,1000):''
const falte=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
/** Die Einteilung beschreibt das Inventar, nie eine Negativaussage über die Umgebung. */
export function bedarfsOrt(id:string,p:Record<string,unknown>):{name:string;bedarf?:BedarfsOrt} {
 const name=text(p.STONAME)||text(p.NAME)||text(p.BEZ_STO)||text(p.INAME)||text(p.NOM_EMS)||text(p.NOM_ETABLISSEMENT)||text(p.BATIMENT_NOM)||text(p.Nom_structure)||text(p.bezeichnung)||text(p.name)||text(p.nom)||text(p.batiment)||text(p.NOM)||'ohne Namen'
 const wort=text(p.kategorie)||text(p.TYPE_ETABLISSEMENT)||text(p.Type_structure)||text(p.typ)||text(p.type)
 const result=(art:BedarfsArt|null,w:string,unsicher=false)=>({name,bedarf:{art,wort:w,typ:wort||w,...(unsicher?{unsicher:true as const}:{})}})
 const leer=()=>({name})
 if(id==='bedarf.be.schule')return result(/kindergarten|jardin d.enfants|ecole enfantine/i.test(name)?'kindergarten':'schule','öffentlicher Volksschulstandort')
 if(id==='bedarf.be.kita')return p.ART_CODE==='kita'?result('kindergarten','Kindertagesstätte'):p.ART_CODE==='tfo'?leer():result(null,'Betreuungsangebot, Art prüfen')
 if(id==='bedarf.be.spital')return [p.AKUT,p.PSYCHKLIN,p.REHAKLIN,p.GEBURT].some(x=>x===1)?result('heim','Spital/Klinik'):result(null,'Gesundheitseinrichtung, Art prüfen')
 if(id==='bedarf.be.heim')return p.ALTERSHEIM===1?result('heim','Alters-/Pflegeheim'):p.ALTERSHEIM===0?leer():result(null,'Altersangebot, Wohnheimbezug prüfen')
 if(id==='bedarf.be.behinderung')return p.WHEIMEMB===1?result('heim','Wohnheim'):p.WHEIMEMB===0?leer():result(null,'Einrichtung, Wohnheimbezug prüfen')
 if(id.startsWith('bedarf.zh.')){
  if(String(p.publish_internet)==='0')return leer()
  const k=id.slice(10),arts:Record<string,[BedarfsArt,string]>={volksschule:['schule','Volksschule'],kindergarten:['kindergarten','Kindergarten'],hort:['schule','Kinderhort'],sonderschule:['schule','Sonderschule'],kita:['kindergarten','Kindertagesstätte'],heim:['heim','Gesundheitszentrum für das Alter']}
  if(k==='spital')return result('heim','Spital-POI; Standort/Abteilung prüfen',true)
  const a=arts[k];return a?result(a[0],a[1]):leer()
 }
 if(id==='bedarf.winterthur'){
  if (/hochschule|universit|kantonsschule|gymnasium|berufs|weiterbildung/i.test(name))return leer()
  const arts:Record<string,[BedarfsArt,string]>={'Schulhaus':['schule','Schulhaus'],'Kindergarten':['kindergarten','Kindergarten'],'Vorschulkinder':['kindergarten','Kinderbetreuung Vorschulkinder'],'Schulkinder':['schule','Kinderbetreuung Schulkinder'],'Alters- und Pflegeheim':['heim','Alters-/Pflegeheim'],'Spital':['heim','Spital']}
  const t=text(p.typ),a=arts[t];return a?result(a[0],a[1],t==='Schulhaus'&&!/primar|sekundar|sonderschule/i.test(name)):leer()
 }
 if(id==='bedarf.ge.primaire')return result('schule','Primarschule')
 if(id==='bedarf.ge.secondaire')return result('schule','Sekundarstufe I')
 if(id==='bedarf.ge.special'){
  if(/profession/i.test(wort))return leer()
  const stufe=text(p.FORMATION_NIVEAU)
  if(stufe==='Foyer')return result('heim','Wohnheim',true)
  return ['Primaire','Secondaire'].includes(stufe)?result('schule','Sonderschule'):result(null,'Sonderschulangebot, Stufe prüfen')
 }
 if(id==='bedarf.ge.ems')return result('heim','Alters-/Pflegeheim (EMS)')
 if(id==='bedarf.ge.hopital')return ['Hôpital','Clinique'].includes(wort)?result('heim','Spital/Klinik'):leer()
 if(id==='bedarf.ge.handicap')return p.TYPE_ETABL==='H'?result('heim','Wohnheim (Inventarcode H)',true):p.TYPE_ETABL==='A'?leer():result(null,'Einrichtung, Wohnheimbezug prüfen')
 if(id==='bedarf.fr.primaire')return result('schule','Primarschule')
 if(id==='bedarf.fr.secondaire')return result('schule','Sekundarstufe I')
 if(id==='bedarf.fr.kita'){
  if(p.Type_code===3)return leer() // Büro einer Tagesfamilienorganisation ist kein Betreuungsort
  if(p.Type_code===2)return result('schule','ausserschulische Betreuung')
  if([1,4,5,6,7].includes(Number(p.Type_code)))return result('kindergarten',wort||'Vorschulbetreuung')
  return result(null,'Betreuungsstruktur, Art prüfen')
 }
 if(id==='bedarf.ju.schule')return wort==='Ecole primaire'?result('schule','Primarschule'):wort==='Ecole secondaire'?result('schule','Sekundarstufe I'): /secondaire II|tertiaire/i.test(wort)?leer():result(null,'Schule, Stufe prüfen')
 if(id==='bedarf.ju.kita'){
  const n=falte(name)
  if(/domicile|puericulture/.test(n))return leer()
  if(/uape|maison de l.enfance/.test(n))return result('schule','Kinderangebot',true)
  return /creche|jardin d.enfants|prematernelle|garderie/.test(n)?result('kindergarten','Vorschulbetreuung',true):result(null,'Kinderangebot, Art prüfen')
 }
 if(id==='bedarf.ju.gesundheit')return /hopital|clinique|foyer/.test(falte(name))?result('heim','Spital/Heim, Typ prüfen',true):leer()
 return leer()
}
