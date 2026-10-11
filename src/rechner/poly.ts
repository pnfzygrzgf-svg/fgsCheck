// ── Polygone: Vereinigung, Schnitt, Differenz, Fläche, Abstand (Ersatz für die OGR-Geometrie im Berner Projekt) ──
//
// Boolesche Operationen mit polygon-clipping (MIT). Koordinaten werden dafür um den LV95-Nullpunkt verschoben (kleine
// Zahlen, stabilere Rundung). Ein Polygon ist eine Liste von Ringen (erster = Hülle, weitere = Löcher), ein
// Mehrfachpolygon eine Liste von Polygonen; Ringe ohne Wiederholung des ersten Punkts.

import pc from 'polygon-clipping'
import { type P, dist, imPolygon, abstandStrecke, sub, kreuz } from '../geo'

export type Ring = P[]
export type Poly = Ring[]
export type Multi = Poly[]

const O: P = [2600000, 1200000]
type Pair = [number, number]
const hin = (m: Multi): Pair[][][] => m.map(poly => poly.map(r => {
  const z = r.map(p => [p[0] - O[0], p[1] - O[1]] as Pair)
  if (z.length && (z[0][0] !== z[z.length - 1][0] || z[0][1] !== z[z.length - 1][1])) z.push([z[0][0], z[0][1]])
  return z
}))
const zurueck = (m: Pair[][][]): Multi => m.map(poly => poly.map(r => {
  const z = r.map(p => [p[0] + O[0], p[1] + O[1]] as P)
  if (z.length > 1 && z[0][0] === z[z.length - 1][0] && z[0][1] === z[z.length - 1][1]) z.pop()
  return z
}))

export function vereinigung(...ms: Multi[]): Multi {
  const nicht = ms.filter(m => m.length)
  if (!nicht.length) return []
  const [a, ...rest] = nicht.map(hin)
  return zurueck(pc.union(a, ...rest))
}
export function schnitt(a: Multi, b: Multi): Multi {
  if (!a.length || !b.length) return []
  return zurueck(pc.intersection(hin(a), hin(b)))
}
export function differenz(a: Multi, b: Multi): Multi {
  if (!a.length) return []
  if (!b.length) return a
  return zurueck(pc.difference(hin(a), hin(b)))
}

export function ringFlaeche(r: Ring): number {
  let s = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return s / 2
}
export function flaeche(m: Multi): number {
  let s = 0
  for (const poly of m) poly.forEach((r, k) => { s += k === 0 ? Math.abs(ringFlaeche(r)) : -Math.abs(ringFlaeche(r)) })
  return s
}

export function enthaelt(m: Multi, p: P): boolean {
  return m.some(poly => imPolygon(p, poly))
}

/** Abstand Punkt – Mehrfachpolygon (0 innen) */
export function abstandPunkt(m: Multi, p: P): number {
  if (enthaelt(m, p)) return 0
  let best = Infinity
  for (const poly of m) for (const r of poly) for (let i = 0; i < r.length; i++)
    best = Math.min(best, abstandStrecke(p, r[i], r[(i + 1) % r.length]))
  return best
}

function segAbstand(a: P, b: P, c: P, d: P): number {
  const d1 = kreuz(sub(b, a), sub(c, a)), d2 = kreuz(sub(b, a), sub(d, a))
  const d3 = kreuz(sub(d, c), sub(a, c)), d4 = kreuz(sub(d, c), sub(b, c))
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(abstandStrecke(a, c, d), abstandStrecke(b, c, d), abstandStrecke(c, a, b), abstandStrecke(d, a, b))
}

/** Abstand zweier Mehrfachpolygone (0 bei Überlappung) */
export function abstandMulti(a: Multi, b: Multi): number {
  for (const poly of a) for (const r of poly) if (r.length && enthaelt(b, r[0])) return 0
  for (const poly of b) for (const r of poly) if (r.length && enthaelt(a, r[0])) return 0
  let best = Infinity
  for (const pa of a) for (const ra of pa) for (let i = 0; i < ra.length; i++)
    for (const pb of b) for (const rb of pb) for (let k = 0; k < rb.length; k++)
      best = Math.min(best, segAbstand(ra[i], ra[(i + 1) % ra.length], rb[k], rb[(k + 1) % rb.length]))
  return best
}

/** Konvexe Hülle (Andrew) */
export function konvexeHuelle(pts: P[]): Ring {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (s.length < 3) return s
  const cr = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const unten: P[] = [], oben: P[] = []
  for (const p of s) {
    while (unten.length >= 2 && cr(unten[unten.length - 2], unten[unten.length - 1], p) <= 0) unten.pop()
    unten.push(p)
  }
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (oben.length >= 2 && cr(oben[oben.length - 2], oben[oben.length - 1], p) <= 0) oben.pop()
    oben.push(p)
  }
  oben.pop(); unten.pop()
  return [...unten, ...oben]
}

export function huelle(m: Multi): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of m) for (const r of poly) for (const p of r) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1])
  }
  return [x0, y0, x1, y1]
}

/** Polylinie im Abstand schritt verdichten (wie OGR Segmentize: floor(l/schritt - 0,01) Zwischenpunkte, gleichmässig) */
export function segmentieren(pts: P[], schritt: number): P[] {
  const out: P[] = []
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], l = dist(a, b)
    const n = l * l - schritt * schritt > 1e-5 * schritt * schritt ? Math.floor(l / schritt - 1e-2) + 1 : 1
    for (let i = 0; i < n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])
  }
  if (pts.length) out.push(pts[pts.length - 1])
  return out
}

/**
 * Linie (offene Polylinie) mit einem Polygon schneiden: die Teile innerhalb (Kanten an den Schnittpunkten geteilt,
 * Mitte des Stücks im Polygon). geschlossen: Ring, Stücke über den Anfang werden verbunden.
 */
export function linieImPolygon(linie: P[], poly: Poly, geschlossen = false): P[][] {
  const kanten: [P, P][] = []
  for (const r of poly) for (let i = 0; i < r.length; i++) kanten.push([r[i], r[(i + 1) % r.length]])
  const stuecke: P[][] = []
  let cur: P[] | null = null
  const n = linie.length - 1
  for (let k = 0; k < n; k++) {
    const a = linie[k], b = linie[k + 1], v = sub(b, a)
    const ts = [0, 1]
    for (const [c, d] of kanten) {
      const e = sub(d, c), den = kreuz(v, e)
      if (Math.abs(den) < 1e-12) continue
      const q = sub(c, a), t = kreuz(q, e) / den, u = kreuz(q, v) / den
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
    }
    ts.sort((x, y) => x - y)
    for (let i = 0; i < ts.length - 1; i++) {
      if (ts[i + 1] - ts[i] < 1e-9) continue
      const p0: P = [a[0] + v[0] * ts[i], a[1] + v[1] * ts[i]], p1: P = [a[0] + v[0] * ts[i + 1], a[1] + v[1] * ts[i + 1]]
      const mid: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      if (imPolygon(mid, poly)) {
        if (!cur) { cur = [p0]; stuecke.push(cur) }
        cur.push(p1)
      } else cur = null
    }
  }
  if (geschlossen && stuecke.length > 1) {
    const erst = stuecke[0], letzt = stuecke[stuecke.length - 1]
    if (dist(erst[0], linie[0]) < 1e-9 && dist(letzt[letzt.length - 1], linie[n]) < 1e-9) {
      stuecke[0] = [...letzt, ...erst.slice(1)]
      stuecke.pop()
    }
  }
  return stuecke
}

export function linienLaenge(pts: P[]): number {
  let s = 0
  for (let k = 1; k < pts.length; k++) s += dist(pts[k - 1], pts[k])
  return s
}

/** Abstand Punkt – Polylinie */
export function abstandLinie(p: P, pts: P[]): number {
  let best = Infinity
  for (let k = 0; k < pts.length - 1; k++) best = Math.min(best, abstandStrecke(p, pts[k], pts[k + 1]))
  return best
}
