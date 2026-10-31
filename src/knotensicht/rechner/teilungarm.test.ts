// Tests Befund 31.10.2026 (Knoten 282773328, synthetisch nachgebaut): ein Arm der Vortrittsstrasse teilt sich nach 30 m in zwei
// Einbahnen. Die Fahrlinie des Verkehrs zum Knoten folgt der zuführenden Einbahn, nicht dem Weg mit der kleinsten Richtungsänderung.
// Knoten 12: Hauptstrasse West–Ost (Weg 1, beide Richtungen, bis zum Punkt 13 bei x = 30), Nebenstrasse (Weg 5) nach Süden als Zufahrt.
// Am Punkt 13: Weg 2 = Einbahn vom Knoten weg, Weg 3 = Einbahn zum Knoten. Rechtsverkehr: die Einbahn zum Knoten (westwärts) liegt
// nördlich (y = 9), die wegführende südlich (y = −6, kleinere Richtungsänderung); spiegelverkehrt umgekehrt.

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz } from './netz'
import { OsmAchsen } from './achsen'
import { armMittellinieMitEnde, querschnitt, randLinksBei } from './hauptachsen'
import { einbahnTeilung, fahrbahnteilung, knotenArt, teilungsFortsetzung } from './knoten'
import { rechneKnoten } from './rechnen'
import { Fahrbahn } from './flaechen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const rechteck = (x0: number, y0: number, x1: number, y1: number) =>
  flaeche('Strasse_Weg', [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)])
const HAUPT = { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '50' }
const NEBEN = '5:0:1'

/** s = 1: Einbahn zum Knoten nördlich (Rechtsverkehr, Fahrbahnteilung); s = −1 spiegelverkehrt. wegTags: Tags der wegführenden
 *  Einbahn, zuTags: der zuführenden; tempo: maxspeed der Hauptstrasse */
const osm = (s: 1 | -1 = 1, wegTags: Record<string, string> = {}, zuTags: Record<string, string> = {}, tempo = '50'): OsmDaten => {
  const T = { ...HAUPT, maxspeed: tempo }
  return {
    wege: [
      weg(1, [[10, -250, 0], [12, 0, 0], [13, 30, 0]], T),
      weg(2, [[13, 30, 0], [21, 60, -6 * s], [22, 300, -6 * s]], { ...T, oneway: 'yes', ...wegTags }),
      weg(3, [[32, 300, 9 * s], [31, 60, 9 * s], [13, 30, 0]], { ...T, oneway: 'yes', ...zuTags }),
      weg(5, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
    ],
    tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
  }
}
/** AV: Hauptstrasse 8 m breit bis x = 30, Aufweitung bis x = 60, danach zwei Fahrbahnen je 3,50 m um die Einbahnen */
const av = (s: 1 | -1 = 1): AvFlaeche[] => [
  rechteck(-250, -4, 30, 4), rechteck(30, -11, 60, 11),
  rechteck(60, 9 * s - 1.75, 300, 9 * s + 1.75), rechteck(60, -6 * s - 1.75, 300, -6 * s + 1.75),
  rechteck(-3, -200, 3, -4),
]
/** Lage der Achse bei x (nächster Punkt der Polylinie) */
const yBei = (linie: P[], x: number) => linie.reduce((b, p) => (Math.abs(p[0] - O[0] - x) < Math.abs(b[0] - O[0] - x) ? p : b))[1] - O[1]
const rechne = (o: OsmDaten, a: AvFlaeche[], zufahrt = NEBEN) => rechneKnoten(o, a, { knoten: 12, zufahrt }).ergebnis!

describe('Arm teilt sich in zwei Einbahnen: Fahrlinie auf der zuführenden (Befund 31.10.2026)', () => {
  it('einbahnTeilung und Fortsetzung: am Wegende von Weg 1 auf die zuführende Einbahn (Weg 3), auch spiegelverkehrt', () => {
    for (const s of [1, -1] as const) {
      const netz = new OsmNetz(osm(s))
      expect(einbahnTeilung(netz, 13)).toEqual({ beide: [1, 2, -1], zu: [3, 2, -1], weg: [2, 0, 1] })
      expect(teilungsFortsetzung(netz)(13, 1)).toBe(3)
      expect(teilungsFortsetzung(netz, 'weg')(13, 1)).toBe(2)
      expect(teilungsFortsetzung(netz)(13, 2)).toBeNull()
      expect(teilungsFortsetzung(netz)(12, 1)).toBeNull()
    }
    // Rechtsverkehr: Fahrbahnteilung (kein Knoten); spiegelverkehrt kreuzen sich die Ströme: Knoten, die Fahrlinie folgt trotzdem
    expect(fahrbahnteilung(new OsmNetz(osm(1)), 13)).not.toBeNull()
    expect(knotenArt(new OsmNetz(osm(-1)), 13)).toBe('knoten')
  })
  it('armMittellinieMitEnde: Teilung bei 30 m, Linie auf Weg 3; ohne Vorgabe (spurMitEnde) wie bisher auf Weg 2', () => {
    const netz = new OsmNetz(osm())
    const achsen = new OsmAchsen(netz)
    const arm = { wid: 1, i: 1, sd: 1, richtung: [1, 0] as P }
    const m = armMittellinieMitEnde(netz, achsen, arm, 200)
    expect(m.teilungen).toEqual([{ ab: expect.closeTo(30, 3), knoten: 13, wid: 3 }])
    expect(m.abschnitte).toEqual([expect.closeTo(30, 3)])
    expect(yBei(m.linie, 150)).toBeCloseTo(9, 3)
    expect(yBei(armMittellinieMitEnde(netz, achsen, arm, 200, 'weg').linie, 150)).toBeCloseTo(-6, 3)
    const alt = achsen.spurMitEnde([achsen.linien.findIndex(l => l.wid === 1), 1, 0], [1, 0], 200)
    expect(yBei(alt.linie, 150)).toBeCloseTo(-6, 3)
    expect(alt.wechsel).toEqual([{ ab: expect.closeTo(30, 3), knoten: 13, von: 1, nach: 2, vorgabe: false }])
  })
  it('Querschnitt je Abschnitt: hinter der Teilung der Rand der Einbahn (Rand links von u 1,75 m), nicht als Ausreisser verworfen', () => {
    const netz = new OsmNetz(osm())
    const m = armMittellinieMitEnde(netz, new OsmAchsen(netz), { wid: 1, i: 1, sd: 1, richtung: [1, 0] }, 200)
    const fb = new Fahrbahn(av())
    const qs = querschnitt(netz, fb, m.linie, 1, undefined, undefined, m.abschnitte)
    expect(qs.quelle).toContain('in 2 Abschnitten (Fahrbahn geteilt)')
    expect(randLinksBei(qs, 20)).toBeCloseTo(4, 1)
    expect(randLinksBei(qs, 150)).toBeCloseTo(1.75, 1)
    // ohne Abschnitte verwirft das eine Randprofil die schmale Fahrbahn: der Rand bliebe bei 4 m
    expect(randLinksBei(querschnitt(netz, fb, m.linie, 1), 150)).toBeCloseTo(4, 1)
  })
  it('Rechnung: Fahrlinie von rechts 1,50 m vom rechten Rand der zuführenden Einbahn; Annahme und Herleitung', () => {
    const e = rechne(osm(), av())
    const r = e.richtungen.find(x => x.richtung === 'rechts')!
    expect(r.status).not.toBe('keine_zufahrt')
    expect(yBei(r.achse, 110)).toBeCloseTo(10.75 - 1.5, 1)
    // Velo im Mischverkehr 0,50 m vom selben Rand
    expect(yBei(r.velo!.achse, 70)).toBeCloseTo(10.75 - 0.5, 1)
    // Arm links unverändert (keine Teilung)
    expect(yBei(e.richtungen.find(x => x.richtung === 'links')!.achse, -100)).toBeCloseTo(-4 + 1.5, 1)
    expect(e.annahmen.join(' ')).toContain('Die Fahrbahn von rechts (Hauptstrasse) teilt sich nach 30 m in zwei Einbahnen. Ab dort folgt ' +
      'die Fahrlinie der Einbahn, auf der die Fahrzeuge zum Knoten fahren.')
    expect(e.herleitung).toContain('Fahrlinie nach rechts ab 30 m (Teilung am OSM-Knoten 13): auf der zuführenden Einbahn (OSM-Weg 3); ' +
      'Rand, Breite und Parkierung von dieser Fahrbahn, Randprofil je Abschnitt.')
  })
  it('spiegelverkehrt: Fahrlinie auf der südlichen Einbahn (zum Knoten), 1,50 m von ihrem rechten (nördlichen) Rand', () => {
    const r = rechne(osm(-1), av(-1)).richtungen.find(x => x.richtung === 'rechts')!
    expect(yBei(r.achse, 110)).toBeCloseTo(-9 + 1.75 - 1.5, 1)
  })
  it('Velos gegen die wegführende Einbahn: Punkt 13 bleibt ein Knoten, die Fahrlinie folgt trotzdem der zuführenden', () => {
    const o = osm(1, { 'oneway:bicycle': 'no' })
    expect(knotenArt(new OsmNetz(o), 13)).toBe('knoten')
    const r = rechne(o, av()).richtungen.find(x => x.richtung === 'rechts')!
    expect(yBei(r.achse, 110)).toBeCloseTo(10.75 - 1.5, 1)
  })
  it('Veloführung: Radstreifen auf der zuführenden Einbahn gilt ab der Teilung (Achsen gleiten über 10 m), am Knoten Mischverkehr', () => {
    const r = rechne(osm(1, {}, { cycleway: 'lane' }), av()).richtungen.find(x => x.richtung === 'rechts')!
    expect(r.veloFuehrung).toBe('misch')
    expect(yBei(r.achse, 110)).toBeCloseTo(10.75 - 1.5 - 1.5, 1)
    expect(yBei(r.achse, 15)).toBeCloseTo(4 - 1.5, 1)
    expect(yBei(r.velo!.achse, 15)).toBeCloseTo(4 - 0.5, 1)
    expect(yBei(r.velo!.achse, 70)).toBeCloseTo(10.75 - 0.75, 1)
    expect(r.lageQuelle).toContain('; ab der Teilung der Fahrbahn nach 30 m Radstreifen (OSM cycleway=lane, zuführende Einbahn, OSM-Weg 3)')
    // Radweg statt Radstreifen: nur Hinweis, gerechnet wie am Knoten
    const e = rechne(osm(1, {}, { cycleway: 'track' }), av())
    expect(e.hinweise).toContain('1 Hauptstrasse (Ost): Die Fahrbahn teilt sich nach 30 m in zwei Einbahnen. Für die Einbahn zum Knoten ' +
      'nennt OSM «Radweg» (OSM cycleway=track (ohne eigene Linie), Weg 3); gerechnet ist mit «Mischverkehr» wie am Knoten. Veloführung vor ' +
      'Ort prüfen.')
  })
  it('kurze zuführende Einbahn: Hinweis zum Ende der OSM-Linie mit der Länge über die Teilung hinweg', () => {
    // die zuführende Einbahn beginnt 17,5 m nach der Teilung; ausserorts (80 km/h), damit A darüber hinaus reicht
    const o = osm(1, {}, {}, '80')
    o.wege[2] = weg(3, [[31, 45, 9], [13, 30, 0]], { ...HAUPT, maxspeed: '80', oneway: 'yes' })
    const netz = new OsmNetz(o)
    const m = armMittellinieMitEnde(netz, new OsmAchsen(netz), { wid: 1, i: 1, sd: 1, richtung: [1, 0] }, 200)
    expect(m.ende).toEqual({ geradeAb: expect.closeTo(47.5, 0), knoten: 31, wege: [1, 3] })
    const r = rechne(o, av()).richtungen.find(x => x.richtung === 'rechts')!
    expect(r.massgebend).toBeGreaterThan(48)
    expect(r.hinweise).toContain('Arm 1 Hauptstrasse (Ost) endet nach 47 m (Ende der OSM-Linie). Weiter weg nimmt die App die Fahrlinie ' +
      'gerade an; Sicht und Lage von F_A dort vor Ort prüfen.')
  })
})

// Zufahrt teilt sich: Nebenstrasse (Weg 5) beide Richtungen bis zum Punkt 14 (20 m südlich des Knotens), dann nordwärts (zum Knoten)
// auf Weg 6 östlich, südwärts auf Weg 7 westlich. Hauptstrasse ohne Teilung.
const zufahrtGeteilt = (geteilt: boolean): OsmDaten => ({
  wege: [
    weg(1, [[10, -250, 0], [12, 0, 0], [11, 250, 0]], HAUPT),
    ...(geteilt ? [
      weg(5, [[12, 0, 0], [14, 0, -20]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
      weg(6, [[41, 6, -200], [40, 6, -50], [14, 0, -20]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30', oneway: 'yes' }),
      weg(7, [[14, 0, -20], [42, -6, -50], [43, -6, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30', oneway: 'yes' }),
    ] : [weg(5, [[12, 0, 0], [14, 0, -20], [44, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' })]),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const avZufahrt: AvFlaeche[] = [rechteck(-250, -4, 250, 4), rechteck(-3, -20, 3, -4), rechteck(-9, -50, 9, -20),
  rechteck(4.25, -200, 7.75, -50), rechteck(-7.75, -200, -4.25, -50)]

describe('Zufahrt teilt sich in zwei Einbahnen (Befund 31.10.2026)', () => {
  it('Achse der Zufahrt folgt der zuführenden Einbahn; Querschnitte bis zur Teilung, D wie ohne Teilung; Annahme und Herleitung', () => {
    const e = rechne(zufahrtGeteilt(true), avZufahrt)
    const ohne = rechne(zufahrtGeteilt(false), [rechteck(-250, -4, 250, 4), rechteck(-3, -200, 3, -4)])
    expect(e.D[0]).toBeCloseTo(ohne.D[0], 1)
    expect(e.D[1]).toBeCloseTo(ohne.D[1], 1)
    expect(e.annahmen.join(' ')).toContain('Die Fahrbahn der Zufahrt teilt sich nach 20 m in zwei Einbahnen. Gerechnet ist ' +
      'auf der Einbahn, auf der die Fahrzeuge zum Knoten fahren.')
    expect(e.herleitung).toContain('Zufahrt: ab 20 m (Teilung am OSM-Knoten 14) auf der zuführenden Einbahn (OSM-Weg 6); Querschnitte bis ' +
      'zur Teilung.')
    // ohne Teilung keine solchen Sätze
    expect(ohne.annahmen.join(' ')).not.toContain('teilt sich')
    expect(ohne.herleitung!.some(h => h.startsWith('Zufahrt: ab'))).toBe(false)
  })
})
