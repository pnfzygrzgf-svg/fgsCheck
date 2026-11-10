// Abnahmetests Prüfung SW-04 (10.11.2026): VSS 40 273 Ziffer 11 verlangt auch bei zugelassenen Einzelhindernissen (Palisade unter
// 5 m), dass das vortrittsberechtigte Fahrzeug bei A sichtbar ist. Liegt der Zielpunkt bei A im Schatten eines Stamms, gibt es
// kein «erfüllt», sondern «offen» (Sicht vor Ort prüfen). Kurze Schatten abseits von A bleiben ohne Statuswirkung.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { sichtEntlang, type Verdeckend } from './sicht'
import { mitSichtBeiA, sichtStatus } from './sichtweite'
import { rechneKnoten } from './rechnen'
import { KEINE_HINDERNISSE } from './typen'
import type { Hindernis } from './hindernisse'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)

describe('SW-04: Gegenprobe des Berichts (D und Achse wie SW-03, A = 20)', () => {
  const Dp = lv(0, -10), achse: P[] = [lv(0, 0), lv(40, 0)]
  const palisade = (x0: number, x1: number): Verdeckend => ({ id: 'b1', name: 'Baum', wirkung: 'palisade', quelle: 'hand',
    poly: [[lv(x0, -0.1), lv(x1, -0.1), lv(x1, 0.1), lv(x0, 0.1), lv(x0, -0.1)]] })
  const sw = { massgebend: 20, oben: 35 }
  it('kleines Hindernis um A: beiA, Palisade zählt nicht, Sicht bleibt 40 m – Status nicht mehr «erfüllt», sondern «offen»', () => {
    const s = sichtEntlang(Dp, achse, 40, [palisade(19.8, 20.2)], 20)
    expect(s.vorhanden).toBe(40)
    expect(s.palisade).toMatchObject({ beiA: true, zaehlt: false })
    expect(sichtStatus(s.vorhanden, sw)).toBe('erfuellt')                       // alte Rechnung
    expect(mitSichtBeiA(sichtStatus(s.vorhanden, sw), s.palisade?.beiA)).toBe('offen')
  })
  it('kurzer Schatten abseits von A: weiterhin zulässig (erfüllt)', () => {
    const s = sichtEntlang(Dp, achse, 40, [palisade(9.8, 10.2)], 20)
    expect(s.palisade).toMatchObject({ beiA: false, zaehlt: false })
    expect(mitSichtBeiA(sichtStatus(s.vorhanden, sw), s.palisade?.beiA)).toBe('erfuellt')
  })
  it('A zwischen zwei feinen Punkten bzw. auf der Rastergrenze: der Schatten an einem Nachbarn genügt', () => {
    // Schatten nur um 20,1 m; A = 20,05 (zwischen 20,0 und 20,1) bzw. A = 20,1 (auf dem Raster)
    expect(sichtEntlang(Dp, achse, 40, [palisade(20.08, 20.12)], 20.05).palisade?.beiA).toBe(true)
    expect(sichtEntlang(Dp, achse, 40, [palisade(20.08, 20.12)], 20.1).palisade?.beiA).toBe(true)
    expect(sichtEntlang(Dp, achse, 40, [palisade(20.08, 20.12)], 19.9).palisade?.beiA).toBe(false)
  })
  it('A ausserhalb der erfassten Achse: keine Aussage (null), der Status folgt der Sichtweite', () => {
    const s = sichtEntlang(Dp, achse, 15, [palisade(9.8, 10.2)], 20)
    expect(s.palisade?.beiA).toBeNull()
    expect(mitSichtBeiA(sichtStatus(s.vorhanden, sw), s.palisade?.beiA)).toBe('nicht_erfuellt')
  })
  it('ein nicht erfüllter bzw. nicht beurteilbarer Status bleibt, wie er ist', () => {
    expect(mitSichtBeiA('nicht_erfuellt', true)).toBe('nicht_erfuellt')
    expect(mitSichtBeiA('nicht_beurteilbar', true)).toBe('nicht_beurteilbar')
    expect(mitSichtBeiA('massgebend', true)).toBe('offen')
    expect(mitSichtBeiA('erfuellt', null)).toBe('erfuellt')
  })
})

// Ganze Knotenrechnung (T-Knoten wie rechnen.test.ts, ohne Gebäude): Baum am Zielpunkt A der Autos bzw. der Velos von links
describe('SW-04: Knotenrechnung für Auto und Velo', () => {
  const weg = (id: number, k: [number, number, number][], tags: Record<string, string>): OsmWeg =>
    ({ id, tags, knoten: k.map(x => x[0]), geom: k.map(x => ll(x[1], x[2])) })
  const osm: OsmDaten = { wege: [weg(1, [[10, -200, 0], [12, 0, 0], [13, 200, 0]], { highway: 'unclassified', maxspeed: '30' }),
    weg(2, [[12, 0, 0], [20, 0, -200]], { highway: 'residential', maxspeed: '30' })], tram: [], uebergaenge: [], ampeln: [], relationen: [], querungen: [], vortritt: [] }
  const fb: AvFlaeche = { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351,
    ringe: [[lv(-200, -3), lv(-2.5, -3), lv(-2.5, -200), lv(2.5, -200), lv(2.5, -3), lv(200, -3), lv(200, 3), lv(-200, 3), lv(-200, -3)]] }
  const rechne = (baeume: P[]) => {
    const hindernisse: Hindernis[] = baeume.map((p, i) => ({ id: `b${i}`, art: 'baum', p, stamm: 0.5, quelle: 'hand' }))
    const e = rechneKnoten(osm, [fb], { knoten: 12, zufahrt: null, hindernisse: { ...KEINE_HINDERNISSE, hindernisse } }).ergebnis!
    return Object.assign(e.richtungen.find(x => x.richtung === 'links')!, { D: e.D })
  }
  const punktBei = (achse: P[], s: number): P => {
    let rest = s
    for (let i = 1; i < achse.length; i++) {
      const d = Math.hypot(achse[i][0] - achse[i - 1][0], achse[i][1] - achse[i - 1][1])
      if (rest <= d) return [achse[i - 1][0] + (achse[i][0] - achse[i - 1][0]) * rest / d, achse[i - 1][1] + (achse[i][1] - achse[i - 1][1]) * rest / d]
      rest -= d
    }
    return achse[achse.length - 1]
  }
  const ohne = rechne([])
  it('ohne Baum: Auto und Velo erfüllt', () => {
    expect(ohne.status).toBe('erfuellt')
    expect(ohne.velo?.status).toBe('erfuellt')
  })
  it('Baum am Zielpunkt A der Autos: Auto «offen» mit Zusatz und Hinweis; Abseits davon (halbe Strecke) erfüllt', () => {
    const A = ohne.massgebend
    const r = rechne([lv(1.25 - A, -1.5)])
    expect(r.status).toBe('offen')
    expect(r.statusZusatz.join(' ')).toContain('offen: Fahrzeug bei A im Schatten eines Stamms')
    expect(r.hinweise.join(' ')).toContain('Ziffer 11 verlangt, dass das Fahrzeug bei A sichtbar ist')
    expect(rechne([lv(1.25 - A / 2, -1.5)]).status).toBe('erfuellt')
  })
  it('Baum vor dem Zielpunkt A der Velos (3 m Richtung D, damit die Achse nicht durch den Stamm läuft): Velo «offen»', () => {
    const v = ohne.velo!, T = punktBei(v.achse, v.A), D = ohne.D
    const d = Math.hypot(D[0] - T[0], D[1] - T[1])
    const r = rechne([[T[0] + (D[0] - T[0]) * 3 / d, T[1] + (D[1] - T[1]) * 3 / d]])
    expect(r.velo?.status).toBe('offen')
  })
})
