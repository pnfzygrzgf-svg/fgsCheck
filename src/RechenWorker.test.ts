import { afterEach, describe, expect, it, vi } from 'vitest'
import { RechenWorker } from './RechenWorker'

class ProbeWorker extends EventTarget {
  auftraege:{id:number}[]=[]
  terminate=vi.fn()
  postMessage(d:{id:number}){this.auftraege.push(d)}
  antwort(rechnung:string){this.dispatchEvent(new MessageEvent('message',{data:{id:this.auftraege.at(-1)!.id,ok:true,rechnung}}))}
}
afterEach(()=>vi.useRealTimers())
describe('Rechenaufträge beim Nachladen von Quellen',()=>{
  it('beendet die alte Rechnung und ihren Timer; sie kann den neueren Worker nicht nach 30 s töten',async()=>{
    vi.useFakeTimers();const ws:ProbeWorker[]=[]
    const r=new RechenWorker<string>(()=>{const w=new ProbeWorker();ws.push(w);return w as unknown as Worker})
    const alt=r.rechnen({quelle:'OSM'});await vi.advanceTimersByTimeAsync(29000)
    const neu=r.rechnen({quelle:'Tempo und Parkfelder'})
    expect(await alt).toEqual({ok:false,fehler:'abgebrochen'});expect(ws[0].terminate).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1001)
    expect(ws[1].terminate).not.toHaveBeenCalled()
    ws[0].antwort('alt');ws[1].antwort('aktuell')
    expect(await neu).toEqual(expect.objectContaining({ok:true,rechnung:'aktuell'}))
    await vi.advanceTimersByTimeAsync(30000);expect(ws[1].terminate).not.toHaveBeenCalled()
    r.beenden()
  })
  it('verwirft einen wirklich blockierten Worker und kann danach neu rechnen',async()=>{
    vi.useFakeTimers();const ws:ProbeWorker[]=[]
    const r=new RechenWorker<string>(()=>{const w=new ProbeWorker();ws.push(w);return w as unknown as Worker})
    const a=r.rechnen({});await vi.advanceTimersByTimeAsync(30000)
    expect(await a).toEqual({ok:false,fehler:'keine Antwort innert 30 s'});expect(ws[0].terminate).toHaveBeenCalledOnce()
    const b=r.rechnen({});ws[1].antwort('fertig');expect((await b).rechnung).toBe('fertig');r.beenden()
  })
  it('räumt beim Ortswechsel auf und verarbeitet auch Übermittlungsfehler ohne Hängenbleiben',async()=>{
    vi.useFakeTimers();const w=new ProbeWorker(),r=new RechenWorker<string>(()=>w as unknown as Worker)
    const a=r.rechnen({});r.beenden();expect((await a).fehler).toBe('abgebrochen');expect(vi.getTimerCount()).toBe(0)
    w.postMessage=()=>{throw new Error('DataCloneError')}
    expect((await r.rechnen({})).fehler).toContain('DataCloneError');expect(vi.getTimerCount()).toBe(0)
  })
  it('meldet Start- und Antwortfehler sofort und verwendet einen erfolgreichen Worker erneut',async()=>{
    vi.useFakeTimers();const w=new ProbeWorker(),erstelle=vi.fn(()=>w as unknown as Worker),r=new RechenWorker<string>(erstelle)
    const a=r.rechnen({});w.antwort('eins');expect((await a).ok).toBe(true)
    const b=r.rechnen({});w.antwort('zwei');expect((await b).rechnung).toBe('zwei');expect(erstelle).toHaveBeenCalledOnce()
    const c=r.rechnen({});w.dispatchEvent(new Event('messageerror'));expect((await c).fehler).toContain('nicht lesbar')
    expect(vi.getTimerCount()).toBe(0)
    const kaputt=new RechenWorker<string>(()=>{throw Error('Start gesperrt')})
    expect((await kaputt.rechnen({})).fehler).toContain('Start gesperrt')
  })
})
