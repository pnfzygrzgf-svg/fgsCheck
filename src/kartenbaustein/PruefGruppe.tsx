// Ebenen der Prüfung im Fenster «Kartenebenen»: die Objekte des Rechners selbst, im Gegensatz zu den geladenen Quellen. Das Hintergrundmenü zeigt nur Hintergründe.

import { useEffect, useState } from 'react'
import type L from 'leaflet'

/** setzen: nur nötig, wenn der Rechner beim Schalten mehr tun muss als die Ebene ein- oder auszublenden */
export interface KartenGruppe { name: string; ebene: L.Layer; setzen?: (an: boolean) => void }

export function PruefGruppe({ map, gruppen, titel = 'Prüfung' }: { map: L.Map | null; gruppen: readonly KartenGruppe[]; titel?: string }) {
  const [, neuZeichnen] = useState(0)
  useEffect(() => {
    if (!map) return
    const geaendert = () => neuZeichnen(n => n + 1)
    map.on('layeradd layerremove', geaendert)
    return () => { map.off('layeradd layerremove', geaendert) }
  }, [map])
  if (!map || !gruppen.length) return null
  return <div className="q-pruefung" role="group" aria-label={titel}>
    <p className="q-pruefung-titel">{titel}</p>
    {gruppen.map(g => <label key={g.name} className="q-ebene"><input type="checkbox" checked={map.hasLayer(g.ebene)} onChange={e => {
      const an = e.target.checked
      if (g.setzen) g.setzen(an)
      else if (an) g.ebene.addTo(map)
      else map.removeLayer(g.ebene)
    }} /><span><b>{g.name}</b></span></label>)}
  </div>
}
