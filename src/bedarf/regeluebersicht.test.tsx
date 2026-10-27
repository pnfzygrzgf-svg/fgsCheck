// Tests 23.10.2026: Regelübersicht (Panel-Abschnitt «Regeln»)
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KATALOG, REGEL_IDS } from './katalog'
import type { RegelDef } from './typen'
import { WERK_IDS, regelnJeWerk } from './quellen'
import { regelAnker, regelGruppen, regelZeilen } from './regeluebersicht'
import { nummernOhneTitel } from './regelname'
import { fall } from './testfaelle'
import { grundpruefung } from './grundpruefung'
import { RegelUebersicht } from '../RegelUebersicht'
import { QuellenTabelle } from '../Hilfe'
import { GrundpruefungAnzeige } from '../BedarfPanel'

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').replace(/ \( /g, ' (').replace(/ \)/g, ')')
const ids = (html: string): Set<string> => new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]))
const hrefs = (html: string, vor: string): string[] => [...html.matchAll(new RegExp(`href="#(${vor}[^"]+)"`, 'g'))].map(m => m[1])

describe('Regelübersicht', () => {
  const z = regelZeilen()
  it('nach Thema: jede Regel des Katalogs genau einmal; Ablauf und gestrichene Regeln am Ende', () => {
    const g = regelGruppen(z, 'thema')
    const alle = g.flatMap(x => x.zeilen.map(r => r.id))
    expect(alle.length).toBe(REGEL_IDS.length)
    expect(new Set(alle)).toEqual(new Set(REGEL_IDS))
    expect(g.slice(-2).map(x => x.schluessel)).toEqual(['ablauf', 'gestrichen'])
    for (const r of g.find(x => x.schluessel === 'gestrichen')!.zeilen) expect((KATALOG[r.id] as RegelDef).art).toBe('gestrichen')
  })
  it('nach Quelle: je Werk so viele aktive Regeln wie die Spalte «Regeln» der Quellentabelle', () => {
    const n = regelnJeWerk(), g = regelGruppen(z, 'quelle')
    for (const w of WERK_IDS) expect(g.find(x => x.schluessel === `werk-${w}`)?.zeilen.length ?? 0, w).toBe(n.get(w))
  })
  it('Filter nach Werk und Thema, Suche nach Titel bzw. Nummer', () => {
    expect(regelGruppen(z, 'quelle', { werk: '40213' }).filter(x => x.schluessel.startsWith('werk-')).map(x => x.schluessel)).toEqual(['werk-40213'])
    expect(regelGruppen(z, 'thema', { thema: 'insel' }).filter(x => x.schluessel.startsWith('thema-')).map(x => x.schluessel)).toEqual(['thema-insel'])
    expect(regelGruppen(z, 'thema', { suche: 'b5-2c' }).flatMap(x => x.zeilen.map(r => r.id))).toEqual(['B5-2c'])
    expect(regelGruppen(z, 'thema', { suche: 'durchfahrt' }).flatMap(x => x.zeilen.map(r => r.id))).toContain('F3')
  })
  it('Zeile: wo sie wirkt, wann sie gilt, Angaben, Ergebnis', () => {
    const r = z.find(x => x.id === 'B5-2c')!
    expect(r.wo).toBe('Grundprüfung, ② Fussgängerschutzinsel')
    expect(r.angaben.map(a => a.pfad)).toContain('durchfahrt')
    const f3b = z.find(x => x.id === 'F3-B')!
    expect(f3b.wo).toBe('Erweiterte Prüfung, Thema Insel')
    expect(f3b.giltFuer).toBe('nur Stadt Bern; nicht bei Trottoirüberfahrten und weitere Bedingungen')
    expect(f3b.giltGenau).toContain('Radstreifen')
    // «Prüft:» zeigt den Prüfsatz des Katalogs (23.10.2026), nicht den Ergebnistext
    expect(f3b.prueft).toBe(KATALOG['F3-B'].pruefsatz)
    expect(f3b.prueft).toMatch(/^Ist bei durchgehendem Radstreifen die Durchfahrt neben der Insel schmaler als 4,50 m/)
    for (const r of z) expect(r.giltFuer.split('; ').length, r.id).toBeLessThanOrEqual(2)
    const t = z.find(x => x.id === 'B5-T')!
    expect(t.verbindlichkeit).toBe('Muss nach bfu')
    expect(t.giltFuer).toBe('Fussgängerstreifen ohne Lichtsignal')
    expect(t.wo).toBe('Grundprüfung, Tempo')
  })
  it('Anker: Regeln (nach Thema), Werke (nach Quelle); Verweise aus Quellentabelle und Details zeigen auf vorhandene Anker; Render-Wächter', () => {
    const thema = renderToStaticMarkup(<RegelUebersicht />), quelle = renderToStaticMarkup(<RegelUebersicht anfang="quelle" />)
    const it = ids(thema), iq = ids(quelle)
    for (const id of REGEL_IDS) expect(it.has(regelAnker(id)), id).toBe(true)
    for (const h of hrefs(renderToStaticMarkup(<QuellenTabelle />), 'regeln-werk-')) expect(iq.has(h), h).toBe(true)
    // Werkverweise der Übersicht zeigen auf Zeilen der Quellentabelle bzw. den Begriff (kein toter Anker wie #quelle-VCS)
    const iTab = ids(renderToStaticMarkup(<QuellenTabelle />))
    for (const h of hrefs(thema, 'quelle-')) expect(iTab.has(h), h).toBe(true)
    expect(thema).not.toContain('href="#quelle-VCS"')
    for (const h of hrefs(renderToStaticMarkup(<GrundpruefungAnzeige g={grundpruefung(fall({ beleuchtung: null }))} druck={false} />), 'regel-'))
      expect(it.has(h), h).toBe(true)
    expect(hrefs(renderToStaticMarkup(<GrundpruefungAnzeige g={grundpruefung(fall({}))} druck />), 'regel-')).toEqual([])
    // jede Regel unter jedem ihrer Werke (nach Quelle keine doppelten Anker)
    expect([...quelle.matchAll(/ id="regel-/g)].length).toBe(0)
    expect(nummernOhneTitel(text(thema))).toEqual([])
    // lesbar (Nutzertest 23.10.2026): keine Bedingungssyntax, jede Regel mit «Prüft:» und «Gilt für:», Felder mit Knopf «zum Feld»
    expect(text(thema)).not.toMatch(/offen oder| und Mit |: offen\b/)
    expect((thema.match(/<dt>Prüft:<\/dt>/g) ?? []).length).toBe(REGEL_IDS.length)
    expect((thema.match(/<dt>Gilt für:<\/dt>/g) ?? []).length).toBe(REGEL_IDS.length)
    expect(thema).not.toContain('frage-knopf klein')
    // Felder mit Knopf «zum Feld» (27.10.2026: kleiner Knopf wie «Wert ändern»)
    expect(thema).toMatch(/<button type="button" class="zweit klein" title="zum Feld springen: Wert ansehen bzw. ändern" aria-label="zum Feld: [^"]+">zum Feld<\/button>/)
    expect(thema.toLowerCase()).not.toContain('zebra')
    expect(text(thema)).toContain(`${new Set(regelGruppen(z, 'thema').filter(g => g.schluessel.startsWith('thema-')).flatMap(g => g.zeilen)).size} Regeln.`)
  })
})
