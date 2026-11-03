import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { regionalDienst, regionalFuer, REGIONAL_DIENSTE } from './regionalDienste'
import { regionalDatum, regionalLesen, regionalUrl, regionalStand, regionalSnapshotLesen, ladeRegional, type RegionalSnapshot, type RegionalObjekt } from './regional'
import { regionalBei, regionalEntlang, regionalTempo } from './regionalZuordnung'
import { regionalGeometrie, regionalGml } from './regionalGeometrie'
import type { P } from '../../../geo'
const fixture = (id: string) => { const d = regionalDienst(id)!, t = readFileSync(new URL(`./testdaten/regional/${id}.${d.format === 'gml' ? 'xml' : 'json'}`, import.meta.url), 'utf8'); return d.format === 'gml' ? t : JSON.parse(t) }
const mitte: P = [2600000, 1200000], linie: P[] = [[2599950, 1200000], [2600050, 1200000]], r: P = [1, 0]
const weg = { name: 'Teststrasse', tags: { highway: 'residential' }, teile: [linie] }
const o = (a: Partial<RegionalObjekt> = {}): RegionalObjekt => ({ id: 'a', teile: [linie], name: 'Teststrasse', tempo: 30, zone: null, bestaetigen: false, stand: null, hinweis: '', ...a })
const snap = (objekte = [o()]): RegionalSnapshot => ({ version: 1, mitte, radiusM: 200, teile: [{ id: 'ur.gemeinde.tempo', objekte, url: regionalUrl(regionalDienst('ur.gemeinde.tempo')!, mitte), roh: {}, abgerufen: '2026-11-02T00:00:00Z', datenstand: 'unbekannt' }] })
afterEach(() => vi.unstubAllGlobals())
describe('Regionale E2-Quellen', () => {
  const ids = ['ktzh.tempo', 'ktzh.zone', 'bs.tempo', 'bs.zone.100252', 'ge.tempo', 'ge.zone', 'ur.tempo', 'ur.gemeinde.tempo', 'ur.weitere.tempo', 'so.tempo', 'sz.tempo', 'fr.tempo', 'ju.tempo', 'lu.zone', 'sg.zone.tempo-30-zonen', 'lausanne.zone']
  it.each(ids)('liest Originalformat %s ohne erfundene Angaben', id => {
    const xs = regionalLesen(regionalDienst(id)!, fixture(id)); expect(xs.length).toBeGreaterThan(0)
    expect(xs.every(x => !!x.teile !== !!x.polygone)).toBe(true)
    expect(xs.every(x => x.tempo !== 0)).toBe(true)
  })
  it('unterscheidet verfügt, umgesetzt, Tag/Nacht und fehlende Werte', () => {
    expect(regionalLesen(regionalDienst('ktzh.zone')!, fixture('ktzh.zone'))[0]).toMatchObject({ zone: 't30_zone', bestaetigen: true, stand: '2026-09-21' })
    expect(regionalLesen(regionalDienst('ur.weitere.tempo')!, fixture('ur.weitere.tempo'))[0].tempo).toBeNull()
    const fr = fixture('fr.tempo'); fr.features[0].properties.VITESSE_NUIT = 30
    expect(regionalLesen(regionalDienst('fr.tempo')!, fr)[0]).toMatchObject({ tempo: 50, bestaetigen: true })
    expect(regionalLesen(regionalDienst('ju.tempo')!, fixture('ju.tempo'))[0].tempo).toBeNull()
  })
  it('fragt Gebiete nach Kanton/BFS ab; Stadt Zürich bleibt eigener IST-Dienst', () => {
    expect(regionalFuer([{ bfs: 261, kanton: 'ZH', name: 'Zürich' }]).filter(d => d.kanton !== 'CH' && !d.id.startsWith('bedarf.') && !d.id.startsWith('e6.')).map(d=>d.id)).toEqual(['stadtzh.lsa'])
    expect(regionalFuer([{ bfs: 52, kanton: 'ZH', name: 'Bassersdorf' }]).filter(d => d.kanton !== 'CH' && !d.id.startsWith('bedarf.') && !d.id.startsWith('e6.')).map(d => d.id)).toEqual(['ktzh.tempo', 'ktzh.zone', 'ktzh.fgs', 'ktzh.lsa'])
    expect(regionalFuer([{ bfs: 1061, kanton: 'LU', name: 'Luzern' }]).filter(d => d.kanton !== 'CH' && !d.id.startsWith('bedarf.') && !d.id.startsWith('e6.')).map(d => d.id)).toEqual(['lu.zone', 'lu.fgs', 'lu.lsa'])
    expect(regionalFuer([{ bfs: 1051, kanton: 'LU', name: 'Horw' }]).filter(d => d.kanton !== 'CH' && !d.id.startsWith('bedarf.') && !d.id.startsWith('e6.')).map(d=>d.id)).toEqual(['lu.fgs'])
    expect(new Set(REGIONAL_DIENSTE.map(d => d.id)).size).toBe(REGIONAL_DIENSTE.length)
  })
  it('Datenstand ist weder Abrufdatum noch Verarbeitungslauf', () => {
    expect(regionalDatum('14_08_2025')).toBe('2025-08-14'); expect(regionalDatum('2026-02-30')).toBeNull()
    expect(regionalStand(regionalDienst('bs.tempo')!, [], { metas: { default: { modified: '2026-06-09T00:00:00Z', data_processed: '2026-11-02T00:00:00Z' } } })).toBe('09.06.2026 (Katalogangabe modified)')
    expect(regionalStand(regionalDienst('sz.tempo')!, [], {})).toContain('unbekannt')
  })
  it('eindeutige namensgleiche Achse automatisch, namenlose Achse nur als Vorschlag', () => {
    expect(regionalTempo(snap(), mitte, r, [weg])).toBe(30)
    const x = regionalBei(snap([o({ name: '' })]), mitte, r, [weg])[0]
    expect(x).toMatchObject({ tempo: 30, sicher: false }); expect(regionalTempo(snap([o({ name: '' })]), mitte, r, [weg])).toBeNull()
  })
  it('keine Zuordnung bei Höhenlage, Parallelstrasse, falscher Richtung, fremdem Namen oder ausserhalb', () => {
    expect(regionalBei(snap(), mitte, r, [{ ...weg, tags: { highway: 'residential', bridge: 'yes' } }])).toEqual([])
    expect(regionalBei(snap(), mitte, r, [weg, { ...weg, name: 'Andere' }])).toEqual([])
    expect(regionalBei(snap(), mitte, [0, 1], [weg])).toEqual([])
    expect(regionalBei(snap([o({ name: 'Andere' })]), mitte, r, [weg])).toEqual([])
    expect(regionalBei(snap(), [2600200, 1200000], r, [weg])).toEqual([])
  })
  it('Widerspruch und Wechsel entlang der Querung bleiben offen', () => {
    expect(regionalBei(snap([o(), o({ id: 'b', tempo: 50 })]), mitte, r, [weg])[0]).toMatchObject({ tempo: null, sicher: false })
    expect(regionalEntlang(snap(), [{ p: mitte, richtung: r }, { p: [2600100, 1200000], richtung: r }], [weg])[0]).toMatchObject({ tempo: null, sicher: false })
  })
  it('Polygonlöcher bleiben frei; Zone allein wird nicht zum Vortrittsnachweis', () => {
    const poly: P[][] = [[[2599900,1199900],[2600100,1199900],[2600100,1200100],[2599900,1200100],[2599900,1199900]], [[2599990,1199990],[2600010,1199990],[2600010,1200010],[2599990,1200010],[2599990,1199990]]]
    const s = snap([{ ...o(), teile: undefined, polygone: [poly], tempo: null, zone: 't30_zone' }]); s.teile[0].id = 'ktzh.zone'
    expect(regionalBei(s, mitte, r, [weg])).toEqual([])
    const w = { ...weg, teile: [[[2599950, 1200030], [2600050, 1200030]]] as P[][] }
    expect(regionalBei(s, [2600000, 1200030], r, [w])[0]).toMatchObject({ tempo: 30, sicher: false })
  })
  it('liest mehrere GML-Geometrien desselben Objekts (Lausanne)', () => {
    const xml = readFileSync(new URL('./testdaten/regional/lausanne-mehrfach.xml', import.meta.url), 'utf8')
    expect(regionalGml(xml).features).toHaveLength(12)
    expect(regionalLesen(regionalDienst('lausanne.zone')!, xml).some(o => (o.polygone?.length ?? 0) > 1)).toBe(true)
  })
  it('GML verweigert Entitäten, fehlende Dimension und fremde Projektion', () => {
    const t = fixture('sz.tempo') as string
    expect(() => regionalGml(t.replace('srsDimension="2"', ''))).toThrow()
    expect(() => regionalGml(t.replace(/2056/g, '4326'))).toThrow()
    expect(() => regionalGml('<!DOCTYPE test>' + t)).toThrow()
    expect(() => regionalGeometrie({ type: 'LineString', coordinates: [[8, 47], [8.1, 47]] })).toThrow()
  })
  it('Speicherprüfung liest Rohdaten erneut und verwirft fremde URLs', () => {
    const d = regionalDienst('ktzh.tempo')!, roh = fixture(d.id), s = snap(); s.teile = [{ id: d.id, roh, objekte: [], url: regionalUrl(d, mitte), abgerufen: '2026-11-02T00:00:00Z', datenstand: 'erfunden' }]
    const x = regionalSnapshotLesen(JSON.parse(JSON.stringify(s)))!; expect(x.teile[0].objekte[0].tempo).toBe(50); expect(x.teile[0].datenstand).toContain('14.08.2025')
    s.teile[0].url = 'https://example.com'; expect(regionalSnapshotLesen(s)).toBeNull()
  })
  it('ein abgeschnittener ArcGIS-Abruf wird nie als vollständiger Bestand verwendet', async () => {
    const d = regionalDienst('ge.tempo')!
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('returnCountOnly') ? { count: 2 } : url.includes('/query') ? fixture(d.id) : {}), { status: 200 })))
    await expect(ladeRegional(d, mitte)).rejects.toThrow(/Unvollständige Antwort/)
  })
  it('Explore filtert Polygonüberschneidung, nicht Zentroid im Umkreis', () => {
    const u = new URL(regionalUrl(regionalDienst('bs.zone.100252')!, mitte))
    expect(u.searchParams.get('where')).toContain('intersects(geo_shape'); expect(u.searchParams.get('where')).not.toContain('geo_point')
  })
})
