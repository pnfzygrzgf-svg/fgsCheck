// Tests Bedarfsmodul E0: Konsistenz des Regelkatalogs. Jede Regel hat Quelle (mit Ausgabe), Stärke und Ebene; Nummern eindeutig;
// jede Regel mit Befund hat eine Implementierung und ist im Baum erreichbar (kommt in den Testfällen als Eintrag vor); Schutz gegen
// eingefügten Normtext (kurze eigene Texte, keine langen gemeinsamen Wortfolgen mit Normauszügen). Die Grundprüfung (Gruppe B5)
// hat ihre Implementierung in grundpruefung.ts (Abdeckung der Fälle in grundpruefung.test.ts), nicht im Baum.
//
// Normtext-Abgleich nur lokal: FGS_NORMTEXT = Verzeichnis(se) mit Textauszügen der Normen (pdftotext), getrennt mit «:»; die
// Auszüge liegen ausserhalb des Repos. Ohne Variable übersprungen.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { KATALOG, REGEL_IDS, WERKE, type RegelId } from './katalog'
import { LESENAME } from './quellen'
import { REGELN } from './regeln'
import { GRUND_IDS } from './grundpruefung'
import { beurteile } from './entscheid'
import { fall, TESTFAELLE } from './testfaelle'
import { EBENEN, STAERKEN, type RegelDef } from './typen'
import { FELDER } from './eingaben'
import { nummernOhneTitel } from './regelname'

const defs = REGEL_IDS.map(id => [id, KATALOG[id] as RegelDef] as const)
/** Regeln mit Befund im Entscheidbaum (ohne Grundprüfung B5) bzw. der Grundprüfung */
const mitBefund = defs.filter(([, d]) => (d.art === 'befund' || d.art === 'weiche') && d.gruppe !== 'B5').map(([id]) => id)
const grundIds = defs.filter(([, d]) => d.gruppe === 'B5').map(([id]) => id)
/** Höchstlänge eigener Kurztexte (Schutz gegen eingefügten Normtext) */
const MAX_ERGEBNIS = 140
const MAX_SONST = 260

describe('Regelkatalog', () => {
  it('Nummern eindeutig und gleich dem Schlüssel', () => {
    expect(new Set(defs.map(([, d]) => d.id)).size).toBe(defs.length)
    for (const [id, d] of defs) expect(d.id).toBe(id)
  })
  it('Zählung: 166 Nummern im Baum (147 aus der E0-Liste + D6-3b, F3-B, F3-M, E1c seit Runde 5, F5c bis F5n seit 27.10.2026, H1-V seit 29.10.2026, G11, G12 seit 30.10.2026; F1d-R am 30.10.2026 wieder gestrichen, Quelle bei F1d), davon 8 ohne eigenen Befund (C2c gestrichen 20.10.2026, D3c Verweis auf D5-5 seit Runde 2), und 15 der Grundprüfung', () => {
    expect(defs.length).toBe(181)
    expect(grundIds.length).toBe(15)
    expect(defs.filter(([, d]) => d.gruppe !== 'B5').length).toBe(166)
    expect(defs.filter(([, d]) => d.art !== 'befund' && d.art !== 'weiche').map(([id]) => id).sort())
      .toEqual(['B2', 'C-E', 'C2c', 'D-E', 'D2b', 'D3c', 'E-E', 'H5'].sort())
  })
  it('jede Regel mit Befund hat Ebene, Stärke, Ergebnis und mindestens eine Quelle mit Werk, Ziffer und Ausgabe', () => {
    for (const [id, d] of defs) {
      if (d.art !== 'befund' && d.art !== 'weiche') continue
      expect(EBENEN, id).toContain(d.ebene)
      expect(STAERKEN, id).toContain(d.staerke)
      for (const s of d.auch ?? []) expect(STAERKEN, id).toContain(s)
      expect(d.ergebnis.length, id).toBeGreaterThan(5)
      expect(d.quellen.length, id).toBeGreaterThan(0)
    }
    for (const [id, d] of defs) for (const q of d.quellen) {
      const w = (WERKE as Record<string, { ausgabe: string }>)[q.werk]
      expect(w, `${id}: Werk ${q.werk}`).toBeDefined()
      expect(w.ausgabe, id).toMatch(/^\d{4}/)
      expect(q.ziffer.trim().length, id).toBeGreaterThan(0)
    }
  })
  it('Regeln der Ebene Norm stützen sich auf eine Norm (VSS/SN)', () => {
    for (const [id, d] of defs) if (d.ebene === 'Norm')
      expect(d.quellen.some(q => /^(40|640)/.test(q.werk)) || d.quellen.some(q => q.werk === 'ENTSCHEID'), id).toBe(true)
  })
  it('Implementierung: genau die Regeln mit Befund (befund, weiche) im Baum, die Grundprüfung B5 in grundpruefung.ts', () => {
    expect(Object.keys(REGELN).sort()).toEqual([...mitBefund].sort())
    expect([...GRUND_IDS].sort()).toEqual([...grundIds].sort())
    for (const [id, d] of defs) if (d.gruppe === 'B5') {
      expect(d.art, id).toBe('befund')
      expect(d.quellen.every(q => q.werk === 'BFU'), id).toBe(true)
    }
  })
  it('Grundprüfung B5 erscheint nie im Befundblatt des Baums (keine Doppelungen)', () => {
    for (const t of TESTFAELLE) for (const x of beurteile(fall(t.abw), { ebenen: t.ebenen }).alle) expect(x.id.startsWith('B5'), x.id).toBe(false)
  })
  it('Eingaben der Regeln sind bekannte Felder', () => {
    for (const [id, d] of defs) for (const f of d.eingaben) expect(Object.keys(FELDER), `${id}: ${f}`).toContain(f.split('.')[0])
  })
  it('Schwellen sind endliche Zahlen', () => {
    for (const [id, d] of defs) for (const [k, v] of Object.entries(d.werte ?? {})) expect(Number.isFinite(v), `${id}.${k}`).toBe(true)
  })
  it('jede Regel mit Befund ist im Baum erreichbar (Eintrag in mindestens einem Testfall) und hat einen eigenen Testfall', () => {
    const gesehen = new Set<string>()
    for (const t of TESTFAELLE) for (const x of beurteile(fall(t.abw), { ebenen: t.ebenen }).alle) gesehen.add(x.id)
    // nur aus dem Sichtrechner (befundblatt.ts, eigene Tests): Sicht vom Velo
    const NUR_SICHTRECHNER = ['H1-V']
    const fehlt = mitBefund.filter(id => !gesehen.has(id) && !NUR_SICHTRECHNER.includes(id))
    expect(fehlt).toEqual([])
    const mitFall = new Set(TESTFAELLE.flatMap(t => [t.regel, ...Object.keys(t.erwartet)]))
    expect(mitBefund.filter(id => !mitFall.has(id) && !NUR_SICHTRECHNER.includes(id))).toEqual([])
  })
  it('Stärken in den Testfällen gehören zur Regel (Hauptstärke oder fallabhängige Stärke)', () => {
    for (const t of TESTFAELLE) for (const [id, erw] of Object.entries(t.erwartet)) {
      if (erw === '-' || erw === 'offen') continue
      const d = KATALOG[id as RegelId] as RegelDef
      expect([d.staerke, ...(d.auch ?? [])], `${t.regel} ${t.name}: ${id}`).toContain(erw)
    }
  })
})

/**
 * Prüfsätze (Nutzerentscheid 23.10.2026): je Regel ein Satz in Alltagssprache, was gemessen bzw. abgefragt wird und was folgt. Die
 * Grenzwerte stehen im Satz so, wie die Regel sie aus werte liest (8,5 → «8,50»); 1 und 2 auch als Wort («mehr als einen», «zwei»,
 * «doppelte»), 2/3 und 1/3 als «zwei Drittel» bzw. «ein Drittel».
 */
describe('Prüfsätze', () => {
  /** Schwellen, die bewusst nicht im Prüfsatz stehen, mit Grund */
  const OHNE_ZAHL: Record<string, string> = {
    'B5-1.r10': 'Zwischenstufe der Radiustabelle; der Satz nennt den Bereich 10 bis 24 m',
    'B5-1.r15': 'Zwischenstufe der Radiustabelle; der Satz nennt den Bereich 10 bis 24 m',
    'I6-B.ab': 'Grenze A/B zu C ohne Einfluss auf den Befund (beides erfüllt)',
    'I6-B.abInsel': 'Grenze A/B zu C ohne Einfluss auf den Befund (beides erfüllt)',
    'I6-B.e': 'Grenze E zu F ohne Einfluss auf den Befund (beides Soll verletzt)',
    'I6-B.eInsel': 'Grenze E zu F ohne Einfluss auf den Befund (beides Soll verletzt)',
  }
  const woerter = (t: string): number => t.trim().split(/\s+/).length
  /** Formen einer Zahl im Satz: ganz, mit zwei bzw. einer Nachkommastelle (Komma), kleine Zahlen und Brüche als Wort */
  const formen = (v: number): RegExp[] => {
    const z = (x: string) => new RegExp(`(?<![\\d,])${x.replace(',', '\\,')}(?!\\d|,\\d)`)
    const r = [z(v.toFixed(2).replace('.', ',')), z(v.toFixed(1).replace('.', ','))]
    if (Number.isInteger(v)) r.push(z(String(v)))
    if (v === 1) r.push(/\b(mehr als|höchstens) einen\b/)
    if (v === 2) r.push(/\b(zwei|doppelten?)\b/)
    if (Math.abs(v - 2 / 3) < 1e-9) r.push(/\bzwei Dritteln?\b/)
    if (Math.abs(v - 1 / 3) < 1e-9) r.push(/\bein Drittel\b/)
    return r
  }

  it('jede Regel hat einen Prüfsatz: Satz bis 40 Wörter, ohne Regelnummer und Fundstellen-Kürzel, V85/DTV erklärt, Ton nach Stärke', () => {
    for (const [id, d] of defs) {
      const t = d.pruefsatz
      expect(t.trim().length, id).toBeGreaterThan(20)
      expect(t, id).toMatch(/[.?]$/)
      expect(woerter(t), id).toBeLessThanOrEqual(40)
      expect(nummernOhneTitel(t), id).toEqual([])
      expect(t, id).not.toMatch(/\b(Z|Ziff|Tab|Anh|Abb|Kap|Art|S)\.\s?\d|z\. ?B\./)
      // V85 und DTV beim ersten Vorkommen erklärt: «gefahrenes Tempo (V85)», «Fahrzeuge pro Tag (DTV)»
      if (t.includes('V85')) expect(t.indexOf('V85'), id).toBe(t.indexOf('(V85)') + 1)
      if (t.includes('DTV')) expect(t.indexOf('DTV'), id).toBe(t.indexOf('(DTV)') + 1)
      // Ablauf und gestrichene Regeln kurz gekennzeichnet, sonst Ton nach der Hauptstärke
      if (d.art === 'gestrichen') { expect(t, id).toMatch(/^Gestrichen: /); continue }
      if (d.art !== 'befund') { expect(t, id).toMatch(/^Ablauf: /); continue }
      expect(t, id).not.toMatch(/^(Ablauf|Gestrichen):/)
      const ton: Record<string, RegExp> = { hart: /[Nn]ötig|nicht zulässig|kein\w* .*zulässig/, hart_bericht: /verkehrstechnische[mnr]? Bericht/,
        weich: /sollte[\s\S]*begründ/, hinweis: /Hinweis|prüfen/ }
      // Hauptstärke und fallabhängige Stärken (auch)
      for (const st of [d.staerke!, ...(d.auch ?? [])]) expect(t, `${id} (${st})`).toMatch(ton[st])
    }
  })
  it('Grenzwerte aus werte stehen im Prüfsatz (Ausnahmen begründet)', () => {
    const fehlt: string[] = []
    for (const [id, d] of defs) for (const [k, v] of Object.entries(d.werte ?? {})) {
      if (OHNE_ZAHL[`${id}.${k}`]) continue
      if (!formen(v).some(r => r.test(d.pruefsatz))) fehlt.push(`${id}.${k} = ${v}: ${d.pruefsatz}`)
    }
    expect(fehlt).toEqual([])
    // jede Ausnahme gehört zu einer vorhandenen Schwelle
    for (const s of Object.keys(OHNE_ZAHL)) {
      const [id, k] = [s.slice(0, s.lastIndexOf('.')), s.slice(s.lastIndexOf('.') + 1)]
      expect((KATALOG[id as RegelId] as RegelDef).werte?.[k], s).toBeDefined()
    }
  })
})

describe('Normtext-Wächter', () => {
  const texte = defs.flatMap(([id, d]) => [
    [id, 'ergebnis', d.ergebnis, MAX_ERGEBNIS], [id, 'bedingung', d.bedingung, MAX_SONST],
    [id, 'bemerkung', d.bemerkung ?? '', MAX_SONST], [id, 'normHinweis', d.normHinweis ?? '', MAX_SONST],
    [id, 'kurzsatz', d.kurzsatz ?? '', MAX_ERGEBNIS], [id, 'pruefsatz', d.pruefsatz, MAX_SONST],
  ] as const)

  it(`kurze eigene Texte (Ergebnis ≤ ${MAX_ERGEBNIS}, übrige ≤ ${MAX_SONST} Zeichen), ohne Anführungszeichen, ohne ß, ohne «Zebra»`, () => {
    for (const [id, feld, t, max] of texte) {
      expect(t.length, `${id}.${feld}`).toBeLessThanOrEqual(max)
      expect(t, `${id}.${feld}`).not.toMatch(/["„“”«»]/)
      expect(t, `${id}.${feld}`).not.toMatch(/ß/)
      expect(t.toLowerCase(), `${id}.${feld}`).not.toContain('zebra')
    }
  })

  /** alle Zeichenketten der Module in src/bedarf (ohne Tests): auch Texte ausserhalb des Katalogs (Korrektur K1) */
  const modulTexte: [string, string][] = readdirSync(__dirname).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).flatMap(f => {
    const src = readFileSync(join(__dirname, f), 'utf-8').split('\n').filter(z => !/^\s*(\/\/|\*|\/\*\*)/.test(z)).join('\n')
    return [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(m => [f, m[1] ?? m[2]] as [string, string])
  })
  /** Titel der Werke und Ziffern sind Zitate (Fundstellen), Adressen keine Texte: vom Wortfolgen-Abgleich ausgenommen */
  const zitate = new Set<string>([...Object.values(WERKE).flatMap(w => [w.name, w.titel, w.voll, w.pdf?.url ?? '', w.seite ?? '']), ...Object.values(LESENAME),
    ...defs.flatMap(([, d]) => d.quellen.map(q => q.ziffer))])
  it('alle Zeichenketten in src/bedarf: ohne ß, ohne «Zebra»', () => {
    expect(modulTexte.length).toBeGreaterThan(500)
    for (const [f, t] of modulTexte) {
      expect(t, f).not.toMatch(/ß/)
      expect(t.toLowerCase(), f).not.toContain('zebra')
    }
  })

  const dirs = (process.env.FGS_NORMTEXT ?? '').split(delimiter).filter(d => d && existsSync(d))
  /** Wörter normalisiert (klein, ohne Satzzeichen, Silbentrennung am Zeilenende aufgelöst) */
  const woerter = (t: string): string[] => t.replace(/-\s*\n\s*/g, '').toLowerCase().replace(/[^a-zäöüéèàç0-9,.%]+/g, ' ')
    .split(' ').map(w => w.replace(/^[,.]+|[,.]+$/g, '')).filter(Boolean)
  /** Wortfolgen dieser Länge dürfen nicht wörtlich in einem Normauszug stehen */
  const N = 6

  it.skipIf(dirs.length === 0)(`keine Folge von ${N} Wörtern wörtlich aus den Normauszügen (FGS_NORMTEXT)`, () => {
    const folgen = new Set<string>()
    for (const d of dirs) for (const f of readdirSync(d).filter(f => f.endsWith('.txt'))) {
      const w = woerter(readFileSync(join(d, f), 'utf-8'))
      for (let i = 0; i + N <= w.length; i++) folgen.add(w.slice(i, i + N).join(' '))
    }
    expect(folgen.size).toBeGreaterThan(10000)
    const treffer: string[] = []
    const alleTexte: [string, string, string][] = [...texte.map(([id, feld, t]) => [id, feld, t] as [string, string, string]),
      ...modulTexte.filter(([, t]) => !zitate.has(t)).map(([f, t]) => [f, 'string', t] as [string, string, string])]
    for (const [id, feld, t] of alleTexte) {
      const w = woerter(t)
      for (let i = 0; i + N <= w.length; i++) {
        const s = w.slice(i, i + N).join(' ')
        if (folgen.has(s)) treffer.push(`${id}.${feld}: ${s}`)
      }
    }
    expect(treffer).toEqual([])
  })
})

/** Quellen mit vollem Titel und Link (23.10.2026): Adressen nur beim Herausgeber und nur im Werkverzeichnis */
describe('Werkverzeichnis: voller Titel und offizielle Adressen', () => {
  const ERLAUBT = ['fedlex.admin.ch', 'bfu.ch', 'bern.ch', 'be.ch', 'hindernisfreie-architektur.ch', 'verkehrsclub.ch', 'llv.li']
  const host = (u: string) => new URL(u).hostname
  const erlaubt = (u: string) => ERLAUBT.some(d => host(u) === d || host(u).endsWith(`.${d}`))
  it('jedes Werk hat einen vollen Titel; jede Adresse ist https beim Herausgeber; ohne Adresse ein Vermerk (ausser Projektentscheid)', () => {
    for (const [id, w] of Object.entries(WERKE) as [string, (typeof WERKE)[keyof typeof WERKE]][]) {
      expect(w.voll.length, id).toBeGreaterThan(w.name.length)
      for (const u of [w.pdf?.url, w.seite]) if (u) {
        expect(u, id).toMatch(/^https:\/\//)
        expect(erlaubt(u), `${id}: ${u}`).toBe(true)
      }
      if (w.pdf) expect(w.pdf.mb, id).toBeGreaterThan(0)
      if (!w.pdf && !w.seite) expect(id === 'ENTSCHEID' || !!w.bezug, id).toBe(true)
    }
    // Normen: kein Link (kostenpflichtig, Nutzerentscheid 23.10.2026), nur der Vermerk
    for (const id of ['40241', '40240', '40242', '40837', '40213', '640075', '640850a', '640852', '640070'] as const)
      expect([WERKE[id].pdf, WERKE[id].seite, WERKE[id].bezug], id).toEqual([null, null, 'kostenpflichtig'])
    expect([WERKE.ENTSCHEID.pdf, WERKE.ENTSCHEID.seite]).toEqual([null, null])
  })
  it('Adressen der Herausgeber stehen nur in katalog.ts (Geodienste wie map.bern.ch ausgenommen)', () => {
    const GEODIENSTE = ['map.bern.ch']
    const dateien = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? dateien(join(d, e.name))
      : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(d, e.name)] : [])
    const src = join(__dirname, '..')
    const treffer: string[] = []
    for (const f of dateien(src)) {
      if (f.endsWith(join('bedarf', 'katalog.ts')) || f.endsWith(join('bedarf', 'quellen.ts'))) continue
      for (const m of readFileSync(f, 'utf-8').matchAll(/https?:\/\/[^\s'"`)]+/g))
        if (erlaubt(m[0]) && !GEODIENSTE.includes(host(m[0]))) treffer.push(`${f.slice(src.length + 1)}: ${m[0]}`)
    }
    expect(treffer).toEqual([])
  })
})
