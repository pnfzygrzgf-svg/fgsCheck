// Tests E2b: Eingaben zum Knoten (Vortrittsregelung, Haltelinie, D von Hand, Trottoir, Tempo je Richtung) und
// Grundstückzufahrt am T-Knoten aus rechnen.test.ts. Handlösungen im Kommentar.
//
// Lage (Meter, x Ost, y Nord, Ursprung = OSM-Knoten 12): Hauptstrasse West–Ost, Fahrbahn y = −3 … +3; Nebenstrasse von Süden,
// Fahrbahn x = −2,5 … +2,5. Achse des Zufahrtsstreifens x = +1,25, Kante des Fahrstreifens mit Vortritt y = −3.
// Ohne Eingaben: B 3,00 m, Dachse (1,25; −6), D (0,75; −6). Gebäudeecke C = (−10; −4): nach links verdeckt ab 24,6875 m.

import { describe, expect, it } from 'vitest'
import { wgs, add, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneKnoten } from './rechnen'
import { fbLage, PW_LAENGE_M, LENKER_VOR_FRONT_M } from './fahrzeug'
import { zufahrtspunktKey, zufahrtspunktLesen } from './grundstueck'
import { KEINE_ALLE_EINGABEN, type Eingaben, type Ergebnis, type KnotenFall } from './typen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (haupt: Record<string, string> = {}, extra: Partial<OsmDaten> = {}): OsmDaten => ({
  wege: [
    weg(1, [[10, -200, 0], [12, 0, 0], [14, 30, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30', ...haupt }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
  ],
  tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [], ...extra,
})
const flaeche = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [ring] })
const fahrbahn = flaeche('Strasse_Weg', [lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3),
  lv(200, 3), lv(-200, 3), lv(-200, -3)])
const ecke = flaeche('Gebaeude', [lv(-10, -4), lv(-30, -4), lv(-30, -24), lv(-10, -24), lv(-10, -4)])
const rel = (p: P): [number, number] => [p[0] - O[0], p[1] - O[1]]
const nahe = (p: P, x: number, y: number, tol = 0.05) => {
  const [a, b] = rel(p)
  expect(Math.abs(a - x), `x ${a} statt ${x}`).toBeLessThan(tol)
  expect(Math.abs(b - y), `y ${b} statt ${y}`).toBeLessThan(tol)
}
const eg = (x: Partial<Eingaben>): Eingaben => ({ ...KEINE_ALLE_EINGABEN, ...x })
const rechne = (o: OsmDaten, av: AvFlaeche[], f: Partial<KnotenFall> = {}): Ergebnis => {
  const r = rechneKnoten(o, av, { knoten: 12, zufahrt: null, ...f })
  expect(r.meldungen).toEqual([])
  return r.ergebnis!
}
const seite = (e: Ergebnis, r: 'links' | 'rechts') => e.richtungen.find(x => x.richtung === r)!

describe('Mündungsbereich der Zufahrt', () => {
  it('Knickstück der OSM-Linie am Knoten: D und F_B stehen in der Richtung des geraden Teils', () => {
    // Nebenstrasse mit kurzem Knick: Knoten (0,0) -> (0,5; −1,2) -> (0,8; −2,8) -> (0,9; −4) -> (0,9; −200): die ersten 1,2 m
    // weichen 23° ab, der gerade Teil läuft genau nach Süden. Ohne Glättung käme die Tangente an D (3 m hinter der Kante) aus
    // dem Knick. Erwartung: F_B fährt nach Norden (Richtung (0; 1), Abweichung unter 2°), D 0,75 m rechts der Zufahrtsachse, die
    // Achse liegt bei x ≈ 0,9 + 1,25 (Mitte der rechten Hälfte der 5 m breiten Fahrbahn); Fahrbahn der AV wie fahrbahn, aber
    // um die Knicklage symmetrisch: hier reicht die bestehende Fläche (x −2,5 … 2,5), die Sehnen liegen in ihr.
    const o = osm()
    o.wege[1] = weg(2, [[12, 0, 0], [21, 0.5, -1.2], [22, 0.8, -2.8], [23, 0.9, -4], [20, 0.9, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' })
    const e = rechne(o, [fahrbahn])
    const [ux, uy] = e.fbRichtung
    expect(Math.abs(Math.atan2(ux, uy)) * 180 / Math.PI, `F_B-Richtung ${ux}, ${uy}`).toBeLessThan(2)
    // D hinter der Kante y = −3 um B = 3 m (Vortritt, innerorts): y ≈ −6; x wie am geraden T-Knoten (0,75: Mitte der rechten
    // Fahrbahnhälfte 1,25 aus dem AV-Querschnitt, Fahrer*innensitz 0,5 m links), der Versatz der OSM-Linie (0,9 m) spielt keine Rolle
    const [dx, dy] = rel(e.D)
    expect(Math.abs(dy + 6), `D y ${dy}`).toBeLessThan(0.3)
    expect(Math.abs(dx - 0.75), `D x ${dx}`).toBeLessThan(0.3)
  })
})

describe('E2b: Vortrittsregelung', () => {
  it('Vorgabe ohne Signal: Vortritt (Annahme); ausserorts B 5,00 m', () => {
    const e = rechne(osm({ maxspeed: '60' }), [fahrbahn])
    expect([e.regelung, e.regelungVorgabe, e.regelungGewaehlt, e.B]).toEqual(['vortritt', 'vortritt', false, 5])
    expect(e.annahmen.join(' | ')).toContain('Kein Vortritt (Signal 3.02) angenommen: kein Signal in OSM')
  })
  it('Vorgabe ohne Signal nach der Vortrittsstrasse: Quartierstrasse Tempo 30 -> Rechtsvortritt, sonst Vortritt', () => {
    // residential mit maxspeed 30: Rechtsvortritt (Annahme), B 5,00 m nach Abb. 4
    const q = rechne(osm({ highway: 'residential', maxspeed: '30' }), [fahrbahn])
    expect([q.regelung, q.regelungVorgabe, q.regelungGewaehlt, q.B]).toEqual(['rechtsvortritt', 'rechtsvortritt', false, 5])
    expect(q.regelungQuelle).toContain('Quartierstrasse mit Tempo 30')
    expect(q.annahmen.join(' | ')).toContain('Rechtsvortritt angenommen: kein Signal in OSM, Quartierstrasse')
    // unclassified nur mit Zonen-Tag
    expect(rechne(osm({ highway: 'unclassified', maxspeed: '30' }), [fahrbahn]).regelungVorgabe).toBe('vortritt')
    const z = rechne(osm({ highway: 'unclassified', maxspeed: '30', 'zone:maxspeed': 'CH:30' }), [fahrbahn])
    expect([z.regelungVorgabe, z.regelungQuelle]).toEqual(['rechtsvortritt', 'kein Signal in OSM, Quartierstrasse mit Tempo 30 (Tempo-30-Zone)'])
    // Hauptverkehrsstrasse bzw. Tempo 50 bzw. priority_road: Vortritt mit Grund
    expect(rechne(osm({ highway: 'tertiary', maxspeed: '30' }), [fahrbahn]).regelungQuelle).toBe('kein Signal in OSM, Vortrittsstrasse highway=tertiary')
    expect(rechne(osm({ highway: 'residential', maxspeed: '50' }), [fahrbahn]).regelungQuelle).toBe('kein Signal in OSM, Vortrittsstrasse maxspeed 50 km/h')
    expect(rechne(osm({ highway: 'residential', maxspeed: '30', priority_road: 'designated' }), [fahrbahn]).regelungVorgabe).toBe('vortritt')
    // Signal geht vor
    const gw = osm({ highway: 'residential', maxspeed: '30' }, { vortritt: [{ id: 98, tags: { highway: 'give_way' }, lat: ll(0, -4)[0], lon: ll(0, -4)[1] }] })
    expect(rechne(gw, [fahrbahn]).regelungVorgabe).toBe('vortritt')
  })
  it('Stop von Hand: B 3,00 m auch ausserorts (Ziffer 12), D 3 m hinter der Kante; Annahme entfällt', () => {
    const e = rechne(osm({ maxspeed: '60' }), [fahrbahn], { eingaben: eg({ regelung: 'stop' }) })
    expect([e.regelung, e.regelungGewaehlt, e.ausserorts, e.B]).toEqual(['stop', true, true, 3])
    nahe(e.Dachse, 1.25, -6)
    nahe(e.D, 0.75, -6)
    expect(e.annahmen.some(a => a.includes('Vortrittsregelung'))).toBe(false)
    expect(e.annahmen.join(' | ')).toContain('steht 3,00 m hinter der Kante des Fahrstreifens mit Vortritt (B ausserorts, Stop')
  })
  it('Vorgabe aus OSM highway=stop an der Zufahrt: Stop, B 3,00 m ausserorts; give_way: Vortritt', () => {
    const stop = osm({ maxspeed: '60' }, { vortritt: [{ id: 99, tags: { highway: 'stop' }, lat: ll(0, -4)[0], lon: ll(0, -4)[1] }] })
    const e = rechne(stop, [fahrbahn])
    expect([e.regelung, e.regelungVorgabe, e.regelungQuelle, e.B]).toEqual(['stop', 'stop', 'OSM highway=stop an der Zufahrt', 3])
    // von Hand Vortritt gewählt: B 5,00 m, Hinweis auf das Signal
    const v = rechne(stop, [fahrbahn], { eingaben: eg({ regelung: 'vortritt' }) })
    expect(v.B).toBe(5)
    expect(v.hinweise.join(' ')).toContain('an der Zufahrt; gewählt ist «Kein Vortritt (Signal 3.02)».')
    const gw = osm({ maxspeed: '60' }, { vortritt: [{ id: 98, tags: { highway: 'give_way' }, lat: ll(0, -4)[0], lon: ll(0, -4)[1] }] })
    expect(rechne(gw, [fahrbahn]).regelung).toBe('vortritt')
  })
  it('Rechtsvortritt (E3c, Teil E): B 5,00 m, von links keine Prüfung, nach rechts Abb. 6 (Einzelheiten in rechtsvortritt.test.ts)', () => {
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ regelung: 'rechtsvortritt' }) })
    expect(e.B).toBe(5)
    nahe(e.D, 0.75, -8)
    expect(seite(e, 'links').status).toBe('keine_zufahrt')
    expect(seite(e, 'links').keinGrund).toBe('Verkehr von links (3 Hauptstrasse (West)) muss dieser Zufahrt den Vortritt lassen: nicht geprüft')
    expect(seite(e, 'links').lage).toBe('links')
    expect(seite(e, 'rechts').rv).toBe(true)
    expect(e.rechtsvortritt?.arm.status).toBe('erfuellt')
  })
})

describe('E2b: Haltelinie', () => {
  it('1 m hinter der Kante, 0,35 m neben der Achse geklickt: Lot auf die Achse, D 1 m weiter zurück', () => {
    // Klick (1,6; −4) -> Lot (1,25; −4); B ab der Vorderkante: Dachse (1,25; −7), D (0,75; −7)
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ haltelinie: lv(1.6, -4) }) })
    expect(e.haltelinie).not.toBeNull()
    nahe(e.haltelinie!.p, 1.25, -4)
    expect(e.haltelinie!.abstand).toBeCloseTo(1, 6)
    expect(e.haltelinie!.vorverlegt).toBe(false)
    nahe(e.nullpunkt, 1.25, -4)
    nahe(e.Dachse, 1.25, -7)
    nahe(e.D, 0.75, -7)
    expect(e.nullpunktText).toBe('Vorderkante der Halte- oder Wartelinie')
    // Querlinie senkrecht zur Achse, 3 m lang
    nahe(e.haltelinie!.quer[0], 1.25 + 1.5, -4); nahe(e.haltelinie!.quer[1], 1.25 - 1.5, -4)
  })
  it('Haltelinie verschiebt D entlang der Achse um den gesetzten Abstand (Gebäudeecke: Sichtweite nach Strahlensatz)', () => {
    // D (0,75; −7): Sichtlinie über C (−10; −4): (s − 0,5) / 10,75 = 5,5 / 3 -> s = 0,5 + 19,708 = 20,21 m (statt 24,69 m)
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ haltelinie: lv(1.25, -4) }) })
    expect(Math.abs(seite(e, 'links').vorhanden - (0.5 + 10.75 * 5.5 / 3))).toBeLessThan(0.01)
  })
  it('vorverlegt 1 m vor die Kante: D (0,75; −5), Hinweis Ziffer 14', () => {
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ haltelinie: lv(1.25, -2) }) })
    expect(e.haltelinie!.abstand).toBeCloseTo(-1, 6)
    expect(e.haltelinie!.vorverlegt).toBe(true)
    nahe(e.D, 0.75, -5)
    expect(e.hinweise.join(' ')).toContain('Ziffer 14')
  })
  it('zu weit neben der Achse: nicht gerechnet, Hinweis; D wie ohne Haltelinie', () => {
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ haltelinie: lv(9, -4) }) })
    expect(e.haltelinie).toBeNull()
    nahe(e.D, 0.75, -6)
    expect(e.hinweise.join(' ')).toContain('neben der Zufahrtsachse: nicht gerechnet')
  })
})

describe('E2b: D von Hand', () => {
  // D (0; −5): 2 m hinter der Kante, 1,25 m links der Achse (Fahrer schaut nach Norden, links = Westen).
  // Strahlensatz über C (−10; −4): Richtung (−10; 1), bei y = −1,5 (dy 3,5) x = −35 -> s = 1,25 + 35 = 36,25 m
  const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ D: lv(0, -5) }) })
  it('D geht unverändert in die Rechnung, Lage gegenüber der Kante, Hinweis B unter 3 m, Annahme entfällt', () => {
    expect(e.Dhand).toBe(true)
    nahe(e.D, 0, -5, 1e-9)
    nahe(e.Dvorgabe, 0.75, -6)
    expect(e.Dlage.laengs).toBeCloseTo(2, 6)
    expect(e.Dlage.seitlich).toBeCloseTo(1.25, 6)
    expect(Math.abs(seite(e, 'links').vorhanden - 36.25)).toBeLessThan(0.01)
    expect(e.hinweise.join(' ')).toContain('weniger als 3,00 m (Ziffer 12')
    expect(e.annahmen.some(a => a.includes('Das Fahrer*innenauge'))).toBe(false)
    // Sichtdreieck ab D
    nahe(seite(e, 'rechts').dreieck[0], 0, -5, 1e-9)
  })
  it('FB folgt D: Fahrzeugachse 0,5 m rechts von D, Front 2,0 m vor D, Fahrt nach Norden', () => {
    nahe(e.Dachse, 0.5, -5, 1e-6)
    expect(e.fbRichtung[0]).toBeCloseTo(0, 9); expect(e.fbRichtung[1]).toBeCloseTo(1, 9)
    const [m, u] = fbLage(e.Dachse, add(e.Dachse, e.fbRichtung))
    nahe(add(m, u, PW_LAENGE_M / 2), 0.5, -5 + LENKER_VOR_FRONT_M, 1e-6)
  })
})

describe('E2b: Trottoir', () => {
  // Trottoirüberfahrt: Trottoir y = −5 … −3 durchgehend (auch über die Einmündung), Fahrbahn der Nebenstrasse erst ab y = −5
  const fbT = flaeche('Strasse_Weg', [lv(-200, -3), lv(200, -3), lv(200, 3), lv(-200, 3)])
  const neben = flaeche('Strasse_Weg', [lv(-2.5, -5), lv(2.5, -5), lv(2.5, -200), lv(-2.5, -200)])
  const trottoir = flaeche('Trottoir', [lv(-200, -5), lv(200, -5), lv(200, -3), lv(-200, -3)])
  it('ohne Häkchen: B ab der Trottoirhinterkante (y −5): D (0,75; −8), Annahme', () => {
    const e = rechne(osm(), [fbT, neben, trottoir])
    expect(e.trottoir).not.toBeNull()
    expect(e.trottoir!.breite).toBeCloseTo(2, 1)
    expect(e.trottoir!.frei).toBe(false)
    nahe(e.rand, 1.25, -3)
    nahe(e.nullpunkt, 1.25, -5, 0.06)
    nahe(e.D, 0.75, -8, 0.06)
    expect(e.nullpunktText).toBe('Trottoirhinterkante')
    expect(e.annahmen.join(' | ')).toContain('Zwischen Zufahrt und Vortrittsstrasse liegt ein Trottoir')
  })
  it('Häkchen «Trottoir ohne Hindernisse»: B ab der Bordkante (y −3): D (0,75; −6)', () => {
    const e = rechne(osm(), [fbT, neben, trottoir], { eingaben: eg({ trottoirFrei: true }) })
    expect(e.trottoir!.frei).toBe(true)
    nahe(e.nullpunkt, 1.25, -3)
    nahe(e.D, 0.75, -6)
    expect(e.nullpunktText).toBe('Bordkante (Trottoir ohne Hindernisse)')
    expect(e.annahmen.some(a => a.includes('liegt ein Trottoir'))).toBe(false)
  })
  it('ohne Trottoir in der AV: Häkchen ohne Wirkung, Grund genannt', () => {
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ trottoirFrei: true }) })
    expect(e.trottoir).toBeNull()
    expect(e.trottoirGrund).toContain('kein Trottoir')
    nahe(e.D, 0.75, -6)
    expect(e.hinweise.join(' ')).toContain('ohne Wirkung')
  })
  it('Haltelinie geht vor: B ab der Haltelinie auch mit Trottoir', () => {
    const e = rechne(osm(), [fbT, neben, trottoir], { eingaben: eg({ haltelinie: lv(1.25, -6) }) })
    nahe(e.D, 0.75, -9)
    expect(e.haltelinie!.vorverlegt).toBe(false)
    const v = rechne(osm(), [fbT, neben, trottoir], { eingaben: eg({ haltelinie: lv(1.25, -4) }) })
    expect(v.haltelinie!.vorverlegt).toBe(true)              // auf dem Trottoir: vor der Trottoirhinterkante
  })
})

describe('E2b: Tempo von Hand', () => {
  it('V85 40 km/h nach links: Tab. 1 35 … 50 m, Quelle mit Art und Begründung, Vorgabe bleibt sichtbar', () => {
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ tempo: { links: { art: 'v85', wert: 40, begruendung: 'Messung 2025' }, rechts: null } }) })
    const l = seite(e, 'links'), r = seite(e, 'rechts')
    expect([l.tempo, l.erforderlichUnten, l.erforderlichOben, l.tempoArt, l.tempoVorgabe]).toEqual([40, 35, 50, 'v85', 30])
    expect(l.tempoQuelle).toBe('von Hand: V85 (Messung 2025)')
    expect([r.tempo, r.tempoArt]).toEqual([30, null])
  })
  it('ohne OSM-Tempo: Annahme 50 km/h verschwindet für die Richtung mit Tempo von Hand', () => {
    const e = rechne(osm({ maxspeed: '' }), [fahrbahn], { eingaben: eg({ tempo: { links: null, rechts: { art: 'fahrbar', wert: 20, begruendung: '' } } }) })
    const t = e.annahmen.join(' | ')
    expect([t.includes('Tempo nach links: ohne Angabe in OSM'), t.includes('Tempo nach rechts')]).toEqual([true, false])
    expect(seite(e, 'rechts')).toMatchObject({ tempo: 20, tempoAnnahme: false, tempoQuelle: 'von Hand: fahrbares Tempo bei Verkehrsberuhigung' })
  })
})

describe('E2b: Grundstückzufahrt', () => {
  const arm = rechne(osm(), [fahrbahn, ecke])
  const vergleich = (g: Ergebnis) => {
    for (const k of ['D', 'Dachse', 'rand', 'nullpunkt'] as const) nahe(g[k], ...rel(arm[k]), 1e-6)
    expect([g.B, g.ausserorts, g.einbiegewinkel]).toEqual([arm.B, arm.ausserorts, arm.einbiegewinkel])
    for (const r of ['links', 'rechts'] as const) {
      const a = seite(arm, r), b = seite(g, r)
      nahe(b.K, ...rel(a.K), 1e-6)
      expect([b.tempo, b.massgebend, b.sMax, b.status, b.spur, b.bisEnde]).toEqual([a.tempo, a.massgebend, a.sMax, a.status, a.spur, a.bisEnde])
      expect(b.vorhanden).toBeCloseTo(a.vorhanden, 3)
      expect(b.sichtpunkte.length).toBe(a.sichtpunkte.length)
      b.sichtpunkte.forEach((p, i) => nahe(p, ...rel(a.sichtpunkte[i]), 1e-6))
      expect(b.verdecker?.name).toBe(a.verdecker?.name)
    }
  }
  it('Zufahrtspunkt auf der Achse des Arms am Rand (1,25; −3), senkrecht zum Rand: dieselbe Rechnung wie der Arm', () => {
    const r = rechneKnoten(osm(), [fahrbahn, ecke], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(1.25, -3), richtung: null } })
    expect(r.meldungen).toEqual([])
    const g = r.ergebnis!
    expect(r.knoten?.grundstueck).toBe(true)
    nahe(r.knoten!.p, 1.25, 0, 1e-6)                          // Knotenpunkt auf der Achse der Hauptstrasse
    expect([g.knoten, g.zufahrt, g.zufahrtName]).toEqual([null, 'grundstueck', 'Z Grundstückzufahrt (Süd)'])
    // Nummern: Zufahrt «Z», die Arme der Vortrittsstrasse im Uhrzeigersinn ab Norden (Ost 1, West 2)
    expect(r.knoten!.arme.map(a => `${a.nr} ${a.himmel}`)).toEqual(['1 Ost', '2 West', 'Z Süd'])
    expect(g.zufahrtspunkt).toMatchObject({ gezeichnet: false, weg: null, strasse: 'Hauptstrasse' })
    expect(g.zufahrtspunkt!.richtung[1]).toBeCloseTo(-1, 9)
    expect(Math.abs(seite(g, 'links').vorhanden - 24.6875)).toBeLessThan(0.1)
    vergleich(g)
  })
  it('Richtung mit zweitem Klick gezeichnet (nach Süden) und Klick 0,4 m neben dem Rand: dieselbe Rechnung', () => {
    const g = rechneKnoten(osm(), [fahrbahn, ecke], { knoten: null, zufahrt: null,
      zufahrtspunkt: { p: lv(1.25, -3.4), richtung: [0, -7] } }).ergebnis!
    expect(g.zufahrtspunkt!.gezeichnet).toBe(true)
    vergleich(g)
  })
  it('über einen OSM-Weg service (Einmündung bei x = 30): wie eine gezeichnete Zufahrt mit derselben Achse', () => {
    const x = osm()
    x.wege.push(weg(3, [[14, 30, 0], [30, 30, -40]], { highway: 'service', name: 'Hofzufahrt' }))
    const s = rechneKnoten(x, [fahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(30.5, -6), richtung: null } })
    expect(s.meldungen).toEqual([])
    const es = s.ergebnis!
    expect(es.zufahrtspunkt).toMatchObject({ weg: 3, gezeichnet: false })
    expect(es.zufahrtName).toBe('Z Hofzufahrt (OSM-Weg 3, service)')
    expect(s.knoten!.arme.map(a => `${a.nr} ${a.himmel}`)).toEqual(['2 West', '1 Ost', 'Z Süd'])
    nahe(s.knoten!.p, 30, 0, 1e-6)
    // gezeichnet am Rand (30; −3) nach Süden: gleiche Achse x = 30
    const gz = rechneKnoten(x, [fahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(30, -3), richtung: [0, -1] } }).ergebnis!
    nahe(es.D, 29.5, -6); nahe(gz.D, 29.5, -6)
    for (const r of ['links', 'rechts'] as const) {
      nahe(seite(es, r).K, ...rel(seite(gz, r).K), 1e-6)
      expect(seite(es, r).vorhanden).toBeCloseTo(seite(gz, r).vorhanden, 3)
    }
  })
  it('schiefe Zufahrt (55°) an einem am Knoten geteilten Weg: Knotenpunkt auf dem anschliessenden Weg, dieselbe Rechnung', () => {
    // Hauptstrasse aus zwei Wegen (West, Ost) mit gleichem Namen; Nebenstrasse nach Südwesten, 55° zur Hauptstrasse. Die Achse des
    // Zufahrtsstreifens liegt 1,25 m rechts des Fahrers (Südosten) und trifft die Strassenachse östlich des Knotens.
    const u: P = [-Math.cos(55 * Math.PI / 180), -Math.sin(55 * Math.PI / 180)], n: P = [-u[1], u[0]]
    const geteilt: OsmDaten = { ...osm(), wege: [
      weg(1, [[10, -200, 0], [12, 0, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30' }),
      weg(4, [[12, 0, 0], [13, 200, 0]], { highway: 'unclassified', name: 'Hauptstrasse', maxspeed: '30' }),
      weg(2, [[12, 0, 0], [20, 200 * u[0], 200 * u[1]]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' })] }
    const haupt = flaeche('Strasse_Weg', [lv(-200, -3), lv(200, -3), lv(200, 3), lv(-200, 3)])
    const neben = flaeche('Strasse_Weg', [lv(2.5 * n[0], 2.5 * n[1]), lv(200 * u[0] + 2.5 * n[0], 200 * u[1] + 2.5 * n[1]),
      lv(200 * u[0] - 2.5 * n[0], 200 * u[1] - 2.5 * n[1]), lv(-2.5 * n[0], -2.5 * n[1])])
    const a = rechne(geteilt, [haupt, neben, ecke])
    expect(a.einbiegewinkel).toBeCloseTo(55, 0)
    const g = rechneKnoten(geteilt, [haupt, neben, ecke], { knoten: null, zufahrt: null,
      zufahrtspunkt: { p: a.rand, richtung: [-a.fbRichtung[0], -a.fbRichtung[1]] } })
    expect(g.meldungen).toEqual([])
    const e = g.ergebnis!
    // Seit 31.10.2026 folgt die Achse der Knotenzufahrt in der Mündung dem rechten Rand (lageMuendung, höchstens 0,15 m je m) und ist
    // dort leicht gebogen; die Grundstückzufahrt bleibt eine Gerade. Bei 55° liegt D darum bis rund 0,2 m, K bis rund 0,8 m daneben (vorher 1 mm).
    nahe(e.D, ...rel(a.D), 0.3)
    expect(rel(g.knoten!.p)[0]).toBeGreaterThan(0)            // Knotenpunkt auf dem Ostweg
    for (const r of ['links', 'rechts'] as const) {
      nahe(seite(e, r).K, ...rel(seite(a, r).K), 1.0)            // K: Schnitt mit der Spurachse, bei 55° bis rund 0,8 m
      expect(Math.abs(seite(e, r).vorhanden - seite(a, r).vorhanden)).toBeLessThan(1)
    }
  })
  it('OSM-Weg service parallel zur Strasse mit Einmündung weit weg: nicht übernommen, senkrecht mit Hinweis', () => {
    const x = osm()
    x.wege.push(weg(3, [[14, 30, 0], [31, 30, -6], [32, 120, -6]], { highway: 'service', service: 'parking_aisle' }))
    const e = rechneKnoten(x, [fahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(80, -3.2), richtung: null } }).ergebnis!
    expect(e.zufahrtspunkt!.weg).toBeNull()
    nahe(e.D, 79.5, -6, 0.3)
    expect(e.hinweise.join(' ')).toContain('Zufahrt senkrecht zum Rand gerechnet')
  })
  it('Meldungen: keine Strasse in der Nähe, Klick auf die Strassenachse', () => {
    expect(rechneKnoten(osm(), [fahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(60, -40), richtung: null } }).meldungen[0])
      .toContain('Keine Strasse')
    expect(rechneKnoten(osm(), [fahrbahn], { knoten: null, zufahrt: null, zufahrtspunkt: { p: lv(60, 0.2), richtung: null } }).meldungen[0])
      .toContain('auf der Strassenachse')
  })
  it('Schlüssel des Zufahrtspunkts: LV95 auf 0,1 m, lesbar aus der Adresse', () => {
    expect(zufahrtspunktKey([2600123.44, 1200456.66])).toBe('2600123.4,1200456.7')
    expect(zufahrtspunktLesen('2600123.4,1200456.7')).toEqual([2600123.4, 1200456.7])
    expect(zufahrtspunktLesen('7.4,46.9')).toBeNull()
    expect(zufahrtspunktLesen(null)).toBeNull()
  })
})

describe('Lage von Hand: Halte- oder Wartelinie', () => {
  it('quer zur Achse: gleiche Rechnung wie gesetzt, die Linie bleibt seitlich an der gezogenen Stelle', () => {
    // Mitte (2,25; −4), längs nach Osten: Schnitt mit der Achse x = 1,25 bei y = −4, also 1 m hinter der Kante y = −3
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ haltelinie: lv(2.25, -4), halteRichtung: [1, 0] }) })
    const h = e.haltelinie!
    nahe(h.p, 1.25, -4); nahe(h.mitte, 2.25, -4); nahe(h.quer[0], 0.75, -4); nahe(h.quer[1], 3.75, -4)
    expect([h.hand, Math.round(h.winkel)]).toEqual([true, 0])
    expect(h.abstand).toBeCloseTo(1, 6)
    nahe(e.Dachse, 1.25, -7)
    expect(e.hinweise.some(t => t.includes('schräg'))).toBe(false)
  })
  it('gedreht: B ab dem Schnitt mit der Achse, Hinweis als Annahme', () => {
    // Mitte (2,25; −5), 45° nach Nordosten: die Linie trifft die Achse x = 1,25 bei y = −6; B 3,00 m dahinter: Dachse y = −9
    const r = Math.SQRT1_2
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ haltelinie: lv(2.25, -5), halteRichtung: [r, r] }) })
    nahe(e.haltelinie!.p, 1.25, -6)
    expect(e.haltelinie!.abstand).toBeCloseTo(3, 6)
    expect(e.haltelinie!.winkel).toBeCloseTo(45, 4)
    nahe(e.Dachse, 1.25, -9)
    expect(e.hinweise.some(t => t.includes('45° schräg') && t.includes('Annahme'))).toBe(true)
  })
  it('parallel zur Achse: nicht gerechnet, B ab der Kante', () => {
    const e = rechne(osm(), [fahrbahn], { eingaben: eg({ haltelinie: lv(2.25, -4), halteRichtung: [0, 1] }) })
    expect(e.haltelinie).toBeNull()
    expect(e.hinweise.some(t => t.includes('trifft die Zufahrtsachse nicht'))).toBe(true)
    nahe(e.Dachse, 1.25, -6)
  })
})

describe('Lage von Hand: Fahrzeuge', () => {
  it('F_B gedreht: nur die Darstellung, D, Dachse und die Sicht bleiben', () => {
    // nach Osten gedreht: Bezugspunkt 0,5 m rechts von D (0,75; −6), also (0,75; −6,5)
    const ohne = rechne(osm(), [fahrbahn, ecke])
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ fbRichtung: [1, 0] }) })
    expect([e.fbHand, e.fbRichtung]).toEqual([true, [1, 0]])
    nahe(e.D, 0.75, -6); nahe(e.Dachse, 1.25, -6); nahe(e.fbDachse!, 0.75, -6.5)
    expect(e.richtungen.map(r => [r.vorhanden, r.status])).toEqual(ohne.richtungen.map(r => [r.vorhanden, r.status]))
  })
  it('F_A von Hand: seitlicher Versatz verschiebt die Fahrlinie, die Prüfung rechnet darauf und weist es aus', () => {
    const ohne = rechne(osm(), [fahrbahn, ecke])
    const o = seite(ohne, 'links')
    const yAchse = o.K[1] - lv(0, 0)[1]
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ faHand: { links: { mitte: lv(-30, yAchse + 1), richtung: [1, 0] }, rechts: null } }) })
    const r = seite(e, 'links')
    expect(r.fahrlinieHand!.versatz).toBeCloseTo(-1, 1)
    expect(r.fahrlinieHand!.randVorgabe).toBeCloseTo(o.randAbstand, 5)
    expect(r.randAbstand).toBeCloseTo(o.randAbstand + 1, 1)
    expect(r.K[1] - o.K[1]).toBeCloseTo(1, 1)
    expect(r.faHand!.seitlich).toBeCloseTo(1, 1)
    expect(r.statusZusatz).toContain('Fahrlinie von Hand')
    expect(r.erforderlichUnten).toBe(o.erforderlichUnten)
    expect(r.vorhanden).toBeGreaterThan(o.vorhanden)        // weiter weg von der Gebäudeecke: die Sicht wird länger
    expect(seite(e, 'rechts').fahrlinieHand).toBeUndefined()
    const h = e.hinweise.find(t => t.startsWith('F_A'))!
    expect(h).toContain('weiter weg vom rechten Fahrbahnrand')
    expect(h).toContain('Grosse Abweichung')
    // näher am Rand
    const n = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ faHand: { links: { mitte: lv(-30, yAchse - 0.3), richtung: [1, 0] }, rechts: null } }) })
    expect(seite(n, 'links').randAbstand).toBeCloseTo(o.randAbstand - 0.3, 1)
    expect(n.hinweise.find(t => t.startsWith('F_A'))).toContain('näher am rechten Fahrbahnrand')
  })
  it('F_A von Hand: längs verschoben und gedreht ändert die Rechnung nicht, die Sichtlinie auf die Front wird geprüft', () => {
    // Front (−27,75; y der Achse): auf der berechneten Fahrlinie
    const ohne = rechne(osm(), [fahrbahn, ecke])
    const o = seite(ohne, 'links')
    const yAchse = o.K[1] - lv(0, 0)[1]
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ faHand: { links: { mitte: lv(-30, yAchse), richtung: [1, 0.2] }, rechts: null } }) })
    const r = seite(e, 'links')
    expect(r.fahrlinieHand).toBeUndefined()
    expect(r.faHand!.seitlich).toBe(0)
    expect(r.statusZusatz).not.toContain('Fahrlinie von Hand')
    expect([r.status, r.vorhanden, r.randAbstand]).toEqual([o.status, o.vorhanden, o.randAbstand])
    expect(seite(e, 'rechts').faHand ?? null).toBeNull()
    expect(e.hinweise.some(t => t.startsWith('F_A') && t.includes('ohne Wirkung auf die Rechnung'))).toBe(true)
  })
  it('F_B seitlich von Hand: die Zufahrtsachse wandert parallel, D, K und der Nullpunkt folgen, B bleibt, ausgewiesen', () => {
    const ohne = rechne(osm(), [fahrbahn, ecke])
    // Zufahrt von Süden: die fahrende Person schaut nach Norden, links ist Westen
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ zufahrtVersatz: 1 }) })
    expect(e.zufahrtVersatz).toBe(1)
    expect(e.D[0] - ohne.D[0]).toBeCloseTo(-1, 2)
    expect(e.D[1] - ohne.D[1]).toBeCloseTo(0, 2)
    expect(e.nullpunkt[0] - ohne.nullpunkt[0]).toBeCloseTo(-1, 2)
    expect(seite(e, 'rechts').K[0] - seite(ohne, 'rechts').K[0]).toBeCloseTo(-1, 2)
    expect(e.B).toBe(ohne.B)
    expect(e.Dhand).toBe(false)
    expect(e.Dlage.laengs).toBeCloseTo(ohne.Dlage.laengs, 5)
    expect(seite(e, 'rechts').statusZusatz).toContain('Zufahrt von Hand')
    expect(e.hinweise.some(t => t.startsWith('Zufahrtsachse von Hand 1,00 m nach links'))).toBe(true)
    // nach rechts
    const r = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ zufahrtVersatz: -0.5 }) })
    expect(r.D[0] - ohne.D[0]).toBeCloseTo(0.5, 2)
    expect(ohne.zufahrtVersatz ?? null).toBeNull()
  })
  it('Velo von Hand: die Veloachse wird parallel versetzt, die Velo-Prüfung rechnet darauf und weist es aus', () => {
    const ohne = rechne(osm(), [fahrbahn, ecke])
    const o = seite(ohne, 'links').velo!
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ veloHand: { links: 1, rechts: null } }) })
    const v = seite(e, 'links').velo!
    expect(v.veloHand).toEqual({ versatz: 1, randVorgabe: o.randAbstand })
    expect(v.randAbstand).toBeCloseTo(o.randAbstand + 1, 5)
    // Verkehr von links fährt nach Osten, sein rechter Rand liegt im Süden: weg vom Rand = nach Norden
    expect(v.K[1] - o.K[1]).toBeCloseTo(1, 1)
    expect(v.A).toBe(o.A)
    expect(v.lageText).toContain('von Hand 1,00 m weiter weg vom Rand')
    expect(seite(e, 'rechts').velo?.veloHand).toBeUndefined()
    // Hinweis bei der Richtung (wie die übrigen Hinweise zum Velo dieser Richtung)
    expect(seite(e, 'links').hinweise.some(t => t.startsWith('Veloachse von Hand 1,00 m weiter weg vom Rand'))).toBe(true)
    // unter 5 cm: ohne Wirkung
    expect(seite(rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ veloHand: { links: 0.02, rechts: null } }) }), 'links').velo?.veloHand).toBeUndefined()
  })
  it('F_A von Hand mit freier Sicht', () => {
    const e = rechne(osm(), [fahrbahn, ecke], { eingaben: eg({ faHand: { links: null, rechts: { mitte: lv(30, 1.5), richtung: [-1, 0] } } }) })
    expect(seite(e, 'rechts').faHand!.verdecker).toBeNull()
  })
})
