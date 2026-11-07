import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tip = vi.hoisted(() => { const t = { setContent: vi.fn(() => t), setLatLng: vi.fn(() => t) }; return t })
vi.mock('leaflet', () => ({ default: { tooltip: () => tip } }))
import { HOVER_RUHE_MS, kartenHover, type HoverQuelle } from './hover'

function karte() {
  const griffe: Record<string, ((e?: unknown) => void)[]> = {}, offen = { an: false }
  const map = { on: (n: string, f: (e?: unknown) => void) => { (griffe[n] ??= []).push(f) }, off: vi.fn(), openTooltip: () => { offen.an = true }, closeTooltip: () => { offen.an = false },
    hasLayer: () => offen.an, distance: () => 5, containerPointToLatLng: () => ({}), getContainer: () => ({ classList: { add: vi.fn(), remove: vi.fn() } }) }
  const punkt = (x: number) => ({ x, add: () => ({}), distanceTo: (q: { x: number }) => Math.abs(x - q.x) })
  const ereignis = (x: number, ziel: unknown) => ({ originalEvent: { target: ziel }, latlng: { lat: 46.95, lng: 7.44 }, containerPoint: punkt(x) })
  return { map, offen, bewegen: (x = 0, ziel: unknown = null) => griffe.mousemove[0](ereignis(x, ziel)), klicken: () => griffe.click[0](), ruhen: () => vi.advanceTimersByTime(HOVER_RUHE_MS) }
}
const treffer = (schluessel: string | null): HoverQuelle => () => (schluessel ? { schluessel, html: schluessel } : null)

beforeEach(() => { vi.useFakeTimers(); tip.setContent.mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('kartenHover', () => {
  it('zeigt erst, wenn die Maus ruht', () => {
    const k = karte(); kartenHover(k.map as never, [treffer('a')])
    k.bewegen()
    vi.advanceTimersByTime(HOVER_RUHE_MS - 1)
    expect(k.offen.an).toBe(false)
    vi.advanceTimersByTime(1)
    expect(k.offen.an).toBe(true)
  })
  it('wartet bei jeder Bewegung von neuem', () => {
    const k = karte(); kartenHover(k.map as never, [treffer('a')])
    k.bewegen(0); vi.advanceTimersByTime(HOVER_RUHE_MS - 1); k.bewegen(20); vi.advanceTimersByTime(HOVER_RUHE_MS - 1)
    expect(k.offen.an).toBe(false)
  })
  it('schliesst, sobald sich die Maus bewegt, nicht aber beim Zittern der Hand', () => {
    const k = karte(); kartenHover(k.map as never, [treffer('a')])
    k.bewegen(0); k.ruhen(); k.bewegen(2)
    expect(k.offen.an).toBe(true)
    k.bewegen(30)
    expect(k.offen.an).toBe(false)
  })
  it('nimmt die erste Quelle mit Treffer', () => {
    const k = karte(); kartenHover(k.map as never, [treffer(null), treffer('b'), treffer('c')])
    k.bewegen(); k.ruhen()
    expect(tip.setContent).toHaveBeenCalledWith('b')
  })
  it('schliesst nach dem Klick und bleibt für dieses Objekt zu', () => {
    const k = karte(); kartenHover(k.map as never, [treffer('a')])
    k.bewegen(); k.ruhen(); k.klicken()
    expect(k.offen.an).toBe(false)
    k.bewegen(10); k.ruhen()
    expect(k.offen.an).toBe(false)
  })
  it('öffnet wieder, wenn der Zeiger das Objekt verlassen hat', () => {
    let wert: string | null = 'a'
    const k = karte(); kartenHover(k.map as never, [() => (wert ? { schluessel: wert, html: wert } : null)])
    k.bewegen(); k.ruhen(); k.klicken(); wert = null; k.bewegen(10); k.ruhen(); wert = 'a'; k.bewegen(20); k.ruhen()
    expect(k.offen.an).toBe(true)
  })
  it('lässt Markern und Bedienelementen ihren eigenen Tooltip', () => {
    const k = karte(); kartenHover(k.map as never, [treffer('a')])
    k.bewegen(0, { closest: () => ({}) }); k.ruhen()
    expect(k.offen.an).toBe(false)
  })
})
