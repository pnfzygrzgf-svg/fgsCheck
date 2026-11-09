// ── 3D-Ansicht: Ladezustand (Speicher ausserhalb von React, wie hoehenkurven/stand.ts) ──
//
// Die Szene (cesiumSzene.ts) meldet ihren Stand hierher; die Ansicht zeigt ihn in der Statuszeile, App.tsx als Zeile in «Datenquellen
// und Ladezustand». Übertragene Bytes gibt es nicht: Cesium nennt sie nicht, und die Antworten von 3d.geo.admin.ch tragen kein
// Timing-Allow-Origin, darum zeigt die Zeile die Speicherschätzung der Gebäude (Cesium totalMemoryUsageInBytes). Der Datenstand ist das
// Datum in den Kachelpfaden (layer.json, tileset.json), kein amtlicher Datenstand.

import { useMemo, useSyncExternalStore } from 'react'

export interface Stand3D {
  phase: 'aus' | 'laedt' | 'bereit' | 'fehler'
  text: string
  /** Bleibender Hinweis zu fehlenden bzw. mehrdeutigen Fahrbahnhöhen. */
  hinweis?: string
  /** Zeitpunkt des Öffnens (ISO) und Dauer bis Gelände und Gebäude das erste Mal vollständig da waren [ms] */
  zeit?: string
  ms?: number
  /** offene Kachelabrufe (Gelände + Gebäude) */
  offen?: number
  luftbild?: boolean
  gebaeude?: 'an' | 'aus' | 'fehlt'
  baeume?: 'an' | 'aus' | 'fehlt'
  bruecken?: 'an' | 'aus' | 'fehlt'
  /** Kunstbauten der Stadt Bern im Umkreis (Anzahl) bzw. nicht verfügbar; ausserhalb Berns nicht gesetzt */
  kunstbauten?: number | 'fehlt'
  gpuBytes?: number
  anschluss?: number
  hoehenprofile?: { dienst: string; versatzM: number; rueckfall?: string }[]
  /** Datum der Kachelpfade je Dienst (JJJJMMTT), sobald gelesen */
  stand?: { gelaende?: string; gebaeude?: string; baeume?: string; bruecken?: string }
}
export const AUS: Stand3D = { phase: 'aus', text: '3D-Ansicht geschlossen.' }
export const TITEL = '3D-Ansicht (swisstopo: Gelände, Karte swissTLM grau oder Luftbild, swissBUILDINGS3D, Brücken aus swissTLM3D, in Bern Kunstbauten der Stadt; Boden aus der Amtlichen Vermessung)'

let wert: Stand3D = AUS
const listener = new Set<() => void>()
export const standLesen = () => wert
export const standAbonnieren = (f: () => void) => { listener.add(f); return () => { listener.delete(f) } }
export function standSetzen(s: Stand3D) { wert = s; for (const f of listener) f() }
export const useAnsicht3dStand = () => useSyncExternalStore(standAbonnieren, standLesen, standLesen)

interface QuellenInfo { name: string; server: string; datenstand: string; vollstaendigkeit: string; objekte?: string; zeit?: string; ms?: number
  bytes?: number; fehler?: string }

const datum = (t?: string) => (t && /^\d{8}$/.test(t) ? `${t.slice(6, 8)}.${t.slice(4, 6)}.${t.slice(0, 4)}` : null)
/** Zeile für «Datenquellen und Ladezustand»; leer, solange die Ansicht geschlossen ist oder noch lädt */
export function quelleZeile(s: Stand3D): Record<string, QuellenInfo> {
  if (s.phase !== 'bereit' && s.phase !== 'fehler') return {}
  const st = [['Gelände', s.stand?.gelaende], ['Gebäude', s.stand?.gebaeude], ['Brücken', s.stand?.bruecken], ['Modellbäume', s.stand?.baeume]]
    .filter(([, t]) => datum(t)).map(([n, t]) => `${n} ${datum(t)}`)
  const objekte = [
    s.luftbild ? 'Gelände und Luftbild' : 'Gelände und Karte swissTLM',
    s.gebaeude === 'an' ? 'Gebäude' : s.gebaeude === 'fehlt' ? 'Gebäude nicht verfügbar' : 'Gebäude aus',
    s.bruecken === 'an' ? 'Brücken' : s.bruecken === 'fehlt' ? 'Brücken nicht verfügbar' : null,
    typeof s.kunstbauten === 'number' && s.kunstbauten > 0 ? `Kunstbauten Stadt Bern (${s.kunstbauten})` : s.kunstbauten === 'fehlt' ? 'Kunstbauten Stadt Bern nicht verfügbar' : null,
    s.baeume === 'an' ? 'Baumkronen an den erfassten Stammstandorten (Form und Masse angenommen)' : null,
    s.hoehenprofile?.length ? `Fahrbahnprofile: ${[...new Set(s.hoehenprofile.map(p => p.dienst === 'bern.dtm' ? 'DTM 2023 Stadt Bern' : 'swissALTI3D'))].join(', ')} (LN02; lokaler Versatz zur Szene ${[...new Set(s.hoehenprofile.map(p => p.versatzM.toFixed(3)))].join(', ')} m, entlang der Zufahrt konstant angenommen)` : null,
    s.hoehenprofile?.some(p => p.rueckfall) ? s.hoehenprofile.filter(p => p.rueckfall).map(p => p.rueckfall).join('; ') : null,
    s.anschluss ? `${s.anschluss} ergänzte Fahrbahnanschlüsse: Darstellung, keine gemessene Fläche; Breite aus AV, ersatzweise 6 m innerhalb der AV-Strassenfläche` : null,
    s.gpuBytes ? `Speicherschätzung ${Math.round(s.gpuBytes / 1048576)} MB` : null,
  ].filter(Boolean).join(', ')
  return { ansicht3d: { name: TITEL, server: `3d.geo.admin.ch, wmts.geo.admin.ch${s.kunstbauten !== undefined || s.hoehenprofile?.some(p => p.dienst === 'bern.dtm') ? ', gisapp.bern.ch' : ''}${s.hoehenprofile?.some(p => p.dienst === 'swissalti') ? ', api3.geo.admin.ch (Höhenprofile; ausserhalb Berns geodesy.geo.admin.ch für den Höhenbezug)' : ''} · nur Anzeige, keine Änderung der Rechnung; welche Kacheln geladen werden, bestimmt die Kamera`,
    datenstand: st.length ? `${st.join(', ')} (Datum der Kachelpfade)` : 'unbekannt', vollstaendigkeit: 'unbekannt',
    objekte, zeit: s.zeit, ms: s.ms, ...(s.phase === 'fehler' ? { fehler: s.text } : {}) } }
}
export function useAnsicht3dQuelle(): Record<string, QuellenInfo> {
  const s = useAnsicht3dStand()
  return useMemo(() => quelleZeile(s), [s])
}
