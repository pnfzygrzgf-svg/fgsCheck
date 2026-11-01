// Werkzeug «Messen» (27.10.2026): Fang auf AV-Stützpunkte wie der Fixpunkt, Länge mit zwei Nachkommastellen, Übernahme auf 0,05 m
import { describe, expect, it } from 'vitest'
import { inFeldSchreiben, inMetern, istZahlenfeld, messKlick, messLaenge, messPunkt, messText, messWert } from './messen'
import { FANG_PX } from './fixpunkt'
import { PLAN_WERKZEUGE, WERKZEUGE, hilfeOrt } from './Planen'
import type { AvFlaeche } from './daten/av'

const AV: AvFlaeche[] = [{ art: 'Gebaeude', kanton: 'BE', qualitaet: 'AV93', bfs: null,
  ringe: [[[100, 100], [110, 100], [110, 108], [100, 108], [100, 100]]] }]

describe('Messen', () => {
  it('Fang: Klick nahe einer Gebäudeecke fängt sie, sonst freier Punkt', () => {
    expect(messPunkt([100.8, 99.6], AV, 2)).toEqual({ p: [100, 100], art: 'gebaeudeecke' })
    expect(messPunkt([105, 90], AV, 2)).toEqual({ p: [105, 90], art: 'frei' })
  })
  it('zwei Klicks: Strecke mit Länge; der dritte beginnt eine neue Messung', () => {
    const a = messKlick(null, messPunkt([100.3, 100.2], AV, 2))
    expect(messLaenge(a)).toBeNull()
    const b = messKlick(a, messPunkt([109.7, 107.9], AV, 2))
    expect(messLaenge(b)).toBeCloseTo(Math.hypot(10, 8), 9)
    expect(messText(messLaenge(b)!)).toBe('12,81 m')
    const c = messKlick(b, messPunkt([50, 50], AV, 2))
    expect(c.b).toBeNull(); expect(c.a.p).toEqual([50, 50])
  })
  it('Übernahme auf 0,05 m gerundet, Dezimalkomma', () => {
    expect(messWert(12.806)).toBe('12,80')
    expect(messWert(12.83)).toBe('12,85')
    expect(messWert(3.474)).toBe('3,45')
  })
  it('Zahlenfeld: Textfeld mit Dezimaltastatur oder Zahlfeld; andere Felder nicht', () => {
    const el = (tag: string, a: Record<string, string>) => ({ tagName: tag, inputMode: a.inputMode ?? '', type: a.type ?? 'text' }) as unknown as Element
    expect(istZahlenfeld(el('INPUT', { inputMode: 'decimal' }))).toBe(true)
    expect(istZahlenfeld(el('INPUT', { type: 'number' }))).toBe(true)
    expect(istZahlenfeld(el('INPUT', {}))).toBe(false)
    expect(istZahlenfeld(el('SELECT', {}))).toBe(false)
    expect(istZahlenfeld(null)).toBe(false)
  })
  it('übernehmen: Text ins Feld (Dezimalkomma bzw. Punkt im Zahlfeld), Eingabe-Ereignis, danach Enter (übernimmt wie von Hand)', async () => {
    const g = globalThis as unknown as Record<string, unknown>
    const vorher = g.KeyboardEvent
    g.KeyboardEvent = class extends Event { key: string; constructor(t: string, o: { key: string; bubbles?: boolean }) { super(t, o); this.key = o.key } }
    try {
      for (const [type, erwartet] of [['text', '12,85'], ['number', '12.85']] as const) {
        const ereignisse: string[] = []
        const el = { type, value: '', dispatchEvent: (e: Event & { key?: string }) => { ereignisse.push(e.key ?? e.type); return true } } as unknown as HTMLInputElement
        await new Promise<void>(r => inFeldSchreiben(el, messWert(12.83), r))
        expect(el.value).toBe(erwartet)
        expect(ereignisse).toEqual(['input', 'Enter'])
      }
    } finally { g.KeyboardEvent = vorher }
  })
  it('übernehmen nur in Felder in Metern: Bedarf nach der Einheit des Felds, übrige Zahlenfelder des Panels (Meter) immer', () => {
    const el = (bedarf: boolean, zeile: string | null, label = '') => ({ classList: { contains: (c: string) => bedarf && c === 'bedarf-zahl' },
      closest: () => (zeile ? { id: zeile } : null), getAttribute: (a: string) => (a === 'aria-label' ? label : null) }) as unknown as Element
    expect(inMetern(el(true, 'feld-fahrbahnB'))).toBe(true)
    expect(inMetern(el(true, 'feld-q3-ueberfahrbarM'))).toBe(true)
    expect(inMetern(el(true, 'feld-achsWinkel'))).toBe(false)        // °
    expect(inMetern(el(true, 'feld-q3-quergefaelle'))).toBe(false)   // %
    expect(inMetern(el(true, 'feld-vSig'))).toBe(false)              // km/h
    expect(inMetern(el(true, 'feld-q3-anrampung'))).toBe(false)      // Rampe: Neigung und Länge
    expect(inMetern(el(true, null, 'Wie breit ist die Trottoirüberfahrt?'))).toBe(true)   // Frage ohne Feldzeile
    expect(inMetern(el(false, null))).toBe(true)
  })
  it('Werkzeug am Ende der Gruppe Planen, Tooltip kurz, Hilfe in der Gruppe', () => {
    expect(PLAN_WERKZEUGE[PLAN_WERKZEUGE.length - 1]).toBe('messen')
    expect(WERKZEUGE.find(x => x[0] === 'messen')![2]).toBe('zwei Punkte anklicken; Fang auf Vermessungspunkte; Wert in ein Zahlenfeld übernehmen')
    expect(hilfeOrt('messen', true, false)).toBe('planen')
    expect(FANG_PX).toBe(12)
  })
})
