// Tests Erkennungsdistanz auf der Karte (27.10.2026): Band entlang der Fahrlinie, Soll, Text, verdeckendes Hindernis. Künstliche Werte.
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import type { Erkennung, ErkennungLinie } from './rechner/erkennung'
import { abschnitt, erkennungBaender, erkennungSichtlinien, erkennungSoll } from './erkennungKarte'

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
    expect(b.text).toBe('Erkennungsdistanz: Markierung ab 33 m sichtbar, Soll 48 m; verdeckt durch Auto-Parkfeld; Gelände nicht geprüft')
    expect(b.hindernisId).toBe('h1')
  })
  it('erfüllt: nur grün; Fahrlinie endet vorher: grau bis zum Soll', () => {
    const [ok] = erkennungBaender(s([z({ wert: 110, bis: 'frei' })]))
    expect(ok.fehlt).toBeNull(); expect(ok.text).toBe('Erkennungsdistanz: Markierung ab 110 m sichtbar, Soll 48 m; Gelände nicht geprüft')
    const [kurz] = erkennungBaender(s([z({ wert: 30, bis: 'fahrlinie_endet', ende: 'knoten' })]))
    expect(kurz.fehlt!.art).toBe('ungeprueft')
    expect(kurz.text).toBe('Erkennungsdistanz: Markierung auf mindestens 30 m sichtbar, Soll 48 m; Fahrlinie endet, weiter zurück nicht geprüft; Gelände nicht geprüft')
  })
  it('nur gerechnet: ohne Erkennungsdistanz, Abbieger und Trottoirüberfahrt nichts', () => {
    expect(erkennungBaender(s([z(undefined), z({ wert: 10, bis: 'verdeckt' }, { art: 'abbiegend' })]))).toEqual([])
    expect(erkennungBaender(s([z({ wert: 10, bis: 'verdeckt' })], true))).toEqual([])
  })
  it('Sichtlinien (30.10.2026): bis zum Soll, ohne den Augpunkt am Streifenrand; Text mit dem Befund', () => {
    const lin = (x: number, befund: 'frei' | 'verdeckt', grund?: string): ErkennungLinie => ({ x, auge: [0, 1 + x] as P, ziel: [0, 0.5] as P, befund, ...(grund ? { grund } : {}) })
    const l = [0, 10, 20, 30, 40, 50, 60, 70].map(x => lin(x, x < 40 ? 'frei' : 'verdeckt', x < 40 ? undefined : 'Gebäude (AV)'))
    // Soll 48 m, verdeckt ab 33 m: Linien 10 … 40 m
    const kurz = erkennungSichtlinien(z({ wert: 33, bis: 'verdeckt' }, { erkennungLinien: l }))
    expect(kurz.map(x => x.x)).toEqual([10, 20, 30, 40])
    expect(kurz.map(x => x.art)).toEqual(['frei', 'frei', 'frei', 'verdeckt'])
    expect(kurz[0].text).toBe('Sichtlinie 10 m vor dem Streifen auf die Markierung: in den Daten frei, Gelände nicht geprüft')
    expect(kurz[3].text).toBe('Sichtlinie 40 m vor dem Streifen auf die Markierung: verdeckt (Gebäude (AV))')
    expect(nah(kurz[1].auge, [0, 21]) && nah(kurz[1].ziel, [0, 0.5])).toBe(true)
    // Erkennungsdistanz über dem Soll: trotzdem nur bis zum Soll (Nutzerentscheid 30.10.2026)
    expect(erkennungSichtlinien(z({ wert: 62, bis: 'verdeckt' }, { erkennungLinien: l })).map(x => x.x)).toEqual([10, 20, 30, 40])
    // ohne Linien bzw. Abbieger nichts
    expect(erkennungSichtlinien(z({ wert: 33, bis: 'verdeckt' }))).toEqual([])
    expect(erkennungSichtlinien(z({ wert: 33, bis: 'verdeckt' }, { erkennungLinien: l, art: 'abbiegend' }))).toEqual([])
  })
  it('Bewuchs (30.10.2026): grün bis zum Beginn, gelb «nicht sicher» bis zur Erkennungsdistanz, rot bis zum Soll; Sichtlinie gelb', () => {
    const e: Erkennung = { wert: 40, bis: 'verdeckt', hindernis: { klasse: 'gebaeude', name: 'Gebäude (AV)' }, bewuchsAb: 25, bewuchs: 'Gartenanlage' }
    const [b] = erkennungBaender(s([z(e)]))
    expect(nah(b.gruen[0], [0, 1]) && nah(b.gruen[b.gruen.length - 1], [0, 26])).toBe(true)
    expect(nah(b.gelb![0], [0, 26]) && nah(b.gelb![b.gelb!.length - 1], [0, 41])).toBe(true)
    expect(b.fehlt!.art).toBe('verdeckt')
    expect(nah(b.fehlt!.linie[0], [0, 41]) && nah(b.fehlt!.linie[b.fehlt!.linie.length - 1], [0, 49])).toBe(true)
    expect(b.text).toBe('Erkennungsdistanz: Markierung ab 40 m sichtbar (in den Daten frei), ab 25 m nicht sicher (Bewuchs AV: Gartenanlage) – ' +
      'vor Ort oder in Street View prüfen, Soll 48 m; verdeckt durch Gebäude; Gelände nicht geprüft')
    // ohne Bewuchs kein gelbes Stück
    expect(erkennungBaender(s([z({ wert: 40, bis: 'verdeckt' })]))[0].gelb).toBeNull()
    const l: ErkennungLinie[] = [{ x: 30, auge: [0, 31], ziel: [0, 0.5], befund: 'bewuchs', grund: 'uebrige_bestockte' }]
    const [sl] = erkennungSichtlinien(z(e, { erkennungLinien: l }))
    expect(sl.art).toBe('bewuchs')
    expect(sl.text).toBe('Sichtlinie 30 m vor dem Streifen auf die Markierung: nicht sicher (Bewuchs AV: übrige bestockte Fläche) – vor Ort ' +
      'oder in Street View prüfen, Gelände nicht geprüft')
  })
  it('Band höchstens bis zum Soll (Nutzerentscheid 30.10.2026): Erkennungsdistanz 110 m bei Soll 48 m endet beim Soll, Text nennt 110 m', () => {
    const [b] = erkennungBaender(s([z({ wert: 110, bis: 'frei' })]))
    expect(nah(b.gruen[0], [0, 1]) && nah(b.gruen[b.gruen.length - 1], [0, 49])).toBe(true)
    expect(b.gelb).toBeNull(); expect(b.fehlt).toBeNull()
    expect(b.text).toBe('Erkennungsdistanz: Markierung ab 110 m sichtbar, Soll 48 m; Gelände nicht geprüft')
    // Bewuchs ab 60 m (über dem Soll): kein gelbes Stück; ab 30 m: gelb nur bis zum Soll
    expect(erkennungBaender(s([z({ wert: 110, bis: 'frei', bewuchsAb: 60, bewuchs: 'Gartenanlage' })]))[0].gelb).toBeNull()
    const [g] = erkennungBaender(s([z({ wert: 110, bis: 'frei', bewuchsAb: 30, bewuchs: 'Gartenanlage' })]))
    expect(nah(g.gruen[g.gruen.length - 1], [0, 31]) && nah(g.gelb![g.gelb!.length - 1], [0, 49])).toBe(true)
  })
})
