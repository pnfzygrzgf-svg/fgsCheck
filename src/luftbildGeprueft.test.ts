// Bestätigung eines erkannten Luftbild-Streifens: bleibt im Fall, gilt nur für diese Lage, ändert die Rechnung nicht
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import { eingabenSchluessel, fallLesen, fallSchreiben, hatEingaben, leererFall, luftbildGilt, luftbildMitten, rechnungsSchluessel } from './fall'

const O: P = [2600000, 1200000]
const teil = (dx = 0) => ({ p0: [O[0] + dx, O[1]] as P, p1: [O[0] + dx, O[1] + 8] as P })

describe('luftbildGilt', () => {
  it('gilt an derselben Lage, auch leicht verschoben', () => {
    const g = luftbildMitten([teil()])
    expect(luftbildGilt({ luftbildGeprueft: g }, [teil(1)])).toBe(true)
  })
  it('gilt nicht mehr, wenn der Streifen deutlich anders liegt oder die Zahl der Teile ändert', () => {
    const g = luftbildMitten([teil()])
    expect(luftbildGilt({ luftbildGeprueft: g }, [teil(2)])).toBe(false)
    expect(luftbildGilt({ luftbildGeprueft: g }, [teil(), teil(20)])).toBe(false)
  })
  it('ohne Bestätigung offen', () => {
    expect(luftbildGilt({}, [teil()])).toBe(false)
  })
})

describe('Fall-Datei', () => {
  const f = () => leererFall(46.9, 7.4, 123)
  it('Bestätigung bleibt gespeichert, zählt als Eingabe, ältere Dateien bleiben offen', () => {
    const a = f(); a.luftbildGeprueft = luftbildMitten([teil()])
    expect(fallLesen(fallSchreiben(a))[0].luftbildGeprueft).toEqual(a.luftbildGeprueft)
    expect(hatEingaben(a)).toBe(true)
    expect(eingabenSchluessel(a)).not.toBe(eingabenSchluessel(f()))
    expect(fallLesen(fallSchreiben(f()))[0].luftbildGeprueft).toBeUndefined()
  })
  it('ungültige Werte werden nicht übernommen', () => {
    const roh = JSON.parse(fallSchreiben(f())); roh.luftbildGeprueft = ['x']
    expect(fallLesen(JSON.stringify(roh))[0].luftbildGeprueft).toBeUndefined()
  })
  it('die Bestätigung ändert die Rechnung nicht', () => {
    const a = f(); a.luftbildGeprueft = luftbildMitten([teil()])
    expect(rechnungsSchluessel(a)).toBe(rechnungsSchluessel(f()))
  })
})
