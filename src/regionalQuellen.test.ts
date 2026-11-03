import type { Dispatch, SetStateAction } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useRegionalQuellen } from './regionalQuellen'
import { ladeRegional, type RegionalSnapshot } from './daten/anbieter/gemeinsam/regional'
import type { QuellenZeile } from './amtlicheOrtQuellen'

// Die Hook-Callbacks laufen wirklich; nur Reacts Zustandsspeicher und der Abruf sind ersetzt.
const speicher = vi.hoisted(() => [] as { wert: unknown }[])
vi.mock('react', () => ({
  useState: (anfang: unknown) => {
    const z = { wert: anfang }; speicher.push(z)
    return [anfang, (neu: unknown) => { z.wert = typeof neu === 'function' ? neu(z.wert) : neu }]
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
}))
vi.mock('./daten/anbieter/gemeinsam/regional', async original => ({
  ...await original<typeof import('./daten/anbieter/gemeinsam/regional')>(), ladeRegional: vi.fn(),
}))
beforeEach(() => { speicher.length = 0; vi.mocked(ladeRegional).mockReset() })

async function laden(app: 'fgs' | 'swc', erfolg: string | null) {
  const quellen = new Map<string, QuellenZeile>()
  type Fall = { regional?: RegionalSnapshot; quellen: { regional?: string }; eigeneAngabe: number }
  let fall: Fall | null = { quellen: {}, eigeneAngabe: 42 }
  const setFall: Dispatch<SetStateAction<Fall | null>> = neu => { fall = typeof neu === 'function' ? neu(fall) : neu }
  vi.mocked(ladeRegional).mockImplementation(async d => {
    if (d.id !== erfolg) throw new Error('Testausfall')
    return { daten: { id: d.id, url: d.url, abgerufen: '2026-11-03T12:00:00Z', datenstand: '03.11.2026', roh: {}, objekte: [
      { id: 'a', name: 'Originalobjekt', hinweis: d.hinweis, tempo: d.art === 'tempo' ? 30 : null, zone: null, bestaetigen: false, stand: null, ...(d.id.startsWith('e6.') ? { kontext: d.art } : {}) },
    ] }, ms: 1, bytes: 100, quelle: new URL(d.url).host }
  })
  const hook = useRegionalQuellen(setFall, (k, z) => quellen.set(k, z), app)
  hook.starten([2683000,1252000], [{ bfs: erfolg === 'ktzh.tempo' ? 52 : 261, kanton: 'ZH', name: 'Testgemeinde' }], 1, new AbortController().signal)
  await Promise.resolve(); await Promise.resolve()
  return { quellen, fall: fall as Fall | null, rechnen: speicher[0].wert, daten: speicher[1].wert }
}
it.each(['fgs', 'swc'] as const)('%s: Beleuchtung bleibt Kartenkontext mit passendem Erfolgs- und Fehlertext', async app => {
  const r = await laden(app, 'e6.zh.licht')
  const text = r.quellen.get('regional.e6.zh.licht')!.objekte!
  expect(text).toContain('1 Leuchtenstandort'); expect(text).toContain('nur Kartenkontext')
  expect(text).not.toContain('fachlich relevante')
  expect(r.quellen.get('regional.e6.zh.netz')!.fehler).toContain('Kartenkontext nicht verfügbar')
  expect(r.quellen.get('regional.e6.zh.netz')!.fehler).not.toContain('Zuordnung offen')
  expect(r.rechnen).toBeNull()
  expect((r.daten as RegionalSnapshot).teile.map(t => t.id)).toEqual(['e6.zh.licht'])
  expect(r.fall?.eigeneAngabe).toBe(42)
})
it.each(['fgs', 'swc'] as const)('%s: Netzlinien und taktile Standorte haben eigene Objekttexte', async app => {
  const n = await laden(app, 'e6.zh.netz')
  expect(n.quellen.get('regional.e6.zh.netz')!.objekte).toContain('1 Netzobjekt; nur Kartenkontext')
  const t = await laden(app, 'e6.zh.taktil')
  expect(t.quellen.get('regional.e6.zh.taktil')!.objekte).toContain('1 Rillenstandort; nur Kartenkontext')
})
it.each(['fgs', 'swc'] as const)('%s: rechenwirksame Quellen behalten ihre Zuordnung und ihre Fehlerhinweise', async app => {
  const r = await laden(app, 'ktzh.tempo')
  expect((r.rechnen as RegionalSnapshot).teile.map(t => t.id)).toEqual(['ktzh.tempo'])
  expect(r.quellen.get('regional.ktzh.tempo')!.objekte).toContain('fachlich relevante Objekte')
  expect(r.quellen.get('regional.ktzh.zone')!.fehler).toContain('amtliche Zuordnung offen')
})

it('D2: E6 nach Ausschnitt, Tempo/Zonen/Signale/LSA nur nach tatsächlicher Gemeinde', async () => {
 vi.mocked(ladeRegional).mockRejectedValue(new Error('Testausfall'))
 const hook=useRegionalQuellen(() => {}, () => {})
 hook.starten([2683000,1252000],[{bfs:261,kanton:'ZH',name:'Zürich'},{bfs:52,kanton:'ZH',name:'Bassersdorf'},{bfs:351,kanton:'BE',name:'Bern'}],1,new AbortController().signal,[{bfs:351,kanton:'BE',name:'Bern'}])
 await Promise.resolve(); await Promise.resolve()
 const ids=vi.mocked(ladeRegional).mock.calls.map(([d])=>d.id)
 expect(ids).toContain('e6.zh.licht')
 expect(ids).not.toContain('ktzh.tempo')
 expect(ids).not.toContain('zh.lsa')
})
it('D2: verspätete Tempoantwort einer inzwischen unzuständigen Gemeinde gelangt nicht in die Rechnung', async () => {
 let liefern!: (x: Awaited<ReturnType<typeof ladeRegional>>) => void
 vi.mocked(ladeRegional).mockImplementation(d => d.id === 'ktzh.tempo' ? new Promise(resolve => { liefern = resolve }) : Promise.reject(new Error('Testausfall')))
 const hook=useRegionalQuellen(() => {}, () => {})
 const zh={bfs:52,kanton:'ZH',name:'Bassersdorf'},be={bfs:355,kanton:'BE',name:'Köniz'},signal=new AbortController().signal
 hook.starten([2683000,1252000],[zh,be],1,signal,[zh])
 hook.starten([2683000,1252000],[zh,be],1,signal,[be])
 liefern({daten:{id:'ktzh.tempo',url:'https://example.test/',abgerufen:'2026-11-03T12:00:00Z',datenstand:'2026',objekte:[],roh:{}},ms:1,bytes:1,quelle:'example.test'})
 await Promise.resolve();await Promise.resolve()
 expect((speicher[0].wert as RegionalSnapshot|null)?.teile ?? []).toEqual([])
})
it('D2: nach Wegfall aller örtlichen Rechendienste bleibt kein leeres Paket vor dem Berner Rückfall stehen', async () => {
 vi.mocked(ladeRegional).mockImplementation(async d => {
  if(d.id!=='ktzh.tempo')throw new Error('Testausfall')
  return{daten:{id:d.id,url:d.url,abgerufen:'2026-11-03T12:00:00Z',datenstand:'2026',objekte:[],roh:{}},ms:1,bytes:1,quelle:'example.test'}
 })
 const hook=useRegionalQuellen(() => {}, () => {})
 const zh={bfs:52,kanton:'ZH',name:'Bassersdorf'},be={bfs:351,kanton:'BE',name:'Bern'},signal=new AbortController().signal
 hook.starten([2683000,1252000],[zh,be],1,signal,[zh])
 await Promise.resolve();await Promise.resolve()
 expect((speicher[0].wert as RegionalSnapshot).teile.map(t=>t.id)).toEqual(['ktzh.tempo'])
 hook.starten([2683000,1252000],[zh,be],1,signal,[be])
 expect(speicher[0].wert).toBeNull()
})
