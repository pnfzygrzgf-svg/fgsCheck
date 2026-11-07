import { useCallback, useRef, useState } from 'react'
import { dist, type P } from './geo'
import type { QuellenZeile } from './amtlicheOrtQuellen'
import { ZAEHLSTELLEN_KARTE_M, zaehlstellenHolen, type ZaehlQuelle, type ZaehlSnapshot } from './daten/zaehlstellen'

/** Zählstellen um den Ladeort: Vorschlag für den DTV im Bedarf und Kartenebene; ausserhalb der drei Gebiete ohne Abruf */
export function useZaehlstellen(setzeQuelle: (k: string, z: QuellenZeile) => void) {
  const [daten, setDaten] = useState<ZaehlSnapshot | null>(null), nr = useRef(0)
  const zurueck = useCallback(() => { nr.current++; setDaten(null) }, [])
  const starten = useCallback((q: ZaehlQuelle, mitte: P, signal: AbortSignal) => {
    const id = ++nr.current, name = `${q.name} (DTV der nächsten Zählstelle)`
    setzeQuelle(q.id, { name })
    void zaehlstellenHolen(q, signal).then(r => {
      if (signal.aborted || nr.current !== id) return
      const stellen = r.daten.filter(s => dist(s.p, mitte) <= ZAEHLSTELLEN_KARTE_M), jahre = [...new Set(stellen.flatMap(s => (s.jahr ? [s.jahr] : [])))].sort()
      setDaten({ quelleId: q.id, stellen, abgerufen: new Date().toISOString().slice(0, 10) })
      setzeQuelle(q.id, { name, objekte: `${stellen.length} von ${r.daten.length} Stellen bis ${ZAEHLSTELLEN_KARTE_M} m (Annahme); Vorschlag erst nach Bestätigung`,
        datenstand: jahre.length ? `Zähljahr ${jahre.join(', ')}` : 'unbekannt', ms: r.ms, bytes: r.bytes, server: r.quelle })
    }, e => { if (!signal.aborted && nr.current === id) setzeQuelle(q.id, { name, fehler: `${(e as Error).message}; DTV der Zählstelle bleibt offen` }) })
  }, [setzeQuelle])
  return { daten, starten, zurueck }
}
