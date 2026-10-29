// Tests 23.10.2026: hier nicht geprüfte Richtungen und Zufahrtszeile in Alltagssprache (Nutzertest Zieglerstrasse)
import { describe, expect, it } from 'vitest'
import { ART, ENTFALLEN_TITEL, GRUND, entfallenGrund, sichtQuelleKurz, tempoHerkunft } from './texte'
import { entfallen } from './rechner/zufahrten'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'

/** alle Gründe, die der Rechner vergibt (src/rechner, nur gelesen) */
const GRUENDE = ['hofzufahrt', 'einbahn_osm', 'richtungsfahrbahn', 'insel', 'teilstreifen', 'insel_einbahn', 'einspurig', 'einmuendung', 'gerade_verboten',
  'gedeckt', 'kein_zufluss', 'verbot', 'kreisel', 'wenden', 'nebenast', 'zu_steil', 'arm_schmal', 'arm_ohne_fahrbahn', 'geometrie',
  'wegende', 'einbahn_widerspruch', 'hand']
const z = (zufahrt: string, richtung: number, osmWeg: string | null, art = 'beide', osmKnoten: string | null = null) =>
  ({ zufahrt, richtung, osmWeg, art, osmKnoten }) as ZufahrtErgebnis
const st = (fgsId: string, zufahrten: ZufahrtErgebnis[]) => ({ fgsId, zufahrten }) as Pick<StreifenErgebnis, 'fgsId' | 'zufahrten'>

describe('Hier nicht geprüfte Richtungen: Alltagssprache', () => {
  it('jeder Grund des Rechners hat einen Text, ohne Rohcodes und Fachkürzel', () => {
    expect(Object.keys(GRUND).sort()).toEqual([...GRUENDE].sort())
    for (const [k, t] of Object.entries(GRUND)) {
      expect(t, k).not.toMatch(/Inselteil|Teilstreifen\)|\(OSM\)|AV\b|Tab\. |_/)
      expect(t.length, k).toBeGreaterThan(15)
    }
    for (const k of ['geometrie', 'arm_ohne_fahrbahn', 'einbahn_widerspruch']) expect(GRUND[k]).toMatch(/^nicht geprüft: .* – bitte vor Ort prüfen$/)
    expect(ENTFALLEN_TITEL).toBe('Hier nicht geprüfte Richtungen')
  })
  it('Insel: mit Verweis auf den anderen Teil des Streifens; der Rohtext, der nur den Grund wiederholt, entfällt', () => {
    const a = st('1', [z('90', 90, '77', 'insel')]), b = st('2', [z('270', 270, '77', 'insel')])
    const e = entfallen('1', 'gerade', 270, '270', 'insel', 'Inselteil (Insel rechts der Fahrt)', 77)
    const g = entfallenGrund(e, a, [a, b], fid => `Teilstreifen ${fid}`, () => '')
    expect(g).toEqual({ text: 'fährt auf der anderen Seite der Insel vorbei und kreuzt diesen Teil des Streifens nicht – geprüft beim anderen Teil (Teilstreifen 2)' })
    // nicht eindeutig: allgemein
    expect(entfallenGrund(e, a, [a], fid => fid, () => '').text).toMatch(/geprüft beim anderen Teil des Streifens$/)
    // Nachtrag nach Prüfung: der andere Teil ist eine Trottoirüberfahrt (Zufahrten nur für die Vorbelegung): kein «geprüft beim anderen Teil»
    const t = { fgsId: '2', zufahrten: [], trottoirueberfahrt: true as const, nurVorbelegung: { zufahrten: [z('270', 270, '77', 'insel')], entfallen: [] } }
    expect(entfallenGrund(e, a, [a, t], fid => `Teilstreifen ${fid}`, () => '').text)
      .toBe('fährt auf der anderen Seite der Insel vorbei und kreuzt diesen Teil des Streifens nicht – der andere Teil (Teilstreifen 2) ist eine Trottoirüberfahrt, dort wird die Sicht nicht geprüft')
  })
  it('gedeckt: mit der geraden Zufahrt über denselben Knoten; Masse kurz, Rohtext nur im Tooltip', () => {
    const s = st('1', [z('180', 180, '5', 'beide', '11')])
    const e = entfallen('1', 'abbiegend', 0, 'a0', 'gedeckt',
      'Knoten 11,7 m vor dem Streifen; Kurvensichtweite des Abbiegers 10 m; die gerade Zufahrt prüft diese Strecke über 25 m mit', 9, 11)
    const g = entfallenGrund(e, s, [s], () => '', () => 'Zieglerstrasse von Süden')
    expect(g.text).toBe('mitgeprüft mit der geraden Zufahrt «Zieglerstrasse von Süden»: sie deckt dieselbe Sichtstrecke ab')
    expect(g.kurz).toBe('Kreuzung 12 m vor dem Streifen; Abbiegende brauchen 10 m Sicht, die gerade Zufahrt prüft 25 m')
    expect(g.zusatz).toContain('Knoten 11,7 m')
  })
  it('Zufahrtszeile: Art, Tempo und nötige Sicht in Worten (Fundstelle nur im Tooltip)', () => {
    expect(ART).toEqual({ beide: 'geradeaus', einbahn: 'geradeaus, Einbahn', insel: 'geradeaus (Teil vor der Insel)', abbiegend: 'biegt ein' })
    expect(tempoHerkunft('Geoportal')).toBe('Geoportal')
    expect(tempoHerkunft('Ersatz')).toBe('Annahme')
    expect(sichtQuelleKurz('VSS Tab. 1')).toBe('nach Tempo')
    expect(sichtQuelleKurz('VSS Tab. 2')).toBe('nach Kurvenradius')
    expect(sichtQuelleKurz('Kurvensichtweite (bfu); ab dem Knoten prüft die gerade Zufahrt mit')).toBe('nach Kurvenradius')
    expect(sichtQuelleKurz('bis Knoten (Strassenende)')).toBe('bis zur Kreuzung')
    expect(sichtQuelleKurz('VSS 40 240 Z. 8.2 (L 4,0 m)')).toBe('Querung ohne Vortritt')
    for (const q of ['VSS Tab. 1', 'VSS Tab. 2', 'bis Gebäude', 'bis Wegende', 'bis Kreiselring']) expect(sichtQuelleKurz(q)).not.toMatch(/VSS|Tab\./)
  })
})
