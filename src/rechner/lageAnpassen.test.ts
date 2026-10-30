// Tests «Lage der Querung anpassen» (Nutzerentscheid 30.10.2026): die Lage einer bestehenden Querung lässt sich als Streifen von Hand
// verschieben, ohne dass Querungsart, Bestand, Lichtsignal und Name sich ändern (StreifenHand.bestand). Wer einen geplanten
// Fussgängerstreifen will, wählt ihn unter «Querung». Künstliche Strassen (keine echten Daten).
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall, type FallRechnung } from './index'
import { leererFall, fallLesen, fallSchreiben, fallVersion, ohneUebergang, streifenUebernehmen, streifenHandTeilen, streifenHerkunftText,
  type Fall } from '../fall'
import { befundblaetter } from '../bedarf/befundblatt'
import { zusammenfassung, zfEingabeBlatt } from '../bedarf/zusammenfassung'
import { streifenArt, streifenTitel, streifenKurz } from '../benennung'
import { planungHinweis, querungAnnahmeHinweis } from '../daten/osm'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1), lv(x0, y0)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [ring] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const UNMARKIERT = { highway: 'crossing', crossing: 'unmarked' }
const ZEBRA = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }
const LSA = { highway: 'crossing', crossing: 'traffic_signals' }
const STRASSE = { highway: 'residential', maxspeed: '30' }
const LIVING = { highway: 'living_street', maxspeed: '20' }
/** gerade Strasse West–Ost (Fahrbahn 8 m), Übergang 12 bei x = 0 */
const osm = (tags: Record<string, string> = STRASSE, uTags: Record<string, string> = UNMARKIERT): OsmDaten => ({
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { name: 'Hofgasse', ...tags })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: uTags, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
})
const AV = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}, mk: Fall['ort']['markierung'] = 'unmarkiert'): Fall => {
  const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); x.ort.markierung = mk; f(x); return x
}
const OHNE = { vorgabe: { bern: false, kantonBE: false } }
const typ = (r: FallRechnung) => r.streifen.map(s => s.querung?.typ ?? 'fgs')

/** «Lage der Querung anpassen» (bestand = true) bzw. wie bis 30.10.2026 übernehmen (false), danach die Enden um dx entlang der Strasse
 * verschoben (wie auf der Karte gezogen: «angepasst») */
function anpassen(o: OsmDaten, f: Fall, dx: number, bestand = true): { r0: FallRechnung; f: Fall } {
  const r0 = rechneFall(o, AV, [], 12, f, null)
  streifenUebernehmen(f, r0.streifen, r0.streifen, 'osm', r0.inseln, bestand)
  for (const h of f.streifenHand) { h.p0 = [h.p0[0] + dx, h.p0[1]]; h.p1 = [h.p1[0] + dx, h.p1[1]]; h.angepasst = true }
  return { r0, f }
}
const blatt = (r: FallRechnung, f: Fall, o: OsmDaten) =>
  befundblaetter(r, f, { ...OHNE, geo: { osmTags: new Map(o.wege.map(x => [x.id, x.tags])) } })[0]
const antwort = (r: FallRechnung, f: Fall, o: OsmDaten) => zusammenfassung({ ...zfEingabeBlatt(blatt(r, f, o), 'panel'), imBlock: [] }).antwort

describe('Lage der Querung anpassen: unmarkierte OSM-Querung bleibt ohne Vortritt und bestehend', () => {
  const o = osm()
  const { r0, f } = anpassen(o, fallMit(), 5)
  const r = rechneFall(o, AV, [], 12, f, null)
  it('Querungsart: Annahme ohne Vortritt wie vor dem Anpassen, mit demselben Hinweis (kein Planungs-Hinweis)', () => {
    expect(typ(r0)).toEqual(['ohne_vortritt'])
    expect(f.streifenHand.map(h => [h.id, h.bestand, h.herkunft])).toEqual([['hand-1', '12', 'osm']])
    expect(r.streifenQuelle).toBe('hand')
    expect(typ(r)).toEqual(['ohne_vortritt'])
    expect(r.streifen[0].querungAnnahme).toBe(querungAnnahmeHinweis('unmarkiert', UNMARKIERT, false))
    expect(r.streifen[0].querungAnnahme).toBe(r0.streifen[0].querungAnnahme)
    expect(r.hinweis).toBe(r0.hinweis)
    expect(r.hinweis).not.toBe(planungHinweis('unmarkiert', UNMARKIERT))
    // gleiche Strasse 5 m daneben: gleiche Sichtweiten nach der Querung ohne Vortritt
    expect(r.streifen[0].zufahrten.map(z => z.sichtweite)).toEqual(r0.streifen[0].zufahrten.map(z => z.sichtweite))
  })
  it('Herkunft «Lage von Hand angepasst» in der Annahme; die App sucht die AV-Bordkanten an der neuen Lage', () => {
    expect(r.streifen[0].annahmen[0]).toBe('Lage und Breite von Hand: bestehende Querung (aus OSM und AV), Lage von Hand angepasst; ' +
      'Querungsart und Bestand wie die Querung (nicht neu aus OSM bzw. Luftbild).')
    expect(r.streifen[0].randQuelle).toBe('AV')
    expect(r.streifen[0].vermassung).toBeDefined()
    expect(streifenHerkunftText({ ...f.streifenHand[0], angepasst: undefined }))
      .toBe('bestehende Querung (aus OSM und AV), Lage zum Anpassen übernommen (Enden noch nicht verschoben)')
  })
  it('Name «Querung 12» mit Strasse wie vor dem Anpassen', () => {
    const s = r.streifen[0]
    expect(streifenTitel(s.fgsId, f.streifenHand, streifenArt(s))).toBe('Querung 12')
    expect(streifenTitel(r0.streifen[0].fgsId, [], streifenArt(r0.streifen[0]))).toBe('Querung 12')
    expect(s.strasse).toBe('Hofgasse')
  })
  it('Bedarf: Querungstyp Annahme ohne Vortritt, Bestand (keine neue Anlage), «bestehende» in der Zusammenfassung', () => {
    const b = blatt(r, f, o)
    expect(b.vorbelegt.werte.typ).toMatchObject({ wert: 'ohne_vortritt', quelle: 'annahme' })
    expect(b.vorbelegt.werte.neuanlage).toMatchObject({ wert: false, quelle: 'rechnung',
      text: 'Streifen aus OSM und AV bzw. Luftbild erkannt: Bestand; Lage der Querung von Hand angepasst' })
    expect(antwort(r, f, o)).toMatch(/Beurteilt wird die bestehende Querung ohne Vortritt/)
    expect(antwort(r0, fallMit(), o)).toMatch(/Beurteilt wird die bestehende Querung ohne Vortritt/)
  })
  it('bisher (ohne Kennung der Querung, z. B. alte Fall-Datei): geplanter Fussgängerstreifen wie bis anhin', () => {
    const { f: g } = anpassen(o, fallMit(), 5, false)
    const q = rechneFall(o, AV, [], 12, g, null)
    expect(g.streifenHand[0].bestand).toBeUndefined()
    expect(typ(q)).toEqual(['fgs'])
    expect(q.hinweis).toBe(planungHinweis('unmarkiert', UNMARKIERT))
    expect(streifenTitel(q.streifen[0].fgsId, g.streifenHand, streifenArt(q.streifen[0]))).toBe('Streifen 1')
    expect(blatt(q, g, o).vorbelegt.werte.neuanlage).toMatchObject({ wert: true, quelle: 'annahme' })
  })
  it('Umschalten: unter «Querung» «Fussgängerstreifen (geplant bzw. zu prüfen)» macht daraus einen geplanten Fussgängerstreifen', () => {
    const g = structuredClone(f)
    g.streifen['hand-1'] = { typ: 'fgs' }
    const q = rechneFall(o, AV, [], 12, g, null)
    expect(typ(q)).toEqual(['fgs'])
    expect(q.streifen[0].querungAnnahme).toBeUndefined()
    expect(q.streifen[0].zufahrten.map(z => z.sichtweiteQuelle)).toEqual(['VSS Tab. 1', 'VSS Tab. 1'])
    expect(q.hinweis).toBe(planungHinweis('unmarkiert', UNMARKIERT))
    expect(streifenTitel(q.streifen[0].fgsId, g.streifenHand, streifenArt(q.streifen[0]))).toBe('Streifen 12')
    expect(blatt(q, g, o).vorbelegt.werte.neuanlage).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(antwort(q, g, o)).not.toMatch(/bestehende Querung ohne Vortritt/)
  })
})

describe('Lage der Querung anpassen: übrige Querungsarten bleiben', () => {
  it('Begegnungszone: bleibt Querung in der Begegnungszone (Annahme mit Hinweis)', () => {
    const o = osm(LIVING)
    const { r0, f } = anpassen(o, fallMit(), 4)
    const r = rechneFall(o, AV, [], 12, f, null)
    expect([typ(r0), typ(r)]).toEqual([['begegnungszone'], ['begegnungszone']])
    expect(r.streifen[0].querungAnnahme).toBe(r0.streifen[0].querungAnnahme)
    expect(r.streifen[0].zufahrten.map(z => z.sichtweite)).toEqual(r0.streifen[0].zufahrten.map(z => z.sichtweite))
    expect(streifenTitel('hand-1', f.streifenHand, streifenArt(r.streifen[0]))).toBe('Querung 12')
  })
  it('gewählte Furt: die Wahl geht mit an den Streifen von Hand und bleibt (keine Annahme)', () => {
    const o = osm()
    const { f } = anpassen(o, fallMit(x => { x.streifen['12'] = { typ: 'furt' } }), 3)
    expect(f.streifen).toEqual({ 'hand-1': { typ: 'furt' } })
    const r = rechneFall(o, AV, [], 12, f, null)
    expect(typ(r)).toEqual(['furt'])
    expect(r.streifen[0].querungAnnahme).toBeUndefined()
  })
  it('markierter Fussgängerstreifen: bleibt bestehender Fussgängerstreifen «Streifen 12»; Fall-Version unverändert', () => {
    const o = osm(STRASSE, ZEBRA)
    const { r0, f } = anpassen(o, fallMit(() => {}, 'markiert'), 5)
    const r = rechneFall(o, AV, [], 12, f, null)
    expect([typ(r0), typ(r)]).toEqual([['fgs'], ['fgs']])
    expect(r.streifen[0].zufahrten.map(z => z.sichtweite)).toEqual(r0.streifen[0].zufahrten.map(z => z.sichtweite))
    expect(streifenTitel('hand-1', f.streifenHand, streifenArt(r.streifen[0]))).toBe('Streifen 12')
    expect(blatt(r, f, o).vorbelegt.werte.neuanlage).toMatchObject({ wert: false, quelle: 'osm',
      text: 'bestehender Übergang (OSM mit Markierung bzw. Lichtsignal); Lage der Querung von Hand angepasst' })
    expect(fallVersion(f)).toBe(1)
  })
  it('Lichtsignal: das Lichtsignal des Übergangs bleibt, auch weiter als 6 m vom Knoten (ohne Kennung nicht)', () => {
    const o = osm(STRASSE, LSA)
    const { r0, f } = anpassen(o, fallMit(() => {}, 'lsa'), 10)
    const r = rechneFall(o, AV, [], 12, f, null)
    expect([r0.streifen[0].lsa, r0.streifen[0].lsaQuelle]).toEqual(['ja', 'OSM Knoten 12'])
    expect([r.streifen[0].lsa, r.streifen[0].lsaQuelle]).toEqual(['ja', 'OSM Knoten 12'])
    expect(blatt(r, f, o).vorbelegt.werte.typ).toMatchObject({ wert: 'lsa' })
    const { f: g } = anpassen(o, fallMit(() => {}, 'lsa'), 10, false)
    expect(rechneFall(o, AV, [], 12, g, null).streifen[0].lsa).toBe('nein')
    // Lichtsignal von Hand geht vor
    f.streifen['hand-1'] = { lsa: 'nein' }
    expect(rechneFall(o, AV, [], 12, f, null).streifen[0].lsa).toBe('nein')
  })
})

describe('Lage der Querung anpassen: Fall-Datei und Namen', () => {
  const o = osm()
  const { f } = anpassen(o, fallMit(), 5)
  it('neu: Kennung bleibt beim Schreiben und Lesen; Version 5 an einer Querung ohne Fussgängerstreifen', () => {
    expect(fallVersion(f)).toBe(5)
    const t = fallSchreiben(f)
    expect(JSON.parse(t).version).toBe(5)
    expect(JSON.parse(t).streifenHand[0].bestand).toBe('12')
    const [g, h] = fallLesen(t)
    expect(h).toEqual([])
    expect(g.streifenHand).toEqual(f.streifenHand)
    expect(typ(rechneFall(o, AV, [], 12, g, null))).toEqual(['ohne_vortritt'])
  })
  it('alt: ohne Feld wie bisher (Version 1, geplanter Fussgängerstreifen); ungültige Kennung bzw. ohne Übergang übergangen', () => {
    const roh = JSON.parse(fallSchreiben(f))
    delete roh.streifenHand[0].bestand; roh.version = 1
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(h).toEqual([])
    expect(g.streifenHand[0].bestand).toBeUndefined()
    expect(fallVersion(g)).toBe(1)
    expect(typ(rechneFall(o, AV, [], 12, g, null))).toEqual(['fgs'])
    const [u, hu] = fallLesen(JSON.stringify({ ...roh, version: 5, streifenHand: [{ ...roh.streifenHand[0], bestand: 'Hofgasse' }] }))
    expect(u.streifenHand[0].bestand).toBeUndefined()
    expect(hu).toEqual(['Kennung der bestehenden Querung am Streifen von Hand hand-1 ungültig, übergangen (gilt als Streifen von Hand ohne Querung)'])
    const [n] = fallLesen(JSON.stringify({ ...roh, version: 5, ort: { ...roh.ort, uebergang: null }, streifenHand: [{ ...roh.streifenHand[0], bestand: '12' }] }))
    expect(n.streifenHand[0].bestand).toBeUndefined()
    // ohne Übergang (Fall an den Streifen verlegt): keine bestehende Querung mehr
    expect(ohneUebergang(f).streifenHand[0].bestand).toBeUndefined()
    expect(f.streifenHand[0].bestand).toBe('12')
  })
  it('Namen: Kennung der Querung statt Nummer, eigener Name geht vor; Teilen an einer Mittelinsel: «-1» und «-2»', () => {
    expect(streifenTitel('hand-1', f.streifenHand, 'querung')).toBe('Querung 12')
    expect(streifenKurz('hand-1', f.streifenHand)).toBe('12')
    expect(streifenTitel('hand-1', [{ ...f.streifenHand[0], name: 'Nord' }], 'querung')).toBe('Nord')
    expect(streifenTitel('hand-1', [{ ...f.streifenHand[0], bestand: '-5' }], 'fgs')).toBe('Streifen Luftbild')
    const g = structuredClone(f), h = g.streifenHand[0]
    const m: P = [(h.p0[0] + h.p1[0]) / 2, (h.p0[1] + h.p1[1]) / 2]
    const t = streifenHandTeilen(g, 'hand-1', [[h.p0, [m[0], m[1] - 1]], [[m[0], m[1] + 1], h.p1]], () => 2)!
    expect(g.streifenHand.map(x => [x.id, x.bestand])).toEqual([['hand-1', '12-1'], [t.neuId, '12-2']])
    expect(streifenTitel(t.neuId, g.streifenHand, 'querung')).toBe('Querung 12-2')
  })
})
