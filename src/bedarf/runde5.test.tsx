// Tests Runde 5 (Lesetest 21.10.2026): Sichtrechner mit amtlichem Tempo (V_sig), innerorts und Seitenstrasse (F1, F3), Teilstreifen
// (F5), Fusswegnetz als Grund (Stelle 10), Texte ohne Codes und Tags (Muster 4), Satz 1 und 4 der Zusammenfassung (Muster 1, 2), Bericht.
// Künstliche Strasse wie die übrigen Tests: Hauptstrasse West–Ost (y = 0), Fahrbahn 8 m, Tempo 50 (OSM), Übergang bei x = 0.

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import { rechneFall } from '../rechner/index'
import { leererFall, type Fall } from '../fall'
import { vsigTempo, type VsigLinie } from '../daten/vsig'
import { befundblaetter, begruendung, blattTitel, konfliktName } from './befundblatt'
import { querungen, vorbelegen, TEIL_MAX_M } from './vorbelegung'
import { automatik } from './automatik'
import type { Vorbelegung, VorWert } from './fallBedarf'
import { lesetext, tooltipText, tag } from './lesetext'
import { beurteile } from './entscheid'
import { fall as testFall } from './testfaelle'
import { woerter, zusammenfassungBlatt, zusammenfassungText, zfEingabeBlatt } from './zusammenfassung'
import { BedarfAbschnitt, BefundblattAnzeige, querungTitel, typZeile, zusatzTexte } from '../BedarfPanel'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const knoten = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: ll(x, y)[0], lon: ll(x, y)[1] })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const BQ = { mitte: O, radiusM: 200, form: 'quadrat' as const }
const vsig = (v: number, teile: P[][] = [[lv(-300, 0), lv(300, 0)]]): VsigLinie[] => [{ id: 'v1', strasse: 'Hauptstrasse', vSig: v, teile }]
const rechteckRing = (): P[] => [lv(-50, -50), lv(50, -50), lv(50, 50), lv(-50, 50)]
const vw = (wert: unknown, quelle: VorWert['quelle'] = 'osm', text = 'Test'): VorWert => ({ wert, quelle, text })

describe('Runde 5, Teil C: Sichtrechner mit amtlichem Tempo (V_sig, Nutzerentscheid 21.10.2026)', () => {
  it('V_sig der Achse gilt als Tempo der Zufahrt (Quelle «Geoportal»), Soll nach Tab. 1; Annahme nennt OSM', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null, null, null, vsigTempo({ linien: vsig(30), bereich: BQ }))
    const zs = r.streifen.flatMap(s => s.zufahrten)
    expect(zs.length).toBeGreaterThan(0)
    for (const z of zs) {
      expect(z).toMatchObject({ tempo: 30, tempoQuelle: 'Geoportal', sichtweite: 25 })
      expect(z.annahmen.join(' ')).toContain('Tempo 30 km/h laut Geoportal (OSM: 50 km/h)')
    }
    // ohne V_sig wie bisher (OSM)
    const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
    expect(r0.streifen[0].zufahrten.map(z => [z.tempo, z.tempoQuelle])).toEqual(r0.streifen[0].zufahrten.map(() => [50, 'OSM maxspeed']))
  })
  it('Tempo von Hand geht vor; Linie ohne Wert, quer zur Fahrtrichtung bzw. ausserhalb des Bereichs: OSM bleibt', () => {
    const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const z0 = r0.streifen[0].zufahrten[0]
    const hand = fallMit(x => { x.zufahrten[`${z0.fgsId}|${z0.kennung}`] = { tempo: 40 } })
    const rh = rechneFall(OSM, AV, [], 12, hand, null, null, null, vsigTempo({ linien: vsig(30), bereich: BQ }))
    expect(rh.streifen[0].zufahrten.find(z => z.kennung === z0.kennung)).toMatchObject({ tempo: 40, tempoQuelle: 'Korrektur' })
    const ohneWert: VsigLinie[] = [{ id: 'v', strasse: 'X', vSig: null, teile: [[lv(-300, 0), lv(300, 0)]] }]
    for (const t of [vsigTempo({ linien: ohneWert, bereich: BQ }), vsigTempo({ linien: vsig(30, [[lv(0, -300), lv(0, 300)]]), bereich: BQ }),
      vsigTempo({ linien: vsig(30), bereich: { mitte: lv(5000, 0), radiusM: 200, form: 'quadrat' } })]) {
      const r = rechneFall(OSM, AV, [], 12, fallMit(), null, null, null, t)
      expect(r.streifen[0].zufahrten.every(z => z.tempo === 50 && z.tempoQuelle === 'OSM maxspeed')).toBe(true)
    }
  })
  it('Vorbelegung: Tempo der Zufahrten aus dem Geoportal mit Quelle geoportal; kein Tempo-Konflikt im Hinweis (F2)', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null, null, null, vsigTempo({ linien: vsig(30), bereich: BQ }))
    const g = querungen(r.streifen)[0]
    const v = vorbelegen(g, fallMit(), [], { vsig: { linien: vsig(30), bereich: BQ } })
    expect(v.werte.vSig).toMatchObject({ wert: 30, quelle: 'geoportal' })
    expect(v.hinweise.join(' ')).not.toMatch(/Sichtrechner rechnet/)
    expect(v.werte.innerorts).toMatchObject({ wert: true, quelle: 'annahme', text: 'Tempo 30 km/h (Geoportal): innerorts angenommen' })
    const [b] = befundblaetter(r, fallMit(), { vorgabe: { bern: true, kantonBE: true }, geo: { vsig: { linien: vsig(30), bereich: BQ } } })
    expect(b.grund.tempoHinweis).toBeUndefined()
    // ohne V_sig im Sichtrechner, aber mit V_sig über der Querung: der Kasten nennt das Tempo der Rechnung (F2)
    const r50 = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const [b50] = befundblaetter(r50, fallMit(), { vorgabe: { bern: true, kantonBE: true }, geo: { vsig: { linien: vsig(30), bereich: BQ } } })
    expect(b50.grund.tempoHinweis).toContain('Soll gerechnet mit 50 km/h (OSM); signalisiert 30 km/h (Geoportal Stadt Bern)')
  })
})

describe('Runde 5, F1 und F3: innerorts und Werte der gequerten Strasse an einer Seitenstrasse', () => {
  const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
  const g = querungen(r.streifen)[0]
  // nur abbiegende Zufahrten (Querung über die Seitenstrasse): Tempo der Querstrasse 50 km/h aus OSM
  const nurAbbieger = (z: Partial<ZufahrtErgebnis> = {}): StreifenErgebnis[] => g.streifen.map(s => ({ ...s,
    zufahrten: s.zufahrten.map(x => ({ ...x, art: 'abbiegend', zufahrt: `a${x.richtung}`, strasse: 'Querstrasse', ...z })) }))
  it('F1: ohne gerade Zufahrt innerorts aus dem Tempo der einmündenden Strasse (Annahme); ab 60 km/h nicht', () => {
    const v = vorbelegen({ id: 'x', streifen: nurAbbieger() }, fallMit())
    expect(v.werte.vSig).toBeUndefined()
    expect(v.werte.innerorts).toMatchObject({ wert: true, quelle: 'annahme', text: 'Tempo der einmündenden Strasse 50 km/h (OSM): innerorts angenommen' })
    expect(vorbelegen({ id: 'x', streifen: nurAbbieger({ tempo: 60 }) }, fallMit()).werte.innerorts).toBeUndefined()
    // V_sig der gequerten Strasse (Achsschnitt) geht vor
    const mitV = vorbelegen({ id: 'x', streifen: nurAbbieger() }, fallMit(), [], { vsig: { linien: vsig(30), bereich: BQ } })
    expect(mitV.werte.innerorts?.text).toBe('Tempo 30 km/h (Geoportal): innerorts angenommen')
  })
  it('F3: Kopien in die Trottoirüberfahrt nur bei einer Querung über die Seitenstrasse; Tempo der Hauptstrasse aus den Abbiegern', () => {
    const w0: Vorbelegung = { vSig: vw(30, 'geoportal'), dtv: vw(800, 'geoportal'), 'q3.ueber': vw('einmuendend', 'annahme') }
    const w: Vorbelegung = { ...w0 }
    automatik({ st: nurAbbieger(), fall: fallMit(), geo: {}, w, hinweise: [], rechner: {}, setze: (p, wert, quelle, text) => { w[p] = { wert, quelle, text } },
      feldHinweis: () => {} })
    expect(w['q3.vSigEinm']).toMatchObject({ wert: 30, quelle: 'geoportal' })
    expect(w['q3.vSigHaupt']).toMatchObject({ wert: 50, quelle: 'osm' })
    expect(w['q3.vSigHaupt'].text).toContain('Querstrasse')
    expect(w['q3.dtvEinm']).toMatchObject({ wert: 800 })
  })
  it('F3: Name des Abschnitts im Geoportal neben dem OSM-Namen, wenn sie verschieden heissen (Achsschnitt bleibt)', () => {
    const v = vorbelegen(g, fallMit(), [], { vsig: { linien: [{ ...vsig(30)[0], strasse: 'Nebenstrasse' }], bereich: BQ } })
    expect(v.werte.vSig.text).toContain('auf dem gequerten Abschnitt («Nebenstrasse» laut Geoportal, in OSM Hauptstrasse)')
  })
})

describe('Runde 5, F5: unplausibel lange Teilstreifen', () => {
  it('Teil über 12 m: keine Fahrbahnbreite, Teilquerungen und Durchfahrt aus den Streifen, Hinweis', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const s = r.streifen[0]
    const teil = (id: string, a: number, b: number): StreifenErgebnis => ({ ...s, fgsId: id, p0: lv(0, a), p1: lv(0, b), rand: [lv(0, a), lv(0, b)],
      m: lv(0, (a + b) / 2), randQuelle: 'AV' })
    const lang = vorbelegen({ id: 'x', streifen: [teil('a', -20, -1), teil('b', 1, 4)] }, fallMit())
    expect(TEIL_MAX_M).toBe(12)
    expect(lang.werte.fahrbahnB).toBeUndefined()
    expect(lang.werte.durchfahrt).toBeUndefined()
    expect(lang.hinweise.join(' ')).toContain('Streifen ungewöhnlich lang (bis 19 m je Teil)')
    const kurz = vorbelegen({ id: 'x', streifen: [teil('a', -4, -1), teil('b', 1, 4)] }, fallMit())
    expect(kurz.werte.fahrbahnB).toMatchObject({ wert: 8 })
  })
})

describe('Lücke zwischen Balken und Trottoirkante (Nutzerentscheid 23.10.2026)', () => {
  it('nur bei Streifen aus dem Luftbild vorbelegt (Enden = erkannte Balken)', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const s = r.streifen[0]
    const st: StreifenErgebnis = { ...s, p0: lv(0, -3.7), p1: lv(0, 3.6), rand: [lv(0, -4), lv(0, 4)], m: lv(0, 0), randQuelle: 'AV' }
    const v = (streifenQuelle?: 'osm' | 'hand' | 'luftbild') => vorbelegen({ id: 'x', streifen: [st] }, fallMit(), [], { streifenQuelle }).werte
    expect(v('luftbild').randAbstand).toMatchObject({ wert: [0.3, 0.4], quelle: 'rechnung' })
    for (const q of ['osm', 'hand', undefined] as const) expect(v(q).randAbstand).toBeUndefined()
  })
})

describe('Runde 5: Fusswegnetz als besonderer Grund (Bern, Stelle 10)', () => {
  it('nur mit der Ebene Bern: Streifen in der Zone zulässig mit Begründung; ohne Bern verletzt', () => {
    const e = testFall({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: ['fusswegnetz'] })
    expect(beurteile(e, { ebenen: { bern: true } }).zulaessigkeit).toBe('mit_begruendung')
    expect(beurteile(e, { ebenen: { bern: false } }).zulaessigkeit).toBe('nicht_angezeigt')
  })
  it('Vorbelegung: Basisnetz (Geoportal) ergänzt den Grund mit Hinweis', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const g = querungen(r.streifen)[0]
    const RP = { basisnetz: [{ id: 'b', layer: 'Basisnetz', teile: [[lv(0, -40), lv(0, 40)]] }], publikum: [], bereich: BQ }
    const v = vorbelegen(g, fallMit(), [], { richtplan: RP })
    expect(v.werte.beduerfnis).toMatchObject({ wert: ['fusswegnetz'], quelle: 'annahme' })
    // publikumsattraktiver Bereich allein: kein Grund (Korrektur nach Prüfung)
    const pub = vorbelegen(g, fallMit(), [], { richtplan: { basisnetz: [], publikum: [{ id: 'p', layer: 'publikum', name: null, ringe: [rechteckRing()] }], bereich: BQ } })
    expect(pub.werte.netz?.wert).toBe('publikumsintensiv')
    expect((pub.werte.beduerfnis?.wert as string[] | undefined) ?? []).not.toContain('fusswegnetz')
    expect(v.werte.beduerfnis.text).toContain('Bern: Zugehörigkeit zum Fusswegnetz gilt als Begründung')
  })
})

describe('Runde 5: Lesetext ohne Codes und Tags (Muster 4), Titel und Hindernisse', () => {
  it('Belege nur im Tooltip', () => {
    const t = `laut OSM ist die Strasse beleuchtet${tag('lit=yes')}; vor Ort prüfen`
    expect(lesetext(t)).toBe('laut OSM ist die Strasse beleuchtet; vor Ort prüfen')
    expect(tooltipText(t)).toBe('laut OSM ist die Strasse beleuchtet (lit=yes); vor Ort prüfen')
  })
  it('Titel aus der Strasse statt der OSM-Nummer; Parkfeld ohne Layername', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const g = querungen(r.streifen)[0]
    expect(blattTitel(g, () => 'Streifen 2066165582')).toBe('Querung Hauptstrasse')
    expect(blattTitel({ id: 'x', streifen: [g.streifen[0], { ...g.streifen[0], fgsId: 'z' }] }, () => 'Streifen 5180148897-1'))
      .toBe('Querung Hauptstrasse (zwei Teile an der Insel)')
    expect(blattTitel(g, () => 'Streifen 1')).toBe('Streifen 1')
    expect(konfliktName({ klasse: 'auto', layer: 'Parkfeld_blau_APK_Parkfeld_blau_(APK)' })).toBe('Parkfeld (Parkkataster)')
  })
  it('Zusätze ohne Regelnummern; Typzeile «Falls zulässig» bei offener Zulässigkeit; Satz 4 mit Annahmen', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const f = fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: 't30_zone', quelle: 'annahme' }, vSig: { wert: 30, quelle: 'hand' },
      dtv: { wert: 1500, quelle: 'hand' } } } })
    const [b] = befundblaetter(r, f, { vorgabe: { bern: true, kantonBE: true } })
    const html = renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)
    expect(html).not.toMatch(/\(Q3-\d|\(C3, C4\)/)
    for (const z of zusatzTexte(b)) expect(z).not.toMatch(/\b[A-Z]\d/)
    expect(renderToStaticMarkup(<>{typZeile(b)}</>)).toMatch(/Falls zulässig:/)
    const z = zusammenfassungBlatt(b)
    expect(z.antwort).toMatch(/^Noch offen ist, ob hier ein Fussgängerstreifen zulässig ist/)
    expect(z.wichtig).toContain('Spricht eher gegen einen Streifen: wenig Fahrverkehr')
    expect(z.wichtig).not.toMatch(/verbessern: wenig Fahrverkehr/)
    const x = zfEingabeBlatt(b)
    expect(zusammenfassungText(z, x.fragen)).toMatch(/Für die Antwort entscheid/)
  })
  it('Fragen: Annahme bestätigen (Stelle 10), Zweck bei der Ortslage (Stelle 7), Restbreite ohne Abkürzung (Stelle 43)', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const [b] = befundblaetter(r, fallMit(), { vorgabe: { bern: false, kantonBE: false } })
    const h = new Map(b.gebildet.herkunft)
    h.set('tempoRegime', { zustand: 'vorbelegt', quelle: 'annahme', text: 'Test', vorbelegt: { wert: 't30_zone', quelle: 'annahme', text: 'Test' } })
    const x = zfEingabeBlatt({ ...b, gebildet: { ...b.gebildet, herkunft: h },
      offen: [{ feld: 'tempoRegime', name: 'Zone', gruppe: 'rahmen', regeln: ['C2'], bestaetigen: true }] })
    expect(x.fragen.tempoRegime).toBe('Bitte bestätigen: in einer Tempo-30-Zone (Zonentafel) (angenommen)?')
    const f0 = fallMit(x0 => { x0.bedarf = { felder: { innerorts: { wert: null, quelle: 'hand' } } } })
    const [b0] = befundblaetter(r, f0, { vorgabe: { bern: false, kantonBE: false } })
    expect(renderToStaticMarkup(<BefundblattAnzeige b={b0} druck />)).toContain('davon hängt ab, ob fgsCheck überhaupt beurteilt (nur innerorts)')
    const f4 = beurteile(testFall({ einengung: true, mivKlasse: 'mittel', restbreiteM: 4, typ: 'fgs' }), { ebenen: { bern: true } })
    expect(f4.alle.find(e => e.id === 'F4a')?.soll).toBe('≥ 4,50 (bei mittlerem Autoverkehr)')
  })
  it('Bericht-Panel: Bedarf ohne Handeingabe wird angezeigt (Bericht.tsx zeigt den Teil, sobald Blätter vorliegen)', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const f = fallMit()
    const bl = befundblaetter(r, f, { vorgabe: { bern: false, kantonBE: false } })
    expect(bl.length).toBe(1)
    const html = renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={bl} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />)
    expect(html).toContain('Bedarf und Querungstyp')
  })
})

describe('Runde 5, Korrekturen nach Prüfung', () => {
  const zul = (abw: Parameters<typeof testFall>[0]) => {
    const b = beurteile(testFall(abw), { ebenen: { bern: true } })
    return { zul: b.zulaessigkeit, begr: begruendung(b), b }
  }
  it('C2: vier Kombinationen von Zone und besonderem Grund; Begründung nennt das wirklich fehlende Feld', () => {
    // Zone bekannt, Grund bekannt → C2b (Grund ausweisen), mit Begründung
    expect(zul({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: ['schule'] }).zul).toBe('mit_begruendung')
    // Zone offen, Grund bekannt → C2 nicht verletzbar, C2b → mit Begründung (nicht offen)
    const a = zul({ tempoRegime: null, vSig: 30, beduerfnis: ['schule'] })
    expect(a.zul).toBe('mit_begruendung')
    expect(a.b.alle.find(x => x.id === 'C2')).toBeUndefined()
    expect(a.b.alle.find(x => x.id === 'C2b')?.detail).toContain('Zone noch offen')
    // Zone bekannt, Grund offen → offen wegen des Grunds
    const g = zul({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: null })
    expect(g.zul).toBe('offen')
    expect(g.begr).toContain('weil noch kein besonderer Grund für Vortritt bestätigt ist')
    expect(g.begr).not.toContain('Tempo-30-Zone liegt')
    // beides offen → beides
    const z = zul({ tempoRegime: null, vSig: 30, beduerfnis: null })
    expect(z.zul).toBe('offen')
    expect(z.b.alle.find(x => x.id === 'C2')?.fehlend).toEqual(['tempoRegime', 'beduerfnis'])
    expect(z.begr).toContain('weil noch offen ist, ob die Strasse in einer Tempo-30-Zone liegt, und noch kein besonderer Grund für Vortritt bestätigt ist')
    // nur die Zone offen, Grund «keines» → offen wegen der Zone
    const k = zul({ tempoRegime: null, vSig: 30, beduerfnis: [] })
    expect(k.zul).toBe('offen')
    expect(k.begr).toContain('weil noch offen ist, ob die Strasse in einer Tempo-30-Zone liegt:')
    // Zone bekannt, Grund «keines» → nicht angezeigt (unverändert)
    expect(zul({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: [] }).zul).toBe('nicht_angezeigt')
  })
  it('V_sig: ist die nächste Linie ohne Wert, gilt OSM (null), nicht eine weiter entfernte Linie mit Wert (wie 177/211)', () => {
    const t = vsigTempo({ linien: [{ id: 'leer', strasse: 'Schwarzenburgstrasse', vSig: null, teile: [[lv(-300, 0), lv(300, 0)]] },
      { id: 'knoten', strasse: 'Schwarzenburgstrasse', vSig: 50, teile: [[lv(-10, 1.5), lv(3, 1.5)]] }], bereich: BQ })
    expect(t(lv(0, 0.3), [1, 0])).toBeNull()
    expect(t(lv(0, 1.4), [1, 0])).toBe(50)
    expect(t(lv(50, 1.4), [1, 0])).toBeNull()
  })
  it('V_afu weicht von V_sig ab: Hinweis «Tempo prüfen»', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const g = querungen(r.streifen)[0]
    const v = vorbelegen(g, fallMit(), [], { vsig: { linien: [{ ...vsig(50)[0], vAfu: 30 }], bereich: BQ } })
    expect(v.werte.vSig.text).toContain('Amt für Umwelt: 30 km/h, Tempo prüfen')
    expect(v.hinweise.join(' ')).toContain('Tempo prüfen: laut Geoportal Stadt Bern signalisiert 50 km/h, beim Amt für Umwelt 30 km/h')
  })
  it('Zusammenfassung: Punkt nach «(und N weitere)»; Satz 4 fällt nie ganz weg; höchstens 85 Wörter', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const f = fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: 't30_zone', quelle: 'hand' }, vSig: { wert: 30, quelle: 'hand' } } } })
    const [b] = befundblaetter(r, f, { vorgabe: { bern: true, kantonBE: true } })
    const x = zfEingabeBlatt(b)
    const z = zusammenfassungBlatt(b)
    const t = zusammenfassungText(z, x.fragen)
    expect(t).not.toMatch(/\(und \d+ weitere\) [^.]/)
    if (z.fehlt?.weitere) expect(t).toMatch(/\(und \d+ weitere\)\./)
    expect(z.hinweis).toContain('Angenommen, bitte prüfen')
    expect(woerter(t)).toBeLessThanOrEqual(85)
  })
  it('innerorts nicht aus dem Ersatztempo; Titel von Handstreifen; Fusswegnetz nur mit Ebene Bern in der Auswahl', () => {
    const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
    const g = querungen(r.streifen)[0]
    const ers = g.streifen.map(s => ({ ...s, zufahrten: s.zufahrten.map(z => ({ ...z, tempo: 50, tempoQuelle: 'Ersatz' })) }))
    expect(vorbelegen({ id: 'x', streifen: ers }, fallMit()).werte.innerorts).toBeUndefined()
    const [b] = befundblaetter(r, fallMit(), { vorgabe: { bern: false, kantonBE: false }, titel: () => 'Streifen 1' })
    expect(querungTitel(b)).toBe('Querung, Streifen von Hand')
    const html = renderToStaticMarkup(<BedarfAbschnitt fall={fallMit()} blaetter={[b]} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />)
    expect(html).not.toContain('Fusswegnetz (Bern)')
  })
})
