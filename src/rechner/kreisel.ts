// ── Kreiselringe aus OSM (fgs_sicht_pruefen.Kreisel, aus_wegen) ──
//
// Ringe als Punktfolgen in Fahrtrichtung (OsmNetz.kreiselWege); Treffpunkt einer Spur mit dem Ring, Ringradius in
// Fahrstreifenmitte (Kreisfit, RMS; unrund lokal), Ringstück rückwärts/vorwärts.

import { type P, add, dist, dot, sub } from '../geo'
import { streckeLaenge } from './netz'
import { punkteAufSpur, kreisAnpassen } from './spur'

export const KREISEL_TREFFER_M = 4.0
export const KREISEL_BOGEN_M = 4.0
export const KREISEL_RMS_M = 1.0
export const KREISEL_LOKAL_M = 30.0
export const KREISEL_EINFAHRT_LOKAL_M = 15.0
export const KREISEL_EINFAHRT_ZUSATZ_M = 5.0

const k_ = (p: P) => `${Math.round(p[0] * 10) / 10},${Math.round(p[1] * 10) / 10}`

export class Kreisel {
  wege: P[][]
  raster = new Map<string, number[]>()
  ende = new Map<string, number[]>()
  anfang = new Map<string, number[]>()
  ringe: number[][] = []
  ringVon = new Map<number, number>()
  kreis: [number | null, number][] = []

  constructor(wege: P[][]) {
    this.wege = wege
    wege.forEach((pts, i) => {
      const e = k_(pts[pts.length - 1])
      if (!this.ende.has(e)) this.ende.set(e, [])
      this.ende.get(e)!.push(i)
      const a0 = k_(pts[0])
      if (!this.anfang.has(a0)) this.anfang.set(a0, [])
      this.anfang.get(a0)!.push(i)
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], b = pts[s + 1]
        for (let gx = Math.floor(Math.min(a[0], b[0]) / 20); gx <= Math.floor(Math.max(a[0], b[0]) / 20); gx++)
          for (let gy = Math.floor(Math.min(a[1], b[1]) / 20); gy <= Math.floor(Math.max(a[1], b[1]) / 20); gy++) {
            const key = `${gx},${gy}`
            if (!this.raster.has(key)) this.raster.set(key, [])
            if (!this.raster.get(key)!.includes(i)) this.raster.get(key)!.push(i)
          }
      }
    })
    const gesehen = new Set<number>()
    for (let i = 0; i < wege.length; i++) {
      if (gesehen.has(i)) continue
      const ring: number[] = [], offen = [i]
      while (offen.length) {
        const j = offen.pop()!
        if (gesehen.has(j)) continue
        gesehen.add(j); ring.push(j)
        offen.push(...(this.anfang.get(k_(wege[j][wege[j].length - 1])) ?? []), ...(this.ende.get(k_(wege[j][0])) ?? []))
      }
      this.ringe.push(ring)
    }
    this.ringe.forEach((ring, r) => {
      const pts = ring.flatMap(i => Kreisel.dicht(this.wege[i]))
      const k = pts.length >= 3 ? kreisAnpassen(pts) : null
      const rms = k ? Math.sqrt(pts.reduce((s, p) => s + (dist(p, k[0]) - k[1]) ** 2, 0) / pts.length) : Infinity
      this.kreis.push([k ? k[1] : null, rms])
      for (const i of ring) this.ringVon.set(i, r)
    })
  }

  static dicht(pts: P[], laenge: number | null = null): P[] {
    const l = laenge === null ? streckeLaenge(pts) : Math.min(laenge, streckeLaenge(pts))
    const ab: number[] = []
    for (let k = 0; k <= Math.floor(l); k++) ab.push(k)
    return punkteAufSpur(pts, ab).map(x => x[0])
  }

  /** naechst -> [abstand, weg, segment, t] */
  naechst(q: P, maxD: number): [number, number, number, number] | null {
    let best: [number, number, number, number] | null = null
    const kand = new Set<number>()
    for (let gx = Math.floor((q[0] - maxD) / 20); gx <= Math.floor((q[0] + maxD) / 20); gx++)
      for (let gy = Math.floor((q[1] - maxD) / 20); gy <= Math.floor((q[1] + maxD) / 20); gy++)
        for (const i of this.raster.get(`${gx},${gy}`) ?? []) kand.add(i)
    for (const i of [...kand].sort((a, b) => a - b)) {
      const pts = this.wege[i]
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], v = sub(pts[s + 1], a), l2 = dot(v, v)
        if (l2 === 0) continue
        const t = Math.max(0, Math.min(1, dot(sub(q, a), v) / l2))
        const d = dist(q, add(a, v, t))
        if (d <= maxD && (best === null || d < best[0])) best = [d, i, s, t]
      }
    }
    return best
  }

  /** treffer: erster Punkt der Spur (1-m-Schritte bis «bis») bis KREISEL_TREFFER_M neben einem Ring */
  treffer(weg: P[], bis: number): [number, number, number, number] | null {
    for (let d = 0; d <= Math.floor(bis); d++) {
      const p = punkteAufSpur(weg, [d])
      if (!p.length) break
      const best = this.naechst(p[0][0], KREISEL_TREFFER_M)
      if (best) return [d, best[1], best[2], best[3]]
    }
    return null
  }

  radius(i: number, s: number, t: number, rueck: number, vor = 0): [number | null, string] {
    const [rRing, rms] = this.kreis[this.ringVon.get(i)!]
    if (rRing !== null && rms <= KREISEL_RMS_M) return [rRing, 'Kreiselring OSM']
    let pts = Kreisel.dicht(this.rueckwaerts(i, s, t, rueck), rueck).reverse()
    if (vor > 0) pts = [...pts, ...Kreisel.dicht(this.vorwaerts(i, s, t, vor), vor).slice(1)]
    const k = pts.length >= 3 ? kreisAnpassen(pts) : null
    const lokal = (vor ? `Kreiselring OSM lokal (± ${vor.toFixed(0)} m um den Knoten` :
      `Kreiselring OSM lokal (${rueck.toFixed(0)} m vor dem Treffpunkt`) + `, Ring unrund, RMS ${rms.toFixed(1)} m)`
    return [k ? k[1] : null, lokal.replace('.', ',')]
  }

  rms(i: number): number { return this.kreis[this.ringVon.get(i)!][1] }

  radiusAb(i: number, s: number, t: number, ab: number, laenge: number): number | null {
    const pts = Kreisel.dicht(this.rueckwaerts(i, s, t, ab + laenge), ab + laenge).slice(Math.round(ab))
    const k = pts.length >= 3 ? kreisAnpassen(pts) : null
    return k ? k[1] : null
  }

  rueckwaerts(i: number, s: number, t: number, laenge: number): P[] {
    const pts = this.wege[i], a = pts[s], b = pts[s + 1]
    let weg: P[] = [add(a, sub(b, a), t), ...pts.slice(0, s + 1).reverse()]
    const besucht = new Set([i])
    for (let n = 0; n < 50; n++) {
      if (streckeLaenge(weg) >= laenge) break
      const vor = this.ende.get(k_(weg[weg.length - 1])) ?? []
      const neu = vor.filter(j => !besucht.has(j))
      if (!(neu.length || vor.length)) break
      const j = (neu.length ? neu : vor)[0]
      besucht.add(j)
      weg = [...weg, ...this.wege[j].slice(0, -1).reverse()]
    }
    return weg.filter((p, k) => k === 0 || dist(p, weg[k - 1]) > 0.01)
  }

  vorwaerts(i: number, s: number, t: number, laenge: number): P[] {
    const pts = this.wege[i], a = pts[s], b = pts[s + 1]
    let weg: P[] = [add(a, sub(b, a), t), ...pts.slice(s + 1)]
    const besucht = new Set([i])
    for (let n = 0; n < 50; n++) {
      if (streckeLaenge(weg) >= laenge) break
      const nach = this.anfang.get(k_(weg[weg.length - 1])) ?? []
      const neu = nach.filter(j => !besucht.has(j))
      if (!(neu.length || nach.length)) break
      const j = (neu.length ? neu : nach)[0]
      besucht.add(j)
      weg = [...weg, ...this.wege[j].slice(1)]
    }
    return weg.filter((p, k) => k === 0 || dist(p, weg[k - 1]) > 0.01)
  }
}
