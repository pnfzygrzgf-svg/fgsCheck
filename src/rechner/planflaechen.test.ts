// Tests Flächen (Plan) von Hand (16.10.2026): Verschneidung mit der AV, Wirkung in der Rechnung, Fall-Datei, dazu die
// Kann-Befunde der Prüfung (Fixpunkte lesen, Herkunft der Zufahrt auf kurvigen Strassen).
// Künstlicher Knoten wie eingaben.test.ts: Hauptstrasse West–Ost (Fahrbahn 8 m, y −4 bis 4), Übergang bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { Fahrbahn, Inseln, Flaechen } from './flaechen'
import { avMitPlan, planFlaecheM2, planAmRand, ohneSplitter, planTitel, SPLITTER_M2 } from './planflaechen'
import { rechneFall } from './index'
import { flaeche } from './poly'
import { leererFall, fallLesen, fallSchreiben, eingabenSchluessel, eingabenZahl, hatEingaben, naechstePlanId, imLv95,
  FIXPUNKT_NAME_MAX, type Fall, type FlaechePlan } from '../fall'
import { zufahrtNamen, zufahrtLang, zufahrtAzimut } from '../benennung'
import type { ZufahrtErgebnis } from './typen'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
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
const AV: AvFlaeche[] = [
  av('Strasse_Weg', rechteck(-200, -4, 200, 4)),
  av('Trottoir', rechteck(-200, 4, 200, 7)),
  av('Trottoir', rechteck(-200, -7, 200, -4)),
  av('Gebaeude', rechteck(10, 7, 20, 15)),
]
const plan = (id: string, art: FlaechePlan['art'], ring: P[]): FlaechePlan => ({ id, art, ring })
const NASE = plan('plan-1', 'trottoir', rechteck(-3, 2, 3, 4))          // Trottoirnase 2 m in die Fahrbahn
const fallMit = (f: (x: Fall) => void): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const sehne = (a: AvFlaeche[]) => new Fahrbahn(a).sehne(lv(0, 0), [0, 1])

describe('Verschneidung AV mit Flächen (Plan)', () => {
  it('ohne Plan-Flächen: dieselbe Liste (Rechnung unverändert)', () => {
    expect(avMitPlan(AV, undefined).av).toBe(AV)
    expect(avMitPlan(AV, []).av).toBe(AV)
  })
  it('Trottoirnase verkürzt die Fahrbahn-Sehne, Fläche dort Trottoir', () => {
    expect(sehne(AV)).toEqual([4, 4])
    const r = avMitPlan(AV, [NASE])
    const s = sehne(r.av)!
    expect(s[0]).toBeCloseTo(2, 6); expect(s[1]).toBeCloseTo(4, 6)
    expect(new Flaechen(r.av, ['Trottoir', 'Verkehrsinsel']).art(lv(0, 3))).toBe('Trottoir')
    expect(new Fahrbahn(r.av).enthaelt(lv(0, 3))).toBe(false)
    expect(r.angefasst).toBe(1)                       // nur die Fahrbahn (das Trottoir grenzt an, ohne Überlappung)
    expect(r.teile.map(t => t.id)).toEqual(['plan-1'])
    // Fläche erhalten: Fahrbahn 400 × 8 − 12 (Nase in der Fahrbahn)
    const fb = r.av.filter(f => f.art === 'Strasse_Weg' && !f.planId)
    expect(flaeche(fb.map(f => f.ringe))).toBeCloseTo(3200 - 12, 4)
    // nicht betroffene AV-Flächen bleiben dieselben Objekte (keine Rundung)
    expect(r.av.includes(AV[2])).toBe(true)
    expect(r.av.includes(AV[3])).toBe(true)
  })
  it('Fahrbahn-Fläche verlängert die Sehne (verschobener Randstein nach aussen)', () => {
    const r = avMitPlan(AV, [plan('plan-1', 'fahrbahn', rechteck(-3, 4, 3, 6))])
    const s = sehne(r.av)!
    expect(s[0]).toBeCloseTo(6, 6); expect(s[1]).toBeCloseTo(4, 6)
  })
  it('Insel teilt die Fahrbahn (Inseln, Sehne nur bis zur Insel)', () => {
    const r = avMitPlan(AV, [plan('plan-1', 'insel', rechteck(-3, -1, 3, 1))])
    expect(new Inseln(r.av).enthaelt(lv(0, 0))).toBe(true)
    const s = new Fahrbahn(r.av).sehne(lv(0, 2), [0, 1])!
    expect(s[1]).toBeCloseTo(1, 6)                    // von y = 2 nach Süden bis zur Insel
  })
  it('spätere Plan-Flächen gehen früheren vor', () => {
    const r = avMitPlan(AV, [NASE, plan('plan-2', 'fahrbahn', rechteck(-1, 1, 1, 5))])
    expect(new Fahrbahn(r.av).enthaelt(lv(0, 3))).toBe(true)
    expect(new Fahrbahn(r.av).enthaelt(lv(2, 3))).toBe(false)
    // umgekehrt: die Nase deckt die Fahrbahn-Fläche
    const u = avMitPlan(AV, [plan('plan-2', 'fahrbahn', rechteck(-1, 1, 1, 5)), { ...NASE, id: 'plan-3' }])
    expect(new Fahrbahn(u.av).enthaelt(lv(0, 3))).toBe(false)
    expect(new Fahrbahn(u.av).enthaelt(lv(0, 4.5))).toBe(true)
    // ganz überdeckt: Meldung
    const g = avMitPlan(AV, [plan('plan-1', 'insel', rechteck(-1, 2, 1, 3)), { ...NASE, id: 'plan-2' }])
    expect(g.meldungen.join(' ')).toContain('Plan-Fläche 1 (Insel) ganz von späteren Plan-Flächen überdeckt')
  })
  it('Gebäude bleiben: Plan-Fläche wird um das Gebäude gekürzt bzw. übergangen', () => {
    const r = avMitPlan(AV, [plan('plan-1', 'trottoir', rechteck(5, 4, 15, 10))])
    expect(r.av.filter(f => f.art === 'Gebaeude')).toEqual([AV[3]])
    expect(flaeche(r.teile.map(t => t.poly))).toBeCloseTo(60 - 15, 4)  // 10 × 6 ohne 5 × 3 im Gebäude
    const g = avMitPlan(AV, [plan('plan-1', 'insel', rechteck(12, 9, 14, 11))])
    expect(g.teile).toEqual([])
    expect(g.meldungen[0]).toContain('ganz in Gebäuden')
  })
  it('Splitter: Kante 1 cm neben der AV-Bordkante hinterlässt keine schmalen Reste', () => {
    // Nase reicht bis y = 4,01 (1 cm ins Trottoir): ohne Filter bliebe kein Splitter der Fahrbahn, aber einer im Trottoir wäre
    // Teil der Nase; umgekehrt bis 3,99: 1 cm breiter Fahrbahnstreifen zwischen Nase und Trottoir
    const r = avMitPlan(AV, [plan('plan-1', 'trottoir', rechteck(-3, 2, 3, 3.99))])
    const reste = r.av.filter(f => f.art === 'Strasse_Weg' && f.ringe[0].every(p => p[1] > O[1] + 3.9))
    expect(reste).toEqual([])
    expect(ohneSplitter([[rechteck(0, 0, 10, 0.01)]])).toEqual([])
    expect(ohneSplitter([[rechteck(0, 0, 0.1, 0.1)]])).toEqual([])         // 0,01 m² < SPLITTER_M2
    expect(SPLITTER_M2).toBeGreaterThan(0.01)
    expect(ohneSplitter([[rechteck(0, 0, 1, 1)]]).length).toBe(1)
  })
  it('Koordinaten: unveränderte Ecken bleiben auf 1e-6 m gleich (Verschiebung um den LV95-Nullpunkt)', () => {
    const krumm: P = [2596446.987654, 1198810.023456]
    const a: AvFlaeche[] = [av('Strasse_Weg', [krumm, [krumm[0] + 20, krumm[1]], [krumm[0] + 20, krumm[1] + 8], [krumm[0], krumm[1] + 8]])]
    const r = avMitPlan(a, [plan('plan-1', 'trottoir', [[krumm[0] + 5, krumm[1] + 6], [krumm[0] + 9, krumm[1] + 6], [krumm[0] + 9, krumm[1] + 9],
      [krumm[0] + 5, krumm[1] + 9]])])
    const fb = r.av.find(f => f.art === 'Strasse_Weg')!
    const nah = fb.ringe[0].map(p => Math.hypot(p[0] - krumm[0], p[1] - krumm[1])).reduce((x, y) => Math.min(x, y))
    expect(nah).toBeLessThan(1e-6)
  })
  it('Fläche (m²), Titel, Rand einer Plan-Fläche', () => {
    expect(planFlaecheM2(NASE.ring)).toBeCloseTo(12, 6)
    expect(planFlaecheM2([lv(0, 0), lv(2, 2), lv(2, 0), lv(0, 2)])).toBeCloseTo(2, 6)   // Achterfigur: Selbstschnitt aufgelöst
    expect(planTitel('plan-3')).toBe('Plan-Fläche 3')
    const r = avMitPlan(AV, [NASE])
    expect(planAmRand(r.teile, lv(0, 2))?.id).toBe('plan-1')
    expect(planAmRand(r.teile, lv(0, 1.5))).toBeNull()
  })
})

describe('Rechnung mit Flächen (Plan) (rechneFall)', () => {
  const ohne = rechneFall(OSM, AV, [], 12, fallMit(() => {}), null)
  it('leere Liste rechnet wie ohne Feld', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(f => { f.flaechenPlan = [] }), null)
    const weg = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'ms' ? undefined : v)))
    expect(weg(r)).toEqual(weg(ohne))
    expect('planFlaechen' in ohne).toBe(false)
  })
  it('Streifen aus OSM + AV: Trottoirnase verkürzt den Streifen, Bordkante und Wartebereich an der Nase', () => {
    expect(ohne.streifen[0].p1[1]).toBeCloseTo(O[1] + 3.7, 6)
    const r = rechneFall(OSM, AV, [], 12, fallMit(f => { f.flaechenPlan = [NASE] }), null)
    const s = r.streifen[0]
    expect(s.p1[1]).toBeCloseTo(O[1] + 1.7, 6)
    expect(s.rand[1][1]).toBeCloseTo(O[1] + 2, 6)
    expect(s.randQuelle).toBe('AV')
    expect(s.annahmen).toContain('Bordkanten: Ende A nach AV, Ende B nach Plan-Fläche 1 (Trottoir) von Hand')
    // Annäherungsbereich am Ende B auf der Nase (1 m tief ab y = 2)
    const ys = s.ann[1].flat().map(p => p[1] - O[1])
    expect(Math.min(...ys)).toBeGreaterThan(1.9); expect(Math.max(...ys)).toBeLessThan(3.1)
    expect(r.meldungen[0]).toMatch(/^Rechnung mit geplanter Bodenbedeckung \(von Hand\): Plan-Fläche 1: Trottoir 12,0 m²/)
    expect(r.planFlaechen).toBe(1)
    // Sichtpunkte weiter auf der Fahrbahn, ausserhalb der Nase
    const fb = new Fahrbahn(avMitPlan(AV, [NASE]).av)
    for (const z of s.zufahrten) {
      expect(z.sichtpunkte.length).toBeGreaterThan(5)
      expect(z.sichtpunkte.every(p => fb.enthaelt(p))).toBe(true)
    }
  })
  it('Streifen von Hand: Rand und Vermassung nach der Nase', () => {
    const f = fallMit(x => {
      x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4, herkunft: 'gezeichnet' })
      x.flaechenPlan = [NASE]
    })
    const s = rechneFall(OSM, AV, [], 12, f, null).streifen[0]
    const v = s.vermassung!
    expect(v.fahrbahnM).toBeCloseTo(6, 6)
    expect(v.randAbstandM![0]).toBeCloseTo(0.3, 6)
    expect(v.randAbstandM![1]).toBeCloseTo(-1.7, 6)   // Ende B ragt 1,7 m über den geplanten Rand
    expect(v.randQuelle).toBe('Bordkanten wie in der Rechnung (Sehne der Fahrbahn entlang der Achse): Ende A nach AV, Ende B nach ' +
      'Plan-Fläche 1 (Trottoir) von Hand')
    const v0 = rechneFall(OSM, AV, [], 12, fallMit(x => { x.streifenHand = f.streifenHand }), null).streifen[0].vermassung!
    expect(v0.fahrbahnM).toBeCloseTo(8, 6)
  })
  it('Insel (Plan) teilt den Streifen aus OSM + AV, Annahme nennt die Plan-Fläche', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(f => { f.flaechenPlan = [plan('plan-1', 'insel', rechteck(-3, -1, 3, 1))] }), null)
    expect(r.streifen.length).toBe(2)
    expect(r.streifen[0].annahmen.join(' ')).toContain('Teilstreifen 1 von 2 (Verkehrsinsel auf der Achse nach Plan-Fläche 1 (Insel) von Hand)')
    expect(r.streifen.flatMap(s => s.zufahrten).every(z => z.art === 'insel')).toBe(true)
  })
  it('Streifen von Hand über eine Insel (Plan): Hinweis «zwei Teilstreifen», kein falsches Randmass', () => {
    const f = fallMit(x => {
      x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4, herkunft: 'gezeichnet' })
      x.flaechenPlan = [plan('plan-1', 'insel', rechteck(-3, -1, 3, 1))]
    })
    const s = rechneFall(OSM, AV, [], 12, f, null).streifen[0]
    expect(s.annahmen.join(' ')).toContain('Streifen quert Plan-Fläche 1 (Insel) von Hand: als zwei Teilstreifen zeichnen')
    expect([s.vermassung!.randAbstandM, s.vermassung!.fahrbahnM]).toEqual([null, null])
    expect(s.vermassung!.randQuelle).toBe('Streifen quert Plan-Fläche 1 (Insel) von Hand: Rand nicht vermasst – als zwei Teilstreifen zeichnen')
    // als zwei Teile gezeichnet: je Teil Rand an AV und Insel
    const g = fallMit(x => {
      x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, -1.3), breite: 4, herkunft: 'gezeichnet' })
      x.streifenHand.push({ id: 'hand-2', p0: lv(0, 1.3), p1: lv(0, 3.7), breite: 4, herkunft: 'gezeichnet' })
      x.flaechenPlan = [plan('plan-1', 'insel', rechteck(-3, -1, 3, 1))]
    })
    const r = rechneFall(OSM, AV, [], 12, g, null)
    expect(r.streifen.map(x => x.annahmen.find(a => a.startsWith('Bordkanten:')))).toEqual([
      'Bordkanten: Ende A nach AV, Ende B nach Plan-Fläche 1 (Insel) von Hand', 'Bordkanten: Ende A nach Plan-Fläche 1 (Insel) von Hand, Ende B nach AV'])
    expect(r.streifen.map(x => x.vermassung!.fahrbahnM!.toFixed(2))).toEqual(['3.00', '3.00'])
  })
  it('«Fahrbahnrand nach Plan-Fläche» nur, wo die Fahrbahn quer zur Fahrlinie an der Plan-Fläche endet', () => {
    // Nase am Streifen: die Sehne der Fahrlinie nach Westen (Zufahrt von Osten, nördliche Hälfte) endet an der Nase
    const r = rechneFall(OSM, AV, [], 12, fallMit(f => { f.flaechenPlan = [NASE] }), null)
    const txt = (z: ZufahrtErgebnis) => z.annahmen.filter(a => a.startsWith('Fahrbahnrand'))
    expect(r.streifen[0].zufahrten.some(z => txt(z).length)).toBe(true)
    // Trottoir-Fläche (Plan) hinter dem bestehenden Trottoir (ändert keine Fahrbahn): keine Annahme
    const weit = rechneFall(OSM, AV, [], 12, fallMit(f => { f.flaechenPlan = [plan('plan-1', 'trottoir', rechteck(-3, 5, 3, 6.5))] }), null)
    expect(weit.streifen[0].zufahrten.every(z => !txt(z).length)).toBe(true)
    expect(weit.streifen[0].annahmen.some(a => a.startsWith('Bordkanten:'))).toBe(false)
  })
  it('Insel von Hand in einer Insel (Plan) zählt nur einmal', () => {
    const f = fallMit(x => {
      x.flaechenPlan = [plan('plan-1', 'insel', rechteck(-3, -1, 3, 1))]
      x.hindernisse.push({ id: 'i', art: 'insel', ring: rechteck(-2, -0.8, 2, 0.8), quelle: 'hand' })
    })
    const r = rechneFall(OSM, AV, [], 12, f, null)
    expect(r.meldungen.join(' ')).toContain('Insel von Hand liegt in einer Plan-Fläche (Insel): sie zählt nur einmal')
    expect(r.streifen.length).toBe(2)
    expect(r.streifen.every(s => !s.annahmen.join(' ').includes('Insel von Hand'))).toBe(true)
  })
})

describe('Eckradius an einer Fläche (Plan): Quelle «nach Plan-Fläche» statt «AV»', () => {
  // wie eingaben.test.ts: Querweg nach Süden bei x = −40 (AV-Arm −43 bis −37); Fläche (Plan) Fahrbahn füllt die Ecke (−37, −4)
  // zu einer Ausrundung mit Radius 6 m; gerade Zufahrt von Westen gestrichen, damit der Abbieger selbst geprüft wird
  const osmQ: OsmDaten = { ...OSM, wege: [weg(1, [[10, -200, 0], [11, -40, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
  const avQ: AvFlaeche[] = [av('Strasse_Weg', [lv(-200, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), lv(-37, -4), lv(200, -4), lv(200, 4), lv(-200, 4)]),
    av('Trottoir', rechteck(-200, 4, 200, 7)), av('Trottoir', rechteck(-37, -7, 200, -4))]
  const c = [-31, -10], bogen: P[] = Array.from({ length: 13 }, (_, i) => { const w = Math.PI - (i / 12) * Math.PI / 2; return lv(c[0] + 6 * Math.cos(w), c[1] + 6 * Math.sin(w)) })
  const ecke = plan('plan-1', 'fahrbahn', [lv(-37, -4), ...bogen])
  it('Abbieger aus dem Querweg', () => {
    const r0 = rechneFall(osmQ, avQ, [], 12, fallMit(() => {}), null).streifen[0]
    const g = r0.zufahrten.find(z => z.art !== 'abbiegend' && z.richtung === 0)!
    const mit = (pl: FlaechePlan[]) => rechneFall(osmQ, avQ, [], 12, fallMit(x => {
      x.zufahrten[`${r0.fgsId}|${g.kennung}`] = { streichen: true }; if (pl.length) x.flaechenPlan = pl
    }), null).streifen[0].zufahrten.filter(z => z.art === 'abbiegend')
    const a = mit([]), b = mit([ecke])
    expect(a.length).toBeGreaterThan(0)
    expect(a.every(z => !(z.radiusQuelle ?? '').includes('Plan-Fläche'))).toBe(true)
    const q = b.map(z => z.radiusQuelle ?? '').join(' | ')
    expect(q).toContain('nach Plan-Fläche 1 (Fahrbahn) von Hand')
    expect(q).not.toMatch(/AV-(Bordkante|Ecke)/)
  })
})

describe('Fall-Datei: Flächen (Plan)', () => {
  it('alte Datei ohne Feld: lesbar, Schlüssel wie bisher', () => {
    const f = fallMit(() => {})
    const roh = JSON.parse(fallSchreiben(f))
    expect('flaechenPlan' in roh).toBe(false)
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.flaechenPlan).toBeUndefined(); expect(h).toEqual([])
    expect(eingabenSchluessel({ ...g, flaechenPlan: [] })).toBe(eingabenSchluessel(g))
  })
  it('speichern und laden; zählt als Eingabe; nächste Nummer', () => {
    const f = fallMit(x => { x.flaechenPlan = [NASE] })
    const [g, h] = fallLesen(fallSchreiben(f))
    expect(h).toEqual([]); expect(g.flaechenPlan).toEqual([NASE])
    expect(eingabenZahl(g)).toBe(1); expect(hatEingaben(g)).toBe(true)
    expect(eingabenSchluessel(g)).not.toBe(eingabenSchluessel(fallMit(() => {})))
    expect(naechstePlanId(g)).toBe('plan-2')
  })
  it('ungültige Einträge übergangen und gemeldet; Schlusspunkt und doppelte Ecken entfernt', () => {
    const roh = JSON.parse(fallSchreiben(fallMit(() => {})))
    roh.flaechenPlan = [
      { id: 'plan-1', art: 'trottoir', ring: [...NASE.ring, NASE.ring[0]] },          // geschlossen: gültig
      { id: 'plan-1', art: 'trottoir', ring: NASE.ring },                              // doppelte Id
      { id: 'plan-2', art: 'velo', ring: NASE.ring },                                  // Art unbekannt
      { id: 'plan-3', art: 'insel', ring: NASE.ring.slice(0, 2) },                    // zu wenige Ecken
      { id: 'plan-4', art: 'insel', ring: [[46.9, 7.4], [46.91, 7.4], [46.9, 7.41]] }, // WGS84 statt LV95
      { id: 'plan-5', art: 'insel', ring: [lv(0, 0), lv(1, 1), lv(2, 2)] },             // ohne Fläche
      { id: 'plan-6', art: 'fahrbahn', ring: [lv(0, 0), lv(0, 0), lv(4, 0), lv(4, 3)] },
    ]
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.flaechenPlan!.map(x => x.id)).toEqual(['plan-1', 'plan-6'])
    expect(g.flaechenPlan![0].ring).toEqual(NASE.ring)
    expect(g.flaechenPlan![1].ring.length).toBe(3)
    expect(h.filter(x => x === 'Fläche (Plan) ungültig, übergangen').length).toBe(5)
    roh.flaechenPlan = { x: 1 }
    expect(fallLesen(JSON.stringify(roh))[1]).toContain('Flächen (Plan) ungültig (keine Liste), übergangen')
  })
})

describe('Fall-Datei: Version 2 nur mit Flächen (Plan) (Korrektur S2)', () => {
  it('ohne Plan-Flächen Version 1, mit Version 2; beide lesbar; höhere Version mit Hinweis abgelehnt', () => {
    expect(JSON.parse(fallSchreiben(fallMit(() => {}))).version).toBe(1)
    expect(JSON.parse(fallSchreiben(fallMit(x => { x.flaechenPlan = [] }))).version).toBe(1)
    const t = fallSchreiben(fallMit(x => { x.flaechenPlan = [NASE] }))
    expect(JSON.parse(t).version).toBe(2)
    expect(fallLesen(t)[0].flaechenPlan).toEqual([NASE])
    // die Plan-Fläche gelöscht: wieder Version 1
    const [g] = fallLesen(t); delete g.flaechenPlan
    expect(JSON.parse(fallSchreiben(g)).version).toBe(1)
    expect(() => fallLesen(JSON.stringify({ ...JSON.parse(t), version: 3 }))).toThrow('Fall-Datei Version 3 wird nicht unterstützt (aus einer ' +
      'neueren fgsCheck-Version: Seite neu laden)')
  })
})

describe('Fixpunkte lesen (Kann-Befund 16.10.2026)', () => {
  it('Name gekürzt, Koordinaten in LV95 geprüft', () => {
    const roh = JSON.parse(fallSchreiben(fallMit(() => {})))
    roh.fixpunkte = [
      { id: 'fix-1', p: lv(1, 1), art: 'gebaeudeecke', name: `  ${'x'.repeat(100)}  ` },
      { id: 'fix-2', p: [7.44, 46.95], art: 'frei' },
      { id: 'fix-3', p: [600000, 200000], art: 'frei' },                              // LV03
      { id: 'fix-4', p: lv(2, 2), art: 'av_punkt', name: '  Ecke Haus 5 ' },
    ]
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.fixpunkte!.map(x => x.id)).toEqual(['fix-1', 'fix-4'])
    expect(g.fixpunkte![0].name!.length).toBe(FIXPUNKT_NAME_MAX)
    expect(g.fixpunkte![1].name).toBe('Ecke Haus 5')
    expect(h.filter(x => x === 'Fixpunkt ungültig, übergangen').length).toBe(2)
    expect([imLv95(lv(0, 0)), imLv95([2485000, 1075000]), imLv95([2900000, 1200000])]).toEqual([true, true, false])
  })
})

describe('Herkunft der Zufahrt aus der Fahrlinie (Kann-Befund 16.10.2026)', () => {
  const z = (zufahrt: string, richtung: number, sp: P[], art = 'beide'): ZufahrtErgebnis =>
    ({ zufahrt, richtung, art, strasse: 'Kurvenstrasse', kennung: `k${zufahrt}`, sichtpunkte: sp, spur: sp } as ZufahrtErgebnis)
  it('kurvige Strasse: die Fahrlinie liegt bei 155° (Südsüdosten), am Streifen fährt man nach 48° (von Südwesten)', () => {
    // Fahrlinie: vom Streifen zuerst 5 m nach Südwesten, dann im Bogen nach Südosten; Ende bei Azimut 155° ab dem Streifen
    const a = 155 * Math.PI / 180
    const sp: P[] = [[0, 0], [-3, -4], [-2, -10], [30 * Math.sin(a) * 0.5, 30 * Math.cos(a) * 0.5], [30 * Math.sin(a), 30 * Math.cos(a)]]
    expect(zufahrtAzimut(z('48', 48, sp))).toBeCloseTo(155, 6)
    const n = zufahrtNamen({ strasse: 'Kurvenstrasse', zufahrten: [z('48', 48, sp)], entfallen: [] })
    expect(zufahrtLang(n, '48')).toBe('Kurvenstrasse von Südosten')
    // gerade Strasse: wie aus der Fahrtrichtung (70 = Fahrt nach Nordnordosten, von Süden)
    const g = 70 * Math.PI / 180, sg: P[] = [0, 10, 20].map(t => [-t * Math.cos(g), -t * Math.sin(g)] as P)
    expect(zufahrtLang(zufahrtNamen({ strasse: 'G', zufahrten: [z('70', 70, sg)], entfallen: [] }), '70')).toBe('Kurvenstrasse von Süden')
    // Abbieger: Herkunft aus der Fahrtrichtung im Arm (Nachprüfung 16.10.2026: passt am besten zur Lage der OSM-Arme), nicht
    // aus der Fahrlinie: 180° = Fahrt nach Westen im Arm, also von Osten – auch wenn die Fahrlinie erst nach Süden läuft
    const ab = { ...z('a180', 180, [[0, 0], [0, -10], [-8, -10.5]], 'abbiegend'), knotenM: 9 } as ZufahrtErgebnis
    expect(zufahrtLang(zufahrtNamen({ strasse: 'S', zufahrten: [ab], entfallen: [], bw: 4 }), 'a180')).toBe('Abbieger: Kurvenstrasse von Osten')
    expect(zufahrtAzimut(ab, 2)).toBe(90)
    expect(zufahrtAzimut({ ...ab, knotenM: null })).toBe(90)
    // ohne bzw. zu kurze Fahrlinie: aus der Fahrtrichtung
    expect(zufahrtAzimut(z('0', 0, [[0, 0], [0.5, 0]]))).toBe(270)
  })
})
