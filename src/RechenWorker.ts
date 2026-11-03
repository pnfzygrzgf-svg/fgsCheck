export interface WorkerAntwort<T> { ok:boolean; rechnung?:T; fehler?:string }

/** Ein laufender Auftrag. Neuere Eingaben beenden ältere Rechnungen samt deren Zeitlimit. */
export class RechenWorker<T> {
  private worker:Worker|null=null
  private abbrechen:(()=>void)|null=null
  private nummer=0
  constructor(private erstellen:()=>Worker,private fristMs=30000){}
  beenden(){this.abbrechen?.();this.worker?.terminate();this.worker=null}
  async rechnen(daten:object):Promise<WorkerAntwort<T>>{
    // Ein noch rechnender Worker kann synchron blockieren. Keine weiteren Aufträge dahinter aufreihen.
    this.abbrechen?.()
    let w:Worker
    try{w=this.worker??=this.erstellen()}
    catch(e){return {ok:false,fehler:`Worker-Startfehler: ${String((e as Error).message??e)}`}}
    const id=++this.nummer
    return new Promise(res=>{
      let erledigt=false
      const fertig=(antwort:WorkerAntwort<T>,verwerfen=false)=>{
        if(erledigt)return
        erledigt=true;clearTimeout(timer)
        w.removeEventListener('message',nachricht);w.removeEventListener('error',fehler);w.removeEventListener('messageerror',lesefehler)
        if(verwerfen){w.terminate();if(this.worker===w)this.worker=null}
        if(this.abbrechen===abbruch)this.abbrechen=null
        res(antwort)
      }
      const abbruch=()=>fertig({ok:false,fehler:'abgebrochen'},true)
      const nachricht=(ev:MessageEvent)=>{if(ev.data?.id===id)fertig(ev.data)}
      const fehler=(ev:ErrorEvent)=>fertig({ok:false,fehler:`Worker-Fehler: ${ev.message||'unbekannt'}`},true)
      const lesefehler=()=>fertig({ok:false,fehler:'Antwort der Rechnung nicht lesbar'},true)
      const timer=setTimeout(()=>fertig({ok:false,fehler:`keine Antwort innert ${this.fristMs/1000} s`},true),this.fristMs)
      this.abbrechen=abbruch
      w.addEventListener('message',nachricht);w.addEventListener('error',fehler);w.addEventListener('messageerror',lesefehler)
      try{w.postMessage({...daten,id})}
      catch(e){fertig({ok:false,fehler:`Rechenauftrag nicht übermittelt: ${String((e as Error).message??e)}`},true)}
    })
  }
}
