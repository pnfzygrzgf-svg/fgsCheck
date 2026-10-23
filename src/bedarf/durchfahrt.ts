// ── Bedarfsmodul: Durchfahrt neben einer Insel (Regeln F3, F3-B; Werte aus dem Katalog) ──
//
// Eine Quelle für den Entscheidbaum (regeln.ts F3) und das Werkzeug «Mittelinsel (Standard)» (rechner/standardinsel.inselPruefen,
// Korrektur E1: statt des Hinweises «weniger als 2,0 m Fahrbahn»). F3 nach der Arbeitshilfe des Kantons Bern (Bänder schmal bzw.
// breit, dazwischen Überholkonflikt Lastwagen–Velo), F3-B nach den Berner Standards Veloinfrastruktur bei durchgehendem
// Radstreifen. Keine VSS-Norm nennt Durchfahrtsmasse (Normhinweis des Katalogs).

import { KATALOG } from './katalog'

const f2 = (x: number) => x.toFixed(2).replace('.', ',')

export type F3Klasse = 'schmal' | 'band' | 'knapp' | null

/** Klasse einer Durchfahrt d [m] nach F3 */
export function f3Klasse(d: number): F3Klasse {
  const W = KATALOG.F3.werte
  // zu schmal unter 3,50 m wie die Arbeitshilfe (Nutzerentscheid 23.10.2026; die Toleranz ab 3,45 m gilt nur in der Grundprüfung bfu)
  if (d < W.min - 1e-9) return 'schmal'
  if (d > W.schmalMax && d < W.breitMin) return 'band'
  if (d < W.ideal || (d >= W.breitMin && d < W.breitIdeal)) return 'knapp'
  return null
}

/**
 * Durchfahrt d [m] nach der Grundprüfung bfu (B5-2c): «3,5 m oder mindestens 4,5 m». Band um 3,50 m: unten ab 3,45 m (die bfu nennt
 * 3,5 m auf eine Nachkommastelle; 3,47 m ist Mess- bzw. Zeichengenauigkeit), oben bis zum Rand des schmalen Bands von F3 (3,75 m,
 * Arbeitshilfe Kanton BE); darunter bzw. bis 4,50 m nicht erfüllt.
 */
export function bfuDurchfahrtOk(d: number): boolean {
  const W = KATALOG['B5-2c'].werte
  return (d >= W.dMin - 1e-9 && d <= W.dTol + 1e-9) || d >= W.dBreit - 1e-9
}

/** Ist der Durchfahrt in Worten: eine Seite «3,47 m», zwei Seiten «je Seite 3,47 m und 3,50 m» */
export function durchfahrtIst(d: readonly number[]): string {
  const t = d.map(x => `${f2(x)} m`)
  return t.length === 2 ? `je Seite ${t[0]} und ${t[1]}` : t.join(', ')
}


/**
 * Hinweise zur Durchfahrt neben einer Insel für das Werkzeug: je Seite (A, B) die Klasse nach F3 und, mit durchgehendem
 * Radstreifen, die Berner Grenzen nach F3-B; am Schluss der Normhinweis. Leer, wenn alles im Idealbereich liegt.
 */
export function durchfahrtHinweise(d: number[], opt: { radstreifen?: boolean | null; kantonBE?: boolean; bern?: boolean } = {}): string[] {
  const W = KATALOG.F3.werte, B = KATALOG['F3-B'].werte
  const seite = (i: number) => (d.length === 2 ? ` (Seite ${i === 0 ? 'Ende A' : 'Ende B'})` : '')
  const h: string[] = []
  d.forEach((x, i) => {
    // F3 gehört zur Ebene Kanton BE, F3-B zur Ebene Bern (wie im Befundblatt schaltbar; fehlt die Angabe: an)
    const k = opt.kantonBE === false ? null : f3Klasse(x)
    if (k === 'schmal') h.push(`Durchfahrt neben der Insel ${f2(x)} m${seite(i)}: unter ${f2(W.min)} m, zu schmal (F3, Arbeitshilfe Kanton BE).`)
    else if (k === 'band') h.push(`Durchfahrt neben der Insel ${f2(x)} m${seite(i)}: zwischen ${f2(W.schmalMax)} und ${f2(W.breitMin)} m ` +
      'überholen Lastwagen Velos zu knapp (F3, Arbeitshilfe Kanton BE).')
    else if (k === 'knapp') h.push(`Durchfahrt neben der Insel ${f2(x)} m${seite(i)}: unter dem Idealmass ${f2(W.ideal)} bzw. ${f2(W.breitIdeal)} m ` +
      '(F3, Arbeitshilfe Kanton BE).')
    if (opt.radstreifen && opt.bern !== false) {
      if (x < B.min) h.push(`Mit Radstreifen: Durchfahrt ${f2(x)} m${seite(i)} unter ${f2(B.min)} m (F3-B, Standards Veloinfrastruktur Bern).`)
      else if (x > B.max) h.push(`Mit Radstreifen: Durchfahrt ${f2(x)} m${seite(i)} über ${f2(B.max)} m (F3-B, Standards Veloinfrastruktur Bern).`)
    }
  })
  if (h.length) h.push(KATALOG.F3.normHinweis)
  return h
}

/**
 * Hinweis zur Durchfahrt für die Anzeige (Runde 2): statt «(F3, Arbeitshilfe Kanton BE)» die Fundstelle der Regel, damit der Satz
 * nicht den Regeltitel wiederholt («Durchfahrt neben der Insel … (Durchfahrt neben der Insel (F3) …)»). Der Wortlaut von
 * durchfahrtHinweise bleibt (geprüft in rechner/standardinsel.test.ts).
 */
export function durchfahrtAnzeige(h: string): string {
  const q = (id: 'F3' | 'F3-B') => KATALOG[id].quellen.map(x => `${x.werk === 'AHBE' ? 'Arbeitshilfe Kanton BE' : 'Masterplan Veloinfrastruktur Bern'} ${x.ziffer}`).join('; ')
  return h.replace('(F3, Arbeitshilfe Kanton BE)', `(${q('F3')})`).replace('(F3-B, Standards Veloinfrastruktur Bern)', `(${q('F3-B')})`)
}
