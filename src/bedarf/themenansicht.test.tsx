// Tests 23.10.2026: erweiterte Prüfung nach Thema mit Eingaben (bedarf/themenansicht.ts, BedarfPanel). Jedes Feld steht im Panel genau
// einmal, keine offene Angabe mehrfach, jede offene Angabe einer greifenden Regel als Frage in einem Thema dieser Regeln, Sprünge landen
// im richtigen Thema, Bericht ohne Doppelungen. Künstliche Strasse wie offeneFragen.test.tsx; Testfälle des Katalogs wie regelname.test.tsx.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { leererFall, type Fall } from '../fall'
import { befundblaetter, begruendung, typText, type BefundBlatt } from './befundblatt'
import { beurteile } from './entscheid'
import { grundpruefung } from './grundpruefung'
import { TESTFAELLE, fall as testfall, type Abw } from './testfaelle'
import { eingabenBilden, type Vorbelegung } from './fallBedarf'
import { FELD_DEFS, feldName, gruppeVon, istGrundFeld } from './felder'
import { feldZiel, gilt, sichtbar, wertVon, type SichtKontext } from './feldhilfen'
import { istWeiche, themaVon } from './themen'
import { eingabeFeld, feldThema, hatInhalt, themenAnsicht } from './themenansicht'
import { nummernOhneTitel, regelTitel } from './regelname'
import type { RegelId } from './katalog'
import { BedarfAbschnitt, BefundblattAnzeige, GrundpruefungAnzeige, annahmeInTabelle, erweitertKopf, feldZeileId, themaId } from '../BedarfPanel'

// ── künstliche Strasse (Rechnung) ──
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
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -6, 300, 6)), av('Trottoir', rechteck(-300, 6, 300, 9)), av('Trottoir', rechteck(-300, -9, 300, -6))]
const BERN = { bern: true, kantonBE: true }
const fallMit = (felder: Record<string, unknown> = {}): Fall => {
  const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  if (Object.keys(felder).length) x.bedarf = { felder: Object.fromEntries(Object.entries(felder).map(([k, v]) => [k, { wert: v, quelle: 'hand' }])) } as never
  return x
}
const r0 = rechneFall(OSM, AV, [], 12, fallMit(), null)
const blattR = (f: Fall, ebenen = BERN): BefundBlatt => befundblaetter(r0, f, { vorgabe: ebenen })[0]
const panel = (f: Fall, b: BefundBlatt, ebenen = BERN) => renderToStaticMarkup(<BedarfAbschnitt fall={f} blaetter={[b]} vorgabe={ebenen} aendern={() => {}} />)
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').replace(/ \( /g, ' (').replace(/ \)/g, ')')
/** Fälle mit Rechnung: Strecke, Kreuzung mit Insel (wie Zieglerstrasse), Zone offen, Lichtsignal, Einmündung, vieles offen */
const FAELLE: [string, Record<string, unknown>][] = [
  ['leer', {}],
  ['Kreuzung 12 m mit Insel', { lage: 'knoten_berechtigt', fahrbahnB: 12, 'insel.vorhanden': true, 'insel.art': 'baulich', 'insel.breite': 2, innerorts: true }],
  ['Zone offen', { tempoRegime: null }],
  ['Lichtsignal', { typ: 'lsa', fgsMitLsa: true }],
  ['Einmündung', { lage: 'einmuendung' }],
  ['Querung ohne Vortritt', { typ: 'ohne_vortritt', ohneBaulich: true }],
  ['innerorts offen', { innerorts: null }],
]

/** Kennungen der Aufklapper, in denen die Stelle i des HTML liegt (innerste zuletzt) */
function details(html: string, i: number): string[] {
  const stapel: string[] = []
  for (const m of html.slice(0, i).matchAll(/<details([^>]*)>|<\/details>/g)) {
    if (m[0] === '</details>') stapel.pop(); else stapel.push(/id="([^"]+)"/.exec(m[1])?.[1] ?? '')
  }
  return stapel
}

describe('Erweiterte Prüfung nach Thema: Felder, Fragen, Sprünge (Panel)', () => {
  it('jedes Feld steht im Panel genau einmal (Frage oder Angabe); ausgeblendete nur mit «trotzdem zeigen»; Grundprüfung oben', () => {
    for (const [name, felder] of FAELLE) {
      const f = fallMit(felder), b = blattR(f), html = panel(f, b)
      const k: SichtKontext = { e: b.gebildet.eingaben, ebenen: b.ebenen }
      const a = themenAnsicht([b])
      const erw = html.indexOf('<details class="bedarf-erweitert">')
      for (const d of FELD_DEFS) {
        const n = html.split(`id="${feldZeileId(d.pfad)}"`).length - 1
        const soll = sichtbar(d.pfad, k) || a.frageFelder.has(d.pfad) ? 1 : 0
        expect(n, `${name}: ${d.pfad}`).toBe(soll)
        if (n) expect(html.indexOf(`id="${feldZeileId(d.pfad)}"`) > erw, `${name}: ${d.pfad}`).toBe(!istGrundFeld(d.pfad))
      }
      // ohne Ausblenden: Felder der Themen, ohne Thema und Fragen zusammen genau die Felder der erweiterten Prüfung, ohne Überschneidung
      const alle = [...a.themen.flatMap(t => t.felder), ...a.ohneThema, ...a.frageFelder]
      expect(alle.length, name).toBe(new Set(alle).size)
      expect(new Set(alle), name).toEqual(new Set(FELD_DEFS.filter(d => !istGrundFeld(d.pfad)).map(d => d.pfad)))
    }
  })
  it('Teile «Offene Angaben (nach Block der Maske)» und «Weitere Eingaben» entfallen; keine «?»-Einträge mehr im Thema', () => {
    for (const [name, felder] of FAELLE) {
      const f = fallMit(felder), html = panel(f, blattR(f))
      expect(html, name).not.toContain('Offene Angaben (nach Block')
      expect(html, name).not.toContain('Weitere Eingaben')
      expect(html, name).not.toMatch(/<li class="grau"><details class="eintrag-details">/)
      expect(nummernOhneTitel(text(html)), name).toEqual([])
      expect(html.toLowerCase(), name).not.toContain('zebra')
    }
  })
  it('Sprung zum Feld: jedes Feld der erweiterten Prüfung liegt in seinem Thema (bzw. «Weitere Angaben»); Fragen mit Eingabe sind das Ziel', () => {
    let n = 0
    for (const [name, felder] of FAELLE) {
      const f = fallMit(felder), b = blattR(f), html = panel(f, b), a = themenAnsicht([b])
      // eigene Zeile: Themen mit Inhalt, seit 29.10.2026 im Panel auch geprüfte ohne Befund und nicht geprüfte
      const mitTeil = new Set(a.themen.filter(t => html.includes(`id="${themaId(t.thema.id)}"`)).map(t => t.thema.id))
      for (const t of a.themen) {
        for (const p of t.felder) {
          const i = html.indexOf(`id="${feldZeileId(p)}"`)
          if (i < 0) continue
          n++
          expect(details(html, i), `${name}: ${p}`).toContain(themaId(mitTeil.has(t.thema.id) ? t.thema.id : 'weitere'))
        }
        for (const q of t.fragen.filter(x => x.eingabe)) {
          const i = html.indexOf(`<li id="${feldZeileId(q.ziel!)}">`)
          expect(i, `${name}: ${q.ziel}`).toBeGreaterThan(0)
          expect(details(html, i), `${name}: ${q.ziel}`).toContain(themaId(t.thema.id))
          // die Eingabe steht in der Frage (Knöpfe, Feld bzw. Auswahl)
          const li = html.slice(i, html.indexOf('</li>', i))
          expect(li, `${name}: ${q.ziel}`).toMatch(/<button|<input|<select/)
        }
      }
      // Themen mit Befund ✗ bzw. ! sind offen, die übrigen zu
      for (const t of a.themen.filter(hatInhalt)) {
        const kopf = new RegExp(`<details class="befund-thema bedarf-thema" id="${themaId(t.thema.id)}"( open="")?>`).exec(html)
        expect(kopf, `${name}: ${t.thema.id}`).not.toBeNull()
        expect(!!kopf![1], `${name}: ${t.thema.id}`).toBe(t.zahl.muss + t.zahl.soll > 0)
      }
    }
    expect(n).toBeGreaterThan(50)
  })
  it('Kreuzung mit Insel (Zieglerstrasse): Kopf mit Zählung, Thema Insel mit Fragen samt Eingabe und «für:», Masse und Annahmen am Ende', () => {
    const f = fallMit(FAELLE[1][1]), b = blattR(f), html = panel(f, b), t = text(html)
    expect(t).toMatch(/Erweiterte Prüfung \d+ Regeln · \d+ Befunde? (· \d+ Hinweise? )?· \d+ Angaben offen/)
    expect(t).toMatch(/Welche Vorgaben gelten: Stadt Bern Kanton Bern Richtlinien/)
    expect(t).toMatch(/Insel \? \d+ offen/)
    expect(t).toContain('Wie hoch sind die Pfosten auf der Insel? – für: Höhe der Inselpfosten')
    expect(t.indexOf('Masse (Soll und Ist)')).toBeGreaterThan(t.indexOf('Insel ?'))
    expect(t.indexOf('Annahmen und Hinweise')).toBeGreaterThan(t.indexOf('Masse (Soll und Ist)'))
    // Feld der Grundprüfung im Thema nur als Verweis, mit den Regeln dieses Themas (Prüfung 23.10.2026, Muss 1)
    expect(t).toMatch(/siehe Grundprüfung: [^.]*Fahrbahn neben der Insel \(je Seite, quer\) – für: /)
    // Verweise zählen nicht als offen (die Frage steht anderswo)
    const a = themenAnsicht([b])
    for (const x of a.themen) expect(x.zahl.offen, x.thema.id).toBe(x.fragen.length + x.bloecke.length + x.ohneAngaben.length)
    // Fragen mit Feldhilfe «?» und, wo die Maske ihn zeigt, dem Hinweis ⚑ (Soll 3)
    const insel = a.themen.find(x => x.thema.id === 'insel')!.fragen.find(q => q.eingabe)!
    const li = new RegExp(`<li id="${feldZeileId(insel.ziel!)}">.*?</li>`).exec(html)![0]
    expect(li).toContain('class="zweit klein hilfe-knopf"')
    expect(li).toContain('class="klein feld-bedarf"')
    // Kopf je Thema: Wort trägt die Bedeutung (Soll 6)
    expect(html).not.toMatch(/<span class="grund-symbol" aria-hidden="true">[✗!]<\/span> \d+ Befund/)
  })
})

describe('Annahmen nur einmal (Panel und Bericht)', () => {
  const anzahl = (t: string, a: string) => t.split(a).length - 1
  it('Panel: keine Annahme doppelt (Grundprüfung vor «Annahmen und Hinweise»); Bericht: Feld-Annahmen nur in «Eingaben und Quellen»', () => {
    let n = 0, tabelle = 0
    for (const [name, felder] of FAELLE) {
      const f = fallMit(felder), b = blattR(f)
      const alle = [...new Set([...b.annahmen, ...(b.grund.gilt ? b.grund.annahmen : [])])]
      const p = text(panel(f, b))
      for (const a of alle) { expect(anzahl(p, a), `${name}: ${a}`).toBeLessThanOrEqual(1); n += anzahl(p, a) }
      expect(/V85 fehlt:/.test(p) && p.includes('Tempo wie signalisiert (V85 nicht gemessen)'), name).toBe(false)
      const bericht = text(renderToStaticMarkup(<><GrundpruefungAnzeige g={b.grund} druck ohneAnnahme={a => annahmeInTabelle(b, a)} />
        <BefundblattAnzeige b={b} druck /></>))
      for (const a of alle) {
        if (annahmeInTabelle(b, a)) { tabelle++; expect(anzahl(bericht, a), `${name}: ${a}`).toBe(0) }
        else expect(anzahl(bericht, a), `${name}: ${a}`).toBeLessThanOrEqual(1)
      }
      expect(/V85 fehlt:/.test(bericht) && bericht.includes('Tempo wie signalisiert (V85 nicht gemessen)'), name).toBe(false)
    }
    expect(n).toBeGreaterThan(5)
    expect(tabelle).toBeGreaterThan(3)
  })
})

// ── Testfälle des Katalogs (ohne Rechnung) ──

function blattT(abw: Abw, ebenen: { bern: boolean; kantonBE: boolean }): BefundBlatt {
  const e0 = testfall(abw)
  const vor: Vorbelegung = {}
  for (const d of FELD_DEFS) {
    let v = wertVon(e0, d.pfad)
    if (d.pfad === 'q3.anrampung' && v) v = [(v as { neigung: number }).neigung, (v as { laenge: number }).laenge]
    if (v !== null && v !== undefined) vor[d.pfad] = { wert: v, quelle: 'hand', text: 'Test' }
  }
  const g = eingabenBilden(vor, null)
  const befund = beurteile(g.eingaben, { ebenen: { ...ebenen, richtlinie: true } })
  return {
    gruppe: 'q1', streifen: ['1'], titel: 'Streifen 1', befund, gebildet: g, vorbelegt: { werte: vor, hinweise: [] },
    ebenen: { ...ebenen, richtlinie: true }, sicht: [], sichtVonHand: g.eingaben.sichtVorh.wert !== null,
    typText: typText(befund), zulText: '', begruendung: begruendung(befund),
    offen: befund.offenGruppen.map(o => ({ feld: o.feld, name: feldName(o.feld), gruppe: gruppeVon(o.feld), regeln: o.regeln })),
    nichtGeprueft: [], annahmen: befund.annahmen, hinweise: [], grund: grundpruefung(g.eingaben),
  }
}
const OFFEN: Abw = { beleuchtung: null, fg5h: null, fgKlasse: null, erkennungM: null, anzeichenSchneller: null, v85: null, durchfahrt: null,
  streifenBreite: null, abstandFgsM: null, signal411: null, randAbstand: null, tempoRegime: null, beduerfnis: null, dtv: null } as Abw
const VARIANTEN = TESTFAELLE.flatMap(t => [t.abw, { ...t.abw, ...OFFEN }].flatMap(abw => [BERN, { bern: false, kantonBE: false }].map(eb => ({ t, abw, eb }))))

describe('Erweiterte Prüfung nach Thema: offene Angaben (alle Testfälle mit Varianten)', () => {
  it('keine offene Angabe mehrfach: je Feld höchstens eine Frage über alle Themen, je Thema ein Verweis', () => {
    for (const { t, abw, eb } of VARIANTEN) {
      const a = themenAnsicht([blattT(abw, eb)])
      const ziele = a.themen.flatMap(x => x.fragen.map(q => (q.eingabe ? q.ziel! : q.feld)))
      expect(ziele.length, `${t.regel} ${t.name}`).toBe(new Set(ziele).size)
      for (const x of a.themen) {
        const vs = x.verweise.map(v => `${v.wo}:${v.feld}`)
        expect(vs.length, `${t.regel} ${t.name}`).toBe(new Set(vs).size)
        // ein Verweis zeigt nie auf das eigene Thema
        expect(x.verweise.every(v => v.wo !== x.thema.id)).toBe(true)
      }
    }
  })
  it('keine offene Regel verschwindet: jede steht in ihrem Thema als Frage, Verweis (mit «für:»), ungeprüfter Block oder ohne Feld (Muss 1)', () => {
    let n = 0
    for (const { t, abw, eb } of VARIANTEN) {
      const b = blattT(abw, eb), a = themenAnsicht([b])
      const k: SichtKontext = { e: b.gebildet.eingaben, ebenen: b.ebenen }
      for (const x of b.befund.alle.filter(y => y.zustand === 'offen' && gilt(y.id as RegelId, k))) {
        const th = a.themen.find(y => y.thema.id === themaVon(x.id))!
        const da = th.fragen.some(q => q.regeln.includes(x.id)) || th.verweise.some(v => v.regeln.includes(x.id))
          || th.bloecke.some(z => z.regeln.includes(x.id)) || th.ohneAngaben.includes(x.id)
        // Weichen des Ablaufs: ihre Angabe steht als Frage bzw. Verweis auf die Grundprüfung, nicht unbedingt in ihrem Thema
        const weicheDa = a.themen.some(y => y.fragen.some(q => q.regeln.includes(x.id)) || y.verweise.some(v => v.regeln.includes(x.id)))
        if (!istWeiche(x.id)) { n++; expect(da, `${t.regel} ${t.name}: ${x.id}`).toBe(true) }
        else if ((x.fehlend ?? []).length) expect(weicheDa, `${t.regel} ${t.name}: ${x.id}`).toBe(true)
        // ohne Feld nur, wenn wirklich kein Feld der Maske fehlt (unabhängig davon, ob der Block der Maske schon eine Eingabe hat)
        if (th.ohneAngaben.includes(x.id)) expect((x.fehlend ?? []).every(f => !feldZiel(f) && !eingabeFeld(f) && f !== 'Zufahrten'), x.id).toBe(true)
      }
    }
    expect(n).toBeGreaterThan(300)
  })
  it('Murten-Fall: Regeln hinter «siehe Grundprüfung» bleiben im Panel und im Bericht sichtbar (Titel im Text)', () => {
    for (const { t, abw, eb } of VARIANTEN.slice(0, 80)) {
      const b = blattT(abw, eb), a = themenAnsicht([b])
      const druck = text(renderToStaticMarkup(<BefundblattAnzeige b={b} druck />))
      for (const x of a.themen) for (const v of x.verweise) for (const id of v.regeln.filter(r => r !== 'A1'))
        expect(druck, `${t.name}: ${id}`).toContain(regelTitel(id))
    }
  })
  it('ungeprüfte Blöcke (LSA-Zeiten, Trottoirüberfahrt): Zeile mit Sprung im Thema, zählt als offen; Regeln der Prüfübersicht (Muss 2)', () => {
    for (const [abw, block, thema] of [[{ fgsMitLsa: true, typ: 'lsa', lsaZeiten: null }, 'I', 'lichtsignal'],
      [{ lage: 'einmuendung', typ: 'trottoirueberfahrt', q3: null }, 'Q3', 'trottoirueberfahrt']] as [Abw, string, string][]) {
      const b = blattT(abw, BERN)
      expect(b.befund.nichtGeprueft.map(x => x.block), block).toContain(block)
      const th = themenAnsicht([b]).themen.find(x => x.thema.id === thema)!
      const z = th.bloecke.find(x => x.block === block)!
      expect(z.regeln.length, block).toBeGreaterThan(3)
      expect(hatInhalt(th)).toBe(true)
      expect(th.zahl.offen).toBeGreaterThanOrEqual(1)
      const html = renderToStaticMarkup(<BefundblattAnzeige b={b} />)
      expect(text(html)).toContain(`Nicht geprüft: ${z.text} Angaben eingeben (${z.regeln.length} Regeln)`)
      // Bericht: ohne Knopf und Knopftext
      const druck = renderToStaticMarkup(<BefundblattAnzeige b={b} druck />)
      expect(text(druck)).toContain(`Nicht geprüft: ${z.text} (${z.regeln.length} Regeln)`)
      expect(druck).not.toContain('Angaben eingeben')
    }
  })
  it('kein Thema nur aus Verweisen von Weichen bzw. nicht greifenden Regeln (Lichtsignal ohne Lage: kein Thema Trottoirüberfahrt)', () => {
    const b = blattT({ typ: 'lsa', fgsMitLsa: true, lage: null } as Abw, BERN)
    expect(b.befund.alle.some(x => x.id === 'B3' && x.zustand === 'offen')).toBe(true)
    const a = themenAnsicht([b])
    expect(hatInhalt(a.themen.find(x => x.thema.id === 'trottoirueberfahrt')!)).toBe(false)
    for (const { abw, eb } of VARIANTEN) {
      const bb = blattT(abw, eb), k: SichtKontext = { e: bb.gebildet.eingaben, ebenen: bb.ebenen }
      for (const x of themenAnsicht([bb]).themen) for (const v of x.verweise) for (const r of v.regeln) {
        expect(gilt(r as RegelId, k), r).toBe(true)
        if (v.wo !== 'grund') expect(istWeiche(r), r).toBe(false)
      }
    }
  })
  it('Zählung je Regel: doppelte Einträge derselben Regel und zwei gleiche Querungen zählen einmal (Soll 5)', () => {
    const b = blattT({}, BERN)
    const a = themenAnsicht([b])
    const x = b.befund.alle.find(y => y.zustand === 'verletzt' && !istWeiche(y.id))!
    expect(x).toBeDefined()
    const doppelt: BefundBlatt = { ...b, befund: { ...b.befund, alle: [...b.befund.alle, { ...x, detail: 'zweite Zufahrt' }] } }
    const zahl = (l: readonly BefundBlatt[]) => themenAnsicht(l).themen.map(y => y.zahl)
    expect(zahl([doppelt])).toEqual(zahl([b]))
    expect(zahl([b, { ...b, gruppe: 'q2' }])).toEqual(zahl([b]))
    expect(erweitertKopf(a)).toMatch(/^\d+ Regeln · \d+ Befunde?/)
  })
  it('Frage-Thema = Feld-Thema für die von Hand zugeordneten Felder (Soll 4)', () => {
    for (const { abw, eb } of VARIANTEN) {
      const a = themenAnsicht([blattT(abw, eb)])
      for (const x of a.themen) for (const q of x.fragen) if (q.ziel && ['strassentyp', 'starkBelastet', 'neuanlage', 'zweirichtung', 'tram', 'inselMoeglich', 'lage'].includes(q.ziel))
        expect(x.thema.id, q.ziel).toBe(feldThema(q.ziel))
    }
    expect([feldThema('strassentyp'), feldThema('starkBelastet'), feldThema('neuanlage'), feldThema('inselMoeglich')])
      .toEqual(['fahrstreifen', 'fahrstreifen', 'zulaessigkeit', 'insel'])
  })
  it('Feld → Thema: jedes Feld der erweiterten Prüfung hat ein Thema, die Lage der Querung steht unter «Lage und Abstände»', () => {
    for (const d of FELD_DEFS.filter(x => !istGrundFeld(x.pfad))) expect(feldThema(d.pfad), d.pfad).not.toBeNull()
    expect(feldThema('lage')).toBe('lage')
    expect(feldThema('insel.pfostenH')).toBe('insel')
    expect(feldThema('lsaZeiten.gelb')).toBe('lichtsignal')
  })
  it('Bericht: je Thema Befunde, dann «Noch offen» ohne Eingabe; jede Frage einmal; Masse und Annahmen am Ende; keine Nummer ohne Titel', () => {
    for (const { t, abw, eb } of VARIANTEN.slice(0, 120)) {
      const b = blattT(abw, eb), a = themenAnsicht([b])
      const html = renderToStaticMarkup(<BefundblattAnzeige b={b} druck />), x = text(html)
      expect(html).not.toMatch(/<input|<select|<button|<details/)
      expect(html).not.toContain('Offene Angaben (nach Block')
      // jede Frage genau einmal (als Text mit «für: …»), dazu die Verweise; keine Eingabe
      const fuer = a.themen.reduce((s, y) => s + y.fragen.length + y.verweise.filter(v => !(v.regeln.length === 1 && v.regeln[0] === 'A1')).length, 0)
      expect((x.match(/ – für: /g) ?? []).length, `${t.regel} ${t.name}`).toBe(fuer)
      if (a.themen.some(y => y.fragen.length)) expect(x).toContain('Noch offen:')
      expect(nummernOhneTitel(x), `${t.regel} ${t.name}`).toEqual([])
      const m = x.indexOf('Masse (Soll und Ist)'), an = x.indexOf('Annahmen und Hinweise')
      for (const th of a.themen.filter(hatInhalt)) {
        const i = x.indexOf(` ${th.thema.name} `)
        expect(i, `${t.name}: ${th.thema.name}`).toBeGreaterThanOrEqual(0)
        if (m >= 0) expect(i, `${t.name}: ${th.thema.name}`).toBeLessThan(m)
        if (an >= 0) expect(i, `${t.name}: ${th.thema.name}`).toBeLessThan(an)
      }
    }
  })
})
