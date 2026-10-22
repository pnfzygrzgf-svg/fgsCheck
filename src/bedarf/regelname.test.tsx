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
import { BedarfAbschnitt, BefundblattAnzeige, FeldHilfe, GrundpruefungAnzeige, ZusammenfassungAnzeige, listeNeu } from '../BedarfPanel'
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
    expect(REGEL_IDS.length).toBe(166)
  })
  it('Namen und Texte: «Titel (Nummer)», einzelne Nummern in Texten ergänzt, Standard E1 bleibt', () => {
    expect(regelName('D2')).toBe('Insel bei breiter Fahrbahn (D2)')
    expect(regelTitel('B5-3')).toBe('Ein Fahrstreifen je Richtung')
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
        renderToStaticMarkup(<GrundpruefungAnzeige g={b.grund} druck />), renderToStaticMarkup(<ZusammenfassungAnzeige b={b} />)]) {
        n++
        for (const x of nummernOhneTitel(text(html))) fehler.add(`${t.regel} ${t.name}: ${x}`)
      }
    }
    expect(n).toBeGreaterThan(5000)
    expect([...fehler].slice(0, 20)).toEqual([])
  }, 30_000)
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
  }, 30_000)
  it('Runde 2: Prüfübersicht, Themen, Verbindlichkeit (Muss/Soll), eine Zeile je Eintrag; Bericht ohne Liste der ohne Befund geprüften Regeln', () => {
    const b = blatt({}, { bern: true, kantonBE: true })
    const panel = text(renderToStaticMarkup(<BefundblattAnzeige b={b} />)).replace(/ :/g, ':')
    const druck = text(renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)).replace(/ :/g, ':')
    for (const t of [panel, druck]) {
      expect(t).toContain('48 Regeln betreffen diese Querung: 45 ohne Befund, 1 Befund, 2 Hinweise, 0 noch offen')
      expect(t).toContain('Insel: 4 geprüft, 2 ohne Befund, 1 Befund, 1 Hinweis')
      expect(t).toContain('Ohne Vortritt und Mehrzweckstreifen: nicht anwendbar')
      expect(t).toContain('Insel nach Berner Tabelle · Soll (Standard Stadt Bern), Abweichung begründen · Schutzinsel vorgesehen (Tabelle Tempo × DTV) (Ist Tempo 50 km/h, DTV 8000 Fz/Tag: Ja)')
      expect(t).toContain('Insel wünschenswert · Hinweis (Norm) · Eine Insel macht das Queren sicherer; hier ist sie nicht verlangt')
      expect(t).not.toMatch(/Soll –|Pflicht|In Ordnung/)
    }
    expect(panel).toContain('Geprüft, ohne Befund: Insel bei breiter Fahrbahn (D2), Verzicht auf Insel bei wenig Verkehr (D2a)')
    expect(druck).not.toContain('Geprüft, ohne Befund:')
    // Thema Insel vor Lichtsignal, im Thema Soll vor Hinweis
    expect(panel.indexOf('Insel nach Berner Tabelle ·')).toBeLessThan(panel.indexOf('Insel wünschenswert ·'))
    expect(panel.indexOf('Insel wünschenswert ·')).toBeLessThan(panel.indexOf('Lichtsignal prüfen nach Berner Tabelle ·'))
  })
  it('Verdichtung: Grundprüfung eine Zeile je Punkt, Quelle einmal im Kopf, Nummern und Fundstellen nur in den Details; offene Angaben als Frage', () => {
    const b = blatt({ beleuchtung: null, erkennungM: null }, { bern: false, kantonBE: false })
    const html = renderToStaticMarkup(<GrundpruefungAnzeige g={b.grund} />)
    const t = text(html).replace(/ :/g, ':')
    const tabelle = text(html.slice(0, html.indexOf('<details'))).replace(/ :/g, ':')
    expect(tabelle).toContain('Grundprüfung nach bfu MS.013-2025, Ziff. 2.1–2.3 (Big Five)')
    expect(tabelle).toMatch(/① Sichtverhältnisse \(Sicht\) ✓ erfüllt .*offen: ab wo der Streifen erkennbar ist/)
    expect(tabelle).toContain('④ Beleuchtung ? offen → Ist die Querung nachts beleuchtet?')
    expect(tabelle).not.toMatch(/B5-|bfu MS\.013:2025 Ziff/)
    expect(t).toContain('Doppelte Erkennungsdistanz (B5-1b)')
  })
  it('Korrektur S7: Weichen stehen nicht als Einträge im Thema, sondern als Zeile «Zum Ablauf»; Trottoirüberfahrt «nicht anwendbar» ohne B3 darunter', () => {
    const b = blatt({ lage: null }, { bern: false, kantonBE: false })
    expect(b.befund.alle.some(x => x.id === 'B3' && x.zustand === 'offen')).toBe(true)
    const t = text(renderToStaticMarkup(<BefundblattAnzeige b={b} />)).replace(/ :/g, ':')
    expect(t).not.toMatch(/Querung über eine Seitenstrasse ·/)
    const e = blatt({ lage: 'einmuendung' }, { bern: false, kantonBE: false })
    const te = text(renderToStaticMarkup(<BefundblattAnzeige b={e} />)).replace(/ :/g, ':')
    expect(te).toContain('Zum Ablauf (nicht gezählt) i Querung über eine Seitenstrasse · Hinweis (Norm) · Trottoirüberfahrt zusätzlich prüfen')
    // Fundstelle in den Details (Panel) bzw. als kleine Zeile (Bericht)
    expect(te).toMatch(/Querung über eine Seitenstrasse \(B3\) · VSS 40 240:2025-07 Z. 16/)
    const td = text(renderToStaticMarkup(<BefundblattAnzeige b={e} druck />)).replace(/ :/g, ':')
    expect(td).toMatch(/Querung über eine Seitenstrasse \(B3\) · VSS 40 240:2025-07 Z. 16/)
    // im Thema Trottoirüberfahrt steht B3 nicht
    const thema = te.slice(te.indexOf('Trottoirüberfahrt ('), te.indexOf('Zum Ablauf'))
    expect(thema).not.toContain('Querung über eine Seitenstrasse')
  })
  it('Korrektur S4: vorbelegte Liste ohne Häkchen ist eine Handeingabe «keines», ohne Vorbelegung offen', () => {
    expect(listeNeu([], true)).toEqual([])
    expect(listeNeu([], false)).toBeNull()
    expect(listeNeu(['schule'], true)).toEqual(['schule'])
  })
  it('Gegenprobe: eine nackte Nummer im gerenderten Text wird erkannt', () => {
    expect(nummernOhneTitel(text(renderToStaticMarkup(<p>Offen: <b>D1</b>, G2</p>)))).toHaveLength(2)
    expect(nummernOhneTitel(text(renderToStaticMarkup(<p><b>{regelTitel('D1')}</b> <span>(D1)</span></p>)))).toEqual([])
  })
})
