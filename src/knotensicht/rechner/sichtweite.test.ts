// Tests VSS 40 273 Tab. 1 (nur Zahlenwerte): vollständige Tabelle, Stufen (Aufrunden), über 80 km/h, Status; E1: Strassentyp,
// ungünstige Verhältnisse, Anhaltesichtweite
import { describe, expect, it } from 'vitest'
import { TAB1, TAB1_STUFEN, tempoStufe, sichtweiteA, zielLaenge, sichtStatus, zwischenwert, istHvsHighway, neigungLesen,
  KEINE_UNGUNST, type Ungunst } from './sichtweite'

describe('VSS 40 273 Tab. 1', () => {
  it('vollständig: 20 bis 80 km/h, unterer und oberer Wert', () => {
    expect(TAB1_STUFEN).toEqual([20, 30, 40, 50, 60, 70, 80])
    expect(TAB1).toEqual({
      20: [10, 20], 30: [20, 35], 40: [35, 50], 50: [50, 70], 60: [70, 90], 70: [90, 110], 80: [110, 140],
    })
    for (const t of TAB1_STUFEN) {
      const sw = sichtweiteA(t)
      expect([sw.stufe, sw.unten, sw.oben]).toEqual([t, ...TAB1[t]])
      expect(sw.massgebend).toBe(sw.unten)            // ohne Angaben: ES, eben -> unterer Wert massgebend
      expect(sw.hinweis).toBeNull()
    }
  })
  it('Stufen: auf die nächste Stufe aufrunden, unter 20 wie 20', () => {
    expect([5, 10, 20, 21, 25, 30, 31, 45, 50, 51, 60, 65, 79, 80].map(tempoStufe)).toEqual(
      [20, 20, 20, 30, 30, 30, 40, 50, 50, 60, 60, 70, 80, 80])
    expect(sichtweiteA(45)).toMatchObject({ tempo: 45, stufe: 50, unten: 50, oben: 70 })
    expect(sichtweiteA(25)).toMatchObject({ stufe: 30, unten: 20, oben: 35 })
  })
  it('über 80 km/h: Werte der Stufe 80 mit Hinweis', () => {
    const sw = sichtweiteA(100)
    expect(sw).toMatchObject({ tempo: 100, stufe: 80, unten: 110, oben: 140, massgebend: 110 })
    expect(sw.hinweis).toContain('über der Tab. 1')
    expect(tempoStufe(100)).toBe(100)
  })
  it('Zielpunkte bis 1,5 × oberer Wert (aufgerundet)', () => {
    expect(zielLaenge(sichtweiteA(30))).toBe(53)        // 1,5 × 35 = 52,5
    expect(zielLaenge(sichtweiteA(50))).toBe(105)
    expect(zielLaenge(sichtweiteA(80))).toBe(210)
  })
  it('Status: erfüllt ab oberem, «unterer Wert» ab unterem Wert, sonst nicht erfüllt', () => {
    const sw = sichtweiteA(50)
    expect(sichtStatus(70, sw)).toBe('erfuellt')
    expect(sichtStatus(69.9, sw)).toBe('massgebend')
    expect(sichtStatus(50, sw)).toBe('massgebend')
    expect(sichtStatus(49.9, sw)).toBe('nicht_erfuellt')
    expect(sichtStatus(0, sw)).toBe('nicht_erfuellt')
  })
})

// E1: Wert nach Strassentyp (Entscheid 1: Zwischenwert = Mittel, aufgerundet), ungünstige Verhältnisse, Anhaltesichtweite ab
// |i| > 2 % (Entscheid 2), Status gegen den massgebenden Wert
describe('VSS 40 273 Ziffer 13.1: Strassentyp, ungünstige Verhältnisse, Neigung', () => {
  const U = (x: Partial<Ungunst>): Ungunst => ({ ...KEINE_UNGUNST, ...x })
  it('Zwischenwert je Stufe: Mittel von unterem und oberem Wert, auf ganze Meter aufgerundet', () => {
    // 20: (10+20)/2 = 15; 30: 27,5 -> 28; 40: 42,5 -> 43; 50: 60; 60: 80; 70: 100; 80: 125
    expect(TAB1_STUFEN.map(t => sichtweiteA(t, 'hvs').zwischen)).toEqual([15, 28, 43, 60, 80, 100, 125])
    expect(zwischenwert(50, 70)).toBe(60)
    expect(zwischenwert(20, 35)).toBe(28)
  })
  it('ES: unterer Wert, auch mit Häkchen (nur Hinweis); HVS: Zwischenwert, mit einem Häkchen oberer Wert', () => {
    expect(sichtweiteA(50)).toMatchObject({ typ: 'es', typStufe: 'unten', typWert: 50, massgebend: 50 })
    expect(sichtweiteA(50, 'es', U({ fahrstreifen: true, neigung: true, schwerverkehr: true }))).toMatchObject({ typStufe: 'unten', massgebend: 50 })
    expect(sichtweiteA(50, 'hvs')).toMatchObject({ typStufe: 'zwischen', typWert: 60, massgebend: 60, massgebendText: 'Zwischenwert, ' +
      'Hauptverkehrsstrasse (Mittel von unterem und oberem Wert, aufgerundet; Entscheid 15.10.2026 – die Norm nennt nur einen Bereich)' })
    for (const k of ['fahrstreifen', 'neigung', 'schwerverkehr'] as (keyof Ungunst)[])
      expect(sichtweiteA(50, 'hvs', U({ [k]: true }))).toMatchObject({ typStufe: 'oben', typWert: 70, massgebend: 70 })
    expect(sichtweiteA(30, 'hvs').massgebend).toBe(28)
    expect(sichtweiteA(80, 'hvs', U({ schwerverkehr: true })).massgebendText).toBe('oberer Wert, Hauptverkehrsstrasse mit ungünstigen Verhältnissen')
  })
  it('Vorgabe Strassentyp aus OSM highway: primary, secondary, tertiary und links = HVS', () => {
    expect(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'tertiary_link'].every(istHvsHighway)).toBe(true)
    expect(['motorway', 'unclassified', 'residential', 'living_street', 'service', 'tertiary_linkx'].some(istHvsHighway)).toBe(false)
  })
  it('Anhaltesichtweite: bei |i| ≤ 2 % nicht angewendet, darüber Untergrenze (aufgerundet)', () => {
    // 50 km/h, ES (Kurve um −1 m auf Tab. 1 verschoben): −2 % -> Tab. 1 (50 m); −3 % -> (52 + 51) / 2 − 1 = 50,5 -> 51 m;
    // +3 % -> 49,5 − 1 = 48,5 -> 49 < 50 -> 50 m
    expect(sichtweiteA(50, 'es', KEINE_UNGUNST, -2)).toMatchObject({ anhalteAngewendet: false, massgebend: 50 })
    expect(sichtweiteA(50, 'es', KEINE_UNGUNST, -2).anhalte?.meter).toBe(50)          // angezeigt, nicht angewendet
    const s3 = sichtweiteA(50, 'es', KEINE_UNGUNST, -3)
    expect(s3).toMatchObject({ anhalteAngewendet: true, massgebend: 51, massgebendText: 'Anhaltesichtweite bei −3 %' })
    expect(sichtweiteA(50, 'es', KEINE_UNGUNST, 3)).toMatchObject({ anhalteAngewendet: true, massgebend: 50, massgebendText: 'unterer Wert, Erschliessungsstrasse' })
    // HVS 50 km/h bei −6 %: Anhaltesichtweite 52 m (53 − 1) < Zwischenwert 60 m
    expect(sichtweiteA(50, 'hvs', KEINE_UNGUNST, -6)).toMatchObject({ massgebend: 60 })
    expect(sichtweiteA(50, 'hvs', KEINE_UNGUNST, -6).anhalte?.meter).toBe(52)
    // 30 km/h: Kurve liegt im Diagramm über Tab. 1 (24 statt 20 m bei i = 0), ist aber auf Tab. 1 verschoben: bei +6 % bleibt
    // Tab. 1 massgebend (Diagramm 23 m -> verschoben 19 m < 20 m), bei −6 % wird es 21 m (25 − 24 + 20)
    const s30 = sichtweiteA(30, 'es', KEINE_UNGUNST, 6)
    expect(s30.massgebend).toBe(20)
    expect(s30.anhalte?.meter).toBe(19)
    expect(sichtweiteA(30, 'es', KEINE_UNGUNST, -6)).toMatchObject({ massgebend: 21, massgebendText: 'Anhaltesichtweite bei −6 %' })
    expect(s30.hinweise.join(' ')).toContain('4 m über dem unteren Wert der VSS 40 273 Tab. 1 (20 m)')
  })
  it('Anhaltesichtweite über dem oberen Wert (80 km/h, −12 %): massgebend 142 m, Zielpunkte 1,5 × 142 m', () => {
    // Diagramm 143 m, um −1 m auf Tab. 1 verschoben (111 statt 110 m bei 0 %)
    const sw = sichtweiteA(80, 'hvs', U({ neigung: true }), -12)
    expect([sw.typWert, sw.anhalte?.meter, sw.massgebend]).toEqual([140, 142, 142])
    expect(zielLaenge(sw)).toBe(213)                     // 1,5 × 142 = 213
    expect(sichtStatus(141, sw)).toBe('nicht_erfuellt')
    expect(sichtStatus(142, sw)).toBe('erfuellt')
    expect(sw.hinweise.join(' ')).toContain('verlängert')
  })
  it('Neigung unbekannt (Entscheid 31.10.2026): Anhaltesichtweite angewendet mit dem Wert bei −12 %', () => {
    // 50 km/h, ES: Abb. 2 bei −12 % 58 m, verschoben um −1 m: 57 m > 50 m; i bleibt 0, die Vorgabe «grosse Längsneigung» nicht
    const sw = sichtweiteA(50, 'es', KEINE_UNGUNST, 0, true)
    expect(sw).toMatchObject({ neigung: 0, neigungUnbekannt: true, anhalteAngewendet: true, massgebend: 57,
      massgebendText: 'Anhaltesichtweite, Neigung unbekannt (strengster Wert bei −12 %)' })
    expect(sw.anhalte?.i).toBe(-12)
    // dasselbe wie bei i = −12 % von Hand; ohne «unbekannt» bei 0 % nicht angewendet
    expect(sw.massgebend).toBe(sichtweiteA(50, 'es', KEINE_UNGUNST, -12).massgebend)
    expect(sichtweiteA(50, 'es', KEINE_UNGUNST, 0)).toMatchObject({ anhalteAngewendet: false, massgebend: 50, neigungUnbekannt: false })
    // HVS 60 km/h: Zwischenwert 80 m, Abb. 2 bei −12 % 81 − (68 − 70) = 83 m; 30 km/h: 26 − 4 = 22 m > 20 m
    expect(sichtweiteA(60, 'hvs', KEINE_UNGUNST, 0, true).massgebend).toBe(83)
    expect(sichtweiteA(30, 'es', KEINE_UNGUNST, 0, true).massgebend).toBe(22)
    // unter 30 km/h keine Kurve: Tab. 1 mit Hinweis
    const s20 = sichtweiteA(20, 'es', KEINE_UNGUNST, 0, true)
    expect([s20.anhalte, s20.massgebend]).toEqual([null, 10])
    expect(s20.hinweise[0]).toContain('ohne Kurve')
  })
  it('unter 30 km/h: keine Kurve in Abb. 2, Anhaltesichtweite nicht angewendet (Hinweis)', () => {
    const sw = sichtweiteA(20, 'es', KEINE_UNGUNST, -8)
    expect(sw).toMatchObject({ anhalte: null, anhalteAngewendet: false, massgebend: 10 })
    expect(sw.hinweise[0]).toContain('ohne Kurve')
  })
  it('Status gegen den massgebenden Wert: HVS 50 km/h (60 m)', () => {
    const sw = sichtweiteA(50, 'hvs')
    expect(sichtStatus(59.9, sw)).toBe('nicht_erfuellt')
    expect(sichtStatus(60, sw)).toBe('massgebend')
    expect(sichtStatus(69.9, sw)).toBe('massgebend')
    expect(sichtStatus(70, sw)).toBe('erfuellt')
    // HVS mit ungünstigen Verhältnissen: massgebend = oberer Wert, also nur erfüllt oder nicht erfüllt
    const ob = sichtweiteA(50, 'hvs', U({ fahrstreifen: true }))
    expect([sichtStatus(69.9, ob), sichtStatus(70, ob)]).toEqual(['nicht_erfuellt', 'erfuellt'])
  })
})

describe('Eingabe der Längsneigung', () => {
  it('Dezimalkomma, Minus als «−» und «–», «%», leer = 0; unlesbar und über ±30 % = null', () => {
    expect(['-6', '−6', '–6', '-6 %', '+6', '6,5', '-0,5', '.5', '', ' ', '-'].map(neigungLesen)).toEqual([-6, -6, -6, -6, 6, 6.5, -0.5, 0.5, 0, 0, 0])
    expect(['1e1', '0x1A', '0b11', 'abc', '6,5,1', '31', '-30.1', '--6'].map(neigungLesen)).toEqual([null, null, null, null, null, null, null, null])
    expect(neigungLesen('-30')).toBe(-30)
  })
})
