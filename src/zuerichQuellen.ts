import { useCallback, useRef, useState } from 'react'
import type { P } from './geo'
import type { QuellenZeile } from './amtlicheOrtQuellen'
import { ladeZuerich, ZH_QUELLE, ZH_RADIUS_M, zhStandText, type ZuerichSnapshot } from './daten/anbieter/gemeinsam/zuerich'

interface ZhFall { zuerich?: ZuerichSnapshot; quellen: { zhTempo?: string; zhZonen?: string } }
/** Frische Ausschnitte je Ladeauftrag, Ergebnisse der zwei Dienste unabhängig; keine verspäteten Antworten alter Fälle. */
export function useZuerichQuellen<F extends ZhFall>(setFall: React.Dispatch<React.SetStateAction<F | null>>, setzeQuelle: (k: string, z: QuellenZeile) => void) {
  const [daten, setDaten] = useState<ZuerichSnapshot | null>(null), nr = useRef(0), auftrag = useRef<number | null>(null)
  const zurueck = useCallback(() => { nr.current++; auftrag.current = null; setDaten(null)
    setFall(f => { if (!f) return f; const { zuerich: _alt, quellen, ...rest } = f
      const { zhTempo: _t, zhZonen: _z, ...andere } = quellen; return { ...rest, quellen: andere } as F })
  }, [setFall])
  const starten = useCallback((mitte: P, ladeNr: number, signal: AbortSignal) => {
    if (auftrag.current === ladeNr || signal.aborted) return
    auftrag.current = ladeNr
    const id = ++nr.current
    const leer: ZuerichSnapshot = { version: 1, mitte, radiusM: ZH_RADIUS_M }
    setDaten(leer)
    for (const art of ['tempo', 'zonen'] as const) {
      const k = art === 'tempo' ? 'zhTempo' : 'zhZonen', name = `${art === 'tempo' ? 'Tempo' : 'Verkehrszonen'} Stadt Zürich (heutiger Zustand, ±${ZH_RADIUS_M} m)`
      setzeQuelle(k, { name })
      void ladeZuerich(art, mitte, ZH_RADIUS_M, signal).then(r => {
        if (signal.aborted || nr.current !== id) return
        setDaten(x => ({ ...(x ?? leer), [art]: r.daten }))
        setFall(f => f ? { ...f, zuerich: { ...(f.zuerich ?? leer), [art]: r.daten }, quellen: { ...f.quellen, [k]: ZH_QUELLE } } : f)
        setzeQuelle(k, { name, objekte: `${r.daten.objekte.length} ${art === 'tempo' ? 'Tempoabschnitte' : 'Zonen'}; abgerufen ${r.daten.abgerufen}`,
          datenstand: zhStandText(r.daten), ms: r.ms, bytes: r.bytes, server: r.quelle })
      }, e => { if (!signal.aborted && nr.current === id) setzeQuelle(k, { name, fehler: `${(e as Error).message}; Zürcher Zuordnung bleibt offen` }) })
    }
  }, [setFall, setzeQuelle])
  return { daten, starten, zurueck }
}
