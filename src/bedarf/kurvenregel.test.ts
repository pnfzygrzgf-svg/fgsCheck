// Tests Kurvenregel (VSS 40 241 Z. 14, S. 7; 29.10.2026): fünf Voraussetzungen einzeln, Vorbelegung aus der Fahrlinie und dem Höhenmodell
// (künstliche Werte), alte Fall-Dateien, abgeleitet «anwendbar», H2 nur mit allen fünf ja.
import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import { kurveGeometrie, kurveProfilLinie, kurveZufahrt } from './kurvenregel'
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
  sichtpunkte: [sp[0], sp[10]], kurvenradiusM: 20, tempo: 50, tempoQuelle: 'OSM', fahrstreifenOsmN: 1, mehrstreifig: 0, ...x } as ZufahrtErgebnis)
const st = (z: ZufahrtErgebnis) => [{ zufahrten: [z] } as unknown as StreifenErgebnis]
function vor(z: ZufahrtErgebnis, innerorts: boolean | null = true, neigung: Record<string, { i: number | null; laenge: number }> | null = null) {
  const w: Vorbelegung = innerorts === null ? {} : { innerorts: { wert: innerorts, quelle: 'osm', text: '' } }
  const h: Record<string, string> = {}
  kurvenregelVorbelegen(st(z), leererFall(46.9, 7.4, null), w,
    neigung as never, (p, wert, quelle, text) => { w[p] = { wert, quelle, text } }, (p, t) => { h[p] = t })
  return { w, h }
}

describe('Kurvenregel: Geometrie der Fahrlinie', () => {
  it('Kurvenende und Richtungsänderung: 8 m gerade, dann 70° bzw. 40°', () => {
    const g70 = kurveGeometrie({ spur: spur(8, 20, 70), sichtpunkte: [[0, 0]] })!
    expect(g70.endeM).toBeGreaterThanOrEqual(8); expect(g70.endeM).toBeLessThanOrEqual(11)
    expect(Math.abs(g70.winkel - 70)).toBeLessThanOrEqual(4)
    expect(Math.abs(kurveGeometrie({ spur: spur(8, 20, 40), sichtpunkte: [[0, 0]] })!.winkel - 40)).toBeLessThanOrEqual(4)
    expect(kurveGeometrie({ spur: spur(40, 20, 0), sichtpunkte: [[0, 0]] })).toEqual({ endeM: null, winkel: 0 })
    // Profil: 50 m Fahrlinie ab dem Streifenrand
    const l = kurveProfilLinie({ spur: spur(30, 20, 90), sichtpunkte: [[0, 0]] })
    expect(l.length).toBe(11)
  })
  it('Zufahrt mit der Kurve: kleinster Radius, Trottoirüberfahrt nicht', () => {
    const a = zuf(spur(8, 20, 70), { kurvenradiusM: 30 }), b = zuf(spur(8, 20, 70), { zufahrt: 'a270', kurvenradiusM: 15 })
    expect(kurveZufahrt([{ zufahrten: [a, b] } as unknown as StreifenErgebnis])?.zufahrt).toBe('a270')
    expect(kurveZufahrt([{ zufahrten: [a], trottoirueberfahrt: true } as unknown as StreifenErgebnis])).toBeNull()
  })
})

describe('Kurvenregel: Vorbelegung der fünf Voraussetzungen', () => {
  it('innerorts 50 km/h, ein Fahrstreifen, Kurvenende 8 m, 70°, Gefälle 3 %: alle ja mit Quelle', () => {
    const { w, h } = vor(zuf(spur(8, 20, 70)), true, { 'f1|a90': { i: -3, laenge: 50 } })
    expect(KURVE_BEDINGUNGEN.map(u => w[`kurve.${u}`]?.wert)).toEqual([true, true, true, true, true])
    expect(w['kurve.b1Innerorts50']).toMatchObject({ quelle: 'osm' })
    expect(w['kurve.b2EinFahrstreifen']).toMatchObject({ quelle: 'osm' })
    expect(w['kurve.b3NachKurvenende']!.text).toMatch(/^Kurvenende \d+ m vor dem Streifen/)
    expect(w['kurve.b4Winkel60']!.text).toMatch(/rund (6[6-9]|7\d)°/)
    expect(w['kurve.b5Gefaelle5']!.text).toMatch(/^Längsneigung 3 % auf 50 m vor dem Streifen \(Höhenmodell swissALTI3D\)/)
    expect(h).toEqual({})
  })
  it('40°, zwei Fahrstreifen, 30 km/h, Kurvenende 20 m, Gefälle 7 %, ohne Höhenmodell', () => {
    const z = zuf(spur(20, 20, 40), { fahrstreifenOsmN: 2, tempo: 30 })
    const { w } = vor(z, true, { 'f1|a90': { i: 7, laenge: 50 } })
    expect([w['kurve.b1Innerorts50']?.wert, w['kurve.b2EinFahrstreifen']?.wert, w['kurve.b4Winkel60']?.wert, w['kurve.b5Gefaelle5']?.wert])
      .toEqual([false, false, false, false])
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
    const h2 = (k: Record<string, unknown>) => beurteile(tfall({ kurve: { radius: 25, fuenfBedingungen: false, ...k }, sichtVorh: [36, 36] })).alle.find(x => x.id === 'H2')
    expect(h2({ fuenfBedingungen: true })?.zustand).toBe('verletzt')
    expect(h2({ fuenfBedingungen: false, vorschlag: true })).toBeUndefined()
    expect(h2({ fuenfBedingungen: false })).toBeUndefined()
  })
})
