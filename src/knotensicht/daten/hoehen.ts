// ── Höhenprofil aus dem Höhenmodell swissALTI3D (© swisstopo) für die Längsneigung (E3a) ──
//
// GET api3.geo.admin.ch/rest/services/profile.json mit der Linie als GeoJSON-LineString in LV95 (sr=2056) und nb_points
// Stützpunkten; CORS erlaubt (Access-Control-Allow-Origin: *, geprüft 15./16.10.2026). Antwort: Liste {dist, easting, northing,
// alts: {COMB, DTM2, DTM25}}; COMB = swissALTI3D, wo vorhanden (sonst DHM25), auf 0,1 m. Hinaus geht nur die Linie.
// Die App holt höchstens vier Profile je Fall (Vortrittsstrasse links und rechts, Zufahrt, ab E3b das Trottoir), erst nach dem Umkreis-Abruf und nicht
// gleichzeitig mit einer Overpass-Abfrage (App.tsx).

import type { P } from '../geo'
import { holeJson, type Abruf } from './holen'
import { neigungMessung, type ProfilPunkt } from '../rechner/neigung'
import type { NeigungMessung } from '../rechner/typen'

/** Stützpunkte je Profil (Plan: rund 20) */
export const PROFIL_PUNKTE = 20
/** Linie höchstens mit so vielen Ecken in die Adresse (gleichmässig ausgedünnt, Anfang und Ende bleiben); der Dienst liefert
 *  zusätzlich zu nb_points die Ecken, darum wenige */
const PROFIL_ECKEN_MAX = 8
const PROFIL_MS = 15000

interface ProfilRoh { dist?: number; alts?: { COMB?: number | null; DTM2?: number | null; DTM25?: number | null } }

export function profilUrl(linie: P[], punkte = PROFIL_PUNKTE): string {
  const schritt = Math.max(1, Math.ceil((linie.length - 1) / (PROFIL_ECKEN_MAX - 1)))
  const ecken = linie.filter((_, k) => k % schritt === 0 || k === linie.length - 1)
  const geom = JSON.stringify({ type: 'LineString', coordinates: ecken.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]) })
  return `https://api3.geo.admin.ch/rest/services/profile.json?geom=${encodeURIComponent(geom)}&sr=2056&nb_points=${punkte}`
}

/** Antwort von profile.json -> Profilpunkte (Höhe COMB, sonst DTM2 bzw. DTM25; Punkte ohne Höhe fallen weg) */
export function profilLesen(roh: unknown): ProfilPunkt[] {
  if (!Array.isArray(roh)) throw new Error('Antwort ist keine Liste')
  const out: ProfilPunkt[] = []
  for (const x of roh as ProfilRoh[]) {
    const h = x?.alts?.COMB ?? x?.alts?.DTM2 ?? x?.alts?.DTM25
    if (typeof x?.dist === 'number' && typeof h === 'number' && Number.isFinite(h)) out.push({ dist: x.dist, h })
  }
  return out
}

/** Profil entlang der Linie (vom Knoten weg) holen */
export async function ladeProfil(linie: P[], signal?: AbortSignal): Promise<Abruf<ProfilPunkt[]>> {
  if (linie.length < 2) throw new Error('Linie zu kurz')
  const r = await holeJson<unknown>(profilUrl(linie), {}, PROFIL_MS, signal)
  return { ...r, daten: profilLesen(r.daten) }
}

/** Längsneigung zum Knoten hin aus dem Profil der Linie; Fehler des Dienstes ergeben i = null mit Hinweis (Rechnung mit 0 %).
 *  Ein Abbruch (anderer Ort geladen) wird weitergereicht. -> [Messung, Abruf bzw. Fehlertext] */
export async function ladeNeigung(linie: P[], signal?: AbortSignal): Promise<[NeigungMessung, Abruf<ProfilPunkt[]> | string]> {
  try {
    const r = await ladeProfil(linie, signal)
    return [neigungMessung(r.daten), r]
  } catch (e) {
    if (signal?.aborted || (e as Error)?.name === 'AbortError') throw e
    const f = e instanceof Error ? e : new Error(String(e))
    return [neigungMessung(f), f.message]
  }
}
