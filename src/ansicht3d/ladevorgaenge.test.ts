import { describe, expect, it, vi } from 'vitest'
import { anfragenFolge, ebenenLader, mitEreignispause } from './ladevorgaenge'
export function spaeter<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void
  const promise = new Promise<T>((ja, nein) => { resolve = ja; reject = nein })
  return { promise, resolve, reject }
}
describe('Ladevorgänge', () => {
  it('ein–aus–ein lädt genau einmal; der letzte Wunsch entscheidet', async () => {
    const abruf = spaeter<object>(), laden = vi.fn(() => abruf.promise), anwenden = vi.fn()
    const setzen = ebenenLader(laden, anwenden, vi.fn(), () => false)
    const a = setzen(true), b = setzen(false), c = setzen(true), d = setzen(false)
    abruf.resolve({})
    await Promise.all([a, b, c, d])
    expect(laden).toHaveBeenCalledTimes(1)
    expect(anwenden).toHaveBeenLastCalledWith(expect.anything(), false)
    await setzen(true)
    expect(anwenden).toHaveBeenLastCalledWith(expect.anything(), true)
    expect(laden).toHaveBeenCalledTimes(1)
  })
  it('nach dem Schliessen geladene Ressourcen entsorgen', async () => {
    const abruf = spaeter<object>(), verwerfen = vi.fn(), anwenden = vi.fn()
    let tot = false
    const setzen = ebenenLader(() => abruf.promise, anwenden, verwerfen, () => tot)
    const p = setzen(true); tot = true; const objekt = {}; abruf.resolve(objekt); await p
    expect(verwerfen).toHaveBeenCalledWith(objekt); expect(anwenden).not.toHaveBeenCalled()
  })
  it('ein Ladefehler erlaubt einen späteren neuen Versuch', async () => {
    const laden = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({})
    const setzen = ebenenLader(laden, vi.fn(), vi.fn(), () => false)
    await expect(setzen(true)).rejects.toThrow('offline'); await setzen(true)
    expect(laden).toHaveBeenCalledTimes(2)
  })
  it('jede neue Anfrage invalidiert alte, auch ohne neuen Abruf', () => {
    const f = anfragenFolge(), bern = f.beginnen()
    f.beginnen(); expect(f.aktuell(bern)).toBe(false)
  })
  it('Entity-Ereignisse werden auch bei einem Aufbaufehler fortgesetzt', () => {
    const e = { suspendEvents: vi.fn(), resumeEvents: vi.fn() }
    expect(() => mitEreignispause(e, () => { throw new Error('Geometrie') })).toThrow('Geometrie')
    expect(e.resumeEvents).toHaveBeenCalledTimes(1)
    expect(mitEreignispause(e, () => 42)).toBe(42)
  })
})
