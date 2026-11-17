// Messen ins Formular (27.10.2026; seit 17.11.2026 über das Messwerkzeug der Karte): Übernahme auf 0,05 m, Zielfelder, Knopf in Planen
import { describe, expect, it } from 'vitest'
import { inFeldSchreiben, inMetern, istZahlenfeld, messWert } from './messen'
import { FANG_PX } from './fixpunkt'
import { PLAN_WERKZEUGE, WERKZEUGE, hilfeOrt } from './Planen'

describe('Messen', () => {
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
    expect(WERKZEUGE.find(x => x[0] === 'messen')![2]).toContain('Messwerkzeug der Karte')
    expect(hilfeOrt('messen', true, false)).toBe('planen')
    expect(FANG_PX).toBe(12)
  })
})
