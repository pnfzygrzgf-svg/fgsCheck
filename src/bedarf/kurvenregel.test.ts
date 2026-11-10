// Tests der Kurvenregel-Felder je Querung (alt): alte Fall-Dateien werden noch gelesen, wirken aber nicht mehr (Prüfung FGS-01,
// 10.11.2026; die Kurvenregel gilt je Zufahrt im Rechner, Tests in rechner/kurvenregel.test.ts).
import { describe, expect, it } from 'vitest'
import { bedarfLesen, eingabenBilden, type Vorbelegung } from './fallBedarf'
import { beurteile } from './entscheid'
import { fall as tfall } from './testfaelle'
import { KURVE_BEDINGUNGEN } from './eingaben'

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
  it('Kurvenregel je Querung wirkt nicht mehr (Prüfung FGS-01): kein H2, auch mit allen fünf ja', () => {
    const h2 = (k: Record<string, unknown>) => beurteile(tfall({ kurve: { radius: 25, radiusStrasse: 25, fuenfBedingungen: false, ...k }, sichtVorh: [36, 36] })).alle.find(x => x.id === 'H2')
    expect(h2({ fuenfBedingungen: true })).toBeUndefined()
    expect(h2({ fuenfBedingungen: false, vorschlag: true })).toBeUndefined()
  })
})
