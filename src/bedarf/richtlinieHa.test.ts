// Tests Richtlinie Hindernisfreie Architektur «Strassen – Wege – Plätze» 2025 (30.10.2026): Lage an gerader Trottoirkante (G11) nach
// Kap. 4.1, Inseltiefe als Soll (F2c) nach Kap. 4.2, Abstand zum Kreisel (G12) nach Kap. 4.4. Ebene Richtlinie, Stärke Soll; nur beim
// Fussgängerstreifen; Vorbelegung aus der AV (Trottoirkante) bzw. OSM (Kreiselring). Die Ausrichtung des Streifens (Kap. 4.1) prüft
// die Normregel F1d mit derselben Schwelle; die Richtlinie ist dort weitere Quelle (Nutzerentscheid 30.10.2026, statt F1d-R).
// Künstliche Strassen wie vorbelegungGeo.test.ts (keine echten Daten): Hauptstrasse West–Ost, Fahrbahn 8 m, Übergang bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { Fahrbahn } from '../rechner/flaechen'
import { leererFall, type Fall } from '../fall'
import { KATALOG } from './katalog'
import { beurteile } from './entscheid'
import { fall, INSEL_OK, type Abw } from './testfaelle'
import { querungen, vorbelegen, kanteAmEnde, KANTE_GERADE_GRAD, KANTE_KURVE_GRAD } from './vorbelegung'
import { automatik } from './automatik'
import type { Vorbelegung } from './fallBedarf'
import { sichtbar, gilt, FELD_HILFEN, FRAGEN } from './feldhilfen'
import { regelGruppen, regelZeilen } from './regeluebersicht'
import { kurzform } from './zusammenfassung'
import { verbindlichkeitVon } from './themen'
import type { RegelDef } from './typen'

const NEU = ['G11', 'F2c', 'G12'] as const
const DEF = KATALOG as Readonly<Record<string, RegelDef>>

describe('Katalog: drei Punkte der Richtlinie, Ausrichtung als Quelle von F1d', () => {
  it('Ebene Richtlinie, Stärke Soll, Quelle mit Kapitel und Seite', () => {
    const fund = Object.fromEntries(NEU.map(id => [id, DEF[id].quellen.map(q => `${q.werk} ${q.ziffer}`)]))
    expect(fund).toEqual({ G11: ['HA Kap. 4.1, S. 10'], F2c: ['HA Kap. 4.2, S. 10'], G12: ['HA Kap. 4.4, S. 11'] })
    for (const id of NEU) expect([DEF[id].ebene, DEF[id].staerke], id).toEqual(['Richtlinie', 'weich'])
    expect(verbindlichkeitVon({ id: 'G12', ebene: 'Richtlinie', staerke: 'weich' })).toBe('Soll (Richtlinie), Abweichung begründen')
  })
  it('Ausrichtung: keine eigene Regel F1d-R; die Richtlinie ist weitere Quelle der Normregel F1d (Ebene Norm, Soll)', () => {
    expect(DEF['F1d-R']).toBeUndefined()
    expect(DEF.F1d.quellen.map(q => `${q.werk} ${q.ziffer}`)).toEqual(['40241 Z. 21', '640075 Anh. 8.1.4', 'HA Kap. 4.1, S. 10'])
    expect([DEF.F1d.ebene, DEF.F1d.staerke]).toEqual(['Norm', 'weich'])
    expect(KATALOG.F1d.werte).toEqual({ recht: KATALOG.F7e.werte.recht, tol: KATALOG.F7e.werte.tol })
  })
  it('Themen: gerade Trottoirkante und Kreisel bei Lage und Abständen, Inseltiefe bei Insel', () => {
    expect(NEU.map(id => DEF[id].thema)).toEqual(['lage', 'insel', 'lage'])
  })
})

describe('Auswertung', () => {
  const ids = (abw: Abw, ebenen?: { richtlinie?: boolean }) => {
    const b = beurteile(fall(abw), { ebenen })
    return Object.fromEntries(NEU.map(id => [id, b.alle.find(x => x.id === id)?.staerke ?? (b.ausgewertet.includes(id) ? 'erfüllt' : '-')]))
  }
  const ALLE: Abw = { achsWinkel: 75, streifenGerade: false, insel: { ...INSEL_OK, breite: 1.7 }, lage: 'kreisel', abstandKreiselM: 3 }
  it('alle drei verletzt: Soll (gelb)', () => {
    expect(ids(ALLE)).toEqual({ G11: 'weich', F2c: 'weich', G12: 'weich' })
  })
  it('Richtlinie aus: keine der drei ausgewertet; «nicht geprüft (Ebene ausgeschaltet)»; die Ausrichtung (F1d, Norm) bleibt', () => {
    expect(ids(ALLE, { richtlinie: false })).toEqual({ G11: '-', F2c: '-', G12: '-' })
    const aus = beurteile(fall(ALLE), { ebenen: { richtlinie: false } })
    expect(aus.ebeneAus).toEqual(expect.arrayContaining([...NEU]))
    expect(aus.ebeneAus).not.toContain('F1d')
    expect(aus.alle.find(x => x.id === 'F1d')?.staerke).toBe('weich')
  })
  it('nur beim Fussgängerstreifen (auch mit Lichtsignal); Inseltiefe bei jeder Querung auf der Fahrbahn', () => {
    expect(ids({ ...ALLE, typ: 'lsa' })).toEqual({ G11: 'weich', F2c: 'weich', G12: 'weich' })
    for (const typ of ['furt', 'ohne_vortritt'] as const) expect(ids({ ...ALLE, typ })).toEqual({ G11: '-', F2c: 'weich', G12: '-' })
    expect(ids({ ...ALLE, typ: 'trottoirueberfahrt', lage: 'einmuendung' })).toEqual({ G11: '-', F2c: '-', G12: '-' })
  })
  it('Kreisel: Masse-Zeile mit Soll und Ist; ein angenommener Abstand gilt nur unter Vorbehalt der Annahme', () => {
    const e = fall({ lage: 'kreisel', abstandKreiselM: 7.3 })
    e.abstandKreiselM = { wert: 7.3, quelle: 'annahme' }
    const b = beurteile(e)
    expect(b.masse.find(m => m.groesse === 'Abstand zum Kreisel')).toMatchObject({ soll: '≥ 5', ist: '7,3', zustand: 'annahme', regeln: ['G12'] })
    expect(b.annahmen).toContain('abstandKreiselM: Annahme')
    expect(beurteile(fall({ lage: 'kreisel', abstandKreiselM: 7.3 })).masse.find(m => m.groesse === 'Abstand zum Kreisel')?.zustand).toBe('erfuellt')
  })
  it('Kurzsätze der Zusammenfassung', () => {
    expect(kurzform({ id: 'G12', ist: '4,9', soll: '≥ 5', einheit: 'm' })).toBe('Streifen zu nah am Kreisel (4,9 m statt mindestens 5 m)')
    expect(kurzform({ id: 'F2c', ist: '1,70', soll: '≥ 1,80', einheit: 'm' })).toBe('Insel knapp für Rollstuhl und Führhund (1,70 m statt mindestens 1,80 m)')
    expect(kurzform({ id: 'G11' })).toBe('Streifenende nicht an gerader Trottoirkante')
  })
})

describe('Fragen und Sichtbarkeit', () => {
  const k = (abw: Abw, richtlinie?: boolean) => ({ e: fall(abw), ebenen: { bern: false, kantonBE: false, ...(richtlinie === undefined ? {} : { richtlinie }) } })
  it('je Feld eine Frage und eine Erklärung', () => {
    for (const f of ['streifenGerade', 'abstandKreiselM']) {
      expect(FRAGEN[f], f).toMatch(/\?$/)
      expect(FELD_HILFEN[f].was.length, f).toBeGreaterThan(30)
    }
  })
  it('gerade Trottoirkante: nur beim Fussgängerstreifen (auch mit Lichtsignal) und mit Richtlinie', () => {
    expect(sichtbar('streifenGerade', k({}))).toBe(true)
    expect(sichtbar('streifenGerade', k({ typ: 'lsa' }))).toBe(true)
    for (const typ of ['furt', 'ohne_vortritt', 'trottoirueberfahrt', null] as const) expect(sichtbar('streifenGerade', k({ typ })), String(typ)).toBe(false)
    expect(sichtbar('streifenGerade', k({}, false))).toBe(false)
    expect(gilt('G11', k({}, false))).toBe(false)
  })
  it('Abstand zum Kreisel: nur am Kreisel', () => {
    expect(sichtbar('abstandKreiselM', k({ lage: 'kreisel' }))).toBe(true)
    for (const lage of ['strecke', 'einmuendung', null] as const) expect(sichtbar('abstandKreiselM', k({ lage })), String(lage)).toBe(false)
    expect(sichtbar('abstandKreiselM', k({ lage: 'kreisel', typ: 'furt' }))).toBe(false)
    expect(sichtbar('abstandKreiselM', k({ lage: 'kreisel' }, false))).toBe(false)
  })
})

describe('Regelübersicht in der Gliederung der Quelle', () => {
  it('nach Quelle: Richtlinie in der Reihenfolge der Kapitel 4.1, 4.2, 4.4, die Normregel F1d unter Kap. 4.1 (auch unter VSS 40 241)', () => {
    const g = regelGruppen(regelZeilen(), 'quelle', { werk: 'HA' }).find(x => x.schluessel === 'werk-HA')!
    expect(g.zeilen.map(z => z.id)).toEqual(['F1d', 'G11', 'F2c', 'G12'])
    expect(regelGruppen(regelZeilen(), 'quelle', { werk: '40241' })[0].zeilen.map(z => z.id)).toContain('F1d')
    // Verbindlichkeit nach der ersten Fundstelle: bleibt die Norm
    expect(g.zeilen[0].verbindlichkeit).toBe('Soll nach VSS-Norm')
  })
  it('nach Thema: nach den Normregeln, Kapitel 4.1 vor 4.4', () => {
    const lage = regelGruppen(regelZeilen(), 'thema').find(x => x.schluessel === 'thema-lage')!.zeilen.map(z => z.id)
    expect(lage.indexOf('G11')).toBeLessThan(lage.indexOf('G12'))
    expect(lage.indexOf('G2')).toBeLessThan(lage.indexOf('G11'))
  })
})

// ── Vorbelegung aus der Geometrie ──
const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const HAUPT = av('Strasse_Weg', rechteck(-300, -4, 300, 4))
const AV: AvFlaeche[] = [HAUPT, av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (): Fall => leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
/** Ecke einer Einmündung nach Süden (Seitenstrasse ab x = 3), gerundet mit Radius r um (3 − r, −4 − r): Fahrbahn zwischen Ecke und Bogen */
const eckeRund = (r: number): AvFlaeche => av('Strasse_Weg', [lv(3, -4), lv(3 - r, -4),
  ...[...Array(19)].map((_, i) => { const t = (90 - i * 5) * Math.PI / 180; return lv(3 - r + r * Math.cos(t), -4 - r + r * Math.sin(t)) }).slice(1)])
const SEITE = av('Strasse_Weg', rechteck(3, -80, 11, -4))
const SUED: P = [0, -1]

describe('Vorbelegung: Streifen an gerader Trottoirkante (AV)', () => {
  it('gerade Kante: Richtungsänderung 0°', () => {
    const m = kanteAmEnde(new Fahrbahn([HAUPT]), lv(0, -4), SUED, 4)
    expect(m).toMatchObject({ art: 'gerade' })
    expect(m && 'grad' in m ? m.grad : NaN).toBeCloseTo(0, 6)
  })
  it('Ende in der Rundung einer Einmündung (Radius 6 m): Kurve', () => {
    const y = -10 + Math.sqrt(36 - 9)                                   // Bogen auf der Achse x = 0
    const m = kanteAmEnde(new Fahrbahn([HAUPT, eckeRund(6), SEITE]), lv(0, y), SUED, 4)
    expect(m?.art).toBe('kurve')
    expect(m && 'grad' in m ? m.grad : 0).toBeGreaterThanOrEqual(KANTE_KURVE_GRAD)
  })
  it('Seitenstrasse ohne Rundung reicht in die Breite des Streifens: Öffnung', () => {
    expect(kanteAmEnde(new Fahrbahn([HAUPT, av('Strasse_Weg', rechteck(1, -80, 9, -4))]), lv(0, -4), SUED, 4)).toEqual({ art: 'oeffnung' })
  })
  it('leicht gekrümmte Kante (Strassenkurve Radius 25 m): unklar, zwischen den Schwellen', () => {
    const bogen = [...Array(41)].map((_, i) => { const x = -20 + i; return lv(x, 21 - Math.sqrt(625 - x * x)) })
    const m = kanteAmEnde(new Fahrbahn([av('Strasse_Weg', [...bogen, lv(20, 8), lv(-20, 8)])]), lv(0, -4), SUED, 4)
    expect(m?.art).toBe('unklar')
    const g = m && 'grad' in m ? m.grad : NaN
    expect(g).toBeGreaterThan(KANTE_GERADE_GRAD)
    expect(g).toBeLessThan(KANTE_KURVE_GRAD)
  })
  it('Kante nicht in der Fahrbahn auffindbar: nicht messbar', () => {
    expect(kanteAmEnde(new Fahrbahn([HAUPT]), lv(0, -20), SUED, 4)).toBeNull()
  })
  it('ganze Vorbelegung: gerade Hauptstrasse «ja» aus der AV; ohne AV offen', () => {
    const g = querungen(rechneFall(OSM, AV, [], 12, fallMit(), null).streifen)[0]
    const v = vorbelegen(g, fallMit(), [], { av: AV })
    expect(v.werte.streifenGerade).toMatchObject({ wert: true, quelle: 'av' })
    expect(v.werte.streifenGerade.text).toMatch(/^Trottoirkante an den Streifenenden gerade \(AV: Richtungsänderung höchstens 0°/)
    expect(vorbelegen(g, fallMit(), [], {}).werte.streifenGerade).toBeUndefined()
  })
  it('ganze Vorbelegung: Streifen in der Rundung einer Einmündung «nein»', () => {
    const avE = [...AV.filter(f => f !== AV[2]), eckeRund(6), SEITE]
    const g = querungen(rechneFall(OSM, avE, [], 12, fallMit(), null).streifen)[0]
    const v = vorbelegen(g, fallMit(), [], { av: avE })
    expect(v.werte.streifenGerade).toMatchObject({ wert: false, quelle: 'av' })
    expect(v.werte.streifenGerade.text).toMatch(/Ende (in einer Kurve bzw\. Ecke der Kante|im Bereich einer Einmündung)$/)
  })
})

describe('Vorbelegung: Abstand zum Kreisel (OSM-Mittellinie des Rings)', () => {
  const g0 = querungen(rechneFall(OSM, AV, [], 12, fallMit(), null).streifen)[0]
  const oben = Math.max(...g0.streifen[0].umriss.map(p => p[1] - O[1]))
  const ring = (r: number, cy: number): [number, number, number][] => [...Array(13)].map((_, i) => [900 + (i % 12),
    Math.cos(i * Math.PI / 6) * r, cy + Math.sin(i * Math.PI / 6) * r])
  const kreisel = (d: number) => {
    const w: Vorbelegung = {}
    automatik({ st: g0.streifen, fall: fallMit(), geo: { osm: { ...OSM, wege: [...OSM.wege, weg(9, ring(10, oben + 10 + d), { highway: 'tertiary', junction: 'roundabout' })] } },
      w, hinweise: [], rechner: {}, setze: (p, wert, quelle, text) => { w[p] = { wert, quelle, text } }, feldHinweis: () => {} })
    return w
  }
  it('unter 5 m: Wert aus OSM (der Rand der Kreisfahrbahn liegt noch näher)', () => {
    const w = kreisel(4.9)
    expect(w.lage?.wert).toBe('kreisel')
    expect(w.abstandKreiselM).toMatchObject({ wert: 4.9, quelle: 'osm' })
    expect(w.abstandKreiselM.text).toBe('Mittellinie des Kreiselrings 4,9 m vom Streifenrand (OSM); der Rand der Kreisfahrbahn liegt um die halbe Ringbreite näher')
  })
  it('ab 5 m nur als Annahme; ohne Kreisel bis 20 m kein Wert', () => {
    expect(kreisel(7.3).abstandKreiselM).toMatchObject({ wert: 7.3, quelle: 'annahme' })
    expect(kreisel(7.3).abstandKreiselM.text).toMatch(/: als Abstand angenommen, am Plan prüfen$/)
    expect(kreisel(20.2).abstandKreiselM).toBeUndefined()
  })
})
