// Tests Vorschläge und amtliche Parkfelder (rechner/vorschlaege.ts, E2a), aus fgsCheck (daten/parkkataster.test.ts,
// rechner/eingaben.test.ts) übernommen und auf den Knoten angepasst: OSM-Parkierung links/rechts, nur im Sichtfeld, nicht am
// Knoten; Überdeckung durch amtliche Felder (30 %); amtliche Felder zählen sofort, verworfene nicht; Zweirad nur Hinweis;
// Baumkataster als Vorschlag; Hindernis in D.
//
// Lage wie rechnen.test.ts (Meter, x Ost, y Nord, Ursprung = OSM-Knoten), ohne Gebäude:
//   Hauptstrasse West–Ost (Weg 1, digitalisiert von West nach Ost), Fahrbahn y = −3 … +3; Nebenstrasse von Süden, x = −2,5 … +2,5.
//   D = (0,75; −6). Nach links: Achse y = −1,5, K = (1,25; −1,5), FA(s) = (1,25 − s; −1,5). Tempo 30, Erschliessungsstrasse:
//   A = 20 m, Zielpunkte bis 1,5 × 35 = 52,5 m, aufgerundet 53 m.
//   parking:right=lane: Streifen 2 m auf der Fahrbahn am Südrand (y = −3 … −1), parking:left am Nordrand (y = 1 … 3); je Seite
//   ein Lauf westlich und östlich des Knotens, nicht näher als 10 m am Knoten (Abtastung je 2 m ab Wegbeginn x = −200: erster
//   bzw. letzter Punkt bei x = −11 bzw. x = +11).

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { KatasterFeld } from '../daten/parkkataster'
import { rechneKnoten } from './rechnen'
import { osmUeberdeckt, parkKatasterFelder, baumVorschlaege, anteilAmtlich, imSichtfeld, OSM_UEBERDECKT_ANTEIL } from './vorschlaege'
import { KEINE_HINDERNISSE, type HindernisEingaben, type RichtungErgebnis } from './typen'
import type { Hindernis } from './hindernisse'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (haupt: Record<string, string> = {}): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30', ...haupt }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const fahrbahn: AvFlaeche = { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[lv(-200, -3), lv(-2.5, -3),
  lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)]] }
const feld = (id: string, ring: P[], klasse: KatasterFeld['klasse'] = 'auto'): KatasterFeld => ({ id, klasse, ring, name: id })
const mit = (x: Partial<HindernisEingaben>): HindernisEingaben => ({ ...KEINE_HINDERNISSE, ...x })
const park = (felder: KatasterFeld[]) => ({ felder, quellenangabe: 'Parkplätze öffentlich (Test)' })
const rechne = (h: HindernisEingaben, tags: Record<string, string> = {}) =>
  rechneKnoten(osm(tags), [fahrbahn], { knoten: 12, zufahrt: null, hindernisse: h }).ergebnis!
const links = (e: ReturnType<typeof rechne>) => e.richtungen.find(r => r.richtung === 'links') as RichtungErgebnis
const osmV = (e: ReturnType<typeof rechne>) => e.hindernis.vorschlaege.filter(v => v.hindernis.quelle === 'osm')

describe('OSM-Parkierung als Vorschlag (nur im Sichtfeld, nicht am Knoten)', () => {
  it('ohne Tags keine Vorschläge; ohne Hindernisse frei bis zum Ende der Zielpunkte', () => {
    const e = rechne(KEINE_HINDERNISSE)
    expect(e.hindernis.vorschlaege).toEqual([])
    expect(links(e).vorhanden).toBeCloseTo(53, 6)
  })
  it('parking:right=lane (Südrand): westlich und östlich je ein Lauf, beide im Sichtfeld; zählen nicht', () => {
    const e = rechne(KEINE_HINDERNISSE, { 'parking:right': 'lane' })
    expect(osmV(e).map(v => v.id)).toEqual(['osm:1:right:0', 'osm:1:right:1'])
    const r0 = (osmV(e)[0].hindernis as Extract<Hindernis, { art: 'parkfeld' }>).ring
    const ys = r0.map(p => p[1] - O[1]), xs = r0.map(p => p[0] - O[0])
    expect(Math.min(...ys)).toBeCloseTo(-3, 3); expect(Math.max(...ys)).toBeCloseTo(-1, 3)    // 2 m auf der Fahrbahn
    expect(Math.max(...xs)).toBeCloseTo(-11, 3)                                              // nicht näher als 10 m am Knoten
    expect(links(e).vorhanden).toBeCloseTo(53, 6)                                          // Vorschlag zählt nicht
    expect(osmV(e)[0].grund).toContain('parking:right=lane')
  })
  it('parking:left=lane (Nordrand): nur der östliche Lauf liegt im Sichtfeld (nach rechts), der westliche hinter der Achse', () => {
    const e = rechne(KEINE_HINDERNISSE, { 'parking:left': 'lane' })
    expect(osmV(e).map(v => v.id)).toEqual(['osm:1:left:1'])
  })
  it('bestätigt (als Hindernis im Fall): zählt, verschiebt die Achse um 1,90 m (Parkstreifen); nicht mehr als Vorschlag', () => {
    const v = rechne(KEINE_HINDERNISSE, { 'parking:right': 'lane' }).hindernis.vorschlaege[0]
    const e = rechne(mit({ hindernisse: [{ ...v.hindernis, name: 'bestätigt' }] }), { 'parking:right': 'lane' })
    // Parkstreifen auf der Fahrbahn (y = −3 … −1): Achse 1,50 + 1,90 m vom Rand, y = +0,4, K = (1,25; 0,4); bis zum Folgeauftrag
    // lag die Achse bei y = −1,5 im Streifen (vorhanden 12,25 m). Jetzt massgebend die Ecke (−11; −1): mit H = 6,4, h = 5
    //   s = 0,5 + 11,75 · 6,4 / 5 = 15,54 m
    expect(links(e).randAbstand).toBeCloseTo(3.4, 6)
    expect(Math.abs(links(e).vorhanden - (0.5 + 11.75 * 6.4 / 5))).toBeLessThan(0.01)
    expect(links(e).status).toBe('nicht_erfuellt')
    expect(links(e).verdecker?.quelle).toBe('aus OSM (bestätigt)')
    expect(osmV(e).map(x => x.id)).toEqual(['osm:1:right:1'])
  })
  it('verworfen: nicht mehr vorgeschlagen', () => {
    const e = rechne(mit({ verworfen: ['osm:1:right:0'] }), { 'parking:right': 'lane' })
    expect(osmV(e).map(x => x.id)).toEqual(['osm:1:right:1'])
  })
})

describe('Amtliche Parkfelder: zählen sofort, einzeln verwerfbar', () => {
  // Feld hinter dem Südrand in der Ecke: y = −5 … −3, x = −13 … −8; massgebend die Ecke (−8; −3):
  // Sichtlinie bei x = −8: t = 8,75 / (s − 0,5), y = −6 + 4,5 t = −3  ->  s = 0,5 + 8,75 · 1,5 = 13,625 m
  const vor = feld('bernpark:Parkfeld_Gebuehrenpflichtig:1:0', rechteck(-13, -5, -8, -3))
  it('zählt ohne Bestätigung: Strahlensatz 13,625 m, Liste mit Art und Quelle', () => {
    const e = rechne(mit({ park: park([vor]) }))
    expect(Math.abs(links(e).vorhanden - 13.625)).toBeLessThan(0.01)
    expect(links(e).verdeckerListe.map(t => [t.id, t.art, t.quelle, t.wirkung])).toEqual([[vor.id, 'Parkfeld Auto', 'amtlich (Parkkataster)', 'voll']])
    expect(links(e).verdeckerListe[0].sErst).toBeCloseTo(13.7, 6)
    expect(e.hindernis.amtlich.map(v => v.id)).toEqual([vor.id])
    expect(e.annahmen.some(a => a.startsWith('Parkfelder gelten als belegt'))).toBe(true)
  })
  it('verworfen: zählt nicht, kommt getrennt zurück; Quelle abgeschaltet (park null): keine Wirkung', () => {
    const e = rechne(mit({ park: park([vor]), verworfen: [vor.id] }))
    expect(links(e).vorhanden).toBeCloseTo(53, 6)
    expect(e.hindernis.amtlich).toEqual([])
    expect(e.hindernis.amtlichVerworfen.map(v => v.id)).toEqual([vor.id])
    expect(links(rechne(KEINE_HINDERNISSE)).vorhanden).toBeCloseTo(53, 6)
  })
  it('Velo-Feld: nur Hinweis «Zweiräder», Status unverändert', () => {
    const v = feld('bernpark:Parkplatz_Velo_Mofa:2:0', rechteck(-13, -5, -8, -3), 'velo')
    const l = links(rechne(mit({ park: park([v]) })))
    expect(l.vorhanden).toBeCloseTo(53, 6)
    expect(l.status).toBe('erfuellt')
    expect(l.statusZusatz).toEqual(['Hinweis: Zweiräder'])
    expect(l.verdeckerListe.map(t => t.wirkung)).toEqual(['hinweis'])
    expect(l.hinweise.some(h => h.startsWith('Zweiräder im Sichtfeld'))).toBe(true)
  })
  it('Feld, in dem D liegt: nicht gerechnet, Hinweis', () => {
    const d = feld('bernpark:Parkfeld_weiss_APK:3:0', rechteck(-1, -8, 2, -4))
    const e = rechne(mit({ park: park([d]) }))
    expect(e.hindernis.inD).toEqual([d.id])
    expect(links(e).vorhanden).toBeCloseTo(53, 6)
    expect(e.hinweise.some(h => h.startsWith('D liegt im Hindernis'))).toBe(true)
  })
  it('nur Felder in Reichweite (weitester Zielpunkt plus 10 m, Abstand der Feldfläche zum Knoten)', () => {
    expect(parkKatasterFelder([feld('a', rechteck(50, 2, 55, 4)), feld('b', rechteck(70, 2, 75, 4))], lv(0, 0), 60, 'q').map(v => v.id)).toEqual(['a'])
    const e = rechne(mit({ park: park([feld('weit', rechteck(-200, -5, -195, -3))]) }))
    expect(e.hindernis.reichweite).toBeGreaterThan(50); expect(e.hindernis.reichweite).toBeLessThan(80)
    expect(e.hindernis.amtlich).toEqual([])
  })
})

describe('OSM-Parkierungsvorschläge neben amtlichen Feldern (fgsCheck)', () => {
  it('vom Kataster überdeckte OSM-Vorschläge entfallen, auch gegen verworfene Felder; Felder auf der anderen Seite nicht', () => {
    const tags = { 'parking:right': 'lane' }
    // amtliche Felder 5 m lang mit 1 m Lücke am Südrand westlich des Knotens: decken rund 80 % des westlichen Laufs
    const felder: KatasterFeld[] = []
    for (let x = -100; x < -10; x += 6) felder.push(feld(`bernpark:Parkfeld_weiss_APK:${x}:0`, rechteck(x, -3, x + 5, -1)))
    const e = rechne(mit({ park: park(felder) }), tags)
    expect(osmV(e).map(v => v.id)).toEqual(['osm:1:right:1'])
    expect(e.hindernis.osmUeberdeckt).toBe(1)
    const verworfen = rechne(mit({ park: park(felder), verworfen: felder.map(f => f.id) }), tags)
    expect(osmV(verworfen).map(v => v.id)).toEqual(['osm:1:right:1'])
    const nord = [feld('bernpark:x:1:0', rechteck(-100, 1, -10, 3))]
    expect(osmV(rechne(mit({ park: park(nord) }), tags)).length).toBe(2)
  })
  it('Regel 30 % der Vorschlagsfläche', () => {
    expect(OSM_UEBERDECKT_ANTEIL).toBe(0.3)
    const v = { id: 'o', grund: '', hindernis: { id: 'o', art: 'parkfeld' as const, klasse: 'auto' as const, ring: rechteck(0, 0, 10, 2), quelle: 'osm' as const } }
    expect(anteilAmtlich(rechteck(0, 0, 10, 2), [rechteck(0, 0, 5, 2)])).toBeCloseTo(0.5, 6)
    expect(osmUeberdeckt([v], [rechteck(0, 0, 2.9, 2)]).size).toBe(0)
    expect(osmUeberdeckt([v], [rechteck(0, 0, 3.1, 2)]).size).toBe(1)
    expect(osmUeberdeckt([v], []).size).toBe(0)
  })
  it('im Sichtfeld: Schnittfläche mit einem Dreieck', () => {
    const dr = [lv(0, 0), lv(10, 0), lv(0, 10)]
    expect(imSichtfeld(rechteck(1, 1, 2, 2), [dr])).toBe(true)
    expect(imSichtfeld(rechteck(8, 8, 9, 9), [dr])).toBe(false)
    expect(imSichtfeld(rechteck(1, 1, 2, 2), [])).toBe(false)
  })
})

describe('Baumkataster: Vorschläge, zählen erst nach «bestätigen»', () => {
  const b = (id: string, x: number, y: number) => ({ id, p: lv(x, y), name: `Baum ${id}` })
  it('in Reichweite als Vorschlag (Stamm 0,5 m, Quelle kataster); bestätigt zählt als Palisade; verworfen weg', () => {
    expect(baumVorschlaege([b('nah', 0, 59), b('weit', 0, 61)], lv(0, 0), 60, 'q').map(v => v.id)).toEqual(['nah'])
    const baeume = { baeume: [b('bern:1', -8, -3.5), b('bern:2', 0, -150)], quellenangabe: 'Baumkataster (Test)' }
    const e = rechne(mit({ baeume }))
    expect(e.hindernis.vorschlaege.map(v => [v.id, v.hindernis.art, v.hindernis.quelle])).toEqual([['bern:1', 'baum', 'kataster']])
    expect(links(e).palisade).toBeNull()                                   // Vorschlag zählt nicht
    const best = rechne(mit({ baeume, hindernisse: [e.hindernis.vorschlaege[0].hindernis] }))
    expect(best.hindernis.vorschlaege).toEqual([])
    expect(links(best).palisade).not.toBeNull()
    expect(links(best).verdeckerListe.map(t => [t.id, t.wirkung, t.quelle])).toEqual([['bern:1', 'palisade', 'Baumkataster']])
    expect(rechne(mit({ baeume, verworfen: ['bern:1'] })).hindernis.vorschlaege).toEqual([])
  })
})
