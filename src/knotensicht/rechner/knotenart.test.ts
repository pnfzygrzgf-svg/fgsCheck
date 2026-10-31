// Tests Korrektur 31.10.2026, Punkte 11 bis 16 (synthetische Netze): Arme ohne Zufahrt, Gabelungen, LSA-Knoten, Beschriftung der Regelung,
// Arme mit Vortritt, Kreisel. T-Knoten 12: Hauptstrasse West–Ost (Weg 1, von West nach Ost digitalisiert), Nebenstrasse nach Süden (Weg 2,
// vom Knoten weg digitalisiert); Arme '1:1:-1' West, '1:1:1' Ost, '2:0:1' Süd.

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import { knotenAbfrage } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz } from './netz'
import { knotenArt, knotenFinden, keineKnoten, knotenInfo, keineZufahrt, istLsaKnoten, ampelPunkte, vortrittsSignale, GABELUNG_TEXT,
  KREISEL_TEXT } from './knoten'
import { rechneKnoten, REGELUNG_TEXT, LSA_TEXT } from './rechnen'
import { lv95 } from '../geo'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const punkt = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => { const [lat, lon] = ll(x, y); return { id, tags, lat, lon } }
const osm = (haupt: Record<string, string> = {}, neben: Record<string, string> = {}, mehr: Partial<OsmDaten> = {}): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '50', ...haupt }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30', ...neben }),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [], ...mehr,
})
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const fahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const ecke = flaeche('Gebaeude', [lv(4, -4), lv(4, -24), lv(30, -24), lv(30, -4), lv(4, -4)])
const info = (o: OsmDaten) => {
  const netz = new OsmNetz(o)
  return knotenInfo(netz, 12, vortrittsSignale(o, netz.p(12), lv95), istLsaKnoten(netz, 12, ampelPunkte(o, lv95)))!
}
const NEBEN = '2:0:1', WEST = '1:1:-1', OST = '1:1:1'

describe('Punkt 11: Arm ohne Zufahrt (Einbahn vom Knoten weg ohne Velo gegen die Einbahn)', () => {
  it('nicht als Zufahrt vorgeschlagen; mit Velo gegen die Einbahn bleibt er Zufahrt', () => {
    const k = info(osm({}, { oneway: 'yes' }))
    const n = k.arme.find(a => a.key === NEBEN)!
    expect([n.zufluss, keineZufahrt(n), k.vorschlag]).toEqual([false, true, null])
    const v = info(osm({}, { oneway: 'yes', 'oneway:bicycle': 'no' }))
    const nv = v.arme.find(a => a.key === NEBEN)!
    expect([keineZufahrt(nv), v.vorschlag]).toEqual([false, NEBEN])
  })
})

describe('Punkt 12: Gabelung (höchstens ein Arm führt zum Knoten)', () => {
  // Hauptstrasse Einbahn West -> Ost, Nebenstrasse Einbahn vom Knoten weg: nur der Arm West führt zum Knoten
  const g = osm({ oneway: 'yes' }, { oneway: 'yes' })
  it('nicht als Knoten gesucht, in keineKnoten; geladen: Meldung und keine Rechnung', () => {
    const netz = new OsmNetz(g)
    expect(knotenArt(netz, 12)).toBe('gabelung')
    expect(knotenFinden(netz)).not.toContain(12)
    expect(keineKnoten(netz)).toContain(12)
    const r = rechneKnoten(g, [fahrbahn], { knoten: 12, zufahrt: null })
    expect([r.ergebnis, r.meldungen]).toEqual([null, [`${GABELUNG_TEXT}.`]])
    expect(GABELUNG_TEXT).toBe('Gabelung: höchstens ein Arm führt zum Knoten, kein Vortrittsfall')
    expect(r.keinKnoten).toContain(12)
  })
  it('mit Velo gegen die Einbahn auf der Nebenstrasse: zwei Arme mit Zufluss, wieder ein Knoten', () => {
    expect(knotenArt(new OsmNetz(osm({ oneway: 'yes' }, { oneway: 'yes', 'oneway:bicycle': 'no' })), 12)).toBe('knoten')
    expect(knotenArt(new OsmNetz(osm()), 12)).toBe('knoten')
  })
})

describe('Punkt 16: Kreisel', () => {
  it('Weg mit junction=roundabout bzw. circular am Punkt: kein Knoten, Meldung, keine Rechnung, kein Hinweis «nur zur Orientierung»', () => {
    for (const j of ['roundabout', 'circular']) {
      const o = osm({ junction: j })
      const netz = new OsmNetz(o)
      expect(knotenArt(netz, 12)).toBe('kreisel')
      expect(knotenFinden(netz)).not.toContain(12)
      const r = rechneKnoten(o, [fahrbahn], { knoten: 12, zufahrt: NEBEN })
      expect([r.ergebnis, r.meldungen]).toEqual([null, ['Kreisverkehr: nicht Gegenstand der App (VSS 40 273 Ziffer 1, S. 4; siehe VSS 40 263).']])
    }
    expect(KREISEL_TEXT).toBe('Kreisverkehr: nicht Gegenstand der App (VSS 40 273 Ziffer 1, S. 4; siehe VSS 40 263)')
  })
  it('Knotensuche: Punkte an Kreiseln werden in der Abfrage abgezogen', () => {
    expect(knotenAbfrage(46.9, 7.4, 46.91, 7.42)).toContain('way.w["junction"~"^(roundabout|circular)$"]->.r;(node(way_link.w:3-)(')
    expect(knotenAbfrage(46.9, 7.4, 46.91, 7.42)).toContain(' - node(w.r););out skel qt;')
  })
})

describe('Punkt 13: LSA-Knoten', () => {
  const mitAmpel = (x: number, y: number, haupt: Record<string, string> = {}, neben: Record<string, string> = {}) =>
    osm(haupt, neben, { ampeln: [punkt(99, x, y, { highway: 'traffic_signals' })] })
  it('Lichtsignal auf einem Arm bis 30 m bzw. am Knotenpunkt: LSA; 40 m weg bzw. neben dem Arm: nicht', () => {
    expect(info(mitAmpel(0, -15)).lsa).toBe(true)
    expect(info(mitAmpel(0.5, 0.5)).lsa).toBe(true)
    expect(info(mitAmpel(-28, 1)).lsa).toBe(true)
    expect(info(mitAmpel(0, -40)).lsa).toBeUndefined()
    expect(info(mitAmpel(15, -15)).lsa).toBeUndefined()
  })
  it('Rechnung als Rückfallebene: Hinweis zuoberst, ohne Massnahme «Lichtsignalanlage», Liste der LSA-Knoten', () => {
    const r = rechneKnoten(mitAmpel(0, -15), [fahrbahn, ecke], { knoten: 12, zufahrt: NEBEN })
    const e = r.ergebnis!
    expect([e.lsa, e.hinweise[0]]).toEqual([true, LSA_TEXT])
    expect(LSA_TEXT).toBe('Lichtsignalanlage: Im Betrieb regelt das Lichtsignal, die VSS 40 273 betrifft Knoten ohne Lichtsignal. ' +
      'Gerechnet ist die Rückfallebene bei ausgeschalteter oder gelb blinkender Anlage (Signale Kein Vortritt bzw. Stop darunter).')
    expect(r.lsaKnoten).toEqual([12])
    const ohne = rechneKnoten(osm(), [fahrbahn, ecke], { knoten: 12, zufahrt: NEBEN }).ergebnis!
    expect(ohne.massnahmen?.some(m => m.nr === 6)).toBe(true)
    expect(e.massnahmen?.some(m => m.nr === 6)).toBe(false)
    expect(e.massnahmen?.length).toBeGreaterThan(0)
  })
  it('Quartierstrasse Tempo 30 an einem LSA-Knoten: Vorgabe nie Rechtsvortritt (Annahme)', () => {
    const q = { highway: 'residential', maxspeed: '30' }
    expect(rechneKnoten(osm(q), [fahrbahn], { knoten: 12, zufahrt: NEBEN }).ergebnis!.regelungVorgabe).toBe('rechtsvortritt')
    const e = rechneKnoten(mitAmpel(0, -15, q), [fahrbahn], { knoten: 12, zufahrt: NEBEN }).ergebnis!
    expect([e.regelungVorgabe, e.regelungQuelle]).toEqual(['vortritt',
      'ohne Signal in OSM; Lichtsignalanlage: als Rückfallebene ohne Rechtsvortritt (Annahme)'])
  })
})

describe('Punkt 14: Beschriftung der Regelung', () => {
  it('Signalnummern; Werte bleiben', () => {
    expect(REGELUNG_TEXT).toEqual({ vortritt: 'Kein Vortritt (Signal 3.02)', stop: 'Stop (Signal 3.01)', rechtsvortritt: 'Rechtsvortritt (ohne Signal)' })
  })
})

describe('Punkt 15: Arme mit Vortritt', () => {
  const gw = (x: number, y: number, art = 'give_way') => osm({}, {}, { vortritt: [punkt(98, x, y, { highway: art })] })
  it('Signal an der Nebenstrasse: West und Ost mit Vortritt, Vorwahl die Nebenstrasse', () => {
    const k = info(gw(0, -4))
    expect([...(k.mitVortritt ?? [])].sort()).toEqual([WEST, OST].sort())
    expect(k.vortrittSicher).toBe('Signal «Kein Vortritt» an 2 Nebenstrasse (Süd) (OSM highway=give_way)')
    expect(k.vorschlag).toBe(NEBEN)
    expect(info(gw(0, -4, 'stop')).vortrittSicher).toContain('Signal «Stop»')
  })
  it('Arm mit Vortritt von Hand gewählt: Hinweis; ohne Signal keine Arme mit Vortritt', () => {
    const e = rechneKnoten(gw(0, -4), [fahrbahn], { knoten: 12, zufahrt: WEST }).ergebnis!
    expect(e.hinweise.join(' | ')).toContain('Die gewählte Zufahrt 3 Hauptstrasse (West) hat nach OSM Vortritt (Signal «Kein Vortritt» an ' +
      '2 Nebenstrasse (Süd) (OSM highway=give_way)): von Hand als Zufahrt gewählt')
    expect(info(osm()).mitVortritt).toBeUndefined()
  })
  it('Hauptstrasse priority_road: ihre Arme haben Vortritt', () => {
    const k = info(osm({ priority_road: 'designated' }))
    expect([...(k.mitVortritt ?? [])].sort()).toEqual([WEST, OST].sort())
    expect(k.vortrittSicher).toBe('Hauptstrasse (OSM priority_road)')
  })
})

describe('Annahmen je Thema höchstens ein Punkt (Korrektur 31.10.2026, Punkte 6 und 7)', () => {
  it('verschiedene Fälle: Themen eindeutig, in der Reihenfolge der Rechnung, annahmen = Titel und Text', () => {
    const reihe = ['vortritt', 'wartend', 'verkehr', 'hindernisse', 'wahrnehmbarkeit', 'eng']
    const faelle = [osm(), osm({ highway: 'residential', maxspeed: '30' }), osm({}, { oneway: 'yes', 'oneway:bicycle': 'no' }),
      osm({ maxspeed: '80' }), osm({}, {}, { vortritt: [punkt(98, 0, -8, { highway: 'stop' })] })]
    for (const o of faelle) for (const trottoirueberfahrt of [null, { breite: null }]) {
      const e = rechneKnoten(o, [fahrbahn, ecke], { knoten: 12, zufahrt: NEBEN,
        eingaben: { typ: null, fahrstreifen: null, neigungGross: null, schwerverkehr: false, neigung: { links: null, rechts: null },
          regelung: null, haltelinie: null, D: null, trottoirFrei: false, tempo: { links: null, rechts: null }, trottoirueberfahrt } }).ergebnis!
      const t = e.annahmenThemen!.map(x => x.thema)
      expect(new Set(t).size).toBe(t.length)
      expect(t).toEqual([...t].sort((a, b) => reihe.indexOf(a) - reihe.indexOf(b)))
      expect(e.annahmen).toEqual(e.annahmenThemen!.map(x => `${x.titel}: ${x.text}`))
      expect(e.annahmen.join(' ').match(/gegen die Einbahn/g)?.length ?? 0).toBeLessThanOrEqual(1)
      expect(e.annahmen.join(' ')).not.toContain('ß')
    }
  })
})
