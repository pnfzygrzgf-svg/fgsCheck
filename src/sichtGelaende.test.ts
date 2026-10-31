// Tests Sicht auf die Wartefläche mit Gelände (Entscheid 30.10.2026, sichtGelaende.ts): künstliche Höhenprofile über einen eingespeisten
// Lader, kein Abruf; Geometrie, Verfeinerung, Prüfsumme, Zusammenführung des Status und Texte.
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { ProfilPunkt } from './knotensicht/rechner/neigung'
import type { Poly } from './rechner/poly'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { RANG_STATUS } from './rechner/typen'
import { AUGHOEHE_M } from './rechner/erkennung'
import { GELAENDE_TOL_M, gelaendeFrei, type GelaendeStand, type ProfilLader } from './erkennungGelaende'
import { SICHT_ABFRAGEN_MAX, STATUS_GELAENDE, ZIEL_HOEHE_WARTE_M, linieBei, rechnungMitSichtGelaende, sichtGelaendeAnzeige, sichtGelaendePruefen,
  sichtGelaendeSchluessel, sichtGelaendeText, sichtGeo, sichtLinien, streifenStatusNeu, warteZiele, zielBei, zufahrtMitGelaende } from './sichtGelaende'
import { STATUS, statusKurzKarte, statusText } from './texte'
import { wgs } from './geo'
import { rechneFall } from './rechner'
import { leererFall } from './fall'
import type { OsmDaten, OsmKnoten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'

/** Profil der Länge L mit der Höhe h(d) alle 2 m */
const profil = (L: number, h: (d: number) => number): ProfilPunkt[] =>
  Array.from({ length: Math.round(L / 2) + 1 }, (_, i) => ({ dist: Math.min(L, i * 2), h: h(Math.min(L, i * 2)) }))
/** Sichtpunkte alle 2 m entlang x = 1,5 (Fahrt nach Süden auf den Streifen bei y < 0) */
const punkte = (L: number): P[] => Array.from({ length: Math.floor(L / 2) + 1 }, (_, i) => [1.5, Math.min(L, i * 2)] as P)
  .concat(L % 2 ? [[1.5, L] as P] : [])
/** Warteflächen beidseits: rechts x 4 bis 6, links x −6 bis −4, je y −4 bis −1 */
const ANN: Poly[] = [[[[4, -4], [6, -4], [6, -1], [4, -1]]], [[[-6, -4], [-4, -4], [-4, -1], [-6, -1]]]]
const zuf = (sw: number, extra: Partial<ZufahrtErgebnis> = {}): ZufahrtErgebnis => ({ fgsId: 'f1', zufahrt: 'n', art: 'beide', sichtweite: sw,
  sichtpunkte: punkte(sw), status: 'frei', konflikte: [], freiBisM: sw, ...extra } as unknown as ZufahrtErgebnis)
/** Lader: Kuppe quer über die Fahrbahn bei y = kuppeY, 2 m hoch, nur für Augpunkte mehr als 3 m dahinter */
function kuppe(kuppeY: number): { laden: ProfilLader; n: () => number } {
  let n = 0
  return {
    n: () => n,
    laden: async (a, b) => {
      n++
      const L = Math.hypot(a[0] - b[0], a[1] - b[1])
      return profil(L, d => (Math.abs(a[1] + d * (b[1] - a[1]) / L - kuppeY) < 3 && a[1] - kuppeY > 3 ? 2 : 0))
    },
  }
}
const werteVon = (z: ZufahrtErgebnis, st: GelaendeStand): Record<string, GelaendeStand> => ({ [sichtGelaendeSchluessel(z, ANN)!]: st })

describe('Sicht auf die Wartefläche: Sichtlinie gegen das Höhenprofil', () => {
  it('Ziel 0,60 m über dem Boden (Parameter von gelaendeFrei), Toleranz wie bei der Erkennung', () => {
    expect(ZIEL_HOEHE_WARTE_M).toBe(0.6)
    expect(AUGHOEHE_M).toBe(1.0)
    // Linie bei d = 24 von 50 m: 1,0 + (0,6 − 1,0) · 0,48 = 0,808 m über dem Boden
    const mitte = 1.0 + (0.6 - 1.0) * 0.48
    expect(gelaendeFrei(profil(50, d => (d === 24 ? mitte + GELAENDE_TOL_M + 0.1 : 0)), GELAENDE_TOL_M, ZIEL_HOEHE_WARTE_M)).toBe(false)
    expect(gelaendeFrei(profil(50, d => (d === 24 ? mitte + GELAENDE_TOL_M - 0.1 : 0)), GELAENDE_TOL_M, ZIEL_HOEHE_WARTE_M)).toBe(true)
    // dieselbe Erhebung mit dem Ziel am Boden (Erkennungsdistanz) verdeckt
    expect(gelaendeFrei(profil(50, d => (d === 24 ? mitte + GELAENDE_TOL_M - 0.1 : 0)))).toBe(false)
    // gleichmässig geneigt bleibt frei
    expect(gelaendeFrei(profil(50, d => 500 + 0.08 * d), GELAENDE_TOL_M, ZIEL_HOEHE_WARTE_M)).toBe(true)
  })
})

describe('Sicht auf die Wartefläche: Sichtlinien', () => {
  it('Augpunkte alle 10 m bis zum Soll und am Soll; Ziel die Ecke der Wartefläche mit dem grössten Winkel zur Fahrtrichtung', () => {
    const g = sichtGeo(zuf(55), ANN)!
    expect(g.bis).toBe(55)
    expect(warteZiele(ANN)).toHaveLength(8)
    const l = sichtLinien(g)
    expect(l.map(x => x.x)).toEqual([10, 20, 30, 40, 50, 55])
    expect(l[0].auge).toEqual([1.5, 10])
    // vom Augpunkt (1,5 | 10) nach Süden: die Ecke links aussen (−6 | −1) weicht am stärksten ab
    expect(l[0].ziel).toEqual([-6, -1])
    expect(zielBei([0, 10], [0, -1], [[1, 0], [-2, 0], [0, 0]])).toEqual([-2, 0])
    // Sichtpunkte kürzer als das Soll (Querung ohne Vortritt über die Reichweite): bis zum letzten Sichtpunkt
    expect(sichtGeo(zuf(80, { sichtpunkte: punkte(34) }), ANN)!.bis).toBe(34)
    expect(sichtGeo(zuf(30, { sichtpunkte: [[0, 0]] }), ANN)).toBeNull()
    expect(sichtGeo(zuf(30), [])).toBeNull()
  })
  it('Abbiegezufahrt: Abstand entlang der gekrümmten Sichtpunkte', () => {
    // Viertelkreis mit Radius 20 m um (20 | 0), alle rund 2 m
    const sp: P[] = Array.from({ length: 17 }, (_, i) => { const t = (i / 16) * Math.PI / 2; return [20 - 20 * Math.cos(t), 20 * Math.sin(t)] as P })
    const g = sichtGeo(zuf(25, { sichtpunkte: sp, art: 'abbiegend' }), ANN)!
    expect(g.bis).toBeCloseTo(25, 0)
    const q = linieBei(g, 10)
    // Bogenlänge 10 m: Winkel 0,5 rad
    expect(q.auge[0]).toBeCloseTo(20 - 20 * Math.cos(0.5), 1)
    expect(q.auge[1]).toBeCloseTo(20 * Math.sin(0.5), 1)
  })
})

describe('Sicht auf die Wartefläche: Prüfung je Zufahrt', () => {
  it('Kuppe bei 32 m: verdeckt ab 35 m (Verfeinerung), 8 Abfragen; Zufahrt nicht erfüllt, Streifen ebenso', async () => {
    const z = zuf(55)
    const k = kuppe(32)
    const e = await sichtGelaendePruefen(sichtGeo(z, ANN)!, k.laden)
    // 6 Linien + 2 halbierende (30 → 40: 35 frei, 37,5 verdeckt)
    expect(k.n()).toBe(8)
    expect(e).toMatchObject({ abM: 35, abfragen: 8 })
    expect(e.frei['30.00']).toBe(true)
    expect(e.frei['40.00']).toBe(false)
    const zz = zufahrtMitGelaende(z, ANN, werteVon(z, { stand: 'ok', ...e }))
    expect(zz.status).toBe(STATUS_GELAENDE)
    expect(zz.freiBisM).toBe(35)
    expect(zz.sichtGelaende).toMatchObject({ stand: 'mit', abM: 35, bisM: 55 })
    expect(zz.sichtGelaende!.linien.find(l => l.x === 40)!.frei).toBe(false)
    expect(zz.sichtGelaende!.linien.find(l => l.x === 20)!.frei).toBe(true)
    expect(sichtGelaendeText(zz.sichtGelaende!)).toBe('Gelände: verdeckt ab 35 m (swissALTI3D)')
    expect(statusText(zz, [])).toBe('verdeckt (Gelände, swissALTI3D)')
    expect(STATUS[STATUS_GELAENDE]).toBe('verdeckt (Gelände, swissALTI3D)')
    // Streifen: höchster Status seiner Zufahrten
    const s = { fgsId: 'f1', status: 'frei', ann: ANN, zufahrten: [z, zuf(55, { zufahrt: 's' })] } as unknown as StreifenErgebnis
    const r = rechnungMitSichtGelaende({ streifen: [s] }, werteVon(z, { stand: 'ok', ...e }))!
    expect(r.streifen[0].status).toBe(STATUS_GELAENDE)
    expect(r.streifen[0].zufahrten.map(x => x.status)).toEqual([STATUS_GELAENDE, 'frei'])
    // die Rechnung selbst bleibt unverändert
    expect(s.status).toBe('frei')
    expect(z.status).toBe('frei')
  })
  it('2D-Befund bleibt als Status; Rang des Geländes zwischen Gebäude und Auto-Parkfeld', async () => {
    const z = zuf(55, { status: 'verdeckt_baum', freiBisM: 44 })
    const e = await sichtGelaendePruefen(sichtGeo(z, ANN)!, kuppe(12).laden)
    expect(e.abM).toBeGreaterThanOrEqual(10)
    expect(e.abM).toBeLessThan(20)
    const zz = zufahrtMitGelaende(z, ANN, werteVon(z, { stand: 'ok', ...e }))
    expect(zz.status).toBe('verdeckt_baum')
    expect(zz.freiBisM).toBe(e.abM)
    expect(RANG_STATUS[STATUS_GELAENDE]).toBeGreaterThan(RANG_STATUS.verdeckt_gebaeude)
    expect(RANG_STATUS[STATUS_GELAENDE]).toBeLessThan(RANG_STATUS.verdeckt)
    expect(streifenStatusNeu({ status: 'verdeckt_baum', zufahrten: [{ status: 'verdeckt_baum' }, { status: STATUS_GELAENDE }] as ZufahrtErgebnis[] }))
      .toBe(STATUS_GELAENDE)
    expect(streifenStatusNeu({ status: 'ohne_zufahrt', zufahrten: [] })).toBe('ohne_zufahrt')
  })
  it('Gelände frei: Status und «frei bis» unverändert, «Gelände: frei»', async () => {
    const z = zuf(40)
    const k = kuppe(-100)
    const e = await sichtGelaendePruefen(sichtGeo(z, ANN)!, k.laden)
    expect(e).toMatchObject({ abM: null, abfragen: 4 })
    const zz = zufahrtMitGelaende(z, ANN, werteVon(z, { stand: 'ok', ...e }))
    expect(zz.status).toBe('frei')
    expect(zz.freiBisM).toBe(40)
    expect(sichtGelaendeText(zz.sichtGelaende!)).toBe('Gelände: frei')
  })
  it('höchstens 14 Abfragen je Zufahrt, auch bei 110 m', async () => {
    const k = kuppe(104)
    const e = await sichtGelaendePruefen(sichtGeo(zuf(110), ANN)!, k.laden)
    expect(k.n()).toBe(13)
    expect(e.abfragen).toBeLessThanOrEqual(SICHT_ABFRAGEN_MAX)
    expect(e.abM).toBeGreaterThanOrEqual(100)
    expect(e.abM).toBeLessThan(110)
  })
  it('kein Profil (Fehler bzw. lädt): Rechnung bleibt 2D mit «Gelände: nicht geprüft»; andere Lage der Linien zählt nicht', async () => {
    const z = zuf(55)
    const g = sichtGeo(z, ANN)!
    await expect(sichtGelaendePruefen(g, async () => { throw new Error('HTTP 500') })).rejects.toThrow('HTTP 500')
    await expect(sichtGelaendePruefen(g, async () => [])).rejects.toThrow('Höhenprofil ohne Höhen')
    const ab = Object.assign(new Error('abgebrochen'), { name: 'AbortError' })
    await expect(sichtGelaendePruefen(g, async () => { throw ab })).rejects.toThrow('abgebrochen')
    for (const w of [null, werteVon(z, { stand: 'fehler', text: 'HTTP 500' })]) {
      const zz = zufahrtMitGelaende(z, ANN, w)
      expect(zz.status).toBe('frei')
      expect(sichtGelaendeText(zz.sichtGelaende!)).toBe('Gelände: nicht geprüft')
    }
    expect(sichtGelaendeText(zufahrtMitGelaende(z, ANN, werteVon(z, { stand: 'laedt' })).sichtGelaende!)).toBe('Gelände: lädt')
    // Prüfsumme: verschobene Sichtpunkte, andere Warteflächen bzw. anderes Soll geben einen anderen Schlüssel
    const key = sichtGelaendeSchluessel(z, ANN)!
    const z2 = zuf(55, { sichtpunkte: punkte(55).map(p => [p[0] + 0.5, p[1]] as P) })
    expect(sichtGelaendeSchluessel(z2, ANN)).not.toBe(key)
    expect(sichtGelaendeSchluessel(z, [ANN[0]])).not.toBe(key)
    expect(sichtGelaendeSchluessel(zuf(55, { sichtweite: 50 }), ANN)).not.toBe(key)
    expect(sichtGelaendeSchluessel(zuf(55), ANN)).toBe(key)
    expect(zufahrtMitGelaende(z2, ANN, { [key]: { stand: 'ok', abM: 20, frei: {}, abfragen: 8 } }).status).toBe('frei')
  })
  it('Brücke: Linien mit Augpunkt bzw. Ziel auf der Brücke werden nicht geprüft', async () => {
    const z = zuf(55)
    const bruecke = { enthaelt: (p: P) => p[1] > 15 && p[1] < 45 }
    const g = sichtGeo(z, ANN)!
    const e = await sichtGelaendePruefen(g, kuppe(-100).laden, bruecke)
    expect(e.abfragen).toBe(3)
    expect(Object.keys(e.frei).sort()).toEqual(['10.00', '50.00', '55.00'])
    expect(sichtGelaendeSchluessel(z, ANN, bruecke)).not.toBe(sichtGelaendeSchluessel(z, ANN))
    const a = sichtGelaendeAnzeige(z, ANN, { [sichtGelaendeSchluessel(z, ANN, bruecke)!]: { stand: 'ok', ...e } }, bruecke)!
    expect(a.linien.find(l => l.x === 30)).toMatchObject({ frei: null, bruecke: true })
    expect(sichtGelaendeText(a)).toBe('Gelände: frei (Sichtlinien auf der Brücke nicht geprüft)')
    // alle Linien auf der Brücke: nicht prüfbar
    const ganz = { enthaelt: () => true }
    const e2 = await sichtGelaendePruefen(g, kuppe(-100).laden, ganz)
    expect(e2).toEqual({ abM: null, frei: {}, abfragen: 0 })
    expect(sichtGelaendeText(sichtGelaendeAnzeige(z, ANN, { [sichtGelaendeSchluessel(z, ANN, ganz)!]: { stand: 'ok', ...e2 } }, ganz)!))
      .toBe('Gelände: nicht prüfbar (Brücke)')
  })
  it('Rechnung zum Zeigen: Trottoirüberfahrt und «kein FGS» unverändert, null bleibt null', () => {
    const tue = { fgsId: 't', status: 'kein_fgs', trottoirueberfahrt: true, ann: ANN, zufahrten: [] } as unknown as StreifenErgebnis
    const kein = { fgsId: 'k', status: 'kein_fgs', ann: ANN, zufahrten: [zuf(30)] } as unknown as StreifenErgebnis
    const r = rechnungMitSichtGelaende({ streifen: [tue, kein] }, null)!
    expect(r.streifen[0]).toBe(tue)
    expect(r.streifen[1]).toBe(kein)
    expect(rechnungMitSichtGelaende(null, null)).toBeNull()
  })
})

// Rechnung an einer künstlichen geraden Strasse (wie erkennungGelaende.test.ts): echte Sichtpunkte und Warteflächen

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, kn: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: kn.map(k => k[0]), geom: kn.map(k => ll(k[1], k[2])) })
const UEB: OsmKnoten = { id: 12, tags: { highway: 'crossing', crossing: 'marked' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [UEB] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]

describe('Sicht auf die Wartefläche: an der gerechneten Zufahrt', () => {
  it('Kuppe 30 m westlich: Zufahrt aus Westen verdeckt, die aus Osten frei; Streifen verdeckt', async () => {
    const fall = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
    const r = rechneFall(OSM, AV, [], 12, fall, null)
    const s = r.streifen[0]
    const zs = s.zufahrten.filter(x => x.art !== 'abbiegend')
    expect(zs.every(z => z.status === 'frei')).toBe(true)
    const werte: Record<string, GelaendeStand> = {}
    let n = 0
    for (const z of zs) {
      const g = sichtGeo(z, s.ann)!
      expect(g.bis).toBeCloseTo(z.sichtweite, 0)
      expect(sichtLinien(g).length).toBe(Math.ceil(z.sichtweite / 10))
      // Hügel quer über die Fahrbahn bei x = −30, für Augpunkte weiter westlich als −33
      const e = await sichtGelaendePruefen(g, async (a, b) => {
        n++
        const L = Math.hypot(a[0] - b[0], a[1] - b[1])
        return profil(L, d => (Math.abs(a[0] - O[0] + d * (b[0] - a[0]) / L + 30) < 3 && a[0] - O[0] < -33 ? 2 : 0))
      })
      expect(e.abfragen).toBeLessThanOrEqual(SICHT_ABFRAGEN_MAX)
      werte[sichtGelaendeSchluessel(z, s.ann)!] = { stand: 'ok', ...e }
    }
    expect(n).toBeGreaterThan(0)
    const m = rechnungMitSichtGelaende(r, werte)!
    const west = m.streifen[0].zufahrten.find(x => x.richtung === 0)!, ost = m.streifen[0].zufahrten.find(x => x.richtung === 180)!
    expect(west.status).toBe(STATUS_GELAENDE)
    expect(west.sichtGelaende!.abM).toBeGreaterThan(20)
    expect(west.sichtGelaende!.abM).toBeLessThan(35)
    expect(ost.status).toBe('frei')
    expect(ost.sichtGelaende).toMatchObject({ stand: 'mit', abM: null })
    expect(m.streifen[0].status).toBe(STATUS_GELAENDE)
    expect(r.streifen[0].status).toBe('frei')
  })
})

describe('Sicht auf die Wartefläche: Tooltip des Sichtfelds', () => {
  it('«verdeckt (Gelände)» statt des Status-Codes', () => {
    expect(statusKurzKarte(STATUS_GELAENDE)).toBe('verdeckt (Gelände)')
    expect(statusKurzKarte('verdeckt_gebaeude')).toBe('verdeckt gebaeude')
  })
})
