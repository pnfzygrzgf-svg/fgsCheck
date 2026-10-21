// ── Taktil-visuelle Markierungen der Stadt Bern (Geoportal) für die Vorbelegung (Automatik Paket C, 21.10.2026) ──
//
// Service «Taktil_visuelle_Markierungen»: Layer 1 «TVM_Feld» (Punkte je Feld; Art mit Text in Art_beschrieb, Baujahr) und
// Layer 2 «TVM_Linie» (Linien; Art, Art_beschrieb, Baujahr). Werte im Dienst (geprüft 21.10.2026):
//   Felder: 1001 Aufmerksamkeitsfeld, 1002 Blindenquadrat, 1003 Blindenquadrat gepflästert, 1004 Abschlussfeld, 1005 Abzweigfeld,
//           1099 Anschluss andere
//   Linien: 1001 Leitlinie normal, 1002 Sicherheitslinie, 1003 Leitlinie auf dem Fussgängerstreifen, 1004 Treppenmarkierung
// Die Texte unten sind eigene Kurztexte je Code (Text des Diensts nur, wenn der Code unbekannt ist). Probe Mühlemattstrasse ±150 m:
// 20 Felder (4 kB), 7 Linien (2 kB). Nur Daten, keine Regeln.

import type { P } from '../geo'
import { arcgisUrl, arcgisHolen, arcgisPaar, linienTeile, punktLage, textFeld, zahlFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

export const TVM_FELD_TEXT: Record<number, string> = { 1001: 'Aufmerksamkeitsfeld', 1002: 'Blindenquadrat', 1003: 'Blindenquadrat gepflästert',
  1004: 'Abschlussfeld', 1005: 'Abzweigfeld', 1099: 'Anschluss andere' }
export const TVM_LINIE_TEXT: Record<number, string> = { 1001: 'Leitlinie', 1002: 'Sicherheitslinie',
  1003: 'Leitlinie auf dem Fussgängerstreifen', 1004: 'Treppenmarkierung' }
/** Art der Leitlinie auf dem Streifen */
export const TVM_LEITLINIE_STREIFEN = 1003
export const TVM_AUFMERKSAMKEITSFELD = 1001

export interface TvmFeld { id: string; art: number | null; text: string; p: P; baujahr: number | null }
export interface TvmLinie { id: string; art: number | null; text: string; teile: P[][]; baujahr: number | null; aufStreifen: boolean }
/** null: dieser Layer war nicht erreichbar */
export interface TaktilDaten { felder: TvmFeld[] | null; linien: TvmLinie[] | null }

export const TVM_DIENST = 'Taktil_visuelle_Markierungen'

const text = (art: number | null, tab: Record<number, string>, roh: unknown) => (art !== null && tab[art]) || textFeld(roh) || ''
const jahr = (x: unknown) => { const j = zahlFeld(x); return j !== null && j > 1900 && j < 2200 ? j : null }

export function tvmFelderAusGeoportal(gj: ArcgisGeoJson): TvmFeld[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const p = punktLage(f), pr = f.properties ?? {}, art = zahlFeld(pr.Art)
    return p ? [{ id: featureId('berntvmf', f, i), art, text: text(art, TVM_FELD_TEXT, pr.Art_beschrieb), p, baujahr: jahr(pr.Baujahr) }] : []
  })
}
export function tvmLinienAusGeoportal(gj: ArcgisGeoJson): TvmLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f), pr = f.properties ?? {}, art = zahlFeld(pr.Art)
    return teile.length ? [{ id: featureId('berntvml', f, i), art, text: text(art, TVM_LINIE_TEXT, pr.Art_beschrieb), teile,
      baujahr: jahr(pr.Baujahr), aufStreifen: art === TVM_LEITLINIE_STREIFEN }] : []
  })
}

export const tvmFelderUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(TVM_DIENST, lat, lon, radiusM, 'Objectid,Art,Art_beschrieb,Baujahr', { layer: 1, nachkomma: 2 })
export const tvmLinienUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(TVM_DIENST, lat, lon, radiusM, 'Objectid,Art,Art_beschrieb,Baujahr', { layer: 2, nachkomma: 2 })

/** Taktil-visuelle Felder und Linien im Rechteck ±radiusM um den Ort (zwei Abfragen) */
export async function ladeTaktilBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal):
  Promise<Abruf<TaktilDaten> & { hinweis: string | null }> {
  const r = await arcgisPaar(arcgisHolen(tvmFelderUrl(lat, lon, radiusM), signal), arcgisHolen(tvmLinienUrl(lat, lon, radiusM), signal),
    ['Taktile Felder', 'Taktile Linien'])
  return { ...r, daten: { felder: r.daten.a && tvmFelderAusGeoportal(r.daten.a), linien: r.daten.b && tvmLinienAusGeoportal(r.daten.b) },
    hinweis: r.daten.hinweis }
}
