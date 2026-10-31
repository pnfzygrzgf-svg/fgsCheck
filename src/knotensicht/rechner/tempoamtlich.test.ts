// Tests K0: amtliches Tempo (Stadt Bern, V_sig des Geoportals) in der Rechnung, mit Attrappen der Linien (kein Netz), und das
// Einlesen der Geoportal-Antwort (daten/vsig.ts).
//
// Lage wie rechnen.test.ts: Hauptstrasse West–Ost auf y = 0 (OSM maxspeed 50), Zufahrt von Süden. V_sig-Linien auf der Strassenachse.

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneKnoten } from './rechnen'
import { amtlichBei, AMTLICH_SUCH_M } from './tempo'
import { vsigAusGeoportal, vsigUrl, vsigPruefen, vsigRechnung, bernZustaendig, GEOPORTAL_BERN } from '../daten/vsig'
import { KEINE_ALLE_EINGABEN, type Ergebnis, type KnotenFall, type TempoAmtlichDaten, type TempoAmtlichLinie } from './typen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const osm = (haupt: Record<string, string> = { maxspeed: '50' }): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', ...haupt }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const fahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const linie = (id: string, v: number | null, ...pkte: [number, number][]): TempoAmtlichLinie =>
  ({ id, strasse: 'Hauptstrasse', vSig: v, teile: [pkte.map(([x, y]) => lv(x, y))] })
const daten = (linien: TempoAmtlichLinie[], radiusM = 150): TempoAmtlichDaten => ({ linien, bereich: { mitte: O, radiusM }, quelle: GEOPORTAL_BERN })
const rechne = (o: OsmDaten, f: Partial<KnotenFall> = {}): Ergebnis => {
  const r = rechneKnoten(o, [fahrbahn], { knoten: 12, zufahrt: null, ...f })
  expect(r.meldungen).toEqual([])
  return r.ergebnis!
}
const seite = (e: Ergebnis, r: 'links' | 'rechts') => e.richtungen.find(x => x.richtung === r)!

describe('K0: amtlichBei (Zuordnung der V_sig-Linie zur Fahrlinie)', () => {
  const ost: P = [1, 0]
  it('nächste Linie bis 8 m, etwa parallel; auf die Stufe der Tab. 1', () => {
    const f = amtlichBei(daten([linie('a', 30, [-200, 0], [200, 0])]))
    expect(f(lv(10, 1.5), ost)).toBe(30)
    expect(f(lv(10, AMTLICH_SUCH_M - 0.1), ost)).toBe(30)
    expect(f(lv(10, AMTLICH_SUCH_M + 0.1), ost)).toBeNull()      // weiter als 8 m
    expect(f(lv(10, 1.5), [0, 1])).toBeNull()                     // quer zur Linie
    expect(amtlichBei(daten([linie('b', 35, [-200, 0], [200, 0])]))(lv(10, 0), ost)).toBe(40)   // Stufe der Tab. 1
  })
  it('leere Linie: zählt als nächste Linie (kein Wert einer weiter entfernten); ausserhalb des Bereichs null', () => {
    const f = amtlichBei(daten([linie('leer', null, [-200, 0], [200, 0]), linie('fern', 50, [-200, 6], [200, 6])]))
    expect(f(lv(10, 1), ost)).toBeNull()
    expect(f(lv(10, 5), ost)).toBe(50)                             // näher an der Linie mit Wert
    const g = amtlichBei(daten([linie('a', 30, [-400, 0], [400, 0])], 100))
    expect(g(lv(80, 0), ost)).toBe(30)
    expect(g(lv(95, 0), ost)).toBeNull()                           // 100 − 8 m Rand
  })
})

describe('K0: amtliches Tempo in der Rechnung (vor OSM, von Hand geht vor)', () => {
  it('V_sig 30 auf der ganzen Strasse: Tempo 30 statt OSM 50, Quelle Geoportal, Hinweis auf OSM', () => {
    const e = rechne(osm(), { tempoAmtlich: daten([linie('a', 30, [-200, 0], [200, 0])]) })
    for (const r of ['links', 'rechts'] as const) {
      const x = seite(e, r)
      expect([x.tempo, x.tempoVorgabe, x.tempoAnnahme]).toEqual([30, 30, false])
      expect(x.tempoQuelle).toBe('Geoportal Stadt Bern (signalisierte Höchstgeschwindigkeit V_sig, Mehrheit entlang der Achse)')
      expect(x.hinweise.join(' | ')).toContain('Tempo 30 km/h laut Geoportal Stadt Bern (signalisierte Höchstgeschwindigkeit), OSM 50 km/h')
      expect(x.velo!.tempo).toBe(30)                               // Tab. 3 nach der signalisierten Höchstgeschwindigkeit
    }
    // ohne V_sig: OSM 50
    expect(seite(rechne(osm()), 'links').tempo).toBe(50)
  })
  it('nur nach rechts eine Linie (Ost), nach links OSM; leere Linie -> OSM mit Hinweis', () => {
    const e = rechne(osm(), { tempoAmtlich: daten([linie('ost', 30, [0, 0], [200, 0]), linie('west', null, [0, 0], [-200, 0])]) })
    expect([seite(e, 'links').tempo, seite(e, 'rechts').tempo]).toEqual([50, 30])
    expect(seite(e, 'links').tempoQuelle).toBe('OSM maxspeed')
    expect(seite(e, 'links').hinweise.join(' | ')).toMatch(/Geoportal Stadt Bern: 0 von \d+ Punkten an einer Linie mit Wert: Tempo aus OSM/)
  })
  it('nur der Arm Ost hat eine Linie: die Punkte am Knoten (bis 8 m) entscheiden nicht, nach links OSM', () => {
    const e = rechne(osm(), { tempoAmtlich: daten([linie('ost', 30, [0, 0], [200, 0])]) })
    expect([seite(e, 'links').tempo, seite(e, 'rechts').tempo]).toEqual([50, 30])
    expect(seite(e, 'links').hinweise.join(' | ')).toContain('Geoportal Stadt Bern: entlang dieser Richtung keine Linie: Tempo aus OSM')
  })
  it('Punkte bis 8 m vom Knoten stimmen nicht mit; Punkte ausserhalb des Bereichs zählen nicht', () => {
    // Ost: 0 … 6 m eine Linie 30 (nur am Knoten), dahinter 50: Ergebnis 50, nicht 30
    const e = rechne(osm(), { tempoAmtlich: daten([linie('k', 30, [0, 0], [6, 0]), linie('w', 50, [6, 0], [200, 0]),
      linie('west', 50, [0, 0], [-200, 0])]) })
    expect(seite(e, 'rechts').tempo).toBe(50)
    // Bereich ±40 m: von den Punkten bis 50 m liegen nur die bis 32 m im Bereich; sie tragen 30 -> 30 (nicht OSM 50 wegen der Punkte aussen)
    const b = rechne(osm(), { tempoAmtlich: daten([linie('a', 30, [-200, 0], [200, 0])], 40) })
    expect([seite(b, 'links').tempo, seite(b, 'rechts').tempo]).toEqual([30, 30])
    // ganz ausserhalb: OSM mit Hinweis
    const c = rechne(osm(), { tempoAmtlich: { linien: [linie('a', 30, [-200, 0], [200, 0])], bereich: { mitte: [O[0] + 1000, O[1]], radiusM: 100 },
      quelle: GEOPORTAL_BERN } })
    expect(seite(c, 'links').tempo).toBe(50)
    expect(seite(c, 'links').hinweise.join(' | ')).toContain('Richtung ausserhalb des geladenen Bereichs')
  })
  it('ohne OSM-Angabe: V_sig ersetzt die Annahme 50 km/h', () => {
    const e = rechne(osm({}), { tempoAmtlich: daten([linie('a', 30, [-200, 0], [200, 0])]) })
    expect([seite(e, 'links').tempo, seite(e, 'links').tempoAnnahme]).toEqual([30, false])
    expect(e.annahmen.some(a => a.includes('Tempo nach links: ohne Angabe in OSM'))).toBe(false)
  })
  it('Tempo von Hand geht vor; Hinweis nennt das Geoportal', () => {
    const e = rechne(osm(), { tempoAmtlich: daten([linie('a', 30, [-200, 0], [200, 0])]),
      eingaben: { ...KEINE_ALLE_EINGABEN, tempo: { links: { art: 'signalisiert', wert: 40, begruendung: '' }, rechts: null } } })
    expect([seite(e, 'links').tempo, seite(e, 'links').tempoVorgabe]).toEqual([40, 30])
    expect(seite(e, 'links').hinweise.join(' | ')).toContain('Signalisiertes Tempo von Hand 40 km/h, Geoportal Stadt Bern 30 km/h')
  })
  it('ohne tempoAmtlich bzw. null: Ergebnis gleich wie bisher', () => {
    const a = rechneKnoten(osm(), [fahrbahn], { knoten: 12, zufahrt: null })
    const b = rechneKnoten(osm(), [fahrbahn], { knoten: 12, zufahrt: null, tempoAmtlich: null })
    a.ms = 0; b.ms = 0
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})

describe('K0: daten/vsig.ts (Geoportal Stadt Bern)', () => {
  it('Abfrage in LV95 auf den Dienst Signalisierte_Hoechstgeschwindigkeit', () => {
    const [lat, lon] = wgs(2600000, 1200000)
    const u = new URL(vsigUrl(lat, lon, 150))
    expect(u.pathname).toBe('/arcgis/rest/services/Geoportal/Signalisierte_Hoechstgeschwindigkeit/MapServer/0/query')
    expect([u.searchParams.get('inSR'), u.searchParams.get('outSR'), u.searchParams.get('f')]).toEqual(['2056', '2056', 'geojson'])
    expect(u.searchParams.get('geometry')).toBe('2599850,1199850,2600150,1200150')
    expect(u.searchParams.get('outFields')).toContain('V_sig')
  })
  it('Antwort einlesen: MultiLineString mit z, V_sig ausserhalb 5–130 bzw. leer -> ohne Wert; Prüfung LV95', () => {
    const gj = { crs: { properties: { name: 'EPSG:2056' } }, features: [
      { geometry: { type: 'MultiLineString', coordinates: [[[2600000, 1200000, 0], [2600010, 1200000, 0]], [[1, 2]]] },
        properties: { Objectid: 7, V_sig: 30, Strassenname: ' Weingartstrasse ' } },
      { geometry: { type: 'LineString', coordinates: [[2600000, 1200005], [2600010, 1200005]] }, properties: { Objectid: 8, V_sig: null } },
      { geometry: { type: 'LineString', coordinates: [[2600000, 1200005], [2600010, 1200005]] }, properties: { Objectid: 9, V_sig: 0 } },
      { geometry: null, properties: { Objectid: 10, V_sig: 50 } },
    ] }
    const l = vsigAusGeoportal(gj)
    expect(l.map(x => [x.id, x.vSig, x.strasse, x.teile.length])).toEqual([['bernvsig:7', 30, 'Weingartstrasse', 1], ['bernvsig:8', null, '', 1],
      ['bernvsig:9', null, '', 1]])
    expect(l[0].teile[0]).toEqual([[2600000, 1200000], [2600010, 1200000]])
    expect(() => vsigPruefen(gj)).not.toThrow()
    expect(() => vsigPruefen({ ...gj, crs: { properties: { name: 'EPSG:4326' } } })).toThrow('LV95')
    expect(() => vsigPruefen({ ...gj, exceededTransferLimit: true })).toThrow('unvollständig')
    expect(() => vsigPruefen({ error: { code: 400, message: 'Invalid' } })).toThrow('ArcGIS 400')
    expect(vsigRechnung(l, O, 150)).toEqual({ linien: l, bereich: { mitte: O, radiusM: 150 }, quelle: 'Geoportal Stadt Bern' })
  })
  it('Zuständigkeit nach der AV-Gemeinde unter dem Punkt (Bern 351, nicht Köniz 355)', () => {
    const bern = flaeche('Strasse_Weg', [lv(-10, -10), lv(10, -10), lv(10, 10), lv(-10, 10)])
    const koeniz: AvFlaeche = { ...flaeche('Strasse_Weg', [lv(10, -10), lv(30, -10), lv(30, 10), lv(10, 10)]), bfs: 355 }
    expect(bernZustaendig(O, [bern, koeniz])).toBe(true)
    expect(bernZustaendig(lv(20, 0), [bern, koeniz])).toBe(false)
    expect(bernZustaendig(lv(100, 0), [bern, koeniz])).toBe(false)
    expect(bernZustaendig(null, [bern])).toBe(false)
  })
})
