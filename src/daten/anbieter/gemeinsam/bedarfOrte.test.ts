import {readFileSync} from 'node:fs'
import {expect,it,vi,afterEach} from 'vitest'
import {BEDARF_DIENSTE,bedarfsOrt} from './bedarfOrte'
import {regionalLesen,regionalSnapshotLesen,regionalUrl,regionalStand,ladeRegional} from './regional'
import {regionalFuer} from './regionalDienste'
const fixture=(id:string)=>JSON.parse(readFileSync(new URL(`./testdaten/bedarf/${id}.json`,import.meta.url),'utf8'))
afterEach(()=>vi.unstubAllGlobals())
it.each(BEDARF_DIENSTE)('liest echte $id-Standortantwort, hält Herkunft und Datenstand beim Wiederlesen',d=>{
 const f=fixture(d.id),objekte=regionalLesen(d,f.roh)
 expect(objekte.length).toBeGreaterThan(0);expect(objekte.some(o=>o.bedarf)).toBe(true)
 const s=regionalSnapshotLesen({version:1,mitte:f.mitte,radiusM:200,teile:[{id:d.id,url:regionalUrl(d,f.mitte),abgerufen:'2026-11-02T00:00:00Z',roh:f.roh,meta:f.meta,objekte:[],datenstand:'erfunden'}]})!
 expect(s.teile[0].objekte).toEqual(objekte);expect(s.teile[0].datenstand).toBe(regionalStand(d,objekte,f.meta))
 expect(objekte.every(o=>o.punkte?.every(p=>p[0]>2400000&&p[1]>1000000))).toBe(true)
})
it('schliesst Tageselternbüros, Tagesstätten ohne Wohnen, Werkstätten und höhere Schulen aus',()=>{
 const nicht:[string,Record<string,unknown>][]=[['be.kita',{ART_CODE:'tfo'}],['be.heim',{ALTERSHEIM:0,TAGESTBETA:1}],['be.behinderung',{WHEIMEMB:0,TAGSTEMB:1}],['ge.handicap',{TYPE_ETABL:'A'}],['ge.hopital',{TYPE_ETABLISSEMENT:'HUG consultations ambulatoires'}],['ge.special',{TYPE_ETABLISSEMENT:'Etablissement pré-professionnel',FORMATION_NIVEAU:'Secondaire'}],['fr.kita',{Type_code:3}],['ju.schule',{type:'Ecole secondaire II ou tertiaire'}],['winterthur',{typ:'Schulhaus',bezeichnung:'Kantonsschule'}],['zh.volksschule',{publish_internet:'0'}]]
 for(const [id,p]of nicht)expect(bedarfsOrt(`bedarf.${id}`,p).bedarf,id).toBeUndefined()
 expect(bedarfsOrt('bedarf.be.heim',{ALTERSHEIM:1}).bedarf?.art).toBe('heim')
 expect(bedarfsOrt('bedarf.fr.kita',{Type_code:1}).bedarf?.art).toBe('kindergarten')
 expect(bedarfsOrt('bedarf.fr.kita',{Type_code:2}).bedarf?.art).toBe('schule')
})
it('unscharfe Stufen und abgeleitete POI-Typen bleiben bestätigungspflichtig',()=>{
 expect(bedarfsOrt('bedarf.ge.special',{FORMATION_NIVEAU:'Transverse'}).bedarf?.art).toBeNull()
 expect(bedarfsOrt('bedarf.zh.spital',{name:'Ambulante Anmeldung',publish_internet:'1'}).bedarf?.unsicher).toBe(true)
 expect(bedarfsOrt('bedarf.ju.kita',{batiment:'Crèche'}).bedarf?.unsicher).toBe(true)
 expect(bedarfsOrt('bedarf.ju.gesundheit',{batiment:'Pharmacie Erard'}).bedarf).toBeUndefined()
})
it('fragt nur das zuständige Gebiet und nur fgsCheck ab; Zürich hat keine kantonalen Sek-II-Schulen als Ersatz',()=>{
 for(const d of BEDARF_DIENSTE)expect(d.apps).toEqual(['fgs'])
 const zh=regionalFuer([{kanton:'ZH',bfs:261,name:'Zürich'}]).filter(d=>d.id.startsWith('bedarf.'))
 expect(zh.map(d=>d.id)).toEqual(BEDARF_DIENSTE.filter(d=>d.bfs===261).map(d=>d.id))
 expect(regionalFuer([{kanton:'BE',bfs:351,name:'Bern'}]).some(d=>d.id.startsWith('bedarf.zh.'))).toBe(false)
})
it('zeigt Objektfeld datum und Katalogaktualisierung getrennt, ohne Abrufzeit als Stand auszugeben',()=>{
 const d=BEDARF_DIENSTE.find(d=>d.id==='bedarf.zh.volksschule')!,f=fixture(d.id),os=regionalLesen(d,f.roh)
 const t=regionalStand(d,os,f.meta);expect(t).toContain('Objektfeld datum');expect(t).toContain('Katalogaktualisierung')
 expect(regionalStand(BEDARF_DIENSTE[0],[],{timeStamp:'2026-11-02T10:00:00Z'})).toContain('unbekannt')
})
it('OGC-API: folgt begrenzten räumlichen Seiten; fremde oder wiederholte Folgeseiten werden verworfen',async()=>{
 const d=BEDARF_DIENSTE.find(d=>d.format==='ogc')!,f=fixture(d.id),url=regionalUrl(d,f.mitte),next=new URL(url);next.searchParams.set('offset','1')
 const features=f.roh.features.slice(0,2)
 const antwort=(xs:unknown[],links:unknown[]=[])=>new Response(JSON.stringify({type:'FeatureCollection',features:xs,numberReturned:xs.length,links}))
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>input===d.meta?new Response('{}'):input===url?antwort([features[0]],[{rel:'next',href:next.href}]):antwort([features[1]])))
 const a=await ladeRegional(d,f.mitte);expect(a.daten.objekte).toHaveLength(2)
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>input===d.meta?new Response('{}'):antwort([features[0]],[{rel:'next',href:'https://anderer.example/items'}])))
 await expect(ladeRegional(d,f.mitte)).rejects.toThrow('Ungültige OGC-Folgeseite')
})


it('alle fünf BE-Inventare laden ausserhalb, aber nicht innerhalb der Stadt Bern', () => {
  const ids = ['bedarf.be.schule','bedarf.be.kita','bedarf.be.spital','bedarf.be.heim','bedarf.be.behinderung']
  expect(BEDARF_DIENSTE.filter(d => d.kanton === 'BE').map(d => d.id)).toEqual(ids)
  for (const id of ids) expect(BEDARF_DIENSTE.find(d => d.id === id)!.ausgenommen).toEqual([351])
  expect(regionalFuer([{ bfs:351,kanton:'BE',name:'Bern' }]).filter(d => ids.includes(d.id))).toEqual([])
  expect(regionalFuer([{ bfs:355,kanton:'BE',name:'Köniz' }]).filter(d => ids.includes(d.id)).map(d => d.id)).toEqual(ids)
})
