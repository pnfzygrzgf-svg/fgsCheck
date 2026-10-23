// Tests Knotensicht an der Trottoirüberfahrt (K2–K4): Zufahrt über den gequerten Weg, Breite (Hand, angrenzendes Trottoir), Tempo V_sig,
// Hindernisse, Längsneigung, Vorbelegung «Sicht beim Ausfahren», Anzeige und Bericht. Künstliche Strassen (keine echten Daten):
// Hauptstrasse West–Ost (y = 0, 50 km/h), Querweg mündet bei x = -40 von Süden ein (30 km/h); Trottoir 3 m beidseits.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import { osmParsen } from '../daten/osm'
import { avParsen, type GeoJson } from '../daten/av'
import { rechneFall } from '../rechner'
import { leererFall, rechnungsSchluessel, type Fall } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { knotensichtAnfuegen, knotensichtTue, ksDatenAusRoh, zufahrtFinden, type Knotensicht, type KnotensichtAntwort } from './knotensicht'
import { HOEHEN_QUELLE } from '../knotensicht/rechner/neigung'
import { KnotensichtBericht, KnotensichtBlock } from './KnotensichtBlock'
import { TUE_NUR_EINMUENDUNG } from '../texte'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number) => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const weg = (id: number, pts: [number, number, number][], tags: Record<string, string>) =>
  ({ type: 'way', id, tags, nodes: pts.map(p => p[0]), geometry: pts.map(p => { const [lat, lon] = ll(p[1], p[2]); return { lat, lon } }) })
const OSM_ROH = { elements: [
  weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
  weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
const flaeche = (art: string, ring: P[], bfs: number | null = null) => ({ properties: { Art: art, Kanton: 'BE', Qualitaet: 'AV93', BFSNr: bfs },
  geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const avRoh = (bfs: number | null = null): GeoJson => ({ features: [
  flaeche('Strasse_Weg', [lv(-300, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), lv(-37, -4), lv(300, -4), lv(300, 4), lv(-300, 4)], bfs),
  flaeche('Trottoir', rechteck(-300, 4, 300, 7), bfs), flaeche('Trottoir', rechteck(-300, -7, -43, -4), bfs),
  flaeche('Trottoir', rechteck(-37, -7, 300, -4), bfs)] })
/** Streifen von Hand über den Querweg (Einmündung), 8 m vor der Hauptstrasse, als Trottoirüberfahrt */
const fallTue = (f: (x: Fall) => void = () => {}, p0 = lv(-44, -8), p1 = lv(-36, -8)): Fall => {
  const [lat, lon] = ll(-40, -4), x = leererFall(lat, lon, null)
  x.streifenHand.push({ id: 'hand-1', p0, p1, breite: 3, herkunft: 'gezeichnet' }); x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' }
  f(x); return x
}
type Rest = Parameters<typeof knotensichtAnfuegen>[3]
const REST: Rest = { park: null, vsig: null, avZentrum: lv(-40, -4), avRadius: 150, hoehen: null }
function rechnen(fall: Fall, rest: Partial<Rest> = {}, av = avRoh()) {
  const r = rechneFall(osmParsen(OSM_ROH), avParsen(av), [], null, fall, null, null, null, null)
  knotensichtAnfuegen(r, { osm: OSM_ROH, av }, fall, { ...REST, ...rest })
  return r
}
const ks = (a: KnotensichtAntwort | undefined): Knotensicht => { if (!a || 'fehler' in a) throw new Error(`keine Knotensicht: ${JSON.stringify(a)}`); return a }
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

describe('Knotensicht: Knoten und Zufahrt aus dem Streifen', () => {
  const d = ksDatenAusRoh(OSM_ROH, avRoh(), { ...REST, hindernisse: [], verworfen: [] })
  it('Zufahrt ist der Arm des gequerten Wegs (Querweg vom Knoten weg), Knoten bis 20 m', () => {
    expect(zufahrtFinden(d.kx!, { p0: lv(-44, -8), p1: lv(-36, -8), rand: [lv(-43, -8), lv(-37, -8)] })).toMatchObject({ knoten: 11, zufahrt: '2:0:1' })
  })
  it('Streifen über die durchgehende Strasse weit weg vom Knoten: keine Zufahrt, Hinweis «nur an Einmündungen»', () => {
    const a = knotensichtTue(d, { p0: lv(150, -6), p1: lv(150, 6), rand: [lv(150, -4), lv(150, 4)], breite: null })
    expect(a).toMatchObject({ ohneZufahrt: true })
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={a} lage={null} breiteHand={null} setzeBreite={() => {}} />)))
      .toContain(`Trottoirüberfahrten gibt es ${TUE_NUR_EINMUENDUNG}`)
  })
})

describe('Knotensicht im Worker-Weg (rechneFall + knotensichtAnfuegen)', () => {
  it('ohne Trottoirüberfahrt: nichts angefügt, Rechnung unverändert', () => {
    const f = fallTue(x => { delete x.streifen['hand-1'] })
    const r = rechneFall(osmParsen(OSM_ROH), avParsen(avRoh()), [], null, f, null, null, null, null)
    const vorher = JSON.stringify({ ...r, ms: 0 })
    knotensichtAnfuegen(r, { osm: OSM_ROH, av: avRoh() }, f, REST)
    expect(JSON.stringify({ ...r, ms: 0 })).toBe(vorher)
    expect(r.streifen[0].knotensicht).toBeUndefined()
  })
  const k = ks(rechnen(fallTue()).streifen[0].knotensicht)
  it('zwei Phasen je Richtung, Breite aus dem angrenzenden Trottoir (3,00 m), Tempo OSM, Neigung 0 % angenommen', () => {
    expect([k.knoten, k.zufahrt, Math.round(k.breite * 100) / 100, k.breiteQuelle]).toEqual([11, '2:0:1', 3, 'av_neben'])
    expect(k.richtungen.map(r => [r.richtung, r.tempo, !!r.trottoir, !!r.auto, !!r.velo])).toEqual([['links', 50, true, true, true], ['rechts', 50, true, true, true]])
    expect([k.phaseTrottoir.status, k.phaseFahrbahn.status, k.ok]).toEqual(['erfuellt', 'erfuellt', true])
    expect(k.neigungGemessen).toBe(false); expect(k.annahmeGrund).toEqual(['Längsneigung 0 % angenommen'])
    expect(Object.keys(k.profile).sort()).toEqual(['links', 'rechts', 'trottoir', 'zufahrt'])
    expect(k.karte.dreiecke.map(d => d.art).sort()).toEqual(['auto', 'auto', 'trottoir', 'trottoir', 'velo', 'velo'])
    expect(k.hoehenSchluessel).toBe('11|2:0:1')
  })
  it('Breite von Hand (Bedarf «Breite der Trottoirüberfahrt») geht vor; ausserhalb 1 bis 8 m ohne Wirkung', () => {
    const mit = (w: number) => ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.breiteM': { wert: w, quelle: 'hand' } } } })).streifen[0].knotensicht)
    expect([mit(2.5).breite, mit(2.5).breiteQuelle]).toEqual([2.5, 'eingabe'])
    expect(mit(12).breiteQuelle).toBe('av_neben')
  })
  it('Längsneigung aus dem Höhenmodell: gemessen, keine Annahme mehr', () => {
    const m = { i: 0, quelle: `${HOEHEN_QUELLE}, Profil 50 m, 20 Punkte`, laenge: 50, punkte: 20, hinweis: null }
    const g = ks(rechnen(fallTue(), { hoehen: { [k.hoehenSchluessel]: { links: m, rechts: m, zufahrt: m, trottoir: m } } }).streifen[0].knotensicht)
    expect([g.neigungGemessen, g.annahmeGrund]).toEqual([true, []])
  })
  it('Tempo amtlich: V_sig nur, wenn die AV unter dem Knoten zur Stadt Bern gehört', () => {
    const vsig = { linien: [{ id: 'v1', strasse: 'Hauptstrasse', vSig: 30, teile: [[lv(-300, 0), lv(300, 0)]] }], bereich: { mitte: lv(-40, -4), radiusM: 150, form: 'quadrat' } }
    const bern = ks(rechnen(fallTue(), { vsig }, avRoh(351)).streifen[0].knotensicht)
    expect(bern.richtungen.map(r => r.tempo)).toEqual([30, 30]); expect(bern.richtungen[0].tempoQuelle).toContain('Geoportal')
    expect(ks(rechnen(fallTue(), { vsig }, avRoh(355)).streifen[0].knotensicht).richtungen.map(r => r.tempo)).toEqual([50, 50])
  })
  it('Parkfeld von Hand links im Sichtfeld: Phase Fahrbahn nicht erfüllt; Insel von Hand zählt nicht als Hindernis', () => {
    const f = fallTue(x => {
      x.hindernisse.push({ id: 'h1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-60, -4, -48, -1.8), quelle: 'hand' })
      x.hindernisse.push({ id: 'h2', art: 'insel', ring: rechteck(-20, -1, -10, 1), quelle: 'hand' })
    })
    const g = ks(rechnen(f).streifen[0].knotensicht)
    expect(g.phaseFahrbahn.status).toBe('nicht_erfuellt'); expect(g.ok).toBe(false)
    expect(g.richtungen.find(r => r.richtung === 'links')!.auto!.status).toBe('nicht_erfuellt')
  })
})

describe('Knotensicht: Vorbelegung «Sicht beim Ausfahren», Handeingabe geht vor', () => {
  const blatt = (f: Fall, rest = {}) => befundblaetter(rechnen(f, rest), f, { vorgabe: { bern: false, kantonBE: false } })[0]
  it('beide Phasen erfüllt, Neigung angenommen: ja mit Quelle Annahme; mit Höhenmodell: Quelle Rechnung', () => {
    expect(blatt(fallTue()).vorbelegt.werte['q3.knotensichtOk']).toMatchObject({ wert: true, quelle: 'annahme' })
    const m = { i: 0, quelle: HOEHEN_QUELLE, laenge: 50, punkte: 20, hinweis: null }
    const w = blatt(fallTue(), { hoehen: { '11|2:0:1': { links: m, rechts: m, zufahrt: m, trottoir: m } } }).vorbelegt.werte['q3.knotensichtOk']
    expect(w).toMatchObject({ wert: true, quelle: 'rechnung' }); expect(String(w?.text)).toContain('aufs Trottoir genügt')
  })
  it('nicht erfüllt: nein; Handeingabe überschreibt', () => {
    const park = (x: Fall) => x.hindernisse.push({ id: 'h1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-60, -4, -48, -1.8), quelle: 'hand' })
    expect(blatt(fallTue(park)).vorbelegt.werte['q3.knotensichtOk']?.wert).toBe(false)
    const hand = fallTue(x => { park(x); x.bedarf = { felder: { 'q3.knotensichtOk': { wert: true, quelle: 'hand' } } } })
    expect(blatt(hand).gebildet.eingaben.q3.wert?.knotensichtOk).toBe(true)
  })
  it('ohne Einmündung: Frage bleibt offen, mit Hinweis', () => {
    const b = blatt(fallTue(() => {}, lv(150, -6), lv(150, 6)))
    expect(b.vorbelegt.werte['q3.knotensichtOk']).toBeUndefined()
    expect(b.vorbelegt.feldHinweise?.['q3.knotensichtOk']).toContain('nicht gerechnet')
  })
  it('Rechnungsschlüssel: Breite von Hand zählt nur mit Trottoirüberfahrt', () => {
    const mit = (tue: boolean, w: number | null) => rechnungsSchluessel(fallTue(x => {
      if (!tue) delete x.streifen['hand-1']
      if (w !== null) x.bedarf = { felder: { 'q3.breiteM': { wert: w, quelle: 'hand' } } }
    }))
    expect(mit(true, 2.5)).not.toBe(mit(true, null))
    expect(mit(false, 2.5)).toBe(mit(false, null))
  })
})

describe('Knotensicht: Anzeige und Bericht (Render-Wächter)', () => {
  const k = ks(rechnen(fallTue()).streifen[0].knotensicht)
  const t = text(renderToStaticMarkup(<KnotensichtBlock ks={k} lage={null} breiteHand={null} setzeBreite={() => {}} />))
  it('Phasen je Richtung, Breite mit Herkunft, Frage statt Feldname; kein Link auf den SichtweitenCheck, keine Regelnummer allein', () => {
    for (const x of ['Knotensicht der Einbiegenden', 'Ausfahrt aus', 'aufs Trottoir', 'auf die Fahrbahn', 'von links', 'von rechts',
      'Breite 3,00 m (angrenzendes Trottoir (AV))', 'Wie breit ist die Überfahrt?', 'Längsneigung 0 % angenommen']) expect(t).toContain(x)
    expect(t).not.toContain('SichtweitenCheck ↗'); expect(t).not.toMatch(/\bQ3-\d+\b/); expect(t).not.toMatch(/ß/)
  })
  it('Hinweis zur Neigung nur ohne Höhenmodell', () => {
    const g = { ...k, neigungGemessen: true }
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={g} lage={null} breiteHand={null} setzeBreite={() => {}} />))).not.toContain('Längsneigung 0 %')
  })
  it('Bericht: Satz mit beiden Phasen, Tabelle, Herkunft der Rechnung', () => {
    const b = text(renderToStaticMarkup(<KnotensichtBericht ks={k} />))
    expect(b).toContain('aufs Trottoir genügt, auf die Fahrbahn genügt'); expect(b).toContain('Rechnung nach SichtweitenCheck 0.6.0')
    expect(b).toContain('Sicht auf die Wartefläche gilt hier nicht')
  })
})
