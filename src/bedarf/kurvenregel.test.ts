// Tests Kurvenregel (VSS 40 241 Z. 14, S. 7; 29.10.2026): fünf Voraussetzungen einzeln, Vorbelegung aus der Fahrlinie und dem Höhenmodell
// (künstliche Werte), alte Fall-Dateien, abgeleitet «anwendbar», H2 nur mit allen fünf ja.
import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import { kurveGeometrie, kurveProfilLinie, strassenKurve } from './kurvenregel'
import { kurvenregelVorbelegen } from './vorbelegung'
import { bedarfLesen, eingabenBilden, type Vorbelegung } from './fallBedarf'
import { leererFall } from '../fall'
import { beurteile } from './entscheid'
import { fall as tfall } from './testfaelle'
import { KURVE_BEDINGUNGEN } from './eingaben'

/** Fahrlinie: ab dem Streifen (0,0) gerade nach Westen über gerade m, dann ein Bogen (Radius r) um grad nach Süden */
function spur(gerade: number, r: number, grad: number): P[] {
  const pts: P[] = []
  for (let x = 0; x <= gerade; x += 1) pts.push([-x, 0])
  const c: P = [-gerade, -r]
  for (let a = 1; a <= grad; a += 1) { const w = (90 + a) * Math.PI / 180; pts.push([c[0] + r * Math.cos(w), c[1] + r * Math.sin(w)]) }
  return pts
}
const zuf = (sp: P[], x: Partial<ZufahrtErgebnis> = {}): ZufahrtErgebnis => ({ fgsId: 'f1', zufahrt: 'a90', art: 'abbiegend', spur: sp,
  sichtpunkte: [sp[0], sp[10]], kurvenradiusM: 20, sichtweite: 100, tempo: 50, tempoQuelle: 'OSM', fahrstreifenOsmN: 1, mehrstreifig: 0, ...x } as ZufahrtErgebnis)
const st = (z: ZufahrtErgebnis) => [{ zufahrten: [z] } as unknown as StreifenErgebnis]
function vor(z: ZufahrtErgebnis, innerorts: boolean | null = true, neigung: Record<string, { i: number | null; laenge: number }> | null = null,
  lage: string | null = null) {
  const w: Vorbelegung = innerorts === null ? {} : { innerorts: { wert: innerorts, quelle: 'osm', text: '' } }
  if (lage) w.lage = { wert: lage, quelle: 'osm', text: '' }
  const h: Record<string, string> = {}
  kurvenregelVorbelegen(st({ ...z, art: 'beide' }), leererFall(46.9, 7.4, null), w,
    neigung as never, (p, wert, quelle, text) => { w[p] = { wert, quelle, text } }, (p, t) => { h[p] = t })
  return { w, h }
}

describe('Kurvenregel: Geometrie der Fahrlinie', () => {
  it('Kurvenende und Richtungsänderung: 8 m gerade, dann 70° bzw. 40°', () => {
    const g70 = kurveGeometrie({ spur: spur(8, 20, 70), sichtpunkte: [[0, 0]] })!
    expect(g70.endeM).toBeGreaterThanOrEqual(8); expect(g70.endeM).toBeLessThanOrEqual(11)
    expect(Math.abs(g70.winkel - 70)).toBeLessThanOrEqual(4)
    expect(Math.abs(kurveGeometrie({ spur: spur(8, 20, 40), sichtpunkte: [[0, 0]] })!.winkel - 40)).toBeLessThanOrEqual(4)
    expect(kurveGeometrie({ spur: spur(40, 20, 0), sichtpunkte: [[0, 0]] })).toEqual({ endeM: null, winkel: 0, radius: null })
    // Profil: 50 m Fahrlinie ab dem Streifenrand
    const l = kurveProfilLinie({ spur: spur(30, 20, 90), sichtpunkte: [[0, 0]] })
    expect(l.length).toBe(11)
  })
  it('Strassenkurve: nur gerade Zufahrten, Richtungsänderung ab 60° innerhalb der Sichtweite, engste; Abbieger und Trottoirüberfahrt nie', () => {
    const a = zuf(spur(8, 30, 70), { art: 'beide', zufahrt: '0', sichtweite: 60 }), b = zuf(spur(8, 25, 90), { art: 'beide', zufahrt: '180', sichtweite: 60 })
    const k = strassenKurve([{ zufahrten: [a, b] } as unknown as StreifenErgebnis])!
    expect(k.z.zufahrt).toBe('180')
    expect(Math.abs(k.radius - 25)).toBeLessThanOrEqual(3)
    expect(strassenKurve([{ zufahrten: [zuf(spur(8, 20, 90), { sichtweite: 60 })] } as unknown as StreifenErgebnis])).toBeNull()   // Abbieger
    expect(strassenKurve([{ zufahrten: [zuf(spur(8, 30, 40), { art: 'beide', sichtweite: 60 })] } as unknown as StreifenErgebnis])).toBeNull()
    // Kurve erst hinter der Sichtweite: nicht
    expect(strassenKurve([{ zufahrten: [zuf(spur(50, 30, 90), { art: 'beide', sichtweite: 40 })] } as unknown as StreifenErgebnis])).toBeNull()
    expect(strassenKurve([{ zufahrten: [b], trottoirueberfahrt: true } as unknown as StreifenErgebnis])).toBeNull()
  })
})

describe('Kurvenregel: Vorbelegung der fünf Voraussetzungen', () => {
  it('innerorts 50 km/h, ein Fahrstreifen, Kurvenende 8 m, 70°, Gefälle 3 %: alle ja mit Quelle', () => {
    const { w, h } = vor(zuf(spur(6, 30, 70)), true, { 'f1|a90': { i: -3, laenge: 50 } })
    expect(KURVE_BEDINGUNGEN.map(u => w[`kurve.${u}`]?.wert)).toEqual([true, true, true, true, true])
    // Vortritt nicht aus den Daten: als Annahme (30.10.2026)
    expect(w['kurve.b1Innerorts50']).toMatchObject({ quelle: 'annahme' })
    expect(w['kurve.b1Innerorts50']!.text).toMatch(/vortrittsberechtigt angenommen/)
    expect(w['kurve.b2EinFahrstreifen']).toMatchObject({ quelle: 'osm' })
    expect(w['kurve.b3NachKurvenende']!.text).toMatch(/^Kurvenende \d+ m vor dem Streifen/)
    expect(w['kurve.b4Winkel60']!.text).toMatch(/rund (6[6-9]|7\d)°/)
    expect(w['kurve.b5Gefaelle5']!.text).toMatch(/^Längsneigung 3 % auf 50 m vor dem Streifen \(Höhenmodell swissALTI3D\)/)
    expect(h).toEqual({})
    expect(w['kurve.radiusStrasse']).toMatchObject({ quelle: 'rechnung' })
    expect(Math.abs((w['kurve.radiusStrasse']!.wert as number) - 30)).toBeLessThanOrEqual(3)
  })
  it('40°, zwei Fahrstreifen, 30 km/h, Kurvenende 20 m, Gefälle 7 %, ohne Höhenmodell', () => {
    const z = zuf(spur(20, 20, 70), { fahrstreifenOsmN: 2, tempo: 30 })
    const { w } = vor(z, true, { 'f1|a90': { i: 7, laenge: 50 } })
    expect([w['kurve.b1Innerorts50']?.wert, w['kurve.b2EinFahrstreifen']?.wert, w['kurve.b4Winkel60']?.wert, w['kurve.b5Gefaelle5']?.wert])
      .toEqual([false, false, true, false])
    // unter 60°: keine Strassenkurve, nichts vorbelegt
    expect(vor(zuf(spur(8, 20, 40))).w).toEqual({ innerorts: { wert: true, quelle: 'osm', text: '' } })
    const o = vor(z, true, null)
    expect(o.w['kurve.b3NachKurvenende']).toBeUndefined()
    expect(o.h['kurve.b3NachKurvenende']).toMatch(/^Kurvenende 2\d m vor dem Streifen \(Fahrlinie des Sichtrechners\): von Hand beurteilen/)
    expect(o.h['kurve.b5Gefaelle5']).toMatch(/^Höhenmodell nicht verfügbar/)
    expect(vor(zuf(spur(40, 20, 70))).w['kurve.b3NachKurvenende']?.wert).toBe(false)
    // Fahrstreifen ohne OSM: aus der Fahrbahnbreite, Annahme
    expect(vor(zuf(spur(8, 20, 70), { fahrstreifenOsmN: null })).w['kurve.b2EinFahrstreifen']).toMatchObject({ wert: true, quelle: 'annahme' })
    // innerorts offen: Frage offen mit Hinweis; ausserorts nein
    expect(vor(zuf(spur(8, 20, 70)), null).h['kurve.b1Innerorts50']).toMatch(/innerorts noch offen/)
    expect(vor(zuf(spur(8, 20, 70)), false).w['kurve.b1Innerorts50']?.wert).toBe(false)
  })
  it('Vortritt (30.10.2026): über die Zufahrt ohne Vortritt einer Kreuzung nein, sonst angenommen', () => {
    const b = vor(zuf(spur(6, 30, 70)), true, null, 'knoten_belastet').w['kurve.b1Innerorts50']!
    expect(b).toMatchObject({ wert: false, quelle: 'osm' })
    expect(b.text).toMatch(/^Streifen über die Zufahrt ohne Vortritt: keine vortrittsberechtigte Strasse/)
    expect(vor(zuf(spur(6, 30, 70)), true, null, 'knoten_berechtigt').w['kurve.b1Innerorts50']).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(vor(zuf(spur(6, 30, 70)), true, null, 'strecke').w['kurve.b1Innerorts50']).toMatchObject({ wert: true, quelle: 'annahme' })
  })
})

describe('Kurvenregel: alte Fall-Dateien und abgeleitet «anwendbar»', () => {
  it('fuenfBedingungen: ja → alle fünf ja (von Hand), nein → nichts', () => {
    const [b] = bedarfLesen({ felder: { 'kurve.fuenfBedingungen': { wert: true, quelle: 'hand' } } })
    expect(Object.keys(b!.felder).sort()).toEqual(KURVE_BEDINGUNGEN.map(u => `kurve.${u}`).sort())
    expect(Object.values(b!.felder).every(v => v.wert === true && v.quelle === 'hand')).toBe(true)
    const [c, h] = bedarfLesen({ felder: { 'kurve.fuenfBedingungen': { wert: false, quelle: 'hand' } } })
    expect([c, h]).toEqual([null, []])
  })
  it('anwendbar nur mit allen fünf ja; eine Annahme: nur Vorschlag; ein nein: nicht anwendbar; ohne Angaben Annahme (Sicht nach Tempo)', () => {
    const v = (q: Record<string, { wert: boolean; quelle: 'rechnung' | 'annahme' | 'osm' }>): Vorbelegung =>
      Object.fromEntries(Object.entries(q).map(([u, x]) => [`kurve.${u}`, { ...x, text: '' }]))
    const ja = Object.fromEntries(KURVE_BEDINGUNGEN.map(u => [u, { wert: true, quelle: 'rechnung' as const }]))
    expect(eingabenBilden({ 'kurve.radius': { wert: 25, quelle: 'rechnung', text: '' }, ...v(ja) }, null).eingaben.kurve.wert)
      .toMatchObject({ fuenfBedingungen: true })
    const anm = eingabenBilden(v({ ...ja, b2EinFahrstreifen: { wert: true, quelle: 'annahme' } }), null).eingaben.kurve
    expect([anm.wert?.fuenfBedingungen, anm.wert?.vorschlag, anm.quelle]).toEqual([false, true, 'annahme'])
    expect(eingabenBilden(v({ ...ja, b4Winkel60: { wert: false, quelle: 'rechnung' } }), null).eingaben.kurve.wert?.fuenfBedingungen).toBe(false)
    expect(eingabenBilden({}, null).eingaben.kurve).toMatchObject({ wert: { radius: null, fuenfBedingungen: false }, quelle: 'annahme' })
  })
  it('H2 nur mit allen fünf ja (abgeleitet), innerorts und 50 km/h', () => {
    const h2 = (k: Record<string, unknown>) => beurteile(tfall({ kurve: { radius: 25, radiusStrasse: 25, fuenfBedingungen: false, ...k }, sichtVorh: [36, 36] })).alle.find(x => x.id === 'H2')
    expect(h2({ fuenfBedingungen: true })?.zustand).toBe('verletzt')
    expect(h2({ fuenfBedingungen: false, vorschlag: true })).toBeUndefined()
    expect(h2({ fuenfBedingungen: false })).toBeUndefined()
    // ohne Strassenkurve (nur Abbiegeradius) bzw. Radius unter 20 m: keine Kurvenregel
    expect(h2({ fuenfBedingungen: true, radiusStrasse: null })).toBeUndefined()
    expect(h2({ fuenfBedingungen: true, radiusStrasse: 15 })).toBeUndefined()
  })
})
