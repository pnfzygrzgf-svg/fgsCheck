// Tests 30.10.2026: erfüllt-Grund (Ergebnis.grund → Befund.erfuelltGrund → Thema und Bericht). «Wenig Querende» (C3) ohne Befund nennt
// die Ausnahme mit der Herkunft des Werts (Geoportal, von Hand, Annahme) bzw. den besonderen Grund; der Befund selbst bleibt gleich.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { leererFall } from '../fall'
import { beurteile } from './entscheid'
import { fall } from './testfaelle'
import type { Quelle } from './eingaben'
import { befundblaetter } from './befundblatt'
import { ohneBefundZeile, themenAnsicht } from './themenansicht'
import { KATALOG } from './katalog'
import { BefundblattAnzeige } from '../BedarfPanel'

const BERN = { ebenen: { bern: true, kantonBE: true } }
const mitQuelle = (e: ReturnType<typeof fall>, f: 'netzQualifiziert' | 'beduerfnis', q: Quelle) => { e[f] = { ...e[f], quelle: q } as never; return e }

describe('erfüllt-Grund von «Wenig Querende» (C3) und «Ausnahme bei wenig Querenden» (C3b)', () => {
  it('Fusswegnetz aus dem Geoportal: C3 ohne Befund mit Grund und Quelle', () => {
    const b = beurteile(mitQuelle(fall({ fg5h: 50, netzQualifiziert: true }), 'netzQualifiziert', 'geoportal'), BERN)
    expect(b.erfuellt).toContain('C3')
    expect(b.erfuelltGrund.C3).toBe('Querung im Fusswegnetz (Geoportal Stadt Bern)')
    expect(ohneBefundZeile('Wenig Querende', b.erfuelltGrund.C3))
      .toBe('Wenig Querende: ohne Befund – Querung im Fusswegnetz (Geoportal Stadt Bern)')
    expect(b.alle.find(x => x.id === 'C3b')).toMatchObject({ staerke: 'hinweis' })
  })
  it('Fusswegnetz von Hand bzw. als Annahme', () => {
    expect(beurteile(fall({ fg5h: 50, netzQualifiziert: true }), BERN).erfuelltGrund.C3).toBe('Querung im Fusswegnetz (von Hand)')
    expect(beurteile(mitQuelle(fall({ fg5h: 50, netzQualifiziert: true }), 'netzQualifiziert', 'annahme'), BERN).erfuelltGrund.C3)
      .toBe('Querung im Fusswegnetz (Annahme)')
  })
  it('besonderer Grund für Vortritt: Haltestelle (OSM); Fusswegnetz als Grund nur mit der Ebene Bern', () => {
    const b = beurteile(mitQuelle(fall({ fg5h: 50, beduerfnis: ['haltestelle', 'fusswegnetz'] }), 'beduerfnis', 'osm'), { ebenen: { bern: false, kantonBE: false } })
    expect(b.erfuelltGrund.C3).toBe('besonderer Grund für Vortritt: Haltestelle (OSM)')
    expect(beurteile(fall({ fg5h: 50, beduerfnis: ['haltestelle', 'fusswegnetz'] }), BERN).erfuelltGrund.C3)
      .toBe('besonderer Grund für Vortritt: Haltestelle, Fusswegnetz (Bern) (von Hand)')
  })
  it('ohne Ausnahme: C3 meldet (kein Grund), C3b ohne Befund mit Verweis; genug Querende: beide mit Grund', () => {
    const b = beurteile(fall({ fg5h: 50 }), BERN)
    expect(b.alle.find(x => x.id === 'C3')).toMatchObject({ staerke: 'weich', zustand: 'verletzt' })
    expect(b.erfuelltGrund.C3).toBeUndefined()
    expect(b.erfuelltGrund.C3b).toBe('weder Fusswegnetz noch besonderer Grund für Vortritt (siehe «Wenig Querende»)')
    const v = beurteile(fall({ fg5h: 250 }), BERN)
    expect(v.erfuelltGrund.C3).toBe('genug Querende (250 in 5 Spitzenstunden, Schwelle 100)')
    expect(v.erfuelltGrund.C3b).toBe(v.erfuelltGrund.C3)
  })
  it('der Grund ändert den Befund nicht (gleich bis auf erfuelltGrund)', () => {
    const ohne = (x: object) => JSON.stringify({ ...x, erfuelltGrund: null })
    const a = beurteile(fall({ fg5h: 50, netzQualifiziert: true }), BERN)
    const b = beurteile(mitQuelle(fall({ fg5h: 50, netzQualifiziert: true }), 'netzQualifiziert', 'geoportal'), BERN)
    expect(ohne(a)).toBe(ohne(b))
  })
  it('Fundstelle mit Seite: VSS 40 241 Z. 16, S. 10', () => {
    expect(KATALOG.C3.quellen[0].ziffer).toBe('Z. 16, S. 10')
    expect(KATALOG.C3b.quellen[0].ziffer).toBe('Z. 16, S. 10')
  })
})

// ── künstliche Strasse (wie befundblatt.test.ts): Thema «Nachfrage» im Panel-Modell und im Bericht ──
const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, k: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: k.map(x => x[0]), geom: k.map(x => ll(x[1], x[2])) })
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]

describe('erfüllt-Grund in Thema und Bericht', () => {
  const f = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  f.bedarf = { felder: { fg5h: { wert: 50, quelle: 'hand' }, netzQualifiziert: { wert: true, quelle: 'hand' } } }
  const bl = befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, { vorgabe: { bern: true, kantonBE: true } })
  it('Thema «Nachfrage»: C3 ohne Befund mit Grund', () => {
    const t = themenAnsicht(bl).themen.find(x => x.thema.id === 'nachfrage')!
    expect(t.ohneBefund).toContain('C3')
    expect(t.erfuelltGrund.C3).toBe('Querung im Fusswegnetz (von Hand)')
  })
  it('Bericht: Zeile «Wenig Querende: ohne Befund – …»', () => {
    const html = renderToStaticMarkup(<BefundblattAnzeige b={bl[0]} druck />)
    expect(html).toContain('Wenig Querende: ohne Befund – Querung im Fusswegnetz (von Hand)')
  })
  it('Masse-Zeile «Querende» bei der Ausnahme: zulässig (Ausnahme) statt erfüllt (30.10.2026)', () => {
    const z = (b: { masse: { groesse: string; zustand: string; zusatz?: string }[] }) => b.masse.find(m => m.groesse.startsWith('Querende'))
    const netz = z(beurteile(mitQuelle(fall({ fg5h: 50, netzQualifiziert: true }), 'netzQualifiziert', 'geoportal'), BERN))
    expect(netz).toMatchObject({ zustand: 'ausnahme', zusatz: 'zulässig (Ausnahme: Querung im Fusswegnetz)' })
    const genug = z(beurteile(fall({ fg5h: 250 }), BERN))
    expect(genug?.zustand).toBe('erfuellt')
  })
})
