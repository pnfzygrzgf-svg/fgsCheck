import { afterEach, describe, expect, it } from 'vitest'
import { retryAfterMs, sperreNachAntwort, overpassSperre, sperreZuruecksetzen, SPERRE_STANDARD_MS, SPERRE_MAX_MS, strassennamen,
  strassenMitten, namenKarte, uebergaengeAbfrage, osmParsen, overpassAbfrage, strassenlampen, wegTags, vortrittsZeichen,
  type Strassenname,
  type StrassenMitte } from './osm'
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

describe('Strassennamen vor dem Klick (Wegmitten aus der Übergangssuche)', () => {
  const O: P = [2600000, 1200000]
  const ll = (x: number, y: number) => { const [lat, lon] = wgs(O[0] + x, O[1] + y); return { lat, lon } }
  const r1 = (x: number) => Math.round(x) + 0
  const xy = (s: Strassenname) => { const p = lv95(s.lat, s.lon); return [r1(p[0] - O[0]), r1(p[1] - O[1])] }
  it('Abfrage: Übergänge wie bisher, dazu benannte befahrbare Wege nur als Mittelpunkt (ohne Geometrie)', () => {
    const q = uebergaengeAbfrage(46.9, 7.4, 46.91, 7.42)
    expect(q).toContain('node(46.900000,7.400000,46.910000,7.420000)["highway"="crossing"]')
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

describe('Umkreis-Abfrage: Haltestellen und Strassenlampen (Vorbelegung Bedarfsmodul)', () => {
  const O: P = [2600000, 1200000]
  it('eigene Menge .h mit kleinerem Umkreis, ohne Fusswege nach sich zu ziehen; Ausgabe zuletzt', () => {
    const q = overpassAbfrage(46.95, 7.44, 300)
    expect(q).toContain('node(around:150,46.9500000,7.4400000)["highway"="bus_stop"]')
    expect(q).toContain('node(around:150,46.9500000,7.4400000)["railway"="tram_stop"]')
    expect(q).toContain('["public_transport"~"^(platform|stop_position)$"][~"^(bus|trolleybus|tram)$"~"^yes$"]')
    expect(q).toContain('node(around:100,46.9500000,7.4400000)["highway"="street_lamp"];)->.h;')
    expect(q).toContain('way(bn.n)')
    expect(q).not.toContain('bn.h')
    expect(q).toContain('.f out body geom;.h out body;')
    expect(overpassAbfrage(46.95, 7.44, 80)).toContain('node(around:80,46.9500000,7.4400000)["highway"="bus_stop"]')
  })
  it('Haltestellen und Lampen ändern die Daten der Rechnung nicht; Lampen und Weg-Tags aus der Rohantwort', () => {
    const [la, lo] = wgs(O[0] + 3, O[1] + 4)
    const weg = { type: 'way', id: 1, tags: { highway: 'residential', lit: 'yes' }, nodes: [1, 2], geometry: [{ lat: la, lon: lo }, { lat: la, lon: lo + 0.001 }] }
    const basis = [weg, { type: 'node', id: 5, lat: la, lon: lo, tags: { highway: 'crossing' } }]
    const mit = [...basis, { type: 'node', id: 7, lat: la, lon: lo, tags: { highway: 'bus_stop' } },
      { type: 'node', id: 8, lat: la, lon: lo, tags: { highway: 'street_lamp' } }, { type: 'node', id: 8, lat: la, lon: lo, tags: { highway: 'street_lamp' } },
      { type: 'node', id: 5, lat: la, lon: lo, tags: { highway: 'crossing' } }]
    const parse = (e: unknown[]) => osmParsen({ elements: e } as unknown as Parameters<typeof osmParsen>[0])
    expect(parse(mit)).toEqual(parse(basis))
    const l = strassenlampen({ elements: mit })
    expect(l.length).toBe(1)
    expect(l[0][0]).toBeCloseTo(O[0] + 3, 1); expect(l[0][1]).toBeCloseTo(O[1] + 4, 1)
    expect(wegTags({ elements: mit }).get(1)).toEqual({ highway: 'residential', lit: 'yes' })
    expect(wegTags({ elements: [{ type: 'way', id: 2, tags: { highway: 'footway' } }] }).size).toBe(0)
    expect(strassenlampen(null)).toEqual([])
  })
})

describe('Umkreis-Abfrage: Schulen, Heime und Vortrittszeichen (Automatik Paket C)', () => {
  const O: P = [2600000, 1200000]
  it('eigene Mengen .s (150 m, Knoten mit Lage, Flächen mit Mittelpunkt) und .v (ganzer Umkreis), nach den Wegen ausgegeben', () => {
    const q = overpassAbfrage(46.95, 7.44, 300)
    expect(q).toContain('nwr(around:200,46.9500000,7.4400000)["amenity"~"^(school|kindergarten|social_facility|nursing_home)$"]')
    expect(q).toContain('nwr(around:200,46.9500000,7.4400000)["social_facility"~"^(nursing_home|group_home)$"];)->.s;')
    expect(q).toContain('(node(around:300,46.9500000,7.4400000)["highway"~"^(give_way|stop)$"];node(around:300,46.9500000,7.4400000)["traffic_sign"];)->.v;')
    expect(q.endsWith('.v out body;node.s;out body;(way.s;rel.s;);out tags bb;')).toBe(true)
    expect(q.indexOf('.w out body geom;')).toBeLessThan(q.indexOf('node.s;out body;'))
    expect(q).not.toContain('bn.s')
    expect(q).not.toContain('bn.v')
    expect(overpassAbfrage(46.95, 7.44, 80)).toContain('nwr(around:80,46.9500000,7.4400000)["amenity"')
  })
  it('Schulen, Heime und Vortrittszeichen ändern die Daten der Rechnung, die Weg-Tags und die Strassennamen nicht', () => {
    const [la, lo] = wgs(O[0] + 3, O[1] + 4)
    const weg = { type: 'way', id: 1, tags: { highway: 'residential', name: 'Beispielweg' }, nodes: [1, 2],
      geometry: [{ lat: la, lon: lo }, { lat: la, lon: lo + 0.001 }] }
    const basis = [weg, { type: 'node', id: 5, lat: la, lon: lo, tags: { highway: 'crossing', traffic_sign: 'CH:4.11' } }]
    const mit = [...basis,
      { type: 'node', id: 5, lat: la, lon: lo, tags: { highway: 'crossing', traffic_sign: 'CH:4.11' } },
      { type: 'node', id: 6, lat: la, lon: lo, tags: { highway: 'give_way', direction: 'forward' } },
      { type: 'node', id: 7, lat: la, lon: lo, tags: { highway: 'stop' } },
      { type: 'node', id: 8, lat: la, lon: lo, tags: { amenity: 'school', name: 'Beispielschule' } },
      { type: 'way', id: 9, tags: { amenity: 'kindergarten', name: 'Beispielhaus' }, center: { lat: la, lon: lo } },
      { type: 'way', id: 1, tags: { highway: 'residential', name: 'Beispielweg' }, center: { lat: la, lon: lo } },
      { type: 'relation', id: 10, tags: { amenity: 'social_facility', social_facility: 'nursing_home', type: 'multipolygon' }, center: { lat: la, lon: lo } }]
    const parse = (e: unknown[]) => osmParsen({ elements: e } as unknown as Parameters<typeof osmParsen>[0])
    expect(parse(mit)).toEqual(parse(basis))
    expect(wegTags({ elements: mit })).toEqual(wegTags({ elements: basis }))
    expect(strassennamen({ elements: mit }, O, 300)).toEqual(strassennamen({ elements: basis }, O, 300))
  })
  it('Vortrittszeichen: give_way, stop, sonst Schild mit traffic_sign; Richtung; ohne Doppel', () => {
    const [la, lo] = wgs(O[0] + 10, O[1])
    const roh = { elements: [
      { type: 'node', id: 1, lat: la, lon: lo, tags: { highway: 'give_way', direction: 'backward' } },
      { type: 'node', id: 1, lat: la, lon: lo, tags: { highway: 'give_way', direction: 'backward' } },
      { type: 'node', id: 2, lat: la, lon: lo, tags: { highway: 'stop', traffic_sign: 'CH:3.01' } },
      { type: 'node', id: 3, lat: la, lon: lo, tags: { traffic_sign: 'CH:3.02', 'traffic_sign:direction': 'forward' } },
      { type: 'node', id: 4, lat: la, lon: lo, tags: { highway: 'crossing' } },
      { type: 'way', id: 5, tags: { highway: 'give_way' } },
    ] }
    const v = vortrittsZeichen(roh)
    expect(v.map(z => [z.id, z.art, z.richtung, z.zeichen])).toEqual([[1, 'give_way', 'backward', null], [2, 'stop', null, 'CH:3.01'],
      [3, 'schild', 'forward', 'CH:3.02']])
    expect(v[0].p[0]).toBeCloseTo(O[0] + 10, 1)
    expect(vortrittsZeichen(null)).toEqual([])
  })
})
