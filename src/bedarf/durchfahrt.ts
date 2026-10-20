// ── Bedarfsmodul: Durchfahrt neben einer Insel (Regeln F3, F3-B; Werte aus dem Katalog) ──
//
// Eine Quelle für den Entscheidbaum (regeln.ts F3) und das Werkzeug «Mittelinsel (Standard)» (rechner/standardinsel.inselPruefen,
// Korrektur E1: statt des Hinweises «weniger als 2,0 m Fahrbahn»). F3 nach der Arbeitshilfe des Kantons Bern (Bänder schmal bzw.
// breit, dazwischen Überholkonflikt Lastwagen–Velo), F3-B nach den Berner Standards Veloinfrastruktur bei durchgehendem
// Radstreifen. Keine VSS-Norm nennt Durchfahrtsmasse (Normhinweis des Katalogs).

import { KATALOG } from './katalog'

export type F3Klasse = 'schmal' | 'band' | 'knapp' | null

/** Klasse einer Durchfahrt d [m] nach F3 */
export function f3Klasse(d: number): F3Klasse {
  const W = KATALOG.F3.werte
  if (d < W.min) return 'schmal'
  if (d > W.schmalMax && d < W.breitMin) return 'band'
  if (d < W.ideal || (d >= W.breitMin && d < W.breitIdeal)) return 'knapp'
  return null
}

/**
 * Durchfahrt d [m] nach der Grundprüfung bfu (B5-2c): «3,5 m oder mindestens 4,5 m». Toleranz um 3,50 m bis zum oberen Rand des
 * schmalen Bands von F3 (3,75 m, Arbeitshilfe Kanton BE), darunter bzw. bis 4,50 m nicht erfüllt.
 */
export function bfuDurchfahrtOk(d: number): boolean {
  const W = KATALOG['B5-2c'].werte
  return (d >= W.d - 1e-9 && d <= W.dTol + 1e-9) || d >= W.dBreit - 1e-9
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')

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
