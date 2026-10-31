// Tests Parkstreifen an den Achsen (Folgeauftrag E2a, rechner/hauptachsen.ts parkStreifen; rechnen.ts): Abzug 1,90 m für die
// Fahrstreifenachse der Vortrittsstrasse und für die Achse des Zufahrtsstreifens, einzelnes Feld ohne Abzug, Zweirad ohne
// Wirkung, FA ausserhalb der Parkfelder.
//
// Lage wie rechnen.test.ts (Meter, x Ost, y Nord, Ursprung = OSM-Knoten), ohne Gebäude: Hauptstrasse West–Ost, Fahrbahn
// y = −3 … +3; Nebenstrasse von Süden, x = −2,5 … +2,5 (5 m). Zufahrt von Süden: Achse x = +1,25, D = (0,75; −6).
// Nach links: Verkehr von Westen, rechter Rand y = −3, Achse y = −1,5 (ohne Parkstreifen) bzw. y = +0,4 (mit, 1,50 + 1,90 m).
// Nach rechts: Verkehr von Osten, rechter Rand y = +3, Achse y = +1,5.

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { KatasterFeld } from '../daten/parkkataster'
import { rechneKnoten } from './rechnen'
import { KEINE_HINDERNISSE, type HindernisEingaben, type RichtungErgebnis } from './typen'
import { parkStreifen, PARK_EIN_FELD_TREFFER } from './hauptachsen'
import { HindernisDaten } from './hindernisse'
import { faLage, autoUmriss } from './fahrzeug'
import { flaeche, schnitt } from './poly'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const rel = (p: P) => [p[0] - O[0], p[1] - O[1]]
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm: OsmDaten = {
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30' }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
}
const fahrbahn: AvFlaeche = { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[lv(-200, -3), lv(-2.5, -3),
  lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)]] }
const feld = (id: string, ring: P[], klasse: KatasterFeld['klasse'] = 'auto'): KatasterFeld => ({ id, klasse, ring, name: id })
const park = (felder: KatasterFeld[]): HindernisEingaben => ({ ...KEINE_HINDERNISSE, park: { felder, quellenangabe: 'Test' } })
const rechne = (h: HindernisEingaben) => rechneKnoten(osm, [fahrbahn], { knoten: 12, zufahrt: null, hindernisse: h }).ergebnis!
const links = (e: ReturnType<typeof rechne>) => e.richtungen.find(r => r.richtung === 'links') as RichtungErgebnis
const rechts = (e: ReturnType<typeof rechne>) => e.richtungen.find(r => r.richtung === 'rechts') as RichtungErgebnis
/** Parkfelder 5 × 2 m auf der Fahrbahn am Südrand (y = −3 … −1), x von x0 nach Westen, 1 m Lücke */
const suedreihe = (x0: number, n: number, klasse: KatasterFeld['klasse'] = 'auto') =>
  Array.from({ length: n }, (_, i) => feld(`s${i}`, rechteck(x0 - 6 * i - 5, -3, x0 - 6 * i, -1), klasse))

describe('Parkstreifen an der Fahrstreifenachse der Vortrittsstrasse', () => {
  it('ohne Parkfelder: d = 1,50 m, Achse y = −1,5, kein Parkstreifen', () => {
    const l = links(rechne(KEINE_HINDERNISSE))
    expect(l.randAbstand).toBeCloseTo(1.5, 6)
    expect(rel(l.K)[1]).toBeCloseTo(-1.5, 2)
    expect(l.lageQuelle).toContain('kein Parkstreifen rechts (0 von 27 Prüfpunkten)')   // 0 … 52 m je 2 m
  })
  it('Reihe am rechten Rand (nach links): Achse 1,90 m nach innen, K verschoben, FA ausserhalb jedes Parkfelds, Sicht frei', () => {
    const felder = suedreihe(-10, 8)                   // x = −10 … −57
    const e = rechne(park(felder))
    const l = links(e)
    expect(l.parkStreifen.abzug).toBeCloseTo(1.9, 6)
    expect(l.parkStreifen.felder).toBe(8)
    expect(l.randAbstand).toBeCloseTo(3.4, 6)
    expect(rel(l.K)[0]).toBeCloseTo(1.25, 2)
    expect(rel(l.K)[1]).toBeCloseTo(0.4, 2)
    expect(rel(l.achse[l.achse.length - 1])[1]).toBeCloseTo(0.4, 2)
    expect(l.lageQuelle).toMatch(/Abzug 1,90 m für Parkstreifen rechts \(\d+ von 27 Prüfpunkten, 8 Felder\)/)
    // FA am Ende von A: Umriss 4,5 × 1,8 m um die Achse y = 0,4 (y = −0,5 … 1,3) schneidet kein Feld (y ≤ −1)
    const fa = faLage(l.sichtpunkte, Math.min(l.massgebend, l.sichtpunkte.length - 1))!
    const umriss = autoUmriss(fa[0], fa[1])
    for (const f of felder) expect(flaeche(schnitt([[umriss]], [[f.ring]]))).toBe(0)
    // Sicht: Ecke (−10; −1) des ersten Felds, Achse y = 0,4: s = 0,5 + 10,75 · 6,4 / 5 = 14,26 m
    expect(Math.abs(l.vorhanden - (0.5 + 10.75 * 6.4 / 5))).toBeLessThan(0.01)
    // nach rechts (Rand y = +3) kein Parkstreifen
    expect(rechts(e).parkStreifen.abzug).toBe(0)
    expect(rel(rechts(e).K)[1]).toBeCloseTo(1.5, 2)
    expect(e.annahmen.join(' | ')).toContain('Parkierung: von links ja, von rechts nein.')
    expect(e.herleitung!.join(' | ')).toContain('Fahrlinie nach links: ')
    expect(e.herleitung!.join(' | ')).toContain('Abzug 1,90 m für Parkstreifen rechts')
  })
  it('ein einzelnes Feld (5 m): Treffer nur an einem Feld, unter 4: kein Abzug; zwei Felder: Abzug', () => {
    const eins = links(rechne(park(suedreihe(-20, 1))))
    expect(eins.parkStreifen.treffer).toBeGreaterThanOrEqual(1)
    expect(eins.parkStreifen.treffer).toBeLessThan(PARK_EIN_FELD_TREFFER)
    expect(eins.parkStreifen.abzug).toBe(0)
    expect(eins.randAbstand).toBeCloseTo(1.5, 6)
    expect(links(rechne(park(suedreihe(-20, 2)))).parkStreifen.abzug).toBeCloseTo(1.9, 6)
  })
  it('Velo-Felder verschieben die Fahrlinie wie Auto-Felder (Korrektur Punkt 23, 31.10.2026)', () => {
    expect(links(rechne(park(suedreihe(-10, 8, 'velo')))).parkStreifen.abzug).toBeCloseTo(1.9, 6)
    expect(links(rechne(park(suedreihe(-10, 8, 'motorrad')))).parkStreifen.abzug).toBeCloseTo(1.9, 6)
  })
  it('verworfene Felder und Felder ausserhalb der Fahrbahn: kein Abzug', () => {
    const felder = suedreihe(-10, 8)
    expect(links(rechne({ ...park(felder), verworfen: felder.map(f => f.id) })).parkStreifen.abzug).toBe(0)
    // Parkbucht hinter dem Rand (y = −5 … −3): Prüfpunkt bei y = −2,05 ist 0,95 m entfernt (über 0,4 m)
    const bucht = Array.from({ length: 8 }, (_, i) => feld(`b${i}`, rechteck(-15 - 6 * i, -5, -10 - 6 * i, -3)))
    expect(links(rechne(park(bucht))).parkStreifen.treffer).toBe(0)
  })
  it('Längsparkierung (ein Polygon) über mehr als 8 m zählt als Streifen', () => {
    const lp = links(rechne({ ...KEINE_HINDERNISSE, hindernisse: [{ id: 'lp', art: 'laengsparkierung', linie: [lv(-12, -2), lv(-40, -2)],
      breite: 2, quelle: 'hand' }] }))
    expect(lp.parkStreifen.felder).toBe(1)
    expect(lp.parkStreifen.abzug).toBeCloseTo(1.9, 6)
  })
  it('parkStreifen direkt: Regel Treffer an 2 Feldern bzw. 4 an einem Feld', () => {
    const pr = new HindernisDaten([{ id: 'a', art: 'parkfeld', klasse: 'auto', ring: rechteck(0, 0, 10, 2), quelle: 'hand' }]).park
    const sonden = (n: number) => Array.from({ length: n }, (_, i) => lv(1 + 2 * i, 1))
    expect(parkStreifen(sonden(3), pr)).toEqual({ abzug: 0, treffer: 3, punkte: 3, felder: 1 })
    expect(parkStreifen(sonden(4), pr).abzug).toBeCloseTo(1.9, 6)
    expect(parkStreifen(sonden(4), null)).toEqual({ abzug: 0, treffer: 0, punkte: 4, felder: 0 })
  })
})

describe('Parkstreifen auf der Zufahrt: Achse, D und FB nach links', () => {
  // Zufahrt (Nebenstrasse) 5 m breit, Gegenverkehr: ohne Abzug Mitte der rechten Hälfte x = +1,25, D = (0,75; −6).
  // Parkfelder am rechten Rand (Ost, x = 0,5 … 2,5, 2 m auf der Fahrbahn) von y = −7 bis −60: Abzug 1,90 m rechts, Rest
  // 5 − 1,9 = 3,1 m auf zwei Richtungen, je 1,55 m: Mitte 2,5 − 1,9 − 0,775 = −0,175; D = (−0,675; −6).
  const ost = Array.from({ length: 9 }, (_, i) => feld(`z${i}`, rechteck(0.5, -12 - 6 * i, 2.5, -7 - 6 * i)))
  it('ohne Felder: D bei (0,75; −6)', () => {
    const d = rel(rechne(KEINE_HINDERNISSE).D)
    expect(d[0]).toBeCloseTo(0.75, 2); expect(d[1]).toBeCloseTo(-6, 2)
  })
  it('mit Feldern rechts: Achse und D um 1,90 / 2 + … nach links; Quelle und Annahme nennen den Abzug', () => {
    const e = rechne(park(ost))
    const d = rel(e.D)
    expect(d[0]).toBeCloseTo(-0.675, 2); expect(d[1]).toBeCloseTo(-6, 2)
    expect(e.zufahrtLageQuelle).toContain('Abzug 1,90 m für Parkstreifen rechts')
    // Wortlaut des Auftraggebers (Korrektur 31.10.2026, Punkt 5)
    expect(e.annahmen.join(' | ')).toContain('Parkierung entlang Zufahrt. Von der verfügbaren Fahrbahnbreite werden 1,90 m für Parkfelder ' +
      'abgezogen. Achse des Zufahrtsstreifens, D und FB entsprechend verschoben.')
    expect(e.hindernis.inD).toEqual([])                // D liegt nicht in einem Feld
  })
})
