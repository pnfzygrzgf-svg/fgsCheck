// Tests vorgezogener Seitenraum (23.10.2026): Einfügen mit bzw. ohne Längsparkierung, Wegfall der überdeckten Parkierung in der
// Sichtprüfung, Fall-Datei, Vorbelegung des Bedarfs (E2b/E2c), Ziehen entlang der Bordkante, Rechnung ohne Element unverändert.
// Künstlicher Knoten wie planflaechen.test.ts: Hauptstrasse West–Ost (Fahrbahn 8 m, y −4 bis 4), Übergang bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { Fahrbahn } from './flaechen'
import { rechneFall } from './index'
import { flaeche } from './poly'
import type { Hindernis } from './hindernisse'
import { leererFall, fallLesen, fallSchreiben, fallVersion, type Fall, type FlaechePlan, type PlanSeitenraum } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { seitenraumLage, seitenraumMasse, kanteMessen, parkTiefe, parkRinge, seitenraumKennung, seitenraumRing, kanteLinie, seitenraumMitte,
  seitenraumAngepasst, seitenraumText, planStandardText, parkOhneSeitenraum, endeAnLinie, endenNachfuehren, srVerschieben, srMasseFehler,
  naechsteSrGruppe, seitenraumAnStreifen, SR_PARK_TIEFE_M, SR_UEBERSTAND_M, SR_HINTEN_M } from './seitenraum'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const lok = (p: P) => [+(p[0] - O[0]).toFixed(3) + 0, +(p[1] - O[1]).toFixed(3) + 0]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-200, -4, 200, 4)), av('Trottoir', rechteck(-200, 4, 200, 7)),
  av('Trottoir', rechteck(-200, -7, 200, -4))]
const fallMit = (f: (x: Fall) => void): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const fb = new Fahrbahn(AV)
const sehne = (q: P, r: P) => fb.sehne(q, r)
/** Parkfeld von Hand an der Nordkante (2 m tief, östlich des Streifens) */
const FELD: Hindernis = { id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(3, 2, 9, 4), quelle: 'hand' }

/** Element wie das Werkzeug: Streifen der Rechnung, Ende an der Nordkante */
function einfuegen(f: Fall, rand?: [number, number]) {
  const r = rechneFall(OSM, AV, [], 12, f, null)
  const e = r.streifen[0], k = e.rand[0][1] > e.rand[1][1] ? 0 : 1
  const l0 = seitenraumLage(e.p0, e.p1, k, null, e.rand[k])
  const lage = { ...l0, kante: kanteMessen(l0, seitenraumMasse(e.bw, null), sehne) ?? [0, 0] as [number, number] }
  const park = parkTiefe(parkRinge(f.hindernisse), lage)
  const m = seitenraumMasse(e.bw, park)
  if (rand) { m.randA = rand[0]; m.randB = rand[1] }
  const st = seitenraumKennung(naechsteSrGruppe(f.flaechenPlan), lage, m)
  return { st, park, e, k, fp: { id: 'plan-1', art: 'trottoir', ring: seitenraumRing(st, st), standard: st } as FlaechePlan }
}

describe('Einfügen an einem Streifenende', () => {
  it('mit Parkfeldern: Tiefe = Aussenkante der Parkierung + 0,20 m, Länge = Streifenbreite + je 1 m, hinter die Bordkante 0,50 m', () => {
    const { st, park, fp } = einfuegen(fallMit(x => { x.hindernisse.push(FELD) }))
    expect(park).toEqual({ tiefe: 2, ids: ['p1'] })
    expect(st.parkQuelle).toBe('parkierung')
    expect(lok(st.k)).toEqual([0.001, 4]); expect(st.tief).toEqual([0, -1]); expect(st.kante).toEqual([0, 0])
    expect(st.tiefePark + st.ueberstand).toBeCloseTo(2 + SR_UEBERSTAND_M, 9)
    const ys = fp.ring.map(p => lok(p)[1]), xs = fp.ring.map(p => lok(p)[0])
    expect(Math.min(...ys)).toBeCloseTo(4 - 2.2, 3); expect(Math.max(...ys)).toBeCloseTo(4 + SR_HINTEN_M, 3)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4 + 2, 3)
    expect(flaeche([[fp.ring]])).toBeCloseTo(6 * 2.7, 3)
    expect(seitenraumText(st)).toBe('Vorgezogener Seitenraum: 0,20 m über die Parklinie (Parkstreifen 2,00 m aus der Parkierung), Länge 6,00 m')
    expect(seitenraumAngepasst(fp)).toBe(false)
    expect(planStandardText({ ...fp, ring: fp.ring.slice(1) })).toContain('von Hand angepasst')
  })
  it('Längsparkierung (2,5 m) zählt; Parkierung der Gegenseite bzw. weit weg nicht', () => {
    const laengs: Hindernis = { id: 'l1', art: 'laengsparkierung', linie: [lv(-12, 2.75), lv(-4, 2.75)], breite: 2.5, quelle: 'hand' }
    const gegen: Hindernis = { id: 'g1', art: 'parkfeld', klasse: 'auto', ring: rechteck(3, -4, 9, -2), quelle: 'hand' }
    const weit: Hindernis = { id: 'w1', art: 'parkfeld', klasse: 'auto', ring: rechteck(30, 2, 36, 4), quelle: 'hand' }
    const { park } = einfuegen(fallMit(x => { x.hindernisse.push(laengs, gegen, weit) }))
    expect(park?.ids).toEqual(['l1']); expect(park?.tiefe).toBeCloseTo(2.5, 6)
  })
  it('ohne Parkierung: Standardtiefe 2,00 m + 0,20 m, als Annahme gekennzeichnet', () => {
    const { st, park } = einfuegen(fallMit(() => {}))
    expect(park).toBeNull()
    expect(st.tiefePark).toBe(SR_PARK_TIEFE_M); expect(st.parkQuelle).toBe('annahme')
    expect(seitenraumText(st)).toContain('Parkstreifen 2,00 m angenommen')
  })
  it('Masse: Bereiche, nächste Kennung', () => {
    const { st } = einfuegen(fallMit(() => {}))
    expect(srMasseFehler(st)).toBeNull()
    expect(srMasseFehler({ ...st, ueberstand: -0.1 })).toContain('Überstand')
    expect(srMasseFehler({ ...st, tiefePark: 9 })).toContain('Parkstreifen')
    expect(naechsteSrGruppe([{ id: 'plan-1', art: 'trottoir', ring: [], standard: { ...st, gruppe: 'sr-4' } }])).toBe('sr-5')
  })
  it('Streifen von Hand: Ende an die neue Bordkante (0,30 m davor); Rechnung mit Bordkante und Wartebereich nach dem Element', () => {
    const f = fallMit(x => { x.hindernisse.push(FELD); x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4 }) })
    const { st, fp } = einfuegen(f)
    const h = f.streifenHand[0]
    h.p1 = endeAnLinie(h, 'p1', kanteLinie(st, st, true))!
    expect(lok(h.p1)).toEqual([0, 1.5])
    f.flaechenPlan = [fp]
    const r = rechneFall(OSM, AV, [], 12, f, null)
    const s = r.streifen[0]
    expect(s.randQuelle).toBe('AV')
    expect(lok(s.rand[1])[1]).toBeCloseTo(1.8, 6)
    expect(s.annahmen.join(' ')).toContain('vorgezogener Seitenraum')
    // Element löschen: Ende zurück an die Bordkante heute
    const z = endenNachfuehren(f.streifenHand, kanteLinie(st, st, true), kanteLinie(st, st, false))
    expect(z.ids).toEqual(['hand-1']); expect(lok(z.streifen[0].p1)).toEqual([0, 3.7])
  })
})

describe('Wirkung in der Sichtprüfung', () => {
  it('überdeckte Parkfelder entfallen: Zufahrt von verdeckt zu frei (dieselbe Fläche ohne Kennzeichnung: weiter verdeckt)', () => {
    const f0 = fallMit(x => { x.hindernisse.push(FELD) })
    const r0 = rechneFall(OSM, AV, [], 12, f0, null)
    expect(r0.streifen[0].status).toBe('verdeckt')
    const { fp } = einfuegen(f0, [7, 7])
    const mit = rechneFall(OSM, AV, [], 12, fallMit(x => { x.hindernisse.push(FELD); x.flaechenPlan = [fp] }), null)
    expect(mit.streifen[0].status).toBe('frei')
    expect(mit.seitenraumErsetzt).toEqual([{ id: 'p1', ganz: true }])
    expect(mit.meldungen.join(' ')).toContain('durch vorgezogenen Seitenraum ersetzt')
    const ohneKennung = rechneFall(OSM, AV, [], 12, fallMit(x => { x.hindernisse.push(FELD); x.flaechenPlan = [{ ...fp, standard: undefined }] }), null)
    expect(ohneKennung.streifen[0].status).toBe('verdeckt')
    expect(ohneKennung.seitenraumErsetzt).toBeUndefined()
  })
  it('teilweise überdeckt: nur der überdeckte Teil entfällt (Rest als Parkfeld, gleiche Id); Längsparkierung ebenso', () => {
    const poly = [[rechteck(-3, 1.8, 3, 4.5)]]
    const r = parkOhneSeitenraum([{ ...FELD, ring: rechteck(1, 2, 9, 4) }], poly)
    expect(r.ersetzt).toEqual([{ id: 'p1', ganz: false }])
    expect(r.hindernisse).toHaveLength(1)
    const h = r.hindernisse[0]
    expect(h.art === 'parkfeld' && flaeche([[h.ring]])).toBeCloseTo(12, 6)
    const l = parkOhneSeitenraum([{ id: 'l1', art: 'laengsparkierung', linie: [lv(-12, 3), lv(2, 3)], breite: 2, quelle: 'hand' }], poly)
    expect(l.hindernisse.map(x => [x.id, x.art])).toEqual([['l1', 'parkfeld']])
    // Bäume und übrige Hindernisse bleiben; ohne Element dieselbe Liste
    const baum: Hindernis = { id: 'b', art: 'baum', p: lv(0, 3), stamm: 0.5, quelle: 'hand' }
    expect(parkOhneSeitenraum([baum], poly).hindernisse).toEqual([baum])
    const liste = [FELD]
    expect(parkOhneSeitenraum(liste, []).hindernisse).toBe(liste)
  })
  it('Rechnung ohne Element unverändert (kein Feld seitenraumErsetzt, gleiche Ergebnisse wie vorher)', () => {
    const f = fallMit(x => { x.hindernisse.push(FELD) })
    const r = rechneFall(OSM, AV, [], 12, f, null)
    expect('seitenraumErsetzt' in r).toBe(false)
    expect(r.streifen[0].zufahrten.map(z => [z.zufahrt, z.status])).toEqual([['0', 'frei'], ['180', 'verdeckt']])
  })
})

describe('Fall-Datei', () => {
  it('neu: Kennzeichnung bleibt beim Schreiben und Lesen, Version 2 (wie Flächen (Plan))', () => {
    const { fp } = einfuegen(fallMit(() => {}))
    const f = fallMit(x => { x.flaechenPlan = [fp] })
    expect(fallVersion(f)).toBe(2)
    const [g, h] = fallLesen(fallSchreiben(f))
    expect(h).toEqual([])
    expect(g.flaechenPlan).toEqual([fp])
    expect(seitenraumAngepasst(g.flaechenPlan![0])).toBe(false)
  })
  it('alt bzw. ungültig: Fläche bleibt als Plan-Fläche Trottoir, Hinweis', () => {
    const { fp } = einfuegen(fallMit(() => {}))
    const roh = JSON.parse(fallSchreiben(fallMit(x => { x.flaechenPlan = [fp] })))
    roh.flaechenPlan[0].standard.tief = [3, 0]
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.flaechenPlan![0].standard).toBeUndefined(); expect(g.flaechenPlan![0].art).toBe('trottoir')
    expect(h).toEqual(['Kennzeichnung «Vorgezogener Seitenraum» von plan-1 ungültig, übergangen (Fläche bleibt)'])
    // ältere Fall-Datei ohne Kennzeichnung
    delete roh.flaechenPlan[0].standard
    const [a, ha] = fallLesen(JSON.stringify(roh))
    expect(ha).toEqual([]); expect(a.flaechenPlan![0].standard).toBeUndefined()
  })
})

describe('Bedarf: Vorbelegung E2b/E2c', () => {
  it('seitenraumVorParklinieM aus dem Element (Überstand), Quelle Plan', () => {
    const { fp, st } = einfuegen(fallMit(() => {}))
    const f = fallMit(x => { x.flaechenPlan = [fp] })
    const [b] = befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, { vorgabe: { bern: true, kantonBE: true } })
    expect(b.vorbelegt.werte.seitenraumVorParklinieM).toMatchObject({ wert: 0.2, quelle: 'rechnung' })
    expect(b.vorbelegt.werte.seitenraumVorParklinieM.text).toContain('Plan: vorgezogener Seitenraum (Plan-Fläche 1)')
    const g = fallMit(x => { x.flaechenPlan = [{ ...fp, standard: { ...st, ueberstand: 0.1 } as PlanSeitenraum }] })
    expect(seitenraumAnStreifen(g.flaechenPlan, rechneFall(OSM, AV, [], 12, g, null).streifen).map(x => x.id)).toEqual(['plan-1'])
    const [c] = befundblaetter(rechneFall(OSM, AV, [], 12, g, null), g, { vorgabe: { bern: true, kantonBE: true } })
    expect(c.vorbelegt.werte.seitenraumVorParklinieM?.wert).toBe(0.1)
    // ohne Element: kein Wert aus dem Plan
    const [d] = befundblaetter(rechneFall(OSM, AV, [], 12, fallMit(() => {}), null), fallMit(() => {}), { vorgabe: { bern: true, kantonBE: true } })
    expect(d.vorbelegt.werte.seitenraumVorParklinieM?.text ?? '').not.toContain('Plan:')
  })
})

describe('Ziehen entlang der Bordkante', () => {
  it('Mitte gleitet auf der Bordkante (Projektion), Masse bleiben, Bordkante neu gemessen; Streifenende nachgeführt', () => {
    const f = fallMit(x => { x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4 }) })
    const { st } = einfuegen(f, [1, 3])
    const h = f.streifenHand[0]
    h.p1 = endeAnLinie(h, 'p1', kanteLinie(st, st, true))!
    const m = seitenraumMitte(st)
    const neu = srVerschieben(st, [m[0] + 1.5, m[1] - 4], sehne)       // quer gezogen: zählt nur der Anteil entlang der Bordkante
    expect(lok(neu.k)).toEqual([1.5, 4])
    expect(neu.kante).toEqual([0, 0])
    expect([neu.tiefePark, neu.ueberstand, neu.breite, neu.randA, neu.randB]).toEqual([st.tiefePark, st.ueberstand, st.breite, st.randA, st.randB])
    const r = endenNachfuehren(f.streifenHand, kanteLinie(st, st, true), kanteLinie(neu, neu, true), kanteLinie(neu, neu, false))
    expect(r.ids).toEqual(['hand-1']); expect(lok(r.streifen[0].p1)).toEqual([0, 1.5])
    // so weit gezogen, dass die Achse das Element nicht mehr quert: Ende zurück an die Bordkante heute
    const weit = srVerschieben(st, [m[0] + 9, m[1]], sehne)
    expect(lok(endenNachfuehren(f.streifenHand, kanteLinie(st, st, true), kanteLinie(weit, weit, true), kanteLinie(weit, weit, false)).streifen[0].p1))
      .toEqual([0, 3.7])
    // ohne Messung: bisherige Gerade weitergeführt
    expect(srVerschieben({ ...st, kante: [0.1, 0.05] }, [m[0] - 2, m[1]], null).kante).toEqual([0.2, 0.05])
  })
})
