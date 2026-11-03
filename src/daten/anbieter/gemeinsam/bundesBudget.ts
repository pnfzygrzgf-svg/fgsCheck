/** Ein gemeinsames Budget aller Bundesabfragen eines Ladevorgangs; ohne Registrierung bleibt der bisherige Abrufweg erhalten. */
export interface BundesGrenzen { anfragen:number; parallel:number; ms:number }
export const BUNDES_GRENZEN:Readonly<BundesGrenzen>={anfragen:120,parallel:3,ms:30000}
const budgets=new WeakMap<AbortSignal,BundesBudget>()
export function beginneBundesAbrufe(signal:AbortSignal,grenzen:BundesGrenzen=BUNDES_GRENZEN):void {
 budgets.set(signal,new BundesBudget(signal,grenzen))
}
export function verbindeBundesBudget(von:AbortSignal,zu:AbortSignal):void {
 const b=budgets.get(von);if(b)budgets.set(zu,b)
}
export function mitBundesBudget<T>(signal:AbortSignal|undefined,abruf:(signal:AbortSignal|undefined)=>Promise<T>):Promise<T> {
 const b=signal&&budgets.get(signal)
 return b?b.laden(signal,abruf):abruf(signal)
}
interface Aufgabe { starten:()=>void; ablehnen:(e:Error)=>void }
class BundesBudget {
 private aktiv=0
 private anfragen=0
 private frist:number
 private fehler:Error|null=null
 private wartend:Aufgabe[]=[]
 private laufend=new Set<(e:Error)=>void>()
 constructor(signal:AbortSignal,private grenzen:BundesGrenzen){
  this.frist=Date.now()+grenzen.ms
  if(signal.aborted)this.beenden(new DOMException('abgebrochen','AbortError'))
  else signal.addEventListener('abort',()=>this.beenden(new DOMException('abgebrochen','AbortError')),{once:true})
 }
 private beenden(e:Error){
  if(this.fehler)return
  this.fehler=e
  for(const a of this.wartend.splice(0))a.ablehnen(e)
  for(const abbruch of [...this.laufend])abbruch(e)
 }
 private weiter(){
  if(!this.fehler&&this.wartend.length&&Date.now()>=this.frist){this.beenden(new Error('Bundesabfragen: Gesamtzeit von '+this.grenzen.ms/1000+' s überschritten'));return}
  while(!this.fehler&&this.aktiv<this.grenzen.parallel&&this.wartend.length)this.wartend.shift()!.starten()
 }
 laden<T>(signal:AbortSignal,abruf:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(this.fehler)return Promise.reject(this.fehler)
  if(signal.aborted)return Promise.reject(new DOMException('abgebrochen','AbortError'))
  if(Date.now()>=this.frist){this.beenden(new Error('Bundesabfragen: Gesamtzeit von '+this.grenzen.ms/1000+' s überschritten'));return Promise.reject(this.fehler)}
  if(this.anfragen>=this.grenzen.anfragen)return Promise.reject(new Error('Bundesabfragen: Gesamtbudget von '+this.grenzen.anfragen+' Abrufen erreicht; Quelle nicht vollständig geladen'))
  this.anfragen++
  return new Promise<T>((resolve,reject)=>{
   let erledigt=false,gestartet=false,timer:ReturnType<typeof setTimeout>|undefined
   const ctrl=new AbortController()
   const fertig=(e:Error|null,wert?:T)=>{
    if(erledigt)return
    erledigt=true;clearTimeout(timer);signal.removeEventListener('abort',abbrechen);this.laufend.delete(abbrechenMit)
    if(gestartet)this.aktiv--;else this.wartend=this.wartend.filter(a=>a!==aufgabe)
    if(e){ctrl.abort(e);reject(e)}else resolve(wert as T)
    this.weiter()
   }
   const abbrechenMit=(e:Error)=>fertig(e)
   const abbrechen=()=>abbrechenMit(new DOMException('abgebrochen','AbortError'))
   const aufgabe:Aufgabe={ablehnen:abbrechenMit,starten:()=>{
    gestartet=true;this.aktiv++;this.laufend.add(abbrechenMit)
    timer=setTimeout(()=>this.beenden(new Error('Bundesabfragen: Gesamtzeit von '+this.grenzen.ms/1000+' s überschritten')),Math.max(0,this.frist-Date.now()))
    Promise.resolve().then(()=>{if(ctrl.signal.aborted)throw ctrl.signal.reason;return abruf(ctrl.signal)}).then(v=>fertig(null,v),e=>fertig(e instanceof Error?e:new Error(String(e))))
   }}
   signal.addEventListener('abort',abbrechen,{once:true});this.wartend.push(aufgabe);this.weiter()
  })
 }
}
