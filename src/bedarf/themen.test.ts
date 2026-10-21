// Tests Runde 2 (mit Korrekturen): Themen je Regel, Verbindlichkeit in Worten, Befundblatt nach Thema und Prüfübersicht.
import { describe, expect, it } from 'vitest'
import { KATALOG, REGEL_IDS } from './katalog'
import { beurteile } from './entscheid'
import { grundpruefung } from './grundpruefung'
import { fall, TESTFAELLE, type Abw } from './testfaelle'
import {
  ERWEITERT_IDS, EBENE_WORT, LEGENDE, PAARE, STAERKE_WORT, THEMEN, mitEinheit, nachThema, pruefUebersicht, rang, themaName, themaVon,
  verbindlichkeit, verbindlichkeitVon, zaehlText,
} from './themen'
import { EBENEN, STAERKEN, type RegelDef } from './typen'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>
const TYPEN = [undefined, 'fgs', 'lsa', 'furt', 'ohne_vortritt', 'trottoirueberfahrt', 'mehrzweck', null] as const
/** alle Testfälle mal Typvarianten mal zwei Ebenenstände */
function* laeufe() {
  for (const t of TESTFAELLE) for (const typ of TYPEN) for (const eb of [t.ebenen ?? {}, { bern: true, kantonBE: true }]) {
    const abw: Abw = typ === undefined ? t.abw : { ...t.abw, typ }
    const e = fall(abw)
    const ebenen = { bern: false, kantonBE: false, richtlinie: true, ...eb }
    yield { name: `${t.regel} ${t.name} ${String(typ)} ${JSON.stringify(eb)}`, abw, b: beurteile(e, { ebenen: eb }), k: { ebenen, typ: e.typ.wert } }
  }
}
const ue = (abw: Abw, eb: { bern?: boolean; kantonBE?: boolean } = {}) => {
  const e = fall(abw)
  return pruefUebersicht(beurteile(e, { ebenen: eb }), { ebenen: { bern: false, kantonBE: false, richtlinie: true, ...eb }, typ: e.typ.wert })
}

describe('Themen', () => {
  it('höchstens 11 Themen, eindeutig; jede der 165 Regeln hat genau ein bekanntes Thema; kein Thema leer (auch nicht in der erweiterten Prüfung)', () => {
    expect(THEMEN.length).toBeLessThanOrEqual(11)
    expect(new Set(THEMEN.map(t => t.id)).size).toBe(THEMEN.length)
    expect(new Set(THEMEN.map(t => t.name)).size).toBe(THEMEN.length)
    const ids = new Set(THEMEN.map(t => t.id))
    for (const id of REGEL_IDS) expect(ids.has(DEF[id].thema), id).toBe(true)
    expect(REGEL_IDS.length).toBe(165)
    for (const t of THEMEN) {
      expect(REGEL_IDS.filter(id => DEF[id].thema === t.id).length, t.name).toBeGreaterThan(0)
      expect(ERWEITERT_IDS.filter(id => DEF[id].thema === t.id).length, t.name).toBeGreaterThan(0)
      expect(t.name.toLowerCase()).not.toContain('zebra'); expect(t.umfang.toLowerCase()).not.toContain('zebra')
    }
  })
  it('Grundprüfung: bfu-Namen führen (Nutzerentscheid), das Thema der erweiterten Prüfung gehört dazu; ihre Regeln im selben Thema', () => {
    const g = grundpruefung(fall({}))
    expect(g.gilt).toBe(true)
    expect(g.punkte.map(p => p.titel)).toEqual(['Tempo', 'Sichtverhältnisse', 'Fussgängerschutzinsel', 'Zweistreifigkeit', 'Beleuchtung', 'Fussgängerfrequenz'])
    expect(g.punkte.map(p => themaName(p.thema))).toEqual(['Zulässigkeit', 'Sicht', 'Insel', 'Fahrstreifen und Verkehr', 'Beleuchtung', 'Nachfrage'])
    for (const p of g.punkte) for (const t of [...p.teile, ...p.notizen]) expect(themaVon(t.id), t.id).toBe(p.thema)
    // Korrektur Themen: C2-B Zulässigkeit, C4-B neben C4, E1b Lichtsignal, G9 Sicht
    expect(['C2-B', 'C4-B', 'C4', 'E1b', 'G9'].map(themaVon)).toEqual(['zulaessigkeit', 'fahrstreifen', 'fahrstreifen', 'lichtsignal', 'sicht'])
    expect(['H1', 'H3a', 'E3', 'G7'].map(themaVon)).toEqual(['sicht', 'sicht', 'sicht', 'sicht'])
    expect(['D2', 'F2', 'F3'].map(themaVon)).toEqual(['insel', 'insel', 'insel'])
  })
  it('D3c ist Verweis auf D5-5 (gleiche Bedingung, ein Hinweis)', () => {
    expect(DEF.D3c.art).toBe('verweis')
    const b = beurteile(fall({ tram: 'fahrbahn' }))
    expect(b.alle.filter(x => x.id === 'D5-5').length).toBe(1)
    expect(b.alle.some(x => x.id === 'D3c')).toBe(false)
  })
})

describe('Verbindlichkeit in Worten (Muss/Soll/Hinweis)', () => {
  it('Tabelle Ebene × Stärke: alle 20 Kombinationen, eindeutig, ohne Farbwort; Legende', () => {
    const E: Record<string, string> = { Recht: 'Recht', Norm: 'Norm', Bern: 'Standard Stadt Bern', 'Kanton BE': 'Arbeitshilfe Kanton Bern', Richtlinie: 'Richtlinie' }
    const ist: Record<string, string> = {}, erwartet: Record<string, string> = {}
    for (const e of EBENEN) {
      erwartet[`${e}/hart`] = `Muss (${E[e]})`
      erwartet[`${e}/hart_bericht`] = `Muss (${E[e]}), Abweichung nur mit verkehrstechnischem Bericht`
      erwartet[`${e}/weich`] = `Soll (${E[e]}), Abweichung begründen`
      erwartet[`${e}/hinweis`] = `Hinweis (${E[e]})`
      for (const s of STAERKEN) ist[`${e}/${s}`] = verbindlichkeit(e, s)
    }
    expect(ist).toEqual(erwartet)
    expect(verbindlichkeit('Norm', 'hart')).toBe('Muss (Norm)')
    expect(new Set(Object.values(ist)).size).toBe(EBENEN.length * STAERKEN.length)
    for (const w of [...Object.values(ist), ...Object.values(STAERKE_WORT), ...Object.values(EBENE_WORT)])
      expect(w).not.toMatch(/\b(rot|gelb|grün|blau|grau)\b/i)
    expect(LEGENDE).toContain('verbindlich im Rechtssinn ist nur die Ebene Recht')
  })
  it('Projektentscheide (A1, C3c): «Hinweis (Projektentscheid fgsCheck)»', () => {
    expect(verbindlichkeitVon({ id: 'A1', ebene: 'Recht', staerke: 'hinweis' })).toBe('Hinweis (Projektentscheid fgsCheck)')
    expect(verbindlichkeitVon({ id: 'C3c', ebene: 'Norm', staerke: 'hinweis' })).toBe('Hinweis (Projektentscheid fgsCheck)')
    expect(verbindlichkeitVon({ id: 'C1', ebene: 'Norm', staerke: 'hart' })).toBe('Muss (Norm)')
  })
  it('Einheiten: nach der Zahl bzw. vor dem Klammerzusatz, nie an Wörter («keine m»), nie doppelt', () => {
    expect(mitEinheit('≥ 3,00', 'm')).toBe('≥ 3,00 m')
    expect(mitEinheit('4,00 (Regel)', 'm')).toBe('4,00 m (Regel)')
    expect(mitEinheit('keine', 'm')).toBe('keine')
    expect(mitEinheit('frei (2 Zufahrten)', 'm')).toBe('frei (2 Zufahrten)')
    expect(mitEinheit('V85 51 km/h', 'km/h')).toBe('V85 51 km/h')
  })
})

describe('Befundblatt nach Thema und Prüfübersicht (alle Testfälle mal Varianten)', () => {
  it('nach Thema: alle Einträge genau einmal, Themen in der Reihenfolge THEMEN, im Thema Muss, mit Bericht, Soll, Hinweis, offen', () => {
    let n = 0
    for (const { name, b } of laeufe()) {
      const g = nachThema(b.alle)
      expect(g.flatMap(x => x.eintraege).length, name).toBe(b.alle.length)
      const pos = g.map(x => THEMEN.indexOf(x.thema))
      expect(pos, name).toEqual([...pos].sort((a, c) => a - c))
      for (const x of g) {
        const r = x.eintraege.map(rang)
        expect(r, name).toEqual([...r].sort((a, c) => a - c))
      }
      n++
    }
    expect(n).toBeGreaterThan(3000)
  })
  it('Zählung: ohne Befund + offen + Befunde + Hinweise = geprüft; geprüft + nicht geprüft + nicht anwendbar = Regeln (gesamt und je Thema)', () => {
    for (const { name, b, k } of laeufe()) {
      const u = pruefUebersicht(b, k)
      for (const z of [u, ...u.themen]) {
        expect(z.ohneBefund + z.offen + z.befunde + z.hinweise, name).toBe(z.geprueft)
        const n = z === u ? ERWEITERT_IDS.length : ERWEITERT_IDS.filter(id => themaVon(id) === (z as typeof u.themen[number]).thema.id).length
        expect(z.geprueft + z.nichtGeprueft + z.nichtAnwendbar, name).toBe(n)
      }
      for (const key of ['geprueft', 'ohneBefund', 'offen', 'befunde', 'hinweise', 'nichtGeprueft', 'nichtAnwendbar'] as const)
        expect(u.themen.reduce((s, z) => s + z[key], 0), `${name} ${key}`).toBe(u[key])
      const erw = b.alle.filter(x => ERWEITERT_IDS.includes(x.id))
      expect(u.befunde, name).toBe(new Set(erw.filter(x => x.zustand === 'verletzt' && x.staerke !== 'hinweis').map(x => x.id)).size)
      expect(u.geprueft - u.ohneBefund, name).toBe(new Set(erw.map(x => x.id)).size)
      const ohne = u.themen.flatMap(z => z.ohneBefundIds)
      expect(ohne.length, name).toBe(u.ohneBefund)
      expect(ohne.filter(id => b.alle.some(x => x.id === id)), name).toEqual([])
      // Weichen und Grundprüfung zählen nie
      expect([...u.stand.keys()].filter(id => DEF[id].art !== 'befund' || DEF[id].gruppe === 'B5'), name).toEqual([])
      // Paare: zweite Stufe nie «ohne Befund», wenn die erste verletzt oder offen ist
      for (const [a, z] of PAARE) if (u.stand.get(z) === 'ohne_befund') expect([undefined, 'ohne_befund'], `${name} ${a}→${z}`).toContain(u.stand.get(a))
      // erfüllt nur, was ausgewertet wurde
      expect(b.erfuellt.filter(id => !b.ausgewertet.includes(id)), name).toEqual([])
    }
  })
  it('Paare (Korrektur A1): F1a verletzt → F1b nicht «ohne Befund», sondern nicht geprüft (Vorstufe); D6-2 Soll → D6-2b ebenso', () => {
    const u = ue({ streifenBreite: 2.9 })
    expect(u.stand.get('F1a')).toBe('befund')
    expect(u.stand.has('F1b')).toBe(false)
    expect(u.nichtGeprueftWegen.get('F1b')).toBe('Vorstufe nicht erfüllt bzw. offen')
    const ub = ue({}, { bern: true, kantonBE: true })
    expect(ub.stand.get('D6-2')).toBe('befund')
    expect(ub.stand.has('D6-2b')).toBe(false)
    for (const [a, z] of PAARE) { expect(ERWEITERT_IDS, a).toContain(a); expect(ERWEITERT_IDS, z).toContain(z) }
  })
  it('D5-4 (Korrektur A2): nicht anwendbar ohne H1 bzw. E3; offen, wenn H1 offen ist', () => {
    // Typ fehlt: H1 nicht ausgewertet, E3 nicht im Pfad → D5-4 ohne Ergebnis
    const b0 = beurteile(fall({ typ: null }))
    expect(b0.alle.some(x => x.id === 'D5-4')).toBe(false)
    expect(b0.erfuellt).not.toContain('D5-4')
    // H1 offen (Sichtweite fehlt) → D5-4 offen mit den fehlenden Feldern von H1
    const b1 = beurteile(fall({ sichtVorh: null }))
    expect(b1.alle.find(x => x.id === 'D5-4')).toMatchObject({ zustand: 'offen', fehlend: ['sichtVorh'] })
    // H1 erfüllt → D5-4 ohne Befund
    expect(ue({}).stand.get('D5-4')).toBe('ohne_befund')
  })
  it('C3c (Korrektur A4): ohne Zählung und Schätzklasse offen', () => {
    const b = beurteile(fall({ fg5h: null, fgKlasse: null }))
    expect(b.alle.find(x => x.id === 'C3c')).toMatchObject({ zustand: 'offen' })
    expect(beurteile(fall({ fg5h: null, fgKlasse: '<100' })).alle.find(x => x.id === 'C3c')).toMatchObject({ zustand: 'verletzt', staerke: 'hinweis' })
    expect(beurteile(fall({})).erfuellt).toContain('C3c')
  })
  it('Weichen und Gründe (Korrektur A5): A1, B3, D1b, E1, E2, H2 zählen nicht; Baum endet mangels Angabe → «nicht geprüft (Ortslage fehlt)»', () => {
    for (const id of ['A1', 'B3', 'D1b', 'E1', 'E2', 'H2']) expect(ERWEITERT_IDS).not.toContain(id)
    const o = ue({ innerorts: null })
    expect(o.geprueft).toBe(0)
    expect(o.gruende[0]).toEqual({ grund: 'Ortslage fehlt', n: 112 })
    expect(zaehlText(o.themen.find(z => z.thema.id === 'sicht')!)).toBe('nicht geprüft (Ortslage fehlt)')
    expect(zaehlText(ue({ tempoRegime: 'begegnungszone', vSig: 20 }).themen.find(z => z.thema.id === 'sicht')!)).toBe('nicht geprüft (Baum endet: Begegnungszone)')
    expect(zaehlText(ue({ innerorts: false }).themen.find(z => z.thema.id === 'insel')!)).toBe('nicht geprüft (Baum endet: ausserorts)')
    expect(zaehlText(ue({ typ: null }).themen.find(z => z.thema.id === 'beleuchtung')!)).toBe('nicht geprüft (Querungstyp fehlt)')
    // wirklich nicht anwendbar: Fussgängerstreifen auf der Strecke → Querung ohne Vortritt und Trottoirüberfahrt gelten nicht
    const s0 = ue({}, { bern: true, kantonBE: true })
    expect(zaehlText(s0.themen.find(z => z.thema.id === 'ohneVortritt')!)).toBe('nicht anwendbar')
    expect(zaehlText(s0.themen.find(z => z.thema.id === 'trottoirueberfahrt')!)).toBe('nicht anwendbar')
    // still für die Empfehlung ausgewertet zählt nicht (Einmündung mit Fussgängerstreifen: Q3 nur als Option)
    expect([...ue({ lage: 'einmuendung' }).stand.keys()].filter(id => id.startsWith('Q3'))).toEqual([])
    expect(ue({ lage: 'einmuendung', typ: 'trottoirueberfahrt' }).stand.get('Q3-1')).toBe('ohne_befund')
  })
  it('Beispiel Grundfall S0 (Fussgängerstreifen, Tempo 50, DTV 8000, ohne Insel)', () => {
    const u = ue({})
    expect([u.geprueft, u.ohneBefund, u.offen, u.befunde, u.hinweise, u.nichtGeprueft, u.nichtAnwendbar]).toEqual([43, 42, 0, 0, 1, 7, 86])
    expect(zaehlText(u.themen.find(z => z.thema.id === 'insel')!)).toBe('3 geprüft, 2 ohne Befund, 1 Hinweis')
    // Korrektur S6: «Ebene ausgeschaltet» nur für Regeln, die mit eingeschalteter Ebene gälten (D6-2 ja, C2-B auf der Strecke nicht)
    const b0 = beurteile(fall({}))
    expect(b0.ebeneAus).toContain('D6-2')
    expect(b0.ebeneAus).not.toContain('C2-B')
    expect(u.nichtGeprueftWegen.get('D6-2')).toBe('Ebene ausgeschaltet')
    expect(u.nichtGeprueftWegen.has('C2-B')).toBe(false)
    expect(b0.annahmen).toEqual(beurteile(fall({}), { ebenen: { bern: false, kantonBE: false } }).annahmen)
    const ub = ue({}, { bern: true, kantonBE: true })
    expect([ub.geprueft, ub.ohneBefund, ub.offen, ub.befunde, ub.hinweise, ub.nichtGeprueft]).toEqual([49, 46, 0, 1, 2, 1])
    const uo = ue({ dtv: null, fg5h: null, fgKlasse: null }, { bern: true, kantonBE: true })
    expect([uo.geprueft, uo.ohneBefund, uo.offen, uo.befunde, uo.hinweise]).toEqual([50, 40, 9, 0, 1])
  })
})
