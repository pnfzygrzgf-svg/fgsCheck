// Platz neben der Zufahrt (Befund 31.10.2026, OSM-Knoten 132629283 Hubelmattstrasse am Loryplatz, Bern): die AV führt den Platz als
// Strasse_Weg, quer zur Zufahrt liegt auf einer Seite kein Fahrbahnrand innert der Suchlänge (SEHNE_HALB). Bisher zählten diese Sehnen
// in fahrstreifenmitte mit 22 m als Rand: Fahrbahn rund 24 m, Achse des Zufahrtsstreifens und D rund 20 m neben der Zufahrt.
//
// Lage (Meter, x Ost, y Nord, Ursprung = OSM-Knoten), wie achslage.test.ts:
//   Hauptstrasse West–Ost, Fahrbahn y = −3 … +3; Nebenstrasse (Zufahrt) von Süden, Fahrbahn x = −2,5 … +2,5.
//   Platz östlich der Zufahrt: x = 2,5 … 30 für y = −28 … −3, x = 2,5 … 19 für y = −40 … −28 (dort trifft die Sehne einen fernen
//   Rand bei x = 19, wie am Loryplatz der Rand der Weissensteinstrasse jenseits des Platzes).

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneKnoten } from './rechnen'
import { Fahrbahn } from './flaechen'
import { querschnitt } from './hauptachsen'
import { OsmNetz } from './netz'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const rel = (p: P): [number, number] => [p[0] - O[0], p[1] - O[1]]
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (nebenTags: Record<string, string> = {}): OsmDaten => ({
  wege: [weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30' }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30', ...nebenTags })],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const mitPlatz = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -40), lv(19, -40),
  lv(19, -28), lv(30, -28), lv(30, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)])

describe('Platz neben der Zufahrt (AV ohne Fahrbahnrand innert der Suchlänge)', () => {
  it('Zufahrt: kein AV-Querschnitt, Lage aus OSM; D auf der Zufahrt statt rund 20 m daneben; Hinweis', () => {
    const e = rechneKnoten(osm(), [mitPlatz], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
    expect(e.zufahrtLageQuelle).toBe('Achse des Zufahrtsstreifens ohne genügend AV-Querschnitte: feste Lage 1,75 m rechts der OSM-Achse angenommen')
    for (const [x, y] of e.zufahrtAchse.map(rel)) expect(Math.abs(x - 1.75), `x ${x} bei y ${y}`).toBeLessThan(1e-6)
    const [xd, yd] = rel(e.D)
    expect(xd).toBeGreaterThan(-2.5)
    expect(xd).toBeLessThan(2.5)
    expect(yd).toBeGreaterThan(-10)
    expect(e.hinweise.some(h => h.startsWith('Neben der Zufahrt liegt nach der AV eine weite Fahrbahnfläche (an 11 von 16 Querschnittstellen'))).toBe(true)
  })
  it('Einbahn vom Knoten weg mit Velo im Gegenverkehr: D auf der OSM-Achse statt am fernen Rand', () => {
    const e = rechneKnoten(osm({ oneway: 'yes', 'oneway:bicycle': 'no' }), [mitPlatz], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
    expect(e.zufahrtVelo).not.toBeNull()
    const [xd] = rel(e.D)
    expect(Math.abs(xd)).toBeLessThan(0.5)
  })
  it('querschnitt eines Arms entlang des Platzes: an der Mehrheit der Stellen kein Rand, Breite nicht aus wenigen fernen Sehnen', () => {
    const netz = new OsmNetz(osm())
    const fb = new Fahrbahn([mitPlatz])
    const qs = querschnitt(netz, fb, [lv(0, 0), lv(0, -200)], 2)
    expect(qs.annahme).toBe(true)
    expect(qs.quelle).toContain('kein Fahrbahnrand innert 22 m')
    expect(qs.links).toBe(3)
    // ein gewöhnlicher Arm bleibt beim AV-Querschnitt (Ostarm der Hauptstrasse ab x = 32: Rand bei y = −3 und +3)
    const qsOst = querschnitt(netz, fb, [lv(30, 0), lv(200, 0)], 1)
    expect(qsOst.annahme).toBe(false)
    expect(qsOst.links).toBeCloseTo(3, 6)
    expect(qsOst.rechts).toBeCloseTo(3, 6)
  })
})
