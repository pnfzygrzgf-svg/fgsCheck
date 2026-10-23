// Tests Runde 4 (21.10.2026): Quellenverzeichnis, Begriffsliste, Muss-Hinweis an offenen Feldern. Künstliche Strasse wie
// automatik.test.tsx (Hauptstrasse West–Ost, Fahrbahn 8 m, Tempo 50, Übergang bei x = 0).
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { leererFall, type Fall } from '../fall'
import { befundblaetter, type BefundBlatt } from './befundblatt'
import { KATALOG, REGEL_IDS, WERKE, type WerkId } from './katalog'
import { WERK_IDS, WERK_INFO, regelnJeWerk, werkeImFall, werkeVon, werkText } from './quellen'
import { BEGRIFFE, begriffeAlphabetisch, begriffeImFall, begriffeIn } from './begriffe'
import { BESTAETIGUNG_MOEGLICH, feldBedarf, feldBedarfText } from './feldbedarf'
import { FELD_DEFS } from './felder'
import { beurteile } from './entscheid'
import { fall as testfall } from './testfaelle'
import { eingabenBilden } from './fallBedarf'
import { eintragSatz } from './kompakt'
import { FRAGEN } from './feldhilfen'
import { nummernOhneTitel } from './regelname'
import type { RegelDef } from './typen'
import { BedarfAbschnitt, BefundblattAnzeige, QuelleMitVerweis, VerzeichnisBericht, feldZeileId } from '../BedarfPanel'
import { Anleitung, BegriffeListe, QuellenTabelle, RechnungGrundlagen } from '../Hilfe'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const knoten = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: ll(x, y)[0], lon: ll(x, y)[1] })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const BERN = { vorgabe: { bern: true, kantonBE: true } }
const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
const blatt = (f: Fall): BefundBlatt => befundblaetter(r0, f, BERN)[0]
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').replace(/ \( /g, ' (').replace(/ \)/g, ')')
/** Fall mit Strecke/Zone bewusst offen (Begegnungszone offen → Zulässigkeit offen) */
const fOffen = fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: null, quelle: 'hand' } } } })
const bOffen = blatt(fOffen)
const satzZahl = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).length

describe('Runde 4: Quellenverzeichnis', () => {
  it('jedes Werk hat Ebene und eigene Sätze (was, ausser bei Normen wie verbindlich); Bundesrecht verbindlich, Projektentscheid kein Werk', () => {
    expect(Object.keys(WERK_INFO).sort()).toEqual(Object.keys(WERKE).sort())
    for (const w of WERK_IDS) {
      const i = WERK_INFO[w]
      expect(i.was, w).toMatch(/\.$/)
      // Normen: nur der erste Satz (Nutzerentscheid 23.10.2026), sonst zwei Sätze
      if (i.ebene === 'Norm') expect(i.gilt, w).toBe('')
      else expect(i.gilt, w).toMatch(/\.$/)
      expect(satzZahl(werkText(w)), w).toBe(i.ebene === 'Norm' ? 1 : 2)
      expect(werkText(w), w).not.toMatch(/anerkannte Fachregeln|kein Gesetz/)
      expect(werkText(w).length, w).toBeLessThanOrEqual(320)
      expect(werkText(w).toLowerCase(), w).not.toContain('zebra')
      expect(nummernOhneTitel(werkText(w)), w).toEqual([])
    }
    for (const w of ['VOT30', 'SSV', 'VRV'] as WerkId[]) expect(WERK_INFO[w]).toMatchObject({ ebene: 'Recht', gilt: 'Bundesrecht, verbindlich.' })
    for (const w of ['40241', '40240', '640075'] as WerkId[]) expect(WERK_INFO[w].gilt).toBe('')
    expect(WERK_INFO.MP.gilt).toContain('eigenen Projekte der Stadt Bern verbindlich')
    expect(WERK_INFO.AHBE.gilt).toContain('eigenen Projekte des Kantons verbindlich')
    expect(WERK_INFO.AHBE.gilt).toMatch(/^Arbeitshilfe der kantonalen Verwaltung, keine Rechtsnorm/)
    expect(WERK_INFO.BFU.gilt).toContain('Fachstelle')
    expect(WERK_INFO.VCS.gilt).toContain('Verbands')
    expect(WERK_INFO.ENTSCHEID).toMatchObject({ ebene: 'Projektentscheid' })
    expect(WERK_INFO.ENTSCHEID.gilt).toContain('Kein externes Werk')
  })
  it('Ebene des Werks passt zur Ebene der Regeln, die es als erste Quelle nennen (Grundprüfung: bfu als Richtlinie)', () => {
    const passt: Record<string, string[]> = { Recht: ['Recht', 'Projektentscheid'], Norm: ['Norm', 'Projektentscheid'],
      Bern: ['Standard Stadt Bern'], 'Kanton BE': ['Arbeitshilfe Kanton Bern'], Richtlinie: ['Richtlinie bzw. Empfehlung'] }
    for (const id of REGEL_IDS) {
      const d = KATALOG[id] as RegelDef
      if (!d.ebene || d.art === 'gestrichen') continue
      expect(passt[d.ebene], `${id} ${d.ebene}`).toContain(WERK_INFO[d.quellen[0].werk as WerkId].ebene)
    }
  })
  it('Zahl der Regeln je Werk aus dem Katalog (Regeln mit eigenem Befund, ohne Weichen)', () => {
    const n = regelnJeWerk()
    const handgezaehlt = REGEL_IDS.filter(id => (KATALOG[id] as RegelDef).art === 'befund' &&
      (KATALOG[id] as RegelDef).quellen.some(q => q.werk === '40241')).length
    expect(n.get('40241')).toBe(handgezaehlt)
    expect(n.get('40241')).toBeGreaterThan(40)
    expect(n.get('BFU')).toBeGreaterThan(10)
    expect(n.get('VCS')).toBe(0)          // nur die gestrichene Regel nennt den VCS
    expect([...n.keys()]).toEqual(WERK_IDS)
  })
  it('im Fall: nur die Werke der Einträge und der Grundprüfung; Hilfe-Tabelle mit den Werken mit mindestens einer Prüfung und Anker', () => {
    const b = blatt(fallMit())
    const w = werkeImFall([b])
    const erwartet = new Set([...b.befund.alle.map(x => x.id), ...b.grund.punkte.flatMap(p => [...p.teile, ...p.notizen].map(t => t.id)),
      ...b.grund.weitere.map(t => t.id)].flatMap(werkeVon))
    erwartet.delete('ENTSCHEID')
    expect(new Set(w)).toEqual(erwartet)
    expect(w).toContain('BFU')
    expect(w).not.toContain('VCS')
    const hilfe = renderToStaticMarkup(<QuellenTabelle />)
    const n = regelnJeWerk()
    for (const x of WERK_IDS) expect(hilfe.includes(`id="quelle-${x}"`), x).toBe(x !== 'ENTSCHEID' && (n.get(x) ?? 0) > 0)
    expect(hilfe).not.toContain('id="quelle-VCS"')
    // nur externe Werke: kein Projektentscheid in der Tabelle (der Begriff erklärt ihn)
    expect(hilfe).not.toContain('id="quelle-ENTSCHEID"')
    expect(BEGRIFFE.some(b => b.id === 'projektentscheid')).toBe(true)
    const pe = REGEL_IDS.find(id => (KATALOG[id] as RegelDef).quellen[0]?.werk === 'ENTSCHEID')!
    expect(renderToStaticMarkup(<QuelleMitVerweis id={pe} quelle="" />)).toContain('href="#begriff-projektentscheid"')
    expect(renderToStaticMarkup(<BegriffeListe />)).toContain('id="begriff-projektentscheid"')
    // voller Titel und Link zum Herausgeber (23.10.2026)
    expect(text(hilfe)).toContain(`VSS 40 241 ${WERKE['40241'].voll} (kostenpflichtig) 2019-03 Norm ${WERK_INFO['40241'].was}`)
    expect(hilfe).not.toMatch(/mobilityplatform|vss\.ch/)
    expect(hilfe).toContain(`<a href="${WERKE.BFU.pdf.url}" target="_blank" rel="noopener" class="werk-extern"`)
    expect(text(hilfe)).toContain(`${WERKE.BFU.voll} Seite ↗ · PDF, 0,2 MB ↗`)
    // jede PDF-Adresse ist als PDF gekennzeichnet
    for (const w of WERK_IDS) {
      const pdf = WERKE[w].pdf
      if (pdf && (n.get(w) ?? 0) > 0) expect(text(hilfe), w).toMatch(new RegExp(`PDF, ${String(pdf.mb).replace('.', ',')} MB ↗`))
    }
    expect(nummernOhneTitel(text(hilfe))).toEqual([])
  })
  it('Details je Eintrag: Werkname als Verweis auf das Verzeichnis mit vollem Titel und Satz als Tooltip, Link ↗ zum Herausgeber; im Bericht reiner Text', () => {
    const panel = renderToStaticMarkup(<BefundblattAnzeige b={bOffen} />)
    expect(panel).toMatch(/<a href="#quelle-[^"]+" class="werk-link" title="[^"]+">/)
    // Nutzertest 23.10.2026: Lesename statt Kennung, Artikel direkt in fedlex
    expect(panel).toContain(`href="#quelle-VOT30" class="werk-link" title="${WERKE.VOT30.voll}. ${WERK_INFO.VOT30.was} ${WERK_INFO.VOT30.gilt}">Tempo-30-Zonen-Verordnung (SR 741.213.3)</a>`)
    expect(panel).toContain(`<a href="${WERKE.VOT30.seite}#art_4" target="_blank" rel="noopener" class="werk-extern"`)
    expect(text(panel).replace(/ ,/g, ',')).toContain('Tempo-30-Zonen-Verordnung (SR 741.213.3), Art. 4 Abs. 2 ↗')
    const druck = renderToStaticMarkup(<BefundblattAnzeige b={bOffen} druck />)
    expect(druck).not.toContain('werk-link')
    expect(druck).not.toContain('werk-extern')
    expect(druck).toContain('Tempo-30-Zonen-Verordnung (SR 741.213.3), Art. 4 Abs. 2')
    // Kann A2: Begegnungszone offen (Tempo 20 ohne Zonenangabe) → im Bericht «Empfehlung: folgt, sobald …»
    const b20 = blatt(fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: null, quelle: 'hand' }, vSig: { wert: 20, quelle: 'hand' } } } }))
    expect(b20.befund.empfehlung.typ).toBe('keiner')
    const d20 = text(renderToStaticMarkup(<BefundblattAnzeige b={b20} druck />))
    expect(d20).toContain('Empfehlung folgt, sobald geklärt ist, ob die Querung in einer Begegnungszone liegt (siehe Zusammenfassung)')
    expect(d20).not.toContain('Empfohlen:')
    expect(text(druck)).toContain('Falls zulässig: Fussgängerstreifen')      // Tempo 50: Begegnungszone nicht möglich (Runde 5: Zone offen)
  })
})

describe('Runde 4: Begriffe', () => {
  /** feste Liste: Begriffe, die in Feldnamen bzw. Fragen der Maske vorkommen (kein generischer Detektor) */
  const ERWARTET = ['v85', 'dtv', 'lsa', 'warteflaeche', 'sichtweite', 'insel', 'teilquerung', 'mehrzweck', 'trottoirueberfahrt',
    'begegnungszone', 'zone', 'strassentyp', 'basisnetz', 'grund', 'spitzenstunden', 'fahrstreifen', 'knoten', 'rueckversatz', 'radius',
    'signal411', 'hvl', 'taktil', 'absenkung', 'einengung', 'eigentrassee', 'haltestelle']
  it('jeder Begriff hat Namen und eine eigene Erklärung in ein bis zwei Sätzen; Namen und Kennungen eindeutig', () => {
    expect(BEGRIFFE.length).toBeGreaterThanOrEqual(30)
    expect(new Set(BEGRIFFE.map(b => b.id)).size).toBe(BEGRIFFE.length)
    expect(new Set(BEGRIFFE.map(b => b.name)).size).toBe(BEGRIFFE.length)
    for (const b of BEGRIFFE) {
      expect(b.text.length, b.id).toBeGreaterThan(40)
      expect(b.text.length, b.id).toBeLessThanOrEqual(230)
      expect(b.text, b.id).toMatch(/\.$/)
      expect(satzZahl(b.text), b.id).toBeLessThanOrEqual(2)
      expect(b.text.toLowerCase(), b.id).not.toContain('zebra')
      expect(nummernOhneTitel(b.text), b.id).toEqual([])
      expect(begriffeIn(b.name).map(x => x.id), b.id).toContain(b.id)      // der Name trifft das eigene Muster
    }
    const alpha = begriffeAlphabetisch().map(b => b.name.toLowerCase())
    expect(alpha).toEqual([...alpha].sort((a, c) => a.localeCompare(c, 'de')))
  })
  it('Wächter: die Begriffe aus Feldnamen und Fragen stehen in der Liste und kommen dort wirklich vor', () => {
    const texte = [...FELD_DEFS.map(d => d.name), ...Object.values(FRAGEN)]
    for (const id of ERWARTET) {
      expect(BEGRIFFE.some(b => b.id === id), id).toBe(true)
      expect(texte.some(t => begriffeIn(t).some(b => b.id === id)), id).toBe(true)
    }
  })
  it('Muster erkennen ganze Wörter: «Insel» nicht in «Inselspitze», «Furt» nicht in «Rollstuhlfurt», LSA in «LSA-Zeiten»', () => {
    const ids = (t: string) => begriffeIn(t).map(b => b.id)
    expect(ids('Wie weit ragt die Inselspitze hinaus?')).not.toContain('insel')
    expect(ids('Rollstuhlfurt')).not.toContain('furt')
    expect(ids('LSA-Zeiten')).toContain('lsa')
    expect(ids('Liegt die Querung bei einer Tramhaltestelle?')).toEqual([])
    expect(ids('Gefahrenes Tempo (V85)')).toEqual(['v85'])
  })
  it('im Fall (Bericht): nur vorkommende Begriffe, alphabetisch; Feldhilfe und Details mit dezentem Verweis, Zusammenfassung ohne', () => {
    const bs = begriffeImFall([bOffen])
    expect(bs.length).toBeGreaterThan(3)
    expect(bs.map(b => b.id)).toContain('begegnungszone')
    expect(bs.map(b => b.name)).toEqual(begriffeAlphabetisch().filter(b => bs.includes(b)).map(b => b.name))
    const bericht = renderToStaticMarkup(<VerzeichnisBericht blaetter={[bOffen]} />)
    expect(bericht).toContain('<h3>Quellen der Beurteilung</h3>')
    expect(bericht).toContain('<h3>Begriffe</h3>')
    expect(text(bericht)).toContain(`Begegnungszone: ${BEGRIFFE.find(b => b.id === 'begegnungszone')!.text}`)
    expect(bericht).not.toContain('begriff-knopf')
    expect(nummernOhneTitel(text(bericht))).toEqual([])
    // Bericht: voller Titel und Adresse als Text (druckbar)
    expect(text(bericht)).toContain(`${WERKE.VOT30.name} (${WERKE.VOT30.ausgabe}): ${WERKE.VOT30.voll}.`)
    expect(text(bericht)).toContain(`Seite: ${WERKE.VOT30.seite}`)
    expect(bericht).not.toContain('target="_blank"')
    const panel = renderToStaticMarkup(<BedarfAbschnitt fall={fOffen} blaetter={[bOffen]} vorgabe={BERN.vorgabe} aendern={() => {}} />)
    expect(panel).toContain('class="begriff-knopf"')
    const zf = /<p class="bedarf-zusammenfassung">.*?<\/p>/.exec(panel)![0]
    expect(zf).not.toContain('begriff')
    const hilfe = text(renderToStaticMarkup(<BegriffeListe />))
    for (const b of BEGRIFFE) expect(hilfe).toContain(`${b.name} ${b.text}`)
    expect(nummernOhneTitel(hilfe)).toEqual([])
  })
})

describe('Runde 4: Muss-Hinweis an offenen Feldern', () => {
  it('Text: Muss, Muss und Soll, Soll, nur Hinweise, Zulässigkeit; nichts, wenn das Feld für keine Prüfung fehlt', () => {
    const x = (muss: number, soll = 0, hinweis = 0, zulaessigkeit = false) => feldBedarfText({ muss: Array(muss).fill('a'),
      soll: Array(soll).fill('b'), hinweis: Array(hinweis).fill('c'), zulaessigkeit })
    expect(x(2)).toBe('fehlt für 2 Muss-Prüfungen')
    expect(x(1)).toBe('fehlt für 1 Muss-Prüfung')
    expect(x(1, 1)).toBe('fehlt für 1 Muss- und 1 Soll-Prüfung')
    expect(x(2, 3)).toBe('fehlt für 2 Muss- und 3 Soll-Prüfungen')
    expect(x(0, 1)).toBe('fehlt für 1 Soll-Prüfung')
    expect(x(0, 0, 2)).toBe('fehlt nur für 2 Hinweise')
    expect(x(2, 0, 0, true)).toBe('entscheidet über die Zulässigkeit')
    expect(x(0)).toBeNull()
    expect(feldBedarfText(undefined)).toBeNull()
  })
  it('aus den offenen Einträgen und der Grundprüfung, je Regel mit ihrer Stärke; Strecke/Zone offen entscheidet über die Zulässigkeit', () => {
    const m = feldBedarf([bOffen])
    expect(m.get('tempoRegime')?.zulaessigkeit).toBe(true)
    // jede gezählte Regel ist offen und nennt das Feld (Befund bzw. Grundprüfung), mit passender Stärke
    const offen = [...bOffen.befund.alle.filter(x => x.zustand === 'offen').map(x => ({ id: x.id, st: x.staerke, f: x.fehlend ?? [] })),
      ...[...bOffen.grund.punkte.flatMap(p => p.teile), ...bOffen.grund.weitere].filter(t => t.zustand === 'offen').map(t => ({ id: t.id, st: t.staerke ?? (KATALOG[t.id] as RegelDef).staerke!, f: t.fehlend ?? [] }))]
    for (const [feld, x] of m) {
      for (const id of x.muss) expect(offen.some(o => o.id === id && ['hart', 'hart_bericht'].includes(o.st) && o.f.some(f => feld === f || feld.startsWith(`${f}.`) || (f === 'fgQuelle' && feld === 'fg5h'))), `${feld} ${id}`).toBe(true)
      for (const id of x.soll) expect(offen.some(o => o.id === id && o.st === 'weich'), `${feld} ${id}`).toBe(true)
    }
    expect([...m.values()].some(x => x.muss.length > 0)).toBe(true)
  })
  it('Geltung beachtet: eine offene Regel, die im Fall nicht greifen kann, zählt nicht', () => {
    const b: BefundBlatt = { ...bOffen, befund: { ...bOffen.befund, alle: [...bOffen.befund.alle,
      { id: 'F2', ebene: 'Norm', staerke: 'hart', zustand: 'offen', text: 'Test', quelle: 'Test', fehlend: ['insel.breite'] }] } }
    expect(b.gebildet.eingaben.insel.wert?.vorhanden ?? false).toBe(false)
    expect(feldBedarf([b]).get('insel.breite')).toBeUndefined()
    const mitInsel: BefundBlatt = { ...b, gebildet: { ...b.gebildet, eingaben: { ...b.gebildet.eingaben,
      insel: { wert: { vorhanden: true, art: 'baulich', breite: null }, quelle: 'hand' } as never } } }
    expect(feldBedarf([mitInsel]).get('insel.breite')?.muss).toContain('F2')
  })
  it('Maske: Zusatz klein und grau mit Symbol bei offenen Feldern', () => {
    const html = renderToStaticMarkup(<BedarfAbschnitt fall={fOffen} blaetter={[bOffen]} vorgabe={BERN.vorgabe} aendern={() => {}} />)
    const zeile = (pfad: string) => new RegExp(`<tr id="${feldZeileId(pfad)}"[^>]*>.*?</tr>`).exec(html)?.[0] ?? ''
    // 23.10.2026: offene Angaben der erweiterten Prüfung stehen als Frage im Thema (statt als Zeile der Maske), mit «für: …»
    expect(zeile('tempoRegime')).toBe('')
    expect(new RegExp(`<li id="${feldZeileId('tempoRegime')}">.*?</li>`).exec(html)?.[0]).toContain('für: ')
    const m = feldBedarf([bOffen])
    const mitText = FELD_DEFS.filter(d => html.includes(`<tr id="${feldZeileId(d.pfad)}"`) && feldBedarfText(m.get(d.pfad)) &&
      bOffen.gebildet.herkunft.get(d.pfad)?.zustand !== 'vorbelegt')
    expect(mitText.length).toBeGreaterThan(3)
    for (const d of mitText) expect(zeile(d.pfad), d.pfad).toContain(`⚑</span> ${feldBedarfText(m.get(d.pfad))}`)
    // vorbelegte Felder ohne Bestätigung: kein Zusatz
    expect(zeile('vSig')).not.toContain('feld-bedarf')
  })
  it('«Vorschlag bestätigen» nur, wo ein Verbot (nurMitBestaetigung) an der Annahme hängt: Strecke/Zone, besonderer Grund, Knotensicht', () => {
    expect([...BESTAETIGUNG_MOEGLICH].sort()).toEqual(['beduerfnis', 'q3.knotensichtOk', 'tempoRegime'])
    expect(REGEL_IDS.filter(id => (KATALOG[id] as RegelDef).nurMitBestaetigung).sort()).toEqual(['A2', 'C2', 'Q3-11'])
  })
})

describe('Runde 4: Abstand bei beidseitigem Strassenende (ganze Strasse)', () => {
  const mit = (fgs: number, lsa: number) => {
    const e = testfall({})
    e.abstandFgsM = { wert: fgs, quelle: 'annahme', ganzeStrasse: true }
    e.abstandLsaM = { wert: lsa, quelle: 'annahme', ganzeStrasse: true }
    return beurteile(e, { ebenen: { bern: true, kantonBE: true } })
  }
  it('40 m bzw. 153 m: G1/G2 als Hinweis «nicht anwendbar», kein Befund; Masse-Zeile «ganze Strasse» ohne Soll, nicht verletzt', () => {
    for (const L of [40, 153]) {
      const b = mit(L, L)
      const g1 = b.alle.find(x => x.id === 'G1')!, g2 = b.alle.find(x => x.id === 'G2')!
      expect(g1).toMatchObject({ zustand: 'verletzt', staerke: 'hinweis', ist: `${L} (ganze Strasse)` })
      expect(g1.text).toBe('Kein weiterer Fussgängerstreifen auf dieser Strasse möglich (sie endet beidseits ohne Fortsetzung): Abstand nicht anwendbar')
      expect(g2.text).toBe('Kein Lichtsignal auf dieser Strasse (sie endet beidseits ohne Fortsetzung): Abstand nicht anwendbar')
      expect(eintragSatz(g1)).toBe(`${g1.text} (Ist ${L} m (ganze Strasse))`)
      expect(b.norm.empfehlungen.concat(b.norm.verletzungen, b.norm.bericht).some(x => ['G1', 'G2'].includes(x.id))).toBe(false)
      const mz = b.masse.find(m => m.groesse === 'Abstand zum nächsten Fussgängerstreifen')!
      expect(mz).toMatchObject({ ist: `${L} (ganze Strasse)`, soll: '', zustand: 'nicht_anwendbar' })
      expect(b.masse.find(m => m.groesse === 'Abstand zur nächsten LSA')).toMatchObject({ soll: '', zustand: 'nicht_anwendbar' })
    }
    // ohne Kennzeichen (z. B. von Hand): wie bisher, 40 m ist ein Befund
    const e = testfall({ abstandFgsM: 40, verzweigung: false, haltestelleAngrenzend: false })
    expect(beurteile(e, { ebenen: { bern: true, kantonBE: true } }).alle.find(x => x.id === 'G1')).toMatchObject({ zustand: 'verletzt', staerke: 'weich' })
  })
  it('Masse-Zeile im Panel und Bericht: Soll «–», Ist «40 m (ganze Strasse)», Stand «nicht anwendbar» (grau, Symbol i), nie «erfüllt»', () => {
    const befund = mit(40, 40)
    const b: BefundBlatt = { ...bOffen, befund }
    for (const html of [renderToStaticMarkup(<BefundblattAnzeige b={b} />), renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)]) {
      const zeile = /<tr class="nicht_anwendbar">.*?<\/tr>/.exec(html)?.[0] ?? ''
      expect(text(zeile)).toContain('Abstand zum nächsten Fussgängerstreifen')
      expect(text(zeile)).toContain('– 40 m (ganze Strasse) i nicht anwendbar')
      expect(zeile).not.toContain('erfüllt')
    }
  })
  it('Kennzeichen nur aus der Vorbelegung; eine Handeingabe trägt es nicht', () => {
    const vor = { abstandFgsM: { wert: 40, quelle: 'annahme' as const, text: 'ganze Strasse', ganzeStrasse: true as const } }
    expect(eingabenBilden(vor, null).eingaben.abstandFgsM).toEqual({ wert: 40, quelle: 'annahme', ganzeStrasse: true })
    expect(eingabenBilden(vor, { felder: { abstandFgsM: { wert: 40, quelle: 'hand' } } }).eingaben.abstandFgsM).toEqual({ wert: 40, quelle: 'hand' })
  })
})

describe('Hilfe kurz; Quellen und Begriffe als eigene Abschnitte (23.10.2026)', () => {
  it('«So funktioniert\'s»: höchstens 8 kurze Schritte, ausführliche Bedienung und Grenzen zugeklappt, ohne Quellen- und Begriffstabelle', () => {
    const html = renderToStaticMarkup(<Anleitung />)
    const schritte = /<ol>(.*?)<\/ol>/s.exec(html)![1].match(/<li>/g)!.length
    expect(schritte).toBeLessThanOrEqual(8)
    for (const li of /<ol>(.*?)<\/ol>/s.exec(html)![1].split('<li>').slice(1)) expect(text(li).length).toBeLessThanOrEqual(260)
    expect(html).toContain('<summary>Mehr zur Bedienung</summary>')
    expect(html).toContain('<summary>Grenzen der App</summary>')
    expect(html).not.toContain('quellen-tabelle')
    expect(html).not.toContain('begriffe-liste')
    expect(text(html)).toContain('«Grundlagen und Quellen» und «Begriffe»')
    // ausführliche Bedienung bleibt erhalten (nur verschoben)
    for (const t of ['Ecke runden:', 'Mittelinsel (Standard):', 'Vermassung ab Fixpunkt:', 'Feldhilfen:', 'Grundprüfung (Big Five, bfu):'])
      expect(text(html)).toContain(t)
  })
  it('Begriff-Knopf: Erklärung mit Sprung zum Abschnitt «Begriffe»; Quellen-Anker in der Tabelle', () => {
    const tab = renderToStaticMarkup(<QuellenTabelle />)
    expect(tab).toContain('id="quelle-BFU"')
    expect(renderToStaticMarkup(<BegriffeListe />)).toContain('id="begriff-begegnungszone"')
  })
})

describe('Feste Texte mit Werkverweisen (Nutzerbefund 23.10.2026)', () => {
  it('«Rechnung und Sichtweiten»: je genanntes Werk ein Verweis ins Quellenverzeichnis, VRV mit Artikel-Link, bfu mit Link zum Herausgeber', () => {
    const html = renderToStaticMarkup(<RechnungGrundlagen />)
    for (const w of ['40241', 'BFU', 'VRV']) expect(html, w).toContain(`href="#quelle-${w}" class="werk-link"`)
    expect(html).toContain(`href="${WERKE.VRV.seite}#art_18"`)
    expect(html).toContain(`href="${WERKE.BFU.seite}"`)
    expect(text(html)).toContain('Verkehrsregelnverordnung (VRV)')
    expect(text(html)).not.toMatch(/\b(Z|Tab)\. /)
    // Hilfe «Mehr zur Bedienung»: Werknamen verlinkt
    const hilfe = renderToStaticMarkup(<Anleitung />)
    for (const w of ['40241', '40240', 'BFU', 'MP', 'AHBE']) expect(hilfe, w).toContain(`href="#quelle-${w}"`)
  })
})

describe('Kein Satz zur Rechtsnatur (Nutzerentscheid 23.10.2026)', () => {
  it('weder «kein Gesetz» noch «keine Gesetze» im Panel, Befundblatt, Bericht, in den Quellen und der Hilfe', () => {
    const htmls = [renderToStaticMarkup(<BedarfAbschnitt fall={fOffen} blaetter={[bOffen]} vorgabe={BERN.vorgabe} aendern={() => {}} />),
      renderToStaticMarkup(<BefundblattAnzeige b={bOffen} druck />), renderToStaticMarkup(<VerzeichnisBericht blaetter={[bOffen]} />),
      renderToStaticMarkup(<QuellenTabelle />), renderToStaticMarkup(<Anleitung />)]
    for (const h of htmls) expect(text(h)).not.toMatch(/kein Gesetz|keine Gesetze|Rechtssinn/)
  })
})
