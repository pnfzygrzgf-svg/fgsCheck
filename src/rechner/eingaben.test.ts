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
import { rechneFall, handUmriss } from './index'
import { neuerStreifen, zufahrtenStreifen, handGruppen, TEIL_ENDEN_LUECKE_M, TEIL_ENDEN_LUECKE_MIN_M } from './streifen'
import { linieKreis } from './spurhand'
import { gedecktRechnenSetzen } from './abbiegen'
import { leererFall, fallLesen, fallSchreiben, zufahrtSchluessel, naechsteHandId, streifenUebernehmen, eingabenVerwaist,
  fallMerken, fallErinnern, fallVergessen, ohneUebergang, eingabenSchluessel, ortMerkenEntscheid, ortOhneUebergangText, imGebiet, type Fall,
  type StreifenHand } from '../fall'
import { markierung, markierungHinweis, planungHinweis, knotenLage } from '../daten/osm'
import type { Konflikt } from './typen'
import { befundblaetter } from '../bedarf/befundblatt'

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
  it('unmarkierter Übergang (29.10.2026): als Querung ohne Vortritt angenommen; «Fussgängerstreifen» gewählt: wie bisher «kein Fussgängerstreifen»', () => {
    const r = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, fallMit(() => {}), null)
    expect(r.markierung).toBe('unmarkiert')
    expect(r.hinweis).toBe('Unmarkierte Querung (OSM: crossing=unmarked): als Querung ohne Vortritt angenommen (ohne bauliche Massnahme), ' +
      'Sichtweite nach VSS 40 240 Z. 8.2; für einen geplanten Fussgängerstreifen unter «Querung» Fussgängerstreifen wählen.')
    expect(r.streifen.length).toBeGreaterThan(0)
    expect(r.streifen.every(s => s.querungAnnahme === r.hinweis && s.querung?.typ === 'ohne_vortritt' && !s.keinFgsHinweis)).toBe(true)
    const g = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, fallMit(x => { x.streifen['12'] = { typ: 'fgs' } }), null)
    expect(g.hinweis).toMatch(/^Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug/)
    expect(g.streifen.every(s => s.keinFgsHinweis === g.hinweis && !s.querung && !s.querungAnnahme)).toBe(true)
    // gespeicherte Wahl bleibt: Furt von Hand ohne Annahme
    const f = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, fallMit(x => { x.streifen['12'] = { typ: 'furt' } }), null)
    expect(f.streifen.every(s => s.querung?.typ === 'furt' && !s.querungAnnahme)).toBe(true)
    // ohne Angabe zur Art (unbelegt) ebenso; vermutlich markiert (uncontrolled) bleibt Fussgängerstreifen
    const u = rechneFall(daten({}, { highway: 'crossing' }), AV, [], 12, fallMit(() => {}), null)
    expect(u.streifen.every(s => s.querung?.typ === 'ohne_vortritt' && s.querungAnnahme)).toBe(true)
    const v = rechneFall(daten({}, { highway: 'crossing', crossing: 'uncontrolled' }), AV, [], 12, fallMit(() => {}), null)
    expect(v.streifen.every(s => !s.querung && !s.querungAnnahme)).toBe(true)
    const m = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null)
    expect([m.markierung, m.hinweis, m.streifen[0].keinFgsHinweis]).toEqual(['markiert', '', undefined])
  })
  it('unmarkierter Übergang mit Insel (AV-Verkehrsinsel bzw. Insel von Hand): als Furt angenommen; Fall-Datei ohne Wahl bleibt ohne typ', () => {
    const avInsel: AvFlaeche[] = [
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -4, 200, -1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 1.2, 200, 4)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -1.2, -4, 1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(4, -1.2, 200, 1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-43, -200, -37, -4)] },
      { art: 'Verkehrsinsel', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-4, -1.2, 4, 1.2)] },
      ...AV.slice(1),
    ]
    const r = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), avInsel, [], 12, fallMit(() => {}), null)
    expect(r.streifen.length).toBe(2)
    expect(r.streifen.every(s => s.querung?.typ === 'furt' && s.querungAnnahme?.includes('(Furt)'))).toBe(true)
    const h = fallMit(x => { x.hindernisse.push({ id: 'insel-1', art: 'insel', ring: [lv(-3, -0.5), lv(3, -0.5), lv(3, 1.5), lv(-3, 1.5)], quelle: 'hand' }) })
    expect(rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, h, null).streifen.every(s => s.querung?.typ === 'furt')).toBe(true)
    // Fall-Datei: ohne Wahl kein typ (unverändert), «Fussgängerstreifen» gewählt als typ «fgs» gelesen und geschrieben
    const f0 = fallMit(() => {})
    expect(JSON.parse(fallSchreiben(f0)).streifen).toEqual({})
    const f1 = fallMit(x => { x.streifen['12'] = { typ: 'fgs' } })
    const [g] = fallLesen(fallSchreiben(f1))
    expect(g.streifen['12']).toEqual({ typ: 'fgs' })
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
    // Vorgabe GEDECKT_RECHNEN aus (seit 14.10.2026 wieder wie bis 13.10.2026): die von der geraden Zufahrt mitgeprüften
    // Abbiegezufahrten entfallen mit Grund «gedeckt»; nach dem Streichen der geraden Zufahrt werden sie selbst geprüft
    const d = daten()
    const r0 = rechneFall(d, AV, [], 12, fallMit(() => {}), null).streifen[0]
    const ged = r0.entfallen.filter(e => e.grund === 'gedeckt')
    expect(ged.length).toBeGreaterThan(0)
    const g = r0.zufahrten.find(z => z.art !== 'abbiegend' && z.richtung === 0)!
    const r1 = rechneFall(d, AV, [], 12, fallMit(x => { x.zufahrten[zufahrtSchluessel(r0.fgsId, g.kennung)] = { streichen: true } }), null).streifen[0]
    expect(r1.entfallen.some(e => e.grund === 'gedeckt')).toBe(false)
    const neu = r1.zufahrten.filter(z => z.art === 'abbiegend' && ged.some(e => e.kennung === z.kennung))
    expect(neu.length).toBe(ged.length)
    expect(neu.every(z => z.deckung === undefined && !z.netzHinweis.includes('gedeckt'))).toBe(true)
    // ohne gerade Zufahrt prüft niemand die Strecke ab dem Knoten mit: «bis Knoten» mit Tab. 1 der eigenen Strasse
    expect(neu.every(z => z.sichtweiteQuelle.startsWith('bis Knoten (Tab. 1 eigene Strasse'))).toBe(true)
    // mit Schalter an dasselbe: vorher Zufahrten mit «deckung», nach dem Streichen ohne
    try {
      gedecktRechnenSetzen(true)
      const a0 = rechneFall(d, AV, [], 12, fallMit(() => {}), null).streifen[0]
      expect(a0.zufahrten.filter(z => z.deckung).map(z => z.kennung)).toEqual(ged.map(e => e.kennung))
      const a1 = rechneFall(d, AV, [], 12, fallMit(x => { x.zufahrten[zufahrtSchluessel(r0.fgsId, g.kennung)] = { streichen: true } }), null).streifen[0]
      expect(a1.zufahrten.filter(z => ged.some(e => e.kennung === z.kennung)).every(z => z.deckung === undefined)).toBe(true)
    } finally { gedecktRechnenSetzen(null) }
  })
  it('Schalter GEDECKT_RECHNEN an: gedeckte Abbiegezufahrt mit Eingaben über die Kennung, Ergebnis zählt für den Streifenstatus', () => {
    try {
      gedecktRechnenSetzen(true)
      const fid = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null).streifen[0].fgsId
      const key = zufahrtSchluessel(fid, 'k11:w2+')
      // Fahrlinie von Hand am Rand (Rechtsabbieger) und ein Baum auf der Fahrbahn direkt an einem Sichtpunkt der geraden
      // Zufahrt w1+ (dort unter 1 m: zählt nicht), im Sichtfeld der gedeckten Abbiegezufahrt. Mit der Kurvensichtweite (hier
      // 10 m, seit 13.10.2026) liegt deren Sichtfeld sonst ganz in dem der geraden Zufahrt; mit «bis Knoten» (38 m) stand der
      // Baum auf dem Trottoir am Arm (-30/-4,6), den die Sichtpunkte jetzt nicht mehr erreichen
      const mit = (x: Fall) => {
        x.zufahrten[key] = { spur: { art: 'B', linie: [lv(-2, -3), lv(-37, -3), lv(-38.5, -5), lv(-38.5, -30)] } }
        x.hindernisse.push({ id: 'b', art: 'baum', p: lv(-8, -1.8), stamm: 0.5, quelle: 'hand' })
      }
      const s = rechneFall(daten(), AV, [], 12, fallMit(mit), null).streifen[0]
      const ab = s.zufahrten.find(z => z.kennung === 'k11:w2+')!
      expect(ab.deckung).toBeDefined()
      expect(ab.lageQuelle).toBe('Hand')
      expect(ab.sichtweite).toBe(10)                     // Kurvensichtweite, auch entlang der Fahrlinie von Hand
      expect(ab.netzHinweis).toEqual(expect.arrayContaining(['spur_hand', 'gedeckt']))
      expect(ab.status).toBe('verdeckt_baum')
      expect(s.zufahrten.filter(z => z !== ab).map(z => z.status)).toEqual(['frei', 'frei'])
      expect(s.status).toBe('verdeckt_baum')
      // Streichen über die Kennung
      const g = rechneFall(daten(), AV, [], 12, fallMit(x => { x.zufahrten[key] = { streichen: true } }), null).streifen[0]
      expect(g.zufahrten.map(z => z.kennung)).not.toContain('k11:w2+')
      expect(g.entfallen.find(e => e.kennung === 'k11:w2+')?.grund).toBe('hand')
      // Vorgabe (Schalter aus): entfällt «gedeckt», der Baum zählt nicht; die Eingabe hat keine Zufahrt mehr, gilt aber nicht
      // als verwaist (ihre Kennung steht unter «entfallen»)
      gedecktRechnenSetzen(null)
      const fAus = fallMit(mit)
      const r = rechneFall(daten(), AV, [], 12, fAus, null)
      expect(r.streifen[0].status).toBe('frei')
      expect(r.streifen[0].zufahrten.map(z => z.kennung)).not.toContain('k11:w2+')
      expect(r.streifen[0].entfallen.find(e => e.kennung === 'k11:w2+')?.grund).toBe('gedeckt')
      expect(eingabenVerwaist(fAus, r.streifen)).toEqual([])
    } finally { gedecktRechnenSetzen(null) }
  })
  it('Schalter GEDECKT_RECHNEN an: Tempo von Hand gilt, Radius von Hand entscheidet die Deckung neu', () => {
    const fid = rechneFall(daten(), AV, [], 12, fallMit(() => {}), null).streifen[0].fgsId
    const key = zufahrtSchluessel(fid, 'k11:w2+')
    const linie = [lv(-2, -3), lv(-37, -3), lv(-38.5, -5), lv(-38.5, -30)]
    const fall = (e: Fall['zufahrten'][string]) => rechneFall(daten(), AV, [], 12, fallMit(x => { x.zufahrten[key] = e }), null).streifen[0]
    const ab = (e: Fall['zufahrten'][string]) => fall(e).zufahrten.find(z => z.kennung === 'k11:w2+')!
    const kurve = 'Kurvensichtweite (bfu); ab dem Knoten prüft die gerade Zufahrt mit'
    const text = (sk: number) => `Knoten 38,0 m vor dem Streifen; Kurvensichtweite des Abbiegers ${sk} m; die gerade Zufahrt prüft ` +
      'diese Strecke über 55 m mit'
    // Vorgabe (Schalter aus): mit Tempo von Hand entfällt sie «gedeckt», der Text nennt die Kurvensichtweite (R 5 m: bfu 10 m)
    const e = fall({ tempo: 50 }).entfallen.find(x => x.kennung === 'k11:w2+')!
    expect([e.grund, e.quelle]).toEqual(['gedeckt', text(10)])
    try {
      gedecktRechnenSetzen(true)
      // Tempo von Hand: gilt; die Sichtweite bleibt die Kurvensichtweite (eckige AV-Ecke, R 5 m: bfu 10 m), weiter gedeckt
      const t = ab({ tempo: 50 })
      expect([t.tempo, t.tempoQuelle, t.sichtweite, t.sichtweiteQuelle]).toEqual([50, 'Korrektur', 10, kurve])
      expect(t.deckung).toBe(text(10))
      // Radius von Hand 12 m: bfu 20 m, der Knoten (38 m) liegt weiter weg -> weiter gedeckt, Sichtweite aus dem Handradius
      const r12 = ab({ spur: { art: 'B', linie, radius: 12 } })
      expect([r12.kurvenradiusM, r12.sichtweite, r12.sichtweiteQuelle]).toEqual([12, 20, kurve])
      expect(r12.deckung).toBe(text(20))
      expect(r12.netzHinweis).toEqual(expect.arrayContaining(['spur_hand', 'gedeckt']))
      // Radius von Hand 30 m mit Tempo 50: VSS Tab. 2 40 m, der Knoten liegt innerhalb -> nicht gedeckt, ohne «deckung»
      const r30 = ab({ tempo: 50, spur: { art: 'B', linie, radius: 30 } })
      expect([r30.kurvenradiusM, r30.sichtweite, r30.sichtweiteQuelle, r30.deckung]).toEqual([30, 40, 'VSS Tab. 2', undefined])
      expect(r30.netzHinweis).toContain('spur_hand')
      expect(r30.netzHinweis).not.toContain('gedeckt')
    } finally { gedecktRechnenSetzen(null) }
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

describe('Planung: Streifen von Hand (16.10.2026)', () => {
  const hand = (x: Fall) => { x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.6), breite: 4, herkunft: 'gezeichnet' }) }
  it('an einer Querung ohne Fussgängerstreifen: «Heute kein Fussgängerstreifen …», nicht «kein FGS» am Streifen', () => {
    const r = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, fallMit(hand), null)
    expect(r.streifenQuelle).toBe('hand')
    expect(r.markierung).toBe('unmarkiert')
    expect(r.hinweis).toBe('Heute kein Fussgängerstreifen (OSM: crossing=unmarked); der Streifen von Hand wird als Fussgängerstreifen geprüft.')
    expect(r.streifen.map(s => [s.keinFgsHinweis, s.markierungHinweis])).toEqual([[undefined, undefined]])
    expect(r.streifen[0].status).not.toBe('kein_fgs')
    expect(r.streifen[0].zufahrten.length).toBeGreaterThan(0)
    const u = rechneFall(daten({}, { highway: 'crossing' }), AV, [], 12, fallMit(hand), null)
    expect(u.hinweis).toBe('Heute kein Fussgängerstreifen (OSM: ohne Angabe zur Art der Querung); der Streifen von Hand wird als ' +
      'Fussgängerstreifen geprüft.')
    const d = rechneFall(daten({}, { highway: 'crossing', 'crossing:markings': 'dots' }), AV, [], 12, fallMit(hand), null)
    expect(d.hinweis).toMatch(/^Heute kein Fussgängerstreifen \(OSM: crossing:markings=dots\)/)
    // ohne Streifen von Hand: am Streifen aus OSM + AV die Querung ohne Vortritt (Annahme, 29.10.2026); am Fussgängerstreifen kein Hinweis
    const o = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, fallMit(() => {}), null)
    expect(o.hinweis).toMatch(/^Unmarkierte Querung \(OSM: crossing=unmarked\): als Querung ohne Vortritt angenommen/)
    expect(r.streifen.every(s => !s.querung && !s.querungAnnahme)).toBe(true)
    expect(o.streifen.every(s => s.querungAnnahme === o.hinweis)).toBe(true)
    const z = rechneFall(daten(), AV, [], 12, fallMit(hand), null)
    expect([z.hinweis, z.streifen[0].keinFgsHinweis]).toEqual(['', undefined])
    // «kein FGS» von Hand bleibt wie bisher
    const k = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12,
      fallMit(x => { hand(x); x.streifen['hand-1'] = { keinFgs: true } }), null)
    expect(k.streifen[0].status).toBe('kein_fgs')
  })
  it('ohne OSM-Übergang: gerechnet und vermasst (Bordkanten der Rechnung, Winkel zum OSM-Weg, Knoten stromauf)', () => {
    const f = leererFall(ll(0, 0)[0], ll(0, 0)[1], null)
    hand(f)
    const r = rechneFall(daten(), AV, [], null, f, null)
    expect([r.streifenQuelle, r.hinweis, r.markierung]).toEqual(['hand', '', null])
    const s = r.streifen[0], v = s.vermassung!
    expect(s.randQuelle).toBe('AV')
    expect(v.punkte.length).toBe(6)
    expect(v.punkte.slice(2).map(q => q.p)).toEqual(s.umriss)              // Ecken = Umriss der Rechnung
    expect(v.laengeM).toBeCloseTo(7.3)
    expect(v.winkelGrad).toBeCloseTo(90)
    expect(v.winkelQuelle).toBe('nächster befahrbarer OSM-Weg')
    expect(v.randAbstandM![0]).toBeCloseTo(0.3)
    expect(v.randAbstandM![1]).toBeCloseTo(0.4)
    expect(v.fahrbahnM).toBeCloseTo(8)
    // Richtung Ost (Fahrt von Westen): Knoten Querweg bei x = -40, ab Streifenrand (Breite 4 m) 38 m
    expect(v.knoten.map(k => [k.strasse, Math.round(k.abstandM)])).toContainEqual(['Hauptstrasse', 38])
    expect(s.zufahrten.length).toBeGreaterThan(0)
  })
})

describe('Planung: Hinweis zur Markierung mit Streifen von Hand («vermutlich», Lichtsignal: wie bisher)', () => {
  const hand = (x: Fall) => { x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.6), breite: 4, herkunft: 'gezeichnet' }) }
  it('«vermutlich» (crossing=uncontrolled): kein Planungshinweis, «vermutlich Fussgängerstreifen» am Streifen', () => {
    const t = { highway: 'crossing', crossing: 'uncontrolled' }
    expect(markierung(t)).toBe('vermutlich')
    expect(planungHinweis('vermutlich', t)).toBe('')
    const r = rechneFall(daten({}, t), AV, [], 12, fallMit(hand), null)
    expect(r.hinweis).toBe(markierungHinweis('vermutlich', t))
    expect(r.hinweis).toMatch(/vermutlich Fussgängerstreifen, bitte prüfen/)
    expect(r.streifen.map(s => [s.markierungHinweis, s.keinFgsHinweis])).toEqual([[r.hinweis, undefined]])
  })
  it('Lichtsignal: weder Planungs- noch Markierungshinweis', () => {
    const t = { highway: 'crossing', crossing: 'traffic_signals' }
    expect(markierung(t)).toBe('lsa')
    expect(planungHinweis('lsa', t)).toBe('')
    const r = rechneFall(daten({}, t), AV, [], 12, fallMit(hand), null)
    expect([r.markierung, r.hinweis]).toEqual(['lsa', ''])
    expect(r.streifen.map(s => [s.markierungHinweis, s.keinFgsHinweis])).toEqual([[undefined, undefined]])
  })
})

describe('Mehrere Streifen von Hand (Korrektur 16.10.2026, M1): Teilstreifen nur auf einer Achse', () => {
  // A über die Hauptstrasse beim Übergang, B über den Querweg (x = -40, Fahrbahn x -43 … -37) 20 m südlich: zwei Arme
  const A: StreifenHand = { id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.6), breite: 4, herkunft: 'gezeichnet' }
  const B: StreifenHand = { id: 'hand-2', p0: lv(-43.3, -20), p1: lv(-36.7, -20), breite: 4, herkunft: 'gezeichnet' }
  const mit = (...hs: StreifenHand[]) => { const f = leererFall(ll(0, 0)[0], ll(0, 0)[1], null); f.streifenHand = structuredClone(hs); return f }
  const ohneKennung = (s: object) => JSON.parse(JSON.stringify(s, (k, v) => (k === 'uebergangId' ? undefined : v)))
  it('A + B ergibt dasselbe wie A allein und B allein', () => {
    const a = rechneFall(daten(), AV, [], null, mit(A), null), b = rechneFall(daten(), AV, [], null, mit(B), null)
    const ab = rechneFall(daten(), AV, [], null, mit(A, B), null)
    expect(ab.streifen.map(s => s.fgsId)).toEqual(['hand-1', 'hand-2'])
    expect(ohneKennung(ab.streifen[0])).toEqual(ohneKennung(a.streifen[0]))
    expect(ohneKennung(ab.streifen[1])).toEqual(ohneKennung(b.streifen[0]))
    // B auch zusammen mit A ohne «Inselteil»: gerade Zufahrt beide Spuren, die Gegenrichtung entfällt nur wegen der Einmündung
    expect(ab.streifen[1].zufahrten.map(z => `${z.zufahrt}:${z.art}`)).toEqual(['90:beide', 'a0:abbiegend', 'a180:abbiegend'])
    expect(ab.streifen[1].entfallen.map(e => `${e.zufahrt}:${e.grund}`)).toEqual(['270:einmuendung'])
    // Kennungen: erste Gruppe wie bisher 'hand', weitere eigene
    expect([a.streifen[0].uebergangId, ab.streifen[0].uebergangId, ab.streifen[1].uebergangId]).toEqual(['hand', 'hand', 'hand:hand-2'])
    // Gegenprobe: mit einer gemeinsamen Kennung (bis 16.10.2026) gälten sie als Teilstreifen (Inselteil an B)
    const S = [A, B].map(h => neuerStreifen(h.id, 'hand', h.p0, h.p1, h.breite, 'hand', handUmriss(h.p0, h.p1, h.breite, null)))
    zufahrtenStreifen(S)
    expect(S[1].zufahrten.map(z => z[2])).toEqual(['insel'])
  })
  it('zwei Varianten desselben geplanten Streifens (1 m daneben, kürzer): je wie allein gerechnet', () => {
    const V: StreifenHand = { id: 'hand-2', p0: lv(1, -1.7), p1: lv(1, 3.6), breite: 4, herkunft: 'gezeichnet' }
    const a = rechneFall(daten(), AV, [], null, mit(A), null), v = rechneFall(daten(), AV, [], null, mit(V), null)
    const av = rechneFall(daten(), AV, [], null, mit(A, V), null)
    expect(av.streifen.map(s => s.uebergangId)).toEqual(['hand', 'hand:hand-2'])
    expect(ohneKennung(av.streifen[0])).toEqual(ohneKennung(a.streifen[0]))
    expect(ohneKennung(av.streifen[1])).toEqual(ohneKennung(v.streifen[0]))
    expect(av.streifen.flatMap(s => s.zufahrten.map(z => z.art))).not.toContain('insel')
  })
  it('Gruppen: auf einer Achse (Lücke bis 12,6 m, quer bis 2 m, bis 20° gedreht) gemeinsam, sonst getrennt; transitiv', () => {
    const s = (id: string, x0: number, y0: number, x1: number, y1: number) => ({ id, p0: lv(x0, y0), p1: lv(x1, y1) })
    const g = (...hs: { id: string; p0: P; p1: P }[]) => [...handGruppen(hs).values()]
    expect(TEIL_ENDEN_LUECKE_M).toBeCloseTo(12.6)
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, 3, 0, 10))).toEqual(['hand', 'hand'])                  // Insel 6 m
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, 9.6, 0, 14))).toEqual(['hand', 'hand'])                 // Lücke 12,6 m
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, 9.7, 0, 14))).toEqual(['hand', 'hand:b'])               // 12,7 m
    expect(g(s('a', 0, -10, 0, -3), s('b', 1.9, 3, 1.9, 10))).toEqual(['hand', 'hand'])               // 1,9 m quer versetzt
    expect(g(s('a', 0, -10, 0, -3), s('b', 2.5, 3, 2.5, 10))).toEqual(['hand', 'hand:b'])             // 2,5 m
    expect(g(s('a', 0, -10, 0, -3), s('b', 12, -3, 12, 3))).toEqual(['hand', 'hand:b'])               // parallel, 12 m daneben
    expect(g(s('a', 0, -3, 0, 3), s('b', -3, 8, 3, 8))).toEqual(['hand', 'hand:b'])                   // quer (anderer Arm)
    // kurzer Teil (2 m) an der Insel, Ende 0,5 m seitlich verschoben: 14°, bleibt dabei; 25° nicht
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, 3, 0.5, 5))).toEqual(['hand', 'hand'])
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, 3, 0.93, 5))).toEqual(['hand', 'hand:b'])
    // Lücke mindestens 0,3 m (Nachprüfung): überlappende bzw. anstossende Varianten desselben Streifens bleiben getrennt
    expect(TEIL_ENDEN_LUECKE_MIN_M).toBeCloseTo(0.3)
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, -2.7, 0, 5))).toEqual(['hand', 'hand'])                // 0,3 m
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, -2.8, 0, 5))).toEqual(['hand', 'hand:b'])              // 0,2 m
    expect(g(s('a', 0, -10, 0, -3), s('b', 1, -7, 1, -3))).toEqual(['hand', 'hand:b'])               // 1 m daneben, kürzer
    expect(g(s('a', 0, -10, 0, -3), s('b', 0, -7.5, 0, -0.5))).toEqual(['hand', 'hand:b'])           // entlang verschoben
    // drei Teile an zwei Inseln; dazwischen ein fremder Streifen
    expect(g(s('a', 0, -12, 0, -6), s('x', 30, 0, 36, 0), s('b', 0, -3, 0, 3), s('c', 0, 6, 0, 12))).toEqual(['hand', 'hand:x', 'hand', 'hand'])
    expect(g(s('x', 30, 0, 36, 0), s('c', 0, 6, 0, 12), s('a', 0, -12, 0, -6), s('b', 0, -3, 0, 3))).toEqual(['hand', 'hand:c', 'hand:c', 'hand:c'])
  })
  it('zwei Teilstreifen an einer Insel bleiben ein Übergang («Streifen übernehmen», Insel von Hand bzw. AV-Verkehrsinsel)', () => {
    const kurz = (r: ReturnType<typeof rechneFall>) => r.streifen.map(s => [s.uebergangId, s.zufahrten.filter(z => z.art !== 'abbiegend')
      .map(z => `${z.richtung}:${z.art}`).join(), s.entfallen.filter(e => e.art === 'gerade').map(e => `${e.richtung}:${e.grund}`).join()])
    // Insel von Hand auf der Achse: OSM + AV bildet zwei Teile, übernommen als hand-1, hand-2 (Insel bleibt als Hindernis)
    const f = fallMit(x => { x.hindernisse.push({ id: 'insel-1', art: 'insel', ring: [lv(-3, -0.5), lv(3, -0.5), lv(3, 1.5), lv(-3, 1.5)], quelle: 'hand' }) })
    const r = rechneFall(daten(), AV, [], 12, f, null)
    expect(r.streifen.map(s => s.fgsId)).toEqual(['12-1', '12-2'])
    streifenUebernehmen(f, r.streifen, r.streifen, 'osm', r.inseln)
    const h = rechneFall(daten(), AV, [], 12, f, null)
    expect(h.streifenQuelle).toBe('hand')
    expect(kurz(h)).toEqual([['hand', '0:insel', '180:insel'], ['hand', '180:insel', '0:insel']])
    expect(kurz(h).map(x => x.slice(1))).toEqual(kurz(r).map(x => x.slice(1)))       // wie die Teilstreifen aus OSM + AV
    // AV-Verkehrsinsel 2,4 m quer über die Fahrbahn
    const avInsel: AvFlaeche[] = [
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -4, 200, -1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 1.2, 200, 4)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -1.2, -4, 1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(4, -1.2, 200, 1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-43, -200, -37, -4)] },
      { art: 'Verkehrsinsel', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-4, -1.2, 4, 1.2)] },
      ...AV.slice(1),
    ]
    const g = fallMit(() => {})
    const ra = rechneFall(daten(), avInsel, [], 12, g, null)
    expect(ra.streifen.map(s => s.fgsId)).toEqual(['12-1', '12-2'])
    streifenUebernehmen(g, ra.streifen, ra.streifen, 'osm', ra.inseln)
    const ha = rechneFall(daten(), avInsel, [], 12, g, null)
    expect(kurz(ha).map(x => x[0])).toEqual(['hand', 'hand'])
    expect(kurz(ha).map(x => x.slice(1))).toEqual(kurz(ra).map(x => x.slice(1)))
    // Enden danach von Hand angepasst (Ende an der Insel 0,4 m seitlich): bleibt ein Übergang
    g.streifenHand[0].p1 = [g.streifenHand[0].p1[0] + 0.4, g.streifenHand[0].p1[1]]
    expect(kurz(rechneFall(daten(), avInsel, [], 12, g, null)).map(x => x[0])).toEqual(['hand', 'hand'])
  })
})

describe('Planung: gesichert, Übergang weg, Bericht (Korrektur 16.10.2026)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('«gesichert» über den Inhalt der Eingaben: Quellen, Stand, Ergebnis, Markierung und Ort zählen nicht', () => {
    const f = leererFall(46.95, 7.44, null)
    f.streifenHand.push({ id: 'hand-1', p0: [2600000, 1200000], p1: [2600000, 1200007], breite: 4, herkunft: 'gezeichnet' })
    f.zufahrten['hand-1|w1+'] = { tempo: 30 }
    const k = eingabenSchluessel(f)
    // eben gespeichert und wieder gelesen (andere Reihenfolge der Schlüssel, gespeichert-Stempel): gleich
    const [g] = fallLesen(fallSchreiben(f, { hinweis: 'x', streifen: [] }))
    expect(eingabenSchluessel(g)).toBe(k)
    const h = structuredClone(f)
    h.quellen = { osm: 'overpass', geladen: '2026-10-16' }; h.gespeichert = '2026-10-16T10:00:00Z'; h.ort.markierung = 'unmarkiert'
    h.ort.lat = 46.96; h.zufahrten = { 'hand-1|w1+': { tempo: 30 } }
    expect(eingabenSchluessel(h)).toBe(k)
    // Eingaben geändert: nicht mehr gesichert
    const e = structuredClone(f); e.streifenHand[0].breite = 5
    expect(eingabenSchluessel(e)).not.toBe(k)
    const b = structuredClone(f); b.ort.bezeichnung = 'Glockenstrasse'
    expect(eingabenSchluessel(b)).not.toBe(k)
  })
  it('Übergang weg: ohneUebergang, Eintrag des Übergangs entfernen, Fall ohne Übergang zurückholen', () => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) } })
    const f = leererFall(46.95, 7.44, 42); f.ort.markierung = 'unbelegt'; f.streifen['1'] = { lsa: 'ja' }
    fallMerken(f)
    const o = ohneUebergang(f)
    expect([o.ort.uebergang, o.ort.markierung, f.ort.uebergang]).toEqual([null, undefined, 42])
    fallVergessen(42); fallMerken(o)
    expect([...m.keys()]).toEqual(['fgsCheck.fall.ort'])
    expect(fallErinnern('ort')?.streifen['1']?.lsa).toBe('ja')
    m.set('fgsCheck.fall.ort', '{kaputt')
    expect(fallErinnern('ort')).toBeNull()
  })
  it('Eintrag «fgsCheck.fall.ort»: ein anderer gemerkter Fall wird nicht still ersetzt (ortMerkenEntscheid, Nachprüfung S-b)', () => {
    const plan = (x: number) => { const f = leererFall(46.95, 7.44, null)
      f.streifenHand.push({ id: 'hand-1', p0: [2600000 + x, 1200000], p1: [2600000 + x, 1200007], breite: 4, herkunft: 'gezeichnet' }); return f }
    const A = plan(0), B = plan(500), X = leererFall(46.95, 7.44, 42)
    X.streifen['1'] = { lsa: 'ja' }
    // Fall mit Übergang: immer unter seinem Übergang merken
    expect(ortMerkenEntscheid(X, false, A)).toBe('merken')
    // Planfall A ungesichert im Eintrag, später (nach dem Wechsel zu X) ein neuer Planfall B: erst nachfragen
    expect(ortMerkenEntscheid(B, false, A)).toBe('rueckfrage')
    // B gehört der Eintrag schon (selbst geschrieben bzw. Ersetzen bestätigt): weiter merken
    expect(ortMerkenEntscheid(B, true, A)).toBe('merken')
    // A wiederhergestellt (gleiche Eingaben, auch mit anderem Ort, Quellen, Stand): merken, gehört ihm
    const A2 = structuredClone(A); A2.ort.lat = 46.96; A2.quellen = { osm: 'x' }; A2.gespeichert = '2026-10-16T09:00:00Z'
    expect(ortMerkenEntscheid(A2, false, A)).toBe('merken')
    // kein bzw. unlesbarer Eintrag oder einer ohne Eingaben: merken
    expect(ortMerkenEntscheid(B, false, null)).toBe('merken')
    expect(ortMerkenEntscheid(B, false, leererFall(46.95, 7.44, null))).toBe('merken')
    // offener Fall ohne Übergang und ohne Eingaben: fremden Eintrag weder überschreiben noch löschen
    expect(ortMerkenEntscheid(leererFall(46.95, 7.44, null), false, A)).toBe('nichts')
    expect(ortMerkenEntscheid(leererFall(46.95, 7.44, null), true, A)).toBe('merken')     // eigener Eintrag: entfernen wie bisher
  })
  it('Bericht: «geplanter Streifen» nur bei gezeichneten Streifen, sonst neutral', () => {
    const f = leererFall(46.95, 7.44, null)
    expect(ortOhneUebergangText(f)).toBe('kein OSM-Übergang')
    f.streifenHand.push({ id: 'hand-1', p0: [0, 0], p1: [0, 7], breite: 4, herkunft: 'gezeichnet' })
    expect(ortOhneUebergangText(f)).toBe('kein OSM-Übergang (Ort am geplanten Streifen)')
    f.streifenHand.push({ id: 'hand-2', p0: [0, 10], p1: [0, 17], breite: 4 })              // Herkunft nicht gespeichert
    expect(ortOhneUebergangText(f)).toBe('kein OSM-Übergang (Ort am Streifen von Hand)')
  })
  it('knotenLage: Lage und Tags aus der Overpass-Antwort, sonst null', () => {
    const roh = { elements: [{ type: 'way', id: 5, nodes: [5] }, { type: 'node', id: 7, lat: 46.9, lon: 7.4, tags: { highway: 'crossing', x: 3 } },
      { type: 'node', id: 8, lat: 46.91 }] }
    expect(knotenLage(roh, 7)).toEqual({ id: 7, lat: 46.9, lon: 7.4, tags: { highway: 'crossing' } })
    expect(knotenLage(roh, 5)).toBeNull()                                  // Weg, kein Knoten
    expect(knotenLage(roh, 8)).toBeNull()                                  // ohne Länge
    expect(knotenLage({ elements: [{ type: 'node', id: 9, lat: 1, lon: 2 }] }, 9)).toEqual({ id: 9, lat: 1, lon: 2, tags: {} })
    expect([knotenLage(null, 7), knotenLage({}, 7)]).toEqual([null, null])
  })
})

describe('Frei bis auch für abbiegende Zufahrten (29.10.2026)', () => {
  it('freie Länge entlang der Sichtpunkte: ohne Hindernis die geprüfte Länge, mit Parkfeld im Sichtfeld kürzer', () => {
    const f = (h: boolean) => fallMit(x => {
      x.streifen['12'] = { typ: 'ohne_vortritt' }
      if (h) x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-30, -3.8, -24, -2).slice(0, 4), quelle: 'hand' })
    })
    const abb = (h: boolean) => rechneFall(daten(), AV, [], 12, f(h), null).streifen[0].zufahrten.find(z => z.art === 'abbiegend')
    const ohne = abb(false)
    expect(ohne).toBeDefined()
    expect(ohne!.freiBisM).toBe(Math.floor((ohne!.geprueftBisM ?? ohne!.sichtweite) + 1e-6))
    const mit = abb(true)!
    expect(mit.status).not.toBe('frei')
    expect(mit.freiBisM!).toBeGreaterThan(0)
    expect(mit.freiBisM!).toBeLessThan(ohne!.freiBisM!)
  })
})

describe('Bedarf an der unmarkierten Querung und Längsparkierung ohne Vortritt (29.10.2026)', () => {
  const OHNE = { vorgabe: { bern: false, kantonBE: false } }
  it('Querungstyp: Annahme aus OSM (ohne Vortritt); Fussgängerstreifen gewählt: wie bisher gerechnet', () => {
    const f = fallMit(() => {})
    const r = rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, f, null)
    const [b] = befundblaetter(r, f, OHNE)
    expect(b.vorbelegt.werte.typ).toEqual({ wert: 'ohne_vortritt', quelle: 'annahme',
      text: 'unmarkierte Querung (OSM): als Querung ohne Vortritt angenommen (ohne bauliche Massnahme)' })
    const g = fallMit(x => { x.streifen['12'] = { typ: 'fgs' } })
    const [c] = befundblaetter(rechneFall(daten({}, { highway: 'crossing', crossing: 'unmarked' }), AV, [], 12, g, null), g, OHNE)
    expect(c.vorbelegt.werte.typ).toMatchObject({ wert: 'fgs', quelle: 'rechnung' })
  })
  it('Längsparkierung: ohne Vortritt genügen die bekannten Zufahrten; beim Fussgängerstreifen braucht es alle (unverändert)', () => {
    const lauf = (typ: 'ohne_vortritt' | undefined) => {
      const f = fallMit(x => { if (typ) x.streifen['12'] = { typ } })
      const r = rechneFall(daten(), AV, [], 12, f, null)
      const z = r.streifen[0].zufahrten.find(x => x.art !== 'abbiegend')!
      z.parkRechts = null
      return befundblaetter(r, f, OHNE)[0].vorbelegt.werte.laengsparkierung
    }
    expect(lauf(undefined)).toBeUndefined()
    expect(lauf('ohne_vortritt')).toEqual({ wert: false, quelle: 'rechnung', text: 'keine Parkierung rechts an den Zufahrten (an 1 von 2 Zufahrten bekannt)' })
  })
})

describe('Kurvenregel nur innerorts bei 50 km/h: Hinweis im Befundblatt (29.10.2026)', () => {
  it('«ja» zu den fünf Voraussetzungen bei 30 km/h: kurzer Hinweis; bei 50 km/h innerorts keiner', () => {
    const hw = (v: number) => {
      const f = fallMit(x => { x.bedarf = { felder: { innerorts: { wert: true, quelle: 'hand' }, vSig: { wert: v, quelle: 'hand' },
        'kurve.radius': { wert: 25, quelle: 'hand' }, 'kurve.fuenfBedingungen': { wert: true, quelle: 'hand' } } } })
      return befundblaetter(rechneFall(daten(), AV, [], 12, f, null), f, { vorgabe: { bern: false, kantonBE: false } })[0].hinweise
    }
    expect(hw(30)).toContain('Kurvenregel gilt nur innerorts bei 50 km/h: Sichtweite nach dem Tempo (VSS 40 241 Z. 14, S. 7)')
    expect(hw(50).some(h => h.startsWith('Kurvenregel'))).toBe(false)
  })
})
