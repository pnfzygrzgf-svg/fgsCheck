// ── Strassenhierarchie und Strassentypen der Stadt Bern (Geoportal) für die Vorbelegung (Automatik Paket C, 21.10.2026) ──
//
// Service «Strassenhierarchie», Layer 0 (Linien auf der Strassenachse): Typ_id mit Text im Feld Strassenhierarchie, Strassenname.
// Werte (geprüft 21.10.2026, alle im Dienst vorkommenden): 1000 Quartierstrasse, 1001 Quartierverbindungsstrasse, 1002 Basisnetz,
// 1004 nicht befahrbar (Fuss-, Aare-, Waldweg), 1005 Quartierstrasse ergänzend (Anlieferung, privat); 1003 Autobahn steht in der
// Layer-Beschreibung, kommt im Dienst aber nicht vor.
// Service «Strassentypen», Layer 0 (Linien, nur ein Teil der Strassen): Strgatt_id mit Text im Feld Strassentyp: 1 SS_30, 2 SS_50
// (Sammelstrasse), 3 VS_50_60 (Verbindungsstrasse), 5 HVS_50_60, 6 HVS_80 (Hauptverkehrsstrasse).
// Probe Mühlemattstrasse ±150 m: 41 Hierarchie-Linien (17 kB), 20 Strassentyp-Linien (7,6 kB). Nur Daten, keine Regeln.

import type { P } from '../geo'
import { arcgisUrl, arcgisHolen, arcgisPaar, linienTeile, textFeld, zahlFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

export type HierarchieTyp = 'quartier' | 'quartierverbindung' | 'basisnetz' | 'autobahn' | 'nicht_befahrbar' | 'quartier_ergaenzend'
export const HIERARCHIE_ID: Record<number, HierarchieTyp> = { 1000: 'quartier', 1001: 'quartierverbindung', 1002: 'basisnetz',
  1003: 'autobahn', 1004: 'nicht_befahrbar', 1005: 'quartier_ergaenzend' }
export const HIERARCHIE_TEXT: Record<HierarchieTyp, string> = { quartier: 'Quartierstrasse', quartierverbindung: 'Quartierverbindungsstrasse',
  basisnetz: 'Basisnetz', autobahn: 'Autobahn', nicht_befahrbar: 'nicht befahrbar', quartier_ergaenzend: 'Quartierstrasse ergänzend' }

export type StrassentypCode = 'SS_30' | 'SS_50' | 'VS_50_60' | 'HVS_50_60' | 'HVS_80'
export const STRASSENTYP_ID: Record<number, StrassentypCode> = { 1: 'SS_30', 2: 'SS_50', 3: 'VS_50_60', 5: 'HVS_50_60', 6: 'HVS_80' }
/** Klasse eines Strassentyps: Sammel-, Verbindungs- bzw. Hauptverkehrsstrasse */
export type StrassenKlasse = 'sammel' | 'verbindung' | 'haupt'
export const strassenKlasse = (c: StrassentypCode): StrassenKlasse => (c.startsWith('SS') ? 'sammel' : c.startsWith('VS') ? 'verbindung' : 'haupt')

export interface ShLinie { id: string; strasse: string; typId: number | null; typ: HierarchieTyp | null; text: string; teile: P[][] }
export interface StLinie { id: string; strasse: string; typId: number | null; typ: StrassentypCode | null; klasse: StrassenKlasse | null;
  text: string; teile: P[][] }
/** null: dieser Layer war nicht erreichbar */
export interface StrassenhierarchieDaten { hierarchie: ShLinie[] | null; typen: StLinie[] | null }

export const SH_DIENST = 'Strassenhierarchie'
export const ST_DIENST = 'Strassentypen'

/** Strassenhierarchie -> Linien; unbekannte Typ_id: typ null (Text aus dem Dienst bleibt) */
export function hierarchieAusGeoportal(gj: ArcgisGeoJson): ShLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f), pr = f.properties ?? {}
    if (!teile.length) return []
    const typId = zahlFeld(pr.Typ_id), typ = typId !== null ? HIERARCHIE_ID[typId] ?? null : null
    return [{ id: featureId('bernsh', f, i), strasse: textFeld(pr.Strassenname) ?? '', typId, typ,
      text: textFeld(pr.Strassenhierarchie) ?? (typ ? HIERARCHIE_TEXT[typ] : ''), teile }]
  })
}
/** Strassentypen -> Linien; Code aus Strgatt_id, sonst aus dem Text (SS_30 …), sonst null */
export function strassentypenAusGeoportal(gj: ArcgisGeoJson): StLinie[] {
  const codes = Object.values(STRASSENTYP_ID) as string[]
  return (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f), pr = f.properties ?? {}
    if (!teile.length) return []
    const typId = zahlFeld(pr.Strgatt_id), text = textFeld(pr.Strassentyp) ?? ''
    const typ = (typId !== null ? STRASSENTYP_ID[typId] : undefined) ?? (codes.includes(text) ? text as StrassentypCode : null)
    return [{ id: featureId('bernst', f, i), strasse: textFeld(pr.Strassenname) ?? '', typId, typ, klasse: typ ? strassenKlasse(typ) : null,
      text: text || (typ ?? ''), teile }]
  })
}

export const hierarchieUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(SH_DIENST, lat, lon, radiusM, 'Objectid,Typ_id,Strassenhierarchie,Strassenname', { nachkomma: 2 })
export const strassentypenUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(ST_DIENST, lat, lon, radiusM, 'Objectid,Strgatt_id,Strassentyp,Strassenname', { nachkomma: 2 })

/** Strassenhierarchie und Strassentypen im Rechteck ±radiusM um den Ort (zwei Abfragen) */
export async function ladeStrassenhierarchieBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal):
  Promise<Abruf<StrassenhierarchieDaten> & { hinweis: string | null }> {
  const r = await arcgisPaar(arcgisHolen(hierarchieUrl(lat, lon, radiusM), signal), arcgisHolen(strassentypenUrl(lat, lon, radiusM), signal),
    ['Strassenhierarchie', 'Strassentypen'])
  return { ...r, daten: { hierarchie: r.daten.a && hierarchieAusGeoportal(r.daten.a), typen: r.daten.b && strassentypenAusGeoportal(r.daten.b) },
    hinweis: r.daten.hinweis }
}
