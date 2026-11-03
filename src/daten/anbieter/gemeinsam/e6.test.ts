import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { E6_DIENSTE, e6Dienst, e6Fuer, e6Lesen, e6Stand, e6Url, ladeE6 } from './e6'
import { regionalDienst } from './regionalDienste'
import { regionalLesen, regionalSnapshotLesen, regionalUrl, type RegionalSnapshot } from './regional'
const fixture = (id: string) => JSON.parse(readFileSync(new URL(`./testdaten/e6/${id}.json`, import.meta.url), 'utf8'))
const mitte: [number, number] = [2683000, 1252000]
afterEach(() => vi.unstubAllGlobals())

describe('E6a: Originalquellen und unveränderte Fachrechnung', () => {
  it.each([['zh.licht', 15], ['ktzh.licht', 19], ['sg.licht', 12], ['zh.taktil', 2], ['zh.netz', 333]] as const)('liest den vollständigen Originalausschnitt %s', (id, n) => {
    const d = e6Dienst('e6.' + id)!, { roh } = fixture(id), xs = e6Lesen(d, roh)
    expect(xs).toHaveLength(n); expect(new Set(xs.map(x => x.id)).size).toBe(n)
    expect(xs.every(o => !!o.punkte !== !!o.teile)).toBe(true)
    expect(xs.every(o => !('tempo' in o) && !('verkehr' in o) && !('hindernis' in o))).toBe(true)
  })
  it('wählt nur nach wirklichem Kanton und BFS, nicht nach Bewertungsstandard', () => {
    expect(e6Fuer([{ bfs: 351, kanton: 'BE' }])).toEqual([])
    expect(e6Fuer([{ bfs: 261, kanton: 'ZH' }]).map(x => x.id)).toEqual(['e6.zh.licht', 'e6.zh.taktil', 'e6.zh.netz'])
    expect(e6Fuer([{ bfs: 52, kanton: 'ZH' }]).map(x => x.id)).toEqual(['e6.ktzh.licht'])
    expect(e6Fuer([{ bfs: 230, kanton: 'ZH' }])).toEqual([])
    expect(e6Fuer([{ bfs: 3203, kanton: 'SG' }]).map(x => x.id)).toEqual(['e6.sg.licht'])
    expect(e6Fuer([{ bfs: 3204, kanton: 'SG' }])).toEqual([])
    expect(e6Fuer([{ bfs: 261 }])).toEqual([])
  })
  it('Rillen bleiben Punkte und Orientierung bleibt ein Inventarattribut', () => {
    const xs = e6Lesen(e6Dienst('e6.zh.taktil')!, fixture('zh.taktil').roh)
    expect(xs[0].punkte).toBeDefined(); expect(xs[0].hinweis).toContain('keine Rillenfläche')
    expect(xs[0].hinweis).toContain('Winkelbezug nicht abgeleitet')
  })
  it('Netz zeigt Fuss/Velo und rohe FT-/TF-Attribute ohne Zuordnung zu einer Fahrtrichtung', () => {
    const xs = e6Lesen(e6Dienst('e6.zh.netz')!, fixture('zh.netz').roh)
    expect(new Set(xs.map(x => x.kontext))).toEqual(new Set(['fuss', 'velo', 'fussvelo', 'netz_ohne']))
    expect(xs.some(o => o.hinweis.includes('einbahn=FT'))).toBe(true)
    expect(xs.some(o => o.hinweis.includes('velostreifen=BOTH'))).toBe(true)
  })
  it('fehlende Nutzungsangaben werden nicht als Nein oder gemeinsamer Weg interpretiert', () => {
    const f = fixture('zh.netz').roh; f.features = f.features.slice(0, 1); f.features[0].properties.fuss = null
    expect(e6Lesen(e6Dienst('e6.zh.netz')!, f)[0].kontext).toBe('netz_unbekannt')
  })
  it('aktuelle Metadaten gewinnen bei jedem Laden; keine HTTP-/Verarbeitungszeit als Stand', () => {
    expect(e6Stand(fixture('zh.licht').meta)).toBe('01.11.2026 (Katalogaktualisierung)')
    expect(e6Stand(fixture('zh.netz').meta)).toBe('19.10.2022 (Katalogaktualisierung)')
    expect(e6Stand(fixture('sg.licht').meta)).toContain('29.10.2021 (Katalogangabe modified')
    expect(e6Stand(fixture('ktzh.licht').meta)).toContain('unbekannt')
    expect(e6Stand({ success: true, result: { dateLastUpdated: '04.01.2027' } })).toBe('04.01.2027 (Katalogaktualisierung)')
    expect(e6Stand({ success: true, result: { dateLastUpdated: '30.02.2027' }, processed: '2027-03-02' })).toContain('unbekannt')
    expect(e6Stand('<gmd:dateStamp><gco:Date>2027-01-04</gco:Date></gmd:dateStamp>')).toContain('04.01.2027 (Metadatenaktualisierung')
  })
  it('weist falsches Koordinatensystem, Geometrietyp und doppelte Objekte zurück', () => {
    const d = e6Dienst('e6.zh.licht')!, a = fixture('zh.licht').roh
    expect(() => e6Lesen(d, { ...a, crs: undefined })).toThrow('nicht LV95')
    expect(() => e6Lesen(d, { ...a, features: [a.features[0], a.features[0]] })).toThrow('doppelte')
    a.features[0].geometry.coordinates = [8.5, 47.4]; expect(() => e6Lesen(d, a)).toThrow('ausserhalb')
    expect(() => e6Lesen(d, fixture('zh.netz').roh)).toThrow('Geometrietyp')
  })
  it('begrenzt Abfrage und liest Fall-Rohdaten erneut; manipulierte abgeleitete Werte wirken nicht', () => {
    const d = regionalDienst('e6.zh.netz')!, f = fixture('zh.netz'), url = regionalUrl(d, mitte)
    expect(url).toBe(e6Url(e6Dienst(d.id)!, mitte))
    expect(new URL(url).searchParams.get('MAXFEATURES')).toBe('2000')
    const s: RegionalSnapshot = { version: 1, mitte, radiusM: 200, teile: [{ id: d.id, url, abgerufen: '2026-11-03T12:00:00Z', datenstand: 'erfunden', roh: f.roh, meta: f.meta, objekte: [] }] }
    const t = regionalSnapshotLesen(s)!.teile[0]
    expect(t.objekte).toHaveLength(333); expect(t.datenstand).toContain('19.10.2022')
    expect(t.objekte.every(o => o.tempo === null && o.zone === null && !o.verkehr && !o.bestaetigen)).toBe(true)
    s.teile[0].url = 'https://example.org/'; expect(regionalSnapshotLesen(s)).toBeNull()
    expect(regionalLesen(d, f.roh)[0].kontext).toBeDefined()
  })
  it('liefert bei leerem vollständigem Inventar eine leere Liste, bei abgeschnittener Antwort einen Fehler', async () => {
    const d = E6_DIENSTE[0]
    let count = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const u = new URL(input)
      if (u.href === d.meta) return new Response('{}')
      if (u.searchParams.has('RESULTTYPE')) return new Response(`<FeatureCollection numberOfFeatures="${count}"/>`)
      return new Response(JSON.stringify({ type: 'FeatureCollection', crs: { properties: { name: 'EPSG:2056' } }, features: [] }))
    }))
    expect((await ladeE6(d, mitte)).daten.objekte).toEqual([])
    count = 3; await expect(ladeE6(d, mitte)).rejects.toThrow('unvollständige Antwort')
  })
  it('paginiert Explore, erkennt wechselnde Bestände und meldet Metadatenausfall getrennt', async () => {
    const d = e6Dienst('e6.sg.licht')!, f = fixture('sg.licht'), rows = f.roh.results
    let change = false
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const u = new URL(input)
      if (u.href === d.meta) return new Response('fehlt', { status: 503 })
      const off = Number(u.searchParams.get('offset'))
      return new Response(JSON.stringify({ total_count: change && off ? 13 : 12, results: rows.slice(off, off + 5) }))
    }))
    const r = await ladeE6(d, mitte); expect(r.daten.objekte).toHaveLength(12); expect(r.daten.datenstand).toContain('unbekannt')
    change = true; await expect(ladeE6(d, mitte)).rejects.toThrow('während Abruf verändert')
  })
  it('verwendet abgebrochene Antworten nicht und startet keine ungeeignete räumliche Abfrage', async () => {
    const d = E6_DIENSTE[0], f = fixture('zh.licht'), ctrl = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input === d.meta) return new Response(JSON.stringify(f.meta))
      if (new URL(input).searchParams.has('RESULTTYPE')) { ctrl.abort(); return new Response('<FeatureCollection numberOfFeatures="15"/>') }
      return new Response(JSON.stringify(f.roh))
    }))
    await expect(ladeE6(d, mitte, 200, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(ladeE6(d, [0, 0])).rejects.toThrow('Ausschnitt')
    await expect(ladeE6(d, mitte, 501)).rejects.toThrow('Ausschnitt')
  })
})


describe('Review Paket 1: fehlerhafte Antworten und Quellen ohne Kennung', () => {
  it('behält zwei St. Galler Leuchten am selben Standort mit Hash und Zähler je Geometrie', () => {
    const d = e6Dienst('e6.sg.licht')!, a = fixture('sg.licht').roh
    const roh = { ...a, total_count: 2, results: [a.results[0], { ...a.results[0] }] }
    const xs = e6Lesen(d, roh)
    expect(xs).toHaveLength(2)
    expect(xs[0].id).toMatch(/^e6\.sg\.licht:[a-f0-9]+:1$/)
    expect(xs[1].id).toMatch(/^e6\.sg\.licht:[a-f0-9]+:2$/)
    expect(xs[0].punkte).toEqual(xs[1].punkte)
    expect(e6Lesen(d, roh).map(o => o.id)).toEqual(xs.map(o => o.id))
  })
  it('meldet eine null-WFS-Antwort verständlich auf Deutsch', async () => {
    const d = E6_DIENSTE[0]
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input === d.meta) return new Response('{}')
      if (new URL(input).searchParams.has('RESULTTYPE')) return new Response('<FeatureCollection numberOfFeatures="0"/>')
      return new Response('null')
    }))
    await expect(ladeE6(d, mitte)).rejects.toThrow('ungültige Antwort')
  })
  it('überspringt unbekannte Fallteile mit Hinweis und erhält bekannte Originaldaten', () => {
    const d = regionalDienst('e6.zh.netz')!, f = fixture('zh.netz')
    const t = { id: d.id, url: regionalUrl(d, mitte), abgerufen: '2026-11-03T12:00:00Z', roh: f.roh, meta: f.meta }
    const s = { version: 1, mitte, radiusM: 200, teile: [t, { id: 'zukuenftig.unbekannt', roh: {} }] }
    const hinweise: string[] = []
    const gelesen = regionalSnapshotLesen(s, hinweise)
    expect(gelesen?.teile.map(t => t.id)).toEqual([d.id])
    expect(gelesen?.teile[0].objekte).toHaveLength(333)
    expect(hinweise.join(' ')).toContain('zukuenftig.unbekannt')
    expect(hinweise.join(' ')).toContain('übersprungen')
    expect(regionalSnapshotLesen({ ...s, teile: [{ ...t, url: 'https://example.org' }, s.teile[1]] })).toBeNull()
    expect(regionalSnapshotLesen({ ...s, teile: [s.teile[1], s.teile[1]] })).toBeNull()
  })
})


it('St. Galler Rückfallkennungen hängen weder von anderen Standorten noch von der Antwortreihenfolge ab', () => {
  const d = e6Dienst('e6.sg.licht')!, a = fixture('sg.licht').roh
  const [mast, andererMast] = a.results
  const antwort = { ...a, total_count: 3, results: [mast, { ...mast }, andererMast] }
  const xs = e6Lesen(d, antwort)
  expect(xs).toHaveLength(3)
  expect(new Set(xs.map(o => o.id)).size).toBe(3)
  const rueckwaerts = e6Lesen(d, { ...antwort, results: [...antwort.results].reverse() })
  const kennungen = (os: typeof xs) => os.map(o => ({ id: o.id, punkte: o.punkte })).sort((a,b) => a.id.localeCompare(b.id))
  expect(kennungen(rueckwaerts)).toEqual(kennungen(xs))
  const einzel = e6Lesen(d, { ...a, total_count: 1, results: [andererMast] })
  expect(einzel[0].id).toBe(xs[2].id)
})
