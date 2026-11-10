// Tests 3D-Ansicht, AV-Flächen als Bildebene (avBild.ts): Farben, Grenzen, Kachelzeichnen
import { describe, expect, it } from 'vitest'
import { avFuellung, avSchluessel, gesamtGrenzen, grenzen, kachelZeichnen, type AvBildFlaeche, type AvBildTeil } from './avBild'
import type { LL } from './modell'

/** Zeichenfläche, die nur mitschreibt */
function protokoll() {
  const log: string[] = []
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern, strokeStyle: '' as string | CanvasGradient | CanvasPattern, lineWidth: 0, lineJoin: 'miter' as CanvasLineJoin,
    beginPath: () => { log.push('begin') }, closePath: () => { log.push('close') },
    moveTo: (x: number, y: number) => { log.push(`M${x},${y}`) }, lineTo: (x: number, y: number) => { log.push(`L${x},${y}`) },
    fill: (r?: CanvasFillRule | Path2D) => { log.push(`fill:${String(r)}:${String(ctx.fillStyle)}`) },
    stroke: () => { log.push(`stroke:${String(ctx.strokeStyle)}`) },
  }
  return { ctx: ctx as unknown as Parameters<typeof kachelZeichnen>[0], log }
}
const quadrat = (sued: number, west: number, d: number): LL[] => [[sued, west], [sued, west + d], [sued + d, west + d], [sued + d, west]]
const teil = (f: AvBildFlaeche): AvBildTeil => ({ f, g: grenzen(f.ringe) })

describe('avFuellung', () => {
  it('ohne Luftbild deckend, gemischt mit dem Grundton im Verhältnis der Deckkraft', () => {
    expect(avFuellung('#65a30d', 0.45, '#d6d3cb', false, 0.3)).toBe('rgb(163, 189, 118)')
    expect(avFuellung('#000000', 1, '#ffffff', false, 0.3)).toBe('rgb(0, 0, 0)')
    expect(avFuellung('#000000', 0, '#ffffff', false, 0.3)).toBe('rgb(255, 255, 255)')
  })
  it('über dem Luftbild durchscheinend mit Deckkraft × Anteil', () => {
    expect(avFuellung('#6e6e6e', 0.9, '#d6d3cb', true, 0.3)).toBe('rgba(110, 110, 110, 0.27)')
  })
  it('unlesbare Farbe wird gemeldet statt still falsch gezeichnet', () => {
    expect(() => avFuellung('grün', 0.5, '#ffffff', false, 0.3)).toThrow(/nicht lesbar/)
  })
})

describe('Grenzen', () => {
  it('äusserer Ring bestimmt die Grenzen, Löcher nicht', () => {
    expect(grenzen([quadrat(46, 7, 0.01), quadrat(46.004, 7.004, 0.002)])).toEqual({ west: 7, sued: 46, ost: 7.01, nord: 46.01 })
  })
  it('Gesamtgrenzen über alle Teile; ohne Teile null', () => {
    const a = teil({ ringe: [quadrat(46, 7, 0.01)], fuellung: '#000', rand: false })
    const b = teil({ ringe: [quadrat(46.02, 7.03, 0.01)], fuellung: '#000', rand: false })
    expect(gesamtGrenzen([a, b])).toEqual({ west: 7, sued: 46, ost: 7.04, nord: 46.03 })
    expect(gesamtGrenzen([])).toBeNull()
  })
})

describe('kachelZeichnen', () => {
  const k = { west: 7, sued: 46, ost: 7.01, nord: 46.01 }
  it('rechnet Grad in Bildpunkte (Norden oben) und füllt mit Löchern (evenodd)', () => {
    const { ctx, log } = protokoll()
    const n = kachelZeichnen(ctx, [teil({ ringe: [quadrat(46, 7, 0.01), quadrat(46.0025, 7.0025, 0.005)], fuellung: 'rgb(1, 2, 3)', rand: false })], k, 256)
    expect(n).toBe(1)
    expect(log.slice(0, 6)).toEqual(['begin', 'M0,256', 'L256,256', 'L256,0', 'L0,0', 'close'])
    const [x, y] = log[6].slice(1).split(',').map(Number)
    expect(log[6][0]).toBe('M'); expect(x).toBeCloseTo(64, 6); expect(y).toBeCloseTo(192, 6)
    expect(log).toContain('fill:evenodd:rgb(1, 2, 3)')
    expect(log.some(l => l.startsWith('stroke'))).toBe(false)
  })
  it('zieht deckende Flächen mit dem Rand in der Füllfarbe nach', () => {
    const { ctx, log } = protokoll()
    kachelZeichnen(ctx, [teil({ ringe: [quadrat(46, 7, 0.005)], fuellung: 'rgb(9, 9, 9)', rand: true })], k)
    expect(log.at(-1)).toBe('stroke:rgb(9, 9, 9)')
  })
  it('lässt Flächen ausserhalb der Kachel weg', () => {
    const { ctx, log } = protokoll()
    expect(kachelZeichnen(ctx, [teil({ ringe: [quadrat(46.5, 7.5, 0.01)], fuellung: '#000', rand: false })], k)).toBe(0)
    expect(log).toEqual([])
  })
})

describe('avSchluessel', () => {
  it('ändert sich mit Form und Farbe, nicht bei gleicher Eingabe', () => {
    const f = { ringe: [quadrat(46, 7, 0.01)], fuellung: 'rgb(1, 2, 3)', rand: true }
    expect(avSchluessel([f])).toBe(avSchluessel([{ ...f, ringe: [quadrat(46, 7, 0.01)] }]))
    expect(avSchluessel([f])).not.toBe(avSchluessel([{ ...f, fuellung: 'rgba(1, 2, 3, 0.3)', rand: false }]))
    expect(avSchluessel([f])).not.toBe(avSchluessel([{ ...f, ringe: [quadrat(46, 7, 0.011)] }]))
  })
})

it('AV-Schlüssel unterscheidet gegenläufige Eckverschiebungen und Ringreihenfolgen', () => {
  const a: AvBildFlaeche = { ringe: [[[46, 7], [46, 7.01], [46.01, 7.01], [46.01, 7]]], fuellung: 'rgb(1,2,3)', rand: true }
  const b: AvBildFlaeche = { ...a, ringe: [[[46, 7], [46, 7.011], [46.01, 7.01], [46.01, 6.999]]] }
  expect(avSchluessel([a])).not.toBe(avSchluessel([b]))
  expect(avSchluessel([a])).not.toBe(avSchluessel([{ ...a, ringe: [a.ringe[0].slice().reverse()] }]))
})
