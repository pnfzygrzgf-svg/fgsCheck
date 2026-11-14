// AV-Bord in der Rechnung (Plan AV-Geometrie A6, 13.11.2026 spät): Streifenenden, Fahrbahnbreite, Querdistanz und Fahrlinie am
// Bordmodell statt quer zur OSM-Linie. Künstliche Daten: Strasse West–Ost N −4…4 mit Trottoir beidseits (E −200…200).
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { kontextBauen, rechneUebergang } from './index'
import type { StreifenErgebnis, ZufahrtErgebnis } from './typen'
import { messRichtungen } from './typen'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const flaeche = (art: string, ...ringe: P[][]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe })
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const AV_GERADE = [flaeche('Strasse_Weg', rechteck(-200, -4, 200, 4)), flaeche('Trottoir', rechteck(-200, 4, 200, 7)),
  flaeche('Trottoir', rechteck(-200, -7, 200, -4))]

/** Hauptstrasse (Weg 1) durch den Übergang 12 bei (x0, 0), um grad gegen die AV gedreht; dazu ein Querungsweg (footway=crossing) */
function osm(grad = 0, x0 = 0, querung: [number, number][] | null = null): OsmDaten {
  const w = grad * Math.PI / 180, t = Math.tan(w)
  return {
    wege: [weg(1, [[10, x0 - 200, -200 * t], [12, x0, 0], [13, x0 + 200, 200 * t]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
    tram: [], ampeln: [], relationen: [],
    querungen: querung ? [weg(99, [[90, ...querung[0]], [12, x0, 0], [91, ...querung[1]]], { highway: 'footway', footway: 'crossing' })] : [],
    uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(x0, 0)[0], lon: ll(x0, 0)[1] }],
  }
}
/** Übergang rechnen, mit bzw. ohne Bordmodell (ohne: Rechnung bis 13.11.2026), optional als Querung ohne Vortritt */
function rechnen(o: OsmDaten, av: AvFlaeche[], mitBord = true, ohneVortritt = false): StreifenErgebnis[] {
  const k = kontextBauen(o, av)
  if (!mitBord) k.bord = null
  if (ohneVortritt) k.vonHand = { querung: () => ({ typ: 'ohne_vortritt', inselMarkiert: false }) }
  return rechneUebergang(o, av, 12, k).streifen
}
const gerade = (s: StreifenErgebnis[]) => s.flatMap(x => x.zufahrten.filter(z => z.art !== 'abbiegend'))
const laenge = (s: StreifenErgebnis) => Math.round(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]) * 100) / 100
/** Abstand eines Sichtpunkts zum Bord rechts der Fahrt (Bord N −4 bei Fahrt nach Osten, N 4 nach Westen) */
const abstandBordRechts = (z: ZufahrtErgebnis, p: P) => {
  const ost = Math.cos(z.richtung * Math.PI / 180) > 0 || z.richtung === 90   // Richtung als Grad, 90 = Osten
  return ost ? p[1] - O[1] + 4 : 4 - (p[1] - O[1])
}

describe('AV-Bord: schräge OSM-Achse (8° gegen die AV gedreht)', () => {
  const o = osm(8)
  it('Fahrbahnbreite der Zufahrten Bord–Bord senkrecht zum Bord: 8,00 m, Fahrlinie 2,00 m vom Bord (quer zur OSM-Spur bis 13.11.2026: 9,08 m)', () => {
    const neu = gerade(rechnen(o, AV_GERADE)), alt = gerade(rechnen(o, AV_GERADE, false))
    expect(neu.length).toBe(2)
    for (const z of neu) expect([z.fahrbahnM, z.sichtpunktVomRandM]).toEqual([8, 2])
    // bis 13.11.2026: Sehnen quer zur schiefen Spur, Mediane je Seite über die quer wandernden Messpunkte
    for (const z of alt) expect(z.fahrbahnM).toBeCloseTo(9.08, 2)
    // kein Hinweis «Bord aus OSM geschätzt»: der Bord trägt an allen Messpunkten
    for (const z of neu) expect(z.annahmen.filter(a => a.includes('Bord aus OSM geschätzt'))).toEqual([])
  })
  it('Querdistanz der Querung (Achse nur angenommen, senkrecht zum OSM-Weg) Bord–Bord senkrecht zum Bord: 8,00 m statt 8,08 m', () => {
    const [s] = rechnen(o, AV_GERADE, true, true), [a] = rechnen(o, AV_GERADE, false, true)
    expect(s.achseAngenommen).toBe(true)
    expect(s.bordNormale![0]).toBeCloseTo(0, 6)
    expect(Math.abs(s.bordNormale![1])).toBeCloseTo(1, 6)
    expect(s.querung!.L).toBeCloseTo(8, 2)
    expect(a.querung!.L).toBeCloseTo(8.08, 2)
    // der Streifen selbst bleibt senkrecht zum OSM-Weg (Richtung wie bisher), seine Enden liegen am Bord
    expect(laenge(s)).toBeCloseTo(8 / Math.cos(8 * Math.PI / 180) - 0.6, 2)
    expect(s.rand.map(p => Math.round((p[1] - O[1]) * 100) / 100).sort((x, y) => x - y)).toEqual([-4, 4])
    expect(messRichtungen(s).breite).toEqual(s.bordNormale)
  })
  it('Fahrlinie hält ihren Abstand zum Bord rechts an allen Sichtpunkten, auch wo die OSM-Linie die Fahrbahn verlässt', () => {
    for (const z of gerade(rechnen(o, AV_GERADE))) {
      expect(z.sichtpunktVomRandM).toBeCloseTo(2, 2)
      expect(z.sichtpunkte.length).toBeGreaterThan(20)
      // erster Punkt: Lage am Streifen (gleitender Median wie bisher), letzter: an der Spur auf die ganze Länge gebracht (spur.umsetzen);
      // auf der 8° schiefen Spur je höchstens rund 0,3 m daneben, dazwischen genau am Bord
      const d = z.sichtpunkte.map(p => Math.abs(abstandBordRechts(z, p) - 2))
      expect(Math.max(...d.slice(1, -1))).toBeLessThan(0.01)
      expect(Math.max(d[0], d[d.length - 1])).toBeLessThan(0.3)
    }
    // bis 13.11.2026 (ohne Bordmodell): wo die verschobene OSM-Linie die AV-Fläche verlässt, geklemmt und konstant fortgesetzt
    const alt = gerade(rechnen(o, AV_GERADE, false))
    expect(Math.max(...alt.flatMap(z => z.sichtpunkte.map(p => Math.abs(abstandBordRechts(z, p) - 2))))).toBeGreaterThan(0.5)
  })
})

describe('AV-Bord: Streifen am Bord', () => {
  // Laubeggstrasse-Fall (FGS 275422258): Fahrbahn N −5,3…5,3, Insel N −1…1 bei E 47…53 (Loch und Verkehrsinsel), Fusswege in der
  // Fläche Strasse_Weg bei E 48,5…51,5 nach Norden bis N 9,4 und nach Süden bis N −6,9; Übergang auf der Insel
  const insel = rechteck(47, -1, 53, 1)
  const AV_LAUBEGG = [
    flaeche('Strasse_Weg', [lv(-200, -5.3), lv(48.5, -5.3), lv(48.5, -6.9), lv(51.5, -6.9), lv(51.5, -5.3), lv(200, -5.3), lv(200, 5.3), lv(51.5, 5.3),
      lv(51.5, 9.4), lv(48.5, 9.4), lv(48.5, 5.3), lv(-200, 5.3), lv(-200, -5.3)], insel.slice().reverse()),
    flaeche('Verkehrsinsel', insel),
    flaeche('Trottoir', rechteck(-200, 5.3, 48.5, 8.3)), flaeche('Trottoir', rechteck(51.5, 5.3, 200, 8.3)), flaeche('Gartenanlage', rechteck(-200, 9.4, 200, 20)),
    flaeche('Gartenanlage', rechteck(-200, 8.3, 48.5, 9.4)), flaeche('Gartenanlage', rechteck(51.5, 8.3, 200, 9.4)),
    flaeche('Trottoir', rechteck(-200, -8.3, 48.5, -5.3)), flaeche('Trottoir', rechteck(51.5, -8.3, 200, -5.3)), flaeche('Trottoir', rechteck(48.5, -8.3, 51.5, -6.9)),
  ]
  it('Laubeggstrasse-Fall: zwei Teilstreifen über die Insel, 3,7 + 3,7 m zwischen den Bordpunkten (bis 13.11.2026: 5,3 + 7,8 m bis ans Ende der Fusswege)', () => {
    const neu = rechnen(osm(0, 50), AV_LAUBEGG)
    expect(neu.map(laenge)).toEqual([3.7, 3.7])
    expect(neu.map(s => s.randQuelle)).toEqual(['AV', 'AV'])
    expect(neu.every(s => s.annahmen.some(a => a.includes('vor der AV-Bordkante (Bordmodell)')))).toBe(true)
    expect(neu.some(s => s.annahmen.some(a => a.includes('Teilstreifen 1 von 2')))).toBe(true)
    expect(rechnen(osm(0, 50), AV_LAUBEGG, false).map(laenge)).toEqual([5.3, 7.8])
  })
  it('schräg erfasster Streifen (Querungsweg 20° von der Senkrechten) bleibt schräg, Enden am Bord N ±4; Querdistanz = Gehlänge entlang der Achse', () => {
    const w = 20 * Math.PI / 180
    const [s] = rechnen(osm(0, 0, [[-10 * Math.sin(w), -10 * Math.cos(w)], [10 * Math.sin(w), 10 * Math.cos(w)]]), AV_GERADE, true, true)
    expect(s.annahmen[0]).toMatch(/^Streifenachse entlang des OSM-Fusswegs 99, Enden 0,3 m vor der AV-Bordkante \(Bordmodell\)/)
    const ax = Math.atan2(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]) * 180 / Math.PI
    expect(Math.abs(Math.abs(ax) - 20) < 1e-6 || Math.abs(Math.abs(ax) - 160) < 1e-6).toBe(true)
    expect(s.rand.map(p => Math.round((p[1] - O[1]) * 1e6) / 1e6).sort((x, y) => x - y)).toEqual([-4, 4])
    expect(s.achseAngenommen).toBeUndefined()
    expect(s.querung!.L).toBeCloseTo(8 / Math.cos(w), 2)
  })
  it('ohne Bord in der AV (nur Strasse_Weg): wie bisher, Fahrlinie mit Hinweis «Bord aus OSM geschätzt»', () => {
    const nur = [flaeche('Strasse_Weg', rechteck(-200, -4, 200, 4))]
    const neu = rechnen(osm(0), nur), alt = rechnen(osm(0), nur, false)
    expect(neu.map(laenge)).toEqual(alt.map(laenge))
    expect(gerade(neu).map(z => z.fahrbahnM)).toEqual(gerade(alt).map(z => z.fahrbahnM))
    expect(gerade(neu).every(z => z.annahmen.some(a => a.startsWith('Fahrbahnrand entlang der Fahrlinie: Bord aus OSM geschätzt')))).toBe(true)
    expect(gerade(alt).every(z => !z.annahmen.some(a => a.includes('Bord aus OSM geschätzt')))).toBe(true)
  })
})
