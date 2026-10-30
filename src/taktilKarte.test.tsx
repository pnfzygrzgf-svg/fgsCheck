// Tests 30.10.2026: Ebene «Taktile Markierungen (Stadt Bern)» aus dem REST-Dienst (daten/taktilKarte.ts; Abfragen mit Mock, map.bern.ch
// antwortet ausserhalb des Browsers nicht), die von der Vorbelegung genutzten Objekte (taktilGenutzt.ts über automatikC.taktilTreffer)
// und die unveränderte Vorbelegung von «taktil» und «leitlinie» (Wortlaut wie vor der Herauslösung von taktilTreffer).
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import type { Bereich } from './daten/haltestellen'
import type { TaktilDaten, TvmFeld, TvmLinie } from './daten/taktil'
import { rechneFall } from './rechner/index'
import { leererFall } from './fall'
import { querungen, vorbelegen, type GeoVorbelegung } from './bedarf/vorbelegung'
import { AUTO_C, taktilTreffer } from './bedarf/automatikC'
import { taktilGenutzt } from './taktilGenutzt'
import { TK_KARTE_LAYER, TK_KARTE_NAME, TK_KARTE_ZOOM, TK_LEGENDE, TK_NAME, TK_RAND, TK_WEISS, tkAusVorbelegung, tkFeldHtml, tkKarteUrl,
  tkLaden, tkObjekte, tkStil, tkTooltip, tkTreffer, tkVerfuegbar, type TkCache } from './daten/taktilKarte'
import { RP_FARBE, type Box } from './daten/richtplanKarte'
import type { ArcgisGeoJson } from './daten/geoportal'
import { quelle, datenschutzGruppen } from './daten/quellenregister'
import { TaktilLegende } from './TaktilLegende'

// Künstliche Strasse wie automatikC.test.ts: Hauptstrasse West–Ost (y = 0), Fahrbahn 8 m, Übergang bei x = 0 (Streifen Nord–Süd)
const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, kn: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: kn.map(k => k[0]), geom: kn.map(k => ll(k[1], k[2])) })
const knoten = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: ll(x, y)[0], lon: ll(x, y)[1] })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = () => leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
const g = querungen(rechneFall(OSM, AV, [], 12, fallMit(), null).streifen)[0]
const s = g.streifen[0]
const BQ: Bereich = { mitte: O, radiusM: 150, form: 'quadrat' }
const u: P = [(s.p1[0] - s.p0[0]) / Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]), (s.p1[1] - s.p0[1]) / Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1])]
const hinter = (d: number): P => [s.p1[0] + u[0] * d, s.p1[1] + u[1] * d]

const feld = (id: string, p: P, art = 1001, baujahr: number | null = null): TvmFeld =>
  ({ id, art, text: art === 1001 ? 'Aufmerksamkeitsfeld' : art === 1002 ? 'Blindenquadrat' : 'Anschluss andere', p, baujahr })
const linie = (id: string, art: number, x: number): TvmLinie => ({ id, art, text: art === 1003 ? 'Leitlinie auf dem Fussgängerstreifen' : 'Leitlinie',
  teile: [[lv(x, -6), lv(x, 6)]], baujahr: null, aufStreifen: art === 1003 })
const TK = (felder: TvmFeld[] | null, linien: TvmLinie[] | null = [], bereich = BQ): TaktilDaten & { bereich: Bereich } => ({ felder, linien, bereich })
const vor = (taktil: GeoVorbelegung['taktil']) => vorbelegen(g, fallMit(), [], { taktil })

describe('Vorbelegung «taktil» und «leitlinie» unverändert (taktilTreffer herausgelöst)', () => {
  it('Feld bis 3 m vom Streifenende bzw. Leitlinie auf dem Streifen: Wert, Quelle und Text wie bisher', () => {
    const v = vor(TK([feld('a', hinter(2.94)), feld('b', hinter(1.2), 1099)], [linie('l1', 1001, 0), linie('l2', 1003, 0.3)]))
    expect(v.werte.taktil).toEqual({ wert: true, quelle: 'geoportal',
      text: 'Aufmerksamkeitsfeld 2,9 m vom Streifenende (Geoportal Stadt Bern, taktil-visuelle Markierungen)' })
    expect(v.werte.leitlinie).toEqual({ wert: true, quelle: 'geoportal',
      text: 'Leitlinie auf dem Fussgängerstreifen (Geoportal Stadt Bern, taktil-visuelle Markierungen)' })
    // Feld ohne Text: «Feld»
    expect(vor(TK([{ ...feld('a', hinter(1)), text: '' }])).werte.taktil.text).toBe('Feld 1,0 m vom Streifenende (Geoportal Stadt Bern, ' +
      'taktil-visuelle Markierungen)')
  })
  it('nichts in der Nähe: nein als Annahme mit dem bisherigen Wortlaut; Ausfall bzw. fehlender Layer: Hinweis wie bisher', () => {
    const v = vor(TK([feld('a', hinter(3.1))], [linie('l', 1003, 30)]))
    expect(v.werte.taktil).toEqual({ wert: false, quelle: 'annahme', text: 'kein taktiles Aufmerksamkeitsfeld laut Geoportal Stadt Bern ' +
      'innert 3 m der Streifenenden (Inventar möglicherweise unvollständig)' })
    expect(v.werte.leitlinie).toEqual({ wert: false, quelle: 'annahme', text: 'keine Leitlinie auf dem Streifen laut Geoportal Stadt Bern ' +
      '(Inventar möglicherweise unvollständig)' })
    expect(vor({ fehler: 'HTTP 503' }).feldHinweise!.taktil).toBe('Taktil-visuelle Markierungen (Geoportal Stadt Bern) nicht erreichbar (HTTP 503)')
    const ohne = vor({ ...TK(null, null), hinweis: 'Taktile Felder nicht erreichbar' })
    expect([ohne.werte.taktil, ohne.werte.leitlinie]).toEqual([undefined, undefined])
    expect(ohne.feldHinweise!.taktil).toBe('Taktile Felder (Geoportal Stadt Bern) nicht erreichbar (Taktile Felder nicht erreichbar)')
    // Ausschnitt deckt die Streifenenden nicht: nichts gesetzt, kein Hinweis
    const weit = vor(TK([feld('a', hinter(1))], [linie('l', 1003, 0)], { mitte: lv(400, 0), radiusM: 150, form: 'quadrat' }))
    expect([weit.werte.taktil, weit.werte.leitlinie, weit.feldHinweise?.taktil]).toEqual([undefined, undefined, undefined])
  })
  it('taktilTreffer: nächstes Feld der Querungscodes mit Abstand, Leitlinie 1003; fehlender Schlüssel = nicht geprüft', () => {
    const r = taktilTreffer(g.streifen, TK([feld('weit', hinter(2.5)), feld('nah', hinter(0.8), 1002), feld('anders', hinter(0.1), 1099)],
      [linie('l1', 1001, 0), linie('l2', 1003, 0)]))
    expect(r.feld?.z.id).toBe('nah')
    expect(r.feld?.d).toBeCloseTo(0.8, 6)
    expect(r.linie?.id).toBe('l2')
    expect(taktilTreffer(g.streifen, TK([feld('x', hinter(3.2))], []))).toEqual({ feld: null, linie: null })
    expect(taktilTreffer(g.streifen, TK(null, null))).toEqual({})
  })
})

describe('taktilGenutzt: die für die Prüfung genutzten Objekte', () => {
  it('Kennungen des Felds und der Leitlinie, die «ja» setzen; sonst null', () => {
    const t = TK([feld('berntvmf:1', hinter(2)), feld('berntvmf:2', hinter(10))], [linie('berntvml:7', 1003, 0), linie('berntvml:8', 1001, 0)])
    const k = taktilGenutzt(t, [g.streifen])!
    expect(k.felder.map(f => f.id)).toEqual(['berntvmf:1'])
    expect(k.linien.map(l => l.id)).toEqual(['berntvml:7'])
    // gleiche Kennungen wie die Werte der Vorbelegung (die Ebene hebt genau diese hervor)
    expect(vor(t).werte.taktil.wert).toBe(true)
    expect(vor(t).werte.leitlinie.wert).toBe(true)
    expect(taktilGenutzt(TK([feld('f', hinter(5))], [linie('l', 1001, 0)]), [g.streifen])).toBeNull()
    expect(taktilGenutzt({ fehler: 'HTTP 503' }, [g.streifen])).toBeNull()
    expect(taktilGenutzt(null, [g.streifen])).toBeNull()
    expect(taktilGenutzt(t, [])).toBeNull()
    expect(taktilGenutzt(t, [[]])).toBeNull()
    // Ausschnitt deckt die Querung nicht (wie die Vorbelegung): nichts
    expect(taktilGenutzt(TK(t.felder, t.linien, { mitte: lv(400, 0), radiusM: 150, form: 'quadrat' }), [g.streifen])).toBeNull()
    // zwei Querungen mit demselben Feld: einmal
    expect(taktilGenutzt(t, [g.streifen, g.streifen])!.felder).toHaveLength(1)
  })
})

// ── Ebene «Taktile Markierungen (Stadt Bern)» (daten/taktilKarte.ts) ──
const punktGj = (id: number, art: number | null, p: P, baujahr: unknown = null, beschrieb: string | null = null) => ({ type: 'Feature',
  properties: { Objectid: id, Art: art, Art_beschrieb: beschrieb, Baujahr: baujahr }, geometry: { type: 'Point', coordinates: p } })
const linieGj = (id: number, art: number, pts: P[], baujahr: unknown = null) => ({ type: 'Feature',
  properties: { Objectid: id, Art: art, Baujahr: baujahr }, geometry: { type: 'LineString', coordinates: pts } })
const gj = (features: unknown[], extra: object = {}) =>
  ({ type: 'FeatureCollection', crs: { properties: { name: 'EPSG:2056' } }, features, ...extra }) as ArcgisGeoJson
/** Antworten je REST-Layer (Mock statt map.bern.ch); zählt die Abfragen */
function mock(antworten: Record<number, unknown>, fehler: number[] = []) {
  const urls: string[] = []
  const holen = async (url: string) => {
    urls.push(url)
    const n = Number(/MapServer\/(\d+)\/query/.exec(url)![1])
    if (fehler.includes(n)) throw new Error('HTTP 500')
    return { daten: antworten[n] ?? gj([]), ms: 1, bytes: 1 } as never
  }
  return { holen, urls }
}
const ALLE = {
  1: gj([punktGj(11, 1001, lv(0, 6), 2015), punktGj(12, 1002, lv(20, 6)), punktGj(13, 1077, lv(40, 6), 1850, 'Sonderfeld'),
    { type: 'Feature', properties: { Objectid: 14, Art: 1001 }, geometry: null }]),
  2: gj([linieGj(21, 1003, [lv(0, -4), lv(0, 4)], 2019), linieGj(22, 1002, [lv(-30, 5), lv(30, 5)])]),
}
const BOX: Box = [O[0] - 500, O[1] - 500, O[0] + 500, O[1] + 500]

describe('Ebene «Taktile Markierungen (Stadt Bern)»: Verfügbarkeit, Einlesen, Abfragen', () => {
  it('nur in der Ebenenwahl, solange der Ausschnitt die Stadt Bern berührt (wie der Richtplan)', () => {
    expect(tkVerfuegbar({ s: 46.945, w: 7.43, n: 46.952, e: 7.45 })).toBe(true)
    expect(tkVerfuegbar({ s: 47.37, w: 8.53, n: 47.38, e: 8.55 })).toBe(false)
  })
  it('Layer 1 (Felder) und 2 (Linien), Rechteck in LV95, GeoJSON; gleiche Kennungen und Texte wie die Vorbelegung', () => {
    expect(TK_KARTE_LAYER.map(l => [l.layer, l.art])).toEqual([[1, 'feld'], [2, 'linie']])
    const url = tkKarteUrl(2, [2600000, 1199000, 2601000, 1200000])
    expect(url).toContain('map.bern.ch/arcgis/rest/services/Geoportal/Taktil_visuelle_Markierungen/MapServer/2/query?')
    expect(url).toContain('geometry=2600000%2C1199000%2C2601000%2C1200000')
    expect(url).toContain('outFields=Objectid%2CArt%2CArt_beschrieb%2CBaujahr')
    expect(url).toContain('f=geojson')
    const f = tkObjekte(TK_KARTE_LAYER[0], ALLE[1])
    expect(f.map(o => [o.id, o.art, o.text, o.baujahr])).toEqual([['berntvmf:11', 'feld', 'Aufmerksamkeitsfeld', 2015],
      ['berntvmf:12', 'feld', 'Blindenquadrat', null], ['berntvmf:13', 'feld', 'Sonderfeld', null]])        // Baujahr 1850 unplausibel
    expect(f[0].geom).toEqual([[lv(0, 6)]])
    const l = tkObjekte(TK_KARTE_LAYER[1], ALLE[2])
    expect(l.map(o => [o.id, o.art, o.text, o.baujahr])).toEqual([['berntvml:21', 'linie', 'Leitlinie auf dem Fussgängerstreifen', 2019],
      ['berntvml:22', 'linie', 'Sicherheitslinie', null]])
    expect(l[1].box).toEqual([O[0] - 30, O[1] + 5, O[0] + 30, O[1] + 5])
  })
  it('laden: je Layer eine Abfrage; danach aus dem Zwischenspeicher; ein Fehler betrifft nur seinen Layer', async () => {
    const cache: TkCache = new Map(), m = mock(ALLE, [2])
    const r = await tkLaden(BOX, cache, null, undefined, m.holen)
    expect(m.urls.length).toBe(2)
    expect(r.fehler).toEqual(['linie'])
    expect(r.zuViel).toEqual([])
    expect(r.objekte.feld.map(o => o.id)).toEqual(['berntvmf:11', 'berntvmf:12', 'berntvmf:13'])
    expect(r.objekte.linie).toEqual([])
    const ok = mock(ALLE)
    const r2 = await tkLaden([O[0] - 100, O[1] - 100, O[0] + 100, O[1] + 100], cache, null, undefined, ok.holen)
    expect(ok.urls.map(x => Number(/MapServer\/(\d+)/.exec(x)![1]))).toEqual([2])           // nur der fehlgeschlagene Layer neu
    expect(r2.objekte.linie.map(o => o.id)).toEqual(['berntvml:21', 'berntvml:22'])
    expect(r2.geladen).toBe(1)
  })
  it('gekappte Antwort (Übertragungsgrenze): Layer als «zu viele Objekte», nicht gespeichert', async () => {
    const cache: TkCache = new Map()
    const r = await tkLaden(BOX, cache, null, undefined, mock({ ...ALLE, 1: gj([], { exceededTransferLimit: true }) }).holen)
    expect(r.zuViel).toEqual(['feld'])
    expect(r.fehler).toEqual([])
    expect(r.objekte.feld).toEqual([])
    expect(cache.has('feld')).toBe(false)
    expect(cache.get('linie')?.length).toBe(1)
    const r2 = await tkLaden(BOX, cache, null, undefined, mock({ ...ALLE, 1: gj([], { properties: { exceededTransferLimit: true } }) }).holen)
    expect(r2.zuViel).toEqual(['feld'])
  })
  it('Daten der Vorbelegung decken den Ausschnitt: keine Abfrage; ein nicht erreichter Layer der Vorbelegung wird geladen', async () => {
    const m = mock(ALLE)
    const d: TaktilDaten = { felder: [feld('berntvmf:11', lv(0, 6))], linien: null }
    const vorh = { box: [O[0] - 150, O[1] - 150, O[0] + 150, O[1] + 150] as Box, objekte: tkAusVorbelegung(d) }
    expect(Object.keys(vorh.objekte)).toEqual(['feld'])
    const r = await tkLaden([O[0] - 100, O[1] - 100, O[0] + 100, O[1] + 100], new Map(), vorh, undefined, m.holen)
    expect(m.urls.map(x => Number(/MapServer\/(\d+)/.exec(x)![1]))).toEqual([2])
    expect(r.objekte.feld.map(o => o.id)).toEqual(['berntvmf:11'])
    await tkLaden(BOX, new Map(), vorh, undefined, m.holen)
    expect(m.urls.length).toBe(3)
  })
  it('Abbruch bricht das Laden ab (kein Eintrag im Zwischenspeicher)', async () => {
    const ctrl = new AbortController(), cache: TkCache = new Map()
    const holen = async () => { ctrl.abort(); throw new DOMException('abgebrochen', 'AbortError') }
    await expect(tkLaden([0, 0, 1, 1], cache, null, ctrl.signal, holen)).rejects.toBeDefined()
    expect(cache.size).toBe(0)
  })
})

describe('Ebene «Taktile Markierungen»: Darstellung, Tooltip, Treffer, Zoomgrenze, Legende', () => {
  it('Stil: weiss mit dunklem Rand wie die Markierung; Feld als Quadrat, Linie mit Kontur; genutzt grösser und kräftiger', () => {
    const f = tkStil('feld'), fg = tkStil('feld', true), l = tkStil('linie'), lg = tkStil('linie', true)
    expect([f.fuellung, f.randFarbe]).toEqual([TK_WEISS, TK_RAND])
    expect(f).toMatchObject({ groesse: 7, rand: 1.5 })
    expect(fg.groesse).toBeGreaterThan(f.groesse)
    expect(fg.rand).toBeGreaterThan(f.rand)
    expect(l).toMatchObject({ groesse: 2, kontur: 5 })
    expect(lg.kontur).toBeGreaterThan(l.kontur)
    expect(lg.opacity).toBe(1)
    expect(tkFeldHtml(f)).toContain('background:#ffffff;border:1.5px solid #111827')
    // nicht verwechselbar mit Richtplan, Fahrzeugen, Velo-Kegeln, Motorrad-Parkfeld
    for (const c of [RP_FARBE, '#4b5563', '#b45309', '#2563eb', '#7c3aed', '#0d9488', '#ea580c', '#ec4899'])
      expect([TK_WEISS, TK_RAND]).not.toContain(c)
  })
  it('Tooltip: Art, Baujahr, Vermerk des genutzten Objekts; Herkunft', () => {
    expect(tkTooltip({ art: 'feld', text: 'Aufmerksamkeitsfeld', baujahr: 2015 })).toEqual({ titel: 'Aufmerksamkeitsfeld, Baujahr 2015',
      quelle: 'Taktil-visuelle Markierungen, Geoportal Stadt Bern' })
    expect(tkTooltip({ art: 'linie', text: 'Leitlinie auf dem Fussgängerstreifen', baujahr: null }, true).titel)
      .toBe('Leitlinie auf dem Fussgängerstreifen – für die Prüfung genutzt')
    expect(tkTooltip({ art: 'feld', text: 'Blindenquadrat', baujahr: 2001 }, true).titel).toBe('Blindenquadrat, Baujahr 2001 – für die Prüfung genutzt')
    expect(tkTooltip({ art: 'feld', text: '', baujahr: null }).titel).toBe('Taktiles Feld')
    expect(tkTooltip({ art: 'linie', text: '', baujahr: null }).titel).toBe('Taktile Linie')
  })
  it('Treffer: Feld bis zur Toleranz vor der Linie, sonst die nächste Linie, sonst nichts', () => {
    const alle = [...tkObjekte(TK_KARTE_LAYER[0], ALLE[1]), ...tkObjekte(TK_KARTE_LAYER[1], ALLE[2])]
    expect(tkTreffer(alle, lv(0.5, 5.5), 1.5)?.id).toBe('berntvmf:11')           // Feld über der Sicherheitslinie (y = 5)
    expect(tkTreffer(alle, lv(10, 5.4), 1.5)?.id).toBe('berntvml:22')            // nur die Linie
    expect(tkTreffer(alle, lv(0.4, 0), 1.5)?.id).toBe('berntvml:21')             // Leitlinie auf dem Streifen
    expect(tkTreffer(alle, lv(100, 100), 1.5)).toBeNull()
  })
  it('Zoomgrenze 15: Legende «erst ab Zoomstufe 15»; Quellenregister mit Name, Zoomstufe und zwei Abfragen', () => {
    expect(TK_KARTE_ZOOM).toBe(15)
    const q = quelle('bern.taktilKarte')!
    expect(q).toMatchObject({ themen: [], empfaenger: 'bern', datenschutzSatz: true, module: ['daten/taktilKarte.ts'] })
    expect(q.datenschutz).toContain(`«${TK_KARTE_NAME}»`)
    expect(q.datenschutz).toContain(`ab Zoomstufe ${TK_KARTE_ZOOM}`)
    expect(q.datenschutz).toContain('je Layer eine Abfrage, zwei Layer')
    expect(q.hinweis).toContain(`ab Zoomstufe ${TK_KARTE_ZOOM}`)
    expect(TK_KARTE_LAYER).toHaveLength(2)
    expect(datenschutzGruppen().gruppen.find(x => x.name.startsWith('map.bern.ch'))!.text).toContain(q.datenschutz)
  })
  it('Legende: eigene Marken (Feld, Linie, genutzt), Stand (Zoomstufe, lädt, Fehler, zu viele Objekte)', () => {
    const html = (stand: Parameters<typeof TaktilLegende>[0]['stand'], genutzt = false) =>
      renderToStaticMarkup(<ul><TaktilLegende stand={stand} genutzt={genutzt} taktilM={AUTO_C.taktilM} /></ul>)
    const leer = { an: true as const, zoom: true, laedt: false, fehler: [], zuViel: [] }
    const h = html(leer, true)
    expect(h).toContain(TK_KARTE_NAME)
    for (const a of TK_LEGENDE) expect(h).toContain(TK_NAME[a])
    expect((h.match(/class="rp-marke tk-marke"/g) ?? []).length).toBe(TK_LEGENDE.length + 2)
    expect(h).toContain('die die Prüfung nutzt (Feld bis 3 m vom Streifenende, Leitlinie auf dem Streifen)')
    expect(h).toContain('<rect')
    expect(html(leer)).not.toContain('die Prüfung nutzt')
    expect(html({ ...leer, zoom: false })).toContain('erst ab Zoomstufe 15')
    expect(html({ ...leer, laedt: true })).toContain('lädt …')
    expect(html({ ...leer, fehler: ['linie'] })).toContain('nicht erreichbar: Taktile Linien')
    expect(html({ ...leer, zuViel: ['feld'] })).toContain('zu viele Objekte im Ausschnitt (näher heranzoomen): Taktile Felder')
  })
})
