// Bordmodell (gemeinsamer Baustein seit 13.11.2026, Plan AV-Geometrie A1): gemessener Rand und Führungslinie aus der AV, synthetische
// Flächen in LV95. Koordinaten relativ zu E 2 600 000 / N 1 200 000; Fahrbahn meist N −4…4 mit Trottoir beidseits.
import { describe, expect, it } from 'vitest'
import { type AvFlaecheLv, type Bordmodell, type P, ANKER_SONDE_M, BAND_M, BUCHT_PARALLEL_GRAD, FLANKE_ABZW_GRAD, OEFFNUNG_VERSATZ_M, RICHTUNG_MAX_GRAD,
  SCHNITT_LUECKE_MAX_M, STUECK_M, VERBINDUNG_MAX_M, bordBereich, bordStuecke, bordmodell, parallele, schnittBord } from './bordmodell'
import { geradeSchnitte } from './geometrie'

const E0 = 2600000, N0 = 1200000
const pt = (e: number, n: number): P => [E0 + e, N0 + n]
const rel = (p: P): [number, number] => [p[0] - E0, p[1] - N0]
const rechteck = (e0: number, e1: number, n0: number, n1: number): P[] => [pt(e0, n0), pt(e1, n0), pt(e1, n1), pt(e0, n1)]
const fl = (art: string, ...ringe: P[][]): AvFlaecheLv => ({ art, ringe })
/** Bogen um (ce, cn) mit Radius r von w0 nach w1 [Grad], n Teilstrecken, ohne Anfangspunkt */
const bogen = (ce: number, cn: number, r: number, w0: number, w1: number, n = 8): P[] =>
  Array.from({ length: n }, (_, k) => { const w = (w0 + (w1 - w0) * (k + 1) / n) * Math.PI / 180; return pt(ce + r * Math.cos(w), cn + r * Math.sin(w)) })
const trottoirs = (e0 = -50, e1 = 150, b = 4) => [fl('Trottoir', rechteck(e0, e1, b, b + 3)), fl('Trottoir', rechteck(e0, e1, -b - 3, -b))]
const gerade = (e0 = -50, e1 = 150) => [fl('Strasse_Weg', rechteck(e0, e1, -4, 4)), ...trottoirs(e0, e1)]

function abstandLinie(p: P, teile: P[][]): number {
  let best = Infinity
  for (const t of teile) for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], e = [t[i][0] - a[0], t[i][1] - a[1]], l2 = e[0] * e[0] + e[1] * e[1]
    const u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2)) : 0
    best = Math.min(best, Math.hypot(a[0] + u * e[0] - p[0], a[1] + u * e[1] - p[1]))
  }
  return best
}
/** Ecken und Streckenmitten von a im Fenster liegen auf b (und umgekehrt), höchstens tol */
function deckungsgleich(a: P[][], b: P[][], imFenster: (p: [number, number]) => boolean, tol = 1e-6) {
  const proben = (x: P[][]) => x.flatMap(t => t.flatMap((p, i) => (i ? [p, [(p[0] + t[i - 1][0]) / 2, (p[1] + t[i - 1][1]) / 2] as P] : [p])))
  const pa = proben(a).filter(p => imFenster(rel(p))), pb = proben(b).filter(p => imFenster(rel(p)))
  expect(pa.length).toBeGreaterThan(5)
  expect(pb.length).toBeGreaterThan(5)
  expect(Math.max(...pa.map(p => abstandLinie(p, b)))).toBeLessThan(tol)
  expect(Math.max(...pb.map(p => abstandLinie(p, a)))).toBeLessThan(tol)
}
const alleN = (teile: P[][]) => teile.flat().map(p => rel(p)[1])
const abw = (m: Bordmodell, seite: 'links' | 'rechts') => m.abweichungen.filter(a => a.seite === seite)
const querBei = (m: Bordmodell, s: number) => m.querschnitte.find(q => Math.abs(q.s - s) < 1e-6)!

describe('bordStuecke', () => {
  it('Stücke höchstens 2 m, Fahrbahn links; Nachbarart bord/strasse/offen; Teilung an fremden Eckpunkten', () => {
    const st = bordStuecke([
      fl('Strasse_Weg', rechteck(0, 50, -4, 4)), fl('Strasse_Weg', rechteck(50, 100, -4, 4)),
      fl('Strasse_Weg', rechteck(20, 26, 4, 20)),                       // Seitenstrasse, stösst an die Oberkante
      fl('Trottoir', rechteck(0, 100, 4, 7)), fl('uebrige_befestigte', rechteck(0, 30, -7, -4)),
    ])
    expect(Math.max(...st.map(x => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1])))).toBeLessThanOrEqual(STUECK_M + 1e-9)
    const oben = st.filter(x => x.flaeche === 0 && rel(x.a)[1] === 4 && rel(x.b)[1] === 4)
    expect(oben.every(x => x.a[0] > x.b[0])).toBe(true)                // Oberkante nach Westen: Fahrbahn links
    const mitteE = (x: (typeof st)[number]) => (rel(x.a)[0] + rel(x.b)[0]) / 2
    expect(oben.filter(x => mitteE(x) > 20 && mitteE(x) < 26).every(x => x.nachbar === 'strasse')).toBe(true)
    expect(oben.filter(x => mitteE(x) < 20 || mitteE(x) > 26).every(x => x.nachbar === 'bord' && x.nachbarArt === 'Trottoir')).toBe(true)
    // geteilt genau an den Ecken der Seitenstrasse und der befestigten Fläche
    expect(oben.some(x => rel(x.b)[0] === 20) && oben.some(x => rel(x.a)[0] === 26)).toBe(true)
    const unten = st.filter(x => x.flaeche === 0 && rel(x.a)[1] === -4 && rel(x.b)[1] === -4)
    expect(unten.some(x => Math.abs(rel(x.a)[0] - 30) < 1e-9 || Math.abs(rel(x.b)[0] - 30) < 1e-9)).toBe(true)
    expect(unten.filter(x => mitteE(x) < 30).every(x => x.nachbar === 'offen' && x.nachbarArt === 'uebrige_befestigte')).toBe(true)
    expect(unten.filter(x => mitteE(x) > 30).every(x => x.nachbar === 'offen' && x.nachbarArt === null)).toBe(true)
    // Stossstelle E 50 der beiden Strassenflächen ist kein Bord
    expect(st.filter(x => rel(x.a)[0] === 50 && rel(x.b)[0] === 50).every(x => x.nachbar === 'strasse')).toBe(true)
  })
})

describe('bordmodell: gerade Strasse', () => {
  it('Achse mittig: Rand N ±4, Breite 8,00, Führungslinie gleich dem Rand, keine Abweichung', () => {
    const m = bordmodell({ flaechen: gerade(), achse: [pt(0, 0), pt(100, 0)] })
    expect(m.rand.links.teile.length).toBe(1)
    expect(m.rand.rechts.teile.length).toBe(1)
    const l = m.rand.links.teile[0].map(rel), r = m.rand.rechts.teile[0].map(rel)
    expect(l[0][0]).toBeCloseTo(0, 9); expect(l[l.length - 1][0]).toBeCloseTo(100, 9)
    expect(r[0][0]).toBeCloseTo(0, 9); expect(r[r.length - 1][0]).toBeCloseTo(100, 9)
    expect(alleN(m.rand.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    expect(alleN(m.rand.rechts.teile).every(n => Math.abs(n + 4) < 1e-9)).toBe(true)
    expect(m.querschnitte.length).toBe(101)
    for (const q of m.querschnitte) {
      expect(q.breite!).toBeCloseTo(8, 9)
      expect([q.links.herkunft, q.links.art, q.rechts.herkunft, q.rechts.art]).toEqual(['av', 'normal', 'av', 'normal'])
    }
    expect(m.abweichungen).toEqual([])
    expect(m.fuehrung.links.teile).toEqual(m.rand.links.teile)
    expect(m.fuehrung.rechts.teile).toEqual(m.rand.rechts.teile)
    expect(m.rand.links.luecken).toEqual([])
  })

  it('zwei Strassenflächen mit Stossstelle E 50: ein durchgehender Rand', () => {
    const m = bordmodell({ flaechen: [fl('Strasse_Weg', rechteck(-50, 50, -4, 4)), fl('Strasse_Weg', rechteck(50, 150, -4, 4)), ...trottoirs()],
      achse: [pt(0, 0), pt(100, 0)] })
    expect(m.rand.links.teile.length).toBe(1)
    expect(m.rand.rechts.teile.length).toBe(1)
    expect(m.querschnitte.every(q => Math.abs(q.breite! - 8) < 1e-9)).toBe(true)
  })

  it('Achse 5° gedreht und 1 m versetzt: derselbe Rand, Breite bleibt 8,00 (nicht 8,03)', () => {
    const w = 5 * Math.PI / 180, c = pt(50, 1), d: P = [Math.cos(w), Math.sin(w)]
    const m = bordmodell({ flaechen: gerade(), achse: [[c[0] - 50 * d[0], c[1] - 50 * d[1]], [c[0] + 50 * d[0], c[1] + 50 * d[1]]] })
    expect(alleN(m.rand.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    expect(alleN(m.rand.rechts.teile).every(n => Math.abs(n + 4) < 1e-9)).toBe(true)
    for (const q of m.querschnitte) expect(q.breite!).toBeCloseTo(8, 6)
    const q = querBei(m, 50)
    expect(Math.hypot(q.links.punkt![0] - q.rechts.punkt![0], q.links.punkt![1] - q.rechts.punkt![1])).toBeCloseTo(8 / Math.cos(w), 6)
  })

  it('Abnahme schräge Achse: Achse quer durch die Fahrbahn (N +3,5 → −3,5 auf 50 m, 8°) gegen gerade Achse – dieselben Borde, Breite überall 8,00, Seiten richtig', () => {
    const flaechen = gerade()
    const a = bordmodell({ flaechen, achse: [pt(-10, 0), pt(60, 0)] })
    const b = bordmodell({ flaechen, achse: [pt(0, 3.5), pt(50, -3.5)] })
    const fenster = (p: [number, number]) => p[0] >= 10 && p[0] <= 40
    // (1) gemessener Rand je Seite deckungsgleich (Toleranz 1 cm), links oben, rechts unten
    deckungsgleich(a.rand.links.teile, b.rand.links.teile, fenster, 0.01)
    deckungsgleich(a.rand.rechts.teile, b.rand.rechts.teile, fenster, 0.01)
    expect(alleN(b.rand.links.teile).every(n => Math.abs(n - 4) < 0.01)).toBe(true)
    expect(alleN(b.rand.rechts.teile).every(n => Math.abs(n + 4) < 0.01)).toBe(true)
    // (2) an jeder Station 8,00 m ± 1 cm, obwohl die Messpunkte auf der schrägen Normalen 8,00/cos 8° = 8,08 m auseinanderliegen
    expect(b.querschnitte.length).toBe(52)                 // Achse 50,49 m: Stationen 0…50 und das Ende
    for (const q of b.querschnitte) {
      expect(Math.abs(q.breite! - 8)).toBeLessThan(0.01)
      expect(rel(q.links.punkt!)[1]).toBeCloseTo(4, 6)
      expect(rel(q.rechts.punkt!)[1]).toBeCloseTo(-4, 6)
      expect(q.links.quer!).toBeGreaterThan(0)
      expect(q.rechts.quer!).toBeLessThan(0)
    }
    const q = querBei(b, 25)
    expect(Math.hypot(q.links.punkt![0] - q.rechts.punkt![0], q.links.punkt![1] - q.rechts.punkt![1])).toBeGreaterThan(8.07)
    expect(b.abweichungen).toEqual([])
  })

  it('Achse gegen die Gegenrichtung: links ist jetzt der Bord N −4, Teile in Achsrichtung', () => {
    const m = bordmodell({ flaechen: gerade(), achse: [pt(100, 0), pt(0, 0)] })
    expect(alleN(m.rand.links.teile).every(n => Math.abs(n + 4) < 1e-9)).toBe(true)
    expect(alleN(m.rand.rechts.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    const l = m.rand.links.teile[0].map(rel)
    expect(l[0][0]).toBeCloseTo(100, 9)
    expect(l[l.length - 1][0]).toBeCloseTo(0, 9)
    expect(m.querschnitte.every(q => q.links.quer! > 0 && q.rechts.quer! < 0 && Math.abs(q.breite! - 8) < 1e-9)).toBe(true)
  })

  it('Knick 20° (Achse und Borde knicken): ein Rand je Seite, keine Abweichung, Breite 8,00 ausser unmittelbar am Knick', () => {
    const w = 20 * Math.PI / 180, mitte = [pt(-50, 0), pt(50, 0), pt(50 + 100 * Math.cos(w), 100 * Math.sin(w))]
    const band = (a: number, b: number, seite: 'links' | 'rechts') => [...parallele(mitte, a, seite), ...parallele(mitte, b, seite).reverse()]
    const flaechen = [fl('Strasse_Weg', [...parallele(mitte, 4, 'rechts'), ...parallele(mitte, 4, 'links').reverse()]),
      fl('Trottoir', band(4, 7, 'links')), fl('Trottoir', band(4, 7, 'rechts'))]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(50, 0), pt(50 + 50 * Math.cos(w), 50 * Math.sin(w))] })
    expect([m.rand.links.teile.length, m.rand.rechts.teile.length]).toEqual([1, 1])
    expect(m.abweichungen).toEqual([])
    for (const q of m.querschnitte) {
      if (Math.abs(q.s - 50) > 1.5) expect(q.breite!).toBeCloseTo(8, 6)
      else expect(Math.abs(q.breite! - 8)).toBeLessThan(0.15)
    }
  })

  it('Teilstück einer langen Fläche (Ecken E −300 und E 400): Rand konstant, kein Segment quert die Fahrbahn', () => {
    const m = bordmodell({ flaechen: gerade(-300, 400), achse: [pt(0, 0), pt(100, 0)] })
    for (const [seite, n] of [['links', 4], ['rechts', -4]] as const) {
      for (const linie of [m.rand[seite].teile, m.fuehrung[seite].teile]) {
        expect(linie.length).toBe(1)
        const t = linie[0].map(rel)
        for (let i = 1; i < t.length; i++) {
          expect(Math.abs(t[i - 1][1] - n)).toBeLessThan(1e-9)
          expect(Math.abs(t[i][1] - n)).toBeLessThan(1e-9)
          expect(t[i][0]).toBeGreaterThan(t[i - 1][0])
        }
        expect(t[0][0]).toBeCloseTo(0, 9)
        expect(t[t.length - 1][0]).toBeCloseTo(100, 9)
      }
    }
    expect(m.querschnitte.every(q => Math.abs(q.breite! - 8) < 1e-9)).toBe(true)
  })
})

// Strasse mit Trottoirnase links (E 20…26, N 2,5), Seitenstrasse links (E 40…46, Eckbogen r 3), Haltestellenbucht rechts (E 55…85,
// Rampen 1:3, Sohle N −7 E 64…76)
const kern = (): AvFlaecheLv[] => [
  fl('Strasse_Weg', [pt(-50, -4), pt(55, -4), pt(64, -7), pt(76, -7), pt(85, -4), pt(150, -4), pt(150, 4), pt(49, 4), ...bogen(49, 7, 3, -90, -180),
    pt(46, 40), pt(40, 40), pt(40, 7), ...bogen(37, 7, 3, 0, -90), pt(26, 4), pt(26, 2.5), pt(20, 2.5), pt(20, 4), pt(-50, 4)]),
  fl('Trottoir', [pt(-50, -10), pt(150, -10), pt(150, -4), pt(85, -4), pt(76, -7), pt(64, -7), pt(55, -4), pt(-50, -4)]),
  fl('Trottoir', rechteck(-50, 40, 4, 40)), fl('Trottoir', rechteck(20, 26, 2.5, 4)), fl('Trottoir', rechteck(46, 150, 4, 40)),
]
const kernZusatz = { abzweigungen: [{ p: pt(43, 0), arm: pt(43, 20) }], haltestellen: [{ p: pt(70, -8), seite: 'rechts' as const }] }

describe('bordmodell: Kernabnahme zwei OSM-Achsen', () => {
  it('dieselbe AV mit zwei verschiedenen Achsen → derselbe gemessene Rand und dieselbe Führungslinie auf dem inneren Teilstück', () => {
    const a = bordmodell({ flaechen: kern(), achse: [pt(0, 0), pt(100, 0)], ...kernZusatz })
    const b = bordmodell({ flaechen: kern(), achse: [pt(0, 0.9), pt(45, 0.2), pt(100, -0.9)], ...kernZusatz })
    // innen: E 5…95; quer bis N ±9 (der Rand in der Seitenstrasse endet am Band ±15 m ab der jeweiligen Achse)
    const fenster = (p: [number, number]) => p[0] >= 5 && p[0] <= 95 && Math.abs(p[1]) <= 9
    for (const seite of ['links', 'rechts'] as const) {
      deckungsgleich(a.rand[seite].teile, b.rand[seite].teile, fenster)
      deckungsgleich(a.fuehrung[seite].teile, b.fuehrung[seite].teile, fenster)
    }
    const kurz = (m: Bordmodell) => m.abweichungen.map(x => [x.seite, x.art, x.verbunden, x.von && rel(x.von).map(v => Math.round(v * 1e6) / 1e6),
      x.bis && rel(x.bis).map(v => Math.round(v * 1e6) / 1e6)])
    expect(kurz(b)).toEqual(kurz(a))
    expect(kurz(a)).toEqual([
      ['links', 'nase', false, [20, 4], [26, 4]],
      ['links', 'einmuendung', true, [37, 4], [49, 4]],
      ['rechts', 'bucht', true, [55, -4], [85, -4]],
    ])
    // Abschnittsenden: senkrecht zur jeweiligen Achse geschnitten (dürfen sich unterscheiden)
    expect(rel(a.rand.links.teile[0][0])[0]).toBeCloseTo(0, 9)
    expect(rel(b.rand.links.teile[0][0])[0]).not.toBeCloseTo(0, 3)
  })

  it('Einmündung, Nase, Bucht: Führungslinie gerade, gemessener Rand folgt; Querschnitt aus dem gemessenen Rand', () => {
    const m = bordmodell({ flaechen: kern(), achse: [pt(0, 0), pt(100, 0)], ...kernZusatz })
    expect(m.fuehrung.links.teile.length).toBe(1)
    expect(m.fuehrung.rechts.teile.length).toBe(1)
    expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-9 || Math.abs(n - 2.5) < 1e-9)).toBe(true)
    expect(alleN(m.fuehrung.rechts.teile).every(n => Math.abs(n + 4) < 1e-9)).toBe(true)
    expect(m.fuehrung.links.verbindungen.map(v => [v.art, rel(v.von)[0], rel(v.bis)[0]])).toEqual([['einmuendung', 37, 49]])
    expect(m.fuehrung.rechts.verbindungen.map(v => [v.art, rel(v.von)[0], rel(v.bis)[0]])).toEqual([['bucht', 55, 85]])
    expect(Math.min(...alleN(m.rand.rechts.teile))).toBeCloseTo(-7, 9)
    const q70 = querBei(m, 70)
    expect([q70.rechts.art, q70.rechts.herkunft]).toEqual(['bucht', 'av'])
    expect(rel(q70.rechts.punkt!)[1]).toBeCloseTo(-7, 9)
    expect(q70.breite!).toBeCloseTo(11, 9)
    const q23 = querBei(m, 23)
    expect(q23.links.art).toBe('nase')
    expect(q23.breite!).toBeCloseTo(6.5, 9)
    expect(querBei(m, 43).links.art).toBe('einmuendung')
    expect(querBei(m, 43).links.punkt).toBeNull()
  })
})

// Seitenstrasse links E 47…53 bis N 40, Eckbögen r 3: der Umriss läuft ohne Unterbruch um die Ecke
const einmuendung = (): AvFlaecheLv[] => [
  fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(56, 4), ...bogen(56, 7, 3, -90, -180), pt(53, 40), pt(47, 40), pt(47, 7),
    ...bogen(44, 7, 3, 0, -90), pt(-50, 4)]),
  fl('Trottoir', rechteck(-50, 47, 4, 40)), fl('Trottoir', rechteck(53, 150, 4, 40)), fl('Trottoir', rechteck(-50, 150, -7, -4)),
]

describe('bordmodell: Einmündung', () => {
  it('mit OSM-Abzweigung: Führungslinie gerade N 4 von E 44 bis E 56, gemessener Rand folgt der Ecke bis ans Band', () => {
    const m = bordmodell({ flaechen: einmuendung(), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0), seite: 'links' }] })
    expect(m.rand.links.teile.length).toBe(2)
    const w = m.rand.links.teile[0].map(rel), o = m.rand.links.teile[1].map(rel)
    expect(w.some(([e, n]) => e > 44.5 && e < 46.9 && n > 4.1 && n < 6.9)).toBe(true)        // Eckbogen
    expect(w[w.length - 1][0]).toBeCloseTo(47, 9)
    expect(w[w.length - 1][1]).toBeGreaterThan(BAND_M - 2)                                 // Seitenstrasse bis ans Band
    expect(o[0][0]).toBeCloseTo(53, 9)
    expect(m.fuehrung.links.teile.length).toBe(1)
    expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    const e = abw(m, 'links')
    expect(e.map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!)])).toEqual([['einmuendung', true, [44, 4], [56, 4]]])
    expect(e[0].grund).toMatch(/Richtungsänderung 90° und OSM-Abzweigung 4,0 m/)
    expect(querBei(m, 50).links.art).toBe('einmuendung')
    expect(querBei(m, 45).links.herkunft).toBe('av')     // auf dem Eckbogen
    expect(abw(m, 'rechts')).toEqual([])
  })

  it('ohne Abzweigung (oder nur rechts): keine Einmündung; der Bord läuft danach in derselben Flucht weiter → Öffnung (Nachtrag B, BK3), ' +
    'Führungslinie gerade N 4', () => {
    for (const abzweigungen of [[], [{ p: pt(50, 0), seite: 'rechts' as const }]]) {
      const m = bordmodell({ flaechen: einmuendung(), achse: [pt(0, 0), pt(100, 0)], abzweigungen })
      expect(m.fuehrung.links.teile.length).toBe(1)
      expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
      expect(m.fuehrung.links.verbindungen.map(v => [v.art, rel(v.von), rel(v.bis)])).toEqual([['oeffnung', [44, 4], [56, 4]]])
      const e = abw(m, 'links')
      expect(e.map(x => [x.art, x.verbunden])).toEqual([['oeffnung', true]])
      expect(e[0].grund).toBe('Bordflucht über die Öffnung 12,0 m (Richtung 0,0°, Versatz 0,00 m)')
      expect(querBei(m, 50).links.art).toBe('oeffnung')
      expect(m.rand.links.teile.length).toBe(2)                                             // der gemessene Rand bleibt gleich
    }
  })
  // BK3 Gegenfälle: Mündung E 44 … E 56 (bzw. breiter), Bord danach versetzt, abgewinkelt oder zu weit weg → bleibt «Rand unbekannt»
  const muendung = (e1: number, nachher: P[], trottoirNachher: P[]): AvFlaecheLv[] => [
    fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), ...nachher, pt(e1, 40), pt(44, 40), pt(44, 4), pt(-50, 4)]),
    fl('Trottoir', rechteck(-50, 44, 4, 40)), fl('Trottoir', trottoirNachher), fl('Trottoir', rechteck(-50, 150, -7, -4)),
  ]
  it(`Öffnung nur in der Bordflucht: Bord danach 1 m versetzt (über OEFFNUNG_VERSATZ_M ${OEFFNUNG_VERSATZ_M} m), 10° abgewinkelt ` +
    `(über BUCHT_PARALLEL_GRAD ${BUCHT_PARALLEL_GRAD}°) oder Lücke 32 m (über VERBINDUNG_MAX_M): «Rand unbekannt», nicht verbunden`, () => {
    const h = 94 * Math.tan(10 * Math.PI / 180)
    const faelle = {
      versetzt: muendung(56, [pt(150, 5), pt(56, 5)], [pt(56, 5), pt(150, 5), pt(150, 40), pt(56, 40)]),
      abgewinkelt: muendung(56, [pt(150, 4 + h), pt(56, 4)], [pt(56, 4), pt(150, 4 + h), pt(150, 40 + h), pt(56, 40)]),
      breit: muendung(76, [pt(150, 4), pt(76, 4)], rechteck(76, 150, 4, 40)),
    }
    for (const [name, flaechen] of Object.entries(faelle)) {
      const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)] })
      expect(abw(m, 'links').map(x => [x.art, x.verbunden]), name).toEqual([['unbekannt', false]])
      expect(m.fuehrung.links.verbindungen, name).toEqual([])
    }
    // dieselbe Mündung mit Bord in der Flucht, 28 m breit: Öffnung
    const m = bordmodell({ flaechen: muendung(72, [pt(150, 4), pt(72, 4)], rechteck(72, 150, 4, 40)), achse: [pt(0, 0), pt(100, 0)] })
    expect(abw(m, 'links').map(x => [x.art, x.verbunden])).toEqual([['oeffnung', true]])
  })

  // Nachtrag B, BK1 (Knoten 282774166, Bürkiweg): vor der Ausrundung springt der Rand mit einem Absatz 2,4 m nach aussen, dazwischen ein
  // kurzes flaches Stück zur Gartenanlage. Westecke: Absatz E 44 von N 4 auf N 6,4 (Trottoir dahinter), flach bis E 44 + flach, dann
  // Ausrundung Radius 3 in die Seitenstrasse (Gartenanlage dahinter)
  const absatz = (flach: number): AvFlaecheLv[] => {
    const e1 = 44 + flach, w = e1 + 3
    return [
      fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(56, 4), ...bogen(56, 7, 3, -90, -180), pt(53, 40), pt(w, 40), pt(w, 9.4),
        ...bogen(e1, 9.4, 3, 0, -90), pt(44, 6.4), pt(44, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, 44, 4, 40)), fl('Gartenanlage', [pt(44, 6.4), pt(e1, 6.4), ...bogen(e1, 9.4, 3, -90, 0), pt(w, 40), pt(44, 40)]),
      fl('Trottoir', rechteck(53, 150, 4, 40)), fl('Trottoir', rechteck(-50, 150, -7, -4)),
    ]
  }
  it('Absatz mit 0,5 m flach vor der Ausrundung: eine Flanke, Anschlusspunkt an der Trottoirecke E 44 / N 4 (BK1)', () => {
    const m = bordmodell({ flaechen: absatz(0.5), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0), seite: 'links' }] })
    const e = abw(m, 'links')
    expect(e.map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!)])).toEqual([['einmuendung', true, [44, 4], [56, 4]]])
    expect(m.fuehrung.links.teile.length).toBe(1)
    expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    // der gemessene Rand folgt weiter dem Absatz
    expect(m.rand.links.teile[0].map(rel).some(([e1, n]) => Math.abs(e1 - 44) < 1e-9 && Math.abs(n - 6.4) < 1e-9)).toBe(true)
  })
  it(`Absatz mit 3 m geradem Bord vor der Ausrundung (mindestens ANKER_SONDE_M ${ANKER_SONDE_M} m): zwei Flanken, Anschlusspunkt nach dem ` +
    'Absatz wie bisher', () => {
    const m = bordmodell({ flaechen: absatz(3), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0), seite: 'links' }] })
    const e = abw(m, 'links').find(x => x.art === 'einmuendung')!
    expect(rel(e.von!)[0]).toBeCloseTo(47, 6)
    expect(rel(e.von!)[1]).toBeCloseTo(6.4, 6)
  })
  it('gespiegelt (Ausrundung aus der Seitenstrasse, kurzes Stück, Absatz zurück zum Trottoir): Anschlusspunkt nach dem Absatz', () => {
    // dieselbe Geometrie um E 50 gespiegelt: Absatz bei E 56 von N 6,4 auf N 4
    const sp = (p: P): P => pt(100 - rel(p)[0], rel(p)[1])
    const flaechen = absatz(0.5).map(f => ({ ...f, ringe: f.ringe.map(r => r.map(sp).reverse()) }))
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0), seite: 'links' }] })
    const e = abw(m, 'links')
    expect(e.map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!)])).toEqual([['einmuendung', true, [44, 4], [56, 4]]])
    expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
  })

  // Nachtrag B, BK2 (Dalmazi, Knoten 1021708): vor dem Bord eine offene Kante gegen «uebrige_befestigte»
  const offenVorBord = (bis: number): AvFlaecheLv[] => [
    fl('Strasse_Weg', rechteck(-50, 150, -4, 4)), fl('uebrige_befestigte', rechteck(-50, bis, 4, 20)), fl('Trottoir', rechteck(bis, 150, 4, 7)),
    fl('Trottoir', rechteck(-50, 150, -7, -4)),
  ]
  it('Bord erst nach dem Abschnittsanfang (offene Kante davor) mit OSM-Abzweigung dieser Seite: Einmündung, Führung N 4 ab dem Anfang (BK2)', () => {
    const m = bordmodell({ flaechen: offenVorBord(12), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(0, 0), arm: pt(0, 10) }] })
    expect(abw(m, 'links').map(x => [x.art, x.verbunden, x.s0, x.s1])).toEqual([['einmuendung', true, 0, 12]])
    expect(m.fuehrung.links.teile.length).toBe(1)
    expect(rel(m.fuehrung.links.teile[0][0])).toEqual([0, 4])
    expect(m.rand.links.teile.map(t => rel(t[0]))).toEqual([[12, 4]])                     // der gemessene Rand beginnt weiter bei E 12
  })
  it('dieselbe Stelle ohne Abzweigung dieser Seite, und eine offene Kante über VERBINDUNG_MAX_M: bleibt «Rand unbekannt»', () => {
    const ohne = bordmodell({ flaechen: offenVorBord(12), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(0, 0), arm: pt(0, -10) }] })
    expect(abw(ohne, 'links').map(x => [x.art, x.verbunden, x.grund])).toEqual([['unbekannt', false, 'Rand unbekannt (kein Bord)']])
    const lang = bordmodell({ flaechen: offenVorBord(VERBINDUNG_MAX_M + 10), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(0, 0), arm: pt(0, 10) }] })
    const e = abw(lang, 'links')
    expect(e.map(x => [x.art, x.verbunden])).toEqual([['einmuendung', false]])
    expect(e[0].grund).toMatch(/verworfen \(Rand unbekannt\)/)
    expect(rel(lang.fuehrung.links.teile[0][0])).toEqual([VERBINDUNG_MAX_M + 10, 4])
  })

  it('Abschnitt endet in der Kreuzung: Führungslinie läuft gerade bis zum Abschnittsende', () => {
    const m = bordmodell({ flaechen: einmuendung(), achse: [pt(0, 0), pt(50, 0)], abzweigungen: [{ p: pt(50, 0) }] })
    const t = m.fuehrung.links.teile
    expect(t.length).toBe(1)
    expect(rel(t[0][t[0].length - 1])).toEqual([50, 4])
    expect(m.fuehrung.links.verbindungen.map(v => [v.art, rel(v.von), rel(v.bis)])).toEqual([['einmuendung', [44, 4], [50, 4]]])
    expect(abw(m, 'links').map(x => [x.art, x.s0, x.s1, x.bis])).toEqual([['einmuendung', 44, 50, null]])
    // Abschnitt beginnt in der Kreuzung: Führungslinie beginnt gerade am Abschnittsanfang
    const n = bordmodell({ flaechen: einmuendung(), achse: [pt(50, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0) }] })
    expect(n.fuehrung.links.teile.length).toBe(1)
    expect(rel(n.fuehrung.links.teile[0][0])).toEqual([50, 4])
    expect(n.fuehrung.links.verbindungen.map(v => [v.art, rel(v.von), rel(v.bis)])).toEqual([['einmuendung', [50, 4], [56, 4]]])
    expect(abw(n, 'links').map(x => [x.art, x.s0, x.s1, x.von])).toEqual([['einmuendung', 0, 6, null]])
    expect(n.querschnitt(3).links.art).toBe('einmuendung')
  })
})

describe('Nachtrag B, BK4: Nase mit flachen Flanken (Gegenfall, Bern 768:72)', () => {
  // Bord rechts (Süden) N −4, Nase E 40 … 60 bis N −2,5 mit Flanken 27° zur Achse; Bord links N 4 gerade; keine Abzweigung
  const f = 1.5 / Math.tan(27 * Math.PI / 180)
  const nase = (): AvFlaecheLv[] => [
    fl('Strasse_Weg', [pt(-50, -4), pt(40, -4), pt(40 + f, -2.5), pt(60 - f, -2.5), pt(60, -4), pt(150, -4), pt(150, 4), pt(-50, 4)]),
    fl('Trottoir', [pt(-50, -7), pt(150, -7), pt(150, -4), pt(60, -4), pt(60 - f, -2.5), pt(40 + f, -2.5), pt(40, -4), pt(-50, -4)]),
    fl('Trottoir', rechteck(-50, 150, 4, 7)),
  ]
  const m = bordmodell({ flaechen: nase(), achse: [pt(0, 0), pt(100, 0)] })
  it(`die Nase bleibt im gemessenen Rand und als Engstelle: Breite an der Spitze 6,50 m`, () => {
    expect(m.rand.rechts.teile.flat().some(p => Math.abs(rel(p)[1] + 2.5) < 1e-9)).toBe(true)
    expect(querBei(m, 50).breite).toBeCloseTo(6.5, 6)
    expect(querBei(m, 50).rechts.quer).toBeCloseTo(-2.5, 6)
  })
  it(`auf der Flanke (27°, über RICHTUNG_MAX_GRAD ${RICHTUNG_MAX_GRAD}°) bleibt der Bordpunkt, die Messrichtung dreht nicht mit (vorher Mittel ` +
    'beider Seiten 13,5°): Richtung entlang der Achse, Breite senkrecht dazu', () => {
    const q = querBei(m, 42)
    expect(q.rechts.punkt).not.toBeNull()
    expect(q.richtung).not.toBeNull()
    expect(Math.abs(q.richtung![1])).toBeLessThan(1e-9)
    expect(q.breite).toBeCloseTo(4 - q.rechts.quer!, 6)
  })
})

describe('Nachtrag B, S8/BK4: trichterförmige Mündung (Bürkiweg, Knoten 32985984)', () => {
  // Seitenstrasse im Norden E 44 … 50; ihr Ostrand läuft ab N 10 mit 27° zur Achse aus und erreicht den Bord N 4 erst bei E 61,8
  const e1 = 50 + 6 / Math.tan(27 * Math.PI / 180)
  const trichter = (): AvFlaecheLv[] => [
    fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(e1, 4), pt(50, 10), pt(50, 40), pt(44, 40), pt(44, 4), pt(-50, 4)]),
    fl('Trottoir', rechteck(-50, 44, 4, 40)), fl('Trottoir', [pt(e1, 4), pt(150, 4), pt(150, 40), pt(50, 40), pt(50, 10)]),
    fl('Trottoir', rechteck(-50, 150, -7, -4)),
  ]
  it(`mit OSM-Abzweigung: der 27° schräge Rand gehört zur Flanke (ab FLANKE_ABZW_GRAD ${FLANKE_ABZW_GRAD}°), Einmündung verbunden, ` +
    'Führungslinie gerade N 4; der gemessene Rand folgt weiter dem Trichter', () => {
    const m = bordmodell({ flaechen: trichter(), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(47, 0), seite: 'links' }] })
    const e = abw(m, 'links')
    expect(e.map(x => [x.art, x.verbunden])).toEqual([['einmuendung', true]])
    expect(rel(e[0].von!)).toEqual([44, 4])
    expect(rel(e[0].bis!)[0]).toBeGreaterThanOrEqual(e1 - 1e-6); expect(rel(e[0].bis!)[1]).toBeCloseTo(4, 6)
    expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-6)).toBe(true)
    expect(alleN(m.rand.links.teile).some(n => n > 6)).toBe(true)
  })
  it(`ohne Abzweigung dieser Seite gilt weiter EINM_WINKEL_GRAD: der schräge Rand bleibt Bord, die Führung folgt ihm (wie bisher)`, () => {
    const m = bordmodell({ flaechen: trichter(), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(47, 0), seite: 'rechts' }] })
    expect(alleN(m.fuehrung.links.teile).some(n => n > 6)).toBe(true)
    expect(abw(m, 'links').some(x => x.art === 'einmuendung')).toBe(false)
  })
})

describe('Nachtrag B: Einmündung in einer Kurve (offener Punkt S7)', () => {
  // Ring um (0, R) zwischen den Radien R − 4 und R + 4, Mündung nach Süden zwischen E −6 und E 6
  const ringVon = (R: number) => {
    const MP = pt(0, R)
    const kreis = (r: number, w0: number, w1: number, schritt = 0.25): P[] => {
      const n = Math.max(1, Math.round(Math.abs(w1 - w0) / schritt))
      return Array.from({ length: n + 1 }, (_, k) => { const w = (w0 + (w1 - w0) * k / n) * Math.PI / 180; return [MP[0] + r * Math.cos(w), MP[1] + r * Math.sin(w)] as P })
    }
    const w6 = -90 + Math.asin(6 / (R + 4)) * 180 / Math.PI
    const flaechen = [fl('Strasse_Weg', [...kreis(R + 4, 30, w6), pt(6, -30), pt(-6, -30), ...kreis(R + 4, -180 - w6, -150), ...kreis(R - 4, -150, 30)]),
      fl('Gartenanlage', rechteck(-200, 200, -60, 250))]
    return bordmodell({ flaechen, achse: kreis(R, -130, -50, 0.5), abzweigungen: [{ p: pt(0, 4), arm: pt(0, -10) }] })
  }
  it('Bogen R 104: Einmündung verbunden, die Führung über die Mündung ist (noch) die Gerade zwischen den Anschlusspunkten', () => {
    const v = ringVon(100).fuehrung.rechts.verbindungen
    expect(v.map(x => [x.art, x.linie.length])).toEqual([['einmuendung', 2]])
    expect(dist(v[0].von, v[0].bis)).toBeLessThan(VERBINDUNG_MAX_M)
  })
  it('Ist (S7): im Bogen R 54 findet die Suche des Anschlusspunkts die Ecke nicht – der Bord weicht von der Geraden über ANKER_SONDE_M ' +
    'schon 7 cm ab, der Anschlusspunkt liegt am Anfang des Suchfensters (SUCHE_M vor der Flanke), die Verbindung ist über ' +
    'VERBINDUNG_MAX_M und wird verworfen', () => {
    const e = ringVon(50).abweichungen.find(a => a.seite === 'rechts' && a.art === 'einmuendung')!
    expect(e.verbunden).toBe(false)
    expect(dist(e.von!, e.bis!)).toBeGreaterThan(VERBINDUNG_MAX_M)
    expect(e.grund).toMatch(/verworfen/)
  })
})

describe('bordmodell: Fussweg in derselben Fläche Strasse_Weg', () => {
  it('offene Kante, Bord davor und danach in derselben Flucht: Öffnung (BK3), Führungslinie gerade; der gemessene Rand bleibt offen', () => {
    const flaechen = [
      fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(51.5, 4), pt(51.5, 12), pt(48.5, 12), pt(48.5, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, 48.5, 4, 7)), fl('Gartenanlage', rechteck(-50, 48.5, 7, 20)),
      fl('Trottoir', rechteck(51.5, 150, 4, 7)), fl('Gartenanlage', rechteck(51.5, 150, 7, 20)), fl('Trottoir', rechteck(-50, 150, -7, -4)),
    ]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)] })
    expect(m.stuecke.some(x => x.nachbar === 'offen' && rel(x.a)[1] === 12 && rel(x.b)[1] === 12)).toBe(true)
    expect(m.rand.links.teile.length).toBe(2)
    expect(m.rand.links.luecken.map(x => [rel(x.von!), rel(x.bis!)])).toEqual([[[48.5, 12], [51.5, 12]]])
    expect(abw(m, 'links').map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!)])).toEqual([['oeffnung', true, [48.5, 4], [51.5, 4]]])
    expect(m.fuehrung.links.teile.length).toBe(1)
    expect(alleN(m.fuehrung.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    const q = querBei(m, 50)
    expect([q.links.punkt, q.links.herkunft, q.links.art, q.breite]).toEqual([null, 'unbekannt', 'oeffnung', null])
    expect(querBei(m, 30).links.art).toBe('normal')
  })
})

describe('bordmodell: Trottoirnase', () => {
  it('Nase 6 m (E 47…53, N 2,5) bleibt im gemessenen Rand und in der Führungslinie, Breite dort 6,50', () => {
    const flaechen = [fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(53, 4), pt(53, 2.5), pt(47, 2.5), pt(47, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(47, 53, 2.5, 4)), ...trottoirs()]
    for (const achse of [[pt(0, 0), pt(100, 0)], [pt(0, 0.8), pt(100, -0.6)]]) {
      const m = bordmodell({ flaechen, achse })
      expect(m.rand.links.teile.length).toBe(1)
      expect(m.rand.links.teile[0].map(rel).filter(([, n]) => n === 2.5).map(([e]) => e)).toEqual([47, 49, 51, 53])
      expect(m.fuehrung.links.teile).toEqual(m.rand.links.teile)
      expect(abw(m, 'links').map(x => [x.art, x.verbunden, Math.round(x.tiefe! * 1e6) / 1e6])).toEqual([['nase', false, 1.5]])
      const q = m.querschnitt(50)
      expect(q.links.art).toBe('nase')
      expect(rel(q.links.punkt!)[1]).toBeCloseTo(2.5, 9)
      expect(q.breite!).toBeCloseTo(6.5, 6)
      expect(m.querschnitt(20).breite!).toBeCloseTo(8, 6)
    }
  })
})

describe('bordmodell: Haltestellenbucht', () => {
  const flaechen = [
    fl('Strasse_Weg', [pt(-50, -4), pt(40, -4), pt(49, -7), pt(61, -7), pt(70, -4), pt(150, -4), pt(150, 4), pt(-50, 4)]),
    fl('Trottoir', [pt(-50, -10), pt(150, -10), pt(150, -4), pt(70, -4), pt(61, -7), pt(49, -7), pt(40, -4), pt(-50, -4)]),
    fl('Trottoir', rechteck(-50, 150, 4, 7)),
  ]
  it('mit bekannter Haltestelle: gemessener Rand folgt der Bucht, Führungslinie gerade vorbei', () => {
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)], haltestellen: [{ p: pt(55, -8), seite: 'rechts' }] })
    expect(Math.min(...alleN(m.rand.rechts.teile))).toBeCloseTo(-7, 9)
    expect(m.fuehrung.rechts.teile.length).toBe(1)
    expect(alleN(m.fuehrung.rechts.teile).every(n => Math.abs(n + 4) < 1e-9)).toBe(true)
    expect(abw(m, 'rechts').map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!), Math.round(x.tiefe! * 1e6) / 1e6]))
      .toEqual([['bucht', true, [40, -4], [70, -4], 3]])
    const q = querBei(m, 55)
    expect(q.rechts.art).toBe('bucht')
    expect(rel(q.rechts.punkt!)[1]).toBeCloseTo(-7, 9)
    expect(q.breite!).toBeCloseTo(11, 9)
  })
  it('dieselbe Ausbuchtung ohne Haltestelle (oder Haltestelle auf der anderen Seite): keine Bucht, Führungslinie folgt dem Rand', () => {
    for (const haltestellen of [[], [{ p: pt(55, 8), seite: 'links' as const }]]) {
      const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)], haltestellen })
      expect(m.abweichungen).toEqual([])
      expect(m.fuehrung.rechts.teile).toEqual(m.rand.rechts.teile)
      expect(querBei(m, 55).rechts.art).toBe('normal')
    }
  })
})

describe('bordmodell: Verkehrsinsel', () => {
  for (const [name, n0, n1] of [['unter der Achse', -1, 1.5], ['neben der Achse', 2, 3.5]] as const) {
    it(`Insel ${name} (Loch der Strassenfläche): nicht Teil eines Seitenrands, Breite Bord–Bord 12,00`, () => {
      const insel = rechteck(40, 60, n0, n1)
      const m = bordmodell({ flaechen: [fl('Strasse_Weg', rechteck(-50, 150, -6, 6), insel.slice().reverse()), fl('Verkehrsinsel', insel),
        ...trottoirs(-50, 150, 6)], achse: [pt(0, 0), pt(100, 0)] })
      expect(m.stuecke.filter(x => x.insel).length).toBeGreaterThan(10)
      expect(m.stuecke.filter(x => x.insel).every(x => x.nachbar === 'bord' && x.nachbarArt === 'Verkehrsinsel')).toBe(true)
      expect(m.stueckSeite.filter((s, k) => s !== null && m.stuecke[k].insel)).toEqual([])
      expect(alleN(m.rand.links.teile).every(n => Math.abs(n - 6) < 1e-9)).toBe(true)
      expect(alleN(m.rand.rechts.teile).every(n => Math.abs(n + 6) < 1e-9)).toBe(true)
      const q = querBei(m, 50)
      expect(rel(q.links.punkt!)[1]).toBeCloseTo(6, 9)
      expect(rel(q.rechts.punkt!)[1]).toBeCloseTo(-6, 9)
      expect(q.breite!).toBeCloseTo(12, 9)
      expect(m.abweichungen).toEqual([])
    })
  }
})

describe('Bord für Schnitte quer zur Fahrbahn (schnittBord, Plan A6)', () => {
  it('Querschnitt: örtliche Randrichtung längs des Bords, auch bei schiefer Achse', () => {
    const m = bordmodell({ flaechen: gerade(), achse: [pt(0, 1), pt(100, -1.5)] })
    const q = m.querschnitt(50)
    expect(q.richtung![0]).toBeCloseTo(1, 9)
    expect(q.richtung![1]).toBeCloseTo(0, 9)
    // nur ein Rand mit Bordpunkt (links offen): Richtung aus dem rechten Rand; ohne Bord keine Richtung
    expect(bordmodell({ flaechen: [fl('Strasse_Weg', rechteck(-50, 150, -4, 4)), fl('Trottoir', rechteck(-50, 150, -7, -4))], achse: [pt(0, 0), pt(100, 0)] })
      .querschnitt(50).richtung).toEqual([1, 0])
    expect(bordmodell({ flaechen: [fl('Strasse_Weg', rechteck(-50, 150, -4, 4))], achse: [pt(0, 0), pt(100, 0)] }).querschnitt(50).richtung).toBeNull()
  })
  it('Fussweg in der Fläche Strasse_Weg (3 m, Bord in der Flucht: Öffnung): gerade überbrückt, für Führungslinie und gemessenen Rand', () => {
    const flaechen = [
      fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(51.5, 4), pt(51.5, 12), pt(48.5, 12), pt(48.5, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, 48.5, 4, 7)), fl('Gartenanlage', rechteck(-50, 48.5, 7, 20)),
      fl('Trottoir', rechteck(51.5, 150, 4, 7)), fl('Gartenanlage', rechteck(51.5, 150, 7, 20)), fl('Trottoir', rechteck(-50, 150, -7, -4)),
    ]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)] })
    for (const basis of ['fuehrung', 'rand'] as const) {
      const s = schnittBord(m, 'links', basis)
      // Führungslinie: die Öffnung ist schon Teil der Linie; gemessener Rand: überbrückt
      expect(s.ueberbrueckt.map(x => [rel(x.von), rel(x.bis)])).toEqual(basis === 'rand' ? [[[48.5, 4], [51.5, 4]]] : [])
      if (basis === 'rand') expect(s.ueberbrueckt[0].grund).toMatch(/^Bordflucht über die Öffnung 3,0 m/)
      expect(geradeSchnitte(pt(50, 0), [0, 1], s.teile).map(t => Math.round(t * 1e6) / 1e6)).toEqual([4])
    }
    // die Fahrbahnbreite liest weiter nur den gemessenen Rand: dort kein Bordpunkt
    expect(m.querschnitt(50).breite).toBeNull()
  })
  it(`Lücke über ${SCHNITT_LUECKE_MAX_M} m (Strassenmündung ohne OSM-Weg): in der Bordflucht als Öffnung überbrückt (BK3); mit 1 m ` +
    'versetztem Bord danach nicht überbrückt, Rand bleibt unbekannt', () => {
    const mit = (n1: number) => [fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, n1), pt(56, n1), pt(56, 40), pt(44, 40), pt(44, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, 44, 4, 40)), fl('Trottoir', rechteck(56, 150, n1, 40)), fl('Trottoir', rechteck(-50, 150, -7, -4))]
    const m = bordmodell({ flaechen: mit(4), achse: [pt(0, 0), pt(100, 0)] })
    expect(abw(m, 'links').map(x => x.art)).toEqual(['oeffnung'])
    expect(schnittBord(m, 'links', 'rand').ueberbrueckt.map(x => [rel(x.von), rel(x.bis)])).toEqual([[[44, 4], [56, 4]]])
    expect(geradeSchnitte(pt(50, 0), [0, 1], schnittBord(m, 'links', 'rand').teile).filter(t => t > 0 && t < 20)).toEqual([4])
    const v = bordmodell({ flaechen: mit(5), achse: [pt(0, 0), pt(100, 0)] })
    expect(abw(v, 'links').map(x => x.art)).toEqual(['unbekannt'])
    expect(schnittBord(v, 'links').ueberbrueckt).toEqual([])
    expect(geradeSchnitte(pt(50, 0), [0, 1], schnittBord(v, 'links', 'rand').teile).filter(t => t > 0 && t < 20)).toEqual([])
  })
  it('bestätigte Einmündung: für Streifen gerade zwischen den Anschlusspunkten, nicht über das Abschnittsende verlängert', () => {
    const m = bordmodell({ flaechen: einmuendung(), achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0), seite: 'links' }] })
    const r = schnittBord(m, 'links', 'rand')
    expect(r.ueberbrueckt.map(x => [rel(x.von), rel(x.bis)])).toEqual([[[44, 4], [56, 4]]])
    expect(geradeSchnitte(pt(50, 0), [0, 1], r.teile).filter(t => t > 0)[0]).toBeCloseTo(4, 9)
    // Abschnitt endet in der Kreuzung: Führungslinie (Fahrlinie) bis zum Ende verlängert, für Streifen nur der gemessene Rand
    const n = bordmodell({ flaechen: einmuendung(), achse: [pt(0, 0), pt(50, 0)], abzweigungen: [{ p: pt(50, 0) }] })
    expect(geradeSchnitte(pt(49, 0), [0, 1], schnittBord(n, 'links').teile).filter(t => t > 0)[0]).toBeCloseTo(4, 9)
    expect(schnittBord(n, 'links', 'rand').ueberbrueckt).toEqual([])
  })
})

// Parallele
const schneidetSich = (l: P[]) => {
  for (let i = 0; i + 1 < l.length; i++) for (let j = i + 2; j + 1 < l.length; j++) {
    const [a, b, c, d] = [l[i], l[i + 1], l[j], l[j + 1]]
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]
    if (Math.abs(den) < 1e-12) continue
    const w = [c[0] - a[0], c[1] - a[1]], t = (w[0] * s[1] - w[1] * s[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den
    if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return true
  }
  return false
}
const proben = (l: P[], n = 20) => l.slice(1).flatMap((b, i) => Array.from({ length: n + 1 }, (_, k) => [l[i][0] + (b[0] - l[i][0]) * k / n, l[i][1] + (b[1] - l[i][1]) * k / n] as P))

describe('parallele', () => {
  const knick = [pt(0, 0), pt(10, 0), pt(10, 10)]
  it('90°-Knick innen: überall genau 1,80 m, ohne Selbstüberschneidung', () => {
    const p = parallele(knick, 1.8, 'links')
    expect(p.map(rel).map(([e, n]) => [Math.round(e * 1e9) / 1e9, Math.round(n * 1e9) / 1e9])).toEqual([[0, 1.8], [8.2, 1.8], [8.2, 10]])
    for (const x of proben(p)) expect(abstandLinie(x, [knick])).toBeCloseTo(1.8, 9)
    expect(schneidetSich(p)).toBe(false)
  })
  it('90°-Knick aussen: Gehrung, jede Strecke 1,80 m von ihrer Strecke, nirgends näher', () => {
    const p = parallele(knick, 1.8, 'rechts')
    expect(p.map(rel).map(([e, n]) => [Math.round(e * 1e9) / 1e9, Math.round(n * 1e9) / 1e9])).toEqual([[0, -1.8], [11.8, -1.8], [11.8, 10]])
    for (const x of proben([p[0], p[1]])) expect(rel(x)[1]).toBeCloseTo(-1.8, 9)
    for (const x of proben([p[1], p[2]])) expect(rel(x)[0]).toBeCloseTo(11.8, 9)
    for (const x of proben(p)) expect(abstandLinie(x, [knick])).toBeGreaterThanOrEqual(1.8 - 1e-9)
    expect(schneidetSich(p)).toBe(false)
  })
  it('enge Kurve (Radius 1 m, Abstand 1,80 m innen) und spitzer Knick aussen: keine Schlaufe, Abstand nie kleiner', () => {
    const kurve = [pt(-10, 0), pt(0, 0), ...bogen(0, 1, 1, -90, 0, 6), pt(1, 11)]
    const p = parallele(kurve, 1.8, 'links')
    expect(schneidetSich(p)).toBe(false)
    for (const x of proben(p)) expect(abstandLinie(x, [kurve])).toBeGreaterThanOrEqual(1.8 - 1e-9)
    expect(rel(p[0])[1]).toBeCloseTo(1.8, 9)
    const spitz = [pt(0, 0), pt(10, 0), pt(0, 2)]          // Richtungsänderung über 120°: Bogen statt Gehrung
    const q = parallele(spitz, 1.8, 'rechts')
    expect(schneidetSich(q)).toBe(false)
    for (const x of proben(q)) expect(abstandLinie(x, [spitz])).toBeGreaterThanOrEqual(1.8 - 1e-9)
    expect(Math.max(...q.map(x => abstandLinie(x, [spitz])))).toBeLessThanOrEqual(1.8 / Math.cos(7.5 * Math.PI / 180) + 1e-9)
  })
})

// ── Nachträge 14.11.2026 (Plan «Nachträge für den Baustein», aus A3, A4 und A7) ──
const ohneStuecke = (m: Bordmodell) => ({ rand: m.rand, fuehrung: m.fuehrung, abweichungen: m.abweichungen, querschnitte: m.querschnitte })
/** Strecken der Führungslinie einer Seite mit ihrer Herkunft: [E0, N0, E1, N1, konstruiert] gerundet */
const strecken = (m: Bordmodell, seite: 'links' | 'rechts') => m.fuehrung[seite].teile.flatMap((t, i) => t.slice(1).map((p, k) =>
  [...rel(t[k]), ...rel(p)].map(v => Math.round(v * 1e6) / 1e6).concat(m.fuehrung[seite].konstruiert[i][k] ? 1 : 0)))

// Aegertenstrasse (way 4862752): Häuserblock als Loch der grossen Strassenfläche (Hauptstrasse N −4…4, Parallelstrasse N 30…38,
// Querstrassen an beiden Enden), im Block Trottoir N 4…7, Gebäude und ein Vorplatz als eigene Fläche Strasse_Weg E 50…65 / N 9…13
const block = (): AvFlaecheLv[] => [
  fl('Strasse_Weg', rechteck(-50, 150, -4, 38), rechteck(-40, 140, 4, 30).reverse()),
  fl('Trottoir', rechteck(-40, 140, 4, 7)), fl('Gebaeude', rechteck(-40, 50, 7, 30)), fl('Gebaeude', rechteck(65, 140, 7, 30)),
  fl('Gebaeude', rechteck(50, 65, 7, 9)), fl('Strasse_Weg', rechteck(50, 65, 9, 13)), fl('Gartenanlage', rechteck(50, 65, 13, 30)),
  fl('Trottoir', rechteck(-50, 150, -7, -4)),
]

describe('Nachtrag K1: Insel nur, wenn es eine ist', () => {
  it('Häuserblock mit Trottoir als Loch der Strassenfläche, Vorplatz dahinter: Bord links N 4 (nicht die Kante des Vorplatzes)', () => {
    const m = bordmodell({ flaechen: block(), achse: [pt(0, 0), pt(100, 0)] })
    expect(m.rand.links.teile.length).toBe(1)
    expect(alleN(m.rand.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    expect(m.abweichungen).toEqual([])
    for (const q of m.querschnitte) {
      expect(rel(q.links.punkt!)[1]).toBeCloseTo(4, 9)
      expect(q.breite!).toBeCloseTo(8, 9)
    }
    // die Kanten des Blocks sind Bord gegen Trottoir bzw. Gebäude, keine Inselkanten
    expect(m.stuecke.filter(x => x.ring === 1).every(x => !x.insel && x.nachbar === 'bord')).toBe(true)
  })
  it('Loch ohne Fläche (Lücke in den Daten) und Verkehrsinsel werden weiter überbrückt', () => {
    const loch = rechteck(40, 60, 2, 3.5)
    for (const flaechen of [[fl('Strasse_Weg', rechteck(-50, 150, -6, 6), loch.slice().reverse()), ...trottoirs(-50, 150, 6)],
      [fl('Strasse_Weg', rechteck(-50, 150, -6, 6), loch.slice().reverse()), fl('Verkehrsinsel', loch), ...trottoirs(-50, 150, 6)]]) {
      const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)] })
      expect(rel(querBei(m, 50).links.punkt!)[1]).toBeCloseTo(6, 9)
      expect(querBei(m, 50).breite!).toBeCloseTo(12, 9)
    }
  })
})

// Nebenfahrbahn hinter einer Verkehrsinsel (E 40…70): die Insel wird überbrückt, die Hauptfahrbahn behält ihren Rand N 4 entlang der Insel;
// der Rand der Nebenfahrbahn N 10 lag als zweiter, überlappender Teil derselben Seite dahinter
const nebenfahrbahn = (): AvFlaecheLv[] => [
  fl('Strasse_Weg', rechteck(-50, 150, -4, 4)), fl('Verkehrsinsel', rechteck(40, 70, 4, 6)), fl('Strasse_Weg', rechteck(40, 70, 6, 10)),
  fl('Trottoir', rechteck(-50, 40, 4, 13)), fl('Trottoir', rechteck(70, 150, 4, 13)), fl('Trottoir', rechteck(40, 70, 10, 13)),
  fl('Trottoir', rechteck(-50, 150, -7, -4)),
]

describe('Nachtrag K2: verdeckte Randteile', () => {
  it('überlappender Teil hinter dem Rand entfällt: keine umgekehrte Lücke, kein falsches Ende, Bordpunkt auf dem Teil davor', () => {
    const m = bordmodell({ flaechen: nebenfahrbahn(), achse: [pt(0, 0), pt(100, 0)] })
    expect(m.rand.links.teile.length).toBe(1)
    expect(alleN(m.rand.links.teile).every(n => Math.abs(n - 4) < 1e-9)).toBe(true)
    expect(m.rand.links.verdeckt.length).toBe(1)
    expect(Math.max(...alleN(m.rand.links.verdeckt))).toBeCloseTo(10, 9)
    expect(m.rand.links.luecken).toEqual([])
    expect(abw(m, 'links')).toEqual([])
    const q = querBei(m, 55)
    expect([q.links.art, q.links.herkunft]).toEqual(['normal', 'av'])
    expect(rel(q.links.punkt!)[1]).toBeCloseTo(4, 9)
    expect(q.links.richtung).toEqual([1, 0])
    expect(q.breite!).toBeCloseTo(8, 9)
  })
})

describe('Nachtrag K3: Richtung für die Breite aus der getroffenen AV-Strecke', () => {
  it('Fahrbahn 10 m mit Trottoirnase 1 m (E 47…53): bis an die Ecke 10,00 m (die Sehne ±1 m neigte sich dort), an der Nase 9,00 m', () => {
    const flaechen = [fl('Strasse_Weg', [pt(-50, -5), pt(150, -5), pt(150, 5), pt(53, 5), pt(53, 4), pt(47, 4), pt(47, 5), pt(-50, 5)]),
      fl('Trottoir', rechteck(47, 53, 4, 5)), ...trottoirs(-50, 150, 5)]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)] })
    for (const s of [40, 46.2, 46.5, 46.8, 46.95, 53.05, 53.2, 53.5, 60]) {
      const q = m.querschnitt(s)
      expect(q.breite!).toBeCloseTo(10, 9)
      expect(q.richtung).toEqual([1, 0])
      expect(q.links.richtung).toEqual([1, 0])
    }
    expect(m.querschnitt(50).breite!).toBeCloseTo(9, 9)
  })
})

describe('Nachtrag K4: Masslinie im Querschnitt', () => {
  it('Achse 8° schief: Enden der Masslinie senkrecht zum Bord (N +4 und −4 auf derselben Senkrechten), Länge = Breite 8,00', () => {
    const m = bordmodell({ flaechen: gerade(), achse: [pt(0, 3.5), pt(50, -3.5)] })
    for (const q of m.querschnitte) {
      const l = rel(q.links.mess!), r = rel(q.rechts.mess!)
      expect(l[1]).toBeCloseTo(4, 9)
      expect(r[1]).toBeCloseTo(-4, 9)
      expect(l[0]).toBeCloseTo(r[0], 9)
      expect(Math.hypot(l[0] - r[0], l[1] - r[1])).toBeCloseTo(q.breite!, 9)
      expect(Math.hypot(q.links.punkt![0] - q.rechts.punkt![0], q.links.punkt![1] - q.rechts.punkt![1])).toBeGreaterThan(8.07)
    }
    // ohne Bordpunkt einer Seite keine Masslinie
    const n = bordmodell({ flaechen: [fl('Strasse_Weg', rechteck(-50, 150, -4, 4)), fl('Trottoir', rechteck(-50, 150, -7, -4))], achse: [pt(0, 0), pt(100, 0)] })
    expect([n.querschnitt(50).links.mess, n.querschnitt(50).rechts.mess]).toEqual([null, null])
  })
})

describe('Nachtrag 5: konstruierte Führung kennzeichnen und prüfen', () => {
  it('je Strecke gemessen oder konstruiert: Einmündung und Bucht konstruiert, der Rest gemessen; Linie der Verbindung', () => {
    const m = bordmodell({ flaechen: kern(), achse: [pt(0, 0), pt(100, 0)], ...kernZusatz })
    expect(strecken(m, 'links').filter(x => x[4])).toEqual([[37, 4, 49, 4, 1]])
    expect(strecken(m, 'rechts').filter(x => x[4])).toEqual([[55, -4, 85, -4, 1]])
    expect(strecken(m, 'links').filter(x => !x[4]).length).toBeGreaterThan(20)
    for (const s of ['links', 'rechts'] as const) {
      expect(m.fuehrung[s].konstruiert.map(k => k.length)).toEqual(m.fuehrung[s].teile.map(t => t.length - 1))
      for (const v of m.fuehrung[s].verbindungen) expect(v.linie).toEqual([v.von, v.bis])
    }
  })
  it(`Einmündung mit Anschlusspunkten ${VERBINDUNG_MAX_M + 10} m auseinander: Überbrückung verworfen, Führungslinie unterbrochen`, () => {
    const flaechen = [fl('Strasse_Weg', [pt(-50, -4), pt(150, -4), pt(150, 4), pt(70, 4), pt(70, 40), pt(30, 40), pt(30, 4), pt(-50, 4)]),
      fl('Trottoir', rechteck(-50, 30, 4, 40)), fl('Trottoir', rechteck(70, 150, 4, 40)), fl('Trottoir', rechteck(-50, 150, -7, -4))]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0), seite: 'links' }] })
    const e = abw(m, 'links')
    expect(e.map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!)])).toEqual([['einmuendung', false, [30, 4], [70, 4]]])
    expect(e[0].grund).toMatch(/Richtungsänderung 90° und OSM-Abzweigung 4,0 m; konstruierte Führung 40,0 m länger als 30 m, verworfen/)
    expect(m.fuehrung.links.teile.length).toBe(2)
    expect(m.fuehrung.links.verbindungen).toEqual([])
    expect(m.fuehrung.links.konstruiert.flat().some(Boolean)).toBe(false)
    expect(schnittBord(m, 'links', 'rand').ueberbrueckt).toEqual([])
    expect(querBei(m, 50).links.art).toBe('einmuendung')
  })
  it('Bucht an einer Haltestelle, 50 m lang: bleibt verbunden (Grenze nur für Einmündungen und Abschnittsenden)', () => {
    const flaechen = [fl('Strasse_Weg', [pt(-50, -4), pt(30, -4), pt(39, -7), pt(71, -7), pt(80, -4), pt(150, -4), pt(150, 4), pt(-50, 4)]),
      fl('Trottoir', [pt(-50, -10), pt(150, -10), pt(150, -4), pt(80, -4), pt(71, -7), pt(39, -7), pt(30, -4), pt(-50, -4)]),
      fl('Trottoir', rechteck(-50, 150, 4, 7))]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)], haltestellen: [{ p: pt(55, -8), seite: 'rechts' }] })
    expect(abw(m, 'rechts').map(x => [x.art, x.verbunden, rel(x.von!), rel(x.bis!)])).toEqual([['bucht', true, [30, -4], [80, -4]]])
    expect(strecken(m, 'rechts').filter(x => x[4])).toEqual([[30, -4, 80, -4, 1]])
  })
  it('Abschnitt beginnt in einer Einmündung auf einem Platz (keine Fläche Strasse_Weg): Verlängerung neben der Fahrbahn verworfen', () => {
    const flaechen = [fl('Strasse_Weg', [pt(20, -4), pt(150, -4), pt(150, 4), pt(26, 4), pt(26, 40), pt(20, 40)]),
      fl('uebrige_befestigte', rechteck(-30, 20, -10, 40)), fl('Trottoir', rechteck(26, 150, 4, 40)), fl('Trottoir', rechteck(20, 150, -7, -4))]
    const m = bordmodell({ flaechen, achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(23, 0), seite: 'links' }] })
    const e = abw(m, 'links')
    expect(e.map(x => [x.art, x.verbunden, x.von, rel(x.bis!)])).toEqual([['einmuendung', false, null, [26, 4]]])
    expect(e[0].grund).toMatch(/konstruierte Führung neben der Fahrbahn \(20 von 26 Prüfpunkten 0,3 m innen weder Strasse_Weg noch Verkehrsinsel\), verworfen/)
    expect(rel(m.fuehrung.links.teile[0][0])).toEqual([26, 4])
    expect(m.fuehrung.links.verbindungen).toEqual([])
    // dieselbe Mündung mit Fahrbahn bis zum Abschnittsanfang: gerade bis E 0 verlängert, konstruiert
    const n = bordmodell({ flaechen: [fl('Strasse_Weg', [pt(-30, -4), pt(150, -4), pt(150, 4), pt(26, 4), pt(26, 40), pt(20, 40), pt(20, 4), pt(-30, 4)]),
      ...flaechen.slice(2)], achse: [pt(0, 0), pt(100, 0)], abzweigungen: [{ p: pt(23, 0), seite: 'links' }] })
    expect(abw(n, 'links').map(x => [x.art, x.verbunden])).toEqual([['einmuendung', true]])
    expect(strecken(n, 'links').filter(x => x[4])).toEqual([[0, 4, 26, 4, 1]])
  })
})

// Kurve mit Radius 50 m (Achse), Borde konzentrisch innen R 46 (links), aussen R 54 (rechts); am Abschnittsanfang mündet aussen eine
// Seitenstrasse (E −6…6) nach Süden. Mittelpunkt (0, 50), Achse ab (0, 0) nach Osten, im Gegenuhrzeigersinn
const MP = pt(0, 50)
const kreis = (r: number, w0: number, w1: number, schritt = 0.25): P[] => {
  const n = Math.max(1, Math.round(Math.abs(w1 - w0) / schritt))
  return Array.from({ length: n + 1 }, (_, k) => { const w = (w0 + (w1 - w0) * k / n) * Math.PI / 180; return [MP[0] + r * Math.cos(w), MP[1] + r * Math.sin(w)] as P })
}
const kurve = (): AvFlaecheLv[] => {
  const w6 = -90 + Math.asin(6 / 54) * 180 / Math.PI
  return [
    fl('Strasse_Weg', [...kreis(54, 30, w6), pt(6, -30), pt(-6, -30), ...kreis(54, -180 - w6, -150), ...kreis(46, -150, 30)]),
    fl('Gartenanlage', rechteck(-100, 120, -60, 120)),
  ]
}

describe('Nachtrag 6: Anfang und Ende entlang der Krümmung', () => {
  it('Kurve Radius 50 m, Abschnitt beginnt in der Einmündung: Verlängerung bis zum Anfang höchstens 1 cm neben dem Bord (Tangente > 0,5 m)', () => {
    const achse = kreis(50, -90, -30, 0.5)
    const m = bordmodell({ flaechen: kurve(), achse, abzweigungen: [{ p: pt(0, 0), arm: pt(0, -20) }] })
    expect(abw(m, 'links')).toEqual([])
    const e = abw(m, 'rechts')
    expect(e.map(x => [x.art, x.verbunden, x.von])).toEqual([['einmuendung', true, null]])
    const f = m.fuehrung.rechts, t = f.teile[0], k = f.konstruiert[0]
    expect(f.teile.length).toBe(1)
    const n = k.findIndex(x => !x)
    expect(n).toBeGreaterThan(5)
    expect(k.slice(n).some(Boolean)).toBe(false)
    const konstruiert = t.slice(0, n + 1)
    expect(f.verbindungen.map(v => v.linie)).toEqual([konstruiert])
    // auf der Senkrechten zur ersten Teilstrecke der Achse (wie der Schnitt des gemessenen Rands)
    const d0 = m.achse.richtungAnfang
    expect((konstruiert[0][0] - achse[0][0]) * d0[0] + (konstruiert[0][1] - achse[0][1]) * d0[1]).toBeCloseTo(0, 9)
    expect(Math.max(...konstruiert.map(p => Math.abs(dist(p, MP) - 54)))).toBeLessThan(0.01)
    // Anschlusspunkt und Tangente (Abweichung): die gerade Verlängerung läge am Anfang weit neben dem Bord
    const B = e[0].bis!, r = e[0].richtungBis!
    expect(dist(B, konstruiert[n])).toBeLessThan(1e-9)
    const tau = rel(B)[0] / r[0], tg: P = [B[0] - r[0] * tau, B[1] - r[1] * tau]
    expect(Math.abs(dist(tg, MP) - 54)).toBeGreaterThan(0.5)
  })
  it('gerade Achse: Verlängerung wie bisher genau die Tangente (zwei Punkte)', () => {
    const m = bordmodell({ flaechen: einmuendung(), achse: [pt(50, 0), pt(100, 0)], abzweigungen: [{ p: pt(50, 0) }] })
    expect(m.fuehrung.links.verbindungen.map(v => v.linie.map(rel))).toEqual([[[50, 4], [56, 4]]])
    expect(abw(m, 'links')[0].richtungBis).toEqual([1, 0])
  })
})

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('Nachtrag 7: vorberechnete Bordstücke', () => {
  it('einmal für zwei Achsen gerechnet: dasselbe Ergebnis wie je Achse für sich, auch mit Teilung einer langen Kante weit draussen', () => {
    // lange Kante N 4 von E −300 bis 400, geteilt bei E 301 (Ecke eines Trottoirs, ausserhalb des Bereichs der ersten Achse)
    const flaechen = [fl('Strasse_Weg', rechteck(-300, 400, -4, 4)), fl('Trottoir', rechteck(-300, 301, 4, 7)), fl('Gartenanlage', rechteck(301, 400, 4, 7)),
      fl('Trottoir', rechteck(-300, 400, -7, -4)), ...kern().slice(1, 2)]
    const achsen = [[pt(0, 0), pt(100, 0)], [pt(250, 1), pt(350, -1)], [pt(10, 0.5), pt(60, 0.5), pt(90, -0.5)]]
    const stuecke = bordStuecke(flaechen, bordBereich(...achsen))
    for (const achse of achsen) {
      const einzeln = bordmodell({ flaechen, achse }), gemeinsam = bordmodell({ flaechen, achse, stuecke })
      expect(gemeinsam.stuecke.length).toBeGreaterThan(einzeln.stuecke.length)
      expect(ohneStuecke(gemeinsam)).toEqual(ohneStuecke(einzeln))
    }
    // im Kernfall mit Einmündung, Nase und Bucht ebenso
    const z = [[pt(0, 0), pt(100, 0)], [pt(0, 0.9), pt(45, 0.2), pt(100, -0.9)]]
    const st = bordStuecke(kern(), bordBereich(...z))
    for (const achse of z) expect(ohneStuecke(bordmodell({ flaechen: kern(), achse, ...kernZusatz, stuecke: st })))
      .toEqual(ohneStuecke(bordmodell({ flaechen: kern(), achse, ...kernZusatz })))
  })
})
