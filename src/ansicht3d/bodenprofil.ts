// Höhenprofile ausschliesslich für die 3D-Darstellung. Die Leser der Sichtrechnung bleiben unverändert.
// Bern DTM 2023 und swissALTI3D liefern LN02 (swissALTI3D: https://www.swisstopo.admin.ch/en/height-model-swissalti3d).
// Fehlende Messungen bleiben null. Für die bestehende LHN95-Szenenkonvention in Bern gilt die dokumentierte −0,04-m-Annahme.
// Ausserhalb wird der LN02→LHN95-Versatz mit REFRAME am ersten gültigen Profilpunkt bestimmt, lokal entlang der Zufahrt konstant angenommen.
// Ein fehlender Bezug wird nicht mit LN02=Szene ersetzt. Keine Ellipsoidhöhen.
import { dist, type P } from '../geo'
import { BERN_DTM_URL } from '../daten/bernDtm'
import { hoehenDienstFuer, mitRueckfall, type HoehenDienstId } from '../daten/hoehenDienst'
import { holeJson, istAbbruch } from '../daten/holen'
import { inBern, LN02_ZU_SZENE_M } from './kunstbauten'
import { gueltigeHoehe } from './fahrbahn'

export interface BodenMessung { p: P | null; h: number | null }
export interface BodenProfil {
  dienst: HoehenDienstId
  bezug: 'LN02'
  messwerte: (number | null)[]
  szeneHoehen: (number | null)[]
  versatzM: number
  rueckfall?: string
}
const punkt = (x: unknown, y: unknown): P | null => gueltigeHoehe(x) && gueltigeHoehe(y) ? [x, y] : null
const zahl = (v: unknown): number | null => {
  const h = typeof v === 'string' && v.trim() ? Number(v) : v
  return gueltigeHoehe(h) ? h : null
}
export function bodenAntwort(roh: unknown, dienst: HoehenDienstId): BodenMessung[] {
  const r = roh as { error?: { message?: string }; samples?: { location?: { x?: unknown; y?: unknown }; value?: unknown }[] }
  if (r?.error) throw new Error(r.error.message ?? 'Höhendienst nicht verfügbar')
  if (dienst === 'bern.dtm') {
    if (!Array.isArray(r?.samples)) throw new Error('DTM-Antwort ist keine Liste')
    return r.samples.map(s => ({ p: punkt(s.location?.x, s.location?.y), h: zahl(s.value) }))
  }
  if (!Array.isArray(roh)) throw new Error('Profilantwort ist keine Liste')
  return roh.map((s: { easting?: unknown; northing?: unknown; alts?: { COMB?: unknown; DTM2?: unknown; DTM25?: unknown } }) =>
    ({ p: punkt(s.easting, s.northing), h: zahl(s.alts?.COMB) ?? zahl(s.alts?.DTM2) ?? zahl(s.alts?.DTM25) }))
}
/** Auf den unveränderten Weg abbilden. Nur unmittelbar benachbarte gültige Messungen verbinden, nie über null hinweg. */
export function profilZuordnen(punkte: readonly P[], messungen: readonly BodenMessung[]): (number | null)[] {
  return punkte.map(p => {
    const exakt = messungen.find(m => m.p && dist(m.p, p) < 0.02)
    if (exakt) return exakt.h
    let abstand = 0.11, h: number | null = null
    for (let i = 0; i < messungen.length; i++) {
      const a = messungen[i], b = messungen[Math.min(i + 1, messungen.length - 1)]
      if (!a.p || !b.p) continue
      const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a.p[0]) * dx + (p[1] - a.p[1]) * dy) / l2)) : 0
      const d = dist(p, [a.p[0] + t * dx, a.p[1] + t * dy])
      if (d >= abstand) continue
      abstand = d
      h = t < 1e-6 ? a.h : t > 1 - 1e-6 ? b.h : a.h !== null && b.h !== null ? a.h + t * (b.h - a.h) : null
    }
    return h
  })
}
/** Vollständige verdichtete Linie per POST, ohne die 8-Ecken-Vereinfachung der bisherigen Profilabrufe. */
export function profilAnfrage(punkte: readonly P[], dienst: HoehenDienstId): { url: string; init: RequestInit } {
  const linie = punkte.map(p => p.map(v => Math.round(v * 100) / 100))
  const q = dienst === 'bern.dtm' ? new URLSearchParams({ f: 'json', geometryType: 'esriGeometryPolyline',
    geometry: JSON.stringify({ paths: [linie], spatialReference: { wkid: 2056 } }), sampleDistance: '0.5',
    returnFirstValueOnly: 'true', interpolation: 'RSP_BilinearInterpolation' }) : new URLSearchParams({
    geom: JSON.stringify({ type: 'LineString', coordinates: linie }), sr: '2056', nb_points: String(Math.max(2, punkte.length * 2)), distinct_points: 'true' })
  return { url: dienst === 'bern.dtm' ? BERN_DTM_URL : 'https://api3.geo.admin.ch/rest/services/profile.json',
    init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString() } }
}
export const REFRAME_URL = 'https://geodesy.geo.admin.ch/reframe/ln02tolhn95'
async function szeneVersatz(p: P, h: number, signal?: AbortSignal): Promise<number> {
  if (inBern(p)) return LN02_ZU_SZENE_M
  const q = new URLSearchParams({ easting: String(p[0]), northing: String(p[1]), altitude: String(h), format: 'json' })
  const r = await holeJson<{ altitude?: unknown }>(`${REFRAME_URL}?${q}`, {}, 15000, signal)
  const umgerechnet = zahl(r.daten.altitude)
  if (umgerechnet === null) throw new Error('Höhenbezug LN02 → LHN95 nicht verfügbar')
  return umgerechnet - h
}
export async function ladeBodenProfil(punkte: readonly P[], signal?: AbortSignal): Promise<BodenProfil> {
  if (punkte.length < 2 || punkte.every(p => dist(p, punkte[0]) < 0.01)) throw new Error('Profilweg zu kurz')
  let rueckfall: string | undefined
  const r = await mitRueckfall(hoehenDienstFuer(inBern(punkte[0])), async dienst => {
    if (dienst.id === 'bern.dtm' && !punkte.every(inBern)) throw new Error('Profil ausserhalb des Berner DTM')
    const anfrage = profilAnfrage(punkte, dienst.id)
    const antwort = await holeJson<unknown>(anfrage.url, anfrage.init, dienst.ms, signal)
    const messwerte = profilZuordnen(punkte, bodenAntwort(antwort.daten, dienst.id))
    if (!messwerte.some(gueltigeHoehe)) throw new Error('Keine gültigen Bodenhöhen im Profil')
    return messwerte
  }, (_d, fehler, naechster) => { rueckfall = `${fehler.message}; Rückfall auf ${naechster.kurz}` })
  try {
    const erster = r.wert.findIndex(gueltigeHoehe)
    const versatzM = await szeneVersatz(punkte[erster], r.wert[erster]!, signal)
    return { dienst: r.dienst.id, bezug: 'LN02', messwerte: r.wert, versatzM,
      szeneHoehen: r.wert.map(h => h === null ? null : h + versatzM), rueckfall }
  } catch (e) {
    if (istAbbruch(e)) throw e
    throw new Error(`Bodenprofil ohne verwendbaren Höhenbezug: ${e instanceof Error ? e.message : String(e)}`)
  }
}
