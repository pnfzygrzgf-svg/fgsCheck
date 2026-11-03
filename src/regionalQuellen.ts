import { useCallback, useRef, useState } from 'react'
import type { P } from './geo'
import type { QuellenZeile } from './amtlicheOrtQuellen'
import type { Gemeinde } from './daten/anbieter/gemeinsam/typen'
import { ladeRegional, type RegionalSnapshot } from './daten/anbieter/gemeinsam/regional'
import { regionalFuer, regionalDienst, type RegionalDienst } from './daten/anbieter/gemeinsam/regionalDienste'
/** E6-Inventare beschreiben Kartenkontext, keine offenen oder bestätigten Normantworten. */
const rechenArt = (d: RegionalDienst) => ['tempo', 'zone', 'signal', 'lsa'].includes(d.art)
const kontextArt = (d: RegionalDienst) => ['beleuchtung', 'taktil', 'netz'].includes(d.art)
function objektText(d: RegionalDienst, r: RegionalSnapshot['teile'][number]): string {
  const n = r.objekte.filter(o => o.kontext || o.bedarf || o.bund || o.verkehr || o.tempo !== null || o.zone !== null).length
  const art = d.art === 'beleuchtung' ? n === 1 ? 'Leuchtenstandort' : 'Leuchtenstandorte'
    : d.art === 'taktil' ? n === 1 ? 'Rillenstandort' : 'Rillenstandorte'
    : d.art === 'netz' ? n === 1 ? 'Netzobjekt' : 'Netzobjekte' : 'fachlich relevante Objekte'
  return `${n} ${art}${kontextArt(d) ? '; nur Kartenkontext' : ''}; ${d.hinweis}; abgerufen ${r.abgerufen}`
}
interface RegionalFall { regional?: RegionalSnapshot; quellen: { regional?: string } }
export function useRegionalQuellen<F extends RegionalFall>(setFall: React.Dispatch<React.SetStateAction<F | null>>, setzeQuelle: (k: string, z: QuellenZeile) => void, app: 'fgs'|'swc' = 'fgs') {
  const [rechnen, setRechnen] = useState<RegionalSnapshot | null>(null)
  const [daten, setDaten] = useState<RegionalSnapshot | null>(null), nr = useRef(0), erledigt = useRef(new Set<string>()), rechenErlaubt = useRef(new Set<string>())
  const zurueck = useCallback(() => { nr.current++; erledigt.current.clear(); rechenErlaubt.current.clear(); setDaten(null); setRechnen(null); setFall(f => {
    if (!f) return f; const { regional: _alt, quellen, ...rest } = f; const { regional: _q, ...qs } = quellen; return { ...rest, quellen: qs } as F
  }) }, [setFall])
  const starten = useCallback((mitte: P, gemeinden: readonly Gemeinde[], ladeNr: number, signal: AbortSignal, amOrt: readonly Gemeinde[] = gemeinden) => {
    const id = nr.current, leer: RegionalSnapshot = { version: 1, mitte, radiusM: 200, teile: [] }
    const zustaendig = new Set(regionalFuer(amOrt).map(d => d.id))
    const dienste = regionalFuer([...gemeinden, ...amOrt]).filter(d => (!d.apps || d.apps.includes(app)) && (!rechenArt(d) || zustaendig.has(d.id)))
    rechenErlaubt.current = zustaendig
    const behalten = (t: RegionalSnapshot['teile'][number]) => {
      const d = regionalDienst(t.id)
      return !d || !rechenArt(d) || zustaendig.has(t.id)
    }
    setRechnen(s => {
      const teile = s?.teile.filter(t => zustaendig.has(t.id)) ?? []
      return s && teile.length ? { ...s, teile } : null
    })
    setDaten(s => s ? { ...s, teile: s.teile.filter(behalten) } : s)
    setFall(f => f?.regional ? { ...f, regional: { ...f.regional, teile: f.regional.teile.filter(behalten) } } : f)
    for (const d of dienste) {
      const k = `regional.${d.id}`, auftrag = `${ladeNr}:${d.id}`
      if (signal.aborted || erledigt.current.has(auftrag)) continue
      erledigt.current.add(auftrag); setzeQuelle(k, { name: d.name })
      void ladeRegional(d, mitte, 200, signal).then(r => {
        if (signal.aborted || nr.current !== id) return
        if (rechenArt(d) && !rechenErlaubt.current.has(d.id)) {
          setzeQuelle(k, { name: d.name, objekte: 'Für den aktuellen Prüfpunkt nicht zuständig; Antwort nicht verwendet.' })
          return
        }
        setDaten(s => ({ ...(s ?? leer), teile: [...(s?.teile.filter(t => t.id !== d.id) ?? []), r.daten] }))
        if (['tempo','zone','signal','lsa'].includes(d.art)) setRechnen(s => ({ ...(s ?? leer), teile: [...(s?.teile.filter(t => t.id !== d.id) ?? []), r.daten] }))
        setFall(f => f ? { ...f, regional: { ...(f.regional ?? leer), teile: [...(f.regional?.teile.filter(t => t.id !== d.id) ?? []), r.daten] }, quellen: { ...f.quellen, regional: 'Amtliche Bundes- und Regionalquellen' } } : f)
        setzeQuelle(k, { name: d.name, objekte: objektText(d, r.daten), datenstand: r.daten.datenstand, ms: r.ms, bytes: r.bytes, server: r.quelle })
      }, e => { if (!signal.aborted && nr.current === id) setzeQuelle(k, { name: d.name, fehler: `${(e as Error).message}; ${kontextArt(d) ? 'Kartenkontext nicht verfügbar' : 'amtliche Zuordnung offen'}` }) })
    }
  }, [setFall, setzeQuelle, app])
  return { daten, rechnen, starten, zurueck }
}
