import { abstandQuerung } from './automatik'
import { regionalDienst } from '../daten/anbieter/gemeinsam/regionalDienste'
import type { BedarfsArt } from '../daten/anbieter/gemeinsam/bedarfOrte'
import type { RegionalObjekt, RegionalSnapshot } from '../daten/anbieter/gemeinsam/regional'
import type { StreifenErgebnis } from '../rechner/typen'
import type { BedarfBlock, DatenquelleId, QuellenOption, Vorbelegung } from './fallBedarf'
const R=150
/** Positive örtliche Inventartreffer nutzen den Berner 150-m-Umkreis. Fehlende Einträge ergeben nie «keines». */
export function ortsBedarfVorbelegen(st:StreifenErgebnis[],s:RegionalSnapshot,w:Vorbelegung,hand?:BedarfBlock,bfs:number|null=null):void {
 const alt=w.beduerfnis, basis=Array.isArray(alt?.wert)&&!alt.bestaetigungNoetig?alt.wert as string[]:[]
 const handWert=hand?.felder.beduerfnis?.wert, behalten=Array.isArray(handWert)?handWert as string[]:basis
 const optionen:QuellenOption[]=[], funde:{art:BedarfsArt;text:string;datenstand:string;rang:number;abstand:number;quelle:string}[]=[]
 for(const teil of s.teile){
  if(!teil.id.startsWith('bedarf.'))continue
  const dienst=regionalDienst(teil.id)
  // Auch gespeicherte oder aus einem Nachbargebiet geladene Teile dürfen die örtliche Ausnahme nicht umgehen.
  // Ohne bekannte Gemeinde lässt sich die Ausnahme nicht verlässlich ausschliessen: keine automatische Übernahme.
  if(!dienst || dienst.ausgenommen && (bfs===null || dienst.ausgenommen.includes(bfs)))continue
  const nah=teil.objekte.filter(o=>!!o.bedarf).map(o=>({o,d:abstand(o,st)})).filter(x=>x.d<=R).sort((a,b)=>a.d-b.d||a.o.id.localeCompare(b.o.id))
  if(!nah.length)continue
  const sichere=nah.filter(x=>x.o.bedarf?.art&&!x.o.bestaetigen)
  const erste=sichere.filter((x,i)=>sichere.findIndex(y=>y.o.bedarf!.art===x.o.bedarf!.art)===i)
  const text=(o:RegionalObjekt,d:number)=>`${o.bedarf!.wort} «${o.name}», ${Math.round(d)} m; ${dienst.name}; Objekt ${o.id}; Datenstand ${o.stand?o.stand.split('-').reverse().join('.')+' (Objektfeld datum)':teil.datenstand}; abgerufen ${teil.abgerufen}`
  const id=`regional.${teil.id}` as DatenquelleId
  for(const x of erste)funde.push({art:x.o.bedarf!.art!,text:text(x.o,x.d),datenstand:teil.datenstand,rang:dienst.bfs?0:1,abstand:x.d,quelle:teil.id})
  if(erste.length)optionen.push({id,wert:[...new Set([...behalten,...erste.map(x=>x.o.bedarf!.art!)])],quelle:'amtlich',text:erste.map(x=>text(x.o,x.d)).join('; ').slice(0,7900),datenstand:teil.datenstand,zusatz:'örtliches Einrichtungsinventar'})
  const unklar=nah.filter(x=>!x.o.bedarf!.art||x.o.bestaetigen)
  for(const art of ['schule','kindergarten','heim'] as const){
   const xs=unklar.filter(x=>!x.o.bedarf!.art||x.o.bedarf!.art===art)
   if(!xs.length)continue
   const wert=[...new Set([...behalten,art])]
   if(optionen.some(q=>q.id===id&&JSON.stringify(q.wert)===JSON.stringify(wert)))continue
   optionen.push({id,wert,quelle:'vorschlag',text:`${xs.slice(0,3).map(x=>text(x.o,x.d)).join('; ')}; Einrichtungstyp und Bezug zur Querung erst bestätigen`.slice(0,7900),datenstand:teil.datenstand,zusatz:`${art==='schule'?'Volksschule/Kinderangebot':art==='kindergarten'?'Kindergarten/Kita':'Heim/Spital'} prüfen und bestätigen`})
  }
 }
 const beste=funde.sort((a,b)=>a.rang-b.rang||a.abstand-b.abstand||a.quelle.localeCompare(b.quelle)).filter((x,i,xs)=>xs.findIndex(y=>y.art===x.art)===i)
 const neu=beste.filter(x=>!basis.includes(x.art))
 if(neu.length){
  const text=[...(basis.length&&alt?[alt.text]:[]),...neu.map(x=>x.text)].join('; ').slice(0,7900)
  w.beduerfnis={wert:[...new Set([...basis,...neu.map(x=>x.art)])],quelle:'amtlich',text,datenstand:[...new Set([...(basis.length&&alt?.datenstand?[alt.datenstand]:[]),...neu.map(x=>x.datenstand)])].join('; '),quellenOptionen:alt?.quellenOptionen}
 }
 if(!optionen.length)return
 if(!w.beduerfnis)w.beduerfnis={wert:null,quelle:'vorschlag',text:'Einrichtungstyp und Querungsbezug offen; örtliche Quelle neben dem Feld wählen.',bestaetigungNoetig:true}
 optionen.sort((a,b)=>a.id.localeCompare(b.id)||JSON.stringify(a.wert).localeCompare(JSON.stringify(b.wert)))
 w.beduerfnis.quellenOptionen=[...optionen,...(w.beduerfnis.quellenOptionen??[])]
 if(neu.length){const q=optionen.find(q=>q.id===`regional.${neu[0].quelle}`&&q.quelle==='amtlich'&&JSON.stringify(q.wert)===JSON.stringify(w.beduerfnis.wert));if(q)q.vorgabe=true}
}
function abstand(o:RegionalObjekt,st:StreifenErgebnis[]):number {
 return Math.min(...(o.punkte??[]).map(p=>abstandQuerung(p,st)))
}
