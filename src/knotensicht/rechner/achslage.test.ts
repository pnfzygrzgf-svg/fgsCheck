// Lage der Achsen je Querschnitt (Entscheid 31.10.2026, Befund OSM-Knoten 270973574 Jolimontstrasse/Buchserstrasse): liegt die
// OSM-Linie schräg zur AV-Fahrbahn, folgt die Achse der Fahrbahn statt einer festen Verschiebung der OSM-Linie.
//
// Lage (Meter, x Ost, y Nord, Ursprung = OSM-Knoten), wie rechnen.test.ts:
//   Hauptstrasse West–Ost, Fahrbahn y = −3 … +3 (6 m); Nebenstrasse von Süden, Fahrbahn x = −2,5 … +2,5 (5 m).
//   Mitte der rechten Hälfte der Zufahrt: x = +1,25; Fahrstreifenachse von Osten (ferne Spur): y = +3 − 1,5 = +1,5.
// Fall 1 (Zufahrt schräg): OSM-Linie der Zufahrt am Knoten in der Mitte, 30 m weiter 2,5 m westlich (auf dem Rand), dann parallel.
//   Bisher (Median der Sehnen 7 … 37 m, Lage rund 3,1 m rechts der OSM-Linie): Achse am Knoten bei x ≈ 3,1, neben der Fahrbahn.
// Fall 2 (Arm schräg): OSM-Linie des Ostarms am Knoten in der Mitte, 30 m weiter 2,5 m nördlich, dann parallel.
//   Bisher (Median 6 … 40 m): Fahrstreifenachse am Knoten bei y ≈ −0,4 (südliche Hälfte statt der nördlichen).

import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneKnoten } from './rechnen'
import { Fahrbahn } from './flaechen'
import { randProfil, profilBei, gleitenderMedian, PROFIL_AUSREISSER_M } from './fahrstreifen'
import { versetztVariabel, querschnitt, fahrstreifenAchse, randLinksBei } from './hauptachsen'
import { OsmNetz } from './netz'
import { D_VELO_M } from './velo'
import type { RichtungErgebnis } from './typen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const rel = (p: P): [number, number] => [p[0] - O[0], p[1] - O[1]]
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (haupt: [number, number, number][], neben: [number, number, number][]): OsmDaten => ({
  wege: [weg(1, haupt, { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30' }),
    weg(2, neben, { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' })],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [],
})
const HAUPT_GERADE: [number, number, number][] = [[10, -200, 0], [12, 0, 0], [13, 200, 0]]
const NEBEN_GERADE: [number, number, number][] = [[12, 0, 0], [20, 0, -200]]
const NEBEN_SCHRAEG: [number, number, number][] = [[12, 0, 0], [21, -2.5, -30], [20, -2.5, -200]]
const HAUPT_SCHRAEG: [number, number, number][] = [[10, -200, 0], [12, 0, 0], [14, 30, 2.5], [13, 200, 2.5]]
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const fahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
/** nur die Hauptstrasse (Zufahrt ohne AV) */
const nurHaupt = flaeche('Strasse_Weg', [lv(-200, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)])
/** Parkbucht 2 m östlich der Zufahrt von y = −14 bis −24 */
const mitBucht = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -24), lv(4.5, -24),
  lv(4.5, -14), lv(2.5, -14), lv(2.5, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)])
/** Bucht 2 m nördlich der Hauptstrasse von x = 20 bis 30 */
const mitBuchtNord = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(30, 3), lv(30, 5), lv(20, 5), lv(20, 3), lv(-200, 3), lv(-200, -3)])
const TOL = 0.2
/** Schräge der OSM-Linie in Fall 1 und 2: 2,5 m auf 30 m */
const SCHRAEGE = 2.5 / 30

describe('Hilfsfunktionen der Lage je Stelle', () => {
  it('profilBei: linear zwischen den Stellen, davor und danach konstant', () => {
    const s = [4, 6, 10], w = [1, 2, 0]
    expect(profilBei(s, w, 0)).toBe(1)
    expect(profilBei(s, w, 5)).toBeCloseTo(1.5, 9)
    expect(profilBei(s, w, 8)).toBeCloseTo(1, 9)
    expect(profilBei(s, w, 50)).toBe(0)
  })
  it('gleitender Median: Ausreisser geglättet, linearer Verlauf bleibt (Enden symmetrisch verkürzt)', () => {
    expect(gleitenderMedian([1, 1, 5, 1, 1])).toEqual([1, 1, 1, 1, 1])
    expect(gleitenderMedian([0, 1, 2, 3, 4, 5])).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('randProfil: Breiten ausserhalb der Grenze verworfen, zu wenige Stellen -> null (feste Lage)', () => {
    const s = [0, 2, 4, 6, 8, 10]
    const sh: ([number, number] | null)[] = [[2.5, 2.5], [2.5, 2.5], [4.5, 2.5], [2.5, 2.5], null, [2.5, 2.5]]
    const rp = randProfil(s, sh)!
    expect(rp.breite).toBe(5)
    // 7 m statt 5 m, nur der rechte Rand springt (Bucht): Rand aus dem linken und der Breite der Nachbarstellen ersetzt
    expect(rp.verworfen).toBe(0)
    expect(rp.ersetzt).toBe(1)
    expect(rp.s).toEqual([0, 2, 4, 6, 10])
    expect(rp.rechts.every(x => x === 2.5)).toBe(true)
    expect(PROFIL_AUSREISSER_M).toBe(1.5)
    expect(randProfil([0, 2, 4], [[2.5, 2.5], null, [2.5, 2.5]])).toBeNull()
    expect(randProfil([0, 2, 4, 6], [[2.5, 2.5], [4.5, 4.5], [4.5, 4.5], [2.5, 2.5]], 5)).toBeNull()
  })
  it('versetztVariabel: seitliche Lage je Bogenlänge, konstante Lage wie versetzt', () => {
    const l = versetztVariabel([[0, 0], [10, 0]], s => s / 10)
    expect(l[0]).toEqual([0, 0])
    expect(l[5][1]).toBeCloseTo(0.5, 9)
    expect(l[l.length - 1][1]).toBeCloseTo(1, 9)
  })
  it('querschnitt eines schrägen Arms: Ränder je Stelle, Fahrstreifenachse auf y = +1,5 statt fest zur OSM-Linie', () => {
    const o = osm(HAUPT_SCHRAEG, NEBEN_GERADE)
    const netz = new OsmNetz(o)
    const fb = new Fahrbahn([fahrbahn])
    const ml: P[] = [lv(0, 0), lv(30, 2.5), lv(200, 2.5)]
    const qs = querschnitt(netz, fb, ml, 1)
    expect(qs.profil).toBeDefined()
    expect(qs.quelle).toContain('Ränder je Stelle')
    // Rand links von u (Norden) je Stelle: bei 30 m 0,5 m, bei 6 m rund 2,5 m (statt des Medians)
    expect(randLinksBei(qs, 40)).toBeCloseTo(0.5, 2)
    expect(Math.abs(randLinksBei(qs, 6) - 2.5)).toBeLessThan(0.05)
    const fa = fahrstreifenAchse(ml, qs)
    for (const p of fa.slice(6, 120)) expect(Math.abs(rel(p)[1] - 1.5), `y ${rel(p)[1]} bei x ${rel(p)[0]}`).toBeLessThan(TOL)
  })
})

describe('Zufahrt mit schräger OSM-Linie (Fall 1)', () => {
  const e = rechneKnoten(osm(HAUPT_GERADE, NEBEN_SCHRAEG), [fahrbahn], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
  it('Achse des Zufahrtsstreifens an jeder Querschnittstelle in der Mitte der rechten Hälfte (x = +1,25)', () => {
    // zufahrtAchse: ab 2 m vor der Kante bis B + 12 m dahinter; Querschnittstellen ab nah + 4 m = 7 m vom Knoten
    const pts = e.zufahrtAchse.map(rel).filter(([, y]) => y <= -6.9)
    expect(pts.length).toBeGreaterThan(5)
    for (const [x, y] of pts) expect(Math.abs(x - 1.25), `x ${x} bei y ${y}`).toBeLessThan(TOL)
    // zum Knoten hin die Lage der ersten Stelle konstant (Entscheid): Abweichung höchstens Schräge × Abstand zur ersten Stelle
    for (const [x, y] of e.zufahrtAchse.map(rel).filter(([, y]) => y > -6.9))
      expect(Math.abs(x - 1.25), `x ${x} bei y ${y}`).toBeLessThan(SCHRAEGE * (7 + y) + 0.05)
  })
  it('D am Knoten auf der rechten Hälfte, Achspunkt in ihrer Mitte', () => {
    const [xa, ya] = rel(e.Dachse), [xd] = rel(e.D)
    expect(Math.abs(xa - 1.25)).toBeLessThan(TOL)
    expect(Math.abs(ya + 6)).toBeLessThan(0.1)
    expect(xd).toBeGreaterThan(0)
    expect(xd).toBeLessThan(2.5)
  })
  it('Quelle: Lage je Stelle aus den AV-Querschnitten, Wert am Nullpunkt', () => {
    expect(e.zufahrtLageQuelle).toMatch(/^Achse des Zufahrtsstreifens aus den AV-Querschnitten der Zufahrt je Stelle \(Fahrbahn 5,0 m im Median, \d+ Sehnen, Mitte der rechten Hälfte; Lage folgt der Fahrbahn, am Nullpunkt 1,\d\d m rechts der OSM-Achse\)$/)
  })
  it('K beider Richtungen: Lage der ersten Stelle konstant zum Knoten hin (Abweichung höchstens Schräge × Abstand)', () => {
    for (const r of e.richtungen as RichtungErgebnis[]) {
      const [x, y] = rel(r.K)
      expect(Math.abs(x - 1.25), `x ${x} bei y ${y}`).toBeLessThan(SCHRAEGE * (7 + y) + 0.05)
    }
  })
})

describe('Vortrittsberechtigter Arm mit schräger OSM-Linie (Fall 2)', () => {
  const e = rechneKnoten(osm(HAUPT_SCHRAEG, NEBEN_GERADE), [fahrbahn], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
  const rechts = e.richtungen.find(r => r.richtung === 'rechts') as RichtungErgebnis
  it('F_A-Achse nach rechts (ferne Spur) an jeder Stelle auf y = +1,5', () => {
    const pts = rechts.achse.map(rel).filter(([x]) => x >= 6)
    expect(pts.length).toBeGreaterThan(30)
    for (const [x, y] of pts) expect(Math.abs(y - 1.5), `y ${y} bei x ${x}`).toBeLessThan(TOL)
    // K: Rand der ersten gültigen Stelle (6 m) konstant zum Knoten hin (OSM-Linie dort 0,5 m tiefer)
    expect(Math.abs(rel(rechts.K)[1] - 1.5)).toBeLessThan(0.5)
  })
  it('Veloachse (Mischverkehr) folgt dem Rand: y = 3 − 0,50', () => {
    expect(rechts.velo?.fuehrung).toBe('misch')
    for (const [x, y] of rechts.velo!.achse.map(rel).filter(([x]) => x >= 6))
      expect(Math.abs(y - (3 - D_VELO_M)), `y ${y} bei x ${x}`).toBeLessThan(TOL)
  })
  it('Quelle der Fahrstreifenachse nennt die Ränder je Stelle', () => {
    expect(rechts.lageQuelle).toContain('Ränder je Stelle')
  })
})

describe('Ausreisser und Rückfall', () => {
  it('Parkbucht neben der Zufahrt: Querschnitte verworfen, Achse bleibt bei x = +1,25', () => {
    const e = rechneKnoten(osm(HAUPT_GERADE, NEBEN_GERADE), [mitBucht], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
    expect(e.zufahrtLageQuelle).toContain('11 Sehnen, 5 Ausreisser verworfen')
    for (const [x, y] of e.zufahrtAchse.map(rel).filter(([, y]) => y <= -4))
      expect(Math.abs(x - 1.25), `x ${x} bei y ${y}`).toBeLessThan(0.01)
    expect(Math.abs(rel(e.Dachse)[0] - 1.25)).toBeLessThan(0.01)
  })
  it('Bucht am Nordrand der Hauptstrasse (x = 20 … 30): Querschnitte verworfen, F_A-Achse von Osten bleibt auf y = +1,5', () => {
    const e = rechneKnoten(osm(HAUPT_GERADE, NEBEN_GERADE), [mitBuchtNord], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
    const rechts = e.richtungen.find(r => r.richtung === 'rechts') as RichtungErgebnis
    for (const [x, y] of rechts.achse.map(rel)) expect(Math.abs(y - 1.5), `y ${y} bei x ${x}`).toBeLessThan(0.01)
  })
  it('gerade, zentrierte OSM-Linie: dieselbe Lage wie mit der festen Verschiebung (x = +1,25)', () => {
    const e = rechneKnoten(osm(HAUPT_GERADE, NEBEN_GERADE), [fahrbahn], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
    expect(e.zufahrtLageQuelle).toContain('am Nullpunkt 1,25 m rechts der OSM-Achse')
    for (const [x] of e.zufahrtAchse.map(rel)) expect(Math.abs(x - 1.25)).toBeLessThan(1e-6)
  })
  it('ohne AV der Zufahrt: feste Lage aus OSM wie bisher', () => {
    const e = rechneKnoten(osm(HAUPT_GERADE, NEBEN_GERADE), [nurHaupt], { knoten: 12, zufahrt: '2:0:1' }).ergebnis!
    expect(e.zufahrtLageQuelle).toBe('Achse des Zufahrtsstreifens ohne genügend AV-Querschnitte: feste Lage 1,75 m rechts der OSM-Achse angenommen')
    expect(e.annahmen.join(' | ')).toContain('Die amtliche Vermessung zeigt die Fahrbahn der Zufahrt nicht genügend: das wartende Fahrzeug ' +
      'steht 1,75 m rechts der OSM-Linie (Annahme).')
    expect(e.herleitung![0]).toBe('Achse des Zufahrtsstreifens ohne genügend AV-Querschnitte: feste Lage 1,75 m rechts der OSM-Achse angenommen.')
    for (const [x] of e.zufahrtAchse.map(rel)) expect(Math.abs(x - 1.75)).toBeLessThan(1e-6)
  })
})
