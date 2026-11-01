// Tests 30.10.2026: Annäherungsbereich je Ende von Hand (StreifenHand.ann): Versatz entlang der Bordkante und Breite unabhängig von
// der Streifenbreite; verschiebt Wartepunkt und Trapez bzw. den auf die AV-Bordkante gelegten Bereich; Fall-Datei hin und zurück.
// Künstliche Strasse wie bedarf/befundblatt.test.ts: Hauptstrasse West–Ost, Fahrbahn 8 m (y −4 … 4), Streifen von Hand bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import { rechneFall } from './rechner/index'
import { annaeherungsbereich, warteMitHand } from './rechner/streifen'
import { annHandSetzen, annHandText, fallLesen, fallSchreiben, leererFall, streifenHandTeilen, type Fall, type StreifenHand } from './fall'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, k: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: k.map(x => x[0]), geom: k.map(x => ll(x[1], x[2])) })
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]

/** Fall mit einem Streifen von Hand quer über die Fahrbahn (A im Süden, B im Norden), 4 m breit */
function fallMit(ann?: StreifenHand['ann']): Fall {
  const f = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  f.streifenHand = [{ id: 'hand-1', p0: lv(0, -4.5), p1: lv(0, 4.5), breite: 4, herkunft: 'gezeichnet', ...(ann ? { ann } : {}) }]
  return f
}
const xs = (poly: P[][]) => poly[0].map(p => p[0] - O[0])
const breite = (poly: P[][]) => Math.max(...xs(poly)) - Math.min(...xs(poly))
const mitteX = (poly: P[][]) => (Math.max(...xs(poly)) + Math.min(...xs(poly))) / 2

describe('Annäherungsbereich von Hand: Rechnung', () => {
  const ohne = rechneFall(OSM, AV, [], 12, fallMit(), null).streifen[0]
  const mit = rechneFall(OSM, AV, [], 12, fallMit([{ versatz: 1, breite: 3 }, null]), null).streifen[0]
  it('ohne Vorgabe: Grundlage je Ende (Mitte auf der Bordkante, Richtung, Breite des Streifens), keine Vorgabe', () => {
    expect(ohne.annBasis).toHaveLength(2)
    expect(ohne.annHand).toBeUndefined()
    expect(ohne.annBasis![0].breite).toBeCloseTo(4, 6)
    expect(ohne.annBasis![0].rand[1] - O[1]).toBeCloseTo(-4, 1)
    // positiv links der Achse A→B (Achse nach Norden): nach Westen
    expect(ohne.annBasis![0].u[0]).toBeCloseTo(-1, 6)
    expect(breite(ohne.ann[0])).toBeGreaterThan(3.9)
  })
  it('mit Vorgabe an Ende A: Wartepunkt um den Versatz entlang der Kante, Bereich 3 m breit; Ende B unverändert', () => {
    expect(mit.annHand).toEqual([{ versatz: 1, breite: 3 }, null])
    expect(mit.warte![0][0][0] - ohne.warte![0][0][0]).toBeCloseTo(-1, 6)
    expect(mit.warte![0][0][1]).toBeCloseTo(ohne.warte![0][0][1], 6)
    expect(mitteX(mit.ann[0]) - mitteX(ohne.ann[0])).toBeCloseTo(-1, 1)
    expect(breite(mit.ann[0])).toBeLessThan(breite(ohne.ann[0]) - 0.9)
    expect(mit.ann[1]).toEqual(ohne.ann[1])
    expect(mit.warte![1]).toEqual(ohne.warte![1])
    expect(mit.annBasis).toEqual(ohne.annBasis)
  })
  it('warteMitHand und Trapez: Versatz entlang der Kante (positiv links der Achse), Breite von Hand', () => {
    const w: [P, P, P, number] = [[0, 0], [0, -1], [1, 0], 4]
    const n: P = [0, 1]   // Achse nach Norden: links = Westen
    const v = warteMitHand(w, n, { versatz: 0.8, breite: 2 })
    expect(v[0][0]).toBeCloseTo(-0.8, 9); expect(v[3]).toBe(2)
    expect(warteMitHand(w, n, null)).toBe(w)
    const t = annaeherungsbereich(v[0], v[1], v[2], v[3])
    expect(t[0][0][0]).toBeCloseTo(-1.8, 9); expect(t[0][1][0]).toBeCloseTo(0.2, 9)
  })
})

describe('Annäherungsbereich von Hand: Fall', () => {
  it('Fall-Datei hin und zurück; ohne Vorgabe kein Feld; ungültige Vorgabe mit Hinweis übergangen', () => {
    const f = fallMit([null, { versatz: -0.5, breite: 2.5 }])
    const [g, h] = fallLesen(fallSchreiben(f))
    expect(h).toEqual([])
    expect(g.streifenHand[0].ann).toEqual([null, { versatz: -0.5, breite: 2.5 }])
    expect(JSON.parse(fallSchreiben(fallMit())).streifenHand[0].ann).toBeUndefined()
    const roh = JSON.parse(fallSchreiben(f))
    for (const schlecht of [[null, null], [{ versatz: 0, breite: 0.2 }, null], [{ versatz: 20, breite: 3 }, null], 'x', [null]]) {
      roh.streifenHand[0].ann = schlecht
      const [x, hx] = fallLesen(JSON.stringify(roh))
      expect(x.streifenHand[0].ann).toBeUndefined()
      expect(hx).toEqual(['Annäherungsbereich von Hand am Streifen hand-1 ungültig, übergangen'])
    }
  })
  it('setzen, zurücksetzen (Feld entfällt ohne Vorgabe), auf cm gerundet; Text für «Lage und Masse»', () => {
    const s: StreifenHand = { id: 'hand-1', p0: lv(0, -4), p1: lv(0, 4), breite: 4 }
    annHandSetzen(s, 0, { versatz: 0.8034, breite: 3 })
    expect(s.ann).toEqual([{ versatz: 0.8, breite: 3 }, null])
    expect(annHandText(0, s.ann![0])).toBe('Annäherungsbereich A: versetzt +0,80 m, Breite 3,00 m (von Hand)')
    expect(annHandText(1, { versatz: -1.2, breite: 2 })).toBe('Annäherungsbereich B: versetzt −1,20 m, Breite 2,00 m (von Hand)')
    expect(annHandText(1, null, 4)).toBe('Annäherungsbereich B: wie gerechnet, Breite 4,00 m')
    annHandSetzen(s, 0, null)
    expect(s.ann).toBeUndefined()
  })
  it('Teilen an der Insel: Ende A bleibt am ersten, Ende B geht an den zweiten Teil', () => {
    const f = fallMit([{ versatz: 1, breite: 3 }, { versatz: -1, breite: 2 }])
    const r = streifenHandTeilen(f, 'hand-1', [[lv(0, -4.5), lv(0, -1)], [lv(0, 1), lv(0, 4.5)]], () => 1)!
    expect(f.streifenHand.find(x => x.id === 'hand-1')!.ann).toEqual([{ versatz: 1, breite: 3 }, null])
    expect(f.streifenHand.find(x => x.id === r.neuId)!.ann).toEqual([null, { versatz: -1, breite: 2 }])
  })
})
