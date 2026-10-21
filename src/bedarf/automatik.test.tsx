// Tests Automatik Paket A + B (21.10.2026): Vorbelegung aus vorhandenen Daten, Wert im Feld, Zustand «rechner», Handangabe «offen».
// Künstliche Strassen wie befundblatt.test.ts (keine echten Daten): Hauptstrasse West–Ost, Fahrbahn 8 m, Tempo 50, Übergang bei
// x = 0; je Ableitung beide Seiten der Schwelle.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { HaltestellenErgebnis, OevHalt } from '../daten/haltestellen'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import { rechneFall } from '../rechner/index'
import { leererFall, fallLesen, fallSchreiben, fallVersion, type Fall } from '../fall'
import { befundblaetter } from './befundblatt'
import { querungen, vorbelegen, innerortsAusTags, innerortsAusOsm, type GeoVorbelegung } from './vorbelegung'
import { AUTO, automatik, busTag, kopfUeberstandAv, type AutoGeo } from './automatik'
import { bedarfLesen, eingabenBilden, handSetzen, type Vorbelegung, type VorWert, type Herkunft } from './fallBedarf'
import { grundpruefung, type GrundSicht } from './grundpruefung'
import { eingabenAus } from './eingaben'
import { BedarfAbschnitt, eingabeUebernehmen } from '../BedarfPanel'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const knoten = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: ll(x, y)[0], lon: ll(x, y)[1] })
const HAUPT = { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }
const UEB = knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], HAUPT)], tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [UEB] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}, x0 = 0, y0 = 0, nid: number | null = 12): Fall => {
  const x = leererFall(ll(x0, y0)[0], ll(x0, y0)[1], nid); f(x); return x
}
const OHNE = { vorgabe: { bern: false, kantonBE: false } }
const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
const g0 = querungen(r0.streifen)[0]
const s0 = g0.streifen[0]
const RAND_X = Math.max(...s0.umriss.map(p => p[0])) - O[0]
const LINKS_X = Math.min(...s0.umriss.map(p => p[0])) - O[0]

/** automatik direkt: Geo, vorgegebene Werte, Streifen (Vorgabe aus der Rechnung der Hauptstrasse) */
function auto(geo: AutoGeo, w0: Vorbelegung = {}, st: StreifenErgebnis[] = g0.streifen, fall: Fall = fallMit()) {
  const w: Vorbelegung = { ...w0 }, fh: Record<string, string> = {}, rechner: Record<string, string> = {}
  automatik({ st, fall, geo, w, hinweise: [], rechner, setze: (p, wert, quelle, text, ganzeStrasse) => { w[p] = { wert, quelle, text, ...(ganzeStrasse ? { ganzeStrasse } : {}) } },
    feldHinweis: (p, t) => { fh[p] = t } })
  return { w, fh, rechner }
}
const vw = (wert: unknown, quelle: VorWert['quelle'] = 'osm', text = 'Test'): VorWert => ({ wert, quelle, text })
const mitZufahrten = (f: (z: ZufahrtErgebnis) => Partial<ZufahrtErgebnis>): StreifenErgebnis[] =>
  g0.streifen.map(s => ({ ...s, zufahrten: s.zufahrten.map(z => ({ ...z, ...f(z) })) }))
const GEO = (osm: OsmDaten, extra: Partial<GeoVorbelegung> = {}): GeoVorbelegung => ({ osm, av: AV, ladeort: O, osmRadiusM: 300, ...extra })

describe('Paket A: Wert im Feld, Handangabe «offen», Zustand «rechner» (Modell und Fall-Datei)', () => {
  it('Handangabe «offen» verwirft die Vorbelegung; zurück stellt sie wieder her', () => {
    const vor: Vorbelegung = { dtv: vw(8000, 'geoportal') }
    const b = handSetzen(undefined, 'dtv', null, 'hand', true)
    expect(b?.felder.dtv).toEqual({ wert: null, quelle: 'hand' })
    const g = eingabenBilden(vor, b)
    expect(g.eingaben.dtv.wert).toBeNull()
    expect(g.herkunft.get('dtv')).toMatchObject({ zustand: 'hand', wert: null, text: 'von Hand offen' })
    expect(eingabenBilden(vor, handSetzen(b, 'dtv', null, 'hand')).eingaben.dtv.wert).toBe(8000)
  })
  it('Fall-Datei: «offen» wird gespeichert und gelesen (Version 3 wie mit jeder Handeingabe); alte Fälle ohne laden unverändert', () => {
    const f = fallMit(x => { x.bedarf = { felder: { dtv: { wert: null, quelle: 'hand' }, vSig: { wert: 40, quelle: 'hand' } } } })
    expect(fallVersion(f)).toBe(3)
    const [g] = fallLesen(fallSchreiben(f))
    expect(g.bedarf?.felder).toEqual({ dtv: { wert: null, quelle: 'hand' }, vSig: { wert: 40, quelle: 'hand' } })
    // alt: Einträge ohne Wert mit anderer Quelle bleiben wie bisher still übergangen
    expect(bedarfLesen({ felder: { dtv: { wert: null, quelle: 'annahme' }, vSig: { wert: 30, quelle: 'hand' } } })[0]!.felder)
      .toEqual({ vSig: { wert: 30, quelle: 'hand' } })
    expect(bedarfLesen({ felder: { dtv: { wert: null, quelle: 'hand' } } })).toEqual([{ felder: { dtv: { wert: null, quelle: 'hand' } } }, []])
  })
  it('Zustand «rechner»: zählt nicht als offen, Text des Sichtrechners; Handeingabe geht vor', () => {
    const g = eingabenBilden({}, null, { sichtVorh: 'Sichtrechner: Ost: frei bis 55 m' })
    expect(g.herkunft.get('sichtVorh')).toEqual({ zustand: 'rechner', quelle: 'rechnung', text: 'Sichtrechner: Ost: frei bis 55 m' })
    expect(g.eingaben.sichtVorh.wert).toBeNull()
    const h = eingabenBilden({}, { felder: { sichtVorh: { wert: [40], quelle: 'hand' } } }, { sichtVorh: 'x' })
    expect(h.herkunft.get('sichtVorh')!.zustand).toBe('hand')
  })
  it('Übernehmen: gleicher Wert wie die Vorbelegung ist keine Handeingabe; anderer Wert schon; gleicher Wert entfernt eine Handeingabe', () => {
    const vor = vw(8000, 'geoportal')
    const aufrufe: unknown[] = []
    const setze = (x: unknown) => { aufrufe.push(x); return true }
    const hv: Herkunft = { zustand: 'vorbelegt', quelle: 'geoportal', text: 't', vorbelegt: vor }
    expect(eingabeUebernehmen(hv, 8000, setze)).toBe(true)
    expect(aufrufe).toEqual([])
    eingabeUebernehmen(hv, 9000, setze)
    expect(aufrufe).toEqual([9000])
    const hh: Herkunft = { zustand: 'hand', quelle: 'hand', text: 'von Hand', vorbelegt: vor, wert: 9000 }
    eingabeUebernehmen(hh, 8000, setze)
    expect(aufrufe).toEqual([9000, null])
    expect(eingabeUebernehmen(hv, null, setze)).toBe(false)              // leer ohne Handeingabe: Vorbelegung bleibt
  })
})

describe('Paket A: Anzeige (renderToStaticMarkup)', () => {
  const f = fallMit()
  const [b] = befundblaetter(r0, f, { ...OHNE, geo: GEO(OSM) })
  const html = renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[b]} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />)
  it('vorbelegter Wert im Feld (Klasse vorbelegt) mit Quellen-Chip und Herkunft als Tooltip', () => {
    expect(html).toMatch(/<input[^>]*class="zahl bedarf-zahl vorbelegt"[^>]*value="50"/)
    expect(html).toMatch(/<select[^>]*class="vorbelegt"/)
    expect(html).toContain('class="quelle-chip q-osm" title="Signalisiertes Tempo: Tempo der geraden Zufahrten (OSM maxspeed)">OSM</span>')
    expect(html).toContain('quelle-chip q-annahme')
    expect(html).toContain('offen (Vorbelegung verwerfen)')
  })
  it('Sichtweite im Zustand «rechner»: Ergebnis des Sichtrechners je Zufahrt, darunter «von Hand überschreiben»', () => {
    expect(html).toMatch(/class="klein rechner-anzeige">Sichtrechner: [^<]*frei bis 55 m, Soll 55 m \(VSS Tab\. 1\)/)
    expect(html).toContain('placeholder="von Hand überschreiben"')
    expect(b.gebildet.herkunft.get('sichtVorh')!.zustand).toBe('rechner')
  })
  it('Frage nach Anzeichen für schnelleres Fahren oben, solange offen; «Zebra» nirgends sichtbar', () => {
    expect(html).toContain('class="bedarf-frage"')
    expect(html).toContain('Gibt es Anzeichen, dass hier schneller als erlaubt gefahren wird?')
    const f2 = fallMit(x => { x.bedarf = { felder: { anzeichenSchneller: { wert: false, quelle: 'hand' } } } })
    const [b2] = befundblaetter(r0, f2, OHNE)
    expect(renderToStaticMarkup(<BedarfAbschnitt fall={f2} blaetter={[b2]} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />))
      .not.toContain('class="bedarf-frage"')
    const osmZ: OsmDaten = { ...OSM, uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'zebra', 'crossing:markings': 'zebra' }),
      knoten(40, 60, 0, { highway: 'crossing', crossing_ref: 'zebra' })], wege: [weg(1, [[10, -300, 0], [12, 0, 0], [40, 60, 0], [13, 300, 0]], HAUPT)] }
    const [bz] = befundblaetter(rechneFall(osmZ, AV, [], 12, f, null), f, { ...OHNE, geo: GEO(osmZ) })
    const t = renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[bz]} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />)
    expect(t.toLowerCase()).not.toContain('zebra')
    expect(bz.vorbelegt.werte.abstandFgsM.wert).toBeGreaterThan(50)
  })
  it('Handangabe «offen»: Chip «von Hand: offen» mit «zurück»', () => {
    const f3 = fallMit(x => { x.bedarf = { felder: { vSig: { wert: null, quelle: 'hand' } } } })
    const [b3] = befundblaetter(r0, f3, OHNE)
    const t = renderToStaticMarkup(<BedarfAbschnitt fall={f3} blaetter={[b3]} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />)
    expect(t).toContain('von Hand: offen')
    expect(b3.gebildet.eingaben.vSig.wert).toBeNull()
  })
})

describe('Paket A: Tempo-Regime, innerorts (A3)', () => {
  it('innerorts aus den OSM-Tags: CH:urban, Zone, living_street ja; CH:rural nein; widersprüchlich offen', () => {
    expect(innerortsAusTags({ 'maxspeed:type': 'CH:urban' })).toMatchObject({ wert: true })
    expect(innerortsAusTags({ 'zone:maxspeed': 'CH:zone30' })).toMatchObject({ wert: true })
    expect(innerortsAusTags({ highway: 'living_street' })).toMatchObject({ wert: true })
    expect(innerortsAusTags({ 'source:maxspeed': 'CH:rural' })).toMatchObject({ wert: false })
    expect(innerortsAusTags({ maxspeed: '50' })).toMatchObject({ wert: null })
    expect(innerortsAusOsm([{ 'maxspeed:type': 'CH:urban' }, { 'maxspeed:type': 'CH:rural' }]).wert).toBeNull()
    const v = vorbelegen(g0, fallMit(), [], { osmTags: new Map([[1, { ...HAUPT, 'source:maxspeed': 'CH:rural' }]]) })
    expect(v.werte.innerorts).toMatchObject({ wert: false, quelle: 'osm' })
    expect(vorbelegen(g0, fallMit(), [], {}).werte.innerorts).toMatchObject({ wert: true, quelle: 'annahme' })
  })
  it('Strecke ab 40 km/h (Tatsache), 30 km/h ohne Zonenangabe offen, 20 km/h Begegnungszone als Annahme', () => {
    const regime = (v: string) => {
      const osm: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { ...HAUPT, maxspeed: v })] }
      return vorbelegen(querungen(rechneFall(osm, AV, [], 12, fallMit(), null).streifen)[0], fallMit()).werte.tempoRegime
    }
    expect(regime('40')).toMatchObject({ wert: 'strecke', quelle: 'osm' })
    expect(regime('30')).toBeUndefined()
    expect(regime('20')).toMatchObject({ wert: 'begegnungszone', quelle: 'annahme' })
  })
})

describe('Paket A: Kopien und Annahmen mit Schwellen (A4, A8)', () => {
  it('LSA-Zeiten und Trottoirüberfahrt übernehmen Fahrbahn, Teilquerungen, Inseltiefe, Tempo, Fahrstreifen, DTV, Zone', () => {
    const { w } = auto({}, { fahrbahnB: vw(8, 'rechnung'), querdistanzL: vw([4, 3.5], 'rechnung'), 'insel.vorhanden': vw(true, 'av'),
      'insel.breite': vw(2, 'av'), vSig: vw(30), nRichtung: vw([1, 2]), dtv: vw(4000, 'geoportal'), tempoRegime: vw('t30_zone') })
    expect([w['lsaZeiten.L'].wert, w['lsaZeiten.teile'].wert, w['lsaZeiten.inselB'].wert]).toEqual([8, [4, 3.5], 2])
    expect([w['q3.vSigEinm'].wert, w['q3.nEinm'].wert, w['q3.dtvEinm'].wert, w['q3.zoneEinm'].wert]).toEqual([30, 2, 4000, 't30'])
    expect(w['q3.dtvEinm'].quelle).toBe('geoportal')
    expect(auto({}, { querdistanzL: vw([8], 'rechnung') }).w['lsaZeiten.teile']).toBeUndefined()
  })
  it('stark befahren: DTV 9 999 nein, 10 000 ja; zwei Fahrstreifen je Richtung ja (Annahmen)', () => {
    expect(auto({}, { dtv: vw(9999), nRichtung: vw([1, 1]) }).w.starkBelastet).toMatchObject({ wert: false, quelle: 'annahme' })
    expect(auto({}, { dtv: vw(10000), nRichtung: vw([1, 1]) }).w.starkBelastet).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(auto({}, { nRichtung: vw([2, 1]) }).w.starkBelastet).toMatchObject({ wert: true })
    expect(auto({}, { nRichtung: vw([1, 1]) }).w.starkBelastet).toBeUndefined()
  })
  it('Autoverkehr an der Einengung: 2 999 wenig, 3 000 und 10 000 mittel, 10 001 viel; Seitenstrasse viel ab 3 000', () => {
    const kl = (d: number) => auto({}, { dtv: vw(d) }).w
    expect([2999, 3000, 10000, 10001].map(d => kl(d).mivKlasse.wert)).toEqual(['tief', 'mittel', 'mittel', 'hoch'])
    expect([kl(2999)['q3.mivEinmHoch'].wert, kl(3000)['q3.mivEinmHoch'].wert]).toEqual([false, true])
    expect(kl(3000).mivKlasse.quelle).toBe('annahme')
  })
  it('lange Querung: 12,0 m nein, 12,1 m ja (Annahme)', () => {
    expect(auto({}, { querdistanzL: vw([12], 'rechnung') }).w.querungLang).toMatchObject({ wert: false, quelle: 'annahme' })
    expect(auto({}, { querdistanzL: vw([6, 12.1], 'rechnung') }).w.querungLang).toMatchObject({ wert: true, quelle: 'annahme' })
  })
  it('Einengung: Fahrbahn 1,0 m schmaler als die Zufahrt ja, 0,99 m nein; Restbreite = Fahrbahn; ohne bauliche Hilfe nur ohne Vortritt', () => {
    const fb = vw(8, 'rechnung', 'Bordkanten')
    const e = (zb: number, typ = 'fgs') => auto({}, { fahrbahnB: fb, typ: vw(typ, 'hand'), 'insel.vorhanden': vw(false, 'rechnung') },
      mitZufahrten(() => ({ fahrbahnM: zb }))).w
    expect(e(9).einengung).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(e(9).restbreiteM).toMatchObject({ wert: 8, quelle: 'rechnung' })
    expect(e(8.99).einengung.wert).toBe(false)
    expect(e(8.99).restbreiteM).toBeUndefined()
    expect(e(8.99).ohneBaulich).toBeUndefined()
    expect(e(8.99, 'ohne_vortritt').ohneBaulich).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(e(9, 'ohne_vortritt').ohneBaulich).toMatchObject({ wert: false })
  })
  it('Länge der Einengung aus der AV (Fahrbahn schmaler als Zufahrt − 0,5 m)', () => {
    const avE = [av('Strasse_Weg', rechteck(-5, -4, 5, 4)), av('Strasse_Weg', rechteck(-300, -5, -5, 5)), av('Strasse_Weg', rechteck(5, -5, 300, 5))]
    const { w } = auto({ av: avE }, { fahrbahnB: vw(8, 'rechnung') }, mitZufahrten(() => ({ fahrbahnM: 10 })))
    expect(w.einengungLaengeM.quelle).toBe('av')
    expect(w.einengungLaengeM.wert).toBeGreaterThanOrEqual(9.5)
    expect(w.einengungLaengeM.wert).toBeLessThanOrEqual(10.5)
  })
})

describe('Paket A: Haltestelle angrenzend, Tramhaltestelle (A5)', () => {
  const B = { mitte: O, radiusM: 150, form: 'kreis' as const }
  const halt = (d: number, art: OevHalt['art'] = 'bus', extra: Partial<OevHalt> = {}): OevHalt =>
    ({ id: `h${d}`, name: 'Beispielplatz', p: lv(RAND_X + d, 0), art, ...extra })
  const hOsm = (halte: OevHalt[]): HaltestellenErgebnis => ({ quelle: 'osm', herkunft: 'OSM', halte, bereich: B })
  it('Haltestelle bis 20 m ja; über 50 m nein; dazwischen offen', () => {
    expect(auto({ haltestellen: hOsm([halt(20)]) }).w.haltestelleAngrenzend).toMatchObject({ wert: true, quelle: 'osm' })
    expect(auto({ haltestellen: hOsm([halt(20.5)]) }).w.haltestelleAngrenzend).toBeUndefined()
    expect(auto({ haltestellen: hOsm([halt(50)]) }).w.haltestelleAngrenzend).toBeUndefined()
    expect(auto({ haltestellen: hOsm([halt(50.5)]) }).w.haltestelleAngrenzend).toMatchObject({ wert: false })
  })
  it('Tramhaltestelle bis 30 m ja, keine bis 50 m nein; Geoportal ohne Modus offen mit Hinweis', () => {
    expect(auto({ haltestellen: hOsm([halt(30, 'tram')]) }).w.tramHaltestellenbereich).toMatchObject({ wert: true, quelle: 'osm' })
    const mitte = auto({ haltestellen: hOsm([halt(30.5, 'tram')]) })
    expect(mitte.w.tramHaltestellenbereich).toBeUndefined()
    expect(mitte.fh.tramHaltestellenbereich).toContain('von Hand wählen')
    expect(auto({ haltestellen: hOsm([halt(50.5, 'tram'), halt(10, 'bus')]) }).w.tramHaltestellenbereich).toMatchObject({ wert: false })
    const gp = auto({ haltestellen: { quelle: 'geoportal', herkunft: 'Geoportal Stadt Bern', halte: [halt(10, 'oev')], bereich: B } })
    expect(gp.w.tramHaltestellenbereich).toBeUndefined()
    expect(gp.fh.tramHaltestellenbereich).toContain('ohne Angabe Bus oder Tram')
  })
  it('Busbucht (OSM bus_bay), Fahrbahnhaltestelle (stop_position auf der Fahrbahn) als Annahme; Lage in Fahrtrichtung; verdeckt', () => {
    const osmH: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [50, LINKS_X - 17, 0], [12, 0, 0], [13, 300, 0]], HAUPT)] }
    // südlicher Halt bedient die Fahrtrichtung Ost; Haltepunkt 17 m vor dem Streifen (x = Rand links − 17): Querung hinter dem Halt
    const vor = (d: number, tags: Record<string, string>, osmId?: number) => auto({ osm: osmH, haltestellen: hOsm([{ id: 'x', name: 'Halt',
      p: lv(LINKS_X - d, -6), art: 'bus', tags, ...(osmId ? { osmId } : {}) }]) }).w
    const bucht = vor(17, { highway: 'bus_stop', bus_bay: 'right' })
    expect(bucht['haltestelle.art']).toMatchObject({ wert: 'bucht', quelle: 'osm' })
    const fb = vor(17, { public_transport: 'stop_position', bus: 'yes' }, 50)
    expect(fb['haltestelle.art']).toMatchObject({ wert: 'fahrbahn', quelle: 'annahme' })
    expect(fb['haltestelle.lage']).toMatchObject({ wert: 'fgs_nach_halt', quelle: 'annahme' })
    expect(fb['haltestelle.verdeckt']).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(vor(19, { public_transport: 'stop_position', bus: 'yes' }, 50)['haltestelle.verdeckt']).toBeUndefined()   // 19 m ≥ 18 m
    expect(vor(10, { highway: 'bus_stop' })['haltestelle.lage'].wert).toBe('im_bereich')
    expect(vor(10, { highway: 'bus_stop' })['haltestelle.art']).toBeUndefined()
    // Halt in Fahrtrichtung nach dem Streifen (Osten): Querung vor dem Haltebereich
    const ost = auto({ haltestellen: hOsm([{ id: 'y', name: 'Halt', p: lv(RAND_X + 20, -6), art: 'bus' }]) }).w
    expect(ost['haltestelle.lage'].wert).toBe('fgs_vor_halt')
  })
})

describe('Paket A: Busstreifen, Insel, Neuanlage (A6)', () => {
  it('Bus-Tags: busway, lanes:bus, bus:lanes designated; ohne Tag «nein» als Annahme', () => {
    expect(busTag({ busway: 'lane' })).toBe('busway=lane')
    expect(busTag({ 'lanes:bus': '1' })).toBe('lanes:bus=1')
    expect(busTag({ 'bus:lanes:forward': 'designated|' })).toBe('bus:lanes:forward=designated|')
    expect(busTag({ 'lanes:bus': '0' })).toBe('')
    expect(auto({ osmTags: new Map([[1, { ...HAUPT, busway: 'lane' }]]) }).w.busspur).toMatchObject({ wert: true, quelle: 'osm' })
    expect(auto({ osmTags: new Map([[1, HAUPT]]) }).w.busspur).toMatchObject({ wert: false, quelle: 'annahme' })
    expect(auto({}).w.busspur).toBeUndefined()
  })
  it('Neuanlage: Streifen aus OSM nein (Bestand); von Hand ohne OSM-Übergang ja (Annahme)', () => {
    expect(auto({}, {}, g0.streifen, fallMit(x => { x.ort.markierung = 'markiert' })).w.neuanlage).toMatchObject({ wert: false, quelle: 'osm' })
    const hand = g0.streifen.map(s => ({ ...s, fgsId: 'hand-1' }))
    const fh = fallMit(x => { x.streifenHand = [{ id: 'hand-1' } as Fall['streifenHand'][number]] }, 0, 0, null)
    expect(auto({}, {}, hand, fh).w.neuanlage).toMatchObject({ wert: true, quelle: 'annahme' })
  })
  it('Insel der AV unter der Lücke: gebaut (Quelle AV) mit Kopfüberstand je Seite', () => {
    const insel = av('Verkehrsinsel', rechteck(-8, -1, 6, 1))
    const k = kopfUeberstandAv([insel], lv(0, 0), g0.streifen)
    expect(k).toEqual([Math.round((6 - RAND_X) * 10) / 10, Math.round((LINKS_X + 8) * 10) / 10])
    expect(kopfUeberstandAv([], lv(0, 0), g0.streifen)).toBeNull()
  })
})

describe('Paket A/B: Lage, Verzweigung, Knoten, Abstände (A7, B1, B2)', () => {
  // T-Knoten: Seitenstrasse nach Norden bei x = xs (Weg 2, Querweg); Übergang 12 auf der Hauptstrasse bei x = 0
  const tKnoten = (xs: number, extra: Partial<OsmDaten> = {}): OsmDaten => ({ ...OSM, ...extra,
    wege: [weg(1, [[10, -300, 0], [12, 0, 0], [14, xs, 0], [13, 300, 0]], HAUPT),
      weg(2, [[14, xs, 0], [30, xs, 12], [20, xs, 200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' }), ...(extra.wege ?? [])] })
  const avT = (xs: number): AvFlaeche[] => [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Strasse_Weg', rechteck(xs - 4, 4, xs + 4, 200)),
    av('Trottoir', rechteck(-300, 4, xs - 4, 7)), av('Trottoir', rechteck(xs + 4, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
  const blatt = (osm: OsmDaten, avx: AvFlaeche[], nid = 12, x0 = 0, y0 = 0) => {
    const f = fallMit(() => {}, x0, y0, nid)
    return befundblaetter(rechneFall(osm, avx, [], nid, f, null), f, { ...OHNE, geo: { osm, av: avx, ladeort: lv(x0, y0), osmRadiusM: 300 } })[0]
  }
  it('Knoten 20 m vom Streifen: Kreuzung (gequerte Strasse geht weiter) → Lage offen mit Hinweis, Verzweigung ja; 21 m: Strecke, nein', () => {
    const xs = (d: number) => RAND_X + d
    const b20 = blatt(tKnoten(xs(19.9)), avT(xs(19.9)))
    expect(b20.vorbelegt.werte.lage).toBeUndefined()
    expect(b20.vorbelegt.feldHinweise!.lage).toMatch(/^Kreuzung: Knoten 20 m vom Streifen mit 3 Armen \(OSM\); Vortrittsrolle wählen/)
    expect(b20.vorbelegt.werte.verzweigung).toMatchObject({ wert: true, quelle: 'rechnung' })
    const b21 = blatt(tKnoten(xs(20.2)), avT(xs(20.2)))
    expect(b21.vorbelegt.werte.lage).toMatchObject({ wert: 'strecke', quelle: 'osm' })
    expect(b21.vorbelegt.werte.verzweigung).toMatchObject({ wert: false })
  })
  it('Einmündung: Streifen über die Seitenstrasse, die am Knoten endet → einmündend, kein Kreisel; Rückversatz aus der AV', () => {
    const osm = { ...tKnoten(15), uebergaenge: [UEB, knoten(30, 15, 12, { highway: 'crossing', crossing: 'marked' })] }
    const b = blatt(osm, avT(15), 30, 15, 12)
    const w = b.vorbelegt.werte
    expect(w.lage).toMatchObject({ wert: 'einmuendung', quelle: 'osm' })
    expect([w['q3.ueber'].wert, w['q3.kreisel'].wert]).toEqual(['einmuendend', false])
    const s = b.streifen.length ? querungen(rechneFall(osm, avT(15), [], 30, fallMit(() => {}, 15, 12, 30), null).streifen)[0].streifen[0] : null
    const unten = Math.min(...s!.umriss.map(p => p[1] - O[1]))
    expect(w.rueckversatzM.quelle).toBe('av')
    expect(w.rueckversatzM.wert).toBeCloseTo(unten - 4, 0)
    // Arme: Übergang 12 auf dem Westarm (15 m), die eigene Querung auf dem Nordarm: nur der Ostarm ohne Querung
    expect(w.knotenArmeOhneQuerung).toMatchObject({ wert: 1, quelle: 'annahme' })
  })
  it('Kreisel bis 20 m: am Kreisel', () => {
    const ring = (r: number, cy: number): [number, number, number][] => [...Array(13)].map((_, i) => [900 + (i % 12),
      Math.cos(i * Math.PI / 6) * r, cy + Math.sin(i * Math.PI / 6) * r])
    const kr = (cy: number) => auto({ osm: { ...OSM, wege: [...OSM.wege, weg(9, ring(10, cy), { highway: 'tertiary', junction: 'roundabout' })] } }).w
    const oben = Math.max(...s0.umriss.map(p => p[1] - O[1]))
    expect(kr(oben + 10 + 19.9).lage).toMatchObject({ wert: 'kreisel', quelle: 'osm' })
    expect(kr(oben + 10 + 20.2).lage?.wert).not.toBe('kreisel')
  })
  it('nächster markierter Übergang bzw. Lichtsignal entlang derselben Strasse; ohne Fund die Reichweite (mindestens)', () => {
    const osm: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [41, -100, 0], [12, 0, 0], [40, 60, 0], [13, 300, 0]], HAUPT)],
      uebergaenge: [UEB, knoten(40, 60, 0, { highway: 'crossing', crossing: 'marked' }), knoten(42, 3, 0, { highway: 'crossing', crossing: 'marked' })],
      ampeln: [knoten(41, -100, 0, { highway: 'traffic_signals' })] }
    const { w } = auto(GEO(osm))
    expect(w.abstandFgsM).toMatchObject({ wert: 60, quelle: 'osm' })
    expect(w.abstandLsaM).toMatchObject({ wert: 100, quelle: 'osm' })
    const leer = auto(GEO(OSM)).w
    expect(leer.abstandFgsM).toMatchObject({ wert: Math.floor(300 - Math.hypot(s0.m[0] - O[0], s0.m[1] - O[1]) - 5), quelle: 'annahme' })
    expect(leer.abstandFgsM.text).toMatch(/^entlang der Hauptstrasse bis zur Reichweite der Daten in \d+ m kein markierter Übergang gefunden \(OSM\): mindestens/)
    // Korrektur S6: die Strasse endet (Namenswechsel) nach 80 m bzw. 40 m: «mindestens» nur mit der durchsuchten Länge ab der Schwelle
    const kurz = (x: number) => auto(GEO({ ...OSM, wege: [weg(1, [[10, -x, 0], [12, 0, 0], [13, x, 0]], HAUPT),
      weg(5, [[13, x, 0], [14, 300, 0]], { ...HAUPT, name: 'Andere Strasse' }), weg(6, [[16, -300, 0], [10, -x, 0]], { ...HAUPT, name: 'Andere Strasse' })] }))
    const k80 = kurz(80)
    expect(k80.w.abstandFgsM).toMatchObject({ wert: 80, quelle: 'annahme' })
    expect(k80.w.abstandFgsM.text).toContain('bis zum Namenswechsel in 80 m kein markierter Übergang gefunden')
    expect(k80.w.abstandLsaM).toBeUndefined()                               // unter 125 m (G2) durchsucht: offen mit Hinweis
    expect(k80.fh.abstandLsaM).toContain('weniger als 125 m durchsucht')
    expect(kurz(40).w.abstandFgsM).toBeUndefined()
    expect(auto({ osm }).w.abstandFgsM).toMatchObject({ wert: 60 })          // ohne Ladeort: gefunden ja, Reichweite nicht
    expect(auto({ osm: OSM }).w.abstandFgsM).toBeUndefined()
  })
  it('Runde 4 (S6): endet die Strasse ohne Fortsetzung, ist diese Richtung ganz durchsucht; nur ein Namenswechsel begrenzt', () => {
    const QUER = { highway: 'residential', name: 'Querstrasse' }
    const reich = Math.floor(300 - Math.hypot(s0.m[0] - O[0], s0.m[1] - O[1]) - 5)
    /** Hauptstrasse von x = -30 (Ende an einer Querstrasse Nord–Süd bzw. Sackgasse) bis ostX, dazu weitere Wege */
    const netz = (west: 'quer' | 'sackgasse', ostX = 300, weitere: OsmWeg[] = [], ampeln: OsmKnoten[] = []): OsmDaten => ({ ...OSM, ampeln,
      wege: [weg(1, [[10, -30, 0], [12, 0, 0], [13, ostX, 0]], HAUPT),
        ...(west === 'quer' ? [weg(7, [[70, -30, -100], [10, -30, 0], [71, -30, 100]], QUER)] : []), ...weitere] })
    // Querstrasse im Westen nach 30 m, nach Osten bis zur Reichweite: Annahme mit der Reichweite (Runde 3: offen, weniger als 50 m)
    const t = auto(GEO(netz('quer')))
    expect(t.w.abstandFgsM).toMatchObject({ wert: reich, quelle: 'annahme' })
    expect(t.w.abstandFgsM.text).toContain('bis zur Reichweite der Daten')
    expect(t.w.abstandFgsM.text).toContain('in der anderen Richtung endet sie nach 30 m ohne Fortsetzung')
    expect(t.w.abstandLsaM).toMatchObject({ wert: reich, quelle: 'annahme' })
    // Sackgasse (kein weiterer Weg am Ende): ebenso ganz durchsucht
    expect(auto(GEO(netz('sackgasse'))).w.abstandFgsM).toMatchObject({ wert: reich, quelle: 'annahme' })
    // Fortsetzung mit anderem Namen, 30° abgewinkelt: Namenswechsel, nach 30 m begrenzt → offen mit Hinweis
    const schraeg = auto(GEO(netz('quer', 300, [weg(8, [[10, -30, 0], [72, -30 - 87, -50]], { ...HAUPT, name: 'Andere Strasse' })])))
    expect(schraeg.w.abstandFgsM).toBeUndefined()
    expect(schraeg.fh.abstandFgsM).toContain('bis zum Namenswechsel in 30 m kein markierter Übergang gefunden (OSM), weniger als 50 m durchsucht')
    // 60° abgewinkelt: keine Fortsetzung (Querstrasse), ganz durchsucht
    expect(auto(GEO(netz('sackgasse', 300, [weg(8, [[10, -30, 0], [72, -30 - 50, -87]], { ...HAUPT, name: 'Andere Strasse' })]))).w.abstandFgsM)
      .toMatchObject({ wert: reich, quelle: 'annahme' })
    // beide Richtungen enden (Querstrassen bei -30 und +40): ganze Strasse durchsucht, Wert = echte Länge 70 m als Annahme mit
    // Kennzeichen ganzeStrasse (G1/G2 dann Hinweis, nicht anwendbar; Runde 4)
    const beide = auto(GEO(netz('quer', 40, [weg(9, [[73, 40, -100], [13, 40, 0], [74, 40, 100]], { ...QUER, name: 'Ostweg' })])))
    expect(beide.w.abstandFgsM).toEqual({ wert: 70, quelle: 'annahme', ganzeStrasse: true, text: 'ganze Hauptstrasse durchsucht, 70 m (endet ' +
      'in beiden Richtungen ohne Fortsetzung, nach 30 bzw. 40 m): kein markierter Übergang auf ihr (OSM), kein weiterer Fussgängerstreifen möglich' })
    expect(beide.w.abstandLsaM).toMatchObject({ wert: 70, quelle: 'annahme', ganzeStrasse: true })
    // zwei Äste in derselben Richtung: Sackgasse nach 200 m (20 m + 180 m nach Norden) bzw. Namenswechsel nach 56 m → durchsucht 56 m
    const aeste = auto(GEO({ ...OSM, wege: [weg(1, [[10, -30, 0], [12, 0, 0], [40, 20, 0], [13, 56, 0]], HAUPT),
      weg(7, [[70, -30, -100], [10, -30, 0], [71, -30, 100]], QUER), weg(26, [[40, 20, 0], [41, 20, 180]], HAUPT),
      weg(5, [[13, 56, 0], [14, 300, 0]], { ...HAUPT, name: 'Andere Strasse' })] }))
    expect(aeste.w.abstandFgsM).toMatchObject({ wert: 56, quelle: 'annahme' })
    expect(aeste.w.abstandFgsM.text).toContain('bis zum Namenswechsel in 56 m')
    // Ampel am Endknoten (bis 30 m, wie knotenLsa): Lichtsignal am Knoten, an dem die Strasse endet; 30 bis 50 m: unklar, begrenzt
    const amp = (dy: number) => auto(GEO(netz('quer', 300, [], [knoten(80, -30, dy, { highway: 'traffic_signals' })])))
    expect(amp(25).w.abstandLsaM).toMatchObject({ wert: 30, quelle: 'osm' })
    expect(amp(25).w.abstandLsaM.text).toContain('Lichtsignal am Knoten, an dem die Strasse endet')
    expect(amp(25).w.abstandFgsM).toMatchObject({ wert: reich, quelle: 'annahme' })        // Fussgängerstreifen: Ende bleibt ganz durchsucht
    expect(amp(40).w.abstandLsaM).toBeUndefined()
    expect(amp(40).fh.abstandLsaM).toContain('bis zum Strassenende (Lichtsignal 30 bis 50 m davon) in 30 m')
    expect(amp(60).w.abstandLsaM).toMatchObject({ wert: reich, quelle: 'annahme' })
  })
  it('Knoten mit Lichtsignal: Ampel bis 30 m ja, über 50 m nein (Annahme), dazwischen Hinweis; Trottoirüberfahrt übernimmt', () => {
    const xs = RAND_X + 10
    const mit = (dx: number) => auto(GEO({ ...tKnoten(xs), ampeln: [knoten(77, xs + dx, 0, { highway: 'traffic_signals' })] }))
    expect(mit(29.9).w.knotenLsa).toMatchObject({ wert: true, quelle: 'osm' })
    expect(mit(29.9).w['q3.lsaKnoten']).toMatchObject({ wert: true })
    expect(mit(50.2).w.knotenLsa).toMatchObject({ wert: false, quelle: 'annahme' })
    expect(mit(40).w.knotenLsa).toBeUndefined()
    expect(mit(40).fh.knotenLsa).toContain('40 m vom Knoten')
  })
})

describe('Paket B: Tram, Strassentyp, Übergangs-Tags, Einfahrt (B5, B6, B8)', () => {
  const tramSt = g0.streifen.map(s => ({ ...s, tram: true }))
  const gleis = (tags: Record<string, string>): OsmDaten => ({ ...OSM, tram: [weg(60, [[61, -50, 0.5], [62, 50, 0.5]], { railway: 'tram', ...tags })] })
  it('Gleis in der AV-Fläche Bahn bzw. Insel: eigener Gleiskörper (AV); in der Fahrbahn bzw. embedded: Fahrbahn', () => {
    const bahn = [av('Bahn', rechteck(-3, -1, 3, 1)), ...AV]
    expect(auto({ osm: gleis({}), av: bahn }, {}, tramSt).w.tram).toMatchObject({ wert: 'eigentrassee', quelle: 'av' })
    expect(auto({ osm: gleis({}), av: AV }, {}, tramSt).w.tram).toMatchObject({ wert: 'fahrbahn', quelle: 'av' })
    expect(auto({ osm: gleis({ embedded: 'yes' }) }, {}, tramSt).w.tram).toMatchObject({ wert: 'fahrbahn', quelle: 'osm' })
    expect(auto({ osm: gleis({}) }, {}, tramSt).w.tram).toBeUndefined()
  })
  it('Strassentyp aus OSM als Annahme; unclassified offen mit Hinweis; amtliche Quelle hat Vorrang', () => {
    const typ = (hw: string) => auto({ osm: { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { ...HAUPT, highway: hw })] } })
    expect(typ('secondary').w.strassentyp).toMatchObject({ wert: 'verkehrsorientiert', quelle: 'annahme' })
    expect(typ('tertiary').w.strassentyp).toMatchObject({ wert: 'verkehrsorientiert' })
    expect(typ('residential').w.strassentyp).toMatchObject({ wert: 'siedlungsorientiert' })
    expect(typ('unclassified').w.strassentyp).toBeUndefined()
    expect(typ('unclassified').fh.strassentyp).toContain('unclassified')
    expect(auto({ osm: OSM, strassentyp: { wert: 'siedlungsorientiert', quelle: 'geoportal', text: 'Strassenhierarchie' } }).w.strassentyp)
      .toMatchObject({ wert: 'siedlungsorientiert', quelle: 'geoportal' })
  })
  it('Tags des eigenen Übergangs nur als Hinweis; Zufahrtsweg bis 10 m: Ein-/Ausfahrt (Annahme)', () => {
    const osm: OsmDaten = { ...OSM, uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked', flashing_lights: 'yes',
      tactile_paving: 'no', button_operated: 'yes' })] }
    const { w, fh } = auto({ osm })
    expect([w.blinklicht, w.taktil]).toEqual([undefined, undefined])
    expect(fh.blinklicht).toContain('flashing_lights=yes')
    expect(fh.taktil).toContain('tactile_paving=no')
    expect(fh['lsaZeiten.inselNurAnmeldung']).toContain('button_operated=yes')
    const ein = (x: number) => auto({ osm: { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [71, x, 0], [13, 300, 0]], HAUPT),
      weg(70, [[71, x, 0], [72, x, -30]], { highway: 'service' })] } }).w.einAusfahrtNah
    expect(ein(RAND_X + 9.9)).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(ein(RAND_X + 10.2)).toBeUndefined()
  })
})

describe('Paket B: Sichtrechner frei bis, Halteverbotslinie, Kurvenradius, H4, Grundprüfung (B7, A9, A7)', () => {
  const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })
  const fp = fallMit(park)
  const rp = rechneFall(OSM, AV, [], 12, fp, null)
  it('frei bis: frei = geprüfte Sichtweite; verdeckt = freie Länge vor dem ersten Konflikt; Status und Soll unverändert', () => {
    const zs = rp.streifen[0].zufahrten
    const verdeckt = zs.find(z => z.status !== 'frei')!, frei = zs.find(z => z.status === 'frei')!
    expect(frei.freiBisM).toBe(frei.sichtweite)
    expect(verdeckt.status).toBe('verdeckt')
    expect(verdeckt.freiBisM).toBeLessThan(verdeckt.sichtweite)
    // die Sichtlinie zur Wartefläche gegenüber kreuzt das Parkfeld (5 bis 10 m vor dem Streifen) erst ab rund 12 m Abstand
    expect(verdeckt.freiBisM).toBeGreaterThan(5)
    expect(verdeckt.freiBisM).toBeLessThan(20)
    expect(r0.streifen[0].zufahrten.every(z => z.freiBisM === z.sichtweite)).toBe(true)
  })
  it('Halteverbotslinie nach Sichtbedarf: Parkfeld im Sichtfeld bis rund 10 m; ohne Parkfeld 0', () => {
    const [b] = befundblaetter(rp, fp, OHNE)
    expect(b.vorbelegt.werte.hvlBedarfM.quelle).toBe('rechnung')
    expect(b.vorbelegt.werte.hvlBedarfM.wert).toBeGreaterThan(12 - RAND_X - 1)
    expect(b.vorbelegt.werte.hvlBedarfM.wert).toBeLessThanOrEqual(12.5)
    expect(befundblaetter(r0, fallMit(), OHNE)[0].vorbelegt.werte.hvlBedarfM.wert).toBe(0)
    expect(b.vorbelegt.rechner!.sichtVorh).toMatch(/verdeckt, Auto-Parkfeld \d+(,\d)? m vor dem Streifen, frei bis \d+ m, Soll 55 m/)
  })
  it('Kurvenradius: ohne Abbieger Zustand «rechner»; H4 mit dem Radius des Sichtrechners nicht, mit Radius von Hand wie bisher', () => {
    const b0 = befundblaetter(r0, fallMit(), OHNE)[0]
    expect(b0.gebildet.herkunft.get('kurve.radius')!.zustand).toBe('rechner')
    const st = mitZufahrten(() => ({ kurvenradiusM: 8.5, radiusQuelle: 'AV-Bordkante r + Abstand', art: 'abbiegend', strasse: 'Querweg' }))
    expect(auto({}, {}, st).w['kurve.radius']).toMatchObject({ wert: 8.5, quelle: 'rechnung' })
    const gs = mitZufahrten(() => ({ kurvenradiusM: 7, radiusQuelle: 'geschätzt (Fahrbahnbreiten)' }))
    expect(auto({}, {}, gs).w['kurve.radius']).toMatchObject({ wert: 7, quelle: 'annahme' })
    // H4: Testfall aus der Rechnung mit Radius 10 (gerade Zufahrten mit Radius, vorbelegt) gegen Radius 10 von Hand
    const rr = { ...r0, streifen: r0.streifen.map(s => ({ ...s, zufahrten: s.zufahrten.map(z => ({ ...z, kurvenradiusM: 10, radiusQuelle: 'AV' })) })) }
    const fx = fallMit(x => { x.bedarf = { felder: { anzeichenSchneller: { wert: false, quelle: 'hand' } } } })
    const bv = befundblaetter(rr, fx, { vorgabe: { bern: false, kantonBE: false } })[0]
    expect(bv.gebildet.eingaben.kurve.wert?.radius).toBe(10)
    expect(bv.befund.alle.some(x => x.id === 'H4')).toBe(false)
    const fh = fallMit(x => { x.bedarf = { felder: { anzeichenSchneller: { wert: false, quelle: 'hand' }, 'kurve.radius': { wert: 10, quelle: 'hand' } } } })
    expect(befundblaetter(r0, fh, OHNE)[0].befund.alle.some(x => x.id === 'H4')).toBe(true)
  })
  it('Grundprüfung ①: verdeckte gerade Zufahrt mit «frei bis» ab dem Soll erfüllt, darunter verletzt; ohne «frei bis» wie bisher offen', () => {
    const e = eingabenAus({ typ: 'fgs', fgsMitLsa: false, vSig: 50, innerorts: true })
    const z = (freiBisM?: number): GrundSicht => ({ name: 'Ost', tempo: 50, soll: 75, quelle: 'VSS Tab. 1', frei: false, status: 'verdeckt',
      ...(freiBisM !== undefined ? { freiBisM } : {}) })
    const b51 = (s: GrundSicht) => grundpruefung(e, { sicht: [s] }).punkte.find(p => p.nr === '1')!.teile.find(t => t.id === 'B5-1')!
    expect(b51(z(55)).zustand).toBe('erfuellt')
    expect(b51(z(54)).zustand).toBe('verletzt')
    expect(b51(z()).zustand).toBe('offen')
    const ei = eingabenAus({ typ: 'fgs', fgsMitLsa: false, vSig: 60 })
    expect(grundpruefung(ei, { sicht: [{ ...z(80), tempo: 60, soll: 110 }] }).punkte.find(p => p.nr === '1')!.teile[0].zustand).toBe('offen')
  })
})

describe('Paket B: Trottoir vor der Parkreihe (AV)', () => {
  it('Bordkante am Streifen 2 m vor der Zufahrt: Parkstreifen 2,5 m −0,5 m, 1,5 m +0,5 m; 2,2 m innerhalb der Messgenauigkeit offen', () => {
    const avS = [av('Strasse_Weg', rechteck(-8, -4, 8, 4)), av('Strasse_Weg', rechteck(-300, -6, -8, 6)), av('Strasse_Weg', rechteck(8, -6, 300, 6))]
    const sv = (abzug: number, q = 'Parkfelder') => auto({ av: avS }, {}, mitZufahrten(() => ({ parkRechts: true, abzugRechtsM: abzug, abzugQuelle: q })))
    expect(sv(2.5).w.seitenraumVorParklinieM).toMatchObject({ wert: -0.5, quelle: 'annahme' })
    expect(sv(1.5, 'Parkierung von Hand').w.seitenraumVorParklinieM).toMatchObject({ wert: 0.5, quelle: 'av' })
    expect(sv(2.2).w.seitenraumVorParklinieM).toBeUndefined()
    expect(sv(2.2).fh.seitenraumVorParklinieM).toContain('von Hand prüfen')
    expect(auto({ av: avS }).w.seitenraumVorParklinieM).toBeUndefined()
  })
  it('Schwellen als Daten', () => {
    expect([AUTO.knotenM, AUTO.dtvStark, AUTO.mivMittel, AUTO.mivHoch, AUTO.querungLangM, AUTO.einengungM]).toEqual([20, 10000, 3000, 10000, 12, 1])
  })
})
