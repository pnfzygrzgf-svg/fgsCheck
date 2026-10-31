// Tests E3c: Rechtsvortritt nach VSS 40 273 Teil E (Ziffern 15 bis 18, Abb. 4 bis 6). Handlösungen im Kommentar.
//
// Lage (Meter, x Ost, y Nord, Ursprung = OSM-Knoten 12) wie knoteneingaben.test.ts: Hauptstrasse West–Ost, Fahrbahn y = −3 … +3;
// Nebenstrasse von Süden, Fahrbahn x = −2,5 … +2,5. Zufahrt Süd, Achse des Zufahrtsstreifens x = +1,25. Rechts der Zufahrt liegt der
// Arm Ost: sein Verkehr fährt nach Westen auf der Fahrstreifenachse y = 3 − 1,5 = +1,5. Rechtsvortritt: B 5,00 m ab dem Rand des
// Arms Ost (y = −3): Dachse (1,25; −8), D am Fahrersitz (0,75; −8); K = (1,25; 1,5), Zielpunkte (1,25 + s; 1,5).

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneKnoten } from './rechnen'
import { ABB6, abb6Spalte, zustandAbb6, rvMindest, rechterArm, linkerArm, WAHRNEHMBARKEITEN, type Wahrnehmbarkeit,
  type Zustand } from './rechtsvortritt'
import { KEINE_ALLE_EINGABEN, type ArmInfo, type Eingaben, type Ergebnis, type KnotenFall } from './typen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (nord = false): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [14, 30, 0], [13, 200, 0]], { highway: 'residential', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '50' }),
    ...(nord ? [weg(3, [[12, 0, 0], [30, 0, 200]], { highway: 'residential', name: 'Nordstrasse', maxspeed: '50' })] : []),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const rechteck = (x0: number, y0: number, x1: number, y1: number) => flaeche('Gebaeude', [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)])
/** T-Knoten; Nebenstrasse halbe Breite bn (Vorgabe 2,5 m) */
const tFahrbahn = (bn = 2.5) => flaeche('Strasse_Weg', [lv(-200, -3), lv(-bn, -3), lv(-bn, -200), lv(bn, -200), lv(bn, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const kreuz = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3), lv(200, 3),
  lv(2.5, 3), lv(2.5, 200), lv(-2.5, 200), lv(-2.5, 3), lv(-200, 3), lv(-200, -3)])
const rel = (p: P): [number, number] => [p[0] - O[0], p[1] - O[1]]
const eg = (x: Partial<Eingaben>): Eingaben => ({ ...KEINE_ALLE_EINGABEN, regelung: 'rechtsvortritt', ...x })
const SUED = '2:0:1'
const rechne = (o: OsmDaten, av: AvFlaeche[], f: Partial<KnotenFall> = {}): Ergebnis => {
  const r = rechneKnoten(o, av, { knoten: 12, zufahrt: SUED, eingaben: eg({}), ...f })
  expect(r.meldungen).toEqual([])
  return r.ergebnis!
}
const seite = (e: Ergebnis, r: 'links' | 'rechts') => e.richtungen.find(x => x.richtung === r)!

describe('E3c: Matrix der Abb. 6', () => {
  // je Wahrnehmbarkeit die Zustände bei 0; 14,99; 15; 19,99; 20; 24,99; 25; 40 m (dazwischen die nächsttiefere Stufe)
  const W = [0, 14.99, 15, 19.99, 20, 24.99, 25, 40]
  const S = 'sanieren', Z = 'zulaessig', A = 'anzustreben'
  const soll: Record<Wahrnehmbarkeit, Zustand[]> = {
    sehr_gut: [S, S, Z, Z, A, A, A, A],
    gut: [S, S, S, S, A, A, A, A],
    schlecht: [S, S, S, S, S, S, Z, Z],
    sehr_schlecht: [S, S, S, S, S, S, S, S],
  }
  it('alle 16 Felder (4 Zeilen × 4 Spalten) mit Zwischenwerten', () => {
    for (const w of WAHRNEHMBARKEITEN) expect(W.map(x => zustandAbb6(w, x)), w).toEqual(soll[w])
    expect(W.map(abb6Spalte)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect(Object.values(ABB6).flat().length).toBe(16)
  })
  it('kleinste Sichtweite je Wahrnehmbarkeit: zulässig bzw. anzustreben', () => {
    expect(WAHRNEHMBARKEITEN.map(rvMindest)).toEqual([{ zulaessig: 15, anzustreben: 20 }, { zulaessig: 20, anzustreben: 20 },
      { zulaessig: 25, anzustreben: null }, { zulaessig: null, anzustreben: null }])
  })
})

describe('E3c: Arm rechts der Zufahrt', () => {
  const arm = (key: string, grad: number): ArmInfo => ({ key, nr: '', wid: 1, i: 0, sd: 1, name: key, hw: 'residential', himmel: '', zufluss: true,
    einbahn: 0, veloZufluss: true, veloZuflussQuelle: '', richtung: [Math.cos(grad * Math.PI / 180), Math.sin(grad * Math.PI / 180)] })
  const r = (z: number, ...andere: number[]) => {
    const arme = [arm('z', z), ...andere.map(g => arm(`a${g}`, g))]
    const rr = rechterArm(arme[0], arme)
    return [rr?.key ?? null, linkerArm(arme[0], arme, rr)?.key ?? null]
  }
  it('Kreuzung: Zufahrt Süd -> rechts Ost, links West (Nord gegenüber); jede Zufahrt ihr Nachbar im Gegenuhrzeigersinn', () => {
    expect(r(270, 0, 90, 180)).toEqual(['a0', 'a180'])
    expect(r(0, 90, 180, 270)).toEqual(['a90', 'a270'])
    expect(r(180, 270, 0, 90)).toEqual(['a270', 'a90'])
  })
  it('schiefe Knoten: Arm 60° bzw. 150° gegen den Uhrzeigersinn ab der Zufahrt ist rechts; ab 155° (Knick bis 25°) geradeaus', () => {
    expect(r(270, 330, 150)).toEqual(['a330', 'a150'])          // 60° rechts der Zufahrt, Ast links
    expect(r(270, 60, 200)).toEqual(['a60', 'a200'])            // 150°: 30° rechts der Fahrtrichtung
    expect(r(270, 65, 200)).toEqual([null, 'a200'])             // 155°: durchgehende Strasse mit Knick
    expect(r(270, 330, 30, 200).slice(0, 1)).toEqual(['a330'])  // fünf Arme: der nächste rechts
  })
  it('T-Einmündung: am Querbalken mit dem Stamm rechts ist der Stamm rechts; mit dem Stamm links keiner', () => {
    expect(r(180, 0, 270)).toEqual(['a270', 'a0'])              // von West nach Ost, Stamm Süd = rechts
    expect(r(0, 180, 270)).toEqual([null, 'a270'])              // von Ost nach West, Stamm Süd = links
  })
})

describe('E3c: T-Knoten mit Gebäudeecke rechts (Strahlensatz)', () => {
  // Ecke C = (cx; −4). Sichtlinie D (0,75; −8) – (1,25 + s; 1,5) trifft y = −4 bei t = 4/9,5, x = 0,75 + 4/9,5 · (0,5 + s).
  // Verdeckt ab x = cx: s = (cx − 0,75) · 9,5/4 − 0,5. cx = 8: 16,71875 m; cx = 10: 21,46875 m.
  const ecke = (cx: number) => rechteck(cx, -4, cx + 20, -24)
  it('D 5,00 m hinter dem Rand des rechten Arms, Tempo 30 fest, von links keine Prüfung', () => {
    const e = rechne(osm(), [tFahrbahn(), ecke(8)], { eingaben: eg({ tempo: { links: null, rechts: { art: 'signalisiert', wert: 50, begruendung: '' } } }) })
    expect(e.B).toBe(5)
    expect(rel(e.D).map(x => Math.round(x * 100) / 100)).toEqual([0.75, -8])
    const r = seite(e, 'rechts')
    expect([r.tempo, r.rv, r.strasse]).toEqual([30, true, '1 Hauptstrasse (Ost)'])
    expect(rel(r.K).map(x => Math.round(x * 100) / 100)).toEqual([1.25, 1.5])
    expect(seite(e, 'links').status).toBe('keine_zufahrt')
    expect(e.rechtsvortritt!.arm.rechtsName).toBe('1 Hauptstrasse (Ost)')
  })
  it('Ecke bei x = 8: 16,72 m; sehr gut zulässig (bedingt), gut bis sehr schlecht zu sanieren, mit «Rechtsvortritt aufheben»', () => {
    const soll: Record<Wahrnehmbarkeit, [string, string]> = { sehr_gut: ['zulaessig', 'bedingt'], gut: ['sanieren', 'nicht_erfuellt'],
      schlecht: ['sanieren', 'nicht_erfuellt'], sehr_schlecht: ['sanieren', 'nicht_erfuellt'] }
    for (const w of WAHRNEHMBARKEITEN) {
      const e = rechne(osm(), [tFahrbahn(), ecke(8)], { eingaben: eg({ wahrnehmbarkeit: w }) })
      const a = e.rechtsvortritt!.arm
      expect(a.vorhanden).toBeCloseTo(16.71875, 2)
      expect([a.zustand, a.status], w).toEqual(soll[w])
      expect(seite(e, 'rechts').status).toBe(w === 'sehr_gut' ? 'massgebend' : 'nicht_erfuellt')
      // sehr gut: Massnahmen nur wegen des Velos (Tab. 3), ohne «Rechtsvortritt aufheben»
      expect(e.massnahmen?.[0].nr === 0).toBe(w !== 'sehr_gut')
      // Fundstelle der Aufhebung: VSS 40 273 Ziffer 16 (die Wahrnehmbarkeit Ziffer 17)
      if (w !== 'sehr_gut') expect(e.massnahmen![0].text).toContain('(VSS 40 273 Ziffer 16)')
    }
  })
  it('Ecke bei x = 10: 21,47 m; sehr gut und gut anzustreben, schlecht und sehr schlecht zu sanieren; Vorgabe gut als Annahme', () => {
    const e = rechne(osm(), [tFahrbahn(), ecke(10)])
    expect(e.rechtsvortritt!.arm.vorhanden).toBeCloseTo(21.46875, 2)
    expect([e.rechtsvortritt!.wahrnehmbarkeit, e.rechtsvortritt!.wahrnehmbarkeitGewaehlt, e.rechtsvortritt!.arm.status]).toEqual(['gut', false, 'erfuellt'])
    expect(e.annahmen.join(' | ')).toContain('Wahrnehmbarkeit des Knotens «gut» angenommen')
    for (const w of ['schlecht', 'sehr_schlecht'] as Wahrnehmbarkeit[])
      expect(rechne(osm(), [tFahrbahn(), ecke(10)], { eingaben: eg({ wahrnehmbarkeit: w }) }).rechtsvortritt!.arm.zustand).toBe('sanieren')
    expect(rechne(osm(), [tFahrbahn(), ecke(10)], { eingaben: eg({ wahrnehmbarkeit: 'sehr_gut' }) }).rechtsvortritt!.arm.zustand).toBe('anzustreben')
  })
  it('Velo von rechts mit 30 km/h (Tab. 3, untere Zeile), keine Paarmatrix bei 5 m breiter Zufahrt', () => {
    const e = rechne(osm(), [tFahrbahn(), ecke(10)])
    const v = seite(e, 'rechts').velo!
    expect([v.tempo, v.A]).toEqual([30, 25])
    expect(seite(e, 'links').velo).toBeNull()
    expect([e.rechtsvortritt!.arm.schmal, e.rechtsvortritt!.arm.paare]).toEqual([false, null])
  })
  it('T-Einmündung von Ost (Stamm links): kein Arm rechts, keine Prüfung', () => {
    const e = rechne(osm(), [tFahrbahn()], { zufahrt: '1:1:1' })
    expect([e.rechtsvortritt!.arm.status, e.rechtsvortritt!.arm.rechts]).toEqual(['keine', null])
    expect(e.richtungen.every(r => r.status === 'keine_zufahrt')).toBe(true)
  })
})

describe('E3c: alle Arme einer Kreuzung', () => {
  it('je Arm ein Ergebnis gegen den rechten Nachbarn; Gebäude in der Ecke Süd-Ost trifft nur Süd -> Ost', () => {
    const e = rechne(osm(true), [kreuz, rechteck(8, -4, 28, -24)], { eingaben: eg({ alleArme: true }) })
    const alle = e.rechtsvortritt!.alle!
    expect(alle.map(a => `${a.armName} -> ${a.rechtsName}`).sort()).toEqual(['1 Nordstrasse (Nord) -> 4 Hauptstrasse (West)',
      '2 Hauptstrasse (Ost) -> 1 Nordstrasse (Nord)', '3 Nebenstrasse (Süd) -> 2 Hauptstrasse (Ost)', '4 Hauptstrasse (West) -> 3 Nebenstrasse (Süd)'])
    const sued = alle.find(a => a.arm === SUED)!
    expect(sued).toBe(e.rechtsvortritt!.arm)
    expect(sued.vorhanden).toBeCloseTo(16.71875, 2)
    expect(sued.status).toBe('nicht_erfuellt')
    for (const a of alle.filter(x => x.arm !== SUED)) expect([a.armName, a.status, a.bisEnde]).toEqual([a.armName, 'erfuellt', true])
    // ohne Wunsch keine Tabelle
    expect(rechne(osm(true), [kreuz]).rechtsvortritt!.alle).toBeNull()
  })
})

describe('E3c: schmale Zufahrt 3,0 m, Paarmatrix nach Abb. 5', () => {
  // Nebenstrasse x = −1,5 … +1,5 (b = 3,0 m ≤ 3,50 m): Punkte auf ihrer Fahrbahnachse x = 0. Der rechte Arm (Ost, 6 m) ist breit: Punkte
  // auf seiner Fahrstreifenachse y = +1,5. Schnitt (0; 1,5). Punkte (0; 1,5 − a) und (b; 1,5), a, b = 2, 4, … 20, massgebend a + b ≤ 20
  // (45 Paare, ohne den Schnittpunkt). Hauswand: Gebäude x ≥ 2,8, y ≤ −4. Die Sichtlinie erreicht y = −4 bei x = b · (a − 5,5)/a:
  // verdeckt, wenn b · (a − 5,5) > 2,8 · a. Verdeckt sind (8;10), (8;12), (10;8), (10;10), (12;6), (12;8), (14;6): 7 von 45; erste
  // Kombination (kleinste Summe 18, dann kleinerer grösserer Abstand 10, dann kleineres a): 8 m Süd, 10 m Ost.
  it('Anteil sichtbarer Paare 38/45, erste verdeckte Kombination 8 m / 10 m, Status nicht erfüllt mit Zusatz', () => {
    const e = rechne(osm(), [tFahrbahn(1.5), rechteck(2.8, -4, 20, -20)], { eingaben: eg({ wahrnehmbarkeit: 'sehr_gut' }) })
    const a = e.rechtsvortritt!.arm
    expect(a.breite).toBeCloseTo(3.0, 2)
    expect(a.schmal).toBe(true)
    const m = a.paare!
    expect(rel(m.K).map(x => Math.round(x * 100) / 100)).toEqual([0, 1.5])
    expect([m.paare.length, m.sichtbar, m.frei]).toEqual([45, 38, false])
    expect(m.anteil).toBeCloseTo(38 / 45, 6)
    expect([m.erste!.s1, m.erste!.s2]).toEqual([8, 10])
    const verdeckt = m.paare.filter(p => !p.frei).map(p => `${m.s[p.i]};${m.s[p.j]}`).sort()
    expect(verdeckt).toEqual(['10;10', '10;8', '12;6', '12;8', '14;6', '8;10', '8;12'])
    expect(e.hinweise.join(' ')).toContain('nur die Zufahrt ist höchstens 3,50 m breit')
    expect(a.status).toBe('nicht_erfuellt')
    expect(seite(e, 'rechts').statusZusatz).toContain('Sichtfeld nach Abb. 5 nicht frei')
    expect(e.massnahmen?.[0].nr).toBe(0)
  })
  it('ohne die Hauswand: alle 45 Paare frei', () => {
    const e = rechne(osm(), [tFahrbahn(1.5)])
    expect([e.rechtsvortritt!.arm.paare!.sichtbar, e.rechtsvortritt!.arm.paare!.frei, e.rechtsvortritt!.arm.status]).toEqual([45, true, 'erfuellt'])
  })
  it('Einbahn vom Knoten weg auf der Zufahrt: keine Prüfung, auch nach rechts', () => {
    const o = osm()
    o.wege[1].tags.oneway = 'yes'                               // Weg 2 läuft vom Knoten nach Süden: Einbahn vom Knoten weg
    const e = rechne(o, [tFahrbahn()])
    expect(e.rechtsvortritt!.arm.status).toBe('keine')
    expect(e.richtungen.map(r => r.status)).toEqual(['keine_zufahrt', 'keine_zufahrt'])
  })
})
