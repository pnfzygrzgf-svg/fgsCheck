import { afterEach, expect, it, vi } from 'vitest'
import { beginneBundesAbrufe, mitBundesBudget, verbindeBundesBudget } from './bundesBudget'
afterEach(()=>vi.useRealTimers())
it('teilt Anzahl und Parallelität über Quellen und untergeordnete Aufträge',async()=>{
 const c=new AbortController(),kind=new AbortController();beginneBundesAbrufe(c.signal,{anfragen:3,parallel:1,ms:1000});verbindeBundesBudget(c.signal,kind.signal)
 const fertig:(()=>void)[]=[],abruf=vi.fn(()=>new Promise<number>(r=>fertig.push(()=>r(1))))
 const a=mitBundesBudget(c.signal,abruf),b=mitBundesBudget(kind.signal,abruf),d=mitBundesBudget(c.signal,abruf)
 await Promise.resolve();expect(abruf).toHaveBeenCalledTimes(1)
 await expect(mitBundesBudget(kind.signal,abruf)).rejects.toThrow('Gesamtbudget')
 fertig.shift()!();await a;await Promise.resolve();expect(abruf).toHaveBeenCalledTimes(2)
 fertig.shift()!();await b;await Promise.resolve();fertig.shift()!();await d
})
it('beendet laufende und wartende Abrufe bei Gesamtzeit als sichtbaren Fehler',async()=>{
 vi.useFakeTimers();const c=new AbortController();beginneBundesAbrufe(c.signal,{anfragen:5,parallel:1,ms:50})
 let aktiv:AbortSignal|undefined
 const a=mitBundesBudget(c.signal,async s=>{aktiv=s;return new Promise(()=>{})}),b=mitBundesBudget(c.signal,async()=>1)
 const pruefen=Promise.all([expect(a).rejects.toThrow('Gesamtzeit'),expect(b).rejects.toThrow('Gesamtzeit')])
 await vi.advanceTimersByTimeAsync(50);await pruefen;expect(aktiv?.aborted).toBe(true)
})
it('ein neuer Ort bricht auch die Warteschlange ab; ein anderer Ladevorgang hat eigenes Budget',async()=>{
 const c=new AbortController();beginneBundesAbrufe(c.signal,{anfragen:2,parallel:1,ms:500})
 const a=mitBundesBudget(c.signal,async()=>new Promise(()=>{})),b=mitBundesBudget(c.signal,async()=>1)
 const p=Promise.all([expect(a).rejects.toHaveProperty('name','AbortError'),expect(b).rejects.toHaveProperty('name','AbortError')]);c.abort();await p
 const neu=new AbortController();beginneBundesAbrufe(neu.signal,{anfragen:1,parallel:1,ms:500})
 await expect(mitBundesBudget(neu.signal,async()=>7)).resolves.toBe(7)
})
it('eine beendete Teilquelle gibt ihren Platz frei, ohne andere Quellen abzubrechen',async()=>{
 const c=new AbortController(),kind=new AbortController();beginneBundesAbrufe(c.signal,{anfragen:3,parallel:1,ms:500});verbindeBundesBudget(c.signal,kind.signal)
 const a=mitBundesBudget(kind.signal,async()=>new Promise(()=>{})),b=mitBundesBudget(c.signal,async()=>8)
 const p=expect(a).rejects.toHaveProperty('name','AbortError');kind.abort();await p;await expect(b).resolves.toBe(8)
})
