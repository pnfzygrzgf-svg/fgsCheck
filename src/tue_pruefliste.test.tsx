// Tests Trottoirüberfahrt nach der Prüfliste VSS 40 242 (27.10.2026): Reihenfolge und Überschriften im Thema, nur die Fragen der
// Trottoirüberfahrt (Alternative Fussgängerstreifen erst auf Knopfdruck), Zahl der offenen Angaben, Zusammenfassung.
// Künstliche Strassen wie trottoirueberfahrt.test.tsx (keine echten Daten): Hauptstrasse West–Ost, Querweg mündet bei x = -40 ein.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import { rechneFall } from './rechner'
import { leererFall, type Fall } from './fall'
import { befundblaetter, type BefundBlatt } from './bedarf/befundblatt'
import { themenAnsicht, themaGliederung } from './bedarf/themenansicht'
import { ABSCHNITTE, nachAbschnitt, nachPruefliste } from './bedarf/themen'
import { FELD_DEFS } from './bedarf/felder'
import { sichtbar } from './bedarf/feldhilfen'
import { entscheidendeFelder, zfEingabeBlatt, zusammenfassungBlatt } from './bedarf/zusammenfassung'
import { beurteile } from './bedarf/entscheid'
import { Q3_OK, fall } from './bedarf/testfaelle'
import { handSetzen } from './bedarf/fallBedarf'
import { regelGruppen, regelZeilen } from './bedarf/regeluebersicht'
import { BedarfAbschnitt, BefundblattAnzeige, zusatzTexte } from './BedarfPanel'
import { LsaEinmuendung } from './tue/LsaEinmuendung'

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
const OHNE = { vorgabe: { bern: false, kantonBE: false } }

/** Trottoirüberfahrt über den Querweg; hand: Handeingaben (Pfad → Wert) */
function tueFall(hand: Record<string, unknown> = {}, typ: 'trottoirueberfahrt' | null = 'trottoirueberfahrt'): Fall {
  const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  x.streifenHand.push({ id: 'hand-1', p0: lv(-44, -8), p1: lv(-36, -8), breite: 4, herkunft: 'gezeichnet' })
  if (typ) x.streifen['hand-1'] = { typ }
  for (const [p, w] of Object.entries(hand)) x.bedarf = handSetzen(x.bedarf, p, w, 'hand')
  return x
}
const blatt = (f: Fall, alternative = false): BefundBlatt =>
  befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, { ...OHNE, geo: { osm: OSM, av: AV }, ...(alternative ? { alternative } : {}) })[0]

/** alle Angaben der Prüfliste ausser: (nichts) */
const OK: Record<string, unknown> = {
  innerorts: true, lage: 'einmuendung', 'q3.bebaut': true, 'q3.gewerbe': false, 'q3.anschlussGewerbe': false, 'q3.ueber': 'einmuendend',
  'q3.vSigHaupt': 50, 'q3.nEinm': 1, 'q3.nHaupt': 1, 'q3.trottoirBeidseits': true, 'q3.winkel': 90, 'q3.knotensichtOk': true, 'q3.hvl5m': true,
  'q3.einmSiedlungsorientiert': true, 'q3.zoneEinm': 'keine', 'q3.gegenueberEinm': false, 'q3.wartezeitEinmS': 10, 'q3.lkwGelegentlich': true,
  'q3.linienbus': false, 'q3.veloSchule': false, 'q3.mivEinmHoch': false, fgKlasse: '100-500', 'q3.lsaKnoten': false, 'q3.kreisel': false,
  'q3.breiteM': 3, 'q3.randDurchgehend': true, 'q3.ueberfahrbarM': 10, 'q3.begrenzung': 'poller', 'q3.erkennbar': true, 'q3.belag': 'gleich',
  'q3.quergefaelle': 2, 'q3.randabschluss': 's0625', 'q3.randsteineSenkrecht': true, 'q3.signalisation': false, 'q3.markierung': false,
  'q3.taktil': true,
}

describe('Prüfliste: Reihenfolge der Felder und Überschriften', () => {
  it('Felder der Trottoirüberfahrt in der Reihenfolge Tab. 1, Tab. 2, Tab. 3, Bern', () => {
    const q3 = FELD_DEFS.filter(d => d.gruppe === 'q3').map(d => d.pfad)
    expect(q3.slice(0, 3)).toEqual(['q3.bebaut', 'q3.gewerbe', 'q3.anschlussGewerbe'])
    expect(q3.indexOf('q3.hvl5m')).toBeLessThan(q3.indexOf('q3.einmSiedlungsorientiert'))
    expect(q3.indexOf('q3.kreisel')).toBeLessThan(q3.indexOf('q3.breiteM'))
    expect(q3.slice(q3.indexOf('q3.breiteM'))).toEqual(['q3.breiteM', 'q3.randDurchgehend', 'q3.ueberfahrbarM', 'q3.begrenzung',
      'q3.erkennbar', 'q3.belag', 'q3.quergefaelle', 'q3.randabschluss', 'q3.randsteineSenkrecht', 'q3.anrampung', 'q3.signalisation',
      'q3.markierung', 'q3.taktil', 'q3.vSigEinm', 'q3.dtvEinm'])
  })
  it('Abschnitte mit Tabelle und Seite; nachAbschnitt ordnet nur die Regeln der Gliederung', () => {
    expect(ABSCHNITTE.trottoirueberfahrt!.map(a => a.titel)).toEqual(['Zwingende Voraussetzungen (VSS 40 242 Tab. 1, S. 28)',
      'Merkmale zur Anordnung (VSS 40 242 Tab. 2, S. 30)', 'Ausstattung (VSS 40 242 Tab. 3, S. 32 und 34)', 'Bern',
      'Ausführung (erst bei der Umsetzung; VSS 40 242 Tab. 3, S. 32 und 34)'])
    expect(ABSCHNITTE.trottoirueberfahrt!.filter(a => a.ausfuehrung).length).toBe(1)
    expect(nachAbschnitt(['A1', 'F5n', 'C1', 'Q3-M10', 'Q3-1', 'Q3-B', 'F5a'], x => x)).toEqual(['A1', 'Q3-1', 'C1', 'Q3-M10', 'F5a', 'Q3-B', 'F5n'])
    expect(nachAbschnitt(['C1', 'A1'], x => x)).toEqual(['C1', 'A1'])
  })
  it('Thema: Fragen in der Reihenfolge der Prüfliste unter den Überschriften', () => {
    const b = blatt(tueFall({ innerorts: true, lage: 'einmuendung' }))
    const t = themenAnsicht([b]).themen.find(x => x.thema.id === 'trottoirueberfahrt')!
    const g = themaGliederung(t)!
    // Teile ohne offene Frage (Lage im Strassennetz, Knotentyp: vorbelegt) entfallen
    expect(g.map(x => x.unter || x.abschnitt)).toEqual(['Lage in Bezug zur Siedlung', 'Betrieb und Anlage',
      'Sichtweite', 'Strassentypen', 'Verkehrsmengen', 'Ausstattung (VSS 40 242 Tab. 3, S. 32 und 34)',
      'Ausführung (erst bei der Umsetzung; VSS 40 242 Tab. 3, S. 32 und 34)'])
    expect(g.map(x => !!x.ausfuehrung)).toEqual([false, false, false, false, false, false, true])
    const fragen = g.flatMap(x => x.fragen.map(f => f.ziel))
    expect(fragen.slice(0, 4)).toEqual(['q3.bebaut', 'q3.gewerbe', 'q3.anschlussGewerbe', 'q3.nHaupt'])
    // Verkehrsmengen: Gegenüber (M9) vor Wartezeit (M3)
    expect(fragen.indexOf('q3.gegenueberEinm')).toBeLessThan(fragen.indexOf('q3.wartezeitEinmS'))
    expect(fragen.indexOf('q3.wartezeitEinmS')).toBeLessThan(fragen.indexOf('q3.breiteM'))
    // Ausstattung (Machbarkeit): F5a, F5c, F5d; Ausführung: F5e … F5k, F5b, F5l, F5m, F5n
    const aus = g.find(x => x.abschnitt.startsWith('Ausstattung'))!.fragen.map(f => f.ziel)
    expect(aus).toEqual(['q3.breiteM', 'q3.randDurchgehend', 'q3.ueberfahrbarM'])
    const ausf = g.find(x => x.ausfuehrung)!.fragen.map(f => f.ziel)
    expect(ausf).toEqual(['q3.begrenzung', 'q3.erkennbar', 'q3.belag', 'q3.quergefaelle', 'q3.randabschluss', 'q3.randsteineSenkrecht',
      'q3.signalisation', 'q3.markierung', 'q3.taktil'])
  })
  it('Panel und Bericht: Überschriften in dieser Reihenfolge (Abkürzungen ausgeschrieben)', () => {
    const f = tueFall({ innerorts: true, lage: 'einmuendung' })
    const b = blatt(f)
    for (const html of [renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[b]} vorgabe={OHNE.vorgabe} aendern={() => {}} setAlternative={() => {}} />),
      renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)]) {
      const i = ['Zwingende Voraussetzungen (VSS 40 242 Tabelle 1, Seite 28)', 'Lage in Bezug zur Siedlung', 'Merkmale zur Anordnung (VSS 40 242 Tabelle 2, Seite 30)',
        'Verkehrsmengen', 'Ausstattung (VSS 40 242 Tabelle 3, Seite 32 und 34)'].map(x => html.indexOf(x))
      expect(i.every(x => x >= 0), html.slice(0, 200)).toBe(true)
      expect([...i].sort((x, y) => x - y)).toEqual(i)
    }
  })
  it('Regelübersicht: Thema Trottoirüberfahrt in der Reihenfolge der Prüfliste, «wo» mit Abschnitt', () => {
    const g = regelGruppen(regelZeilen(), 'thema').find(x => x.schluessel === 'thema-trottoirueberfahrt')!
    const ids = g.zeilen.map(z => z.id)
    expect(ids.slice(0, 3)).toEqual(['Q3-1', 'Q3-2', 'Q3-3'])
    expect(ids.indexOf('Q3-M9')).toBeLessThan(ids.indexOf('Q3-M3'))
    expect(ids.slice(-15)).toEqual(['F5a', 'F5c', 'F5d', 'Q3-B', 'F5e', 'F5f', 'F5g', 'F5h', 'F5i', 'F5j', 'F5k', 'F5b', 'F5l', 'F5m', 'F5n'])
    expect(g.zeilen.find(z => z.id === 'F5c')!.wo).toBe('Erweiterte Prüfung, Thema Trottoirüberfahrt, Ausstattung (VSS 40 242 Tab. 3, S. 32 und 34)')
  })
})

describe('Nur Fragen der Trottoirüberfahrt; Alternative Fussgängerstreifen auf Knopfdruck', () => {
  it('Sichtbarkeit: Felder des Fussgängerstreifens ausgeblendet, mit Alternative sichtbar', () => {
    const b = blatt(tueFall({ innerorts: true, lage: 'einmuendung' }))
    const k = { e: b.gebildet.eingaben, ebenen: b.ebenen }
    for (const p of ['innerorts', 'lage', 'fg5h', 'fgKlasse', 'q3.bebaut', 'q3.belag', 'q3.taktil']) expect(sichtbar(p, k), p).toBe(true)
    for (const p of ['vSig', 'tempoRegime', 'nachfrage', 'beleuchtung', 'insel.vorhanden', 'randabschluss.art', 'taktil', 'laengsparkierung', 'signal411'])
      expect(sichtbar(p, k), p).toBe(false)
    for (const p of ['vSig', 'tempoRegime', 'beleuchtung', 'signal411']) expect(sichtbar(p, { ...k, alternative: true }), p).toBe(true)
  })
  it('ohne Alternative: Fragen nur im Thema Trottoirüberfahrt, gezählt; keine Einträge zu Randstein, Insel oder Tastlinien', () => {
    const b = blatt(tueFall({ innerorts: true, lage: 'einmuendung' }))
    const a = themenAnsicht([b])
    const mitFragen = a.themen.filter(t => t.fragen.length).map(t => t.thema.id)
    expect(mitFragen).toEqual(['trottoirueberfahrt'])
    expect(a.themen.reduce((n, t) => n + t.zahl.offen, 0)).toBe(a.themen.find(t => t.thema.id === 'trottoirueberfahrt')!.zahl.offen)
    expect(b.befund.alle.filter(x => /^(F2|F3|F4|F7|E2b|E2c|A2|A3|A4|B1|G3|C|D)/.test(x.id))).toEqual([])
    expect(b.befund.annahmen.filter(x => /^(vSig|v85|tempoRegime)/.test(x))).toEqual([])
  })
  it('mit Alternative: Fragen des Fussgängerstreifens erscheinen und zählen; F7 läuft nie', () => {
    const b = blatt(tueFall({ innerorts: true, lage: 'einmuendung' }), true)
    expect(b.alternative).toBe(true)
    const a = themenAnsicht([b])
    const mitFragen = a.themen.filter(t => t.fragen.length).map(t => t.thema.id)
    expect(mitFragen.length).toBeGreaterThan(1)
    expect(b.befund.ausgewertet.some(x => x.startsWith('F7'))).toBe(false)
  })
  it('Zahl offener Angaben: alle beantwortet → keine Frage offen; Zusammenfassung ohne Lücke', () => {
    const b = blatt(tueFall(OK))
    const a = themenAnsicht([b])
    expect(a.themen.reduce((n, t) => n + t.zahl.offen, 0)).toBe(0)
    const z = zusammenfassungBlatt(b)
    expect(z.antwort).toBe('Eine Trottoirüberfahrt ist hier zulässig.')
    expect(z.fehlt).toBeNull()
  })
  it('Ausführung (erst bei der Umsetzung): offen zählt nicht (Thema, Zusammenfassung, Muss-Fragen); beantwortet geprüft, im Bericht unter derselben Überschrift', () => {
    const AUSF = ['q3.begrenzung', 'q3.erkennbar', 'q3.belag', 'q3.quergefaelle', 'q3.randabschluss', 'q3.randsteineSenkrecht', 'q3.anrampung',
      'q3.signalisation', 'q3.markierung', 'q3.taktil']
    const ohneAusf = Object.fromEntries(Object.entries(OK).filter(([k]) => !AUSF.includes(k)))
    const b = blatt(tueFall(ohneAusf))
    const a = themenAnsicht([b])
    const t = a.themen.find(x => x.thema.id === 'trottoirueberfahrt')!
    expect(t.fragen.length).toBeGreaterThan(5)
    expect(a.themen.reduce((n, x) => n + x.zahl.offen, 0)).toBe(0)
    const z = zusammenfassungBlatt(b)
    expect(z.antwort).toBe('Eine Trottoirüberfahrt ist hier zulässig.')
    expect(z.fehlt).toBeNull()
    expect(b.befund.empfehlung.vorlaeufig).toBe(false)
    expect(entscheidendeFelder(zfEingabeBlatt(b)).filter(f => AUSF.includes(f))).toEqual([])
    const satz = JSON.stringify(z)
    expect(satz).toMatch(/Ausführung: \d+ Punkte, erst bei der Umsetzung/)
    expect(satz).not.toMatch(/Prüfungen noch offen/)
    // alles beantwortet: kein Zusatz zur Ausführung
    expect(JSON.stringify(zusammenfassungBlatt(blatt(tueFall(OK))))).not.toContain('Ausführung')
    // beantwortet: geprüft wie bisher, Befund unter «Ausführung»
    const mark = blatt(tueFall({ ...ohneAusf, 'q3.markierung': true }))
    expect(mark.befund.alle.find(x => x.id === 'F5m')?.zustand).toBe('verletzt')
    const g = themaGliederung(themenAnsicht([mark]).themen.find(x => x.thema.id === 'trottoirueberfahrt')!)!
    expect(g.find(x => x.ausfuehrung)!.eintraege.flatMap(e => e.xs.map(x => x.id))).toEqual(['F5m'])
    const html = renderToStaticMarkup(<BefundblattAnzeige b={mark} druck />)
    expect(html.indexOf('Ausführung (erst bei der Umsetzung; VSS 40 242 Tabelle 3, Seite 32 und 34)')).toBeGreaterThan(html.indexOf('Ausstattung (VSS 40 242 Tabelle 3'))
    // Panel: eingeklappt
    const panel = renderToStaticMarkup(<BedarfAbschnitt fall={tueFall(ohneAusf)} blaetter={[b]} vorgabe={OHNE.vorgabe} aendern={() => {}} setAlternative={() => {}} />)
    expect(panel).toMatch(/<details class="thema-teil thema-ausfuehrung"><summary><b>Ausführung/)
  })
  it('nicht zulässig: Alternative in einem Satz, «nur grob geprüft» ohne, ohne Zusatz mit Knopf; Trottoirrand zurückgesetzt zählt mit', () => {
    const f = tueFall({ ...OK, 'q3.randDurchgehend': false })
    const ohne = zusammenfassungBlatt(blatt(f)).antwort, mit = zusammenfassungBlatt(blatt(f, true)).antwort
    expect(ohne).toMatch(/^Eine Trottoirüberfahrt ist hier nicht zulässig: Trottoirrand zurückgesetzt/)
    expect(ohne).toContain('(nur grob geprüft)')
    expect(mit).not.toContain('grob')
  })
  it('Begründung und Zusätze: nur aus der Trottoirüberfahrt, nichts zum Fussgängerstreifen (Korrektur 27.10.2026)', () => {
    const offen = blatt(tueFall({ innerorts: true, lage: 'einmuendung' }))
    const nicht = blatt(tueFall({ ...OK, 'q3.randDurchgehend': false }))
    const zone = blatt(tueFall({ ...OK, tempoRegime: 'begegnungszone', vSig: 20 }))
    const ok = blatt(tueFall(OK))
    for (const b of [offen, nicht, zone, ok]) {
      expect(b.begruendung).not.toMatch(/Fussgängerstreifen|Insel|Lichtsignal|Begegnungszone/)
      expect(zusatzTexte(b).join(' ')).not.toMatch(/Zusätzlich (prüfen|möglich)/)
    }
    expect(offen.begruendung).toMatch(/^Zulässigkeit offen, weil Angaben fehlen: /)
    expect(nicht.begruendung).toMatch(/^Nicht zulässig: Trottoirrand gerade durch – /)
    expect(ok.begruendung).toBe('Zwingende Punkte ohne Befund (VSS 40 242 Tab. 1)')
    expect(zone.befund.empfehlung.grundlage).toEqual([])
  })
  it('Kreuzung über die Zufahrt ohne Vortritt: zulässig; über die Strasse mit Vortritt: nicht', () => {
    expect(zusammenfassungBlatt(blatt(tueFall({ ...OK, lage: 'knoten_belastet' }))).antwort).toBe('Eine Trottoirüberfahrt ist hier zulässig.')
    expect(zusammenfassungBlatt(blatt(tueFall({ ...OK, lage: 'knoten_berechtigt' }))).antwort)
      .toMatch(/^Eine Trottoirüberfahrt ist hier nicht zulässig: die Querung liegt nicht an einer Einmündung über die Seitenstrasse/)
  })
  it('Knopf «Alternative Fussgängerstreifen prüfen» nur bei einer Trottoirüberfahrt', () => {
    const f = tueFall({ innerorts: true, lage: 'einmuendung' })
    const html = renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[blatt(f)]} vorgabe={OHNE.vorgabe} aendern={() => {}} setAlternative={() => {}} />)
    expect(html).toContain('Alternative Fussgängerstreifen prüfen')
    const g = tueFall({ innerorts: true }, null)
    const html2 = renderToStaticMarkup(<BedarfAbschnitt fall={g} blaetter={[blatt(g)]} vorgabe={OHNE.vorgabe} aendern={() => {}} setAlternative={() => {}} />)
    expect(html2).not.toContain('Alternative Fussgängerstreifen prüfen')
  })
})

describe('Planung statt heutiger Zustand: Lichtsignal, Fahrstreifen, Zone als Vorschlag (27.10.2026)', () => {
  // heutiges Lichtsignal am Knoten (OSM, 3 m vom Knoten der Einmündung)
  const OSM_LSA: OsmDaten = { ...OSM, ampeln: [{ id: 99, tags: { highway: 'traffic_signals' }, lat: ll(-40, 3)[0], lon: ll(-40, 3)[1] }] }
  const { 'q3.lsaKnoten': _l, ...ohneLsa } = OK
  void _l
  const mit = (f: Fall) => befundblaetter(rechneFall(OSM_LSA, AV, [], 12, f, null), f, { ...OHNE, geo: { osm: OSM_LSA, av: AV } })[0]
  it('Lichtsignal nach OSM an der Trottoirüberfahrt: Vorschlag, Q3-M7 offen zum Bestätigen statt «nicht zulässig»', () => {
    const b = mit(tueFall(ohneLsa))
    expect(b.gebildet.herkunft.get('q3.lsaKnoten')).toMatchObject({ zustand: 'vorbelegt', quelle: 'vorschlag' })
    expect(b.gebildet.herkunft.get('q3.lsaKnoten')?.text).toMatch(/: bleibt es mit der Überfahrt bestehen\?$/)
    expect(b.befund.alle.find(x => x.id === 'Q3-M7')).toMatchObject({ zustand: 'offen', bestaetigen: true, fehlend: ['q3.lsaKnoten'] })
    const z = zusammenfassungBlatt(b)
    expect(z.antwort).not.toMatch(/nicht zulässig/)
    expect(Object.values(zfEingabeBlatt(b).fragen)).toContain('Bitte bestätigen: ja (heutiger Zustand)?')
  })
  it('bestätigt bzw. von Hand «ja»: Muss; «nein» in der Zeile des Streifens: kein Verstoss; «automatisch»: wieder Vorschlag', () => {
    const best = mit(tueFall({ ...ohneLsa }))
    void best
    const ja = mit(tueFall({ ...ohneLsa, 'q3.lsaKnoten': true }))
    expect(ja.befund.alle.find(x => x.id === 'Q3-M7')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
    const f = tueFall(ohneLsa)
    f.bedarf = handSetzen(f.bedarf, 'q3.lsaKnoten', true, 'bestaetigt')
    expect(mit(f).befund.alle.find(x => x.id === 'Q3-M7')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
    const nein = mit(tueFall({ ...ohneLsa, 'q3.lsaKnoten': false }))
    expect(nein.befund.alle.find(x => x.id === 'Q3-M7')).toBeUndefined()
    expect(nein.befund.erfuellt).toContain('Q3-M7')
    const auto = tueFall({ ...ohneLsa, 'q3.lsaKnoten': false })
    auto.bedarf = handSetzen(auto.bedarf, 'q3.lsaKnoten', null, 'hand')
    expect(mit(auto).gebildet.herkunft.get('q3.lsaKnoten')).toMatchObject({ zustand: 'vorbelegt', quelle: 'vorschlag' })
  })
  it('Zeile des Streifens: «Lichtsignal an der Einmündung» zeigt die Vorbelegung bzw. die Handeingabe des Bedarfs', () => {
    const f = tueFall(ohneLsa)
    const html = renderToStaticMarkup(<LsaEinmuendung fall={f} blatt={mit(f)} aendern={() => {}} />)
    expect(html).toContain('Lichtsignal an der Einmündung')
    expect(html).toContain('automatisch (ja, aus OSM)')
    const g = tueFall({ ...ohneLsa, 'q3.lsaKnoten': false })
    expect(renderToStaticMarkup(<LsaEinmuendung fall={g} blatt={mit(g)} aendern={() => {}} />)).toMatch(/<option value="nein" selected="">nein</)
  })
  it('ohne Trottoirüberfahrt (Fussgängerstreifen an der Einmündung): Lichtsignal wie bisher aus OSM', () => {
    const b = mit(tueFall({ innerorts: true, lage: 'einmuendung' }, null))
    expect(b.gebildet.herkunft.get('q3.lsaKnoten')).toMatchObject({ zustand: 'vorbelegt', quelle: 'osm' })
  })
  it('Fahrstreifen und Zone als Vorschlag: Q3-7, Q3-8, Q3-M2 offen zum Bestätigen; als Tatsache bzw. von Hand wie bisher', () => {
    const e = fall({ typ: 'trottoirueberfahrt', lage: 'einmuendung', q3: { ...Q3_OK, nEinm: 2, nHaupt: 2, zoneEinm: 't30', eingangstor: false, hauptInZone: false } })
    const q = (vorschlag: boolean) => (p: string) => (vorschlag && ['q3.nEinm', 'q3.nHaupt', 'q3.zoneEinm'].includes(p) ? 'vorschlag' as const : 'osm' as const)
    const v = beurteile(e, { quelleVon: q(true) }), t = beurteile(e, { quelleVon: q(false) })
    for (const id of ['Q3-7', 'Q3-8', 'Q3-M2']) {
      expect(v.alle.find(x => x.id === id), id).toMatchObject({ zustand: 'offen', bestaetigen: true })
      expect(t.alle.find(x => x.id === id)?.zustand, id).toBe('verletzt')
    }
    // ohne Trottoirüberfahrt bleibt die Option an der Einmündung wie bisher (keine Bestätigung verlangt)
    const fgs = beurteile({ ...e, typ: { wert: 'fgs', quelle: 'hand' } }, { quelleVon: q(true) })
    expect(fgs.empfehlung.zusatz.join(' ')).toContain('nicht zulässig wegen')
  })
})

describe('Offene Angaben einer Trottoirüberfahrt in der Reihenfolge der Prüfliste (27.10.2026)', () => {
  it('nachPruefliste: Tab. 1 vor Tab. 2 vor Ausstattung vor Bern; Lage nach der Siedlung; Querende bei den Verkehrsmengen; Fremdes danach', () => {
    expect(nachPruefliste(['q3.randDurchgehend', 'q3.dtvEinm', 'q3.lsaKnoten', 'lage', 'q3.anschlussGewerbe', 'q3.bebaut', 'vSig', 'fgKlasse', 'q3.veloSchule']))
      .toEqual(['q3.bebaut', 'q3.anschlussGewerbe', 'lage', 'q3.veloSchule', 'fgKlasse', 'q3.lsaKnoten', 'q3.randDurchgehend', 'q3.dtvEinm', 'vSig'])
  })
  it('Zusammenfassung: «Für die Antwort entscheidend» beginnt mit dem bebauten Gebiet, nicht mit dem Trottoirrand; entscheidende zuerst', () => {
    const b = blatt(tueFall({ innerorts: true, lage: 'einmuendung' }))
    const z = zusammenfassungBlatt(b, 'bericht')
    expect(z.fehlt?.einleitung).toBe('Für die Antwort entscheidend:')
    expect(z.fehlt?.felder[0]).toBe('q3.bebaut')
    expect(z.fehlt?.felder).not.toContain('q3.randDurchgehend')
    const ent = entscheidendeFelder({ befund: b.befund })
    expect(ent).toEqual(nachPruefliste(ent))
    expect(ent.indexOf('q3.bebaut')).toBeLessThan(ent.indexOf('q3.randDurchgehend'))
  })
})
