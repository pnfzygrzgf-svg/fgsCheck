// Tests Mittelinsel (Standard) nach E1 (Masterplan Fussverkehr Stadt Bern, Standards; 20.10.2026): Geometrie (Masse, Ausrichtung
// gerade und schief, Furt-Seite), Teilen des Streifens von Hand, Rechnung an einem künstlichen Knoten, Fall-Datei.
// Künstlicher Knoten wie planflaechen.test.ts: Hauptstrasse West–Ost (Fahrbahn 8 m, y −4 bis 4), Übergang bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, dist, dot, kreuz, imPolygon, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { Fahrbahn, Inseln } from './flaechen'
import { avMitPlan } from './planflaechen'
import { rechneFall, handUmriss } from './index'
import { RAND_ZUSCHLAG } from './streifen'
import { ringFlaeche } from './poly'
import { inselGeometrie, inselLage, inselMasse, masseFehler, masseHinweise, streifenTeilen, standardAngepasst, standardText,
  standardTeilText, inselFlaechen, fahrbahnMitte, teilLuecke, inselPruefen, naechsteGruppe, furtQuert, balkenNormiert, balkenAusUmriss, zufahrtTeil, zugMitte, teilstreifenAnInsel, inselVerschieben,
  standardZiehbar,
  TEIL_ABSTAND_M, E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, type InselMasse } from './standardinsel'
import { leererFall, fallLesen, fallSchreiben, eingabenSchluessel, planStandardPruefen, type StreifenHand, streifenHandTeilen, teilungZuruecknehmbar, teilungZuruecknehmen,
  verschiebungZuruecknehmbar, verschiebungZuruecknehmen, inselStandard, type Fall, type FlaechePlan } from '../fall'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const lok = (p: P): P => [p[0] - O[0], p[1] - O[1]]
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
]
const E1: InselMasse = inselMasse(E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, null, 'links')
const xs = (r: P[]) => r.map(p => lok(p)[0]), ys = (r: P[]) => r.map(p => lok(p)[1])
const fallMit = (f: (x: Fall) => void): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
/** Fall-Flächen (Plan) einer Mittelinsel mit Ids ab plan-n */
const planVon = (lage: ReturnType<typeof inselLage>, m: InselMasse, start = 1, furtFahrbahn = false): FlaechePlan[] =>
  inselFlaechen(lage, m, 'e1-1', furtFahrbahn).map((x, i) => ({ id: `plan-${start + i}`, ...x }))

describe('Geometrie der Mittelinsel (Standard)', () => {
  // Streifen quer über die Fahrbahn (Achse nach Norden), Fahrbahn West–Ost: Balken nach Westen (links der Achse)
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0])
  it('Vorgaben E1: Tiefe 2,00 m, Streifen 4,00 m, Furt 1,20 m, Kopf halbrund (Radius 1,00 m)', () => {
    expect([E1.tiefe, E1.breite, E1.furt, E1.kopf]).toEqual([2, 4, 1.2, 1])
    expect(lage.balken[0]).toBeCloseTo(-1, 12); expect(lage.balken[1]).toBeCloseTo(0, 12)
    const g = inselGeometrie(lage, E1)
    // Furt links (Balken nach Westen): x von −2,0 bis −0,8 (1,20 m), über die ganze Tiefe y −1 bis 1
    expect(Math.min(...xs(g.furt!))).toBeCloseTo(-2, 9); expect(Math.max(...xs(g.furt!))).toBeCloseTo(-0.8, 9)
    expect(Math.min(...ys(g.furt!))).toBeCloseTo(-1, 9); expect(Math.max(...ys(g.furt!))).toBeCloseTo(1, 9)
    expect(Math.abs(ringFlaeche(g.furt!.map(lok)))).toBeCloseTo(2.4, 6)
    // erhöhte Fläche 2,80 m (x −0,8 bis 2,0) plus Gegenkopf bis x = 3 (Halbkreis Radius 1)
    expect(Math.min(...xs(g.insel))).toBeCloseTo(-0.8, 9); expect(Math.max(...xs(g.insel))).toBeCloseTo(3, 9)
    expect(Math.max(...ys(g.insel)) - Math.min(...ys(g.insel))).toBeCloseTo(2, 9)
    const halbkreis = 0.5 * 18 * Math.sin(10 * Math.PI / 180)                    // 18 Sehnen à 10° (Radius 1)
    expect(Math.abs(ringFlaeche(g.insel.map(lok)))).toBeCloseTo(2.8 * 2 + halbkreis, 9)
    // Kopf auf der Furt-Seite: Halbkreis x −3 bis −2 (flache Seite auf der Streifenkante), 19 Punkte
    expect(g.kopf!.length).toBe(19)
    expect(Math.min(...xs(g.kopf!))).toBeCloseTo(-3, 9); expect(Math.max(...xs(g.kopf!))).toBeCloseTo(-2, 9)
    expect(Math.abs(ringFlaeche(g.kopf!.map(lok)))).toBeCloseTo(halbkreis, 9)
    for (const p of g.kopf!) expect(Math.hypot(lok(p)[0] + 2, lok(p)[1])).toBeCloseTo(1, 9)
    // Signalmast im Kopf der Furt-Seite, auf der Achse
    expect(lok(g.mast!)[0]).toBeCloseTo(-2.45, 9); expect(lok(g.mast!)[1]).toBeCloseTo(0, 9)
    expect(imPolygon(g.mast!, [g.kopf!])).toBe(true)
    // Inselkanten auf der Achse, Länge entlang der Achse = Tiefe
    expect(g.tiefeAchse).toBeCloseTo(2, 12)
    expect(lok(g.kanten[0])[1]).toBeCloseTo(-1, 9); expect(lok(g.kanten[1])[1]).toBeCloseTo(1, 9)
    // die Achse (x = 0) quert die erhöhte Fläche, nicht die Furt
    expect(imPolygon(lv(0, 0), [g.insel])).toBe(true); expect(imPolygon(lv(0, 0), [g.furt!])).toBe(false)
  })
  it('Furt rechts: gespiegelt (x 0,8 bis 2,0), Kopf mit Mast im Osten', () => {
    const g = inselGeometrie(lage, { ...E1, seite: 'rechts' })
    expect(Math.min(...xs(g.furt!))).toBeCloseTo(0.8, 9); expect(Math.max(...xs(g.furt!))).toBeCloseTo(2, 9)
    expect(Math.min(...xs(g.insel))).toBeCloseTo(-3, 9); expect(Math.max(...xs(g.insel))).toBeCloseTo(0.8, 9)
    expect(lok(g.mast!)[0]).toBeCloseTo(2.45, 9)
    // links/rechts hängt an der Blickrichtung von Ende A nach B: Achse umgedreht, Furt links = Osten
    const u = inselGeometrie(inselLage(lv(0, 0), [0, -1], [1, 0]), E1)
    expect(Math.min(...xs(u.furt!))).toBeCloseTo(0.8, 9)
  })
  it('schiefer Streifen (Balken 20° schief zur Senkrechten): Tiefe quer zur Fahrbahn 2,00 m, Kanten auf dem Streifenumriss', () => {
    const w = 20 * Math.PI / 180, r: P = [Math.cos(w), Math.sin(w)]          // Fahrbahn bzw. Balken leicht nach Nordosten
    const l = inselLage(lv(0, 0), [0, 1], r)
    expect(dot(l.balken, [-1, 0])).toBeGreaterThan(0)                         // links der Achse
    const g = inselGeometrie(l, E1)
    const sin = Math.abs(kreuz(l.achse, l.balken))
    expect(g.tiefeAchse).toBeCloseTo(2 / sin, 9)
    // Abstand der Längsseiten senkrecht zum Balken: 2,00 m
    const q: P = [-l.balken[1], l.balken[0]]
    const lagen = g.insel.map(p => dot([p[0] - O[0], p[1] - O[1]], q))
    expect(Math.max(...lagen) - Math.min(...lagen)).toBeCloseTo(2, 6)
    // Streifenkanten: der Umriss eines 4 m breiten Streifens von Hand mit derselben Balkenrichtung; die Furt liegt zwischen der
    // linken Streifenkante (A+ – B+) und einer Parallelen 1,20 m davon entfernt (entlang der Balken)
    const um = handUmriss(lv(0, -4), lv(0, 4), 4, r)
    const aufKante = (p: P, a: P, b: P) => Math.abs(kreuz([b[0] - a[0], b[1] - a[1]], [p[0] - a[0], p[1] - a[1]])) / dist(a, b)
    expect(aufKante(g.kopf![0], um[0], um[1])).toBeLessThan(1e-9)
    expect(aufKante(g.kopf![g.kopf!.length - 1], um[0], um[1])).toBeLessThan(1e-9)
    expect(aufKante(g.insel[g.insel.length - 1], um[3], um[2])).toBeLessThan(1e-9)    // Gegenkopf an der rechten Kante
    // Furt 1,20 m entlang der Balken
    expect(dist(g.furt![0], g.furt![1])).toBeCloseTo(1.2, 9)
    // Balkenrichtung wie im Umriss der Rechnung
    expect(dist(um[0], [O[0] + l.balken[0] * 2, O[1] - 4 + l.balken[1] * 2])).toBeLessThan(1e-9)
  })
  it('Balkenrichtung wie index.handUmriss: zu schief bzw. ohne Richtung senkrecht zur Achse', () => {
    expect(balkenNormiert([0, 1], null)).toEqual([-1, 0])
    const flach = balkenNormiert([0, 1], [Math.cos(80 * Math.PI / 180), Math.sin(80 * Math.PI / 180)])   // 10° zur Achse
    expect(flach).toEqual([-1, 0])
    for (const w of [-50, -10, 0, 25, 55, 170]) {
      const r: P = [Math.cos(w * Math.PI / 180), Math.sin(w * Math.PI / 180)]
      const b = balkenNormiert([0, 1], r), um = handUmriss(lv(0, 0), lv(0, 5), 2, r)
      expect(um[0][0] - O[0]).toBeCloseTo(b[0], 9); expect(um[0][1] - O[1]).toBeCloseTo(b[1], 9)
    }
  })
  it('Balkenrichtung aus dem Umriss eines gerechneten Streifens (Ecken in beliebiger Folge)', () => {
    const r: P = [Math.cos(0.3), Math.sin(0.3)]
    const um = handUmriss(lv(0, -4), lv(0, 4), 4, r)
    for (const u of [um, [um[1], um[2], um[3], um[0]]]) {
      const b = balkenNormiert([0, 1], balkenAusUmriss([0, 1], u))
      expect(b[0]).toBeCloseTo(-r[0], 9); expect(b[1]).toBeCloseTo(-r[1], 9)
    }
    expect(balkenAusUmriss([0, 1], [])).toBeNull()
  })
  it('Kopflänge frei (Halbellipse) bzw. 0 (rechteckig, ohne Mast); ohne Furt', () => {
    const g = inselGeometrie(lage, inselMasse(2, 4, 1.2, 2.5, 'links'))
    expect(Math.min(...xs(g.kopf!))).toBeCloseTo(-4.5, 9)
    const o = inselGeometrie(lage, inselMasse(2, 4, 1.2, 0, 'links'))
    expect(o.kopf).toBeNull(); expect(o.mast).toBeNull(); expect(o.insel.length).toBe(4)
    expect(Math.abs(ringFlaeche(o.insel.map(lok)))).toBeCloseTo(5.6, 9)
    expect(inselGeometrie(lage, inselMasse(2, 4, 0, null, 'links')).furt).toBeNull()
  })
  it('Masse: Fehler und Hinweise zu E1', () => {
    expect(masseFehler(E1)).toBeNull(); expect(masseHinweise(E1)).toEqual([])
    expect(masseFehler({ ...E1, furt: 1.8 })).toContain('Furt 1,80 m zu breit für einen 4,00 m breiten Streifen: höchstens 1,75 m')
    expect(masseFehler({ ...E1, tiefe: 0.5 })).toContain('Inseltiefe 0,50 m ausserhalb')
    expect(masseHinweise({ ...E1, tiefe: 1.8, breite: 3.5 })).toEqual([
      'Inseltiefe 1,80 m unter 2,00 m (E1: Standardbreite für Schutzinseln mindestens 2,00 m).',
      'Streifenbreite 3,50 m unter 4,00 m (E1: mindestens 4,00 m).'])
    expect(masseHinweise({ ...E1, furt: 0 })).toEqual(['Ohne Rollstuhlfurt (E1: 1,20 m).'])
    expect(standardText(E1)).toBe('Mittelinsel (Standard E1 Masterplan Fussverkehr Bern): Tiefe 2,00 m, Furt 1,20 m, Insel 2,80 m')
  })
})

describe('Platzierung und Teilen', () => {
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0])
  it('Fahrbahnmitte zwischen den Bordkanten (Sehne entlang der Achse); Lücke zwischen Teilstreifen', () => {
    const fb = new Fahrbahn(AV)
    const m = fahrbahnMitte((p, r) => fb.sehne(p, r), lv(0, -3.7), lv(0, 2.7))
    expect(lok(m.m)[0]).toBeCloseTo(0, 9); expect(lok(m.m)[1]).toBeCloseTo(0, 9)
    expect(m.quelle).toBe('Fahrbahnmitte zwischen den Bordkanten (Fahrbahn auf der Achse 8,00 m)')
    expect(fahrbahnMitte(() => null, lv(0, -3), lv(0, 1)).quelle).toContain('Streifenmitte')
    const l = teilLuecke([{ p0: lv(0, -3.7), p1: lv(0, -1.3) }, { p0: lv(0, 1.7), p1: lv(0, 3.7) }], [0, 1], lv(5, 3))
    expect(lok(l!)[1]).toBeCloseTo(0.2, 9)
    expect(teilLuecke([{ p0: lv(0, -3.7), p1: lv(0, 3.7) }], [0, 1], lv(0, 0))).toBeNull()
  })
  it('Streifen von Hand in zwei Teilstreifen: Enden 0,30 m vor den Inselkanten; zu kurz: nicht geteilt', () => {
    expect(TEIL_ABSTAND_M).toBe(RAND_ZUSCHLAG)
    const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), lage, E1)
    if (!('teile' in t)) throw new Error(t.grund)
    expect(t.teile.map(x => x.map(p => lok(p)[1].toFixed(6)))).toEqual([['-3.700000', '-1.300000'], ['1.300000', '3.700000']])
    const k = streifenTeilen(lv(0, -3.7), lv(0, 3.7), inselLage(lv(0, 2.5), [0, 1], [1, 0]), E1)
    expect('grund' in k && k.grund).toContain('kürzer als 1,00 m')
    expect('grund' in streifenTeilen(lv(1, -3.7), lv(0, 3.7), lage, E1)).toBe(true)          // andere Achse
  })
  it('Prüfung gegen die Bodenbedeckung: Fahrbahn daneben, Insel im Trottoir, bestehende Insel in der Furt', () => {
    const fb = new Fahrbahn(AV), sehne = (p: P, r: P) => fb.sehne(p, r)
    const p = inselPruefen(lage, E1, AV, sehne)
    expect(p.furtFahrbahn).toBe(false); expect(p.ausserhalbM2).toBeCloseTo(0, 9)
    expect(p.restM![0]).toBeCloseTo(3, 9); expect(p.restM![1]).toBeCloseTo(3, 9)
    // seit E1 (Bedarfsmodul): Durchfahrt nach F3 statt «unter 2,0 m»; 3,00 m liegt unter 3,50 m (zu schmal)
    expect(p.hinweise.slice(0, 2)).toEqual(['Durchfahrt neben der Insel 3,00 m (Seite Ende A): unter 3,50 m, zu schmal (F3, Arbeitshilfe Kanton BE).',
      'Durchfahrt neben der Insel 3,00 m (Seite Ende B): unter 3,50 m, zu schmal (F3, Arbeitshilfe Kanton BE).'])
    expect(p.hinweise[2]).toContain('keine VSS-Norm nennt Durchfahrtsmasse')
    const rand = inselPruefen(inselLage(lv(0, 3.5), [0, 1], [1, 0]), E1, AV, sehne)
    expect(rand.ausserhalbM2).toBeGreaterThan(1)
    expect(rand.hinweise.join(' ')).toContain('über die Fahrbahn hinaus')
    const mitInsel = [...AV, av('Verkehrsinsel', rechteck(-5, -1, 5, 1))]
    const b = inselPruefen(lage, E1, avMitPlan(mitInsel, undefined).av, sehne)
    expect(b.furtFahrbahn).toBe(true)
    expect(inselFlaechen(lage, E1, 'e1-1', true).map(x => [x.art, x.standard.teil])).toEqual([['fahrbahn', 'furt'], ['insel', 'kopf'],
      ['insel', 'insel']])
  })
  it('Kennzeichnung: Gruppe, angepasst nach Änderung der Form bzw. Art', () => {
    const pl = planVon(lage, E1)
    expect(pl.map(x => inselStandard(x)!.teil)).toEqual(['kopf', 'insel'])
    expect(pl.every(x => !standardAngepasst(x))).toBe(true)
    expect(standardTeilText(pl[0])).toBe('Mittelinsel (Standard E1 Masterplan Fussverkehr Bern): Tiefe 2,00 m, Furt 1,20 m, Insel 2,80 m – ' +
      'Kopf mit Signalmast (Furt-Seite)')
    const verschoben = { ...pl[1], ring: pl[1].ring.map((p, i) => (i ? p : [p[0] + 0.5, p[1]] as P)) }
    expect(standardAngepasst(verschoben)).toBe(true)
    expect(standardTeilText(verschoben)).toContain('(Form seither von Hand angepasst)')
    expect(standardAngepasst({ ...pl[1], art: 'trottoir' })).toBe(true)
    expect(naechsteGruppe(pl)).toBe('e1-2'); expect(naechsteGruppe(undefined)).toBe('e1-1')
  })
})

describe('Rechnung mit der Mittelinsel (Standard)', () => {
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0])
  const geteilt = fallMit(x => {
    const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), lage, E1)
    if (!('teile' in t)) throw new Error(t.grund)
    t.teile.forEach(([p0, p1], i) => x.streifenHand.push({ id: `hand-${i + 1}`, p0, p1, breite: 4, herkunft: 'gezeichnet' }))
    x.flaechenPlan = planVon(lage, E1)
  })
  const r = rechneFall(OSM, AV, [], 12, geteilt, null)
  it('Streifen von Hand, geteilt: zwei Teilstreifen, Inselteil-Zufahrten, Bordkanten an der Insel nach Plan', () => {
    expect(r.streifen.length).toBe(2)
    expect(r.streifen.map(s => s.uebergangId)).toEqual(['hand', 'hand'])
    for (const s of r.streifen) {
      expect(s.zufahrten.length).toBeGreaterThan(0)
      expect(s.zufahrten.every(z => z.art === 'insel')).toBe(true)
      expect(s.randQuelle).toBe('AV')
    }
    expect(r.streifen.map(s => s.annahmen.find(a => a.startsWith('Bordkanten:')))).toEqual([
      'Bordkanten: Ende A nach AV, Ende B nach Plan-Fläche 2 (Insel, Mittelinsel Standard E1) von Hand',
      'Bordkanten: Ende A nach Plan-Fläche 2 (Insel, Mittelinsel Standard E1) von Hand, Ende B nach AV'])
    expect(r.meldungen[0]).toMatch(/^Rechnung mit geplanter Bodenbedeckung \(von Hand\): Plan-Fläche 1: Insel \(Mittelinsel Standard E1\) 1,6 m²; Plan-Fläche 2: Insel \(Mittelinsel Standard E1\) 7,2 m²/)
    // Rand an der Inselkante (y = ∓1), auf der Achse (erhöhte Fläche), keine Bordkante in der Furt
    expect(lok(r.streifen[0].rand[1])[1]).toBeCloseTo(-1, 6); expect(lok(r.streifen[1].rand[0])[1]).toBeCloseTo(1, 6)
    expect(r.streifen.map(s => s.vermassung!.fahrbahnM!.toFixed(2))).toEqual(['3.00', '3.00'])
  })
  it('Annäherungsbereich an der Insel über die ganze Streifenbreite (auch vor der Furt), auf der Insel bzw. in der Furt', () => {
    const ann = r.streifen[0].ann[1].flat().map(lok)
    expect(Math.min(...ann.map(p => p[0]))).toBeLessThan(-1.9)            // reicht über die Furt (x −2 bis −0,8)
    expect(Math.max(...ann.map(p => p[0]))).toBeGreaterThan(1.9)
    expect(Math.min(...ann.map(p => p[1]))).toBeGreaterThan(-1.05); expect(Math.max(...ann.map(p => p[1]))).toBeLessThan(0.05)
  })
  it('Sichtweiten plausibel: wie mit einer gleich tiefen, rechteckigen Insel (ohne Furt); Sichtpunkte auf der Fahrbahn', () => {
    const rechteckig = rechneFall(OSM, AV, [], 12, fallMit(x => {
      x.streifenHand = geteilt.streifenHand
      x.flaechenPlan = [{ id: 'plan-1', art: 'insel', ring: rechteck(-3, -1, 3, 1) }]
    }), null)
    const kurz = (q: typeof r) => q.streifen.flatMap(s => s.zufahrten.map(z => [s.fgsId, z.zufahrt, z.art, z.tempo, z.sichtweite, z.status]))
    expect(kurz(r)).toEqual(kurz(rechteckig))
    const fb = new Fahrbahn(avMitPlan(AV, geteilt.flaechenPlan).av), ins = new Inseln(avMitPlan(AV, geteilt.flaechenPlan).av)
    for (const z of r.streifen.flatMap(s => s.zufahrten)) {
      expect(z.status).toBe('frei'); expect(z.sichtweite).toBeGreaterThan(20)
      expect(z.sichtpunkte.length).toBeGreaterThan(5)
      expect(z.sichtpunkte.every(p => fb.enthaelt(p) && !ins.enthaelt(p))).toBe(true)
    }
  })
  it('Streifen von Hand nicht geteilt: Hinweis «als zwei Teilstreifen zeichnen» nennt die Mittelinsel', () => {
    const s = rechneFall(OSM, AV, [], 12, fallMit(x => {
      x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4, herkunft: 'gezeichnet' })
      x.flaechenPlan = planVon(lage, E1)
    }), null).streifen[0]
    expect(s.annahmen.join(' ')).toContain('Streifen quert Plan-Fläche 2 (Insel, Mittelinsel Standard E1) von Hand: als zwei Teilstreifen zeichnen')
  })
  it('Streifen aus OSM + AV: genau zwei Teilstreifen (die Furt neben der Achse ergibt keinen dritten Teil)', () => {
    const o = rechneFall(OSM, AV, [], 12, fallMit(x => { x.flaechenPlan = planVon(lage, E1) }), null)
    expect(o.streifen.length).toBe(2)
    expect(o.streifen[0].annahmen.join(' ')).toContain('Teilstreifen 1 von 2 (Verkehrsinsel auf der Achse nach Plan-Fläche 2 (Insel, Mittelinsel Standard E1) von Hand)')
    expect(o.streifen.flatMap(s => s.annahmen).some(a => a.includes('Rollstuhlfurt'))).toBe(false)
    // Insel entlang der Strasse verschoben, Achse in der Furt: nicht geteilt, mit Hinweis
    const v = rechneFall(OSM, AV, [], 12, fallMit(x => { x.flaechenPlan = planVon(inselLage(lv(1.4, 0), [0, 1], [1, 0]), E1) }), null)
    expect(v.streifen.length).toBe(1)
    expect(v.streifen[0].annahmen.join(' ')).toContain('Streifenachse quert die Rollstuhlfurt der Mittelinsel Standard E1 (Plan-Fläche 1, ' +
      'Plan-Fläche 2), nicht die erhöhte Inselfläche')
    expect(furtQuert(planVon(lage, E1), lv(0, -3.7), lv(0, 3.7))).toBeNull()
  })
  it('bestehende Insel unter der Furt: Furt als Fläche (Plan) Fahrbahn, dort wieder Fahrbahn', () => {
    const mitInsel = [...AV, av('Verkehrsinsel', rechteck(-3, -1, 3, 1))]
    const pl = planVon(lage, E1, 1, true)
    const a = avMitPlan(mitInsel, pl).av
    expect(new Fahrbahn(a).enthaelt(lv(-1.4, 0))).toBe(true)
    expect(new Inseln(a).enthaelt(lv(-1.4, 0))).toBe(false)
    expect(new Inseln(a).enthaelt(lv(0, 0))).toBe(true)
  })
  it('Rechnung ohne Mittelinsel unverändert (gleiche Flächen ohne Kennzeichnung)', () => {
    const ohne = rechneFall(OSM, AV, [], 12, fallMit(x => {
      x.streifenHand = geteilt.streifenHand
      x.flaechenPlan = geteilt.flaechenPlan!.map(({ standard: _s, ...f }) => f)
    }), null)
    const weg = (q: unknown) => JSON.parse(JSON.stringify(q, (k, v) => (k === 'ms' ? undefined : v)).replace(/, Mittelinsel Standard E1| \(Mittelinsel Standard E1\)/g, ''))
    expect(weg(ohne)).toEqual(weg(r))
  })
})

describe('Streifen von Hand teilen (fall.streifenHandTeilen)', () => {
  it('erster Teil behält Nummer und Eingaben, zweiter Teil gleich dahinter; Zufahrt-Eingaben nach teilVon, Rückfall-Kennung umbenannt', () => {
    const f = fallMit(x => {
      x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4, herkunft: 'gezeichnet', name: 'Mein Streifen' })
      x.streifenHand.push({ id: 'hand-3', p0: lv(50, -3.7), p1: lv(50, 3.7), breite: 4 })
      x.zufahrten = { 'hand-1|w1+': { tempo: 30 }, 'hand-1|w1-': { tempo: 40 }, 'hand-1|shand-1:90': { streichen: true }, 'hand-3|w1+': { tempo: 20 } }
      x.streifen = { 'hand-1': { lsa: 'ja' } }
    })
    const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), inselLage(lv(0, 0), [0, 1], [1, 0]), E1)
    if (!('teile' in t)) throw new Error(t.grund)
    const r = streifenHandTeilen(f, 'hand-1', t.teile, k => (k === 'w1-' || k.startsWith('s') ? 2 : 1))
    expect(r).toMatchObject({ neuId: 'hand-4', verschoben: 2 })
    expect(f.streifenHand.map(x => [x.id, x.name ?? '', x.angepasst ?? false, lok(x.p0)[1].toFixed(2), lok(x.p1)[1].toFixed(2)])).toEqual([
      ['hand-1', 'Mein Streifen (Teil 1)', true, '-3.70', '-1.30'], ['hand-4', 'Mein Streifen (Teil 2)', true, '1.30', '3.70'],
      ['hand-3', '', false, '-3.70', '3.70']])
    expect(f.zufahrten).toEqual({ 'hand-1|w1+': { tempo: 30 }, 'hand-4|w1-': { tempo: 40 }, 'hand-4|shand-4:90': { streichen: true },
      'hand-3|w1+': { tempo: 20 } })
    expect(f.streifen).toEqual({ 'hand-1': { lsa: 'ja' }, 'hand-4': { lsa: 'ja' } })
    expect(streifenHandTeilen(f, 'hand-9', t.teile, () => 1)).toBeNull()
  })
})

describe('Eingaben je Zufahrt beim Teilen (Prüfbefund M1 20.10.2026)', () => {
  // Tempo von Hand an allen Zufahrten (je verschieden); nach dem Teilen keine verwaiste Eingabe, jede Zufahrt behält ihr Tempo
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0])
  const teilen = (p0: P, p1: P, osm: OsmDaten, nid: number | null, l = lage) => {
    const f = fallMit(x => { x.ort.uebergang = nid; x.streifenHand.push({ id: 'hand-1', p0, p1, breite: 4, herkunft: 'gezeichnet' }) })
    const r0 = rechneFall(osm, AV, [], nid, f, null)
    const tempo = new Map<string, number>()
    r0.streifen[0].zufahrten.forEach((z, i) => { f.zufahrten[`hand-1|${z.kennung}`] = { tempo: 20 + 10 * i }; tempo.set(z.kennung, 20 + 10 * i) })
    const g = structuredClone(f)
    g.flaechenPlan = planVon(l, E1)
    const t = streifenTeilen(p0, p1, l, E1)
    if (!('teile' in t)) throw new Error(t.grund)
    const erg = streifenHandTeilen(g, 'hand-1', t.teile, zufahrtTeil(r0.streifen[0].zufahrten, l))!
    const r = rechneFall(osm, AV, [], nid, g, null)
    return { f, g, r, r0, tempo, erg }
  }
  for (const [name, p0, p1] of [['Streifen von Hand 7,4 m', lv(0, -3.7), lv(0, 3.7)], ['Enden auf der Bordkante', lv(0, -4), lv(0, 4)],
    ['umgekehrt gezeichnet', lv(0, 3.7), lv(0, -3.7)]] as [string, P, P][]) {
    it(name, () => {
      const lg = p0[1] > p1[1] ? inselLage(lv(0, 0), [0, -1], [1, 0]) : lage
      const { g, r, r0, tempo, erg } = teilen(p0, p1, { ...OSM, uebergaenge: [] }, null, lg)
      expect(r0.streifen[0].zufahrten.length).toBeGreaterThanOrEqual(2)
      expect(erg.verschoben).toBeGreaterThan(0)
      const zk = new Set(r.streifen.flatMap(s => s.zufahrten.map(z => `${s.fgsId}|${z.kennung}`)))
      expect(Object.keys(g.zufahrten).filter(k => !zk.has(k))).toEqual([])          // keine verwaiste Eingabe
      for (const z of r.streifen.flatMap(s => s.zufahrten)) {
        expect(z.tempo).toBe(tempo.get(z.kennung.replace(/^shand-2:/, 'shand-1:')))
      }
    })
  }
  it('Teilung zurücknehmen: ungeteilter Streifen samt Eingaben; nicht mehr, wenn ein Teil seither geändert wurde', () => {
    const { f, g, erg } = teilen(lv(0, -3.7), lv(0, 3.7), { ...OSM, uebergaenge: [] }, null)
    f.streifen['hand-1'] = { lsa: 'ja' }
    const h = structuredClone(g); h.streifen = { 'hand-1': { lsa: 'ja' }, 'hand-2': { lsa: 'ja' } }
    const r = { ...erg.rueck, streifen: { lsa: 'ja' as const } }
    expect(teilungZuruecknehmbar(h, r)).toBe(true)
    expect(teilungZuruecknehmen(h, r)).toBe(true)
    expect(h.streifenHand).toEqual(f.streifenHand); expect(h.zufahrten).toEqual(f.zufahrten); expect(h.streifen).toEqual(f.streifen)
    expect(h.flaechenPlan).toEqual(g.flaechenPlan)                                   // die Mittelinsel bleibt
    const v = structuredClone(g); v.streifenHand[1].p1 = lv(0, 4)
    expect(teilungZuruecknehmbar(v, erg.rueck)).toBe(false)
    expect(teilungZuruecknehmen(v, erg.rueck)).toBe(false)
    expect(v.streifenHand.length).toBe(2)
  })
})

describe('Mittelinsel ziehen (Drag-and-drop)', () => {
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0])
  /** Fall mit eingefügter Mittelinsel und an ihr geteiltem Streifen von Hand (wie das Werkzeug) */
  const eingefuegt = () => fallMit(x => {
    x.streifenHand.push({ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4, herkunft: 'gezeichnet' })
    x.flaechenPlan = [{ id: 'plan-1', art: 'trottoir', ring: rechteck(10, 4, 14, 6) }, ...planVon(lage, E1, 2)]
    const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), lage, E1)
    if ('teile' in t) streifenHandTeilen(x, 'hand-1', t.teile, () => 1)
  })
  it('Projektion auf die Achse bzw. frei', () => {
    const st = { m: lv(0, 0), achse: [0, 1] as P }
    expect(lok(zugMitte(st, lv(1.5, 0.7), false)).map(v => +v.toFixed(9))).toEqual([0, 0.7])
    expect(lok(zugMitte(st, lv(1.5, 0.7), true)).map(v => +v.toFixed(6))).toEqual([1.5, 0.7])
    // schiefe Achse: Mitte bleibt auf der Geraden
    const s2 = { m: lv(0, 0), achse: [Math.SQRT1_2, Math.SQRT1_2] as P }
    const q = lok(zugMitte(s2, lv(2, 0), false))
    expect(q[0]).toBeCloseTo(1, 9); expect(q[1]).toBeCloseTo(1, 9)
  })
  it('Teilstreifen an den Inselkanten erkennen; ungeteilt bzw. fremde Streifen nicht', () => {
    const f = eingefuegt(), st = inselStandard(f.flaechenPlan![1])!
    expect(teilstreifenAnInsel(f.streifenHand, st)).toEqual({ a: { id: 'hand-1', ende: 'p1' }, b: { id: 'hand-2', ende: 'p0' } })
    expect(teilstreifenAnInsel([{ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4 }], st)).toEqual({ a: null, b: null })
    // umgekehrt gezeichneter Teil (Ende B an der Insel)
    expect(teilstreifenAnInsel([{ id: 'x', p0: lv(0, -1.3), p1: lv(0, -3.7), breite: 4 }], st).a).toEqual({ id: 'x', ende: 'p0' })
  })
  it('entlang der Achse: Geometrie an der neuen Mitte (gleiche Ids und Reihenfolge), Teilstreifen-Enden nachgeführt, Eingaben bleiben', () => {
    const f = eingefuegt()
    rechneFall(OSM, AV, [], 12, f, null).streifen.forEach((x, i) => x.zufahrten.forEach(z => { f.zufahrten[`${x.fgsId}|${z.kennung}`] = { tempo: 30 + 10 * i } }))
    expect(Object.keys(f.zufahrten).length).toBe(2)
    const r = inselVerschieben(f.flaechenPlan!, f.streifenHand, 'e1-1', zugMitte(inselStandard(f.flaechenPlan![1])!, lv(0.8, 0.5), false))
    if ('grund' in r) throw new Error(r.grund)
    expect(r.plan.map(x => x.id)).toEqual(['plan-1', 'plan-2', 'plan-3'])
    expect(r.plan[0]).toBe(f.flaechenPlan![0])                                     // andere Flächen unverändert
    const neu = inselGeometrie(inselLage(lv(0, 0.5), [0, 1], [1, 0]), E1)
    expect(r.plan[1].ring).toEqual(neu.kopf); expect(r.plan[2].ring).toEqual(neu.insel)
    expect(lok(inselStandard(r.plan[2])!.m).map(v => +v.toFixed(9))).toEqual([0, 0.5])
    expect(r.plan.slice(1).every(x => !standardAngepasst(x))).toBe(true)
    expect(r.teilIds).toEqual(['hand-1', 'hand-2']); expect(r.abAchseM).toBeCloseTo(0, 9)
    expect(r.streifen.map(x => [lok(x.p0)[1].toFixed(2), lok(x.p1)[1].toFixed(2)])).toEqual([['-3.70', '-0.80'], ['1.80', '3.70']])
    expect(f.streifenHand[0].p1).toEqual(lv(0, -1.3))                              // Eingabe nicht verändert (rein)
    const g = structuredClone(f); g.flaechenPlan = r.plan; g.streifenHand = r.streifen
    const q = rechneFall(OSM, AV, [], 12, g, null)
    expect(q.streifen.map(x => lok(x.rand[x.fgsId === 'hand-1' ? 1 : 0])[1].toFixed(2))).toEqual(['-0.50', '1.50'])
    expect(q.streifen.flatMap(x => x.zufahrten.map(z => [x.fgsId, z.tempo]))).toEqual([['hand-1', 30], ['hand-2', 40]])
  })
  it('frei (Umschalttaste): Ausrichtung bleibt, Teilstreifen-Enden auf ihrer Achse; zu weit bzw. angepasst: nichts geändert', () => {
    const f = eingefuegt()
    const r = inselVerschieben(f.flaechenPlan!, f.streifenHand, 'e1-1', lv(1, 0))
    if ('grund' in r) throw new Error(r.grund)
    expect(inselStandard(r.plan[2])!.achse).toEqual(inselStandard(f.flaechenPlan![2])!.achse)
    expect(r.streifen.map(x => lok(x.p1)[0].toFixed(6))).toEqual(['0.000000', '0.000000'])
    expect(lok(r.streifen[0].p1)[1]).toBeCloseTo(-1.3, 9)
    expect(r.abAchseM).toBeCloseTo(1, 9)
    const weit = inselVerschieben(f.flaechenPlan!, f.streifenHand, 'e1-1', lv(0, 2))
    expect('grund' in weit && weit.grund).toContain('kürzer als 1,00 m')
    const ang = structuredClone(f.flaechenPlan!); ang[2].ring[0] = lv(-0.7, -1)
    expect(standardZiehbar(ang, 'e1-1')).toBeNull()
    expect('grund' in inselVerschieben(ang, f.streifenHand, 'e1-1', lv(0, 0.5))).toBe(true)
    expect('grund' in inselVerschieben(f.flaechenPlan!, f.streifenHand, 'e1-9', lv(0, 0.5))).toBe(true)
  })
  it('nach freiem Zug quer (0,3 m bzw. 1,0 m) werden die Teilstreifen beim nächsten Zug entlang der Achse weiter mitgeführt', () => {
    for (const quer of [0.3, 1.0]) {
      const f = eingefuegt()
      const r1 = inselVerschieben(f.flaechenPlan!, f.streifenHand, 'e1-1', lv(quer, 0))
      if ('grund' in r1) throw new Error(r1.grund)
      expect(r1.teilIds).toEqual(['hand-1', 'hand-2']); expect(r1.abAchseM).toBeCloseTo(quer, 9); expect(r1.inInsel).toEqual([])
      const st = inselStandard(r1.plan[2])!
      expect(teilstreifenAnInsel(r1.streifen, st)).toEqual({ a: { id: 'hand-1', ende: 'p1' }, b: { id: 'hand-2', ende: 'p0' } })
      const r2 = inselVerschieben(r1.plan, r1.streifen, 'e1-1', zugMitte(st, lv(quer + 2, 0.5), false))
      if ('grund' in r2) throw new Error(r2.grund)
      expect(lok(inselStandard(r2.plan[2])!.m).map(v => +v.toFixed(9))).toEqual([quer, 0.5])
      expect(r2.teilIds).toEqual(['hand-1', 'hand-2']); expect(r2.inInsel).toEqual([])
      expect(r2.streifen.map(x => [lok(x.p0)[0].toFixed(6), lok(x.p0)[1].toFixed(2), lok(x.p1)[1].toFixed(2)])).toEqual([
        ['0.000000', '-3.70', '-0.80'], ['0.000000', '1.80', '3.70']])
    }
  })
  it('Erkennung: paralleler Streifen weiter als eine halbe Breite daneben bzw. nicht paralleler Streifen am Zielpunkt zählt nicht; ' +
    'Streifen in der Insel gemeldet', () => {
    const f = eingefuegt(), st = inselStandard(f.flaechenPlan![2])!
    const fremd: StreifenHand[] = [
      { id: 'hand-5', p0: lv(3, -3.7), p1: lv(3, -1.3), breite: 4 },                  // parallel, 3 m daneben
      { id: 'hand-6', p0: lv(0, 1.3), p1: lv(5, 1.3), breite: 4 },                    // Ende am Zielpunkt, quer
    ]
    expect(teilstreifenAnInsel(fremd, st)).toEqual({ a: null, b: null })
    // ungeteilter Streifen über die Insel: nicht mitgeführt, aber gemeldet
    const r = inselVerschieben(f.flaechenPlan!, [{ id: 'hand-1', p0: lv(0, -3.7), p1: lv(0, 3.7), breite: 4 }], 'e1-1', lv(0, 0.5))
    if ('grund' in r) throw new Error(r.grund)
    expect(r.teilIds).toEqual([]); expect(r.inInsel).toEqual(['hand-1'])
  })
  it('Verschiebung zurücknehmen: nur solange seither nichts anderes geändert wurde', () => {
    const f = eingefuegt(), vorher = structuredClone(f)
    const r = inselVerschieben(f.flaechenPlan!, f.streifenHand, 'e1-1', lv(0, 0.5))
    if ('grund' in r) throw new Error(r.grund)
    f.flaechenPlan = r.plan; f.streifenHand = r.streifen
    const rueck = { gruppe: 'e1-1', schluessel: eingabenSchluessel(f), flaechenPlan: vorher.flaechenPlan!, streifenHand: vorher.streifenHand }
    const g = structuredClone(f)
    expect(verschiebungZuruecknehmbar(g, rueck)).toBe(true)
    expect(verschiebungZuruecknehmen(g, rueck)).toBe(true)
    expect(eingabenSchluessel(g)).toBe(eingabenSchluessel(vorher))
    const h = structuredClone(f); h.zufahrten['hand-1|w1-'] = { tempo: 30 }
    expect(verschiebungZuruecknehmbar(h, rueck)).toBe(false)
    expect(verschiebungZuruecknehmen(h, rueck)).toBe(false)
    expect(h.flaechenPlan).toEqual(f.flaechenPlan)
  })
})

describe('Fall-Datei: Kennzeichnung der Mittelinsel (Standard)', () => {
  const pl = planVon(inselLage(lv(0, 0), [0, 1], [1, 0]), E1)
  it('Rundreise: speichern und laden gleich; Version 2 wie bei allen Flächen (Plan)', () => {
    const f = fallMit(x => { x.flaechenPlan = pl })
    const t = fallSchreiben(f)
    expect(JSON.parse(t).version).toBe(2)
    const [g, h] = fallLesen(t)
    expect(h).toEqual([]); expect(g.flaechenPlan).toEqual(pl)
    expect(g.flaechenPlan!.every(x => !standardAngepasst(x))).toBe(true)
    expect(eingabenSchluessel(g)).toBe(eingabenSchluessel(f))
    // ohne Kennzeichnung (ältere App bzw. Datei): dieselbe Geometrie, anderer Schlüssel
    const ohne = fallMit(x => { x.flaechenPlan = pl.map(({ standard: _s, ...y }) => y) })
    expect(fallLesen(fallSchreiben(ohne))[0].flaechenPlan!.every(x => x.standard === undefined)).toBe(true)
    expect(eingabenSchluessel(ohne)).not.toBe(eingabenSchluessel(f))
  })
  it('ungültige Kennzeichnung: übergangen, die Fläche bleibt', () => {
    const roh = JSON.parse(fallSchreiben(fallMit(x => { x.flaechenPlan = pl })))
    roh.flaechenPlan[0].standard.teil = 'mast'
    roh.flaechenPlan[1].standard.m = [7.4, 46.9]
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.flaechenPlan!.map(x => [x.id, !!x.standard])).toEqual([['plan-1', false], ['plan-2', false]])
    expect(h).toEqual(['Kennzeichnung «Mittelinsel (Standard)» von plan-1 ungültig, übergangen (Fläche bleibt)',
      'Kennzeichnung «Mittelinsel (Standard)» von plan-2 ungültig, übergangen (Fläche bleibt)'])
    expect(planStandardPruefen({ ...pl[0].standard, achse: [0, 2] })).toBeNull()
    expect(planStandardPruefen(pl[0].standard)).toEqual(pl[0].standard)
  })
})
