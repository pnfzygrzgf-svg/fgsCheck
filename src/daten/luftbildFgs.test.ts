// Streifen aus dem Luftbild (ETH-Modell), nicht in OSM: Snapshot, Abgleich mit OSM, synthetischer Übergang durch die Rechnung,
// Fall-Datei mit Herkunft (künstliche Daten, keine echten Luftbilder im Repo)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wgs, lv95, dist, type P } from '../geo'
import { osmParsen, markierung, type OsmKnoten } from './osm'
import type { AvFlaeche } from './av'
import { bildAusPixeln } from '../rechner/luftbild'
import { rechneFall } from '../rechner'
import { leererFall, fallLesen, fallSchreiben, ohneUebergang, rechnungsSchluessel } from '../fall'
import { streifenTitel } from '../benennung'
import { querungen, vorbelegen } from '../bedarf/vorbelegung'
import {
  snapshotLesen, dateienImAusschnitt, ladeLuftbildFgs, luftbildFgsCacheLeeren, kandidatenAnzeigen, osmMitLuftbildUebergang, herkunftAus,
  kandidatKnoten, istLuftbildUebergang, herkunftLesen, ohneLuftbildUebergang, flugText, kandidatTooltip, LUFTBILD_UEBERGANG_TEXT, KEIN_STREIFEN_TEXT, OSM_NAH_M,
  WEG_MAX_M, type LuftbildKandidat, type LuftbildFgsSnapshot,
} from './luftbildFgs'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number) => { const [lat, lon] = wgs(O[0] + x, O[1] + y); return { lat, lon } }
const kennung = (p: P) => -((Math.round(p[0]) - 2_000_000) * 1_000_000 + (Math.round(p[1]) - 1_000_000))

function kand(x: number, y: number, richtung: number | null = 0, conf = 0.9): LuftbildKandidat {
  const p = lv(x, y)
  return { id: kennung(p), p, conf, jahre: [2024, 2026], richtung }
}
function snap(ks: LuftbildKandidat[], datei = 'luftbild_fgs_bern.json'): LuftbildFgsSnapshot {
  return { datei, quelle: '', flug: '', flugjahre: [2024, 2026], erzeugt: '2026-10-29', bildJeJahr: { 2024: 'SWISSIMAGE', 2026: 'Orthofoto Stadt Bern' },
    kandidaten: ks }
}
/** Ausschnitt ±m um den Ursprung (WGS84) */
function box(m: number) {
  const a = ll(-m, -m), b = ll(m, m)
  return { s: a.lat, w: a.lon, n: b.lat, e: b.lon }
}

// Overpass-Rohantwort: Hauptstrasse West–Ost (y = 0, 8 m breit in der AV), Querweg nach Süden bei x = -40, OSM-Übergang bei x = 60
function roh(extra: object[] = []) {
  const knoten = [[10, -200, 0], [11, -40, 0], [13, 200, 0]] as const
  return { elements: [
    { type: 'way', id: 1, tags: { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }, nodes: knoten.map(k => k[0]),
      geometry: knoten.map(k => ll(k[1], k[2])) },
    { type: 'way', id: 2, tags: { highway: 'residential', name: 'Querweg', maxspeed: '30' }, nodes: [11, 20],
      geometry: [ll(-40, 0), ll(-40, -200)] },
    { type: 'node', id: 50, ...ll(60, 0), tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' } },
    ...extra,
  ] }
}
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const AV: AvFlaeche[] = [
  { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-200, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200),
    lv(-37, -4), lv(200, -4), lv(200, 4), lv(-200, 4), lv(-200, -4)]] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 4, 200, 7)] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-36, -7, 200, -4)] },
]

/** Synthetisches Luftbild ±30 m um c: Fahrbahn West–Ost (|y| ≤ 4), mit bzw. ohne gelbe Balken (Takt 1 m, 4 m lang) bei x = 0 */
function bild(c: P, balken: boolean) {
  const RES = 0.1, HALB = 30, n = Math.round(2 * HALB / RES), px = new Uint8Array(n * n * 3)
  let s = 42
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
    const x = c[0] - O[0] - HALB + (q + 0.5) * RES, y = c[1] - O[1] + HALB - (r + 0.5) * RES
    let f = Math.abs(y) <= 4 ? [95, 95, 98] : [60, 110, 50]
    if (balken && Math.abs(y) <= 4) {
      const k = Math.round((y + 3.5) / 1.0), yk = -3.5 + k
      if (Math.abs(y - yk) <= 0.25 && Math.abs(x) <= 2 && yk <= 3.75) f = [225, 195, 45]
    }
    for (let ch = 0; ch < 3; ch++) px[(r * n + q) * 3 + ch] = Math.max(0, Math.min(255, f[ch] + (rnd() - 0.5) * 12))
  }
  return bildAusPixeln(px, n, n, [c[0] - HALB, c[1] - HALB, c[0] + HALB, c[1] + HALB], 3)
}

describe('Snapshot lesen und laden', () => {
  afterEach(() => { vi.unstubAllGlobals(); luftbildFgsCacheLeeren() })
  it('gültige Kandidaten bleiben, ungültige fallen weg', () => {
    const s = snapshotLesen('x.json', { quelle: 'Q', flug: 'F', flugjahre: [2024], erzeugt: '2026-10-29', bild_je_jahr: { 2024: 'SWISSIMAGE', x: 1 },
      kandidaten: [
        { id: -600000200000, p: [2600000, 1200000], conf: 0.91, jahre: [2024], richtung: 12 },
        { id: 5, p: [2600000, 1200000], conf: 0.9 },                       // positive Kennung: OSM, nicht Luftbild
        { id: -1, p: [7.4, 46.9], conf: 0.9 },                            // WGS84 statt LV95
        { id: -2, p: [2600000, 1200000], conf: 1.5 },
        { id: -3, p: [2600000, 1200000], conf: 0.6, richtung: 'Nord' },   // Richtung unlesbar: null
      ] })
    expect(s.kandidaten.map(k => k.id)).toEqual([-600000200000, -3])
    expect(s.kandidaten[1].richtung).toBeNull()
    expect(s.bildJeJahr).toEqual({ 2024: 'SWISSIMAGE' })
    expect(snapshotLesen('y.json', null).kandidaten).toEqual([])
  })
  it('Datei je Stadt nach dem Ausschnitt', () => {
    const bern = { s: 46.94, w: 7.44, n: 46.95, e: 7.45 }
    expect(dateienImAusschnitt(bern)).toEqual(['luftbild_fgs_bern.json'])
    expect(dateienImAusschnitt({ s: 47.37, w: 8.53, n: 47.38, e: 8.54 })).toEqual(['luftbild_fgs_zurich.json'])
    expect(dateienImAusschnitt({ s: 46.2, w: 6.1, n: 46.21, e: 6.11 })).toEqual([])          // Genf: kein Snapshot
  })
  it('einmal geladen je Datei, von der eigenen Seite; 404 bleibt leer gemerkt', async () => {
    const f = vi.fn(async (url: string) => (url.endsWith('bern.json') ? new Response(JSON.stringify({ kandidaten: [
      { id: -600000200000, p: [2600000, 1200000], conf: 0.8, jahre: [2024], richtung: null }] }), { status: 200 })
      : new Response('nicht da', { status: 404 })))
    vi.stubGlobal('fetch', f)
    const a = await ladeLuftbildFgs('luftbild_fgs_bern.json', '/')
    await ladeLuftbildFgs('luftbild_fgs_bern.json', '/')
    expect(a.kandidaten).toHaveLength(1)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe('/luftbild_fgs_bern.json')
    await expect(ladeLuftbildFgs('luftbild_fgs_basel.json', '/')).rejects.toThrow('HTTP 404')
    await expect(ladeLuftbildFgs('luftbild_fgs_basel.json', '/')).rejects.toThrow('HTTP 404')
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('Anzeige: abgesuchte Ausschnitte und Abgleich mit OSM (15 m)', () => {
  const osmBei = (x: number, y: number, id = 77): OsmKnoten => ({ id, ...ll(x, y), tags: { highway: 'crossing' } })
  it('nur in abgesuchten Ausschnitten', () => {
    const s = snap([kand(0, 0), kand(500, 0)])
    expect(kandidatenAnzeigen([s], [box(100)], []).map(k => k.p)).toEqual([lv(0, 0)])
    expect(kandidatenAnzeigen([s], [], [])).toEqual([])
    expect(kandidatenAnzeigen([s], [box(100), box(1000)], [])).toHaveLength(2)
  })
  it(`ausgeblendet mit OSM-Übergang bis ${OSM_NAH_M} m, sichtbar darüber`, () => {
    const s = snap([kand(0, 0)])
    expect(kandidatenAnzeigen([s], [box(100)], [osmBei(14.9, 0)])).toHaveLength(0)
    expect(kandidatenAnzeigen([s], [box(100)], [osmBei(15.2, 0)])).toHaveLength(1)
  })
  it('Abstand genau gemessen (Diagonale), synthetische Übergänge zählen nicht als OSM', () => {
    const s = snap([kand(0, 0)])
    expect(kandidatenAnzeigen([s], [box(100)], [osmBei(10, 10)])).toHaveLength(0)        // 14,14 m
    expect(kandidatenAnzeigen([s], [box(100)], [osmBei(11, 11)])).toHaveLength(1)        // 15,56 m
    expect(kandidatenAnzeigen([s], [box(100)], [osmBei(1, 0, -5)])).toHaveLength(1)
  })
  it('Tooltip mit Luftbild je Flugjahr und Sicherheit; doppelte Kandidaten (zwei Snapshots) nur einmal', () => {
    const k = kandidatenAnzeigen([snap([kand(0, 0)]), snap([kand(0, 0)], 'b.json')], [box(100)], [])
    expect(k).toHaveLength(1)
    expect(k[0].flug).toBe('SWISSIMAGE 2024 und Orthofoto Stadt Bern 2026')
    expect(kandidatTooltip(k[0])).toBe('Fussgängerstreifen im Luftbild erkannt (ETH-Modell, SWISSIMAGE 2024 und Orthofoto Stadt Bern 2026), ' +
      'nicht in OSM – bitte prüfen. Sicherheit des Modells 0,90')
    expect(flugText([2025])).toBe('Luftbild 2025')
  })
})

describe('Synthetischer Übergang in der OSM-Antwort', () => {
  it('Knoten mit Tags, Fussweg entlang der Richtung; zweimal eingefügt bleibt einmal', () => {
    const k = kand(0, 1, 30), h = herkunftAus(k)
    const r = osmMitLuftbildUebergang(roh(), k.id, h)
    const osm = osmParsen(r as Parameters<typeof osmParsen>[0])
    const u = osm.uebergaenge.find(x => x.id === k.id)!
    expect(istLuftbildUebergang(u.tags)).toBe(true)
    expect(markierung(u.tags)).toBe('markiert')
    const fw = osm.querungen.find(w => w.knoten.includes(k.id))!
    expect(fw.tags).toEqual({ highway: 'footway', source: 'luftbild_eth' })
    const [a, b] = [fw.geom[0], fw.geom[2]].map(([la, lo]) => lv95(la, lo))
    expect(Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI).toBeCloseTo(30, 1)
    expect(dist(a, b)).toBeCloseTo(16, 1)
    expect(osmMitLuftbildUebergang(r, k.id, h)).toBe(r)
    expect(osmParsen(osmMitLuftbildUebergang(roh(), k.id, { ...h, richtung: null }) as Parameters<typeof osmParsen>[0]).querungen).toEqual([])
    expect(kandidatKnoten(k.id, h).tags.source).toBe('luftbild_eth')
  })
  it(`weiter als ${WEG_MAX_M} m von der Strasse: auf ${WEG_MAX_M} m herangerückt (quer zur Strasse)`, () => {
    const k = kand(5, 5.8, null)
    const osm = osmParsen(osmMitLuftbildUebergang(roh(), k.id, herkunftAus(k)) as Parameters<typeof osmParsen>[0])
    const u = osm.uebergaenge.find(x => x.id === k.id)!
    const { lat, lon } = ll(5, WEG_MAX_M)
    expect(dist([u.lat * 1e5, u.lon * 1e5], [lat * 1e5, lon * 1e5])).toBeLessThan(0.01)
  })
})

describe('Rechnung am Übergang aus dem Luftbild', () => {
  const rechnen = (k: LuftbildKandidat, b: ReturnType<typeof bild> | null = null) => {
    const osm = osmParsen(osmMitLuftbildUebergang(roh(), k.id, herkunftAus(k)) as Parameters<typeof osmParsen>[0])
    const f = leererFall(ll(0, 1).lat, ll(0, 1).lon, k.id)
    f.ort.herkunft = herkunftAus(k)
    return rechneFall(osm, AV, [], k.id, f, null, b)
  }
  it('Streifen aus OSM + AV quer über die Fahrbahn, Hinweis zur Herkunft (ohne Luftbild: noch nicht geprüft)', () => {
    const r = rechnen(kand(0, 1, 0))
    expect(r.streifen).toHaveLength(1)
    const s = r.streifen[0]
    expect(Math.abs(s.p0[0] - O[0])).toBeLessThan(0.01)
    expect(Math.abs(s.p1[1] - s.p0[1])).toBeGreaterThan(7)
    expect(s.zufahrten.length).toBeGreaterThan(0)
    expect(r.streifenQuelle).toBe('osm')
    expect(r.hinweis).toContain(LUFTBILD_UEBERGANG_TEXT)
    expect(r.hinweis).toContain('Im Luftbild noch nicht geprüft')
    expect(s.luftbildUebergang).toBe(r.hinweis)
    expect(r.luftbildUebergang).toEqual({ bestaetigt: false })
    expect(s.markierungHinweis).toBeUndefined()
    expect(streifenTitel(s.fgsId)).toBe('Streifen Luftbild')
  })
  it('Richtung des Modells: schräge Achse bis 45°, sonst senkrecht zur Strasse', () => {
    const schraeg = rechnen(kand(0, 1, 20)).streifen[0]
    const w = Math.atan2(schraeg.p1[0] - schraeg.p0[0], schraeg.p1[1] - schraeg.p0[1]) * 180 / Math.PI
    expect(Math.abs(((w + 360) % 180) - 20)).toBeLessThan(0.5)
    const laengs = rechnen(kand(0, 1, 90)).streifen[0]
    expect(Math.abs(laengs.p1[0] - laengs.p0[0])).toBeLessThan(0.01)
  })
  it('Luftbild ohne Balken: «im Luftbild kein Streifen bestätigt», Streifen aus OSM + AV, unsicher', () => {
    const k = kand(0, 1, 0)
    const r = rechnen(k, bild(k.p, false))
    expect(r.luftbild?.befund).toBe('nicht_gefunden')
    expect(r.hinweis).toContain(KEIN_STREIFEN_TEXT.slice(1))
    expect(r.streifen[0].luftbildUebergang).toContain('bitte prüfen')
    expect(r.luftbildUebergang).toEqual({ bestaetigt: false })
  })
  it('Luftbild mit Balken: Streifen aus dem Luftbild, bestätigt', () => {
    const k = kand(0, 1, 0)
    const r = rechnen(k, bild(k.p, true))
    expect(r.luftbild?.befund).toBe('erkannt')
    expect(r.streifenQuelle).toBe('luftbild')
    expect(r.hinweis).toContain('Im Luftbild Streifen erkannt')
    expect(r.luftbildUebergang).toEqual({ bestaetigt: true })
  })
  it('OSM-Übergang: unverändert ohne Herkunftsfelder', () => {
    const osm = osmParsen(osmMitLuftbildUebergang(roh(), kand(0, 1).id, herkunftAus(kand(0, 1))) as Parameters<typeof osmParsen>[0])
    const r = rechneFall(osm, AV, [], 50, leererFall(ll(60, 0).lat, ll(60, 0).lon, 50), null)
    expect(r.streifen).toHaveLength(1)
    expect('luftbildUebergang' in r).toBe(false)
    expect('luftbildUebergang' in r.streifen[0]).toBe(false)
    expect(r.hinweis).toBe('')
  })
})

describe('Fall-Datei mit Herkunft', () => {
  it('Hin und zurück mit Herkunft, Version bleibt 1', () => {
    const k = kand(0, 1, 30), f = leererFall(ll(0, 1).lat, ll(0, 1).lon, k.id)
    f.ort.herkunft = herkunftAus(k)
    const text = fallSchreiben(f)
    expect(JSON.parse(text).version).toBe(1)
    const [g, hinweise] = fallLesen(text)
    expect(hinweise).toEqual([])
    expect(g.ort.uebergang).toBe(k.id)
    expect(g.ort.herkunft).toEqual(f.ort.herkunft)
    expect(rechnungsSchluessel(g)).toBe(rechnungsSchluessel(f))
    expect(ohneUebergang(g).ort.herkunft).toBeUndefined()
  })
  it('alter Fall ohne Herkunft unverändert', () => {
    const alt = { app: 'fgsCheck', version: 1, ort: { lat: 46.95, lon: 7.44, uebergang: 123, markierung: 'markiert' }, quellen: {},
      streifenHand: [], hindernisse: [], zufahrten: {}, streifen: {}, vorschlaege: {}, baumkataster: false }
    const [f, hinweise] = fallLesen(JSON.stringify(alt))
    expect(hinweise).toEqual([])
    expect(f.ort).toEqual({ lat: 46.95, lon: 7.44, uebergang: 123, markierung: 'markiert' })
    const neu = JSON.parse(fallSchreiben(f))
    expect('herkunft' in neu.ort).toBe(false)
    expect(neu.version).toBe(1)
  })
  it('Herkunft ungültig bzw. an einem OSM-Übergang: übergangen mit Hinweis', () => {
    const k = kand(0, 1)
    const basis = { app: 'fgsCheck', version: 1, quellen: {}, streifenHand: [], hindernisse: [], zufahrten: {}, streifen: {}, vorschlaege: {} }
    const [a, ha] = fallLesen(JSON.stringify({ ...basis, ort: { lat: 46.95, lon: 7.44, uebergang: 123, herkunft: herkunftAus(k) } }))
    expect(a.ort.herkunft).toBeUndefined()
    expect(ha).toHaveLength(1)
    const [b, hb] = fallLesen(JSON.stringify({ ...basis, ort: { lat: 46.95, lon: 7.44, uebergang: k.id, herkunft: { art: 'luftbild_eth', p: [1, 2] } } }))
    expect(b.ort.herkunft).toBeUndefined()
    expect(hb).toHaveLength(1)
    expect(herkunftLesen({ art: 'anders', p: k.p, conf: 0.5, jahre: [] })).toBeNull()
  })
})

describe('Bedarf: der Übergang aus dem Luftbild ist kein OSM-Beleg', () => {
  // Hauptstrasse mit einem echten OSM-Fussgängerstreifen 60 m östlich (Knoten 50 auf dem Weg)
  const rohMit = () => {
    const kn = [[10, -300, 0], [50, 60, 0], [13, 300, 0]] as const
    return { elements: [
      { type: 'way', id: 1, tags: { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }, nodes: kn.map(k => k[0]), geometry: kn.map(k => ll(k[1], k[2])) },
      { type: 'node', id: 50, ...ll(60, 0), tags: { highway: 'crossing', crossing: 'marked' } },
    ] }
  }
  const AV2: AvFlaeche[] = [
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [rechteck(-300, -4, 300, 4)] },
    { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [rechteck(-300, 4, 300, 7)] },
    { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [rechteck(-300, -7, 300, -4)] },
  ]
  it('ohneLuftbildUebergang: Knoten und Fussweg weg, sonst dasselbe Objekt', () => {
    const k = kand(0, 1, 0)
    const mit = osmParsen(osmMitLuftbildUebergang(rohMit(), k.id, herkunftAus(k)) as Parameters<typeof osmParsen>[0])
    const ohne = ohneLuftbildUebergang(mit)
    expect(ohne.uebergaenge.map(u => u.id)).toEqual([50])
    expect(ohne.querungen).toEqual([])
    const osm = osmParsen(rohMit() as unknown as Parameters<typeof osmParsen>[0])
    expect(ohneLuftbildUebergang(osm)).toBe(osm)
  })
  it('Neuanlage und Querungstyp mit Quelle Luftbild, Abstand zum nächsten Streifen nur zu OSM-Übergängen, nie die eigene Kennung', () => {
    const k = kand(0, 1, 0)
    const osm = osmParsen(osmMitLuftbildUebergang(rohMit(), k.id, herkunftAus(k)) as Parameters<typeof osmParsen>[0])
    const f = leererFall(ll(0, 1).lat, ll(0, 1).lon, k.id)
    f.ort.herkunft = herkunftAus(k)
    f.ort.markierung = 'markiert'
    const r = rechneFall(osm, AV2, [], k.id, f, null)
    expect(r.streifen).toHaveLength(1)
    const v = vorbelegen(querungen(r.streifen)[0], f, [], { osm, av: AV2, ladeort: lv(0, 0), osmRadiusM: 300 })
    expect(v.werte.neuanlage).toMatchObject({ wert: false, quelle: 'luftbild' })
    expect(v.werte.neuanlage.text).toContain(LUFTBILD_UEBERGANG_TEXT)
    expect(v.werte.typ).toMatchObject({ wert: 'fgs', quelle: 'luftbild' })
    expect(v.werte.typ.text).toContain('ETH-Modell')
    expect(v.werte.abstandFgsM).toMatchObject({ wert: 60, quelle: 'osm' })
    expect(JSON.stringify(v)).not.toContain(String(k.id))
    // derselbe Ort als OSM-Übergang (Knoten 12 auf dem Weg): Quellen wie bisher OSM bzw. Sichtrechner
    const roh2 = rohMit()
    roh2.elements[0].nodes = [10, 12, 50, 13] as never
    ;(roh2.elements[0] as { geometry: unknown[] }).geometry = [ll(-300, 0), ll(0, 0), ll(60, 0), ll(300, 0)]
    roh2.elements.push({ type: 'node', id: 12, ...ll(0, 0), tags: { highway: 'crossing', crossing: 'marked' } } as never)
    const osm2 = osmParsen(roh2 as unknown as Parameters<typeof osmParsen>[0])
    const f2 = leererFall(ll(0, 0).lat, ll(0, 0).lon, 12)
    f2.ort.markierung = 'markiert'
    const r2 = rechneFall(osm2, AV2, [], 12, f2, null)
    const v2 = vorbelegen(querungen(r2.streifen)[0], f2, [], { osm: osm2, av: AV2, ladeort: lv(0, 0), osmRadiusM: 300 })
    expect(v2.werte.neuanlage).toMatchObject({ wert: false, quelle: 'osm' })
    expect(v2.werte.typ).toMatchObject({ wert: 'fgs', quelle: 'rechnung' })
  })
})
