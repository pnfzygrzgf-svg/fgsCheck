// Tests 30.10.2026: Ebene «Fusswegnetz: für die Prüfung genutzte Linie» (fusswegnetzKarte.ts: nur die von der Vorbelegung genutzte
// Basisnetz-Linie, wie automatikC: quert die Fahrbahn bis 15 m vom Streifen, die nächste) und WMS-Ebene des Geoportals (richtplanWms.ts).
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { StreifenErgebnis } from './rechner/typen'
import type { RichtplanDaten } from './daten/richtplanFussverkehr'
import { fusswegnetzKarte, BASISNETZ_TEXT } from './fusswegnetzKarte'
import { RP_WMS_URL, rpLegende, rpWmsOptionen, rpWmsVerfuegbar } from './daten/richtplanWms'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichtplanLegende } from './RichtplanLegende'

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

describe('fusswegnetzKarte: nur die für die Prüfung genutzte Linie', () => {
  it('ohne Daten (ausserhalb Berns bzw. nicht geladen) bzw. ohne Basisnetz: keine Ebene', () => {
    expect(fusswegnetzKarte(null, [ST])).toBeNull()
    expect(fusswegnetzKarte({ basisnetz: null, publikum: null }, [ST])).toBeNull()
    expect(fusswegnetzKarte({ basisnetz: [], publikum: RP.publikum }, [ST])).toBeNull()
  })
  it('nur die nächste querende Linie bis 15 m, mit Abstand im Tooltip; keine Flächen', () => {
    const k = fusswegnetzKarte(RP, [ST])!
    expect(k.linien.map(l => l.id)).toEqual(['b'])
    expect(k.linien[0].abstandM).toBeCloseTo(3, 6)
    expect(k.linien[0].text).toBe(`${BASISNETZ_TEXT}: für die Vorbelegung genutzt, quert die Fahrbahn 3 m vom Streifen`)
    expect(k.linien[0].teile).toBe(RP.basisnetz![1].teile)
    expect(Object.keys(k)).toEqual(['linien'])
  })
  it('Linie über die Streifenachse: «beim Streifen»; keine Linie bis 15 m bzw. ohne Querung: keine Ebene', () => {
    expect(fusswegnetzKarte({ basisnetz: [quer('x', 0)], publikum: [] }, [ST])!.linien[0].text).toContain('quert die Fahrbahn beim Streifen')
    expect(fusswegnetzKarte({ basisnetz: [quer('c', 40)], publikum: [] }, [ST])).toBeNull()
    expect(fusswegnetzKarte(RP, [])).toBeNull()
  })
  it('Ausschnitt deckt die Querung nicht (wie die Vorbelegung): keine Ebene', () => {
    expect(fusswegnetzKarte(RP, [ST], { mitte: lv(0, 0), radiusM: 150, form: 'quadrat' })).not.toBeNull()
    expect(fusswegnetzKarte(RP, [ST], { mitte: lv(140, 0), radiusM: 150, form: 'quadrat' })).toBeNull()
  })
})

describe('WMS-Ebene «Richtplan Fussverkehr (Geoportal Bern)»', () => {
  it('nur in der Ebenenwahl, solange der Ausschnitt die Stadt Bern berührt', () => {
    expect(rpWmsVerfuegbar({ s: 46.945, w: 7.43, n: 46.952, e: 7.45 })).toBe(true)          // Altstadt
    expect(rpWmsVerfuegbar({ s: 46.85, w: 7.2, n: 46.92, e: 7.3 })).toBe(true)              // Rand: berührt
    expect(rpWmsVerfuegbar({ s: 47.37, w: 8.53, n: 47.38, e: 8.55 })).toBe(false)           // Zürich
    expect(rpWmsVerfuegbar({ s: 46.95, w: 7.52, n: 46.96, e: 7.6 })).toBe(false)            // östlich der Stadt
  })
  it('WMS-Parameter: Basisnetz, Hinweise, Symbollinie und Massnahmen ohne Wanderwege, transparentes PNG 1.3.0, Quelle', () => {
    expect(rpWmsOptionen()).toMatchObject({ layers: '4,1,2,5,6,7', format: 'image/png', transparent: true, version: '1.3.0',
      attribution: '© Geodaten Stadt Bern, Richtplan Fussverkehr' })
    expect(rpWmsOptionen().opacity).toBeCloseTo(0.8, 6)
  })
  it('Legende: aus nichts (keine Bilder von map.bern.ch), an je Layer das Bild des Geoportals', () => {
    expect(rpLegende(false)).toEqual([])
    const l = rpLegende(true)
    expect(l.map(x => x.layer)).toEqual(['4', '1', '2', '5', '6', '7'])
    expect(l[0].url).toBe(`${RP_WMS_URL}?request=GetLegendGraphic&version=1.3.0&format=image/png&layer=4`)
    const html = renderToStaticMarkup(<ul><RichtplanLegende /></ul>)
    expect(html).toContain('Richtplan Fussverkehr (Geoportal Bern) (Darstellung des Geoportals)')
    expect((html.match(/<img /g) ?? []).length).toBe(6)
    expect(html).toContain('alt="Basisnetz Fussweg (bestehend)"')
  })
})
