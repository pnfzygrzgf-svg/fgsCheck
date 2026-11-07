import { describe, expect, it, vi } from 'vitest'
import leafletQuelle from 'leaflet/dist/leaflet-src.js?raw'

// Leaflet braucht beim Import ein Browserfenster; geprüft wird hier nur, was dieses Modul selbst tut
const leaflet = vi.hoisted(() => ({
  urspruenglich: vi.fn(),
  gesetzt: [] as unknown[],
}))
vi.mock('leaflet', () => ({ default: {
  Tooltip: { prototype: { _setPosition: leaflet.urspruenglich } },
  DomUtil: { getPosition: () => ({ add: (d: number[]) => d }), setPosition: (_: unknown, p: unknown) => leaflet.gesetzt.push(p) },
} }))
import L from 'leaflet'
import { randVerschiebung } from './tooltipRand'

const feld = { left: 100, right: 900, top: 50, bottom: 650 }
const kasten = (left: number, top: number, b = 280, h = 80) => ({ left, top, right: left + b, bottom: top + h })

describe('randVerschiebung', () => {
  it('lässt einen Tooltip in der Karte stehen', () => {
    expect(randVerschiebung(kasten(300, 200), feld)).toEqual([0, 0])
  })
  it('schiebt an allen vier Rändern in die Karte', () => {
    expect(randVerschiebung(kasten(0, 200), feld)).toEqual([104, 0])
    expect(randVerschiebung(kasten(800, 200), feld)).toEqual([-184, 0])
    expect(randVerschiebung(kasten(300, 0), feld)).toEqual([0, 54])
    expect(randVerschiebung(kasten(300, 600), feld)).toEqual([0, -34])
  })
  it('schiebt in einer Ecke in beide Richtungen', () => {
    expect(randVerschiebung(kasten(0, 0), feld)).toEqual([104, 54])
  })
})

describe('Tooltip von Leaflet', () => {
  const tip = (permanent: boolean, rahmen: ReturnType<typeof kasten>) => {
    const toggle = vi.fn()
    return { toggle, objekt: { options: { permanent }, _map: { getContainer: () => ({ getBoundingClientRect: () => feld }) },
      _container: { getBoundingClientRect: () => rahmen, classList: { toggle } } } }
  }
  const setzen = (L.Tooltip.prototype as unknown as { _setPosition(this: unknown, p: unknown): void })._setPosition
  it('verschiebt nach der Positionierung durch Leaflet und blendet den Pfeil aus', () => {
    leaflet.gesetzt.length = 0
    const t = tip(false, kasten(0, 200))
    setzen.call(t.objekt, 'pos')
    expect(leaflet.urspruenglich).toHaveBeenCalledWith('pos')
    expect(leaflet.gesetzt).toEqual([[104, 0]])
    expect(t.toggle).toHaveBeenCalledWith('tooltip-verschoben', true)
  })
  it('lässt feste Beschriftungen beim Objekt', () => {
    leaflet.gesetzt.length = 0
    setzen.call(tip(true, kasten(0, 200)).objekt, 'pos')
    expect(leaflet.gesetzt).toEqual([])
  })
  it('stützt sich auf eine Funktion, die es in Leaflet gibt', () => {
    expect(leafletQuelle).toMatch(/var Tooltip = DivOverlay\.extend\(\{[\s\S]*?_setPosition: function \(pos\)/)
  })
})
