// Tests E2 (Eingaben): Konflikte und Status, Abstand 1,5 m zu Parkfeldern, Fall-Datei, Rechnung mit Eingaben von Hand.
// Künstlicher Knoten wie rechner.test.ts (keine echten Daten): Hauptstrasse West–Ost (8 m), Übergang bei x = 0,
// Querstrasse nach Süden bei x = -40.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wgs, dist, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { konflikteSuchen, konfliktFelder } from './pruefen'
import { Gebaeude } from './flaechen'
import { HindernisDaten, laengsPolygon, type Hindernis } from './hindernisse'
import { abstandLinieMulti } from './poly'
import { abstandHalten, PARK_ABSTAND_M } from './spur'
import { rechneFall } from './index'
import { linieKreis } from './spurhand'
import { leererFall, fallLesen, fallSchreiben, zufahrtSchluessel, naechsteHandId, streifenUebernehmen, eingabenVerwaist,
  fallMerken, fallErinnern, imGebiet, type Fall } from '../fall'
import { markierung } from '../daten/osm'
import type { Konflikt } from './typen'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] =>
  [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]

function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
function daten(hauptTags: Record<string, string> = {},
  uTags: Record<string, string> = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }): OsmDaten {
  return {
    wege: [
      weg(1, [[10, -200, 0], [11, -40, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50', ...hauptTags }),
      weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' }),
    ],
    tram: [], ampeln: [], querungen: [], relationen: [],
    uebergaenge: [{ id: 12, tags: uTags, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
  }
}
const AV: AvFlaeche[] = [
  { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-200, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200),
    lv(-37, -4), lv(200, -4), lv(200, 4), lv(-200, 4), lv(-200, -4)]] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 4, 200, 7)] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-36, -7, 200, -4)] },
]
const fallMit = (f: (x: Fall) => void): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const ost = (r: ReturnType<typeof rechneFall>) => r.streifen[0].zufahrten.find(z => z.richtung === 0)!

describe('Konflikte und Status (konflikte_suchen, ergebnis)', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] as P[]]]
  const feld = sq(0, 0, 20, 10), streifen = sq(20, 0, 24, 10), keineGeb = new Gebaeude([])
  it('Parkfeld zählt ab 0,25 m² im Sichtfeld', () => {
    const hd = (y0: number) => new HindernisDaten([{ id: 'p', art: 'parkfeld', klasse: 'auto', quelle: 'hand',
      ring: [[5, y0], [10, y0], [10, y0 + 2], [5, y0 + 2]] }])
    expect(konflikteSuchen(feld, streifen, keineGeb, [], [], hd(9.96)).length).toBe(0)      // 5 × 0,04 = 0,2 m²: knapp darunter
    expect(konflikteSuchen(feld, streifen, keineGeb, [], [], hd(9.94)).length).toBe(1)      // 0,3 m²
  })
  it('Baum, Hecke als Linie, nicht sichtbehindernde Mauer', () => {
    const hd = new HindernisDaten([
      { id: 'b', art: 'baum', p: [3, 3], stamm: 0.5, quelle: 'hand' },
      { id: 'h', art: 'hecke', linie: [[8, -2], [8, 4]], sichtbehindernd: true, quelle: 'hand' },
      { id: 'm', art: 'mauer', linie: [[12, -2], [12, 4]], sichtbehindernd: false, quelle: 'hand' },
    ])
    const k = konflikteSuchen(feld, streifen, keineGeb, [], [], hd)
    expect(k.map(x => x.klasse).sort()).toEqual(['baum', 'hindernis'])
    // Baum direkt am Sichtpunkt zählt nicht
    expect(konflikteSuchen(feld, streifen, keineGeb, [], [[3, 3.5]], hd).map(x => x.klasse)).toEqual(['hindernis'])
  })
  it('Rangfolge und 5-m-Regel', () => {
    const k = (klasse: Konflikt['klasse'], abstand: number): Konflikt => ({ klasse, flaeche: 2, abstand, geom: [], layer: '' })
    expect(konfliktFelder([k('baum', 9), k('velo', 1)]).status).toBe('verdeckt_baum')
    expect(konfliktFelder([k('baum', 9), k('gebaeude', 1)]).status).toBe('verdeckt_gebaeude')
    expect(konfliktFelder([k('hindernis', 9), k('baum', 1)]).status).toBe('verdeckt_hindernis')
    const a = konfliktFelder([k('gebaeude', 1), k('auto', 4.2), k('auto', 8)])
    expect(a.status).toBe('verdeckt')
    expect([a.nAuto, a.minAbstandAutoM, a.unter5m, a.ueberdeckungM2]).toEqual([2, 4.2, true, 4])
    expect(konfliktFelder([k('motorrad', 1)]).status).toBe('verdeckt_zweirad')
    expect(konfliktFelder([]).status).toBe('frei')
  })
})

describe('Abstand zu Parkfeldern (abstand_halten)', () => {
  it('Sichtpunkte rücken auf 1,5 m von den Feldern ab', () => {
    const hd = new HindernisDaten([{ id: 'p', art: 'parkfeld', klasse: 'auto', quelle: 'hand', ring: [[0, 0.5], [12, 0.5], [12, 2.5], [0, 2.5]] }])
    const pts: P[] = Array.from({ length: 11 }, (_, i) => [i * 2 - 4, 0] as P)
    const [neu, info] = abstandHalten(pts, () => true, hd.parkAlle)
    expect(info).not.toBeNull()
    for (const p of neu) expect(hd.parkAlle.abstand(p)).toBeGreaterThanOrEqual(PARK_ABSTAND_M - 0.11)
    expect(neu[4][1]).toBeLessThan(-0.9)                  // auf der Höhe des Felds um rund 1 m nach rechts
    expect(dist(neu[10], pts[10])).toBeLessThan(1.6)
  })
  it('ohne Parkfelder unverändert', () => {
    const pts: P[] = [[0, 0], [2, 0]]
    expect(abstandHalten(pts, () => true, new HindernisDaten([]).parkAlle)).toEqual([pts, null])
  })
  it('Längsparkierung: Polygon der gegebenen Breite', () => {
    const r = laengsPolygon([[0, 0], [10, 0]], 2)
    expect(Math.max(...r.map(p => p[1])) - Math.min(...r.map(p => p[1]))).toBeCloseTo(2)
  })
})

describe('Fall-Datei', () => {
  it('speichern und laden ergibt denselben Fall', () => {
    const f = fallMit(x => {
      x.streifenHand.push({ id: 'hand-1', p0: lv(0, -4), p1: lv(0, 4), breite: 4 })
      x.hindernisse.push({ id: 'a', art: 'parkfeld', klasse: 'velo', ring: rechteck(1, 1, 2, 2), quelle: 'osm', name: 'x' },
        { id: 'b', art: 'baum', p: lv(3, 5), stamm: 0.5, quelle: 'hand' },
        { id: 'c', art: 'hecke', linie: [lv(0, 5), lv(5, 5)], sichtbehindernd: false, quelle: 'hand' },
        { id: 'd', art: 'laengsparkierung', linie: [lv(0, 3), lv(9, 3)], breite: 2.2, quelle: 'hand' })
      x.zufahrten[zufahrtSchluessel('1', '0')] = { tempo: 30, spur: { art: 'A', a: 0.5, b: -0.2 } }
      x.zufahrten[zufahrtSchluessel('1', 'a90')] = { streichen: true, spur: { art: 'B', linie: [lv(0, 0), lv(-9, -5)], radius: 9.5 } }
      x.streifen['1'] = { lsa: 'nein', keinFgs: true }
      x.vorschlaege['osm:1:right:0'] = 'verworfen'
      x.baumkataster = true
      x.quellen = { osm: 'test', av: 'test' }
    })
    const [g, hinweise] = fallLesen(fallSchreiben(f))
    expect(hinweise).toEqual([])
    expect(typeof g.gespeichert).toBe('string')        // Speicherdatum wird mitgelesen (Hinweis «Stand …»)
    expect({ ...g, gespeichert: undefined }).toEqual({ ...f, gespeichert: undefined })
  })
  it('ungültige Einträge werden gemeldet, fremde Dateien abgelehnt', () => {
    const roh = JSON.parse(fallSchreiben(fallMit(() => {})))
    roh.hindernisse = [{ id: 'x', art: 'baum' }, { id: 'y', art: 'baum', p: [1, 2], stamm: 0.5, quelle: 'hand' }]
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.hindernisse.length).toBe(1)
    expect(h.length).toBe(1)
    expect(() => fallLesen('{"app":"anderes"}')).toThrow()
    expect(() => fallLesen(JSON.stringify({ ...roh, version: 99 }))).toThrow()
  })
})

describe('Rechnung mit Eingaben von Hand (rechneFall)', () => {
  const ohne = ost(rechneFall(daten(), AV, [], 12, fallMit(() => {}), null))
  it('ohne Hindernisse frei', () => expect(ohne.status).toBe('frei'))
  it('Parkfeld von Hand vor dem Streifen verdeckt die Sicht', () => {
    const h: Hindernis = { id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4).slice(0, 4), quelle: 'hand' }
    const z = ost(rechneFall(daten(), AV, [], 12, fallMit(x => x.hindernisse.push(h)), null))
    expect(z.status).toBe('verdeckt')
    expect(z.minAbstandAutoM).toBeCloseTo(5, 0)            // Streifen 4 m breit: Rand bei x = -2
    expect(z.unter5m).toBe(false)
  })
  it('Parkierung aus OSM nur als Vorschlag', () => {
    const r = rechneFall(daten({ 'parking:left': 'lane' }), AV, [], 12, fallMit(() => {}), null)
    expect(r.vorschlaege.length).toBeGreaterThan(0)
    expect(r.vorschlaege.every(v => v.hindernis.quelle === 'osm')).toBe(true)
    expect(ost(r).status).toBe(ohne.status)
    const verworfen = fallMit(x => { for (const v of r.vorschlaege) x.vorschlaege[v.id] = 'verworfen' })
    expect(rechneFall(daten({ 'parking:left': 'lane' }), AV, [], 12, verworfen, null).vorschlaege.length).toBe(0)
  })
  it('Tempo von Hand, Zufahrt streichen, kein FGS', () => {
    const fid = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null).streifen[0].fgsId
    const k = zufahrtSchluessel(fid, ohne.kennung)
    const t = ost(rechneFall(daten(), AV, [], 12, fallMit(x => { x.zufahrten[k] = { tempo: 30 } }), null))
    expect([t.tempo, t.tempoQuelle, t.sichtweite]).toEqual([30, 'Korrektur', 25])
    const s = rechneFall(daten(), AV, [], 12, fallMit(x => { x.zufahrten[k] = { streichen: true } }), null).streifen[0]
    expect(s.zufahrten.some(z => z.kennung === ohne.kennung)).toBe(false)
    expect(s.entfallen.some(e => e.grund === 'hand')).toBe(true)
    expect(rechneFall(daten(), AV, [], 12, fallMit(x => { x.streifen[fid] = { keinFgs: true } }), null).streifen[0].status).toBe('kein_fgs')
  })
  it('Streifen von Hand ersetzt den aus OSM', () => {
    const r = rechneFall(daten(), AV, [], 12, fallMit(x => x.streifenHand.push({ id: 'hand-1', p0: lv(20, -4), p1: lv(20, 4), breite: 4 })), null)
    expect(r.streifenQuelle).toBe('hand')
    expect(r.streifen.length).toBe(1)
    expect(ost(r).status).toBe('frei')
  })
})

describe('Spur von Hand', () => {
  it('Kreis durch eine gezeichnete Bogenlinie', () => {
    const linie: P[] = Array.from({ length: 7 }, (_, i) => [10 * Math.cos(i * Math.PI / 12), 10 * Math.sin(i * Math.PI / 12)] as P)
    expect(linieKreis(linie).r).toBeCloseTo(10, 0)
  })
})

describe('Markierung des OSM-Übergangs (Variante B)', () => {
  it('Einordnung nach Tags', () => {
    expect(markierung({ crossing: 'uncontrolled', 'crossing:markings': 'zebra' })).toBe('markiert')
    expect(markierung({ crossing: 'marked' })).toBe('markiert')
    expect(markierung({ crossing: 'traffic_signals', 'crossing:markings': 'zebra' })).toBe('lsa')
    expect(markierung({ crossing: 'unmarked' })).toBe('unmarkiert')
    expect(markierung({ crossing: 'uncontrolled', 'crossing:markings': 'no' })).toBe('unmarkiert')
    expect(markierung({ crossing: 'uncontrolled', 'crossing:markings': 'dots' })).toBe('unmarkiert')
    expect(markierung({ crossing: 'uncontrolled' })).toBe('vermutlich')
    expect(markierung({ highway: 'crossing' })).toBe('unbelegt')
  })
  it('unmarkierter Übergang: gerechnet, aber deutlich als «kein Fussgängerstreifen» ausgewiesen', () => {
    const r = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, fallMit(() => {}), null)
    expect(r.markierung).toBe('unmarkiert')
    expect(r.hinweis).toMatch(/^Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug/)
    expect(r.streifen.length).toBeGreaterThan(0)
    expect(r.streifen.every(s => s.keinFgsHinweis === r.hinweis)).toBe(true)
    const m = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null)
    expect([m.markierung, m.hinweis, m.streifen[0].keinFgsHinweis]).toEqual(['markiert', '', undefined])
  })
  it('Fall-Datei trägt Markierung und Ergebnis-Auszug', () => {
    const f = fallMit(x => { x.ort.markierung = 'unbelegt' })
    const text = fallSchreiben(f, { hinweis: 'Kein Fussgängerstreifen: …', streifen: [] })
    expect(JSON.parse(text).ergebnis.hinweis).toMatch(/Kein Fussgängerstreifen/)
    const [g] = fallLesen(text)
    expect(g.ort.markierung).toBe('unbelegt')
    expect(g.ergebnis).toBeUndefined()
  })
})

describe('Korrekturen nach Prüfung E2', () => {
  it('S1: Nummern für Streifen von Hand bleiben eindeutig', () => {
    const f = fallMit(x => x.streifenHand.push({ id: 'hand-1', p0: lv(0, -4), p1: lv(0, 4), breite: 4 },
      { id: 'hand-3', p0: lv(5, -4), p1: lv(5, 4), breite: 4 }))
    expect(naechsteHandId(f)).toBe('hand-4')
    f.streifenHand.splice(0, 1)
    expect(naechsteHandId(f)).toBe('hand-4')
  })
  it('S2: gestrichene gerade Zufahrt deckt die Abbiegenden nicht mehr', () => {
    const d = daten()
    const r0 = rechneFall(d, AV, [], 12, fallMit(() => {}), null).streifen[0]
    const ged = r0.entfallen.filter(e => e.grund === 'gedeckt')
    expect(ged.length).toBeGreaterThan(0)
    const g = r0.zufahrten.find(z => z.art !== 'abbiegend' && z.richtung === 0)!
    const r1 = rechneFall(d, AV, [], 12, fallMit(x => { x.zufahrten[zufahrtSchluessel(r0.fgsId, g.kennung)] = { streichen: true } }), null).streifen[0]
    expect(r1.entfallen.filter(e => e.grund === 'gedeckt').map(e => e.kennung)).not.toEqual(expect.arrayContaining(ged.map(e => e.kennung)))
    expect(r1.zufahrten.some(z => z.art === 'abbiegend' && ged.some(e => e.kennung === z.kennung))).toBe(true)
  })
  it('S3: crossing=uncontrolled ohne Markierung gilt als vermutlicher Fussgängerstreifen', () => {
    const r = rechneFall(daten({}, { highway: 'crossing', crossing: 'uncontrolled' }), AV, [], 12, fallMit(() => {}), null)
    expect(r.markierung).toBe('vermutlich')
    expect(r.hinweis).toMatch(/vermutlich Fussgängerstreifen, bitte prüfen/)
    expect(r.streifen[0].keinFgsHinweis).toBeUndefined()
    expect(r.streifen[0].markierungHinweis).toBe(r.hinweis)
    expect(markierung({ highway: 'crossing', crossing: 'no' })).toBe('unbelegt')   // wird schon beim Laden ausgeschlossen
  })
  it('S4: Eingaben wandern mit, wenn Streifen aus OSM übernommen werden', () => {
    const r = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null)
    const s0 = r.streifen[0], z0 = s0.zufahrten[0]
    const f = fallMit(x => {
      x.zufahrten[zufahrtSchluessel(s0.fgsId, z0.kennung)] = { tempo: 30 }
      x.streifen[s0.fgsId] = { lsa: 'nein' }
    })
    expect(streifenUebernehmen(f, r.streifen, r.streifen)).toBe(2)
    const r2 = rechneFall(daten(), AV, [], 12, f, null)
    expect(r2.streifenQuelle).toBe('hand')
    const z = r2.streifen[0].zufahrten.find(x => x.kennung === z0.kennung)!
    expect([z.tempo, z.tempoQuelle]).toEqual([30, 'Korrektur'])
    expect(eingabenVerwaist(f, r2.streifen)).toEqual([])
    expect(eingabenVerwaist(fallMit(x => { x.zufahrten['alt|w1+'] = { tempo: 30 } }), r2.streifen)).toEqual(['alt|w1+'])
  })
  it('Streifen von Hand der Länge 0 wird übergangen', () => {
    const r = rechneFall(daten(), AV, [], 12, fallMit(x => x.streifenHand.push({ id: 'hand-1', p0: lv(3, 0), p1: lv(3, 0), breite: 4 })), null)
    expect(r.streifen.length).toBe(0)
    expect(r.meldungen.join(' ')).toMatch(/kürzer als/)
  })
})

describe('Fall-Datei: doppelte Streifen-Nummern', () => {
  it('werden beim Laden neu nummeriert und gemeldet', () => {
    const roh = JSON.parse(fallSchreiben(fallMit(() => {})))
    roh.streifenHand = [{ id: 'hand-2', p0: [0, 0], p1: [0, 8], breite: 4 }, { id: 'hand-2', p0: [30, 0], p1: [30, 8], breite: 4 }]
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.streifenHand.map(s => s.id)).toEqual(['hand-2', 'hand-3'])
    expect(h.length).toBe(1)
  })
})

describe('Abstand Linienhindernis zum Streifen (Korrektur 13.10.2026)', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] as P[]]]
  const streifen = sq(20, 0, 24, 10)
  it('kürzester Abstand über die Strecken, nicht nur die Stützpunkte', () => {
    // lange Mauer quer vor dem Streifen: Mitte 1 m davor, beide Stützpunkte über 60 m entfernt
    const mauer: P[] = [[19, -60], [19, 70]]
    expect(Math.min(...mauer.map(p => Math.hypot(p[0] - 20, p[1] < 0 ? p[1] : p[1] - 10)))).toBeGreaterThan(59)
    expect(abstandLinieMulti(mauer, streifen)).toBeCloseTo(1, 9)
    expect(abstandLinieMulti([[10, 5], [15, 5]], streifen)).toBeCloseTo(5, 9)        // Stützpunkt am nächsten: wie bisher
  })
  it('Linie schneidet bzw. berührt den Streifen oder liegt darin: 0', () => {
    expect(abstandLinieMulti([[10, 5], [30, 5]], streifen)).toBe(0)
    expect(abstandLinieMulti([[22, -5], [22, 15]], streifen)).toBe(0)
    expect(abstandLinieMulti([[18, 12], [26, 12], [26, -2]], streifen)).toBeCloseTo(2, 9)  // umläuft ihn nur
    expect(abstandLinieMulti([[20, -5], [20, 15]], streifen)).toBe(0)                  // entlang der Kante
    expect(abstandLinieMulti([[21, 2], [23, 8]], streifen)).toBe(0)                    // ganz innen
  })
  it('Konflikt einer Mauer: Abstand der Mitte zählt (Panel, Karte, Bericht)', () => {
    const feld = sq(0, 0, 20, 10), keineGeb = new Gebaeude([])
    const hd = new HindernisDaten([{ id: 'm', art: 'mauer', linie: [[18.5, -60], [18.5, 70]], sichtbehindernd: true, quelle: 'hand' }])
    const k = konflikteSuchen(feld, streifen, keineGeb, [], [], hd)
    expect(k.length).toBe(1)
    expect(k[0].abstand).toBeCloseTo(1.5, 9)        // vorher Abstand der Stützpunkte (> 60 m)
  })
})

describe('Fall-Datei: kaputte Dateien (Korrektur 13.10.2026)', () => {
  const roh = () => JSON.parse(fallSchreiben(fallMit(() => {})))
  it('Objekt statt Liste, Liste statt Objekt, null: übergangen und gemeldet, keine Ausnahme', () => {
    const r = roh()
    r.streifenHand = { id: 'hand-1' }
    r.hindernisse = null
    r.zufahrten = [{ tempo: 30 }]
    r.streifen = 'ja'
    r.vorschlaege = null
    r.quellen = [1, 2]
    let g: Fall | null = null, h: string[] = []
    expect(() => { [g, h] = fallLesen(JSON.stringify(r)) }).not.toThrow()
    expect(g!.streifenHand).toEqual([])
    expect(g!.hindernisse).toEqual([])
    expect(g!.zufahrten).toEqual({})
    expect(g!.streifen).toEqual({})
    expect(g!.vorschlaege).toEqual({})
    expect(g!.quellen).toEqual({})
    expect(h).toEqual(['Quellen ungültig (kein Objekt), übergangen', 'Streifen von Hand ungültig (keine Liste), übergangen',
      'Hindernisse ungültig (keine Liste), übergangen', 'Zufahrten ungültig (kein Objekt), übergangen',
      'Streifen-Eingaben ungültig (kein Objekt), übergangen', 'Vorschläge ungültig (kein Objekt), übergangen'])
  })
  it('einzelne ungültige Einträge übergangen und gemeldet, gültige bleiben', () => {
    const r = roh()
    r.streifenHand = [null, 5, { id: 'hand-1', p0: [0, 0], p1: [0, 8], breite: 4 }]
    r.hindernisse = [null, 'baum', [1, 2], { id: 'b', art: 'baum', p: [1, 2], stamm: 0.5, quelle: 'hand' }]
    r.zufahrten = { 'a|0': null, 'b|0': [30], 'c|0': { tempo: 999 }, 'd|0': { tempo: 30 }, 'e|0': {} }
    r.streifen = { 1: 'ja', 2: { lsa: 'ja' } }
    r.vorschlaege = { x: 'verworfen', y: true }
    r.quellen = { osm: 'OSM', av: 5, fremd: 'x' }
    const [g, h] = fallLesen(JSON.stringify(r))
    expect(g.streifenHand.map(s => s.id)).toEqual(['hand-1'])
    expect(g.hindernisse.map(x => x.id)).toEqual(['b'])
    expect(g.zufahrten).toEqual({ 'd|0': { tempo: 30 } })
    expect(g.streifen).toEqual({ 2: { lsa: 'ja' } })
    expect(g.vorschlaege).toEqual({ x: 'verworfen' })
    expect(g.quellen).toEqual({ osm: 'OSM' })
    expect(h).toEqual(['Quelle «av» ungültig, übergangen', 'Streifen von Hand ungültig, übergangen', 'Streifen von Hand ungültig, übergangen',
      'Hindernis ungültig, übergangen', 'Hindernis ungültig, übergangen', 'Hindernis ungültig, übergangen',
      'Zufahrt a|0 ungültig, übergangen', 'Zufahrt b|0 ungültig, übergangen', 'Zufahrt c|0 ungültig, übergangen',
      'Streifen-Eingabe 1 ungültig, übergangen', 'Vorschlag y ungültig, übergangen'])
  })
  it('Ort: ungültige bzw. fremde Koordinaten werfen einen klaren Fehler', () => {
    const mitOrt = (lat: unknown, lon: unknown) => JSON.stringify({ ...roh(), ort: { lat, lon, uebergang: 12 } })
    expect(() => fallLesen(mitOrt(999, 7.44))).toThrow(/keine WGS84-Koordinaten/)
    expect(() => fallLesen(mitOrt(46.95, -200))).toThrow(/keine WGS84-Koordinaten/)
    expect(() => fallLesen(mitOrt(48.85, 2.35))).toThrow(/ausserhalb der Schweiz/)     // Paris
    expect(() => fallLesen(mitOrt(1200000, 2600000))).toThrow(/keine WGS84/)          // LV95 statt WGS84
    expect(() => fallLesen(mitOrt('46.95', 7.44))).toThrow(/Ort fehlt/)
    expect(() => fallLesen(JSON.stringify({ ...roh(), ort: null }))).toThrow(/Ort fehlt/)
    expect(() => fallLesen('null')).toThrow(/keine fgsCheck-Fall-Datei/)
    expect(() => fallLesen('[]')).toThrow(/keine fgsCheck-Fall-Datei/)
    expect(fallLesen(mitOrt(47.14, 9.52))[0].ort.lat).toBe(47.14)                      // Vaduz
  })
  it('Gebiet: Ecken der Schweiz liegen darin', () => {
    expect([[45.818, 9.02], [47.808, 8.57], [46.13, 5.956], [46.63, 10.492]].every(([a, b]) => imGebiet(a, b))).toBe(true)
    expect(imGebiet(45.4, 9.2)).toBe(false)                                            // Mailand
  })
})

describe('Fall im Browser merken (localStorage)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const speicher = () => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) } })
    return m
  }
  it('ohne Eingaben kein Eintrag; mit Eingaben gespeichert; zurückgesetzt wieder entfernt', () => {
    const m = speicher()
    const leer = leererFall(46.95, 7.44, 42)
    fallMerken(leer)
    expect(m.size).toBe(0)
    const mit = structuredClone(leer)
    mit.streifen['1'] = { lsa: 'ja' }
    fallMerken(mit)
    expect([...m.keys()]).toEqual(['fgsCheck.fall.42'])
    expect(fallErinnern(42)?.streifen['1']?.lsa).toBe('ja')
    fallMerken(leererFall(46.95, 7.44, 42))          // «Eingaben verwerfen»
    expect(m.size).toBe(0)
    expect(fallErinnern(42)).toBeNull()
  })
  it('kaputte Einträge im Speicher stürzen nicht ab', () => {
    const m = speicher()
    m.set('fgsCheck.fall.5', '{kaputt')
    m.set('fgsCheck.fall.6', JSON.stringify({ app: 'fgsCheck', version: 1, ort: { lat: 999, lon: 7 } }))
    m.set('fgsCheck.fall.7', JSON.stringify({ app: 'fgsCheck', version: 1, ort: { lat: 46.95, lon: 7.44, uebergang: 7 },
      hindernisse: {}, zufahrten: [], streifen: null }))
    expect(fallErinnern(5)).toBeNull()
    expect(fallErinnern(6)).toBeNull()
    expect(fallErinnern(7)?.hindernisse).toEqual([])
  })
  it('Bezeichnung oder abgeschaltete Luftbild-Suche allein werden gemerkt', () => {
    const m = speicher()
    const a = leererFall(46.95, 7.44, 7); a.ort.bezeichnung = 'Bahnhofplatz'
    fallMerken(a)
    const b = leererFall(46.95, 7.44, 8); b.luftbild = false
    fallMerken(b)
    expect([...m.keys()].sort()).toEqual(['fgsCheck.fall.7', 'fgsCheck.fall.8'])
  })
})

describe('Herkunft der Streifen von Hand', () => {
  it('wird beim Übernehmen gesetzt, gespeichert, gelesen und als Text ausgegeben', async () => {
    const { leererFall, streifenUebernehmen, fallSchreiben, fallLesen, streifenHerkunftText } = await import('../fall')
    const f = leererFall(46.95, 7.44, 1)
    streifenUebernehmen(f, [{ p0: [0, 0], p1: [8, 0], bw: 4 }], [], 'luftbild')
    expect(f.streifenHand[0].herkunft).toBe('luftbild')
    expect(streifenHerkunftText(f.streifenHand[0])).toBe('aus dem Luftbild übernommen')
    f.streifenHand[0].angepasst = true
    const [g] = fallLesen(fallSchreiben(f))!
    expect(g.streifenHand[0].herkunft).toBe('luftbild')
    expect(streifenHerkunftText(g.streifenHand[0])).toBe('aus dem Luftbild übernommen, Enden von Hand angepasst')
    expect(streifenHerkunftText({ id: 'hand-1', p0: [0, 0], p1: [8, 0], breite: 4 })).toBe('von Hand (Herkunft nicht gespeichert)')
  })
})
