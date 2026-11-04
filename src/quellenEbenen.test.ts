import { describe, expect, it } from 'vitest'
import { ebenenAusGeo, ebenenSichtbar, tempoKlasse, dtvKlasse } from './quellenEbenen'
import type { OsmWeg } from './daten/osm'
import { regionalLesen, type RegionalSnapshot } from './daten/anbieter/gemeinsam/regional'
import { regionalDienst } from './daten/anbieter/gemeinsam/regionalDienste'
import { e6Stand } from './daten/anbieter/gemeinsam/e6'
import { readFileSync } from 'node:fs'

const weg = (id: number, tags: Record<string, string>): OsmWeg => ({ id, tags, knoten: [1, 2], geom: [[46.95, 7.44], [46.95, 7.441]] })

it('E6 zeigt tatsächliche Originalgeometrie, eigene Legende und Quelle, ohne Tempo-/OSM-Werte zu ersetzen', () => {
  const teile = ['zh.licht', 'zh.taktil', 'zh.netz'].map(id => {
    const f = JSON.parse(readFileSync(new URL(`./daten/anbieter/gemeinsam/testdaten/e6/${id}.json`, import.meta.url), 'utf8'))
    const d = regionalDienst('e6.' + id)!
    return { id: d.id, roh: f.roh, meta: f.meta, objekte: regionalLesen(d, f.roh), url: d.url, abgerufen: '2026-11-03T00:00:00Z', datenstand: e6Stand(f.meta) }
  })
  const regional: RegionalSnapshot = { version: 1, mitte: [2683000, 1252000], radiusM: 200, teile }
  const d = ebenenAusGeo({ regional }, [weg(1, { maxspeed: '30' })])
  expect(d['regional.e6.zh.licht']).toHaveLength(15)
  expect(d['regional.e6.zh.taktil']?.every(o => o.punkt && !o.ringe)).toBe(true)
  expect(d['regional.e6.zh.netz']?.[0].linien).toBeDefined()
  expect(d.tempo?.[0]).toMatchObject({ wert: '30', gestrichelt: true })
  const menu = ebenenSichtbar(d).zeigen.filter(e => e.id.startsWith('regional.e6.'))
  expect(menu.map(e => e.titel)).toEqual(['Beleuchtung (Stadt Zürich)', 'Fuss- und Velowegnetz (Stadt Zürich)', 'Taktile Rillen an VBZ-Haltestellen (Zürich)'])
  expect(menu.every(e => e.quelle.includes('Stadt Zürich'))).toBe(true)
  expect(menu[1].quelle).toContain('19.10.2022')
  expect(ebenenSichtbar(ebenenAusGeo({}, [])).ohne.some(e => e.id.startsWith('regional.e6.'))).toBe(false)
})

describe('quellenEbenen', () => {
  it('gleiche Farbstufen wie VeloroutenCheck', () => {
    expect([20, 30, 50, 80].map(tempoKlasse)).toEqual(['t20', 't30', 't50', 't60'])
    expect([1500, 4000, 25000].map(dtvKlasse)).toEqual(['d2', 'd5', 'd99'])
  })
  it('Tempo: amtlich vor OSM; ohne amtliche Linien OSM maxspeed gestrichelt', () => {
    const osm = ebenenAusGeo({}, [weg(1, { highway: 'residential', maxspeed: '30' }), weg(2, { highway: 'service' })])
    expect(osm.tempo!.map(o => [o.klasse, o.gestrichelt])).toEqual([['t30', true]])
    const amtlich = ebenenAusGeo({ vsig: { linien: [{ id: 'a', strasse: 'X', vSig: 50, teile: [[[0, 0], [10, 0]]] }], bereich: { mitte: [0, 0], radiusM: 100, form: 'quadrat' } } },
      [weg(1, { maxspeed: '30' })])
    expect(amtlich.tempo!.map(o => o.klasse)).toEqual(['t50'])
  })
  it('Strassentyp nach OSM highway, Beleuchtung aus lit, Menü nur mit Daten', () => {
    const d = ebenenAusGeo({}, [weg(1, { highway: 'tertiary', lit: 'yes' })])
    expect(d.strassentyp!.map(o => o.klasse)).toEqual(['verbindung'])
    expect(d.beleuchtung!.map(o => o.klasse)).toEqual(['lit'])
    const { zeigen, ohne } = ebenenSichtbar(d)
    expect(zeigen.map(e => e.id)).toEqual(['beleuchtung', 'strassentyp'])
    expect(ohne.map(e => e.id)).toContain('dtv')
  })
  it('Profile der Längsneigung mit Wert, Brücken als Fläche', () => {
    const d = ebenenAusGeo({}, [], [{ key: 'k', linie: [[0, 0], [50, 0]], i: -3.4, laenge: 50, zufahrt: 'Fahrlinie' }], [[[0, 0], [5, 0], [5, 5]]])
    expect(d.steigung!.map(o => [o.klasse, o.wert])).toEqual([['n2', '-3,4 %']])
    expect(d.bruecken!.length).toBe(1)
  })
})


describe('Baumkataster im Quellenfenster', () => {
  it('zeigt geladene Bäume mit Lage und Herkunft; Einträge sind alphabetisch sortiert', () => {
    const d = ebenenAusGeo({}, [weg(1, { highway: 'tertiary' })], [], [], [{ id: 'bern:1', p: [2600000, 1200000], name: 'Ahorn' }])
    expect(d.baeume?.[0]).toMatchObject({ id: 'bern:1', punkt: [2600000, 1200000], text: expect.stringContaining('Baumkataster') })
    expect(ebenenSichtbar(d).zeigen.map(e => e.titel)).toEqual(['Bäume', 'Strassentyp'])
    expect(ebenenSichtbar(ebenenAusGeo({}, [])).zeigen.some(e => e.id === 'baeume')).toBe(false)
  })
})


it('nennt nur angefragte regionale Quellen ohne Daten, keine gebietsfremden Inventare', () => {
  const daten = { 'regional.bund.tram': [], 'regional.bs.tempo': [], metadaten: { 'regional.ge.signal': { datenstand: 'unbekannt' } } }
  const ids = ebenenSichtbar(daten).ohne.map(e => e.id)
  expect(ids).toContain('regional.bund.tram')
  expect(ids).toContain('regional.bs.tempo')
  expect(ids).not.toContain('regional.ge.signal')
  expect(ids).not.toContain('regional.sg.fgs')
  expect(ids).not.toContain('zhTempo')
  expect(ebenenSichtbar({ zhTempo: [], qualitaet: { zhTempo: { datenstand: '01.11.2026' } } }).ohne.map(e => e.id)).toContain('zhTempo')
})

it('AV-Ebene führt geladene Arten, tatsächlichen Kanton und dessen Datenstand im alphabetischen Menü', async () => {
 const { ebenenBeschriften }=await import('./quellenEbenen')
 const av=[{art:'Gebaeude',kanton:'BE',qualitaet:'AV93',bfs:351,ringe:[[[2600000,1200000],[2600010,1200000],[2600010,1200010]]] as [number,number][][]}]
 const d=ebenenAusGeo({},[],[],[],[],av)
 const beschriftet=ebenenBeschriften({...d,metadaten:{av:{datenstand:'BE: 29.10.2026 (kantonale Publikation)'}}})
 const menu=ebenenSichtbar(beschriftet).zeigen
 const a=menu.find(e=>e.id==='av')!
 expect(a.titel).toBe('Amtliche Vermessung');expect(a.quelle).toContain('Kanton BE');expect(a.quelle).toContain('29.10.2026')
 expect(menu.map(e=>e.titel)).toEqual([...menu.map(e=>e.titel)].sort((a,b)=>a.localeCompare(b,'de-CH',{numeric:true})))
 expect(beschriftet.av?.[0].klasse).toBe('gebaeude')
})


describe('Ladezustand regionaler Kartenquellen', () => {
  it('trennt laufende, fehlgeschlagene und vollständig leere Abfragen', () => {
    const menu = ebenenSichtbar({
      'regional.bund.tram': [],
      metadaten: { 'regional.ge.signal': {}, 'regional.e6.sg.licht': { fehler: 'Dienst nicht erreichbar' } },
    })
    expect(menu.laedt.map(e => e.id)).toEqual(['regional.ge.signal'])
    expect(menu.fehler.map(e => e.id)).toEqual(['regional.e6.sg.licht'])
    expect(menu.ohne.map(e => e.id).filter(id => id.startsWith('regional.'))).toEqual(['regional.bund.tram'])
    expect(menu.zeigen.some(e => e.id === 'regional.e6.sg.licht')).toBe(false)
  })
  it('führt auch bei alten Objekten einen aktuellen Fehler nicht als erfolgreichen Abruf', () => {
    const o = { id: 'alt', punkt: [2600000,1200000] as [number,number], klasse: 'lampe', text: 'alt' }
    const menu = ebenenSichtbar({ 'regional.e6.sg.licht': [o], metadaten: { 'regional.e6.sg.licht': { fehler: 'nicht erreichbar' } } })
    expect(menu.fehler.map(e => e.id)).toContain('regional.e6.sg.licht')
    expect(menu.zeigen.map(e => e.id)).not.toContain('regional.e6.sg.licht')
    expect(menu.ohne.map(e => e.id)).not.toContain('regional.e6.sg.licht')
  })
  it('zeigt den Diensthinweis im tatsächlichen E6-Tooltip genau einmal', async () => {
    const { ebenenBeschriften } = await import('./quellenEbenen')
    const d = regionalDienst('e6.zh.licht')!
    const text = ebenenBeschriften({ 'regional.e6.zh.licht': [{ id: 'a', klasse: 'lampe', text: `Leuchte; ${d.hinweis}` }] })['regional.e6.zh.licht']![0].text
    expect(text.split(d.hinweis)).toHaveLength(2)
    expect(text).toContain('Stadt Zürich')
    expect(text).toContain('Datenstand')
  })
})
