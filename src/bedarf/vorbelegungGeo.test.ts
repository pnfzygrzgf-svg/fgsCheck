import { regionalLesen, regionalUrl, type RegionalSnapshot, type RegionalTeil, type RegionalObjekt } from '../daten/anbieter/gemeinsam/regional'
import { regionalDienst } from '../daten/anbieter/gemeinsam/regionalDienste'
import { zhUrl, zhMetadatenUrl, type ZuerichSnapshot } from '../daten/anbieter/gemeinsam/zuerich'
import { zhStrassen } from '../daten/anbieter/gemeinsam/zuerichZuordnung'
import { vsigTempo } from '../daten/vsig'
import { npvmUrl, NPVM_METADATEN_URL, type NpvmSnapshot } from '../daten/anbieter/npvm'
// Tests Vorbelegung aus Geodaten (Abschnitt 18 der Regeln): Bushaltestelle (Umkreis 50 m), besonderer Grund «Haltestelle»,
// Strecke oder Zone (OSM-Tags), DTV (Geoportal Stadt Bern, Annahme 500), Beleuchtung (Hinweis ohne Wert), Fall-Datei.
// Künstliche Strasse wie befundblatt.test.ts: Hauptstrasse West–Ost, Fahrbahn 8 m, Tempo 50, Übergang bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { HaltestellenErgebnis, OevHalt, Bereich } from '../daten/haltestellen'
import type { VdLinie } from '../daten/verkehrsdaten'
import { rechneFall } from '../rechner/index'
import { leererFall, fallLesen, fallSchreiben, type Fall } from '../fall'
import { befundblatt } from './befundblatt'
import { querungen, vorbelegen, zoneAusTags, zoneAusOsm, abstandZumStreifen, DTV_ANNAHME, type GeoVorbelegung } from './vorbelegung'
import { bedarfLesen, eingabenBilden, quellenWahlSetzen } from './fallBedarf'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const TAGS = { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], TAGS)],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
const g = querungen(r.streifen)[0]
const s = g.streifen[0]
/** östlicher Rand des Streifens (Umriss) auf der Achse y = 0: Haltestellen bzw. Lampen bei x = rand + Abstand */
const RAND_X = Math.max(...s.umriss.map(p => p[0])) - O[0]
const BEREICH: Bereich = { mitte: O, radiusM: 150, form: 'quadrat' }
const halt = (d: number, name = 'Beispielplatz, Kante A'): OevHalt => ({ id: `h${d}`, name, p: lv(RAND_X + d, 0), art: 'oev' })
const hst = (halte: OevHalt[], zusatz?: string): HaltestellenErgebnis =>
  ({ quelle: 'geoportal', herkunft: 'Geoportal Stadt Bern', halte, bereich: BEREICH, ...(zusatz ? { zusatz } : {}) })
const vor = (geo: GeoVorbelegung, f = fallMit()) => vorbelegen(g, f, [], geo)

describe('E1a: BAV-Zuordnung erst nach Bestätigung', () => {
  const bav = (mitHalt = true): HaltestellenErgebnis => ({ quelle: 'bav', herkunft: 'BAV, Haltestellen des öV',
    halte: mitHalt ? [{ ...halt(10), art: 'bus_tram' }] : [], bereich: BEREICH, vollstaendig: false })
  it('erzeugt Vorschläge, aber keine Regel-Eingaben vor Bestätigung; eigene Werte bleiben vorrangig', () => {
    const v = vor({ haltestellen: bav() })
    for (const pfad of ['beduerfnis', 'haltestelleAngrenzend', 'tramHaltestellenbereich'])
      expect(v.werte[pfad]).toMatchObject({ quelle: 'vorschlag', bestaetigungNoetig: true })
    const offen = eingabenBilden(v.werte, undefined)
    expect(offen.eingaben.beduerfnis.wert).toBeNull()
    expect(offen.eingaben.haltestelleAngrenzend.wert).toBeNull()
    expect(offen.eingaben.tramHaltestellenbereich.wert).toBeNull()
    const hand = eingabenBilden(v.werte, { felder: { beduerfnis: { wert: ['haltestelle'], quelle: 'bestaetigt' },
      haltestelleAngrenzend: { wert: false, quelle: 'hand' } } })
    expect(hand.eingaben.beduerfnis).toMatchObject({ wert: ['haltestelle'], quelle: 'bestaetigt' })
    expect(hand.eingaben.haltestelleAngrenzend).toMatchObject({ wert: false, quelle: 'hand' })
    expect(v.werte['haltestelle.lage']).toBeUndefined()
    expect(v.werte['haltestelle.beidseits']).toBeUndefined()
  })
  it('aus einem leeren Inventarausschnitt entsteht weder «keine Haltestelle» noch «kein Tramhalt»', () => {
    const v = vor({ haltestellen: bav(false) })
    expect(v.werte['haltestelle.art']).toBeUndefined()
    expect(v.werte.haltestelleAngrenzend).toBeUndefined()
    expect(v.werte.tramHaltestellenbereich).toBeUndefined()
    expect(v.feldHinweise?.['haltestelle.art']).toContain('Vollständigkeit unbekannt')
  })
})

describe('Vorbelegung: Bushaltestelle (Umkreis 50 m um den Streifen)', () => {
  it('Abstand zum Umriss des Streifens, nicht zum Ladeort', () => {
    expect(abstandZumStreifen(lv(RAND_X + 23, 0), s)).toBeCloseTo(23, 6)
    expect(abstandZumStreifen(lv(0, 0), s)).toBe(0)
  })
  it('keine Haltestelle im Umkreis: «keine» mit Quelle und Herkunft; Grund bleibt offen', () => {
    const v = vor({ haltestellen: hst([halt(51)]) })
    expect(v.werte['haltestelle.art']).toEqual({ wert: 'keine', quelle: 'geoportal', text: 'keine Haltestelle im Umkreis von 50 m (Geoportal Stadt Bern)' })
    expect(v.werte.beduerfnis).toBeUndefined()
    expect(eingabenBilden(v.werte, null).eingaben.haltestelle.wert).toEqual({ art: null, lage: null, verdeckt: null, ueberholenUnterbunden: null, beidseits: null })
    const o = vor({ haltestellen: { quelle: 'osm', herkunft: 'OSM', halte: [], bereich: { mitte: O, radiusM: 150, form: 'kreis' } } })
    expect(o.werte['haltestelle.art']).toMatchObject({ wert: 'keine', quelle: 'osm', text: 'keine Haltestelle im Umkreis von 50 m (OSM)' })
  })
  it('49 und 50 m: Art offen mit Hinweis ohne Wert, Grund «Haltestelle» mit Quelle der Daten (keine Annahme, M5); 51 m: «keine»', () => {
    for (const d of [49, 50]) {
      const v = vor({ haltestellen: hst([halt(80, 'Fernplatz'), halt(d)]) })
      expect(v.werte['haltestelle.art']).toBeUndefined()
      expect(v.feldHinweise!['haltestelle.art']).toBe(`Haltestelle «Beispielplatz, Kante A» (${d} m): Bitte angeben, ob der Bus auf der Fahrbahn oder in einer Bucht hält ⟦Geoportal Stadt Bern⟧`)
      expect(v.hinweise).toContain(`Bushaltestelle an der Querung: ${v.feldHinweise!['haltestelle.art']}`)
      expect(v.werte.beduerfnis).toMatchObject({ wert: ['haltestelle'], quelle: 'geoportal' })
      expect(v.werte.beduerfnis.text).toContain('Haltestelle an der Querung als Grund für Vortritt')
      const b = befundblatt(g, fallMit(), { vorgabe: { bern: true, kantonBE: true }, geo: { haltestellen: hst([halt(d)]) } })
      expect(b.annahmen.join(' ')).not.toMatch(/Besonderer Grund|Haltestelle/)
    }
    expect(vor({ haltestellen: hst([halt(51)]) }).werte['haltestelle.art']?.wert).toBe('keine')
  })
  it('Tramhaltestelle (OSM) nennt die Art; Ausfall des Geoportals steht in der Herkunft', () => {
    const v = vor({ haltestellen: { quelle: 'osm', herkunft: 'OSM', halte: [{ ...halt(10), art: 'tram' }], bereich: BEREICH,
      zusatz: 'Geoportal Stadt Bern nicht erreichbar (HTTP 503)' } })
    expect(v.feldHinweise!['haltestelle.art']).toMatch(/^Tramhaltestelle «Beispielplatz, Kante A» \(10 m\): .*⟦OSM; Geoportal Stadt Bern nicht erreichbar \(HTTP 503\)⟧/)
    const k = vor({ haltestellen: hst([], 'Geoportal Stadt Bern nicht erreichbar (HTTP 503)') })
    expect(k.werte['haltestelle.art']?.text).toBe('keine Haltestelle im Umkreis von 50 m (Geoportal Stadt Bern; Geoportal Stadt Bern nicht erreichbar (HTTP 503))')
  })
  it('Umkreis nicht ganz geladen bzw. Fehler: offen mit Hinweis; ohne Daten nichts', () => {
    const v = vor({ haltestellen: { ...hst([]), bereich: { mitte: lv(80, 0), radiusM: 100, form: 'quadrat' } } })
    expect(v.werte['haltestelle.art']).toBeUndefined()
    expect(v.feldHinweise!['haltestelle.art']).toContain('nicht ganz abgedeckt')
    const f = vor({ haltestellen: { fehler: 'OpenStreetMap nicht geladen' } })
    expect(f.werte['haltestelle.art']).toBeUndefined()
    expect(f.feldHinweise!['haltestelle.art']).toBe('Haltestellen konnten nicht geladen werden (OpenStreetMap nicht geladen)')
    const ohne = vor({})
    expect(ohne.werte['haltestelle.art']).toBeUndefined(); expect(ohne.werte.beduerfnis).toBeUndefined()
    expect(ohne.feldHinweise).toEqual({})
    expect(ohne).toEqual(vorbelegen(g, fallMit()))
  })
  it('Handeingabe überschreibt; im Befundblatt fallen die Haltestellen-Regeln mit «keine» weg', () => {
    const geo = { haltestellen: hst([]) }
    const ohne = befundblatt(g, fallMit(), { vorgabe: { bern: true, kantonBE: true } })
    const mit = befundblatt(g, fallMit(), { vorgabe: { bern: true, kantonBE: true }, geo })
    const d4 = (b: typeof ohne) => b.befund.alle.filter(x => /^D4/.test(x.id) && x.zustand === 'offen').map(x => x.id)
    expect(d4(ohne).length).toBeGreaterThan(0)
    expect(d4(mit)).toEqual([])
    expect(mit.gebildet.herkunft.get('haltestelle.art')).toMatchObject({ zustand: 'vorbelegt', quelle: 'geoportal' })
    const hand = fallMit(x => { x.bedarf = { felder: { 'haltestelle.art': { wert: 'fahrbahn', quelle: 'hand' } } } })
    const h = befundblatt(g, hand, { vorgabe: { bern: true, kantonBE: true }, geo })
    expect(h.gebildet.eingaben.haltestelle.wert?.art).toBe('fahrbahn')
    expect(h.gebildet.herkunft.get('haltestelle.art')).toMatchObject({ zustand: 'hand', vorbelegt: { wert: 'keine' } })
  })
})

describe('Vorbelegung: Strecke oder Zone (OSM-Tags der Zufahrten)', () => {
  it('Tags eines Wegs', () => {
    expect(zoneAusTags({ maxspeed: '30', 'zone:maxspeed': 'CH:zone30' })).toEqual({ wert: 't30_zone', text: 'Tempo-30-Zone (OSM) ⟦zone:maxspeed=CH:zone30⟧' })
    expect(zoneAusTags({ 'maxspeed:type': 'CH:zone20' })).toEqual({ wert: 'begegnungszone', text: 'Begegnungszone (OSM) ⟦maxspeed:type=CH:zone20⟧' })
    expect(zoneAusTags({ highway: 'living_street' })).toMatchObject({ wert: 'begegnungszone' })
    expect(zoneAusTags({ maxspeed: '50', 'source:maxspeed': 'CH:urban' })).toEqual({ wert: 'strecke', text: 'Strecke (OSM) ⟦source:maxspeed=CH:urban⟧' })
    expect(zoneAusTags({ maxspeed: 'CH:urban' })).toMatchObject({ wert: 'strecke' })
    expect(zoneAusTags({ maxspeed: '50' })).toEqual({ wert: 'strecke', text: 'Strecke (OSM: Tempo 50 ohne Zonenangabe) ⟦maxspeed=50⟧' })
    expect(zoneAusTags({ maxspeed: '30' })).toEqual({ wert: null, text: 'Tempo 30 in OSM ohne Zonenangabe ⟦weder zone:maxspeed noch maxspeed:type⟧' })
    expect(zoneAusTags({ maxspeed: '30', 'maxspeed:type': 'CH:zone30' })).toEqual({ wert: 't30_zone', text: 'Tempo-30-Zone (OSM) ⟦maxspeed:type=CH:zone30⟧' })
    expect(zoneAusTags({ highway: 'residential' })).toEqual({ wert: null, text: '' })
  })
  it('Zufahrten: gleich -> Wert; widersprüchlich bzw. teils ohne Angabe -> offen mit Hinweis; ohne Wege nichts', () => {
    const z30 = { 'zone:maxspeed': 'CH:zone30' }
    expect(zoneAusOsm([z30, z30])).toMatchObject({ wert: 't30_zone' })
    expect(zoneAusOsm([z30, { maxspeed: '50' }])).toMatchObject({ wert: null, text: expect.stringContaining('widersprüchlich') })
    expect(zoneAusOsm([z30, null])).toMatchObject({ wert: null, text: expect.stringContaining('nur ein Teil der Zufahrten') })
    expect(zoneAusOsm([{ maxspeed: '30' }])).toMatchObject({ wert: null, text: expect.stringContaining('Tempo 30 in OSM ohne Zonenangabe') })
    expect(zoneAusOsm([])).toEqual({ wert: null, text: '' })
  })
  it('in der Vorbelegung über die Weg-Ids der geraden Zufahrten', () => {
    expect(vor({ osmTags: new Map([[1, TAGS]]) }).werte.tempoRegime).toEqual({ wert: 'strecke', quelle: 'osm',
      text: 'Strecke (OSM: Tempo 50 ohne Zonenangabe) ⟦maxspeed=50⟧' })
    expect(vor({ osmTags: new Map([[1, { ...TAGS, maxspeed: '30', 'zone:maxspeed': 'CH:zone30' }]]) }).werte.tempoRegime)
      .toMatchObject({ wert: 't30_zone', quelle: 'osm' })
    const t30 = vor({ osmTags: new Map([[1, { ...TAGS, maxspeed: '30' }]]) })
    expect(t30.werte.tempoRegime).toBeUndefined()
    expect(t30.feldHinweise!.tempoRegime).toContain('ohne Zonenangabe')
    // Ohne Zonenangabe gilt ab 40 km/h die Strecke (Tempo aus der Rechnung, OSM maxspeed)
    expect(vor({ osmTags: new Map() }).werte.tempoRegime).toEqual({ wert: 'strecke', quelle: 'osm',
      text: 'Tempo 50 km/h: Strecke (eine Zone hat höchstens 30 km/h)' })
    expect(vor({}).werte.tempoRegime).toMatchObject({ wert: 'strecke', quelle: 'osm' })
  })
})

describe('Vorbelegung: DTV (Geoportal Stadt Bern)', () => {
  const linie = (id: string, y: number, dtv: number | null, x0 = -200, x1 = 200, strasse = 'Hauptstrasse'): VdLinie =>
    ({ id, strasse, dtv, teile: [[lv(x0, y), lv(x1, y)]], stand: '21.11.2025' })
  const vd = (linien: VdLinie[]): GeoVorbelegung => ({ verkehrsdaten: { linien, bereich: BEREICH } })
  it('Linie auf der Strassenachse: DTV mit Quelle und Stand', () => {
    const v = vor(vd([linie('a', 0, 1461)]))
    expect(v.werte.dtv).toMatchObject({ wert: 1461, quelle: 'geoportal',
      text: 'DTV 1461 Hauptstrasse (Geoportal Stadt Bern, 16·Nt + 8·Nn, Stand 21.11.2025)' })
  })
  it('Grenze zweier Abschnitte: höherer Wert; zwei Richtungsfahrbahnen: Summe', () => {
    const g2 = vor(vd([linie('a', 0, 1461, -200, 0), linie('b', 0, 1700, 0, 200)]))
    expect(g2.werte.dtv).toMatchObject({ wert: 1700 })
    expect(g2.werte.dtv.text).toContain('Grenze zweier Abschnitte (1461 bzw. 1700)')
    const s2 = vor(vd([linie('a', 3, 3000), linie('b', -3, 2500)]))
    expect(s2.werte.dtv).toMatchObject({ wert: 5500 })
    expect(s2.werte.dtv.text).toContain('Summe von 2 Fahrbahnen (2500 + 3000)')
  })
  it('Teilung knapp vor dem Streifen (S5): Äste ohne gemeinsamen Punkt auf der Querungsachse werden summiert; Grenze bleibt Maximum', () => {
    // Hauptlinie (1000) bis 6 m vor dem Rand des Streifens, dort Teilung in zwei Äste (540 bzw. 460), die die Querung 1 m auseinander kreuzen
    const ast = (id: string, y: number, dtv: number): VdLinie => ({ id, strasse: 'Hauptstrasse', dtv, stand: '21.11.2025',
      teile: [[lv(-RAND_X - 2, 0), lv(-RAND_X - 1.5, y), lv(200, y)]] })
    const haupt: VdLinie = { id: 'h', strasse: 'Hauptstrasse', dtv: 1000, stand: '21.11.2025', teile: [[lv(-200, 0), lv(-RAND_X - 2, 0)]] }
    const y = vor(vd([haupt, ast('a', 0.5, 540), ast('b', -0.5, 460)]))
    expect(y.werte.dtv).toMatchObject({ wert: 1000 })
    expect(y.werte.dtv.text).toMatch(/Summe von 2 Fahrbahnen \(460 \+ 540\)/)
    // gleiche Achse, Linie endet bzw. beginnt auf der Querung: Maximum
    const g2 = vor(vd([linie('a', 0, 460, -200, 0), linie('b', 0, 540, 0, 200)]))
    expect(g2.werte.dtv).toMatchObject({ wert: 540 })
    expect(g2.werte.dtv.text).toContain('Grenze zweier Abschnitte')
  })
  it('kein Eintrag: Annahme 500 (in den Annahmen des Befunds); Linie daneben bzw. ohne Nt/Nn: offen mit Hinweis', () => {
    const v = vor(vd([linie('q', 60, 9000)]))
    expect(v.werte.dtv).toMatchObject({ wert: DTV_ANNAHME, quelle: 'annahme',
      text: 'DTV 500 angenommen: keine Verkehrsdaten im Geoportal Stadt Bern (nur Strassen über 2000 Fz/Tag erfasst)' })
    const b = befundblatt(g, fallMit(), { vorgabe: { bern: true, kantonBE: true }, geo: vd([]) })
    expect(b.annahmen.join(' ')).toContain('DTV 500 angenommen')
    const n = vor(vd([linie('n', 6, 9000)]))
    expect(n.werte.dtv).toBeUndefined()
    expect(n.feldHinweise!.dtv).toContain('nicht über ihrer Achse')
    const o = vor(vd([linie('o', 0, null)]))
    expect(o.werte.dtv).toBeUndefined()
    expect(o.feldHinweise!.dtv).toContain('ohne Nt/Nn')
  })
  it('Layer nicht geladen bzw. ausserhalb Berns: offen, keine Annahme', () => {
    const f = vor({ verkehrsdaten: { fehler: 'HTTP 503' } })
    expect(f.werte.dtv).toBeUndefined()
    expect(f.feldHinweise!.dtv).toBe('Verkehrsdaten (Geoportal Stadt Bern) konnten nicht geladen werden (HTTP 503)')
    expect(vor({ verkehrsdaten: null }).werte.dtv).toBeUndefined()
    expect(vor({ verkehrsdaten: { linien: [], bereich: { mitte: lv(140, 0), radiusM: 150, form: 'quadrat' } } }).werte.dtv).toBeUndefined()
  })
  it('Handeingabe überschreibt die Annahme', () => {
    const hand = fallMit(x => { x.bedarf = { felder: { dtv: { wert: 8000, quelle: 'hand' } } } })
    const b = befundblatt(g, hand, { vorgabe: { bern: true, kantonBE: true }, geo: vd([]) })
    expect(b.gebildet.eingaben.dtv).toEqual({ wert: 8000, quelle: 'hand' })
    expect(b.annahmen.join(' ')).not.toContain('DTV 500')
  })
})

describe('Vorbelegung: Beleuchtung nur als Hinweis (Feld bleibt offen)', () => {
  const SLG = 'Beleuchtung der Querenden vor Ort prüfen (Richtlinie SLG 202 der Schweizer Licht Gesellschaft)'
  const lampen = (...d: number[]) => ({ punkte: d.map(x => lv(RAND_X + x, 0)), bereich: { mitte: O, radiusM: 100, form: 'kreis' as const } })
  it('Lampe 14 und 15 m: an der Querung; 16 m: nächste Lampe; über 25 m: keine', () => {
    for (const d of [14, 15]) expect(vor({ lampen: lampen(d, 40) }).feldHinweise!.beleuchtung)
      .toBe(`Strassenlampe ${d} m vom Streifen (OSM); ${SLG}`)
    expect(vor({ lampen: lampen(16) }).feldHinweise!.beleuchtung).toBe(`nächste Strassenlampe 16 m vom Streifen (OSM); ${SLG}`)
    expect(vor({ lampen: lampen(26) }).feldHinweise!.beleuchtung).toBe('eine Lampe nahe der Querung ist in OSM nicht eingetragen (OSM oft unvollständig)')
    for (const d of [14, 16, 26]) expect(vor({ lampen: lampen(d) }).werte.beleuchtung).toBeUndefined()
  })
  it('lit=yes bzw. lit=no an den Zufahrten; keine Daten: kein Hinweis', () => {
    expect(vor({ osmTags: new Map([[1, { ...TAGS, lit: 'yes' }]]) }).feldHinweise!.beleuchtung)
      .toBe('laut OSM ist die Strasse beleuchtet ⟦lit=yes⟧; vor Ort prüfen')
    const nein = vor({ osmTags: new Map([[1, { ...TAGS, lit: 'no' }]]), lampen: lampen(5) })
    // «vor Ort prüfen» nur einmal (Nachprüfung)
    expect(nein.feldHinweise!.beleuchtung).toBe(`laut OSM ist die Strasse nicht beleuchtet ⟦lit=no⟧; Strassenlampe 5 m vom Streifen (OSM); ${SLG}`)
    expect(nein.werte.beleuchtung).toBeUndefined()
    expect(vor({ osmTags: new Map([[1, TAGS]]) }).feldHinweise!.beleuchtung).toBeUndefined()
    expect(vor({ lampen: { punkte: [], bereich: { mitte: lv(90, 0), radiusM: 100, form: 'kreis' } } }).feldHinweise!.beleuchtung).toBeUndefined()
  })
})

describe('Fall-Datei: neue Quellen', () => {
  it('Quellenangaben Haltestellen und Verkehrsdaten werden geschrieben und gelesen; alte Fälle laden ohne sie', () => {
    const f = fallMit(x => { x.quellen = { osm: 'overpass.osm.ch', haltestellen: 'Geodaten Stadt Bern, Haltestellen',
      verkehrsdaten: 'Geodaten Stadt Bern, Flächendeckende Verkehrsdaten' } })
    const [g2, h] = fallLesen(fallSchreiben(f))
    expect(h).toEqual([])
    expect(g2.quellen).toMatchObject({ haltestellen: 'Geodaten Stadt Bern, Haltestellen', verkehrsdaten: 'Geodaten Stadt Bern, Flächendeckende Verkehrsdaten' })
    const alt = JSON.parse(fallSchreiben(fallMit()))
    delete alt.quellen.haltestellen; delete alt.quellen.verkehrsdaten
    expect(fallLesen(JSON.stringify(alt))[1]).toEqual([])
    const falsch = JSON.parse(fallSchreiben(fallMit())); falsch.quellen.haltestellen = 5
    expect(fallLesen(JSON.stringify(falsch))[1]).toContain('Quelle «haltestellen» ungültig, übergangen')
  })
  it('Vorbelegung aus Geodaten wird nicht gespeichert; Quelle «geoportal» gilt nicht als Handeingabe', () => {
    const f = fallMit()
    const v = vorbelegen(g, f, [], { haltestellen: hst([]) })
    expect(v.werte['haltestelle.art']?.quelle).toBe('geoportal')
    expect(JSON.parse(fallSchreiben(f)).bedarf).toBeUndefined()
    const [b, h] = bedarfLesen({ felder: { dtv: { wert: 1461, quelle: 'geoportal' } } })
    expect(b).toBeNull()
    expect(h.join(' ')).toContain('Quelle "geoportal" ungültig')
  })
})


describe('E1b: Modell-DTV erst nach Bestätigung', () => {
  const modell = (dtv = 1234): NpvmSnapshot => ({ version: 1, quelleId: 'are.npvm', bezugsjahr: 2023, datenstand: '2023-06-30',
    datenstandQuelle: NPVM_METADATEN_URL, abgerufen: '2026-11-01T20:00:00.000Z', mitte: O, radiusM: 200,
    url: npvmUrl(...ll(0, 0)), vollstaendigkeit: 'unbekannt', linien: [{ id: 'npvm:1', nr: 1, dtv, teile: [[lv(-100, 0), lv(100, 0)]] }] })
  it('unbestätigte Modellwerte erzeugen weder Regel-DTV noch abhängige Verkehrsannahmen', () => {
    const v = vor({ npvm: modell(), osm: OSM })
    expect(v.werte.dtv).toMatchObject({ wert: 1234, quelle: 'vorschlag', bestaetigungNoetig: true })
    expect(v.werte.dtv.npvmBeleg?.nr).toBe(1)
    expect(eingabenBilden(v.werte, undefined).eingaben.dtv.wert).toBeNull()
    expect(v.werte.mivKlasse).toBeUndefined()
    expect(v.werte.starkBelastet).toBeUndefined()
    expect(v.werte['q3.dtvEinm']).toBeUndefined()
  })
  it('Bestätigung übernimmt den Modellwert; eigene bzw. bestätigte Werte bleiben auch nach neuem Abruf erhalten', () => {
    const f = fallMit(x => { x.bedarf = { felder: { dtv: { wert: 2400, quelle: 'bestaetigt' } } } })
    const v = vor({ npvm: modell(12000), osm: OSM }, f)
    expect(eingabenBilden(v.werte, f.bedarf).eingaben.dtv.wert).toBe(2400)
    expect(v.feldHinweise?.dtv).toContain('bleibt erhalten')
    expect(v.werte.mivKlasse?.wert).toBe('tief')
    expect(v.werte.mivKlasse?.text.replace(/\s/g, '')).toContain('2400')
    expect(v.werte.starkBelastet?.wert).toBe(false)
  })
  it('passende Berner Verkehrsdaten haben Vorrang; aus fehlendem Modellnetz entsteht kein DTV Null', () => {
    const v = vor({ npvm: modell(), osm: OSM, verkehrsdaten: { linien: [{ id: 'bern:1', strasse: 'Hauptstrasse', dtv: 5000,
      stand: null, teile: [[lv(-100, 0), lv(100, 0)]] }], bereich: BEREICH } })
    expect(v.werte.dtv).toMatchObject({ wert: 5000, quelle: 'geoportal' })
    expect(v.werte.dtv.bestaetigungNoetig).toBeUndefined()
    expect(v.werte.dtv.quellenOptionen?.map(o => [o.id, o.wert])).toEqual([['bern.dtv', 5000], ['are.npvm', 1234]])
    const option = v.werte.dtv.quellenOptionen!.find(o => o.id === 'are.npvm')!
    const block = quellenWahlSetzen(undefined, 'dtv', option)!
    expect(block.felder.dtv).toMatchObject({ wert: 1234, quelle: 'bestaetigt', datenquelle: { id: 'are.npvm' }, npvmBeleg: { nr: 1 } })
    const f = fallMit(x => { x.bedarf = block })
    const neu = vor({ npvm: modell(9999), osm: OSM }, f)
    expect(eingabenBilden(neu.werte, block).eingaben.dtv.wert).toBe(1234)
    const geladen = fallLesen(fallSchreiben(f))
    expect(geladen[0].bedarf?.felder.dtv).toEqual(block.felder.dtv)
    const lokal = quellenWahlSetzen(block, 'dtv', v.werte.dtv.quellenOptionen![0])!
    expect(lokal.felder.dtv.wert).toBe(5000)
    expect(lokal.felder.dtv.npvmBeleg).toBeUndefined()
    expect(v.feldHinweise?.dtv).toContain('hat Vorrang')
    const leer = modell(); leer.linien = []
    expect(vor({ npvm: leer, osm: OSM }).werte.dtv).toBeUndefined()
  })
})


describe('Quellenauswahl je Feld', () => {
  it('Tempo aus Bern und OSM separat, Auswahl ändert die Regel-Eingabe und bleibt gespeichert', () => {
    const v = vor({ osm: OSM, vsig: { bereich: BEREICH, linien: [{ id: 'v1', strasse: 'Hauptstrasse', vSig: 30, vAfu: null,
      teile: [[lv(-100, 0), lv(100, 0)]] }] } })
    const optionen = v.werte.vSig.quellenOptionen!
    expect(optionen.map(q => [q.id, q.wert])).toEqual([['bern.vsig', 30], ['osm.tempo', 50]])
    expect(eingabenBilden(v.werte, undefined).eingaben.vSig.wert).toBe(30)
    const b = quellenWahlSetzen(undefined, 'vSig', optionen[1])!
    const f = fallMit(x => { x.bedarf = b })
    const geladen = fallLesen(fallSchreiben(f))[0]
    expect(geladen.bedarf?.felder.vSig.datenquelle?.id).toBe('osm.tempo')
    expect(eingabenBilden(v.werte, geladen.bedarf).eingaben.vSig.wert).toBe(50)
    expect(eingabenBilden(v.werte, geladen.bedarf).herkunft.get('vSig')?.text).toContain('OpenStreetMap')
  })
  it('Haltestellen aus Bern und BAV werden unabhängig ausgewertet; keine BAV-Busbucht oder negative Inventaraussage', () => {
    const bav: NonNullable<GeoVorbelegung['bav']> = { version: 1, quelleId: 'bav.halt', abgerufen: '2026-11-01T20:00:00.000Z',
      datenstand: '2026-11-01', mitte: O, radiusM: 200, url: 'https://example.invalid', vollstaendigkeit: 'unbekannt',
      halte: [{ id: 'b1', nummer: '8500001', name: 'BAV Beispielplatz', p: halt(10).p, art: 'bus_tram' }] }
    const v = vor({ haltestellen: hst([]), bav })
    const angrenzend = v.werte.haltestelleAngrenzend.quellenOptionen!
    expect(angrenzend.map(q => [q.id, q.wert])).toEqual([['bern.halt', false], ['bav.halt', true]])
    expect(eingabenBilden(v.werte, undefined).eingaben.haltestelleAngrenzend.wert).toBe(false)
    const b = quellenWahlSetzen(undefined, 'haltestelleAngrenzend', angrenzend[1])!
    expect(eingabenBilden(v.werte, b).eingaben.haltestelleAngrenzend.wert).toBe(true)
    expect(fallLesen(fallSchreiben(fallMit(f => { f.bedarf = b })))[0].bedarf?.felder.haltestelleAngrenzend.datenquelle?.id).toBe('bav.halt')
    expect(v.werte['haltestelle.art'].quellenOptionen).toBeUndefined()
    const leer = vor({ haltestellen: hst([]), bav: { ...bav, halte: [] } })
    expect(leer.werte.haltestelleAngrenzend.quellenOptionen?.find(q => q.id === 'bav.halt')?.wert).toBeNull()
    expect(quellenWahlSetzen(b, 'haltestelleAngrenzend', leer.werte.haltestelleAngrenzend.quellenOptionen![1])).toBe(b)
  })
  it('liest nur zum Feld passende bestätigte Quellen; fehlerhafte Herkunft verwirft keine eigene Eingabe', () => {
    const [b, h] = bedarfLesen({ felder: { vSig: { wert: 30, quelle: 'bestaetigt', datenquelle: { id: 'are.npvm', text: 'falsch' } } } })
    expect(b?.felder.vSig).toEqual({ wert: 30, quelle: 'bestaetigt' })
    expect(h.join()).toContain('Datenquelle ungültig')
  })
})


describe('E2: Zürich durchgängig in Bedarf, Sicht und Fall-Datei', () => {
  const zh = (tempo = 30, art: 't30_zone' | 'begegnungszone' = 't30_zone'): ZuerichSnapshot => ({ version: 1, mitte: O, radiusM: 200,
    tempo: { objekte: [{ id: 'view_geoserver_tempo_ist.1', name: 'Hauptstrasse', regime: `T${tempo}`, code: `T${tempo}`, umgesetzt: null,
      rechtskraeftig: null, teile: [[lv(-180, 0), lv(180, 0)]], tempo, verbot: false, ausnahmen: '', signal: '' }], datenstand: '2026-11-02',
      url: zhUrl('tempo', O), metadaten: zhMetadatenUrl('tempo'), abgerufen: '2026-11-02T07:00:00.000Z' },
    zonen: { objekte: [{ id: 'view_geoserver_zonen_ist.1', name: 'Beispielzone', regime: art === 't30_zone' ? 'T30-Zone' : 'Begegnungszone',
      code: art === 't30_zone' ? 'T30' : 'T20', art, umgesetzt: null, rechtskraeftig: null, polygone: [[rechteck(-180, -30, 180, 30).concat([lv(-180, -30)])]] }],
      datenstand: '2026-11-02', url: zhUrl('zonen', O), metadaten: zhMetadatenUrl('zonen'), abgerufen: '2026-11-02T07:00:00.000Z' } })
  it('amtliche, passende Quellen haben Vorrang vor OSM; Innerortslage wird nicht aus dem Zahlenwert belegt', () => {
    const z = zh(), v = vor({ osm: OSM, osmTags: new Map([[1, TAGS]]), zuerich: z })
    expect(v.werte.vSig).toMatchObject({ wert: 30, quelle: 'amtlich' })
    expect(v.werte.tempoRegime).toMatchObject({ wert: 't30_zone', quelle: 'amtlich' })
    expect(v.werte.innerorts).toBeUndefined()
    expect(v.werte.vSig.quellenOptionen?.map(q => q.id)).toEqual(['zh.tempo', 'osm.tempo'])
    const am = vsigTempo({ linien: [], zuerich: z, zhStrassen: zhStrassen(OSM.wege) })
    const rr = rechneFall(OSM, AV, [], 12, fallMit(), null, null, null, am, null, z)
    expect(rr.streifen[0].zufahrten.every(x => x.tempo === 30 && x.tempoQuelle === 'Stadt Zürich')).toBe(true)
    const f = fallMit(x => { x.zuerich = z; x.bedarf = quellenWahlSetzen(undefined, 'vSig', v.werte.vSig.quellenOptionen![0]) })
    expect(JSON.parse(fallSchreiben(f)).version).toBe(9)
    expect(fallLesen(fallSchreiben(f))[0].zuerich).toEqual(z)
    expect(fallLesen(fallSchreiben(f))[0].bedarf?.felder.vSig.datenquelle?.id).toBe('zh.tempo')
  })
  it('amtliche Linien-/Zonenkonflikte bleiben offen; eine ausdrückliche OSM-Auswahl zählt, eigene Werte bleiben erhalten', () => {
    const v = vor({ osm: OSM, osmTags: new Map([[1, TAGS]]), zuerich: zh(50) })
    expect(v.werte.vSig.wert).toBeNull(); expect(v.werte.tempoRegime.wert).toBeNull()
    const h = quellenWahlSetzen(undefined, 'vSig', v.werte.vSig.quellenOptionen![1])!
    expect(eingabenBilden(v.werte, h).eingaben.vSig.wert).toBe(50)
    expect(eingabenBilden(v.werte, { felder: { vSig: { wert: 40, quelle: 'hand' } } }).eingaben.vSig.wert).toBe(40)
    const ohneZone = zh(); ohneZone.zonen!.objekte = []
    const leer = vor({ osm: OSM, zuerich: ohneZone })
    expect(leer.werte.tempoRegime).toMatchObject({ wert: 'strecke', bestaetigungNoetig: true })
    expect(eingabenBilden(leer.werte, null).eingaben.tempoRegime.wert).toBeNull()
  })
  it('unmarkierte Querung in amtlicher Begegnungszone rechnet mit Vortritt und Anhaltesicht; Handwahl bleibt vorrangig', () => {
    const z = zh(20, 'begegnungszone'), o = structuredClone(OSM); o.uebergaenge[0].tags = { highway: 'crossing', crossing: 'unmarked' }
    const am = vsigTempo({ linien: [], zuerich: z, zhStrassen: zhStrassen(o.wege) })
    const r = rechneFall(o, AV, [], 12, fallMit(), null, null, null, am, null, z)
    expect(r.streifen[0].querung?.typ).toBe('begegnungszone')
    expect(r.streifen[0].zufahrten.every(x => x.tempo === 20 && x.sichtweite === 15)).toBe(true)
    const f = fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: 'strecke', quelle: 'hand' } } } })
    expect(rechneFall(o, AV, [], 12, f, null, null, null, am, null, z).streifen[0].querung?.typ).not.toBe('begegnungszone')
  })
})


describe('Bern bleibt trotz zusätzlicher Quellen unverändert', () => {
  const punktRoh = (properties: Record<string,unknown>) => ({ type:'FeatureCollection',crs:{properties:{name:'EPSG:2056'}},features:[{type:'Feature',id:'test',properties,geometry:{type:'Point',coordinates:O}}] })
  const teil = (id:string, objekte:RegionalObjekt[], roh:unknown={}):RegionalTeil => ({id,objekte,roh,url:regionalUrl(regionalDienst(id)!,O),abgerufen:'2026-11-03T12:00:00Z',datenstand:'03.11.2026'})
  const bedarf = [
    ['bedarf.be.schule',{STONAME:'Testschule'}],
    ['bedarf.be.kita',{NAME:'Testkita',ART_CODE:'kita'}],
    ['bedarf.be.spital',{BEZ_FIRMA:'Testspital',AKUT:1}],
    ['bedarf.be.heim',{INAME:'Testheim',ALTERSHEIM:1}],
    ['bedarf.be.behinderung',{INAME:'Testwohnheim',WHEIMEMB:1}],
  ].map(([id,p]) => { const roh=punktRoh(p as Record<string,unknown>);return teil(id as string,regionalLesen(regionalDienst(id as string)!,roh),roh) })
  const objekt = (id:string, x:Partial<RegionalObjekt>):RegionalObjekt => ({id,name:'Test',tempo:null,zone:null,bestaetigen:false,stand:null,hinweis:'Testquelle',...x})
  const bund = [
    teil('bund.bauzone',[objekt('bauzone',{bund:{typ:'bauzone'},polygone:[[rechteck(-100,-100,100,100)]]})]),
    teil('bund.unfaelle',[objekt('unfall',{bund:{typ:'unfall'},punkte:[O]})]),
  ]
  const kontext = [teil('e6.zh.licht',[objekt('leuchte',{kontext:'lampe',punkte:[O]})])]
  const snapshot = (teile:RegionalTeil[]):RegionalSnapshot => ({version:1,mitte:O,radiusM:200,teile})
  const basis:GeoVorbelegung = {av:AV,osm:OSM,osmTags:new Map([[1,TAGS]]),schulen:{
    bern:{volksschulen:[],kindergaerten:[],weitere:[],bereich:BEREICH},osm:{orte:[],bereich:{...BEREICH,radiusM:300}},
  }}
  const wirksam = (v:ReturnType<typeof vorbelegen>,f:Fall) => {
    const e=eingabenBilden(v.werte,f.bedarf).eingaben
    return {beduerfnis:e.beduerfnis,innerorts:e.innerorts,bestaetigung:Object.fromEntries(['beduerfnis','innerorts'].map(p => [p,!!v.werte[p]?.bestaetigungNoetig]))}
  }
  it.each([['Bundesquellen',bund],['BE-Inventare',bedarf],['nur E6',kontext],['alle zusammen',[...bund,...bedarf,...kontext]]] as const)('%s ändern weder wirksame Werte noch Bestätigungspflichten', (_name,teile) => {
    const f=fallMit(),ohne=vor(basis,f),mit=vor({...basis,regional:snapshot([...teile])},f)
    expect(wirksam(ohne,f).innerorts).toMatchObject({wert:true,quelle:'annahme'})
    expect(wirksam(mit,f)).toEqual(wirksam(ohne,f))
    expect(mit.werte.beduerfnis?.quellenOptionen?.some(q=>q.id.startsWith('regional.bedarf.be.'))??false).toBe(false)
    if(teile.some(t=>t.id==='bund.bauzone'))expect(mit.werte.innerorts.quellenOptionen?.some(q=>String(q.id)==='regional.bund.bauzone')).toBe(true)
  })
  it.each(['hand','bestaetigt'] as const)('zusätzliche Quellen überschreiben keine %s-Eingabe',quelle=>{
    const f=fallMit(x=>{x.bedarf={felder:{innerorts:{wert:false,quelle},beduerfnis:{wert:['haltestelle'],quelle}}}})
    const mit=vor({...basis,regional:snapshot([...bund,...bedarf,...kontext])},f)
    expect(wirksam(mit,f).innerorts).toEqual({wert:false,quelle})
    expect(wirksam(mit,f).beduerfnis).toEqual({wert:['haltestelle'],quelle})
  })
  it('gespeicherte BE-Rohdaten dürfen beim Wiederlesen in Bern keinen zusätzlichen Bedarf belegen',()=>{
    const f=fallMit(x=>{x.regional=snapshot(bedarf)})
    const [geladen,hinweise]=fallLesen(fallSchreiben(f))
    expect(hinweise).toEqual([]);expect(geladen.regional!.teile).toHaveLength(5)
    expect(geladen.regional!.teile.every(t=>t.objekte.some(o=>o.bedarf))).toBe(true)
    expect(wirksam(vor({...basis,regional:geladen.regional},geladen),geladen)).toEqual(wirksam(vor(basis,geladen),geladen))
  })
  it('ohne verlässliche Ortsangabe wird die ausgeschlossene Quelle nicht automatisch wirksam; in Köniz bleiben positive Treffer nutzbar',()=>{
    const s=snapshot(bedarf),f=fallMit()
    const unbekannt=vor({osm:OSM,regional:s},f)
    expect(eingabenBilden(unbekannt.werte,f.bedarf).eingaben.beduerfnis.wert).toBeNull()
    const avKoeniz=AV.map(a=>({...a,bfs:355}))
    const koeniz=vor({...basis,av:avKoeniz,schulen:null,regional:s},f)
    expect(new Set(eingabenBilden(koeniz.werte,f.bedarf).eingaben.beduerfnis.wert ?? [])).toEqual(new Set(['schule','kindergarten','heim']))
  })
  it('ARE bleibt neben einer bisherigen Innerortsannahme eine Option; A3 und die Kurvenvoraussetzung ändern sich nicht',()=>{
    const mitKurve=structuredClone(g),z=mitKurve.streifen[0].zufahrten[0]
    const spur:P[]=[]
    for(let x=0;x<=8;x++)spur.push(lv(-x,0))
    for(let grad=1;grad<=75;grad++){const a=(90+grad)*Math.PI/180;spur.push(lv(-8+20*Math.cos(a),-20+20*Math.sin(a)))}
    z.spur=spur;z.sichtpunkte=[spur[0],spur[10]];z.sichtweite=80;z.geprueftBisM=80;z.tempo=50;z.tempoQuelle='OSM'
    const f=fallMit(x=>{x.bedarf={felder:{v85:{wert:60,quelle:'hand'}}}})
    const a=befundblatt(mitKurve,f,{vorgabe:{bern:true,kantonBE:true},geo:basis})
    const b=befundblatt(mitKurve,f,{vorgabe:{bern:true,kantonBE:true},geo:{...basis,regional:snapshot(bund)}})
    expect(a.vorbelegt.werte['kurve.b1Innerorts50']).toMatchObject({wert:true})
    expect(b.vorbelegt.werte['kurve.b1Innerorts50']).toEqual(a.vorbelegt.werte['kurve.b1Innerorts50'])
    expect(b.gebildet.eingaben.innerorts).toEqual(a.gebildet.eingaben.innerorts)
    const regeln=(x:typeof a)=>x.befund.alle.filter(e=>e.id==='A3')
    expect(regeln(a)).toHaveLength(1);expect(regeln(b)).toEqual(regeln(a))
    expect(b.vorbelegt.werte.innerorts.bestaetigungNoetig).toBeUndefined()
    expect(b.vorbelegt.werte.innerorts.quellenOptionen?.some(q=>String(q.id)==='regional.bund.bauzone')).toBe(true)
  })
  it('ein regionales Tempoinventar ohne Treffer am geprüften Ort sperrt die bisherige Ableitung nicht',()=>{
    const t=teil('ge.tempo',[objekt('tempo',{name:'Hauptstrasse',tempo:30,teile:[[lv(-100,80),lv(100,80)]]})])
    expect(vor({...basis,regional:snapshot([t])}).werte.innerorts).toEqual(vor(basis).werte.innerorts)
  })
  it('ein Zürcher Ausschnitt ausserhalb des Prüforts sperrt die bisherige Ableitung nicht',()=>{
    const zuerich:ZuerichSnapshot={version:1,mitte:lv(1000,1000),radiusM:200}
    expect(vor({...basis,zuerich}).werte.innerorts).toEqual(vor(basis).werte.innerorts)
  })
  it('tatsächlich zugeordnetes regionales Tempo bleibt kein Innerortsbeleg; Hinweis nennt den tatsächlichen Anbieter',()=>{
    const t=teil('ge.tempo',[objekt('tempo',{name:'Hauptstrasse',tempo:30,teile:[[lv(-100,0),lv(100,0)]]})])
    const v=vor({...basis,regional:snapshot([t])})
    expect(v.werte.vSig).toMatchObject({wert:30,quelle:'amtlich'})
    expect(v.werte.innerorts).toBeUndefined()
    expect(v.feldHinweise?.innerorts).toContain('SITG, Canton de Genève')
    expect(v.feldHinweise?.innerorts).not.toContain('Zürcher')
  })
})


it('der Innerortshinweis nennt auch die amtliche Quelle aus der Sichtprüfung',()=>{
  const gruppe=structuredClone(g)
  for(const st of gruppe.streifen)for(const z of st.zufahrten)z.tempoQuelle='Geodaten Basel-Stadt'
  const v=vorbelegen(gruppe,fallMit(),[],{osm:OSM,osmTags:new Map([[1,TAGS]])})
  expect(v.werte.vSig.quelle).toBe('amtlich')
  expect(v.werte.innerorts).toBeUndefined()
  expect(v.feldHinweise?.innerorts).toContain('Geodaten Basel-Stadt')
})

it('ein Zürcher Ausschnitt ohne Tempo-Treffer am Ort sperrt keine bisherige Innerortsableitung',()=>{
  const f=fallMit(),geo:GeoVorbelegung={osm:OSM,osmTags:new Map([[1,TAGS]])}
  const zuerich:ZuerichSnapshot={version:1,mitte:O,radiusM:200,tempo:{objekte:[],datenstand:'03.11.2026',url:zhUrl('tempo',O),metadaten:zhMetadatenUrl('tempo'),abgerufen:'2026-11-03T12:00:00Z'}}
  const ohne=vor(geo,f),mit=vor({...geo,zuerich},f)
  expect(mit.werte.innerorts).toEqual(ohne.werte.innerorts)
  // Die bestehende offene Tempozuordnung wird dadurch nicht zu einem erfolgreich geladenen Tempowert umgedeutet.
  expect(mit.werte.vSig.wert).toBeNull()
  expect(mit.feldHinweise?.vSig).toContain('kein passender amtlicher Tempoabschnitt')
})
