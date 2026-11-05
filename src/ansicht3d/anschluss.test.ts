import { describe, expect, it } from 'vitest'
import { anschlussFlaechen, anschlussProben, naheUmriss } from './anschluss'
import { fahrbahnVerfolgen } from './fahrbahn'
import { enthaelt, flaeche, type Multi } from '../rechner/poly'
import type { P } from '../geo'
const strasse: Multi = [[[[0, -2], [4, -2], [4, 2], [0, 2]]]]
const weg = fahrbahnVerfolgen([0, 1, 2, 3, 4].map(x => ({ p: [x, 0] as P, kandidaten: [10] })), 10)
const ws = [weg], nahe = () => true

describe('Ergänzter Anschluss am Brückenkopf', () => {
  it('nimmt die AV-Breite, schneidet vorhandene tragende Brückenflächen aus und bleibt vollständig innerhalb der AV', () => {
    const proben = anschlussProben(ws, strasse, nahe)
    const deck: Multi = [[[[2, -3], [5, -3], [5, 3], [2, 3]]]]
    const fl = anschlussFlaechen(proben, proben.flatMap(() => [5, 5, 5]), strasse, deck, ws, nahe)
    expect(fl.length).toBeGreaterThan(0)
    expect(flaeche(fl.map(f => f.ringe))).toBeCloseTo(8, 6)
    expect(fl.flatMap(f => f.ringe.flat()).every(p => p[0] >= 0 && p[0] <= 2 && p[1] >= -2 && p[1] <= 2)).toBe(true)
    expect(fl.flatMap(f => f.hoehen.flat()).every(h => h === 10)).toBe(true)
  })
  it('ohne AV, Brückennähe oder mehr als 0,3 m Höhendifferenz entsteht keine Fläche', () => {
    expect(anschlussProben(ws, [], nahe)).toEqual([])
    expect(anschlussProben(ws, strasse, () => false)).toEqual([])
    const ps = anschlussProben(ws, strasse, nahe)
    expect(anschlussFlaechen(ps, ps.flatMap(() => [9.8, 9.8, 9.8]), strasse, [], ws, nahe)).toEqual([])
    expect(anschlussFlaechen(ps, ps.flatMap(() => [null, null, null]), strasse, [], ws, nahe)).toEqual([])
  })
  it('ergänzt keine von einem vorhandenen swissTLM3D-Deck getragenen Abschnitte', () => {
    const ps = anschlussProben(ws, strasse, nahe)
    expect(anschlussFlaechen(ps, ps.flatMap(() => [5, 5, 5]), strasse, [], ws, nahe, ps.flatMap(() => [true, true, true]))).toEqual([])
  })
  it('unklare Fahrbahnhöhen werden weder überspannt noch als Anschluss gezeichnet', () => {
    const unklar = fahrbahnVerfolgen([0, 1, 2].map((x, i) => ({ p: [x, 0] as P, kandidaten: i ? [] : [10] })), 10)
    expect(anschlussProben([unklar], strasse, nahe)).toEqual([])
  })
  it('ein Weg am AV-Rand kann trotz Ersatzbreite nie ausserhalb der Strasse zeichnen', () => {
    const rand = fahrbahnVerfolgen([0, 1, 2, 3].map(x => ({ p: [x, 2] as P, kandidaten: [10] })), 10)
    const ps = anschlussProben([rand], strasse, nahe)
    const fl = anschlussFlaechen(ps, ps.flatMap(() => [5, 5, 5]), strasse, [], [rand], nahe)
    expect(fl.length).toBeGreaterThan(0)
    expect(fl.flatMap(f => f.ringe.flat()).every(p => enthaelt(strasse, [Math.min(3.999, Math.max(0.001, p[0])), Math.min(1.999, Math.max(-1.999, p[1]))]))).toBe(true)
    expect(fl.flatMap(f => f.ringe.flat()).every(p => p[1] >= -2 && p[1] <= 2)).toBe(true)
  })
  it('20-m-Grenze bezieht sich auf den wirklichen Umriss', () => {
    expect(naheUmriss([10, 0], strasse)).toBe(true)
    expect(naheUmriss([25, 0], strasse)).toBe(false)
  })
})
