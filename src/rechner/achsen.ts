// ── Rückfall ohne gequerten OSM-Weg: Achse für die Spur (fgs_sicht_pruefen.Achsen, achse_waehlen, rueckfall_spur) ──
//
// Im Berner Projekt sind das die Achsen des amtlichen Tempo-Datensatzes; in der App die befahrbaren OSM-Wege (gleiche
// Regeln: nächste Achse bis 20 m mit passender Richtung ±35°, sonst ±60°, deren Spur auf den ersten 40 m zu 70 % auf der
// AV-Fahrbahn liegt; Spur entlang der Achse gegen die Fahrt, an Weg-Enden weiter auf dem Weg mit der kleinsten
// Richtungsänderung bis 45°, sonst gerade).

import { type P, add, dist, dot, einheit, sub } from '../geo'
import type { OsmNetz } from './netz'
import type { Fahrbahn } from './flaechen'
import { punkteAufSpur } from './spur'
import { streckeLaenge } from './netz'

const ACHSE_SUCHRADIUS = 20.0
const ACHSE_MAX_WINKEL = 35 * Math.PI / 180
const ACHSE_MAX_WINKEL_WEIT = 60 * Math.PI / 180
const SPUR_AUF_FAHRBAHN = 0.7
const SPUR_PRUEF_M = 40.0

export type AchsTreffer = [number, number, number, number, number]     // linie, segment, t, abstand, winkel

export class OsmAchsen {
  linien: { pts: P[]; wid: number }[] = []
  knoten = new Map<number, [number, number][]>()      // OSM-Knoten -> [linie, index]
  ids: number[][] = []

  constructor(netz: OsmNetz) {
    for (const [wid, w] of netz.W) {
      if (!w.mfz) continue
      const i = this.linien.length
      this.linien.push({ pts: w.nds.map(n => netz.p(n)), wid })
      this.ids.push(w.nds)
      w.nds.forEach((n, k) => {
        if (!this.knoten.has(n)) this.knoten.set(n, [])
        this.knoten.get(n)!.push([i, k])
      })
    }
  }

  /** Achsen.kandidaten: je Linie die beste Lage nahe p mit passender Richtung, nach Abstand */
  kandidaten(p: P, richtung: P, maxWinkel: number): AchsTreffer[] {
    const best = new Map<number, AchsTreffer>()
    this.linien.forEach(({ pts }, i) => {
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], v = sub(pts[s + 1], a), l2 = dot(v, v)
        if (l2 === 0) continue
        const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
        const d = dist(p, add(a, v, t))
        const w = Math.acos(Math.min(1, Math.abs(dot(einheit(v), richtung))))
        if (d <= ACHSE_SUCHRADIUS && w <= maxWinkel && (!best.has(i) || d < best.get(i)![3])) best.set(i, [i, s, t, d, w])
      }
    })
    return [...best.values()].sort((a, b) => a[3] - b[3])
  }

  /** Achsen.spur: Punkte entlang der Achse ab der Lotfusspunkt-Lage, gegen die Fahrtrichtung */
  spur(start: [number, number, number], rueck: P, laenge: number): P[] {
    const [i, s, t] = start
    const pts = this.linien[i].pts
    const v = sub(pts[s + 1], pts[s])
    const vorwaerts = dot(v, rueck) > 0
    const weg: P[] = [add(pts[s], v, t)]
    let folge = vorwaerts ? pts.slice(s + 1) : pts.slice(0, s + 1).reverse()
    let endKnoten = vorwaerts ? this.ids[i][pts.length - 1] : this.ids[i][0]
    const besucht = new Set([i])
    for (;;) {
      weg.push(...folge)
      if (streckeLaenge(weg) >= laenge) break
      const ende = weg[weg.length - 1]
      const rich = dist(weg[weg.length - 1], weg[weg.length - 2]) > 0 ? einheit(sub(ende, weg[weg.length - 2])) : rueck
      let best: [number, number, P[], number] | null = null
      for (const [j, k] of this.knoten.get(endKnoten) ?? []) {
        if (besucht.has(j)) continue
        const lp = this.linien[j].pts
        for (const [seq, endK] of [[lp.slice(k), this.ids[j][lp.length - 1]], [lp.slice(0, k + 1).reverse(), this.ids[j][0]]] as [P[], number][]) {
          if (seq.length < 2 || dist(seq[0], seq[1]) === 0) continue
          const w = Math.acos(Math.max(-1, Math.min(1, dot(rich, einheit(sub(seq[1], seq[0]))))))
          if (w < 45 * Math.PI / 180 && (best === null || w < best[0])) best = [w, j, seq, endK]
        }
      }
      if (best === null) { weg.push(add(ende, rich, laenge)); break }
      besucht.add(best[1])
      folge = best[2].slice(1)
      endKnoten = best[3]
    }
    return weg
  }
}

/** achse_waehlen -> [Treffer | null, Spur auf der Fahrbahn] */
export function achseWaehlen(achsen: OsmAchsen, fahrbahn: Fahrbahn, m: P, d: P, h: number): [AchsTreffer | null, boolean] {
  const rueck: P = [-d[0], -d[1]]
  const gut = (k: AchsTreffer) => {
    const weg = achsen.spur([k[0], k[1], k[2]], rueck, h + SPUR_PRUEF_M + 2)
    const ab: number[] = []
    for (let i = 1; i <= Math.floor(SPUR_PRUEF_M / 2); i++) ab.push(h + 2 * i)
    const punkte = punkteAufSpur(weg, ab)
    return punkte.length > 0 && punkte.filter(([q]) => fahrbahn.enthaelt(q)).length >= SPUR_AUF_FAHRBAHN * punkte.length
  }
  const eng = achsen.kandidaten(m, d, ACHSE_MAX_WINKEL)
  for (const k of eng) if (gut(k)) return [k, true]
  for (const k of achsen.kandidaten(m, d, ACHSE_MAX_WINKEL_WEIT)) if (k[4] > ACHSE_MAX_WINKEL && gut(k)) return [k, true]
  return eng.length ? [eng[0], false] : [null, false]
}
