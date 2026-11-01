// Tests 23.10.2026: Block «Offene Fragen» unter der Zusammenfassung (wichtige Fragen direkt beantworten). Künstliche Strasse wie
// runde4.test.tsx (Hauptstrasse West–Ost, Fahrbahn 8 m, Tempo 50, Übergang bei x = 0).
import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { leererFall, type Fall } from '../fall'
import { befundblaetter, type BefundBlatt } from './befundblatt'
import { bestaetigungsFelder } from './feldbedarf'
import { FELD_DEF } from './felder'
import { handSetzen, type Herkunft } from './fallBedarf'
import { entscheidendeFelder, offeneFragen, offeneFragenAus, zfEingabeBlatt, zusammenfassung } from './zusammenfassung'
import { TESTFAELLE, fall as testfall } from './testfaelle'
import { grundpruefung } from './grundpruefung'
import { grundKopf } from './kompakt'
import { beurteile } from './entscheid'
import { BedarfAbschnitt, FeldEingabe, ListeMitKnopf, Maske, ZusammenfassungAnzeige, eingabeUebernehmen } from '../BedarfPanel'
import { FELD_DEFS, istGrundFeld } from './felder'
import { sichtbar, type SichtKontext } from './feldhilfen'

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
const OHNE = { vorgabe: { bern: false, kantonBE: false } }
const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
const blatt = (f: Fall): BefundBlatt => befundblaetter(r0, f, OHNE)[0]
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').replace(/ \( /g, ' (').replace(/ \)/g, ')')
const panel = (f: Fall, b: BefundBlatt) => renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[b]} vorgabe={OHNE.vorgabe} aendern={() => {}} />)
const block = (html: string): string => { const i = html.indexOf('<div class="offene-fragen"'); return i < 0 ? '' : html.slice(i, html.indexOf('</ul>', i)) }
/** Zulässigkeit offen: Strecke oder Zone bewusst offen */
const fOffen = fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: null, quelle: 'hand' } } } })
const bOffen = blatt(fOffen)

/** Knöpfe eines Elementbaums (ohne Rendern), für Klicks ohne DOM */
function knoepfe(n: ReactNode): ReactElement<{ onClick: () => void; children: ReactNode; 'aria-label'?: string }>[] {
  if (Array.isArray(n)) return n.flatMap(knoepfe)
  if (!isValidElement(n)) return []
  const el = n as ReactElement<{ children?: ReactNode; onClick?: () => void }>
  return [...(el.type === 'button' ? [el as never] : []), ...knoepfe(el.props.children)]
}
const OFFEN_H: Herkunft = { zustand: 'offen', quelle: null, text: 'offen' }

describe('Block «Offene Fragen»: nur Grundprüfung, ohne Nummern, festes Zeichen', () => {
  it('nur Felder offener Regeln der Grundprüfung; feste Reihenfolge nach Punkt (Tempo, ① bis ⑤), ohne ergänzende bfu-Aspekte; je Feld einmal', () => {
    const fr = offeneFragen(bOffen, bestaetigungsFelder([bOffen]))
    expect(fr.length).toBeGreaterThan(0)
    const b5 = new Set([...bOffen.grund.punkte.flatMap(p => p.teile), ...bOffen.grund.weitere].filter(t => t.zustand === 'offen')
      .flatMap(t => t.fehlend ?? []).map(f => (f === 'fgKlasse' ? 'fg5h' : f)))
    for (const f of fr) expect(b5.has(f.feld), f.feld).toBe(true)
    // keine Frage der erweiterten Prüfung (Strecke oder Zone gehört nicht zur Grundprüfung)
    expect(fr.map(f => f.ziel)).not.toContain('tempoRegime')
    // feste Reihenfolge (Nutzerentscheid 23.10.2026), entscheidende nur mit Hinweis «davon hängt die Antwort ab»
    const reihe = ['T', '1', '2', '3', '4', '5'], pos = fr.map(f => reihe.indexOf(String(f.punkte[0])))
    expect(pos).toEqual([...pos].sort((a, b) => a - b))
    expect(new Set(fr.map(f => f.ziel)).size).toBe(fr.length)
  })
  it('jede offene Zeile der Grundprüfung mit fehlender Angabe hat eine Frage im Block (alle Testfälle); ⑤ gezählt oder geschätzt als eine Frage', () => {
    let n = 0
    const OFFEN = { beleuchtung: null, fg5h: null, fgKlasse: null, erkennungM: null, anzeichenSchneller: null, v85: null, durchfahrt: null }
    for (const t of [...TESTFAELLE, ...TESTFAELLE.map(x => ({ ...x, abw: { ...x.abw, ...OFFEN } }))]) {
      const e = testfall(t.abw), g = grundpruefung(e)
      if (!g.gilt) continue
      const fr = offeneFragenAus(g, entscheidendeFelder({ befund: beurteile(e, { ebenen: t.ebenen }) }), () => 'eingabe')
      const k = grundKopf(g)
      for (const [i, z] of k.zeilen.entries()) {
        const felder = z.fragen.filter(f => f !== 'Zufahrten')
        if (z.zustand !== 'offen' || !felder.length) continue
        n++
        expect(fr.some(f => f.punkte.includes(g.punkte[i].nr)), `${t.regel} ${t.name}: Zeile ${g.punkte[i].nr}`).toBe(true)
      }
      expect(fr.filter(f => ['fg5h', 'fgKlasse'].includes(f.ziel)).length).toBeLessThanOrEqual(1)
    }
    expect(n).toBeGreaterThan(200)
  })
  it('Panel: ohne Nummern, Zeichen des Punkts vor der Frage; nach einer Antwort behalten die übrigen ihr Zeichen; ⑤ mit Zahl und Schätzung', () => {
    // Erkennungsdistanz von Hand offen: sonst belegt sie der Sichtrechner auf der geraden, freien Strasse vor (Abschnitt 34)
    const f0 = fallMit(x => { x.bedarf = { felder: { erkennungM: { wert: null, quelle: 'hand' } } } }), b0 = blatt(f0)
    const fr = offeneFragen(b0, new Set())
    const html = panel(f0, b0), bl = block(html)
    expect(bl).not.toContain('<ol')
    expect(bl.match(/<li>/g)!.length).toBe(fr.length)
    expect(text(bl)).toContain('Offene Fragen der Grundprüfung')
    // Zusatz nur, wo die Antwort daran hängt; keine Fragen der ergänzenden bfu-Aspekte (Nutzerentscheid 23.10.2026)
    expect((text(bl).match(/\(davon hängt die Antwort ab\)/g) ?? []).length).toBe(fr.filter(f => f.entscheidend).length)
    expect(text(bl)).not.toMatch(/fehlt für|Ergänzend|Weitere/)
    expect(fr.every(f => !f.punkte.includes('W'))).toBe(true)
    // ① Erkennungsdistanz verständlich, mit der Empfehlung aus dem Soll
    expect(text(bl)).toMatch(/① Ab welcher Entfernung sehen Fahrende den Streifen \(Markierung oder Signal\)\? Empfohlen: doppelte Sichtweite, hier \d+ m\./)
    const q5 = fr.find(f => f.ziel === 'fg5h')
    expect(q5?.punkte).toEqual(['5'])
    expect(text(bl)).toMatch(/⑤ Wie viele Personen queren in den 5 Spitzenstunden \(gezählt oder geschätzt\)\?.* gezählt: .*übernehmen oder geschätzt: unter 100/)
    expect(text(html)).toContain(`${fr.length} Fragen der Grundprüfung stehen unten.`)
    // Antwort auf die erste Frage: sie verschwindet, die Zeichen der übrigen bleiben
    const erste = fr[0]
    const d = FELD_DEF.get(erste.ziel)!
    const wert = d.art.art === 'bool' ? true : d.art.art === 'wahl' ? d.art.optionen[0][0] : d.art.art === 'liste' ? [] : 5
    const f1 = fallMit(x => { x.bedarf = handSetzen(f0.bedarf, erste.ziel, wert, 'hand') ?? undefined })
    const fr1 = offeneFragen(blatt(f1), new Set())
    expect(fr1.map(f => f.ziel)).not.toContain(erste.ziel)
    for (const f of fr1) { const vor = fr.find(x => x.ziel === f.ziel); if (vor) expect(f.punkte).toEqual(vor.punkte) }
  })
  // vorbelegte Annahme mit Bestätigungspflicht («Vorschlag bestätigen», «ändern»): automatikC.test.ts (M2), mit Geodaten Bern
})

describe('Block «Offene Fragen»: Eingabe je Feldart schreibt dieselbe Handeingabe wie die Maske', () => {
  const aufruf = (pfad: string, h: Herkunft = OFFEN_H) => {
    const werte: unknown[] = []
    const setze = (x: unknown) => { werte.push(x); return true }
    return { el: FeldEingabe({ d: FELD_DEF.get(pfad)!, h, setze, offen: () => {}, knoepfe: true, label: 'Frage?' }), werte, setze }
  }
  it('Ja/Nein: Knöpfe mit der Frage als Beschriftung, Wert true bzw. false', () => {
    const { el, werte } = aufruf('anzeichenSchneller')
    const k = knoepfe(el)
    expect(k.map(x => x.props['aria-label'])).toEqual(['Frage? ja', 'Frage? nein'])
    k.forEach(x => x.props.onClick())
    expect(werte).toEqual([true, false])
  })
  it('Auswahl bis 4 Optionen: Knöpfe mit dem Schlüssel der Option (wie die Auswahlliste der Maske)', () => {
    const d = FELD_DEF.get('tempoRegime')!
    const { el, werte } = aufruf('tempoRegime')
    knoepfe(el).forEach(x => x.props.onClick())
    expect(werte).toEqual(d.art.art === 'wahl' ? d.art.optionen.map(o => o[0]) : [])
  })
  it('Zahl: Eingabefeld mit Einheit und «übernehmen»; die Übernahme ist eingabeUebernehmen der Maske', () => {
    const { el, werte } = aufruf('vSig')
    const html = renderToStaticMarkup(el)
    expect(text(html)).toContain('km/h übernehmen')
    expect(html).toContain('aria-label="Frage?"')
    const te = (el.props as { children: ReactNode[] }).children[0] as ReactElement<{ setze: (x: unknown) => boolean }>
    te.props.setze(40)
    expect(werte).toEqual([40])
    // vorbelegt mit demselben Wert: keine Handeingabe (wie die Maske)
    const hv: Herkunft = { zustand: 'vorbelegt', quelle: 'osm', text: 'OSM', vorbelegt: { wert: 40, quelle: 'osm', text: 'OSM' } }
    const v = aufruf('vSig', hv)
    const tv = (v.el.props as { children: ReactNode[] }).children[0] as ReactElement<{ setze: (x: unknown) => boolean }>
    expect(tv.props.setze(40)).toBe(eingabeUebernehmen(hv, 40, v.setze))
    expect(v.werte).toEqual([])
  })
  it('Liste: Kästchen sammeln, «übernehmen» setzt die Liste', () => {
    const pfad = [...FELD_DEF.values()].find(d => d.art.art === 'liste')!.pfad
    const { el } = aufruf(pfad)
    expect(isValidElement(el) && el.type === ListeMitKnopf).toBe(true)
    const html = renderToStaticMarkup(el)
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('>keines</button>')
  })
})

describe('Zusammenfassung mit Block: Satz 3 zählt die Fragen der Grundprüfung, die übrigen bleiben ausgeschrieben; Bericht unverändert', () => {
  it('Panel mit Block: Fragen des Blocks nicht ausgeschrieben, Verweis «N Fragen der Grundprüfung stehen unten»; Bericht ohne', () => {
    const x = zfEingabeBlatt(bOffen)
    const fr = offeneFragen(bOffen, new Set())
    const imBlock = fr.flatMap(f => (f.feld === 'fg5h' ? ['fg5h', 'fgKlasse'] : [f.feld]))
    const mit = zusammenfassung({ ...x, imBlock })
    for (const f of imBlock) expect(mit.fehlt?.felder ?? []).not.toContain(f)
    expect(mit.fehlt?.block).toMatch(/^\d+ Fragen? der Grundprüfung stehen? unten\.$/)
    // Strecke oder Zone (erweiterte Prüfung, entscheidet die Antwort) bleibt in Satz 3 ausgeschrieben
    expect(mit.fehlt?.felder).toContain('tempoRegime')
    const bericht = text(renderToStaticMarkup(<ZusammenfassungAnzeige b={bOffen} druck imBlock={imBlock} />))
    expect(bericht).not.toContain('der Grundprüfung stehen unten')
    expect(text(panel(fOffen, bOffen))).toMatch(/Fragen? der Grundprüfung stehen? unten\./)
  })
})

describe('Ausgeblendete Felder: Schalter je Maske (Nutzertest 23.10.2026)', () => {
  it('Grundprüfung und erweiterte Prüfung getrennt gezählt, je ein Schalter «trotzdem zeigen»; eingeblendete Felder mit Vermerk', () => {
    const f0 = fallMit(), b0 = blatt(f0)
    const html = panel(f0, b0)
    const saetze = [...text(html).matchAll(/(\d+) Felde?r? zählen? in diesem Fall nicht und (?:sind|ist) ausgeblendet[^.]*\. trotzdem zeigen/g)]
    const k: SichtKontext[] = [{ e: b0.gebildet.eingaben, ebenen: b0.ebenen }]
    const nicht = (grund: boolean) => FELD_DEFS.filter(d => istGrundFeld(d.pfad) === grund && !k.some(x => sichtbar(d.pfad, x))).length
    const erwartet = [nicht(true), nicht(false)].filter(n => n > 0)
    expect(saetze.map(m => Number(m[1]))).toEqual(erwartet)
    expect(html).not.toContain('alle Felder zeigen')
    // Maske mit eingeblendeten Feldern: Vermerk und graue Zeile
    const erw = FELD_DEFS.filter(d => !istGrundFeld(d.pfad))
    const m = renderToStaticMarkup(<Maske fall={f0} blatt={b0} aendern={() => {}} felder={erw} zaehlt={p => k.some(x => sichtbar(p, x))} alle
      kontexte={k} />)
    expect((m.match(/<tr [^>]*class="[^"]*zaehlt-nicht"/g) ?? []).length).toBe(nicht(false))
    expect(text(m)).toContain('(zählt in diesem Fall nicht)')
  })
})
