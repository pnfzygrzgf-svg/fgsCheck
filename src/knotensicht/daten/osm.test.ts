import { afterEach, describe, expect, it, vi } from 'vitest'
import { retryAfterMs, sperreNachAntwort, overpassSperre, sperreZuruecksetzen, SPERRE_STANDARD_MS, SPERRE_MAX_MS, strassennamen,
  strassenMitten, namenKarte, knotenAbfrage, osmParsen, overpassAbfrage, overpassAbfrageKnoten, overpassFehlerText, verlaufText,
  ladeOsmRoh, ladeOsmUmKnoten, OVERPASS_ENDPOINTS, DOPPELT_MS, type Strassenname, type StrassenMitte } from './osm'
import { lv95, wgs, type P } from '../geo'

describe('Overpass: Sperre nach 429 bzw. Retry-After', () => {
  afterEach(sperreZuruecksetzen)
  it('Retry-After in Sekunden bzw. als HTTP-Datum, sonst null', () => {
    const jetzt = Date.parse('2026-10-11T12:00:00Z')
    expect(retryAfterMs('12', jetzt)).toBe(12000)
    expect(retryAfterMs('Sun, 11 Oct 2026 12:00:30 GMT', jetzt)).toBe(30000)
    expect(retryAfterMs('Sun, 11 Oct 2026 11:59:00 GMT', jetzt)).toBe(0)
    expect(retryAfterMs(null, jetzt)).toBeNull()
    expect(retryAfterMs('bald', jetzt)).toBeNull()
  })
  it('429 ohne Angabe: Standardsperre; mit Retry-After nach Angabe, höchstens SPERRE_MAX_MS; nie verkürzt', () => {
    const t = 1_000_000
    sperreNachAntwort(429, null, t)
    expect(overpassSperre(t)).toBe(SPERRE_STANDARD_MS)
    sperreNachAntwort(429, '5', t)                                   // kürzer: bleibt
    expect(overpassSperre(t)).toBe(SPERRE_STANDARD_MS)
    sperreNachAntwort(503, '9999', t)                                // 5xx mit Retry-After: auf das Maximum begrenzt
    expect(overpassSperre(t)).toBe(SPERRE_MAX_MS)
    expect(overpassSperre(t + SPERRE_MAX_MS + 1)).toBe(0)
  })
  it('5xx ohne Retry-After setzt keine Sperre', () => {
    sperreNachAntwort(504, null, 0)
    expect(overpassSperre(0)).toBe(0)
  })
})

describe('Overpass: Verlauf der Versuche, Fehlerseiten, Abfrage um einen Knoten (Befund 15.10.2026)', () => {
  // Fehlerseite, wie sie overpass.osm.ch am 15.10.2026 bei gleichzeitig laufender gleicher Abfrage sandte (HTTP 200)
  const DOPPELT_SEITE = '<p><strong style="color:#FF0000">Error</strong>: runtime error: open64: 0 Success /osm3s_osm_base ' +
    'Dispatcher_Client::request_read_and_idx::duplicate_query </p>'
  const host = (u: string) => new URL(u).host
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
  const holen = (antwort: (url: string, nr: number) => Response | Error) => {
    const aufrufe: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      aufrufe.push(host(url))
      const a = antwort(url, aufrufe.length)
      if (a instanceof Error) throw a
      return a
    }))
    return aufrufe
  }
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); sperreZuruecksetzen() })

  it('Fehlertext aus der Overpass-Fehlerseite; Verlauf fasst gleiche Versuche zusammen, Reihenfolge wie versucht', () => {
    expect(overpassFehlerText(DOPPELT_SEITE)).toBe('runtime error: open64: 0 Success /osm3s_osm_base ' +
      'Dispatcher_Client::request_read_and_idx::duplicate_query')
    expect(overpassFehlerText('{"elements":[]}')).toBeNull()
    expect(verlaufText([{ host: 'a', fehler: 'HTTP 502' }, { host: 'b', fehler: 'x' }, { host: 'a', fehler: 'HTTP 502' },
      { host: 'a', fehler: 'HTTP 504' }])).toBe('a: HTTP 502 (2×); b: x; a: HTTP 504')
  })
  it('alle Server fallen aus: die Meldung nennt jeden Server mit seinem Fehler, nicht nur den letzten', async () => {
    const aufrufe = holen(url => host(url) === 'overpass.osm.ch'
      ? new Response('<html>Gateway</html>', { status: 400 }) : new TypeError('Failed to fetch'))
    const fehler = await ladeOsmRoh(46.95, 7.43, 300).then(() => null, (e: Error) => e.message)
    expect(aufrufe).toEqual([...OVERPASS_ENDPOINTS, ...OVERPASS_ENDPOINTS].map(host))
    expect(fehler).toBe('Overpass nicht erreichbar. Versuche: overpass.osm.ch: HTTP 400 (2×); ' +
      'overpass-api.de: nicht erreichbar (Failed to fetch) (2×); overpass.kumi.systems: nicht erreichbar (Failed to fetch) (2×); ' +
      'overpass.private.coffee: nicht erreichbar (Failed to fetch) (2×).')
    expect(overpassSperre()).toBe(0)                              // ohne 429: keine Sperre für die folgenden Abfragen
  })
  it('gleiche Abfrage läuft noch (duplicate_query, HTTP 200): kurz warten und denselben Server nochmals fragen', async () => {
    vi.useFakeTimers()
    const aufrufe = holen((_, nr) => nr === 1 ? new Response(DOPPELT_SEITE, { status: 200 }) : json({ elements: [] }))
    const p = ladeOsmRoh(46.95, 7.43, 300)
    await vi.advanceTimersByTimeAsync(DOPPELT_MS)
    const r = await p
    expect(aufrufe).toEqual(['overpass.osm.ch', 'overpass.osm.ch'])
    expect(r.quelle).toBe('overpass.osm.ch')
  })
  it('duplicate_query zweimal: weiter zum nächsten Server; im Verlauf als «gleiche Abfrage läuft noch»', async () => {
    vi.useFakeTimers()
    holen(url => host(url) === 'overpass.osm.ch' ? new Response(DOPPELT_SEITE, { status: 200 }) : new TypeError('Failed to fetch'))
    const p = ladeOsmRoh(46.95, 7.43, 300).then(() => '', (e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(4 * DOPPELT_MS)
    expect(await p).toContain('overpass.osm.ch: gleiche Abfrage läuft noch (duplicate_query) (4×)')
  })
  it('429: Sperre für die folgenden Abfragen, im Verlauf mit Status', async () => {
    vi.useFakeTimers()
    holen(url => host(url) === 'overpass.osm.ch' ? new Response('', { status: 429 }) : new TypeError('Failed to fetch'))
    const p = ladeOsmRoh(46.95, 7.43, 300).then(() => '', (e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await p).toContain('overpass.osm.ch: HTTP 429 (2×)')
    expect(overpassSperre()).toBeGreaterThan(0)
  })
  it('Direkteinstieg: Lage des Knotens und Umkreis in einer Abfrage, sonst gleich wie um die Koordinaten', async () => {
    const q = overpassAbfrageKnoten(30949365, 300)
    expect(q.startsWith('[out:json][timeout:25];node(id:30949365)->.k;(way(around.k:300)')).toBe(true)
    expect(q).toContain('.k out;.w out body geom;')
    const ohne = (x: string) => x.replace('node(id:30949365)->.k;', '').replace('.k out;', '')
    expect(ohne(q)).toBe(overpassAbfrage(46.95456, 7.43811, 300).replace(/around:300,46\.9545600,7\.4381100/g, 'around.k:300'))
    const aufrufe = holen(() => json({ elements: [{ type: 'node', id: 30949365, lat: 46.9545565, lon: 7.4381126 },
      { type: 'node', id: 1, lat: 46.95, lon: 7.43, tags: { highway: 'crossing' } }] }))
    const r = await ladeOsmUmKnoten(30949365, 300)
    expect(aufrufe).toEqual(['overpass.osm.ch'])
    expect(r.knoten).toEqual({ id: 30949365, tags: {}, lat: 46.9545565, lon: 7.4381126 })
    expect(osmParsen(r.daten as Parameters<typeof osmParsen>[0]).uebergaenge.map(u => u.id)).toEqual([1])
    holen(() => json({ elements: [] }))
    expect((await ladeOsmUmKnoten(5, 300)).knoten).toBeNull()
  })
})

describe('Strassennamen für die Karte (aus der Rohantwort des Umkreis-Abrufs)', () => {
  const O: P = [2600000, 1200000]
  const geom = (...xy: ([number, number] | null)[]) => xy.map(q => {
    if (!q) return null
    const [lat, lon] = wgs(O[0] + q[0], O[1] + q[1])
    return { lat, lon }
  })
  const weg = (id: number, tags: Record<string, string>, ...xy: ([number, number] | null)[]) =>
    ({ type: 'way', id, tags, nodes: xy.map((_, i) => id * 10 + i), geometry: geom(...xy) })
  const r1 = (x: number) => Math.round(x * 10) / 10 + 0                              // + 0: ohne «-0»
  const xy = (s: Strassenname) => { const p = lv95(s.lat, s.lon); return [r1(p[0] - O[0]), r1(p[1] - O[1])] }
  it('je benannte Strasse in der Mitte, lange Wege in Abschnitten; je Name höchstens eine pro 120 m; nur Strassen im Umkreis', () => {
    const roh = { elements: [
      weg(1, { highway: 'tertiary', name: 'Hauptstrasse' }, [-200, 0], [220, 0]),            // 420 m: 4 Abschnitte à 105 m
      weg(2, { highway: 'residential', name: 'Querweg' }, [-40, 0], [-40, -30], [-40, -50], null),
      weg(3, { highway: 'residential', name: 'Hauptstrasse' }, [-60, 5], [-20, 5]),          // kurzes Stück neben der Beschriftung
      weg(4, { highway: 'footway', name: 'Fussweg' }, [0, -10], [0, 10]),                     // nicht befahrbar
      weg(5, { highway: 'service' }, [10, -10], [10, -60]),                                   // ohne Namen
      weg(6, { highway: 'residential', name: 'Fernweg' }, [500, 0], [600, 0]),                 // ausserhalb des Umkreises
      weg(1, { highway: 'tertiary', name: 'Hauptstrasse' }, [-200, 0], [220, 0]),             // doppelt in der Antwort
      { type: 'node', id: 9, tags: { name: 'Haltestelle' }, ...geom([0, 0])[0]! },
    ] }
    const n = strassennamen(roh, O, 300)
    // Mitten der Abschnitte bei -147,5, -42,5, 62,5 und 167,5 m; zuerst die nächste (-42,5), dann alle mindestens 120 m davon
    expect(n.filter(s => s.name === 'Hauptstrasse').map(xy)).toEqual([[-42.5, 0], [167.5, 0]])
    expect(n.filter(s => s.name === 'Querweg').map(xy)).toEqual([[-40, -25]])
    expect(n.map(s => s.name).sort()).toEqual(['Hauptstrasse', 'Hauptstrasse', 'Querweg'])
  })
  it('ohne Daten bzw. ohne Wege: keine Namen', () => {
    expect(strassennamen(null, O, 300)).toEqual([])
    expect(strassennamen({ elements: [] }, O, 300)).toEqual([])
  })
})

describe('Strassennamen vor dem Klick (Wegmitten aus der Knotensuche)', () => {
  const O: P = [2600000, 1200000]
  const ll = (x: number, y: number) => { const [lat, lon] = wgs(O[0] + x, O[1] + y); return { lat, lon } }
  const r1 = (x: number) => Math.round(x) + 0
  const xy = (s: Strassenname) => { const p = lv95(s.lat, s.lon); return [r1(p[0] - O[0]), r1(p[1] - O[1])] }
  it('Abfrage: Knoten mit drei und mehr Strassenarmen (way_link), dazu benannte befahrbare Wege nur als Mittelpunkt (ohne Geometrie)', () => {
    const q = knotenAbfrage(46.9, 7.4, 46.91, 7.42)
    expect(q).toContain('node(way_link.w:3-)(46.900000,7.400000,46.910000,7.420000); - node(w.r););out skel qt;')
    expect(q).toContain('|living_street|road)$"]["access"!~"^(no|private)$"]')
    expect(q).not.toContain('service|road)$"]["access"')
    expect(q).toMatch(/way\(46\.900000,7\.400000,46\.910000,7\.420000\)\["highway"~"\^\(motorway\|.*\|busway\)\$"\]\["name"\];out tags center;$/)
    expect(q).not.toContain('geom')
  })
  it('Wegmitten aus der Antwort: nur benannte Wege der Klassen HW_ALLE mit Mittelpunkt, ohne Doppel; Übergänge unverändert', () => {
    const roh = { elements: [
      { type: 'node', id: 5, lat: ll(0, 0).lat, lon: ll(0, 0).lon, tags: { highway: 'crossing', crossing: 'zebra' } },
      { type: 'way', id: 1, tags: { highway: 'residential', name: ' Feldweg ' }, center: ll(10, 20) },
      { type: 'way', id: 1, tags: { highway: 'residential', name: 'Feldweg' }, center: ll(10, 20) },
      { type: 'way', id: 2, tags: { highway: 'footway', name: 'Fussweg' }, center: ll(0, 0) },
      { type: 'way', id: 3, tags: { highway: 'service' }, center: ll(0, 0) },
      { type: 'way', id: 4, tags: { highway: 'tertiary', name: 'Ohne Mitte' } },
    ] }
    expect(strassenMitten(roh).map(m => [m.id, m.name])).toEqual([[1, 'Feldweg']])
    expect(osmParsen(roh as unknown as Parameters<typeof osmParsen>[0]).uebergaenge.map(k => k.id)).toEqual([5])
    expect(strassenMitten(null)).toEqual([])
  })
  it('zusammenführen: je Name eine Beschriftung pro 120 m (zuerst nahe dem Schwerpunkt); nach dem Klick im Umkreis die genauen', () => {
    // Hauptstrasse in fünf Stücken entlang x (Mitten bei 0, 50, 100, 150, 200 m), Querweg einmal
    const mitten: StrassenMitte[] = [0, 50, 100, 150, 200].map((x, i) => ({ id: 10 + i, name: 'Hauptstrasse', ...ll(x, 0) }))
    mitten.push({ id: 20, name: 'Querweg', ...ll(100, 60) })
    const vor = namenKarte(mitten)
    // Schwerpunkt bei 100 m: zuerst die Mitte dort; alle übrigen liegen höchstens 100 m davon (unter 120 m) und entfallen
    expect(vor.filter(s => s.name === 'Hauptstrasse').map(xy)).toEqual([[100, 0]])
    expect(vor.filter(s => s.name === 'Querweg').map(xy)).toEqual([[100, 60]])
    // nach dem Klick bei x = 0 (Umkreis 60 m): dort gilt die genaue Beschriftung (−20, 0); Wegmitten im Umkreis entfallen
    const genau: Strassenname[] = [{ name: 'Hauptstrasse', ...ll(-20, 0) }]
    const nach = namenKarte(mitten, genau, O, 60)
    expect(nach.filter(s => s.name === 'Hauptstrasse').map(xy)).toEqual([[-20, 0], [150, 0]])
    expect(nach.filter(s => s.name === 'Querweg').map(xy)).toEqual([[100, 60]])
  })
})
