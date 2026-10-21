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
import { bedarfLesen, eingabenBilden } from './fallBedarf'

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

describe('Vorbelegung: Bushaltestelle (Umkreis 50 m um den Streifen)', () => {
  it('Abstand zum Umriss des Streifens, nicht zum Ladeort', () => {
    expect(abstandZumStreifen(lv(RAND_X + 23, 0), s)).toBeCloseTo(23, 6)
    expect(abstandZumStreifen(lv(0, 0), s)).toBe(0)
  })
  it('keine Haltestelle im Umkreis: «keine» mit Quelle und Herkunft; Grund bleibt offen', () => {
    const v = vor({ haltestellen: hst([halt(51)]) })
    expect(v.werte['haltestelle.art']).toEqual({ wert: 'keine', quelle: 'geoportal', text: 'keine Haltestelle im Umkreis von 50 m (Geoportal Stadt Bern)' })
    expect(v.werte.beduerfnis).toBeUndefined()
    expect(eingabenBilden(v.werte, null).eingaben.haltestelle.wert).toEqual({ art: null, lage: null, verdeckt: null, ueberholenUnterbunden: null })
    const o = vor({ haltestellen: { quelle: 'osm', herkunft: 'OSM', halte: [], bereich: { mitte: O, radiusM: 150, form: 'kreis' } } })
    expect(o.werte['haltestelle.art']).toMatchObject({ wert: 'keine', quelle: 'osm', text: 'keine Haltestelle im Umkreis von 50 m (OSM)' })
  })
  it('49 und 50 m: Art offen mit Hinweis ohne Wert, Grund «Haltestelle» mit Quelle der Daten (keine Annahme, M5); 51 m: «keine»', () => {
    for (const d of [49, 50]) {
      const v = vor({ haltestellen: hst([halt(80, 'Fernplatz'), halt(d)]) })
      expect(v.werte['haltestelle.art']).toBeUndefined()
      expect(v.feldHinweise!['haltestelle.art']).toBe(`Haltestelle «Beispielplatz, Kante A», ${d} m (Geoportal Stadt Bern): Fahrbahnhaltestelle oder Busbucht wählen`)
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
    expect(v.feldHinweise!['haltestelle.art']).toMatch(/^Tramhaltestelle «Beispielplatz, Kante A», 10 m \(OSM; Geoportal Stadt Bern nicht erreichbar \(HTTP 503\)\)/)
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
    expect(zoneAusTags({ maxspeed: '30', 'zone:maxspeed': 'CH:zone30' })).toEqual({ wert: 't30_zone', text: 'Tempo-30-Zone (OSM zone:maxspeed=CH:zone30)' })
    expect(zoneAusTags({ 'maxspeed:type': 'CH:zone20' })).toEqual({ wert: 'begegnungszone', text: 'Begegnungszone (OSM maxspeed:type=CH:zone20)' })
    expect(zoneAusTags({ highway: 'living_street' })).toMatchObject({ wert: 'begegnungszone' })
    expect(zoneAusTags({ maxspeed: '50', 'source:maxspeed': 'CH:urban' })).toEqual({ wert: 'strecke', text: 'Strecke (OSM source:maxspeed=CH:urban)' })
    expect(zoneAusTags({ maxspeed: 'CH:urban' })).toMatchObject({ wert: 'strecke' })
    expect(zoneAusTags({ maxspeed: '50' })).toEqual({ wert: 'strecke', text: 'Strecke (OSM maxspeed=50 ohne Zonenangabe)' })
    expect(zoneAusTags({ maxspeed: '30' })).toEqual({ wert: null, text: 'Tempo 30 in OSM ohne Angabe zur Zone (weder zone:maxspeed noch maxspeed:type)' })
    expect(zoneAusTags({ maxspeed: '30', 'maxspeed:type': 'CH:zone30' })).toEqual({ wert: 't30_zone', text: 'Tempo-30-Zone (OSM maxspeed:type=CH:zone30)' })
    expect(zoneAusTags({ highway: 'residential' })).toEqual({ wert: null, text: '' })
  })
  it('Zufahrten: gleich -> Wert; widersprüchlich bzw. teils ohne Angabe -> offen mit Hinweis; ohne Wege nichts', () => {
    const z30 = { 'zone:maxspeed': 'CH:zone30' }
    expect(zoneAusOsm([z30, z30])).toMatchObject({ wert: 't30_zone' })
    expect(zoneAusOsm([z30, { maxspeed: '50' }])).toMatchObject({ wert: null, text: expect.stringContaining('widersprüchlich') })
    expect(zoneAusOsm([z30, null])).toMatchObject({ wert: null, text: expect.stringContaining('nur ein Teil der Zufahrten') })
    expect(zoneAusOsm([{ maxspeed: '30' }])).toMatchObject({ wert: null, text: expect.stringContaining('Tempo 30 in OSM ohne Angabe zur Zone') })
    expect(zoneAusOsm([])).toEqual({ wert: null, text: '' })
  })
  it('in der Vorbelegung über die Weg-Ids der geraden Zufahrten', () => {
    expect(vor({ osmTags: new Map([[1, TAGS]]) }).werte.tempoRegime).toEqual({ wert: 'strecke', quelle: 'osm',
      text: 'Strecke (OSM maxspeed=50 ohne Zonenangabe)' })
    expect(vor({ osmTags: new Map([[1, { ...TAGS, maxspeed: '30', 'zone:maxspeed': 'CH:zone30' }]]) }).werte.tempoRegime)
      .toMatchObject({ wert: 't30_zone', quelle: 'osm' })
    const t30 = vor({ osmTags: new Map([[1, { ...TAGS, maxspeed: '30' }]]) })
    expect(t30.werte.tempoRegime).toBeUndefined()
    expect(t30.feldHinweise!.tempoRegime).toContain('ohne Angabe zur Zone')
    expect(vor({ osmTags: new Map() }).werte.tempoRegime).toBeUndefined()
    expect(vor({}).werte.tempoRegime).toBeUndefined()
  })
})

describe('Vorbelegung: DTV (Geoportal Stadt Bern)', () => {
  const linie = (id: string, y: number, dtv: number | null, x0 = -200, x1 = 200, strasse = 'Hauptstrasse'): VdLinie =>
    ({ id, strasse, dtv, teile: [[lv(x0, y), lv(x1, y)]], stand: '21.11.2025' })
  const vd = (linien: VdLinie[]): GeoVorbelegung => ({ verkehrsdaten: { linien, bereich: BEREICH } })
  it('Linie auf der Strassenachse: DTV mit Quelle und Stand', () => {
    const v = vor(vd([linie('a', 0, 1461)]))
    expect(v.werte.dtv).toEqual({ wert: 1461, quelle: 'geoportal',
      text: 'DTV 1 461 Hauptstrasse (Geoportal Stadt Bern, 16·Nt + 8·Nn, Stand 21.11.2025)' })
  })
  it('Grenze zweier Abschnitte: höherer Wert; zwei Richtungsfahrbahnen: Summe', () => {
    const g2 = vor(vd([linie('a', 0, 1461, -200, 0), linie('b', 0, 1700, 0, 200)]))
    expect(g2.werte.dtv).toMatchObject({ wert: 1700 })
    expect(g2.werte.dtv.text).toContain('Grenze zweier Abschnitte (1 461 bzw. 1 700)')
    const s2 = vor(vd([linie('a', 3, 3000), linie('b', -3, 2500)]))
    expect(s2.werte.dtv).toMatchObject({ wert: 5500 })
    expect(s2.werte.dtv.text).toContain('Summe von 2 Fahrbahnen (2 500 + 3 000)')
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
    expect(v.werte.dtv).toEqual({ wert: DTV_ANNAHME, quelle: 'annahme',
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
  const lampen = (...d: number[]) => ({ punkte: d.map(x => lv(RAND_X + x, 0)), bereich: { mitte: O, radiusM: 100, form: 'kreis' as const } })
  it('Lampe 14 und 15 m: an der Querung; 16 m: nächste Lampe; über 25 m: keine', () => {
    for (const d of [14, 15]) expect(vor({ lampen: lampen(d, 40) }).feldHinweise!.beleuchtung)
      .toBe(`Strassenlampe ${d} m vom Streifen (OSM); Beleuchtung der Querenden nach SLG 202 vor Ort prüfen`)
    expect(vor({ lampen: lampen(16) }).feldHinweise!.beleuchtung).toBe('nächste Strassenlampe 16 m vom Streifen (OSM); Beleuchtung der ' +
      'Querenden nach SLG 202 vor Ort prüfen')
    expect(vor({ lampen: lampen(26) }).feldHinweise!.beleuchtung).toBe('keine Lampe in OSM innerhalb 25 m (OSM oft unvollständig)')
    for (const d of [14, 16, 26]) expect(vor({ lampen: lampen(d) }).werte.beleuchtung).toBeUndefined()
  })
  it('lit=yes bzw. lit=no an den Zufahrten; keine Daten: kein Hinweis', () => {
    expect(vor({ osmTags: new Map([[1, { ...TAGS, lit: 'yes' }]]) }).feldHinweise!.beleuchtung)
      .toBe('Strasse in OSM als beleuchtet markiert (lit=yes); vor Ort prüfen')
    const nein = vor({ osmTags: new Map([[1, { ...TAGS, lit: 'no' }]]), lampen: lampen(5) })
    // «vor Ort prüfen» nur einmal (Nachprüfung)
    expect(nein.feldHinweise!.beleuchtung).toBe('Strasse in OSM als unbeleuchtet markiert (lit=no); Strassenlampe 5 m vom ' +
      'Streifen (OSM); Beleuchtung der Querenden nach SLG 202 vor Ort prüfen')
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
