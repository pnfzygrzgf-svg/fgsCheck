// Tests: Breite des rechten Bereichs (Trenner) – Klemmen, Zeiger, Pfeiltasten, Speicher (auch nicht verfügbar bzw. fehlerhaft).
import { describe, expect, it } from 'vitest'
import { PANEL_MIN, PANEL_SCHLUESSEL, PANEL_VORGABE, breiteAusZeiger, breiteNachTaste, klemmen, ladeBreite, panelMax, speichereBreite } from './panelbreite'

const speicher = (start: Record<string, string> = {}) => {
  const m = new Map(Object.entries(start))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}
const kaputt = { getItem: () => { throw new Error('gesperrt') }, setItem: () => { throw new Error('voll') } }

describe('Breite des Bereichs', () => {
  it('klemmen: 360 px bis 70 % der Fensterbreite, ganze Pixel; schmales Fenster mindestens 360 px', () => {
    expect(klemmen(100, 1600)).toBe(PANEL_MIN)
    expect(klemmen(5000, 1600)).toBe(1120)
    expect(klemmen(600.4, 1600)).toBe(600)
    expect(panelMax(400)).toBe(PANEL_MIN)
    expect(klemmen(NaN, 1600)).toBe(PANEL_VORGABE)
  })
  it('Zeiger: Breite vom Zeiger bis zum rechten Rand; Pfeiltasten ±20 px, andere Tasten nichts', () => {
    expect(breiteAusZeiger(1000, 1600)).toBe(600)
    expect(breiteAusZeiger(1500, 1600)).toBe(PANEL_MIN)
    expect(breiteNachTaste(560, 'ArrowLeft', 1600)).toBe(580)
    expect(breiteNachTaste(560, 'ArrowRight', 1600)).toBe(540)
    expect(breiteNachTaste(PANEL_MIN, 'ArrowRight', 1600)).toBe(PANEL_MIN)
    expect(breiteNachTaste(560, 'Enter', 1600)).toBeNull()
  })
  it('Speicher: Vorgabe 560 px ohne Eintrag, geklemmt beim Lesen; Fehler beim Lesen bzw. Schreiben werden geschluckt', () => {
    expect(ladeBreite(1600, speicher())).toBe(PANEL_VORGABE)
    expect(ladeBreite(1600, speicher({ [PANEL_SCHLUESSEL]: '700' }))).toBe(700)
    expect(ladeBreite(800, speicher({ [PANEL_SCHLUESSEL]: '700' }))).toBe(560)
    expect(ladeBreite(1600, speicher({ [PANEL_SCHLUESSEL]: 'abc' }))).toBe(PANEL_VORGABE)
    expect(ladeBreite(1600, kaputt)).toBe(PANEL_VORGABE)
    expect(ladeBreite(1600, null)).toBe(PANEL_VORGABE)
    const s = speicher()
    speichereBreite(612.6, s)
    expect(s.m.get(PANEL_SCHLUESSEL)).toBe('613')
    expect(() => speichereBreite(600, kaputt)).not.toThrow()
  })
})
