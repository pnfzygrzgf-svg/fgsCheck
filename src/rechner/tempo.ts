// ── Tempo und Sichtweite (VSS 40 241 Tab. 1/Tab. 2, bfu 2.457.01) ──
//
// Portierung von sichtweite_tab1, tempo_stufe, sichtweite_kurve, radius_runden, tempo_start und Achsen.tempo_entlang
// (fgs_sicht_pruefen.py). Das Berner Projekt nimmt das Tempo aus dem amtlichen Tempo-Datensatz (Tempo-Achsen) und
// OSM-maxspeed nur als Ersatz; die App hat nur OSM: Tempo = maxspeed des OSM-Wegs unter der Spur (Mehrheit entlang der
// Spur innerhalb der Sichtweite, wie tempo_entlang), ohne Angabe 50 km/h mit Hinweis.
// Nur die Zahlenwerte der Tabellen, kein Normtext.

import { type P, dot, einheit, sub, add, dist } from '../geo'
import type { OsmNetz } from './netz'
import { RASTER } from './netz'
import { punkteAufSpur } from './spur'

/** VSS 40 241, Tab. 1: Sichtweite [m] nach Tempo [km/h] */
export const SICHTWEITE: Record<number, number> = { 20: 25, 30: 25, 40: 40, 50: 55, 60: 75 }
/** Sichtweite nach Kurvenradius in Fahrstreifenmitte: (Radius bis, Sichtweite, Quelle) – bfu 2.457.01 bzw. VSS Tab. 2 */
export const KURVE_SICHTWEITE: [number, number, string][] = [[5, 10, 'bfu'], [10, 15, 'bfu'], [15, 20, 'bfu'], [20, 24, 'bfu'],
  [25, 35, 'VSS Tab. 2'], [30, 40, 'VSS Tab. 2'], [35, 45, 'VSS Tab. 2'], [40, 50, 'VSS Tab. 2']]
export const TEMPO_ERSATZ = 50
const TEMPO_SUCHRADIUS = 5.0
const ACHSE_MAX_WINKEL = 35 * Math.PI / 180
const TEMPO_PENDEL_GROSSE_SW = true

/** sichtweite_tab1 (über 60 km/h wie 60, Zwischenwerte wie 50) */
export function sichtweiteTab1(tempo: number): number {
  return SICHTWEITE[tempo] ?? (tempo > 60 ? SICHTWEITE[60] : SICHTWEITE[50])
}

/** tempo_stufe: auf die nächsthöhere Stufe von Tab. 1; über 60 bleibt der Wert */
export function tempoStufe(v: number): number {
  return v > 60 ? v : Math.min(...Object.keys(SICHTWEITE).map(Number).filter(t => t >= v))
}

/** sichtweite_kurve -> [Sichtweite, Quelle] bzw. [null, null] über 40 m */
export function sichtweiteKurve(radius: number): [number | null, string | null] {
  for (const [r, sw, q] of KURVE_SICHTWEITE) if (radius <= r) return [sw, q]
  return [null, null]
}

/** radius_runden: 0,1 m, nie über eine Stufengrenze hinunter */
export function radiusRunden(radius: number): number {
  let r = Math.round(radius * 10) / 10
  const a = sichtweiteKurve(r), b = sichtweiteKurve(radius)
  if (a[0] !== b[0] || a[1] !== b[1]) r = Math.ceil(radius * 10 - 1e-9) / 10
  return r
}

/** Zonen-Angaben (zone:maxspeed, maxspeed:type) -> km/h, z. B. CH:zone30, CH:zone20, CH:urban */
export function zonenTempo(v: string | undefined): number | null {
  if (!v) return null
  const z = /^CH:zone(\d+)$/.exec(v.trim())
  if (z) return parseInt(z[1], 10)
  return ({ 'CH:urban': 50, 'CH:rural': 80, 'CH:trunk': 100, 'CH:motorway': 120, 'CH:living_street': 20 } as Record<string, number>)[v.trim()] ?? null
}

/** Tempo eines OSM-Wegs: maxspeed (OsmNetz.maxspeed), sonst zone:maxspeed bzw. maxspeed:type, sonst Begegnungszone
 * (living_street) 20 km/h; sonst null */
export function wegTempo(netz: OsmNetz, wid: number): [number, string] | null {
  const v = netz.maxspeed(wid)
  if (v) return [tempoStufe(v), 'OSM maxspeed']
  const t = netz.W.get(wid)?.t ?? {}
  const z = zonenTempo(t['zone:maxspeed']) ?? zonenTempo(t['maxspeed:type'])
  if (z) return [tempoStufe(z), 'OSM zone:maxspeed']
  if (netz.W.get(wid)?.hw === 'living_street') return [20, 'OSM living_street']
  return null
}

/** tempo_start (SPEC 4.4) ohne Tempo-Achsen: OSM-maxspeed des Wegs, sonst Ersatz */
export function tempoStart(netz: OsmNetz, wid: number | null): [number, string] {
  if (wid !== null) {
    const t = wegTempo(netz, wid)
    if (t) return t
  }
  return [TEMPO_ERSATZ, 'Ersatz']
}

/** Achsen.tempo_bei mit OSM: Tempo des nächsten zur Richtung parallelen Wegs bei p (TEMPO_SUCHRADIUS, ±35°) */
export function tempoBei(netz: OsmNetz, p: P, richtung: P, radius = TEMPO_SUCHRADIUS): number | null {
  let best: [number, number] | null = null
  const cx = Math.floor(p[0] / RASTER), cy = Math.floor(p[1] / RASTER)
  const gesehen = new Set<string>()
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
    for (const [wid, k] of netz.raster.get(`${gx},${gy}`) ?? []) {
      const key = `${wid},${k}`
      if (gesehen.has(key)) continue
      gesehen.add(key)
      const t = wegTempo(netz, wid)
      if (!t) continue
      const nds = netz.w(wid).nds
      const a = netz.p(nds[k]), b = netz.p(nds[k + 1]), w = sub(b, a), l2 = dot(w, w)
      if (l2 === 0) continue
      const tt = Math.max(0, Math.min(1, dot(sub(p, a), w) / l2))
      const d = dist(p, add(a, w, tt))
      if (d <= radius && Math.abs(dot(einheit(w), richtung)) >= Math.cos(ACHSE_MAX_WINKEL) && (best === null || d < best[0]))
        best = [d, t[0]]
    }
  }
  return best ? best[1] : null
}

/**
 * Achsen.tempo_entlang: das Tempo, das auf dem grössten Teil der Spur innerhalb der Sichtweite gilt (alle 2 m; Gleichstand
 * -> höheres), bis dreimal neu gerechnet; Pendel -> Ergebnis über die grösste Sichtweite der Schleife.
 * -> [tempo, Treffer entlang der Spur, Pendel]
 */
export function tempoEntlang(netz: OsmNetz, weg: P[], tempoStart0: number, h: number): [number, boolean, number[] | null] {
  let tempo = tempoStart0, treffer = false
  const folge = [tempoStart0], ergebnis = new Map<number, number>()
  let pendel: number[] | null = null
  for (let runde = 0; runde < 3; runde++) {
    const sw = sichtweiteTab1(tempo)
    const zaehl = new Map<number, number>()
    const abst: number[] = []
    for (let k = 0; k <= Math.floor(sw / 2); k++) abst.push(h + k * 2)
    for (const [q, tRueck] of punkteAufSpur(weg, abst)) {
      const v = tempoBei(netz, q, tRueck)
      if (v) zaehl.set(v, (zaehl.get(v) ?? 0) + 2)
    }
    if (!zaehl.size) break
    treffer = true
    let neu = -1, nb = -1
    for (const [v, c] of zaehl) if (c > nb || (c === nb && v > neu)) { neu = v; nb = c }
    ergebnis.set(tempo, neu)
    if (neu === tempo) break
    if (TEMPO_PENDEL_GROSSE_SW && folge.includes(neu)) {
      const schleife = [...new Set(folge.slice(folge.indexOf(neu)))].sort((a, b) => a - b)
      pendel = schleife
      const gross = schleife.reduce((b, v) => (sichtweiteTab1(v) > sichtweiteTab1(b) ? v : b))
      tempo = ergebnis.get(gross) ?? gross
      break
    }
    folge.push(neu)
    tempo = neu
  }
  return [tempo, treffer, pendel]
}
