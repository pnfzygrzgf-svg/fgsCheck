// ── Höhenprofile der Sichtlinien (Erkennungsdistanz und Sicht auf die Wartefläche mit Gelände, 30.10.2026) ──
//
// Derselbe Dienst wie Längsneigung, Kurvenregel und Velo-Sicht (daten/hoehenDienst.ts: swissALTI3D über api3.geo.admin.ch, in der
// Stadt Bern zuerst das DTM 2023 der Stadt über gisapp.bern.ch, Rückfall auf swissALTI3D). Hinaus gehen nur die zwei Endpunkte der
// Sichtlinie (LV95, auf 0,1 m). Stützpunkte nach der Länge (rund alle 2 m, 10 bis 60). Antworten bleiben im Speicher (Cache je Adresse,
// also je Dienst, auch über Neurechnungen am selben Ort); höchstens SICHT_PROFIL_PARALLEL Abrufe gleichzeitig; Zeitgrenze je Abruf; ein
// Abbruch (anderer Ort geladen) bricht ab und nimmt den Eintrag aus dem Cache, ebenso ein Fehler (nächster Versuch fragt neu).

import { dist, type P } from '../geo'
import { holeJson, type Abruf } from './holen'
import { SWISSALTI, type HoehenDienst } from './hoehenDienst'
import type { ProfilPunkt } from '../knotensicht/rechner/neigung'

export const SICHT_PROFIL_MS = 15000
export const SICHT_PROFIL_PARALLEL = 4
const CACHE_MAX = 400

/** Stützpunkte eines Profils der Länge L [m]: rund alle 2 m, mindestens 10, höchstens 60 */
export const sichtProfilPunkte = (L: number): number => Math.max(10, Math.min(60, Math.ceil(L / 2) + 1))

/** Adresse des Profils vom Augpunkt zum Ziel (Endpunkte auf 0,1 m) beim Dienst */
export function sichtProfilUrl(auge: P, ziel: P, dienst: HoehenDienst = SWISSALTI): string {
  const r = (p: P): P => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]
  return dienst.profilUrl([r(auge), r(ziel)], sichtProfilPunkte(dist(auge, ziel)))
}

const cache = new Map<string, { p: Promise<Abruf<ProfilPunkt[]>>; signal?: AbortSignal; antwort?: Abruf<ProfilPunkt[]>; abgerufen?: string }>()
/** Bereits geladene Punkte für den erklärenden Höhenschnitt; löst keinen Abruf aus. */
export function sichtProfilVorhanden(auge: P, ziel: P, dienst: HoehenDienst = SWISSALTI) {
  let url: string
  try { url = sichtProfilUrl(auge, ziel, dienst) } catch { return null }
  const c = cache.get(url)
  return c?.antwort ? { ...c.antwort, abgerufen: c.abgerufen } : null
}
let laufend = 0
const warten: (() => void)[] = []
async function platz(): Promise<void> {
  if (laufend < SICHT_PROFIL_PARALLEL) { laufend++; return }
  await new Promise<void>(res => warten.push(res))
}
function frei(): void {
  const n = warten.shift()
  if (n) n(); else laufend--
}

/** Profil der Sichtlinie (dist ab dem Augpunkt) beim Dienst; aus dem Cache, sonst abgerufen. Wirft bei Fehler bzw. Abbruch */
export function ladeSichtProfil(auge: P, ziel: P, signal?: AbortSignal, dienst: HoehenDienst = SWISSALTI): Promise<Abruf<ProfilPunkt[]>> {
  const url = sichtProfilUrl(auge, ziel, dienst)
  // ein Eintrag eines abgebrochenen Abrufs (anderer Ort geladen) gilt nicht mehr
  const da = cache.get(url)
  if (da && !da.signal?.aborted) return da.p
  const p = (async () => {
    await platz()
    try {
      if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
      const r = await holeJson<unknown>(url, {}, Math.max(SICHT_PROFIL_MS, dienst.ms), signal)
      return { ...r, daten: dienst.lesen(r.daten) }
    } finally { frei() }
  })()
  cache.set(url, { p, signal })
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  // fertige Antworten gelten weiter (auch nach einem Abbruch späterer Abrufe), fehlgeschlagene fragt der nächste Versuch neu
  p.then(r => { const c = cache.get(url); if (c?.p === p) { c.signal = undefined; c.antwort = r; c.abgerufen = new Date().toISOString() } }, () => { if (cache.get(url)?.p === p) cache.delete(url) })
  return p
}
