import { useCallback, useRef, useState } from 'react'
import type { Fall } from './fall'
import type { QuellenZeile } from './amtlicheOrtQuellen'
import { NPVM_ANBIETER, NPVM_QUELLENANGABE, npvmStandText, type NpvmSnapshot } from './daten/anbieter/npvm'
import type { Stand } from './daten/anbieter/gemeinsam/typen'

export function useNpvmQuelle(setFall: React.Dispatch<React.SetStateAction<Fall | null>>, setzeQuelle: (key: string, s: QuellenZeile) => void) {
  const [stand, setStand] = useState<Stand<NpvmSnapshot>>({ offen: true }), nr = useRef(0)
  const zurueck = useCallback(() => { nr.current++; setStand({ offen: true }) }, [])
  const starten = useCallback((lat: number, lon: number, signal: AbortSignal) => {
    const id = ++nr.current, name = 'Verkehrsmenge NPVM (modelliert, ±200 m)'
    setStand({ laedt: true }); setzeQuelle('npvm', { name })
    setFall(f => { if (!f) return f; const { npvm: _alt, quellen, ...rest } = f; const { npvm: _quelle, ...andere } = quellen
      return { ...rest, quellen: andere } })
    void NPVM_ANBIETER.laden(lat, lon, 200, signal).then(r => {
      if (signal.aborted || id !== nr.current) return
      setStand({ daten: r.daten }); setzeQuelle('npvm', { name, datenstand: `${npvmStandText(r.daten)} (Ebene); Bezugsjahr ${r.daten.bezugsjahr ?? 'unbekannt'}`,
        objekte: `${r.daten.linien.length} Modellstrecken; DTV-Vorschläge erst nach Bestätigung`, ms: r.ms, bytes: r.bytes, server: r.quelle })
      setFall(f => f ? { ...f, npvm: r.daten, quellen: { ...f.quellen, npvm: NPVM_QUELLENANGABE } } : f)
    }, e => { if (!signal.aborted && id === nr.current) { setStand({ fehler: (e as Error).message });
      setzeQuelle('npvm', { name, fehler: `${(e as Error).message}; modellierter DTV bleibt offen` }) } })
  }, [setFall, setzeQuelle])
  return { stand, starten, zurueck }
}
