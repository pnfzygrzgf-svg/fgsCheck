// Tests Korrektur 31.10.2026, Punkt 17 (synthetische Netze): Fahrbahnteilung und Zuordnung der Vortrittssignale.
// Fahrbahnteilung am Punkt 12: Arm Süd mit beiden Richtungen (Weg 1, zum Punkt digitalisiert), Einbahn vom Punkt weg nach Nordost (Weg 2),
// Einbahn aus Nordwest zum Punkt (Weg 3). Spiegelverkehrt: die wegführende Einbahn liegt links der zuführenden.

import { describe, expect, it } from 'vitest'
import { wgs, lv95, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz } from './netz'
import { knotenArt, knotenFinden, keineKnoten, knotenInfo, vortrittsSignale, fahrbahnteilung, FAHRBAHNTEILUNG_TEXT, TEILUNG_KREISEL_TEXT,
  TEILUNG_KREISEL_M, TEILUNG_WINKEL_GRAD, ZUSAMMENFUEHRUNG_TEXT } from './knoten'
import { rechneKnoten } from './rechnen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const punkt = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => { const [lat, lon] = ll(x, y); return { id, tags, lat, lon } }
const daten = (wege: OsmWeg[], vortritt: OsmKnoten[] = []): OsmDaten =>
  ({ wege, tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt })
const T = { highway: 'residential', name: 'Sandweg', maxspeed: '50' }
/** Fahrbahnteilung; spiegel: wegführende Einbahn links; wegTags: Tags der wegführenden Einbahn; mehr: weitere Wege */
const teilung = (spiegel = false, wegTags: Record<string, string> = {}, mehr: OsmWeg[] = []): OsmDaten => {
  const s = spiegel ? -1 : 1
  return daten([
    weg(1, [[10, 0, -200], [12, 0, 0]], T),
    weg(2, [[12, 0, 0], [21, 15 * s, 40]], { ...T, oneway: 'yes', ...wegTags }),
    weg(3, [[31, -15 * s, 40], [12, 0, 0]], { ...T, oneway: 'yes' }),
    ...mehr,
  ])
}
const kreisel = (x: number, y: number) => weg(5, [[21, x, y], [50, x + 25, y + 20], [51, x, y + 40], [52, x - 25, y + 20], [21, x, y]],
  { highway: 'residential', junction: 'roundabout' })

describe('Punkt 17: Fahrbahnteilung', () => {
  it('beide Richtungen + Einbahn zum Punkt + Einbahn weg (rechts): keine Rechnung, Meldung, von der Suche ausgeblendet', () => {
    const o = teilung()
    const netz = new OsmNetz(o)
    expect(knotenArt(netz, 12)).toBe('fahrbahnteilung')
    expect(fahrbahnteilung(netz, 12)).toEqual({ zu: [3, 1, -1], weg: [2, 0, 1] })
    expect(knotenFinden(netz)).not.toContain(12)
    expect(keineKnoten(netz)).toContain(12)
    const r = rechneKnoten(o, [], { knoten: 12, zufahrt: null })
    expect([r.ergebnis, r.knoten, r.meldungen]).toEqual([null, null, [`${FAHRBAHNTEILUNG_TEXT}.`]])
    expect(r.keinKnoten).toContain(12)
    expect(FAHRBAHNTEILUNG_TEXT).toBe('Fahrbahnteilung: Hier teilt sich die Fahrbahn in zwei Einbahnen, die Fahrströme kreuzen sich nicht; ' +
      'kein Vortrittsfall')
    expect([TEILUNG_WINKEL_GRAD, TEILUNG_KREISEL_M]).toEqual([60, 60])
  })
  it('spiegelverkehrt (wegführende Einbahn links der zuführenden): die Ströme kreuzen sich, Knoten', () => {
    expect(knotenArt(new OsmNetz(teilung(true)), 12)).toBe('knoten')
  })
  it('Velos gegen die wegführende Einbahn: sie münden in den Strom aus der zuführenden, Knoten', () => {
    expect(knotenArt(new OsmNetz(teilung(false, { 'oneway:bicycle': 'no' })), 12)).toBe('knoten')
    expect(knotenArt(new OsmNetz(teilung(false, { cycleway: 'opposite_lane' })), 12)).toBe('knoten')
  })
  it('Einbahnen weiter als 60° auseinander (z. B. durchgehende Einbahn mit Seitenstrasse): Knoten', () => {
    const o = daten([
      weg(1, [[10, 0, -200], [12, 0, 0]], T),
      weg(2, [[12, 0, 0], [21, 200, 0]], { ...T, oneway: 'yes' }),
      weg(3, [[31, -200, 0], [12, 0, 0]], { ...T, oneway: 'yes' }),
    ])
    expect(knotenArt(new OsmNetz(o), 12)).toBe('knoten')
  })
  it('Einbahn führt innert 60 m in einen Kreisel: Zusatz zur Meldung; Kreisel weiter weg: ohne Zusatz', () => {
    const nah = teilung(false, {}, [kreisel(15, 40)])
    expect(knotenArt(new OsmNetz(nah), 12)).toBe('fahrbahnteilung')
    expect(rechneKnoten(nah, [], { knoten: 12, zufahrt: null }).meldungen).toEqual([`${FAHRBAHNTEILUNG_TEXT}; ${TEILUNG_KREISEL_TEXT}.`])
    expect(TEILUNG_KREISEL_TEXT).toBe('Teil der Zufahrt zum Kreisverkehr (siehe VSS 40 263)')
    // Einbahn verlängert: 15 m zum Punkt 21, dann 80 m weiter zum Kreisel
    const fern = daten([
      weg(1, [[10, 0, -200], [12, 0, 0]], T),
      weg(2, [[12, 0, 0], [22, 15, 40], [21, 15, 120]], { ...T, oneway: 'yes' }),
      weg(3, [[31, -15, 40], [12, 0, 0]], { ...T, oneway: 'yes' }),
      kreisel(15, 120),
    ])
    expect(rechneKnoten(fern, [], { knoten: 12, zufahrt: null }).meldungen).toEqual([`${FAHRBAHNTEILUNG_TEXT}.`])
  })
})

// T-Knoten 12: Hauptstrasse West–Ost (Weg 1), Nebenstrasse nach Süden (Weg 2, vom Knoten weg digitalisiert)
const tKnoten = (neben: Record<string, string>, signal: [number, number, string] | null): OsmDaten => daten([
  weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '50' }),
  weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30', ...neben }),
], signal ? [punkt(98, signal[0], signal[1], { highway: signal[2] })] : [])
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const fahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const info = (o: OsmDaten) => { const netz = new OsmNetz(o); return knotenInfo(netz, 12, vortrittsSignale(o, netz.p(12), lv95))! }
const NEBEN = '2:0:1', WEST = '1:1:-1', OST = '1:1:1'

describe('Punkt 17: Signal auf einer Einbahn vom Knoten weg', () => {
  it('gehört zum nächsten Knoten: keine Arme mit Vortritt, kein Signal am Knoten', () => {
    const k = info(tKnoten({ oneway: 'yes' }, [0, -15, 'give_way']))
    expect([k.mitVortritt, k.vortrittSicher, k.signale]).toEqual([undefined, undefined, []])
  })
  it('mit Velos gegen die Einbahn zählt es (Velos fahren zum Knoten): Arme mit Vortritt, Vorwahl die Nebenstrasse', () => {
    const k = info(tKnoten({ oneway: 'yes', 'oneway:bicycle': 'no' }, [0, -15, 'give_way']))
    expect([...(k.mitVortritt ?? [])].sort()).toEqual([WEST, OST].sort())
    expect(k.vorschlag).toBe(NEBEN)
    const e = rechneKnoten(tKnoten({ oneway: 'yes', 'oneway:bicycle': 'no' }, [0, -4, 'stop']), [fahrbahn], { knoten: 12, zufahrt: NEBEN }).ergebnis!
    expect([e.regelungVorgabe, e.regelungQuelle]).toEqual(['stop', 'OSM highway=stop an der Zufahrt'])
  })
  it('Vorgabe der Regelung: ein Stop nahe am Knoten auf der wegführenden Einbahn zählt nicht für den Nachbararm', () => {
    // 1 m neben der Nebenstrasse, gut 3 m neben dem Arm West: früher «stop» für die Zufahrt West
    const e = rechneKnoten(tKnoten({ oneway: 'yes' }, [1, -3, 'stop']), [fahrbahn], { knoten: 12, zufahrt: WEST }).ergebnis!
    expect(e.regelungVorgabe).toBe('vortritt')
    expect(e.regelungQuelle.startsWith('ohne Signal in OSM')).toBe(true)
    expect(e.hinweise.some(h => h.includes('Signal «Stop»'))).toBe(false)
    // dieselbe Lage auf einer Nebenstrasse mit Verkehr zum Knoten: zählt wie bisher
    expect(info(tKnoten({}, [1, -3, 'stop'])).signale.length).toBe(1)
  })
})

// Punkt 22 (Nutzer 31.10.2026): Zusammenführung zweier Einbahnen, vorerst Meldung statt Rechnung
describe('Punkt 22: Zusammenführung', () => {
  // Einbahn weg nach West (Weg 1), zwei Einbahnen aus Ost zum Punkt: Weg 2 von (200, 10), Weg 3 von (200, −10) bzw. quer von Nord
  const zusammen = (quer = false, wegTags: Record<string, string> = {}): OsmDaten => daten([
    weg(1, [[12, 0, 0], [10, -200, 0]], { ...T, oneway: 'yes', ...wegTags }),
    weg(2, [[20, 200, 10], [12, 0, 0]], { ...T, oneway: 'yes' }),
    weg(3, quer ? [[30, 0, 200], [12, 0, 0]] : [[30, 200, -10], [12, 0, 0]], { ...T, oneway: 'yes' }),
  ])
  it('zwei Einbahnen spitz zum Punkt, eine weg: keine Rechnung, Meldung, von der Suche ausgeblendet', () => {
    const o = zusammen()
    const netz = new OsmNetz(o)
    expect(knotenArt(netz, 12)).toBe('zusammenfuehrung')
    expect(knotenFinden(netz)).not.toContain(12)
    expect(keineKnoten(netz)).toContain(12)
    const r = rechneKnoten(o, [], { knoten: 12, zufahrt: null })
    expect([r.ergebnis, r.knoten, r.meldungen]).toEqual([null, null, [`${ZUSAMMENFUEHRUNG_TEXT}.`]])
  })
  it('Einbahn mündet quer (90°) in eine Einbahn: Knoten', () => {
    expect(knotenArt(new OsmNetz(zusammen(true)), 12)).toBe('knoten')
  })
  it('Velos gegen die wegführende Einbahn: sie kommen zum Punkt, Knoten', () => {
    expect(knotenArt(new OsmNetz(zusammen(false, { 'oneway:bicycle': 'no' })), 12)).toBe('knoten')
  })
})
