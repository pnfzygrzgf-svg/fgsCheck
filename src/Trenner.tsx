// Trenner zwischen Karte und rechtem Bereich: ziehen (Zeiger) bzw. Pfeiltasten ändern die Breite des Bereichs (panelbreite.ts); nach dem
// Ziehen bzw. der Taste wird die Breite gespeichert und onFertig aufgerufen (Leaflet: invalidateSize). Unter 700 px und im Druck
// ausgeblendet (index.css).
import { useEffect, useRef, useState } from 'react'
import { PANEL_MIN, breiteAusZeiger, breiteNachTaste, klemmen, panelMax, speichereBreite } from './panelbreite'

export default function Trenner({ breite, setze, onFertig }: { breite: number; setze: (b: number) => void; onFertig: () => void }) {
  const zieht = useRef(false)
  const letzte = useRef(breite)
  letzte.current = breite
  const fertig = (b: number) => { speichereBreite(b); onFertig() }
  // Fenstergrösse ändert sich: Breite neu klemmen (nicht speichern, damit ein grösseres Fenster die gewählte Breite zurückgibt)
  const [fenster, setFenster] = useState(() => window.innerWidth)
  useEffect(() => {
    const neu = () => {
      setFenster(window.innerWidth)
      const b = klemmen(letzte.current, window.innerWidth)
      if (b !== letzte.current) { setze(b); onFertig() }
    }
    window.addEventListener('resize', neu)
    return () => window.removeEventListener('resize', neu)
  }, [setze, onFertig])
  return <div className="trenner nicht-drucken" role="separator" aria-orientation="vertical" aria-label="Breite des Bereichs" tabIndex={0}
    aria-valuenow={breite} aria-valuemin={PANEL_MIN} aria-valuemax={panelMax(fenster)}
    title="Ziehen bzw. Pfeiltasten: Breite des Bereichs"
    onPointerDown={e => { if (e.button !== 0) return; zieht.current = true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault() }}
    onPointerMove={e => { if (zieht.current) { const b = breiteAusZeiger(e.clientX, fenster); letzte.current = b; setze(b) } }}
    onPointerUp={e => { if (!zieht.current) return; zieht.current = false; e.currentTarget.releasePointerCapture(e.pointerId); fertig(letzte.current) }}
    onPointerCancel={() => { if (zieht.current) { zieht.current = false; fertig(letzte.current) } }}
    onKeyDown={e => {
      const b = breiteNachTaste(breite, e.key, fenster)
      if (b === null) return
      e.preventDefault(); setze(b); fertig(b)
    }} />
}
