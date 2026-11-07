// ── Objekte einer Ebene auf die Karte zeichnen ──
// Nicht anklickbar: Den Tooltip zeigt der Treffertest, die Klicks gehören den Objekten des Rechners.

import L from 'leaflet'
import { wgs } from './projektion'
import type { KartenObjekt, LegendenEintrag, P } from './modell'

const ort = (p: P): [number, number] => wgs(p[0], p[1])
const zeichen = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Ab dieser Zoomstufe tragen Objekte ihren Wert */
export const BESCHRIFT_ZOOM = 18

export function zeichneObjekte(gruppe: L.LayerGroup, objekte: readonly KartenObjekt[], legende: readonly LegendenEintrag[], beschriften = false): void {
  for (const o of objekte) {
    const eintrag = legende.find(l => l[0] === o.klasse), farbe = eintrag?.[1] ?? '#475569'
    if (o.ringe) L.polygon(o.ringe.map(r => r.map(ort)), { color: farbe, weight: 1.5, fillColor: farbe, fillOpacity: o.deckkraft ?? 0.3, interactive: false }).addTo(gruppe)
    for (const l of o.linien ?? []) L.polyline(l.map(ort), { color: farbe, weight: 4, opacity: 0.95, interactive: false, ...(o.gestrichelt ? { dashArray: '6 6' } : {}) }).addTo(gruppe)
    if (o.punkt) L.marker(ort(o.punkt), { keyboard: false, interactive: false, icon: L.divIcon({ className: 'q-punkt', iconSize: [18, 18],
      html: `<span style="background:${farbe}">${zeichen(o.symbol ?? eintrag?.[3] ?? '•')}</span>` }) }).addTo(gruppe)
    const l = o.linien?.reduce((a, b) => (b.length > a.length ? b : a)), lage = o.punkt ?? l?.[l.length >> 1]
    if (beschriften && o.wert && lage) L.marker(ort(lage), { keyboard: false, interactive: false, icon: L.divIcon({ className: 'q-wert', iconSize: [0, 0],
      html: `<span style="border-color:${farbe}">${zeichen(o.wert)}</span>` }) }).addTo(gruppe)
  }
}
