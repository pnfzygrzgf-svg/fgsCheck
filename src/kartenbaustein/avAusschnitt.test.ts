import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AV_MAX_RADIUS_M, AV_RAND_M, avAusschnittLader, avQuadrat, type AvBox } from './avAusschnitt'

const box = (e: number, n: number, halb = 200): AvBox => [e - halb, n - halb, e + halb, n + halb]
const lader = (laden = vi.fn(async () => 'daten')) => {
  const fertig = vi.fn(), fehler = vi.fn(), zuGross = vi.fn(), zaehlen = vi.fn()
  return { laden, fertig, fehler, zuGross, zaehlen, l: avAusschnittLader({ laden, fertig, fehler, zuGross, zaehlen, abstandMs: 6000 }) }
}

describe('AV im Kartenausschnitt', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('nimmt ein Quadrat um den Ausschnitt mit Rand, ein zu grosses gar nicht', () => {
    expect(avQuadrat([0, 0, 600, 400])).toEqual({ e: 300, n: 200, r: 300 + AV_RAND_M })
    expect(avQuadrat([0, 0, 2 * AV_MAX_RADIUS_M, 10])).toBeNull()
  })

  it('fragt einen abgedeckten Ausschnitt nicht noch einmal ab', async () => {
    const x = lader()
    x.l.wunsch(box(1000, 1000)); await vi.advanceTimersByTimeAsync(0)
    expect(x.laden).toHaveBeenCalledTimes(1); expect(x.fertig).toHaveBeenCalledWith('daten')
    await vi.advanceTimersByTimeAsync(10000)
    x.l.wunsch(box(1050, 1000)); await vi.advanceTimersByTimeAsync(10000)
    expect(x.laden).toHaveBeenCalledTimes(1)
  })

  it('hält den Abstand zwischen den Abfragen und nimmt die letzte Bitte', async () => {
    const x = lader()
    x.l.wunsch(box(1000, 1000)); await vi.advanceTimersByTimeAsync(100)
    x.l.wunsch(box(5000, 5000)); x.l.wunsch(box(9000, 9000))
    await vi.advanceTimersByTimeAsync(5000)
    expect(x.laden).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(x.laden).toHaveBeenCalledTimes(2)
    expect(x.laden.mock.calls[1]).toMatchObject([{ e: 9000, n: 9000 }])
  })

  it('meldet einen zu grossen Ausschnitt und lädt nichts', async () => {
    const x = lader()
    x.l.wunsch(box(0, 0, 2000)); await vi.advanceTimersByTimeAsync(0)
    expect(x.zuGross).toHaveBeenLastCalledWith(true); expect(x.laden).not.toHaveBeenCalled()
    x.l.wunsch(box(0, 0)); await vi.advanceTimersByTimeAsync(0)
    expect(x.zuGross).toHaveBeenLastCalledWith(false); expect(x.laden).toHaveBeenCalledTimes(1)
  })

  it('verwirft eine späte Antwort nach dem Leeren und lädt danach wieder', async () => {
    let antwort!: (s: string) => void
    const x = lader(vi.fn(() => new Promise<string>(r => { antwort = r })))
    x.l.wunsch(box(1000, 1000)); await vi.advanceTimersByTimeAsync(0)
    x.l.leeren(); antwort('alt'); await vi.advanceTimersByTimeAsync(0)
    expect(x.fertig).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(6000)
    x.l.wunsch(box(1000, 1000)); await vi.advanceTimersByTimeAsync(0)
    expect(x.laden).toHaveBeenCalledTimes(2)
  })

  it('merkt einen Fehlschlag nicht als geladen', async () => {
    const x = lader(vi.fn(async () => { throw new Error('weg') }))
    x.l.wunsch(box(1000, 1000)); await vi.advanceTimersByTimeAsync(0)
    expect(x.fehler).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6000)
    x.l.wunsch(box(1000, 1000)); await vi.advanceTimersByTimeAsync(0)
    expect(x.laden).toHaveBeenCalledTimes(2)
    expect(x.zaehlen.mock.calls.flat().reduce((s: number, d: number) => s + d, 0)).toBe(0)
  })
})
