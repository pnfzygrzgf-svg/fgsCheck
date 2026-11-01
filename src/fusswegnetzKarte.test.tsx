// Tests 30.10.2026: Ebene «Fusswegnetz: für die Prüfung genutzte Linie» (fusswegnetzKarte.ts: nur die von der Vorbelegung genutzte
// Basisnetz-Linie, wie automatikC: quert die Fahrbahn bis 15 m vom Streifen, die nächste) und Ebene «Richtplan Fussverkehr (Geoportal Bern)» aus dem REST-Dienst
// (daten/richtplanKarte.ts; Abfragen mit Mock, map.bern.ch antwortet ausserhalb des Browsers nicht).
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { StreifenErgebnis } from './rechner/typen'
import type { RichtplanDaten } from './daten/richtplanFussverkehr'
import { fusswegnetzKarte, BASISNETZ_TEXT } from './fusswegnetzKarte'
import { RP_FARBE, RP_KARTE_LAYER, RP_LEGENDE, RP_NAME, bereichBox, rpAbfrageBox, rpAusVorbelegung, rpKarteUrl, rpLaden, rpStil, rpToleranzM,
  rpTooltip, rpTreffer, rpVerfuegbar, type Box, type RpCache } from './daten/richtplanKarte'
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

// ── Ebene «Richtplan Fussverkehr (Geoportal Bern)» aus dem REST-Dienst (daten/richtplanKarte.ts) ──
const linieGj = (id: number, layer: string, pts: P[]) => ({ type: 'Feature', properties: { Objectid: id, Layer: layer },
  geometry: { type: 'LineString', coordinates: pts } })
const flaecheGj = (id: number, layer: string, refname: string | null, ring: P[]) => ({ type: 'Feature',
  properties: { Objectid: id, Layer: layer, Refname: refname }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })
const gj = (features: unknown[]) => ({ type: 'FeatureCollection', crs: { properties: { name: 'EPSG:2056' } }, features })
/** Antworten je REST-Layer (Mock statt map.bern.ch); zählt die Abfragen */
function mock(antworten: Record<number, unknown>, fehler: number[] = []) {
  const urls: string[] = []
  const holen = async (url: string) => {
    urls.push(url)
    const n = Number(/MapServer\/(\d+)\/query/.exec(url)![1])
    if (fehler.includes(n)) throw new Error('HTTP 500')
    return { daten: antworten[n] ?? gj([]), ms: 1, bytes: 1 } as never
  }
  return { holen, urls }
}
const ALLE = {
  4: gj([linieGj(11, 'RP-Inhalt-Basisnetz Fussweg_bestehend', [lv(3, -20), lv(3, 20)])]),
  7: gj([flaecheGj(71, 'RP-Hinweis-publikumsattraktive Bereiche', 'Bahnhof', [lv(-50, -50), lv(50, -50), lv(50, 50), lv(-50, 50)]),
    flaecheGj(72, 'RP-Hinweis-publikumsattraktive Bereiche', 'Markt', [lv(-10, -10), lv(10, -10), lv(10, 10), lv(-10, 10)]),
    flaecheGj(73, 'RP-Hinweis-anderes', null, [lv(0, 0), lv(1, 0), lv(1, 1)]),
    flaecheGj(74, 'RP-Hinweis-publikumsattraktive Bereiche', 'RP-intern', [lv(200, 200), lv(210, 200), lv(210, 210)])]),
}

describe('Ebene «Richtplan Fussverkehr (Geoportal Bern)»: Verfügbarkeit, Abfragen', () => {
  it('nur in der Ebenenwahl, solange der Ausschnitt die Stadt Bern berührt', () => {
    expect(rpVerfuegbar({ s: 46.945, w: 7.43, n: 46.952, e: 7.45 })).toBe(true)          // Altstadt
    expect(rpVerfuegbar({ s: 46.85, w: 7.2, n: 46.92, e: 7.3 })).toBe(true)              // Rand: berührt
    expect(rpVerfuegbar({ s: 47.37, w: 8.53, n: 47.38, e: 8.55 })).toBe(false)           // Zürich
    expect(rpVerfuegbar({ s: 46.95, w: 7.52, n: 46.96, e: 7.6 })).toBe(false)            // östlich der Stadt
  })
  it('nur Layer 4 (Basisnetz) und 7 (publikumsattraktive Bereiche), Rechteck in LV95, GeoJSON; Abfrage-Rechteck mit Rand auf 250 m gerundet', () => {
    expect(RP_KARTE_LAYER.map(l => [l.layer, l.art])).toEqual([[4, 'basisnetz'], [7, 'publikum']])
    const u = rpKarteUrl(7, [2600000, 1199000, 2601000, 1200000], true)
    expect(u).toContain('/Richtplan_Fussverkehr/MapServer/7/query?')
    expect(u).toContain('geometry=2600000%2C1199000%2C2601000%2C1200000')
    expect(u).toContain('outFields=Objectid%2CLayer%2CRefname')
    expect(u).toContain('f=geojson')
    expect(rpAbfrageBox([2600010, 1199990, 2600810, 1200390])).toEqual([2599750, 1199750, 2601250, 1200500])
  })
  it('laden: je Layer eine Abfrage; danach aus dem Zwischenspeicher; ein Fehler betrifft nur seinen Layer', async () => {
    const cache: RpCache = new Map(), m = mock(ALLE, [7])
    const box: Box = [O[0] - 500, O[1] - 500, O[0] + 500, O[1] + 500]
    const r = await rpLaden(box, cache, null, undefined, m.holen)
    expect(m.urls.length).toBe(2)
    expect(r.fehler).toEqual(['publikum'])
    expect(r.objekte.basisnetz.map(o => o.id)).toEqual(['bernrp:11'])
    expect(r.objekte.publikum).toEqual([])
    const ok = mock(ALLE)
    const r2 = await rpLaden([O[0] - 100, O[1] - 100, O[0] + 100, O[1] + 100], cache, null, undefined, ok.holen)
    expect(ok.urls.map(u => Number(/MapServer\/(\d+)/.exec(u)![1]))).toEqual([7])                // nur der fehlgeschlagene Layer neu
    // anderer Hinweis entfällt, interner Name «RP-…» entfällt
    expect(r2.objekte.publikum.map(o => [o.id, o.name])).toEqual([['bernrph:71', 'Bahnhof'], ['bernrph:72', 'Markt'], ['bernrph:74', null]])
    expect(r2.objekte.basisnetz.map(o => o.id)).toEqual(['bernrp:11'])
  })
  it('Daten der Vorbelegung decken den Ausschnitt: keine Abfrage; sonst beide Layer', async () => {
    const m = mock(ALLE)
    const vor = { box: [O[0] - 150, O[1] - 150, O[0] + 150, O[1] + 150] as Box, objekte: rpAusVorbelegung(RP) }
    const r = await rpLaden([O[0] - 100, O[1] - 100, O[0] + 100, O[1] + 100], new Map(), vor, undefined, m.holen)
    expect(m.urls).toEqual([])
    expect(r.objekte.basisnetz.map(o => o.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(r.objekte.publikum.map(o => o.id)).toEqual(['p', 'q'])
    await rpLaden([O[0] - 400, O[1] - 400, O[0] + 400, O[1] + 400], new Map(), vor, undefined, m.holen)
    expect(m.urls.length).toBe(2)
    expect(bereichBox({ mitte: O, radiusM: 150, form: 'quadrat' })).toEqual([O[0] - 150, O[1] - 150, O[0] + 150, O[1] + 150])
  })
  it('Abbruch bricht das Laden ab (kein Eintrag im Zwischenspeicher)', async () => {
    const ctrl = new AbortController(), cache: RpCache = new Map()
    const holen = async () => { ctrl.abort(); throw new DOMException('abgebrochen', 'AbortError') }
    await expect(rpLaden([0, 0, 1, 1], cache, null, ctrl.signal, holen)).rejects.toBeDefined()
    expect(cache.size).toBe(0)
  })
})

describe('Ebene «Richtplan Fussverkehr»: Darstellung, Tooltip, Treffer, Legende', () => {
  it('Stil: Magenta, Basisnetz durchgezogen 3 px (genutzt 5 px), Bereiche blass gefüllt mit gestricheltem Rand', () => {
    expect(rpStil('basisnetz')).toMatchObject({ flaeche: false, color: RP_FARBE, weight: 3, fill: false })
    expect(rpStil('basisnetz').dashArray).toBeUndefined()
    expect(rpStil('basisnetz', true).weight).toBe(5)
    expect(rpStil('publikum')).toMatchObject({ flaeche: true, color: RP_FARBE, fill: 'farbe', dashArray: '6 4' })
    expect(rpStil('publikum').fillOpacity).toBeCloseTo(0.12, 6)
    // abseits der AV-Farben
    expect(Object.values({ Strasse_Weg: '#6e6e6e', Trottoir: '#e6e6c8', Verkehrsinsel: '#96c878', Gebaeude: '#3f3f46' })).not.toContain(RP_FARBE)
  })
  it('Tooltip: Art, Name, bei der genutzten Linie der Vermerk (ohne Abstand); Herkunft', () => {
    expect(rpTooltip({ art: 'basisnetz', name: null })).toEqual({ titel: 'Basisnetz Fussweg (bestehend)', quelle: 'Richtplan Fussverkehr, Geoportal Stadt Bern' })
    expect(rpTooltip({ art: 'basisnetz', name: null }, 3).titel).toBe('Basisnetz Fussweg (bestehend) – für die Prüfung genutzt')
    expect(rpTooltip({ art: 'basisnetz', name: null }, 0).titel).toBe('Basisnetz Fussweg (bestehend) – für die Prüfung genutzt')
    expect(rpTooltip({ art: 'basisnetz', name: null }, null).titel).toBe('Basisnetz Fussweg (bestehend)')
    expect(rpTooltip({ art: 'publikum', name: 'Bahnhof' }).titel).toBe('Publikumsattraktiver Bereich: Bahnhof')
    expect(rpTooltip({ art: 'publikum', name: null }).titel).toBe('Publikumsattraktiver Bereich')
  })
  it('Treffer beim Bewegen der Maus: Linie bis zur Toleranz vor der Fläche, kleinste Fläche zuerst, sonst nichts', async () => {
    const r = await rpLaden([O[0] - 500, O[1] - 500, O[0] + 500, O[1] + 500], new Map(), null, undefined, mock(ALLE).holen)
    const alle = RP_KARTE_LAYER.flatMap(l => r.objekte[l.art])
    expect(rpTreffer(alle, lv(4, 0), 1.5)?.id).toBe('bernrp:11')                // nahe der Basisnetz-Linie (über den Flächen)
    expect(rpTreffer(alle, lv(-5, 0), 1.5)?.id).toBe('bernrph:72')              // im kleinen Bereich (im grossen)
    expect(rpTreffer(alle, lv(30, 30), 1.5)?.id).toBe('bernrph:71')             // nur im grossen Bereich
    expect(rpTreffer(alle, lv(300, 300), 1.5)).toBeNull()
    expect(rpToleranzM(6, 18, 46.95)).toBeCloseTo(2.45, 2)                        // 6 px bei Zoomstufe 18 in Bern
  })
  it('Legende: eigene Marken (Basisnetz, Bereiche), Stand (Zoomstufe, lädt, Fehler), genutzte Linie', () => {
    const html = (stand: Parameters<typeof RichtplanLegende>[0]['stand'], genutzt = false) =>
      renderToStaticMarkup(<ul><RichtplanLegende stand={stand} genutzt={genutzt} netzM={15} /></ul>)
    const h = html({ an: true, zoom: true, laedt: false, fehler: [] }, true)
    expect(RP_LEGENDE).toEqual(['basisnetz', 'publikum'])
    for (const a of RP_LEGENDE) expect(h).toContain(RP_NAME[a])
    expect(h).not.toContain('Massnahme')
    expect((h.match(/class="rp-marke"/g) ?? []).length).toBe(RP_LEGENDE.length + 1)
    expect(h).toContain('die die Prüfung nutzt (quert die Fahrbahn bis 15 m vom Streifen)')
    expect(h).not.toContain('<img')
    expect(html({ an: true, zoom: false, laedt: false, fehler: [] })).toContain('erst ab Zoomstufe 15')
    expect(html({ an: true, zoom: true, laedt: true, fehler: [] })).toContain('lädt …')
    expect(html({ an: true, zoom: true, laedt: false, fehler: ['publikum'] })).toContain('nicht erreichbar: Publikumsattraktiver Bereich')
  })
})
