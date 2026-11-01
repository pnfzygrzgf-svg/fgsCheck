// ── Nutzungszonenplan der Stadt Bern (Geoportal) für die Vorbelegung (Automatik Paket C, 21.10.2026) ──
//
// Service «Nutzungszonenplan», Layer 91 «NZP_Grundzonen_Flaechen» (Flächen): U_nutzungszone mit Text, U_bauklasse mit Text.
// Grundzonen im Dienst (geprüft 21.10.2026) u. a. 1000 Wohnzone, 1001 gemischte Wohnzone, 1002 Kernzone (städtisch), 1003
// Dienstleistungszone, 1004 Industrie- und Gewerbezone, 1005–1012 Zonen für öffentliche Nutzungen bzw. private Bauten im
// allgemeinen Interesse, 1013–1015 Schutzzonen, 1016/1017 Altstadt, 1018 Gewerbegebiet Matte, 1019 Landwirtschaftszone, 1021–1023
// übriges Gebiet (Wald, Gewässer, Verkehrsfläche ausserhalb des Siedlungsgebiets). Gewerbe = 1004 (Industrie und Gewerbe) und 1018
// (Gewerbegebiet Matte; Nutzerentscheid 21.10.2026).
// Grosse Flächen: Abfrage mit Koordinaten auf 0,1 m und Vereinfachung 0,5 m (Probe Mühlemattstrasse ±150 m: 27 Flächen, 37 kB
// ohne, 15 kB mit). Nur Daten, keine Regeln.

import type { P } from '../geo'
import { arcgisUrl, arcgisHolen, flaechenRinge, textFeld, zahlFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

/** Gewerbe: Industrie- und Gewerbezone (1004) und Gewerbegebiet Matte (1018, Nutzerentscheid 21.10.2026) */
export const NZ_GEWERBE: readonly number[] = [1004, 1018]
/** Zonen ausserhalb des Siedlungsgebiets (Landwirtschaft, Weiler, Wald, Gewässer, Verkehrsfläche ausserhalb) */
export const NZ_UNBEBAUT: readonly number[] = [1019, 1020, 1021, 1022, 1023]
/** Schutzzonen A, B, C (Grün- und Freiflächen, Code 1030 = zweiter Code für A): im Siedlungsgebiet, aber keine Bauzone */
export const NZ_SCHUTZ: readonly number[] = [1013, 1014, 1015, 1030]
/** Bauzone: bekannte Grundzone, die weder ausserhalb des Siedlungsgebiets liegt noch Schutzzone ist (1000–1012, 1016–1018, 1028, 1029);
 * null bei unbekanntem Code */
export const NZ_BEKANNT: readonly number[] = [...Array.from({ length: 24 }, (_, i) => 1000 + i), 1028, 1029, 1030]
export const istBauzone = (zone: number | null): boolean | null =>
  zone === null || !NZ_BEKANNT.includes(zone) ? null : !NZ_UNBEBAUT.includes(zone) && !NZ_SCHUTZ.includes(zone)

export interface NzFlaeche {
  id: string
  zone: number | null
  /** Text des Diensts (z. B. «W - Wohnzone») */
  text: string
  bauklasse: number | null
  gewerbe: boolean
  ringe: P[][]
}
export interface NutzungszonenDaten { flaechen: NzFlaeche[] }

export const NZ_DIENST = 'Nutzungszonenplan'
export const NZ_LAYER = 91

export function nutzungszonenAusGeoportal(gj: ArcgisGeoJson): NzFlaeche[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const ringe = flaechenRinge(f), pr = f.properties ?? {}
    if (!ringe.length) return []
    const zone = zahlFeld(pr.U_nutzungszone)
    return [{ id: featureId('bernnz', f, i), zone, text: textFeld(pr.U_nutzungszone_beschrieb) ?? '', bauklasse: zahlFeld(pr.U_bauklasse),
      gewerbe: zone !== null && NZ_GEWERBE.includes(zone), ringe }]
  })
}

export const nutzungszonenUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(NZ_DIENST, lat, lon, radiusM, 'Objectid,U_nutzungszone,U_nutzungszone_beschrieb,U_bauklasse',
    { layer: NZ_LAYER, nachkomma: 1, vereinfachungM: 0.5 })

/** Grundzonen im Rechteck ±radiusM um den Ort */
export async function ladeNutzungszonenBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<NutzungszonenDaten>> {
  const r = await arcgisHolen(nutzungszonenUrl(lat, lon, radiusM), signal)
  return { ...r, daten: { flaechen: nutzungszonenAusGeoportal(r.daten) } }
}
