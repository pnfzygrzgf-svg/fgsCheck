// Tests Grundprüfung nach bfu MS.013-2025 (Big Five, Katalog Gruppe B5): Schwellen jeder Regel an beiden Seiten, Aufrunden der
// Tempo- und Radiusstufen, Knoten nach Tab. 1, Busstreifen, offene Fälle, Querungstypen ohne Grundprüfung, Sicht aus dem
// Sichtrechner je Zufahrt. Grundfall S0 (testfaelle.ts): FGS innerorts, 50 km/h, V85 48, Sicht 70 m, ohne Insel auf 7,00 m.
import { describe, expect, it } from 'vitest'
import { GRUND_IDS, NUR_FGS_TEXT, grundpruefung, sollKnoten, sollTempo, type GrundOptionen, type GrundSicht, type GrundTeil,
  type Grundpruefung } from './grundpruefung'
import { bfuDurchfahrtOk } from './durchfahrt'
import { KATALOG, type GrundId } from './katalog'
import { fall, INSEL_OK, type Abw } from './testfaelle'
import { KURVE_SICHTWEITE, SICHTWEITE } from '../rechner/tempo'
import { GRUND_FELDER, feldVon } from './felder'

/** gesehene Regeln mit Befund (verletzt bzw. Hinweis) für die Abdeckung */
const gesehen = new Set<string>()
function gp(abw: Abw = {}, o: GrundOptionen = {}): Grundpruefung {
  const g = grundpruefung(fall(abw), o)
  for (const p of g.punkte) for (const t of [...p.teile, ...p.notizen]) if (t.zustand === 'verletzt' || t.zustand === 'hinweis') gesehen.add(t.id)
  for (const t of g.weitere) if (t.zustand === 'verletzt' || t.zustand === 'hinweis') gesehen.add(t.id)
  return g
}
const teil = (g: Grundpruefung, id: GrundId): GrundTeil | undefined =>
  [...g.punkte.flatMap(p => [...p.teile, ...p.notizen]), ...g.weitere].find(t => t.id === id)
/** Zustand und Stärke einer Regel: «erfuellt», «offen», «hinweis», «hart», «weich» bzw. «-» (nicht anwendbar) */
const z = (g: Grundpruefung, id: GrundId): string => {
  const t = teil(g, id)
  return !t ? '-' : t.zustand === 'verletzt' ? t.staerke! : t.zustand
}
const punkt = (g: Grundpruefung, nr: string) => g.punkte.find(p => p.nr === nr)!
const INSEL = (x: Partial<typeof INSEL_OK>) => ({ ...INSEL_OK, ...x })
const sicht = (x: Partial<GrundSicht> = {}): GrundSicht =>
  ({ name: 'Zufahrt Ost', tempo: 50, soll: 55, quelle: 'VSS Tab. 1', frei: true, status: 'frei', ...x })

describe('Grundprüfung: Grundfall und Geltungsbereich', () => {
  it('Grundfall: gilt; Tempo, ①, ③, ④, ⑤ erfüllt, ② Hinweis (ohne Insel auf 7,00 m); feste Hinweise; weitere Punkte erfüllt', () => {
    const g = gp()
    expect(g.gilt).toBe(true)
    expect(g.punkte.map(p => [p.nr, p.zustand])).toEqual([['T', 'erfuellt'], ['1', 'erfuellt'], ['2', 'hinweis'], ['3', 'erfuellt'],
      ['4', 'erfuellt'], ['5', 'erfuellt']])
    expect(punkt(g, '4').notizen.map(t => [t.id, t.zustand])).toEqual([['B5-4b', 'hinweis']])
    expect(punkt(g, '5').notizen.map(t => t.id)).toEqual(['B5-5b'])
    expect(g.weitere.map(t => [t.id, t.zustand])).toEqual([['B5-W1', 'erfuellt'], ['B5-W2', 'erfuellt']])
    expect(teil(g, 'B5-1')).toMatchObject({ ist: '70 m (kleinste von 2, Zufahrt 1)', soll: '≥ 55 m' })
    expect(teil(g, 'B5-1')!.quelle).toBe('bfu MS.013:2025 Ziff. 2.1, 2.2 Tab. 1')
    expect(g.annahmen).toEqual([])
  })
  it.each([['furt'], ['ohne_vortritt'], ['lsa'], ['trottoirueberfahrt'], ['mehrzweck']] as const)('Querungstyp %s: statt der Punkte ein Satz', typ => {
    const g = gp({ typ })
    expect(g.gilt).toBe(false)
    expect(g.punkte).toEqual([])
    expect(g.grund).toContain(NUR_FGS_TEXT)
  })
  it('Fussgängerstreifen mit Lichtsignal (fgsMitLsa) gilt nicht; Querungstyp offen: geprüft mit Annahme', () => {
    expect(gp({ fgsMitLsa: true }).gilt).toBe(false)
    expect(gp({ fgsMitLsa: true }).grund).toContain('mit Lichtsignal')
    const g = gp({ typ: null })
    expect(g.gilt).toBe(true)
    expect(g.annahmen.join(' ')).toContain('Querungstyp offen')
  })
  it('jede Regel der Grundprüfung ist implementiert und kommt in den Testfällen als Befund vor; ihre Eingaben stehen oben in der Maske', () => {
    const b5 = (Object.keys(KATALOG) as GrundId[]).filter(id => KATALOG[id].gruppe === 'B5')
    expect([...GRUND_IDS].sort()).toEqual([...b5].sort())
    for (const id of b5) for (const f of KATALOG[id].eingaben) expect(GRUND_FELDER.map(feldVon), `${id}: ${f}`).toContain(f.split('.')[0])
  })
})

describe('Tempo (Vorbedingung, B5-T)', () => {
  it('signalisiert bzw. V85 über 60 km/h hart; 60 erfüllt', () => {
    expect(z(gp({ vSig: 60, v85: 60 }), 'B5-T')).toBe('erfuellt')
    expect(z(gp({ vSig: 61, v85: 50 }), 'B5-T')).toBe('hart')
    expect(z(gp({ vSig: 50, v85: 61 }), 'B5-T')).toBe('hart')
    expect(teil(gp({ vSig: 50, v85: 61 }), 'B5-T')!.ist).toBe('V85 61 km/h')
  })
  it('V85 fehlt: offen mit «V85 messen» und Normhinweis; über 60 signalisiert trotzdem hart; vSig fehlt: offen bzw. hart nach V85', () => {
    const t = teil(gp({ v85: null }), 'B5-T')!
    expect(t.zustand).toBe('offen')
    expect(t.fehlend).toEqual(['v85'])
    expect(t.detail).toContain('V85 messen')
    expect(t.normHinweis).toContain('C1')
    expect(z(gp({ v85: null, vSig: 80 }), 'B5-T')).toBe('hart')
    expect(teil(gp({ vSig: null, v85: 50 }), 'B5-T')).toMatchObject({ zustand: 'offen', fehlend: ['vSig'] })
    expect(z(gp({ vSig: null, v85: 65 }), 'B5-T')).toBe('hart')
  })
})

describe('① Sichtverhältnisse (B5-1, B5-1b)', () => {
  it('Stufen nach Tempo: Zwischenwerte auf die nächsthöhere Stufe; ausserorts 60 km/h 100 m; über 60 keine Stufe', () => {
    expect([20, 30, 31, 40, 41, 50, 51, 60].map(v => sollTempo(v)!.soll)).toEqual([25, 25, 40, 40, 55, 55, 75, 75])
    expect(sollTempo(61)).toBeNull()
    expect(sollTempo(60, false)!.soll).toBe(100)
    expect(sollTempo(50, false)!.soll).toBe(55)
    // gleiche Werte wie VSS 40 241 Tab. 1 der Sichtprüfung (30 bis 60 km/h)
    for (const v of [30, 40, 50, 60]) expect(sollTempo(v)!.soll).toBe(SICHTWEITE[v])
  })
  it('Knoten nach Tab. 1: Radius 5/10/15/20 m → 10/15/20/24 m, Zwischenwerte zur nächst grösseren Stufe; wie die Sichtprüfung', () => {
    expect([2, 5, 5.1, 10, 12, 15, 19, 20].map(r => sollKnoten(r)!.soll)).toEqual([10, 10, 15, 15, 20, 20, 24, 24])
    expect(sollKnoten(20.1)).toBeNull()
    for (const [r, sw, q] of KURVE_SICHTWEITE) if (q === 'bfu') expect(sollKnoten(r)!.soll).toBe(sw)
  })
  it('Sicht von Hand: kleinste Zufahrt massgebend, Schwelle an beiden Seiten (V85 48 → 55 m)', () => {
    expect(z(gp({ sichtVorh: [55, 70] }), 'B5-1')).toBe('erfuellt')
    const g = gp({ sichtVorh: [70, 54.9] })
    expect(z(g, 'B5-1')).toBe('hart')
    expect(teil(g, 'B5-1')!.ist).toContain('Zufahrt 2')
    expect(punkt(g, '1')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
  })
  it('Stufe nach V85, nicht nach dem signalisierten Tempo (Normhinweis bei abweichender Stufe); V85 fehlt: signalisiert als Annahme', () => {
    const tief = gp({ v85: 40, sichtVorh: [40] })              // 40 km/h → 40 m, signalisiert 50 → 55 m
    expect(z(tief, 'B5-1')).toBe('erfuellt')
    expect(teil(tief, 'B5-1')!.normHinweis).toContain('signalisierten Tempo (55 m)')
    expect(z(gp({ v85: 41, sichtVorh: [54] }), 'B5-1')).toBe('hart')
    expect(z(gp({ v85: 55, sichtVorh: [70] }), 'B5-1')).toBe('hart')    // V85 55 → 75 m
    const ohne = gp({ v85: null, sichtVorh: [55] })
    expect(z(ohne, 'B5-1')).toBe('erfuellt')
    expect(ohne.annahmen.join(' ')).toContain('V85 fehlt')
    expect(teil(gp({ v85: 61, sichtVorh: [100] }), 'B5-1')!.zustand).toBe('offen')   // über 60 keine Stufe
    expect(z(gp({ innerorts: false, v85: 60, vSig: 60, sichtVorh: [80] }), 'B5-1')).toBe('hart')   // ausserorts 100 m
  })
  it('Knoten von Hand: unter dem Knoten-Soll verletzt, ab dem Soll nach V85 erfüllt, dazwischen offen (Zuordnung der Zufahrt offen)', () => {
    const k = (radius: number, s: number[], abw: Abw = {}) => gp({ kurve: { radius, fuenfBedingungen: false }, sichtVorh: s, ...abw })
    expect(z(k(12, [19.9, 70]), 'B5-1')).toBe('hart')                   // unter 20 m (Radius 12 → Stufe 15)
    expect(z(k(12, [20, 70]), 'B5-1')).toBe('offen')                    // 20 m genügt nur für die Abbiegelinie
    expect(teil(k(12, [20, 70]), 'B5-1')!.detail).toContain('Zuordnung Zufahrt zur Abbiegelinie offen')
    expect(z(k(12, [54.9, 70]), 'B5-1')).toBe('offen')
    expect(z(k(12, [55, 70]), 'B5-1')).toBe('erfuellt')                 // alle ab 55 m (V85 48)
    expect(teil(k(12, [55]), 'B5-1')!.soll).toBe('20 bis 55 m')
    expect(teil(k(12, [55]), 'B5-1')!.normHinweis).toContain('(H4)')
    expect(teil(k(20, [55]), 'B5-1')!.normHinweis).toContain('(H2)')      // Radius genau 20 m: nicht H4
    expect(z(k(20, [23.9]), 'B5-1')).toBe('hart')
    expect(z(k(25, [24]), 'B5-1')).toBe('hart')                          // über 20 m: 55 m nach V85
    // Knoten ohne Tempo: unter dem Knoten-Soll trotzdem verletzt, sonst offen (fehlt vSig)
    expect(z(k(12, [10], { v85: null, vSig: null }), 'B5-1')).toBe('hart')
    expect(teil(k(12, [80], { v85: null, vSig: null }), 'B5-1')).toMatchObject({ zustand: 'offen', fehlend: ['vSig'] })
  })
  it('Stufe 60 km/h ohne Angabe innerorts: nicht stillschweigend 75 m; unter 75 verletzt, ab 100 erfüllt, dazwischen offen (innerorts)', () => {
    const h = (s: number, abw: Abw = {}) => gp({ innerorts: null, vSig: 60, v85: 58, sichtVorh: [s], ...abw })
    expect(z(h(74.9), 'B5-1')).toBe('hart')
    expect(teil(h(75), 'B5-1')).toMatchObject({ zustand: 'offen', fehlend: ['innerorts'], soll: '75 bis 100 m' })
    expect(teil(h(99.9), 'B5-1')!.zustand).toBe('offen')
    expect(z(h(100), 'B5-1')).toBe('erfuellt')
    expect(z(h(75, { innerorts: true }), 'B5-1')).toBe('erfuellt')
    expect(z(h(99.9, { innerorts: false }), 'B5-1')).toBe('hart')
    expect(z(h(55, { v85: 50 }), 'B5-1')).toBe('erfuellt')                 // Stufe 50: innerorts ohne Belang
    // Erkennungsdistanz ebenso: unter 150 verletzt, ab 200 erfüllt
    expect(z(gp({ innerorts: null, vSig: 60, v85: 58, erkennungM: 149 }), 'B5-1b')).toBe('weich')
    expect(z(gp({ innerorts: null, vSig: 60, v85: 58, erkennungM: 150 }), 'B5-1b')).toBe('offen')
    expect(z(gp({ innerorts: null, vSig: 60, v85: 58, erkennungM: 200 }), 'B5-1b')).toBe('erfuellt')
    // Sichtrechner: frei auf 75 m offen (fehlt innerorts), verdeckt auf 75 m verletzt
    const r = (frei: boolean) => gp({ innerorts: null, vSig: 60, v85: 58, sichtVorh: null }, { sicht: [sicht({ tempo: 60, soll: 75, frei, status: frei ? 'frei' : 'verdeckt' })] })
    expect(teil(r(true), 'B5-1')).toMatchObject({ zustand: 'offen', fehlend: ['innerorts'] })
    expect(z(r(false), 'B5-1')).toBe('hart')
    // Abbieger auf eine 60-km/h-Querstrasse (Tempo-Sichtweite): wie gerade Zufahrten, ohne V85 der Querung (Nachprüfung 20.10.2026)
    const ab = (innerorts: boolean | null) => gp({ innerorts, vSig: 50, v85: 48, sichtVorh: null },
      { sicht: [sicht({ tempo: 60, soll: 75, abbiegend: true, frei: true })] })
    expect(teil(ab(null), 'B5-1')).toMatchObject({ zustand: 'offen', fehlend: ['innerorts'], soll: '75 bis 100 m' })
    expect(z(ab(true), 'B5-1')).toBe('erfuellt')
    expect(teil(ab(false), 'B5-1')).toMatchObject({ zustand: 'offen', soll: '≥ 100 m' })
    // Knoten mit offenem Tempo der geraden Zufahrten: Soll mit Vermerk
    expect(teil(gp({ kurve: { radius: 12, fuenfBedingungen: false }, v85: null, vSig: null, sichtVorh: [80] }), 'B5-1')!.soll)
      .toBe('≥ 20 m (gerade Zufahrten offen)')
  })
  it('Sicht aus dem Sichtrechner je Zufahrt: frei erfüllt, verdeckt hart; Stufe nach V85 nur bei der Tempo-Sichtweite gerader Zufahrten', () => {
    const r = (abw: Abw, s: GrundSicht[]) => gp({ sichtVorh: null, ...abw }, { sicht: s })
    expect(teil(r({}, [sicht(), sicht({ name: 'Zufahrt West' })]), 'B5-1')).toMatchObject({ zustand: 'erfuellt', ist: '2 von 2 Zufahrten frei', soll: '≥ 55 m' })
    const v = r({}, [sicht(), sicht({ name: 'Zufahrt West', frei: false, status: 'verdeckt (Parkfeld)' })])
    expect(z(v, 'B5-1')).toBe('hart')
    expect(teil(v, 'B5-1')!.detail).toContain('Zufahrt West: verdeckt (Parkfeld) innerhalb 55 m')
    // V85 55 km/h → 75 m: frei auf 55 m genügt nicht (offen), verdeckt auf 55 m ist verletzt
    expect(teil(r({ v85: 55 }, [sicht()]), 'B5-1')).toMatchObject({ zustand: 'offen', fehlend: ['sichtVorh'] })
    expect(z(r({ v85: 55 }, [sicht({ frei: false, status: 'verdeckt' })]), 'B5-1')).toBe('hart')
    // V85 35 km/h → 40 m: frei erfüllt, verdeckt innerhalb 55 m offen (ob 40 m frei sind, nicht getrennt geprüft)
    expect(z(r({ v85: 35 }, [sicht()]), 'B5-1')).toBe('erfuellt')
    expect(z(r({ v85: 35 }, [sicht({ frei: false, status: 'verdeckt' })]), 'B5-1')).toBe('offen')
    // Knoten (bfu-Kurvensichtweite) bzw. Abbieger: Soll des Sichtrechners bleibt, auch mit hoher V85
    expect(z(r({ v85: 55 }, [sicht({ soll: 15, quelle: 'bfu' })]), 'B5-1')).toBe('erfuellt')
    expect(z(r({ v85: 55 }, [sicht({ soll: 55, abbiegend: true })]), 'B5-1')).toBe('erfuellt')
    // nur bis zur Reichweite der Daten geprüft
    expect(z(r({}, [sicht({ bisM: 40 })]), 'B5-1')).toBe('offen')
    // V85 fehlt: Tempo der Zufahrt, als Annahme
    expect(r({ v85: null }, [sicht()]).annahmen.join(' ')).toContain('V85 fehlt')
    // weder Sicht von Hand noch Sichtrechner: offen
    expect(teil(gp({ sichtVorh: null }), 'B5-1')).toMatchObject({ zustand: 'offen', fehlend: ['sichtVorh'] })
  })
  it('Erkennungsdistanz: unter dem Doppelten weich, Schwelle an beiden Seiten; unter der Sichtweite mit Normhinweis H3a; fehlt: offen', () => {
    expect(z(gp({ erkennungM: 110 }), 'B5-1b')).toBe('erfuellt')
    expect(z(gp({ erkennungM: 109 }), 'B5-1b')).toBe('weich')
    expect(teil(gp({ erkennungM: 109 }), 'B5-1b')!.normHinweis).toBeUndefined()
    expect(teil(gp({ erkennungM: 50 }), 'B5-1b')!.normHinweis).toContain('H3a')
    expect(teil(gp({ erkennungM: null }), 'B5-1b')).toMatchObject({ zustand: 'offen', fehlend: ['erkennungM'] })
    expect(punkt(gp({ erkennungM: null }), '1').zustand).toBe('offen')
    expect(punkt(gp({ erkennungM: 100 }), '1')).toMatchObject({ zustand: 'verletzt', staerke: 'weich' })
  })
})

describe('② Fussgängerschutzinsel (B5-2a, B5-2b, B5-2c)', () => {
  it('ohne Insel: über 8,50 m weich, bis 8,50 m Hinweis; Normhinweis D2 ab 8,50 m; Fahrbahn fehlt: offen', () => {
    expect(z(gp({ fahrbahnB: 8.51 }), 'B5-2a')).toBe('weich')
    expect(z(gp({ fahrbahnB: 8.5 }), 'B5-2a')).toBe('hinweis')
    expect(teil(gp({ fahrbahnB: 8.5 }), 'B5-2a')!.normHinweis).toContain('D2')
    expect(teil(gp({ fahrbahnB: 8.49 }), 'B5-2a')!.normHinweis).toBeUndefined()
    expect(teil(gp({ fahrbahnB: null }), 'B5-2a')).toMatchObject({ zustand: 'offen', fehlend: ['fahrbahnB'] })
    expect(teil(gp({ insel: null }), 'B5-2a')).toMatchObject({ zustand: 'offen', fehlend: ['insel'] })
    expect(z(gp({ insel: null }), 'B5-2b')).toBe('-')
  })
  it('nur markierte Insel gilt nicht als Schutzinsel', () => {
    const g = gp({ insel: INSEL({ art: 'markiert' }), fahrbahnB: 9 })
    expect(z(g, 'B5-2a')).toBe('weich')
    expect(teil(g, 'B5-2a')!.detail).toContain('nur markierte Insel')
    expect(z(g, 'B5-2b')).toBe('-')
  })
  it('Inseltiefe: unter 1,50 m hart, 1,50 bis unter 2,00 m weich, ab 2,00 m erfüllt; fehlt: offen', () => {
    expect(z(gp({ insel: INSEL({ breite: 1.49 }) }), 'B5-2b')).toBe('hart')
    expect(z(gp({ insel: INSEL({ breite: 1.5 }) }), 'B5-2b')).toBe('weich')
    expect(z(gp({ insel: INSEL({ breite: 1.99 }) }), 'B5-2b')).toBe('weich')
    expect(z(gp({ insel: INSEL({ breite: 2 }) }), 'B5-2b')).toBe('erfuellt')
    expect(teil(gp({ insel: INSEL({ breite: null }) }), 'B5-2b')).toMatchObject({ zustand: 'offen', fehlend: ['insel.breite'] })
    expect(z(gp({ insel: INSEL({}) }), 'B5-2a')).toBe('-')
  })
  it('Durchfahrt: 3,50 m (Toleranz bis 3,75 m wie F3) oder ab 4,50 m; dazwischen und darunter weich; je Seite; fehlt: offen', () => {
    expect(KATALOG['B5-2c'].werte.dTol).toBe(KATALOG.F3.werte.schmalMax)
    const d = (x: number[]) => z(gp({ insel: INSEL({}), durchfahrt: x }), 'B5-2c')
    expect([3.49, 3.5, 3.75, 3.76, 4.49, 4.5, 6].map(x => d([x, x]))).toEqual(['weich', 'erfuellt', 'erfuellt', 'weich', 'weich', 'erfuellt', 'erfuellt'])
    expect([3.49, 3.5, 3.75, 3.76, 4.49, 4.5].map(bfuDurchfahrtOk)).toEqual([false, true, true, false, false, true])
    const g = gp({ insel: INSEL({}), durchfahrt: [3.5, 4] })
    expect(teil(g, 'B5-2c')).toMatchObject({ zustand: 'verletzt', detail: 'Seite 2: 4,00 m' })
    // Normhinweis fallbezogen: F3 wertet nur 4,25 bis 4,50 m milder
    expect(teil(g, 'B5-2c')!.normHinweis).toBe('Norm: keine VSS-Norm nennt Durchfahrtsmasse.')
    expect(teil(gp({ insel: INSEL({}), durchfahrt: [3.4, 3.6] }), 'B5-2c')!.normHinweis).not.toContain('F3')
    expect(teil(gp({ insel: INSEL({}), durchfahrt: [4.3, 3.6] }), 'B5-2c')!.normHinweis).toContain('4,25 bis 4,50 m nur als Hinweis')
    expect(teil(gp({ insel: INSEL({}), durchfahrt: null }), 'B5-2c')).toMatchObject({ zustand: 'offen', fehlend: ['durchfahrt'] })
  })
  it('Zustand des Punkts: schlimmste Teilregel (hart vor weich)', () => {
    expect(punkt(gp({ insel: INSEL({ breite: 1.4 }), durchfahrt: [4, 4] }), '2')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
    expect(punkt(gp({ insel: INSEL({ breite: 1.8 }), durchfahrt: [3.6, 3.6] }), '2')).toMatchObject({ zustand: 'verletzt', staerke: 'weich' })
    expect(punkt(gp({ insel: INSEL({}), durchfahrt: [3.6, 3.6] }), '2').zustand).toBe('erfuellt')
  })
})

describe('③ Zweistreifigkeit (B5-3)', () => {
  it('mehr als ein Fahrstreifen je Richtung ohne Insel hart; mit baulicher Insel bzw. einem Fahrstreifen erfüllt; fehlt: offen', () => {
    expect(z(gp({ nRichtung: [1, 1] }), 'B5-3')).toBe('erfuellt')
    expect(z(gp({ nRichtung: [2, 1] }), 'B5-3')).toBe('hart')
    expect(teil(gp({ nRichtung: [2, 1] }), 'B5-3')!.normHinweis).toContain('D1')
    expect(z(gp({ nRichtung: [2, 2], insel: INSEL({}) }), 'B5-3')).toBe('erfuellt')
    expect(z(gp({ nRichtung: [2, 2], insel: INSEL({ art: 'markiert' }) }), 'B5-3')).toBe('hart')
    expect(teil(gp({ nRichtung: null }), 'B5-3')).toMatchObject({ zustand: 'offen', fehlend: ['nRichtung'] })
  })
  it('Busstreifen zählt als Fahrstreifen der Richtung (in nRichtung mitgezählt)', () => {
    const g = gp({ busspur: true, nRichtung: [2, 1] })
    expect(z(g, 'B5-3')).toBe('hart')
    expect(teil(g, 'B5-3')!.detail).toContain('Busstreifen mitgezählt')
  })
  it('Busstreifen vorhanden, aber höchstens ein Fahrstreifen angegeben: Hinweis «inkl. Busstreifen prüfen», nicht erfüllt', () => {
    const g = gp({ busspur: true, nRichtung: [1, 1] })
    expect(z(g, 'B5-3')).toBe('hinweis')
    expect(teil(g, 'B5-3')!.detail).toContain('inkl. Busstreifen prüfen')
    expect(teil(g, 'B5-3')!.normHinweis).toBeUndefined()
    expect(punkt(g, '3').zustand).toBe('hinweis')
    expect(z(gp({ busspur: false, nRichtung: [1, 1] }), 'B5-3')).toBe('erfuellt')
    expect(z(gp({ busspur: true, nRichtung: [1, 1], insel: INSEL({}) }), 'B5-3')).toBe('erfuellt')   // mit Insel gesichert
    expect(z(gp({ busspur: true, nRichtung: [2, 1] }), 'B5-3')).toBe('hart')
  })
})

describe('① Sicht aus dem Sichtrechner: geometrische Grenzen, Streifen ohne Zufahrt, gemischte Querung', () => {
  const r = (abw: Abw, s: GrundSicht[], o: GrundOptionen = {}) => gp({ sichtVorh: null, ...abw }, { sicht: s, ...o })
  it('geometrische Grenze: Soll = min(Tab. 1 nach V85, Grenze); verletzt nur sicher unterschritten, sonst offen', () => {
    const geb = (x: Partial<GrundSicht>) => sicht({ quelle: 'bis Gebäude', soll: 50, ...x })
    // V85 48 → 55 m, Grenze 50 m: Soll 50 m
    expect(teil(r({}, [geb({})]), 'B5-1')).toMatchObject({ zustand: 'erfuellt', soll: '≥ 50 m' })
    expect(z(r({}, [geb({ frei: false, status: 'verdeckt' })]), 'B5-1')).toBe('hart')
    // V85 35 → 40 m unter der Grenze 50 m: frei erfüllt, verdeckt innerhalb 50 m nicht sicher unter 40 m → offen
    expect(teil(r({ v85: 35 }, [geb({})]), 'B5-1')).toMatchObject({ zustand: 'erfuellt', soll: '≥ 40 m' })
    expect(z(r({ v85: 35 }, [geb({ frei: false, status: 'verdeckt' })]), 'B5-1')).toBe('offen')
    // Grenze genau auf dem Soll nach V85 (40 m): verdeckt verletzt
    expect(z(r({ v85: 35 }, [geb({ soll: 40, frei: false, status: 'verdeckt' })]), 'B5-1')).toBe('hart')
    for (const quelle of ['bis Wegende', 'bis Knoten (Strassenende)', 'bis Kreiselring'])
      expect(z(r({ v85: 35 }, [geb({ quelle, frei: false, status: 'verdeckt' })]), 'B5-1'), quelle).toBe('offen')
  })
  it('ein Fussgängerstreifen der Querung ohne Zufahrt: Sicht offen (verletzt bleibt verletzt)', () => {
    const g = r({}, [sicht()], { ohneZufahrt: ['Streifen 2'] })
    expect(teil(g, 'B5-1')).toMatchObject({ zustand: 'offen', ist: '1 von 2 Zufahrten frei' })
    expect(teil(g, 'B5-1')!.detail).toContain('Streifen 2: keine Zufahrt geprüft')
    expect(z(r({}, [], { ohneZufahrt: ['Streifen 1'] }), 'B5-1')).toBe('offen')
    expect(z(r({}, [sicht({ frei: false, status: 'verdeckt' })], { ohneZufahrt: ['Streifen 2'] }), 'B5-1')).toBe('hart')
  })
  it('Ist-Text: frei, aber zu kurz geprüft; Detail «Tempo-Stufe nach V85» nur mit geraden Zufahrten; Zahlen mit Komma', () => {
    expect(teil(r({ v85: 55 }, [sicht(), sicht({ name: 'West' })]), 'B5-1')!.ist).toBe('frei bis 55 m, nötig 75 m')
    expect(teil(r({ v85: 55 }, [sicht(), sicht({ name: 'West', soll: 75 })]), 'B5-1')!.ist).toBe('1 von 2 Zufahrten frei, 1 nur bis 55 m geprüft')
    expect(teil(r({ v85: 55 }, [sicht({ abbiegend: true })]), 'B5-1')!.detail).not.toContain('Tempo-Stufe nach V85')
    expect(teil(r({ v85: 55 }, [sicht()]), 'B5-1')!.detail).toContain('Tempo-Stufe nach V85 55 km/h')
    expect(teil(gp({ v85: 47.5 }), 'B5-T')!.ist).toBe('50 km/h signalisiert, V85 47,5 km/h')
    expect(teil(gp({ kurve: { radius: 12.5, fuenfBedingungen: false }, sichtVorh: [70] }), 'B5-1')!.detail).toContain('Kurvenradius 12,5 m')
  })
  it('gemischte Querung (Teilstreifen mit und ohne Vortritt): Grundprüfung gilt nicht, mit Satz', () => {
    const g = gp({ typ: null }, { gemischt: true })
    expect(g.gilt).toBe(false)
    expect(g.grund).toContain('teils Fussgängerstreifen, teils ohne Vortritt')
  })
  it('Annahme «Kurve» nur, wenn ein Kurvenradius eingeht', () => {
    const e = fall({})
    const mitAnnahme = { ...e, kurve: { wert: { radius: null, fuenfBedingungen: false }, quelle: 'annahme' as const } }
    expect(grundpruefung(mitAnnahme).annahmen.join(' ')).not.toContain('Kurve')
    const mitRadius = { ...e, kurve: { wert: { radius: 12, fuenfBedingungen: false }, quelle: 'annahme' as const } }
    expect(grundpruefung(mitRadius).annahmen.join(' ')).toContain('Kurve')
  })
  it('fester Hinweis Erkennbarkeit unter ①', () => {
    expect(punkt(gp(), '1').notizen.map(t => [t.id, t.zustand])).toEqual([['B5-1c', 'hinweis']])
    expect(punkt(gp(), '1').zustand).toBe('erfuellt')
  })
})

describe('④ Beleuchtung und ⑤ Fussgängerfrequenz (B5-4, B5-5)', () => {
  it('Beleuchtung fehlt hart, vorhanden erfüllt, Eingabe fehlt offen; Retroreflexion immer als Hinweis', () => {
    expect(z(gp({ beleuchtung: false }), 'B5-4')).toBe('hart')
    expect(z(gp({ beleuchtung: true }), 'B5-4')).toBe('erfuellt')
    expect(z(gp({ beleuchtung: null }), 'B5-4')).toBe('offen')
    expect(z(gp({ beleuchtung: null }), 'B5-4b')).toBe('hinweis')
    expect(punkt(gp({ beleuchtung: true }), '4').zustand).toBe('erfuellt')     // Hinweis ändert den Zustand nicht
  })
  it('unter 100 Querenden weich (Normhinweis C3b), 100 erfüllt; Schätzklasse; fehlt: offen; Forschung immer als Hinweis', () => {
    expect(z(gp({ fg5h: 99 }), 'B5-5')).toBe('weich')
    expect(teil(gp({ fg5h: 99 }), 'B5-5')!.normHinweis).toContain('C3b')
    expect(z(gp({ fg5h: 100 }), 'B5-5')).toBe('erfuellt')
    expect(z(gp({ fg5h: null, fgKlasse: '<100' }), 'B5-5')).toBe('weich')
    expect(z(gp({ fg5h: null, fgKlasse: '100-500' }), 'B5-5')).toBe('erfuellt')
    expect(teil(gp({ fg5h: null, fgKlasse: null }), 'B5-5')).toMatchObject({ zustand: 'offen', fehlend: ['fg5h', 'fgKlasse'] })
    expect(z(gp(), 'B5-5b')).toBe('hinweis')
  })
})

describe('Weitere bfu-Punkte (B5-W1, B5-W2, B5-W3)', () => {
  it('Fahrbahnhaltestelle (Ziff. 2.3): ohne bauliche Insel weich; mit Insel Durchfahrt rund 3,50 m (bis 3,75 m), sonst weich; fehlt offen', () => {
    const halt = (art: 'fahrbahn' | 'bucht' | null) => ({ art, lage: null, verdeckt: null, ueberholenUnterbunden: null })
    expect(z(gp({ haltestelle: halt('fahrbahn') }), 'B5-W3')).toBe('weich')
    expect(teil(gp({ haltestelle: halt('fahrbahn') }), 'B5-W3')!.quelle).toBe('bfu MS.013:2025 Ziff. 2.3')
    expect(z(gp({ haltestelle: halt('fahrbahn'), insel: INSEL({ art: 'markiert' }) }), 'B5-W3')).toBe('weich')
    const d = (x: number) => z(gp({ haltestelle: halt('fahrbahn'), insel: INSEL({}), durchfahrt: [x, 3.6] }), 'B5-W3')
    expect([3.49, 3.5, 3.75, 3.76, 4.5].map(d)).toEqual(['weich', 'erfuellt', 'erfuellt', 'weich', 'weich'])   // ohne Alternative ab 4,50 m
    expect(teil(gp({ haltestelle: halt('fahrbahn'), insel: INSEL({}), durchfahrt: null }), 'B5-W3')).toMatchObject({ zustand: 'offen', fehlend: ['durchfahrt'] })
    expect(teil(gp({ haltestelle: null }), 'B5-W3')).toMatchObject({ zustand: 'offen', fehlend: ['haltestelle'] })
    expect(z(gp({ haltestelle: halt('bucht') }), 'B5-W3')).toBe('-')
    expect(z(gp({ haltestelle: halt(null) }), 'B5-W3')).toBe('-')
    expect(KATALOG['B5-2c'].quellen.map(q => q.ziffer)).toEqual(['Ziff. 2.1'])
  })
  it('DTV unter 3000 Hinweis (Normhinweis C4), 3000 erfüllt, fehlt offen', () => {
    expect(z(gp({ dtv: 2999 }), 'B5-W1')).toBe('hinweis')
    expect(teil(gp({ dtv: 2999 }), 'B5-W1')!.normHinweis).toContain('C4')
    expect(z(gp({ dtv: 3000 }), 'B5-W1')).toBe('erfuellt')
    expect(z(gp({ dtv: null }), 'B5-W1')).toBe('offen')
  })
  it('Annäherungsbereich überfahrbar weich, sonst erfüllt, fehlt offen', () => {
    expect(z(gp({ annaeherungUeberfahrbar: true }), 'B5-W2')).toBe('weich')
    expect(z(gp({ annaeherungUeberfahrbar: false }), 'B5-W2')).toBe('erfuellt')
    expect(z(gp({ annaeherungUeberfahrbar: null }), 'B5-W2')).toBe('offen')
  })
  it('Abdeckung: jede Regel der Grundprüfung kam oben als Befund (verletzt bzw. Hinweis) vor', () => {
    expect(GRUND_IDS.filter(id => !gesehen.has(id))).toEqual([])
  })
})
