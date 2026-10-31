// Tests E3a: Massnahmen nach VSS 40 273 Ziffer 14 am T-Knoten aus rechnen.test.ts mit einem Parkfeld (Auto) in der Ecke.
//
// Lage (Meter, Ursprung = OSM-Knoten): Hauptstrasse West–Ost, Fahrbahn y = −3 … +3, Erschliessungsstrasse (unterer Wert); Zufahrt
// von Süden, Achse x = 1,25, Kante y = −3; D = (0,75; −3 − b), heute b = B = 3,00 m. Nach links Zielpunkte FA(s) = (1,25 − s; −1,5),
// nach rechts FA(s) = (1,25 + s; +1,5). Parkfeld 5 × 2 m mit der Ecke C zur Zufahrt hin bei y = −3,5.
// Strahlensatz (Sichtlinie D–FA(s) durch C = (cx; −3,5)): (b − 0,5) / (cx − 0,75) = (b + 1,5) / (0,5 − s) bzw. für rechts
// (b − 0,5) / (cx − 0,75) = (b + 4,5) / (s + 0,5).
// Fall A, 50 km/h (A = 50 m), C = (−13; −3,5): heute s = 0,5 + 13,75 · 4,5 / 2,5 = 25,25 m, nicht erfüllt; ohne Parkfeld frei.
//   Haltelinie: A = 50 m braucht 49,5 (b − 0,5) = 13,75 (b + 1,5) -> b = 45,375 / 35,75 = 1,269 m < 1,50 m: reicht nicht, Spiegel.
//   Bei b = 1,50 m: s = 0,5 + 13,75 · 3 / 1 = 41,75 m (die Rechnung liefert den letzten sichtbaren Wert, 41,7 m angezeigt). Tempo 40 km/h: A 35 m > 25,25 m reicht nicht; 30 km/h: A 20 m reicht.
// Fall B, 30 km/h (A = 20 m), C = (−8; −3,5): heute s = 0,5 + 8,75 · 4,5 / 2,5 = 16,25 m. Haltelinie: 19,5 (b − 0,5) = 8,75 (b + 1,5)
//   -> b = 22,875 / 10,75 = 2,128 m: erste Stufe 2,00 m (1,00 m vorverlegt), dort s = 0,5 + 8,75 · 3,5 / 1,5 = 20,92 m; kein Spiegel.
// Fall C, 30 km/h, Parkfeld in der Südost-Ecke, C = (6; −3,5): nach rechts s = 5,25 · 7,5 / 2,5 − 0,5 = 15,25 m, nicht erfüllt;
//   nach links frei: Rechtsabbiegegebot möglich.

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { Hindernis } from './hindernisse'
import { rechneKnoten } from './rechnen'
import { KEINE_ALLE_EINGABEN, type Eingaben, type Ergebnis } from './typen'
import type { Massnahme } from './massnahmen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const osm = (tempo: string): OsmDaten => ({ wege: [
  weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: tempo }),
  weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
], tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [] })
const fahrbahn: AvFlaeche = { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200),
  lv(2.5, -200), lv(2.5, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)]] }
const parkfeld = (x0: number, x1: number): Hindernis => ({ id: 'pf', art: 'parkfeld', klasse: 'auto', quelle: 'hand', name: 'Parkfeld Nr. 1',
  ring: [lv(x0, -5.5), lv(x1, -5.5), lv(x1, -3.5), lv(x0, -3.5)] })
const rechne = (tempo: string, h: Hindernis[], eg: Partial<Eingaben> = {}): Ergebnis => {
  // E3b: ohne Veloverkehr, damit hier nur der Auto-Teil der Massnahmen geprüft wird (Velo-Teil: velo.test.ts)
  const r = rechneKnoten(osm(tempo), [fahrbahn], { knoten: 12, zufahrt: null, eingaben: { ...KEINE_ALLE_EINGABEN,
    velo: { links: 'kein', rechts: 'kein' }, ...eg },
    hindernisse: { hindernisse: h, verworfen: [], park: null, baeume: null } })
  expect(r.meldungen).toEqual([])
  return r.ergebnis!
}
const seite = (e: Ergebnis, r: string) => e.richtungen.find(x => x.richtung === r)!
const nr = (e: Ergebnis, n: number): Massnahme | undefined => e.massnahmen?.find(m => m.nr === n)

describe('E3a: Massnahmen, Fall A (50 km/h, Parkfeld in der Südwest-Ecke)', () => {
  const e = rechne('50', [parkfeld(-18, -13)])
  it('heute: nach links 25,25 m < 50 m nicht erfüllt, nach rechts erfüllt; Liste in der Reihenfolge 1 bis 7', () => {
    expect(seite(e, 'links').vorhanden).toBeCloseTo(25.25, 2)
    expect([seite(e, 'links').status, seite(e, 'rechts').status]).toEqual(['nicht_erfuellt', 'erfuellt'])
    expect(e.massnahmen!.map(m => m.nr)).toEqual([1, 2, 3, 4, 10, 5, 6, 7])
  })
  it('1 Hindernis entfernen: ohne Parkfeld erfüllt', () => {
    const m = nr(e, 1)!
    expect(m.reicht).toBe(true)
    expect(m.zeilen).toHaveLength(1)
    expect(m.zeilen[0]).toMatchObject({ id: 'pf', reicht: true })
    expect(m.zeilen[0].text).toMatch(/^ohne Parkfeld Nr\. 1, von Hand: links \d+,\d m \(erforderlich 50 m\), rechts/)
    // Rechnung unverändert: das Parkfeld zählt weiter
    expect(seite(e, 'links').verdeckerListe.map(t => t.id)).toEqual(['pf'])
  })
  it('2 Haltelinie: nötig wäre b = 1,27 m < 1,50 m: reicht nicht (bei 1,50 m: 41,75 m, angezeigt abgerundet); 7 Spiegel mit Bedingungen', () => {
    const m = nr(e, 2)!
    expect(m.reicht).toBe(false)
    expect(m.zeilen[0].text).toBe('bis D 1,50 m hinter der Kante: links 41,7 m (erforderlich 50 m), rechts 105,0 m (erforderlich 50 m); reicht nicht')
    const sp = nr(e, 7)!
    expect(sp.sichtUnterMin).toBe(true)
    expect(sp.bedingungen!.map(b => b[0])).toEqual(['stop', 'abstand', 'verkehr', 'tempo', 'standort', 'winter'])
  })
  it('bestehende Haltelinie 0,40 m hinter der Kante (D 3,40 m): Schritte bis 1,65 m, zuletzt genau 1,50 m (Prüfrunde)', () => {
    const h = rechne('50', [parkfeld(-18, -13)], { haltelinie: lv(1.25, -3.4) })
    expect(nr(h, 2)!.zeilen[0].text).toBe('bis D 1,50 m hinter der Kante: links 41,7 m (erforderlich 50 m), rechts 105,0 m (erforderlich 50 m); reicht nicht')
    expect(nr(h, 2)!.text).toContain('(3,40 m hinter der Kante)')
  })
  it('3 Stop innerorts ohne Wirkung; 4 Rechtsabbiegegebot nicht (nach links nicht ausreichend)', () => {
    expect(nr(e, 3)).toMatchObject({ reicht: null })
    expect(nr(e, 3)!.text).toContain('Innerorts ändert «Stop» die Beobachtungsdistanz nicht')
    expect(nr(e, 4)!.text).toBe('Nicht anwendbar: nach links nicht ausreichend.')
  })
  it('5 Tempo: 40 km/h (erforderlich 35 m) reicht nicht, 30 km/h (erforderlich 20 m) reicht, übernehmen setzt Tempo 30 von Hand', () => {
    const m = nr(e, 5)!
    expect(m.reicht).toBe(true)
    expect(m.zeilen.map(z => [z.reicht, z.text])).toEqual([
      [false, 'nach links bei 40 km/h statt 50: Sichtweite erforderlich 35 m, vorhanden 25,2 m; reicht nicht'],
      [true, 'nach links bei 30 km/h statt 50: Sichtweite erforderlich 20 m, vorhanden 25,2 m; reicht'],
    ])
    expect(m.zeilen[1].uebernehmen).toEqual({ art: 'tempo', richtung: 'links', wert: 30 })
    const t = rechne('50', [parkfeld(-18, -13)], { tempo: { links: { art: 'signalisiert', wert: 30, begruendung: '' }, rechts: null } })
    expect(seite(t, 'links').status).toBe('massgebend')             // 25,25 m: ≥ 20 m, unter dem oberen Wert 35 m
    expect(t.massnahmen).toBeNull()
  })
  it('ausserorts (60 km/h, B 5,00 m): Stop gerechnet (B 3,00 m), übernehmbar', () => {
    const a = rechne('60', [parkfeld(-18, -13)])
    expect(a.B).toBe(5)
    const m = nr(a, 3)!
    expect(m.zeilen[0].uebernehmen).toEqual({ art: 'stop' })
    expect(m.zeilen[0].text).toMatch(/^mit «Stop»: links \d+,\d m \(erforderlich 70 m\)/)
  })
})

describe('E3a: Massnahmen, Fall B (30 km/h, Parkfeld näher): Haltelinie reicht', () => {
  const e = rechne('30', [parkfeld(-13, -8)])
  it('heute 16,25 m < 20 m; Haltelinie 1,00 m vorverlegt (D 2,00 m, nötig 2,13 m): 20,9 m, reicht; kein Spiegel', () => {
    expect(seite(e, 'links').vorhanden).toBeCloseTo(16.25, 2)
    const m = nr(e, 2)!
    expect(m.reicht).toBe(true)
    expect(m.zeilen[0].text).toBe('Haltelinie 1,00 m vorverlegt, D 2,00 m hinter der Kante: links 20,9 m (erforderlich 20 m), rechts 53,0 m (erforderlich 20 m); reicht')
    const u = m.zeilen[0].uebernehmen!
    expect(u.art).toBe('haltelinie')
    const p = (u as { p: P }).p
    expect(p[0] - O[0]).toBeCloseTo(1.25, 2)
    expect(p[1] - O[1]).toBeCloseTo(-2, 2)
    expect(nr(e, 7)).toBeUndefined()
    // übernommen: Haltelinie 1,00 m vor der Kante, D 2,00 m hinter der Kante, erfüllt, keine Massnahmen mehr
    const h = rechne('30', [parkfeld(-13, -8)], { haltelinie: p })
    expect(h.haltelinie).toMatchObject({ vorverlegt: true })
    expect(h.haltelinie!.abstand).toBeCloseTo(-1, 2)
    expect(seite(h, 'links').vorhanden).toBeCloseTo(20.9167, 2)
    expect(h.massnahmen).toBeNull()
  })
  it('D von Hand: Haltelinie und Spiegel ohne Rechnung', () => {
    const d = rechne('30', [parkfeld(-13, -8)], { D: lv(0.75, -6) })
    expect(nr(d, 2)).toMatchObject({ reicht: null })
    expect(nr(d, 2)!.text).toBe('D von Hand gesetzt: nicht gerechnet. Nur an bestehenden Knoten und Zufahrten, mit Zusatzmassnahmen (z. B. ' +
      'Sperrfläche, versetzte Randlinie); bfu: nur im Bestand, die Sicht muss spätestens ab B 1,50 m reichen (bfu BM.021 Kap. 3.3, S. 5).')
    expect(nr(d, 7)!.sichtUnterMin).toBe(false)
  })
})

describe('E3a: Massnahmen, Fall C (Parkfeld in der Südost-Ecke): Rechtsabbiegegebot', () => {
  it('nach links erfüllt, nach rechts nicht (15,25 m): Rechtsabbiegegebot möglich; ohne Hindernis: keine Massnahmen', () => {
    const e = rechne('30', [parkfeld(6, 11)])
    expect(seite(e, 'rechts').vorhanden).toBeCloseTo(15.25, 2)
    expect([seite(e, 'links').status, seite(e, 'rechts').status]).toEqual(['erfuellt', 'nicht_erfuellt'])
    expect(nr(e, 4)!.text).toContain('Rechtsabbiegegebot möglich')
    expect(rechne('30', []).massnahmen).toBeNull()
  })
  it('Grundstückzufahrt (Zufahrtspunkt bei x = 20, Achse x = 20): Parkfeld wie Fall C um 18,75 m verschoben, Massnahme 8', () => {
    const r = rechneKnoten(osm('30'), [fahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(20, -3), richtung: null },
      hindernisse: { hindernisse: [parkfeld(24.75, 29.75)], verworfen: [], park: null, baeume: null } })
    expect(r.meldungen).toEqual([])
    const e = r.ergebnis!
    expect(seite(e, 'rechts').vorhanden).toBeCloseTo(15.25, 1)
    expect(e.massnahmen!.map(m => m.nr)).toEqual([1, 2, 3, 4, 10, 5, 6, 8])
    expect(nr(e, 8)!.text).toContain('die gefährliche Ausfahrt aufheben')
  })
})
