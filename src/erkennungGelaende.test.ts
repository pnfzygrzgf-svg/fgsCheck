// Tests Erkennungsdistanz mit Gelände (30.10.2026, erkennungGelaende.ts): künstliche Höhenprofile über einen eingespeisten Lader, kein
// Abruf; dazu der Lader der Sichtprofile (Adresse) und die Vorbelegung mit dem Wert nach der Geländeprüfung.
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import { wgs } from './geo'
import type { ProfilPunkt } from './knotensicht/rechner/neigung'
import type { Erkennung, ErkennungLinie } from './rechner/erkennung'
import type { ZufahrtErgebnis, StreifenErgebnis } from './rechner/typen'
import { AUGHOEHE_M } from './rechner/erkennung'
import { GELAENDE_NAME, GELAENDE_TOL_M, erkennungAnzeige, gelaendeFrei, gelaendePruefen, gelaendeSchluessel, gelaendeText,
  type GelaendeStand, type ProfilLader } from './erkennungGelaende'
import { erkennungBaender, erkennungSichtlinien } from './erkennungKarte'
import { sichtProfilPunkte, sichtProfilUrl } from './daten/sichtProfil'
import { erkennungText } from './texte'
import { rechneFall } from './rechner'
import { leererFall } from './fall'
import { querungen, vorbelegen } from './bedarf/vorbelegung'
import type { OsmDaten, OsmKnoten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'

/** Profil der Länge L mit der Höhe h(d) alle 2 m */
const profil = (L: number, h: (d: number) => number): ProfilPunkt[] =>
  Array.from({ length: Math.round(L / 2) + 1 }, (_, i) => ({ dist: Math.min(L, i * 2), h: h(Math.min(L, i * 2)) }))
/** Sichtlinien entlang der y-Achse: Augpunkt (0, x + 1), Ziel (0, 0,5) */
const linien = (xs: number[]): ErkennungLinie[] => xs.map(x => ({ x, auge: [0, x + 1] as P, ziel: [0, 0.5] as P, befund: 'frei' }))
const XS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]
/** Lader: Kuppe (Hügel) bei y = kuppeY quer über die Fahrbahn, hoch genug, um Linien von weiter hinten zu schneiden */
function kuppe(kuppeY: number, hoehe = 2): { laden: ProfilLader; n: () => number } {
  let n = 0
  return {
    n: () => n,
    laden: async (a, b) => {
      n++
      const L = Math.hypot(a[0] - b[0], a[1] - b[1])
      // d ab dem Augpunkt; y = a.y − d (Linie zeigt nach Süden)
      return profil(L, d => (Math.abs(a[1] - d - kuppeY) < 3 && a[1] - kuppeY > 3 ? hoehe : 0))
    },
  }
}
const z = (e: Erkennung, l: ErkennungLinie[], extra: Partial<ZufahrtErgebnis> = {}): ZufahrtErgebnis => ({
  fgsId: 'f1', zufahrt: 'n', art: 'beide', sichtweite: 30, sichtpunkte: [[0, 1], [0, 31]] as P[], spur: [[0, 0], [0, 200]] as P[],
  erkennungM: e, erkennungLinien: l, ...extra } as ZufahrtErgebnis)

describe('Gelände: Sichtlinie gegen das Höhenprofil', () => {
  it('ebene und gleichmässig geneigte Fahrbahn frei; Kuppe über der Linie (mehr als die Toleranz) verdeckt', () => {
    expect(gelaendeFrei(profil(50, () => 500))).toBe(true)
    expect(gelaendeFrei(profil(50, d => 500 + 0.06 * d))).toBe(true)
    expect(gelaendeFrei(profil(50, d => 500 - 0.06 * d))).toBe(true)
    // Linie bei d = 24 von 50 m: 1,0 · (1 − 0,48) = 0,52 m über dem Boden; 0,1 m über der Toleranz schneidet, 0,1 m darunter nicht
    expect(gelaendeFrei(profil(50, d => (d === 24 ? 0.52 + GELAENDE_TOL_M + 0.1 : 0)))).toBe(false)
    expect(gelaendeFrei(profil(50, d => (d === 24 ? 0.52 + GELAENDE_TOL_M - 0.1 : 0)))).toBe(true)
    expect(AUGHOEHE_M).toBe(1.0)
    expect(gelaendeFrei([{ dist: 0, h: 1 }])).toBeNull()
  })
})

describe('Gelände: Prüfung je Zufahrt', () => {
  it('Gelände schneidet die Sichtlinien ab 60 m: Erkennungsdistanz endet davor, höchstens 14 Abfragen, Status unverändert', async () => {
    const e: Erkennung = { wert: 110, bis: 'frei' }
    const l = linien(XS)
    const k = kuppe(52)
    const g = await gelaendePruefen(e, l, k.laden)
    // 11 Linien (ohne die am Streifenrand) + 2 halbierende
    expect(k.n()).toBe(13)
    expect(g.abfragen).toBe(13)
    expect(g.abM).toBeGreaterThanOrEqual(50)
    expect(g.abM).toBeLessThan(60)
    expect(g.frei['50.00']).toBe(true)
    expect(g.frei['60.00']).toBe(false)
    const zz = z(e, l)
    const werte: Record<string, GelaendeStand> = { [gelaendeSchluessel(zz)!]: { stand: 'ok', ...g } }
    const a = erkennungAnzeige(zz, werte)!
    expect(a.e).toEqual({ wert: g.abM, bis: 'verdeckt', hindernis: { klasse: 'gelaende', name: GELAENDE_NAME }, gelaende: 'mit',
      gelaendePruefbereich: { letzteFreiM: 52.5, ersteVerdecktM: 55 } })
    expect(erkennungText(a.e)).toBe(`Bodenmarkierung im Modell erkennbar ab ${g.abM} m (abgerundeter Rechenwert; weiter entfernt verdeckt: Geländemodell (swissALTI3D))`)
    expect(gelaendeText(a.e)).toBe('mit Geländemodell (swissALTI3D); letzte frei geprüfte Position 52,5 m; erste verdeckte Position 55 m vor dem Streifen')
    expect(a.linien.find(x => x.x === 70)).toMatchObject({ befund: 'verdeckt', grund: GELAENDE_NAME, gelaende: false })
    expect(a.linien.find(x => x.x === 40)).toMatchObject({ befund: 'frei', gelaende: true })
    // Band: grün bis zum neuen Wert, rot bis zum Soll (60 m); Sichtlinien mit Gelände
    const [b] = erkennungBaender({ zufahrten: [zz] } as unknown as StreifenErgebnis, werte)
    expect(b.fehlt!.art).toBe('verdeckt')
    expect(b.text).toBe(`Erkennungsdistanz: Bodenmarkierung im Modell ab ${g.abM} m sichtbar, Soll 60 m; verdeckt durch Geländemodell (swissALTI3D); mit Geländemodell (swissALTI3D); letzte frei geprüfte Position 52,5 m; erste verdeckte Position 55 m vor dem Streifen`)
    const sl = erkennungSichtlinien(zz, werte)
    expect(sl.find(x => x.x === 60)!.text).toBe('Sichtlinie 60 m vor dem Streifen auf die Bodenmarkierung: verdeckt (Geländemodell (swissALTI3D))')
    expect(sl.find(x => x.x === 10)!.text).toBe('Sichtlinie 10 m vor dem Streifen auf die Bodenmarkierung: in den Daten frei, im Geländemodell frei')
  })
  it('Bewuchs bleibt, wenn er vor der Geländegrenze beginnt, sonst entfällt er', () => {
    const l = linien(XS)
    const mit = (ab: number) => {
      const zz = z({ wert: 110, bis: 'frei', bewuchsAb: ab, bewuchs: 'Gartenanlage' }, l)
      return erkennungAnzeige(zz, { [gelaendeSchluessel(zz)!]: { stand: 'ok', abM: 52, frei: {}, abfragen: 13 } })!.e
    }
    expect(mit(30)).toMatchObject({ wert: 52, bewuchsAb: 30, bewuchs: 'Gartenanlage', hindernis: { klasse: 'gelaende' } })
    expect(mit(70).bewuchsAb).toBeUndefined()
    expect(mit(70).bewuchs).toBeUndefined()
  })
  it('im Geländemodell frei: Wert wie 2D, «mit Gelände»; Wert zwischen zwei Linien zusätzlich geprüft; nur bis zur 2D-Erkennungsdistanz', async () => {
    const e: Erkennung = { wert: 43, bis: 'verdeckt', hindernis: { klasse: 'gebaeude', name: 'Gebäude (AV)' } }
    const l = linien(XS)
    const k = kuppe(-100)
    const g = await gelaendePruefen(e, l, k.laden)
    expect(g).toMatchObject({ abM: null, abfragen: 5 })
    expect(Object.keys(g.frei).sort()).toEqual(['10.00', '20.00', '30.00', '40.00', '43.00'])
    const zz = z(e, l)
    const a = erkennungAnzeige(zz, { [gelaendeSchluessel(zz)!]: { stand: 'ok', ...g } })!
    expect(a.e).toEqual({ ...e, gelaende: 'mit' })
  })
  it('kein Profil (Fehler bzw. lädt): Ergebnis bleibt 2D mit «Geländemodell nicht geprüft»; eine andere Lage der Linien zählt nicht', async () => {
    const e: Erkennung = { wert: 110, bis: 'frei' }
    const l = linien(XS)
    await expect(gelaendePruefen(e, l, async () => { throw new Error('HTTP 500') })).rejects.toThrow('HTTP 500')
    await expect(gelaendePruefen(e, l, async () => [])).rejects.toThrow('Höhenprofil ohne Höhen')
    const zz = z(e, l), key = gelaendeSchluessel(zz)!
    for (const st of [undefined, { stand: 'fehler', text: 'HTTP 500' } as GelaendeStand]) {
      const a = erkennungAnzeige(zz, st ? { [key]: st } : null)!
      expect(a.e).toEqual({ wert: 110, bis: 'frei', gelaende: 'ohne' })
      expect(gelaendeText(a.e)).toBe('Geländemodell nicht geprüft')
    }
    expect(erkennungAnzeige(zz, { [key]: { stand: 'laedt' } })!.e.gelaende).toBe('laedt')
    // Ergebnis zu anderen Linien (Streifen verschoben): gilt nicht
    const z2 = z(e, linien(XS).map(x => ({ ...x, auge: [1, x.x + 1] as P })))
    expect(gelaendeSchluessel(z2)).not.toBe(key)
    expect(erkennungAnzeige(z2, { [key]: { stand: 'ok', abM: 20, frei: {}, abfragen: 11 } })!.e).toEqual({ wert: 110, bis: 'frei', gelaende: 'ohne' })
    // Abbruch wird weitergereicht
    const ab = Object.assign(new Error('abgebrochen'), { name: 'AbortError' })
    await expect(gelaendePruefen(e, l, async () => { throw ab })).rejects.toThrow('abgebrochen')
  })
  it('Brücke: Linien mit Augpunkt bzw. Ziel auf der Brücke werden nicht geprüft', async () => {
    const l = linien(XS).map(x => (x.x >= 30 && x.x <= 50 ? { ...x, bruecke: true as const } : x))
    // Lader: nur die Augpunkte 30 bis 50 m (auf der Brücke) sähen eine Kuppe
    const g = await gelaendePruefen({ wert: 110, bis: 'frei' }, l, async a => profil(20, d => (a[1] > 30 && a[1] < 52 && d === 10 ? 3 : 0)))
    expect(g.frei['40.00']).toBeUndefined()
    expect(g.frei['60.00']).toBe(true)
    expect(g.abM).toBeNull()
  })
  it('Lader der Sichtprofile: nur die zwei Endpunkte (0,1 m), Stützpunkte nach der Länge', () => {
    expect(sichtProfilPunkte(4)).toBe(10)
    expect(sichtProfilPunkte(100)).toBe(51)
    expect(sichtProfilPunkte(300)).toBe(60)
    const u = sichtProfilUrl([2600000.04, 1200000.06], [2600050.01, 1200000])
    expect(u).toMatch(/^https:\/\/api3\.geo\.admin\.ch\/rest\/services\/profile\.json\?/)
    expect(decodeURIComponent(u)).toContain('"coordinates":[[2600000,1200000.1],[2600050,1200000]]')
    expect(u).toContain('nb_points=26')
  })
})

// Vorbelegung: künstliche gerade Strasse (wie erkennung.test.ts), Gelände von aussen eingespeist
const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, kn: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: kn.map(k => k[0]), geom: kn.map(k => ll(k[1], k[2])) })
const UEB: OsmKnoten = { id: 12, tags: { highway: 'crossing', crossing: 'marked' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [UEB] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]

describe('Gelände: Vorbelegung «Ab welcher Distanz ist der Streifen erkennbar»', () => {
  it('mit Geländeprüfung der kleinere Wert «mit Geländemodell (swissALTI3D)», ohne sie 2D «ohne Gelände»', async () => {
    const fall = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
    const r = rechneFall(OSM, AV, [], 12, fall, null)
    const zs = r.streifen[0].zufahrten.filter(x => x.art !== 'abbiegend')
    const west = zs.find(x => x.richtung === 0)!
    // Hügel quer über die Fahrbahn rund 60 m westlich, nur für die Zufahrt aus Westen
    const g = await gelaendePruefen(west.erkennungM!, west.erkennungLinien!, async (a, b) => {
      const L = Math.hypot(a[0] - b[0], a[1] - b[1])
      return profil(L, d => (Math.abs(a[0] - O[0] + d * (b[0] - a[0]) / L + 60) < 3 && a[0] - O[0] < -63 ? 2 : 0))
    })
    expect(g.abM).toBeGreaterThan(50)
    expect(g.abM).toBeLessThan(70)
    const werte = { [gelaendeSchluessel(west)!]: { stand: 'ok' as const, ...g } }
    const ohne = vorbelegen(querungen(r.streifen)[0], fall)
    expect(ohne.werte.erkennungM).toMatchObject({ wert: 110, quelle: 'annahme' })
    expect(ohne.werte.erkennungM.text).toContain('Geländemodell nicht geprüft')
    const mit = vorbelegen(querungen(r.streifen)[0], fall, [], { erkennungGelaende: werte })
    expect(mit.werte.erkennungM).toMatchObject({ wert: g.abM, quelle: 'annahme' })
    expect(mit.werte.erkennungM.text).toContain(`Sichtrechner: ${erkennungText(erkennungAnzeige(west, werte)!.e)}`)
    expect(mit.werte.erkennungM.text).toContain('letzte frei geprüfte Position')
    expect(mit.werte.erkennungM.text).toContain('nur Bodenmarkierung geprüft; Signale hier nicht zusätzlich bewertet')
  })
})

describe('D1: Grenzpositionen für die Bodenmarkierung', () => {
  const hoehenschnitt = (verdeckt: boolean): ProfilPunkt[] => [{ dist: 0, h: 500 }, { dist: 5, h: verdeckt ? 502 : 500 }, { dist: 10, h: 500 }]
  it('zeigt Prüflagen statt einer erfundenen genauen Grenze und erhält den abgerundeten Wert', async () => {
    const e: Erkennung = { wert: 24, bis: 'frei' }, l = linien([0, 10, 20, 24]), aufrufe: number[] = []
    const g = await gelaendePruefen(e, l, async a => { aufrufe.push(a[1] - 1); return hoehenschnitt(a[1] > 18.5) })
    expect(aufrufe).toEqual([10, 20, 24, 15, 17.5])
    expect(g).toMatchObject({ abM: 17, abfragen: 5, pruefbereich: { letzteFreiM: 17.5, ersteVerdecktM: 20 } })
    const zz = z(e, l), a = erkennungAnzeige(zz, { [gelaendeSchluessel(zz)!]: { stand: 'ok', ...g } })!
    expect(a.e.wert).toBe(17)
    expect(erkennungText(a.e)).toContain('Bodenmarkierung im Modell erkennbar ab 17 m (abgerundeter Rechenwert;')
    expect(gelaendeText(a.e)).toContain('letzte frei geprüfte Position 17,5 m; erste verdeckte Position 20 m')
  })
  it('behauptet bei ausschliesslich verdeckten Proben keine freie Position am Streifenrand', async () => {
    const e: Erkennung = { wert: 24, bis: 'frei' }, l = linien([0, 10, 20, 24])
    const g = await gelaendePruefen(e, l, async () => hoehenschnitt(true))
    expect(g).toMatchObject({ abM: 0, abfragen: 5, pruefbereich: { letzteFreiM: null, ersteVerdecktM: 2.5 } })
    const zz = z(e, l), werte = { [gelaendeSchluessel(zz)!]: { stand: 'ok' as const, ...g } }
    const a = erkennungAnzeige(zz, werte)!
    expect(erkennungText(a.e)).toBe('Bodenmarkierung: keine frei geprüfte Position im Geländemodell')
    expect(gelaendeText(a.e)).toContain('keine freie Position geprüft')
    expect(erkennungBaender({ zufahrten: [zz] } as StreifenErgebnis, werte)[0].text).not.toContain('ab 0 m sichtbar')
  })
  it.each(['fehler', 'ohne_hoehen'] as const)('erhält bei fehlender Verfeinerung (%s) die tatsächlich geprüften Grenzen', async art => {
    const e: Erkennung = { wert: 24, bis: 'frei' }, l = linien([0, 10, 20, 24])
    const g = await gelaendePruefen(e, l, async a => {
      if (a[1] === 16) { if (art === 'fehler') throw Error('HTTP 500'); return [] }
      return hoehenschnitt(a[1] >= 21)
    })
    expect(g).toMatchObject({ abM: 10, abfragen: 4, pruefbereich: { letzteFreiM: 10, ersteVerdecktM: 20 } })
  })
  it('erfindet bei einem älteren Geländewert keine Prüflagen', () => {
    const zz = z({ wert: 24, bis: 'frei' }, linien([0, 10, 20, 24]))
    const a = erkennungAnzeige(zz, { [gelaendeSchluessel(zz)!]: { stand: 'ok', abM: 17, abfragen: 5, frei: {} } })!
    expect(erkennungText(a.e)).toContain('abgerundeter Rechenwert')
    expect(gelaendeText(a.e)).not.toContain('geprüfte Position')
    expect(a.e.wert).toBe(17)
  })
})
