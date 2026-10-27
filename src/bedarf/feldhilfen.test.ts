// Tests Feldhilfen (Nutzerentscheid 20.10.2026): Wächter für Erklärung, Herkunft und Sichtbarkeit je Feld der Maske.
//   1. Jedes Feld hat eine Erklärung und mindestens eine Regel (bzw. ist als Ablauf markiert); jede Katalog-Eingabe hat ein Feld.
//   2. Die Eingabelisten des Katalogs (mit UNTERFELDER) decken alles, was die Regeln lesen (Messung an allen Testfällen und
//      Varianten); was der Ablauf (entscheid.ts) ausserhalb der Regeln liest, hat einen Ablauf-Text.
//   3. Ausgeblendete Felder (SICHTBAR) ändern weder Befund noch «offen» noch Empfehlung noch Grundprüfung.
//   4. Gestrichenes Feld «zoneVerkehrsorientiert»: alte Fälle laden weiter.
//   5. «Wozu» gekürzt: Geltung je Regel (kein Befund ausserhalb), Schalter vs. geprüfte Grösse, Reihenfolge, höchstens 5 sichtbar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KATALOG, REGEL_IDS, type BefundId, type RegelId } from './katalog'
import { REGELN } from './regeln'
import { Kontext } from './kontext'
import { beurteile } from './entscheid'
import { grundpruefung, type GrundSicht } from './grundpruefung'
import { fall, LSA_OK, Q3_OK, TESTFAELLE, type Abw } from './testfaelle'
import { FELDER, type BedarfEingaben } from './eingaben'
import { ABGELEITET, FELD_DEF, FELD_DEFS, GRUND_FELDER, OBJEKTE, istObjektFeld, type ObjektFeld } from './felder'
import { bedarfLesen, eingabenBilden, type Vorbelegung } from './fallBedarf'
import { fallLesen, fallSchreiben, leererFall } from '../fall'
import { ausgeblendeteBloeckeLeeren, FELD_HILFEN, GELTUNG, GEPRUEFT, SICHTBAR, UNTERFELDER, WOZU_MAX, bedingungText, bezuege, bezuegeImFall, felderIn, gilt, leerText,
  quelleKurz, regelPfade, schalter, schalterText, schaltet, schaltetImFall, sichtbar, wertVon, wozuTeilen, type SichtKontext,
  type Bedingung } from './feldhilfen'
import type { RegelDef } from './typen'

const defs = REGEL_IDS.map(id => [id, KATALOG[id] as RegelDef] as const)
const mitBefund = defs.filter(([, d]) => d.art === 'befund' || d.art === 'weiche').map(([id]) => id)

// ── Messung der gelesenen Felder (Kontext.w/o; Objekte als Proxy, damit Unterfelder zählen) ──
const proto = Kontext.prototype as unknown as { w: (f: string) => unknown; o: (f: string) => unknown }
const alt = { w: proto.w, o: proto.o }
let senke: Set<string> | null = null
const messen = (f: string, v: unknown): unknown => {
  if (!senke) return v
  const s = senke
  s.add(f)
  if (v && typeof v === 'object' && !Array.isArray(v))
    return new Proxy(v, { get: (t, p) => { if (typeof p === 'string') s.add(`${f}.${p}`); return (t as Record<string, unknown>)[p as string] } })
  return v
}
beforeAll(() => {
  proto.w = function (this: Kontext, f: string) { return messen(f, alt.w.call(this, f)) }
  proto.o = function (this: Kontext, f: string) { return messen(f, alt.o.call(this, f)) }
})
afterAll(() => { proto.w = alt.w; proto.o = alt.o })

/** Varianten jedes Testfalls: Querungstyp, Lichtsignal, Einmündung (damit die Prüfblöcke laufen) */
const TYPEN = ['fgs', 'lsa', 'furt', 'ohne_vortritt', 'trottoirueberfahrt', 'mehrzweck', null] as const
const varianten: { name: string; abw: Abw; ebenen: { bern: boolean; kantonBE: boolean } }[] = TESTFAELLE.flatMap(t => {
  const vs: Abw[] = [t.abw, ...TYPEN.map(typ => ({ ...t.abw, typ })), { ...t.abw, fgsMitLsa: true }, { ...t.abw, lage: 'einmuendung' as const },
    { ...t.abw, typ: 'mehrzweck' as const, mzsMitFgs: true }, { ...t.abw, sichtVorh: null }]
  return vs.flatMap((abw, i) => [
    { name: `${t.regel} ${t.name} #${i}`, abw, ebenen: { bern: !!t.ebenen?.bern, kantonBE: !!t.ebenen?.kantonBE } },
    { name: `${t.regel} ${t.name} #${i} Bern+BE`, abw, ebenen: { bern: true, kantonBE: true } },
  ])
})
const ALLE_EBENEN = { Recht: true, Norm: true, Bern: true, 'Kanton BE': true, Richtlinie: true } as const

/** Eingaben wie in der App: Werte als Pfade (Unterfelder einzeln) über eingabenBilden; ohne = diese Pfade offen */
function ueberPfade(e: BedarfEingaben, ohne: ReadonlySet<string> = new Set()): BedarfEingaben {
  const vor: Vorbelegung = {}
  for (const d of FELD_DEFS) {
    if (ohne.has(d.pfad)) continue
    let v = wertVon(e, d.pfad)
    if (d.pfad === 'haltestelle.art' && v === null && e.haltestelle.wert) v = 'keine'
    if (d.pfad === 'q3.anrampung' && v) v = [(v as { neigung: number }).neigung, (v as { laenge: number }).laenge]
    if (v !== null && v !== undefined) vor[d.pfad] = { wert: v, quelle: 'hand', text: 'Test' }
  }
  return eingabenBilden(vor, null).eingaben
}

describe('Feldhilfen: Erklärung und Herkunft je Feld', () => {
  it('jedes Feld der Maske hat eine Erklärung (eigene Sätze), keine Hilfe ohne Feld', () => {
    expect(Object.keys(FELD_HILFEN).sort()).toEqual(FELD_DEFS.map(d => d.pfad).sort())
    for (const d of FELD_DEFS) {
      const h = FELD_HILFEN[d.pfad]
      expect(h.was.length, d.pfad).toBeGreaterThan(30)
      for (const t of [h.was, h.leer, h.vorschlag, h.ablauf]) if (t) {
        expect(t.length, d.pfad).toBeLessThanOrEqual(360)
        expect(t, d.pfad).not.toMatch(/ß|["„“”]/)
        expect(t.toLowerCase(), d.pfad).not.toContain('zebra')
      }
      expect(d.name.toLowerCase(), d.pfad).not.toContain('zebra')
    }
  })
  it('jedes Feld hat mindestens eine Prüfung (als geprüfte Grösse) mit Quelle oder einen Ablauf-Satz bzw. ist nur Ablauf', () => {
    const ohne = FELD_DEFS.filter(d => !bezuege(d.pfad).length && !FELD_HILFEN[d.pfad].ablauf && !FELD_HILFEN[d.pfad].nurAblauf).map(d => d.pfad)
    expect(ohne).toEqual([])
    for (const d of FELD_DEFS) {
      if (FELD_HILFEN[d.pfad].nurAblauf) expect(FELD_HILFEN[d.pfad].ablauf ?? FELD_HILFEN[d.pfad].vorschlag, d.pfad).toBeTruthy()
      for (const b of bezuege(d.pfad)) expect(b.quelle.length, `${d.pfad} ${b.id}`).toBeGreaterThan(3)
    }
  })
  it('jede Katalog-Eingabe hat ein Feld der Maske (Objekte über UNTERFELDER; abgeleitet nur fgQuelle)', () => {
    for (const [id, d] of defs) for (const e of d.eingaben) {
      if (FELD_DEF.has(e) || (ABGELEITET as readonly string[]).includes(e)) continue
      expect(istObjektFeld(e), `${id}: ${e}`).toBe(true)
      expect((UNTERFELDER[id] ?? []).some(u => u.startsWith(`${e}.`)), `${id}: ${e} ohne Unterfelder`).toBe(true)
    }
    for (const [id, us] of Object.entries(UNTERFELDER) as [RegelId, readonly string[]][]) {
      expect(KATALOG[id], id).toBeDefined()
      expect(new Set(us).size, id).toBe(us.length)
      for (const u of us) {
        expect(FELD_DEF.has(u), `${id}: ${u}`).toBe(true)
        expect((KATALOG[id] as RegelDef).eingaben, `${id}: ${u}`).toContain(u.split('.')[0])
      }
    }
  })
  it('Vorschlag-Text genau für die Felder, die vorbelegung.ts, automatik.ts bzw. automatikC.ts setzt', () => {
    const src = ['vorbelegung.ts', 'automatik.ts', 'automatikC.ts'].map(f => readFileSync(join(__dirname, f), 'utf-8')).join('\n')
    const gesetzt = new Set([...src.matchAll(/setze\('([\w.]+)'/g)].map(m => m[1]))
    expect(gesetzt.size).toBeGreaterThan(15)
    expect(FELD_DEFS.filter(d => FELD_HILFEN[d.pfad].vorschlag).map(d => d.pfad).sort()).toEqual([...gesetzt].sort())
  })
  it('Wozu: Beispiele aus dem Katalog (Unterfelder genau, Quelle als Kurztext, Grundprüfung markiert)', () => {
    const ids = (p: string) => bezuege(p).map(b => b.id)
    // Tempo-Regime prüft A2 und die Zonenregeln C2, C2b, C2-B (GEPRUEFT); C2 auch beim besonderen Grund für Vortritt
    expect(ids('tempoRegime')).toEqual(['A2', 'C2', 'C2b', 'C2-B'])
    expect(bezuege('tempoRegime')[1].quelle).toBe('Tempo-30-Zonen-Verordnung Art. 4 Abs. 2')
    expect(ids('beduerfnis')).toContain('C2')
    expect(schaltet('tempoRegime')).not.toContain('C2')
    expect(ids('insel.pfostenH')).toEqual(['F2g'])
    expect(ids('insel.breite')).toEqual(expect.arrayContaining(['F2', 'F2b', 'F2c', 'F2-K', 'F3-M', 'B5-2b']))
    expect(ids('insel.breite')).not.toContain('D1')
    // Querungstyp ist reiner Schalter: keine Regel unter «Wozu», nur der Ablauf-Satz
    expect(ids('typ')).toEqual([])
    expect(schaltet('typ')).toEqual(expect.arrayContaining(['D1', 'D5-2', 'F5a', 'F6a', 'G2']))
    expect(ids('nRichtung')).toEqual(expect.arrayContaining(['D1', 'B5-3']))
    expect(bezuege('beleuchtung').find(b => b.id === 'B5-4')?.grund).toBe(true)
    expect(quelleKurz('D6-2')).toBe('Masterplan Fussverkehr Bern S. 64')
    expect(leerText('dtv')).toContain('offen')
    expect(leerText('sichtVorh')).toContain('Sichtrechner')
    // gestrichene Regeln und Verweise erscheinen nicht
    for (const d of FELD_DEFS) for (const b of bezuege(d.pfad)) expect(['befund', 'weiche']).toContain((KATALOG[b.id] as RegelDef).art)
  })
  it('Felder der Grundprüfung haben eine Regel der Grundprüfung (ausser den Weichen Querungstyp und Lichtsignal)', () => {
    for (const p of GRUND_FELDER) if (!['typ', 'fgsMitLsa'].includes(p)) expect(bezuege(p).some(b => b.grund), p).toBe(true)
  })
})

describe('Feldhilfen: Eingabelisten des Katalogs gegen die Regeln (Messung)', () => {
  it('jede Regel liest nur Felder, die ihre Eingabeliste nennt (mit Unterfeldern)', () => {
    const fehlt = new Map<string, Set<string>>()
    for (const v of varianten.filter((_, i) => i % 2 === 1)) {
      const e = fall(v.abw)
      const b = beurteile(e, { ebenen: { bern: true, kantonBE: true, richtlinie: true } })
      for (const id of Object.keys(REGELN) as BefundId[]) {
        const k = new Kontext(e, ALLE_EBENEN)
        for (const x of b.alle) if (x.zustand === 'verletzt') k.ergebnisse.set(x.id, { verletzt: true })
        const s = new Set<string>()
        senke = s
        try { REGELN[id](k) } catch { /* offen */ } finally { senke = null }
        const pf = new Set([...regelPfade(id), ...(KATALOG[id] as RegelDef).eingaben])
        for (const f of s) {
          if (pf.has(f) || (istObjektFeld(f) && [...pf].some(p => p.startsWith(`${f}.`)))) continue
          fehlt.set(id, (fehlt.get(id) ?? new Set()).add(f))
        }
      }
    }
    expect(Object.fromEntries([...fehlt].map(([id, s]) => [id, [...s]]))).toEqual({})
  })
  it('Grundprüfung liest nur Eingaben ihrer Regeln (B5) und die Weichen Querungstyp und Lichtsignal', () => {
    const erlaubt = new Set(['typ', 'fgsMitLsa', ...mitBefund.filter(id => KATALOG[id].gruppe === 'B5')
      .flatMap(id => [...regelPfade(id), ...(KATALOG[id] as RegelDef).eingaben])])
    const sicht: GrundSicht[] = [{ name: 'Z', tempo: 50, soll: 55, quelle: 'VSS Tab. 1', frei: true, status: 'frei' }]
    const s = new Set<string>()
    for (const v of varianten) for (const o of [{}, { sicht }]) {
      senke = s
      try { grundpruefung(fall(v.abw), o) } finally { senke = null }
    }
    expect([...s].filter(f => !erlaubt.has(f) && !(istObjektFeld(f) && [...erlaubt].some(p => p.startsWith(`${f}.`))))).toEqual([])
  })
  it('was der Entscheidbaum ausserhalb der Regeln liest, hat einen Ablauf-Text (ausser den Blöcken q3 und lsaZeiten)', () => {
    const orig = { ...REGELN }
    let inRegel = 0
    for (const id of Object.keys(REGELN) as BefundId[]) REGELN[id] = k => { inRegel++; try { return orig[id](k) } finally { inRegel-- } }
    const s = new Set<string>()
    const ablauf = proto.w
    proto.w = function (this: Kontext, f: string) { const x = alt.w.call(this, f); if (!inRegel) s.add(f); return x }
    const ablaufO = proto.o
    proto.o = function (this: Kontext, f: string) { const x = alt.o.call(this, f); if (!inRegel) s.add(f); return x }
    try {
      for (const v of varianten) beurteile(fall(v.abw), { ebenen: { ...v.ebenen, richtlinie: true } })
    } finally {
      Object.assign(REGELN, orig); proto.w = ablauf; proto.o = ablaufO
    }
    const mitAblauf = new Set(FELD_DEFS.filter(d => FELD_HILFEN[d.pfad].ablauf).map(d => d.pfad.split('.')[0]))
    expect(s.size).toBeGreaterThan(5)
    expect([...s].filter(f => !mitAblauf.has(f) && !['q3', 'lsaZeiten'].includes(f))).toEqual([])
  })
})

describe('Feldhilfen: Sichtbarkeit', () => {
  const felderIn = (b: Bedingung): string[] => ('alle' in b ? b.alle.flatMap(felderIn) : 'eines' in b ? b.eines.flatMap(felderIn) : 'feld' in b ? [b.feld] : [])
  it('Bedingungen als Daten: nur bekannte Felder, Werte aus den Optionen, Lesetext', () => {
    for (const [p, b] of Object.entries(SICHTBAR) as [string, Bedingung][]) {
      expect(FELD_DEF.has(p), p).toBe(true)
      for (const f of felderIn(b)) expect(FELD_DEF.has(f), `${p}: ${f}`).toBe(true)
      expect(bedingungText(b).length, p).toBeGreaterThan(5)
    }
    // Querungstyp, Insel vorhanden, Lichtsignal und Lage steuern, bleiben aber selbst immer sichtbar
    for (const p of ['typ', 'fgsMitLsa', 'lage', 'insel.vorhanden', 'haltestelle.art', 'tempoRegime', 'sichtVorh']) expect(SICHTBAR[p], p).toBeUndefined()
    expect(bedingungText(SICHTBAR['insel.breite']!)).toBe('Insel in der Fahrbahnmitte: ja')
  })
  it('Beispiele: Inselunterfelder nur mit Insel, LSA-Zeiten nur mit Lichtsignal, Trottoirüberfahrt nur an der Einmündung', () => {
    const k = (abw: Abw, ebenen = { bern: false, kantonBE: false }) => ({ e: ueberPfade(fall(abw)), ebenen })
    expect(sichtbar('insel.breite', k({}))).toBe(false)
    expect(sichtbar('insel.breite', k({ insel: { ...fall().insel.wert!, vorhanden: true, art: 'baulich', breite: 2 } }))).toBe(true)
    expect(sichtbar('lsaZeiten.freigabe', k({}))).toBe(false)
    expect(sichtbar('lsaZeiten.freigabe', k({ typ: 'lsa' }))).toBe(true)
    expect(sichtbar('lsaZeiten.freigabe', k({ fgsMitLsa: true }))).toBe(true)
    expect(sichtbar('q3.winkel', k({}))).toBe(false)
    expect(sichtbar('q3.winkel', k({ lage: 'einmuendung' }))).toBe(true)
    expect(sichtbar('q3.breiteM', k({ lage: 'einmuendung' }))).toBe(false)
    expect(sichtbar('q3.breiteM', k({ lage: 'einmuendung', typ: 'trottoirueberfahrt' }))).toBe(true)
    expect(sichtbar('mzsBreiteM', k({}))).toBe(false)
    expect(sichtbar('mzsBreiteM', k({ typ: 'mehrzweck' }))).toBe(true)
    expect(sichtbar('netz', k({}))).toBe(false)
    expect(sichtbar('netz', k({}, { bern: true, kantonBE: false }))).toBe(true)
    expect(sichtbar('beleuchtung', k({ typ: null }))).toBe(true)
    expect(sichtbar('beleuchtung', k({ typ: 'furt' }))).toBe(false)
  })
  it('ausgeblendete Felder ändern nichts: Befund, offen, Empfehlung, Masse, Grundprüfung (alle Testfälle und Varianten)', () => {
    // wie das Befundblatt: ohne Sichtweite von Hand ersetzt der Sichtrechner H1, E3, E3a und D5-4
    const sichtfrei = (b: ReturnType<typeof beurteile>, vonHand: boolean) => vonHand ? b : {
      ...b, alle: b.alle.filter(x => !['H1', 'E3', 'E3a', 'D5-4'].includes(x.id)),
      masse: b.masse.filter(m => !m.regeln.some(id => ['H1', 'E3'].includes(id))),
    }
    const kern = (e: BedarfEingaben, ebenen: { bern: boolean; kantonBE: boolean }) => {
      const b = sichtfrei(beurteile(e, { ebenen: { ...ebenen, richtlinie: true } }), e.sichtVorh.wert !== null)
      const g = grundpruefung(e)
      // Trottoirüberfahrt (27.10.2026): die Alternative Fussgängerstreifen läuft still mit den ausgeblendeten Feldern; ihr Typ und ihre
      // Zulässigkeit zählen hier nicht (Fragen dazu erst mit «Alternative Fussgängerstreifen prüfen»); die Grundprüfung gilt nicht (nur ob)
      const tue = e.typ.wert === 'trottoirueberfahrt'
      const empf = tue ? { zusatz: b.empfehlung.zusatz, vorlaeufig: b.empfehlung.vorlaeufig, offenWegen: b.empfehlung.offenWegen,
        q3: b.empfehlung.typ === 'Q3' } : b.empfehlung
      return JSON.stringify([b.alle, empf, tue ? null : b.zulaessigkeit, b.ende, b.masse, b.annahmen, b.nichtGeprueft, tue ? g.gilt : g])
    }
    let ausgeblendet = 0
    const abweichend: string[] = []
    for (const v of varianten) {
      const e1 = ueberPfade(fall(v.abw))
      const weg = new Set(FELD_DEFS.filter(d => !sichtbar(d.pfad, { e: e1, ebenen: v.ebenen })).map(d => d.pfad))
      ausgeblendet += weg.size
      if (kern(e1, v.ebenen) !== kern(ueberPfade(fall(v.abw), weg), v.ebenen)) {
        // welches Feld? einzeln suchen
        const schuld = [...weg].filter(p => kern(e1, v.ebenen) !== kern(ueberPfade(fall(v.abw), new Set([p])), v.ebenen))
        abweichend.push(`${v.name}: ${schuld.join(', ') || 'Zusammenspiel'}`)
      }
    }
    expect(abweichend.slice(0, 20)).toEqual([])
    expect(ausgeblendet).toBeGreaterThan(varianten.length * 10)
  })
})

describe('Feldhilfen: Wozu gekürzt (Geltung, Schalter, Reihenfolge)', () => {
  const kx = (abw: Abw = {}, ebenen: SichtKontext['ebenen'] = { bern: false, kantonBE: false, richtlinie: true }): SichtKontext =>
    ({ e: ueberPfade(fall(abw)), ebenen })
  const ids = (p: string, k: SichtKontext) => bezuegeImFall(p, [k]).map(b => b.id)
  it('Rollen als Daten: Schalter und geprüfte Grössen; jede Regel prüft mindestens ein Feld', () => {
    for (const [id, b] of Object.entries(GELTUNG) as [RegelId, NonNullable<(typeof GELTUNG)[RegelId]>][]) {
      expect(KATALOG[id], id).toBeDefined()
      for (const f of felderIn(b)) expect(FELD_DEF.has(f), `${id}: ${f}`).toBe(true)
    }
    for (const [id, fs] of Object.entries(GEPRUEFT) as [RegelId, readonly string[]][]) for (const f of fs) {
      expect(felderIn(GELTUNG[id]), `${id}: ${f}`).toContain(f)
      expect(regelPfade(id), `${id}: ${f}`).toContain(f)
    }
    const ohne = REGEL_IDS.filter(id => ['befund', 'weiche'].includes((KATALOG[id] as RegelDef).art) && regelPfade(id).length &&
      regelPfade(id).every(p => schalter(id).includes(p)))
    expect(ohne).toEqual([])
    // jede Regel mit Eingaben erscheint bei mindestens einem Feld
    for (const id of mitBefund) if (regelPfade(id).length)
      expect(FELD_DEFS.some(d => bezuege(d.pfad).some(b => b.id === id)), id).toBe(true)
  })
  it('Geltung stimmt: kein Eintrag im Befund bzw. in der Grundprüfung ausserhalb der Geltung (alle Testfälle und Varianten)', () => {
    const falsch = new Set<string>()
    let n = 0
    for (const v of varianten) {
      const e = ueberPfade(fall(v.abw))
      const k: SichtKontext = { e, ebenen: { ...v.ebenen, richtlinie: true } }
      const b = beurteile(e, { ebenen: { ...v.ebenen, richtlinie: true } })
      const g = grundpruefung(e)
      const ids = [...b.alle.map(x => x.id), ...g.punkte.flatMap(p => [...p.teile, ...p.notizen].map(t => t.id)), ...g.weitere.map(t => t.id)]
      for (const id of ids) { n++; if (!gilt(id as RegelId, k)) falsch.add(`${id} (${v.name})`) }
    }
    expect(n).toBeGreaterThan(10000)
    expect([...falsch].slice(0, 20)).toEqual([])
  })
  it('offene Felder (Mutationen): «offen» nur innerhalb der Geltung; jedes fehlende Feld nennt die Regel unter «Wozu»', () => {
    // Basen: Grundfall mal Typ, Lichtsignal, Lage, Ebenen; dazu zufällige Testfälle (feste Saat); je ein Feld offen
    const basen: { abw: Abw; ebenen: SichtKontext['ebenen'] }[] = []
    for (const typ of TYPEN) for (const fgsMitLsa of [false, true]) for (const lage of ['strecke', 'einmuendung', 'knoten_belastet'] as const)
      for (const bern of [false, true]) basen.push({ abw: { typ, fgsMitLsa, lage }, ebenen: { bern, kantonBE: bern, richtlinie: true } })
    let saat = 20261020
    const zufall = (n: number) => { saat = (saat * 1103515245 + 12345) % 2147483648; return saat % n }
    for (let i = 0; i < 150; i++) {
      const v = varianten[zufall(varianten.length)]
      basen.push({ abw: v.abw, ebenen: { ...v.ebenen, richtlinie: true } })
    }
    /** fehlendes Feld des Befunds als Pfad der Maske (Objekt ohne Wert: sein Pflicht-Unterfeld) */
    const pfade = (f: string): string[] => (istObjektFeld(f) ? OBJEKTE[f as ObjektFeld].pflicht.map(u => `${f}.${u}`) : [f])
    const ausser = new Set<string>(), unbenannt = new Set<string>()
    let offen = 0
    for (const bs of basen) {
      const e0 = ueberPfade(fall(bs.abw))
      for (const d of FELD_DEFS) {
        if (wertVon(e0, d.pfad) === null) continue
        const e = ueberPfade(fall(bs.abw), new Set([d.pfad]))
        const k: SichtKontext = { e, ebenen: bs.ebenen }
        const b = beurteile(e, { ebenen: bs.ebenen })
        const g = grundpruefung(e)
        const eintraege = [...b.alle, ...g.punkte.flatMap(p => p.teile), ...g.weitere]
        for (const x of eintraege) {
          if (x.zustand !== 'offen') continue
          offen++
          const id = x.id as RegelId
          if (!gilt(id, k)) ausser.add(`${id} offen ohne Geltung (${d.pfad} offen; ${JSON.stringify(bs.abw).slice(0, 80)})`)
          for (const f of x.fehlend ?? []) for (const p of pfade(f)) {
            if (!FELD_DEF.has(p)) continue
            const genannt = bezuegeImFall(p, [k]).some(y => y.id === id) || schaltetImFall(p, [k]).includes(id)
            if (!genannt) unbenannt.add(`${id}: ${p}`)
          }
        }
      }
    }
    expect(offen).toBeGreaterThan(1000)
    expect([...new Set([...ausser].map(x => x.replace(/;.*/, "")))].sort()).toEqual([])
    expect([...unbenannt].sort()).toEqual([])
  }, 180_000)
  it('Fussgängerstreifen ohne Lichtsignal: «Art der Querung» ohne Regeln (nur Ablauf), nirgends F5, F6, E2, D7, F4c, I oder Q3', () => {
    const k = kx()
    expect(k.e.typ.wert).toBe('fgs')
    expect(k.e.fgsMitLsa.wert).toBe(false)
    expect(ids('typ', k)).toEqual([])
    expect(FELD_HILFEN.typ.ablauf).toBeTruthy()
    const alleIds = new Set<string>(FELD_DEFS.flatMap(d => ids(d.pfad, k)))
    for (const id of ['F5a', 'F5b', 'F6a', 'F6b', 'F6c', 'D7', 'E2a', 'E2b', 'E2c', 'E2d', 'E2e', 'F4c', 'E1', 'E3']) expect(alleIds.has(id), id).toBe(false)
    expect([...alleIds].filter(id => id.startsWith('I') || id.startsWith('Q3'))).toEqual([])
    // ohne Ebene Bern keine Berner Regeln, mit Ebene Bern wieder
    expect([...alleIds].some(id => KATALOG[id as RegelId].ebene === 'Bern')).toBe(false)
    expect(ids('vSig', kx({}, { bern: true, kantonBE: false }))).toContain('D6-2')
  })
  it('«Fahrstreifen je Richtung»: Grundprüfung B5-3 zuerst, dann D1 (mit Bericht), dann Hinweis D5-3', () => {
    expect(ids('nRichtung', kx())).toEqual(['B5-3', 'D1', 'D5-3'])
    // Schalterfelder nennen die geschalteten Prüfungen im Fall (höchstens 5 Nummern)
    expect(schalterText('zweirichtung', [kx()])).toBe('Schaltet im Fall diese Prüfungen ein: Insel bei breiter Fahrbahn (D2), ' +
      'Verzicht auf Insel bei wenig Verkehr (D2a).')
    expect(schalterText('typ', [kx()])).toMatch(/^Schaltet im Fall diese Prüfungen ein: ([^,]+ \([\w-]+\), ){4}[^,]+ \([\w-]+\) und \d+ weitere\.$/)
    // mit Lichtsignal: Grundprüfung, D1 und D5-3 gelten nicht mehr; mit Bern und Typ LSA neu D6-5
    expect(ids('nRichtung', kx({ typ: 'lsa', fgsMitLsa: true }, { bern: true, kantonBE: false, richtlinie: true }))).toEqual(['D6-5'])
  })
  it('Typ offen: alle infrage kommenden Regeln (Streifenmasse, Trottoirüberfahrt, Mehrzweck, LSA)', () => {
    const k = kx({ typ: null, fgsMitLsa: null, lage: null })
    expect(ids('streifenBreite', k)).toContain('F1a')
    expect(ids('q3.breiteM', k)).toContain('F5a')
    expect(ids('mzsBreiteM', k)).toContain('F6a')
    expect(ids('lsaZeiten.freigabe', k)).toContain('I2')
  })
  it('Reihenfolge Grundprüfung, dann Stärke; höchstens 5 sichtbar, Rest unter «weitere»', () => {
    expect(WOZU_MAX).toBe(5)
    const rang: Record<string, number> = { hart: 0, hart_bericht: 1, weich: 2, hinweis: 3 }
    const k = kx({}, { bern: true, kantonBE: true, richtlinie: true })
    let lang = 0
    for (const d of FELD_DEFS) {
      const bz = bezuegeImFall(d.pfad, [k])
      const r = bz.map(b => (b.grund ? -1 : rang[(KATALOG[b.id] as RegelDef).staerke!]))
      expect(r, d.pfad).toEqual([...r].sort((a, b) => a - b))
      const t = wozuTeilen(bz)
      expect(t.sichtbar.length, d.pfad).toBe(Math.min(5, bz.length))
      expect([...t.sichtbar, ...t.weitere], d.pfad).toEqual(bz)
      if (bz.length > 5) lang++
    }
    expect(lang).toBeGreaterThan(0)
    const v = wozuTeilen(bezuegeImFall('vSig', [k]))
    expect(v.sichtbar[0].grund).toBe(true)
    expect(v.weitere.length).toBeGreaterThan(0)
  })
})

describe('Feldhilfen: ausgeblendete Unterfelder lösen keinen Block aus', () => {
  const nur = <T extends object>(o: T, x: Partial<T>): T => ({ ...Object.fromEntries(Object.keys(o).map(k => [k, null])), ...x }) as T
  const kern = (e: BedarfEingaben, ebenen = { bern: false, kantonBE: false }) => {
    const b = beurteile(e, { ebenen })
    return JSON.stringify([b.alle, b.empfehlung, b.nichtGeprueft])
  }
  it('Trottoirüberfahrt: nur Breite (Typ Fussgängerstreifen) bzw. nur Tempo der Seitenstrasse (Ebene Bern aus): nicht geprüft', () => {
    const ohne = ueberPfade(fall({ lage: 'einmuendung', q3: null }))
    for (const q of [nur(Q3_OK, { breiteM: 3 }), nur(Q3_OK, { vSigEinm: 30, dtvEinm: 3000 })]) {
      const e = ueberPfade(fall({ lage: 'einmuendung', q3: q }))
      expect(e.q3.wert).not.toBeNull()
      expect(kern(e)).not.toBe(kern(ohne))
      ausgeblendeteBloeckeLeeren(e, { bern: false, kantonBE: false })
      expect(e.q3.wert).toBeNull()
      expect(kern(e)).toBe(kern(ohne))
      expect(beurteile(e).nichtGeprueft.map(x => x.block)).toContain('Q3')
    }
    // sichtbare Angabe bleibt: Block läuft
    const e = ueberPfade(fall({ lage: 'einmuendung', q3: nur(Q3_OK, { breiteM: 3, winkel: 90 }) }))
    ausgeblendeteBloeckeLeeren(e, { bern: false, kantonBE: false })
    expect(e.q3.wert).not.toBeNull()
    // mit Ebene Bern zählt das Tempo der Seitenstrasse
    const b = ueberPfade(fall({ lage: 'einmuendung', q3: nur(Q3_OK, { vSigEinm: 30 }) }))
    ausgeblendeteBloeckeLeeren(b, { bern: true, kantonBE: false })
    expect(b.q3.wert).not.toBeNull()
  })
  it('LSA-Zeiten: nur Inseltiefe ohne Teilquerungen bzw. ohne Lichtsignal: nicht geprüft', () => {
    const e = ueberPfade(fall({ typ: 'lsa', lsaZeiten: nur(LSA_OK, { inselB: 2 }) }))
    ausgeblendeteBloeckeLeeren(e, { bern: false, kantonBE: false })
    expect(e.lsaZeiten.wert).toBeNull()
    expect(beurteile(e).nichtGeprueft.map(x => x.block)).toContain('I')
    const f = ueberPfade(fall({ typ: 'fgs', fgsMitLsa: false, lsaZeiten: LSA_OK }))
    ausgeblendeteBloeckeLeeren(f, { bern: false, kantonBE: false })
    expect(f.lsaZeiten.wert).toBeNull()
  })
})

describe('Gestrichenes Feld «zoneVerkehrsorientiert» (Nutzerentscheid 20.10.2026)', () => {
  it('nicht mehr in Eingaben, Maske und Katalog; C2c gestrichen, C2/C2b ohne Zonenbedingung', () => {
    expect(Object.keys(FELDER)).not.toContain('zoneVerkehrsorientiert')
    expect(FELD_DEF.has('zoneVerkehrsorientiert')).toBe(false)
    for (const [id, d] of defs) expect(d.eingaben, id).not.toContain('zoneVerkehrsorientiert')
    expect(KATALOG.C2c.art).toBe('gestrichen')
    expect(KATALOG.C2c.bemerkung).toContain('Nutzerentscheid 20.10.2026')
    expect(Object.keys(REGELN)).not.toContain('C2c')
    expect(FELD_DEF.get('tempoRegime')!.art).toMatchObject({ optionen: [['strecke', 'Strecke (auch Tempo 20/30 auf einer Strecke)'],
      ['t30_zone', 'in einer Tempo-30-Zone (Zonentafel)'], ['begegnungszone', 'in einer Begegnungszone']] })
    expect(FELD_HILFEN.tempoRegime.was).toContain('Hauptstrasse')
  })
  const alt = (zone: boolean, regime: string) => ({ felder: { tempoRegime: { wert: regime, quelle: 'hand' }, zoneVerkehrsorientiert: { wert: zone, quelle: 'hand' },
    beduerfnis: { wert: [], quelle: 'hand' } } })
  it('alter Fall «ja» in der Tempo-30-Zone: als Strecke gewertet (Annahme), mit Hinweis; kein C2', () => {
    const [b, h] = bedarfLesen(alt(true, 't30_zone'))
    expect(b!.felder.tempoRegime).toEqual({ wert: 'strecke', quelle: 'annahme' })
    expect(b!.felder).not.toHaveProperty('zoneVerkehrsorientiert')
    expect(h).toEqual([expect.stringContaining('gilt als Strecke')])
    const e = eingabenBilden({}, b).eingaben
    const r = beurteile({ ...fall({ vSig: 30 }), tempoRegime: e.tempoRegime })
    expect(r.alle.map(x => x.id)).not.toContain('C2')
    expect(r.annahmen).toContain('tempoRegime: Annahme')
  })
  it('alter Fall «nein» bzw. ohne Zone: Wert still verworfen, Tempo-Regime bleibt', () => {
    for (const [z, r] of [[false, 't30_zone'], [true, 'strecke'], [false, 'strecke']] as const) {
      const [b, h] = bedarfLesen(alt(z, r))
      expect(b!.felder.tempoRegime, `${z} ${r}`).toEqual({ wert: r, quelle: 'hand' })
      expect(b!.felder).not.toHaveProperty('zoneVerkehrsorientiert')
      expect(h, `${z} ${r}`).toEqual([])
    }
    // ohne Tempo-Regime: nur verworfen
    expect(bedarfLesen({ felder: { zoneVerkehrsorientiert: { wert: true, quelle: 'hand' } } })).toEqual([null, []])
  })
  it('über die Fall-Datei: alte Version 3 lädt, schreibt ohne das Feld (Version unverändert)', () => {
    const f = { ...JSON.parse(fallSchreiben(leererFall(46.95, 7.44, null))), version: 3, bedarf: alt(true, 't30_zone') }
    const [g, h] = fallLesen(JSON.stringify(f))
    expect(h.join(' ')).toContain('gilt als Strecke')
    expect(g.bedarf!.felder.tempoRegime.wert).toBe('strecke')
    const neu = JSON.parse(fallSchreiben(g))
    expect(neu.version).toBe(3)
    expect(JSON.stringify(neu)).not.toContain('zoneVerkehrsorientiert')
  })
})
