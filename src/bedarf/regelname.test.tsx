// Tests Kurztitel der Regeln (Nutzerentscheid 20.10.2026): jede Regel hat einen Titel (kurz, eindeutig je Gruppe), und in der
// Oberfläche (Panel, Feldhilfen, Befundblatt, Grundprüfung, Bericht) steht nie eine Regelnummer allein, sondern «Titel (Nummer)».
// Wächter über gerenderte Texte (renderToStaticMarkup) aller Testfälle mit Varianten.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KATALOG, REGEL_IDS } from './katalog'
import { beurteile } from './entscheid'
import { grundpruefung } from './grundpruefung'
import { fall, TESTFAELLE, type Abw } from './testfaelle'
import { eingabenBilden, type Herkunft, type Vorbelegung } from './fallBedarf'
import { FELD_DEFS, feldName, gruppeVon } from './felder'
import { begruendung, typText, type BefundBlatt } from './befundblatt'
import { wertVon, type SichtKontext } from './feldhilfen'
import { mitTiteln, nummernOhneTitel, regelName, regelTitel } from './regelname'
import { BedarfAbschnitt, BefundblattAnzeige, FeldHilfe, GrundpruefungAnzeige } from '../BedarfPanel'
import { leererFall } from '../fall'
import type { RegelDef } from './typen'

describe('Kurztitel der Regeln', () => {
  it('jede Regel hat einen Titel: kurz (höchstens 7 Wörter, 48 Zeichen), eindeutig je Gruppe, ohne Nummer und ohne Normtext-Zeichen', () => {
    const je = new Map<string, Set<string>>()
    for (const id of REGEL_IDS) {
      const d = KATALOG[id] as RegelDef
      expect(d.titel.trim().length, id).toBeGreaterThan(3)
      expect(d.titel.length, id).toBeLessThanOrEqual(48)
      expect(d.titel.split(/\s+/).length, id).toBeLessThanOrEqual(7)
      expect(d.titel, id).not.toMatch(/ß|["„“”«»]/)
      expect(d.titel.toLowerCase(), id).not.toContain('zebra')
      expect(nummernOhneTitel(d.titel), id).toEqual([])
      const s = je.get(d.gruppe) ?? new Set()
      expect(s.has(d.titel), `${id}: ${d.titel} doppelt in ${d.gruppe}`).toBe(false)
      je.set(d.gruppe, s.add(d.titel))
    }
    expect(REGEL_IDS.length).toBe(165)
  })
  it('Namen und Texte: «Titel (Nummer)», einzelne Nummern in Texten ergänzt, Standard E1 bleibt', () => {
    expect(regelName('D2')).toBe('Insel bei breiter Fahrbahn (D2)')
    expect(regelTitel('B5-3')).toBe('Zweistreifigkeit')
    expect(mitTiteln('wegen D1, F2-K')).toBe('wegen Mehrere Fahrstreifen je Richtung (D1), Inseltiefe mit Radstreifen (Kanton BE) (F2-K)')
    expect(mitTiteln('Insel bei breiter Fahrbahn (D2, VSS 40 241 Z. 24)')).toBe('Insel bei breiter Fahrbahn (D2, VSS 40 241 Z. 24)')
    expect(mitTiteln('Mittelinsel Standard E1: Tiefe 2,00 m')).toBe('Mittelinsel Standard E1: Tiefe 2,00 m')
    expect(nummernOhneTitel('Lichtsignal prüfen (D5-3)')).toHaveLength(1)
  })
})

// ── gerenderte Oberfläche ──

/** Eingaben wie in der App (Pfade über eingabenBilden), mit Herkunft */
function gebildet(abw: Abw) {
  const e0 = fall(abw)
  const vor: Vorbelegung = {}
  for (const d of FELD_DEFS) {
    let v = wertVon(e0, d.pfad)
    if (d.pfad === 'q3.anrampung' && v) v = [(v as { neigung: number }).neigung, (v as { laenge: number }).laenge]
    if (v !== null && v !== undefined) vor[d.pfad] = { wert: v, quelle: 'hand', text: 'Test (Mittelinsel Standard E1)' }
  }
  return { vor, g: eingabenBilden(vor, null) }
}
/** Befundblatt ohne Rechnung (Sicht von Hand), mit Hinweisen, wie sie das Befundblatt erzeugt */
function blatt(abw: Abw, ebenen: { bern: boolean; kantonBE: boolean }): BefundBlatt {
  const { vor, g } = gebildet(abw)
  const befund = beurteile(g.eingaben, { ebenen: { ...ebenen, richtlinie: true } })
  return {
    gruppe: 'q1', streifen: ['1'], titel: 'Streifen 1', befund, gebildet: g, vorbelegt: { werte: vor, hinweise: [] },
    ebenen: { ...ebenen, richtlinie: true }, sicht: [], sichtVonHand: g.eingaben.sichtVorh.wert !== null,
    typText: typText(befund), zulText: '', begruendung: begruendung(befund),
    offen: befund.offenGruppen.map(o => ({ feld: o.feld, name: feldName(o.feld), gruppe: gruppeVon(o.feld), regeln: o.regeln })),
    nichtGeprueft: befund.nichtGeprueft.map(x => ({ block: x.block === 'Q3' ? 'Trottoirüberfahrt' : 'LSA-Zeiten', grund: x.grund })),
    annahmen: befund.annahmen,
    hinweise: ['Streifen 1: mit Lichtsignal gilt die Sichtweite nach VSS 40 241 nicht (kein Befund H1)'],
    grund: grundpruefung(g.eingaben),
  }
}
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ')
  // Leerzeichen, die das Entfernen der Tags zwischen Titel und Klammer einfügt, wieder schliessen
  .replace(/ \( /g, ' (').replace(/ \)/g, ')')

describe('Wächter: keine Regelnummer ohne Titel in der Oberfläche', () => {
  const TYPEN = [undefined, 'fgs', 'lsa', 'furt', 'ohne_vortritt', 'trottoirueberfahrt', 'mehrzweck', null] as const
  it('Befundblatt und Grundprüfung (Panel und Bericht) für alle Testfälle mit Typ-Varianten und Ebenen', () => {
    const fehler = new Set<string>()
    let n = 0
    for (const t of TESTFAELLE) for (const typ of TYPEN) for (const eb of [{ bern: false, kantonBE: false }, { bern: true, kantonBE: true }]) {
      const b = blatt(typ === undefined ? t.abw : { ...t.abw, typ }, eb)
      for (const html of [renderToStaticMarkup(<BefundblattAnzeige b={b} />), renderToStaticMarkup(<BefundblattAnzeige b={b} druck />),
        renderToStaticMarkup(<GrundpruefungAnzeige g={b.grund} druck />)]) {
        n++
        for (const x of nummernOhneTitel(text(html))) fehler.add(`${t.regel} ${t.name}: ${x}`)
      }
    }
    expect(n).toBeGreaterThan(5000)
    expect([...fehler].slice(0, 20)).toEqual([])
  })
  it('Panel mit Eingabemaske und alle Feldhilfen (Wozu, Ablauf, Leer lassen) in mehreren Fällen', () => {
    const fehler = new Set<string>()
    const f = leererFall(46.95, 7.44, null)
    for (const abw of [{}, { typ: null, fgsMitLsa: null, lage: null }, { typ: 'lsa' as const }, { lage: 'einmuendung' as const, typ: 'trottoirueberfahrt' as const }]) {
      const b = blatt(abw, { bern: true, kantonBE: true })
      const panel = renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[b]} vorgabe={{ bern: true, kantonBE: true }} aendern={() => {}} />)
      for (const x of nummernOhneTitel(text(panel))) fehler.add(`Panel ${JSON.stringify(abw)}: ${x}`)
      const k: SichtKontext = { e: b.gebildet.eingaben, ebenen: b.ebenen }
      for (const d of FELD_DEFS) {
        const h: Herkunft = b.gebildet.herkunft.get(d.pfad) ?? { zustand: 'offen', quelle: null, text: 'offen' }
        const html = renderToStaticMarkup(<FeldHilfe d={d} h={h} id="x" kontexte={[k]} />)
        for (const x of nummernOhneTitel(text(html))) fehler.add(`${d.pfad}: ${x}`)
      }
    }
    expect([...fehler].slice(0, 20)).toEqual([])
  })
  it('Gegenprobe: eine nackte Nummer im gerenderten Text wird erkannt', () => {
    expect(nummernOhneTitel(text(renderToStaticMarkup(<p>Offen: <b>D1</b>, G2</p>)))).toHaveLength(2)
    expect(nummernOhneTitel(text(renderToStaticMarkup(<p><b>{regelTitel('D1')}</b> <span>(D1)</span></p>)))).toEqual([])
  })
})
