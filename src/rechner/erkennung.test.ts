// Tests Erkennungsdistanz aus dem Sichtrechner (Nutzerentscheid 23.10.2026, erkennung.ts): künstliche Strassen wie
// automatik.test.tsx (Hauptstrasse West–Ost, Fahrbahn 8 m, Übergang bei x = 0), keine echten Daten.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { ZufahrtErgebnis } from './typen'
import { rechneFall } from './index'
import { leererFall, type Fall } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { querungen, vorbelegen } from '../bedarf/vorbelegung'
import { offeneFragen } from '../bedarf/zusammenfassung'
import { ERKENNUNG_MAX_M, entlangLinie, zielPunkte } from './erkennung'
import { REICHWEITE_SICHT_M } from './ohneVortritt'
import { erkennungText } from '../texte'

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
const QUER = { highway: 'residential', name: 'Querweg', maxspeed: '30' }
const UEB = knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })
const osm = (wege: OsmWeg[]): OsmDaten => ({ wege, tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [UEB] })
const OSM = osm([weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], HAUPT)])
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const OHNE = { vorgabe: { bern: false, kantonBE: false } }
const rechne = (o: OsmDaten = OSM, a: AvFlaeche[] = AV, f: Fall = fallMit()) => rechneFall(o, a, [], 12, f, null)
const gerade = (r: ReturnType<typeof rechne>) => r.streifen[0].zufahrten.filter(z => z.art !== 'abbiegend')
/** Zufahrt aus Westen (fährt nach Osten, Richtung 0°) bzw. aus Osten (180°) */
const vonWesten = (zs: ZufahrtErgebnis[]) => zs.find(z => z.richtung === 0)!
const vonOsten = (zs: ZufahrtErgebnis[]) => zs.find(z => z.richtung === 180)!
/** alle Ergebnisfelder ausser der Erkennungsdistanz (Regression: Status, Soll, Sichtfeld, frei bis, Konflikte unverändert) */
const ohneErk = (zs: ZufahrtErgebnis[]) => zs.map(z => { const { erkennungM: _e, erkennungLinien: _l, ...rest } = z; return JSON.stringify(rest) })

const r0 = rechne()
// Gebäude über der südlichen Fahrbahnhälfte 76 bis 80 m westlich (jenseits des Sichtfelds der Sichtprüfung, Soll 55 m)
const AV_GEB = [...AV, av('Gebaeude', rechteck(-80, -4, -76, 0))]
const rGeb = rechne(OSM, AV_GEB)

describe('Erkennungsdistanz: Sichtrechner (gerade Zufahrten)', () => {
  it('gerade Strasse frei: alle Zufahrten einheitlich bis 110 m (Reichweite der geladenen Daten), auch bei 30 km/h', () => {
    expect(ERKENNUNG_MAX_M).toBe(REICHWEITE_SICHT_M)
    for (const z of gerade(r0)) expect(z.erkennungM).toEqual({ wert: ERKENNUNG_MAX_M, bis: 'frei' })
    const r30 = rechne(osm([weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { ...HAUPT, maxspeed: '30' })]))
    for (const z of gerade(r30)) expect(z.erkennungM).toEqual({ wert: 110, bis: 'frei' })
    expect(erkennungText(gerade(r0)[0].erkennungM!)).toBe('Streifen erkennbar ab 110 m (so weit geprüft)')
  })
  it('Gebäude im Blick: verdeckt ab rund 78 m (vor dem Gebäude); übrige Ergebnisse unverändert, die Gegenrichtung frei', () => {
    const w = vonWesten(gerade(rGeb))
    expect(w.erkennungM!.bis).toBe('verdeckt')
    expect(w.erkennungM!.hindernis).toMatchObject({ klasse: 'gebaeude' })
    expect(w.erkennungM!.wert).toBeGreaterThan(72)
    expect(w.erkennungM!.wert).toBeLessThan(80)
    expect(vonOsten(gerade(rGeb)).erkennungM).toEqual({ wert: 110, bis: 'frei' })
    // Regression: alle übrigen Felder wie ohne Gebäude (es liegt ausserhalb des Sichtfelds)
    expect(ohneErk(rGeb.streifen[0].zufahrten)).toEqual(ohneErk(r0.streifen[0].zufahrten))
    expect(erkennungText(w.erkennungM!)).toMatch(/^Streifen erkennbar ab \d+ m \(weiter entfernt verdeckt: Gebäude\)$/)
  })
  it('Sichtlinien (30.10.2026): alle 10 m ein Augpunkt bis zur Prüfgrenze mit dem genutzten Zielpunkt; frei vor, verdeckt hinter dem Gebäude', () => {
    const w = vonWesten(gerade(rGeb))
    const l = w.erkennungLinien!
    expect(l.map(x => x.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110])
    expect(l.filter(x => x.x <= 70).every(x => x.befund === 'frei' && x.grund === undefined)).toBe(true)
    expect(l.filter(x => x.x >= 80).every(x => x.befund === 'verdeckt' && x.grund === 'Gebäude (AV)')).toBe(true)
    // Augpunkte auf der Fahrlinie westlich des Streifens, Ziele auf der Markierung im eigenen Fahrstreifen (südliche Hälfte)
    for (const x of l) {
      expect(x.auge[0] - O[0]).toBeLessThan(0)
      expect(Math.abs(x.ziel[0] - O[0])).toBeLessThan(4)
      expect(x.ziel[1] - O[1]).toBeLessThanOrEqual(0.01)
    }
    expect(l[11].auge[0] - l[1].auge[0]).toBeCloseTo(-100, 0)
    // ohne Hindernis alle frei; die Erkennungsdistanz selbst bleibt wie ohne Sichtlinien
    expect(vonWesten(gerade(r0)).erkennungLinien!.every(x => x.befund === 'frei')).toBe(true)
    expect(w.erkennungM).toEqual({ wert: w.erkennungM!.wert, bis: 'verdeckt', hindernis: { klasse: 'gebaeude', name: 'Gebäude (AV)' } })
  })
  it('Bewuchs (30.10.2026): Sicht nur über eine Gartenanlage der AV ist «nicht sicher» ab rund 68 m; Wert, Sichtprüfung unverändert', () => {
    const rG = rechne(OSM, [...AV, av('Gartenanlage', rechteck(-70, -4, -66, 0))])
    const w = vonWesten(gerade(rG))
    expect(w.erkennungM).toMatchObject({ wert: 110, bis: 'frei', bewuchs: 'Gartenanlage' })
    expect(w.erkennungM!.bewuchsAb).toBeGreaterThan(62)
    expect(w.erkennungM!.bewuchsAb).toBeLessThan(70)
    expect(erkennungText(w.erkennungM!)).toMatch(/^Streifen in den Daten frei bis 110 m, ab \d+ m nicht sicher \(Bewuchs AV: Gartenanlage\) – vor Ort oder in Street View prüfen \(so weit geprüft\)$/)
    expect(w.erkennungLinien!.filter(x => x.x >= 70).every(x => x.befund === 'bewuchs' && x.grund === 'Gartenanlage')).toBe(true)
    expect(w.erkennungLinien!.filter(x => x.x <= 60).every(x => x.befund === 'frei')).toBe(true)
    expect(vonOsten(gerade(rG)).erkennungM).toEqual({ wert: 110, bis: 'frei' })
    expect(ohneErk(rG.streifen[0].zufahrten)).toEqual(ohneErk(r0.streifen[0].zufahrten))
    // Vorbelegung: der sicher freie Teil als Annahme mit Hinweis, auch unter dem Doppelten der Sichtweite
    const v = vorbelegen(querungen(rG.streifen)[0], fallMit())
    expect(v.werte.erkennungM).toMatchObject({ wert: w.erkennungM!.bewuchsAb, quelle: 'annahme' })
    expect(v.werte.erkennungM.text).toMatch(new RegExp(`^Sichtrechner: Streifen sicher frei bis ${w.erkennungM!.bewuchsAb} m, ab ${w.erkennungM!.bewuchsAb} m nicht sicher \\(Bewuchs AV: Gartenanlage\\) – vor Ort oder in Street View prüfen; in den Daten erkennbar ab 110 m \\(Zufahrt \\d, so weit geprüft\\), ohne Gelände;`))
    // übrige humusierte Fläche (Wiese) ist kein Bewuchs; ein Gebäude davor geht vor (verdeckt, kein «nicht sicher» dahinter)
    expect(vonWesten(gerade(rechne(OSM, [...AV, av('uebrige_humusierte', rechteck(-70, -4, -66, 0))]))).erkennungM).toEqual({ wert: 110, bis: 'frei' })
    const wGeb = vonWesten(gerade(rechne(OSM, [...AV_GEB, av('Gartenanlage', rechteck(-95, -4, -91, 0))])))
    expect(wGeb.erkennungM!.bis).toBe('verdeckt')
    expect(wGeb.erkennungM!.bewuchsAb).toBeUndefined()
  })
  it('Auto-Parkfeld im Blick verdeckt (Nutzerentscheid 23.10.2026), Zweirad-Feld nicht; Hecke von Hand ebenso', () => {
    // Parkfeld bis 1 m an die Mitte, 75 bis 80 m westlich (jenseits des Sichtfelds der Sichtprüfung)
    const feld = (klasse: 'auto' | 'velo') => fallMit(x => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse, ring: rechteck(-80, -4, -75, -1), quelle: 'hand' }))
    const wa = vonWesten(gerade(rechne(OSM, AV, feld('auto'))))
    expect(wa.status).toBe('frei')
    expect(wa.erkennungM).toMatchObject({ bis: 'verdeckt', hindernis: { klasse: 'auto', id: 'p1' } })
    expect(wa.erkennungM!.wert).toBeGreaterThan(70)
    expect(wa.erkennungM!.wert).toBeLessThan(80)
    expect(erkennungText(wa.erkennungM!)).toMatch(/\(weiter entfernt verdeckt: Auto-Parkfeld\)$/)
    expect(vonWesten(gerade(rechne(OSM, AV, feld('velo')))).erkennungM).toEqual({ wert: 110, bis: 'frei' })
    const hecke = fallMit(x => x.hindernisse.push({ id: 'h1', art: 'hecke', ring: rechteck(-95, -4, -92, 0), sichtbehindernd: true, quelle: 'hand' }))
    const wh = vonWesten(gerade(rechne(OSM, AV, hecke)))
    expect(wh.erkennungM).toMatchObject({ bis: 'verdeckt', hindernis: { klasse: 'hindernis', id: 'h1' } })
    // Augpunkte in der Hecke zählen sie nicht (wie die Sichtprüfung): verdeckt ab dem Augpunkt hinter ihr, rund 95 m − h
    expect(wh.erkennungM!.wert).toBeGreaterThan(88)
    expect(wh.erkennungM!.wert).toBeLessThan(95)
  })
  it('Fahrlinie endet am Knoten (Einmündung 80 m westlich, ohne Fortsetzung): «mindestens», nicht weiter gerechnet', () => {
    const o = osm([weg(1, [[20, -80, 0], [12, 0, 0], [13, 300, 0]], HAUPT), weg(2, [[21, -80, -300], [20, -80, 0], [22, -80, 300]], QUER)])
    const a = [av('Strasse_Weg', rechteck(-80, -4, 300, 4)), av('Strasse_Weg', rechteck(-84, -300, -76, 300)),
      av('Trottoir', rechteck(-76, 4, 300, 7)), av('Trottoir', rechteck(-76, -7, 300, -4))]
    const r = rechne(o, a)
    const w = vonWesten(gerade(r))
    expect(w.sichtweiteQuelle).toBe('VSS Tab. 1')
    expect(w.erkennungM).toMatchObject({ bis: 'fahrlinie_endet', ende: 'knoten' })
    expect(w.erkennungM!.wert).toBeGreaterThanOrEqual(75)
    expect(w.erkennungM!.wert).toBeLessThan(80)
    expect(erkennungText(w.erkennungM!)).toMatch(/^Streifen erkennbar auf mindestens \d+ m \(Fahrlinie endet am Knoten, weiter zurück nicht geprüft\)$/)
    // Vorbelegung: «mindestens 78 m» erreicht das Doppelte (110 m) nicht: Feld offen mit Hinweis statt einer Verletzung
    const v = vorbelegen(querungen(r.streifen)[0], fallMit())
    expect(v.werte.erkennungM).toBeUndefined()
    expect(v.feldHinweise!.erkennungM).toMatch(/^Sichtrechner: Streifen erkennbar auf mindestens \d+ m \(Zufahrt \d, Fahrlinie endet am Knoten, weiter zurück nicht geprüft\), ohne Gelände; nur Markierung geprüft, blaue Tafel \(Signal 4\.11\) nicht; nötig 110 m/)
  })
  it('Abbieger: kein Wert (Einmündung 30 m westlich: Abbieger aus der Querstrasse statt der geraden Zufahrt)', () => {
    const o = osm([weg(1, [[20, -30, 0], [12, 0, 0], [13, 300, 0]], HAUPT), weg(2, [[21, -30, -300], [20, -30, 0], [22, -30, 300]], QUER)])
    const a = [av('Strasse_Weg', rechteck(-30, -4, 300, 4)), av('Strasse_Weg', rechteck(-34, -300, -26, 300)),
      av('Trottoir', rechteck(-26, 4, 300, 7)), av('Trottoir', rechteck(-26, -7, 300, -4))]
    const r = rechne(o, a)
    const abb = r.streifen[0].zufahrten.filter(z => z.art === 'abbiegend')
    expect(abb.length).toBeGreaterThan(0)
    expect(abb.every(z => z.erkennungM === undefined)).toBe(true)
    expect(vonWesten(gerade(r))).toBeUndefined()
    expect(vonOsten(gerade(r)).erkennungM).toEqual({ wert: 110, bis: 'frei' })
    // Vorbelegung nur aus den geraden Zufahrten
    expect(vorbelegen(querungen(r.streifen)[0], fallMit()).werte.erkennungM).toMatchObject({ wert: 110, quelle: 'annahme' })
  })
  it('Abstand entlang der Fahrlinie: Zickzack-Augpunkte (seitlich ±1,5 m) zählen nicht mit (Prüfung 23.10.2026)', () => {
    const linie: P[] = [[0, 0], [100, 0]]
    const zick: P[] = Array.from({ length: 11 }, (_, k) => [2 * k, k % 2 ? 1.5 : -1.5] as P)
    const l = entlangLinie(linie, zick, 0, 2)
    expect(l[10].a - l[0].a).toBeCloseTo(20)
    expect(l.map(x => Math.abs(x.lat))).toEqual(Array(11).fill(1.5))
    // die Summe der Sehnen wäre rund 36 m
    expect(zick.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - zick[k][0], p[1] - zick[k][1]), 0)).toBeGreaterThan(35)
    // nie rückwärts: ein zurückliegender Punkt behält den vorigen Abstand
    expect(entlangLinie(linie, [[0, 0], [10, 1], [8, -1]], 0, 2).map(x => x.a)).toEqual([0, 10, 10])
  })
  it('Zielpunkte: im eigenen Fahrstreifen (±1,5 m entlang der Achse), innerhalb der Streifenenden', () => {
    const s = { p0: [0, -4] as P, p1: [0, 4] as P }
    const z = zielPunkte([-1.5, -3.5], s)
    expect(z.every(p => p[1] >= -4 - 1e-9 && p[1] <= 4 + 1e-9)).toBe(true)
    expect(Math.min(...z.map(p => p[1]))).toBeCloseTo(-4)
    expect(Math.max(...z.map(p => p[1]))).toBeCloseTo(-2)
    expect(new Set(z.map(p => p[0]))).toEqual(new Set([-1.5, 0]))
  })
})

describe('Erkennungsdistanz: Vorbelegung (kleinster Wert, Annahme, Hand vor)', () => {
  it('kleinster Wert der geraden Zufahrten als Annahme mit Herkunft; Frage entfällt; Grundprüfung und H3b wie mit Handangabe', () => {
    const fall = fallMit(x => { x.bedarf = { felder: { anzeichenSchneller: { wert: false, quelle: 'hand' } } } })
    const [b] = befundblaetter(rGeb, fall, OHNE)
    const wWest = vonWesten(gerade(rGeb)).erkennungM!.wert
    expect(b.vorbelegt.werte.erkennungM).toMatchObject({ wert: wWest, quelle: 'annahme' })
    expect(b.vorbelegt.werte.erkennungM.text).toMatch(new RegExp(`^Sichtrechner: Streifen erkennbar ab ${wWest} m \\(Zufahrt \\d, weiter entfernt verdeckt: Gebäude\\), ohne Gelände; nur Markierung geprüft, blaue Tafel \\(Signal 4\\.11\\) nicht$`))
    expect(offeneFragen(b, new Set()).map(f => f.ziel)).not.toContain('erkennungM')
    const t = b.grund.punkte.find(p => p.nr === '1')!.teile.find(x => x.id === 'B5-1b')!
    expect(t).toMatchObject({ zustand: 'verletzt', ist: `${wWest} m` })
    expect(b.grund.annahmen.some(a => a.startsWith('Ab welcher Distanz ist der Streifen erkennbar') && a.includes(`${wWest} m`))).toBe(true)
    expect(b.befund.alle.find(x => x.id === 'H3b')).toMatchObject({ zustand: 'verletzt' })
    // ohne Hindernis: 110 m (so weit geprüft) erreicht das Doppelte, B5-1b erfüllt
    const [b0] = befundblaetter(r0, fall, OHNE)
    expect(b0.vorbelegt.werte.erkennungM).toMatchObject({ wert: 110, quelle: 'annahme' })
    expect(b0.grund.punkte.find(p => p.nr === '1')!.teile.find(x => x.id === 'B5-1b')!.zustand).toBe('erfuellt')
  })
  it('Handeingabe geht vor; V85 von Hand über 50 km/h: «so weit geprüft» (110 m) reicht nicht für 150 m, Feld offen mit Hinweis', () => {
    const hand = fallMit(x => { x.bedarf = { felder: { erkennungM: { wert: 40, quelle: 'hand' } } } })
    const [b] = befundblaetter(rGeb, hand, OHNE)
    expect(b.gebildet.eingaben.erkennungM).toEqual({ wert: 40, quelle: 'hand' })
    expect(b.gebildet.herkunft.get('erkennungM')!.zustand).toBe('hand')
    const r30 = rechne(osm([weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { ...HAUPT, maxspeed: '30' })]))
    const v85 = fallMit(x => { x.bedarf = { felder: { v85: { wert: 55, quelle: 'hand' } } } })
    const v = vorbelegen(querungen(r30.streifen)[0], v85)
    expect(v.werte.erkennungM).toBeUndefined()
    expect(v.feldHinweise!.erkennungM).toContain('nötig 150 m (doppelte Sichtweite bei 55 km/h)')
    expect(vorbelegen(querungen(r30.streifen)[0], fallMit()).werte.erkennungM).toMatchObject({ wert: 110, quelle: 'annahme' })
  })
})
