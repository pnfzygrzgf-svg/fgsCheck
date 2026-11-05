// Tests Knoten, Arme, Vortrittsstrasse und Zufahrt an synthetischen OSM-Daten (T-Knoten, Kreuzung)
import { describe, expect, it } from 'vitest'
import { wgs, lv95, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import { OsmNetz } from './netz'
import { knotenInfo, knotenFinden, vortrittPaar, vortrittsSignale, signalAnArm, himmelsrichtung, istKnoten, armText, NR_GRUNDSTUECK }
  from './knoten'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const daten = (wege: OsmWeg[], vortritt: OsmDaten['vortritt'] = []): OsmDaten =>
  ({ wege, tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt })
// T-Knoten 12: Hauptstrasse West–Ost durch den Knoten, Nebenstrasse nach Süden endet am Knoten
const T = () => daten([
  weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
  weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse', maxspeed: '30' }),
])

describe('Knoten und Arme', () => {
  it('T-Knoten: drei Arme mit Richtung, Name und Himmelsrichtung', () => {
    const netz = new OsmNetz(T())
    expect(knotenFinden(netz)).toEqual([12])
    const k = knotenInfo(netz, 12)!
    expect(k.arme.map(a => [a.key, a.name, a.himmel])).toEqual([
      ['1:1:-1', 'Hauptstrasse', 'West'], ['1:1:1', 'Hauptstrasse', 'Ost'], ['2:0:1', 'Nebenstrasse', 'Süd']])
    expect(k.arme.every(a => a.zufluss)).toBe(true)
    expect(k.name).toBe('Hauptstrasse / Nebenstrasse')
    expect(k.arme[2].richtung[0]).toBeCloseTo(0, 3)
    expect(k.arme[2].richtung[1]).toBeCloseTo(-1, 3)
  })
  it('T-Knoten: Vortrittsstrasse = derselbe OSM-Weg, Zufahrt = Nebenstrasse (Vorschlag)', () => {
    const k = knotenInfo(new OsmNetz(T()), 12)!
    expect(k.vortritt).toEqual(['1:1:-1', '1:1:1'])
    expect(k.vortrittGrund).toBe('derselbe OSM-Weg führt durch den Knoten')
    expect(k.vorschlag).toBe('2:0:1')
  })
  it('gleicher Name über zwei Wege; sonst höhere Strassenklasse', () => {
    const n1 = new OsmNetz(daten([
      weg(1, [[10, -200, 0], [12, 0, 0]], { highway: 'residential', name: 'Hauptstrasse' }),
      weg(3, [[12, 0, 0], [13, 200, 0]], { highway: 'residential', name: 'Hauptstrasse' }),
      weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenweg' }),
    ]))
    const k1 = knotenInfo(n1, 12)!
    expect(k1.vortritt).toEqual(['1:1:-1', '3:0:1'])
    expect(k1.vortrittGrund).toBe('gleicher Strassenname')
    const n2 = new OsmNetz(daten([
      weg(1, [[10, -200, 0], [12, 0, 0]], { highway: 'secondary', name: 'A-Strasse' }),
      weg(3, [[12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'B-Strasse' }),
      weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'C-Weg' }),
    ]))
    const k2 = knotenInfo(n2, 12)!
    expect(k2.vortritt).toEqual(['1:1:-1', '3:0:1'])
    expect(k2.vortrittGrund).toBe('höhere Strassenklasse (OSM highway)')
    expect(k2.vorschlag).toBe('2:0:1')
  })
  it('Kreuzung: zwei Wege durch den Knoten, die höhere Klasse gilt; kein eindeutiger Vorschlag', () => {
    const netz = new OsmNetz(daten([
      weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'tertiary', name: 'Hauptstrasse' }),
      weg(2, [[21, 0, 200], [12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Querstrasse' }),
    ]))
    const k = knotenInfo(netz, 12)!
    expect(k.arme.length).toBe(4)
    expect(k.vortritt).toEqual(['1:1:-1', '1:1:1'])          // tertiary vor residential
    expect(k.vorschlag).toBeNull()
    // umgekehrte Klassen: die Querstrasse ist vortrittsberechtigt
    const n2 = new OsmNetz(daten([
      weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'residential', name: 'Hauptstrasse' }),
      weg(2, [[21, 0, 200], [12, 0, 0], [20, 0, -200]], { highway: 'secondary', name: 'Querstrasse' }),
    ]))
    expect(knotenInfo(n2, 12)!.vortritt).toEqual(['2:1:-1', '2:1:1'])
  })
  it('Stichstück: ein Arm mit gleichem Namen, der für Motorfahrzeuge nach 14 m endet, gehört nicht zur Vortrittsstrasse (Knoten 2860577444)', () => {
    const netz = new OsmNetz(daten([
      weg(1, [[30, 0, -200], [12, 0, 0]], { highway: 'residential', name: 'Marzilistrasse', maxspeed: '30' }),
      weg(2, [[12, 0, 0], [31, 2, 14]], { highway: 'residential', name: 'Marzilistrasse', maxspeed: '30' }),
      weg(3, [[31, 2, 14], [32, 5, 60]], { highway: 'pedestrian', name: 'Marzilistrasse', bicycle: 'yes' }),
      weg(4, [[12, 0, 0], [33, 100, 170]], { highway: 'residential', name: 'Aarstrasse', maxspeed: '30' }),
    ]))
    const k = knotenInfo(netz, 12)!
    const stich = k.arme.find(a => a.wid === 2)!
    expect(stich.stichM).toBeCloseTo(14.1, 0)
    expect(k.vortritt).toEqual(expect.arrayContaining(['1:1:-1', '4:0:1']))
    expect(k.vorschlag).toBe(stich.key)
    expect(k.vortrittGrund).toContain('endet nach 14 m für Motorfahrzeuge (Annahme: Stichstück)')
    // Ein Signal am Stichstück ändert nichts, eines an einem anderen Arm geht vor
    const sig = vortrittsSignale({ ...daten([]), vortritt: [{ id: 9, lat: ll(9, 15.3)[0], lon: ll(9, 15.3)[1], tags: { highway: 'give_way' } }] }, [O[0], O[1]], lv95)
    expect(knotenInfo(netz, 12, sig)!.vorschlag).toBe(k.arme.find(a => a.wid === 4)!.key)
  })
  it('Signal auf einem anderen OSM-Weg gilt nicht für den Arm daneben (Knoten 132704429)', () => {
    const netz = new OsmNetz(daten([
      weg(1, [[12, 0, 0], [13, 140, 100]], { highway: 'residential', name: 'Mühlemattstrasse' }),
      weg(2, [[12, 0, 0], [14, -16, -7]], { highway: 'residential', name: 'Mühlemattstrasse' }),
      weg(3, [[14, -16, -7], [15, -110, -33]], { highway: 'residential', name: 'Mühlemattstrasse' }),
      weg(4, [[16, -140, 55], [17, -18, -4.5], [14, -16, -7]], { highway: 'residential', name: 'Mattenhofstrasse' }),
      weg(5, [[12, 0, 0], [18, -11, -60]], { highway: 'residential', name: 'Sulgenbachstrasse' }),
    ]))
    const [lat, lon] = ll(-18, -4.5)
    const nah = vortrittsSignale({ ...daten([]), vortritt: [{ id: 17, lat, lon, tags: { highway: 'give_way' } }] }, [O[0], O[1]], lv95)
    expect(nah.length).toBe(1)
    const k = knotenInfo(netz, 12, nah)!
    expect(k.vortrittSicher).toBeUndefined()
    expect(k.vorschlag).toBe(k.arme.find(a => a.wid === 5)!.key)
  })
  it('Stichstück: bleiben keine zwei durchgehenden Arme, gilt die Regel nach Weg, Name und Klasse', () => {
    const netz = new OsmNetz(daten([
      weg(1, [[10, -10, 0], [12, 0, 0], [13, 10, 0]], { highway: 'residential', name: 'Kurz' }),
      weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Lang' }),
    ]))
    expect(knotenInfo(netz, 12)!.vortritt).toEqual(['1:1:-1', '1:1:1'])
  })
  it('Zufahrt auf der Vortrittsstrasse: die übrigen Arme bilden die Vortrittsstrasse', () => {
    const k = knotenInfo(new OsmNetz(T()), 12)!
    const vp = vortrittPaar(k.arme, '1:1:1')!
    expect(vp[0].map(a => a.key).sort()).toEqual(['1:1:-1', '2:0:1'])
  })
  it('service zählt nicht als Strassenarm (E0): zwei Strassen und eine Zufahrt sind kein Knoten', () => {
    const netz = new OsmNetz(daten([
      weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'residential', name: 'Hauptstrasse' }),
      weg(2, [[12, 0, 0], [20, 0, -50]], { highway: 'service' }),
    ]))
    expect(istKnoten(netz, 12)).toBe(false)
    expect(knotenInfo(netz, 12)).toBeNull()
  })
  it('Einbahn vom Knoten weg: Arm ohne Zufluss', () => {
    const netz = new OsmNetz(daten([
      weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'residential', name: 'Hauptstrasse', oneway: 'yes' }),
      weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', name: 'Nebenstrasse' }),
    ]))
    const k = knotenInfo(netz, 12)!
    expect(k.arme.find(a => a.key === '1:1:-1')!.zufluss).toBe(true)     // von Westen zum Knoten
    expect(k.arme.find(a => a.key === '1:1:1')!.zufluss).toBe(false)     // nach Osten vom Knoten weg
  })
  it('Nummern: im Uhrzeigersinn ab Norden (Nord 1, Ost 2, Süd 3, West 4), unabhängig von der Reihenfolge der Wege', () => {
    // Vierarm-Knoten 12: Weg 1 von Süden nach Westen, Weg 2 von Osten nach Norden (OSM-Reihenfolge der Arme: Süd, West, Ost, Nord)
    const netz = new OsmNetz(daten([
      weg(1, [[20, 0, -200], [12, 0, 0], [10, -200, 0]], { highway: 'residential', name: 'Südwestweg' }),
      weg(2, [[13, 200, 0], [12, 0, 0], [21, 0, 200]], { highway: 'residential', name: 'Nordostweg' }),
    ]))
    const k = knotenInfo(netz, 12)!
    const nr = Object.fromEntries(k.arme.map(a => [a.himmel, a.nr]))
    expect(nr).toEqual({ Nord: '1', Ost: '2', Süd: '3', West: '4' })
    expect(k.arme.map(a => a.himmel)).not.toEqual(['Nord', 'Ost', 'Süd', 'West'])   // Nummer nicht aus der Reihenfolge
    // knapp westlich von Nord (Sehne 0,5° neben Nord) zählt als Nord: Nummer 1, nicht die letzte
    const n2 = new OsmNetz(daten([
      weg(1, [[20, 0, -200], [12, 0, 0], [10, -200, 0]], { highway: 'residential', name: 'A' }),
      weg(2, [[13, 200, 0], [12, 0, 0], [21, -1.7, 200]], { highway: 'residential', name: 'B' }),
    ]))
    expect(knotenInfo(n2, 12)!.arme.find(a => a.himmel === 'Nord')!.nr).toBe('1')
  })
  it('T-Knoten: Ost 1, Süd 2, West 3; Anzeigename «Nummer Name (Himmelsrichtung)»', () => {
    const k = knotenInfo(new OsmNetz(T()), 12)!
    expect(k.arme.map(armText)).toEqual(['3 Hauptstrasse (West)', '1 Hauptstrasse (Ost)', '2 Nebenstrasse (Süd)'])
    expect(armText({ nr: '', name: '', hw: 'residential', himmel: 'Süd' })).toBe('residential (Süd)')   // ohne Nummer, ohne Name
    expect(armText({ nr: NR_GRUNDSTUECK, name: 'Grundstückzufahrt', hw: 'Grundstückzufahrt', himmel: 'Nord' }))
      .toBe('Z Grundstückzufahrt (Nord)')
  })
  it('Himmelsrichtung (x Ost, y Nord)', () => {
    expect([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(v => himmelsrichtung(v as P))).toEqual(
      ['Ost', 'Nordost', 'Nord', 'Nordwest', 'West', 'Südwest', 'Süd', 'Südost'])
  })
  it('Vortrittssignal (OSM highway=give_way) an der Zufahrt bzw. an einem anderen Arm', () => {
    const [la, lo] = ll(0, -5), [la2, lo2] = ll(-8, 0), [la3, lo3] = ll(0, -80)
    const osm = daten(T().wege, [{ id: 1, tags: { highway: 'give_way' }, lat: la, lon: lo },
      { id: 2, tags: { highway: 'stop' }, lat: la2, lon: lo2 }, { id: 3, tags: { highway: 'stop' }, lat: la3, lon: lo3 }])
    const netz = new OsmNetz(osm)
    const sig = vortrittsSignale(osm, netz.p(12), lv95)
    expect(sig.map(s => s.id)).toEqual([1, 2])                // Nr. 3 zu weit vom Knoten
    const k = knotenInfo(netz, 12, sig)!
    const z = k.arme.find(a => a.key === '2:0:1')!
    expect(signalAnArm(netz, z, sig[0])).toBe(true)
    expect(signalAnArm(netz, z, sig[1])).toBe(false)
  })
})
