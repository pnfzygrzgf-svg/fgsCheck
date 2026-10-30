// ── Richtplan Fussverkehr der Stadt Bern als Kartenebene (WMS des Geoportals, 30.10.2026) ──
//
// WMS 1.3.0 map.bern.ch «Richtplan_Fussverkehr» in der Darstellung des Geoportals, unabhängig von einem geladenen Fall. Die WMS-Namen
// der Layer (1 Hinweis, 2 Symbollinie, 3 Hinweis_Wanderwege, 4 Basisnetz_Fussweg_bestehend, 5 Massnahme_2Prio, 6 Massnahme_1Prio_Flaeche,
// 7 Massnahme_1Prio_Linie) sind nicht die Layer-Nummern des REST-Diensts in richtplanFussverkehr.ts. Wanderwege (3) bleiben weg.
// Die Ebene steht nur in der Ebenenwahl, solange die Karte die Stadt Bern zeigt, und ist anfangs aus: erst eingeschaltet geht der
// sichtbare Ausschnitt an map.bern.ch (Kacheln wie die übrigen Hintergründe).

export const RP_WMS_URL = 'https://map.bern.ch/arcgis/services/Geoportal/Richtplan_Fussverkehr/MapServer/WMSServer'
export const RP_WMS_NAME = 'Richtplan Fussverkehr (Geoportal Bern)'
export const RP_WMS_QUELLE = '© Geodaten Stadt Bern, Richtplan Fussverkehr'
/** WMS-Layer in Zeichenreihenfolge (unten zuerst): Basisnetz, Hinweise, Symbollinie, Massnahmen */
export const RP_WMS_LAYER = ['4', '1', '2', '5', '6', '7'] as const
export const RP_WMS_DECKKRAFT = 0.8
/** Ausdehnung der Stadt Bern (WGS84, gerundet wie das Orthofoto in VeloroutenCheck: LV95 2588000–2605000 / 1196000–1205000) */
export const BERN_GRENZEN = { s: 46.91, w: 7.27, n: 47.0, e: 7.51 } as const

/** Parameter für L.tileLayer.wms */
export const rpWmsOptionen = () => ({
  layers: RP_WMS_LAYER.join(','), styles: '', format: 'image/png', transparent: true, version: '1.3.0', opacity: RP_WMS_DECKKRAFT,
  attribution: RP_WMS_QUELLE,
})

/** Kartenausschnitt (WGS84) berührt die Stadt Bern: Ebene in der Ebenenwahl anbieten */
export const rpWmsVerfuegbar = (b: { s: number; w: number; n: number; e: number }): boolean =>
  b.s <= BERN_GRENZEN.n && b.n >= BERN_GRENZEN.s && b.w <= BERN_GRENZEN.e && b.e >= BERN_GRENZEN.w

/** Namen der WMS-Layer für die Legende */
const NAME: Readonly<Record<(typeof RP_WMS_LAYER)[number], string>> = {
  4: 'Basisnetz Fussweg (bestehend)', 1: 'Hinweise (u. a. publikumsattraktive Bereiche)', 2: 'Symbollinie',
  5: 'Massnahme 2. Priorität', 6: 'Massnahme 1. Priorität (Fläche)', 7: 'Massnahme 1. Priorität (Linie)',
}
/** Legendenbild eines Layers (GetLegendGraphic des WMS) */
export const rpLegendeUrl = (layer: string): string =>
  `${RP_WMS_URL}?request=GetLegendGraphic&version=1.3.0&format=image/png&layer=${encodeURIComponent(layer)}`
/** Legendeneinträge der Ebene; leer, solange sie aus ist (dann lädt die Legende keine Bilder von map.bern.ch) */
export const rpLegende = (an: boolean): { layer: string; name: string; url: string }[] =>
  an ? RP_WMS_LAYER.map(l => ({ layer: l, name: NAME[l], url: rpLegendeUrl(l) })) : []
