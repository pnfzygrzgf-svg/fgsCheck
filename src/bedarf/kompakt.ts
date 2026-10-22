// ── Bedarfsmodul Runde 2, Verdichtung: eine Zeile je Punkt bzw. Eintrag (nur Anzeige, Befunde unverändert) ──
//
// Grundprüfung (Big Five): je Punkt Symbol, Wort und ein Satz; Nummern, Fundstellen, Normhinweise, feste Hinweise und Annahmen nur
// hinter «Details». Zustand der Zeile (Aggregation, Korrektur D1): die Muss-Regel des Punkts bestimmt ihn (✗ nicht erfüllt, ? offen);
// ist sie erfüllt, bleibt ✓ bzw. ! auch dann, wenn eine Soll- oder Hinweis-Regel offen bzw. nicht erfüllt ist – mit kurzem Zusatz
// in Klammern. Punkte ohne Muss-Regel (② ohne gebaute Insel, ⑤) nehmen die schlimmste Teilregel (Soll nicht erfüllt vor offen vor
// Hinweis vor erfüllt). Offene Angaben erscheinen als Frage (feldhilfen.FRAGEN).
//
// Erweiterte Prüfung: je Eintrag ein Satz aus Ergebnistext und Ist/Soll (mit Einheit, «Soll –» entfällt); offene Einträge als Frage.

import { KATALOG } from './katalog'
import type { GrundPunkt, GrundTeil, Grundpruefung } from './grundpruefung'
import type { Befund, Eintrag, RegelDef } from './typen'
import { mitEinheit } from './themen'
import { lesetext } from './lesetext'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

export type ZeilenZustand = 'erfuellt' | 'verletzt' | 'soll' | 'hinweis' | 'offen'
/** Symbol und Wort je Zustand (Symbol und Wort tragen die Bedeutung, Farbe nur zusätzlich) */
export const ZUSTAND_ANZEIGE: Readonly<Record<ZeilenZustand, { symbol: string; wort: string; klasse: string }>> = {
  erfuellt: { symbol: '✓', wort: 'erfüllt', klasse: 'gruen' },
  verletzt: { symbol: '✗', wort: 'nicht erfüllt', klasse: 'rot' },
  soll: { symbol: '!', wort: 'Soll nicht erfüllt', klasse: 'gelb' },
  hinweis: { symbol: 'i', wort: 'Hinweis', klasse: 'blau' },
  offen: { symbol: '?', wort: 'offen', klasse: 'grau' },
}

export interface GrundZeile {
  nr: GrundPunkt['nr'] | 'W'
  zustand: ZeilenZustand
  /** ein Satz (ohne Nummern, ohne Fundstelle) */
  satz: string
  /** kurzer Zusatz in Klammern (Soll- bzw. Hinweis-Regel offen oder nicht erfüllt) */
  zusatz?: string
  /** fehlende Felder der bestimmenden Regel (als Fragen anzuzeigen) */
  fragen: string[]
  /** Wort statt dem des Zustands (Runde 5: Tempo «voraussichtlich erfüllt») */
  wort?: string
}

const muss = (t: GrundTeil): boolean => DEF[t.id]?.staerke === 'hart'
/** Zustand einer Teilregel als Zeilenzustand */
const zz = (t: GrundTeil): ZeilenZustand =>
  (t.zustand === 'verletzt' ? (t.staerke === 'weich' ? 'soll' : 'verletzt') : t.zustand === 'erfuellt' ? 'erfuellt' : t.zustand)
const RANG: Record<ZeilenZustand, number> = { verletzt: 4, soll: 3, offen: 2, hinweis: 1, erfuellt: 0 }

/** Soll lesbar: «≥ 25 m» → «mindestens 25 m», «≤ 60 km/h» → «höchstens 60 km/h» */
const sollWort = (s: string): string => s.replace(/^≥ /, 'mindestens ').replace(/^≤ /, 'höchstens ')
/** Ist lesbar: «3 von 3 Zufahrten frei» → «alle 3 Zufahrten frei», «1 je Richtung» → «1 Fahrstreifen je Richtung» */
const istWort = (s: string): string => s.replace(/^(\d+) von \1 Zufahrten frei/, (_, n: string) => (n === '1' ? 'die Zufahrt frei' : n === '2' ? 'beide Zufahrten frei' : `alle ${n} Zufahrten frei`))
  .replace(/^(\d+) je Richtung/, (_, n: string) => `${n} Fahrstreifen je Richtung`)
/** erfüllt ohne Soll (das Ist sagt genug) */
const OHNE_SOLL = ['B5-T', 'B5-3', 'B5-1']
/** feste Sätze, wo Ist allein zu knapp ist */
const ERFUELLT_SATZ: Partial<Record<string, string>> = { 'B5-4': 'öffentliche Beleuchtung vorhanden', 'B5-W2': 'Wartefläche nicht überfahrbar' }

/** ein Satz zu einer Teilregel der Grundprüfung */
export function teilSatz(t: GrundTeil): string {
  const ist = t.ist !== undefined ? istWort(t.ist) : '', soll = t.soll !== undefined ? sollWort(t.soll) : ''
  if (t.zustand === 'erfuellt' && ERFUELLT_SATZ[t.id]) return ERFUELLT_SATZ[t.id]!
  // Sicht erfüllt: das Soll als «nötig» in Klammern (Runde 5, Stelle 21)
  if (t.zustand === 'erfuellt' && t.id === 'B5-1' && ist && soll) return `${ist} (nötig: ${soll.replace(/mindestens |≥ /g, '')})`
  if (t.zustand === 'hinweis') return [ist, soll || t.detail || ''].filter(Boolean).join(': ')
  // offen ohne Ist und ohne fehlende Angabe (z. B. über 60 km/h keine Sichtweite): der Grund als Satz
  if (t.zustand === 'offen') return ist || (t.fehlend?.length ? '' : t.detail ?? '')
  return [ist, soll && !(t.zustand === 'erfuellt' && OHNE_SOLL.includes(t.id)) ? `Soll ${soll}` : ''].filter(Boolean).join(', ')
}

/** Zusatz einer nebensächlichen Teilregel (Soll bzw. Hinweis): «Erkennungsdistanz nicht angegeben» */
/** offene Nebenregel als Satz (Runde 5): «offen: ab wo der Streifen erkennbar ist» */
const OFFEN_SATZ: Partial<Record<string, string>> = { 'B5-1b': 'offen: ab wo der Streifen erkennbar ist' }
function zusatzVon(t: GrundTeil): string | null {
  if (t.zustand === 'offen') return OFFEN_SATZ[t.id] ?? `${t.name} nicht angegeben`
  if (t.zustand === 'verletzt') return `${t.name}: Soll nicht erfüllt${t.ist ? `, ${istWort(t.ist)}` : ''}`
  return null
}

/** fehlende Felder für Fragen: dedupliziert; Zählung und Schätzklasse der Querenden als eine Frage */
export function fragenFelder(felder: readonly string[]): string[] {
  const f = [...new Set(felder)]
  return f.includes('fg5h') ? f.filter(x => x !== 'fgKlasse') : f
}

/** Annahme der Grundprüfung, wenn V85 fehlt (grundpruefung.ANNAHME_V85) */
const ANNAHME_V85 = 'Tempo wie signalisiert (V85 nicht gemessen)'

/**
 * Zeile eines Punkts (Aggregation D1). Muss-Regel verletzt bzw. offen bestimmt den Zustand (offen: mit nicht erfüllten Soll-Regeln im
 * Zusatz); Muss erfüllt und eine Soll-Regel nicht erfüllt: «!» mit dem Satz der Soll-Regel (Korrektur S9), die Muss-Regel im Zusatz;
 * offene Soll-Regeln im Zusatz. Sicht (①) ohne V85: Zusatz «Annahme: signalisiertes Tempo» (S2). zusatzAussen: weiterer Zusatz
 * (z. B. Hinweis der Vorbelegung zur Beleuchtung, S3).
 */
export function punktZeile(p: GrundPunkt, annahmen: readonly string[] = [], zusatzAussen?: string, tempoHinweis?: string): GrundZeile {
  const m = p.teile.filter(muss), rest = p.teile.filter(t => !muss(t))
  const sortiert = (xs: GrundTeil[]) => [...xs].sort((a, b) => RANG[zz(b)] - RANG[zz(a)])
  // Tempo bis 50 km/h ohne Antwort zu Anzeichen für schnelleres Fahren: «voraussichtlich erfüllt» (Runde 5, Stelle 16)
  const t0 = p.teile[0]
  if (p.nr === 'T' && t0?.zustand === 'offen' && t0.fehlend?.length === 1 && t0.fehlend[0] === 'anzeichenSchneller')
    return { nr: p.nr, zustand: 'offen', wort: 'voraussichtlich erfüllt', satz: `${t0.ist}; V85 messen nur bei Verdacht auf schnelleres Fahren`,
      fragen: ['anzeichenSchneller'] }
  // Sicht nach dem signalisierten Tempo: unter Vorbehalt (Runde 5, Muster 2)
  const extra = [p.nr === '1' && annahmen.includes(ANNAHME_V85) ? 'unter Vorbehalt: angenommen, dass nicht schneller als signalisiert gefahren wird' : '',
    p.nr === '1' ? tempoHinweis ?? '' : '', zusatzAussen ?? '']
  const mitZusatz = (z: GrundZeile, teile: (string | null)[]): GrundZeile => {
    const zusatz = [...teile, ...extra].filter((x): x is string => !!x).filter((x, i, a) => a.indexOf(x) === i).join('; ')
    return zusatz ? { ...z, zusatz } : z
  }
  if (m.length) {
    const kopf = sortiert(m)[0]
    const z = zz(kopf)
    const nebenSoll = sortiert(rest).filter(t => zz(t) === 'soll')
    if (z === 'verletzt' || z === 'soll') return mitZusatz({ nr: p.nr, zustand: z, satz: teilSatz(kopf), fragen: [] }, [])
    if (z === 'offen') return mitZusatz({ nr: p.nr, zustand: z, satz: teilSatz(kopf), fragen: fragenFelder(kopf.fehlend ?? []) },
      nebenSoll.map(zusatzVon))
    const neben = sortiert(rest).filter(t => zz(t) !== 'erfuellt' && zz(t) !== 'hinweis')
    if (nebenSoll.length) {
      const s0 = nebenSoll[0]
      return mitZusatz({ nr: p.nr, zustand: 'soll', satz: `${s0.name}: ${teilSatz(s0)}`, fragen: [] },
        [teilSatz(kopf) ? `${kopf.name}: ${teilSatz(kopf)}` : null, ...neben.filter(t => t !== s0).map(zusatzVon)])
    }
    return mitZusatz({ nr: p.nr, zustand: z, satz: teilSatz(kopf), fragen: [] }, neben.map(zusatzVon))
  }
  if (!p.teile.length) return { nr: p.nr, zustand: 'hinweis', satz: 'hier nicht anwendbar', fragen: [] }
  const kopf = sortiert(p.teile)[0]
  const z = zz(kopf)
  return mitZusatz({ nr: p.nr, zustand: z, satz: teilSatz(kopf), fragen: z === 'offen' ? fragenFelder(kopf.fehlend ?? []) : [] }, [])
}

/** Zeile «Weitere» (weitere bfu-Punkte): schlimmster Zustand; offene als Liste der fehlenden Angaben */
export function weitereZeile(ws: readonly GrundTeil[]): GrundZeile | null {
  if (!ws.length) return null
  const zustand = [...ws].map(zz).sort((a, b) => RANG[b] - RANG[a])[0]
  const teile: string[] = []
  for (const t of ws.filter(t => t.zustand === 'verletzt' || t.zustand === 'hinweis')) teile.push(`${t.name}: ${teilSatz(t) || t.text}`)
  const offen = ws.filter(t => t.zustand === 'offen')
  if (offen.length) teile.push(`${offen.length} ${offen.length === 1 ? 'Angabe fehlt' : 'Angaben fehlen'} (${offen.map(t => t.name).join(', ')})`)
  if (!teile.length) teile.push(ws.map(t => t.name).join(', ') + ' erfüllt')
  return { nr: 'W', zustand, satz: teile.join('; '), fragen: fragenFelder(offen.flatMap(t => t.fehlend ?? [])) }
}

/** Kopfzeile: Zahl je Zustand über Tempo und die fünf Punkte, z. B. «erfüllt 2 · Hinweis 1 · offen 3» */
export function grundKopf(g: Grundpruefung, feldHinweise: Readonly<Record<string, string>> = {}):
  { zeilen: GrundZeile[]; weitere: GrundZeile | null; zaehlung: string } {
  // Hinweise der Vorbelegung zu Feldern, die eine Zeile offen lassen (z. B. Beleuchtung: Lampe in OSM, vor Ort prüfen; S3)
  const aussen = (p: GrundPunkt) => (p.nr === '4' && p.zustand === 'offen' && feldHinweise.beleuchtung ? lesetext(feldHinweise.beleuchtung) : undefined)
  const zeilen = g.punkte.map(p => punktZeile(p, g.annahmen, aussen(p), g.tempoHinweis))
  // Runde 5 (Stelle 19): gezählt werden nur die fünf Punkte (Tempo und «Weitere» getrennt)
  const fuenf = zeilen.filter(x => x.nr !== 'T')
  const n = (z: ZeilenZustand) => fuenf.filter(x => x.zustand === z).length
  const WORT_ZAHL: Record<ZeilenZustand, string> = { verletzt: 'nicht erfüllt', soll: 'Soll nicht erfüllt', erfuellt: '', hinweis: 'Hinweis', offen: 'offen' }
  const zaehlung = [`${n('erfuellt')} von ${fuenf.length} erfüllt`,
    ...(['verletzt', 'soll', 'offen', 'hinweis'] as const).filter(z => n(z)).map(z => `${n(z)} ${WORT_ZAHL[z]}`)].join(' · ')
  return { zeilen, weitere: weitereZeile(g.weitere), zaehlung }
}

// ── erweiterte Prüfung ──

/** Ist/Soll eines Eintrags mit Einheit; «Soll –» entfällt */
export function istSoll(x: Pick<Eintrag, 'ist' | 'soll' | 'einheit'>): string {
  const t: string[] = []
  if (x.ist !== undefined && x.ist !== '–') t.push(`Ist ${mitEinheit(x.ist, x.einheit)}`)
  if (x.soll !== undefined && x.soll !== '–') t.push(`Soll ${mitEinheit(x.soll, x.einheit)}`)
  return t.join('; ')
}

/** ein Satz zu einem Eintrag: Ergebnistext mit Ist/Soll in Klammern */
export function eintragSatz(x: Eintrag): string {
  const is = istSoll(x)
  return `${x.text}${is ? ` (${is})` : ''}`
}

/**
 * fehlende Felder hinter dem Vorbehalt der Empfehlung (offenWegen: Regeln bzw. Felder), dedupliziert in Reihenfolge; auch aus still
 * ausgewerteten Regeln (Befund.offenFelder, z. B. D2 bei einer Furt ohne Fahrbahnbreite; Korrektur M3). Ohne solche Regeln: die offene
 * Zulässigkeit (C1, C2) bzw. die fehlenden Angaben zur Trottoirüberfahrt.
 */
export function vorbehaltFelder(b: Pick<Befund, 'alle' | 'empfehlung'> & Partial<Pick<Befund, 'offenFelder' | 'nichtGeprueft'>>): string[] {
  const aus: string[] = []
  const felderVon = (id: string) => {
    const ein = b.alle.filter(x => x.id === id && x.zustand === 'offen').flatMap(x => x.fehlend ?? [])
    return ein.length ? ein : b.offenFelder?.[id] ?? []
  }
  for (const id of b.empfehlung.offenWegen) aus.push(...(id in KATALOG ? felderVon(id) : [id]))
  if (!aus.length) aus.push(...felderVon('C1'), ...felderVon('C2'))
  if (!aus.length && b.nichtGeprueft?.some(x => x.block === 'Q3')) aus.push('q3')
  return fragenFelder(aus)
}
