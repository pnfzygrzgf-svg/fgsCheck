// Tests 30.10.2026: Ebene «Fusswegnetz (Richtplan Bern)» auf der Karte (fusswegnetzKarte.ts): Abbildung der geladenen Richtplan-Daten,
// Markierung der von der Vorbelegung genutzten Basisnetz-Linie (wie automatikC: quert die Fahrbahn bis 15 m vom Streifen, die nächste).
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { StreifenErgebnis } from './rechner/typen'
import type { RichtplanDaten } from './daten/richtplanFussverkehr'
import { fusswegnetzKarte, BASISNETZ_TEXT } from './fusswegnetzKarte'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
// Streifen quer über eine Fahrbahn West–Ost (y −4 … 4) bei x = 0
const ST = [{ p0: lv(0, -4), p1: lv(0, 4), rand: [lv(-1.5, -4), lv(1.5, -4), lv(1.5, 4), lv(-1.5, 4)] }] as unknown as StreifenErgebnis[]
const quer = (id: string, x: number) => ({ id, layer: 'RP-Inhalt-Basisnetz Fussweg_bestehend', teile: [[lv(x, -20), lv(x, 20)]] })
const RP: RichtplanDaten = {
  basisnetz: [quer('a', 6), quer('b', 3), quer('c', 40), { id: 'd', layer: '', teile: [[lv(-50, 10), lv(50, 10)]] }],
  publikum: [{ id: 'p', layer: 'RP-Hinweis-publikumsattraktive Bereiche', name: 'Bahnhof', ringe: [[lv(-5, -5), lv(5, -5), lv(5, 5)]] },
    { id: 'q', layer: 'RP-Hinweis-publikumsattraktive Bereiche', name: null, ringe: [[lv(100, 0), lv(110, 0), lv(110, 10)]] }],
}

describe('fusswegnetzKarte', () => {
  it('ohne Daten (ausserhalb Berns bzw. nicht geladen): keine Ebene', () => {
    expect(fusswegnetzKarte(null, [ST])).toBeNull()
    expect(fusswegnetzKarte({ basisnetz: null, publikum: null }, [ST])).toBeNull()
    expect(fusswegnetzKarte({ basisnetz: [], publikum: [] }, [ST])).toBeNull()
  })
  it('alle Linien und Flächen; genutzt nur die nächste querende Linie bis 15 m, mit Abstand im Tooltip', () => {
    const k = fusswegnetzKarte(RP, [ST])!
    expect(k.linien.map(l => [l.id, l.genutzt])).toEqual([['a', false], ['b', true], ['c', false], ['d', false]])
    expect(k.linien.find(l => l.id === 'b')!.text).toBe(`${BASISNETZ_TEXT}: für die Vorbelegung genutzt, quert die Fahrbahn 3 m vom Streifen`)
    expect(k.linien.find(l => l.id === 'a')!.text).toBe(BASISNETZ_TEXT)
    expect(k.linien[0].teile).toBe(RP.basisnetz![0].teile)
    expect(k.flaechen.map(f => f.text)).toEqual(['Publikumsattraktiver Bereich: Bahnhof', 'Publikumsattraktiver Bereich (Richtplan Stadt Bern)'])
  })
  it('Linie über die Streifenachse: «beim Streifen»; keine Linie bis 15 m bzw. ohne Querung: nichts markiert', () => {
    expect(fusswegnetzKarte({ basisnetz: [quer('x', 0)], publikum: [] }, [ST])!.linien[0].text).toContain('quert die Fahrbahn beim Streifen')
    expect(fusswegnetzKarte({ basisnetz: [quer('c', 40)], publikum: [] }, [ST])!.linien.some(l => l.genutzt)).toBe(false)
    expect(fusswegnetzKarte(RP, [])!.linien.some(l => l.genutzt)).toBe(false)
  })
  it('Ausschnitt deckt die Querung nicht (wie die Vorbelegung): keine Markierung', () => {
    expect(fusswegnetzKarte(RP, [ST], { mitte: lv(0, 0), radiusM: 150, form: 'quadrat' })!.linien.some(l => l.genutzt)).toBe(true)
    expect(fusswegnetzKarte(RP, [ST], { mitte: lv(140, 0), radiusM: 150, form: 'quadrat' })!.linien.some(l => l.genutzt)).toBe(false)
  })
})
