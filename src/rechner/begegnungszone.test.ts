// Tests Querung in der Begegnungszone (Nutzerentscheid 30.10.2026): eine unmarkierte OSM-Querung ohne Wahl am Streifen in einer
// Begegnungszone (Strecke oder Zone wie im Bedarf: OSM living_street bzw. CH:zone20, Vorschlag bei Tempo 20, Widerspruch mit V_sig
// offen, Handeingabe im Bedarf geht vor) ist keine Querung ohne Vortritt; Soll je Zufahrt = Anhaltesichtweite (VSS 40 240 Z. 8.2),
// Abbieger höchstens bis zum Beginn des Abbiegens. Künstliche Strassen (keine echten Daten).
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall, type FallRechnung } from './index'
import { sollQuerung, quelleQuerung, quelleQuerungAbbiegen, QUELLE_BGZ, annahmeBgz } from './ohneVortritt'
import { QUELLE_TAB1_20, QUELLE_TAB1_UEBER60 } from './tempo'
import { ORTSLAGE_ANNAHME } from './pruefen'
import { ahs, AHS_40240 } from '../bedarf/tabellen'
import { leererFall, rechnungsSchluessel, type Fall } from '../fall'
import { befundblaetter, BGZ_SICHT_TEXT } from '../bedarf/befundblatt'
import { zusammenfassung, zfEingabeBlatt } from '../bedarf/zusammenfassung'
import { streifenArt, streifenTitel } from '../benennung'
import { sichtQuelleKurz } from '../texte'
import { QUERUNG_BGZ_TEXT } from '../daten/osm'
import type { VsigLinie } from '../daten/vsig'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [ring] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const UNMARKIERT = { highway: 'crossing', crossing: 'unmarked' }
/** gerade Strasse West–Ost (Fahrbahn 8 m), Übergang bei x = 0 */
const osm = (tags: Record<string, string>, uTags: Record<string, string> = UNMARKIERT): OsmDaten => ({
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { name: 'Hofgasse', ...tags })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: uTags, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
})
const AV = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const OHNE = { vorgabe: { bern: false, kantonBE: false } }
const LIVING = { highway: 'living_street', maxspeed: '20' }
const typ = (r: FallRechnung) => r.streifen.map(s => s.querung?.typ ?? 'fgs')
/** V_sig (Geoportal Stadt Bern) entlang der Strasse */
const vsig = (v: number) => ({ linien: [{ id: 'v1', strasse: 'Hofgasse', vSig: v, teile: [[lv(-300, 0), lv(300, 0)]] }] as VsigLinie[],
  bereich: { mitte: lv(0, 0), radiusM: 150, form: 'quadrat' as const } })

describe('Soll in der Begegnungszone: Anhaltesichtweite je Tempo', () => {
  it('sollQuerung = Tabelle AHS_40240 (ohne L), über 60 km/h der Wert für 60', () => {
    const o = { typ: 'begegnungszone' as const, L: 8, ganzeFahrbahn: false }
    for (const [v, sw] of Object.entries(AHS_40240)) expect(sollQuerung(o, Number(v))).toBe(sw)
    expect(sollQuerung(o, 80)).toBe(75)
    expect(quelleQuerung(o)).toBe(QUELLE_BGZ)
    expect(quelleQuerungAbbiegen(o, 55)).toBe('Annahme: bis Beginn des Abbiegens; Anhaltesichtweite nach VSS 40 240 Z. 8.2 wären 55 m')
    // ohne Vortritt unverändert: Formel mit L
    expect(sollQuerung({ typ: 'ohne_vortritt', L: 8, ganzeFahrbahn: false }, 30)).toBe(55.6)
    expect(sichtQuelleKurz(QUELLE_BGZ)).toBe('Begegnungszone, Anhaltesichtweite')
    expect(sichtQuelleKurz(quelleQuerungAbbiegen(o, 55))).toBe('Annahme: bis Beginn des Abbiegens; Anhaltesichtweite nach VSS 40 240 Z. 8.2 wären 55 m')
    expect(annahmeBgz([20, 20, 30])).toContain('20 km/h: 15 m; 30 km/h: 25 m')
  })
  it('Tempo der Zufahrt: OSM maxspeed 30 bzw. 50 an einer living_street -> 25 bzw. 55 m', () => {
    for (const v of [30, 50]) {
      const r = rechneFall(osm({ highway: 'living_street', maxspeed: String(v) }), AV, [], 12, fallMit(), null)
      expect(typ(r)).toEqual(['begegnungszone'])
      for (const z of r.streifen[0].zufahrten) expect([z.tempo, z.sichtweite, z.sichtweiteQuelle]).toEqual([v, ahs(v), QUELLE_BGZ])
    }
  })
})

describe('Begegnungszone bestimmt wie «Strecke oder Zone» im Bedarf', () => {
  it('highway=living_street: Querung in der Begegnungszone, Hinweis, Name «Querung», Annahme je Streifen', () => {
    const r = rechneFall(osm(LIVING), AV, [], 12, fallMit(), null)
    expect(r.streifen[0].querung).toEqual({ typ: 'begegnungszone', L: 8, ganzeFahrbahn: false })
    expect(r.hinweis).toBe('Unmarkierte Querung (OSM: crossing=unmarked) in der Begegnungszone (nach OSM): Vortritt Fussverkehr; ' +
      'Sichtweite = Anhaltesichtweite nach VSS 40 240 Z. 8.2. Eine andere Querungsart ist unter «Querung» wählbar.')
    expect(r.streifen[0].querungAnnahme).toBe(r.hinweis)
    expect(streifenTitel('12', [], streifenArt(r.streifen[0]))).toBe('Querung 12')
    expect(r.streifen[0].annahmen.some(a => a.startsWith('Querung in der Begegnungszone (Vortritt Fussverkehr)'))).toBe(true)
    expect(r.streifen[0].annahmen.some(a => a.startsWith('Querung ohne Vortritt'))).toBe(false)
    for (const z of r.streifen[0].zufahrten) expect([z.tempo, z.sichtweite, z.sichtweiteQuelle, z.erkennungM]).toEqual([20, 15, QUELLE_BGZ, undefined])
  })
  it('maxspeed:type=CH:zone20 (auch an einer tertiary): Begegnungszone', () => {
    const r = rechneFall(osm({ highway: 'tertiary', maxspeed: '20', 'maxspeed:type': 'CH:zone20' }), AV, [], 12, fallMit(), null)
    expect(typ(r)).toEqual(['begegnungszone'])
    expect(r.hinweis).toContain('in der Begegnungszone (nach OSM)')
  })
  it('Tempo 20 ohne Zonenangabe (OSM maxspeed=20 bzw. V_sig 20): Vorschlag Begegnungszone', () => {
    const r = rechneFall(osm({ highway: 'residential', maxspeed: '20' }), AV, [], 12, fallMit(), null)
    expect(typ(r)).toEqual(['begegnungszone'])
    expect(r.hinweis).toContain('in der Begegnungszone (Vorschlag bei Tempo 20 km/h)')
    const g = rechneFall(osm({ highway: 'residential' }), AV, [], 12, fallMit(), null, null, null, () => 20, vsig(20))
    expect(typ(g)).toEqual(['begegnungszone'])
    expect(g.streifen[0].zufahrten.map(z => [z.tempo, z.tempoQuelle, z.sichtweite])).toEqual([[20, 'Geoportal', 15], [20, 'Geoportal', 15]])
    // ohne V_sig für die Zone (nur das Tempo): Tempo 20 aus dem Geoportal genügt wie im Bedarf
    expect(typ(rechneFall(osm({ highway: 'residential' }), AV, [], 12, fallMit(), null, null, null, () => 20))).toEqual(['begegnungszone'])
  })
  it('Widerspruch bzw. keine Zone: ohne Vortritt wie bisher', () => {
    // OSM living_street, Geoportal V_sig 30: Strecke oder Zone strittig (offen)
    const w = rechneFall(osm(LIVING), AV, [], 12, fallMit(), null, null, null, () => 30, vsig(30))
    expect(typ(w)).toEqual(['ohne_vortritt'])
    expect(w.hinweis).toMatch(/^Unmarkierte Querung \(OSM: crossing=unmarked\): als Querung ohne Vortritt angenommen/)
    const [b] = befundblaetter(w, fallMit(), { ...OHNE, geo: { osmTags: new Map(osm(LIVING).wege.map(x => [x.id, x.tags])), vsig: vsig(30) } })
    expect(b.vorbelegt.strittig).toEqual(['tempoRegime'])
    // Tempo 20 mit Tempo-30-Zone in OSM: widersprüchlich
    expect(typ(rechneFall(osm({ highway: 'residential', maxspeed: '20', 'zone:maxspeed': 'CH:zone30' }), AV, [], 12, fallMit(), null)))
      .toEqual(['ohne_vortritt'])
    // Tempo 30 bzw. 50: keine Begegnungszone
    expect(typ(rechneFall(osm({ highway: 'residential', maxspeed: '30' }), AV, [], 12, fallMit(), null))).toEqual(['ohne_vortritt'])
    expect(typ(rechneFall(osm({ highway: 'tertiary', maxspeed: '50' }), AV, [], 12, fallMit(), null))).toEqual(['ohne_vortritt'])
  })
  it('Handeingabe «Strecke oder Zone» im Bedarf geht vor (auch bewusst offen); sie ändert den Rechnungsschlüssel', () => {
    const hand = (wert: string | null) => fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert, quelle: 'hand' } } } })
    expect(typ(rechneFall(osm(LIVING), AV, [], 12, hand('strecke'), null))).toEqual(['ohne_vortritt'])
    expect(typ(rechneFall(osm(LIVING), AV, [], 12, hand(null), null))).toEqual(['ohne_vortritt'])
    const b = rechneFall(osm({ highway: 'tertiary', maxspeed: '30' }), AV, [], 12, hand('begegnungszone'), null)
    expect(typ(b)).toEqual(['begegnungszone'])
    expect(b.hinweis).toContain('in der Begegnungszone (Strecke oder Zone von Hand)')
    expect(b.streifen[0].zufahrten.map(z => z.sichtweite)).toEqual([25, 25])
    expect(rechnungsSchluessel(hand('strecke'))).not.toBe(rechnungsSchluessel(fallMit()))
    // Tempo 20 von Hand im Bedarf an einer Strasse mit 30 km/h ohne Zonenangabe: Vorschlag wie im Bedarf
    const t20 = fallMit(x => { x.bedarf = { felder: { vSig: { wert: 20, quelle: 'hand' } } } })
    expect(rechnungsSchluessel(t20)).not.toBe(rechnungsSchluessel(fallMit()))
    expect(typ(rechneFall(osm({ highway: 'residential', maxspeed: '30' }), AV, [], 12, t20, null))).toEqual(['begegnungszone'])
    // markierter Übergang: Bedarf-Eingaben ändern den Schlüssel nicht (unverändert)
    const fgsFall = (f: (x: Fall) => void = () => {}) => fallMit(x => { x.ort.markierung = 'markiert'; f(x) })
    expect(rechnungsSchluessel(fgsFall(x => { x.bedarf = { felder: { tempoRegime: { wert: 'strecke', quelle: 'hand' } } } })))
      .toBe(rechnungsSchluessel(fgsFall()))
  })
  it('gewählte Querungsart geht vor: Furt bleibt Furt, Fussgängerstreifen bleibt Fussgängerstreifen; Zebra unverändert', () => {
    const furt = rechneFall(osm(LIVING), AV, [], 12, fallMit(x => { x.streifen['12'] = { typ: 'furt' } }), null)
    expect(typ(furt)).toEqual(['furt'])
    expect(furt.streifen[0].querungAnnahme).toBeUndefined()
    expect(furt.streifen[0].zufahrten[0].sichtweite).toBe(sollQuerung({ typ: 'furt', L: 8, ganzeFahrbahn: false }, 20))
    const fgs = rechneFall(osm(LIVING), AV, [], 12, fallMit(x => { x.streifen['12'] = { typ: 'fgs' } }), null)
    expect(typ(fgs)).toEqual(['fgs'])
    // 20 km/h: Sichtweite wie 30 km/h, als Annahme gekennzeichnet (VSS 40 241 Tab. 1 hat keine Zeile für 20 km/h; 30.10.2026)
    expect(fgs.streifen[0].zufahrten.map(z => z.sichtweiteQuelle)).toEqual([QUELLE_TAB1_20, QUELLE_TAB1_20])
    expect(fgs.streifen[0].zufahrten.map(z => z.sichtweite)).toEqual([25, 25])
    const zebra = rechneFall(osm(LIVING, { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }), AV, [], 12, fallMit(), null)
    expect(typ(zebra)).toEqual(['fgs'])
  })
})

describe('Bedarf an der Querung in der Begegnungszone', () => {
  const f = fallMit()
  const r = rechneFall(osm(LIVING), AV, [], 12, f, null)
  const [b] = befundblaetter(r, f, { ...OHNE, geo: { osmTags: new Map(osm(LIVING).wege.map(x => [x.id, x.tags])) } })
  it('kein Querungstyp ohne Vortritt; Baum endet mit A2, keine Regel ohne Vortritt (E1 … E3)', () => {
    expect(b.vorbelegt.werte.typ).toBeUndefined()
    expect(b.hinweise).toContain(`Querungstyp: ${QUERUNG_BGZ_TEXT}`)
    expect(b.befund.ende).toBe('begegnungszone')
    expect(b.befund.alle.filter(x => /^E/.test(x.id))).toEqual([])
    expect(b.befund.ausgewertet.filter(id => /^E/.test(id))).toEqual([])
    expect(b.typText).toBe('Flächige Querung: Begegnungszone: flächiges Queren mit Vortritt')
    expect(JSON.stringify(b)).not.toContain('Querung ohne Vortritt')
  })
  it('Sicht zur Information (nicht anwendbar), keine Grundprüfung des Fussgängerstreifens; Zusammenfassung', () => {
    expect(b.sicht.map(x => [x.regel, x.soll, x.quelle])).toEqual([['E3', 15, QUELLE_BGZ], ['E3', 15, QUELLE_BGZ]])
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'nicht_anwendbar',
      ist: `frei (2 Zufahrten); ${BGZ_SICHT_TEXT}` })
    expect(b.grund.gilt).toBe(false)
    expect(zusammenfassung({ ...zfEingabeBlatt(b, 'panel'), imBlock: [] }).antwort).toMatch(/Begegnungszone/)
  })
})

describe('Abbieger in der Begegnungszone: höchstens bis zum Beginn des Abbiegens', () => {
  // wie ohneVortritt.test: Hauptstrasse West–Ost (50 km/h), Verbindungsstück Nord–Süd als Begegnungszone (Fahrbahn 5 m) bis zur
  // Nebenstrasse (y = −44, 50 km/h); Ecken als AV-Bögen mit Radius 6 m; Übergang 10 m südlich der Hauptstrasse
  const R = 6, YN = -44, B = 2.5
  const bogen = (c: [number, number], w0: number, w1: number): P[] => Array.from({ length: 13 }, (_, i) => {
    const w = (w0 + (w1 - w0) * i / 12) * Math.PI / 180
    return lv(c[0] + R * Math.cos(w), c[1] + R * Math.sin(w))
  })
  const ring: P[] = [lv(-300, 4), lv(300, 4), lv(300, -4), ...bogen([B + R, -4 - R], 90, 180), ...bogen([B + R, YN + 4 + R], 180, 270),
    lv(300, YN + 4), lv(300, YN - 4), lv(-300, YN - 4), lv(-300, YN + 4), ...bogen([-B - R, YN + 4 + R], 270, 360),
    ...bogen([-B - R, -4 - R], 0, 90), lv(-300, -4)]
  const AV2 = [av('Strasse_Weg', [...ring, ring[0]])]
  const OSM2: OsmDaten = {
    wege: [weg(1, [[10, -300, 0], [11, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
      weg(2, [[11, 0, 0], [30, 0, -10], [21, 0, YN]], { highway: 'living_street', name: 'Verbindung', maxspeed: '20' }),
      weg(3, [[40, -300, YN], [21, 0, YN], [41, 300, YN]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '50' })],
    tram: [], ampeln: [], querungen: [], relationen: [],
    uebergaenge: [{ id: 30, tags: UNMARKIERT, lat: ll(0, -10)[0], lon: ll(0, -10)[1] }],
  }
  const fall = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, -10)[0], ll(0, -10)[1], 30); f(x); return x }
  const r = rechneFall(OSM2, AV2, [], 30, fall(), null)
  const o = r.streifen[0].querung!
  it('Abbieger mit 50 km/h: Anhaltesichtweite 55 m, gekürzt bis zum Beginn des Abbiegens; gerade Zufahrt 20 km/h: 15 m ' +
    '(Knoten der Nebenstrasse jenseits davon: dort keine Abbieger)', () => {
    expect(o.typ).toBe('begegnungszone')
    const abb = r.streifen[0].zufahrten.filter(z => z.art === 'abbiegend')
    expect(abb.map(z => [z.strasse, z.tempo, z.knotenM, z.sichtweite, z.sichtweiteQuelle])).toEqual([
      ['Hauptstrasse', 50, 8, 9.1, quelleQuerungAbbiegen(o, 55)], ['Hauptstrasse', 50, 8, 16.3, quelleQuerungAbbiegen(o, 55)]])
    for (const z of abb) expect(z.annahmeGrenze).toEqual({ grenze: 'bis Beginn des Abbiegens', normM: 55 })
    // Annahme der App unter der Anhaltesichtweite: Sicht-Tabelle und Befundblatt nennen sie mit dem ungekürzten Wert
    expect(sichtQuelleKurz(abb[0].sichtweiteQuelle)).toBe('Annahme: bis Beginn des Abbiegens; Anhaltesichtweite nach VSS 40 240 Z. 8.2 wären 55 m')
    const [b] = befundblaetter(r, fall(), OHNE)
    expect(b.sicht.filter(x => x.zufahrt.startsWith('a')).map(x => x.annahme)).toEqual([
      'Annahme: bis Beginn des Abbiegens; Anhaltesichtweite nach VSS 40 240 Z. 8.2: 55 m',
      'Annahme: bis Beginn des Abbiegens; Anhaltesichtweite nach VSS 40 240 Z. 8.2: 55 m'])
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'nicht_anwendbar',
      soll: '15 geradeaus, 9,1; 16,3 für Abbiegende (Annahme: bis Beginn des Abbiegens)' })
    for (const z of r.streifen[0].zufahrten.filter(x => x.art !== 'abbiegend')) expect([z.sichtweite, z.sichtweiteQuelle]).toEqual([15, QUELLE_BGZ])
  })
  it('Tempo von Hand 20 km/h am Abbieger mit dem längeren Bogen: Anhaltesichtweite 15 m vor dem Beginn des Abbiegens, ohne Zusatz', () => {
    const z0 = r.streifen[0].zufahrten.find(z => z.art === 'abbiegend' && z.sichtweite > 15)!
    const t20 = rechneFall(OSM2, AV2, [], 30, fall(x => { x.zufahrten[`30|${z0.kennung}`] = { tempo: 20 } }), null)
      .streifen[0].zufahrten.find(z => z.kennung === z0.kennung)!
    expect([t20.tempo, t20.sichtweite, t20.sichtweiteQuelle]).toEqual([20, 15, QUELLE_BGZ])
    expect(t20.annahmeGrenze).toBeUndefined()
  })
})

// VSS 40 241 Tab. 1 nach Ortslage (Nutzerentscheid 30.10.2026): bei 60 km/h innerorts 75 m, ausserorts 100 m; 20 km/h und über 60 km/h
// als Annahme gekennzeichnet. Ortslage aus dem Bedarf (von Hand), sonst OSM am gequerten Weg (CH:rural), sonst innerorts als Annahme
describe('Sichtweite nach Tab. 1 und Ortslage', () => {
  const ZEBRA = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }
  const soll = (tags: Record<string, string>, f: (x: Fall) => void = () => {}) => {
    const r = rechneFall(osm({ highway: 'secondary', ...tags }, ZEBRA), AV, [], 12, fallMit(f), null)
    return { sw: r.streifen[0].zufahrten.map(z => z.sichtweite), q: r.streifen[0].zufahrten.map(z => z.sichtweiteQuelle),
      annahmen: r.streifen[0].zufahrten.flatMap(z => z.annahmen ?? []) }
  }
  it('60 km/h: ausserorts nach OSM 100 m, ohne Angabe innerorts als Annahme 75 m; von Hand im Bedarf geht vor', () => {
    const aus = soll({ maxspeed: '60', 'maxspeed:type': 'CH:rural' })
    expect(aus.sw).toEqual([100, 100])
    expect(aus.q).toEqual(['VSS Tab. 1 (ausserorts)', 'VSS Tab. 1 (ausserorts)'])
    const offen = soll({ maxspeed: '60' })
    expect(offen.sw).toEqual([75, 75])
    expect(offen.q).toEqual(['VSS Tab. 1', 'VSS Tab. 1'])
    expect(offen.annahmen).toContain(ORTSLAGE_ANNAHME)
    expect(soll({ maxspeed: '60', 'zone:maxspeed': 'CH:rural' }).sw).toEqual([100, 100])
    const hand = (io: boolean) => (x: Fall) => { x.bedarf = { felder: { innerorts: { wert: io, quelle: 'hand' } } } }
    expect(soll({ maxspeed: '60' }, hand(false)).sw).toEqual([100, 100])
    expect(soll({ maxspeed: '60', 'maxspeed:type': 'CH:rural' }, hand(true)).sw).toEqual([75, 75])
    expect(soll({ maxspeed: '60', 'maxspeed:type': 'CH:rural' }, hand(true)).annahmen).not.toContain(ORTSLAGE_ANNAHME)
  })
  it('innerorts unverändert (30 bis 50 km/h); über 60 km/h 75 m als Annahme, auch ausserorts', () => {
    for (const [v, sw] of [[30, 25], [40, 40], [50, 55]] as const) {
      const x = soll({ maxspeed: String(v), 'maxspeed:type': 'CH:rural' })
      expect(x.sw).toEqual([sw, sw])
      expect(x.q).toEqual(['VSS Tab. 1', 'VSS Tab. 1'])
      expect(x.annahmen).not.toContain(ORTSLAGE_ANNAHME)
    }
    const ueber = soll({ maxspeed: '80', 'maxspeed:type': 'CH:rural' })
    expect(ueber.sw).toEqual([75, 75])
    expect(ueber.q).toEqual([QUELLE_TAB1_UEBER60, QUELLE_TAB1_UEBER60])
    expect(sichtQuelleKurz(QUELLE_TAB1_UEBER60)).toBe(QUELLE_TAB1_UEBER60)
    expect(sichtQuelleKurz(QUELLE_TAB1_20)).toBe(QUELLE_TAB1_20)
    expect(sichtQuelleKurz('VSS Tab. 1 (ausserorts)')).toBe('nach Tempo')
  })
})
