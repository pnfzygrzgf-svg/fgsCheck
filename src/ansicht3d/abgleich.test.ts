import { describe, expect, it, vi } from 'vitest'
import { ansichtAbgleich, type AnzeigeOptionen } from './abgleich'
import type { Szene } from './cesiumSzene'
import type { Szene3D } from './modell'

const modell: Szene3D = { flaechen: [], linien: [], waende: [], koerper: [], sichtlinien: [], kamera: { fahrzeug: null, uebersicht: null }, bruecken: [], leer: true, legende: '' }
const o: AnzeigeOptionen = { gebaeude: false, baeume: true, bruecken: false, fahrzeuge: false, personen: false, luftbild: true, schatten: false, pruefung: true }
function szene(): Szene {
  return { zeigen: vi.fn().mockResolvedValue(undefined), kamera: vi.fn().mockResolvedValue('uebersicht'),
    gebaeude: vi.fn().mockResolvedValue(undefined), baeume: vi.fn().mockResolvedValue(undefined), bruecken: vi.fn().mockResolvedValue(undefined),
    kategorie: vi.fn(), luftbild: vi.fn(), schatten: vi.fn(), pruefung: vi.fn(), groesse: vi.fn(), zerstoeren: vi.fn() }
}
function spaeter<T>() {
  let resolve!: (t: T) => void
  const promise = new Promise<T>(ja => { resolve = ja })
  return { promise, resolve }
}
describe('Abgleich nach Öffnen und Bedienung', () => {
  it('wendet beim Bereitwerden sämtliche aktuellen Wünsche an und bestätigt tatsächlichen Kameramodus', async () => {
    const s = szene(), a = ansichtAbgleich()
    expect(await a.anwenden(s, modell, o, 'fahrzeug')).toBe('uebersicht')
    expect(s.gebaeude).toHaveBeenCalledWith(false); expect(s.baeume).toHaveBeenCalledWith(true)
    expect(s.bruecken).toHaveBeenCalledWith(false); expect(s.kategorie).toHaveBeenCalledWith('personen', false)
    expect(s.kategorie).toHaveBeenCalledWith('fahrzeuge', false); expect(s.luftbild).toHaveBeenCalledWith(true)
    expect(s.schatten).toHaveBeenCalledWith(false); expect(s.pruefung).toHaveBeenCalledWith(true)
    await a.anwenden(s, modell, o, 'uebersicht')
    expect(s.kamera).toHaveBeenCalledTimes(1)
  })
  it('erneuter Klick auf Übersicht setzt die Kamera auch im bereits gewählten Modus zurück', async () => {
    const s = szene(), a = ansichtAbgleich()
    await a.anwenden(s, modell, o, 'uebersicht', 0)
    await a.anwenden(s, modell, o, 'uebersicht', 1)
    expect(s.kamera).toHaveBeenCalledTimes(2)
    expect(s.zeigen).toHaveBeenCalledTimes(1)
  })
  it('veralteter Ladeabschluss setzt weder Geometrie noch Kamera', async () => {
    const s = szene(), a = ansichtAbgleich(), warten = spaeter<void>()
    vi.mocked(s.baeume).mockReturnValueOnce(warten.promise)
    const alt = a.anwenden(s, modell, o, 'fahrzeug')
    await a.anwenden(s, modell, { ...o, baeume: false }, 'uebersicht')
    warten.resolve(); expect(await alt).toBeNull()
    expect(s.zeigen).toHaveBeenCalledTimes(1); expect(s.kamera).toHaveBeenCalledTimes(1)
  })
  it('alte Kameraantwort überschreibt keinen neueren Modus', async () => {
    const s = szene(), a = ansichtAbgleich(), warten = spaeter<'fahrzeug'>()
    vi.mocked(s.kamera).mockReturnValueOnce(warten.promise).mockResolvedValue('frei')
    const alt = a.anwenden(s, modell, o, 'fahrzeug')
    await vi.waitFor(() => expect(s.kamera).toHaveBeenCalledTimes(1))
    expect(await a.anwenden(s, modell, o, 'frei')).toBe('frei')
    warten.resolve('fahrzeug'); expect(await alt).toBeNull()
  })
  it('Geometriefehler werden weitergereicht; nächster gültiger Abgleich funktioniert', async () => {
    const s = szene(), a = ansichtAbgleich()
    vi.mocked(s.zeigen).mockRejectedValueOnce(new Error('Geometrie'))
    await expect(a.anwenden(s, modell, o, 'uebersicht')).rejects.toThrow('Geometrie')
    await expect(a.anwenden(s, modell, o, 'uebersicht')).resolves.toBe('uebersicht')
  })
})
