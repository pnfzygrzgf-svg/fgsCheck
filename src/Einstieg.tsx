// ── Einstieg: Startseite oder Prüfung (App), umschaltbar über den Anker #pruefen (Zurück-Taste des Browsers geht) ──
//
// Die Prüfung (App mit Leaflet, Rechner-Worker) wird erst beim Wechsel zur Prüfung geladen (React.lazy, eigener Teil des Builds).

import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Startseite from './Startseite'

const App = lazy(() => import('./App'))
const istPruefen = () => location.hash === '#pruefen'
// GoatCounter: das Skript lädt async; ist es beim Wechsel zur Prüfung noch nicht da, wiederholt prüfen (höchstens ZAEHLEN_MS)
const ZAEHLEN_TAKT_MS = 500
const ZAEHLEN_MS = 10000
type GoatCounter = { count?: (o: { path: string; title?: string }) => void }

export default function Einstieg() {
  const [pruefen, setPruefen] = useState(istPruefen)
  const vonStart = useRef(false)          // Prüfung über die Startseite geöffnet: Logo geht im Verlauf zurück
  const gezaehlt = useRef(false)          // Aufruf der Prüfung schon gezählt (je Wechsel zur Prüfung einmal)
  useEffect(() => {
    const h = () => setPruefen(istPruefen())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  // Startseite: Seite wächst mit dem Inhalt (sonst Höhe 100 % für Karte und Panel); Klasse statt CSS :has()
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('startseite', !pruefen)
  }, [pruefen])
  useEffect(() => {
    // GoatCounter: Aufruf der Prüfung als eigenen Pfad zählen (zusätzlich zum Seitenaufruf); ohne Skript nichts
    if (!pruefen) { gezaehlt.current = false; return }
    const zaehlen = () => {
      if (gezaehlt.current) return true
      const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter
      if (!gc?.count) return false
      gezaehlt.current = true
      gc.count({ path: 'pruefen', title: 'Sichtprüfung' })
      return true
    }
    if (zaehlen()) return
    let n = 0
    const iv = window.setInterval(() => { if (zaehlen() || ++n >= ZAEHLEN_MS / ZAEHLEN_TAKT_MS) clearInterval(iv) }, ZAEHLEN_TAKT_MS)
    return () => clearInterval(iv)
  }, [pruefen])
  if (!pruefen) return <Startseite onStart={() => { vonStart.current = true; location.hash = 'pruefen' }} />
  return (
    <Suspense fallback={<p className="app-laedt">Sichtprüfung wird geladen …</p>}>
      <App onStartseite={() => {
        // über die Startseite gekommen: einen Schritt zurück (Verlauf nicht aufblähen), sonst neuer Eintrag ohne Anker
        if (vonStart.current) { vonStart.current = false; history.back(); return }
        history.pushState(null, '', location.pathname + location.search); setPruefen(false)
      }} />
    </Suspense>
  )
}
