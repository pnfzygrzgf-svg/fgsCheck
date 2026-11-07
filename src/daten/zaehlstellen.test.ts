import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import { baselLesen, luZaehlUrl, zaehlQuelleAmOrt, zaehlstelleZuordnen, zaehlstellenLesen, zaehlText, zhZaehlUrl, ZAEHLQUELLEN, type Zaehlstelle } from './zaehlstellen'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const stelle = (x: number, y: number, dtv = 9000): Zaehlstelle => ({ id: `s${x}`, p: lv(x, y), dtv, jahr: 2025, name: 'Messstelle 1' })
/** Zwei Fahrlinien zur Querung bei x = 0, je 80 m lang */
const SPUREN = [[lv(-80, -2), lv(0, -2)], [lv(80, 2), lv(0, 2)]]

describe('Zählstellen lesen', () => {
  it('Kanton Zürich und Stadt Luzern', () => {
    const zh = zaehlstellenLesen({ features: [{ geometry: { coordinates: [8.795458, 47.321065] }, properties: { messst_nr: 187, dtv: 9835, dtv_bezugsjahr: 2025 } }] },
      'dtv', 'dtv_bezugsjahr', p => `Messstelle ${p.messst_nr}`, 'zh')
    expect(zh).toMatchObject([{ id: 'zh:0', dtv: 9835, jahr: 2025, name: 'Messstelle 187' }])
    expect(zh[0].p[0]).toBeGreaterThan(2690000)
    expect(zaehlstellenLesen({ features: [{ geometry: { coordinates: [8.3, 47] }, properties: { DTV_ANZAHL: 0, DTV_JAHR: 2025 } }] }, 'DTV_ANZAHL', 'DTV_JAHR', () => '', 'lu')).toEqual([])
    expect(zhZaehlUrl).toContain('maps.zh.ch')
    expect(luZaehlUrl).toContain('map.stadtluzern.ch')
  })
  it('Basel-Stadt: Werktagsmittel ohne Jahr, defekte Zähler fallen weg', () => {
    expect(baselLesen([{ lat: 47.5463, lon: 7.595611, dtv: 34325, name: '420 Nauenstrasse 73' }, { lat: 47.5, lon: 7.6, dtv: 0, name: '660' }]))
      .toMatchObject([{ id: 'bs:0', dtv: 34325, jahr: null, name: '420 Nauenstrasse 73' }])
    expect(ZAEHLQUELLEN['bs.dtv'].masszahl).toBe('Werktagsmittel')
  })
  it('Zuständigkeit nach Gemeinde und Kanton der AV', () => {
    expect(zaehlQuelleAmOrt([261], ['ZH'])?.id).toBe('zh.dtv')
    expect(zaehlQuelleAmOrt([1061], ['LU'])?.id).toBe('lu.dtv')
    expect(zaehlQuelleAmOrt([2701], ['BS'])?.id).toBe('bs.dtv')
    expect(zaehlQuelleAmOrt([351], ['BE'])).toBeNull()
    expect(zaehlQuelleAmOrt([1058], ['LU'])).toBeNull()
  })
})

describe('Zählstelle an der Querung', () => {
  it('bis 25 m neben der Fahrlinie gilt die nächste zur Querung', () => {
    const t = zaehlstelleZuordnen([stelle(50, 2, 5000), stelle(-30, 6, 9000)], SPUREN, O)
    expect(t?.stelle.dtv).toBe(9000)
    expect(t?.abstandM).toBeCloseTo(8)
    expect(t?.zurQuerungM).toBeCloseTo(30, 0)
    expect(zaehlstelleZuordnen([stelle(30, 28)], SPUREN, O)).toBeNull()
  })
  it('Fall aus Luzern: die Stelle auf der Achse 72 m entfernt verliert gegen die Stelle 17 m von der Querung', () => {
    const t = zaehlstelleZuordnen([stelle(72, 2, 12080), stelle(17, 12, 29428)], SPUREN, O)
    expect(t?.stelle.dtv).toBe(29428)
    expect(t?.abstandM).toBeCloseTo(10)
    expect(t?.zurQuerungM).toBeCloseTo(17, 0)
  })
  it('eine nähere Stelle jenseits von 25 m zählt nicht', () => {
    expect(zaehlstelleZuordnen([stelle(72, 2, 12080), stelle(10, 30, 29428)], SPUREN, O)?.stelle.dtv).toBe(12080)
  })
  it('nahe am äusseren Ende nur bis 10 m: eine Hauptstrasse vererbt ihren Wert nicht an die Nebenstrasse', () => {
    expect(zaehlstelleZuordnen([stelle(-70, 15)], SPUREN, O)).toBeNull()
    expect(zaehlstelleZuordnen([stelle(-70, 6)], SPUREN, O)?.stelle.dtv).toBe(9000)
  })
  it('jenseits der Fahrlinie gehört sie nicht zur Querung', () => {
    expect(zaehlstelleZuordnen([stelle(-120, -2)], SPUREN, O)).toBeNull()
  })
  it('der Text nennt Quelle, Jahr, Lage und die Annahme', () => {
    const t = zaehlstelleZuordnen([stelle(-30, 6)], SPUREN, O)!
    const s = zaehlText(ZAEHLQUELLEN['zh.dtv'], t, '2026-11-07')
    expect(s).toContain('DTV 9 000 Fz/Tag (2025)')
    expect(s).toContain('Kanton Zürich, Verkehrsmessstellen, Messstelle 1')
    expect(s).toContain('Annahme: Eine Zählstelle gehört bis 25 m zur Fahrlinie, die nächste zur Querung gilt')
    expect(s).toContain('Erst nach Bestätigung verwenden')
  })
})
