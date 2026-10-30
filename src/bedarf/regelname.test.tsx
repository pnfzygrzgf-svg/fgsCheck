// Tests Kurztitel der Regeln (Nutzerentscheid 20.10.2026): jede Regel hat einen Titel (kurz, eindeutig je Gruppe), und in der
// Oberfläche (Panel, Feldhilfen, Befundblatt, Grundprüfung, Bericht) steht nie eine Regelnummer allein, sondern «Titel (Nummer)».
// Wächter über gerenderte Texte (renderToStaticMarkup) aller Testfälle mit Varianten.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KATALOG, REGEL_IDS, WERKE } from './katalog'
import { fundstelleLink, fundstelleText } from './quellen'
import { beurteile } from './entscheid'
import { grundpruefung } from './grundpruefung'
import { fall, TESTFAELLE, type Abw } from './testfaelle'
import { eingabenBilden, type Herkunft, type Vorbelegung } from './fallBedarf'
import { FELD_DEFS, feldName, gruppeVon } from './felder'
import { begruendung, typText, type BefundBlatt } from './befundblatt'
import { wertVon, type SichtKontext } from './feldhilfen'
import { REGEL_ID_RE, mitTiteln, nummernOhneTitel, regelName, regelTitel } from './regelname'
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
    expect(REGEL_IDS.length).toBe(181)
  })
  it('Namen und Texte: «Titel (Nummer)», einzelne Nummern in Texten ergänzt, Standard E1 bleibt', () => {
    expect(regelName('D2')).toBe('Insel bei breiter Fahrbahn (D2)')
    expect(regelTitel('B5-3')).toBe('Ein Fahrstreifen je Richtung')
    expect(mitTiteln('wegen D1, F2-K')).toBe('wegen Mehrere Fahrstreifen je Richtung (D1), Inseltiefe für querende Velos (Kanton BE) (F2-K)')
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
  }, 180_000)
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
  }, 180_000)
  it('Runde 2: Prüfübersicht, Themen, Verbindlichkeit (Muss/Soll), eine Zeile je Eintrag; Bericht ohne Liste der ohne Befund geprüften Regeln', () => {
    const b = blatt({}, { bern: true, kantonBE: true })
    const panel = text(renderToStaticMarkup(<BefundblattAnzeige b={b} />)).replace(/ :/g, ':')
    const druck = text(renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)).replace(/ :/g, ':')
    for (const t of [panel, druck]) {
      // 23.10.2026: Kopf in einer Zeile, je Thema Zählung in Symbol und Wort, Themen ohne Befund in einer Zeile
      // 30.10.2026: + Richtlinie Hindernisfreie Architektur (gerade Trottoirkante) ohne Befund; Ausrichtung als Quelle von F1d;
      // Block 3: Streifenbreite und Abstand der Balken (F1a, F1b, F1c) gestrichen, 49 → 46
      expect(t).toContain('46 Regeln · 1 Befund · 2 Hinweise')
      expect(t).toContain('Insel ! 1 Soll-Befund · i 1 Hinweis')
      expect(t).toMatch(/Ohne Befund: Zulässigkeit ?, Nachfrage ?, Sicht/)
      expect(t).not.toContain('Ohne Vortritt und Mehrzweckstreifen')
      expect(t).toContain('Insel nach Berner Tabelle · Soll (Standard Stadt Bern), Abweichung begründen · Schutzinsel vorgesehen (Tabelle Tempo × DTV) (Ist Tempo 50 km/h, DTV 8000 Fz/Tag: Ja)')
      expect(t).toContain('Insel wünschenswert · Hinweis (Norm) · Eine Insel macht das Queren sicherer; hier ist sie nicht verlangt')
      expect(t).not.toMatch(/Soll –|Pflicht|In Ordnung/)
    }
    // ohne Befund geprüfte Regeln im Thema gezählt, aufklappbar mit Verweis in die Regelübersicht (Panel); im Bericht nicht
    const html = renderToStaticMarkup(<BefundblattAnzeige b={b} />)
    expect(html).toMatch(/<details class="klein thema-ohne"><summary>.*✓<\/span> 2 Regeln ohne Befund<\/summary><ul><li><a href="#[^"]+" class="werk-link" title="in der Regelübersicht">Insel bei breiter Fahrbahn<\/a><\/li><li><a [^>]+>Verzicht auf Insel bei wenig Verkehr<\/a>/)
    expect(panel).toContain('✓ 2 Regeln ohne Befund')
    // Bericht: nur die Zahl je Thema (Kann-Punkt Prüfung 23.10.2026)
    expect(druck).toContain('✓ 2 Regeln ohne Befund')
    expect(renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)).not.toContain('<details')
    // Thema Insel vor Lichtsignal; im Thema nach der Norm (27.10.2026): erst die Ziffer der VSS-Norm, dann der Berner Standard
    expect(panel.indexOf('Insel wünschenswert ·')).toBeLessThan(panel.indexOf('Insel nach Berner Tabelle ·'))
    expect(panel.indexOf('Insel nach Berner Tabelle ·')).toBeLessThan(panel.indexOf('Lichtsignal prüfen nach Berner Tabelle ·'))
    // Themen in Gruppen nach VSS 40 241 (Kapitel und Seite ausgeschrieben)
    expect(panel.indexOf('Anordnungsvoraussetzungen (VSS 40 241 Kapitel C, Seite 6–10)')).toBeLessThan(panel.indexOf('Ausrüstung (VSS 40 241 Kapitel D'))
  })
  it('Verdichtung: Grundprüfung eine Zeile je Punkt, Quelle einmal darunter, Nummern und Fundstellen nur in den Details je Punkt; offene Angaben als Frage', () => {
    const b = blatt({ beleuchtung: null, erkennungM: null }, { bern: false, kantonBE: false })
    const html = renderToStaticMarkup(<GrundpruefungAnzeige g={b.grund} />)
    const tabelle = text(html).replace(/ :/g, ':').replace(/ ,/g, ',')
    expect(tabelle).toContain('Grundprüfung bfu (Big Five)')
    // Lesetext ohne Kennung und Bestellnummer (Nutzerwunsch 23.10.2026); die stehen im Quellenverzeichnis
    expect(tabelle).toContain('Nach bfu-Fachdokumentation «Fussgängerstreifen», Ziffer 2.1–2.3')
    expect(tabelle).not.toMatch(/MS\.013|2\.457/)
    // 23.10.2026: Zusatz kurz (gezählt), Details je Punkt zugeklappt hinter ▸
    expect(tabelle).toMatch(/① Sichtverhältnisse \(Sicht\) ✓ erfüllt [^④]*\(1 Punkt offen\)/)
    expect(tabelle).toContain('④ Beleuchtung ? offen → Ist die Querung nachts beleuchtet?')
    expect(tabelle).not.toMatch(/B5-|bfu MS\.013:2025 Ziff/)
    expect(html.match(/class="grund-auf" aria-expanded="false"/g)?.length).toBe(b.grund.punkte.length + (b.grund.weitere.length ? 1 : 0))
    expect(html).not.toContain('grund-detail')
    // Bericht: Details je Punkt direkt unter der Zeile, ohne Knopf
    const druck = renderToStaticMarkup(<GrundpruefungAnzeige g={b.grund} druck />)
    const t = text(druck).replace(/ :/g, ':')
    expect(druck).not.toContain('grund-auf')
    expect(t).toContain('Doppelte Erkennungsdistanz (B5-1b)')
    expect(t.indexOf('Doppelte Erkennungsdistanz (B5-1b)')).toBeGreaterThan(t.indexOf('① Sichtverhältnisse'))
    expect(t.indexOf('Doppelte Erkennungsdistanz (B5-1b)')).toBeLessThan(t.indexOf('② Fussgängerschutzinsel'))
  })
  it('Korrektur S7: Weichen stehen nicht als Einträge im Thema, sondern als Zeile «Zum Ablauf»; Trottoirüberfahrt «nicht anwendbar» ohne B3 darunter', () => {
    const b = blatt({ lage: null }, { bern: false, kantonBE: false })
    expect(b.befund.alle.some(x => x.id === 'B3' && x.zustand === 'offen')).toBe(true)
    const t = text(renderToStaticMarkup(<BefundblattAnzeige b={b} />)).replace(/ :/g, ':')
    expect(t).not.toMatch(/Querung über eine Seitenstrasse ·/)
    const e = blatt({ lage: 'einmuendung' }, { bern: false, kantonBE: false })
    const te = text(renderToStaticMarkup(<BefundblattAnzeige b={e} />)).replace(/ :/g, ':')
    expect(te).toContain('Zum Ablauf (nicht gezählt): i Querung über eine Seitenstrasse · Hinweis (Norm) · Trottoirüberfahrt zusätzlich prüfen')
    // Fundstelle in den Details (Panel) bzw. als kleine Zeile (Bericht)
    expect(te.replace(/ ,/g, ',')).toMatch(/Querung über eine Seitenstrasse \(B3\) · VSS-Norm 40 240 Querungsanlagen, Ziffer 16/)
    const td = text(renderToStaticMarkup(<BefundblattAnzeige b={e} druck />)).replace(/ :/g, ':')
    expect(td).toMatch(/Querung über eine Seitenstrasse \(B3\) · VSS-Norm 40 240 Querungsanlagen, Ziffer 16/)
    // in keinem Thema steht B3 (23.10.2026: «Zum Ablauf» unter «Annahmen und Hinweise»)
    expect(te.slice(0, te.indexOf('Annahmen und Hinweise'))).not.toContain('Querung über eine Seitenstrasse')
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

// ── Fundstellen lesbar und verlinkt (Nutzertest 23.10.2026) ──
describe('Fundstellen lesbar: Lesename, ausgeschriebene Ziffern, keine Nummer vorn, Links nur zu den Herausgebern', () => {
  it('fundstelleText und Artikel-Links (fedlex) bzw. PDF-Seite', () => {
    expect(fundstelleText({ werk: 'VOT30', ziffer: 'Art. 4 Abs. 2' })).toBe('Tempo-30-Zonen-Verordnung (SR 741.213.3), Art. 4 Abs. 2')
    expect(fundstelleText({ werk: '40241', ziffer: 'Z. 17' })).toBe('VSS-Norm 40 241 Fussgängerstreifen, Ziffer 17')
    expect(fundstelleText({ werk: 'BFU', ziffer: 'Ziff. 2.1, 2.2 Tab. 1' })).toBe('bfu-Fachdokumentation «Fussgängerstreifen», Ziffer 2.1, 2.2 Tabelle 1')
    expect(fundstelleText({ werk: 'MP', ziffer: 'S. 60' })).toBe('Masterplan Fussverkehr Stadt Bern, Seite 60')
    expect(fundstelleLink({ werk: 'VOT30', ziffer: 'Art. 4 Abs. 2' })?.url).toBe('https://www.fedlex.admin.ch/eli/cc/2002/23/de#art_4')
    expect(fundstelleLink({ werk: 'VRV', ziffer: 'Art. 18 Abs. 2 Bst. e' })?.url).toBe('https://www.fedlex.admin.ch/eli/cc/1962/1364_1409_1420/de#art_18')
    expect(fundstelleLink({ werk: 'MP', ziffer: 'S. 60' })).toMatchObject({ art: 'pdf', url: `${WERKE.MP.pdf.url}#page=60` })
    expect(fundstelleLink({ werk: '40241', ziffer: 'Z. 17' })).toBeNull()
    // jede Fundstelle des Katalogs: Link nur auf eine Adresse des Werkverzeichnisses
    const basis = Object.values(WERKE).flatMap(w => [w.seite, w.pdf?.url]).filter((u): u is string => !!u)
    for (const id of REGEL_IDS) for (const q of (KATALOG[id] as RegelDef).quellen) {
      const l = fundstelleLink(q)
      if (l) expect(basis.some(b => l.url.startsWith(`${b}#`)), `${id}: ${l.url}`).toBe(true)
      expect(fundstelleText(q), id).not.toMatch(/\b(Z|Ziff|Tab|Anh|Kap|S)\. /)
    }
  })
  it('Begründung: Kurztitel – Fundstelle, ohne Regelnummer; im Fall der Zieglerstrasse wie gewünscht', () => {
    for (const t of TESTFAELLE) {
      const b = begruendung(beurteile(fall(t.abw), { ebenen: { bern: true, kantonBE: true, richtlinie: true } }))
      expect([...b.matchAll(REGEL_ID_RE)].map(m => m[1]), `${t.regel} ${t.name}: ${b}`).toEqual([])
      expect(b, t.name).not.toMatch(/\b(Z|Ziff|Tab|Anh)\. /)
    }
    const e = fall({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: ['schule'], dtv: 2000 })
    const b = begruendung(beurteile(e, { ebenen: { bern: false, kantonBE: false, richtlinie: true } }))
    expect(b).toContain('Tempo-30-Zonen-Verordnung (SR 741.213.3), Art. 4 Abs. 2')
  })
  it('gerenderter Lesetext (Befundblatt, Grundprüfung, Panel und Bericht): keine «Z. », «Tab. », «Anh. », keine Kennung MS.013', () => {
    const fehler = new Set<string>()
    for (const t of TESTFAELLE) {
      const b = blatt(t.abw, { bern: true, kantonBE: true })
      for (const html of [renderToStaticMarkup(<BefundblattAnzeige b={b} />), renderToStaticMarkup(<BefundblattAnzeige b={b} druck />),
        renderToStaticMarkup(<GrundpruefungAnzeige g={b.grund} druck />)]) {
        const x = text(html)
        for (const m of x.matchAll(/.{0,40}\b(Z|Tab|Anh)\. .{0,20}|.{0,30}MS\.013.{0,10}/g)) fehler.add(`${t.regel} ${t.name}: ${m[0]}`)
      }
    }
    expect([...fehler].slice(0, 10)).toEqual([])
  })
})
