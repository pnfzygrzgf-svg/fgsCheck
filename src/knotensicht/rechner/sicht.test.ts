// Tests Sichtbarkeit entlang der Fahrstreifenachse (rechner/sicht.ts) an einem konstruierten rechtwinkligen Knoten mit
// Handlösung nach dem Strahlensatz.
//
// Lage (Meter, x Ost, y Nord, Ursprung = Schnitt der Zufahrtsachse mit dem nahen Fahrbahnrand):
//   Vortrittsstrasse Ost–West, Fahrbahn 6 m breit von y = 0 (naher Rand) bis y = 6.
//   Zufahrt von Süden, Achse des Zufahrtsstreifens x = 0, Fahrt nach Norden; links = Westen.
//   Verkehr von links fährt nach Osten auf der nahen Fahrspur: Achse y = 1,5 (d = 1,50 m vom rechten Rand y = 0).
//   K = (0; 1,5); Zielpunkte FA(s) = (−s; 1,5).
//   D: B = 3 m vor dem Rand, 0,5 m links der Achse (Fahrersitz): D = (−0,5; −3).
// Handlösung (Strahlensatz, Spitze D): Gebäudeecke C = (−cx; −cy) mit cy < 3. Die Sichtlinie D–FA(s) streift C, wenn
//   (s − 0,5) / (cx − 0,5) = (1,5 + 3) / (3 − cy)   ->   s = 0,5 + (cx − 0,5) · 4,5 / (3 − cy).
// Hinweis zum Plan: Die Ecke «3 m vom Rand» läge auf der Höhe von D (y = −3); die Sichtlinien steigen von D aus an und
// streifen sie nie (keine Verdeckung, Fall 1b). Für die Handrechnung darum die Ecke 1,0 m vom Rand (Fall 1a).

import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import { sichtEntlang, sichtdreieck, type Verdeckend } from './sicht'
import { hindernisVerdeckend, laengsPolygon } from './hindernisse'
import { sichtweiteA, sichtStatus } from './sichtweite'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const D = lv(-0.5, -3)
/** Achse ab K nach Westen, Länge l */
const achseWest = (l: number): P[] => [lv(0, 1.5), lv(-l, 1.5)]
/** Gebäude (Rechteck) mit der Ecke zur Kreuzung bei (−cx; −cy), nach Westen und Süden 20 m tief */
const gebaeude = (cx: number, cy: number, id = 'g'): Verdeckend =>
  ({ id, name: 'Gebäude (Test)', poly: [[lv(-cx, -cy), lv(-cx - 20, -cy), lv(-cx - 20, -cy - 20), lv(-cx, -cy - 20)]] })
const hand = (cx: number, cy: number) => 0.5 + (cx - 0.5) * 4.5 / (3 - cy)

describe('Sicht entlang der Achse: rechtwinkliger Knoten, Fahrbahn 6 m, D 3 m hinter dem Rand', () => {
  it('Fall 1a: Gebäudeecke 1,0 m vom Rand und 10 m von K: vorhandene Sichtweite nach Strahlensatz', () => {
    const soll = hand(10, 1)                          // 0,5 + 9,5 · 4,5 / 2 = 21,875 m
    expect(soll).toBeCloseTo(21.875, 6)
    const r = sichtEntlang(D, achseWest(60), 53, [gebaeude(10, 1)])
    expect(Math.abs(r.vorhanden - soll)).toBeLessThan(0.1)
    expect(r.bisEnde).toBe(false)
    expect(r.verdecker?.id).toBe('g')
    expect(r.sVerdeckt).toBe(22)                      // erster verdeckter Zielpunkt (je 1 m)
    expect(r.sichtbar.slice(0, 22).every(x => x)).toBe(true)
    expect(r.sichtbar.slice(22).every(x => !x)).toBe(true)
    // Tempo 30: A 20 … 35 m -> unterer Wert erfüllt
    expect(sichtStatus(r.vorhanden, sichtweiteA(30))).toBe('massgebend')
  })
  it('Fall 1b: Gebäudeecke 3 m vom Rand (auf der Höhe von D): keine Verdeckung', () => {
    const r = sichtEntlang(D, achseWest(60), 53, [gebaeude(10, 3)])
    expect(r.bisEnde).toBe(true)
    expect(r.vorhanden).toBeCloseTo(53, 6)
  })
  it('Fall 2: ohne Gebäude: vorhandene Sichtweite = Länge der Achse', () => {
    const r = sichtEntlang(D, achseWest(105), 105, [])
    expect(r.vorhanden).toBeCloseTo(105, 6)
    expect(r.bisEnde).toBe(true)
    expect(r.punkte.length).toBe(106)
    // Achse kürzer als die Zielpunkte: bis zum Achsenende
    const k = sichtEntlang(D, achseWest(40), 105, [])
    expect(k.vorhanden).toBeCloseTo(40, 6)
  })
  it('Fall 3: Gebäude erst bei rund 60 m, 50 km/h: Status «unterer Wert»', () => {
    // Ecke 20 m von K, 1,5 m vom Rand: s = 0,5 + 19,5 · 4,5 / 1,5 = 59,0 m
    const soll = hand(20, 1.5)
    expect(soll).toBeCloseTo(59, 6)
    const sw = sichtweiteA(50)
    const r = sichtEntlang(D, achseWest(120), 105, [gebaeude(20, 1.5)])
    expect(Math.abs(r.vorhanden - soll)).toBeLessThan(0.1)
    expect(sichtStatus(r.vorhanden, sw)).toBe('massgebend')   // 50 ≤ 59 < 70
  })
  it('Zielpunkt im Gebäude bzw. Verdeckung ab K: vorhanden 0', () => {
    const block: Verdeckend = { id: 'b', name: 'Block', poly: [[lv(-1, -1), lv(1, -1), lv(1, 1), lv(-1, 1)]] }
    const r = sichtEntlang(D, achseWest(60), 53, [block])
    expect(r.vorhanden).toBe(0)
    expect(r.sVerdeckt).toBe(0)
  })
  it('Sichtdreieck: D und Achsenpunkte von K bis A', () => {
    const dr = sichtdreieck(D, achseWest(60), 0, 20)
    expect(dr[0]).toEqual(D)
    expect(dr[1]).toEqual(lv(0, 1.5))
    expect(dr[dr.length - 1][0]).toBeCloseTo(O[0] - 20, 6)
    expect(dr.length).toBe(22)
    expect(sichtdreieck(D, achseWest(60), 20, 20)).toEqual([])
  })
})

// ── E2a: Hindernisse (hindernisVerdeckend) mit Wirkung voll, Palisade, Hinweis ──
// Schatten eines Stamms (Kreis, Mittelpunkt C = (−xt; yC), Radius r) auf einer Achse y = yA, Handlösung: mit a = s − 0,5,
// h = yC − yD, H = yA − yD (yD = −3) liegt FA(s) im Schatten, wenn der Abstand von C zur Sichtlinie D–FA(s) höchstens r ist:
//   |h · a − H · (xt − 0,5)| ≤ r · √(a² + H²).
// Die Grenzen werden unten mit dieser Formel durch Halbieren bestimmt (unabhängig von linieTrifft). Der Stamm ist in der
// Rechnung ein 16-Eck auf dem Kreis (stammPolygon): sein Schatten liegt zwischen dem des Kreises mit r · cos(π/16) und mit r;
// bei langen Schatten (Baum nahe D) macht das einige Dezimeter aus, dort wird gegen beide Grenzen geprüft.
describe('E2a: Hindernisse in der Sichtrechnung (Handlösungen)', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
  /** Schattengrenzen eines Stamms auf der Achse y = yA nach der Formel oben (a-Werte um den Mittelpunkt a0) */
  function schatten(xt: number, yC: number, r: number, yA: number): [number, number] {
    const h = yC + 3, H = yA + 3
    const f = (a: number) => Math.abs(h * a - H * (xt - 0.5)) - r * Math.hypot(a, H)
    const a0 = H * (xt - 0.5) / h
    const grenze = (innen: number, aussen: number) => {
      for (let i = 0; i < 100; i++) { const m = (innen + aussen) / 2; if (f(m) <= 0) innen = m; else aussen = m }
      return innen
    }
    return [grenze(a0, 0) + 0.5, grenze(a0, a0 + 1000) + 0.5]
  }

  it('Parkfeld Auto in der Ecke, Ecke 2 m vom Rand und 8 m von K: Strahlensatz, Status «massgebend» bei 30 km/h', () => {
    // Feld 5 × 2 m parallel zur Vortrittsstrasse, Ecke zur Kreuzung C = (−8; −2): s = 0,5 + 7,5 · 4,5 / 1 = 34,25 m
    const soll = hand(8, 2)
    expect(soll).toBeCloseTo(34.25, 6)
    const hv = hindernisVerdeckend([{ id: 'p1', art: 'parkfeld', klasse: 'auto', quelle: 'hand', ring: rect(-13, -4, -8, -2) }])
    expect(hv[0].wirkung).toBe('voll')
    const r = sichtEntlang(D, achseWest(60), 53, hv, 53)
    expect(Math.abs(r.vorhanden - soll)).toBeLessThan(0.01)
    expect(r.verdecker?.id).toBe('p1')
    expect(sichtStatus(r.vorhanden, sichtweiteA(30))).toBe('massgebend')    // 20 ≤ 34,25 < 35
    // Liste: erster verdeckter feiner Zielpunkt 34,3 m, verdeckt bis 53 m (188 Punkte × 0,1 m)
    expect(r.liste.map(t => t.v.id)).toEqual(['p1'])
    expect(r.liste[0].sErst).toBeCloseTo(34.3, 6)
    expect(r.liste[0].strecke).toBeCloseTo(18.8, 6)
  })
  it('Längsparkierung entlang der Vortrittsstrasse (Streifen 2 m hinter dem Rand ab 10 m): verdeckt ab dem ersten Fahrzeug', () => {
    // Streifen y = −2 … 0 ab x = −10: massgebend die Ecke (−10; 0): s = 0,5 + 9,5 · 4,5 / 3 = 14,75 m
    const soll = hand(10, 0)
    expect(soll).toBeCloseTo(14.75, 6)
    const hv = hindernisVerdeckend([{ id: 'l1', art: 'laengsparkierung', linie: [lv(-10, -1), lv(-40, -1)], breite: 2, quelle: 'hand' }])
    const r = sichtEntlang(D, achseWest(60), 53, hv, 20)
    expect(Math.abs(r.vorhanden - soll)).toBeLessThan(0.01)
    expect(sichtStatus(r.vorhanden, sichtweiteA(30))).toBe('nicht_erfuellt')
    expect(r.liste[0].sErst).toBeCloseTo(14.8, 6)
  })
  it('Baumreihe alle 8 m in einer Mittelinsel (y = 3), ferne Fahrspur (y = 4,5): Palisade, Anteil klein, keine Statuswirkung', () => {
    const baeume = [8, 16, 24, 32, 40, 48].map(x => ({ id: `b${x}`, art: 'baum' as const, p: lv(-x, 3), stamm: 0.5, quelle: 'hand' as const }))
    const hv = hindernisVerdeckend(baeume)
    expect(hv.every(v => v.wirkung === 'palisade')).toBe(true)
    const achse = [lv(0, 4.5), lv(-60, 4.5)]
    const r = sichtEntlang(D, achse, 52.5, hv, 20)
    // Handlösung: Schatten je Stamm, alle unter 5 m (8 m: rund 8,4 … 9,6 m; 16 m: ab rund 19 m); Anteil bis A = 20 m
    const sch = [8, 16, 24, 32, 40, 48].map(x => schatten(x, 3, 0.25, 4.5))
    expect(Math.max(...sch.map(([a, b]) => b - a))).toBeLessThan(5)
    const bisA = sch.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, 20) - a), 0)
    expect(r.vorhanden).toBeCloseTo(52.5, 6)
    expect(r.bisEnde).toBe(true)
    expect(r.palisade).not.toBeNull()
    expect(r.palisade!.zaehlt).toBe(false)
    expect(Math.abs(r.palisade!.anteil - bisA / 20)).toBeLessThan(0.015)   // ±1 feiner Punkt je Schatten, 16-Eck
    expect(r.palisade!.anteil).toBeLessThan(0.15)
    expect(Math.abs(r.palisade!.laengste - Math.max(...sch.filter(([a]) => a < 20).map(([a, b]) => Math.min(b, 20) - a)))).toBeLessThan(0.15)
    expect(sichtStatus(r.vorhanden, sichtweiteA(30))).toBe('erfuellt')
    expect(r.liste.map(t => t.v.id)).toEqual(['b8', 'b16'])
  })
  it('Alleebäume 1 m hinter dem Rand, nahe Fahrspur: Stamm bei 8 m unter 5 m (zählt nicht), bei 12 m über 5 m (verdeckt), bei 16 m jenseits A', () => {
    const baum = (x: number) => ({ id: `b${x}`, art: 'baum' as const, p: lv(-x, -1), stamm: 0.5, quelle: 'hand' as const })
    const [a8, b8] = schatten(8, -1, 0.25, 1.5), [a12, b12] = schatten(12, -1, 0.25, 1.5), [a16, b16] = schatten(16, -1, 0.25, 1.5)
    expect(b8 - a8).toBeGreaterThan(4.3); expect(b8 - a8).toBeLessThan(4.6)        // 4,43 m
    expect(b12 - a12).toBeGreaterThan(5); expect(b12 - a12).toBeLessThan(8)         // rund 6,6 m
    expect(b16 - a16).toBeGreaterThan(8.8); expect(b16 - a16).toBeLessThan(9.1)    // 8,93 m, ab rund 31,5 m
    // A = 35 m: der Schatten des Stamms bei 12 m liegt ganz in A und misst über 5 m -> Sichtweite endet davor
    const r = sichtEntlang(D, achseWest(60), 52.5, hindernisVerdeckend([baum(8), baum(12)]), 35)
    expect(r.palisade!.zaehlt).toBe(true)
    expect(Math.abs(r.vorhanden - a12)).toBeLessThan(0.15)
    expect(r.verdecker?.id).toBe('b12')
    // A = 20 m: der lange Schatten (16 m) beginnt erst jenseits von A -> zählt nicht (nur der Anteil des Stamms bei 8 m)
    const j = sichtEntlang(D, achseWest(60), 52.5, hindernisVerdeckend([baum(8), baum(16)]), 20)
    expect(j.palisade!.zaehlt).toBe(false)
    expect(j.bisEnde).toBe(true)
    expect(Math.abs(j.palisade!.anteil - (b8 - a8) / 20)).toBeLessThan(0.011)
    expect(Math.abs(j.palisade!.laengste - (b8 - a8))).toBeLessThan(0.15)
    // Gebäude verdeckt schon ab 21,875 m (Fall 1a), der Schatten bei 12 m beginnt später: ohne Wirkung, «hinter voller Verdeckung»
    const g = sichtEntlang(D, achseWest(60), 52.5, [gebaeude(10, 1), ...hindernisVerdeckend([baum(12)])], 35)
    expect(Math.abs(g.vorhanden - hand(10, 1))).toBeLessThan(0.01)
    expect(g.verdecker?.id).toBe('g')
    expect(g.palisade!.zaehlt).toBe(false)
    expect(g.palisade!.hinterVoll).toBe(true)
  })
  it('Baum 3 m vor D in Richtung FA bei 20 m: verdeckte Strecke über 5 m, Sichtweite endet davor', () => {
    const u: P = [-19.5, 4.5], l = Math.hypot(...u)
    const C: P = [-0.5 + 3 * u[0] / l, -3 + 3 * u[1] / l]           // (−3,42; −2,33)
    const hv = hindernisVerdeckend([{ id: 'b', art: 'baum', p: lv(C[0], C[1]), stamm: 0.5, quelle: 'kataster' }])
    expect(hv[0].quelle).toBe('Baumkataster')
    const [a, b] = schatten(-C[0], C[1], 0.25, 1.5)                 // Kreis r = 0,25 m
    const [ai, bi] = schatten(-C[0], C[1], 0.25 * Math.cos(Math.PI / 16), 1.5)   // Inkreis des 16-Ecks
    expect(bi - ai).toBeGreaterThan(5)                                // rund 12 … 28 m
    const r = sichtEntlang(D, achseWest(60), 52.5, hv, 20)
    expect(r.palisade!.zaehlt).toBe(true)
    expect(r.vorhanden).toBeGreaterThan(a - 0.15); expect(r.vorhanden).toBeLessThan(ai + 0.15)
    // längste Strecke innerhalb von A = 20 m
    expect(r.palisade!.laengste).toBeGreaterThan(Math.min(bi, 20) - ai - 0.15); expect(r.palisade!.laengste).toBeLessThan(Math.min(b, 20) - a + 0.15)
    expect(r.palisade!.beiA).toBe(true)
    expect(sichtStatus(r.vorhanden, sichtweiteA(30))).toBe('nicht_erfuellt')
  })
  it('Hecke mit «sichtbehindernd» aus: keine Wirkung, nicht in der Liste; eingeschaltet wie eine Mauer', () => {
    const linie = [lv(-10, -1), lv(-30, -1)]
    const aus = hindernisVerdeckend([{ id: 'h', art: 'hecke', linie, sichtbehindernd: false, quelle: 'hand' }])
    expect(aus).toEqual([])
    const r = sichtEntlang(D, achseWest(60), 53, aus, 20)
    expect(r.bisEnde).toBe(true)
    expect(r.liste).toEqual([])
    // ein: Puffer 0,3 m beidseits, massgebend die Ecke (−10; −0,7): s = 0,5 + 9,5 · 4,5 / 2,3
    const ein = sichtEntlang(D, achseWest(60), 53, hindernisVerdeckend([{ id: 'h', art: 'hecke', linie, sichtbehindernd: true, quelle: 'hand' }]), 20)
    expect(Math.abs(ein.vorhanden - hand(10, 0.7))).toBeLessThan(0.01)
  })
  it('Zweirad-Parkfeld und sichtdurchlässiger Zaun: nur Hinweis in der Liste, keine Wirkung', () => {
    const hv = hindernisVerdeckend([
      { id: 'v', art: 'parkfeld', klasse: 'velo', quelle: 'kataster', ring: rect(-13, -4, -8, -2) },
      { id: 'z', art: 'zaun', linie: [lv(-10, -1), lv(-30, -1)], dicht: false, quelle: 'hand' },
    ])
    expect(hv.map(v => [v.wirkung, v.art])).toEqual([['hinweis', 'Parkfeld Velo'], ['hinweis', 'Zaun (sichtdurchlässig)']])
    const r = sichtEntlang(D, achseWest(60), 53, hv, 53)
    expect(r.vorhanden).toBeCloseTo(53, 6)
    expect(r.bisEnde).toBe(true)
    expect(r.palisade).toBeNull()
    expect(r.liste.map(t => [t.v.id, Math.round(t.sErst * 10) / 10])).toEqual([['z', 19.1], ['v', 34.3]])  // Zaun: hand(10; 0,7) = 19,09
  })
})

describe('E2a: Puffer um Linien (laengsPolygon)', () => {
  it('gerade: Rechteck der Breite; Knick 90°: Gehrung, Ecke bei (9; 1) bzw. (11; −1); doppelte Punkte entfallen', () => {
    const r = laengsPolygon([lv(0, 0), lv(10, 0), lv(10, 0), lv(10, 10)], 2).map(p => [p[0] - O[0], p[1] - O[1]].map(x => Math.round(x * 1e6) / 1e6 + 0))
    expect(r).toEqual([[0, 1], [9, 1], [9, 10], [11, 10], [11, -1], [0, -1]])
    expect(laengsPolygon([lv(0, 0), lv(0, 0)], 2)).toEqual([])
    // Umkehr (180°): ohne Gehrung, kein Absturz
    expect(laengsPolygon([lv(0, 0), lv(10, 0), lv(0, 0)], 2).length).toBe(6)
  })
})
