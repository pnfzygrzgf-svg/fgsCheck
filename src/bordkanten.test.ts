// Bordsteinkanten der AV und Messarten des Werkzeugs «Messen» (06.11.2026, nach VeloroutenCheck breitenmessung.ts)
import { describe, expect, it } from 'vitest'
import { FANG_M, bordkanten, fangeAnKante, messeAbKante, messeFlaeche } from './bordkanten'
import { messArtFuerFeld, messLeer, messStandKlick, messStandText } from './messen'
import type { AvFlaeche } from './daten/av'

const av = (art: string, ring: [number, number][]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [ring] })
// Strasse 0…40 (E) × 0…7 (N), in der AV in zwei Flächen geteilt (gemeinsame Kante bei E = 20); Trottoir nördlich davon
const AV: AvFlaeche[] = [
  av('Strasse_Weg', [[0, 0], [20, 0], [20, 7], [0, 7], [0, 0]]),
  av('Strasse_Weg', [[20, 0], [40, 0], [40, 7], [20, 7], [20, 0]]),
  av('Trottoir', [[0, 7], [40, 7], [40, 9], [0, 9], [0, 7]]),
]

describe('Bordsteinkanten', () => {
  const kanten = bordkanten(AV)
  it('gemeinsame Kanten zweier Strassenflächen sind keine Bordsteine, die Aussenkanten schon', () => {
    const senkrechtBei20 = kanten.filter(k => Math.abs(k.a[0] - 20) < 1e-6 && Math.abs(k.b[0] - 20) < 1e-6)
    expect(senkrechtBei20).toHaveLength(0)
    const nordkanten = kanten.filter(k => Math.abs(k.a[1] - 7) < 1e-6 && Math.abs(k.b[1] - 7) < 1e-6)
    expect(nordkanten.length).toBeGreaterThanOrEqual(2)
    expect(bordkanten([AV[2]])).toEqual([])
  })
  it('ab Bordsteinkante: rechtwinkliger Abstand zur nächsten Kante, höchstens FANG_M', () => {
    const r = messeAbKante([10, 5.5], kanten)!
    expect(r.breite).toBeCloseTo(1.5, 6); expect(r.fuss[1]).toBeCloseTo(7, 6)
    expect(messeAbKante([10, 3.5], kanten)!.breite).toBeCloseTo(3.5, 6)
    expect(messeAbKante([10, 7 + FANG_M + 1], kanten)).toBeNull()
  })
  it('ganze Fläche: von der nächsten Kante durch den Klick bis zur gegenüberliegenden', () => {
    const r = messeFlaeche([10, 2], kanten)!
    expect(r.breite).toBeCloseTo(7, 6); expect(r.von[1]).toBeCloseTo(0, 6); expect(r.bis[1]).toBeCloseTo(7, 6)
    expect(messeFlaeche([10, 30], kanten)).toBeNull()
  })
  it('Fang an die Kante: nächste Stelle, mit erstem Punkt der Lotfusspunkt', () => {
    expect(fangeAnKante([10, 7.4], kanten, 1)).toEqual([10, 7])
    expect(fangeAnKante([10, 9], kanten, 1)).toBeNull()
    const f = fangeAnKante([10.5, 6.6], kanten, 1, [10, 3])!
    expect(f[0]).toBeCloseTo(10, 6); expect(f[1]).toBeCloseTo(7, 6)
  })
})

describe('Werkzeug «Messen»: Stand je Messart', () => {
  const kanten = bordkanten(AV)
  it('Ganze Fläche: ein Klick in die Fahrbahn gibt die Breite, daneben eine Meldung', () => {
    const m = messStandKlick(messLeer('flaeche'), [10, 2], AV, kanten, 2)
    expect(m.ergebnis!.breite).toBeCloseTo(7, 6); expect(messStandText(m)).toBe('Breite: 7,00 m')
    const f = messStandKlick(messLeer('flaeche'), [10, 30], AV, kanten, 2)
    expect(f.ergebnis).toBeNull(); expect(f.fehler).toContain('Keine zwei Bordsteinkanten')
    expect(messStandKlick(messLeer('flaeche'), [10, 2], AV, [], 2).fehler).toContain('Keine Bordsteinkanten der AV geladen')
  })
  it('Ab Bordsteinkante: Klick auf die Markierung, Strecke bis zur Kante', () => {
    const m = messStandKlick(messLeer('kante'), [10, 5], AV, kanten, 2)
    expect(m.ergebnis!.breite).toBeCloseTo(2, 6); expect(m.ergebnis!.bis).toEqual([10, 5])
  })
  it('Zwei Punkte: AV-Stützpunkt vor Bordkante vor freiem Punkt; der zweite Punkt rechtwinklig zur Kante', () => {
    const a = messStandKlick(messLeer('hand'), [0.3, 0.2], AV, kanten, 1)
    expect(a.hand!.a).toEqual({ p: [0, 0], art: 'av_punkt' }); expect(messStandText(a)).toBe('Jetzt den zweiten Punkt anklicken.')
    const b = messStandKlick(messLeer('hand'), [10, 3], AV, kanten, 1)
    expect(b.hand!.a.art).toBe('frei')
    const c = messStandKlick(b, [10.5, 6.6], AV, kanten, 1)
    expect(c.hand!.b!.art).toBe('bordkante'); expect(c.ergebnis!.breite).toBeCloseTo(4, 6)
    expect(messStandText(c)).toBe('Strecke: 4,00 m (frei, Bordkante)')
    expect(messStandText(messLeer('hand'))).toBe('Noch nicht gemessen.')
  })
  it('Messart je Feld der Bedarfsmaske: Fahrbahnbreiten als «Ganze Fläche», sonst «Zwei Punkte»', () => {
    expect(messArtFuerFeld('fahrbahnB')).toBe('flaeche'); expect(messArtFuerFeld('restbreiteM')).toBe('flaeche')
    expect(messArtFuerFeld('abstandFgsM')).toBe('hand')
  })
})
