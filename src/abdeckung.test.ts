// Tests Planung (16.10.2026): Abdeckung der geladenen Daten, Nachlade-Entscheid, gemeinsamer Ladeort mehrerer Streifen von Hand
// (Korrektur S2), Fall-Datei mit Streifen weit vom Ort, Texte (S3).
import { describe, expect, it } from 'vitest'
import { AV_RADIUS_M, OSM_RADIUS_M, PARK_RADIUS_M, NACHLADEN_M, REICHWEITE_M, QUERUNG_M, STREIFEN_OSM_HALB_M, ORT_TOL_M, abgedeckt,
  streifenAbstand, ortEntscheid, planEntscheid, ortVerlegen, fallAmStreifen, abstandText, nichtAbgedeckt, nachladenText,
  nichtAbgedecktText, ausserhalbText, planNeuText, querungWegText, querungVerschobenText, querungAusserhalb, gemeinsamerOrt, gemeinsamAbgedeckt,
  type HandLage, type OrtEntscheid } from './abdeckung'
import { SICHTWEITE } from './rechner/tempo'
import { ARM_MESSUNG } from './rechner/abbiegen'
import { KATASTER_PARK_M } from './rechner/vorschlaege'
import { fallLesen, leererFall } from './fall'
import { lv95, wgs, dist, kleinsterKreis, type P } from './geo'

const O: P = [2600000, 1200000]
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rel = (p: P): P => [Math.round((p[0] - O[0]) * 1000) / 1000, Math.round((p[1] - O[1]) * 1000) / 1000]
/** Streifen quer (Nord–Süd) bei x, Länge 2·halb, Breite 4 m */
const quer = (id: string, x: number, halb = 3, y = 0, breite = 4): HandLage => ({ id, p0: lv(x, y - halb), p1: lv(x, y + halb), breite })

describe('Herleitung der Abdeckung', () => {
  it('NACHLADEN_M = AV-Ausschnitt minus Reichweite der Rechnung (30 m)', () => {
    const swMax = Math.max(...Object.values(SICHTWEITE))
    // Abbiegende: Knoten innerhalb der grössten Sichtweite + Messung am Arm, dazu seitlich rund 10 m: in der Reichweite enthalten
    expect(REICHWEITE_M).toBeGreaterThanOrEqual(swMax + ARM_MESSUNG[ARM_MESSUNG.length - 1] + 10)
    expect(REICHWEITE_M).toBe(KATASTER_PARK_M)
    expect(NACHLADEN_M).toBe(Math.min(AV_RADIUS_M, PARK_RADIUS_M) - REICHWEITE_M)
    expect(NACHLADEN_M).toBe(30)
    expect(OSM_RADIUS_M - REICHWEITE_M).toBeGreaterThan(NACHLADEN_M)       // OSM begrenzt nicht
    expect(QUERUNG_M).toBe(15)
    // Streifen aus OSM + AV mit halber Balkenlänge (2 m): bis 32 m vom Ladeort, in der Reserve von 5 m (115 + 5 = 120 m)
    const osmStreifen = QUERUNG_M + STREIFEN_OSM_HALB_M + 2
    expect(osmStreifen).toBe(32)
    expect(AV_RADIUS_M - osmStreifen).toBeGreaterThanOrEqual(REICHWEITE_M - 5)
  })
  it('weitester Punkt des Umrisses: Achsenende + halbe Breite', () => {
    expect(streifenAbstand(quer('a', 20), O)).toBeCloseTo(Math.hypot(20, 3) + 2)
    expect(abgedeckt(quer('a', 20), O)).toBe(true)                        // 22,2 m
    expect(abgedeckt(quer('a', 29), O)).toBe(false)                       // 29,2 + 2 m: Mitte innert 30 m, Streifen nicht ganz
    expect(abgedeckt({ ...quer('a', 0, 28), breite: 4 }, O)).toBe(true)  // genau 30 m
    expect(abgedeckt({ ...quer('a', 0, 28.1), breite: 4 }, O)).toBe(false)
    expect(nichtAbgedeckt([quer('a', 20), quer('b', 29)], O)).toEqual([{ id: 'b', reichtM: Math.hypot(29, 3) + 2 }])
  })
})

describe('Gemeinsamer Ladeort mehrerer Streifen von Hand (S2)', () => {
  it('kleinster Kreis (geo.kleinsterKreis): zwei, drei Punkte, auf einer Geraden, LV95-Grössen', () => {
    const k2 = kleinsterKreis([lv(0, 0), lv(10, 0)])!
    expect([rel(k2.m), k2.r]).toEqual([[5, 0], 5])
    const k3 = kleinsterKreis([lv(0, 0), lv(10, 0), lv(5, 1), lv(5, -1)])!            // innen liegende zählen nicht
    expect([rel(k3.m), k3.r]).toEqual([[5, 0], 5])
    const dreieck = kleinsterKreis([lv(0, 0), lv(6, 0), lv(3, 5)])!                     // spitzes Dreieck: Umkreis
    expect(dist(dreieck.m, lv(0, 0))).toBeCloseTo(dreieck.r, 9)
    expect(dist(dreieck.m, lv(3, 5))).toBeCloseTo(dreieck.r, 9)
    expect(kleinsterKreis([lv(0, 0), lv(1, 0), lv(3, 0)])!.r).toBeCloseTo(1.5, 12)
    expect(kleinsterKreis([])).toBeNull()
    // viele Punkte (Kreise um Achsenenden): alle drin, Ergebnis unabhängig von der Reihenfolge
    const pts = Array.from({ length: 300 }, (_, i): P => lv(30 * Math.cos(i * 2.4), 20 * Math.sin(i * 1.7)))
    const a = kleinsterKreis(pts)!, b = kleinsterKreis([...pts].reverse())!
    expect(pts.every(p => dist(p, a.m) <= a.r + 1e-6)).toBe(true)
    expect(a.r).toBeCloseTo(b.r, 6)
  })
  it('ein Streifen: seine Mitte; zwei Streifen 40 m auseinander: die Mitte dazwischen, beide abgedeckt', () => {
    const g1 = gemeinsamerOrt([quer('hand-1', 40)])!
    expect(dist(g1.ort, lv(40, 0))).toBeLessThan(1e-9)
    expect(g1.reichtM).toBeCloseTo(5)
    const g = gemeinsamerOrt([quer('hand-1', 0), quer('hand-2', 40)])!
    expect(rel(g.ort)).toEqual([20, 0])
    expect(g.reichtM).toBeCloseTo(Math.hypot(20, 3) + 2)
    expect(gemeinsamerOrt([])).toBeNull()
  })
  it('Spannweite bis rund 60 m: 56 m auseinander gemeinsam, 56 m + 1 m nicht mehr', () => {
    expect(gemeinsamAbgedeckt([quer('a', -25.5), quer('b', 25.5)])).toBe(true)          // √(25,5² + 3²) + 2 = 27,7 m
    expect(gemeinsamAbgedeckt([quer('a', -27.8), quer('b', 27.8)])).toBe(true)          // 27,96 + 2 = 29,96 m
    expect(gemeinsamAbgedeckt([quer('a', -28), quer('b', 28)])).toBe(false)             // 28,16 + 2 = 30,16 m
    // drei Streifen an einem Knoten (zwei Arme, Querstrasse): gemeinsam
    expect(gemeinsamAbgedeckt([quer('a', -20), quer('b', 20), { id: 'c', p0: lv(-3, -20), p1: lv(3, -20), breite: 4 }])).toBe(true)
  })
  it('verschiedene Breiten: Ort zum breiteren Streifen hin, weitester Punkt am kleinsten', () => {
    const a = quer('a', 0), b = quer('b', 40, 3, 0, 10)
    const g = gemeinsamerOrt([a, b])!
    // genau: √(c² + 9) + 2 = √((40 − c)² + 9) + 5 auf der x-Achse
    let lo = 0, hi = 40
    for (let i = 0; i < 100; i++) { const c = (lo + hi) / 2; if (Math.hypot(c, 3) + 2 < Math.hypot(40 - c, 3) + 5) lo = c; else hi = c }
    const opt = Math.hypot(lo, 3) + 2
    expect(g.reichtM).toBeLessThan(opt + 0.01)
    expect(g.reichtM).toBeGreaterThanOrEqual(opt - 1e-9)
    expect(rel(g.ort)[0]).toBeGreaterThan(21)
    expect(g.reichtM).toBeLessThan(Math.hypot(20, 3) + 5)                               // besser als die Mitte der Achsenenden
  })
})

describe('Nachlade-Entscheid (ortEntscheid)', () => {
  it('alle abgedeckt: nicht nachladen; ohne Streifen: nichts', () => {
    expect(ortEntscheid([quer('hand-1', 10)], O)).toMatchObject({ nachladen: false, ort: O, art: null, bezug: 'hand-1', nichtAbgedeckt: [] })
    expect(ortEntscheid([], O)).toMatchObject({ nachladen: false, art: null, bezug: null, vorher: [], nichtAbgedeckt: [] })
  })
  it('ein Streifen weit weg: neuer Ladeort an der Streifenmitte, OSM-Übergang nur in der Nähe behalten', () => {
    const e = ortEntscheid([quer('hand-1', 40)], O, { querung: O })
    expect([e.nachladen, e.art]).toEqual([true, 'alle'])
    expect(dist(e.ort, lv(40, 0))).toBeLessThan(1e-9)
    expect(e.abstandM).toBeCloseTo(40)
    expect(e.vorher).toEqual([{ id: 'hand-1', reichtM: Math.hypot(40, 3) + 2 }])
    expect(e.querungBehalten).toBe(false)                                 // Übergang 40 m von der neuen Mitte
    expect(e.nichtAbgedeckt).toEqual([])
    // Übergang 14 m von der neuen Mitte (langer Streifen, der vom Übergang aus nicht abgedeckt ist): bleibt
    const lang = { id: 'hand-1', p0: lv(14, -28), p1: lv(14, 28), breite: 4 }
    expect(abgedeckt(lang, O)).toBe(false)
    expect(ortEntscheid([lang], O, { querung: O })).toMatchObject({ nachladen: true, querungBehalten: true })
    // ohne Übergang
    expect(ortEntscheid([quer('hand-1', 40)], O).querungBehalten).toBe(false)
    // Lage des Übergangs unsicher (gespeicherter Ort, fallAmStreifen): mit Spiel vorläufig behalten
    // (neuer Ort 30 m vom gespeicherten: der Knoten kann bis 15 m daneben liegen, also bis 15 m vom neuen Ort)
    expect(ortEntscheid([quer('hand-1', 25)], lv(-5, 0), { querung: lv(-5, 0) }).querungBehalten).toBe(false)
    expect(ortEntscheid([quer('hand-1', 25)], lv(-5, 0), { querung: lv(-5, 0), querungSpielM: QUERUNG_M }).querungBehalten).toBe(true)
    expect(ortEntscheid([quer('hand-1', 25)], lv(-6, 0), { querung: lv(-6, 0), querungSpielM: QUERUNG_M }).querungBehalten).toBe(false)
  })
  it('Ladeort schon an der Mitte eines sehr langen Streifens: kein Nachladen (keine Schleife), Streifen gemeldet', () => {
    const s = { id: 'hand-1', p0: lv(-40, 0), p1: lv(40, 0), breite: 4 }
    const e = ortEntscheid([s], O)
    expect([e.nachladen, e.art, e.abstandM]).toEqual([false, null, 0])
    expect(e.nichtAbgedeckt.map(x => x.id)).toEqual(['hand-1'])
    // knapp daneben (unter ORT_TOL_M): ebenso
    expect(ortEntscheid([s], lv(ORT_TOL_M * 0.9, 0)).nachladen).toBe(false)
  })
  it('zwei Streifen an einem Knoten (40 m): um die Mitte beider laden, beide abgedeckt (statt nur um den Bezug)', () => {
    const a = quer('hand-1', 0), b = quer('hand-2', 40)
    const e = ortEntscheid([a, b], O, { bezug: 'hand-2', querung: lv(10, 0) })
    expect([e.nachladen, e.art, e.bezug]).toEqual([true, 'alle', 'hand-2'])
    expect(rel(e.ort)).toEqual([20, 0])
    expect(e.nichtAbgedeckt).toEqual([])
    expect(e.vorher.map(x => x.id)).toEqual(['hand-2'])
    expect(e.querungBehalten).toBe(true)                                  // Übergang 10 m von der neuen Mitte
    expect(ortEntscheid([a, b], O, { querung: O }).querungBehalten).toBe(false)   // 20 m
    // auch wenn der Bezug selbst abgedeckt ist (der andere nicht): gemeinsamer Ort
    expect(ortEntscheid([a, b], O, { bezug: 'hand-1' })).toMatchObject({ nachladen: true, art: 'alle' })
  })
  it('Streifen weit auseinander (kein gemeinsamer Ort): Rückfall um den Bezug, die übrigen melden', () => {
    const a = quer('hand-1', 0), b = quer('hand-2', 500)
    // ohne Bezug: der zuletzt gezeichnete (letzter der Liste)
    const e = ortEntscheid([a, b], O)
    expect([e.nachladen, e.art, e.bezug]).toEqual([true, 'bezug', 'hand-2'])
    expect(rel(e.ort)).toEqual([500, 0])
    expect(e.nichtAbgedeckt.map(x => [x.id, Math.round(x.reichtM)])).toEqual([['hand-1', 502]])
    // Bezug hand-1 (eben verschoben) liegt abgedeckt: nicht nachladen, hand-2 melden
    const f = ortEntscheid([a, b], O, { bezug: 'hand-1' })
    expect([f.nachladen, f.art, f.bezug]).toEqual([false, null, 'hand-1'])
    expect(f.nichtAbgedeckt.map(x => x.id)).toEqual(['hand-2'])
  })
})

describe('Neu gezeichneter Streifen (planEntscheid)', () => {
  const nah = quer('', 10), weit = quer('', 300)
  const bisher = (uebergang: number | null, eingaben: boolean, gesichert: boolean, streifen: HandLage[] = []) =>
    ({ uebergang, eingaben, gesichert, streifen })
  it('in der Abdeckung zum Fall dazu, sonst neuer Fall', () => {
    expect(planEntscheid(nah, O, bisher(7, true, false))).toBe('dazu')
    expect(planEntscheid(nah, O, bisher(null, true, false))).toBe('dazu')
    expect(planEntscheid(nah, null, null)).toBe('neu')                    // kein Ort geladen
    expect(planEntscheid(weit, O, bisher(7, true, false))).toBe('neu')    // im Browser gemerkt
    expect(planEntscheid(weit, O, bisher(null, false, false))).toBe('neu')
    expect(planEntscheid(weit, O, bisher(null, true, true))).toBe('neu')
  })
  it('bisheriger Fall ohne Übergang mit ungesicherten Eingaben: erst bestätigen', () => {
    expect(planEntscheid(weit, O, bisher(null, true, false))).toBe('bestaetigen')
  })
  it('mit den übrigen Streifen von Hand gemeinsam abdeckbar: dazu (S2); ohne Streifen von Hand nur der Ladeort', () => {
    const b = quer('', 40)
    expect(abgedeckt(b, O)).toBe(false)
    expect(planEntscheid(b, O, bisher(null, true, false, [quer('hand-1', 0)]))).toBe('dazu')
    expect(planEntscheid(b, O, bisher(7, true, false, [quer('hand-1', 0)]))).toBe('dazu')
    // Fall am OSM-Übergang ohne Streifen von Hand: der Streifen aus OSM + AV gehört zum Übergang, neuer Fall
    expect(planEntscheid(b, O, bisher(7, true, false))).toBe('neu')
    // zu weit für einen gemeinsamen Ort (70 m)
    expect(planEntscheid(quer('', 70), O, bisher(null, true, false, [quer('hand-1', 0)]))).toBe('bestaetigen')
  })
})

describe('Fall-Datei mit Streifen von Hand weit vom Ort (fallAmStreifen)', () => {
  // wie die Datei des Nutzers vom 16.10.2026: Ort = OSM-Übergang 5330970520, Streifen von Hand an der Glockenstrasse
  const datei = JSON.stringify({ app: 'fgsCheck', version: 1, ort: { lat: 46.9376889, lon: 7.4297326, uebergang: 5330970520,
    markierung: 'unmarkiert' }, quellen: { osm: 'overpass.osm.ch' }, streifenHand: [{ id: 'hand-1', p0: [2596440.0762846987, 1198807.258953019],
    p1: [2596444.976733164, 1198805.6272765996], breite: 4, herkunft: 'gezeichnet' }], hindernisse: [], zufahrten: {}, streifen: {},
    vorschlaege: {}, baumkataster: false })
  it('Ort an die Streifenmitte, OSM-Übergang weg, Hinweis', () => {
    const [f] = fallLesen(datei)
    const r = fallAmStreifen(f)
    const mitte: P = [(f.streifenHand[0].p0[0] + f.streifenHand[0].p1[0]) / 2, (f.streifenHand[0].p0[1] + f.streifenHand[0].p1[1]) / 2]
    const ort = lv95(46.9376889, 7.4297326), reicht = streifenAbstand(f.streifenHand[0], ort)
    expect(dist(ort, mitte)).toBeGreaterThan(2500)
    expect(r.entscheid.nachladen).toBe(true)
    expect(dist(lv95(r.fall.ort.lat, r.fall.ort.lon), mitte)).toBeLessThan(0.01)
    expect(r.fall.ort.uebergang).toBeNull()
    expect(r.fall.ort.markierung).toBeUndefined()
    expect(r.fall.streifenHand).toEqual(f.streifenHand)
    expect(r.hinweis).toBe(`Streifen 1 reicht bis ${abstandText(reicht)} vom gespeicherten Ort (OSM-Übergang 5330970520), weiter ` +
      'als die geladenen Daten reichen (30 m): gerechnet um Streifen 1 (Ort = Streifenmitte); der OSM-Übergang 5330970520 liegt ' +
      'ausserhalb und gehört nicht mehr zum Fall (gemerkt als Fall ohne Übergang; mit «Fall speichern» sichern).')
    expect(abstandText(reicht)).toMatch(/^\d,\d km$/)
    // Original unverändert; danach abgedeckt
    expect([f.ort.uebergang, f.ort.markierung]).toEqual([5330970520, 'unmarkiert'])
    const z = fallAmStreifen(r.fall)
    expect([z.entscheid.nachladen, z.hinweis, z.fall]).toEqual([false, '', r.fall])
  })
  it('Streifen am Ort: unverändert', () => {
    const [lat, lon] = wgs(2596444.7, 1198810.9)
    const f = leererFall(lat, lon, null)
    f.streifenHand.push({ id: 'hand-1', p0: [2596446.99, 1198810.02], p1: [2596442.43, 1198811.81], breite: 4 })
    const r = fallAmStreifen(f)
    expect([r.entscheid.nachladen, r.hinweis, r.fall]).toEqual([false, '', f])
  })
  it('gespeicherter Ort ist nicht sicher der Knoten: Übergang vorläufig behalten (Spiel QUERUNG_M), nach dem Laden entscheidet OSM', () => {
    // gespeicherter Ort O mit Übergang 7; zwei Streifen, gemeinsamer Ort 20 m daneben: der Knoten kann bis 15 m neben O liegen
    const [lat, lon] = wgs(O[0], O[1])
    const f = leererFall(lat, lon, 7)
    f.streifenHand.push(quer('hand-1', 0), quer('hand-2', 40))
    const r = fallAmStreifen(f)
    expect([r.entscheid.art, r.fall.ort.uebergang]).toEqual(['alle', 7])
    const ort = lv95(r.fall.ort.lat, r.fall.ort.lon)
    expect(querungAusserhalb(O, ort)).toBe(true)                          // Knoten = gespeicherter Ort: 20 m, nach dem Laden weg
    expect(querungAusserhalb(lv(10, 0), ort)).toBe(false)                 // Knoten 10 m neben O: bleibt
    // gemeinsamer Ort mehr als 30 m vom gespeicherten Ort: Übergang sicher ausserhalb, gleich weg
    const g = leererFall(lat, lon, 7)
    g.streifenHand.push(quer('hand-1', 40), quer('hand-2', 80))
    expect(fallAmStreifen(g).fall.ort.uebergang).toBeNull()
  })
  it('querungAusserhalb: erst weiter als QUERUNG_M; ohne Knoten nie', () => {
    expect(querungAusserhalb(null, O)).toBe(false)
    expect(querungAusserhalb(lv(15.04, 0), O)).toBe(false)               // Rundung über WGS84 (unter 1 cm) mit Spiel
    expect(querungAusserhalb(lv(15.1, 0), O)).toBe(true)
  })
  it('ortVerlegen: Übergang behalten bzw. weg, Original bleibt', () => {
    const f = leererFall(46.95, 7.44, 42)
    f.ort.markierung = 'unbelegt'
    const e: OrtEntscheid = { nachladen: true, ort: O, art: 'alle', bezug: 'hand-1', abstandM: 20, vorher: [], querungBehalten: true,
      nichtAbgedeckt: [] }
    const behalten = ortVerlegen(f, e)
    expect([behalten.ort.uebergang, behalten.ort.markierung]).toEqual([42, 'unbelegt'])
    expect(dist(lv95(behalten.ort.lat, behalten.ort.lon), O)).toBeLessThan(0.01)
    const weg = ortVerlegen(f, { ...e, querungBehalten: false })
    expect([weg.ort.uebergang, weg.ort.markierung]).toEqual([null, undefined])
    expect([f.ort.lat, f.ort.uebergang]).toEqual([46.95, 42])
  })
})

describe('Texte (S3: Kriterium ist der weiteste Punkt, nicht die Mitte)', () => {
  it('Abstand, nachladen, ausserhalb', () => {
    expect([abstandText(45.4), abstandText(999.4), abstandText(2912)]).toEqual(['45 m', '999 m', '2,9 km'])
    // ein Streifen verschoben
    const e1 = ortEntscheid([quer('hand-1', 80)], O, { bezug: 'hand-1' })
    expect(nachladenText(e1, 'geaendert', null, 1)).toBe('Streifen 1 reicht bis 82 m vom bisherigen Ort, ausserhalb der ' +
      'geladenen Daten (abgedeckt ist ein Streifen, der ganz innert 30 m um den Ort liegt): AV, OSM und Kataster werden um Streifen ' +
      '1 (Ort = Streifenmitte) neu geladen, die Eingaben bleiben.')
    expect(nachladenText({ ...e1, querungBehalten: false }, 'geaendert', 7, 1)).toMatch(/bleiben; der OSM-Übergang 7 liegt ausserhalb und gehört nicht mehr zum Fall: sein Eintrag im Browser ist entfernt/)
    // zwei Streifen, gemeinsamer Ort
    const e2 = ortEntscheid([quer('hand-1', 0), quer('hand-2', 40)], O, { bezug: 'hand-2' })
    expect(nachladenText(e2, 'geaendert', null, 2)).toMatch(/^Streifen 2 reicht bis 42 m vom bisherigen Ort, .* werden um alle Streifen von Hand \(Ort = Mitte aller Streifen, 20 m vom bisherigen\) neu geladen/)
    // Rückfall um den Bezug
    const e3 = ortEntscheid([quer('hand-1', 0), quer('hand-2', 80)], O, { bezug: 'hand-2' })
    expect(nachladenText(e3, 'geaendert', null, 2)).toMatch(/um Streifen 2 \(Ort = Streifenmitte; die Streifen von Hand liegen nicht alle innert 30 m um einen Ort\)/)
    expect(e3.nichtAbgedeckt).toEqual([{ id: 'hand-1', reichtM: Math.hypot(80, 3) + 2 }])
    expect(nichtAbgedecktText(e3.nichtAbgedeckt)).toMatch(/^Streifen von Hand ausserhalb der geladenen Daten \(Streifen 1 reicht bis 82 m vom Ort; abgedeckt ist ein Streifen, der ganz innert 30 m um den Ort liegt\)/)
    expect(nichtAbgedecktText([{ id: 'a', reichtM: 34 }, { id: 'b', reichtM: 40.4 }])).toMatch(/\(Streifen a reicht bis 34 m, Streifen b bis 40 m vom Ort;/)
    // eigene Namen der Streifen von Hand (benennung.streifenTitel)
    const t = (id: string) => (id === 'hand-2' ? 'Nordarm' : `Streifen ${id.slice(5)}`)
    expect(nachladenText(e3, 'geaendert', null, 2, t)).toMatch(/^Nordarm reicht bis 82 m .* um Nordarm \(Ort = Streifenmitte;/)
    expect(nichtAbgedecktText(e3.nichtAbgedeckt, t)).toMatch(/\(Streifen 1 reicht bis 82 m vom Ort;/)
    expect(ausserhalbText({ id: 'a', reichtM: 32.4 })).toBe('reicht bis 32 m vom Ort (abgedeckt ist ein Streifen, der ganz innert 30 m um ' +
      'den Ort liegt): Ergebnis nicht verlässlich, auch «keine Zufahrt» kann daher rühren.')
  })
  it('neuer Fall, Übergang weg', () => {
    expect(planNeuText(31.6, false)).toBe('Der neue Streifen reicht bis 32 m vom geladenen Ort, ausserhalb der geladenen Daten ' +
      '(abgedeckt ist ein Streifen, der ganz innert 30 m um den Ort liegt): die App beginnt am Streifen einen neuen Fall.')
    expect(planNeuText(80, true)).toMatch(/liegt; auch mit den übrigen Streifen von Hand nicht ganz innert 30 m um einen gemeinsamen Ort\): die App/)
    expect(planNeuText(null, false)).toBe('Kein Ort geladen: die App beginnt am Streifen einen neuen Fall.')
    expect(querungVerschobenText(7, 21.4)).toBe('Der OSM-Übergang 7 liegt 21 m vom gespeicherten Ort (in OSM verschoben): AV, OSM ' +
      'und Kataster werden um seine aktuelle Lage neu geladen, die Eingaben bleiben beim Übergang.')
    expect(querungWegText(7, 21.4)).toBe('Der OSM-Übergang 7 liegt 21 m vom Ort, ausserhalb der geladenen Daten (Übergang höchstens 15 m ' +
      'vom Ort): er gehört nicht mehr zum Fall; sein Eintrag im Browser ist entfernt, gemerkt bleibt der Fall ohne Übergang (mit ' +
      '«Fall speichern» sichern).')
  })
})
