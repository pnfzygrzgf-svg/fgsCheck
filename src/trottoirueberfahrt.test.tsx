// Tests Trottoirüberfahrt am Streifen (23.10.2026): Wahl «Querung» = Trottoirüberfahrt setzt den Querungstyp im Bedarf, der Streifen
// wird wie «kein FGS» angezeigt (keine Sicht auf die Wartefläche, keine Richtungsliste), seine Zufahrten dienen nur der Vorbelegung;
// andere Streifen bleiben unverändert; Fall-Datei alt/neu;
// Block «Knotensicht» (Rechnung in tue/knotensicht.test.tsx). Künstliche Strassen (keine echten Daten): Hauptstrasse West–Ost, Querweg mündet bei x = -40 ein.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import { rechneFall, type FallRechnung } from './rechner'
import { inselLage, inselMasse, inselFlaechen, streifenTeilen, E1_TIEFE_M, E1_BREITE_M, E1_FURT_M } from './rechner/standardinsel'
import { leererFall, fallLesen, fallSchreiben, fallVersion, type Fall } from './fall'
import { befundblaetter } from './bedarf/befundblatt'
import { TUE_WAHL_TEXT, streifenTyp } from './bedarf/vorbelegung'
import { KnotensichtBlock } from './tue/KnotensichtBlock'
import { streifenStatus } from './texte'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
    weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'yes' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [
  { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: null, ringe: [[lv(-300, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), lv(-37, -4),
    lv(300, -4), lv(300, 4), lv(-300, 4), lv(-300, -4)]] },
  av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, -43, -4)), av('Trottoir', rechteck(-37, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
/** Streifen von Hand über den Querweg (Einmündung), 8 m vor der Hauptstrasse */
const ueberQuerweg = (f: (x: Fall) => void = () => {}) => fallMit(x => {
  x.streifenHand.push({ id: 'hand-1', p0: lv(-44, -8), p1: lv(-36, -8), breite: 3, herkunft: 'gezeichnet' })
  f(x)
})
const OHNE = { vorgabe: { bern: false, kantonBE: false } }
const ohneMs = (r: FallRechnung) => { const { ms: _m, ...rest } = r; void _m; return JSON.stringify(rest) }

describe('Trottoirüberfahrt: Sichtprüfung entfällt (Anzeige wie «kein FGS»), Zufahrten nur für die Vorbelegung', () => {
  const fgs = rechneFall(OSM, AV, [], 12, ueberQuerweg(), null)
  const tue = rechneFall(OSM, AV, [], 12, ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' } }), null)
  const kein = rechneFall(OSM, AV, [], 12, ueberQuerweg(x => { x.streifen['hand-1'] = { keinFgs: true } }), null)
  it('als Fussgängerstreifen geprüft; als Trottoirüberfahrt: Status kein_fgs, keine Zufahrt und keine Richtungsliste, gekennzeichnet', () => {
    expect(fgs.streifen[0].zufahrten.length).toBeGreaterThan(0); expect(fgs.streifen[0].entfallen.length).toBeGreaterThan(0)
    const s = tue.streifen[0]
    expect([s.status, s.zufahrten.length, s.entfallen.length, s.querung, s.trottoirueberfahrt, s.keinFgsHinweis])
      .toEqual(['kein_fgs', 0, 0, undefined, true, undefined])
    expect(streifenStatus(s)).toBe('Trottoirüberfahrt'); expect(streifenTyp(s)).toBe('trottoirueberfahrt')
  })
  it('Zufahrten und Richtungen der Rechnung wie beim Fussgängerstreifen, abgelegt nur für die Vorbelegung; «kein FGS» geht vor', () => {
    expect(JSON.stringify(tue.streifen[0].nurVorbelegung)).toBe(JSON.stringify({ zufahrten: fgs.streifen[0].zufahrten, entfallen: fgs.streifen[0].entfallen }))
    expect(kein.streifen[0].nurVorbelegung).toBeUndefined()
    const beide = rechneFall(OSM, AV, [], 12, ueberQuerweg(x => { x.streifen['hand-1'] = { keinFgs: true, typ: 'trottoirueberfahrt' } }), null)
    expect(beide.streifen[0].trottoirueberfahrt).toBeUndefined(); expect(streifenStatus(beide.streifen[0])).toBe('kein FGS (von Hand)')
  })
})

describe('Trottoirüberfahrt: andere Streifen derselben Querung unverändert (Teilstreifen an einer Mittelinsel)', () => {
  const OSM2: OsmDaten = { ...OSM, wege: [OSM.wege[0]] }
  const AV2: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
  const lage = inselLage(lv(0, 0), [0, 1], [1, 0]), E1 = inselMasse(E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, null, 'links')
  const geteilt = (f: (x: Fall) => void = () => {}) => fallMit(x => {
    const t = streifenTeilen(lv(0, -3.7), lv(0, 3.7), lage, E1)
    if (!('teile' in t)) throw new Error(t.grund)
    t.teile.forEach(([p0, p1], i) => x.streifenHand.push({ id: `hand-${i + 1}`, p0, p1, breite: 4, herkunft: 'gezeichnet' }))
    x.flaechenPlan = inselFlaechen(lage, E1, 'e1-1', false).map((y, i) => ({ id: `plan-${i + 1}`, ...y }))
    f(x)
  })
  it('Teil 1 als Trottoirüberfahrt: Teil 2 rechnet wie zuvor (Fussgängerstreifen bzw. ohne Vortritt)', () => {
    for (const typ2 of [undefined, 'furt'] as const) {
      const vorher = rechneFall(OSM2, AV2, [], 12, geteilt(x => { if (typ2) x.streifen['hand-2'] = { typ: typ2 } }), null)
      const nachher = rechneFall(OSM2, AV2, [], 12, geteilt(x => {
        x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' }
        if (typ2) x.streifen['hand-2'] = { typ: typ2 }
      }), null)
      expect(nachher.streifen[0].trottoirueberfahrt).toBe(true)
      expect(JSON.stringify(nachher.streifen[1])).toBe(JSON.stringify(vorher.streifen[1]))
    }
    // ohne Trottoirüberfahrt: Rechnung wie bisher (keine Kennzeichnung)
    const r = rechneFall(OSM2, AV2, [], 12, geteilt(), null)
    expect(r.streifen.every(s => s.trottoirueberfahrt === undefined)).toBe(true)
    expect(ohneMs(r)).toBe(ohneMs(rechneFall(OSM2, AV2, [], 12, geteilt(), null)))
  })
})

describe('Trottoirüberfahrt: Bedarf vorbelegt aus der Wahl am Streifen', () => {
  const f = ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' } })
  const r = rechneFall(OSM, AV, [], 12, f, null)
  const b = befundblaetter(r, f, { ...OHNE, geo: { osm: OSM, av: AV } })[0]
  const fgs0 = rechneFall(OSM, AV, [], 12, ueberQuerweg(), null)
  it('Querungstyp Trottoirüberfahrt (Quelle von Hand, Herkunft «Wahl am Streifen»), Lage Einmündung und OSM-Knoten aus der Vorbelegung', () => {
    expect(b.vorbelegt.werte.typ).toEqual({ wert: 'trottoirueberfahrt', quelle: 'hand', text: TUE_WAHL_TEXT })
    expect(b.gebildet.eingaben.typ.wert).toBe('trottoirueberfahrt')
    expect(b.gebildet.eingaben.lage.wert).toBe('einmuendung')
    expect(b.vorbelegt.knoten).toBe(11)
  })
  it('Vorbelegung aus den Zufahrten (Tempo, innerorts, Tempo der Hauptstrasse), aber keine aus dem Sichtfeld', () => {
    expect(b.gebildet.eingaben.vSig.wert).toBe(30)
    expect(b.gebildet.eingaben.innerorts.wert).toBe(true)
    expect(b.vorbelegt.werte['q3.vSigHaupt']?.wert).toBe(50)
    const fgsB = befundblaetter(fgs0, ueberQuerweg(), { ...OHNE, geo: { osm: OSM, av: AV } })[0]
    for (const pfad of ['parkierungSichtbehindernd', 'hvlBedarfM']) {
      expect(fgsB.vorbelegt.werte[pfad], pfad).toBeDefined(); expect(b.vorbelegt.werte[pfad], pfad).toBeUndefined()
    }
    expect(b.vorbelegt.rechner?.['kurve.radius']).toBeUndefined(); expect(b.vorbelegt.werte['kurve.radius']).toBeUndefined()
  })
  it('keine Sicht aus dem Sichtrechner, keine Sichtbefunde, Grundprüfung gilt nicht, Thema Trottoirüberfahrt im Befund', () => {
    expect(b.befund.ausgewertet.filter(id => id.startsWith('Q3-')).length).toBeGreaterThan(5)
    expect(b.befund.alle.some(x => ['H1', 'E3'].includes(x.id))).toBe(false)
    expect(b.vorbelegt.rechner?.sichtVorh).toBeUndefined()
    expect(b.typText).toContain('Trottoirüberfahrt')
    expect(b.sicht).toEqual([])
    expect(b.grund.gilt).toBe(false)
    expect(b.grund.grund).toContain('Trottoirüberfahrt')
  })
  it('Handeingabe Fussgängerstreifen gilt gegen die Wahl am Streifen nicht (Hinweis)', () => {
    const g = ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' }; x.bedarf = { felder: { typ: { wert: 'fgs', quelle: 'hand' } } } })
    const bb = befundblaetter(rechneFall(OSM, AV, [], 12, g, null), g, OHNE)[0]
    expect(bb.gebildet.eingaben.typ.wert).toBe('trottoirueberfahrt')
    expect(bb.hinweise.join(' ')).toContain('es gilt Trottoirüberfahrt')
  })
  it('ohne Wahl: Querungstyp wie bisher aus dem Fussgängerstreifen', () => {
    const g = ueberQuerweg()
    const bb = befundblaetter(rechneFall(OSM, AV, [], 12, g, null), g, OHNE)[0]
    expect(bb.vorbelegt.werte.typ?.wert).toBe('fgs')
  })
})

describe('Trottoirüberfahrt: Fall-Datei', () => {
  it('neu: geschrieben als Version 3 und ohne Hinweis wieder gelesen', () => {
    const f = ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' } })
    expect(fallVersion(f)).toBe(3)
    const [g, h] = fallLesen(fallSchreiben(f))
    expect(g.streifen['hand-1']).toEqual({ typ: 'trottoirueberfahrt' }); expect(h).toEqual([])
  })
  it('alt: Fälle ohne Querungstyp bzw. mit Querung ohne Vortritt laden unverändert', () => {
    const alt = ueberQuerweg(x => { x.streifen['hand-1'] = { lsa: 'nein' } })
    const [g, h] = fallLesen(fallSchreiben(alt))
    expect([g.streifen['hand-1'], h, fallVersion(alt)]).toEqual([{ lsa: 'nein' }, [], 1])
    const ov = ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'furt' } })
    expect(fallLesen(fallSchreiben(ov))[0].streifen['hand-1']).toEqual({ typ: 'furt' })
  })
  it('unbekannter Wert (wie eine ältere App die Trottoirüberfahrt sieht): mit Hinweis übergangen, kein Absturz', () => {
    const roh = JSON.parse(fallSchreiben(ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt', lsa: 'ja' } })))
    roh.streifen['hand-1'].typ = 'unbekannt'
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.streifen['hand-1']).toEqual({ lsa: 'ja' })
    expect(h.join(' ')).toContain('Querungstyp ungültig, übergangen')
  })
  it('«kein FGS» und Trottoirüberfahrt zugleich: «kein FGS» gilt, mit Hinweis', () => {
    const roh = JSON.parse(fallSchreiben(ueberQuerweg(x => { x.streifen['hand-1'] = { typ: 'trottoirueberfahrt' } })))
    roh.streifen['hand-1'].keinFgs = true
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.streifen['hand-1']).toEqual({ keinFgs: true })
    expect(h.join(' ')).toContain('«kein FGS» und Trottoirüberfahrt zugleich')
  })
})

describe('Trottoirüberfahrt: Block im Reiter Sichtprüfung (Render-Wächter)', () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  it('Lage laut Bedarf keine Einmündung: Hinweis «nur an Einmündungen»; kein Link auf den SichtweitenCheck mehr', () => {
    const html = renderToStaticMarkup(<KnotensichtBlock ks={undefined} lage="strecke" breiteHand={null} setzeBreite={() => {}} />)
    expect(text(html)).toContain('Lage laut Bedarf: auf der Strecke (keine Kreuzung) – Trottoirüberfahrten gibt es nur an Einmündungen')
    expect(html).not.toContain('sichtweitencheck.ch'); expect(text(html)).not.toMatch(/zebra/i)
  })
})
