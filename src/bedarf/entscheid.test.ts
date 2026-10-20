// Tests Bedarfsmodul E0: Abläufe über den ganzen Entscheidbaum mit typischen Berner Fällen (Ebene Bern an), Ebenenschaltung und
// Zustand «offen» (Entscheid E0-2).
import { describe, expect, it } from 'vitest'
import { beurteile } from './entscheid'
import { eingabenAus, leereEingaben } from './eingaben'
import { fall, INSEL_OK, Q3_OK } from './testfaelle'

const BERN = { ebenen: { bern: true, kantonBE: true } }
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('Ablauf: typische Berner Fälle', () => {
  it('Tempo 50, DTV 12 000, 2 Streifen, 7 m: Norm Q1 (Insel anstreben), Bern Schutzinsel vorgesehen und LSA prüfen', () => {
    const b = beurteile(fall({ dtv: 12000 }), BERN)
    expect(b.empfehlung.typ).toBe('Q1')
    expect(ids(b.alle.filter(x => x.ebene === 'Norm'))).toEqual(['D2c'])
    expect(ids(b.lokal.empfehlungen)).toEqual(['D6-2'])
    expect(ids(b.lokal.hinweise)).toEqual(['D6-3b'])
    expect(b.norm.verletzungen).toEqual([])
  })
  it('dasselbe mit 9,00 m Fahrbahn: Insel Pflicht (Bericht), Empfehlung FGS mit Schutzinsel', () => {
    const b = beurteile(fall({ dtv: 12000, fahrbahnB: 9 }), BERN)
    expect(ids(b.norm.bericht)).toEqual(['D2'])
    expect(b.empfehlung).toMatchObject({ typ: 'Q1', elemente: ['Fussgängerstreifen', 'Schutzinsel'], grundlage: ['D2'] })
  })
  it('dasselbe mit baulicher Insel nach Standard E1: keine Inselbefunde, Durchfahrt nach Kanton geprüft', () => {
    const b = beurteile(fall({ dtv: 12000, fahrbahnB: 9, insel: INSEL_OK, durchfahrt: [3.5, 3.5], signal411Insel: true }), BERN)
    expect(b.alle.filter(x => ['D1', 'D2', 'D2c', 'D6-2', 'F2', 'F2b'].includes(x.id))).toEqual([])
    expect(b.alle.find(x => x.id === 'F3')).toMatchObject({ staerke: 'hinweis', ebene: 'Kanton BE' })
    expect(b.alle.find(x => x.id === 'F3')?.normHinweis).toContain('keine VSS-Norm')
    expect(b.empfehlung.elemente).toContain('Schutzinsel')
  })
  it('Tempo 50, DTV 12 000, zwei Fahrstreifen je Richtung, keine Insel möglich: LSA (Q2)', () => {
    const b = beurteile(fall({ dtv: 12000, nRichtung: [2, 2], fahrbahnB: 13, inselMoeglich: false }), BERN)
    expect(b.empfehlung.typ).toBe('Q2')
    expect(b.empfehlung.elemente).toEqual(['Fussgängerstreifen', 'Lichtsignalanlage'])   // keine Insel, wo keine möglich ist (S1)
    expect(ids(b.norm.bericht)).toEqual(expect.arrayContaining(['D1', 'D2']))
    expect(ids(b.norm.hinweise)).toEqual(expect.arrayContaining(['D1b', 'D5-3']))
    expect(ids(b.lokal.empfehlungen)).toEqual(expect.arrayContaining(['D6-2', 'D6-4']))
  })
  it('bestehende LSA an diesem Ort: keine Inselpflicht D1, I-Regeln ausgewertet', () => {
    const b = beurteile(fall({ dtv: 12000, nRichtung: [2, 2], fahrbahnB: 13, typ: 'lsa' }), BERN)
    expect(b.alle.find(x => x.id === 'D1')).toBeUndefined()
    expect(b.empfehlung.typ).toBe('Q2')
    expect(b.ausgewertet).toEqual(expect.arrayContaining(['I1', 'I2', 'I4', 'I7-B4']))
    expect(b.ausgewertet).not.toContain('H1')
  })
  it('Tempo-30-Zone ohne Schule: FGS unzulässig, Pfad E (Querung ohne Vortritt), keine D-Regeln', () => {
    const b = beurteile(fall({ tempoRegime: 't30_zone', vSig: 30, v85: 31, dtv: 2500, strassentyp: 'siedlungsorientiert', laengsparkierung: true, seitenraumVorParklinieM: 0.3 }), BERN)
    expect(b.zulaessigkeit).toBe('nicht_angezeigt')
    expect(ids(b.norm.verletzungen)).toContain('C2')
    expect(b.empfehlung).toMatchObject({ typ: 'ohne_vortritt', elemente: ['vorgezogener Seitenraum', 'ohne bauliche Massnahme möglich'] })
    expect(b.ausgewertet.some(id => id.startsWith('D1') || id.startsWith('D6'))).toBe(false)
    expect(b.ausgewertet).toContain('E3')
    expect(ids(b.lokal.hinweise)).toContain('C2-B')
  })
  it('Tempo-30-Zone mit Schule: FGS möglich mit Begründung (C2b), Pfad D', () => {
    const b = beurteile(fall({ tempoRegime: 't30_zone', vSig: 30, v85: 31, dtv: 4000, beduerfnis: ['schule'] }), BERN)
    expect(b.zulaessigkeit).toBe('mit_begruendung')
    expect(ids(b.norm.hinweise)).toContain('C2b')
    expect(b.empfehlung.typ).toBe('Q1')
    expect(b.alle.find(x => x.id === 'D6-2')).toBeUndefined()       // Tempo 30 / DTV bis 5000: Tabelle Nein
  })
  it('Einmündung mit FGS: Q3 stumm als Option ausgewertet, Hinweis B3, eine Zeile im Zusatz', () => {
    const b = beurteile(fall({ lage: 'einmuendung' }), BERN)
    expect(ids(b.norm.hinweise)).toContain('B3')
    expect(b.empfehlung.typ).toBe('Q1')
    expect(b.empfehlung.zusatz).toEqual(['Trottoirüberfahrt (Q3) normkonform möglich (Bern-Tabelle: Ja)'])
    expect(b.ausgewertet).toEqual(expect.arrayContaining(['Q3-1', 'Q3-12', 'Q3-M10', 'Q3-B']))
    expect(b.alle.some(x => x.id.startsWith('Q3'))).toBe(false)
  })
  it('Einmündung mit FGS, einmündend 2 Streifen, Hauptfahrbahn 60: keine Q3-Befunde, Zusatz nennt die Gründe', () => {
    const b = beurteile(fall({ lage: 'einmuendung', q3: { ...Q3_OK, nEinm: 2, vSigHaupt: 60 } }), BERN)
    expect(b.alle.some(x => x.id.startsWith('Q3'))).toBe(false)
    expect(b.empfehlung.zusatz).toEqual(['Trottoirüberfahrt hier nicht zulässig wegen Q3-6, Q3-7'])
  })
  it('Einmündung ohne q3: ein Hinweis statt 21 offener Regeln', () => {
    const b = beurteile(fall({ lage: 'einmuendung', q3: null }), BERN)
    expect(b.nichtGeprueft).toEqual([{ block: 'Q3', grund: 'Eingaben zur Trottoirüberfahrt (q3) fehlen' }])
    expect(b.norm.offen.length + b.lokal.offen.length).toBe(0)
    expect(b.empfehlung.zusatz).toEqual(['Trottoirüberfahrt nicht geprüft: Eingaben fehlen'])
  })
  it('beurteilte Trottoirüberfahrt, normkonform: Empfehlung Q3; mit Kreisel nicht zulässig (Q3-M8 hart)', () => {
    const ok = beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt' }), BERN)
    expect(ok.empfehlung).toMatchObject({ typ: 'Q3', elemente: ['Trottoirüberfahrt'] })
    expect(ok.alle.find(x => x.id === 'Q3-B')).toMatchObject({ ist: 'Ja' })
    const kr = beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt', q3: { ...Q3_OK, kreisel: true } }))
    expect(ids(kr.norm.verletzungen)).toEqual(['Q3-M8'])
    expect(kr.empfehlung.typ).not.toBe('Q3')
  })
  it('Trottoirüberfahrt am Eingangstor einer T30-Zone: Q3 normkonform, C2 nur stumm (40 242 Z. 15 regelt die Zone)', () => {
    const b = beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt', tempoRegime: 't30_zone', vSig: 30, v85: 30,
      q3: { ...Q3_OK, zoneEinm: 't30', eingangstor: true } }), BERN)
    expect(b.empfehlung.typ).toBe('Q3')
    expect(b.alle.some(x => x.id.startsWith('C'))).toBe(false)
    expect(b.ausgewertet).toContain('C2')
  })
  it('Trottoirüberfahrt bei vSig 60 (einmündend): keine C1- und E3-Befunde', () => {
    const b = beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt', vSig: 60, v85: 60 }), BERN)
    expect(b.alle.filter(x => ['C1', 'E3', 'E1'].includes(x.id))).toEqual([])
    expect(b.empfehlung.typ).toBe('Q3')
  })
  it('Trottoirüberfahrt bei DTV 2000 und 60 Querenden: kein «mit Begründung»-Zusatz aus C3/C4', () => {
    const b = beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt', dtv: 2000, fg5h: 60, netz: 'keins' }), BERN)
    expect(b.alle.filter(x => ['C3', 'C4', 'C4-B'].includes(x.id))).toEqual([])
    expect(b.empfehlung.zusatz.some(z => z.includes('C3'))).toBe(false)
    expect(b.empfehlung).toMatchObject({ typ: 'Q3', vorlaeufig: false })
  })
  it('Furt empfohlen, inselMoeglich offen: Empfehlung vorläufig', () => {
    const b = beurteile(fall({ vSig: 60, v85: 65, inselMoeglich: null }))
    expect(b.empfehlung).toMatchObject({ typ: 'furt', vorlaeufig: true })
    expect(b.empfehlung.offenWegen).toContain('inselMoeglich')
  })
  it('Schutzinsel empfohlen (D2), inselMoeglich offen: vorläufig', () => {
    const b = beurteile(fall({ fahrbahnB: 9, inselMoeglich: null }))
    expect(b.empfehlung.elemente).toContain('Schutzinsel')
    expect(b.empfehlung).toMatchObject({ vorlaeufig: true, offenWegen: ['inselMoeglich'] })
  })
  it('FGS mit LSA ohne Zeiten: Block I nicht ausgewertet, ein Hinweis', () => {
    const b = beurteile(fall({ fgsMitLsa: true, lsaZeiten: null }), BERN)
    expect(b.nichtGeprueft).toEqual([{ block: 'I', grund: 'LSA-Zeiten fehlen' }])
    expect(b.ausgewertet.some(id => id.startsWith('I'))).toBe(false)
    expect(b.norm.offen.length + b.lokal.offen.length).toBe(0)
  })
  it('ausserorts: nicht beurteilt, nur A1', () => {
    const b = beurteile(fall({ innerorts: false }), BERN)
    expect(b).toMatchObject({ beurteilt: false, ende: 'ausserorts', zulaessigkeit: null })
    expect(ids(b.alle)).toEqual(['A1'])
    expect(b.ausgewertet).toEqual(['A1'])
  })
  it('Begegnungszone: A2 hart, flächige Querung, Ende', () => {
    const b = beurteile(fall({ tempoRegime: 'begegnungszone', vSig: 20 }), BERN)
    expect(b).toMatchObject({ beurteilt: true, ende: 'begegnungszone', zulaessigkeit: null })
    expect(ids(b.norm.verletzungen)).toEqual(['A2'])
    expect(b.empfehlung.typ).toBe('flaechig')
    expect(b.ausgewertet).toEqual(['A1', 'A2'])
  })
  it('bestehende Furt, wo ein FGS zulässig wäre: D-Befunde nur für die Empfehlung, Prüfung der Furt nach E', () => {
    const b = beurteile(fall({ typ: 'furt', nRichtung: [2, 1], sichtVorh: [120, 120] }))
    expect(b.alle.find(x => x.id === 'D1')).toBeUndefined()
    expect(b.empfehlung.grundlage).toContain('D1')
    expect(b.ausgewertet).toEqual(expect.arrayContaining(['E1', 'E3']))
    expect(b.ausgewertet).not.toContain('G4')
  })
})

describe('Ebenen und offene Eingaben', () => {
  it('Bern aus: keine Bern-Regel ausgewertet; Kanton aus: keine Kantonsregel', () => {
    const b = beurteile(fall({ dtv: 12000, insel: INSEL_OK, durchfahrt: [3.4, 3.4], radstreifen: true }))
    expect(b.ausgewertet.some(id => id.endsWith('-B') || id.startsWith('D6') || id.endsWith('-K') || id === 'F3' || id === 'F4a')).toBe(false)
    expect(b.lokal.empfehlungen.length + b.lokal.hinweise.length).toBe(0)
  })
  it('Richtlinie aus: kein F2c, H4, D4-R', () => {
    const b = beurteile(fall({ insel: { ...INSEL_OK, breite: 1.7 }, kurve: { radius: 10, fuenfBedingungen: false } }), { ebenen: { richtlinie: false } })
    expect(b.ausgewertet.filter(id => ['F2c', 'H4', 'D4-R'].includes(id))).toEqual([])
  })
  it('leere Eingaben: Ende «offen», A1 offen, nichts gilt als bestanden', () => {
    const b = beurteile(leereEingaben())
    expect(b).toMatchObject({ beurteilt: false, ende: 'offen' })
    expect(b.alle).toEqual([expect.objectContaining({ id: 'A1', zustand: 'offen', fehlend: ['innerorts'] })])
  })
  it('fehlende Tempo-Eingaben: C1 offen → Zulässigkeit offen, Empfehlung vorläufig', () => {
    const b = beurteile(fall({ vSig: null, v85: null }))
    expect(b.zulaessigkeit).toBe('offen')
    expect(b.empfehlung.vorlaeufig).toBe(true)
    expect(b.empfehlung.offenWegen).toContain('C1')
    expect(b.norm.offen.map(x => x.id)).toEqual(expect.arrayContaining(['A3', 'C1', 'H1']))
  })
  it('harte D-Regel offen (B 9 m, DTV fehlt): Empfehlung vorläufig wegen D2', () => {
    const b = beurteile(fall({ fahrbahnB: 9, dtv: null }))
    expect(b.zulaessigkeit).toBe('zulaessig')
    expect(b.empfehlung).toMatchObject({ vorlaeufig: true, offenWegen: ['D2'] })
  })
  it('C3 verletzt: zulässig nur mit Begründung, Querung ohne Vortritt als Zusatz', () => {
    const b = beurteile(fall({ fg5h: 60, netz: 'keins' }))
    expect(b.zulaessigkeit).toBe('mit_begruendung')
    expect(b.empfehlung.zusatz).toContain('Querung ohne Vortritt prüfen (C3, C4)')
  })
  it('wenige Eingaben: offene Einträge nach fehlendem Feld gruppiert', () => {
    const b = beurteile(eingabenAus({ innerorts: true, vSig: 50, typ: 'fgs' }), BERN)
    expect(b.empfehlung.vorlaeufig).toBe(true)
    expect(b.offenGruppen[0].regeln.length).toBeGreaterThan(3)
    const summe = b.offenGruppen.reduce((n, g) => n + g.regeln.length, 0)
    expect(summe).toBe(b.alle.filter(x => x.zustand === 'offen').reduce((n, x) => n + (x.fehlend?.length ?? 0), 0))
  })
  it('geschätzte Eingaben erscheinen als Annahme', () => {
    const e = fall()
    e.dtv = { wert: 9000, quelle: 'schaetzung' }
    e.nRichtung = { wert: [1, 1], quelle: 'annahme' }
    expect(beurteile(e).annahmen).toEqual(expect.arrayContaining(['dtv: Schätzung', 'nRichtung: Annahme']))
  })
  it('Masse Soll/Ist: Streifen, Sicht, Erkennung als Zeilen; verletzt bei F1a', () => {
    const b = beurteile(fall({ streifenBreite: 2.9 }))
    expect(b.masse.find(m => m.groesse === 'Streifenbreite')).toMatchObject({ ist: '2,90', zustand: 'verletzt', regeln: ['F1a', 'F1b'] })
    expect(b.masse.map(m => m.groesse)).toEqual(expect.arrayContaining(['Erkennungsdistanz', 'Abstand zum nächsten FGS', 'DTV']))
  })
})
