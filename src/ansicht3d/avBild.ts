// ── 3D-Ansicht: AV-Flächen als Bildebene (Kacheln, im Browser aus den Vektorflächen gezeichnet; ohne Cesium) ──
//
// Die AV-Flächen lagen zuerst als GroundPrimitive (Schattenvolumen) auf dem Gelände; je nach Kamera fielen dabei ganze Flächen weg,
// etwa die Strassenfläche an der Laubeggstrasse in Bern in der Übersicht, obwohl die Daten lückenlos sind. Als Bildebene liegen sie wie
// Karte und Luftbild auf dem Gelände und sehen aus jedem Blickwinkel gleich aus. Cesium fragt die Kacheln (GeographicTilingScheme) nach
// Bedarf ab; cesiumSzene.ts zeichnet jede Kachel mit kachelZeichnen aus den Flächen, deren Umriss sie berührt.

import type { LL } from './modell'

/** Grenzen in Grad */
export interface Grad { west: number; sued: number; ost: number; nord: number }
export interface AvBildFlaeche {
  ringe: LL[][]
  /** CSS-Farbe der Füllung */
  fuellung: string
  /** Rand in der Füllfarbe nachziehen: schliesst die hellen Haarlinien, die die Kantenglättung zwischen deckenden Nachbarflächen lässt */
  rand: boolean
}
export interface AvBildTeil { f: AvBildFlaeche; g: Grad }

/** Kachelgrösse [px] */
export const KACHEL_PX = 256
/** feinste Stufe: rund 4 cm je Bildpunkt (Stufe 21 = 180°/2²¹ je Kachel) */
export const AV_MAX_STUFE = 21

function rgb(css: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim())
  if (!m) throw new Error(`Farbe nicht lesbar: ${css}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Füllfarbe einer AV-Fläche: über dem Luftbild durchscheinend (Deckkraft × luftbildAnteil), sonst deckend als Mischung aus Grundton und
 * Flächenfarbe im Verhältnis der Deckkraft, damit der Ton derselbe bleibt wie früher auf dem neutralen Grund.
 */
export function avFuellung(farbe: string, deckkraft: number, grund: string, luftbild: boolean, luftbildAnteil: number): string {
  const f = rgb(farbe)
  if (luftbild) return `rgba(${f[0]}, ${f[1]}, ${f[2]}, ${+(deckkraft * luftbildAnteil).toFixed(3)})`
  const g = rgb(grund)
  const m = f.map((v, i) => Math.round(g[i] + (v - g[i]) * deckkraft))
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`
}

/** Grenzen des äusseren Rings (Löcher liegen darin) */
export function grenzen(ringe: readonly LL[][]): Grad {
  const g = { west: Infinity, sued: Infinity, ost: -Infinity, nord: -Infinity }
  for (const [lat, lon] of ringe[0] ?? []) {
    if (lon < g.west) g.west = lon
    if (lon > g.ost) g.ost = lon
    if (lat < g.sued) g.sued = lat
    if (lat > g.nord) g.nord = lat
  }
  return g
}

/** Grenzen aller Teile; null ohne Teile */
export function gesamtGrenzen(teile: readonly AvBildTeil[]): Grad | null {
  if (!teile.length) return null
  return teile.reduce<Grad>((a, { g }) => ({ west: Math.min(a.west, g.west), sued: Math.min(a.sued, g.sued), ost: Math.max(a.ost, g.ost),
    nord: Math.max(a.nord, g.nord) }), { west: Infinity, sued: Infinity, ost: -Infinity, nord: -Infinity })
}

const beruehrt = (a: Grad, b: Grad) => a.west <= b.ost && a.ost >= b.west && a.sued <= b.nord && a.nord >= b.sued

type Zeichner = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke'> &
  { fillStyle: CanvasRenderingContext2D['fillStyle']; strokeStyle: CanvasRenderingContext2D['strokeStyle']; lineWidth: number; lineJoin: CanvasLineJoin }

/** Eine Kachel (Grenzen k in Grad, groesse × groesse Bildpunkte) aus den Flächen zeichnen, die sie berühren; gibt deren Zahl zurück */
export function kachelZeichnen(ctx: Zeichner, teile: readonly AvBildTeil[], k: Grad, groesse = KACHEL_PX): number {
  const sx = groesse / (k.ost - k.west), sy = groesse / (k.nord - k.sued)
  let n = 0
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  for (const { f, g } of teile) {
    if (!beruehrt(g, k)) continue
    ctx.beginPath()
    for (const r of f.ringe) {
      r.forEach(([lat, lon], i) => {
        const x = (lon - k.west) * sx, y = (k.nord - lat) * sy
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
    ctx.fillStyle = f.fuellung
    ctx.fill('evenodd')
    if (f.rand) { ctx.strokeStyle = f.fuellung; ctx.stroke() }
    n++
  }
  return n
}

/** Schlüssel, an dem die Szene erkennt, ob die Bildebene neu gezeichnet werden muss (gleiche Flächen und Farben → gleiche Ebene) */
export function avSchluessel(flaechen: readonly AvBildFlaeche[]): string {
  // Vollständiger geordneter Schlüssel vermeidet auch Hash-Kollisionen bei gegenläufigen Änderungen.
  return JSON.stringify(flaechen.map(f => [f.ringe, f.fuellung, f.rand]))
}
