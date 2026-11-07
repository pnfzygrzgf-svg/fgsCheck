// ── Hintergrund Orthofoto Stadt Bern ──
// Flug vom 19. März 2026, 10 cm, neuer als SWISSIMAGE. Nur als WMS und nur im Gemeindegebiet, darum wählbar, solange die Karte dort steht.

import L from 'leaflet'

export const ORTHOFOTO_BERN_NAME = 'Luftbild Stadt Bern 2026'
const WMS = 'https://map.bern.ch/arcgis/services/Geoportal/Orthofoto_2026/MapServer/WMSServer'
const GEBIET = L.latLngBounds([46.91, 7.27], [47.0, 7.51])

/** rueckfall: Hintergrund, wenn die Karte Bern mit gewähltem Orthofoto verlässt */
export function orthofotoBern(map: L.Map, wahl: L.Control.Layers, rueckfall: L.Layer): void {
  const lage = L.tileLayer.wms(WMS, { layers: '0', styles: '', format: 'image/jpeg', version: '1.3.0', maxZoom: 22, bounds: GEBIET, attribution: '© Geodaten Stadt Bern (Orthofoto 19.03.2026)' })
  let angeboten = false
  const pruefen = () => {
    const hier = GEBIET.contains(map.getCenter())
    if (hier === angeboten) return
    angeboten = hier
    if (hier) { wahl.addBaseLayer(lage, ORTHOFOTO_BERN_NAME); return }
    if (map.hasLayer(lage)) { map.removeLayer(lage); rueckfall.addTo(map) }
    wahl.removeLayer(lage)
  }
  pruefen(); map.on('moveend', pruefen)
}
