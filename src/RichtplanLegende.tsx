// Legende der WMS-Ebene «Richtplan Fussverkehr (Geoportal Bern)» (30.10.2026; App, Abschnitt «Legende»)
import { RP_WMS_NAME, rpLegende } from './daten/richtplanWms'

/** Legende der WMS-Ebene «Richtplan Fussverkehr (Geoportal Bern)»: Bilder des Geoportals (GetLegendGraphic), nur wenn die Ebene an ist */
export function RichtplanLegende() {
  return <li className="rp-legende">{RP_WMS_NAME} (Darstellung des Geoportals):
    <ul>{rpLegende(true).map(x => <li key={x.layer}><img src={x.url} alt={x.name} title={x.name} loading="lazy" /></li>)}</ul></li>
}
