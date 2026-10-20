// Tests Bedarfsmodul E1: Vorbelegung aus der Rechnung und Befundblatt (reine Funktion zwischen Rechnung + Eingaben und Anzeige).
// Künstliche Strasse wie rechner/eingaben.test.ts (keine echten Daten): Hauptstrasse West–Ost, Fahrbahn 8 m, Tempo 50, Übergang
// bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { inselLage, inselMasse, inselFlaechen, streifenTeilen, E1_TIEFE_M, E1_BREITE_M, E1_FURT_M } from '../rechner/standardinsel'
import { leererFall, type Fall } from '../fall'
import { befundblaetter, befundblatt, typText } from './befundblatt'
import { querungen, vorbelegen } from './vorbelegung'
import type { BedarfBlock } from './fallBedarf'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const BERN = { vorgabe: { bern: true, kantonBE: true } }
const OHNE_EBENEN = { vorgabe: { bern: false, kantonBE: false } }
/** Handeingaben wie im Probelauf: DTV, Schätzklasse, Netz, Rahmen */
const HAND: BedarfBlock = { felder: {
  dtv: { wert: 8000, quelle: 'hand' }, fgKlasse: { wert: '100-500', quelle: 'schaetzung' }, netz: { wert: 'basisnetz', quelle: 'hand' },
  tempoRegime: { wert: 'strecke', quelle: 'hand' }, strassentyp: { wert: 'verkehrsorientiert', quelle: 'hand' },
  nachfrage: { wert: 'punktuell', quelle: 'hand' }, lage: { wert: 'strecke', quelle: 'hand' }, beduerfnis: { wert: [], quelle: 'hand' },
  'haltestelle.art': { wert: 'keine', quelle: 'hand' },
} }
const ids = (l: { id: string }[]) => l.map(x => x.id)

describe('Vorbelegung aus der Rechnung (synthetischer Fall)', () => {
  const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
  const g = querungen(r.streifen)
  const v = vorbelegen(g[0], fallMit()).werte
  it('eine Querung; Typ, Lichtsignal, Tempo, innerorts (Annahme), Fahrbahnbreite und Querdistanz mit Quelle', () => {
    expect(g.length).toBe(1)
    expect(v.typ).toMatchObject({ wert: 'fgs', quelle: 'rechnung' })
    expect(v.fgsMitLsa).toMatchObject({ wert: false, quelle: 'osm' })
    expect(v.vSig).toMatchObject({ wert: 50, quelle: 'osm' })
    expect(v.innerorts).toMatchObject({ wert: true, quelle: 'annahme', text: 'Tempo 50 km/h: innerorts angenommen' })
    expect(v.fahrbahnB).toMatchObject({ wert: 8, quelle: 'rechnung' })
    expect(v.querdistanzL).toMatchObject({ wert: [8], quelle: 'rechnung' })
  })
  it('Fahrstreifen je Richtung (ohne OSM lanes: Annahme), Gegenverkehr, Radstreifen, Tram, keine Insel', () => {
    expect(v.nRichtung).toMatchObject({ wert: [1, 1], quelle: 'annahme' })
    expect(v.zweirichtung).toMatchObject({ wert: true })
    expect(v.radstreifen).toMatchObject({ wert: false, quelle: 'osm' })
    expect(v.tram).toMatchObject({ wert: 'keins', quelle: 'osm' })
    expect(v['insel.vorhanden']).toMatchObject({ wert: false, quelle: 'rechnung' })
    expect(v.dtv).toBeUndefined(); expect(v.fg5h).toBeUndefined()            // hat die Rechnung nicht: offen
  })
  it('OSM lanes 2 je Richtung: Quelle OSM; Tramgleis quert: offen mit Hinweis', () => {
    const osm2: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'primary', name: 'Hauptstrasse',
      maxspeed: '50', lanes: '4' })], tram: [weg(99, [[90, -50, 1.5], [91, 50, 1.5]], { railway: 'tram' })] }
    const r2 = rechneFall(osm2, AV, [], 12, fallMit(), null)
    const v2 = vorbelegen(querungen(r2.streifen)[0], fallMit())
    expect(v2.werte.nRichtung).toMatchObject({ wert: [2, 2], quelle: 'osm' })
    expect(v2.werte.tram).toBeUndefined()
    expect(v2.hinweise.join(' ')).toContain('Tramgleis nach OSM quert die Querung')
  })
  it('Mittelinsel (Standard), Teilstreifen von Hand: Insel aus dem Plan (Tiefe, Furt, Mast), Teilquerungen und Durchfahrt', () => {
    const lage = inselLage(lv(0, 0), [0, 1], [1, 0]), E1 = inselMasse(E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, null, 'links')
    const f = fallMit(x => {
      const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), lage, E1)
      if (!('teile' in t)) throw new Error(t.grund)
      t.teile.forEach(([p0, p1], i) => x.streifenHand.push({ id: `hand-${i + 1}`, p0, p1, breite: 4, herkunft: 'gezeichnet' }))
      x.flaechenPlan = inselFlaechen(lage, E1, 'e1-1', false).map((y, i) => ({ id: `plan-${i + 1}`, ...y }))
    })
    const ri = rechneFall(OSM, AV, [], 12, f, null)
    const gi = querungen(ri.streifen)
    expect(gi.length).toBe(1); expect(gi[0].streifen.length).toBe(2)
    const w = vorbelegen(gi[0], f).werte
    expect(w['insel.vorhanden']).toMatchObject({ wert: true, quelle: 'rechnung' })
    expect(w['insel.breite']).toMatchObject({ wert: 2 })
    expect(w['insel.art']).toMatchObject({ wert: 'baulich', quelle: 'rechnung' })
    expect(w['insel.furt']).toMatchObject({ wert: 1.2 }); expect(w['insel.vertikal']).toMatchObject({ wert: true })
    expect(w.querdistanzL).toMatchObject({ wert: [3, 3] }); expect(w.fahrbahnB).toMatchObject({ wert: 8 })
    expect(w.durchfahrt).toMatchObject({ wert: [3, 3] })
    expect(w.achsWinkel).toMatchObject({ wert: 90 })
    // Befund: bauliche Insel 2,00 m erfüllt F2; Durchfahrt 3,00 m nach F3 (Kanton BE) zu schmal
    const b = befundblatt(gi[0], { ...f, bedarf: HAND }, BERN)
    expect(b.befund.masse.find(m => m.groesse === 'Inselbreite (quer)')).toMatchObject({ ist: '2,00', zustand: 'erfuellt' })
    expect(ids(b.befund.lokal.empfehlungen)).toContain('F3')
    // Grundprüfung bfu: Inseltiefe 2,00 m erfüllt, Durchfahrt 3,00 m weder rund 3,50 m noch ab 4,50 m (gelb)
    const insel = b.grund.punkte.find(p => p.nr === '2')!
    expect(insel.teile.map(t => [t.id, t.zustand])).toEqual([['B5-2b', 'erfuellt'], ['B5-2c', 'verletzt']])
    expect(insel).toMatchObject({ zustand: 'verletzt', staerke: 'weich' })
    // gemischte Querung: ein Teilstreifen ohne Vortritt → Grundprüfung gilt nicht (Satz)
    const fid2 = ri.streifen[1].fgsId
    const fm = { ...f, streifen: { ...f.streifen, [fid2]: { typ: 'furt' as const } }, bedarf: HAND }
    const [bm] = befundblaetter(rechneFall(OSM, AV, [], 12, fm, null), fm, BERN)
    expect(bm.grund.gilt).toBe(false)
    expect(bm.grund.grund).toContain('teils Fussgängerstreifen, teils ohne Vortritt')
  })
})

describe('Befundblatt', () => {
  it('ohne Handeingaben: Zulässigkeit offen, Empfehlung vorläufig; Nachfrage ganz ohne Eingabe: nicht geprüft', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const [b] = befundblaetter(r, fallMit(), OHNE_EBENEN)
    expect(b.befund.zulaessigkeit).toBe('offen')
    expect(b.befund.empfehlung.vorlaeufig).toBe(true)
    expect(b.typText).toMatch(/^Fussgängerstreifen \(vorläufig/)
    expect(b.nichtGeprueft.map(x => x.block)).toContain('Nachfrage')
    expect(b.offen.some(o => o.feld === 'tempoRegime' && o.gruppe === 'rahmen')).toBe(true)
    expect(b.ebenen).toEqual({ bern: false, kantonBE: false, richtlinie: true })
    expect(b.befund.lokal.empfehlungen).toEqual([])
    // Sicht aus dem Sichtrechner: beide Zufahrten frei, kein H1-Befund
    expect(b.sicht.map(s => [s.regel, s.frei, s.soll])).toEqual([['H1', true, 55], ['H1', true, 55]])
    expect(b.befund.alle.some(x => x.id === 'H1')).toBe(false)
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'erfuellt', soll: '55' })
  })
  it('mit Handeingaben (DTV 8 000, Schätzklasse 100–500, Basisnetz): FGS zulässig, Typ Q1; Schätzung ausgewiesen; Bern gesondert', () => {
    const f = fallMit(x => { x.bedarf = HAND })
    const r = rechneFall(OSM, AV, [], 12, f, null)
    const [b] = befundblaetter(r, f, BERN)
    expect(b.befund.zulaessigkeit).toBe('zulaessig')
    expect(b.befund.empfehlung.typ).toBe('Q1')
    expect(b.typText).toBe('Fussgängerstreifen')
    expect(b.zulText).toBe('Fussgängerstreifen zulässig')
    expect(ids(b.befund.norm.hinweise)).toEqual(expect.arrayContaining(['C3c', 'D2c']))
    expect(b.annahmen.join(' ')).toContain('Querende, geschätzt (5 Spitzenstunden): Schätzung')
    expect(b.annahmen.join(' ')).toContain('Innerorts (innerhalb der Ortstafeln): Annahme (Tempo 50 km/h: innerorts angenommen)')
    // Bern: Inseltabelle bei über 30 km/h und 5 001 bis 10 000 Fz/Tag «Ja» (weich), LSA «Ja oder nein» (Hinweis)
    expect(ids(b.befund.lokal.empfehlungen)).toContain('D6-2')
    expect(ids(b.befund.lokal.hinweise)).toContain('D6-3b')
    expect(b.befund.norm.empfehlungen.some(x => x.ebene === 'Bern')).toBe(false)
    const [aus] = befundblaetter(r, f, OHNE_EBENEN)
    expect(aus.befund.lokal.empfehlungen).toEqual([])
    const [vonHand] = befundblaetter(r, { ...f, bedarf: { ...HAND, ebenen: { bern: false } } }, BERN)
    expect(vonHand.ebenen.bern).toBe(false); expect(ids(vonHand.befund.lokal.empfehlungen)).not.toContain('D6-2')
  })
  it('Sicht verdeckt (Parkfeld): Pflichtverletzung H1 aus dem Sichtrechner, LSA-Hinweis D5-4; Sicht von Hand ersetzt den Sichtrechner', () => {
    const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })
    const f = fallMit(x => { park(x); x.bedarf = HAND })
    const r = rechneFall(OSM, AV, [], 12, f, null)
    const [b] = befundblaetter(r, f, OHNE_EBENEN, )
    const h1 = b.befund.norm.verletzungen.filter(x => x.id === 'H1')
    expect(h1.length).toBe(1)
    expect(h1[0].ist).toMatch(/^verdeckt/)
    expect(h1[0].soll).toBe('55 m frei (VSS Tab. 1)')
    expect(h1[0].detail).toContain('Sichtfeld bis zur Soll-Sichtweite nicht frei (Sichtrechner)')
    expect(ids(b.befund.norm.hinweise)).toContain('D5-4')
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'verletzt', ist: 'verdeckt (1 von 2 Zufahrten)' })
    expect(b.vorbelegt.werte.parkierungSichtbehindernd).toMatchObject({ wert: true })
    const hand = { ...f, bedarf: { felder: { ...HAND.felder, sichtVorh: { wert: [70, 70], quelle: 'hand' as const } } } }
    const [bh] = befundblaetter(r, hand, OHNE_EBENEN)
    expect(bh.sichtVonHand).toBe(true); expect(bh.sicht).toEqual([])
    expect(bh.befund.alle.some(x => x.id === 'H1' && x.zustand === 'verletzt')).toBe(false)   // 70 m genügen nach Tab. 1
  })
  it('Querung ohne Vortritt: Typ aus dem Streifen, Pfad E; Sicht nach Z. 8.2 (E3) aus dem Sichtrechner', () => {
    const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const fid = r0.streifen[0].fgsId
    const f = fallMit(x => { x.streifen[fid] = { typ: 'furt' }; x.bedarf = HAND })
    const r = rechneFall(OSM, AV, [], 12, f, null)
    const [b] = befundblaetter(r, f, OHNE_EBENEN)
    expect(b.gebildet.eingaben.typ).toEqual({ wert: 'furt', quelle: 'hand' })
    expect(b.sicht.every(s => s.regel === 'E3' && s.soll === 92.6)).toBe(true)
    expect(b.befund.ausgewertet).toContain('E1')
    // Typ im Bedarf von Hand anders als der Streifen (Korrektur E1): die Querungsart der Streifen gilt, Sicht bleibt, Hinweis
    const [x] = befundblaetter(r, { ...f, bedarf: { felder: { ...HAND.felder, typ: { wert: 'fgs', quelle: 'hand' } } } }, OHNE_EBENEN)
    expect(x.gebildet.eingaben.typ.wert).toBe('furt')
    expect(x.sicht.length).toBe(2)
    expect(x.hinweise.join(' ')).toContain('Querungstyp im Bedarf (Fussgängerstreifen) widerspricht der Querungsart der Streifen: es gilt Furt')
    expect(x.gebildet.herkunft.get('typ')!.text).toContain('übergangen')
    // Trottoirüberfahrt von Hand (folgt nicht aus den Streifen): bleibt; Sicht offen statt ohne Ersatz
    const [t] = befundblaetter(r, { ...f, bedarf: { felder: { ...HAND.felder, typ: { wert: 'trottoirueberfahrt', quelle: 'hand' } } } }, OHNE_EBENEN)
    expect(t.gebildet.eingaben.typ.wert).toBe('trottoirueberfahrt')
    expect(t.befund.alle.filter(e => e.id === 'E3').map(e => [e.zustand, e.fehlend])).toEqual([['offen', ['sichtVorh']]])
  })
  it('ohne Vortritt verdeckt: weich, wo das Soll über der Anhaltesichtweite liegt; hart, wenn schon die Anhaltesichtweite nicht frei ist', () => {
    const blatt = (b: number) => {
      const av2 = [av('Strasse_Weg', rechteck(-300, -b, 300, b)), av('Trottoir', rechteck(-300, b, 300, b + 3)), av('Trottoir', rechteck(-300, -b - 3, 300, -b))]
      const fid = rechneFall(OSM, av2, [], 12, fallMit(), null).streifen[0].fgsId
      const f = fallMit(x => {
        x.streifen[fid] = { typ: 'furt' }; x.bedarf = HAND
        x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, -b, -7, -b + 2), quelle: 'hand' })
      })
      return befundblaetter(rechneFall(OSM, av2, [], 12, f, null), f, OHNE_EBENEN)[0].befund.alle.filter(e => e.id === 'E3')
    }
    const weich = blatt(3)                  // L 6 m, 50 km/h: Soll 69,5 m über der Anhaltesichtweite 55 m
    expect(weich.map(e => [e.staerke, e.zustand])).toEqual([['weich', 'verletzt']])
    expect(weich[0].detail).toContain('ob die Anhaltesichtweite (55 m) frei bleibt, ist nicht getrennt geprüft: Befund vorerst weich')
    expect(blatt(2).map(e => [e.staerke, e.zustand])).toEqual([['hart', 'verletzt']])   // L 4 m: Soll = Anhaltesichtweite 55 m
  })
  it('Lichtsignal am Streifen: Typ «mit Lichtsignal», kein H1 aus dem Sichtrechner (40 241 gilt nicht), nur Hinweis', () => {
    const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const fid = r0.streifen[0].fgsId
    const f = fallMit(x => {
      x.streifen[fid] = { lsa: 'ja' }; x.bedarf = HAND
      x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })
    })
    const r = rechneFall(OSM, AV, [], 12, f, null)
    expect(r.streifen[0].zufahrten.some(z => z.status !== 'frei')).toBe(true)
    const [b] = befundblaetter(r, f, OHNE_EBENEN)
    expect(b.vorbelegt.werte.typ).toMatchObject({ wert: 'lsa' })
    expect(b.befund.alle.some(e => e.id === 'H1')).toBe(false)
    expect(b.sicht).toEqual([])
    expect(b.hinweise.join(' ')).toContain('mit Lichtsignal gilt die Sichtweite nach VSS 40 241 nicht (kein Befund H1)')
  })
  it('Soll über der Reichweite der geladenen Daten (60 km/h, L 8 m: 111,2 m): geprüft bis 110 m, Sicht offen statt erfüllt', () => {
    const osm60: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '60' })] }
    const fid = rechneFall(osm60, AV, [], 12, fallMit(), null).streifen[0].fgsId
    const f = fallMit(x => { x.streifen[fid] = { typ: 'ohne_vortritt' }; x.bedarf = HAND })
    const r = rechneFall(osm60, AV, [], 12, f, null)
    expect(r.streifen[0].zufahrten.map(z => [z.sichtweite, z.geprueftBisM, z.status])).toEqual([[111.2, 110, 'frei'], [111.2, 110, 'frei']])
    const [b] = befundblaetter(r, f, OHNE_EBENEN)
    const e3 = b.befund.alle.filter(e => e.id === 'E3')
    expect(e3.map(e => [e.zustand, e.ist])).toEqual([['offen', 'frei bis 110 m'], ['offen', 'frei bis 110 m']])
    expect(e3[0].detail).toContain('darüber nicht geprüft')
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'offen' })
    expect(b.offen.some(o => o.feld === 'sichtVorh')).toBe(true)
  })
  it('Grundprüfung bfu im Befundblatt: Sicht aus dem Sichtrechner je Zufahrt, verdeckt hart; nicht bei Lichtsignal bzw. Furt; keine B5 im Befund', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const [b] = befundblaetter(r, fallMit(x => { x.bedarf = HAND }), OHNE_EBENEN)
    expect(b.grund.gilt).toBe(true)
    const s1 = b.grund.punkte.find(p => p.nr === '1')!.teile.find(t => t.id === 'B5-1')!
    expect(s1).toMatchObject({ zustand: 'erfuellt', ist: '2 von 2 Zufahrten frei', soll: '≥ 55 m' })
    expect(b.grund.punkte.find(p => p.nr === 'T')!.zustand).toBe('offen')          // V85 fehlt
    expect(b.befund.alle.some(x => x.id.startsWith('B5'))).toBe(false)
    const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })
    const fp = fallMit(x => { park(x); x.bedarf = HAND })
    const [bp] = befundblaetter(rechneFall(OSM, AV, [], 12, fp, null), fp, OHNE_EBENEN)
    expect(bp.grund.punkte.find(p => p.nr === '1')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
    const fid = r.streifen[0].fgsId
    for (const e of [{ lsa: 'ja' as const }, { typ: 'furt' as const }]) {
      const f = fallMit(x => { x.streifen[fid] = e; x.bedarf = HAND })
      const [bx] = befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, OHNE_EBENEN)
      expect(bx.grund.gilt).toBe(false)
      expect(bx.grund.grund).toContain('gilt nur für Fussgängerstreifen ohne Lichtsignalanlage')
    }
  })
  it('Typ-Text mit Elementen und Dativ', () => {
    const b = befundblaetter(rechneFall(OSM, AV, [], 12, fallMit(), null), fallMit(), OHNE_EBENEN)[0].befund
    expect(typText({ ...b, empfehlung: { ...b.empfehlung, typ: 'Q2', elemente: ['Fussgängerstreifen', 'Lichtsignalanlage', 'Schutzinsel'],
      vorlaeufig: false } })).toBe('Fussgängerstreifen mit Lichtsignalanlage und Schutzinsel')
    expect(typText({ ...b, empfehlung: { ...b.empfehlung, typ: 'Q1', elemente: ['Fussgängerstreifen', 'vorgezogener Seitenraum'],
      vorlaeufig: false } })).toBe('Fussgängerstreifen mit vorgezogenem Seitenraum')
  })
})
