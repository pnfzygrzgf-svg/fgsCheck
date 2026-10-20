// Tests «Ecke runden» für Flächen (Plan) und Plausibilität der Ecken nach Plan-Flächen (Nutzerentscheid 20.10.2026).
// Künstlicher Knoten wie planflaechen.test.ts: Hauptstrasse West–Ost (Fahrbahn 8 m, y −4 bis 4), Übergang bei x = 0, Querweg nach
// Süden bei x = −40 (AV-Arm −43 bis −37); die gerade Zufahrt von Westen ist gestrichen, damit der Abbieger aus dem Querweg selbst
// geprüft wird.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { eckeRunden, eckeAmPunkt, eckeRadiusMax, echteEcken, boegen, eckeGrenze, eckeGrenzeText, RUNDEN_SCHRITT_M, RUNDEN_SCHRITT_GRAD } from './planflaechen'
import { rechneFall } from './index'
import { flaeche, segmentieren } from './poly'
import { planBogen } from './abbiegen'
import { Fahrbahn } from './flaechen'
import { avMitPlan } from './planflaechen'
import { leererFall, type Fall, type FlaechePlan } from '../fall'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rel = (p: P): P => [p[0] - O[0], p[1] - O[1]]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[...ring, ring[0]]] })
const d = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])
const ok = (r: ReturnType<typeof eckeRunden>) => { if (!r.ok) throw new Error(r.grund); return r }

describe('Ecke runden: Geometrie', () => {
  const quadrat = rechteck(0, 0, 20, 20)                      // Gegenuhrzeigersinn, Ecke 0 bei (0, 0)
  it('rechtwinklige konvexe Ecke: Tangentialpunkte, Radius, Schrittweite, Fläche', () => {
    const r = ok(eckeRunden(quadrat, 0, 6))
    expect(r.t).toBeCloseTo(6, 9)
    expect(r.innenGrad).toBeCloseTo(90, 9)
    expect(r.einspringend).toBe(false)
    const bogen = r.ring.slice(0, r.bogenPunkte)
    // Ring a -> Ecke -> b: Ecke 0 hat die Nachbarn (0, 20) davor und (20, 0) danach
    expect(rel(bogen[0])[0]).toBeCloseTo(0, 9); expect(rel(bogen[0])[1]).toBeCloseTo(6, 9)
    expect(rel(bogen[bogen.length - 1])[0]).toBeCloseTo(6, 9); expect(rel(bogen[bogen.length - 1])[1]).toBeCloseTo(0, 9)
    const c = lv(6, 6)
    for (const p of bogen) expect(d(p, c)).toBeCloseTo(6, 9)
    for (let i = 1; i < bogen.length; i++) {
      expect(d(bogen[i], bogen[i - 1])).toBeLessThanOrEqual(RUNDEN_SCHRITT_M + 1e-9)
      expect(2 * Math.asin(d(bogen[i], bogen[i - 1]) / 12) * 180 / Math.PI).toBeLessThanOrEqual(RUNDEN_SCHRITT_GRAD + 1e-9)
    }
    expect(r.ring.slice(r.bogenPunkte)).toEqual(quadrat.slice(1))
    // Fläche: Quadrat weniger (1 − π/4)·R² (Bogen als Sehnenzug: knapp darunter)
    expect(flaeche([[r.ring]])).toBeCloseTo(400 - (1 - Math.PI / 4) * 36, 1)
  })
  it('kleiner Radius: Schritte höchstens 10°', () => {
    const r = ok(eckeRunden(quadrat, 0, 1))
    expect(r.bogenPunkte).toBe(10)                            // 90° in 9 Schritten
  })
  it('einspringende Ecke (L-Form): Bogen füllt die Ecke, Fläche wächst', () => {
    // L: Ecke 3 bei (10, 10) einspringend
    const l = [lv(0, 0), lv(20, 0), lv(20, 10), lv(10, 10), lv(10, 20), lv(0, 20)]
    const r = ok(eckeRunden(l, 3, 4))
    expect(r.einspringend).toBe(true)
    expect(r.t).toBeCloseTo(4, 9)
    const bogen = r.ring.slice(3, 3 + r.bogenPunkte)
    expect(rel(bogen[0])[0]).toBeCloseTo(14, 9); expect(rel(bogen[0])[1]).toBeCloseTo(10, 9)
    expect(rel(bogen[bogen.length - 1])[0]).toBeCloseTo(10, 9); expect(rel(bogen[bogen.length - 1])[1]).toBeCloseTo(14, 9)
    for (const p of bogen) expect(d(p, lv(14, 14))).toBeCloseTo(4, 9)
    expect(flaeche([[r.ring]])).toBeCloseTo(300 + (1 - Math.PI / 4) * 16, 1)
    // auch im Uhrzeigersinn gezeichnet
    const lu = [...l].reverse(), iu = lu.findIndex(p => d(p, lv(10, 10)) < 1e-9)
    const ru = ok(eckeRunden(lu, iu, 4))
    expect(ru.einspringend).toBe(true)
    expect(flaeche([[ru.ring]])).toBeCloseTo(flaeche([[r.ring]]), 6)
  })
  it('stumpfe Ecke: t = R / tan(θ/2)', () => {
    // Innenwinkel 120° an (0, 0)
    const w = 120 * Math.PI / 180
    const ring = [lv(20 * Math.cos(w), 20 * Math.sin(w)), lv(0, 0), lv(20, 0)]
    const r = ok(eckeRunden(ring, 1, 10))
    expect(r.innenGrad).toBeCloseTo(120, 9)
    expect(r.t).toBeCloseTo(10 / Math.tan(w / 2), 9)
    const c = lv(r.t, 10)
    for (const p of r.ring.slice(1, 1 + r.bogenPunkte)) expect(d(p, c)).toBeCloseTo(10, 9)
  })
  it('Kante zu kurz: Meldung mit dem grössten möglichen Radius, Ring unverändert', () => {
    const schmal = rechteck(0, 0, 20, 3)
    const vorher = JSON.stringify(schmal)
    const r = eckeRunden(schmal, 0, 6)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('Bogen mit 6,0 m passt nicht: er braucht 6,0 m auf beiden Kanten, die kürzere ist nur 3,0 m lang ' +
      '(Ecke 90,0° abgewinkelt). Höchstens 3,0 m möglich – kleineren Radius wählen bzw. die Nachbarecke weiter weg schieben.')
    expect(JSON.stringify(schmal)).toBe(vorher)
    // genau so lang wie die Kante: Tangentialpunkt = Nachbarecke, nicht doppelt
    const g = ok(eckeRunden(schmal, 0, 3))
    expect(g.ring.length).toBe(schmal.length - 1 + g.bogenPunkte)
    for (let i = 0; i < g.ring.length; i++) expect(d(g.ring[i], g.ring[(i + 1) % g.ring.length])).toBeGreaterThan(1e-3)
  })
  it('Bogen schnitte eine andere Kante (schmale L-Fläche): nicht gerundet', () => {
    // L mit 1 m breiten Schenkeln: der Bogen an der äusseren Ecke (0, 0) schneidet die inneren Kanten x = 1 und y = 1
    const l = [lv(0, 20), lv(0, 0), lv(20, 0), lv(20, 1), lv(1, 1), lv(1, 20)]
    const r = eckeRunden(l, 1, 6)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('Bogen mit 6,0 m schnitte eine andere Kante der Fläche (Selbstüberschneidung) – kleineren Radius ' +
      'wählen bzw. die Fläche anpassen.')
    expect(ok(eckeRunden(l, 1, 0.5)).ring.length).toBe(l.length - 1 + 10)
  })
  it('gerade Ecke bzw. Spitze nicht rundbar', () => {
    const r = eckeRunden([lv(0, 0), lv(10, 0.01), lv(20, 0), lv(10, 10)], 1, 6)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toContain('fast gerade')
  })
  it('grösster Radius je Ecke (eckeRadiusMax), Nutzerfall Plan-Fläche 2 (Fall vom 20.10.2026)', () => {
    const ring: P[] = [[2598400.383, 1198756.944], [2598419.3733028388, 1198747.952998549], [2598417.227660549, 1198743.4746331398], [2598416.375, 1198743.605], [2598416.2523870626, 1198744.37721936], [2598416.159488811, 1198744.8274985915], [2598416.0256227897, 1198745.2673410173], [2598415.8519208706, 1198745.6930276563], [2598415.6398517485, 1198746.1009592176], [2598415.3912085225, 1198746.4876865342], [2598415.1080935355, 1198746.8499397268], [2598414.792900598, 1198747.1846558505], [2598414.448294748, 1198747.489004794], [2598414.077189717, 1198747.7604132085], [2598413.6827232945, 1198747.9965862653], [2598413.268230796, 1198748.19552706], [2598409.877139924, 1198749.6352446727], [2598403.207, 1198753.135]]
    expect([0, 1, 2, 3].map(i => eckeRadiusMax(ring, i))).toEqual([1.1, 4.9, 1.1, 1.0])
    // passt genau bis dahin: mit dem Höchstwert gerundet, 0,1 m mehr abgelehnt (Meldung nennt denselben Wert)
    for (const i of [0, 1, 2, 3]) {
      const r = eckeRadiusMax(ring, i)!
      expect(eckeRunden(ring, i, r).ok).toBe(true)
      const z = eckeRunden(ring, i, r + 0.1)
      expect(z.ok).toBe(false)
      if (!z.ok) expect(z.grund).toContain(`Höchstens ${r.toFixed(1).replace('.', ',')} m möglich`)
    }
    expect(eckeRadiusMax(quadrat, 0)).toBe(20)
    expect(eckeRadiusMax([lv(0, 0), lv(10, 0.01), lv(20, 0), lv(10, 10)], 1)).toBeNull()
  })
  it('echte Ecken, Bögen und Grenze (Nutzerfall Fall vom 20.10.2026)', () => {
    const plan1: P[] = [[2598412.122, 1198761.843], [2598411.4118987652, 1198760.5777138073], [2598418.4238862926, 1198758.1378364125], [2598418.8937231116, 1198757.9956149827], [2598419.3736135755, 1198757.8922771164], [2598419.860345436, 1198757.8285145275], [2598420.350660651, 1198757.8047540241], [2598420.8412771933, 1198757.8211546524], [2598421.3289110167, 1198757.877606631], [2598421.8102980424, 1198757.9737320873], [2598422.2822160046, 1198758.1088875846], [2598422.741506022, 1198758.2821684317], [2598423.185093739, 1198758.4924147364], [2598423.610009909, 1198758.7382191713], [2598424.0134102665, 1198759.0179363922], [2598424.392594565, 1198759.3296940534], [2598424.745024656, 1198759.6714053394], [2598425.0683414736, 1198760.0407829338], [2598425.360380829, 1198760.4353543299], [2598425.619187895, 1198760.8524783812], [2598425.8430302935, 1198761.2893629798], [2598427.265, 1198764.369], [2598422.424, 1198760.724], [2598419.542, 1198760.181], [2598416.208, 1198760.837]]
    const plan2: P[] = [[2598400.383, 1198756.944], [2598419.3733028388, 1198747.952998549], [2598417.227660549, 1198743.4746331398], [2598416.375, 1198743.605], [2598416.2523870626, 1198744.37721936], [2598416.159488811, 1198744.8274985915], [2598416.0256227897, 1198745.2673410173], [2598415.8519208706, 1198745.6930276563], [2598415.6398517485, 1198746.1009592176], [2598415.3912085225, 1198746.4876865342], [2598415.1080935355, 1198746.8499397268], [2598414.792900598, 1198747.1846558505], [2598414.448294748, 1198747.489004794], [2598414.077189717, 1198747.7604132085], [2598413.6827232945, 1198747.9965862653], [2598413.268230796, 1198748.19552706], [2598409.877139924, 1198749.6352446727], [2598403.207, 1198753.135]]
    // Anzeige-Nummern = Index + 1: Plan-Fläche 2 Ecken 1–4 und 18, Bogen 5–16 (gerundet); Plan-Fläche 1 Ecken 1, 2, 22–24, Bogen 3–21
    expect(echteEcken(plan2)).toEqual([0, 1, 2, 3, 17])
    expect(boegen(plan2)).toEqual([[4, 15]])
    expect(echteEcken(plan1)).toEqual([0, 1, 21, 22, 23])
    expect(boegen(plan1)).toEqual([[2, 20]])
    // Ecke 2 von Plan-Fläche 2: höchstens 4,9 m, begrenzt durch Ecke 3 (5,0 m), 1,6 m danach beginnt der Bogen
    const g = eckeGrenze(plan2, 1)!
    expect([g.rMax, g.nachbar, Number(g.kanteM.toFixed(2)), g.bogen, Number(g.bogenNachM!.toFixed(1))]).toEqual([4.9, 2, 4.97, [4, 15], 1.6])
    expect(eckeGrenzeText(plan2, 1)).toBe('Ecke 3 liegt 5,0 m entfernt; für mehr Radius Ecke 3 verschieben (1,6 m danach beginnt der Bogen der Punkte 5–16).')
    expect(eckeGrenzeText(plan2, 3)).toBe('Die Kante bis zum Bogen der Punkte 5–16 ist nur 0,8 m lang; für mehr Radius Ecke 4 weiter vom Bogen weg schieben.')
    // Fangen nur auf echte Ecken: ein Klick auf einen Bogenpunkt trifft keine Ecke
    expect(eckeAmPunkt(plan2, plan2[8], 0.3, echteEcken(plan2))).toBeNull()
    expect(eckeAmPunkt(plan2, plan2[1], 0.3, echteEcken(plan2))).toBe(1)
  })
  it('Ecke am Klick fangen', () => {
    expect(eckeAmPunkt(quadrat, lv(19, 1), 2)).toBe(1)
    expect(eckeAmPunkt(quadrat, lv(10, 10), 2)).toBeNull()
  })
})

// Knoten mit Querweg bei x = −40; die AV-Fahrbahn hat eine weite Abschrägung (20 m Schenkel) in der Ecke (−37, −4), eine Fläche
// (Plan) Trottoir legt den geplanten Rand
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -200, 0], [11, -40, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const avMitEcke = (ecke: P[]): AvFlaeche[] => [
  av('Strasse_Weg', [lv(-200, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), ...ecke, lv(200, -4), lv(200, 4), lv(-200, 4)]),
  av('Trottoir', rechteck(-200, 4, 200, 7)), av('Trottoir', rechteck(-37 + 20, -7, 200, -4))]
const AV_FASE = avMitEcke([lv(-37, -24), lv(-17, -4)])
// Ecke als grobe Abschrägung (wenige Punkte): der Kreisfit liest rund 40 m
const GROB: P[] = [lv(-37, -24), lv(-36.5, -20), lv(-21, -4.5), lv(-17, -4)]
const QUADRAT = [lv(-37, -4), lv(-10, -4), lv(-10, -40), lv(-37, -40)]
const fallMit = (f: (x: Fall) => void): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }

function abbieger(avL: AvFlaeche[], plan: FlaechePlan[]) {
  const r0 = rechneFall(OSM, avL, [], 12, fallMit(() => {}), null).streifen[0]
  const g = r0.zufahrten.find(z => z.art !== 'abbiegend' && z.richtung === 0)!
  const s = rechneFall(OSM, avL, [], 12, fallMit(x => {
    x.zufahrten[`${r0.fgsId}|${g.kennung}`] = { streichen: true }; if (plan.length) x.flaechenPlan = plan
  }), null).streifen[0]
  const a = s.zufahrten.filter(z => z.art === 'abbiegend')
  expect(a.length).toBe(1)
  return a[0]
}

describe('Plausibilität der Ecken nach Plan-Flächen', () => {
  it('Ecke nach Plan-Fläche über 23,5 m: Abbiegeradius geschätzt, keine «prüfen»-Meldung', () => {
    const z = abbieger(AV_FASE, [{ id: 'plan-1', art: 'trottoir', ring: [lv(-37, -40), ...GROB, lv(-10, -4), lv(-10, -40)] }])
    expect(z.radiusQuelle).toBe('geschätzt (Ecke nach Plan-Fläche 1 (Trottoir) fast gerade gezeichnet: Bogen 40,0 m)')
    expect(z.annahmen).toContain('Ecke nach Plan-Fläche 1 (Trottoir) fast gerade gezeichnet (Bogen 40,0 m): Abbiegeradius geschätzt – ' +
      'den geplanten Radius mit «Ecke runden» festlegen')
    expect(z.annahmen.some(a => a.startsWith('AV-Ecke prüfen') || a.startsWith('Abbiegeradius geschätzt (keine'))).toBe(false)
    expect(z.kurvenradiusM!).toBeLessThan(10)
  })
  it('dieselbe Ecke in der AV (ohne Plan-Fläche): wie bisher gerechnet, «AV-Ecke prüfen»', () => {
    const z = abbieger(avMitEcke(GROB), [])
    expect([z.kurvenradiusM, z.radiusQuelle]).toEqual([41.5, 'AV-Bordkante 40,0 m + 1,5 m'])
    expect(z.annahmen).toContain('AV-Ecke prüfen: Bordkante 40,0 m')
  })
})

describe('Eckradius auf einem gerundeten Plan-Bogen', () => {
  for (const R of [6, 12]) it(`Trottoir-Ecke mit R = ${R} m gerundet: Bordkante ${R} m + 1,5 m`, () => {
    const r = ok(eckeRunden(QUADRAT, 0, R))
    const z = abbieger(AV_FASE, [{ id: 'plan-1', art: 'trottoir', ring: r.ring }])
    expect(z.radiusQuelle).toBe(`Bordkante nach Plan-Fläche 1 (Trottoir) von Hand ${R},0 m + 1,5 m`)
    expect(z.kurvenradiusM).toBe(R + 1.5)
    expect(z.annahmen.some(a => /prüfen|geschätzt/.test(a))).toBe(false)
  })
})

describe('Grosse Radien mit «Ecke runden» (23,5 bis 30 m): gelten wie geplant (Prüfbefund M1)', () => {
  // weite Abschrägung in der AV (40 m Schenkel), Fläche (Plan) Trottoir bis x = 5 deckt sie; Ecke (−37, −4) gerundet
  const avWeit = avMitEcke([lv(-37, -44), lv(3, -4)])
  const gross = [lv(-37, -4), lv(5, -4), lv(5, -60), lv(-37, -60)]
  for (const R of [25, 30]) it(`R = ${R} m: Bordkante ${R} m + 1,5 m, nicht «fast gerade», ohne «prüfen»`, () => {
    const r = ok(eckeRunden(gross, 0, R))
    const z = abbieger(avWeit, [{ id: 'plan-1', art: 'trottoir', ring: r.ring }])
    expect(z.radiusQuelle).toBe(`Bordkante nach Plan-Fläche 1 (Trottoir) von Hand ${R},0 m + 1,5 m`)
    expect(z.kurvenradiusM).toBe(R + 1.5)
    expect(z.annahmen.some(a => /prüfen|geschätzt|fast gerade/.test(a))).toBe(false)
  })
})

describe('Scharfe Ecke nach Plan-Fläche', () => {
  it('Radiusquelle «Ecke nach Plan-Fläche … von Hand 0,0 m + 1,5 m»', () => {
    const z = abbieger(AV_FASE, [{ id: 'plan-1', art: 'trottoir', ring: QUADRAT }])
    expect(z.radiusQuelle).toBe('Ecke nach Plan-Fläche 1 (Trottoir) von Hand 0,0 m + 1,5 m')
  })
})

describe('Bogen nach Plan-Fläche aus den Ringecken (planBogen)', () => {
  // Kreisfit über Bogen und gerade Nachbarkante (wie im Nutzerfall Könizstrasse: 6 m gerundet, gelesen 9,0 m): planBogen liest
  // den Bogen aus den Ringecken der Fläche (Plan)
  const r = ok(eckeRunden(QUADRAT, 0, 6))
  const fb = new Fahrbahn(avMitPlan(AV_FASE, [{ id: 'plan-1', art: 'trottoir', ring: r.ring }]).av)
  const bogenRing = r.ring.slice(0, r.bogenPunkte)          // von (−37, −10) nach (−31, −4)
  const gelesen = segmentieren([lv(-37, -17), ...bogenRing], 0.25)   // Bogen mit 7 m gerader Kante davor
  it('Bogen der Ecke: Radius 6 m, Mitte, Punkte nur auf dem Bogen', () => {
    const pb = planBogen(fb, gelesen, lv(-40, 0), [1, 0], [0, -1], 4, 3)!
    expect(pb[0]).toBeCloseTo(6, 6)
    expect(d(pb[1], lv(-31, -10))).toBeLessThan(1e-6)
    for (const p of pb[2]) expect(d(p, lv(-31, -10))).toBeLessThan(6 + 1e-6)
    expect(Math.min(...pb[2].map(p => rel(p)[1]))).toBeCloseTo(-10, 6)
  })
  it('Bogen einer anderen Ecke (Tangente weit neben der Achse des Arms): nicht genommen', () => {
    // Knoten 20 m weiter westlich: die Bordkante des Bogens liegt 23 m neben der Achse des Arms
    expect(planBogen(fb, gelesen, lv(-60, 0), [1, 0], [0, -1], 4, 3)).toBeNull()
    // Arm in anderer Richtung als die Bogentangente
    expect(planBogen(fb, gelesen, lv(-40, 0), [1, 0], [Math.SQRT1_2, -Math.SQRT1_2], 4, 3)).toBeNull()
  })
  it('ohne Fläche (Plan) bzw. AV-Bogen: nichts', () => {
    expect(planBogen(new Fahrbahn(AV_FASE), gelesen, lv(-40, 0), [1, 0], [0, -1], 4, 3)).toBeNull()
  })
})
