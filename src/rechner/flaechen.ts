// ── AV-Bodenbedeckung als Rechengrundlage (fgs_sicht_pruefen.py: Fahrbahn, Inseln, Gebaeude, Flaechen) ──
//
// Anders als im Berner Projekt (Kanton-Bern-GeoPackage, Gebäude und Streifenenden nur Gemeinde Bern) gelten hier alle
// Flächen aus dem WFS (geodienste.ch), unabhängig von der Gemeinde.

import type { AvFlaeche } from '../daten/av'
import { type P, add, imPolygon, sub, kreuz } from '../geo'
import { type Poly, abstandPunkt } from './poly'

export const SEHNE_HALB = 22.0              // halbe Suchlänge der Senkrechten
export const SEHNE_MAX = 30.0               // längere Sehnen = Platz/Kreuzung -> verwerfen
export const INSEL_TREFFER_M = 1.2          // Verkehrsinsel so nah hinter dem Streifenende = Ende grenzt an eine Insel
export const INSELRAND_M = 0.3              // Fahrbahnrand so nah an einer Verkehrsinsel = Inselrand

export interface Teil { poly: Poly; env: [number, number, number, number]; art: string }

function env(poly: Poly): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of poly[0]) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  return [x0, y0, x1, y1]
}

/** Ringe ohne Schlusspunkt, nur 2D */
function sauber(ringe: P[][]): Poly {
  return ringe.map(r => {
    const z = r.map(p => [p[0], p[1]] as P)
    if (z.length > 1 && z[0][0] === z[z.length - 1][0] && z[0][1] === z[z.length - 1][1]) z.pop()
    return z
  }).filter(r => r.length >= 3)
}

const ZELLE = 20
class Raster {
  zellen = new Map<string, Teil[]>()
  teile: Teil[] = []
  constructor(av: AvFlaeche[], arten: string[]) {
    for (const f of av) if (arten.includes(f.art)) this.hinzu(f.ringe, f.art)
  }
  private hinzu(ringe: P[][], art: string): void {
    const poly = sauber(ringe)
    if (!poly.length) return
    const t: Teil = { poly, env: env(poly), art }
    this.teile.push(t)
    const [x0, y0, x1, y1] = t.env
    for (let gx = Math.floor(x0 / ZELLE); gx <= Math.floor(x1 / ZELLE); gx++)
      for (let gy = Math.floor(y0 / ZELLE); gy <= Math.floor(y1 / ZELLE); gy++) {
        const k = `${gx},${gy}`
        if (!this.zellen.has(k)) this.zellen.set(k, [])
        this.zellen.get(k)!.push(t)
      }
  }
  /** Kopie mit zusätzlichen Flächen (je ein Ring) der Art art; das Original bleibt unverändert */
  mit(ringe: P[][], art: string): Raster {
    const r = new Raster([], [])
    r.teile = [...this.teile]
    for (const [k, v] of this.zellen) r.zellen.set(k, [...v])
    for (const ring of ringe) r.hinzu([ring], art)
    return r
  }
  bei(p: P): Teil[] { return this.zellen.get(`${Math.floor(p[0] / ZELLE)},${Math.floor(p[1] / ZELLE)}`) ?? [] }
  imUmkreis(p: P, r: number): Teil[] {
    const s = new Set<Teil>()
    for (let gx = Math.floor((p[0] - r) / ZELLE); gx <= Math.floor((p[0] + r) / ZELLE); gx++)
      for (let gy = Math.floor((p[1] - r) / ZELLE); gy <= Math.floor((p[1] + r) / ZELLE); gy++)
        for (const t of this.zellen.get(`${gx},${gy}`) ?? []) s.add(t)
    return [...s]
  }
  inBox(x0: number, y0: number, x1: number, y1: number): Teil[] {
    return this.teile.filter(t => !(t.env[2] < x0 || t.env[0] > x1 || t.env[3] < y0 || t.env[1] > y1))
  }
  enthaelt(p: P): boolean {
    return this.bei(p).some(t => p[0] >= t.env[0] && p[0] <= t.env[2] && p[1] >= t.env[1] && p[1] <= t.env[3] && imPolygon(p, t.poly))
  }
}

/** Intervalle [t0, t1] der Geraden p + t·r (|t| ≤ halb) innerhalb des Polygons (OGR Intersection einer Linie) */
export function intervalleImPolygon(p: P, r: P, halb: number, poly: Poly): [number, number][] {
  const ts = [-halb, halb]
  for (const ring of poly) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], e = sub(b, a)
    const den = kreuz(r, e)
    if (Math.abs(den) < 1e-12) continue
    const q = sub(a, p), t = kreuz(q, e) / den, u = kreuz(q, r) / den
    if (u >= 0 && u <= 1 && t > -halb && t < halb) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-9) continue
    const m = (ts[i] + ts[i + 1]) / 2
    if (imPolygon(add(p, r, m), poly)) {
      const l = out[out.length - 1]
      if (l && Math.abs(l[1] - ts[i]) < 1e-9) l[1] = ts[i + 1]
      else out.push([ts[i], ts[i + 1]])
    }
  }
  return out
}

/** fgs_sicht_pruefen.Fahrbahn: AV Strasse_Weg */
export class Fahrbahn {
  r: Raster
  constructor(av: AvFlaeche[]) { this.r = new Raster(av, ['Strasse_Weg']) }
  get polys(): Teil[] { return this.r.teile }
  enthaelt(p: P): boolean { return this.r.enthaelt(p) }

  /** Fahrbahn.sehne: Querschnitt durch p in Richtung r (rechts) -> [abstand_rechts, abstand_links] oder null */
  sehne(p: P, r: P): [number, number] | null {
    const a = add(p, r, -SEHNE_HALB), b = add(p, r, SEHNE_HALB)
    const xmin = Math.min(a[0], b[0]), xmax = Math.max(a[0], b[0]), ymin = Math.min(a[1], b[1]), ymax = Math.max(a[1], b[1])
    const iv: [number, number][] = []
    for (const t of this.r.imUmkreis(p, SEHNE_HALB)) {
      if (t.env[2] < xmin || t.env[0] > xmax || t.env[3] < ymin || t.env[1] > ymax) continue
      iv.push(...intervalleImPolygon(p, r, SEHNE_HALB, t.poly))
    }
    if (!iv.length) return null
    iv.sort((x, y) => x[0] - y[0] || x[1] - y[1])
    const merged: [number, number][] = [[iv[0][0], iv[0][1]]]
    for (const [lo, hi] of iv.slice(1)) {
      const m = merged[merged.length - 1]
      if (lo <= m[1] + 0.05) m[1] = Math.max(m[1], hi)
      else merged.push([lo, hi])
    }
    let best: [number, number, number] | null = null
    for (const [lo, hi] of merged) {
      const d = lo <= 0 && 0 <= hi ? 0 : Math.min(Math.abs(lo), Math.abs(hi))
      if (d <= 1.0 && (best === null || d < best[0])) best = [d, lo, hi]
    }
    if (best === null || best[2] - best[1] > SEHNE_MAX) return null
    return [best[2], -best[1]]
  }

}

/** fgs_sicht_pruefen.Inseln: AV Verkehrsinsel */
export class Inseln {
  r: Raster
  constructor(av: AvFlaeche[]) { this.r = new Raster(av, ['Verkehrsinsel']) }
  /** Kopie mit zusätzlichen Inseln (angenommen bzw. von Hand, nicht in der AV) */
  mit(ringe: P[][]): Inseln {
    const x = new Inseln([])
    x.r = this.r.mit(ringe, 'Verkehrsinsel')
    return x
  }
  /** Inseln.an: Insel höchstens radius von p */
  an(p: P, radius = INSEL_TREFFER_M): boolean {
    return this.r.imUmkreis(p, radius).some(t => abstandPunkt([t.poly], p) <= radius)
  }
  enthaelt(p: P): boolean { return this.r.enthaelt(p) }
  /** Inseln.ohne_inselrand: Punkte einer verdichteten Linie, die nicht höchstens INSELRAND_M an einer Insel liegen -> Stücke */
  ohneInselrand(pts: P[], p: P, radius: number): P[][] {
    const nah = this.r.imUmkreis(p, radius)
    if (!nah.length) return [pts]
    const stuecke: P[][] = []
    let cur: P[] | null = null
    for (const q of pts) {
      const weg = nah.some(t => abstandPunkt([t.poly], q) <= INSELRAND_M)
      if (weg) cur = null
      else { if (!cur) { cur = []; stuecke.push(cur) } cur.push(q) }
    }
    return stuecke
  }
}

/** fgs_sicht_pruefen.Gebaeude: AV Gebaeude */
export class Gebaeude {
  r: Raster
  constructor(av: AvFlaeche[]) { this.r = new Raster(av, ['Gebaeude']) }
  kandidaten(box: [number, number, number, number]): Teil[] { return this.r.inBox(...box) }
  enthaelt(p: P): boolean { return this.r.enthaelt(p) }
}

/** fgs_sicht_pruefen.Flaechen: Art der Fläche unter p */
export class Flaechen {
  r: Raster
  constructor(av: AvFlaeche[], arten: string[]) { this.r = new Raster(av, arten) }
  /** Kopie mit zusätzlichen Flächen der Art art (z. B. angenommene Inseln) */
  mit(ringe: P[][], art: string): Flaechen {
    const x = new Flaechen([], [])
    x.r = this.r.mit(ringe, art)
    return x
  }
  art(p: P): string | null {
    const t = this.r.bei(p).find(x => imPolygon(p, x.poly))
    return t ? t.art : null
  }
}
