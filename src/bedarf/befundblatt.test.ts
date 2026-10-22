// Tests Bedarfsmodul E1: Vorbelegung aus der Rechnung und Befundblatt (reine Funktion zwischen Rechnung + Eingaben und Anzeige).
// Künstliche Strasse wie rechner/eingaben.test.ts (keine echten Daten): Hauptstrasse West–Ost, Fahrbahn 8 m, Tempo 50, Übergang
// bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { inselLage, inselMasse, inselFlaechen, streifenTeilen, E1_TIEFE_M, E1_BREITE_M, E1_FURT_M } from '../rechner/standardinsel'
import { leererFall, zufahrtSchluessel, type Fall } from '../fall'
import { befundblaetter, befundblatt, typText } from './befundblatt'
import { querungen, vorbelegen } from './vorbelegung'
import type { BedarfBlock } from './fallBedarf'
import { pruefUebersicht } from './themen'

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
    expect(v.innerorts).toMatchObject({ wert: true, quelle: 'annahme', text: 'Tempo 50 km/h (OSM): innerorts angenommen' })
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
    // Automatik Paket A: Tempo 50 ergibt «Strecke» (Tatsache), damit ist die Zulässigkeit nicht mehr offen; mit Strecke/Zone bewusst
    // offen (Handangabe) wie bisher
    expect(befundblaetter(r, fallMit(), OHNE_EBENEN)[0].befund.zulaessigkeit).toBe('zulaessig')
    const f0 = fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: null, quelle: 'hand' } } } })
    const [b] = befundblaetter(r, f0, OHNE_EBENEN)
    expect(b.befund.zulaessigkeit).toBe('offen')
    expect(b.befund.empfehlung.vorlaeufig).toBe(true)
    // Runde 4: Tempo 50 bekannt → keine Begegnungszone möglich (A2 nicht anwendbar), Empfehlung wie bisher vorläufig
    expect(b.typText).toMatch(/^Fussgängerstreifen \(vorläufig/)
    expect(b.befund.alle.some(x => x.id === 'A2')).toBe(false)
    // Tempo 20 ohne Zonenangabe: A2 offen → Empfehlung ausgesetzt (Kann A2)
    const [b20] = befundblaetter(r, fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: null, quelle: 'hand' }, vSig: { wert: 20, quelle: 'hand' } } } }), OHNE_EBENEN)
    expect(b20.typText).toBe('Empfehlung folgt, sobald geklärt ist, ob die Querung in einer Begegnungszone liegt')
    expect(b20.befund.empfehlung).toMatchObject({ typ: 'keiner', elemente: [], grundlage: [], vorlaeufig: true })
    expect(b.nichtGeprueft.map(x => x.block)).toContain('Nachfrage')
    expect(b.offen.some(o => o.feld === 'tempoRegime' && o.gruppe === 'rahmen')).toBe(true)
    expect(b.ebenen).toEqual({ bern: false, kantonBE: false, richtlinie: true })
    expect(b.befund.lokal.empfehlungen).toEqual([])
    // Sicht aus dem Sichtrechner: beide Zufahrten frei, kein H1-Befund; ob schneller gefahren wird, ist offen → H1 offen (Korrektur A3)
    expect(b.sicht.map(s => [s.regel, s.frei, s.soll])).toEqual([['H1', true, 55], ['H1', true, 55]])
    expect(b.befund.alle.some(x => x.id === 'H1' && x.zustand === 'verletzt')).toBe(false)
    expect(b.befund.alle.find(x => x.id === 'H1')).toMatchObject({ zustand: 'offen', fehlend: ['anzeichenSchneller'] })
    // Korrektur M2: H1 offen → Masszeile nicht erfüllt; Runde 5 (Stelle 14): offen nur wegen der Frage nach schnellerem Fahren →
    // «erfüllt unter Vorbehalt» mit der Bedingung beim Wert
    expect(b.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'vorbehalt', soll: '55',
      zusatz: 'gilt, wenn nicht schneller als 50 km/h gefahren wird (Frage oben)' })
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
    expect(b.annahmen.join(' ')).toContain('Querende, geschätzt (5 Spitzenstunden): 100 bis 500 (Schätzung von Hand)')
    expect(b.annahmen.join(' ')).toContain('Innerorts (innerhalb der Ortstafeln): ja – Tempo 50 km/h (OSM)')
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
  it('Prüfübersicht mit Sicht aus dem Sichtrechner (Korrektur A3): frei = ohne Befund nur mit erreichter Regel und richtigem Tempo', () => {
    const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })
    const mit = (felder: BedarfBlock['felder']): BedarfBlock => ({ felder: { ...HAND.felder, ...felder } })
    const ANZ_NEIN = { anzeichenSchneller: { wert: false, quelle: 'hand' as const } }
    const ue = (f: Fall) => { const [b] = befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, OHNE_EBENEN); return { b, u: pruefUebersicht(b.befund, { ebenen: b.ebenen, typ: b.gebildet.eingaben.typ.wert }) } }
    // frei, Anzeichen nein: H1 und D5-4 ohne Befund
    const { u: uf } = ue(fallMit(x => { x.bedarf = mit(ANZ_NEIN) }))
    expect(uf.stand.get('H1')).toBe('ohne_befund')
    expect(uf.stand.get('D5-4')).toBe('ohne_befund')
    // Anzeichen unbekannt bzw. Anzeichen ohne V85: offen
    expect(ue(fallMit(x => { x.bedarf = HAND })).u.stand.get('H1')).toBe('offen')
    const { b: ba, u: ua } = ue(fallMit(x => { x.bedarf = mit({ anzeichenSchneller: { wert: true, quelle: 'hand' } }) }))
    expect(ua.stand.get('H1')).toBe('offen')
    expect(ba.befund.alle.find(x => x.id === 'H1')?.fehlend).toEqual(['v85'])
    expect(ua.stand.get('D5-4')).toBe('offen')
    // V85 gemessen über dem signalisierten Tempo: Soll nach V85 nötig, der Sichtrechner rechnet tiefer → offen
    const { b: bv } = ue(fallMit(x => { x.bedarf = mit({ ...ANZ_NEIN, v85: { wert: 60, quelle: 'hand' }, v85Nachweis: { wert: true, quelle: 'hand' } }) }))
    expect(bv.befund.alle.find(x => x.id === 'H1')).toMatchObject({ zustand: 'offen' })
    expect(bv.befund.alle.find(x => x.id === 'H1')?.detail).toContain('Soll nach V85 60 km/h')
    // ausserorts: Baum erreicht H1 nicht → nicht ohne Befund
    expect(ue(fallMit(x => { x.bedarf = mit({ ...ANZ_NEIN, innerorts: { wert: false, quelle: 'hand' } }) })).u.stand.has('H1')).toBe(false)
    // verdeckt: Befund und LSA-Hinweis wie bisher
    const { u: uz } = ue(fallMit(x => { park(x); x.bedarf = mit(ANZ_NEIN) }))
    expect(uz.stand.get('H1')).toBe('befund')
    expect(uz.stand.get('D5-4')).toBe('hinweis')
    for (const u of [uf, ua, uz]) expect(u.ohneBefund + u.offen + u.befunde + u.hinweise).toBe(u.geprueft)
    // ohne Vortritt: E3 aus dem Sichtrechner, E3a nie
    const fid = rechneFall(OSM, AV, [], 12, fallMit(), null).streifen[0].fgsId
    const { u: uo } = ue(fallMit(x => { x.streifen[fid] = { typ: 'furt' }; x.bedarf = mit(ANZ_NEIN) }))
    expect(uo.stand.get('E3')).toBe('ohne_befund')
    expect(uo.stand.has('E3a')).toBe(false)
    expect(uo.stand.has('H1')).toBe(false)
    // gestrichene Zufahrt: Vermerk
    const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const fs = fallMit(x => { x.zufahrten[zufahrtSchluessel(fid, r0.streifen[0].zufahrten[0].kennung)] = { streichen: true }; x.bedarf = mit(ANZ_NEIN) })
    expect(befundblaetter(rechneFall(OSM, AV, [], 12, fs, null), fs, OHNE_EBENEN)[0].gestrichen).toBe(1)
  })
  it('Korrektur M1/M2/S1: höheres Tempo von Hand → Sicht offen (neu rechnen); ohne erreichte Sichtregel keine Sicht-Einträge, Masszeile offen', () => {
    const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })
    const mit = (felder: BedarfBlock['felder']): BedarfBlock => ({ felder: { ...HAND.felder, anzeichenSchneller: { wert: false, quelle: 'hand' }, ...felder } })
    const blatt = (f: Fall) => befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, OHNE_EBENEN)[0]
    // M1: signalisiert 60 von Hand, der Sichtrechner rechnet mit 50 (OSM): frei, aber offen; D5-4 offen; Masszeile offen (M2)
    const b60 = blatt(fallMit(x => { x.bedarf = mit({ vSig: { wert: 60, quelle: 'hand' }, innerorts: { wert: true, quelle: 'hand' } }) }))
    const h1 = b60.befund.alle.find(x => x.id === 'H1')!
    expect(h1).toMatchObject({ zustand: 'offen', fehlend: ['sichtVorh'] })
    expect(h1.detail).toContain('Sicht nach dem höheren Tempo neu rechnen')
    expect(b60.befund.alle.find(x => x.id === 'D5-4')).toMatchObject({ zustand: 'offen' })
    expect(b60.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'offen' })
    expect(pruefUebersicht(b60.befund).stand.get('H1')).toBe('offen')
    // gleiches Tempo: ohne Befund, Masszeile erfüllt
    const b50 = blatt(fallMit(x => { x.bedarf = mit({}) }))
    expect(b50.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'erfuellt' })
    // S1: ausserorts endet der Baum vor H1 → kein H1-Befund, kein LSA-Hinweis, auch bei verdeckter Sicht; Masszeile offen
    const ba = blatt(fallMit(x => { park(x); x.bedarf = mit({ innerorts: { wert: false, quelle: 'hand' } }) }))
    expect(ba.befund.alle.filter(x => ['H1', 'D5-4'].includes(x.id))).toEqual([])
    expect(ba.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toMatchObject({ zustand: 'offen' })
    expect(ba.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')!.ist).toContain('Sichtregel hier nicht geprüft')
  })
  it('Nachprüfung: abbiegende Zufahrten (Tempo der Querstrasse) lösen die Tempo-Prüfung nicht aus; gerade Zufahrt mit höherem Tempo von Hand weiterhin offen', () => {
    // T-Knoten: Hauptstrasse 50, Seitenstrasse 30 ab x = 15 nach Norden
    const osmT: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [14, 15, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
      weg(2, [[14, 15, 0], [20, 15, 200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
    const avT: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Strasse_Weg', rechteck(11, 4, 19, 200)),
      av('Trottoir', rechteck(-300, 4, 11, 7)), av('Trottoir', rechteck(19, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
    const felder = { ...HAND.felder, anzeichenSchneller: { wert: false, quelle: 'hand' as const }, vSig: { wert: 50, quelle: 'hand' as const },
      innerorts: { wert: true, quelle: 'hand' as const } }
    // die geraden Zufahrten gestrichen: es bleibt die abbiegende aus der 30er-Seitenstrasse (sonst von der geraden gedeckt)
    const r0 = rechneFall(osmT, avT, [], 12, fallMit(), null)
    const fid = r0.streifen[0].fgsId
    const f = fallMit(x => { for (const z of r0.streifen[0].zufahrten) x.zufahrten[zufahrtSchluessel(fid, z.kennung)] = { streichen: true }; x.bedarf = { felder } })
    const r = rechneFall(osmT, avT, [], 12, f, null)
    const ab = r.streifen[0].zufahrten
    expect(ab.length).toBeGreaterThan(0)
    expect(ab.every(z => z.zufahrt.startsWith('a') && z.tempo < 50 && z.status === 'frei')).toBe(true)
    const [b] = befundblaetter(r, f, OHNE_EBENEN)
    expect(b.befund.alle.some(x => x.id === 'H1')).toBe(false)
    expect(pruefUebersicht(b.befund).stand.get('H1')).toBe('ohne_befund')
    // gerade Zufahrt: 60 von Hand bei 50 im Sichtrechner → offen
    const f60 = fallMit(x => { x.bedarf = { felder: { ...felder, vSig: { wert: 60, quelle: 'hand' }, innerorts: { wert: true, quelle: 'hand' } } } })
    const [b60] = befundblaetter(rechneFall(osmT, avT, [], 12, f60, null), f60, OHNE_EBENEN)
    expect(b60.befund.alle.find(x => x.id === 'H1' && x.zustand === 'offen')?.detail).toContain('neu rechnen')
  })
  it('Nachprüfung: E3 erreicht (Streifen nicht angezeigt), Sichtrechner nur als Fussgängerstreifen → E3 offen, Sichtweite von Hand', () => {
    const f = fallMit(x => { x.bedarf = { felder: { ...HAND.felder, anzeichenSchneller: { wert: false, quelle: 'hand' }, vSig: { wert: 70, quelle: 'hand' },
      innerorts: { wert: true, quelle: 'hand' } } } })
    const [b] = befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, OHNE_EBENEN)
    expect(b.befund.zulaessigkeit).toBe('nicht_angezeigt')
    const e3 = b.befund.alle.find(x => x.id === 'E3')!
    expect(e3).toMatchObject({ zustand: 'offen', fehlend: ['sichtVorh'] })
    expect(e3.detail).toContain('als Fussgängerstreifen, nicht ohne Vortritt')
    expect(pruefUebersicht(b.befund).stand.get('E3')).toBe('offen')
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
    // Trottoirüberfahrt von Hand (folgt nicht aus den Streifen): bleibt; der Baum erreicht H1/E3 nicht → kein Sicht-Eintrag (Korrektur S1)
    const [t] = befundblaetter(r, { ...f, bedarf: { felder: { ...HAND.felder, typ: { wert: 'trottoirueberfahrt', quelle: 'hand' } } } }, OHNE_EBENEN)
    expect(t.gebildet.eingaben.typ.wert).toBe('trottoirueberfahrt')
    expect(t.befund.alle.filter(e => ['E3', 'H1', 'D5-4'].includes(e.id))).toEqual([])
    expect(t.befund.masse.find(m => m.groesse === 'Sichtweite (Sichtrechner)')).toBeUndefined()
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
    // innerorts von Hand (bei 60 km/h keine Annahme): sonst endet der Baum vor E3 (Ortslage offen)
    const f = fallMit(x => { x.streifen[fid] = { typ: 'ohne_vortritt' }; x.bedarf = { felder: { ...HAND.felder, innerorts: { wert: true, quelle: 'hand' } } } })
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
