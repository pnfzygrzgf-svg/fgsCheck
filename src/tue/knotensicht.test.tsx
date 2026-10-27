// Tests Knotensicht an der Trottoirüberfahrt (K2–K4): Zufahrt über den gequerten Weg, Breite (Hand, angrenzendes Trottoir), Tempo V_sig,
// Hindernisse, Längsneigung, Vorbelegung «Sicht beim Ausfahren», Anzeige und Bericht. Künstliche Strassen (keine echten Daten):
// Hauptstrasse West–Ost (y = 0, 50 km/h), Querweg mündet bei x = -40 von Süden ein (30 km/h); Trottoir 3 m beidseits.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import { osmParsen } from '../daten/osm'
import { avParsen, type GeoJson } from '../daten/av'
import { rechneFall } from '../rechner'
import { fallLesen, fallSchreiben, leererFall, rechnungsSchluessel, type Fall } from '../fall'
import { handSetzen } from '../bedarf/fallBedarf'
import { befundblaetter } from '../bedarf/befundblatt'
import { knotensichtAnfuegen, knotensichtTue, ksDatenAusRoh, zufahrtFinden, type Knotensicht, type KnotensichtAntwort } from './knotensicht'
import { HOEHEN_QUELLE } from '../knotensicht/rechner/neigung'
import { KnotensichtBericht, KnotensichtBlock } from './KnotensichtBlock'
import { BedarfAbschnitt } from '../BedarfPanel'
import { TUE_NUR_EINMUENDUNG } from '../texte'
import { kurzHinweis, KS_EINBAHN, KS_EINBAHN_VELO } from './kurztexte'
import { augePlausibel, augenNachVerschieben, tueFlaeche, tueMasse } from './karte'
import { streifenTitel } from '../benennung'
import { KS_DURCHGEHEND } from './kurztexte'
import { tueFahrzeuge } from '../fahrzeuge'
import { breiteVorbelegung, knotensichtGueltig, wartezeitSchaetzen } from './texte'
import { fahrbahnOeffnung } from '../bedarf/vorbelegung'

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
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={a} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}} />)))
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
    expect(k.neigungGemessen).toBe(false); expect(k.annahmeGrund).toEqual(['Tempo nach OSM', 'Längsneigung 0 % angenommen'])
    expect([k.zufahrtName, k.richtungen.map(r => r.strasse), k.richtungen.map(r => r.tempoHerkunft)]).toEqual(['Querweg', ['Hauptstrasse', 'Hauptstrasse'], ['osm', 'osm']])
    expect(k.karte.kanten).toHaveLength(2)
    expect(Object.keys(k.profile).sort()).toEqual(['links', 'rechts', 'trottoir', 'zufahrt'])
    expect(k.karte.dreiecke.map(d => d.art).sort()).toEqual(['auto', 'auto', 'trottoir', 'trottoir', 'velo', 'velo'])
    expect(k.hoehenSchluessel).toBe('11|2:0:1|3,00')
  })
  it('Breite von Hand (Bedarf «Breite der Trottoirüberfahrt») geht vor; ausserhalb 1 bis 8 m ohne Wirkung', () => {
    const mit = (w: number) => ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.breiteM': { wert: w, quelle: 'hand' } } } })).streifen[0].knotensicht)
    expect([mit(2.5).breite, mit(2.5).breiteQuelle]).toEqual([2.5, 'eingabe'])
    expect(mit(12).breiteQuelle).toBe('av_neben')
  })
  it('Längsneigung aus dem Höhenmodell: gemessen, keine Annahme mehr', () => {
    const m = { i: 0, quelle: `${HOEHEN_QUELLE}, Profil 50 m, 20 Punkte`, laenge: 50, punkte: 20, hinweis: null }
    const g = ks(rechnen(fallTue(), { hoehen: { [k.hoehenSchluessel]: { links: m, rechts: m, zufahrt: m, trottoir: m } } }).streifen[0].knotensicht)
    expect([g.neigungGemessen, g.annahmeGrund]).toEqual([true, ['Tempo nach OSM']])
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

describe('Knotensicht: Bäume, Seitenraum und Flächen (Plan) wie in der Sichtprüfung (Entscheid 23.10.2026)', () => {
  const PARK = (x: Fall) => x.hindernisse.push({ id: 'h1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-60, -4, -48, -1.8), quelle: 'hand' })
  const links = (f: Fall, rest: Partial<Rest> = {}) => ks(rechnen(f, rest).streifen[0].knotensicht).richtungen.find(r => r.richtung === 'links')!
  it('Bäume aus dem Baumkataster zählen sofort (Baumreihe links); verworfene nicht', () => {
    const baeume = { baeume: Array.from({ length: 21 }, (_, i) => ({ id: `b${i}`, p: lv(-70 + i, -3), name: 'Baum (Kataster)' })), quellenangabe: 'Baumkataster' }
    const ohne = links(fallTue()), mit = links(fallTue(), { baeume })
    expect(mit.auto!.ist).toBeLessThan(ohne.auto!.ist)
    const verworfen = links(fallTue(x => { for (const b of baeume.baeume) x.vorschlaege[b.id] = 'verworfen' }), { baeume })
    expect(verworfen.auto).toEqual(ohne.auto)
  })
  const sr = (standard: boolean) => (x: Fall) => {
    PARK(x)
    x.flaechenPlan = [{ id: 'plan-1', art: 'trottoir', ring: rechteck(-62, -4, -46, -1.6), ...(standard ? { standard: { typ: 'seitenraum' as const,
      gruppe: 'sr-1', tiefePark: 2.2, ueberstand: 0.2, breite: 16, randA: 0, randB: 0, parkQuelle: 'parkierung' as const, k: lv(-54, -4), balken: [1, 0] as P,
      tief: [0, 1] as P, kante: [-62, -46] as [number, number] } } : {}) }]
  }
  it('vorgezogener Seitenraum: Parkierung darunter entfällt; dieselbe Fläche ohne Kennzeichnung lässt sie stehen', () => {
    expect(links(fallTue(sr(false))).auto!.status).toBe('nicht_erfuellt')
    expect(links(fallTue(sr(true))).auto!.status).not.toBe('nicht_erfuellt')
  })
  it('Fläche (Plan) Trottoirnase wirkt auf die AV der Knotensicht', () => {
    const nase = (x: Fall) => { x.flaechenPlan = [{ id: 'plan-1', art: 'trottoir', ring: rechteck(-62, -4, -43, -1.6) }] }
    // Trottoirnase bis an die Einmündung: Fahrbahnrand am Knoten 2,4 m weiter innen, Fahrstreifenachse nach Norden verschoben
    const dreieck = (f: Fall) => ks(rechnen(f).streifen[0].knotensicht).karte.dreiecke.find(d => d.art === 'auto' && d.lage === 'links')!.frei
    const y = (f: Fall) => dreieck(f).filter(p => p[0] > O[0] - 58 && p[0] < O[0] - 50).map(p => p[1] - O[1])
    expect(Math.min(...y(fallTue(nase)))).toBeGreaterThan(Math.max(...y(fallTue())) + 1)
  })
})

describe('Knotensicht: Vorbelegung «Sicht beim Ausfahren», Handeingabe geht vor', () => {
  const blatt = (f: Fall, rest = {}) => befundblaetter(rechnen(f, rest), f, { vorgabe: { bern: false, kantonBE: false } })[0]
  it('beide Phasen erfüllt, Neigung bzw. Tempo nach OSM angenommen: ja mit Quelle Annahme; Tempo von Hand und Höhenmodell: Rechnung', () => {
    expect(blatt(fallTue()).vorbelegt.werte['q3.knotensichtOk']).toMatchObject({ wert: true, quelle: 'annahme' })
    const m = { i: 0, quelle: HOEHEN_QUELLE, laenge: 50, punkte: 20, hinweis: null }
    const mitTempo = (x: Fall) => { x.bedarf = { felder: { 'q3.vSigHaupt': { wert: 50, quelle: 'hand' } } } }
    const w = blatt(fallTue(mitTempo), { hoehen: { '11|2:0:1|3,00': { links: m, rechts: m, zufahrt: m, trottoir: m } } }).vorbelegt.werte['q3.knotensichtOk']
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
  const t = text(renderToStaticMarkup(<KnotensichtBlock ks={k} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}} />))
  it('Phasen je Richtung, Breite mit Herkunft, Frage statt Feldname; kein Link auf den SichtweitenCheck, keine Regelnummer allein', () => {
    for (const x of ['Knotensicht der Einbiegenden', 'Ausfahrt aus', 'aufs Trottoir', 'auf die Fahrbahn', 'von links', 'von rechts',
      'Breite 3,00 m, angrenzendes Trottoir nach AV', 'Wie breit ist die Überfahrt?', 'Längsneigung 0 % angenommen']) expect(t).toContain(x)
    expect(t).not.toContain('SichtweitenCheck ↗'); expect(t).not.toMatch(/\bQ3-\d+\b/); expect(t).not.toMatch(/ß/)
  })
  it('Hinweis zur Neigung nur ohne Höhenmodell', () => {
    const g = { ...k, neigungGemessen: true }
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={g} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}} />))).not.toContain('Längsneigung 0 % angenommen: Höhenmodell')
  })
  it('Bericht: Satz mit beiden Phasen, Tabelle, Herkunft der Rechnung', () => {
    const b = text(renderToStaticMarkup(<KnotensichtBericht ks={k} fgsId="hand-1" titel={x => x} />))
    expect(b).toContain('aufs Trottoir genügt, auf die Fahrbahn genügt'); expect(b).toContain('Rechnung nach SichtweitenCheck 0.6.0')
    expect(b).toContain('Sicht auf die Wartefläche gilt hier nicht')
  })
})

describe('Knotensicht: Korrekturen nach Review (S1–S3, K3, K4, K7)', () => {
  it('S1: AV-Ausschnitt reicht nicht: kurzer Hinweis je Richtung, Ergebnis unsicher, keine Vorbelegung', () => {
    const k = ks(rechnen(fallTue(), { avRadius: 30 }).streifen[0].knotensicht)
    expect(k.unklar.join(' ')).toContain('AV-Ausschnitt reicht nicht'); expect(k.ok).toBeNull()
    expect(k.richtungen.some(r => r.hinweise.fahrbahn.some(h => h.startsWith('AV-Ausschnitt reicht nicht')))).toBe(true)
    const b = befundblaetter(rechnen(fallTue(), { avRadius: 30 }), fallTue(), { vorgabe: { bern: false, kantonBE: false } })[0]
    expect(b.vorbelegt.werte['q3.knotensichtOk']).toBeUndefined(); expect(b.vorbelegt.feldHinweise?.['q3.knotensichtOk']).toContain('ohne eindeutiges Ergebnis')
  })
  it('S1: Höhenprofil uneben: Hinweis, unsicher; nicht verfügbar: Hinweis, 0 % als Annahme', () => {
    const uneben = { i: 1, quelle: HOEHEN_QUELLE, laenge: 50, punkte: 20, hinweis: 'Höhenprofil uneben (Streuung 0,5 m um die Ausgleichsgerade; Kuppe, Wanne, Brücke?): Längsneigung vor Ort bzw. von Hand prüfen.' }
    const ok = { ...uneben, i: 0, hinweis: null }
    const k = ks(rechnen(fallTue(), { hoehen: { '11|2:0:1|3,00': { links: uneben, rechts: ok, zufahrt: ok, trottoir: ok } } }).streifen[0].knotensicht)
    expect(k.ok).toBeNull(); expect(k.unklar[0]).toContain('Höhenprofil uneben')
    const weg = { i: null, quelle: `${HOEHEN_QUELLE} nicht verfügbar`, laenge: 0, punkte: 0, hinweis: 'Höhenmodell nicht verfügbar (x): Längsneigung 0 % angenommen, von Hand eingeben.' }
    const g = ks(rechnen(fallTue(), { hoehen: { '11|2:0:1|3,00': { links: weg, rechts: ok, zufahrt: ok, trottoir: ok } } }).streifen[0].knotensicht)
    expect(g.ok).toBe(true); expect(g.neigungGemessen).toBe(false)
    expect(g.richtungen[0].hinweise.fahrbahn).toContain('Höhenprofil nicht verfügbar: Längsneigung 0 % angenommen.')
    expect(JSON.stringify(g)).not.toContain('von Hand eingeben')
  })
  it('S2: Streifen über die durchgehende Strasse: Flag des Kerns, ein Hinweis, keine Vorbelegung', () => {
    const k = ks(rechnen(fallTue(() => {}, lv(-30, -6), lv(-30, 6))).streifen[0].knotensicht)
    expect([k.durchgehend, k.ok]).toEqual([true, null])
    expect(k.hinweise.filter(h => h.includes('durchgehende Strasse'))).toHaveLength(1)
  })
  it('S3: Teilstreifen einer Querung: einmal gerechnet, beide Teile tragen dasselbe Ergebnis', () => {
    const f = fallTue(x => {
      x.streifenHand = [{ id: 'hand-1', p0: lv(-44, -8), p1: lv(-41, -8), breite: 3, herkunft: 'gezeichnet' },
        { id: 'hand-2', p0: lv(-39, -8), p1: lv(-36, -8), breite: 3, herkunft: 'gezeichnet' }]
      x.streifen = { 'hand-1': { typ: 'trottoirueberfahrt' }, 'hand-2': { typ: 'trottoirueberfahrt' } }
    })
    const r = rechnen(f)
    expect(r.streifen[0].uebergangId).toBe(r.streifen[1].uebergangId)
    expect(r.streifen[0].knotensicht).toBe(r.streifen[1].knotensicht)
    const k = ks(r.streifen[0].knotensicht)
    expect(['hand-1', 'hand-2']).toContain(k.streifenId)
    const andere = k.streifenId === 'hand-1' ? 'hand-2' : 'hand-1'
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={k} fgsId={andere} titel={x => `Streifen ${x}`} lage={null} breiteHand={null}
      setzeBreite={() => {}} />))).toContain(`siehe Streifen ${k.streifenId}`)
  })
  it('S6: Tempo der Hauptstrasse von Hand (Bedarf) vor V_sig und OSM', () => {
    const k = ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.vSigHaupt': { wert: 40, quelle: 'hand' } } } })).streifen[0].knotensicht)
    expect(k.richtungen.map(r => [r.tempo, r.tempoHerkunft])).toEqual([[40, 'hand'], [40, 'hand']])
  })
  it('K3: «nein» aus einer Annahme löst die harte Regel nicht aus (Vorschlag bestätigen); aus der Rechnung schon', () => {
    const park = (x: Fall) => x.hindernisse.push({ id: 'h1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-60, -4, -48, -1.8), quelle: 'hand' })
    const bl = (f: Fall, rest: Partial<Rest> = {}) => befundblaetter(rechnen(f, rest), f, { vorgabe: { bern: false, kantonBE: false } })[0]
    const a = bl(fallTue(park))
    expect(a.vorbelegt.werte['q3.knotensichtOk']).toMatchObject({ wert: false, quelle: 'annahme' })
    const q = a.befund.alle.find(x => x.id === 'Q3-11')!
    expect([q.zustand, q.bestaetigen]).toEqual(['offen', true])
    const m = { i: 0, quelle: HOEHEN_QUELLE, laenge: 50, punkte: 20, hinweis: null }
    const f = fallTue(x => { park(x); x.bedarf = { felder: { 'q3.vSigHaupt': { wert: 50, quelle: 'hand' } } } })
    const r = bl(f, { hoehen: { '11|2:0:1|3,00': { links: m, rechts: m, zufahrt: m, trottoir: m } } })
    expect(r.vorbelegt.werte['q3.knotensichtOk']).toMatchObject({ wert: false, quelle: 'rechnung' })
    expect(r.befund.alle.find(x => x.id === 'Q3-11')?.zustand).toBe('verletzt')
  })
  it('K4/K7: Breite von Hand ausserhalb 1 bis 8 m: Hinweis; Texte ohne Armnummer, ohne doppelte Klammern, «mindestens … frei»', () => {
    const k = ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.breiteM': { wert: 12, quelle: 'hand' } } } })).streifen[0].knotensicht)
    const t = text(renderToStaticMarkup(<KnotensichtBlock ks={k} fgsId="hand-1" titel={x => x} lage="strecke" breiteHand={12} setzeBreite={() => {}} />))
    expect(t).toContain('Breite von Hand 12,00 m nicht verwendet'); expect(t).toContain('Ausfahrt aus Querweg')
    expect(t).toContain('mindestens 23 m frei, nötig 15 m')
    expect(t).not.toMatch(/\(\s*[^()]*\(/); expect(t).not.toMatch(/\b\d (Hauptstrasse|Querweg)/); expect(t).not.toMatch(/_link|genügt \(/)
    expect(t).not.toMatch(/im Panel|von Hand eingeben|bestätigte Vorschläge/)
    // ohne Einmündung: «nur an Einmündungen» nur einmal
    const o = text(renderToStaticMarkup(<KnotensichtBlock ks={{ fehler: 'x', ohneZufahrt: true }} fgsId="hand-1" titel={x => x} lage="strecke"
      breiteHand={null} setzeBreite={() => {}} />))
    expect(o.match(/nur an Einmündungen/g)).toHaveLength(1)
  })
})

describe('Knotensicht: Geometrie der Überfahrt wie im SichtweitenCheck (K1)', () => {
  // Querweg unter dem Winkel α zur Hauptstrasse; Fahrbahn 6 m (quer gemessen), Trottoir t m
  const schief = (alpha: number, t: number) => {
    const cot = 1 / Math.tan(alpha * Math.PI / 180), hw = 3 / Math.sin(alpha * Math.PI / 180)
    const xc = (y: number) => -40 - y * cot, xl = (y: number) => xc(y) - hw, xr = (y: number) => xc(y) + hw
    const osm = { elements: [
      weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
      weg(2, [[11, -40, 0], [20, xc(-200), -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
    const y1 = -4 - t
    const av: GeoJson = { features: [
      flaeche('Strasse_Weg', rechteck(-300, -4, 300, 4)),
      flaeche('Strasse_Weg', [lv(xl(-4), -4), lv(xr(-4), -4), lv(xr(-200), -200), lv(xl(-200), -200)]),
      flaeche('Trottoir', rechteck(-300, 4, 300, 4 + t)),
      flaeche('Trottoir', [lv(-300, y1), lv(xl(y1), y1), lv(xl(-4), -4), lv(-300, -4)]),
      flaeche('Trottoir', [lv(xr(-4), -4), lv(300, -4), lv(300, y1), lv(xr(y1), y1)])] }
    const y = -4 - t - 1
    const f = fallTue(() => {}, lv(xl(y) - 1, y), lv(xr(y) + 1, y))
    const r = rechneFall(osmParsen(osm), avParsen(av), [], null, f, null, null, null, null)
    knotensichtAnfuegen(r, { osm, av }, f, REST)
    return ks(r.streifen[0].knotensicht)
  }
  it('Breite aus dem angrenzenden Trottoir, begrenzt auf 2,00 bis 3,50 m', () => {
    expect([Math.round(schief(90, 1.5).breite * 100) / 100, schief(90, 1.5).breiteQuelle]).toEqual([2, 'av_neben'])
    expect(Math.round(schief(90, 4.5).breite * 100) / 100).toBe(3.5)
    expect(schief(90, 4.5).hinweise.join(' ')).toContain('Breite auf 3,50 m begrenzt')
  })
  it('Länge auf der Zufahrtsachse = Breite / sin α', () => {
    const k = schief(60, 3)
    const a = Math.min(k.einbiegewinkel, 180 - k.einbiegewinkel)
    expect(Math.abs(a - 60)).toBeLessThan(3)
    expect(k.laenge).toBeCloseTo(k.breite / Math.sin(k.einbiegewinkel * Math.PI / 180), 2)
  })
  it('Auge der Ausfahrenden (Trottoir) zur Gehlinie: entlang der Zufahrt 3,00 + 0,50 / sin α, rechtwinklig 3,50 m', () => {
    for (const alpha of [90, 60]) {
      const k = schief(alpha, 3)
      const D = k.karte.Dtrottoir!, gl = k.karte.dreiecke.filter(d => d.art === 'trottoir').map(d => d.frei.slice(1))
      // Lot von D' auf die Gehlinie (parallel zur Hauptstrasse) = (3,00 + 0,50 / sin α) · sin α, D' am Fahrersitz 0,50 m neben der
      // Zufahrtsachse (± 0,50 · cos α)
      const sa = Math.sin(k.einbiegewinkel * Math.PI / 180), ca = Math.abs(Math.cos(k.einbiegewinkel * Math.PI / 180))
      const ab = gl.map(pts => abstand(D, pts[0], pts[pts.length - 1]))
      for (const x of ab) expect(Math.abs(x - (3 + 0.5 / sa) * sa)).toBeLessThanOrEqual(0.5 * ca + 0.05)
      if (alpha === 90) for (const x of ab) expect(Math.abs(x - 3.5)).toBeLessThan(0.05)
    }
  })
})

/** Abstand des Punkts p von der Geraden durch a und b */
function abstand(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.hypot(dx, dy)
}

describe('Knotensicht: zweite Review (Einbahn, Veloachse, Handwerte)', () => {
  const mitQuerweg = (tags: Record<string, string>) => ({ elements: [OSM_ROH.elements[0],
    weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30', ...tags })] })
  const rechnenOsm = (osm: typeof OSM_ROH, f: Fall) => {
    const r = rechneFall(osmParsen(osm), avParsen(avRoh()), [], null, f, null, null, null, null)
    knotensichtAnfuegen(r, { osm, av: avRoh() }, f, REST)
    return ks(r.streifen[0].knotensicht)
  }
  it('Einbahn vom Knoten weg: niemand fährt aus, ein Hinweis, keine Vorbelegung', () => {
    const k = rechnenOsm(mitQuerweg({ oneway: 'yes' }), fallTue())
    expect(k.ok).toBeNull(); expect(k.hinweise.filter(h => h.includes('Einbahn vom Knoten weg'))).toEqual([KS_EINBAHN])
  })
  it('Einbahn mit Velo gegen die Einbahn: Sicht der Velofahrenden, Annahme richtig benannt', () => {
    const k = rechnenOsm(mitQuerweg({ oneway: 'yes', 'oneway:bicycle': 'no' }), fallTue())
    expect(k.hinweise).toContain(KS_EINBAHN_VELO); expect(k.unklar).not.toContain(KS_EINBAHN)
    expect(k.annahmen.join(' ')).toContain('Auge der Velofahrenden'); expect(k.annahmen.join(' ')).not.toContain('Fahrersitz')
  })
  it('Strasse in einer Kurve: kurzer Hinweis mit beiden Längen, ohne Ziffer', () => {
    expect(kurzHinweis('Trottoirüberfahrt: Strasse in einer Kurve, hinterer Rand auf der Zufahrtsachse nach dem Rand der Arme (3,10 m statt 2,40 m hinter der Bordkante).')?.text)
      .toBe('Rand der Hauptstrasse nicht gerade: hinterer Rand der Überfahrt auf der Ausfahrt 3,10 m hinter der Bordkante (bei geradem Rand 2,40 m).')
  })
  it('Kein Schnitt mit der Veloachse wird wie bei der Fahrlinie gezeigt', () => {
    expect(kurzHinweis('Kein Schnitt der Zufahrtsachse mit der Veloachse: Anfang als Lot vom Knoten.')?.text)
      .toBe('Kein Schnitt der Ausfahrt mit der Veloachse: Anfang der Sicht angenähert.')
  })
  it('Tempo bzw. Breite im Bedarf als Schätzung oder Annahme: zählt als Annahme (kein harter Befund ohne Bestätigung)', () => {
    const f = fallTue(x => { x.bedarf = { felder: { 'q3.vSigHaupt': { wert: 50, quelle: 'schaetzung' }, 'q3.breiteM': { wert: 2.5, quelle: 'annahme' } } } })
    const k = ks(rechnen(f).streifen[0].knotensicht)
    expect(k.richtungen.map(r => r.tempoHerkunft)).toEqual(['annahme', 'annahme'])
    expect(k.annahmeGrund).toEqual(expect.arrayContaining(['Breite angenommen', 'Tempo angenommen']))
    const h = ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.vSigHaupt': { wert: 50, quelle: 'hand' } } } })).streifen[0].knotensicht)
    expect(h.richtungen.map(r => r.tempoHerkunft)).toEqual(['hand', 'hand'])
  })
})

describe('Knotensicht: Streifen quer über die Hauptstrasse statt über die Seitenstrasse (27.10.2026)', () => {
  // schräg über die Hauptstrasse beim Knoten (wie Mittelstrasse/Länggassstrasse): schneidet die Hauptstrasse und den Querweg
  const ueber = fallTue(() => {}, lv(-50, 6), lv(-34, -9))
  const a = rechnen(ueber).streifen[0].knotensicht
  it('erkannt: Hinweis, keine Knotensicht (keine Fläche, keine Fahrzeuge, keine Masse)', () => {
    expect(a).toMatchObject({ ueberHauptstrasse: { haupt: 'Hauptstrasse', seite: 'Querweg' } })
    expect(a && 'fehler' in a && a.fehler).toBe('Die Überfahrt quert die Hauptstrasse; sie gehört quer über die Seitenstrasse (Querweg), beide Enden auf dem Trottoir der Hauptstrasse.')
    const s = { ...rechnen(ueber).streifen[0] }
    expect(tueFlaeche(s.knotensicht)).toBeNull()
    expect(tueMasse(s.knotensicht)).toBeNull()
    expect(tueFahrzeuge(s)).toEqual([])
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={a} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}} />)))
      .toContain('Die Überfahrt quert die Hauptstrasse')
  })
  it('Bedarf: «quert die Hauptstrasse» aus OSM, Überfahrt über die Hauptstrasse nicht zulässig (Muss)', () => {
    const b = befundblaetter(rechnen(ueber), ueber, { vorgabe: { bern: false, kantonBE: false }, geo: { osm: osmParsen(OSM_ROH), av: avParsen(avRoh()) } })[0]
    expect(b.gebildet.eingaben.q3.wert?.ueber).toBe('haupt')
    expect(b.gebildet.herkunft.get('q3.ueber')).toMatchObject({ zustand: 'vorbelegt', quelle: 'osm' })
    expect(b.befund.alle.find(x => x.id === 'Q3-5')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
  })
  it('über die Seitenstrasse: Knotensicht wie bisher; Fahrstreifen aus OSM am Knoten (Hauptstrasse lanes=2: 1 je Richtung)', () => {
    const k = ks(rechnen(fallTue()).streifen[0].knotensicht)
    expect('ueberHauptstrasse' in k).toBe(false)
    expect(k.fahrstreifen).toEqual({ seite: { n: 1, quelle: 'annahme', strasse: 'Querweg', tag: '' },
      haupt: { n: 1, quelle: 'annahme', strasse: 'Hauptstrasse', tag: '' } })
    const osm2 = { elements: OSM_ROH.elements.map(e => (e.id === 1 ? { ...e, tags: { ...e.tags, lanes: '2' } } : e)) }
    const f = fallTue()
    const r = rechneFall(osmParsen(osm2), avParsen(avRoh()), [], null, f, null, null, null, null)
    knotensichtAnfuegen(r, { osm: osm2, av: avRoh() }, f, REST)
    expect(ks(r.streifen[0].knotensicht).fahrstreifen?.haupt).toEqual({ n: 1, quelle: 'osm', strasse: 'Hauptstrasse', tag: 'lanes=2' })
    const b = befundblaetter(r, f, { vorgabe: { bern: false, kantonBE: false }, geo: { osm: osmParsen(osm2), av: avParsen(avRoh()) } })[0]
    expect(b.gebildet.herkunft.get('q3.nEinm')).toMatchObject({ zustand: 'vorbelegt', quelle: 'annahme' })
    expect(b.gebildet.eingaben.q3.wert).toMatchObject({ nEinm: 1, nHaupt: 1, ueber: 'einmuendend' })
  })
})

describe('Knotensicht: Auge von Hand und Planungstempo (27.10.2026)', () => {
  const k0 = ks(rechnen(fallTue()).streifen[0].knotensicht)
  const hand: P = lv(-41, -15)
  const mitAuge = fallTue(x => { x.streifen['hand-1'] = { ...x.streifen['hand-1'], tueD: hand } })
  const k1 = ks(rechnen(mitAuge).streifen[0].knotensicht)
  it('gezogenes Fahrzeug der Phase Fahrbahn: Feld gesetzt, an den Kern als D, Auge dort, Sichtdreiecke neu', () => {
    expect(k1.karte.D).toEqual(hand)
    expect(k1.karte.fahrzeuge!.find(f => f.phase === 'fahrbahn')).toMatchObject({ auge: hand, vonHand: true, ziehbar: true })
    expect(JSON.stringify(k1.karte.dreiecke)).not.toBe(JSON.stringify(k0.karte.dreiecke))
    expect(k1.annahmen.join(' ')).toContain('Auge der Ausfahrenden für die Fahrbahn von Hand')
    // Hinweis des Kerns (Auge zu nah bzw. weit) kurz im Block
    const nah = ks(rechnen(fallTue(x => { x.streifen['hand-1'] = { ...x.streifen['hand-1'], tueD: lv(-41, -6) } })).streifen[0].knotensicht)
    expect(nah.hinweise.join(' ')).toMatch(/Auge von Hand [\d,]+ m hinter dem vorderen Rand: weniger als/)
  })
  it('gezogenes Fahrzeug der Phase Trottoir: an den Kern als Dtrottoir, Auge dort, Sicht aufs Trottoir neu; Hinweis kurz', () => {
    const dt: P = lv(-41, -18)
    const t = ks(rechnen(fallTue(x => { x.streifen['hand-1'] = { ...x.streifen['hand-1'], tueDtrottoir: dt } })).streifen[0].knotensicht)
    expect(t.karte.Dtrottoir).toEqual(dt)
    expect(t.karte.fahrzeuge!.find(f => f.phase === 'trottoir')).toMatchObject({ auge: dt, vonHand: true, ziehbar: true })
    expect(JSON.stringify(t.karte.dreiecke.filter(d => d.art === 'trottoir'))).not.toBe(JSON.stringify(k0.karte.dreiecke.filter(d => d.art === 'trottoir')))
    const nah = ks(rechnen(fallTue(x => { x.streifen['hand-1'] = { ...x.streifen['hand-1'], tueDtrottoir: lv(-41, -8.5) } })).streifen[0].knotensicht)
    expect(nah.hinweise.join(' ')).toMatch(/Auge von Hand \(Trottoir\) [\d,]+ m hinter dem hinteren Rand: weniger als 3,00 m/)
  })
  it('zurücksetzen: ohne Feld wie gerechnet; Block mit «Auge von Hand» und «Standort zurücksetzen»', () => {
    const ohne = fallTue(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' } })
    expect(JSON.stringify(ks(rechnen(ohne).streifen[0].knotensicht).karte)).toBe(JSON.stringify(k0.karte))
    const html = text(renderToStaticMarkup(<KnotensichtBlock ks={k1} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}}
      augeVonHand={['fahrbahn']} augeZuruecksetzen={() => {}} />))
    expect(html).toContain('Auge von Hand Sicht auf die Fahrbahn')
    expect(html).toContain('Standort zurücksetzen')
  })
  it('Fall-Datei: Auge von Hand bleibt erhalten; ungültig mit Hinweis übergangen; Rechnungsschlüssel nur an der Trottoirüberfahrt', () => {
    const [f2, h] = fallLesen(fallSchreiben(mitAuge))
    expect(f2.streifen['hand-1'].tueD).toEqual(hand)
    expect(h).toEqual([])
    const kaputt = JSON.parse(fallSchreiben(mitAuge))
    kaputt.streifen['hand-1'].tueD = [1, 2]
    const [f3, h3] = fallLesen(JSON.stringify(kaputt))
    expect(f3.streifen['hand-1'].tueD).toBeUndefined()
    expect(h3.join(' ')).toContain('Auge von Hand ungültig')
    expect(rechnungsSchluessel(mitAuge)).not.toBe(rechnungsSchluessel(fallTue()))
    const fgs = (d?: P) => fallTue(x => { x.streifen['hand-1'] = d ? { tueD: d } : {} })
    expect(rechnungsSchluessel(fgs(hand))).toBe(rechnungsSchluessel(fgs()))
  })
  it('Block: «Sicht zeigen: beide | Fahrbahn | Trottoir», die gezeigte Phase gedrückt (wie auf der Karte)', () => {
    const html = renderToStaticMarkup(<KnotensichtBlock ks={k0} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}}
      phase="trottoir" setzePhase={() => {}} />)
    expect(text(html)).toContain('Sicht zeigen: beide Fahrbahn Trottoir')
    expect(html).toMatch(/aria-pressed="true" class="aktiv klein">Trottoir</)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
  })
  it('Planung: Tempo der Hauptstrasse im Block wählen → Bedarf von Hand → Knotensicht mit diesem Tempo', () => {
    let gesetzt: number | null = -1
    const html = renderToStaticMarkup(<KnotensichtBlock ks={k0} fgsId="hand-1" titel={x => x} lage={null} breiteHand={null} setzeBreite={() => {}}
      tempoHand={null} setzeTempo={v => { gesetzt = v }} />)
    expect(text(html)).toContain('Planung: Tempo der Hauptstrasse aus den Daten 20 km/h 30 km/h 40 km/h 50 km/h 60 km/h 80 km/h · jetzt 50 km/h (OSM)')
    void gesetzt
    const f = fallTue(x => { x.bedarf = handSetzen(x.bedarf, 'q3.vSigHaupt', 30, 'hand') })
    expect(f.bedarf?.felder['q3.vSigHaupt']).toEqual({ wert: 30, quelle: 'hand' })
    const k = ks(rechnen(f).streifen[0].knotensicht)
    expect(k.richtungen.map(r => [r.tempo, r.tempoHerkunft])).toEqual([[30, 'hand'], [30, 'hand']])
  })
})

describe('Knotensicht: Winkel, Breite, Länge des überfahrbaren Rands und Wartezeit als Vorbelegung (27.10.2026)', () => {
  const BEREICH = { mitte: lv(-40, -4), radiusM: 150, form: 'quadrat' as const }
  const blatt = (f: Fall, geo = {}) => befundblaetter(rechnen(f), f, { vorgabe: { bern: false, kantonBE: false }, geo })[0]
  const w = blatt(fallTue()).vorbelegt.werte
  it('Winkel aus der Knotensicht (Quelle Rechnung)', () => {
    expect(w['q3.winkel']).toMatchObject({ wert: 90, quelle: 'rechnung' })
    expect(w['q3.winkel']!.text).toBe('Winkel der Seitenstrasse zur Hauptstrasse aus dem OSM-Netz an der Einmündung, 90°')
  })
  it('Breite: Band der Knotensicht (Rechnung) mit den AV-Breiten; von Hand: keine Vorbelegung, die Eingabe geht vor', () => {
    expect(w['q3.breiteM']).toMatchObject({ wert: 3, quelle: 'rechnung',
      text: 'schmaleres angrenzendes Trottoir 3,00 m, nach VSS 40 242 Z. 16 auf 2,00–3,50 m begrenzt' })
    const hand = blatt(fallTue(x => { x.bedarf = { felder: { 'q3.breiteM': { wert: 2.5, quelle: 'hand' } } } }))
    expect(hand.vorbelegt.werte['q3.breiteM']).toBeUndefined()
    expect(hand.gebildet.eingaben.q3.wert?.breiteM).toBe(2.5)
  })
  it('Breite: keine Rückkopplung – ein Wert mit Quelle Rechnung im Fall ist keine Eingabe der Knotensicht', () => {
    const r = ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.breiteM': { wert: 2.2, quelle: 'rechnung' } } } })).streifen[0].knotensicht)
    expect([Math.round(r.breite * 100) / 100, r.breiteQuelle]).toEqual([3, 'av_neben'])
    const a = ks(rechnen(fallTue(x => { x.bedarf = { felder: { 'q3.breiteM': { wert: 2.2, quelle: 'annahme' } } } })).streifen[0].knotensicht)
    expect([a.breite, a.breiteQuelle, a.annahmeGrund.includes('Breite angenommen')]).toEqual([2.2, 'eingabe', true])
  })
  it('Breite aus Annahme bzw. AV quer: eigene Texte und Quellen', () => {
    const k0 = ks(rechnen(fallTue()).streifen[0].knotensicht)
    expect(breiteVorbelegung({ ...k0, breite: 2, breiteQuelle: 'annahme' })).toMatchObject({ wert: 2, quelle: 'annahme', text: expect.stringMatching(/^Annahme 2,00 m/) })
    expect(breiteVorbelegung({ ...k0, breite: 2.6, breiteQuelle: 'av_quer' })).toMatchObject({ wert: 2.6, quelle: 'rechnung' })
    expect(breiteVorbelegung({ ...k0, breiteQuelle: 'eingabe' })).toBeNull()
  })
  it('Länge des überfahrbaren Rands: Fahrbahnöffnung an der Bordkante (AV mit Flächen (Plan)); ohne AV keine Vorbelegung', () => {
    // Mündung des Querwegs in der AV: x = -43 bis -37 (6 m)
    const mitAv = blatt(fallTue(), { av: avParsen(avRoh()) }).vorbelegt
    expect(mitAv.werte['q3.ueberfahrbarM']).toMatchObject({ wert: 6, quelle: 'rechnung',
      text: 'Fahrbahnöffnung an der Bordkante der Hauptstrasse: 6,0 m (AV mit Flächen (Plan))' })
    expect(w['q3.ueberfahrbarM']).toBeUndefined()
    // breite Mündung (20 m) und Streifen 24 m: 20 m; Plan-Trottoir über 10 m der Mündung: 10 m
    const breit = (): GeoJson => ({ features: [
      flaeche('Strasse_Weg', [lv(-300, -4), lv(-50, -4), lv(-50, -200), lv(-30, -200), lv(-30, -4), lv(300, -4), lv(300, 4), lv(-300, 4)]),
      flaeche('Trottoir', rechteck(-300, 4, 300, 7)), flaeche('Trottoir', rechteck(-300, -7, -50, -4)), flaeche('Trottoir', rechteck(-30, -7, 300, -4))] })
    const b = (plan: boolean) => {
      const f = fallTue(x => { if (plan) x.flaechenPlan = [{ id: 'plan-1', art: 'trottoir', ring: rechteck(-50.5, -12, -40, -4) }] }, lv(-52, -9), lv(-28, -9))
      return befundblaetter(rechnen(f, {}, breit()), f, { vorgabe: { bern: false, kantonBE: false }, geo: { av: avParsen(breit()) } })[0].vorbelegt.werte['q3.ueberfahrbarM']
    }
    expect(b(false)?.wert).toBe(20)
    expect(b(true)?.wert).toBe(10)
  })
  it('Fahrbahnöffnung: nur Strasse_Weg zählt (Insel bzw. Trottoir auf der Linie nicht); ohne Fahrbahn offen mit Hinweis', () => {
    const av = avParsen({ features: [flaeche('Strasse_Weg', rechteck(0, 0, 10, 2)), flaeche('Verkehrsinsel', rechteck(4, 0, 6, 2))] })
    expect(fahrbahnOeffnung([lv(-5, 1), lv(15, 1)], av)).toBeCloseTo(10, 1)
    expect(fahrbahnOeffnung([lv(-5, 5), lv(15, 5)], av)).toBe(0)
  })
  it('ohne gültige Knotensicht (durchgehende Strasse bzw. Fehler): keine Vorbelegung', () => {
    const k0 = ks(rechnen(fallTue()).streifen[0].knotensicht)
    expect(knotensichtGueltig([{ ...k0, durchgehend: true }])).toBeNull()
    expect(knotensichtGueltig([{ fehler: 'x' }])).toBeNull()
    expect(knotensichtGueltig([k0])).toBe(k0)
  })
  it('Panel: vorbelegte Angaben sichtbar im Thema (nicht in «Weitere Angaben» eingeklappt), mit Sprungziel', () => {
    const f = fallTue()
    const html = renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[blatt(f, { av: avParsen(avRoh()) })]} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />)
    const vor = html.indexOf('<div class="thema-vorbelegt">'), weitere = html.indexOf('<details class="thema-angaben">', vor)
    expect(vor).toBeGreaterThan(0)
    for (const p of ['q3-winkel', 'q3-breiteM', 'q3-ueberfahrbarM']) {
      const i = html.indexOf(`id="feld-${p}"`)
      expect(i, p).toBeGreaterThan(vor); if (weitere > 0) expect(i, p).toBeLessThan(weitere)
    }
  })
  it('Wartezeit: Zeitlückenmodell bei DTV 5000 und 15 000', () => {
    // q = 0,1·DTV Fz/h; C = q·e^(−q·6/3600) / (1 − e^(−q·3/3600)); d = 3600/C
    const d = (dtv: number) => { const q = 0.1 * dtv; return 3600 / (q * Math.exp(-q * 6 / 3600) / (1 - Math.exp(-q * 3 / 3600))) }
    expect(wartezeitSchaetzen(5000)).toBeCloseTo(d(5000), 9); expect(wartezeitSchaetzen(5000)).toBeCloseTo(5.65, 2)
    expect(wartezeitSchaetzen(15000)).toBeCloseTo(d(15000), 9); expect(wartezeitSchaetzen(15000)).toBeCloseTo(20.86, 2)
    expect(wartezeitSchaetzen(0)).toBe(3)
  })
  it('Wartezeit aus dem DTV der Hauptstrasse (Annahme); die Linie der Seitenstrasse zählt nicht; ohne Verkehrszahlen offen mit Hinweis', () => {
    const linie = (id: string, strasse: string, dtv: number | null, teile: P[][]) => ({ id, strasse, dtv, stand: '21.11.2025', teile })
    const haupt = linie('h', 'Hauptstrasse', 15000, [[lv(-300, 0), lv(300, 0)]]), seite = linie('s', 'Querweg', 30000, [[lv(-40, 0), lv(-40, -200)]])
    const b = blatt(fallTue(), { verkehrsdaten: { linien: [haupt, seite], bereich: BEREICH } })
    expect(b.vorbelegt.werte['q3.wartezeitEinmS']).toMatchObject({ wert: 21, quelle: 'annahme' })
    expect(b.vorbelegt.werte['q3.wartezeitEinmS']!.text).toBe('geschätzt aus DTV 15 000 der Hauptstrasse (Hauptstrasse, Geoportal Stadt Bern, ' +
      'Stand 21.11.2025; Spitzenstunde 10 %, Zeitlückenmodell tc 6 s, tf 3 s): ca. 21 s')
    const ohne = blatt(fallTue(), { verkehrsdaten: { linien: [seite], bereich: BEREICH } })
    expect(ohne.vorbelegt.werte['q3.wartezeitEinmS']).toBeUndefined()
    expect(ohne.vorbelegt.feldHinweise?.['q3.wartezeitEinmS']).toBe('ohne Verkehrszahlen nicht schätzbar')
    expect(blatt(fallTue()).vorbelegt.feldHinweise?.['q3.wartezeitEinmS']).toBe('ohne Verkehrszahlen nicht schätzbar')
    // gemessener Wert von Hand geht vor
    const hand = blatt(fallTue(x => { x.bedarf = { felder: { 'q3.wartezeitEinmS': { wert: 40, quelle: 'hand' } } } }),
      { verkehrsdaten: { linien: [haupt, seite], bereich: BEREICH } })
    expect(hand.gebildet.eingaben.q3.wert?.wartezeitEinmS).toBe(40)
  })
})

describe('Überfahrt verschieben und benennen (27.10.2026)', () => {
  const s = { p0: lv(-44, -8), p1: lv(-36, -8) }
  it('Auge von Hand bleibt, solange es zur verschobenen Überfahrt passt; sonst entfällt es (Phase genannt)', () => {
    expect(augePlausibel(lv(-38.5, -4), s)).toBe(true)
    expect(augePlausibel(lv(-60, -4), s)).toBe(false)       // seitlich ausserhalb der Überfahrt
    expect(augePlausibel(lv(-40, -30), s)).toBe(false)      // zu weit weg
    const e = { typ: 'trottoirueberfahrt' as const, tueD: lv(-38.5, -4), tueDtrottoir: lv(-38.5, -10) }
    expect(augenNachVerschieben(e, s)).toEqual({ e, zurueck: [] })
    const weit = augenNachVerschieben(e, { p0: lv(-90, -8), p1: lv(-82, -8) })
    expect(weit.zurueck).toEqual(['Fahrbahn', 'Trottoir'])
    expect(weit.e).toEqual({ typ: 'trottoirueberfahrt' })
  })
  it('Name: «Trottoirüberfahrt 1» statt «Streifen 1»; eigener Name bleibt; Fussgängerstreifen unverändert', () => {
    expect(streifenTitel('hand-1', [], true)).toBe('Trottoirüberfahrt 1')
    expect(streifenTitel('hand-1')).toBe('Streifen 1')
    expect(streifenTitel('hand-1', [{ id: 'hand-1', p0: s.p0, p1: s.p1, breite: 4, herkunft: 'gezeichnet', name: 'Mittelstrasse' }], true)).toBe('Mittelstrasse')
  })
  it('Bericht und Block der Knotensicht ohne «Streifen» bei der Überfahrt', () => {
    const f = fallTue()
    const html = text(renderToStaticMarkup(<KnotensichtBericht ks={{ fehler: 'x', ohneZufahrt: true }} fgsId="hand-1" titel={x => x} />))
    expect(html).toContain('die Überfahrt quert keine Einmündung'); expect(html).not.toMatch(/Streifen/)
    const k = ks(rechnen(f).streifen[0].knotensicht)
    expect(text(renderToStaticMarkup(<KnotensichtBlock ks={{ ...k, durchgehend: true, unklar: [KS_DURCHGEHEND] }} fgsId="hand-1" titel={x => x}
      lage={null} breiteHand={null} setzeBreite={() => {}} />))).not.toMatch(/Der Streifen/)
  })
})
