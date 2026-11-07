import { describe, expect, it } from 'vitest'
import { trefferObjekt } from './treffer'
import type { KartenObjekt, P } from './modell'

const flaeche = (id: string, r: number): KartenObjekt => ({ id, klasse: 'x', text: id, ringe: [[[-r, -r], [r, -r], [r, r], [-r, r]]] })
const linie = (id: string, n: number): KartenObjekt => ({ id, klasse: 'x', text: id, linien: [[[-50, n], [50, n]]] })
const punkt = (id: string, e: number): KartenObjekt => ({ id, klasse: 'x', text: id, punkt: [e, 0] })
const mitte: P = [0, 0]

describe('trefferObjekt', () => {
  it('zieht Punkte den Linien und Linien den Flächen vor', () => {
    expect(trefferObjekt([flaeche('f', 10), linie('l', 1), punkt('p', 2)], mitte, 5)?.id).toBe('p')
    expect(trefferObjekt([flaeche('f', 10), linie('l', 1)], mitte, 5)?.id).toBe('l')
  })
  it('nimmt das nächste Objekt', () => {
    expect(trefferObjekt([linie('weit', 4), linie('nah', 1), linie('draussen', 20)], mitte, 5)?.id).toBe('nah')
    expect(trefferObjekt([punkt('weit', 4), punkt('nah', 1)], mitte, 5)?.id).toBe('nah')
  })
  it('nimmt von mehreren Flächen die kleinste', () => {
    expect(trefferObjekt([flaeche('gross', 50), flaeche('klein', 5)], mitte, 2)?.id).toBe('klein')
  })
  it('meldet nichts ausserhalb', () => {
    expect(trefferObjekt([flaeche('f', 5)], [100, 100], 2)).toBeNull()
  })
  it('lässt über einem anklickbaren Objekt die Flächen aus', () => {
    expect(trefferObjekt([flaeche('f', 10)], mitte, 5, true)).toBeNull()
    expect(trefferObjekt([flaeche('f', 10), linie('l', 1)], mitte, 5, true)?.id).toBe('l')
  })
})
