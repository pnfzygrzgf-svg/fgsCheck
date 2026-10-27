// Tests Erkennungsdistanz auf der Karte (27.10.2026): Band entlang der Fahrlinie, Soll, Text, verdeckendes Hindernis. Künstliche Werte.
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import type { Erkennung } from './rechner/erkennung'
import { abschnitt, erkennungBaender, erkennungSoll } from './erkennungKarte'

const z = (e: Erkennung | undefined, extra: Partial<ZufahrtErgebnis> = {}): ZufahrtErgebnis => ({
  fgsId: 'f1', zufahrt: 'n', art: 'beide', sichtweite: 24, sichtpunkte: [[0, 1], [0, 25]] as P[], spur: [[0, 0], [0, 30]] as P[],
  ...(e ? { erkennungM: e } : {}), ...extra } as ZufahrtErgebnis)
const s = (zs: ZufahrtErgebnis[], tue = false) => ({ zufahrten: zs, ...(tue ? { trottoirueberfahrt: true } : {}) } as unknown as StreifenErgebnis)
const nah = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9

describe('Erkennungsdistanz auf der Karte', () => {
  it('Soll: doppelte Sichtweite, höchstens 110 m', () => {
    expect(erkennungSoll({ sichtweite: 24 })).toBe(48)
    expect(erkennungSoll({ sichtweite: 70 })).toBe(110)
  })
  it('Abschnitt entlang der Linie, über ihr Ende hinaus gerade weiter', () => {
    const a = abschnitt([[0, 0], [0, 10], [10, 10]], 5, 25)
    expect(a.map(p => p.map(x => Math.round(x * 1e6) / 1e6))).toEqual([[0, 5], [0, 10], [10, 10], [15, 10]])
    expect(abschnitt([[0, 0], [0, 10]], 3, 3)).toEqual([])
  })
  it('verdeckt vor dem Soll: grün bis 33 m, rot bis 48 m, Text mit dem Hindernis', () => {
    const [b] = erkennungBaender(s([z({ wert: 33, bis: 'verdeckt', hindernis: { klasse: 'auto', name: 'Parkfeld', id: 'h1' } })]))
    expect(nah(b.gruen[0], [0, 1]) && nah(b.gruen[b.gruen.length - 1], [0, 34])).toBe(true)
    expect(b.fehlt!.art).toBe('verdeckt')
    expect(nah(b.fehlt!.linie[0], [0, 34]) && nah(b.fehlt!.linie[b.fehlt!.linie.length - 1], [0, 49])).toBe(true)
    expect(b.text).toBe('Erkennungsdistanz: Markierung ab 33 m sichtbar, Soll 48 m; verdeckt durch Auto-Parkfeld')
    expect(b.hindernisId).toBe('h1')
  })
  it('erfüllt: nur grün; Fahrlinie endet vorher: grau bis zum Soll', () => {
    const [ok] = erkennungBaender(s([z({ wert: 110, bis: 'frei' })]))
    expect(ok.fehlt).toBeNull(); expect(ok.text).toBe('Erkennungsdistanz: Markierung ab 110 m sichtbar, Soll 48 m')
    const [kurz] = erkennungBaender(s([z({ wert: 30, bis: 'fahrlinie_endet', ende: 'knoten' })]))
    expect(kurz.fehlt!.art).toBe('ungeprueft')
    expect(kurz.text).toBe('Erkennungsdistanz: Markierung auf mindestens 30 m sichtbar, Soll 48 m; Fahrlinie endet, weiter zurück nicht geprüft')
  })
  it('nur gerechnet: ohne Erkennungsdistanz, Abbieger und Trottoirüberfahrt nichts', () => {
    expect(erkennungBaender(s([z(undefined), z({ wert: 10, bis: 'verdeckt' }, { art: 'abbiegend' })]))).toEqual([])
    expect(erkennungBaender(s([z({ wert: 10, bis: 'verdeckt' })], true))).toEqual([])
  })
})
