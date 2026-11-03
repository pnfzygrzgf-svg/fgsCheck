import roentgen from './testdaten/zuerich/roentgen.json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type P } from '../../../geo'
import { ladeZuerich, zhDatenstand, zhMetadatenUrl, zhTempoLesen, zhUrl, zhZonenLesen, zuerichSnapshotLesen, type ZuerichSnapshot } from './zuerich'
import { zuerichBei, zuerichEntlang, type ZhStrasse } from './zuerichZuordnung'
import tempoRoh from './testdaten/zuerich/tempo.json'
import zonenRoh from './testdaten/zuerich/zonen.json'
import meta from './testdaten/zuerich/tempo-metadaten.json'

const O: P = [2683050, 1247250], p = (x: number, y: number): P => [O[0] + x, O[1] + y]
const linie = [[p(-100, 0), p(100, 0)]]
const strassen = (): ZhStrasse[] => [{ name: 'Teststrasse', tags: { highway: 'residential' }, teile: linie }]
export const zhProbe = (): ZuerichSnapshot => ({ version: 1, mitte: O, radiusM: 200,
  tempo: { objekte: [{ id: 'view_geoserver_tempo_ist.1', name: 'Teststrasse', regime: 'T30', code: 'T30', umgesetzt: null,
    rechtskraeftig: null, teile: linie, tempo: 30, verbot: false, ausnahmen: '', signal: '' }], datenstand: '2026-11-02',
    url: zhUrl('tempo', O), metadaten: zhMetadatenUrl('tempo'), abgerufen: '2026-11-02T07:00:00.000Z' },
  zonen: { objekte: [{ id: 'view_geoserver_zonen_ist.1', name: 'Testzone', regime: 'T30-Zone', code: 'T30', umgesetzt: null,
    rechtskraeftig: null, art: 't30_zone', polygone: [[[p(-100, -20), p(100, -20), p(100, 20), p(-100, 20), p(-100, -20)]]] }],
    datenstand: '2026-11-02', url: zhUrl('zonen', O), metadaten: zhMetadatenUrl('zonen'), abgerufen: '2026-11-02T07:00:00.000Z' } })
afterEach(() => vi.unstubAllGlobals())
describe('Zürich: echte aktuelle Daten und Metadaten', () => {
  it('liest IST-Ebenen, Fahrverbote werden nicht zu Tempo 0; bestehende Zonen bleiben unterscheidbar', () => {
    const ls = zhTempoLesen(tempoRoh), zs = zhZonenLesen(zonenRoh)
    expect(ls).toHaveLength(101); expect(zs).toHaveLength(4)
    expect(ls.filter(l => l.verbot)).toHaveLength(64)
    expect(ls.filter(l => l.verbot).every(l => l.tempo === null)).toBe(true)
    expect(new Set(zs.map(z => z.art))).toEqual(new Set(['t30_zone', 'begegnungszone', 'fussgaengerzone']))
    expect(zhDatenstand(meta)).toBe('2026-11-02')
    expect(zhDatenstand({ success: true, result: { metadata_modified: '2026-11-02' } })).toBeNull()
    expect(zhDatenstand({ success: true, result: { dateLastUpdated: '31.02.2026' } })).toBeNull()
  })
  it('verwirft fremde/publizierte Ebenen, falsche Projektion und beschädigte Geometrie statt sie teilweise zu verwenden', () => {
    expect(() => zhTempoLesen({ ...tempoRoh, crs: { properties: { name: 'EPSG:4326' } } })).toThrow('LV95')
    expect(() => zhTempoLesen({ ...tempoRoh, features: [{ ...tempoRoh.features[0], id: 'view_gs_tempo_ab_publiziert_e.1' }] })).toThrow('Objektkennung')
    expect(() => zhTempoLesen({ ...tempoRoh, features: [{ ...tempoRoh.features[0], geometry: { type: 'LineString', coordinates: [[8, 47], [8, 48]] } }] })).toThrow('Geometrie')
    const unbekannt = structuredClone(tempoRoh); unbekannt.features[0].properties.temporegime = 'T30 nachts'; unbekannt.features[0].properties.temporegime_technical = 'T30'
    expect(zhTempoLesen(unbekannt)[0].tempo).toBeNull()
  })
  it('holt Stand bei jedem Abruf frisch und lehnt abgeschnittene Ausschnitte ab; Metadatenausfall blockiert Geometrie nicht', async () => {
    let datum = '02.11.2026', anzahl = 101, kaputt = false
    vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).includes('package_show') ? kaputt ? new Response('', { status: 503 })
      : new Response(JSON.stringify({ success: true, result: { dateLastUpdated: datum } }))
      : String(u).includes('RESULTTYPE') ? new Response(`<wfs:FeatureCollection numberOfFeatures="${anzahl}"/>`)
        : new Response(JSON.stringify(tempoRoh))))
    expect((await ladeZuerich('tempo', O)).daten.datenstand).toBe('2026-11-02')
    datum = '03.11.2026'; expect((await ladeZuerich('tempo', O)).daten.datenstand).toBe('2026-11-03')
    kaputt = true; expect((await ladeZuerich('tempo', O)).daten.objekte).toHaveLength(101)
    anzahl = 102; await expect(ladeZuerich('tempo', O)).rejects.toThrow('Übertragungsgrenze')
  })
  it('Ausschnitte bleiben gespeichert lesbar; manipulierte Ableitungen, URL oder Teilgeometrien werden verworfen', () => {
    const s = zhProbe(); expect(zuerichSnapshotLesen(JSON.parse(JSON.stringify(s)))).toEqual(s)
    const f = structuredClone(s); f.tempo!.objekte[0].tempo = 50
    expect(zuerichSnapshotLesen(f)).toBeNull()
    f.tempo!.url = 'https://example.invalid'; expect(zuerichSnapshotLesen(f)).toBeNull()
  })
})
describe('Zürich: Zuordnung zu Strasse, Richtung und Zone', () => {
  it('passender Strassenname, Längsrichtung und übereinstimmende Zone ergeben Tempo und Zonentyp', () => {
    expect(zuerichBei(zhProbe(), O, [1, 0], strassen())).toMatchObject({ status: 'zugeordnet', tempo: 30, zone: 't30_zone' })
    expect(zuerichBei(zhProbe(), O, [-1, 0], strassen()).tempo).toBe(30)
    expect(zuerichEntlang(zhProbe(), [-8, 0, 8].map(x => ({ p: p(x, 0), richtung: [1, 0] })), strassen()).tempo).toBe(30)
  })
  it('Nebenstrasse, Querachse, mehr als 4 m Distanz, fehlender Name und abweichende Höhenlage bleiben offen', () => {
    for (const t of [{ ...strassen()[0], name: 'Nebenstrasse' }, { ...strassen()[0], name: '' },
      ...['bridge', 'tunnel', 'layer'].map(k => ({ ...strassen()[0], tags: { [k]: '1' } }))])
      expect(zuerichBei(zhProbe(), O, [1, 0], [t]).tempo).toBeNull()
    expect(zuerichBei(zhProbe(), O, [0, 1], strassen()).tempo).toBeNull()
    expect(zuerichBei(zhProbe(), p(0, 5), [1, 0], strassen()).tempo).toBeNull()
  })
  it('Widersprüche zwischen Linie und Zone, parallele Temporegime und Zonenränder wählen keinen willkürlichen Wert', () => {
    const s = zhProbe(); s.tempo!.objekte[0].tempo = 50
    expect(zuerichBei(s, O, [1, 0], strassen()).grund).toContain('widersprechen')
    s.tempo!.objekte.push({ ...s.tempo!.objekte[0], id: 'zweite', tempo: 30, regime: 'T20', code: 'T20' })
    expect(zuerichBei(s, O, [1, 0], strassen()).tempo).toBeNull()
    expect(zuerichBei(zhProbe(), p(0, 19), [1, 0], [{ ...strassen()[0], teile: [[p(-100, 19), p(100, 19)]] }]).tempo).toBeNull()
  })
  it('unvollständige Quellen, künftige Umsetzung und Fussgängerzonen/Fahrverbote liefern keinen normalen Geschwindigkeitswert', () => {
    const s = zhProbe(); delete s.zonen
    expect(zuerichBei(s, O, [1, 0], strassen()).tempo).toBeNull()
    s.tempo!.objekte[0].umgesetzt = '2099-01-01'; expect(zuerichBei(s, O, [1, 0], strassen()).tempo).toBeNull()
    const f = zhProbe(); f.tempo!.objekte[0].verbot = true
    expect(zuerichBei(f, O, [1, 0], strassen()).grund).toContain('Kein Tempo 0')
    const z = zhProbe(); z.zonen!.objekte[0].art = 'fussgaengerzone'
    expect(zuerichBei(z, O, [1, 0], strassen()).zone).toBe('fussgaengerzone')
  })
})

it('Röntgenstrasse: Tagesregel T30N0 anbieten, nie als unbedingtes Tempo übernehmen',()=>{
 const s=roentgen as ZuerichSnapshot,r:P=[0.5289866073120544,-0.8486301722685109]
 const ps:P[]=[[2682270.500107837,1248554.21929878],[2682274.7320006955,1248547.430257402],[2682278.963893554,1248540.6412160238]]
 const strasse:ZhStrasse={name:'Röntgenstrasse',tags:{highway:'residential'},teile:s.tempo!.objekte[0].teile}
 const x=zuerichEntlang(s,ps.map(p=>({p,richtung:r})),[strasse])
 expect(x).toMatchObject({tempo:null,vorschlag:30,status:'offen',bedingung:'tagsüber; nachts Fahrverbot'})
 const wechsel=zuerichEntlang(s,[...ps.map(p=>({p,richtung:r})),{p:[s.mitte[0]+100,s.mitte[1]+100],richtung:r}],[strasse])
 expect(wechsel.vorschlag).toBeUndefined()
})
