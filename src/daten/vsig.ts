// ── Signalisierte Höchstgeschwindigkeit der Stadt Bern (Geoportal) für die Vorbelegung (Automatik Paket C, 21.10.2026) ──
//
// Service «Signalisierte_Hoechstgeschwindigkeit», Layer 0 (Linien auf der Strassenachse, wie VeloroutenCheck bern.ts): V_sig in
// km/h (im Dienst 20, 30, 40, 50, 60, 80 und leer; geprüft 21.10.2026) und Strassenname. Ein Feld für Zone oder Strecke hat der
// Layer nicht. V_afu (Amt für Umwelt) bleibt ungenutzt. Probe Mühlemattstrasse ±150 m: 39 Linien, 15 kB. Nur Daten, keine Regeln.

import type { P } from '../geo'
import { arcgisUrl, arcgisHolen, linienTeile, textFeld, zahlFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

export interface VsigLinie { id: string; strasse: string; /** km/h, null ohne Angabe */ vSig: number | null; teile: P[][] }
export interface VsigDaten { linien: VsigLinie[] }

export const VSIG_DIENST = 'Signalisierte_Hoechstgeschwindigkeit'

/** Geoportal-Antwort -> Linien; V_sig ausserhalb 5–130 km/h gilt als ohne Angabe */
export function vsigAusGeoportal(gj: ArcgisGeoJson): VsigLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f), pr = f.properties ?? {}
    if (!teile.length) return []
    const v = zahlFeld(pr.V_sig)
    return [{ id: featureId('bernvsig', f, i), strasse: textFeld(pr.Strassenname) ?? '', vSig: v !== null && v >= 5 && v <= 130 ? v : null, teile }]
  })
}

export const vsigUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(VSIG_DIENST, lat, lon, radiusM, 'Objectid,V_sig,Strassenname', { nachkomma: 2 })

/** Signalisierte Höchstgeschwindigkeit im Rechteck ±radiusM um den Ort */
export async function ladeVsigBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<VsigDaten>> {
  const r = await arcgisHolen(vsigUrl(lat, lon, radiusM), signal)
  return { ...r, daten: { linien: vsigAusGeoportal(r.daten) } }
}
