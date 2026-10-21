// ── ÖV-Linien der Stadt Bern (Geoportal) für die Vorbelegung (Bus oder Tram am Halt, Linienbus; Automatik Paket C, 21.10.2026) ──
//
// Service «OeV_Linien», Layer 0 (Linien je Linie und Richtung): Verkehrsmittel_typ (im Dienst Bus, Trolleybus, Tram, Zug,
// Drahtseilbahn; geprüft 21.10.2026), Nummer_linie. Jede Linie kommt ganz (über die ganze Stadt): Abfrage mit Koordinaten auf 0,1 m
// und Vereinfachung 1 m (Probe Mühlemattstrasse ±150 m: 8 Linien, 150 kB ohne, 32 kB mit), danach auf das Rechteck mit Rand
// zugeschnitten. Nur Daten, keine Regeln.

import { type P, lv95 } from '../geo'
import { arcgisUrl, arcgisHolen, linienTeile, textFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'
import { zuschneiden } from './geoHilfen'

export type OevTyp = 'bus' | 'trolleybus' | 'tram' | 'zug' | 'drahtseilbahn'
const TYPEN: Record<string, OevTyp> = { bus: 'bus', trolleybus: 'trolleybus', tram: 'tram', zug: 'zug', drahtseilbahn: 'drahtseilbahn' }
/** Verkehrsmittel_typ -> Typ (gross/klein egal), null wenn unbekannt */
export const oevTyp = (x: unknown): OevTyp | null => (typeof x === 'string' ? TYPEN[x.trim().toLowerCase()] ?? null : null)
/** fährt auf der Strasse (Bus, Trolleybus, Tram) */
export const strassenOev = (t: OevTyp | null) => t === 'bus' || t === 'trolleybus' || t === 'tram'

export interface OevLinie { id: string; typ: OevTyp | null; typText: string; nummer: string; teile: P[][] }
export interface OevLinienDaten { linien: OevLinie[] }

export const OEV_DIENST = 'OeV_Linien'
/** Rand um das abgefragte Rechteck beim Zuschneiden (m) */
export const OEV_RAND_M = 50

/** Geoportal-Antwort -> Linien; mit ausschnitt nur die Stücke im Quadrat (Mitte, halbe Seite); Linien ohne Stück entfallen */
export function oevLinienAusGeoportal(gj: ArcgisGeoJson, ausschnitt?: { mitte: P; halbM: number }): OevLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const pr = f.properties ?? {}
    let teile = linienTeile(f)
    if (ausschnitt) teile = zuschneiden(teile, ausschnitt.mitte, ausschnitt.halbM)
    return teile.length ? [{ id: featureId('bernoev', f, i), typ: oevTyp(pr.Verkehrsmittel_typ), typText: textFeld(pr.Verkehrsmittel_typ) ?? '',
      nummer: textFeld(pr.Nummer_linie) ?? '', teile }] : []
  })
}

export const oevLinienUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(OEV_DIENST, lat, lon, radiusM, 'Objectid,Verkehrsmittel_typ,Nummer_linie', { nachkomma: 1, vereinfachungM: 1 })

/** ÖV-Linien im Rechteck ±radiusM um den Ort, zugeschnitten auf das Rechteck mit OEV_RAND_M Rand */
export async function ladeOevLinienBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<OevLinienDaten>> {
  const r = await arcgisHolen(oevLinienUrl(lat, lon, radiusM), signal)
  return { ...r, daten: { linien: oevLinienAusGeoportal(r.daten, { mitte: lv95(lat, lon), halbM: radiusM + OEV_RAND_M }) } }
}
