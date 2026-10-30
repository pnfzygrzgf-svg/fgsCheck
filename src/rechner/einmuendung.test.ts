// Tests Querung an einer Einmündung (Nutzerentscheid 30.10.2026): mündet die gequerte Strasse unmittelbar an der Querung in eine
// andere, gilt für die Gegenseite einer Querung ohne Vortritt (bzw. in der Begegnungszone) genau eine Zufahrt entlang der gequerten
// Strasse bis zum nächsten Knoten (Annahme der App, Normwert sichtbar); die Abbieger an jenem Knoten entfallen («mitgeprueft»).
// Künstliche Strassen (keine echten Daten): Hauptstrasse West–Ost (y = 0), Seitenstrasse Nord–Süd (x = 0) mündet von Süden ein,
// Querstrasse West–Ost 55 m südlich der Querung; die Seitenstrasse setzt sich über die Querstrasse nach Süden fort.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall, type FallRechnung } from './index'
import { sichtOhneVortritt, quelleOhneVortritt, quelleAnnahme, BIS_KNOTEN, EINMUENDUNG_NAH_M } from './ohneVortritt'
import { SICHTWEITE } from './tempo'
import { leererFall, type Fall } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { entfallenGrund, sichtQuelleKurz } from '../texte'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const av = (ring: P[]): AvFlaeche => ({ art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [ring] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
/** Querstrasse auf der Höhe YQ (Knoten 55 m südlich der Querung bei y = YU) */
const YU = -8, YQ = -63
const UNMARKIERT = { highway: 'crossing', crossing: 'unmarked' }
const ZEBRA = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }
/** yU: Lage der Querung auf der Seitenstrasse */
const osm = (uTags: Record<string, string>, yU = YU, seiteTags: Record<string, string> = {}): OsmDaten => ({
  wege: [weg(1, [[10, -300, 0], [11, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[11, 0, 0], [30, 0, yU], [21, 0, YQ], [22, 0, -300]], { highway: 'residential', name: 'Seitenstrasse', maxspeed: '50', ...seiteTags }),
    weg(3, [[40, -300, YQ], [21, 0, YQ], [41, 300, YQ]], { highway: 'residential', name: 'Querstrasse', maxspeed: '30' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 30, tags: uTags, lat: ll(0, yU)[0], lon: ll(0, yU)[1] }],
})
const AV = [av(rechteck(-300, -4, 300, 4)), av(rechteck(-3, -300, 3, -3.9)), av(rechteck(-300, YQ - 4, 300, YQ + 4))]
const fall = (yU = YU, f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, yU)[0], ll(0, yU)[1], 30); f(x); return x }
const gerade = (r: FallRechnung) => r.streifen[0].zufahrten.filter(z => z.art !== 'abbiegend')
const abbiegend = (r: FallRechnung, strasse: string) => r.streifen[0].zufahrten.filter(z => z.art === 'abbiegend' && z.strasse === strasse)
const minY = (pts: P[]) => Math.min(...pts.map(p => p[1] - O[1]))

describe('Querung ohne Vortritt an einer Einmündung: eine Zufahrt der Gegenseite bis zum nächsten Knoten', () => {
  const ov = rechneFall(osm(UNMARKIERT), AV, [], 30, fall(), null)
  const L = ov.streifen[0].querung!.L
  const norm = sichtOhneVortritt(50, L)
  it('Gegenseite: Soll = Strecke bis zum Knoten (Annahme), Normwert sichtbar; keine Fortsetzung durch den Knoten', () => {
    expect(ov.streifen[0].querung!.typ).toBe('ohne_vortritt')
    const g = gerade(ov)
    expect(g.length).toBe(1)
    const z = g[0]
    expect(norm).toBeGreaterThan(55)
    expect(z.strasse).toBe('Seitenstrasse')
    // Knoten 55 m von der Querungsachse, Streifenrand 2 m davor: rund 53 m (auf 0,1 m aufwärts)
    expect(z.sichtweite).toBeGreaterThanOrEqual(53)
    expect(z.sichtweite).toBeLessThanOrEqual(53.1)
    expect(z.annahmeGrenze).toEqual({ grenze: BIS_KNOTEN, normM: norm })
    expect(z.sichtweiteQuelle).toBe(quelleAnnahme({ typ: 'ohne_vortritt', L }, { grenze: BIS_KNOTEN, normM: norm }))
    expect(sichtQuelleKurz(z.sichtweiteQuelle)).toBe(`Annahme: bis zum nächsten Knoten; nach VSS 40 240 Z. 8.2 wären es ${String(norm).replace('.', ',')} m`)
    // Sichtpunkte bis zum Knoten, nicht weiter nach Süden
    expect(minY(z.sichtpunkte)).toBeGreaterThan(YQ - 2)
  })
  it('Abbieger an jenem Knoten entfallen (durch die Zufahrt mitgeprüft); Abbieger an der Einmündung bleiben (bis Beginn des Abbiegens)', () => {
    expect(abbiegend(ov, 'Querstrasse')).toEqual([])
    const mit = ov.streifen[0].entfallen.filter(e => e.grund === 'mitgeprueft')
    expect(mit.length).toBe(2)
    const t = entfallenGrund(mit[0], ov.streifen[0], ov.streifen, id => id, (_, z) => `Z${z}`)
    expect(t.text).toBe(`durch die Zufahrt «Z${gerade(ov)[0].zufahrt}» mitgeprüft: an einer Einmündung zählt aus der gequerten Strasse eine ` +
      'Zufahrt bis zum nächsten Knoten')
    const haupt = abbiegend(ov, 'Hauptstrasse')
    expect(haupt.length).toBe(2)
    for (const z of haupt) expect(z.annahmeGrenze?.grenze, z.zufahrt).toBe('bis Beginn des Abbiegens')
  })
  it('Tempo von Hand: Normwert unter der Strecke bis zum Knoten -> ohne Annahme', () => {
    const z0 = gerade(ov)[0]
    const t = gerade(rechneFall(osm(UNMARKIERT), AV, [], 30, fall(YU, x => { x.zufahrten[`30|${z0.kennung}`] = { tempo: 30 } }), null))[0]
    expect(sichtOhneVortritt(30, L)).toBeLessThan(z0.sichtweite)
    expect([t.tempo, t.sichtweite, t.sichtweiteQuelle, t.annahmeGrenze]).toEqual([30, sichtOhneVortritt(30, L), quelleOhneVortritt(L), undefined])
  })
  it('Befundblatt: Soll als Annahme (Sichtzeile, Masse-Zeile, Annahmen)', () => {
    const [b] = befundblaetter(ov, fall(), { vorgabe: { bern: false, kantonBE: false } })
    const x = b.sicht.find(s => !s.zufahrt.startsWith('a'))!
    expect(x.annahme).toBe(`Annahme: bis zum nächsten Knoten; VSS 40 240 Z. 8.2: ${String(norm).replace('.', ',')} m`)
    const sw = String(gerade(ov)[0].sichtweite).replace('.', ',')
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')!.soll.startsWith(`${sw} geradeaus (Annahme: bis zum nächsten Knoten), `)).toBe(true)
    expect(b.annahmen.some(a => a.includes(`${sw} m – Annahme: bis zum nächsten Knoten`))).toBe(true)
  })
  it('Begegnungszone an derselben Einmündung: Anhaltesichtweite 55 m (living_street, 50 km/h) bis zum Knoten gekürzt; 20 km/h: 15 m ohne Annahme', () => {
    const b50 = rechneFall(osm(UNMARKIERT, YU, { highway: 'living_street' }), AV, [], 30, fall(), null)
    expect(b50.streifen[0].querung!.typ).toBe('begegnungszone')
    const z = gerade(b50)[0]
    expect(z.annahmeGrenze).toEqual({ grenze: BIS_KNOTEN, normM: 55 })
    expect(sichtQuelleKurz(z.sichtweiteQuelle)).toBe('Annahme: bis zum nächsten Knoten; Anhaltesichtweite nach VSS 40 240 Z. 8.2 wären 55 m')
    expect(abbiegend(b50, 'Querstrasse')).toEqual([])
    const b20 = rechneFall(osm(UNMARKIERT, YU, { highway: 'living_street', maxspeed: '20' }), AV, [], 30, fall(), null)
    expect(gerade(b20).map(x => [x.sichtweite, x.annahmeGrenze])).toEqual([[15, undefined]])
  })
  it('Fussgängerstreifen an derselben Einmündung unverändert: gerade Zufahrt nach Tab. 1, ohne Annahme', () => {
    const fgs = rechneFall(osm(ZEBRA), AV, [], 30, fall(), null)
    expect(fgs.streifen[0].querung).toBeUndefined()
    expect(gerade(fgs).map(z => [z.sichtweite, z.sichtweiteQuelle, z.annahmeGrenze])).toEqual([[SICHTWEITE[50], 'VSS Tab. 1', undefined]])
    expect(fgs.streifen[0].entfallen.some(e => e.grund === 'mitgeprueft')).toBe(false)
  })
  it('Querung mitten im Abschnitt (Einmündung weiter als 15 m): unverändert, die gerade Zufahrt läuft durch den Knoten', () => {
    const y = -30
    expect(-y - 2).toBeGreaterThan(EINMUENDUNG_NAH_M)
    const r = rechneFall(osm(UNMARKIERT, y), AV, [], 30, fall(y), null)
    expect(r.streifen[0].entfallen.some(e => e.grund === 'mitgeprueft')).toBe(false)
    const sued = r.streifen[0].zufahrten.find(z => z.art !== 'abbiegend' && z.richtung === 90)!
    expect(sued.annahmeGrenze).toBeUndefined()
    expect(sued.sichtweite).toBe(sichtOhneVortritt(50, r.streifen[0].querung!.L))
    expect(minY(sued.sichtpunkte)).toBeLessThan(YQ - 5)
  })
})
