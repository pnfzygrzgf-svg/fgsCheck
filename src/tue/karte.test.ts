// Trottoirüberfahrt auf der Karte (27.10.2026): Fläche zwischen vorderem und hinterem Rand aus der Knotensicht, sonst nur die Achse
import { describe, expect, it } from 'vitest'
import { ksDreieckSichtbar, ksFahrzeugStand, ksPhaseNach, tueFlaeche, tueMasse } from './karte'
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

describe('Sicht je Phase zeigen (27.10.2026)', () => {
  it('Klick auf ein wartendes Fahrzeug: diese Phase; nochmals dieselbe: wieder beide; die andere: wechselt', () => {
    expect(ksPhaseNach('beide', 'fahrbahn')).toBe('fahrbahn')
    expect(ksPhaseNach('fahrbahn', 'fahrbahn')).toBe('beide')
    expect(ksPhaseNach('fahrbahn', 'trottoir')).toBe('trottoir')
  })
  it('Sichtdreiecke: Fahrbahn = Auto und Velo, Trottoir = Trottoir, beide = alle', () => {
    const arten = ['auto', 'velo', 'trottoir'] as const
    expect(arten.filter(a => ksDreieckSichtbar(a, 'beide'))).toEqual(['auto', 'velo', 'trottoir'])
    expect(arten.filter(a => ksDreieckSichtbar(a, 'fahrbahn'))).toEqual(['auto', 'velo'])
    expect(arten.filter(a => ksDreieckSichtbar(a, 'trottoir'))).toEqual(['trottoir'])
  })
  it('Fahrzeuge: gewähltes wartendes hervorgehoben, das andere blass (zum Wechseln), am Ende der Sichtweite nur bei der Fahrbahn', () => {
    const fbF = { rolle: 'fb', phase: 'fahrbahn' as const }, fbT = { rolle: 'fb', phase: 'trottoir' as const }, fa = { rolle: 'fa' }
    expect([fbF, fbT, fa].map(f => ksFahrzeugStand(f, 'beide'))).toEqual(['normal', 'normal', 'normal'])
    expect([fbF, fbT, fa].map(f => ksFahrzeugStand(f, 'fahrbahn'))).toEqual(['hervor', 'blass', 'normal'])
    expect([fbF, fbT, fa].map(f => ksFahrzeugStand(f, 'trottoir'))).toEqual(['blass', 'hervor', 'aus'])
  })
})
