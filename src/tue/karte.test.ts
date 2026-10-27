// Trottoirüberfahrt auf der Karte (27.10.2026): Fläche zwischen vorderem und hinterem Rand aus der Knotensicht, sonst nur die Achse
import { describe, expect, it } from 'vitest'
import { tueFlaeche, tueMasse } from './karte'
import type { Knotensicht, KnotensichtAntwort } from './knotensicht'

const ks = (kanten: [number, number][][]): KnotensichtAntwort => ({ breite: 3.2, karte: { kanten } } as unknown as Knotensicht)

describe('Trottoirüberfahrt: Fläche und Masse', () => {
  it('Fläche aus vorderem und hinterem Rand (Viereck), Masse: Breite der Knotensicht, Länge entlang der Hauptstrasse', () => {
    const k = ks([[[0, 0], [8, 0]], [[0, 3.2], [8, 3.2]]])
    expect(tueFlaeche(k)).toEqual([[0, 0], [8, 0], [8, 3.2], [0, 3.2]])
    expect(tueMasse(k)).toEqual({ breite: 3.2, laenge: 8 })
  })
  it('ohne Knotensicht (Rechnung läuft, keine Einmündung): keine Fläche, keine Masse', () => {
    expect(tueFlaeche(undefined)).toBeNull()
    expect(tueFlaeche({ fehler: 'kein Knoten', ohneZufahrt: true })).toBeNull()
    expect(tueMasse({ fehler: 'x' })).toBeNull()
    expect(tueFlaeche(ks([]))).toBeNull()
  })
  it('über die durchgehende Strasse (keine Einmündung): weder Fläche noch Masse, nur die Achse', () => {
    const k = { ...ks([[[0, 0], [8, 0]], [[0, 3.2], [8, 3.2]]]), durchgehend: true } as KnotensichtAntwort
    expect(tueFlaeche(k)).toBeNull()
    expect(tueMasse(k)).toBeNull()
  })
})
