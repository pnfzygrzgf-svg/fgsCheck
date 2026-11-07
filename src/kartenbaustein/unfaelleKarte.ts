import { useCallback, useEffect, useRef, useState } from 'react'
import type L from 'leaflet'
import { ausschnittBox } from './bund'
import { UNFALL_ZOOM, ladeAstraStand, ladeUnfaelle, unfaelleAm, type UnfallArt, type UnfallPunkt } from './unfaelle'

const TREFFER_PX = 9

/** Lädt nach jeder Kartenbewegung die Unfälle der eingeschalteten Ebenen im Ausschnitt.
 *  Liefert den Stand für die Ebenenliste und die Unfälle am Zeiger; bei() ändert sich nie und taugt für Ereignisse der Karte. */
export function useUnfaelle(map: L.Map | null, ebenen: readonly { layer: string; art: UnfallArt }[], zuLv95: (lat: number, lon: number) => readonly [number, number]) {
  const punkte = useRef<UnfallPunkt[]>([])
  const [stand, setStand] = useState('')
  const [datenstand, setDatenstand] = useState('')
  const schluessel = ebenen.map(e => e.layer).join()
  useEffect(() => {
    if (!map || !ebenen.length) return
    let ctrl: AbortController | null = null
    const laden = () => {
      ctrl?.abort(); punkte.current = []
      if (map.getZoom() < UNFALL_ZOOM) { setStand(''); return }
      const b = map.getBounds(), c = new AbortController()
      const box = ausschnittBox([b.getSouthWest(), b.getSouthEast(), b.getNorthEast(), b.getNorthWest()].map(x => zuLv95(x.lat, x.lng)))
      ctrl = c
      setStand('Unfälle im Ausschnitt werden geladen …')
      void Promise.all(ebenen.map(e => ladeUnfaelle(e, box, c.signal))).then(l => {
        if (c.signal.aborted) return
        // Sind zwei Ebenen an, stünde derselbe Unfall sonst doppelt in der Liste
        punkte.current = [...new Map(l.flat().map(u => [u.id, u])).values()]
        setStand(`${punkte.current.length.toLocaleString('de-CH')} Unfälle im Ausschnitt vollständig geladen.`)
      }, () => { if (!c.signal.aborted) setStand('Angaben zu den Unfällen im Ausschnitt nicht geladen; das Kartenbild zeigt sie weiterhin.') })
    }
    laden(); map.on('moveend', laden)
    return () => { ctrl?.abort(); map.off('moveend', laden); punkte.current = []; setStand('') }
    // ebenen ist je Darstellung neu, schluessel steht für ihren Inhalt
  }, [map, schluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  const ersteEbene = ebenen[0]?.layer
  useEffect(() => {
    if (!ersteEbene || datenstand) return
    const c = new AbortController()
    ladeAstraStand(ersteEbene, c.signal).then(setDatenstand, () => { /* bleibt unbekannt */ })
    return () => c.abort()
  }, [ersteEbene, datenstand])
  const bei = useCallback((karte: L.Map, pt: L.Point) => {
    const a = karte.containerPointToLatLng(pt), b = karte.containerPointToLatLng(pt.add([TREFFER_PX, 0]))
    return unfaelleAm(punkte.current, zuLv95(a.lat, a.lng), karte.distance(a, b))
  }, [zuLv95])
  return { stand, datenstand, bei }
}
