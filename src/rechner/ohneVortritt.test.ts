// Tests Bedarfsmodul E1: Querung ohne Vortritt im Sichtrechner (VSS 40 240 Z. 8.2: Soll = max(v · L / 1,2; Anhaltesichtweite) je
// Teilquerung, bei nur markierter Insel L = ganze Fahrbahn). Künstliche Strassen (keine echten Daten): Hauptstrasse West–Ost,
// Übergang bei x = 0. Fussgängerstreifen bleiben unverändert (Regression).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wgs, dist, type P } from '../geo'
import { osmParsen } from '../daten/osm'
import { avParsen } from '../daten/av'
import { kontextBauen, rechneUebergang } from './index'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from './index'
import { sichtOhneVortritt, quelleOhneVortritt, REICHWEITE_SICHT_M, annahmeOhneVortritt } from './ohneVortritt'
import { inselLage, inselMasse, inselFlaechen, streifenTeilen, E1_TIEFE_M, E1_BREITE_M, E1_FURT_M } from './standardinsel'
import { leererFall, fallLesen, fallSchreiben, type Fall } from '../fall'
import type { FallRechnung } from './index'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const osm = (maxspeed: string): OsmDaten => ({
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
})
/** Fahrbahn halbe Breite b (m), Trottoir 3 m */
const avStrasse = (b: number): AvFlaeche[] => [av('Strasse_Weg', rechteck(-300, -b, 300, b)), av('Trottoir', rechteck(-300, b, 300, b + 3)),
  av('Trottoir', rechteck(-300, -b - 3, 300, -b))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const gerade = (r: FallRechnung) => r.streifen.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend'))
const kurz = (r: FallRechnung) => r.streifen.flatMap(s => s.zufahrten.map(z => [s.fgsId, z.zufahrt, z.art, z.tempo, z.sichtweite, z.sichtweiteQuelle, z.status]))

describe('Soll-Sichtweite ohne Vortritt (Formel, Rundung)', () => {
  it('30 km/h, L 6 m: v · L / 1,2 = 41,67 m, über der Anhaltesichtweite 25 m -> 41,7 m', () => {
    expect(sichtOhneVortritt(30, 6)).toBe(41.7)
  })
  it('kurze Teilquerung: Anhaltesichtweite massgebend (30 km/h, L 3 m: 20,8 < 25; 50 km/h, L 3,5 m: 40,5 < 55)', () => {
    expect(sichtOhneVortritt(30, 3)).toBe(25)
    expect(sichtOhneVortritt(50, 3.5)).toBe(55)
  })
  it('Normbeispiele 40 240 Abb. 1: 50 km/h und 7 m 81,1 m (81,0 aufgerundet); markierte Insel 8 m: 92,6 m', () => {
    expect(sichtOhneVortritt(50, 7)).toBe(81.1)
    expect(sichtOhneVortritt(50, 8)).toBe(92.6)
  })
})

describe('Sichtrechner: Querung ohne Vortritt (Fahrbahn 6 m, Tempo 30)', () => {
  const OSM = osm('30'), AV = avStrasse(3)
  const fgs = rechneFall(OSM, AV, [], 12, fallMit(), null)
  const fid = fgs.streifen[0].fgsId
  const ov = rechneFall(OSM, AV, [], 12, fallMit(x => { x.streifen[fid] = { typ: 'ohne_vortritt' } }), null)
  it('Fussgängerstreifen wie bisher: Tab. 1, 25 m, ohne Kennzeichen «querung»', () => {
    expect(gerade(fgs).map(z => [z.tempo, z.sichtweite, z.sichtweiteQuelle])).toEqual([[30, 25, 'VSS Tab. 1'], [30, 25, 'VSS Tab. 1']])
    expect(fgs.streifen[0].querung).toBeUndefined()
  })
  it('ohne Vortritt: L = 6,00 m (Bord–Bord), Soll 41,7 m je Zufahrt, Quelle Z. 8.2, Annahme mit Formel', () => {
    const s = ov.streifen[0]
    expect(s.querung).toEqual({ typ: 'ohne_vortritt', L: 6, ganzeFahrbahn: false })
    expect(gerade(ov).map(z => [z.tempo, z.sichtweite, z.sichtweiteQuelle])).toEqual([[30, 41.7, quelleOhneVortritt(6)], [30, 41.7, quelleOhneVortritt(6)]])
    expect(quelleOhneVortritt(6)).toBe('VSS 40 240 Z. 8.2 (L 6,0 m)')
    expect(s.annahmen.find(a => a.startsWith('Querung ohne Vortritt'))).toContain('30 km/h: max(41,7; 25) = 41,7 m')
    // Sichtpunkte bis zur Soll-Sichtweite (ab dem Streifenrand): weiter als beim Fussgängerstreifen
    const weit = (r: FallRechnung) => Math.max(...gerade(r).flatMap(z => z.sichtpunkte.map(p => Math.abs(p[0] - O[0]))))
    expect(weit(ov)).toBeGreaterThan(41.7); expect(weit(fgs)).toBeLessThan(30)
  })
  it('Tempo von Hand gilt (50 km/h: max(69,4; 55) = 69,5 m)', () => {
    const k = gerade(ov)[0].kennung
    const r = rechneFall(OSM, AV, [], 12, fallMit(x => { x.streifen[fid] = { typ: 'furt' }; x.zufahrten[`${fid}|${k}`] = { tempo: 50 } }), null)
    expect(gerade(r).find(z => z.kennung === k)!.sichtweite).toBe(69.5)
    expect(r.streifen[0].querung!.typ).toBe('furt')
  })
  it('Hindernisprüfung des Sichtrechners: Parkfeld 30 bis 35 m vor dem Streifen verdeckt nur die längere Sicht ohne Vortritt', () => {
    const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-35, -3, -30, -1), quelle: 'hand' })
    const f1 = rechneFall(OSM, AV, [], 12, fallMit(park), null)
    const o1 = rechneFall(OSM, AV, [], 12, fallMit(x => { park(x); x.streifen[fid] = { typ: 'ohne_vortritt' } }), null)
    const west = (r: FallRechnung) => gerade(r).find(z => z.richtung === 0)!
    expect(west(f1).status).toBe('frei')
    expect(west(o1).status).toBe('verdeckt')
  })
  it('«kein FGS» bleibt: nicht geprüft, auch mit Querungstyp in der Datei (Hinweis beim Lesen, kein FGS geht vor)', () => {
    const roh = JSON.parse(fallSchreiben(fallMit()))
    roh.version = 3
    roh.streifen = { [fid]: { keinFgs: true, typ: 'ohne_vortritt' } }
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.streifen[fid]).toEqual({ keinFgs: true })
    expect(h.join(' ')).toContain('«kein FGS» gilt')
    const r = rechneFall(OSM, AV, [], 12, g, null)
    expect(r.streifen[0].status).toBe('kein_fgs'); expect(r.streifen[0].querung).toBeUndefined()
  })
  it('Bedarf-Eingaben ändern die Rechnung nicht (ausser «Insel nur markiert»): gleiches Ergebnis wie ohne Block', () => {
    const mit = rechneFall(OSM, AV, [], 12, fallMit(x => {
      x.bedarf = { felder: { dtv: { wert: 8000, quelle: 'hand' }, fgKlasse: { wert: '100-500', quelle: 'schaetzung' },
        'insel.vorhanden': { wert: false, quelle: 'hand' } }, ebenen: { bern: false } }
    }), null)
    const { ms: _a, ...a } = mit, { ms: _b, ...b } = fgs
    void _a; void _b
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('Sichtrechner ohne Vortritt: abbiegende Zufahrt (Querweg Tempo 30, 40 m vor dem Streifen)', () => {
  const OSM: OsmDaten = { ...osm('50'), wege: [weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
  const AV: AvFlaeche[] = [
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-300, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), lv(-37, -4),
      lv(300, -4), lv(300, 4), lv(-300, 4), lv(-300, -4)]] },
    av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-36, -7, 300, -4))]
  it('Fussgängerstreifen: Abbieger durch die gerade Zufahrt mitgeprüft (entfällt); ohne Vortritt: Soll nach Z. 8.2 ohne Kurvenregel, geprüft', () => {
    const fgs = rechneFall(OSM, AV, [], 12, fallMit(), null)
    expect(fgs.streifen[0].entfallen.some(e => e.zufahrt === 'a90' && e.grund === 'gedeckt')).toBe(true)
    const fid = fgs.streifen[0].fgsId
    const ov = rechneFall(OSM, AV, [], 12, fallMit(x => { x.streifen[fid] = { typ: 'ohne_vortritt' } }), null)
    const ab = ov.streifen[0].zufahrten.find(z => z.art === 'abbiegend')!
    expect([ab.zufahrt, ab.tempo, ab.sichtweite, ab.sichtweiteQuelle]).toEqual(['a90', 30, 55.6, 'VSS 40 240 Z. 8.2 (L 8,0 m)'])
    expect(gerade(ov).map(z => z.sichtweite)).toEqual([92.6, 92.6])
  })
})

describe('Sichtrechner ohne Vortritt an einer Mittelinsel (Fahrbahn 8 m, Tempo 50)', () => {
  const OSM = osm('50'), AV = avStrasse(4)
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0]), E1 = inselMasse(E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, null, 'links')
  const geteilt = (f: (x: Fall) => void = () => {}) => fallMit(x => {
    const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), lage, E1)
    if (!('teile' in t)) throw new Error(t.grund)
    t.teile.forEach(([p0, p1], i) => x.streifenHand.push({ id: `hand-${i + 1}`, p0, p1, breite: 4, herkunft: 'gezeichnet' }))
    x.flaechenPlan = inselFlaechen(lage, E1, 'e1-1', false).map((y, i) => ({ id: `plan-${i + 1}`, ...y }))
    f(x)
  })
  const fgs = rechneFall(OSM, AV, [], 12, geteilt(), null)
  it('je Teilquerung L 3,00 m: Anhaltesichtweite 55 m massgebend (Formel 34,7 m)', () => {
    const r = rechneFall(OSM, AV, [], 12, geteilt(x => { x.streifen['hand-1'] = { typ: 'furt' }; x.streifen['hand-2'] = { typ: 'furt' } }), null)
    expect(r.streifen.map(s => s.querung)).toEqual([{ typ: 'furt', L: 3, ganzeFahrbahn: false }, { typ: 'furt', L: 3, ganzeFahrbahn: false }])
    expect([...new Set(gerade(r).map(z => z.sichtweite))]).toEqual([55])
  })
  it('Insel nur markiert (Bedarf): L über die ganze Fahrbahn 8,00 m, Soll 92,6 m', () => {
    const r = rechneFall(OSM, AV, [], 12, geteilt(x => {
      x.streifen['hand-1'] = { typ: 'furt' }; x.streifen['hand-2'] = { typ: 'furt' }
      x.bedarf = { felder: { 'insel.vorhanden': { wert: true, quelle: 'hand' }, 'insel.art': { wert: 'markiert', quelle: 'hand' } } }
    }), null)
    expect(r.streifen.map(s => s.querung)).toEqual([{ typ: 'furt', L: 8, ganzeFahrbahn: true }, { typ: 'furt', L: 8, ganzeFahrbahn: true }])
    expect([...new Set(gerade(r).map(z => z.sichtweite))]).toEqual([92.6])
  })
  it('Fussgängerstreifen an der Insel unverändert (Tab. 1, 55 m)', () => {
    expect([...new Set(gerade(fgs).map(z => [z.sichtweite, z.sichtweiteQuelle].join()))]).toEqual(['55,VSS Tab. 1'])
    expect(kurz(fgs)).toEqual(kurz(rechneFall(OSM, AV, [], 12, geteilt(x => { x.bedarf = { felder: { dtv: { wert: 5000, quelle: 'hand' } } } }), null)))
  })
})

describe('Reichweite der geladenen Daten (Korrektur E1): ohne Vortritt geprüft höchstens bis 110 m', () => {
  it('Herleitung: Kataster-Reichweite 120 m um den Umriss minus 10 m Reserve um die Sichtpunkte', () => {
    expect(REICHWEITE_SICHT_M).toBe(110)
  })
  it('synthetisch (Tempo 80 von Hand, L 8 m: Soll 148,2 m): Sichtpunkte nur bis 110 m, Soll und «geprüft bis» ausgewiesen', () => {
    const OSM = osm('50'), AV = avStrasse(4)
    const fid = rechneFall(OSM, AV, [], 12, fallMit(), null).streifen[0].fgsId
    const k0 = gerade(rechneFall(OSM, AV, [], 12, fallMit(), null)).map(z => z.kennung)
    const r = rechneFall(OSM, AV, [], 12, fallMit(x => {
      x.streifen[fid] = { typ: 'ohne_vortritt' }
      for (const k of k0) x.zufahrten[`${fid}|${k}`] = { tempo: 80 }
    }), null)
    for (const z of gerade(r)) {
      expect([z.sichtweite, z.geprueftBisM, z.sichtweiteQuelle]).toEqual([148.2, 110, quelleOhneVortritt(8)])
      expect(Math.max(...z.sichtpunkte.map(p => Math.abs(p[0] - O[0])))).toBeLessThanOrEqual(110 + 2 + 0.5)
    }
    expect(annahmeOhneVortritt({ typ: 'furt', L: 8, ganzeFahrbahn: false }, [80])).toContain('Tempo über 60 km/h (80 km/h)')
    expect(annahmeOhneVortritt({ typ: 'furt', L: 6, ganzeFahrbahn: false }, [50])).toContain('50 km/h: max(69,5; 55) = 69,5 m')
  })
  const DIR = '/Users/dmnk/Documents/fgsCheck/referenz_bern'
  const da = existsSync(join(DIR, 'referenz.json')) && existsSync(join(DIR, 'cache', 'av_1416.json'))
  it.skipIf(!da)('Berner Referenzort 1416 (nur lokal): Soll bis 490 m, Sichtpunkte höchstens rund 110 m ab dem Streifen; Wegende ' +
    'jenseits davon keine Grenze', () => {
    const lesen = (p: string) => JSON.parse(readFileSync(p, 'utf-8'))
    const s = lesen(join(DIR, 'referenz.json')).streifen.find((x: { fgs_id: number }) => x.fgs_id === 1416)
    const av = avParsen(lesen(join(DIR, 'cache', 'av_1416.json'))), o = osmParsen(lesen(join(DIR, 'cache', 'osm_1416.json')))
    const k = kontextBauen(o, av, [], [])
    k.vonHand = { querung: () => ({ typ: 'furt', inselMarkiert: true }) }
    let nid = s.osm_knoten.id, bd = Infinity
    for (const [id, u] of k.netz!.U) { const d = dist(u.p, s.mitte); if (d < bd) { bd = d; nid = id } }
    const r = rechneUebergang(o, av, nid, k)
    const zs = r.streifen.flatMap(st => st.zufahrten.map(z => ({ st, z })))
    expect(zs.length).toBeGreaterThan(0)
    for (const { st, z } of zs) {
      const weit = Math.max(...z.sichtpunkte.map(p => dist(p, st.m)))
      expect(weit, z.zufahrt).toBeLessThan(REICHWEITE_SICHT_M + 30)
      if (z.sichtweite > REICHWEITE_SICHT_M) expect(z.geprueftBisM, z.zufahrt).toBe(REICHWEITE_SICHT_M)
      expect(z.sichtweiteQuelle === 'bis Wegende' && z.sichtweite > REICHWEITE_SICHT_M).toBe(false)
    }
    expect(zs.some(({ z }) => z.geprueftBisM === REICHWEITE_SICHT_M && z.sichtweite > 400)).toBe(true)
  })
})
