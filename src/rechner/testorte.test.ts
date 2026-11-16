// Feste Testorte mit offenen Daten (Codeprüfung und Luftbildvergleich 15./16.11.2026, Bildpruefung/2026-11-15_Vergleich_Querungen und
// 2026-11-16_Nachpruefung): Rechnung wie Lauf B (Streifen aus OSM + AV, ohne Luftbild, ohne Hindernisse), Vergleich mit dem Stand in
// testdaten/orte/erwartung.json (Status, Fahrbahnbreite, Sichtpunkte je Zufahrt; Grenze 0,05 m). Nachführen nur nach Durchsicht am Luftbild:
// FGS_TESTORTE_SCHREIBEN=1 npx vitest run src/rechner/testorte.test.ts
// Daten: testdaten/orte/osm_<Knoten>.json (Overpass wie die App) und av_/sosf_<Knoten>.json (WFS AV über geodienste.ch, auf ±120 m um den
// Übergang gekürzt), abgerufen am 15.11.2026. © OpenStreetMap-Mitwirkende (ODbL); AV Kanton Bern über geodienste.ch.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { osmParsen } from '../daten/osm'
import { avParsen } from '../daten/av'
import { kontextBauen, rechneUebergang } from './index'
import { dist, type P } from '../geo'

/** Ort, Strasse, warum fest (Urteil am Luftbild) */
const ORTE: [number, string, string][] = [
  [536404212, 'Giacomettistrasse', 'lokal besser: gerade Fahrlinie über die Einmündung'],
  [5471717881, 'Dalmaziquai', 'lokal besser: gerade Fahrlinie über die Einmündung'],
  [12812324980, 'OSM 12812324980', 'lokal besser: Streifenende an der Bordflucht'],
  [2066241931, 'Bottigenstrasse', 'Bogen über die Einmündung (FB1), lokal nur noch 0,66 m neben 0.11.0'],
  [4188102724, 'Schwarzenburgstrasse (Eigerplatz)', 'drei Teilstreifen über die Inseln (FB11 im fgsCheck zurückgenommen)'],
  [3022034633, 'Bremgartenstrasse', 'keine negative Fahrbahnbreite (vorher −2,14 m)'],
  [559736266, 'Bremgartenstrasse', 'offen: Streifen über den Veloweg bis zum Waldrand (S6)'],
  [13717286577, 'Schwarzenburgstrasse (Eigerplatz)', 'offen: Teilstreifen 3 fehlt im Lauf B (Teilung 620ae48)'],
]
const DIR = new URL('../testdaten/orte/', import.meta.url)
const lesen = (n: string) => JSON.parse(readFileSync(new URL(n, DIR), 'utf8'))
const r2 = (x: number) => Math.round(x * 100) / 100
type Stand = Record<string, { status: string; fahrbahn: number | null; sp: P[] }>

function rechne(id: number): Stand {
  const osm = osmParsen(lesen(`osm_${id}.json`)), av = avParsen(lesen(`av_${id}.json`))
  const sosf = existsSync(new URL(`sosf_${id}.json`, DIR)) ? avParsen(lesen(`sosf_${id}.json`)) : []
  const r = rechneUebergang(osm, av, id, kontextBauen(osm, av, sosf, []))
  const aus: Stand = {}
  for (const s of r.streifen) for (const z of s.zufahrten)
    aus[`${s.fgsId}:${z.kennung}:${z.art}`] = { status: z.status, fahrbahn: z.fahrbahnM ?? null, sp: (z.sichtpunkte ?? []).map(p => [r2(p[0]), r2(p[1])] as P) }
  return aus
}

const ERW = new URL('erwartung.json', DIR)
const erwartung: Record<string, Stand> = existsSync(ERW) ? JSON.parse(readFileSync(ERW, 'utf8')) : {}
const neu: Record<string, Stand> = {}

describe('Feste Testorte (offene Daten, Lauf B)', () => {
  for (const [id, name, warum] of ORTE) it(`${id} ${name}: ${warum}`, () => {
    const jetzt = rechne(id)
    neu[id] = jetzt
    if (process.env.FGS_TESTORTE_SCHREIBEN) return
    const alt = erwartung[id]
    expect(alt, 'kein Stand in erwartung.json').toBeDefined()
    expect(Object.keys(jetzt).sort()).toEqual(Object.keys(alt).sort())
    for (const [k, v] of Object.entries(jetzt)) {
      const a = alt[k]
      expect(v.status, k).toBe(a.status)
      expect(v.fahrbahn === null ? null : r2(v.fahrbahn), k).toEqual(a.fahrbahn === null ? null : r2(a.fahrbahn))
      expect(v.sp.length, k).toBe(a.sp.length)
      expect(Math.max(0, ...v.sp.map((p, i) => dist(p, a.sp[i]))), k).toBeLessThan(0.05)
    }
  })
  it('Fahrbahnbreite nie negativ (Bremgartenstrasse 3022034633: −2,14 m vor der Korrektur)', () => {
    for (const v of Object.values(rechne(3022034633))) if (v.fahrbahn !== null) expect(v.fahrbahn).toBeGreaterThan(0)
  })
  it('Eigerplatz 4188102724: alle drei Teilstreifen', () => {
    expect(new Set(Object.keys(rechne(4188102724)).map(k => k.split(':')[0])).size).toBe(3)
  })
  it.fails('Eigerplatz 13717286577 (Lauf B): alle drei Teilstreifen (offen, Teilungsregel 620ae48)', () => {
    expect(new Set(Object.keys(rechne(13717286577)).map(k => k.split(':')[0])).size).toBe(3)
  })
  it('Stand schreiben (nur mit FGS_TESTORTE_SCHREIBEN)', () => {
    if (process.env.FGS_TESTORTE_SCHREIBEN) writeFileSync(ERW, JSON.stringify(neu) + '\n')
  })
})
