// Abnahmetests Rechenweg je Zufahrt (Prüfung FGS-01, 10.11.2026): Kurvenregel (VSS 40 241 Ziffer 14, Tab. 2, S. 7) und V85 je gerader
// Zufahrt, bfu-Kurvensichtweite (MS.013-2025, 2.2, Tab. 1, S. 4) nur bis 20 m. Künstliche Strassen (keine echten Daten): Strasse
// Nord–Süd durch den Streifen bei (0, 0); südlich davon nach 10 m eine Kurve (Radius R) um 90° nach Westen, wahlweise auch nördlich.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall, type FallRechnung } from './index'
import { sichtweiteKurve, sichtweiteTab2, SICHTWEITE } from './tempo'
import { kurveStrasse, v85Soll, type KurveKontext } from './kurvenregel'
import { leererFall, type Fall, type KurveHand } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { sichtQuelleKurz } from '../texte'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const av = (ring: P[]): AvFlaeche => ({ art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [ring] })

/** Punkte [x, y] einer 90°-Kurve ab (0, y0) in Richtung s (−1 nach Süden, +1 nach Norden), dann nach Westen */
function kurve(y0: number, r: number, s: 1 | -1): [number, number][] {
  const pts: [number, number][] = []
  for (let g = 0; g <= 90; g += 3) { const a = g * Math.PI / 180; pts.push([-r + r * Math.cos(a), y0 + s * r * Math.sin(a)]) }
  pts.push([-300, y0 + s * r])
  return pts
}
/** Strasse: Süden mit Kurve (rS), Norden gerade bzw. mit Kurve (rN) */
function osm(rS: number, rN: number | null = null): OsmDaten {
  const sued = kurve(-10, rS, -1).reverse()
  const nord: [number, number][] = rN === null ? [[0, 300]] : kurve(10, rN, 1)
  const pts: [number, number][] = [...sued, [0, 0], ...nord]
  let id = 100
  const knoten = pts.map(p => [p[0] === 0 && p[1] === 0 ? 30 : id++, p[0], p[1]] as [number, number, number])
  const w: OsmWeg = { id: 1, tags: { highway: 'tertiary', name: 'Kurvenstrasse', maxspeed: '50' }, knoten: knoten.map(k => k[0]),
    geom: knoten.map(k => ll(k[1], k[2])) }
  return { wege: [w], tram: [], ampeln: [], querungen: [], relationen: [],
    uebergaenge: [{ id: 30, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }] }
}
const AV = [av(rechteck(-4, -60, 4, 60))]
const fall = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 30); f(x); return x }
const gerade = (r: FallRechnung) => r.streifen[0].zufahrten.filter(z => z.art !== 'abbiegend')
/** gerade Zufahrt aus dem Süden (fährt nach Norden) bzw. aus dem Norden */
const ausSueden = (r: FallRechnung) => gerade(r).find(z => z.sichtpunkte.every(p => p[1] - O[1] <= 0.5))!
const ausNorden = (r: FallRechnung) => gerade(r).find(z => z.sichtpunkte.every(p => p[1] - O[1] >= -0.5))!
const JA: KurveHand = { b1: true, b2: true, b3: true, b4: true, b5: true }

describe('Kurvenregel und bfu: Tabellenstufen am ungerundeten Radius', () => {
  it('Abbieger R = 20 m: bfu 24 m; R = 20,01 m: kein bfu-Wert (Tab. 1 nach Tempo)', () => {
    expect(sichtweiteKurve(20)[0]).toBe(24)
    expect(sichtweiteKurve(20.01)[0]).toBeNull()
  })
  it('bestätigte Strassenkurve R = 20 m: Tab. 2 30 m; 20,01 m: nächste Stufe 35 m; über 40 m kein Wert', () => {
    const k: KurveKontext = { ausserorts: false, tempo: 50, einFahrstreifen: { wert: true, text: '' }, neigung: 2, linieVonHand: false }
    expect(kurveStrasse(null, { radius: 20, ...JA }, k)).toMatchObject({ gilt: true, soll: 30, radiusHerkunft: 'hand' })
    expect(kurveStrasse(null, { radius: 20.01, ...JA }, k)?.soll).toBe(35)
    expect(kurveStrasse(null, { radius: 41, ...JA }, k)).toMatchObject({ gilt: false, soll: null })
    expect(sichtweiteTab2(40)).toBe(50)
  })
  it('vortrittsberechtigt nur angenommen: Vorschlag, Soll bleibt nach Tab. 1; b1 automatisch nur «nein»', () => {
    const k: KurveKontext = { ausserorts: false, tempo: 50, einFahrstreifen: { wert: true, text: '' }, neigung: 2, linieVonHand: false }
    const { b1: _, ...ohneB1 } = JA
    const v = kurveStrasse(null, { radius: 25, ...ohneB1 }, k)!
    expect([v.gilt, v.vorschlag, v.soll, v.b.b1.herkunft]).toEqual([false, true, null, 'annahme'])
    expect(kurveStrasse(null, { radius: 25, ...ohneB1 }, { ...k, tempo: 30 })!.b.b1).toMatchObject({ wert: false, herkunft: 'rechnung' })
    expect(kurveStrasse(null, { radius: 25, ...ohneB1 }, { ...k, ausserorts: true })!.b.b1).toMatchObject({ wert: false, herkunft: 'rechnung' })
  })
  it('V85: höher hebt das Soll (auch ohne Messung); tiefer senkt nur gemessen', () => {
    const t = (v: number) => SICHTWEITE[v]
    expect(v85Soll({ wert: 60, gemessen: false }, 50, t)).toMatchObject({ sw: 75 })
    expect(v85Soll({ wert: 40, gemessen: true }, 50, t)).toMatchObject({ sw: 40 })
    expect(v85Soll({ wert: 40, gemessen: false }, 50, t)).toHaveProperty('hinweis')
    expect(v85Soll({ wert: 50, gemessen: true }, 50, t)).toBeNull()
  })
})

describe('Rechenweg je Zufahrt in der Rechnung (künstliche Kurvenstrasse)', () => {
  it('Radius aus der modellierten Fahrlinie: Kurve erkannt, ohne Bestätigung Soll nach Tab. 1', () => {
    const r = rechneFall(osm(25), AV, [], 30, fall(), null)
    const s = ausSueden(r), n = ausNorden(r)
    expect(s.kurveStrasse?.radius).toBeGreaterThan(20)
    expect(s.kurveStrasse?.radius).toBeLessThan(30)
    expect(s.kurveStrasse?.radiusText).toBe('aus modellierter Fahrlinie')
    expect(s.kurveStrasse?.gilt).toBe(false)
    expect(s.sichtweite).toBe(SICHTWEITE[50])
    expect(n.kurveStrasse).toBeUndefined()
  })
  it('bestätigte Strassenkurve R = 20 m: Soll 30 m nach Tab. 2 nur für diese Zufahrt; Quelle in Rechnung und Befundblatt gleich', () => {
    let kS = ''
    const r0 = rechneFall(osm(25), AV, [], 30, fall(), null)
    kS = ausSueden(r0).kennung
    const r = rechneFall(osm(25), AV, [], 30, fall(f => { f.zufahrten[`${r0.streifen[0].fgsId}|${kS}`] = { kurve: { radius: 20, ...JA } } }), null)
    const s = ausSueden(r), n = ausNorden(r)
    expect(s.sichtweite).toBe(30)
    expect(s.sichtweiteQuelle).toMatch(/^VSS 40 241 Tab\. 2 \(Kurvenregel\): Radius 20,0 m von Hand/)
    expect(sichtQuelleKurz(s.sichtweiteQuelle)).toBe('nach Strassenkurve (Kurvenregel)')
    expect(n.sichtweite).toBe(SICHTWEITE[50])
    const bl = befundblaetter(r, fall(f => { f.zufahrten[`${r0.streifen[0].fgsId}|${kS}`] = { kurve: { radius: 20, ...JA } } }),
      { vorgabe: { bern: false, kantonBE: false } })
    const t = JSON.stringify(bl)
    expect(t).toContain('Kurvenregel angewendet: Tab. 2, Radius 20,0 m')
    expect(t).toContain('≥ 30 m')
  })
  it('zwei Strassenkurven an einem Streifen: je Zufahrt ein eigenes Soll', () => {
    const r0 = rechneFall(osm(25, 35), AV, [], 30, fall(), null)
    const id = r0.streifen[0].fgsId, kS = ausSueden(r0).kennung, kN = ausNorden(r0).kennung
    expect(ausNorden(r0).kurveStrasse?.radius).toBeGreaterThan(30)
    const r = rechneFall(osm(25, 35), AV, [], 30, fall(f => {
      f.zufahrten[`${id}|${kS}`] = { kurve: { radius: 20, ...JA } }
      f.zufahrten[`${id}|${kN}`] = { kurve: { radius: 35, ...JA } }
    }), null)
    expect([ausSueden(r).sichtweite, ausNorden(r).sichtweite]).toEqual([30, 45])
  })
  it('V85 einer Zufahrt ändert die anderen nicht', () => {
    const r0 = rechneFall(osm(25), AV, [], 30, fall(), null)
    const id = r0.streifen[0].fgsId, kS = ausSueden(r0).kennung
    const r = rechneFall(osm(25), AV, [], 30, fall(f => { f.zufahrten[`${id}|${kS}`] = { v85: { wert: 60, gemessen: true } } }), null)
    expect(ausSueden(r).sichtweite).toBe(SICHTWEITE[60])
    expect(ausSueden(r).sichtweiteQuelle).toMatch(/V85 60 km\/h/)
    expect(ausNorden(r).sichtweite).toBe(SICHTWEITE[50])
    // tiefer ohne Messung: kein Einfluss
    const r2 = rechneFall(osm(25), AV, [], 30, fall(f => { f.zufahrten[`${id}|${kS}`] = { v85: { wert: 40, gemessen: false } } }), null)
    expect(ausSueden(r2).sichtweite).toBe(SICHTWEITE[50])
  })
  it('vortrittsberechtigt nicht bestätigt (übrige vier von Hand ja): Vorschlag, Soll nach Tab. 1', () => {
    const r0 = rechneFall(osm(25), AV, [], 30, fall(), null)
    const id = r0.streifen[0].fgsId, kS = ausSueden(r0).kennung
    const r = rechneFall(osm(25), AV, [], 30, fall(f => { f.zufahrten[`${id}|${kS}`] = { kurve: { radius: 25, b2: true, b3: true, b4: true, b5: true } } }), null)
    expect(ausSueden(r).kurveStrasse).toMatchObject({ gilt: false, vorschlag: true })
    expect(ausSueden(r).sichtweite).toBe(SICHTWEITE[50])
  })
})

/** Kreisel (Ring R 15 m, OSM junction=roundabout) nördlich des Streifens; die Zufahrt läuft ab (0, 5) gerade (rA null) bzw. mit einem
 *  Bogen (Radius rA, 60°) in den Ring */
function osmKreisel(rA: number | null): OsmDaten {
  let id = 200
  const weg = (wid: number, pts: [number, number, number][], tags: Record<string, string>): OsmWeg =>
    ({ id: wid, tags, knoten: pts.map(k => k[0]), geom: pts.map(k => ll(k[1], k[2])) })
  const zu: [number, number, number][] = [[1, 0, -300], [30, 0, 0], [31, 0, 5]]
  if (rA === null) zu.push([50, 0, 15])
  else for (let g = 5; g <= 60; g += 5) { const a = g * Math.PI / 180; zu.push([g === 60 ? 50 : id++, -rA + rA * Math.cos(a), 5 + rA * Math.sin(a)]) }
  const e = zu[zu.length - 1], R = 15, a0 = -Math.PI / 3, c = [e[1] - R * Math.cos(a0), e[2] - R * Math.sin(a0)]
  const ring: [number, number, number][] = []
  for (let g = 0; g < 360; g += 10) { const a = a0 + g * Math.PI / 180; ring.push([g === 0 ? 50 : id++, c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]) }
  ring.push(ring[0])
  return { wege: [weg(1, zu, { highway: 'tertiary', name: 'Zufahrt', maxspeed: '50' }),
    weg(2, ring, { highway: 'tertiary', junction: 'roundabout', name: 'Ring', maxspeed: '50' })], tram: [], ampeln: [], querungen: [], relationen: [],
    uebergaenge: [{ id: 30, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }] }
}

describe('Kreisel: Ausfahrt nach dem Radius der eigenen Fahrlinie, Einfahrt nach Tab. 1', () => {
  const rk = (rA: number | null) => rechneFall(osmKreisel(rA), AV, [], 30, fall(), null)
  it('gebogene Ausfahrt R rund 12 m: bfu (Radius ungerundet gewählt), Quelle nennt die modellierte Fahrlinie; Einfahrt Tab. 1', () => {
    const r = rk(12)
    const aus = ausNorden(r), ein = ausSueden(r)
    expect(aus.kurvenradiusM).toBeGreaterThan(10)
    expect(aus.kurvenradiusM).toBeLessThanOrEqual(15)
    expect(aus.sichtweite).toBe(20)
    // der Ring ist keine Strassenkurve: keine Kurvenregel an der Ausfahrt
    expect(aus.kurveStrasse).toBeUndefined()
    expect(ausNorden(rk(null)).kurveStrasse).toBeUndefined()
    expect(aus.sichtweiteQuelle).toMatch(/^Ausfahrt aus dem Kreisel, Radius R .* m aus modellierter Fahrlinie \(bfu\)$/)
    expect(ein.sichtweite).toBe(SICHTWEITE[50])
    expect(ein.sichtweiteQuelle).toBe('VSS Tab. 1')
  })
  it('Ausfahrt R 30 m (über 20 m) bzw. gerade (kein Bogen): Tab. 1, kein Ringradius', () => {
    const r30 = ausNorden(rk(30)), g = ausNorden(rk(null))
    expect([r30.sichtweite, r30.sichtweiteQuelle]).toEqual([SICHTWEITE[50], 'VSS Tab. 1'])
    expect([g.sichtweite, g.radiusQuelle]).toEqual([SICHTWEITE[50], 'Ausfahrt aus dem Kreisel: kein Radius (keine Kurve)'])
  })
})
