// Tests der Luftbild-Erkennung mit synthetischen Bildern (keine echten Luftbilder im Repo)
import { afterEach, describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import { lab, merkmalGelb, taktKorrelation, nccVorlage, bildAusPixeln, streifenImBild, type TeilErkannt } from './luftbild'
import { inselAusBalken, luftbildInsel, teilAbschnitt, inselAusOsmSetzen, osmInselHinweis, BALKEN_DURCH } from './streifen'
import { Inseln } from './flaechen'
import { rechneFall } from './index'
import { leererFall, streifenUebernehmen, INSEL_UEBERNOMMEN } from '../fall'
import type { OsmDaten } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'

const O: P = [2600000, 1200000]
const RES = 0.1, HALB = 30
const BOX: [number, number, number, number] = [O[0] - HALB, O[1] - HALB, O[0] + HALB, O[1] + HALB]
const GELB = [225, 195, 45], BELAG = [95, 95, 98], GRUEN = [60, 110, 50]

/** Zufall mit Saat (wiederholbar) */
function zufall(saat: number) { let s = saat >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

/**
 * Synthetisches Luftbild: Fahrbahn West–Ost (|y| ≤ halbBreite), Balken parallel zur Fahrbahn (Länge bw) im Takt P quer,
 * Mitte bei x = ux; schräg: Balkenmitten verschieben sich um y·tan(schraeg); luecke: y-Bereich ohne Fahrbahn (Insel).
 */
function bild(o: { ux?: number; bw?: number; P?: number; halbBreite?: number; schraeg?: number; insel?: [number, number];
  rauschen?: number; drehung?: number; fehlend?: number[]; laub?: [number, number] } = {}) {
  const { ux = 0, bw = 4, P = 1.0, halbBreite = 4, schraeg = 0, insel = null, rauschen = 6, drehung = 0, fehlend = [], laub = null } = o
  const n = Math.round(2 * HALB / RES), px = new Uint8Array(n * n * 3), rnd = zufall(42)
  const cw = Math.cos(drehung * Math.PI / 180), sw = Math.sin(drehung * Math.PI / 180)
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
    const xw = -HALB + (q + 0.5) * RES, yw = HALB - (r + 0.5) * RES
    const x = xw * cw + yw * sw, y = -xw * sw + yw * cw          // in den Rahmen der Fahrbahn gedreht
    let f = Math.abs(y) <= halbBreite ? BELAG : GRUEN
    if (insel && y >= insel[0] && y <= insel[1]) f = GRUEN
    if (f === BELAG) {
      const k = Math.round((y + halbBreite - 0.5) / P), yk = -halbBreite + 0.5 + k * P
      const xm = ux + y * Math.tan(schraeg * Math.PI / 180)
      if (Math.abs(y - yk) <= 0.25 && Math.abs(x - xm) <= bw / 2 && yk <= halbBreite - 0.25 && !fehlend.includes(k)) f = GELB
      // Laub über dem Streifen (Baumkrone)
      if (laub && y >= laub[0] && y <= laub[1] && Math.abs(x - xm) <= bw / 2 + 1) f = GRUEN
    }
    for (let c = 0; c < 3; c++) px[(r * n + q) * 3 + c] = Math.max(0, Math.min(255, f[c] + (rnd() - 0.5) * 2 * rauschen))
  }
  return bildAusPixeln(px, n, n, BOX, 3)
}

describe('Farbmerkmal', () => {
  it('b* hoch für Gelb, nahe 0 für Grau; Grün gedämpft', () => {
    expect(lab(225, 195, 45)[2]).toBeGreaterThan(60)
    expect(Math.abs(lab(95, 95, 98)[2])).toBeLessThan(3)
    const g = lab(60, 110, 50), gelb = lab(225, 195, 45), grau = lab(95, 95, 98)
    const F = merkmalGelb(new Float32Array([grau[1], grau[1], g[1], gelb[1]]), new Float32Array([grau[2], grau[2], g[2], gelb[2]]))
    expect(F[2]).toBeCloseTo(F[0], 0)                         // Grün zählt nicht als Gelb
    expect(F[3] - F[0]).toBeGreaterThan(50)
  })
})

describe('Takt und Kreuzkorrelation', () => {
  it('Balkentakt: Korrelation hoch bei der richtigen Periode, Phase an den Balken', () => {
    const x = Array.from({ length: 100 }, (_, j) => ((j * 0.1 + 0.25) % 1.0 < 0.5 ? 20 : 0))   // Balken 0…0,25 und 0,75…1
    const [r1, a1, phi] = taktKorrelation(x, 0.1, 1.0)
    const [r2] = taktKorrelation(x, 0.1, 1.5)
    expect(r1).toBeGreaterThan(0.85)
    expect(r2).toBeLessThan(0.4)
    expect(a1).toBeGreaterThan(10)
    const s = ((phi / (2 * Math.PI)) * 1.0 + 1) % 1.0
    expect(Math.min(Math.abs(s - 0.0), Math.abs(s - 1.0))).toBeLessThan(0.1)   // Maximum bei s = 0 (Balkenmitte)
    expect(taktKorrelation([1, NaN, 1, NaN], 0.1, 1)).toEqual([0, 0, 0])
  })
  it('NCC: 1 für die Vorlage selbst, −1 für das Negativ, unabhängig von Helligkeit und Kontrast', () => {
    const T = [0, 1, 1, 0, 0, 1, 1, 0], W = T.map(() => 1)
    expect(nccVorlage(T.map(t => 10 + 5 * t), T, W)).toBeCloseTo(1)
    expect(nccVorlage(T.map(t => 3 - 2 * t), T, W)).toBeCloseTo(-1)
    expect(nccVorlage(T.map(t => 10 + 5 * t + (t ? 0 : NaN)), T, W)).toBe(0)
  })
})

const aufStrasse = (hb: number) => (p: P) => Math.abs(p[1] - O[1]) <= hb

describe('Streifen im Bild', () => {
  it('findet den Streifen am Knoten: Achse, Enden, Balkenlänge', () => {
    const e = streifenImBild(bild(), O, [1, 0], aufStrasse(4))
    expect(e.befund).toBe('erkannt')
    expect(e.teile.length).toBe(1)
    const t = e.teile[0]
    const m: P = [(t.p0[0] + t.p1[0]) / 2 - O[0], (t.p0[1] + t.p1[1]) / 2 - O[1]]
    expect(Math.abs(m[0])).toBeLessThan(0.3)
    expect(Math.abs(m[1])).toBeLessThan(0.3)
    expect(Math.abs(Math.abs(t.p1[1] - t.p0[1]) - 7.5)).toBeLessThan(0.3)    // Balken −3,5 … +3,5, äussere Kanten ±3,75
    expect(Math.abs(t.bw - 4)).toBeLessThan(0.4)
    expect(t.nBalken).toBe(8)
    expect(e.periode).toBeCloseTo(1.0, 1)
  })
  it('Streifen 8 m neben dem Knoten: nur «unsicher» (Knoten nicht im Streifen)', () => {
    const e = streifenImBild(bild({ ux: 8 }), O, [1, 0], aufStrasse(4))
    expect(e.befund).toBe('unsicher')
    expect(e.gruende.join(' ')).toMatch(/OSM-Knoten/)
  })
  it('Fahrbahnrichtung 7° daneben und schräge Achse', () => {
    const e = streifenImBild(bild({ drehung: 7, schraeg: 20 }), O, [1, 0])
    expect(e.befund).toBe('erkannt')
    expect(Math.abs(e.drehungGrad - 7)).toBeLessThanOrEqual(1)
    expect(Math.abs(e.schraegGrad - 20)).toBeLessThanOrEqual(2)
  })
  it('Teilstreifen nur über einer AV-Insel; fehlende Balken auf der Fahrbahn halten zusammen', () => {
    const auf = (p: P) => { const y = p[1] - O[1]; return Math.abs(y) <= 8 && !(y >= -1.2 && y <= 1.2) }
    const insel = (p: P) => { const y = p[1] - O[1]; return y >= -1.2 && y <= 1.2 }
    const b = bild({ halbBreite: 8, insel: [-1.2, 1.2] })
    const e2 = streifenImBild(b, O, [1, 0], auf, { insel })
    expect(e2.befund).toBe('erkannt')
    expect(e2.teile.length).toBe(2)
    // ohne Beleg (keine AV-Insel, keine OSM-Querung) bleibt nur der Teil am Knoten
    const e4 = streifenImBild(b, O, [1, 0], auf)
    expect(e4.teile.length).toBe(1)
    expect(e4.gruende.join(' ')).toMatch(/weggelassen/)
    const e3 = streifenImBild(bild({ fehlend: [3, 4] }), O, [1, 0], aufStrasse(4))
    expect(e3.teile.length).toBe(1)
    expect(e3.teile[0].nBalken).toBe(6)
  })
  it('Laub über dem Streifenende: bis zur Bordkante verlängert; Ende ohne Grund vor dem Rand: unsicher', () => {
    const e = streifenImBild(bild({ laub: [1.8, 4] }), O, [1, 0], aufStrasse(4))
    expect(e.befund).toBe('erkannt')
    expect(e.gruende.join(' ')).toMatch(/verlängert/)
    expect(Math.max(e.teile[0].p0[1], e.teile[0].p1[1]) - O[1]).toBeGreaterThan(3.4)
    const e2 = streifenImBild(bild({ fehlend: [5, 6, 7] }), O, [1, 0], aufStrasse(4))
    expect(e2.befund).toBe('unsicher')
    expect(e2.gruende.join(' ')).toMatch(/vor der Bordkante/)
  })
  it('ohne Muster, leeres Bild, Ort ausserhalb des Ausschnitts: nicht gefunden', () => {
    expect(streifenImBild(bild({ bw: 0 }), O, [1, 0]).befund).toBe('nicht_gefunden')
    const leer = bildAusPixeln(new Uint8Array(600 * 600 * 3).fill(100), 600, 600, BOX, 3)
    expect(streifenImBild(leer, O, [1, 0]).befund).toBe('nicht_gefunden')
    expect(streifenImBild(bild(), [O[0] + 500, O[1]], [1, 0]).befund).toBe('nicht_gefunden')
  })
})

describe('Insel nach OSM aus den Balken (INSEL_AUS_OSM; nur zwei Balkengruppen, Nutzerentscheid 14.10.2026)', () => {
  afterEach(() => inselAusOsmSetzen(null))
  // Teil mit Achse nach Norden ab O, Balken parallel zu x (4 m), ohne Schräge; balkenS: Balkenmitten ab p0
  const teil = (balkenS: number[], L: number, schraeg = 0): TeilErkannt => {
    const q1: P = [O[0] + L * Math.tan(schraeg * Math.PI / 180), O[1] + L]
    return { p0: [O[0] + (q1[0] - O[0]) / 2, O[1]], p1: [O[0] + (q1[0] - O[0]) / 2, O[1] + L], q0: O, q1, richtung: [1, 0], bw: 4,
      umriss: [], nBalken: balkenS.length, balkenS }
  }
  const knoten = (y: number): P => [O[0], O[1] + y]
  const r2 = (x: number) => Math.round(x * 100) / 100
  it('zwei Gruppen mit Lücke ab 1 m: die Lücke ist die Insel (die am Knoten)', () => {
    const t = teil([0.25, 1.25, 2.25, 5.25, 6.25, 7.25], 7.5)
    expect(inselAusBalken(t, knoten(3.7))).toEqual({ abschnitte: [[0, 2.5], [5, 7.5]], insel: [2.5, 5] })
    // eine fehlende Balkenlücke (Kanten 1,5 m auseinander) zählt schon; 0,5 m (Takt) nicht
    expect(inselAusBalken(teil([0.25, 1.25, 2.25, 4.25, 5.25, 6.25], 6.5), knoten(3.2))).toMatchObject({ insel: [2.5, 4] })
    // Lücke mehr als 3 m vom Knoten: keine Insel
    expect(inselAusBalken(t, knoten(-6))).toEqual({ grund: 'im Luftbild Lücke zwischen den Balken 8,5 m vom OSM-Knoten – prüfen' })
  })
  it('beide Teile ab 2 m (wie über OSM + AV) und Lücke höchstens 4 m, sonst keine Insel, Hinweis (Prüfung 14.10.2026)', () => {
    // Teil 0,5 m (wie 5126286188) bzw. 1,5 m (wie Brunnadernstrasse 4486147172): kein Teilen
    expect(inselAusBalken(teil([0.25, 3.25, 4.25, 5.25, 6.25], 6.5), knoten(1.7)))
      .toEqual({ grund: 'im Luftbild Lücke zwischen den Balken, Teil 0,5 m zu kurz – prüfen' })
    expect(inselAusBalken(teil([0.25, 1.25, 3.75, 4.75, 5.75, 6.75], 7), knoten(2.5)))
      .toEqual({ grund: 'im Luftbild Lücke zwischen den Balken, Teil 1,5 m zu kurz – prüfen' })
    // Teile genau 2 m: Insel
    expect(inselAusBalken(teil([0.25, 1.75, 3.75, 5.25], 5.5), knoten(2.7))).toEqual({ abschnitte: [[0, 2], [3.5, 5.5]], insel: [2, 3.5] })
    // Lücke 5 m (Fahrzeug, Schatten): keine Insel; genau 4 m: Insel
    expect(inselAusBalken(teil([0.25, 1.25, 2.25, 7.75, 8.75, 9.75], 10), knoten(5)))
      .toEqual({ grund: 'im Luftbild Lücke zwischen den Balken 5,0 m zu breit – prüfen' })
    expect(inselAusBalken(teil([0.25, 1.25, 2.25, 6.75, 7.75, 8.75], 9), knoten(4.5))).toMatchObject({ insel: [2.5, 6.5] })
    // über luftbildInsel: Hinweis OSM/AV mit dem Grund, Teil unverändert
    const t = teil([0.25, 3.25, 4.25, 5.25, 6.25], 6.5)
    const li = luftbildInsel([t], { 'crossing:island': 'yes' }, knoten(1.7), new Inseln([]))
    expect([li.teile, li.insel]).toEqual([[t], null])
    expect(li.hinweis).toBe('OSM meldet eine Mittelinsel (crossing:island=yes), die Amtliche Vermessung keine – im Luftbild Lücke ' +
      'zwischen den Balken, Teil 0,5 m zu kurz – prüfen')
  })
  it('eine Gruppe (auch wenn sie vor der Bordkante endet): keine Insel, die Balken laufen durch', () => {
    expect(inselAusBalken(teil([0.25, 1.25, 2.25, 3.25], 3.5), knoten(4.5))).toEqual({ grund: BALKEN_DURCH })
    expect(inselAusBalken(teil([0.25, 1.25, 2.25, 3.25], 3.5), knoten(1.7))).toEqual({ grund: BALKEN_DURCH })
  })
  it('teilAbschnitt: Enden auf der geschrägten Achse, Balken, Umriss', () => {
    const t = teil([0.25, 1.25, 2.25, 5.25, 6.25, 7.25], 7.5, 10)
    const a = teilAbschnitt(t, 5, 7.5)
    expect(a.nBalken).toBe(3)
    expect(a.balkenS.map(r2)).toEqual([0.25, 1.25, 2.25])
    expect(r2(a.p1[1] - a.p0[1])).toBe(2.5)
    expect(r2(a.q0[0] - O[0])).toBe(r2(5 * Math.tan(10 * Math.PI / 180)))     // auf der Linie der Balkenmitten
    expect(a.umriss.map(p => [r2(p[0] - a.q0[0]), r2(p[1] - a.q0[1])])[0]).toEqual([-2, 0])
  })
  it('Erkennung mit fehlenden Balken in der Mitte: zwei Teile; ohne crossing:island, mit AV-Insel bzw. Schalter aus unverändert', () => {
    const e = streifenImBild(bild({ fehlend: [3, 4] }), O, [1, 0], aufStrasse(4))
    expect(e.teile.length).toBe(1)
    const ja = { 'crossing:island': 'yes' }, keine = new Inseln([])
    const li = luftbildInsel(e.teile, ja, O, keine)
    expect(li.teile.map(t => t.nBalken)).toEqual([3, 3])
    expect(li.grund).toBe('luftbild')
    expect(r2(li.insel!.breite)).toBeCloseTo(2.5, 1)
    expect(luftbildInsel(e.teile, {}, O, keine).teile).toBe(e.teile)
    const avInsel = new Inseln([{ art: 'Verkehrsinsel', kanton: 'BE', qualitaet: 'AV93', bfs: null,
      ringe: [[[O[0] - 3, O[1] + 4.5], [O[0] + 3, O[1] + 4.5], [O[0] + 3, O[1] + 6], [O[0] - 3, O[1] + 6]]] }])
    expect(luftbildInsel(e.teile, ja, O, avInsel).teile).toBe(e.teile)       // AV-Insel bis 2 m hinter dem Ende
    inselAusOsmSetzen(false)
    expect(luftbildInsel(e.teile, ja, O, keine)).toMatchObject({ teile: e.teile, insel: null, hinweis: '' })
    // Insel von Hand (auch mit Schalter aus): teilt die Balken eines durchgehenden Streifens, ersetzt die Annahme
    const voll = streifenImBild(bild(), O, [1, 0], aufStrasse(4))
    const hand = luftbildInsel(voll.teile, ja, O, keine, [{ ring: [[O[0] - 3, O[1] - 0.6], [O[0] + 3, O[1] - 0.6],
      [O[0] + 3, O[1] + 0.6], [O[0] - 3, O[1] + 0.6]], herkunft: 'hand', breite: 0 }])
    expect([hand.teile.map(t => t.nBalken), hand.grund, hand.insel]).toEqual([[3, 3], 'hand', null])
    // Insel von Hand am Rand (1,6 … 3,0 m quer): Abschnitt daneben 0,75 m (ein Balken) nicht gebildet, wie über OSM + AV
    const rand = luftbildInsel(voll.teile, ja, O, keine, [{ ring: [[O[0] - 3, O[1] + 1.6], [O[0] + 3, O[1] + 1.6],
      [O[0] + 3, O[1] + 3], [O[0] - 3, O[1] + 3]], herkunft: 'hand', breite: 0 }])
    expect([rand.teile.map(t => t.nBalken), rand.grund]).toEqual([[6], 'hand'])
    expect(rand.hinweis).toBe('Insel von Hand auf der Achse am Streifenende (kein zweiter Teil ab 2,0 m)')
  })
  it('Balken durchgehend: kein Teilen, Hinweis «im Luftbild laufen die Balken durch»', () => {
    const voll = streifenImBild(bild(), O, [1, 0], aufStrasse(4))
    const li = luftbildInsel(voll.teile, { 'crossing:island': 'yes' }, O, new Inseln([]))
    expect([li.teile, li.insel]).toEqual([voll.teile, null])
    expect(li.hinweis).toBe('OSM meldet eine Mittelinsel (crossing:island=yes), die Amtliche Vermessung keine – im Luftbild laufen die Balken durch')
  })
  // Rechnung mit Luftbild: Strasse West–Ost 8 m (wie bild()), Übergang 12 bei O mit crossing:island=yes
  const ll = (x: number, y: number) => wgs(O[0] + x, O[1] + y)
  const osm = (tags: Record<string, string>): OsmDaten => ({
    wege: [{ id: 1, tags: { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }, knoten: [10, 12, 13], geom: [ll(-200, 0), ll(0, 0), ll(200, 0)] }],
    tram: [], ampeln: [], querungen: [], relationen: [],
    uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra', ...tags }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
  })
  const rr = (x0: number, y0: number, x1: number, y1: number): P[] => [[O[0] + x0, O[1] + y0], [O[0] + x1, O[1] + y0], [O[0] + x1, O[1] + y1], [O[0] + x0, O[1] + y1]]
  const av: AvFlaeche[] = [{ art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rr(-200, -4, 200, 4)] },
    { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rr(-200, 4, 200, 7)] },
    { art: 'Trottoir', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [rr(-200, -7, 200, -4)] }]
  const fall = () => leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  const laengen = (r: { streifen: { fgsId: string; p0: P; p1: P }[] }) =>
    r.streifen.map(s => [s.fgsId, Math.round(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]) * 100) / 100])
  it('rechneFall «erkannt»: zwei Teilstreifen aus dem Luftbild mit der Insel aus den Balken, je eine Inselteil-Zufahrt', () => {
    const r = rechneFall(osm({ 'crossing:island': 'yes' }), av, [], 12, fall(), null, bild({ fehlend: [3, 4] }))
    expect(r.streifenQuelle).toBe('luftbild')
    expect(r.luftbild?.befund).toBe('erkannt')
    expect(r.luftbild?.teile.map(t => [t.fgsId, t.nBalken])).toEqual([['12-1', 3], ['12-2', 3]])
    expect(r.streifen.map(s => [s.fgsId, s.zufahrten.map(z => `${z.richtung}:${z.art}`).join(), s.entfallen.map(e => e.grund).join()]))
      .toEqual([['12-1', '0:insel', 'insel'], ['12-2', '180:insel', 'insel']])
    expect(r.inseln.map(z => z.herkunft)).toEqual(['luftbild'])
    expect(r.streifen[0].annahmen).toContain('Insel nach OSM (crossing:island) und Luftbild angenommen (Lücke 2,5 m); in der AV nicht ' +
      'als Verkehrsinsel erfasst – prüfen')
    expect(r.inselTeilt).toBe(false)                                // nur bei «unsicher» (Streifen aus OSM + AV)
    expect(r.streifen[0].annahmen.join(' ')).toMatch(/Teilstreifen 1 von 2 \(Insel nach OSM und Luftbild angenommen\)/)
    expect(r.streifen[0].annahmen.join(' ')).not.toMatch(/OSM meldet/)
    // ohne crossing:island bzw. Schalter aus: ein Streifen über die ganze Fahrbahn, zwei gerade Zufahrten (wie bisher)
    const ohne = rechneFall(osm({}), av, [], 12, fall(), null, bild({ fehlend: [3, 4] }))
    expect(ohne.streifen.map(s => [s.fgsId, s.zufahrten.map(z => z.art).join()])).toEqual([['12', 'beide,beide']])
    expect(ohne.inseln).toEqual([])
    inselAusOsmSetzen(false)
    const aus = rechneFall(osm({ 'crossing:island': 'yes' }), av, [], 12, fall(), null, bild({ fehlend: [3, 4] }))
    expect(aus.streifen.map(s => [s.fgsId, s.zufahrten.map(z => z.art).join()])).toEqual([['12', 'beide,beide']])
    expect([aus.inseln, aus.streifen[0].annahmen.join(' ')]).toEqual([[], expect.not.stringMatching(/insel/i)])
  })
  it('mit Flächen (Plan): Erkennung auf dem Bestand, «erkannt» nur Vorschlag; gleich, ob zwischengespeichert oder frisch (M1)', () => {
    const plan = (f: ReturnType<typeof fall>) => { f.flaechenPlan = [{ id: 'plan-1', art: 'trottoir', ring: rr(-3, 2, 3, 4.5) }]; return f }
    const ohneMs = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'ms' ? undefined : v))
    const b = bild()
    const r0 = rechneFall(osm({}), av, [], 12, fall(), null, b)                      // ohne Plan: erkannt, Rechnung aus dem Luftbild
    expect([r0.streifenQuelle, r0.luftbild?.befund, r0.luftbild?.nurVorschlag]).toEqual(['luftbild', 'erkannt', undefined])
    const zw = rechneFall(osm({}), av, [], 12, plan(fall()), null, b)                // Erkennung aus dem Zwischenspeicher
    const frisch = rechneFall(osm({}), av, [], 12, plan(fall()), null, bild())       // neues Bild: frisch erkannt
    expect(ohneMs(zw)).toBe(ohneMs(frisch))
    expect([zw.streifenQuelle, zw.luftbild?.befund, zw.luftbild?.nurVorschlag]).toEqual(['osm', 'erkannt', true])
    // gerechnet mit OSM + AV nach Plan: Ende an der Nase (Rand y = 2, Ende 0,3 m davor)
    expect(Math.max(zw.streifen[0].p0[1], zw.streifen[0].p1[1]) - O[1]).toBeCloseTo(1.7, 6)
    expect(zw.meldungen).toContain('Mit Flächen (Plan): Streifen aus dem Luftbild (Bestand) nur als Vorschlag; gerechnet mit OSM + AV ' +
      'nach Plan bzw. mit den Streifen von Hand.')
    // die Luftbild-Teile (Vorschlag) liegen wie ohne Plan (Erkennung auf dem Bestand)
    expect(ohneMs(zw.luftbild?.teile)).toBe(ohneMs(r0.luftbild?.teile))
  })
  it('rechneFall «erkannt» mit durchgehenden Balken: ein Streifen aus dem Luftbild, Hinweis', () => {
    const r = rechneFall(osm({ 'crossing:island': 'yes' }), av, [], 12, fall(), null, bild())
    expect([r.streifenQuelle, r.luftbild?.befund, r.inseln]).toEqual(['luftbild', 'erkannt', []])
    expect(r.streifen.map(s => [s.fgsId, s.zufahrten.map(z => z.art).join()])).toEqual([['12', 'beide,beide']])
    expect(r.streifen[0].annahmen).toContain(osmInselHinweis(BALKEN_DURCH))
  })
  it('rechneFall «unsicher»: eine Gruppe endet vor der Bordkante – kein Teilen, Hinweis; zwei Gruppen – die Lücke teilt OSM + AV', () => {
    const r = rechneFall(osm({ 'crossing:island': 'yes' }), av, [], 12, fall(), null, bild({ fehlend: [4, 5, 6, 7] }))
    expect([r.luftbild?.befund, r.streifenQuelle, r.inseln, r.inselTeilt]).toEqual(['unsicher', 'osm', [], false])
    expect(laengen(r)).toEqual([['12', 7.4]])
    expect(r.streifen[0].annahmen).toContain(osmInselHinweis())
    // zwei Gruppen (Lücke −1,25 … 1,25 m), der letzte Balken fehlt (Ende 1,25 m vor der Bordkante: «unsicher»); zweiter Teil
    // nur 1,5 m: kein Teilen (Mindestlänge wie über OSM + AV), Hinweis (bei «unsicher» der aus OSM + AV, wie bisher ohne Grund)
    const k = rechneFall(osm({ 'crossing:island': 'yes' }), av, [], 12, fall(), null, bild({ fehlend: [3, 4, 7] }))
    expect([k.luftbild?.befund, k.streifenQuelle, k.inseln, k.inselTeilt, k.luftbild?.insel]).toEqual(['unsicher', 'osm', [], false, null])
    expect(laengen(k)).toEqual([['12', 7.4]])
    expect(k.streifen[0].annahmen).toContain(osmInselHinweis())
    // zwei Gruppen je 2,5 m, Streifen 2,5 m neben dem Knoten (entlang der Fahrbahn: «unsicher»): die Lücke teilt OSM + AV
    const z = rechneFall(osm({ 'crossing:island': 'yes' }), av, [], 12, fall(), null, bild({ fehlend: [3, 4], ux: 2.5 }))
    expect([z.luftbild?.befund, z.streifenQuelle, z.inseln.map(x => [x.herkunft, Math.round(x.breite * 10) / 10]), z.inselTeilt])
      .toEqual(['unsicher', 'osm', [['luftbild', 2.5]], true])
    expect(z.luftbild?.insel).toEqual(z.inseln[0])
    // Fahrbahn −4 … 4 m ohne die Lücke: Teile je 2,75 m, Enden 0,3 m vor Bordkante bzw. Insel
    expect(laengen(z)).toEqual([['12-1', 2.15], ['12-2', 2.15]])
    expect(z.streifen[0].annahmen.join(' ')).toMatch(/Teilstreifen 1 von 2 \(Insel nach OSM und Luftbild angenommen\)/)
    expect(z.streifen[0].annahmen.join(' ')).not.toMatch(/OSM meldet/)
  })
  it('«Streifen übernehmen» schreibt die angenommene Insel als Insel von Hand: Teilung bleibt, keine Doppel', () => {
    const tags = { 'crossing:island': 'yes' }
    const r = rechneFall(osm(tags), av, [], 12, fall(), null, bild({ fehlend: [3, 4] }))
    expect(r.inseln.length).toBe(1)
    const f = fall()
    streifenUebernehmen(f, r.luftbild!.teile, r.streifen, 'luftbild', r.inseln)
    expect(f.hindernisse.map(h => [h.art, h.quelle, h.name])).toEqual([['insel', 'hand', INSEL_UEBERNOMMEN]])
    const h = rechneFall(osm(tags), av, [], 12, f, null, bild({ fehlend: [3, 4] }))
    expect(h.streifenQuelle).toBe('hand')
    expect(h.streifen.map(s => [s.fgsId, s.zufahrten.map(z => `${z.richtung}:${z.art}`).join(), s.entfallen.map(e => e.grund).join()]))
      .toEqual([['hand-1', '0:insel', 'insel'], ['hand-2', '180:insel', 'insel']])
    // nochmals übernehmen (dieselbe Fläche) bzw. schon eine Insel von Hand dort: nicht doppelt
    streifenUebernehmen(f, r.luftbild!.teile, r.streifen, 'luftbild', r.inseln)
    expect(f.hindernisse.length).toBe(1)
    const g = fall()
    g.hindernisse.push({ id: 'insel-x', art: 'insel', ring: [[O[0] - 4, O[1] - 1.5], [O[0] + 4, O[1] - 1.5], [O[0] + 4, O[1] + 1.5],
      [O[0] - 4, O[1] + 1.5]], quelle: 'hand' })
    streifenUebernehmen(g, r.luftbild!.teile, r.streifen, 'luftbild', r.inseln)
    expect(g.hindernisse.map(x => x.id)).toEqual(['insel-x'])
    // ohne Inseln (wie bisher): keine Insel geschrieben
    const o = fall()
    streifenUebernehmen(o, r.luftbild!.teile, r.streifen, 'luftbild')
    expect(o.hindernisse).toEqual([])
    // «unsicher»: die Insel der Luftbild-Teile (luftbild.insel) beim «Luftbild-Streifen übernehmen»
    const u = rechneFall(osm(tags), av, [], 12, fall(), null, bild({ fehlend: [3, 4], ux: 2.5 }))
    const v = fall()
    streifenUebernehmen(v, u.luftbild!.teile, u.streifen, 'luftbild_vorschlag', u.luftbild!.insel ? [u.luftbild!.insel] : [])
    expect([v.streifenHand.length, v.hindernisse.map(x => x.name)]).toEqual([2, [INSEL_UEBERNOMMEN]])
  })
})
