// ── Richtplan Fussverkehr der Stadt Bern (Geoportal) für die Vorbelegung des Bedarfsmoduls (Automatik Paket C, 21.10.2026) ──
//
// Service «Richtplan_Fussverkehr»: Layer 4 «Basisnetz_Fussweg_bestehend» (Linien, einziges Sachfeld Layer = «RP-Inhalt-Basisnetz
// Fussweg_bestehend») und Layer 7 «Hinweis» (Flächen, Layer = «RP-Hinweis-publikumsattraktive Bereiche», Refname meist leer).
// Geprüft 21.10.2026 an der Mühlemattstrasse (±150 m: 15 Linien, 1 Fläche, zusammen rund 11 kB). Die übrigen Layer (Massnahmen
// 1./2. Priorität, Wanderwege) bleiben ungenutzt. Vorbild VeloroutenCheck (fussnetz.ts). Nur Daten, keine Regeln.

import type { P } from '../geo'
import { arcgisUrl, arcgisHolen, arcgisPaar, linienTeile, flaechenRinge, textFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

export interface RpLinie { id: string; layer: string; teile: P[][] }
export interface RpFlaeche { id: string; layer: string; name: string | null; ringe: P[][] }
/** Basisnetz (Linien) und publikumsattraktive Bereiche (Flächen); null: dieser Layer war nicht erreichbar */
export interface RichtplanDaten { basisnetz: RpLinie[] | null; publikum: RpFlaeche[] | null }

export const RP_DIENST = 'Richtplan_Fussverkehr'
export const RP_LAYER_BASISNETZ = 4
export const RP_LAYER_HINWEIS = 7

/** Layer 4 -> Basisnetz-Linien; Features ohne Linie entfallen */
export function basisnetzAusGeoportal(gj: ArcgisGeoJson): RpLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f)
    return teile.length ? [{ id: featureId('bernrp', f, i), layer: textFeld(f.properties?.Layer) ?? '', teile }] : []
  })
}
/** Layer 7 -> Flächen; nur publikumsattraktive Bereiche (andere Hinweise entfallen), Features ohne Fläche entfallen */
export function publikumAusGeoportal(gj: ArcgisGeoJson): RpFlaeche[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const ringe = flaechenRinge(f), layer = textFeld(f.properties?.Layer) ?? ''
    if (!ringe.length || (layer && !/publikum/i.test(layer))) return []
    return [{ id: featureId('bernrph', f, i), layer, name: textFeld(f.properties?.Refname), ringe }]
  })
}

export const basisnetzUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(RP_DIENST, lat, lon, radiusM, 'Objectid,Layer', { layer: RP_LAYER_BASISNETZ, nachkomma: 2 })
export const publikumUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(RP_DIENST, lat, lon, radiusM, 'Objectid,Layer,Refname', { layer: RP_LAYER_HINWEIS, nachkomma: 2 })

/** Richtplan Fussverkehr im Rechteck ±radiusM um den Ort: Basisnetz und publikumsattraktive Bereiche (zwei Abfragen) */
export async function ladeRichtplanBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal):
  Promise<Abruf<RichtplanDaten> & { hinweis: string | null }> {
  const r = await arcgisPaar(arcgisHolen(basisnetzUrl(lat, lon, radiusM), signal), arcgisHolen(publikumUrl(lat, lon, radiusM), signal),
    ['Basisnetz', 'publikumsattraktive Bereiche'])
  return { ...r, daten: { basisnetz: r.daten.a && basisnetzAusGeoportal(r.daten.a), publikum: r.daten.b && publikumAusGeoportal(r.daten.b) },
    hinweis: r.daten.hinweis }
}
