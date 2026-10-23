// ── Tempo aus OSM: maxspeed, Zonen, Mehrheit entlang der Spur (aus fgsCheck) ──
//
// Übernommen aus fgsCheck (rechner/tempo.ts): wegTempo, zonenTempo, tempoBei, tempoEntlang. Die Tabellen der VSS 40 241 sind
// entfernt; die Stufen und Sichtweiten kommen aus der VSS 40 273 Tab. 1 (rechner/sichtweite.ts). Ohne Angabe 50 km/h
// (TEMPO_ERSATZ, als Annahme ausgewiesen).
// K0 (Nutzerentscheid 23.10.2026, wie fgsCheck seit 21.10.2026): amtliches Tempo als Eingabe der Rechnung (TempoAmtlichDaten; in der
// Stadt Bern V_sig des Geoportals): je Punkt der Spur die nächste Linie bis AMTLICH_SUCH_M, die etwa parallel liegt (höchstens
// AMTLICH_WINKEL); ist die nächste Linie ohne Wert bzw. liegt der Punkt ausserhalb des Bereichs, zählt der Punkt nicht. Mehrheit
// entlang der Spur wie tempoEntlang; ohne Treffer gilt OSM. Eine Eingabe von Hand geht vor (rechnen.ts).

import { type P, dot, einheit, sub, add, dist } from '../geo'
import type { TempoAmtlichDaten } from './typen'
import type { OsmNetz } from './netz'
import { RASTER } from './netz'
import { punkteAufSpur } from './spur'
import { tempoStufe } from './sichtweite'

export const TEMPO_ERSATZ = 50
const TEMPO_SUCHRADIUS = 5.0
const ACHSE_MAX_WINKEL = 35 * Math.PI / 180

/** Zonen-Angaben (zone:maxspeed, maxspeed:type) -> km/h, z. B. CH:zone30, CH:zone20, CH:urban */
export function zonenTempo(v: string | undefined): number | null {
  if (!v) return null
  // CH:zone30 bzw. CH:30 (zone:maxspeed in der Schweiz oft ohne «zone»; Befund Prüfrunde E0)
  const z = /^CH:(?:zone)?(\d+)$/.exec(v.trim())
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
  if (z) return [tempoStufe(z), 'OSM zone:maxspeed bzw. maxspeed:type']
  if (netz.W.get(wid)?.hw === 'living_street') return [20, 'OSM living_street']
  return null
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
 * Achsen.tempo_entlang (fgsCheck): das Tempo, das auf dem grössten Teil der Spur innerhalb der Länge laenge(tempo) gilt (alle
 * 2 m ab h; Gleichstand -> höheres), bis dreimal neu gerechnet; Pendel -> das höhere Tempo der Schleife (grössere Sichtweite).
 * -> [tempo, Treffer entlang der Spur, Pendel]. bei: Tempo je Punkt (Vorgabe: OSM maxspeed; K0 amtliches Tempo: amtlichBei)
 */
export function tempoEntlang(netz: OsmNetz, weg: P[], tempoStart0: number, h: number, laenge: (tempo: number) => number,
  bei: (q: P, r: P) => number | null = (q, r) => tempoBei(netz, q, r)): [number, boolean, number[] | null] {
  let tempo = tempoStart0, treffer = false
  const folge = [tempoStart0], ergebnis = new Map<number, number>()
  let pendel: number[] | null = null
  for (let runde = 0; runde < 3; runde++) {
    const sw = laenge(tempo)
    const zaehl = new Map<number, number>()
    const abst: number[] = []
    for (let k = 0; k <= Math.floor(sw / 2); k++) abst.push(h + k * 2)
    for (const [q, tRueck] of punkteAufSpur(weg, abst)) {
      const v = bei(q, tRueck)
      if (v) zaehl.set(v, (zaehl.get(v) ?? 0) + 2)
    }
    if (!zaehl.size) break
    treffer = true
    let neu = -1, nb = -1
    for (const [v, c] of zaehl) if (c > nb || (c === nb && v > neu)) { neu = v; nb = c }
    ergebnis.set(tempo, neu)
    if (neu === tempo) break
    if (folge.includes(neu)) {
      const schleife = [...new Set(folge.slice(folge.indexOf(neu)))].sort((a, b) => a - b)
      pendel = schleife
      const gross = schleife[schleife.length - 1]
      tempo = ergebnis.get(gross) ?? gross
      break
    }
    folge.push(neu)
    tempo = neu
  }
  return [tempo, treffer, pendel]
}

// ---------------------------------------------------------------- amtliches Tempo (K0)
/** Suchradius um einen Punkt der Spur [m]: die Linien liegen auf der Strassenachse (wie fgsCheck VSIG_SUCH_M) */
export const AMTLICH_SUCH_M = 8
/** höchste Abweichung der Linie von der Fahrtrichtung [°] (wie fgsCheck VSIG_WINKEL) */
export const AMTLICH_WINKEL = 35

/** Punkte der Spur so nah am Knoten (Anfang der Spur) zählen nicht: dort trifft die Suche noch die Linie des anderen Arms [m] */
export const AMTLICH_KNOTEN_M = AMTLICH_SUCH_M

/** nächste Linie bei p (bis AMTLICH_SUCH_M, höchstens AMTLICH_WINKEL zur Fahrtrichtung) mit ihrem Wert (v null = Linie ohne Wert);
 *  null ohne Linie, 'aussen' ausserhalb des geladenen Bereichs */
export function amtlichNaechste(d: TempoAmtlichDaten): (p: P, richtung: P) => { v: number | null } | null | 'aussen' {
  const cos = Math.cos(AMTLICH_WINKEL * Math.PI / 180)
  const b = d.bereich
  return (p, richtung) => {
    if (b && Math.max(Math.abs(p[0] - b.mitte[0]), Math.abs(p[1] - b.mitte[1])) > b.radiusM - AMTLICH_SUCH_M + 1e-9) return 'aussen'
    let best: [number, number | null] | null = null
    for (const l of d.linien) for (const z of l.teile) for (let i = 1; i < z.length; i++) {
      const a = z[i - 1], w = sub(z[i], a), l2 = dot(w, w)
      if (l2 === 0) continue
      const t = Math.max(0, Math.min(1, dot(sub(p, a), w) / l2))
      const dd = dist(p, add(a, w, t))
      if (dd <= AMTLICH_SUCH_M && Math.abs(dot(einheit(w), richtung)) >= cos - 1e-9 && (best === null || dd < best[0])) best = [dd, l.vSig]
    }
    return best ? { v: best[1] !== null && best[1] > 0 ? best[1] : null } : null
  }
}

/**
 * Amtliches Tempo je Punkt (wie fgsCheck vsigTempo): Wert der nächsten Linie bis AMTLICH_SUCH_M, die höchstens AMTLICH_WINKEL von der
 * Fahrtrichtung abweicht, auf die Stufe der Tab. 1; null ausserhalb des Bereichs bzw. wenn die nächste Linie ohne Wert ist (dann
 * zählt nicht der Wert einer weiter entfernten Linie).
 */
export function amtlichBei(d: TempoAmtlichDaten): (p: P, richtung: P) => number | null {
  const n = amtlichNaechste(d)
  return (p, richtung) => { const x = n(p, richtung); return x && x !== 'aussen' && x.v !== null ? tempoStufe(x.v) : null }
}

/**
 * Amtliches Tempo entlang der Spur (weg beginnt am Knoten): Mehrheit der Punkte mit Wert wie tempoEntlang (Start tempo0, das Tempo
 * aus OSM). Punkte bis AMTLICH_KNOTEN_M vom Knoten stimmen nicht mit (dort trifft die Suche noch die Linie des anderen Arms), Punkte
 * ausserhalb des geladenen Bereichs bzw. ohne Linie zählen nicht. Gilt nur, wenn über die längere der Längen zu OSM-Tempo und Ergebnis
 * mehr Punkte an einer Linie mit Wert liegen als an einer Linie ohne Wert («leere Linie -> OSM»); ohne Linie ausserhalb des Knotens
 * gilt OSM. -> Tempo, Treffer, Punkte an einer Linie mit bzw. ohne Wert, Punkte im Bereich (ohne Knoten)
 */
export function amtlichEntlang(netz: OsmNetz, weg: P[], tempo0: number, h: number, laenge: (tempo: number) => number, d: TempoAmtlichDaten):
  { tempo: number; treffer: boolean; wert: number; leer: number; innen: number } {
  const n = amtlichNaechste(d)
  const k0 = weg[0]
  const bei = (q: P, r: P) => (dist(q, k0) <= AMTLICH_KNOTEN_M + 1e-9 ? 'knoten' as const : n(q, r))
  const [t, treffer] = tempoEntlang(netz, weg, tempo0, h, laenge, (q, r) => {
    const x = bei(q, r)
    return x && typeof x === 'object' && x.v !== null ? tempoStufe(x.v) : null
  })
  const abst: number[] = []
  for (let k = 0; k <= Math.floor(Math.max(laenge(t), laenge(tempo0)) / 2); k++) abst.push(h + k * 2)
  let wert = 0, leer = 0, innen = 0
  for (const [q, r] of punkteAufSpur(weg, abst)) {
    const x = bei(q, r)
    if (x === 'knoten' || x === 'aussen') continue
    innen++
    if (x) { if (x.v === null) leer++; else wert++ }
  }
  return { tempo: t, treffer: treffer && wert > leer, wert, leer, innen }
}
