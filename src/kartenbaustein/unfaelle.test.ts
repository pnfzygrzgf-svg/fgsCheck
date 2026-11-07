import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UnfallLegende } from './quellenLink'
import { ausschnittBox, BUND_ABRUFE } from './bund'
import { UNFALL_TIP_MAX, ladeUnfaelle, unfaelleAm, unfallEbenen, unfallHtml, unfallPunkte, type UnfallPunkt } from './unfaelle'

const treffer = (n: number, von = 0) => Array.from({ length: n }, (_, i) => ({ featureId: `U${von + i}`, geometry: { coordinates: [2600000, 1200000] }, properties: {} }))
const antwort = (results: unknown, ok = true, status = 200) => ({ ok, status, json: async () => ({ results }) })
const ebene = { layer: 'ch.astra.unfaelle-personenschaeden_alle', art: 'alle' as const }
const punkt = (id: string, e: number, titel = 'Abbiegeunfall'): UnfallPunkt => ({ id, p: [e, 1200000], titel, angaben: 'Mai 2023', url: `https://x.ch/${id}` })

afterEach(() => { vi.unstubAllGlobals() })

describe('unfallPunkte', () => {
  it('liest Angaben und Adresse, unvollständige fallen weg', () => {
    const l = unfallPunkte({ results: [{ featureId: 'AB', geometry: { coordinates: [2600000, 1200000] }, properties: { accidenttype_de: 'Abbiegeunfall', accidentyear: 2023,
      accidentmonth_de: 'Mai', accidentday_de: 'Mittwoch', accidenthour_text: '22h-23h', severitycategory_de: 'Unfall mit Leichtverletzten', roadtype_de: 'Nebenstrasse', involving_bicycle: true } },
    { featureId: 'CD', geometry: {} }] }, 'fahrraeder')
    expect(l).toHaveLength(1)
    expect(l[0].titel).toBe('Abbiegeunfall')
    expect(l[0].angaben).toBe('Mai 2023, Mittwoch, 22h-23h · Unfall mit Leichtverletzten · Nebenstrasse · mit Velo')
    expect(l[0].url).toContain('@features=AB')
  })
})

describe('ladeUnfaelle', () => {
  it('teilt einen vollen Ausschnitt, bis alle Unfälle geladen sind', async () => {
    // Dienst mit 2923 Unfällen auf einem Raster, der höchstens 200 je Abruf liefert
    const alle = Array.from({ length: 2923 }, (_, i) => ({ featureId: `U${i}`, geometry: { coordinates: [(i % 60) + 0.5, Math.floor(i / 60) + 0.5] }, properties: {} }))
    const holen = vi.fn(async (url: string) => {
      const [w, s, o, n] = new URL(url).searchParams.get('geometry')!.split(',').map(Number)
      return antwort(alle.filter(f => f.geometry.coordinates[0] >= w && f.geometry.coordinates[0] < o && f.geometry.coordinates[1] >= s && f.geometry.coordinates[1] < n).slice(0, 200))
    })
    vi.stubGlobal('fetch', holen)
    const l = await ladeUnfaelle(ebene, '0,0,64,64')
    expect(new Set(l.map(u => u.id)).size).toBe(2923)
    expect(l).toHaveLength(2923)
  })
  it('liefert nie eine gekürzte Liste: Fehler in einem Teil wirft', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => ++n < 3 ? antwort(treffer(200)) : antwort([], false, 503)))
    await expect(ladeUnfaelle(ebene, '1,2,3,4')).rejects.toThrow('HTTP 503')
  })
  it('wirft bei ungültiger Antwort und bei der Übertragungsgrenze', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: { message: 'x' } }) })))
    await expect(ladeUnfaelle(ebene, '1,2,3,4')).rejects.toThrow('unvollständig')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [], exceededTransferLimit: true }) })))
    await expect(ladeUnfaelle(ebene, '1,2,3,4')).rejects.toThrow('unvollständig')
  })
  it('wirft an der Sicherung, statt abzuschneiden', async () => {
    const holen = vi.fn(async () => antwort(treffer(200)))
    vi.stubGlobal('fetch', holen)
    await expect(ladeUnfaelle(ebene, '1,2,3,4')).rejects.toThrow('zu viele')
    expect(holen.mock.calls.length).toBeLessThanOrEqual(BUND_ABRUFE)
  })
})

describe('ausschnittBox', () => {
  it('umfasst alle vier Ecken eines schräg liegenden Ausschnitts', () => {
    expect(ausschnittBox([[100, 200], [300, 190], [310, 400], [110, 410]])).toBe('100.0,190.0,310.0,410.0')
  })
})

describe('unfallEbenen', () => {
  it('nennt nur eingeschaltete Ebenen, mit der Art aus dem Namen der Quelle', () => {
    expect(unfallEbenen(new Set(['unfaelleVelo', 'tempo']))).toEqual([{ layer: 'ch.astra.unfaelle-personenschaeden_fahrraeder', art: 'fahrraeder' }])
  })
})

describe('unfaelleAm', () => {
  it('nimmt alle im Umkreis, der nächste zuerst', () => {
    const l = [punkt('weit', 2600003), punkt('nah', 2600001), punkt('draussen', 2600009)]
    expect(unfaelleAm(l, [2600000, 1200000], 4).map(u => u.id)).toEqual(['nah', 'weit'])
  })
  it('findet auch mehrere Unfälle auf derselben Koordinate', () => {
    expect(unfaelleAm([punkt('a', 2600000), punkt('b', 2600000)], [2600000, 1200000], 1)).toHaveLength(2)
  })
})

describe('unfallHtml', () => {
  const fuenf = ['a', 'b', 'c', 'd', 'e'].map(id => punkt(id, 2600000, `Typ ${id}`))
  it('nennt beim einzelnen Unfall keine Anzahl', () => {
    expect(unfallHtml([fuenf[0]], false)).not.toContain('an dieser Stelle')
  })
  it('kürzt den Tooltip und sagt, wie viele fehlen', () => {
    const t = unfallHtml(fuenf, false)
    expect(t).toContain('5 Unfälle an dieser Stelle')
    expect(t.match(/unfall-eintrag/g)).toHaveLength(UNFALL_TIP_MAX)
    expect(t).toContain('und 2 weitere')
    expect(t).not.toContain('<a ')
  })
  it('zeigt beim Klick alle, je mit Link', () => {
    const t = unfallHtml(fuenf, true)
    expect(t.match(/unfall-eintrag/g)).toHaveLength(5)
    expect(t.match(/<a /g)).toHaveLength(5)
    expect(t).not.toContain('weitere')
  })
  it('maskiert Texte der Quelle', () => {
    expect(unfallHtml([punkt('a', 2600000, 'a<b')], false)).toContain('a&lt;b')
  })
})

describe('UnfallLegende', () => {
  it('nennt Schwere und alle elf Typen in den Farben der Quelle', () => {
    const t = renderToStaticMarkup(UnfallLegende())
    for (const wort of ['Getötete', 'Schwerverletzte', 'Leichtverletzte', 'Fussgängerunfall', 'Überholunfall oder Fahrstreifenwechsel', 'Andere']) expect(t).toContain(wort)
    expect(t).toContain('#ffff00')
    expect(t.match(/fill="#/g)).toHaveLength(11)
  })
})
