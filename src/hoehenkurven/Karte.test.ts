import { afterEach, expect, it, vi } from 'vitest'
import type { Ergebnis } from './modell'
const h=vi.hoisted(()=>({effekt:null as null|(()=>void|(()=>void)),laden:vi.fn(),gruppen:[] as {remove:ReturnType<typeof vi.fn>}[]}))
vi.mock('react',()=>({useEffect:(f:()=>void)=>{h.effekt=f},useRef:(x:unknown)=>({current:x}),useState:(x:unknown)=>[typeof x==='boolean'?true:x,vi.fn()]}))
vi.mock('leaflet',()=>({default:{canvas:()=>({remove:vi.fn()}),layerGroup:()=>{
 const g={on:vi.fn(),remove:vi.fn(),addTo:()=>g};h.gruppen.push(g);return g
}}}))
vi.mock('./holen',()=>({HoehenLader:class {laden=h.laden;aktualisieren(){}}}))
import { useHoehenkurven } from './Karte'
const ergebnis:Ergebnis={kurven:[],kacheln:[],box:[2600000,1200000,2600010,1200010],abgerufen:'2026-11-03T12:00:00Z',ms:1,bytes:1}
const warten=async()=>{await vi.waitFor(()=>expect(h.gruppen.length).toBeGreaterThan(0))}
afterEach(()=>{vi.useRealTimers();h.gruppen.length=0;h.laden.mockReset()})
it('behält Höhenkurven während Verschieben, Nachladen und Fehlern; ersetzt erst bei Erfolg',async()=>{
 const events=new Map<string,()=>void>()
 const map={getPane:()=>({}),getSize:()=>({x:800,y:600}),getZoom:()=>18,getBounds:()=>({getSouth:()=>46.94,getNorth:()=>46.941,getWest:()=>7.44,getEast:()=>7.441}),
  on:(k:string,f:()=>void)=>events.set(k,f),off:(k:string)=>events.delete(k),attributionControl:{addAttribution:vi.fn(),removeAttribution:vi.fn()}}
 h.laden.mockResolvedValueOnce(ergebnis)
 useHoehenkurven(map as never,1);const ende=h.effekt!() as ()=>void;await warten()
 const alt=h.gruppen[0];events.get('movestart')!();expect(alt.remove).not.toHaveBeenCalled()
 let fertig!:(e:Ergebnis)=>void
 h.laden.mockImplementationOnce(()=>new Promise<Ergebnis>(r=>{fertig=r}))
 events.get('moveend')!();await vi.waitFor(()=>expect(h.laden).toHaveBeenCalledTimes(2));expect(alt.remove).not.toHaveBeenCalled()
 fertig(ergebnis);await vi.waitFor(()=>expect(alt.remove).toHaveBeenCalledOnce());expect(h.gruppen).toHaveLength(2)
 const neu=h.gruppen[1];h.laden.mockRejectedValueOnce(new Error('Netzfehler'))
 events.get('movestart')!();events.get('moveend')!();await vi.waitFor(()=>expect(h.laden).toHaveBeenCalledTimes(3))
 await Promise.resolve();expect(neu.remove).not.toHaveBeenCalled()
 ende();expect(neu.remove).toHaveBeenCalledOnce();expect(events.size).toBe(0)
})
