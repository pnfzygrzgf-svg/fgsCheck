// Tests Bedarfsmodul E0: je Regel die Testfälle aus Bedarfsmodul_E0_Regeln.md Abschnitt 3 (Grundfall S0 und Grenzfälle), über den
// ganzen Baum (beurteile); dazu die Normbeispiele als Testanker (40 240 Abb. 1, 40 241 Tab. 1/2, HB LSA Rundungen).
import { describe, expect, it } from 'vitest'
import { beurteile } from './entscheid'
import { fall, S0, TESTFAELLE, type Testfall } from './testfaelle'
import { formelSicht, sollSichtOhneVortritt } from './sichtOhneVortritt'
import { gelbZulaessig, rundeBern } from './lsaZeiten'
import { AHS_40240, TAB2_40241, ahs, sichtFgs, sichtKurveTab2 } from './tabellen'
import { SICHTWEITE, KURVE_SICHTWEITE } from '../rechner/tempo'
import { KATALOG } from './katalog'
import type { Befund } from './typen'

function pruefeFall(t: Testfall, b: Befund): void {
  for (const [id, erw] of Object.entries(t.erwartet)) {
    const e = b.alle.filter(x => x.id === id)
    if (erw === '-') { expect(e, `${id} ohne Eintrag`).toEqual([]); continue }
    expect(e.length, `${id} genau ein Eintrag`).toBe(1)
    if (erw === 'offen') expect(e[0].zustand, `${id} offen`).toBe('offen')
    else {
      expect(e[0].zustand, `${id} verletzt`).toBe('verletzt')
      expect(e[0].staerke, `${id} Stärke`).toBe(erw)
    }
  }
  for (const [id, s] of Object.entries(t.soll ?? {})) expect(b.alle.find(x => x.id === id)?.soll ?? '', `${id} Soll`).toContain(s)
  for (const [id, s] of Object.entries(t.ist ?? {})) expect(b.alle.find(x => x.id === id)?.ist ?? '', `${id} Ist`).toContain(s)
  if (t.empfehlung) expect(b.empfehlung.typ).toBe(t.empfehlung)
}

describe('Grundfall S0', () => {
  it('ohne Bern: Typ Q1, in Recht und Norm nur D2c (Insel anstreben; Stärke aus dem Katalog), nichts offen', () => {
    const b = beurteile(fall())
    expect(b.beurteilt).toBe(true)
    expect(b.zulaessigkeit).toBe('zulaessig')
    expect(b.empfehlung).toMatchObject({ typ: 'Q1', elemente: ['Fussgängerstreifen'] })
    expect(b.alle.map(x => `${x.id}:${x.staerke}`)).toEqual([`D2c:${KATALOG.D2c.staerke}`])
    expect(b.norm.verletzungen.length + b.norm.bericht.length + b.norm.offen.length).toBe(0)
    expect(b.empfehlung.vorlaeufig).toBe(false)
    expect(b.lokal).toEqual({ verletzungen: [], bericht: [], empfehlungen: [], hinweise: [], offen: [] })
    expect(b.annahmen).toEqual([])
  })
  it('H1 in S0: V85 48 nachgewiesen → Stufe 50, Soll 55 m, vorhanden 70 m', () => {
    const z = beurteile(fall()).masse.find(m => m.groesse === 'Sichtweite (Fussgängerstreifen)')!
    expect(z).toMatchObject({ soll: '≥ 55', ist: '70,0 / 70,0', zustand: 'erfuellt' })
  })
  it('mit Bern: zusätzlich D6-2 weich (Inseltabelle Ja) und D6-3b Hinweis (LSA-Tabelle Ja oder nein), getrennt im Teil lokal', () => {
    const b = beurteile(fall(), { ebenen: { bern: true } })
    expect(b.lokal.empfehlungen.map(x => x.id)).toEqual(['D6-2'])
    expect(b.lokal.hinweise.map(x => x.id)).toEqual(['D6-3b'])
    expect(b.alle.filter(x => x.ebene === 'Norm').map(x => x.id)).toEqual(['D2c'])
    expect(b.lokal.empfehlungen[0].normHinweis).toContain('8,50 m')
  })
})

describe('Regeln je Testfall (Abschnitt 3)', () => {
  for (const t of TESTFAELLE) {
    it(`${t.regel}: ${t.name}`, () => pruefeFall(t, beurteile(fall(t.abw), { ebenen: t.ebenen })))
  }
})

describe('Normbeispiele und Tabellen', () => {
  it('40 240 Abb. 1: 50 km/h und 7 m ≈ 81 m, 30 km/h und 6 m ≈ 42 m (Formel mit 1,2 m/s)', () => {
    expect(formelSicht(50, 7, 1.2)).toBeCloseTo(81.0, 1)
    expect(formelSicht(30, 6, 1.2)).toBeCloseTo(41.7, 1)
    expect(sollSichtOhneVortritt(50, 3.5, 1.2)).toBe(55)      // Anhaltesichtweite massgebend (K5)
  })
  it('Anhaltesichtweite 40 240 Z. 8.2: Stufen und Zwischenwerte nach oben, getrennt von Tab. 1 (P18)', () => {
    expect(AHS_40240).toEqual({ 20: 15, 30: 25, 40: 40, 50: 55, 60: 75 })
    expect([ahs(20), ahs(25), ahs(48), ahs(60), ahs(70)]).toEqual([15, 25, 55, 75, 75])
    expect(SICHTWEITE[20]).toBe(25)                            // Tab. 1 der App bei 20 km/h (MP), nicht die AHS
  })
  it('40 241 Tab. 1: Sicht 0,1 m unter dem Soll ist hart, auf dem Soll kein Befund', () => {
    for (const v of [30, 40, 50, 60]) {
      const s = sichtFgs(v)
      const b = (sicht: number) => beurteile(fall({ vSig: v, v85: v, sichtVorh: [sicht, 80] }))
      expect(b(s - 0.1).alle.find(x => x.id === 'H1')?.staerke, `${v} km/h`).toBe('hart')
      expect(b(s).alle.find(x => x.id === 'H1'), `${v} km/h`).toBeUndefined()
    }
  })
  it('40 241 Tab. 2: je Radius knapp darunter hart; bei 20 m gilt der bfu-Wert 24 m (wie tempo.ts) mit Normhinweis 30 m', () => {
    const soll: Record<number, number> = { 20: 24, 25: 35, 30: 40, 35: 45, 40: 50 }
    for (const [r, s] of Object.entries(soll).map(([r, s]) => [Number(r), s])) {
      expect(sichtKurveTab2(r)).toEqual({ sicht: s, norm: TAB2_40241[r] })
      const b = beurteile(fall({ kurve: { radius: r, radiusStrasse: r, fuenfBedingungen: true }, sichtVorh: [s - 0.1, 80] }))
      const h1 = b.alle.find(x => x.id === 'H1')
      expect(h1?.staerke, `Radius ${r}`).toBe('hart')
      if (r === 20) expect(h1?.normHinweis).toContain('30 m')
      else expect(h1?.normHinweis).toBeUndefined()
    }
    expect(TAB2_40241[20]).toBe(30)                            // Normwert bleibt als Referenz
    for (const [r, s] of KURVE_SICHTWEITE) if (r >= 20) expect(sichtKurveTab2(r)?.sicht).toBe(s)
    expect(sichtKurveTab2(22)).toEqual({ sicht: 35, norm: 35 })
    expect(sichtKurveTab2(19)).toBeNull()
  })
  it('Kurvenregel nur innerorts bei 50 km/h (29.10.2026): sonst gilt Tab. 1 trotz «ja» zu den fünf Voraussetzungen', () => {
    const h2 = (abw: Record<string, unknown>) => beurteile(fall({ kurve: { radius: 25, radiusStrasse: 25, fuenfBedingungen: true }, sichtVorh: [36, 36], ...abw })).alle.find(x => x.id === 'H2')
    expect(h2({})?.zustand).toBe('verletzt')                   // Weiche: Sicht nach Radius
    expect(h2({ vSig: 30 })).toBeUndefined()
    expect(h2({ vSig: 60 })).toBeUndefined()
    // ausserorts endet der Baum vorher; die Regel selbst greift dort nicht
    const b = beurteile(fall({ kurve: { radius: 25, radiusStrasse: 25, fuenfBedingungen: true }, sichtVorh: [36, 36], vSig: 30 }))
    expect(b.alle.find(x => x.id === 'H1')?.soll ?? '').not.toContain('Tab. 2')
  })
  it('VSS 40 837 Z. 16 Gelb: ab- und aufgerundet zulässig (L 12 → 6 oder 7 s), begrenzt auf 2 bis 8 s (L 2 → 2, L 18 → 8)', () => {
    const W = KATALOG.I1.werte
    expect([2, 9, 12, 18].map(L => gelbZulaessig(L, W.anteil, W.gehV, W.min, W.max))).toEqual([[2], [5], [6, 7], [8]])
    // unabhängiger Anker: 2/3 · 12 / 1,2 = 6,67 s → 6 (abgerundet) und 7 (aufgerundet) erfüllen, 5 und 8 nicht
    const gelb = (g: number) => beurteile(fall({ typ: 'lsa', lsaZeiten: { ...fall().lsaZeiten.wert!, L: 12, gelb: g, freigabe: 8 } }))
      .alle.some(x => x.id === 'I1')
    expect([5, 6, 7, 8].map(gelb)).toEqual([true, false, false, true])
  })
  it('AH BE 5.3.2 markierte Insel: Fahrbahn 7,5 bis 8,4 m, Fahrstreifen je 3,0 m, Insel mindestens 1,5 m', () => {
    const b = (B: number, d: number, i: number) => beurteile(fall({ fahrbahnB: B, insel: { vorhanden: true, art: 'markiert', breite: i, kopfUeberstand: null, vertikal: null, kopfErhoeht: null, pfostenH: null, furt: null }, durchfahrt: [d, d] }), { ebenen: { kantonBE: true } })
      .alle.find(x => x.id === 'F3-M')?.staerke ?? '-'
    expect([b(7.5, 3, 1.5), b(8.4, 3, 2.4), b(7.4, 3, 1.4), b(8.4, 2.9, 2.6), b(8.5, 3.25, 2)]).toEqual(['-', '-', 'weich', 'weich', 'hinweis'])
  })
  it('HB LSA Rundungen: Gelb 5,49 → 5, 5,50 → 6 (Schwelle 0,5); Mindestfreigabe 5,09 → 5, 5,10 → 6 (Schwelle 0,1)', () => {
    expect([rundeBern(5.49, 0.5), rundeBern(5.5, 0.5), rundeBern(5.09, 0.1), rundeBern(5.1, 0.1)]).toEqual([5, 6, 5, 6])
    expect(rundeBern(12.24 * 0.5 / 1.2, 0.1)).toBe(6)          // Beispielrechnung Kap. 24.3
  })
  it('E0-2: fehlt V85, gilt vSig als Annahme (E3), sonst kein Ersatzwert', () => {
    const b = beurteile(fall({ typ: 'furt', v85: null }))
    expect(b.annahmen.some(a => a.startsWith('V85 fehlt'))).toBe(true)
    const leer = beurteile(fall({ dtv: null }))
    expect(leer.alle.find(x => x.id === 'C4')).toMatchObject({ zustand: 'offen', fehlend: ['dtv'] })
  })
  it('Grundfall S0 entspricht der Beschreibung in Abschnitt 3', () => {
    expect(S0).toMatchObject({ vSig: 50, v85: 48, dtv: 8000, fg5h: 250, fahrbahnB: 7, nRichtung: [1, 1], streifenBreite: 4, sichtVorh: [70, 70], erkennungM: 120 })
  })
})
