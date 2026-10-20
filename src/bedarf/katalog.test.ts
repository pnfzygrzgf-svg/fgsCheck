// Tests Bedarfsmodul E0: Konsistenz des Regelkatalogs. Jede Regel hat Quelle (mit Ausgabe), Stärke und Ebene; Nummern eindeutig;
// jede Regel mit Befund hat eine Implementierung und ist im Baum erreichbar (kommt in den Testfällen als Eintrag vor); Schutz gegen
// eingefügten Normtext (kurze eigene Texte, keine langen gemeinsamen Wortfolgen mit Normauszügen).
//
// Normtext-Abgleich nur lokal: FGS_NORMTEXT = Verzeichnis(se) mit Textauszügen der Normen (pdftotext), getrennt mit «:»; die
// Auszüge liegen ausserhalb des Repos. Ohne Variable übersprungen.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { KATALOG, REGEL_IDS, WERKE, type RegelId } from './katalog'
import { REGELN } from './regeln'
import { beurteile } from './entscheid'
import { fall, TESTFAELLE } from './testfaelle'
import { EBENEN, STAERKEN, type RegelDef } from './typen'
import { FELDER } from './eingaben'

const defs = REGEL_IDS.map(id => [id, KATALOG[id] as RegelDef] as const)
const mitBefund = defs.filter(([, d]) => d.art === 'befund' || d.art === 'weiche').map(([id]) => id)
/** Höchstlänge eigener Kurztexte (Schutz gegen eingefügten Normtext) */
const MAX_ERGEBNIS = 140
const MAX_SONST = 260

describe('Regelkatalog', () => {
  it('Nummern eindeutig und gleich dem Schlüssel', () => {
    expect(new Set(defs.map(([, d]) => d.id)).size).toBe(defs.length)
    for (const [id, d] of defs) expect(d.id).toBe(id)
  })
  it('Zählung: 150 Nummern (147 aus der E0-Liste + D6-3b, F3-B, F3-M), davon 6 ohne eigenen Befund', () => {
    expect(defs.length).toBe(150)
    expect(defs.filter(([, d]) => d.art !== 'befund' && d.art !== 'weiche').map(([id]) => id).sort())
      .toEqual(['B2', 'C-E', 'D-E', 'D2b', 'E-E', 'H5'].sort())
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
  it('Implementierung: genau die Regeln mit Befund (befund, weiche)', () => {
    expect(Object.keys(REGELN).sort()).toEqual([...mitBefund].sort())
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
    const fehlt = mitBefund.filter(id => !gesehen.has(id))
    expect(fehlt).toEqual([])
    const mitFall = new Set(TESTFAELLE.flatMap(t => [t.regel, ...Object.keys(t.erwartet)]))
    expect(mitBefund.filter(id => !mitFall.has(id))).toEqual([])
  })
  it('Stärken in den Testfällen gehören zur Regel (Hauptstärke oder fallabhängige Stärke)', () => {
    for (const t of TESTFAELLE) for (const [id, erw] of Object.entries(t.erwartet)) {
      if (erw === '-' || erw === 'offen') continue
      const d = KATALOG[id as RegelId] as RegelDef
      expect([d.staerke, ...(d.auch ?? [])], `${t.regel} ${t.name}: ${id}`).toContain(erw)
    }
  })
})

describe('Normtext-Wächter', () => {
  const texte = defs.flatMap(([id, d]) => [
    [id, 'ergebnis', d.ergebnis, MAX_ERGEBNIS], [id, 'bedingung', d.bedingung, MAX_SONST],
    [id, 'bemerkung', d.bemerkung ?? '', MAX_SONST], [id, 'normHinweis', d.normHinweis ?? '', MAX_SONST],
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
  /** Titel der Werke und Ziffern sind Zitate (Fundstellen), kein Normtext: vom Wortfolgen-Abgleich ausgenommen */
  const zitate = new Set<string>([...Object.values(WERKE).flatMap(w => [w.name, w.titel]), ...defs.flatMap(([, d]) => d.quellen.map(q => q.ziffer))])
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
