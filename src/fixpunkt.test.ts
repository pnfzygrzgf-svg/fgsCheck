// Tests Fixpunkte (16.10.2026): Fangen auf die AV, Vorschläge je Strassenseite, Masse ab Fixpunkt, Fall-Datei.
import { describe, expect, it } from 'vitest'
import { fangen, fangRadiusM, knickGrad, fixpunktVorschlaege, fixpunktName, naechsterStreifen, FANG_MAX_M, VORSCHLAG_M } from './fixpunkt'
import { fixpunktMasse, balkenRichtung, vermassungTabelle, type Vermassung } from './rechner/vermassung'
import { handUmriss } from './rechner/index'
import { leererFall, fallLesen, fallSchreiben, eingabenZahl, hatEingaben, eingabenSchluessel, naechsteFixId } from './fall'
import type { AvFlaeche } from './daten/av'
import type { P } from './geo'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rel = (p: P) => [Math.round((p[0] - O[0]) * 1000) / 1000, Math.round((p[1] - O[1]) * 1000) / 1000]
const flaeche = (art: string, pts: [number, number][]): AvFlaeche =>
  ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[...pts.map(([x, y]) => lv(x, y)), lv(pts[0][0], pts[0][1])]] })
// Strasse West–Ost (y −4 … 4), Trottoir nördlich (4 … 7), Gebäude nördlich ab y = 7 (Ecke bei x = 6, y = 7 zugleich Trottoir-Punkt),
// Gebäude südlich (Ecke bei x = -10, y = -9), ein Bogen (Gebäude mit vielen Punkten) weiter östlich
const bogen: [number, number][] = Array.from({ length: 10 }, (_, i) => [30 + 5 * Math.cos(i * Math.PI / 18), 10 + 5 * Math.sin(i * Math.PI / 18)])
const AV: AvFlaeche[] = [
  flaeche('Strasse_Weg', [[-50, -4], [50, -4], [50, 4], [-50, 4]]),
  flaeche('Trottoir', [[-50, 4], [6, 4], [6, 7], [-50, 7]]),
  flaeche('Gebaeude', [[6, 7], [16, 7], [16, 15], [6, 15]]),
  flaeche('Gebaeude', [[-20, -9], [-10, -9], [-10, -20], [-20, -20]]),
  flaeche('Gebaeude', [[25, 10], ...bogen, [25, 20]]),
]
/** senkrechter Streifen über die Strasse bei x, Breite 4 m, Balken West–Ost */
const streifen = (x: number, breite = 4, r: P = [1, 0]) => {
  const p0 = lv(x, -4.3), p1 = lv(x, 4.3)
  return { p0, p1, breite, umriss: handUmriss(p0, p1, breite, r) }
}

describe('Fangen auf die AV (fangen, fangRadiusM)', () => {
  it('Fangradius: 12 Bildschirmpunkte in Metern, höchstens 5 m', () => {
    expect(fangRadiusM(2.4)).toBe(2.4)          // Zoom 19 in Bern (rund 0,2 m/px)
    expect(fangRadiusM(19.6)).toBe(FANG_MAX_M)  // Zoom 16
  })
  it('Knick: Ecke 90°, gerade weiter 0°, Bogen klein (Punkte gelten nicht als Ecke)', () => {
    const r = AV[2].ringe[0]
    expect(knickGrad(r, 0)).toBeCloseTo(90)
    expect(knickGrad([lv(0, 0), lv(5, 0), lv(10, 0), lv(10, 5)], 1)).toBeCloseTo(0)
    expect(knickGrad(AV[4].ringe[0], 4)).toBeCloseTo(10)
  })
  it('Gebäudeecke vor Trottoir-Punkt am selben Ort; Trottoir-Punkt; Bogenpunkt; freier Punkt', () => {
    expect(fangen(lv(6.8, 7.5), AV, 2)).toEqual({ p: lv(6, 7), art: 'gebaeudeecke' })
    expect(fangen(lv(-49, 6.5), AV, 2)).toEqual({ p: lv(-50, 7), art: 'av_punkt', avArt: 'Trottoir' })
    const b = fangen(lv(bogen[4][0] + 0.3, bogen[4][1]), AV, 2)
    expect([b.art, b.avArt]).toEqual(['av_punkt', 'Gebaeude'])
    expect(fangen(lv(0, 20), AV, 2)).toEqual({ p: lv(0, 20), art: 'frei' })
    // ausserhalb des Radius: frei, auch wenn eine Ecke 2,5 m daneben liegt
    expect(fangen(lv(6, 9.5), AV, 2).art).toBe('frei')
    expect([fixpunktName({ art: 'gebaeudeecke' }), fixpunktName({ art: 'av_punkt', avArt: 'Trottoir' }), fixpunktName({ art: 'frei' }),
      fixpunktName({ art: 'frei', name: 'Schacht' })]).toEqual(['Gebäudeecke (AV)', 'AV-Punkt (Trottoir)', 'freier Punkt', 'Schacht'])
  })
})

describe('Vorschlag: nächste Gebäudeecke je Strassenseite (fixpunktVorschlaege)', () => {
  it('je Seite die nächste Ecke bis 30 m vom Umriss', () => {
    const v = fixpunktVorschlaege(streifen(0), AV)
    // Seite A (Süden, p0) und Seite B (Norden, p1)
    expect(v.map(x => [x.seite, rel(x.p)])).toEqual([['A', [-10, -9]], ['B', [6, 7]]])
    expect(v[1].abstandM).toBeCloseTo(Math.hypot(4, 7 - 4.3))
    // Streifen weit weg: keine Ecke bis 30 m
    expect(fixpunktVorschlaege({ ...streifen(0), p0: lv(-200, -4.3), p1: lv(-200, 4.3), umriss: handUmriss(lv(-200, -4.3), lv(-200, 4.3), 4, [1, 0]) }, AV)).toEqual([])
    expect(VORSCHLAG_M).toBe(30)
  })
  it('nächster Streifen zum Fixpunkt', () => {
    const a = { id: 'a', ...streifen(0) }, b = { id: 'b', ...streifen(40) }
    expect(naechsterStreifen(lv(30, 6), [a, b])!.id).toBe('b')
    expect(naechsterStreifen(lv(30, 6), [])).toBeNull()
  })
})

describe('Masse ab Fixpunkt (fixpunktMasse)', () => {
  it('senkrechter Streifen, Fixpunkt vor dem Streifen: längs zur Kante und Achse, quer zum Ende', () => {
    const s = streifen(0)
    const m = fixpunktMasse(lv(-8.28, -5), s)         // 8,28 m westlich der Achse, 0,7 m südlich von Ende A
    expect(m.aufHoehe).toBe(false)
    expect(m.laengsKanteM).toBeCloseTo(6.28)
    expect(m.laengsAchseM).toBeCloseTo(8.28)
    expect(m.kante).toBe('West')
    expect(rel(m.kantenPunkt)).toEqual([-2, -5])
    expect([m.ende, m.endeLaengsRichtung, m.endeQuerRichtung]).toEqual(['A', 'Ost', 'Nord'])
    expect(m.endeLaengsM).toBeCloseTo(8.28)
    expect(m.endeQuerM).toBeCloseTo(0.7)
    expect(m.ecke).toMatch(/^Ecke A[12]$/)
    expect(m.eckeM).toBeCloseTo(Math.hypot(6.28, 0.7))
  })
  it('Fixpunkt auf der anderen Seite bzw. auf Höhe des Streifens', () => {
    const s = streifen(0)
    const o = fixpunktMasse(lv(6, 7), s)
    expect([o.kante, o.ende, o.aufHoehe]).toEqual(['Ost', 'B', false])
    expect(o.laengsKanteM).toBeCloseTo(4)
    expect(o.endeQuerM).toBeCloseTo(2.7)
    const h = fixpunktMasse(lv(1.5, 9), s)            // zwischen den Kanten (|1,5| < 2)
    expect([h.aufHoehe, h.laengsKanteM]).toEqual([true, 0])
    expect(h.laengsAchseM).toBeCloseTo(1.5)
    expect(rel(h.kantenPunkt)).toEqual([1.5, 9])
    expect(h.endeQuerM).toBeCloseTo(4.7)
  })
  it('schiefer Streifen (Achse 30° gegen die Senkrechte zu den Balken): längs entlang der Balken bis zur schiefen Kante', () => {
    // Achse von (0, -4) nach (4,62; 4): 30° gegen Norden geneigt; Balken West–Ost
    const p0 = lv(0, -4), p1 = lv(8 * Math.tan(Math.PI / 6), 4)
    const s = { p0, p1, breite: 4, umriss: handUmriss(p0, p1, 4, [1, 0]) }
    const r = balkenRichtung(p0, p1, 4, s.umriss)
    expect(Math.abs(r[0])).toBeCloseTo(1)
    // Fixpunkt westlich auf Höhe y = 0: die Achse liegt dort bei x = 2,31, die Westkante bei 0,31
    const m = fixpunktMasse(lv(-5, 0), s)
    expect(m.laengsAchseM).toBeCloseTo(5 + 4 * Math.tan(Math.PI / 6))
    expect(m.laengsKanteM).toBeCloseTo(5 + 4 * Math.tan(Math.PI / 6) - 2)
    expect(m.kante).toBe('West')
    expect(rel(m.kantenPunkt)[1]).toBeCloseTo(0)
    // Ende A (0, −4): längs 5 m nach Osten, quer 4 m nach Süden (rechtwinklig zu den Balken)
    expect([m.ende, m.endeLaengsRichtung, m.endeQuerRichtung]).toEqual(['A', 'Ost', 'Süd'])
    expect(m.endeLaengsM).toBeCloseTo(5)
    expect(m.endeQuerM).toBeCloseTo(4)
  })
  it('Zwischenablage nimmt Fixpunkte mit', () => {
    const v = { punkte: [{ name: 'Ende A', p: lv(0, 0) }] } as Vermassung
    expect(vermassungTabelle('hand-1', v, [{ name: 'Gebäudeecke (AV)', p: lv(6, 7) }]).split('\n'))
      .toEqual(['Punkt\tE\tN', 'hand-1 Ende A\t2600000.00\t1200000.00', 'Fixpunkt Gebäudeecke (AV)\t2600006.00\t1200007.00'])
  })
})

describe('Fall-Datei mit Fixpunkten', () => {
  it('speichern, lesen, zählen; ungültige gemeldet; alte Datei ohne Feld unverändert', () => {
    const f = leererFall(46.95, 7.44, null)
    expect(f.fixpunkte).toBeUndefined()
    expect(naechsteFixId(f)).toBe('fix-1')
    const k0 = eingabenSchluessel(f)
    f.fixpunkte = [{ id: 'fix-1', p: lv(6, 7), art: 'gebaeudeecke' }, { id: 'fix-2', p: lv(0, 20), art: 'frei', name: 'Schacht' }]
    expect([eingabenZahl(f), hatEingaben(f), naechsteFixId(f)]).toEqual([2, true, 'fix-3'])
    expect(eingabenSchluessel(f)).not.toBe(k0)
    const [g, h] = fallLesen(fallSchreiben(f))
    expect([g.fixpunkte, h]).toEqual([f.fixpunkte, []])
    // ungültige Einträge
    const roh = JSON.parse(fallSchreiben(f))
    roh.fixpunkte.push({ id: 'fix-3', p: [1, 2, 3], art: 'frei' }, { id: 'fix-4', p: [1, 2], art: 'irgendwas' }, { id: 'fix-1', p: [1, 2], art: 'frei' })
    const [g2, h2] = fallLesen(JSON.stringify(roh))
    expect(g2.fixpunkte!.map(x => x.id)).toEqual(['fix-1', 'fix-2'])
    expect(h2).toEqual(['Fixpunkt ungültig, übergangen', 'Fixpunkt ungültig, übergangen', 'Fixpunkt ungültig, übergangen'])
    const [g3, h3] = fallLesen(JSON.stringify({ ...roh, fixpunkte: { a: 1 } }))
    expect([g3.fixpunkte, h3]).toEqual([undefined, ['Fixpunkte ungültig (keine Liste), übergangen']])
    // ältere Datei (ohne Feld): kein Feld, gleicher Schlüssel wie ein leerer Fall
    const alt = JSON.stringify({ app: 'fgsCheck', version: 1, ort: { lat: 46.95, lon: 7.44, uebergang: 7 }, streifenHand: [], hindernisse: [],
      zufahrten: {}, streifen: {}, vorschlaege: {}, baumkataster: false })
    const [a, ha] = fallLesen(alt)
    expect([a.fixpunkte, ha, 'fixpunkte' in JSON.parse(fallSchreiben(a))]).toEqual([undefined, [], false])
    expect(eingabenSchluessel(a)).toBe(eingabenSchluessel(leererFall(1, 1, null)))
  })
})
