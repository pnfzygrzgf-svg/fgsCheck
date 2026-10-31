// Tests: Lage je Richtung (links, rechts, gegenüber) und ihre Wörter (lage.ts). Handlösungen im Kommentar.
//
// Lage (Meter, x Ost, y Nord, Ursprung = OSM-Knoten 12) wie rechtsvortritt.test.ts: Hauptstrasse West–Ost (Weg 1, Fahrbahn
// y = −3 … +3), Nebenstrasse von Süden (Weg 2, Fahrbahn x = −2,5 … +2,5). Arme: West 1:1:-1, Ost 1:1:1, Süd 2:0:1.
//
// Zufahrt auf der durchgehenden Strasse = Arm West. Fahrt zum Knoten f = −u(West) = (1; 0), also nach Osten.
//   Ost:  u = (1; 0),  Winkel zu f 0°   ≤ 30°  -> gegenüber (Gegenverkehr); Drehung 0°
//   Süd:  u = (0; −1), Winkel zu f 90°  > 30°  -> Drehung von f nach u = −90° (im Uhrzeigersinn) -> rechts
// Sortierung wie heute nach der Drehung: grössere zuerst = «links» -> Ost ist die Richtung links (Lage gegenüber), Süd die Richtung
// rechts (Lage rechts). Auf der linken Seite (Norden) liegt kein Arm: «links: kein Arm».
// T-Knoten aus Süden: f = (0; 1); West u = (−1; 0) +90° -> links, Ost u = (1; 0) −90° -> rechts (beide 90° neben geradeaus).

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneKnoten } from './rechnen'
import { GEGENUEBER_GRAD, lageVon, lageText, lageKurz, lageNach, lageWort } from './lage'
import { KEINE_ALLE_EINGABEN, type Eingaben, type Ergebnis, type KnotenFall, type Regelung } from './typen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (nordost = false): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [14, 30, 0], [13, 200, 0]], { highway: 'residential', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '50' }),
    // Begegnungszone Hofweg nach Nordosten (60°, links der Fahrt aus West, 60° neben geradeaus), nicht Teil der Vortrittsstrasse
    ...(nordost ? [weg(3, [[12, 0, 0], [30, 100, 173.2]], { highway: 'living_street', name: 'Hofweg' })] : []),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const tFahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const WEST = '1:1:-1', SUED = '2:0:1'
const eg = (regelung: Regelung): Eingaben => ({ ...KEINE_ALLE_EINGABEN, regelung })
const rechne = (zufahrt: string, regelung: Regelung, f: Partial<KnotenFall> = {}, nordost = false): Ergebnis => {
  const r = rechneKnoten(osm(nordost), [tFahrbahn], { knoten: 12, zufahrt, eingaben: eg(regelung), ...f })
  expect(r.meldungen).toEqual([])
  return r.ergebnis!
}
const seite = (e: Ergebnis, r: 'links' | 'rechts') => e.richtungen.find(x => x.richtung === r)!

describe('Lage: Winkel und Wörter', () => {
  const grad = (g: number): P => [Math.cos(g * Math.PI / 180), Math.sin(g * Math.PI / 180)]
  it('gegenüber bis GEGENUEBER_GRAD neben geradeaus, sonst die Seite der Richtung', () => {
    expect(GEGENUEBER_GRAD).toBe(30)
    // Fahrt nach Osten (0°): Arm bei 0°, ±30° gegenüber; bei 31° und 90° die Seite der Richtung
    expect([0, 30, -30].map(g => lageVon(grad(0), grad(g), 'links'))).toEqual(['gegenueber', 'gegenueber', 'gegenueber'])
    expect(lageVon(grad(0), grad(31), 'links')).toBe('links')
    expect(lageVon(grad(0), grad(-90), 'rechts')).toBe('rechts')
  })
  it('Wörter je Lage', () => {
    const l = (lage: 'links' | 'rechts' | 'gegenueber') => [lageText({ lage }), lageKurz({ lage }), lageNach({ lage }), lageWort({ lage })]
    expect(l('links')).toEqual(['Verkehr von links', 'von links', 'nach links', 'links'])
    expect(l('rechts')).toEqual(['Verkehr von rechts', 'von rechts', 'nach rechts', 'rechts'])
    expect(l('gegenueber')).toEqual(['Gegenverkehr', 'von gegenüber', 'zum Gegenverkehr', 'gegenüber'])
  })
})

describe('Lage: Zufahrt auf der durchgehenden Strasse (Arm West)', () => {
  it('Vortritt: Ost gegenüber (Richtung links), Süd rechts; Hinweis Linksabbiegen; «links: kein Arm»', () => {
    const e = rechne(WEST, 'vortritt')
    expect([seite(e, 'links').arm, seite(e, 'links').lage]).toEqual(['1:1:1', 'gegenueber'])
    expect([seite(e, 'rechts').arm, seite(e, 'rechts').lage]).toEqual([SUED, 'rechts'])
    expect(e.seiteOhneArm).toBe('links')
    const h = e.hinweise.join(' | ')
    expect(h).toContain('Die Zufahrt liegt auf der durchgehenden Strasse; die Sicht zum Gegenverkehr (')
    expect(h).toContain('zählt nur beim Linksabbiegen (Ziffer 1: Zufahrt aus einer einmündenden Strasse).')
    // ein Arm gegenüber gilt nicht als «spitzer Winkel»
    expect(h).not.toContain('spitzer Winkel')
    // Rechnung unverändert: die Richtung links wird wie bisher geprüft
    expect(seite(e, 'links').status).not.toBe('keine_zufahrt')
    // Annahmen mit der Lage
    expect(e.annahmen.join(' | ')).toContain('beim Gegenverkehr')
  })
  it('Massnahme 4: Rechtsabbiegegebot nicht anwendbar, Vermerk Linksabbiegeverbot', () => {
    // Gebäude in der Ecke Südwest (x −30 … −3, y −60 … −3,5) verdeckt die Sicht von D nach Süden: eine Richtung nicht erfüllt
    const haus = flaeche('Gebaeude', [lv(-30, -60), lv(-3, -60), lv(-3, -3.5), lv(-30, -3.5), lv(-30, -60)])
    const r = rechneKnoten(osm(), [tFahrbahn, haus], { knoten: 12, zufahrt: WEST, eingaben: eg('vortritt') })
    expect(r.meldungen).toEqual([])
    const e = r.ergebnis!
    expect(seite(e, 'rechts').status).toBe('nicht_erfuellt')
    const m4 = e.massnahmen!.find(m => m.nr === 4)!
    expect(m4.reicht).toBeNull()
    expect(m4.text).toMatch(/^Nicht anwendbar: die Zufahrt liegt auf der durchgehenden Strasse \(Gegenverkehr aus .*Hauptstrasse.*\)\. Vermerk Linksabbiegeverbot: /)
    expect(m4.text).toContain('(sie ist heute ausreichend)')
  })
  it('Stop: derselbe Hinweis', () => {
    expect(rechne(WEST, 'stop').hinweise.join(' | ')).toContain('Die Zufahrt liegt auf der durchgehenden Strasse')
  })
  it('Rechtsvortritt: rechts Süd geprüft, Gegenverkehr aus Ost ohne Vortrittsverhältnis', () => {
    const e = rechne(WEST, 'rechtsvortritt')
    expect(e.rechtsvortritt!.arm.rechts).toBe(SUED)
    const l = seite(e, 'links')
    expect([l.lage, l.status, l.rvKeine]).toEqual(['gegenueber', 'keine_zufahrt', true])
    expect(l.keinGrund).toMatch(/^Gegenverkehr aus .*Hauptstrasse.*: kein Vortrittsverhältnis beim Geradeausfahren \(Linksabbiegen nicht geprüft\)$/)
    expect([seite(e, 'rechts').lage, seite(e, 'rechts').rv]).toEqual(['rechts', true])
    // beim Rechtsvortritt kein Hinweis zur durchgehenden Strasse (gilt nur für Vortritt und Stop)
    expect(e.hinweise.join(' | ')).not.toContain('Die Zufahrt liegt auf der durchgehenden Strasse')
  })
  it('mit dem Hofweg nach Nordosten (links, living_street, nicht vortrittsberechtigt): Ost bleibt gegenüber, aber keine Zeile «kein Arm»', () => {
    const e = rechne(WEST, 'vortritt', {}, true)
    expect(e.richtungen.map(r => [r.arm, r.lage])).toEqual([['1:1:1', 'gegenueber'], [SUED, 'rechts']])
    expect(e.seiteOhneArm).toBeNull()
  })
})

describe('Lage: T-Knoten und Grundstückzufahrt bleiben links/rechts', () => {
  it('T-Knoten, Zufahrt Süd: links West, rechts Ost, kein Hinweis', () => {
    for (const reg of ['vortritt', 'rechtsvortritt'] as Regelung[]) {
      const e = rechne(SUED, reg)
      expect(e.richtungen.map(r => [r.richtung, r.lage])).toEqual([['links', 'links'], ['rechts', 'rechts']])
      expect(e.seiteOhneArm).toBeNull()
      expect(e.hinweise.join(' | ')).not.toContain('durchgehenden Strasse; die Sicht zum Gegenverkehr')
    }
    expect(seite(rechne(SUED, 'rechtsvortritt'), 'links').keinGrund).toMatch(/^Verkehr von links \(.*\) muss dieser Zufahrt den Vortritt lassen: nicht geprüft$/)
  })
  it('Grundstückzufahrt: Lage = Richtung', () => {
    const r = rechneKnoten(osm(), [tFahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(20, -3), richtung: null } })
    expect(r.meldungen).toEqual([])
    const e = r.ergebnis!
    expect(e.richtungen.map(x => x.lage)).toEqual(['links', 'rechts'])
    expect(e.trottoirPruefung?.richtungen.map(x => x.lage) ?? ['links', 'rechts']).toEqual(['links', 'rechts'])
  })
})
