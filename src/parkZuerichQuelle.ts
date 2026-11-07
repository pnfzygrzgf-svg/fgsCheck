import { useCallback, useRef, useState } from 'react'
import type { P } from './geo'
import type { QuellenZeile } from './amtlicheOrtQuellen'
import { ladeParkZuerich, ZH_PARK_NAME, ZH_PARK_SCHLUESSEL } from './daten/anbieter/gemeinsam/parkZuerich'
import type { KatasterFeld } from './daten/parkkataster'

export interface ParkZhStand { felder: KatasterFeld[] | null; fehler?: string }
/** Parkfelder der Stadt Zürich: ein Abruf je Ladevorgang. Die Felder gehen nicht in die Rechnung, die App zeigt sie als Vorschlag. */
export function useParkZuerich(setzeQuelle: (k: string, z: QuellenZeile) => void) {
  const [stand, setStand] = useState<ParkZhStand | null>(null), nr = useRef(0), auftrag = useRef<number | null>(null)
  const zurueck = useCallback(() => { nr.current++; auftrag.current = null; setStand(null) }, [])
  const starten = useCallback((mitte: P, radiusM: number, ladeNr: number, signal: AbortSignal) => {
    if (auftrag.current === ladeNr || signal.aborted) return
    auftrag.current = ladeNr
    const id = ++nr.current, name = `${ZH_PARK_NAME} (WFS, ±${radiusM} m)`
    setStand({ felder: null }); setzeQuelle(ZH_PARK_SCHLUESSEL, { name })
    void ladeParkZuerich(mitte, radiusM, signal).then(r => {
      if (signal.aborted || nr.current !== id) return
      setStand({ felder: r.daten })
      setzeQuelle(ZH_PARK_SCHLUESSEL, { name, objekte: `${r.daten.length} Felder im Ausschnitt; Vorschläge, zählen erst nach Bestätigung`,
        datenstand: r.datenstand, ms: r.ms, bytes: r.bytes, server: r.quelle })
    }, e => {
      if (signal.aborted || nr.current !== id) return
      setStand({ felder: null, fehler: (e as Error).message })
      setzeQuelle(ZH_PARK_SCHLUESSEL, { name, fehler: `${(e as Error).message}; Vorschläge fehlen, Parkfelder von Hand zeichnen` })
    })
  }, [setzeQuelle])
  /** Nach einem Fehler neu versuchen: die App startet den Abruf beim nächsten Durchlauf wieder */
  const erneut = useCallback(() => { auftrag.current = null; setStand(null) }, [])
  return { stand, starten, zurueck, erneut }
}
