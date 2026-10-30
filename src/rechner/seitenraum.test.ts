// Tests vorgezogener Seitenraum (23.10.2026): Einfügen mit bzw. ohne Längsparkierung, Wegfall der überdeckten Parkierung in der
// Sichtprüfung, Fall-Datei, Vorbelegung des Bedarfs (E2b/E2c), Ziehen entlang der Bordkante, Rechnung ohne Element unverändert.
// Künstlicher Knoten wie planflaechen.test.ts: Hauptstrasse West–Ost (Fahrbahn 8 m, y −4 bis 4), Übergang bei x = 0.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { osmParsen } from '../daten/osm'
import { avParsen } from '../daten/av'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { Fahrbahn } from './flaechen'
import { rechneFall } from './index'
import { flaeche } from './poly'
import type { Hindernis } from './hindernisse'
import { leererFall, fallLesen, fallSchreiben, fallVersion, type Fall, type FlaechePlan, type PlanSeitenraum } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { seitenraumLage, seitenraumMasse, kanteMessen, parkMessen, parkRinge, seitenraumKennung, seitenraumRing, kanteLinie, seitenraumMitte,
  seitenraumAngepasst, seitenraumText, planStandardText, parkOhneSeitenraum, endeAnLinie, endenNachfuehren, srVerschieben, srMasseFehler,
  naechsteSrGruppe, seitenraumAnStreifen, seitenraumGemessen, SR_PARK_TIEFE_M, SR_UEBERSTAND_M, SR_HINTEN_M, type ParkRing } from './seitenraum'

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
function einfuegen(f: Fall, rand?: [number, number], nord = true, av: AvFlaeche[] = AV) {
  const r = rechneFall(OSM, av, [], 12, f, null)
  const e = r.streifen[0], k = (e.rand[0][1] > e.rand[1][1]) === nord ? 0 : 1
  const fbx = new Fahrbahn(av), sx = (q: P, rr: P) => fbx.sehne(q, rr)
  const l0 = seitenraumLage(e.p0, e.p1, k, null, e.rand[k])
  const lage = { ...l0, kante: kanteMessen(l0, seitenraumMasse(e.bw, null), sx) ?? [0, 0] as [number, number] }
  const park = parkMessen(parkRinge(f.hindernisse), lage, e.bw, sx)
  const m = seitenraumMasse(e.bw, park)
  if (rand) { m.randA = rand[0]; m.randB = rand[1] }
  const st = seitenraumKennung(naechsteSrGruppe(f.flaechenPlan), lage, m)
  return { st, park, e, k, fp: { id: nord ? 'plan-1' : 'plan-2', art: 'trottoir', ring: seitenraumRing(st, st), standard: st } as FlaechePlan }
}

describe('Einfügen an einem Streifenende', () => {
  it('mit Parkfeldern: Tiefe = Aussenkante der Parkierung + 0,20 m, Länge = Streifenbreite + je 1 m, hinter die Bordkante 0,50 m', () => {
    const { st, park, fp } = einfuegen(fallMit(x => { x.hindernisse.push(FELD) }))
    expect(park).toEqual({ tiefe: 2, ids: ['p1'], rand: [1, 1], quelle: 'parkierung', versetzt: false })
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
    expect(park?.rand).toEqual([1, 2])          // Seite B (Westen): bis an die Längsparkierung 2,00 m nach dem Streifen
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
    // einzelnes Feld: ab 50 % ganz, darunter der Rest; Reihe (Längsparkierung) auch zu mehr als 50 % überdeckt nur gekürzt
    expect(parkOhneSeitenraum([{ ...FELD, ring: rechteck(0, 2, 5, 4) }], poly).ersetzt).toEqual([{ id: 'p1', ganz: true }])
    expect(parkOhneSeitenraum([{ ...FELD, ring: rechteck(1.5, 2, 6.5, 4) }], poly).ersetzt).toEqual([{ id: 'p1', ganz: false }])
    const kurz = parkOhneSeitenraum([{ id: 'l2', art: 'laengsparkierung', linie: [lv(-2, 3), lv(4, 3)], breite: 2, quelle: 'hand' }], poly)
    expect(kurz.ersetzt).toEqual([{ id: 'l2', ganz: false }])
    expect(kurz.hindernisse.map(x => x.art === 'parkfeld' && +flaeche([[x.ring]]).toFixed(6))).toEqual([2])
    // Velo- und Motorradfelder bleiben (Veloparkierung auf dem Seitenraum)
    const velo: Hindernis = { id: 'v', art: 'parkfeld', klasse: 'velo', ring: rechteck(-1, 2, 1, 4), quelle: 'hand' }
    expect(parkOhneSeitenraum([velo], poly)).toEqual({ hindernisse: [velo], ersetzt: [] })
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
  it('neu: Kennzeichnung bleibt beim Schreiben und Lesen, Version 4 nur mit Seitenraum', () => {
    const { fp } = einfuegen(fallMit(() => {}))
    const f = fallMit(x => { x.flaechenPlan = [fp] })
    expect(fallVersion(f)).toBe(4)
    expect(JSON.parse(fallSchreiben(f)).version).toBe(4)
    expect(fallVersion(fallMit(x => { x.flaechenPlan = [{ ...fp, standard: undefined }] }))).toBe(2)
    // eine App mit Version 3 lehnt die Datei ab (statt die Kennzeichnung still zu verlieren); hier: Version 6 abgelehnt
    expect(() => fallLesen(JSON.stringify({ ...JSON.parse(fallSchreiben(f)), version: 6 }))).toThrow('neueren fgsCheck-Version')
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
    // unbekannte Art der Kennzeichnung: neutral gemeldet
    roh.flaechenPlan[0].standard = { typ: 'xyz' }
    expect(fallLesen(JSON.stringify(roh))[1]).toEqual(['Kennzeichnung (Standardelement) von plan-1 unbekannt bzw. ungültig, übergangen (Fläche bleibt)'])
    // ältere Fall-Datei ohne Kennzeichnung
    delete roh.flaechenPlan[0].standard
    const [a, ha] = fallLesen(JSON.stringify(roh))
    expect(ha).toEqual([]); expect(a.flaechenPlan![0].standard).toBeUndefined()
  })
})

describe('Bedarf: Vorbelegung E2b/E2c', () => {
  const B = { vorgabe: { bern: true, kantonBE: true } }
  const blatt = (f: Fall) => befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, B)[0]
  const planWert = (f: Fall) => blatt(f).vorbelegt.werte.seitenraumVorParklinieM?.text?.startsWith('Plan:') ?? false
  it('seitenraumVorParklinieM aus dem Element (Überstand), Quelle Plan', () => {
    const { fp, st } = einfuegen(fallMit(x => { x.hindernisse.push(FELD) }))
    const f = fallMit(x => { x.hindernisse.push(FELD); x.flaechenPlan = [fp] })
    const [b] = befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, { vorgabe: { bern: true, kantonBE: true } })
    expect(b.vorbelegt.werte.seitenraumVorParklinieM).toMatchObject({ wert: 0.2, quelle: 'rechnung' })
    expect(b.vorbelegt.werte.seitenraumVorParklinieM.text).toContain('Plan: vorgezogener Seitenraum (Plan-Fläche 1)')
    const st1: PlanSeitenraum = { ...st, ueberstand: 0.1 }
    const g = fallMit(x => { x.hindernisse.push(FELD); x.flaechenPlan = [{ ...fp, ring: seitenraumRing(st1, st1), standard: st1 }] })
    expect(seitenraumAnStreifen(g.flaechenPlan, rechneFall(OSM, AV, [], 12, g, null).streifen).map(x => x.id)).toEqual(['plan-1'])
    const [c] = befundblaetter(rechneFall(OSM, AV, [], 12, g, null), g, { vorgabe: { bern: true, kantonBE: true } })
    expect(c.vorbelegt.werte.seitenraumVorParklinieM?.wert).toBe(0.1)
    // ohne Element: kein Wert aus dem Plan
    const [d] = befundblaetter(rechneFall(OSM, AV, [], 12, fallMit(() => {}), null), fallMit(() => {}), { vorgabe: { bern: true, kantonBE: true } })
    expect(d.vorbelegt.werte.seitenraumVorParklinieM?.text ?? '').not.toContain('Plan:')
    // Art gewechselt bzw. Form von Hand verändert: kein Messbezug, keine Vorbelegung und keine Wirkung auf die Parkierung
    const art = fallMit(x => { x.hindernisse.push(FELD); x.flaechenPlan = [{ ...fp, art: 'fahrbahn' }] })
    expect(planWert(art)).toBe(false); expect(seitenraumGemessen(art.flaechenPlan![0])).toBeNull()
    expect(rechneFall(OSM, AV, [], 12, art, null).seitenraumErsetzt).toBeUndefined()
    expect(planWert(fallMit(x => { x.hindernisse.push(FELD); x.flaechenPlan = [{ ...fp, ring: fp.ring.slice(1) }] }))).toBe(false)
  })
  const PN: Hindernis = { id: 'ln', art: 'laengsparkierung', linie: [lv(-60, 3), lv(60, 3)], breite: 2, quelle: 'hand' }
  const PS: Hindernis = { id: 'ls', art: 'laengsparkierung', linie: [lv(-60, -3), lv(60, -3)], breite: 2, quelle: 'hand' }
  it('Parkierung beidseits: Element nur Nord -> keine Vorbelegung aus dem Plan; Elemente an beiden Parkierungsenden -> kleinster Überstand', () => {
    const f0 = fallMit(x => { x.hindernisse.push(PN, PS) })
    const n = einfuegen(f0), sd = einfuegen(f0, undefined, false)
    expect([n.st.parkQuelle, sd.st.parkQuelle]).toEqual(['parkierung', 'parkierung'])
    expect(planWert(fallMit(x => { x.hindernisse.push(PN, PS); x.flaechenPlan = [n.fp] }))).toBe(false)
    const beide = fallMit(x => { x.hindernisse.push(PN, PS); x.flaechenPlan = [n.fp, sd.fp] })
    expect(blatt(beide).vorbelegt.werte.seitenraumVorParklinieM).toMatchObject({ wert: 0.2, quelle: 'rechnung' })
  })
  it('Parkierung nur Süd, Element Nord mit angenommener Tiefe -> keine Vorbelegung aus dem Plan', () => {
    const f0 = fallMit(x => { x.hindernisse.push(PS) })
    const n = einfuegen(f0)
    expect(n.st.parkQuelle).toBe('annahme')
    expect(planWert(fallMit(x => { x.hindernisse.push(PS); x.flaechenPlan = [n.fp] }))).toBe(false)
  })
})

describe('Messen gegen die örtliche Bordkante', () => {
  /** Nordkante gekrümmt (Bogen mit Radius R, Scheitel bei x = 0): y = 4 + x²/(2R), als Polygon alle 0,5 m */
  const kurve = (R: number) => {
    const xs = Array.from({ length: 161 }, (_, i) => -40 + i * 0.5), y = (x: number) => 4 + x * x / (2 * R)
    const nord = xs.map(x => lv(x, y(x)))
    const av2 = [av('Strasse_Weg', [lv(-40, -4), lv(40, -4), ...nord.slice().reverse()]), av('Trottoir', [...nord, ...xs.slice().reverse().map(x => lv(x, y(x) + 3))]),
      av('Trottoir', rechteck(-40, -7, 40, -4))]
    // Parkfeld 2 m tief senkrecht zur Kante, x 7..13 bzw. −13..−7
    const feld = (x0: number, x1: number): P[] => {
      const n = (x: number): P => { const g = x / R, l = Math.hypot(1, g); return [g / l, -1 / l] }
      const xs2 = [x0, (x0 + x1) / 2, x1]
      return [...xs2.map(x => lv(x, y(x))), ...xs2.slice().reverse().map(x => { const v = n(x); return lv(x + 2 * v[0], y(x) + 2 * v[1]) })]
    }
    return { av2, felder: [{ id: 'a', ring: feld(7, 13) }, { id: 'b', ring: feld(-13, -7) }] as ParkRing[] }
  }
  for (const R of [50, 100]) it(`Kurve R = ${R} m: Parkstreifen ≈ 2,00 m`, () => {
    const { av2, felder } = kurve(R)
    const fb2 = new Fahrbahn(av2)
    const lage = { k: lv(0, 4), balken: [-1, 0] as P, tief: [0, -1] as P, kante: [0, 0] as [number, number] }
    const m = parkMessen(felder, lage, 4, (q, r) => fb2.sehne(q, r))
    expect(m?.ids).toEqual(['a', 'b']); expect(m!.tiefe).toBeGreaterThan(1.95); expect(m!.tiefe).toBeLessThan(2.05)
    expect(m!.rand).toEqual([5, 5])                                           // erstes Feld 5 m nach dem Streifenrand
    expect(m!.versetzt).toBe(false)                                           // stetiger Verlauf: örtliche Kante
  })
  it('lange Reihen: Längsparkierung über den Block bzw. langes Kataster-Polygon (nur Ecken) -> 2,00 m; Median statt Maximum', () => {
    const lage = { k: lv(0, 4), balken: [-1, 0] as P, tief: [0, -1] as P, kante: [0, 0] as [number, number] }
    const lang = parkRinge([{ id: 'L', art: 'laengsparkierung', linie: [lv(-80, 3), lv(-20, 3.2), lv(20, 3.2), lv(80, 3)], breite: 2, quelle: 'hand' }])
    expect(parkMessen(lang, lage, 4, sehne)?.tiefe).toBeCloseTo(1.8, 6)   // Aussenkante y = 2,2 nahe dem Streifen, nicht y = 2,0 weit weg
    const kat: ParkRing[] = [{ id: 'K', ring: [lv(-20, 4), lv(20, 4), lv(20, 2), lv(-20, 2)] }]
    const mk = parkMessen(kat, lage, 4, sehne)!
    expect(mk.tiefe).toBeCloseTo(2, 6); expect(mk.rand).toEqual([0.5, 0.5])    // Reihe reicht in den Streifen: Mindestrand
    const drei: ParkRing[] = [{ id: '1', ring: rechteck(5, 2, 10, 4) }, { id: '2', ring: rechteck(-10, 2, -5, 4) }, { id: '3', ring: rechteck(12, 1, 17, 4) }]
    expect(parkMessen(drei, lage, 4, sehne)?.tiefe).toBe(2)                     // Median, nicht 3,00 m des tiefen Felds
    // nur OSM-Vorschläge: Quelle Annahme
    expect(parkMessen([{ ...kat[0], annahme: true }], lage, 4, sehne)?.quelle).toBe('annahme')
  })
  it('Länge bis zum ersten Parkfeld (höchstens 5 m), sonst Streifenbreite + je 1 m', () => {
    const lage = { k: lv(0, 4), balken: [-1, 0] as P, tief: [0, -1] as P, kante: [0, 0] as [number, number] }
    const m = parkMessen([{ id: '1', ring: rechteck(5, 2, 11, 4) }, { id: '2', ring: rechteck(-14, 2, -8, 4) }], lage, 4, sehne)!
    expect(m.rand).toEqual([3, 5])                                             // A (Osten) bis x = 5; B: Feld 6 m nach dem Rand -> höchstens 5
    expect(seitenraumMasse(4, m)).toMatchObject({ randA: 3, randB: 5 })
    expect(parkMessen([{ id: '1', ring: rechteck(2.2, 2, 8, 4) }], lage, 4, sehne)!.rand).toEqual([0.5, 1])   // 0,2 m: Mindestrand
  })
  /** Nordkante y = yc(x) (alle 0,5 m), Felder 2 m tief entlang der Kante 8–14 m vom Streifen; extra: weitere AV-Flächen */
  const welle = (yc: (x: number) => number, extra: AvFlaeche[] = []) => {
    const xs = Array.from({ length: 161 }, (_, i) => -40 + i * 0.5)
    const avW = [av('Strasse_Weg', [lv(-40, -4), lv(40, -4), ...xs.slice().reverse().map(x => lv(x, yc(x)))]),
      av('Trottoir', [...xs.map(x => lv(x, yc(x))), ...xs.slice().reverse().map(x => lv(x, yc(x) + 4))]), ...extra]
    const fbW = new Fahrbahn(avW), sW = (q: P, r: P) => fbW.sehne(q, r)
    const l0 = seitenraumLage(lv(0, -4), lv(0, yc(0)), 1, null, lv(0, yc(0)))
    const l = { ...l0, kante: kanteMessen(l0, seitenraumMasse(4, null), sW) ?? [0, 0] as [number, number] }
    const ring = (x0: number, x1: number): ParkRing => {
      const s1: number[] = []; for (let x = x0; x <= x1; x += 1) s1.push(x)
      return { id: `f${x0}`, ring: [...s1.map(x => lv(x, yc(x))), ...s1.slice().reverse().map(x => lv(x, yc(x) - 2))] }
    }
    return parkMessen([ring(8, 14), ring(-14, -8)], l, 4, sW)
  }
  for (const sg of [1, -1]) it(`enge Kurve R = 25 m (${sg > 0 ? 'vom Streifen weg' : 'zur Fahrbahn hin'} gekrümmt): Parkstreifen ≈ 2,00 m`, () => {
    const m = welle(x => 4 + sg * x * x / 50)!
    expect(m.ids).toHaveLength(2); expect(Math.abs(m.tiefe - 2)).toBeLessThan(0.1); expect(m.versetzt).toBe(false)
  })
  it('Einfahrt (Fahrbahnlappen 3 × 1,5 m zwischen Streifen und Feld) gilt nicht als versetzt', () => {
    const m = welle(x => 4 - x * x / 200, [av('Strasse_Weg', [lv(4, 4 - 16 / 200), lv(7, 4 - 49 / 200), lv(7, 5.5), lv(4, 5.5)])])!
    expect(m.versetzt).toBe(false); expect(Math.abs(m.tiefe - 2)).toBeLessThan(0.05)
  })
  it('Bordkante versetzt (Nase an der Querung, Parkbucht): Tiefe gegen die Kante am Streifen, nicht doppelt', () => {
    // Nordkante y = 5 (Parkbucht), an der Querung |x| < 4 Trottoirnase bis y = 4; Parklinie y = 3: 1 m vor der Nasenkante
    const avB = [av('Strasse_Weg', [lv(-40, -4), lv(40, -4), lv(40, 5), lv(4, 5), lv(4, 4), lv(-4, 4), lv(-4, 5), lv(-40, 5)]),
      av('Trottoir', [lv(-40, 5), lv(-4, 5), lv(-4, 4), lv(4, 4), lv(4, 5), lv(40, 5), lv(40, 8), lv(-40, 8)])]
    const fbB = new Fahrbahn(avB), sB = (q: P, r: P) => fbB.sehne(q, r)
    const l0 = seitenraumLage(lv(0, -4), lv(0, 4), 1, null, lv(0, 4))
    const l = { ...l0, kante: kanteMessen(l0, seitenraumMasse(4, null), sB) ?? [0, 0] as [number, number] }
    const feld = (x0: number, x1: number): ParkRing => ({ id: `f${x0}`, ring: [lv(x0, 3), lv(x1, 3), lv(x1, 5), lv(x0, 5)] })
    const m = parkMessen([feld(7, 13), feld(-13, -7)], l, 4, sB)!
    expect(m.tiefe).toBeCloseTo(1, 6); expect(m.versetzt).toBe(true)
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
    const weg = endenNachfuehren(f.streifenHand, kanteLinie(st, st, true), kanteLinie(weit, weit, true), kanteLinie(weit, weit, false))
    expect(lok(weg.streifen[0].p1)).toEqual([0, 3.7])
    // zurückgezogen: das Ende an der Bordkante heute folgt wieder an die Vorderkante
    const zurueck = endenNachfuehren(weg.streifen, kanteLinie(weit, weit, true), kanteLinie(st, st, true), kanteLinie(st, st, false), kanteLinie(weit, weit, false))
    expect(zurueck.ids).toEqual(['hand-1']); expect(lok(zurueck.streifen[0].p1)).toEqual([0, 1.5])
    // ohne Messung: bisherige Gerade weitergeführt
    expect(srVerschieben({ ...st, kante: [0.1, 0.05] }, [m[0] - 2, m[1]], null).kante).toEqual([0.2, 0.05])
  })
})

// Beispiel Marienstrasse 405 (Referenz Bern, nur lokal mit FGS_REFERENZ): Einbahn, Parkierung rechts der Zufahrt am Ende A
const REF = process.env.FGS_REFERENZ ?? ''
describe.skipIf(!REF || !existsSync(join(REF, 'cache', 'av_405.json')))('Referenz Bern 405 (nur lokal)', () => {
  it('Ende A: Parkstreifen aus dem Kataster, Vorbelegung aus dem Plan; Ende B (ohne Parkierung): keine Vorbelegung aus dem Plan', () => {
    const lesen = (n: string) => JSON.parse(readFileSync(join(REF, 'cache', n), 'utf-8'))
    const ref = JSON.parse(readFileSync(join(REF, 'referenz.json'), 'utf-8')).streifen.find((x: { fgs_id: number }) => x.fgs_id === 405)
    const avR = avParsen(lesen('av_405.json')), osm = osmParsen(lesen('osm_405.json')), hRoh = lesen('hindernisse_405.json')
    const park = { felder: hRoh.felder.filter((f: { ring: P[] }) => f.ring.length >= 3).map((f: { id: string; klasse: 'auto'; ring: P[]; layer: string }) =>
      ({ id: f.id, klasse: f.klasse, ring: f.ring, name: f.layer })), quellenangabe: 'Parkkataster' }
    const nid: number = ref.osm_knoten.id
    const [la, lo] = wgs(ref.mitte[0], ref.mitte[1])
    const neu = () => leererFall(la, lo, nid)
    const r0 = rechneFall(osm, avR, [], nid, neu(), null, null, park)
    const e = r0.streifen[0], fbR = new Fahrbahn(avR), sx = (q: P, r: P) => fbR.sehne(q, r)
    const ergebnis = (k: 0 | 1) => {
      const l0 = seitenraumLage(e.p0, e.p1, k, null, e.rand[k])
      const lage = { ...l0, kante: kanteMessen(l0, seitenraumMasse(e.bw, null), sx) ?? [0, 0] as [number, number] }
      const pm = parkMessen(parkRinge([], r0.vorschlaege.map(v => v.hindernis)), lage, e.bw, sx)
      const st = seitenraumKennung('sr-1', lage, seitenraumMasse(e.bw, pm))
      const f = neu(); f.flaechenPlan = [{ id: 'plan-1', art: 'trottoir', ring: seitenraumRing(st, st), standard: st }]
      const r = rechneFall(osm, avR, [], nid, f, null, null, park)
      return { pm, r, w: befundblaetter(r, f, { vorgabe: { bern: true, kantonBE: true } })[0].vorbelegt.werte.seitenraumVorParklinieM }
    }
    const kA = e.rand[0][1] > e.rand[1][1] ? 0 : 1                          // Ende A der Referenz (Nordseite)
    const a = ergebnis(kA), b = ergebnis(kA === 0 ? 1 : 0)
    expect(a.pm?.quelle).toBe('parkierung'); expect(a.pm!.versetzt).toBe(true); expect(a.pm!.tiefe).toBeCloseTo(1.15, 1)
    expect(a.w).toMatchObject({ wert: 0.2, quelle: 'rechnung' })
    expect(b.pm).toBeNull(); expect(b.w?.text ?? '').not.toContain('Plan:')
    expect(a.r.streifen[0].zufahrten[0].freiBisM!).toBeGreaterThan(r0.streifen[0].zufahrten[0].freiBisM!)
  })
})
