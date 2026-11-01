// Unit-Tests der portierten Rechnung an einem künstlichen Knoten (keine echten Daten):
// Hauptstrasse West–Ost (8 m, Weg 1), Übergang bei x = 0, Querstrasse nach Süden bei x = -40 (6 m, Weg 2).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz, einbahnTag, zugangTag, NEBENAST_GRAD } from './netz'
import { rechneUebergang, kontextBauen } from './index'
import { sichtweiteTab1, sichtweiteKurve, tempoStufe, radiusRunden, zonenTempo, quelleTab1, QUELLE_TAB1_20, QUELLE_TAB1_UEBER60 } from './tempo'
import { fahrstreifenTags, fahrstreifenLage, abzugSeite } from './fahrstreifen'
import { randLuecken, kreisAnpassen, glaetten } from './spur'
import { gedecktRechnenSetzen, PARALLEL_MIN } from './abbiegen'
import { inselAusOsmSetzen, osmInselHinweis, streifenAusUebergang } from './streifen'
import { rechneFall } from './index'
import { leererFall } from '../fall'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]

function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}

function daten(hauptTags: Record<string, string> = {}, verbote = false, xq = -40): OsmDaten {
  const haupt = { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50', ...hauptTags }
  return {
    wege: [
      weg(1, [[10, -200, 0], [11, xq, 0], [12, 0, 0], [13, 200, 0]], haupt),
      weg(2, [[11, xq, 0], [20, xq, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' }),
    ],
    tram: [], ampeln: [], querungen: [],
    uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' },
      lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
    relationen: verbote ? [{ id: 99, tags: { type: 'restriction', restriction: 'no_right_turn' },
      members: [{ type: 'way', ref: 2, role: 'from' }, { type: 'node', ref: 11, role: 'via' }, { type: 'way', ref: 1, role: 'to' }] }] : [],
  }
}

const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] =>
  [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const avBei = (xq: number): AvFlaeche[] => [
  { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-200, -4), lv(xq - 3, -4), lv(xq - 3, -200), lv(xq + 3, -200),
    lv(xq + 3, -4), lv(200, -4), lv(200, 4), lv(-200, 4), lv(-200, -4)]] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 4, 200, 7)] },
  { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(xq + 4, -7, 200, -4)] },
]
const AV = avBei(-40)

/** Querweg (Weg 2) ab Knoten 11 bei x = -40 schräg nach Westsüdwest: Drehung der Abbiegenden = grad; AV-Band 6 m entlang */
function schraeg(grad: number): [OsmDaten, AvFlaeche[]] {
  const w = grad * Math.PI / 180, ex = -40 - 200 * Math.cos(w), ey = -200 * Math.sin(w)
  const d = daten()
  d.wege[1] = weg(2, [[11, -40, 0], [20, ex, ey]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })
  const n: P = [Math.sin(w) * 3, -Math.cos(w) * 3]
  return [d, [
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -4, 200, 4)] },
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-40 + n[0], n[1]), lv(ex + n[0], ey + n[1]),
      lv(ex - n[0], ey - n[1]), lv(-40 - n[0], -n[1]), lv(-40 + n[0], n[1])]] },
    { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 4, 200, 7)] },
  ]]
}

describe('Tags deuten (fgs_netz.py)', () => {
  it('Einbahn und Zugang', () => {
    expect(einbahnTag({ oneway: 'yes' })).toBe(1)
    expect(einbahnTag({ oneway: '-1' })).toBe(-1)
    expect(einbahnTag({ junction: 'roundabout' })).toBe(1)
    expect(einbahnTag({ oneway: 'yes', 'oneway:motor_vehicle': 'no' })).toBe(0)
    expect(zugangTag({ highway: 'pedestrian' })).toBe('nein')
    expect(zugangTag({ highway: 'residential', access: 'private' })).toBe('privat')
  })
  it('Fahrstreifen aus lanes', () => {
    expect(fahrstreifenTags({ lanes: '2' }, true)?.slice(0, 2)).toEqual([1, 2])
    expect(fahrstreifenTags({ lanes: '3', 'lanes:forward': '2' }, false)?.slice(0, 2)).toEqual([1, 3])
    expect(fahrstreifenTags({ lanes: '1', oneway: 'yes' }, false)).toBeNull()
  })
  it('Lage im OSM-Fahrstreifen und Widerspruch', () => {
    const fso = { n: 2, gesamt: 4, index: 0, wid: 1, regel: 'rechts', zweirichtig: true, bus: null }
    expect(fahrstreifenLage(fso, 12, 0, 6).vomRand).toBeCloseTo(1.5)
    expect(fahrstreifenLage(fso, 8, 0, 4).widerspruch).not.toBeNull()
  })
  it('Abzüge aus OSM-Tags (Annahmen)', () => {
    expect(abzugSeite({ 'parking:right': 'lane', 'parking:right:orientation': 'parallel' }, 'right').park).toBeCloseTo(1.9)
    expect(abzugSeite({ 'parking:both': 'lane', 'cycleway:right': 'lane' }, 'right')).toEqual({ park: 1.9, velo: 3.4 })
    expect(abzugSeite({ 'parking:left': 'lane' }, 'right').park).toBe(0)
  })
})

describe('Tempo und Sichtweite', () => {
  it('Tab. 1, Stufen und Kurvensichtweite', () => {
    expect([20, 30, 40, 50, 60].map(v => sichtweiteTab1(v))).toEqual([25, 25, 40, 55, 75])
    // 30.10.2026: ausserorts bei 60 km/h 100 m; 20 km/h und über 60 km/h als Annahme gekennzeichnet
    expect([20, 30, 40, 50, 60, 80].map(v => sichtweiteTab1(v, true))).toEqual([25, 25, 40, 55, 100, 75])
    expect([20, 30, 60, 80].map(v => quelleTab1(v))).toEqual([QUELLE_TAB1_20, 'VSS Tab. 1', 'VSS Tab. 1', QUELLE_TAB1_UEBER60])
    expect(quelleTab1(60, true)).toBe('VSS Tab. 1 (ausserorts)')
    expect(QUELLE_TAB1_20).toMatch(/^Annahme: wie 30 km\/h/)
    expect(tempoStufe(45)).toBe(50)
    expect(sichtweiteKurve(7.5)).toEqual([15, 'bfu'])
    expect(sichtweiteKurve(26)).toEqual([40, 'VSS Tab. 2'])
    expect(sichtweiteKurve(45)).toEqual([null, null])
    expect(radiusRunden(10.04)).toBe(10.1)
    expect(zonenTempo('CH:zone30')).toBe(30)
    expect(zonenTempo('CH:urban')).toBe(50)
    expect(zonenTempo('DE:urban')).toBeNull()
  })
})

describe('Spur-Helfer', () => {
  it('Kreisfit', () => {
    const pts: P[] = Array.from({ length: 10 }, (_, i) => [10 * Math.cos(i / 5), 10 * Math.sin(i / 5)])
    const k = kreisAnpassen(pts)!
    expect(k[1]).toBeCloseTo(10)
  })
  it('rand_luecken füllt Lücken linear und verwirft Einmündungen', () => {
    const [lat] = randLuecken([1, 1, 1, null, 1.5, 1.5, 1.5, 1.5], null, null, null)
    expect(lat[3]).toBeCloseTo(1.25)
    const [, nMuendung] = randLuecken([1, 1, 1, 1, 3, 1, 1, 1], null, null, null)
    expect(nMuendung).toBe(1)
  })
  it('glaetten hält den Anfang fest', () => {
    const g = glaetten([[0, 0], [50, 0], [50, 50]], 6)
    expect(g[0]).toEqual([0, 0])
  })
})

describe('Netz und Topologie (fgs_netz.OsmNetz)', () => {
  it('Zuordnung über den Übergangsknoten, Suche stromauf, Knotenbereich', () => {
    const netz = new OsmNetz(daten())
    const [gl, quelle] = netz.zuordnen(lv(0, -3.7), lv(0, 3.7), null, true, 4)
    expect(quelle).toBe('uebergang')
    expect(gl[0].wid).toBe(1)
    const su = netz.stromauf(gl[0], 1)                       // Fahrt nach Osten, Suche nach Westen
    expect(su.art).toBe('knoten')
    expect(su.dist).toBeCloseTo(40, 0)
    const kb = netz.knotenbereich(su, gl[0])
    expect(kb.forts?.wid).toBe(1)
    const arm = kb.arme.find(a => a.wid === 2)!
    expect(arm.rolle).toBe('abbiegend')
  })
  it('Arm ab 10° Drehung ist Abbiegezufahrt, darunter Nebenast (Nutzerentscheid 13.10.2026, bis dahin 30°)', () => {
    const rolle = (grad: number) => {
      const netz = new OsmNetz(schraeg(grad)[0])
      const [gl] = netz.zuordnen(lv(0, -3.7), lv(0, 3.7), null, true, 4)
      const arm = netz.knotenbereich(netz.stromauf(gl[0], 1), gl[0]).arme.find(a => a.wid === 2)!
      return [arm.rolle, Math.round(Math.abs(arm.dreh))]
    }
    expect(rolle(20)).toEqual(['abbiegend', 20])
    expect(rolle(5)).toEqual(['nebenast', 5])
  })
  it('Abbiegeverbot (Relation) gibt Rolle «verbot»', () => {
    const netz = new OsmNetz(daten({}, true))
    const [gl] = netz.zuordnen(lv(0, -3.7), lv(0, 3.7), null, true, 4)
    const kb = netz.knotenbereich(netz.stromauf(gl[0], 1), gl[0])
    expect(kb.arme.find(a => a.wid === 2)!.rolle).toBe('verbot')
  })
})

describe('Rechnung am Übergang', () => {
  // GEDECKT_RECHNEN seit 14.10.2026 standardmässig aus (Nutzerentscheid); Tests mit Schalter an setzen ihn über
  // gedecktRechnenSetzen(true), danach wieder die Vorgabe
  afterEach(() => gedecktRechnenSetzen(null))
  it('zwei gerade Zufahrten, Querstrasse 38 m vor dem Streifen durch die gerade Zufahrt mitgeprüft: entfällt «gedeckt»', () => {
    const r = rechneUebergang(daten(), AV, 12)
    expect(r.streifen).toHaveLength(1)
    const s = r.streifen[0]
    expect(s.randQuelle).toBe('AV')
    expect(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1])).toBeCloseTo(8 - 0.6, 1)
    const gerade = s.zufahrten.filter(z => z.art !== 'abbiegend').map(z => z.richtung).sort((a, b) => a - b)
    expect(gerade).toEqual([0, 180])
    for (const z of s.zufahrten.filter(z => z.art !== 'abbiegend')) {
      expect(z.tempo).toBe(50)
      expect(z.sichtweite).toBeGreaterThanOrEqual(55)
      expect(z.sichtpunktVomRandM).toBeCloseTo(2, 1)          // Mitte des rechten Fahrstreifens (8 m / 2 / 2)
      expect(z.status).toBe('frei')
    }
    // Vorgabe (Schalter aus, wie bis 13.10.2026): die Abbiegezufahrt entfällt mit Grund «gedeckt»; Text seit 14.10.2026 ohne
    // «gedeckt» (eckige AV-Ecke, R 5 m: Kurvensichtweite bfu 10 m, Knoten 38 m weiter weg, gerade Zufahrt 55 m)
    expect(s.zufahrten.map(z => z.kennung)).not.toContain('k11:w2+')
    expect(s.zufahrten.every(z => z.deckung === undefined)).toBe(true)
    const e = s.entfallen.find(x => x.kennung === 'k11:w2+')!
    expect([e.art, e.grund]).toEqual(['abbiegend', 'gedeckt'])
    expect(e.quelle).toBe('Knoten 38,0 m vor dem Streifen; Kurvensichtweite des Abbiegers 10 m; die gerade Zufahrt prüft diese ' +
      'Strecke über 55 m mit')
  })
  it('Schalter GEDECKT_RECHNEN an: gedeckte Abbiegezufahrt gerechnet und gezählt, mit Kurvensichtweite', () => {
    gedecktRechnenSetzen(true)
    const s = rechneUebergang(daten(), AV, 12).streifen[0]
    expect(s.entfallen.some(x => x.grund === 'gedeckt')).toBe(false)
    const ab = s.zufahrten.find(x => x.kennung === 'k11:w2+')!
    expect(ab.art).toBe('abbiegend')
    expect(ab.deckung).toBe('Knoten 38,0 m vor dem Streifen; Kurvensichtweite des Abbiegers 10 m; die gerade Zufahrt prüft diese ' +
      'Strecke über 55 m mit')
    expect(ab.netzHinweis).toContain('gedeckt')
    // Sichtweite: die Kurvensichtweite (eckige AV-Ecke, R 5 m: bfu 10 m), nicht «bis Knoten» (38 m); den Weg ab dem Knoten
    // prüft die gerade Zufahrt (Nutzerentscheid 13.10.2026; zuvor hier «bis Knoten (Tab. 1 eigene Strasse, Tempo 50)», 38 m)
    expect(ab.kurvenradiusM).toBe(5)
    expect([ab.sichtweite, ab.sichtweiteQuelle]).toEqual([10, 'Kurvensichtweite (bfu); ab dem Knoten prüft die gerade Zufahrt mit'])
    expect(ab.sichtpunkte.length).toBeGreaterThan(2)
    expect(ab.status).toBe('frei')
    expect(s.zufahrten.filter(z => z.art !== 'abbiegend').every(z => z.deckung === undefined)).toBe(true)
  })
  it('schräger Arm: 20° Drehung wird Abbiegezufahrt (hier «gedeckt»), 5° bleibt Nebenast', () => {
    // «gedeckt» prüft erst die Abbiegezufahrt (Rolle «abbiegend»); ein Nebenast entfiele mit Grund «nebenast»
    const s20 = rechneUebergang(...schraeg(20), 12).streifen[0]
    expect(s20.zufahrten.some(z => z.kennung === 'k11:w2+')).toBe(false)
    expect(s20.entfallen.find(e => e.kennung === 'k11:w2+')?.grund).toBe('gedeckt')
    gedecktRechnenSetzen(true)
    const a20 = rechneUebergang(...schraeg(20), 12).streifen[0].zufahrten.find(z => z.kennung === 'k11:w2+')!
    expect([a20.art, a20.deckung !== undefined]).toEqual(['abbiegend', true])
    gedecktRechnenSetzen(null)
    const s5 = rechneUebergang(...schraeg(5), 12).streifen[0]
    expect(s5.zufahrten.some(z => z.kennung === 'k11:w2+')).toBe(false)
    expect(s5.entfallen.find(e => e.kennung === 'k11:w2+')?.grund).toBe('nebenast')
    expect(s5.zufahrten.find(z => z.kennung === 'w1+')!.netzHinweis).toContain('nebenast:Querweg')
  })
  it('Grenze NEBENAST_GRAD: 9,9° Nebenast, 10,0° und 12° Abbiegezufahrt (nicht «geometrie»)', () => {
    const arm = (grad: number) => {
      const s = rechneUebergang(...schraeg(grad), 12).streifen[0]
      return [s.zufahrten.find(z => z.kennung === 'k11:w2+'), s.entfallen.find(e => e.kennung === 'k11:w2+')] as const
    }
    const [z99, e99] = arm(9.9)
    expect(z99).toBeUndefined()
    expect([e99?.grund, e99?.quelle]).toEqual(['nebenast', 'Drehung 9,9°'])        // Drehung mit einer Nachkommastelle
    for (const grad of [10, 12]) {
      // bis 13.10.2026 (Parallel-Sperre 0,2 = sin 11,5°) entfielen beide als «geometrie: Fahrstreifen fast parallel». Vorgabe
      // (Schalter aus): «gedeckt» (Knoten 38 m, Kurve 25 m: Tab. 1, 30 km/h); die Prüfung auf «gedeckt» folgt erst nach den
      // Fahrstreifengeraden, die Parallel-Sperre greift also nicht
      const [z0, e0] = arm(grad)
      expect(z0).toBeUndefined()
      expect([e0?.art, e0?.grund]).toEqual(['abbiegend', 'gedeckt'])
      // Schalter an: die Fahrlinie selbst lässt sich rechnen
      gedecktRechnenSetzen(true)
      const [z, e] = arm(grad)
      gedecktRechnenSetzen(null)
      expect(e).toBeUndefined()
      expect(z?.art).toBe('abbiegend')
      expect(z!.sichtpunkte.length).toBeGreaterThan(2)
      expect(z!.deckung).toBeDefined()
      expect([z!.sichtweite, z!.sichtweiteQuelle]).toEqual([25, 'Kurvensichtweite, höchstens VSS Tab. 1; ab dem Knoten prüft die gerade Zufahrt mit'])
    }
    // Parallel-Sperre an die Grenze gekoppelt: 0,6 · sin(NEBENAST_GRAD) = sin 6,0°, rund 4° Reserve; höchstens 0,2 (bisher)
    expect(PARALLEL_MIN).toBeCloseTo(0.6 * Math.sin(NEBENAST_GRAD * Math.PI / 180), 12)
    expect(Math.asin(PARALLEL_MIN) * 180 / Math.PI).toBeCloseTo(6.0, 1)
  })
  it('Radius von Hand: Vorgabe «bis Knoten»; mit GEDECKT_RECHNEN Kurvensichtweite aus dem Handradius, Vermerk «deckung»', () => {
    // schräger Arm 12°: geschätzter Radius über 40 m, mit Tempo 50 auf der Querstrasse Kurvensichtweite 55 m (Tab. 1) -> der
    // Knoten (38 m) liegt innerhalb, nicht gedeckt. Fahrlinie von Hand mit Radius 5 m: bfu 10 m, Knoten jenseits
    const [osm, av] = schraeg(12)
    const mit = (radius: number | null) => {
      const k = kontextBauen(osm, av)
      k.vonHand = { tempoKennung: (_f, kenn) => (kenn === 'k11:w2+' ? 50 : null),
        spur: (_f, kenn) => (kenn === 'k11:w2+' && radius ? { art: 'B', linie: [lv(-2, -3), lv(-37, -3), lv(-38, -5), lv(-45, -30)], radius } : null) }
      return rechneUebergang(osm, av, 12, k).streifen[0].zufahrten.find(z => z.kennung === 'k11:w2+')!
    }
    const ohne = mit(null)
    expect([ohne.sichtweite, ohne.sichtweiteQuelle, ohne.deckung]).toEqual([55, 'VSS Tab. 1', undefined])
    // Vorgabe (Schalter aus): der Radius von Hand gibt «bis Knoten» (gedeckt entfällt nur mit dem berechneten Radius)
    const aus = mit(5)
    expect([aus.sichtweite, aus.sichtweiteQuelle, aus.deckung]).toEqual([39, 'bis Knoten (Tab. 1 eigene Strasse)', undefined])
    // Schalter an: der Radius von Hand entscheidet die Deckung neu
    gedecktRechnenSetzen(true)
    const r5 = mit(5)
    expect([r5.kurvenradiusM, r5.sichtweite, r5.sichtweiteQuelle]).toEqual([5, 10, 'Kurvensichtweite (bfu); ab dem Knoten prüft die gerade Zufahrt mit'])
    expect(r5.deckung).toBe('Knoten 38,0 m vor dem Streifen; Kurvensichtweite des Abbiegers 10 m; die gerade Zufahrt prüft diese ' +
      'Strecke über 55 m mit')
    expect(r5.netzHinweis).toEqual(expect.arrayContaining(['spur_hand', 'gedeckt']))
  })
  it('Querstrasse nah am Streifen: Abbiegezufahrt mit Radius und Kurvensichtweite', () => {
    const r = rechneUebergang(daten({}, false, -11), avBei(-11), 12)
    const ab = r.streifen[0].zufahrten.find(z => z.art === 'abbiegend')!
    expect(ab.kennung).toBe('k11:w2+')
    expect(ab.tempo).toBe(30)
    expect(ab.kurvenradiusM).toBeGreaterThanOrEqual(5)
    expect(ab.sichtweite).toBeLessThanOrEqual(25)
    expect(ab.sichtpunkte.length).toBeGreaterThan(2)
  })
  it('Einbahn: Gegenrichtung entfällt mit Grund', () => {
    const r = rechneUebergang(daten({ oneway: 'yes' }), AV, 12)
    const s = r.streifen[0]
    expect(s.zufahrten.filter(z => z.art !== 'abbiegend').map(z => z.art)).toEqual(['einbahn'])
    expect(s.entfallen.find(e => e.grund === 'einbahn_osm')?.richtung).toBe(180)
  })
  it('ohne maxspeed: Tempo 50 als Annahme sichtbar', () => {
    const r = rechneUebergang(daten({ maxspeed: '' }), AV, 12)
    const z = r.streifen[0].zufahrten.find(x => x.richtung === 180)!
    expect(z.tempoQuelle).toBe('Ersatz')
    expect(z.annahmen.join(' ')).toMatch(/angenommen/)
  })
  it('Gebäude im Sichtfeld', () => {
    const geb: AvFlaeche = { art: 'Gebaeude', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-8, 4.1, -3.2, 8)] }
    const r = rechneUebergang(daten(), [...AV, geb], 12)
    const z = r.streifen[0].zufahrten.find(x => x.richtung === 0)!   // Fahrt nach Osten, Gebäude links vor dem Streifen
    expect(z.status).toBe('verdeckt_gebaeude')
  })
})

describe('Insel nach OSM (crossing:island=yes, INSEL_AUS_OSM; ohne Luftbild kein Teilen, Nutzerentscheid 14.10.2026; Schalter seit 30.10.2026 aus, hier an)', () => {
  beforeEach(() => inselAusOsmSetzen(true))
  afterEach(() => inselAusOsmSetzen(null))
  const mitInsel = (extra: Record<string, string> = { 'crossing:island': 'yes' }) => {
    const d = daten()
    d.uebergaenge[0] = { ...d.uebergaenge[0], tags: { ...d.uebergaenge[0].tags, ...extra } }
    return d
  }
  const fall = () => leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  const gerade = (s: { zufahrten: { art: string; richtung: number }[] }) =>
    s.zufahrten.filter(z => z.art !== 'abbiegend').map(z => `${z.richtung}:${z.art}`)
  const kurz = (r: { streifen: { fgsId: string; p0: P; p1: P; zufahrten: { art: string; richtung: number }[]; entfallen: { grund: string; richtung: number; art: string }[] }[] }) =>
    r.streifen.map(s => ({ id: s.fgsId, laenge: Math.round(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]) * 10) / 10, gerade: gerade(s),
      entfallen: s.entfallen.filter(e => e.art === 'gerade').map(e => `${e.richtung}:${e.grund}`) }))
  it('ohne Luftbild: kein Teilen (OSM allein ist kein Beleg), ein Streifen wie ohne Tag, Hinweis OSM/AV', () => {
    const r = rechneFall(mitInsel(), AV, [], 12, fall(), null)
    expect(kurz(r)).toEqual([{ id: '12', laenge: 7.4, gerade: ['0:beide', '180:beide'], entfallen: [] }])
    expect(r.inseln).toEqual([])
    expect(r.streifen[0].annahmen).toContain(osmInselHinweis())
    expect(osmInselHinweis()).toBe('OSM meldet eine Mittelinsel (crossing:island=yes), die Amtliche Vermessung keine – nicht als gebaut angenommen; ist sie gebaut, Insel von Hand setzen')
    expect(r.streifen[0].annahmen.join(' ')).not.toMatch(/Teilstreifen|Insel nach OSM/)
  })
  it('ohne crossing:island bzw. Schalter aus (Vorgabe seit 30.10.2026): ein Streifen, zwei gerade Zufahrten; mit Tag nur der Hinweis', () => {
    const alt = kurz(rechneFall(daten(), AV, [], 12, fall(), null))
    expect(alt).toEqual([{ id: '12', laenge: 7.4, gerade: ['0:beide', '180:beide'], entfallen: [] }])
    const nein = rechneFall(mitInsel({ 'crossing:island': 'no' }), AV, [], 12, fall(), null)
    expect(kurz(nein)).toEqual(alt)
    expect(nein.streifen[0].annahmen.join(' ')).not.toMatch(/insel/i)
    inselAusOsmSetzen(false)
    const r = rechneFall(mitInsel(), AV, [], 12, fall(), null)
    expect(kurz(r)).toEqual(alt)
    expect(r.inseln).toEqual([])
    expect(r.streifen[0].annahmen).toContain(osmInselHinweis())
    expect(r.streifen[0].annahmen.join(' ')).not.toMatch(/Teilstreifen|Insel nach OSM/)
  })
  it('AV-Verkehrsinsel auf der Achse: unverändert (Teilstreifen aus der AV, keine Annahme)', () => {
    const avInsel: AvFlaeche[] = [
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -4, 200, -1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, 1.2, 200, 4)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-200, -1.2, -4, 1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(4, -1.2, 200, 1.2)] },
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-43, -200, -37, -4)] },
      { art: 'Verkehrsinsel', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rechteck(-4, -1.2, 4, 1.2)] },
      ...AV.slice(1),
    ]
    const ohneTag = rechneFall(daten(), avInsel, [], 12, fall(), null)
    const mitTag = rechneFall(mitInsel(), avInsel, [], 12, fall(), null)
    expect(kurz(mitTag)).toEqual(kurz(ohneTag))
    expect(kurz(mitTag).map(x => x.id)).toEqual(['12-1', '12-2'])
    expect(mitTag.inseln).toEqual([])
    expect(mitTag.streifen[0].annahmen.join(' ')).toMatch(/AV-Verkehrsinsel auf der Achse/)
    expect(mitTag.streifen[0].annahmen).not.toContain(osmInselHinweis())
    // Kennzeichen für die Luftbild-Insel («unsicher»): AV-Insel auf der Achse, dann keine Insel aus den Balken
    const k = kontextBauen(mitInsel(), avInsel), u = { nid: 12, p: lv(0, 0), tags: mitInsel().uebergaenge[0].tags }
    expect(streifenAusUebergang(u, k.netz!, k.fahrbahn, k.inseln).avInsel).toBe(true)
    const k2 = kontextBauen(mitInsel(), AV)
    expect(streifenAusUebergang(u, k2.netz!, k2.fahrbahn, k2.inseln).avInsel).toBe(false)
  })
  it('Insel von Hand: teilt den Streifen und ersetzt die Annahme; am Rand nur ein Teil, Einspur-Regel', () => {
    const f = fall()
    f.hindernisse.push({ id: 'insel-1', art: 'insel', ring: rechteck(-3, -0.5, 3, 1.5).slice(0, 4), quelle: 'hand' })
    const r = rechneFall(mitInsel(), AV, [], 12, f, null)
    expect(kurz(r)).toEqual([
      { id: '12-1', laenge: 2.9, gerade: ['0:insel'], entfallen: ['180:insel'] },
      { id: '12-2', laenge: 1.9, gerade: ['180:insel'], entfallen: ['0:insel'] },
    ])
    expect(r.inseln).toEqual([])                                   // Insel von Hand: auf der Karte als Eingabe
    expect(r.streifen[0].annahmen.join(' ')).toMatch(/Teilstreifen 1 von 2 \(Insel von Hand auf der Achse\)/)
    expect(r.streifen[0].annahmen).not.toContain(osmInselHinweis())
    // Insel am Rand (1,6 … 3,0 m): Teil daneben 1,0 m, nicht gebildet; der andere (5,6 m bis zur Insel, höchstens
    // EINSPUR_MAX_M) mit der Insel am Ende: einspurig, nur die Fahrt mit dem Trottoir rechts (nach Osten)
    const g = fall()
    g.hindernisse.push({ id: 'insel-2', art: 'insel', ring: rechteck(-3, 1.6, 3, 3.0).slice(0, 4), quelle: 'hand' })
    const r2 = rechneFall(daten(), AV, [], 12, g, null)
    expect(kurz(r2)).toEqual([{ id: '12', laenge: 5, gerade: ['0:insel'], entfallen: ['180:einspurig'] }])
    expect(r2.streifen[0].randQuelle).toBe('AV')                    // Bordkante an der Insel (Sehne an der Insel gekürzt)
    // Insel über fast die ganze Fahrbahn (Teile 0,5 und 1,0 m): kein Streifen, Meldung statt leerer Liste
    const w = fall()
    w.hindernisse.push({ id: 'insel-3', art: 'insel', ring: rechteck(-3, -3.5, 3, 3.0).slice(0, 4), quelle: 'hand' })
    const r3 = rechneFall(daten(), AV, [], 12, w, null)
    expect(r3.streifen).toEqual([])
    expect(r3.meldungen).toContain('Streifen aus OSM + AV: neben der Insel kein Fahrbahnteil ab 2,0 m – Insel prüfen.')
  })
})
