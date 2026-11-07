// ── Tooltip beim Überfahren der Karte, gleich in allen Rechnern ──
// Ein Tooltip für alles, was keinen eigenen hat. Er erscheint erst, wenn die Maus kurz ruht, und verschwindet, sobald sie sich bewegt: Viele
// Ebenen decken die Karte fast lückenlos, ohne die Pause liefe er sonst ständig mit. Die Quellen werden der Reihe nach gefragt, die erste mit
// Treffer gilt. Solange er steht, weichen die Tooltips darunter. Über Markern und Bedienelementen gilt deren eigener Tooltip. Ein Klick
// schliesst ihn, und er bleibt für dieses Objekt zu, bis der Zeiger es verlassen hat: Sonst läge er neben dem Fenster mit demselben Text.

import L from 'leaflet'
import { lv95 } from './projektion'
import type { P } from './modell'

const TREFFER_PX = 7
/** So lange muss die Maus ruhen, bis der Tooltip erscheint */
export const HOVER_RUHE_MS = 500
/** Kleine Bewegungen der Hand schliessen einen stehenden Tooltip nicht */
const ZITTERN_PX = 4

export interface HoverStelle { p: P; tolM: number; ort: L.LatLng; bild: L.Point; ueberObjekt: boolean }
export interface HoverTreffer { schluessel: string; html: string }
export type HoverQuelle = (s: HoverStelle) => HoverTreffer | null

/** Hängt den Tooltip an die Karte; die Rückgabe löst ihn wieder */
export function kartenHover(map: L.Map, quellen: readonly HoverQuelle[]): () => void {
  const tip = L.tooltip({ direction: 'top', offset: [0, -12], className: 'karten-tip', opacity: 1 })
  let gezeigt = '', gesperrt = '', uhr: ReturnType<typeof setTimeout> | undefined, stand: L.Point | null = null
  const weg = () => { clearTimeout(uhr); gezeigt = ''; map.closeTooltip(tip); map.getContainer().classList.remove('karten-tip-an') }
  const geklickt = () => { gesperrt = gezeigt; weg() }
  const pruefen = (e: L.LeafletMouseEvent) => {
    const ziel = e.originalEvent.target as Element | null
    if (ziel?.closest?.('.leaflet-marker-icon, .leaflet-control')) return
    const stelle: HoverStelle = { p: lv95(e.latlng.lat, e.latlng.lng), ort: e.latlng, bild: e.containerPoint, ueberObjekt: !!ziel?.closest?.('.leaflet-interactive'),
      tolM: map.distance(e.latlng, map.containerPointToLatLng(e.containerPoint.add([TREFFER_PX, 0]))) }
    for (const q of quellen) {
      const t = q(stelle)
      if (!t) continue
      if (t.schluessel === gesperrt) return
      gesperrt = ''; gezeigt = t.schluessel
      tip.setContent(t.html).setLatLng(e.latlng)
      if (!map.hasLayer(tip)) map.openTooltip(tip)
      map.getContainer().classList.add('karten-tip-an')
      return
    }
    gesperrt = ''
  }
  const bewegt = (e: L.LeafletMouseEvent) => {
    if (gezeigt && stand && e.containerPoint.distanceTo(stand) < ZITTERN_PX) return
    weg()
    stand = e.containerPoint
    uhr = setTimeout(() => pruefen(e), HOVER_RUHE_MS)
  }
  map.on('mousemove', bewegt); map.on('mouseout', weg); map.on('click', geklickt)
  return () => { map.off('mousemove', bewegt); map.off('mouseout', weg); map.off('click', geklickt); weg() }
}
